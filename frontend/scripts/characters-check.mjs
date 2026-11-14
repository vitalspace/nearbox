#!/usr/bin/env node
/**
 * `characters:check` — valida los GLB de personajes comprimidos con Draco.
 *
 * Comprueba, sin cargar Three ni el decoder:
 * - que cada GLB del manifiesto existe y declara `KHR_draco_mesh_compression`
 *   en `extensionsUsed` y `extensionsRequired`;
 * - que el export original está en `world/source/<glb>`, no usa Draco y
 *   coincide con el tamaño y SHA-256 registrados en el manifiesto;
 * - que el comprimido conserva nodos, mallas, materiales, clips y duraciones
 *   (tolerancia ±0,05 s);
 * - que todos los loaders de personajes registran `useDraco(asset('draco/'))`;
 * - que el decodificador local está en `static/draco/`;
 * - que se respeta el presupuesto de tamaño y reducción.
 *
 * `--allow-uncompressed` permite validar el estado de rollback tras
 * `characters:compress --restore`: omite las comprobaciones de Draco y de
 * presupuesto, pero sigue validando que la fuente y el GLB servido coinciden.
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

const SCOPE = 'characters:check';
const SOURCE_DIR = path.join(WORLD_DIR, 'source');
const MANIFEST_PATH = path.join(WORLD_DIR, 'characters.json');
const SRC_DIR = path.join(ROOT, 'src');
const DRACO_DIR = path.join(STATIC_DIR, 'draco');
const DURATION_TOLERANCE = 0.05;
const DRACO_DECODER_FILES = ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js'];

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

function readManifest() {
	if (!fs.existsSync(MANIFEST_PATH)) {
		throw new Error(`falta ${path.relative(ROOT, MANIFEST_PATH)}`);
	}

	const manifest = readJson(MANIFEST_PATH);
	const entries = Array.isArray(manifest.characters) ? manifest.characters : [];

	if (entries.length === 0) throw new Error('el manifiesto no contiene personajes');

	return manifest;
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

function nodeNames(glb) {
	return (glb.json.nodes ?? []).map((node) => node.name ?? '');
}

function materialNames(glb) {
	return (glb.json.materials ?? []).map((material) => material.name ?? '');
}

function compareArrays(label, before, after) {
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

function checkEntry(entry) {
	const targetPath = path.join(STATIC_DIR, entry.glb);

	if (!fs.existsSync(targetPath)) {
		fail(`${entry.glb}: falta el GLB servido`);
		return { bytes: 0 };
	}

	let target;
	try {
		target = readGlb(targetPath);
	} catch (error) {
		fail(`${entry.glb}: ${error.message}`);
		return { bytes: 0 };
	}

	const sourcePath = path.join(SOURCE_DIR, path.basename(entry.glb));
	if (!fs.existsSync(sourcePath)) {
		fail(`${entry.glb}: falta el original en world/source/`);
		return { bytes: target.size };
	}

	let source;
	try {
		source = readGlb(sourcePath);
	} catch (error) {
		fail(`${entry.glb}: fuente inválida: ${error.message}`);
		return { bytes: target.size };
	}

	if (isDracoGlb(source)) {
		fail(`${entry.glb}: el original de world/source/ ya está comprimido con Draco`);
	}

	if (entry.bytes && source.size !== entry.bytes) {
		fail(
			`${entry.glb}: el original pesa ${source.size} B y el manifiesto declara ${entry.bytes} B`
		);
	}

	if (entry.sha256 && source.sha256 !== entry.sha256) {
		fail(`${entry.glb}: el SHA-256 del original no coincide con el manifiesto`);
	}

	const targetUsesDraco = isDracoGlb(target);
	const targetRequiresDraco =
		target.json.extensionsRequired?.includes('KHR_draco_mesh_compression') ?? false;

	if (allowUncompressed) {
		if (targetUsesDraco) {
			warn(`${entry.glb}: --allow-uncompressed pero el GLB servido sigue comprimido`);
		}
		if (target.size !== source.size || target.sha256 !== source.sha256) {
			fail(`${entry.glb}: en rollback el GLB servido debe ser idéntico al original`);
		}
	} else {
		if (!targetUsesDraco) {
			fail(`${entry.glb}: el GLB servido no declara KHR_draco_mesh_compression`);
		}
		if (!targetRequiresDraco) {
			fail(
				`${entry.glb}: el GLB servido no declara KHR_draco_mesh_compression en extensionsRequired`
			);
		}
	}

	compareArrays(`${entry.glb}: clips`, clipNames(source), clipNames(target));

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

	compareArrays(`${entry.glb}: nodos`, nodeNames(source), nodeNames(target));
	compareArrays(`${entry.glb}: materiales`, materialNames(source), materialNames(target));

	const sourceMeshes = source.json.meshes?.length ?? 0;
	const targetMeshes = target.json.meshes?.length ?? 0;
	if (sourceMeshes !== targetMeshes) {
		fail(`${entry.glb}: mallas ${sourceMeshes} → ${targetMeshes}`);
	}

	if (entry.clips && clipNames(target).length !== entry.clips) {
		fail(
			`${entry.glb}: el manifiesto espera ${entry.clips} clips y hay ${clipNames(target).length}`
		);
	}
	if (entry.nodes && nodeNames(target).length !== entry.nodes) {
		fail(
			`${entry.glb}: el manifiesto espera ${entry.nodes} nodos y hay ${nodeNames(target).length}`
		);
	}
	if (entry.meshes && targetMeshes !== entry.meshes) {
		fail(`${entry.glb}: el manifiesto espera ${entry.meshes} mallas y hay ${targetMeshes}`);
	}
	if (entry.materials && materialNames(target).length !== entry.materials) {
		fail(
			`${entry.glb}: el manifiesto espera ${entry.materials} materiales y hay ${materialNames(target).length}`
		);
	}

	return { bytes: target.size };
}

function checkLoaders(entries) {
	const loaders = new Set(entries.flatMap((entry) => entry.loaders ?? []));

	for (const loader of loaders) {
		const file = path.join(ROOT, loader);
		if (!fs.existsSync(file)) {
			fail(`loader inexistente: ${loader}`);
			continue;
		}

		const content = fs.readFileSync(file, 'utf8');
		if (!content.includes("useDraco(asset('draco/'))")) {
			fail(`${loader}: no registra useDraco(asset('draco/'))`);
		}
		if (!content.includes('dracoLoader')) {
			fail(`${loader}: no pasa dracoLoader a useGltf`);
		}
	}

	for (const decoder of DRACO_DECODER_FILES) {
		if (!fs.existsSync(path.join(DRACO_DIR, decoder))) {
			fail(`falta static/draco/${decoder}`);
		}
	}
}

function scanLiteralLoaders(characterGlbs) {
	const files = [];
	const stack = [SRC_DIR];

	while (stack.length) {
		const directory = stack.pop();
		for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
			const file = path.join(directory, entry.name);
			if (entry.isDirectory()) stack.push(file);
			else if (/\.(svelte|ts)$/.test(entry.name)) files.push(file);
		}
	}

	for (const file of files) {
		const content = fs.readFileSync(file, 'utf8');
		const relative = path.relative(ROOT, file);
		let index = content.indexOf('useGltf(');

		while (index !== -1) {
			const end = content.indexOf(';', index);
			const call = content.slice(index, end === -1 ? index + 400 : end + 1);
			const glb = call.match(/['"]([^'"]+\.glb)['"]/i);

			if (glb && characterGlbs.has(path.basename(glb[1])) && !call.includes('dracoLoader')) {
				fail(`${relative}: useGltf de un personaje sin dracoLoader → ${glb[1]}`);
			}

			index = content.indexOf('useGltf(', index + 1);
		}
	}
}

function main() {
	const manifest = readManifest();
	const entries = manifest.characters.filter(matches);

	if (entries.length === 0) {
		console.error(`${SCOPE}: ningún personaje coincide con "${only}"`);
		process.exit(1);
	}

	let totalBytes = 0;
	let originalBytes = 0;
	let largest = null;

	for (const entry of entries) {
		const result = checkEntry(entry);
		totalBytes += result.bytes;
		originalBytes += entry.bytes ?? 0;
		if (!largest || result.bytes > largest.bytes) {
			largest = { glb: entry.glb, bytes: result.bytes };
		}
	}

	checkLoaders(entries);
	scanLiteralLoaders(new Set(manifest.characters.map((entry) => path.basename(entry.glb))));

	const defaults = manifest.defaults ?? {};
	const maxTotalBytes = defaults.maxTotalBytes ?? 10 * 1024 * 1024;
	const maxFileBytes = defaults.maxFileBytes ?? 0.55 * 1024 * 1024;
	const minReduction = defaults.minReduction ?? 0.65;

	const reduction = originalBytes > 0 ? 1 - totalBytes / originalBytes : 0;

	if (!allowUncompressed) {
		if (totalBytes > maxTotalBytes) {
			fail(`total comprimido ${human(totalBytes)} supera ${human(maxTotalBytes)}`);
		}
		if (largest && largest.bytes > maxFileBytes) {
			fail(`${largest.glb} pesa ${human(largest.bytes)} y supera ${human(maxFileBytes)}`);
		}
		if (reduction < minReduction) {
			fail(
				`reducción ${(reduction * 100).toFixed(1)} % por debajo del ${(minReduction * 100).toFixed(0)} %`
			);
		}
	}

	for (const message of warnings) console.warn(`[${SCOPE}] aviso: ${message}`);

	for (const message of errors) console.error(`[${SCOPE}] ${message}`);

	const mode = allowUncompressed ? 'rollback (sin Draco)' : 'comprimido';
	console.log(
		`[${SCOPE}] ${entries.length} personajes · ${mode} · ` +
			`${human(totalBytes)}${originalBytes ? ` de ${human(originalBytes)}` : ''}` +
			`${originalBytes && !allowUncompressed ? ` (−${(reduction * 100).toFixed(1)} %)` : ''}`
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
