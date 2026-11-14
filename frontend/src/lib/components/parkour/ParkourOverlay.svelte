<script lang="ts">
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import Flag from '@lucide/svelte/icons/flag';
	import LogOut from '@lucide/svelte/icons/log-out';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Shield from '@lucide/svelte/icons/shield';
	import Trophy from '@lucide/svelte/icons/trophy';
	import Users from '@lucide/svelte/icons/users';
	import { lobby } from '../../state/lobby.svelte';
	import { minigame7 } from '../../state/minigame7.svelte';
	import { PARKOUR_FINISH, parkourCheckpointName } from '../../state/parkourConfig';

	let now = $state(minigame7.serverNow());

	$effect(() => {
		const timer = setInterval(() => {
			now = minigame7.serverNow();
		}, 100);

		return () => clearInterval(timer);
	});

	const snapshot = $derived(minigame7.snapshot);
	const self = $derived(minigame7.self);
	const phase = $derived(snapshot?.phase ?? 'idle');
	const players = $derived(snapshot?.players ?? []);
	const totalCheckpoints = $derived(PARKOUR_FINISH.index - 1);

	const countdownLeft = $derived.by(() => {
		if (phase !== 'countdown' || snapshot?.endsAt == null) return 0;
		return Math.max(0, Math.ceil((snapshot.endsAt - now) / 1000));
	});

	const showGo = $derived.by(() => {
		if (phase !== 'playing' || snapshot?.startedAt == null) return false;
		return now - snapshot.startedAt < 1_200;
	});

	const respawnLeft = $derived.by(() => {
		if (phase !== 'playing' || !self || self.respawnAt === null) return 0;
		return Math.max(0, Math.ceil((self.respawnAt - now) / 1000));
	});

	const protectionLeft = $derived.by(() => {
		if (phase !== 'playing' || !self || !minigame7.isProtected) return 0;
		return Math.max(0, Math.ceil(((self.protectionUntil ?? 0) - now) / 1000));
	});

	const resultLeft = $derived.by(() => {
		if (phase !== 'results' || snapshot?.endsAt == null) return 15;
		return Math.max(0, Math.ceil((snapshot.endsAt - now) / 1000));
	});

	const winner = $derived(minigame7.winner ?? players[0] ?? null);
	const podium = $derived(players.slice(0, 3));

	const finished = $derived(self?.finishedAt != null);
	const finishLeader = $derived(players.find((player) => player.finishedAt !== null) ?? null);
	const selfWon = $derived(winner !== null && winner.id === minigame7.selfId);

	const timeLabel = $derived.by(() => {
		const target = self?.finishedAt ?? winner?.finishedAt ?? null;

		if (target == null || snapshot?.startedAt == null) {
			return '';
		}

		const total = Math.max(0, Math.round((target - snapshot.startedAt) / 1_000));
		const minutes = Math.floor(total / 60);

		return `${minutes}:${String(total % 60).padStart(2, '0')}`;
	});

	const resultSummary = $derived.by(() => {
		if (!self) return '';

		return `${Math.min(minigame7.checkpoint, totalCheckpoints)}/${totalCheckpoints} checkpoints · ${
			minigame7.falls
		} ${minigame7.falls === 1 ? 'fall' : 'falls'}`;
	});

	const nextName = $derived(parkourCheckpointName(minigame7.nextCheckpoint));
</script>

