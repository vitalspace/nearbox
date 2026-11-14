<script lang="ts">
	import Skull from '@lucide/svelte/icons/skull';
	import { untrack } from 'svelte';
	import type { Mg6Event, Mg6Team } from '../../services/protocol';
	import { DM_TEAM_META, WEAPON_BY_ID } from '../../state/dmConfig';
	import { minigame6 } from '../../state/minigame6.svelte';

	type KillEntry = {
		id: number;
		killer: string;
		killerTeam: Mg6Team | null;
		victim: string;
		victimTeam: Mg6Team | null;
		weapon: string;
		at: number;
	};

	const LIFETIME_MS = 6_000;
	const MAX_ENTRIES = 5;

	let feed = $state.raw<KillEntry[]>([]);
	let lastSeq = minigame6.events.at(-1)?.seq ?? 0;

	function playerName(event: Mg6Event, id: string | undefined): string {
		if (!id) return 'Unknown';

		return minigame6.snapshot?.players.find((player) => player.id === id)?.name ?? 'Unknown';
	}

	function weaponName(event: Mg6Event): string {
		return event.weapon
			? event.weapon === 'grenade'
				? 'Grenade'
				: (WEAPON_BY_ID.get(event.weapon)?.name ?? event.weapon)
			: 'Grenade';
	}

	$effect(() => {
		const events = minigame6.events;

		if (events.length === 0) {
			return;
		}

		untrack(() => {
			let next = feed;
			let changed = false;

			for (const event of events) {
				if (event.seq <= lastSeq) continue;

				lastSeq = event.seq;

				if (event.kind !== 'kill') continue;

				next = [
					...next,
					{
						id: event.seq,
						killer: playerName(event, event.playerId),
						killerTeam: event.team ?? null,
						victim: playerName(event, event.otherId),
						victimTeam: event.otherTeam ?? null,
						weapon: weaponName(event),
						at: event.at
					}
				].slice(-MAX_ENTRIES);
				changed = true;
			}

			if (changed) {
				feed = next;
			}
		});
	});

	$effect(() => {
		const timer = setInterval(() => {
			const now = Date.now();
			const next = feed.filter((entry) => now - entry.at < LIFETIME_MS);

			if (next.length !== feed.length) {
				feed = next;
			}
		}, 500);

		return () => clearInterval(timer);
	});
</script>

{#if feed.length > 0}
	<div
		class="pointer-events-none fixed top-44 right-3 z-30 flex w-60 flex-col items-end gap-1 sm:top-48 sm:right-4"
		aria-live="polite"
		aria-label="Kill feed"
	>
		{#each feed as entry (entry.id)}
			<div
				class="flex max-w-full items-center gap-1.5 rounded-lg bg-slate-950/65 px-2.5 py-1.5 text-[11px] text-white shadow-lg backdrop-blur-sm"
			>
				<span
					class="max-w-24 truncate font-bold"
					style:color={entry.killerTeam ? DM_TEAM_META[entry.killerTeam].color : '#e2e8f0'}
				>
					{entry.killer}
				</span>
				<Skull size={11} strokeWidth={2.4} class="shrink-0 text-slate-400" aria-hidden="true" />
				<span class="shrink-0 text-[9px] font-semibold tracking-wide text-amber-200 uppercase">
					{entry.weapon}
				</span>
				<span
					class="max-w-24 truncate font-bold"
					style:color={entry.victimTeam ? DM_TEAM_META[entry.victimTeam].color : '#e2e8f0'}
				>
					{entry.victim}
				</span>
			</div>
		{/each}
	</div>
{/if}
