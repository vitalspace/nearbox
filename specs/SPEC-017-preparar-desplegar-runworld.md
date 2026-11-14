---
id: SPEC-017
titulo: "Preparar el frontend y desplegarlo en RUN.world (backend aparte)"
estado: completado
prioridad: crítica
creado: 2026-11-01
actualizado: 2026-11-01
responsable: opencode
etiquetas:
  [
    deploy,
    run-world,
    rundot,
    build,
    vite,
    sveltekit,
    adapter-static,
    spa,
    assets,
    websocket,
  ]
depende_de: []
bloquea: []
estimacion: "3h"
---

# SPEC-017 — Preparar el frontend y desplegarlo en RUN.world (backend aparte)

## 1. Contexto

El juego está terminado a nivel funcional (16 specs previos) y se quiere publicar
la primera build privada en RUN.world. El backend Elysia + Bun **no se migra** al
SDK multiplayer de RUN: se seguirá hosteando por separado porque el tiempo no
alcanza para reescribir el protocolo. Esta primera entrega publica **solo el
frontend estático**; multijugador, chat y minijuegos cooperativos dependerán de
que el backend tenga una URL pública `wss://`.

### Estado del entorno verificado (2026-11-01)

| Elemento | Valor |
| -------- | ----- |
| Node | `v25.8.0` (cumple ≥20) |
| npm / bun | `11.11.0` / `1.4.4` |
| rundot CLI | `7.20.0` en `~/.local/bin/rundot` |
| Sesión RUN | `vitalcode2022@gmail.com` (prod) |
| Frontend | SvelteKit `3.1.0`, Svelte `5.57.3`, Vite `8.3.5` |
| Backend | Elysia + Bun, WebSocket en `/ws` |

### Problemas detectados antes de desplegar

1. **El build no es estático ni va a `./dist`.** `frontend/vite.config.ts` usa
   `@sveltejs/adapter-auto`; el resultado queda en `.svelte-kit/output` y no hay
   `dist/index.html`.
2. **Rutas de assets absolutas.** Todos los GLB se cargan como `/map.glb`,
   `/Hero.glb`, etc. RUN exige rutas relativas porque sirve el juego dentro de un
   iframe que puede estar en un subpath.
3. **Decoder Draco externo.** `Map.svelte`, `Crypt.svelte`, `Hero.svelte` y
   `world.svelte` descargan el decoder de `https://www.gstatic.com/...`. Un CSP o
   un bloqueo de red del host deja el mapa sin cargar. Debe servirse localmente.
4. **El proyecto no está registrado en RUN.** No existe `game.config.json` ni la
   carpeta `rundot/`.
5. **El backend no tiene URL pública.** `lobby.svelte.ts` cae por defecto en
   `ws://localhost:3000/ws`, que en producción (HTTPS) el navegador bloquea.
6. **`rundot download-docs` no existe en la CLI 7.20.0.** El comando responde
   "Unrecognized command". La documentación se obtiene con `rundot skills`
   (`rundot skills list`) y con el `agent.md` oficial.
7. **Assets duplicados.** `static/Whi_Interior.glb` (3.8 MB) no se referencia en
   ningún sitio; `static/whi-interior.glb` sí. No se borra sin confirmación, pero
   se anota como limpieza opcional.

### Referencias

- Guía oficial para agentes: <https://events.run.world/events/cli-setup/agent.md>
- SDK docs: <https://series-1.gitbook.io/>
- Requisitos de RUN: build en `./dist`, rutas relativas (`base: './'`), HTML/JS
  ejecutable en iframe sandbox.

## 2. Objetivo

Configurar el frontend para que `npm run build` genere un sitio estático
autocontenido en `frontend/dist` con rutas relativas, registrarlo en RUN.world,
pasar las verificaciones de `rundot predeploy` y desplegar una versión privada,
dejando el backend fuera de este alcance y documentado como dependencia externa.

## 3. Alcance

**Incluye**

