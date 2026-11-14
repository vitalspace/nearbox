<script lang="ts">
	import { QueryFilterFlags, Ray } from '@dimforge/rapier3d-compat';
	import type {
		Collider as RapierCollider,
		RigidBody as RapierRigidBody
	} from '@dimforge/rapier3d-compat';
	import { T, useTask } from '@threlte/core';
	import { Collider, RigidBody, useRapier } from '@threlte/rapier';
	import { untrack } from 'svelte';
	import {
		CanvasTexture,
		CylinderGeometry,
		DoubleSide,
		MeshStandardMaterial,
		PlaneGeometry,
		RepeatWrapping,
		SRGBColorSpace,
		type Group,
		type Mesh
	} from 'three';
	import type { PaperRollState } from '../../services/protocol';
	import { paperRolls, PAPER_ROLL_TTL_MS } from '../../state/paperRolls.svelte';
	import { lobby } from '../../state/lobby.svelte';
	import { playerInput } from '../../state/playerInput';
	import { playerPhysics } from '../../state/playerPhysics';
	import { mummyIdForCollider } from '../minigame2/Mummy.svelte';

	interface Props {
		roll: PaperRollState;
	}

	let { roll }: Props = $props();

	const RADIUS = 0.13;
	const GRAVITY = 18;
	const MAX_STEP = 1 / 60;
	const FADE_SECONDS = 1.2;
	const FALLBACK_GROUND = untrack(() => (roll.scene === 'crypt' ? -7.96 : 0.4));

	const { world } = useRapier();

	const ray = new Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });

	// Halloween-themed paper: orange pumpkin-like polka dots.
	function createPaperTexture(): CanvasTexture | null {
		if (typeof document === 'undefined') return null;

		const size = 128;
		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;

		const context = canvas.getContext('2d');
		if (!context) return null;

		context.fillStyle = '#f8f2e6';
		context.fillRect(0, 0, size, size);

		// Soft paper fibers.
		context.strokeStyle = 'rgba(200, 187, 165, 0.35)';
		context.lineWidth = 1;

		for (let row = 6; row < size; row += 11) {
			context.beginPath();
			context.moveTo(0, row + Math.random() * 2);
			context.lineTo(size, row + Math.random() * 2);
			context.stroke();
		}

		// Perforations.
		context.fillStyle = 'rgba(170, 158, 138, 0.45)';

		for (let row = 8; row < size; row += 16) {
			for (let column = 8; column < size; column += 16) {
				context.beginPath();
				context.arc(column, row, 1.1, 0, Math.PI * 2);
				context.fill();
			}
		}

		// Stamped little pumpkins.
		const pumpkinSpots: [number, number][] = [
			[22, 30],
			[74, 16],
			[104, 58],
			[48, 78],
			[88, 100],
			[18, 104]
		];

		for (const [x, y] of pumpkinSpots) {
			context.fillStyle = '#e8791f';
			context.beginPath();
			context.ellipse(x, y, 7, 5.5, 0, 0, Math.PI * 2);
			context.fill();

			context.fillStyle = '#3d2410';
			context.beginPath();
			context.moveTo(x - 4, y - 1);
			context.lineTo(x - 1.5, y - 1);
			context.lineTo(x - 2.7, y + 1.5);
			context.closePath();
			context.fill();

			context.beginPath();
			context.moveTo(x + 4, y - 1);
			context.lineTo(x + 1.5, y - 1);
			context.lineTo(x + 2.7, y + 1.5);
			context.closePath();
			context.fill();

			context.strokeStyle = '#4c7a34';
			context.lineWidth = 1.6;
			context.beginPath();
			context.moveTo(x, y - 5);
			context.lineTo(x + 1.5, y - 8);
			context.stroke();
		}

		const texture = new CanvasTexture(canvas);
		texture.colorSpace = SRGBColorSpace;
		texture.wrapS = texture.wrapT = RepeatWrapping;

		return texture;
	}

	const paperTexture = createPaperTexture();

	const rollGeometry = new CylinderGeometry(RADIUS, RADIUS, 0.32, 18, 1, false);
	const coreGeometry = new CylinderGeometry(0.045, 0.045, 0.335, 10, 1, false);

	const paperMaterial = new MeshStandardMaterial({
		map: paperTexture,
		color: '#fffaf0',
		roughness: 0.92,
		metalness: 0
	});
	const coreMaterial = new MeshStandardMaterial({ color: '#b98a5e', roughness: 1 });
	const stripMaterial = new MeshStandardMaterial({
		color: '#f6efe0',
		roughness: 1,
		metalness: 0,
		side: DoubleSide
	});

	// Paper strip that comes out of the roll and flutters behind it. It is
	// generated already lying down in the XZ plane, starting at the roll toward -Z (the rear).
	const stripGeometry = new PlaneGeometry(0.2, 1, 1, 8);
	stripGeometry.rotateX(Math.PI / 2);
	stripGeometry.translate(0, 0, -0.5);

	const stripBaseX = Float32Array.from(stripGeometry.attributes.position.array);

	let root = $state<Group>();
	let tilt = $state<Group>();
	let spinner = $state<Mesh>();
	let strip = $state<Mesh>();
	let rollBody = $state<RapierRigidBody>();

	// `false` until the first `setNextKinematicTranslation`: this prevents the
	// sensor, born at the origin, from firing a phantom impact.
	let armed = false;

	/**
	 * Checkpoint-style watch: when the roll passes through the local player's
	 * capsule, Rapier emits `onsensorenter` and the hit is requested here
	 * (`PlayerBehaviour` turns it into `HR_hit` and broadcasts it over the WebSocket).
	 *
	 * The owner's client also checks for mummy capsules: a hit asks the room to
	 * stun that mummy, which turns it "dumb" for a few seconds.
	 */
	function onRollEnter(event: { targetCollider: RapierCollider }): void {
		if (!armed) return;

		const target = event.targetCollider;

		if (roll.ownerId === lobby.self?.id) {
			const mummyId = mummyIdForCollider(target.handle);

			if (mummyId) {
				lobby.sendMg2Stun(mummyId);
				return;
			}
		}

		if (target !== playerPhysics.collider) return;
		// Your own roll does not hit you as it leaves your hand.
		if (roll.ownerId === lobby.self?.id) return;

		playerInput.requestHit();
	}

	const start = untrack(() => ({ ...roll }));

	const sim = {
		x: start.x,
		y: start.y,
		z: start.z,
		vx: start.vx,
		vy: start.vy,
		vz: start.vz,
		elapsed: 0,
		travelled: 0,
		landed: false
	};

	const heading = Math.atan2(start.vx, start.vz);

	function step(dt: number): void {
		if (sim.landed) return;

		const previousX = sim.x;
		const previousY = sim.y;
		const previousZ = sim.z;

		sim.vy -= GRAVITY * dt;

		const nextX = previousX + sim.vx * dt;
		const nextY = previousY + sim.vy * dt;
		const nextZ = previousZ + sim.vz * dt;

		const dx = nextX - previousX;
		const dy = nextY - previousY;
		const dz = nextZ - previousZ;
		const distance = Math.hypot(dx, dy, dz);

		if (distance > 0.00001) {
			const inverse = 1 / distance;

			ray.origin.x = previousX;
			ray.origin.y = previousY;
			ray.origin.z = previousZ;
			ray.dir.x = dx * inverse;
			ray.dir.y = dy * inverse;
			ray.dir.z = dz * inverse;

			const hit = world.castRay(
				ray,
				distance,
				true,
				QueryFilterFlags.EXCLUDE_SENSORS,
				undefined,
				playerPhysics.collider ?? undefined
			);

			if (hit) {
				const safeDistance = Math.max(0, hit.timeOfImpact - RADIUS);

				sim.x = previousX + ray.dir.x * safeDistance;
				sim.y = previousY + ray.dir.y * safeDistance;
				sim.z = previousZ + ray.dir.z * safeDistance;
				sim.travelled += safeDistance;
				sim.landed = true;

				return;
			}
		}

		sim.x = nextX;
		sim.y = nextY;
		sim.z = nextZ;
		sim.travelled += distance;

		// Safety net in case the map has no colliders yet.
		if (sim.y < FALLBACK_GROUND - 1) {
			sim.y = FALLBACK_GROUND + RADIUS;
			sim.landed = true;
		}
	}

	useTask(() => {
		if (!root) return;

		const age = Math.max(0, (paperRolls.now() - start.at) / 1000);
		const ttl = PAPER_ROLL_TTL_MS / 1000;

		// Rolls that arrive late (snapshot) are simulated from the start
		// so they appear exactly where they should.
		let guard = 0;

		while (!sim.landed && sim.elapsed < age && guard < 1200) {
			const dt = Math.min(MAX_STEP, Math.max(0.001, age - sim.elapsed));
			step(dt);
			sim.elapsed += dt;
			guard += 1;
		}

		root.position.set(sim.x, sim.y, sim.z);
		root.rotation.y = heading;

		// The sphere sensor (sibling of the visual) follows the manual simulation;
		// Rapier's sync places it in the world and fires events.
		if (rollBody) {
			rollBody.setNextKinematicTranslation({ x: sim.x, y: sim.y, z: sim.z });
			armed = true;
		}

		if (spinner) {
			spinner.rotation.y = -sim.travelled / RADIUS;
		}

		if (tilt) {
			tilt.rotation.x = Math.PI / 2;
		}

		if (strip) {
			strip.position.y = sim.landed ? -RADIUS + 0.012 : -0.01;
			strip.position.z = 0;

			const flutter = sim.landed ? 0.012 : 0.055;
			const positions = stripGeometry.attributes.position;
			const array = positions.array as Float32Array;

			for (let index = 0; index < positions.count; index += 1) {
				const baseIndex = index * 3;
				const x = stripBaseX[baseIndex];
				const z = stripBaseX[baseIndex + 2];
				const reach = Math.min(1, Math.abs(z));

				array[baseIndex] = x + Math.sin(z * 6 + age * 9) * flutter * 0.4 * reach;
				array[baseIndex + 1] = Math.sin(z * 7 - age * 11) * flutter * reach;
				array[baseIndex + 2] = z;
			}

			positions.needsUpdate = true;
		}

		const fadeStart = ttl - FADE_SECONDS;
		const fade =
			age >= ttl ? 0 : age > fadeStart ? Math.max(0, 1 - (age - fadeStart) / FADE_SECONDS) : 1;

		root.visible = fade > 0.01;
		root.scale.setScalar(Math.max(0.001, fade));
	});

	$effect(() => {
		return () => {
			paperTexture?.dispose();
			rollGeometry.dispose();
			coreGeometry.dispose();
			stripGeometry.dispose();
			paperMaterial.dispose();
			coreMaterial.dispose();
			stripMaterial.dispose();
		};
	});
</script>

<T.Group bind:ref={root} visible={false}>
	<T.Group bind:ref={tilt} rotation={[Math.PI / 2, 0, 0]}>
		<T.Mesh bind:ref={spinner} geometry={rollGeometry} material={paperMaterial} />
		<T.Mesh geometry={coreGeometry} material={coreMaterial} />
	</T.Group>

	<T.Mesh bind:ref={strip} geometry={stripGeometry} material={stripMaterial} />
</T.Group>

<RigidBody type="kinematicPosition" lockRotations bind:rigidBody={rollBody}>
	<Collider shape="ball" args={[RADIUS]} sensor onsensorenter={onRollEnter} />
</RigidBody>
