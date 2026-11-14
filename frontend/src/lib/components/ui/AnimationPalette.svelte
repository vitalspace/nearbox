<script lang="ts">
	import Clapperboard from '@lucide/svelte/icons/clapperboard';
	import X from '@lucide/svelte/icons/x';
	import { ANIMATION_GROUPS } from '../../cosmetics/animationLabels';
	import { animationPalette, type PaletteClip } from '../../state/animationPalette.svelte';
	import { balloon } from '../../state/balloon.svelte';
	import { cars } from '../../state/cars.svelte';
	import { minigame5 } from '../../state/minigame5.svelte';
	import { race } from '../../state/race.svelte';
	import { ride } from '../../state/ride.svelte';

	let rootEl = $state<HTMLDivElement>();
	let triggerEl = $state<HTMLButtonElement>();

	const driving = $derived(
		cars.isDriving || balloon.isOccupant || ride.isRiding || race.inCar || minigame5.isDriving
	);

	const groups = $derived(
		ANIMATION_GROUPS.map((group) => ({
			id: group.id,
			label: group.label,
			clips: group.clips
				.map((animation) => animationPalette.clips.find((entry) => entry.animation === animation))
				.filter((entry): entry is PaletteClip => entry !== undefined)
		})).filter((group) => group.clips.length > 0)
	);

	function closeAndFocus(): void {
		animationPalette.close();
		triggerEl?.focus();
	}

	function onWindowPointerDown(event: PointerEvent): void {
		if (!animationPalette.open) return;

		const target = event.target;

		if (target instanceof Node && rootEl?.contains(target)) return;

		animationPalette.close();
	}

	function onWindowKeyDown(event: KeyboardEvent): void {
		if (!animationPalette.open || event.key !== 'Escape') return;

		event.preventDefault();
		closeAndFocus();
	}

	$effect(() => {
		if (driving) {
			animationPalette.close();
		}
	});

	$effect(() => {
		if (!animationPalette.open) return;

		window.addEventListener('keydown', onWindowKeyDown);
		window.addEventListener('pointerdown', onWindowPointerDown);

		return () => {
			window.removeEventListener('keydown', onWindowKeyDown);
			window.removeEventListener('pointerdown', onWindowPointerDown);
		};
	});
</script>

{#if !driving}
	<div
		bind:this={rootEl}
		class="pointer-events-auto fixed z-40 flex flex-col items-end"
		style="right: max(1rem, env(safe-area-inset-right)); bottom: max(8.75rem, calc(env(safe-area-inset-bottom) + 8rem));"
	>
		<button
			bind:this={triggerEl}
			type="button"
			aria-label="Animations"
			aria-controls="animation-palette"
			aria-expanded={animationPalette.open}
			title="Show the animations of the current skin"
			class="flex h-11 items-center gap-2 rounded-full border border-white/15 bg-slate-950/75 px-4 text-sm font-semibold text-slate-100 shadow-lg shadow-black/30 backdrop-blur-md transition hover:bg-slate-900/90 active:scale-95"
			onclick={() => animationPalette.toggle()}
		>
			<Clapperboard size={18} strokeWidth={2.2} aria-hidden="true" />
			<span class="hidden sm:inline">Animations</span>
		</button>

		{#if animationPalette.open}
			<div
				id="animation-palette"
				role="dialog"
				aria-label="Player animations"
				class="absolute right-0 bottom-full mb-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-white/15 bg-slate-950/90 text-slate-100 shadow-2xl shadow-black/50 backdrop-blur-xl"
			>
				<header class="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
					<Clapperboard size={16} strokeWidth={2.2} aria-hidden="true" />
					<div class="min-w-0 flex-1">
						<h2 class="text-sm font-semibold">Animations</h2>
						<p class="text-[11px] text-slate-400">
							{animationPalette.clips.length} available · shared with other players
						</p>
					</div>
					<button
						type="button"
						aria-label="Close animations"
						class="flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition hover:bg-white/10 hover:text-white"
						onclick={closeAndFocus}
					>
						<X size={16} strokeWidth={2.4} aria-hidden="true" />
					</button>
				</header>

				<div class="max-h-[min(60vh,32rem)] overflow-y-auto overscroll-contain px-2 py-2">
					{#if groups.length === 0}
						<p class="px-2 py-6 text-center text-sm text-slate-400">No animations available</p>
					{:else}
						{#each groups as group (group.id)}
							<section class="mb-2 last:mb-0">
								<h3
									class="px-2 py-1 text-[10px] font-semibold tracking-[0.14em] text-slate-400 uppercase"
								>
									{group.label}
								</h3>

								<div class="grid grid-cols-2 gap-1">
									{#each group.clips as entry (entry.animation)}
										{@const active = animationPalette.active === entry.animation}
										<button
											type="button"
											aria-pressed={active}
											title={`${entry.clip} · ${entry.durationMs / 1000}s`}
											class="flex min-h-10 flex-col rounded-lg border px-2 py-1.5 text-left transition active:scale-[0.98] {active
												? 'border-emerald-300/60 bg-emerald-400/20 text-emerald-50'
												: 'border-white/10 bg-white/5 text-slate-100 hover:border-white/20 hover:bg-white/10'}"
											onclick={() => animationPalette.activate(entry.animation)}
										>
											<span class="text-[12px] leading-tight font-semibold">{entry.label}</span>
											<span
												class="flex items-center justify-between gap-1 text-[10px] text-slate-400"
											>
												<span class="truncate">{entry.clip}</span>
												<span class="shrink-0 tabular-nums">
													{(entry.durationMs / 1000).toFixed(1)}s
												</span>
											</span>
										</button>
									{/each}
								</div>
							</section>
						{/each}
					{/if}
				</div>

				<footer class="border-t border-white/10 px-3 py-2 text-[10px] text-slate-500">
					Chat: <span class="text-slate-300">/anim &lt;name|number&gt;</span> ·
					<span class="text-slate-300">/anim list</span>
				</footer>
			</div>
		{/if}
	</div>
{/if}
