<script lang="ts">
	import { minigame7 } from '../../state/minigame7.svelte';
	import ParkourRemote from './ParkourRemote.svelte';

	// The snapshot carries the skin and checkpoint; movement comes from the
	// 10 Hz interpolated buffer inside each remote.
	const remotes = $derived(
		(minigame7.snapshot?.players ?? []).filter((player) => player.id !== minigame7.selfId)
	);
</script>

{#each remotes as remote (remote.id)}
	<ParkourRemote id={remote.id} name={remote.name} checkpoint={remote.checkpoint} />
{/each}
