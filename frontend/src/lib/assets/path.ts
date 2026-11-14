/**
 * Resolves a path from `static/` against the document directory.
 *
 * RUN.world serves the build inside an iframe that may live under a subpath.
 * Assets are resolved against `document.baseURI` (the real directory of
 * `index.html`), without using `<base href>` because RUN's CSP blocks it.
 *
 * In SSR (not used by this game) it returns a valid root-relative path.
 */
export function asset(path: string): string {
	const clean = path.replace(/^\/+/, '');

	if (typeof document === 'undefined') {
		return `/${clean}`;
	}

	return new URL(clean, document.baseURI).href;
}
