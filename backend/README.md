# Backend — Elysia + Bun

Servidor HTTP y WebSocket autoritativo del juego. Es el backend activo: el
cliente (`frontend/src/lib/services/lobbySocket.ts`) se conecta por WebSocket
nativa y ya no usa las salas de RUN.world. El puerto de rooms de
`frontend/src/server/` se conserva como referencia y para los scripts de
verificación, pero no forma parte del runtime.

## Desarrollo

```bash
bun install
bun run dev
```

- HTTP: `http://localhost:4000/`
- WebSocket: `ws://localhost:4000/ws`
- Puerto por defecto: `4000` (configurable con `PORT`)
- `bunx tsc --noEmit` para comprobar tipos.

> **Este es el motor activo.** Los archivos de `frontend/src/server/` y
> `frontend/src/lib/state/{waves,dm,parkour}Config.ts` son copias de
> referencia para los scripts `verify-*`. Al cambiar reglas de juego aquí,
> replica el cambio en la copia de referencia para que las verificaciones no
> validen código viejo. Los scripts `waves:aim`, `waves:rock`, etc. se
> ejecutan desde `frontend/`.

En el cliente, `VITE_WS_URL` fija la URL del WebSocket (por ejemplo
`ws://localhost:4000/ws` o `wss://mi-servidor/ws`). Si no está definida, se usa
el mismo origen que la página con `/ws` y `ws`/`wss` según el protocolo; en
desarrollo Vite reenvía `/ws` al backend en `http://localhost:4000`.

## Lobby WebSocket

El servidor mantiene en memoria un lobby global con todos los conectados y
siete mini lobbies fijos. Cada jugador está siempre en el lobby global y puede
estar, como máximo, en uno de los mini lobbies.

| ID           | Nombre visible         | Motor / spec                               |
| ------------ | ---------------------- | ------------------------------------------ |
| `global`     | Global                 | Hub, chat, coches, rollos de papel         |
| `minigame-1` | Minijuego 1            | Sin motor (reservado)                      |
| `minigame-2` | Minijuego 2            | Cripta / momias (SPEC-011)                 |
| `minigame-3` | Minijuego 3            | Gran Premio, circuito `TWN_Track`          |
| `minigame-4` | Haunted Highway        | Carrera, circuito `roadmap`                |
| `minigame-5` | Barn Siege             | Asedio al granero (SPEC-023)               |
| `minigame-6` | Witch House Deathmatch | Deathmatch por equipos (SPEC-025)          |
| `minigame-7` | Parkour Spire          | Torre de parkour (SPEC-026)                |
| `minigame-8` | Skyfall Royale         | Battle royale en `islas-ciudad` (SPEC-040) |

### Protocolo

Todos los mensajes son texto JSON. Los tipos completos, con todos los campos
de cada minijuego, están en `src/server/protocol.ts` (debe mantenerse en
sincronía con `frontend/src/lib/services/protocol.ts`).

Cliente → servidor (resumen; la lista completa está en `ClientMessage`):

```ts
type ClientMessage =
  // Handshake del backend Bun (el id lo asigna el servidor).
  | { type: "join"; name?: string }
  | { type: "enter-lobby"; lobbyId: MinigameLobbyId }
  | { type: "leave-lobby" }
  | { type: "chat"; text: string }
  | { type: "ping" }
  // Reenvía welcome + historial + rollos + coches.
  | { type: "sync" }
  // Compatibilidad con clientes de la etapa rooms.
  | { type: "emote"; text: string }
  | { type: "set-lobby"; lobbyId: LobbyId }
  // Presencia remota y skins.
  | { type: "player-skin"; skin: SkinId }
  | { type: "player-animation"; animation: HeroAnimation }
  | { type: "player-position"; x: number; y: number; z: number; yaw: number };
// Rollos, cripta, coches, carrera y minijuegos 5/6/7…
```

Servidor → cliente (resumen):

```ts
type ServerMessage =
	| { type: "welcome"; self: Player; presence: PresenceSnapshot }
	| { type: "presence"; presence: PresenceSnapshot }
	| { type: "chat"; message: ChatMessage }
	| { type: "chat-history"; messages: ChatMessage[] }
	| { type: "pong"; at: number }
	| { type: "error"; code: string; message: string }
	// Alias legacy: hello / emote / emote-history / go-lobby.
	| { type: "rolls-state"; serverTime: number; rolls: PaperRollState[] }
	| { type: "mg2-state"; state: Mg2Snapshot }
	| { type: "mg2-positions"; at: number; players: …; mummies: … }
	| { type: "mg2-event"; event: Mg2Event }
	| { type: "player-animation"; playerId: string; animation: HeroAnimation; at: number }
	| { type: "player-position"; playerId: string; position: RemotePosition; at: number }
	| { type: "cars-state"; serverTime: number; cars: CarState[] }
	| { type: "car-event"; event: CarEvent }
	| { type: "race-state" | "race-positions" | "race-event"; … }
	| { type: "mg5-state" | "mg5-positions" | "mg5-event"; … }
	| { type: "mg6-state" | "mg6-positions" | "mg6-event"; … }
	| { type: "mg7-state" | "mg7-positions" | "mg7-event"; … };
```

