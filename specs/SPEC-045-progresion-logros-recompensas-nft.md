---
id: SPEC-045
titulo: "Central de misiones, logros y recompensas NFT con progresión verificada"
estado: implementado
prioridad: alta
creado: 2026-11-14
actualizado: 2026-11-14
responsable: opencode
etiquetas:
  [
    misiones,
    logros,
    retos,
    nft,
    nep245,
    recompensas,
    progresion,
    gating,
    economia,
    mongodb,
    mongoose,
    stats,
    relayer,
    mint-patrocinado,
    minijuegos,
    hud,
    svelte,
    elysia,
    bun,
  ]
depende_de:
  [SPEC-018, SPEC-023, SPEC-025, SPEC-026, SPEC-035, SPEC-038, SPEC-040, SPEC-041, SPEC-043, SPEC-044]
bloquea: []
estimacion: "64h"
---

# SPEC-045 — Central de misiones, logros y recompensas NFT

## 1. Contexto

### 1.1 Lo que ya existe

El juego tiene hoy cuatro piezas que este spec une:

1. **Estadísticas persistentes en MongoDB** (`SPEC-041`, `SPEC-042`, `SPEC-043`).
   - `backend/src/routes/stats.ts` expone `GET/PUT /stats/:playerId`,
     `POST /stats/:playerId/events`, `POST /stats/:playerId/reset` y
     `POST /stats/:playerId/merge`.
   - Las escrituras de una cuenta (`t-<handle>.testnet`) exigen JWT de Auth0 y
     quedan vinculadas al `sub`; los UUID legacy funcionan sin token.
   - `PlayerStats` guarda `cats`, `crypt`, `barn` y `race`; `StatsEvent` es un
     log append-only con TTL.
   - Los contadores actuales se empujan desde el cliente y el servidor los
     fusiona con `$max`. Es suficiente para mostrar progreso, **pero no para
     autorizar un NFT**, porque un cliente puede inflar el número.
2. **Mercado y colección NEP-245** (`SPEC-038`) con contratos ya desplegados en
   testnet, mint patrocinado por el relayer (`POST /relayer/sponsor-mint`),
   topes por catálogo y por cuenta, y `set_catalog_cap`/`set_catalog_metadata`
   para añadir catálogos sin redeploy.
3. **Minijuegos autoritativos** en `backend/src/server/engines/`: `waves.ts`
   (Barn Siege), `royale.ts` (Skyfall Royale), `race.ts` (Grand Prix),
   `deathmatch.ts` (Hexfire), `parkour.ts`, `minigame2.ts` (cripta). El servidor
   conoce kills, resultados, vueltas y ganadores; el cliente no decide nada.
4. **Misiones locales** (`SPEC-015` gatos, `SPEC-035` encargos de NPCs) y
   misiones de victoria de minijuego (`frontend/src/lib/missions/minigames.ts`),
   guardadas en `localStorage` (`rw:missions:v1`, `rw:npc-missions:v1`).

### 1.2 El problema

- Completar una misión no da nada: `SPEC-035` y `SPEC-015` terminan en un banner.
- Los NFTs son solo objetos de colección: se pueden mintear y vender, pero no
  desbloquean contenido ni se obtienen jugando.
- El progreso vive en `localStorage`: borrar el navegador lo pierde, y el
  servidor no puede demostrar que una misión se completó de verdad.
- Las estadísticas no cubren Skyfall, Hexfire, Parkour ni los podios del Gran
  Premio, así que los ejemplos naturales («100 kills en Barn Siege», «200 en
  Skyfall», «gana 10 carreras») no se pueden evaluar todavía.
- El WebSocket no identifica al jugador con su cuenta: el `join` solo lleva el
  alias (`frontend/src/lib/services/lobbySocket.ts`), y las rooms usan un
  `ws.id` aleatorio. Sin identidad no hay forma de acreditar una kill al
  `accountId` que después reclama el NFT.

### 1.3 La idea

Convertir las misiones en una **progresión con recompensas reales**, usando
MongoDB como fuente de la verdad y el mercado NFT como salida:

1. El jugador completa misiones básicas **sin necesidad de NFTs**.
2. Al completar hitos recibe **NFTs acuñados por la Central** (el backend), no
   comprados: la recompensa se gana jugando.
3. Las misiones avanzadas **exigen poseer el NFT del hito anterior**. Así el NFT
   no es un objeto muerto: es la llave del siguiente tramo y se puede vender o
   comprar en el mercado.
4. Los requisitos suben por tramos: 25 → 100 → 250 kills en Barn Siege; 10 → 50
   → 200 kills y victorias en Skyfall; 1 → 3 → 10 victorias en el Gran Premio.
5. El servidor **verifica** las misiones de minijuego con los eventos de sus
   motores autoritativos y **comprueba on-chain** la posesión de los NFTs que
   hacen de llave. El cliente solo pinta y solicita el reclamo.

> **Nombre**: la UI llama **Central** a la pestaña de misiones del HUD. La
> «Central» es el backend (`missionCentral`), no un edificio nuevo del mapa.
>
> **Solo se premia con NFTs.** No hay premios en NEAR, monedas del juego ni
> fiat. El jugador nunca paga el mint ni recibe NEAR de la Central: el coste de
> red (storage + gas, ~0.006 NEAR por token) lo cubre el relayer como
> infraestructura de testnet.

## 2. Objetivo

Construir una capa de progresión encima de las misiones y minijuegos actuales
que:

1. Defina un catálogo versionado de **misiones, retos de minijuego y logros**
   con objetivos numéricos y requisitos de desbloqueo.
2. Persista el progreso, las completaciones y los reclamos en MongoDB, con
   `localStorage` solo como caché offline.
3. Acredite automáticamente las kills, victorias y resultados de los
   minijuegos desde los motores del servidor, sin confiar en el cliente.
4. Permita reclamar **una recompensa NFT por misión**, minteada por el relayer
   con el depósito patrocinado, de forma idempotente y con presupuesto acotado.
5. Permita que una misión exija **poseer un NFT concreto** (verificado on-chain)
   además de sus requisitos de progreso.
6. Muestre todo en una pestaña **Central** del HUD: misiones disponibles,
   bloqueadas, completadas, reclamables y reclamadas, con el motivo del bloqueo.
7. Mantenga el juego jugable sin sesión, sin backend y sin MongoDB: el progreso
   local se conserva y se sincroniza cuando vuelve la conexión.

## 3. Alcance

**Incluye**

- Catálogo de progresión en código (`frontend/src/lib/missions/progression.ts`
  y su espejo de validación en `backend/src/progression/catalog.ts`).
- 6 pistas de minijuego (`barn`, `royale`, `gp`, `hexfire`, `parkour`, `crypt`),
  una pista de exploración (`explorer`: gatos + encargos) y 4 recompensas de
  tramo.
- Requisitos de desbloqueo por tramo: misiones completadas, cosméticos NFT y
  posesión de NFTs concretos.
- Objetivos numéricos sobre métricas de estadísticas: kills, victorias,
  podios, vueltas, completaciones, gatos y encargos.
- Nuevas métricas en `StatsData` v2: `royale`, `hexfire`, `parkour`,
  `race.podiums`, `barn.waves` y `errands`.
- Contadores **atestados** por el servidor, separados de los contadores
  reportados por el cliente.
- Identidad del WebSocket: `join` acepta un JWT opcional de Auth0; el backend
  vincula `ws.id → sub/accountId` y solo acredita eventos a sesiones vinculadas.
- Hooks de atestación en los motores `waves.ts`, `royale.ts`, `race.ts`,
  `deathmatch.ts`, `parkour.ts` y `minigame2.ts`.
- Modelos Mongo: `MissionProgress`, `RewardClaim` y `MissionAttestation`.
- API `/progression/*` para catálogo, snapshot, sincronización de encargos,
  aceptación/abandono y reclamo de recompensas.
- Endpoint `POST /rewards/claim` con validación de JWT, cuenta, requisitos,
  topes, presupuesto e idempotencia.
- Mint de recompensa desde el relayer con presupuesto separado
  (`REWARD_MINT_BUDGET_NEAR`), reserva y estado «capacity reached».
- Catálogo NFT de recompensa formado por **20 cosméticos que ya existen en la
  tienda** (skins, armas, assets y vehículos), con sus topes on-chain; sin
  `set_catalog_cap`/`set_catalog_metadata` nuevos y sin redeploy.
- Cada tramo e hito usa un cosmético existente como llave del siguiente
  (`shotgun-gold`, `pistol-gold`, `vampire`, `mp5-gold`, `magic-broom`, `crown`,
  etc.).
- Pestaña **Central** en `MissionHud.svelte` con tres sub-pestañas: `Errands`,
  `Challenges` y `Rewards`.
- Tarjeta de recompensa con arte, serie, estado (`Locked`, `Ready`, `Claimed`),
  motivo del bloqueo, botón `Claim` y enlace al explorer.
- Avisos de completado y de reclamo, sin repetirlos al recargar.
- Migración del progreso local de `SPEC-035` (`rw:npc-missions:v1`) y de las
  misiones de victoria (`rw:missions:v1`) al servidor, una vez por jugador.
- Reset de estadísticas que **no** borra misiones ni reclamos, para que no se
  pueda reclamar dos veces.
- Tests de integración, validación de tipos, formato, build, `tsc` y pruebas
  manuales con dos cuentas.

**No incluye**

- Cambiar los contratos Rust o redeployar la colección. El mint sigue siendo
  público; no hay catálogos exclusivos de recompensa que bloquear, porque las
  recompensas son cosméticos que también se venden en la tienda. Endurecerlo
  on-chain queda para producción.
- Nuevos GLBs, skins jugables, armas jugables o vehículos. Las recompensas
  reutilizan los 20 cosméticos existentes y su arte/GLB.
- Economía de monedas, XP, pase de batalla, tienda de recompensas, loot boxes,
  subastas u ofertas.
- Misiones diarias, semanales, repetibles o de temporada. Cada misión se
  completa y se reclama una vez por cuenta.
- Leaderboard nuevo. El podio existente sigue igual; este spec solo añade
  campos que el podio podría usar más adelante.
- Verificación criptográfica de las misiones de mundo (gatos y encargos). Se
  aceptan como progreso reportado por el cliente y se limitan a recompensas de
  bajo valor; el riesgo se documenta.
- Anti-cheat fuerte en los motores (teleport, aimbot). Se reutilizan las
  validaciones existentes y se añade deduplicación por `matchId`.
- Recompensas en NEAR, monedas del juego o fiat.
- Comprar o vender cosméticos de recompensa desde la Central. Se pueden listar
  en el mercado existente como cualquier NFT.
- Cambios en `map.glb`, en las arenas o en las reglas de los minijuegos.
- Migrar a mainnet, lazy mint o editions. La capacidad de testnet se documenta.
- Sustituir el estado en memoria de las rooms por MongoDB.

## 4. Requisitos

### 4.1 Funcionales — catálogo y progresión

