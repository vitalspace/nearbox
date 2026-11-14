---
id: SPEC-022
titulo: "Build y deploy de RUN.world: procedimiento reproducible"
estado: completado
prioridad: alta
creado: 2026-11-02
actualizado: 2026-11-06
responsable: opencode
etiquetas: [deploy, build, rundot, rooms, produccion, checklist]
depende_de: [SPEC-020]
bloquea: []
estimacion: "1h"
---

# SPEC-022 — Build y deploy de RUN.world: procedimiento reproducible

## 1. Contexto

El juego se sirve como build estático + rooms del Multiplayer API de RUN.
`SPEC-020` migró el backend Elysia a `frontend/src/server/rooms/*` y dejó el
deploy en una sola operación de `rundot deploy`. Este spec resume **qué hacer**
para construir y desplegar sin reconstruir el contexto de depuración.

## 2. Objetivo

Tener un procedimiento corto y verificable para:

1. construir el frontend y el bundle de rooms;
2. validar assets, rutas y predeploy;
3. desplegar a `Private`/`Review` y, tras aprobación, a `Public`;
4. comprobar qué versión sirve realmente el link público.

## 3. Requisitos previos

- CLI `rundot` instalada (`rundot --version`; usada aquí: `7.20.0`).
- Sesión iniciada (`rundot whoami`).
- `frontend/game.config.prod.json` con `gameId` y `relativePathToDistFolder: "dist"`.
- `frontend/rundot/rooms.config.json` con las rooms `lobby`, `crypt`, `race`,
  `roadmap`, `waves`, `deathmatch` y `parkour`.
- `esbuild` instalado (lo usa el plugin de Vite para compilar las rooms).

## 4. Build

Desde `frontend/`:

```bash
cd /home/vital/Desktop/runworld/game1/frontend

# 1. Chequeo de tipos y formato
bun run check
bun run lint

# 2. Chequeos de mapas/físicas/audio
bun run roadmap:check
bun run map:check
bun run crypt:check
bun run race:check
bun run waves:check
bun run barnsiege:check
bun run dm:check
bun run parkour:check
bun run world:check parkour
bun run audio:check

# 3. Build de producción
bun run build
```

`bun run build` ejecuta:

1. `vite build` → compila SvelteKit, el cliente y `dist/server-bundle.js`.
2. `rundotMultiplayerPlugin()` → copia `rundot/rooms.config.json` a `dist/`.
3. `adapter-static` → escribe el sitio en `.build/static`.
4. `scripts/postbuild-relative-paths.mjs` → copia `.build/static` a `dist`
   **sin borrar** `dist/server-bundle.js` ni `dist/rooms.config.json`.

Artefactos obligatorios al terminar:

```bash
ls -lh dist/server-bundle.js dist/rooms.config.json dist/map.glb dist/barnsiege.glb dist/roadmap.glb dist/Parkour.glb
```

Si falta `server-bundle.js` o `rooms.config.json`, el deploy subirá un juego sin
multijugador. No continuar.

**Thumbnail:** `static/thumbnail.jpg` debe ser **exactamente 512×512**. El build
lo copia a `dist/thumbnail.jpg` y `rundot deploy` lo sube con el resto del build.
Si solo cambia el thumbnail, basta con reemplazar `static/thumbnail.jpg` y
`dist/thumbnail.jpg` y desplegar; no hace falta reconstruir.

## 5. Predeploy

```bash
cd /home/vital/Desktop/runworld/game1/frontend
rundot predeploy
```

- `critical: 0` es obligatorio.
- Los `warning` actuales son conocidos: `localStorage` en `playerProfile` /
  `missions` y assets GLB locales que no están en CDN. No bloquean el deploy.
- Para inspección legible: `rundot predeploy --json > /tmp/predeploy.json`.

## 6. Deploy y publicación

### 6.1 Desplegar una versión

```bash
cd /home/vital/Desktop/runworld/game1/frontend
rundot deploy \
  --public \
  --close-rooms \
  --bump Minor \
  --changelog "New Barn Siege village arena and checkpoint."
```

Notas:

- `--public` **no publica al instante**: crea la versión, la sube a `Private`
  y `Review`, y la envía a revisión. La respuesta correcta tiene
  `"visibility": "review"`.
- `--bump Minor` es para contenido nuevo; usa `Patch` para correcciones y
  `Major` solo para cambios incompatibles. Ejemplo real: `1.16.5 → 1.17.0`.
- `--close-rooms` cierra rooms vivas que queden en un bundle viejo.
- El changelog pasa por un filtro de profanidad. Si el deploy falla con
  `releaseNotes.changelog: flagged by local profanity filter`, usar un texto
  corto en inglés y reintentar. No hace falta cambiar el build.
- `--json` devuelve una línea con `version`, `shareUrl` y `visibility`.
- Si la subida llega a `Uploading game files... 100%` y falla tras ~2 minutos
  con `HttpRequestException: An error occurred while sending the request.`,
  revisar `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY`. Un proxy inestable corta
  el upload grande a storage aunque el resto de la API funcione. Confirmado en
  1.17.1: con proxy fallaba siempre; sin proxy subió 62 MB a la primera.
  Ejecutar:

  ```bash
  env -u HTTPS_PROXY -u HTTP_PROXY -u ALL_PROXY \
      -u https_proxy -u http_proxy \
    rundot deploy --public --close-rooms --bump Patch --changelog "..."
  ```

Ejemplo de salida correcta:

```json
{
  "success": true,
  "gameId": "crway8mkf3QwlWVncbfl",
  "version": "1.17.0",
  "shareUrl": "https://w.run/vitalspace/monster-village?tag=review&k=...",
  "visibility": "review"
}
```

### 6.2 Convertir la Review en Public (flujo real)

La promoción a `Public` la hace RUN al aprobar la revisión; **no se fuerza por
CLI**. El flujo correcto es:

1. Ejecutar `deploy --public` (§6.1).
2. Esperar la aprobación automática. En la práctica tarda ~3–4 minutos, aunque
   puede variar.
3. Comprobar releases:

   ```bash
   rundot game list-releases | grep -E "Public|Private|Review|Version:"
   ```

   Resultado correcto tras la aprobación:

   ```
   Private   1.17.0
   Review (Approved)   1.17.0
   Public    1.17.0
   ```

4. Confirmar la versión pública real por API:

   ```bash
   curl -s https://api.run.game/v1/games/crway8mkf3QwlWVncbfl \
     | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['tags']['public']['versionId']); print(d.get('publicVersionPublishedAt'))"
   ```

   Ejemplo: `1.17.0` y `2026-11-04T21:20:08.767Z`.

**Lo que NO funciona** (probado en 1.17.0):

| Comando                                              | Respuesta                                                    | Motivo                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `rundot game update-release public --version 1.17.0` | `You are not authorized to update public tag`                | El tag `Public` solo lo mueve la aprobación de RUN.                     |
| `rundot game copy-release review public`             | `You are not authorized to update the public tag`            | Misma restricción.                                                      |
| `rundot game set-public`                             | `Version 1.17.0 is not newer than the public version 1.17.0` | Solo envía a revisión la última versión; no promociona la ya publicada. |

Si la review sigue pendiente, hay que **esperar la aprobación** y usar el link
`?tag=review&k=...` para probarla. No reintentar el deploy con la misma versión
ni usar `update-release`/`copy-release`: si hace falta un cambio nuevo, se
bumpa la versión y se vuelve a desplegar.

## 7. Verificación post-deploy

```bash
cd /home/vital/Desktop/runworld/game1/frontend

# Releases y server config
rundot game list-releases
rundot game list-server-configs

# Versión pública real y fecha de publicación
curl -s https://api.run.game/v1/games/crway8mkf3QwlWVncbfl \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['tags']['public']['versionId']); print(d.get('publicVersionPublishedAt'))"

# Rooms vivas y bundle
rundot rooms list
rundot rooms logs --since 10m
rundot rooms logs --since 10m --level error
```

Interpretación:

- `Review 1.17.0` + `Public 1.16.5` → deploy correcto, esperando aprobación.
- `Review (Approved) 1.17.0` + `Public 1.17.0` → **publicado**.
- `rundot rooms list` debe mostrar la room viva en el bundle nuevo después de
  que `Public` apunte a esa versión. Si sigue en el bundle viejo, reiniciar la
  room o esperar a que el platform la recicle.

## 8. Deploy realizado (2026-11-02)

| Dato                 | Valor                                                                |
| -------------------- | -------------------------------------------------------------------- |
| Build                | `bun run build` OK                                                   |
| Predeploy            | 0 críticos, 29 warnings conocidos                                    |
| Versión desplegada   | **1.12.0**                                                           |
| Visibilidad          | `public` (aprobada a las 03:15 UTC)                                  |
| Server config        | `hLpAbhD5PvjlGLfpcmm8`                                               |
| Público al desplegar | `1.11.4` → `1.12.0` tras review                                      |
| Room viva            | `VGYTV3`, bundle `1.12.0` (la vieja `BCV7MW` se cerró)               |
| Cambio principal     | mapa `roadmap.glb`, físicas de pista y selector Grand Prix / Roadmap |

