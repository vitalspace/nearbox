<script lang="ts">
	import Car from '@lucide/svelte/icons/car';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Flag from '@lucide/svelte/icons/flag';
	import Gauge from '@lucide/svelte/icons/gauge';
	import Layers from '@lucide/svelte/icons/layers';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Route from '@lucide/svelte/icons/route';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Users from '@lucide/svelte/icons/users';
	import Zap from '@lucide/svelte/icons/zap';
	import TrackPreview from './TrackPreview.svelte';
	import type { TrackId } from './trackPreview';
	import { lobby } from '../../state/lobby.svelte';

	interface Props {
		track: TrackId;
		onchoose: () => void;
	}

	let { track, onchoose }: Props = $props();

	let loaded = $state(false);
	let failed = $state(false);

	/**
	 * Accent palettes are written as full literal class names so the Tailwind
	 * scanner picks them up. Each theme pairs a warm (Grand Prix) or cold
	 * (Haunted Highway) neon with a deep violet base, matching the onboarding look.
	 */
	const THEMES = {
		'grand-prix': {
			card: 'border-rose-500/30 bg-gradient-to-b from-rose-950/45 via-[#1d101f] to-[#130a18] hover:border-rose-400/60 hover:shadow-[0_0_50px_-14px_rgba(251,113,133,0.55)] focus-visible:ring-rose-400/70',
			canvasBg:
				'bg-[radial-gradient(120%_90%_at_50%_112%,rgba(244,63,94,0.34),transparent_58%),radial-gradient(90%_70%_at_50%_-12%,rgba(251,146,60,0.22),transparent_55%)]',
			eyebrow: 'border-rose-400/40 bg-rose-950/70 text-rose-200',
			badge: 'border-orange-300/40 bg-gradient-to-r from-rose-500 to-orange-500 text-[#2a0a10]',
			title: 'text-rose-100 group-hover:text-white',
			go: 'border-rose-400/30 text-rose-300 group-hover:border-rose-400 group-hover:bg-rose-500 group-hover:text-[#2a0a10]',
			divide: 'border-rose-400/15'
		},
		roadmap: {
			card: 'border-cyan-400/30 bg-gradient-to-b from-cyan-950/45 via-[#0d1828] to-[#0a101f] hover:border-cyan-300/60 hover:shadow-[0_0_50px_-14px_rgba(34,211,238,0.5)] focus-visible:ring-cyan-300/70',
			canvasBg:
				'bg-[radial-gradient(120%_90%_at_50%_112%,rgba(34,211,238,0.3),transparent_58%),radial-gradient(90%_70%_at_50%_-12%,rgba(167,139,250,0.3),transparent_55%)]',
			eyebrow: 'border-cyan-300/40 bg-cyan-950/70 text-cyan-200',
			badge: 'border-cyan-300/40 bg-gradient-to-r from-cyan-400 to-violet-500 text-[#062530]',
			title: 'text-cyan-100 group-hover:text-white',
			go: 'border-cyan-300/30 text-cyan-300 group-hover:border-cyan-300 group-hover:bg-cyan-400 group-hover:text-[#062530]',
			divide: 'border-cyan-300/15'
		}
	} as const;

	const CONTENT = {
		'grand-prix': {
			eyebrow: 'TWN TRACK',
			badge: '5 LAPS',
			title: 'Grand Prix',
			description:
				'The village ring circuit: full throttle on asphalt, power-up boxes and a photo finish at the gantry.',
			EyebrowIcon: Flag,
			chips: [
				{ Icon: Flag, label: '5 laps' },
				{ Icon: Zap, label: 'Power-ups' },
				{ Icon: Users, label: 'Multiplayer' }
			]
		},
		roadmap: {
			eyebrow: 'HW STUNT PARK',
			badge: '3 JUMPS',
			title: 'Haunted Highway',
			description:
				'The neon graveyard stunt road: sweepers, bone-hall arches and three jump decks to send it over the limit.',
			EyebrowIcon: Route,
			chips: [
				{ Icon: Layers, label: 'Jump decks' },
				{ Icon: Gauge, label: 'Stunt road' },
				{ Icon: Sparkles, label: 'Neon' }
			]
		}
	} as const;

	const theme = $derived(THEMES[track]);
	const content = $derived(CONTENT[track]);
	const lobbyId = $derived(track === 'grand-prix' ? 'minigame-3' : 'minigame-4');
	const status = $derived(lobby.statusForLobby(lobbyId));
	const playerCount = $derived(lobby.lobbyById(lobbyId)?.players.length ?? 0);
	const canEnter = $derived(status?.canEnter ?? true);
	const isFull = $derived(
		status !== null && !status.canEnter && (status.reason?.toLowerCase().includes('full') ?? false)
	);
	const phaseLabel = $derived.by(() => {
		if (!status) {
			return 'Open';
		}

		if (isFull) {
			return 'Full';
		}

		if (status.phase === 'playing') {
			return 'In progress';
		}

		if (status.phase === 'results') {
			return status.canEnter ? 'Results' : 'Finishing';
		}

		if (!status.canEnter) {
			return 'Full';
		}

		if (status.phase === 'countdown') {
			return 'Starting soon';
		}

		if (status.phase === 'waiting') {
			return 'Waiting for players';
		}

		return 'Open';
	});
	const statusDotClass = $derived(
		!status
			? 'bg-emerald-400'
			: !status.canEnter
				? status.phase === 'results'
					? 'bg-slate-400'
					: 'bg-rose-400'
				: status.phase === 'playing' || status.phase === 'countdown'
					? 'animate-pulse bg-amber-400'
					: status.phase === 'results'
						? 'bg-slate-400'
						: 'bg-emerald-400'
	);
