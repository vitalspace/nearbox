import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const STATIC_DIR = path.join(ROOT, 'static');
export const WORLD_DIR = path.join(ROOT, 'world');
export const COMPONENTS_DIR = path.join(ROOT, 'src/lib/components/world');
export const LIB_WORLD_DIR = path.join(ROOT, 'src/lib/world');
export const MAPS_PATH = path.join(WORLD_DIR, 'maps.json');
export const REGISTRY_PATH = path.join(LIB_WORLD_DIR, 'registry.generated.ts');

export const GLB_MAGIC = 0x46546c67;
export const CHUNK_JSON = 0x4e4f534a;
export const CHUNK_BIN = 0x004e4942;

/**
 * Cuantización compartida por los GLB comprimidos con Draco (mapas y ahora
 * personajes). Se mantiene en un único sitio para que ambos pipelines no se
 * desincronicen.
 */
export const DRACO_QUANTIZATION_BITS = {
	POSITION: 14,
	NORMAL: 10,
	TEXCOORD_0: 12,
	TEXCOORD_1: 12,
	COLOR_0: 8,
	WEIGHTS_0: 12,
	JOINTS_0: 12,
	GENERIC: 12
};

/** `glb` es el resultado de `readGlb()`; no hace falta decodificar la malla. */
export function isDracoGlb(glb) {
	return glb?.json?.extensionsUsed?.includes('KHR_draco_mesh_compression') ?? false;
}

/**
 * Crea el `NodeIO` de glTF-Transform con el encoder y el decoder de Draco.
 * Las importaciones son dinámicas para que los verificadores que solo leen el
 * JSON del GLB no carguen WASM ni el encoder.
 */
export async function createDracoIO() {
	const [{ NodeIO }, { ALL_EXTENSIONS, KHRDracoMeshCompression }, draco3dModule] =
		await Promise.all([
			import('@gltf-transform/core'),
			import('@gltf-transform/extensions'),
			import('draco3dgltf')
		]);
	const draco3d = draco3dModule.default ?? draco3dModule;
	const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
		'draco3d.encoder': await draco3d.createEncoderModule(),
		'draco3d.decoder': await draco3d.createDecoderModule()
	});

	return {
		io,
		KHRDracoMeshCompression,
		encoderOptions: {
			method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER,
			quantizationBits: { ...DRACO_QUANTIZATION_BITS }
		}
	};
}

export const CATEGORY_RANK = {
	suelo: 0,
	paredes: 1,
	muebles: 2,
	obstaculos: 3
};

export const DEFAULT_EXCLUDE_PATTERNS = [
	'*bat*',
	'*murci*',
	'*web*',
	'*telar*',
	'*sign*',
	'*cartel*',
	'*text*',
	'*window*',
	'*ventana*',
	'*win_*',
	'*_win*',
	'*glass*',
	'*crystal*',
	'*path*',
	'*camino*',
	'*field*',
	'*campo*',
	'*yard*',
	'*patio*',
	'*pumpkin*',
	'*calabaza*',
	'*mushroom*',
	'*hongo*',
	'*leaf*',
	'*leaves*',
	'*hoja*',
	'*grass*',
	'*hierba*',
	'*flower*',
	'*flor*',
	'*lamp*',
	'*light*',
	'*flame*',
	'*glow*',
	'*candle*',
	'*vela*',
	'*candelabra*',
	'*chandelier*',
	'*candelabro*',
	'*candelier*',
	'*rug*',
	'*alfombra*',
	'*cat*',
	'*mirror*',
	'*espejo*',
	'*portrait*',
	'*retrato*',
	'*clock*',
	'*reloj*',
	'*circle_star*',
	'*fx*',
	'*vfx*',
	'*particle*',
	'*smoke*',
	'*cloud*',
	'*sky*',
	'*water*',
	'*river*',
	'*blood*',
	'*decal*',
	'*poster*',
	'*picture*',
	'*painting*',
	'*cuadro*',
	'*curtain*',
	'*cloth*',
	'*rope*',
	'*cable*',
	'*wire*',
	'*trigger*',
	'*collider*',
	'*nav*',
	'*spawn*',
	'*volume*',
	'*zone*',
	'*hitbox*',
	'*book*',
	'*libro*',
	'*skull*',
	'*craneo*',
	'*bone*',
	'*hueso*',
	'*skeleton*',
	'*ghost*',
	'*fantasma*',
	'*character*',
	'*npc*',
	'*monster*',
	'*mummy*',
	'*mommy*'
];

