import type {
	Mg2Event,
	Mg2EventKind,
	Mg2MummyPosition,
	Mg2MummyState,
	Mg2MummyStatus,
	Mg2Phase,
	Mg2PlayerState,
	Mg2SkullState,
	Mg2Snapshot,
	Mg2Zone,
	ServerMessage
} from './protocol';

/**
 * Authoritative engine for `minigame-2`: 10 skulls that are deposited in the main
 * tomb of the crypt while mummies patrol the zones. Mummy contact drains health
 * instead of killing instantly, and paper rolls stun a mummy for a few seconds.
 *
 * There is a single room per process. The client only reports positions; phases,
 * timings, pickups, deposits, deaths and mummies are decided here.
 */

const COUNTDOWN_MS = 30_000;
const ROUND_MS = 300_000;
const RESULT_MS = 8_000;
const DEATH_MS = 2_500;
const DROP_COOLDOWN_MS = 2_000;
const MAX_POSITION_RATE = 15;
const MAX_SPEED = 8;
// Health is only drained by mummy contact: a touch no longer kills instantly.
const MAX_HEALTH = 100;
const MUMMY_DAMAGE = 25;
const DAMAGE_COOLDOWN_MS = 1_000;
const REGEN_DELAY_MS = 6_000;
const REGEN_PER_SECOND = 8;
// Paper rolls make a mummy "dumb": it stops chasing and does not hurt anyone.
const STUN_MS = 5_000;
const STUN_MAX_DISTANCE = 15;
const STUN_RATE_MS = 300;

const CRYPT_BOUNDS = {
	minX: -2,
	maxX: 64,
	minY: -10,
	maxY: 1,
	minZ: -2,
	maxZ: 64
};

export const MG2_CRYPT_SPAWN = { x: 36.7, y: -7.98, z: 45.0 } as const;
export const MG2_STAIR_SPAWN = { x: 21.3, y: -7.98, z: 50.0 } as const;
export const MG2_DEPOSIT = { x: 36.68, z: 40.3, radius: 2.5, maxDy: 2.0 } as const;

type SkullDefinition = {
	id: string;
	zone: Mg2Zone;
	x: number;
	y: number;
	z: number;
};

const SKULL_DEFINITIONS: readonly SkullDefinition[] = [
	{ id: 'skull-west', zone: 'west', x: 11.6, y: -6.95, z: 35.5 },
	{ id: 'skull-west-2', zone: 'west', x: 7.5, y: -6.95, z: 40.5 },
	{ id: 'skull-south', zone: 'south', x: 36.7, y: -6.95, z: 59.8 },
	{ id: 'skull-south-2', zone: 'south', x: 31.5, y: -6.95, z: 63.5 },
	{ id: 'skull-east', zone: 'east', x: 55.2, y: -6.95, z: 38.4 },
	{ id: 'skull-east-2', zone: 'east', x: 50.8, y: -6.95, z: 44.5 },
	{ id: 'skull-north', zone: 'north', x: 36.7, y: -6.95, z: 19.9 },
	{ id: 'skull-north-2', zone: 'north', x: 31.8, y: -6.95, z: 23.8 },
	{ id: 'skull-niches', zone: 'chambers', x: 36.7, y: -6.95, z: 27.0 },
	{ id: 'skull-niches-2', zone: 'chambers', x: 40.5, y: -6.95, z: 27.2 }
];

type ZoneRectangle = {
	zone: Mg2Zone;
	minX: number;
	maxX: number;
	minZ: number;
	maxZ: number;
};

const ZONE_RECTANGLES: readonly ZoneRectangle[] = [
	{ zone: 'west', minX: 3.5, maxX: 19.5, minZ: 27.5, maxZ: 43.5 },
	{ zone: 'south', minX: 28.5, maxX: 44.5, minZ: 53.5, maxZ: 65.8 },
	{ zone: 'east', minX: 48.8, maxX: 61.5, minZ: 30.5, maxZ: 46.5 },
	{ zone: 'north', minX: 28.8, maxX: 44.5, minZ: 13.8, maxZ: 26.2 },
	{ zone: 'chambers', minX: 20.0, maxX: 49.5, minZ: 25.0, maxZ: 50.6 }
];

