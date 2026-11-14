#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
	buildPhysicsConfig,
	loadMaps,
	log,
	parseArgs,
	physicsFile,
	readGlb,
	saveMaps,
	savePhysics,
	STATIC_DIR,
	toId,
	toPascal,
	warn
} from './world-lib.mjs';
import { buildMap } from './world-build.mjs';
import { syncRegistry } from './world-sync.mjs';

function defaultEntry(id) {
	return {
		id,
		glb: `maps/${id}.glb`,
		component: toPascal(id),
		physics: `${id}.physics.json`,
		spawn: null,
		transform: {
			position: [0, 0, 0],
			rotation: [0, 0, 0],
			scale: [1, 1, 1]
		},
		lighting: 'global',
		scene: 'global'
	};
}

function copyIntoStatic(source, destination, move) {
	const sourcePath = path.resolve(source);
	const destinationPath = path.resolve(destination);
	if (sourcePath === destinationPath) return destinationPath;

	fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
	fs.copyFileSync(sourcePath, destinationPath);
	if (move) {
		fs.unlinkSync(sourcePath);
		log(
			'world:add',
			`moved ${path.relative(process.cwd(), sourcePath)} → ${path.relative(process.cwd(), destinationPath)}`
		);
	} else {
		log(
			'world:add',
			`copied ${path.relative(process.cwd(), sourcePath)} → ${path.relative(process.cwd(), destinationPath)}`
		);
	}
	return destinationPath;
}

async function main() {
	const { positional, flags } = parseArgs(process.argv.slice(2));
	const input = positional[0];

	if (!input) {
		warn(
			'world:add',
			'Usage: bun run world:add -- <path/to/model.glb> [--id <id>] [--move] [--refresh] [--no-build]'
		);
		process.exit(1);
	}

	const source = path.resolve(process.cwd(), input);
	if (!fs.existsSync(source)) {
		console.error(`[world:add] ${source} does not exist`);
		process.exit(1);
	}

	let glb;
	try {
		glb = readGlb(source);
	} catch (error) {
		console.error(`[world:add] ${error.message}`);
		process.exit(1);
	}

	const maps = loadMaps();
	const id = toId(flags.id ?? path.basename(source, path.extname(source)));
	let entry = maps.maps[id];

	if (!entry) {
		entry = defaultEntry(id);
		maps.maps[id] = entry;
		saveMaps(maps);
		log('world:add', `registered "${id}" in world/maps.json`);
	} else {
		log('world:add', `"${id}" already exists; updating`);
	}

	const destination = path.join(STATIC_DIR, entry.glb);
	const resolved = copyIntoStatic(source, destination, Boolean(flags.move));
	glb = readGlb(resolved);

	const configFile = physicsFile(entry);
	const existing = fs.existsSync(configFile)
		? JSON.parse(fs.readFileSync(configFile, 'utf8'))
		: null;

	if (!existing || flags.refresh) {
		const { config, spawn } = buildPhysicsConfig(entry, glb, existing);
		config.sourceSha256 = glb.sha256;

		if (!config.collision.readyNode || config.stats.colliderNodes === 0) {
			config.collision.mode = 'none';
			warn(
				'world:add',
				`${id}: no ground/physics objects detected; only the visual will be generated. Check ${path.relative(process.cwd(), configFile)}`
			);
		}

		savePhysics(entry, config);
		log(
			'world:add',
			`${id}: physics ${config.collision.mode}, ${config.stats.colliderNodes} nodes, ${config.stats.colliderTriangles} triangles, ${config.stats.colliders} colliders`
		);

		if (spawn && (!entry.spawn || flags.refresh || flags['reset-spawn'])) {
			entry.spawn = spawn;
			saveMaps(maps);
			log('world:add', `${id}: spawn (${spawn.x}, ${spawn.y}, ${spawn.z})`);
		}
	} else {
		log('world:add', `${id}: existing physics kept (${path.relative(process.cwd(), configFile)})`);
	}

	if (!flags['no-build']) {
		await buildMap(id, entry);
		syncRegistry(maps);
	}

	console.log('');
	log('world:add', `done: ${id}`);
	log('world:add', `open: http://localhost:5173/?physics=1&map=${id}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((error) => {
		console.error(`[world:add] ${error.message}`);
		process.exit(1);
	});
}
