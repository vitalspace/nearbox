import type {
	Mg5Breath,
	Mg5CarState,
	Mg5Event,
	Mg5MonsterSnapshot,
	Mg5Phase,
	Mg5PlayerState,
	Mg5PositionMonster,
	Mg5PositionPlayer,
	Mg5Positions,
	Mg5Snapshot
} from '../services/protocol';
import {
	lerp,
	lerpAngle,
	REMOTE_RENDER_DELAY_MS,
	SampleBuffer,
	ServerClock,
	sameNumber
} from './remoteSync';
import { MISSION_BARN_8_WAVES } from '../missions/minigames';
import { missions } from './missions.svelte';
import { stats } from './stats.svelte';

export type Mg5Projectile = { id: string; x: number; y: number; z: number };

/** Golpe de roca que debe lanzar al jugador local por los aires. */
export type Mg5Knockback = { seq: number; dx: number; dz: number; at: number };

export type Mg5Sample = {
	at: number;
	players: Mg5PositionPlayer[];
	monsters: Mg5PositionMonster[];
	projectiles: Mg5Projectile[];
	grenades: Mg5Projectile[];
	rocks: Mg5Projectile[];
	breaths: Mg5Breath[];
	car: Mg5CarState | null;
};

const MAX_EVENTS = 30;

/** Events carry a client-side sequence number for per-entity consumers. */
export type SequencedMg5Event = Mg5Event & { seq: number };

function sameProjectile(a: Mg5Projectile, b: Mg5Projectile): boolean {
	return a.id === b.id && sameNumber(a.x, b.x) && sameNumber(a.y, b.y) && sameNumber(a.z, b.z);
}

function sameSample(a: Mg5Sample, b: Mg5Sample): boolean {
	if (
		a.players.length !== b.players.length ||
		a.monsters.length !== b.monsters.length ||
		a.projectiles.length !== b.projectiles.length ||
		a.grenades.length !== b.grenades.length ||
		a.rocks.length !== b.rocks.length
	) {
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
			pa.downed !== pb.downed
		) {
			return false;
		}
	}

	for (let index = 0; index < a.monsters.length; index += 1) {
		const ma = a.monsters[index];
		const mb = b.monsters[index];

		if (
			ma.id !== mb.id ||
			!sameNumber(ma.x, mb.x) ||
			!sameNumber(ma.y, mb.y) ||
			!sameNumber(ma.z, mb.z) ||
			!sameNumber(ma.yaw, mb.yaw, 0.000001) ||
			ma.status !== mb.status
		) {
			return false;
		}
	}

	if (
		!a.projectiles.every((projectile, index) => sameProjectile(projectile, b.projectiles[index]))
	) {
		return false;
	}

	if (!a.grenades.every((grenade, index) => sameProjectile(grenade, b.grenades[index]))) {
		return false;
	}

	if (!a.rocks.every((rock, index) => sameProjectile(rock, b.rocks[index]))) {
		return false;
	}

	if (a.breaths.length !== b.breaths.length) {
		return false;
	}

	for (let index = 0; index < a.breaths.length; index += 1) {
		const ba = a.breaths[index];
		const bb = b.breaths[index];

		// El cono se reorienta mientras dura: cualquier cambio debe entrar en
		// el buffer aunque los monstruos estén quietos.
		if (
			ba.id !== bb.id ||
			!sameNumber(ba.x, bb.x) ||
			!sameNumber(ba.y, bb.y) ||
			!sameNumber(ba.z, bb.z) ||
			!sameNumber(ba.dx, bb.dx, 0.000001) ||
			!sameNumber(ba.dy, bb.dy, 0.000001) ||
			!sameNumber(ba.dz, bb.dz, 0.000001)
		) {
			return false;
		}
	}

	if ((a.car === null) !== (b.car === null)) {
		return false;
	}

	if (a.car && b.car) {
		if (
			!sameNumber(a.car.x, b.car.x) ||
			!sameNumber(a.car.y, b.car.y) ||
			!sameNumber(a.car.z, b.car.z) ||
			!sameNumber(a.car.qx, b.car.qx, 0.000001) ||
			!sameNumber(a.car.qw, b.car.qw, 0.000001) ||
			a.car.health !== b.car.health ||
			a.car.destroyed !== b.car.destroyed ||
			a.car.driverId !== b.car.driverId
		) {
			return false;
		}
	}

	return true;
}

function mixProjectile(a: Mg5Projectile, b: Mg5Projectile, t: number): Mg5Projectile {
	return {
		...a,
		x: lerp(a.x, b.x, t),
		y: lerp(a.y, b.y, t),
		z: lerp(a.z, b.z, t)
	};
}

