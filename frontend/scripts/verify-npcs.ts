#!/usr/bin/env bun
/**
 * `npcs:check` — validates the lobby NPC roster, clips, routes and dialogue.
 *
 * - The nine GLB models exist and expose the 26 `HR_*` clips.
 * - Every definition points at an existing route and dialogue tree.
 * - Routes (including radial lanes) stay out of vertical map geometry and
 *   always have a floor below them.
 * - A 120 s headless simulation per agent has no NaN, no jumps and no
 *   positions outside the map.
 */
import fs from 'node:fs';
import path from 'node:path';
import { NPC_CLIPS } from '../src/lib/npcs/npcAnimations';
import { createAgent, updateAgent } from '../src/lib/npcs/npcAgent';
import { NPC_DEFINITIONS } from '../src/lib/npcs/npcConfig';
import { NPC_DIALOGUES } from '../src/lib/npcs/npcDialogues';
import { lanePosition, NPC_ROUTES, routeWaypoint } from '../src/lib/npcs/npcRoutes';
import { readGlb, sourceGlbPath, STATIC_DIR } from './world-lib.mjs';

// Draco no permite leer POSITION desde un bufferView: se valida el export original.
const MAP_GLB = sourceGlbPath(path.join(STATIC_DIR, 'maps/map.glb'));
const MAP_PHYSICS = path.join(STATIC_DIR, '..', 'world', 'map.physics.json');

const EXPECTED_MODELS = [
	'characters/Abuela.glb',
	'characters/Abuelo.glb',
	'characters/Hero.glb',
	'characters/Heroina.glb',
	'characters/Hombre.glb',
	'characters/Hombre2.glb',
	'characters/NPC_Joven.glb',
	'characters/NPC_Jovena.glb',
	'characters/NPC_Nina.glb'
];

const SOCIAL_CLIPS = [
	'HR_paquete',
	'HR_gracias',
	'HR_dormir',
	'HR_hablar',
	'HR_si',
	'HR_no',
	'HR_wave',
	'HR_dance'
];

const SAMPLE_STEP = 0.5;
const WALL_MARGIN = 0.35;
const VERTICAL_Y_MIN = 0.15;
const VERTICAL_Y_MAX = 1.8;
const MAP_LIMIT = 134;
const SIMULATION_SECONDS = 480;
const SIMULATION_STEP = 1 / 30;

const errors: string[] = [];
const warnings: string[] = [];

function fail(message: string): void {
	errors.push(message);
}

function warn(message: string): void {
	warnings.push(message);
}

function format(value: number, digits = 2): string {
	return Number.isFinite(value) ? value.toFixed(digits) : String(value);
}

