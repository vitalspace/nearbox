/**
 * Verificación offline del catálogo procedural.
 *
 * Renderiza todas las recetas con el mismo código que usa el navegador y falla
 * si hay NaN/Infinity, picos superiores a 1, longitudes incoherentes o un
 * presupuesto de buffers excedido.
 *
 * Uso: `bun run audio:check`
 */

import { RECIPES, SOUND_GROUPS, type SoundId } from '../src/lib/audio/recipes';
import { renderRecipe, SAMPLE_RATE } from '../src/lib/audio/synth';

const MAX_PEAK = 1;
const MAX_BYTES = 12 * 1024 * 1024;
const SAMPLE_TOLERANCE = 1;

const ids = Object.keys(RECIPES) as SoundId[];
const unique = new Set(ids);

if (unique.size !== ids.length) {
	console.error('Duplicate sound ids found');
	process.exitCode = 1;
}

const grouped = new Set<SoundId>();

for (const group of SOUND_GROUPS) {
	for (const id of group.ids) {
		if (!(id in RECIPES)) {
			console.error(`Sound group references unknown id: ${id}`);
			process.exitCode = 1;
		}

		if (grouped.has(id)) {
			console.error(`Sound ${id} appears in more than one group`);
			process.exitCode = 1;
		}

		grouped.add(id);
	}
}

for (const id of ids) {
	if (!grouped.has(id)) {
		console.error(`Sound ${id} is not listed in SOUND_GROUPS`);
		process.exitCode = 1;
	}
}

let totalBytes = 0;
let longest = 0;
let failures = 0;
const started = performance.now();

for (const id of ids) {
	const recipe = RECIPES[id];

	try {
		const pcm = renderRecipe(id, SAMPLE_RATE);
		const expected = Math.round(recipe.duration * SAMPLE_RATE);

		if (Math.abs(pcm.length - expected) > SAMPLE_TOLERANCE) {
			console.error(`✗ ${id}: length ${pcm.length}, expected ~${expected} (${recipe.duration}s)`);
			failures += 1;
		}

		let peak = 0;
		let invalid = 0;

		for (let index = 0; index < pcm.length; index += 1) {
			const sample = pcm[index];

			if (!Number.isFinite(sample)) {
				invalid += 1;
				continue;
			}

			const magnitude = Math.abs(sample);

			if (magnitude > peak) {
				peak = magnitude;
			}
		}

		if (invalid > 0) {
			console.error(`✗ ${id}: ${invalid} non-finite samples`);
			failures += 1;
		}

		if (peak > MAX_PEAK) {
			console.error(`✗ ${id}: peak ${peak.toFixed(3)} > ${MAX_PEAK}`);
			failures += 1;
		}

		if (peak === 0) {
			console.error(`✗ ${id}: silent buffer`);
			failures += 1;
		}

		totalBytes += pcm.byteLength;
		longest = Math.max(longest, recipe.duration);
	} catch (error) {
		console.error(`✗ ${id}: render threw`, error);
		failures += 1;
	}
}

const megabytes = totalBytes / (1024 * 1024);
const elapsed = (performance.now() - started).toFixed(0);

console.log(
	`Rendered ${ids.length} sounds in ${elapsed} ms | ${megabytes.toFixed(2)} MB | longest ${longest.toFixed(2)} s | ${SAMPLE_RATE} Hz mono`
);

if (totalBytes > MAX_BYTES) {
	console.error(`✗ Cache budget exceeded: ${megabytes.toFixed(2)} MB > 12 MB`);
	failures += 1;
}

if (failures > 0) {
	console.error(`\n${failures} audio check(s) failed`);
	process.exitCode = 1;
} else {
	console.log('✓ All procedural audio recipes are valid');
}
