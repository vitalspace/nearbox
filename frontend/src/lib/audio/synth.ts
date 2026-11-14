import type { SoundId } from './recipes';
import { RECIPES } from './recipes';

/**
 * Caché de PCM generado. No depende del DOM ni de `AudioContext`, así que la
 * precarga puede empezar durante la pantalla de carga sin crear un contexto
 * de audio antes del primer gesto del usuario.
 */
const SAMPLE_RATE = 22_050;
const CACHE = new Map<SoundId, Float32Array>();
const QUEUED = new Set<SoundId>();
const QUEUE: SoundId[] = [];

let scheduled = false;
let generationBudgetMs = 4;

type IdleDeadline = {
	timeRemaining(): number;
};

type IdleWindow = typeof globalThis & {
	requestIdleCallback?: (
		callback: (deadline: IdleDeadline) => void,
		options?: { timeout: number }
	) => number;
	cancelIdleCallback?: (handle: number) => void;
};

/**
 * Renderiza una receta y ajusta la longitud a su duración declarada.
 * Así la metadata (`duration`) y el PCM siempre coinciden, incluso si una
 * receta mezcla capas de distinta longitud.
 */
export function renderRecipe(id: SoundId, sampleRate = SAMPLE_RATE): Float32Array {
	const recipe = RECIPES[id];
	const rendered = recipe.render(sampleRate);
	const expected = Math.max(1, Math.round(recipe.duration * sampleRate));

	if (rendered.length === expected) {
		return rendered;
	}

	const output = new Float32Array(expected);
	output.set(rendered.subarray(0, Math.min(rendered.length, expected)));
	return output;
}

function now(): number {
	return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function schedule(): void {
	if (scheduled || QUEUE.length === 0) {
		return;
	}

	scheduled = true;
	const idle = (globalThis as IdleWindow).requestIdleCallback;

	if (typeof idle === 'function') {
		idle(
			(deadline) => {
				flush(Math.max(1, Math.min(generationBudgetMs, deadline.timeRemaining())));
			},
			{ timeout: 120 }
		);
		return;
	}

	setTimeout(() => flush(generationBudgetMs), 0);
}

function flush(budgetMs: number): void {
	scheduled = false;
	const start = now();

	while (QUEUE.length > 0 && now() - start < budgetMs) {
		const id = QUEUE.shift();

		if (!id) {
			break;
		}

		QUEUED.delete(id);

		if (CACHE.has(id)) {
			continue;
		}

		try {
			CACHE.set(id, renderRecipe(id, SAMPLE_RATE));
		} catch (error) {
			console.warn(`[audio] Could not generate "${id}"`, error);
		}
	}

	if (QUEUE.length > 0) {
		schedule();
	}
}

export function enqueue(id: SoundId): void {
	if (CACHE.has(id) || QUEUED.has(id)) {
		return;
	}

	QUEUED.add(id);
	QUEUE.push(id);
	schedule();
}

export function prewarm(ids: readonly SoundId[]): void {
	for (const id of ids) {
		enqueue(id);
	}
}

/** Devuelve el PCM ya generado, o `null` si aún está en la cola. */
export function getPcm(id: SoundId): Float32Array | null {
	return CACHE.get(id) ?? null;
}

/**
 * Asegura un sonido. Los sonidos cortos se pueden renderizar en el acto
 * (primera pisada, primer disparo); los largos se encolan para no bloquear.
 */
export function ensurePcm(id: SoundId, allowSync = false): Float32Array | null {
	const cached = CACHE.get(id);

	if (cached) {
		return cached;
	}

	const recipe = RECIPES[id];

	if (allowSync && recipe.duration <= 0.8) {
		try {
			const pcm = renderRecipe(id, SAMPLE_RATE);
			CACHE.set(id, pcm);
			QUEUED.delete(id);
			return pcm;
		} catch (error) {
			console.warn(`[audio] Could not generate "${id}"`, error);
			return null;
		}
	}

	enqueue(id);
	return null;
}

/** Render inmediato, usado por `audio:check` y por el panel de depuración. */
export function renderNow(id: SoundId): Float32Array {
	const cached = CACHE.get(id);

	if (cached) {
		return cached;
	}

	const pcm = renderRecipe(id, SAMPLE_RATE);
	CACHE.set(id, pcm);
	return pcm;
}

export function releasePcm(id: SoundId): void {
	CACHE.delete(id);
}

export function cachedBytes(): number {
	let bytes = 0;

	for (const pcm of CACHE.values()) {
		bytes += pcm.byteLength;
	}

	return bytes;
}

export function cachedCount(): number {
	return CACHE.size;
}

export function queueLength(): number {
	return QUEUE.length;
}

export function setGenerationBudget(milliseconds: number): void {
	generationBudgetMs = Math.max(1, Math.min(12, milliseconds));
}

export function clearCache(): void {
	CACHE.clear();
	QUEUED.clear();
	QUEUE.length = 0;
}

export { SAMPLE_RATE };
