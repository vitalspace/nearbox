<script lang="ts">
	import type { CarState } from '../../services/protocol';
	import { CAR_ORDER } from '../../state/carConfig';
	import { cars } from '../../state/cars.svelte';
	import Car from './Car.svelte';

	const list = $derived(
		CAR_ORDER.map((id) => cars.cars[id]).filter((car): car is CarState => car !== undefined)
	);
</script>

{#each list as car (car.id)}
	<Car {car} />
{/each}