type MummyDefinition = {
	id: string;
	zone: Mg2Zone;
	spawn: { x: number; z: number };
	waypoints: ReadonlyArray<{ x: number; z: number }>;
};

const MUMMY_DEFINITIONS: readonly MummyDefinition[] = [
	{
		id: 'mummy-west',
		zone: 'west',
		spawn: { x: 8.5, z: 33.0 },
		waypoints: [
			{ x: 8.5, z: 33.0 },
			{ x: 14.0, z: 36.0 },
			{ x: 8.5, z: 42.0 },
			{ x: 7.0, z: 36.5 }
		]
	},
	{
		id: 'mummy-south',
		zone: 'south',
		spawn: { x: 33.0, z: 59.0 },
		waypoints: [
			{ x: 33.0, z: 59.0 },
			{ x: 40.0, z: 59.0 },
			{ x: 40.0, z: 64.0 },
			{ x: 31.0, z: 64.0 }
		]
	},
	{
		id: 'mummy-east',
		zone: 'east',
		spawn: { x: 52.5, z: 40.5 },
		waypoints: [
			{ x: 52.5, z: 40.5 },
			{ x: 58.0, z: 40.5 },
			{ x: 58.0, z: 33.0 },
			{ x: 52.5, z: 33.0 }
		]
	},
	{
		id: 'mummy-north',
		zone: 'north',
		spawn: { x: 36.7, z: 20.8 },
		waypoints: [
			{ x: 36.7, z: 20.8 },
			{ x: 32.0, z: 24.0 },
			{ x: 41.5, z: 20.8 },
			{ x: 36.7, z: 16.5 }
		]
	},
	{
		id: 'mummy-hall',
		zone: 'chambers',
		spawn: { x: 32.0, z: 29.0 },
		waypoints: [
			{ x: 32.0, z: 29.0 },
			{ x: 41.0, z: 29.0 },
			{ x: 41.0, z: 35.0 },
			{ x: 32.0, z: 35.0 }
		]
	}
];

// Patrol/chase speeds are applied by the driver's physics
// (client) when approaching the goal; here only the decision radii are used.
// Mummies notice players from farther away and close the distance faster than
// the first version.
const CHASE_RADIUS = 9.0;
const KILL_RADIUS = 1.1;
const VERTICAL_TOLERANCE = 1.5;
const PICKUP_RADIUS = 1.5;

// The server does not trust the vertical position reported by the driver:
// all crypt floors are flat and the only raised surface a mummy can reach is
// the main tomb platform. Deriving `y` from the mummy's XZ guarantees that no
// physics glitch can ever make a mummy fly for the rest of the players.
const MUMMY_FLOOR_Y = -7.98;
const MUMMY_PLATFORM_Y = -7.52;
const MUMMY_ZONE_MARGIN = 0.75;
const MUMMY_MAX_SPEED = 3.0;
// Flat top of `A4C_Tombs`, measured with a downward raycast at 0.1 m steps.
// The mummy controller has no autostep, so it cannot climb the 0.16 m tiers in
// practice; this is only the safety net for a reported position over the top.
const TOMB_PLATFORM = {
	minX: 32.2,
	maxX: 41.2,
	minZ: 33.3,
	maxZ: 42.3
} as const;

function mummyGroundY(x: number, z: number): number {
	const onPlatform =
		x >= TOMB_PLATFORM.minX &&
		x <= TOMB_PLATFORM.maxX &&
		z >= TOMB_PLATFORM.minZ &&
		z <= TOMB_PLATFORM.maxZ;

	return onPlatform ? MUMMY_PLATFORM_Y : MUMMY_FLOOR_Y;
}

type RoomPlayer = {
	id: string;
	name: string;
	carried: string[];
	deposited: number;
	alive: boolean;
	hp: number;
	maxHp: number;
	x: number;
	y: number;
	z: number;
	yaw: number;
	lastPositionAt: number;
	respawnAt: number | null;
	rateWindowStart: number;
	rateCount: number;
	/** No more mummy damage is accepted before this timestamp. */
	hurtUntil: number;
	lastHurtAt: number;
	lastRegenAt: number;
	/** Throttles `mg2-stun` requests (one paper roll each). */
	stunReadyAt: number;
};

