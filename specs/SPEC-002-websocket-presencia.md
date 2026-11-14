---
id: SPEC-002
titulo: "Servidor WebSocket con lobby global y 3 mini lobbies"
estado: completado
prioridad: alta
creado: 2026-10-30
actualizado: 2026-10-30
responsable: opencode
etiquetas: [backend, frontend, websocket, elysia, presencia, lobbies, minijuegos]
depende_de: []
bloquea: []
estimacion: "4h"
---

# SPEC-002 — Servidor WebSocket con lobby global y 3 mini lobbies

## 1. Contexto

El backend (`backend/src/index.ts`) es un servidor Elysia mínimo con una única ruta HTTP `GET /` y se ejecuta con Bun (`bun run dev`, puerto 3000). No existe ningún canal en tiempo real.

El frontend es una app SvelteKit 3 + Svelte 5 que renderiza el juego con Threlte/Rapier en `frontend/src/routes/+page.svelte` → `Canvas.svelte` → `Scene.svelte`. Todavía no hay conexión con el backend ni estado de jugadores remotos.

La carpeta `frontend/src/lib/services/` ya existe (actualmente vacía) y será el punto único donde viva la conexión WebSocket del frontend: protocolo y cliente/servicio de lobby. El estado reactivo se mantiene en `frontend/src/lib/state/` y la UI en `frontend/src/lib/components/ui/`.

Antes de sincronizar posiciones o lógica de juego, hace falta la base de conectividad. Se ha decidido que exista un **lobby global** de presencia para todos los conectados y **3 mini lobbies** destinados a futuros minijuegos, de forma que cada jugador pueda estar en el global y, opcionalmente, dentro de uno de los tres minijuegos.

## 2. Objetivo

Exponer un endpoint WebSocket `/ws` en el backend Elysia que gestione un lobby global de presencia y 3 mini lobbies en memoria, y añadir un overlay en el frontend que conecte automáticamente, muestre quién está conectado en global, y permita entrar, cambiar o salir de los mini lobbies en tiempo real.

## 3. Alcance

**Incluye**

- Endpoint WebSocket `ws://localhost:3000/ws` con Elysia (WebSocket nativo de Bun).
- Protocolo JSON con mensajes `join`, `enter-lobby`, `leave-lobby`, `ping`, `welcome`, `presence`, `pong` y `error`.
- Lobby global de presencia: todo cliente unido aparece en él.
- 3 mini lobbies con IDs estables: `minigame-1`, `minigame-2`, `minigame-3`.
- Un jugador puede estar en el lobby global y en **un solo** mini lobby a la vez; puede cambiar directamente entre mini lobbies.
- Snapshots de presencia con el total global y el desglose de cada mini lobby.
- Topics de Bun/Elysia (`lobby:global`, `lobby:minigame-1`, etc.) preparados para aislar eventos futuros de cada minijuego.
- Logs en consola del backend al conectar, entrar/salir de un mini lobby y desconectarse.
- Cliente WebSocket en el frontend con conexión automática al montar, desconexión al desmontar y manejo de estados.
- Overlay con estado de conexión, contador global, lista de conectados y tarjetas/botones de los 3 mini lobbies.
- Alias editable por el jugador, persistido en `localStorage`.
- URL del WebSocket configurable con `VITE_WS_URL` (por defecto `ws://localhost:3000/ws`).

**No incluye**

- Lógica, reglas, puntuación, temporizadores o estado interno de los minijuegos.
- Matchmaking, colas, capacidad máxima, expulsión o asignación automática de mini lobby.
- Autenticación, sesiones, JWT ni verificación de identidad real.
- Persistencia en base de datos: la presencia vive solo en memoria del proceso.
- Salas creadas dinámicamente por el usuario (los 3 mini lobbies son fijos).
- Sincronización de posición, movimiento o acciones de juego.
- Reconexión automática con backoff (en esta iteración la reconexión es manual desde la UI).
- Heartbeat propio a nivel de aplicación (se usa el ping/pong nativo y un `ping` JSON de diagnóstico).
- Tests automatizados y despliegue con proxy inverso.