`Player` y `PresenceSnapshot`:

```ts
type Player = {
  id: string;
  name: string;
  skin: SkinId;
  connectedAt: number;
  lobbyId: LobbyId;
};

type PresenceSnapshot = {
  total: number;
  lobbies: Array<{
    id: LobbyId;
    name: string;
    kind: "global" | "minigame";
    players: Player[];
    /** Solo mini lobbies; el hub global no tiene partida. */
    status?: LobbyStatus;
  }>;
};

type LobbyStatus = {
  phase: "waiting" | "countdown" | "playing" | "results";
  canEnter: boolean;
  /** Motivo legible cuando `canEnter` es false. */
  reason: string | null;
  maxPlayers: number | null;
};

type ChatMessage = {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  sentAt: number;
  kind: "user" | "emote" | "system";
};
```

### Temas (topics)

| Topic              | Suscripción                          |
| ------------------ | ------------------------------------ |
| `lobby:global`     | Todos los sockets desde que se abren |
| `lobby:minigame-2` | Jugadores dentro de `minigame-2`     |
| `lobby:minigame-3` | Jugadores dentro de `minigame-3`     |
| `lobby:minigame-4` | Jugadores dentro de `minigame-4`     |
| `lobby:minigame-5` | Jugadores dentro de `minigame-5`     |
| `lobby:minigame-6` | Jugadores dentro de `minigame-6`     |
| `lobby:minigame-7` | Jugadores dentro de `minigame-7`     |

La presencia se difunde por `lobby:global`. Cada motor publica sus snapshots y
eventos solo en el topic de su mini lobby, y el host traduce los mensajes de
cada cliente según el `lobbyId` de su jugador.

### Reglas

- El servidor asigna el `id`; el cliente nunca lo elige.
- El alias se recorta, se limita a 24 caracteres y usa `Player-XXXX` si llega vacío.
- Si no llega `join` en 10 segundos, el socket se cierra con código `4001`.
- Entrar en un mini lobby no saca al jugador del global.
- `enter-lobby` cambia directamente de mini lobby si ya estaba en otro.
- La presencia incluye `status` de cada mini lobby (`waiting`, `countdown`,
  `playing`, `results`) y si admite jugadores (`canEnter`). Se reemite cuando
  cambia la fase, sin esperar a que alguien entre o salga.
- `enter-lobby` aplica la admisión del motor antes de mover al jugador: una
  partida en curso o llena se rechaza sin sacarlo de su lobby actual.
- La cripta y el deathmatch permiten entrada a mitad de partida; carrera,
  parkour y Barn Siege la cierran cuando empieza la ronda. El cliente muestra
  ese estado en el checkpoint y desactiva la entrada cuando está cerrada.
- Los errores de protocolo no cierran la conexión.
- Al terminar una ronda, los motores piden `moveToGlobal`: el host actualiza la
  presencia y desuscribe el topic. El cliente reacciona al cambio de presencia
  para salir de la escena; `go-lobby` se acepta por compatibilidad.
- `set-lobby` hace lo mismo que `enter-lobby`/`leave-lobby` para clientes de la
  etapa rooms; no ejecuta la validación de admisión de los motores.

### Chat global

El chat viaja por el mismo WebSocket. Solo los jugadores que han enviado `join` pueden escribir.

- Cada mensaje se sanea (caracteres de control, espacios y `trim`) y se limita a **200 caracteres**.
- El servidor conserva en memoria los **últimos 20 mensajes** y los envía como `chat-history` justo después de `welcome`.
- Cada jugador puede enviar como máximo **1 mensaje cada 500 ms**.
- El historial se difunde por `lobby:global`; las respuestas de sistema solo se envían al emisor y no entran en el historial.
- El nombre y el `id` del autor los pone el servidor desde la presencia.

Comandos:

| Entrada      | Comportamiento                                                   |
| ------------ | ---------------------------------------------------------------- |
| `/help`      | Solo al emisor: `kind: 'system'` con la lista de comandos        |
| `/me se ríe` | Difundido: `kind: 'emote'` con el texto `se ríe`                 |
| `/foo`       | Solo al emisor: `kind: 'system'` con `Comando desconocido: /foo` |

Errores de chat:

| Código             | Causa                                     |
| ------------------ | ----------------------------------------- |
| `EMPTY_MESSAGE`    | Texto vacío tras sanear                   |
| `MESSAGE_TOO_LONG` | Texto saneado de más de 200 caracteres    |
| `RATE_LIMITED`     | Menos de 500 ms desde el mensaje anterior |
| `EMPTY_EMOTE`      | `/me` sin acción                          |
| `NOT_JOINED`       | El socket aún no ha enviado `join`        |

### Prueba rápida

Con el servidor levantado:

```bash
bun -e '
const ws = new WebSocket("ws://localhost:4000/ws");
ws.onopen = () => ws.send(JSON.stringify({ type: "join", name: "Ana" }));
ws.onmessage = (event) => console.log(event.data);
setTimeout(() => process.exit(0), 2000);
'
```

## Coches conducibles

El servidor mantiene en memoria el estado autoritativo de los tres coches del mapa exterior. El conductor simula la física con Rapier en su cliente y reporta posición/velocidad; el servidor valida rangos, frecuencia y propiedad, y difunde el estado al resto.

