#!/usr/bin/env node
/**
 * `assets:check` — valida que todos los GLB jugables usen Draco.
 *
 * Fuentes de verdad:
 * - `world/characters.json` (skins y NPCs)
 * - `world/assets.json` (armas, vehículos y props)
 * - `world/maps.json` (escenarios)
 *
 * Comprueba por archivo:
 * - que el GLB servido declare `KHR_draco_mesh_compression` en
 *   `extensionsUsed` y `extensionsRequired`;
 * - que exista el export original en `world/source/` y no esté comprimido;
 * - que se conserven nodos, mallas, materiales y clips (y sus duraciones);
 * - que ningún GLB jugable de `static/` quede fuera del manifiesto;
 * - que todos los `useGltf()` que abren un GLB comprimido pasen `dracoLoader`
 *   con el decodificador local `asset('draco/')`.
 *
 * `--allow-uncompressed` valida el estado de rollback tras
 * `assets:compress --restore`: exige que el GLB servido sea idéntico al
 * original y omite el requisito de Draco.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
	isDracoGlb,
	parseArgs,
	readGlb,
	readJson,
	ROOT,
	STATIC_DIR,
	WORLD_DIR
} from './world-lib.mjs';

const SCOPE = 'assets:check';
const SOURCE_DIR = path.join(WORLD_DIR, 'source');
const CHARACTERS_PATH = path.join(WORLD_DIR, 'characters.json');
const ASSETS_PATH = path.join(WORLD_DIR, 'assets.json');
const MAPS_PATH = path.join(WORLD_DIR, 'maps.json');
const SRC_DIR = path.join(ROOT, 'src');
const DRACO_DIR = path.join(STATIC_DIR, 'draco');
const DURATION_TOLERANCE = 0.05;
const DRACO_DECODER_FILES = ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js'];
const DRACO_EXTENSION = 'KHR_draco_mesh_compression';

const { flags } = parseArgs(process.argv.slice(2));
const allowUncompressed = Boolean(flags['allow-uncompressed']);
const only = typeof flags.only === 'string' ? flags.only.toLowerCase() : null;

const errors = [];
const warnings = [];

function fail(message) {
	errors.push(message);
}

function warn(message) {
	warnings.push(message);
}

function human(bytes) {
	if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
	return `${Math.round(bytes / 1024)} KB`;
}

function matches(entry) {
	if (!only) return true;
	return entry.id.toLowerCase().includes(only) || entry.glb.toLowerCase().includes(only);
}

function readJsonFile(file) {
	if (!fs.existsSync(file)) throw new Error(`falta ${path.relative(ROOT, file)}`);
	return readJson(file);
}

function listEntries() {
	const entries = [];

	for (const character of readJsonFile(CHARACTERS_PATH).characters ?? []) {
		entries.push({ ...character, category: 'characters', pipeline: 'character' });
	}

	for (const asset of readJsonFile(ASSETS_PATH).assets ?? []) {
		entries.push({
			...asset,
			category: asset.category ?? 'assets',
			pipeline: asset.pipeline ?? 'static'
		});
	}

	for (const [id, map] of Object.entries(readJsonFile(MAPS_PATH).maps ?? {})) {
		entries.push({
			id,
			glb: map.glb,
			category: 'maps',
			pipeline: 'map',
			loaders: [`src/lib/components/world/${map.component}.svelte`]
		});
	}

	return entries.filter(matches);
}

/** Máximo de un accessor SCALAR, leyendo `bin` si no hay `max`. */
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