function mixSample(a: Mg5Sample, b: Mg5Sample, t: number): Mg5Sample {
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
			downed: next.downed
		};
	});

	const monsters = a.monsters.map((monster) => {
		const next = b.monsters.find((item) => item.id === monster.id);

		if (!next) {
			return monster;
		}

		return {
			...monster,
			x: lerp(monster.x, next.x, t),
			y: lerp(monster.y, next.y, t),
			z: lerp(monster.z, next.z, t),
			yaw: lerpAngle(monster.yaw, next.yaw, t),
			status: next.status
		};
	});

	const projectiles = a.projectiles.map((projectile) => {
		const next = b.projectiles.find((item) => item.id === projectile.id);
		return next ? mixProjectile(projectile, next, t) : projectile;
	});

	const grenades = a.grenades.map((grenade) => {
		const next = b.grenades.find((item) => item.id === grenade.id);
		return next ? mixProjectile(grenade, next, t) : grenade;
	});

	const rocks = a.rocks.map((rock) => {
		const next = b.rocks.find((item) => item.id === rock.id);
		return next ? mixProjectile(rock, next, t) : rock;
	});

	// Los conos de fuego no se interpolan: son un volumen estático que solo
	// se reorienta en cada tick; usar la muestra más reciente evita lag.
	const breaths = b.breaths;

	let car: Mg5CarState | null = a.car;

	if (a.car && b.car) {
		// nlerp sobre la rotación + lerp en posición.
		let qx = lerp(a.car.qx, b.car.qx, t);
		let qy = lerp(a.car.qy, b.car.qy, t);
		let qz = lerp(a.car.qz, b.car.qz, t);
		let qw = lerp(a.car.qw, b.car.qw, t);
		const length = Math.hypot(qx, qy, qz, qw) || 1;
		qx /= length;
		qy /= length;
		qz /= length;
		qw /= length;

		car = {
			...b.car,
			x: lerp(a.car.x, b.car.x, t),
			y: lerp(a.car.y, b.car.y, t),
			z: lerp(a.car.z, b.car.z, t),
			yaw: lerpAngle(a.car.yaw, b.car.yaw, t),
			qx,
			qy,
			qz,
			qw
		};
	} else if (b.car) {
		car = b.car;
	}

	return { at: b.at, players, monsters, projectiles, grenades, rocks, breaths, car };
}

export type WavesSenders = {
	position: (x: number, y: number, z: number, yaw: number) => boolean;
	shoot: (
		weapon: Mg5PlayerState['weapon'],
		origin: { x: number; y: number; z: number },
		dir: { x: number; y: number; z: number },
		targetId?: string | null
	) => boolean;
	throwGrenade: (
		origin: { x: number; y: number; z: number },
		dir: { x: number; y: number; z: number },
		target?: { x: number; z: number }
	) => boolean;
	carEnter: () => boolean;
	carExit: () => boolean;
	carState: (report: {
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
	}) => boolean;
	reload: () => boolean;
	equip: (slot: number) => boolean;
};

/**
 * Client-side mirror of the authoritative `minigame-5` (Barn Siege) state.
 *
 * `snapshot` is the source of truth (phases, wave, monsters, drops, car);
 * positions arrive at 10 Hz and are interpolated with a shared server clock.
 */
class Minigame5Store {
	snapshot = $state.raw<Mg5Snapshot | null>(null);
	events = $state.raw<SequencedMg5Event[]>([]);
	selfId: string | null = null;

	private eventSeq = 0;

	/** Consumed by `WaveSession` to teleport back to the barn on exit. */
	exitRequest: { x: number; y: number; z: number } | null = null;

	/** Screens flash / hit feedback; set by events for the local player. */
	lastHurtAt = 0;
	lastHealAt = 0;

	/**
	 * Último golpe de roca recibido por el jugador local. `PlayerCollider` lo
	 * consume y aplica el impulso (el servidor no mueve posiciones).
	 */
	knockback = $state.raw<Mg5Knockback | null>(null);

	private clock = new ServerClock();
	private samples = new SampleBuffer<Mg5Sample>(sameSample);
	private senders: WavesSenders | null = null;
	/** Previous authoritative phase, used to detect new matches and endings. */
	private lastPhase: Mg5Phase | null = null;

	get self(): Mg5PlayerState | null {
		const state = this.snapshot;
		if (!state || !this.selfId) return null;

		return state.players.find((player) => player.id === this.selfId) ?? null;
	}

	get phase(): Mg5Phase {
		return this.snapshot?.phase ?? 'idle';
	}

	get monsters(): Mg5MonsterSnapshot[] {
		return this.snapshot?.monsters ?? [];
	}

	get isDriving(): boolean {
		return this.self?.driving ?? false;
	}

	get isDowned(): boolean {
		return this.self?.downed ?? false;
	}

	/** True while the player cannot move (results or downed). */
	get blocksMovement(): boolean {
		const state = this.snapshot;

		if (!state) return false;
		if (state.phase === 'won' || state.phase === 'lost') {
			return true;
		}

		return this.isDowned;
	}

