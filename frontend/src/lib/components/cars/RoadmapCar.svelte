<script lang="ts">
	import { onMount } from 'svelte';
	import { FREECAR_COLLISION_GROUPS } from '../../state/raceConfig';
	import { race } from '../../state/race.svelte';
	import { roadmapCar, ROADMAP_CAR_MODEL } from '../../state/roadmapCar.svelte';
	import { carInput } from '../../state/carInput';
	import { worldState } from '../../state/worldState.svelte';
	import VehiclePhysics from './VehiclePhysics.svelte';
	import { setCarTelemetry } from '../../audio/telemetry';

	// Reuse the car assigned in the last Grand Prix when there is one. It makes
	// the Haunted Highway feel like the same vehicle instead of a random model.
	const model = $derived(race.lastModel ?? ROADMAP_CAR_MODEL);

	// Keep the body kinematic until the Haunted Highway colliders exist, otherwise the
	// car would start falling while `roadmap.glb` is still loading.
	const active = $derived(worldState.isReady('roadmap'));

	// Every entry starts at the checkered line, even if the player left the car
	// somewhere else in the track.
	onMount(() => roadmapCar.requestReset());
</script>

<VehiclePhysics
	{model}
	snapshot={roadmapCar.snapshot}
	isDriver
	{active}
	destroyed={false}
	input={carInput}
	snapToken={`roadmap:${roadmapCar.resetToken}`}
	maxSpeed={55}
	collisionGroups={FREECAR_COLLISION_GROUPS}
	onReport={(report) => roadmapCar.report(report)}
	onTelemetry={(speed, steering, throttle, handbrake) =>
		setCarTelemetry({ speed, maxSpeed: 55, steering, throttle, handbrake })}
/>
