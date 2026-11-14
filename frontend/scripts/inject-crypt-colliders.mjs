import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_PATH = process.argv[2] ?? path.join(ROOT, 'src/lib/components/world/Crypt.svelte');
const CONFIG_PATH =
	process.argv[3] ?? path.join(ROOT, 'src/lib/components/world/crypt-colliders.json');

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const targets = Object.values(config.groups).flat();
const source = fs.readFileSync(SOURCE_PATH, 'utf8');

// `@threlte/gltf` elimina los puntos de los nombres (`A4C_Gallery.001` →
// `A4C_Gallery001`). Se prueban ambas variantes al buscar cada bloque.
function candidates(name) {
	const normalized = name.replace(/\./g, '');
	return normalized === name ? [name] : [name, normalized];
}

let output = source;

if (!source.includes('AutoColliders')) {
	const lines = source.split('\n');

	function indentOf(line) {
		return line.match(/^\s*/)?.[0] ?? '';
	}

	function nodeName(line) {
		return line.match(/name="([^"]+)"/)?.[1] ?? null;
	}

	/** Devuelve el índice de la línea en la que se cierra la etiqueta de apertura. */
	function openTagEnd(start) {
		let end = start;
		while (end < lines.length && !lines[end].includes('>')) end += 1;
		return end;
	}

	/** Busca el nombre dentro de una etiqueta que puede ocupar varias líneas. */
	function tagName(start, end) {
		const text = lines.slice(start, end + 1).join('\n');
		return nodeName(text);
	}

	function findGroupBlock(names) {
		for (let start = 0; start < lines.length; start += 1) {
			if (!lines[start].trim().startsWith('<T.Group')) continue;

			const openEnd = openTagEnd(start);
			const found = tagName(start, openEnd);
			if (!found || !names.includes(found)) continue;

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

	function findMeshBlock(names) {
		for (let start = 0; start < lines.length; start += 1) {
			if (!lines[start].trim().startsWith('<T.Mesh')) continue;

			let end = start;
			while (end < lines.length && !lines[end].includes('/>')) end += 1;
			if (end >= lines.length) continue;

			const found = tagName(start, end);
			if (!found || !names.includes(found)) continue;

			return { start, end };
		}
		return null;
	}

	const blocks = [];
	const missing = [];

	for (const name of targets) {
		const names = candidates(name);
		const block = findGroupBlock(names) ?? findMeshBlock(names);

		if (!block) {
			missing.push(name);
			continue;
		}

		blocks.push({ name, names, ...block });
	}

	if (missing.length > 0) {
		console.error(`[crypt:inject] No se encontraron en Crypt.svelte: ${missing.join(', ')}`);
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

		if (block.names.includes('A4C_Hall')) {
			attributes.push(
				`oncreate={() => {
				cryptState.ready = true;
				if (import.meta.env.DEV) console.info('[crypt] física lista');
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
	console.log(`[crypt:inject] ${blocks.length} nodos envueltos en AutoColliders`);
} else {
	console.log('[crypt:inject] AutoColliders ya presentes; se conservan');
}

// Imports del inyector. Se evita duplicarlos si el script se ejecuta dos veces.
if (!output.includes('AutoColliders } from')) {
	output = output.replace(
		"  import { T } from '@threlte/core'",
		"  import { T } from '@threlte/core'\n  import { onDestroy } from 'svelte'\n  import { AutoColliders } from '@threlte/rapier'\n  import { cryptState } from '../../state/cryptState.svelte'"
	);
}

// Props con valores por defecto para que `svelte-check` no marque los
// `{@render fallback?.()}` como posibles `undefined`.
output = output.replace(
	'  let { fallback, error, children, ref = $bindable(), ...props } = $props()',
	'  let { fallback = () => {}, error = () => {}, children = () => {}, ref = $bindable(), ...props } = $props()'
);

// La cripta se desmonta al volver al mundo exterior: la física deja de estar
// lista hasta el siguiente montaje.
if (!output.includes('cryptState.reset()')) {
	output = output.replace(
		'  const gltf = useGltf(',
		'  onDestroy(() => cryptState.reset());\n\n  const gltf = useGltf('
	);
}

fs.writeFileSync(SOURCE_PATH, output);
