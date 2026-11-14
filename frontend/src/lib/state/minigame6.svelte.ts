import type {
	Mg6Event,
	Mg6EventKind,
	Mg6Phase,
	Mg6Pickup,
	Mg6PlayerState,
	Mg6Positions,
	Mg6Snapshot,
	Mg6Team,
	Mg6Winner
} from '../services/protocol';
import { MISSION_HEXFIRE_FIRST_WIN } from '../missions/minigames';
import { missions } from './missions.svelte';
import {
	lerp,
	lerpAngle,
	REMOTE_RENDER_DELAY_MS,
	SampleBuffer,
	ServerClock,
	sameNumber
} from './remoteSync';

export type Mg6Projectile = { id: string; x: number; y: number; z: number };

export type Mg6PositionPlayer = {
	id: string;
	x: number;
	y: number;
	z: number;
	yaw: number;
	alive: boolean;
};

export type Mg6Sample = {
	at: number;
	players: Mg6PositionPlayer[];
	grenades: Mg6Projectile[];
};

/** Events carry a client-side sequence number for per-entity consumers. */
export type SequencedMg6Event = Mg6Event & { seq: number };

export type DeathmatchSenders = {
	position: (x: number, y: number, z: number, yaw: number) => boolean;
	shoot: (
		weapon: Mg5WeaponId,
		origin: { x: number; y: number; z: number },
		dir: { x: number; y: number; z: number },
		targetId?: string | null
	) => boolean;
	throwGrenade: (
		origin: { x: number; y: number; z: number },
		dir: { x: number; y: number; z: number },
		target?: { x: number; z: number }
	) => boolean;
	reload: () => boolean;
	equip: (slot: number) => boolean;
};

import type { Mg5WeaponId } from './wavesConfig';

const MAX_EVENTS = 40;

function sameProjectile(a: Mg6Projectile, b: Mg6Projectile): boolean {
	return a.id === b.id && sameNumber(a.x, b.x) && sameNumber(a.y, b.y) && sameNumber(a.z, b.z);
}

function sameSample(a: Mg6Sample, b: Mg6Sample): boolean {
	if (a.players.length !== b.players.length || a.grenades.length !== b.grenades.length) {
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
			!sameNumber(pa.yaw, pb.yaw, 0.000001) ||
			pa.alive !== pb.alive
		) {
			return false;
		}
	}

	return a.grenades.every((grenade, index) => sameProjectile(grenade, b.grenades[index]));
}

function mixProjectile(a: Mg6Projectile, b: Mg6Projectile, t: number): Mg6Projectile {
	return {
		...a,
		x: lerp(a.x, b.x, t),
		y: lerp(a.y, b.y, t),
		z: lerp(a.z, b.z, t)
	};
}

function mixSample(a: Mg6Sample, b: Mg6Sample, t: number): Mg6Sample {
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
			yaw: lerpAngle(player.yaw, next.yaw, t),
			alive: next.alive
		};
	});

	const grenades = a.grenades.map((grenade) => {
		const next = b.grenades.find((item) => item.id === grenade.id);
		return next ? mixProjectile(grenade, next, t) : grenade;
	});

	return { at: b.at, players, grenades };
}

/**
 * Client-side mirror of the authoritative `minigame-6` (Witch House
 * Deathmatch) state.
 *
 * `snapshot` is the source of truth (phase, teams, scores, pickups, timer);
 * positions arrive at 10 Hz and are interpolated with a shared server clock.
 */
class Minigame6Store {
	snapshot = $state.raw<Mg6Snapshot | null>(null);
	events = $state.raw<SequencedMg6Event[]>([]);
	selfId: string | null = null;

	private eventSeq = 0;

	/** Consumed by `PlayerCollider` to teleport back to the witch house on exit. */
	exitRequest = $state.raw<{ x: number; y: number; z: number } | null>(null);

	/** Consumed by `PlayerCollider` after an authoritative respawn. */
	respawnRequest = $state.raw<{ x: number; y: number; z: number } | null>(null);

	/** Screens flash / hit feedback; set by events for the local player. */
	lastHurtAt = 0;
	lastHealAt = 0;
	lastSelfDamageAt = 0;
	lastDeathAt = 0;
	lastKillAt = 0;
	/** Timestamp of the last kill made by the local player (hit marker). */
	lastHitAt = 0;

	private clock = new ServerClock();
	private samples = new SampleBuffer<Mg6Sample>(sameSample);
	private senders: DeathmatchSenders | null = null;
	private lastPhase: Mg6Phase | null = null;

	get self(): Mg6PlayerState | null {
		const state = this.snapshot;
		if (!state || !this.selfId) return null;

		return state.players.find((player) => player.id === this.selfId) ?? null;
	}

	get phase(): Mg6Phase {
		return this.snapshot?.phase ?? 'idle';
	}

	get team(): Mg6Team | null {
		return this.self?.team ?? null;
	}

	get isAlive(): boolean {
		return this.self?.alive ?? false;
	}

	get waitingForPlayers(): boolean {
		return this.snapshot?.waitingForPlayers ?? false;
	}

	get teamScores(): Record<Mg6Team, number> {
		return this.snapshot?.teamScores ?? { coven: 0, hunters: 0 };
	}

	get winner(): Mg6Winner | null {
		return this.snapshot?.winner ?? null;
	}

	get pickups(): Mg6Pickup[] {
		return this.snapshot?.pickups ?? [];
	}

	/** True while the player cannot move (countdown, death or result). */
	get blocksMovement(): boolean {
		const state = this.snapshot;

		if (!state) return true;
		if (state.phase === 'countdown' || state.phase === 'results') return true;

		return this.self !== null && !this.self.alive;
	}

