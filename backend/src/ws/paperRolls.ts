import type { PaperRollScene, PaperRollState, ServerMessage } from './protocol';

/**
 * Paper rolls thrown by the players.
 *
 * It is an authoritative and ephemeral registry:
 * - Each player can have at most `MAX_ROLLS_PER_PLAYER` rolls.
 * - When the sixth is thrown, the oldest is discarded (FIFO), so the canvas never
 *   accumulates rolls indefinitely.
 * - Rolls expire on their own after `PAPER_ROLL_TTL_MS` so that a
 *   disconnection or a slow client does not leave garbage behind.
 */

export const MAX_ROLLS_PER_PLAYER = 5;
export const PAPER_ROLL_TTL_MS = 12_000;

const THROW_COOLDOWN_MS = 220;
const MAX_THROW_SPEED = 32;
/** Un disparo de cañón sale mucho más rápido que un lanzamiento a mano. */
const MAX_CANNON_SPEED = 90;
const MAX_WORLD_COORD = 500;

type ThrowInput = {
	id: string;
	scene: PaperRollScene;
	x: number;
	y: number;
	z: number;
	vx: number;
	vy: number;
	vz: number;
	yaw: number;
	/** Presente solo en disparos de cañón del globo. */
	cannon?: 'front' | 'left' | 'right';
};

type PaperRollDeps = {
	publish: (message: ServerMessage) => void;
};

let deps: PaperRollDeps | null = null;

const rollsByPlayer = new Map<string, PaperRollState[]>();
const lastThrowAt = new Map<string, number>();

export function initPaperRolls(next: PaperRollDeps): void {
	deps = next;
}

function round(value: number): number {
	return Math.round(value * 1000) / 1000;
}

function copyRoll(roll: PaperRollState): PaperRollState {
	return { ...roll };
}

/** Flat list sorted by age; used for full snapshots. */
export function listRolls(): PaperRollState[] {
	return [...rollsByPlayer.values()].flat().map(copyRoll).sort((a, b) => a.at - b.at);
}

function publishState(now: number): void {
	deps?.publish({
		type: 'rolls-state',
		serverTime: now,
		rolls: listRolls()
	});
}

function tooFar(value: number): boolean {
	return !Number.isFinite(value) || Math.abs(value) > MAX_WORLD_COORD;
}

/**
 * Registers a throw. Returns `true` if the roll entered the state and was
 * broadcast; `false` if it was rejected (rate, duplicate or invalid values).
 */
export function onThrow(
	playerId: string,
	input: ThrowInput,
	now = Date.now()
): boolean {
	const last = lastThrowAt.get(playerId) ?? 0;

	if (now - last < THROW_COOLDOWN_MS) {
		return false;
	}

	const speed = Math.hypot(input.vx, input.vy, input.vz);
	const maxSpeed = input.cannon ? MAX_CANNON_SPEED : MAX_THROW_SPEED;

	if (!Number.isFinite(speed) || speed > maxSpeed) {
		return false;
	}

	if ([input.x, input.y, input.z, input.yaw].some(tooFar)) {
		return false;
	}

	// The ids come from the client so that the client can render the roll
	// immediately; duplicates are rejected to avoid breaking rendering.
	if (listRolls().some((roll) => roll.id === input.id)) {
		return false;
	}

	lastThrowAt.set(playerId, now);

	const roll: PaperRollState = {
		id: input.id,
		ownerId: playerId,
		scene: input.scene,
		x: round(input.x),
		y: round(input.y),
		z: round(input.z),
		vx: round(input.vx),
		vy: round(input.vy),
		vz: round(input.vz),
		yaw: round(input.yaw),
		at: now
	};

	const current = rollsByPlayer.get(playerId) ?? [];
	const next = [...current, roll];

	// Sixth roll: the first one leaves. The rest of the state stays the same.
	while (next.length > MAX_ROLLS_PER_PLAYER) {
		next.shift();
	}

	rollsByPlayer.set(playerId, next);
	publishState(now);

	return true;
}

/** Removes the rolls of a player who disconnects. */
export function onPlayerLeave(playerId: string, now = Date.now()): void {
	const current = rollsByPlayer.get(playerId);

	lastThrowAt.delete(playerId);

	if (!current || current.length === 0) {
		return;
	}

	rollsByPlayer.delete(playerId);
	publishState(now);
}

/** Clears expired rolls and broadcasts the state if anything changed. */
export function tick(now = Date.now()): void {
	let changed = false;

	for (const [playerId, rollList] of rollsByPlayer) {
		const kept = rollList.filter((roll) => now - roll.at < PAPER_ROLL_TTL_MS);

		if (kept.length === rollList.length) {
			continue;
		}

		changed = true;

		if (kept.length === 0) {
			rollsByPlayer.delete(playerId);
		} else {
			rollsByPlayer.set(playerId, kept);
		}
	}

	if (changed) {
		publishState(now);
	}
}

/** For automated tests only. */
export function debugState(): { players: number; rolls: number } {
	let rolls = 0;

	for (const rollList of rollsByPlayer.values()) {
		rolls += rollList.length;
	}

	return {
		players: rollsByPlayer.size,
		rolls
	};
}
