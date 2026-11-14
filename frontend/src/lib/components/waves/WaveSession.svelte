<script lang="ts">
	import { useTask } from '@threlte/core';
	import { minigame5 } from '../../state/minigame5.svelte';
	import { playerState } from '../../state/playerState';
	import { waveEffects } from '../../state/waveEffects.svelte';
	import { preloadCombatModels } from '../player/weaponModels';

	// Carga armas y consumibles mientras se juega la cuenta atrás.
	$effect(() => {
		preloadCombatModels();
	});

	// Reporta la posición a 10 Hz mientras la arena está montada.
	const INTERVAL = 0.1;
	let accumulator = 0;

	useTask((delta) => {
		accumulator += delta;

		if (accumulator < INTERVAL) {
			return;
		}

		accumulator = 0;

		if (!minigame5.self) {
			return;
		}

		minigame5.sendPosition(playerState.x, playerState.y, playerState.z, playerState.facingYaw);
	});

	// Leaving the arena unmounts this component: drop any leftover tracers
	// (and the hit marker) so they do not flash on the next entry.
	$effect(() => {
		return () => {
			waveEffects.reset();
		};
	});
</script>
