/**
 * Skyfall Royale (minijuego 8) — única fuente de verdad de timings, path,
 * tormenta, loot, armas y bots.
 *
 * El servidor y el cliente importan este archivo y el JSON generado por
 * `bun run royale:build`. Ningún dato de balance vive en componentes.
 */
import type { Mg5WeaponId } from './wavesConfig';
import royaleMapJson from './islas-ciudad.royale.json';

export type RoyaleMode = 'riding' | 'skydive' | 'glide' | 'ground';
export type RoyalePhase = 'idle' | 'countdown' | 'playing' | 'results';
export type RoyaleWeaponId = Mg5WeaponId;
export type RoyaleLootKind = 'weapon' | 'ammo' | 'shield' | 'medkit' | 'grenade';

export type RoyaleVec3 = { x: number; y: number; z: number };

export type RoyalePoi = {
	id: string;
	name: string;
	x: number;
	y: number;
	z: number;
	radius: number;
};

export type RoyaleLootAnchor = {
	id: string;
	poi: string;
	x: number;
	y: number;
	z: number;
};

export type RoyaleBotAnchor = {
	id: string;
	poi: string;
	x: number;
	y: number;
	z: number;
};

export type RoyaleMapData = {
	version: number;
	bounds: {
		minX: number;
		maxX: number;
		minZ: number;
		maxZ: number;
		minY: number;
		maxY: number;
	};
	pois: RoyalePoi[];
	lootAnchors: RoyaleLootAnchor[];
	botAnchors: RoyaleBotAnchor[];
	occluders: number[][];
	nav: {
		cellSize: number;
		originX: number;
		originZ: number;
		cols: number;
		rows: number;
		walkable: string;
		heights: number[];
	};
};

export const ROYALE_MAP: RoyaleMapData = royaleMapJson as RoyaleMapData;
export const ROYALE_MAP_BOUNDS = ROYALE_MAP.bounds;
export const ROYALE_POIS = ROYALE_MAP.pois;
export const ROYALE_LOOT_ANCHORS = ROYALE_MAP.lootAnchors;
export const ROYALE_BOT_ANCHORS = ROYALE_MAP.botAnchors;
export const ROYALE_OCCLUDERS = ROYALE_MAP.occluders.filter((box) => {
	// El terreno del mapa se coló como una caja de oclusión gigante y casi
	// plana (toda la isla, hasta y ≈ 1.36). No es un muro: si se deja, tapa
	// cualquier disparo u ojos de bot a ras de suelo y desde tejados hacia
	// abajo. Se descartan las cajas enormes de poca altura.
	const top = box[4];
	const area = (box[3] - box[0]) * (box[5] - box[2]);
	return !(top <= 1.6 && area >= 1_000);
});

// ---------------------------------------------------------------------------
// Checkpoint y sala
// ---------------------------------------------------------------------------

export const ROYALE_CHECKPOINT = { x: -17.5, y: 0.4, z: 6.5 } as const;
export const ROYALE_ENTRY: RoyaleVec3 = { ...ROYALE_CHECKPOINT };
export const ROYALE_EXIT: RoyaleVec3 = { ...ROYALE_CHECKPOINT };
export const ROYALE_LOBBY_ID = 'minigame-8' as const;
export const ROYALE_ROOM_ID = 'royale' as const;
export const ROYALE_SCENE_ID = 'islas-ciudad' as const;

// ---------------------------------------------------------------------------
// Partida
// ---------------------------------------------------------------------------

export const ROYALE_MAX_PLAYERS = 12;
export const ROYALE_MIN_HUMANS = 1;
export const ROYALE_BOTS_ENABLED = true;
export const ROYALE_BOT_FILL = 11;
export const ROYALE_COUNTDOWN_MS = 30_000;
export const ROYALE_MATCH_MS = 600_000;
export const ROYALE_RESULT_MS = 20_000;
export const ROYALE_POSITION_INTERVAL_MS = 100;
export const ROYALE_STATE_INTERVAL_MS = 1_000;
export const ROYALE_RECONNECT_MS = 20_000;

export const ROYALE_HEALTH_MAX = 100;
export const ROYALE_SHIELD_MAX = 100;
export const ROYALE_MAX_AMMO = 300;
export const ROYALE_MAX_GRENADES = 4;
export const ROYALE_STARTER_AMMO = 60;
export const ROYALE_STARTER_WEAPON: RoyaleWeaponId = 'pistol';
export const ROYALE_STARTER_GRENADES = 0;

export const ROYALE_LOOT_RADIUS = 1.8;
export const ROYALE_LOOT_VERTICAL = 2.5;
export const ROYALE_AMMO_PICKUP = 60;
export const ROYALE_MEDKIT_HEAL = 40;
export const ROYALE_SHIELD_PICKUP = 50;