const CATEGORY_WORDS = {
	suelo: [
		'floor',
		'ground',
		'terrain',
		'suelo',
		'piso',
		'platform',
		'plataforma',
		'street',
		'calle',
		'road',
		'base_floor'
	],
	paredes: [
		'wall',
		'pared',
		'fence',
		'valla',
		'gate',
		'puerta',
		'door',
		'roof',
		'techo',
		'house',
		'casa',
		'tower',
		'torre',
		'castle',
		'castillo',
		'chapel',
		'capilla',
		'barn',
		'granero',
		'silo',
		'stair',
		'stairs',
		'escalera',
		'step',
		'peldaño',
		'column',
		'columna',
		'pillar',
		'pilar',
		'railing',
		'baranda',
		'balcony',
		'balcon',
		'bridge',
		'puente',
		'building',
		'edificio',
		'chimney',
		'rafter',
		'barge',
		'rail',
		'beam',
		'joist',
		'truss'
	],
	muebles: [
		'table',
		'mesa',
		'chair',
		'silla',
		'desk',
		'escritorio',
		'bed',
		'cama',
		'shelf',
		'estante',
		'bookcase',
		'cabinet',
		'armario',
		'chest',
		'baul',
		'barrel',
		'barril',
		'crate',
		'caja',
		'bench',
		'banco',
		'counter',
		'mostrador',
		'stool',
		'taburete',
		'sofa',
		'couch',
		'wardrobe',
		'closet',
		'fireplace',
		'chimenea',
		'hearth',
		'mantel',
		'fire',
		'brazier',
		'throne',
		'nightstand',
		'sideboard',
		'tub',
		'globe',
		'stove',
		'estufa',
		'oven',
		'horno',
		'altar',
		'coffin',
		'ataud',
		'sarcophagus',
		'tomb',
		'tumba',
		'pew',
		'cauldron',
		'caldero',
		'well',
		'pozo',
		'statue',
		'estatua'
	],
	obstaculos: [
		'trunk',
		'tronco',
		'rock',
		'roca',
		'boulder',
		'statue',
		'estatua',
		'well',
		'pozo',
		'column',
		'columna',
		'pillar',
		'pilar'
	]
};

const STRUCTURAL_WORDS = new Set([
	'beam',
	'joist',
	'rafter',
	'truss',
	'barge',
	'roof',
	'ridge',
	'chimney'
]);

function nameTokens(name) {
	return name
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.split(/[^a-zA-Z0-9]+/)
		.filter(Boolean)
		.map((token) => token.toLowerCase().replace(/\d+$/, ''))
		.filter(Boolean);
}

export function readJson(file, fallback = undefined) {
	try {
		return JSON.parse(fs.readFileSync(file, 'utf8'));
	} catch (error) {
		if (fallback !== undefined) return fallback;
		throw error;
	}
}

export function writeJson(file, value) {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, `${JSON.stringify(value, null, '\t')}\n`);
}

