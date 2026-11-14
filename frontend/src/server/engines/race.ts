import type {
	Player,
	RaceCarStateReport,
	RaceEvent,
	RaceEventKind,
	RaceItemState,
	RaceMineState,
	RaceMissileState,
	RaceModel,
	RacePhase,
	RacePlayerState,
	RacePosition,
	RacePower,
	RaceSnapshot,
	RaceStatus,
	ServerMessage
} from '../protocol';
import type { RoomPort } from '../port';
import { GRAND_PRIX_TRACK, type RaceTrackConfig } from './raceTracks';

/**
 * Authoritative engine for `minigame-3`: a 5-lap Grand Prix on `TWN_Track`.
 *
 * One instance per race room. The client simulates its own car and reports
 * position/rotation/velocity; this engine validates the report and decides
 * phases, laps, checkpoints, item boxes, powers, damage, missiles, mines, rays,
 * respawns and the final classification.
 *
 * Old `backend/src/ws/race.ts` kept every piece of state at module level and
 * published to the `lobby:minigame-3` topic. Here it is a class: the room owns
 * the instance, and `port.broadcast` is the room broadcast.
 */

export const RACE_MAX_PLAYERS = 6;
export const TOTAL_LAPS = 5;
export const COUNTDOWN_MS = 30_000;
export const COUNTDOWN_FULL_MS = 10_000;
export const RESULT_MS = 15_000;
/**
 * Once the first pilot crosses the line the race gets a short closing window
 * instead of waiting for every lagging/stopped car until `RACE_MAX_MS`.
 */
export const FINISH_WINDOW_MS = 15_000;
export const RACE_MAX_MS = 480_000;
export const RESPAWN_MS = 3_000;
export const RESET_COOLDOWN_MS = 2_000;
export const MAX_SPEED = 55;
export const MIN_LAP_MS = 10_000;
export const MIN_GATE_MS = 500;
/** Minimum time between two "checkpoint missed" hints for the same pilot. */
export const GATE_MISS_MS = 4_000;
export const ITEM_RESPAWN_MS = 5_000;
export const ITEM_PICKUP_RADIUS = 3.5;
export const MAX_HEALTH = 100;
export const MISSILE_DAMAGE = 30;
export const MISSILE_RANGE = 60;
export const MISSILE_FLIGHT_MS = 1_200;
export const NITRO_MS = 3_000;
export const AUTO_REPAIR_MS = 5_000;
export const AUTO_REPAIR_RATE = 10;
export const SHIELD_MS = 4_000;
export const REPAIR_HP = 35;
export const MINE_DAMAGE = 30;
export const MINE_RADIUS = 2.6;
export const MINE_ARM_MS = 1_000;
export const MINE_LIFETIME_MS = 20_000;
export const MINE_MAX = 6;
export const MINE_OFFSET = 2.2;
export const RAY_DAMAGE = 25;
export const RAY_RANGE = 60;

export const TRACK_CENTER = { x: 0.1056, z: 0 } as const;
export const TRACK_CENTER_RADIUS = 93.0;
export const TRACK_SURFACE_Y = 0.02;
export const CHASSIS_SPAWN_Y = 1.1;
export const GATE_INNER_RADIUS = 86.5;
export const GATE_OUTER_RADIUS = 99.5;
export const OFF_TRACK_INNER = 84;
export const OFF_TRACK_OUTER = 102;

export const TRACK_EXIT = { x: 83.0, y: 0.05, z: -3.0 } as const;

export type RaceSlot = { x: number; y: number; z: number };

/** 6 grid slots, 3 columns × 2 rows, nose pointing +Z. */
export const RACE_GRID: readonly RaceSlot[] = [
	{ x: 89.5, y: CHASSIS_SPAWN_Y, z: -4.5 },
	{ x: 93.5, y: CHASSIS_SPAWN_Y, z: -4.5 },
	{ x: 97.5, y: CHASSIS_SPAWN_Y, z: -4.5 },
	{ x: 89.5, y: CHASSIS_SPAWN_Y, z: -11.0 },
	{ x: 93.5, y: CHASSIS_SPAWN_Y, z: -11.0 },
	{ x: 97.5, y: CHASSIS_SPAWN_Y, z: -11.0 }
];

export const GRID_YAW = -Math.PI / 2;

export const RACE_MODELS: readonly RaceModel[] = [
	'coche_calabaza',
	'coche_momia',
	'coche_halloween'
];

const POWER_WEIGHTS: readonly { power: RacePower; weight: number }[] = [
	{ power: 'nitro', weight: 25 },
	{ power: 'missile', weight: 20 },
	{ power: 'mine', weight: 15 },
	{ power: 'repair', weight: 15 },
	{ power: 'ray', weight: 10 },
	{ power: 'auto', weight: 10 },
	{ power: 'shield', weight: 5 }
];

const POWER_TOTAL_WEIGHT = POWER_WEIGHTS.reduce((total, entry) => total + entry.weight, 0);

export type RaceDeps = {
	/**
	 * Asks the client to leave this room and go back to the outdoor hub. The old
	 * backend did this by unsubscribing the socket from the race topic; a room
	 * cannot move a player, so the client performs the leave.
	 */
	moveToLobby: (playerId: string) => void;
	/** Optional structured logger; race telemetry shows up in `rundot rooms logs`. */
	log?: (event: string, data: Record<string, unknown>) => void;
};

type RoomPlayer = {
	id: string;
	name: string;
	model: RaceModel;
	slot: number;
	status: RaceStatus;
	lap: number;
	gate: number;
	/** Gate the server expects next (0 = finish line after the lap). */
	expectedGate: number;
	startedLap: boolean;
	lapStartedAt: number;
	rank: number;
	health: number;
	item: RacePower | null;
	shieldUntil: number;
	nitroUntil: number;
	autoRepairUntil: number;
	finishAt: number | null;
	x: number;
	y: number;
	z: number;
	yaw: number;
	speed: number;
	steering: number;
	previousX: number;
	previousZ: number;
	lastPositionAt: number;
	lastGateAt: number;
	/** Throttles the "you missed a checkpoint" hint. */
	lastGateMissAt: number;
	lastImpactAt: number;
	lastResetAt: number;
	respawnAt: number | null;
	/** Where the car exploded; used to respawn in place after destruction. */
	deathX: number | null;
	deathZ: number | null;
	deathYaw: number | null;
	/** Increments on every respawn/reset so clients can hard-snap the body. */
	respawnSeq: number;
	offTrackSince: number;
	rateWindowStart: number;
	rateCount: number;
};