### 8.1. Deploy 1.12.1 (spawn del Roadmap con coche)

| Dato                 | Valor                                                                |
| -------------------- | -------------------------------------------------------------------- |
| Build                | `bun run build` OK                                                   |
| Predeploy            | 0 críticos, 29 warnings conocidos                                    |
| Versión desplegada   | **1.12.1**                                                           |
| Visibilidad          | `public` (aprobada a las 03:42 UTC)                                  |
| Server config        | `hLpAbhD5PvjlGLfpcmm8`                                               |
| Público al desplegar | `1.12.0` → `1.12.1` tras review                                      |
| Room viva            | `VRBMTG`, bundle `1.12.1`                                            |
| Cambio principal     | spawn en `HW_StartFinish_Checker` con coche local, controles y reset |

### 8.2. Deploy 1.12.2 (reinicio al entrar)

| Dato                 | Valor                                                              |
| -------------------- | ------------------------------------------------------------------ |
| Build                | `bun run build` OK                                                 |
| Predeploy            | mismos warnings conocidos, 0 críticos                              |
| Versión desplegada   | **1.12.2**                                                         |
| Visibilidad          | `public` (aprobada a las 03:50 UTC)                                |
| Público al desplegar | `1.12.1` → `1.12.2` tras review                                    |
| Room viva            | `7A29P3`, bundle `1.12.2`                                          |
| Cambio principal     | el coche del Roadmap vuelve siempre a la línea de salida al entrar |

### 8.3. Deploy 1.13.0 (sincronización de skins)

| Dato                 | Valor                                                                         |
| -------------------- | ----------------------------------------------------------------------------- |
| Build                | `bun run build` OK                                                            |
| Checks               | `check`, `lint`, `roadmap:check`, `map:check`, `crypt:check`, `race:check` OK |
| Predeploy            | 0 críticos, 29 warnings conocidos                                             |
| Versión desplegada   | **1.13.0**                                                                    |
| Visibilidad          | `review` (pendiente de aprobación)                                            |
| Server config        | `hLpAbhD5PvjlGLfpcmm8`                                                        |
| Público al desplegar | `1.12.7`                                                                      |
| Room viva            | `RNCF4N`, bundle `1.12.7` mientras `Public` sigue en esa versión              |
| Rooms cerradas       | `9K7GV6` (bundle `1.12.6`)                                                    |
| Cambio principal     | la skin equipada se sincroniza con los avatares remotos del mapa y la cripta  |

### 8.4. Deploy 1.14.0 (cielo nocturno de Halloween)

| Dato                 | Valor                                                                         |
| -------------------- | ----------------------------------------------------------------------------- |
| Build                | `bun run build` OK                                                            |
| Checks               | `check`, `lint`, `roadmap:check`, `map:check`, `crypt:check`, `race:check` OK |
| Predeploy            | 0 críticos, 29 warnings conocidos                                             |
| Versión desplegada   | **1.14.0**                                                                    |
| Visibilidad          | `public` (Review aprobada automáticamente)                                    |
| Server config        | `hLpAbhD5PvjlGLfpcmm8`                                                        |
| Público al desplegar | `1.13.0` → `1.14.0`                                                           |
| Room viva            | ninguna (sin jugadores en el momento de verificar)                            |
| Cambio principal     | cielo de Halloween con shader: luna, estrellas, nebulosa y nubes animadas     |

### 8.5. Deploy 1.16.0 (audio procedural)

| Dato                 | Valor                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| Build                | `bun run build` OK                                                                                          |
| Checks               | `check`, `lint`, `audio:check`, `roadmap:check`, `map:check`, `crypt:check`, `race:check`, `waves:check` OK |
| Predeploy            | 0 críticos, 31 warnings conocidos                                                                           |
| Versión desplegada   | **1.16.0**                                                                                                  |
| Visibilidad          | `review` → `public` (aprobada)                                                                              |
| Server config        | `BR1xYpwVRYgwUIzIrCiC`                                                                                      |
| Público al desplegar | `1.15.13` → `1.16.0` tras la aprobación                                                                     |
| Rooms cerradas       | ninguna (no había rooms en bundles viejos)                                                                  |
| Cambio principal     | audio procedural: pasos, combate, coches, monstruos y ambiente por zona                                     |
| Promoción manual     | bloqueada: `update-release public` responde `You are not authorized to update public tag`                   |

### 8.6. Deploy 1.16.1 (correcciones de audio)

| Dato                 | Valor                                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Versión desplegada   | **1.16.1**                                                                                                                                |
| Visibilidad          | `review` → `public` (aprobada)                                                                                                            |
| Público al desplegar | `1.16.0` → `1.16.1` tras la aprobación                                                                                                    |
| Rooms cerradas       | `NG7SKC` (1.15.13) y `JJHGZA` (1.16.0), 1 jugador cada una; room `UK9VE8` en 1.16.1                                                       |
| Cambios              | motor de coche aparcado se detiene; maullido/ronroneo al capturar gato; gruñidos de momias perseguidoras; whoosh al lanzar rollo de papel |

### 8.7. Deploy 1.16.2 (música y avisos)

| Dato                 | Valor                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Versión desplegada   | **1.16.2**                                                                                                               |
| Visibilidad          | `review` → `public` (aprobada automáticamente)                                                                           |
| Público al desplegar | `1.16.1` → `1.16.2`                                                                                                      |
| Rooms cerradas       | `TFNMGR` (1.16.1, 1 jugador)                                                                                             |
| Cambios              | música de Halloween procedural con slider propio; victoria de misión; cuenta atrás 3-2-1 en carrera, cripta y Barn Siege |

### 8.8. Deploy 1.16.3 (tema de Halloween más oscuro)

| Dato                 | Valor                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| Versión desplegada   | **1.16.3**                                                                                     |
| Visibilidad          | `review` → `public` (aprobada)                                                                 |
| Público al desplegar | `1.16.2` → `1.16.3`                                                                            |
| Rooms cerradas       | room de 1.16.2 con 1 jugador                                                                   |
| Cambios              | música recompuesta a 120 BPM con theremin, tritono, descenso cromático, bajo staccato y órgano |

### 8.9. Deploy 1.16.4 (resultado de misión)

| Dato                 | Valor                                                                         |
| -------------------- | ----------------------------------------------------------------------------- |
| Versión desplegada   | **1.16.4**                                                                    |
| Visibilidad          | `review` → `public` (aprobada)                                                |
| Público al desplegar | `1.16.3` → `1.16.4`                                                           |
| Rooms cerradas       | room de 1.16.3 con 1 jugador                                                  |
| Cambios              | jingles `mission_win`/`mission_lose` para gatos, cripta, Barn Siege y carrera |

### 8.10. Deploy 1.17.0 (arena `barnsiege.glb` y checkpoint al frente)

| Dato                 | Valor                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Build                | `bun run build` OK; `dist/server-bundle.js`, `rooms.config.json`, `barnsiege.glb` y `map.glb` presentes                        |
| Checks               | `check`, `lint`, `roadmap:check`, `map:check`, `crypt:check`, `race:check`, `waves:check`, `barnsiege:check`, `audio:check` OK |
| Predeploy            | 0 críticos, 35 warnings conocidos                                                                                              |
| Versión desplegada   | **1.17.0**                                                                                                                     |
| Visibilidad          | `review` → `public` (aprobada automáticamente)                                                                                 |
| Server config        | `BR1xYpwVRYgwUIzIrCiC`                                                                                                         |
| Público al desplegar | `1.16.5` → `1.17.0` tras la aprobación                                                                                         |
| Rooms cerradas       | ninguna (no había rooms en bundles viejos)                                                                                     |
| Logs de rooms        | sin errores en los últimos 10 min                                                                                              |
| Cambio principal     | Barn Siege se juega en `barnsiege.glb` y el checkpoint queda delante de la puerta del granero                                  |

### 8.11. Hotfix 1.17.1 (crash del espantapájaros en Barn Siege)

| Dato                    | Valor                                                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Build                   | `bun run build` OK; `dist` 62 MB; chunk `CdDLPUCj.js` idéntico al publicado (SHA-256 `d47010dc…`)                                         |
| Checks                  | `check`, `lint`, `roadmap:check`, `map:check`, `crypt:check`, `race:check`, `waves:check`, `barnsiege:check`, `audio:check` OK            |
| Predeploy               | 0 críticos, 36 warnings conocidos                                                                                                         |
| Versión desplegada      | **1.17.1**                                                                                                                                |
| Visibilidad             | `review` → `public` (aprobada a las 22:40:09 UTC; deploy a las 22:38)                                                                     |
| Server config           | `BR1xYpwVRYgwUIzIrCiC`                                                                                                                    |
| Público al desplegar    | `1.17.0` → `1.17.1`                                                                                                                       |
| Rooms cerradas          | `J5DDV5` (lobby 1.17.0, 2 jugadores) cerrada tras la promoción con `rundot rooms close --outdated --yes`                                  |
| Cambio principal        | El segundo espantapájaros pasa a `BS_Scarecrow_Field_B` (malla propia) y se regenera `Barnsiege.svelte`; el bundle ya no referencia `_17` |
| Causa de fallos previos | `HTTP_PROXY`/`HTTPS_PROXY` en el entorno: el upload moría al 100% con `HttpRequestException`; sin proxy subió a la primera                |

