/**
 * Parkour — carrera de la Torre de Halloween (`minigame-7`).
 *
 * ⚠️ DEPENDE DEL MAPA. Todas las coordenadas están medidas sobre
 * `frontend/static/Parkour.glb` (Y-up de juego, sin rotar). El componente
 * manual y la física viven en `frontend/world/parkour.physics.json`; si se
 * sustituye el GLB hay que volver a medir ambos y este archivo.
 *
 * `y` es siempre la superficie superior de la plataforma. El respawn usa
 * `y + 0.15` para dejar los pies justo encima.
 */

import type { Mg5MonsterKind } from './wavesConfig';

// ---------------------------------------------------------------------------
// Partida
// ---------------------------------------------------------------------------

export const PARKOUR_MAX_PLAYERS = 12;
export const PARKOUR_COUNTDOWN_MS = 30_000;
export const PARKOUR_COUNTDOWN_SHORT_MS = 10_000;
export const PARKOUR_MATCH_MAX_MS = 600_000;
export const PARKOUR_RESULTS_MS = 15_000;
export const PARKOUR_FINISH_GRACE_MS = 3_500;

export const PARKOUR_CHECKPOINT_RADIUS = 3.0;
export const PARKOUR_FINISH_RADIUS = 3.5;
/**
 * The summit terrace is 26×26 m; a 3.5 m radius around its centre missed
 * racers arriving from the SP8 stairs. The finish zone covers the whole deck
 * (same height window as the checkpoints).
 */
export const PARKOUR_FINISH_ZONE = {
	minX: -12.5,
	maxX: 12.5,
	minZ: -124.5,
	maxZ: -99.5
} as const;
export const PARKOUR_CHECKPOINT_TOP = 3.0;
export const PARKOUR_CHECKPOINT_BOTTOM = 0.75;

export const PARKOUR_FALL_DEPTH = 2.5;
export const PARKOUR_FALL_GRACE_MS = 250;
export const PARKOUR_RESPAWN_DELAY_MS = 1_000;
export const PARKOUR_RESPAWN_PROTECTION_MS = 1_500;
export const PARKOUR_RESPAWN_LIFT = 0.15;

/**
 * Salto específico del parkour: 8.0 m/s con gravedad 18 da ~1.78 m de altura.
 * El salto global (6.0 m/s, ~1.0 m) no basta para los escalones de 1.2 m de
 * la ruta (`HP_A1`–`HP_A7`) ni para los obstáculos altos de las plazas; con
 * 7.0 m/s (~1.36 m) algunos bordes quedaban fuera de alcance.
 */
export const PARKOUR_JUMP_SPEED = 8.0;

export const PARKOUR_WARDEN_ARM_DELAY_MS = 2_000;
export const PARKOUR_FIRE_PULSES = 3;
export const PARKOUR_FIRE_PULSE_MS = 320;

export const PARKOUR_MAX_PUSH_HORIZONTAL = 20;
export const PARKOUR_MAX_PUSH_VERTICAL = 11;
export const PARKOUR_WARDEN_VERTICAL_REACH = 8;
/**
 * Anticipación del lanzamiento sobre la velocidad reportada del objetivo
 * (0 = apuntar a donde estaba, 1 = apuntar a donde estará al impactar).
 * Sin esto correr en línea recta dejaba al jugador fuera del radio de empuje
 * y podía atravesar la roca o el ácido sin recibir nada.
 */
export const PARKOUR_ROCK_TARGET_LEAD = 0.8;
export const PARKOUR_ACID_TARGET_LEAD = 0.85;
/** Radio del proyectil para el barrido continuo contra el cuerpo del jugador. */
export const PARKOUR_ROCK_SWEEP_RADIUS = 0.7;
export const PARKOUR_ACID_SWEEP_RADIUS = 0.45;
/** Amortiguación del empuje horizontal en el controlador local (1/s). */
export const PARKOUR_KNOCKBACK_DAMPING = 3.2;

export const PARKOUR_POSITION_INTERVAL_MS = 100;
export const PARKOUR_POSITION_MAX_HZ = 20;
export const PARKOUR_POSITION_MAX_STEP = 5;
export const PARKOUR_POSITION_MAX_VERTICAL = 10;
export const PARKOUR_POSITION_FRESH_MS = 500;

export const PARKOUR_BOUNDS = {
	minX: -80,
	maxX: 80,
	minZ: -160,
	maxZ: 110,
	minY: -30,
	maxY: 110
} as const;

export type ParkourPoint = { x: number; y: number; z: number };

/** START: `HP_SpawnPadGlow`; el respawn de emergencia usa esta misma altura. */
export const PARKOUR_START: ParkourPoint = { x: 0, y: 0.15, z: 82.5 };

