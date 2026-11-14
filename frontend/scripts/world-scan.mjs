#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
	buildPhysicsConfig,
	loadMaps,
	loadPhysics,
	log,
	parseArgs,
	physicsFile,
	readGlb,
	savePhysics,
	sha256File,
	STATIC_DIR,
	warn
} from './world-lib.mjs';

const { positional, flags } = parseArgs(process.argv.slice(2));
const maps = loadMaps();
const requested = positional[0];

if (!requested) {
	warn('world:scan', 'Uso: bun run world:scan -- <id> [--refresh] [--dry-run]');
	process.exit(1);
}

const ids = flags.all ? Object.keys(maps.maps) : [requested];

for (const id of ids) {
	const entry = maps.maps[id];
	if (!entry) {
		console.error(`[world:scan] No existe el mapa "${id}" en world/maps.json`);
		process.exit(1);
	}

	const glbPath = path.join(STATIC_DIR, entry.glb);
	if (!fs.existsSync(glbPath)) {
		console.error(`[world:scan] Falta ${path.relative(process.cwd(), glbPath)}`);
		process.exit(1);
	}

	const glb = readGlb(glbPath);
	const existingFile = physicsFile(entry);
	const existing = fs.existsSync(existingFile) ? loadPhysics(entry) : null;
	const { config, spawn } = buildPhysicsConfig(entry, glb, existing);

	if (flags.dry || (existing && !flags.refresh)) {
		log('world:scan', `${id}: ${config.stats.nodes} nodos, ${config.stats.meshes} mallas`);
		log(
			'world:scan',
			`${id}: modo ${config.collision.mode}, ${config.stats.colliderNodes} nodos, ${config.stats.colliderTriangles} triángulos, ${config.stats.colliders} colliders`
		);
		log('world:scan', `${id}: readyNode=${config.collision.readyNode ?? 'ninguno'}`);
		if (spawn) log('world:scan', `${id}: spawn sugerido (${spawn.x}, ${spawn.y}, ${spawn.z})`);
		if (config.review.length) {
			log('world:scan', `${id}: ${config.review.length} candidatos en review`);
		}
		if (existing && !flags.refresh) {
			log('world:scan', `${id}: configuración existente conservada; usa --refresh para regenerar`);
		}
		continue;
	}

	if (flags.dry) continue;

	if (existing) {
		const backup = `${existingFile}.bak`;
		fs.copyFileSync(existingFile, backup);
		log('world:scan', `${id}: copia de seguridad en ${path.relative(process.cwd(), backup)}`);
	}

	config.sourceSha256 = sha256File(glbPath);
	savePhysics(entry, config);
	log(
		'world:scan',
		`${id}: escrito ${path.relative(process.cwd(), existingFile)} (${config.stats.colliderNodes} nodos, ${config.stats.colliderTriangles} triángulos, modo ${config.collision.mode})`
	);

	if (config.stats.colliderNodes === 0) {
		warn('world:scan', `${id}: no se detectó ningún collider; revisa excludePatterns o el modelo`);
	}
	if (!config.collision.readyNode) {
		warn('world:scan', `${id}: no se detectó suelo; define collision.readyNode a mano`);
	}
}