Verificación post-deploy:

- `Review (Approved) 1.17.1`, `Public 1.17.1` y
  `publicVersionPublishedAt = 2026-11-04T22:40:09.922Z`.
- El chunk publicado en
  `https://crway8mkf3qwlwvncbfl.h5-apps.getreel.com/1.17.1/_app/immutable/chunks/CdDLPUCj.js`
  contiene `BS_Scarecrow_Field_B` (35 referencias) y **cero**
  `BS_Scarecrow_Field_17`; su SHA-256 coincide con el de `frontend/dist`.
- `rundot rooms list` quedó sin rooms en bundles viejos tras cerrar `J5DDV5`.

### 8.12. Deploy 1.17.2 (colisión por celdas en Barn Siege)

| Dato                 | Valor                                                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build                | `bun run build` OK; `dist` 62 MB; chunk `CWZIhlyP.js` idéntico al publicado (SHA-256 `b871b871…`)                                                         |
| Checks               | `check`, `lint`, `roadmap:check`, `map:check`, `crypt:check`, `race:check`, `waves:check`, `barnsiege:check`, `audio:check` OK                            |
| Predeploy            | 0 críticos, 36 warnings conocidos                                                                                                                         |
| Versión desplegada   | **1.17.2**                                                                                                                                                |
| Visibilidad          | `review` → `public` (aprobada automáticamente)                                                                                                            |
| Server config        | `BR1xYpwVRYgwUIzIrCiC`                                                                                                                                    |
| Público al desplegar | `1.17.1` → `1.17.2`                                                                                                                                       |
| Rooms cerradas       | `9NJYR9` (lobby 1.17.1, 0 jugadores) cerrada tras la promoción con `rundot rooms close --outdated --yes`                                                  |
| Rooms vivas          | `9Z8WX5` (lobby) y `A2EDKY` (waves), ambas en 1.17.2; sin errores en los últimos 10 min                                                                   |
| Cambio principal     | Barn Siege usa colisión por celdas de 16 m (`chunked`) para eliminar el lag de 200–1000 ms/frame y el bloqueo del spawn; 68 colliders / 80 644 triángulos |

Verificación post-deploy:

- `tags.public.versionId = 1.17.2` y
  `publicVersionPublishedAt = 2026-11-05T01:15:20.392Z`.
- El chunk público
  `https://crway8mkf3qwlwvncbfl.h5-apps.getreel.com/1.17.2/_app/immutable/chunks/CWZIhlyP.js`
  contiene `chunkSize:16` y el constructor de `ChunkedColliders`; su SHA-256
  coincide con el de `frontend/dist`.
- `rundot rooms list` quedó sin rooms en bundles viejos.

### 8.13. Deploy 1.18.0 (settings centrado y visores 3D)

| Dato                 | Valor                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Build                | `bun run build` OK; `dist` 62 MB; `server-bundle.js`, `rooms.config.json`, `map.glb` y `barnsiege.glb` presentes               |
| Checks               | `check`, `lint`, `roadmap:check`, `map:check`, `crypt:check`, `race:check`, `waves:check`, `barnsiege:check`, `audio:check` OK |
| Predeploy            | 0 críticos, 36 warnings conocidos                                                                                              |
| Versión desplegada   | **1.18.0**                                                                                                                     |
| Visibilidad          | `review` → `public` (aprobada automáticamente en ~4.5 min)                                                                     |
| Server config        | `BR1xYpwVRYgwUIzIrCiC`                                                                                                         |
| Público al desplegar | `1.17.3` → `1.18.0`                                                                                                            |
| Rooms cerradas       | `2UDN6X` (lobby 1.17.3, 1 jugador) cerrada tras la promoción con `rundot rooms close --outdated --yes`                         |
| Rooms vivas          | `KJQV7P` (lobby 1.18.0); sin errores en los últimos 10 min                                                                     |
| Cambio principal     | modal de ajustes centrado con rail de secciones, visor 3D de skins y miniaturas 3D de misiones (gato, calavera y coche)        |

Verificación post-deploy:

- `tags.public.versionId = 1.18.0` y
  `publicVersionPublishedAt = 2026-11-05T02:55:15.414Z`.
- El chunk público
  `https://crway8mkf3qwlwvncbfl.h5-apps.getreel.com/1.18.0/_app/immutable/chunks/C66zELUK.js`
  contiene el visor de skins y su SHA-256 (`a6b941a3…`) coincide con el de
  `frontend/dist`.

### 8.14. Deploy 1.19.0 (mini tutorial de bienvenida con visores 3D)

| Dato                 | Valor                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Build                | `bun run build` OK; `dist` 62 MB; `server-bundle.js`, `rooms.config.json`, `map.glb`, `barnsiege.glb` y `roadmap.glb` presentes |
| Checks               | `check`, `lint`, `roadmap:check`, `map:check`, `crypt:check`, `race:check`, `waves:check`, `barnsiege:check`, `audio:check` OK  |
| Predeploy            | 0 críticos, 36 warnings conocidos                                                                                               |
| Versión desplegada   | **1.19.0**                                                                                                                      |
| Visibilidad          | `review` → `public` (aprobada automáticamente en ~4 min)                                                                        |
| Server config        | `BR1xYpwVRYgwUIzIrCiC`                                                                                                          |
| Público al desplegar | `1.18.0` → `1.19.0`                                                                                                             |
| Rooms cerradas       | `KJQV7P` (lobby 1.18.0, 1 jugador) cerrada tras la promoción con `rundot rooms close --outdated --yes`                          |
| Rooms vivas          | `KWSBQZ` (lobby 1.19.0); sin errores en los últimos 10 min                                                                      |
| Cambio principal     | mini tutorial de bienvenida con seis pasos y visores 3D de cada actividad antes de crear el personaje                           |

Verificación post-deploy:

- `Review (Approved) 1.19.0`, `Public 1.19.0` y
  `publicVersionPublishedAt = 2026-11-05T04:05:09.803Z`.
- El chunk público
  `https://crway8mkf3qwlwvncbfl.h5-apps.getreel.com/1.19.0/_app/immutable/chunks/LtpWA_9h.js`
  contiene «Explore Monster Village» y su SHA-256
  (`adf680e654c2650c9140ac919b8ed48bf0665f43f8cb3f1b32ef7b4293d088c9`)
  coincide con el de `frontend/dist`.
- `rundot rooms list` quedó sin rooms en bundles viejos y la nueva room
  `KWSBQZ` arrancó en 1.19.0.

### 8.15. Deploy 1.20.0 (rocas de lava del Golem y HUD en español)

| Dato                 | Valor                                                                                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build                | `bun run build` OK; `dist` 62 MB; `server-bundle.js`, `rooms.config.json`, `map.glb`, `barnsiege.glb` y `roadmap.glb` presentes                                             |
| Checks               | `check`, `lint`, `roadmap:check`, `map:check`, `crypt:check`, `race:check`, `waves:check`, `waves:terrain`, `waves:fire`, `waves:rock`, `barnsiege:check`, `audio:check` OK |
| Predeploy            | 0 críticos, 36 warnings conocidos                                                                                                                                           |
| Versión desplegada   | **1.20.0**                                                                                                                                                                  |
| Visibilidad          | `review` → `public` (aprobada automáticamente en ~4 min)                                                                                                                    |
| Server config        | `BR1xYpwVRYgwUIzIrCiC`                                                                                                                                                      |
| Público al desplegar | `1.19.0` → `1.20.0`                                                                                                                                                         |
| Rooms cerradas       | `KWSBQZ` (lobby 1.19.0, 0 jugadores) cerrada tras la promoción con `rundot rooms close --outdated --yes`                                                                    |
| Rooms vivas          | ninguna (sin jugadores en el momento de verificar); sin errores en los últimos 10 min                                                                                       |
| Cambio principal     | el Golem lanza rocas de lava balísticas, reacción de daño en golpes débiles y HUD de Barn Siege en español                                                                  |

Verificación post-deploy:

- `Review (Approved) 1.20.0`, `Public 1.20.0` y
  `publicVersionPublishedAt = 2026-11-05T05:00:15.233Z`.
- El chunk público
  `https://crway8mkf3qwlwvncbfl.h5-apps.getreel.com/1.20.0/_app/immutable/chunks/CNpNeORo.js`
  contiene `rock-thrown` y su SHA-256
  (`9ad1fe70c9fd5e288f70844121894eaf6f7aa2aa911843c6e2dffca16bdb5177`)
  coincide con el de `frontend/dist`.
- `rundot rooms list` quedó sin rooms en bundles viejos; no había jugadores
  conectados al cerrar la room de 1.19.0.

