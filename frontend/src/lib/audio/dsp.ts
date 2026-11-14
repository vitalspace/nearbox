/**
 * Utilidades DSP puras para el catálogo procedural.
 *
 * Todo se calcula en JavaScript, sin `OfflineAudioContext` y sin depender del
 * DOM: el mismo código se ejecuta en el navegador y en `bun run audio:check`.
 */

export type NoiseKind = 'white' | 'pink' | 'brown';
export type BiquadKind = 'lowpass' | 'highpass' | 'bandpass';
export type WaveShape = 'sine' | 'saw' | 'square' | 'triangle';

export type ToneOptions = {
	duration: number;
	f0: number;
	f1?: number;
	wave?: WaveShape;
	gain?: number;
	attack?: number;
	decay?: number;
	curve?: number;
	vibratoHz?: number;
	vibratoDepth?: number;
	tremoloHz?: number;
	tremoloDepth?: number;
	drive?: number;
	start?: number;
};

export type NoiseOptions = {
	duration: number;
	seed: number;
	kind?: NoiseKind;
	gain?: number;
	attack?: number;
	decay?: number;
	curve?: number;
	start?: number;
	filter?: BiquadKind;
	freq?: number;
	q?: number;
};

export type Formant = {
	freq: number;
	q?: number;
	gain?: number;
};

const TWO_PI = Math.PI * 2;

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

