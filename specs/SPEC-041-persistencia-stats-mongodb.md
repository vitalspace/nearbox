---
id: SPEC-041
titulo: "Persistir estadísticas de jugador en MongoDB"
estado: completado
prioridad: alta
creado: 2026-11-14
actualizado: 2026-11-14
responsable: "opencode"
etiquetas: [backend, mongodb, mongoose, stats, api]
depende_de: []
bloquea: [leaderboard-global, perfiles-multidispositivo]
estimacion: "4h"
---

# SPEC-041 — Persistir estadísticas de jugador en MongoDB

## 1. Contexto

Hoy las estadísticas de partida viven **solo en el navegador**:

- `frontend/src/lib/state/stats.svelte.ts` define `StatsData` (versión 1) y lo
  guarda en `localStorage` con la clave `rw:stats:v1`.
- El `playerId` es un UUID generado en el cliente
  (`frontend/src/lib/state/playerProfile.svelte.ts`, `createPlayerId`).
- Los minijuegos llaman a `stats.startMission`, `completeMission`,
  `recordDeath`, `recordLap`, etc. (`minigame2.svelte.ts`,
  `minigame5.svelte.ts`, `race.svelte.ts`, `missions.svelte.ts`).
- `stats.init(playerId)` se ejecuta en `frontend/src/lib/GamePage.svelte` y
  `stats.destroy()` al desmontar.

Consecuencias: si el jugador limpia el almacenamiento, cambia de navegador o
entra desde otro dispositivo, pierde el progreso; no hay forma de construir
rankings ni de consultar métricas agregadas desde el servidor.

El backend (`backend/`) es ElysiaJS + Bun y **no tiene base de datos**: todo el
estado de juego (presencias, lobbies, minijuegos) es en memoria. MongoDB está
instalado en el entorno (`mongod` y `mongosh` disponibles en `/usr/bin`). No
hay `mongoose` en `backend/package.json`.

Este spec cubre únicamente el backend: modelos, conexión, validación, API REST
y pruebas. El cableado del cliente queda para un spec posterior.

## 2. Objetivo

Exponer una API REST en el backend para crear, leer, actualizar y reiniciar las
estadísticas de un jugador, persistiéndolas en MongoDB mediante Mongoose con
modelos tipados y operaciones atómicas idempotentes.

## 3. Alcance

**Incluye**

- Instalar `mongoose` como dependencia del backend.
- Conexión singleton a MongoDB configurable por `MONGODB_URI`.
- Modelos Mongoose: `Player`, `PlayerStats`, `StatsEvent`.
- Validación con `zod` del identificador de jugador, snapshots y eventos.
- Endpoints REST bajo `/stats`.
- Actualizaciones atómicas y monótonas (`$max`, `$inc`, pipeline updates) para
  que clientes desactualizados no retrocedan contadores.
- Log append-only de eventos con índice TTL.
- Tests de integración con `bun test` contra MongoDB local (se omiten si no hay
  base disponible).
- Variables de entorno documentadas en `backend/.env.example`.
- Documentación de los endpoints en `backend/README.md`.

**No incluye**

- Modificar `frontend/src/lib/state/stats.svelte.ts` ni ninguna pantalla.
- Autenticación/autorización de las llamadas por jugador (el `playerId` es
  actualmente un UUID público generado por el cliente).
- Anticheat o validación de que los incrementos corresponden a partidas reales.
- Leaderboards, perfiles públicos o migraciones masivas de `localStorage`.
- Sustituir el estado en memoria de presencia/lobbies/minijuegos.

## 4. Requisitos

### Funcionales

