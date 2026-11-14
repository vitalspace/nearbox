---
id: SPEC-020
titulo: "Migración al Multiplayer API de RUN: depuración de rooms, coches y presencia"
estado: en-progreso
prioridad: crítica
creado: 2026-11-02
actualizado: 2026-11-02
responsable: opencode
etiquetas: [backend, frontend, multiplayer, rooms, rundot, deploy, debug, presencia, coches]
depende_de: [SPEC-002, SPEC-003, SPEC-004, SPEC-014, SPEC-017]
bloquea: []
estimacion: "TBD"
---

# SPEC-020 — Migración al Multiplayer API de RUN: depuración de rooms, coches y presencia

> **Actualización 2026-11-10 — vuelta al backend Bun.** El multijugador activo
> vuelve a ser `backend/` (Elysia + Bun, `ws://…/ws`) y el cliente
> (`frontend/src/lib/services/lobbySocket.ts`) usa WebSocket nativa vía
> `VITE_WS_URL`. La lógica de todos los minijuegos se portó desde
> `frontend/src/server/engines/` a `backend/src/server/engines/`, y el host Bun
> implementa presencia, chat, rollos, coches, carrera (`minigame-3` y
> `minigame-4`), cripta, Barn Siege, Deathmatch y Parkour. El port de rooms se
> conserva como referencia/verificación, pero el build por defecto ya no incluye
> `server-bundle.js` ni `rooms.config.json`; para generarlos hay que compilar con
> `RUN_ROOMS=1`. Ver `backend/README.md`.

## 1. Contexto

El backend original vive en `backend/` (Elysia + Bun, `ws://…/ws`) y sigue intacto.
El juego corre dentro de un iframe de RUN.world, que **no puede abrir WebSockets a
un host externo**, así que el multijugador se portó al **Multiplayer API (BETA)**
del SDK: el mismo código de juego ahora vive en `frontend/src/server/` y se ejecuta
como rooms del platform. El detalle del port está en
`frontend/src/server/README.md`.

Piezas del montaje actual:

- `frontend/src/server/rooms/{LobbyRoom,CryptRoom,RaceRoom}.ts` — rooms registradas
  en `frontend/rundot/rooms.config.json` (`lobby` singleton 32, `crypt` 8, `race` 6).
- `frontend/src/lib/services/lobbySocket.ts` — cliente; ya no abre `ws://`, usa
  `RundotGameAPI.realtime.joinOrCreateRoom('lobby' | 'crypt' | 'race')`.
- `frontend/vite.config.ts` — `rundotMultiplayerPlugin()` compila las rooms a
  `dist/server-bundle.js` y copia `dist/rooms.config.json` en `closeBundle`.
- `frontend/scripts/postbuild-relative-paths.mjs` — copia `.build/static` a `dist`
  sin borrar esos dos artefactos.
- `rundot deploy` sube **juego + server config** en una sola operación. Con
  `--public` la versión entra a revisión y, al aprobarse, se convierte en la
  release `Public` (tag público).
- Releases observadas hoy: `Private`, `Review` y `Public`. Solo `Public` es lo que
  ve un jugador que entra por el link sin `?tag=`.

### Síntomas reportados

1. Las modificaciones nuevas del frontend no aparecían en la vista pública.
2. En el lobby no aparecían los **tres coches**.
3. No aparecían los **demás jugadores** al conectarse.
4. Los mensajes de **chat** no se comunicaban.
5. La consola del juego (build 1.2.0, chunk `BH3oGrI5.js`) mostraba en bucle:

   ```
   [WsMultiplayerApi] room:error code=DUPLICATE_SESSION
     message=Duplicate session for player knCcdeHJ1fe7fJUa9qnh4j5OlYI2:
     this identity is already in the room
   [WsMultiplayerApi] room:error code=UNAUTHORIZED message=Join timed out
   ```

## 2. Objetivo

Dejar el multijugador del build público funcionando de punta a punta (presencia,
coches, chat y snapshots de crypt/race) y documentar el proceso de depuración para
que cualquier agente futuro pueda continuar sin reconstruir el contexto.

## 3. Alcance

**Incluye**

- Diagnóstico de la migración Elysia → rooms de RUN.
- Corrección de los bugs de transporte y ciclo de vida de las rooms.
- Verificación con logs reales de `rundot rooms`.
- Deploy público y comprobación de que la versión servida es la corregida.
- Este spec como memoria del estado, hallazgos, comandos y pendientes.

**No incluye**

