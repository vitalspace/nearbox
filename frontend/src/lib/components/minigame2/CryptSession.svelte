<script lang="ts">
	import { useTask } from '@threlte/core';
	import { lobby } from '../../state/lobby.svelte';
	import { minigame2 } from '../../state/minigame2.svelte';
	import { playerState } from '../../state/playerState';

	// Reports the position at 10 Hz while the crypt is mounted. It waits for
	// `PlayerCollider` to apply the authoritative spawn from the first snapshot.
	const INTERVAL = 0.1;
	let accumulator = 0;

	useTask((delta) => {
		accumulator += delta;

		if (accumulator < INTERVAL) return;

		accumulator = 0;

		if (!minigame2.positionReady || !minigame2.self) return;

		// `facingYaw` is the avatar's facing direction, not the camera orbit.
		// Sending `cameraYaw` left every remote player looking in a fixed
		// direction while walking with WASD.
		lobby.sendMg2Position(playerState.x, playerState.y, playerState.z, playerState.facingYaw);

		// The designated mummy driver also reports its physics simulation
		// (the server validates it and relays it to everyone else).
		lobby.sendMg2Mummies(minigame2.mummiesToReport());
	});
</script>
