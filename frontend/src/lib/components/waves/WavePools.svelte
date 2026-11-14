<script lang="ts">
	import { minigame5 } from '../../state/minigame5.svelte';
	import WavePool from './WavePool.svelte';

	const pools = $derived(minigame5.snapshot?.pools ?? []);
</script>

{#each pools as pool (pool.id)}
	<WavePool {pool} />
{/each}
