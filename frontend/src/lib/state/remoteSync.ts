/**
 * Shared smoothing primitives for remote multiplayer movement.
 *
 * Every scene (outdoor avatars, free cars, mummies, Grand Prix) receives
 * snapshots at ~10 Hz. Drawing the newest packet directly makes remote
 * characters step, so they are rendered a little in the past and interpolated
 * between the two surrounding samples.
 *
 * The server clock is kept in sync with an EMA instead of being replaced on
 * every packet: a hard replacement jumps the interpolation target whenever
 * network delay fluctuates, which is perceived as stutter.
 */

/**
 * How far in the past remote entities are rendered. Two packet intervals of
 * delay absorb server tick jitter without adding noticeable latency to the
 * local player's own movement.
 */
export const REMOTE_RENDER_DELAY_MS = 200;

/** At 10 Hz, 24 samples cover ~2.4 s of buffer. */
export const REMOTE_SAMPLE_LIMIT = 24;

export type TimedSample<T> = {
	at: number;
	value: T;
};

/** Smoothed estimate of the server clock. */
export class ServerClock {
	private offsetMs = 0;
	private ready = false;

	get synchronized(): boolean {
		return this.ready;
	}

	/** Estimated server time for a local clock reading. */
	now(localNow = Date.now()): number {
		return localNow + this.offsetMs;
	}

	/**
	 * Feeds a server timestamp into the estimate.
	 *
	 * Snapshot packets (1 Hz) use a larger weight so a reconnect is picked up
	 * quickly; position packets (10 Hz) only trim the remaining drift.
	 */
	sync(serverTime: number, weight = 0.15, localNow = Date.now()): void {
		const measured = serverTime - localNow;

		if (!this.ready) {
			this.offsetMs = measured;
			this.ready = true;
			return;
		}

		this.offsetMs += (measured - this.offsetMs) * weight;
	}

	reset(): void {
		this.offsetMs = 0;
		this.ready = false;
	}
}

/** Bounded, timestamped sample buffer with duplicate filtering. */
export class SampleBuffer<T> {
	private samples: TimedSample<T>[] = [];

	constructor(
		private readonly same: (a: T, b: T) => boolean,
		private readonly limit = REMOTE_SAMPLE_LIMIT
	) {}

	get length(): number {
		return this.samples.length;
	}

	get latest(): TimedSample<T> | undefined {
		return this.samples[this.samples.length - 1];
	}

	push(at: number, value: T): void {
		const last = this.samples[this.samples.length - 1];

		// Two server ticks can sample the same client report. Pushing that flat
		// pair makes interpolation pause for a frame, so exact repeats are
		// skipped and the car keeps moving between real samples.
		if (last && this.same(last.value, value)) {
			return;
		}

		this.samples.push({ at, value });

		if (this.samples.length > this.limit) {
			this.samples.splice(0, this.samples.length - this.limit);
		}
	}

	clear(): void {
		this.samples = [];
	}

	/**
	 * Returns the interpolated value at `target`. Before the first sample and
	 * after the last one the nearest sample is returned, which freezes the
	 * entity instead of extrapolating it through walls.
	 */
	sample(target: number, mix: (a: T, b: T, t: number) => T): T | null {
		const samples = this.samples;

		if (samples.length === 0) {
			return null;
		}

		if (samples.length === 1 || target <= samples[0].at) {
			return samples[0].value;
		}

		const last = samples[samples.length - 1];

		if (target >= last.at) {
			return last.value;
		}

		let index = 1;

		while (index < samples.length && samples[index].at < target) {
			index += 1;
		}

		const a = samples[index - 1];
		const b = samples[index];
		const span = b.at - a.at;
		const alpha = span > 0 ? (target - a.at) / span : 0;

		return mix(a.value, b.value, alpha);
	}
}

export function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

/** Shortest-arc angular interpolation. */
export function lerpAngle(a: number, b: number, t: number): number {
	let delta = b - a;

	while (delta > Math.PI) delta -= Math.PI * 2;
	while (delta < -Math.PI) delta += Math.PI * 2;

	return a + delta * t;
}

export type QuaternionLike = {
	x: number;
	y: number;
	z: number;
	w: number;
};

/**
 * Normalised linear interpolation. It avoids the shortest-arc bookkeeping of
 * slerp while keeping rotations continuous at 10 Hz.
 */
export function lerpQuaternion(a: QuaternionLike, b: QuaternionLike, t: number): QuaternionLike {
	let bx = b.x;
	let by = b.y;
	let bz = b.z;
	let bw = b.w;
	const dot = a.x * bx + a.y * by + a.z * bz + a.w * bw;

	if (dot < 0) {
		bx = -bx;
		by = -by;
		bz = -bz;
		bw = -bw;
	}

	const x = a.x + (bx - a.x) * t;
	const y = a.y + (by - a.y) * t;
	const z = a.z + (bz - a.z) * t;
	const w = a.w + (bw - a.w) * t;
	const length = Math.hypot(x, y, z, w) || 1;

	return { x: x / length, y: y / length, z: z / length, w: w / length };
}

export function sameNumber(a: number, b: number, epsilon = 0.0005): boolean {
	return Math.abs(a - b) < epsilon;
}
