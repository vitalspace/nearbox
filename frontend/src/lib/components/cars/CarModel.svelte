<script lang="ts">
	import { T } from '@threlte/core';
	import { useDraco, useGltf } from '@threlte/extras';
	import { untrack } from 'svelte';
	import type { Group, Object3D } from 'three';
	import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
	import { asset } from '../../assets/path';
	import { MODEL_GROUND_OFFSET } from '../../state/carConfig';

	type Props = {
		modelUrl: string;
		visible?: boolean;
		root?: Group;
	};

	let { modelUrl, visible = true, root = $bindable() }: Props = $props();

	// The URL is fixed per instance: it is captured once on purpose.
	const gltf = useGltf(
		untrack(() => modelUrl),
		{
			dracoLoader: useDraco(asset('draco/'))
		}
	);

	let source: Object3D | null = null;
	let prepared: Object3D | null = null;

	/**
	 * Clones the GLB only once per model. The `*_Root` root comes with +90° on Y:
	 * it is neutralized so the nose ends up on +X, the forward axis of the
	 * Rapier vehicle controller.
	 */
	function prepare(scene: Object3D): Object3D {
		if (source === scene && prepared) {
			return prepared;
		}

		source = scene;
		const clone = cloneSkeleton(scene);

		clone.traverse((child) => {
			if (child.name.endsWith('_Root')) {
				child.rotation.set(0, 0, 0);
				child.updateMatrix();
			}

			const mesh = child as Object3D & {
				isMesh?: boolean;
				castShadow?: boolean;
				receiveShadow?: boolean;
			};

			if (mesh.isMesh) {
				mesh.castShadow = true;
				mesh.receiveShadow = true;
			}
		});

		prepared = clone;
		return clone;
	}
</script>

{#await gltf}
	<!-- Nothing is drawn while loading: the chassis is already in the scene. -->
{:then loaded}
	<T.Group bind:ref={root} position={[0, MODEL_GROUND_OFFSET, 0]} {visible}>
		<T is={prepare(loaded.scene)} dispose={false} />
	</T.Group>
{/await}
