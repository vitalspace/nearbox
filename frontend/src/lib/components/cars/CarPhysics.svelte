<script lang="ts">
	import { useTask } from '@threlte/core';
	import type { CarState, RaceCarStateReport } from '../../services/protocol';
	import { carInput } from '../../state/carInput';
	import { FREECAR_COLLISION_GROUPS } from '../../state/raceConfig';
	import { cars } from '../../state/cars.svelte';
	import VehiclePhysics, { type VehicleSnapshot } from './VehiclePhysics.svelte';
	import { setCarTelemetry } from '../../audio/telemetry';

	type Props = {
		car: CarState;
		isDriver?: boolean;
	};

	let { car, isDriver = false }: Props = $props();

	// Advancing the clock every frame re-runs the derived snapshot, so remote
	// cars are interpolated between packets instead of stepping at 10 Hz.
	let now = $state(Date.now());

	useTask(() => {
		now = cars.serverNow();
	});

	function fallbackSnapshot(state: CarState): VehicleSnapshot {
		return {
			position: state.position,
			rotation: state.rotation,
			velocity: state.velocity,
			speed: state.speed,
			steering: state.steering
		};
	}

	const raw = $derived<VehicleSnapshot>(cars.cars[car.id] ?? fallbackSnapshot(car));
	// The local driver is simulated by its own physics; only remote/parked cars
	// consume the interpolated visual position.
	const snapshot = $derived<VehicleSnapshot>(isDriver ? raw : (cars.sampleCar(car.id, now) ?? raw));
	const active = $derived(car.status === 'occupied');
	const destroyed = $derived(car.status === 'destroyed');
	const snapToken = $derived(`${car.status}:${car.respawnAt ?? 0}`);

	function report(state: RaceCarStateReport): void {
		cars.sendState({ ...state, carId: car.id });
	}

	function impact(impactSpeed: number, cause: 'collision' | 'rollover'): void {
		cars.sendImpact(car.id, impactSpeed, cause);
	}
</script>

<VehiclePhysics
	model={car.model}
	{snapshot}
	{isDriver}
	active={isDriver && active}
	{destroyed}
	input={carInput}
	{snapToken}
	flipToken={isDriver ? cars.flipToken : 0}
	maxSpeed={40}
	collisionGroups={FREECAR_COLLISION_GROUPS}
	onReport={report}
	onImpact={impact}
	onTelemetry={(speed, steering, throttle, handbrake) =>
		setCarTelemetry({ speed, maxSpeed: 40, steering, throttle, handbrake })}
/>
