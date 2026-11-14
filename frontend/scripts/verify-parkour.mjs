/**
 * `parkour:check` — valida la carrera de la Torre de Halloween contra
 * `Parkour.glb`, `parkour.physics.json` y `parkourConfig.ts`.
 *
 * Solo Node (`fs`, `crypto`); no toca Three ni Threlte. Comprueba:
 *   1. GLB presente, tamaño y SHA-256 contra la física.
 *   2. Conteo de nodos, mallas y animaciones de la escena por defecto.
 *   3. Nodos de START, CP1–CP12 y FINISH.
 *   4. Coordenadas de checkpoint = traslación de su `*_Root`; FINISH =
 *      superficie superior de `HP_SummitTerrace` (86), no su origen.
 *   5. Cada checkpoint está sobre una plaza con la misma superficie.
 *   6. Rejilla 4×3 dentro de `HP_SpawnPad` y fuera del arco.
 *   7. Los 85 nodos de `suelo`, sus triángulos y la lista de exclusión.
 *   8. Saltos directos ≤ 5.2 m / ≤ 1.2 m de subida y rampas ≤ 0.40.
 *   9. Los seis guardianes sobre una superficie de ruta, fuera del radio de
 *      checkpoint y con `y` igual a la superficie.
 *  10. Constantes de partida del motor.
 *
 * Sale con código 1 y un mensaje claro si algo falla.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
	loadMaps,
	loadPhysics,
	localMatrix,
	matchesAny,
	meshAabb,
	meshTriangles,
	multiplyMatrices,
	readGlb,
	transformAabb,
	transformPoint
} from './world-lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const {
	PARKOUR_CHECKPOINTS,
	PARKOUR_CHECKPOINT_RADIUS,
	PARKOUR_COUNTDOWN_MS,
	PARKOUR_COUNTDOWN_SHORT_MS,
	PARKOUR_EXCLUDED_PATTERNS,
	PARKOUR_FINISH,
	PARKOUR_FINISH_RADIUS,
	PARKOUR_FINISH_ZONE,
	PARKOUR_JUMP_SPEED,
	PARKOUR_MAX_PLAYERS,
	PARKOUR_MAX_PUSH_HORIZONTAL,
	PARKOUR_MAX_PUSH_VERTICAL,
	PARKOUR_MATCH_MAX_MS,
	PARKOUR_RESULTS_MS,
	PARKOUR_WARDEN_VERTICAL_REACH,
	PARKOUR_ROUTE,
	PARKOUR_START,
	PARKOUR_START_GRID,
	PARKOUR_TOWER_RAMPS,
	PARKOUR_WARDENS
} = await import('../src/lib/state/parkourConfig.ts');

const EXPECTED_SIZE = 22_559_436;
const EXPECTED_NODES = 2_132;
const EXPECTED_MESHES = 2_100;
const EXPECTED_ANIMATIONS = 57;
const EXPECTED_COLLIDER_NODES = 85;
const EXPECTED_COLLIDER_TRIANGLES = 3_244;
const MAX_JUMP_GAP = 5.2;
const MAX_JUMP_RISE = 1.2;
const MAX_RAMP_SLOPE = 0.4;
const TOLERANCE = 0.01;

function fail(message) {
	console.error(`parkour:check ✗ ${message}`);
	process.exit(1);
}

function check(condition, message) {
	if (!condition) fail(message);
}

function close(a, b, tolerance = TOLERANCE) {
	return Math.abs(a - b) <= tolerance;
}

function indexNodes(json) {
	const byName = new Map();

	json.nodes?.forEach((node, index) => {
		if (node.name && !byName.has(node.name)) byName.set(node.name, index);
	});

	return byName;
}

function parentMap(json) {
	const parents = new Map();

	json.nodes?.forEach((node, index) => {
		for (const child of node.children ?? []) parents.set(child, index);
	});

	return parents;
}

function worldMatrix(json, parents, index) {
	const chain = [];
	let current = index;

	while (current !== undefined) {
		chain.unshift(current);
		current = parents.get(current);
	}

	let matrix = null;

	for (const nodeIndex of chain) {
		const local = localMatrix(json.nodes[nodeIndex]);
		matrix = matrix ? multiplyMatrices(matrix, local) : local;
	}

	return matrix;
}

function nodeWorldPoint(json, parents, index) {
	return transformPoint(worldMatrix(json, parents, index), [0, 0, 0]);
}

function nodeWorldAabb(json, bin, parents, index) {
	const node = json.nodes[index];

	if (!node || node.mesh === undefined) return null;

	const local = meshAabb(json, bin, node.mesh);

	if (!local) return null;

	return transformAabb(worldMatrix(json, parents, index), local.min, local.max);
}

/** Posiciones VEC3/float32 de un accessor, ya decodificadas. */
function accessorPositions(json, bin, accessorIndex) {
	const accessor = json.accessors?.[accessorIndex];
	if (!accessor || accessor.type !== 'VEC3' || accessor.componentType !== 5126) return null;

	const view = json.bufferViews?.[accessor.bufferView];
	if (!view) return null;

	const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
	const stride = view.byteStride ?? 12;
	const positions = new Float32Array(accessor.count * 3);

	for (let index = 0; index < accessor.count; index += 1) {
		const offset = base + index * stride;
		positions[index * 3] = bin.readFloatLE(offset);
		positions[index * 3 + 1] = bin.readFloatLE(offset + 4);
		positions[index * 3 + 2] = bin.readFloatLE(offset + 8);
	}

	return positions;
}

