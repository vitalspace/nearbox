<script lang="ts">
	import Skull from '@lucide/svelte/icons/skull';
	import Wind from '@lucide/svelte/icons/wind';
	import { untrack } from 'svelte';
	import { minigame8 } from '../../state/minigame8.svelte';
	import { royaleWeaponName } from '../../state/royaleConfig';

	type FeedEntry = {
		id: number;
		killer: string | null;
		killerBot: boolean;
		victim: string;
		victimBot: boolean;
		label: string;
		cause: 'combat' | 'storm' | 'fell' | 'left';
		at: number;
	};

	const LIFETIME_MS = 6_000;
	const MAX_ENTRIES = 6;

	let feed = $state.raw<FeedEntry[]>([]);
	let lastSeq = minigame8.events.at(-1)?.seq ?? 0;

	function player(id: string | undefined) {
		if (!id) return null;
		return minigame8.snapshot?.players.find((entry) => entry.id === id) ?? null;
	}

	function isBot(id: string | undefined): boolean {
		return player(id)?.isBot ?? false;
	}

	function name(id: string | undefined): string {
		return player(id)?.name ?? 'Unknown';
	}

	function push(entry: FeedEntry): void {
		feed = [...feed, entry].slice(-MAX_ENTRIES);
	}

	$effect(() => {
		const events = minigame8.events;

		if (events.length === 0) return;

		untrack(() => {
			const killed = new Set<string>();

			for (const event of events) {
				if (event.seq <= lastSeq) continue;

				lastSeq = event.seq;

				if (event.kind === 'kill' && event.playerId && event.otherId) {
					killed.add(event.otherId);
					push({
						id: event.seq,
						killer: name(event.playerId),
						killerBot: isBot(event.playerId),
						victim: name(event.otherId),
						victimBot: isBot(event.otherId),
						label: royaleWeaponName(event.weapon),
						cause: 'combat',
						at: event.at
					});
					continue;
				}

				if (event.kind === 'player-died' && event.playerId) {
					if (killed.has(event.playerId)) continue;

					const cause = event.cause ?? 'combat';
					const label =
						cause === 'storm'
							? 'lost in the storm'
							: cause === 'fell'
								? 'fell to their death'
								: 'left the match';

					push({
						id: event.seq,
						killer: event.otherId ? name(event.otherId) : null,
						killerBot: isBot(event.otherId),
						victim: name(event.playerId),
						victimBot: isBot(event.playerId),
						label,
						cause,
						at: event.at
					});
				}
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
		class="pointer-events-none fixed top-40 right-3 z-30 flex w-64 flex-col items-end gap-1 sm:top-44 sm:right-4"
		aria-live="polite"
		aria-label="Royale kill feed"
	>
		{#each feed as entry (entry.id)}
			<div
				class="flex max-w-full items-center gap-1.5 rounded-lg bg-slate-950/70 px-2.5 py-1.5 text-[11px] text-white shadow-lg backdrop-blur-sm"
			>
				{#if entry.killer}
					<span class="flex min-w-0 items-center gap-1">
						<span class="max-w-24 truncate font-bold text-sky-200">{entry.killer}</span>
						{#if entry.killerBot}
							<span class="rounded bg-amber-400/20 px-1 text-[8px] font-black text-amber-200">
								BOT
							</span>
						{/if}
					</span>
					{#if entry.cause === 'storm'}
						<Wind size={11} strokeWidth={2.4} class="shrink-0 text-sky-400" aria-hidden="true" />
					{:else}
						<Skull size={11} strokeWidth={2.4} class="shrink-0 text-slate-400" aria-hidden="true" />
					{/if}
					<span class="shrink-0 text-[9px] font-semibold tracking-wide text-amber-200 uppercase">
						{entry.label}
					</span>
				{:else if entry.cause === 'storm'}
					<Wind size={12} strokeWidth={2.4} class="shrink-0 text-sky-400" aria-hidden="true" />
				{:else}
					<Skull size={12} strokeWidth={2.4} class="shrink-0 text-slate-400" aria-hidden="true" />
				{/if}
				<span class="flex min-w-0 items-center gap-1">
					<span class="max-w-24 truncate font-bold text-slate-200">{entry.victim}</span>
					{#if entry.victimBot}
						<span class="rounded bg-amber-400/20 px-1 text-[8px] font-black text-amber-200"
							>BOT</span
						>
					{/if}
				</span>
				{#if !entry.killer}
					<span class="shrink-0 text-[9px] font-semibold tracking-wide text-slate-400 uppercase">
						{entry.label}
					</span>
				{/if}
			</div>
		{/each}
	</div>
{/if}
