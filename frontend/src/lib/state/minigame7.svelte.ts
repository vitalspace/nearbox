import type {
	Mg7Event,
	Mg7EventKind,
	Mg7Phase,
	Mg7PlayerState,
	Mg7Position,
	Mg7Positions,
	Mg7Snapshot
} from '../services/protocol';
import { MISSION_PARKOUR_SUMMIT } from '../missions/minigames';
import { missions } from './missions.svelte';
import {
	lerp,
	lerpAngle,
	REMOTE_RENDER_DELAY_MS,
	SampleBuffer,
	ServerClock,
	sameNumber
} from './remoteSync';

/** Empuje autoritativo que `PlayerCollider` aplica al jugador local. */
export type Mg7Knockback = {
	seq: number;
	dx: number;
	dz: number;
	dy: number;
	at: number;
};

export type Mg7Sample = {
	at: number;
	players: Mg7Position[];
};

/** Events carry a client-side sequence number for per-entity consumers. */
export type SequencedMg7Event = Mg7Event & { seq: number };

export type ParkourSenders = {
	position: (x: number, y: number, z: number, yaw: number) => boolean;
};

const MAX_EVENTS = 40;

function sameSample(a: Mg7Sample, b: Mg7Sample): boolean {
	if (a.players.length !== b.players.length) {
		return false;
	}

	for (let index = 0; index < a.players.length; index += 1) {
		const pa = a.players[index];
		const pb = b.players[index];

		if (
			pa.id !== pb.id ||
			!sameNumber(pa.x, pb.x) ||
			!sameNumber(pa.y, pb.y) ||
			!sameNumber(pa.z, pb.z) ||
			!sameNumber(pa.yaw, pb.yaw, 0.000001)
		) {
			return false;
		}
	}

	return true;
}

function mixSample(a: Mg7Sample, b: Mg7Sample, t: number): Mg7Sample {
	const players = a.players.map((player) => {
		const next = b.players.find((item) => item.id === player.id);

		if (!next) {
			return player;
		}

		return {
			...player,
			x: lerp(player.x, next.x, t),
			y: lerp(player.y, next.y, t),
			z: lerp(player.z, next.z, t),
			yaw: lerpAngle(player.yaw, next.yaw, t)
		};
	});

	return { at: b.at, players };
}

/**
 * Client-side mirror of the authoritative `minigame-7` (Parkour Spire).
 *
 * The snapshot is the source of truth (phase, timer, checkpoint, falls,
 * finish); positions arrive at 10 Hz and are interpolated with the shared
 * server clock. There is no HP, damage or death in this mode.
 */
class Minigame7Store {
	snapshot = $state.raw<Mg7Snapshot | null>(null);
	events = $state.raw<SequencedMg7Event[]>([]);
	selfId: string | null = null;

	private eventSeq = 0;

	/** Consumed by `PlayerCollider` to teleport back to the plaza on exit. */
	exitRequest = $state.raw<{ x: number; y: number; z: number } | null>(null);

	/** Consumed by `PlayerCollider` after an authoritative respawn. */
	respawnRequest = $state.raw<{ x: number; y: number; z: number } | null>(null);

	/** Last authoritative shove received by the local player. */
	knockback = $state.raw<Mg7Knockback | null>(null);

	/** One-shot reactions consumed by the HUD/overlays/audio. */
	lastFallAt = 0;
	lastRespawnAt = 0;
	lastCheckpointAt = 0;
	lastFinishAt = 0;
	lastAttackAt = 0;
	lastMatchEndAt = 0;

	private clock = new ServerClock();
	private samples = new SampleBuffer<Mg7Sample>(sameSample);
	private senders: ParkourSenders | null = null;
	private lastPhase: Mg7Phase | null = null;

	get self(): Mg7PlayerState | null {
		const state = this.snapshot;
		if (!state || !this.selfId) return null;

		return state.players.find((player) => player.id === this.selfId) ?? null;
	}

	get phase(): Mg7Phase {
		return this.snapshot?.phase ?? 'idle';
	}

	get players(): Mg7PlayerState[] {
		return this.snapshot?.players ?? [];
	}

	get maxPlayers(): number {
		return this.snapshot?.maxPlayers ?? 12;
	}

	get checkpoint(): number {
		return this.self?.checkpoint ?? 0;
	}

	get nextCheckpoint(): number {
		return this.self?.nextCheckpoint ?? 1;
	}

	get falls(): number {
		return this.self?.falls ?? 0;
	}

	get finished(): boolean {
		return this.self?.finishedAt != null;
	}

	/** 1-based race position in the authoritative order, or 0 without self. */
	get position(): number {
		const state = this.snapshot;
		if (!state || !this.selfId) return 0;

		const index = state.players.findIndex((player) => player.id === this.selfId);

		return index < 0 ? 0 : index + 1;
	}

