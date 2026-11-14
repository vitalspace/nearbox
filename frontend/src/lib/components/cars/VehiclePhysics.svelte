<script lang="ts">
	import type {
		Collider as RapierCollider,
		DynamicRayCastVehicleController,
		RigidBody as RapierRigidBody
	} from '@dimforge/rapier3d-compat';
	import { QueryFilterFlags } from '@dimforge/rapier3d-compat';
	import { T, useTask } from '@threlte/core';
	import { Collider, RigidBody, usePhysicsTask, useRapier } from '@threlte/rapier';
	import { untrack } from 'svelte';
	import { Quaternion, Vector3, type Group, type Object3D } from 'three';
	import type { CarModel as CarModelId, RaceCarStateReport } from '../../services/protocol';
	import {
		CAR_MODEL_URLS,
		CHASSIS_CENTER_Y,
		CHASSIS_DENSITY,
		CHASSIS_HALF_EXTENTS,
		HANDBRAKE_FORCE,
		IMPACT_COOLDOWN_MS,
		IMPACT_SPEED_THRESHOLD,
		MAX_BRAKE,
		MAX_ENGINE_FORCE,
		MAX_STEER,
		ROLLOVER_COOLDOWN_MS,
		ROLLOVER_TIME_MS,
		ROLLOVER_UP_THRESHOLD,
		STATE_INTERVAL_MS,
		STEER_SPEED,
		SUSPENSION_COMPRESSION,
		SUSPENSION_RELAXATION,
		SUSPENSION_REST_LENGTH,
		SUSPENSION_STIFFNESS,
		SUSPENSION_TRAVEL,
		WHEEL_CONNECTION,
		WHEEL_FRICTION_SLIP,
		WHEEL_MAX_SUSPENSION_FORCE,
		WHEEL_RADIUS,
		WHEEL_SIDE_FRICTION_STIFFNESS,
		yawFromQuaternion
	} from '../../state/carConfig';
	import { playerState } from '../../state/playerState';
	import { reportCarImpact } from '../../audio/telemetry';
	import CarExplosion from './CarExplosion.svelte';
	import CarModel from './CarModel.svelte';

	const UP_AXIS = new Vector3(0, 1, 0);
	/** Up-vector Y below which the car is considered on its side/roof. */
	const FLIP_UP_THRESHOLD = 0.5;

	export type VehicleSnapshot = {
		position: { x: number; y: number; z: number };
		rotation: { x: number; y: number; z: number; w: number };
		velocity: { x: number; y: number; z: number };
		speed: number;
		steering: number;
	};

	export type VehicleInput = {
		throttle: number;
		steering: number;
		brake: boolean;
		handbrake: boolean;
	};

	type Props = {
		model: CarModelId;
		snapshot: VehicleSnapshot;
		isDriver: boolean;
		/** The driver's body is dynamic only while the car is controllable. */
		active: boolean;
		destroyed: boolean;
		input: VehicleInput;
		/** Changes when the body must be re-placed (respawn, status change). */
		snapToken: string;
		/** Changes when the driver asks to right the car in place (R / Flip). */
		flipToken?: number;
		/** Speed cap written in the report (40 free cars, 55 race cars). */
		maxSpeed: number;
		engineFactor?: number;
		collisionGroups?: number;
		/** Renders the shield bubble as a child of the car body. */
		shielded?: boolean;
		onReport?: (report: RaceCarStateReport) => void;
		onImpact?: (impactSpeed: number, cause: 'collision' | 'rollover') => void;
		/** Telemetría por frame para el motor de audio local. */
		onTelemetry?: (speed: number, steering: number, throttle: number, handbrake: boolean) => void;
	};

	let {
		model,
		snapshot,
		isDriver,
		active,
		destroyed,
		input,
		snapToken,
		flipToken = 0,
		maxSpeed,
		engineFactor = 1,
		collisionGroups,
		shielded = false,
		onReport,
		onImpact,
		onTelemetry
	}: Props = $props();

	const { world } = useRapier();

	// Collision groups are applied straight to the chassis collider so the
	// packed 32-bit masks from `raceConfig` can be reused as-is.
	$effect(() => {
		if (!chassisCollider || collisionGroups === undefined) {
			return;
		}

		if (chassisCollider.isValid()) {
			chassisCollider.setCollisionGroups(collisionGroups);
		}
	});

	const modelUrl = $derived(CAR_MODEL_URLS[model]);
	const bodyType = $derived(isDriver && active && !destroyed ? 'dynamic' : 'kinematicPosition');

	let body = $state<RapierRigidBody>();
	let chassisCollider = $state<RapierCollider>();
	let modelRoot = $state<Group>();

	let controller: DynamicRayCastVehicleController | undefined;
	let placedToken = '';

	type WheelSet = {
		FL?: Object3D;
		FR?: Object3D;
		RL?: Object3D;
		RR?: Object3D;
	};

	let wheels: WheelSet = {};
	let wheelsFound = false;
	let remoteSpin = 0;

	let previousSpeed = 0;
	let lastImpactAt = 0;
	let lastRolloverAt = 0;
	let rolloverSince = 0;
	let lastStateSent = 0;

	const bodyRotation = new Quaternion();
	const upVector = new Vector3();
	const nextTranslation = { x: 0, y: 0, z: 0 };

	function findWheels(root: Object3D): void {
		const found: WheelSet = {};

		root.traverse((child) => {
			const name = child.name.toLowerCase();

			if (/wheel_fl$/.test(name)) found.FL = child;
			else if (/wheel_fr$/.test(name)) found.FR = child;
			else if (/wheel_rl$/.test(name)) found.RL = child;
			else if (/wheel_rr$/.test(child.name.toLowerCase())) found.RR = child;
		});

		for (const wheel of Object.values(found)) {
			if (wheel) {
				wheel.rotation.order = 'YXZ';
			}
		}

		wheels = found;
		wheelsFound = true;
	}

	$effect(() => {
		if (!body || !isDriver || destroyed) {
			return;
		}

		const created = world.createVehicleController(body);
		created.indexUpAxis = 1;
		created.setIndexForwardAxis = 0;

		const positions = [
			{ x: WHEEL_CONNECTION.x, z: -WHEEL_CONNECTION.z },
			{ x: WHEEL_CONNECTION.x, z: WHEEL_CONNECTION.z },
			{ x: -WHEEL_CONNECTION.x, z: -WHEEL_CONNECTION.z },
			{ x: -WHEEL_CONNECTION.x, z: WHEEL_CONNECTION.z }
		];

		for (const position of positions) {
			created.addWheel(
				{ x: position.x, y: WHEEL_CONNECTION.y, z: position.z },
				{ x: 0, y: -1, z: 0 },
				{ x: 0, y: 0, z: 1 },
				SUSPENSION_REST_LENGTH,
				WHEEL_RADIUS
			);

			const index = created.numWheels() - 1;

			created.setWheelSuspensionStiffness(index, SUSPENSION_STIFFNESS);
			created.setWheelSuspensionCompression(index, SUSPENSION_COMPRESSION);
			created.setWheelSuspensionRelaxation(index, SUSPENSION_RELAXATION);
			created.setWheelMaxSuspensionTravel(index, SUSPENSION_TRAVEL);
			created.setWheelFrictionSlip(index, WHEEL_FRICTION_SLIP);
			created.setWheelSideFrictionStiffness(index, WHEEL_SIDE_FRICTION_STIFFNESS);
			created.setWheelMaxSuspensionForce(index, WHEEL_MAX_SUSPENSION_FORCE);
		}

		controller = created;

		return () => {
			if (controller === created) {
				controller = undefined;
			}

			world.removeVehicleController(created);
		};
	});

	// Places the body on creation and whenever the snapshot token changes
	// (start, respawn, destruction). Snapshot values are read untracked so
	// position updates do not re-place a moving car.
	$effect(() => {
		const token = `${snapToken}:${isDriver ? 'driver' : 'remote'}:${body ? 'body' : 'none'}`;

		if (!body || placedToken === token) {
			return;
		}

		placedToken = token;

		const target = untrack(() => snapshot);

		body.setTranslation({ x: target.position.x, y: target.position.y, z: target.position.z }, true);
		body.setRotation(
			{
				x: target.rotation.x,
				y: target.rotation.y,
				z: target.rotation.z,
				w: target.rotation.w
			},
			true
		);
		body.setLinvel({ x: 0, y: 0, z: 0 }, true);
		body.setAngvel({ x: 0, y: 0, z: 0 }, true);

		previousSpeed = 0;
		lastStateSent = 0;
		rolloverSince = 0;
	});

	// Righting the car in place: keep the current position and heading, drop
	// the roll/pitch and stop all motion. Only the local driver can trigger it
	// so a remote car is never moved behind its own client's back.
	// Cars that are already upright are ignored: pressing R repeatedly must
	// never lift the body (that used to send the car flying).
	let appliedFlipToken = untrack(() => flipToken);
	const flipRotation = new Quaternion();
	const flipUp = new Vector3();

	$effect(() => {
		const token = flipToken;

		if (token === appliedFlipToken) {
			return;
		}

		appliedFlipToken = token;

		if (!body || !isDriver || destroyed) {
			return;
		}

		const rotation = body.rotation();
		flipUp
			.set(0, 1, 0)
			.applyQuaternion(flipRotation.set(rotation.x, rotation.y, rotation.z, rotation.w));

		if (flipUp.y >= FLIP_UP_THRESHOLD) {
			return;
		}

		const translation = body.translation();
		const yaw = yawFromQuaternion(rotation);
		flipRotation.setFromAxisAngle(UP_AXIS, yaw);

		body.setTranslation({ x: translation.x, y: translation.y, z: translation.z }, true);
		body.setRotation(
			{
				x: flipRotation.x,
				y: flipRotation.y,
				z: flipRotation.z,
				w: flipRotation.w
			},
			true
		);
		body.setLinvel({ x: 0, y: 0, z: 0 }, true);
		body.setAngvel({ x: 0, y: 0, z: 0 }, true);

		previousSpeed = 0;
		lastStateSent = 0;
		rolloverSince = 0;
		lastRolloverAt = Date.now();
	});

	usePhysicsTask((delta) => {
		if (!body) {
			return;
		}

		const dt = Math.min(delta, 0.05);

		if (isDriver && controller && active && !destroyed) {
			const now = Date.now();
			const currentSteer = controller.wheelSteering(0) ?? 0;
			// Rapier turns left with a positive angle: the sign is inverted so
			// `input.steering > 0` (right) turns right.
			const targetSteer = -input.steering * MAX_STEER;
			const maxStep = STEER_SPEED * dt;
			const nextSteer =
				currentSteer + Math.max(-maxStep, Math.min(maxStep, targetSteer - currentSteer));

			controller.setWheelSteering(0, nextSteer);
			controller.setWheelSteering(1, nextSteer);

			const engineForce = input.throttle * MAX_ENGINE_FORCE * engineFactor;
			const brake = input.brake ? MAX_BRAKE : 0;

			for (let index = 0; index < 4; index += 1) {
				controller.setWheelEngineForce(index, engineForce);
				controller.setWheelBrake(index, brake);
			}

			if (input.handbrake) {
				controller.setWheelBrake(2, HANDBRAKE_FORCE);
				controller.setWheelBrake(3, HANDBRAKE_FORCE);
			}

			controller.updateVehicle(dt, QueryFilterFlags.EXCLUDE_SENSORS, collisionGroups);

			const translation = body.translation();
			const rotation = body.rotation();
			const velocity = body.linvel();
			const speed = Math.abs(controller.currentVehicleSpeed());
			const reportedSpeed = Math.min(maxSpeed, speed);

			// The camera and the existing systems read `playerState`.
			playerState.x = translation.x;
			playerState.y = translation.y - CHASSIS_CENTER_Y;
			playerState.z = translation.z;
			playerState.grounded = true;

			if (
				now - lastImpactAt >= IMPACT_COOLDOWN_MS &&
				previousSpeed > IMPACT_SPEED_THRESHOLD + 1 &&
				previousSpeed - speed > IMPACT_SPEED_THRESHOLD &&
				!input.brake
			) {
				lastImpactAt = now;
				const impactSpeed = Math.min(60, Math.max(0, previousSpeed - speed));
				onImpact?.(impactSpeed, 'collision');
				reportCarImpact(impactSpeed, 'collision');
			}

			previousSpeed = speed;
			onTelemetry?.(reportedSpeed, nextSteer, input.throttle, input.handbrake);

			bodyRotation.set(rotation.x, rotation.y, rotation.z, rotation.w);
			upVector.set(0, 1, 0).applyQuaternion(bodyRotation);

			if (upVector.y < ROLLOVER_UP_THRESHOLD && speed < 2) {
				if (rolloverSince === 0) {
					rolloverSince = now;
				} else if (
					now - rolloverSince >= ROLLOVER_TIME_MS &&
					now - lastRolloverAt >= ROLLOVER_COOLDOWN_MS
				) {
					lastRolloverAt = now;
					onImpact?.(12, 'rollover');
					reportCarImpact(12, 'rollover');
				}
			} else {
				rolloverSince = 0;
			}

			if (now - lastStateSent >= STATE_INTERVAL_MS) {
				lastStateSent = now;
				onReport?.({
					x: translation.x,
					y: translation.y,
					z: translation.z,
					qx: rotation.x,
					qy: rotation.y,
					qz: rotation.z,
					qw: rotation.w,
					vx: velocity.x,
					vy: velocity.y,
					vz: velocity.z,
					speed: reportedSpeed,
					steering: nextSteer
				});
			}

			return;
		}

		if (isDriver) {
			return;
		}

		// Remote/available cars: `snapshot` is already interpolated by the
		// multiplayer store (race, free cars…), so drive the kinematic body
		// straight from it. Smoothing again here made remote cars lag an extra
		// ~80 ms and trail their rotation.
		nextTranslation.x = snapshot.position.x;
		nextTranslation.y = snapshot.position.y;
		nextTranslation.z = snapshot.position.z;

		body.setNextKinematicTranslation(nextTranslation);
		bodyRotation.set(
			snapshot.rotation.x,
			snapshot.rotation.y,
			snapshot.rotation.z,
			snapshot.rotation.w
		);
		body.setNextKinematicRotation(bodyRotation);
	});

	// Visual wheels: spin from speed and front wheel steering.
	useTask((delta) => {
		if (!modelRoot) {
			return;
		}

		if (!wheelsFound) {
			findWheels(modelRoot);

			if (!wheelsFound) {
				return;
			}
		}

		let steer = 0;
		let spin = 0;

		if (isDriver && controller) {
			steer = controller.wheelSteering(0) ?? 0;
			spin = controller.wheelRotation(0) ?? 0;
		} else {
			const yaw = yawFromQuaternion(snapshot.rotation);
			const signedSpeed = snapshot.velocity.x * Math.cos(yaw) - snapshot.velocity.z * Math.sin(yaw);

			remoteSpin += (signedSpeed / WHEEL_RADIUS) * delta;
			steer = snapshot.steering;
			spin = remoteSpin;
		}

		if (wheels.FL) {
			wheels.FL.rotation.y = steer;
			wheels.FL.rotation.z = -spin;
		}

		if (wheels.FR) {
			wheels.FR.rotation.y = steer;
			wheels.FR.rotation.z = -spin;
		}

		if (wheels.RL) {
			wheels.RL.rotation.z = -spin;
		}

		if (wheels.RR) {
			wheels.RR.rotation.z = -spin;
		}
	});