- Reimplementar el backend Elysia (`backend/`).
- Cambiar el diseño de juego, mapas, físicas o UI.
- Persistencia de estado de salas más allá de lo que haga el platform.

## 4. Requisitos

### Funcionales

| ID   | Requisito | Prioridad |
| ---- | --------- | --------- |
| RF-1 | Al entrar al lobby, el cliente debe recibir `hello` y el snapshot inicial con los 3 coches (`car-calabaza`, `car-momia`, `car-halloween`). | crítica |
| RF-2 | La presencia debe actualizarse cuando otro jugador entra, se mueve o sale. | crítica |
| RF-3 | Los avatares remotos deben renderizarse cuando el otro jugador reporta `player-position`. | crítica |
| RF-4 | El chat de plataforma y los comandos `/me` + historial (`emote-history`) deben llegar al cliente. | alta |
| RF-5 | Las rooms `crypt` y `race` deben entregar su snapshot inicial y errores por `sendTo`. | alta |
| RF-6 | Una room restaurada por el platform (`onRestore`) debe quedar inicializada igual que una recién creada. | crítica |
| RF-7 | El build público (`tags.public`) debe apuntar a la versión con las correcciones y al server config correcto. | crítica |

### No funcionales

| ID    | Requisito | Criterio |
| ----- | --------- | -------- |
| RNF-1 | Sin errores `TypeError` en `rundot rooms logs` al hacer join. | 0 líneas `Error handling 'player:join'` |
| RNF-2 | Sin bucles de `DUPLICATE_SESSION` / `UNAUTHORIZED` en consola del cliente. | 1 solo join por sesión |
| RNF-3 | El build no debe perder `dist/server-bundle.js` ni `dist/rooms.config.json`. | postbuild falla si faltan |
| RNF-4 | El server bundle debe seguir por debajo de 5 MB. | ~54 KB medidos (1.5.0) |

## 5. Criterios de aceptación

- [x] CA-1: `rundot rooms list` muestra una room `lobby` con bundle igual al de `tags.public` → `MV83AE`, bundle 1.4.0, público 1.4.0.
- [x] CA-2: `rundot rooms logs --since 10m` no muestra `Error handling 'player:join'` para la room 1.4.0 → 0 errores tras 19:10:17.
- [ ] CA-3: Al entrar dos cuentas distintas, ambas aparecen en el lobby y ven los 3 coches.
- [ ] CA-4: Al moverse, el avatar remoto aparece en la posición correcta.
- [ ] CA-5: Los mensajes de chat se ven en ambas sesiones.
- [x] CA-6: `tags.public.versionId` coincide con la última versión desplegada con las correcciones → 1.4.0 desde `2026-11-02T19:10:14.615Z`.
- [ ] CA-7: Entrar a la crypt y a la race entrega el snapshot inicial sin recargar.
- [ ] CA-8 (1.5.0): Pulsar `E` junto a un coche entra al coche y muestra el `CarHud`.
- [ ] CA-9 (1.5.0): Pulsar `E` lejos de un coche muestra «Move closer to a car» en vez de no hacer nada.
- [ ] CA-10 (1.5.0): `rundot rooms logs --since 10m` registra `enter-car` con `driverId` igual al jugador cuando el coche se ocupa.

## 6. Archivos relevantes

| Ruta | Acción | Motivo |
| ---- | ------ | ------ |
| `frontend/src/lib/services/lobbySocket.ts` | modificado | `onPrivateMessage`, `onSelfId`, `sync` tras el join |
| `frontend/src/server/rooms/LobbyRoom.ts` | modificado | `initialize()` + `sendWelcome()` + `sync` + log de `enter-car` |
| `frontend/src/server/rooms/CryptRoom.ts` | modificado | `initialize()` idempotente + `onRestore()` |
| `frontend/src/server/rooms/RaceRoom.ts` | modificado | `initialize()` idempotente + `onRestore()` |
| `frontend/src/server/engines/cars.ts` | modificado | Log de rechazos (`car rejected`) |
| `frontend/src/server/validate.ts` | modificado | Mensaje cliente `sync` |
| `frontend/src/lib/state/lobby.svelte.ts` | modificado | `onSelfId`, rebind de senders, errores de coche visibles |
| `frontend/src/lib/state/cars.svelte.ts` | modificado | `entryHint` |
| `frontend/src/lib/state/playerState.ts` | modificado | `facingYaw` (orientación real del avatar) |
| `frontend/src/lib/components/player/PlayerBehaviour.svelte` | modificado | publica `facingYaw` junto a `ref.rotation.y` |
| `frontend/src/lib/components/minigame2/CryptSession.svelte` | modificado | `mg2-position` envía `facingYaw`, no `cameraYaw` |
| `frontend/src/lib/components/cars/CarControls.svelte` | modificado | Hint al pulsar `E` sin coche cerca |
| `frontend/src/lib/components/ui/CarPrompt.svelte` | modificado | Muestra el hint de entrada |
| `frontend/src/server/README.md` | existente | Documentación del port |
| `frontend/rundot/rooms.config.json` | existente | Registro de rooms |
| `frontend/vite.config.ts` | existente | Build del server bundle |
| `frontend/scripts/postbuild-relative-paths.mjs` | existente | Preserva artefactos del server |
| `specs/SPEC-020-...md` | creado | Este documento |

