#!/usr/bin/env node
/**
 * `race:check` — validates the Grand Prix track constants against `map.glb`.
 *
 * Reads the GLB JSON + POSITION accessors, rebuilds world-space bounds and
 * checks that the grid, the eight gates and the twelve item boxes are on the
 * asphalt ring and do not sit inside vertical collidable geometry.
 *
 * Only Node's standard library is used.
 */
import fs from 'node:fs';
import path from 'node:path';
import { readGlb, sourceGlbPath, STATIC_DIR, ROOT } from './world-lib.mjs';

// Draco no permite leer POSITION desde un bufferView: se valida el export original.
const MAP_GLB = sourceGlbPath(path.join(STATIC_DIR, 'maps/map.glb'));
const MAP_PHYSICS = path.join(ROOT, 'world', 'map.physics.json');
const RACE_CONFIG = path.join(ROOT, 'src', 'lib', 'state', 'raceConfig.ts');

const EPSILON = 0.05;
const SURFACE_EPSILON = 0.1;
const ASPHALT_BAND = 0.02;
const VERTICAL_MARGIN = 0.6;
const VERTICAL_Y_MIN = 0.1;
const VERTICAL_Y_MAX = 1.8;

const errors = [];
const warnings = [];
const summary = [];

function fail(message) {
	errors.push(message);
}

function warn(message) {
	warnings.push(message);
}

function approx(actual, expected, epsilon = EPSILON) {
	return Number.isFinite(actual) && Math.abs(actual - expected) <= epsilon;
}

function format(value, digits = 2) {
	return Number.isFinite(value) ? value.toFixed(digits) : String(value);
}

/* ------------------------------------------------------------------ */
/* Minimal glTF math (column-major 4x4, like glTF / Three.js)          */
/* ------------------------------------------------------------------ */

function matMultiply(a, b) {
	const out = new Array(16).fill(0);

	for (let column = 0; column < 4; column += 1) {
		for (let row = 0; row < 4; row += 1) {
			let sum = 0;
			for (let k = 0; k < 4; k += 1) {
				sum += a[k * 4 + row] * b[column * 4 + k];
			}
			out[column * 4 + row] = sum;
		}
	}

	return out;
}

function matFromTRS(translation = [0, 0, 0], rotation = [0, 0, 0, 1], scale = [1, 1, 1]) {
	const [x, y, z, w] = rotation;
	const x2 = x + x;
	const y2 = y + y;
	const z2 = z + z;
	const xx = x * x2;
	const xy = x * y2;
	const xz = x * z2;
	const yy = y * y2;
	const yz = y * z2;
	const zz = z * z2;
	const wx = w * x2;
	const wy = w * y2;
	const wz = w * z2;
	const [sx, sy, sz] = scale;

	return [
		(1 - (yy + zz)) * sx,
		(xy + wz) * sx,
		(xz - wy) * sx,
		0,
		(xy - wz) * sy,
		(1 - (xx + zz)) * sy,
		(yz + wx) * sy,
		0,
		(xz + wy) * sz,
		(yz - wx) * sz,
		(1 - (xx + yy)) * sz,
		0,
		translation[0],
		translation[1],
		translation[2],
		1
	];
}

function nodeMatrix(node) {
	if (node.matrix) {
		return node.matrix.slice();
	}

	return matFromTRS(node.translation, node.rotation, node.scale);
}

function transformPoint(matrix, x, y, z) {
	return {
		x: matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
		y: matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
		z: matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]
	};
}

/* ------------------------------------------------------------------ */
/* glTF accessors                                                      */
/* ------------------------------------------------------------------ */

function readVec3Accessor(json, bin, accessorIndex) {
	const accessor = json.accessors?.[accessorIndex];

	if (!accessor) {
		throw new Error(`accessor ${accessorIndex} no existe`);
	}

	if (accessor.componentType !== 5126 || accessor.type !== 'VEC3') {
		throw new Error(`accessor ${accessorIndex} no es VEC3 float32`);
	}

	if (accessor.sparse) {
		throw new Error(`accessor ${accessorIndex} usa sparse (no soportado)`);
	}

	const view = json.bufferViews?.[accessor.bufferView];

	if (!view) {
		throw new Error(`bufferView de accessor ${accessorIndex} no existe`);
	}

	const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
	const stride = view.byteStride ?? 12;
	const values = new Float32Array(accessor.count * 3);

	for (let index = 0; index < accessor.count; index += 1) {
		const offset = base + index * stride;
		values[index * 3] = bin.readFloatLE(offset);
		values[index * 3 + 1] = bin.readFloatLE(offset + 4);
		values[index * 3 + 2] = bin.readFloatLE(offset + 8);
	}

	return values;
}

