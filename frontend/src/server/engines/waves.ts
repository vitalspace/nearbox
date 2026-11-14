import {
	ACID_DIRECT_RADIUS,
	ACID_GRAVITY,
	ACID_MAX_POOLS,
	ACID_POOL_DURATION_MS,
	ACID_POOL_DPS,
	ACID_POOL_RADIUS,
	ACID_SWEEP_RADIUS,
	ACID_TARGET_LEAD,
	ACID_VERTICAL_REACH,
	ARENA_FLOOR_Y,
	ARENA_POLYGON,
	BUILDING_BLOCKS,
	DEMON_FIRE_DURATION_MS,
	DEMON_FIRE_HALF_ANGLE,
	DEMON_FIRE_MOUTH_HEIGHT,
	DEMON_FIRE_RANGE,
	DEMON_FIRE_TICK_MS,
	DEMON_FIRE_VERTICAL_REACH,
	DROP_DESPAWN_MS,
	DROP_NOTHING_WEIGHT,
	DROP_PICKUP_RADIUS,
	DROP_TABLE,
	GRENADE_DAMAGE,
	GRENADE_EDGE_DAMAGE,
	GRENADE_RADIUS,
	GRENADE_VERTICAL_REACH,
	GOLEM_ROCK_GRAVITY,
	GOLEM_ROCK_IMPACT_RADIUS,
	GOLEM_ROCK_MAX_FLIGHT,
	GOLEM_ROCK_MIN_FLIGHT,
	GOLEM_ROCK_SPEED,
	GOLEM_ROCK_SWEEP_RADIUS,
	GOLEM_ROCK_TARGET_LEAD,
	GOLEM_ROCK_VERTICAL_REACH,
	MAX_GRENADES,
	AMMO_PACK_AMOUNT,
	MEDKIT_AMOUNT,
	MELEE_VERTICAL_REACH,
	MONSTER_BY_KIND,
	MONSTER_CLIMBS,
	MONSTER_MAX_STEP,
	MONSTER_SPAWNS,
	PLAYER_MAX_HEALTH,
	PLAYER_SPEED_CAP,
	PLAYER_SPAWNS,
	STARTER_AMMO,
	STARTER_GRENADES,
	STARTER_WEAPON,
	WAVES_CAR,
	WAVES_CAR_ENTER_RADIUS,
	WAVES_CAR_EJECT_DAMAGE,
	WAVES_CAR_MAX_HEALTH,
	WAVES_CAR_RAM_COOLDOWN_MS,
	WAVES_CAR_RAM_DAMAGE,
	WAVES_CAR_RAM_RADIUS,
	WAVES_COUNTDOWN_FULL_MS,
	WAVES_COUNTDOWN_MS,
	WAVES_INTERMISSION_MS,
	WAVES_MAX_CONCURRENT,
	WAVES_MAX_PLAYERS,
	WAVES_PLAYER_HIT_GRACE_MS,
	WAVES_REVIVE_HEALTH,
	WAVES_RESULT_MS,
	WAVES_SPAWN_STAGGER_MS,
	WAVES_SPAWN_TELEGRAPH_MS,
	WAVES_SPAWN_ACTIVATE_MS,
	WAVES_SPAWN_SAFE_DISTANCE,
	WAVES_TOTAL,
	WEAPON_BY_ID,
	WEAPON_BY_SLOT,
	WEAPON_SLOT_BY_ID,
	WAVE_DEFINITIONS,
	type Mg5MonsterKind,
	type Mg5WeaponId,
	type MonsterClimb
} from '../../lib/state/wavesConfig';
import type {
	Mg5CarState,
	Mg5Drop,
	Mg5Event,
	Mg5EventKind,
	Mg5MonsterSnapshot,
	Mg5Phase,
	Mg5PlayerState,
	Mg5Positions,
	Mg5Snapshot,
	ServerMessage
} from '../protocol';
import type { RoomPort } from '../port';

/**
 * Authoritative engine for `minigame-5` (Barn Siege): up to 12 players survive
 * 8 waves of monsters in the barn siege village (`barnsiege.glb`).
 *
 * The client only reports positions, shots, throws and car state; phases,
 * waves, spawns, AI, acid, drops, damage, revives and scoring live here.
 *
 * NOTE: the arena geometry is imported from `src/lib/state/wavesConfig.ts`
 * (single source of truth; re-measure that file when the map changes).
 */

const ARENA = ARENA_POLYGON;
const STATE_SNAPSHOT_INTERVAL_MS = 1_000;
const POSITION_INTERVAL_MS = 100;
const POSITION_MIN_INTERVAL_MS = 60;
const POOL_TICK_MS = 1_000;
const MONSTER_DEATH_DESPAWN_MS = 2_000;
/**
 * Radio de impacto de los monstruos. Algo más generoso que el cuerpo real
 * (0.55 m) porque el cliente apunta con la posición interpolada y los más
 * rápidos (fantasma 3.6 m/s) se desplazan entre muestra y muestra. El
 * cliente además manda `targetId` (el monstruo bajo la mira) para que un
 * objetivo claramente visible no se pierda por ese retraso.
 */
const MONSTER_RADIUS = 0.9;
const MONSTER_SEPARATION = 0.9;
/**
 * Cuerpo del jugador para el barrido de proyectiles enemigos. El servidor
 * solo tiene la posición de los pies; la cápsula cubre la altura del avatar
 * y un radio algo mayor que el cuerpo visual para que un impacto que se ve
 * encima no se pierda entre dos ticks.
 */
const PLAYER_BODY_RADIUS = 0.55;
const PLAYER_BODY_HEIGHT = 1.9;
/** Sin reportes recientes (jugador parado o desconectado) no se anticipa. */
const VELOCITY_STALE_MS = 350;

