<script lang="ts">
	import { race } from '../../state/race.svelte';
	import RaceCar from './RaceCar.svelte';

	const players = $derived(race.snapshot?.players ?? []);
</script>

{#each players as player (player.id)}
	<RaceCar {player} />
{/each}