function readIndices(json, bin, accessorIndex) {
	const accessor = json.accessors?.[accessorIndex];

	if (!accessor) {
		return null;
	}

	const view = json.bufferViews?.[accessor.bufferView];
	const base = (view?.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
	const count = accessor.count;
	const out = new Uint32Array(count);

	for (let index = 0; index < count; index += 1) {
		if (accessor.componentType === 5125) {
			out[index] = bin.readUInt32LE(base + index * 4);
		} else if (accessor.componentType === 5123) {
			out[index] = bin.readUInt16LE(base + index * 2);
		} else if (accessor.componentType === 5121) {
			out[index] = bin.readUInt8(base + index);
		} else {
			throw new Error(`índices con componentType ${accessor.componentType} no soportados`);
		}
	}

	return out;
}

/* ------------------------------------------------------------------ */
/* Scene traversal                                                     */
/* ------------------------------------------------------------------ */

function buildWorldMatrices(json) {
	const world = new Map();
	const identity = matFromTRS();
	const scene = json.scenes?.[json.scene ?? 0];

	function walk(nodeIndex, parent) {
		const node = json.nodes?.[nodeIndex];

		if (!node) {
			return;
		}

		const matrix = matMultiply(parent, nodeMatrix(node));
		world.set(nodeIndex, matrix);

		for (const child of node.children ?? []) {
			walk(child, matrix);
		}
	}

	for (const root of scene?.nodes ?? []) {
		walk(root, identity);
	}

	return world;
}

function meshVertices(json, bin, meshIndex, matrix) {
	const out = [];
	const mesh = json.meshes?.[meshIndex];

	for (const primitive of mesh?.primitives ?? []) {
		const positionIndex = primitive.attributes?.POSITION;

		if (positionIndex === undefined) {
			continue;
		}

		const positions = readVec3Accessor(json, bin, positionIndex);

		for (let index = 0; index < positions.length; index += 3) {
			const point = transformPoint(
				matrix,
				positions[index],
				positions[index + 1],
				positions[index + 2]
			);
			out.push(point);
		}
	}

	return out;
}

function nodeWorldBounds(json, bin, world, nodeIndex) {
	const min = { x: Infinity, y: Infinity, z: Infinity };
	const max = { x: -Infinity, y: -Infinity, z: -Infinity };

	function visit(index) {
		const node = json.nodes?.[index];

		if (!node) {
			return;
		}

		const matrix = world.get(index);

		if (node.mesh !== undefined && matrix) {
			for (const point of meshVertices(json, bin, node.mesh, matrix)) {
				min.x = Math.min(min.x, point.x);
				min.y = Math.min(min.y, point.y);
				min.z = Math.min(min.z, point.z);
				max.x = Math.max(max.x, point.x);
				max.y = Math.max(max.y, point.y);
				max.z = Math.max(max.z, point.z);
			}
		}

		for (const child of node.children ?? []) {
			visit(child);
		}
	}

	visit(nodeIndex);

	return { min, max };
}

/**
 * The `TWN_Track` mesh mixes the asphalt (y = TRACK_SURFACE_Y), the curbs
 * (y ≈ 0.07, radius 85.5…100.5) and the centre line. Only the asphalt
 * vertices define the drivable ring, so they are filtered by height.
 */
function asphaltBounds(json, bin, world, nodeIndex, surfaceY) {
	const points = [];

	function visit(index) {
		const node = json.nodes?.[index];

		if (!node) {
			return;
		}

		const matrix = world.get(index);

		if (node.mesh !== undefined && matrix) {
			for (const point of meshVertices(json, bin, node.mesh, matrix)) {
				if (Math.abs(point.y - surfaceY) <= ASPHALT_BAND) {
					points.push(point);
				}
			}
		}

		for (const child of node.children ?? []) {
			visit(child);
		}
	}

	visit(nodeIndex);

	if (points.length === 0) {
		return null;
	}

	const min = { x: Infinity, z: Infinity };
	const max = { x: -Infinity, z: -Infinity };

	for (const point of points) {
		min.x = Math.min(min.x, point.x);
		min.z = Math.min(min.z, point.z);
		max.x = Math.max(max.x, point.x);
		max.z = Math.max(max.z, point.z);
	}

	const center = { x: (min.x + max.x) / 2, z: (min.z + max.z) / 2 };
	let inner = Infinity;
	let outer = -Infinity;

	for (const point of points) {
		const radius = Math.hypot(point.x - center.x, point.z - center.z);
		inner = Math.min(inner, radius);
		outer = Math.max(outer, radius);
	}

	return { center, inner, outer, min, max, count: points.length };
}

function collectTriangleSoup(json, bin, world, nodeNames) {
	const triangles = [];
	const wanted = new Set(nodeNames);
	const seenNodes = new Set();

	function visit(index) {
		const node = json.nodes?.[index];

		if (!node || seenNodes.has(index)) {
			return;
		}

		seenNodes.add(index);

		if (node.mesh !== undefined && wanted.has(node.name)) {
			const matrix = world.get(index);
			const mesh = json.meshes?.[node.mesh];

			for (const primitive of mesh?.primitives ?? []) {
				const positionIndex = primitive.attributes?.POSITION;

				if (positionIndex === undefined) {
					continue;
				}

				const positions = readVec3Accessor(json, bin, positionIndex);
				const indices =
					primitive.indices !== undefined ? readIndices(json, bin, primitive.indices) : null;
				const count = indices ? indices.length : positions.length / 3;

				for (let index3 = 0; index3 + 2 < count; index3 += 3) {
					const i0 = indices ? indices[index3] : index3;
					const i1 = indices ? indices[index3 + 1] : index3 + 1;
					const i2 = indices ? indices[index3 + 2] : index3 + 2;

					triangles.push(
						transformPoint(matrix, positions[i0 * 3], positions[i0 * 3 + 1], positions[i0 * 3 + 2]),
						transformPoint(matrix, positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2]),
						transformPoint(matrix, positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2])
					);
				}
			}

			return;
		}

		for (const child of node.children ?? []) {
			visit(child);
		}
	}

	const scene = json.scenes?.[json.scene ?? 0];

	for (const root of scene?.nodes ?? []) {
		visit(root);
	}

	return triangles;
}

