---
id: SPEC-042
titulo: "Cablear las estadísticas del frontend con la API /stats"
estado: completado
prioridad: alta
creado: 2026-11-14
actualizado: 2026-11-14
responsable: "opencode"
etiquetas: [frontend, stats, mongodb, sync, svelte]
depende_de: [SPEC-041]
bloquea: [leaderboard-global]
estimacion: "2h"
---

# SPEC-042 — Cablear las estadísticas del frontend con la API `/stats`

## 1. Contexto

SPEC-041 dejó lista la API `backend/src/routes/stats.ts`:

- `GET /stats/:playerId` lee o crea el snapshot.
- `PUT /stats/:playerId` sincroniza un snapshot completo con `$max`.
- `POST /stats/:playerId/events` aplica incrementos.
- `POST /stats/:playerId/reset` reinicia contadores.

El cliente sigue usando solo `localStorage` en
`frontend/src/lib/state/stats.svelte.ts` (clave `rw:stats:v1`) y en la UI de
Ajustes aparece el texto “Stats are saved only in this browser”.

El backend se sirve en otro puerto en desarrollo. El proyecto ya proxya
`/api/relayer/*` desde Vite (`frontend/vite.config.ts`), así que seguimos el
mismo patrón para `/api/stats/*`.

## 2. Objetivo

Sincronizar automáticamente las estadísticas del jugador con la API `/stats`
sin romper el funcionamiento offline: `localStorage` sigue siendo la caché
inmediata y el servidor pasa a ser la fuente persistente entre dispositivos.

## 3. Alcance

**Incluye**

- Cliente HTTP mínimo `frontend/src/lib/state/statsApi.ts`.
- Sincronización en `stats.svelte.ts`:
  - subida del snapshot local al inicializar (sirve de migración),
  - escritura debounced tras cada cambio,
  - `reset` contra el endpoint dedicado para no chocar con `$max`,
  - reintentos, evento `online`, y estado visible (`syncing`/`synced`/`offline`).
- Proxy de Vite `/api/stats` → backend `/stats`.
- Indicador de estado en la pestaña Stats de `SettingsMenu.svelte`.
- Documentación del mapeo de producción.

**No incluye**

- Enviar eventos individuales (`POST /events`) al servidor; esta iteración usa
  el snapshot completo porque es idempotente y compatible con `$max`.
- Autenticación del `playerId` (sigue pendiente de SPEC de auth).
- Rankings, perfiles públicos o migración de datos de otros dispositivos más
  allá del merge automático.
- Cambiar el contrato `StatsData` ni la UI de contadores.

## 4. Requisitos

### Funcionales

| ID   | Requisito | Prioridad |
| ---- | --------- | --------- |
| RF-1 | Al llamar `stats.init(playerId)`, el cliente sube el snapshot local con `PUT /api/stats/:playerId` y adopta la respuesta mergeada. | alta |
| RF-2 | Cada mutación (`startMission`, `completeMission`, `recordDeath`, etc.) programa una subida debounced (~700 ms). | alta |
| RF-3 | `resetStats()` reinicia local y remoto (endpoint `/reset`), conservando `createdAt` local. | alta |
| RF-4 | Si el backend falla o no hay red, la app sigue funcionando con `localStorage` y reintenta cada 15 s. | alta |
| RF-5 | El evento `online` y la vuelta de foco reintentan la sincronización pendiente. | media |
| RF-6 | Cambios de otra pestaña (`storage`) se reflejan y se vuelven a subir. | media |
| RF-7 | La UI muestra `Synced`, `Saving…` u `Offline — saved in this browser`. | baja |

### No funcionales

| ID    | Requisito | Criterio |
| ----- | --------- | -------- |
| RNF-1 | Sin regresiones de tipos | `cd frontend && bun run check` sin errores nuevos. |
| RNF-2 | Formato | `cd frontend && bun run lint` en verde. |
| RNF-3 | Sin pérdida de datos | El merge local/remoto usa máximos; una respuesta atrasada nunca reduce contadores locales. |
| RNF-4 | Sin bloquear el juego | Las llamadas son `void`/fire-and-forget; ningún `await` en el bucle de render. |
| RNF-5 | Sin spam | Debounce de 700 ms y un solo request en vuelo a la vez. |

## 5. Criterios de aceptación

- [x] CA-1: Con MongoDB y backend activos, al entrar al juego se crea el documento y Ajustes muestra `Synced`.
- [x] CA-2: Jugar un minijuego y esperar ~1 s persiste los contadores en Mongo.
- [x] CA-3: Recargar la página (sin borrar `localStorage`) mantiene el `playerId` y recupera/mergea las stats del servidor.
- [x] CA-4: Con el backend apagado, la UI muestra `Offline`, los contadores siguen funcionando y al volver la conexión se sincronizan.
- [x] CA-5: `Reset stats` deja los contadores a cero en la UI y en Mongo.
- [x] CA-6: `bun run check` y `bun run lint` en `frontend/` pasan.

## 6. Archivos relevantes

| Ruta | Acción | Motivo |
| ---- | ------ | ------ |
| `frontend/src/lib/state/statsApi.ts` | crear | Cliente HTTP y guardas de respuesta. |
| `frontend/src/lib/state/stats.svelte.ts` | modificar | Sincronización, debounce, reset remoto, estado. |
| `frontend/vite.config.ts` | modificar | Proxy `/api/stats` → backend `/stats`. |
| `frontend/src/lib/components/ui/SettingsMenu.svelte` | modificar | Indicador de sincronización. |
| `backend/README.md` | modificar | Nota de reverse proxy `/api/stats`. |
| `specs/SPEC-042-cableado-stats-frontend.md` | crear | Este spec. |

