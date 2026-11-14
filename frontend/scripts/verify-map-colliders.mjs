import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GLB_PATH = process.argv[2] ?? path.join(ROOT, 'static/maps/map.glb');
const CONFIG_PATH =
	process.argv[3] ?? path.join(ROOT, 'src/lib/components/world/map-colliders.json');

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a; // 'JSON'

function fail(message) {
	console.error(`[map:check] ${message}`);
	process.exit(1);
}

function readGlbJson(file) {
	const buffer = fs.readFileSync(file);

	if (buffer.length < 12 || buffer.readUInt32LE(0) !== GLB_MAGIC) {
		fail(`${file} no es un GLB válido`);
	}

	let offset = 12;
	while (offset + 8 <= buffer.length) {
		const length = buffer.readUInt32LE(offset);
		const type = buffer.readUInt32LE(offset + 4);
		offset += 8;

		const chunk = buffer.subarray(offset, offset + length);
		offset += length;

		if (type === CHUNK_JSON) {
			return JSON.parse(chunk.toString('utf8'));
		}
	}

	fail(`${file} no contiene el chunk JSON`);
}

function wildcardToRegExp(pattern) {
	const escaped = pattern
		.split('*')
		.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
		.join('.*');
	return new RegExp(`^${escaped}$`);
}

const json = readGlbJson(GLB_PATH);
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

if (!json.nodes || !json.meshes) {
	fail('El GLB no tiene nodos o mallas');
}

const nodes = json.nodes;
const meshes = json.meshes;
const accessors = json.accessors ?? [];

const nodeIndexByName = new Map();
for (let index = 0; index < nodes.length; index += 1) {
	const name = nodes[index].name;
	if (!name) continue;
	if (!nodeIndexByName.has(name)) {
		nodeIndexByName.set(name, index);
	}
}

function meshTriangles(meshIndex) {
	const mesh = meshes[meshIndex];
	if (!mesh) return 0;

	let triangles = 0;
	for (const primitive of mesh.primitives ?? []) {
		const indices = primitive.indices;
		if (indices !== undefined) {
			triangles += Math.floor((accessors[indices]?.count ?? 0) / 3);
		} else {
			const position = primitive.attributes?.POSITION;
			triangles += Math.floor((accessors[position]?.count ?? 0) / 3);
		}
	}
	return triangles;
}

function nodeTriangles(nodeIndex, seen = new Set()) {
	if (seen.has(nodeIndex)) return 0;
	seen.add(nodeIndex);

	const node = nodes[nodeIndex];
	if (!node) return 0;

	let triangles = node.mesh !== undefined ? meshTriangles(node.mesh) : 0;
	for (const child of node.children ?? []) {
		triangles += nodeTriangles(child, seen);
	}
	return triangles;
}

let totalMapTriangles = 0;
for (let index = 0; index < nodes.length; index += 1) {
	if (nodes[index].mesh !== undefined) {
		totalMapTriangles += meshTriangles(nodes[index].mesh);
	}
}

const groups = config.groups ?? {};
const maxColliderTriangles = config.maxColliderTriangles ?? 60000;
const excludePatterns = (config.excludePatterns ?? []).map(wildcardToRegExp);

const whitelist = [];
const duplicateNames = new Set();
for (const [group, names] of Object.entries(groups)) {
	for (const name of names) {
		if (whitelist.some((entry) => entry.name === name)) {
			duplicateNames.add(name);
		}
		whitelist.push({ group, name });
	}
}

const errors = [];

if (duplicateNames.size > 0) {
	errors.push(`Nombres duplicados en la lista blanca: ${[...duplicateNames].join(', ')}`);
}

let colliderTriangles = 0;
const missing = [];
const groupsReport = new Map();

for (const { group, name } of whitelist) {
	const nodeIndex = nodeIndexByName.get(name);
	if (nodeIndex === undefined) {
		missing.push(name);
		continue;
	}

	if (excludePatterns.some((pattern) => pattern.test(name))) {
		errors.push(`${name} está en la lista blanca y también coincide con la lista negra`);
	}

	const triangles = nodeTriangles(nodeIndex);
	if (triangles <= 0) {
		missing.push(name);
		continue;
	}

	colliderTriangles += triangles;
	const current = groupsReport.get(group) ?? { nodes: 0, triangles: 0 };
	current.nodes += 1;
	current.triangles += triangles;
	groupsReport.set(group, current);
}

if (missing.length > 0) {
	errors.push(`Nodos de la lista blanca sin geometría: ${missing.join(', ')}`);
}

if (colliderTriangles > maxColliderTriangles) {
	errors.push(
		`Los colliders suman ${colliderTriangles} triángulos y el límite es ${maxColliderTriangles}`
	);
}

let excludedMatched = 0;
for (const [name] of nodeIndexByName) {
	if (whitelist.some((entry) => entry.name === name)) continue;
	if (excludePatterns.some((pattern) => pattern.test(name))) {
		excludedMatched += 1;
	}
}

const usedNames = new Set(whitelist.map((entry) => entry.name));
const duplicateNodeNames = [...nodeIndexByName.keys()].filter(
	(name) => nodes.filter((node) => node.name === name).length > 1
);

console.log(`[map:check] GLB: ${path.relative(ROOT, GLB_PATH)}`);
console.log(`[map:check] Nodos: ${nodes.length} · mallas: ${meshes.length}`);
console.log(`[map:check] Triángulos del mapa: ${totalMapTriangles}`);
console.log(`[map:check] Nodos con collider: ${usedNames.size}`);
for (const [group, report] of groupsReport) {
	console.log(`[map:check]   ${group}: ${report.nodes} nodos, ${report.triangles} triángulos`);
}
console.log(`[map:check] Triángulos de collider: ${colliderTriangles} / ${maxColliderTriangles}`);
console.log(`[map:check] Nodos excluidos detectados: ${excludedMatched}`);

if (duplicateNodeNames.length > 0) {
	console.warn(
		`[map:check] Aviso: el GLB tiene nombres repetidos (${duplicateNodeNames
			.slice(0, 8)
			.join(', ')}${duplicateNodeNames.length > 8 ? ', …' : ''}); la lista blanca usa el primero`
	);
}

if (errors.length > 0) {
	for (const error of errors) {
		console.error(`[map:check] ERROR: ${error}`);
	}
	process.exit(1);
}

console.log('[map:check] OK');