</script>

<button
	type="button"
	onclick={onchoose}
	disabled={!canEnter}
	aria-label={canEnter ? `Choose ${content.title}` : `${content.title}: ${phaseLabel}`}
	class="group relative flex w-full flex-col overflow-hidden rounded-2xl border text-left transition duration-300 outline-none hover:-translate-y-1 focus-visible:ring-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 {theme.card}"
>
	<!-- 3D stage with a soft inner glow behind the miniature. -->
	<div class="relative h-40 w-full overflow-hidden sm:h-48 {theme.canvasBg}">
		<TrackPreview {track} bind:loaded bind:failed />

		{#if !loaded}
			<div class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/35">
				<LoaderCircle
					size={20}
					strokeWidth={2}
					class="animate-spin text-slate-300"
					aria-hidden="true"
				/>
				<p class="text-[9px] font-semibold tracking-[0.25em] text-slate-400 uppercase">
					Loading track
				</p>
			</div>
		{:else if failed}
			<div class="absolute inset-0 flex items-center justify-center">
				<p
					class="px-4 text-center text-[10px] font-semibold tracking-widest text-slate-500 uppercase"
				>
					Preview unavailable — the race goes on
				</p>
			</div>
		{/if}

		<span
			class="pointer-events-none absolute top-2.5 left-2.5 flex items-center gap-1.5 rounded-full border px-2 py-1 text-[8px] font-bold tracking-[0.2em] backdrop-blur-sm {theme.eyebrow}"
		>
			<content.EyebrowIcon size={10} strokeWidth={2.5} aria-hidden="true" />
			{content.eyebrow}
		</span>
		<span
			class="pointer-events-none absolute top-2.5 right-2.5 rounded-full border px-2 py-1 text-[8px] font-black tracking-[0.2em] shadow-lg {theme.badge}"
		>
			{content.badge}
		</span>

		<!-- Bottom fade so the stage melts into the card body. -->
		<div
			class="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/55 to-transparent"
			aria-hidden="true"
		></div>
	</div>

	<!-- Card body -->
	<div class="flex flex-1 flex-col border-t p-3.5 sm:p-4 {theme.divide}">
		<div class="flex items-center justify-between gap-2">
			<p
				class="flex items-center gap-2 text-base font-extrabold tracking-wide transition-colors duration-300 sm:text-lg {theme.title}"
			>
				<Car size={17} strokeWidth={2.25} aria-hidden="true" />
				{content.title}
			</p>
			<span
				class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all duration-300 {theme.go}"
				aria-hidden="true"
			>
				<ChevronRight size={16} strokeWidth={2.5} />
			</span>
		</div>
		<p class="mt-1.5 text-[11px] leading-relaxed text-slate-400">{content.description}</p>
		<p class="mt-2 flex items-center gap-1.5 text-[10px] font-medium text-slate-300">
			<span class="h-1.5 w-1.5 shrink-0 rounded-full {statusDotClass}" aria-hidden="true"></span>
			<span>{phaseLabel}</span>
			{#if status?.maxPlayers}
				<span class="text-slate-600">·</span>
				<span class="text-slate-400">{playerCount}/{status.maxPlayers} players</span>
			{/if}
		</p>
		<div class="mt-2.5 flex flex-wrap gap-1.5">
			{#each content.chips as chip (chip.label)}
				<span
					class="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[8px] font-semibold tracking-wider text-slate-300 uppercase"
				>
					<chip.Icon size={9} strokeWidth={2.25} aria-hidden="true" />
					{chip.label}
				</span>
			{/each}
		</div>
	</div>
</button>
