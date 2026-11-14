<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import type { Group } from 'three';

	interface Props {
		x: number;
		z: number;
		born: number;
		die: number;
	}

	let { x, z, born, die }: Props = $props();

	let group = $state<Group | undefined>();

	useTask(() => {
		if (!group) {
			return;
		}

		const now = Date.now();
		const life = Math.min(1, Math.max(0, (now - born) / Math.max(1, die - born)));

		group.scale.setScalar(0.6 + life * 0.9);
		group.rotation.y = now * 0.004;
	});
</script>

<T.Group position={[x, 0.42, z]} bind:ref={group}>
	<T.Mesh rotation={[-Math.PI / 2, 0, 0]}>
		<T.RingGeometry args={[0.7, 1.15, 24]} />
		<T.MeshBasicMaterial
			color={0xc084fc}
			transparent
			opacity={0.85}
			blending={2}
			depthWrite={false}
			side={2}
		/>
	</T.Mesh>
	<T.Mesh position={[0, 1.6, 0]}>
		<T.CylinderGeometry args={[0.75, 0.95, 3.2, 16, 1, true]} />
		<T.MeshBasicMaterial
			color={0xa855f7}
			transparent
			opacity={0.28}
			blending={2}
			depthWrite={false}
			side={2}
		/>
	</T.Mesh>
</T.Group>
