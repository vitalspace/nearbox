<script lang="ts">
	import Flag from '@lucide/svelte/icons/flag';
	import Map from '@lucide/svelte/icons/map';
	import Users from '@lucide/svelte/icons/users';
	import X from '@lucide/svelte/icons/x';
	import { onMount } from 'svelte';
	import { checkpoints } from '../../state/checkpoints.svelte';
	import { lobby } from '../../state/lobby.svelte';
	import TrackSelectCard from './TrackSelectCard.svelte';

	const open = $derived(checkpoints.trackSelectOpen);

	function chooseGrandPrix(): void {
		checkpoints.closeTrackSelect();
		lobby.enterLobby('minigame-3');
	}

	function chooseRoadmap(): void {
		checkpoints.closeTrackSelect();
		lobby.enterLobby('minigame-4');
	}

	function close(): void {
		checkpoints.closeTrackSelect();
	}

	// Modal-ish: Escape closes the picker without picking a track.
	onMount(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && checkpoints.trackSelectOpen) {
				event.preventDefault();
				event.stopImmediatePropagation();
				close();
			}
		};

		window.addEventListener('keydown', onKeyDown, true);

		return () => {
			window.removeEventListener('keydown', onKeyDown, true);
		};
	});
</script>

{#if open}
	<div
		class="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-[#050310]/80 p-3 backdrop-blur-md sm:items-center sm:p-6"
		role="dialog"
		aria-modal="true"
		aria-labelledby="track-select-title"
	>
		<!-- Ambient orbs: warm rose on the Grand Prix side, cold cyan on the Haunted Highway side. -->
		<div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
			<div class="absolute top-1/4 -left-28 h-72 w-72 rounded-full bg-rose-600/15 blur-3xl"></div>
			<div
				class="absolute right-0 bottom-1/4 h-80 w-80 translate-x-24 rounded-full bg-cyan-500/12 blur-3xl"
			></div>
			<div
				class="absolute top-0 left-1/2 h-40 w-96 -translate-x-1/2 rounded-full bg-amber-500/10 blur-3xl"
			></div>
		</div>

		<div
			class="relative my-auto w-full max-w-3xl overflow-hidden rounded-3xl border border-amber-500/20 bg-gradient-to-b from-[#1a1030] via-[#130c24] to-[#0b0716] shadow-[0_30px_90px_-25px_rgba(0,0,0,0.95),0_0_70px_-30px_rgba(251,146,60,0.35)]"
		>
			<!-- Top hairline glow -->
			<div
				class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/70 to-transparent"
				aria-hidden="true"
			></div>

			<header
				class="flex items-start justify-between gap-3 border-b border-amber-500/15 bg-gradient-to-r from-amber-500/8 via-transparent to-cyan-400/8 px-5 py-4 sm:px-6"
			>
				<div class="min-w-0">
					<p
						class="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.3em] text-amber-300/85 uppercase"
					>
						<Map size={12} strokeWidth={2.5} aria-hidden="true" />
						Checkpoint · Race
					</p>
					<h2
						id="track-select-title"
						class="mt-1 bg-gradient-to-r from-amber-200 via-orange-300 to-rose-300 bg-clip-text text-xl font-black tracking-tight text-transparent sm:text-2xl"
					>
						Choose your track
					</h2>
					<p class="mt-1 max-w-md text-[11px] leading-relaxed text-slate-400">
						Two circuits branch out from this checkpoint. Pick one and we'll line you up on the
						grid.
					</p>
				</div>
				<button
					type="button"
					onclick={close}
					aria-label="Close track selection"
					class="shrink-0 rounded-full border border-white/10 bg-white/5 p-2 text-slate-400 transition hover:border-amber-400/40 hover:bg-amber-400/10 hover:text-amber-200 focus-visible:ring-2 focus-visible:ring-amber-400/60 focus-visible:outline-none"
				>
					<X size={16} strokeWidth={2.5} aria-hidden="true" />
				</button>
			</header>

			<div class="grid gap-3 p-4 sm:grid-cols-2 sm:gap-4 sm:p-5">
				<TrackSelectCard track="grand-prix" onchoose={chooseGrandPrix} />
				<TrackSelectCard track="roadmap" onchoose={chooseRoadmap} />
			</div>

			<footer
				class="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-black/30 px-5 py-2.5 sm:px-6"
			>
				<p class="flex items-center gap-2 text-[10px] text-slate-500">
					<kbd
						class="rounded border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-amber-200"
						>Esc</kbd
					>
					to close
					<span class="text-slate-700">•</span>
					<kbd
						class="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[9px] text-slate-300"
						>E</kbd
					>
					to re-open
				</p>
				<p
					class="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-slate-500 uppercase"
				>
					<Users size={11} strokeWidth={2.5} aria-hidden="true" />
					Both tracks · multiplayer
					<Flag size={11} strokeWidth={2.5} class="ml-1 text-amber-400/70" aria-hidden="true" />
				</p>
			</footer>
		</div>
	</div>
{/if}
