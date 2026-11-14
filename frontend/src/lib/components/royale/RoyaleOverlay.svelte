<script lang="ts">
	import Bot from '@lucide/svelte/icons/bot';
	import Crown from '@lucide/svelte/icons/crown';
	import Eye from '@lucide/svelte/icons/eye';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Plane from '@lucide/svelte/icons/plane';
	import Skull from '@lucide/svelte/icons/skull';
	import Trophy from '@lucide/svelte/icons/trophy';
	import Users from '@lucide/svelte/icons/users';
	import Wind from '@lucide/svelte/icons/wind';
	import type { Mg8PlayerState } from '../../services/protocol';
	import { lobby } from '../../state/lobby.svelte';
	import { minigame8 } from '../../state/minigame8.svelte';
	import {
		ROYALE_JUMP_DELAY_MS,
		ROYALE_JUMP_WINDOW_MS,
		ROYALE_MAX_PLAYERS,
		ROYALE_RESULT_MS
	} from '../../state/royaleConfig';
	import { royaleInput } from '../../state/royaleInput';

	let now = $state(minigame8.serverNow());

	$effect(() => {
		const timer = setInterval(() => {
			now = minigame8.serverNow();
		}, 100);

		return () => clearInterval(timer);
	});

	const snapshot = $derived(minigame8.snapshot);
	const self = $derived(minigame8.self);
	const phase = $derived(minigame8.phase);

	const countdownLeft = $derived.by(() => {
		if (!snapshot?.countdownEndsAt) return 0;
		return Math.max(0, Math.ceil((snapshot.countdownEndsAt - now) / 1000));
	});

	const resultLeft = $derived.by(() => {
		if (!snapshot?.resultEndsAt) return ROYALE_RESULT_MS / 1000;
		return Math.max(0, Math.ceil((snapshot.resultEndsAt - now) / 1000));
	});

	const jumpElapsed = $derived(minigame8.jumpElapsedMs);
	const jumpReadyIn = $derived(Math.max(0, Math.ceil((ROYALE_JUMP_DELAY_MS - jumpElapsed) / 1000)));
	const ejectLeft = $derived(Math.max(0, Math.ceil((ROYALE_JUMP_WINDOW_MS - jumpElapsed) / 1000)));

	const ridingVisible = $derived(
		phase === 'playing' && self !== null && self.alive && royaleInput.mode === 'riding'
	);

	const winner = $derived(minigame8.winner);
	const winnerIsSelf = $derived(winner !== null && winner.id === minigame8.selfId);
	const matchWon = $derived(winnerIsSelf && !winner?.isBot);
	const placement = $derived(self?.placement ?? minigame8.placement);

	const survivedMs = $derived.by(() => {
		const startedAt = snapshot?.matchStartedAt;
		if (!startedAt) return 0;

		if (self?.alive) {
			const endedAt = snapshot?.resultEndsAt ? snapshot.resultEndsAt - ROYALE_RESULT_MS : now;
			return Math.max(0, endedAt - startedAt);
		}

		const death = [...minigame8.events]
			.reverse()
			.find((event) => event.kind === 'player-died' && event.playerId === minigame8.selfId);

		return death ? Math.max(0, death.at - startedAt) : 0;
	});

	const survivedLabel = $derived.by(() => {
		const total = Math.round(survivedMs / 1000);
		return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
	});

	const killer = $derived.by(() => {
		if (!self || self.alive) return null;

		const death = [...minigame8.events]
			.reverse()
			.find((event) => event.kind === 'player-died' && event.playerId === minigame8.selfId);

		if (!death?.otherId) return null;
		return snapshot?.players.find((player) => player.id === death.otherId) ?? null;
	});

	const deathCause = $derived.by(() => {
		if (!self || self.alive) return '';

		const death = [...minigame8.events]
			.reverse()
			.find((event) => event.kind === 'player-died' && event.playerId === minigame8.selfId);

		if (death?.cause === 'storm') return 'Caught by the storm';
		if (death?.cause === 'fell') return 'Fell into the sea';
		return killer ? `Eliminated by ${killer.name}` : 'Eliminated in combat';
	});

	const participants = $derived(snapshot?.players.length ?? 0);
	const bots = $derived(snapshot?.bots ?? 0);
	const humans = $derived(snapshot?.humans ?? 0);

	function isBot(player: Mg8PlayerState | null | undefined): boolean {
		return player?.isBot ?? false;
	}
