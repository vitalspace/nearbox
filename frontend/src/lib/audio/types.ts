/**
 * Tipos compartidos del motor de audio procedural.
 *
 * No hay archivos de audio: cada sonido es una receta determinista que se
 * renderiza a un `Float32Array` y se cachea como `AudioBuffer`.
 */

export type BusId = 'sfx' | 'ambience' | 'music' | 'voice' | 'ui';

export type SoundPriority = 0 | 1 | 2 | 3;

export type SurfaceId = 'grass' | 'dirt' | 'stone' | 'wood';

export type Recipe = {
	/** Duración audible en segundos. */
	duration: number;
	/** Semilla del PRNG; misma semilla → mismo buffer. */
	seed: number;
	bus: BusId;
	priority: SoundPriority;
	/** Máximo de voces simultáneas de este mismo sonido. */
	maxVoices: number;
	/** Ventana mínima entre dos disparos del mismo sonido/fuente. */
	cooldownMs: number;
	/** Los loops se cruzan con fade para que el salto no chasquee. */
	loop?: boolean;
	render: (sampleRate: number) => Float32Array;
};

export type Point3 = {
	x: number;
	y: number;
	z: number;
};

export type PlayOptions = {
	position?: Point3;
	/** Multiplicador 0–1 sobre la ganancia base de la receta. */
	volume?: number;
	/** Velocidad de reproducción (0,5–2). */
	rate?: number;
	/** Identificador de la entidad que dispara (cooldown por fuente). */
	sourceId?: string;
	priority?: SoundPriority;
	bus?: BusId;
	/**
	 * Renderiza el PCM en el acto si aún no está cacheado. Se usa en loops que
	 * deben sonar ya (motor del coche) aunque la precarga no haya llegado.
	 */
	sync?: boolean;
};

export type SoundHandle = {
	stop(fadeMs?: number): void;
};

export type LoopHandle = SoundHandle & {
	setGain(gain: number, smoothMs?: number): void;
	setPan(pan: number, smoothMs?: number): void;
	setRate(rate: number, smoothMs?: number): void;
	setFilter(freq: number, q?: number, smoothMs?: number): void;
	setPosition(position: Point3 | undefined, smoothMs?: number): void;
};

export type AudioVolumes = {
	master: number;
	ambience: number;
	music: number;
	sfx: number;
	ui: number;
};

export type AudioStats = {
	oneShots: number;
	loops: number;
	cachedBytes: number;
	state: string;
	unlocked: boolean;
};

export type SpatialMix = {
	gain: number;
	pan: number;
	distance: number;
};