## 7. Hallazgos y correcciones aplicadas

### 7.1 Build público desactualizado (causa inicial)

`rundot game list-releases` mostraba:

| Release | Versión | Server Config |
| ------- | ------- | ------------- |
| Private | 1.2.0 | `hLpAbhD5PvjlGLfpcmm8` |
| Review | 1.2.0 | `hLpAbhD5PvjlGLfpcmm8` |
| **Public** | **1.0.2** | **— (ninguno)** |

La vista pública servía el build viejo, anterior al port de rooms. Sin server
config no hay WebSockets: de ahí que no hubiera coches, presencia ni chat.

`rundot game set-public` envía la última versión a revisión; al aprobarse se
actualiza `Public`. La API pública lo confirmó después:

```
https://api.run.game/v1/games/crway8mkf3QwlWVncbfl
tags.public.versionId = 1.2.0
publicVersionPublishedAt = 2026-11-02T18:50:27.173Z
```

Nota: `rundot game update-release Public` falla con
`You are not authorized to update public tag`; el camino válido es
`deploy --public` / `set-public` + revisión.

### 7.2 `onPrivateMessage` no estaba registrado (causa de coches/chat)

El SDK entrega los mensajes así:

- `this.broadcast(...)` → evento **`onMessage`**.
- `this.sendTo(...)` → evento **`onPrivateMessage`**.

`LobbyRoom.onPlayerJoin` manda con `sendTo`: `hello`, `emote-history`,
`rolls-state` y `cars-state` (snapshot de los 3 coches). `CryptRoom` y
`RaceRoom` también mandan su snapshot y sus errores con `sendTo`.

`lobbySocket.wireLobby` y `wireScene` solo registraban `onMessage`, así que esos
mensajes se descartaban en el cliente. Consecuencias:

- `hello` perdido → `lobby.self` quedaba `null`.
- `cars-state` inicial perdido → no aparecían coches hasta que alguien
  condujera (solo entonces el servidor hacía broadcast).
- `emote-history` y errores perdidos.
- Snapshots de crypt/race perdidos al entrar.

**Corrección:** añadir `onPrivateMessage` en `wireLobby` y `wireScene`, ambos
delegando en `handleMessage`.

### 7.3 Rooms restauradas sin inicializar (causa del join roto)

Evidencia en `rundot rooms logs` al recrear la room tras cerrarla:

```
19:01:53.061  INFO  DUGJQ9  Room started
19:01:53.066  ERROR DUGJQ9  Error handling 'player:join':
  TypeError: Cannot read properties of undefined (reading 'ensure')
19:02:05.319  ERROR DUGJQ9  Error handling 'player:join':
  TypeError: Cannot read properties of undefined (reading 'ensure')
... (cada intento de join durante minutos)
```

El platform puede levantar una room con `handleRestore` (snapshot guardado) en
lugar de `handleCreate`. En ese camino **no se llama `onCreate`**, así que
`this.presence`, `this.cars`, `this.budget`, etc. seguían `undefined`.
`onPlayerJoin` hacía `this.presence.ensure(...)` → `TypeError` → el join falla.
La room quedaba zombi y todos los clientes reintentaban en bucle, generando los
`DUPLICATE_SESSION` / `UNAUTHORIZED: Join timed out` de la consola.

**Corrección:** en las tres rooms, mover el cuerpo de `onCreate` a un
`initialize()` idempotente (flag `ready`) y llamarlo desde `onCreate()` **y**
desde `onRestore()`.

### 7.4 Los avatares remotos dependen de `player-position`