| ID    | Requisito                                                                                                                                                                                                                                          | Prioridad |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| RF-1  | Existe un catálogo versionado (`PROGRESSION_VERSION = 1`) con 7 pistas (`barn`, `royale`, `gp`, `hexfire`, `parkour`, `crypt`, `explorer`), 5 tramos (`T0`…`T4`), misiones de minijuego, 9 encargos de `SPEC-035` y 4 recompensas de tramo.       | alta      |
| RF-2  | Cada misión tiene `id` estable, `track`, `tier`, `title`, `description`, `objective`, `unlock`, `reward` y textos de UI; los IDs de misión no cambian después de publicarse.                                                                        | alta      |
| RF-3  | `objective` es `stat` (una métrica y un objetivo), `collect` (IDs de encargo) o `meta` (número de misiones completadas de un tramo/pista).                                                                                                          | alta      |
| RF-4  | `unlock` puede exigir misiones completadas (`missions`), cosméticos (`nft` con `catalogId`) y/o un tramo (`tier`); se evalúa siempre en el servidor, nunca con datos del cliente.                                                                    | alta      |
| RF-5  | `reward` es `null` (sello de perfil, sin mint) o `{ catalogId, label, kind }`; una misión con `reward` no nula puede reclamarse una sola vez por cuenta.                                                                                            | alta      |
| RF-6  | El catálogo del backend y el del frontend son idénticos; un test compara ambos y falla si divergen.                                                                                                                                                 | alta      |
| RF-7  | Las 9 misiones de `SPEC-035` se integran como pista `explorer`/`T0` y conservan sus IDs y objetivos; no se duplican en un catálogo nuevo.                                                                                                            | alta      |
| RF-8  | Las misiones de victoria existentes (`race-5-laps`, `barn-8-waves`, `hexfire-first-win`, `parkour-summit`, `royale-first-win`) se mapean a los objetivos `T0` de su pista y no se borran de `rw:missions:v1`.                                        | alta      |

### 4.2 Funcionales — persistencia y fuente de la verdad

| ID    | Requisito                                                                                                                                                                                                                                          | Prioridad |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| RF-9  | `PlayerStats` sube a `version: 2` con `royale`, `hexfire`, `parkour`, `race.podiums`, `barn.waves` y `errands`; un documento v1 se normaliza a v2 con ceros al leerlo.                                                                               | alta      |
| RF-10 | `PlayerStats` gana un subdocumento `attested` solo-lectura para el cliente, con los mismos contadores; `PUT /stats/:playerId` no puede escribirlo ni borrarlo.                                                                                       | alta      |
| RF-11 | Existe `MissionProgress` con un documento por `(playerId, missionId)`: `status`, `value`, `collectedIds`, `acceptedAt`, `completedAt`, `claimedAt`, `attested`, `evidence`, `updatedAt`.                                                             | alta      |
| RF-12 | Existe `RewardClaim` con un documento por `(playerId, missionId)`: `claimId`, `accountId`, `catalogId`, `status` (`pending`/`minting`/`minted`/`already-owned`/`failed`), `tokenId`, `txHash`, `requestId`, `attempts`, `error`, timestamps.       | alta      |
| RF-13 | Existe `MissionAttestation` append-only con `playerId`, `source`, `matchId`, `metric`, `delta` y `at`; un índice único `(source, matchId, playerId, metric)` impide contar dos veces el mismo evento.                                                | alta      |
| RF-14 | `GET /progression/:playerId` devuelve en una sola respuesta el snapshot de estadísticas, el progreso de misiones, los reclamos y los requisitos calculados (`locked`, `available`, `active`, `completed`, `claimed`).                               | alta      |
| RF-15 | `POST /progression/:playerId/sync` acepta el progreso local de encargos y lo fusiona por unión de `collectedIds` y máximo de contadores; es idempotente.                                                                                            | alta      |
| RF-16 | `POST /progression/:playerId/missions/:missionId/accept`, `.../abandon` y `.../progress` gestionan solo encargos de mundo (`collect`); no permiten tocar misiones de minijuego.                                                                     | alta      |
| RF-17 | Las misiones de minijuego se completan solas al alcanzar el objetivo; no se aceptan ni se abandonan.                                                                                                                                                | alta      |
| RF-18 | Las métricas de minijuego se leen de `PlayerStats.attested`, no de `PlayerStats.missions`; las de exploración se leen de `PlayerStats.missions`.                                                                                                    | alta      |
| RF-19 | Un `POST /stats/:playerId/reset` pone a cero los contadores reportados y atestados, pero **no** borra `MissionProgress` ni `RewardClaim`; las misiones ya completadas siguen reclamables.                                                          | alta      |
| RF-20 | `localStorage` (`rw:progression:v1`) guarda solo una caché del snapshot y la cola de encargos pendientes; un snapshot corrupto se descarta sin romper la app.                                                                                       | alta      |
| RF-21 | Sin MongoDB, `/progression/*` responde `503` y el cliente sigue jugando con la caché; los reclamos quedan deshabilitados con el motivo visible.                                                                                                     | alta      |

### 4.3 Funcionales — atestación desde los motores

| ID    | Requisito                                                                                                                                                                                                                                          | Prioridad |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| RF-22 | `join` acepta `{ name?, token?, accountId?, publicKey? }`. Si el JWT es válido, el backend exige `accountId === deriveAccountId(publicKey)` y que `publicKey` figure entre las access keys de la cuenta (`assertOwnedAccount`), y vincula `ws.id → { sub, accountId }`. Si falta el token, la sesión es anónima y no recibe atestaciones. | alta      |
| RF-23 | Los motores solo atestan eventos de sesiones vinculadas a una cuenta y un `matchId` estable; una sesión anónima no suma progreso atestado.                                                                                                         | alta      |
| RF-24 | `waves.ts` atesta `barn.kills` por cada `monster-died`, `barn.waves` al cerrar oleada y `barn.completed` al terminar la partida con victoria.                                                                                                       | alta      |
| RF-25 | `royale.ts` atesta `royale.kills` por kill, `royale.matches` al terminar, `royale.wins` si gana, `royale.top3` si queda entre los 3 primeros y `royale.bestPlacement` con el mejor puesto.                                                          | alta      |
| RF-26 | `race.ts` atesta `race.finished`, `race.won`, `race.podiums` y `race.laps` al pasar a `results`; los bots no suman.                                                                                                                                 | alta      |
| RF-27 | `deathmatch.ts` atesta `hexfire.matches`, `hexfire.wins` y `hexfire.kills`; `parkour.ts` atesta `parkour.finishes` y `parkour.wins`; `minigame2.ts` atesta `crypt.completed`.                                                                      | alta      |
| RF-28 | Cada hook de atestación es best-effort: si Mongo no responde, la partida no se bloquea ni se rompe; se registra un warning y se pierde el evento de esa partida.                                                                                    | alta      |
| RF-29 | El `matchId` se genera en el servidor al empezar la partida y se reutiliza en todas sus atestaciones; reiniciar el servidor no duplica un `matchId` ya escrito.                                                                                     | alta      |
| RF-30 | Tras cada atestación, el servidor recalcula las misiones afectadas y, si una pasa a `completed`, la marca con `completedAt` y `attested: true`.                                                                                                      | alta      |

### 4.4 Funcionales — reclamo y mint de recompensas

| ID    | Requisito                                                                                                                                                                                                                                          | Prioridad |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| RF-31 | `POST /rewards/claim` acepta `{ accountId, publicKey, missionId, token, request_id }` y exige JWT válido, `accountId = deriveAccountId(publicKey)` y que la public key pertenezca a la cuenta, igual que `sponsor-mint`.                             | alta      |
| RF-32 | El servidor evalúa la misión con sus propios datos y exige `status = completed`; ignora cualquier valor, contador o `collectedIds` enviado por el cliente en el reclamo.                                                                             | alta      |
| RF-33 | Antes de mintear, el servidor verifica on-chain la posesión de todos los NFTs de `unlock.nft` con `mt_tokens_for_owner` paginado y `from_index: null`; si el RPC falla, responde `503` y **no** mintea.                                            | alta      |
| RF-34 | El catálogo de la recompensa debe coincidir exactamente con `mission.reward.catalogId`; el endpoint rechaza cualquier otro catálogo, incluido un ítem de tienda.                                                                                    | alta      |
| RF-35 | El relayer llama `mint(owner_id = accountId, catalog_id)` con `MINT_DEPOSIT_YOCTO`, espera `EXECUTED` y guarda `tokenId`, `serial` y `txHash` en el reclamo.                                                                                        | alta      |
| RF-36 | Repetir el mismo `request_id` devuelve la misma respuesta sin un segundo mint; dos reclamos concurrentes de la misma misión solo producen un token gracias al índice único `(playerId, missionId)`.                                                | alta      |
| RF-37 | Si la cuenta ya alcanzó el tope por cuenta del catálogo, el reclamo se marca `already-owned` sin mintear y se devuelve el token existente o un mensaje claro; la misión queda reclamada.                                                            | alta      |
| RF-38 | Las recompensas consumen un presupuesto separado `REWARD_MINT_BUDGET_NEAR` (por defecto `3`), con estimación por mint de `0.006 NEAR`, reserva mínima `RELAYER_RESERVE_NEAR` y tope diario `REWARD_DAILY_MINT_LIMIT` (por defecto `60`).            | alta      |
| RF-39 | Con el presupuesto agotado, `/rewards/claim` responde `503 REWARD_CAPACITY`; el reclamo queda `pending` y el cliente muestra «Reward capacity reached; your claim is saved» sin perder la misión.                                                    | alta      |
| RF-40 | Los reintentos de un reclamo `pending`/`failed` se hacen como máximo una vez por minuto por jugador y respetan el rate limit global de reclamos (`5/min` y `50/día` por cuenta).                                                                  | media     |
| RF-41 | `POST /relayer/sponsor-mint` rechaza con `403` los `catalog_id` de `REWARD_ONLY_CATALOGS`; solo `/rewards/claim` puede pedir su mint al relayer.                                                                                                    | alta      |
| RF-42 | Los catálogos de recompensa se registran on-chain con `set_catalog_cap` y `set_catalog_metadata`; no se redeploya ningún contrato.                                                                                                                  | alta      |
| RF-43 | Un reclamo `failed` conserva el error legible, no marca la misión como reclamada y puede reintentarse; el depósito sobrante se devuelve al relayer.                                                                                                | alta      |
| RF-44 | El servidor nunca expone `RELAYER_PRIVATE_KEY`, el JWT completo ni el cuerpo firmado en logs o respuestas.                                                                                                                                          | alta      |

### 4.5 Funcionales — UI