	/** Estimated server time for `endsAt` / `intermissionEndsAt`. */
	serverNow(): number {
		return this.clock.now();
	}

	setSender(senders: WavesSenders): void {
		this.senders = senders;
	}

	sendPosition(x: number, y: number, z: number, yaw: number): boolean {
		return this.senders?.position(x, y, z, yaw) ?? false;
	}

	sendShoot(
		weapon: Mg5PlayerState['weapon'],
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

	carEnter(): boolean {
		return this.senders?.carEnter() ?? false;
	}

	carExit(): boolean {
		return this.senders?.carExit() ?? false;
	}

	sendCarState(report: Parameters<WavesSenders['carState']>[0]): boolean {
		return this.senders?.carState(report) ?? false;
	}

	reload(): boolean {
		return this.senders?.reload() ?? false;
	}

	/** Equip an owned weapon by its hotbar slot (1–4). */
	equip(slot: number): boolean {
		return this.senders?.equip(slot) ?? false;
	}

	get inventory(): Mg5PlayerState['inventory'] {
		return this.self?.inventory ?? [];
	}

	applySnapshot(state: Mg5Snapshot): void {
		this.clock.sync(state.serverTime, 0.15);
		this.snapshot = state;

		const previousPhase = this.lastPhase;
		this.lastPhase = state.phase;

		const playing =
			this.selfId !== null && state.players.some((player) => player.id === this.selfId);

		if (previousPhase !== null && playing) {
			if (state.phase === 'countdown' && previousPhase !== 'countdown') {
				stats.startMission('barn');
			} else if (state.phase === 'won' && previousPhase !== 'won') {
				stats.completeMission('barn');
				missions.completeMinigameMission(MISSION_BARN_8_WAVES.id);
			} else if (state.phase === 'lost' && previousPhase !== 'lost') {
				stats.failMission('barn');
			}
		}

		if (state.phase === 'idle') {
			this.samples.clear();
		}
	}

	applyPositions(positions: Mg5Positions): void {
		this.clock.sync(positions.at, 0.05);
		this.samples.push(positions.at, {
			at: positions.at,
			players: positions.players,
			monsters: positions.monsters,
			projectiles: positions.projectiles,
			grenades: positions.grenades,
			rocks: positions.rocks,
			breaths: positions.breaths,
			car: positions.car
		});
	}

	applyEvent(event: Mg5Event): void {
		this.eventSeq += 1;
		const sequenced = { ...event, seq: this.eventSeq };
		this.events = [...this.events, sequenced].slice(-MAX_EVENTS);

		if (event.kind === 'player-hurt' && event.playerId === this.selfId) {
			this.lastHurtAt = Date.now();
		}

		if (event.kind === 'rock-hit' && event.playerId === this.selfId) {
			this.knockback = {
				seq: this.eventSeq,
				dx: event.dx ?? 0,
				dz: event.dz ?? 0,
				at: event.at
			};
		}

		if (event.kind === 'monster-died' && event.playerId === this.selfId) {
			stats.recordBarnKill();
		}

		if (event.kind === 'player-downed' && event.playerId === this.selfId) {
			stats.recordDeath('barn');
		}

		if (
			(event.kind === 'player-revived' && event.playerId === this.selfId) ||
			(event.kind === 'drop-picked' &&
				event.dropKind === 'medkit' &&
				event.playerId === this.selfId)
		) {
			this.lastHealAt = Date.now();
		}
	}

	/** Interpolated entities for the current frame. */
	sampleAt(renderTime = this.clock.now() - REMOTE_RENDER_DELAY_MS): Mg5Sample | null {
		return this.samples.sample(renderTime, mixSample);
	}

	/** Latest known car pose (for remote drivers). */
	latestCar(): Mg5CarState | null {
		return this.samples.latest?.value.car ?? this.snapshot?.car ?? null;
	}

	/**
	 * Freshest monster positions received (no interpolation delay).
	 *
	 * Aim assist uses these instead of `sampleAt()`: the interpolated view is
	 * 150 ms behind, which at a ghost's 3.6 m/s is more than the hit radius.
	 */
	latestMonsters(): Mg5PositionMonster[] {
		return this.samples.latest?.value.monsters ?? this.snapshot?.monsters ?? [];
	}

	/** Conos de fuego activos, sin retardo de interpolación. */
	latestBreaths(): Mg5Breath[] {
		return this.samples.latest?.value.breaths ?? [];
	}

	reset(): void {
		this.snapshot = null;
		this.events = [];
		this.selfId = null;
		this.exitRequest = null;
		this.lastHurtAt = 0;
		this.lastHealAt = 0;
		this.knockback = null;
		this.lastPhase = null;
		this.clock.reset();
		this.samples.clear();
	}
}

export const minigame5 = new Minigame5Store();
