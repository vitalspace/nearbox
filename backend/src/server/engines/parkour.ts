import { DEFAULT_SKIN, type SkinId } from '../../lib/cosmetics/skinIds';
import {
	PARKOUR_BOUNDS,
	PARKOUR_CHECKPOINTS,
	PARKOUR_CHECKPOINT_RADIUS,
	PARKOUR_CHECKPOINT_TOP,
	PARKOUR_CHECKPOINT_BOTTOM,
	PARKOUR_COUNTDOWN_MS,
	PARKOUR_COUNTDOWN_SHORT_MS,
	PARKOUR_FALL_DEPTH,
	PARKOUR_FALL_GRACE_MS,
	PARKOUR_FINISH,
	PARKOUR_FINISH_GRACE_MS,
	PARKOUR_FIRE_PULSES,
	PARKOUR_FIRE_PULSE_MS,
	PARKOUR_MATCH_MAX_MS,
	PARKOUR_MAX_PLAYERS,
	PARKOUR_ACID_SWEEP_RADIUS,
	PARKOUR_ACID_TARGET_LEAD,
	PARKOUR_MAX_PUSH_HORIZONTAL,
	PARKOUR_MAX_PUSH_VERTICAL,
	PARKOUR_POSITION_MAX_HZ,
	PARKOUR_POSITION_MAX_STEP,
	PARKOUR_POSITION_MAX_VERTICAL,
	PARKOUR_RESPAWN_DELAY_MS,
	PARKOUR_RESPAWN_LIFT,
	PARKOUR_RESPAWN_PROTECTION_MS,
	PARKOUR_RESULTS_MS,
	PARKOUR_ROCK_SWEEP_RADIUS,
	PARKOUR_ROCK_TARGET_LEAD,
	PARKOUR_START,
	PARKOUR_START_GRID,
	PARKOUR_WARDENS,
	PARKOUR_WARDEN_ARM_DELAY_MS,
	PARKOUR_WARDEN_VERTICAL_REACH,
	horizontalDistanceTo,
	insideCheckpoint,
	insideFinish,
	parkourCheckpointAt,
	parkourCheckpointName,
	parkourWardenCanChase,
	parkourWardenChaseStep,
	parkourWardenPosition,
	type ParkourPoint,
	type ParkourWardenDefinition
} from '../../lib/state/parkourConfig';
import { DEMON_FIRE_HALF_ANGLE } from '../../lib/state/wavesConfig';
import type {
	Mg7Event,
	Mg7EventKind,
	Mg7Phase,
	Mg7Positions,
	Mg7Snapshot,
	Mg7WardenAttack
} from '../protocol';
import type { RoomPort } from '../port';
import { attestEvent, newMatchId } from '../../progression/attest';
import { round } from './combat';

const RECONNECT_WINDOW_MS = 20_000;
const STATE_INTERVAL_MS = 250;
const POSITION_INTERVAL_MS = 100;
const REPORT_WINDOW_MS = 1_000;
const REPORT_WINDOW_LIMIT = PARKOUR_POSITION_MAX_HZ;
const FIRE_CONE_COS = Math.cos(DEMON_FIRE_HALF_ANGLE);
const FIRE_CONE_DURATION_MS = PARKOUR_FIRE_PULSES * PARKOUR_FIRE_PULSE_MS;
/**
 * Cuerpo del jugador para el barrido de proyectiles enemigos. El servidor
 * solo tiene la posición de los pies; la cápsula cubre la altura del avatar
 * y un radio algo mayor que el cuerpo visual para que un impacto que se ve
 * encima no se pierda entre dos ticks (corriendo o saltando).
 */
const PLAYER_BODY_RADIUS = 0.55;
const PLAYER_BODY_HEIGHT = 1.9;
/** Sin reportes recientes (jugador parado o desconectado) no se anticipa. */
const VELOCITY_STALE_MS = 350;
/** Tope de velocidad creíble para descartar teletransportes/correcciones. */
const MAX_TRACKED_HORIZONTAL_SPEED = 14;
const MAX_TRACKED_VERTICAL_SPEED = 16;

type ParkourPlayer = {
	id: string;
	name: string;
	skin: SkinId;
	/** 0 = START, 1..12 = CP, 13 = FINISH. */
	checkpoint: number;
	falls: number;
	x: number;
	y: number;
	z: number;
	yaw: number;
	/** Velocidad reportada, para anticipar rocas y ácido. */
	vx: number;
	vy: number;
	vz: number;
	finishedAt: number | null;
	respawnAt: number | null;
	protectionUntil: number;
	/** First tick below the fall threshold; `null` while on the route. */
	fallSince: number | null;
	lastPositionAt: number;
	reportTimes: number[];
	spawnSlot: number;
	seq: number;
};

type RecentPlayer = {
	checkpoint: number;
	falls: number;
	finishedAt: number | null;
	leftAt: number;
};

type DeferredAttack = {
	id: string;
	wardenId: string;
	kind: 'rock' | 'acid';
	origin: ParkourPoint;
	target: ParkourPoint;
	/** Momento del lanzamiento; el barrido interpola `origin → target`. */
	at: number;
	impactAt: number;
	radius: number;
	pushHorizontal: number;
	pushVertical: number;
};