/** Índices de un accessor, o `null` si la primitiva no está indexada. */
function accessorIndices(json, bin, accessorIndex) {
	if (accessorIndex === undefined) return null;

	const accessor = json.accessors?.[accessorIndex];
	const view = json.bufferViews?.[accessor.bufferView];
	if (!accessor || !view) return null;

	const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
	const stride =
		view.byteStride ??
		(accessor.componentType === 5121 ? 1 : accessor.componentType === 5123 ? 2 : 4);
	const read =
		accessor.componentType === 5121
			? (offset) => bin.readUInt8(offset)
			: accessor.componentType === 5123
				? (offset) => bin.readUInt16LE(offset)
				: (offset) => bin.readUInt32LE(offset);
	const indices = new Uint32Array(accessor.count);

	for (let index = 0; index < accessor.count; index += 1) {
		indices[index] = read(base + index * stride);
	}

	return indices;
}

/** Triángulos del nodo en coordenadas de mundo. */
function nodeWorldTriangles(json, bin, parents, index) {
	const node = json.nodes[index];
	if (!node || node.mesh === undefined) return [];

	const matrix = worldMatrix(json, parents, index);
	const mesh = json.meshes?.[node.mesh];
	const triangles = [];

	for (const primitive of mesh?.primitives ?? []) {
		const positions = accessorPositions(json, bin, primitive.attributes?.POSITION);
		if (!positions) continue;

		const indices = accessorIndices(json, bin, primitive.indices);
		const count = indices ? indices.length : positions.length / 3;

		for (let offset = 0; offset + 2 < count; offset += 3) {
			const a = indices ? indices[offset] : offset;
			const b = indices ? indices[offset + 1] : offset + 1;
			const c = indices ? indices[offset + 2] : offset + 2;

			triangles.push(
				transformPoint(matrix, [positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2]]),
				transformPoint(matrix, [positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2]]),
				transformPoint(matrix, [positions[c * 3], positions[c * 3 + 1], positions[c * 3 + 2]])
			);
		}
	}

	return triangles;
}

