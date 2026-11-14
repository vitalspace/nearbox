<script lang="ts">
	import { useTask } from '@threlte/core';
	import { playerState } from '../../state/playerState';
	import { sceneState } from '../../state/sceneState.svelte';
	import { hubKiosks, VILLAGE_KIOSKS, type KioskId } from '../../state/hubKiosks.svelte';
	import KioskMarker from './KioskMarker.svelte';

	const SAMPLE_INTERVAL = 0.1;
	const NEARBY_HEIGHT = 2.5;

	let accumulator = 0;

	useTask((delta) => {
		accumulator += delta;

		if (accumulator < SAMPLE_INTERVAL) {
			return;
		}

		accumulator = 0;

		let nearest: KioskId | null = null;

		if (sceneState.inHub) {
			let bestDistance = Number.POSITIVE_INFINITY;

			for (const kiosk of VILLAGE_KIOSKS) {
				const dx = playerState.x - kiosk.position[0];
				const dz = playerState.z - kiosk.position[2];
				const dy = Math.abs(playerState.y - kiosk.position[1]);
				const distance = Math.hypot(dx, dz);

				if (distance <= kiosk.radius && dy <= NEARBY_HEIGHT && distance < bestDistance) {
					bestDistance = distance;
					nearest = kiosk.id;
				}
			}
		}

		if (nearest !== hubKiosks.nearbyId) {
			hubKiosks.setNearby(nearest);
		}
	});

	$effect(() => {
		return () => hubKiosks.reset();
	});
</script>

{#each VILLAGE_KIOSKS as kiosk (kiosk.id)}
	<KioskMarker {kiosk} active={hubKiosks.nearbyId === kiosk.id} />
{/each}
