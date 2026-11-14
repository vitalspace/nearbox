<script lang="ts">
	import Skull from '@lucide/svelte/icons/skull';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Trophy from '@lucide/svelte/icons/trophy';
	import Users from '@lucide/svelte/icons/users';
	import { FINISH_WINDOW_MS, RESPAWN_MS } from '../../state/raceConfig';
	import { lobby } from '../../state/lobby.svelte';
	import { race } from '../../state/race.svelte';

	let now = $state(race.serverNow());
	let destroyedAt = $state(0);
	let missedGate = $state<number | null>(null);
	let missedAt = $state(0);

	$effect(() => {
		const timer = setInterval(() => {
			now = race.serverNow();
		}, 100);

		return () => clearInterval(timer);
	});

	$effect(() => {
		const event = race.lastEvent;

		if (!event || event.playerId !== race.selfId) {
			return;
		}

		if (event.kind === 'player-destroyed') {
			destroyedAt = race.serverNow();
		} else if (event.kind === 'player-respawned') {
			destroyedAt = 0;
		} else if (event.kind === 'gate-missed' && event.gate !== undefined) {
			missedGate = event.gate;
			missedAt = race.serverNow();
		}
	});

	const snapshot = $derived(race.snapshot);
	const phase = $derived(snapshot?.phase ?? 'idle');
	const self = $derived(race.self);
	const players = $derived(snapshot?.players ?? []);
	const trackName = $derived(snapshot?.trackName ?? 'Grand Prix');
	const maxPlayers = $derived(snapshot?.maxPlayers ?? 6);
	const endsAt = $derived(snapshot?.endsAt ?? null);
	const remainingSeconds = $derived(endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0);
	const countdownSeconds = $derived(
		phase === 'countdown' && endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0
	);

	const showCountdown = $derived(phase === 'countdown');
	const showGo = $derived.by(() => {
		if (phase !== 'playing' || !snapshot?.startedAt) {
			return false;
		}

		return now - snapshot.startedAt < 1500;
	});
	const showDestroyed = $derived(phase === 'playing' && self?.status === 'destroyed');
	const respawnSeconds = $derived(
		destroyedAt > 0 ? Math.max(0, Math.ceil((destroyedAt + RESPAWN_MS - now) / 1000)) : 3
	);
	const showResults = $derived(phase === 'results');
	const showFinished = $derived(phase === 'playing' && self?.status === 'finished');
	const showMissedGate = $derived(missedGate !== null && now - missedAt < 4_000);
	const selfWon = $derived(snapshot?.winnerId !== null && snapshot?.winnerId === race.selfId);
	const winnerName = $derived(
		players.find((player) => player.id === snapshot?.winnerId)?.name ?? null
	);
	// The server shortens `endsAt` when the first pilot finishes. Clamp the
	// display while the next snapshot (1 Hz) carries that new deadline.
	const finishWindowSeconds = $derived(
		Math.min(
			Math.ceil(FINISH_WINDOW_MS / 1000),
			Math.max(0, Math.ceil(((endsAt ?? now) - now) / 1000))
		)
	);

	function finishTime(player: (typeof players)[number]): string {
		if (player.status !== 'finished' || player.finishAt === null || !snapshot?.startedAt) {
			return player.status === 'destroyed' ? 'DNF' : '—';
		}

		const seconds = Math.max(0, (player.finishAt - snapshot.startedAt) / 1000);
		const minutes = Math.floor(seconds / 60);
		const rest = (seconds % 60).toFixed(1).padStart(4, '0');

		return `${minutes}:${rest}`;
	}

	const medalText = ['text-amber-300', 'text-slate-200', 'text-orange-300'];
</script>

