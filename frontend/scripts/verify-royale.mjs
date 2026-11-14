/**
 * `royale:check` — valida los datos de Skyfall Royale (`minigame-8`) contra el
 * mapa real de `islas-ciudad`.
 *
 *   1. Checkpoint, lobby, room y escena.
 *   2. `world/islas-ciudad.royale.json`: bounds, 14 POI, 70 anclas de loot,
 *      28 anclas de bot, cajas de oclusión y rejilla de navegación.
 *   3. Todas las anclas caen en celdas caminables de la componente principal.
 *   4. La rejilla no contiene celdas de agua ni tejados y está conectada.
 *   5. Path del zepelín, timings y estadísticas de armas.
 *   6. 1 000 semillas de tormenta: cada círculo queda contenido en el anterior.
 *
 * Se ejecuta con Bun: `bun scripts/verify-royale.mjs`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
	ROYALE_BOARDING_MS,
	ROYALE_BOT_ANCHORS,
	ROYALE_BOT_ENGAGE_DELAY_MS,
	ROYALE_BOT_FILL,
	ROYALE_BOT_STORM_MARGIN,
	ROYALE_CHECKPOINT,
	ROYALE_COUNTDOWN_MS,
	ROYALE_ENTRY,
	ROYALE_EXIT,
	ROYALE_JUMP_DELAY_MS,
	ROYALE_JUMP_WINDOW_MS,
	ROYALE_LOBBY_ID,
	ROYALE_LOOT_ANCHORS,
	ROYALE_MAP,
	ROYALE_MAP_BOUNDS,
	ROYALE_MATCH_MS,
	ROYALE_MAX_PLAYERS,
	ROYALE_OCCLUDERS,
	ROYALE_POIS,
	ROYALE_RESULT_MS,
	ROYALE_ROOM_ID,
	ROYALE_SCENE_ID,
	ROYALE_STORM_PHASES,
	ROYALE_STORM_START_MS,
	ROYALE_WEAPONS,
	ROYALE_ZEPPELIN_ALTITUDE,
	ROYALE_ZEPPELIN_LENGTH,
	ROYALE_ZEPPELIN_PATH,
	ROYALE_ZEPPELIN_SPEED,
	royaleDistance,
	royaleStormCenters,
	royaleZeppelinAt
} from '../src/lib/state/royaleConfig.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

function fail(message) {
	console.error(`royale:check ✗ ${message}`);
	process.exit(1);
}

function ok(message) {
	console.log(`royale:check ✓ ${message}`);
}

function assert(condition, message) {
	if (!condition) {
		fail(message);
	}
}

function round(value, digits = 2) {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}

const NAV = ROYALE_MAP.nav;
const CELL = NAV.cellSize;
const COLS = NAV.cols;
const ROWS = NAV.rows;
const WALKABLE = NAV.walkable;
const HEIGHTS = NAV.heights;

function cellOf(x, z) {
	const col = Math.floor((x - NAV.originX) / CELL);
	const row = Math.floor((z - NAV.originZ) / CELL);
	return { col, row };
}

function indexOf(col, row) {
	return row * COLS + col;
}

function inside(col, row) {
	return col >= 0 && row >= 0 && col < COLS && row < ROWS;
}

function walkableAt(col, row) {
	return inside(col, row) && WALKABLE.charCodeAt(indexOf(col, row)) === 49;
}

function heightAt(col, row) {
	return HEIGHTS[indexOf(col, row)] / 10;
}

function distanceToPath(x, z) {
	let best = Infinity;

	for (let index = 0; index < ROYALE_ZEPPELIN_PATH.length - 1; index += 1) {
		const [ax, , az] = ROYALE_ZEPPELIN_PATH[index];
		const [bx, , bz] = ROYALE_ZEPPELIN_PATH[index + 1];
		const dx = bx - ax;
		const dz = bz - az;
		const lengthSq = dx * dx + dz * dz;

		if (lengthSq <= 1e-9) continue;

		let t = ((x - ax) * dx + (z - az) * dz) / lengthSq;
		t = Math.max(0, Math.min(1, t));
		best = Math.min(best, Math.hypot(x - (ax + t * dx), z - (az + t * dz)));
	}

	return best;
}

// ---------------------------------------------------------------------------
// 1. Checkpoint y registro de la room
// ---------------------------------------------------------------------------

assert(
	ROYALE_LOBBY_ID === 'minigame-8' &&
		ROYALE_ROOM_ID === 'royale' &&
		ROYALE_SCENE_ID === 'islas-ciudad',
	`registro inesperado: ${ROYALE_LOBBY_ID}/${ROYALE_ROOM_ID}/${ROYALE_SCENE_ID}`
);
assert(
	ROYALE_CHECKPOINT.x === 60 && ROYALE_CHECKPOINT.y === 0.4 && ROYALE_CHECKPOINT.z === 60,
	`checkpoint inesperado: ${JSON.stringify(ROYALE_CHECKPOINT)}`
);
assert(
	ROYALE_ENTRY.x === 60 && ROYALE_ENTRY.y === 0.4 && ROYALE_ENTRY.z === 60,
	`ROYALE_ENTRY inesperado: ${JSON.stringify(ROYALE_ENTRY)}`
);
assert(
	ROYALE_EXIT.x === 60 && ROYALE_EXIT.y === 0.4 && ROYALE_EXIT.z === 60,
	`ROYALE_EXIT inesperado: ${JSON.stringify(ROYALE_EXIT)}`
);
assert(ROYALE_MAX_PLAYERS === 12, `maxPlayers=${ROYALE_MAX_PLAYERS}, se esperaban 12`);
assert(ROYALE_BOT_FILL === 11, `botFill=${ROYALE_BOT_FILL}, se esperaban 11`);

const checkpointsSource = readFileSync(join(root, 'src/lib/state/checkpoints.svelte.ts'), 'utf8');
assert(/id:\s*'minigame-8'/.test(checkpointsSource), 'falta minigame-8 en checkpoints');
assert(
	/label:\s*'SKYFALL ROYALE'/.test(checkpointsSource),
	'falta el cartel SKYFALL ROYALE en checkpoints'
);
assert(
	/position:\s*\[60\.0,\s*0\.4,\s*60\.0\]/.test(checkpointsSource),
	'el checkpoint de minigame-8 no está en (60, 0.4, 60)'
);

const playerStateSource = readFileSync(join(root, 'src/lib/state/playerState.ts'), 'utf8');
assert(/ROYALE_ENTRY/.test(playerStateSource), 'playerState no define ROYALE_ENTRY');
assert(/ROYALE_EXIT/.test(playerStateSource), 'playerState no define ROYALE_EXIT');

const roomConfig = JSON.parse(readFileSync(join(root, 'rundot/rooms.config.json'), 'utf8'));
const royaleRoom = roomConfig.rooms?.find?.((room) => room.type === 'royale');
assert(royaleRoom, 'falta la room `royale` en rooms.config.json');
assert(
	royaleRoom.config?.maxPlayers === 12,
	`room royale maxPlayers=${royaleRoom.config?.maxPlayers}`
);
assert(
	typeof royaleRoom.config?.reconnectTimeout === 'number' &&
		royaleRoom.config.reconnectTimeout >= 20,
	'room royale sin reconexión de 20 s'
);
assert(royaleRoom.file === 'src/server/rooms/RoyaleRoom.ts', `room royale file=${royaleRoom.file}`);

ok('checkpoint, entrada, salida y room `royale` OK');

// ---------------------------------------------------------------------------
// 2. Metadatos y bounds del mapa
// ---------------------------------------------------------------------------

assert(ROYALE_MAP.version === 1, `versión de mapa ${ROYALE_MAP.version}`);
assert(
	ROYALE_MAP.generatedBy === 'scripts/build-royale-map.mjs',
	`generatedBy inesperado: ${ROYALE_MAP.generatedBy}`
);
assert(
	ROYALE_MAP_BOUNDS.minX === -190 &&
		ROYALE_MAP_BOUNDS.maxX === 230 &&
		ROYALE_MAP_BOUNDS.minZ === -240 &&
		ROYALE_MAP_BOUNDS.maxZ === 260,
	`bounds inesperados: ${JSON.stringify(ROYALE_MAP_BOUNDS)}`
);
assert(CELL === 2, `cellSize=${CELL}, se esperaban 2 m`);
assert(COLS === (ROYALE_MAP_BOUNDS.maxX - ROYALE_MAP_BOUNDS.minX) / CELL, 'cols no cubre el ancho');
assert(ROWS === (ROYALE_MAP_BOUNDS.maxZ - ROYALE_MAP_BOUNDS.minZ) / CELL, 'rows no cubre el alto');
assert(NAV.originX === ROYALE_MAP_BOUNDS.minX, 'nav.originX no coincide con bounds');
assert(NAV.originZ === ROYALE_MAP_BOUNDS.minZ, 'nav.originZ no coincide con bounds');
assert(
	WALKABLE.length === COLS * ROWS,
	`walkable tiene ${WALKABLE.length}, se esperaban ${COLS * ROWS}`
);
assert(
	HEIGHTS.length === COLS * ROWS,
	`heights tiene ${HEIGHTS.length}, se esperaban ${COLS * ROWS}`
);

let walkableCount = 0;
let minHeight = Infinity;
let maxHeight = -Infinity;

for (let index = 0; index < WALKABLE.length; index += 1) {
	const cell = WALKABLE[index];

	if (cell !== '0' && cell !== '1') {
		fail(`walkable[${index}]='${cell}', solo se admite 0/1`);
	}

	if (cell === '1') {
		walkableCount += 1;
		const height = HEIGHTS[index] / 10;
		assert(Number.isFinite(height), `altura no finita en la celda ${index}`);
		minHeight = Math.min(minHeight, height);
		maxHeight = Math.max(maxHeight, height);
	}
}

assert(walkableCount > 5_000, `solo ${walkableCount} celdas caminables`);
assert(walkableCount < 20_000, `demasiadas celdas caminables: ${walkableCount}`);
assert(minHeight > -2.0, `celda caminable ${minHeight} m: parece agua`);
assert(
	maxHeight <= ROYALE_MAP_BOUNDS.maxY + 0.11,
	`celda caminable a ${maxHeight} m por encima de maxY (tejado)`
);
assert(
	ROYALE_MAP_BOUNDS.minY <= minHeight + 0.11,
	`minY=${ROYALE_MAP_BOUNDS.minY} no cubre la celda más baja (${minHeight})`
);

ok(
	`rejilla OK — ${COLS}×${ROWS}, ${walkableCount} celdas, alturas ${round(minHeight)}–${round(maxHeight)} m`
);

// ---------------------------------------------------------------------------
// 3. Componente conectada principal
// ---------------------------------------------------------------------------

const component = new Int32Array(COLS * ROWS).fill(-1);
const queue = new Int32Array(COLS * ROWS);
let components = 0;
let mainSize = 0;
let mainComponent = -1;

for (let start = 0; start < COLS * ROWS; start += 1) {
	if (WALKABLE[start] !== '1' || component[start] !== -1) continue;

	let head = 0;
	let tail = 0;
	queue[tail++] = start;
	component[start] = components;
	let size = 0;

	while (head < tail) {
		const index = queue[head++];
		size += 1;
		const col = index % COLS;
		const row = Math.floor(index / COLS);

		for (const [dc, dr] of [
			[1, 0],
			[-1, 0],
			[0, 1],
			[0, -1]
		]) {
			if (!walkableAt(col + dc, row + dr)) continue;
			const next = indexOf(col + dc, row + dr);
			if (component[next] !== -1) continue;
			component[next] = components;
			queue[tail++] = next;
		}
	}

	if (size > mainSize) {
		mainSize = size;
		mainComponent = components;
	}

	components += 1;
}

assert(components === 1, `la rejilla tiene ${components} componentes; debe ser una sola`);
assert(mainSize === walkableCount, 'la componente principal no cubre todas las celdas');
assert(component[0] === -1 || true, 'componente inválida');

ok(`conectividad OK — una única componente con ${mainSize} celdas`);

// ---------------------------------------------------------------------------
// 4. POI, loot y anclas de bots
// ---------------------------------------------------------------------------

assert(ROYALE_POIS.length === 14, `${ROYALE_POIS.length} POI, se esperaban 14`);
assert(
	ROYALE_LOOT_ANCHORS.length === 70,
	`${ROYALE_LOOT_ANCHORS.length} anclas de loot, se esperaban 70`
);
assert(
	ROYALE_BOT_ANCHORS.length === 28,
	`${ROYALE_BOT_ANCHORS.length} anclas de bot, se esperaban 28`
);

const poiIds = new Set();

for (const poi of ROYALE_POIS) {
	assert(!poiIds.has(poi.id), `POI duplicado: ${poi.id}`);
	poiIds.add(poi.id);
	assert(
		poi.x >= ROYALE_MAP_BOUNDS.minX &&
			poi.x <= ROYALE_MAP_BOUNDS.maxX &&
			poi.z >= ROYALE_MAP_BOUNDS.minZ &&
			poi.z <= ROYALE_MAP_BOUNDS.maxZ,
		`POI ${poi.id} fuera de bounds`
	);
	assert(poi.radius >= 30 && poi.radius <= 36, `POI ${poi.id} radius=${poi.radius}`);
	const { col, row } = cellOf(poi.x, poi.z);
	assert(walkableAt(col, row), `POI ${poi.id} no cae en celda caminable (${col},${row})`);
	assert(
		Math.abs(heightAt(col, row) - poi.y) <= 0.11,
		`POI ${poi.id} y=${poi.y}, celda y=${heightAt(col, row)}`
	);
	assert(component[indexOf(col, row)] === mainComponent, `POI ${poi.id} fuera de la componente`);
}

const lootByPoi = new Map();
const lootIds = new Set();

for (let index = 0; index < ROYALE_LOOT_ANCHORS.length; index += 1) {
	const loot = ROYALE_LOOT_ANCHORS[index];
	assert(!lootIds.has(loot.id), `ancla de loot duplicada: ${loot.id}`);
	lootIds.add(loot.id);
	assert(poiIds.has(loot.poi), `ancla ${loot.id} apunta a POI desconocido ${loot.poi}`);
	lootByPoi.set(loot.poi, (lootByPoi.get(loot.poi) ?? 0) + 1);
	const { col, row } = cellOf(loot.x, loot.z);
	assert(walkableAt(col, row), `loot ${loot.id} no cae en celda caminable`);
	assert(
		Math.abs(heightAt(col, row) + 0.9 - loot.y) <= 0.12,
		`loot ${loot.id} y=${loot.y}, esperado ${round(heightAt(col, row) + 0.9)}`
	);

	for (let other = 0; other < index; other += 1) {
		const previous = ROYALE_LOOT_ANCHORS[other];
		assert(
			royaleDistance(loot.x, loot.z, previous.x, previous.z) >= 6 - 0.01,
			`loot ${loot.id} y ${previous.id} a menos de 6 m`
		);
	}
}

for (const poi of ROYALE_POIS) {
	assert(
		lootByPoi.get(poi.id) === 5,
		`POI ${poi.id} tiene ${lootByPoi.get(poi.id) ?? 0} anclas de loot, se esperaban 5`
	);
}

const botIds = new Set();

for (let index = 0; index < ROYALE_BOT_ANCHORS.length; index += 1) {
	const anchor = ROYALE_BOT_ANCHORS[index];
	assert(!botIds.has(anchor.id), `ancla de bot duplicada: ${anchor.id}`);
	botIds.add(anchor.id);
	assert(poiIds.has(anchor.poi), `ancla ${anchor.id} apunta a POI desconocido ${anchor.poi}`);
	const { col, row } = cellOf(anchor.x, anchor.z);
	assert(walkableAt(col, row), `ancla de bot ${anchor.id} no es caminable`);
	assert(
		Math.abs(heightAt(col, row) - anchor.y) <= 0.11,
		`ancla de bot ${anchor.id} y=${anchor.y}, celda y=${heightAt(col, row)}`
	);
	assert(distanceToPath(anchor.x, anchor.z) <= 130, `ancla ${anchor.id} a más de 130 m del path`);
	assert(
		component[indexOf(col, row)] === mainComponent,
		`ancla ${anchor.id} fuera de la componente`
	);

	for (let other = 0; other < index; other += 1) {
		const previous = ROYALE_BOT_ANCHORS[other];
		assert(
			royaleDistance(anchor.x, anchor.z, previous.x, previous.z) >= 8 - 0.01,
			`anclas ${anchor.id} y ${previous.id} a menos de 8 m`
		);
	}
}

ok('POI, loot y bots OK — 14 POI, 5 loot/POI, 28 anclas separadas y conectadas');

// ---------------------------------------------------------------------------
// 5. Oclusores
// ---------------------------------------------------------------------------

assert(
	ROYALE_OCCLUDERS.length >= 700 && ROYALE_OCCLUDERS.length <= 1_200,
	`${ROYALE_OCCLUDERS.length} occluders, fuera del rango 700–1 200`
);

for (let index = 0; index < ROYALE_OCCLUDERS.length; index += 1) {
	const box = ROYALE_OCCLUDERS[index];
	assert(Array.isArray(box) && box.length === 6, `occluder ${index} no tiene 6 componentes`);

	for (const value of box) {
		assert(Number.isFinite(value), `occluder ${index} contiene un valor no finito`);
	}

	assert(
		box[0] <= box[3] && box[1] <= box[4] && box[2] <= box[5],
		`occluder ${index} tiene min > max`
	);
	const volume = (box[3] - box[0]) * (box[4] - box[1]) * (box[5] - box[2]);
	assert(volume > 0.01, `occluder ${index} sin volumen`);
	assert(
		box[0] >= ROYALE_MAP_BOUNDS.minX - 30 &&
			box[3] <= ROYALE_MAP_BOUNDS.maxX + 30 &&
			box[2] >= ROYALE_MAP_BOUNDS.minZ - 30 &&
			box[5] <= ROYALE_MAP_BOUNDS.maxZ + 30,
		`occluder ${index} fuera del mapa`
	);
}

ok(`oclusión OK — ${ROYALE_OCCLUDERS.length} cajas válidas`);

// ---------------------------------------------------------------------------
// 6. Zepelín, timings y armas
// ---------------------------------------------------------------------------

assert(ROYALE_COUNTDOWN_MS === 30_000, `countdown=${ROYALE_COUNTDOWN_MS}`);
assert(ROYALE_MATCH_MS === 600_000, `match=${ROYALE_MATCH_MS}`);
assert(ROYALE_RESULT_MS === 20_000, `results=${ROYALE_RESULT_MS}`);
assert(ROYALE_BOARDING_MS === 36_500, `boarding=${ROYALE_BOARDING_MS}`);
assert(ROYALE_JUMP_DELAY_MS === 1_500, `jumpDelay=${ROYALE_JUMP_DELAY_MS}`);
assert(ROYALE_JUMP_WINDOW_MS === 32_000, `jumpWindow=${ROYALE_JUMP_WINDOW_MS}`);
assert(ROYALE_STORM_START_MS === 60_000, `stormStart=${ROYALE_STORM_START_MS}`);
assert(ROYALE_BOT_ENGAGE_DELAY_MS >= 45_000, `engageDelay=${ROYALE_BOT_ENGAGE_DELAY_MS}`);
assert(ROYALE_ZEPPELIN_SPEED === 12.5, `zeppelin speed=${ROYALE_ZEPPELIN_SPEED}`);
assert(ROYALE_ZEPPELIN_ALTITUDE === 140, `zeppelin altitude=${ROYALE_ZEPPELIN_ALTITUDE}`);
assert(ROYALE_ZEPPELIN_PATH.length >= 2, 'el path necesita al menos 2 waypoints');

for (const [x, y, z] of ROYALE_ZEPPELIN_PATH) {
	assert(y === ROYALE_ZEPPELIN_ALTITUDE, `waypoint a ${y} m en vez de ${ROYALE_ZEPPELIN_ALTITUDE}`);
	assert(
		x >= ROYALE_MAP_BOUNDS.minX &&
			x <= ROYALE_MAP_BOUNDS.maxX &&
			z >= ROYALE_MAP_BOUNDS.minZ &&
			z <= ROYALE_MAP_BOUNDS.maxZ,
		`waypoint (${x}, ${z}) fuera de bounds`
	);
}

const travelMs = Math.ceil((ROYALE_ZEPPELIN_LENGTH / ROYALE_ZEPPELIN_SPEED) * 1000);
assert(
	Math.abs(travelMs - ROYALE_BOARDING_MS) <= 1_500,
	`el path tarda ${travelMs} ms y el boarding dura ${ROYALE_BOARDING_MS} ms`
);

const last = ROYALE_ZEPPELIN_PATH.at(-1);
const end = royaleZeppelinAt(0, ROYALE_BOARDING_MS);
assert(
	Math.abs(end.x - last[0]) < 0.01 && Math.abs(end.z - last[2]) < 0.01,
	`el zepelín no termina en el último waypoint: (${round(end.x)}, ${round(end.z)})`
);
assert(
	end.distance === ROYALE_ZEPPELIN_LENGTH,
	'la distancia final no coincide con la longitud del path'
);

const expectedWeapons = {
	pistol: { damage: 12, rate: 6, range: 55, magSize: 12, pellets: 1 },
	shotgun: { damage: 6, rate: 1.2, range: 32, magSize: 6, pellets: 8 },
	smg: { damage: 9, rate: 11, range: 42, magSize: 30, pellets: 1 },
	rifle: { damage: 46, rate: 1.5, range: 130, magSize: 5, pellets: 1 }
};

for (const [id, expected] of Object.entries(expectedWeapons)) {
	const weapon = ROYALE_WEAPONS.find((entry) => entry.id === id);
	assert(weapon, `falta el arma ${id}`);

	for (const [key, value] of Object.entries(expected)) {
		assert(weapon[key] === value, `${id}.${key}=${weapon[key]}, se esperaba ${value}`);
	}
}

ok(
	`timings y armas OK — boarding ${(ROYALE_ZEPPELIN_LENGTH / ROYALE_ZEPPELIN_SPEED).toFixed(1)} s, ` +
		`${ROYALE_WEAPONS.length} armas`
);

// ---------------------------------------------------------------------------
// 7. Tormenta: fases y contención en 1 000 semillas
// ---------------------------------------------------------------------------

const expectedRadii = [400, 260, 180, 120, 70, 35, 10, 3];
const expectedDps = [0, 1, 2, 3, 5, 8, 12, 20];
assert(ROYALE_STORM_PHASES.length === 8, `${ROYALE_STORM_PHASES.length} fases de tormenta`);

ROYALE_STORM_PHASES.forEach((phase, index) => {
	assert(phase.radius === expectedRadii[index], `fase ${index} radius=${phase.radius}`);
	assert(phase.dps === expectedDps[index], `fase ${index} dps=${phase.dps}`);
	assert(phase.radius > 0, `fase ${index} sin radio`);
	assert(phase.waitMs > 0, `fase ${index} sin espera`);
});

for (let seed = 1; seed <= 1_000; seed += 1) {
	const circles = royaleStormCenters(seed * 7919);
	assert(circles.length === 8, `semilla ${seed}: ${circles.length} círculos`);
	assert(circles[0].cx === 0 && circles[0].cz === 0, `semilla ${seed}: fase 0 no centrada`);

	for (let phase = 0; phase < circles.length; phase += 1) {
		const circle = circles[phase];
		assert(Number.isFinite(circle.cx) && Number.isFinite(circle.cz), `semilla ${seed}: NaN`);

		if (phase > 0) {
			const previous = circles[phase - 1];
			assert(
				royaleDistance(circle.cx, circle.cz, previous.cx, previous.cz) + circle.radius <=
					previous.radius + 0.01,
				`semilla ${seed}: fase ${phase} no está contenida en la anterior`
			);
		}

		const { col, row } = cellOf(circle.cx, circle.cz);
		assert(walkableAt(col, row), `semilla ${seed}: centro ${phase} no es caminable`);
	}

	const final = circles.at(-1);
	assert(
		final.cx >= ROYALE_MAP_BOUNDS.minX &&
			final.cx <= ROYALE_MAP_BOUNDS.maxX &&
			final.cz >= ROYALE_MAP_BOUNDS.minZ &&
			final.cz <= ROYALE_MAP_BOUNDS.maxZ,
		`semilla ${seed}: círculo final fuera del mapa`
	);
}

ok('tormenta OK — 8 fases, radios/dps exactos y contención en 1 000 semillas');

console.log('royale:check ✓ todo correcto');