function clipDurations(glb) {
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

function clipNames(glb) {
	return (glb.json.animations ?? []).map(
		(animation, index) => animation.name ?? `animation_${index}`
	);
}

function names(items) {
	return (items ?? []).map((item) => item.name ?? '');
}

function compareExact(label, before, after) {
	if (before.length !== after.length) {
		fail(`${label}: ${before.length} → ${after.length}`);
		return;
	}

	for (let index = 0; index < before.length; index += 1) {
		if (before[index] !== after[index]) {
			fail(`${label}: posición ${index} cambió de "${before[index]}" a "${after[index]}"`);
			return;
		}
	}
}

/**
 * `prune` puede retirar nodos que no cuelgan de la escena. Se exige que todos
 * los nodos del GLB comprimido existan en el original y en el mismo orden
 * relativo, pero se tolera que falten nodos huérfanos.
 */
function compareNamesSubset(label, before, after) {
	let cursor = 0;
	for (const name of after) {
		const found = before.indexOf(name, cursor);
		if (found === -1) {
			fail(`${label}: "${name}" no existe en el original o cambió de orden`);
			return;
		}
		cursor = found + 1;
	}
}

function checkEntry(entry) {
	const targetPath = path.join(STATIC_DIR, entry.glb);

	if (!fs.existsSync(targetPath)) {
		fail(`${entry.glb}: falta el GLB servido`);
		return { before: 0, after: 0 };
	}

	let target;
	try {
		target = readGlb(targetPath);
	} catch (error) {
		fail(`${entry.glb}: ${error.message}`);
		return { before: 0, after: 0 };
	}

	const sourcePath = path.join(SOURCE_DIR, path.basename(entry.glb));
	if (!fs.existsSync(sourcePath)) {
		fail(`${entry.glb}: falta el original en world/source/`);
		return { before: 0, after: target.size };
	}

	let source;
	try {
		source = readGlb(sourcePath);
	} catch (error) {
		fail(`${entry.glb}: fuente inválida: ${error.message}`);
		return { before: 0, after: target.size };
	}

	if (isDracoGlb(source)) {
		fail(`${entry.glb}: el original de world/source/ ya está comprimido con Draco`);
	}

	const targetUsesDraco = isDracoGlb(target);
	const targetRequiresDraco = target.json.extensionsRequired?.includes(DRACO_EXTENSION) ?? false;

	if (allowUncompressed) {
		if (targetUsesDraco) {
			warn(`${entry.glb}: --allow-uncompressed pero el GLB servido sigue comprimido`);
		}
		if (target.size !== source.size || target.sha256 !== source.sha256) {
			fail(`${entry.glb}: en rollback el GLB servido debe ser idéntico al original`);
		}
	} else {
		if (!targetUsesDraco) {
			fail(`${entry.glb}: el GLB servido no declara ${DRACO_EXTENSION}`);
		}
		if (!targetRequiresDraco) {
			fail(`${entry.glb}: el GLB servido no declara ${DRACO_EXTENSION} en extensionsRequired`);
		}
		if (target.sha256 === source.sha256) {
			fail(`${entry.glb}: el GLB servido es idéntico al original; no se comprimió`);
		}
	}

	compareExact(`${entry.glb}: clips`, clipNames(source), clipNames(target));

	const sourceDurations = clipDurations(source);
	const targetDurations = clipDurations(target);
	for (const [name, duration] of sourceDurations) {
		const compressed = targetDurations.get(name);
		if (compressed === undefined) continue;
		if (Math.abs(duration - compressed) > DURATION_TOLERANCE) {
			fail(
				`${entry.glb}: el clip ${name} dura ${duration.toFixed(3)} s y el comprimido ${compressed.toFixed(3)} s`
			);
		}
	}

	compareExact(`${entry.glb}: mallas`, names(source.json.meshes), names(target.json.meshes));
	compareExact(
		`${entry.glb}: materiales`,
		names(source.json.materials),
		names(target.json.materials)
	);

	if (entry.pipeline === 'character' || entry.pipeline === 'map') {
		compareExact(`${entry.glb}: nodos`, names(source.json.nodes), names(target.json.nodes));
	} else {
		compareNamesSubset(`${entry.glb}: nodos`, names(source.json.nodes), names(target.json.nodes));
	}

	if (entry.clips && clipNames(target).length !== entry.clips) {
		fail(
			`${entry.glb}: el manifiesto espera ${entry.clips} clips y hay ${clipNames(target).length}`
		);
	}
	if (entry.nodes && (target.json.nodes?.length ?? 0) !== entry.nodes) {
		fail(
			`${entry.glb}: el manifiesto espera ${entry.nodes} nodos y hay ${target.json.nodes?.length ?? 0}`
		);
	}
	if (entry.meshes && (target.json.meshes?.length ?? 0) !== entry.meshes) {
		fail(
			`${entry.glb}: el manifiesto espera ${entry.meshes} mallas y hay ${target.json.meshes?.length ?? 0}`
		);
	}
	if (entry.materials && names(target.json.materials).length !== entry.materials) {
		fail(
			`${entry.glb}: el manifiesto espera ${entry.materials} materiales y hay ${names(target.json.materials).length}`
		);
	}
	if (entry.bytes && source.size !== entry.bytes) {
		fail(
			`${entry.glb}: el original pesa ${source.size} B y el manifiesto declara ${entry.bytes} B`
		);
	}
	if (entry.sha256 && source.sha256 !== entry.sha256) {
		fail(`${entry.glb}: el SHA-256 del original no coincide con el manifiesto`);
	}

	return { before: source.size, after: target.size };
}

function walkSource(directory, files = []) {
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const file = path.join(directory, entry.name);
		if (entry.isDirectory()) walkSource(file, files);
		else if (/\.(svelte|ts)$/.test(entry.name)) files.push(file);
	}
	return files;
}

/** Extrae el texto de la llamada `useGltf(...)` contando paréntesis. */
function useGltfCall(content, start) {
	let depth = 0;
	for (let index = start; index < content.length; index += 1) {
		const char = content[index];
		if (char === '(') depth += 1;
		else if (char === ')') {
			depth -= 1;
			if (depth === 0) return content.slice(start, index + 1);
		}
	}
	return content.slice(start, start + 600);
}