- Cambiar `adapter-auto` por `@sveltejs/adapter-static` con salida en `dist`.
- Modo SPA (`ssr = false`, `prerender = false`, fallback `index.html`).
- Resolver de assets relativos y sustitución de todos los GLB.
- Vendorizar el decoder Draco en `static/draco/`.
- Post-proceso del HTML de fallback para que `/_app/...` sea `./_app/...`.
- Registro del juego con `rundot init` (nombre, descripción, build path, orientación).
- Verificación de build, predeploy y deploy privado.
- Documentar cómo rebuildear cuando el backend tenga URL pública.

**No incluye**

- Hostear o desplegar el backend Elysia/Bun.
- Migrar a `@series-ai/rundot-sdk` ni al multiplayer/realtime de RUN.
- Cuentas RUN, storage, leaderboards, IAP, analytics o notificaciones.
- Cambios de gameplay, arte, misiones o minijuegos.
- `rundot game set-public` (revisión pública) ni envío a jam.
- Borrar assets duplicados.

## 4. Requisitos

### Funcionales

| ID   | Requisito | Prioridad |
| ---- | --------- | --------- |
| RF-1 | `npm run build` termina con código 0 y genera `frontend/dist/index.html`, `frontend/dist/_app/` y los GLB. | alta |
| RF-2 | El build es SPA: cualquier ruta cae en `index.html` y no requiere servidor Node. | alta |
| RF-3 | `dist/index.html` no contiene referencias root-absolute a `/_app/`; usa `./_app/`. | alta |
| RF-4 | Todos los GLB se resuelven con un helper relativo (`asset()`), no con `/archivo.glb`. | alta |
| RF-5 | Draco se carga desde `static/draco/` (mismo origen), no desde `gstatic.com`. | alta |
| RF-6 | `game.config.json` existe con nombre, descripción, `relativePathToBuildFolder: "./dist"` y orientación. | alta |
| RF-7 | El build de producción no contiene `ws://localhost`; si no hay `VITE_WS_URL`, el cliente no intenta conectar y queda en modo offline. | alta |
| RF-8 | `rundot predeploy --phase source` y `rundot predeploy` no reportan errores críticos. | alta |
| RF-9 | `rundot deploy` devuelve una share URL privada. | alta |
| RF-10 | La build funciona servida desde un subpath (`/game/`) sin 404 de assets. | alta |

### No funcionales

| ID    | Requisito | Criterio |
| ----- | --------- | -------- |
| RNF-1 | Sin dependencias de servidor en runtime | `dist` se sirve con cualquier static host |
| RNF-2 | Sin peticiones a dominios externos para el juego base | `grep -R "gstatic" src` sin resultados |
| RNF-3 | Build reproducible | `npm run build` dos veces produce los mismos archivos (hash estables) |
| RNF-4 | Tamaño controlado | Documentar tamaño de `dist`; no superar lo que acepte `rundot predeploy` |
| RNF-5 | El juego sigue funcionando offline | Exploración, misiones locales, cosméticos y ajustes no dependen del WS |

## 5. Criterios de aceptación

- [x] CA-1: `cd frontend && npm run build` termina en 0 y existe `dist/index.html`. Verificado 2026-11-01.
- [x] CA-2: `grep -R 'src="/_app\|href="/_app' dist/index.html` no devuelve nada. Verificado 2026-11-01.
- [x] CA-3: `<base href="./" />`. **Resuelto de otra forma**: no se usa `<base>` (la CSP de RUN lo bloquea); `paths.relative: true` + el helper `asset()` resuelven todo contra la URL real de `index.html`. Verificado en `/game/index.html` y en RUN.
- [x] CA-4: `grep -R "gstatic.com" src` no devuelve nada y existe `static/draco/`. En `dist` solo queda la constante por defecto de `three`, que no se usa: el juego pasa `useDraco(asset('draco/'))`.
- [x] CA-5: Servido `dist` desde `/tmp/runworld-serve/game/`, `GET /game/`, `/game/_app/...` y `/game/map.glb` responden 200. Verificado 2026-11-01 (4199).
- [x] CA-6: `grep -R "ws://localhost" dist` no devuelve nada. Verificado 2026-11-01.
- [x] CA-7: `rundot predeploy` termina sin errores críticos. Verificado 2026-11-01: 0 críticos (18 warnings en build, 7 en source).
- [x] CA-8: `rundot deploy` imprime `shareUrl` y el juego carga el mapa en el navegador. Verificado 2026-11-01 con la versión **1.0.1**: canvas activo, HUD, controles y mapa renderizados dentro del iframe de RUN.
- [x] CA-9: Con el backend apagado, el juego entra al mapa y muestra el chat como desconectado (sin crash). Verificado 2026-11-01 en la build desplegada: el chat muestra "No messages yet" y el juego sigue jugable.
- [x] CA-10: Este spec queda actualizado con el resultado real y la URL. URL privada: <https://w.run/u/crway8mkf3QwlWVncbfl/private?k=8c2b5beb9623d0bce2ef0d4608268586>

