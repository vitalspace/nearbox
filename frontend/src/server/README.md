# Server rooms (`frontend/src/server`) — GameRoom port

> **Estado: inactivo y copia de referencia.** El motor que corre el juego es
> **`backend/src/`** (Bun/Elysia). Cualquier cambio de gameplay debe hacerse
> **primero en `backend/src/`** y después replicarse aquí para que los scripts
> `verify-waves-*` / `verify-deathmatch-*` prueben el mismo código. Cambiar
> solo esta copia **no afecta a la partida**.
>
> El backend activo es Bun/Elysia (`backend/`) y el cliente
> (`src/lib/services/lobbySocket.ts`) usa WebSocket nativa. Este paquete se
> conserva como referencia y para los scripts de verificación. Para reactivar
> el despliegue de rooms hace falta compilar con `RUN_ROOMS=1` (ver
> `vite.config.ts` y `scripts/postbuild-relative-paths.mjs`).

Port of the Elysia WebSocket backend (`../../backend`, que sigue intacto) al RUN.world **Multiplayer
API (BETA)**. Same game logic, different host: the code now runs inside the
platform's room server instead of a VPS with `ws://…/ws`.

Why: the game iframe can only reach its own origin and Google Fonts — an
external backend is blocked by the sandbox. Rooms are the supported way to run
server-authoritative TypeScript.

## Layout

```
frontend/
├── rundot/rooms.config.json      # room type → source file (se sube con el build)
├── src/server/                   # <- este paquete (antes backend2/src)
│   ├── protocol.ts               # wire types (no zod)
│   ├── validate.ts               # runtime validation (replaces the zod schemas)
│   ├── port.ts                   # RoomPort: what an engine may call on its room
│   ├── budget.ts                 # 16 KiB frame guard (warns, never drops)
│   ├── engines/
│   │   ├── presence.ts           # roster of the hub
│   │   ├── chat.ts               # `/me` and `/help` (normal chat is platform)
│   │   ├── paperRolls.ts         # throws
│   │   ├── cars.ts               # 3 outdoor cars
│   │   ├── minigame2.ts          # crypt / skulls / mummies
│   │   ├── race.ts               # Gran Premio
│   │   ├── waves.ts              # Barn Siege (`minigame-5`)
│   │   ├── deathmatch.ts         # Witch House Deathmatch (`minigame-6`)
│   │   └── parkour.ts            # Parkour Spire (`minigame-7`)
│   └── rooms/
│       ├── LobbyRoom.ts          # singleton `lobby`
│       ├── CryptRoom.ts          # `crypt`
│       ├── RaceRoom.ts           # `race` / `roadmap`
│       ├── WavesRoom.ts          # `waves`
│       ├── DeathmatchRoom.ts     # `deathmatch`
│       └── ParkourRoom.ts        # `parkour`
└── scripts/postbuild-relative-paths.mjs   # copia .build/static → dist
```

## Mapping from the old backend

| Old (`backend/src`)                             | Now                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------- |
| `new Elysia().ws('/ws')`                        | `GameRoom` subclasses registered in `rundot/rooms.config.json`                  |
| topic `lobby:global`                            | room `lobby` (`singleton: true`)                                                |
| topic `lobby:minigame-2`                        | room `crypt`                                                                    |
| topic `lobby:minigame-3`                        | room `race`                                                                     |
| `app.server.publish(TOPIC, json)`               | `this.broadcast(...)`                                                           |
| `ws.send(json)`                                 | `this.sendTo(playerId, ...)`                                                    |
| `ws.subscribe/unsubscribe`                      | room membership (automatic)                                                     |
| `ws.id` (socket id)                             | `player.id` (RUN profileId)                                                     |
| `addPlayer` / `removePlayer`                    | `onPlayerJoin` / `onPlayerLeave`                                                |
| `setInterval(tick, 100)` × 4                    | `this.clock.setInterval(name, cb, 100)` per room                                |
| `lobbySocket.ts` backoff + join timeout         | SDK reconnect (`reconnectTimeout`, `onEnded`)                                   |
| `chat.ts` (history, `/me`, `/help`, rate limit) | plain text → platform room chat; commands → `Emotes` (`emote`, `emote-history`) |
| `moveToGlobal()`                                | `{ type: 'go-lobby' }` message; the client leaves the room                      |
| module-level state                              | one engine instance per room (no cross-room leaks)                              |

