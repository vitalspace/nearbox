import fs from 'node:fs';
import { flattenGroups, loadPhysics, quote, unique, warn } from './world-lib.mjs';

const CATEGORY_SHAPE = {
	suelo: 'trimesh',
	paredes: 'trimesh',
	muebles: 'convexHull',
	obstaculos: 'convexHull'
};

/** Inserta un import justo después del de `@threlte/core`, sin depender de que
 * esa línea siga siendo exactamente `import { T } from '@threlte/core'`. */
function addAfterCoreImport(source, statement) {
	const coreImport = /(\n\s*import \{[^\n]*\} from '@threlte\/core';?)/;
	if (!coreImport.test(source)) return source;
	return source.replace(coreImport, `$1\n\t${statement}`);
}

function nodeCandidates(name) {
	const normalized = name.replace(/\./g, '');
	return normalized === name ? [name] : [name, normalized];
}

function indentOf(line) {
	return line.match(/^\s*/)?.[0] ?? '';
}

function findGroupBlock(lines, names) {
	for (let start = 0; start < lines.length; start += 1) {
		if (!lines[start].trim().startsWith('<T.Group')) continue;

		let openEnd = start;
		while (openEnd < lines.length && !lines[openEnd].includes('>')) openEnd += 1;
		const openTag = lines.slice(start, openEnd + 1).join('\n');
		if (!names.some((name) => openTag.includes(`name="${name}"`))) continue;

		let depth = 0;
		for (let index = start; index < lines.length; index += 1) {
			depth += (lines[index].match(/<T\.Group\b/g) ?? []).length;
			depth -= (lines[index].match(/<\/T\.Group>/g) ?? []).length;
			if (depth === 0) return { start, end: index };
		}
	}
	return null;
}

function findMeshBlock(lines, names) {
	for (let start = 0; start < lines.length; start += 1) {
		if (!lines[start].trim().startsWith('<T.Mesh')) continue;

		let openEnd = start;
		while (openEnd < lines.length && !lines[openEnd].includes('>')) openEnd += 1;
		if (openEnd >= lines.length) continue;

		const openTag = lines.slice(start, openEnd + 1).join('\n');
		if (!names.some((name) => openTag.includes(`name="${name}"`))) continue;

		const end = meshBlockEnd(lines, start, openEnd);
		if (end !== null) return { start, end };
	}
	return null;
}

/**
 * End line of a `<T.Mesh>` block. The generated file may nest meshes (for
 * example the latrine door has a handle and a moon as children), so a simple
 * search for the first `/>` would close the wrapper too early.
 */
function meshBlockEnd(lines, start, openEnd) {
	if (lines[openEnd].includes('/>')) return openEnd;

	for (let index = openEnd + 1; index < lines.length; index += 1) {
		const trimmed = lines[index].trim();
		if (trimmed.startsWith('</T.Mesh>')) return index;
		if (!trimmed.startsWith('<T.Mesh')) continue;

		let childOpenEnd = index;
		while (childOpenEnd < lines.length && !lines[childOpenEnd].includes('>')) childOpenEnd += 1;
		if (childOpenEnd >= lines.length) return null;

		const childEnd = meshBlockEnd(lines, index, childOpenEnd);
		if (childEnd === null) return null;
		index = childEnd;
	}
	return null;
}

function findNodeBlock(lines, name) {
	const candidates = nodeCandidates(name);
	return findGroupBlock(lines, candidates) ?? findMeshBlock(lines, candidates);
}

function categoryForName(config, name) {
	for (const [category, names] of Object.entries(config.groups ?? {})) {
		if (names?.includes(name)) return category;
	}
	return null;
}

function injectColliders(source, config) {
	const lines = source.split('\n');
	const entries = flattenGroups(config);
	const targets = unique(entries.map((entry) => entry.name));
	const blocks = [];
	const missing = [];

	for (const name of targets) {
		const block = findNodeBlock(lines, name);
		if (!block) {
			missing.push(name);
			continue;
		}
		blocks.push({ name, ...block });
	}

	if (missing.length > 0) {
		throw new Error(`No se encontraron en el componente: ${missing.join(', ')}`);
	}

	blocks.sort((a, b) => b.start - a.start);

	for (const block of blocks) {
		const indent = indentOf(lines[block.start]);
		const body = lines
			.slice(block.start, block.end + 1)
			.map((line) => (line.trim() === '' ? line : `  ${line}`));

		const category = categoryForName(config, block.name);
		const shape = config.shapes?.[block.name] ?? CATEGORY_SHAPE[category] ?? 'trimesh';
		const attributes = [
			`shape="${shape}"`,
			`friction={${config.friction ?? 0.9}}`,
			`restitution={${config.restitution ?? 0}}`
		];

		if (block.name === config.collision?.readyNode) {
			attributes.push(
				`oncreate={() => {
				worldState.markReady(${quote(config.id)});
				if (import.meta.env.DEV) console.info('[world:${config.id}] física lista');
			}}`
			);
		}

		const wrapped = [
			`${indent}<AutoColliders ${attributes.join(' ')}>`,
			...body,
			`${indent}</AutoColliders>`
		];

		lines.splice(block.start, block.end - block.start + 1, ...wrapped);
	}

	return lines.join('\n');
}

