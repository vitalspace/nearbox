/**
 * Feedback visual de Skyfall Royale (`minigame-8`): trazadoras, fogonazos,
 * chispas de impacto, granadas, explosiones y marcas de lanzamiento.
 *
 * Es pura presentación: el servidor decide impactos y daño. Se poda una vez
 * por frame desde `RoyaleProjectiles`.
 */

export type RoyaleTracer = {
	id: number;
	from: { x: number; y: number; z: number };
	to: { x: number; y: number; z: number };
	at: number;
};

export type RoyaleSpark = {
	id: number;
	x: number;
	y: number;
	z: number;
	at: number;
};

export type RoyaleExplosion = {
	id: number;
	x: number;
	y: number;
	z: number;
	at: number;
};

export type RoyaleThrowMark = {
	id: number;
	x: number;
	z: number;
	at: number;
};

export type RoyaleBlood = {
	id: number;
	x: number;
	y: number;
	z: number;
	seed: number;
	at: number;
};

const TRACER_LIFE_MS = 90;
const SPARK_LIFE_MS = 180;
const EXPLOSION_LIFE_MS = 1_200;
const THROW_MARK_LIFE_MS = 1_500;
const BLOOD_LIFE_MS = 1_400;

class RoyaleEffects {
	tracers = $state.raw<RoyaleTracer[]>([]);
	sparks = $state.raw<RoyaleSpark[]>([]);
	explosions = $state.raw<RoyaleExplosion[]>([]);
	throws = $state.raw<RoyaleThrowMark[]>([]);
	bloods = $state.raw<RoyaleBlood[]>([]);

	/** Timestamp del último impacto confirmado, para el hit marker del HUD. */
	hitAt = $state(0);
	/** Timestamp del último daño recibido, para el flash rojo. */
	hurtAt = $state(0);

	private seq = 0;

	shot(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }): void {
		this.seq += 1;
		this.tracers = [
			...this.tracers.slice(-15),
			{ id: this.seq, from: { ...from }, to: { ...to }, at: performance.now() }
		];
	}

	impact(x: number, y: number, z: number): void {
		this.seq += 1;
		this.hitAt = Date.now();
		this.sparks = [...this.sparks.slice(-11), { id: this.seq, x, y, z, at: performance.now() }];
	}

	explode(x: number, y: number, z: number): void {
		this.seq += 1;
		this.explosions = [
			...this.explosions.slice(-4),
			{ id: this.seq, x, y, z, at: performance.now() }
		];
	}

	throwAt(x: number, z: number): void {
		this.seq += 1;
		this.throws = [...this.throws.slice(-3), { id: this.seq, x, z, at: performance.now() }];
	}

	blood(x: number, y: number, z: number): void {
		this.seq += 1;
		this.bloods = [
			...this.bloods.slice(-18),
			{
				id: this.seq,
				x: x + (Math.random() - 0.5) * 0.24,
				y: y + (Math.random() - 0.5) * 0.2,
				z: z + (Math.random() - 0.5) * 0.24,
				seed: Math.random() * 1000,
				at: performance.now()
			}
		];
	}

	hurt(): void {
		this.hurtAt = Date.now();
	}

	removeBlood(id: number): void {
		this.bloods = this.bloods.filter((blood) => blood.id !== id);
	}

	/** Elimina efectos caducados; se llama una vez por frame. */
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
		this.hurtAt = 0;
	}
}

export const royaleEffects = new RoyaleEffects();