## Room behaviour

### `lobby` (singleton, maxPlayers 32)

The hub. Owns presence, paper rolls, hero animation/position relays and the
three cars. Everyone is a member while on the outdoor map, including players who
are inside the crypt or the race: they keep their lobby membership so the hub
keeps showing them in the right `lobbyId`. Presence is therefore unchanged from
the old single-socket model.

Internally:

- `cars` clock: 100 ms (`cars.tick`) — respawns, and the 10 Hz state push while
  somebody is driving.
- `rolls` clock: 500 ms — expiry of thrown rolls.

### `crypt` (maxPlayers 8)

Clock at 100 ms (`crypt.tick`): phase timers, mummies, pickups, respawns,
`mg2-positions` at 10 Hz and `mg2-state` at 1 Hz.

### `race` (maxPlayers 6)

Clock at 100 ms: phases, gates/laps, items/powers, missiles, mines, respawns,
`race-positions` at 10 Hz and `race-state` at 1 Hz.

### `parkour` (maxPlayers 12)

Clock at 100 ms (`parkour.tick`): `idle → countdown (30 s, 10 s if 12/12) →
playing (10 min max) → results (15 s)`. Owns the 12 sequential checkpoints,
fall detection and respawn (1 s delay, 1.5 s spawn protection), the six fixed
wardens (rock/acid/fire/shove, no damage) and the finish/podium order.
Broadcasts `mg7-state` at 250 ms when something changed and `mg7-positions` at
10 Hz. Reconnection is allowed for 20 s: the player returns to their last
checkpoint with their fall count intact. When the room empties, it resets to
`idle` and clears players, attacks, projectiles and timers.

## Changes the client must make

`frontend/src/lib/services/lobbySocket.ts` no longer opens a socket: it joins
the `lobby` room with `RundotGameAPI.realtime.joinOrCreateRoom('lobby')`, joins
`crypt` / `race` on `enterLobby()`, and maps the room events back onto the same
callbacks the app already used (`onWelcome`, `onPresence`, `onChat`,
`onMg2State`, `onRaceState`, …). Reconnection is the SDK's job; the class keeps
`status`, `attempt` and `retryNow()` so the existing overlay still works.

Known gap: `set-lobby` tracks presence, but the display name is the platform
`player.username`. The local alias from `playerProfile` no longer reaches the
server, so the name edited in the profile screen does not rename the player in
the hub.

Message deltas:

| Removed | Why |
| --- | --- | | `join` (client) | Identity comes from the room; there is no join message |
| `welcome` (server) | Replaced by `hello`, which carries `self` + presence |
| `chat`, `chat-history` (plain text) | Platform room chat: `room.on({ onChat, onChatHistory })`, `room.sendChat(text)`, `room.fetchChatHistory(limit)` |
| `enter-lobby`, `leave-lobby` | Replaced by `joinOrCreateRoom('crypt' \| 'race')` / `room.leave()`, plus `set-lobby` to keep presence right |