type RoomSkull = {
	id: string;
	zone: Mg2Zone;
	x: number;
	y: number;
	z: number;
	state: Mg2SkullState['state'];
	carrierId: string | null;
	pickupAfter: number;
};

type RoomMummy = {
	id: string;
	zone: Mg2Zone;
	x: number;
	y: number;
	z: number;
	yaw: number;
	state: Mg2MummyStatus;
	waypoint: number;
	cooldownUntil: number;
	/** While `state === 'stunned'`, the mummy ignores players until this time. */
	stunUntil: number;
	/** Goal decided by the server (waypoint or chased player). */
	goalX: number;
	goalZ: number;
	/** Last physics report received from the driver; 0 = never. */
	lastReportAt: number;
};

type Minigame2Deps = {
	publish: (message: ServerMessage) => void;
	moveToGlobal: (playerId: string) => void;
};

let deps: Minigame2Deps | null = null;

let phase: Mg2Phase = 'idle';
let endsAt: number | null = null;
let depositedTotal = 0;
let nextStateAt = 0;
let stateDirty = false;

const players = new Map<string, RoomPlayer>();
let skulls: RoomSkull[] = [];
let mummies: RoomMummy[] = [];

export function initMinigame2(next: Minigame2Deps): void {
	deps = next;
}

function publish(message: ServerMessage): void {
	deps?.publish(message);
}

function emitEvent(kind: Mg2EventKind, now: number, extra: Partial<Mg2Event> = {}): void {
	const event: Mg2Event = { kind, at: now, ...extra };
	publish({ type: 'mg2-event', event });
}

function copyPlayer(player: RoomPlayer): Mg2PlayerState {
	return {
		id: player.id,
		name: player.name,
		skullsCarried: player.carried.length,
		skullsDeposited: player.deposited,
		alive: player.alive,
		hp: Math.round(player.hp),
		maxHp: player.maxHp,
		x: round(player.x),
		y: round(player.y),
		z: round(player.z),
		yaw: round(player.yaw)
	};
}

function round(value: number): number {
	return Math.round(value * 1000) / 1000;
}

function buildSnapshot(now: number): Mg2Snapshot {
	return {
		phase,
		endsAt,
		serverTime: now,
		depositedTotal,
		mummyDriverId: mummyDriverId(),
		players: [...players.values()].map(copyPlayer),
		skulls: skulls.map((skull) => ({
			id: skull.id,
			zone: skull.zone,
			x: round(skull.x),
			y: round(skull.y),
			z: round(skull.z),
			state: skull.state,
			carrierId: skull.carrierId
		})),
		mummies: mummies.map((mummy) => ({
			id: mummy.id,
			zone: mummy.zone,
			x: round(mummy.x),
			y: round(mummy.y),
			z: round(mummy.z),
			yaw: round(mummy.yaw),
			state: mummy.state
		}))
	};
}

function broadcastState(now: number): void {
	stateDirty = false;
	nextStateAt = now + 1000;
	publish({ type: 'mg2-state', state: buildSnapshot(now) });
}

function broadcastPositions(now: number): void {
	const state = buildSnapshot(now);
	publish({
		type: 'mg2-positions',
		at: now,
		players: state.players.map(({ id, x, y, z, yaw, alive }) => ({ id, x, y, z, yaw, alive })),
		mummies: mummies.map((mummy) => ({
			id: mummy.id,
			zone: mummy.zone,
			x: round(mummy.x),
			y: round(mummy.y),
			z: round(mummy.z),
			yaw: round(mummy.yaw),
			state: mummy.state,
			goalX: round(mummy.goalX),
			goalZ: round(mummy.goalZ)
		}))
	});
}

function clearRound(): void {
	skulls = [];
	mummies = [];
	depositedTotal = 0;
}

function resetRoom(): void {
	phase = 'idle';
	endsAt = null;
	clearRound();
	players.clear();
	stateDirty = false;
}

function startCountdown(now: number): void {
	phase = 'countdown';
	endsAt = now + COUNTDOWN_MS;
	clearRound();
	stateDirty = true;
}

