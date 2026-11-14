---
id: SPEC-036
titulo: "Inicio de sesión con Google (FastAuth) y cuenta NEAR en el arranque del juego"
estado: en-progreso
prioridad: alta
creado: 2026-11-13
actualizado: 2026-11-13
responsable: opencode
etiquetas:
  [
    auth,
    google,
    auth0,
    fast-auth,
    near,
    testnet,
    mpc,
    relayer,
    svelte,
    sveltekit,
    vite,
    splash,
    guardian,
    elysia,
    bun,
  ]
depende_de: [SPEC-019]
bloquea: []
estimacion: "10h"
---

# SPEC-036 — Inicio de sesión con Google (FastAuth) y cuenta NEAR en el arranque del juego

## 1. Contexto

El juego se construye como SPA estática (`frontend/src/routes/+layout.ts`:
`ssr = false`, `prerender = false`) con `@sveltejs/adapter-static`. Ya **no se
usa RUN.world**: el frontend se sirve como sitio estático propio y habla con el
backend Elysia + Bun por HTTP/WebSocket. Hoy no existe ningún inicio de sesión:
al abrir el juego se crea un perfil local (`rw:profile:v1`) y el cliente se
conecta al WebSocket del backend sin identificarse (`SPEC-019`).

El usuario quiere que, antes de jugar, el jugador se autentique con su cuenta de
Google y obtenga una cuenta NEAR propia sin wallet, usando FastAuth:

1. Google vía Auth0 deriva una clave MPC de la identidad.
2. La cuenta NEAR se genera sola como `t-nearbox-<10 hex>.testnet`: el sufijo
   se deriva de la public key MPC, así la misma identidad obtiene siempre el
   mismo nombre y no hay nada que elegir. Las cuentas antiguas
   `t-<sha256(publicKey)[0..12]>.testnet` y los handles elegidos a mano se
   siguen aceptando y adoptando.
3. Si la cuenta no existe, se crea con un mini-relayer usando esa clave como
   única access key. Solo si el nombre automático ya pertenece a otra key se
   muestra el formulario para elegir otro.
4. Por ahora la cuenta se crea **sin fondear**: el jugador no recibe NEAR. El
   funding queda para un spec posterior.

Ya existe una implementación de referencia funcional en otro proyecto local:

- `/home/vital/Desktop/near/market/src/lib/near/auth.ts`
- `/home/vital/Desktop/near/market/src/lib/near/session.svelte.ts`
- `/home/vital/Desktop/near/market/src/lib/near/sdk.ts`
- `/home/vital/Desktop/near/market/src/lib/components/Guardian.svelte`
- `/home/vital/Desktop/near/market/src/lib/server/relayer.ts`

Esa implementación **no se puede copiar tal cual**: el market tiene SSR y rutas
`/api/relayer/*` de SvelteKit, mientras que este juego es estático y su backend
real es Elysia + Bun (`backend/`). Además, el cliente Auth0 compartido de
FastAuth testnet solo acepta callbacks en `http://localhost:3000`, así que el
dev server del frontend debe dejar de usar el puerto implícito de Vite.

Flujo visual pedido:

1. Primero se ve el **splash real del juego** (`LoadingScreen.svelte`), que ya
   existe y precarga los GLB.
2. Cuando los assets están listos, si no hay sesión se monta `Guardian.svelte`
   a pantalla completa y **no se puede jugar** hasta iniciar sesión.
3. Si ya hay una sesión de Google persistida, se restaura en silencio y el
   jugador entra directo: no se le vuelve a pedir login.

## 2. Objetivo

Añadir autenticación con Google (FastAuth/Auth0) al arranque del juego, crear o
recuperar la cuenta NEAR del jugador en testnet mediante un mini-relayer en el
backend Elysia, crearla automáticamente como `t-nearbox-<10 hex>.testnet` sin
pedirle un nombre y bloquear la partida con `Guardian` hasta que exista una
sesión válida, respetando las sesiones ya iniciadas. El dev server del frontend pasa a
`http://localhost:3000` de forma estricta.

## 3. Alcance

**Incluye**

- Instalar en `frontend`:
  - `@auth0/auth0-spa-js@^2.30.0`
  - `@fast-auth-near/browser-sdk@^1.4.2`
  - `@fast-auth-near/javascript-provider@^1.4.1`
  - `buffer@^6.0.3`
  - `lucide-svelte@^1.0.1`
  - `near-api-js@5.1.1`
- Polyfill de `Buffer` en el browser y ajustes de Vite (`buffer`, `global`,
  `optimizeDeps`).
- Cambiar el dev server (y el preview) del frontend a `localhost:3000` con
  `strictPort: true`.
- Módulo NEAR/FastAuth en `frontend/src/lib/near/` con carga perezosa de SDKs
  (nunca evaluados en SSR).
- Módulo `near/handle.ts` con normalización, validación y derivación
  `t-<handle>.testnet` (sigue disponible para el fallback manual).
- Store de sesión con runes (`authSession`) con restauración silenciosa,
  login, logout, handle automático y creación/verificación de cuenta.
- `Guardian.svelte` como puerta de entrada, montado **después del splash**, con
  estado de creación automática y formulario de handle solo como fallback.
- Gating de la conexión WebSocket del lobby: no se conecta hasta tener sesión.
- Mini-relayer `POST /relayer/create-account` en el backend Elysia, **sin
  transferir saldo** a la cuenta nueva.
- Variables de entorno del relayer y su documentación.
- Botón de logout en los ajustes del juego.

**No incluye**

