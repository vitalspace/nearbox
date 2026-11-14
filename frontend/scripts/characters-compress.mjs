#!/usr/bin/env node
/**
 * `characters:compress` — comprime los GLB de personajes con Draco.
 *
 * Antes de Draco se aplica un pre-paso de glTF-Transform:
 *   dedup → prune → weld → resample(1e-4) → conservar duraciones → Draco.
 *
 * `resample` elimina keyframes repetidos que Blender hornea al aplicar IK.
 * Como puede acortar el último tramo constante de un clip, después se
 * reinyecta un keyframe final en la duración original de cada sampler.
 *
 * Los exports originales se guardan en `world/source/<glb>` y nunca se
 * comprimen dos veces. `--restore` devuelve esos originales a `static/`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { dedup, prune, resample, weld } from '@gltf-transform/functions';
import {
	createDracoIO,
	isDracoGlb,
	log,
	parseArgs,
	readGlb,
	readJson,
	STATIC_DIR,
	WORLD_DIR,
	warn
} from './world-lib.mjs';

const SCOPE = 'characters:compress';
const SOURCE_DIR = path.join(WORLD_DIR, 'source');
const MANIFEST_PATH = path.join(WORLD_DIR, 'characters.json');

const { flags } = parseArgs(process.argv.slice(2));
const force = Boolean(flags.force);
const dryRun = Boolean(flags['dry-run']);
const restoreMode = Boolean(flags.restore);
const only = typeof flags.only === 'string' ? flags.only.toLowerCase() : null;

function human(bytes) {
	if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
	return `${Math.round(bytes / 1024)} KB`;
}

function usage(message) {
	console.error(`${SCOPE}: ${message}`);
	console.error(
		`${SCOPE}: uso: node scripts/characters-compress.mjs [--force] [--dry-run] [--restore] [--only <id|glb>]`
	);
}

function matches(entry) {
	if (!only) return true;
	return entry.id.toLowerCase().includes(only) || entry.glb.toLowerCase().includes(only);
}

function readManifest() {
	if (!fs.existsSync(MANIFEST_PATH)) {
		throw new Error(`falta ${path.relative(process.cwd(), MANIFEST_PATH)}`);
	}

	const manifest = readJson(MANIFEST_PATH);
	const entries = Array.isArray(manifest.characters) ? manifest.characters : [];

	if (entries.length === 0) {
		throw new Error('el manifiesto no contiene personajes');
	}

	return manifest;
}

function scalarAccessorMax(json, bin, accessorIndex) {
	const accessor = json.accessors?.[accessorIndex];
	if (!accessor) return 0;
	if (typeof accessor.max?.[0] === 'number') return accessor.max[0];
	if (accessor.componentType !== 5126 || accessor.type !== 'SCALAR') return 0;

	const view = json.bufferViews?.[accessor.bufferView];
	if (!view) return 0;

	const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
	const stride = view.byteStride ?? 4;
	let max = 0;

	for (let index = 0; index < accessor.count; index += 1) {
		max = Math.max(max, bin.readFloatLE(base + index * stride));
	}

	return max;
}

/** Duración máxima de cada clip, medida sobre el export original. */
function animationDurations(glb) {
	const durations = new Map();

	for (const [index, animation] of (glb.json.animations ?? []).entries()) {
		const name = animation.name ?? `animation_${index}`;
		let duration = 0;

		for (const sampler of animation.samplers ?? []) {
			duration = Math.max(duration, scalarAccessorMax(glb.json, glb.bin, sampler.input));
		}

		durations.set(name, duration);
	}

	return durations;
}

/**
 * `resample` puede eliminar el último keyframe si el final del clip era
 * constante, acortando el loop. Repetimos el último valor en la duración
 * original para que `AnimationAction` siga midiendo lo mismo.
 */
function preserveDurations(document, durations) {
	for (const animation of document.getRoot().listAnimations()) {
		const name = animation.getName();
		const target = name ? durations.get(name) : undefined;
		if (!target) continue;

		for (const sampler of animation.listSamplers()) {
			if (sampler.getInterpolation() === 'CUBICSPLINE') continue;

			const input = sampler.getInput();
			const output = sampler.getOutput();
			if (!input || !output) continue;

			const times = input.getArray();
			const values = output.getArray();
			if (!times?.length || !values?.length) continue;
			if (times[times.length - 1] >= target - 1e-6) continue;

			const elementSize = values.length / times.length;
			if (!Number.isInteger(elementSize) || elementSize <= 0) continue;

			const nextTimes = new Float32Array(times.length + 1);
			nextTimes.set(times);
			nextTimes[times.length] = target;

			const nextValues = new Float32Array(values.length + elementSize);
			nextValues.set(values);
			nextValues.set(values.subarray(values.length - elementSize), values.length);

			const nextInput = document
				.createAccessor()
				.setType(input.getType())
				.setArray(nextTimes)
				.setNormalized(input.getNormalized());
			const nextOutput = document
				.createAccessor()
				.setType(output.getType())
				.setArray(nextValues)
				.setNormalized(output.getNormalized());

			sampler.setInput(nextInput).setOutput(nextOutput);
		}
	}
}

