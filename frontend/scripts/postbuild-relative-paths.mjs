#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

/**
 * SvelteKit documenta que el fallback SPA usa rutas absolutas aunque
 * `paths.relative` esté activo. RUN.world sirve el juego dentro de un iframe
 * que puede estar bajo un subpath, así que reescribimos las referencias a
 * `/_app/` como `./_app/`.
 *
 * Con `<base href="./">` en `app.html`, `./_app/...` resuelve al directorio
 * real del index.html tanto en la raíz como en `/lo-que-sea/game/`.
 */
const DIST = path.resolve(process.cwd(), 'dist');
const INDEX = path.join(DIST, 'index.html');

/**
 * 1) Copia el sitio generado por adapter-static (`.build/static`) a `dist`.
 *
 * Con `RUN_ROOMS=1`, el plugin de rooms escribe `dist/server-bundle.js` y
 * `dist/rooms.config.json` en su `closeBundle`, que corre ANTES de que
 * adapter-static adapte. Como el adapter borra su propio directorio de salida,
 * apuntarlo a `dist` se llevaba por delante los dos artefactos del servidor.
 * Generando el sitio en `.build/static` y copiándolo aquí, ambos sobreviven.
 *
 * Sin `RUN_ROOMS` el build es solo estático: el backend activo es Bun, así que
 * no se exigen artefactos de rooms.
 */
const BUILD = path.resolve(process.cwd(), '.build/static');
const ROOMS_ENABLED = process.env.RUN_ROOMS === '1';
const SERVER_ARTIFACTS = ['server-bundle.js', 'rooms.config.json'];

if (!fs.existsSync(BUILD)) {
	console.error('[postbuild] No existe .build/static. ¿Falló el build?');
	process.exit(1);
}

fs.mkdirSync(DIST, { recursive: true });

// Limpia el sitio anterior sin tocar lo que el plugin de rooms dejó en dist.
for (const entry of fs.readdirSync(DIST)) {
	if (SERVER_ARTIFACTS.includes(entry)) {
		continue;
	}

	fs.rmSync(path.join(DIST, entry), { recursive: true, force: true });
}

fs.cpSync(BUILD, DIST, { recursive: true });

// Un `dist` viejo puede conservar artefactos de rooms de un build anterior.
// Sin `RUN_ROOMS=1` el sitio es estático: no deben viajar al deploy.
if (!ROOMS_ENABLED) {
	for (const file of SERVER_ARTIFACTS) {
		fs.rmSync(path.join(DIST, file), { force: true });
	}
}

// Un build con RUN_ROOMS=1 sin rooms desplegaría un juego que no puede unirse
// a ninguna sala: mejor fallar aquí que descubrirlo en `rundot deploy`
// (preflight `multiplayer-build-missing`) o, peor, en producción.
const missing = ROOMS_ENABLED
	? SERVER_ARTIFACTS.filter((file) => !fs.existsSync(path.join(DIST, file)))
	: [];

if (missing.length > 0) {
	console.error(`[postbuild] Faltan artefactos de rooms en dist: ${missing.join(', ')}`);
	process.exit(1);
}

if (!fs.existsSync(INDEX)) {
	console.error('[postbuild] No existe dist/index.html. ¿Falló el build?');
	process.exit(1);
}

let html = fs.readFileSync(INDEX, 'utf8');
const before = html;
let replacements = 0;

html = html.replace(/(href|src)="\/_app\//g, (_match, attribute) => {
	replacements += 1;
	return `${attribute}="./_app/`;
});

html = html.replace(/(['"])\/_app\//g, (_match, quote) => {
	replacements += 1;
	return `${quote}./_app/`;
});

if (html !== before) {
	fs.writeFileSync(INDEX, html);
}

const remaining = html.match(/(?:href|src)="\/_app\/|['"]\/_app\//g) ?? [];

if (remaining.length > 0) {
	console.error(`[postbuild] Quedan ${remaining.length} rutas absolutas en index.html`);
	process.exit(1);
}

console.log(`[postbuild] index.html: ${replacements} referencias /_app/ convertidas a ./_app/`);

/**
 * Vite deja las fuentes (y otros assets referenciados desde CSS) con rutas
 * absolutas `/_app/...`. Bajo un subpath esas URLs rompen, así que las
 * reescribimos como rutas relativas al propio archivo CSS.
 */
const APP_DIR = path.join(DIST, '_app');

function rewriteCssUrls() {
	if (!fs.existsSync(APP_DIR)) {
		return 0;
	}

	let converted = 0;
	const entries = fs.readdirSync(APP_DIR, { recursive: true, withFileTypes: true });

	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.endsWith('.css')) {
			continue;
		}

		const file = path.join(entry.parentPath ?? entry.path, entry.name);
		const css = fs.readFileSync(file, 'utf8');

		const next = css.replace(/url\(\s*(['"]?)\/_app\/([^)'"]+)\1\s*\)/g, (_match, quote, rest) => {
			const target = path.join(APP_DIR, rest);
			let relative = path.relative(path.dirname(file), target).split(path.sep).join('/');

			if (!relative.startsWith('.')) {
				relative = `./${relative}`;
			}

			converted += 1;
			return `url(${quote}${relative}${quote})`;
		});

		if (next !== css) {
			fs.writeFileSync(file, next);
		}
	}

	return converted;
}

const cssReplacements = rewriteCssUrls();
console.log(`[postbuild] CSS: ${cssReplacements} url(/_app/) convertidas a rutas relativas`);
