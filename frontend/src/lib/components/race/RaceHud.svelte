<script lang="ts">
	import Heart from '@lucide/svelte/icons/heart';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Timer from '@lucide/svelte/icons/timer';
	import { POWER_COLORS, POWER_NAMES, RACE_MAX_MS } from '../../state/raceConfig';
	import { lobby } from '../../state/lobby.svelte';
	import { race } from '../../state/race.svelte';

	let now = $state(race.serverNow());

	$effect(() => {
		const timer = setInterval(() => {
			now = race.serverNow();
		}, 100);

		return () => clearInterval(timer);
	});

	const self = $derived(race.self);
	const total = $derived(race.snapshot?.totalLaps ?? 5);
	const players = $derived(race.snapshot?.players ?? []);
	const trackName = $derived(race.snapshot?.trackName ?? 'Grand Prix');
	const gateCount = $derived(race.snapshot?.gateCount ?? 8);

	function formatClock(ms: number): string {
		const seconds = Math.max(0, Math.ceil(ms / 1000));
		const minutes = Math.floor(seconds / 60);
		const rest = seconds % 60;

		return `${minutes}:${String(rest).padStart(2, '0')}`;
	}

	const elapsed = $derived.by(() => {
		const startedAt = race.snapshot?.startedAt;

		if (!startedAt) {
			return '0:00';
		}

		const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
		const minutes = Math.floor(seconds / 60);
		const rest = seconds % 60;

		return `${minutes}:${String(rest).padStart(2, '0')}`;
	});

	/**
	 * Race clock. `raceMaxMs` is the time the race is allowed to last
	 * (8 min for the Grand Prix, 7 min for the Haunted Highway), so it is used
	 * as the initial value and the countdown falls back to it before the race
	 * starts. While playing, the authoritative deadline is `endsAt`.
	 */
	const raceLimitMs = $derived(race.snapshot?.raceMaxMs ?? RACE_MAX_MS);
	const raceRemainingMs = $derived.by(() => {
		const endsAt = race.snapshot?.endsAt;
		const phase = race.phase;

		if ((phase === 'playing' || phase === 'results') && typeof endsAt === 'number') {
			return Math.max(0, endsAt - now);
		}

		return raceLimitMs;
	});
	const raceClock = $derived(formatClock(raceRemainingMs));
	const raceClockCaption = $derived.by(() => {
		if (race.phase === 'playing') return 'Time left';
		if (race.phase === 'results') return 'Results in';
		if (race.phase === 'countdown') return 'Race limit';

		return 'Race limit';
	});

	const speedKmh = $derived(Math.round(race.speed * 3.6));
	const healthPercent = $derived(
		Math.max(0, Math.min(100, (race.health / Math.max(1, race.maxHealth)) * 100))
	);
	const nextGateLabel = $derived.by(() => {
		if (!self || self.status === 'finished') {
			return null;
		}

		const next = self.status === 'grid' ? 0 : self.gate >= gateCount - 1 ? 0 : self.gate + 1;

		return next === 0 ? 'finish line' : `gate ${next}`;
	});
	/** True while the local car's reported up vector points sideways/down. */
	const flipped = $derived.by(() => {
		const id = race.selfId;

		if (!id || race.phase !== 'playing' || race.status !== 'racing') {
			return false;
		}

		const position = race.positions[id];

		if (!position) {
			return false;
		}

		// y component of (0, 1, 0) rotated by the reported quaternion.
		const upY = 1 - 2 * (position.qx * position.qx + position.qz * position.qz);

		return upY < 0.35;
	});
</script>

