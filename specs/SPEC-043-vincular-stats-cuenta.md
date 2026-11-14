---
id: SPEC-043
titulo: "Vincular las estadísticas a la cuenta Auth0/NEAR"
estado: completado
prioridad: alta
creado: 2026-11-14
actualizado: 2026-11-14
responsable: "opencode"
etiquetas: [backend, frontend, stats, auth0, near, mongodb]
depende_de: [SPEC-041, SPEC-042]
bloquea: [leaderboard-global, perfiles-multidispositivo]
estimacion: "4h"
---

# SPEC-043 — Vincular las estadísticas a la cuenta Auth0/NEAR

## 1. Contexto

SPEC-041/042 ya persisten las stats en MongoDB y las sincronizan desde
`frontend/src/lib/state/stats.svelte.ts`. Pero la clave es el UUID aleatorio de
`playerProfile`:

- al borrar `localStorage` se genera un UUID nuevo y el progreso queda huérfano;
- otro dispositivo no puede recuperar las stats;
- cualquiera que conozca el id puede escribir (no hay auth).

El proyecto ya tiene sesión FastAuth/Auth0 (`frontend/src/lib/state/auth.svelte.ts`)
con `accountId` (`t-<handle>.testnet`) y un token silencioso
(`getAccessTokenSilently()` en `frontend/src/lib/near/auth.ts`). El backend ya
verifica JWT de Auth0 en `backend/src/server/auth0.ts` (`verifyAuth0Jwt`).

## 2. Objetivo

Usar el `accountId` como identidad estable de las estadísticas, autenticar las
escrituras con el JWT de Auth0 y migrar automáticamente las stats antiguas
(UUID/local) a la cuenta.

## 3. Alcance

**Incluye**

- Backend:
  - rutas `/stats/*` aceptan `Authorization: Bearer <jwt>`;
  - los documentos de cuenta quedan vinculados al `sub` del token (primer uso);
  - modo legacy sin token limitado a ids UUID;
  - endpoint `POST /stats/:playerId/merge` para fusionar un UUID en la cuenta;
  - tests de autenticación y merge.
- Frontend:
  - `stats.init(accountId, legacyPlayerId)` y re-init cuando la auth resuelve;
  - token silencioso en cada sync cuando la identidad es una cuenta;
  - migración local + servidor del UUID antiguo (una vez por cuenta);
  - fallback offline si el token no está disponible.
- Documentación.

**No incluye**

- Verificar on-chain que el `accountId` pertenece al token (se vincula por
  primer uso; ver riesgos).
- Firmar mensajes con la clave NEAR para probar propiedad de la cuenta.
- Cambiar `playerProfile.playerId` para misiones/NPCs/cosméticos.
- Rankings o perfiles públicos.
- Borrar los documentos UUID antiguos (se conservan para idempotencia).

## 4. Requisitos

### Funcionales

| ID   | Requisito | Prioridad |
| ---- | --------- | --------- |
| RF-1 | `GET/PUT/POST /stats/:playerId` con `Bearer` válido vincula el documento al `sub` del token y devuelve 403 si ya pertenece a otro `sub`. | alta |
| RF-2 | Sin token solo se permiten ids UUID (modo legacy); un id tipo cuenta responde 401. | alta |
| RF-3 | `POST /stats/:playerId/merge` fusiona por máximos un `fromPlayerId` UUID en la cuenta autenticada. | alta |
| RF-4 | Al iniciar sesión, el cliente usa `authSession.accountId` como identidad de stats y sube el snapshot local. | alta |
| RF-5 | La primera sync de una cuenta fusiona las stats locales del UUID antiguo y llama a `/merge` una sola vez. | alta |
| RF-6 | Si no hay token, la app sigue funcionando en local; la sync de cuenta queda `offline` y reintenta. | alta |
| RF-7 | Borrar `localStorage`, volver a iniciar sesión y recuperar las stats desde la cuenta. | alta |

### No funcionales