## 4. Requisitos

### Funcionales

| ID    | Requisito                                                                                                                                          | Prioridad |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| RF-1  | El backend expone un WebSocket en `/ws` usando Elysia y Bun, sin dependencias nuevas.                                                              | alta      |
| RF-2  | Al abrir el socket, el servidor asigna un `id` único y espera un mensaje `join` para registrar al jugador en el lobby global.                       | alta      |
| RF-3  | `join` acepta un `name` opcional: se recorta, colapsa espacios y limita a 24 caracteres; vacío usa alias por defecto.                               | alta      |
| RF-4  | Tras `join`, el jugador recibe `welcome` con su perfil y el snapshot de presencia; el resto recibe `presence` actualizado.                          | alta      |
| RF-5  | Existen exactamente 3 mini lobbies fijos (`minigame-1`, `minigame-2`, `minigame-3`) con nombre visible editable por configuración.                  | alta      |
| RF-6  | `enter-lobby` mueve al jugador a un mini lobby válido; solo puede estar en uno a la vez y el global sigue mostrándolo.                             | alta      |
| RF-7  | `leave-lobby` devuelve al jugador al lobby global sin desconectarlo.                                                                                | alta      |
| RF-8  | Cambiar de `minigame-1` a `minigame-2` actualiza ambos mini lobbies y el badge del jugador en el global.                                           | alta      |
| RF-9  | El snapshot incluye `total`, la lista global de todos los jugadores y la lista de jugadores de cada mini lobby.                                     | alta      |
| RF-10 | Al cerrar el socket se elimina al jugador del global y de su mini lobby, y se difunde el snapshot actualizado.                                      | alta      |
| RF-11 | Los mensajes JSON inválidos, tipos desconocidos o mini lobbies inválidos responden con `error` sin cerrar la conexión.                              | media     |
| RF-12 | El backend registra en consola id, nombre, lobby actual y total global al unirse, cambiar de lobby y desconectarse.                                 | media     |
| RF-13 | Cada socket se suscribe a `lobby:global` y al topic de su mini lobby actual; al cambiar de mini lobby se desuscribe del anterior.                  | media     |
| RF-14 | El frontend conecta automáticamente al montar el overlay y desconecta el socket al desmontarlo.                                                     | alta      |
| RF-15 | El overlay muestra el estado (`conectando`, `conectado`, `desconectado`, `error`), el contador global y la lista de conectados.                     | alta      |
| RF-16 | El overlay muestra los 3 mini lobbies con su nombre, número de jugadores, lista y acción `Unirse`, `Cambiar` o `Salir` según corresponda.           | alta      |
| RF-17 | El jugador local se distingue en el global y en su mini lobby, y puede cambiar su alias, lo que reconecta el socket con el nuevo nombre.            | media     |
| RF-18 | Un `ping` del cliente recibe `pong` con marca de tiempo del servidor.                                                                              | baja      |

### No funcionales

| ID    | Requisito                                                                 | Criterio                                                                          |
| ----- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| RNF-1 | Sin dependencias nuevas en backend ni frontend.                           | Solo `elysia`, `zod`, Svelte y Tailwind ya instalados                             |
| RNF-2 | Sin errores de TypeScript en el backend.                                  | `cd backend && bunx tsc --noEmit` termina con código 0                            |
| RNF-3 | Sin errores de tipos ni formato en los archivos del frontend tocados.     | `bun run check` y Prettier acotado pasan                                          |
| RNF-4 | Sin fugas de sockets durante HMR/navegación.                              | `connect()` es idempotente; `onDestroy` cierra el socket y limpia timers           |
| RNF-5 | La UI no bloquea el juego.                                                | Overlay en `position: fixed`, paneles con `pointer-events-auto` y canvas intacto    |
| RNF-6 | El snapshot de presencia es consistente entre clientes.                   | Cada cambio difunde el snapshot completo; las listas se derivan del mismo estado   |
| RNF-7 | El modelo admite añadir lógica de minijuego sin cambiar la presencia.     | Topics por lobby y `lobbyId` estable en cada jugador                               |