/** Altura de la superficie más alta del triángulo bajo `(x, z)`, o `null`. */
function surfaceYAt(triangles, x, z) {
	let best = null;

	for (let index = 0; index + 2 < triangles.length; index += 3) {
		const [ax, ay, az] = triangles[index];
		const [bx, by, bz] = triangles[index + 1];
		const [cx, cy, cz] = triangles[index + 2];

		const denominator = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
		if (Math.abs(denominator) < 1e-9) continue;

		const wa = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / denominator;
		const wb = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / denominator;
		const wc = 1 - wa - wb;

		if (wa < -1e-6 || wb < -1e-6 || wc < -1e-6) continue;

		const y = wa * ay + wb * by + wc * cy;
		best = best === null ? y : Math.max(best, y);
	}

	return best;
}

const maps = loadMaps();
const entry = maps.maps?.parkour;

check(entry, '`world/maps.json` no contiene la entrada `parkour`');
check(entry.manualComponent === true, '`parkour` debe tener `manualComponent: true`');
check(entry.manualPhysics === true, '`parkour` debe tener `manualPhysics: true`');
check(entry.glb === 'maps/Parkour.glb', '`parkour.glb` debe ser `Parkour.glb`');

const glbPath = join(root, 'static', entry.glb);

check(existsSync(glbPath), `falta ${glbPath}`);

const glb = readGlb(glbPath);
const json = glb.json;
const bin = glb.bin;

check(
	glb.size === EXPECTED_SIZE,
	`${entry.glb} pesa ${glb.size} bytes; se esperaban ${EXPECTED_SIZE}`
);

const physics = loadPhysics(entry);

check(physics, `falta world/${entry.physics}`);
check(
	glb.sha256 === physics.sourceSha256,
	`SHA-256 de ${entry.glb} no coincide con ${entry.physics}`
);

check(
	(json.nodes?.length ?? 0) === EXPECTED_NODES,
	`${entry.glb} tiene ${json.nodes?.length ?? 0} nodos; se esperaban ${EXPECTED_NODES}`
);
check(
	(json.meshes?.length ?? 0) === EXPECTED_MESHES,
	`${entry.glb} tiene ${json.meshes?.length ?? 0} mallas; se esperaban ${EXPECTED_MESHES}`
);
check(
	(json.animations?.length ?? 0) === EXPECTED_ANIMATIONS,
	`${entry.glb} tiene ${json.animations?.length ?? 0} animaciones; se esperaban ${EXPECTED_ANIMATIONS}`
);

console.log(
	`${entry.glb} OK — ${json.nodes.length} nodos, ${json.meshes.length} mallas, ` +
		`${json.animations.length} animaciones, ${glb.size} bytes`
);

const byName = indexNodes(json);
const parents = parentMap(json);

function requireNode(name) {
	check(byName.has(name), `falta el nodo \`${name}\` en ${entry.glb}`);
	return byName.get(name);
}

const required = [
	'HP_Spawn_Top',
	'HP_SpawnPad',
	'HP_SummitTerrace',
	...PARKOUR_CHECKPOINTS.map((checkpoint) => checkpoint.node)
];

for (const name of required) requireNode(name);

// --- checkpoints: root translation ↔ config ------------------------------

for (const checkpoint of PARKOUR_CHECKPOINTS) {
	const index = requireNode(checkpoint.node);
	const point = nodeWorldPoint(json, parents, index);

	check(
		close(point[0], checkpoint.x) && close(point[1], checkpoint.y) && close(point[2], checkpoint.z),
		`${checkpoint.node} está en (${point.map((value) => value.toFixed(3)).join(', ')}), ` +
			`pero parkourConfig.ts dice (${checkpoint.x}, ${checkpoint.y}, ${checkpoint.z})`
	);

	const plazaName = checkpoint.node.replace('_Root', '_Plaza');
	const plazaIndex = requireNode(plazaName);
	const plaza = nodeWorldAabb(json, bin, parents, plazaIndex);

	check(plaza, `${plazaName} no tiene malla`);
	check(
		close(plaza.max[1], checkpoint.y, 0.05),
		`${checkpoint.node} espera superficie y=${checkpoint.y}, pero ${plazaName} ` +
			`tiene y=${plaza.max[1].toFixed(3)}`
	);
}

