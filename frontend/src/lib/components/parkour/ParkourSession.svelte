<script lang="ts">
	import { useTask } from '@threlte/core';
	import { minigame7 } from '../../state/minigame7.svelte';
	import { playerState } from '../../state/playerState';

	// Report the local position at 10 Hz while the race is running. The server
	// validates phase, bounds, step size and rate; the client never sends
	// checkpoints, falls or impacts.
	const INTERVAL = 0.1;
	let accumulator = 0;

	useTask((delta) => {
		accumulator += delta;

		if (accumulator < INTERVAL) {
			return;
		}

		accumulator = 0;

		const self = minigame7.self;

		if (!self || minigame7.phase !== 'playing' || self.finishedAt !== null) {
			return;
		}

		minigame7.sendPosition(playerState.x, playerState.y, playerState.z, playerState.facingYaw);
	});
</script>