## 5. Criterios de aceptación

- [x] CA-1: `bun run dev` en `backend/` arranca y acepta conexiones en `ws://localhost:3000/ws`.
- [x] CA-2: Un cliente que envía `{"type":"join","name":"Ana"}` recibe `welcome` con `self.name === "Ana"`, `total === 1` y `self.lobbyId === "global"`.
- [x] CA-3: Con dos clientes conectados (`Ana` y `Luis`), ambos reciben `presence.total === 2` y la lista global con los dos.
- [x] CA-4: Si `Ana` envía `{"type":"enter-lobby","lobbyId":"minigame-1"}`, ambos clientes reciben el snapshot con `Ana` en `minigame-1`, el global sigue mostrando a los dos y el contador del minijuego es `1`.
- [x] CA-5: Si `Ana` cambia a `minigame-2`, `minigame-1` queda vacío, `minigame-2` la contiene y su `lobbyId` se actualiza.
- [x] CA-6: Si `Ana` envía `{"type":"leave-lobby"}`, vuelve a `lobbyId === "global"` y los mini lobbies quedan sin ella.
- [x] CA-7: Al cerrar el socket de `Ana`, desaparece del global y del mini lobby donde estuviera, y `presence.total` pasa a `1`.
- [x] CA-8: Enviar `{"type":"enter-lobby","lobbyId":"minigame-9"}` devuelve `error` con código `INVALID_LOBBY` y la conexión sigue abierta.
- [x] CA-9: Enviar texto no JSON devuelve `error` y la conexión sigue abierta; `ping` devuelve `pong`.
- [x] CA-10: El frontend muestra `Conectado`, el total global y la lista con el jugador propio marcado como `(tú)`.
- [x] CA-11: El overlay muestra los 3 mini lobbies y permite entrar, cambiar y salir sin recargar la página.
- [x] CA-12: Al abrir una segunda pestaña con otro alias, ambas listas y contadores se actualizan; al cerrarla, el jugador desaparece.
- [x] CA-13: `cd backend && bunx tsc --noEmit` y `cd frontend && bun run check` terminan sin errores.
- [x] CA-14: Prettier pasa en los archivos nuevos/modificados del frontend.

## 6. Archivos relevantes

| Ruta                                                           | Acción    | Motivo                                                              |
| -------------------------------------------------------------- | --------- | ------------------------------------------------------------------- |
| `backend/src/index.ts`                                         | modificar | Registrar `.ws('/ws', ...)`, logs y arranque existente              |
| `backend/src/ws/protocol.ts`                                   | crear     | Tipos, IDs de lobbies, esquemas Zod, saneado y parseo seguro        |
| `backend/src/ws/presence.ts`                                   | crear     | Registro en memoria, pertenencia a mini lobbies y snapshots         |
| `backend/tsconfig.json`                                        | modificar | `moduleResolution: bundler` para el TypeScript actual               |
| `backend/README.md`                                            | modificar | Documentar endpoint, protocolo y topics                             |
| `frontend/src/lib/services/protocol.ts`                        | crear     | Tipos y type guards del protocolo para el cliente                   |
| `frontend/src/lib/services/lobbySocket.ts`                     | crear     | Cliente WebSocket de bajo nivel con callbacks                       |
| `frontend/src/lib/state/lobby.svelte.ts`                       | crear     | Estado reactivo con runes (estado, self, presence, error)           |
| `frontend/src/lib/components/ui/LobbyOverlay.svelte`           | crear     | UI de conexión, global y mini lobbies                               |
| `frontend/src/routes/+page.svelte`                             | modificar | Montar `LobbyOverlay` junto al `Canvas`                             |
| `frontend/.env.example`                                        | crear     | Documentar `VITE_WS_URL`                                            |

## 7. Plan de implementación

### Fase 1 — Protocolo y presencia en backend

