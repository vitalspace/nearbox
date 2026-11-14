<script lang="ts">
	import { T } from '@threlte/core';
	import { Collider, CollisionGroups } from '@threlte/rapier';
	import { TRACK_CENTER } from '../../state/raceConfig';

	const RADIUS = 86.6;
	const SEGMENTS = 32;
	const HEIGHT = 1.0;
	const THICKNESS = 0.4;

	const segments = Array.from({ length: SEGMENTS }, (_, index) => {
		const angle = ((index + 0.5) / SEGMENTS) * Math.PI * 2;
		const length = (Math.PI * RADIUS) / SEGMENTS + 0.2;

		return {
			index,
			x: TRACK_CENTER.x + RADIUS * Math.cos(angle),
			z: TRACK_CENTER.z + RADIUS * Math.sin(angle),
			angle,
			length
		};
	});
</script>

{#each segments as segment (segment.index)}
	<T.Group
		position={[segment.x, HEIGHT / 2, segment.z]}
		rotation={[0, -Math.PI / 2 - segment.angle, 0]}
	>
		<!--
			The guardrail shares the RACECAR group (bit 2) and also belongs to
			RACEGUARD (bit 3), so it collides with race cars but not with free
			cars (bit 1) or pedestrians (bit 0).
		-->
		<CollisionGroups groups={[2, 3]}>
			<Collider
				shape="cuboid"
				args={[segment.length / 2, HEIGHT / 2, THICKNESS / 2]}
				type="static"
			/>
		</CollisionGroups>
	</T.Group>
{/each}