// --- FINISH: summit surface, not the node origin -------------------------

const summitIndex = requireNode(PARKOUR_FINISH.node);
const summit = nodeWorldAabb(json, bin, parents, summitIndex);

check(summit, `HP_SummitTerrace no tiene malla`);
check(
	close(summit.max[1], PARKOUR_FINISH.y, 0.05),
	`FINISH debe estar en la superficie de HP_SummitTerrace (${PARKOUR_FINISH.y}), ` +
		`no en y=${summit.max[1].toFixed(3)}`
);

const summitOrigin = nodeWorldPoint(json, parents, summitIndex);

check(
	summitOrigin[1] < PARKOUR_FINISH.y - 0.1,
	`HP_SummitTerrace debería tener su origen por debajo de la superficie`
);

// The finish zone must cover the whole terrace (inset by 0.5 m) so racers
// arriving from the stairs trigger it and not only the centre.
check(
	PARKOUR_FINISH_ZONE.minX >= summit.min[0] - TOLERANCE &&
		PARKOUR_FINISH_ZONE.maxX <= summit.max[0] + TOLERANCE &&
		PARKOUR_FINISH_ZONE.minZ >= summit.min[2] - TOLERANCE &&
		PARKOUR_FINISH_ZONE.maxZ <= summit.max[2] + TOLERANCE,
	`PARKOUR_FINISH_ZONE (${PARKOUR_FINISH_ZONE.minX}..${PARKOUR_FINISH_ZONE.maxX}, ` +
		`${PARKOUR_FINISH_ZONE.minZ}..${PARKOUR_FINISH_ZONE.maxZ}) se sale de HP_SummitTerrace ` +
		`(${summit.min[0].toFixed(2)}..${summit.max[0].toFixed(2)}, ` +
		`${summit.min[2].toFixed(2)}..${summit.max[2].toFixed(2)})`
);
check(
	PARKOUR_FINISH_ZONE.maxX - PARKOUR_FINISH_ZONE.minX >= 24 &&
		PARKOUR_FINISH_ZONE.maxZ - PARKOUR_FINISH_ZONE.minZ >= 24,
	'PARKOUR_FINISH_ZONE debe cubrir casi toda la terraza de la cima'
);

console.log(
	`checkpoints OK — ${PARKOUR_CHECKPOINTS.length} plazas + FINISH ` +
		`(superficie y=${summit.max[1].toFixed(2)}, origen y=${summitOrigin[1].toFixed(2)}, ` +
		`zona ${(PARKOUR_FINISH_ZONE.maxX - PARKOUR_FINISH_ZONE.minX).toFixed(0)}×` +
		`${(PARKOUR_FINISH_ZONE.maxZ - PARKOUR_FINISH_ZONE.minZ).toFixed(0)} m)`
);

// --- START: grid inside the spawn pad, clear of the arch -----------------

const padIndex = requireNode('HP_SpawnPad');
const pad = nodeWorldAabb(json, bin, parents, padIndex);

check(pad, 'HP_SpawnPad no tiene malla');

// El AABB del pad incluye las esquinas del rombo, pero la superficie real es
// octogonal: mirar solo el AABB deja slots sobre `HP_Spawn_Rim`, que no tiene
// collider, y el jugador cae al empezar. Comprobamos el triángulo real bajo
// cada slot.
const padTriangles = nodeWorldTriangles(json, bin, parents, padIndex);

check(padTriangles.length > 0, 'HP_SpawnPad no tiene triángulos');

