#!/usr/bin/env node
/**
 * `world:compress <id>` — comprime geometría con `KHR_draco_mesh_compression`.
 *
 * El GLB servido desde `static/` se reescribe comprimido, pero el export
 * original se conserva en `world/source/<glb>` porque Draco es lossy y porque
 * los verificadores que leen POSITION (p. ej. `race:check`) no pueden leer los
 * accessors comprimidos.
 *
 * Reglas de sincronización:
 * - si `static/<glb>` NO está comprimido, se considera un export nuevo y se
 *   copia a `world/source/<glb>` antes de comprimirlo;
 * - si ya está comprimido, se re-comprime desde `world/source/<glb>`;
 * - sin los dos archivos no hay forma de recuperar el original: se aborta.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
	createDracoIO,
	isDracoGlb,
	loadMaps,
	log,
	parseArgs,
	readGlb,
	STATIC_DIR,
	WORLD_DIR,
	warn
} from './world-lib.mjs';

const SOURCE_DIR = path.join(WORLD_DIR, 'source');
const SCOPE = 'world:compress';

const { positional, flags } = parseArgs(process.argv.slice(2));
const ids = positional.length ? positional : ['map'];
const maps = loadMaps();
const force = Boolean(flags.force);

const isDraco = isDracoGlb;

function human(bytes) {
	if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
	return `${Math.round(bytes / 1024)} KB`;
}

function usage(message) {
	console.error(`${SCOPE}: ${message}`);
	console.error(
		`${SCOPE}: uso: node scripts/world-compress.mjs <id> [--force]\n` +
			`${SCOPE}: el export sin comprimir se guarda en world/source/<glb>`
	);
}

async function compress(id, entry, dracoContext) {
	const target = path.join(STATIC_DIR, entry.glb);
	const source = path.join(SOURCE_DIR, path.basename(entry.glb));

	if (!fs.existsSync(target)) throw new Error(`falta ${path.relative(process.cwd(), target)}`);

	const targetGlb = readGlb(target);
	const alreadyDraco = isDraco(targetGlb);

	if (!alreadyDraco) {
		// Export nuevo: el archivo de static es la fuente de verdad.
		fs.mkdirSync(SOURCE_DIR, { recursive: true });
		fs.copyFileSync(target, source);
		log(SCOPE, `${id}: export original guardado en ${path.relative(process.cwd(), source)}`);
	} else if (!fs.existsSync(source)) {
		throw new Error(
			`${id}: ${path.relative(process.cwd(), target)} ya está comprimido y no existe ` +
				`${path.relative(process.cwd(), source)}. Restaura el GLB sin comprimir para continuar.`
		);
	} else if (!force) {
		log(
			SCOPE,
			`${id}: ya está comprimido (${human(targetGlb.size)}); usa --force para recomprimir`
		);
		return;
	}

	const sourceGlb = readGlb(source);
	if (isDraco(sourceGlb)) {
		throw new Error(
			`${id}: ${path.relative(process.cwd(), source)} también está comprimido; ` +
				'no es una fuente válida para recomprimir.'
		);
	}

	const { io, KHRDracoMeshCompression, encoderOptions } = dracoContext;
	const doc = await io.read(source);
	const draco = doc.createExtension(KHRDracoMeshCompression);
	draco.setRequired(true).setEncoderOptions(encoderOptions);

	// El sufijo debe seguir siendo `.glb`: NodeIO elige el formato por extensión.
	const temporary = `${target.replace(/\.glb$/i, '')}.tmp.glb`;
	await io.write(temporary, doc);
	fs.renameSync(temporary, target);

	const before = sourceGlb.size;
	const after = fs.statSync(target).size;
	const saved = Math.max(0, 100 - (after / before) * 100);

	log(SCOPE, `${id}: ${human(before)} → ${human(after)} (−${saved.toFixed(1)} %) con Draco`);
	log(SCOPE, `${id}: recuerda regenerar el componente (world:build ${id})`);
}

async function main() {
	const dracoContext = await createDracoIO();

	for (const id of ids) {
		const entry = maps.maps[id];
		if (!entry) {
			usage(`no existe el mapa "${id}" en world/maps.json`);
			process.exit(1);
		}
		try {
			await compress(id, entry, dracoContext);
		} catch (error) {
			warn(SCOPE, `${id}: ${error.message}`);
			process.exit(1);
		}
	}
}

await main();
