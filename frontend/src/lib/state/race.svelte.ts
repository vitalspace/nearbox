import type {
	RaceCarStateReport,
	RaceEvent,
	RaceModel,
	RacePlayerState,
	RacePosition,
	RaceSnapshot,
	RaceStatus
} from '../services/protocol';
import { MISSION_RACE_5_LAPS } from '../missions/minigames';
import { MAX_SPEED } from './raceConfig';
import { raceInput } from './raceInput';
import { REMOTE_RENDER_DELAY_MS } from './remoteSync';
import { missions } from './missions.svelte';
import { stats } from './stats.svelte';

export type RaceSender = {
	state(report: RaceCarStateReport): boolean;
	useItem(): boolean;
	reset(): boolean;
	impact(impactSpeed: number, cause: 'collision' | 'rollover'): boolean;
};

export type RacePointRequest = {
	x: number;
	y: number;
	z: number;
};

/**
 * Remote cars are rendered 200 ms in the past and interpolated between the
 * 10 Hz position packets. Two packet intervals absorb server tick jitter
 * without adding noticeable input latency to your own car.
 */
const INTERP_DELAY_MS = REMOTE_RENDER_DELAY_MS;
/** At 10 Hz, 24 samples cover ~2.4 s of buffer. */
const INTERP_BUFFER_SIZE = 24;

type TimedPosition = {
	at: number;
	position: RacePosition;
};

class RaceStore {
	snapshot = $state.raw<RaceSnapshot | null>(null);
	positions = $state.raw<Record<string, RacePosition>>({});
	selfId = $state<string | null>(null);
	lastEvent = $state<RaceEvent | null>(null);
	/** Contador monotónico de sesión para consumir `lastEvent` una sola vez. */
	eventSeq = $state(0);
	/** Last car model assigned to the local player; reused by the Haunted Highway. */
	lastModel = $state<RaceModel | null>(null);
	/** Consumed by `PlayerCollider` to teleport out of the race. */
	exitRequest = $state<RacePointRequest | null>(null);
	entryRequest = $state<RacePointRequest | null>(null);

	private sender: RaceSender | null = null;
	private serverOffsetMs = 0;
	private clockReady = false;
	private buffers = new Map<string, TimedPosition[]>();
	/** Last `respawnSeq` seen for the local player; a change means a teleport. */
	private selfRespawnSeq = -1;

	get phase() {
		return this.snapshot?.phase ?? 'idle';
	}

	get self(): RacePlayerState | null {
		const id = this.selfId;

		if (!id) {
			return null;
		}

		return this.snapshot?.players.find((player) => player.id === id) ?? null;
	}

	get inCar(): boolean {
		return this.self !== null;
	}

	get racerIds(): Set<string> {
		const ids = new Set<string>();

		for (const player of this.snapshot?.players ?? []) {
			ids.add(player.id);
		}

		return ids;
	}

	get lap(): number {
		return this.self?.lap ?? 0;
	}

	get displayLap(): number {
		const self = this.self;

		if (!self) {
			return 0;
		}

		const total = this.snapshot?.totalLaps ?? 5;

		if (self.status === 'finished') {
			return total;
		}

		return Math.min(total, self.lap + 1);
	}

	get gate(): number {
		return this.self?.gate ?? 0;
	}

	get item() {
		return this.self?.item ?? null;
	}

	get health(): number {
		return this.self?.health ?? 100;
	}

	get maxHealth(): number {
		return this.self?.maxHealth ?? 100;
	}

	get speed(): number {
		const id = this.selfId;

		if (!id) {
			return 0;
		}

		return this.positions[id]?.speed ?? this.self?.speed ?? 0;
	}

	get rank(): number {
		return this.self?.rank ?? 0;
	}

	get status(): RaceStatus | null {
		return this.self?.status ?? null;
	}

	get nitroActive(): boolean {
		const until = this.self?.nitroUntil;

		return until !== null && until !== undefined && until > this.serverNow();
	}

	get shieldActive(): boolean {
		const until = this.self?.shieldUntil;

		return until !== null && until !== undefined && until > this.serverNow();
	}

	get autoRepairActive(): boolean {
		const until = this.self?.autoRepairUntil;

		return until !== null && until !== undefined && until > this.serverNow();
	}

	private staticPosition(id: string): RacePosition | null {
		const live = this.positions[id];

		if (live) {
			return live;
		}

		const player = this.snapshot?.players.find((entry) => entry.id === id);

		if (!player) {
			return null;
		}

		const half = player.yaw / 2;

		return {
			id: player.id,
			x: player.x,
			y: player.y,
			z: player.z,
			qx: 0,
			qy: Math.sin(half),
			qz: 0,
			qw: Math.cos(half),
			vx: 0,
			vy: 0,
			vz: 0,
			speed: player.speed,
			steering: 0,
			health: player.health,
			lap: player.lap,
			gate: player.gate,
			status: player.status
		};
	}