| Added | Meaning |
| --- | --- | | `hello` (server) | The joining player's own record + presence |
| `emote` (client) | `/me <action>` and `/help`; plain text is refused with `USE_ROOM_CHAT`. `/anim <name\|number>` is handled by the client (it needs the equipped skin's clips). |
| `emote` / `emote-history` (server) | Command output and its backlog (last 20) |
| `set-lobby` (client) | Tells the hub which mini lobby the player moved to (presence only) |
| `go-lobby` (server) | The room wants the client out: call `room.leave()` and go back to the hub |

Everything else (`mg2-*`, `player-*`, `car-*`, `race-*`, `throw-roll`, `ping`)
keeps its type name and payload shape.

## Behaviour deltas

Places where the port is not a literal copy. All of them come from rooms owning
what the old single socket used to own.

- **Cars.** Entering a mini lobby from the hub releases the car, triggered by
  `set-lobby` (the old backend did it in the `enter-lobby` handler).
- **Race admission.** Joining a full or already-started race is refused with a
  join rejection (`reason` string) instead of an `error` message with
  `RACE_FULL` / `RACE_IN_PROGRESS`, because the room decides admission.
- **No join timeout.** The old 10 s `JOIN_TIMEOUT` + `close(4001)` is gone: only
  joined members ever reach a room.
- **No lobby-move errors.** `ALREADY_IN_LOBBY` / `NOT_IN_LOBBY` / `INVALID_LOBBY`
  disappear with `set-lobby`, which is idempotent and accepts `global`.
- **Identity.** `sanitizeName` is gone: the display name is the platform
  `player.username` (no 24-char truncation, no `Player-XXXX` fallback).
- **Round end.** `endRound` / `endRace` delete the engine state first and then
  ask the client to leave (`go-lobby`); the old backend moved the player itself.
  A client that ignores the message is kicked 1.5 s later, so a finished room
  cannot keep a ghost seat forever.
- **Frame budget.** Every room checks what it broadcasts against the 16 KiB cap
  and logs `broadcast exceeds the 16 KiB frame cap` (once per message type per
  10 s). It never drops or rewrites a message.

## Build & deploy

Everything ships in **one** `rundot deploy`: the game bundle plus the room code.
There is no separate upload for the server.

```bash
cd frontend
npm run build        # vite build → .build/static (site)
                     # plugin closeBundle → dist/server-bundle.js, dist/rooms.config.json
                     # postbuild → copia .build/static a dist sin borrar esos dos
rundot deploy        # privado
rundot deploy --public
```

Two traps this setup works around:

- **`adapter-static` wipes its own output dir** while adapting, and adapting runs
  _after_ the plugin's `closeBundle`. Pointed at `dist`, it deleted
  `server-bundle.js` and `rooms.config.json` and the build still exited 0. The
  site is generated in `.build/static` and copied by
  `scripts/postbuild-relative-paths.mjs`, which preserves both artifacts and
  **fails the build** if they are missing.
- **`esbuild` is not declared by the SDK** (its `vite` plugin imports it, it is
  not in `dependencies` or `peerDependencies`). It is a devDependency of this
  package; without it `vite build` dies with
  `Cannot find package 'esbuild' imported from …/vite/index.js`.

SvelteKit also prints `transform_index_html_unsupported` for `rundot-multiplayer`:
its dev-only `window.__RUNDOT_MULTIPLAYER_DEV_SERVER__` injection is skipped. That
only affects local `npm run dev` room discovery, not the deployed build.

## Limits that shaped this port

| Limit                             | Value                 | Consequence                                                                                  |
| --------------------------------- | --------------------- | -------------------------------------------------------------------------------------------- |
| Server bundle                     | 5 MB                  | ~3.6k lines, no zod in the hot path; well under                                              |
| WS frame                          | 16 KiB                | `race-positions` ≈ 1.5 KiB at 6 pilots; measured to stay far below                           |
| Room `maxPlayers`                 | configured per room   | 32 / 8 / 6; the race grid is 6 meshes by design                                              |
| Timers pause when a room is empty | —                     | all logic uses absolute `Date.now()` timestamps (`respawnAt`, `endsAt`), never tick counting |
| `type` field is the message type  | —                     | nested payloads never use `type` for anything else                                           |
| Node-only APIs                    | absent in the sandbox | no `fs`, no `ws`, no `Bun.*`; `crypto.randomUUID` is gone with `chat.ts`                     |

## Client wiring

```ts
import RundotGameAPI from '@series-inc/rundot-game-sdk/api';

const lobby = await RundotGameAPI.realtime.joinOrCreateRoom('lobby');
const crypt = await RundotGameAPI.realtime.joinOrCreateRoom('crypt'); // on enter
```

`rundotMultiplayerPlugin()` must be in `frontend/vite.config.ts` (both serve and
build) and `rundot/rooms.config.json` must be committed next to the build.

## Not ported

- **Normal chat.** Platform room chat owns it: history, per-sender rate limit
  and fan-out. `/me` and `/help` stay in the room (`engines/chat.ts`) because the
  platform does not parse commands; plain text sent to the room is refused with
  `USE_ROOM_CHAT`.
- **The HTTP side of Elysia.** There was only `GET /` → `Hello Elysia`.
- **zod.** Validation is hand-written in `validate.ts`; dropping it keeps the
  server bundle small and avoids a second parse of an already-decoded payload.

## Verify

```bash
cd frontend
npm run build   # dist/ + dist/server-bundle.js + dist/rooms.config.json
npm run check   # svelte-check, incluye src/server
```
