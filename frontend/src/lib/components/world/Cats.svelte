<script lang="ts">
	import { useTask } from '@threlte/core';
	import {
		CAT_CAPTURE_HEIGHT,
		CAT_CAPTURE_RADIUS,
		CAT_DETECTION_INTERVAL_MS
	} from '../../missions/cats';
	import { missions } from '../../state/missions.svelte';
	import { playerRuntime, playerState } from '../../state/playerState';
	import { sceneState } from '../../state/sceneState.svelte';
	import Cat from './Cat.svelte';

	const visibleCats = $derived(missions.visibleCats);
	const captureRadiusSq = CAT_CAPTURE_RADIUS * CAT_CAPTURE_RADIUS;

	let lastCheckAt = 0;

	$effect(() => {
		return () => missions.setNearestCat(null);
	});

	useTask(() => {
		const now = Date.now();

		if (now - lastCheckAt < CAT_DETECTION_INTERVAL_MS) {
			return;
		}

		lastCheckAt = now;

		if (!sceneState.inGlobal || playerRuntime.frozen) {
			missions.setNearestCat(null);
			return;
		}

		let nearestId: string | null = null;
		let nearestDistance = captureRadiusSq;

		for (const cat of visibleCats) {
			const dy = playerState.y - cat.position.y;

			if (Math.abs(dy) > CAT_CAPTURE_HEIGHT) {
				continue;
			}

			const dx = playerState.x - cat.position.x;
			const dz = playerState.z - cat.position.z;
			const distance = dx * dx + dz * dz;

			if (distance <= nearestDistance) {
				nearestDistance = distance;
				nearestId = cat.id;
			}
		}

		missions.setNearestCat(nearestId);
	});
</script>

{#each visibleCats as cat (cat.id)}
	<Cat {cat} />
{/each}
