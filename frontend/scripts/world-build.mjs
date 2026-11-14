#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
	buildPhysicsConfig,
	componentFile,
	COMPONENTS_DIR,
	loadMaps,
	loadPhysics,
	log,
	parseArgs,
	physicsFile,
	readGlb,
	run,
	savePhysics,
	STATIC_DIR,
	ROOT
} from './world-lib.mjs';
import { injectComponent } from './world-inject.mjs';
import { externalizeMap } from './world-externalize.mjs';
import { syncRegistry } from './world-sync.mjs';

const DRACO_DECODER = 'https://www.gstatic.com/draco/versioned/decoders/1.4.3/';

function gltfBinary() {
	const local = path.join(ROOT, 'node_modules/.bin/gltf');
	if (fs.existsSync(local)) return { command: local, args: [] };
	return { command: 'npx', args: ['--yes', '@threlte/gltf@3.1.0'] };
}

function prettierBinary() {
	const local = path.join(ROOT, 'node_modules/.bin/prettier');
	if (fs.existsSync(local)) return { command: local, args: [] };
	return { command: 'npx', args: ['--yes', 'prettier'] };
}

/**
 * El CLI de @threlte/gltf genera referencias `gltf.nodes.NOMBRE` a partir de
 * los nombres del GLB. Si dos nodos comparten malla (o un nodo tiene varios
 * primitivos con nombres repetidos), puede emitir una referencia que no existe
 * en runtime (`undefined.geometry`). Detectarlo aquí evita publicar un mapa que
 * explota al entrar.
 */
function validateComponentRefs(file, json) {
	const expected = new Set();
	const add = (name) => {
		if (!name) return;
		expected.add(name);
		expected.add(name.replace(/\./g, ''));
	};

	for (const node of json.nodes ?? []) {
		add(node.name);
		const mesh = node.mesh === undefined ? null : json.meshes?.[node.mesh];
		if (!mesh) continue;
		add(mesh.name);
		const primitives = mesh.primitives?.length ?? 0;
		if (primitives <= 1) continue;
		for (let index = 1; index <= primitives; index += 1) {
			add(`${node.name}_${index}`);
			add(`${mesh.name}_${index}`);
		}
	}

	const source = fs.readFileSync(file, 'utf8');
	const refs = new Set(
		[...source.matchAll(/gltf\.nodes\.([A-Za-z0-9_]+)/g)].map((match) => match[1])
	);
	const missing = [...refs].filter((name) => !expected.has(name));

	if (missing.length > 0) {
		throw new Error(
			`${path.basename(file)} referencia nodos inexistentes en el GLB: ${missing.join(', ')}. ` +
				'Revisa nombres de nodos/mallas duplicados en el GLB (dos nodos no deben compartir malla con el mismo nombre).'
		);
	}
}

export async function buildMap(id, entry) {
	const glbPath = path.join(STATIC_DIR, entry.glb);
	if (!fs.existsSync(glbPath)) {
		throw new Error(`Falta ${path.relative(ROOT, glbPath)}`);
	}

	const configFile = physicsFile(entry);
	const output = componentFile(entry);
	const manualPhysics = Boolean(entry.manualPhysics);
	const manualComponent = Boolean(entry.manualComponent);

	if (manualPhysics && !fs.existsSync(configFile)) {
		throw new Error(
			`${id}: manualPhysics está activo pero falta ${path.relative(ROOT, configFile)}; créala a mano`
		);
	}
	if (manualComponent && !fs.existsSync(output)) {
		throw new Error(
			`${id}: manualComponent está activo pero falta ${path.relative(ROOT, output)}; créalo a mano`
		);
	}

	let config = fs.existsSync(configFile) ? loadPhysics(entry) : null;
	if (!config) {
		const glb = readGlb(glbPath);
		const generated = buildPhysicsConfig(entry, glb, null);
		config = generated.config;
		savePhysics(entry, config);
		log('world:build', `${id}: configuración de física generada automáticamente`);
	}

	const glb = readGlb(glbPath);
	if (config.sourceSha256 && config.sourceSha256 !== glb.sha256) {
		if (manualPhysics) {
			throw new Error(
				`${id}: el GLB cambió y la física es manual; vuelve a medir ${path.relative(ROOT, configFile)}`
			);
		}
		log('world:build', `${id}: el GLB cambió; se actualiza el hash`);
	}

	if (manualComponent) {
		// El componente y la física manuales son la fuente de verdad: el pipeline
		// no debe regenerarlos ni reescribir el hash.
		log(
			'world:build',
			`${id}: componente manual conservado (${path.relative(ROOT, output)}); física ${
				manualPhysics ? 'manual conservada' : 'actualizada'
			}`
		);
		if (!manualPhysics) {
			config.sourceSha256 = glb.sha256;
			savePhysics(entry, config);
		}
		return;
	}

	fs.mkdirSync(COMPONENTS_DIR, { recursive: true });
	const binary = gltfBinary();
	const args = [...binary.args, entry.glb, '-K', '-k', '-o', path.relative(STATIC_DIR, output)];

	if (glb.json.extensionsUsed?.includes('KHR_draco_mesh_compression')) {
		args.push('-d', DRACO_DECODER);
	}

	log('world:build', `${id}: generando ${path.relative(ROOT, output)}`);
	run(binary.command, args, { cwd: STATIC_DIR });

	validateComponentRefs(output, glb.json);
	injectComponent(output, config);
	await externalizeMap(id, entry);

	if (!manualPhysics) {
		config.sourceSha256 = glb.sha256;
		savePhysics(entry, config);
	}

	const prettier = prettierBinary();
	run(prettier.command, [...prettier.args, '--write', output]);

	log(
		'world:build',
		`${id}: componente listo (${config.collision.mode}, ${config.stats?.colliderNodes ?? '?'} nodos, ${config.stats?.colliderTriangles ?? '?'} triángulos)`
	);
}

async function main() {
	const { positional, flags } = parseArgs(process.argv.slice(2));
	const maps = loadMaps();
	const ids = flags.all || positional.length === 0 ? Object.keys(maps.maps) : positional;

	for (const id of ids) {
		const entry = maps.maps[id];
		if (!entry) {
			console.error(`[world:build] No existe el mapa "${id}" en world/maps.json`);
			process.exit(1);
		}
		await buildMap(id, entry);
	}

	syncRegistry(maps);
	log('world:build', `registro actualizado con ${ids.length} mapa(s)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((error) => {
		console.error(`[world:build] ${error.message}`);
		process.exit(1);
	});
}
