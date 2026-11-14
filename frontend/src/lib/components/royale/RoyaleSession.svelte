<script lang="ts">
	import { useTask } from '@threlte/core';
	import { minigame8 } from '../../state/minigame8.svelte';
	import { playerState } from '../../state/playerState';
	import { royaleEffects } from '../../state/royaleEffects.svelte';
	import { royaleInput } from '../../state/royaleInput';
	import { preloadCombatModels } from '../player/weaponModels';

	// Las armas y consumibles se cargan durante la cuenta atrás.
	$effect(() => {
		preloadCombatModels();
	});

	// Reporte de posición a 10 Hz. Mientras el zepelín manda (riding) no se
	// envía nada: el servidor ignora al pasajero y calcula su asiento.
	const INTERVAL = 0.1;
	let accumulator = 0;

	useTask((delta) => {
		accumulator += delta;

		if (accumulator < INTERVAL) return;

		accumulator = 0;

		const self = minigame8.self;

		if (!self || !self.alive || minigame8.phase !== 'playing') return;
		if (royaleInput.mode === 'riding') return;

		minigame8.sendPosition(
			playerState.x,
			playerState.y,
			playerState.z,
			playerState.facingYaw,
			royaleInput.mode,
			royaleInput.vy
		);
	});

	// Al salir se limpian trazadoras, peticiones y el modo local para no
	// dejar estado colgando en la siguiente partida.
	$effect(() => {
		return () => {
			royaleEffects.reset();
			royaleInput.reset();
		};
	});
</script>
