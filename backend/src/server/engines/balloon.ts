import {
	BALLOON_MAX_RADIUS,
	BALLOON_MAX_Y,
	BALLOON_MIN_Y,
	BALLOON_SPAWN,
	type BalloonState,
	type BalloonStateReport,
	type Player,
	type ServerMessage
} from '../protocol';
import type { RoomPort } from '../port';

/**
 * Authoritative state of the hot-air balloon on the outdoor map.
 *
 * As with the cars, the driver simulates the flight on their client and reports
 * the state at 10 Hz; the server keeps the last accepted state, validates it and
 * fans it out to every player. The balloon cannot leave the map: both the client
 * and this engine clamp the position to the flight envelope.
 */

const MAX_HORIZONTAL_SPEED = 20;
const MAX_VERTICAL_SPEED = 12;
const MAX_COORD = 1000;
const ENTER_RADIUS = 7;
const ENTER_MAX_DY = 6;
/** The crew must be close to the ground to jump out of the basket. */
const EXIT_MAX_Y = 4;
/** How far from the balloon a cannon shot may start (anti-spoof). */
const CANNON_MAX_DISTANCE = 7;

export type BalloonCannon = 'front' | 'left' | 'right';
export type BalloonCannonSeat = 'pilot' | 'left' | 'right';

const STATE_RATE_WINDOW_MS = 1000;
const STATE_RATE_MAX = 20;
const TELEPORT_TOLERANCE = 4;
const POSITION_STALE_MS = 15_000;

type BalloonRuntime = BalloonState & {
	rateWindowStart: number;
	rateCount: number;
};

export type BalloonDeps = {
	listGlobal: () => Player[];
	log?: (event: string, data: Record<string, unknown>) => void;
};