/** PRNG pequeño y determinista (misma semilla → misma secuencia). */
export function mulberry32(seed: number): () => number {
	let state = seed >>> 0;

	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

export function randBetween(random: () => number, min: number, max: number): number {
	return min + random() * (max - min);
}

function noiseSample(
	kind: NoiseKind,
	random: () => number,
	state: { pink: number[]; brown: number }
) {
	const white = random() * 2 - 1;

	if (kind === 'white') {
		return white;
	}

	if (kind === 'brown') {
		state.brown = (state.brown + 0.02 * white) / 1.02;
		return state.brown * 3.5;
	}

	// Pink: aproximación de Paul Kellet, normalizada para no saturar.
	const p = state.pink;
	p[0] = 0.99886 * p[0] + white * 0.0555179;
	p[1] = 0.99332 * p[1] + white * 0.0750759;
	p[2] = 0.969 * p[2] + white * 0.153852;
	p[3] = 0.8665 * p[3] + white * 0.3104856;
	p[4] = 0.55 * p[4] + white * 0.5329522;
	p[5] = -0.7616 * p[5] - white * 0.016898;
	const value = p[0] + p[1] + p[2] + p[3] + p[4] + p[5] + p[6] + white * 0.5362;
	p[6] = white * 0.115926;

	return value * 0.11;
}

function envelope(t: number, attack: number, decay: number, curve: number): number {
	if (attack > 0 && t < attack) {
		return t / attack;
	}

	const safeDecay = Math.max(0.0001, decay);
	const remaining = Math.max(0, 1 - (t - attack) / safeDecay);

	return Math.pow(remaining, Math.max(0.01, curve));
}

function waveSample(shape: WaveShape, phase: number): number {
	const p = phase - Math.floor(phase);

	if (shape === 'saw') {
		return p * 2 - 1;
	}

	if (shape === 'square') {
		return p < 0.5 ? 1 : -1;
	}

	if (shape === 'triangle') {
		return 1 - 4 * Math.abs(p - 0.5);
	}

	return Math.sin(p * TWO_PI);
}

export function renderTone(sampleRate: number, options: ToneOptions): Float32Array {
	const {
		duration,
		f0,
		f1 = f0,
		wave = 'sine',
		gain = 1,
		attack = 0.005,
		decay = duration,
		curve = 2,
		vibratoHz = 0,
		vibratoDepth = 0,
		tremoloHz = 0,
		tremoloDepth = 0,
		drive = 0,
		start = 0
	} = options;

	const total = Math.max(1, Math.floor((start + duration) * sampleRate));
	const data = new Float32Array(total);
	const first = Math.floor(start * sampleRate);
	let phase = 0;

	for (let index = first; index < total; index += 1) {
		const t = index / sampleRate - start;
		const progress = clamp(t / Math.max(0.0001, duration), 0, 1);
		const base = f0 + (f1 - f0) * progress;
		const vibrato = vibratoHz > 0 ? 1 + Math.sin(TWO_PI * vibratoHz * t) * vibratoDepth : 1;
		const tremolo =
			tremoloHz > 0 ? 1 - tremoloDepth * (0.5 + 0.5 * Math.sin(TWO_PI * tremoloHz * t)) : 1;

		phase += (base * vibrato) / sampleRate;

		let value = waveSample(wave, phase) * envelope(t, attack, decay, curve) * gain * tremolo;

		if (drive > 0) {
			value = Math.tanh(value * drive);
		}

		data[index] += value;
	}

	return data;
}

export function renderNoise(sampleRate: number, options: NoiseOptions): Float32Array {
	const {
		duration,
		seed,
		kind = 'white',
		gain = 1,
		attack = 0.002,
		decay = duration,
		curve = 2,
		start = 0,
		filter,
		freq = 1200,
		q = 0.8
	} = options;

	const total = Math.max(1, Math.floor((start + duration) * sampleRate));
	const data = new Float32Array(total);
	const random = mulberry32(seed);
	const state = { pink: [0, 0, 0, 0, 0, 0, 0], brown: 0 };
	const first = Math.floor(start * sampleRate);

	for (let index = 0; index < total; index += 1) {
		const raw = noiseSample(kind, random, state);

		if (index < first) {
			continue;
		}

		const t = index / sampleRate - start;
		data[index] = raw * envelope(t, attack, decay, curve) * gain;
	}

	if (filter) {
		return applyBiquad(data, sampleRate, filter, freq, q);
	}

	return data;
}

type BiquadCoefficients = {
	b0: number;
	b1: number;
	b2: number;
	a1: number;
	a2: number;
};

function biquadCoefficients(
	sampleRate: number,
	kind: BiquadKind,
	frequency: number,
	q: number
): BiquadCoefficients {
	const safeFreq = clamp(frequency, 20, sampleRate * 0.45);
	const safeQ = Math.max(0.0001, q);
	const w0 = (TWO_PI * safeFreq) / sampleRate;
	const cos = Math.cos(w0);
	const alpha = Math.sin(w0) / (2 * safeQ);

	let b0: number;
	let b1: number;
	let b2: number;
	let a0: number;
	let a1: number;
	let a2: number;

	if (kind === 'highpass') {
		b0 = (1 + cos) / 2;
		b1 = -(1 + cos);
		b2 = b0;
		a0 = 1 + alpha;
		a1 = -2 * cos;
		a2 = 1 - alpha;
	} else if (kind === 'bandpass') {
		b0 = alpha;
		b1 = 0;
		b2 = -alpha;
		a0 = 1 + alpha;
		a1 = -2 * cos;
		a2 = 1 - alpha;
	} else {
		b0 = (1 - cos) / 2;
		b1 = 1 - cos;
		b2 = b0;
		a0 = 1 + alpha;
		a1 = -2 * cos;
		a2 = 1 - alpha;
	}

	return {
		b0: b0 / a0,
		b1: b1 / a0,
		b2: b2 / a0,
		a1: a1 / a0,
		a2: a2 / a0
	};
}

export function applyBiquad(
	input: Float32Array,
	sampleRate: number,
	kind: BiquadKind,
	frequency: number,
	q = 0.8
): Float32Array {
	const data = new Float32Array(input.length);
	const coefficients = biquadCoefficients(sampleRate, kind, frequency, q);
	let z1 = 0;
	let z2 = 0;

	for (let index = 0; index < input.length; index += 1) {
		const x = input[index];
		const y = coefficients.b0 * x + z1;
		z1 = coefficients.b1 * x - coefficients.a1 * y + z2;
		z2 = coefficients.b2 * x - coefficients.a2 * y;
		data[index] = y;
	}

	return data;
}

/** Filtro con barrido de frecuencia; recalcula coeficientes cada 32 muestras. */
export function applyFilterSweep(
	input: Float32Array,
	sampleRate: number,
	kind: BiquadKind,
	from: number,
	to: number,
	q = 0.8,
	chunk = 32
): Float32Array {
	const data = new Float32Array(input.length);
	let coefficients = biquadCoefficients(sampleRate, kind, from, q);
	let z1 = 0;
	let z2 = 0;

	for (let index = 0; index < input.length; index += 1) {
		if (index % chunk === 0) {
			const progress = index / Math.max(1, input.length - 1);
			coefficients = biquadCoefficients(sampleRate, kind, from + (to - from) * progress, q);
		}

		const x = input[index];
		const y = coefficients.b0 * x + z1;
		z1 = coefficients.b1 * x - coefficients.a1 * y + z2;
		z2 = coefficients.b2 * x - coefficients.a2 * y;
		data[index] = y;
	}

	return data;
}

/** Aplica una envolvente lineal de ataque y caída exponencial in-place. */
export function shapeEnvelope(
	data: Float32Array,
	sampleRate: number,
	attack: number,
	decay: number,
	curve = 2
): Float32Array {
	for (let index = 0; index < data.length; index += 1) {
		data[index] *= envelope(index / sampleRate, attack, decay, curve);
	}

	return data;
}

export function normalize(data: Float32Array, peak = 0.891): Float32Array {
	let maximum = 0;

	for (let index = 0; index < data.length; index += 1) {
		maximum = Math.max(maximum, Math.abs(data[index]));
	}

	if (maximum > 0.00001) {
		const scale = peak / maximum;

		for (let index = 0; index < data.length; index += 1) {
			data[index] *= scale;
		}
	}

	return data;
}

export function softClip(data: Float32Array, drive = 1.5): Float32Array {
	for (let index = 0; index < data.length; index += 1) {
		data[index] = Math.tanh(data[index] * drive);
	}

	return data;
}

export function fadeEdges(
	data: Float32Array,
	sampleRate: number,
	fadeIn = 0.004,
	fadeOut = 0.008
): Float32Array {
	const inSamples = Math.min(data.length, Math.floor(fadeIn * sampleRate));
	const outSamples = Math.min(data.length, Math.floor(fadeOut * sampleRate));

	for (let index = 0; index < inSamples; index += 1) {
		data[index] *= index / Math.max(1, inSamples);
	}

	for (let index = 0; index < outSamples; index += 1) {
		data[data.length - 1 - index] *= index / Math.max(1, outSamples);
	}

	return data;
}

export function mixInto(
	target: Float32Array,
	source: Float32Array,
	gain = 1,
	offsetSamples = 0
): Float32Array {
	const start = Math.max(0, Math.floor(offsetSamples));

	for (let index = 0; index < source.length && start + index < target.length; index += 1) {
		target[start + index] += source[index] * gain;
	}

	return target;
}

export function mix(...layers: Float32Array[]): Float32Array {
	let length = 0;

	for (const layer of layers) {
		length = Math.max(length, layer.length);
	}

	const result = new Float32Array(length);

	for (const layer of layers) {
		mixInto(result, layer, 1);
	}

	return result;
}

/**
 * Convierte un buffer con cola extra en un loop sin click.
 *
 * `input` debe tener al menos `loopSeconds + fadeSeconds` de muestras. La cola
 * se mezcla sobre el principio, así el final del loop continúa en la primera
 * muestra sin salto.
 */
export function seamlessLoop(
	input: Float32Array,
	sampleRate: number,
	loopSeconds: number,
	fadeSeconds = 0.25
): Float32Array {
	const loopLength = Math.max(1, Math.floor(loopSeconds * sampleRate));
	const fadeLength = Math.min(
		loopLength,
		Math.max(1, Math.floor(fadeSeconds * sampleRate)),
		input.length - loopLength
	);
	const output = new Float32Array(loopLength);

	for (let index = 0; index < loopLength; index += 1) {
		output[index] = input[index];
	}

	for (let index = 0; index < fadeLength; index += 1) {
		const t = index / fadeLength;
		output[index] = input[index] * t + input[loopLength + index] * (1 - t);
	}

	return output;
}

/** Suma varios bandpass en paralelo para simular formantes de voz. */
export function formantLayer(
	source: Float32Array,
	sampleRate: number,
	formants: readonly Formant[]
): Float32Array {
	const output = new Float32Array(source.length);

	for (const formant of formants) {
		const filtered = applyBiquad(source, sampleRate, 'bandpass', formant.freq, formant.q ?? 4);

		mixInto(output, filtered, formant.gain ?? 1);
	}

	return output;
}

export function secondsToSamples(seconds: number, sampleRate: number): number {
	return Math.max(1, Math.round(seconds * sampleRate));
}

export function dbToGain(db: number): number {
	return Math.pow(10, db / 20);
}