`RemoteHero.svelte` oculta el avatar hasta que existe una posición en
`remotePlayers`. Esa posición solo llega por el broadcast `player-position`, que
emite el jugador que se mueve (10 Hz, `PlayerBehaviour.svelte`). Un jugador
quieto no tiene posición remota conocida. No es un bug, pero explica que un
segundo jugador “aparezca” recién cuando se mueve.

### 7.5 Versiones desplegadas durante la depuración

| Versión | Contenido | Estado |
| ------- | --------- | ------ |
| 1.2.0 | Port inicial | público desde 18:50 UTC; tenía 7.2 y 7.3 |
| 1.3.0 | Fix `onPrivateMessage` | público desde 19:05 UTC; aún tenía 7.3 |
| 1.4.0 | Fix `initialize()` + `onRestore()` | **público desde 19:10:14 UTC**; room `MV83AE` arrancó con `lobby room created`, 2 jugadores y 0 errores de join |
| 1.5.0 | Entrada a coches: `sync`, `onSelfId`, hint y telemetría | privado/review desde 19:36 UTC; público pendiente de review |
| 1.11.2 | Fix rotación remota en la cripta (`facingYaw`) | **público desde 22:55 UTC**; room `UUZXH2` recreada en 1.11.2, 0 errores |

Server config reutilizado en todas: `hLpAbhD5PvjlGLfpcmm8`.

### 7.6 `E` no entraba a los coches (investigación 1.5.0)

Cadena verificada extremo a extremo:

1. `CarControls.onKeyDown` → `toggleCar()` → `cars.updateNearest()` →
   `cars.requestEnter()` → `lobbySocket.sendEnterCar()` → `room.send()`.
2. El servidor recibe `enter-car`, valida `lobbyId === 'global'`, estado del coche
   y distancia (`ENTER_RADIUS = 5`, `ENTER_MAX_DY = 3`).
3. `Cars.onEnter` emite `car-event` (`entered`) y `cars-state` por **broadcast**.

Probado en local con un cliente WebSocket contra el room server (puerto 9001):
`room:joined` → `hello` → `cars-state` → `enter-car` → `car-event` →
`cars-state` con el jugador como `driverId`. El servidor funciona.

Puntos frágiles encontrados en el cliente (todos corregidos en 1.5.0):

- **El cliente dependía del burst de join.** `hello` era la única fuente de
  `selfId`. Si el platform entregaba el burst antes de que el cliente registrara
  `onPrivateMessage`, los coches podían llegar por `cars-state` pero `selfId`
  quedaba `null`; el servidor aceptaba la entrada y el cliente no reconocía el
  `car-event`, así que `E` “no hacía nada”.
  - Ahora `onSelfId` toma `room.playerId` en cuanto existe el handle.
  - Ahora el cliente pide `sync` tras conectar y tras un resume; el servidor
    reenvía `hello`, `emote-history`, `rolls-state` y `cars-state`.
- **Reconexión:** `cars.reset()` borraba `sender`; ahora `bindSenders()` se
  reejecuta al pasar a `connected`.
- **Errores invisibles:** los rechazos del servidor (`CAR_TOO_FAR`,
  `NOT_IN_GLOBAL`, …) viajaban por `sendTo('error')` pero ningún componente los
  mostraba. Ahora se reflejan en `CarPrompt` como hint.
- **E lejos del coche:** antes no pasaba nada. Ahora muestra
  «Move closer to a car and press E again».
- **Telemetría:** cada `enter-car` deja una línea `enter-car { playerId, carId,
  lobbyId, status, driverId }` y cada rechazo `car rejected { playerId, code }`
  en `rundot rooms logs`, para cerrar el diagnóstico con evidencia real.

### 7.7 La rotación del avatar en la cripta enviaba el yaw de la cámara

En `minigame-2` el cliente reporta `mg2-position` desde `CryptSession.svelte`.
Ese componente enviaba `playerState.cameraYaw`, que es el **giro orbital de la
cámara**, no la orientación del modelo. Al caminar con WASD el avatar local rota
hacia la dirección de movimiento (`facing` en `PlayerBehaviour.svelte`), pero
`cameraYaw` no cambia salvo que se mueva la cámara. Resultado: el servidor
guardaba un `yaw` fijo y los demás jugadores veían al avatar siempre mirando en
la misma dirección, aunque se moviera.

**Corrección:**

- `playerState.facingYaw` guarda la orientación real del modelo.
- `PlayerBehaviour.svelte` la actualiza cada frame junto a `ref.rotation.y`.
- `CryptSession.svelte` envía `facingYaw` en `mg2-position`.

El mundo exterior ya era correcto porque `PlayerBehaviour` enviaba `facing`
directamente en `player-position`.