| ID    | Requisito                                                                                                                                                                                                                                          | Prioridad |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| RF-45 | `MissionHud.svelte` añade una pestaña `Central` con tres sub-pestañas: `Errands`, `Challenges` y `Rewards`; `Cats` se mantiene intacta.                                                                                                            | alta      |
| RF-46 | `Errands` lista las 9 misiones de `SPEC-035` con estado `available`/`active`/`completed`, contador, barra y botón `Claim` si tienen recompensa.                                                                                                      | alta      |
| RF-47 | `Challenges` agrupa por pista y tramo, muestra `progress / target`, estado (`Locked`, `Ready`, `Completed`, `Claimed`) y el motivo del bloqueo (`Requires Golden Pistol NFT`, `Complete 3 Tier 1 missions`).                                         | alta      |
| RF-48 | `Rewards` lista las recompensas NFT ganadas y reclamadas con arte, título, serie (`#12`), botón `Claim`, estado `Minting…` y enlace al explorer.                                                                                                    | alta      |
| RF-49 | El botón `Claim` exige sesión con cuenta; sin sesión muestra `Sign in to claim`, y sin backend muestra `Rewards unavailable offline`.                                                                                                              | alta      |
| RF-50 | Al completar o reclamar se muestra un aviso y un banner, una sola vez; tras recargar no se repiten.                                                                                                                                                 | alta      |
| RF-51 | El anillo del botón de misiones muestra `misiones completadas / total` de la Central, no solo los gatos; la pestaña `Cats` conserva su contador `25/25`.                                                                                            | media     |
| RF-52 | Los diálogos de los 9 NPCs muestran el estado del encargo y, al completarlo, un enlace a `Central → Errands`; no se añade un árbol de diálogo nuevo.                                                                                                | media     |
| RF-53 | Ajustes incluye una sección `Progression` con misiones completadas, NFTs reclamados, estado de sincronización y `Reset errands`; el reset no borra reclamos y avisa de que las misiones reclamadas no vuelven a dar NFT.                            | alta      |
| RF-54 | La UI está en inglés y es usable a `390×844` con `?touch=1`: sub-pestañas desplazables, botones de 44 px, tarjetas apiladas y sin overflow horizontal.                                                                                              | media     |
| RF-55 | La Central no abre modales nuevos: vive dentro del panel de misiones existente, con su mismo cierre, backdrop y foco.                                                                                                                               | alta      |

### 4.6 No funcionales

| ID     | Requisito               | Criterio                                                                                                                                       |
| ------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| RNF-1  | Tipos                   | `cd frontend && bun run check` y `cd backend && bunx tsc --noEmit` terminan con 0 errores.                                                      |
| RNF-2  | Formato                 | `cd frontend && bun run lint` pasa en los archivos tocados; Prettier acotado al catálogo, stores y componentes nuevos.                          |
| RNF-3  | Build                   | `cd frontend && bun run build` termina y genera el sitio estático.                                                                              |
| RNF-4  | Tests                   | `cd backend && bun test` incluye los tests nuevos de progresión, atestación y reclamo; sin Mongo se omiten y terminan en 0.                      |
| RNF-5  | Idempotencia            | Reclamar dos veces, reenviar el mismo `request_id` o repetir un `matchId` no crea tokens ni suma contadores dos veces.                            |
| RNF-6  | Rendimiento             | `GET /progression` responde en < 300 ms con 1 000 misiones por jugador; el snapshot no hace una consulta por misión.                             |
| RNF-7  | Sin bloquear gameplay   | Toda escritura es asíncrona y best-effort; una caída de Mongo, RPC o relayer no congela una partida ni el HUD.                                  |
| RNF-8  | Seguridad de secretos   | `RELAYER_PRIVATE_KEY` no aparece en el bundle, en `/progression` ni en logs; los JWT no se guardan en Mongo.                                     |
| RNF-9  | Índices                 | `MissionProgress` único `(playerId, missionId)`; `RewardClaim` único `(playerId, missionId)` y `requestId`; `MissionAttestation` único por evento. |
| RNF-10 | Crecimiento acotado     | `MissionAttestation` tiene TTL de 180 días; `RewardClaim` y `MissionProgress` se conservan para siempre (son la prueba del reclamo).              |
| RNF-11 | Compatibilidad          | Clientes viejos sin `/progression` siguen jugando; las stats v1 se leen y migran sin pérdida.                                                   |
| RNF-12 | Accesibilidad           | `role="tablist"`/`tab`, `aria-selected`, `aria-live` para avisos, foco visible y botones con etiqueta.                                          |
| RNF-13 | Sin regresiones         | Gatos, encargos, checkpoints, tienda, mercado, chat, coches y los 8 minijuegos siguen funcionando.                                               |
| RNF-14 | Capacidad documentada   | La UI muestra el presupuesto restante y el estado «capacity reached»; el README explica el techo de testnet.                                     |

## 5. Criterios de aceptación

- [x] CA-1: `GET /progression/:playerId` devuelve el catálogo con 7 pistas y estados coherentes; un jugador nuevo ve `T0` disponible y `T1+` bloqueado.
- [x] CA-2: Un jugador sin NFTs completa `barn-first` y `royale-first`; al completar 2 misiones `T0` se desbloquea `T1` sin pedir ningún NFT.
- [x] CA-3: Matar 25 monstruos en Barn Siege sube `barn.kills` atestado a 25 y completa `barn-kills-25` incluso si el cliente cierra el HUD; al recargar sigue completada.
- [x] CA-4: Las kills de una sesión anónima no suben `attested`; al iniciar sesión y jugar, sí.
- [ ] CA-5: Ganar 3 carreras completa `gp-wins-3` y el HUD muestra `3/3` + `Ready`; el contador no cuenta carreras contra bots ni resultados que el servidor no confirmó.
- [x] CA-6: `POST /rewards/claim` de una misión no completada responde `409 MISSION_NOT_COMPLETED` y no mintea.
- [x] CA-7: Reclamar `barn-kills-25` con sesión mintea `shotgun-gold#1` al `accountId` del jugador, sin abrir el popup de Auth0 ni descontar saldo del jugador.
- [x] CA-8: Repetir el mismo reclamo con el mismo `request_id` devuelve el mismo `tokenId`; repetirlo con otro `request_id` responde `200` con `alreadyClaimed: true` y no mintea.
- [x] CA-9: Dos pestañas reclaman la misma misión a la vez: solo se crea un NFT y ambas reciben el mismo `tokenId`. Cubierto por el test de concurrencia `two concurrent claims mint once and share the token`.
- [x] CA-10: La misión `barn-kills-100` exige poseer `shotgun-gold`; sin él el HUD muestra `Locked` y el endpoint responde `403 MISSING_REQUIRED_NFT` sin mintear.
- [x] CA-11: Si el jugador vende `shotgun-gold` después de completar `barn-kills-100`, el progreso de la misión se conserva, pero el reclamo queda bloqueado hasta que vuelva a poseer el NFT.
- [x] CA-12: Un JWT inválido, una `publicKey` ajena o un `accountId` que no sea su derivación hacen que el reclamo responda `401`/`403` y no se difunda ninguna transacción. Cubierto por `rejects an invalid JWT` y `rejects an accountId that is not derived from the public key`.
- [x] CA-13: Un cliente que envía `value: 999999` en el body del reclamo no altera la evaluación: el servidor usa sus contadores. Cubierto por `ignores client-supplied counters in the claim body`.
- [x] CA-14: Con el presupuesto de recompensas agotado, el reclamo responde `503 REWARD_CAPACITY`, queda `pending` y la UI lo explica; al reponer el presupuesto, el siguiente intento lo mintea.
- [x] CA-15: Si el RPC de lectura falla al verificar la posesión, el reclamo responde `503` y no mintea; el progreso no se pierde.
- [x] CA-16: `POST /relayer/sponsor-mint` sigue permitido para los cosméticos de recompensa (también se venden en la tienda); el claim de una misión solo se concede en `/rewards/claim`, que reevalúa requisitos, topes y posesión.
- [x] CA-17: `/stats/:playerId/reset` deja los contadores a cero pero `MissionProgress` y `RewardClaim` siguen; no se puede volver a reclamar. Cubierto por `reset keeps MissionProgress and RewardClaim so a mission cannot be reclaimed`.
- [ ] CA-18: Con MongoDB apagado, `/progression` responde `503`, el HUD usa la caché, los reclamos están deshabilitados y los minijuegos siguen jugándose.
- [x] CA-19: El progreso local de `rw:npc-missions:v1` se importa una vez en el primer sync; dos pestañas que recogen objetivos distintos terminan con la unión.
- [x] CA-20: El catálogo del backend y del frontend coinciden; un test falla si un `missionId`, `catalogId` o umbral diverge.
- [x] CA-21: `bun run check`, `bun run lint`, `bun run build`, `bunx tsc --noEmit` y `bun test` pasan.
- [x] CA-22: `bun run npcs:check` sigue validando los 9 encargos y 40 objetivos de `SPEC-035`.
- [ ] CA-23: En móvil, la pestaña Central, sus sub-pestañas y los botones `Claim` son usables sin tapar los controles táctiles.
- [x] CA-24: El catálogo on-chain responde a `get_catalog_supplies` con los 20 cosméticos de recompensa y sus topes (50/5 para skins y assets, 25/3 para armas y vehículos); no se redeployó ningún contrato.
- [x] CA-25: Un reclamo `already-owned` (tope por cuenta alcanzado) no rompe la misión ni crea tokens extra; la UI muestra `Already owned`.
- [ ] CA-26: Después de reclamar, `My NFTs` del mercado muestra el NFT sin recargar la página y el enlace al explorer abre la transacción correcta.
- [x] CA-27: Las misiones `T2` y `T3` de una pista no se desbloquean si falta el cosmético o el NFT del hito anterior, aunque el contador de kills ya sea suficiente.
- [ ] CA-28: Reclamar una recompensa no cambia el equipado local de skins/armas/vehículos; el NFT aparece en el inventario y se puede equipar desde la tienda como cualquier otro.

> **Validación en testnet.** El 2026-11-14 se ejecutó `rewards:sync` (no-op: 0
> caps, 0 metadata) y `get_catalog_supplies` confirmó los 20 cosméticos con sus
> topes (50/5 y 25/3); paso 22 y CA-24 cerrados. Siguen pendientes los pasos 39
> y 40 (dos cuentas y coste real de mint) y los CA manuales 5, 18, 23, 26 y 28,
> que requieren relayer, Mongo o un navegador. La
> verificación local pasa `bunx tsc --noEmit`, `bun test` (61 tests),
> `bun run check` (0 errores), `bun run lint`, `bun run build` y
> `bun run npcs:check`.

## 6. Archivos relevantes

