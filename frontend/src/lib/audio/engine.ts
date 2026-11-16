import type { SoundId } from './recipes';
import { RECIPES } from './recipes';
import {
	ensurePcm,
	getPcm,
	prewarm as prewarmSynth,
	releasePcm,
	renderNow,
	cachedBytes,
	SAMPLE_RATE
} from './synth';
import type {
	AudioStats,
	AudioVolumes,
	BusId,
	LoopHandle,
	PlayOptions,
	Point3,
	SoundHandle,
	SpatialMix
} from './types';
import { resetMusicSpectrum, setMusicSpectrum } from './spectrum';

const MAX_ONE_SHOTS = 24;
const MAX_LOOPS = 12;
const REF_DISTANCE = 4;
const MAX_DISTANCE = 45;

/**
 * Audio externo (por ejemplo el jukebox de SoundCloud) enganchado al motor:
 * comparte master/mute y atenúa/panea según la posición de la fuente.
 */
export type MediaSpatialHandle = {
	setPosition(position: Point3 | null): void;
	setVolume(volume: number): void;
	dispose(): void;
};

type ExternalMediaEntry = {
	source: MediaElementAudioSourceNode;
	gain: GainNode;
	panner: StereoPannerNode;
	/** Derivación de análisis: no se conecta a la salida. */
	analyser: AnalyserNode;
	position: Point3 | null;
	volume: number;
};

const BUS_IDS: readonly BusId[] = ['sfx', 'ambience', 'music', 'voice', 'ui'];

type Voice = {
	id: SoundId;
	source: AudioBufferSourceNode;
	gain: GainNode;
	panner: StereoPannerNode;
	priority: number;
	distance: number;
	ended: boolean;
	sourceId?: string;
};

type LoopVoice = Voice & {
	filter: BiquadFilterNode;
	baseGain: number;
	spatialGain: number;
	panOverride: number | null;
};

type AudioContextConstructor = new (options?: AudioContextOptions) => AudioContext;
type WebkitWindow = Window & {
	AudioContext?: AudioContextConstructor;
	webkitAudioContext?: AudioContextConstructor;
};