| ID    | Requisito | Criterio |
| ----- | --------- | -------- |
| RNF-1 | Sin regresiones | `backend: bunx tsc --noEmit && bun test`; `frontend: bun run check && bun run lint`. |
| RNF-2 | Idempotencia | Repetir `/merge` y los PUT no duplica ni reduce contadores. |
| RNF-3 | Sin bloquear el juego | Token/sync son asíncronos y con timeout; errores no lanzan a la UI. |
| RNF-4 | Compatibilidad | Clientes viejos con UUID siguen funcionando sin token. |

## 5. Criterios de aceptación

- [x] CA-1: Sin token, `GET /stats/t-nearbox-abc.testnet` devuelve `401`; con UUID funciona.
- [x] CA-2: Un token válido crea/lee el documento de la cuenta y lo vincula al `sub`.
- [x] CA-3: Un segundo `sub` sobre la misma cuenta devuelve `403`.
- [x] CA-4: `/merge` copia contadores del UUID a la cuenta con `$max` y es idempotente.
- [x] CA-5: Al entrar con una cuenta, las stats del UUID local aparecen en la cuenta.
- [x] CA-6: Tras borrar `localStorage` y volver a iniciar sesión, se recuperan las stats de la cuenta.
- [x] CA-7: `bunx tsc --noEmit`, `bun test` y `bun run check` pasan; `bun run lint` solo marca un JSON generado ajeno a este cambio.

## 6. Archivos relevantes

| Ruta | Acción | Motivo |
| ---- | ------ | ------ |
| `backend/src/db/models/playerStats.ts` | modificar | Campo `subject` + índice. |
| `backend/src/db/models/statsEvent.ts` | modificar | Nuevo evento `link`. |
| `backend/src/stats/service.ts` | modificar | Ownership por `sub`, merge de UUID. |
| `backend/src/routes/stats.ts` | modificar | Bearer token, 401/403, `/merge`. |
| `backend/tests/stats.test.ts` | modificar | Tests de auth/merge/legacy. |
| `backend/README.md` | modificar | Documentar auth, merge y límites. |
| `frontend/src/lib/state/statsApi.ts` | modificar | Header Authorization y `linkLegacyStats`. |
| `frontend/src/lib/state/stats.svelte.ts` | modificar | Identidad de cuenta, migración y token. |
| `frontend/src/lib/GamePage.svelte` | modificar | Re-init de stats al resolver la auth. |
| `specs/SPEC-043-vincular-stats-cuenta.md` | crear | Este spec. |

## 7. Plan de implementación

### Fase 1 — Backend: identidad y auth

- [x] Paso 1: Añadir `subject` al modelo `PlayerStats`.
- [x] Paso 2: Helper de rutas para extraer/validar el Bearer con `verifyAuth0Jwt`.
- [x] Paso 3: `ensureStatsOwnership(playerId, subject)`: vincula si está vacío, 403 si difiere.
- [x] Paso 4: Pasar `subject` a `getOrCreateStats`, `applySnapshot`, `applyEvents`, `resetStats`.
- [x] Paso 5: Rechazar ids no UUID sin token.

### Fase 2 — Backend: merge y tests

- [x] Paso 1: `mergeStatsFrom(target, sourceUuid, subject)` con `$max` y evento `link`.
- [x] Paso 2: Ruta `POST /stats/:playerId/merge`.
- [x] Paso 3: Tests: 401 sin token, 403 con otro subject simulado, merge idempotente.
- [x] Paso 4: Documentar en `README.md`.

### Fase 3 — Frontend: identidad de cuenta

- [x] Paso 1: `statsApi` acepta token y añade `Authorization`.
- [x] Paso 2: `stats.init(playerId, legacyPlayerId?)` migra contadores locales y persiste un marcador de vínculo.
- [x] Paso 3: `syncNow` obtiene token silencioso, llama a `/merge` una vez y luego sube el snapshot.
- [x] Paso 4: `GamePage` re-inicializa con `authSession.accountId` cuando `canPlay`.
- [x] Paso 5: Verificar check/lint y flujo manual.