type RoomItem = {
	id: string;
	x: number;
	y: number;
	z: number;
	respawnAt: number | null;
};

type RoomMissile = {
	id: string;
	fromPlayerId: string;
	targetPlayerId: string | null;
	from: { x: number; y: number; z: number };
	to: { x: number; y: number; z: number };
	firedAt: number;
	hitAt: number;
};

type RoomMine = {
	id: string;
	ownerId: string;
	x: number;
	y: number;
	z: number;
	placedAt: number;
	armedAt: number;
	expiresAt: number;
};

/** Distance a blocked respawn is pushed backwards along the race tangent. */
const RESPAWN_SHIFT = 3;
/** A gate is considered occupied when another racer is this close to it. */
const RESPAWN_CLEAR_RADIUS = 4;

function round(value: number): number {
	return Math.round(value * 1000) / 1000;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function horizontalDistance(ax: number, az: number, bx: number, bz: number): number {
	return Math.hypot(ax - bx, az - bz);
}

function trackRadius(x: number, z: number): number {
	return Math.hypot(x - TRACK_CENTER.x, z - TRACK_CENTER.z);
}

function gateAngle(index: number): number {
	return (index * Math.PI) / 4;
}

function gatePoint(index: number, radius = TRACK_CENTER_RADIUS): { x: number; z: number } {
	const angle = gateAngle(index);

	return {
		x: TRACK_CENTER.x + radius * Math.cos(angle),
		z: TRACK_CENTER.z + radius * Math.sin(angle)
	};
}

/** Yaw for a car whose local forward axis is +X to face the rising θ tangent. */
function yawForAngle(angle: number): number {
	return Math.atan2(-Math.cos(angle), -Math.sin(angle));
}

function yawFromQuaternion(qx: number, qy: number, qz: number, qw: number): number {
	return Math.atan2(2 * (qw * qy + qx * qz), 1 - 2 * (qy * qy + qx * qx));
}

function segmentIntersection(
	ax: number,
	az: number,
	bx: number,
	bz: number,
	cx: number,
	cz: number,
	dx: number,
	dz: number
): { t: number; u: number } | null {
	const rX = bx - ax;
	const rZ = bz - az;
	const sX = dx - cx;
	const sZ = dz - cz;
	const denominator = rX * sZ - rZ * sX;

	if (Math.abs(denominator) < 1e-9) {
		return null;
	}

	const t = ((cx - ax) * sZ - (cz - az) * sX) / denominator;
	const u = ((cx - ax) * rZ - (cz - az) * rX) / denominator;

	if (t < 0 || t > 1 || u < 0 || u > 1) {
		return null;
	}

	return { t, u };
}

function distancePointToSegment(
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

	if (lengthSquared < 1e-6) {
		return Math.hypot(px - ax, pz - az);
	}

	const t = clamp(((px - ax) * dx + (pz - az) * dz) / lengthSquared, 0, 1);

	return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

function rollPower(): RacePower {
	let roll = Math.random() * POWER_TOTAL_WEIGHT;

	for (const entry of POWER_WEIGHTS) {
		roll -= entry.weight;

		if (roll <= 0) {
			return entry.power;
		}
	}

	return POWER_WEIGHTS[0].power;
}

export class Race {
	private phase: RacePhase = 'idle';
	private endsAt: number | null = null;
	private startedAt: number | null = null;
	private winnerId: string | null = null;
	private countdownShortened = false;
	private stateDirty = false;
	private nextStateAt = 0;
	private nextPositionsAt = 0;
	private missileSeq = 0;
	private mineSeq = 0;
	private tickCount = 0;
	private lastTickLogAt = 0;
	private rxAccepted = 0;
	private rxRejected = 0;
	private lastRxLogAt = 0;
	private lastRejectReason = '';

	private readonly players = new Map<string, RoomPlayer>();
	private items: RoomItem[] = [];
	private missiles: RoomMissile[] = [];
	private mines: RoomMine[] = [];

	constructor(
		private readonly port: RoomPort,
		private readonly deps: RaceDeps,
		private readonly track: RaceTrackConfig = GRAND_PRIX_TRACK
	) {
		this.resetRoom();
	}

	private log(event: string, data: Record<string, unknown> = {}): void {
		this.deps.log?.(event, data);
	}

	private logRejection(playerId: string, reason: string, now: number): void {
		this.rxRejected += 1;
		this.lastRejectReason = reason;

		if (now - this.lastRxLogAt < 2000) {
			return;
		}

		this.lastRxLogAt = now;
		this.log('race state rejected', {
			playerId,
			reason,
			phase: this.phase,
			rejected: this.rxRejected,
			accepted: this.rxAccepted
		});
		this.rxRejected = 0;
	}

	private publish(message: ServerMessage): void {
		this.port.broadcast(message);
	}

	private emitEvent(kind: RaceEventKind, now: number, extra: Partial<RaceEvent> = {}): void {
		const event: RaceEvent = { kind, at: now, ...extra };
		this.publish({ type: 'race-event', event });
	}

	resetRoom(): void {
		this.phase = 'idle';
		this.endsAt = null;
		this.startedAt = null;
		this.winnerId = null;
		this.countdownShortened = false;
		this.stateDirty = false;
		this.nextStateAt = 0;
		this.nextPositionsAt = 0;
		this.missileSeq = 0;
		this.mineSeq = 0;
		this.tickCount = 0;
		this.rxAccepted = 0;
		this.rxRejected = 0;
		this.lastRxLogAt = 0;
		this.lastRejectReason = '';
		this.players.clear();
		this.items = [];
		this.missiles = [];
		this.mines = [];
	}

	private resetItems(): void {
		this.items = this.track.items.map((position, index) => ({
			id: `item-${index}`,
			x: position.x,
			y: position.y,
			z: position.z,
			respawnAt: null
		}));
	}

	private static emptyPlayer(
		player: Player,
		slot: number,
		model: RaceModel,
		now: number,
		track: RaceTrackConfig
	): RoomPlayer {
		const spawn = track.grid[slot] ?? track.grid[0];

		return {
			id: player.id,
			name: player.name,
			model,
			slot,
			status: 'grid',
			lap: 0,
			gate: 0,
			expectedGate: 0,
			startedLap: false,
			lapStartedAt: now,
			rank: slot + 1,
			health: MAX_HEALTH,
			item: null,
			shieldUntil: 0,
			nitroUntil: 0,
			autoRepairUntil: 0,
			finishAt: null,
			x: spawn.x,
			y: spawn.y,
			z: spawn.z,
			yaw: spawn.yaw,
			speed: 0,
			steering: 0,
			previousX: spawn.x,
			previousZ: spawn.z,
			lastPositionAt: 0,
			lastGateAt: 0,
			lastGateMissAt: 0,
			lastImpactAt: 0,
			lastResetAt: 0,
			respawnAt: null,
			deathX: null,
			deathZ: null,
			deathYaw: null,
			respawnSeq: 0,
			offTrackSince: 0,
			rateWindowStart: now,
			rateCount: 0
		};
	}

	canEnter(_playerId: string): { ok: true } | { ok: false; code: string; message: string } {
		if (this.phase === 'playing' || this.phase === 'results') {
			return {
				ok: false,
				code: 'RACE_IN_PROGRESS',
				message: `The ${this.track.name} has already started`
			};
		}

		if (this.players.size >= this.track.maxPlayers) {
			return {
				ok: false,
				code: 'RACE_FULL',
				message: `The ${this.track.name} is full (${this.track.maxPlayers}/${this.track.maxPlayers})`
			};
		}

		return { ok: true };
	}

	onEnter(player: Player, now = Date.now()): void {
		if (this.players.has(player.id)) {
			return;
		}

		const check = this.canEnter(player.id);

		if (!check.ok) {
			this.port.sendTo(player.id, {
				type: 'error',
				code: check.code,
				message: check.message
			});
			return;
		}

		const used = new Set([...this.players.values()].map((entry) => entry.slot));
		const free: number[] = [];

		for (let slot = 0; slot < this.track.maxPlayers; slot += 1) {
			if (!used.has(slot)) {
				free.push(slot);
			}
		}

		const slot = free[Math.floor(Math.random() * free.length)] ?? 0;
		const model = RACE_MODELS[Math.floor(Math.random() * RACE_MODELS.length)] ?? RACE_MODELS[0];

		this.players.set(player.id, Race.emptyPlayer(player, slot, model, now, this.track));
		this.log('race pilot entered', {
			playerId: player.id,
			slot,
			phase: this.phase,
			players: this.players.size
		});

		if (this.phase === 'idle') {
			this.phase = 'countdown';
			this.endsAt = now + COUNTDOWN_MS;
			this.countdownShortened = false;
			this.resetItems();
		}

		this.maybeShortenCountdown(now);

		this.emitEvent('player-joined', now, { playerId: player.id });
		this.stateDirty = true;
		this.broadcastState(now);
	}

	private maybeShortenCountdown(now: number): void {
		if (this.phase !== 'countdown' || this.countdownShortened) {
			return;
		}

		if (this.players.size < this.track.maxPlayers) {
			return;
		}

		this.countdownShortened = true;

		const target = now + COUNTDOWN_FULL_MS;

		if (this.endsAt === null || this.endsAt > target) {
			this.endsAt = target;
		}

		this.emitEvent('countdown-shortened', now);
		this.stateDirty = true;
	}

	onLeave(playerId: string, now = Date.now()): void {
		const player = this.players.get(playerId);

		if (!player) {
			return;
		}

		this.players.delete(playerId);
		this.missiles = this.missiles.filter(
			(missile) => missile.fromPlayerId !== playerId && missile.targetPlayerId !== playerId
		);
		this.mines = this.mines.filter((mine) => mine.ownerId !== playerId);

		this.emitEvent('player-left', now, { playerId });

		if (this.players.size === 0) {
			this.resetRoom();
			this.broadcastState(now);
			return;
		}

		this.recomputeRanking(now);
		this.stateDirty = true;
		this.broadcastState(now);
	}

	onCarState(playerId: string, report: RaceCarStateReport, now = Date.now()): void {
		const player = this.players.get(playerId);

		if (!player) {
			this.logRejection(playerId, 'unknown-player', now);
			return;
		}

		if (this.phase !== 'playing') {
			this.logRejection(playerId, `phase:${this.phase}`, now);
			return;
		}

		if (player.status !== 'racing') {
			this.logRejection(playerId, `status:${player.status}`, now);
			return;
		}

		// Sliding 1 s window.
		if (now - player.rateWindowStart >= 1000) {
			player.rateWindowStart = now;
			player.rateCount = 0;
		}

		player.rateCount += 1;

		if (player.rateCount > 20) {
			this.logRejection(playerId, 'rate-limit', now);
			return;
		}

		const values = [
			report.x,
			report.y,
			report.z,
			report.qx,
			report.qy,
			report.qz,
			report.qw,
			report.vx,
			report.vy,
			report.vz,
			report.speed,
			report.steering
		];

		if (values.some((value) => !Number.isFinite(value))) {
			this.logRejection(playerId, 'not-finite', now);
			return;
		}

		if (Math.abs(report.x) > 1000 || Math.abs(report.z) > 1000) {
			this.logRejection(playerId, 'coords-out-of-range', now);
			return;
		}

		if (report.y < -80 || report.y > 50) {
			this.logRejection(playerId, 'y-out-of-range', now);
			return;
		}

		const speed = Math.abs(report.speed);

		if (speed > MAX_SPEED + 0.5) {
			this.logRejection(playerId, `speed:${speed.toFixed(1)}`, now);
			return;
		}

		const quaternionNorm = Math.hypot(report.qx, report.qy, report.qz, report.qw);

		if (quaternionNorm < 0.1 || quaternionNorm > 10) {
			this.logRejection(playerId, 'quaternion', now);
			return;
		}

		if (player.lastPositionAt > 0) {
			const dt = Math.max(0.001, (now - player.lastPositionAt) / 1000);
			const allowed = 60 * dt + 2;
			const travelled = Math.hypot(report.x - player.x, report.y - player.y, report.z - player.z);

			if (travelled > allowed) {
				this.logRejection(playerId, `travelled:${travelled.toFixed(1)}>${allowed.toFixed(1)}`, now);
				return;
			}
		}

		player.previousX = player.x;
		player.previousZ = player.z;
		player.x = report.x;
		player.y = report.y;
		player.z = report.z;
		player.yaw = yawFromQuaternion(report.qx, report.qy, report.qz, report.qw);
		player.speed = speed;
		player.steering = clamp(report.steering, -1, 1);
		player.lastPositionAt = now;

		this.rxAccepted += 1;

		if (now - this.lastRxLogAt >= 2000) {
			this.lastRxLogAt = now;
			this.log('race state accepted', {
				playerId,
				accepted: this.rxAccepted,
				x: round(player.x),
				z: round(player.z),
				speed: round(player.speed),
				lastReject: this.lastRejectReason || null
			});
			this.rxAccepted = 0;
			this.rxRejected = 0;
			this.lastRejectReason = '';
		}

		this.processGates(player, now);
		this.processItems(player, now);
		this.processOffTrack(player, now);

		this.stateDirty = true;
	}

	private processGates(player: RoomPlayer, now: number): void {
		const gate = player.expectedGate;

		if (now - player.lastGateAt < MIN_GATE_MS) {
			return;
		}

		if (this.track.gateMode === 'radius') {
			this.processRadiusGate(player, gate, now);

			if (player.expectedGate === gate) {
				const next = (gate + 1) % this.track.gates.length;

				// Reaching the checkpoint after the one still required means a
				// corner was cut: that gate cannot be recovered by driving on, so
				// warn the pilot instead of losing the lap in silence.
				this.warnGateMiss(player, next, gate, now);

				// The finish line is gate 0. Arriving there with checkpoints
				// pending never counts a lap; say so while the car is still on the
				// line. `player.gate >= 1` skips the initial start crossing.
				if (gate !== 0 && next !== 0 && player.gate >= 1) {
					this.warnGateMiss(player, 0, gate, now);
				}
			}

			return;
		}

		const angle = gateAngle(gate);
		const inner = gatePoint(gate, GATE_INNER_RADIUS);
		const outer = gatePoint(gate, GATE_OUTER_RADIUS);
		const hit = segmentIntersection(
			player.previousX,
			player.previousZ,
			player.x,
			player.z,
			inner.x,
			inner.z,
			outer.x,
			outer.z
		);

		if (!hit) {
			return;
		}

		// Only crossings in the race direction (rising θ) count.
		const tangentX = -Math.sin(angle);
		const tangentZ = Math.cos(angle);
		const moveX = player.x - player.previousX;
		const moveZ = player.z - player.previousZ;

		if (moveX * tangentX + moveZ * tangentZ <= 0) {
			return;
		}

		player.lastGateAt = now;
		this.completeGate(player, gate, now);
	}

	/**
	 * Proximity checkpoint used by tracks that are not a perfect ring.
	 *
	 * The distance is measured against the whole movement segment rather than
	 * only the latest report: at 10 Hz a fast car can cross a checkpoint
	 * between two reports and the old endpoint test missed it. `expectedGate`
	 * advances after a hit, so sitting inside the radius cannot count twice.
	 */
	private processRadiusGate(player: RoomPlayer, gate: number, now: number): void {
		const target = this.track.gates[gate];

		if (!target) {
			return;
		}

		const distance = distancePointToSegment(
			target.x,
			target.z,
			player.previousX,
			player.previousZ,
			player.x,
			player.z
		);

		if (distance > target.radius) {
			return;
		}

		player.lastGateAt = now;
		this.completeGate(player, gate, now);
	}

	/**
	 * Warns the pilot when the movement segment enters `targetGate` while
	 * `requiredGate` is still pending. Throttled so a car parked on a gate does
	 * not flood the room.
	 */
	private warnGateMiss(
		player: RoomPlayer,
		targetGate: number,
		requiredGate: number,
		now: number
	): void {
		if (now - player.lastGateMissAt < GATE_MISS_MS) {
			return;
		}

		const target = this.track.gates[targetGate];

		if (!target) {
			return;
		}

		const distance = distancePointToSegment(
			target.x,
			target.z,
			player.previousX,
			player.previousZ,
			player.x,
			player.z
		);

		if (distance > target.radius) {
			return;
		}

		player.lastGateMissAt = now;
		this.log('race gate missed', {
			playerId: player.id,
			requiredGate,
			targetGate,
			lap: player.lap
		});
		this.emitEvent('gate-missed', now, {
			playerId: player.id,
			gate: requiredGate,
			lap: player.lap
		});
	}

	private completeGate(player: RoomPlayer, gate: number, now: number): void {
		const gateCount = this.track.gates.length;

		if (gate === 0) {
			if (!player.startedLap) {
				player.startedLap = true;
				player.lap = 0;
				player.gate = 0;
				player.expectedGate = 1;
				player.lapStartedAt = now;
				this.log('race gate passed', {
					playerId: player.id,
					gate: 0,
					lap: 0,
					nextGate: player.expectedGate,
					start: true
				});
				this.emitEvent('gate-passed', now, { playerId: player.id, gate: 0, lap: 0 });
				this.stateDirty = true;
				return;
			}

			if (now - player.lapStartedAt < MIN_LAP_MS) {
				return;
			}

			player.lap += 1;
			player.gate = 0;
			player.expectedGate = 1;

			if (player.lap >= this.track.totalLaps) {
				player.lap = this.track.totalLaps;
				player.status = 'finished';
				player.finishAt = now;
				player.expectedGate = 0;
				player.item = null;
				player.speed = 0;
				const firstFinish = this.winnerId === null;
				this.winnerId = this.winnerId ?? player.id;

				if (firstFinish) {
					// Do not keep a winner waiting on an AFK/stopped rival until
					// the race cap: give the rest a short window to finish.
					const finishWindowEnd = now + FINISH_WINDOW_MS;

					if (this.endsAt === null || this.endsAt > finishWindowEnd) {
						this.endsAt = finishWindowEnd;
					}

					this.log('race finish window opened', {
						winnerId: player.id,
						winnerLap: player.lap,
						endsAt: this.endsAt
					});
				}

				this.log('race player finished', {
					playerId: player.id,
					lap: player.lap,
					finishAt: now,
					winnerId: this.winnerId
				});
				this.emitEvent('player-finished', now, {
					playerId: player.id,
					lap: this.track.totalLaps
				});
			} else {
				player.lapStartedAt = now;
				this.log('race lap completed', {
					playerId: player.id,
					lap: player.lap,
					nextGate: player.expectedGate
				});
				this.emitEvent('lap-completed', now, { playerId: player.id, lap: player.lap });
			}

			this.stateDirty = true;
			return;
		}

		player.gate = gate;
		player.expectedGate = gate >= gateCount - 1 ? 0 : gate + 1;
		this.log('race gate passed', {
			playerId: player.id,
			gate,
			lap: player.lap,
			nextGate: player.expectedGate
		});
		this.emitEvent('gate-passed', now, { playerId: player.id, gate, lap: player.lap });
		this.stateDirty = true;
	}

	private processItems(player: RoomPlayer, now: number): void {
		if (player.item !== null) {
			return;
		}

		for (const item of this.items) {
			if (item.respawnAt !== null && now < item.respawnAt) {
				continue;
			}

			const distance = distancePointToSegment(
				item.x,
				item.z,
				player.previousX,
				player.previousZ,
				player.x,
				player.z
			);

			if (distance > ITEM_PICKUP_RADIUS) {
				continue;
			}

			const power = rollPower();
			item.respawnAt = now + ITEM_RESPAWN_MS;
			player.item = power;
			this.emitEvent('item-picked', now, {
				playerId: player.id,
				itemId: item.id,
				power
			});
			this.stateDirty = true;
			return;
		}
	}

	private processOffTrack(player: RoomPlayer, now: number): void {
		if (this.track.isOffTrack(player.x, player.y, player.z)) {
			if (player.offTrackSince === 0) {
				player.offTrackSince = now;
			} else if (now - player.offTrackSince > 2_000) {
				this.respawnPlayer(player, now);
			}
		} else {
			player.offTrackSince = 0;
		}
	}

	private applyDamage(player: RoomPlayer, amount: number, now: number): number {
		if (player.status !== 'racing' || amount <= 0) {
			return 0;
		}

		if (player.shieldUntil > now) {
			return 0;
		}

		const applied = Math.min(player.health, amount);
		player.health = Math.max(0, player.health - applied);
		this.stateDirty = true;

		if (player.health <= 0) {
			this.destroyPlayer(player, now);
		}

		return applied;
	}

	private destroyPlayer(player: RoomPlayer, now: number): void {
		player.status = 'destroyed';
		player.health = 0;
		player.item = null;
		player.speed = 0;
		player.respawnAt = now + RESPAWN_MS;
		player.deathX = player.x;
		player.deathZ = player.z;
		player.deathYaw = player.yaw;
		player.offTrackSince = 0;
		this.emitEvent('player-destroyed', now, { playerId: player.id });
		this.stateDirty = true;
	}

	/**
	 * True when another active racer is too close to the candidate respawn point,
	 * so a car never materialises on top of someone else.
	 */
	private respawnBlocked(player: RoomPlayer, x: number, z: number): boolean {
		for (const other of this.players.values()) {
			if (other.id === player.id || other.status !== 'racing') {
				continue;
			}

			if (horizontalDistance(other.x, other.z, x, z) < RESPAWN_CLEAR_RADIUS) {
				return true;
			}
		}

		return false;
	}

	private respawnPlayer(player: RoomPlayer, now: number, reset = false): void {
		const grid = this.track.grid[player.slot] ?? this.track.grid[0];
		let x = grid.x;
		let y: number = grid.y;
		let z = grid.z;
		let yaw = grid.yaw;
		let usedDeathPoint = false;
		let shiftX = 0;
		let shiftZ = 0;

		if (this.track.gateMode === 'radius') {
			// Haunted Highway: the last checkpoint is the safest known piece of asphalt.
			// A destroyed car also returns there instead of to the point where it
			// was hit, which could be mid-jump or inside the central hole.
			if (player.startedLap) {
				const gate = this.track.gates[player.gate] ?? this.track.gates[0];

				x = gate.x;
				z = gate.z;
				y = CHASSIS_SPAWN_Y;
				yaw = gate.yaw;
			}

			shiftX = Math.cos(yaw);
			shiftZ = -Math.sin(yaw);
		} else {
			// A destroyed car comes back where it exploded, as long as that point
			// is still on the asphalt. Manual resets and off-track recoveries keep
			// using the last gate so a reset cannot skip a corner.
			if (!reset && player.deathX !== null && player.deathZ !== null) {
				const radius = trackRadius(player.deathX, player.deathZ);

				if (radius >= OFF_TRACK_INNER + 2 && radius <= OFF_TRACK_OUTER - 2) {
					x = player.deathX;
					z = player.deathZ;
					yaw = player.deathYaw ?? yawForAngle(Math.atan2(z - TRACK_CENTER.z, x - TRACK_CENTER.x));
					usedDeathPoint = true;
				}
			}

			if (!usedDeathPoint && player.startedLap) {
				const angle = gateAngle(player.gate);
				const point = gatePoint(player.gate);

				x = point.x;
				z = point.z;
				y = CHASSIS_SPAWN_Y;
				yaw = yawForAngle(angle);
			}

			// Walk backwards along the tangent until the point is clear.
			const angle = Math.atan2(z - TRACK_CENTER.z, x - TRACK_CENTER.x);

			shiftX = -Math.sin(angle);
			shiftZ = Math.cos(angle);
		}

		for (let attempt = 0; attempt < 4 && this.respawnBlocked(player, x, z); attempt += 1) {
			x -= shiftX * RESPAWN_SHIFT;
			z -= shiftZ * RESPAWN_SHIFT;
		}

		player.x = x;
		player.y = y;
		player.z = z;
		player.previousX = x;
		player.previousZ = z;
		player.yaw = yaw;
		player.speed = 0;
		player.steering = 0;
		player.health = MAX_HEALTH;
		player.item = null;
		player.shieldUntil = 0;
		player.nitroUntil = 0;
		player.autoRepairUntil = 0;
		player.lastPositionAt = 0;
		player.lastGateAt = now;
		player.respawnAt = null;
		player.deathX = null;
		player.deathZ = null;
		player.deathYaw = null;
		player.offTrackSince = 0;
		player.status = 'racing';
		player.respawnSeq += 1;
		this.emitEvent('player-respawned', now, { playerId: player.id });

		if (reset) {
			player.lastResetAt = now;
		}

		this.stateDirty = true;
	}

	/**
	 * Picks the rival a ray/missile is aimed at.
	 *
	 * It used to lock only onto the racer directly ahead in the standings, so
	 * the leader (or anyone with a stopped rival behind) had no target at all
	 * and offensive powers did zero damage. Now every racing rival within range
	 * is a candidate, preferring the closest one inside the forward cone.
	 */
	private powerTarget(player: RoomPlayer, range: number): RoomPlayer | null {
		const forwardX = Math.cos(player.yaw);
		const forwardZ = -Math.sin(player.yaw);
		let best: RoomPlayer | null = null;
		let bestScore = Number.POSITIVE_INFINITY;

		for (const other of this.players.values()) {
			if (other.id === player.id || other.status !== 'racing') {
				continue;
			}

			const dx = other.x - player.x;
			const dz = other.z - player.z;
			const distance = Math.hypot(dx, dz);

			if (distance > range) {
				continue;
			}

			const alignment = distance > 0.001 ? (dx * forwardX + dz * forwardZ) / distance : 1;
			// In front is cheaper; a rival behind is still hit when there is no
			// better candidate, instead of the power becoming a no-op.
			const score = distance + (alignment < 0 ? range * 0.8 : (1 - alignment) * range * 0.35);

			if (score < bestScore) {
				best = other;
				bestScore = score;
			}
		}

		return best;
	}

	onUseItem(playerId: string, now = Date.now()): void {
		const player = this.players.get(playerId);

		if (!player || this.phase !== 'playing' || player.status !== 'racing' || !player.item) {
			return;
		}

		const power = player.item;
		player.item = null;

		switch (power) {
			case 'nitro':
				player.nitroUntil = now + NITRO_MS;
				break;

			case 'repair':
				player.health = Math.min(MAX_HEALTH, player.health + REPAIR_HP);
				break;

			case 'auto':
				player.autoRepairUntil = now + AUTO_REPAIR_MS;
				break;

			case 'shield':
				player.shieldUntil = now + SHIELD_MS;
				break;

			case 'mine': {
				const forwardX = Math.cos(player.yaw);
				const forwardZ = -Math.sin(player.yaw);

				if (this.mines.length >= MINE_MAX) {
					this.mines.shift();
				}

				this.mineSeq += 1;
				const mine: RoomMine = {
					id: `mine-${this.mineSeq}`,
					ownerId: player.id,
					x: player.x - forwardX * MINE_OFFSET,
					y: 0.35,
					z: player.z - forwardZ * MINE_OFFSET,
					placedAt: now,
					armedAt: now + MINE_ARM_MS,
					expiresAt: now + MINE_LIFETIME_MS
				};

				this.mines.push(mine);
				this.emitEvent('mine-placed', now, {
					playerId: player.id,
					mineId: mine.id,
					from: { x: mine.x, y: mine.y, z: mine.z }
				});
				break;
			}

			case 'ray': {
				const target = this.powerTarget(player, RAY_RANGE);
				const distance = target
					? Math.hypot(target.x - player.x, target.y - player.y, target.z - player.z)
					: null;
				const forwardX = Math.cos(player.yaw);
				const forwardZ = -Math.sin(player.yaw);
				const from = { x: player.x, y: player.y + 0.7, z: player.z };
				const to = target
					? { x: target.x, y: target.y + 0.7, z: target.z }
					: {
							x: player.x + forwardX * 30,
							y: player.y + 0.7,
							z: player.z + forwardZ * 30
						};
				const applied = target ? this.applyDamage(target, RAY_DAMAGE, now) : 0;

				this.log('race power used', {
					playerId: player.id,
					power,
					targetId: target?.id ?? null,
					distance: distance === null ? null : round(distance),
					amount: applied
				});
				this.emitEvent('ray-fired', now, {
					playerId: player.id,
					otherId: target?.id,
					amount: applied,
					from,
					to
				});
				break;
			}

			case 'missile': {
				const target = this.powerTarget(player, MISSILE_RANGE);
				const distance = target
					? Math.hypot(target.x - player.x, target.y - player.y, target.z - player.z)
					: null;

				this.missileSeq += 1;
				const forwardX = Math.cos(player.yaw);
				const forwardZ = -Math.sin(player.yaw);

				const missile: RoomMissile = {
					id: `missile-${this.missileSeq}`,
					fromPlayerId: player.id,
					targetPlayerId: target?.id ?? null,
					from: { x: player.x, y: player.y + 0.8, z: player.z },
					to: target
						? { x: target.x, y: target.y + 0.8, z: target.z }
						: {
								x: player.x + forwardX * 30,
								y: player.y + 0.8,
								z: player.z + forwardZ * 30
							},
					firedAt: now,
					hitAt: now + MISSILE_FLIGHT_MS
				};

				this.missiles.push(missile);
				this.log('race power used', {
					playerId: player.id,
					power,
					targetId: target?.id ?? null,
					distance: distance === null ? null : round(distance),
					missileId: missile.id
				});
				this.emitEvent('missile-fired', now, {
					playerId: player.id,
					otherId: target?.id,
					missileId: missile.id
				});
				break;
			}
		}

		this.emitEvent('item-used', now, { playerId: player.id, power });
		this.stateDirty = true;
	}

	onReset(playerId: string, now = Date.now()): void {
		const player = this.players.get(playerId);

		if (!player || this.phase !== 'playing' || player.status !== 'racing') {
			return;
		}

		if (now - player.lastResetAt < RESET_COOLDOWN_MS) {
			return;
		}

		this.respawnPlayer(player, now, true);
	}

	onImpact(
		playerId: string,
		impactSpeed: number,
		cause: 'collision' | 'rollover',
		now = Date.now()
	): void {
		const player = this.players.get(playerId);

		if (!player || this.phase !== 'playing' || player.status !== 'racing') {
			return;
		}

		if (now - player.lastImpactAt < 600) {
			return;
		}

		const damage =
			cause === 'rollover' ? 12 : Math.round(clamp((Math.max(0, impactSpeed) - 5) * 3, 0, 35));

		if (damage <= 0) {
			return;
		}

		player.lastImpactAt = now;
		this.applyDamage(player, damage, now);
	}

	private updateMissiles(now: number): void {
		if (this.missiles.length === 0) {
			return;
		}

		const remaining: RoomMissile[] = [];

		for (const missile of this.missiles) {
			if (now < missile.hitAt) {
				remaining.push(missile);
				continue;
			}

			const target = missile.targetPlayerId ? this.players.get(missile.targetPlayerId) : undefined;

			if (!target || target.status !== 'racing') {
				continue;
			}

			const applied = this.applyDamage(target, MISSILE_DAMAGE, now);
			this.log('race missile hit', {
				playerId: missile.fromPlayerId,
				otherId: target.id,
				missileId: missile.id,
				amount: applied
			});
			this.emitEvent('missile-hit', now, {
				playerId: missile.fromPlayerId,
				otherId: target.id,
				missileId: missile.id,
				amount: applied
			});
		}

		this.missiles = remaining;
	}

	private updateMines(now: number): void {
		if (this.mines.length === 0) {
			return;
		}

		const remaining: RoomMine[] = [];

		for (const mine of this.mines) {
			if (now >= mine.expiresAt) {
				this.stateDirty = true;
				continue;
			}

			if (now < mine.armedAt) {
				remaining.push(mine);
				continue;
			}

			let victim: RoomPlayer | null = null;

			for (const player of this.players.values()) {
				if (player.id === mine.ownerId || player.status !== 'racing') {
					continue;
				}

				if (horizontalDistance(player.x, player.z, mine.x, mine.z) <= MINE_RADIUS) {
					victim = player;
					break;
				}
			}

			if (!victim) {
				remaining.push(mine);
				continue;
			}

			const applied = this.applyDamage(victim, MINE_DAMAGE, now);
			this.emitEvent('mine-hit', now, {
				playerId: mine.ownerId,
				otherId: victim.id,
				mineId: mine.id,
				amount: applied,
				from: { x: mine.x, y: mine.y, z: mine.z },
				to: { x: victim.x, y: victim.y, z: victim.z }
			});
			this.stateDirty = true;
		}

		this.mines = remaining;
	}

	private updateAutoRepair(now: number): void {
		let changed = false;

		for (const player of this.players.values()) {
			if (player.autoRepairUntil <= now || player.status !== 'racing') {
				continue;
			}

			if (player.health >= MAX_HEALTH) {
				continue;
			}

			player.health = Math.min(MAX_HEALTH, player.health + AUTO_REPAIR_RATE / 10);
			changed = true;
		}

		if (changed) {
			this.stateDirty = true;
		}
	}

	private updateRespawns(now: number): void {
		for (const player of this.players.values()) {
			if (player.status === 'destroyed' && player.respawnAt !== null && now >= player.respawnAt) {
				this.respawnPlayer(player, now);
			}
		}
	}

	private updateItems(now: number): void {
		for (const item of this.items) {
			if (item.respawnAt !== null && now >= item.respawnAt) {
				item.respawnAt = null;
				this.stateDirty = true;
			}
		}
	}

	private progressScore(player: RoomPlayer): number {
		return player.lap * this.track.gates.length + player.gate;
	}

	private sortedPlayers(now: number): RoomPlayer[] {
		void now;
		const list = [...this.players.values()];

		return list.sort((a, b) => {
			const aFinished = a.status === 'finished';
			const bFinished = b.status === 'finished';

			if (aFinished && bFinished) {
				return (a.finishAt ?? 0) - (b.finishAt ?? 0);
			}

			if (aFinished) return -1;
			if (bFinished) return 1;

			const scoreDiff = this.progressScore(b) - this.progressScore(a);
			if (scoreDiff !== 0) {
				return scoreDiff;
			}

			// Same gate: the one closer (in angle) to the next gate goes first.
			return this.distanceToNextGate(a) - this.distanceToNextGate(b);
		});
	}

	private distanceToNextGate(player: RoomPlayer): number {
		const point = this.track.gates[player.expectedGate] ?? this.track.gates[0];

		return horizontalDistance(player.x, player.z, point.x, point.z);
	}

	private recomputeRanking(now: number): void {
		const list = this.sortedPlayers(now);

		list.forEach((player, index) => {
			player.rank = index + 1;
		});
	}

	private static copyPlayer(player: RoomPlayer): RacePlayerState {
		return {
			id: player.id,
			name: player.name,
			model: player.model,
			slot: player.slot,
			status: player.status,
			lap: player.lap,
			gate: player.gate,
			rank: player.rank,
			health: Math.round(player.health),
			maxHealth: MAX_HEALTH,
			item: player.item,
			shieldUntil: player.shieldUntil > 0 ? player.shieldUntil : null,
			nitroUntil: player.nitroUntil > 0 ? player.nitroUntil : null,
			autoRepairUntil: player.autoRepairUntil > 0 ? player.autoRepairUntil : null,
			finishAt: player.finishAt,
			respawnSeq: player.respawnSeq,
			x: round(player.x),
			y: round(player.y),
			z: round(player.z),
			yaw: round(player.yaw),
			speed: round(player.speed)
		};
	}

	private static copyPosition(player: RoomPlayer): RacePosition {
		const half = player.yaw / 2;
		// Remote clients use the velocity to spin the wheels; it was always
		// zero, so other cars visibly glided instead of rolling.
		const velocityX = Math.cos(player.yaw) * player.speed;
		const velocityZ = -Math.sin(player.yaw) * player.speed;

		return {
			id: player.id,
			x: round(player.x),
			y: round(player.y),
			z: round(player.z),
			qx: 0,
			qy: Math.sin(half),
			qz: 0,
			qw: Math.cos(half),
			vx: round(velocityX),
			vy: 0,
			vz: round(velocityZ),
			speed: round(player.speed),
			steering: round(player.steering),
			health: Math.round(player.health),
			lap: player.lap,
			gate: player.gate,
			status: player.status
		};
	}

	buildSnapshot(now = Date.now()): RaceSnapshot {
		this.recomputeRanking(now);

		return {
			phase: this.phase,
			endsAt: this.endsAt,
			startedAt: this.startedAt,
			serverTime: now,
			track: this.track.id,
			trackName: this.track.name,
			totalLaps: this.track.totalLaps,
			gateCount: this.track.gates.length,
			maxPlayers: this.track.maxPlayers,
			raceMaxMs: this.track.raceMaxMs,
			winnerId: this.winnerId,
			players: this.sortedPlayers(now).map(Race.copyPlayer),
			items: this.items.map<RaceItemState>((item) => ({
				id: item.id,
				x: item.x,
				y: item.y,
				z: item.z,
				respawnAt: item.respawnAt
			})),
			missiles: this.missiles.map<RaceMissileState>((missile) => ({
				id: missile.id,
				fromPlayerId: missile.fromPlayerId,
				targetPlayerId: missile.targetPlayerId,
				from: { ...missile.from },
				to: { ...missile.to },
				firedAt: missile.firedAt,
				hitAt: missile.hitAt
			})),
			mines: this.mines.map<RaceMineState>((mine) => ({
				id: mine.id,
				ownerId: mine.ownerId,
				x: round(mine.x),
				y: round(mine.y),
				z: round(mine.z),
				placedAt: mine.placedAt,
				armedAt: mine.armedAt,
				expiresAt: mine.expiresAt
			}))
		};
	}

	private broadcastState(now: number): void {
		this.stateDirty = false;
		this.nextStateAt = now + 1000;
		this.publish({ type: 'race-state', state: this.buildSnapshot(now) });
	}

	private broadcastPositions(now: number): void {
		this.recomputeRanking(now);
		const players = [...this.players.values()];
		this.publish({
			type: 'race-positions',
			at: now,
			players: players.map(Race.copyPosition)
		});
		// Shorter than the 100 ms room tick so timer jitter never skips a tick
		// (a skipped broadcast left a 200 ms hole the client had to freeze on).
		this.nextPositionsAt = now + 60;

		if (now - this.lastTickLogAt >= 5000) {
			this.lastTickLogAt = now;
			this.log('race positions', {
				phase: this.phase,
				ticks: this.tickCount,
				players: players.map((player) => ({
					id: player.id,
					status: player.status,
					lap: player.lap,
					gate: player.gate,
					expectedGate: player.expectedGate,
					x: round(player.x),
					z: round(player.z),
					speed: round(player.speed)
				}))
			});
			this.tickCount = 0;
		}
	}

	/** The snapshot a joining client receives right after `onEnter`. */
	snapshot(now = Date.now()): RaceSnapshot {
		return this.buildSnapshot(now);
	}

	private startRace(now: number): void {
		this.phase = 'playing';
		this.startedAt = now;
		this.endsAt = now + this.track.raceMaxMs;
		this.winnerId = null;
		this.missiles = [];
		this.mines = [];

		for (const player of this.players.values()) {
			player.status = 'racing';
			player.startedLap = false;
			player.lap = 0;
			player.gate = 0;
			player.expectedGate = 0;
			player.lapStartedAt = now;
			player.lastGateAt = 0;
			player.lastPositionAt = 0;
			player.health = MAX_HEALTH;
		}

		this.log('race started', {
			players: [...this.players.keys()],
			endsAt: this.endsAt
		});
		this.emitEvent('race-start', now);
		this.stateDirty = true;
	}

	private finishRace(now: number): void {
		if (this.phase !== 'playing') {
			return;
		}

		this.phase = 'results';
		this.endsAt = now + RESULT_MS;
		this.missiles = [];
		this.mines = [];
		this.log('race finished', {
			winnerId: this.winnerId,
			players: [...this.players.keys()]
		});
		this.emitEvent('race-ended', now, this.winnerId ? { playerId: this.winnerId } : {});
		this.stateDirty = true;
	}

	private endRace(now: number): void {
		const ids = [...this.players.keys()];

		this.log('race ended', { players: ids });
		this.resetRoom();
		this.nextStateAt = now + 1000;
		this.publish({ type: 'race-state', state: this.buildSnapshot(now) });

		for (const id of ids) {
			this.deps.moveToLobby(id);
		}
	}

	tick(now = Date.now()): void {
		try {
			this.tickCount += 1;

			if (this.phase === 'idle') {
				return;
			}

			if (this.endsAt !== null && now >= this.endsAt) {
				if (this.phase === 'countdown') {
					this.startRace(now);
				} else if (this.phase === 'playing') {
					this.finishRace(now);
				} else {
					this.endRace(now);
					return;
				}
			}

			if (this.phase === 'playing') {
				this.updateAutoRepair(now);
				this.updateMissiles(now);
				this.updateMines(now);
				this.updateRespawns(now);
				this.updateItems(now);

				const allFinished =
					this.players.size > 0 &&
					[...this.players.values()].every((player) => player.status === 'finished');

				if (allFinished) {
					this.finishRace(now);
				}
			}

			if (this.phase === 'playing' || this.phase === 'countdown') {
				if (now >= this.nextPositionsAt) {
					this.broadcastPositions(now);
				}
			}

			if (this.stateDirty || now >= this.nextStateAt) {
				this.broadcastState(now);
			}
		} catch (error) {
			console.error('[race] tick error:', error);
			this.publish({
				type: 'error',
				code: 'RACE_ROOM_ERROR',
				message: 'The race was restarted due to an internal error'
			});
			this.resetRoom();
			this.broadcastState(now);
		}
	}

	debugState(): {
		phase: RacePhase;
		players: number;
		items: number;
		missiles: number;
		mines: number;
	} {
		return {
			phase: this.phase,
			players: this.players.size,
			items: this.items.length,
			missiles: this.missiles.length,
			mines: this.mines.length
		};
	}
}
