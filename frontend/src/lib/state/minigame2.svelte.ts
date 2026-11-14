import type {
	Mg2Event,
	Mg2MummyReport,
	Mg2MummyState,
	Mg2Phase,
	Mg2PositionMummy,
	Mg2PositionPlayer,
	Mg2SkullState,
	Mg2Snapshot
} from '../services/protocol';
import {
	lerp,
	lerpAngle,
	REMOTE_RENDER_DELAY_MS,
	SampleBuffer,
	ServerClock,
	sameNumber
} from './remoteSync';
import { stats } from './stats.svelte';

export type Mg2Sample = {
	at: number;
	players: Mg2PositionPlayer[];
	mummies: Mg2PositionMummy[];
};

const MAX_EVENTS = 30;

function samePlayer(a: Mg2PositionPlayer, b: Mg2PositionPlayer): boolean {
	return (
		a.id === b.id &&
		sameNumber(a.x, b.x) &&
		sameNumber(a.y, b.y) &&
		sameNumber(a.z, b.z) &&
		sameNumber(a.yaw, b.yaw, 0.000001) &&
		a.alive === b.alive
	);
}

function sameMummy(a: Mg2PositionMummy, b: Mg2PositionMummy): boolean {
	return (
		a.id === b.id &&
		sameNumber(a.x, b.x) &&
		sameNumber(a.y, b.y) &&
		sameNumber(a.z, b.z) &&
		sameNumber(a.yaw, b.yaw, 0.000001) &&
		sameNumber(a.goalX, b.goalX) &&
		sameNumber(a.goalZ, b.goalZ) &&
		a.state === b.state &&
		a.zone === b.zone
	);
}

function sameSample(a: Mg2Sample, b: Mg2Sample): boolean {
	if (a.players.length !== b.players.length || a.mummies.length !== b.mummies.length) {
		return false;
	}

	for (let index = 0; index < a.players.length; index += 1) {
		if (!samePlayer(a.players[index], b.players[index])) {
			return false;
		}
	}

	for (let index = 0; index < a.mummies.length; index += 1) {
		if (!sameMummy(a.mummies[index], b.mummies[index])) {
			return false;
		}
	}

	return true;
}

function mixSample(a: Mg2Sample, b: Mg2Sample, t: number): Mg2Sample {
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

	const mummies = a.mummies.map((mummy) => {
		const next = b.mummies.find((item) => item.id === mummy.id);

		if (!next) {
			return mummy;
		}

		return {
			...mummy,
			x: lerp(mummy.x, next.x, t),
			y: lerp(mummy.y, next.y, t),
			z: lerp(mummy.z, next.z, t),
			yaw: lerpAngle(mummy.yaw, next.yaw, t),
			state: next.state,
			goalX: next.goalX,
			goalZ: next.goalZ
		};
	});

	return { at: b.at, players, mummies };
}

/**
 * Client mirror of the authoritative `minigame-2` state.
 *
 * `snapshot` is the source of truth (phases, counters, skulls, mummies) and
 * `samples` stores positions at 10 Hz to interpolate them with a shared
 * server-clock delay.
 */
class Minigame2Store {
	snapshot = $state<Mg2Snapshot | null>(null);
	events = $state.raw<Mg2Event[]>([]);
	selfId: string | null = null;

	/**
	 * Avoids sending positions before applying the authoritative spawn from
	 * the entrance; in a round already in progress the server places the player
	 * on the staircase and a first report from the central spawn would move them.
	 */
	positionReady = false;

	private clock = new ServerClock();
	private samples = new SampleBuffer<Mg2Sample>(sameSample);

	/** Local physical positions of the mummies (written only by the driver). */
	localMummies = new Map<string, { x: number; y: number; z: number }>();

	/** This client simulates the mummies with its capsule and must report them. */
	get isMummyDriver(): boolean {
		return this.selfId !== null && this.snapshot?.mummyDriverId === this.selfId;
	}

	get self() {
		const state = this.snapshot;
		if (!state || !this.selfId) return null;

		return state.players.find((player) => player.id === this.selfId) ?? null;
	}

	get phase(): Mg2Phase {
		return this.snapshot?.phase ?? 'idle';
	}

	get depositedTotal(): number {
		return this.snapshot?.depositedTotal ?? 0;
	}

	get carried(): number {
		return this.self?.skullsCarried ?? 0;
	}

	get blocksMovement(): boolean {
		const state = this.snapshot;

		if (!state) return false;
		if (state.phase === 'countdown' || state.phase === 'won' || state.phase === 'lost') {
			return true;
		}

		const self = this.self;

		return self !== null && !self.alive;
	}

	get skulls(): Mg2SkullState[] {
		return this.snapshot?.skulls ?? [];
	}

	get mummies(): Mg2MummyState[] {
		return this.snapshot?.mummies ?? [];
	}

	/** Estimated server time to compute `endsAt` without relying on the local clock. */
	serverNow(): number {
		return this.clock.now();
	}

	applySnapshot(state: Mg2Snapshot): void {
		// The 1 Hz snapshot corrects most of the drift; position packets trim
		// the rest below. Replacing the offset outright made the interpolation
		// target jump with every snapshot.
		this.clock.sync(state.serverTime, 0.15);
		this.snapshot = state;

		if (state.phase === 'idle') {
			this.samples.clear();
			this.localMummies.clear();
		}
	}

	/** Driver's mummy report for `CryptSession` (10 Hz). */
	mummiesToReport(): Mg2MummyReport[] {
		if (!this.isMummyDriver || this.localMummies.size === 0) return [];

		const active = new Set(this.snapshot?.mummies.map((mummy) => mummy.id) ?? []);
		const report: Mg2MummyReport[] = [];

		for (const [id, position] of this.localMummies) {
			if (active.has(id)) {
				report.push({ id, x: position.x, y: position.y, z: position.z });
			}
		}

		return report;
	}

	applyPositions(players: Mg2PositionPlayer[], mummies: Mg2PositionMummy[], at = Date.now()): void {
		// 10 Hz packets keep the clock estimate fresh without the 1 s jumps.
		this.clock.sync(at, 0.05);
		this.samples.push(at, { at, players, mummies });
	}

	applyEvent(event: Mg2Event): void {
		this.events = [...this.events, event].slice(-MAX_EVENTS);

		if (!this.selfId) {
			return;
		}

		switch (event.kind) {
			case 'round-start':
				stats.startMission('crypt');
				break;
			case 'round-won':
				stats.completeMission('crypt');
				break;
			case 'round-lost':
				stats.failMission('crypt');
				break;
			case 'player-died':
				if (event.playerId === this.selfId) {
					stats.recordDeath('crypt');
				}
				break;
		}
	}

	/** Interpolated positions to draw in the current frame. */
	sampleAt(renderTime = this.clock.now() - REMOTE_RENDER_DELAY_MS): {
		players: Mg2PositionPlayer[];
		mummies: Mg2PositionMummy[];
	} {
		const sample = this.samples.sample(renderTime, mixSample);

		if (!sample) {
			return { players: [], mummies: [] };
		}

		return { players: sample.players, mummies: sample.mummies };
	}

	reset(): void {
		this.snapshot = null;
		this.events = [];
		this.selfId = null;
		this.positionReady = false;
		this.clock.reset();
		this.samples.clear();
		this.localMummies.clear();
	}
}

export const minigame2 = new Minigame2Store();
