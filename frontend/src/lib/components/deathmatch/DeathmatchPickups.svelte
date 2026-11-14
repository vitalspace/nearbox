<script lang="ts">
	import { minigame6 } from '../../state/minigame6.svelte';
	import DeathmatchPickup from './DeathmatchPickup.svelte';

	const pickups = $derived(minigame6.snapshot?.pickups ?? []);
</script>

{#each pickups as pickup (pickup.id)}
	<DeathmatchPickup {pickup} />
{/each}