export function sha256File(file) {
	return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function readGlb(file) {
	const buffer = fs.readFileSync(file);

	if (buffer.length < 12 || buffer.readUInt32LE(0) !== GLB_MAGIC) {
		throw new Error(`${file} is not a valid GLB`);
	}

	let offset = 12;
	let json = null;
	let bin = Buffer.alloc(0);

	while (offset + 8 <= buffer.length) {
		const length = buffer.readUInt32LE(offset);
		const type = buffer.readUInt32LE(offset + 4);
		offset += 8;

		const chunk = buffer.subarray(offset, offset + length);
		offset += length;

		if (type === CHUNK_JSON) json = JSON.parse(chunk.toString('utf8'));
		if (type === CHUNK_BIN) bin = chunk;
	}

	if (!json) throw new Error(`${file} does not contain the JSON chunk`);

	return {
		json,
		bin,
		sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
		size: buffer.length
	};
}

export function wildcardToRegExp(pattern) {
	const escaped = pattern
		.split('*')
		.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
		.join('.*');
	return new RegExp(`^${escaped}$`, 'i');
}

export function matchesAny(name, patterns) {
	return patterns.some((pattern) =>
		pattern instanceof RegExp ? pattern.test(name) : wildcardToRegExp(pattern).test(name)
	);
}

export function toId(value) {
	const base = path.basename(value, path.extname(value));
	const id = base
		.normalize('NFKD')
		.replace(/[^\w.-]+/g, '-')
		.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
		.toLowerCase()
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
	return id || 'map';
}

export function toPascal(id) {
	const name = id
		.split(/[^a-zA-Z0-9]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join('');
	return /^[a-zA-Z]/.test(name) ? name : `Map${name}`;
}

/**
 * Ruta del GLB sin comprimir. `world-compress.mjs` conserva el export original
 * en `world/source/<glb>`; los verificadores que necesitan leer POSITION (imposible
 * en un primitivo Draco) deben usar esta ruta en vez del GLB servido.
 */
export function sourceGlbPath(glbPath) {
	const candidate = path.join(WORLD_DIR, 'source', path.basename(glbPath));
	return fs.existsSync(candidate) ? candidate : glbPath;
}

export function componentFile(entry) {
	return path.join(COMPONENTS_DIR, `${entry.component}.svelte`);
}

export function physicsFile(entry) {
	return path.join(WORLD_DIR, entry.physics);
}

export function loadMaps() {
	const maps = readJson(MAPS_PATH);
	maps.defaults ??= {};
	maps.maps ??= {};
	// The id lives in the registry key; it is also exposed on each entry
	// so that the physics config and the scripts can reuse it.
	for (const [id, entry] of Object.entries(maps.maps)) {
		if (entry && typeof entry === 'object') entry.id ??= id;
	}
	return maps;
}

export function saveMaps(maps) {
	writeJson(MAPS_PATH, maps);
}

export function loadPhysics(entry) {
	return readJson(physicsFile(entry));
}

export function savePhysics(entry, config) {
	writeJson(physicsFile(entry), config);
}

export function flattenGroups(config) {
	const groups = config.groups ?? {};
	return Object.entries(groups).flatMap(([group, names]) =>
		(names ?? []).map((name) => ({ group, name }))
	);
}

export function unique(values) {
	return [...new Set(values)];
}

export function identityMatrix() {
	return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

export function multiplyMatrices(a, b) {
	const out = new Array(16);
	for (let column = 0; column < 4; column += 1) {
		for (let row = 0; row < 4; row += 1) {
			out[column * 4 + row] =
				a[row] * b[column * 4] +
				a[4 + row] * b[column * 4 + 1] +
				a[8 + row] * b[column * 4 + 2] +
				a[12 + row] * b[column * 4 + 3];
		}
	}
	return out;
}

function quaternionToMatrix([x, y, z, w]) {
	const x2 = x + x;
	const y2 = y + y;
	const z2 = z + z;
	const xx = x * x2;
	const xy = x * y2;
	const xz = x * z2;
	const yy = y * y2;
	const yz = y * z2;
	const zz = z * z2;
	const wx = w * x2;
	const wy = w * y2;
	const wz = w * z2;

	return [
		1 - (yy + zz),
		xy + wz,
		xz - wy,
		0,
		xy - wz,
		1 - (xx + zz),
		yz + wx,
		0,
		xz + wy,
		yz - wx,
		1 - (xx + yy),
		0,
		0,
		0,
		0,
		1
	];
}

export function localMatrix(node) {
	if (node.matrix) return [...node.matrix];

	const translation = node.translation ?? [0, 0, 0];
	const rotation = node.rotation ?? [0, 0, 0, 1];
	const scale = node.scale ?? [1, 1, 1];

	const rotationMatrix = quaternionToMatrix(rotation);
	const matrix = identityMatrix();

	matrix[0] = rotationMatrix[0] * scale[0];
	matrix[1] = rotationMatrix[1] * scale[0];
	matrix[2] = rotationMatrix[2] * scale[0];
	matrix[4] = rotationMatrix[4] * scale[1];
	matrix[5] = rotationMatrix[5] * scale[1];
	matrix[6] = rotationMatrix[6] * scale[1];
	matrix[8] = rotationMatrix[8] * scale[2];
	matrix[9] = rotationMatrix[9] * scale[2];
	matrix[10] = rotationMatrix[10] * scale[2];
	matrix[12] = translation[0];
	matrix[13] = translation[1];
	matrix[14] = translation[2];

	return matrix;
}

export function transformPoint(matrix, point) {
	const [x, y, z] = point;
	return [
		matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
		matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
		matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]
	];
}

export function unionAabb(a, b) {
	if (!a) return b;
	if (!b) return a;
	return {
		min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])],
		max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])]
	};
}