### 8.16. Hotfix 1.20.1 (interfaz de Barn Siege de vuelta al inglés)

| Dato                 | Valor                                                                                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build                | `bun run build` OK; `dist` 62 MB; `server-bundle.js`, `rooms.config.json`, `map.glb`, `barnsiege.glb` y `roadmap.glb` presentes                                             |
| Checks               | `check`, `lint`, `roadmap:check`, `map:check`, `crypt:check`, `race:check`, `waves:check`, `waves:terrain`, `waves:fire`, `waves:rock`, `barnsiege:check`, `audio:check` OK |
| Predeploy            | 0 críticos, 36 warnings conocidos                                                                                                                                           |
| Versión desplegada   | **1.20.1**                                                                                                                                                                  |
| Visibilidad          | `review` → `public` (aprobada automáticamente en ~4 min)                                                                                                                    |
| Server config        | `BR1xYpwVRYgwUIzIrCiC`                                                                                                                                                      |
| Público al desplegar | `1.20.0` → `1.20.1`                                                                                                                                                         |
| Rooms cerradas       | `PF4RQU` (lobby 1.20.0, 1 jugador) cerrada tras la promoción con `rundot rooms close --outdated --yes`                                                                      |
| Rooms vivas          | `PY49E3` (lobby 1.20.1); sin errores en los últimos 10 min                                                                                                                  |
| Cambio principal     | se revierte la traducción al español: HUD, overlays, botones táctiles, armas y oleadas vuelven a inglés                                                                     |

Verificación post-deploy:

- `Review (Approved) 1.20.1`, `Public 1.20.1` y
  `publicVersionPublishedAt = 2026-11-05T05:35:19.332Z`.
- El chunk público
  `https://crway8mkf3qwlwvncbfl.h5-apps.getreel.com/1.20.1/_app/immutable/chunks/B2P-rqpu.js`
  contiene `Rusty Pistol` y su SHA-256
  (`7558f929368ba7a52e2601cecac992768271a35d3b52b835dff392fe2997a532`)
  coincide con el de `frontend/dist`.
- La room `PF4RQU` (1.20.0) se cerró con 1 jugador dentro y la nueva room
  `PY49E3` arrancó en 1.20.1, sin rooms en bundles viejos.

### 8.17. Deploy 1.21.0 (Witch House Deathmatch y Parkour de la Torre)

| Dato                 | Valor                                                                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build                | `bun run build` OK; `dist` 83 MB; `server-bundle.js`, `rooms.config.json`, `Parkour.glb`, `map.glb`, `barnsiege.glb` y `roadmap.glb` presentes                                     |
| Checks               | `check`, `lint`, `parkour:check`, `world:check parkour`, `roadmap:check`, `map:check`, `crypt:check`, `race:check`, `waves:check`, `barnsiege:check`, `dm:check`, `audio:check` OK |
| Predeploy            | 0 críticos, 37 warnings conocidos                                                                                                                                                  |
| Versión desplegada   | **1.21.0**                                                                                                                                                                         |
| Visibilidad          | `review` → `public` (aprobada en ~2 min)                                                                                                                                           |
| Server config        | `BR1xYpwVRYgwUIzIrCiC`                                                                                                                                                             |
| Público al desplegar | `1.20.1` → `1.21.0`                                                                                                                                                                |
| Rooms cerradas       | ninguna (no había rooms vivas al desplegar)                                                                                                                                        |
| Rooms vivas          | ninguna al verificar; sin errores en los últimos 10 min                                                                                                                            |
| Cambio principal     | Witch House Deathmatch (`minigame-6`) y Parkour de la Torre de Halloween (`minigame-7`, 12 checkpoints y 6 guardianes)                                                             |

Verificación post-deploy:

- `Review (Approved) 1.21.0`, `Public 1.21.0` y
  `publicVersionPublishedAt = 2026-11-05T23:20:09.183Z`.
- El chunk público
  `https://crway8mkf3qwlwvncbfl.h5-apps.getreel.com/1.21.0/_app/immutable/chunks/B_ShmzsO.js`
  contiene `Parkour` y su SHA-256
  (`4be1f602bf64098c6beddb2f2d0da5d205db1468375904011e81265babfa124`)
  coincide con el de `frontend/dist`.
- `Parkour.glb` responde `200` en el bundle público y su SHA-256 coincide con
  el mapa original (`f70a40bb…`).
- `rundot rooms list` no muestra rooms vivas y `rooms logs --level error` no
  devuelve líneas.

### 8.18. Hotfix 1.21.1 (caída en la salida del Parkour)

| Dato                 | Valor                                                                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build                | `bun run build` OK; `dist` 83 MB; `server-bundle.js`, `rooms.config.json` y `Parkour.glb` presentes                                                            |
| Checks               | `check`, `lint`, `parkour:check`, `world:check parkour`, `barnsiege:check` OK                                                                                  |
| Predeploy            | 0 críticos, 37 warnings conocidos                                                                                                                              |
| Versión desplegada   | **1.21.1**                                                                                                                                                     |
| Visibilidad          | `review` → `public` (aprobada en ~1 min)                                                                                                                       |
| Server config        | `BR1xYpwVRYgwUIzIrCiC`                                                                                                                                         |
| Público al desplegar | `1.21.0` → `1.21.1`                                                                                                                                            |
| Rooms cerradas       | `H464GT` (lobby 1.21.0, 1 jugador) cerrada tras la promoción con `rundot rooms close --outdated --yes`                                                         |
| Rooms vivas          | ninguna al verificar; sin errores en los últimos 10 min                                                                                                        |
| Cambio principal     | Corregida la caída en la salida del Parkour: rejilla sobre la superficie real de `HP_SpawnPad` y triángulos grandes replicados en todas las celdas de colisión |

Verificación post-deploy:

- `Review (Approved) 1.21.1`, `Public 1.21.1` y
  `publicVersionPublishedAt = 2026-11-05T23:40:13.281Z`.
- El chunk público
  `https://crway8mkf3qwlwvncbfl.h5-apps.getreel.com/1.21.1/_app/immutable/chunks/DMVdr6j8.js`
  tiene SHA-256
  (`176bcd73552bec4fd854da276e92ceb2b6ff05d07a14a6a073e39570311bc890`)
  idéntico al de `frontend/dist`.
- `Parkour.glb` responde `200` en el bundle público.
- La room `H464GT` (1.21.0, 1 jugador) se cerró tras la promoción.

### 8.19. Hotfix 1.21.2 (guardianes del Parkour y altura de salto)

| Dato                 | Valor                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| Build                | `bun run build` OK; `dist` 83 MB; `server-bundle.js`, `rooms.config.json` y `Parkour.glb` presentes           |
| Checks               | `check`, `lint`, `parkour:check`, `world:check parkour` OK                                                    |
| Predeploy            | 0 críticos, 37 warnings conocidos                                                                             |
| Versión desplegada   | **1.21.2**                                                                                                    |
| Visibilidad          | `review` → `public` (aprobada al desplegar)                                                                   |
| Server config        | `BR1xYpwVRYgwUIzIrCiC`                                                                                        |
| Público al desplegar | `1.21.1` → `1.21.2`                                                                                           |
| Rooms cerradas       | `NPD3WQ` (lobby 1.21.1, 2 jugadores) cerrada con `rundot rooms close --outdated --yes` tras la promoción      |
| Rooms vivas          | `6N5RTC` (lobby 1.21.2); sin errores en los últimos 10 min                                                    |
| Cambio principal     | los seis guardianes se posicionan en su checkpoint cada frame y el salto del Parkour sube a 8.0 m/s (≈1.78 m) |

Verificación post-deploy:

- `Review (Approved) 1.21.2`, `Public 1.21.2` y
  `publicVersionPublishedAt = 2026-11-06T00:10:08.744Z`.
- El chunk público
  `https://crway8mkf3qwlwvncbfl.h5-apps.getreel.com/1.21.2/_app/immutable/chunks/CCum_rzO.js`
  tiene SHA-256 `bd92639e…` idéntico al de `frontend/dist` y contiene
  `golem-cp2`.
- `Parkour.glb` responde `200` y su SHA-256 es el original
  (`f70a40bb…`).
- La room `NPD3WQ` (1.21.1) se cerró y la nueva room `6N5RTC` arrancó en
  1.21.2, sin rooms en bundles viejos.

### 8.20. Deploy 1.21.3 (guardianes del Parkour más agresivos y victoria clara)