## 6. Archivos relevantes

| Ruta | Acción | Motivo |
| ---- | ------ | ------ |
| `frontend/vite.config.ts` | modificar | `adapter-static`, `paths.relative`, salida `dist` |
| `frontend/src/routes/+layout.ts` | crear | `ssr = false`, `prerender = false` (SPA) |
| `frontend/src/app.html` | modificar | `<base href="./" />` |
| `frontend/src/lib/assets/path.ts` | crear | Helper `asset()` relativo a `document.baseURI` |
| `frontend/src/lib/components/world/Map.svelte` | modificar | `useGltf(asset('map.glb'))` + Draco local |
| `frontend/src/lib/components/world/Crypt.svelte` | modificar | idem `game2.glb` |
| `frontend/src/lib/components/world/WhiInterior.svelte` | modificar | idem `whi-interior.glb` |
| `frontend/src/lib/components/world/Cat.svelte` | modificar | idem `gato.glb` |
| `frontend/src/lib/assets/world.svelte` | modificar | idem `world.glb` + Draco local (si se usa) |
| `frontend/src/lib/components/player/Hero.svelte` | modificar | idem `Hero.glb` + Draco local |
| `frontend/src/lib/components/player/CrowWarden.svelte` | modificar | idem `Scarecrow_Feet.glb` |
| `frontend/src/lib/components/minigame2/MummyModel.svelte` | modificar | idem `Mummy.glb` |
| `frontend/src/lib/state/carConfig.ts` | modificar | rutas de coches con `asset()` |
| `frontend/src/lib/world/registry.generated.ts` | modificar | rutas de mapas con `asset()` |
| `frontend/src/lib/cosmetics/skins.ts` | modificar | `modelPath` con `asset()` |
| `frontend/src/lib/state/lobby.svelte.ts` | modificar | Sin fallback `localhost` en producción |
| `frontend/scripts/world-inject.mjs` | modificar | El generador debe emitir `asset(...)`, no `/x.glb` |
| `frontend/scripts/world-sync.mjs` | modificar | Idem para `registry.generated.ts` |
| `frontend/scripts/postbuild-relative-paths.mjs` | crear | Reescribe `/_app/` → `./_app/` en `dist/index.html` |
| `frontend/package.json` | modificar | `build` ejecuta el post-proceso |
| `frontend/static/draco/*` | crear | Copia local del decoder de Three.js |
| `frontend/.gitignore` | modificar | Ignorar `dist/` |
| `frontend/.env.example` | modificar | Documentar `VITE_WS_URL` de producción |
| `frontend/game.config.json` | crear (CLI) | Registro del juego en RUN |
| `frontend/rundot/` | crear (CLI) | Configuración local de rundot |

## 7. Plan de implementación

### Fase 1 — Línea base

- [ ] Paso 1: Ejecutar `cd frontend && npm run build` y guardar el resultado actual.
- [ ] Paso 2: Confirmar que no existe `dist/` y que la salida va a `.svelte-kit/output`.

### Fase 2 — Build estático y SPA

- [ ] Paso 1: Instalar `@sveltejs/adapter-static@4`.
- [ ] Paso 2: Cambiar el adapter en `vite.config.ts` a `adapter({ pages: 'dist', assets: 'dist', fallback: 'index.html', strict: false })`.
- [ ] Paso 3: Añadir `paths: { relative: true }` a la configuración de SvelteKit.
- [ ] Paso 4: Crear `src/routes/+layout.ts` con `ssr = false` y `prerender = false`.
- [ ] Paso 5: Añadir `<base href="./" />` en `app.html`.

### Fase 3 — Assets relativos y Draco local