- **Fondear cuentas**: no se transfiere NEAR a la cuenta nueva. Queda para un
  spec posterior. La cuenta se crea con saldo `0` y solo con su access key.
- Firmar transacciones del juego en cadena (`sign-tx`, NFT, tokens, misiones
  on-chain). La cuenta se crea, pero el juego sigue persistiendo en
  `localStorage`.
- Migrar el perfil local (`playerId`, alias, skins, misiones) a la cuenta NEAR.
- Otros proveedores de login (email/password, wallet selector, Apple, etc.).
- Configurar un cliente Auth0 de producción. Se documenta como pregunta abierta.
- Cambiar el puerto del backend (sigue en `4000`).
- Cualquier dependencia de RUN.world o de un iframe de RUN.world.

## 4. Requisitos

### Funcionales

| ID    | Requisito                                                                                                                                                                                                                              | Prioridad |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| RF-1  | El dev server del frontend escucha en `http://localhost:3000` y falla si el puerto está ocupado (`strictPort`).                                                                                                                        | alta      |
| RF-2  | `http://localhost:3000` debe ser el origen usado para el callback de Auth0. No se admite `127.0.0.1` ni puertos alternativos.                                                                                                          | alta      |
| RF-3  | Al abrir el juego se muestra primero el splash existente; el `Guardian` no debe taparlo ni montarse antes de que termine la precarga.                                                                                                  | alta      |
| RF-4  | Si no hay sesión, tras el splash se muestra `Guardian` a pantalla completa con el botón "Continue with Google" y el juego queda bloqueado.                                                                                             | alta      |
| RF-5  | Si existe una sesión Auth0 persistida, se restaura sin mostrar el login y el jugador entra directo al juego.                                                                                                                           | alta      |
| RF-6  | La sesión Auth0 se guarda en `localStorage` con refresh tokens; si `localStorage` no está disponible se usa memoria y se acepta que la sesión no persista.                                                                             | alta      |
| RF-7  | El login abre el popup de Auth0 y, al volver, obtiene el signer MPC y la `publicKey` ed25519.                                                                                                                                          | alta      |
| RF-8  | Para una identidad nueva, el `accountId` se genera automáticamente como `t-nearbox-<10 hex>.testnet`, derivado de la `publicKey` (misma identidad → mismo nombre), sin pedirle nada al jugador.                                        | alta      |
| RF-9  | Si la cuenta no existe en cadena, el cliente pide al backend `POST /api/relayer/create-account` con `{ accountId, publicKey }`.                                                                                                        | alta      |
| RF-10 | El relayer valida el formato de handle legible y el antiguo `t-<12 hex>.testnet`, más `ed25519:<base58>`, y crea la cuenta con esa clave como única access key, **sin transferirle NEAR**.                                             | alta      |
| RF-11 | Tras crear la cuenta, el cliente hace polling corto contra el RPC hasta verla (`final`) y solo entonces desbloquea el juego.                                                                                                           | alta      |
| RF-12 | Si la cuenta ya existe y contiene la `publicKey` del jugador, el flujo es idempotente y no falla: `Guardian` entra directo sin volver a crearla.                                                                                       | alta      |
| RF-13 | El cliente no llama a `lobby.connect()` hasta tener sesión y cuenta listas; al hacer logout se desconecta y se vuelve a `Guardian`.                                                                                                    | alta      |
| RF-14 | Los errores de login, popup cerrado, RPC o relayer se muestran en `Guardian` con opción de reintentar, sin exponer stack traces.                                                                                                       | media     |
| RF-15 | Los ajustes del juego y un botón en el HUD superior derecho (junto al de ajustes) muestran la cuenta NEAR y permiten cerrar sesión.                                                                                                    | media     |
| RF-16 | Ningún SDK de FastAuth, Auth0 ni `near-api-js` se evalúa durante SSR/prerender; se importan dinámicamente solo en el browser.                                                                                                          | alta      |
| RF-17 | El relayer serializa sus transacciones para no chocar el nonce de su única access key.                                                                                                                                                 | alta      |
| RF-18 | El endpoint del relayer es idempotente ante `AccountAlreadyExists` solo si la cuenta contiene la misma `publicKey`; si tiene otra, responde `409` y no reemplaza keys.                                                                 | alta      |
| RF-19 | El handle usado se guarda en `localStorage` por `publicKey`. Si el nombre automático ya existe con la misma key se reutiliza; si existe una cuenta antigua `t-<12 hex>.testnet` con la key del jugador, se adopta sin pedir handle.    | alta      |
| RF-20 | El formulario de handle solo aparece como fallback si el nombre automático ya pertenece a otra key; sugiere el alias local, muestra el `accountId` resultante, valida en vivo y deshabilita el submit mientras el handle sea inválido. | media     |

### No funcionales

| ID    | Requisito                                                                                         | Criterio                                                                   |
| ----- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| RNF-1 | El splash nunca se reemplaza por una pantalla en blanco.                                          | Desde `load` hasta assets+sesión resueltos siempre hay un overlay visible. |
| RNF-2 | Restaurar sesión no debe añadir más de ~1 s perceptible al arranque normal.                       | La comprobación corre en paralelo con la precarga de GLB.                  |
| RNF-3 | El login debe funcionar en Chrome/Firefox/Safari actuales con popups permitidos.                  | Caso manual en los tres navegadores.                                       |
| RNF-4 | El relayer nunca expone ni loguea `RELAYER_PRIVATE_KEY`.                                          | `grep` de logs y revisión de respuestas.                                   |
| RNF-5 | El endpoint de creación de cuentas tiene rate limit básico para evitar abuso del gas del relayer. | Máximo 5 intentos/minuto por IP; rechazo `429`.                            |
| RNF-6 | `bun run check`, `bun run lint` y `bunx tsc --noEmit` (backend) pasan sin errores.                | Ver sección 8.                                                             |
| RNF-7 | El build estático sigue funcionando con rutas relativas y sin depender de rutas API de SvelteKit. | `bun run build` y `dist/index.html` generado.                              |

