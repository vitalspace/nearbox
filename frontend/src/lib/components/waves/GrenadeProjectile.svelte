<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { AdditiveBlending, type Group } from 'three';

	interface Props {
		x: number;
		y: number;
		z: number;
	}

	let { x, y, z }: Props = $props();

	let group = $state<Group>();
	let elapsed = Math.random() * 10;

	useTask((delta) => {
		elapsed += delta;

		if (group) {
			// Spin the body and jitter the fuse light.
			group.rotation.y = elapsed * 5;
			group.rotation.x = Math.sin(elapsed * 4) * 0.35;
			group.scale.setScalar(1 + Math.sin(elapsed * 18) * 0.04);
		}
	});
</script>

<T.Group bind:ref={group} position={[x, y, z]}>
	<!-- Body -->
	<T.Mesh>
		<T.SphereGeometry args={[0.13, 12, 10]} />
		<T.MeshStandardMaterial color={0x27272a} metalness={0.6} roughness={0.35} />
	</T.Mesh>

	<!-- Emissive band -->
	<T.Mesh rotation={[Math.PI / 2, 0, 0]}>
		<T.TorusGeometry args={[0.135, 0.018, 8, 20]} />
		<T.MeshBasicMaterial color={0xf97316} toneMapped={false} />
	</T.Mesh>

	<!-- Fuse glow -->
	<T.Mesh position={[0, 0.15, 0]}>
		<T.SphereGeometry args={[0.055, 8, 6]} />
		<T.MeshBasicMaterial
			color={0xfde68a}
			transparent
			opacity={0.9}
			depthWrite={false}
			blending={AdditiveBlending}
		/>
	</T.Mesh>

	<!-- Soft halo -->
	<T.Mesh>
		<T.SphereGeometry args={[0.24, 10, 8]} />
		<T.MeshBasicMaterial
			color={0xfb923c}
			transparent
			opacity={0.2}
			depthWrite={false}
			blending={AdditiveBlending}
		/>
	</T.Mesh>
</T.Group>
