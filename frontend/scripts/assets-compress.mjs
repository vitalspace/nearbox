#!/usr/bin/env node
/**
 * `assets:compress` — comprime con Draco todos los GLB jugables de `static/`.
 *
 * Agrupa tres fuentes de verdad:
 * - `world/characters.json`: skins, NPCs y personajes sin runtime.
 * - `world/assets.json`: armas, vehículos y props.
 * - `world/maps.json`: escenarios (`map`, `crypt`, `parkour`, …).
 *
 * Cada export original se guarda en `world/source/<glb>` y el GLB servido se
 * reescribe con `KHR_draco_mesh_compression`. Si un GLB de `static/` llega sin
 * comprimir (un export nuevo o una mejora), se actualiza el backup y se
 * comprime de nuevo. Nunca se comprime dos veces el mismo archivo.
 *
 * Pipelines:
 * - `character`: dedup → prune → weld → resample → conservar duraciones → Draco.
 * - `static`: dedup → prune → Draco (armas, coches y props).
 * - `map`: Draco directo, igual que `world:compress`, para no alterar nodos.
 *
 * Flags:
 *   --force            recompime aunque el GLB servido ya use Draco
 *   --dry-run          no escribe: solo informa del estado
 *   --restore          devuelve los originales de world/source/ a static/
 *   --only <patrón>    limita por id o ruta
 *   --no-maps          excluye los escenarios de world/maps.json
 *   --no-characters    excluye los personajes de world/characters.json
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

const SCOPE = 'assets:compress';
const SOURCE_DIR = path.join(WORLD_DIR, 'source');
const CHARACTERS_PATH = path.join(WORLD_DIR, 'characters.json');
const ASSETS_PATH = path.join(WORLD_DIR, 'assets.json');
const MAPS_PATH = path.join(WORLD_DIR, 'maps.json');

const { flags } = parseArgs(process.argv.slice(2));
const force = Boolean(flags.force);
const dryRun = Boolean(flags['dry-run']);
const restoreMode = Boolean(flags.restore);
const includeMaps = !flags['no-maps'];
const includeCharacters = !flags['no-characters'];
const only = typeof flags.only === 'string' ? flags.only.toLowerCase() : null;

function human(bytes) {
	if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
	return `${Math.round(bytes / 1024)} KB`;
}

function usage(message) {
	console.error(`${SCOPE}: ${message}`);
	console.error(
		`${SCOPE}: uso: node scripts/assets-compress.mjs [--force] [--dry-run] [--restore] ` +
			'[--only <id|glb>] [--no-maps] [--no-characters]'
	);
}

function matches(entry) {
	if (!only) return true;
	return entry.id.toLowerCase().includes(only) || entry.glb.toLowerCase().includes(only);
}

function readJsonFile(file) {
	if (!fs.existsSync(file)) {
		throw new Error(`falta ${path.relative(process.cwd(), file)}`);
	}
	return readJson(file);
}

function listEntries() {
	const entries = [];

	if (includeCharacters) {
		const manifest = readJsonFile(CHARACTERS_PATH);
		for (const character of manifest.characters ?? []) {
			entries.push({
				...character,
				category: character.category ?? 'characters',
				pipeline: 'character'
			});
		}
	}

	const assetsManifest = readJsonFile(ASSETS_PATH);
	for (const asset of assetsManifest.assets ?? []) {
		entries.push({
			...asset,
			category: asset.category ?? 'assets',
			pipeline: asset.pipeline ?? 'static'
		});
	}

	if (includeMaps) {
		const mapsManifest = readJsonFile(MAPS_PATH);
		for (const [id, map] of Object.entries(mapsManifest.maps ?? {})) {
			entries.push({
				id,
				glb: map.glb,
				category: 'maps',
				pipeline: 'map',
				loaders: [`src/lib/components/world/${map.component}.svelte`]
			});
		}
	}

	return entries.filter(matches);
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

/** Devuelve la fuente sin comprimir, actualizándola si `static/` trae un export nuevo. */
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
	const state = isDracoGlb(targetGlb) ? 'ya usa Draco' : 'pendiente de comprimir';

	if (dryRun) {
		log(SCOPE, `${entry.glb}: ${human(targetGlb.size)} · ${state}`);
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

	const doc = await dracoContext.io.read(sourcePath);

	if (entry.pipeline === 'character') {
		const durations = animationDurations(sourceGlb);

		// `keepUniqueNames` evita que se fusionen materiales, mallas o skins con
		// nombre propio aunque sus propiedades sean idénticas: los nombres forman
		// parte del contrato de los componentes y de los scripts de verificación.
		await doc.transform(dedup({ keepUniqueNames: true }), prune(), weld(), resample({ tolerance }));
		preserveDurations(doc, durations);
		await doc.transform(prune(), dedup({ keepUniqueNames: true }));
	} else if (entry.pipeline === 'static') {
		// Armas, coches y props: solo se limpian duplicados y recursos sin uso.
		// No se soldan vértices para no alterar normales/UV de piezas rígidas.
		await doc.transform(dedup({ keepUniqueNames: true }), prune());
	}

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

	if (isDracoGlb(readGlb(sourcePath))) {
		throw new Error(`${entry.glb}: la fuente de world/source/ ya está comprimida`);
	}

	fs.copyFileSync(sourcePath, targetPath);
	log(SCOPE, `${entry.glb}: restaurado desde ${path.relative(process.cwd(), sourcePath)}`);
	const size = fs.statSync(targetPath).size;
	return { before: size, after: size };
}

async function main() {
	const entries = listEntries();

	if (entries.length === 0) {
		usage(`ningún asset coincide con "${only}"`);
		process.exit(1);
	}

	let dracoContext;
	if (!dryRun && !restoreMode) {
		dracoContext = await createDracoIO();
	}

	const tolerance = readJsonFile(ASSETS_PATH).defaults?.resampleTolerance ?? 1e-4;
	let beforeTotal = 0;
	let afterTotal = 0;
	const byCategory = new Map();

	for (const entry of entries) {
		try {
			const result = restoreMode
				? restore(entry)
				: await compress(entry, dracoContext, { tolerance });
			beforeTotal += result.before;
			afterTotal += result.after;

			const group = byCategory.get(entry.category) ?? { before: 0, after: 0, count: 0 };
			group.before += result.before;
			group.after += result.after;
			group.count += 1;
			byCategory.set(entry.category, group);
		} catch (error) {
			warn(SCOPE, `${entry.glb}: ${error.message}`);
			process.exit(1);
		}
	}

	for (const [category, group] of byCategory) {
		const reduction = group.before > 0 ? 100 - (group.after / group.before) * 100 : 0;
		log(
			SCOPE,
			`${category}: ${group.count} archivo${group.count === 1 ? '' : 's'} · ` +
				`${human(group.before)} → ${human(group.after)} (−${reduction.toFixed(1)} %)`
		);
	}

	const reduction = beforeTotal > 0 ? 100 - (afterTotal / beforeTotal) * 100 : 0;
	log(
		SCOPE,
		`total (${entries.length} archivo${entries.length === 1 ? '' : 's'}): ` +
			`${human(beforeTotal)} → ${human(afterTotal)} (−${reduction.toFixed(1)} %)`
	);
}

await main();
