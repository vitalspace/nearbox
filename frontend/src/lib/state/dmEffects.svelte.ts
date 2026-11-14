/**
 * Short-lived combat feedback for Witch House Deathmatch (minigame-6): shot
 * tracers, muzzle flashes, impact sparks and grenade explosions.
 *
 * Pure presentation: the server owns damage, these effects only make the
 * hitscan/flight visible. Pruned once per frame from `DeathmatchTracers`.
 */

export type DmTracer = {
	id: number;
	from: { x: number; y: number; z: number };
	to: { x: number; y: number; z: number };
	at: number;
};

export type DmSpark = {
	id: number;
	x: number;
	y: number;
	z: number;
	at: number;
};

export type DmExplosion = {
	id: number;
	x: number;
	y: number;
	z: number;
	at: number;
};

export type DmThrowMark = {
	id: number;
	x: number;
	z: number;
	at: number;
};

/** Blood splatter where one of our bullets hit an enemy player. */
export type DmBlood = {
	id: number;
	x: number;
	y: number;
	z: number;
	seed: number;
	at: number;
};

const TRACER_LIFE_MS = 90;
const SPARK_LIFE_MS = 180;
const EXPLOSION_LIFE_MS = 420;
const THROW_MARK_LIFE_MS = 1_500;
const BLOOD_LIFE_MS = 1_400;

class DeathmatchEffects {
	tracers = $state.raw<DmTracer[]>([]);
	sparks = $state.raw<DmSpark[]>([]);
	explosions = $state.raw<DmExplosion[]>([]);
	throws = $state.raw<DmThrowMark[]>([]);
	bloods = $state.raw<DmBlood[]>([]);

	/** Timestamp of the last confirmed hit, consumed by the HUD hit marker. */
	hitAt = $state(0);

	private seq = 0;

	shot(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }): void {
		this.seq += 1;
		this.tracers = [
			...this.tracers.slice(-13),
			{ id: this.seq, from: { ...from }, to: { ...to }, at: performance.now() }
		];
	}

	impact(x: number, y: number, z: number): void {
		this.seq += 1;
		this.hitAt = Date.now();
		this.sparks = [...this.sparks.slice(-9), { id: this.seq, x, y, z, at: performance.now() }];
	}

	explode(x: number, y: number, z: number): void {
		this.seq += 1;
		this.explosions = [
			...this.explosions.slice(-3),
			{ id: this.seq, x, y, z, at: performance.now() }
		];
	}

	throwAt(x: number, z: number): void {
		this.seq += 1;
		this.throws = [...this.throws.slice(-2), { id: this.seq, x, z, at: performance.now() }];
	}

	/** Blood burst at a confirmed enemy hit. */
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

	/** Drops expired effects; called once per frame from `DeathmatchTracers`. */
	prune(now = performance.now()): void {
		const tracers = this.tracers.filter((tracer) => now - tracer.at < TRACER_LIFE_MS);
		const sparks = this.sparks.filter((spark) => now - spark.at < SPARK_LIFE_MS);
		const explosions = this.explosions.filter(
			(explosion) => now - explosion.at < EXPLOSION_LIFE_MS
		);
		const throws = this.throws.filter((mark) => now - mark.at < THROW_MARK_LIFE_MS);
		const bloods = this.bloods.filter((blood) => now - blood.at < BLOOD_LIFE_MS);

		if (tracers.length !== this.tracers.length) this.tracers = tracers;
		if (sparks.length !== this.sparks.length) this.sparks = sparks;
		if (explosions.length !== this.explosions.length) this.explosions = explosions;
		if (throws.length !== this.throws.length) this.throws = throws;
		if (bloods.length !== this.bloods.length) this.bloods = bloods;
	}

	reset(): void {
		this.tracers = [];
		this.sparks = [];
		this.explosions = [];
		this.throws = [];
		this.bloods = [];
		this.hitAt = 0;
	}
}

export const dmEffects = new DeathmatchEffects();