export const ROYALE_SHOT_ORIGIN_TOL = 2.5;
/**
 * Retardo con el que el cliente dibuja a los demás jugadores
 * (`REMOTE_RENDER_DELAY_MS`). El servidor rebobina las posiciones de los
 * objetivos para que un disparo que se ve encima del enemigo cuente aunque
 * su posición autoritativa ya se haya movido.
 */
export const ROYALE_LAG_COMPENSATION_MS = 200;
export const ROYALE_KILL_Y = -8;
/**
 * Por debajo de este `y` solo hay mar: el jugador no muere, se le devuelve a
 * la orilla caminable más cercana. Queda por debajo de todas las celdas
 * caminables (−1.3) para no rescatar a quien pisa una playa baja.
 */
export const ROYALE_WATER_RESCUE_Y = -3;
export const ROYALE_KILL_CREDIT_MS = 5_000;
export const ROYALE_GRENADE_COOLDOWN_MS = 500;
export const ROYALE_GRENADE_FUSE_MS = 1_500;
export const ROYALE_GRENADE_DAMAGE = 75;
export const ROYALE_GRENADE_EDGE_DAMAGE = 30;
export const ROYALE_GRENADE_RADIUS = 4.5;
export const ROYALE_GRENADE_VERTICAL_REACH = 2.5;

export const ROYALE_MAX_GROUND_SPEED = 10;
export const ROYALE_MAX_AIR_SPEED = 16;
export const ROYALE_MAX_POSITION_Y = 180;

// ---------------------------------------------------------------------------
// Vehículos: coches y globos
// ---------------------------------------------------------------------------

export type RoyaleVehicleKind = 'car' | 'balloon';
export type RoyaleCarModel = 'coche_calabaza' | 'coche_momia' | 'coche_halloween';

export type RoyaleVehicleSpawn = {
	id: string;
	kind: RoyaleVehicleKind;
	name: string;
	/** Solo para coches; los globos ignoran el modelo. */
	model: RoyaleCarModel | null;
	x: number;
	y: number;
	z: number;
	yaw: number;
};

/**
 * Vehículos repartidos por los POI. Los coches aparecen sobre la calzada con
 * el centro del chasis a 1 m del suelo (`y = suelo + 1`); los globos apoyan la
 * barquilla en el suelo (`y = suelo + 0.02`) y despegan con Space.
 *
 * Se midieron con `floorHeightAt` sobre `islas-ciudad.royale.json`; el script
 * `royale:check` comprueba que todos caen en celdas caminables.
 */
export const ROYALE_VEHICLE_SPAWNS: readonly RoyaleVehicleSpawn[] = [
	{
		id: 'car-comercios',
		kind: 'car',
		name: 'Pumpkin Car',
		model: 'coche_calabaza',
		x: 157,
		y: 2.6,
		z: -17,
		yaw: Math.PI / 2
	},
	{
		id: 'car-resort',
		kind: 'car',
		name: 'Mummy Car',
		model: 'coche_momia',
		x: 83,
		y: -0.3,
		z: 65,
		yaw: 0
	},
	{
		id: 'car-sur',
		kind: 'car',
		name: 'Halloween Car',
		model: 'coche_halloween',
		x: -1,
		y: 2.6,
		z: -183,
		yaw: Math.PI
	},
	{
		id: 'car-civico',
		kind: 'car',
		name: 'Pumpkin Car',
		model: 'coche_calabaza',
		x: 11,
		y: 2.7,
		z: 137,
		yaw: -Math.PI / 2
	},
	{
		id: 'balloon-faro',
		kind: 'balloon',
		name: 'Faro Balloon',
		model: null,
		x: -1,
		y: 2.92,
		z: -15,
		yaw: 0
	},
	{
		id: 'balloon-noroeste',
		kind: 'balloon',
		name: 'Resort Balloon',
		model: null,
		x: -109,
		y: 1.62,
		z: -121,
		yaw: Math.PI / 3
	},
	{
		id: 'balloon-norte',
		kind: 'balloon',
		name: 'Dock Balloon',
		model: null,
		x: -13,
		y: -1.18,
		z: 197,
		yaw: Math.PI
	}
];

export const ROYALE_VEHICLE_HEALTH: Readonly<Record<RoyaleVehicleKind, number>> = {
	car: 550,
	balloon: 400
};

/** Radio para mostrar el prompt y entrar/salir del vehículo. */
export const ROYALE_VEHICLE_ENTER_RADIUS = 4.5;
export const ROYALE_VEHICLE_ENTER_MAX_DY = 4;
/** Distancia lateral a la que aparece el jugador al bajar. */
export const ROYALE_VEHICLE_EXIT_DISTANCE = 2.8;

