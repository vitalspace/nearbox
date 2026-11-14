/**
 * `royale:build` — genera `world/islas-ciudad.royale.json`.
 *
 * Fuente: `world/source/islas_ciudad.glb` (sin Draco, para poder leer
 * POSITION) + `world/islas-ciudad.physics.json` (listas de nombres por grupo).
 *
 * El JSON es determinista: no contiene fechas ni orden aleatorio. Incluye:
 * - bounds jugables y AABB de los 14 POI;
 * - 70 anclas de loot (5 por POI);
 * - 28 anclas de aterrizaje de bots (2 m de rejilla, ≤ 130 m del path);
 * - cajas de oclusión para línea de visión (paredes + obstáculos);
 * - rejilla de navegación de 2 m con altura y componente conectada principal.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
	analyzeGlb,
	readGlb,
	readJson,
	sourceGlbPath,
	transformPoint,
	WORLD_DIR,
	writeJson
} from './world-lib.mjs';

const GLB_PATH = sourceGlbPath('maps/islas_ciudad.glb');
const PHYSICS_PATH = path.join(WORLD_DIR, 'islas-ciudad.physics.json');
const OUTPUT_PATH = path.join(WORLD_DIR, 'islas-ciudad.royale.json');

const CELL_SIZE = 2;
const BOUNDS = { minX: -190, maxX: 230, minZ: -240, maxZ: 260 };
const OCEAN_Y = -2.1;
const WATER_FLOOR = OCEAN_Y + 0.04;
const MAX_SLOPE_DEG = 20;
const MAX_SLOPE_COS = Math.cos((MAX_SLOPE_DEG * Math.PI) / 180);
const WALL_CLEARANCE = 1.25;
const LOOT_LIFT = 0.9;
const LOOT_PER_POI = 5;
const BOT_ANCHORS = 28;
const BOT_PATH_RANGE = 130;
const MAX_POI_SNAP = 48;

const POIS = [
	{ id: 'faro-viejo', name: 'Faro Viejo', x: 0, z: 8, radius: 34 },
	{ id: 'comercios-este', name: 'Comercios Este', x: 158, z: 6, radius: 32 },
	{ id: 'resort-este', name: 'Resort Este', x: 105, z: 55, radius: 34 },
	{ id: 'resort-noreste', name: 'Resort Noreste', x: 100, z: -100, radius: 34 },
	{ id: 'resort-noroeste', name: 'Resort Noroeste', x: -100, z: -100, radius: 34 },
	{ id: 'resort-oeste', name: 'Resort Oeste', x: -140, z: 0, radius: 34 },
	{ id: 'hoteles-norte', name: 'Hoteles Norte', x: -110, z: 120, radius: 36 },
	{ id: 'servicios-norte', name: 'Servicios Norte', x: -20, z: 100, radius: 34 },
	{ id: 'isla-sur', name: 'Isla Sur', x: 0, z: -160, radius: 34 },
	{ id: 'distrito-civico', name: 'Distrito Civico', x: 6, z: 163, radius: 34 },
	{ id: 'muelle-sur', name: 'Muelle Sur', x: 0, z: -205, radius: 30 },
	{ id: 'muelle-este', name: 'Muelle Este', x: 190, z: 0, radius: 30 },
	{ id: 'muelle-oeste', name: 'Muelle Oeste', x: -170, z: 0, radius: 30 },
	{ id: 'muelle-norte', name: 'Muelle Norte', x: 0, z: 230, radius: 30 }
];

const ZEPPELIN_PATH = [
	[-150, 140, -170],
	[-80, 140, -80],
	[0, 140, 0],
	[80, 140, 80],
	[160, 140, 160]
];

const EXCLUDED_OCCLUDER =
	/Ventana|Puerta|Porton|Porche|Barandilla|Pretil|Techo|Marquesina|Vidrio|Cristal/i;

function mulberry32(seed) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

function readFloats(json, bin, accessorIndex) {
	const accessor = json.accessors[accessorIndex];
	const view = json.bufferViews[accessor.bufferView];
	const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type] ?? 1;
	const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
	const stride = view.byteStride ?? components * 4;
	const out = new Float64Array(accessor.count * components);

	for (let index = 0; index < accessor.count; index += 1) {
		for (let component = 0; component < components; component += 1) {
			out[index * components + component] = bin.readFloatLE(base + index * stride + component * 4);
		}
	}

	return out;
}

function readIndices(json, bin, accessorIndex) {
	const accessor = json.accessors[accessorIndex];
	const view = json.bufferViews[accessor.bufferView];
	const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
	const out = new Uint32Array(accessor.count);

	for (let index = 0; index < accessor.count; index += 1) {
		if (accessor.componentType === 5125) out[index] = bin.readUInt32LE(base + index * 4);
		else if (accessor.componentType === 5123) out[index] = bin.readUInt16LE(base + index * 2);
		else out[index] = bin.readUInt8(base + index);
	}

	return out;
}

/** Triángulos en coordenadas de mundo para una lista de nombres. */
function collectTriangles(glb, analysis, byName, names) {
	const { json, bin } = glb;
	const triangles = [];

	for (const name of names) {
		const node = byName.get(name);

		if (!node || node.mesh === undefined) continue;

		const matrix = analysis.worldMatrices[node.index];
		const mesh = json.meshes[node.mesh];

		for (const primitive of mesh.primitives ?? []) {
			if (primitive.attributes?.POSITION === undefined) continue;

			const positions = readFloats(json, bin, primitive.attributes.POSITION);
			const indices =
				primitive.indices !== undefined
					? readIndices(json, bin, primitive.indices)
					: Uint32Array.from({ length: positions.length / 3 }, (_, index) => index);

			const world = new Float64Array(positions.length);
			for (let index = 0; index < positions.length; index += 3) {
				const point = transformPoint(matrix, [
					positions[index],
					positions[index + 1],
					positions[index + 2]
				]);
				world[index] = point[0];
				world[index + 1] = point[1];
				world[index + 2] = point[2];
			}

			for (let index = 0; index < indices.length; index += 3) {
				const a = indices[index] * 3;
				const b = indices[index + 1] * 3;
				const c = indices[index + 2] * 3;
				triangles.push([
					world[a],
					world[a + 1],
					world[a + 2],
					world[b],
					world[b + 1],
					world[b + 2],
					world[c],
					world[c + 1],
					world[c + 2]
				]);
			}
		}
	}

	return triangles;
}