| ID   | Requisito                                                                                                         | Prioridad |
| ---- | ----------------------------------------------------------------------------------------------------------------- | --------- |
| RF-1 | Al arrancar, el backend conecta a `MONGODB_URI` (por defecto `mongodb://127.0.0.1:27017/nearbox`) sin bloquear el arranque si MongoDB no responde. | alta |
| RF-2 | `GET /stats/:playerId` devuelve la estadística existente o crea y devuelve una vacía (idempotente).               | alta      |
| RF-3 | `PUT /stats/:playerId` acepta un snapshot `StatsData` y aplica los contadores con `$max`, sin retrocesos.          | alta      |
| RF-4 | `POST /stats/:playerId/events` aplica uno o varios eventos con incrementos atómicos y actualiza `played` derivado. | alta      |
| RF-5 | `POST /stats/:playerId/reset` pone los contadores a cero conservando `createdAt` y registra un evento `reset`.     | media     |
| RF-6 | `GET /stats/health` informa el estado de la conexión a MongoDB sin exponer credenciales.                           | media     |
| RF-7 | Los errores de validación responden `400` con `{ error, message }`; Mongo caído responde `503`.                    | alta      |
| RF-8 | Cada escritura deja un `StatsEvent` consultable en la colección (append-only).                                     | media     |

### No funcionales

| ID    | Requisito | Criterio |
| ----- | --------- | -------- |
| RNF-1 | Tipado estricto | `cd backend && bunx tsc --noEmit` sin errores nuevos. |
| RNF-2 | Arranque resiliente | Con MongoDB apagado, el WebSocket y `/` siguen funcionando; `/stats/*` responde `503`. |
| RNF-3 | Sin grow ilimitado | `StatsEvent` tiene índice TTL de 90 días. |
| RNF-4 | Compatibilidad de contrato | La respuesta de `GET` es idéntica en forma a `StatsData` de `stats.svelte.ts`, con fechas en milisegundos. |
| RNF-5 | Tests reproducibles | `bun test` pasa en verde con MongoDB local; si no hay Mongo, los tests se marcan como omitidos (`skip`) y terminan en 0. |

## 5. Criterios de aceptación

- [x] CA-1: `bun install` en `backend/` añade `mongoose` a `package.json` y `bun.lock`.
- [x] CA-2: `POST /stats/:playerId/events` dos veces con `death`/`crypt` deja `missions.crypt.deaths === 2`.
- [x] CA-3: Un `PUT` posterior con contadores menores **no** reduce ningún valor (monotonía).
- [x] CA-4: `POST /stats/:playerId/reset` deja todos los contadores a `0` y conserva `createdAt`.
- [x] CA-5: `GET /stats/:playerId` con un id inválido devuelve `400`; con Mongo apagado devuelve `503`.
- [x] CA-6: `bunx tsc --noEmit` y `bun test` terminan correctamente.

## 6. Archivos relevantes

| Ruta | Acción | Motivo |
| ---- | ------ | ------ |
| `backend/package.json` | modificar | Añadir `mongoose` y script `test`. |
| `backend/bun.lock` | modificar | Lockfile actualizado por `bun add`. |
| `backend/.env` | modificar | Añadir `MONGODB_URI` local (gitignored). |
| `backend/.env.example` | modificar | Documentar `MONGODB_URI` y `STATS_EVENTS_TTL_DAYS`. |
| `backend/src/db/mongo.ts` | crear | Conexión singleton, healthcheck y cierre. |
| `backend/src/db/models/player.ts` | crear | Modelo `Player`. |
| `backend/src/db/models/playerStats.ts` | crear | Modelo `PlayerStats`. |
| `backend/src/db/models/statsEvent.ts` | crear | Modelo `StatsEvent` con TTL. |
| `backend/src/stats/schema.ts` | crear | Esquemas zod y normalización de snapshots. |
| `backend/src/stats/service.ts` | crear | Lógica de lectura, upsert monótono, eventos y reset. |
| `backend/src/routes/stats.ts` | crear | Rutas Elysia `/stats`. |
| `backend/src/index.ts` | modificar | Registrar rutas, iniciar conexión y cierre ordenado. |
| `backend/tests/stats.test.ts` | crear | Tests de integración de la API y el servicio. |
| `backend/README.md` | modificar | Documentar API, modelos y variables. |

## 7. Plan de implementación

