#!/usr/bin/env node
/**
 * `world:externalize <id>` extrae nodos de un GLB de mapa a GLB independientes
 * y los sustituye en el componente generado por un componente Svelte propio.
 *
 * Se usa para piezas reutilizables (globo, zepelín…) que deben poder montarse
 * en otros mapas sin duplicar el modelo completo. La configuración vive en
 * `world/maps.json`:
 *
 *   "externalComponents": [
 *     {
 *       "node": "Balloon_Root",
 *       "component": "Balloon",
 *       "glb": "props/balloon.glb",
 *       "props": { "collision": true }
 *     }
 *   ]
 *
 * El GLB extraído conserva los nombres de nodo y las animaciones que apuntan a
 * su subárbol, y deja la raíz en el origen: la posición/rotación originales se
 * trasladan a las props del componente en el mapa. `props` añade atributos
 * extra (por ejemplo, la órbita del zepelín) al componente generado, de modo
 * que se conservan al reconstruir el mapa.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Document } from '@gltf-transform/core';
import { copyToDocument, createDefaultPropertyResolver, prune } from '@gltf-transform/functions';
import {
	COMPONENTS_DIR,
	createDracoIO,
	loadMaps,
	log,
	parseArgs,
	STATIC_DIR,
	warn
} from './world-lib.mjs';

const SCOPE = 'world:externalize';

function isFresh(source, output) {
	if (!fs.existsSync(output)) return false;
	const sourceStat = fs.statSync(source);
	const outputStat = fs.statSync(output);
	return outputStat.mtimeMs >= sourceStat.mtimeMs;
}

/** Todos los nodos del subárbol que empieza en `root`. */
function collectSubtree(root) {
	const nodes = new Set();
	const pending = [root];
	while (pending.length > 0) {
		const node = pending.pop();
		if (nodes.has(node)) continue;
		nodes.add(node);
		pending.push(...node.listChildren());
	}
	return nodes;
}

/** Animaciones cuyos canales apuntan únicamente a nodos del subárbol. */
function animationsFor(root, subtree) {
	return root.listAnimations().filter((animation) => {
		const channels = animation.listChannels();
		return channels.length > 0 && channels.every((channel) => subtree.has(channel.getTargetNode()));
	});
}

async function extractNode(io, sourceFile, outputFile, nodeName) {
	const source = await io.read(sourceFile);
	const sourceRoot = source.getRoot();
	const node = sourceRoot.listNodes().find((item) => item.getName() === nodeName);
	if (!node) throw new Error(`no existe el nodo "${nodeName}" en ${path.basename(sourceFile)}`);

	const doc = new Document();
	doc.createBuffer();

	for (const extension of sourceRoot.listExtensionsUsed()) {
		const copy = doc.createExtension(extension.constructor);
		if (extension.isRequired()) copy.setRequired(true);
	}

	const subtree = collectSubtree(node);
	const animations = animationsFor(sourceRoot, subtree);

	const scene = doc.createScene('Scene');
	// Un único resolver mantiene las referencias de las animaciones al nodo copiado.
	const resolve = createDefaultPropertyResolver(doc, source);
	const map = copyToDocument(doc, source, [node, ...animations], resolve);
	const copyNode = map.get(node);
	if (!copyNode) throw new Error(`no se pudo copiar "${nodeName}"`);

	// El componente coloca la pieza con sus props; el GLB debe nacer en origen.
	copyNode.setTranslation([0, 0, 0]);
	copyNode.setRotation([0, 0, 0, 1]);
	copyNode.setScale([1, 1, 1]);
	scene.addChild(copyNode);
	doc.getRoot().setDefaultScene(scene);

	await doc.transform(prune({ keepAttributes: false, keepLeaves: false }));
	await io.write(outputFile, doc);

	return {
		nodes: doc.getRoot().listNodes().length,
		meshes: doc.getRoot().listMeshes().length,
		animations: doc.getRoot().listAnimations().length,
		bytes: fs.statSync(outputFile).size
	};
}

function indentationOf(line) {
	return line.match(/^\s*/)?.[0] ?? '';
}

/** Bloque completo de un `<T.Group>` por nombre. */
function findGroupBlock(lines, nodeName) {
	for (let start = 0; start < lines.length; start += 1) {
		if (!lines[start].trim().startsWith('<T.Group')) continue;

		let openEnd = start;
		while (openEnd < lines.length && !lines[openEnd].includes('>')) openEnd += 1;
		if (openEnd >= lines.length) continue;

		const openTag = lines.slice(start, openEnd + 1).join('\n');
		if (!openTag.includes(`name="${nodeName}"`)) continue;

		let depth = 0;
		for (let index = start; index < lines.length; index += 1) {
			depth += (lines[index].match(/<T\.Group\b/g) ?? []).length;
			depth -= (lines[index].match(/<\/T\.Group>/g) ?? []).length;
			if (depth === 0) return { start, end: index, openEnd, openTag };
		}
	}
	return null;
}

/** Bloque completo de un `<T.Mesh>` (puede anidar otros `<T.Mesh>`). */
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