export function transformAabb(matrix, min, max) {
	let result = null;

	for (let index = 0; index < 8; index += 1) {
		const point = [
			index & 1 ? max[0] : min[0],
			index & 2 ? max[1] : min[1],
			index & 4 ? max[2] : min[2]
		];
		const transformed = transformPoint(matrix, point);
		result = unionAabb(result, { min: transformed, max: transformed });
	}

	return result;
}

export function aabbSize(aabb) {
	if (!aabb) return [0, 0, 0];
	return [aabb.max[0] - aabb.min[0], aabb.max[1] - aabb.min[1], aabb.max[2] - aabb.min[2]];
}

export function aabbVolume(aabb) {
	const size = aabbSize(aabb);
	return size[0] * size[1] * size[2];
}

export function aabbFootprint(aabb) {
	const size = aabbSize(aabb);
	return size[0] * size[2];
}

export function accessorMinMax(json, bin, accessorIndex) {
	const accessor = json.accessors?.[accessorIndex];
	if (!accessor) return null;
	if (accessor.min && accessor.max) return { min: accessor.min, max: accessor.max };
	if (accessor.type !== 'VEC3' || accessor.componentType !== 5126) return null;

	const view = json.bufferViews?.[accessor.bufferView];
	if (!view) return null;

	const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
	const stride = view.byteStride ?? 12;
	const min = [Infinity, Infinity, Infinity];
	const max = [-Infinity, -Infinity, -Infinity];

	for (let index = 0; index < accessor.count; index += 1) {
		const offset = base + index * stride;
		for (let component = 0; component < 3; component += 1) {
			const value = bin.readFloatLE(offset + component * 4);
			min[component] = Math.min(min[component], value);
			max[component] = Math.max(max[component], value);
		}
	}

	return { min, max };
}

export function meshAabb(json, bin, meshIndex) {
	const mesh = json.meshes?.[meshIndex];
	if (!mesh) return null;

	let result = null;
	for (const primitive of mesh.primitives ?? []) {
		const accessorIndex = primitive.attributes?.POSITION;
		if (accessorIndex === undefined) continue;
		const bounds = accessorMinMax(json, bin, accessorIndex);
		if (bounds) result = unionAabb(result, bounds);
	}
	return result;
}