type FireCone = {
	id: string;
	warden: ParkourWardenDefinition;
	origin: ParkourPoint;
	dirX: number;
	dirZ: number;
	nextPulseAt: number;
	pulsesLeft: number;
	endAt: number;
};

export type ParkourDeps = {
	moveToLobby: (playerId: string) => void;
};

export type EnterResult = { ok: true } | { ok: false; code: string; message: string };

let attackSeq = 0;

function nextAttackId(): string {
	attackSeq += 1;
	return `pk-attack-${attackSeq}`;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function finite(value: number): boolean {
	return Number.isFinite(value);
}

/**
 * Parkour — autoridad de la carrera de la Torre de Halloween.
 *
 * Fases: `idle → countdown (30 s, 10 s si 12/12) → playing (10 min) →
 * results (15 s) → idle`. Sin HP, daño ni muerte: solo checkpoints
 * secuenciales, caídas/respawns y guardianes que empujan.
 */
export class Parkour {
	private phaseValue: Mg7Phase = 'idle';
	private players = new Map<string, ParkourPlayer>();
	private recent = new Map<string, RecentPlayer>();
	private countdownEndsAt: number | null = null;
	private matchEndsAt: number | null = null;
	private resultEndsAt: number | null = null;
	private startedAt: number | null = null;
	private winnerId: string | null = null;
	/** Subida actual; llegadas y victoria comparten este id. */
	private matchId: string | null = null;
	private countdownShortened = false;
	private finishGraceEndsAt: number | null = null;
	private finishOrder = 0;
	private nextSeq = 1;
	private attacks: DeferredAttack[] = [];
	private fireCones: FireCone[] = [];
	private wardenLastAttackAt = new Map<string, number>();
	private wardenChase = new Map<string, ParkourPoint>();
	private wardenStepAt = 0;
	private lastPositionsAt = 0;
	private lastTickAt = 0;
	/** Delta del último tick; el barrido de proyectiles lo necesita. */
	private tickDt = 0.1;
	private nextStateAt = 0;
	private stateDirty = true;

	constructor(
		private readonly port: RoomPort,
		private readonly deps: ParkourDeps
	) {}

	// ------------------------------------------------------------------
	// Entrada / salida
	// ------------------------------------------------------------------

	canEnter(playerId: string, now = Date.now()): EnterResult {
		if (this.players.has(playerId)) {
			return { ok: true };
		}

		const recent = this.recent.get(playerId);
		const canReconnect =
			recent !== undefined &&
			now - recent.leftAt <= RECONNECT_WINDOW_MS &&
			this.phaseValue === 'playing';

		if (this.phaseValue === 'results') {
			return {
				ok: false,
				code: 'PARKOUR_IN_PROGRESS',
				message: 'The parkour race is finishing'
			};
		}

		if (this.phaseValue === 'playing' && !canReconnect) {
			return {
				ok: false,
				code: 'PARKOUR_IN_PROGRESS',
				message: 'The parkour race is already running'
			};
		}

		if (this.players.size >= PARKOUR_MAX_PLAYERS) {
			return {
				ok: false,
				code: 'PARKOUR_FULL',
				message: `The parkour tower is full (${PARKOUR_MAX_PLAYERS} players)`
			};
		}

		return { ok: true };
	}

	onEnter(playerId: string, name: string, now: number, skin: SkinId = DEFAULT_SKIN): EnterResult {
		const existing = this.players.get(playerId);

		if (existing) {
			existing.name = name;
			existing.skin = skin;
			this.stateDirty = true;
			return { ok: true };
		}

		const admission = this.canEnter(playerId, now);

		if (!admission.ok) {
			return admission;
		}

		const recent = this.recent.get(playerId);
		const canReconnect =
			recent !== undefined &&
			now - recent.leftAt <= RECONNECT_WINDOW_MS &&
			this.phaseValue === 'playing';

		if (recent) {
			this.recent.delete(playerId);
		}

		const restored = canReconnect && recent ? recent : null;
		const checkpoint = restored ? clamp(restored.checkpoint, 0, PARKOUR_FINISH.index) : 0;
		const spawnSlot = this.firstFreeSlot();
		const slot = PARKOUR_START_GRID[spawnSlot] ?? PARKOUR_START_GRID[0];
		// New racers start on their assigned grid slot; reconnections return to
		// the last checkpoint (the grid is only used while waiting).
		const point = restored ? this.respawnPoint(checkpoint) : { x: slot.x, y: slot.y, z: slot.z };

		const player: ParkourPlayer = {
			id: playerId,
			name,
			skin,
			checkpoint,
			falls: restored?.falls ?? 0,
			x: point.x,
			y: point.y,
			z: point.z,
			yaw: slot.yaw,
			vx: 0,
			vy: 0,
			vz: 0,
			finishedAt: restored?.finishedAt ?? null,
			respawnAt: null,
			protectionUntil: restored ? now + PARKOUR_RESPAWN_PROTECTION_MS : 0,
			fallSince: null,
			lastPositionAt: 0,
			reportTimes: [],
			spawnSlot,
			seq: this.nextSeq++
		};

		this.players.set(playerId, player);

		if (this.phaseValue === 'idle') {
			this.beginCountdown(now);
		}

		if (this.phaseValue === 'countdown') {
			this.maybeShortenCountdown(now);
		}

		this.emitEvent('player-joined', now, { playerId });

		if (restored) {
			// A reconnection returns to the last checkpoint with protection.
			// The event lets the local client teleport even when the scene never
			// changed (short drops that keep `inParkour` true).
			this.emitEvent('respawn', now, {
				playerId,
				index: checkpoint,
				checkpoint,
				x: round(player.x),
				y: round(player.y),
				z: round(player.z),
				protectionUntil: player.protectionUntil
			});
		}

		this.stateDirty = true;

		return { ok: true };
	}

	onLeave(playerId: string, now: number): void {
		const player = this.players.get(playerId);

		if (!player) {
			return;
		}

		this.players.delete(playerId);
		this.recent.set(playerId, {
			checkpoint: player.checkpoint,
			falls: player.falls,
			finishedAt: player.finishedAt,
			leftAt: now
		});

		this.emitEvent('player-left', now, { playerId });

		if (this.players.size === 0) {
			this.resetMatch();
			return;
		}

		this.stateDirty = true;
	}

	private firstFreeSlot(): number {
		const used = new Set([...this.players.values()].map((player) => player.spawnSlot));

		for (let slot = 0; slot < PARKOUR_START_GRID.length; slot += 1) {
			if (!used.has(slot)) {
				return slot;
			}
		}

		return Math.max(0, PARKOUR_START_GRID.length - 1);
	}

	/**
	 * START already sits on the spawn-pad surface; CP1–CP12 add 0.15 m so the
	 * feet land just above the plaza instead of inside it.
	 */
	private respawnPoint(checkpoint: number): ParkourPoint {
		const point = parkourCheckpointAt(checkpoint) ?? PARKOUR_START;

		return {
			x: point.x,
			y: point.y + (checkpoint > 0 ? PARKOUR_RESPAWN_LIFT : 0),
			z: point.z
		};
	}

	private beginCountdown(now: number): void {
		this.phaseValue = 'countdown';
		this.countdownEndsAt = now + PARKOUR_COUNTDOWN_MS;
		this.countdownShortened = false;
		this.matchEndsAt = null;
		this.resultEndsAt = null;
		this.startedAt = null;
		this.winnerId = null;
		this.finishGraceEndsAt = null;
		this.finishOrder = 0;
		this.attacks = [];
		this.fireCones = [];
		this.wardenLastAttackAt.clear();
		this.wardenChase.clear();
		this.wardenStepAt = 0;
		this.stateDirty = true;
	}

	private maybeShortenCountdown(now: number): void {
		if (
			this.countdownShortened ||
			this.phaseValue !== 'countdown' ||
			this.players.size < PARKOUR_MAX_PLAYERS
		) {
			return;
		}

		this.countdownShortened = true;
		this.countdownEndsAt = now + PARKOUR_COUNTDOWN_SHORT_MS;
		this.emitEvent('countdown-shortened', now, {});
		this.stateDirty = true;
	}

	// ------------------------------------------------------------------
	// Posiciones y checkpoints
	// ------------------------------------------------------------------

	onPosition(playerId: string, x: number, y: number, z: number, yaw: number, now: number): void {
		const player = this.players.get(playerId);

		if (!player || this.phaseValue !== 'playing' || player.finishedAt !== null) {
			return;
		}

		if (player.respawnAt !== null) {
			return;
		}

		if (!finite(x) || !finite(y) || !finite(z) || !finite(yaw)) {
			return;
		}

		if (
			x < PARKOUR_BOUNDS.minX ||
			x > PARKOUR_BOUNDS.maxX ||
			z < PARKOUR_BOUNDS.minZ ||
			z > PARKOUR_BOUNDS.maxZ ||
			y < PARKOUR_BOUNDS.minY ||
			y > PARKOUR_BOUNDS.maxY
		) {
			return;
		}

		player.reportTimes = player.reportTimes.filter((time) => now - time < REPORT_WINDOW_MS);

		if (player.reportTimes.length >= REPORT_WINDOW_LIMIT) {
			return;
		}

		if (player.lastPositionAt > 0) {
			const step = Math.hypot(x - player.x, z - player.z);

			if (step > PARKOUR_POSITION_MAX_STEP) {
				return;
			}

			if (Math.abs(y - player.y) > PARKOUR_POSITION_MAX_VERTICAL) {
				return;
			}
		}

		player.reportTimes.push(now);
		// La velocidad alimenta la anticipación de rocas y ácido. Se descarta
		// el primer reporte y cualquier salto imposible (teletransporte,
		// corrección de red): una velocidad absurda desviaría los tiros.
		const hadSample = player.lastPositionAt !== 0;
		const dtSeconds = Math.max(0.001, (now - player.lastPositionAt) / 1000);
		const rawVx = (x - player.x) / dtSeconds;
		const rawVy = (y - player.y) / dtSeconds;
		const rawVz = (z - player.z) / dtSeconds;

		player.x = x;
		player.y = y;
		player.z = z;
		player.yaw = yaw;
		player.lastPositionAt = now;

		if (
			hadSample &&
			Math.hypot(rawVx, rawVz) <= MAX_TRACKED_HORIZONTAL_SPEED &&
			Math.abs(rawVy) <= MAX_TRACKED_VERTICAL_SPEED
		) {
			player.vx = rawVx;
			player.vy = rawVy;
			player.vz = rawVz;
		} else {
			player.vx = 0;
			player.vy = 0;
			player.vz = 0;
		}

		const next = player.checkpoint + 1;

		if (next <= PARKOUR_CHECKPOINTS.length) {
			const checkpoint = PARKOUR_CHECKPOINTS[next - 1];

			if (
				insideCheckpoint(
					{ x, y, z },
					{ x: checkpoint.x, y: checkpoint.y, z: checkpoint.z },
					PARKOUR_CHECKPOINT_RADIUS
				)
			) {
				player.checkpoint = next;
				this.emitEvent('checkpoint', now, {
					playerId,
					index: next,
					name: checkpoint.name
				});
				this.stateDirty = true;
			}

			return;
		}

		if (next === PARKOUR_FINISH.index && insideFinish({ x, y, z })) {
			this.finishPlayer(player, now);
		}
	}

	private finishPlayer(player: ParkourPlayer, now: number): void {
		if (player.finishedAt !== null) {
			return;
		}

		player.checkpoint = PARKOUR_FINISH.index;
		player.finishedAt = now;
		player.respawnAt = null;
		player.fallSince = null;
		this.finishOrder += 1;

		const timeMs = this.startedAt === null ? 0 : Math.max(0, now - this.startedAt);

		this.emitEvent('finish', now, {
			playerId: player.id,
			position: this.finishOrder,
			timeMs
		});

		if (this.matchId) {
			void attestEvent({
				source: 'parkour',
				matchId: this.matchId,
				wsId: player.id,
				metric: 'parkour.finishes',
				eventKey: 'finish'
			});
		}

		if (this.finishGraceEndsAt === null) {
			this.finishGraceEndsAt = now + PARKOUR_FINISH_GRACE_MS;
		}

		this.stateDirty = true;
	}

	// ------------------------------------------------------------------
	// Tick
	// ------------------------------------------------------------------

	tick(now: number): void {
		try {
			const dt = this.lastTickAt === 0 ? 0.1 : clamp((now - this.lastTickAt) / 1000, 0.01, 0.25);
			this.lastTickAt = now;
			this.tickDt = dt;
			this.expireStaleVelocity(now);
			this.updatePhase(now);
			this.updateRespawns(now);
			this.updateFalls(now);
			this.updateAttacks(now);
			this.updateWardens(now);
			this.broadcast(now);
		} catch (error) {
			console.error('[parkour] tick failed', error);
			this.phaseValue = 'idle';
			this.resetMatch();
		}
	}

	private updatePhase(now: number): void {
		if (this.phaseValue === 'countdown') {
			if (this.countdownEndsAt !== null && now >= this.countdownEndsAt) {
				this.startMatch(now);
			}

			return;
		}

		if (this.phaseValue === 'playing') {
			if (this.matchEndsAt !== null && now >= this.matchEndsAt) {
				this.finishMatch(now);
				return;
			}

			if (this.finishGraceEndsAt !== null && now >= this.finishGraceEndsAt) {
				this.finishMatch(now);
			}

			return;
		}

		if (this.phaseValue === 'results' && this.resultEndsAt !== null && now >= this.resultEndsAt) {
			for (const playerId of [...this.players.keys()]) {
				this.deps.moveToLobby(playerId);
			}

			this.resetMatch();
		}
	}

	private startMatch(now: number): void {
		this.phaseValue = 'playing';
		this.countdownEndsAt = null;
		this.startedAt = now;
		this.matchEndsAt = now + PARKOUR_MATCH_MAX_MS;
		this.resultEndsAt = null;
		this.winnerId = null;
		this.matchId = newMatchId();
		this.finishGraceEndsAt = null;
		this.finishOrder = 0;
		this.attacks = [];
		this.fireCones = [];
		this.wardenLastAttackAt.clear();
		this.wardenChase.clear();
		this.wardenStepAt = 0;

		for (const player of this.players.values()) {
			const slot = PARKOUR_START_GRID[player.spawnSlot] ?? PARKOUR_START_GRID[0];

			player.checkpoint = 0;
			player.falls = 0;
			player.finishedAt = null;
			player.respawnAt = null;
			player.protectionUntil = 0;
			player.fallSince = null;
			player.x = slot.x;
			player.y = slot.y;
			player.z = slot.z;
			player.yaw = slot.yaw;
			player.lastPositionAt = 0;
			player.reportTimes = [];
		}

		this.emitEvent('match-start', now, {});
		this.stateDirty = true;
	}

	private updateRespawns(now: number): void {
		if (this.phaseValue !== 'playing') {
			return;
		}

		for (const player of this.players.values()) {
			if (player.respawnAt === null || now < player.respawnAt) {
				continue;
			}

			const point = this.respawnPoint(player.checkpoint);

			player.x = point.x;
			player.y = point.y;
			player.z = point.z;
			player.vx = 0;
			player.vy = 0;
			player.vz = 0;
			player.respawnAt = null;
			player.fallSince = null;
			player.protectionUntil = now + PARKOUR_RESPAWN_PROTECTION_MS;

			this.emitEvent('respawn', now, {
				playerId: player.id,
				index: player.checkpoint,
				checkpoint: player.checkpoint,
				x: round(player.x),
				y: round(player.y),
				z: round(player.z),
				protectionUntil: player.protectionUntil
			});
			this.stateDirty = true;
		}
	}

	private updateFalls(now: number): void {
		if (this.phaseValue !== 'playing') {
			return;
		}

		for (const player of this.players.values()) {
			if (player.finishedAt !== null || player.respawnAt !== null) {
				player.fallSince = null;
				continue;
			}

			const surface = parkourCheckpointAt(player.checkpoint)?.y ?? PARKOUR_START.y;
			const threshold = surface - PARKOUR_FALL_DEPTH;
			const below = player.y < threshold || player.y < -8;

			if (!below) {
				player.fallSince = null;
				continue;
			}

			if (player.fallSince === null) {
				player.fallSince = now;
			}

			if (player.y >= -8 && now - player.fallSince < PARKOUR_FALL_GRACE_MS) {
				continue;
			}

			player.fallSince = null;
			player.falls += 1;
			player.respawnAt = now + PARKOUR_RESPAWN_DELAY_MS;

			this.emitEvent('fall', now, {
				playerId: player.id,
				index: player.checkpoint,
				checkpoint: player.checkpoint
			});
			this.stateDirty = true;
		}
	}

	// ------------------------------------------------------------------
	// Guardianes
	// ------------------------------------------------------------------

	/** Sin reportes recientes la velocidad deja de ser fiable (parado/jitter). */
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
	 * Punto del proyectil en un instante, con la misma interpolación que usa
	 * `ParkourAttackFx` en el cliente: lineal del origen al objetivo y, para
	 * la roca, un arco de 2.4 m. Así el barrido del servidor coincide con lo
	 * que el jugador ve.
	 */
	private attackPosition(attack: DeferredAttack, time: number): ParkourPoint {
		const duration = Math.max(1, attack.impactAt - attack.at);
		const t = clamp((time - attack.at) / duration, 0, 1);
		const x = attack.origin.x + (attack.target.x - attack.origin.x) * t;
		const z = attack.origin.z + (attack.target.z - attack.origin.z) * t;
		let y = attack.origin.y + (attack.target.y - attack.origin.y) * t;

		if (attack.kind === 'rock') {
			y += Math.sin(Math.PI * t) * 2.4;
		}

		return { x, y, z };
	}

	/**
	 * Barrido del segmento recorrido por el proyectil contra la cápsula del
	 * jugador. Si el poder pasa visiblemente por encima del cuerpo, empuja
	 * ahí aunque el punto de caída calculado esté más lejos: correr recto o
	 * saltar ya no lo atraviesa sin consecuencia.
	 */
	private attackHitPlayer(
		from: ParkourPoint,
		to: ParkourPoint,
		radius: number,
		now: number
	): { player: ParkourPlayer; point: ParkourPoint } | null {
		const reach = PLAYER_BODY_RADIUS + radius;
		const dx = to.x - from.x;
		const dy = to.y - from.y;
		const dz = to.z - from.z;
		const steps = clamp(Math.ceil(Math.hypot(dx, dy, dz) / 0.2), 1, 60);

		for (const player of this.players.values()) {
			if (player.finishedAt !== null || player.respawnAt !== null) {
				continue;
			}

			if (player.protectionUntil > now) {
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
					return {
						player,
						point: { x: from.x + dx * t, y, z: from.z + dz * t }
					};
				}
			}
		}

		return null;
	}

	private updateAttacks(now: number): void {
		if (this.phaseValue !== 'playing') {
			this.attacks = [];
			this.fireCones = [];
			return;
		}

		const remaining: DeferredAttack[] = [];
		const previousNow = Math.max(0, now - this.tickDt * 1000);

		for (const attack of this.attacks) {
			const swept = this.attackHitPlayer(
				this.attackPosition(attack, Math.max(attack.at, previousNow)),
				this.attackPosition(attack, now),
				attack.kind === 'rock' ? PARKOUR_ROCK_SWEEP_RADIUS : PARKOUR_ACID_SWEEP_RADIUS,
				now
			);

			if (swept) {
				this.applyShove(
					swept.player,
					attack.kind,
					swept.point,
					attack.pushHorizontal,
					attack.pushVertical,
					now
				);
				continue;
			}

			if (now < attack.impactAt) {
				remaining.push(attack);
				continue;
			}

			this.applyShoveInRadius(
				attack.target,
				attack.radius,
				attack.kind,
				attack.pushHorizontal,
				attack.pushVertical,
				now
			);
		}

		this.attacks = remaining;

		const cones: FireCone[] = [];

		for (const cone of this.fireCones) {
			while (cone.pulsesLeft > 0 && now >= cone.nextPulseAt) {
				cone.pulsesLeft -= 1;
				cone.nextPulseAt += PARKOUR_FIRE_PULSE_MS;
				this.applyFirePulse(cone, now);
			}

			if (cone.pulsesLeft > 0 || now < cone.endAt) {
				cones.push(cone);
			}
		}

		this.fireCones = cones;
	}

	private updateWardens(now: number): void {
		if (
			this.phaseValue !== 'playing' ||
			this.startedAt === null ||
			now - this.startedAt < PARKOUR_WARDEN_ARM_DELAY_MS
		) {
			this.wardenStepAt = 0;
			return;
		}

		const deltaMs = this.wardenStepAt > 0 ? now - this.wardenStepAt : 0;
		this.wardenStepAt = now;

		for (const warden of PARKOUR_WARDENS) {
			const position = this.updateWardenPosition(warden, now, deltaMs);
			const last = this.wardenLastAttackAt.get(warden.id) ?? 0;

			if (now - last < warden.cooldownMs) {
				continue;
			}

			const target = this.pickWardenTarget(warden, now, position);

			if (!target) {
				continue;
			}

			this.wardenLastAttackAt.set(warden.id, now);
			this.launchAttack(warden, target, now, position);
		}
	}

	/**
	 * Advances the patrol/chase position of one warden. Only melee wardens
	 * (`chase`) leave their orbit, and they never cross `chaseBounds`.
	 */
	private updateWardenPosition(
		warden: ParkourWardenDefinition,
		now: number,
		deltaMs: number
	): ParkourPoint {
		if (!warden.chase) {
			return parkourWardenPosition(warden, now);
		}

		const current = this.wardenChase.get(warden.id) ?? parkourWardenPosition(warden, now);
		const next = parkourWardenChaseStep(
			warden,
			current,
			this.pickChaseTarget(warden, now),
			deltaMs,
			now
		);

		this.wardenChase.set(warden.id, next);

		return next;
	}

	/** Nearest racer inside the plaza a chasing warden is allowed to guard. */
	private pickChaseTarget(warden: ParkourWardenDefinition, now: number): ParkourPlayer | null {
		let best: ParkourPlayer | null = null;
		let bestDistance = Number.POSITIVE_INFINITY;

		for (const player of this.players.values()) {
			if (player.finishedAt !== null || player.respawnAt !== null) {
				continue;
			}

			if (player.protectionUntil > now) {
				continue;
			}

			if (Math.abs(player.y - warden.y) > PARKOUR_WARDEN_VERTICAL_REACH) {
				continue;
			}

			if (!parkourWardenCanChase(warden, player)) {
				continue;
			}

			const distance = Math.hypot(player.x - warden.x, player.z - warden.z);

			if (distance < bestDistance) {
				best = player;
				bestDistance = distance;
			}
		}

		return best;
	}

	private pickWardenTarget(
		warden: ParkourWardenDefinition,
		now: number,
		position: ParkourPoint
	): ParkourPlayer | null {
		let best: ParkourPlayer | null = null;
		let bestDistance = Number.POSITIVE_INFINITY;

		for (const player of this.players.values()) {
			if (player.finishedAt !== null || player.respawnAt !== null) {
				continue;
			}

			if (player.protectionUntil > now) {
				continue;
			}

			if (Math.abs(player.y - position.y) > PARKOUR_WARDEN_VERTICAL_REACH) {
				continue;
			}

			const distance = horizontalDistanceTo(player, position);

			if (distance > warden.range || distance >= bestDistance) {
				continue;
			}

			best = player;
			bestDistance = distance;
		}

		return best;
	}

	private launchAttack(
		warden: ParkourWardenDefinition,
		target: ParkourPlayer,
		now: number,
		position: ParkourPoint
	): void {
		const id = nextAttackId();
		const origin: ParkourPoint = { x: position.x, y: position.y + 1.8, z: position.z };
		const targetPoint: ParkourPoint = { x: target.x, y: target.y, z: target.z };
		const distance = horizontalDistanceTo(origin, targetPoint);
		const dirX = distance > 1e-4 ? (targetPoint.x - origin.x) / distance : 0;
		const dirZ = distance > 1e-4 ? (targetPoint.z - origin.z) / distance : 1;

		if (warden.power === 'fire') {
			const impactAt = now + FIRE_CONE_DURATION_MS;

			this.fireCones.push({
				id,
				warden,
				origin,
				dirX,
				dirZ,
				nextPulseAt: now,
				pulsesLeft: PARKOUR_FIRE_PULSES,
				endAt: impactAt
			});

			this.emitAttack(now, {
				id,
				wardenId: warden.id,
				kind: 'fire',
				targetId: target.id,
				origin,
				target: targetPoint,
				dx: dirX,
				dz: dirZ,
				at: now,
				impactAt
			});
			return;
		}

		if (warden.power === 'shove') {
			this.emitAttack(now, {
				id,
				wardenId: warden.id,
				kind: 'shove',
				targetId: target.id,
				origin,
				target: targetPoint,
				dx: dirX,
				dz: dirZ,
				at: now,
				impactAt: now
			});
			this.applyShove(
				target,
				'shove',
				{ x: position.x, y: position.y, z: position.z },
				warden.pushHorizontal,
				warden.pushVertical,
				now
			);
			return;
		}

		const kind = warden.power === 'rock' ? 'rock' : 'acid';
		const lead = kind === 'rock' ? PARKOUR_ROCK_TARGET_LEAD : PARKOUR_ACID_TARGET_LEAD;
		// Anticipa el desplazamiento reportado: correr en línea recta ya no
		// deja al jugador fuera del radio de empuje. Cambiar de dirección (o
		// frenar) después del lanzamiento sigue esquivando.
		const initialFlightMs = clamp(550 + (distance / 22) * 900, 550, 1_450);
		const aimPoint: ParkourPoint = {
			x: target.x + target.vx * (initialFlightMs / 1000) * lead,
			y: target.y,
			z: target.z + target.vz * (initialFlightMs / 1000) * lead
		};
		const aimDistance = horizontalDistanceTo(origin, aimPoint);
		const flightMs = clamp(550 + (aimDistance / 22) * 900, 550, 1_450);
		const impactAt = now + flightMs;
		const aimDirX = aimDistance > 1e-4 ? (aimPoint.x - origin.x) / aimDistance : 0;
		const aimDirZ = aimDistance > 1e-4 ? (aimPoint.z - origin.z) / aimDistance : 1;

		this.attacks.push({
			id,
			wardenId: warden.id,
			kind,
			origin,
			target: aimPoint,
			at: now,
			impactAt,
			radius: warden.impactRadius,
			pushHorizontal: warden.pushHorizontal,
			pushVertical: warden.pushVertical
		});

		this.emitAttack(now, {
			id,
			wardenId: warden.id,
			kind,
			targetId: target.id,
			origin,
			target: aimPoint,
			dx: aimDirX,
			dz: aimDirZ,
			at: now,
			impactAt
		});
	}

	private emitAttack(now: number, attack: Mg7WardenAttack): void {
		this.emitEvent('warden-attack', now, { attack });
	}

	private applyFirePulse(cone: FireCone, now: number): void {
		const warden = cone.warden;

		for (const player of this.players.values()) {
			if (player.finishedAt !== null || player.respawnAt !== null) {
				continue;
			}

			if (
				player.protectionUntil > now ||
				Math.abs(player.y - (cone.origin.y - 1.8)) > PARKOUR_WARDEN_VERTICAL_REACH
			) {
				continue;
			}

			const dx = player.x - cone.origin.x;
			const dz = player.z - cone.origin.z;
			const distance = Math.hypot(dx, dz);

			if (distance > warden.range || distance < 1e-4) {
				continue;
			}

			const dot = (dx / distance) * cone.dirX + (dz / distance) * cone.dirZ;

			if (dot < FIRE_CONE_COS) {
				continue;
			}

			this.applyShove(player, 'fire', cone.origin, warden.pushHorizontal, warden.pushVertical, now);
		}
	}

	private applyShoveInRadius(
		point: ParkourPoint,
		radius: number,
		kind: 'rock' | 'acid',
		pushHorizontal: number,
		pushVertical: number,
		now: number
	): void {
		for (const player of this.players.values()) {
			if (player.finishedAt !== null || player.respawnAt !== null) {
				continue;
			}

			if (player.protectionUntil > now) {
				continue;
			}

			if (horizontalDistanceTo(player, point) > radius) {
				continue;
			}

			if (Math.abs(player.y - point.y) > 4.0) {
				continue;
			}

			this.applyShove(player, kind, point, pushHorizontal, pushVertical, now);
		}
	}

	private applyShove(
		player: ParkourPlayer,
		kind: Mg7WardenAttack['kind'],
		origin: ParkourPoint,
		pushHorizontal: number,
		pushVertical: number,
		now: number
	): void {
		if (player.finishedAt !== null || player.respawnAt !== null) {
			return;
		}

		if (player.protectionUntil > now) {
			return;
		}

		// Empuje radial desde el origen del ataque (ancla, impacto o cono).
		const offsetX = player.x - origin.x;
		const offsetZ = player.z - origin.z;
		const distance = Math.hypot(offsetX, offsetZ);
		const dirX = distance > 1e-4 ? offsetX / distance : 0;
		const dirZ = distance > 1e-4 ? offsetZ / distance : -1;
		const horizontal = clamp(pushHorizontal, 0, PARKOUR_MAX_PUSH_HORIZONTAL);
		const vertical = clamp(pushVertical, 0, PARKOUR_MAX_PUSH_VERTICAL);

		this.emitEvent('shove', now, {
			playerId: player.id,
			power: kind,
			dx: round(dirX * horizontal, 3),
			dy: round(vertical, 3),
			dz: round(dirZ * horizontal, 3)
		});
	}

	// ------------------------------------------------------------------
	// Fin de partida
	// ------------------------------------------------------------------

	private finishMatch(now: number): void {
		if (this.phaseValue !== 'playing') {
			return;
		}

		const order = this.raceOrder();
		this.winnerId = order[0]?.id ?? null;
		this.phaseValue = 'results';
		this.resultEndsAt = now + PARKOUR_RESULTS_MS;
		this.finishGraceEndsAt = null;
		this.attacks = [];
		this.fireCones = [];
		this.matchEndsAt = null;

		for (const player of this.players.values()) {
			player.respawnAt = null;
			player.fallSince = null;
		}

		this.emitEvent('match-end', now, { winnerId: this.winnerId });
		this.stateDirty = true;

		if (this.matchId && this.winnerId) {
			void attestEvent({
				source: 'parkour',
				matchId: this.matchId,
				wsId: this.winnerId,
				metric: 'parkour.wins',
				eventKey: 'win'
			});
		}
	}

	private distanceToNext(player: ParkourPlayer): number {
		const next = player.checkpoint + 1;
		const target =
			next >= PARKOUR_FINISH.index
				? { x: PARKOUR_FINISH.x, y: PARKOUR_FINISH.y, z: PARKOUR_FINISH.z }
				: parkourCheckpointAt(next);

		if (!target) {
			return 0;
		}

		return horizontalDistanceTo(player, target);
	}

	private raceOrder(): ParkourPlayer[] {
		return [...this.players.values()].sort((a, b) => {
			if (a.finishedAt !== null || b.finishedAt !== null) {
				if (a.finishedAt === null) return 1;
				if (b.finishedAt === null) return -1;
				if (a.finishedAt !== b.finishedAt) return a.finishedAt - b.finishedAt;
			}

			if (a.checkpoint !== b.checkpoint) return b.checkpoint - a.checkpoint;
			if (a.falls !== b.falls) return a.falls - b.falls;

			const distance = this.distanceToNext(a) - this.distanceToNext(b);

			if (Math.abs(distance) > 0.001) return distance;

			return a.name.localeCompare(b.name);
		});
	}

	// ------------------------------------------------------------------
	// Snapshots y broadcasts
	// ------------------------------------------------------------------

	private copyPlayer(player: ParkourPlayer): Mg7Snapshot['players'][number] {
		return {
			id: player.id,
			name: player.name,
			skin: player.skin,
			checkpoint: player.checkpoint,
			nextCheckpoint: Math.min(PARKOUR_FINISH.index, player.checkpoint + 1),
			falls: player.falls,
			x: round(player.x),
			y: round(player.y),
			z: round(player.z),
			yaw: round(player.yaw, 3),
			finishedAt: player.finishedAt,
			respawnAt: player.respawnAt,
			protectionUntil: player.protectionUntil > 0 ? player.protectionUntil : null
		};
	}

	buildSnapshot(now: number): Mg7Snapshot {
		const endsAt =
			this.phaseValue === 'countdown'
				? this.countdownEndsAt
				: this.phaseValue === 'playing'
					? this.matchEndsAt
					: this.phaseValue === 'results'
						? this.resultEndsAt
						: null;

		return {
			phase: this.phaseValue,
			serverTime: now,
			endsAt,
			countdownEndsAt: this.phaseValue === 'countdown' ? this.countdownEndsAt : null,
			startedAt: this.startedAt,
			maxPlayers: PARKOUR_MAX_PLAYERS,
			players: this.raceOrder().map((player) => this.copyPlayer(player)),
			winnerId: this.winnerId
		};
	}

	private broadcast(now: number): void {
		if (this.phaseValue === 'idle') {
			return;
		}

		if (this.stateDirty && now >= this.nextStateAt) {
			this.stateDirty = false;
			this.nextStateAt = now + STATE_INTERVAL_MS;
			this.port.broadcast({ type: 'mg7-state', state: this.buildSnapshot(now) });
		}

		if (now - this.lastPositionsAt < POSITION_INTERVAL_MS) {
			return;
		}

		this.lastPositionsAt = now;

		const positions: Mg7Positions = {
			at: now,
			players: [...this.players.values()].map((player) => ({
				id: player.id,
				x: round(player.x),
				y: round(player.y),
				z: round(player.z),
				yaw: round(player.yaw, 3)
			}))
		};

		this.port.broadcast({ type: 'mg7-positions', ...positions });
	}

	private emitEvent(kind: Mg7EventKind, now: number, extra: Partial<Mg7Event> = {}): void {
		const event: Mg7Event = { kind, at: now, ...extra };
		this.port.broadcast({ type: 'mg7-event', event });
	}

	private resetMatch(): void {
		this.phaseValue = 'idle';
		this.players.clear();
		this.recent.clear();
		this.attacks = [];
		this.fireCones = [];
		this.wardenLastAttackAt.clear();
		this.wardenChase.clear();
		this.wardenStepAt = 0;
		this.countdownEndsAt = null;
		this.matchEndsAt = null;
		this.resultEndsAt = null;
		this.startedAt = null;
		this.winnerId = null;
		this.matchId = null;
		this.countdownShortened = false;
		this.finishGraceEndsAt = null;
		this.finishOrder = 0;
		this.nextSeq = 1;
		this.lastPositionsAt = 0;
		this.nextStateAt = 0;
		this.stateDirty = true;
	}

	// ------------------------------------------------------------------
	// Introspección (scripts de verificación)
	// ------------------------------------------------------------------

	get phaseName(): Mg7Phase {
		return this.phaseValue;
	}

	get playerCount(): number {
		return this.players.size;
	}

	get checkpointNames(): string[] {
		return PARKOUR_CHECKPOINTS.map((checkpoint) => parkourCheckpointName(checkpoint.index));
	}
}