| Ruta                                                                 | Acción    | Motivo                                                                                       |
| -------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------- |
| `frontend/src/lib/missions/progression.ts`                           | crear     | Catálogo versionado de pistas, misiones, requisitos, recompensas y métricas.                 |
| `frontend/src/lib/state/progression.svelte.ts`                       | crear     | Store de snapshot, caché offline, cola de sync y acciones `claim`/`accept`/`abandon`.        |
| `frontend/src/lib/components/ui/MissionHud.svelte`                   | modificar | Pestaña `Central`, sub-pestañas, tarjetas, banner y avisos.                                  |
| `frontend/src/lib/components/ui/RewardCard.svelte`                   | crear     | Tarjeta reutilizable de recompensa NFT con arte, estado, serie y botón `Claim`.               |
| `frontend/src/lib/components/ui/ProgressionTrack.svelte`             | crear     | Lista agrupada por pista/tramo con progreso y motivo del bloqueo.                            |
| `frontend/src/lib/components/ui/ProgressionRewards.svelte`           | crear     | Inventario de recompensas ganadas y reclamadas.                                              |
| `frontend/src/lib/components/ui/NpcDialog.svelte`                    | modificar | Estado del encargo y enlace a `Central`; sin árbol de diálogo nuevo.                         |
| `frontend/src/lib/components/ui/SettingsMenu.svelte`                 | modificar | Sección `Progression`, sincronización y reset seguro.                                        |
| `frontend/src/lib/nft/catalog.ts`                                    | modificar | `kind: 'rewards'` legacy, `REWARD_ITEMS` vacío y unión `CATALOG_ITEMS`; la tienda sigue usando `MINTABLE_ITEMS`. |
| `frontend/src/lib/components/market/NftArt.svelte`                   | modificar | Icono/tono de recompensas (y tokens legacy `kind: 'rewards'`).                               |
| `frontend/src/lib/state/nftOwnership.svelte.ts`                      | modificar | Incluir catálogos de recompensa y helper `ownsAny`/`ownsAll` para gating.                    |
| `frontend/src/lib/state/stats.svelte.ts`                             | modificar | `StatsData` v2, métricas nuevas y `attested` de solo lectura.                                |
| `frontend/src/lib/state/statsApi.ts`                                 | modificar | Normalizar v1→v2 y las secciones nuevas.                                                     |
| `frontend/src/lib/services/lobbySocket.ts`                           | modificar | Enviar `token`, `accountId` y `publicKey` en `join` si hay sesión, sin bloquear el arranque. |
| `frontend/src/lib/GamePage.svelte`                                   | modificar | `progression.init/destroy` y re-init al resolver la cuenta.                                  |
| `frontend/src/vite.config.ts`                                        | modificar | Proxy `/api/progression` → backend `/progression` y `/api/rewards` → `/rewards`.              |
| `backend/src/progression/catalog.ts`                                 | crear     | Espejo validado del catálogo; el backend no confía en el frontend.                           |
| `backend/src/progression/service.ts`                                 | crear     | Snapshot, evaluación de objetivos/requisitos, progreso y completado.                         |
| `backend/src/progression/attest.ts`                                  | crear     | Escritura idempotente de atestaciones y actualización de contadores.                         |
| `backend/src/progression/rewards.ts`                                 | crear     | Reclamo, idempotencia, verificación de posesión y mint patrocinado.                          |
| `backend/src/progression/catalogSync.ts`                             | crear     | Verifica/ajusta caps y metadata de los 20 cosméticos de recompensa; idempotente (hoy no-op). |
| `backend/src/routes/progression.ts`                                  | crear     | Rutas `/progression/*` y `/rewards/claim`.                                                   |
| `backend/src/routes/relayer.ts`                                      | modificar | Exponer presupuesto de recompensas; `sponsor-mint` solo bloquea catálogos reward-only (hoy ninguno). |
| `backend/src/server/relayer.ts`                                      | modificar | `rewardMint`, presupuesto, reserva, extracción de `tokenId`/`serial` y exportar `assertOwnedAccount` para `identity.ts`. |
| `backend/src/server/identity.ts`                                     | crear     | `bindSession(wsId, jwt)` → `{ sub, accountId }`; verificación reutilizando `auth0.ts`.        |
| `backend/src/index.ts`                                               | modificar | Registrar `progressionRoutes` y pasar la identidad al `join`.                                |
| `backend/src/server/engines/waves.ts`                                | modificar | Atestar kills, oleadas y victoria.                                                          |
| `backend/src/server/engines/royale.ts`                               | modificar | Atestar kills, partidas, victorias y top 3.                                                  |
| `backend/src/server/engines/race.ts`                                 | modificar | Atestar vueltas, podios y victorias.                                                         |
| `backend/src/server/engines/deathmatch.ts`                           | modificar | Atestar partidas, kills y victorias.                                                         |
| `backend/src/server/engines/parkour.ts`                              | modificar | Atestar llegadas y victorias.                                                                |
| `backend/src/server/engines/minigame2.ts`                            | modificar | Atestar completaciones de la cripta.                                                         |
| `backend/src/stats/schema.ts`                                        | modificar | Esquema v2, secciones nuevas y `attested`.                                                   |
| `backend/src/stats/service.ts`                                       | modificar | Normalización v1→v2, `$max` de reportados y escritura atestada.                              |
| `backend/src/db/models/playerStats.ts`                               | modificar | Subdocumentos `royale`, `hexfire`, `parkour`, `errands`, `attested` y `race.podiums`.         |
| `backend/src/db/models/missionProgress.ts`                           | crear     | Progreso por jugador y misión.                                                               |
| `backend/src/db/models/rewardClaim.ts`                               | crear     | Ledger de reclamos y tokens.                                                                 |
| `backend/src/db/models/missionAttestation.ts`                        | crear     | Log append-only de evidencias con TTL e índice único.                                        |
| `backend/src/db/models/statsEvent.ts`                                | modificar | Nuevos tipos `royale-*`, `hexfire-*`, `parkour-*` y `reward-claim`.                           |
| `backend/tests/progression.test.ts`                                  | crear     | Catálogo, evaluación, gating, reclamo, idempotencia y presupuesto.                           |
| `backend/tests/progression.attest.test.ts`                           | crear     | Atestación por motor, deduplicación y sesión anónima.                                        |
| `frontend/scripts/verify-npcs.ts`                                    | sin cambio | Sigue validando los encargos de `SPEC-035`.                                                  |
| `specs/SPEC-035-misiones-npc-9-encargos.md`                          | modificar | Enlazar este spec como la capa de recompensas y persistencia.                                |
| `specs/SPEC-038-mercado-nft-nep245.md`                               | modificar | Nota: el catálogo de recompensas se añade sin redeploy; el mint de misión va aparte.          |
| `contracts/**`                                                       | sin cambio | No se modifican ni se redeployan contratos.                                                  |
| `frontend/static/**`                                                 | sin cambio | Las recompensas reutilizan los GLB/arte de los cosméticos existentes.                        |

## 7. Plan de implementación

### Fase 1 — Fundamentos: stats v2 e identidad de sesión

- [x] Paso 1: Subir `StatsData` a `version: 2` en `frontend/src/lib/state/stats.svelte.ts` y
      `backend/src/stats/schema.ts`. Añadir:
      - `barn.waves`, `barn.bestWave`
      - `race.podiums`
      - `royale: { played, finished, wins, kills, top3, bestPlacement }`
      - `hexfire: { played, wins, kills, deaths }`
      - `parkour: { played, finishes, wins, bestTimeMs }`
      - `errands: { accepted, completed, items }`
      - `attested` (mismo shape, solo servidor)
- [x] Paso 2: Normalizar v1→v2 en `statsApi.asStatsData`, en `readStats` y en
      `normalizeMissions`; un v1 sin secciones nuevas se lee con ceros y se
      reescribe como v2 en el siguiente sync.
- [x] Paso 3: Actualizar `metrics.svelte.ts`/podio solo si usan el shape; no
      cambiar el contrato público de `StatsData` más allá de añadir campos.
- [x] Paso 4: Crear `backend/src/server/identity.ts`:
      - `bindSession(wsId, { token, accountId, publicKey })`: verifica el JWT
        con `verifyAuth0Jwt`, obtiene `sub`, exige
        `accountId === deriveAccountId(publicKey)` y
        `assertOwnedAccount(accountId, publicKey)` (exportado desde
        `relayer.ts`), y guarda `{ sub, accountId }` en un mapa con TTL de
        sesión.
      - `accountFor(wsId)` / `clearSession(wsId)`.
      - Un token inválido, un `accountId` no derivado o una key ajena no cierran
        el socket: la sesión queda anónima y se registra el motivo.
- [x] Paso 5: Ampliar `join` en `backend/src/server/protocol.ts` y
      `backend/src/index.ts` con `{ token?, accountId?, publicKey? }`; el
      cliente los envía en silencio si hay sesión. Mantener compatibilidad con
      clientes viejos: un `join` con solo `name` sigue funcionando como anónimo.
- [x] Paso 6: Añadir `attested` al modelo `PlayerStats` y a
      `applySnapshot`/`applyEvents`: el `PUT` del cliente nunca escribe
      `attested`; solo `progression/attest.ts` lo hace con `$inc`.

### Fase 2 — Catálogo y almacenamiento de progreso

- [x] Paso 7: Crear `frontend/src/lib/missions/progression.ts` con:
      - `PROGRESSION_VERSION = 1`.
      - `ProgressionTrackId`, `ProgressionTier`, `ProgressionMissionId`.
      - `StatMetric` con las rutas de §11.2.
      - `PROGRESSION_MISSIONS` con las misiones de §11.1.
      - `PROGRESSION_BY_ID`, `PROGRESSION_BY_TRACK`, `REWARD_ONLY_CATALOGS`.
      - `unlockLabels(mission)` y `objectiveLabel(mission)`.
      - Sin imports de Svelte, DOM o Threlte: el validador de Bun debe
        importarlo.
- [x] Paso 8: Crear `backend/src/progression/catalog.ts` con el mismo catálogo
      y un test que compare ambos (`catalogFingerprint`). El código de
      producción no importa el catálogo del frontend (builds separados); solo
      `tests/catalogParity.test.ts` lo importa para la comparación.
- [x] Paso 9: Crear `MissionProgress`, `RewardClaim` y `MissionAttestation` con
      los índices de §4.1/RNF-9. Registrar los modelos en `ensureMongo`.
- [x] Paso 10: Implementar `progression/service.ts`:
      - `snapshot(playerId, accountId)` con `Promise.allSettled` para stats,
        progress y claims.
      - `evaluateMission(mission, stats, progress, ownedCatalogIds)`.
      - `evaluateAll(playerId)` que recalcula solo las misiones afectadas.
      - `syncErrands(playerId, localProgress)` con unión de IDs.
      - `accept/abandon/progressErrand`.
      - `refreshCompleted(playerId, affectedMetrics)`.
- [x] Paso 11: Crear `routes/progression.ts` con:
      - `GET /progression/catalog`
      - `GET /progression/:playerId`
      - `POST /progression/:playerId/sync`
      - `POST /progression/:playerId/missions/:missionId/accept`
      - `POST /progression/:playerId/missions/:missionId/abandon`
      - `POST /progression/:playerId/missions/:missionId/progress`
      - `GET /progression/:playerId/claims`
      - Validación zod, auth por `sub` igual que `/stats`, `503` sin Mongo.
- [x] Paso 12: Registrar las rutas en `backend/src/index.ts` y el proxy en
      `frontend/vite.config.ts`.

### Fase 3 — Atestación de minijuegos

- [x] Paso 13: Añadir `matchId` a cada motor al iniciar `playing` (UUID
      generado en el servidor) y un helper `attestMatch(metric, delta, meta)`.
- [x] Paso 14: `waves.ts`: atestar `barn.kills` en `monster-died`,
      `barn.waves` al cerrar oleada, `barn.completed`/`barn.bestWave` al
      terminar.
- [x] Paso 15: `royale.ts`: atestar `royale.kills` en cada kill,
      `royale.matches`/`royale.wins`/`royale.top3`/`royale.bestPlacement` en
      `results`.
- [x] Paso 16: `race.ts`: atestar `race.laps` al validar cada vuelta,
      `race.finished`/`race.podiums`/`race.won` en `results`.