export function meshTriangles(json, meshIndex) {
	const mesh = json.meshes?.[meshIndex];
	if (!mesh) return 0;

	let triangles = 0;
	for (const primitive of mesh.primitives ?? []) {
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

export function meshTransparent(json, meshIndex) {
	const mesh = json.meshes?.[meshIndex];
	if (!mesh) return false;
	const materials = json.materials ?? [];

	for (const primitive of mesh.primitives ?? []) {
		if (primitive.material === undefined) continue;
		const material = materials[primitive.material];
		if (!material) continue;
		if (material.alphaMode && material.alphaMode !== 'OPAQUE') return true;
		if ((material.pbrMetallicRoughness?.baseColorFactor?.[3] ?? 1) < 0.999) return true;
		if (material.extensions?.KHR_materials_transmission) return true;
	}
	return false;
}

export function analyzeGlb(glb) {
	const { json, bin } = glb;
	const nodes = json.nodes ?? [];
	const parents = new Map();

	for (let index = 0; index < nodes.length; index += 1) {
		for (const child of nodes[index].children ?? []) parents.set(child, index);
	}

	const roots = json.scenes?.[0]?.nodes?.length
		? [...json.scenes[0].nodes]
		: nodes.map((_, index) => index).filter((index) => !parents.has(index));

	const worldMatrices = new Array(nodes.length).fill(null);
	const seen = new Set();

	function visit(index, parentMatrix) {
		if (seen.has(index) || !nodes[index]) return;
		seen.add(index);
		const world = multiplyMatrices(parentMatrix, localMatrix(nodes[index]));
		worldMatrices[index] = world;
		for (const child of nodes[index].children ?? []) visit(child, world);
	}

	for (const root of roots) visit(root, identityMatrix());

	const animated = new Set();
	for (const animation of json.animations ?? []) {
		for (const channel of animation.channels ?? []) {
			if (channel.target?.node !== undefined) animated.add(channel.target.node);
		}
	}

	const animatedSubtree = new Set();
	function markAnimated(index) {
		if (animatedSubtree.has(index)) return;
		animatedSubtree.add(index);
		for (const child of nodes[index]?.children ?? []) markAnimated(child);
	}
	for (const index of animated) markAnimated(index);

	const result = nodes.map((node, index) => {
		const localAabb = node.mesh !== undefined ? meshAabb(json, bin, node.mesh) : null;
		const worldMatrix = worldMatrices[index] ?? identityMatrix();
		const aabb = localAabb ? transformAabb(worldMatrix, localAabb.min, localAabb.max) : null;
		const size = aabbSize(aabb);
		const maxDim = Math.max(...size);
		const minDim = Math.min(...size);
		const skinned = node.skin !== undefined;

		return {
			index,
			name: node.name || `node_${index}`,
			node,
			parent: parents.get(index) ?? null,
			children: node.children ?? [],
			isMesh: node.mesh !== undefined,
			mesh: node.mesh,
			aabb,
			size,
			maxDim,
			minDim,
			volume: aabbVolume(aabb),
			footprint: aabbFootprint(aabb),
			triangles: node.mesh !== undefined ? meshTriangles(json, node.mesh) : 0,
			transparent: node.mesh !== undefined ? meshTransparent(json, node.mesh) : false,
			animated: animatedSubtree.has(index),
			skinned
		};
	});

	return { json, bin, nodes: result, worldMatrices };
}

export function categoryFromName(name) {
	const tokens = new Set(nameTokens(name));
	if ([...tokens].some((token) => STRUCTURAL_WORDS.has(token))) return 'paredes';

	for (const [category, words] of Object.entries(CATEGORY_WORDS)) {
		if (words.some((word) => tokens.has(word))) return category;
	}
	return null;
}

export function geometryCategory(node) {
	const [sx, sy, sz] = node.size;
	const minHorizontal = Math.min(sx, sz);

	if (sy <= Math.max(0.25, 0.25 * minHorizontal) && node.footprint >= 2) return 'suelo';
	if (sy >= 1 && minHorizontal <= 0.6 && sy >= 1.5 * minHorizontal) return 'paredes';
	if (
		node.maxDim >= 0.3 &&
		node.maxDim <= 4 &&
		node.volume >= 0.01 &&
		node.volume <= 12 &&
		node.minDim >= 0.05
	) {
		return 'muebles';
	}
	if (node.volume >= 0.05 && node.maxDim >= 0.4) return 'obstaculos';
	return null;
}

export function clusterKey(name, tokenLimit = 3) {
	const tokens = name.split(/[_\s.-]+/).filter(Boolean);
	// Groups the object and its pieces: WHI_Attic_Barrel1_Band18 → WHI_Attic_Barrel1.
	if (tokens.length > tokenLimit) return tokens.slice(0, tokenLimit).join('_');
	return name;
}

export function classifyNode(node, config = {}) {
	if (node.animated)
		return { status: 'excluded', reason: 'animated node or inside an animated rig' };
	if (node.skinned) return { status: 'excluded', reason: 'node with skin' };
	if (node.transparent) return { status: 'excluded', reason: 'transparent material' };
	if (node.maxDim < 0.05 || node.volume < 1e-4) {
		return { status: 'excluded', reason: 'geometry too small' };
	}

	const forceInclude = config.forceInclude ?? [];
	if (forceInclude.includes(node.name)) {
		const category = categoryFromName(node.name) ?? geometryCategory(node) ?? 'obstaculos';
		return { status: 'included', category, confidence: 1, reason: 'forceInclude' };
	}

	const patterns = config.excludePatterns ?? DEFAULT_EXCLUDE_PATTERNS;
	if (matchesAny(node.name, patterns)) {
		return { status: 'excluded', reason: 'matches excludePatterns' };
	}

	const semantic = categoryFromName(node.name);
	const geometric = geometryCategory(node);

	if (semantic) {
		const category = semantic;
		const confidence = geometric === semantic ? 1 : 0.85;
		return {
			status: 'included',
			category,
			confidence,
			reason: geometric === semantic ? 'name and geometry' : 'name'
		};
	}

	if (geometric) {
		if (geometric === 'muebles' && node.maxDim < 0.4) {
			return { status: 'review', category: geometric, confidence: 0.5, reason: 'small furniture' };
		}
		return { status: 'included', category: geometric, confidence: 0.65, reason: 'geometry' };
	}

	return { status: 'review', category: null, confidence: 0.3, reason: 'not enough signal' };
}

const GROUND_NAME =
	/(^|[_\s-])(ground|planta[_ ]?baja|ground[_ ]?floor|floor[_ ]?ground)([_\s-]|$)/i;

function pickFloorEntry(entries) {
	const usable = entries.filter((entry) => entry.aabb && aabbFootprint(entry.aabb) >= 1);
	if (usable.length === 0) return null;

	const maxFootprint = Math.max(...usable.map((entry) => aabbFootprint(entry.aabb)));
	const large = usable.filter(
		(entry) => aabbFootprint(entry.aabb) >= Math.max(1, maxFootprint * 0.15)
	);
	const ground = large.filter((entry) => GROUND_NAME.test(entry.name));
	const pool = ground.length > 0 ? ground : large;

	pool.sort((a, b) => {
		// Without a ground-floor name, pick the lowest elevation (basement/ground floor)
		// rather than an upper floor.
		if (ground.length === 0) {
			const delta = a.aabb.min[1] - b.aabb.min[1];
			if (Math.abs(delta) > 0.05) return delta;
		}
		return aabbFootprint(b.aabb) - aabbFootprint(a.aabb);
	});

	return pool[0];
}

function suggestSpawn(feetBasis) {
	if (!feetBasis) return null;
	const top = feetBasis.aabb.max[1];
	return {
		x: Number(((feetBasis.aabb.min[0] + feetBasis.aabb.max[0]) / 2).toFixed(2)),
		y: Number((top + 0.1).toFixed(2)),
		z: Number(((feetBasis.aabb.min[2] + feetBasis.aabb.max[2]) / 2).toFixed(2))
	};
}

export function buildPhysicsConfig(entry, glb, existing = null) {
	const analysis = analyzeGlb(glb);
	const config = {
		id: entry.id,
		glb: entry.glb,
		sourceSha256: glb.sha256,
		collision: {
			mode: existing?.collision?.mode ?? 'auto',
			readyNode: existing?.collision?.readyNode ?? null,
			maxColliderTriangles:
				existing?.collision?.maxColliderTriangles ?? entry.maxColliderTriangles ?? 60000,
			maxColliders: existing?.collision?.maxColliders ?? entry.maxColliders ?? 256,
			maxColliderNodes: existing?.collision?.maxColliderNodes ?? 64
		},
		animations: existing?.animations ?? { mode: 'auto' },
		groups: { suelo: [], paredes: [], muebles: [], obstaculos: [] },
		shapes: existing?.shapes ?? {},
		excludePatterns: unique([...DEFAULT_EXCLUDE_PATTERNS, ...(existing?.excludePatterns ?? [])]),
		forceInclude: existing?.forceInclude ?? [],
		review: []
	};

	const candidates = analysis.nodes.filter((node) => node.isMesh && node.triangles > 0);
	const reviewed = [];
	const included = [];

	for (const node of candidates) {
		const result = classifyNode(node, config);
		if (result.status === 'included') {
			included.push({ node, ...result });
		} else if (result.status === 'review') {
			reviewed.push({
				name: node.name,
				category: result.category,
				confidence: result.confidence,
				triangles: node.triangles,
				reason: result.reason
			});
		}
	}

	included.sort(
		(a, b) =>
			CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category] ||
			b.confidence - a.confidence ||
			a.node.triangles - b.node.triangles ||
			a.node.name.localeCompare(b.node.name)
	);

	const maxTriangles = config.collision.maxColliderTriangles;
	let triangles = 0;
	const selected = [];

	for (const candidate of included) {
		if (triangles + candidate.node.triangles > maxTriangles) {
			reviewed.push({
				name: candidate.node.name,
				category: candidate.category,
				confidence: candidate.confidence,
				triangles: candidate.node.triangles,
				reason: `budget of ${maxTriangles} triangles`
			});
			continue;
		}
		selected.push(candidate);
		triangles += candidate.node.triangles;
	}

	const autoMode = selected.length > config.collision.maxColliderNodes ? 'merged' : 'inject';
	const configuredMode = config.collision.mode;
	const mode = configuredMode === 'auto' ? autoMode : configuredMode;
	config.collision.mode = mode;

	if (mode === 'merged') {
		config.clusters = buildClusters(selected, config, analysis);
		if (config.clusters.length > config.collision.maxColliders) {
			config.clusters = buildClusters(selected, config, analysis, 2);
		}
	}

	for (const candidate of selected) {
		config.groups[candidate.category].push(candidate.node.name);
	}

	for (const names of Object.values(config.groups)) names.sort((a, b) => a.localeCompare(b));

	const floorCandidates =
		mode === 'merged'
			? config.clusters.filter((cluster) => cluster.category === 'suelo')
			: selected.filter((candidate) => candidate.category === 'suelo');

	let readyEntry = null;
	if (mode === 'merged') {
		readyEntry = pickFloorEntry(
			floorCandidates.map((cluster) => ({
				name: cluster.name,
				aabb: clusterAabb(cluster, analysis),
				cluster
			}))
		);
		if (readyEntry) {
			config.collision.readyNode = readyEntry.cluster.name;
		}
	} else {
		readyEntry = pickFloorEntry(
			floorCandidates.map((candidate) => ({
				name: candidate.node.name,
				aabb: candidate.node.aabb,
				candidate
			}))
		);
		if (readyEntry) {
			config.collision.readyNode = readyEntry.candidate.node.name;
		}
	}

	if (!config.collision.readyNode) {
		const fallback = selected
			.map((candidate) => ({ name: candidate.node.name, aabb: candidate.node.aabb }))
			.filter((item) => item.aabb)
			.sort((a, b) => aabbFootprint(b.aabb) - aabbFootprint(a.aabb))[0];
		if (fallback) config.collision.readyNode = fallback.name;
	}

	reviewed.sort((a, b) => a.name.localeCompare(b.name));
	config.review = reviewed.slice(0, 300);

	config.stats = {
		nodes: analysis.nodes.length,
		meshes: candidates.length,
		triangles: candidates.reduce((sum, node) => sum + node.triangles, 0),
		colliderNodes: selected.length,
		colliderTriangles: triangles,
		colliders: mode === 'merged' ? (config.clusters?.length ?? 0) : selected.length,
		mode
	};

	const spawnBasis = readyEntry ? { aabb: readyEntry.aabb } : null;

	return { config, spawn: suggestSpawn(spawnBasis) };
}

export function clusterAabb(cluster, analysis) {
	let aabb = null;
	for (const name of cluster.names) {
		const node = analysis.nodes.find((item) => item.name === name);
		if (node?.aabb) aabb = unionAabb(aabb, node.aabb);
	}
	return aabb;
}

function buildClusters(selected, config, analysis, tokenLimit = 3) {
	const clusters = new Map();

	for (const candidate of selected) {
		const key = clusterKey(candidate.node.name, tokenLimit);
		const current = clusters.get(key) ?? {
			name: key,
			category: candidate.category,
			shape: config.shapes[candidate.node.name] ?? null,
			categories: new Map(),
			names: [],
			triangles: 0
		};

		current.categories.set(
			candidate.category,
			(current.categories.get(candidate.category) ?? 0) +
				(candidate.node.volume > 0 ? candidate.node.volume : candidate.node.triangles)
		);
		current.names.push(candidate.node.name);
		current.triangles += candidate.node.triangles;
		clusters.set(key, current);
	}

	return [...clusters.values()]
		.map((cluster) => {
			// The group name wins (e.g. WHI_Par_Fire is a chimney,
			// even if one of its pieces is horizontal); if there is no signal, the
			// category with the most triangles wins.
			const category =
				categoryFromName(cluster.name) ??
				[...cluster.categories.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
				cluster.category;
			let shape = cluster.shape;
			if (!shape) {
				shape = category === 'suelo' || category === 'paredes' ? 'trimesh' : 'convexHull';
			}
			return {
				name: cluster.name,
				category,
				shape,
				triangles: cluster.triangles,
				names: unique(cluster.names).sort((a, b) => a.localeCompare(b))
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

export function quote(value) {
	return JSON.stringify(value);
}

export function run(command, args, options = {}) {
	const result = spawnSync(command, args, {
		cwd: options.cwd ?? ROOT,
		stdio: 'inherit',
		env: process.env
	});
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(' ')} exited with code ${result.status}`);
	}
}

const BOOLEAN_FLAGS = new Set([
	'all',
	'dry',
	'dry-run',
	'refresh',
	'move',
	'force',
	'no-build',
	'reset-spawn',
	'restore',
	'allow-uncompressed'
]);

export function parseArgs(argv) {
	const positional = [];
	const flags = {};

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (!argument.startsWith('--')) {
			positional.push(argument);
			continue;
		}

		const [key, inlineValue] = argument.slice(2).split('=');
		if (inlineValue !== undefined) {
			flags[key] = inlineValue;
		} else if (!BOOLEAN_FLAGS.has(key) && argv[index + 1] && !argv[index + 1].startsWith('--')) {
			flags[key] = argv[index + 1];
			index += 1;
		} else {
			flags[key] = true;
		}
	}

	return { positional, flags };
}

export function log(scope, message) {
	console.log(`[${scope}] ${message}`);
}

export function warn(scope, message) {
	console.warn(`[${scope}] ${message}`);
}
