/**
 * `waves:check` — valida las constantes de arena de `wavesConfig.ts`
 * contra el mapa `barnsiege.glb`.
 *
 * Solo Node (`fs`); no toca Three ni Threlte. Comprueba:
 *   1. `barnsiege.glb` es un GLB válido y contiene el suelo y la valla.
 *   2. El polígono de arena se parsea, cubre el recinto completo y cabe dentro
 *      del suelo.
 *   3. Rejilla de jugadores, portales de monstruos y coche están dentro del
 *      polígono y fuera de los obstáculos sólidos (granero, silo, ruina,
 *      calabaza gigante, lago, pozo y carro).
 *   4. Las animaciones del mapa (molino, zepelín, banderín) siguen presentes.
 *   5. El checkpoint de entrada queda delante de la puerta sur del granero.
 *
 * Sale con código 1 y mensaje claro si algo falla.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const glbPath = join(root, 'static', 'maps/barnsiege.glb');

const {
	ARENA_POLYGON,
	BARN_CHECKPOINT,
	BUILDING_BLOCKS,
	PLAYER_SPAWNS,
	MONSTER_SPAWNS,
	WAVES_CAR
} = await import('../src/lib/state/wavesConfig.ts');

// BBoxes en mundo medidos sobre barnsiege.glb (x/z). Se validan contra los
// mismos volúmenes que usa la IA (`BUILDING_BLOCKS`), no solo los edificios
// del anillo central, porque ahora los spawns cubren todo el recinto.
const OBSTACLES = BUILDING_BLOCKS.map((block, index) => ({
	name: `BUILDING_BLOCKS[${index}]`,
	minX: block.minX - 0.5,
	maxX: block.maxX + 0.5,
	minZ: block.minZ - 0.5,
	maxZ: block.maxZ + 0.5
}));

const EXPECTED_ANIMATIONS = ['BS_WindmillSpin', 'BS_ZeppelinDrift', 'BS_BannerWave'];

function fail(message) {
	console.error(`waves:check ✗ ${message}`);
	process.exit(1);
}

function readGlbJson(path) {
	const buf = readFileSync(path);
	if (buf.readUInt32LE(0) !== 0x46546c67) {
		fail('barnsiege.glb no es un GLB (magic incorrecto)');
	}
	const jsonLength = buf.readUInt32LE(12);
	return JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'));
}

function pointInPolygon(x, z, polygon) {
	// Ray-casting clásico en XZ.
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const [xi, zi] = polygon[i];
		const [xj, zj] = polygon[j];
		const intersects = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
		if (intersects) {
			inside = !inside;
		}
	}
	return inside;
}

function polygonArea(polygon) {
	let sum = 0;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		sum += (polygon[j][0] + polygon[i][0]) * (polygon[j][1] - polygon[i][1]);
	}
	return Math.abs(sum / 2);
}

/** Distancia mínima de un punto al polígono (0 si está dentro). */
function distanceToPolygon(x, z, polygon) {
	if (pointInPolygon(x, z, polygon)) {
		return 0;
	}
	let best = Infinity;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const [ax, az] = polygon[j];
		const [bx, bz] = polygon[i];
		const dx = bx - ax;
		const dz = bz - az;
		const lengthSq = dx * dx + dz * dz;
		const t =
			lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSq));
		best = Math.min(best, Math.hypot(x - (ax + t * dx), z - (az + t * dz)));
	}
	return best;
}

/** BBox en XZ de la malla de un nodo (sin jerarquías ni rotaciones raras). */
function nodeXZBounds(json, name) {
	const node = (json.nodes ?? []).find((item) => item.name === name);
	if (!node || node.mesh === undefined) {
		fail(`no se encontró el nodo con malla \`${name}\` en barnsiege.glb`);
	}
	const mesh = json.meshes[node.mesh];
	const [tx, , tz] = node.translation ?? [0, 0, 0];
	const min = [Infinity, Infinity];
	const max = [-Infinity, -Infinity];

	for (const primitive of mesh.primitives ?? []) {
		const accessor = json.accessors?.[primitive.attributes?.POSITION];
		if (!accessor?.min || !accessor?.max) continue;
		min[0] = Math.min(min[0], accessor.min[0] + tx);
		max[0] = Math.max(max[0], accessor.max[0] + tx);
		min[1] = Math.min(min[1], accessor.min[2] + tz);
		max[1] = Math.max(max[1], accessor.max[2] + tz);
	}

	return { minX: min[0], maxX: max[0], minZ: min[1], maxZ: max[1] };
}