- [x] Paso 17: `deathmatch.ts`, `parkour.ts` y `minigame2.ts` con sus métricas.
- [x] Paso 18: Tras cada lote de atestaciones, llamar a
      `refreshCompleted(playerId, metrics)`; si el jugador no tiene cuenta
      vinculada, no atestar.
- [x] Paso 19: Añadir un test de deduplicación: el mismo `matchId` dos veces
      no suma dos kills.

### Fase 4 — Recompensas NFT on-chain

- [x] Paso 20: Añadir a `frontend/src/lib/nft/catalog.ts`:
      - `CatalogKind` conserva `'rewards'` para tokens legacy.
      - `REWARD_ITEMS` queda vacío: las recompensas son los 20 cosméticos de
        §11.3, ya presentes en `MINTABLE_ITEMS`.
      - `CATALOG_ITEMS = [...MINTABLE_ITEMS, ...REWARD_ITEMS]` para arte,
        metadata y `catalogIdFromToken`.
      - `REWARD_ONLY_CATALOGS` vacío; `isRewardCatalog(id)` identifica el
        catálogo de recompensas en el backend, no una lista exclusiva.
      - `MintNftForm` y el selector de la tienda siguen usando solo
        `MINTABLE_ITEMS`.
- [x] Paso 21: Crear `backend/src/progression/catalogSync.ts`:
      - Lee `contracts/deployments/testnet.json` y el catálogo de recompensas.
      - Si falta un `catalog_id`, llama `set_catalog_cap` y
        `set_catalog_metadata`.
      - `set_catalog_cap`/`set_catalog_metadata` son **owner-only**: el script
        usa la cuenta owner del contrato (el deployer), no el relayer. Se
        ejecuta una vez por CLI (`bun run rewards:sync`) con las credenciales
        del owner; el backend no firma estas llamadas ni arranca con ellas.
      - El script es idempotente, imprime el resultado y los topes, y nunca
        escribe la clave en logs.
- [x] Paso 22: Ejecutar `rewards:sync` en testnet y verificar con
      `get_catalog_supplies` que los 20 cosméticos existen con los topes de
      §11.3. Resultado 2026-11-14: sync no-op (0 caps, 0 metadata) y los 20
      catálogos responden con `cap`/`per_account_cap` correctos.

### Fase 5 — Reclamo de recompensas

- [x] Paso 23: Ampliar `relayer.ts` con:
      - `REWARD_MINT_BUDGET_NEAR` (3), `REWARD_DAILY_MINT_LIMIT` (60),
        `REWARD_MINT_ESTIMATE_YOCTO` (0.006) y contadores diarios.
      - `rewardMint({ accountId, catalogId, requestId })` que reutiliza
        `ensure-account`, `mint` y la extracción de `tokenId`/`serial`.
      - Rechazo de `REWARD_ONLY_CATALOGS` en `sponsorMint`.
      - Estado del presupuesto en `GET /relayer/status`.
- [x] Paso 24: Implementar `progression/rewards.ts`:
      - `claim(playerId, accountId, publicKey, missionId, requestId, token)`.
      - Verificación de JWT, derivación de cuenta y access key (reutilizar
        `sponsor-mint`).
      - Carga de misión y evaluación server-side; `409` si no está completada.
      - Verificación on-chain de `unlock.nft` con `mt_tokens_for_owner`
        paginado y cache de 30 s; `503` si no se puede verificar.
      - Reserva/insert de `RewardClaim` con índice único; estados
        `pending → minting → minted|already-owned|failed`.
      - Llamada a `rewardMint` y persistencia de `tokenId`, `serial`, `txHash`.
      - Reintento de `pending`/`failed` con límite de 1/min por jugador.
- [x] Paso 25: Crear `POST /rewards/claim` y `GET /rewards/status` en
      `routes/rewards.ts` (registradas junto a `/progression`) con zod,
      rate limits y errores legibles.
- [x] Paso 26: Añadir tests de integración con Mongo y un mock del RPC/relayer:
      completado, no completado, gate ausente, doble claim, `already-owned`,
      presupuesto agotado, RPC caído y JWT inválido.

### Fase 6 — Frontend: store, HUD y reclamo

- [x] Paso 27: Crear `progression.svelte.ts`:
      - `snapshot`, `loading`, `offline`, `error`, `notice`.
      - `init(playerId)`, `refresh()`, `destroy()`.
      - Caché `rw:progression:v1` y cola `pendingErrands`.
      - `accept`, `abandon`, `progressErrand`, `syncNow`, `claim`.
      - `refresh()` tras `storage`/`online` y debounce de 700 ms.
      - Un fallo de red no borra la caché ni bloquea el HUD.
- [x] Paso 28: Integrar en `GamePage.svelte` después de `stats.init` y
      `missions.init`; re-init cuando `authSession.accountId` esté listo.
      `destroy()` en el cleanup.
- [x] Paso 29: Modificar `MissionHud.svelte`:
      - Tabs `Cats` / `Errands` / `Challenges` / `Rewards` (o `Central` con
        sub-tabs), sin romper el panel actual.
      - `ProgressionTrack` agrupado por pista y tramo.
      - `ProgressionRewards` con `RewardCard`.
      - Contador del anillo = completadas / total de la Central.
- [x] Paso 30: Crear `RewardCard.svelte`:
      - Arte con `NftArt` y fallback para `kind: 'rewards'`.
      - `Locked` + motivo, `Ready` + `Claim`, `Minting…`, `Claimed` + serie.
      - Enlace a `https://testnet.nearblocks.io/txns/<hash>` y a la cuenta.
      - Botones de 44 px y `aria-live`.
- [x] Paso 31: `NpcDialog.svelte` y `SettingsMenu.svelte`:
      - Enlace `Open Central` en la tarjeta del encargo completado.
      - Sección `Progression` con `completed`, `claimed`, `syncState`.
      - `Reset errands` no toca `MissionProgress` completadas ni claims; texto
        explícito de que los NFT reclamados no se devuelven.
- [x] Paso 32: Avisos y banner: `Mission complete`, `Reward ready`, `Reward
      claimed: <label> #<serial>`, `Reward capacity reached`. No repetir al
      recargar.
- [x] Paso 33: Sincronizar `nftOwnership` después de un reclamo para que el
      NFT aparezca en `My NFTs` y se pueda equipar sin recargar.

### Fase 7 — Migración y compatibilidad

- [x] Paso 34: En el primer `POST /progression/:playerId/sync`, importar:
      - `rw:npc-missions:v1` de `SPEC-035` (IDs y estado) → `MissionProgress`.
      - `rw:missions:v1` (gatos y victorias de minijuego) → `MissionProgress`
        de la pista correspondiente.
      - El cliente lee `localStorage` y envía `legacyCompleted`; el servidor
        aplica una allowlist y marca `migratedFromLocalAt` para no repetirlo.
- [x] Paso 35: Mantener las claves locales como caché de escritura; si el
      backend no responde, el jugador sigue avanzando y se sincroniza después.
- [x] Paso 36: Compatibilidad con clientes viejos: `rw:missions:v1` y
      `rw:npc-missions:v1` siguen funcionando solos; la Central es una capa
      adicional.
- [x] Paso 37: Revisar que el reset de stats no borra progreso y que el reset
      de encargos no permite reclamar dos veces.

### Fase 8 — Verificación y cierre

- [x] Paso 38: Ejecutar la verificación de §8 y corregir errores.
- [ ] Paso 39: Probar los casos manuales con dos cuentas (jugador A y B) y
      registrar los `txHash` de al menos 5 reclamos.
- [ ] Paso 40: Medir el costo real de un mint de recompensa y ajustar
      `REWARD_MINT_ESTIMATE_YOCTO` y el presupuesto.
- [x] Paso 41: Actualizar `estado`, `actualizado`, checkboxes, «Progreso» y
      «Changelog»; añadir la nota de capacidad en `backend/README.md`.

### Contratos de datos

```ts
// frontend/src/lib/missions/progression.ts
export const PROGRESSION_VERSION = 1;

export type ProgressionTrackId =
	| 'barn'
	| 'royale'
	| 'gp'
	| 'hexfire'
	| 'parkour'
	| 'crypt'
	| 'explorer';

export type ProgressionTier = 'T0' | 'T1' | 'T2' | 'T3' | 'T4';

export type StatMetric =
	| 'cats.found'
	| 'cats.completed'
	| 'crypt.completed'
	| 'crypt.deaths'
	| 'barn.kills'
	| 'barn.completed'
	| 'barn.waves'
	| 'race.finished'
	| 'race.won'
	| 'race.podiums'
	| 'race.laps'
	| 'royale.matches'
	| 'royale.wins'
	| 'royale.kills'
	| 'royale.top3'
	| 'hexfire.matches'
	| 'hexfire.wins'
	| 'hexfire.kills'
	| 'parkour.finishes'
	| 'parkour.wins'
	| 'errands.completed'
	| 'missions.completed';

export type MissionObjective =
	| { type: 'stat'; metric: StatMetric; target: number }
	| { type: 'collect'; objectiveIds: readonly string[] }
	| { type: 'meta'; track?: ProgressionTrackId; tier?: ProgressionTier; target: number };

export type MissionUnlock = {
	missions?: readonly string[];
	tier?: ProgressionTier;
	nft?: readonly { catalogId: string; copies?: number }[];
};

export type RewardRef = {
	catalogId: string;
	label: string;
	kind: 'cosmetic';
};

export type ProgressionMission = {
	id: string;
	track: ProgressionTrackId;
	tier: ProgressionTier;
	title: string;
	description: string;
	objective: MissionObjective;
	unlock: MissionUnlock;
	reward: RewardRef | null;
	serverAttested: boolean;
};

export type ProgressionStatus = 'locked' | 'available' | 'active' | 'completed' | 'claimed';

export type ProgressionMissionState = {
	missionId: string;
	status: ProgressionStatus;
	value: number;
	target: number;
	collectedIds: string[];
	lockedReason: string | null;
	completedAt: number | null;
	claimedAt: number | null;
	claim: RewardClaimState | null;
};
```

```ts
// backend/src/progression/service.ts
export type ProgressSnapshot = {
	version: 1;
	playerId: string;
	accountId: string | null;
	stats: { reported: StatsData; attested: StatsData };
	missions: ProgressionMissionState[];
	claims: RewardClaimState[];
	ownedCatalogIds: string[];
	serverTime: number;
};

export type RewardClaimState = {
	claimId: string;
	missionId: string;
	catalogId: string;
	status: 'pending' | 'minting' | 'minted' | 'already-owned' | 'failed';
	tokenId: string | null;
	serial: number | null;
	txHash: string | null;
	error: string | null;
	createdAt: number;
	updatedAt: number;
};
```