function round(value: number, decimals = 2): number {
	const factor = 10 ** decimals;
	return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function horizontalDistance(ax: number, az: number, bx: number, bz: number): number {
	return Math.hypot(ax - bx, az - bz);
}

/** Point-in-polygon (ray casting) en XZ. */
export function pointInArena(x: number, z: number): boolean {
	let inside = false;

	for (let i = 0, j = ARENA.length - 1; i < ARENA.length; j = i++) {
		const [xi, zi] = ARENA[i];
		const [xj, zj] = ARENA[j];
		const intersects = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;

		if (intersects) {
			inside = !inside;
		}
	}

	return inside;
}

type MonsterPosition = { x: number; y: number; z: number };

function insideXZ(
	area: { minX: number; maxX: number; minZ: number; maxZ: number },
	x: number,
	z: number,
	margin = 0
): boolean {
	return (
		x >= area.minX - margin &&
		x <= area.maxX + margin &&
		z >= area.minZ - margin &&
		z <= area.maxZ + margin
	);
}

/** Altura de la rampa en (x, z), o `null` si el punto no cae en ella. */
function rampHeightAt(climb: MonsterClimb, x: number, z: number): number | null {
	const { ramp } = climb;

	if (x < ramp.minX || x > ramp.maxX || z < ramp.zTop || z > ramp.zBottom) {
		return null;
	}

	const span = ramp.zBottom - ramp.zTop;
	const t = span <= 0 ? 0 : clamp((ramp.zBottom - z) / span, 0, 1);

	return ramp.yBottom + (ramp.yTop - ramp.yBottom) * t;
}

/**
 * Altura caminable en (x, z) para un monstruo que viene de `currentY`: la
 * superficie más alta a la que puede llegar sin subir más de un escalón.
 * Devuelve el suelo base si no hay rampa/plataforma alcanzable.
 */
export function monsterGroundHeight(x: number, z: number, currentY: number): number {
	let best = ARENA_FLOOR_Y;

	for (const climb of MONSTER_CLIMBS) {
		const rampY = rampHeightAt(climb, x, z);

		if (rampY !== null && rampY <= currentY + MONSTER_MAX_STEP && rampY > best) {
			best = rampY;
		}

		if (
			insideXZ(climb.top, x, z) &&
			climb.top.y <= currentY + MONSTER_MAX_STEP &&
			climb.top.y > best
		) {
			best = climb.top.y;
		}
	}

	return best;
}

/**
 * True si el punto cae dentro de un edificio bloqueante. La rampa de un
 * mirador y su plataforma (cuando el monstruo ya está a esa altura) son la
 * excepción: son la única forma de subir.
 */
function insideBuildingBlock(x: number, z: number, y: number = ARENA_FLOOR_Y): boolean {
	for (const climb of MONSTER_CLIMBS) {
		if (rampHeightAt(climb, x, z) !== null) {
			return false;
		}

		if (y >= climb.top.y - MONSTER_MAX_STEP && insideXZ(climb.top, x, z, 0.3)) {
			return false;
		}
	}

	for (const block of BUILDING_BLOCKS) {
		if (x >= block.minX && x <= block.maxX && z >= block.minZ && z <= block.maxZ) {
			return true;
		}
	}

	return false;
}

function tryMonsterStep(from: MonsterPosition, x: number, z: number): MonsterPosition | null {
	if (!pointInArena(x, z) || insideBuildingBlock(x, z, from.y)) {
		return null;
	}

	const y = monsterGroundHeight(x, z, from.y);

	if (y - from.y > MONSTER_MAX_STEP) {
		return null;
	}

	return { x, y, z };
}

/**
 * Movimiento deslizante en 2.5D: intenta el paso completo; si choca con un
 * edificio o con un escalón demasiado alto, prueba solo X y solo Z. La Y se
 * muestrea en cada paso para subir las rampas y caer de las plataformas.
 */
export function stepMonster(from: MonsterPosition, nextX: number, nextZ: number): MonsterPosition {
	const movedEnough = (position: MonsterPosition) =>
		Math.hypot(position.x - from.x, position.z - from.z) > 1e-4;

	const full = tryMonsterStep(from, nextX, nextZ);

	if (full && movedEnough(full)) {
		return full;
	}

	const onlyX = tryMonsterStep(from, nextX, from.z);

	if (onlyX && movedEnough(onlyX)) {
		return onlyX;
	}

	const onlyZ = tryMonsterStep(from, from.x, nextZ);

	if (onlyZ && movedEnough(onlyZ)) {
		return onlyZ;
	}

	// Último recurso: deslizar en perpendicular para rodear la esquina de una
	// torre cuando el objetivo queda justo detrás.
	const dx = nextX - from.x;
	const dz = nextZ - from.z;
	const length = Math.hypot(dx, dz);

	if (length > 1e-4) {
		const px = -dz / length;
		const pz = dx / length;
		const sideA = tryMonsterStep(from, from.x + px * length, from.z + pz * length);

		if (sideA) {
			return sideA;
		}

		const sideB = tryMonsterStep(from, from.x - px * length, from.z - pz * length);

		if (sideB) {
			return sideB;
		}
	}

	return from;
}

let idCounter = 0;

function nextId(prefix: string): string {
	idCounter = (idCounter + 1) % 0xffff;
	return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.floor(
		Math.random() * 0xffff
	).toString(36)}`;
}

type RoomPlayer = {
	id: string;
	name: string;
	health: number;
	downed: boolean;
	driving: boolean;
	weapon: Mg5WeaponId;
	magAmmo: number;
	/** Armas poseídas → balas en el cargador de cada una. */
	inventory: Map<Mg5WeaponId, number>;
	/** Reserva universal (las pistolas la ignoran). */
	reserveAmmo: number;
	grenades: number;
	kills: number;
	score: number;
	x: number;
	y: number;
	z: number;
	yaw: number;
	/** Velocidad reportada por el cliente (m/s), usada para anticipar tiros. */
	vx: number;
	vy: number;
	vz: number;
	lastPositionAt: number;
	lastShotAt: number;
	lastReloadAt: number;
	lastGrenadeAt: number;
	/** Último golpe directo recibido (para la ventana de gracia). */
	lastDamagedAt: number;
	/** Última vez que se emitió `player-hurt` (para no saturar con ticks). */
	lastHurtEventAt: number;
};

type RoomMonster = {
	id: string;
	kind: Mg5MonsterKind;
	health: number;
	maxHealth: number;
	x: number;
	y: number;
	z: number;
	yaw: number;
	status: 'spawn' | 'active' | 'dead';
	/** Momento en el que el monstruo pasa de `spawn` a `active`. */
	activeAt: number;
	lastAttackAt: number;
	lastRamAt: number;
	deadAt: number | null;
};

type RoomTarget = {
	id: string;
	x: number;
	y: number;
	z: number;
	/** Velocidad horizontal reportada; 0 para el coche. */
	vx: number;
	vz: number;
	isCar: boolean;
};

/** Devuelve el mirador cuyo piso superior está ocupando el objetivo. */
function targetClimb(target: { x: number; y: number; z: number }): MonsterClimb | null {
	for (const climb of MONSTER_CLIMBS) {
		if (target.y >= climb.top.y - 0.7 && insideXZ(climb.top, target.x, target.z, 0.8)) {
			return climb;
		}
	}

	return null;
}

/**
 * Si el objetivo está en lo alto de un mirador y el monstruo abajo, devuelve
 * el siguiente punto de la ruta: primero el pie de la rampa, luego el centro
 * de la rampa. Sin esto la IA iría en línea recta contra la pared de la torre
 * y nunca encontraría la escalera.
 */
export function climbWaypoint(
	monster: RoomMonster,
	target: { x: number; y: number; z: number }
): { x: number; z: number } | null {
	const climb = targetClimb(target);

	if (!climb) {
		return null;
	}

	const onTop = monster.y >= climb.top.y - 0.7 && insideXZ(climb.top, monster.x, monster.z, 0.6);

	if (onTop) {
		return null;
	}

	const centerX = (climb.ramp.minX + climb.ramp.maxX) / 2;
	const onRamp = insideXZ(
		{
			minX: climb.ramp.minX - 0.4,
			maxX: climb.ramp.maxX + 0.4,
			minZ: climb.ramp.zTop - 0.4,
			maxZ: climb.ramp.zBottom + 0.4
		},
		monster.x,
		monster.z
	);

	if (onRamp || monster.y > ARENA_FLOOR_Y + 0.8) {
		return { x: centerX, z: climb.ramp.zTop - 0.6 };
	}

	// Si viene por detrás de la torre (norte), primero rodea una esquina.
	// En línea recta contra la pared se quedaría oscilando sin avanzar.
	const side = monster.x >= centerX ? 1 : -1;
	const cornerX = side > 0 ? climb.top.maxX + 1.0 : climb.top.minX - 1.0;
	const cornerZ = climb.top.minZ - 1.0;
	const wrongSide = side > 0 ? monster.x < cornerX - 0.5 : monster.x > cornerX + 0.5;

	if (monster.z < climb.top.minZ - 0.2 && wrongSide) {
		return { x: cornerX, z: cornerZ };
	}

	const entryDist = Math.hypot(monster.x - climb.entry.x, monster.z - climb.entry.z);

	if (entryDist > 1.3) {
		return climb.entry;
	}

	return { x: centerX, z: climb.ramp.zBottom - 1.0 };
}

type RoomPool = {
	id: string;
	x: number;
	y: number;
	z: number;
	radius: number;
	expiresAt: number;
	nextTickAt: number;
};

type RoomDrop = {
	id: string;
	kind: 'shotgun' | 'smg' | 'rifle' | 'grenade' | 'ammo' | 'medkit';
	x: number;
	y: number;
	z: number;
	expiresAt: number;
};

type RoomProjectile = {
	id: string;
	kind: 'acid' | 'grenade' | 'rock';
	/** Daño directo al impactar (ácido/roca); las granadas usan falloff. */
	damage: number;
	/** Gravedad aplicada a la parábola (la roca es más pesada). */
	gravity: number;
	ownerId: string | null;
	x: number;
	y: number;
	z: number;
	vx: number;
	vy: number;
	vz: number;
	fuseAt: number;
	/** Estado de lanzamiento para integrar la parábola exactamente. */
	originX: number;
	originY: number;
	originZ: number;
	launchedAt: number;
	flightMs: number;
	/** Punto de caída (ácido: altura real del objetivo; granada: suelo). */
	targetX: number;
	targetY?: number;
	targetZ: number;
};

/**
 * Cono de fuego activo. Vive `DEMON_FIRE_DURATION_MS` y reparte daño por
 * ticks; se reorienta hacia el objetivo mientras el demonio lo mantiene.
 */
type RoomBreath = {
	id: string;
	monsterId: string;
	/** Objetivo al que sigue el chorro (se recalcula cada tick). */
	targetId: string;
	x: number;
	y: number;
	z: number;
	dx: number;
	dy: number;
	dz: number;
	expiresAt: number;
	nextTickAt: number;
	damagePerTick: number;
	/** Resto del daño total que se aplica en el primer tick (16 → 5+5+6). */
	firstTickBonus: number;
	ticksDone: number;
};

type RoomCar = Mg5CarState;

type SpawnQueueEntry = {
	kind: Mg5MonsterKind;
	/** Cuando se emite el aviso de portal. */
	telegraphAt: number;
	/** Cuando aparece el monstruo. */
	spawnAt: number;
	spawnId: string;
	portalId: string;
};

export type WavesDeps = {
	/** Asks the client to leave the waves room (match over). */
	moveToLobby: (playerId: string) => void;
};

export class Waves {
	private phase: Mg5Phase = 'idle';
	private endsAt: number | null = null;
	private intermissionEndsAt: number | null = null;
	private wave = 0;
	private waveName: string | null = null;
	private nextStateAt = 0;
	private stateDirty = false;
	private lastPositionsAt = 0;
	private lastTickAt = 0;
	/** Delta del último tick; el barrido de proyectiles lo necesita. */
	private tickDt = 0.1;

	private readonly players = new Map<string, RoomPlayer>();
	private readonly monsters = new Map<string, RoomMonster>();
	private pools: RoomPool[] = [];
	private drops: RoomDrop[] = [];
	private projectiles: RoomProjectile[] = [];
	private breaths: RoomBreath[] = [];
	private spawnQueue: SpawnQueueEntry[] = [];
	/** Últimos portales usados, para no repetir mientras haya alternativas. */
	private recentPortals: string[] = [];

	private car: RoomCar = Waves.freshCar();

	/**
	 * Diagnóstico temporal de disparos (se resume en los logs del room).
	 * Permite distinguir "los mensajes no llegan" de "el servidor los
	 * rechaza" sin depender de una sesión de navegador.
	 */
	private readonly shotStats = {
		received: 0,
		locked: 0,
		phase: 0,
		weapon: 0,
		rate: 0,
		origin: 0,
		ammo: 0,
		hits: 0,
		damage: 0,
		lastLogAt: 0
	};

	constructor(
		private readonly port: RoomPort,
		private readonly deps: WavesDeps
	) {}

	private static freshCar(): RoomCar {
		return {
			health: WAVES_CAR_MAX_HEALTH,
			maxHealth: WAVES_CAR_MAX_HEALTH,
			destroyed: false,
			driverId: null,
			x: WAVES_CAR.x,
			y: WAVES_CAR.y,
			z: WAVES_CAR.z,
			yaw: WAVES_CAR.yaw,
			qx: 0,
			qy: Math.sin(WAVES_CAR.yaw / 2),
			qz: 0,
			qw: Math.cos(WAVES_CAR.yaw / 2),
			vx: 0,
			vy: 0,
			vz: 0,
			speed: 0,
			steering: 0
		};
	}

	// ------------------------------------------------------------------
	// Port / messaging helpers
	// ------------------------------------------------------------------

	private publish(message: ServerMessage): void {
		this.port.broadcast(message);
	}

	private emitEvent(kind: Mg5EventKind, now: number, extra: Partial<Mg5Event> = {}): void {
		const event: Mg5Event = { kind, at: now, ...extra };
		this.publish({ type: 'mg5-event', event });
		this.stateDirty = true;
	}

	// ------------------------------------------------------------------
	// Enter / leave
	// ------------------------------------------------------------------

	onEnter(
		playerId: string,
		name: string
	): { ok: true } | { ok: false; code: string; message: string } {
		if (this.phase !== 'idle' && this.phase !== 'countdown') {
			return {
				ok: false,
				code: 'WAVES_IN_PROGRESS',
				message: 'The siege has already started'
			};
		}

		if (this.players.size >= WAVES_MAX_PLAYERS) {
			return {
				ok: false,
				code: 'WAVES_FULL',
				message: 'The farm is full (12 survivors)'
			};
		}

		const spawn = PLAYER_SPAWNS[this.players.size % PLAYER_SPAWNS.length];
		const starter = WEAPON_BY_ID.get(STARTER_WEAPON)!;

		this.players.set(playerId, {
			id: playerId,
			name: name.slice(0, 32) || 'Survivor',
			health: PLAYER_MAX_HEALTH,
			downed: false,
			driving: false,
			weapon: STARTER_WEAPON,
			magAmmo: starter.magSize,
			inventory: new Map([[STARTER_WEAPON, starter.magSize]]),
			reserveAmmo: STARTER_AMMO,
			grenades: STARTER_GRENADES,
			kills: 0,
			score: 0,
			x: spawn.x,
			y: spawn.y,
			z: spawn.z,
			yaw: Math.PI,
			vx: 0,
			vy: 0,
			vz: 0,
			lastPositionAt: 0,
			lastShotAt: 0,
			lastReloadAt: 0,
			lastGrenadeAt: 0,
			lastDamagedAt: 0,
			lastHurtEventAt: 0
		});

		if (this.phase === 'idle') {
			this.phase = 'countdown';
			this.endsAt = Date.now() + WAVES_COUNTDOWN_MS;
		} else if (
			this.phase === 'countdown' &&
			this.players.size >= WAVES_MAX_PLAYERS &&
			this.endsAt !== null &&
			this.endsAt - Date.now() > WAVES_COUNTDOWN_FULL_MS
		) {
			this.endsAt = Date.now() + WAVES_COUNTDOWN_FULL_MS;
			this.emitEvent('countdown-shortened', Date.now(), {});
		}

		this.stateDirty = true;
		this.emitEvent('player-joined', Date.now(), { playerId });
		return { ok: true };
	}

	onLeave(playerId: string): void {
		const player = this.players.get(playerId);

		// A driver leaving frees the car.
		if (this.car.driverId === playerId) {
			this.car.driverId = null;
			if (player) {
				player.driving = false;
			}
		}

		this.players.delete(playerId);

		if (this.players.size === 0) {
			this.resetMatch();
			return;
		}

		// If everybody left alive is downed, the siege is lost.
		if (this.phase === 'playing' && this.allDowned()) {
			this.finishMatch('lost', Date.now());
		}

		this.stateDirty = true;
		this.emitEvent('player-left', Date.now(), { playerId });
	}

	// ------------------------------------------------------------------
	// Player reports
	// ------------------------------------------------------------------

	onPosition(playerId: string, x: number, y: number, z: number, yaw: number, now: number): void {
		const player = this.players.get(playerId);

		if (!player) {
			return;
		}

		if (now - player.lastPositionAt < POSITION_MIN_INTERVAL_MS) {
			return;
		}

		// `x/z` se recortan al recinto por seguridad. Si un reporte llega
		// fuera, el jugador queda en el borde y sigue siendo un objetivo
		// válido: salir del mapa ya no concede inmunidad.
		const clamped = this.clampToArena(x, z);
		const dtSeconds = Math.max(0.001, (now - player.lastPositionAt) / 1000);
		const rawVx = (clamped.x - player.x) / dtSeconds;
		const rawVz = (clamped.z - player.z) / dtSeconds;
		const rawVy = (y - player.y) / dtSeconds;
		const hadSample = player.lastPositionAt !== 0;

		player.x = clamped.x;
		player.z = clamped.z;
		player.y = y;
		player.yaw = yaw;

		// La velocidad alimenta la anticipación de ácido y rocas. Se descarta
		// el primer reporte y cualquier salto imposible (teletransporte,
		// corrección de red): una velocidad absurda desviaría los tiros.
		const horizontalSpeed = Math.hypot(rawVx, rawVz);

		if (hadSample && horizontalSpeed <= PLAYER_SPEED_CAP * 1.6 && Math.abs(rawVy) <= 14) {
			player.vx = rawVx;
			player.vy = rawVy;
			player.vz = rawVz;
		} else {
			player.vx = 0;
			player.vy = 0;
			player.vz = 0;
		}

		player.lastPositionAt = now;
	}

	/**
	 * Sin reportes recientes la velocidad deja de ser fiable (cliente parado,
	 * desconectado o con jitter): se deja de anticipar el disparo.
	 */
	private expireStaleVelocity(now: number): void {
		for (const player of this.players.values()) {
			if (player.lastPositionAt === 0 || now - player.lastPositionAt > VELOCITY_STALE_MS) {
				player.vx = 0;
				player.vy = 0;
				player.vz = 0;
			}
		}
	}

	/**
	 * Barrido del proyectil entre dos muestras de la parábola. Si el segmento
	 * atraviesa la cápsula del jugador, el impacto se resuelve ahí aunque el
	 * punto de caída calculado esté más lejos: un poder que se ve encima del
	 * cuerpo no puede pasar de largo entre dos ticks (corriendo o saltando).
	 */
	private projectileHitPlayer(
		from: { x: number; y: number; z: number },
		to: { x: number; y: number; z: number },
		radius: number
	): RoomPlayer | null {
		const reach = PLAYER_BODY_RADIUS + radius;
		const dx = to.x - from.x;
		const dy = to.y - from.y;
		const dz = to.z - from.z;
		const steps = clamp(Math.ceil(Math.hypot(dx, dy, dz) / 0.2), 1, 60);

		for (const player of this.players.values()) {
			if (player.downed || player.driving) {
				continue;
			}

			const bottom = player.y - reach;
			const top = player.y + PLAYER_BODY_HEIGHT + reach;

			for (let step = 0; step <= steps; step += 1) {
				const t = step / steps;
				const y = from.y + dy * t;

				if (y < bottom || y > top) {
					continue;
				}

				const px = from.x + dx * t - player.x;
				const pz = from.z + dz * t - player.z;

				if (px * px + pz * pz <= reach * reach) {
					return player;
				}
			}
		}

		return null;
	}

	onShoot(
		playerId: string,
		weapon: Mg5WeaponId,
		origin: { x: number; y: number; z: number },
		dir: { x: number; y: number; z: number },
		targetId: string | undefined,
		now: number
	): void {
		this.shotStats.received += 1;
		this.logShotStats(now);

		const player = this.players.get(playerId);

		if (!player || this.phase !== 'playing' || player.downed || player.driving) {
			this.shotStats.phase += 1;
			return;
		}

		if (player.weapon !== weapon) {
			this.shotStats.weapon += 1;
			return;
		}

		const definition = WEAPON_BY_ID.get(weapon);

		if (!definition) {
			return;
		}

		const minInterval = 1000 / definition.rate;

		if (now - player.lastShotAt < minInterval * 0.8) {
			this.shotStats.rate += 1;
			return;
		}

		// The muzzle must be close to the reported position.
		if (
			horizontalDistance(player.x, player.z, origin.x, origin.z) > 2 ||
			Math.abs(player.y - origin.y) > 2.5
		) {
			this.shotStats.origin += 1;
			return;
		}

		if (player.magAmmo <= 0) {
			this.shotStats.ammo += 1;
			this.stateDirty = true;
			return;
		}

		player.magAmmo -= 1;
		player.inventory.set(player.weapon, player.magAmmo);
		player.lastShotAt = now;

		// Remote clients draw this shot (tracer + muzzle flash). It is only
		// emitted for accepted shots, so the visual matches server authority.
		this.emitEvent('shot-fired', now, {
			playerId,
			weapon,
			x: origin.x,
			y: origin.y,
			z: origin.z,
			dx: dir.x,
			dy: dir.y,
			dz: dir.z
		});

		// The client tells us which monster its crosshair was over. Trust it
		// only when the target is alive, ahead and roughly inside the cone the
		// aim assist used, but tolerate more than the raw ray: the client
		// renders monsters ~200 ms behind the authoritative position, so a
		// clearly visible target could otherwise be dropped by the lag.
		let locked: RoomMonster | null = null;

		if (targetId) {
			const monster = this.monsters.get(targetId);

			if (monster && monster.status === 'active') {
				const toX = monster.x - origin.x;
				const toZ = monster.z - origin.z;
				const distance = Math.hypot(toX, toZ);
				const flat = Math.hypot(dir.x, dir.z);
				const lateral =
					flat > 1e-4 ? Math.abs(toX * dir.z - toZ * dir.x) / flat : Number.POSITIVE_INFINITY;

				if (distance <= definition.range + 2 && toX * dir.x + toZ * dir.z > 0 && lateral <= 3) {
					locked = monster;
					this.shotStats.locked += 1;
				}
			}
		}

		const pellets = definition.pellets ?? 1;

		for (let pellet = 0; pellet < pellets; pellet += 1) {
			const spread = definition.spread !== undefined ? definition.spread : 0;
			const angle = spread === 0 ? 0 : (Math.random() - 0.5) * 2 * spread;
			const cos = Math.cos(angle);
			const sin = Math.sin(angle);
			const dirX = dir.x * cos - dir.z * sin;
			const dirZ = dir.x * sin + dir.z * cos;

			this.hitscan(
				player,
				origin,
				{ x: dirX, y: dir.y, z: dirZ },
				definition.range,
				definition.damage,
				now,
				locked
			);
		}

		this.stateDirty = true;
	}

	onThrow(
		playerId: string,
		origin: { x: number; y: number; z: number },
		dir: { x: number; y: number; z: number },
		tx: number | undefined,
		tz: number | undefined,
		now: number
	): void {
		const player = this.players.get(playerId);

		if (!player || this.phase !== 'playing' || player.downed || player.driving) {
			return;
		}

		if (player.grenades <= 0) {
			return;
		}

		if (now - player.lastGrenadeAt < 500) {
			return;
		}

		player.grenades -= 1;
		player.lastGrenadeAt = now;

		// The client sends the point of the floor under the crosshair. Solve
		// the parabola so the grenade lands there instead of always flying a
		// fixed 21 m forward.
		const fallback = {
			x: origin.x + dir.x * 18,
			z: origin.z + dir.z * 18
		};
		const target = this.clampToArena(
			tx !== undefined ? tx : fallback.x,
			tz !== undefined ? tz : fallback.z
		);
		const distance = horizontalDistance(origin.x, origin.z, target.x, target.z);
		const flight = clamp(0.55 + distance / 22, 0.55, 1.6);

		const vx = (target.x - origin.x) / flight;
		const vz = (target.z - origin.z) / flight;
		// y = y0 + vy·t − g·t²/2 must reach the floor at `flight`.
		const vy = (ARENA_FLOOR_Y - origin.y) / flight + (ACID_GRAVITY * flight) / 2;

		this.projectiles.push({
			id: nextId('grenade'),
			kind: 'grenade',
			damage: GRENADE_DAMAGE,
			gravity: ACID_GRAVITY,
			ownerId: playerId,
			x: origin.x,
			y: origin.y,
			z: origin.z,
			vx,
			vy,
			vz,
			originX: origin.x,
			originY: origin.y,
			originZ: origin.z,
			launchedAt: now,
			flightMs: flight * 1000,
			targetX: target.x,
			targetZ: target.z,
			// Lands first, then a short fuse: the ground contact already
			// detonates it, this is only a safety net.
			fuseAt: now + flight * 1000 + 600
		});

		this.emitEvent('grenade-thrown', now, { playerId });
	}

	onReload(playerId: string, now: number): void {
		const player = this.players.get(playerId);

		if (!player) {
			return;
		}

		if (now - player.lastReloadAt < 500) {
			return;
		}

		const definition = WEAPON_BY_ID.get(player.weapon);

		if (!definition) {
			return;
		}

		const missing = definition.magSize - player.magAmmo;

		if (missing <= 0) {
			return;
		}

		if (player.weapon === 'pistol') {
			// Reserva infinita: la pistola siempre recarga.
			player.magAmmo = definition.magSize;
			player.inventory.set(player.weapon, player.magAmmo);
			player.lastReloadAt = now;
			this.stateDirty = true;
			return;
		}

		const take = Math.min(missing, player.reserveAmmo);

		if (take <= 0) {
			return;
		}

		player.magAmmo += take;
		player.inventory.set(player.weapon, player.magAmmo);
		player.reserveAmmo -= take;
		player.lastReloadAt = now;
		this.stateDirty = true;
	}

	/** Equip an owned weapon from its hotbar slot (1–4). */
	onEquip(playerId: string, slot: number): void {
		const player = this.players.get(playerId);

		if (!player || player.downed || player.driving) {
			return;
		}

		if (this.phase === 'won' || this.phase === 'lost') {
			return;
		}

		const weapon = WEAPON_BY_SLOT[slot];

		if (!weapon || !player.inventory.has(weapon)) {
			return;
		}

		if (player.weapon === weapon) {
			return;
		}

		player.weapon = weapon;
		player.magAmmo = player.inventory.get(weapon) ?? 0;
		this.stateDirty = true;
	}

	onCarEnter(playerId: string, now: number): void {
		const player = this.players.get(playerId);

		if (!player || player.downed) {
			return;
		}

		if (this.car.destroyed || this.car.driverId !== null) {
			return;
		}

		if (horizontalDistance(player.x, player.z, this.car.x, this.car.z) > WAVES_CAR_ENTER_RADIUS) {
			return;
		}

		this.car.driverId = playerId;
		player.driving = true;
		this.stateDirty = true;
		void now;
	}

	onCarExit(playerId: string): void {
		const player = this.players.get(playerId);

		if (this.car.driverId !== playerId) {
			return;
		}

		this.car.driverId = null;

		if (player) {
			player.driving = false;
			// Aparece junto al coche, fuera de él.
			player.x = this.car.x + 2.0;
			player.z = this.car.z;
			player.y = ARENA_FLOOR_Y;
		}

		this.stateDirty = true;
	}

	onCarState(
		playerId: string,
		report: {
			x: number;
			y: number;
			z: number;
			qx: number;
			qy: number;
			qz: number;
			qw: number;
			vx: number;
			vy: number;
			vz: number;
			speed: number;
			steering: number;
		}
	): void {
		if (this.car.driverId !== playerId || this.car.destroyed) {
			return;
		}

		const clamped = this.clampToArena(report.x, report.z);

		this.car.x = clamped.x;
		this.car.y = report.y;
		this.car.z = clamped.z;
		this.car.qx = report.qx;
		this.car.qy = report.qy;
		this.car.qz = report.qz;
		this.car.qw = report.qw;
		this.car.vx = report.vx;
		this.car.vy = report.vy;
		this.car.vz = report.vz;
		this.car.speed = clamp(report.speed, -60, 60);
		this.car.steering = report.steering;
		this.car.yaw = Math.atan2(
			2 * (this.car.qw * this.car.qy + this.car.qx * this.car.qz),
			1 - 2 * (this.car.qy * this.car.qy + this.car.qz * this.car.qz)
		);
	}

	// ------------------------------------------------------------------
	// Tick
	// ------------------------------------------------------------------

	tick(now: number): void {
		const dt = this.lastTickAt === 0 ? 0.1 : clamp((now - this.lastTickAt) / 1000, 0.01, 0.25);
		this.lastTickAt = now;
		this.tickDt = dt;
		this.expireStaleVelocity(now);

		try {
			switch (this.phase) {
				case 'idle':
					break;
				case 'countdown':
					if (this.endsAt !== null && now >= this.endsAt) {
						this.startWave(1, now);
					}
					break;
				case 'playing':
					this.spawnDueMonsters(now);
					this.updateMonsters(now, dt);
					this.updateProjectiles(now);
					this.updateBreaths(now);
					this.updatePools(now);
					this.updateDrops(now);
					this.despawnDeadMonsters(now);
					this.applyRamDamage(now);
					this.checkWaveCleared(now);
					this.checkDefeat(now);
					break;
				case 'intermission':
					this.updateProjectiles(now);
					this.updateDrops(now);
					if (this.intermissionEndsAt !== null && now >= this.intermissionEndsAt) {
						this.startWave(this.wave + 1, now);
					}
					break;
				case 'won':
					if (this.endsAt !== null && now >= this.endsAt) {
						this.finishMatch('won', now);
					}
					break;
				case 'lost':
					if (this.endsAt !== null && now >= this.endsAt) {
						this.finishMatch('lost', now);
					}
					break;
			}

			this.broadcastPositions(now);

			if (this.stateDirty || now >= this.nextStateAt) {
				this.broadcastState(now);
			}
		} catch (error) {
			console.error('[waves] tick failed — resetting room', error);
			this.resetMatch();
		}
	}

	private startWave(wave: number, now: number): void {
		const definition = WAVE_DEFINITIONS[wave - 1];

		if (!definition) {
			this.finishMatch('won', now);
			return;
		}

		this.phase = 'playing';
		this.wave = wave;
		this.waveName = definition.name;
		this.endsAt = null;
		this.intermissionEndsAt = null;
		this.pools = [];
		this.breaths = [];
		this.projectiles = this.projectiles.filter((p) => p.kind === 'grenade');

		// Cola de spawn: expandir la composición y barajar.
		const kinds: Mg5MonsterKind[] = [];

		for (const [kind, count] of Object.entries(definition.monsters)) {
			for (let i = 0; i < (count ?? 0); i += 1) {
				kinds.push(kind as Mg5MonsterKind);
			}
		}

		for (let i = kinds.length - 1; i > 0; i -= 1) {
			const j = Math.floor(Math.random() * (i + 1));
			[kinds[i], kinds[j]] = [kinds[j], kinds[i]];
		}

		this.spawnQueue = kinds.map((kind, index) => {
			const spawnAt = now + WAVES_SPAWN_TELEGRAPH_MS + index * WAVES_SPAWN_STAGGER_MS;
			return {
				kind,
				telegraphAt: spawnAt - WAVES_SPAWN_TELEGRAPH_MS,
				spawnAt,
				spawnId: nextId('monster'),
				// Se elige al telegrafiar, con las posiciones actuales de los
				// jugadores, no al empezar la oleada.
				portalId: ''
			};
		});

		this.recentPortals = [];

		this.stateDirty = true;
		this.emitEvent('wave-started', now, { wave });
	}

	private spawnDueMonsters(now: number): void {
		// Telegrafía 1 s antes de aparecer.
		for (const entry of this.spawnQueue) {
			if (entry.telegraphAt <= now && !('telegraphed' in entry)) {
				(entry as SpawnQueueEntry & { telegraphed: boolean }).telegraphed = true;

				if (!entry.portalId) {
					entry.portalId = this.pickSpawnPortal(new Set(this.recentPortals));
					this.rememberPortal(entry.portalId);
				}

				const portal = this.portalById(entry.portalId);

				this.emitEvent('monster-spawned', now, {
					monsterId: entry.spawnId,
					monsterKind: entry.kind,
					x: portal.x,
					z: portal.z,
					wave: this.wave
				});
			}
		}

		const due = this.spawnQueue.filter((entry) => entry.spawnAt <= now);
		const capacity = WAVES_MAX_CONCURRENT - this.aliveMonsters();

		for (const entry of due.slice(0, Math.max(0, capacity))) {
			const definition = MONSTER_BY_KIND.get(entry.kind)!;

			if (!entry.portalId) {
				entry.portalId = this.pickSpawnPortal(new Set(this.recentPortals));
				this.rememberPortal(entry.portalId);
			}

			const portal = this.portalById(entry.portalId);

			this.monsters.set(entry.spawnId, {
				id: entry.spawnId,
				kind: entry.kind,
				health: definition.maxHealth,
				maxHealth: definition.maxHealth,
				x: portal.x + (Math.random() - 0.5) * 1.5,
				y: ARENA_FLOOR_Y,
				z: portal.z + (Math.random() - 0.5) * 1.5,
				yaw: Math.random() * Math.PI * 2,
				status: 'spawn',
				activeAt: now + WAVES_SPAWN_ACTIVATE_MS,
				lastAttackAt: 0,
				lastRamAt: 0,
				deadAt: null
			});

			this.spawnQueue = this.spawnQueue.filter((candidate) => candidate !== entry);
		}

		// Sin hueco: retrasa los que no cupieron.
		if (due.length > 0 && capacity <= 0) {
			for (const entry of due) {
				entry.spawnAt = now + 500;
				entry.telegraphAt = entry.spawnAt - WAVES_SPAWN_TELEGRAPH_MS;
			}
		}
	}

	private portalById(id: string): { x: number; z: number } {
		return MONSTER_SPAWNS.find((portal) => portal.id === id) ?? MONSTER_SPAWNS[0];
	}

	/**
	 * Elige un portal lejos de los jugadores vivos. Si ninguno supera la
	 * distancia segura, usa el más lejano. `excluded` evita repetir portal
	 * dentro de la misma oleada.
	 */
	private pickSpawnPortal(excluded: ReadonlySet<string> = new Set()): string {
		const targets = [...this.players.values()].filter((player) => !player.downed);
		const reference =
			targets.length > 0 ? targets : [{ x: PLAYER_SPAWNS[0].x, z: PLAYER_SPAWNS[0].z }];

		const scored = MONSTER_SPAWNS.map((portal) => {
			let nearest = Number.POSITIVE_INFINITY;

			for (const target of reference) {
				nearest = Math.min(nearest, horizontalDistance(portal.x, portal.z, target.x, target.z));
			}

			return { portal, distance: nearest };
		});

		const safeAvailable = scored.filter(
			(entry) => entry.distance >= WAVES_SPAWN_SAFE_DISTANCE && !excluded.has(entry.portal.id)
		);
		const safe = scored.filter((entry) => entry.distance >= WAVES_SPAWN_SAFE_DISTANCE);
		const available = scored.filter((entry) => !excluded.has(entry.portal.id));

		// Nunca se elige un portal pegado a los jugadores: si todos los
		// seguros ya se usaron, se repite uno seguro antes que usar uno cercano.
		const pool =
			safeAvailable.length > 0
				? safeAvailable
				: safe.length > 0
					? safe
					: available.length > 0
						? available
						: scored;

		pool.sort((a, b) => b.distance - a.distance);

		// Entre los portales más lejanos, al azar para que no sea siempre el mismo.
		const top = pool.slice(0, Math.max(1, Math.ceil(pool.length / 2)));

		return top[Math.floor(Math.random() * top.length)].portal.id;
	}

	private rememberPortal(id: string): void {
		this.recentPortals.push(id);

		// Deja libre siempre al menos un portal para poder variar.
		while (this.recentPortals.length > MONSTER_SPAWNS.length - 1) {
			this.recentPortals.shift();
		}
	}

	private aliveMonsters(): number {
		let count = 0;

		for (const monster of this.monsters.values()) {
			if (monster.status !== 'dead') {
				count += 1;
			}
		}

		return count;
	}

	private updateMonsters(now: number, dt: number): void {
		const targets = this.collectTargets();

		for (const monster of this.monsters.values()) {
			if (monster.status === 'dead') {
				continue;
			}

			if (monster.status === 'spawn') {
				if (now < monster.activeAt) {
					continue;
				}

				monster.status = 'active';
				this.stateDirty = true;
			}

			const definition = MONSTER_BY_KIND.get(monster.kind)!;
			const target = this.pickTarget(monster, targets);

			if (!target) {
				continue;
			}

			const isAcid = definition.attack === 'acid';
			const isFire = definition.attack === 'fire';
			const isRock = definition.attack === 'rock';
			const isRanged = isAcid || isFire || isRock;
			// Las melés pueden subir la rampa de un mirador; las de ácido, el
			// aliento del demonio y las rocas se quedan a distancia. La roca
			// apunta a la altura real del objetivo, así que también alcanza la
			// plataforma de un mirador.
			const route = isRanged ? null : climbWaypoint(monster, target);
			const aimX = route ? route.x : target.x;
			const aimZ = route ? route.z : target.z;
			const dx = aimX - monster.x;
			const dz = aimZ - monster.z;
			const dist = Math.hypot(dx, dz);

			monster.yaw = Math.atan2(dx, dz);

			const targetDist = horizontalDistance(monster.x, monster.z, target.x, target.z);
			const verticalOk = target.isCar || Math.abs(target.y - monster.y) <= MELEE_VERTICAL_REACH;
			const fireVerticalOk =
				target.isCar || Math.abs(target.y - monster.y) <= DEMON_FIRE_VERTICAL_REACH;
			const rockVerticalOk =
				target.isCar || Math.abs(target.y - monster.y) <= GOLEM_ROCK_VERTICAL_REACH;
			const canHit = isAcid || (isFire ? fireVerticalOk : isRock ? rockVerticalOk : verticalOk);
			// El demonio respira a media distancia (≈6 m) para que el cono
			// llegue holgado sin pegarse al jugador. El Golem lanza desde
			// media distancia para que la roca se pueda ver venir y esquivar.
			const preferred = isAcid
				? definition.range * 0.72
				: isFire
					? definition.range * 0.7
					: isRock
						? definition.range * 0.62
						: 0;
			const tooClose =
				isRanged && targetDist < definition.range * (isFire ? 0.32 : isRock ? 0.35 : 0.45);
			const inRange = targetDist <= definition.range && canHit;

			if (!inRange || tooClose) {
				const direction = tooClose ? -1 : 1;
				const length = dist || 1;
				const step = definition.speed * dt * direction;
				const moved = stepMonster(
					monster,
					monster.x + (dx / length) * step,
					monster.z + (dz / length) * step
				);
				monster.x = moved.x;
				monster.y = moved.y;
				monster.z = moved.z;
			} else if (isRanged && targetDist > preferred + 2) {
				// Mantiene la distancia; no hace falta acercarse más.
				const length = dist || 1;
				const step = definition.speed * dt;
				const moved = stepMonster(
					monster,
					monster.x + (dx / length) * step,
					monster.z + (dz / length) * step
				);
				monster.x = moved.x;
				monster.y = moved.y;
				monster.z = moved.z;
			}

			this.separateMonster(monster, dt);

			if (inRange && now - monster.lastAttackAt >= definition.cooldownMs) {
				monster.lastAttackAt = now;

				if (isAcid) {
					this.throwAcid(monster, target, now);
				} else if (isFire) {
					this.startFireBreath(monster, target, definition.damage, now);
				} else if (isRock) {
					this.throwRock(monster, target, now);
				} else {
					this.meleeAttack(monster, target, definition.damage, now);
				}
			}
		}
	}

	private collectTargets(): RoomTarget[] {
		const targets: RoomTarget[] = [];

		for (const player of this.players.values()) {
			if (player.downed) {
				continue;
			}

			if (player.driving) {
				targets.push({
					id: player.id,
					x: this.car.x,
					y: ARENA_FLOOR_Y,
					z: this.car.z,
					vx: 0,
					vz: 0,
					isCar: true
				});
			} else {
				targets.push({
					id: player.id,
					x: player.x,
					y: player.y,
					z: player.z,
					vx: player.vx,
					vz: player.vz,
					isCar: false
				});
			}
		}

		return targets;
	}

	private pickTarget(monster: RoomMonster, targets: RoomTarget[]): RoomTarget | null {
		let best: RoomTarget | null = null;
		let bestDist = Infinity;

		for (const target of targets) {
			const dist = horizontalDistance(monster.x, monster.z, target.x, target.z);

			if (dist < bestDist) {
				bestDist = dist;
				best = target;
			}
		}

		return best;
	}

	private separateMonster(monster: RoomMonster, dt: number): void {
		for (const other of this.monsters.values()) {
			if (other === monster || other.status !== 'active') {
				continue;
			}

			// Monstruos en alturas distintas (rampa vs suelo) no se empujan.
			if (Math.abs(monster.y - other.y) > 1.2) {
				continue;
			}

			const dx = monster.x - other.x;
			const dz = monster.z - other.z;
			const dist = Math.hypot(dx, dz);

			if (dist > 0 && dist < MONSTER_SEPARATION) {
				const push = ((MONSTER_SEPARATION - dist) / MONSTER_SEPARATION) * 1.6 * dt;
				const moved = stepMonster(
					monster,
					monster.x + (dx / dist) * push,
					monster.z + (dz / dist) * push
				);
				monster.x = moved.x;
				monster.y = moved.y;
				monster.z = moved.z;
			}
		}
	}

	private meleeAttack(monster: RoomMonster, target: RoomTarget, damage: number, now: number): void {
		this.emitEvent('monster-attack', now, {
			monsterId: monster.id,
			monsterKind: monster.kind,
			playerId: target.id
		});

		if (target.isCar) {
			this.damageCar(damage, now);
			return;
		}

		const player = this.players.get(target.id);

		if (player) {
			this.damagePlayer(player, damage, 'melee', now);
		}
	}

	private throwAcid(monster: RoomMonster, target: RoomTarget, now: number): void {
		const definition = MONSTER_BY_KIND.get(monster.kind)!;
		const origin = { x: monster.x, y: monster.y + 1.6, z: monster.z };
		// El jugador puede estar subido a un mirador o a mitad de la escalera:
		// el proyectil debe resolver la parábola contra su altura real, no
		// contra el suelo, o el ácido pasa por debajo y nunca conecta.
		const targetY = target.isCar
			? ARENA_FLOOR_Y
			: Math.max(ARENA_FLOOR_Y, Math.min(target.y, ARENA_FLOOR_Y + 6));
		// Anticipa el desplazamiento reportado: correr en línea recta ya no
		// deja al jugador fuera del charco. El primer cálculo de vuelo usa la
		// distancia actual y luego se recalcula con el punto anticipado.
		const leadFlight = clamp(
			horizontalDistance(monster.x, monster.z, target.x, target.z) / 14,
			0.6,
			1.4
		);
		const aimX = target.x + target.vx * leadFlight * ACID_TARGET_LEAD;
		const aimZ = target.z + target.vz * leadFlight * ACID_TARGET_LEAD;
		const flight = clamp(horizontalDistance(monster.x, monster.z, aimX, aimZ) / 14, 0.6, 1.4);

		const vx = (aimX - origin.x) / flight;
		const vz = (aimZ - origin.z) / flight;
		// Resuelve vy para que caiga en el objetivo: y = y0 + vy t - g t² / 2
		const vy = (targetY - origin.y) / flight + (ACID_GRAVITY * flight) / 2;

		this.projectiles.push({
			id: nextId('acid'),
			kind: 'acid',
			damage: definition.damage,
			gravity: ACID_GRAVITY,
			ownerId: null,
			x: origin.x,
			y: origin.y,
			z: origin.z,
			vx,
			vy,
			vz,
			originX: origin.x,
			originY: origin.y,
			originZ: origin.z,
			launchedAt: now,
			flightMs: flight * 1000,
			targetX: aimX,
			targetZ: aimZ,
			fuseAt: now + flight * 1000 + 250,
			targetY
		});

		this.emitEvent('acid-thrown', now, {
			monsterId: monster.id,
			monsterKind: monster.kind
		});
	}

	/**
	 * Roca de lava del Golem. Se lanza en arco desde la mano hacia la posición
	 * anticipada del objetivo: correr en línea recta ya no esquiva el impacto,
	 * pero cambiar de dirección después del lanzamiento sí. El impacto lo
	 * resuelve `rockImpact`, que además emite `rock-hit` para el empuje.
	 */
	private throwRock(monster: RoomMonster, target: RoomTarget, now: number): void {
		const definition = MONSTER_BY_KIND.get(monster.kind)!;
		const origin = {
			x: monster.x + Math.sin(monster.yaw) * 0.55,
			y: monster.y + 2.05,
			z: monster.z + Math.cos(monster.yaw) * 0.55
		};
		const targetY = target.isCar
			? ARENA_FLOOR_Y + 0.8
			: Math.max(ARENA_FLOOR_Y, Math.min(target.y + 0.9, ARENA_FLOOR_Y + 6));
		const leadFlight = clamp(
			horizontalDistance(monster.x, monster.z, target.x, target.z) / GOLEM_ROCK_SPEED,
			GOLEM_ROCK_MIN_FLIGHT,
			GOLEM_ROCK_MAX_FLIGHT
		);
		const aimX = target.x + target.vx * leadFlight * GOLEM_ROCK_TARGET_LEAD;
		const aimZ = target.z + target.vz * leadFlight * GOLEM_ROCK_TARGET_LEAD;
		const distance = horizontalDistance(monster.x, monster.z, aimX, aimZ);
		const flight = clamp(distance / GOLEM_ROCK_SPEED, GOLEM_ROCK_MIN_FLIGHT, GOLEM_ROCK_MAX_FLIGHT);

		const vx = (aimX - origin.x) / flight;
		const vz = (aimZ - origin.z) / flight;
		const vy = (targetY - origin.y) / flight + (GOLEM_ROCK_GRAVITY * flight) / 2;

		this.projectiles.push({
			id: nextId('rock'),
			kind: 'rock',
			damage: definition.damage,
			gravity: GOLEM_ROCK_GRAVITY,
			ownerId: null,
			x: origin.x,
			y: origin.y,
			z: origin.z,
			vx,
			vy,
			vz,
			originX: origin.x,
			originY: origin.y,
			originZ: origin.z,
			launchedAt: now,
			flightMs: flight * 1000,
			targetX: aimX,
			targetY,
			targetZ: aimZ,
			fuseAt: now + flight * 1000 + 250
		});

		this.emitEvent('rock-thrown', now, {
			monsterId: monster.id,
			monsterKind: monster.kind
		});
	}

	/**
	 * Boca del demonio: un poco por delante del centro del cuerpo y a la
	 * altura de la cabeza, para que el cono no salga de dentro del modelo.
	 */
	private fireMouth(monster: RoomMonster): { x: number; y: number; z: number } {
		return {
			x: monster.x + Math.sin(monster.yaw) * 0.45,
			y: monster.y + DEMON_FIRE_MOUTH_HEIGHT,
			z: monster.z + Math.cos(monster.yaw) * 0.45
		};
	}

	private aimBreath(breath: RoomBreath, monster: RoomMonster, target: RoomTarget): void {
		const mouth = this.fireMouth(monster);
		const aimY = target.isCar ? ARENA_FLOOR_Y + 0.9 : target.y + 1.0;
		let dx = target.x - mouth.x;
		let dy = aimY - mouth.y;
		let dz = target.z - mouth.z;
		const length = Math.hypot(dx, dy, dz) || 1;

		breath.x = mouth.x;
		breath.y = mouth.y;
		breath.z = mouth.z;
		breath.dx = dx / length;
		breath.dy = dy / length;
		breath.dz = dz / length;
	}

	private startFireBreath(
		monster: RoomMonster,
		target: RoomTarget,
		damage: number,
		now: number
	): void {
		const ticks = Math.max(1, Math.round(DEMON_FIRE_DURATION_MS / DEMON_FIRE_TICK_MS));
		const perTick = Math.floor(damage / ticks);
		const breath: RoomBreath = {
			id: nextId('fire'),
			monsterId: monster.id,
			targetId: target.id,
			x: monster.x,
			y: monster.y + DEMON_FIRE_MOUTH_HEIGHT,
			z: monster.z,
			dx: 0,
			dy: 0,
			dz: 1,
			expiresAt: now + DEMON_FIRE_DURATION_MS,
			nextTickAt: now + 120,
			damagePerTick: Math.max(1, perTick),
			firstTickBonus: Math.max(0, damage - Math.max(1, perTick) * ticks),
			ticksDone: 0
		};

		this.aimBreath(breath, monster, target);
		this.breaths.push(breath);

		this.stateDirty = true;
		this.emitEvent('fire-breath', now, {
			monsterId: monster.id,
			monsterKind: monster.kind,
			playerId: target.isCar ? undefined : target.id,
			x: round(breath.x),
			y: round(breath.y),
			z: round(breath.z),
			dx: round(breath.dx, 3),
			dy: round(breath.dy, 3),
			dz: round(breath.dz, 3)
		});
	}

	private breathTarget(breath: RoomBreath): RoomTarget | null {
		const player = this.players.get(breath.targetId);

		if (!player || player.downed) {
			return null;
		}

		if (player.driving) {
			return {
				id: player.id,
				x: this.car.x,
				y: ARENA_FLOOR_Y,
				z: this.car.z,
				vx: 0,
				vz: 0,
				isCar: true
			};
		}

		return {
			id: player.id,
			x: player.x,
			y: player.y,
			z: player.z,
			vx: player.vx,
			vz: player.vz,
			isCar: false
		};
	}

	/** Punto dentro del cono, con tolerancia por el radio del cuerpo. */
	private insideFireCone(
		breath: RoomBreath,
		x: number,
		y: number,
		z: number,
		radius: number
	): boolean {
		const dx = x - breath.x;
		const dy = y - breath.y;
		const dz = z - breath.z;
		const distance = Math.hypot(dx, dy, dz);

		if (distance > DEMON_FIRE_RANGE + radius) {
			return false;
		}

		const length = distance || 1;
		const dot = (dx * breath.dx + dy * breath.dy + dz * breath.dz) / length;
		const angle = Math.acos(clamp(dot, -1, 1));
		// A 1 m el cono es estrecho; sumamos el ángulo que ocupa el cuerpo para
		// que un impacto visible no se pierda por un par de centímetros.
		const tolerance = Math.atan2(radius, Math.max(distance, 0.55));

		return angle <= DEMON_FIRE_HALF_ANGLE + tolerance;
	}

	private updateBreaths(now: number): void {
		const remaining: RoomBreath[] = [];

		for (const breath of this.breaths) {
			const monster = this.monsters.get(breath.monsterId);

			if (!monster || monster.status === 'dead' || now >= breath.expiresAt) {
				this.stateDirty = true;
				continue;
			}

			const target = this.breathTarget(breath);

			if (target) {
				this.aimBreath(breath, monster, target);
			}

			if (now >= breath.nextTickAt) {
				breath.nextTickAt += DEMON_FIRE_TICK_MS;
				this.applyFireDamage(breath, monster, now);
			}

			remaining.push(breath);
		}

		if (remaining.length !== this.breaths.length) {
			this.stateDirty = true;
		}

		this.breaths = remaining;
	}

	private applyFireDamage(breath: RoomBreath, monster: RoomMonster, now: number): void {
		// El daño total se reparte en ticks exactos; el primer tick absorbe el
		// resto (16 → 6+5+5) para que el total no se quede corto por redondeo.
		const amount = breath.damagePerTick + (breath.ticksDone === 0 ? breath.firstTickBonus : 0);
		breath.ticksDone += 1;

		for (const player of this.players.values()) {
			if (player.downed || player.driving) {
				continue;
			}

			// El fuego sube por el cono: no atraviesa el suelo de un mirador.
			if (Math.abs(player.y - monster.y) > DEMON_FIRE_VERTICAL_REACH) {
				continue;
			}

			if (this.insideFireCone(breath, player.x, player.y + 1.0, player.z, 0.55)) {
				this.damagePlayer(player, amount, 'fire', now);
			}
		}

		if (
			!this.car.destroyed &&
			this.insideFireCone(breath, this.car.x, this.car.y + 0.9, this.car.z, 1.1)
		) {
			this.damageCar(amount, now);
		}
	}

	private updateProjectiles(now: number): void {
		const remaining: RoomProjectile[] = [];

		for (const projectile of this.projectiles) {
			// Parábola exacta desde el lanzamiento. Antes se integraba con
			// Euler (`vy -= g·dt` y luego `y += vy·dt`), lo que hacía que el
			// proyectil cayera ~0.3 m antes que la solución analítica: contra
			// un jugador en una escalera o en la plataforma de un mirador se
			// quedaba corto y el ácido nunca le alcanzaba. Ahora la posición
			// se evalúa con el tiempo real de vuelo y, al cumplirse `flight`,
			// impacta exactamente en el punto apuntado.
			const elapsed = Math.max(0, (now - projectile.launchedAt) / 1000);
			const flight = projectile.flightMs / 1000;
			const gravity = projectile.gravity ?? ACID_GRAVITY;

			if (projectile.kind === 'acid' || projectile.kind === 'rock') {
				const previousElapsed = Math.max(0, elapsed - this.tickDt);
				const previous = {
					x: projectile.originX + projectile.vx * previousElapsed,
					y:
						projectile.originY +
						projectile.vy * previousElapsed -
						0.5 * gravity * previousElapsed * previousElapsed,
					z: projectile.originZ + projectile.vz * previousElapsed
				};

				if (elapsed >= flight) {
					projectile.x = projectile.targetX;
					projectile.z = projectile.targetZ;
					projectile.y = projectile.targetY ?? ARENA_FLOOR_Y;

					if (projectile.kind === 'acid') {
						this.acidImpact(projectile, now, projectile.y);
					} else {
						this.rockImpact(projectile, now);
					}

					continue;
				}

				projectile.x = projectile.originX + projectile.vx * elapsed;
				projectile.y =
					projectile.originY + projectile.vy * elapsed - 0.5 * gravity * elapsed * elapsed;
				projectile.z = projectile.originZ + projectile.vz * elapsed;

				// Si el cuerpo del jugador quedó dentro del tramo recorrido,
				// el proyectil explota ahí aunque el punto de caída esté lejos.
				const hit = this.projectileHitPlayer(
					previous,
					{ x: projectile.x, y: projectile.y, z: projectile.z },
					projectile.kind === 'acid' ? ACID_SWEEP_RADIUS : GOLEM_ROCK_SWEEP_RADIUS
				);

				if (hit) {
					if (projectile.kind === 'acid') {
						// El charco se forma en la superficie contra la que se
						// lanzó el ácido (no a la altura del choque si el
						// jugador iba saltando), centrado donde impactó.
						projectile.x = hit.x;
						projectile.y = projectile.targetY ?? hit.y;
						projectile.z = hit.z;
						this.acidImpact(projectile, now, projectile.y);
					} else {
						projectile.x = hit.x;
						projectile.y = hit.y + 0.9;
						projectile.z = hit.z;
						projectile.targetX = hit.x;
						projectile.targetY = hit.y + 0.9;
						projectile.targetZ = hit.z;
						this.rockImpact(projectile, now);
					}

					continue;
				}

				remaining.push(projectile);
				continue;
			}

			// Granada: misma parábola exacta; estalla al tocar el suelo, al
			// vencer la espoleta o al pasar cerca de un monstruo.
			if (elapsed >= flight) {
				projectile.x = projectile.targetX;
				projectile.z = projectile.targetZ;
				projectile.y = ARENA_FLOOR_Y;
			} else {
				projectile.x = projectile.originX + projectile.vx * elapsed;
				projectile.y =
					projectile.originY + projectile.vy * elapsed - 0.5 * gravity * elapsed * elapsed;
				projectile.z = projectile.originZ + projectile.vz * elapsed;
			}

			const hitGround = projectile.y <= ARENA_FLOOR_Y + 1e-3;
			let detonate = hitGround || now >= projectile.fuseAt;

			if (!detonate) {
				for (const monster of this.monsters.values()) {
					if (monster.status !== 'active') {
						continue;
					}

					const dx = monster.x - projectile.x;
					const dz = monster.z - projectile.z;

					if (
						dx * dx + dz * dz <= 1.1 * 1.1 &&
						Math.abs(projectile.y - (ARENA_FLOOR_Y + 1.0)) < 2.2
					) {
						detonate = true;
						break;
					}
				}
			}

			if (detonate) {
				this.grenadeExplode(projectile, now);
				continue;
			}

			remaining.push(projectile);
		}

		this.projectiles = remaining;
	}

	/**
	 * Impacto de la roca del Golem. Daña en un radio pequeño y empuja a los
	 * jugadores alcanzados en la dirección de vuelo de la roca. El empuje no
	 * se simula en el servidor (no mueve posiciones autoritativas): se emite
	 * `rock-hit` y el cliente del jugador aplica el impulso a su controlador,
	 * que luego reporta la nueva posición a 10 Hz.
	 */
	private rockImpact(projectile: RoomProjectile, now: number): void {
		const x = projectile.targetX;
		const z = projectile.targetZ;
		const y = projectile.targetY ?? ARENA_FLOOR_Y;
		let dirX = projectile.vx;
		let dirZ = projectile.vz;
		const dirLength = Math.hypot(dirX, dirZ);

		if (dirLength < 1e-4) {
			dirX = 0;
			dirZ = 1;
		} else {
			dirX /= dirLength;
			dirZ /= dirLength;
		}

		for (const player of this.players.values()) {
			if (player.downed || player.driving) {
				continue;
			}

			if (
				horizontalDistance(player.x, player.z, x, z) <= GOLEM_ROCK_IMPACT_RADIUS &&
				Math.abs(player.y + 0.9 - y) <= GOLEM_ROCK_VERTICAL_REACH
			) {
				const before = player.health;
				this.damagePlayer(player, projectile.damage, 'rock', now);

				// Solo empuja si el golpe contó (la ventana de gracia puede
				// descartar un segundo impacto en el mismo instante).
				if (player.health < before) {
					this.emitEvent('rock-hit', now, {
						playerId: player.id,
						x: round(player.x),
						y: round(player.y),
						z: round(player.z),
						dx: round(dirX, 3),
						dz: round(dirZ, 3),
						amount: projectile.damage,
						monsterKind: 'golem'
					});
				}
			}
		}

		if (
			!this.car.destroyed &&
			horizontalDistance(this.car.x, this.car.z, x, z) <= GOLEM_ROCK_IMPACT_RADIUS + 1.0 &&
			Math.abs(this.car.y + 0.8 - y) <= GOLEM_ROCK_VERTICAL_REACH
		) {
			this.damageCar(projectile.damage, now);
		}

		this.stateDirty = true;
		this.emitEvent('rock-impact', now, { x, y, z });
	}

	private acidImpact(projectile: RoomProjectile, now: number, impactY: number): void {
		const { x, z } = projectile;

		// Daño directo a jugadores a pie y al coche. La comprobación vertical
		// es relativa a la superficie de impacto: un charco en un mirador no
		// alcanza a quien está en el suelo (ni al revés).
		for (const player of this.players.values()) {
			if (player.downed || player.driving) {
				continue;
			}

			if (
				horizontalDistance(player.x, player.z, x, z) <= ACID_DIRECT_RADIUS &&
				Math.abs(player.y - impactY) <= ACID_VERTICAL_REACH
			) {
				this.damagePlayer(player, projectile.damage, 'acid', now);
			}
		}

		if (
			horizontalDistance(this.car.x, this.car.z, x, z) <= ACID_DIRECT_RADIUS + 1.0 &&
			Math.abs(this.car.y - impactY) <= ACID_VERTICAL_REACH
		) {
			this.damageCar(projectile.damage, now);
		}

		// Charco (máximo ACID_MAX_POOLS, FIFO).
		if (this.pools.length >= ACID_MAX_POOLS) {
			this.pools.shift();
		}

		this.pools.push({
			id: nextId('pool'),
			x,
			y: impactY,
			z,
			radius: ACID_POOL_RADIUS,
			expiresAt: now + ACID_POOL_DURATION_MS,
			nextTickAt: now + POOL_TICK_MS
		});

		this.stateDirty = true;
		this.emitEvent('acid-impact', now, { x, y: impactY, z });
	}

	private grenadeExplode(projectile: RoomProjectile, now: number): void {
		const { x, y, z } = projectile;

		for (const monster of this.monsters.values()) {
			if (monster.status !== 'active') {
				continue;
			}

			const dist = Math.hypot(monster.x - x, monster.z - z);

			if (dist <= GRENADE_RADIUS && Math.abs(monster.y - y) <= GRENADE_VERTICAL_REACH) {
				const falloff = 1 - dist / GRENADE_RADIUS;
				const damage = Math.round(
					GRENADE_EDGE_DAMAGE + (GRENADE_DAMAGE - GRENADE_EDGE_DAMAGE) * falloff
				);
				this.damageMonster(monster, damage, projectile.ownerId, now);
			}
		}

		this.emitEvent('grenade-exploded', now, { x, y, z, playerId: projectile.ownerId ?? undefined });
	}

	private updatePools(now: number): void {
		const remaining: RoomPool[] = [];

		for (const pool of this.pools) {
			if (now >= pool.expiresAt) {
				continue;
			}

			if (now >= pool.nextTickAt && this.phase === 'playing') {
				pool.nextTickAt = now + POOL_TICK_MS;

				for (const player of this.players.values()) {
					if (player.downed || player.driving) {
						continue;
					}

					if (
						horizontalDistance(player.x, player.z, pool.x, pool.z) <= pool.radius &&
						Math.abs(player.y - pool.y) <= ACID_VERTICAL_REACH
					) {
						this.damagePlayer(player, ACID_POOL_DPS, 'acid', now);
					}
				}
			}

			remaining.push(pool);
		}

		this.pools = remaining;
	}

	private updateDrops(now: number): void {
		const remaining: RoomDrop[] = [];

		for (const drop of this.drops) {
			if (now >= drop.expiresAt) {
				continue;
			}

			let consumed = false;

			for (const player of this.players.values()) {
				if (player.downed || player.driving) {
					continue;
				}

				if (horizontalDistance(player.x, player.z, drop.x, drop.z) > DROP_PICKUP_RADIUS) {
					continue;
				}

				this.applyDrop(player, drop, now);
				consumed = true;
				break;
			}

			if (!consumed) {
				remaining.push(drop);
			}
		}

		this.drops = remaining;
	}

	private applyDrop(player: RoomPlayer, drop: RoomDrop, now: number): void {
		switch (drop.kind) {
			case 'shotgun':
			case 'smg':
			case 'rifle': {
				const definition = WEAPON_BY_ID.get(drop.kind);

				if (definition) {
					// Keep every weapon: fill (or refill) its slot and equip
					// it, instead of discarding the previous one.
					player.inventory.set(drop.kind, definition.magSize);
					player.weapon = drop.kind;
					player.magAmmo = definition.magSize;
				}
				break;
			}
			case 'grenade':
				player.grenades = Math.min(MAX_GRENADES, player.grenades + 2);
				break;
			case 'ammo':
				player.reserveAmmo += AMMO_PACK_AMOUNT;
				break;
			case 'medkit':
				player.health = Math.min(PLAYER_MAX_HEALTH, player.health + MEDKIT_AMOUNT);
				break;
		}

		this.stateDirty = true;
		this.emitEvent('drop-picked', now, {
			playerId: player.id,
			dropKind: drop.kind,
			dropId: drop.id
		});
	}

	private despawnDeadMonsters(now: number): void {
		for (const monster of this.monsters.values()) {
			if (monster.status === 'dead' && monster.deadAt !== null) {
				if (now - monster.deadAt > MONSTER_DEATH_DESPAWN_MS) {
					this.monsters.delete(monster.id);
				}
			}
		}
	}

	private applyRamDamage(now: number): void {
		if (this.car.destroyed || this.car.driverId === null) {
			return;
		}

		for (const monster of this.monsters.values()) {
			if (monster.status !== 'active') {
				continue;
			}

			if (now - monster.lastRamAt < WAVES_CAR_RAM_COOLDOWN_MS) {
				continue;
			}

			if (Math.hypot(monster.x - this.car.x, monster.z - this.car.z) <= WAVES_CAR_RAM_RADIUS) {
				monster.lastRamAt = now;
				this.damageMonster(monster, WAVES_CAR_RAM_DAMAGE, this.car.driverId, now);
			}
		}
	}

	private checkWaveCleared(now: number): void {
		if (this.spawnQueue.length > 0 || this.aliveMonsters() > 0) {
			return;
		}

		// Todas las oleadas superadas.
		if (this.wave >= WAVES_TOTAL) {
			this.finishMatch('won', now);
			return;
		}

		this.phase = 'intermission';
		this.intermissionEndsAt = now + WAVES_INTERMISSION_MS;
		this.breaths = [];

		for (const player of this.players.values()) {
			if (player.downed) {
				player.downed = false;
				player.health = WAVES_REVIVE_HEALTH;
				this.emitEvent('player-revived', now, { playerId: player.id });
			}
		}

		this.stateDirty = true;
		this.emitEvent('wave-cleared', now, { wave: this.wave });
	}

	private checkDefeat(now: number): void {
		if (this.players.size === 0) {
			return;
		}

		if (this.allDowned()) {
			this.finishMatch('lost', now);
		}
	}

	private allDowned(): boolean {
		for (const player of this.players.values()) {
			if (!player.downed) {
				return false;
			}
		}

		return this.players.size > 0;
	}

	private hitscan(
		shooter: RoomPlayer,
		origin: { x: number; y: number; z: number },
		dir: { x: number; y: number; z: number },
		maxRange: number,
		damage: number,
		now: number,
		locked: RoomMonster | null = null
	): void {
		// The client reported a monster under the crosshair. Apply the hit
		// directly (the shot was aimed at it) instead of relying on the ray
		// passing through its authoritative position, which trails what the
		// player saw by up to a couple of ticks.
		if (locked && locked.status === 'active') {
			if (horizontalDistance(origin.x, origin.z, locked.x, locked.z) <= maxRange + 1) {
				this.shotStats.hits += 1;
				this.shotStats.damage += damage;
				this.damageMonster(locked, damage, shooter.id, now);
			}

			return;
		}

		let bestMonster: RoomMonster | null = null;
		let bestDistance = Infinity;

		for (const monster of this.monsters.values()) {
			if (monster.status !== 'active') {
				continue;
			}

			// Distancia del rayo (en XZ) al centro del monstruo.
			const ox = origin.x;
			const oz = origin.z;
			const dx = dir.x;
			const dz = dir.z;
			const lengthSq = dx * dx + dz * dz;

			if (lengthSq < 1e-6) {
				continue;
			}

			const t = ((monster.x - ox) * dx + (monster.z - oz) * dz) / lengthSq;

			if (t < 0 || t > maxRange) {
				continue;
			}

			const closestX = ox + dx * t;
			const closestZ = oz + dz * t;
			const dist = Math.hypot(monster.x - closestX, monster.z - closestZ);

			if (dist > MONSTER_RADIUS) {
				continue;
			}

			// Altura: el impacto debe estar dentro del cuerpo del monstruo,
			// que puede estar en el suelo o subido a una rampa/plataforma.
			const hitY = origin.y + dir.y * t;
			const definition = MONSTER_BY_KIND.get(monster.kind)!;
			const bottom = monster.y - 0.2;
			const top = monster.y + definition.height + 0.3;

			if (hitY < bottom || hitY > top) {
				continue;
			}

			if (t < bestDistance) {
				bestDistance = t;
				bestMonster = monster;
			}
		}

		if (bestMonster) {
			this.shotStats.hits += 1;
			this.shotStats.damage += damage;
			this.damageMonster(bestMonster, damage, shooter.id, now);
		}
	}

	/** Resumen de disparos (diagnóstico temporal, máximo uno cada 10 s). */
	private logShotStats(now: number): void {
		if (now - this.shotStats.lastLogAt < 10_000) {
			return;
		}

		this.shotStats.lastLogAt = now;

		if (this.shotStats.received === 0) {
			return;
		}

		console.log(
			'[waves] shots',
			`received=${this.shotStats.received}`,
			`locked=${this.shotStats.locked}`,
			`hits=${this.shotStats.hits}`,
			`damage=${Math.round(this.shotStats.damage)}`,
			`rejected(phase=${this.shotStats.phase},weapon=${this.shotStats.weapon},rate=${this.shotStats.rate},origin=${this.shotStats.origin},ammo=${this.shotStats.ammo})`
		);
	}

	private damageMonster(
		monster: RoomMonster,
		amount: number,
		byPlayerId: string | null,
		now: number
	): void {
		if (monster.status !== 'active') {
			return;
		}

		monster.health -= amount;

		const definition = MONSTER_BY_KIND.get(monster.kind)!;

		this.emitEvent('monster-hit', now, {
			monsterId: monster.id,
			monsterKind: monster.kind,
			amount,
			playerId: byPlayerId ?? undefined,
			// Impact point for the client's hit spark / hit marker.
			x: round(monster.x),
			y: round(monster.y + definition.height * 0.55),
			z: round(monster.z)
		});

		if (monster.health > 0) {
			return;
		}

		monster.status = 'dead';
		monster.health = 0;
		monster.deadAt = now;

		if (byPlayerId) {
			const player = this.players.get(byPlayerId);

			if (player) {
				player.kills += 1;
				player.score += definition.score;
			}
		}

		// Roll de drop.
		const drop = this.rollDrop(monster, now);

		if (drop) {
			this.drops.push(drop);
		}

		this.stateDirty = true;
		this.emitEvent('monster-died', now, {
			monsterId: monster.id,
			monsterKind: monster.kind,
			playerId: byPlayerId ?? undefined,
			wave: this.wave
		});
	}

	private rollDrop(monster: RoomMonster, now: number): RoomDrop | null {
		const total = DROP_TABLE.reduce((sum, entry) => sum + entry.weight, 0) + DROP_NOTHING_WEIGHT;
		let roll = Math.random() * total;

		for (const entry of DROP_TABLE) {
			roll -= entry.weight;

			if (roll <= 0) {
				return {
					id: nextId('drop'),
					kind: entry.kind,
					x: monster.x,
					y: ARENA_FLOOR_Y + 0.4,
					z: monster.z,
					expiresAt: now + DROP_DESPAWN_MS
				};
			}
		}

		return null;
	}

	private damagePlayer(
		player: RoomPlayer,
		amount: number,
		source: 'melee' | 'acid' | 'pool' | 'fire' | 'rock',
		now: number
	): void {
		if (player.downed || this.phase !== 'playing') {
			return;
		}

		// Varios monstruos pueden entrar en rango en el mismo tick: sin esta
		// ventana, seis esqueletos restaban 48 HP de golpe. El daño de los
		// charcos de ácido y del aliento de fuego no se limita: es continuo y
		// ya está escalado por tick.
		if (source !== 'pool' && source !== 'fire') {
			if (now - player.lastDamagedAt < WAVES_PLAYER_HIT_GRACE_MS) {
				return;
			}

			player.lastDamagedAt = now;
		}

		player.health -= amount;

		// Cualquier golpe directo avisa al cliente para que reproduzca
		// `HR_injured` y el sonido de daño. Los golpes fuertes siempre avisan;
		// el daño continuo (fuego/charco, varios ticks por segundo) se limita a
		// un evento cada 700 ms para no reiniciar la reacción sin parar.
		if (amount >= 20 || now - player.lastHurtEventAt >= 700) {
			player.lastHurtEventAt = now;
			this.emitEvent('player-hurt', now, { playerId: player.id, amount });
		}

		if (player.health <= 0) {
			player.health = 0;
			player.downed = true;

			// Si conducía, sale del coche.
			if (player.driving && this.car.driverId === player.id) {
				this.car.driverId = null;
				player.driving = false;
			}

			this.stateDirty = true;
			this.emitEvent('player-downed', now, { playerId: player.id });
		} else {
			this.stateDirty = true;
		}
	}

	private damageCar(amount: number, now: number): void {
		if (this.car.destroyed) {
			return;
		}

		this.car.health -= amount;

		if (this.car.health > 0) {
			this.stateDirty = true;
			return;
		}

		this.car.health = 0;
		this.car.destroyed = true;

		const driverId = this.car.driverId;

		if (driverId) {
			this.car.driverId = null;
			const player = this.players.get(driverId);

			if (player) {
				player.driving = false;
				player.x = this.car.x + 2.0;
				player.z = this.car.z;
				player.y = ARENA_FLOOR_Y;

				// El conductor sale con daño (nunca letal de golpe: se aplica el daño).
				this.damagePlayer(player, WAVES_CAR_EJECT_DAMAGE, 'acid', now);
			}
		}

		this.stateDirty = true;
		this.emitEvent('car-destroyed', now, { x: this.car.x, y: this.car.y, z: this.car.z });
	}

	private clampToArena(x: number, z: number): { x: number; z: number } {
		if (pointInArena(x, z)) {
			return { x, z };
		}

		// Recorrido hacia el centroide del polígono.
		let cx = 0;
		let cz = 0;

		for (const [px, pz] of ARENA) {
			cx += px;
			cz += pz;
		}

		cx /= ARENA.length;
		cz /= ARENA.length;

		let low = 0;
		let high = 1;

		for (let i = 0; i < 16; i += 1) {
			const mid = (low + high) / 2;
			const mx = cx + (x - cx) * mid;
			const mz = cz + (z - cz) * mid;

			if (pointInArena(mx, mz)) {
				low = mid;
			} else {
				high = mid;
			}
		}

		return { x: cx + (x - cx) * low, z: cz + (z - cz) * low };
	}

	private finishMatch(result: 'won' | 'lost', now: number): void {
		if (this.phase !== 'won' && this.phase !== 'lost') {
			this.breaths = [];
			this.phase = result;
			this.endsAt = now + WAVES_RESULT_MS;
			this.stateDirty = true;
			this.emitEvent(result === 'won' ? 'victory' : 'defeat', now, {});
			return;
		}

		// Segunda llamada (tick tras `endsAt`): devolver a todos al hub.
		for (const playerId of this.players.keys()) {
			this.deps.moveToLobby(playerId);
		}

		this.resetMatch();
	}

	private resetMatch(): void {
		this.phase = 'idle';
		this.endsAt = null;
		this.intermissionEndsAt = null;
		this.wave = 0;
		this.waveName = null;
		this.players.clear();
		this.monsters.clear();
		this.pools = [];
		this.drops = [];
		this.projectiles = [];
		this.breaths = [];
		this.spawnQueue = [];
		this.recentPortals = [];
		this.car = Waves.freshCar();
		this.stateDirty = true;
	}

	// ------------------------------------------------------------------
	// Snapshots & broadcasts
	// ------------------------------------------------------------------

	private teamScore(): number {
		let sum = 0;

		for (const player of this.players.values()) {
			sum += player.score;
		}

		return sum;
	}

	private monstersRemaining(): number {
		return this.aliveMonsters() + this.spawnQueue.length;
	}

	private copyCar(): Mg5CarState {
		const car = this.car;

		return {
			...car,
			x: round(car.x),
			y: round(car.y),
			z: round(car.z),
			yaw: round(car.yaw),
			qx: round(car.qx, 4),
			qy: round(car.qy, 4),
			qz: round(car.qz, 4),
			qw: round(car.qw, 4),
			vx: round(car.vx),
			vy: round(car.vy),
			vz: round(car.vz),
			speed: round(car.speed),
			steering: round(car.steering, 3)
		};
	}

	private copyPlayer(player: RoomPlayer): Mg5PlayerState {
		const starterWeapon = player.weapon;

		return {
			id: player.id,
			name: player.name,
			health: Math.round(player.health),
			maxHealth: PLAYER_MAX_HEALTH,
			downed: player.downed,
			driving: player.driving,
			kills: player.kills,
			score: player.score,
			weapon: starterWeapon,
			magAmmo: player.magAmmo,
			reserveAmmo: starterWeapon === 'pistol' ? null : player.reserveAmmo,
			inventory: [...player.inventory.entries()]
				.map(([weapon, magAmmo]) => ({
					weapon,
					slot: WEAPON_SLOT_BY_ID[weapon],
					magAmmo
				}))
				.sort((a, b) => a.slot - b.slot),
			grenades: player.grenades,
			x: round(player.x),
			y: round(player.y),
			z: round(player.z),
			yaw: round(player.yaw, 3)
		};
	}

	private copyMonster(monster: RoomMonster): Mg5MonsterSnapshot {
		return {
			id: monster.id,
			kind: monster.kind,
			status: monster.status,
			health: Math.round(monster.health),
			maxHealth: monster.maxHealth,
			x: round(monster.x),
			y: round(monster.y),
			z: round(monster.z),
			yaw: round(monster.yaw, 3)
		};
	}

	buildSnapshot(now: number): Mg5Snapshot {
		return {
			phase: this.phase,
			serverTime: now,
			wave: this.wave,
			totalWaves: WAVES_TOTAL,
			waveName: this.waveName,
			endsAt: this.endsAt,
			intermissionEndsAt: this.intermissionEndsAt,
			monstersRemaining: this.monstersRemaining(),
			teamScore: this.teamScore(),
			players: [...this.players.values()].map((player) => this.copyPlayer(player)),
			monsters: [...this.monsters.values()].map((monster) => this.copyMonster(monster)),
			pools: this.pools.map((pool) => ({
				id: pool.id,
				x: round(pool.x),
				y: round(pool.y),
				z: round(pool.z),
				radius: pool.radius,
				expiresAt: pool.expiresAt
			})),
			drops: this.drops.map((drop): Mg5Drop => ({
				id: drop.id,
				kind: drop.kind,
				x: round(drop.x),
				y: round(drop.y),
				z: round(drop.z),
				expiresAt: drop.expiresAt
			})),
			car: this.copyCar()
		};
	}

	private broadcastState(now: number): void {
		this.stateDirty = false;
		this.nextStateAt = now + STATE_SNAPSHOT_INTERVAL_MS;
		this.publish({ type: 'mg5-state', state: this.buildSnapshot(now) });
	}

	private broadcastPositions(now: number): void {
		if (this.phase === 'idle') {
			return;
		}

		if (now - this.lastPositionsAt < POSITION_INTERVAL_MS) {
			return;
		}

		this.lastPositionsAt = now;

		const positions: Mg5Positions = {
			at: now,
			players: [...this.players.values()].map((player) => ({
				id: player.id,
				x: round(player.x),
				y: round(player.y),
				z: round(player.z),
				yaw: round(player.yaw, 3),
				downed: player.downed
			})),
			monsters: [...this.monsters.values()].map((monster) => ({
				id: monster.id,
				x: round(monster.x),
				y: round(monster.y),
				z: round(monster.z),
				yaw: round(monster.yaw, 3),
				status: monster.status
			})),
			projectiles: this.projectiles
				.filter((projectile) => projectile.kind === 'acid')
				.map((projectile) => ({
					id: projectile.id,
					x: round(projectile.x),
					y: round(projectile.y),
					z: round(projectile.z)
				})),
			grenades: this.projectiles
				.filter((projectile) => projectile.kind === 'grenade')
				.map((projectile) => ({
					id: projectile.id,
					x: round(projectile.x),
					y: round(projectile.y),
					z: round(projectile.z)
				})),
			rocks: this.projectiles
				.filter((projectile) => projectile.kind === 'rock')
				.map((projectile) => ({
					id: projectile.id,
					x: round(projectile.x),
					y: round(projectile.y),
					z: round(projectile.z)
				})),
			breaths: this.breaths.map((breath) => ({
				id: breath.id,
				x: round(breath.x),
				y: round(breath.y),
				z: round(breath.z),
				dx: round(breath.dx, 3),
				dy: round(breath.dy, 3),
				dz: round(breath.dz, 3)
			})),
			car: this.phase === 'playing' || this.phase === 'intermission' ? this.copyCar() : null
		};

		this.publish({ type: 'mg5-positions', ...positions });
	}
}
