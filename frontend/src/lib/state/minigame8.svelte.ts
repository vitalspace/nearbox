import type {
	Mg8Correct,
	Mg8Event,
	Mg8EventKind,
	Mg8Loot,
	Mg8Mode,
	Mg8Phase,
	Mg8PlayerState,
	Mg8Positions,
	Mg8Snapshot,
	Mg8Storm
} from '../services/protocol';
import type { Mg5WeaponId } from './wavesConfig';
import { MISSION_ROYALE_FIRST_WIN } from '../missions/minigames';
import { missions } from './missions.svelte';
import {
	lerp,
	lerpAngle,
	REMOTE_RENDER_DELAY_MS,
	SampleBuffer,
	ServerClock,
	sameNumber
} from './remoteSync';

export type Mg8Projectile = { id: string; x: number; y: number; z: number };

export type Mg8PositionPlayer = {
	id: string;
	x: number;
	y: number;
	z: number;
	yaw: number;
	mode: Mg8Mode;
	alive: boolean;
	isBot: boolean;
};

export type Mg8Sample = {
	at: number;
	players: Mg8PositionPlayer[];
	grenades: Mg8Projectile[];
};

export type SequencedMg8Event = Mg8Event & { seq: number };

export type RoyaleSenders = {
	position: (x: number, y: number, z: number, yaw: number, mode: Mg8Mode, vy: number) => boolean;
	jump: () => boolean;
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

const MAX_EVENTS = 50;

function sameProjectile(a: Mg8Projectile, b: Mg8Projectile): boolean {
	return a.id === b.id && sameNumber(a.x, b.x) && sameNumber(a.y, b.y) && sameNumber(a.z, b.z);
}

function sameSample(a: Mg8Sample, b: Mg8Sample): boolean {
	if (a.players.length !== b.players.length || a.grenades.length !== b.grenades.length) {
		return false;
	}

	for (let index = 0; index < a.players.length; index += 1) {
		const pa = a.players[index];
		const pb = b.players[index];

		if (
			pa.id !== pb.id ||
			pa.mode !== pb.mode ||
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

function mixProjectile(a: Mg8Projectile, b: Mg8Projectile, t: number): Mg8Projectile {
	return { ...a, x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}

function mixSample(a: Mg8Sample, b: Mg8Sample, t: number): Mg8Sample {
	const players = a.players.map((player) => {
		const next = b.players.find((item) => item.id === player.id);

		if (!next) return player;

		return {
			...player,
			x: lerp(player.x, next.x, t),
			y: lerp(player.y, next.y, t),
			z: lerp(player.z, next.z, t),
			yaw: lerpAngle(player.yaw, next.yaw, t),
			mode: next.mode,
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
 * Espejo cliente del estado autoritativo de Skyfall Royale.
 *
 * El snapshot (1 Hz) manda sobre fases, tormenta, loot y puestos; las
 * posiciones (10 Hz) se interpolan con el reloj del servidor. Los bots son
 * remotos normales: este store nunca ejecuta IA ni física local.
 */
class Minigame8Store {
	snapshot = $state.raw<Mg8Snapshot | null>(null);
	events = $state.raw<SequencedMg8Event[]>([]);
	selfId: string | null = null;

	private eventSeq = 0;

	/** Teletransporte solicitado por una corrección anti-cheat. */
	correctRequest = $state.raw<Mg8Correct | null>(null);

	/** Salida al mapa global tras `results`/eliminación. */
	exitRequest = $state.raw<{ x: number; y: number; z: number } | null>(null);

	/** Consumido por `PlayerCollider` al recibir la primera posición de vuelo. */
	ridingRequest = $state.raw<{ x: number; y: number; z: number } | null>(null);

	lastHurtAt = 0;
	lastHitAt = 0;
	lastKillAt = 0;
	lastDeathAt = 0;
	lastPickupAt = 0;
	lastStormHitAt = 0;
	lastJumpAt = 0;
	lastLandAt = 0;
	lastVictoryAt = 0;

	private clock = new ServerClock();
	private samples = new SampleBuffer<Mg8Sample>(sameSample);
	private senders: RoyaleSenders | null = null;
	private lastPhase: Mg8Phase | null = null;

	get self(): Mg8PlayerState | null {
		const state = this.snapshot;
		if (!state || !this.selfId) return null;
		return state.players.find((player) => player.id === this.selfId) ?? null;
	}

	get phase(): Mg8Phase {
		return this.snapshot?.phase ?? 'idle';
	}

	get storm(): Mg8Storm | null {
		return this.snapshot?.storm ?? null;
	}

	get isAlive(): boolean {
		return this.self?.alive ?? false;
	}

	get mode(): Mg8Mode {
		return this.self?.mode ?? 'riding';
	}

	get isBot(): boolean {
		return this.self?.isBot ?? false;
	}

	get aliveCount(): number {
		return this.snapshot?.players.filter((player) => player.alive).length ?? 0;
	}

	get humans(): number {
		return this.snapshot?.humans ?? 0;
	}

	get bots(): number {
		return this.snapshot?.bots ?? 0;
	}

	get waitingForPlayers(): boolean {
		return this.snapshot?.waitingForPlayers ?? false;
	}

	get loot(): Mg8Loot[] {
		return this.snapshot?.loot ?? [];
	}

	get winnerId(): string | null {
		return this.snapshot?.winner ?? null;
	}

	get winner(): Mg8PlayerState | null {
		const id = this.winnerId;
		if (!id) return null;
		return this.snapshot?.players.find((player) => player.id === id) ?? null;
	}

	get placement(): number | null {
		return this.self?.placement ?? null;
	}

	get inventory(): Mg8PlayerState['inventory'] {
		return this.self?.inventory ?? [];
	}

	get blocksMovement(): boolean {
		const state = this.snapshot;
		if (!state) return true;
		if (state.phase === 'countdown' || state.phase === 'results') return true;
		if (state.phase === 'idle') return true;
		return this.self !== null && !this.self.alive;
	}

	get riding(): boolean {
		return this.mode === 'riding' && this.isAlive;
	}

	get canJump(): boolean {
		const state = this.snapshot;
		if (!state || state.phase !== 'playing' || !this.riding || !state.boardingStartedAt) {
			return false;
		}

		const elapsed = this.serverNow() - state.boardingStartedAt;
		return elapsed >= 1_500 && elapsed <= 32_000;
	}

	get jumpElapsedMs(): number {
		const state = this.snapshot;
		if (!state?.boardingStartedAt) return 0;
		return Math.max(0, this.serverNow() - state.boardingStartedAt);
	}

	get stormTimeLeftMs(): number {
		const storm = this.storm;
		if (!storm) return 0;
		return Math.max(0, storm.endsAt - this.serverNow());
	}

	get topAlive(): Mg8PlayerState[] {
		return [...(this.snapshot?.players ?? [])]
			.filter((player) => player.alive)
			.sort((a, b) => b.kills - a.kills || b.damage - a.damage || a.name.localeCompare(b.name))
			.slice(0, 5);
	}

	get podium(): Mg8PlayerState[] {
		const placements = this.snapshot?.placements ?? [];
		const players = this.snapshot?.players ?? [];
		return [1, 2, 3]
			.map((placement) => {
				const entry = placements.find((item) => item.placement === placement);
				return entry ? players.find((player) => player.id === entry.playerId) : undefined;
			})
			.filter((player): player is Mg8PlayerState => player !== undefined);
	}

	serverNow(): number {
		return this.clock.now();
	}

	setSender(senders: RoyaleSenders): void {
		this.senders = senders;
	}

	sendPosition(x: number, y: number, z: number, yaw: number, mode: Mg8Mode, vy: number): boolean {
		return this.senders?.position(x, y, z, yaw, mode, vy) ?? false;
	}

	sendJump(): boolean {
		return this.senders?.jump() ?? false;
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

	equip(slot: number): boolean {
		return this.senders?.equip(slot) ?? false;
	}

	consumeCorrect(): Mg8Correct | null {
		const request = this.correctRequest;
		this.correctRequest = null;
		return request;
	}

	consumeRiding(): { x: number; y: number; z: number } | null {
		const request = this.ridingRequest;
		this.ridingRequest = null;
		return request;
	}

	applySnapshot(state: Mg8Snapshot): void {
		this.clock.sync(state.serverTime, 0.15);
		this.snapshot = state;

		const previousPhase = this.lastPhase;
		this.lastPhase = state.phase;

		if (previousPhase !== null && previousPhase !== state.phase) {
			if (state.phase === 'playing') {
				this.lastDeathAt = 0;
				this.lastHurtAt = 0;
				this.lastVictoryAt = 0;
			}

			if (state.phase === 'results' && previousPhase === 'playing') {
				const self = state.players.find((player) => player.id === this.selfId);
				if (self && !self.isBot && state.winner === self.id) {
					this.lastVictoryAt = Date.now();
					missions.completeMinigameMission(MISSION_ROYALE_FIRST_WIN.id);
				}
			}
		}

		if (state.phase === 'idle') {
			this.samples.clear();
		}

		if (state.phase === 'playing' && state.boardingStartedAt) {
			const self = state.players.find((player) => player.id === this.selfId);
			if (self && self.alive && self.mode === 'riding') {
				this.ridingRequest = { x: self.x, y: self.y, z: self.z };
			}
		}
	}

	applyPositions(positions: Mg8Positions): void {
		this.clock.sync(positions.at, 0.05);
		this.samples.push(positions.at, {
			at: positions.at,
			players: positions.players,
			grenades: positions.grenades
		});
	}

	applyCorrect(correct: Mg8Correct): void {
		this.correctRequest = correct;
	}

	applyEvent(event: Mg8Event): void {
		this.eventSeq += 1;
		this.events = [...this.events, { ...event, seq: this.eventSeq }].slice(-MAX_EVENTS);

		const selfId = this.selfId;
		if (!selfId) return;

		if (event.kind === 'player-hurt' && event.playerId === selfId) {
			this.lastHurtAt = Date.now();
		}

		if (event.kind === 'player-hurt' && event.otherId === selfId) {
			this.lastHitAt = Date.now();
		}

		if (event.kind === 'kill' && event.playerId === selfId) {
			this.lastKillAt = Date.now();
			this.lastHitAt = Date.now();
		}

		if (event.kind === 'player-died' && event.playerId === selfId) {
			this.lastDeathAt = Date.now();
		}

		if (event.kind === 'player-jumped' && event.playerId === selfId) {
			this.lastJumpAt = Date.now();
		}

		if (event.kind === 'player-landed' && event.playerId === selfId) {
			this.lastLandAt = Date.now();
		}

		if (event.kind === 'loot-taken' && event.playerId === selfId) {
			this.lastPickupAt = Date.now();
		}

		if (event.kind === 'storm-damage' && event.playerId === selfId) {
			this.lastStormHitAt = Date.now();
		}
	}

	sampleAt(renderTime = this.clock.now() - REMOTE_RENDER_DELAY_MS): Mg8Sample | null {
		return this.samples.sample(renderTime, mixSample);
	}

	latestPlayers(): Mg8PositionPlayer[] {
		return this.samples.latest?.value.players ?? [];
	}

	latestGrenades(): Mg8Projectile[] {
		return this.samples.latest?.value.grenades ?? [];
	}

	eventsAfter(seq: number): SequencedMg8Event[] {
		return this.events.filter((event) => event.seq > seq);
	}

	reset(): void {
		this.snapshot = null;
		this.events = [];
		this.selfId = null;
		this.correctRequest = null;
		this.exitRequest = null;
		this.ridingRequest = null;
		this.lastHurtAt = 0;
		this.lastHitAt = 0;
		this.lastKillAt = 0;
		this.lastDeathAt = 0;
		this.lastPickupAt = 0;
		this.lastStormHitAt = 0;
		this.lastJumpAt = 0;
		this.lastLandAt = 0;
		this.lastVictoryAt = 0;
		this.lastPhase = null;
		this.clock.reset();
		this.samples.clear();
	}
}

export const minigame8 = new Minigame8Store();

export type { Mg8EventKind };