| Dato                 | Valor                                                                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build                | `bun run build` OK; `dist` 83 MB; `server-bundle.js` 132 KB, `rooms.config.json` y `Parkour.glb` presentes                                                       |
| Checks               | `check` (0 errores, 0 warnings), `lint`, `parkour:check` y `world:check parkour` OK                                                                              |
| Predeploy            | 0 críticos, 37 warnings conocidos                                                                                                                                |
| Versión desplegada   | **1.21.3**                                                                                                                                                       |
| Visibilidad          | `review` → `public` (aprobada a las 00:45:09 UTC)                                                                                                                |
| Server config        | `BR1xYpwVRYgwUIzIrCiC`                                                                                                                                           |
| Público al desplegar | `1.21.2` → `1.21.3`                                                                                                                                              |
| Rooms cerradas       | `6N5RTC` (lobby 1.21.2, 2 jugadores) cerrada con `rundot rooms close --outdated --yes` tras la promoción                                                         |
| Rooms vivas          | `A5HFGD` (lobby 1.21.3); sin errores en los últimos 5 min                                                                                                        |
| Cambio principal     | guardianes que patrullan junto a su checkpoint, sensan desde más lejos, golpean con más onda y empuje; meta rectangular en toda la terraza y overlay de victoria |

Verificación post-deploy:

- `Review (Approved) 1.21.3`, `Public 1.21.3` y
  `publicVersionPublishedAt = 2026-11-06T00:45:09.092Z`.
- El chunk público
  `https://crway8mkf3qwlwvncbfl.h5-apps.getreel.com/1.21.3/_app/immutable/chunks/DmoKMWfr.js`
  tiene SHA-256 `19ad6f07…` idéntico al de `frontend/dist` y contiene
  `golem-cp2`, `patrolRadius` y `YOU WIN!`.
- `Parkour.glb` responde `200` y su SHA-256 es el original
  (`f70a40bb…`).
- La room `6N5RTC` (1.21.2) se cerró y la nueva room `A5HFGD` arrancó en
  1.21.3, sin rooms en bundles viejos.

### 8.21. Hotfix 1.21.4 (overlays del Parkour y patrulla animada)

| Dato                 | Valor                                                                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build                | `bun run build` OK; `dist` 83 MB; `server-bundle.js` 132 KB, `rooms.config.json` y `Parkour.glb` presentes                                           |
| Checks               | `check` (0 errores, 0 warnings), `lint`, `parkour:check` y `world:check parkour` OK                                                                  |
| Predeploy            | 0 críticos, 37 warnings conocidos                                                                                                                    |
| Versión desplegada   | **1.21.4**                                                                                                                                           |
| Visibilidad          | `review` → `public` (aprobada a las 01:30:26 UTC)                                                                                                    |
| Server config        | `BR1xYpwVRYgwUIzIrCiC`                                                                                                                               |
| Público al desplegar | `1.21.3` → `1.21.4`                                                                                                                                  |
| Rooms cerradas       | `A5HFGD` (lobby 1.21.3, 2 jugadores) cerrada con `rundot rooms close --outdated --yes` tras la promoción                                             |
| Rooms vivas          | `33UKSC` (lobby 1.21.4); sin errores en los últimos 5 min                                                                                            |
| Cambio principal     | el overlay de victoria se oculta al entrar en `results` (ya no tapa el panel de resultados) y los guardianes patrullan más rápido con clip `HR_walk` |

Verificación post-deploy:

- `Review (Approved) 1.21.4`, `Public 1.21.4` y
  `publicVersionPublishedAt = 2026-11-06T01:30:26.848Z`.
- El chunk público
  `https://crway8mkf3qwlwvncbfl.h5-apps.getreel.com/1.21.4/_app/immutable/chunks/D-bubUC8.js`
  tiene SHA-256 `d346654c…` idéntico al de `frontend/dist`.
- `Parkour.glb` responde `200` y su SHA-256 es el original
  (`f70a40bb…`).
- La room `A5HFGD` (1.21.3) se cerró y la nueva room `33UKSC` arrancó en
  1.21.4, sin rooms en bundles viejos.

### 8.22. Hotfix 1.21.5 (Ghost/Demon intercambiados, ataques más fuertes y Ghost perseguidor)

| Dato                 | Valor                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Build                | `bun run build` OK; `dist` 83 MB; `server-bundle.js` 136 KB, `rooms.config.json` y `Parkour.glb` presentes              |
| Checks               | `check` (0 errores, 0 warnings), `lint`, `parkour:check` y `world:check parkour` OK                                     |
| Predeploy            | 0 críticos, 37 warnings conocidos                                                                                       |
| Versión desplegada   | **1.21.5**                                                                                                              |
| Visibilidad          | `review` → `public` (aprobada a las 02:10:28 UTC)                                                                       |
| Server config        | sin cambios (`BR1xYpwVRYgwUIzIrCiC`)                                                                                    |
| Público al desplegar | `1.21.4` → `1.21.5`                                                                                                     |
| Rooms cerradas       | `33UKSC` (lobby 1.21.4, 2 jugadores) cerrada con `rundot rooms close --outdated --yes` tras la promoción                |
| Rooms vivas          | `3UH2ND` (lobby 1.21.5); sin errores en los últimos 5 min                                                               |
| Cambio principal     | Ghost en CP6 y Demon en CP12; todos los guardianes golpean más fuerte y el Ghost persigue al jugador dentro de su plaza |

Verificación post-deploy:

- `Review (Approved) 1.21.5`, `Public 1.21.5` y
  `publicVersionPublishedAt = 2026-11-06T02:10:28.543Z`.
- El chunk público
  `https://crway8mkf3qwlwvncbfl.h5-apps.getreel.com/1.21.5/_app/immutable/chunks/BNaq1yT1.js`
  tiene SHA-256 `c8d5c45f…` idéntico al de `frontend/dist`.
- `Parkour.glb` responde `200` y su SHA-256 es el original
  (`f70a40bb…`).
- La room `33UKSC` (1.21.4) se cerró y la nueva room `3UH2ND` arrancó en
  1.21.5, sin rooms en bundles viejos.

### 8.23. Hotfix 1.21.6 (checkpoint del Minijuego 1 retirado)

| Dato                 | Valor                                                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Build                | `bun run build` OK; `dist` 83 MB; `server-bundle.js` 133 KB, `rooms.config.json` y `Parkour.glb` presentes                       |
| Checks               | `prettier --check` sobre `checkpoints.svelte.ts` OK; no se ejecutó `check` global por haber otros agentes trabajando en paralelo |
| Predeploy            | 0 críticos, 37 warnings conocidos                                                                                                |
| Versión desplegada   | **1.21.6**                                                                                                                       |
| Visibilidad          | `review` → `public` (aprobada a las 03:20:14 UTC)                                                                                |
| Server config        | sin cambios (`BR1xYpwVRYgwUIzIrCiC`)                                                                                             |
| Público al desplegar | `1.21.5` → `1.21.6`                                                                                                              |
| Rooms cerradas       | `3UH2ND` (lobby 1.21.5, 1 jugador) cerrada con `rundot rooms close --outdated --yes` tras la promoción                           |
| Rooms vivas          | `5WNSWU` (lobby 1.21.6, 2 jugadores); sin errores en los últimos 10 min                                                          |
| Cambio principal     | se retira del lobby el checkpoint físico del Minijuego 1 («La casa de las 5 llaves»), que ya no se usa en ningún juego           |

Verificación post-deploy:

- `Review (Approved) 1.21.6`, `Public 1.21.6` y
  `publicVersionPublishedAt = 2026-11-06T03:20:14.095Z`.
- El chunk público
  `https://crway8mkf3qwlwvncbfl.h5-apps.getreel.com/1.21.6/_app/immutable/chunks/niB_4J56.js`
  tiene SHA-256 `43451778…` idéntico al de `frontend/dist`.
- La room `3UH2ND` (1.21.5, 1 jugador) se cerró y `5WNSWU` arrancó en 1.21.6,
  sin rooms en bundles viejos.

### 8.24. Hotfix 1.21.7 (checkpoint del Parkour en la entrada de la torre)

| Dato                 | Valor                                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Build                | `bun run build` OK; `dist` 83 MB; `server-bundle.js` 133 KB, `rooms.config.json` y `Parkour.glb` presentes                                |
| Predeploy            | 0 críticos, 37 warnings conocidos                                                                                                         |
| Versión desplegada   | **1.21.7**                                                                                                                                |
| Visibilidad          | `review` → `public` (aprobada a las 03:45:28 UTC)                                                                                         |
| Server config        | sin cambios (`BR1xYpwVRYgwUIzIrCiC`)                                                                                                      |
| Público al desplegar | `1.21.6` → `1.21.7`                                                                                                                       |
| Rooms cerradas       | `5WNSWU` (lobby 1.21.6) y `SXF7H4` (parkour 1.21.6), 0 jugadores al cerrar, con `rundot rooms close --outdated --yes`                     |
| Rooms vivas          | `NBXN9M` (lobby 1.21.7); sin errores en los últimos 10 min                                                                                |
| Cambio principal     | el checkpoint del Parkour se mueve a `(33.0, 0.4, −23.9)`, delante de las escaleras de entrada del castillo, alineado con `PARKOUR_ENTRY` |

Verificación post-deploy:

- `Review (Approved) 1.21.7`, `Public 1.21.7` y
  `publicVersionPublishedAt = 2026-11-06T03:45:28.278Z`.
- El chunk público
  `https://crway8mkf3qwlwvncbfl.h5-apps.getreel.com/1.21.7/_app/immutable/chunks/B2SoaiHv.js`
  tiene SHA-256 `6d80bc1d…` idéntico al de `frontend/dist`.