## 8. Plan de continuación

### Fase 1 — Confirmar 1.4.0 en público

- [x] Comprobar `tags.public.versionId` en `api.run.game` → 1.4.0 a las 19:10:14 UTC.
- [x] Confirmar con `rundot rooms list` que la room viva usa bundle 1.4.0 → `MV83AE`.
- [x] Confirmar en `rundot rooms logs` que no hay errores de join en 1.4.0.
- [x] Cerrar rooms huérfanas de bundles viejos (`rundot rooms close --outdated --yes`).
- [ ] Abrir el link público en dos cuentas distintas y validar CA-3..CA-5.

### Fase 2 — Erradicar `DUPLICATE_SESSION`

- [ ] Reproducir con una sola pestaña recargando rápido.
- [ ] Reproducir con dos pestañas de la misma cuenta (comportamiento esperado:
      la segunda debe esperar o relevar a la primera).
- [ ] Revisar `scheduleReconnect` + `openLobby` en `lobbySocket.ts`: hoy el
      backoff empieza en 1 s y el grace de `lobby` es 30 s, así que varios
      intentos caen dentro de la ventana de asiento.
- [ ] Decidir si se espera explícitamente el `reconnectTimeout` ante
      `DUPLICATE_SESSION` o si se deja al SDK.
- [ ] Verificar `UNAUTHORIZED: Join timed out` con logs del room server.

### Fase 3 — Chat y minijuegos

- [ ] Confirmar que el chat plano usa el chat de plataforma
      (`room.sendChat` / `onChat` / `onChatHistory`), no un mensaje propio.
- [ ] Confirmar que `/me` y `/help` llegan como `emote` (broadcast) y
      `emote-history` (sendTo, ya corregido).
- [ ] Entrar a crypt y race y verificar snapshots iniciales.

### Fase 4 — Robustez de despliegue

- [ ] Documentar que `deploy --public` no publica de inmediato: pasa por review.
- [ ] Tras cada deploy de rooms, usar `--close-rooms` para no dejar rooms viejas.
- [ ] Considerar un log explícito en `onRestore` (`room restored`) para detectar
      este camino en producción.

## 9. Verificación

### Comandos

```bash
# Estado de releases y server configs
cd frontend
rundot game list-releases
rundot game list-server-configs

# Versión realmente pública
curl -s https://api.run.game/v1/games/crway8mkf3QwlWVncbfl \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['tags']['public'])"

# Rooms vivas y sus bundles
rundot rooms list

# Errores y ciclo de vida de las rooms
rundot rooms logs --since 30m
rundot rooms logs --since 30m --level warn
rundot rooms logs --since 30m --level error

# Build + deploy
npm run build
npm run check
rundot predeploy
rundot deploy --public --close-rooms
```

### Smoke test del room server local

Con `npm run dev` levantado (Vite en 5173 y room server en 9001), este script
prueba el motor sin abrir el juego. Debe recibir `cars-state` con 3 coches:

```js
const BASE = 'http://localhost:9001';
const profileId = 'dev-test-' + Date.now();

const ticket = await fetch(`${BASE}/tickets`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    gameId: 'dev-game', roomType: 'lobby', action: 'joinOrCreate',
    profileId, username: 'Car Tester', avatarUrl: null
  })
}).then((r) => r.json());

const ws = new WebSocket('ws://localhost:9001/ws');
ws.onopen = () => ws.send(JSON.stringify({
  type: 'auth', protocolVersion: 1, syncplayInputOwnership: 'adopt',
  ticket: ticket.ticket, roomType: 'lobby', action: 'joinOrCreate'
}));
ws.onmessage = (event) => {
  const frame = JSON.parse(event.data);
  if (frame.type === 'room:sendTo' && frame.msgType === 'cars-state') {
    console.log('OK cars:', frame.data.cars.map((c) => c.id));
    ws.close();
    process.exit(0);
  }
};
setTimeout(() => { console.error('timeout'); process.exit(1); }, 8000);
```

Resultado esperado (verificado el 2026-11-02):

```
OK cars: ['car-calabaza', 'car-momia', 'car-halloween']
```

### Casos manuales

1. Entrar con la cuenta A al link público → deben verse los 3 coches.
2. Entrar con la cuenta B → A debe ver a B en presencia; B debe ver a A.
3. Mover a B → el avatar de B aparece en A (posición remota).
4. Escribir en el chat en A → B lo ve.
5. Entrar a la crypt → HUD y calaveras sin recargar.
6. Recargar la pestaña → el join se recupera en menos de 30 s.

