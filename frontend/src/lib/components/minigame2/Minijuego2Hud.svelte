<script lang="ts">
	import Clock from '@lucide/svelte/icons/clock';
	import Heart from '@lucide/svelte/icons/heart';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Skull from '@lucide/svelte/icons/skull';
	import { lobby } from '../../state/lobby.svelte';
	import { minigame2 } from '../../state/minigame2.svelte';

	const PHASE_LABELS: Record<string, string> = {
		idle: 'Waiting',
		countdown: 'Get ready',
		playing: 'In game',
		won: 'Complete',
		lost: 'Defeat'
	};

	const ZONES = [
		{ name: 'West', color: 'bg-sky-400' },
		{ name: 'South', color: 'bg-rose-400' },
		{ name: 'East', color: 'bg-emerald-400' },
		{ name: 'North', color: 'bg-violet-400' },
		{ name: 'Niches', color: 'bg-amber-400' }
	];

	let now = $state(minigame2.serverNow());

	$effect(() => {
		const timer = setInterval(() => {
			now = minigame2.serverNow();
		}, 250);

		return () => clearInterval(timer);
	});

	const snapshot = $derived(minigame2.snapshot);
	const players = $derived(snapshot?.players ?? []);
	const self = $derived(minigame2.self);
	const endsAt = $derived(snapshot?.endsAt ?? null);
	const remainingMs = $derived(endsAt ? Math.max(0, endsAt - now) : 0);
	const hpPercent = $derived(
		self && self.maxHp > 0 ? Math.max(0, Math.min(100, (self.hp / self.maxHp) * 100)) : 0
	);
	const hpColor = $derived(
		hpPercent > 55 ? 'bg-emerald-400' : hpPercent > 25 ? 'bg-amber-400' : 'bg-rose-500'
	);

	const timeLabel = $derived.by(() => {
		const totalSeconds = Math.ceil(remainingMs / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;

		return `${minutes}:${seconds.toString().padStart(2, '0')}`;
	});
</script>

{#if snapshot && snapshot.phase !== 'idle'}
	<div class="pointer-events-none fixed inset-x-0 top-16 z-30 flex justify-center px-3 xl:top-3">
		<div
			class="pointer-events-none w-full max-w-xl rounded-xl bg-slate-950/70 px-4 py-3 text-slate-100 shadow-lg backdrop-blur-sm"
		>
			<div class="flex flex-wrap items-center justify-between gap-2">
				<div class="flex items-center gap-2">
					<span class="text-[10px] font-semibold tracking-[0.3em] text-amber-300 uppercase">
						The Mummy Crypt
					</span>
					<span
						class="rounded-full bg-amber-400/15 px-2 py-0.5 text-[9px] font-semibold tracking-wide text-amber-200 uppercase"
					>
						{PHASE_LABELS[snapshot.phase] ?? snapshot.phase}
					</span>
				</div>

				<div class="flex items-center gap-2">
					{#if snapshot.phase === 'countdown' || snapshot.phase === 'playing'}
						<div class="flex items-baseline gap-1">
							<Clock
								size={12}
								strokeWidth={2.4}
								class="self-center text-amber-300"
								aria-hidden="true"
							/>
							<span class="text-2xl font-black text-amber-200 tabular-nums">{timeLabel}</span>
							<span class="text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
								left
							</span>
						</div>
					{/if}

					<button
						type="button"
						aria-label="Leave the crypt"
						title="Leave the crypt"
						class="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900/60 text-slate-300 transition hover:bg-slate-800 hover:text-white"
						onclick={() => lobby.leaveLobby()}
					>
						<LogOut size={16} strokeWidth={2.2} aria-hidden="true" />
					</button>
				</div>
			</div>

			<div class="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1">
				<div class="flex items-baseline gap-1.5">
					<Skull
						size={14}
						strokeWidth={2.4}
						class="self-center text-amber-300"
						aria-hidden="true"
					/>
					<span class="text-2xl font-black tabular-nums">
						{snapshot.depositedTotal}<span class="text-sm font-semibold text-slate-400"
							>/{snapshot.skulls.length || 10}</span
						>
					</span>
					<span class="text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
						team
					</span>
				</div>
				<div class="flex items-baseline gap-1.5">
					<span class="text-2xl font-black text-emerald-300 tabular-nums">{minigame2.carried}</span>
					<span class="text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
						yours
					</span>
				</div>
			</div>

			{#if self}
				<div
					class="mt-2 flex items-center justify-between text-[10px] font-semibold tracking-widest text-slate-300 uppercase"
				>
					<span class="flex items-center gap-1.5">
						<Heart size={12} strokeWidth={2.4} aria-hidden="true" />
						{self.alive ? 'Life' : 'Down'}
					</span>
					<span class="font-mono text-slate-400 tabular-nums"
						>{Math.ceil(self.hp)}/{self.maxHp}</span
					>
				</div>
				<div class="mt-1 h-3 overflow-hidden rounded-full bg-slate-800">
					<div
						class="h-full rounded-full transition-[width] duration-150 {hpColor}"
						style:width={`${hpPercent}%`}
					></div>
				</div>
			{/if}

			{#if players.length > 0}
				<div class="mt-2 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
					Survivors
				</div>
				<div class="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-300 sm:grid-cols-3">
					{#each players as player (player.id)}
						<div class="flex items-center justify-between gap-2">
							<span class="truncate">
								{player.name}
								{#if !player.alive}
									<span class="text-rose-300">· dead</span>
								{/if}
							</span>
							<span class="shrink-0 font-mono text-slate-400 tabular-nums">
								{player.skullsCarried}↑ {player.skullsDeposited}✓
							</span>
						</div>
					{/each}
				</div>
			{/if}

			<div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400">
				<span class="text-slate-500">Skulls per zone:</span>
				{#each ZONES as zone (zone.name)}
					<span class="inline-flex items-center gap-1">
						<span class="h-1.5 w-1.5 rounded-full {zone.color}"></span>
						{zone.name}
					</span>
				{/each}
				<span class="ml-auto text-amber-200/80">Paper rolls stun mummies</span>
			</div>
		</div>
	</div>
{/if}
