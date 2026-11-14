<script lang="ts">
	import { minigame5 } from '../../state/minigame5.svelte';
	import WaveRemote from './WaveRemote.svelte';

	// El snapshot trae los jugadores de la sala (nombre incluido).
	const remotes = $derived(
		(minigame5.snapshot?.players ?? []).filter((player) => player.id !== minigame5.selfId)
	);
</script>

{#each remotes as remote (remote.id)}
	<WaveRemote id={remote.id} name={remote.name} downed={remote.downed} />
{/each}