for (const slot of PARKOUR_START_GRID) {
	const surface = surfaceYAt(padTriangles, slot.x, slot.z);

	check(
		surface !== null,
		`la plaza de salida (${slot.x}, ${slot.z}) no está sobre la superficie de HP_SpawnPad ` +
			`(${pad.min[0].toFixed(2)}..${pad.max[0].toFixed(2)} × ` +
			`${pad.min[2].toFixed(2)}..${pad.max[2].toFixed(2)})`
	);
	check(
		close(surface, PARKOUR_START.y, 0.05),
		`la superficie de salida en (${slot.x}, ${slot.z}) es y=${surface.toFixed(3)}, ` +
			`pero PARKOUR_START.y=${PARKOUR_START.y}`
	);
}

check(
	close(pad.max[1], PARKOUR_START.y, 0.05),
	`PARKOUR_START.y=${PARKOUR_START.y} no coincide con HP_SpawnPad (${pad.max[1].toFixed(3)})`
);

const gridBox = {
	minX: Math.min(...PARKOUR_START_GRID.map((slot) => slot.x)),
	maxX: Math.max(...PARKOUR_START_GRID.map((slot) => slot.x)),
	minZ: Math.min(...PARKOUR_START_GRID.map((slot) => slot.z)),
	maxZ: Math.max(...PARKOUR_START_GRID.map((slot) => slot.z))
};

for (let index = 0; index < json.nodes.length; index += 1) {
	const name = json.nodes[index].name ?? '';

	if (!/^HP_Arch/.test(name)) continue;

	const aabb = nodeWorldAabb(json, bin, parents, index);

	if (!aabb) continue;

	const overlaps =
		aabb.min[0] < gridBox.maxX &&
		aabb.max[0] > gridBox.minX &&
		aabb.min[2] < gridBox.maxZ &&
		aabb.max[2] > gridBox.minZ;

	check(!overlaps, `la rejilla de salida se solapa con \`${name}\``);
}

console.log(`salida OK — rejilla 4×3 dentro de HP_SpawnPad, sin solapar el arco`);

// --- physics: the 85 exact route surfaces --------------------------------

const suelo = physics.groups?.suelo ?? [];

check(
	physics.collision?.mode === 'chunked',
	'la física de parkour debe usar collision.mode = "chunked"'
);
check(physics.collision?.chunkSize === 16, 'chunkSize debe ser 16');
check(physics.collision?.exactGroups === true, 'exactGroups debe ser true');
check(physics.collision?.readyNode === 'HP_Spawn_Top', 'readyNode debe ser HP_Spawn_Top');
check(
	suelo.length === EXPECTED_COLLIDER_NODES,
	`el grupo \`suelo\` tiene ${suelo.length} nodos; se esperaban ${EXPECTED_COLLIDER_NODES}`
);

let colliderTriangles = 0;
const seen = new Set();

for (const name of suelo) {
	check(!seen.has(name), `\`${name}\` está duplicado en el grupo \`suelo\``);
	seen.add(name);
	check(byName.has(name), `el grupo \`suelo\` referencia \`${name}\`, que no existe`);
	const node = json.nodes[byName.get(name)];
	check(node.mesh !== undefined, `\`${name}\` está en \`suelo\` pero no es una malla`);
	check(
		!matchesAny(name, PARKOUR_EXCLUDED_PATTERNS),
		`\`${name}\` coincide con un patrón excluido y no debería colisionar`
	);
	colliderTriangles += meshTriangles(json, node.mesh);
}

check(
	colliderTriangles === EXPECTED_COLLIDER_TRIANGLES,
	`los ${suelo.length} nodos suman ${colliderTriangles} triángulos; ` +
		`se esperaban ${EXPECTED_COLLIDER_TRIANGLES}`
);
check(
	colliderTriangles <= (physics.collision?.maxColliderTriangles ?? 60_000),
	`la colisión supera el presupuesto de triángulos`
);