{#if showCountdown}
	<div
		class="pointer-events-none fixed inset-0 z-40 flex flex-col items-center justify-center bg-[#0b0612]/70 backdrop-blur-[2px]"
	>
		<div class="flex flex-col items-center gap-3 text-center">
			<div class="text-[11px] font-semibold tracking-[0.4em] text-red-400 uppercase">
				{trackName}
			</div>
			<h1 class="text-4xl font-black tracking-tight text-red-100 sm:text-5xl">
				Waiting for players
			</h1>
			<p class="flex items-center gap-2 text-sm text-slate-300">
				<Users size={16} strokeWidth={2.4} aria-hidden="true" />
				{players.length}/{maxPlayers} pilots ready
			</p>
			<div class="mt-2 text-7xl font-black text-red-200 tabular-nums">
				{countdownSeconds}
			</div>
			<p class="text-xs text-slate-400">
				{countdownSeconds <= 3 ? 'Get ready!' : 'The engines are idling…'}
			</p>
		</div>
	</div>
{:else if showGo}
	<div
		class="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-emerald-950/20"
	>
		<p class="font-mono text-8xl font-black text-emerald-300 drop-shadow-lg">GO!</p>
	</div>
{:else if showFinished}
	<div
		class="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-[#0b0612]/75 p-4 backdrop-blur-[2px]"
	>
		<div
			class="pointer-events-auto w-full max-w-md rounded-2xl border border-rose-400/20 bg-[#171020]/95 p-6 text-center text-slate-50 shadow-2xl"
		>
			<p class="text-[10px] font-semibold tracking-[0.4em] text-rose-400 uppercase">
				{trackName} · Finish
			</p>
			<Trophy size={44} strokeWidth={1.8} class="mx-auto mt-2 text-amber-400" aria-hidden="true" />
			<h2 class="mt-2 text-4xl font-black tracking-tight text-amber-300">
				{selfWon ? 'You win!' : 'Race complete'}
			</h2>
			<p class="mt-1 text-sm text-slate-300">
				{selfWon ? 'The checkered flag is yours.' : 'You made it to the finish line.'}
			</p>

			<div class="mt-4 flex items-center justify-center gap-6 rounded-xl bg-white/5 px-4 py-3">
				<div>
					<div class="text-2xl font-black text-white tabular-nums">
						P{self?.rank ?? '—'}
					</div>
					<div class="text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
						position
					</div>
				</div>
				<div>
					<div class="text-2xl font-black text-white tabular-nums">{players.length}</div>
					<div class="text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
						pilots
					</div>
				</div>
				<div>
					<div class="text-2xl font-black text-white tabular-nums">
						{self ? finishTime(self) : '—'}
					</div>
					<div class="text-[10px] font-semibold tracking-widest text-slate-400 uppercase">time</div>
				</div>
			</div>

			{#if winnerName && !selfWon}
				<p class="mt-2 text-xs text-slate-400">{winnerName} won the race.</p>
			{:else if players.length > 1}
				<p class="mt-2 text-xs text-slate-400">Waiting for the other pilots…</p>
			{/if}
			<button
				type="button"
				class="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-rose-400/40 bg-rose-500/20 px-4 py-2.5 text-sm font-bold text-rose-200 transition hover:bg-rose-500/30"
				onclick={() => lobby.leaveLobby()}
			>
				<span>Back to the village</span>
				<span class="text-rose-300/80 tabular-nums">Results in {finishWindowSeconds}s</span>
			</button>
		</div>
	</div>
{:else if showDestroyed}
	<div class="pointer-events-none fixed inset-x-0 bottom-40 z-40 flex justify-center px-4">
		<div
			class="flex items-center gap-3 rounded-2xl border border-rose-400/30 bg-rose-950/85 px-6 py-3 text-rose-100 shadow-2xl backdrop-blur-md"
		>
			<Skull size={22} strokeWidth={2} class="shrink-0 text-rose-300" aria-hidden="true" />
			<div>
				<p class="text-sm font-bold">You were destroyed</p>
				<p class="text-[11px] text-rose-300/90">Respawning in {respawnSeconds}s…</p>
			</div>
		</div>
	</div>
{:else if showResults}
	<div
		class="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-[#0b0612]/80 p-4 backdrop-blur-[2px]"
	>
		<div
			class="pointer-events-auto w-full max-w-lg rounded-2xl border border-rose-400/20 bg-[#171020]/95 p-6 text-center text-slate-50 shadow-2xl"
		>
			<p class="text-[10px] font-semibold tracking-[0.4em] text-rose-400 uppercase">
				{trackName} · Results
			</p>
			<Trophy size={44} strokeWidth={1.8} class="mx-auto mt-2 text-amber-400" aria-hidden="true" />
			<h2 class="mt-2 text-4xl font-black tracking-tight text-amber-300">
				{selfWon ? 'You win!' : 'Race complete'}
			</h2>
			<p class="mt-1 text-sm text-slate-300">
				{#if selfWon}
					The checkered flag is yours.
				{:else if winnerName}
					{winnerName} wins the {trackName}.
				{:else}
					Time's up — nobody crossed the finish line.
				{/if}
			</p>

			<div class="mt-4 flex flex-col rounded-xl bg-white/5 px-2 py-2 text-left">
				{#each players as player, index (player.id)}
					<div
						class="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm {player.id === race.selfId
							? 'bg-white/10'
							: ''}"
					>
						<span
							class="w-5 text-center text-xs font-black tabular-nums {medalText[index] ??
								'text-slate-500'}"
						>
							{player.rank}
						</span>
						<span class="min-w-0 flex-1 truncate font-semibold text-slate-100">
							{player.name}
							{#if player.id === race.selfId}
								<span class="text-xs font-normal text-slate-400">(you)</span>
							{/if}
						</span>
						<span class="shrink-0 font-mono text-xs text-slate-300">
							{finishTime(player)}
						</span>
					</div>
				{/each}
			</div>

			<button
				type="button"
				class="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-rose-400/40 bg-rose-500/20 px-4 py-2.5 text-sm font-bold text-rose-200 transition hover:bg-rose-500/30"
				onclick={() => lobby.leaveLobby()}
			>
				<span>Back to the village</span>
				<span class="text-rose-300/80 tabular-nums">Returning in {remainingSeconds}s</span>
			</button>
		</div>
	</div>
{/if}

{#if phase === 'playing' && snapshot?.winnerId && !showFinished}
	<div class="pointer-events-none fixed inset-x-0 top-24 z-50 flex justify-center px-3 sm:top-28">
		<div
			class="flex items-center gap-3 rounded-2xl border border-amber-400/30 bg-amber-950/80 px-6 py-3 text-amber-100 shadow-2xl backdrop-blur-md"
		>
			<Trophy size={20} strokeWidth={2.2} class="text-amber-300" aria-hidden="true" />
			<div>
				<p class="text-[10px] font-semibold tracking-[0.3em] text-amber-300 uppercase">
					Race finished
				</p>
				<p class="text-sm font-bold">{winnerName ?? 'A pilot'} wins!</p>
				<p class="text-[11px] text-amber-300/90">Results in {finishWindowSeconds}s…</p>
			</div>
		</div>
	</div>
{/if}

{#if showMissedGate}
	<div class="pointer-events-none fixed inset-x-0 top-24 z-50 flex justify-center px-3 sm:top-28">
		<div
			class="flex items-center gap-3 rounded-2xl border border-rose-400/30 bg-rose-950/85 px-5 py-3 text-rose-100 shadow-2xl backdrop-blur-md"
		>
			<TriangleAlert size={20} strokeWidth={2.2} class="text-rose-300" aria-hidden="true" />
			<div>
				<p class="text-[10px] font-semibold tracking-[0.3em] text-rose-300 uppercase">
					Checkpoint missed
				</p>
				<p class="text-sm font-bold">Go back to checkpoint {missedGate}</p>
				<p class="text-[11px] text-rose-300/90">This lap cannot count until you pass it.</p>
			</div>
		</div>
	</div>
{/if}