/** Velocidad máxima del coche (m/s). La física real la limita el cliente. */
export const ROYALE_CAR_MAX_SPEED = 26;

/** Vuelo del globo. */
export const ROYALE_BALLOON_MAX_SPEED = 13;
export const ROYALE_BALLOON_LIFT_SPEED = 6.5;
export const ROYALE_BALLOON_ACCELERATION = 6;
export const ROYALE_BALLOON_YAW_SPEED = 1.2;
export const ROYALE_BALLOON_MAX_Y = 55;
/** Margen interior al mapa: el globo no puede salir de este rectángulo. */
export const ROYALE_BALLOON_BOUNDS_MARGIN = 10;

/**
 * Los vehículos colisionan con el mundo estático (0x0001) pero no con los
 * jugadores: el atropello lo decide el servidor, no Rapier.
 */
export const ROYALE_VEHICLE_COLLISION_GROUPS = (0x0040 << 16) | 0x0001;

/** Reporte del conductor. */
export const ROYALE_VEHICLE_STATE_INTERVAL_MS = 100;
/** Tolerancia de salto por paquete perdido. */
export const ROYALE_VEHICLE_TELEPORT_TOL = 4;

/** Atropello: daño por impacto del coche a un jugador. */
export const ROYALE_VEHICLE_RAM_SPEED = 7;
export const ROYALE_VEHICLE_RAM_DAMAGE = 40;
export const ROYALE_VEHICLE_RAM_COOLDOWN_MS = 1_500;

/** Explosión al destruirse (coche o globo). */
export const ROYALE_VEHICLE_BLAST_RADIUS = 7;
export const ROYALE_VEHICLE_BLAST_DAMAGE = 85;
export const ROYALE_VEHICLE_BLAST_EDGE_DAMAGE = 20;

/** Altura de los pies del conductor respecto a la pose reportada. */
export const ROYALE_CAR_SEAT_OFFSET = -1.0;
export const ROYALE_BALLOON_SEAT_OFFSET = 1.2;

/** Barra de vida sobre el vehículo. */
export const ROYALE_VEHICLE_BAR_HEIGHT: Readonly<Record<RoyaleVehicleKind, number>> = {
	car: 3.1,
	balloon: 12.5
};

// ---------------------------------------------------------------------------
// Zepelín y salto/planeo
// ---------------------------------------------------------------------------

export const ROYALE_BOARDING_MS = 36_500;
export const ROYALE_JUMP_DELAY_MS = 1_500;
export const ROYALE_JUMP_WINDOW_MS = 32_000;
export const ROYALE_ZEPPELIN_SPEED = 12.5;
export const ROYALE_ZEPPELIN_ALTITUDE = 140;
/** Escala visual de `props/zeppelin.glb`; los asientos se calculan con ella. */
export const ROYALE_ZEPPELIN_SCALE = 1.6;
/** Techo del casco en el GLB (unidades locales). */
const ROYALE_ZEPPELIN_HULL_TOP = 3.4;

export const ROYALE_ZEPPELIN_PATH: readonly [number, number, number][] = [
	[-150, 140, -170],
	[-80, 140, -80],
	[0, 140, 0],
	[80, 140, 80],
	[160, 140, 160]
];

export const ROYALE_SKYDIVE_GRAVITY = 40;
export const ROYALE_SKYDIVE_MAX_FALL = 40;
export const ROYALE_SKYDIVE_SPEED = 9;
export const ROYALE_SKYDIVE_DEPLOY_Y = 55;
export const ROYALE_SKYDIVE_DEPLOY_MS = 4_500;
export const ROYALE_GLIDE_FALL = 6;
export const ROYALE_GLIDE_SPEED = 12;

/**
 * Daño por caída. El planeo amortigua el golpe pero no lo anula: salir de un
 * globo en vuelo deja en `glide` (RF-66) y aun así debe doler. El tope evita
 * que el salto inicial del zepelín sea letal.
 */
export const ROYALE_FALL_SAFE_HEIGHT = 5;
export const ROYALE_FALL_GLIDE_FACTOR = 0.5;
export const ROYALE_FALL_DAMAGE_PER_METRE = 1.2;
export const ROYALE_FALL_MAX_DAMAGE = 50;

export function royaleFallDamage(drop: number, gliding: boolean): number {
	if (!Number.isFinite(drop) || drop <= ROYALE_FALL_SAFE_HEIGHT) return 0;
	const effective = (drop - ROYALE_FALL_SAFE_HEIGHT) * (gliding ? ROYALE_FALL_GLIDE_FACTOR : 1);
	const raw = effective * ROYALE_FALL_DAMAGE_PER_METRE;
	return Math.round(Math.min(ROYALE_FALL_MAX_DAMAGE, raw) * 100) / 100;
}