- [x] Paso 1: Crear `backend/src/ws/protocol.ts` con `LobbyId = 'global' | 'minigame-1' | 'minigame-2' | 'minigame-3'`, `Player`, `Lobby`, `PresenceSnapshot`, `ClientMessage` y `ServerMessage`.
- [x] Paso 2: Definir la configuración de lobbies (`LOBBY_DEFINITIONS`) con `id`, `name` y `kind`; nombres visibles `Minijuego 1`, `Minijuego 2`, `Minijuego 3` como placeholders.
- [x] Paso 3: Añadir esquemas Zod para `join`, `enter-lobby`, `leave-lobby` y `ping` (unión discriminada por `type`), y `parseClientMessage(raw: string)` que devuelva un resultado discriminado sin lanzar excepciones.
- [x] Paso 4: Crear `backend/src/ws/presence.ts` con un `Map<string, Player>`; funciones `addPlayer`, `removePlayer`, `updateName`, `getPlayer`, `setLobby`, `listGlobal`, `listLobby` y `buildSnapshot`; `sanitizeName` vive en `protocol.ts` (trim, colapso de espacios, máximo 24, alias por defecto `Jugador-<4 chars del id>`).
- [x] Paso 5: `buildSnapshot()` devuelve `{ total, lobbies }` con el global conteniendo a todos los jugadores y cada mini lobby solo a sus integrantes, ordenados por `connectedAt` ascendente, sin exponer el `Map` interno.

### Fase 2 — Endpoint WebSocket

- [x] Paso 6: En `backend/src/index.ts`, añadir `.ws('/ws', { open, message, close })` manteniendo `GET /`.
- [x] Paso 7: En `open`, suscribir el socket a `lobby:global`, guardar el `id` de Elysia y programar un cierre con código `4001` si no llega `join` en 10 segundos (limpiar el timer al unirse o cerrar).
- [x] Paso 8: En `message`, si el jugador no se ha unido solo se acepta `join`; si ya se unió, `join` responde `error` con código `ALREADY_JOINED`.
- [x] Paso 9: Al unirse, registrar al jugador con `lobbyId: 'global'`, enviar `welcome` solo a ese socket y difundir `presence` a todo el topic `lobby:global`.
- [x] Paso 10: Implementar `enter-lobby`: validar que el ID sea uno de los 3 mini lobbies (`INVALID_LOBBY` si no), desuscribir del topic del mini lobby anterior, suscribir al nuevo, actualizar `lobbyId` y difundir `presence` global.
- [x] Paso 11: Implementar `leave-lobby`: desuscribir del mini lobby actual, poner `lobbyId: 'global'` y difundir `presence`; si ya estaba en global, responder `error` con `NOT_IN_LOBBY`.
- [x] Paso 12: En `close`, eliminar al jugador si existía, limpiar el timer y difundir `presence`; registrar en consola `[ws] - id name lobby=<lobbyId> (n online)`.
- [x] Paso 13: Manejar `ping` con `pong` (`{ type: 'pong', at: Date.now() }`) y responder `error` (`INVALID_JSON`, `INVALID_MESSAGE`, `UNKNOWN_TYPE`, `INVALID_LOBBY`, `NOT_IN_LOBBY`, `ALREADY_JOINED`) sin cerrar el socket.
- [x] Paso 14: Verificar el endpoint con dos clientes WebSocket simultáneos, incluyendo entrar, cambiar y salir de mini lobbies, antes de tocar el frontend.

### Fase 3 — Cliente WebSocket y estado

