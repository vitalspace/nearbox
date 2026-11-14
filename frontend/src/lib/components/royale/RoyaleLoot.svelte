<script lang="ts">
	import { minigame8 } from '../../state/minigame8.svelte';
	import RoyaleLootItem from './RoyaleLootItem.svelte';

	const loot = $derived(minigame8.loot.filter((item) => item.available));
</script>

{#each loot as item (item.id)}
	<RoyaleLootItem loot={item} />
{/each}