| ID              | Nombre visible  | Modelo            | Spawn (`x, y, z`, yaw) |
| --------------- | --------------- | ----------------- | ---------------------- |
| `car-calabaza`  | Coche Calabaza  | `coche_calabaza`  | `-7, 1.4, 12`, `0`     |
| `car-momia`     | Coche Momia     | `coche_momia`     | `7, 1.4, 12`, `π`      |
| `car-halloween` | Coche Halloween | `coche_halloween` | `0, 1.4, 17`, `π/2`    |

Estados posibles: `available`, `occupied`, `destroyed`, `respawning`. En la práctica `respawning` queda cubierto por `destroyed` + `respawnAt`; el coche vuelve a `available` al cumplirse el plazo.

### Mensajes de coches

Cliente → servidor:

```ts
type ClientMessage =
  | { type: "enter-car"; carId: CarId }
  | { type: "exit-car"; carId: CarId }
  | {
      type: "car-state";
      carId: CarId;
      x: number;
      y: number;
      z: number;
      qx: number;
      qy: number;
      qz: number;
      qw: number;
      vx: number;
      vy: number;
      vz: number;
      speed: number;
      steering: number;
    }
  | {
      type: "car-impact";
      carId: CarId;
      impactSpeed: number;
      cause: "collision" | "rollover";
    };
```

Servidor → cliente:

```ts
type CarState = {
  id: CarId;
  name: string;
  model: "coche_calabaza" | "coche_momia" | "coche_halloween";
  status: "available" | "occupied" | "destroyed" | "respawning";
  driverId: string | null;
  driverName: string | null;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  velocity: { x: number; y: number; z: number };
  speed: number;
  steering: number;
  health: number;
  maxHealth: number;
  respawnAt: number | null;
  updatedAt: number;
};

type ServerMessage =
  | { type: "cars-state"; serverTime: number; cars: CarState[] }
  | { type: "car-event"; event: CarEvent };

type CarEvent = {
  kind:
    "entered" | "exited" | "damaged" | "destroyed" | "respawned" | "released";
  carId: CarId;
  playerId?: string;
  playerName?: string;
  amount?: number;
  cause?: "collision" | "rollover" | "fall" | "disconnect" | "lobby";
  at: number;
};
```

Al hacer `join` se envía un `cars-state` completo. Mientras haya coches ocupados se difunde otro snapshot cada 100 ms; los cambios de estado (entrada, salida, daño, destrucción, respawn) también lo difunden de inmediato.

### Reglas

- Solo se conduce en `lobbyId === 'global'`. Entrar en un minijuego o en la cripta libera el coche con `cause: 'lobby'`.
- `enter-car` exige que el coche esté `available`, que el jugador no conduzca otro coche y estar a ≤ 5 m horizontales y ≤ 3 m verticales (si el servidor conoce su última posición).
- `car-state` solo se acepta del conductor: coordenadas `±1000`, `y` entre `-200` y `300`, cuaternión normalizable, velocidad ≤ 40 m/s y sin saltos de posición imposibles. Máximo 20 reportes por segundo.
- `car-impact` solo se acepta del conductor, con enfriamiento de 600 ms por coche. Daño por colisión: `clamp((impactSpeed - 5) * 3, 0, 35)`; vuelco: 12. El daño máximo por evento es 35.
- A 0 de salud el coche pasa a `destroyed`, se libera el conductor y `respawnAt = now + 5000`.
- Si el coche cae por debajo de `y = -20`, se destruye con `cause: 'fall'`.
- Al reaparecer se comprueba que no haya jugadores a menos de 3 m del spawn; si los hay, se reintenta cada segundo hasta un máximo de 10 s.
- Si el conductor se desconecta, el coche se libera con `car-event` `released` y `cause: 'disconnect'`.

### Errores

| Código              | Causa                                                  |
| ------------------- | ------------------------------------------------------ |
| `NOT_IN_GLOBAL`     | El jugador está en un minijuego o en la cripta         |
| `CAR_NOT_FOUND`     | `carId` desconocido                                    |
| `ALREADY_DRIVING`   | El jugador ya conduce otro coche                       |
| `CAR_OCCUPIED`      | El coche ya tiene conductor                            |
| `CAR_DESTROYED`     | El coche está destruido                                |
| `CAR_RESPAWNING`    | El coche está reapareciendo                            |
| `CAR_TOO_FAR`       | El jugador está demasiado lejos para entrar            |
| `NOT_DRIVING`       | El coche no está siendo conducido                      |
| `NOT_DRIVER`        | El jugador no es el conductor de ese coche             |
| `CAR_RATE_LIMITED`  | Más de 20 reportes de estado por segundo               |
| `CAR_INVALID_STATE` | Coordenadas, cuaternión o velocidad fuera de rango     |
| `CAR_TELEPORT`      | Salto de posición mayor de lo que permite la velocidad |
| `INVALID_CAR`       | `carId` que no pasa el esquema Zod                     |

### Controles

- **Escritorio:** `W/A/S/D` o flechas para acelerar/frenar/girar, `Espacio` como freno de mano y `E` para entrar/salir.
- **Móvil:** stick analógico para acelerar/reversa y girar; botones `Izq`/`Der`, `Acelerar`, `Freno`, `Reversa` y `Salir` durante la conducción; botón `Conducir` al acercarse a un coche libre.

