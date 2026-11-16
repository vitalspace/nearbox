<script lang="ts">
	import { chat } from '../../state/chat.svelte';
	import { crosshair } from '../../state/crosshair.svelte';
	import { minigame5 } from '../../state/minigame5.svelte';
	import { minigame6 } from '../../state/minigame6.svelte';
	import { minigame8 } from '../../state/minigame8.svelte';
	import { royaleEffects } from '../../state/royaleEffects.svelte';
	import { sceneState } from '../../state/sceneState.svelte';
	import { waveEffects } from '../../state/waveEffects.svelte';

	/**
	 * Aiming reticle for the combat minigames.
	 *
	 * Replaces the old dot + circle: four ticks leave a clean gap around the
	 * centre dot so the player can actually see what is under the sight, and
	 * the whole reticle turns amber when an enemy is inside the aim-assist
	 * capsule. The hit marker is a short diagonal cross that fades out.
	 */
	let { mode }: { mode: 'waves' | 'deathmatch' | 'royale' } = $props();

	const visible = $derived.by(() => {
		if (mode === 'waves') {
			return (
				sceneState.inWaves &&
				minigame5.phase === 'playing' &&
				!minigame5.isDowned &&
				!minigame5.isDriving &&
				!chat.isOpen
			);
		}

		if (mode === 'royale') {
			return (
				sceneState.inRoyale &&
				minigame8.phase === 'playing' &&
				minigame8.isAlive &&
				!minigame8.riding &&
				// El coche se conduce a la vista del jugador: una retícula fija
				// en el centro estorba y no apunta a nada útil. El globo sí la
				// conserva porque se dispara apuntando con la cámara.
				!(minigame8.isDriving && minigame8.drivingKind === 'car') &&
				!chat.isOpen
			);
		}

		return (
			sceneState.inDeathmatch && minigame6.phase === 'playing' && minigame6.isAlive && !chat.isOpen
		);
	});

	/** Changes on every confirmed hit; used as a key to replay the marker. */
	const hitAt = $derived.by(() => {
		if (mode === 'waves') return waveEffects.hitAt;
		if (mode === 'royale') return royaleEffects.hitAt;
		return minigame6.lastHitAt;
	});
	const tint = $derived(crosshair.hasTarget ? '#fbbf24' : '#f8fafc');
	const shadow = $derived(crosshair.hasTarget ? 'rgba(120, 53, 15, 0.9)' : 'rgba(2, 6, 23, 0.9)');

	// The browser arrow on top of a reticle reads as two cursors at once.
	// A body class lets the `:global` rule below hide it while aiming.
	$effect(() => {
		if (!visible) return;

		document.body.classList.add('combat-aiming');

		return () => document.body.classList.remove('combat-aiming');
	});
</script>

{#if visible}
	<div class="pointer-events-none fixed inset-0 z-40 select-none" aria-hidden="true">
		<div class="absolute top-1/2 left-1/2 h-[52px] w-[52px] -translate-x-1/2 -translate-y-1/2">
			<svg viewBox="0 0 52 52" class="h-full w-full overflow-visible">
				<!-- Soft dark backing: the reticle stays readable over bright sky. -->
				<g
					stroke={shadow}
					stroke-width="4.5"
					stroke-linecap="round"
					stroke-opacity="0.62"
					fill="none"
				>
					<line x1="26" y1="8" x2="26" y2="18" />
					<line x1="26" y1="34" x2="26" y2="44" />
					<line x1="8" y1="26" x2="18" y2="26" />
					<line x1="34" y1="26" x2="44" y2="26" />
				</g>

				{#if crosshair.hasTarget}
					<circle
						cx="26"
						cy="26"
						r="12"
						fill="none"
						stroke={tint}
						stroke-width="1"
						stroke-opacity="0.45"
						stroke-dasharray="2.5 4.5"
					/>
				{/if}

				<g stroke={tint} stroke-width="2" stroke-linecap="round" fill="none">
					<line x1="26" y1="8" x2="26" y2="18" />
					<line x1="26" y1="34" x2="26" y2="44" />
					<line x1="8" y1="26" x2="18" y2="26" />
					<line x1="34" y1="26" x2="44" y2="26" />
				</g>

				<circle cx="26" cy="26" r="1.7" fill={tint} />
			</svg>

			{#if hitAt > 0}
				{#key hitAt}
					<svg viewBox="0 0 52 52" class="hit-marker h-full w-full overflow-visible">
						<g
							stroke="#6ee7b7"
							stroke-width="2.4"
							stroke-linecap="round"
							stroke-opacity="0.95"
							fill="none"
						>
							<line x1="16" y1="16" x2="21" y2="21" />
							<line x1="36" y1="16" x2="31" y2="21" />
							<line x1="16" y1="36" x2="21" y2="31" />
							<line x1="36" y1="36" x2="31" y2="31" />
						</g>
					</svg>
				{/key}
			{/if}
		</div>
	</div>
{/if}

<style>
	.hit-marker {
		position: absolute;
		inset: 0;
		transform-origin: 50% 50%;
		animation: reticle-hit 260ms cubic-bezier(0.22, 0.9, 0.3, 1) forwards;
	}

	@keyframes reticle-hit {
		0% {
			opacity: 0;
			transform: scale(1.45);
		}

		28% {
			opacity: 1;
		}

		100% {
			opacity: 0;
			transform: scale(0.92);
		}
	}

	:global(body.combat-aiming canvas) {
		cursor: none !important;
	}
</style>