/** Rejilla de salida 4 columnas × 3 filas, mirando a −Z. */
export const PARKOUR_GRID_COLUMNS = [-2.4, -0.8, 0.8, 2.4] as const;
export const PARKOUR_GRID_ROWS = [81.0, 82.6, 84.2] as const;
export const PARKOUR_GRID_YAW = Math.PI;

export type ParkourGridSlot = { x: number; y: number; z: number; yaw: number };

export const PARKOUR_START_GRID: readonly ParkourGridSlot[] = PARKOUR_GRID_ROWS.flatMap((z) =>
	PARKOUR_GRID_COLUMNS.map((x) => ({
		x,
		y: PARKOUR_START.y,
		z,
		yaw: PARKOUR_GRID_YAW
	}))
);

// ---------------------------------------------------------------------------
// Checkpoints
// ---------------------------------------------------------------------------

export type ParkourCheckpoint = {
	/** 1..12; 0 is START and 13 is FINISH. */
	index: number;
	node: string;
	name: string;
	x: number;
	y: number;
	z: number;
};

/** Los 12 checkpoints secuenciales, con `y` igual a la superficie de la plaza. */
export const PARKOUR_CHECKPOINTS: readonly ParkourCheckpoint[] = [
	{ index: 1, node: 'HP_CP1_Root', name: 'Checkpoint 1', x: 0, y: 3.0, z: 21.5 },
	{ index: 2, node: 'HP_CP2_Root', name: 'Checkpoint 2', x: 35, y: 7.5, z: -6 },
	{ index: 3, node: 'HP_CP3_Root', name: 'Checkpoint 3', x: 33, y: 9.2, z: -39.5 },
	{ index: 4, node: 'HP_CP4_Root', name: 'Checkpoint 4', x: -6.5, y: 13.2, z: -53 },
	{ index: 5, node: 'HP_SP1_Root', name: 'Checkpoint 5', x: 0, y: 22, z: -96.8 },
	{ index: 6, node: 'HP_SP2_Root', name: 'Checkpoint 6', x: 10.267, y: 30, z: -123.208 },
	{ index: 7, node: 'HP_SP3_Root', name: 'Checkpoint 7', x: -15.142, y: 38, z: -110.67 },
	{ index: 8, node: 'HP_SP4_Root', name: 'Checkpoint 8', x: 12.064, y: 46, z: -102.753 },
	{ index: 9, node: 'HP_SP5_Root', name: 'Checkpoint 9', x: -2.65, y: 54, z: -126.967 },
	{ index: 10, node: 'HP_SP6_Root', name: 'Checkpoint 10', x: -8.156, y: 62, z: -99.173 },
	{ index: 11, node: 'HP_SP7_Root', name: 'Checkpoint 11', x: 14.678, y: 70, z: -115.949 },
	{ index: 12, node: 'HP_SP8_Root', name: 'Checkpoint 12', x: -13.491, y: 78, z: -119.002 }
];

export const PARKOUR_FINISH = {
	index: 13,
	node: 'HP_SummitTerrace',
	name: 'Summit',
	x: 0,
	y: 86,
	z: -112
} as const;

export function parkourCheckpointAt(index: number): ParkourPoint | null {
	if (index === 0) {
		return { x: PARKOUR_START.x, y: PARKOUR_START.y, z: PARKOUR_START.z };
	}

	if (index === PARKOUR_FINISH.index) {
		return { x: PARKOUR_FINISH.x, y: PARKOUR_FINISH.y, z: PARKOUR_FINISH.z };
	}

	return PARKOUR_CHECKPOINTS.find((checkpoint) => checkpoint.index === index) ?? null;
}

export function parkourCheckpointName(index: number): string {
	if (index <= 0) return 'Start';
	if (index >= PARKOUR_FINISH.index) return PARKOUR_FINISH.name;

	return PARKOUR_CHECKPOINTS.find((checkpoint) => checkpoint.index === index)?.name ?? 'Finish';
}

/** Dentro del cilindro autoritativo de un checkpoint. */
export function insideCheckpoint(
	point: ParkourPoint,
	checkpoint: ParkourPoint,
	radius = PARKOUR_CHECKPOINT_RADIUS
): boolean {
	if (
		point.y < checkpoint.y - PARKOUR_CHECKPOINT_BOTTOM ||
		point.y > checkpoint.y + PARKOUR_CHECKPOINT_TOP
	) {
		return false;
	}

	return Math.hypot(point.x - checkpoint.x, point.z - checkpoint.z) <= radius;
}