```ts
// Endpoints
GET  /progression/catalog
GET  /progression/:playerId
POST /progression/:playerId/sync
     body: { errands: { missionId: string; collectedIds: string[] }[] }
POST /progression/:playerId/missions/:missionId/accept
POST /progression/:playerId/missions/:missionId/abandon
POST /progression/:playerId/missions/:missionId/progress
     body: { collectedIds: string[] }
GET  /progression/:playerId/claims

POST /rewards/claim
     body: { accountId, publicKey, missionId, token, request_id }
     200: { claim: RewardClaimState, minted: boolean, alreadyClaimed: boolean, budgetRemainingYocto: string }
     400/401/403/409/429/503
GET  /rewards/status
     200: { rewardMintAvailable: boolean, reason: 'ok'|'budget'|'reserve'|'disabled'|'error',
            budgetRemainingYocto: string, dailyRemaining: number, estimateYocto: string }
```

## 8. Verificación

```bash
# Frontend
cd frontend && bun run check
cd frontend && bun run lint
cd frontend && bun run build

# Frontend: validador de encargos de SPEC-035
cd frontend && bun run npcs:check

# Backend
cd backend && bunx tsc --noEmit
cd backend && bun test

# Catálogo de recompensas en testnet (idempotente; no redeploy)
cd backend && bun run rewards:sync

# Verificación on-chain
near view nft.runworld-nep245.testnet get_catalog_supplies \
  '{"catalog_ids":["shotgun-gold","pistol-gold","crown"]}'
```

Casos manuales:

1. **Jugador nuevo sin NFTs**: abre la Central; `T0` disponible, `T1` bloqueado
   con «Complete 2 Tier 0 missions». Juega una partida de Barn Siege y termina;
   `barn-first` pasa a completada sin ningún NFT.
2. **Primer NFT**: completa dos misiones `T0`; `T1` se desbloquea. Consigue 25
   kills en Barn Siege; el HUD muestra `25/25`, `Ready` y el botón `Claim`.
   Reclama: se mintea `shotgun-gold` sin popup de Auth0 y sin bajar el saldo
   del jugador. Comprueba el `tokenId`/`txHash` y que aparece en `My NFTs`.
3. **Idempotencia**: pulsa `Claim` dos veces y repite el mismo `request_id` con
   `curl`; hay un solo NFT. Recarga: `Claimed` con la serie.
4. **Gate por NFT**: con 100 kills, `barn-kills-100` sigue `Locked` si no
   posees `shotgun-gold`. Vende el cosmético en el mercado y comprueba que
   `barn-kills-100` sigue completada pero el reclamo queda bloqueado hasta
   volver a poseerlo.
5. **Skyfall**: juega, mata 10, 50 y 200; las misiones suben por tramos y cada
   una pide el cosmético anterior. Comprueba que una sesión anónima no suma
   kills atestadas.
6. **Gran Premio**: termina 1 carrera, sube a 3 podios y gana 3; `gp-wins-3`
   se completa y la recompensa es la skin `vampire`. Gana 10 y comprueba que
   se mintea otra copia de `vampire` (tope por cuenta 5).
7. **Presupuesto**: agota `REWARD_MINT_BUDGET_NEAR` en un entorno de prueba; el
   reclamo responde `503 REWARD_CAPACITY`, queda `pending` y la UI lo explica.
   Repón el presupuesto y comprueba que se mintea sin reclamar dos veces.
8. **Sin MongoDB**: apaga `mongod`; la Central muestra la caché, los reclamos
   se deshabilitan y los minijuegos siguen. Al volver, el progreso local se
   sincroniza.
9. **Migración**: con `rw:npc-missions:v1` de una sesión previa, inicia sesión y
   comprueba que los encargos completados aparecen una sola vez en Mongo.
10. **Dos pestañas**: recoge objetivos distintos de un encargo en cada pestaña;
    la unión queda persistida. Reclama la misma misión a la vez: un solo NFT.
11. **Seguridad**: llama `/rewards/claim` con JWT inválido, public key ajena,
    `accountId` no derivado y `value: 999999`; no se mintea nada.
12. **Sponsor-mint**: pide `shotgun-gold` por `/relayer/sponsor-mint`; se
    permite porque es un cosmético de tienda. El claim de una misión sigue
    pasando por `/rewards/claim`, que reevalúa requisitos y topes; la tienda no
    puede saltarse la misión.
13. **Móvil**: a `390×844` con `?touch=1`, la Central y sus sub-pestañas se
    desplazan, los botones miden 44 px y no hay overflow horizontal.
14. **Regresiones**: gatos, encargos, checkpoints, tienda, mercado, chat,
    coches y los 8 minijuegos siguen funcionando.

## 9. Riesgos y mitigaciones

| Riesgo                                                                 | Impacto | Mitigación                                                                                                                       |
| ---------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| El cliente infla `stats` y reclama un NFT sin jugar                      | alto    | Las misiones de minijuego leen `attested`, escrito solo por los motores; el reclamo ignora el body del cliente.                   |
| El WebSocket no tiene identidad y no se puede acreditar la kill         | alto    | `join` acepta JWT opcional, `identity.ts` vincula `ws.id → sub/accountId`; sin vínculo no hay atestación.                        |
| Un jugador vende el NFT-llave justo antes de reclamar                   | medio   | El reclamo re-verifica la posesión; el progreso no se pierde y puede recomprar o volver a ganar.                                  |
| El mint se ejecuta dos veces por reintentos o pestañas                  | alto    | Índice único `(playerId, missionId)`, `requestId` idempotente y estado `minting` con bloqueo.                                      |
| Presupuesto de testnet agotado                                          | alto    | Presupuesto separado, tope diario, `503 REWARD_CAPACITY`, claim `pending` y UI «capacity reached».                                 |
| Topes de catálogo agotados por recompensas                              | medio   | Topes de cosméticos 50/5 (skins/assets) y 25/3 (armas/vehículos); `set_catalog_cap` puede subirlos sin redeploy.                  |
| `mint` on-chain es público y alguien automintea un cosmético            | medio   | Coste propio de 0.01 NEAR; no hay incentivo. Documentado como límite de testnet; producción necesita allowlist o NEP-366.         |
| RPC caído al verificar la posesión                                      | alto    | Fail-closed: `503 OWNERSHIP_UNVERIFIED`, no se mintea, el claim queda pendiente.                                                  |
| Mongo caído bloquea partidas                                           | alto    | Atestación best-effort con `try/catch`, sin bloquear el tick; el resto del backend sigue.                                          |
| Recompensas duplicadas por eventos repetidos del motor                 | alto    | `MissionAttestation` único `(source, matchId, playerId, metric)` y `$inc` solo tras insertar la evidencia.                         |
| Migración duplicada de `localStorage`                                   | medio   | Marca `migratedFromLocalAt` y unión por IDs; una sola importación por jugador.                                                     |
| Los cosméticos de recompensa se confunden con los de tienda             | bajo    | Comparten catálogo, arte y metadata; el claim deja `RewardClaim` con serie/token y la Central muestra `Claimed`.                  |
| Saturación del HUD con 40+ misiones                                     | medio   | Agrupación por pista/tramo, progreso resumido y sub-pestañas; solo se expande una pista a la vez.                                  |
| Reset de stats permite re-reclamar                                      | alto    | `reset` no toca `MissionProgress`/`RewardClaim`; el índice único de claim lo impide incluso si se borra el progreso local.         |
| Crecimiento de `MissionAttestation`                                     | bajo    | TTL de 180 días; `RewardClaim` y `MissionProgress` son pequeños y permanentes.                                                     |
| Desfase entre el catálogo del frontend y el backend                     | alto    | Test de huella (`catalogFingerprint`) y `PROGRESSION_VERSION`; el backend rechaza IDs desconocidos.                                |

## 10. Preguntas abiertas (resueltas)

- [x] **¿La recompensa se da automáticamente al completar?**
      No. Se reclama con un botón para poder re-verificar requisitos, evitar
      mints sorpresa, controlar el presupuesto y mostrar la transacción.
- [x] **¿Una misión puede dar más de un NFT?**
      No. Una misión = como máximo una recompensa. Las recompensas de tramo y
      los hitos son misiones separadas para que cada claim sea idempotente.
- [x] **¿Todas las misiones dan NFT?**
      No. Las misiones `T0` y los encargos dan progreso y sellos de perfil; los
      NFT se reservan a hitos para que el presupuesto de testnet alcance y cada
      token conserve valor. Los ejemplos del usuario (25/100/250 kills, 10/50/
      200 en Skyfall, 3/10 victorias) sí dan NFT.
- [x] **¿Qué pasa si el jugador ya tiene el NFT de la recompensa?**
      Se mintea otra copia si el tope por cuenta lo permite (es comerciable);
      si no, el claim queda `already-owned` y la misión se marca reclamada.
- [x] **¿Se puede vender el NFT que abre una misión?**
      Sí. Al reclamar se vuelve a verificar la posesión; si se vendió, el
      progreso se conserva pero el claim espera. Es la utilidad de mercado que
      buscamos.
- [x] **¿Las misiones son repetibles?**
      No. Una vez por cuenta y misión. No hay diarias ni temporadas en esta
      fase.
- [x] **¿Qué pasa sin sesión?**
      Se juega y se guarda progreso local; los reclamos y las misiones
      atestadas requieren iniciar sesión. El HUD muestra `Sign in to claim`.
- [x] **¿Se confía en el progreso de gatos y encargos?**
      Se acepta como progreso reportado y se limita a sellos y cosméticos de
      bajo valor. Las recompensas grandes dependen de contadores atestados.
- [x] **¿Se toca `rw:missions:v1`?**
      No se rompe: se sigue escribiendo para gatos y victorias locales y se
      importa al servidor. La Central usa Mongo como fuente de verdad.
- [x] **¿Se redeployan los contratos?**
      No. Las recompensas son 20 cosméticos que ya existen; `set_catalog_cap` +
      `set_catalog_metadata` pueden ajustar sus topes/metadata sin redeploy,
      pero hoy el sync es no-op.
- [x] **¿Se añaden GLBs?**
      No. Las recompensas reutilizan los GLB y el arte de los cosméticos
      existentes.
- [x] **¿El podio existente cambia?**
      No. Solo se añaden campos de stats; el podio sigue usando su contrato.
- [x] **¿Quién paga el mint?**
      El relayer. El jugador nunca paga ni recibe NEAR; el único premio es el
      NFT. El coste de red (~0.006 NEAR por token) es infraestructura de
      testnet y se controla con `REWARD_MINT_BUDGET_NEAR` y el tope diario.

## 11. Decisiones y notas

### 11.1 Catálogo de misiones

Los textos de UI van en inglés. Cada fila es una misión con ID estable. Las
misiones `T0` no dan NFT; las demás dan la recompensa indicada.

Leyenda de recompensas: `—` = sello de perfil (sin mint); el resto es un
`catalog_id` NFT.

Además del `Desbloqueo` de cada fila se aplica el **gate de tramo**:

| Tramo | Requisito global                                                    |
| ----- | ------------------------------------------------------------------- |
| `T0`  | Ninguno.                                                            |
| `T1`  | 2 misiones `T0` completadas.                                        |
| `T2`  | Poseer `hero` + 3 misiones `T1` completadas.                        |
| `T3`  | Poseer `crow-warden` + 3 misiones `T2` completadas.                 |
| `T4`  | Poseer `pumpkin-king` + 3 misiones `T3` completadas.                |