### Smoke test

Con el backend levantado (`PORT=4000 bun run dev` si se quiere aislar del servidor de desarrollo):

```bash
cd backend && bun run /tmp/opencode/cars-smoke.ts
```

El script abre dos clientes, comprueba el estado inicial, la entrada, el rechazo del segundo jugador, el movimiento remoto, el rechazo de `car-state` ajeno, la salida, el daño hasta destruir, el respawn a los 5 s y la liberación por desconexión.

## Gran Premio / Haunted Highway — `minigame-3` y `minigame-4`

El mismo motor `Race` se instancia dos veces en el proceso: `minigame-3` con el
circuito `TWN_Track` de `map.glb` y `minigame-4` con el circuito `roadmap`. Las
fases, poderes, validación y mensajes son idénticos; cambia la pista y el
`lobbyId` de destino.

Sala autoritativa de una sola instancia por circuito. El servidor decide fases,
parrilla, vueltas, puertas, cajas, poderes, daño y clasificación; el cliente
solo simula su coche y reporta posición/rotación/velocidad.

### Fases

| Fase        | Duración           | Notas                                                       |
| ----------- | ------------------ | ----------------------------------------------------------- |
| `idle`      | —                  | Sin pilotos; la sala se reinicia al quedar vacía.           |
| `countdown` | 30 s (10 s si 6/6) | Coches congelados en la parrilla; se puede mirar y chatear. |
| `playing`   | 5 vueltas o 480 s  | Coches dinámicos, cajas y poderes activos.                  |
| `results`   | 15 s               | Podio y tiempos; después todos vuelven a `global`.          |

Límites: 6 pilotos, 8 puertas por vuelta (meta + 7 checkpoints), vueltas de
mínimo 10 s, separación mínima de 500 ms entre puertas y 12 cajas con respawn
de 5 s. La barrera interior (`r≈86.6`) solo colisiona con coches de carrera.

### Mensajes de carrera

Cliente → servidor:

```ts
type ClientMessage =
  | {
      type: "race-car-state";
      x: number;
      y: number;
      z: number;
      qx: number;
      qy: number;
      qz: number;
      qw: number;
      vx: number;
      vy: number;
      vz: number;
      speed: number; // recortada a 55 por el cliente
      steering: number;
    }
  | { type: "race-use-item" }
  | { type: "race-reset" }
  | {
      type: "race-impact";
      impactSpeed: number;
      cause: "collision" | "rollover";
    };
```

Servidor → cliente:

```ts
type ServerMessage =
  | { type: "race-state"; state: RaceSnapshot }
  | { type: "race-positions"; at: number; players: RacePosition[] }
  | { type: "race-event"; event: RaceEvent };
```

`race-state` se emite al entrar, al cambiar de fase o de cualquier contador y
cada segundo. `race-positions` se emite a 10 Hz. Los eventos relevantes son
`player-joined`, `player-left`, `countdown-shortened`, `race-start`,
`gate-passed`, `lap-completed`, `player-finished`, `item-picked`, `item-used`,
`missile-fired`, `missile-hit`, `mine-placed`, `mine-hit`, `ray-fired`,
`player-destroyed`, `player-respawned` y `race-ended`.

### Poderes

| Poder     | Peso | Efecto                                                              |
| --------- | ---- | ------------------------------------------------------------------- |
| `nitro`   | 25   | 3 s de motor ×1.8 y hasta 55 m/s                                    |
| `missile` | 20   | 30 de daño al piloto de delante a ≤ 60 m; sigue el arco de la pista |
| `mine`    | 15   | Mina detrás del coche: 30 de daño, arma a 1 s, dura 20 s y máximo 6 |
| `repair`  | 15   | +35 de salud instantáneos                                           |
| `ray`     | 10   | 25 de daño instantáneo al piloto de delante a ≤ 60 m                |
| `auto`    | 10   | +10 HP/s durante 5 s                                                |
| `shield`  | 5    | 4 s de inmunidad a misiles, minas, rayos y choques                  |

### Validación

- `race-car-state` solo se acepta en `playing` y con el piloto `racing`.
- Números finitos, `|x|,|z| ≤ 1000`, `y ∈ [-10, 50]`, `speed ≤ 55,5`,
  cuaternión normalizable y salto máximo de `60 m/s` entre reportes.
- Máximo 20 reportes por segundo y piloto.
- El cruce de puerta se calcula por intersección del segmento recorrido con la
  línea radial `r ∈ [86.5, 99.5]` y solo cuenta en el sentido de la carrera.
- Una puerta fuera de orden, un salto o una vuelta de menos de 10 s no suman
  progreso; el servidor conserva el último estado válido.
- Un coche por debajo de `y=-5` o fuera del anillo (`r<84` o `r>102`) más de
  2 s reaparece en su última puerta. Tras una destrucción reaparece en el punto
  de la explosión si sigue sobre el asfalto; si no, también en la última puerta.
- `race-state` incluye las 12 cajas, los misiles en vuelo y las minas activas.

### Errores