/** The whole summit deck counts as FINISH, not only its centre. */
export function insideFinish(point: ParkourPoint): boolean {
	if (
		point.y < PARKOUR_FINISH.y - PARKOUR_CHECKPOINT_BOTTOM ||
		point.y > PARKOUR_FINISH.y + PARKOUR_CHECKPOINT_TOP
	) {
		return false;
	}

	return (
		point.x >= PARKOUR_FINISH_ZONE.minX &&
		point.x <= PARKOUR_FINISH_ZONE.maxX &&
		point.z >= PARKOUR_FINISH_ZONE.minZ &&
		point.z <= PARKOUR_FINISH_ZONE.maxZ
	);
}

/** Distancia horizontal al centro de un checkpoint (para desempates). */
export function horizontalDistanceTo(point: ParkourPoint, checkpoint: ParkourPoint): number {
	return Math.hypot(point.x - checkpoint.x, point.z - checkpoint.z);
}

// ---------------------------------------------------------------------------
// Guardianes (anclas fijas, sin daño)
// ---------------------------------------------------------------------------

export type ParkourWardenPower = 'rock' | 'acid' | 'fire' | 'shove';

export type ParkourWardenDefinition = {
	id: string;
	kind: Mg5MonsterKind;
	name: string;
	power: ParkourWardenPower;
	x: number;
	y: number;
	z: number;
	/** Distancia horizontal máxima para elegir objetivo. */
	range: number;
	cooldownMs: number;
	/** Radio de impacto para roca/ácido; alcance para el zarpazo. */
	impactRadius: number;
	pushHorizontal: number;
	pushVertical: number;
	/** Patrol around the anchor without leaving the checkpoint plaza. */
	patrolRadius: number;
	/** Radians per second of the patrol orbit. */
	patrolSpeed: number;
	patrolPhase: number;
	/**
	 * Melee guardians leave the patrol orbit to chase a racer, but only while
	 * the racer is inside `chaseBounds` (the checkpoint plaza).
	 */
	chase?: boolean;
	/** Chase speed in m/s. */
	chaseSpeed?: number;
	/** Distance kept from the chased racer (melee reach). */
	chaseStandoff?: number;
	/** Plaza bounds the chase can never leave. */
	chaseBounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
};

export const PARKOUR_WARDENS: readonly ParkourWardenDefinition[] = [
	{
		id: 'golem-cp2',
		kind: 'golem',
		name: 'Golem',
		power: 'rock',
		x: 38.2,
		y: 7.5,
		z: -8.6,
		range: 34,
		cooldownMs: 2_600,
		impactRadius: 6.5,
		pushHorizontal: 17.0,
		pushVertical: 10.0,
		patrolRadius: 0.8,
		patrolSpeed: 1.1,
		patrolPhase: 0.0
	},
	{
		id: 'witch-cp4',
		kind: 'witch',
		name: 'Witch',
		power: 'acid',
		x: -9.6,
		y: 13.2,
		z: -55.6,
		range: 30,
		cooldownMs: 2_000,
		impactRadius: 4.5,
		pushHorizontal: 13.0,
		pushVertical: 6.0,
		patrolRadius: 1.1,
		patrolSpeed: 0.85,
		patrolPhase: 1.3
	},
	{
		id: 'demon-cp12',
		kind: 'demon',
		name: 'Demon',
		power: 'fire',
		x: -10.9,
		y: 78,
		z: -121.4,
		range: 21,
		cooldownMs: 2_000,
		impactRadius: 21,
		pushHorizontal: 9.0,
		pushVertical: 4.5,
		patrolRadius: 2.0,
		patrolSpeed: 0.7,
		patrolPhase: 5.1
	},
	{
		id: 'vampire-cp8',
		kind: 'vampire',
		name: 'Vampire',
		power: 'acid',
		x: 14.7,
		y: 46,
		z: -105.0,
		range: 28,
		cooldownMs: 1_700,
		impactRadius: 4.5,
		pushHorizontal: 13.0,
		pushVertical: 5.5,
		patrolRadius: 1.9,
		patrolSpeed: 0.65,
		patrolPhase: 3.4
	},
	{
		id: 'pumpkin-cp10',
		kind: 'pumpkin-king',
		name: 'Pumpkin King',
		power: 'acid',
		x: -10.8,
		y: 62,
		z: -101.7,
		range: 36,
		cooldownMs: 2_400,
		impactRadius: 5.5,
		pushHorizontal: 15.0,
		pushVertical: 6.5,
		patrolRadius: 1.9,
		patrolSpeed: 0.65,
		patrolPhase: 4.2
	},
	{
		id: 'ghost-cp6',
		kind: 'ghost',
		name: 'Ghost',
		power: 'shove',
		x: 13.2,
		y: 30,
		z: -125.6,
		range: 8.0,
		cooldownMs: 700,
		impactRadius: 6.5,
		pushHorizontal: 11.0,
		pushVertical: 5.0,
		patrolRadius: 1.6,
		patrolSpeed: 0.75,
		patrolPhase: 2.1,
		chase: true,
		chaseSpeed: 3.6,
		chaseStandoff: 1.5,
		chaseBounds: { minX: 6.6, maxX: 14.0, minZ: -126.9, maxZ: -119.5 }
	}
];