	/**
	 * Returns the position of a racer. Remote cars are interpolated 150 ms in
	 * the past between the 10 Hz position packets, with no per-frame arrays.
	 */
	positionFor(id: string, now = this.serverNow()): RacePosition | null {
		const buffer = this.buffers.get(id);

		if (!buffer || buffer.length === 0) {
			return this.staticPosition(id);
		}

		const target = now - INTERP_DELAY_MS;
		let a: TimedPosition;
		let b: TimedPosition;
		let alpha = 0;

		if (target <= buffer[0].at) {
			a = buffer[0];
			b = buffer[0];
		} else if (target >= buffer[buffer.length - 1].at) {
			a = buffer[buffer.length - 1];
			b = a;
		} else {
			let index = 1;

			while (index < buffer.length && buffer[index].at < target) {
				index += 1;
			}

			a = buffer[index - 1];
			b = buffer[index];

			const span = b.at - a.at;
			alpha = span > 0 ? (target - a.at) / span : 0;
		}

		const pa = a.position;
		const pb = b.position;
		// A fresh object per call keeps Svelte's `$derived` graph invalidating
		// remote cars. Mutating a cached object returned the same reference, so
		// `RaceCar`'s snapshot derived never re-ran and remote cars stayed frozen.
		const out: RacePosition = {
			id,
			x: pa.x + (pb.x - pa.x) * alpha,
			y: pa.y + (pb.y - pa.y) * alpha,
			z: pa.z + (pb.z - pa.z) * alpha,
			qx: 0,
			qy: 0,
			qz: 0,
			qw: 1,
			vx: 0,
			vy: 0,
			vz: 0,
			speed: 0,
			steering: 0,
			health: 0,
			lap: 0,
			gate: 0,
			status: 'grid'
		};

		// Normalised linear interpolation avoids the shortest-arc bookkeeping of
		// slerp while keeping rotations continuous at 10 Hz.
		let qx = pb.qx;
		let qy = pb.qy;
		let qz = pb.qz;
		let qw = pb.qw;
		const dot = pa.qx * qx + pa.qy * qy + pa.qz * qz + pa.qw * qw;

		if (dot < 0) {
			qx = -qx;
			qy = -qy;
			qz = -qz;
			qw = -qw;
		}

		const qLength =
			Math.hypot(
				pa.qx + (qx - pa.qx) * alpha,
				pa.qy + (qy - pa.qy) * alpha,
				pa.qz + (qz - pa.qz) * alpha,
				pa.qw + (qw - pa.qw) * alpha
			) || 1;

		out.qx = (pa.qx + (qx - pa.qx) * alpha) / qLength;
		out.qy = (pa.qy + (qy - pa.qy) * alpha) / qLength;
		out.qz = (pa.qz + (qz - pa.qz) * alpha) / qLength;
		out.qw = (pa.qw + (qw - pa.qw) * alpha) / qLength;

		out.vx = pb.vx;
		out.vy = pb.vy;
		out.vz = pb.vz;
		out.speed = pb.speed;
		out.steering = pb.steering;
		out.health = pb.health;
		out.lap = pb.lap;
		out.gate = pb.gate;
		out.status = pb.status;

		return out;
	}

	setSender(sender: RaceSender): void {
		this.sender = sender;
	}

	/**
	 * Smooths the server-clock estimate. Replacing it outright on every 1 Hz
	 * snapshot made the interpolation target jump whenever packet delay
	 * fluctuated, which showed up as remote cars stuttering.
	 */
	private syncClock(serverTime: number, weight: number): void {
		const measured = serverTime - Date.now();

		if (!this.clockReady) {
			this.serverOffsetMs = measured;
			this.clockReady = true;
			return;
		}

		this.serverOffsetMs += (measured - this.serverOffsetMs) * weight;
	}

	applySnapshot(snapshot: RaceSnapshot): void {
		this.syncClock(snapshot.serverTime, 0.15);
		this.snapshot = snapshot;

		const self = this.selfId
			? snapshot.players.find((player) => player.id === this.selfId)
			: undefined;

		if (self) {
			// A reset/respawn teleports the car. Drop the interpolated samples
			// from before the teleport, otherwise the client snaps the body to
			// the old upside-down pose and pressing R looks like it did nothing.
			if (self.respawnSeq !== this.selfRespawnSeq) {
				this.selfRespawnSeq = self.respawnSeq;
				this.buffers.delete(self.id);

				// `positionFor` falls back to `positions` before the snapshot, so
				// drop the stale entry too and let the authoritative snapshot
				// place the car until the next 10 Hz packet arrives.
				if (this.positions[self.id]) {
					const positions = { ...this.positions };
					delete positions[self.id];
					this.positions = positions;
				}
			}

			if (self.model !== this.lastModel) {
				this.lastModel = self.model;
			}
		}
	}

