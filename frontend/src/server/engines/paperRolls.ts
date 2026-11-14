import type { PaperRollScene, PaperRollState, ServerMessage } from '../protocol';
import type { RoomPort } from '../port';

/**
 * Paper rolls thrown by the players.
 *
 * Authoritative and ephemeral registry:
 * - Each player can have at most `MAX_ROLLS_PER_PLAYER` rolls.
 * - When the sixth is thrown, the oldest is discarded (FIFO).
 * - Rolls expire after `PAPER_ROLL_TTL_MS` so a disconnect leaves no garbage.
 *
 * Old `backend/src/ws/paperRolls.ts`: module-level state + `publish` callback.
 * Now one instance per room.
 */

export const MAX_ROLLS_PER_PLAYER = 5;
export const PAPER_ROLL_TTL_MS = 12_000;

const THROW_COOLDOWN_MS = 220;
const MAX_THROW_SPEED = 32;
const MAX_WORLD_COORD = 500;

export type ThrowInput = {
	id: string;
	scene: PaperRollScene;
	x: number;
	y: number;
	z: number;
	vx: number;
	vy: number;
	vz: number;
	yaw: number;
};

function round(value: number): number {
	return Math.round(value * 1000) / 1000;
}

function copyRoll(roll: PaperRollState): PaperRollState {
	return { ...roll };
}

function tooFar(value: number): boolean {
	return !Number.isFinite(value) || Math.abs(value) > MAX_WORLD_COORD;
}

export class PaperRolls {
	private readonly rollsByPlayer = new Map<string, PaperRollState[]>();
	private readonly lastThrowAt = new Map<string, number>();

	constructor(private readonly port: RoomPort) {}

	/** Flat list sorted by age; used for full snapshots. */
	listRolls(): PaperRollState[] {
		return [...this.rollsByPlayer.values()]
			.flat()
			.map(copyRoll)
			.sort((a, b) => a.at - b.at);
	}

	snapshot(now = Date.now()): Extract<ServerMessage, { type: 'rolls-state' }> {
		return {
			type: 'rolls-state',
			serverTime: now,
			rolls: this.listRolls()
		};
	}

	private publishState(now: number): void {
		this.port.broadcast(this.snapshot(now));
	}

	/**
	 * Registers a throw. Returns `true` when the roll entered the state and was
	 * broadcast; `false` when it was rejected (rate, duplicate or invalid).
	 */
	onThrow(playerId: string, input: ThrowInput, now = Date.now()): boolean {
		const last = this.lastThrowAt.get(playerId) ?? 0;

		if (now - last < THROW_COOLDOWN_MS) {
			return false;
		}

		const speed = Math.hypot(input.vx, input.vy, input.vz);

		if (!Number.isFinite(speed) || speed > MAX_THROW_SPEED) {
			return false;
		}

		if ([input.x, input.y, input.z, input.yaw].some(tooFar)) {
			return false;
		}

		// Ids come from the client so it can render the roll immediately.
		if (this.listRolls().some((roll) => roll.id === input.id)) {
			return false;
		}

		this.lastThrowAt.set(playerId, now);

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

		const current = this.rollsByPlayer.get(playerId) ?? [];
		const next = [...current, roll];

		// Sixth roll: the first one leaves.
		while (next.length > MAX_ROLLS_PER_PLAYER) {
			next.shift();
		}

		this.rollsByPlayer.set(playerId, next);
		this.publishState(now);

		return true;
	}

	/** Removes the rolls of a player who leaves the lobby. */
	onPlayerLeave(playerId: string, now = Date.now()): void {
		const current = this.rollsByPlayer.get(playerId);

		this.lastThrowAt.delete(playerId);

		if (!current || current.length === 0) {
			return;
		}

		this.rollsByPlayer.delete(playerId);
		this.publishState(now);
	}

	/** Clears expired rolls and broadcasts if anything changed. */
	tick(now = Date.now()): void {
		let changed = false;

		for (const [playerId, rollList] of this.rollsByPlayer) {
			const kept = rollList.filter((roll) => now - roll.at < PAPER_ROLL_TTL_MS);

			if (kept.length === rollList.length) {
				continue;
			}

			changed = true;

			if (kept.length === 0) {
				this.rollsByPlayer.delete(playerId);
			} else {
				this.rollsByPlayer.set(playerId, kept);
			}
		}

		if (changed) {
			this.publishState(now);
		}
	}

	debugState(): { players: number; rolls: number } {
		let rolls = 0;

		for (const rollList of this.rollsByPlayer.values()) {
			rolls += rollList.length;
		}

		return { players: this.rollsByPlayer.size, rolls };
	}

	clear(): void {
		this.rollsByPlayer.clear();
		this.lastThrowAt.clear();
	}
}