/**
 * Deterministic patrol shared by server and client. The warden orbits its
 * checkpoint anchor slowly and never leaves the plaza; `y` stays on the
 * surface. Both sides use the authoritative server time to avoid drift.
 */
export function parkourWardenPosition(
	warden: ParkourWardenDefinition,
	timeMs: number
): ParkourPoint {
	const angle = warden.patrolPhase + (timeMs / 1_000) * warden.patrolSpeed;

	return {
		x: warden.x + Math.cos(angle) * warden.patrolRadius,
		y: warden.y,
		z: warden.z + Math.sin(angle) * warden.patrolRadius
	};
}

export function parkourWardenById(id: string): ParkourWardenDefinition | null {
	return PARKOUR_WARDENS.find((warden) => warden.id === id) ?? null;
}

/** `true` when the racer is inside the plaza a melee warden is allowed to guard. */
export function parkourWardenCanChase(
	warden: ParkourWardenDefinition,
	target: ParkourPoint | null | undefined
): target is ParkourPoint {
	if (!warden.chase || !warden.chaseBounds || !target) {
		return false;
	}

	const bounds = warden.chaseBounds;

	return (
		target.x >= bounds.minX &&
		target.x <= bounds.maxX &&
		target.z >= bounds.minZ &&
		target.z <= bounds.maxZ
	);
}

/**
 * Advances a chasing warden one step. The target is the racer to follow, or
 * `null` when nobody is inside the plaza, in which case the warden returns to
 * its deterministic patrol orbit. The result never leaves `chaseBounds`.
 *
 * Shared by the server engine and the client model so both agree on where a
 * melee warden stands.
 */
export function parkourWardenChaseStep(
	warden: ParkourWardenDefinition,
	current: ParkourPoint,
	target: ParkourPoint | null,
	deltaMs: number,
	timeMs: number
): ParkourPoint {
	if (!warden.chase || !warden.chaseBounds) {
		return current;
	}

	const bounds = warden.chaseBounds;
	const dt = Math.max(0, Math.min(deltaMs, 250)) / 1_000;
	const speed = warden.chaseSpeed ?? 0;
	const patrol = parkourWardenPosition(warden, timeMs);
	let desiredX = patrol.x;
	let desiredZ = patrol.z;

	if (parkourWardenCanChase(warden, target)) {
		const dx = target.x - warden.x;
		const dz = target.z - warden.z;
		const distance = Math.hypot(dx, dz);

		if (distance > 1e-4) {
			const reach = Math.max(0, distance - (warden.chaseStandoff ?? 1.5));

			desiredX = warden.x + (dx / distance) * reach;
			desiredZ = warden.z + (dz / distance) * reach;
		}
	}

	desiredX = Math.min(bounds.maxX, Math.max(bounds.minX, desiredX));
	desiredZ = Math.min(bounds.maxZ, Math.max(bounds.minZ, desiredZ));

	const stepX = desiredX - current.x;
	const stepZ = desiredZ - current.z;
	const remaining = Math.hypot(stepX, stepZ);
	const maxStep = speed * dt;

	if (remaining <= maxStep || remaining < 1e-6) {
		return { x: desiredX, y: warden.y, z: desiredZ };
	}

	return {
		x: current.x + (stepX / remaining) * maxStep,
		y: warden.y,
		z: current.z + (stepZ / remaining) * maxStep
	};
}

// ---------------------------------------------------------------------------
// Ruta (superficies, en orden)
// ---------------------------------------------------------------------------

export type ParkourRouteSurface = {
	node: string;
	x: number;
	y: number;
	z: number;
};

/**
 * Superficies de la ruta en orden. Las rampas `SP*_Step*` y los `TowerLink`
 * no son saltos: suben por pendiente y viven solo en la física.
 */
