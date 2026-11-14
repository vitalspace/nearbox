<script lang="ts">
	import { useTask } from '@threlte/core';
	import { dmEffects } from '../../state/dmEffects.svelte';
	import { dmHud } from '../../state/dmHud.svelte';
	import { dmInput } from '../../state/dmInput';
	import { minigame6 } from '../../state/minigame6.svelte';
	import { playerState } from '../../state/playerState';
	import { preloadCombatModels } from '../player/weaponModels';

	// Carga armas y consumibles durante la cuenta atrás.
	$effect(() => {
		preloadCombatModels();
	});

	// Report the local position to the authoritative engine at 10 Hz.
	const INTERVAL = 0.1;
	let accumulator = 0;

	useTask((delta) => {
		accumulator += delta;

		if (accumulator < INTERVAL) {
			return;
		}

		accumulator = 0;

		if (!minigame6.self) {
			return;
		}

		minigame6.sendPosition(playerState.x, playerState.y, playerState.z, playerState.facingYaw);
	});

	// Leaving the arena unmounts this component: drop tracers, flash markers
	// and pending input so they do not leak into the next match.
	$effect(() => {
		return () => {
			dmEffects.reset();
			dmInput.reset();
			dmHud.reset();
		};
	});
</script>