	get leader(): Mg7PlayerState | null {
		return this.snapshot?.players[0] ?? null;
	}

	get winner(): Mg7PlayerState | null {
		const id = this.snapshot?.winnerId;
		if (!id) return null;

		return this.snapshot?.players.find((player) => player.id === id) ?? null;
	}

	/** True while the local player is under spawn protection (no shoves). */
	get isProtected(): boolean {
		const self = this.self;
		return self !== null && (self.protectionUntil ?? 0) > this.serverNow();
	}

	get respawnInMs(): number {
		const self = this.self;

		if (!self || self.respawnAt === null) {
			return 0;
		}

		return Math.max(0, self.respawnAt - this.serverNow());
	}

	/** True while the player cannot move (countdown, results or finished). */
	get blocksMovement(): boolean {
		const state = this.snapshot;

		if (!state) return true;
		if (state.phase === 'countdown' || state.phase === 'results') return true;

		return this.finished;
	}

	serverNow(): number {
		return this.clock.now();
	}

	setSender(senders: ParkourSenders): void {
		this.senders = senders;
	}

	consumeRespawn(): { x: number; y: number; z: number } | null {
		const request = this.respawnRequest;
		this.respawnRequest = null;
		return request;
	}

	sendPosition(x: number, y: number, z: number, yaw: number): boolean {
		return this.senders?.position(x, y, z, yaw) ?? false;
	}

	applySnapshot(state: Mg7Snapshot): void {
		this.clock.sync(state.serverTime, 0.15);
		this.snapshot = state;

		const previousPhase = this.lastPhase;
		this.lastPhase = state.phase;

		if (previousPhase !== null && previousPhase !== state.phase) {
			if (state.phase === 'playing') {
				this.lastFallAt = 0;
				this.lastRespawnAt = 0;
				this.lastFinishAt = 0;
			}

			if (state.phase === 'results') {
				this.lastMatchEndAt = Date.now();

				if (state.winnerId !== null && state.winnerId === this.selfId) {
					missions.completeMinigameMission(MISSION_PARKOUR_SUMMIT.id);
				}
			}
		}

		if (state.phase === 'idle') {
			this.samples.clear();
		}
	}

	applyPositions(positions: Mg7Positions): void {
		this.clock.sync(positions.at, 0.05);
		this.samples.push(positions.at, {
			at: positions.at,
			players: positions.players
		});
	}

	applyEvent(event: Mg7Event): void {
		this.eventSeq += 1;
		const sequenced = { ...event, seq: this.eventSeq };
		this.events = [...this.events, sequenced].slice(-MAX_EVENTS);

		const selfId = this.selfId;

		if (event.kind === 'warden-attack') {
			this.lastAttackAt = Date.now();
		}

		if (!selfId || event.playerId !== selfId) {
			return;
		}

		if (event.kind === 'checkpoint') {
			this.lastCheckpointAt = Date.now();
		}

		if (event.kind === 'fall') {
			this.lastFallAt = Date.now();
		}

		if (event.kind === 'respawn') {
			this.lastRespawnAt = Date.now();

			if (event.x !== undefined && event.y !== undefined && event.z !== undefined) {
				this.respawnRequest = { x: event.x, y: event.y, z: event.z };
			}
		}

		if (event.kind === 'finish') {
			this.lastFinishAt = Date.now();
		}

		if (event.kind === 'shove') {
			this.knockback = {
				seq: this.eventSeq,
				dx: event.dx ?? 0,
				dz: event.dz ?? 0,
				dy: event.dy ?? 0,
				at: event.at
			};
		}
	}

	/** Interpolated remote positions for the current frame. */
	sampleAt(renderTime = this.clock.now() - REMOTE_RENDER_DELAY_MS): Mg7Sample | null {
		return this.samples.sample(renderTime, mixSample);
	}

	/** Freshest positions received (no interpolation delay). */
	latestPlayers(): Mg7Position[] {
		return this.samples.latest?.value.players ?? [];
	}

	/** Events newer than `seq`, for one-shot consumers. */
	eventsAfter(seq: number): SequencedMg7Event[] {
		return this.events.filter((event) => event.seq > seq);
	}

	reset(): void {
		this.snapshot = null;
		this.events = [];
		this.selfId = null;
		this.exitRequest = null;
		this.respawnRequest = null;
		this.knockback = null;
		this.lastFallAt = 0;
		this.lastRespawnAt = 0;
		this.lastCheckpointAt = 0;
		this.lastFinishAt = 0;
		this.lastAttackAt = 0;
		this.lastMatchEndAt = 0;
		this.lastPhase = null;
		this.clock.reset();
		this.samples.clear();
	}
}

export const minigame7 = new Minigame7Store();

export type { Mg7EventKind };
