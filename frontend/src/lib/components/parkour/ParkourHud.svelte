<script lang="ts">
	import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import Flag from '@lucide/svelte/icons/flag';
	import LogOut from '@lucide/svelte/icons/log-out';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Shield from '@lucide/svelte/icons/shield';
	import Timer from '@lucide/svelte/icons/timer';
	import Trophy from '@lucide/svelte/icons/trophy';
	import { lobby } from '../../state/lobby.svelte';
	import { minigame7 } from '../../state/minigame7.svelte';
	import {
		PARKOUR_FINISH,
		PARKOUR_WARDENS,
		PARKOUR_WARDEN_VERTICAL_REACH,
		parkourCheckpointName,
		parkourWardenPosition
	} from '../../state/parkourConfig';

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
	const totalCheckpoints = $derived(PARKOUR_FINISH.index - 1);

	const deadline = $derived.by(() => {
		if (!snapshot) return null;
		if (phase === 'playing' || phase === 'countdown' || phase === 'results') {
			return snapshot.endsAt;
		}

		return null;
	});

	const remainingMs = $derived(deadline === null ? 0 : Math.max(0, deadline - now));

	const timerLabel = $derived.by(() => {
		const total = Math.ceil(remainingMs / 1000);
		const minutes = Math.floor(total / 60);
		const seconds = total % 60;

		return `${minutes}:${String(seconds).padStart(2, '0')}`;
	});

	const phaseLabel = $derived.by(() => {
		if (phase === 'playing') return 'Race time';
		if (phase === 'countdown') return 'Starting';
		if (phase === 'results') return 'Results';

		return '';
	});

	const nextName = $derived(parkourCheckpointName(minigame7.nextCheckpoint));
	const finished = $derived(minigame7.finished);
	const progress = $derived(
		totalCheckpoints === 0 ? 0 : Math.min(100, (minigame7.checkpoint / totalCheckpoints) * 100)
	);

	// Only a proximity hint: the server decides targets and attacks.
	const wardenNear = $derived.by(() => {
		if (!self || phase !== 'playing' || finished) return false;

		return PARKOUR_WARDENS.some((warden) => {
			const position = parkourWardenPosition(warden, now);

			return (
				Math.abs(position.y - self.y) <= PARKOUR_WARDEN_VERTICAL_REACH &&
				Math.hypot(position.x - self.x, position.z - self.z) <= 14
			);
		});
	});

	const protectedLeft = $derived.by(() => {
		if (!self || !minigame7.isProtected) return 0;

		return Math.max(0, Math.ceil(((self.protectionUntil ?? 0) - now) / 1000));
	});
</script>

{#if snapshot && self}
	<div class="pointer-events-none fixed inset-0 z-30 select-none">
		<!-- Top center: race timer -->
		<div
			class="absolute top-20 left-1/2 flex -translate-x-1/2 flex-col items-center rounded-xl bg-slate-950/70 px-5 py-2 text-white shadow-lg backdrop-blur-sm sm:top-24"
		>
			<div class="text-[10px] font-semibold tracking-[0.3em] text-amber-300 uppercase">
				Parkour Spire
			</div>
			<div class="flex items-center gap-2">
				<Timer size={16} strokeWidth={2.4} class="text-slate-300" aria-hidden="true" />
				<span class="text-3xl font-black tabular-nums">{timerLabel}</span>
			</div>
			<div class="text-[9px] font-semibold tracking-[0.2em] text-slate-400 uppercase">
				{phaseLabel}
			</div>
		</div>

		<!-- Right: race position -->
		<div
			class="absolute top-20 right-3 flex flex-col items-end rounded-xl bg-slate-950/70 px-3 py-2 text-white shadow-lg backdrop-blur-sm sm:top-24 sm:right-4"
		>
			<div
				class="flex items-center gap-1.5 text-[10px] font-semibold tracking-widest text-amber-300 uppercase"
			>
				<Trophy size={12} strokeWidth={2.4} aria-hidden="true" />
				Position
			</div>
			<div class="text-2xl font-black tabular-nums">
				{minigame7.position || '—'}<span class="text-sm text-slate-400">/{snapshot.maxPlayers}</span
				>
			</div>
			<button
				type="button"
				aria-label="Leave the parkour"
				title="Leave the parkour"
				class="pointer-events-auto mt-1 flex w-full items-center justify-center gap-1 rounded-md bg-slate-900/60 px-1.5 py-1 text-[9px] font-bold tracking-wide text-slate-300 uppercase transition hover:bg-slate-800 hover:text-white"
				onclick={() => lobby.leaveLobby()}
			>
				<LogOut size={12} strokeWidth={2.2} aria-hidden="true" />
				Leave
			</button>
		</div>

		<!-- Bottom left: checkpoints, falls, next objective -->
		<div
			class="absolute bottom-24 left-3 flex w-56 flex-col gap-1.5 rounded-xl bg-slate-950/70 px-3 py-2.5 text-white shadow-lg backdrop-blur-sm sm:bottom-6 sm:left-4"
		>
			<div
				class="flex items-center justify-between text-[10px] font-semibold tracking-widest text-slate-300 uppercase"
			>
				<span class="flex items-center gap-1.5">
					<MapPin size={12} strokeWidth={2.4} aria-hidden="true" />
					Checkpoints
				</span>
				<span class="tabular-nums"
					>{Math.min(minigame7.checkpoint, totalCheckpoints)}/{totalCheckpoints}</span
				>
			</div>
			<div class="h-2 overflow-hidden rounded-full bg-slate-800">
				<div
					class="h-full rounded-full bg-amber-400 transition-all"
					style:width={`${progress}%`}
				></div>
			</div>

			<div class="mt-0.5 flex items-center justify-between text-[11px]">
				<span class="flex items-center gap-1.5 text-slate-300">
					<ArrowDown size={12} strokeWidth={2.4} aria-hidden="true" />
					Falls
				</span>
				<span class="font-bold tabular-nums">{minigame7.falls}</span>
			</div>

			<div class="flex items-center gap-1.5 text-[11px]">
				<Flag size={12} strokeWidth={2.4} class="shrink-0 text-amber-300" aria-hidden="true" />
				<span class="truncate text-slate-200">
					{finished ? 'Finished' : nextName}
				</span>
			</div>

			{#if protectedLeft > 0}
				<div class="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-300 uppercase">
					<Shield size={11} strokeWidth={2.4} aria-hidden="true" />
					Protection 1.5s
				</div>
			{:else if wardenNear}
				<div class="flex items-center gap-1.5 text-[10px] font-semibold text-rose-300 uppercase">
					<AlertTriangle size={11} strokeWidth={2.4} aria-hidden="true" />
					Warden nearby
				</div>
			{/if}
		</div>
	</div>
{/if}