- Las rooms `5WNSWU` y `SXF7H4` (bundle 1.21.6) se cerraron; `NBXN9M` arrancó
  en 1.21.7 y no quedan rooms en bundles viejos.

### 8.25. Hotfix 1.21.8 (salida de la cripta en la puerta del mausoleo y z-fighting del Parkour)

| Dato                 | Valor                                                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build                | `bun run build` OK; `dist` 83 MB; `server-bundle.js` 133 KB, `rooms.config.json` y `Parkour.glb` presentes                                                  |
| Predeploy            | 0 críticos, 37 warnings conocidos                                                                                                                           |
| Versión desplegada   | **1.21.8**                                                                                                                                                  |
| Visibilidad          | `review` → `public` (aprobada a las 04:50:12 UTC)                                                                                                           |
| Server config        | sin cambios (`BR1xYpwVRYgwUIzIrCiC`)                                                                                                                        |
| Público al desplegar | `1.21.7` → `1.21.8`                                                                                                                                         |
| Rooms cerradas       | `NBXN9M` (lobby 1.21.7, 1 jugador) cerrada con `rundot rooms close --outdated --yes` tras la promoción                                                      |
| Rooms vivas          | ninguna al verificar; sin errores en los últimos 10 min                                                                                                     |
| Cambio principal     | el checkpoint y la salida de la cripta pasan a `x = 21.48` (puerta del mausoleo) y las mallas `_Top` del Parkour se elevan 3 cm para eliminar el z-fighting |

Verificación post-deploy:

- `Review (Approved) 1.21.8`, `Public 1.21.8` y
  `publicVersionPublishedAt = 2026-11-06T04:50:12.651Z`.
- El chunk público
  `https://crway8mkf3qwlwvncbfl.h5-apps.getreel.com/1.21.8/_app/immutable/chunks/dOcjrKD0.js`
  tiene SHA-256 `d0cdef8b…` idéntico al de `frontend/dist`.
- La room `NBXN9M` (1.21.7) se cerró y no quedaron rooms en bundles viejos.

### 8.26. Deploy 1.21.9 (nuevo thumbnail de Monster Village)

| Dato                 | Valor                                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Build                | no se reconstruyó; se reemplazó solo `thumbnail.jpg` en `static/` y `dist/` sobre el build existente de 1.21.8                          |
| Checks               | `rundot predeploy --phase build --json` OK: 21 checks, 0 críticos, 37 warnings conocidos                                                |
| Versión desplegada   | **1.21.9**                                                                                                                              |
| Visibilidad          | `review` (pendiente; al desplegar, `Public` seguía en 1.21.8)                                                                           |
| Server config        | sin cambios (`BR1xYpwVRYgwUIzIrCiC`)                                                                                                    |
| Público al desplegar | `1.21.8`                                                                                                                                 |
| Rooms cerradas       | ninguna (`--close-rooms` no se usó)                                                                                                      |
| Cambio principal     | thumbnail nuevo: recorte cuadrado 512×512 de `monsterVillage.jpeg` (1376×768), centrado en el logo y la aldea                           |
| Thumbnail            | 105 989 bytes; SHA-256 `095cd21a…`; idéntico en `static/thumbnail.jpg` y `dist/thumbnail.jpg`; `deploy --bump patch --public` lo subió |

Verificación post-deploy:

- `rundot game list-releases`: `Private 1.21.9`, `Review 1.21.9`, `Public 1.21.8`.
- `rundot game set-public --version 1.21.9` reenvió la versión a revisión; no
  publica al instante (RUN sigue el flujo de aprobación automática de §6.2).
- Pendiente de aprobación para que `Public` pase a 1.21.9 y el thumbnail nuevo
  aparezca en Explore.

## 9. Riesgos y mitigaciones

| Riesgo                                          | Mitigación                                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| Changelog rechazado por moderación              | Usar texto corto en inglés.                                                             |
| `dist/server-bundle.js` ausente                 | Revisar `dist/` antes de desplegar; no borrar `dist` a mano.                            |
| Review tarda o no se aprueba                    | Probar con `?tag=review&k=...` o `?tag=private&k=...`.                                  |
| Rooms viejas con jugadores                      | `--close-rooms`; avisar que la room se reinicia.                                        |
| La versión pública sigue vieja                  | Confirmar `tags.public.versionId`; no asumir que `deploy --public` publica al instante. |
| Assets grandes                                  | 6 GLB pesan >300 KB; warning de predeploy, no error. Migrar a CDN en otra tarea.        |
| Upload muere al 100% con `HttpRequestException` | Quitar `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY` del entorno; el upload directo funciona.  |

## 10. Progreso

| Fecha      | Estado     | Nota                                                                                                                                                                                                                                                                                                                                                              |
| ---------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-02 | completado | Procedimiento documentado. Build y deploy 1.12.0 realizados. Review aprobada y `Public` actualizado a 1.12.0; room vieja `BCV7MW` cerrada y nueva `VGYTV3` en 1.12.0.                                                                                                                                                                                             |
| 2026-11-02 | completado | Deploy 1.12.1 completado: Review aprobada, `Public` en 1.12.1, rooms viejas cerradas y room `VRBMTG` en el bundle nuevo.                                                                                                                                                                                                                                          |
| 2026-11-02 | completado | Deploy 1.12.2 completado: Review aprobada, `Public` en 1.12.2 y room `7A29P3` en el bundle nuevo.                                                                                                                                                                                                                                                                 |
| 2026-11-03 | review     | Deploy 1.13.0 subido a Review con sincronización de skins; `Public` sigue en 1.12.7. Room `9K7GV6` (1.12.6) cerrada.                                                                                                                                                                                                                                              |
| 2026-11-03 | completado | Deploy 1.14.0 completado con el cielo nocturno de Halloween; `Public` en 1.14.0 y sin rooms vivas al verificar.                                                                                                                                                                                                                                                   |
| 2026-11-03 | review     | Deploy 1.16.0 subido a Review con el sistema de audio procedural; `Public` sigue en 1.15.13.                                                                                                                                                                                                                                                                      |
| 2026-11-04 | completado | Review 1.16.0 aprobada y `Public` actualizado a 1.16.0. Deploy 1.16.1 (correcciones de audio) aprobado y `Public` en 1.16.1; rooms `NG7SKC` (1.15.13) y `JJHGZA` (1.16.0) cerradas, room `UK9VE8` en 1.16.1.                                                                                                                                                      |
| 2026-11-04 | completado | Deploy 1.16.2 aprobado y `Public` en 1.16.2: música de Halloween con volumen propio, victoria de misión y cuentas atrás 3-2-1. Room `TFNMGR` (1.16.1) cerrada.                                                                                                                                                                                                    |
| 2026-11-04 | completado | Deploy 1.16.3 aprobado y `Public` en 1.16.3: tema de Halloween recompuesto con theremin, tritono y descenso cromático. Room anterior cerrada.                                                                                                                                                                                                                     |
| 2026-11-04 | completado | Deploy 1.17.0 aprobado y `Public` en 1.17.0: arena `barnsiege.glb`, spawns/portales nuevos y checkpoint delante de la puerta del granero. Predeploy con 0 críticos, sin rooms viejas que cerrar y room de Review aprobada automáticamente.                                                                                                                        |
| 2026-11-04 | completado | **Procedimiento corregido**: se documenta que `deploy --public` envía a Review (no publica al instante), que la promoción a Public la hace RUN al aprobar (~3–4 min) y que `update-release`, `copy-release` y `set-public` no pueden forzarla. Verificación por `list-releases` (`Review (Approved)`) y por `tags.public.versionId` / `publicVersionPublishedAt`. |
| 2026-11-04 | completado | Deploy 1.17.1 aprobado y `Public` en 1.17.1: hotfix del crash de Barn Siege (`BS_Scarecrow_Field_B`). El upload fallaba al 100% por `HTTP_PROXY`/`HTTPS_PROXY`; sin proxy subió a la primera. Room `J5DDV5` (1.17.0, 2 jugadores) cerrada tras la promoción.                                                                                                      |
| 2026-11-04 | completado | Deploy 1.17.2 aprobado y `Public` en 1.17.2: colisión por celdas de 16 m en Barn Siege para eliminar el lag de 200–1000 ms/frame y el bloqueo del spawn. Predeploy 0 críticos, upload sin proxy correcto, room `9NJYR9` (1.17.1) cerrada y chunk público idéntico a `dist`.                                                                                       |
| 2026-11-04 | completado | Deploy 1.18.0 aprobado y `Public` en 1.18.0: modal de ajustes centrado con rail de secciones, visor 3D de skins y miniaturas 3D de misiones. Predeploy 0 críticos; room `2UDN6X` (1.17.3, 1 jugador) cerrada tras la promoción y chunk público idéntico a `dist`.                                                                                                 |
| 2026-11-04 | completado | Deploy 1.19.0 aprobado y `Public` en 1.19.0: mini tutorial de bienvenida con seis pasos y visores 3D de cada actividad antes de crear el personaje. Predeploy 0 críticos; room `KJQV7P` (1.18.0, 1 jugador) cerrada tras la promoción, room `KWSBQZ` en 1.19.0 y chunk público idéntico a `dist`.                                                                 |