function startRound(now: number): void {
	phase = 'playing';
	endsAt = now + ROUND_MS;

	skulls = SKULL_DEFINITIONS.map((definition) => ({
		...definition,
		state: 'available',
		carrierId: null,
		pickupAfter: 0
	}));

	mummies = MUMMY_DEFINITIONS.map((definition) => ({
		id: definition.id,
		zone: definition.zone,
		x: definition.spawn.x,
		y: -7.98,
		z: definition.spawn.z,
		yaw: 0,
		state: 'patrol' as Mg2MummyStatus,
		waypoint: 0,
		cooldownUntil: 0,
		stunUntil: 0,
		goalX: definition.spawn.x,
		goalZ: definition.spawn.z,
		lastReportAt: 0
	}));

	for (const player of players.values()) {
		player.carried = [];
		player.deposited = 0;
		player.hp = MAX_HEALTH;
		player.maxHp = MAX_HEALTH;
		player.hurtUntil = 0;
		player.lastHurtAt = 0;
		player.lastRegenAt = now;
		player.stunReadyAt = 0;
	}

	emitEvent('round-start', now);
	stateDirty = true;
}

function finish(result: 'won' | 'lost', now: number): void {
	if (phase !== 'playing') return;

	phase = result;
	endsAt = now + RESULT_MS;
	emitEvent(result === 'won' ? 'round-won' : 'round-lost', now);
	stateDirty = true;
}

function endRound(now: number): void {
	const ids = [...players.keys()];
	resetRoom();
	broadcastState(now);

	for (const id of ids) {
		deps?.moveToGlobal(id);
	}
}

function releaseSkulls(player: RoomPlayer, now: number): void {
	for (const skullId of player.carried) {
		const skull = skulls.find((item) => item.id === skullId);
		if (!skull) continue;

		skull.state = 'dropped';
		skull.carrierId = null;
		skull.x = player.x;
		skull.y = player.y + 1.0;
		skull.z = player.z;
		skull.pickupAfter = now + DROP_COOLDOWN_MS;
		emitEvent('skull-dropped', now, { playerId: player.id, skullId: skull.id });
	}

	player.carried = [];
	stateDirty = true;
}

function killPlayer(player: RoomPlayer, now: number): void {
	if (!player.alive) return;

	player.alive = false;
	player.hp = 0;
	player.respawnAt = now + DEATH_MS;
	releaseSkulls(player, now);
	emitEvent('player-died', now, { playerId: player.id });
	stateDirty = true;
}

/**
 * Mummy contact drains health instead of killing instantly. Each hit has a
 * short immunity window so a mummy standing on top of a player cannot empty
 * their bar in a single tick. Reaching 0 HP uses the old death flow.
 */
function damagePlayer(player: RoomPlayer, amount: number, now: number): void {
	if (!player.alive || now < player.hurtUntil) return;

	player.hp = Math.max(0, player.hp - amount);
	player.hurtUntil = now + DAMAGE_COOLDOWN_MS;
	player.lastHurtAt = now;
	player.lastRegenAt = now;

	emitEvent('player-hurt', now, {
		playerId: player.id,
		amount,
		hp: Math.round(player.hp)
	});
	stateDirty = true;

	if (player.hp <= 0) {
		killPlayer(player, now);
	}
}

/** Health regenerates after a few seconds without mummy contact. */
function updateRegen(now: number): void {
	for (const player of players.values()) {
		if (!player.alive || player.hp >= player.maxHp) {
			player.lastRegenAt = now;
			continue;
		}

		if (now - player.lastHurtAt < REGEN_DELAY_MS) {
			player.lastRegenAt = now;
			continue;
		}

		const dt = Math.min(0.5, Math.max(0, (now - player.lastRegenAt) / 1000));
		player.lastRegenAt = now;

		if (dt <= 0) continue;

		player.hp = Math.min(player.maxHp, player.hp + REGEN_PER_SECOND * dt);
	}
}

/**
 * A paper roll thrown by `playerId` hit `mummyId`. The client detects the
 * collision (the rolls are simulated locally) and the server validates the
 * player, the mummy, the distance and the rate before stunning it.
 */
