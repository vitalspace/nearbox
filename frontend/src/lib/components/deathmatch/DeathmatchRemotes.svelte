<script lang="ts">
	import { minigame6 } from '../../state/minigame6.svelte';
	import DeathmatchRemote from './DeathmatchRemote.svelte';

	// The snapshot carries team and names; movement comes from the 10 Hz
	// interpolated buffer inside each remote.
	const remotes = $derived(
		(minigame6.snapshot?.players ?? []).filter((player) => player.id !== minigame6.selfId)
	);
</script>

{#each remotes as remote (remote.id)}
	<DeathmatchRemote id={remote.id} name={remote.name} team={remote.team} />
{/each}
