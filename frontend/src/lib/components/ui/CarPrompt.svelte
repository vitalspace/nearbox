<script lang="ts">
	import { balloon } from '../../state/balloon.svelte';
	import { cars } from '../../state/cars.svelte';
	import { checkpoints } from '../../state/checkpoints.svelte';
	import { chat } from '../../state/chat.svelte';
	import { clubMusic } from '../../state/clubMusic.svelte';
	import { missions } from '../../state/missions.svelte';
	import { npcs } from '../../state/npcs.svelte';
	import { ride } from '../../state/ride.svelte';
	import { sceneState } from '../../state/sceneState.svelte';

	const car = $derived(cars.nearestAvailable);
	const interactionBlocked = $derived(
		chat.isOpen ||
			npcs.canInteract ||
			npcs.dialogOpen ||
			checkpoints.active !== null ||
			missions.nearestCatId !== null ||
			clubMusic.nearby
	);
	const showBalloon = $derived(
		sceneState.inHub &&
			!cars.isDriving &&
			!balloon.isOccupant &&
			(balloon.nearest || balloon.entryHint !== null)
	);
	const showRide = $derived(
		sceneState.inHub &&
			!cars.isDriving &&
			!balloon.isOccupant &&
			!ride.isRiding &&
			ride.canRide &&
			car === null &&
			!balloon.nearest &&
			!interactionBlocked
	);
	const visible = $derived(
		sceneState.inHub &&
			(ride.isRiding ||
				balloon.isOccupant ||
				showBalloon ||
				showRide ||
				(!cars.isDriving && (car !== null || cars.entryHint !== null)))
	);
	const boardingAsGunner = $derived(balloon.driverId !== null);
	const nextSeatLabel = $derived(
		balloon.nextSeat === 'pilot'
			? 'take the helm'
			: balloon.nextSeat
				? `man the ${balloon.nextSeat} cannon`
				: ''
	);
</script>

{#if visible}
	<div
		class="car-prompt pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-3"
	>
		{#if balloon.isDriving}
			<div
				class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full border border-amber-300/25 bg-slate-950/85 px-4 py-2 text-sm text-slate-100 shadow-2xl backdrop-blur-md"
				aria-live="polite"
			>
				<span class="font-semibold text-amber-100">Flying the balloon</span>
				<span
					><kbd class="car-key-hint">W/S</kbd> move · <kbd class="car-key-hint">A/D</kbd> turn</span
				>
				<span
					><kbd class="car-key-hint">Space</kbd> ascend · <kbd class="car-key-hint">Shift</kbd> descend</span
				>
				<span
					><kbd class="car-key-hint">Drag</kbd> aim (up/down = elevation) ·
					<kbd class="car-key-hint">Click/F</kbd> front cannon</span
				>
				<span
					><kbd class="car-key-hint">V</kbd>/<kbd class="car-key-hint">Wheel</kbd>
					{balloon.viewLabel}</span
				>
				{#if balloon.nextSeat}
					<span><kbd class="car-key-hint">Q</kbd> {nextSeatLabel}</span>
				{/if}
				<span><kbd class="car-key-hint">E</kbd> land &amp; exit</span>
			</div>
		{:else if balloon.isGunner}
			<div
				class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full border border-amber-300/25 bg-slate-950/85 px-4 py-2 text-sm text-slate-100 shadow-2xl backdrop-blur-md"
				aria-live="polite"
			>
				<span class="font-semibold text-amber-100">
					{balloon.selfSeat === 'left' ? 'Left' : 'Right'} cannon
				</span>
				<span
					><kbd class="car-key-hint">Drag</kbd> aim (up/down = elevation) ·
					<kbd class="car-key-hint">Click/F</kbd> fire paper</span
				>
				<span
					><kbd class="car-key-hint">V</kbd>/<kbd class="car-key-hint">Wheel</kbd>
					{balloon.viewLabel}</span
				>
				{#if balloon.nextSeat}
					<span><kbd class="car-key-hint">Q</kbd> {nextSeatLabel}</span>
				{/if}
				<span><kbd class="car-key-hint">E</kbd> exit</span>
			</div>
		{:else if ride.isRiding && ride.tuning}
			<div
				class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full border border-cyan-300/25 bg-slate-950/85 px-4 py-2 text-sm text-slate-100 shadow-2xl backdrop-blur-md"
				aria-live="polite"
			>
				<span class="font-semibold text-cyan-100">Riding {ride.tuning.name}</span>
				<span class="font-mono text-xs text-cyan-200">{Math.round(ride.speed * 3.6)} km/h</span>
				<span
					><kbd class="car-key-hint">W/S</kbd> accelerate / reverse ·
					<kbd class="car-key-hint">A/D</kbd> steer</span
				>
				<span
					><kbd class="car-key-hint">Space</kbd> brake · <kbd class="car-key-hint">E</kbd> dismount</span
				>
			</div>
		{:else if showBalloon}
			<div
				class="flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/85 px-4 py-2 text-sm text-slate-100 shadow-2xl backdrop-blur-md"
				aria-live="polite"
			>
				<kbd
					class="car-key-hint rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[11px]"
					>E</kbd
				>
				<span>
					{boardingAsGunner ? 'Board as gunner' : 'Pilot'}
					the <strong class="font-semibold">Hot-Air Balloon</strong>
				</span>
			</div>
		{:else if car}
			<div
				class="flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/85 px-4 py-2 text-sm text-slate-100 shadow-2xl backdrop-blur-md"
				aria-live="polite"
			>
				<kbd
					class="car-key-hint rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[11px]"
					>E</kbd
				>
				<span>Drive <strong class="font-semibold">{car.name}</strong></span>
			</div>
		{:else if showRide && ride.equipped}
			<div
				class="flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/85 px-4 py-2 text-sm text-slate-100 shadow-2xl backdrop-blur-md"
				aria-live="polite"
			>
				<kbd
					class="car-key-hint rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[11px]"
					>E</kbd
				>
				<span>Ride the <strong class="font-semibold">{ride.equipped.name}</strong></span>
				<span class="text-[11px] text-slate-400">W/S · A/D · Space brake</span>
			</div>
		{:else if balloon.entryHint}
			<div
				class="rounded-full border border-amber-300/25 bg-slate-950/90 px-4 py-2 text-sm text-amber-100 shadow-2xl backdrop-blur-md"
				aria-live="polite"
			>
				{balloon.entryHint}
			</div>
		{:else if cars.entryHint}
			<div
				class="rounded-full border border-amber-300/25 bg-slate-950/90 px-4 py-2 text-sm text-amber-100 shadow-2xl backdrop-blur-md"
				aria-live="polite"
			>
				{cars.entryHint}
			</div>
		{/if}
	</div>
{/if}

<style>
	.car-key-hint {
		border-radius: 0.25rem;
		border: 1px solid rgb(255 255 255 / 0.2);
		background: rgb(255 255 255 / 0.1);
		padding: 0.1rem 0.35rem;
		font-family: ui-monospace, monospace;
		font-size: 11px;
	}

	/* Touch controls take up the bottom strip; we raise the prompt. */
	:global(html.touch-controls-active) .car-prompt {
		bottom: 11rem;
	}

	/* On mobile you enter with the touch button, not the E key. */
	:global(html.touch-controls-active) .car-key-hint {
		display: none;
	}
</style>