export function onStun(playerId: string, mummyId: string, now = Date.now()): void {
	if (phase !== 'playing') return;

	const player = players.get(playerId);
	const mummy = mummies.find((item) => item.id === mummyId);

	if (!player || !player.alive || !mummy) return;
	if (now < player.stunReadyAt) return;
	if (horizontalDistance(player.x, player.z, mummy.x, mummy.z) > STUN_MAX_DISTANCE) return;

	player.stunReadyAt = now + STUN_RATE_MS;
	mummy.state = 'stunned';
	mummy.stunUntil = now + STUN_MS;
	mummy.cooldownUntil = 0;
	mummy.goalX = mummy.x;
	mummy.goalZ = mummy.z;

	emitEvent('mummy-stunned', now, { playerId, mummyId });
	stateDirty = true;
}

function zoneOf(zone: Mg2Zone): ZoneRectangle {
	return ZONE_RECTANGLES.find((rectangle) => rectangle.zone === zone) ?? ZONE_RECTANGLES[0];
}

function insideZone(rectangle: ZoneRectangle, x: number, z: number): boolean {
	return x >= rectangle.minX && x <= rectangle.maxX && z >= rectangle.minZ && z <= rectangle.maxZ;
}

function horizontalDistance(ax: number, az: number, bx: number, bz: number): number {
	return Math.hypot(ax - bx, az - bz);
}

/**
 * Player that simulates the mummies with their physics capsule and reports their
 * positions: the first one who entered the room (insertion order).
 */
function mummyDriverId(): string | null {
	for (const player of players.values()) {
		return player.id;
	}

	return null;
}

let lastMummiesReportAt = 0;

/**
 * The driver reports the real physical position of the mummies (collisions
 * included). The server validates rate, range and maximum speed before
 * accepting it: they are never teleported.
 */
export function onMummiesReport(
	playerId: string,
	report: ReadonlyArray<{ id: string; x: number; y: number; z: number }>,
	now = Date.now()
): void {
	if (playerId !== mummyDriverId()) return;
	if (now - lastMummiesReportAt < 50) return;
	lastMummiesReportAt = now;

	for (const entry of report) {
		const mummy = mummies.find((item) => item.id === entry.id);
		if (!mummy) continue;
		if (!Number.isFinite(entry.x) || !Number.isFinite(entry.z)) continue;

		const rectangle = zoneOf(mummy.zone);
		const x = clamp(entry.x, rectangle.minX - MUMMY_ZONE_MARGIN, rectangle.maxX + MUMMY_ZONE_MARGIN);
		const z = clamp(entry.z, rectangle.minZ - MUMMY_ZONE_MARGIN, rectangle.maxZ + MUMMY_ZONE_MARGIN);

		let appliedX = x;
		let appliedZ = z;

		if (mummy.lastReportAt > 0) {
			const dt = Math.max(0.001, (now - mummy.lastReportAt) / 1000);
			const allowed = MUMMY_MAX_SPEED * dt + 0.12;
			const travelled = Math.hypot(x - mummy.x, z - mummy.z);

			if (travelled > allowed) {
				const scale = allowed / travelled;
				appliedX = mummy.x + (x - mummy.x) * scale;
				appliedZ = mummy.z + (z - mummy.z) * scale;
			}
		}

		mummy.x = appliedX;
		// Height from the surface under its XZ, never from the reported `y`.
		mummy.y = mummyGroundY(appliedX, appliedZ);
		mummy.z = appliedZ;
		mummy.lastReportAt = now;
	}
}

/**
 * Mummy brain: it does not move them (the driver's physics does),
 * it only picks a goal, advances waypoints with the reported position, turns toward
 * the goal and kills with the real position.
 */