| 2026-11-04 | completado | Deploy 1.20.0 aprobado y `Public` en 1.20.0: el Golem lanza rocas de lava balísticas con empuje, reacción de daño en golpes débiles y HUD de Barn Siege en español. Predeploy 0 críticos; room `KWSBQZ` (1.19.0, 0 jugadores) cerrada tras la promoción y chunk público idéntico a `dist`. |
| 2026-11-04 | completado | Hotfix 1.20.1 aprobado y `Public` en 1.20.1: la interfaz de Barn Siege vuelve al inglés (HUD, overlays, botones táctiles, armas y oleadas). Predeploy 0 críticos; room `PF4RQU` (1.20.0, 1 jugador) cerrada tras la promoción, room `PY49E3` en 1.20.1 y chunk público idéntico a `dist`. |
| 2026-11-05 | completado | Deploy 1.21.0 aprobado y `Public` en 1.21.0: Witch House Deathmatch y Parkour de la Torre de Halloween. Predeploy 0 críticos, upload sin proxy correcto, sin rooms vivas al desplegar, chunk público idéntico a `dist` y `Parkour.glb` servido con su hash original. |
| 2026-11-05 | completado | Hotfix 1.21.1 aprobado y `Public` en 1.21.1: caída en la salida del Parkour corregida (rejilla sobre `HP_SpawnPad` real y triángulos grandes replicados entre celdas de colisión). Predeploy 0 críticos; room `H464GT` (1.21.0, 1 jugador) cerrada tras la promoción y chunk público idéntico a `dist`. |
| 2026-11-05 | completado | Hotfix 1.21.2 aprobado y `Public` en 1.21.2: los guardianes del Parkour se colocan en su checkpoint cada frame y el salto sube a 8.0 m/s (≈1.78 m). Predeploy 0 críticos; room `NPD3WQ` (1.21.1, 2 jugadores) cerrada tras la promoción, room `6N5RTC` en 1.21.2 y chunk público idéntico a `dist`. |
| 2026-11-05 | completado | Deploy 1.21.3 aprobado y `Public` en 1.21.3: guardianes del Parkour que patrullan alrededor de su checkpoint, sensan desde más lejos (17–32 m), golpean con más onda y empuje (hasta 16/9 m/s), meta rectangular de 25×25 m en la terraza y overlay «YOU WIN!»/«FINISHED!». Predeploy 0 críticos; room `6N5RTC` (1.21.2, 2 jugadores) cerrada tras la promoción, room `A5HFGD` en 1.21.3 y chunk público idéntico a `dist`. |
| 2026-11-05 | completado | Hotfix 1.21.4 aprobado y `Public` en 1.21.4: el overlay de victoria deja de tapar el panel de resultados y los guardianes patrullan más rápido con animación `HR_walk` (órbita verificada dentro de su plaza). Predeploy 0 críticos; room `A5HFGD` (1.21.3, 2 jugadores) cerrada tras la promoción, room `33UKSC` en 1.21.4 y chunk público idéntico a `dist`. |
| 2026-11-05 | completado | Hotfix 1.21.5 aprobado y `Public` en 1.21.5: Ghost y Demon intercambian posición (CP6/CP12), todos los guardianes aumentan rango, impacto, empuje y cadencia, y el Ghost persigue al jugador dentro de su plaza sin salir del checkpoint. Predeploy 0 críticos; room `33UKSC` (1.21.4, 2 jugadores) cerrada tras la promoción, room `3UH2ND` en 1.21.5 y chunk público idéntico a `dist`. |

| 2026-11-05 | completado | Hotfix 1.21.6 aprobado y `Public` en 1.21.6: se retira del lobby el checkpoint del Minijuego 1 («La casa de las 5 llaves»), sin uso. Predeploy 0 críticos; room `3UH2ND` (1.21.5, 1 jugador) cerrada tras la promoción, room `5WNSWU` en 1.21.6 y chunk público idéntico a `dist`. |

| 2026-11-05 | completado | Hotfix 1.21.7 aprobado y `Public` en 1.21.7: el checkpoint del Parkour pasa a `(33.0, 0.4, −23.9)`, delante de las escaleras de entrada de la torre y alineado con `PARKOUR_ENTRY`. Predeploy 0 críticos; rooms `5WNSWU` (lobby) y `SXF7H4` (parkour) de 1.21.6 cerradas, room `NBXN9M` en 1.21.7 y chunk público idéntico a `dist`. |

| 2026-11-05 | completado | Hotfix 1.21.8 aprobado y `Public` en 1.21.8: checkpoint y salida de la cripta reubicados en la puerta del mausoleo (`x = 21.48`) y mallas `_Top` del Parkour elevadas 3 cm para quitar el z-fighting. Predeploy 0 críticos; room `NBXN9M` (1.21.7, 1 jugador) cerrada y chunk público idéntico a `dist`. |

| 2026-11-06 | review | Deploy 1.21.9 subido a Review solo con el nuevo thumbnail 512×512 (recorte de `monsterVillage.jpeg`), sin rebuild. Predeploy 0 críticos y 37 warnings conocidos; `Public` sigue en 1.21.8 hasta la aprobación automática. |

## 11. Changelog

- 2026-11-02 — Creación del spec con el flujo real de build, predeploy, deploy,
  verificación y riesgos.
- 2026-11-02 — Deploy 1.12.0 completado: Review aprobada, `Public` en 1.12.0,
  room `BCV7MW` cerrada y room nueva `VGYTV3` arrancada en el bundle nuevo.
- 2026-11-02 — Deploy 1.12.1 completado con spawn del Roadmap en
  `HW_StartFinish_Checker` y coche local. Review aprobada, `Public` en 1.12.1 y
  room nueva `VRBMTG` en el bundle nuevo.
- 2026-11-02 — Deploy 1.12.2 completado: el coche se recoloca en la salida cada
  vez que se entra al Roadmap. `Public` en 1.12.2 y room `7A29P3` en el bundle
  nuevo.
- 2026-11-03 — Deploy 1.13.0 subido a Review con la sincronización de skins del
  mapa y la cripta. `Public` se mantiene en 1.12.7 hasta la aprobación; room
  `9K7GV6` (1.12.6) cerrada.
- 2026-11-03 — Deploy 1.14.0 completado con el cielo nocturno de Halloween
  (luna, estrellas, nebulosa y nubes animadas). Review aprobada y `Public` en
  1.14.0; sin rooms vivas al verificar.
- 2026-11-03 — Deploy 1.16.0 subido a Review con el sistema de audio
  procedural. Predeploy con 0 críticos; `Public` se mantiene en 1.15.13 hasta
  la aprobación.
- 2026-11-04 — Review 1.16.0 aprobada; `Public` pasa a 1.16.0. Deploy 1.16.1
  con correcciones de audio (motor de coche aparcado, gatos, momias y rollos
  de papel) aprobado y `Public` en 1.16.1. Rooms `NG7SKC` (1.15.13) y
  `JJHGZA` (1.16.0) cerradas; `UK9VE8` sirve 1.16.1.
- 2026-11-04 — Deploy 1.16.2 aprobado y `Public` en 1.16.2: música de
  Halloween procedural con slider propio, jingle de victoria de misión y
  cuenta atrás 3-2-1 en carrera, cripta y Barn Siege. Room `TFNMGR` cerrada.
- 2026-11-04 — Deploy 1.16.3 aprobado y `Public` en 1.16.3: la música se
  recompone para sonar más tétrica (theremin, menor armónica, tritono,
  descenso cromático, bajo staccato y órgano).
- 2026-11-04 — Deploy 1.16.4 aprobado y `Public` en 1.16.4: jingles propios de
  victoria (`mission_win`) y derrota (`mission_lose`) para gatos, cripta, Barn
  Siege y carrera. Room anterior cerrada.
- 2026-11-04 — Rebuild y deploy 1.16.5 aprobado y `Public` en 1.16.5. Room
  anterior cerrada.
- 2026-11-04 — Deploy 1.17.0 aprobado y `Public` en 1.17.0: Barn Siege se juega
  en la aldea `barnsiege.glb` (spawns, portales, coche y físicas nuevos) y el
  checkpoint de entrada queda delante de la puerta sur del granero. Review
  aprobada automáticamente.
- 2026-11-04 — **SPEC corregido**: se separa “desplegar” (§6.1) de “convertir
  Review en Public” (§6.2), se documenta el flujo real de aprobación automática
  y se listan los comandos que NO pueden forzar el tag `Public`
  (`update-release`, `copy-release`, `set-public`) con sus errores reales.
- 2026-11-04 — Deploy 1.17.1 aprobado y `Public` en 1.17.1: hotfix del crash de
  Barn Siege. Se documenta (§6.1, §9) que `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY`
  rompen el upload grande con `HttpRequestException` al 100%; sin proxy subió a
  la primera. Room `J5DDV5` (1.17.0, 2 jugadores) cerrada tras la promoción.
