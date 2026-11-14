import type {
	Mg2Event,
	Mg2EventKind,
	Mg2MummyPosition,
	Mg2MummyReport,
	Mg2MummyState,
	Mg2MummyStatus,
	Mg2Phase,
	Mg2PlayerState,
	Mg2SkullState,
	Mg2Snapshot,
	Mg2Zone,
	ServerMessage
} from '../protocol';
import type { RoomPort } from '../port';
import { attestAll, newMatchId } from '../../progression/attest';

/**
 * Authoritative engine for `minigame-2`: 10 skulls are deposited in the main tomb
 * of the crypt while mummies patrol the zones. Mummy contact drains health
 * instead of killing instantly, and paper rolls stun a mummy for a few seconds.
 *
 * One instance per crypt room. The client only reports positions; phases,
 * timings, pickups, deposits, deaths and mummies are decided here.
 *
 * Old `backend/src/ws/minigame2.ts` kept all of this at module level and
 * published to the `lobby:minigame-2` topic.
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

// Patrol/chase speeds are applied by the driver's physics (client). Here only
// the decision radii are used. Mummies are deliberately a bit relentless:
// they notice players from farther away and close the distance faster.
const CHASE_RADIUS = 9.0;
const KILL_RADIUS = 1.1;
const VERTICAL_TOLERANCE = 1.5;
const PICKUP_RADIUS = 1.5;

// The server does not trust the vertical position reported by the driver: all
// crypt floors are flat and the only raised surface a mummy can reach is the
// main tomb platform. Deriving `y` from XZ means no physics glitch can make a
// mummy fly for the rest of the players.
const MUMMY_FLOOR_Y = -7.98;
const MUMMY_PLATFORM_Y = -7.52;
const MUMMY_ZONE_MARGIN = 0.75;
const MUMMY_MAX_SPEED = 3.0;
// Flat top of `A4C_Tombs`, measured with a downward raycast at 0.1 m steps.
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

function round(value: number): number {
	return Math.round(value * 1000) / 1000;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function horizontalDistance(ax: number, az: number, bx: number, bz: number): number {
	return Math.hypot(ax - bx, az - bz);
}

function zoneOf(zone: Mg2Zone): ZoneRectangle {
	return ZONE_RECTANGLES.find((rectangle) => rectangle.zone === zone) ?? ZONE_RECTANGLES[0];
}

function insideZone(rectangle: ZoneRectangle, x: number, z: number): boolean {
	return x >= rectangle.minX && x <= rectangle.maxX && z >= rectangle.minZ && z <= rectangle.maxZ;
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

export type CryptDeps = {
	/** Asks the client to leave the crypt room (round over, or the player died out). */
	moveToLobby: (playerId: string) => void;
};

export class Crypt {
	private phase: Mg2Phase = 'idle';
	private endsAt: number | null = null;
	private depositedTotal = 0;
	/** Ronda actual; la completación se acredita una vez por ronda. */
	private matchId: string | null = null;
	private nextStateAt = 0;
	private stateDirty = false;

	private readonly players = new Map<string, RoomPlayer>();
	private skulls: RoomSkull[] = [];
	private mummies: RoomMummy[] = [];
	private lastMummiesReportAt = 0;

	constructor(
		private readonly port: RoomPort,
		private readonly deps: CryptDeps
	) {}

	private publish(message: ServerMessage): void {
		this.port.broadcast(message);
	}

	private emitEvent(kind: Mg2EventKind, now: number, extra: Partial<Mg2Event> = {}): void {
		const event: Mg2Event = { kind, at: now, ...extra };
		this.publish({ type: 'mg2-event', event });
	}