## 5. Criterios de aceptación

- [x] CA-1: `cd frontend && bun run dev` abre en `http://localhost:3000`; si el puerto está ocupado, el comando falla con error claro en vez de usar `3001`.
- [x] CA-2: Con `localStorage` limpio, al abrir el juego se ve el splash y, al terminar la precarga, aparece `Guardian`; el HUD, los controles y el jugador no están activos.
- [x] CA-3: Antes de iniciar sesión no se abre el WebSocket `/ws` (verificable en la pestaña Network y en los logs del backend).
- [ ] CA-4: Al pulsar "Continue with Google" se abre el popup de Auth0 en `login.testnet.fast-auth.com` y, tras autenticarse, el juego muestra "Creating your NEAR account…" y luego entra.
- [x] CA-5: La cuenta creada existe en testnet con el handle automático (`t-nearbox-<10 hex>.testnet`) y una única access key `ed25519:...` igual a la `publicKey` del jugador. Su saldo es `0` (no se fondea).
- [ ] CA-6: Al recargar la página con la sesión iniciada, el splash pasa directo al juego sin mostrar `Guardian`.
- [ ] CA-7: Al cerrar y reabrir la pestaña, la sesión persiste y no se vuelve a pedir login.
- [ ] CA-8: Al hacer logout desde ajustes, se borra la sesión, se desconecta el WebSocket y reaparece `Guardian`; al recargar sigue sin sesión.
- [ ] CA-9: Si el relayer está caído o mal configurado, `Guardian` muestra un error legible y un botón "Reintentar"; el juego no se desbloquea.
- [ ] CA-10: En una ventana privada con storage bloqueado, el login funciona en memoria y se documenta que la sesión se pierde al recargar.
- [x] CA-11: `cd frontend && bun run check && bun run lint` y `cd backend && bunx tsc --noEmit` terminan sin errores.
- [x] CA-12: `cd frontend && bun run build` genera el sitio estático sin incluir llamadas a rutas de API de SvelteKit.
- [ ] CA-13: Con una identidad nueva, tras el login la cuenta se crea sola como `t-nearbox-<10 hex>.testnet` sin mostrar ningún formulario; el nombre visible en Ajustes → Profile coincide con el generado.
- [x] CA-14: Si el handle ya existe con otra `publicKey`, el relayer responde `409` sin crear ni modificar la cuenta (el mensaje se muestra en `Guardian`).
- [ ] CA-15: Al reiniciar el flujo con la misma identidad, el mismo `t-nearbox-<10 hex>.testnet` se reutiliza y no se vuelve a crear; una cuenta antigua `t-<12 hex>.testnet` se adopta automáticamente.

## 6. Archivos relevantes

