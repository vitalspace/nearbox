import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAP_PATH = process.argv[2] ?? path.join(ROOT, 'src/lib/components/world/Map.svelte');
const CONFIG_PATH =
	process.argv[3] ?? path.join(ROOT, 'src/lib/components/world/map-colliders.json');

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const targets = Object.values(config.groups).flat();
const source = fs.readFileSync(MAP_PATH, 'utf8');

let output = source;

// Los colliders solo se inyectan una vez. Si el archivo ya viene parcheado
// (por ejemplo, tras ejecutar el inyector dos veces), se conserva tal cual.
if (!source.includes('AutoColliders')) {
	const lines = source.split('\n');

	function indentOf(line) {
		return line.match(/^\s*/)?.[0] ?? '';
	}

	function findGroupBlock(name) {
		for (let start = 0; start < lines.length; start += 1) {
			if (!lines[start].trim().startsWith('<T.Group')) continue;

			// La etiqueta de apertura puede ocupar varias líneas (nombre,
			// posición, rotación…). Se lee entera antes de comparar el nombre.
			let openEnd = start;
			while (openEnd < lines.length && !lines[openEnd].includes('>')) openEnd += 1;
			const openTag = lines.slice(start, openEnd + 1).join('\n');
			if (!openTag.includes(`name="${name}"`)) continue;

			let depth = 0;
			for (let index = start; index < lines.length; index += 1) {
				depth += (lines[index].match(/<T\.Group\b/g) ?? []).length;
				depth -= (lines[index].match(/<\/T\.Group>/g) ?? []).length;
				if (depth === 0) {
					return { start, end: index };
				}
			}
		}
		return null;
	}

	function findMeshBlock(name) {
		for (let start = 0; start < lines.length; start += 1) {
			if (!lines[start].trim().startsWith('<T.Mesh')) continue;

			let end = start;
			while (end < lines.length && !lines[end].includes('/>')) end += 1;
			if (end >= lines.length) continue;

			const block = lines.slice(start, end + 1).join('\n');
			if (block.includes(`name="${name}"`)) {
				return { start, end };
			}
		}
		return null;
	}

	const blocks = [];
	const missing = [];

	for (const name of targets) {
		const block = findGroupBlock(name) ?? findMeshBlock(name);
		if (!block) {
			missing.push(name);
			continue;
		}
		blocks.push({ name, ...block });
	}

	if (missing.length > 0) {
		console.error(`[map:inject] No se encontraron en Map.svelte: ${missing.join(', ')}`);
		process.exit(1);
	}

	// Insertar de abajo hacia arriba para que los índices no se desplacen.
	blocks.sort((a, b) => b.start - a.start);

	for (const block of blocks) {
		const indent = indentOf(lines[block.start]);
		const body = lines
			.slice(block.start, block.end + 1)
			.map((line) => (line.trim() === '' ? line : `  ${line}`));

		const attributes = [`shape="trimesh"`, `friction={0.9}`, `restitution={0}`];
		if (block.name === 'Circle') {
			attributes.push(
				`oncreate={() => {
				mapState.ready = true;
				if (import.meta.env.DEV) console.info('[map] física lista');
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

	output = lines.join('\n');
	console.log(`[map:inject] ${blocks.length} nodos envueltos en AutoColliders`);
} else {
	console.log('[map:inject] AutoColliders ya presentes; se conservan');
}

output = output.replace(
	"  import { T } from '@threlte/core'",
	"  import { T, useTask } from '@threlte/core'\n  import { AutoColliders } from '@threlte/rapier'\n  import { mapState } from '../../state/mapState.svelte'"
);

output = output.replace(
	"  import { Group } from 'three'",
	"  import { AnimationMixer, Group } from 'three'"
);

output = output.replace(
	'  let { fallback, error, children, ref = $bindable(), ...props } = $props()',
	'  let { fallback = () => {}, error = () => {}, children = () => {}, ref = $bindable(), ...props } = $props()'
);

output = output.replace(
	'  function cloneScene(scene) {',
	'  /**\n   * @param {import("three").Object3D} scene\n   * @returns {Record<string, any>}\n   */\n  function cloneScene(scene) {'
);

output = output.replace(
	'    const nodes = {}',
	'    /** @type {Record<string, any>} */\n    const nodes = {}'
);

// Reproduce las animaciones que trae el mapa: murciélagos (transformación +
// shape keys) y los tres espantapájaros. Los espantapájaros comparten los
// nombres de hueso (`root`, `hips`, …), así que cada uno necesita su propio
// mixer para no acabar animando el rig del primero.
const animationsBlock = `
	// Animaciones del mapa: murciélagos y espantapájaros.
	/** @type {import('three').AnimationMixer[]} */
	const scarecrowMixers = [];
	let animationsStarted = false;

	$effect(() => {
		if (animationsStarted || !$gltf || !ref) return;

		const currentActions = $actions;
		if (Object.keys(currentActions).length === 0) return;

		for (const [name, action] of Object.entries(currentActions)) {
			if (!action || name.startsWith('SC_')) continue;
			action.reset().play();
		}

		const rigs = [
			['Scarecrow', 'SC_idle'],
			['Scarecrow001', 'SC_idle.001'],
			['Scarecrow002', 'SC_idle.002']
		];

		for (const [groupName, clipName] of rigs) {
			const group = ref.getObjectByName(groupName);
			const clip = $gltf.animations.find((item) => item.name === clipName);
			if (!group || !clip) continue;

			const rigMixer = new AnimationMixer(group);
			rigMixer.clipAction(clip).play();
			scarecrowMixers.push(rigMixer);
		}

		animationsStarted = true;

		if (import.meta.env.DEV) {
			console.info(
				'[map] animaciones listas (' +
					Object.keys(currentActions).length +
					' clips, ' +
					scarecrowMixers.length +
					' espantapájaros)'
			);
		}
	});

	useTask((delta) => {
		for (const rigMixer of scarecrowMixers) rigMixer.update(delta);
	});
`;

if (!output.includes('scarecrowMixers')) {
	output = output.replace('\n</script>', `${animationsBlock}\n</script>`);
}

fs.writeFileSync(MAP_PATH, output);
