<script lang="ts">
	import { minigame5 } from '../../state/minigame5.svelte';
	import WaveDrop from './WaveDrop.svelte';

	const drops = $derived(minigame5.snapshot?.drops ?? []);
</script>

{#each drops as drop (drop.id)}
	<WaveDrop {drop} />
{/each}