	private static copyPlayer(player: RoomPlayer): Mg2PlayerState {
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

	buildSnapshot(now: number): Mg2Snapshot {
		return {
			phase: this.phase,
			endsAt: this.endsAt,
			serverTime: now,
			depositedTotal: this.depositedTotal,
			mummyDriverId: this.mummyDriverId(),
			players: [...this.players.values()].map(Crypt.copyPlayer),
			skulls: this.skulls.map((skull) => ({
				id: skull.id,
				zone: skull.zone,
				x: round(skull.x),
				y: round(skull.y),
				z: round(skull.z),
				state: skull.state,
				carrierId: skull.carrierId
			})),
			mummies: this.mummies.map((mummy) => ({
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

	private broadcastState(now: number): void {
		this.stateDirty = false;
		this.nextStateAt = now + 1000;
		this.publish({ type: 'mg2-state', state: this.buildSnapshot(now) });
	}

	private broadcastPositions(now: number): void {
		const state = this.buildSnapshot(now);

		this.publish({
			type: 'mg2-positions',
			at: now,
			players: state.players.map(({ id, x, y, z, yaw, alive }) => ({
				id,
				x,
				y,
				z,
				yaw,
				alive
			})),
			mummies: this.mummies.map<Mg2MummyPosition>((mummy) => ({
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

	/** Snapshot sent to a client right after it joins the crypt. */
	snapshot(now = Date.now()): Mg2Snapshot {
		return this.buildSnapshot(now);
	}

	private clearRound(): void {
		this.skulls = [];
		this.mummies = [];
		this.depositedTotal = 0;
		this.matchId = null;
	}

	resetRoom(): void {
		this.phase = 'idle';
		this.endsAt = null;
		this.clearRound();
		this.players.clear();
		this.stateDirty = false;
	}

	private startCountdown(now: number): void {
		this.phase = 'countdown';
		this.endsAt = now + COUNTDOWN_MS;
		this.clearRound();
		this.stateDirty = true;
	}

	private startRound(now: number): void {
		this.phase = 'playing';
		this.endsAt = now + ROUND_MS;
		this.matchId = newMatchId();

		this.skulls = SKULL_DEFINITIONS.map((definition) => ({
			...definition,
			state: 'available',
			carrierId: null,
			pickupAfter: 0
		}));

		this.mummies = MUMMY_DEFINITIONS.map((definition) => ({
			id: definition.id,
			zone: definition.zone,
			x: definition.spawn.x,
			y: MUMMY_FLOOR_Y,
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

		for (const player of this.players.values()) {
			player.carried = [];
			player.deposited = 0;
			player.hp = MAX_HEALTH;
			player.maxHp = MAX_HEALTH;
			player.hurtUntil = 0;
			player.lastHurtAt = 0;
			player.lastRegenAt = now;
			player.stunReadyAt = 0;
		}

		this.emitEvent('round-start', now);
		this.stateDirty = true;
	}

	private finish(result: 'won' | 'lost', now: number): void {
		if (this.phase !== 'playing') {
			return;
		}

		this.phase = result;
		this.endsAt = now + RESULT_MS;
		this.emitEvent(result === 'won' ? 'round-won' : 'round-lost', now);
		this.stateDirty = true;

		if (result === 'won' && this.matchId) {
			void attestAll(this.players.keys(), {
				source: 'crypt',
				matchId: this.matchId,
				metric: 'crypt.completed',
				eventKey: 'won'
			});
		}
	}

	private endRound(now: number): void {
		const ids = [...this.players.keys()];

		this.resetRoom();
		this.broadcastState(now);

		for (const id of ids) {
			this.deps.moveToLobby(id);
		}
	}

	private releaseSkulls(player: RoomPlayer, now: number): void {
		for (const skullId of player.carried) {
			const skull = this.skulls.find((item) => item.id === skullId);

			if (!skull) {
				continue;
			}

			skull.state = 'dropped';
			skull.carrierId = null;
			skull.x = player.x;
			skull.y = player.y + 1.0;
			skull.z = player.z;
			skull.pickupAfter = now + DROP_COOLDOWN_MS;
			this.emitEvent('skull-dropped', now, { playerId: player.id, skullId: skull.id });
		}

		player.carried = [];
		this.stateDirty = true;
	}

	private killPlayer(player: RoomPlayer, now: number): void {
		if (!player.alive) {
			return;
		}

		player.alive = false;
		player.hp = 0;
		player.respawnAt = now + DEATH_MS;
		this.releaseSkulls(player, now);
		this.emitEvent('player-died', now, { playerId: player.id });
		this.stateDirty = true;
	}

	/**
	 * Mummy contact drains health instead of killing instantly. Each hit has a
	 * short immunity window so a mummy standing on top of a player cannot empty
	 * their bar in a single tick. Reaching 0 HP uses the old death flow.
	 */
	private damagePlayer(player: RoomPlayer, amount: number, now: number): void {
		if (!player.alive || now < player.hurtUntil) {
			return;
		}

		player.hp = Math.max(0, player.hp - amount);
		player.hurtUntil = now + DAMAGE_COOLDOWN_MS;
		player.lastHurtAt = now;
		player.lastRegenAt = now;

		this.emitEvent('player-hurt', now, {
			playerId: player.id,
			amount,
			hp: Math.round(player.hp)
		});
		this.stateDirty = true;

		if (player.hp <= 0) {
			this.killPlayer(player, now);
		}
	}

	/** Health regenerates after a few seconds without mummy contact. */
	private updateRegen(now: number): void {
		for (const player of this.players.values()) {
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

			if (dt <= 0) {
				continue;
			}

			player.hp = Math.min(player.maxHp, player.hp + REGEN_PER_SECOND * dt);
		}
	}

	/**
	 * A paper roll thrown by `playerId` hit `mummyId`. The client detects the
	 * collision (the rolls are simulated locally) and the server validates the
	 * player, the mummy, the distance and the rate before stunning it.
	 */
	onStun(playerId: string, mummyId: string, now = Date.now()): void {
		if (this.phase !== 'playing') {
			return;
		}

		const player = this.players.get(playerId);
		const mummy = this.mummies.find((item) => item.id === mummyId);

		if (!player || !player.alive || !mummy) {
			return;
		}

		if (now < player.stunReadyAt) {
			return;
		}

		if (horizontalDistance(player.x, player.z, mummy.x, mummy.z) > STUN_MAX_DISTANCE) {
			return;
		}

		player.stunReadyAt = now + STUN_RATE_MS;
		mummy.state = 'stunned';
		mummy.stunUntil = now + STUN_MS;
		mummy.cooldownUntil = 0;
		mummy.goalX = mummy.x;
		mummy.goalZ = mummy.z;

		this.emitEvent('mummy-stunned', now, { playerId, mummyId });
		this.stateDirty = true;
	}

	/**
	 * Player that simulates the mummies with their physics capsule and reports
	 * their positions: the first one in insertion order.
	 */
	mummyDriverId(): string | null {
		for (const player of this.players.values()) {
			return player.id;
		}

		return null;
	}

	/**
	 * The driver reports the real physical position of the mummies (collisions
	 * included). Rate, range and maximum speed are validated: mummies are never
	 * teleported.
	 */
	onMummiesReport(playerId: string, report: ReadonlyArray<Mg2MummyReport>, now = Date.now()): void {
		if (playerId !== this.mummyDriverId()) {
			return;
		}

		if (now - this.lastMummiesReportAt < 50) {
			return;
		}

		this.lastMummiesReportAt = now;

		for (const entry of report) {
			const mummy = this.mummies.find((item) => item.id === entry.id);

			if (!mummy) {
				continue;
			}

			if (!Number.isFinite(entry.x) || !Number.isFinite(entry.z)) {
				continue;
			}

			const rectangle = zoneOf(mummy.zone);
			const x = clamp(
				entry.x,
				rectangle.minX - MUMMY_ZONE_MARGIN,
				rectangle.maxX + MUMMY_ZONE_MARGIN
			);
			const z = clamp(
				entry.z,
				rectangle.minZ - MUMMY_ZONE_MARGIN,
				rectangle.maxZ + MUMMY_ZONE_MARGIN
			);

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
	 * Mummy brain: it does not move them (the driver's physics does). It only
	 * picks a goal, advances waypoints with the reported position, turns toward
	 * the goal and kills with the real position.
	 */
	private updateMummies(now: number): void {
		for (const mummy of this.mummies) {
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

			for (const player of this.players.values()) {
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
					this.damagePlayer(target, MUMMY_DAMAGE, now);
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
					// clear the driver gets there; if not, they slide as far as they can.
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

	private updatePickups(now: number): void {
		for (const skull of this.skulls) {
			if (skull.state !== 'available' && skull.state !== 'dropped') continue;
			if (now < skull.pickupAfter) continue;

			let nearest: RoomPlayer | null = null;
			let nearestDistance = PICKUP_RADIUS;

			for (const player of this.players.values()) {
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
			this.emitEvent('skull-picked', now, { playerId: nearest.id, skullId: skull.id });
			this.stateDirty = true;
		}
	}

	private processRespawns(now: number): void {
		for (const player of [...this.players.values()]) {
			if (player.alive || player.respawnAt === null) continue;
			if (now < player.respawnAt) continue;

			this.players.delete(player.id);
			this.deps.moveToLobby(player.id);

			if (this.players.size === 0 && this.phase !== 'idle') {
				this.resetRoom();
				return;
			}

			this.stateDirty = true;
		}
	}

	onEnter(playerId: string, name: string, now = Date.now()): void {
		if (this.players.has(playerId)) {
			return;
		}

		// The first player enters through the center of the nave; whoever arrives
		// with a round already in progress appears on the lower landing.
		const spawn =
			this.phase === 'countdown' || this.phase === 'playing' ? MG2_STAIR_SPAWN : MG2_CRYPT_SPAWN;

		this.players.set(playerId, {
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

		if (this.phase === 'idle') {
			this.startCountdown(now);
		}

		this.emitEvent('player-joined', now, { playerId });
		this.stateDirty = true;
		this.broadcastState(now);
	}

	onLeave(playerId: string, now = Date.now()): void {
		const player = this.players.get(playerId);

		if (!player) {
			return;
		}

		this.releaseSkulls(player, now);
		this.players.delete(playerId);
		this.emitEvent('player-left', now, { playerId });

		if (this.players.size === 0) {
			this.resetRoom();
		}

		this.stateDirty = true;
		this.broadcastState(now);
	}

	onPosition(
		playerId: string,
		x: number,
		y: number,
		z: number,
		yaw: number,
		now = Date.now()
	): void {
		const player = this.players.get(playerId);

		if (!player || !player.alive) {
			return;
		}

		// Per-player rate limit (1 s sliding window).
		if (now - player.rateWindowStart >= 1000) {
			player.rateWindowStart = now;
			player.rateCount = 0;
		}

		player.rateCount += 1;

		if (player.rateCount > MAX_POSITION_RATE) {
			return;
		}

		const nextX = clamp(x, CRYPT_BOUNDS.minX, CRYPT_BOUNDS.maxX);
		const nextY = clamp(y, CRYPT_BOUNDS.minY, CRYPT_BOUNDS.maxY);
		const nextZ = clamp(z, CRYPT_BOUNDS.minZ, CRYPT_BOUNDS.maxZ);

		if (player.lastPositionAt > 0) {
			const dt = Math.max(0.001, (now - player.lastPositionAt) / 1000);
			// Small tolerance for network jitter; it never allows exceeding the
			// controller's 8 m/s in a sustained way.
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

	onDeposit(playerId: string, now = Date.now()): void {
		const player = this.players.get(playerId);

		if (this.phase !== 'playing' || !player || !player.alive || player.carried.length === 0) {
			return;
		}

		const distance = horizontalDistance(player.x, player.z, MG2_DEPOSIT.x, MG2_DEPOSIT.z);
		const vertical = Math.abs(player.y - MG2_CRYPT_SPAWN.y);

		if (distance > MG2_DEPOSIT.radius || vertical > MG2_DEPOSIT.maxDy) {
			return;
		}

		for (const skullId of player.carried) {
			const skull = this.skulls.find((item) => item.id === skullId);

			if (!skull) continue;

			skull.state = 'deposited';
			skull.carrierId = null;
			skull.x = MG2_DEPOSIT.x;
			skull.y = -6.9;
			skull.z = MG2_DEPOSIT.z;
			this.depositedTotal += 1;
			this.emitEvent('skull-deposited', now, { playerId, skullId });
		}

		player.deposited += player.carried.length;
		player.carried = [];
		this.stateDirty = true;

		if (this.depositedTotal >= SKULL_DEFINITIONS.length) {
			this.finish('won', now);
		}

		this.broadcastState(now);
	}

	tick(now = Date.now()): void {
		try {
			if (this.phase === 'idle') {
				return;
			}

			if (this.endsAt !== null && now >= this.endsAt) {
				if (this.phase === 'countdown') {
					this.startRound(now);
				} else if (this.phase === 'playing') {
					this.finish('lost', now);
				} else {
					this.endRound(now);
					return;
				}
			}

			if (this.phase === 'playing') {
				this.updateMummies(now);
				this.updatePickups(now);
				this.updateRegen(now);
				this.processRespawns(now);
			}

			if (this.phase === 'playing' || this.phase === 'countdown') {
				this.broadcastPositions(now);
			}

			if (this.phase === 'won' || this.phase === 'lost') {
				this.processRespawns(now);
			}

			if (this.stateDirty || now >= this.nextStateAt) {
				this.broadcastState(now);
			}
		} catch (error) {
			console.error('[mg2] tick error:', error);
			this.publish({
				type: 'error',
				code: 'MG2_ROOM_ERROR',
				message: 'The crypt room was restarted due to an internal error'
			});
			this.resetRoom();
			this.broadcastState(now);
		}
	}

	/** The crypt is co-op and has no player cap: late joiners are welcome. */
	canEnter(_playerId: string): { ok: true } | { ok: false; code: string; message: string } {
		return { ok: true };
	}

	get phaseName(): Mg2Phase {
		return this.phase;
	}

	get playerCount(): number {
		return this.players.size;
	}

	debugState(): {
		phase: Mg2Phase;
		players: number;
		skulls: number;
		mummies: number;
		depositedTotal: number;
	} {
		return {
			phase: this.phase,
			players: this.players.size,
			skulls: this.skulls.length,
			mummies: this.mummies.length,
			depositedTotal: this.depositedTotal
		};
	}
}