</script>

{#if snapshot}
	{#if phase === 'idle' || (phase === 'countdown' && snapshot.waitingForPlayers)}
		<div
			class="pointer-events-none fixed inset-0 z-40 flex flex-col items-center justify-center bg-slate-950/70 backdrop-blur-[2px]"
		>
			<div class="flex flex-col items-center gap-3 px-4 text-center">
				<div class="text-[11px] font-semibold tracking-[0.4em] text-sky-400 uppercase">
					Skyfall Royale
				</div>
				<h1 class="text-4xl font-black tracking-tight text-sky-100 sm:text-5xl">
					Waiting for players
				</h1>
				<p class="flex items-center gap-2 text-sm text-slate-300">
					<Users size={16} strokeWidth={2.4} aria-hidden="true" />
					{participants}/{ROYALE_MAX_PLAYERS} participants ready
				</p>
				<p class="text-xs text-slate-400">
					The match starts as soon as one player is ready. Bots fill the island.
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
	{:else if phase === 'countdown'}
		<div
			class="pointer-events-none fixed inset-0 z-40 flex flex-col items-center justify-center bg-slate-950/55 backdrop-blur-[1px]"
		>
			<div class="flex flex-col items-center gap-2 px-4 text-center">
				<div class="text-[11px] font-semibold tracking-[0.4em] text-sky-400 uppercase">
					Skyfall Royale · Islas Ciudad
				</div>
				<div class="mt-1 text-8xl font-black text-sky-200 tabular-nums">{countdownLeft}</div>
				<p class="text-xs font-semibold tracking-[0.3em] text-slate-300 uppercase">Get ready</p>
				<p class="flex items-center gap-2 text-sm text-slate-300">
					<Bot size={16} strokeWidth={2.4} class="text-sky-300" aria-hidden="true" />
					{#if bots > 0}
						You play with {bots}
						{bots === 1 ? 'bot' : 'bots'} · {humans}
						{humans === 1 ? 'human' : 'humans'}
					{:else}
						12 humans, no bots
					{/if}
				</p>
				<p class="max-w-sm text-[11px] text-slate-400">
					Movement and combat are locked. The zeppelin leaves when the countdown ends.
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
	{:else if phase === 'playing'}
		{#if ridingVisible}
			<div class="pointer-events-none fixed inset-x-0 top-[30%] z-40 flex justify-center px-4">
				<div
					class="flex max-w-md flex-col items-center gap-1.5 rounded-2xl border border-sky-300/30 bg-slate-950/75 px-6 py-4 text-center text-white shadow-2xl backdrop-blur-md"
				>
					<Plane size={26} strokeWidth={2} class="text-sky-300" aria-hidden="true" />
					{#if jumpElapsed < ROYALE_JUMP_DELAY_MS}
						<p class="text-lg font-black tracking-tight text-sky-100">
							Jump in {jumpReadyIn}s
						</p>
						<p class="text-[11px] text-slate-300">The doors are opening…</p>
					{:else if minigame8.canJump}
						<p class="animate-pulse text-2xl font-black tracking-tight text-sky-100">
							SPACE TO JUMP
						</p>
						<p class="text-xs text-slate-300">
							{Math.round(self?.y ?? 0)} m altitude · Eject in
							<span class="font-bold text-sky-300 tabular-nums">{ejectLeft}s</span>
						</p>
					{:else}
						<p class="text-lg font-black tracking-tight text-amber-200">Ejecting</p>
						<p class="text-[11px] text-slate-300">Hold on…</p>
					{/if}
				</div>
			</div>
		{:else if self && self.alive && royaleInput.mode === 'skydive'}
			<div class="pointer-events-none fixed inset-x-0 top-[30%] z-40 flex justify-center px-4">
				<div
					class="flex items-center gap-2 rounded-full border border-amber-300/30 bg-slate-950/70 px-5 py-2 text-amber-100 shadow-lg backdrop-blur-sm"
				>
					<Wind size={16} strokeWidth={2.4} aria-hidden="true" />
					<span class="text-xs font-bold tracking-widest uppercase">Freefall</span>
					<span class="text-[11px] text-amber-200/80">
						{Math.round(self.y)} m · glider at 55 m
					</span>
				</div>
			</div>
		{:else if self && self.alive && royaleInput.mode === 'glide'}
			<div class="pointer-events-none fixed inset-x-0 top-[30%] z-40 flex justify-center px-4">
				<div
					class="flex items-center gap-2 rounded-full border border-emerald-300/30 bg-slate-950/70 px-5 py-2 text-emerald-100 shadow-lg backdrop-blur-sm"
				>
					<Plane size={16} strokeWidth={2.4} aria-hidden="true" />
					<span class="text-xs font-bold tracking-widest uppercase">Glider open</span>
					<span class="text-[11px] text-emerald-200/80">{Math.round(self.y)} m altitude</span>
				</div>
			</div>
		{/if}

		{#if self && !self.alive}
			<div class="pointer-events-none fixed inset-x-0 top-[22%] z-40 flex justify-center px-4">
				<div
					class="pointer-events-auto w-full max-w-lg rounded-2xl border border-rose-400/30 bg-rose-950/85 p-5 text-center text-rose-50 shadow-2xl backdrop-blur-md"
				>
					<Skull size={34} strokeWidth={2} class="mx-auto text-rose-300" aria-hidden="true" />
					<h2 class="mt-1 text-3xl font-black tracking-tight text-rose-100 sm:text-4xl">
						ELIMINATED #{placement ?? '—'}
					</h2>
					<p class="mt-1 text-sm text-rose-200/90">{deathCause}</p>

					<div class="mt-3 grid grid-cols-3 gap-2">
						<div class="rounded-xl bg-white/5 px-2 py-2">
							<div class="text-xl font-black text-white tabular-nums">{self.kills}</div>
							<div class="text-[9px] font-semibold tracking-widest text-rose-300 uppercase">
								Kills
							</div>
						</div>
						<div class="rounded-xl bg-white/5 px-2 py-2">
							<div class="text-xl font-black text-white tabular-nums">{self.damage}</div>
							<div class="text-[9px] font-semibold tracking-widest text-rose-300 uppercase">
								Damage
							</div>
						</div>
						<div class="rounded-xl bg-white/5 px-2 py-2">
							<div class="text-xl font-black text-white tabular-nums">{survivedLabel}</div>
							<div class="text-[9px] font-semibold tracking-widest text-rose-300 uppercase">
								Survived
							</div>
						</div>
					</div>

					<p
						class="mt-3 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-rose-200"
					>
						<Eye size={13} strokeWidth={2.4} aria-hidden="true" />
						Spectating · press <kbd class="rounded bg-white/15 px-1.5 py-0.5">V</kbd> to cycle alive players
					</p>

					<button
						type="button"
						class="mt-3 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/20"
						onclick={() => lobby.leaveLobby()}
					>
						<LogOut size={15} strokeWidth={2.2} class="mr-1 inline" aria-hidden="true" />
						Back to the village
					</button>
				</div>
			</div>
		{/if}
	{:else if phase === 'results'}
		<div
			class="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-[2px]"
		>
			<div
				class="pointer-events-auto w-full max-w-lg rounded-2xl border border-sky-400/20 bg-slate-950/95 p-6 text-center text-white shadow-2xl"
			>
				{#if matchWon}
					<Trophy size={46} strokeWidth={1.8} class="mx-auto text-amber-300" aria-hidden="true" />
					<h2 class="mt-2 text-4xl font-black tracking-tight text-amber-300 sm:text-5xl">
						VICTORY ROYALE
					</h2>
					<p class="mt-1 text-sm text-slate-300">
						Last one standing on Islas Ciudad. The island is yours.
					</p>
				{:else if winner}
					<Skull size={42} strokeWidth={1.8} class="mx-auto text-rose-300" aria-hidden="true" />
					<h2 class="mt-2 text-4xl font-black tracking-tight text-rose-200 sm:text-5xl">
						#{placement ?? '—'}
					</h2>
					<p class="mt-1 flex items-center justify-center gap-2 text-sm text-slate-300">
						<Crown size={15} strokeWidth={2.2} class="text-amber-300" aria-hidden="true" />
						<span class="truncate font-semibold text-slate-100">{winner.name}</span>
						{#if isBot(winner)}
							<span
								class="rounded bg-sky-400/20 px-1.5 py-0.5 text-[9px] font-bold tracking-widest text-sky-200 uppercase"
							>
								BOT
							</span>
						{/if}
						wins the match
					</p>
				{:else}
					<Wind size={42} strokeWidth={1.8} class="mx-auto text-slate-300" aria-hidden="true" />
					<h2 class="mt-2 text-4xl font-black tracking-tight text-slate-200">Draw</h2>
					<p class="mt-1 text-sm text-slate-300">The storm took everyone. Nobody survives.</p>
				{/if}

				{#if self}
					<div class="mt-4 grid grid-cols-3 gap-2">
						<div class="rounded-xl bg-white/5 px-2 py-2.5">
							<div class="text-2xl font-black text-sky-200 tabular-nums">{self.kills}</div>
							<div class="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">
								Kills
							</div>
						</div>
						<div class="rounded-xl bg-white/5 px-2 py-2.5">
							<div class="text-2xl font-black text-sky-200 tabular-nums">{self.damage}</div>
							<div class="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">
								Damage
							</div>
						</div>
						<div class="rounded-xl bg-white/5 px-2 py-2.5">
							<div class="text-2xl font-black text-sky-200 tabular-nums">{survivedLabel}</div>
							<div class="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">
								Survived
							</div>
						</div>
					</div>
				{/if}

				<div class="mt-4 rounded-xl border border-white/10 bg-white/5 p-2">
					<div class="mb-1 text-[9px] font-semibold tracking-[0.25em] text-slate-400 uppercase">
						Podium
					</div>
					<div class="space-y-1">
						{#each minigame8.podium as player, index (player.id)}
							<div
								class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm {player.id ===
								minigame8.selfId
									? 'bg-sky-400/15'
									: 'bg-white/[0.03]'}"
							>
								<span
									class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black {index ===
									0
										? 'bg-amber-300 text-amber-950'
										: index === 1
											? 'bg-slate-300 text-slate-900'
											: 'bg-amber-700 text-amber-50'}"
								>
									{index + 1}
								</span>
								<span class="flex-1 truncate font-semibold text-slate-100">{player.name}</span>
								{#if isBot(player)}
									<span
										class="rounded bg-sky-400/20 px-1.5 py-0.5 text-[8px] font-bold tracking-widest text-sky-200 uppercase"
									>
										BOT
									</span>
								{/if}
								<span class="text-[10px] font-semibold text-slate-400 tabular-nums">
									{player.kills}K · {player.damage}D
								</span>
							</div>
						{/each}
						{#if minigame8.podium.length === 0}
							<div class="py-2 text-[11px] text-slate-500">No placements recorded</div>
						{/if}
					</div>
				</div>

				<button
					type="button"
					class="mt-4 w-full rounded-xl border border-sky-400/40 bg-sky-500/20 px-4 py-2.5 text-sm font-bold text-sky-100 transition hover:bg-sky-500/30"
					onclick={() => lobby.leaveLobby()}
				>
					<LogOut size={15} strokeWidth={2.2} class="mr-1 inline" aria-hidden="true" />
					Back to the village ({resultLeft}s)
				</button>
			</div>
		</div>
	{/if}
{/if}
