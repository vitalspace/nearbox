<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import type { Mesh } from 'three';
	import { minigame8 } from '../../state/minigame8.svelte';
	import { royaleStormAt } from '../../state/royaleConfig';

	// Círculos suavizados: el snapshot manda el reloj y la semilla, y el
	// cliente recalcula el mismo `royaleStormAt` que el servidor cada frame.
	let wall = $state<Mesh>();
	let currentRing = $state<Mesh>();
	let nextRing = $state<Mesh>();

	useTask(() => {
		const snapshot = minigame8.snapshot;

		if (!snapshot || snapshot.phase !== 'playing' || snapshot.matchStartedAt === null) {
			return;
		}

		const storm = royaleStormAt(snapshot.matchStartedAt, minigame8.serverNow(), snapshot.seed);

		if (wall) {
			wall.position.set(storm.cx, 90, storm.cz);
			wall.scale.set(storm.radius, 180, storm.radius);
		}

		if (currentRing) {
			currentRing.position.set(storm.cx, 1.5, storm.cz);
			currentRing.scale.setScalar(storm.radius);
		}

		if (nextRing) {
			nextRing.position.set(storm.nextCx, 1.6, storm.nextCz);
			nextRing.scale.setScalar(storm.nextRadius);
		}
	});
</script>

{#if minigame8.snapshot?.phase === 'playing'}
	<T.Mesh bind:ref={wall} renderOrder={2}>
		<T.CylinderGeometry args={[1, 1, 1, 96, 1, true]} />
		<T.MeshBasicMaterial
			color={0x38bdf8}
			transparent
			opacity={0.1}
			side={2}
			depthWrite={false}
			toneMapped={false}
		/>
	</T.Mesh>

	<T.Mesh bind:ref={currentRing} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
		<T.RingGeometry args={[0.988, 1, 160]} />
		<T.MeshBasicMaterial
			color={0x38bdf8}
			transparent
			opacity={0.9}
			side={2}
			depthWrite={false}
			toneMapped={false}
		/>
	</T.Mesh>

	<T.Mesh bind:ref={nextRing} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
		<T.RingGeometry args={[0.99, 1, 160]} />
		<T.MeshBasicMaterial
			color={0xfbbf24}
			transparent
			opacity={0.6}
			side={2}
			depthWrite={false}
			toneMapped={false}
		/>
	</T.Mesh>
{/if}