/* ------------------------------------------------------------------ */
/* Geometry helpers                                                    */
/* ------------------------------------------------------------------ */

function distanceToSegment2D(px, pz, ax, az, bx, bz) {
	const dx = bx - ax;
	const dz = bz - az;
	const lengthSquared = dx * dx + dz * dz;

	if (lengthSquared === 0) {
		return Math.hypot(px - ax, pz - az);
	}

	let t = ((px - ax) * dx + (pz - az) * dz) / lengthSquared;
	t = Math.max(0, Math.min(1, t));

	return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

function pointInTriangle2D(px, pz, a, b, c) {
	const d1 = (px - b.x) * (a.z - b.z) - (a.x - b.x) * (pz - b.z);
	const d2 = (px - c.x) * (b.z - c.z) - (b.x - c.x) * (pz - c.z);
	const d3 = (px - a.x) * (c.z - a.z) - (c.x - a.x) * (pz - a.z);
	const hasNegative = d1 < 0 || d2 < 0 || d3 < 0;
	const hasPositive = d1 > 0 || d2 > 0 || d3 > 0;

	return !(hasNegative && hasPositive);
}

function pointHitsVerticalGeometry(px, pz, triangles) {
	for (let index = 0; index + 2 < triangles.length; index += 3) {
		const a = triangles[index];
		const b = triangles[index + 1];
		const c = triangles[index + 2];

		const yMin = Math.min(a.y, b.y, c.y);
		const yMax = Math.max(a.y, b.y, c.y);

		if (yMax < VERTICAL_Y_MIN || yMin > VERTICAL_Y_MAX) {
			continue;
		}

		// Triangle normal; skip horizontal faces (floors, roofs, tops).
		const abx = b.x - a.x;
		const aby = b.y - a.y;
		const abz = b.z - a.z;
		const acx = c.x - a.x;
		const acy = c.y - a.y;
		const acz = c.z - a.z;
		const nx = aby * acz - abz * acy;
		const ny = abz * acx - abx * acz;
		const nz = abx * acy - aby * acx;
		const normalLength = Math.hypot(nx, ny, nz);

		if (normalLength === 0) {
			continue;
		}

		if (Math.abs(ny) / normalLength > 0.6) {
			continue;
		}

		if (pointInTriangle2D(px, pz, a, b, c)) {
			return { x: px, z: pz, y: yMin, distance: 0 };
		}

		const distance = Math.min(
			distanceToSegment2D(px, pz, a.x, a.z, b.x, b.z),
			distanceToSegment2D(px, pz, b.x, b.z, c.x, c.z),
			distanceToSegment2D(px, pz, c.x, c.z, a.x, a.z)
		);

		if (distance <= VERTICAL_MARGIN) {
			return { x: px, z: pz, y: yMin, distance };
		}
	}

	return null;
}

/* ------------------------------------------------------------------ */
/* raceConfig.ts parsing                                               */
/* ------------------------------------------------------------------ */

function readRaceConfig() {
	const source = fs.readFileSync(RACE_CONFIG, 'utf8');

	function number(name) {
		const match = source.match(new RegExp(`export const ${name}\\s*=\\s*([-\\d_.eE]+)`));

		if (!match) {
			fail(`raceConfig.ts no define ${name}`);
			return NaN;
		}

		return Number(match[1].replaceAll('_', ''));
	}

	function objectValue(block, key) {
		const match = block.match(new RegExp(`${key}:\\s*([-\\d_.eE]+)`));
		return match ? Number(match[1].replaceAll('_', '')) : NaN;
	}

	const trackCenterMatch = source.match(
		/export const TRACK_CENTER\s*=\s*\{\s*x:\s*([-\d_.eE]+)\s*,\s*z:\s*([-\d_.eE]+)\s*\}/
	);
	const trackCenter = trackCenterMatch
		? {
				x: Number(trackCenterMatch[1].replaceAll('_', '')),
				z: Number(trackCenterMatch[2].replaceAll('_', ''))
			}
		: { x: NaN, z: NaN };

	const gridBlock = source.match(/export const RACE_GRID[^=]*=\s*\[([\s\S]*?)\n\];/)?.[1] ?? '';
	const grid = [...gridBlock.matchAll(/\{([^}]*)\}/g)].map((match) => ({
		x: objectValue(match[1], 'x'),
		y: objectValue(match[1], 'y'),
		z: objectValue(match[1], 'z')
	}));

	const itemBlock = source.match(/export const RACE_ITEMS[^=]*=\s*\[([\s\S]*?)\n\];/)?.[1] ?? '';
	const items = [...itemBlock.matchAll(/\{([^}]*)\}/g)].map((match) => ({
		id: match[1].match(/id:\s*'([^']+)'/)?.[1] ?? '?',
		x: objectValue(match[1], 'x'),
		y: objectValue(match[1], 'y'),
		z: objectValue(match[1], 'z')
	}));

	if (grid.length !== 6) {
		fail(`RACE_GRID tiene ${grid.length} huecos; se esperaban 6`);
	}

	if (items.length !== 12) {
		fail(`RACE_ITEMS tiene ${items.length} cajas; se esperaban 12`);
	}

	return {
		trackCenter,
		innerRadius: number('TRACK_INNER_RADIUS'),
		outerRadius: number('TRACK_OUTER_RADIUS'),
		centerRadius: number('TRACK_CENTER_RADIUS'),
		surfaceY: number('TRACK_SURFACE_Y'),
		totalLaps: number('TOTAL_LAPS'),
		maxPlayers: number('RACE_MAX_PLAYERS'),
		gateInnerRadius: number('GATE_INNER_RADIUS'),
		gateOuterRadius: number('GATE_OUTER_RADIUS'),
		grid,
		items
	};
}