### Fase 1 — Dependencias y conexión

- [x] Paso 1: `cd backend && bun add mongoose`.
- [x] Paso 2: Crear `src/db/mongo.ts` con `ensureMongo()`, `isMongoReady()`, `mongoStateName()` y `closeMongo()`. Cachear la promesa de conexión y `serverSelectionTimeoutMS` corto.
- [x] Paso 3: Añadir `MONGODB_URI` y `STATS_EVENTS_TTL_DAYS` a `.env.example` y al `.env` local si falta.

### Fase 2 — Modelos y validación

- [x] Paso 1: `Player`: `playerId` único, `alias` opcional, timestamps.
- [x] Paso 2: `PlayerStats`: `playerId` único, `version`, subdocumentos `missions.cats/crypt/barn/race` con `_id: false`, timestamps e índices.
- [x] Paso 3: `StatsEvent`: `playerId`, `type`, `mission`, `delta`, `meta`, timestamps e índice TTL.
- [x] Paso 4: `src/stats/schema.ts` con `statsPlayerIdSchema`, `statsSnapshotSchema`, `statsEventSchema` y `emptyStats()`.
- [x] Paso 5: Mapear el documento de Mongo al contrato `StatsData` (fechas en ms).

### Fase 3 — Servicio y rutas

- [x] Paso 1: `getOrCreateStats(playerId)`: `findOneAndUpdate` con `$setOnInsert` y `upsert`.
- [x] Paso 2: `applySnapshot(playerId, snapshot)`: `$max` por cada contador + `$setOnInsert` de `createdAt`/`version`.
- [x] Paso 3: `applyEvents(playerId, events)`: asegurar documento, `$inc` por evento y normalización de `played` con pipeline; insertar `StatsEvent`s.
- [x] Paso 4: `resetStats(playerId)`: `$set` a cero conservando `createdAt`.
- [x] Paso 5: `src/routes/stats.ts` con `GET /stats/health`, `GET /stats/:playerId`, `PUT /stats/:playerId`, `POST /stats/:playerId/events`, `POST /stats/:playerId/reset`.
- [x] Paso 6: Registrar `.use(statsRoutes)` en `src/index.ts` y llamar `ensureMongo()` tras el `listen`.

### Fase 4 — Tests y documentación

- [x] Paso 1: `tests/stats.test.ts` con `bun:test`; usar `MONGODB_URI_TEST` o `MONGODB_URI` con base `nearbox_test`; limpiar colecciones entre tests.
- [x] Paso 2: Cubrir: creación perezosa, evento acumulativo, monotonía de `PUT`, reset conservando `createdAt`, validación 400 y contrato de fechas en ms.
- [x] Paso 3: `bun test` y `bunx tsc --noEmit`.
- [x] Paso 4: Documentar endpoints, modelos y variables en `README.md`.

## 8. Verificación

```bash
# Dependencia instalada
cd backend && bun pm ls | grep mongoose

# Tipos
cd backend && bunx tsc --noEmit

# Tests (requiere mongod local; si no hay, se omiten)
cd backend && bun test

# Humo manual (con el backend en marcha)
curl -s localhost:4000/stats/health
curl -s localhost:4000/stats/00000000-0000-4000-8000-000000000000
curl -s -X POST localhost:4000/stats/00000000-0000-4000-8000-000000000000/events \
  -H 'content-type: application/json' \
  -d '{"events":[{"type":"death","mission":"crypt"}]}'
```

Casos manuales:

1. Con `mongod` activo, `GET` devuelve un snapshot vacío con `version: 1`.
2. Tras dos eventos `death`/`crypt`, `missions.crypt.deaths` vale `2`.
3. Un `PUT` con valores menores no reduce lo acumulado.
4. `reset` deja contadores a `0` y conserva `createdAt`.
5. Con `mongod` detenido, `/stats/health` y `/stats/:id` responden `503` y el WebSocket sigue operativo.