check(
	(physics.stats?.colliderNodes ?? 0) === EXPECTED_COLLIDER_NODES &&
		(physics.stats?.colliderTriangles ?? 0) === EXPECTED_COLLIDER_TRIANGLES,
	`las estadísticas de ${entry.physics} no coinciden con ${EXPECTED_COLLIDER_NODES} nodos / ` +
		`${EXPECTED_COLLIDER_TRIANGLES} triángulos`
);

console.log(
	`física OK — ${suelo.length} superficies exactas, ${colliderTriangles} triángulos, ` +
		`modo chunked`
);

// --- jumps and ramps -----------------------------------------------------

function routeAabb(name) {
	return nodeWorldAabb(json, bin, parents, requireNode(name));
}

function horizontalGap(a, b) {
	const dx = Math.max(0, a.min[0] - b.max[0], b.min[0] - a.max[0]);
	const dz = Math.max(0, a.min[2] - b.max[2], b.min[2] - a.max[2]);
	return Math.hypot(dx, dz);
}

const spawnTop = routeAabb('HP_Spawn_Top');
const c01 = routeAabb('HP_C01');
const spawnToC01 = horizontalGap(spawnTop, c01);

check(
	spawnToC01 <= MAX_JUMP_GAP,
	`el salto HP_Spawn_Top → HP_C01 tiene ${spawnToC01.toFixed(2)} m; máximo ${MAX_JUMP_GAP}`
);
check(
	Math.abs(spawnToC01 - 5.0) <= 0.1,
	`el salto HP_Spawn_Top → HP_C01 debería medir ~5.0 m, mide ${spawnToC01.toFixed(2)} m`
);

// Transiciones que son saltos de verdad: se excluye la rejilla de salida
// (está sobre HP_Spawn_Top) y las plazas de la torre (se suben por rampas).
const jumpChain = PARKOUR_ROUTE.filter(
	(surface, index) =>
		surface.node !== 'HP_SpawnPad' &&
		surface.node !== 'HP_SummitTerrace' &&
		(index === 0 || !/^HP_SP\d+_Plaza$/.test(surface.node) || surface.node === 'HP_SP1_Plaza')
);

let hardest = { name: '', gap: 0 };

for (let index = 1; index < jumpChain.length; index += 1) {
	const from = jumpChain[index - 1];
	const to = jumpChain[index];
	const fromBox = routeAabb(from.node);
	const toBox = routeAabb(to.node);
	const gap = horizontalGap(fromBox, toBox);
	const rise = to.y - from.y;

	check(
		gap <= MAX_JUMP_GAP,
		`${from.node} → ${to.node} tiene ${gap.toFixed(2)} m de hueco; máximo ${MAX_JUMP_GAP}`
	);
	check(
		rise <= MAX_JUMP_RISE,
		`${from.node} → ${to.node} sube ${rise.toFixed(2)} m; máximo ${MAX_JUMP_RISE}`
	);

	if (gap > hardest.gap) hardest = { name: `${from.node} → ${to.node}`, gap };
}

check(
	hardest.name === 'HP_Spawn_Top → HP_C01',
	`el salto más exigente debería ser HP_Spawn_Top → HP_C01, es ${hardest.name}`
);

// Rampas: la pendiente se mide entre superficies superiores, no entre los
// orígenes de los nodos (que quedan 0.6 m por debajo).
function routeTop(name) {
	const aabb = routeAabb(name);
	return aabb.max[1];
}

for (let level = 1; level <= 8; level += 1) {
	let previousName = `HP_SP${level}_Plaza`;
	let previousTop = routeTop(previousName);

	for (let step = 0; step < 4; step += 1) {
		const name = `HP_SP${level}_Step${step}`;
		const index = requireNode(name);
		const point = nodeWorldPoint(json, parents, index);
		const previousPoint = nodeWorldPoint(json, parents, requireNode(previousName));
		const distance = Math.hypot(point[0] - previousPoint[0], point[2] - previousPoint[2]);
		const top = routeTop(name);
		const slope = (top - previousTop) / distance;

		check(distance > 0.01, `${previousName} → ${name} no tiene distancia horizontal`);
		check(
			slope <= MAX_RAMP_SLOPE,
			`${name} tiene pendiente ${slope.toFixed(3)}; máximo ${MAX_RAMP_SLOPE}`
		);

		previousName = name;
		previousTop = top;
	}
}