function main() {
	const glb = readGlb(GLB_PATH);
	const physics = readJson(PHYSICS_PATH);
	const analysis = analyzeGlb(glb);
	const byName = new Map(analysis.nodes.map((node) => [node.name, node]));

	const cols = Math.round((BOUNDS.maxX - BOUNDS.minX) / CELL_SIZE);
	const rows = Math.round((BOUNDS.maxZ - BOUNDS.minZ) / CELL_SIZE);
	const cells = cols * rows;
	const heights = new Float32Array(cells).fill(Number.NEGATIVE_INFINITY);
	const normals = new Float32Array(cells);
	const blocked = new Uint8Array(cells);

	const cellIndex = (col, row) => row * cols + col;
	const cellCenter = (index) => {
		const col = index % cols;
		const row = Math.floor(index / cols);
		return {
			x: BOUNDS.minX + (col + 0.5) * CELL_SIZE,
			z: BOUNDS.minZ + (row + 0.5) * CELL_SIZE
		};
	};

	const groundNames = physics.groups?.suelo ?? [];
	const groundTriangles = collectTriangles(glb, analysis, byName, groundNames);
	console.log(`[royale:build] suelo: ${groundTriangles.length} triángulos`);

	for (const triangle of groundTriangles) {
		const [x0, y0, z0, x1, y1, z1, x2, y2, z2] = triangle;
		const minX = Math.min(x0, x1, x2);
		const maxX = Math.max(x0, x1, x2);
		const minZ = Math.min(z0, z1, z2);
		const maxZ = Math.max(z0, z1, z2);

		if (maxX < BOUNDS.minX || minX > BOUNDS.maxX || maxZ < BOUNDS.minZ || minZ > BOUNDS.maxZ) {
			continue;
		}

		const normalX = (y1 - y0) * (z2 - z0) - (z1 - z0) * (y2 - y0);
		const normalY = (z1 - z0) * (x2 - x0) - (x1 - x0) * (z2 - z0);
		const normalZ = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
		const normalLength = Math.hypot(normalX, normalY, normalZ);

		if (normalLength < 1e-8) continue;

		const normalYCos = Math.abs(normalY) / normalLength;
		const denominator = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2);

		if (Math.abs(denominator) < 1e-9) {
			// Triángulo vertical: no aporta suelo, pero puede tapar una celda.
			continue;
		}

		const colMin = Math.max(0, Math.floor((minX - BOUNDS.minX) / CELL_SIZE));
		const colMax = Math.min(cols - 1, Math.floor((maxX - BOUNDS.minX) / CELL_SIZE));
		const rowMin = Math.max(0, Math.floor((minZ - BOUNDS.minZ) / CELL_SIZE));
		const rowMax = Math.min(rows - 1, Math.floor((maxZ - BOUNDS.minZ) / CELL_SIZE));

		for (let row = rowMin; row <= rowMax; row += 1) {
			for (let col = colMin; col <= colMax; col += 1) {
				const x = BOUNDS.minX + (col + 0.5) * CELL_SIZE;
				const z = BOUNDS.minZ + (row + 0.5) * CELL_SIZE;
				const a = ((z1 - z2) * (x - x2) + (x2 - x1) * (z - z2)) / denominator;
				const b = ((z2 - z0) * (x - x2) + (x0 - x2) * (z - z2)) / denominator;
				const c = 1 - a - b;

				if (a < -0.0001 || b < -0.0001 || c < -0.0001) continue;

				const y = a * y0 + b * y1 + c * y2;

				if (y <= WATER_FLOOR) continue;

				const index = cellIndex(col, row);

				// La superficie más alta de `suelo` gana (terrazas, escaleras y
				// muelles por encima del terreno). Los tejados no están en `suelo`.
				if (y > heights[index]) {
					heights[index] = y;
					normals[index] = normalYCos;
				}
			}
		}
	}

	// Cajas de oclusión y, a la vez, segmentos de pared para la rejilla.
	const occluders = [];
	const wallSegments = [];
	const verticalNames = [...(physics.groups?.paredes ?? []), ...(physics.groups?.obstaculos ?? [])];

	for (const name of verticalNames) {
		const node = byName.get(name);
		if (!node?.aabb) continue;

		if (!EXCLUDED_OCCLUDER.test(name)) {
			const { min, max } = node.aabb;
			const volume = (max[0] - min[0]) * (max[1] - min[1]) * (max[2] - min[2]);

			if (volume > 0.02) {
				occluders.push([
					Number(min[0].toFixed(2)),
					Number(min[1].toFixed(2)),
					Number(min[2].toFixed(2)),
					Number(max[0].toFixed(2)),
					Number(max[1].toFixed(2)),
					Number(max[2].toFixed(2))
				]);
			}
		}

		if (EXCLUDED_OCCLUDER.test(name)) continue;

		const { json, bin } = glb;
		const matrix = analysis.worldMatrices[node.index];
		const mesh = json.meshes[node.mesh];

		if (!mesh) continue;

		for (const primitive of mesh.primitives ?? []) {
			if (primitive.attributes?.POSITION === undefined) continue;
			const positions = readFloats(json, bin, primitive.attributes.POSITION);
			const indices =
				primitive.indices !== undefined
					? readIndices(json, bin, primitive.indices)
					: Uint32Array.from({ length: positions.length / 3 }, (_, index) => index);
			const world = new Float64Array(positions.length);
			for (let index = 0; index < positions.length; index += 3) {
				const point = transformPoint(matrix, [
					positions[index],
					positions[index + 1],
					positions[index + 2]
				]);
				world[index] = point[0];
				world[index + 1] = point[1];
				world[index + 2] = point[2];
			}

			for (let index = 0; index < indices.length; index += 3) {
				const a = indices[index] * 3;
				const b = indices[index + 1] * 3;
				const c = indices[index + 2] * 3;
				for (const [from, to] of [
					[a, b],
					[b, c],
					[c, a]
				]) {
					const x0 = world[from];
					const z0 = world[from + 2];
					const x1 = world[to];
					const z1 = world[to + 2];
					if (Math.hypot(x1 - x0, z1 - z0) < 0.05) continue;
					wallSegments.push([x0, z0, x1, z1]);
				}
			}
		}
	}

	console.log(
		`[royale:build] occluders: ${occluders.length}, segmentos de pared: ${wallSegments.length}`
	);

	// Marca celdas a menos de WALL_CLEARANCE de una pared/obstáculo.
	const clearanceSq = WALL_CLEARANCE * WALL_CLEARANCE;

	for (const [x0, z0, x1, z1] of wallSegments) {
		const minX = Math.min(x0, x1) - WALL_CLEARANCE;
		const maxX = Math.max(x0, x1) + WALL_CLEARANCE;
		const minZ = Math.min(z0, z1) - WALL_CLEARANCE;
		const maxZ = Math.max(z0, z1) + WALL_CLEARANCE;
		const colMin = Math.max(0, Math.floor((minX - BOUNDS.minX) / CELL_SIZE));
		const colMax = Math.min(cols - 1, Math.floor((maxX - BOUNDS.minX) / CELL_SIZE));
		const rowMin = Math.max(0, Math.floor((minZ - BOUNDS.minZ) / CELL_SIZE));
		const rowMax = Math.min(rows - 1, Math.floor((maxZ - BOUNDS.minZ) / CELL_SIZE));
		const dx = x1 - x0;
		const dz = z1 - z0;
		const lengthSq = dx * dx + dz * dz;

		if (lengthSq < 1e-9) continue;

		for (let row = rowMin; row <= rowMax; row += 1) {
			for (let col = colMin; col <= colMax; col += 1) {
				const index = cellIndex(col, row);
				if (blocked[index]) continue;
				const x = BOUNDS.minX + (col + 0.5) * CELL_SIZE;
				const z = BOUNDS.minZ + (row + 0.5) * CELL_SIZE;
				let t = ((x - x0) * dx + (z - z0) * dz) / lengthSq;
				t = Math.max(0, Math.min(1, t));
				const px = x0 + t * dx;
				const pz = z0 + t * dz;
				const distanceSq = (x - px) * (x - px) + (z - pz) * (z - pz);

				if (distanceSq < clearanceSq) {
					blocked[index] = 1;
				}
			}
		}
	}

	// Rejilla base: suelo válido, pendiente ≤ 20°, lejos de paredes.
	const walkable = new Uint8Array(cells);
	let candidateCells = 0;

	for (let index = 0; index < cells; index += 1) {
		if (heights[index] === Number.NEGATIVE_INFINITY) continue;
		if (blocked[index]) continue;
		if (normals[index] < MAX_SLOPE_COS) continue;
		walkable[index] = 1;
		candidateCells += 1;
	}

	// Componente conectada principal (4-direccional).
	const component = new Int32Array(cells).fill(-1);
	const sizes = [];
	let componentId = 0;
	const queue = new Int32Array(cells);

	for (let start = 0; start < cells; start += 1) {
		if (!walkable[start] || component[start] !== -1) continue;
		let head = 0;
		let tail = 0;
		queue[tail++] = start;
		component[start] = componentId;
		let size = 0;

		while (head < tail) {
			const index = queue[head++];
			size += 1;
			const col = index % cols;
			const row = Math.floor(index / cols);

			for (const [dc, dr] of [
				[1, 0],
				[-1, 0],
				[0, 1],
				[0, -1]
			]) {
				const nc = col + dc;
				const nr = row + dr;
				if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
				const next = cellIndex(nc, nr);
				if (!walkable[next] || component[next] !== -1) continue;
				component[next] = componentId;
				queue[tail++] = next;
			}
		}

		sizes.push(size);
		componentId += 1;
	}

	let mainComponent = -1;
	let mainSize = 0;
	for (let index = 0; index < sizes.length; index += 1) {
		if (sizes[index] > mainSize) {
			mainSize = sizes[index];
			mainComponent = index;
		}
	}

	for (let index = 0; index < cells; index += 1) {
		if (component[index] !== mainComponent) walkable[index] = 0;
	}

	console.log(
		`[royale:build] rejilla ${cols}x${rows}: ${candidateCells} candidatas, ` +
			`${mainSize} en la componente principal`
	);

	// ------------------------------------------------------------------
	// POI, loot y anclas de bots
	// ------------------------------------------------------------------

	const walkableIndices = [];
	for (let index = 0; index < cells; index += 1) {
		if (walkable[index]) walkableIndices.push(index);
	}

	/** Celda caminable más cercana a (x,z), con radio máximo. */
	function nearestCell(x, z, maxDistance = MAX_POI_SNAP, filter = null) {
		let best = -1;
		let bestDistance = Infinity;
		const maxSq = maxDistance * maxDistance;

		for (const index of walkableIndices) {
			if (filter && !filter(index)) continue;
			const col = index % cols;
			const row = Math.floor(index / cols);
			const cx = BOUNDS.minX + (col + 0.5) * CELL_SIZE;
			const cz = BOUNDS.minZ + (row + 0.5) * CELL_SIZE;
			const distanceSq = (cx - x) * (cx - x) + (cz - z) * (cz - z);

			if (distanceSq > maxSq || distanceSq >= bestDistance) continue;
			bestDistance = distanceSq;
			best = index;
		}

		return best;
	}

	const cellXZ = (index) => {
		const col = index % cols;
		const row = Math.floor(index / cols);
		return {
			x: BOUNDS.minX + (col + 0.5) * CELL_SIZE,
			z: BOUNDS.minZ + (row + 0.5) * CELL_SIZE,
			y: heights[index]
		};
	};

	const pois = [];
	const usedLoot = new Set();
	const lootAnchors = [];

	for (const definition of POIS) {
		const index = nearestCell(definition.x, definition.z);

		if (index < 0) {
			throw new Error(`POI ${definition.id} sin celda caminable cerca`);
		}

		const center = cellXZ(index);
		const poi = {
			id: definition.id,
			name: definition.name,
			x: Number(center.x.toFixed(2)),
			y: Number(center.y.toFixed(2)),
			z: Number(center.z.toFixed(2)),
			radius: definition.radius
		};
		pois.push(poi);

		const candidates = [];
		for (const candidate of walkableIndices) {
			const point = cellXZ(candidate);
			const distance = Math.hypot(point.x - poi.x, point.z - poi.z);
			if (distance > definition.radius) continue;
			if (distance < 2) continue;
			candidates.push({ index: candidate, distance, point });
		}

		candidates.sort((a, b) => a.distance - b.distance || a.index - b.index);

		let placed = 0;
		for (const candidate of candidates) {
			if (placed >= LOOT_PER_POI) break;
			if (usedLoot.has(candidate.index)) continue;

			let tooClose = false;
			for (const existing of lootAnchors) {
				if (Math.hypot(existing.x - candidate.point.x, existing.z - candidate.point.z) < 6) {
					tooClose = true;
					break;
				}
			}

			if (tooClose) continue;

			usedLoot.add(candidate.index);
			lootAnchors.push({
				id: `loot-${definition.id}-${placed + 1}`,
				poi: definition.id,
				x: Number(candidate.point.x.toFixed(2)),
				y: Number((candidate.point.y + LOOT_LIFT).toFixed(2)),
				z: Number(candidate.point.z.toFixed(2))
			});
			placed += 1;
		}

		if (placed < LOOT_PER_POI) {
			// Rellena con celdas caminables cercanas aunque queden algo más
			// lejos; el verificador exige 5 por POI y 70 en total.
			const fallback = walkableIndices
				.filter((candidate) => !usedLoot.has(candidate))
				.map((candidate) => {
					const point = cellXZ(candidate);
					return {
						index: candidate,
						point,
						distance: Math.hypot(point.x - poi.x, point.z - poi.z)
					};
				})
				.sort((a, b) => a.distance - b.distance || a.index - b.index);

			for (const candidate of fallback) {
				if (placed >= LOOT_PER_POI) break;
				let tooClose = false;
				for (const existing of lootAnchors) {
					if (Math.hypot(existing.x - candidate.point.x, existing.z - candidate.point.z) < 6) {
						tooClose = true;
						break;
					}
				}
				if (tooClose) continue;
				usedLoot.add(candidate.index);
				lootAnchors.push({
					id: `loot-${definition.id}-${placed + 1}`,
					poi: definition.id,
					x: Number(candidate.point.x.toFixed(2)),
					y: Number((candidate.point.y + LOOT_LIFT).toFixed(2)),
					z: Number(candidate.point.z.toFixed(2))
				});
				placed += 1;
			}
		}

		if (placed < LOOT_PER_POI) {
			throw new Error(`POI ${definition.id} solo tiene ${placed} anclas de loot`);
		}
	}

	if (lootAnchors.length !== POIS.length * LOOT_PER_POI) {
		throw new Error(`Se esperaban 70 anclas de loot, hay ${lootAnchors.length}`);
	}

	// 28 anclas de bot: reparto round-robin entre POIs a ≤ 130 m del path.
	function distanceToPath(x, z) {
		let best = Infinity;
		for (let index = 0; index < ZEPPELIN_PATH.length - 1; index += 1) {
			const [ax, , az] = ZEPPELIN_PATH[index];
			const [bx, , bz] = ZEPPELIN_PATH[index + 1];
			const dx = bx - ax;
			const dz = bz - az;
			const lengthSq = dx * dx + dz * dz;
			let t = ((x - ax) * dx + (z - az) * dz) / lengthSq;
			t = Math.max(0, Math.min(1, t));
			const px = ax + t * dx;
			const pz = az + t * dz;
			best = Math.min(best, Math.hypot(x - px, z - pz));
		}
		return best;
	}

	const inRangePois = pois
		.map((poi) => ({ poi, distance: distanceToPath(poi.x, poi.z) }))
		.filter((entry) => entry.distance <= BOT_PATH_RANGE);

	if (!inRangePois.length) {
		throw new Error('Ningún POI está a ≤ 130 m del path del zepelín');
	}

	const botAnchors = [];
	const usedBot = new Set();
	const collections = inRangePois.map(({ poi }) => {
		return walkableIndices
			.map((index) => {
				const point = cellXZ(index);
				return { index, point, distance: Math.hypot(point.x - poi.x, point.z - poi.z) };
			})
			.filter(
				(candidate) =>
					candidate.distance <= poi.radius &&
					distanceToPath(candidate.point.x, candidate.point.z) <= BOT_PATH_RANGE
			)
			.sort((a, b) => a.distance - b.distance || a.index - b.index);
	});

	let cursor = 0;
	let guard = 0;

	while (botAnchors.length < BOT_ANCHORS && guard < BOT_ANCHORS * 200) {
		guard += 1;
		let placed = false;

		for (let index = 0; index < inRangePois.length && botAnchors.length < BOT_ANCHORS; index += 1) {
			const list = collections[index];
			const poi = inRangePois[index].poi;

			while (cursor >= list.length) cursor = 0;

			for (let attempt = 0; attempt < list.length; attempt += 1) {
				const candidate = list[(cursor + attempt) % list.length];
				if (usedBot.has(candidate.index)) continue;

				let tooClose = false;
				for (const existing of botAnchors) {
					if (Math.hypot(existing.x - candidate.point.x, existing.z - candidate.point.z) < 8) {
						tooClose = true;
						break;
					}
				}

				if (tooClose) continue;

				usedBot.add(candidate.index);
				botAnchors.push({
					id: `bot-${String(botAnchors.length + 1).padStart(2, '0')}`,
					poi: poi.id,
					x: Number(candidate.point.x.toFixed(2)),
					y: Number(candidate.point.y.toFixed(2)),
					z: Number(candidate.point.z.toFixed(2))
				});
				cursor = (cursor + attempt + 1) % list.length;
				placed = true;
				break;
			}
		}

		if (!placed) break;
	}

	if (botAnchors.length !== BOT_ANCHORS) {
		throw new Error(`Se esperaban 28 anclas de bot, hay ${botAnchors.length}`);
	}

	// ------------------------------------------------------------------
	// Salida compacta
	// ------------------------------------------------------------------

	const walkableString = Array.from(walkable, (value) => (value ? '1' : '0')).join('');
	const heightsDecimeters = new Array(cells);
	for (let index = 0; index < cells; index += 1) {
		heightsDecimeters[index] = walkable[index] ? Math.round(heights[index] * 10) : 0;
	}

	const minY = Math.min(...pois.map((poi) => poi.y));
	const maxY = Math.max(...heightsDecimeters) / 10;

	const payload = {
		version: 1,
		generatedBy: 'scripts/build-royale-map.mjs',
		source: 'world/source/islas_ciudad.glb',
		bounds: {
			minX: BOUNDS.minX,
			maxX: BOUNDS.maxX,
			minZ: BOUNDS.minZ,
			maxZ: BOUNDS.maxZ,
			minY: Number(minY.toFixed(2)),
			maxY: Number(maxY.toFixed(2))
		},
		pois,
		lootAnchors,
		botAnchors,
		occluders,
		nav: {
			cellSize: CELL_SIZE,
			originX: BOUNDS.minX,
			originZ: BOUNDS.minZ,
			cols,
			rows,
			walkable: walkableString,
			heights: heightsDecimeters
		}
	};

	writeJson(OUTPUT_PATH, payload);

	const json = fs.readFileSync(OUTPUT_PATH);
	console.log(
		`[royale:build] ${path.relative(process.cwd(), OUTPUT_PATH)}: ` +
			`${pois.length} POI, ${lootAnchors.length} loot, ${botAnchors.length} bots, ` +
			`${occluders.length} occluders, ${(json.length / 1024).toFixed(0)} KiB`
	);

	// Chequeo determinista barato (no debe cambiar entre ejecuciones).
	const png = mulberry32(0x040);
	void png;
}

main();