function checkLoaderFile(loader) {
	const file = path.join(ROOT, loader);
	if (!fs.existsSync(file)) {
		fail(`loader inexistente: ${loader}`);
		return;
	}

	const content = fs.readFileSync(file, 'utf8');
	if (!content.includes("useDraco(asset('draco/'))")) {
		fail(`${loader}: no registra useDraco(asset('draco/'))`);
	}
	if (!content.includes('dracoLoader')) {
		fail(`${loader}: no pasa dracoLoader a useGltf`);
	}
}

function checkLoaders(entries) {
	const loaderFiles = new Set(entries.flatMap((entry) => entry.loaders ?? []));
	for (const loader of loaderFiles) checkLoaderFile(loader);

	const compressedGlbs = new Set(entries.map((entry) => path.basename(entry.glb)));
	const files = walkSource(SRC_DIR);

	for (const file of files) {
		const content = fs.readFileSync(file, 'utf8');
		const relative = path.relative(ROOT, file);
		let index = content.indexOf('useGltf(');

		while (index !== -1) {
			const call = useGltfCall(content, index + 'useGltf'.length);
			const glb = call.match(/['"]([^'"]+\.glb)['"]/i);

			if (glb && compressedGlbs.has(path.basename(glb[1])) && !call.includes('dracoLoader')) {
				fail(`${relative}: useGltf de un asset comprimido sin dracoLoader → ${glb[1]}`);
			}

			index = content.indexOf('useGltf(', index + 1);
		}
	}

	for (const decoder of DRACO_DECODER_FILES) {
		if (!fs.existsSync(path.join(DRACO_DIR, decoder))) {
			fail(`falta static/draco/${decoder}`);
		}
	}
}

function checkCoverage(entries) {
	const manifest = readJsonFile(ASSETS_PATH);
	const excluded = (manifest.exclude ?? []).map((pattern) =>
		pattern.replace(/\*\*?/g, '').replace(/\/$/, '')
	);

	const known = new Set(entries.map((entry) => entry.glb));
	const stack = [STATIC_DIR];

	while (stack.length) {
		const directory = stack.pop();
		for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
			const file = path.join(directory, entry.name);
			const relative = path.relative(STATIC_DIR, file).split(path.sep).join('/');

			if (entry.isDirectory()) {
				if (relative === 'draco' || relative === '_unused') continue;
				stack.push(file);
			} else if (entry.name.toLowerCase().endsWith('.glb') && !known.has(relative)) {
				const skip = excluded.some(
					(pattern) => relative === pattern || relative.startsWith(`${pattern}/`)
				);
				if (!skip) fail(`${relative}: GLB fuera del manifiesto; añádelo a world/assets.json`);
			}
		}
	}
}

function main() {
	const entries = listEntries();

	if (entries.length === 0) {
		console.error(`${SCOPE}: ningún asset coincide con "${only}"`);
		process.exit(1);
	}

	let beforeTotal = 0;
	let afterTotal = 0;
	const byCategory = new Map();

	for (const entry of entries) {
		const result = checkEntry(entry);
		beforeTotal += result.before;
		afterTotal += result.after;

		const group = byCategory.get(entry.category) ?? { before: 0, after: 0, count: 0 };
		group.before += result.before;
		group.after += result.after;
		group.count += 1;
		byCategory.set(entry.category, group);
	}

	checkCoverage(entries);
	checkLoaders(entries);

	for (const message of warnings) console.warn(`[${SCOPE}] aviso: ${message}`);
	for (const message of errors) console.error(`[${SCOPE}] ${message}`);

	for (const [category, group] of byCategory) {
		const reduction = group.before > 0 ? 1 - group.after / group.before : 0;
		console.log(
			`[${SCOPE}] ${category}: ${group.count} archivo${group.count === 1 ? '' : 's'} · ` +
				`${human(group.after)} de ${human(group.before)} (−${(reduction * 100).toFixed(1)} %)`
		);
	}

	const reduction = beforeTotal > 0 ? 1 - afterTotal / beforeTotal : 0;
	const mode = allowUncompressed ? 'rollback (sin Draco)' : 'comprimido';
	console.log(
		`[${SCOPE}] ${entries.length} assets · ${mode} · ` +
			`${human(afterTotal)} de ${human(beforeTotal)}` +
			`${beforeTotal && !allowUncompressed ? ` (−${(reduction * 100).toFixed(1)} %)` : ''}`
	);

	if (errors.length) {
		console.error(`[${SCOPE}] ${errors.length} error${errors.length === 1 ? '' : 'es'}`);
		process.exit(1);
	}

	console.log(`[${SCOPE}] OK`);
}

try {
	main();
} catch (error) {
	console.error(`[${SCOPE}] ${error.message}`);
	process.exit(1);
}
