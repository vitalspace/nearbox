<script lang="ts">
	import Map from '@lucide/svelte/icons/map';
	import ShoppingBag from '@lucide/svelte/icons/shopping-bag';
	import { balloon } from '../../state/balloon.svelte';
	import { cars } from '../../state/cars.svelte';
	import { chat } from '../../state/chat.svelte';
	import { clubMusic } from '../../state/clubMusic.svelte';
	import { hubKiosks } from '../../state/hubKiosks.svelte';
	import { minigame5 } from '../../state/minigame5.svelte';
	import { missions } from '../../state/missions.svelte';
	import { npcs } from '../../state/npcs.svelte';
	import { race } from '../../state/race.svelte';
	import { ride } from '../../state/ride.svelte';
	import { sceneState } from '../../state/sceneState.svelte';

	const kiosk = $derived(sceneState.inHub ? hubKiosks.nearby : null);

	// The kiosk never competes with a cat, an NPC, the jukebox or a vehicle.
	const blocked = $derived(
		missions.nearestCatId !== null ||
			npcs.canInteract ||
			npcs.dialogOpen ||
			clubMusic.nearby ||
			chat.isOpen ||
			cars.isDriving ||
			balloon.isOccupant ||
			ride.isRiding ||
			race.inCar ||
			minigame5.isDriving ||
			hubKiosks.panelOpen
	);

	const visible = $derived(kiosk !== null && !blocked);

	function isEditableTarget(target: EventTarget | null): boolean {
		return (
			target instanceof HTMLElement &&
			target.closest('input, textarea, select, [contenteditable="true"]') !== null
		);
	}

	function openKiosk(): void {
		const target = kiosk;

		if (!target || blocked) {
			return;
		}

		hubKiosks.open(target.id);
	}

	$effect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.code !== 'KeyE' || event.repeat || event.defaultPrevented) {
				return;
			}

			if (event.ctrlKey || event.metaKey || event.altKey) {
				return;
			}

			if (isEditableTarget(event.target) || !visible || !kiosk) {
				return;
			}

			event.preventDefault();
			openKiosk();
		};

		window.addEventListener('keydown', onKeyDown);

		return () => window.removeEventListener('keydown', onKeyDown);
	});
</script>

{#if visible && kiosk}
	{@const Icon = kiosk.id === 'shop' ? ShoppingBag : Map}
	<div
		id="kiosk-prompt"
		class="kiosk-prompt pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-3"
	>
		<div
			class="pointer-events-auto flex max-w-full items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/85 px-4 py-2.5 text-slate-100 shadow-2xl backdrop-blur-md"
		>
			<span
				class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
				style:background-color={kiosk.color + '22'}
				style:color={kiosk.color}
				aria-hidden="true"
			>
				<Icon size={18} strokeWidth={2} />
			</span>

			<div class="min-w-0" aria-live="polite">
				<p class="text-[10px] font-semibold tracking-[0.3em] uppercase" style:color={kiosk.color}>
					{kiosk.name} · nearby
				</p>
				<p class="truncate text-sm font-bold">{kiosk.hint}</p>
				<p class="text-[11px] text-slate-400">
					Press
					<kbd class="rounded border border-white/20 bg-white/10 px-1 font-mono text-[10px]">E</kbd>
					{kiosk.prompt}
				</p>
			</div>

			<button
				type="button"
				onclick={openKiosk}
				class="min-h-11 shrink-0 rounded-xl px-4 py-2 text-xs font-bold text-slate-950 transition hover:brightness-110 active:scale-95"
				style:background-color={kiosk.color}
			>
				{kiosk.action}
			</button>
		</div>
	</div>
{/if}

<style>
	/* Touch controls take up the bottom strip; raise the prompt above them. */
	:global(html.touch-controls-active) .kiosk-prompt {
		bottom: 11rem;
	}
</style>
