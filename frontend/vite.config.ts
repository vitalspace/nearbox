import { rundotMultiplayerPlugin } from '@series-inc/rundot-game-sdk/vite';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');

	// El backend activo es Elysia + Bun (`backend/`). En desarrollo el cliente
	// usa el mismo origen (`ws://localhost:3000/ws`) y Vite reenvía `/ws` al
	// backend; así no hay CORS ni hace falta fijar `VITE_WS_URL` en cada equipo.
	// `BACKEND_URL` permite apuntar a otro puerto (por ejemplo 3100 si el 4000
	// está ocupado); por defecto es el 4000 documentado del backend.
	const backendUrl = env.BACKEND_URL || 'http://localhost:4000';

	return {
		// RUN.world exigía rutas relativas. El juego se sigue sirviendo como
		// bundle estático, así que mantenemos `./` para no depender de la raíz.
		base: './',
		// `import.meta.env` solo expone variables con estos prefijos. Sin
		// `PUBLIC_`, las variables documentadas en `.env.example` (contratos
		// NEP-245, Auth0) llegan como `undefined` al cliente.
		envPrefix: ['VITE_', 'PUBLIC_'],
		server: {
			// El cliente Auth0 compartido de FastAuth testnet solo acepta el
			// callback http://localhost:3000. Si el puerto está ocupado, Vite
			// debe fallar en vez de saltar a 3001 y romper el login.
			port: 3000,
			strictPort: true,
			proxy: {
				'/ws': {
					target: backendUrl,
					ws: true,
					changeOrigin: true
				},
				// Puente de audio del jukebox (`/club/stream`).
				'/club': {
					target: backendUrl,
					changeOrigin: true
				},
				// Mini-relayer de FastAuth. En producción el reverse proxy debe
				// hacer el mismo mapeo `/api/relayer/*` → backend `/relayer/*`.
				'/api/relayer': {
					target: backendUrl,
					changeOrigin: true,
					rewrite: (path) => path.replace(/^\/api/, '')
				},
				// Estadísticas de jugador (MongoDB). Mismo mapeo en producción:
				// `/api/stats/*` → backend `/stats/*`.
				'/api/stats': {
					target: backendUrl,
					changeOrigin: true,
					rewrite: (path) => path.replace(/^\/api/, '')
				},
				// Progresión de misiones y reclamos de recompensas.
				'/api/progression': {
					target: backendUrl,
					changeOrigin: true,
					rewrite: (path) => path.replace(/^\/api/, '')
				},
				// Reclamos de recompensas (mint patrocinado por misión).
				'/api/rewards': {
					target: backendUrl,
					changeOrigin: true,
					rewrite: (path) => path.replace(/^\/api/, '')
				}
			}
		},
		preview: {
			port: 3000,
			strictPort: true
		},
		ssr: {
			noExternal: ['@lucide/svelte']
		},
		// near-api-js y sus dependencias esperan `Buffer` y `global` de Node.
		// Sin estos aliases, Vite deja `Buffer` vacío y el SDK rompe en runtime.
		resolve: {
			alias: {
				buffer: 'buffer/'
			}
		},
		define: {
			global: 'globalThis'
		},
		optimizeDeps: {
			include: ['buffer']
		},
		plugins: [
			// El backend activo es Bun (`backend/`), así que por defecto el build es
			// solo estático y el cliente habla WebSocket. `RUN_ROOMS=1` reactiva el
			// port antiguo de rooms (src/server/rooms/*) para desplegar la variante
			// RUN.world que aún lo necesite.
			...(process.env.RUN_ROOMS === '1' ? [rundotMultiplayerPlugin()] : []),
			tailwindcss(),
			sveltekit({
				compilerOptions: {
					// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},

				// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
				// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
				// See https://svelte.dev/docs/kit/adapters for more information about adapters.
				adapter: adapter({
					// El sitio se genera aparte y `scripts/postbuild-relative-paths.mjs` lo
					// copia a `dist`. adapter-static borra su propio directorio de salida
					// al adaptar, y hacerlo sobre `dist` se llevaba por delante
					// `dist/server-bundle.js` y `dist/rooms.config.json`, que el plugin de
					// rooms escribe en `closeBundle` (antes de adaptar).
					pages: '.build/static',
					assets: '.build/static',
					fallback: 'index.html',
					strict: false
				}),
				paths: {
					// Rutas relativas también en el runtime: el juego vive en un
					// iframe bajo /<version>/, no en la raíz del dominio.
					relative: true
				},
				version: {
					// El chequeo de versión pide `/_app/version.json` en la raíz del
					// dominio, que bajo el subpath del host devuelve 404. El juego es
					// un bundle estático: no hay hot-update que detectar.
					pollInterval: 0
				}
			})
		]
	};
});
