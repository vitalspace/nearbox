<script module lang="ts">
	// Colliders of every mummy, shared by all the instances of this component.
	// The character controller ignores them (and the local player) so a mummy
	// never climbs on top of another character: the kill is decided by the
	// server, the physics is only used to slide along walls.
	const mummyColliderHandles = new Set<number>();

	// Handle → mummy id, so a paper roll can tell which mummy its sensor hit.
	const mummyColliderOwners = new Map<number, string>();

	/** Mummy whose capsule owns `handle`, if any. */
	export function mummyIdForCollider(handle: number): string | undefined {
		return mummyColliderOwners.get(handle);
	}
</script>

<script lang="ts">
	import { QueryFilterFlags } from '@dimforge/rapier3d-compat';
	import type {
		Collider as RapierCollider,
		RigidBody as RapierRigidBody
	} from '@dimforge/rapier3d-compat';
	import { Collider, RigidBody, usePhysicsTask, useRapier } from '@threlte/rapier';
	import { onDestroy } from 'svelte';
	import { get, type Readable } from 'svelte/store';
	import type { AnimationAction, AnimationMixer, Group } from 'three';
	import { Vector3 } from 'three';
	import type { Mg2MummyStatus } from '../../services/protocol';
	import { minigame2 } from '../../state/minigame2.svelte';
	import { playRigClip } from '../../state/playerAnimations.svelte';
	import { playerPhysics } from '../../state/playerPhysics';
	import MummyModel from './MummyModel.svelte';

	interface Props {
		id: string;
	}

	let { id }: Props = $props();

	type MummyClip = 'MU_idle' | 'MU_walk' | 'MU_run' | 'MU_attack' | 'MU_hit' | 'MU_injured';

	// Room state → `Mummy.glb` rig clip map. The server sends:
	// walking patrol, running chase, the recovery hit (1 s) after attacking and
	// `stunned` while a paper roll has it dazed (the damage clip, then injured).
	const CLIPS: Record<Mg2MummyStatus, { name: MummyClip; loop: boolean }> = {
		patrol: { name: 'MU_walk', loop: true },
		chase: { name: 'MU_run', loop: true },
		cooldown: { name: 'MU_attack', loop: false },
		stunned: { name: 'MU_hit', loop: false }
	};

	// Speeds when approaching the goal. The server owns detection radii and
	// validates the reported speed against `MUMMY_MAX_SPEED` (3.0 m/s).
	const SPEEDS: Record<Mg2MummyStatus, number> = {
		patrol: 1.2,
		chase: 2.4,
		cooldown: 0,
		stunned: 0
	};

	// Capsule of ~1.9 m: the volume of the scaled mummy (2.0 m).
	const CAPSULE_HALF_HEIGHT = 0.55;
	const CAPSULE_RADIUS = 0.4;
	// Distance from the feet to the center of the capsule. The body is always
	// placed `BODY_CENTER_Y` above the authoritative feet sent by the server;
	// the vertical position is never taken from the capsule, so a collision
	// can never make the mummy fly.
	const BODY_CENTER_Y = CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS;

	const MAX_STEP_DT = 0.05;
	// If the server relay gets too far away (driver change
	// or first frame), it snaps to its position instead of chasing the shadow.
	const SNAP_DISTANCE = 8;
	const SNAP_HEIGHT = 2;

	const { world } = useRapier();

	let controller: ReturnType<typeof world.createCharacterController> | undefined;
	let body = $state<RapierRigidBody>();
	let mummyCollider = $state<RapierCollider>();
	let group = $state<Group | undefined>();
	let actionsStore = $state<Readable<Partial<Record<MummyClip, AnimationAction>>> | undefined>();
	let mixer = $state<AnimationMixer | undefined>();
	let current = '';
	let hasTarget = false;
	let stunnedAt = 0;
	let previousState: Mg2MummyStatus | null = null;

	const target = new Vector3();
	const resolved = new Vector3();
	const desired = new Vector3();
	const computed = new Vector3();

	// Registers this mummy's collider so the other mummies' controllers ignore
	// it. Characters are not obstacles here: the server decides deaths.
	$effect(() => {
		if (!mummyCollider) return;

		const handle = mummyCollider.handle;
		mummyColliderHandles.add(handle);
		mummyColliderOwners.set(handle, id);

		return () => {
			mummyColliderHandles.delete(handle);
			mummyColliderOwners.delete(handle);
		};
	});

	// Division of work: the server decides the goal and validates; this client,
	// if it is the driver, moves the capsule physically toward the goal — the
	// physics decides what it collides with, with no geometry math.
	$effect(() => {
		if (!body || !mummyCollider || controller) return;

		const created = world.createCharacterController(0.02);
		created.setUp({ x: 0, y: 1, z: 0 });
		// The mummies patrol flat floors: no autostep, so they never climb
		// players, tombs or props. Their height is dictated by the server.
		created.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
		created.setMinSlopeSlideAngle((30 * Math.PI) / 180);
		created.setApplyImpulsesToDynamicBodies(true);

		controller = created;
	});

	onDestroy(() => {
		if (controller) {
			world.removeCharacterController(controller);
			controller = undefined;
		}
	});

	/** Places the body at an exact feet position (without interpolation). */
	function placeBody(x: number, feetY: number, z: number): void {
		if (!body) return;

		const position = { x, y: feetY + BODY_CENTER_Y, z };
		body.setTranslation(position, true);
		body.setNextKinematicTranslation(position);
	}

	usePhysicsTask((delta) => {
		const sample = minigame2.sampleAt();
		const mummy = sample.mummies.find((item) => item.id === id);

		if (!group) return;

		if (!mummy) {
			group.visible = false;
			hasTarget = false;
			minigame2.localMummies.delete(id);
			return;
		}

		group.visible = true;
		target.set(mummy.x, mummy.y, mummy.z);

		if (!hasTarget) {
			// First appearance (or new round): snapped to the server.
			hasTarget = true;
			resolved.copy(target);
			placeBody(resolved.x, resolved.y, resolved.z);
		} else if (
			Math.hypot(target.x - resolved.x, target.z - resolved.z) > SNAP_DISTANCE ||
			Math.abs(target.y - resolved.y) > SNAP_HEIGHT
		) {
			resolved.copy(target);
			placeBody(resolved.x, resolved.y, resolved.z);
		} else if (minigame2.isMummyDriver && controller && mummyCollider && body) {
			// Driver: chases the server goal with its capsule. Only the
			// horizontal movement is taken from the physics (so walls, tombs
			// and pillars block it); the height always follows the server.
			const dt = Math.min(delta, MAX_STEP_DT);
			const translation = body.translation();

			let dx = mummy.goalX - translation.x;
			let dz = mummy.goalZ - translation.z;
			const distance = Math.hypot(dx, dz);
			const maxStep = SPEEDS[mummy.state] * dt;

			if (distance > 1e-4 && maxStep > 0) {
				const scale = Math.min(1, maxStep / distance);
				dx *= scale;
				dz *= scale;
			} else {
				dx = 0;
				dz = 0;
			}

			desired.set(dx, 0, dz);
			controller.computeColliderMovement(
				mummyCollider,
				desired,
				QueryFilterFlags.EXCLUDE_SENSORS,
				undefined,
				(other) =>
					other.handle !== playerPhysics.collider?.handle && !mummyColliderHandles.has(other.handle)
			);
			controller.computedMovement(computed);

			const nextX = translation.x + computed.x;
			const nextZ = translation.z + computed.z;
			const feetY = target.y;

			body.setNextKinematicTranslation({ x: nextX, y: feetY + BODY_CENTER_Y, z: nextZ });

			resolved.set(nextX, feetY, nextZ);
			minigame2.localMummies.set(id, { x: nextX, y: feetY, z: nextZ });
		} else {
			// Other clients: follow the position relayed by the server
			// (which is the driver's), already interpolated by `sampleAt`.
			resolved.copy(target);
			body?.setNextKinematicTranslation({
				x: resolved.x,
				y: resolved.y + BODY_CENTER_Y,
				z: resolved.z
			});
		}

		group.position.copy(resolved);
		group.rotation.y = mummy.yaw;

		// Outside `playing` (countdown or result) the mummies wait still.
		// While stunned, the first 0.8 s is the hit reaction and then the
		// injured loop keeps it visibly dazed until the server releases it.
		let clip: { name: MummyClip; loop: boolean };

		if (minigame2.snapshot?.phase === 'playing') {
			if (mummy.state === 'stunned') {
				if (previousState !== 'stunned') {
					stunnedAt = performance.now();
				}

				clip =
					performance.now() - stunnedAt < 800
						? { name: 'MU_hit', loop: false }
						: { name: 'MU_injured', loop: true };
			} else {
				clip = CLIPS[mummy.state];
			}
		} else {
			clip = { name: 'MU_idle', loop: true };
		}

		previousState = mummy.state;

		const actions = actionsStore ? get(actionsStore) : undefined;

		if (playRigClip(actions, current, clip.name, clip.loop)) {
			current = clip.name;
		}
	});
</script>

<!-- The GLB measures 3.04 m; 0.66 leaves it at ~2.0 m, the marker height. -->
<MummyModel bind:ref={group} bind:actions={actionsStore} bind:mixer visible={false} scale={0.66} />

<RigidBody type="kinematicPosition" lockRotations bind:rigidBody={body}>
	<Collider
		shape="capsule"
		args={[CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS]}
		friction={0}
		restitution={0}
		bind:collider={mummyCollider}
	/>
</RigidBody>