- [x] Paso 15: Crear `frontend/src/lib/services/protocol.ts` duplicando el contrato de mensajes y añadiendo `isServerMessage` (el frontend no depende de Zod).
- [x] Paso 16: Crear `frontend/src/lib/services/lobbySocket.ts` con una clase `LobbySocket` que reciba URL y callbacks (`onStatus`, `onWelcome`, `onPresence`, `onError`, `onPong`), exponga `connect`, `disconnect`, `sendJoin`, `enterLobby`, `leaveLobby`, `ping` y sea idempotente.
- [x] Paso 17: En `connect`, crear el `WebSocket`, enviar `{ type: 'join', name }` en `onopen`, parsear mensajes con `isServerMessage` y cerrar el socket previo si ya había uno.
- [x] Paso 18: Crear `frontend/src/lib/state/lobby.svelte.ts` con una clase que use `$state` para `status`, `self`, `presence`, `error` y `currentLobbyId` (derivado de `self.lobbyId`), y métodos `connect(alias?)`, `disconnect()`, `setAlias(alias)`, `enterLobby(id)`, `leaveLobby()`.
- [x] Paso 19: La UI deriva `globalLobby` y `minigameLobbies` del snapshot para no mantener listas paralelas. Persistir el alias en `localStorage` bajo `lobby:name`.
- [x] Paso 20: Resolver la URL con `import.meta.env.VITE_WS_URL ?? 'ws://localhost:3000/ws'`; crear `frontend/.env.example` con esa variable documentada.

### Fase 4 — Overlay y montaje

- [x] Paso 21: Crear `frontend/src/lib/components/ui/LobbyOverlay.svelte` con panel fijo (top-right), indicador de estado por color, contador global, input de alias con submit y lista de conectados; marcar el propio como `(tú)` y mostrar el badge del mini lobby actual.
- [x] Paso 22: Añadir una sección con las 3 tarjetas de mini lobby: nombre, contador, lista de jugadores y botón contextual (`Unirse`, `Cambiar` si es otro, `Salir` si es el actual).
- [x] Paso 23: En el componente, conectar en `onMount` si el estado es `idle`, generar alias `Jugador-XXXX` si no hay uno guardado, y desconectar en `onDestroy`.
- [x] Paso 24: Mostrar errores del servidor o de red en el panel sin romper la UI; permitir reintentar con el botón `Conectar`.
- [x] Paso 25: Modificar `frontend/src/routes/+page.svelte` para renderizar `<LobbyOverlay />` junto a `<Canvas />`.
- [x] Paso 26: Actualizar `backend/README.md` con endpoint, tabla de mensajes, topics y ejemplo de prueba.

### Fase 5 — Verificación y cierre

- [x] Paso 27: Ejecutar la verificación de la sección 8 y corregir errores.
- [x] Paso 28: Probar los casos manuales con dos clientes (navegador headless + cliente Bun) y los 3 mini lobbies.
- [x] Paso 29: Actualizar `estado`, `actualizado`, checkboxes, "Progreso" y "Changelog" de este spec.

### Contrato de mensajes

```ts
type LobbyId = 'global' | 'minigame-1' | 'minigame-2' | 'minigame-3';
type MinigameLobbyId = Exclude<LobbyId, 'global'>;

type Player = {
  id: string;
  name: string;
  connectedAt: number;
  lobbyId: LobbyId; // 'global' si no está en ningún minijuego
};

type Lobby = {
  id: LobbyId;
  name: string;
  kind: 'global' | 'minigame';
  players: Player[];
};

type PresenceSnapshot = {
  total: number; // jugadores en el lobby global
  lobbies: Lobby[]; // global + 3 minijuegos
};

// Cliente → servidor
type ClientMessage =
  | { type: 'join'; name?: string }
  | { type: 'enter-lobby'; lobbyId: MinigameLobbyId }
  | { type: 'leave-lobby' }
  | { type: 'ping' };

// Servidor → cliente
type ServerMessage =
  | { type: 'welcome'; self: Player; presence: PresenceSnapshot }
  | { type: 'presence'; presence: PresenceSnapshot }
  | { type: 'pong'; at: number }
  | { type: 'error'; code: string; message: string };
```

Topics:

| Topic               | Suscrito cuando                         | Uso                                         |
| ------------------- | --------------------------------------- | ------------------------------------------- |
| `lobby:global`      | Siempre, desde `open`                   | Presencia global                            |
| `lobby:minigame-1`  | El jugador está en `minigame-1`         | Futuros eventos del minijuego 1             |
| `lobby:minigame-2`  | El jugador está en `minigame-2`         | Futuros eventos del minijuego 2             |
| `lobby:minigame-3`  | El jugador está en `minigame-3`         | Futuros eventos del minijuego 3             |