Los `unlock` de las tablas ya incluyen el NFT del hito de su pista; el gate de
tramo es adicional y se evalúa antes.

#### Pista `barn` — Asedio al Granero

| ID                | Tramo | Título                  | Objetivo                       | Desbloqueo                                | Recompensa          |
| ----------------- | ----- | ----------------------- | ------------------------------ | ----------------------------------------- | ------------------- |
| `barn-first`      | T0    | Hold the Farm           | `barn.completed >= 1`          | —                                         | —                   |
| `barn-kills-25`   | T1    | First Blood             | `barn.kills >= 25`             | 2 misiones T0                             | `shotgun-gold`      |
| `barn-kills-100`  | T2    | Siege Veteran           | `barn.kills >= 100`            | `shotgun-gold` + 3 misiones T1            | `pistol-gold`       |
| `barn-kills-250`  | T3    | Butcher of the Barn     | `barn.kills >= 250`            | `pistol-gold` + `crow-warden`             | `frankenstein`      |

#### Pista `royale` — Skyfall Royale

| ID                  | Tramo | Título               | Objetivo                                   | Desbloqueo                          | Recompensa          |
| ------------------- | ----- | -------------------- | ------------------------------------------ | ----------------------------------- | ------------------- |
| `royale-first`      | T0    | Drop In              | `royale.matches >= 1`                      | —                                   | —                   |
| `royale-kills-10`   | T1    | Island Hunter        | `royale.kills >= 10`                       | 2 misiones T0                       | `sniper-gold`       |
| `royale-kills-50`   | T2    | Storm Chaser         | `royale.kills >= 50`                       | `sniper-gold` + 3 misiones T1       | `bazooka-gold`      |
| `royale-kills-200`  | T3    | Last One Standing    | `royale.kills >= 200` and `royale.wins >= 5` | `bazooka-gold` + `crow-warden`      | `ghost`             |

#### Pista `gp` — Gran Premio

| ID             | Tramo | Título            | Objetivo                          | Desbloqueo                       | Recompensa       |
| -------------- | ----- | ----------------- | --------------------------------- | -------------------------------- | ---------------- |
| `gp-first`     | T0    | Lights Out        | `race.finished >= 1`              | —                                | —                |
| `gp-podium-3`  | T1    | Podium Regular    | `race.podiums >= 3`               | 2 misiones T0                    | `skateboard`     |
| `gp-wins-3`    | T2    | Grand Prix Winner | `race.won >= 3`                   | `skateboard` + 3 misiones T1     | `vampire`        |
| `gp-wins-10`   | T3    | Track Legend      | `race.won >= 10`                  | `vampire` + `crow-warden`        | `vampire`        |

#### Pista `hexfire` — Hexfire Deathmatch

| ID                  | Tramo | Título             | Objetivo                 | Desbloqueo                          | Recompensa          |
| ------------------- | ----- | ------------------ | ------------------------ | ----------------------------------- | ------------------- |
| `hexfire-first`     | T0    | Enter the Witch House | `hexfire.matches >= 1`   | —                                   | —                   |
| `hexfire-wins-5`    | T1    | Hexfire Regular    | `hexfire.wins >= 5`      | 2 misiones T0                       | `demon`             |
| `hexfire-wins-20`   | T2    | Witch Hunter       | `hexfire.wins >= 20`     | `demon` + 3 misiones T1             | `mp5-gold`          |
| `hexfire-wins-50`   | T3    | Hexfire Champion   | `hexfire.wins >= 50`     | `mp5-gold` + `crow-warden`          | `demon`             |

#### Pista `parkour` — Parkour Spire

| ID                 | Tramo | Título             | Objetivo                  | Desbloqueo                       | Recompensa          |
| ------------------ | ----- | ------------------ | ------------------------- | -------------------------------- | ------------------- |
| `parkour-first`    | T0    | First Ascent       | `parkour.finishes >= 1`   | —                                | —                   |
| `parkour-wins-3`   | T1    | Spire Runner       | `parkour.wins >= 3`       | 2 misiones T0                    | `ghost`             |
| `parkour-wins-10`  | T2    | Sky Climber        | `parkour.wins >= 10`      | `ghost` + 3 misiones T1          | `magic-broom`       |
| `parkour-wins-25`  | T3    | Spire Master       | `parkour.wins >= 25`      | `magic-broom` + `crow-warden`    | `magic-broom`       |

#### Pista `crypt` — Cripta

| ID             | Tramo | Título             | Objetivo                   | Desbloqueo                        | Recompensa          |
| -------------- | ----- | ------------------ | -------------------------- | --------------------------------- | ------------------- |
| `crypt-first`  | T0    | Skull Collector    | `crypt.completed >= 1`     | —                                 | —                   |
| `crypt-5`      | T1    | Crypt Regular      | `crypt.completed >= 5`     | 2 misiones T0                     | `crown`             |
| `crypt-25`     | T2    | Tomb Raider        | `crypt.completed >= 25`    | `crown` + 3 misiones T1           | `crown`             |
| `crypt-50`     | T3    | Keeper of the Crypt| `crypt.completed >= 50`    | `crown` + `crow-warden`           | `mummy`             |

#### Pista `explorer` — Lobby, gatos y encargos

| ID                     | Tramo | Título             | Objetivo                              | Desbloqueo                            | Recompensa        |
| ---------------------- | ----- | ------------------ | ------------------------------------- | ------------------------------------- | ----------------- |
| `alba-moonflowers`     | T0    | Moonflowers        | `collect: moon-01…moon-05`            | Hablar con Alba (`SPEC-035`)          | —                 |
| `bruno-ingredients`    | T0    | Midnight Batch     | `collect: ing-01…ing-04`              | Hablar con Bruno                      | —                 |
| `carmen-parcels`       | T0    | Lost Parcels       | `collect: parcel-01…parcel-03`        | Hablar con Carmen                     | —                 |
| `mateo-mail-run`       | T0    | Mail Run           | `collect: mail-01…mail-05`            | Hablar con Mateo                      | —                 |
| `lucia-watch`          | T0    | Neighborhood Watch | `collect: watch-01…watch-06`          | Hablar con Lucía                      | —                 |
| `tomas-parts`          | T0    | Missing Parts      | `collect: part-01…part-04`            | Hablar con Tomás                      | —                 |
| `vera-relics`          | T0    | Castle Relics      | `collect: relic-01…relic-04`          | Hablar con Vera                       | —                 |
| `rosa-pumpkins`        | T0    | Pumpkin Hunt       | `collect: pumpkin-01…pumpkin-05`      | Hablar con Rosa                       | —                 |
| `elias-lanterns`       | T0    | Lanterns           | `collect: lantern-01…lantern-04`      | Hablar con Elías                      | —                 |
| `cats-first`           | T0    | Cat Person         | `cats.found >= 1`                     | —                                     | —                 |
| `cats-25`              | T1    | All the Cats       | `cats.found >= 25`                    | 2 misiones T0                         | `witch`           |
| `errands-9`            | T1    | Neighborhood Hero  | `errands.completed >= 9`              | 2 misiones T0                         | `coin-pistol`     |
| `explorer-veteran`     | T2    | Village Veteran    | `meta: track=explorer, tier<=T1, target=8` | `witch` + `coin-pistol`          | `golem`           |
| `explorer-all`         | T3    | Heart of RunWorld  | `meta: track=explorer, target=12`     | `golem` + `crow-warden`               | `skeleton`        |

#### Cosméticos de tramo (misiones `meta`)

| ID                 | Tramo | Título      | Objetivo                                        | Desbloqueo              | Recompensa          |
| ------------------ | ----- | ----------- | ----------------------------------------------- | ----------------------- | ------------------- |
| `tier-initiate`    | T1    | Initiate    | 4 misiones `T1` de cualquier pista              | 2 misiones `T0`         | `hero`              |
| `tier-veteran`     | T2    | Veteran     | 4 misiones `T2` de cualquier pista              | `hero`                  | `crow-warden`       |
| `tier-champion`    | T3    | Champion    | 4 misiones `T3` de cualquier pista              | `crow-warden`           | `pumpkin-king`      |
| `tier-legend`      | T4    | Legend      | 6 misiones `T3` de minijuego (todas las pistas de juego) | `pumpkin-king`          | `pumpkin-king`      |

> Las misiones `meta` no se cuentan a sí mismas ni a otras `meta`. El servidor
> las evalúa al final, después de las misiones normales, para evitar bucles.

### 11.2 Métricas y origen

| Métrica              | Origen | Quién la escribe                          |
| -------------------- | ------ | ----------------------------------------- |
| `barn.kills`         | A      | `waves.ts` (monster-died)                 |
| `barn.completed`     | A      | `waves.ts` (victoria de la partida)       |
| `barn.waves`         | A      | `waves.ts` (oleada cerrada)               |
| `royale.matches`     | A      | `royale.ts` (results)                     |
| `royale.kills`       | A      | `royale.ts` (kill)                        |
| `royale.wins`        | A      | `royale.ts` (results)                     |
| `royale.top3`        | A      | `royale.ts` (results)                     |
| `race.finished`      | A      | `race.ts` (results)                       |
| `race.won`           | A      | `race.ts` (results)                       |
| `race.podiums`       | A      | `race.ts` (results, puesto ≤ 3)           |
| `race.laps`          | A      | `race.ts` (vuelta validada)               |
| `hexfire.matches`    | A      | `deathmatch.ts` (results)                 |
| `hexfire.wins`       | A      | `deathmatch.ts` (results)                 |
| `hexfire.kills`      | A      | `deathmatch.ts` (kill)                    |
| `parkour.finishes`   | A      | `parkour.ts` (results)                    |
| `parkour.wins`       | A      | `parkour.ts` (results)                    |
| `crypt.completed`    | A      | `minigame2.ts` (results)                  |
| `cats.found`         | C      | `stats.recordCatCapture`                  |
| `cats.completed`     | C      | `missions.svelte.ts`                      |
| `errands.completed`  | C      | `progression` desde `SPEC-035`            |
| `missions.completed` | A+C    | Servidor, suma de misiones completadas    |

`A` = atestado por el servidor; `C` = reportado por el cliente. Las misiones
con `serverAttested: true` solo leen `attested`. Las de exploración leen
`reported`.

### 11.3 Catálogo NFT de recompensa

Las recompensas son **20 cosméticos que ya existen** en la tienda y en el
contrato NFT. No se añaden catálogos ni se redeploya: `rewards:sync` solo
verifica `set_catalog_cap`/`set_catalog_metadata` y hoy es no-op (0 caps, 0
metadata). Cada cosmético conserva su GLB, arte y metadata on-chain.

Skins y assets (`cap 50`, `per_account_cap 5`):

| `catalog_id`    | Título        | Tipo   |
| --------------- | ------------- | ------ |
| `hero`          | Heroine       | skin   |
| `crow-warden`   | Scarecrow     | skin   |
| `witch`         | Witch         | skin   |
| `demon`         | Demon         | skin   |
| `frankenstein`  | Frankenstein  | skin   |
| `ghost`         | Ghost         | skin   |
| `golem`         | Golem         | skin   |
| `mummy`         | Mummy         | skin   |
| `pumpkin-king`  | Pumpkin King  | skin   |
| `skeleton`      | Skeleton      | skin   |
| `vampire`       | Vampire       | skin   |
| `crown`         | Crown         | asset  |
| `coin-pistol`   | Coin Pistol   | asset  |