## 9. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
| ------ | ------- | ---------- |
| `playerId` público: cualquiera puede escribir stats ajenas | medio | Documentarlo; auth real en spec posterior. No usar para economía. |
| Clientes con estado viejo pisan contadores | alto | `PUT` usa `$max`; `events` usa `$inc` atómico. |
| Mongo caído bloquea el arranque | alto | Conexión perezosa y no bloqueante; rutas `503`; el resto del backend sigue. |
| `mongoose` + Bun incompatibilidad | medio | Probar conexión y CRUD reales en los tests; si falla, usar el driver nativo `mongodb` con la misma API. |
| Crecimiento de `StatsEvent` | bajo | Índice TTL configurable (90 días por defecto). |
| Desfase entre `played` y `completed + failed` | bajo | Recalcular `played` en el servidor tras cada evento (`$max`). |
| Borrado accidental de la base | alto | No incluir scripts destructivos; tests usan base `nearbox_test`. |

## 10. Preguntas abiertas

- [ ] ¿El `playerId` debe vincularse al `sub` de Auth0 / cuenta NEAR para evitar suplantación? (fuera de alcance; requiere spec de auth)
- [ ] ¿Se migrarán los datos existentes de `localStorage` al primer login? (propuesto: el cliente hará `PUT` al inicializar)
- [ ] ¿Se quieren rankings globales por minijuego? (spec posterior; los índices ya lo permiten)
- [ ] ¿Retención definitiva de eventos? (propuesto: 90 días)

## 11. Decisiones y notas

- **Contrato compatible**: la API devuelve exactamente la forma de `StatsData`
  (`version`, `playerId`, `createdAt`, `updatedAt`, `missions`) para que el
  cliente pueda sustituir `localStorage` sin reescribir la UI.
- **Monotonía**: los contadores de estadísticas solo crecen. `PUT` aplica `$max`
  campo a campo; `POST /events` usa `$inc`. El único descenso es `reset`.
- **Fechas**: Mongo guarda `Date`; la API serializa a milisegundos (números),
  igual que `Date.now()` en el cliente.
- **Eventos**: `StatsEvent` es append-only y sirve de auditoría básica y de base
  para analytics. No se usa para reconstruir el estado (la fuente es `PlayerStats`).
- **Reset**: se implementa como operación explícita, no como `PUT` a cero, para
  no romper la monotonía.
- **Sin autenticación**: el backend actual no identifica jugadores; se mantiene
  el `playerId` del cliente y se documenta el riesgo.
- **Mongoose 9**: los updates con pipeline requieren `updatePipeline: true`; los
  `findOneAndUpdate` usan `returnDocument: 'after'` (el antiguo `new: true` está
  deprecado).
- **Log best-effort**: si falla la escritura de `StatsEvent`, el incremento ya
  está comprometido y la petición no se marca como fallida (un reintento
  duplicaría contadores). Se emite un warning.
- **Carreras de upsert**: dos primeras peticiones concurrentes pueden chocar en
  el índice único; el servicio captura `E11000` y relee/reintenta la escritura.
- **Frontend pendiente**: el cliente sigue usando `localStorage`. Para activar
  la persistencia real hace falta un spec de cableado que llame a `GET/PUT/POST`
  desde `stats.svelte.ts`.

## 12. Progreso

| Fecha | Estado | Nota |
| ----- | ------ | ---- |
| 2026-11-14 | en-progreso | Spec creado; implementación iniciada |
| 2026-11-14 | completado | Mongoose 9.12.1, 3 modelos, API `/stats`, cierre ordenado y 9 tests en verde |

## 13. Changelog

- 2026-11-14 — Creación del spec.
- 2026-11-14 — Implementación completa en `backend/`: conexión resiliente,
  modelos `Player`/`PlayerStats`/`StatsEvent`, validación zod, endpoints REST,
  tests de integración y documentación.
- 2026-11-14 — Verificado `bunx tsc --noEmit`, `bun test` (9/9) y smoke manual
  con MongoDB activo y apagado.