## 8. Verificación

```bash
# Backend: tipos y arranque
cd backend && bunx tsc --noEmit
cd backend && bun run dev

# Frontend: tipos, formato acotado y build
cd frontend && bun run check
cd frontend && bunx prettier --check \
  src/lib/services \
  src/lib/state/lobby.svelte.ts \
  src/lib/components/ui/LobbyOverlay.svelte \
  src/routes/+page.svelte
cd frontend && bun run build
```

Prueba de dos clientes (con el backend levantado, en otra terminal):

```bash
cd backend && bun -e '
const url = "ws://localhost:3000/ws";
const send = (ws, msg) => ws.send(JSON.stringify(msg));
const a = new WebSocket(url);
const b = new WebSocket(url);
a.onopen = () => send(a, { type: "join", name: "Ana" });
b.onopen = () => send(b, { type: "join", name: "Luis" });
a.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  console.log("Ana", msg.type, msg.presence?.total ?? "");
  if (msg.type === "welcome") send(a, { type: "enter-lobby", lobbyId: "minigame-1" });
};
b.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  console.log("Luis", msg.type, msg.presence?.lobbies?.map((l) => `${l.id}:${l.players.length}`).join(" "));
};
setTimeout(() => { a.close(); b.close(); process.exit(0); }, 3000);
'
```

Casos manuales:

1. Levantar backend y frontend; abrir `http://localhost:5173`. El overlay debe pasar a `Conectado` y listar el alias propio con `(tú)`.
2. Abrir una segunda pestaña con otro alias; ambas listas muestran dos jugadores y el contador global es `2`.
3. Entrar en el minijuego 1 con una pestaña; ambas pestañas ven al jugador en ese mini lobby, el global sigue mostrando a los dos y los otros dos mini lobbies están vacíos.
4. Cambiar del minijuego 1 al 2; el jugador desaparece del 1 y aparece en el 2 en ambas pestañas.
5. Pulsar `Salir`; el jugador vuelve a `global` y los mini lobbies quedan vacíos.
6. Cerrar una pestaña; el jugador desaparece del global y de su mini lobby, y el total baja a `1`.
7. Cambiar el alias en una pestaña; el socket se reconecta, vuelve a `global` y la otra lista muestra el nuevo nombre.
8. Detener el backend; el overlay pasa a `Desconectado`/`Error` y el botón `Conectar` permite reintentar al levantarlo de nuevo.
9. Navegar fuera de la página o recargar; no deben quedar sockets duplicados ni errores de `WebSocket is already closed`.

## 9. Riesgos y mitigaciones

| Riesgo                                                              | Impacto | Mitigación                                                                 |
| ------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------- |
| URL del WS distinta en producción/red local                          | alto    | `VITE_WS_URL` configurable y valor por defecto documentado                  |
| HMR o doble montaje deja sockets huérfanos                           | medio   | `connect()` cierra el socket previo; `onDestroy` siempre desconecta         |
| Suscripciones a topics duplicadas al cambiar de mini lobby           | medio   | Desuscribir el topic anterior antes de suscribir el nuevo                    |
| El jugador cree que sale del global al entrar en un minijuego        | bajo    | Etiquetar claramente `Global` como presencia permanente y mostrar el badge  |
| Nombres duplicados o maliciosos                                      | bajo    | Identidad por `id`; saneado y límite de 24 caracteres                       |
| Presencia en memoria se pierde al reiniciar o escalar el backend     | bajo    | Aceptado en esta fase; persistencia y pub/sub quedan para más adelante       |
| Proxy inverso sin soporte de upgrade WebSocket                      | medio   | Documentar que el proxy debe permitir `Upgrade` en `/ws`                    |
| Los 3 mini lobbies se quedan sin capacidad o reglas                  | bajo    | Fijar capacidad y reglas en el spec del minijuego correspondiente            |