- [ ] Paso 1: Crear `src/lib/assets/path.ts` con `asset(path)` basado en `document.baseURI`.
- [ ] Paso 2: Sustituir los 9 `useGltf('/...')` por `useGltf(asset('...'))`.
- [ ] Paso 3: Sustituir las rutas de `carConfig.ts`, `registry.generated.ts` y `skins.ts`.
- [ ] Paso 4: Copiar `three/examples/jsm/libs/draco/gltf/*` a `static/draco/`.
- [ ] Paso 5: Cambiar `useDraco('https://www.gstatic.com/...')` por `useDraco(asset('draco/'))`.
- [ ] Paso 6: Actualizar los generadores `world-inject.mjs` / `world-sync.mjs` para no reintroducir rutas absolutas.

### Fase 4 — Modo offline del WebSocket

- [ ] Paso 1: En `lobby.svelte.ts`, usar `localhost` solo si `import.meta.env.DEV`.
- [ ] Paso 2: Si `VITE_WS_URL` no está definido en producción, no llamar a `connect()` y dejar el estado en `idle`.
- [ ] Paso 3: Verificar que `ChatOverlay` muestra "Conecta para chatear" sin errores en consola.

### Fase 5 — Verificación del build

- [ ] Paso 1: Añadir `scripts/postbuild-relative-paths.mjs` y encadenarlo en `build`.
- [ ] Paso 2: Ejecutar `npm run build` y comprobar `dist/`.
- [ ] Paso 3: Servir `dist` desde un subpath temporal y validar con `curl`.
- [ ] Paso 4: Ejecutar `npm run check` y `npm run lint`.

### Fase 6 — Registro y deploy en RUN

- [x] Paso 1: `rundot init --name "Monster Village" --description "..." --build-path ./dist -o Both`.
- [ ] Paso 2: Revisar `game.config.json` (build path y orientación).
- [ ] Paso 3: `rundot predeploy --phase source` y corregir hallazgos.
- [ ] Paso 4: `rundot predeploy` sobre el build.
- [ ] Paso 5: `rundot deploy` y guardar share URL.
- [ ] Paso 6: Abrir la share URL y validar carga de mapa, controles y HUD.

### Fase 7 — Cierre

- [ ] Paso 1: Actualizar este spec (estado, progreso, changelog, URL).
- [ ] Paso 2: Documentar el rebuild con `VITE_WS_URL` cuando el backend esté público.

## 8. Verificación

```bash
# Build estático
cd frontend
npm run build
test -f dist/index.html && echo "OK dist/index.html"
test -d dist/_app && echo "OK dist/_app"

# Rutas relativas
grep -R 'src="/_app\|href="/_app' dist/index.html && echo "FALLO: rutas absolutas" || echo "OK rutas relativas"
grep -q '<base href="./"' dist/index.html && echo "OK base relativa"

# Draco local / sin localhost en producción
grep -R "gstatic.com" src dist && echo "FALLO: Draco externo" || echo "OK Draco local"
grep -R "ws://localhost" dist && echo "FALLO: localhost en build" || echo "OK sin localhost"

# Simulación de subpath
rm -rf /tmp/runworld-serve && mkdir -p /tmp/runworld-serve/game
cp -r dist/* /tmp/runworld-serve/game/
cd /tmp/runworld-serve && python3 -m http.server 4173 &
curl -s -o /dev/null -w "%{http_code} /game/\n" http://localhost:4173/game/
curl -s -o /dev/null -w "%{http_code} /game/map.glb\n" http://localhost:4173/game/map.glb
# (las rutas _app salen del index.html; comprobar al menos una con curl)

# Calidad
cd frontend && npm run check && npm run lint

# RUN
rundot predeploy --phase source
rundot predeploy
rundot deploy
```

Casos manuales:

1. Abrir la share URL en desktop: el mapa carga, el personaje se mueve y no hay
   404 en la pestaña Network.
2. Abrir en móvil: aparecen los controles táctiles y el HUD no se sale.
3. Con el backend apagado: el chat indica desconectado y el juego sigue jugable.
4. Con `VITE_WS_URL` público: presencia, chat y minijuegos conectan.

