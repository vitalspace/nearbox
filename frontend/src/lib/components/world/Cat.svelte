<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { useDraco, useGltf } from '@threlte/extras';
	import { untrack } from 'svelte';
	import {
		Box3,
		Group,
		Vector3,
		type Material,
		type Mesh,
		type MeshStandardMaterial,
		type Object3D
	} from 'three';
	import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
	import type { CatDefinition } from '../../missions/cats';
	import { asset } from '../../assets/path';

	let { cat, yaw }: { cat: CatDefinition; yaw?: number } = $props();

	const PALETTE = ['#2b2b38', '#5b6470', '#8a5a2e', '#c2410c', '#d6d3d1', '#7c2d12'];
	const FUR_MATERIAL = 'WHH_Cat';
	const MODEL_SCALE = 1.15;

	// `useGltf` caches by URL: all 25 cats share a single GLB download.
	const gltf = useGltf(asset('props/gato.glb'), {
		dracoLoader: useDraco(asset('draco/'))
	});

	const variant = untrack(() => {
		const hash = [...cat.id].reduce((value, char) => value + char.charCodeAt(0), 0);

		return {
			fur: PALETTE[hash % PALETTE.length],
			phase: (hash % 100) / 100,
			yaw: ((hash % 4) * Math.PI) / 2
		};
	});

	const ownedMaterials: Material[] = [];
	let source: Object3D | null = null;
	let model: Object3D | null = null;

	/**
	 * Clones the GLB once per cat and leaves it resting on the group origin:
	 * the asset keeps the translation with which it was placed in the map.
	 */
	function prepare(scene: Object3D): Object3D {
		if (source === scene && model) {
			return model;
		}

		source = scene;
		const clone = cloneSkeleton(scene);

		clone.position.set(0, 0, 0);
		clone.rotation.set(0, 0, 0);
		clone.scale.setScalar(MODEL_SCALE);

		clone.traverse((child) => {
			const mesh = child as Mesh;

			if (!mesh.isMesh) {
				return;
			}

			mesh.castShadow = true;
			mesh.receiveShadow = false;

			const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
			const tinted = materials.map((material) => {
				if (material.name !== FUR_MATERIAL) {
					return material;
				}

				const copy = material.clone() as MeshStandardMaterial;
				copy.color.set(variant.fur);
				ownedMaterials.push(copy);

				return copy;
			});

			mesh.material = Array.isArray(mesh.material) ? tinted : tinted[0]!;
		});

		const box = new Box3().setFromObject(clone);
		const center = box.getCenter(new Vector3());
		clone.position.set(-center.x, -box.min.y, -center.z);

		model = clone;

		return clone;
	}

	$effect(() => {
		return () => {
			for (const material of ownedMaterials) {
				material.dispose();
			}

			ownedMaterials.length = 0;
		};
	});

	let bob = $state.raw<Group>();
	let elapsed = 0;

	useTask((delta) => {
		elapsed += delta;

		if (!bob) {
			return;
		}

		bob.position.y = Math.sin(elapsed * 2 + variant.phase * Math.PI * 2) * 0.02;
		bob.rotation.z = Math.sin(elapsed * 1.3 + variant.phase * Math.PI * 2) * 0.025;
	});
</script>

<T.Group
	position={[cat.position.x, cat.position.y, cat.position.z]}
	rotation={[0, yaw ?? variant.yaw, 0]}
>
	<T.Group bind:ref={bob}>
		{#await gltf}
			<!-- The GLB arrives cached; nothing is drawn until then. -->
		{:then loaded}
			<T is={prepare(loaded.scene)} dispose={false} />
		{/await}
	</T.Group>
</T.Group>