function updateMummies(now: number): void {
	for (const mummy of mummies) {
		const rectangle = zoneOf(mummy.zone);

		if (mummy.state === 'stunned') {
			if (now < mummy.stunUntil) {
				mummy.goalX = mummy.x;
				mummy.goalZ = mummy.z;
				continue;
			}

			mummy.state = 'patrol';
			mummy.stunUntil = 0;
		}

		if (mummy.state === 'cooldown') {
			if (now >= mummy.cooldownUntil) {
				mummy.state = 'patrol';
			} else {
				mummy.goalX = mummy.x;
				mummy.goalZ = mummy.z;
				continue;
			}
		}

		let target: RoomPlayer | null = null;
		let nearest = Number.POSITIVE_INFINITY;

		for (const player of players.values()) {
			if (!player.alive) continue;
			if (Math.abs(player.y - mummy.y) > VERTICAL_TOLERANCE) continue;
			if (!insideZone(rectangle, player.x, player.z)) continue;

			const distance = horizontalDistance(mummy.x, mummy.z, player.x, player.z);

			if (distance <= CHASE_RADIUS && distance < nearest) {
				nearest = distance;
				target = player;
			}
		}

		if (target) {
			mummy.state = 'chase';
			mummy.goalX = target.x;
			mummy.goalZ = target.z;

			if (
				horizontalDistance(mummy.x, mummy.z, target.x, target.z) <= KILL_RADIUS &&
				Math.abs(target.y - mummy.y) <= VERTICAL_TOLERANCE
			) {
				damagePlayer(target, MUMMY_DAMAGE, now);
				mummy.state = 'cooldown';
				mummy.cooldownUntil = now + 1000;
				mummy.goalX = mummy.x;
				mummy.goalZ = mummy.z;
			}
		} else {
			mummy.state = 'patrol';

			const definition = MUMMY_DEFINITIONS.find((item) => item.id === mummy.id);

			if (definition) {
				const waypoint = definition.waypoints[mummy.waypoint % definition.waypoints.length];
				mummy.goalX = waypoint.x;
				mummy.goalZ = waypoint.z;

				// Advance with the reported physical position: if the path is
				// clear the driver will get there; if not, they slide as far as they can.
				if (horizontalDistance(mummy.x, mummy.z, waypoint.x, waypoint.z) < 0.3) {
					mummy.waypoint = (mummy.waypoint + 1) % definition.waypoints.length;
				}
			}
		}

		const goalDistance = horizontalDistance(mummy.x, mummy.z, mummy.goalX, mummy.goalZ);

		if (goalDistance > 0.05) {
			mummy.yaw = Math.atan2(mummy.goalX - mummy.x, mummy.goalZ - mummy.z);
		}
	}
}

function updatePickups(now: number): void {
	for (const skull of skulls) {
		if (skull.state !== 'available' && skull.state !== 'dropped') continue;
		if (now < skull.pickupAfter) continue;

		let nearest: RoomPlayer | null = null;
		let nearestDistance = PICKUP_RADIUS;

		for (const player of players.values()) {
			if (!player.alive) continue;

			const distance = Math.hypot(
				player.x - skull.x,
				player.y + 1.1 - skull.y,
				player.z - skull.z
			);

			if (distance <= nearestDistance) {
				nearestDistance = distance;
				nearest = player;
			}
		}

		if (!nearest) continue;

		skull.state = 'carried';
		skull.carrierId = nearest.id;
		nearest.carried.push(skull.id);
		emitEvent('skull-picked', now, { playerId: nearest.id, skullId: skull.id });
		stateDirty = true;
	}
}

function processRespawns(now: number): void {
	for (const player of [...players.values()]) {
		if (player.alive || player.respawnAt === null) continue;
		if (now < player.respawnAt) continue;

		players.delete(player.id);
		deps?.moveToGlobal(player.id);

		if (players.size === 0 && phase !== 'idle') {
			resetRoom();
			return;
		}

		stateDirty = true;
	}
}

export function onEnter(playerId: string, name: string, now = Date.now()): void {
	if (players.has(playerId)) return;

	// The first player enters through the center of the nave; whoever arrives with a
	// round already in progress appears on the lower landing of the staircase.
	const spawn =
		phase === 'countdown' || phase === 'playing' ? MG2_STAIR_SPAWN : MG2_CRYPT_SPAWN;

	players.set(playerId, {
		id: playerId,
		name,
		carried: [],
		deposited: 0,
		alive: true,
		hp: MAX_HEALTH,
		maxHp: MAX_HEALTH,
		x: spawn.x,
		y: spawn.y,
		z: spawn.z,
		yaw: 0,
		lastPositionAt: 0,
		respawnAt: null,
		rateWindowStart: now,
		rateCount: 0,
		hurtUntil: 0,
		lastHurtAt: 0,
		lastRegenAt: now,
		stunReadyAt: 0
	});

	if (phase === 'idle') {
		startCountdown(now);
	}

	emitEvent('player-joined', now, { playerId });
	stateDirty = true;
	broadcastState(now);
}