| Código             | Causa                                               |
| ------------------ | --------------------------------------------------- |
| `RACE_FULL`        | La sala ya tiene 6 pilotos                          |
| `RACE_IN_PROGRESS` | Se intenta entrar en `playing` o `results`          |
| `NOT_IN_RACE`      | Un mensaje de carrera llega desde otro lobby        |
| `RACE_ROOM_ERROR`  | Excepción interna del tick; la sala vuelve a `idle` |

### Controles

- **Escritorio:** `W/S` acelerar/frenar, `A/D` girar, `Espacio` freno de mano,
  `Q` usar poder y `R` resetear el coche.
- **Móvil:** `Izq`/`Der`, `Acelerar`, `Freno`, `Item`, `Reset` y `Salir`.
- El chat y los campos editables tienen prioridad sobre las teclas de carrera.

## Cripta y momias — `minigame-2`

Motor `Crypt` (`src/server/engines/minigame2.ts`). Autoridad de calaveras,
momias, depósitos, daño y rondas. El cliente reporta `mg2-position`, las momias
que simula con `mg2-mummies`, pide depósitos con `mg2-deposit` y aturde momias
con `mg2-stun` (por ejemplo al acertar con un rollo). El servidor difunde
`mg2-state`, `mg2-positions` y `mg2-event`.

## Barn Siege — `minigame-5`

Motor `Waves` (`src/server/engines/waves.ts`, SPEC-023). Hasta 4 jugadores
defienden la aldea de oleadas de monstruos. El cliente simula el movimiento y
reporta `mg5-position`; dispara con `mg5-shoot`, lanza granadas con
`mg5-throw`, recarga/equipa con `mg5-reload`/`mg5-equip` y gestiona el coche
con `mg5-car-enter`/`mg5-car-exit`/`mg5-car-state`. Snapshots `mg5-state` y
`mg5-positions`, eventos `mg5-event`.

## Witch House Deathmatch — `minigame-6`

Motor `Deathmatch` (`src/server/engines/deathmatch.ts`, SPEC-025). Dos equipos
(`coven` / `hunters`) en la arena de `barnsiege.glb` con armas y granadas. Las
posiciones se reportan con `mg6-position`, el fuego con `mg6-shoot`, las
granadas con `mg6-throw` y el inventario con `mg6-reload`/`mg6-equip`. El
servidor envía `mg6-state`, `mg6-positions` y `mg6-event`.

## Parkour Spire — `minigame-7`

Motor `Parkour` (`src/server/engines/parkour.ts`, SPEC-026). Carrera de hasta 12
jugadores por la torre: checkpoints, caídas, respawns, guardián y empujones.
Solo se reporta `mg7-position`; el servidor valida saltos, límites y
frecuencia, y difunde `mg7-state`, `mg7-positions` y `mg7-event`.

## Rollos de papel

`PaperRolls` (`src/server/engines/paperRolls.ts`) simula los rollos lanzados en
el mapa o en la cripta. El cliente envía `throw-roll` con posición y velocidad
iniciales; el servidor avanza la física, emite `rolls-state` al entrar y cada
vez que cambia la lista. Los rollos de la cripta pueden aturdir momias con
`mg2-stun`.

## Skins

La skin equipada viaja en `player-skin` y se valida contra
`src/lib/cosmetics/skinIds.ts` (el mismo catálogo que el cliente). El servidor
la guarda en el jugador y la difunde en `presence`, de modo que los avatares
remotos se renderizan con el modelo correcto. Entrar a Parkour también recibe
la skin para el respawn.

## Jukebox del club — `/club/source`, `/club/stream` y `/club/hls`

El jukebox comparte la cola por WebSocket (`club-music-*`). El audio no viaja
por el socket: cada cliente pregunta primero al backend cómo reproducir la
pista y luego apunta un `<audio>` (o `hls.js`) a la fuente devuelta.

```text
GET /club/source?url=<enlace-de-soundcloud>
→ { ok, kind: "progressive" | "hls", src, title, author, artworkUrl, durationMs }
```

- `kind: "progressive"` → `src` apunta a
  `GET /club/stream?url=<enlace>`, que reenvía el MP3 respetando `Range`
  (`206`, `Content-Range`, `Accept-Ranges`).
- `kind: "hls"` → `src` apunta a
  `GET /club/hls?url=<playlist-o-segmento>`. El proxy descarga la playlist,
  reescribe sus líneas y atributos `URI="…"` para que los segmentos y claves
  sigan pasando por el backend, y los reenvía en memoria. El cliente usa
  `hls.js` en Chrome/Brave y HLS nativo en Safari.

El backend normaliza el enlace, descarga la página del track, lee
`window.__sc_hydration` para sacar `media.transcodings` y
`track_authorization`, descubre el `client_id` público en la página/bundles JS
y pide primero la transcodificación progresiva MP3; si no existe, usa la HLS.
No escribe audio en disco: es un puente en memoria. Si el scrape falla, se usa
como respaldo la API de terceros
`https://www.cloudsaver.net/api/soundcloud`; si tampoco hay stream, el cliente
cae al iframe oficial de SoundCloud.

- El `client_id` se puede forzar con `SOUNDCLOUD_CLIENT_ID` si el scrape no lo
  encuentra.