/**
 * Asientos deterministas sobre el casco del zepelín.
 *
 * El modelo mide 20 × 6.8 × 6.8 unidades locales y se dibuja a escala 1.6.
 * La versión anterior usaba `y = punto.y - 2.2`, que cae dentro del globo
 * (el casco llega a ±3.4 locales ≈ ±5.4 m): el avatar y la cámara veían el
 * interior de la tela. Estos asientos se reparten sobre la parte alta del
 * casco, fuera de la malla.
 */
export const ROYALE_SEATS: readonly { x: number; z: number }[] = [
	{ x: -3, z: -0.9 },
	{ x: -3, z: 0.9 },
	{ x: -1.8, z: -0.9 },
	{ x: -1.8, z: 0.9 },
	{ x: -0.6, z: -0.9 },
	{ x: -0.6, z: 0.9 },
	{ x: 0.6, z: -0.9 },
	{ x: 0.6, z: 0.9 },
	{ x: 1.8, z: -0.9 },
	{ x: 1.8, z: 0.9 },
	{ x: 3, z: -0.9 },
	{ x: 3, z: 0.9 }
];

/** Altura de los pies sobre el centro del zepelín (techo del casco). */
export const ROYALE_SEAT_HEIGHT =
	ROYALE_ZEPPELIN_HULL_TOP * ROYALE_ZEPPELIN_SCALE + 0.05;

export function royaleSeat(seat: number): { x: number; z: number } {
	return ROYALE_SEATS[((seat % ROYALE_SEATS.length) + ROYALE_SEATS.length) % ROYALE_SEATS.length];
}

function pathSegments(): Array<{ length: number; start: [number, number, number] }> {
	const segments: Array<{ length: number; start: [number, number, number] }> = [];
	for (let index = 0; index < ROYALE_ZEPPELIN_PATH.length - 1; index += 1) {
		const a = ROYALE_ZEPPELIN_PATH[index];
		const b = ROYALE_ZEPPELIN_PATH[index + 1];
		segments.push({
			length: Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]),
			start: a
		});
	}
	return segments;
}

const ZEPPELIN_SEGMENTS = pathSegments();
export const ROYALE_ZEPPELIN_LENGTH = ZEPPELIN_SEGMENTS.reduce(
	(sum, segment) => sum + segment.length,
	0
);

/**
 * Posición y orientación del zepelín en función del reloj del servidor.
 * Se detiene en el último waypoint al terminar el vuelo.
 */
export function royaleZeppelinAt(
	boardingStartedAt: number,
	now: number
): { x: number; y: number; z: number; yaw: number; distance: number } {
	const elapsed = Math.max(0, now - boardingStartedAt);
	const distance = Math.min(ROYALE_ZEPPELIN_LENGTH, (elapsed / 1000) * ROYALE_ZEPPELIN_SPEED);
	let remaining = distance;
	let x = ROYALE_ZEPPELIN_PATH[0][0];
	let y = ROYALE_ZEPPELIN_PATH[0][1];
	let z = ROYALE_ZEPPELIN_PATH[0][2];
	let yaw = 0;

	for (let index = 0; index < ROYALE_ZEPPELIN_PATH.length - 1; index += 1) {
		const a = ROYALE_ZEPPELIN_PATH[index];
		const b = ROYALE_ZEPPELIN_PATH[index + 1];
		const segmentLength = ZEPPELIN_SEGMENTS[index].length;
		const dx = b[0] - a[0];
		const dy = b[1] - a[1];
		const dz = b[2] - a[2];
		const t = segmentLength <= 0 ? 0 : Math.min(1, remaining / segmentLength);

		x = a[0] + dx * t;
		y = a[1] + dy * t;
		z = a[2] + dz * t;
		yaw = Math.atan2(dx, dz);

		if (remaining <= segmentLength) break;
		remaining -= segmentLength;
	}

	return { x, y, z, yaw, distance };
}

/** Posición inicial al saltar: el servidor la calcula desde el path. */
export function royaleJumpPosition(
	boardingStartedAt: number,
	now: number,
	seat: number
): RoyaleVec3 {
	const point = royaleZeppelinAt(boardingStartedAt, now);
	const offset = royaleSeat(seat);
	const cos = Math.cos(point.yaw);
	const sin = Math.sin(point.yaw);
	return {
		x: point.x + offset.x * cos + offset.z * sin,
		y: point.y + ROYALE_SEAT_HEIGHT,
		z: point.z - offset.x * sin + offset.z * cos
	};
}

// ---------------------------------------------------------------------------
// Tormenta
// ---------------------------------------------------------------------------

export type RoyaleStormPhase = {
	radius: number;
	waitMs: number;
	shrinkMs: number;
	dps: number;
};

export const ROYALE_STORM_START_MS = 60_000;