export const PARKOUR_ROUTE: readonly ParkourRouteSurface[] = [
	{ node: 'HP_Spawn_Top', x: 0, y: 0, z: 79 },
	{ node: 'HP_SpawnPad', x: 0, y: 0.13, z: 82.5 },
	{ node: 'HP_C01', x: 0, y: 0, z: 62 },
	{ node: 'HP_C02', x: 0, y: 0.5, z: 53.5 },
	{ node: 'HP_C03', x: -3.5, y: 1, z: 47.5 },
	{ node: 'HP_C04', x: 2, y: 1.5, z: 41 },
	{ node: 'HP_C05', x: -2, y: 2, z: 35 },
	{ node: 'HP_C06', x: 3, y: 2.5, z: 29 },
	{ node: 'HP_CP1_Plaza', x: 0, y: 3, z: 21.5 },
	{ node: 'HP_C07', x: 7, y: 4, z: 14 },
	{ node: 'HP_C08', x: 14, y: 5, z: 8.5 },
	{ node: 'HP_C09', x: 21, y: 6, z: 4.5 },
	{ node: 'HP_C10', x: 28.5, y: 7, z: 1.5 },
	{ node: 'HP_CP2_Plaza', x: 35, y: 7.5, z: -6 },
	{ node: 'HP_C11', x: 37.5, y: 8, z: -14 },
	{ node: 'HP_C12', x: 39, y: 8.5, z: -22 },
	{ node: 'HP_C13', x: 37, y: 9, z: -30 },
	{ node: 'HP_CP3_Plaza', x: 33, y: 9.2, z: -39.5 },
	{ node: 'HP_C14', x: 25, y: 10, z: -44 },
	{ node: 'HP_C15', x: 17.5, y: 10.8, z: -47 },
	{ node: 'HP_C16', x: 9.5, y: 11.6, z: -49.5 },
	{ node: 'HP_C17', x: 1.5, y: 12.4, z: -51.5 },
	{ node: 'HP_CP4_Plaza', x: -6.5, y: 13.2, z: -53 },
	{ node: 'HP_A1', x: -13, y: 14.2, z: -54 },
	{ node: 'HP_A2', x: -17.5, y: 15.3, z: -54.2 },
	{ node: 'HP_A3', x: -22, y: 16.4, z: -55.5 },
	{ node: 'HP_A4', x: -17, y: 17.5, z: -56.54 },
	{ node: 'HP_A5', x: -12, y: 18.6, z: -56.5 },
	{ node: 'HP_A6', x: -7, y: 19.6, z: -56.5 },
	{ node: 'HP_A7', x: -2, y: 20.5, z: -56.5 },
	{ node: 'HP_RoofDeck', x: 0, y: 20.73, z: -70 },
	{ node: 'HP_SpirePad', x: 0, y: 20.9, z: -74.6 },
	{ node: 'HP_BridgeDeck', x: 0, y: 20.72, z: -86.8 },
	{ node: 'HP_SpireEntryStep0', x: 0, y: 21.12, z: -88.4 },
	{ node: 'HP_SpireEntryStep1', x: 0, y: 21.52, z: -89.7 },
	{ node: 'HP_SpireEntryStep2', x: 0, y: 21.92, z: -91 },
	{ node: 'HP_SP1_Plaza', x: 0, y: 22, z: -96.8 },
	{ node: 'HP_SP2_Plaza', x: 10.267, y: 30, z: -123.208 },
	{ node: 'HP_SP3_Plaza', x: -15.142, y: 38, z: -110.67 },
	{ node: 'HP_SP4_Plaza', x: 12.064, y: 46, z: -102.753 },
	{ node: 'HP_SP5_Plaza', x: -2.65, y: 54, z: -126.967 },
	{ node: 'HP_SP6_Plaza', x: -8.156, y: 62, z: -99.173 },
	{ node: 'HP_SP7_Plaza', x: 14.678, y: 70, z: -115.949 },
	{ node: 'HP_SP8_Plaza', x: -13.491, y: 78, z: -119.002 },
	{ node: 'HP_SummitTerrace', x: 0, y: 86, z: -112 }
];

/** Los 32 escalones perimetrales y ocho enlaces de la torre. */
export const PARKOUR_TOWER_RAMPS: readonly string[] = Array.from(
	{ length: 8 },
	(_, index) => index + 1
).flatMap((level) => [
	`HP_SP${level}_Step0`,
	`HP_SP${level}_Step1`,
	`HP_SP${level}_Step2`,
	`HP_SP${level}_Step3`,
	`HP_SP${level}_TowerLink`
]);

export const PARKOUR_EXCLUDED_PATTERNS = [
	'Island',
	'Cloud',
	'Star',
	'Moon',
	'Rock',
	'Shaft',
	'Rib',
	'Spine',
	'Flag',
	'Sign',
	'Rail',
	'Arch',
	'Merlon'
] as const;
