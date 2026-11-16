<script lang="ts">
	import { useTask } from '@threlte/core';
	import { minigame8 } from '../../state/minigame8.svelte';
	import {
		ROYALE_BOARDING_MS,
		ROYALE_ZEPPELIN_PATH,
		ROYALE_ZEPPELIN_SCALE,
		ROYALE_ZEPPELIN_SPEED
	} from '../../state/royaleConfig';
	import Zeppelin from '../world/Zeppelin.svelte';

	// Durante la cuenta atrás el zepelín espera en el primer waypoint (los
	// asientos del servidor también están ahí) y despega al empezar `playing`.
	// `boardingStartedAt` aún es null en `countdown`, así que se usa el final
	// de la cuenta atrás como origen del mismo reloj.
	const startedAt = $derived(
		minigame8.snapshot?.boardingStartedAt ?? minigame8.snapshot?.countdownEndsAt ?? 0
	);

	// `serverNow()` no es reactivo: la visibilidad necesita un reloj que avance
	// o el zepelín se quedaba en el último waypoint para siempre.
	let now = $state(0);
	let accumulator = 0;

	useTask((delta) => {
		accumulator += delta;

		if (accumulator < 0.25) return;

		accumulator = 0;
		now = minigame8.serverNow();
	});

	const visible = $derived(
		(minigame8.phase === 'playing' || minigame8.phase === 'countdown') &&
			startedAt > 0 &&
			now - startedAt <= ROYALE_BOARDING_MS + 500
	);

	function elapsed(): number {
		if (!startedAt) return 0;
		return Math.max(0, minigame8.serverNow() - startedAt);
	}
</script>

{#if visible}
	<Zeppelin
		path={ROYALE_ZEPPELIN_PATH}
		pathElapsed={elapsed}
		pathSpeed={ROYALE_ZEPPELIN_SPEED}
		scale={ROYALE_ZEPPELIN_SCALE}
	/>
{/if}
