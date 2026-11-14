import { compile } from '@tailwindcss/node';
import { Scanner } from '@tailwindcss/oxide';
import path from 'path';
import fs from 'fs';
const routes = path.join(process.cwd(), 'src/routes');
const css = fs.readFileSync(path.join(routes, 'layout.css'), 'utf8');
let t = Date.now();
const c = await compile(css, { base: routes, onDependency() {}, shouldRewriteUrls: true });
console.log('compile ms', Date.now() - t, 'root', JSON.stringify(c.root), 'sources', c.sources);
const srcs = (
	c.root === 'none'
		? []
		: c.root === null
			? [{ base: process.cwd(), pattern: '**/*', negated: false }]
			: [{ ...c.root, negated: false }]
).concat(c.sources);
t = Date.now();
const s = new Scanner({ sources: srcs });
const cands = [...s.scan()];
console.log('scan ms', Date.now() - t, 'cands', cands.length, 'files', s.files.length);
t = Date.now();
const out = c.build(cands);
console.log('build ms', Date.now() - t, 'outlen', out.length);