check(
	PARKOUR_TOWER_RAMPS.length === 40,
	`se esperaban 40 nodos de rampa (8 niveles × 5), hay ${PARKOUR_TOWER_RAMPS.length}`
);

for (const name of PARKOUR_TOWER_RAMPS) {
	requireNode(name);
}

console.log(
	`ruta OK — salto máximo ${spawnToC01.toFixed(2)} m ` +
		`(HP_Spawn_Top → HP_C01), rampas ≤ ${MAX_RAMP_SLOPE}`
);

// --- wardens -------------------------------------------------------------

const routeNodes = new Set(suelo);

for (const warden of PARKOUR_WARDENS) {
	const candidates = [];

	for (const name of routeNodes) {
		const aabb = routeAabb(name);
		const insideXZ =
			warden.x >= aabb.min[0] - 0.01 &&
			warden.x <= aabb.max[0] + 0.01 &&
			warden.z >= aabb.min[2] - 0.01 &&
			warden.z <= aabb.max[2] + 0.01;

		if (!insideXZ) continue;

		if (close(aabb.max[1], warden.y, 0.05)) {
			candidates.push(name);
		}
	}

	check(
		candidates.length > 0,
		`${warden.id} (${warden.x}, ${warden.y}, ${warden.z}) no está sobre una superficie de ruta`
	);

	const nearCheckpoint = PARKOUR_CHECKPOINTS.some(
		(checkpoint) =>
			Math.hypot(checkpoint.x - warden.x, checkpoint.z - warden.z) <= PARKOUR_CHECKPOINT_RADIUS
	);

	check(!nearCheckpoint, `${warden.id} está dentro del radio de activación de un checkpoint`);
	const orbitFits = candidates.some((name) => {
		const aabb = routeAabb(name);
		const radius = warden.patrolRadius;

		return (
			warden.x - radius >= aabb.min[0] - 0.01 &&
			warden.x + radius <= aabb.max[0] + 0.01 &&
			warden.z - radius >= aabb.min[2] - 0.01 &&
			warden.z + radius <= aabb.max[2] + 0.01
		);
	});

	check(
		orbitFits,
		`${warden.id} se sale de su plaza al patrullar (radio ${warden.patrolRadius} m)`
	);
	check(
		warden.patrolRadius * warden.patrolSpeed >= 0.5,
		`${warden.id} patrulla demasiado lento: ` +
			`${(warden.patrolRadius * warden.patrolSpeed).toFixed(2)} m/s`
	);

	if (warden.chase) {
		const bounds = warden.chaseBounds;

		check(bounds !== undefined, `${warden.id} persigue sin definir chaseBounds`);
		check(
			(warden.chaseSpeed ?? 0) > 0 && (warden.chaseStandoff ?? 0) > 0,
			`${warden.id} persigue sin chaseSpeed/chaseStandoff válidos`
		);

		if (bounds) {
			const chaseFits = candidates.some((name) => {
				const aabb = routeAabb(name);

				return (
					bounds.minX >= aabb.min[0] - 0.01 &&
					bounds.maxX <= aabb.max[0] + 0.01 &&
					bounds.minZ >= aabb.min[2] - 0.01 &&
					bounds.maxZ <= aabb.max[2] + 0.01
				);
			});

			check(chaseFits, `${warden.id} puede perseguir fuera de su plaza (chaseBounds)`);
		}
	} else {
		check(warden.chaseBounds === undefined, `${warden.id} define chaseBounds pero no persigue`);
	}
	check(
		warden.pushHorizontal <= PARKOUR_MAX_PUSH_HORIZONTAL,
		`${warden.id}.pushHorizontal=${warden.pushHorizontal} supera el máximo autoritativo`
	);
	check(
		warden.pushVertical <= PARKOUR_MAX_PUSH_VERTICAL,
		`${warden.id}.pushVertical=${warden.pushVertical} supera el máximo autoritativo`
	);
	check(
		warden.range >= 5 && warden.impactRadius > 1,
		`${warden.id} debe sensar y golpear con un área mayor`
	);
}