function findMeshBlock(lines, nodeName) {
	for (let start = 0; start < lines.length; start += 1) {
		if (!lines[start].trim().startsWith('<T.Mesh')) continue;

		let openEnd = start;
		while (openEnd < lines.length && !lines[openEnd].includes('>')) openEnd += 1;
		if (openEnd >= lines.length) continue;

		const openTag = lines.slice(start, openEnd + 1).join('\n');
		if (!openTag.includes(`name="${nodeName}"`)) continue;

		const end = meshBlockEnd(lines, start, openEnd);
		if (end !== null) return { start, end, openEnd, openTag };
	}
	return null;
}

function formatProp(name, value) {
	if (typeof value === 'boolean') return value ? name : `${name}={false}`;
	if (typeof value === 'number') return `${name}={${value}}`;
	if (typeof value === 'string') return `${name}="${value}"`;
	return `${name}={${JSON.stringify(value)}}`;
}

function selfClosingTag(openTag, component, props = {}) {
	let attributes = openTag
		.replace(/^\s*<T\.(?:Group|Mesh)\b/, '')
		.replace(/\s*name="[^"]*"/, '')
		.replace(/>\s*$/, '')
		.replace(/\s+/g, ' ')
		.trim();

	// `null` en props elimina el atributo original (p. ej. position/rotation
	// cuando el componente calcula su propia órbita).
	for (const name of Object.keys(props)) {
		attributes = attributes
			.replace(new RegExp(`(^|\\s+)${name}=(?:"[^"]*"|\\{[^}]*\\})`), ' ')
			.trim();
	}

	const extra = Object.entries(props)
		.filter(([, value]) => value !== null)
		.map(([name, value]) => formatProp(name, value))
		.join(' ');

	return `<${component}${attributes ? ` ${attributes}` : ''}${extra ? ` ${extra}` : ''} />`;
}

function replaceNodeWithComponent(file, spec) {
	const source = fs.readFileSync(file, 'utf8');
	if (source.includes(`from './${spec.component}.svelte'`)) {
		return { replaced: false, reason: 'ya externalizado' };
	}

	const lines = source.split('\n');
	const block = findGroupBlock(lines, spec.node) ?? findMeshBlock(lines, spec.node);
	if (!block) return { replaced: false, reason: 'nodo no encontrado en el componente' };

	const indent = indentationOf(lines[block.start]);
	const tag = selfClosingTag(block.openTag, spec.component, spec.props);
	lines.splice(block.start, block.end - block.start + 1, `${indent}${tag}`);

	let output = lines.join('\n');
	if (!output.includes(`from './${spec.component}.svelte'`)) {
		output = output.replace(
			'\n</script>',
			`\n\timport ${spec.component} from './${spec.component}.svelte';\n</script>`
		);
	}

	fs.writeFileSync(file, output);
	return { replaced: true, reason: tag.trim() };
}

export async function externalizeMap(id, entry, { refresh = false } = {}) {
	const specs = entry.externalComponents ?? [];
	if (specs.length === 0) return;

	const sourceFile = path.join(STATIC_DIR, entry.glb);
	const componentFile = path.join(COMPONENTS_DIR, `${entry.component}.svelte`);
	const { io } = await createDracoIO();

	for (const spec of specs) {
		if (!spec.node || !spec.component || !spec.glb) {
			throw new Error(`${id}: externalComponents necesita node, component y glb`);
		}

		const outputFile = path.join(STATIC_DIR, spec.glb);
		if (refresh || !isFresh(sourceFile, outputFile)) {
			const result = await extractNode(io, sourceFile, outputFile, spec.node);
			log(
				SCOPE,
				`${id}: ${spec.node} → ${spec.glb} (${result.nodes} nodos, ${result.meshes} mallas, ${
					result.animations
				} animaciones, ${Math.round(result.bytes / 1024)} KB)`
			);
		} else {
			log(SCOPE, `${id}: ${spec.glb} ya está actualizado`);
		}

		if (!fs.existsSync(componentFile)) {
			warn(SCOPE, `${id}: falta ${path.relative(process.cwd(), componentFile)} para ${spec.node}`);
			continue;
		}

		const result = replaceNodeWithComponent(componentFile, spec);
		if (result.replaced) {
			log(SCOPE, `${id}: ${spec.node} → <${spec.component}> (${result.reason})`);
		} else {
			log(SCOPE, `${id}: ${spec.node}: ${result.reason}`);
		}
	}
}

async function main() {
	const { positional, flags } = parseArgs(process.argv.slice(2));
	const id = positional[0];
	if (!id) {
		warn(SCOPE, 'uso: node scripts/world-externalize.mjs <id> [--refresh]');
		process.exit(1);
	}

	const maps = loadMaps();
	const entry = maps.maps[id];
	if (!entry) {
		warn(SCOPE, `no existe el mapa "${id}" en world/maps.json`);
		process.exit(1);
	}

	await externalizeMap(id, entry, { refresh: Boolean(flags.refresh) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((error) => {
		console.error(`${SCOPE}: ${error.message}`);
		process.exit(1);
	});
}