/* ------------------------------------------------------------------ */
/* Checks                                                              */
/* ------------------------------------------------------------------ */

function radiusOf(config, point) {
	return Math.hypot(point.x - config.trackCenter.x, point.z - config.trackCenter.z);
}

function checkInsideBand(label, point, radius, config, min, max, yMin, yMax) {
	if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) {
		fail(`${label}: coordenadas no finitas`);
		return;
	}

	if (radius < min - EPSILON || radius > max + EPSILON) {
		fail(`${label}: radio ${format(radius)} fuera de [${min}, ${max}]`);
	}

	if (
		Number.isFinite(point.y) &&
		(point.y < yMin - SURFACE_EPSILON || point.y > yMax + SURFACE_EPSILON)
	) {
		fail(`${label}: y=${format(point.y)} fuera de [${yMin}, ${yMax}]`);
	}

	void config;
}

function main() {
	if (!fs.existsSync(MAP_GLB)) {
		fail(`falta ${path.relative(ROOT, MAP_GLB)}`);
		report();
		return;
	}

	if (!fs.existsSync(RACE_CONFIG)) {
		fail(`falta ${path.relative(ROOT, RACE_CONFIG)}`);
		report();
		return;
	}

	const config = readRaceConfig();
	const glb = readGlb(MAP_GLB);
	const { json, bin, sha256, size } = glb;
	const world = buildWorldMatrices(json);
	const nodesByName = new Map();

	for (let index = 0; index < (json.nodes?.length ?? 0); index += 1) {
		const name = json.nodes[index].name;

		if (name && !nodesByName.has(name)) {
			nodesByName.set(name, index);
		}
	}

	const required = ['TWN_Track', 'TWN_Gantry', 'TWN_StartLine', 'TWN_Walls'];

	for (const name of required) {
		if (!nodesByName.has(name)) {
			fail(`nodo inexistente en map.glb: ${name}`);
		}
	}

	summary.push([
		'GLB',
		`${path.basename(MAP_GLB)} · ${(size / 1_000_000).toFixed(2)} MB · ${sha256.slice(0, 12)}…`
	]);

	if (!nodesByName.has('TWN_Track')) {
		report();
		return;
	}

	const track = asphaltBounds(json, bin, world, nodesByName.get('TWN_Track'), config.surfaceY);

	if (!track) {
		fail(`TWN_Track no tiene vértices a y≈${config.surfaceY}`);
		report(config);
		return;
	}

	const measuredCenter = track.center;
	const measuredInner = track.inner;
	const measuredOuter = track.outer;

	summary.push([
		'Centro del asfalto',
		`(${format(measuredCenter.x, 4)}, ${format(measuredCenter.z, 4)})`
	]);
	summary.push(['Radios del asfalto', `${format(measuredInner)} / ${format(measuredOuter)}`]);
	summary.push(['Altura del asfalto', `y = ${format(config.surfaceY)} (${track.count} vértices)`]);

	// The Blender object origin sits at x≈0.1056 while the ring itself is
	// centred at 0, so allow a small offset between origin and geometry.
	if (!approx(measuredCenter.x, config.trackCenter.x, 0.25)) {
		fail(`centro X medido ${format(measuredCenter.x, 4)} ≠ config ${config.trackCenter.x}`);
	}

	if (!approx(measuredCenter.z, config.trackCenter.z, 0.25)) {
		fail(`centro Z medido ${format(measuredCenter.z, 4)} ≠ config ${config.trackCenter.z}`);
	}

	if (!approx(measuredInner, config.innerRadius, 0.25)) {
		fail(`radio interior medido ${format(measuredInner)} ≠ config ${config.innerRadius}`);
	}

	if (!approx(measuredOuter, config.outerRadius, 0.25)) {
		fail(`radio exterior medido ${format(measuredOuter)} ≠ config ${config.outerRadius}`);
	}

	if (config.centerRadius <= config.innerRadius || config.centerRadius >= config.outerRadius) {
		fail(`TRACK_CENTER_RADIUS ${config.centerRadius} no cae dentro del anillo`);
	}

	if (config.totalLaps !== 5) {
		fail(`TOTAL_LAPS debe ser 5, es ${config.totalLaps}`);
	}

	if (config.maxPlayers !== 6) {
		fail(`RACE_MAX_PLAYERS debe ser 6, es ${config.maxPlayers}`);
	}

	// Gantry and start line.
	if (nodesByName.has('TWN_Gantry')) {
		const gantry = nodeWorldBounds(json, bin, world, nodesByName.get('TWN_Gantry'));
		summary.push([
			'Gantry',
			`x ∈ [${format(gantry.min.x)}, ${format(gantry.max.x)}] · z ∈ [${format(gantry.min.z)}, ${format(gantry.max.z)}] · y ∈ [${format(gantry.min.y)}, ${format(gantry.max.y)}]`
		]);

		if (!approx(gantry.min.x, 86.2, 0.5) || !approx(gantry.max.x, 99.8, 0.5)) {
			fail(`el gantry no cruza la pista: x ∈ [${format(gantry.min.x)}, ${format(gantry.max.x)}]`);
		}

		if (Math.abs(gantry.min.z) > 0.8 || Math.abs(gantry.max.z) > 0.8) {
			fail(`el gantry no está sobre z≈0: z ∈ [${format(gantry.min.z)}, ${format(gantry.max.z)}]`);
		}
	}

	if (nodesByName.has('TWN_StartLine')) {
		const line = nodeWorldBounds(json, bin, world, nodesByName.get('TWN_StartLine'));
		summary.push([
			'Línea de meta',
			`x ∈ [${format(line.min.x)}, ${format(line.max.x)}] · z ∈ [${format(line.min.z)}, ${format(line.max.z)}]`
		]);

		if (line.min.x < 85.5 || line.max.x > 100.5) {
			fail(
				`la línea de meta no cubre la pista: x ∈ [${format(line.min.x)}, ${format(line.max.x)}]`
			);
		}

		if (line.min.z > 2 || line.max.z < -2) {
			fail(
				`la línea de meta no es perpendicular a +Z: z ∈ [${format(line.min.z)}, ${format(line.max.z)}]`
			);
		}
	}

	// Grid slots.
	for (const [index, slot] of config.grid.entries()) {
		const radius = radiusOf(config, slot);
		checkInsideBand(`hueco ${index}`, slot, radius, config, 87, 99, 1.0, 1.2);

		if (slot.z > 0) {
			fail(`hueco ${index} no está detrás de la línea de meta (z=${slot.z})`);
		}
	}

	// Gates: 0 is the finish line, 1..7 at 45° steps.
	const gates = Array.from({ length: 8 }, (_, index) => {
		const angle = (index * Math.PI) / 4;
		return {
			index,
			x: config.trackCenter.x + config.centerRadius * Math.cos(angle),
			z: config.trackCenter.z + config.centerRadius * Math.sin(angle)
		};
	});

	for (const gate of gates) {
		const radius = radiusOf(config, gate);
		checkInsideBand(
			`puerta ${gate.index}`,
			gate,
			radius,
			config,
			config.gateInnerRadius,
			config.gateOuterRadius,
			-Infinity,
			Infinity
		);
	}

	summary.push(['Puertas', `${gates.length} sobre radio ${format(config.centerRadius)}`]);

	// Items.
	for (const item of config.items) {
		const radius = radiusOf(config, item);
		checkInsideBand(`caja ${item.id}`, item, radius, config, 87, 99, 1.1, 1.3);
	}

	summary.push(['Cajas', `${config.items.length} a y=1.2`]);

	// Vertical collidable geometry.
	let wallNames = [];

	if (fs.existsSync(MAP_PHYSICS)) {
		try {
			const physics = JSON.parse(fs.readFileSync(MAP_PHYSICS, 'utf8'));
			wallNames = physics.groups?.paredes ?? [];
		} catch (error) {
			fail(`no se pudo leer map.physics.json: ${error.message}`);
		}
	} else {
		fail('falta world/map.physics.json');
	}

	if (wallNames.length > 0) {
		const triangles = collectTriangleSoup(json, bin, world, wallNames);
		const points = [
			...config.grid.map((slot, index) => ({ label: `hueco ${index}`, ...slot })),
			...gates.map((gate) => ({ label: `puerta ${gate.index}`, ...gate })),
			...config.items.map((item) => ({ label: `caja ${item.id}`, ...item }))
		];

		let collisions = 0;

		for (const point of points) {
			const hit = pointHitsVerticalGeometry(point.x, point.z, triangles);

			if (hit) {
				collisions += 1;
				fail(
					`${point.label} (${format(point.x)}, ${format(point.z)}) cae dentro de geometría vertical colisionable a ${format(hit.distance)} m`
				);
			}
		}

		summary.push([
			'Geometría vertical',
			`${wallNames.length} nodos · ${triangles.length / 3} triángulos · ${collisions} colisiones`
		]);
	}

	report(config);
}

function report(config) {
	console.log('\n[race:check] Grand Prix · TWN_Track');
	console.log('[race:check] ------------------------------------------------');

	for (const [label, value] of summary) {
		console.log(`[race:check] ${label.padEnd(20)} ${value}`);
	}

	if (config) {
		console.log('[race:check] ------------------------------------------------');
		console.log(
			`[race:check] ${config.grid.length} huecos · 8 puertas · ${config.items.length} cajas · ${config.totalLaps} vueltas · ${config.maxPlayers} pilotos`
		);
	}

	for (const message of warnings) {
		console.warn(`[race:check] AVISO: ${message}`);
	}

	for (const message of errors) {
		console.error(`[race:check] ERROR: ${message}`);
	}

	console.log('');

	if (errors.length > 0) {
		console.error(`[race:check] FALLÓ con ${errors.length} error(es)`);
		process.exit(1);
	}

	console.log('[race:check] OK');
}

try {
	main();
} catch (error) {
	console.error(`[race:check] ERROR inesperado: ${error.stack ?? error.message}`);
	process.exit(1);
}