function round(value: number): number {
	return Math.round(value * 1000) / 1000;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function createRuntime(now = Date.now()): BalloonRuntime {
	return {
		driverId: null,
		driverName: null,
		leftGunnerId: null,
		leftGunnerName: null,
		rightGunnerId: null,
		rightGunnerName: null,
		position: { ...BALLOON_SPAWN },
		rotation: { x: 0, y: 0, z: 0, w: 1 },
		velocity: { x: 0, y: 0, z: 0 },
		speed: 0,
		updatedAt: now,
		rateWindowStart: 0,
		rateCount: 0
	};
}

function copyBalloon(balloon: BalloonRuntime): BalloonState {
	return {
		driverId: balloon.driverId,
		driverName: balloon.driverName,
		leftGunnerId: balloon.leftGunnerId,
		leftGunnerName: balloon.leftGunnerName,
		rightGunnerId: balloon.rightGunnerId,
		rightGunnerName: balloon.rightGunnerName,
		position: { ...balloon.position },
		rotation: { ...balloon.rotation },
		velocity: { ...balloon.velocity },
		speed: round(balloon.speed),
		updatedAt: balloon.updatedAt
	};
}

/** Keeps the balloon inside the town walls and below the flight ceiling. */
function clampToMap(position: { x: number; y: number; z: number }): void {
	const radius = Math.hypot(position.x, position.z);

	if (radius > BALLOON_MAX_RADIUS) {
		const scale = BALLOON_MAX_RADIUS / radius;
		position.x *= scale;
		position.z *= scale;
	}

	position.y = clamp(position.y, BALLOON_MIN_Y, BALLOON_MAX_Y);
}

export class Balloon {
	private runtime = createRuntime();
	private readonly lastPositions = new Map<
		string,
		{ x: number; y: number; z: number; at: number }
	>();

	constructor(
		private readonly port: RoomPort,
		private readonly deps: BalloonDeps
	) {}

	private publish(message: ServerMessage): void {
		this.port.broadcast(message);
	}

	private reportError(playerId: string, code: string, message: string): void {
		this.deps.log?.('balloon rejected', { playerId, code, message });
		this.port.sendTo(playerId, { type: 'error', code, message });
	}

	private broadcast(now: number): void {
		this.publish({ type: 'balloon-state', serverTime: now, balloon: copyBalloon(this.runtime) });
	}

	private resetToSpawn(now: number): void {
		this.runtime = createRuntime(now);
	}

	/** Current state, used for logs and debugging. */
	getState(): BalloonState {
		return copyBalloon(this.runtime);
	}

	reset(): void {
		this.lastPositions.clear();
		this.resetToSpawn(Date.now());
	}

	snapshot(now = Date.now()): Extract<ServerMessage, { type: 'balloon-state' }> {
		return { type: 'balloon-state', serverTime: now, balloon: copyBalloon(this.runtime) };
	}

	/** Seat held by a player, if any. */
	seatOf(playerId: string): BalloonCannonSeat | null {
		if (this.runtime.driverId === playerId) return 'pilot';
		if (this.runtime.leftGunnerId === playerId) return 'left';
		if (this.runtime.rightGunnerId === playerId) return 'right';
		return null;
	}

	private clearSeat(seat: BalloonCannonSeat): void {
		if (seat === 'pilot') {
			this.runtime.driverId = null;
			this.runtime.driverName = null;
		} else if (seat === 'left') {
			this.runtime.leftGunnerId = null;
			this.runtime.leftGunnerName = null;
		} else {
			this.runtime.rightGunnerId = null;
			this.runtime.rightGunnerName = null;
		}
	}

	private seatTaken(seat: BalloonCannonSeat): boolean {
		if (seat === 'pilot') return this.runtime.driverId !== null;
		if (seat === 'left') return this.runtime.leftGunnerId !== null;
		return this.runtime.rightGunnerId !== null;
	}

	private assignSeat(seat: BalloonCannonSeat, player: Player, now: number): void {
		if (seat === 'pilot') {
			this.runtime.driverId = player.id;
			this.runtime.driverName = player.name;
			this.runtime.velocity = { x: 0, y: 0, z: 0 };
			this.runtime.speed = 0;
			this.runtime.rateWindowStart = now;
			this.runtime.rateCount = 0;
		} else if (seat === 'left') {
			this.runtime.leftGunnerId = player.id;
			this.runtime.leftGunnerName = player.name;
		} else {
			this.runtime.rightGunnerId = player.id;
			this.runtime.rightGunnerName = player.name;
		}
	}

	onEnter(player: Player, now = Date.now()): void {
		if (player.lobbyId !== 'global') {
			this.reportError(player.id, 'NOT_IN_GLOBAL', 'You can only fly on the outdoor map');
			return;
		}

		if (this.seatOf(player.id)) {
			this.reportError(player.id, 'BALLOON_OCCUPIED', 'You are already aboard');
			return;
		}

		// The pilot takes the front cannon; the next two players man the sides.
		const seat: BalloonCannonSeat | null = !this.runtime.driverId
			? 'pilot'
			: !this.runtime.leftGunnerId
				? 'left'
				: !this.runtime.rightGunnerId
					? 'right'
					: null;

		if (!seat) {
			this.reportError(player.id, 'BALLOON_OCCUPIED', 'The balloon is occupied');
			return;
		}

		const last = this.lastPositions.get(player.id);

		if (last && now - last.at <= POSITION_STALE_MS) {
			const horizontal = Math.hypot(
				last.x - this.runtime.position.x,
				last.z - this.runtime.position.z
			);
			const vertical = Math.abs(last.y - this.runtime.position.y);

			if (horizontal > ENTER_RADIUS || vertical > ENTER_MAX_DY) {
				this.reportError(player.id, 'BALLOON_TOO_FAR', 'You are too far from the balloon');
				return;
			}
		}

		if (seat === 'pilot') {
			this.assignSeat('pilot', player, now);
		} else {
			this.assignSeat(seat, player, now);
		}

		this.runtime.updatedAt = now;
		this.lastPositions.delete(player.id);
		this.broadcast(now);
	}

	onExit(playerId: string, now = Date.now()): void {
		const seat = this.seatOf(playerId);

		if (!seat) {
			this.reportError(playerId, 'NOT_ABOARD', 'You are not aboard the balloon');
			return;
		}

		if (this.runtime.position.y > EXIT_MAX_Y) {
			this.reportError(playerId, 'BALLOON_TOO_HIGH', 'Land the balloon before leaving the basket');
			return;
		}

		if (seat === 'pilot') {
			// Without a pilot the balloon must not stay crewed in the air: the
			// gunners are dropped beside it as well.
			this.clearSeat('pilot');
			this.clearSeat('left');
			this.clearSeat('right');
			this.runtime.velocity = { x: 0, y: 0, z: 0 };
			this.runtime.speed = 0;
		} else {
			this.clearSeat(seat);
		}

		this.runtime.updatedAt = now;

		this.broadcast(now);
	}

	/**
	 * Moves an already-seated player to another seat without leaving the
	 * basket. Only free seats are accepted: swapping would need the other
	 * player's consent, so the client offers the next free seat instead.
	 */
	onSwitchSeat(player: Player, seat: BalloonCannonSeat, now = Date.now()): void {
		if (player.lobbyId !== 'global') {
			this.reportError(player.id, 'NOT_IN_GLOBAL', 'You can only fly on the outdoor map');
			return;
		}

		const current = this.seatOf(player.id);

		if (!current) {
			this.reportError(player.id, 'NOT_ABOARD', 'You are not aboard the balloon');
			return;
		}

		if (current === seat) {
			// Nothing to do, but acknowledge so the client does not keep asking.
			this.port.sendTo(player.id, this.snapshot(now));
			return;
		}

		if (this.seatTaken(seat)) {
			this.reportError(player.id, 'BALLOON_SEAT_TAKEN', 'That seat is already taken');
			return;
		}

		this.clearSeat(current);
		this.assignSeat(seat, player, now);

		// Leaving the controls parks the balloon where it is; taking them over
		// starts from rest so the client never inherits stale momentum.
		if (current === 'pilot' || seat === 'pilot') {
			this.runtime.velocity = { x: 0, y: 0, z: 0 };
			this.runtime.speed = 0;
		}

		this.runtime.updatedAt = now;
		this.broadcast(now);
	}

	/**
	 * Whether `playerId` may fire `cannon` from `(x, y, z)`.
	 * The seat is authoritative; the origin check blocks clients that try to
	 * shoot from across the map while seated.
	 */
	canFire(playerId: string, cannon: BalloonCannon, x: number, y: number, z: number): boolean {
		const seat = this.seatOf(playerId);

		if (cannon === 'front' ? seat !== 'pilot' : cannon === 'left' ? seat !== 'left' : seat !== 'right') {
			return false;
		}

		if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
			return false;
		}

		const distance = Math.hypot(
			x - this.runtime.position.x,
			y - (this.runtime.position.y + 1.76),
			z - this.runtime.position.z
		);

		return distance <= CANNON_MAX_DISTANCE;
	}

	onState(
		playerId: string,
		state: BalloonStateReport,
		now = Date.now()
	): void {
		if (!this.runtime.driverId) {
			this.reportError(playerId, 'NOT_FLYING', 'Nobody is flying the balloon');
			return;
		}

		if (this.runtime.driverId !== playerId) {
			this.reportError(playerId, 'NOT_PILOT', 'Only the pilot can report the flight');
			return;
		}

		if (now - this.runtime.rateWindowStart >= STATE_RATE_WINDOW_MS) {
			this.runtime.rateWindowStart = now;
			this.runtime.rateCount = 0;
		}

		this.runtime.rateCount += 1;

		if (this.runtime.rateCount > STATE_RATE_MAX) {
			this.reportError(playerId, 'BALLOON_RATE_LIMITED', 'Too many flight reports per second');
			return;
		}

		if (
			[state.x, state.y, state.z, state.vx, state.vy, state.vz, state.speed].some(
				(value) => !Number.isFinite(value) || Math.abs(value) > MAX_COORD
			)
		) {
			this.reportError(playerId, 'BALLOON_INVALID_STATE', 'Balloon state out of range');
			return;
		}

		const norm = Math.hypot(state.qx, state.qy, state.qz, state.qw);

		if (!Number.isFinite(norm) || norm < 0.1 || norm > 10) {
			this.reportError(playerId, 'BALLOON_INVALID_STATE', 'Invalid rotation quaternion');
			return;
		}

		const horizontalSpeed = Math.hypot(state.vx, state.vz);

		if (horizontalSpeed > MAX_HORIZONTAL_SPEED + 1 || Math.abs(state.vy) > MAX_VERTICAL_SPEED + 1) {
			this.reportError(playerId, 'BALLOON_INVALID_STATE', 'Speed out of range');
			return;
		}

		const elapsed = Math.max(0.001, (now - this.runtime.updatedAt) / 1000);
		const allowed = MAX_HORIZONTAL_SPEED * elapsed + TELEPORT_TOLERANCE;
		const travelled = Math.hypot(
			state.x - this.runtime.position.x,
			state.y - this.runtime.position.y,
			state.z - this.runtime.position.z
		);

		if (travelled > allowed) {
			this.reportError(playerId, 'BALLOON_TELEPORT', 'Position jump too large');
			return;
		}

		const position = { x: state.x, y: state.y, z: state.z };
		clampToMap(position);

		this.runtime.position = position;
		this.runtime.rotation = {
			x: state.qx / norm,
			y: state.qy / norm,
			z: state.qz / norm,
			w: state.qw / norm
		};
		this.runtime.velocity = { x: state.vx, y: state.vy, z: state.vz };
		this.runtime.speed = Math.min(horizontalSpeed, MAX_HORIZONTAL_SPEED);
		this.runtime.updatedAt = now;

		// Needed to validate the next entry after landing.
		this.lastPositions.set(playerId, { x: state.x, y: state.y, z: state.z, at: now });
	}

	onPlayerPosition(playerId: string, x: number, y: number, z: number, now = Date.now()): void {
		this.lastPositions.set(playerId, { x, y, z, at: now });
	}

	onPlayerLeave(playerId: string, _cause = 'disconnect', now = Date.now()): void {
		this.lastPositions.delete(playerId);

		const seat = this.seatOf(playerId);

		if (!seat) {
			return;
		}

		if (seat === 'pilot') {
			// A balloon abandoned in the air would be unreachable, so it returns
			// to its spawn when the pilot disconnects or changes scene.
			this.resetToSpawn(now);
		} else {
			this.clearSeat(seat);

			// Same protection when the last gunner drops out: the balloon may be
			// parked in the air after the pilot moved to a cannon seat.
			const crewAboard =
				this.runtime.driverId || this.runtime.leftGunnerId || this.runtime.rightGunnerId;

			if (!crewAboard && this.runtime.position.y > EXIT_MAX_Y) {
				this.resetToSpawn(now);
			} else {
				this.runtime.updatedAt = now;
			}
		}

		this.broadcast(now);
	}

	tick(now = Date.now()): void {
		if (!this.runtime.driverId) {
			return;
		}

		this.broadcast(now);
	}
}
