#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
	COMPONENTS_DIR,
	componentFile,
	flattenGroups,
	loadMaps,
	loadPhysics,
	log,
	parseArgs,
	physicsFile,
	readGlb,
	sha256File,
	STATIC_DIR,
	wildcardToRegExp
} from './world-lib.mjs';

function nameIndex(json) {
	const map = new Map();
	for (let index = 0; index < (json.nodes?.length ?? 0); index += 1) {
		const name = json.nodes[index].name;
		if (name && !map.has(name)) map.set(name, index);
	}
	return map;
}

function meshTriangles(json, meshIndex) {
	let triangles = 0;
	for (const primitive of json.meshes?.[meshIndex]?.primitives ?? []) {
		const indices = primitive.indices;
		if (indices !== undefined) {
			triangles += Math.floor((json.accessors?.[indices]?.count ?? 0) / 3);
		} else {
			const position = primitive.attributes?.POSITION;
			triangles += Math.floor((json.accessors?.[position]?.count ?? 0) / 3);
		}
	}
	return triangles;
}

function aggregateTriangles(json, nodeIndex, seen = new Set()) {
	if (seen.has(nodeIndex)) return 0;
	seen.add(nodeIndex);
	const node = json.nodes?.[nodeIndex];
	if (!node) return 0;
	let triangles = node.mesh !== undefined ? meshTriangles(json, node.mesh) : 0;
	for (const child of node.children ?? []) triangles += aggregateTriangles(json, child, seen);
	return triangles;
}

function collectMeshNodes(json, nodeIndex, out, visited = new Set()) {
	if (visited.has(nodeIndex)) return;
	visited.add(nodeIndex);
	const node = json.nodes?.[nodeIndex];
	if (!node) return;
	if (node.mesh !== undefined) {
		out.add(nodeIndex);
		return;
	}
	for (const child of node.children ?? []) collectMeshNodes(json, child, out, visited);
}

function countMatches(source, expression) {
	return [...source.matchAll(expression)].length;
}