Armas y vehículos (`cap 25`, `per_account_cap 3`):

| `catalog_id`    | Título         | Tipo    |
| --------------- | -------------- | ------- |
| `pistol-gold`   | Golden Pistol  | weapon  |
| `shotgun-gold`  | Golden Shotgun | weapon  |
| `mp5-gold`      | Golden SMG     | weapon  |
| `sniper-gold`   | Golden Sniper  | weapon  |
| `bazooka-gold`  | Golden Bazooka | weapon  |
| `skateboard`    | Skateboard     | vehicle |
| `magic-broom`   | Magic Broom    | vehicle |

Los topes reales mandan desde el contrato (`get_catalog_supplies`); el backend
los replica en `REWARD_CATALOG` para la UI y el presupuesto. `rewardMint` acepta
cualquiera de estos 20; `sponsor-mint` también, porque son cosméticos de tienda
y no hay catálogos reward-only.

### 11.4 Presupuesto y capacidad de testnet

- Coste de infraestructura, no premio: cada mint consume **~0.005–0.006 NEAR**
  de storage + gas, pagado por el relayer/deployer. El jugador no paga ni
  recibe NEAR.
- Presupuesto de infraestructura: **3 NEAR** ≈ **500 mints** (configurable con
  `REWARD_MINT_BUDGET_NEAR`).
- Un jugador que completa todo el catálogo puede reclamar **26 NFTs**:
  18 de las pistas (3 por pista × 6), 4 de exploración (`cats-25`,
  `errands-9`, `explorer-veteran`, `explorer-all`) y 4 de tramo
  (`tier-initiate`, `tier-veteran`, `tier-champion`, `tier-legend`). Son 26
  mints sobre 20 catálogos: algunos hitos repiten cosmético y mintean otra
  copia. Coste ~0.156 NEAR por completionista.
- Capacidad teórica: **~19 completionistas completos** o **~100 jugadores
  parciales**. Es una demo de testnet; el README lo explica.
- Tope diario: **60 mints** para que un pico no agote el presupuesto en una
  hora.
- Al agotarse: `503 REWARD_CAPACITY`, claim `pending`, UI «Reward capacity
  reached». Reponer el relayer desde el faucet y reintentar.
- Producción (fuera de alcance): lazy mint o editions; los topes actuales no
  escalan a 10 000 jugadores (ver `SPEC-038` §1).

### 11.5 Modelo de confianza

| Nivel | Qué cubre                                | Quién lo escribe            | Recompensa máxima       |
| ----- | ---------------------------------------- | --------------------------- | ----------------------- |
| A     | Minijuegos, carreras, cripta             | Motores del servidor        | Cosméticos (skins, armas, assets, vehículos) |
| O     | Posesión de NFTs-llave                   | RPC on-chain en el reclamo  | Gate, no genera progreso |
| C     | Gatos, encargos, exploración             | Cliente autenticado         | Sellos y cosméticos de exploración |

Regla: **un NFT grande solo se paga con datos A**. Las misiones C nunca dan un
cosmético de pista ni un equipable caro. Así, aunque un cliente mienta con los
gatos, no puede fabricar el cosmético de Skyfall.

### 11.6 Estados de una misión

- `locked`: no cumple `unlock`; el HUD muestra el primer motivo.
- `available`: cumple `unlock` y aún no tiene progreso.
- `active`: solo encargos aceptados; tiene `acceptedAt` y marcadores.
- `completed`: objetivo alcanzado; si hay recompensa, espera `Claim`.
- `claimed`: recompensa minteada (o `already-owned`); no vuelve a dar NFT.

Una misión sin recompensa pasa directamente de `completed` a `claimed`
internamente para que el contador no la repita, pero la UI la muestra
`Completed`.

### 11.7 Evaluación y gating

```
locked = !unlockOk(player, mission)
          || (mission.unlock.nft && !ownsAll(player.accountId, mission.unlock.nft))
value   = attested ? stats.attested[metric] : stats.reported[metric]
completed = value >= target || collectedIds ⊇ objectiveIds
claimable = completed && reward != null && accountId != '' && !claim.exists
```

- El servidor evalúa `unlock` con las misiones completadas en Mongo y la
  posesión on-chain; no usa el `status` que manda el cliente.
- `ownsAll` pagina `mt_tokens_for_owner` con `from_index: null` y límite 100;
  se cachea 30 s por cuenta y catálogo.
- Si el RPC falla, el estado es `locked` con `ownershipUnverified` y el reclamo
  responde `503`; nunca se asume que el jugador posee el NFT.

### 11.8 Idempotencia y concurrencia

- `RewardClaim` tiene índice único `(playerId, missionId)` y `requestId` único.
- La secuencia es:
  1. `findOneAndUpdate({ playerId, missionId }, { $setOnInsert: {...status:
     'pending', requestId} }, { upsert: true, returnDocument: 'after' })`.
  2. Si el claim ya está `minted`/`already-owned`, se devuelve tal cual.
  3. Si está `pending`/`failed` y el lock `mintingUntil` está libre, se marca
     `minting` y se llama al relayer.
  4. Al volver, se guarda `tokenId`, `serial`, `txHash` y `minted`.
- Un segundo proceso que llega mientras `minting` está activo espera y relee
  (200 ms, máximo 10 s); si sigue `minting`, devuelve `202` con el claim.
- `MissionAttestation` se inserta antes de incrementar; si el insert choca por
  el índice único, no se incrementa.

### 11.9 Reset y anti-reclamo

- `POST /stats/:playerId/reset` resetea contadores, pero **no** borra
  `MissionProgress`, `RewardClaim` ni `MissionAttestation`.
- «Reset errands» de `SPEC-035` solo devuelve encargos no completados a
  `available`; los completados y reclamados se conservan. Si se quiere
  reiniciar la partida completa, es un borrado de cuenta explícito fuera de
  este spec.
- Un jugador que borra `localStorage` recupera su progreso de Mongo al iniciar
  sesión; no puede volver a reclamar porque el claim es único por cuenta.

### 11.10 Migración desde `SPEC-035`

- El servidor no puede leer `localStorage`; el cliente lee las claves y las
  envía en el primer `POST /progression/:playerId/sync` como
  `legacyCompleted`. Si el `playerId` ya tiene `migratedFromLocalAt`, el
  servidor ignora el campo.
  - `rw:npc-missions:v1`: por cada misión con `status = completed`, se marca
    `completed` y se copian `collectedIds`.
  - `rw:missions:v1`: `cats-25` completada → `cats-25`; `race-5-laps` →
    `gp-first`/`gp-wins-3` si aplica; `barn-8-waves` → `barn-first`;
    `royale-first-win` → `royale-first`; `hexfire-first-win` →
    `hexfire-first`; `parkour-summit` → `parkour-first`.
- El servidor solo acepta la allowlist `barn-first`, `royale-first`,
  `gp-first`, `hexfire-first`, `parkour-first`, `crypt-first`, `cats-first` y
  `cats-25`; el resto se descarta.
- La migración es best-effort y se marca aunque falte una clave. No crea
  reclamos automáticos: el jugador debe pulsar `Claim`.

## 12. Progreso

| Fecha      | Estado      | Nota                                                                                          |
| ---------- | ----------- | --------------------------------------------------------------------------------------------- |
| 2026-11-14 | borrador    | Spec creado: catálogo de progresión, atestación, gating NFT y reclamo patrocinado.            |
| 2026-11-14 | implementado | Catálogo 42 misiones / 26 recompensas, stats v2, atestación en 6 motores, API `/progression` y `/rewards`, gating NFT fail-closed, migración legacy y UI Central completados. |
| 2026-11-14 | implementado | Verificación local: 57 tests backend, `check` sin errores, `build`, `npcs:check`; pendiente `rewards:sync` y pruebas manuales en testnet. |
| 2026-11-14 | verificado   | 61 tests backend (concurrencia, JWT/cuenta, body ignorado y reset), `lint`, `check`, `build`, `tsc` y `npcs:check` en verde. CA-9, CA-12, CA-13, CA-17, CA-21 y CA-22 cerrados. |
| 2026-11-14 | verificado   | Diseño final con 20 cosméticos existentes (sin medallas/trofeos). `rewards:sync` no-op y `get_catalog_supplies` 20/20 con topes 50/5 y 25/3; CA-24 y pasos 20–22 cerrados. |

## 13. Changelog

- 2026-11-14 — Creación del spec. Define la Central de misiones, 7 pistas, 5
  tramos, recompensas NFT, gates por posesión, atestación desde los motores,
  API `/progression`, reclamo idempotente y presupuesto de testnet.
- 2026-11-14 — Implementación completa: `StatsData` v2 con `attested`, sesión
  verificada en `join`, catálogo idéntico en frontend/backend con test de
  paridad (fingerprint `81192151`), persistencia Mongo (`MissionProgress`,
  `RewardClaim`, `MissionAttestation`), atestación en Barn, Royale, GP,
  Hexfire, Parkour y Cripta, reclamo patrocinado idempotente con presupuesto
  separado, UI Central con `Errands`/`Challenges`/`Rewards`, caché offline,
  avisos y migración única desde `rw:missions:v1`.
- 2026-11-14 — Correcciones semánticas: `royale-kills-200` exige 200 kills
  **y** 5 victorias; `tier-legend` cuenta solo las 6 pistas de minijuego (no
  `explorer`). Añadidos `also` y `tracks` al catálogo y tests dedicados.
- 2026-11-14 — Endurecimiento: el snapshot GET falla cerrado
  (`ownershipUnverified`, misiones NFT bloqueadas) si el RPC no verifica; el
  claim mantiene `503`. La migración legacy usa allowlist y
  `migratedFromLocalAt`, con test de una sola ejecución.
- 2026-11-14 — Documentada la capacidad de mints de recompensa
  (`REWARD_MINT_BUDGET_NEAR=3`, `REWARD_DAILY_MINT_LIMIT=60`, ~500 mints) en
  `backend/README.md`.
- 2026-11-14 — Catálogo de recompensas alineado con la implementación: 20
  cosméticos existentes (11 skins, 2 assets, 5 armas y 2 vehículos), sin
  medallas/trofeos ni catálogos nuevos. Corregido `isRewardCatalog` para que
  `rewardMint` acepte los cosméticos y `sponsor-mint` siga permitiéndolos.
  Verificado on-chain: 20/20 con topes 50/5 y 25/3; `rewards:sync` no-op.
  Fingerprint actual del catálogo: `d4669fb7`.
- 2026-11-14 — Formateados con Prettier los 5 archivos que mantenían `lint`
  en rojo; `bun run lint` pasa. CA-21 cerrado.
- 2026-11-14 — Añadidos tests de concurrencia de reclamos (CA-9), JWT/cuenta
  ajena (CA-12), body con contadores falsos (CA-13) y reset que conserva
  `MissionProgress`/`RewardClaim` (CA-17). Total: 61 tests.
