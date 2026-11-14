import type { RemotePosition } from '../services/protocol';
import {
	lerp,
	lerpAngle,
	REMOTE_RENDER_DELAY_MS,
	SampleBuffer,
	ServerClock,
	sameNumber
} from './remoteSync';

/** A teleport (door, respawn, reconnect) must snap instead of sliding. */
const MAX_SNAP_DISTANCE = 5;

function samePosition(a: RemotePosition, b: RemotePosition): boolean {
	return (
		sameNumber(a.x, b.x) &&
		sameNumber(a.y, b.y) &&
		sameNumber(a.z, b.z) &&
		sameNumber(a.yaw, b.yaw, 0.000001)
	);
}

function mixPosition(a: RemotePosition, b: RemotePosition, t: number): RemotePosition {
	return {
		x: lerp(a.x, b.x, t),
		y: lerp(a.y, b.y, t),
		z: lerp(a.z, b.z, t),
		yaw: lerpAngle(a.yaw, b.yaw, t)
	};
}

/**
 * Known position of every remote player on the outdoor map.
 *
 * The server relays `player-position` at ~10 Hz. Keeping only the newest value
 * made avatars step once per packet, so each player has a small timestamped
 * buffer that is sampled a little in the past.
 */
class RemotePlayers {
	/** Latest authoritative position, used for fallbacks and lookups. */
	positions = $state<Record<string, RemotePosition>>({});

	private clock = new ServerClock();
	private buffers = new Map<string, SampleBuffer<RemotePosition>>();

	apply(playerId: string, position: RemotePosition, at = Date.now()): void {
		// Position packets arrive at 10 Hz, so only trim the clock drift a little
		// each time instead of chasing every packet's network delay.
		this.clock.sync(at, 0.05);

		let buffer = this.buffers.get(playerId);

		if (!buffer) {
			buffer = new SampleBuffer<RemotePosition>(samePosition);
			this.buffers.set(playerId, buffer);
		}

		const last = buffer.latest;

		if (last) {
			const distance = Math.hypot(
				position.x - last.value.x,
				position.y - last.value.y,
				position.z - last.value.z
			);

			// A door, respawn or reconnect teleports the player: start a fresh
			// buffer so interpolation does not drag the avatar across the map.
			if (distance > MAX_SNAP_DISTANCE || at < last.at - 500) {
				buffer.clear();
			}
		}

		buffer.push(at, { ...position });
		this.positions = { ...this.positions, [playerId]: { ...position } };
	}

	/** Latest raw position, without interpolation. */
	get(playerId: string): RemotePosition | undefined {
		return this.positions[playerId];
	}

	/** Interpolated position to draw in the current frame. */
	sampleAt(playerId: string, now = this.clock.now()): RemotePosition | undefined {
		const buffer = this.buffers.get(playerId);

		if (!buffer) {
			return this.positions[playerId];
		}

		return buffer.sample(now - REMOTE_RENDER_DELAY_MS, mixPosition) ?? this.positions[playerId];
	}

	/** Estimated server time, used by the renderer. */
	serverNow(): number {
		return this.clock.now();
	}

	/** Discards players that are no longer connected. */
	prune(activeIds: Iterable<string>): void {
		const active = new Set(activeIds);
		const next: Record<string, RemotePosition> = {};

		for (const [id, position] of Object.entries(this.positions)) {
			if (active.has(id)) {
				next[id] = position;
			}
		}

		for (const id of this.buffers.keys()) {
			if (!active.has(id)) {
				this.buffers.delete(id);
			}
		}

		this.positions = next;
	}

	reset(): void {
		this.positions = {};
		this.buffers.clear();
		this.clock.reset();
	}
}

export const remotePlayers = new RemotePlayers();
