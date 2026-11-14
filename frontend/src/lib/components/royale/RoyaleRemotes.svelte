<script lang="ts">
	import { DEFAULT_SKIN } from '../../cosmetics/skins';
	import { lobby } from '../../state/lobby.svelte';
	import { minigame8 } from '../../state/minigame8.svelte';
	import RoyaleRemote from './RoyaleRemote.svelte';

	// Todos los participantes menos el jugador local. Si el espejo del minijuego
	// todavía no tiene `selfId`, se usa el id del lobby para no clonar el avatar
	// propio en el asiento del zepelín.
	const selfId = $derived(minigame8.selfId ?? lobby.self?.id ?? null);
	const remotes = $derived(
		(minigame8.snapshot?.players ?? []).filter((player) => player.id !== selfId)
	);
</script>

{#each remotes as remote (remote.id)}
	<RoyaleRemote
		id={remote.id}
		name={remote.name}
		skin={remote.skin ?? DEFAULT_SKIN}
		isBot={remote.isBot}
	/>
{/each}