export const ROYALE_STORM_PHASES: readonly RoyaleStormPhase[] = [
	{ radius: 400, waitMs: 75_000, shrinkMs: 0, dps: 0 },
	{ radius: 260, waitMs: 45_000, shrinkMs: 30_000, dps: 1 },
	{ radius: 180, waitMs: 30_000, shrinkMs: 25_000, dps: 2 },
	{ radius: 120, waitMs: 30_000, shrinkMs: 25_000, dps: 3 },
	{ radius: 70, waitMs: 30_000, shrinkMs: 25_000, dps: 5 },
	{ radius: 35, waitMs: 30_000, shrinkMs: 25_000, dps: 8 },
	{ radius: 10, waitMs: 30_000, shrinkMs: 20_000, dps: 12 },
	{ radius: 3, waitMs: 20_000, shrinkMs: 15_000, dps: 20 }
];

export const ROYALE_STORM_DAMAGE_INTERVAL_MS = 1_000;
export const ROYALE_STORM_WARN_MS = 10_000;

export type RoyaleStormCircle = { cx: number; cz: number; radius: number };

export type RoyaleStormState = {
	phase: number;
	cx: number;
	cz: number;
	radius: number;
	nextCx: number;
	nextCz: number;
	nextRadius: number;
	endsAt: number;
	dps: number;
	state: 'wait' | 'shrink';
};