- Las URLs de CloudSaver se validan antes de usarlas: `Range` mínimo para MP3
  y `#EXTM3U` para playlists HLS.
- `/club/hls` solo reenvía hosts de SoundCloud (`*.soundcloud.cloud`,
  `*.sndcdn.com`, `*.soundcloud.com`).
- Diagnóstico sin descargar audio:
  `GET /club/resolve?url=<enlace>` devuelve `kind`, título, autor, duración y
  host del stream, o `404` si ningún resolvedor encontró audio.
- En desarrollo, Vite reenvía `/club` al backend (`frontend/vite.config.ts`).
- En producción, el proxy del servidor web debe reenviar `/club` al backend.

## Mini-relayer de FastAuth — `POST /relayer/create-account`

El login con Google usa FastAuth: la clave del jugador la deriva NEAR MPC a partir
de su identidad de Auth0, así que la cuenta puede crearse con esa clave pública
sin que el jugador tenga wallet ni NEAR. El backend expone un mini-relayer que
firma `create_account` desde una cuenta propia.

**No fondea la cuenta**: solo paga el gas de la creación. La cuenta queda con
saldo `0` y el funding es un spec posterior.

### Configuración

```bash
cp .env.example .env
# completar RELAYER_ACCOUNT_ID y RELAYER_PRIVATE_KEY
```

| Variable              | Default                            | Uso                                                |
| --------------------- | ---------------------------------- | -------------------------------------------------- |
| `NEAR_NETWORK_ID`     | `testnet`                          | Red del relayer y de las cuentas creadas.          |
| `NEAR_RPC_URL`        | `https://rpc.testnet.fastnear.com` | RPC usado para consultar y difundir transacciones. |
| `RELAYER_ACCOUNT_ID`  | —                                  | Cuenta que firma y paga el gas.                    |
| `RELAYER_PRIVATE_KEY` | —                                  | Key `ed25519:<base58>` con permiso FullAccess.     |

Sin esas dos últimas variables el endpoint responde `502` con un mensaje claro;
el resto del backend arranca normal. La key del relayer **nunca** llega al
cliente: solo el backend la lee de `process.env`.

### Endpoint

```http
POST /relayer/create-account
Content-Type: application/json

{ "accountId": "t-nearbox-1a2b3c4d5e.testnet", "publicKey": "ed25519:<base58>" }
```

El `accountId` puede ser el **handle automático** de las cuentas nuevas
(`t-nearbox-<10 hex>.testnet`, derivado de la public key por el frontend), un
handle legible (`t-<handle>.testnet`, solo como fallback si el automático está
ocupado) o el formato antiguo determinista `t-<sha256 12 hex>.testnet`.

Respuestas:

| Status | Body                      | Causa                                                   |
| ------ | ------------------------- | ------------------------------------------------------- |
| `200`  | `{ hash, alreadyExists }` | Cuenta creada (`hash`) o ya existente con esa misma key |
| `400`  | `{ message }`             | `accountId`/`publicKey` con formato inválido            |
| `409`  | `{ message }`             | El nombre ya existe con **otra** public key             |
| `429`  | `{ message }`             | Más de 5 pedidos por IP por minuto                      |
| `502`  | `{ message }`             | Falta config, falla el RPC o falla el contrato          |

Reglas de validación:

- `accountId` debe cumplir
  `^t-(?:[0-9a-f]{12}|[a-z0-9](?:[a-z0-9-]{1,18}[a-z0-9])?)\.testnet$`:
  - handle: `t-` + 3–20 caracteres `a-z`, `0-9` y `-`, sin guion al inicio ni
    al final (el frontend usa `nearbox-<10 hex>`);
  - formato antiguo: `t-<sha256(publicKey).slice(0, 12)>.testnet`.
- `publicKey` debe ser `ed25519:<base58>`.
- La operación es idempotente: si la cuenta ya existe **y contiene esa misma
  public key**, devuelve `alreadyExists: true` sin firmar nada. Si existe con
  otra key, responde `409` para que el cliente use el formulario de fallback
  (nunca se reemplazan access keys ajenas).
- Como el relayer tiene una sola access key, las transacciones se serializan en
  memoria para no chocar nonces.

> La cuenta es permanente: NEAR no permite renombrar cuentas. El frontend
> deriva `t-nearbox-<10 hex>.testnet` de la `publicKey`, así que la misma cuenta
> de Google recupera el mismo nombre en cualquier dispositivo o tras borrar
> `localStorage`; no hay nada que recordar ni escribir. El nombre visible está
> en Ajustes → Profile. Las cuentas antiguas `t-<12 hex>` y los handles elegidos
> a mano se adoptan sin pedir nada.

En desarrollo el cliente llama a `/api/relayer/create-account` y Vite reescribe
`/api` → `` contra el backend (`frontend/vite.config.ts`). En producción el
reverse proxy debe hacer el mismo mapeo.

## Estadísticas de jugador — `/stats` (MongoDB)

Las estadísticas que el cliente guardaba en `localStorage` (`rw:stats:v1`)
ahora pueden persistirse en MongoDB. La API replica la forma de `StatsData`
del frontend, con `createdAt`/`updatedAt` en milisegundos.

