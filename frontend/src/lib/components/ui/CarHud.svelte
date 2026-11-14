<script lang="ts">
	import { onMount } from 'svelte';
	import { cars } from '../../state/cars.svelte';
	import { sceneState } from '../../state/sceneState.svelte';

	let now = $state(Date.now());

	onMount(() => {
		const timer = setInterval(() => {
			now = Date.now();
		}, 250);

		return () => clearInterval(timer);
	});

	const activeCar = $derived(
		cars.selfCar ?? (cars.lastDestroyedId ? (cars.cars[cars.lastDestroyedId] ?? null) : null)
	);
	const visible = $derived(sceneState.inHub && (cars.isDriving || cars.lastDestroyedId !== null));
	const destroyed = $derived(
		activeCar?.status === 'destroyed' || activeCar?.status === 'respawning'
	);
	const speedKmh = $derived(Math.round((activeCar?.speed ?? 0) * 3.6));
	const health = $derived(activeCar?.health ?? 0);
	const maxHealth = $derived(activeCar?.maxHealth ?? 100);
	const healthPct = $derived(
		maxHealth > 0 ? Math.max(0, Math.min(100, (health / maxHealth) * 100)) : 0
	);
	const respawnSeconds = $derived(
		activeCar?.respawnAt ? Math.max(0, Math.ceil((activeCar.respawnAt - now) / 1000)) : 0
	);
	/** True while the reported up vector points sideways or down. */
	const flipped = $derived.by(() => {
		const rotation = activeCar?.rotation;

		if (!rotation || destroyed) {
			return false;
		}

		// y component of (0, 1, 0) rotated by the reported quaternion.
		const upY = 1 - 2 * (rotation.x * rotation.x + rotation.z * rotation.z);

		// Matches `FLIP_UP_THRESHOLD` in `VehiclePhysics`.
		return upY < 0.5;
	});

	// While the car HUD is visible on touch devices, the mission HUD is
	// hidden so they don't overlap in the top strip.
	$effect(() => {
		const active = visible && activeCar !== null;

		document.documentElement.classList.toggle('car-hud-active', active);

		return () => document.documentElement.classList.remove('car-hud-active');
	});
</script>

{#if visible && activeCar}
	<div
		class="car-hud pointer-events-none fixed bottom-6 left-1/2 z-30 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2"
	>
		<!-- Desktop: full panel. -->
		<div
			class="car-hud-desktop rounded-2xl border border-white/10 bg-slate-950/85 p-3 text-slate-100 shadow-2xl backdrop-blur-md"
		>
			<div class="flex items-baseline justify-between gap-3">
				<p class="truncate text-sm font-semibold">{activeCar.name}</p>
				{#if destroyed}
					<span class="text-xs font-medium text-rose-300">Destroyed</span>
				{:else}
					<span class="font-mono text-lg leading-none font-semibold tabular-nums"
						>{speedKmh}<span class="ml-1 text-[10px] font-normal text-slate-400">km/h</span></span
					>
				{/if}
			</div>

			<div class="mt-2 h-2 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
				<div
					class="h-full rounded-full transition-[width] duration-150 {healthPct > 50
						? 'bg-emerald-400'
						: healthPct > 25
							? 'bg-amber-400'
							: 'bg-rose-400'}"
					style:width={`${healthPct}%`}
				></div>
			</div>

			<div class="mt-2 flex items-center justify-between gap-3 text-[11px] text-slate-400">
				{#if destroyed}
					<span aria-live="polite">
						{#if respawnSeconds > 0}
							Respawning in {respawnSeconds}s
						{:else}
							Respawning…
						{/if}
					</span>
				{:else}
					<span>Health {health}/{maxHealth}</span>
					<span class="car-exit-hint flex items-center gap-1">
						<kbd class="rounded border border-white/20 bg-white/10 px-1 font-mono text-[10px]"
							>E</kbd
						>
						Exit
					</span>
				{/if}
			</div>

			{#if flipped}
				<button
					type="button"
					class="pointer-events-auto mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-amber-300/40 bg-amber-400/15 px-2 py-1.5 text-[11px] font-semibold tracking-wide text-amber-200 uppercase transition hover:bg-amber-400/25 active:scale-[0.99]"
					onclick={() => cars.requestFlip()}
				>
					Flipped — flip car
					<kbd class="rounded border border-amber-200/40 bg-amber-950/40 px-1 font-mono text-[10px]"
						>R</kbd
					>
				</button>
			{/if}
		</div>

		<!-- Touch: compact pill in the top strip. -->
		<div
			class="car-hud-touch items-center gap-2 rounded-full border border-white/10 bg-slate-950/80 px-3 py-1.5 text-slate-100 shadow-2xl backdrop-blur-md"
		>
			{#if destroyed}
				<span class="max-w-24 truncate text-[10px] font-semibold text-rose-300">
					{activeCar.name}
				</span>
				<span class="font-mono text-[11px] text-slate-300" aria-live="polite">
					{#if respawnSeconds > 0}
						{respawnSeconds}s
					{:else}
						…
					{/if}
				</span>
			{:else}
				<span class="font-mono text-base leading-none font-semibold tabular-nums">
					{speedKmh}
				</span>
				<span class="text-[9px] leading-none font-medium text-slate-400">km/h</span>
				<span class="h-3 w-px bg-white/15" aria-hidden="true"></span>
				<div class="h-1.5 w-14 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
					<div
						class="h-full rounded-full transition-[width] duration-150 {healthPct > 50
							? 'bg-emerald-400'
							: healthPct > 25
								? 'bg-amber-400'
								: 'bg-rose-400'}"
						style:width={`${healthPct}%`}
					></div>
				</div>
				<span class="sr-only">Health {health} of {maxHealth}</span>
			{/if}
		</div>
	</div>
{/if}

<style>
	.car-hud-touch {
		display: none;
	}

	/* On touch the HUD becomes a small pill at the top, out of the way of the
	   controls and the play area. */
	:global(html.touch-controls-active) .car-hud {
		top: max(0.75rem, env(safe-area-inset-top));
		bottom: auto;
		width: auto;
		max-width: calc(100vw - 7rem);
		z-index: 45;
	}

	:global(html.touch-controls-active) .car-hud-desktop {
		display: none;
	}

	:global(html.touch-controls-active) .car-hud-touch {
		display: flex;
	}

	/* While typing, the chat fills the top strip: the car HUD gets out of the
	   way so they don't overlap. */
	:global(html.touch-controls-active.chat-open) .car-hud {
		display: none;
	}

	/* On mobile you exit with the touch button, not the E key. */
	:global(html.touch-controls-active) .car-exit-hint {
		display: none;
	}
</style>
