/**
 * Carga perezosa del módulo `auth.ts`.
 *
 * `auth.ts` importa el polyfill de `Buffer` y los SDKs solo-browser, así que no
 * puede entrar en el grafo de SSR. Centralizar el `import()` acá evita que el
 * store de sesión y otros consumidores mantengan cada uno su propio cache.
 */
export type AuthModule = typeof import('./auth.ts');

let authModulePromise: Promise<AuthModule> | null = null;

export function loadAuthModule(): Promise<AuthModule> {
	authModulePromise ??= import('./auth.ts');
	return authModulePromise;
}
