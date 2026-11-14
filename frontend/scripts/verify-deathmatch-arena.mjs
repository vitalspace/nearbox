/**
 * `dm:check` — valida las constantes de Witch House Deathmatch (`dmConfig.ts`)
 * contra los mapas reales.
 *
 *   1. El checkpoint cae sobre `WHH_Path`, delante de `WHH_Porch` y dentro de
 *      la casa de la bruja del área 1 de `map.glb`.
 *   2. Las dos anclas de equipo están separadas ≈ 91 m y sus 12 slots caen
 *      dentro de `ARENA_POLYGON`, fuera de `BUILDING_BLOCKS` y sobre el suelo.
 *   3. Los 13 pickups caen dentro de la arena, fuera de los edificios y no se
 *      solapan entre sí.
 *   4. Los cooldowns, límites de equipo y loadout respetan el spec.
 *
 * Se ejecuta con Bun (`bun scripts/verify-deathmatch-arena.mjs`) porque los
 * módulos de `src/lib/state` usan imports TS sin extensión.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const {
	ARENA_POLYGON,
	BUILDING_BLOCKS,
	DM_CHECKPOINT,
	DM_CHECKPOINT_RADIUS,
	DM_COUNTDOWN_MS,
	DM_MATCH_MS,
	DM_MAX_PLAYERS,
	DM_PICKUPS,
	DM_PICKUP_RADIUS,
	DM_RESPAWN_MS,
	DM_RESULT_MS,
	DM_SPAWN_PROTECTION_MS,
	DM_STARTER_AMMO,
	DM_STARTER_GRENADES,
	DM_STARTER_WEAPON,
	DM_TEAMS,
	DM_TEAM_ANCHORS,
	DM_TEAM_SIZE,
	DM_TEAM_SPAWNS,
	MAX_GRENADES,
	PLAYER_MAX_HEALTH,
	dmDistance,
	dmPointInArena
} = await import('../src/lib/state/dmConfig.ts');

function fail(message) {
	console.error(`dm:check ✗ ${message}`);
	process.exit(1);
}

function ok(message) {
	console.log(`dm:check ✓ ${message}`);
}

function readGlbJson(path) {
	const buf = readFileSync(path);

	if (buf.readUInt32LE(0) !== 0x46546c67) {
		fail(`${path} no es un GLB (magic incorrecto)`);
	}

	const jsonLength = buf.readUInt32LE(12);
	return JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'));
}

// ---------------------------------------------------------------------------
// Matrices glTF (column-major) para obtener bboxes en espacio de mundo.
// ---------------------------------------------------------------------------

function identity() {
	return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function multiply(a, b) {
	const out = new Array(16);

	for (let column = 0; column < 4; column += 1) {
		for (let row = 0; row < 4; row += 1) {
			out[column * 4 + row] =
				a[row] * b[column * 4] +
				a[4 + row] * b[column * 4 + 1] +
				a[8 + row] * b[column * 4 + 2] +
				a[12 + row] * b[column * 4 + 3];
		}
	}

	return out;
}

function localMatrix(node) {
	if (node.matrix) {
		return node.matrix.slice();
	}

	const [tx, ty, tz] = node.translation ?? [0, 0, 0];
	const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
	const [sx, sy, sz] = node.scale ?? [1, 1, 1];

	const xx = qx * qx;
	const yy = qy * qy;
	const zz = qz * qz;
	const xy = qx * qy;
	const xz = qx * qz;
	const yz = qy * qz;
	const wx = qw * qx;
	const wy = qw * qy;
	const wz = qw * qz;

	return [
		(1 - 2 * (yy + zz)) * sx,
		2 * (xy + wz) * sx,
		2 * (xz - wy) * sx,
		0,
		2 * (xy - wz) * sy,
		(1 - 2 * (xx + zz)) * sy,
		2 * (yz + wx) * sy,
		0,
		2 * (xz + wy) * sz,
		2 * (yz - wx) * sz,
		(1 - 2 * (xx + yy)) * sz,
		0,
		tx,
		ty,
		tz,
		1
	];
}

function transformPoint(matrix, x, y, z) {
	return [
		matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
		matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
		matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]
	];
}

function worldMatrices(json) {
	const parents = new Map();

	(json.nodes ?? []).forEach((node, index) => {
		for (const child of node.children ?? []) {
			parents.set(child, index);
		}
	});

	const cache = new Map();

	function world(index) {
		if (cache.has(index)) {
			return cache.get(index);
		}

		const node = json.nodes[index];
		const parent = parents.get(index);
		const matrix =
			parent === undefined ? localMatrix(node) : multiply(world(parent), localMatrix(node));

		cache.set(index, matrix);
		return matrix;
	}

	return world;
}

function nodeWorldBounds(json, name) {
	const index = (json.nodes ?? []).findIndex((node) => node.name === name);

	if (index < 0) {
		fail(`no se encontró el nodo \`${name}\` en el GLB`);
	}

	const node = json.nodes[index];

	if (node.mesh === undefined) {
		fail(`el nodo \`${name}\` no tiene malla`);
	}

	const matrix = worldMatrices(json)(index);
	const mesh = json.meshes[node.mesh];
	const min = [Infinity, Infinity, Infinity];
	const max = [-Infinity, -Infinity, -Infinity];

	for (const primitive of mesh.primitives ?? []) {
		const accessor = json.accessors?.[primitive.attributes?.POSITION];

		if (!accessor?.min || !accessor?.max) {
			continue;
		}

		for (let corner = 0; corner < 8; corner += 1) {
			const x = corner & 1 ? accessor.max[0] : accessor.min[0];
			const y = corner & 2 ? accessor.max[1] : accessor.min[1];
			const z = corner & 4 ? accessor.max[2] : accessor.min[2];
			const point = transformPoint(matrix, x, y, z);

			for (let axis = 0; axis < 3; axis += 1) {
				min[axis] = Math.min(min[axis], point[axis]);
				max[axis] = Math.max(max[axis], point[axis]);
			}
		}
	}

	return { min, max };
}

function insideBounds(bounds, x, z, margin = 0) {
	return (
		x >= bounds.min[0] - margin &&
		x <= bounds.max[0] + margin &&
		z >= bounds.min[2] - margin &&
		z <= bounds.max[2] + margin
	);
}

// ---------------------------------------------------------------------------
// 1. Checkpoint sobre el camino de la casa de la bruja
// ---------------------------------------------------------------------------

const mapJson = readGlbJson(join(root, 'static', 'maps/map.glb'));
const path = nodeWorldBounds(mapJson, 'WHH_Path');
const porch = nodeWorldBounds(mapJson, 'WHH_Porch');

if (!insideBounds(path, DM_CHECKPOINT.x, DM_CHECKPOINT.z)) {
	fail(
		`el checkpoint (${DM_CHECKPOINT.x}, ${DM_CHECKPOINT.z}) no cae sobre WHH_Path ` +
			`[x ${path.min[0].toFixed(2)}..${path.max[0].toFixed(2)}, z ${path.min[2].toFixed(2)}..${path.max[2].toFixed(2)}]`
	);
}

if (DM_CHECKPOINT.x < porch.min[0] - 2 || DM_CHECKPOINT.x > porch.max[0] + 2) {
	fail(
		`el checkpoint x=${DM_CHECKPOINT.x} no está alineado con la puerta del porche ` +
			`[${porch.min[0].toFixed(2)}..${porch.max[0].toFixed(2)}]`
	);
}

const porchGap = DM_CHECKPOINT.z - porch.max[2];

if (porchGap < 0.25 || porchGap > 3) {
	fail(
		`el checkpoint z=${DM_CHECKPOINT.z} no está delante del porche ` +
			`(hueco ${porchGap.toFixed(2)} m, se esperaba 0.25..3 m)`
	);
}

if (DM_CHECKPOINT_RADIUS < 1.5 || DM_CHECKPOINT_RADIUS > 3) {
	fail(`radio de checkpoint ${DM_CHECKPOINT_RADIUS} fuera de rango`);
}

ok(
	`checkpoint sobre WHH_Path, a ${porchGap.toFixed(2)} m del porche ` +
		`(radio ${DM_CHECKPOINT_RADIUS} m)`
);

// ---------------------------------------------------------------------------
// 2. Reglas del modo
// ---------------------------------------------------------------------------

if (DM_MAX_PLAYERS !== 12 || DM_TEAM_SIZE !== 6) {
	fail(`jugadores mal configurados: ${DM_MAX_PLAYERS} totales, ${DM_TEAM_SIZE} por equipo`);
}

if (DM_TEAMS.length !== 2) {
	fail(`se esperaban 2 equipos, hay ${DM_TEAMS.length}`);
}

if (DM_COUNTDOWN_MS !== 30_000 || DM_MATCH_MS !== 360_000 || DM_RESULT_MS !== 15_000) {
	fail('duraciones de countdown/partida/resultados distintas del spec');
}

if (DM_RESPAWN_MS !== 3_000 || DM_SPAWN_PROTECTION_MS !== 5_000) {
	fail('respawn o protección de aparición distintas del spec');
}

if (DM_STARTER_WEAPON !== 'pistol' || DM_STARTER_AMMO !== 60 || DM_STARTER_GRENADES !== 1) {
	fail('loadout inicial distinto del spec (pistola, 60, 1 granada)');
}

if (PLAYER_MAX_HEALTH !== 100 || MAX_GRENADES !== 6) {
	fail('vida máxima o granadas máximas distintas del spec');
}

ok('reglas OK — 12 jugadores, 30 s + 6 min + 15 s, respawn 3 s, protección 5 s');

// ---------------------------------------------------------------------------
// 3. Spawns
// ---------------------------------------------------------------------------

const anchorDistance = dmDistance(
	DM_TEAM_ANCHORS.coven.x,
	DM_TEAM_ANCHORS.coven.z,
	DM_TEAM_ANCHORS.hunters.x,
	DM_TEAM_ANCHORS.hunters.z
);

if (Math.abs(anchorDistance - 91.3) > 1.5) {
	fail(`separación entre anclas ${anchorDistance.toFixed(1)} m, se esperaba ≈ 91.3 m`);
}

const obstacles = BUILDING_BLOCKS.map((block, index) => ({
	name: `BUILDING_BLOCKS[${index}]`,
	minX: block.minX - 0.5,
	maxX: block.maxX + 0.5,
	minZ: block.minZ - 0.5,
	maxZ: block.maxZ + 0.5
}));

for (const team of DM_TEAMS) {
	const slots = DM_TEAM_SPAWNS[team];

	if (slots.length !== DM_TEAM_SIZE) {
		fail(`el equipo ${team} tiene ${slots.length} slots, se esperaban ${DM_TEAM_SIZE}`);
	}

	for (let index = 0; index < slots.length; index += 1) {
		const slot = slots[index];
		const label = `spawn ${team}[${index}] (${slot.x}, ${slot.z})`;

		if (!dmPointInArena(slot.x, slot.z)) {
			fail(`${label} está fuera de ARENA_POLYGON`);
		}

		for (const obstacle of obstacles) {
			if (
				slot.x >= obstacle.minX &&
				slot.x <= obstacle.maxX &&
				slot.z >= obstacle.minZ &&
				slot.z <= obstacle.maxZ
			) {
				fail(`${label} cae dentro de ${obstacle.name}`);
			}
		}
	}
}

ok(`spawns OK — 12 slots dentro de la arena, anclas separadas ${anchorDistance.toFixed(1)} m`);

// ---------------------------------------------------------------------------
// 4. Pickups
// ---------------------------------------------------------------------------

if (DM_PICKUPS.length !== 13) {
	fail(`se esperaban 13 pickups, hay ${DM_PICKUPS.length}`);
}

const ids = new Set();
const kinds = new Set();

for (const pickup of DM_PICKUPS) {
	const label = `pickup ${pickup.id} (${pickup.x}, ${pickup.z})`;

	if (ids.has(pickup.id)) {
		fail(`id duplicado: ${pickup.id}`);
	}

	ids.add(pickup.id);
	kinds.add(pickup.kind);

	if (!dmPointInArena(pickup.x, pickup.z)) {
		fail(`${label} está fuera de ARENA_POLYGON`);
	}

	for (const obstacle of obstacles) {
		if (
			pickup.x >= obstacle.minX &&
			pickup.x <= obstacle.maxX &&
			pickup.z >= obstacle.minZ &&
			pickup.z <= obstacle.maxZ
		) {
			fail(`${label} cae dentro de ${obstacle.name}`);
		}
	}

	if (pickup.respawnMs < 5_000 || pickup.respawnMs > 60_000) {
		fail(`${label} tiene un respawn irreal (${pickup.respawnMs} ms)`);
	}

	for (const other of DM_PICKUPS) {
		if (other.id <= pickup.id) {
			continue;
		}

		const distance = dmDistance(pickup.x, pickup.z, other.x, other.z);

		if (distance < DM_PICKUP_RADIUS * 2) {
			fail(`${pickup.id} y ${other.id} están solapados (${distance.toFixed(2)} m)`);
		}
	}
}

for (const kind of ['shotgun', 'smg', 'rifle', 'grenade', 'ammo', 'medkit']) {
	if (!kinds.has(kind)) {
		fail(`falta al menos un pickup de tipo \`${kind}\``);
	}
}

ok(`pickups OK — ${DM_PICKUPS.length} disponibles, dentro de la arena y sin solapes`);

// ---------------------------------------------------------------------------
// 5. Suelo de barnsiege
// ---------------------------------------------------------------------------

const arenaJson = readGlbJson(join(root, 'static', 'maps/barnsiege.glb'));
const ground = nodeWorldBounds(arenaJson, 'BS_Ground');

for (const [x, z] of ARENA_POLYGON) {
	if (!insideBounds(ground, x, z, 0.1)) {
		fail(`el vértice (${x}, ${z}) del polígono cae fuera de BS_Ground`);
	}
}

ok(
	`suelo OK — BS_Ground cubre ARENA_POLYGON ` +
		`(${ground.min[0].toFixed(1)}..${ground.max[0].toFixed(1)} × ` +
		`${ground.min[2].toFixed(1)}..${ground.max[2].toFixed(1)})`
);

console.log('dm:check ✓ todo correcto');