console.log(
	`guardianes OK — ${PARKOUR_WARDENS.length} anclas sobre la ruta, patrullando su plaza ` +
		`y fuera del radio de checkpoint`
);

// --- constants -----------------------------------------------------------

const constants = [
	['PARKOUR_CHECKPOINT_RADIUS', PARKOUR_CHECKPOINT_RADIUS, 3.0],
	['PARKOUR_FINISH_RADIUS', PARKOUR_FINISH_RADIUS, 3.5],
	['PARKOUR_MAX_PLAYERS', PARKOUR_MAX_PLAYERS, 12],
	['PARKOUR_COUNTDOWN_MS', PARKOUR_COUNTDOWN_MS, 30_000],
	['PARKOUR_COUNTDOWN_SHORT_MS', PARKOUR_COUNTDOWN_SHORT_MS, 10_000],
	['PARKOUR_MATCH_MAX_MS', PARKOUR_MATCH_MAX_MS, 600_000],
	['PARKOUR_RESULTS_MS', PARKOUR_RESULTS_MS, 15_000],
	['PARKOUR_MAX_PUSH_HORIZONTAL', PARKOUR_MAX_PUSH_HORIZONTAL, 20],
	['PARKOUR_MAX_PUSH_VERTICAL', PARKOUR_MAX_PUSH_VERTICAL, 11],
	['PARKOUR_WARDEN_VERTICAL_REACH', PARKOUR_WARDEN_VERTICAL_REACH, 8]
];

for (const [name, value, expected] of constants) {
	check(value === expected, `${name}=${value}; se esperaba ${expected}`);
}

check(
	PARKOUR_CHECKPOINTS.length === 12,
	`se esperaban 12 checkpoints, hay ${PARKOUR_CHECKPOINTS.length}`
);
check(PARKOUR_FINISH.index === 13, 'FINISH.index debe ser 13');
check(PARKOUR_START_GRID.length === 12, 'la rejilla de salida debe tener 12 huecos');

// Salto del parkour: v² / (2g). Debe superar el escalón máximo de la ruta.
const jumpHeight = (PARKOUR_JUMP_SPEED * PARKOUR_JUMP_SPEED) / (2 * 18);
check(
	jumpHeight >= MAX_JUMP_RISE + 0.1,
	`PARKOUR_JUMP_SPEED=${PARKOUR_JUMP_SPEED} da ${jumpHeight.toFixed(2)} m de salto; ` +
		`se necesitan más de ${MAX_JUMP_RISE} m para los escalones de la ruta`
);

console.log(
	`constantes OK — 12 jugadores, checkpoints 3.0/3.5, ` +
		`${PARKOUR_COUNTDOWN_MS / 1000}s/${PARKOUR_COUNTDOWN_SHORT_MS / 1000}s, ` +
		`${PARKOUR_MATCH_MAX_MS / 60_000}min, ${PARKOUR_RESULTS_MS / 1000}s`
);

// --- manual component ----------------------------------------------------

const component = join(root, 'src/lib/components/world/Parkour.svelte');

check(existsSync(component), 'falta src/lib/components/world/Parkour.svelte');
check(
	readFileSync(component, 'utf8').includes('HP_FinishSub'),
	'Parkour.svelte debe ocultar HP_FinishSub/HP_FinishSub2'
);

console.log('parkour:check ✓ todo en verde');