La identidad estable es la cuenta NEAR (`t-<handle>.testnet`). Los documentos de
cuenta se vinculan al `sub` del JWT de Auth0 la primera vez que se usan; los
UUID antiguos siguen funcionando sin token como modo legacy y se pueden migrar
a la cuenta con `POST /stats/:playerId/merge`.

### Configuración

```bash
cd backend
bun add mongoose   # ya está en package.json
```

Variables (ver `.env.example`):

| Variable                | Por defecto                         | Descripción                                             |
| ----------------------- | ----------------------------------- | ------------------------------------------------------- |
| `MONGODB_URI`           | `mongodb://127.0.0.1:27017/nearbox` | Conexión de Mongoose.                                   |
| `STATS_EVENTS_TTL_DAYS` | `90`                                | Retención del log `stats_events`; `0` desactiva el TTL. |

MongoDB es **opcional al arrancar**: si no responde, el WebSocket y los
minijuegos siguen funcionando y solo `/stats/*` devuelve `503`. La conexión se
reintenta cada 5 s.

En desarrollo el cliente llama a `/api/stats/*` y Vite reescribe `/api` → ``
contra el backend (`frontend/vite.config.ts`). En producción el reverse proxy
debe hacer el mismo mapeo.

### Endpoints

| Método | Ruta                         | Descripción                                                                                                     |
| ------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/stats/health`              | Estado de la conexión (`200` o `503`).                                                                          |
| `GET`  | `/stats/leaderboard?limit=3` | Top público por misiones completadas (máx. 20). Devuelve `playerId`, `alias`, `skin`, `score` y `kills`.        |
| `GET`  | `/stats/:playerId`           | Snapshot actual; lo crea vacío si no existe.                                                                    |
| `PUT`  | `/stats/:playerId`           | Sincroniza un snapshot completo con `$max` (nunca retrocede). Acepta `alias` y `skin` opcionales para el podio. |
| `POST` | `/stats/:playerId/events`    | Aplica eventos con `$inc` atómico.                                                                              |
| `POST` | `/stats/:playerId/reset`     | Pone los contadores a cero y conserva `createdAt`.                                                              |
| `POST` | `/stats/:playerId/merge`     | Fusiona un UUID legacy en la cuenta con `$max`. Cuerpo: `{ "fromPlayerId": "<uuid>" }`.                         |

`playerId` admite `A-Z a-z 0-9 . _ : -` (1–64 caracteres), suficiente para UUIDs
y cuentas NEAR.

### Autenticación

- **Cuentas** (`t-<handle>.testnet`): requieren `Authorization: Bearer <jwt>` de
  Auth0. El JWT se verifica con el JWKS, `iss`, `aud` y `exp` en
  `src/server/auth0.ts`. El primer uso guarda el `sub` en `player_stats.subject`;
  otro `sub` sobre la misma cuenta recibe `403 STATS_FORBIDDEN`.
- **UUID legacy**: se aceptan sin token para no romper clientes antiguos. Nunca
  se vinculan a un `sub` aunque se envíe uno.
- **Merge**: el destino debe ser una cuenta autenticada y el origen un UUID. Es
  idempotente y deja un evento `link` en `stats_events` con el id de origen.

La respuesta de error distingue `401 AUTH_REQUIRED` (token ausente/inválido) de
`403 STATS_FORBIDDEN` (cuenta de otra persona).

Respuesta de `GET` (misma forma que `StatsData`):

```json
{
  "version": 1,
  "playerId": "00000000-0000-4000-8000-000000000000",
  "createdAt": 1763080000000,
  "updatedAt": 1763080000000,
  "alias": "Player-AB12",
  "skin": "witch",
  "missions": {
    "cats": { "played": 0, "completed": 0, "catsFound": 0 },
    "crypt": { "played": 0, "completed": 0, "failed": 0, "deaths": 0 },
    "barn": {
      "played": 0,
      "completed": 0,
      "failed": 0,
      "deaths": 0,
      "kills": 0
    },
    "race": { "played": 0, "finished": 0, "won": 0, "laps": 0, "deaths": 0 }
  }
}
```

Eventos aceptados (todos con `delta` opcional, 1–1000):

| Evento                                               | Contador                       |
| ---------------------------------------------------- | ------------------------------ |
| `mission-start` (`mission: cats\|crypt\|barn\|race`) | `missions.<mission>.played`    |
| `mission-complete` (`mission: cats\|crypt\|barn`)    | `missions.<mission>.completed` |
| `mission-fail` (`mission: crypt\|barn`)              | `missions.<mission>.failed`    |
| `cat-capture`                                        | `missions.cats.catsFound`      |
| `kill`                                               | `missions.barn.kills`          |
| `death` (`mission: crypt\|barn\|race`)               | `missions.<mission>.deaths`    |
| `lap`                                                | `missions.race.laps`           |
| `race-finish`                                        | `missions.race.finished`       |
| `race-win`                                           | `missions.race.won`            |

Ejemplo:

```bash
curl -X POST localhost:4000/stats/00000000-0000-4000-8000-000000000000/events \
  -H 'content-type: application/json' \
  -d '{"events":[{"type":"mission-start","mission":"crypt"},{"type":"death","mission":"crypt"}]}'