| Ruta                                                  | Acción    | Motivo                                                                                                                                                    |
| ----------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/package.json`                               | modificar | Añadir las seis dependencias del flujo FastAuth/Auth0.                                                                                                    |
| `frontend/vite.config.ts`                             | modificar | `server.port/preview.port = 3000` + `strictPort`, proxy `/api/relayer`, alias `buffer`, `global`, `optimizeDeps`.                                         |
| `frontend/.env.example`                               | modificar | Actualizar `5173` → `3000` en los comentarios y documentar `PUBLIC_AUTH0_*` si se usan.                                                                   |
| `frontend/src/lib/polyfills.ts`                       | crear     | Exponer `Buffer` global para los SDKs.                                                                                                                    |
| `frontend/src/lib/near/config.ts`                     | crear     | Red, RPC, contratos FastAuth/MPC, Auth0, prefijo/sufijo de cuenta y storage del handle.                                                                   |
| `frontend/src/lib/near/handle.ts`                     | crear     | Normalización, validación y `accountIdFromHandle` (`t-<handle>.testnet`).                                                                                 |
| `frontend/src/lib/near/bytes.ts`                      | crear     | Utilidades base64/utf8 compartidas por RPC y relayer (si se implementa `sign-tx` a futuro).                                                               |
| `frontend/src/lib/near/rpc.ts`                        | crear     | `jsonRpc`, `view`, `getAccountState`, `getAccessKeys`, URLs del explorer.                                                                                 |
| `frontend/src/lib/near/sdk.ts`                        | crear     | Carga perezosa única de `@fast-auth-near/*`, `@auth0/auth0-spa-js` y `near-api-js`.                                                                       |
| `frontend/src/lib/near/auth.ts`                       | crear     | Login/logout, signer, `publicKey`, `resolveAccount`, handle y creación de cuenta.                                                                         |
| `frontend/src/lib/near/auth-loader.ts`                | crear     | `import()` cacheado de `auth.ts` para que SSR nunca lo evalúe.                                                                                            |
| `frontend/src/lib/near/errors.ts`                     | crear     | Mensajes humanos para popup cerrado, RPC, relayer y rate limit.                                                                                           |
| `frontend/src/lib/state/auth.svelte.ts`               | crear     | Store `authSession` con `loading`, `loggedIn`, `accountId`, `publicKey`, `needsHandle`, `error`, `init`, `login`, `logout`, `loadAccount`, `claimHandle`. |
| `frontend/src/lib/components/Guardian.svelte`         | crear     | Puerta de login a pantalla completa y formulario de handle con validación y reintento.                                                                    |
| `frontend/src/routes/+layout.svelte`                  | modificar | Llamar `authSession.init()` una sola vez al montar el layout.                                                                                             |
| `frontend/src/lib/GamePage.svelte`                    | modificar | Mantener el splash primero, montar `Guardian` después y conectar el lobby solo con sesión.                                                                |
| `frontend/src/lib/Canvas.svelte`                      | modificar | Props `sceneEnabled` y `splashHold` para no montar la escena ni ocultar el splash antes de tiempo.                                                        |
| `frontend/src/lib/components/ui/LoadingScreen.svelte` | modificar | Soportar `hold`/`holdLabel` para seguir visible mientras se restaura la sesión.                                                                           |
| `frontend/src/lib/components/ui/SettingsMenu.svelte`  | modificar | Mostrar la cuenta NEAR y el botón de logout.                                                                                                              |
| `backend/package.json`                                | modificar | Añadir `near-api-js@5.1.1` para el relayer.                                                                                                               |
| `backend/src/server/relayer.ts`                       | crear     | Validación, firma, `create_account` (sin funding), serialización y broadcast JSON-RPC.                                                                    |
| `backend/src/routes/relayer.ts`                       | crear     | Plugin Elysia con `POST /relayer/create-account` y rate limit.                                                                                            |
| `backend/src/index.ts`                                | modificar | Registrar el plugin del relayer antes de `.listen()`.                                                                                                     |
| `backend/.env.example`                                | crear     | Documentar `RELAYER_ACCOUNT_ID`, `RELAYER_PRIVATE_KEY`, red y RPC.                                                                                        |
| `backend/.gitignore`                                  | modificar | Ignorar `.env` además de los `.env.*.local` actuales.                                                                                                     |

## 7. Plan de implementación

### Fase 1 — Puerto 3000 y dependencias

- [x] Paso 1: En `frontend/package.json`, añadir exactamente:

  ```json
  "@auth0/auth0-spa-js": "^2.30.0",
  "@fast-auth-near/browser-sdk": "^1.4.2",
  "@fast-auth-near/javascript-provider": "^1.4.1",
  "buffer": "^6.0.3",
  "lucide-svelte": "^1.0.1",
  "near-api-js": "5.1.1"
  ```

- [x] Paso 2: Ejecutar `cd frontend && bun install` y confirmar que el lockfile
      queda actualizado.
- [x] Paso 3: En `frontend/vite.config.ts`:
  - `server.port = 3000`, `server.strictPort = true`.
  - `preview.port = 3000`, `preview.strictPort = true`.
  - En `server.proxy`, añadir:

    ```ts
    '/api/relayer': {
      target: backendUrl,
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api/, '')
    }
    ```

  - `resolve.alias = { buffer: 'buffer/' }`.
  - `define = { global: 'globalThis' }`.
  - `optimizeDeps.include = ['buffer']`.
- [x] Paso 4: Actualizar comentarios de `frontend/vite.config.ts` y
      `frontend/.env.example` que mencionan `ws://localhost:5173/ws`.
- [x] Paso 5: Crear `frontend/src/lib/polyfills.ts` con el polyfill de `Buffer`
      (`globalThis.Buffer ??= Buffer`).

### Fase 2 — Núcleo NEAR/FastAuth (browser)

- [x] Paso 1: Crear `frontend/src/lib/near/config.ts` con:
  - `NEAR_NETWORK_ID = 'testnet'`.
  - `NEAR_RPC_URL = 'https://rpc.testnet.fastnear.com'`.
  - `AUTH0_DOMAIN = 'login.testnet.fast-auth.com'`.
  - `AUTH0_CLIENT_ID = 'np8paqIpMWmNbzT4xAvOOapZBjsOpptl'` (cliente compartido de
    FastAuth testnet; permitir override con `PUBLIC_AUTH0_CLIENT_ID`).
  - `FAST_AUTH_CONTRACT_ID = 'fast-auth.testnet'`.
  - `MPC_CONTRACT_ID = 'v1.signer-prod.testnet'`.
  - `ACCOUNT_PREFIX = 't-'`, `ACCOUNT_SUFFIX = '.testnet'`,
    `ACCOUNT_HASH_HEX_LENGTH = 12`, `AUTO_HANDLE_PREFIX = 'nearbox-'`,
    `AUTO_HANDLE_ID_LENGTH = 10`, `HANDLE_MIN_LENGTH = 3`,
    `HANDLE_MAX_LENGTH = 20`, `HANDLE_STORAGE_PREFIX = 'fastauth:handle:'`.
  - Sin `NEW_ACCOUNT_FUNDING_NEAR` ni ninguna constante de transferencia: el
    funding se implementará en otro spec.
- [x] Paso 2: Crear `bytes.ts` y `rpc.ts` siguiendo la implementación del market.
      `getAccountState` debe reconocer `UNKNOWN_ACCOUNT` y devolver
      `{ exists: false }`. Añadir `getAccessKeys` para verificar que una cuenta
      existente contiene la key del jugador.
- [x] Paso 3: Crear `sdk.ts` con un único `loadAuthSdk()` que haga
      `Promise.all` de los cuatro imports dinámicos. No importar nada de forma
      estática.
- [x] Paso 4: Crear `auth.ts`:
  - `import '#lib/polyfills.ts'`.
  - `if (!browser) throw ...` en `initAuth`.
  - Instanciar `JavascriptProvider` y reemplazar su `client` por un
    `Auth0Client` con `cacheLocation: 'localstorage'` (o `'memory'` si
    `storageWorks()` falla) y `useRefreshTokens: true`.
  - `connect()` de `near-api-js` y `FastAuthClient`.
  - Exportar `login`, `logout`, `isLoggedIn`, `getSigner`, `getPublicKey`,
    `deriveLegacyHandle`, `deriveAutoHandle`, `resolveAccount`,
    `createAccountWithHandle`.
- [x] Paso 5: Crear `handle.ts` con `normalizeHandle`, `isValidHandle`,
      `accountIdFromHandle` y `HANDLE_RULES` (sin importar SDKs).
- [x] Paso 6: En `resolveAccount`, aplicar este orden: handle guardado en
      `localStorage` para la `publicKey`; cuenta antigua
      `t-<12 hex>.testnet` adoptada si contiene la key; si no, handle
      automático `t-nearbox-<10 hex>` derivado de la `publicKey`, creado y
      guardado sin intervención. Solo si ese nombre pertenece a otra key,
      devolver `needs-handle`.
- [x] Paso 7: En `ensureAccountForHandle`, consultar `getAccessKeys`; si existe
      con la misma key reutilizarla, si existe con otra lanzar error de nombre
      ocupado; si no existe, llamar al relayer y hacer polling de 25 × 300 ms.
- [x] Paso 8: Crear `auth-loader.ts` con un `import()` cacheado de `auth.ts`.
- [x] Paso 9: Crear `errors.ts` con mensajes para: popup cerrado, popup
      bloqueado, 429 del RPC, relayer no configurado, nombre ocupado, timeout de
      cuenta y error de red.

### Fase 3 — Store de sesión y Guardian

- [x] Paso 1: Crear `auth.svelte.ts` con la clase `AuthSession` descrita en el
      contexto, usando `$state` y un `init()` idempotente:
  - `init()`: `loading = true`, `isLoggedIn()`, si hay sesión
    `loadAccount()`, y al final `loading = false`.
  - `login()`: llama al SDK, marca `loggedIn = true` y luego `loadAccount()`.
  - `loadAccount()`: `resolveAccount()` con `accountCreating = true`; si la
    resolución es `needs-handle`, activa `needsHandle` sin error.
  - `claimHandle(handle)`: crea/recupera la cuenta con el handle elegido y
    limpia `needsHandle`.
  - `logout()`: cierra el SDK y limpia todas las propiedades, incluido
    `needsHandle`.
- [x] Paso 2: Crear `Guardian.svelte` (basado en el del market):
  - Fondo a pantalla completa, tarjeta centrada y botón "Continue with Google".
  - Estado de carga "Conectando…".
  - Estado "Creating your NEAR account…" mientras `accountCreating`.
  - Estado de error con `role="alert"` y botón "Reintentar".
  - Si hay sesión pero `needsHandle` (fallback por colisión del nombre
    automático), formulario de handle: input con prefijo `t-` y sufijo
    `.testnet`, sugerencia desde `playerProfile.alias`, preview del `accountId`,
    reglas visibles, submit deshabilitado si es inválido y opción
    "Use another Google account".
  - Si `authSession.loggedIn && authSession.accountId`, renderiza
    `{@render children()}`.
  - Bloquear doble click con `busy`.
  - Adaptar textos al tema del juego (Monster Village) sin cambiar la lógica.
- [x] Paso 3: En `+layout.svelte`, importar `onMount` y llamar
      `authSession.init()` una sola vez.
- [x] Paso 4: En `GamePage.svelte`:
  - `const authReady = $derived(!authSession.loading);`
  - `const canPlay = $derived(authReady && authSession.loggedIn && Boolean(authSession.accountId));`
  - Pasar `splashHold={!authReady}` y `sceneEnabled={canPlay}` a `<Canvas />`.
  - Mantener `playerSettings.init()`, `playerProfile.init()`, `missions.init()`,
    `npcs.init()`, `stats.init()` y `cosmetics.init()` en `onMount`.
  - Sacar `lobby.connect()` del `onMount` y hacerlo en un `$effect` solo cuando
    `canPlay`; al pasar a `false`, llamar `lobby.disconnect()`.
  - Renderizar todo el HUD y las ventanas actuales dentro de
    `<Guardian>{...}</Guardian>`, y montar `Guardian` solo cuando
    `gameReady && authReady`.
- [x] Paso 5: En `Canvas.svelte`, añadir props `sceneEnabled = true` y
      `splashHold = false`; montar `<World>`/`<Scene>` solo con
      `ready && sceneEnabled`; pasar `hold={splashHold}` a `LoadingScreen`.
- [x] Paso 6: En `LoadingScreen.svelte`, añadir `hold` y `holdLabel` (por
      defecto "Checking your session…"). `visible = !ready || hold`; si `hold` y
      los assets ya están listos, mostrar el `holdLabel`.
- [x] Paso 7: En `SettingsMenu.svelte`, en la pestaña `profile`, mostrar
      `authSession.accountId` (enlace al explorer) y un botón "Sign out" que
      llame `authSession.logout()`.

### Fase 4 — Mini-relayer en el backend Elysia

- [x] Paso 1: `cd backend && bun add near-api-js@5.1.1`.
- [x] Paso 2: Crear `backend/src/server/relayer.ts`:
  - Config desde `process.env`: `RELAYER_ACCOUNT_ID`,
    `RELAYER_PRIVATE_KEY`, `NEAR_NETWORK_ID` (default `testnet`) y
    `NEAR_RPC_URL` (default `https://rpc.testnet.fastnear.com`).
  - `InMemoryKeyStore` + `connect()` + `Account`.
  - `assertCreateAccountInput`: `accountId` con regex
    `^t-(?:[0-9a-f]{12}|[a-z0-9](?:[a-z0-9-]{1,18}[a-z0-9])?)\.testnet$`
    (handle legible o formato antiguo) y `publicKey` con
    `^ed25519:[1-9A-HJ-NP-Za-km-z]{40,60}$`.
  - Serializar envíos con una cadena de promesas (una sola access key).
  - `create_account` contra la cuenta raíz `testnet` con
    `new_account_id`, `new_public_key`, 300 TGas y depósito 0.
  - **Sin transferencia posterior**: la cuenta queda con saldo `0`. No añadir
    `transfer` ni `NEW_ACCOUNT_FUNDING_NEAR`.
  - Broadcast por JSON-RPC `send_tx` usando `encodeTransaction` (evitar el
    problema de doble copia de `@near-js/transactions`).
  - Si la cuenta ya existe, consultar sus access keys: éxito idempotente solo
    si contiene la misma `publicKey`; si no, `409`.
  - Nunca loguear la clave privada.
- [x] Paso 3: Crear `backend/src/routes/relayer.ts` como plugin Elysia:
  - `POST /relayer/create-account`.
  - Rate limit simple en memoria (5/min por IP).
  - `400` para input inválido, `409` para nombre ocupado, `429` para rate
    limit, `502` para fallo upstream, `200` con `{ hash }` o
    `{ alreadyExists: true }`.
- [x] Paso 4: Registrar el plugin en `backend/src/index.ts` antes de `.listen()`.
- [x] Paso 5: Crear `backend/.env.example` y añadir `.env` a
      `backend/.gitignore`.
- [x] Paso 6: Documentar en `backend/README.md` el endpoint y las variables.

### Fase 5 — Integración y limpieza

- [x] Paso 1: Verificar que los imports de `auth.ts` solo ocurren vía
      `auth-loader.ts` / `sdk.ts` dinámico.
- [x] Paso 2: Revisar que `Guardian` no se muestre antes del splash ni parpadee
      durante la restauración de sesión.
- [x] Paso 3: Revisar el gating de `lobby.connect` y el reset al hacer logout.
- [x] Paso 4: Actualizar la documentación de puertos en `frontend/.env.example`,
      `frontend/vite.config.ts` y este spec.
- [x] Paso 5: Ejecutar verificaciones y completar la tabla de progreso.

## 8. Verificación

```bash
# Frontend
cd frontend && bun install
cd frontend && bun run check
cd frontend && bun run lint
cd frontend && bun run build

# Backend
cd backend && bun install
cd backend && bunx tsc --noEmit
```

Casos manuales:

1. **Puerto**: ejecutar `cd frontend && bun run dev`; debe imprimir
   `http://localhost:3000`. Con otro proceso en 3000, debe fallar sin cambiar de
   puerto.
2. **Splash primero**: con `localStorage` limpio, abrir `http://localhost:3000`.
   Se ve el splash de Monster Village; recién al terminar aparece `Guardian`.
3. **Sin conexión anónima**: antes de iniciar sesión, en DevTools → Network no
   debe existir un WebSocket a `/ws`; el backend no debe registrar un `join`.
4. **Login nuevo**: pulsar "Continue with Google", completar Auth0 y verificar:
   mensaje de creación, aparición del HUD y conexión WebSocket.
5. **Cuenta on-chain**: copiar el `accountId` mostrado en ajustes y abrirlo en
   `https://testnet.nearblocks.io/address/<accountId>`; debe existir y tener la
   key `ed25519:...` del jugador. El saldo debe ser `0` (no se fondea).
6. **Sesión respetada**: recargar la pestaña; el splash debe pasar directo al
   juego sin `Guardian`.
7. **Persistencia entre pestañas**: cerrar y abrir de nuevo el navegador; la
   sesión debe seguir activa.
8. **Logout**: desde ajustes, cerrar sesión; debe aparecer `Guardian`, el
   WebSocket debe desconectarse y al recargar no debe haber sesión.
9. **Relayer caído**: detener el backend o romper `RELAYER_PRIVATE_KEY`; el
   login debe mostrar un error legible y permitir reintentar.
10. **Storage bloqueado**: ventana privada con `localStorage` bloqueado; el
    login debe funcionar en memoria y volver a pedir sesión al recargar.
11. **Popup cerrado**: cerrar el popup de Auth0; `Guardian` debe mostrar el
    error sin quedar en estado `busy`.
12. **Rate limit**: hacer 6 llamadas seguidas a
    `POST /api/relayer/create-account`; la sexta debe responder `429`.
13. **Cuenta nueva**: tras el primer login, comprobar que la cuenta se crea
    sola como `t-nearbox-<10 hex>.testnet`, sin formulario, y que al recargar o
    entrar desde otro navegador con la misma cuenta de Google se recupera el
    mismo nombre.
14. **Handle ocupado**: pedir `POST /relayer/create-account` con un `accountId`
    ya existente y una `publicKey` distinta; debe responder `409` y no modificar
    la cuenta.
15. **Compatibilidad legacy**: con una identidad cuya cuenta
    `t-<12 hex>.testnet` ya existe, el login debe entrar directo sin pedir
    handle.

## 9. Riesgos y mitigaciones

| Riesgo                                                                                         | Impacto | Mitigación                                                                                                                                         |
| ---------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| El cliente Auth0 compartido solo permite `http://localhost:3000`; cualquier otro puerto falla. | alto    | `strictPort: true` en `3000`; documentar que se abra con `localhost`, no `127.0.0.1`.                                                              |
| No existe un cliente Auth0 de producción con un dominio/callback propio.                       | alto    | Pregunta abierta; por ahora solo desarrollo local. Configurar un cliente Auth0 propio cuando se defina el dominio de despliegue.                   |
| `adapter-static` no puede ejecutar rutas API de SvelteKit como hace el market.                 | alto    | El relayer vive en Elysia y el cliente llama por `/api/relayer` (proxy en dev y reverse proxy en prod).                                            |
| `near-api-js` y los SDKs FastAuth rompen en SSR por `.mjs`/`Buffer`.                           | medio   | Imports 100% dinámicos + `polyfills.ts` + `ssr.noExternal`/alias de Vite.                                                                          |
| El nombre de cuenta es permanente y no se puede renombrar en NEAR.                             | alto    | Generarlo automáticamente desde la `publicKey` (misma identidad → mismo nombre) para que el jugador no tenga que recordarlo ni confirmarlo.        |
| El nombre automático puede estar ocupado por otra identidad.                                   | alto    | Consultar access keys antes de crear; el relayer responde `409` y `Guardian` muestra el formulario de fallback para elegir otro.                   |
| El jugador borra `localStorage` o entra desde otro dispositivo.                                | medio   | El handle es determinista desde la `publicKey`: se recupera la misma cuenta sin depender del storage; el nombre visible está en Ajustes → Profile. |
| Las cuentas antiguas `t-<12 hex>.testnet` ya existen y no se pueden renombrar.                 | medio   | Mantener el regex y la adopción legacy; nunca recrear ni migrar cuentas existentes.                                                                |
| El relayer puede ser abusado para crear cuentas y gastar su saldo en gas.                      | alto    | Validar formato, rate limit por IP, monitorear el saldo del relayer y rotar la clave si hay abuso.                                                 |
| La cuenta se crea sin fondos y no puede pagar gas para firmar transacciones.                   | medio   | Es intencional por ahora: el funding queda para un spec posterior. Documentarlo y no prometer transacciones on-chain todavía.                      |
| El nonce del relayer se desincroniza con requests paralelos.                                   | alto    | Serializar todo el trabajo con una cadena de promesas y crear una `Account` nueva por transacción.                                                 |
| La sesión expira y el usuario cree que "perdió" la cuenta.                                     | medio   | `useRefreshTokens` + `localStorage`; al expirar, `Guardian` pide login de nuevo y el `accountId` se recupera igual.                                |
| El splash se oculta antes de saber si hay sesión, provocando un flash de login.                | medio   | `splashHold` mantiene el splash hasta que `authSession.loading` sea `false`.                                                                       |
| El usuario no tiene popups permitidos.                                                         | medio   | Detectar el error y mostrar instrucciones claras de "permitir popups" y reintentar.                                                                |
| `lucide-svelte` duplica `@lucide/svelte` ya instalado.                                         | bajo    | Instalarlo por pedido explícito, pero usar `@lucide/svelte` en componentes nuevos para no mezclar estilos.                                         |

## 10. Preguntas abiertas

- [ ] ¿Qué cliente/domain de Auth0 se usará en producción? El cliente compartido
      de testnet solo acepta `localhost:3000`.
- [ ] ¿Cuándo se implementará el funding de las cuentas? Por ahora queda
      explícitamente fuera de alcance.
- [x] ¿El alias del jugador debe pasar a ser el `accountId` de NEAR o se mantiene
      el alias local actual? → Se usa un handle legible independiente
      (`t-<handle>.testnet`), sugerido desde el alias pero confirmado por el
      jugador; el alias local sigue siendo editable y no se acopla a la cuenta.
- [ ] ¿Se implementará `sign-tx` ahora o en un spec posterior? (Fuera de alcance
      de este spec.)
- [ ] ¿Hay que migrar `playerId`/progreso local a la cuenta NEAR en el futuro?
- [ ] ¿Se acepta que en modo privado la sesión no persista entre recargas?

## 11. Decisiones y notas

- **El splash manda**: `GamePage` no monta `Guardian` hasta `gameReady`, y
  `LoadingScreen` se mantiene con `hold` mientras `authSession` aún está
  resolviendo. Así nunca se ve una pantalla en blanco ni un login prematuro.
- **La escena no se monta antes del login**: `Canvas` recibe `sceneEnabled` y no
  crea el mundo Rapier/Threlte hasta que hay sesión y cuenta. Esto evita que el
  jugador aparezca en el lobby antes de autenticarse.
- **El lobby no se conecta antes del login**: `lobby.connect()` se mueve a un
  `$effect` que depende de `canPlay`; el `onMount` solo inicializa stores
  locales.
- **Relayer en Elysia, no en SvelteKit**: el frontend es estático; el backend
  Bun ya es el servicio autoritativo y es el lugar natural para la clave del
  relayer. El cliente usa `/api/relayer/*` para no depender de CORS.
- **Sesión persistente a la FastAuth**: se reemplaza el `Auth0Client` interno
  del provider por uno con `cacheLocation: 'localstorage'`, igual que la
  implementación de referencia. Si `localStorage` falla, cae a `memory`.
- **Idempotencia**: `resolveAccount` y `createAccountWithHandle` deben poder
  ejecutarse en cada arranque sin efectos secundarios; si la cuenta existe con
  la misma key, responde `justCreated: false`.
- **Handle automático y determinista**: NEAR no permite renombrar cuentas, así
  que las cuentas nuevas usan `t-nearbox-<10 hex de sha256(publicKey)>.testnet`.
  No es un sorteo: la misma cuenta de Google deriva la misma `publicKey` y por
  tanto el mismo nombre, incluso si se borra `localStorage`. El formulario
  manual queda solo como fallback ante una colisión (responde `409`) y
  `normalizeHandle`/`isValidHandle` se conservan para ese caso.
- **Compatibilidad legacy**: la derivación
  `t-<sha256(publicKey)[0..12]>.testnet` se conserva solo para adoptar cuentas
  antiguas. Si existe una con la key del jugador, se usa sin pedir handle.
- **Unicidad sin registro central**: la existencia on-chain + la comprobación de
  access keys es la fuente de verdad. Si el nombre existe con otra key, el
  relayer responde `409` y nunca reemplaza keys ajenas.
- **Sin funding por ahora**: el relayer solo ejecuta `create_account`. La cuenta
  queda con saldo `0` y su clave MPC; no se transfiere NEAR. El funding se
  implementará en un spec posterior.
- **Sin RUN.world**: no se asume iframe ni callbacks de RUN.world. El juego se
  sirve como sitio estático propio y el callback de Auth0 en desarrollo es
  `http://localhost:3000`.
- **Dependencia `lucide-svelte`**: se instala tal como pidió el usuario, aunque
  el proyecto ya usa `@lucide/svelte`. No se migran iconos existentes.

## 12. Progreso

| Fecha      | Estado      | Nota                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-11-13 | borrador    | Spec creado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-11-13 | borrador    | Ajuste: sin funding de cuentas y sin dependencia de RUN.world                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-11-13 | en-progreso | Implementado el flujo completo (frontend + relayer). Pendiente la prueba manual del login real con Google y credenciales del relayer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-11-13 | en-progreso | Relayer configurado en `backend/.env` (gitignored) y verificado end-to-end: cuenta `t-<12 hex>.testnet` creada en testnet con saldo `0`, una sola key `ed25519` FullAccess igual a la `publicKey` y segunda llamada idempotente (`alreadyExists: true`). Verificado con CDP que el botón abre el popup real de Auth0 (`login.testnet.fast-auth.com`, `redirect_uri=http://localhost:3000`, PKCE, `offline_access`). Pendiente solo el click-through de Google del usuario.                                                                                                                                   |
| 2026-11-13 | en-progreso | Añadidos los handles legibles: `t-<handle>.testnet`, formulario en `Guardian`, validación/normalización, storage por `publicKey`, adopción de cuentas legacy `t-<12 hex>` y `409` del relayer si el nombre está ocupado por otra key. Verificado en testnet que el contrato acepta handles legibles. Pruebas del plugin en memoria (sin levantar servidor): alta `200`, idempotencia `200 alreadyExists`, conflicto `409`, formatos inválidos `400`, rate limit `429` y cuenta creada con saldo `0` y una sola key FullAccess. Pendiente la prueba manual del formulario en navegador (requiere login real). |

## 13. Changelog

- 2026-11-13 — Creación del spec.
- 2026-11-13 — Se elimina el funding de cuentas (queda para un spec posterior) y
  toda dependencia de RUN.world/iframe.
- 2026-11-13 — Implementación: `vite` en `:3000` estricto, módulos `lib/near/*`,
  store `authSession`, `Guardian`, gating de escena/lobby, logout en ajustes y
  mini-relayer Elysia `POST /relayer/create-account` (sin funding). Verificado
  `check`, `lint`, `build`, `tsc --noEmit`, rate limit `429` y ausencia de
  WebSocket anónimo. Pendiente: login real con Google y credenciales del
  relayer.
- 2026-11-13 — Relayer probado end-to-end con credenciales reales de testnet:
  creación on-chain, saldo `0`, única access key FullAccess e idempotencia.
  Verificado también que el botón abre el popup de Auth0 con el callback
  `http://localhost:3000`. Solo queda que el usuario complete el formulario de
  Google (requiere su cuenta).
- 2026-11-13 — Cambio de identidad a handle legible: `t-<handle>.testnet`
  elegido por el jugador, normalizado y guardado por `publicKey`. Se mantiene la
  adopción de cuentas antiguas `t-<12 hex>.testnet`. El relayer acepta ambos
  formatos y responde `409` si el nombre ya existe con otra key. Verificado en
  testnet que `create_account` acepta nombres legibles (cuenta con saldo `0` y
  una sola key).
- 2026-11-13 — Botón de cerrar sesión en el HUD superior derecho, junto al de
  ajustes, para volver a `Guardian` sin buscar la opción dentro del menú.
- 2026-11-13 — Splash estático inline en `app.html` (`#boot-splash`) para que
  nunca se vea la pantalla negra mientras Vite compila y Svelte monta. El
  `+layout.svelte` lo retira en `onMount`, cuando el splash real ya está
  pintado, y deja un timeout de respaldo. Todo el texto visible de `Guardian`
  y los mensajes del relayer que puede mostrar quedaron en inglés.
- 2026-11-13 — Cuenta automática: las identidades nuevas ya no ven el formulario
  de handle. El cliente deriva `t-nearbox-<10 hex>.testnet` de la `publicKey`
  (estable entre recargas y dispositivos) y crea la cuenta sin intervención. El
  formulario queda solo como fallback si ese nombre ya pertenece a otra key.