export function mulberry32(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

export function royaleDistance(ax: number, az: number, bx: number, bz: number): number {
	return Math.hypot(ax - bx, az - bz);
}

export function royaleInSafeZone(
	storm: Pick<RoyaleStormCircle, 'cx' | 'cz' | 'radius'>,
	x: number,
	z: number,
	margin = 0
): boolean {
	return royaleDistance(x, z, storm.cx, storm.cz) <= Math.max(0, storm.radius - margin);
}

/**
 * Centros deterministas de cada fase. La fase 0 cubre todo el mapa; cada
 * centro posterior cae dentro del círculo anterior (con 5 m de holgura).
 */
export function royaleStormCenters(seed: number): RoyaleStormCircle[] {
	const circles: RoyaleStormCircle[] = [{ cx: 0, cz: 0, radius: ROYALE_STORM_PHASES[0].radius }];

	for (let phase = 1; phase < ROYALE_STORM_PHASES.length; phase += 1) {
		const previous = circles[phase - 1];
		const radius = ROYALE_STORM_PHASES[phase].radius;
		const maxDistance = Math.max(0, previous.radius - radius - 5);
		const random = mulberry32((seed ^ 0x9e3779b9) + phase * 7919);
		const candidates = ROYALE_POIS.filter(
			(poi) => royaleDistance(poi.x, poi.z, previous.cx, previous.cz) <= maxDistance
		);

		if (candidates.length > 0) {
			const chosen = candidates[Math.floor(random() * candidates.length) % candidates.length];
			circles.push({ cx: chosen.x, cz: chosen.z, radius });
			continue;
		}

		let nearest = ROYALE_POIS[0];
		let nearestDistance = Infinity;
		for (const poi of ROYALE_POIS) {
			const distance = royaleDistance(poi.x, poi.z, previous.cx, previous.cz);
			if (distance < nearestDistance) {
				nearest = poi;
				nearestDistance = distance;
			}
		}

		const angle = Math.atan2(nearest.z - previous.cz, nearest.x - previous.cx);
		const distance = Math.min(maxDistance, nearestDistance);
		circles.push({
			cx: previous.cx + Math.cos(angle) * distance,
			cz: previous.cz + Math.sin(angle) * distance,
			radius
		});
	}

	return circles;
}

/** Estado autoritativo de la tormenta para un instante concreto. */
export function royaleStormAt(matchStartedAt: number, now: number, seed: number): RoyaleStormState {
	const circles = royaleStormCenters(seed);
	const stormStart = matchStartedAt + ROYALE_STORM_START_MS;

	if (now < stormStart) {
		const first = ROYALE_STORM_PHASES[0];
		const second = circles[1];
		return {
			phase: 0,
			cx: 0,
			cz: 0,
			radius: first.radius,
			nextCx: second.cx,
			nextCz: second.cz,
			nextRadius: second.radius,
			endsAt: stormStart + first.waitMs,
			dps: 0,
			state: 'wait'
		};
	}

	let cursor = stormStart;

	for (let phase = 0; phase < ROYALE_STORM_PHASES.length; phase += 1) {
		const definition = ROYALE_STORM_PHASES[phase];
		const wait = definition.waitMs;

		if (now < cursor + wait) {
			const current = circles[phase];
			const next = circles[Math.min(phase + 1, circles.length - 1)];
			return {
				phase,
				cx: phase === 0 ? 0 : circles[phase - 1].cx,
				cz: phase === 0 ? 0 : circles[phase - 1].cz,
				radius: phase === 0 ? definition.radius : circles[phase - 1].radius,
				nextCx: next.cx,
				nextCz: next.cz,
				nextRadius: next.radius,
				endsAt: cursor + wait + definition.shrinkMs,
				dps: definition.dps,
				state: 'wait'
			};
		}

		cursor += wait;

		if (phase > 0 && definition.shrinkMs > 0) {
			if (now < cursor + definition.shrinkMs) {
				const t = (now - cursor) / definition.shrinkMs;
				const from = circles[phase - 1];
				const to = circles[phase];
				return {
					phase,
					cx: from.cx + (to.cx - from.cx) * t,
					cz: from.cz + (to.cz - from.cz) * t,
					radius: from.radius + (to.radius - from.radius) * t,
					nextCx: to.cx,
					nextCz: to.cz,
					nextRadius: to.radius,
					endsAt: cursor + definition.shrinkMs,
					dps: definition.dps,
					state: 'shrink'
				};
			}

			cursor += definition.shrinkMs;
		}

		if (phase === ROYALE_STORM_PHASES.length - 1) {
			break;
		}
	}

	// Fase final: el círculo de 3 m se mantiene hasta el final de la partida.
	const last = circles[circles.length - 1];
	return {
		phase: ROYALE_STORM_PHASES.length - 1,
		cx: last.cx,
		cz: last.cz,
		radius: last.radius,
		nextCx: last.cx,
		nextCz: last.cz,
		nextRadius: last.radius,
		endsAt: cursor + 1_000_000,
		dps: ROYALE_STORM_PHASES[ROYALE_STORM_PHASES.length - 1].dps,
		state: 'wait'
	};
}

/** Punto determinista dentro del círculo seguro, con margen. */
export function royaleSafePoint(
	storm: RoyaleStormCircle,
	seed: number,
	margin = 8
): { x: number; z: number } {
	const usable = Math.max(0, storm.radius - margin);
	const random = mulberry32(seed);
	const angle = random() * Math.PI * 2;
	const distance = Math.sqrt(random()) * usable;
	return {
		x: storm.cx + Math.cos(angle) * distance,
		z: storm.cz + Math.sin(angle) * distance
	};
}

// ---------------------------------------------------------------------------
// Loot y armas
// ---------------------------------------------------------------------------

export type RoyaleWeaponDefinition = {
	id: RoyaleWeaponId;
	name: string;
	damage: number;
	/** Disparos por segundo. */
	rate: number;
	range: number;
	magSize: number;
	pellets: number;
	pelletsPerShot: number;
	spread: number;
	auto: boolean;
};

/**
 * Estadísticas del battle royale (spec §11.7). Afinadas para este modo: un
 * cargador completo de pistola debe poder tumbar a un rival con 100 de vida
 * y 100 de escudo, y ninguna arma debe tardar más de 3 s en matar a 100 HP.
 * No altera `wavesConfig`.
 */
export const ROYALE_WEAPONS: readonly RoyaleWeaponDefinition[] = [
	{
		id: 'pistol',
		name: 'Rusty Pistol',
		damage: 17,
		rate: 6,
		range: 55,
		magSize: 12,
		pellets: 1,
		pelletsPerShot: 1,
		spread: 0,
		auto: false
	},
	{
		id: 'shotgun',
		name: 'Shotgun',
		damage: 7,
		rate: 1.2,
		range: 32,
		magSize: 6,
		pellets: 8,
		pelletsPerShot: 8,
		spread: (7 * Math.PI) / 180,
		auto: false
	},
	{
		id: 'smg',
		name: 'SMG',
		damage: 11,
		rate: 11,
		range: 42,
		magSize: 30,
		pellets: 1,
		pelletsPerShot: 1,
		spread: 0,
		auto: true
	},
	{
		id: 'rifle',
		name: 'Hunting Rifle',
		damage: 52,
		rate: 1.5,
		range: 130,
		magSize: 5,
		pellets: 1,
		pelletsPerShot: 1,
		spread: 0,
		auto: false
	}
];

export const ROYALE_WEAPON_BY_ID: ReadonlyMap<RoyaleWeaponId, RoyaleWeaponDefinition> = new Map(
	ROYALE_WEAPONS.map((weapon) => [weapon.id, weapon])
);

export const ROYALE_WEAPON_SLOT_BY_ID: Readonly<Record<RoyaleWeaponId, number>> = {
	pistol: 1,
	shotgun: 2,
	smg: 3,
	rifle: 4
};

export const ROYALE_WEAPON_BY_SLOT: Readonly<Record<number, RoyaleWeaponId>> = {
	1: 'pistol',
	2: 'shotgun',
	3: 'smg',
	4: 'rifle'
};

export const ROYALE_LOOT_TABLE: readonly {
	kind: Exclude<RoyaleLootKind, 'weapon'> | 'weapon';
	weight: number;
}[] = [
	{ kind: 'weapon', weight: 45 },
	{ kind: 'ammo', weight: 20 },
	{ kind: 'shield', weight: 13 },
	{ kind: 'medkit', weight: 12 },
	{ kind: 'grenade', weight: 10 }
];

export const ROYALE_WEAPON_LOOT_TABLE: readonly { weapon: RoyaleWeaponId; weight: number }[] = [
	{ weapon: 'shotgun', weight: 30 },
	{ weapon: 'smg', weight: 30 },
	{ weapon: 'rifle', weight: 20 },
	{ weapon: 'pistol', weight: 20 }
];

function weightedPick<T>(random: () => number, entries: readonly { weight: number }[]): T {
	const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
	let roll = random() * total;

	for (const entry of entries) {
		roll -= entry.weight;
		if (roll <= 0) return entry as T;
	}

	return entries[entries.length - 1] as T;
}

export function royaleRollLoot(seed: number): {
	kind: RoyaleLootKind;
	weapon: RoyaleWeaponId | null;
} {
	const random = mulberry32(seed);
	const entry = weightedPick<{ kind: RoyaleLootKind; weight: number }>(random, ROYALE_LOOT_TABLE);

	if (entry.kind !== 'weapon') {
		return { kind: entry.kind, weapon: null };
	}

	const weapon = weightedPick<{ weapon: RoyaleWeaponId; weight: number }>(
		random,
		ROYALE_WEAPON_LOOT_TABLE
	).weapon;

	return { kind: 'weapon', weapon };
}

// ---------------------------------------------------------------------------
// Bots
// ---------------------------------------------------------------------------

export const ROYALE_BOT_THINK_MS = 200;
export const ROYALE_BOT_VIEW_RANGE = 55;
/** Los bots no abren fuego hasta pasado este margen desde el inicio. */
export const ROYALE_BOT_ENGAGE_DELAY_MS = 45_000;
export const ROYALE_BOT_FOV_DEG = 120;
export const ROYALE_BOT_FOV_RAD = (ROYALE_BOT_FOV_DEG * Math.PI) / 180;
export const ROYALE_BOT_REACTION_MIN_MS = 250;
export const ROYALE_BOT_REACTION_MAX_MS = 700;
export const ROYALE_BOT_AIM_ERROR_MIN_DEG = 1.5;
export const ROYALE_BOT_AIM_ERROR_MAX_DEG = 4;
export const ROYALE_BOT_JUMP_MIN_MS = 3_000;
export const ROYALE_BOT_JUMP_MAX_MS = 30_000;
export const ROYALE_BOT_LOOT_SCAN = 30;
export const ROYALE_BOT_STORM_MARGIN = 8;
/**
 * Margen de seguridad de los bots dentro de la tormenta. En los círculos
 * finales (radio 3–10 m) el margen fijo de 8 m dejaría la zona "segura"
 * vacía, así que se reduce proporcionalmente al radio.
 */
export function royaleBotStormMargin(radius: number): number {
	return Math.min(ROYALE_BOT_STORM_MARGIN, Math.max(0.75, radius * 0.3));
}
export const ROYALE_BOT_GRENADE_CD_MS = 8_000;
export const ROYALE_BOT_GROUND_SPEED = 5.5;
export const ROYALE_BOT_ROTATE_SPEED = 8;
export const ROYALE_BOT_STUCK_MS = 1_500;

export const ROYALE_BOT_NAMES: readonly string[] = [
	'Paco',
	'Lola',
	'Berto',
	'Cuca',
	'Nano',
	'Pepa',
	'Chus',
	'Manu',
	'Vero',
	'Toño',
	'Rosa',
	'Javi',
	'Marta',
	'Luis',
	'Elena',
	'Raúl',
	'Inés',
	'Diego',
	'Sara',
	'Hugo',
	'Ana',
	'Iván',
	'Nora',
	'Teo'
];

/** Nombre determinista y estable para el bot `index`. */
export function royaleBotName(seed: number, index: number): string {
	const random = mulberry32(seed ^ (index * 2654435761));
	const offset = Math.floor(random() * ROYALE_BOT_NAMES.length);
	return ROYALE_BOT_NAMES[(offset + index) % ROYALE_BOT_NAMES.length];
}

export function royaleBotId(seed: number, index: number): string {
	return `bot:${seed >>> 0}:${index}`;
}

// ---------------------------------------------------------------------------
// Geometría / oclusión
// ---------------------------------------------------------------------------

export type RoyaleAabb = [number, number, number, number, number, number];

/** Intersección segmento 3D ↔ AABB (slab test). Devuelve `t` en [0,1] o null. */
export function royaleSegmentAabb(
	ox: number,
	oy: number,
	oz: number,
	dx: number,
	dy: number,
	dz: number,
	box: RoyaleAabb,
	margin = 0
): number | null {
	let t0 = 0;
	let t1 = 1;

	for (const [origin, delta, min, max] of [
		[ox, dx, box[0] - margin, box[3] + margin],
		[oy, dy, box[1] - margin, box[4] + margin],
		[oz, dz, box[2] - margin, box[5] + margin]
	] as const) {
		if (Math.abs(delta) < 1e-8) {
			if (origin < min || origin > max) return null;
			continue;
		}

		const inverse = 1 / delta;
		let near = (min - origin) * inverse;
		let far = (max - origin) * inverse;

		if (near > far) [near, far] = [far, near];

		t0 = Math.max(t0, near);
		t1 = Math.min(t1, far);

		if (t0 > t1) return null;
	}

	return t0 <= t1 ? t0 : null;
}

/** Primera caja que corta el segmento, o null si hay línea de visión. */
export function royaleSegmentBlocked(from: RoyaleVec3, to: RoyaleVec3, margin = 0.05): boolean {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const dz = to.z - from.z;

	for (const box of ROYALE_OCCLUDERS) {
		const t = royaleSegmentAabb(from.x, from.y, from.z, dx, dy, dz, box as RoyaleAabb, margin);
		// `t = 0` es un origen dentro de la caja. Antes se ignoraba porque el
		// terreno se colaba como una losa gigante y anulaba el combate a ras de
		// suelo; esa losa ya se filtra en `ROYALE_OCCLUDERS`. Ignorarlo ahora
		// dejaba disparar a través de un edificio entero a quien estaba dentro
		// de su AABB (porches, arcos, terrazas). Si el cañón está dentro de un
		// muro, no hay línea de tiro: el muro bloquea.
		if (t !== null && t <= 0.995) return true;
	}

	return false;
}

/** Punto en el que una parábola de granada choca con la primera pared. */
export type RoyaleArcClip = { x: number; y: number; z: number; t: number };

/**
 * Primera caja que corta el vuelo parabólico de una granada.
 *
 * Sin esto, el servidor solo recortaba el destino a los límites del mapa y una
 * granada lanzada contra un muro estallaba al otro lado, matando a quien estaba
 * a cubierto. Se muestrea el arco y se prueba el segmento entre muestras contra
 * los mismos oclusores que usan los disparos.
 *
 * Las cajas que ya contienen el origen se ignoran: quien lanza desde una terraza
 * o dentro del volumen de un edificio no debe ver la granada estallar en su mano.
 *
 * `t` es el instante normalizado (0..1) del impacto dentro del vuelo.
 */
export function royaleArcHit(
	origin: RoyaleVec3,
	velocity: RoyaleVec3,
	flight: number,
	gravity: number,
	margin = 0.05
): RoyaleArcClip | null {
	if (!(flight > 0) || !(gravity > 0)) return null;

	const steps = Math.max(8, Math.min(96, Math.ceil(flight / 0.02)));
	let prevX = origin.x;
	let prevY = origin.y;
	let prevZ = origin.z;

	for (let step = 1; step <= steps; step += 1) {
		const time = (step / steps) * flight;
		const x = origin.x + velocity.x * time;
		const y = origin.y + velocity.y * time - 0.5 * gravity * time * time;
		const z = origin.z + velocity.z * time;
		const dx = x - prevX;
		const dy = y - prevY;
		const dz = z - prevZ;

		let nearest = Number.POSITIVE_INFINITY;

		for (const box of ROYALE_OCCLUDERS) {
			if (
				origin.x >= box[0] - margin &&
				origin.x <= box[3] + margin &&
				origin.y >= box[1] - margin &&
				origin.y <= box[4] + margin &&
				origin.z >= box[2] - margin &&
				origin.z <= box[5] + margin
			) {
				continue;
			}

			const hit = royaleSegmentAabb(prevX, prevY, prevZ, dx, dy, dz, box as RoyaleAabb, margin);

			if (hit !== null && hit >= 0 && hit < nearest) nearest = hit;
		}

		if (nearest !== Number.POSITIVE_INFINITY) {
			const hitTime = ((step - 1 + nearest) / steps) * flight;

			return {
				x: prevX + dx * nearest,
				y: prevY + dy * nearest,
				z: prevZ + dz * nearest,
				t: hitTime / flight
			};
		}

		prevX = x;
		prevY = y;
		prevZ = z;
	}

	return null;
}

/** Etiqueta legible del arma para killfeed y HUD. */
export function royaleWeaponName(weapon: RoyaleWeaponId | null | undefined): string {
	if (!weapon) return 'Grenade';
	return ROYALE_WEAPON_BY_ID.get(weapon)?.name ?? weapon;
}