	/** Estimated server clock, used by the overlays for `endsAt`. */
	serverNow(): number {
		return Date.now() + this.serverOffsetMs;
	}

	applyPositions(players: RacePosition[], at = Date.now()): void {
		// 10 Hz packets keep the estimate fresh without the 1 s jumps.
		this.syncClock(at, 0.05);

		const next: Record<string, RacePosition> = {};
		const alive = new Set<string>();

		for (const player of players) {
			next[player.id] = player;
			alive.add(player.id);

			const buffer = this.buffers.get(player.id) ?? [];
			const last = buffer[buffer.length - 1];
			// Two server ticks can sample the same client report. Pushing that
			// flat pair makes interpolation pause for a frame; skip exact repeats
			// so the car keeps moving between real samples.
			const repeated =
				last !== undefined &&
				Math.abs(last.position.x - player.x) < 0.0005 &&
				Math.abs(last.position.y - player.y) < 0.0005 &&
				Math.abs(last.position.z - player.z) < 0.0005 &&
				Math.abs(last.position.qx - player.qx) < 0.000001 &&
				Math.abs(last.position.qy - player.qy) < 0.000001 &&
				Math.abs(last.position.qz - player.qz) < 0.000001 &&
				Math.abs(last.position.qw - player.qw) < 0.000001 &&
				last.position.speed === player.speed &&
				last.position.steering === player.steering;

			if (!repeated) {
				buffer.push({ at, position: player });
			}

			if (buffer.length > INTERP_BUFFER_SIZE) {
				buffer.splice(0, buffer.length - INTERP_BUFFER_SIZE);
			}

			this.buffers.set(player.id, buffer);
		}

		for (const id of this.buffers.keys()) {
			if (!alive.has(id)) {
				this.buffers.delete(id);
			}
		}

		this.positions = next;
	}

	applyEvent(event: RaceEvent): void {
		this.lastEvent = event;
		this.eventSeq += 1;

		const selfId = this.selfId;

		if (!selfId) {
			return;
		}

		const isSelf = event.playerId === selfId;

		switch (event.kind) {
			case 'race-start':
				stats.startMission('race');
				break;
			case 'lap-completed':
				if (isSelf) {
					stats.recordLap();
				}
				break;
			case 'player-finished':
				if (isSelf) {
					// The finish line does not emit `lap-completed`, so the
					// final lap is added here.
					stats.recordLap();
					stats.recordRaceFinish();
				}
				break;
			case 'race-ended':
				if (isSelf) {
					stats.recordRaceWin();

					if (this.snapshot?.track === 'grand-prix') {
						missions.completeMinigameMission(MISSION_RACE_5_LAPS.id);
					}
				}
				break;
			case 'player-destroyed':
				if (isSelf) {
					stats.recordDeath('race');
				}
				break;
		}
	}

	sendState(report: RaceCarStateReport): boolean {
		const speed = Math.min(MAX_SPEED, Math.max(0, report.speed));

		return (
			this.sender?.state({
				...report,
				speed
			}) ?? false
		);
	}

	useItem(): boolean {
		return this.sender?.useItem() ?? false;
	}

	requestReset(): boolean {
		return this.sender?.reset() ?? false;
	}

	sendImpact(impactSpeed: number, cause: 'collision' | 'rollover'): boolean {
		return this.sender?.impact(impactSpeed, cause) ?? false;
	}

	consumeExit(): void {
		this.exitRequest = null;
	}

	consumeEntry(): void {
		this.entryRequest = null;
	}

	/** Clears driving-only state without touching the server snapshot. */
	resetDriving(): void {
		raceInput.reset();
	}

	/**
	 * Drops the room snapshot when the local player leaves `minigame-3`.
	 * Keeps `selfId` and the sender so the store is ready for the next race.
	 */
	clearSnapshot(): void {
		this.snapshot = null;
		this.positions = {};
		this.buffers.clear();
		this.selfRespawnSeq = -1;
		this.lastEvent = null;
		this.serverOffsetMs = 0;
		this.clockReady = false;
		raceInput.reset();
	}

	reset(): void {
		this.snapshot = null;
		this.positions = {};
		this.buffers.clear();
		this.selfRespawnSeq = -1;
		this.selfId = null;
		this.lastEvent = null;
		this.exitRequest = null;
		this.entryRequest = null;
		this.sender = null;
		this.serverOffsetMs = 0;
		this.clockReady = false;
		raceInput.reset();
	}
}

export const race = new RaceStore();