/**
 * El GLB conserva las animaciones de las piezas externalizadas (zepelín,
 * globo…) aunque su subárbol se monte con un componente aparte. Si esos clips
 * llegan al mixer, Three avisa en consola de que no encuentra el nodo. Este
 * helper descarta los clips cuyos nodos no existen en la escena montada.
 */
const ANIMATED_GLTF_FILTER = `
	/**
	 * @param {any} gltf
	 * @returns {any}
	 */
	function filterAnimatedGltf(gltf) {
		if (!gltf || !ref) return gltf;

		/** @type {import('three').AnimationClip[]} */
		const animations = gltf.animations.filter(
			(/** @type {import('three').AnimationClip} */ clip) =>
				clip.tracks.every((track) => Boolean(ref.getObjectByName(track.name.split('.')[0])))
		);

		return animations.length === gltf.animations.length ? gltf : { ...gltf, animations };
	}
`;

function animationsBlock(config) {
	const animations = config.animations ?? { mode: 'auto' };
	if (animations.mode === 'none') return '';

	const rigs = animations.rigs ?? [];
	/** Nodos sin clip en el GLB que igualmente deben moverse (p. ej. espantapájaros). */
	const idle = animations.idle ?? [];
	const skipClips = unique(rigs.map((rig) => rig.clip).filter(Boolean));
	const skipLiteral = skipClips.length
		? `new Set([${skipClips.map((clip) => quote(clip)).join(', ')}])`
		: 'new Set()';

	const idleBlock = idle.length
		? `
	// Idle procedural para nodos sin clip propio (espantapájaros al viento).
	const worldIdleNodes = ${JSON.stringify(idle)};
	/** @type {Array<{ node: import('three').Object3D; axis: 'x' | 'y' | 'z'; base: number; amplitude: number; speed: number; phase: number }>} */
	const worldIdleState = [];
	let worldIdleLookupDone = false;
	let worldIdleTime = 0;

	useTask((delta) => {
		if (worldIdleNodes.length === 0) return;

		if (!worldIdleLookupDone && ref) {
			for (const spec of worldIdleNodes) {
				const node = ref.getObjectByName(spec.node);
				if (!node) continue;
				const axis = spec.axis === 'y' || spec.axis === 'z' ? spec.axis : 'x';
				worldIdleState.push({
					node,
					axis,
					base: node.rotation[axis],
					amplitude: spec.amplitude ?? 0.05,
					speed: spec.speed ?? 1,
					phase: spec.phase ?? 0
				});
			}
			worldIdleLookupDone = worldIdleState.length > 0;
		}

		if (worldIdleState.length === 0) return;

		worldIdleTime += delta;
		for (const item of worldIdleState) {
			item.node.rotation[item.axis] =
				item.base + Math.sin(worldIdleTime * item.speed + item.phase) * item.amplitude;
		}
	});
`
		: '';

	return `
	// Animaciones del mapa generadas por el pipeline.
	/** @type {import('three').AnimationMixer[]} */
	const worldRigMixers = [];
	let worldAnimationsStarted = false;

	$effect(() => {
		if (worldAnimationsStarted || !$gltf || !ref) return;

		const currentActions = $actions;
		if (Object.keys(currentActions).length === 0) return;

		const skipClips = ${skipLiteral};

		for (const [name, action] of Object.entries(currentActions)) {
			if (!action || skipClips.has(name)) continue;
			action.reset().play();
		}

		/** @type {Array<{ group: string; clip: string }>} */
		const worldRigs = ${JSON.stringify(rigs)};
		for (const rig of worldRigs) {
			const group = ref.getObjectByName(rig.group);
			const clip = $gltf.animations.find((item) => item.name === rig.clip);
			if (!group || !clip) continue;

			const rigMixer = new AnimationMixer(group);
			rigMixer.clipAction(clip).play();
			worldRigMixers.push(rigMixer);
		}

		worldAnimationsStarted = true;

		if (import.meta.env.DEV) {
			console.info('[world] animaciones listas (' + Object.keys(currentActions).length + ' clips)');
		}
	});
${
	rigs.length
		? `
	useTask((delta) => {
		for (const rigMixer of worldRigMixers) rigMixer.update(delta);
	});
`
		: ''
}${idleBlock}
`;
}

