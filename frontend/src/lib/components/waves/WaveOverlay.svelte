<script lang="ts">
	import Skull from '@lucide/svelte/icons/skull';
	import Trophy from '@lucide/svelte/icons/trophy';
	import Users from '@lucide/svelte/icons/users';
	import { lobby } from '../../state/lobby.svelte';
	import { minigame5 } from '../../state/minigame5.svelte';

	let now = $state(minigame5.serverNow());

	$effect(() => {
		const timer = setInterval(() => {
			now = minigame5.serverNow();
		}, 100);

		return () => clearInterval(timer);
	});

	const snapshot = $derived(minigame5.snapshot);
	const self = $derived(minigame5.self);
	const phase = $derived(snapshot?.phase ?? 'idle');

	const countdownLeft = $derived.by(() => {
		if (!snapshot?.endsAt) return 0;
		return Math.max(0, Math.ceil((snapshot.endsAt - now) / 1000));
	});

	const intermissionLeft = $derived.by(() => {
		if (!snapshot?.intermissionEndsAt) return 0;
		return Math.max(0, Math.ceil((snapshot.intermissionEndsAt - now) / 1000));
	});

	const resultLeft = $derived.by(() => {
		if (!snapshot?.endsAt) return 15;
		return Math.max(0, Math.ceil((snapshot.endsAt - now) / 1000));
	});

	const mvp = $derived.by(() => {
		if (!snapshot) return null;

		let best = snapshot.players[0] ?? null;

		for (const player of snapshot.players) {
			if (!best || player.kills > best.kills) {
				best = player;
			}
		}

		return best;
	});

	const sortedPlayers = $derived(
		snapshot ? [...snapshot.players].sort((a, b) => b.score - a.score) : []
	);
</script>

{#if snapshot}
	{#if phase === 'countdown'}
		<div
			class="pointer-events-none fixed inset-0 z-40 flex flex-col items-center justify-center bg-[#0b0612]/70 backdrop-blur-[2px]"
		>
			<div class="flex flex-col items-center gap-3 text-center">
				<div class="text-[11px] font-semibold tracking-[0.4em] text-orange-400 uppercase">
					Barn Siege
				</div>
				<h1 class="text-4xl font-black tracking-tight text-orange-100 sm:text-5xl">
					Hold the Farm
				</h1>
				<p class="flex items-center gap-2 text-sm text-slate-300">
					<Users size={16} strokeWidth={2.4} aria-hidden="true" />
					{snapshot.players.length}/12 survivors ready
				</p>
				<div class="mt-2 text-7xl font-black text-orange-200 tabular-nums">
					{countdownLeft}
				</div>
				<p class="text-xs text-slate-400">The monsters are coming…</p>
			</div>
		</div>
	{:else if phase === 'intermission'}
		<div class="pointer-events-none fixed inset-x-0 top-24 z-40 flex justify-center px-4 sm:top-28">
			<div
				class="flex items-center gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-950/80 px-6 py-3 text-emerald-100 shadow-2xl backdrop-blur-md"
			>
				<Trophy size={20} strokeWidth={2.2} class="text-emerald-300" aria-hidden="true" />
				<div>
					<p class="text-sm font-bold">Wave {snapshot.wave} cleared!</p>
					<p class="text-[11px] text-emerald-300/90">
						Next wave in {intermissionLeft}s — downed players return with 50 HP
					</p>
				</div>
			</div>
		</div>
	{:else if phase === 'won' || phase === 'lost'}
		<div
			class="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-[#0b0612]/75 p-4 backdrop-blur-[2px]"
		>
			<div
				class="pointer-events-auto w-full max-w-md rounded-2xl border border-orange-400/20 bg-[#171020]/95 p-6 text-center shadow-2xl"
			>
				{#if phase === 'won'}
					<Trophy size={44} strokeWidth={1.8} class="mx-auto text-amber-400" aria-hidden="true" />
					<h2 class="mt-2 text-4xl font-black tracking-tight text-amber-300">Victory!</h2>
					<p class="mt-1 text-sm text-slate-300">The farm survives the night.</p>
				{:else}
					<Skull size={44} strokeWidth={1.8} class="mx-auto text-rose-400" aria-hidden="true" />
					<h2 class="mt-2 text-4xl font-black tracking-tight text-rose-300">The farm has fallen</h2>
					<p class="mt-1 text-sm text-slate-300">The horde took everything…</p>
				{/if}

				<div class="mt-4 flex items-center justify-center gap-6 rounded-xl bg-white/5 px-4 py-3">
					<div>
						<div class="text-2xl font-black text-white tabular-nums">{snapshot.teamScore}</div>
						<div class="text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
							score
						</div>
					</div>
					<div>
						<div class="text-2xl font-black text-white tabular-nums">{snapshot.wave}</div>
						<div class="text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
							waves
						</div>
					</div>
					{#if mvp}
						<div>
							<div class="max-w-24 truncate text-2xl font-black text-amber-200">{mvp.name}</div>
							<div class="text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
								MVP · {mvp.kills} kills
							</div>
						</div>
					{/if}
				</div>

				<ol class="mt-3 max-h-40 space-y-1 overflow-y-auto text-left text-xs text-slate-300">
					{#each sortedPlayers as player, index (player.id)}
						<li class="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-1.5">
							<span class="flex items-center gap-2">
								<span class="w-4 font-bold text-slate-500">{index + 1}.</span>
								<span class="max-w-40 truncate">{player.name}</span>
							</span>
							<span class="tabular-nums">{player.kills} kills · {player.score} pts</span>
						</li>
					{/each}
				</ol>

				<button
					type="button"
					class="mt-4 w-full rounded-xl border border-orange-400/40 bg-orange-500/20 px-4 py-2.5 text-sm font-bold text-orange-200 transition hover:bg-orange-500/30"
					onclick={() => lobby.leaveLobby()}
				>
					Back to the farm ({resultLeft}s)
				</button>
			</div>
		</div>
	{:else if self?.downed && phase === 'playing'}
		<div class="pointer-events-none fixed inset-x-0 bottom-40 z-40 flex justify-center px-4">
			<div
				class="flex items-center gap-3 rounded-2xl border border-rose-400/30 bg-rose-950/85 px-6 py-3 text-rose-100 shadow-2xl backdrop-blur-md"
			>
				<Skull size={22} strokeWidth={2} class="shrink-0 text-rose-300" aria-hidden="true" />
				<div>
					<p class="text-sm font-bold">You are down</p>
					<p class="text-[11px] text-rose-300/90">You will return with 50 HP after the wave</p>
				</div>
			</div>
		</div>
	{/if}
{/if}