## 10. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
| ------ | ------- | ---------- |
| El review público tarda | Los jugadores siguen en la versión rota | Probar con el link `?tag=private` mientras tanto |
| `DUPLICATE_SESSION` por dos pestañas | Un jugador no entra hasta 30 s | Esperar el grace o cerrar la otra pestaña; valorar backoff mínimo de 30 s |
| Rooms restauradas | Estado undefined y joins rotos | `initialize()` desde `onCreate` y `onRestore` |
| `sendTo` ignorado por el cliente | Coches/chat/snapshots ausentes | `onPrivateMessage` registrado (ya aplicado) |
| Cerrar rooms con jugadores | Sesiones cortadas | Avisar; `--close-rooms` solo tras desplegar el fix |
| server config sin cambios | `deploy` reutiliza el anterior | Comparar `dist/server-bundle.js` y mirar el log `No server config changes detected` |

## 11. Preguntas abiertas

- [ ] ¿El `lobby` singleton se persiste por defecto? ¿Por qué el platform eligió
      `handleRestore` al recrearlo tras `--close-rooms`?
- [ ] ¿`UNAUTHORIZED: Join timed out` lo emite el gateway o la room? ¿Se puede
      distinguir de un ticket caducado en los logs?
- [ ] ¿El chat de plataforma funciona dentro del iframe con el sandbox de RUN?
      Confirmar con dos cuentas antes de tocar `engines/chat.ts`.
- [ ] ¿Conviene implementar `onMigrate` además de `onRestore` para cambios de
      bundle con snapshot?
- [ ] ¿Cuánto tarda el review de forma estable? Hoy: 3-4 min.

## 12. Decisiones y notas

- No se tocó `backend/` (Elysia). El port vive solo en `frontend/src/server/`.
- El server bundle se compila con el plugin de Vite; `esbuild` es devDependency
  obligatoria.
- `adapter-static` se apunta a `.build/static` para no borrar
  `dist/server-bundle.js` ni `dist/rooms.config.json`.
- `deploy --public` es el único camino práctico a `Public` desde CLI.
- La corrección de `onRestore` es defensiva: aunque el camino normal sea
  `onCreate`, un room restaurado nunca debe quedar sin motores.

## 13. Progreso

| Fecha | Estado | Nota |
| ----- | ------ | ---- |
| 2026-11-02 | en-progreso | Spec creado tras la sesión de depuración. |
| 2026-11-02 | en-progreso | 1.3.0 desplegado (fix `onPrivateMessage`); público a las 19:05 UTC. |
| 2026-11-02 | en-progreso | 1.4.0 desplegado (fix `onRestore`); pendiente de aprobación pública. |
| 2026-11-02 | en-progreso | 1.4.0 aprobado y público a las 19:10:14 UTC. Room `MV83AE` con 2 jugadores, `lobby room created`, 0 errores de join. Rooms viejas cerradas. |
| 2026-11-02 | en-progreso | Corregida la rotación remota en la cripta: `mg2-position` enviaba `cameraYaw`; ahora envía `playerState.facingYaw`. `bun run check`, Prettier y build en verde. Pendiente desplegar y validar con dos cuentas. |
| 2026-11-02 | en-progreso | v1.11.2 desplegada y pública (~22:55 UTC). Room vieja `A8HWBN` (1.11.1) cerrada; nueva room `UUZXH2` en 1.11.2. Sin errores en `rundot rooms logs`. Pendiente validar la rotación con dos cuentas dentro de la cripta. |

## 14. Changelog

- 2026-11-02 — Creación del spec con el contexto de la migración, los tres
  hallazgos principales, las correcciones aplicadas, el estado de versiones y el
  plan de verificación pendiente.
- 2026-11-02 — Verificación de 1.4.0 en producción: público actualizado, room
  `MV83AE` sana y sin errores de join; CA-1, CA-2 y CA-6 marcados. Pendiente la
  prueba manual con dos cuentas (CA-3..CA-5, CA-7).
- 2026-11-02 — Fix de rotación remota en la cripta: `CryptSession` reportaba
  `cameraYaw` en `mg2-position`; ahora reporta `playerState.facingYaw`.
- 2026-11-02 — v1.11.2 desplegada con `--public`; aprobada y pública a las
  22:55 UTC. Room `A8HWBN` (1.11.1) cerrada y reemplazada por `UUZXH2`
  (1.11.2). Los logs no muestran errores.
