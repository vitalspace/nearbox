<script lang="ts">
	import { T } from '@threlte/core';
	import { useDraco, useGltf } from '@threlte/extras';
	import { Box3, Group, Vector3 } from 'three';
	import { asset } from '../../assets/path';

	interface Props {
		/** Ruta relativa a `static/`. */
		url: string;
		position?: [number, number, number];
		rotation?: [number, number, number];
		/** Tamaño máximo en metros del modelo ya normalizado. */
		targetSize?: number;
		visible?: boolean;
	}

	let {
		url,
		position = [0, 0, 0],
		rotation = [0, 0, 0],
		targetSize = 1,
		visible = true
	}: Props = $props();

	// El componente se vuelve a montar con `{#key}` cuando cambia la URL.
	// svelte-ignore state_referenced_locally
	const gltf = useGltf(url, { dracoLoader: useDraco(asset('draco/')) });

	// Clon + normalización: el GLB puede venir en cualquier escala y con el
	// origen fuera del centro. Se centra y se escala a `targetSize`.
	const group = $derived.by(() => {
		if (!$gltf) return null;

		const root = new Group();
		const clone = $gltf.scene.clone(true);

		clone.updateMatrixWorld(true);

		const initialBox = new Box3().setFromObject(clone);
		const size = initialBox.getSize(new Vector3());
		const maxDimension = Math.max(size.x, size.y, size.z);

		if (maxDimension > 0.0001) {
			clone.scale.setScalar(targetSize / maxDimension);
		}

		clone.updateMatrixWorld(true);

		const centeredBox = new Box3().setFromObject(clone);
		const center = centeredBox.getCenter(new Vector3());

		clone.position.sub(center);
		root.add(clone);
		root.position.set(...position);
		root.rotation.set(...rotation);
		root.visible = visible;

		return root;
	});

	$effect(() => {
		if (group) {
			group.visible = visible;
		}
	});
</script>

{#if group}
	<T is={group} dispose={false} />
{/if}
