import type { PaperRollScene, PaperRollState } from '../services/protocol';
import { CANNON_COOLDOWN_MS, type BalloonCannonId, type Vec3 } from './balloonCannons';
import { playerRuntime, playerState } from './playerState';
import { sceneState } from './sceneState.svelte';

/** Max simultaneous rolls per player; the sixth discards the first. */
export const MAX_ROLLS_PER_PLAYER = 5;

/** Must match the server TTL (`backend/src/ws/paperRolls.ts`). */
export const PAPER_ROLL_TTL_MS = 12_000;

const THROW_COOLDOWN_MS = 240;
const THROW_SPEED = 10;
const THROW_LIFT = 5.5;
const HAND_HEIGHT = 1.25;
const PENDING_TTL_MS = 2_500;

/**
 * Paper rolls visible in the world.
 *
 * The server is the source of truth (`rolls-state`), but the client draws the
 * roll instantly so the throw does not depend on latency. Pending rolls are
 * kept until the server confirms them.
 */
class PaperRollStore {
	rolls = $state.raw<PaperRollState[]>([]);
	selfId = $state<string | null>(null);
	/** Monotónico: el audio consume cada lanzamiento una sola vez. */
	throwSeq = $state(0);
	lastThrow = $state<PaperRollState | null>(null);

	private offsetMs = 0;
	private sender: ((roll: PaperRollState, cannon?: BalloonCannonId) => void) | null = null;
	private lastThrowAt = 0;
	private counter = 0;
	private pending = new Map<string, { roll: PaperRollState; sentAt: number }>();

	get scene(): PaperRollScene {
		return sceneState.inCrypt ? 'crypt' : 'map';
	}

	/** Estimated server time (the `at` of the rolls uses this scale). */
	now(): number {
		return Date.now() + this.offsetMs;
	}

	setSender(sender: ((roll: PaperRollState, cannon?: BalloonCannonId) => void) | null): void {
		this.sender = sender;
	}

	/**
	 * Throws a roll from the player's hand toward where the camera looks.
	 * Returns `null` if frozen or still on cooldown.
	 */
	throwRoll(): PaperRollState | null {
		if (playerRuntime.frozen) {
			return null;
		}

		const now = this.now();

		if (now - this.lastThrowAt < THROW_COOLDOWN_MS) {
			return null;
		}

		this.lastThrowAt = now;

		const yaw = playerState.cameraYaw;
		// Same convention as `PlayerCollider`: the camera front is
		// (-sin(yaw), -cos(yaw)).
		const forwardX = -Math.sin(yaw);
		const forwardZ = -Math.cos(yaw);

		return this.register(
			this.scene,
			{
				x: playerState.x + forwardX * 0.5,
				y: playerState.y + HAND_HEIGHT,
				z: playerState.z + forwardZ * 0.5
			},
			{
				x: forwardX * THROW_SPEED,
				y: THROW_LIFT,
				z: forwardZ * THROW_SPEED
			},
			yaw,
			now
		);
	}

	/**
	 * Fires a balloon cannon. The origin/velocity come from `cannonShot`, so the
	 * same numbers drive the visual trajectory and the landing sight.
	 */
	fireCannon(cannon: BalloonCannonId, origin: Vec3, velocity: Vec3): PaperRollState | null {
		if (this.scene !== 'map') {
			return null;
		}

		const now = this.now();

		if (now - this.lastThrowAt < CANNON_COOLDOWN_MS) {
			return null;
		}

		this.lastThrowAt = now;

		const roll = this.register(
			'map',
			origin,
			velocity,
			Math.atan2(velocity.x, velocity.z),
			now,
			cannon
		);

		return roll;
	}

	private register(
		scene: PaperRollScene,
		origin: Vec3,
		velocity: Vec3,
		yaw: number,
		now: number,
		cannon?: BalloonCannonId
	): PaperRollState {
		const ownerId = this.selfId ?? 'local';

		this.counter += 1;

		const roll: PaperRollState = {
			id: `roll-${ownerId.replace(/[^A-Za-z0-9]/g, '').slice(0, 8)}-${now.toString(36)}-${this.counter.toString(36)}`,
			ownerId,
			scene,
			x: origin.x,
			y: origin.y,
			z: origin.z,
			vx: velocity.x,
			vy: velocity.y,
			vz: velocity.z,
			yaw,
			at: now
		};

		const own = this.rolls.filter((item) => item.ownerId === ownerId);
		const others = this.rolls.filter((item) => item.ownerId !== ownerId);
		const nextOwn = [...own, roll].slice(-MAX_ROLLS_PER_PLAYER);

		this.rolls = [...others, ...nextOwn];
		this.pending.set(roll.id, { roll, sentAt: Date.now() });
		this.throwSeq += 1;
		this.lastThrow = roll;
		this.sender?.(roll, cannon);

		return roll;
	}

	/** Replaces the local state with the authoritative server state. */
	applyServerState(serverTime: number, rolls: PaperRollState[]): void {
		const previousOffset = this.offsetMs;
		this.offsetMs = serverTime - Date.now();

		// Los rollos locales pendientes se crearon con el reloj anterior; se
		// desplazan para conservar su edad real.
		const offsetDelta = this.offsetMs - previousOffset;

		if (offsetDelta !== 0) {
			for (const entry of this.pending.values()) {
				entry.roll.at += offsetDelta;
			}

			this.lastThrowAt += offsetDelta;
		}

		const incoming = new Set(rolls.map((roll) => roll.id));
		const wallNow = Date.now();

		for (const [id, entry] of this.pending) {
			if (incoming.has(id) || wallNow - entry.sentAt > PENDING_TTL_MS) {
				this.pending.delete(id);
			}
		}

		const pendingRolls = [...this.pending.values()]
			.map((entry) => entry.roll)
			.filter((roll) => !incoming.has(roll.id));

		this.rolls = [...rolls, ...pendingRolls];
	}

	reset(): void {
		this.rolls = [];
		this.selfId = null;
		this.offsetMs = 0;
		this.lastThrowAt = 0;
		this.pending.clear();
	}
}

export const paperRolls = new PaperRollStore();
