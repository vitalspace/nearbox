<script lang="ts">
	import { minigame2 } from '../../state/minigame2.svelte';
	import RemotePlayer from './RemotePlayer.svelte';

	const others = $derived(
		(minigame2.snapshot?.players ?? []).filter((player) => player.id !== minigame2.selfId)
	);
</script>

{#each others as player (player.id)}
	<RemotePlayer id={player.id} name={player.name} carried={player.skullsCarried} />
{/each}
