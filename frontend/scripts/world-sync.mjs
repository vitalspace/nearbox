#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { componentFile, loadMaps, log, REGISTRY_PATH } from './world-lib.mjs';

function defaultValue(value, fallback) {
	return value ?? fallback;
}

function transformOf(entry) {
	const transform = entry.transform ?? {};
	return {
		position: transform.position ?? [0, 0, 0],
		rotation: transform.rotation ?? [0, 0, 0],
		scale: transform.scale ?? [1, 1, 1]
	};
}

function objectKey(id) {
	return /^[A-Za-z_$][\w$]*$/.test(id) ? id : `'${id}'`;
}

export function syncRegistry(maps = loadMaps()) {
	const ids = Object.keys(maps.maps).sort((a, b) => a.localeCompare(b));
	const lines = [];
	const imports = new Set();

	lines.push('/* eslint-disable */');
	lines.push('// AUTO-GENERADO por scripts/world-sync.mjs. No editar a mano.');
	lines.push("import type { Component } from 'svelte';");
	lines.push("import { asset } from '../assets/path';");

	for (const id of ids) {
		const entry = maps.maps[id];
		const file = componentFile(entry);
		if (!fs.existsSync(file)) {
			throw new Error(
				`No existe el componente ${path.relative(process.cwd(), file)} para el mapa "${id}"`
			);
		}
		const importName = `${entry.component}Component`;
		if (imports.has(importName)) {
			throw new Error(`Dos mapas usan el mismo componente "${entry.component}"`);
		}
		imports.add(importName);
		lines.push(`import ${importName} from '../components/world/${entry.component}.svelte';`);
	}

	for (const id of ids) {
		const entry = maps.maps[id];
		const importName = `${entry.component}Physics`;
		lines.push(`import ${importName} from '../../../world/${entry.physics}';`);
	}

	lines.push('');
	lines.push(`export type WorldMapId = ${ids.map((id) => `'${id}'`).join(' | ') || 'never'};`);
	lines.push('');
	lines.push('export type WorldMapTransform = {');
	lines.push('\tposition: [number, number, number];');
	lines.push('\trotation: [number, number, number];');
	lines.push('\tscale: [number, number, number];');
	lines.push('};');
	lines.push('');
	lines.push('export type WorldMapSpawn = { x: number; y: number; z: number };');
	lines.push('');
	lines.push('export type WorldMapEntry = {');
	lines.push('\tid: WorldMapId;');
	lines.push('\tglb: string;');
	lines.push('\tcomponent: Component<any>;');
	lines.push('\tphysics: Record<string, any>;');
	lines.push('\tspawn: WorldMapSpawn;');
	lines.push('\ttransform: WorldMapTransform;');
	lines.push('\tlighting: string;');
	lines.push('\tscene: string;');
	lines.push('};');
	lines.push('');
	lines.push('export const worldMaps: Record<WorldMapId, WorldMapEntry> = {');

	ids.forEach((id, index) => {
		const entry = maps.maps[id];
		const importName = `${entry.component}Component`;
		const physicsName = `${entry.component}Physics`;
		const spawn = defaultValue(entry.spawn, { x: 0, y: 0.4, z: 0 });
		const transform = transformOf(entry);
		lines.push(`\t${objectKey(id)}: {`);
		lines.push(`\t\tid: '${id}',`);
		lines.push(`\t\tglb: asset('${entry.glb}'),`);
		lines.push(`\t\tcomponent: ${importName},`);
		lines.push(`\t\tphysics: ${physicsName},`);
		lines.push(`\t\tspawn: { x: ${spawn.x}, y: ${spawn.y}, z: ${spawn.z} },`);
		lines.push(`\t\ttransform: {`);
		lines.push(`\t\t\tposition: [${transform.position.join(', ')}],`);
		lines.push(`\t\t\trotation: [${transform.rotation.join(', ')}],`);
		lines.push(`\t\t\tscale: [${transform.scale.join(', ')}]`);
		lines.push(`\t\t},`);
		lines.push(`\t\tlighting: '${entry.lighting ?? 'global'}',`);
		lines.push(`\t\tscene: '${entry.scene ?? 'global'}'`);
		lines.push(`\t}${index < ids.length - 1 ? ',' : ''}`);
	});

	lines.push('};');

	fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });
	fs.writeFileSync(REGISTRY_PATH, `${lines.join('\n')}\n`);
	log('world:sync', `${path.relative(process.cwd(), REGISTRY_PATH)} (${ids.length} mapas)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	syncRegistry();
}