function checkMap(id, entry, maps) {
	const errors = [];
	const warnings = [];
	const glbPath = path.join(STATIC_DIR, entry.glb);

	if (!fs.existsSync(glbPath)) {
		return {
			id,
			errors: [`falta ${path.relative(process.cwd(), glbPath)}`],
			warnings,
			stats: null
		};
	}

	const configFile = physicsFile(entry);
	if (!fs.existsSync(configFile)) {
		return {
			id,
			errors: [`falta ${path.relative(process.cwd(), configFile)}`],
			warnings,
			stats: null
		};
	}

	const config = loadPhysics(entry);
	const glb = readGlb(glbPath);
	const source = fs.readFileSync(componentFile(entry), 'utf8').replace(/\r\n/g, '\n');
	const nodesByName = nameIndex(glb.json);
	const groups = flattenGroups(config);
	const exclude = (config.excludePatterns ?? []).map(wildcardToRegExp);
	const seen = new Set();
	const meshNodes = new Set();
	let triangles = 0;

	if (!fs.existsSync(componentFile(entry))) {
		errors.push(`falta ${path.relative(process.cwd(), componentFile(entry))}`);
	}

	if (config.sourceSha256 && config.sourceSha256 !== glb.sha256) {
		errors.push(
			`sha256 distinto: configuración ${config.sourceSha256.slice(0, 12)}…, GLB ${glb.sha256.slice(0, 12)}…; ejecuta world:build`
		);
	}

	if (config.id !== id) errors.push(`config.id "${config.id}" no coincide con "${id}"`);

	if (
		glb.json.extensionsUsed?.includes('KHR_draco_mesh_compression') &&
		!source.includes('useDraco')
	) {
		errors.push(
			'el GLB usa KHR_draco_mesh_compression y el componente no registra useDraco; ejecuta world:build'
		);
	}

	for (const { group, name } of groups) {
		if (seen.has(name)) errors.push(`nodo duplicado en la lista blanca: ${name}`);
		seen.add(name);

		if (!nodesByName.has(name)) {
			errors.push(`nodo inexistente en el GLB: ${name} (${group})`);
			continue;
		}

		if (exclude.some((pattern) => pattern.test(name))) {
			errors.push(`${name} está en la lista blanca y coincide con excludePatterns`);
		}

		const nodeTriangles = aggregateTriangles(glb.json, nodesByName.get(name));
		if (nodeTriangles <= 0) {
			errors.push(`nodo sin geometría: ${name}`);
			continue;
		}
		collectMeshNodes(glb.json, nodesByName.get(name), meshNodes);
	}

	for (const nodeIndex of meshNodes) {
		const node = glb.json.nodes?.[nodeIndex];
		if (node?.mesh !== undefined) triangles += meshTriangles(glb.json, node.mesh);
	}

	const clusters = config.clusters ?? [];
	if (config.collision?.mode === 'merged') {
		if (clusters.length === 0) errors.push('modo merged sin clusters');
		for (const cluster of clusters) {
			for (const name of cluster.names ?? []) {
				if (!nodesByName.has(name))
					errors.push(`clúster ${cluster.name}: nodo inexistente ${name}`);
			}
		}
	}

	const maxTriangles = config.collision?.maxColliderTriangles ?? 60000;
	if (triangles > maxTriangles) {
		errors.push(`${triangles} triángulos de collider superan el límite ${maxTriangles}`);
	}

	const maxColliders = config.collision?.maxColliders ?? 256;
	const colliderCount =
		config.collision?.mode === 'merged'
			? clusters.length
			: new Set(groups.map((item) => item.name)).size;
	if (colliderCount > maxColliders) {
		errors.push(`${colliderCount} colliders superan el límite ${maxColliders}`);
	}

	const readyNode = config.collision?.readyNode;
	if (!readyNode) {
		errors.push('falta collision.readyNode');
	} else {
		const clusterNames = new Set(clusters.map((cluster) => cluster.name));
		if (!nodesByName.has(readyNode) && !clusterNames.has(readyNode)) {
			errors.push(`readyNode inexistente en el GLB o en los clústeres: ${readyNode}`);
		}
	}

	if (config.collision?.mode === 'inject') {
		const autoColliders = countMatches(source, /<AutoColliders\b/g);
		if (autoColliders < colliderCount) {
			errors.push(
				`el componente tiene ${autoColliders} AutoColliders y la lista blanca ${colliderCount}; ejecuta world:build`
			);
		}
		if (!source.includes('worldState')) errors.push('el componente no importa worldState');
		if (!source.includes('markReady')) errors.push('el componente no marca ready');
	}

	if (config.collision?.mode === 'chunked') {
		const autoColliders = countMatches(source, /<AutoColliders\b/g);
		if (autoColliders > 0) {
			errors.push(
				`modo chunked pero el componente tiene ${autoColliders} AutoColliders; ejecuta world:build`
			);
		}
	}

	if (
		config.stats?.colliderTriangles !== undefined &&
		config.stats.colliderTriangles !== triangles
	) {
		warnings.push(
			`stats.colliderTriangles=${config.stats.colliderTriangles} pero el GLB suma ${triangles}`
		);
	}

	return {
		id,
		errors,
		warnings,
		stats: {
			nodes: glb.json.nodes?.length ?? 0,
			meshes: glb.json.meshes?.length ?? 0,
			animations: glb.json.animations?.length ?? 0,
			colliders: colliderCount,
			triangles,
			mode: config.collision?.mode ?? '?'
		}
	};
}

const { positional, flags } = parseArgs(process.argv.slice(2));
const maps = loadMaps();
const ids = flags.all || positional.length === 0 ? Object.keys(maps.maps) : positional;
let failed = false;
const rows = [];

for (const id of ids) {
	const entry = maps.maps[id];
	if (!entry) {
		console.error(`[world:check] No existe el mapa "${id}" en world/maps.json`);
		failed = true;
		continue;
	}
	const result = checkMap(id, entry, maps);
	rows.push(result);
	for (const warning of result.warnings) console.warn(`[world:check] ${id}: aviso: ${warning}`);
	for (const error of result.errors) console.error(`[world:check] ${id}: ERROR: ${error}`);
	if (result.errors.length) failed = true;
}

console.log('');
for (const row of rows) {
	if (!row.stats) continue;
	const stats = row.stats;
	console.log(
		`[world:check] ${row.id}: ${stats.nodes} nodos, ${stats.meshes} mallas, ${stats.animations} animaciones · ${stats.colliders} colliders · ${stats.triangles} triángulos · modo ${stats.mode}`
	);
}

if (failed) {
	console.error('[world:check] FALLÓ');
	process.exit(1);
}

console.log('[world:check] OK');