	/** Fuerza la entrada/salida de la protección de spawn del jugador local. */
	get isProtected(): boolean {
		const self = this.self;
		return self !== null && self.protectedUntil > this.serverNow();
	}

	get respawnInMs(): number {
		const self = this.self;

		if (!self || self.alive || self.respawnAt === null) {
			return 0;
		}

		return Math.max(0, self.respawnAt - this.serverNow());
	}

	get inventory(): Mg6PlayerState['inventory'] {
		return this.self?.inventory ?? [];
	}

	/** Top 5 de bajas: kills desc, luego menos deaths, luego nombre. */
	get top5(): Mg6PlayerState[] {
		return [...(this.snapshot?.players ?? [])]
			.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.name.localeCompare(b.name))
			.slice(0, 5);
	}

	get mvp(): Mg6PlayerState | null {
		const id = this.snapshot?.mvpId;

		if (!id) {
			return null;
		}

		return this.snapshot?.players.find((player) => player.id === id) ?? null;
	}

	/** Estimated server time for `countdownEndsAt` / `matchEndsAt`. */
	serverNow(): number {
		return this.clock.now();
	}

	setSender(senders: DeathmatchSenders): void {
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

	sendShoot(
		weapon: Mg5WeaponId,
		origin: { x: number; y: number; z: number },
		dir: { x: number; y: number; z: number },
		targetId?: string | null
	): boolean {
		return this.senders?.shoot(weapon, origin, dir, targetId) ?? false;
	}

	throwGrenade(
		origin: { x: number; y: number; z: number },
		dir: { x: number; y: number; z: number },
		target?: { x: number; z: number }
	): boolean {
		return this.senders?.throwGrenade(origin, dir, target) ?? false;
	}

	reload(): boolean {
		return this.senders?.reload() ?? false;
	}

	/** Equip an owned weapon by its hotbar slot (1–4). */
	equip(slot: number): boolean {
		return this.senders?.equip(slot) ?? false;
	}

	applySnapshot(state: Mg6Snapshot): void {
		this.clock.sync(state.serverTime, 0.15);
		this.snapshot = state;

		const previousPhase = this.lastPhase;
		this.lastPhase = state.phase;

		if (previousPhase !== null && previousPhase !== state.phase) {
			if (state.phase === 'playing') {
				this.lastDeathAt = 0;
				this.lastHurtAt = 0;
			}

			if (state.phase === 'results' && previousPhase === 'playing') {
				const self = state.players.find((player) => player.id === this.selfId);

				if (self && state.winner === self.team) {
					missions.completeMinigameMission(MISSION_HEXFIRE_FIRST_WIN.id);
				}
			}
		}

		if (state.phase === 'idle') {
			this.samples.clear();
		}
	}

	applyPositions(positions: Mg6Positions): void {
		this.clock.sync(positions.at, 0.05);
		this.samples.push(positions.at, {
			at: positions.at,
			players: positions.players,
			grenades: positions.grenades
		});
	}

	applyEvent(event: Mg6Event): void {
		this.eventSeq += 1;
		const sequenced = { ...event, seq: this.eventSeq };
		this.events = [...this.events, sequenced].slice(-MAX_EVENTS);

		const selfId = this.selfId;

		if (!selfId) {
			return;
		}

		if (event.kind === 'player-hurt' && event.playerId === selfId) {
			this.lastHurtAt = Date.now();
		}

		if (event.kind === 'player-hurt' && event.otherId === selfId) {
			this.lastHitAt = Date.now();
		}

		if (event.kind === 'self-damage' && event.playerId === selfId) {
			this.lastSelfDamageAt = Date.now();
		}

		if (event.kind === 'player-died' && event.playerId === selfId) {
			this.lastDeathAt = Date.now();
		}

		if (
			event.kind === 'player-respawned' &&
			event.playerId === selfId &&
			event.x !== undefined &&
			event.y !== undefined &&
			event.z !== undefined
		) {
			this.respawnRequest = { x: event.x, y: event.y, z: event.z };
		}

		if (event.kind === 'kill' && event.playerId === selfId) {
			this.lastKillAt = Date.now();
			this.lastHitAt = Date.now();
		}

		if (
			(event.kind === 'pickup-taken' &&
				event.pickupKind === 'medkit' &&
				event.playerId === selfId) ||
			(event.kind === 'player-respawned' && event.playerId === selfId)
		) {
			this.lastHealAt = Date.now();
		}
	}

	/** Interpolated entities for the current frame. */
	sampleAt(renderTime = this.clock.now() - REMOTE_RENDER_DELAY_MS): Mg6Sample | null {
		return this.samples.sample(renderTime, mixSample);
	}

	/** Freshest player positions received (no interpolation delay). */
	latestPlayers(): Mg6PositionPlayer[] {
		return this.samples.latest?.value.players ?? [];
	}

	/** Freshest grenade positions received (no interpolation delay). */
	latestGrenades(): Mg6Projectile[] {
		return this.samples.latest?.value.grenades ?? [];
	}

	/** Events newer than `seq`, for one-shot consumers. */
	eventsAfter(seq: number): SequencedMg6Event[] {
		return this.events.filter((event) => event.seq > seq);
	}

	reset(): void {
		this.snapshot = null;
		this.events = [];
		this.selfId = null;
		this.exitRequest = null;
		this.respawnRequest = null;
		this.lastHurtAt = 0;
		this.lastHealAt = 0;
		this.lastSelfDamageAt = 0;
		this.lastDeathAt = 0;
		this.lastKillAt = 0;
		this.lastHitAt = 0;
		this.lastPhase = null;
		this.clock.reset();
		this.samples.clear();
	}
}

export const minigame6 = new Minigame6Store();

export type { Mg6EventKind };