export function onLeave(playerId: string, now = Date.now()): void {
	const player = players.get(playerId);
	if (!player) return;

	releaseSkulls(player, now);
	players.delete(playerId);
	emitEvent('player-left', now, { playerId });

	if (players.size === 0) {
		resetRoom();
	}

	stateDirty = true;
	broadcastState(now);
}

export function onPosition(
	playerId: string,
	x: number,
	y: number,
	z: number,
	yaw: number,
	now = Date.now()
): void {
	const player = players.get(playerId);
	if (!player || !player.alive) return;

	// Per-player rate limit (1 s sliding window).
	if (now - player.rateWindowStart >= 1000) {
		player.rateWindowStart = now;
		player.rateCount = 0;
	}

	player.rateCount += 1;
	if (player.rateCount > MAX_POSITION_RATE) return;

	const nextX = clamp(x, CRYPT_BOUNDS.minX, CRYPT_BOUNDS.maxX);
	const nextY = clamp(y, CRYPT_BOUNDS.minY, CRYPT_BOUNDS.maxY);
	const nextZ = clamp(z, CRYPT_BOUNDS.minZ, CRYPT_BOUNDS.maxZ);

	if (player.lastPositionAt > 0) {
		const dt = Math.max(0.001, (now - player.lastPositionAt) / 1000);
		// Small tolerance for network jitter; it never allows exceeding
		// the controller's 8 m/s in a sustained way.
		const allowed = Math.max(0.35, MAX_SPEED * dt + 0.25);
		const travelled = Math.hypot(nextX - player.x, nextY - player.y, nextZ - player.z);

		if (travelled > allowed) {
			return;
		}
	}

	player.x = nextX;
	player.y = nextY;
	player.z = nextZ;
	player.yaw = yaw;
	player.lastPositionAt = now;
}

export function onDeposit(playerId: string, now = Date.now()): void {
	const player = players.get(playerId);

	if (phase !== 'playing' || !player || !player.alive || player.carried.length === 0) {
		return;
	}

	const distance = horizontalDistance(player.x, player.z, MG2_DEPOSIT.x, MG2_DEPOSIT.z);
	const vertical = Math.abs(player.y - MG2_CRYPT_SPAWN.y);

	if (distance > MG2_DEPOSIT.radius || vertical > MG2_DEPOSIT.maxDy) {
		return;
	}

	for (const skullId of player.carried) {
		const skull = skulls.find((item) => item.id === skullId);
		if (!skull) continue;

		skull.state = 'deposited';
		skull.carrierId = null;
		skull.x = MG2_DEPOSIT.x;
		skull.y = -6.9;
		skull.z = MG2_DEPOSIT.z;
		depositedTotal += 1;
		emitEvent('skull-deposited', now, { playerId, skullId });
	}

	player.deposited += player.carried.length;
	player.carried = [];
	stateDirty = true;

	if (depositedTotal >= SKULL_DEFINITIONS.length) {
		finish('won', now);
	}

	broadcastState(now);
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export function tick(now = Date.now()): void {
	try {
		if (phase === 'idle') return;

		if (endsAt !== null && now >= endsAt) {
			if (phase === 'countdown') {
				startRound(now);
			} else if (phase === 'playing') {
				finish('lost', now);
			} else {
				endRound(now);
				return;
			}
		}

		if (phase === 'playing') {
			updateMummies(now);
			updatePickups(now);
			updateRegen(now);
			processRespawns(now);
		}

		if (phase === 'playing' || phase === 'countdown') {
			broadcastPositions(now);
		}

		if (phase === 'won' || phase === 'lost') {
			processRespawns(now);
		}

		if (stateDirty || now >= nextStateAt) {
			broadcastState(now);
		}
	} catch (error) {
		console.error('[mg2] tick error:', error);
		publish({
			type: 'error',
			code: 'MG2_ROOM_ERROR',
			message: 'The crypt room was restarted due to an internal error'
		});
		resetRoom();
		broadcastState(now);
	}
}

export function snapshot(now = Date.now()): Mg2Snapshot {
	return buildSnapshot(now);
}

/** For automated tests only. */
export function debugState(): {
	phase: Mg2Phase;
	players: number;
	skulls: number;
	mummies: number;
	depositedTotal: number;
} {
	return {
		phase,
		players: players.size,
		skulls: skulls.length,
		mummies: mummies.length,
		depositedTotal
	};
}
