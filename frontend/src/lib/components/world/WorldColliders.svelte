<script lang="ts">
	import { ColliderDesc, type Collider } from '@dimforge/rapier3d-compat';
	import { useTask } from '@threlte/core';
	import { useRapier } from '@threlte/rapier';
	import { onDestroy } from 'svelte';
	import { Box3, BufferGeometry, Float32BufferAttribute, Group, Mesh, Vector3 } from 'three';
	import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
	import { worldState } from '../../state/worldState.svelte';
	import type { PhysicsCluster, PhysicsConfig } from '../../world/types';

	let { mapId, root, config }: { mapId: string; root?: Group; config: PhysicsConfig } = $props();

	const { world } = useRapier();
	const colliders: Collider[] = [];
	const tempVector = new Vector3();
	let built = false;
	let attempts = 0;

	function findMeshes(names: string[]): Mesh[] {
		const wanted = new Set(names);
		const found: Mesh[] = [];
		root?.traverse((child) => {
			if ((child as Mesh).isMesh && wanted.has(child.name)) found.push(child as Mesh);
		});
		return found;
	}

	/** Copies only positions and indices, with the world transform applied. */
	function preparedGeometry(mesh: Mesh): BufferGeometry | null {
		const position = mesh.geometry.attributes.position;
		if (!position) return null;

		const vertices = new Float32Array(position.count * 3);
		for (let index = 0; index < position.count; index += 1) {
			tempVector.fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld);
			vertices[index * 3] = tempVector.x;
			vertices[index * 3 + 1] = tempVector.y;
			vertices[index * 3 + 2] = tempVector.z;
		}

		const geometry = new BufferGeometry();
		geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));

		const sourceIndex = mesh.geometry.index;
		if (sourceIndex) {
			geometry.setIndex(Array.from(sourceIndex.array));
		} else {
			geometry.setIndex(Array.from({ length: position.count }, (_, index) => index));
		}

		return geometry;
	}

	function buildCluster(cluster: PhysicsCluster, meshes: Mesh[]): Collider | null {
		const geometries = meshes
			.map((mesh) => preparedGeometry(mesh))
			.filter((geometry): geometry is BufferGeometry => geometry !== null);

		if (geometries.length === 0) return null;

		const friction = config.friction ?? 0.9;
		const restitution = config.restitution ?? 0;
		let description: ColliderDesc | null = null;

		if (cluster.shape === 'cuboid') {
			const box = new Box3();
			for (const geometry of geometries) {
				geometry.computeBoundingBox();
				if (geometry.boundingBox) box.union(geometry.boundingBox);
			}
			const size = box.getSize(new Vector3());
			const center = box.getCenter(new Vector3());
			if (size.x <= 0 || size.y <= 0 || size.z <= 0) {
				for (const geometry of geometries) geometry.dispose();
				return null;
			}
			description = ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2).setTranslation(
				center.x,
				center.y,
				center.z
			);
		} else if (cluster.shape === 'convexHull') {
			let total = 0;
			for (const geometry of geometries) total += geometry.attributes.position.count;
			const vertices = new Float32Array(total * 3);
			let offset = 0;
			for (const geometry of geometries) {
				vertices.set(geometry.attributes.position.array as Float32Array, offset);
				offset += geometry.attributes.position.count * 3;
			}
			description = ColliderDesc.convexHull(vertices);
		} else {
			const merged = mergeGeometries(geometries, false);
			if (merged) {
				const position = merged.attributes.position;
				const indices = merged.index;
				const vertices = new Float32Array(position.array as Float32Array);
				const indexArray = indices
					? new Uint32Array(indices.array as ArrayLike<number>)
					: Uint32Array.from({ length: position.count }, (_, index) => index);
				description = ColliderDesc.trimesh(vertices, indexArray);
				merged.dispose();
			}
		}

		for (const geometry of geometries) geometry.dispose();
		if (!description) return null;

		description.setFriction(friction).setRestitution(restitution);
		return world.createCollider(description);
	}

	function build(): void {
		if (!root || built) return;

		const clusters = config.clusters ?? [];
		const allNames = clusters.flatMap((cluster) => cluster.names);
		const meshes = findMeshes(allNames);
		const foundNames = new Set(meshes.map((mesh) => mesh.name));

		// Names may take a frame to mount from the GLTF.
		if (allNames.some((name) => !foundNames.has(name)) && attempts < 180) {
			attempts += 1;
			return;
		}

		root.updateWorldMatrix(true, true);
		let triangles = 0;

		for (const cluster of clusters) {
			const clusterMeshes = meshes.filter((mesh) => cluster.names.includes(mesh.name));
			if (clusterMeshes.length === 0) continue;
			const collider = buildCluster(cluster, clusterMeshes);
			if (collider) colliders.push(collider);
			triangles += cluster.triangles;
		}

		built = true;
		worldState.markReady(mapId, {
			nodes: clusters.length,
			triangles,
			colliders: colliders.length
		});

		if (import.meta.env.DEV) {
			console.info(
				`[world:${mapId}] physics ready (${colliders.length} colliders, ${triangles} triangles)`
			);
		}
	}

	useTask(() => build());

	onDestroy(() => {
		for (const collider of colliders) world.removeCollider(collider, true);
		colliders.length = 0;
		worldState.reset(mapId);
	});
</script>
