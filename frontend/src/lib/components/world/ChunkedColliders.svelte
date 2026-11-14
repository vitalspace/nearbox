<script lang="ts">
	import { ColliderDesc, type Collider } from '@dimforge/rapier3d-compat';
	import { useTask } from '@threlte/core';
	import { useRapier } from '@threlte/rapier';
	import { onDestroy } from 'svelte';
	import { Group, Mesh, Vector3 } from 'three';
	import { worldState } from '../../state/worldState.svelte';
	import type { PhysicsConfig } from '../../world/types';

	/**
	 * Colisión por celdas espaciales.
	 *
	 * Los mapas grandes exportan mallas con triángulos que abarcan decenas de
	 * metros. Un trimesh por nodo hace que Rapier construya BVH enormes y el
	 * controlador de personaje consulta cientos de triángulos por frame
	 * (cientos de ms). Aquí partimos la geometría visual en celdas XZ y
	 * creamos un trimesh independiente por celda, de modo que el broad phase
	 * solo toque la celda donde está el jugador.
	 */
	let { mapId, root, config }: { mapId: string; root?: Group; config: PhysicsConfig } = $props();

	const { world } = useRapier();
	const colliders: Collider[] = [];
	const tempVertex = new Vector3();
	let built = false;
	let startedAt = -1;
	let reportedMissing = false;

	/**
	 * Tiempo máximo de espera a que el GLB monte los nodos de física.
	 *
	 * Antes el límite era de 180 *frames*: 3 s a 60 FPS, pero solo 1,25 s a
	 * 144 Hz. Los mapas `chunked` se cargan bajo demanda (`Parkour.glb` pesa
	 * 22 MB y no está en la precarga), así que al entrar por primera vez —o
	 * cuando dos clientes compiten por la descarga— el presupuesto se agotaba
	 * antes de que existiera la malla, se marcaba el mapa como listo con 0
	 * colisionadores y el jugador caía al vacío.
	 */
	const BUILD_TIMEOUT_MS = 20_000;
	/** Aviso en consola si la espera es larga (GLB lento), una sola vez. */
	const SLOW_BUILD_MS = 2_000;
	let reportedSlow = false;

	/** Nombres de nodo declarados en la configuración de física. */
	const configuredNames = $derived([
		...new Set(Object.values(config.groups ?? {}).flatMap((names) => names ?? []))
	]);

	/**
	 * Los mapas con adornos hijos (`_Rim`, `_Rock`, `_Sub`, `_Text`…) marcan
	 * `exactGroups` para que solo colisionen las superficies declaradas.
	 */
	const exactGroups = $derived(config.collision?.exactGroups === true);

	function matchesConfigured(name: string): boolean {
		if (exactGroups) return false;
		return configuredNames.some(
			(configured) => name === configured || name.startsWith(`${configured}_`)
		);
	}

	function findMeshes(): Mesh[] {
		const found = new Set<Mesh>();
		const wanted = new Set(configuredNames);
		const fallback = wanted.size === 0;

		root?.traverse((child) => {
			if (!(child as Mesh).isMesh) return;
			const mesh = child as Mesh;

			// `configuredNames` son los grupos del pipeline; sus hijos se llaman
			// `Grupo_1`, `Grupo_2`… pero también puede haber mallas anidadas con
			// otro nombre, así que recorremos el subárbol de cada grupo.
			if (fallback || wanted.has(mesh.name) || matchesConfigured(mesh.name)) {
				found.add(mesh);
			}
		});

		// Incluye todos los descendientes de los grupos configurados, incluso si
		// su nombre no comparte prefijo. En `exactGroups` solo valen los nombres
		// exactos: los hijos son decoración y no deben frenar la caída.
		if (!exactGroups) {
			for (const name of configuredNames) {
				const node = root?.getObjectByName(name);
				node?.traverse((child) => {
					if ((child as Mesh).isMesh) found.add(child as Mesh);
				});
			}
		}

		return [...found];
	}

	/** Nombres configurados que ya existen en la escena (una sola pasada). */
	function mountedNames(): Set<string> {
		const found = new Set<string>();

		if (!root) {
			return found;
		}

		const wanted = new Set(configuredNames);

		root.traverse((child) => {
			if (wanted.has(child.name)) {
				found.add(child.name);
			}
		});

		return found;
	}

	type Cell = { vertices: number[]; indices: number[] };

	function build(): void {
		if (!root || built) return;

		if (startedAt < 0) {
			startedAt = performance.now();
		}

		const elapsed = performance.now() - startedAt;
		// El GLTF se monta de forma asíncrona: espera a que existan todos los
		// grupos configurados antes de leer geometría.
		const mounted = mountedNames();

		if (
			configuredNames.length > 0 &&
			mounted.size < configuredNames.length &&
			elapsed < BUILD_TIMEOUT_MS
		) {
			if (!reportedSlow && elapsed >= SLOW_BUILD_MS) {
				reportedSlow = true;
				console.warn(
					`[world:${mapId}] esperando la malla de colisión (${mounted.size}/${configuredNames.length} nodos)`
				);
			}

			return;
		}

		const meshes = findMeshes();

		// Sin mallas no hay superficie que pisar. Nunca marcar el mapa como
		// listo en este caso: `worldState` desbloquea la gravedad del jugador y
		// lo dejaría cayendo al vacío. Se sigue reintentando cada frame hasta
		// que el GLB termine de montarse.
		if (meshes.length === 0) {
			if (!reportedMissing && elapsed >= BUILD_TIMEOUT_MS) {
				reportedMissing = true;
				console.error(
					`[world:${mapId}] no hay mallas de colisión tras ${Math.round(elapsed)} ms; el mapa no se marcará como listo`
				);
			}

			return;
		}

		root.updateWorldMatrix(true, true);

		const chunkSize = config.collision?.chunkSize ?? 16;
		const cells = new Map<string, Cell>();
		let triangles = 0;

		for (const mesh of meshes) {
			const geometry = mesh.geometry;
			const position = geometry.attributes.position;
			if (!position) continue;

			mesh.updateWorldMatrix(true, false);
			const matrix = mesh.matrixWorld;
			const index = geometry.index;
			const count = index ? index.count : position.count;

			for (let offset = 0; offset + 2 < count; offset += 3) {
				const a = index ? index.getX(offset) : offset;
				const b = index ? index.getX(offset + 1) : offset + 1;
				const c = index ? index.getX(offset + 2) : offset + 2;

				const ax = tempVertex.fromBufferAttribute(position, a).applyMatrix4(matrix).x;
				const ay = tempVertex.y;
				const az = tempVertex.z;
				const bx = tempVertex.fromBufferAttribute(position, b).applyMatrix4(matrix).x;
				const by = tempVertex.y;
				const bz = tempVertex.z;
				const cx = tempVertex.fromBufferAttribute(position, c).applyMatrix4(matrix).x;
				const cy = tempVertex.y;
				const cz = tempVertex.z;

				// Un triángulo grande (por ejemplo la cara superior de
				// `HP_Spawn_Top`) puede cruzar varias celdas. Asignarlo solo a la
				// celda de su centroide deja agujeros de colisión en el resto: el
				// jugador cae a través del suelo aunque la malla exista. Duplicamos
				// el triángulo en todas las celdas que cubre su AABB en XZ.
				const minCellX = Math.floor(Math.min(ax, bx, cx) / chunkSize);
				const maxCellX = Math.floor(Math.max(ax, bx, cx) / chunkSize);
				const minCellZ = Math.floor(Math.min(az, bz, cz) / chunkSize);
				const maxCellZ = Math.floor(Math.max(az, bz, cz) / chunkSize);

				for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
					for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
						const key = `${cellX},${cellZ}`;
						let cell = cells.get(key);
						if (!cell) {
							cell = { vertices: [], indices: [] };
							cells.set(key, cell);
						}

						const base = cell.vertices.length / 3;
						cell.vertices.push(ax, ay, az, bx, by, bz, cx, cy, cz);
						cell.indices.push(base, base + 1, base + 2);
						triangles += 1;
					}
				}
			}
		}

		const friction = config.friction ?? 0.9;
		const restitution = config.restitution ?? 0;

		// Mallas presentes pero sin triángulos útiles: mismo riesgo que no tener
		// malla, así que tampoco se marca el mapa como listo.
		if (cells.size === 0) {
			if (!reportedMissing) {
				reportedMissing = true;
				console.error(
					`[world:${mapId}] las mallas de colisión no aportaron triángulos; el mapa no se marcará como listo`
				);
			}

			return;
		}

		for (const cell of cells.values()) {
			const description = ColliderDesc.trimesh(
				new Float32Array(cell.vertices),
				new Uint32Array(cell.indices)
			);
			description.setFriction(friction).setRestitution(restitution);
			colliders.push(world.createCollider(description));
		}

		built = true;
		worldState.markReady(mapId, {
			nodes: configuredNames.length,
			triangles,
			colliders: colliders.length
		});

		if (import.meta.env.DEV) {
			console.info(
				`[world:${mapId}] física por celdas lista (${colliders.length} celdas, ${triangles} triángulos, ${Math.round(elapsed)} ms)`
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