## 8. Verificación

```bash
cd backend && bunx tsc --noEmit && bun test
cd frontend && bun run check && bun run lint
```

Casos manuales:

1. Jugar sin token (UUID): todo sigue como antes.
2. Iniciar sesión: `player_stats` pasa a `playerId = t-...testnet` con `subject` y los contadores del UUID se fusionan.
3. Recargar sin `localStorage`: la cuenta recupera los contadores.
4. Simular otro `sub`: la API responde `403` (test).
5. Backend caído o token nulo: UI `Offline`, contadores locales intactos.

## 9. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
| ------ | ------- | ---------- |
| Squatting: otro usuario vincula una cuenta ajena antes | medio | Solo el `accountId` derivado de la publicKey del jugador se usa en la práctica; documentado. |
| Token no disponible (Auth0 silencioso) | medio | Se mantiene local; reintento y estado `offline`. |
| Doble conteo al fusionar local + servidor | alto | Merge con `$max`, nunca suma. |
| Cliente viejo sin token | bajo | Modo legacy UUID intacto. |
| `subject` no único por error de índice | bajo | Índice normal; la unicidad lógica es por documento. |
| Cambio de cuenta en la misma pestaña | bajo | `init` reinicia estado y migra solo si el legacy cambió. |

## 10. Preguntas abiertas

- [ ] ¿Queremos probar propiedad on-chain de la cuenta (firma NEAR) además del JWT?
- [ ] ¿Se debe borrar el documento UUID después del merge? (propuesto: conservarlo)
- [ ] ¿El leaderboard debe usar `accountId` público o un alias?

## 11. Decisiones y notas

- **Clave = accountId**: mantiene el contrato `playerId` y permite migrar sin
  cambiar la API. El `subject` del JWT se guarda para impedir que otra sesión
  reescriba la misma cuenta.
- **Modo legacy**: sin token solo se aceptan UUID, que es el identificador de
  SPEC-042; las cuentas (`t-*.testnet`) requieren JWT.
- **Merge por máximos**: UUID y cuenta pueden tener la misma progresión; sumar
  duplicaría. `$max` es idempotente.
- **Una migración por cuenta**: marcador en `localStorage`
  (`rw:stats:link:v1`) evita llamar a `/merge` en cada arranque.
- **Token**: se pide en cada sync con `getAccessTokenSilently()`; si devuelve
  `null`, no se envía header y la sync de cuenta queda offline.
- **Solo las cuentas se vinculan**: los UUID legacy se aceptan sin token y no
  se escriben en `subject` aunque el cliente mande un JWT; así un cliente viejo
  no queda bloqueado por una vinculación accidental.
- **Verificador inyectable**: `createStatsRoutes(verifyToken)` permite que los
  tests simulen `sub` sin depender del JWKS real de Auth0.

## 12. Progreso

| Fecha | Estado | Nota |
| ----- | ------ | ---- |
| 2026-11-14 | en-progreso | Spec creado; implementación iniciada |
| 2026-11-14 | completado | Backend con `subject`/JWT/merge, frontend con identidad de cuenta y migración; tests y checks en verde |

## 13. Changelog

- 2026-11-14 — Creación del spec.
- 2026-11-14 — Implementación backend: `subject` en `PlayerStats`, evento `link`,
  verificación Bearer inyectable, 401/403, `mergeStatsFrom` y `POST /merge`.
- 2026-11-14 — Implementación frontend: `stats.init(accountId, { legacyPlayerId })`,
  migración local + `/merge` único por cuenta (`rw:stats:link:v1`), token silencioso
  y re-init desde `GamePage` al resolver la auth.
- 2026-11-14 — Verificado `tsc`, 18 tests backend, `svelte-check` sin errores y
  smoke HTTP (401 para cuentas sin token, UUID legacy y merge sin token).