function readJson(file: string): any {
	return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/* ------------------------------------------------------------------ */
/* Minimal glTF math                                                   */
/* ------------------------------------------------------------------ */

function matMultiply(a: number[], b: number[]): number[] {
	const out = new Array<number>(16).fill(0);

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

function matFromTRS(
	translation: number[] = [0, 0, 0],
	rotation: number[] = [0, 0, 0, 1],
	scale: number[] = [1, 1, 1]
): number[] {
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

function nodeMatrix(node: any): number[] {
	return node.matrix
		? node.matrix.slice()
		: matFromTRS(node.translation, node.rotation, node.scale);
}

function transformPoint(matrix: number[], x: number, y: number, z: number) {
	return {
		x: matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
		y: matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
		z: matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]
	};
}

function buildWorldMatrices(json: any): Map<number, number[]> {
	const world = new Map<number, number[]>();
	const identity = matFromTRS();
	const scene = json.scenes?.[json.scene ?? 0];

	function walk(nodeIndex: number, parent: number[]): void {
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

/* ------------------------------------------------------------------ */
/* Accessors and triangle collection                                   */
/* ------------------------------------------------------------------ */

function readVec3Accessor(json: any, bin: Buffer, accessorIndex: number): Float32Array {
	const accessor = json.accessors?.[accessorIndex];

	if (!accessor) {
		throw new Error(`accessor ${accessorIndex} does not exist`);
	}

	if (accessor.componentType !== 5126 || accessor.type !== 'VEC3') {
		throw new Error(`accessor ${accessorIndex} is not VEC3 float32`);
	}

	const view = json.bufferViews?.[accessor.bufferView];

	if (!view) {
		throw new Error(`bufferView for accessor ${accessorIndex} does not exist`);
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

function readIndices(json: any, bin: Buffer, accessorIndex: number): Uint32Array {
	const accessor = json.accessors?.[accessorIndex];
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
			throw new Error(`unsupported index componentType ${accessor.componentType}`);
		}
	}

	return out;
}

type Point = { x: number; y: number; z: number };

type Triangle = {
	a: Point;
	b: Point;
	c: Point;
	name: string;
	minX: number;
	maxX: number;
	minZ: number;
	maxZ: number;
	minY: number;
	maxY: number;
	horizontal: boolean;
};

function collectTriangles(json: any, bin: Buffer, names: Set<string>): Triangle[] {
	const world = buildWorldMatrices(json);
	const triangles: Triangle[] = [];
	const seen = new Set<number>();

	function visit(index: number): void {
		const node = json.nodes?.[index];

		if (!node || seen.has(index)) {
			return;
		}

		seen.add(index);

		if (node.mesh !== undefined && node.name && names.has(node.name)) {
			const matrix = world.get(index);
			const mesh = json.meshes?.[node.mesh];

			for (const primitive of mesh?.primitives ?? []) {
				const positionIndex = primitive.attributes?.POSITION;

				if (positionIndex === undefined || !matrix) {
					continue;
				}

				const positions = readVec3Accessor(json, bin, positionIndex);
				const indices =
					primitive.indices !== undefined ? readIndices(json, bin, primitive.indices) : null;
				const count = indices ? indices.length : positions.length / 3;

				for (let corner = 0; corner + 2 < count; corner += 3) {
					const i0 = indices ? indices[corner] : corner;
					const i1 = indices ? indices[corner + 1] : corner + 1;
					const i2 = indices ? indices[corner + 2] : corner + 2;
					const a = transformPoint(
						matrix,
						positions[i0 * 3],
						positions[i0 * 3 + 1],
						positions[i0 * 3 + 2]
					);
					const b = transformPoint(
						matrix,
						positions[i1 * 3],
						positions[i1 * 3 + 1],
						positions[i1 * 3 + 2]
					);
					const c = transformPoint(
						matrix,
						positions[i2 * 3],
						positions[i2 * 3 + 1],
						positions[i2 * 3 + 2]
					);

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

					triangles.push({
						a,
						b,
						c,
						name: node.name ?? '?',
						minX: Math.min(a.x, b.x, c.x),
						maxX: Math.max(a.x, b.x, c.x),
						minZ: Math.min(a.z, b.z, c.z),
						maxZ: Math.max(a.z, b.z, c.z),
						minY: Math.min(a.y, b.y, c.y),
						maxY: Math.max(a.y, b.y, c.y),
						horizontal: normalLength > 0 && Math.abs(ny) / normalLength > 0.7
					});
				}
			}
		}

		for (const child of node.children ?? []) {
			visit(child);
		}
	}

	for (const root of json.scenes?.[json.scene ?? 0]?.nodes ?? []) {
		visit(root);
	}

	return triangles;
}

function pointInTriangle2D(px: number, pz: number, a: Point, b: Point, c: Point): boolean {
	const d1 = (px - b.x) * (a.z - b.z) - (a.x - b.x) * (pz - b.z);
	const d2 = (px - c.x) * (b.z - c.z) - (b.x - c.x) * (pz - c.z);
	const d3 = (px - a.x) * (c.z - a.z) - (c.x - a.x) * (pz - a.z);
	const hasNegative = d1 < 0 || d2 < 0 || d3 < 0;
	const hasPositive = d1 > 0 || d2 > 0 || d3 > 0;

	return !(hasNegative && hasPositive);
}

function distanceToSegment2D(
	px: number,
	pz: number,
	ax: number,
	az: number,
	bx: number,
	bz: number
): number {
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

function hitsWall(px: number, pz: number, walls: Triangle[]): Triangle | null {
	for (const triangle of walls) {
		if (triangle.maxY < VERTICAL_Y_MIN || triangle.minY > VERTICAL_Y_MAX) {
			continue;
		}

		if (triangle.horizontal) {
			continue;
		}

		if (px < triangle.minX - WALL_MARGIN || px > triangle.maxX + WALL_MARGIN) {
			continue;
		}

		if (pz < triangle.minZ - WALL_MARGIN || pz > triangle.maxZ + WALL_MARGIN) {
			continue;
		}

		if (pointInTriangle2D(px, pz, triangle.a, triangle.b, triangle.c)) {
			return triangle;
		}

		const distance = Math.min(
			distanceToSegment2D(px, pz, triangle.a.x, triangle.a.z, triangle.b.x, triangle.b.z),
			distanceToSegment2D(px, pz, triangle.b.x, triangle.b.z, triangle.c.x, triangle.c.z),
			distanceToSegment2D(px, pz, triangle.c.x, triangle.c.z, triangle.a.x, triangle.a.z)
		);

		if (distance <= WALL_MARGIN) {
			return triangle;
		}
	}

	return null;
}

function hasFloor(px: number, pz: number, groundY: number, floors: Triangle[]): boolean {
	for (const triangle of floors) {
		if (!triangle.horizontal) {
			continue;
		}

		if (px < triangle.minX || px > triangle.maxX || pz < triangle.minZ || pz > triangle.maxZ) {
			continue;
		}

		const y = (triangle.a.y + triangle.b.y + triangle.c.y) / 3;

		if (y < groundY - 1.2 || y > groundY + 1.0) {
			continue;
		}

		if (pointInTriangle2D(px, pz, triangle.a, triangle.b, triangle.c)) {
			return true;
		}
	}

	return false;
}

/* ------------------------------------------------------------------ */
/* Roster and clips                                                    */
/* ------------------------------------------------------------------ */

const ids = new Set<string>();
const models = new Set<string>();
const clipCache = new Map<string, string[]>();

for (const definition of NPC_DEFINITIONS) {
	if (ids.has(definition.id)) {
		fail(`duplicate NPC id: ${definition.id}`);
	}

	ids.add(definition.id);
	models.add(definition.model);

	if (!(definition.routeId in NPC_ROUTES)) {
		fail(`${definition.id}: unknown route ${definition.routeId}`);
	}

	if (!(definition.dialogueId in NPC_DIALOGUES)) {
		fail(`${definition.id}: unknown dialogue ${definition.dialogueId}`);
	}

	if (!(definition.speed >= 1.0 && definition.speed <= 1.4)) {
		fail(`${definition.id}: speed ${definition.speed} is outside 1.0–1.4 m/s`);
	}

	if (!(definition.height > 1.0 && definition.height < 2.6)) {
		fail(`${definition.id}: suspicious height ${definition.height}`);
	}

	if (!/^#[0-9a-f]{6}$/i.test(definition.color)) {
		fail(`${definition.id}: invalid tag color ${definition.color}`);
	}
}

if (NPC_DEFINITIONS.length !== 9) {
	fail(`expected 9 NPC definitions, found ${NPC_DEFINITIONS.length}`);
}

if (models.size !== 9) {
	fail(`expected 9 distinct GLB models, found ${models.size}`);
}

for (const model of EXPECTED_MODELS) {
	if (!models.has(model)) {
		fail(`the roster does not use ${model}`);
	}
}

for (const model of models) {
	const file = path.join(STATIC_DIR, model);

	if (!fs.existsSync(file)) {
		fail(`missing model: ${model}`);
		continue;
	}

	try {
		const glb = readGlb(file);
		const clips: string[] = (glb.json.animations ?? []).map((animation: any) => animation.name);
		clipCache.set(model, clips);

		if (clips.length !== 26) {
			fail(`${model}: expected 26 clips, found ${clips.length}`);
		}

		if (new Set(clips).size !== clips.length) {
			fail(`${model}: duplicate clip names`);
		}

		for (const clip of Object.values(NPC_CLIPS)) {
			if (!clips.includes(clip)) {
				fail(`${model}: missing clip ${clip}`);
			}
		}

		for (const clip of SOCIAL_CLIPS) {
			if (!clips.includes(clip)) {
				fail(`${model}: missing social clip ${clip}`);
			}
		}
	} catch (error) {
		fail(`${model}: ${(error as Error).message}`);
	}
}

/* ------------------------------------------------------------------ */
/* Dialogues                                                           */
/* ------------------------------------------------------------------ */

for (const definition of NPC_DEFINITIONS) {
	const dialogue = NPC_DIALOGUES[definition.dialogueId];

	if (!dialogue) {
		continue;
	}

	const starts = Object.values(dialogue.starts);

	for (const start of starts) {
		if (typeof start !== 'string' || !dialogue.nodes[start]) {
			fail(`${definition.dialogueId}: start node ${start} does not exist`);
		}
	}

	for (const [nodeId, node] of Object.entries(dialogue.nodes)) {
		if (node.choices.length === 0) {
			fail(`${definition.dialogueId}.${nodeId}: no choices (dead end)`);
		}

		for (const choice of node.choices) {
			if (choice.next && !dialogue.nodes[choice.next]) {
				fail(`${definition.dialogueId}.${nodeId}: choice points at unknown node ${choice.next}`);
			}

			if (!choice.next && !choice.action) {
				warn(
					`${definition.dialogueId}.${nodeId}: choice "${choice.label}" closes without an action`
				);
			}

			if (choice.action === 'give-package' && choice.requires !== 'none') {
				fail(`${definition.dialogueId}.${nodeId}: give-package must require quest "none"`);
			}

			if (choice.action === 'deliver-package' && choice.requires !== 'carrying') {
				fail(`${definition.dialogueId}.${nodeId}: deliver-package must require quest "carrying"`);
			}
		}
	}
}

/* ------------------------------------------------------------------ */
/* Routes and lanes                                                    */
/* ------------------------------------------------------------------ */

const lanesByRoute = new Map<string, Set<number>>();

for (const definition of NPC_DEFINITIONS) {
	const route = NPC_ROUTES[definition.routeId];

	if (!route) {
		continue;
	}

	const lanes = lanesByRoute.get(route.id) ?? new Set<number>();
	lanes.add(definition.lane);
	lanesByRoute.set(route.id, lanes);

	if (definition.startIndex < 0 || definition.startIndex >= route.waypoints.length) {
		fail(`${definition.id}: startIndex ${definition.startIndex} is outside ${route.id}`);
	}

	for (const visit of definition.visits ?? []) {
		if (!route.waypoints.some((waypoint) => waypoint.visit === visit)) {
			fail(`${definition.id}: visit ${visit} does not exist on ${route.id}`);
		}
	}

	if (definition.restAt && !(definition.visits ?? []).includes(definition.restAt)) {
		fail(`${definition.id}: restAt ${definition.restAt} is not one of its visits`);
	}
}

for (const route of Object.values(NPC_ROUTES)) {
	if (!route.loop) {
		fail(`${route.id}: route is not a loop`);
	}

	if (route.waypoints.length < 3) {
		fail(`${route.id}: needs at least 3 waypoints`);
	}

	const visits = new Set<string>();

	for (const [index, waypoint] of route.waypoints.entries()) {
		if (!Number.isFinite(waypoint.x) || !Number.isFinite(waypoint.z)) {
			fail(`${route.id}[${index}]: non-finite coordinates`);
		}

		if (Math.abs(waypoint.x) > MAP_LIMIT || Math.abs(waypoint.z) > MAP_LIMIT) {
			fail(`${route.id}[${index}]: outside the map limits`);
		}

		if (waypoint.visit) {
			if (visits.has(waypoint.visit)) {
				fail(`${route.id}: duplicate visit id ${waypoint.visit}`);
			}

			visits.add(waypoint.visit);

			if (!waypoint.pause) {
				warn(`${route.id}.${waypoint.visit}: visit without a pause range`);
			}
		}
	}
}

/* ------------------------------------------------------------------ */
/* Geometry checks                                                     */
/* ------------------------------------------------------------------ */

const physics = readJson(MAP_PHYSICS);
const mapGlb = readGlb(MAP_GLB);
const wallNames = new Set<string>([
	...(physics.groups?.paredes ?? []),
	...(physics.groups?.obstaculos ?? [])
]);
const floorNames = new Set<string>(physics.groups?.suelo ?? []);

if (wallNames.size === 0 || floorNames.size === 0) {
	fail('map.physics.json has no paredes/obstaculos/suelo groups');
}

const walls = collectTriangles(mapGlb.json, mapGlb.bin, wallNames);
const floors = collectTriangles(mapGlb.json, mapGlb.bin, floorNames);

let wallHits = 0;
let floorMisses = 0;
let samples = 0;

for (const route of Object.values(NPC_ROUTES)) {
	const lanes = [...(lanesByRoute.get(route.id) ?? new Set<number>([0]))].sort((a, b) => a - b);
	const count = route.waypoints.length;

	for (const lane of lanes) {
		const points = route.waypoints.map((waypoint) => lanePosition(waypoint, lane));

		for (let index = 0; index < count; index += 1) {
			const start = points[index]!;
			const end = points[(index + 1) % count]!;
			const length = Math.hypot(end.x - start.x, end.z - start.z);
			const steps = Math.max(1, Math.ceil(length / SAMPLE_STEP));

			for (let step = 0; step <= steps; step += 1) {
				const t = step / steps;
				const x = start.x + (end.x - start.x) * t;
				const z = start.z + (end.z - start.z) * t;

				samples += 1;

				if (!Number.isFinite(x) || !Number.isFinite(z)) {
					fail(`${route.id}: non-finite sample on lane ${lane}`);
					continue;
				}

				const wall = hitsWall(x, z, walls);

				if (wall) {
					wallHits += 1;
					fail(
						`${route.id} lane ${lane}: sample (${format(x)}, ${format(z)}) hits ${wall.name} at y ${format(wall.minY)}`
					);
				}

				if (!hasFloor(x, z, route.groundY, floors)) {
					floorMisses += 1;
					fail(
						`${route.id} lane ${lane}: no floor under (${format(x)}, ${format(z)}) around y ${format(route.groundY)}`
					);
				}
			}
		}
	}
}

/* ------------------------------------------------------------------ */
/* Headless simulation                                                 */
/* ------------------------------------------------------------------ */

let simulatedSteps = 0;

for (const definition of NPC_DEFINITIONS) {
	const route = NPC_ROUTES[definition.routeId];

	if (!route) {
		continue;
	}

	const agent = createAgent(definition, route);
	const steps = Math.round(SIMULATION_SECONDS / SIMULATION_STEP);
	let previousX = agent.x;
	let previousZ = agent.z;
	let arrivals = 0;
	let pauses = 0;
	let previousTarget = agent.targetIndex;
	let finite = true;
	let inside = true;
	let overspeed = false;

	for (let step = 0; step < steps; step += 1) {
		updateAgent(agent, {
			delta: SIMULATION_STEP,
			nowMs: step * SIMULATION_STEP * 1000,
			playerActive: false,
			playerX: 0,
			playerZ: 0,
			dialog: false,
			others: []
		});

		simulatedSteps += 1;

		if (!Number.isFinite(agent.x) || !Number.isFinite(agent.y) || !Number.isFinite(agent.z)) {
			finite = false;
			break;
		}

		if (Math.abs(agent.x) > MAP_LIMIT || Math.abs(agent.z) > MAP_LIMIT || agent.y < -2) {
			inside = false;
			break;
		}

		const distance = Math.hypot(agent.x - previousX, agent.z - previousZ);

		if (distance > definition.speed * SIMULATION_STEP + 0.05) {
			overspeed = true;
			break;
		}

		if (agent.targetIndex !== previousTarget) {
			arrivals += 1;
			previousTarget = agent.targetIndex;
		}

		if (agent.phase !== 'walking') {
			pauses += 1;
		}

		previousX = agent.x;
		previousZ = agent.z;
	}

	if (!finite) {
		fail(`${definition.id}: simulation produced NaN or Infinity`);
	}

	if (!inside) {
		fail(`${definition.id}: simulation left the map or fell below the floor`);
	}

	if (overspeed) {
		fail(`${definition.id}: simulation moved faster than ${definition.speed} m/s`);
	}

	if (arrivals < 2) {
		fail(`${definition.id}: simulation did not advance through the route (${arrivals} arrivals)`);
	}

	const hasVisits = (definition.visits ?? []).length > 0;

	if (hasVisits && pauses === 0) {
		fail(`${definition.id}: never stopped at its visits in ${SIMULATION_SECONDS}s`);
	}
}

/* ------------------------------------------------------------------ */
/* Summary                                                             */
/* ------------------------------------------------------------------ */

const clipCount = [...clipCache.entries()]
	.map(([model, clips]) => `${model}: ${clips.length}`)
	.join(', ');

console.log(`npcs:check — ${NPC_DEFINITIONS.length} NPCs, ${models.size} models`);
console.log(`clips — ${clipCount}`);
console.log(
	`routes — ${Object.keys(NPC_ROUTES).length}, ${Object.values(NPC_ROUTES).reduce(
		(total, route) => total + route.waypoints.length,
		0
	)} waypoints, ${samples} geometry samples`
);
console.log(
	`geometry — ${wallHits} wall hits, ${floorMisses} floor misses; simulation: ${simulatedSteps} steps`
);

if (warnings.length > 0) {
	console.warn(`\n${warnings.length} warning(s):`);

	for (const warning of warnings) {
		console.warn(`  - ${warning}`);
	}
}

if (errors.length > 0) {
	console.error(`\n${errors.length} error(s):`);

	for (const error of errors) {
		console.error(`  - ${error}`);
	}

	process.exitCode = 1;
} else {
	console.log('\nAll NPC checks passed.');
}
