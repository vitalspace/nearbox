<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import type { PointLight } from 'three';

	// The crypt GLB has no lights. Without this layer it would look black, just
	// as happened with `map.glb` before `SPEC-009`.

	type ZoneLight = {
		position: [number, number, number];
		color: string;
		intensity: number;
		distance: number;
	};

	const ZONE_LIGHTS: ZoneLight[] = [
		{ position: [11.6, -4.8, 35.5], color: '#8fb2ff', intensity: 55, distance: 18 },
		{ position: [36.7, -4.8, 59.8], color: '#a9c6ff', intensity: 55, distance: 18 },
		{ position: [55.2, -4.8, 38.4], color: '#9db4ff', intensity: 55, distance: 20 },
		{ position: [36.7, -4.8, 19.9], color: '#b0c4ff', intensity: 55, distance: 18 },
		{ position: [36.7, -4.8, 37.8], color: '#ffd9a0', intensity: 50, distance: 22 }
	];

	const TOMB_LIGHT = { position: [36.68, -5.4, 40.3] as [number, number, number] };

	let tombLight = $state<PointLight>();
	let elapsed = 0;

	useTask((delta) => {
		elapsed += delta;

		if (tombLight) {
			tombLight.intensity =
				75 * (0.92 + Math.sin(elapsed * 2.1) * 0.05 + Math.sin(elapsed * 7.3) * 0.03);
		}
	});
</script>

<T.HemisphereLight args={['#6f86c8', '#1a1210', 0.55]} />
<T.AmbientLight intensity={0.16} />

{#each ZONE_LIGHTS as light}
	<T.PointLight
		position={light.position}
		color={light.color}
		intensity={light.intensity}
		distance={light.distance}
		decay={1.6}
	/>
{/each}

<T.PointLight
	bind:ref={tombLight}
	position={TOMB_LIGHT.position}
	color="#ffb45e"
	intensity={75}
	distance={14}
	decay={1.8}
/>