function nowMs(): number {
	return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function contextConstructor(): AudioContextConstructor | null {
	if (typeof window === 'undefined') {
		return null;
	}

	const candidate = window as WebkitWindow;
	return candidate.AudioContext ?? candidate.webkitAudioContext ?? null;
}

class AudioEngine {
	private context: AudioContext | null = null;
	private master: GainNode | null = null;
	private compressor: DynamicsCompressorNode | null = null;
	private buses: Partial<Record<BusId, GainNode>> = {};
	private buffers = new Map<SoundId, AudioBuffer>();
	private oneShots = new Set<Voice>();
	private loops = new Set<LoopVoice>();
	private lastPlayed = new Map<string, number>();
	private volumes: AudioVolumes = {
		master: 0.8,
		ambience: 0.55,
		music: 0.45,
		sfx: 0.85,
		ui: 0.6
	};
	private muted = false;
	private musicDuck = 1;
	private listener = { x: 0, y: 0, z: 0, yaw: 0 };
	private maxDistance = MAX_DISTANCE;
	private disposed = false;
	/**
	 * One-shots cuyo PCM aún se está generando. Los sonidos cortos se
	 * renderizan en el acto; los largos (jingles de victoria/derrota) llegan
	 * aquí si la precarga no terminó y se reintentan al estar listos.
	 */
	private pending = new Map<string, { id: SoundId; options: PlayOptions; expiresAt: number }>();
	private pendingTimer: ReturnType<typeof setTimeout> | null = null;
	private externalMedia = new Set<ExternalMediaEntry>();
	private mediaSources = new WeakMap<HTMLAudioElement, ExternalMediaEntry>();
	/** Último medio enganchado: es el que alimenta el espectro del club. */
	private musicEntry: ExternalMediaEntry | null = null;
	private spectrumData: Uint8Array<ArrayBuffer> | null = null;
	private bassAverage = 0;
	private beatEnvelope = 0;

	init(): boolean {
		if (this.context) {
			return true;
		}

		const Constructor = contextConstructor();

		if (!Constructor) {
			return false;
		}

		try {
			this.context = new Constructor({ latencyHint: 'interactive' });
		} catch {
			try {
				this.context = new Constructor();
			} catch {
				this.context = null;
				return false;
			}
		}

		const context = this.context;
		this.master = context.createGain();
		this.compressor = context.createDynamicsCompressor();
		this.compressor.threshold.value = -12;
		this.compressor.knee.value = 24;
		this.compressor.ratio.value = 12;
		this.compressor.attack.value = 0.003;
		this.compressor.release.value = 0.25;

		this.master.connect(this.compressor);
		this.compressor.connect(context.destination);

		for (const bus of BUS_IDS) {
			const gain = context.createGain();
			gain.connect(this.master);
			this.buses[bus] = gain;
		}

		this.applyVolumes();
		return true;
	}

	async unlock(): Promise<boolean> {
		if (!this.init()) {
			return false;
		}

		const context = this.context;

		if (!context) {
			return false;
		}

		try {
			if (context.state !== 'running') {
				await context.resume();
			}
		} catch (error) {
			console.warn('[audio] Could not resume the audio context', error);
			return false;
		}

		return context.state === 'running';
	}

	isReady(): boolean {
		return this.context !== null && this.context.state === 'running';
	}

	isSupported(): boolean {
		return contextConstructor() !== null;
	}

	setVolumes(volumes: AudioVolumes): void {
		this.volumes = {
			master: Math.min(1, Math.max(0, volumes.master)),
			ambience: Math.min(1, Math.max(0, volumes.ambience)),
			music: Math.min(1, Math.max(0, volumes.music)),
			sfx: Math.min(1, Math.max(0, volumes.sfx)),
			ui: Math.min(1, Math.max(0, volumes.ui))
		};
		this.applyVolumes();
	}

	setMuted(muted: boolean): void {
		this.muted = muted;
		this.applyVolumes();
	}

	/**
	 * Atenúa solo el bus de música (0..1). La usa el jukebox del club para
	 * dejar sonar la pista de SoundCloud sin apilar dos músicas.
	 */
	setMusicDuck(duck: number): void {
		this.musicDuck = Math.min(1, Math.max(0, duck));
		this.applyVolumes();
	}

	/**
	 * Engancha un `<audio>`/`<video>` al motor para que respete el master y se
	 * atenúe/panea con la posición de la fuente. Se llama una sola vez por
	 * elemento (crear dos `MediaElementSource` del mismo elemento lanza error).
	 */
	attachMedia(element: HTMLAudioElement, volume = 1): MediaSpatialHandle | null {
		if (!this.init() || !this.context || !this.master) {
			return null;
		}

		let entry = this.mediaSources.get(element);

		if (!entry) {
			let source: MediaElementAudioSourceNode;

			try {
				source = this.context.createMediaElementSource(element);
			} catch (error) {
				console.warn('[audio] Could not attach media element', error);
				return null;
			}

			const gain = this.context.createGain();
			const panner = this.context.createStereoPanner();
			const analyser = this.context.createAnalyser();
			analyser.fftSize = 2048;
			analyser.smoothingTimeConstant = 0.72;

			source.connect(gain);
			gain.connect(panner);
			panner.connect(this.master);
			// Derivación en paralelo para el espectro: no altera la salida.
			source.connect(analyser);

			entry = { source, gain, panner, analyser, position: null, volume };
			this.mediaSources.set(element, entry);
			this.externalMedia.add(entry);
			this.musicEntry = entry;
		} else {
			entry.volume = volume;
		}

		this.applyExternalSpatial(entry);

		return {
			setPosition: (position) => {
				entry.position = position;
				this.applyExternalSpatial(entry);
			},
			setVolume: (value) => {
				entry.volume = Math.min(1, Math.max(0, value));
				this.applyExternalSpatial(entry);
			},
			dispose: () => {
				this.externalMedia.delete(entry);
				this.mediaSources.delete(element);
				entry.source.disconnect();
				entry.gain.disconnect();
				entry.panner.disconnect();
				entry.analyser.disconnect();

				if (this.musicEntry === entry) {
					this.musicEntry = null;
					this.bassAverage = 0;
					this.beatEnvelope = 0;
					resetMusicSpectrum();
				}
			}
		};
	}

	private applyExternalSpatial(entry: ExternalMediaEntry): void {
		if (!this.context) {
			return;
		}

		const now = this.context.currentTime;
		const spatial = entry.position ? this.spatialFor(entry.position) : null;
		const gain = entry.volume * (spatial?.gain ?? 1);
		const pan = spatial?.pan ?? 0;

		entry.gain.gain.setTargetAtTime(gain, now, 0.08);
		entry.panner.pan.setTargetAtTime(pan, now, 0.08);
	}

	/**
	 * Lee el analizador del jukebox y publica el espectro para los visuales del
	 * club (pantalla y láseres). Se llama una vez por frame desde `SceneAudio`.
	 */
	sampleMusicSpectrum(dt: number): void {
		const step = Math.min(0.1, Math.max(0, dt));
		const entry = this.musicEntry;

		if (!entry) {
			this.bassAverage = 0;
			this.beatEnvelope *= Math.exp(-step * 8);
			setMusicSpectrum({
				bass: 0,
				mid: 0,
				high: 0,
				beat: Math.max(0, this.beatEnvelope),
				energy: 0,
				active: false
			});
			return;
		}

		const analyser = entry.analyser;

		const bins = analyser.frequencyBinCount;

		if (!this.spectrumData || this.spectrumData.length !== bins) {
			this.spectrumData = new Uint8Array(bins);
		}

		const data = this.spectrumData;
		analyser.getByteFrequencyData(data);

		const sampleRate = this.context?.sampleRate ?? 44100;
		const binHz = sampleRate / 2 / bins;

		const band = (lowHz: number, highHz: number): number => {
			const from = Math.max(0, Math.floor(lowHz / binHz));
			const to = Math.min(bins - 1, Math.ceil(highHz / binHz));

			if (to < from) {
				return 0;
			}

			let sum = 0;

			for (let i = from; i <= to; i += 1) {
				sum += data[i];
			}

			return sum / ((to - from + 1) * 255);
		};

		const bass = band(30, 160);
		const mid = band(200, 2000);
		const high = band(2500, 9000);
		const energy = Math.min(1, bass * 0.55 + mid * 0.3 + high * 0.15);
		const element = entry.source.mediaElement;
		const running = this.context?.state === 'running';
		const playing = running && Boolean(element) && !element.paused && element.readyState >= 2;

		// Golpe = subida brusca de graves sobre su media móvil.
		const flux = Math.max(0, bass - this.bassAverage);
		this.bassAverage += (bass - this.bassAverage) * Math.min(1, step * 4);

		if (playing && bass > 0.16 && flux > 0.045) {
			this.beatEnvelope = 1;
		} else {
			this.beatEnvelope *= Math.exp(-step * 7);
		}

		setMusicSpectrum({
			bass,
			mid,
			high,
			beat: Math.max(0, Math.min(1, this.beatEnvelope)),
			energy,
			active: playing
		});
	}

	/** Las voces comparten el deslizador de efectos; el resto tiene el suyo. */
	private busVolume(bus: BusId): number {
		if (bus === 'voice') {
			return this.volumes.sfx;
		}

		return this.volumes[bus];
	}

	private applyVolumes(): void {
		if (!this.context) {
			return;
		}

		const now = this.context.currentTime;
		const master = this.master;

		if (master) {
			master.gain.setTargetAtTime(
				this.muted ? 0 : this.volumes.master * this.volumes.master,
				now,
				0.01
			);
		}

		for (const bus of BUS_IDS) {
			const node = this.buses[bus];

			if (node) {
				const value = this.busVolume(bus);
				const duck = bus === 'music' ? this.musicDuck : 1;
				node.gain.setTargetAtTime(value * value * duck, now, 0.01);
			}
		}
	}

	setMaxDistance(distance: number): void {
		this.maxDistance = Math.max(10, Math.min(60, distance));
	}

	setListener(x: number, y: number, z: number, yaw: number): void {
		this.listener.x = x;
		this.listener.y = y;
		this.listener.z = z;
		this.listener.yaw = yaw;

		for (const entry of this.externalMedia) {
			this.applyExternalSpatial(entry);
		}
	}

	private spatialFor(position: Point3 | undefined): SpatialMix {
		if (!position) {
			return { gain: 1, pan: 0, distance: 0 };
		}

		const dx = position.x - this.listener.x;
		const dy = position.y - this.listener.y;
		const dz = position.z - this.listener.z;
		const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

		if (distance >= this.maxDistance) {
			return { gain: 0, pan: 0, distance };
		}

		const attenuation =
			distance <= REF_DISTANCE
				? 1
				: Math.pow(
						Math.max(
							0,
							Math.min(1, 1 - (distance - REF_DISTANCE) / (this.maxDistance - REF_DISTANCE))
						),
						1.6
					);

		// Oreja derecha aproximada: basta para paneo estéreo, sin HRTF.
		const rightX = Math.cos(this.listener.yaw);
		const rightZ = -Math.sin(this.listener.yaw);
		const pan = Math.max(-1, Math.min(1, (dx * rightX + dz * rightZ) / (distance + 2)));

		return { gain: attenuation, pan, distance };
	}

	private busFor(bus: BusId): GainNode | null {
		return this.buses[bus] ?? null;
	}

	private audioBufferFor(id: SoundId, pcm: Float32Array): AudioBuffer | null {
		const context = this.context;

		if (!context) {
			return null;
		}

		const cached = this.buffers.get(id);

		if (cached && cached.length === pcm.length) {
			return cached;
		}

		const buffer = context.createBuffer(1, pcm.length, SAMPLE_RATE);
		buffer.copyToChannel(new Float32Array(pcm), 0);
		this.buffers.set(id, buffer);
		// El `AudioBuffer` ya es la copia que usa Web Audio; liberar el PCM
		// evita mantener dos veces el mismo sonido en memoria.
		releasePcm(id);
		return buffer;
	}

	private pickWorstVoice(): Voice | null {
		let worst: Voice | null = null;

		for (const voice of this.oneShots) {
			if (!worst || voice.priority < worst.priority) {
				worst = voice;
			} else if (worst && voice.priority === worst.priority && voice.distance > worst.distance) {
				worst = voice;
			}
		}

		return worst;
	}

	private removeVoice(voice: Voice, fadeMs = 20): void {
		if (voice.ended) {
			return;
		}

		voice.ended = true;
		const context = this.context;
		const now = context?.currentTime ?? 0;

		try {
			voice.gain.gain.cancelScheduledValues(now);
			voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), now);
			voice.gain.gain.linearRampToValueAtTime(0.0001, now + Math.max(0.01, fadeMs / 1000));
			voice.source.stop(now + Math.max(0.02, fadeMs / 1000 + 0.02));
		} catch {
			// La fuente ya había terminado; el `onended` la retirará.
		}

		this.oneShots.delete(voice);
		this.loops.delete(voice as LoopVoice);
	}

	private queueWhenReady(id: SoundId, key: string, options: PlayOptions): void {
		if (this.pending.has(key)) {
			return;
		}

		this.pending.set(key, { id, options, expiresAt: nowMs() + 4000 });

		if (this.pendingTimer === null) {
			this.pendingTimer = setTimeout(() => this.flushPending(), 80);
		}
	}

	private flushPending(): void {
		this.pendingTimer = null;

		if (this.disposed) {
			this.pending.clear();
			return;
		}

		const now = nowMs();

		for (const [key, entry] of this.pending) {
			if (now >= entry.expiresAt) {
				this.pending.delete(key);
				continue;
			}

			if (getPcm(entry.id)) {
				this.pending.delete(key);
				this.play(entry.id, entry.options);
			}
		}

		if (this.pending.size > 0 && this.pendingTimer === null) {
			this.pendingTimer = setTimeout(() => this.flushPending(), 80);
		}
	}

	play(id: SoundId, options: PlayOptions = {}): import('./types').SoundHandle | null {
		const context = this.context;

		if (!context || context.state !== 'running' || this.disposed) {
			return null;
		}

		const recipe = RECIPES[id];
		const priority = options.priority ?? recipe.priority;
		const cooldownKey = `${id}:${options.sourceId ?? ''}`;
		const last = this.lastPlayed.get(cooldownKey) ?? -Infinity;

		if (nowMs() - last < recipe.cooldownMs) {
			return null;
		}

		const spatial = this.spatialFor(options.position);

		if (spatial.gain <= 0.001) {
			return null;
		}

		let sameSound = 0;

		for (const voice of this.oneShots) {
			if (voice.id === id) {
				sameSound += 1;
			}
		}

		if (sameSound >= recipe.maxVoices) {
			return null;
		}

		if (this.oneShots.size >= MAX_ONE_SHOTS) {
			const worst = this.pickWorstVoice();

			if (!worst || priority <= worst.priority) {
				return null;
			}

			this.removeVoice(worst, 15);
		}

		let buffer = this.buffers.get(id) ?? null;

		if (!buffer) {
			const pcm = ensurePcm(id, true);

			if (!pcm) {
				// Los sonidos largos (jingles de victoria/derrota) no se pueden
				// renderizar en el acto sin bloquear el frame; si la precarga
				// aún no llegó, se reintenta en cuanto el PCM esté listo.
				if (recipe.duration > 0.8) {
					this.queueWhenReady(id, cooldownKey, options);
				}

				return null;
			}

			buffer = this.audioBufferFor(id, pcm);
		}
		const bus = this.busFor(options.bus ?? recipe.bus);

		if (!buffer || !bus) {
			return null;
		}

		try {
			const source = context.createBufferSource();
			const gain = context.createGain();
			const panner = context.createStereoPanner();

			source.buffer = buffer;
			source.playbackRate.value = Math.max(0.5, Math.min(2, options.rate ?? 1));
			gain.gain.value = spatial.gain * Math.max(0, Math.min(1, options.volume ?? 1));
			panner.pan.value = spatial.pan;

			source.connect(gain);
			gain.connect(panner);
			panner.connect(bus);

			const voice: Voice = {
				id,
				source,
				gain,
				panner,
				priority,
				distance: spatial.distance,
				ended: false
			};

			source.onended = () => {
				voice.ended = true;
				this.oneShots.delete(voice);
			};

			source.start(context.currentTime + 0.005);
			this.oneShots.add(voice);
			this.lastPlayed.set(cooldownKey, nowMs());

			return {
				stop: (fadeMs = 30) => this.removeVoice(voice, fadeMs)
			};
		} catch (error) {
			console.warn(`[audio] Could not play "${id}"`, error);
			return null;
		}
	}

	loop(id: SoundId, options: PlayOptions = {}): LoopHandle | null {
		const context = this.context;

		if (!context || context.state !== 'running' || this.disposed) {
			return null;
		}

		if (this.loops.size >= MAX_LOOPS) {
			return null;
		}

		const recipe = RECIPES[id];

		if (!recipe.loop) {
			console.warn(`[audio] "${id}" is not a loop`);
			return null;
		}

		let buffer = this.buffers.get(id) ?? null;

		if (!buffer) {
			const pcm = options.sync ? renderNow(id) : ensurePcm(id, false);

			if (!pcm) {
				return null;
			}

			buffer = this.audioBufferFor(id, pcm);
		}
		const bus = this.busFor(options.bus ?? recipe.bus);

		if (!buffer || !bus) {
			return null;
		}

		try {
			const source = context.createBufferSource();
			const gain = context.createGain();
			const panner = context.createStereoPanner();
			const filter = context.createBiquadFilter();

			source.buffer = buffer;
			source.loop = true;
			source.playbackRate.value = Math.max(0.5, Math.min(2, options.rate ?? 1));
			filter.type = 'lowpass';
			filter.frequency.value = Math.min(18_000, context.sampleRate * 0.45);
			filter.Q.value = 0.7;

			const spatial = this.spatialFor(options.position);
			const baseGain = Math.max(0, Math.min(1, options.volume ?? 1));

			gain.gain.value = baseGain * spatial.gain;
			panner.pan.value = spatial.pan;

			source.connect(filter);
			filter.connect(gain);
			gain.connect(panner);
			panner.connect(bus);

			const voice: LoopVoice = {
				id,
				source,
				gain,
				panner,
				filter,
				priority: options.priority ?? recipe.priority,
				distance: spatial.distance,
				ended: false,
				baseGain,
				spatialGain: spatial.gain,
				panOverride: null,
				sourceId: options.sourceId
			};

			const applyGain = (): void => {
				const now = context.currentTime;
				gain.gain.setTargetAtTime(Math.max(0.0001, voice.baseGain * voice.spatialGain), now, 0.03);
			};

			source.onended = () => {
				voice.ended = true;
				this.loops.delete(voice);
			};

			source.start(context.currentTime + 0.01);
			this.loops.add(voice);

			return {
				setGain: (nextGain, smoothMs = 80) => {
					voice.baseGain = Math.max(0, Math.min(1, nextGain));
					gain.gain.setTargetAtTime(
						Math.max(0.0001, voice.baseGain * voice.spatialGain),
						context.currentTime,
						Math.max(0.01, smoothMs / 1000)
					);
				},
				setPan: (pan, smoothMs = 80) => {
					voice.panOverride = Math.max(-1, Math.min(1, pan));
					panner.pan.setTargetAtTime(
						voice.panOverride,
						context.currentTime,
						Math.max(0.01, smoothMs / 1000)
					);
				},
				setRate: (rate, smoothMs = 80) => {
					source.playbackRate.setTargetAtTime(
						Math.max(0.5, Math.min(2, rate)),
						context.currentTime,
						Math.max(0.01, smoothMs / 1000)
					);
				},
				setFilter: (frequency, q = 0.8, smoothMs = 80) => {
					filter.frequency.setTargetAtTime(
						Math.max(40, Math.min(context.sampleRate * 0.45, frequency)),
						context.currentTime,
						Math.max(0.01, smoothMs / 1000)
					);
					filter.Q.setTargetAtTime(q, context.currentTime, Math.max(0.01, smoothMs / 1000));
				},
				setPosition: (position, smoothMs = 80) => {
					const next = this.spatialFor(position);
					voice.spatialGain = next.gain;
					voice.distance = next.distance;

					if (voice.panOverride === null) {
						panner.pan.setTargetAtTime(
							next.pan,
							context.currentTime,
							Math.max(0.01, smoothMs / 1000)
						);
					}

					applyGain();
				},
				stop: (fadeMs = 120) => this.removeVoice(voice, fadeMs)
			};
		} catch (error) {
			console.warn(`[audio] Could not loop "${id}"`, error);
			return null;
		}
	}

	prewarm(ids: readonly SoundId[]): void {
		prewarmSynth(ids);
	}

	suspend(): void {
		const context = this.context;

		if (context && context.state === 'running') {
			void context.suspend().catch(() => undefined);
		}
	}

	resume(): void {
		const context = this.context;

		if (context && context.state === 'suspended') {
			void context.resume().catch(() => undefined);
		}
	}

	/** Corta todas las voces; `keepSourceId` conserva, por ejemplo, la música. */
	stopAll(fadeMs = 40, keepSourceId?: string): void {
		// Un jingle que aún esperaba su PCM no debe sonar en la escena siguiente.
		this.pending.clear();

		for (const voice of [...this.oneShots]) {
			this.removeVoice(voice, fadeMs);
		}

		for (const voice of [...this.loops]) {
			if (keepSourceId !== undefined && voice.sourceId === keepSourceId) {
				continue;
			}

			this.removeVoice(voice, fadeMs);
		}
	}

	private bufferBytes(): number {
		let bytes = 0;

		for (const buffer of this.buffers.values()) {
			bytes += buffer.length * buffer.numberOfChannels * 4;
		}

		return bytes;
	}

	stats(): AudioStats {
		return {
			oneShots: this.oneShots.size,
			loops: this.loops.size,
			cachedBytes: cachedBytes() + this.bufferBytes(),
			state: this.context?.state ?? 'none',
			unlocked: this.isReady()
		};
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}

		this.disposed = true;
		this.stopAll(0);
		this.buffers.clear();
		this.lastPlayed.clear();
		this.pending.clear();

		if (this.pendingTimer !== null) {
			clearTimeout(this.pendingTimer);
			this.pendingTimer = null;
		}

		const context = this.context;
		this.context = null;
		this.master = null;
		this.compressor = null;
		this.buses = {};

		if (context) {
			void context.close().catch(() => undefined);
		}
	}
}

export const audio = new AudioEngine();
export type AudioEngineApi = typeof audio;
