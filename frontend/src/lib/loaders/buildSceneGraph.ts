import type { Material, Object3D } from 'three';

export type SceneGraph = {
	nodes: Record<string, Object3D>;
	materials: Record<string, Material>;
};

/**
 * Réplica del helper interno de `@threlte/extras` que usa `useGltf`.
 *
 * El precargador llama directamente a `useLoader(GLTFLoader)` para poder
 * escuchar el progreso de la descarga. Para que el resultado cacheado sea
 * compatible con los componentes generados por `@threlte/gltf` (`gltf.nodes`,
 * `gltf.materials`, …), aplicamos exactamente la misma transformación.
 */
export function buildSceneGraph(object: Object3D | null | undefined): SceneGraph {
	const data: SceneGraph = { nodes: {}, materials: {} };

	const addMaterial = (material: Material): void => {
		if (!data.materials[material.name]) {
			data.materials[material.name] = material;
		}
	};

	if (!object) {
		return data;
	}

	object.traverse((child) => {
		if (child.name) {
			data.nodes[child.name] = child;
		}

		const material = (child as Object3D & { material?: Material | Material[] }).material;

		if (Array.isArray(material)) {
			for (const item of material) {
				addMaterial(item);
			}
		} else if (material) {
			addMaterial(material);
		}
	});

	return data;
}
