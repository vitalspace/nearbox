#!/usr/bin/env node
/**
 * The single source of truth is `/AGENTS.md` at the repo root.
 *
 * The game serves it in two places:
 *   - `/agents.md`  → `frontend/static/agents.md` (raw Markdown)
 *   - `/agents`     → `frontend/src/lib/content/agents.md` (rendered page)
 *
 * Edit the root file only. This script mirrors it into the frontend.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const SOURCE = path.join(ROOT, 'AGENTS.md');

const TARGETS = [
	path.join(ROOT, 'frontend/static/agents.md'),
	path.join(ROOT, 'frontend/src/lib/content/agents.md')
];

if (!fs.existsSync(SOURCE)) {
	console.error('[agents] Missing AGENTS.md at the repo root.');
	process.exit(1);
}

const doc = fs.readFileSync(SOURCE, 'utf8');
let written = 0;

for (const target of TARGETS) {
	fs.mkdirSync(path.dirname(target), { recursive: true });

	if (fs.existsSync(target) && fs.readFileSync(target, 'utf8') === doc) {
		continue;
	}

	fs.writeFileSync(target, doc);
	written += 1;
	console.log(`[agents] synced ${path.relative(ROOT, target)}`);
}

if (written === 0) {
	console.log('[agents] copies already up to date');
}