## 10. Preguntas abiertas

- [ ] ¿Los 3 mini lobbies tienen nombres definitivos o se dejan `Minijuego 1/2/3` como placeholders?
- [ ] ¿Deben tener capacidad máxima? (propuesta: sin límite en esta fase)
- [ ] ¿El jugador puede cambiar libremente de mini lobby o hará falta una acción de `start`/`ready` del futuro minijuego?
- [ ] ¿El alias debe ser obligatorio y único, o se mantiene libre con identidad por `id`? (propuesta: libre)
- [ ] ¿Se añade reconexión automática con backoff en la siguiente iteración?
- [ ] ¿Se necesita mostrar un aviso temporal tipo "X se conectó" o "X entró al minijuego 1" además de la lista?
- [ ] ¿La presencia debe persistir entre reinicios del backend?
- [ ] ¿Habrá que autenticar la conexión (JWT ya instalado en backend) antes de producción?

## 11. Decisiones y notas

- El protocolo y el cliente WebSocket del frontend viven en `frontend/src/lib/services/`; el estado reactivo en `state/lobby.svelte.ts` y la UI en `components/ui/LobbyOverlay.svelte`.
- Se usa el soporte WebSocket nativo de Elysia (`app.ws('/ws', { open, message, close })`), disponible en la versión instalada; no se añade `@elysiajs/websocket`.
- La identidad la asigna el servidor con el `id` de Elysia/Bun; el cliente nunca elige su `id`.
- El lobby global contiene a **todos** los conectados; un mini lobby contiene solo a quienes están dentro de él. Un jugador nunca deja de estar en el global por entrar en un minijuego.
- Solo se puede pertenecer a un mini lobby a la vez; `enter-lobby` actúa como cambio directo si ya estaba en otro.
- El servidor difunde siempre el snapshot completo de presencia en `lobby:global` en lugar de eventos delta; para este tamaño es más simple y evita desincronizaciones.
- Los 3 IDs (`minigame-1`, `minigame-2`, `minigame-3`) son estables y no dependen del nombre visible, para que la futura lógica de cada minijuego no se rompa al renombrarlos.
- Los topics por mini lobby quedan preparados para publicar eventos de juego aislados en siguientes specs.
- Los frames son texto JSON; no se usa binario en esta fase.
- El estado del backend es un `Map` en memoria y se reinicia con el proceso.
- El alias del cliente se guarda en `localStorage` (`lobby:name`) para conservarlo entre recargas.
- El overlay se monta fuera del canvas de Threlte para no interferir con pointer lock ni con el render 3D.
- La verificación de frontend usa Prettier acotado porque el lint global tiene avisos preexistentes ajenos a este spec.

## 12. Progreso

| Fecha      | Estado      | Nota                                                                 |
| ---------- | ----------- | -------------------------------------------------------------------- |
| 2026-10-30 | borrador    | Spec creado                                                          |
| 2026-10-30 | borrador    | Añadido lobby global + 3 mini lobbies                                |
| 2026-10-30 | borrador    | Conexión frontend movida a `lib/services`                            |
| 2026-10-30 | completado  | Backend WS, cliente Svelte, overlay y verificación E2E completados    |

## 13. Changelog

- 2026-10-30 — Creación del spec.
- 2026-10-30 — Ampliación a lobby global + 3 mini lobbies para minijuegos.
- 2026-10-30 — Conexión WebSocket del frontend ubicada en `frontend/src/lib/services/`.
- 2026-10-30 — Implementación backend (`/ws`, presencia, 3 mini lobbies) y frontend (servicio, estado y overlay).
- 2026-10-30 — Verificación: `tsc`, `svelte-check`, Prettier, build, smoke WS de dos clientes y E2E headless de la UI.
- 2026-11-11 — La presencia incluye `LobbyStatus` (fase, `canEnter`, motivo y aforo) para todos los mini lobbies; se reemite al cambiar de fase y `enter-lobby` aplica la admisión antes de mover al jugador.