## 7. Plan de implementación

### Fase 1 — Cliente HTTP

- [x] Paso 1: Crear `statsApi.ts` con `putStats`, `resetRemoteStats`, `asStatsData` y timeout de 8 s.
- [x] Paso 2: Devolver `null` ante error de red/HTTP para no lanzar en el juego.

### Fase 2 — Store

- [x] Paso 1: Añadir `syncState`, `lastSyncedAt`, revisión, timers y flag de reset pendiente persistido.
- [x] Paso 2: En `init`, cargar local, registrar listeners (`storage`, `online`) y programar `syncNow(0)`.
- [x] Paso 3: En `update`/`resetStats`, programar la subida; en `destroy`, limpiar timers y hacer un último intento.
- [x] Paso 4: `syncNow`: ejecutar reset pendiente, subir snapshot, mergear por máximos y programar reintento si falla.
- [x] Paso 5: Evitar pisar mutaciones concurrentes usando un contador de revisión.

### Fase 3 — Proxy, UI y documentación

- [x] Paso 1: Añadir proxy `/api/stats` en `vite.config.ts`.
- [x] Paso 2: Mostrar el estado en la pestaña Stats.
- [x] Paso 3: Documentar el mapeo en producción.
- [x] Paso 4: Ejecutar `bun run check`, `bun run lint` y prueba manual con backend.

## 8. Verificación

```bash
# Frontend
cd frontend && bun run check && bun run lint

# Backend (sin cambios de contrato)
cd backend && bunx tsc --noEmit && bun test
```

Casos manuales:

1. Backend + Mongo activos → Ajustes muestra `Synced`; `mongosh` confirma el documento.
2. Jugar/registrar una stat → tras ~1 s aparece en `player_stats`.
3. Limpiar `localStorage` y recargar → los contadores vuelven del servidor.
4. Parar el backend → estado `Offline`, seguir jugando, arrancar backend → se sincroniza.
5. Reset → contadores a cero en UI y en Mongo.

## 9. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
| ------ | ------- | ---------- |
| Respuesta atrasada pisa cambios nuevos | alto | Merge por máximos + contador de revisión + re-sync. |
| Reset local sin red y `PUT` posterior | alto | Flag `pendingReset` persistido; se llama a `/reset` antes de subir. |
| Muchos requests por eventos seguidos | medio | Debounce 700 ms y un request en vuelo. |
| Backend caído al entrar | medio | Estado `offline`, reintento cada 15 s y `online`. |
| `playerId` no autenticado | medio | Documentado; no usar para economía. |
| Borrar `localStorage` genera un `playerId` nuevo | alto | Las stats antiguas quedan huérfanas hasta vincular el id a la cuenta NEAR/Auth0 (spec de auth). |
| Proxy distinto en producción | medio | Documentar `/api/stats` → `/stats`. |

## 10. Preguntas abiertas

- [ ] ¿Queremos enviar también `POST /events` para analytics? (implica cola offline de eventos)
- [ ] ¿La migración debe conservar el `createdAt` original del cliente? (hoy el servidor usa el suyo)
- [ ] ¿Mostrar el id de jugador o un botón de “force sync” en Ajustes? (no incluido)
- [x] ¿Vinculamos `playerId` al `sub` de Auth0 / cuenta NEAR para recuperar stats tras borrar `localStorage` o cambiar de dispositivo? → resuelto en SPEC-043 (identidad de cuenta + merge del UUID legacy).

## 11. Decisiones y notas

- **Snapshot, no eventos**: `PUT` con `$max` es idempotente y tolera reintentos;
  enviar eventos requeriría ids de evento y una cola offline.
- **Local primero**: la UI nunca espera a la red; `localStorage` queda como caché.
- **Merge de respuesta**: aunque el servidor ya devuelve `$max(servidor, enviado)`,
  se mergea otra vez con el estado local actual para cubrir mutaciones ocurridas
  durante el vuelo.
- **Reset**: se persiste `pendingReset` por `playerId` en
  `rw:stats:sync:v1`; si el endpoint falla, no se sube el snapshot a cero.
- **Proxy**: `/api/stats/*` en dev; en producción el reverse proxy debe mapear
  igual que `/api/relayer/*`.
- **Identidad**: `playerId` sigue siendo el UUID de `playerProfile`, guardado en
  `localStorage`. La sync sobrevive recargas y errores de red, pero borrar el
  almacenamiento genera un id nuevo: recuperar el progreso en otro dispositivo
  requiere vincular el id a la cuenta NEAR/Auth0 (fuera de alcance).

## 12. Progreso

| Fecha | Estado | Nota |
| ----- | ------ | ---- |
| 2026-11-14 | en-progreso | Spec creado; implementación iniciada |
| 2026-11-14 | completado | Cliente, sync offline-first, proxy, UI y documentación; `check` y `lint` en verde |

## 13. Changelog

- 2026-11-14 — Creación del spec.
- 2026-11-14 — Implementación: `statsApi.ts`, sincronización debounced/offline
  en `stats.svelte.ts`, proxy `/api/stats`, indicador en Ajustes y nota de
  reverse proxy.
- 2026-11-14 — Verificado `bun run check` (0 errores), `bun run lint` y smoke
  end-to-end a través del proxy de Vite contra `backend /stats` + MongoDB.
