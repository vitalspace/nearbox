/**
 * Short-lived combat feedback for Barn Siege (minigame-5): shot tracers,
 * muzzle flashes and impact sparks.
 *
 * The server is authoritative and the client never draws its own damage: these
 * effects only make the hitscan visible so the player can tell a shot landed.
 * They live apart from `minigame5` because they are pure presentation and are
 * pruned every frame.
 */

export type WaveTracer = {
	id: number;
	from: { x: number; y: number; z: number };
	to: { x: number; y: number; z: number };
	at: number;
};

export type WaveSpark = {
	id: number;
	x: number;
	y: number;
	z: number;
	at: number;
};

/** Ground ring marking where the thrown grenade will land. */
export type WaveThrowMark = {
	id: number;
	x: number;
	z: number;
	at: number;
};

/**
 * Blood splatter left where one of our bullets landed on a monster.
 *
 * The server already sends the damage point in `monster-hit`; this only adds
 * the red impact feedback on top of the hit spark.
 */
export type WaveBlood = {
	id: number;
	x: number;
	y: number;
	z: number;
	seed: number;
	at: number;
};

const TRACER_LIFE_MS = 90;
const SPARK_LIFE_MS = 180;
const THROW_MARK_LIFE_MS = 1_500;
const BLOOD_LIFE_MS = 1_400;

class WaveEffects {
	tracers = $state.raw<WaveTracer[]>([]);
	sparks = $state.raw<WaveSpark[]>([]);
	throws = $state.raw<WaveThrowMark[]>([]);
	bloods = $state.raw<WaveBlood[]>([]);

	/** Timestamp of the last local hit, consumed by the HUD hit marker. */
	hitAt = $state(0);

	private seq = 0;

	shot(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }): void {
		this.seq += 1;
		this.tracers = [
			...this.tracers.slice(-11),
			{ id: this.seq, from: { ...from }, to: { ...to }, at: performance.now() }
		];
	}

	impact(x: number, y: number, z: number): void {
		this.seq += 1;
		this.hitAt = Date.now();
		this.sparks = [...this.sparks.slice(-7), { id: this.seq, x, y, z, at: performance.now() }];
	}

	throwAt(x: number, z: number): void {
		this.seq += 1;
		this.throws = [...this.throws.slice(-2), { id: this.seq, x, z, at: performance.now() }];
	}

	removeThrow(id: number): void {
		this.throws = this.throws.filter((mark) => mark.id !== id);
	}

	/** Blood burst at a confirmed hit point. */
	blood(x: number, y: number, z: number): void {
		this.seq += 1;
		this.bloods = [
			...this.bloods.slice(-15),
			{
				id: this.seq,
				// A little jitter so repeated hits on the same body do not
				// stack the exact same decal.
				x: x + (Math.random() - 0.5) * 0.24,
				y: y + (Math.random() - 0.5) * 0.2,
				z: z + (Math.random() - 0.5) * 0.24,
				seed: Math.random() * 1000,
				at: performance.now()
			}
		];
	}

	removeBlood(id: number): void {
		this.bloods = this.bloods.filter((blood) => blood.id !== id);
	}

	/** Drops expired effects; called once per frame from `WaveTracers`. */
	prune(now = performance.now()): void {
		const tracers = this.tracers.filter((tracer) => now - tracer.at < TRACER_LIFE_MS);
		const sparks = this.sparks.filter((spark) => now - spark.at < SPARK_LIFE_MS);
		const throws = this.throws.filter((mark) => now - mark.at < THROW_MARK_LIFE_MS);
		const bloods = this.bloods.filter((blood) => now - blood.at < BLOOD_LIFE_MS);

		if (tracers.length !== this.tracers.length) {
			this.tracers = tracers;
		}

		if (sparks.length !== this.sparks.length) {
			this.sparks = sparks;
		}

		if (throws.length !== this.throws.length) {
			this.throws = throws;
		}

		if (bloods.length !== this.bloods.length) {
			this.bloods = bloods;
		}
	}

	reset(): void {
		this.tracers = [];
		this.sparks = [];
		this.throws = [];
		this.bloods = [];
		this.hitAt = 0;
	}
}

export const waveEffects = new WaveEffects();
