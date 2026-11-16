<script lang="ts">
	import { T } from '@threlte/core';
	import type { CarModel as CarModelId } from '../../services/protocol';
	import { setCarTelemetry } from '../../audio/telemetry';
	import { carInput } from '../../state/carInput';
	import { minigame8 } from '../../state/minigame8.svelte';
	import {
		ROYALE_CAR_MAX_SPEED,
		ROYALE_VEHICLE_BAR_HEIGHT,
		ROYALE_VEHICLE_COLLISION_GROUPS,
		type RoyaleCarModel
	} from '../../state/royaleConfig';
	import { royaleVehicles } from '../../state/royaleVehicles.svelte';
	import VehiclePhysics, { type VehicleSnapshot } from '../cars/VehiclePhysics.svelte';
	import RoyaleVehicleBar from './RoyaleVehicleBar.svelte';

	type Pose = {
		x: number;
		y: number;
		z: number;
		qx: number;
		qy: number;
		qz: number;
		qw: number;
		speed: number;
	};

	type Props = {
		id: string;
		name: string;
		model: string | null;
		health: number;
		maxHealth: number;
		destroyed: boolean;
		driverId: string | null;
		pose: Pose;
		visibleBar: boolean;
	};

	let { id, name, model, health, maxHealth, destroyed, driverId, pose, visibleBar }: Props =
		$props();

	// El evento `vehicle-enter` llega antes que el `mg8-state` completo (1 Hz):
	// usar el id local evita que el coche siga kinemático durante un segundo.
	const isDriver = $derived(minigame8.drivingVehicleId === id);
	const active = $derived(
		isDriver && minigame8.phase === 'playing' && minigame8.isAlive && !destroyed
	);

	const carModel = $derived(((model as RoyaleCarModel | null) ?? 'coche_calabaza') as CarModelId);

	// Corrección anti-cheat: re-coloca el cuerpo local una sola vez.
	let correction = $state.raw<{
		x: number;
		y: number;
		z: number;
		qx: number;
		qy: number;
		qz: number;
		qw: number;
	} | null>(null);
	let correctionToken = $state(0);

	$effect(() => {
		const request = minigame8.vehicleCorrectRequest;

		if (!isDriver || !request || request.vehicleId !== id) return;

		correction = request;
		correctionToken += 1;
		minigame8.consumeVehicleCorrect();
	});

	const snapshot = $derived.by<VehicleSnapshot>(() => {
		const source = correction ?? pose;

		return {
			position: { x: source.x, y: source.y, z: source.z },
			rotation: { x: source.qx, y: source.qy, z: source.qz, w: source.qw },
			velocity: { x: 0, y: 0, z: 0 },
			speed: pose.speed,
			steering: 0
		};
	});

	const snapToken = $derived(`${id}:${correctionToken}`);
</script>

<VehiclePhysics
	model={carModel}
	{snapshot}
	{isDriver}
	{active}
	{destroyed}
	input={carInput}
	{snapToken}
	maxSpeed={ROYALE_CAR_MAX_SPEED}
	collisionGroups={ROYALE_VEHICLE_COLLISION_GROUPS}
	flipToken={isDriver ? royaleVehicles.flipToken : 0}
	onReport={(report) => {
		if (!isDriver) return;
		minigame8.sendVehicleState(id, report);
	}}
	onTelemetry={(speed, steering, throttle, handbrake) => {
		// Sin esto el motor del coche de Royale sonaba a nada: el audio local
		// depende de la telemetría que escribe `VehiclePhysics`.
		if (!isDriver) return;
		setCarTelemetry({ speed, maxSpeed: ROYALE_CAR_MAX_SPEED, steering, throttle, handbrake });
	}}
/>

<T.Group position={[pose.x, pose.y, pose.z]}>
	<RoyaleVehicleBar
		{health}
		{maxHealth}
		height={ROYALE_VEHICLE_BAR_HEIGHT.car}
		label={name}
		kind="car"
		visible={visibleBar}
	/>
</T.Group>