{#if snapshot}
	{#if phase === 'countdown'}
		<div
			class="pointer-events-none fixed inset-0 z-40 flex flex-col items-center justify-center bg-[#0b0612]/60 backdrop-blur-[1px]"
		>
			<div class="flex flex-col items-center gap-3 px-4 text-center">
				<div class="text-[11px] font-semibold tracking-[0.4em] text-amber-400 uppercase">
					Parkour Spire
				</div>
				<h1 class="text-4xl font-black tracking-tight text-amber-100 sm:text-5xl">
					{players.length < snapshot.maxPlayers ? 'Waiting for players' : 'Ready to race'}
				</h1>
				<p class="flex items-center gap-2 text-sm text-slate-300">
					<Users size={16} strokeWidth={2.4} aria-hidden="true" />
					{players.length}/{snapshot.maxPlayers} racers on the tower
				</p>
				<div class="mt-1 text-8xl font-black text-amber-200 tabular-nums">
					{countdownLeft}
				</div>
				<p class="text-xs font-semibold tracking-[0.3em] text-slate-300 uppercase">
					Get ready to climb
				</p>
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
	{:else if showGo}
		<div class="pointer-events-none fixed inset-0 z-40 flex items-center justify-center">
			<div class="text-9xl font-black text-amber-300 drop-shadow-[0_0_24px_rgba(234,179,8,0.65)]">
				GO!
			</div>
		</div>
	{:else if finished && phase !== 'results'}
		<div
			class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-[#0b0612]/55 p-4 backdrop-blur-[1px]"
		>
			<div
				class="flex max-w-xl flex-col items-center rounded-3xl border border-amber-400/40 bg-gradient-to-b from-amber-500/25 via-[#1b1024]/95 to-[#0b0612]/95 px-8 py-7 text-center shadow-[0_0_80px_-12px_rgba(234,179,8,0.75)]"
			>
				<div
					class="flex items-center gap-2 text-[11px] font-black tracking-[0.45em] text-amber-300 uppercase"
				>
					<Flag size={16} strokeWidth={2.6} aria-hidden="true" />
					Summit reached
					<Flag size={16} strokeWidth={2.6} aria-hidden="true" />
				</div>
				<h1
					class="mt-2 text-6xl font-black tracking-tight text-amber-200 drop-shadow-[0_0_24px_rgba(251,191,36,0.5)] sm:text-7xl"
				>
					{minigame7.position === 1 ? 'YOU WIN!' : 'FINISHED!'}
				</h1>
				<p class="mt-2 text-lg font-bold text-amber-100">
					You reached the top of the tower{timeLabel ? ` in ${timeLabel}` : ''}!
				</p>
				<p class="mt-1 text-sm text-slate-300">
					{minigame7.position > 0 ? `Position ${minigame7.position}` : 'Unranked'} · {resultSummary}
				</p>
				<p class="mt-4 text-[11px] font-semibold tracking-[0.3em] text-amber-300/80 uppercase">
					Waiting for the results…
				</p>
			</div>
		</div>
	{:else if finishLeader && phase === 'playing'}
		<div class="pointer-events-none fixed inset-x-0 top-28 z-40 flex justify-center px-4">
			<div
				class="flex items-center gap-3 rounded-2xl border border-amber-400/40 bg-amber-950/90 px-6 py-3 text-amber-100 shadow-2xl backdrop-blur-md"
			>
				<Flag size={22} strokeWidth={2.2} class="shrink-0 text-amber-300" aria-hidden="true" />
				<div>
					<p class="text-sm font-bold">{finishLeader.name} reached the summit!</p>
					<p class="text-[11px] text-amber-300/90">Race ending — results coming up…</p>
				</div>
			</div>
		</div>
	{:else if respawnLeft > 0}
		<div class="pointer-events-none fixed inset-x-0 bottom-40 z-40 flex justify-center px-4">
			<div
				class="flex items-center gap-3 rounded-2xl border border-rose-400/30 bg-rose-950/85 px-6 py-3 text-rose-100 shadow-2xl backdrop-blur-md"
			>
				<ArrowDown size={22} strokeWidth={2} class="shrink-0 text-rose-300" aria-hidden="true" />
				<div>
					<p class="text-sm font-bold">
						You fell! Returning to {parkourCheckpointName(minigame7.checkpoint)}…
					</p>
					<p class="text-[11px] text-rose-300/90">
						No damage. Respawning in {respawnLeft}s at checkpoint {minigame7.checkpoint}.
					</p>
				</div>
			</div>
		</div>
	{:else if protectionLeft > 0}
		<div class="pointer-events-none fixed inset-x-0 bottom-40 z-40 flex justify-center px-4">
			<div
				class="flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-950/80 px-5 py-2 text-sm font-bold text-emerald-200 shadow-xl backdrop-blur-md"
			>
				<Shield size={18} strokeWidth={2.4} aria-hidden="true" />
				Spawn protection 1.5s
			</div>
		</div>
	{/if}

	{#if phase === 'results'}
		<div
			class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-[#0b0612]/80 p-4 backdrop-blur-[2px]"
		>
			<div
				class="pointer-events-auto w-full max-w-lg rounded-2xl border border-amber-400/20 bg-[#171020]/95 p-6 text-center shadow-2xl"
			>
				<Trophy size={44} strokeWidth={1.8} class="mx-auto text-amber-400" aria-hidden="true" />
				<h2 class="mt-2 text-4xl font-black tracking-tight text-amber-300">
					{#if selfWon}
						🏆 YOU WIN!
					{:else if finished}
						FINISHED!
					{:else}
						Race over
					{/if}
				</h2>
				<p class="mt-1 text-sm text-slate-300">
					{#if selfWon}
						You reached the summit first{timeLabel ? ` in ${timeLabel}` : ''}!
					{:else if finished}
						You reached the summit{timeLabel ? ` in ${timeLabel}` : ''}.
					{:else if winner && winner.finishedAt !== null}
						{winner.name} reaches the summit first{timeLabel ? ` in ${timeLabel}` : ''}.
					{:else if winner}
						Time's up! {winner.name} leads with the most checkpoints.
					{:else}
						Nobody reached the summit in time.
					{/if}
				</p>

				<div class="mt-4 flex flex-col gap-1.5 rounded-xl bg-white/5 px-4 py-3 text-left">
					{#each podium as racer, index (racer.id)}
						<div class="flex items-center gap-3 text-sm">
							<span class="w-5 text-center font-black text-amber-300 tabular-nums">
								{index + 1}
							</span>
							<span class="min-w-0 flex-1 truncate font-semibold text-slate-100">
								{racer.name}
							</span>
							<span class="text-xs text-slate-400 tabular-nums">
								{Math.min(racer.checkpoint, totalCheckpoints)}/{totalCheckpoints} · {racer.falls}
								falls
							</span>
						</div>
					{/each}
				</div>

				{#if self}
					<div class="mt-3 flex items-center justify-center gap-2 text-sm text-slate-300">
						<RotateCcw size={15} strokeWidth={2.2} aria-hidden="true" />
						<span>
							You: position {minigame7.position || '—'} · {resultSummary}
						</span>
					</div>
				{/if}

				<button
					type="button"
					class="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-amber-400/40 bg-amber-500/20 px-4 py-2.5 text-sm font-bold text-amber-200 transition hover:bg-amber-500/30"
					onclick={() => lobby.leaveLobby()}
				>
					<span>Back to the plaza</span>
					<span class="text-amber-300/80 tabular-nums">Returning in {resultLeft}s</span>
				</button>
			</div>
		</div>
	{/if}
{/if}