function localiseAssets(source) {
	if (!source.includes('useGltf(')) {
		return source;
	}

	source = source.replace(
		/useGltf\('\/?([^']+\.glb)'/g,
		(_match, file) => `useGltf(asset('${file}')`
	);
	source = source.replace(
		/useDraco\('https:\/\/www\.gstatic\.com\/[^']+'\)/g,
		"useDraco(asset('draco/'))"
	);

	if (!source.includes("from '../../assets/path'")) {
		// La línea de `@threlte/core` puede haberse ampliado antes (useTask,
		// AutoColliders, worldState), así que se inserta después sin depender
		// de que siga siendo exactamente `import { T } from '@threlte/core'`.
		const coreImport = /(\n\s*import \{[^\n]*\} from '@threlte\/core';?)/;
		if (coreImport.test(source)) {
			source = source.replace(coreImport, "$1\n\timport { asset } from '../../assets/path';");
		} else {
			source = source.replace(
				"  import { T } from '@threlte/core'",
				"  import { T } from '@threlte/core'\n  import { asset } from '../../assets/path'"
			);
		}
	}

	return source;
}

export function injectComponent(file, config) {
	let source = fs.readFileSync(file, 'utf8');
	const mode = config.collision?.mode ?? 'inject';

	if (mode === 'inject' && !source.includes('AutoColliders')) {
		source = injectColliders(source, config);
	}

	if (mode === 'inject' && !source.includes("from '../../state/worldState.svelte'")) {
		source = addAfterCoreImport(
			source,
			"import { worldState } from '../../state/worldState.svelte';"
		);
	}

	if (mode === 'inject' && !source.includes("from '@threlte/rapier'")) {
		source = addAfterCoreImport(source, "import { AutoColliders } from '@threlte/rapier';");
	}

	const animations = config.animations ?? { mode: 'auto' };
	if (animations.mode !== 'none' && !source.includes('worldAnimationsStarted')) {
		if (!source.includes('useGltfAnimations')) {
			warn(
				'world:inject',
				`${config.id}: el GLB no tiene animaciones; se omite el bloque de animación`
			);
		} else {
			source = source.replace(
				'  function cloneScene(scene) {',
				'  /**\n   * @param {import("three").Object3D} scene\n   * @returns {Record<string, any>}\n   */\n  function cloneScene(scene) {'
			);
			source = source.replace(
				'    const nodes = {}',
				'    /** @type {Record<string, any>} */\n    const nodes = {}'
			);
			source = source.replace(
				"  import { T } from '@threlte/core'",
				"  import { T, useTask } from '@threlte/core'"
			);
			source = source.replace(
				"  import { Group } from 'three'",
				"  import { AnimationMixer, Group } from 'three'"
			);
			if (!source.includes('AnimationMixer')) {
				source = source.replace(
					"  import { T, useTask } from '@threlte/core'",
					"  import { T, useTask } from '@threlte/core'\n  import { AnimationMixer } from 'three'"
				);
			}
			if (!source.includes('filterAnimatedGltf')) {
				source = source.replace(
					'useGltfAnimations(() => $gltf, () => ref)',
					'useGltfAnimations(() => filterAnimatedGltf($gltf), () => ref)'
				);
				source = source.replace(
					'export const { actions, mixer } = useGltfAnimations(',
					`${ANIMATED_GLTF_FILTER}\nexport const { actions, mixer } = useGltfAnimations(`
				);
			}
			source = source.replace('\n</script>', `${animationsBlock(config)}\n</script>`);
		}
	}

	source = source.replace(
		'  let { fallback, error, children, ref = $bindable(), ...props } = $props()',
		'  let { fallback = () => {}, error = () => {}, children = () => {}, ref = $bindable(), ...props } = $props()'
	);

	source = localiseAssets(source);

	fs.writeFileSync(file, source);

	if (
		!fs.readFileSync(file, 'utf8').includes("from '../../state/worldState.svelte'") &&
		mode === 'inject'
	) {
		throw new Error('No se pudo importar worldState en el componente generado');
	}

	return source;
}