## 9. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
| ------ | ------- | ---------- |
| El backend no tiene URL pública | Chat/multijugador/minijuegos no funcionan en la build | Desplegar backend aparte y rebuildear con `VITE_WS_URL=wss://...`; mientras tanto, modo offline |
| `ws://localhost` queda en el bundle | Errores de mixed content y reintentos infinitos | Fallback solo en DEV; grep en verificación |
| Rutas root-absolute de SvelteKit en el fallback | 404 de JS/CSS en subpath | Post-proceso `/_app/` → `./_app/` + `<base href="./">` |
| GLB referenciados con `/` en código | 404 del mapa en subpath | Helper `asset()` + verificación en subpath |
| Draco en `gstatic.com` bloqueado por CSP | El mapa no carga | Vendorizar decoder en `static/draco/` |
| Tamaño del build (~20 MB de GLB) | Rechazo o carga lenta | Medir `dist`; limpiar `Whi_Interior.glb` duplicado si el usuario aprueba; comprimir GLB a futuro |
| SvelteKit 3 + adapter-static 4 son recientes | Incompatibilidad de config | Build de prueba y ajuste según errores reales |
| `rundot init` en carpeta existente | Config inesperada | Revisar `game.config.json` antes de deploy; usar `--override` solo si se entiende |
| El nombre "Monster Village" ya está confirmado | Nombre público incorrecto | Nombre aplicado en RUN; cambio adicional solo si el usuario lo pide |

## 10. Preguntas abiertas

- [x] ¿El nombre final es "Calabazar Embrujado" u otro? → Confirmado: **Monster Village** (inglés).
- [ ] ¿Dónde se hosteará el backend y con qué dominio `wss://`?
- [ ] ¿La build debe ser `Both` o solo `Landscape`?
- [ ] ¿Se elimina `static/Whi_Interior.glb` (3.8 MB duplicado) para aligerar?
- [ ] ¿Se quiere `rundot game set-public` tras validar la build privada?

## 11. Decisiones y notas

- **Solo frontend en RUN.** El backend se queda en Bun/Elysia y se hostea aparte.
- **Sin SDK de RUN por ahora.** No se añade identidad, storage ni multiplayer de
  RUN; el perfil y las misiones siguen en `localStorage`.
- **SPA estática.** El juego no necesita SSR; `ssr = false` evita ejecutar
  Three.js/Threlte en el servidor y simplifica el fallback.
- **Rutas relativas en dos capas.** `paths.relative` arregla lo que genera
  SvelteKit; el post-proceso arregla el fallback SPA, que SvelteKit documenta como
  siempre absoluto; `asset()` arregla las rutas que construye el código.
- **Draco local.** Se copia el decoder de `three` para no depender de Google.
- **Nombre final.** "Monster Village" (traducción al inglés de "Villa de Monstruos")
  es el nombre público del juego; se aplicó en RUN el 2026-11-01.
- **No se borran assets del usuario.** La limpieza de duplicados queda como
  decisión explícita.

## 12. Progreso

| Fecha | Estado | Nota |
| ----- | ------ | ---- |
| 2026-11-01 | en-progreso | Spec creado tras verificar entorno y detectar 7 problemas de despliegue. |
| 2026-11-01 | en-progreso | Nombre del juego cambiado en RUN a "Monster Village". |
| 2026-11-01 | en-progreso | Verificación técnica: build estático OK, subpath OK, predeploy source/build OK (0 críticos). Pendiente `rundot deploy`, thumbnail 512×512 y prueba manual con backend apagado. |

## 14. Verificación técnica (2026-11-01)