const json = readGlbJson(glbPath);
const nodeNames = new Set((json.nodes ?? []).map((node) => node.name));

for (const required of ['BS_Ground', 'BS_Fence', 'BS_Barn', 'BS_Silo']) {
	if (!nodeNames.has(required)) fail(`falta el nodo \`${required}\` en barnsiege.glb`);
}

const animations = (json.animations ?? []).map((clip) => clip.name);
for (const clip of EXPECTED_ANIMATIONS) {
	if (!animations.includes(clip)) fail(`falta la animación \`${clip}\` en barnsiege.glb`);
}

console.log(
	`barnsiege.glb OK — ${json.nodes?.length ?? 0} nodos, ${animations.length} animaciones (${animations.join(', ')})`
);

const ground = nodeXZBounds(json, 'BS_Ground');

for (const [x, z] of ARENA_POLYGON) {
	if (x < ground.minX || x > ground.maxX || z < ground.minZ || z > ground.maxZ) {
		fail(`el vértice (${x}, ${z}) cae fuera del suelo (${ground.minX}..${ground.maxX})`);
	}
}

console.log(
	`suelo OK — BS_Ground cubre el polígono (${ground.minX}..${ground.maxX} × ${ground.minZ}..${ground.maxZ})`
);

const area = polygonArea(ARENA_POLYGON);
const xs = ARENA_POLYGON.map(([x]) => x);
const zs = ARENA_POLYGON.map(([, z]) => z);
const spanX = Math.max(...xs) - Math.min(...xs);
const spanZ = Math.max(...zs) - Math.min(...zs);

// La arena debe cubrir el recinto cerrado por la valla (±58.3), no un anillo
// interior: si vuelve a encogerse, los jugadores podrían salir y ser ignorados.
if (!(area > 9_000) || spanX < 100 || spanZ < 100) {
	fail(
		`el polígono de arena no cubre el recinto completo (${area.toFixed(0)} m², ${spanX.toFixed(1)} × ${spanZ.toFixed(1)} m)`
	);
}

console.log(
	`polígono OK — ${ARENA_POLYGON.length} vértices, ${area.toFixed(0)} m², ${spanX.toFixed(1)} × ${spanZ.toFixed(1)} m`
);

const all = [
	['car', WAVES_CAR.x, WAVES_CAR.z],
	...PLAYER_SPAWNS.map((spawn, index) => [`player-${index}`, spawn.x, spawn.z]),
	...MONSTER_SPAWNS.map((portal) => [`portal-${portal.id}`, portal.x, portal.z])
];

for (const [name, x, z] of all) {
	const distance = distanceToPolygon(x, z, ARENA_POLYGON);
	if (distance > 0) {
		fail(`${name} (${x}, ${z}) está fuera del polígono a ${distance.toFixed(2)} m`);
	}
}

console.log(`contención OK — ${all.length} puntos dentro de la arena`);

for (const [name, x, z] of all) {
	for (const obstacle of OBSTACLES) {
		if (x >= obstacle.minX && x <= obstacle.maxX && z >= obstacle.minZ && z <= obstacle.maxZ) {
			fail(`${name} (${x}, ${z}) cae dentro de ${obstacle.name}`);
		}
	}
}

console.log('obstáculos OK — ningún punto dentro de los edificios, miradores, lago, pozo o carro');

// El checkpoint vive en el mapa global, pero debe quedar delante de la puerta
// sur del granero (PFM_Barn), no detrás. BBox medida sobre map.glb.
const MAP_BARN = { minX: -46.5, maxX: -36.8, minZ: 35.27, maxZ: 43.95 };
if (BARN_CHECKPOINT.x < MAP_BARN.minX || BARN_CHECKPOINT.x > MAP_BARN.maxX) {
	fail(`checkpoint (${BARN_CHECKPOINT.x}) no está centrado en la fachada del granero`);
}
const frontGap = MAP_BARN.minZ - BARN_CHECKPOINT.z;
if (frontGap < 1 || frontGap > 5) {
	fail(
		`checkpoint z=${BARN_CHECKPOINT.z} no está delante de la puerta sur del granero (hueco ${frontGap.toFixed(2)} m)`
	);
}
console.log(`checkpoint OK — delante de la puerta sur, a ${frontGap.toFixed(1)} m del granero`);
console.log('waves:check ✓ todo correcto');
