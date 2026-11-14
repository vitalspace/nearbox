<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { DEFAULT_SKIN, SKIN_BY_ID } from '../../cosmetics/skins';
	import { leaderboard, type LeaderboardEntry } from '../../state/leaderboard.svelte';
	import { stats } from '../../state/stats.svelte';
	import PodiumPlayer from './PodiumPlayer.svelte';

	/**
	 * Slots over the `TOP3_PedestalTop*` surfaces (local coordinates of
	 * `Top3_Root`). First place is centered and the highest; second and third
	 * sit on the golden side pedestals.
	 */
	const SLOTS: { position: [number, number, number] }[] = [
		{ position: [0, 1.87, -0.35] },
		{ position: [-2.25, 1.37, -0.35] },
		{ position: [2.25, 1.07, -0.35] }
	];

	const top = $derived(leaderboard.entries.slice(0, SLOTS.length));

	/** Accounts are `t-<handle>.testnet`; legacy UUIDs fall back to a short id. */
	function displayName(entry: LeaderboardEntry): string {
		if (entry.alias) {
			return entry.alias;
		}

		if (entry.playerId.startsWith('t-') && entry.playerId.endsWith('.testnet')) {
			return entry.playerId.slice(2, -'.testnet'.length);
		}

		return entry.playerId.slice(0, 8);
	}

	let timer: ReturnType<typeof setInterval> | undefined;

	onMount(() => {
		void leaderboard.load(SLOTS.length);

		// Slow refresh: the podium is static scenery, but it should not show a
		// stale Top 3 for the whole session.
		timer = setInterval(() => void leaderboard.load(SLOTS.length, true), 60_000);
	});

	onDestroy(() => {
		if (timer) {
			clearInterval(timer);
		}
	});

	// A local stats sync may have just changed the ranking (the cache avoids
	// refetching on every counter update).
	$effect(() => {
		void stats.lastSyncedAt;
		void leaderboard.load(SLOTS.length);
	});
</script>

{#each top as entry, index (`${entry.playerId}-${index}`)}
	{@const skin = SKIN_BY_ID.get(entry.skin ?? DEFAULT_SKIN) ?? SKIN_BY_ID.get(DEFAULT_SKIN)}

	{#if skin}
		<PodiumPlayer
			{skin}
			position={SLOTS[index].position}
			name={displayName(entry)}
			score={entry.score}
			kills={entry.kills}
			rank={index + 1}
		/>
	{/if}
{/each}