```

### Modelos

| Colección      | Modelo        | Uso                                                                                         |
| -------------- | ------------- | ------------------------------------------------------------------------------------------- |
| `players`      | `Player`      | `playerId`, `alias` opcional y `lastSeenAt`.                                                |
| `player_stats` | `PlayerStats` | Fuente de verdad de los contadores, `subject` del dueño y perfil público (`alias`, `skin`). |
| `stats_events` | `StatsEvent`  | Log append-only con TTL para auditoría/analytics.                                           |

Los contadores son monótonos: `PUT` usa `$max` y los eventos usan `$inc`. Solo
`reset` puede reducirlos. `played` se recalcula en el servidor como
`max(played, completed + failed)` (o `max(played, finished, won)` en `race`)
para tolerar clientes que entran a una partida ya empezada.

> **Seguridad**: las cuentas quedan protegidas por el JWT de Auth0, pero la
> vinculación es por primer uso: el backend no verifica on-chain que
> `accountId` pertenezca a la publicKey del token. Los UUID legacy siguen sin
> autenticación por compatibilidad. No usar estos contadores para economía,
> recompensas ni rankings definitivos sin endurecer esa vinculación.

## Progresión, logros y recompensas NFT (SPEC-045)

El catálogo es público y lo comparten frontend y backend:

```http
GET /progression/catalog
```

Devuelve `version`, `fingerprint`, `tiers`, `gates`, `missions` y `rewards`. El
test `tests/catalogParity.test.ts` importa el catálogo del frontend y falla si
ambos dejan de ser idénticos; si cambia cualquier misión hay que actualizar el
`fingerprint` de `tests/progression.test.ts`.

Endpoints autenticados por jugador (mismos JWT/ownership que `/stats`):

| Método | Ruta                                                  | Uso                                             |
| ------ | ----------------------------------------------------- | ----------------------------------------------- |
| `GET`  | `/progression/:playerId`                              | Snapshot de misiones, tiers, claims y avisos.   |
| `GET`  | `/progression/:playerId/claims`                       | Claims de recompensas.                          |
| `POST` | `/progression/:playerId/sync`                         | Errands y migración legacy (`legacyCompleted`). |
| `POST` | `/progression/:playerId/missions/:missionId/accept`   | Aceptar misión.                                 |
| `POST` | `/progression/:playerId/missions/:missionId/abandon`  | Abandonar misión.                               |
| `POST` | `/progression/:playerId/missions/:missionId/progress` | Entregar rollos (`collectedIds`).               |

Las misiones con tier NFT se bloquean como `ownershipUnverified` si el RPC no
puede verificar la wallet: el snapshot falla cerrado (no desbloquea) y el claim
responde `503`. Los tiers y recompensas son verificados en servidor; el cliente
solo aporta la lista de rollos recogidos.

La migración legacy es de una sola vez: `sync` acepta `legacyCompleted` con una
allowlist de ids (`barn-first`, `royale-first`, `gp-first`, `hexfire-first`,
`parkour-first`, `crypt-first`, `cats-first`, `cats-25`) y marca
`migratedFromLocalAt` para no volver a importar `localStorage`.

### Capacidad de mints patrocinados

Las recompensas usan un presupuesto **separado** del mint de la tienda: agotar
`SPONSORED_MINT_BUDGET_NEAR` no impide reclamar un logro.

| Variable                     | Default                               | Uso                                                      |
| ---------------------------- | ------------------------------------- | -------------------------------------------------------- |
| `REWARD_MINT_BUDGET_NEAR`    | `3`                                   | Presupuesto total del relayer para mints de recompensas. |
| `REWARD_MINT_ESTIMATE_YOCTO` | `6000000000000000000000` (0.006 NEAR) | Coste estimado por mint para el prechequeo.              |
| `REWARD_DAILY_MINT_LIMIT`    | `60`                                  | Tope de mints de recompensa por día UTC.                 |
| `MINT_DEPOSIT_YOCTO`         | `10000000000000000000000` (0.01 NEAR) | Depósito adjunto a cada mint.                            |

Capacidad aproximada en testnet con los defaults: `3 NEAR / 0.006 NEAR ≈ 500`
mints en total, repartidos en un máximo de 60 por día. Además, `/rewards/claim`
limita a 5 pedidos por minuto y 50 por día por cuenta, y 10 por minuto por IP.
Cuando se agota el presupuesto o el cupo diario, `GET /rewards/status` devuelve
`rewardMintAvailable: false` con `reason: "budget"` y el claim responde `503`
(`REWARD_MINT_UNAVAILABLE`).

## Verificación

```bash
bunx tsc --noEmit
bun test
```

Los tests de `tests/stats.test.ts` usan `nearbox_test` (o `MONGODB_URI_TEST`) y
se omiten si no hay MongoDB local disponible.

Smoke test end-to-end (con el servidor en `PORT=4000`):

```bash
cd backend && PORT=4000 bun src/index.ts
# en otra terminal
bun run /tmp/opencode/smoke-ws.ts
```

Comprueba `welcome`, historial de chat, rollos, coches, cambio de skin, entrada
y salida de `minigame-2`…`minigame-7`, snapshots de cada motor, telemetría de
coche, `race-positions` y `pong`.
