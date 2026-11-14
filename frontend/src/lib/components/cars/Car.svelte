<script lang="ts">
	import type { CarState } from '../../services/protocol';
	import { cars } from '../../state/cars.svelte';
	import CarPhysics from './CarPhysics.svelte';

	let { car }: { car: CarState } = $props();

	const isDriver = $derived(cars.selfDrivingId === car.id);
</script>

<CarPhysics {car} {isDriver} />
