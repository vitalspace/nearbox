<script lang="ts">
	import { useTask } from '@threlte/core';
	import { minigame5 } from '../../state/minigame5.svelte';
	import WaveSpawnPortal from './WaveSpawnPortal.svelte';

	type Portal = {
		id: string;
		x: number;
		z: number;
		born: number;
		die: number;
	};

	const PORTAL_MS = 1000;

	let portals = $state.raw<Portal[]>([]);
	let portalSeq = 0;
	let lastSeq = 0;

	useTask(() => {
		const now = Date.now();

		for (const event of minigame5.events) {
			if (event.seq <= lastSeq) {
				continue;
			}

			lastSeq = event.seq;

			if (event.kind === 'monster-spawned' && event.x !== undefined && event.z !== undefined) {
				portalSeq += 1;
				portals = [
					...portals,
					{
						id: `portal-${portalSeq}`,
						x: event.x,
						z: event.z,
						born: now,
						die: now + PORTAL_MS
					}
				];
			}
		}

		portals = portals.filter((portal) => portal.die > now);
	});
</script>

{#each portals as portal (portal.id)}
	<WaveSpawnPortal x={portal.x} z={portal.z} born={portal.born} die={portal.die} />
{/each}
