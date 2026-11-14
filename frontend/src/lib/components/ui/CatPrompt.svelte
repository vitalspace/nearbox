<script lang="ts">
	import PawPrint from '@lucide/svelte/icons/paw-print';
	import { CAT_ZONES } from '../../missions/cats';
	import { chat } from '../../state/chat.svelte';
	import { hubKiosks } from '../../state/hubKiosks.svelte';
	import { missions } from '../../state/missions.svelte';
	import { ride } from '../../state/ride.svelte';
	import { sceneState } from '../../state/sceneState.svelte';

	const cat = $derived(
		sceneState.inHub && !hubKiosks.panelOpen && !ride.isRiding ? missions.nearestCat : null
	);

	function isEditableTarget(target: EventTarget | null): boolean {
		return (
			target instanceof HTMLElement &&
			target.closest('input, textarea, select, [contenteditable="true"]') !== null
		);
	}

	function capture(): void {
		const target = cat;

		if (!target || chat.isOpen || hubKiosks.panelOpen) {
			return;
		}

		missions.capture(target.id);
	}

	$effect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.code !== 'KeyE' || event.repeat || event.defaultPrevented) {
				return;
			}

			if (event.ctrlKey || event.metaKey || event.altKey) {
				return;
			}

			if (isEditableTarget(event.target) || chat.isOpen || !cat) {
				return;
			}

			event.preventDefault();
			capture();
		};

		window.addEventListener('keydown', onKeyDown);

		return () => window.removeEventListener('keydown', onKeyDown);
	});
</script>

{#if cat}
	<div
		class="cat-prompt pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-3"
	>
		<div
			class="pointer-events-auto flex max-w-full items-center gap-3 rounded-2xl border border-amber-400/30 bg-amber-950/80 px-5 py-3 text-amber-100 shadow-2xl backdrop-blur-md"
		>
			<span
				class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-amber-300"
				aria-hidden="true"
			>
				<PawPrint size={18} strokeWidth={2} />
			</span>

			<div class="min-w-0" aria-live="polite">
				<p class="text-[10px] font-semibold tracking-[0.3em] text-amber-300 uppercase">
					{CAT_ZONES[cat.zone].label} · cat nearby
				</p>
				<p class="truncate text-sm font-bold">{cat.name}</p>
				<p class="text-[11px] text-amber-300/90">
					Press
					<kbd class="rounded border border-white/20 bg-white/10 px-1 font-mono text-[10px]">E</kbd> to
					catch
				</p>
			</div>

			<button
				type="button"
				onclick={capture}
				class="shrink-0 rounded-xl border border-amber-400/40 bg-amber-500/20 px-4 py-2 text-xs font-bold text-amber-200 transition hover:bg-amber-500/30 active:scale-95"
			>
				Catch
			</button>
		</div>
	</div>
{/if}

<style>
	/* Touch controls take up the bottom strip; we raise the prompt so they aren't covered. */
	:global(html.touch-controls-active) .cat-prompt {
		bottom: 11rem;
	}
</style>