- 2026-11-04 — Deploy 1.17.2 aprobado y `Public` en 1.17.2: Barn Siege pasa a
  colisión por celdas (`chunked`, celdas de 16 m) para eliminar el lag de
  200–1000 ms/frame y el bloqueo del spawn. Predeploy con 0 críticos; la room
  `9NJYR9` (1.17.1, 0 jugadores) se cerró tras la promoción. El chunk público
  `CWZIhlyP.js` contiene `chunkSize:16` y coincide byte a byte con `dist`
  (SHA-256 `b871b871…`).
- 2026-11-04 — Deploy 1.18.0 aprobado y `Public` en 1.18.0: modal de ajustes
  centrado con rail lateral de secciones, visor 3D de skins con equipado directo
  y miniaturas 3D por misión (gato, calavera y coche). Predeploy con 0 críticos;
  upload sin proxy correcto, chunk público idéntico a `dist` y room `2UDN6X`
  (1.17.3) cerrada tras la promoción.
- 2026-11-04 — Deploy 1.19.0 aprobado y `Public` en 1.19.0: mini tutorial de
  bienvenida de seis pasos con visores 3D de cada actividad (exploración, gatos,
  Grand Prix, Haunted Highway, cripta y Barn Siege) antes de crear el personaje.
  Predeploy con 0 críticos; upload sin proxy correcto, chunk público idéntico a
  `dist` y room `KJQV7P` (1.18.0, 1 jugador) cerrada tras la promoción.
- 2026-11-04 — Deploy 1.20.0 aprobado y `Public` en 1.20.0: el Golem de Barn
  Siege sustituye el cuerpo a cuerpo por rocas de lava balísticas con estallido,
  empuje y esquiva; los golpes débiles también disparan la reacción de daño y el
  HUD, las armas y las oleadas pasan a español. Se validan además
  `waves:terrain`, `waves:fire` y `waves:rock`. Predeploy con 0 críticos; room
  `KWSBQZ` (1.19.0, 0 jugadores) cerrada tras la promoción y chunk público
  idéntico a `dist`.
- 2026-11-04 — Hotfix 1.20.1 aprobado y `Public` en 1.20.1: se revierte la
  traducción al español de Barn Siege. HUD, overlays, botones táctiles, armas y
  oleadas vuelven a inglés. Predeploy con 0 críticos; room `PF4RQU` (1.20.0,
  1 jugador) cerrada tras la promoción, room `PY49E3` en 1.20.1 y chunk público
  idéntico a `dist`.
- 2026-11-05 — Deploy 1.21.0 aprobado y `Public` en 1.21.0: Witch House
  Deathmatch (`minigame-6`) y Parkour de la Torre de Halloween (`minigame-7`,
  12 checkpoints y 6 guardianes). Se añaden `parkour:check` y
  `world:check parkour` al checklist. Predeploy con 0 críticos; sin rooms vivas
  al desplegar, chunk público `B_ShmzsO.js` idéntico a `dist` y `Parkour.glb`
  servido con su SHA-256 original.
- 2026-11-05 — Hotfix 1.21.1 aprobado y `Public` en 1.21.1: se corrige la
  caída al empezar el Parkour. La rejilla de salida queda sobre la superficie
  octogonal real de `HP_SpawnPad` y `ChunkedColliders` replica cada triángulo
  en todas las celdas que cubre para no dejar agujeros bajo suelos grandes.
  Predeploy con 0 críticos; room `H464GT` (1.21.0, 1 jugador) cerrada y chunk
  público `DMVdr6j8.js` idéntico a `dist`.
- 2026-11-05 — Hotfix 1.21.2 aprobado y `Public` en 1.21.2: los seis guardianes
  del Parkour se posicionan en su checkpoint en cada frame (antes todo el cast
  aparecía en el origen del mapa) y el salto del parkour sube de 7.0 a 8.0 m/s
  (≈1.36 → 1.78 m) para superar los obstáculos altos. Predeploy con 0 críticos;
  room `NPD3WQ` (1.21.1, 2 jugadores) cerrada, room `6N5RTC` en 1.21.2 y chunk
  público `CCum_rzO.js` idéntico a `dist`.
- 2026-11-05 — Deploy 1.21.3 aprobado y `Public` en 1.21.3: los guardianes del
  Parkour patrullan en órbita lenta alrededor de su checkpoint (sin salir de la
  plaza), sensan desde más lejos (Golem 30 m, Witch 26 m, Demon 17 m, Vampire
  24 m, Pumpkin 32 m, Ghost 5 m), usan radios de onda de 3.2–17 m y empujes de
  hasta 14/8 m/s. La meta pasa a una zona rectangular de 25×25 m que cubre toda
  la terraza, con 3.5 s de gracia y overlay «YOU WIN!»/«FINISHED!». Predeploy
  con 0 críticos y `check` limpio; room `6N5RTC` (1.21.2, 2 jugadores) cerrada,
  room `A5HFGD` en 1.21.3 y chunk público `DmoKMWfr.js` idéntico a `dist`.
- 2026-11-05 — Hotfix 1.21.4 aprobado y `Public` en 1.21.4: el overlay de
  victoria se oculta al entrar en `results` (antes seguía en `z-50` y tapaba el
  panel de resultados), se elimina la capa duplicada de «Finished» y el panel
  de resultados pasa a `z-50`. Los guardianes aumentan su velocidad de patrulla
  a 0.5–1.4 m/s y reproducen `HR_walk` mientras avanzan; `parkour:check`
  verifica que la órbita completa quede dentro del AABB de su plaza. Predeploy
  con 0 críticos; room `A5HFGD` (1.21.3, 2 jugadores) cerrada, room `33UKSC` en
  1.21.4 y chunk público `D-bubUC8.js` idéntico a `dist`.
- 2026-11-05 — Hotfix 1.21.5 aprobado y `Public` en 1.21.5: el Ghost pasa al
  checkpoint 6 (`13.2, 30, −125.6`) y el Demon al 12 (`−10.9, 78, −121.4`).
  Los seis guardianes amplían rango, impacto y empuje (hasta 17/10 m/s, con
  límites autoritativos 20/11) y reducen cooldowns. El Ghost es melee y
  persigue al jugador dentro de `chaseBounds`, deteniéndose a 1.5 m; al salir
  de la plaza vuelve a su órbita y nunca abandona el checkpoint. Predeploy con
  0 críticos; room `33UKSC` (1.21.4, 2 jugadores) cerrada, room `3UH2ND` en
  1.21.5 y chunk público `BNaq1yT1.js` idéntico a `dist`.
- 2026-11-05 — Hotfix 1.21.6 aprobado y `Public` en 1.21.6: se elimina del
  lobby el checkpoint físico del Minijuego 1 (`minigame-1`, «La casa de las 5
  llaves») porque ya no se usa en ningún juego. El resto de checkpoints
  (`minigame-2`, `-3`, `-5`, `-6` y `-7`) se mantiene intacto. Predeploy con 0
  críticos; room `3UH2ND` (1.21.5, 1 jugador) cerrada, room `5WNSWU` en 1.21.6
  y chunk público `niB_4J56.js` idéntico a `dist`.
- 2026-11-05 — Hotfix 1.21.7 aprobado y `Public` en 1.21.7: el checkpoint del
  Parkour (`minigame-7`) se reubica en `(33.0, 0.4, −23.9)`, justo delante de
  las escaleras de entrada del castillo y alineado con `PARKOUR_ENTRY`, en
  lugar de `(32.9, 0.4, −7.0)`. Predeploy con 0 críticos; rooms `5WNSWU`
  (lobby 1.21.6) y `SXF7H4` (parkour 1.21.6) cerradas, room `NBXN9M` en 1.21.7
  y chunk público `B2SoaiHv.js` idéntico a `dist`.
- 2026-11-05 — Hotfix 1.21.8 aprobado y `Public` en 1.21.8: el checkpoint de la
  cripta y `MAUSOLEUM_EXIT` se mueven de `x = 23.05` a `x = 21.48`, justo en la
  puerta del mausoleo; además, las mallas `_Top` de `Parkour.glb` se elevan
  3 cm sobre su plataforma para eliminar el z-fighting del césped y los bordes.
  Predeploy con 0 críticos; room `NBXN9M` (lobby 1.21.7, 1 jugador) cerrada y
  chunk público `dOcjrKD0.js` idéntico a `dist`.
- 2026-11-06 — Deploy 1.21.9 subido a Review solo con el nuevo thumbnail de
  Monster Village: recorte cuadrado 512×512 de `monsterVillage.jpeg`
  (1376×768), centrado en el logo y la aldea, guardado en `static/` y `dist/`
  (105 989 bytes, SHA-256 `095cd21a…`). No se reconstruyó el bundle; el
  predeploy dio 0 críticos y 37 warnings conocidos y `Public` se mantiene en
  1.21.8 hasta que RUN apruebe la review.
