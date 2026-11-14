<script lang="ts">
	import LogOut from '@lucide/svelte/icons/log-out';
	import Skull from '@lucide/svelte/icons/skull';
	import Swords from '@lucide/svelte/icons/swords';
	import Trophy from '@lucide/svelte/icons/trophy';
	import Users from '@lucide/svelte/icons/users';
	import { DM_MAX_PLAYERS, DM_MIN_PLAYERS, DM_TEAM_META } from '../../state/dmConfig';
	import { lobby } from '../../state/lobby.svelte';
	import { minigame6 } from '../../state/minigame6.svelte';

	let now = $state(minigame6.serverNow());

	$effect(() => {
		const timer = setInterval(() => {
			now = minigame6.serverNow();
		}, 100);

		return () => clearInterval(timer);
	});

	const snapshot = $derived(minigame6.snapshot);
	const self = $derived(minigame6.self);
	const phase = $derived(snapshot?.phase ?? 'idle');
	const team = $derived(minigame6.team);

	const countdownLeft = $derived.by(() => {
		if (!snapshot?.countdownEndsAt) return 0;
		return Math.max(0, Math.ceil((snapshot.countdownEndsAt - now) / 1000));
	});

	const resultLeft = $derived.by(() => {
		if (!snapshot?.resultEndsAt) return 15;
		return Math.max(0, Math.ceil((snapshot.resultEndsAt - now) / 1000));
	});

	const respawnLeft = $derived(Math.max(0, Math.ceil(minigame6.respawnInMs / 1000)));

	const missing = $derived(Math.max(0, DM_MIN_PLAYERS - (snapshot?.players.length ?? 0)));
	const mvp = $derived(minigame6.mvp);
	const scores = $derived(minigame6.teamScores);

	const outcome = $derived.by(() => {
		const winner = snapshot?.winner;

		if (!winner) return 'draw';
		if (winner === 'draw') return 'draw';
		if (team && winner === team) return 'victory';

		return 'defeat';
	});
</script>

{#if snapshot}
	{#if phase === 'countdown' && snapshot.waitingForPlayers}
		<div
			class="pointer-events-none fixed inset-0 z-40 flex flex-col items-center justify-center bg-[#0b0612]/75 backdrop-blur-[2px]"
		>
			<div class="flex flex-col items-center gap-3 px-4 text-center">
				<div class="text-[11px] font-semibold tracking-[0.4em] text-fuchsia-400 uppercase">
					Witch House Deathmatch
				</div>
				<h1 class="text-4xl font-black tracking-tight text-fuchsia-100 sm:text-5xl">
					Waiting for players
				</h1>
				<p class="flex items-center gap-2 text-sm text-slate-300">
					<Users size={16} strokeWidth={2.4} aria-hidden="true" />
					{snapshot.players.length}/{DM_MAX_PLAYERS} hunters and witches ready
				</p>
				<p class="text-xs text-slate-400">
					{#if missing > 0}
						Need {missing} more {missing === 1 ? 'player' : 'players'} to start
					{:else}
						The match is about to begin…
					{/if}
				</p>
				{#if team}
					<p class="text-xs font-semibold" style:color={DM_TEAM_META[team].color}>
						You are on {DM_TEAM_META[team].name}
					</p>
				{/if}
				<button
					type="button"
					class="pointer-events-auto mt-3 flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-bold text-slate-100 transition hover:bg-white/15"
					onclick={() => lobby.leaveLobby()}
				>
					<LogOut size={16} strokeWidth={2.2} aria-hidden="true" />
					Leave
				</button>
			</div>
		</div>
	{:else if phase === 'countdown'}
		<div
			class="pointer-events-none fixed inset-0 z-40 flex flex-col items-center justify-center bg-[#0b0612]/55 backdrop-blur-[1px]"
		>
			<div class="flex flex-col items-center gap-2 text-center">
				<div class="flex items-center gap-3 text-sm font-bold">
					<span style:color={DM_TEAM_META.coven.color}>{DM_TEAM_META.coven.name}</span>
					<Swords size={18} strokeWidth={2.4} class="text-slate-400" aria-hidden="true" />
					<span style:color={DM_TEAM_META.hunters.color}>{DM_TEAM_META.hunters.name}</span>
				</div>
				<div class="mt-1 text-8xl font-black text-fuchsia-200 tabular-nums">
					{countdownLeft}
				</div>
				<p class="text-xs font-semibold tracking-[0.3em] text-slate-300 uppercase">Get ready</p>
				{#if team}
					<p class="text-xs font-semibold" style:color={DM_TEAM_META[team].color}>
						You fight for the {DM_TEAM_META[team].name}
					</p>
				{/if}
			</div>
		</div>
	{:else if phase === 'playing' && self && !self.alive}
		<div class="pointer-events-none fixed inset-x-0 bottom-40 z-40 flex justify-center px-4">
			<div
				class="flex items-center gap-3 rounded-2xl border border-rose-400/30 bg-rose-950/85 px-6 py-3 text-rose-100 shadow-2xl backdrop-blur-md"
			>
				<Skull size={22} strokeWidth={2} class="shrink-0 text-rose-300" aria-hidden="true" />
				<div>
					<p class="text-sm font-bold">Respawning in {respawnLeft}…</p>
					<p class="text-[11px] text-rose-300/90">
						You lose your weapons, but return with a pistol and 5 s of protection
					</p>
				</div>
			</div>
		</div>
	{:else if phase === 'results'}
		<div
			class="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-[#0b0612]/80 p-4 backdrop-blur-[2px]"
		>
			<div
				class="pointer-events-auto w-full max-w-md rounded-2xl border border-fuchsia-400/20 bg-[#171020]/95 p-6 text-center shadow-2xl"
			>
				{#if outcome === 'victory'}
					<Trophy size={44} strokeWidth={1.8} class="mx-auto text-amber-400" aria-hidden="true" />
					<h2 class="mt-2 text-4xl font-black tracking-tight text-amber-300">Victory</h2>
					<p class="mt-1 text-sm text-slate-300">
						The {team ? DM_TEAM_META[team].name : 'winners'} rule the witch house.
					</p>
				{:else if outcome === 'defeat'}
					<Skull size={44} strokeWidth={1.8} class="mx-auto text-rose-400" aria-hidden="true" />
					<h2 class="mt-2 text-4xl font-black tracking-tight text-rose-300">Defeat</h2>
					<p class="mt-1 text-sm text-slate-300">The night belongs to the other team.</p>
				{:else}
					<Swords size={44} strokeWidth={1.8} class="mx-auto text-slate-300" aria-hidden="true" />
					<h2 class="mt-2 text-4xl font-black tracking-tight text-slate-200">Draw</h2>
					<p class="mt-1 text-sm text-slate-300">Nobody claimed the witch house.</p>
				{/if}

				<div class="mt-4 flex items-center justify-center gap-6 rounded-xl bg-white/5 px-4 py-3">
					<div>
						<div class="text-2xl font-black text-fuchsia-300 tabular-nums">{scores.coven}</div>
						<div class="text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
							Coven
						</div>
					</div>
					<div>
						<div class="text-2xl font-black text-cyan-300 tabular-nums">{scores.hunters}</div>
						<div class="text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
							Hunters
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

				<button
					type="button"
					class="mt-4 w-full rounded-xl border border-fuchsia-400/40 bg-fuchsia-500/20 px-4 py-2.5 text-sm font-bold text-fuchsia-200 transition hover:bg-fuchsia-500/30"
					onclick={() => lobby.leaveLobby()}
				>
					Back to the witch house ({resultLeft}s)
				</button>
			</div>
		</div>
	{/if}
{/if}