{#if self}
	<div class="pointer-events-none fixed inset-0 z-30 select-none">
		<!-- Top center: race timer -->
		<div
			class="absolute top-20 left-1/2 flex -translate-x-1/2 flex-col items-center rounded-xl bg-slate-950/70 px-5 py-2 text-white shadow-lg backdrop-blur-sm sm:top-24"
		>
			<div class="text-[10px] font-semibold tracking-[0.3em] text-red-300 uppercase">
				{trackName}
			</div>
			<div class="flex items-center gap-2">
				<Timer size={16} strokeWidth={2.4} class="text-slate-300" aria-hidden="true" />
				<span
					class="text-3xl font-black tabular-nums"
					class:text-rose-300={race.phase === 'playing' && raceRemainingMs <= 30_000}
				>
					{raceClock}
				</span>
			</div>
			<div class="text-[9px] font-semibold tracking-[0.2em] text-slate-400 uppercase">
				{raceClockCaption}
			</div>
		</div>

		<!-- Top left: lap, position and elapsed time -->
		<div
			class="absolute top-20 left-3 flex flex-col gap-1 rounded-xl bg-slate-950/65 px-4 py-3 text-white shadow-lg backdrop-blur-sm sm:top-24 sm:left-4"
		>
			<div class="text-[10px] font-semibold tracking-[0.3em] text-red-300 uppercase">Lap</div>
			<div class="text-2xl font-black tabular-nums">
				{race.displayLap}<span class="text-sm font-semibold text-slate-400">/{total}</span>
			</div>
			<div class="flex gap-3 text-xs font-semibold text-slate-200">
				<span class="tabular-nums">P{race.rank}/{Math.max(1, players.length)}</span>
				<span class="text-slate-400 tabular-nums">Elapsed {elapsed}</span>
			</div>
			{#if nextGateLabel}
				<div class="text-[10px] font-semibold tracking-wide text-red-300 uppercase">
					Next: {nextGateLabel}
				</div>
			{/if}
			{#if flipped}
				<div class="text-[10px] font-black tracking-wide text-amber-300 uppercase">
					Flipped — press R
				</div>
			{/if}
			{#if race.phase === 'playing' && self.status === 'racing'}
				<button
					type="button"
					class="pointer-events-auto mt-1 self-start rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-[10px] font-bold tracking-wide text-white uppercase transition hover:bg-white/20 active:scale-95"
					onclick={() => race.requestReset()}
				>
					Reset car · R
				</button>
			{/if}
		</div>

		<!-- Top right: player list -->
		<div
			class="absolute top-20 right-3 w-52 rounded-xl bg-slate-950/65 px-3 py-2 text-white shadow-lg backdrop-blur-sm sm:top-24 sm:right-4"
		>
			<div class="mb-1 flex items-center justify-between gap-2">
				<div class="flex items-center gap-2">
					<div class="text-[10px] font-semibold tracking-[0.3em] text-red-300 uppercase">
						Pilots
					</div>
					<span class="text-[10px] text-slate-400 tabular-nums"
						>{players.length}/{race.snapshot?.maxPlayers ?? 6}</span
					>
				</div>
				<button
					type="button"
					aria-label="Leave the race"
					title="Leave the race"
					class="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-white/10 hover:text-white"
					onclick={() => lobby.leaveLobby()}
				>
					<LogOut size={16} strokeWidth={2.2} aria-hidden="true" />
				</button>
			</div>
			<ul class="space-y-0.5 text-[11px]">
				{#each players as player (player.id)}
					<li
						class="flex items-center justify-between gap-2"
						class:opacity-50={player.status === 'finished' || player.status === 'destroyed'}
					>
						<span class="min-w-0 truncate">
							{player.rank}. {player.name}
						</span>
						<span class="flex shrink-0 items-center gap-1.5">
							<span
								class="block h-1.5 w-9 overflow-hidden rounded-full bg-slate-700"
								title={`${player.health}/${player.maxHealth} HP`}
							>
								<span
									class="block h-full rounded-full transition-[width] duration-150"
									class:bg-emerald-400={player.health > 50}
									class:bg-amber-400={player.health > 20 && player.health <= 50}
									class:bg-rose-500={player.health <= 20}
									style:width={`${Math.max(0, Math.min(100, (player.health / Math.max(1, player.maxHealth)) * 100))}%`}
								></span>
							</span>
							<span class="w-6 text-right font-mono text-slate-300">
								{player.status === 'finished' ? 'FIN' : `L${player.lap + 1}`}
							</span>
						</span>
					</li>
				{/each}
			</ul>
		</div>

		<!-- Bottom center: speed, health and item -->
		<div
			class="absolute bottom-6 left-1/2 flex w-[min(92vw,520px)] -translate-x-1/2 flex-col gap-2 rounded-xl bg-slate-950/65 px-4 py-3 text-white shadow-lg backdrop-blur-sm"
		>
			<div class="flex items-end justify-between">
				<div>
					<div class="text-3xl leading-none font-black tabular-nums">{speedKmh}</div>
					<div class="text-[10px] font-semibold tracking-widest text-slate-300 uppercase">km/h</div>
				</div>

				{#if self.item}
					<div
						class="rounded-lg px-3 py-1 text-sm font-bold"
						style:background-color={POWER_COLORS[self.item]}
						style:color="#0f172a"
					>
						{POWER_NAMES[self.item]} · Q
					</div>
				{:else}
					<div class="text-[11px] font-semibold text-slate-400">No item</div>
				{/if}
			</div>

			<div
				class="flex items-center justify-between text-[10px] font-semibold tracking-widest text-slate-300 uppercase"
			>
				<span class="flex items-center gap-1.5">
					<Heart size={12} strokeWidth={2.4} aria-hidden="true" />
					Health
				</span>
				<span class="tabular-nums">{Math.ceil(race.health)}</span>
			</div>
			<div class="h-3 w-full overflow-hidden rounded-full bg-slate-800">
				<div
					class="h-full rounded-full bg-emerald-400 transition-[width] duration-150"
					style:width={`${healthPercent}%`}
				></div>
			</div>

			<div class="flex gap-3 text-[10px] font-semibold tracking-widest uppercase">
				<span class:text-sky-300={race.nitroActive}>Nitro</span>
				<span class:text-emerald-300={race.autoRepairActive}>Auto</span>
				<span class:text-violet-300={race.shieldActive}>Shield</span>
			</div>
		</div>
	</div>
{/if}