</script>

<RigidBody type={bodyType} ccd bind:rigidBody={body}>
	{#if !destroyed}
		<Collider
			bind:collider={chassisCollider}
			shape="cuboid"
			args={[CHASSIS_HALF_EXTENTS.x, CHASSIS_HALF_EXTENTS.y, CHASSIS_HALF_EXTENTS.z]}
			density={CHASSIS_DENSITY}
			friction={0.7}
			restitution={0.1}
		/>
	{/if}

	<CarModel {modelUrl} visible={!destroyed} bind:root={modelRoot} />

	{#if shielded && !destroyed}
		<!-- Shield child of the rigid body: it follows the car automatically. -->
		<T.Mesh scale={[1.2, 0.72, 0.95]}>
			<T.SphereGeometry args={[2.6, 24, 16]} />
			<T.MeshBasicMaterial
				color="#a78bfa"
				transparent
				opacity={0.18}
				depthWrite={false}
				wireframe
			/>
		</T.Mesh>
		<T.Mesh scale={[1.2, 0.72, 0.95]}>
			<T.SphereGeometry args={[2.6, 24, 16]} />
			<T.MeshBasicMaterial color="#a78bfa" transparent opacity={0.07} depthWrite={false} />
		</T.Mesh>
	{/if}

	{#if destroyed}
		<CarExplosion />
	{/if}
</RigidBody>