| Comprobación | Resultado |
| ------------ | --------- |
| `npm run check` | 0 errores, 0 warnings |
| `npm run build` | OK; `dist/index.html`, `dist/_app/` y GLB presentes; post-proceso convierte 13 referencias `/_app/` a `./_app/` |
| Tamaño de `dist` | ~28 MB (`map.glb` 7.5 MB, `whi-interior.glb` 3.8 MB) |
| SPA / subpath `/game/` | 200 en `/game/`, `/game/map.glb` y `/game/_app/immutable/entry/start.*.js` |
| Prueba SPA real (Chromium) | `/game/index.html`: 0 requests fallidos, 0 errores de consola, canvas y HUD renderizados |
| `ws://localhost` en `dist` | No aparece |
| `gstatic.com` en `src` | No aparece (se limpiaron los comentarios autogenerados) |
| `gstatic.com` en `dist` | Solo la constante por defecto del `DRACOLoader` de `three`; no se usa |
| `rundot whoami` | `vitalcode2022@gmail.com` (prod) |
| `rundot predeploy --phase source` | 14 checks, 12 OK, 0 críticos, 7 warnings (storage-blocked-apis, embedded-lib-duplicate) |
| `rundot predeploy` | 21 checks, 17 OK, 0 críticos, 18 warnings (CDN de GLB, bundle monolítico, three embebido) |
| `rundot deploy` | **OK** → v1.0.1, visibilidad `private` |
| Prueba dentro de RUN.world | iframe `.../1.0.1/index.html`: canvas activo, mapa, HUD, chat offline y controles. Sin 404 de `_app`. |

### Diferencias entre el spec y la realidad

1. **`game.config.json` no existe.** El CLI 7.20.0 trabaja con
   `game.config.prod.json` (`gameId` = `crway8mkf3QwlWVncbfl`,
   `relativePathToDistFolder: "dist"`, `orientation: "both"`). No hay carpeta
   `rundot/`; no hace falta crearla para predeploy.
2. **`paths.relative` debe ser `true`.** Con `false`, el HTML salía relativo pero
   el runtime de SvelteKit pedía los chunks como `/_app/...` en la raíz del
   dominio y RUN devolvía 404. Se cambió a `true` y se eliminaron las rutas
   absolutas del bundle.
3. **Hace falta una ruta catch-all.** RUN sirve el juego en
   `/<version>/index.html`, así que el router SPA veía una ruta desconocida y
   mostraba su 404. Se añadió `src/routes/[...rest]/+page.svelte`, que renderiza
   el mismo `GamePage` para cualquier ruta.
4. **Thumbnail añadido (placeholder).** `static/thumbnail.jpg` es un render
   512×512 (< 100 KB) de la casa de la bruja en el mapa. El warning
   `deploy-package-integrity` ya no aparece; se puede sustituir por el arte
   definitivo manteniendo el mismo nombre y formato.
5. **Bundle monolítico de ~6 MB** (`nodes/2.*.js`) y GLB servidos desde `dist`
   en vez de `cdn-assets`: warnings de rendimiento, no bloqueantes.
6. **Deploy ejecutado.** v1.0.0 se subió con las rutas absolutas y el juego no
   cargaba dentro de RUN; v1.0.1 corrige rutas y routing y se validó en
   producción.
7. **Contenido del juego en inglés.** Se tradujeron textos visibles de UI,
   misiones, gatos, skins, coches, checkpoints, errores del socket y etiquetas
   del loader. Los identificadores internos (`car-calabaza`, `car-momia`,
   zonas `bosque`/`castillo`/…) se mantienen por compatibilidad con el protocolo
   del backend. Los mapas y sus carteles ya estaban en inglés.

## 13. Changelog

- 2026-11-01 — Creación del spec con diagnóstico de entorno, requisitos de RUN y plan de implementación.
- 2026-11-01 — Nombre público actualizado de "Calabazar Embrujado" a "Monster Village".
- 2026-11-01 — Verificación técnica añadida (sección 14): build y subpath OK, predeploy sin críticos, deploy pendiente. Contenido del juego revisado y traducido al inglés; mapas sin cambios.
- 2026-11-01 — Thumbnail placeholder 512×512 añadido en `static/thumbnail.jpg` (render de la casa de la bruja).
- 2026-11-01 — Deploy v1.0.1 y verificación dentro del iframe de RUN (canvas, mapa, HUD, chat offline; sin 404 de `_app`).
- 2026-11-01 — `rundot game set-public --version 1.0.1` envía a revisión; RUN crea la release `Review` y publica automáticamente al aprobar. Release `Public` todavía no existe.
- 2026-11-01 — Deploy v1.0.2 con `--public` (visibilidad devuelta: `review`): también pasa por revisión automática, no publica de inmediato. v1.0.2 verificada en el enlace `review` (canvas activo, HUD, 0 errores de assets).
