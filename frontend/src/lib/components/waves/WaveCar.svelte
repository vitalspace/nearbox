<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import type { CarModel as CarModelId, RaceCarStateReport } from '../../services/protocol';
	import { CAR_MODEL_URLS } from '../../state/carConfig';
	import { carInput } from '../../state/carInput';
	import { WAVES_CAR } from '../../state/wavesConfig';
	import { minigame5 } from '../../state/minigame5.svelte';
	import { WAVECAR_COLLISION_GROUPS } from '../../state/wavesConfig';
	import CarModel from '../cars/CarModel.svelte';
	import VehiclePhysics, { type VehicleSnapshot } from '../cars/VehiclePhysics.svelte';
	import { setCarTelemetry } from '../../audio/telemetry';

	const MODEL: CarModelId = 'coche_calabaza';

	const car = $derived(minigame5.snapshot?.car ?? null);
	const selfId = $derived(minigame5.selfId);
	const isDriver = $derived(car !== null && car.driverId !== null && car.driverId === selfId);
	const destroyed = $derived(car?.destroyed ?? false);

	// Re-evaluate the interpolated snapshot every frame (10 Hz data).
	let now = $state(Date.now());

	useTask(() => {
		now = Date.now();
	});

	const snapshot = $derived.by<VehicleSnapshot | null>(() => {
		void now;
		const posed = minigame5.sampleAt()?.car ?? car;

		if (!posed) {
			return null;
		}

		return {
			position: { x: posed.x, y: posed.y, z: posed.z },
			rotation: { x: posed.qx, y: posed.qy, z: posed.qz, w: posed.qw },
			velocity: { x: posed.vx, y: posed.vy, z: posed.vz },
			speed: posed.speed,
			steering: posed.steering
		};
	});

	// Re-places the body only when the car changes state fundamentally.
	const snapToken = $derived(
		`${destroyed ? 'wreck' : 'ok'}:${car?.driverId ?? 'free'}:${Math.round(WAVES_CAR.x)}`
	);

	function report(report: RaceCarStateReport): void {
		minigame5.sendCarState(report);
	}
</script>

{#if car && !destroyed && snapshot}
	<VehiclePhysics
		model={MODEL}
		{snapshot}
		{isDriver}
		active={isDriver}
		destroyed={false}
		input={carInput}
		{snapToken}
		maxSpeed={48}
		collisionGroups={WAVECAR_COLLISION_GROUPS}
		onReport={report}
		onTelemetry={(speed, steering, throttle, handbrake) =>
			setCarTelemetry({ speed, maxSpeed: 48, steering, throttle, handbrake })}
	/>
{:else if car && destroyed}
	<!-- Chatarra: coche aplastado y sin colisión dinámica. -->
	<T.Group position={[car.x, car.y - 0.25, car.z]} rotation={[0, car.yaw, 0]} scale={[1, 0.62, 1]}>
		<CarModel modelUrl={CAR_MODEL_URLS[MODEL]} visible />
	</T.Group>
{/if}