function ensureSource(entry, targetPath, targetGlb) {
	const sourcePath = path.join(SOURCE_DIR, path.basename(entry.glb));
	const targetIsDraco = isDracoGlb(targetGlb);

	if (!fs.existsSync(sourcePath)) {
		if (targetIsDraco) {
			throw new Error(
				`${entry.glb}: el GLB servido ya está comprimido y falta ` +
					`${path.relative(process.cwd(), sourcePath)}. No se puede recuperar el original.`
			);
		}

		fs.mkdirSync(SOURCE_DIR, { recursive: true });
		fs.copyFileSync(targetPath, sourcePath);
		log(
			SCOPE,
			`${entry.glb}: export original guardado en ${path.relative(process.cwd(), sourcePath)}`
		);
	} else {
		const sourceGlb = readGlb(sourcePath);
		if (isDracoGlb(sourceGlb)) {
			throw new Error(
				`${entry.glb}: ${path.relative(process.cwd(), sourcePath)} también está comprimido; ` +
					'no es una fuente válida para recomprimir.'
			);
		}

		if (!targetIsDraco) {
			// Export nuevo (o rollback): la copia sin comprimir es la fuente.
			fs.copyFileSync(targetPath, sourcePath);
			log(
				SCOPE,
				`${entry.glb}: export original actualizado en ${path.relative(process.cwd(), sourcePath)}`
			);
		}
	}

	return {
		sourcePath,
		sourceGlb: readGlb(sourcePath),
		targetIsDraco
	};
}

async function compress(entry, dracoContext, { tolerance }) {
	const targetPath = path.join(STATIC_DIR, entry.glb);
	if (!fs.existsSync(targetPath)) {
		throw new Error(`falta ${path.relative(process.cwd(), targetPath)}`);
	}

	const targetGlb = readGlb(targetPath);

	if (dryRun) {
		log(
			SCOPE,
			`${entry.glb}: ${human(targetGlb.size)} · ${isDracoGlb(targetGlb) ? 'ya usa Draco' : 'pendiente de comprimir'}`
		);
		return { before: targetGlb.size, after: targetGlb.size };
	}

	const { sourcePath, sourceGlb, targetIsDraco } = ensureSource(entry, targetPath, targetGlb);

	if (targetIsDraco && !force) {
		log(
			SCOPE,
			`${entry.glb}: ya está comprimido (${human(targetGlb.size)}); usa --force para recomprimir`
		);
		return { before: sourceGlb.size, after: targetGlb.size };
	}

	const durations = animationDurations(sourceGlb);
	const doc = await dracoContext.io.read(sourcePath);

	// `keepUniqueNames` evita que se fusionen materiales, mallas o skins con
	// nombre propio aunque sus propiedades sean idénticas: los nombres forman
	// parte del contrato de los componentes y de los scripts de verificación.
	await doc.transform(dedup({ keepUniqueNames: true }), prune(), weld(), resample({ tolerance }));
	preserveDurations(doc, durations);
	await doc.transform(prune(), dedup({ keepUniqueNames: true }));

	const draco = doc.createExtension(dracoContext.KHRDracoMeshCompression);
	draco.setRequired(true).setEncoderOptions(dracoContext.encoderOptions);

	// El sufijo debe seguir siendo `.glb`: NodeIO elige el formato por extensión.
	const temporary = `${targetPath.replace(/\.glb$/i, '')}.tmp.glb`;
	await dracoContext.io.write(temporary, doc);
	fs.renameSync(temporary, targetPath);

	const after = fs.statSync(targetPath).size;
	const saved = Math.max(0, 100 - (after / sourceGlb.size) * 100);
	log(
		SCOPE,
		`${entry.glb}: ${human(sourceGlb.size)} → ${human(after)} (−${saved.toFixed(1)} %) con Draco`
	);

	return { before: sourceGlb.size, after };
}

function restore(entry) {
	const targetPath = path.join(STATIC_DIR, entry.glb);
	const sourcePath = path.join(SOURCE_DIR, path.basename(entry.glb));

	if (!fs.existsSync(sourcePath)) {
		throw new Error(`falta ${path.relative(process.cwd(), sourcePath)}`);
	}

	const sourceGlb = readGlb(sourcePath);
	if (isDracoGlb(sourceGlb)) {
		throw new Error(`${entry.glb}: la fuente de world/source/ ya está comprimida`);
	}

	fs.copyFileSync(sourcePath, targetPath);
	log(SCOPE, `${entry.glb}: restaurado desde ${path.relative(process.cwd(), sourcePath)}`);
	return { before: sourceGlb.size, after: sourceGlb.size };
}

async function main() {
	const manifest = readManifest();
	const entries = manifest.characters.filter(matches);

	if (entries.length === 0) {
		usage(`ningún personaje coincide con "${only}"`);
		process.exit(1);
	}

	let dracoContext;
	if (!dryRun && !restoreMode) {
		dracoContext = await createDracoIO();
	}

	const tolerance = manifest.defaults?.resampleTolerance ?? 1e-4;
	let beforeTotal = 0;
	let afterTotal = 0;

	for (const entry of entries) {
		try {
			const result = restoreMode
				? restore(entry)
				: await compress(entry, dracoContext, { tolerance });
			beforeTotal += result.before;
			afterTotal += result.after;
		} catch (error) {
			warn(SCOPE, `${entry.glb}: ${error.message}`);
			process.exit(1);
		}
	}

	const reduction = beforeTotal > 0 ? 100 - (afterTotal / beforeTotal) * 100 : 0;
	log(
		SCOPE,
		`total (${entries.length} archivo${entries.length === 1 ? '' : 's'}): ` +
			`${human(beforeTotal)} → ${human(afterTotal)} (−${reduction.toFixed(1)} %)`
	);
}

await main();
