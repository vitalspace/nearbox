---
id: SPEC-025
titulo: "Minijuego 5: Witch House Deathmatch — deathmatch por equipos en la aldea de Barn Siege"
estado: implementado
prioridad: alta
creado: 2026-11-05
actualizado: 2026-11-13
responsable: opencode
etiquetas:
  [
    minijuego,
    multijugador,
    deathmatch,
    equipos,
    tdm,
    pvp,
    websocket,
    rooms,
    svelte,
    threlte,
    rapier,
    armas,
    pickups,
    granadas,
    barnsiege,
    bruja,
    checkpoint,
    servidor-autoritativo,
    minigame-6,
  ]
depende_de: [SPEC-005, SPEC-009, SPEC-012, SPEC-014, SPEC-018, SPEC-020, SPEC-023, SPEC-024]
bloquea: []
estimacion: "26h"
---

# SPEC-025 — Minijuego 5: Witch House Deathmatch (deathmatch por equipos)

> **Nombre vs. id técnico**: este es el **quinto minijuego jugable**
> (después de las llaves, la cripta, el Grand Prix y Barn Siege), pero usa el
> lobby **`minigame-6`** porque `minigame-4` es Roadmap y `minigame-5` es
> Barn Siege. Igual que `SPEC-023` (“Minijuego 4”) usa `minigame-5`.
>
> El nombre visible es **Witch House Deathmatch** (la room de RUN.world sigue
> llamándose `deathmatch` y el prefijo de tipos/mensajes es `Mg6*`/`mg6-*`).
> `Hexfire` se conserva solo como nombre antiguo en el changelog.

## 1. Contexto

El proyecto ya tiene:

- El mapa `frontend/static/barnsiege.glb` y toda su arena medida y validada en
  `SPEC-023`: aldea amurallada, prefijo `BS_*`, suelo a `y = 0.5`, polígono de
  contención de 16 vértices (±56.5 m, ≈ 9 772 m²), físicas `chunked` con 68
  celdas y 80 644 triángulos.
- La arquitectura multijugador de RUN.world: rooms y engines autoritativos en
  `frontend/src/server/rooms/` y `frontend/src/server/engines/`. No se toca
  `backend/` (deprecado por `SPEC-020`).
- El patrón de entrada por checkpoint físico + tecla `E`, salida con
  `go-lobby` y teletransporte al punto de entrada (`SPEC-005`, `SPEC-023`).
- El combate del asedio (`SPEC-023`): pistola inicial, escopeta, subfusil,
  rifle, granadas, inventario de 4 ranuras, pickups por proximidad, daño
  hitscan autoritativo, trazadoras, fogonazos, explosiones y controles táctiles.
- El jugador y las skins existentes (`Hero.glb`, `SkinCharacter`). Los
  modelos de las armas y pickups ya están en `frontend/static/`: las cuatro
  básicas en `weapons/` (`pistol.glb`, `shotgun.glb`, `mp5.glb`,
  `sniper_rifle.glb`) y los kits/consumibles en `props/` (`ammo_kit.glb`,
  `med_kit.glb`, `grenade.glb`). No hay que modelar nada nuevo.
- Las salas actuales: `minigame-2` → `crypt`, `minigame-3` → `race`,
  `minigame-4` → `roadmap`, `minigame-5` → `waves`. **`minigame-6` está
  libre**, así que este modo usa `minigame-6` y una room nueva
  `deathmatch` (no singleton, `maxPlayers: 12`).

### Checkpoint nuevo: puerta del área 1 (casa de la bruja)

El checkpoint se coloca en el mapa global `map.glb`, en la puerta de la
**casa de la bruja** del área 1. La casa está en el grupo `WitchHouse` con
origen `(-33.05, 0.40, -33.05)`; el porche (`WHH_Porch`) termina en
`z ≈ -23.55` y el camino (`WHH_Path`) arranca en `z ≈ -23.90`. Punto medido:

| Dato | Valor |
| --- | --- |
| Checkpoint / `DM_EXIT` / `DM_ENTRY` | `(-33.01, 0.40, -22.90)` |
| Radio | `2.0 m` |
| Nombre visible | `Witch House Deathmatch` |
| Color | `#a855f7` |
| Orientación | Delante de la puerta, sobre el inicio del camino |

Al entrar se carga **solo** `barnsiege.glb`; al salir se vuelve a ese mismo
punto, igual que hace `minigame-5` con el granero.

### Arena reutilizada de `SPEC-023`

No se crea ni se modifica el mapa. Se reutilizan:

- `ARENA_POLYGON` y `BUILDING_BLOCKS` de
  `frontend/src/lib/state/wavesConfig.ts`.
- `frontend/world/barnsiege.physics.json` y el componente generado
  `frontend/src/lib/components/world/Barnsiege.svelte`.
- La escena `barnsiege` de `sceneState.svelte.ts`.
- Los nueve puntos de referencia de la aldea: plaza central, granero, silo,
  ruina de la casa, calabaza gigante, lago, pozo, carro y los seis puntos de
  aparición del perímetro interior ya validados por `waves:check`.

## 2. Objetivo

Crear **Witch House Deathmatch**, un deathmatch por equipos para hasta
**12 jugadores** (6 vs 6) dentro de la aldea de `barnsiege.glb`. Al entrar por
el checkpoint de la casa de la bruja, los jugadores se reparten automáticamente
en dos equipos balanceados, esperan **30 segundos** de cuenta atrás en spawns
separados y juegan **6 minutos**. La cuenta atrás solo arranca cuando hay
**2 jugadores**; con uno solo se muestra `Waiting for players` y un botón para
salir. Se puede **entrar a mitad de partida** (al equipo con menos jugadores).
Gana el equipo con más bajas al agotarse el tiempo; si empatan, **Draw**. Hay
armas recogibles repartidas por el mapa, el HUD muestra **siempre** el timer y
las bajas de cada equipo, y todo el estado es autoritativo del servidor.

## 3. Alcance

**Incluye**

- Lobby **`minigame-6`** (`Witch House Deathmatch`) y room de RUN.world
  **`deathmatch`** (`maxPlayers: 12`, `allowReconnect: true`,
  `reconnectTimeout: 20`, `idleTimeout: 120`), no singleton.
- Checkpoint físico en la puerta del área 1 (`WitchHouse`), en
  `(-33.01, 0.40, -22.90)`, radio 2, entrada y salida con `E`.
- Reutilización del mapa `barnsiege.glb`, sus físicas `chunked`, su polígono
  de contención y sus obstáculos. Sin GLB nuevos ni cambios de modelado: solo
  se cargan los modelos ya existentes de armas y kits.
- Dos equipos: **Coven** (`#a855f7`) y **Hunters** (`#22d3ee`), hasta 6 por
  equipo.
- Asignación automática de equipo al entrar, con **balanceo continuo**
  mientras la partida está en `idle`/`countdown`: nunca puede haber más de
  un jugador de diferencia entre equipos.
- Dos zonas de aparición separadas **≈ 91 m**: Coven al suroeste
  (`(-40, 0.55, -24)`) y Hunters al noreste (`(40, 0.55, 20)`), con 6 slots
  cada una (rejilla 3 × 2).
- Máquina de estados:
  `idle → countdown (30 s) → playing (6 min) → results (15 s) → idle`.
- Victoria del equipo con más bajas a los 6 minutos; empate si ambos equipos
  terminan con las mismas.
- Respawn a los **3 s** en un slot **aleatorio y seguro** de la zona del
  equipo (nunca en el punto de muerte), con **5 s de protección** de aparición
  que se cancela al disparar o lanzar una granada.
- Armas fijas repartidas por el mapa con reaparición temporizada: escopeta,
  subfusil, rifle, granadas, munición y botiquín. Inventario de 4 ranuras y
  pickups automáticos por proximidad, reutilizando las armas de `SPEC-023` con
  sus modelos GLB de `frontend/static/weapons/` y `frontend/static/props/`.
- Combate PvP autoritativo: disparo hitscan, perdigones de escopeta, granadas
  con explosión y daño en área. **Sin daño amigo**; la única excepción al daño
  amigo es que la **propia granada daña al lanzador** si está en el radio.
- HUD permanente con timer y marcador de equipos; killfeed; indicador de HP,
  arma, munición, granadas y protección.
- Panel lateral derecho con el **top 5 de bajas** (jugadores), visible a mitad
  de pantalla a la derecha y con un **botón para ocultarlo/mostrarlo**, igual
  que el panel del chat.
- Overlays de espera/cuenta atrás, respawn, resultados y vuelta automática a
  `global` con `go-lobby`.
- Sincronización a 10 Hz para posiciones y 1 Hz/cambios para snapshots;
  interpolación de jugadores remotos en el cliente.
- Scripts de verificación `dm:check`, `dm:balance` y `dm:match`.
- Audio reutilizando el sistema procedural de `SPEC-024` para disparos,
  impactos, granadas, pickups, kills y fin de partida (sin assets nuevos).
- Recompensa al ganar: si el equipo local termina con más bajas que el rival,
  se registra `hexfire-first-win` en `rw:missions:v1` y se desbloquea la skin
  `demon` (`Demon.glb`). El empate y la derrota no dan la skin.

**No incluye**

- Monstruos, oleadas, IA, ácido, rocas, coche calabaza ni PvE. Hexfire es
  exclusivamente PvP.
- Vehículos de ningún tipo.
- Cambios a `barnsiege.glb`, a su componente generado o a sus físicas.
- Cambios a `wavesConfig.ts` salvo los imports de solo lectura; no se altera
  el comportamiento de `minigame-5`.
- Cambios a la cripta, la carrera, el roadmap, el hub, las misiones de gatos,
  los rollos de papel ni los coches libres.
- Daño amigo, revivir con compañeros, clases, habilidades, ultimate, killcam
  ni espectador.
- Headshots o multiplicadores por parte del cuerpo (el daño es plano).
- Récords persistentes, leaderboard global, rangos o XP. Solo se persiste el
  desbloqueo de la skin `demon` al ganar una partida.
- Cambios de cámara: se mantiene la tercera persona y la asistencia de
  puntería ya usada en `SPEC-023`.
- Cambios en `backend/`.

## 4. Requisitos

### Funcionales

| ID | Requisito | Prioridad |
| --- | --- | --- |
| RF-1 | Checkpoint `Witch House Deathmatch` en `(-33.01, 0.40, -22.90)`, delante de la puerta del área 1 (`WitchHouse`), radio 2, color `#a855f7`; `E` entra a la room `deathmatch` con `minigame-6`. | alta |
| RF-2 | Hasta 12 jugadores (6 por equipo). Entrada rechazada con `DM_FULL` si no hay hueco. Se **permite entrar a mitad de partida**, asignando al equipo con menos jugadores (nunca se rechaza con `DM_IN_PROGRESS`). | alta |
| RF-3 | La cuenta atrás dura 30 s y **solo arranca con 2 jugadores**. No se reinicia cuando entra otro jugador. Con 1 jugador, `phase = 'countdown'` con `waitingForPlayers = true` y el botón de salir. | alta |
| RF-4 | Asignación automática de equipo: siempre al equipo con menos jugadores; si están empatados, alternancia (`Coven`/`Hunters`). Ningún jugador puede quedar sin equipo ni en los dos. | alta |
| RF-5 | `rebalanceTeams()` en `idle`/`countdown`: si la diferencia es mayor que 1, mueve al jugador más reciente del equipo grande al pequeño y actualiza su spawn. En `playing` no se mueve a nadie. | alta |
| RF-6 | Movimiento y combate bloqueados durante `countdown` y `results`; la cámara puede mirar. Al terminar la cuenta atrás, `playing`. | alta |
| RF-7 | La partida dura exactamente 360 000 ms desde el inicio de `playing`; no hay prórroga. | alta |
| RF-8 | Al agotarse el tiempo, gana el equipo con más bajas; si hay empate, `winner = 'draw'`. Se pasa a `results` 15 s. | alta |
| RF-9 | Dos zonas de aparición separadas: Coven `(-40, 0.55, -24)` y Hunters `(40, 0.55, 20)`, con 6 slots cada una y separación entre anclas ≈ 91 m. | alta |
| RF-10 | Al aparecer o reaparecer, el servidor elige el slot del equipo más alejado del enemigo vivo más cercano. | alta |
| RF-11 | Respawn 3 s después de morir, en la zona del equipo, con 100 HP, pistola, 60 de munición universal y 1 granada. El inventario de armas se pierde al morir. | alta |
| RF-12 | Protección de aparición de 5 s: no recibe daño; se cancela al disparar o lanzar una granada. | alta |
| RF-13 | Armas en el mapa con reaparición: escopeta 20 s, subfusil 18 s, rifle 30 s, granadas 15 s, munición 12 s, botiquín 25 s. | alta |
| RF-14 | Pickup automático a ≤ 1.6 m: el arma llena su ranura y se equipa; si ya se tiene, recarga el cargador y da +30 de munición universal; granada +2 (máx. 6); munición +50; botiquín +40 HP (máx. 100). | alta |
| RF-15 | Inventario de 4 ranuras (1 pistola, 2 escopeta, 3 subfusil, 4 rifle), con cargador propio por arma y reserva universal compartida; `1`–`4` o clic/toque en el HUD equipan. | alta |
| RF-16 | Pistola inicial: 12 de daño, 6 disparos/s, 55 m, cargador 12, reserva infinita; recarga con `R`. | alta |
| RF-17 | Escopeta 8 × 6 de daño (dispersión ±7°), subfusil 9, rifle 46. Cadencia, alcance y cargadores idénticos a `SPEC-023`. | alta |
| RF-18 | Granada con `G`: espoleta 1.5 s o impacto con el suelo; 75 de daño en 4.5 m con caída lineal. Daña a enemigos **y al propio lanzador si está dentro del radio**; nunca a compañeros. | alta |
| RF-19 | Disparo hitscan autoritativo, con validación de fase, arma en mano, cargador, cadencia, origen ≤ 2 m del último reporte, alcance y línea de visión contra `BUILDING_BLOCKS`. La escopeta usa 8 perdigones deterministas por disparo. | alta |
| RF-20 | Asistencia de puntería: el cliente busca al enemigo bajo el punto de mira (radio 1.4 m horizontal) y manda `targetId`; el servidor lo acepta solo si sigue vivo, es enemigo, está delante y dentro del cono. | alta |
| RF-21 | Sin daño amigo: disparos y granadas de un equipo no restan HP a sus compañeros. **Excepción**: la granada propia sí daña al lanzador si está en el radio. | alta |
| RF-22 | Muerte a 0 HP: `player.kills++` al atacante, `victim.deaths++`, `teamScores[attackerTeam]++`, evento `kill` con arma y equipos, killfeed y respawn a los 3 s. | alta |
| RF-23 | HUD permanente: timer `m:ss` (30 s en countdown, 6:00 → 0:00 en playing), marcador `Coven N — N Hunters`, HP, arma/munición, granadas, protección y estado de respawn. | alta |
| RF-24 | Panel lateral derecho con el **top 5 de bajas** (kills, deaths, equipo) visible durante la partida; botón para ocultar/mostrar, persistente como el del chat. No hay scoreboard modal con `Tab`. | alta |
| RF-25 | Overlays: espera (`Waiting for players`), countdown (`3… 2… 1`), respawn (`Respawning in 3…`), resultados (`Victory`, `Defeat`, `Draw`, MVP, botón `Back to the witch house`) y auto-salida a 15 s. | alta |
| RF-26 | Al terminar, todos vuelven a `global` con `go-lobby` y teletransporte a `DM_EXIT` (`-33.01, 0.40, -22.90`). | alta |
| RF-27 | Si la sala se vacía en cualquier fase, vuelve a `idle` y limpia equipos, scores, pickups, proyectiles y respawns. | alta |
| RF-28 | Reconexión estándar (`allowReconnect`, 20 s): el jugador vuelve a su mismo equipo y conserva kills/deaths; si la partida está en `playing`, reaparece a los 3 s con protección. | media |
| RF-29 | Cliente: posiciones de jugadores remotos interpoladas a 10 Hz, skins reales con color/equipo, disparos remotos visibles (`shot-fired`) y granadas interpoladas. | alta |
| RF-30 | `dm:check`, `dm:balance` y `dm:match` deben pasar; `check`, `lint`, `build`, `barnsiege:check` y `map:check` también. | media |
| RF-31 | El checkpoint de Hexfire no aparece dentro de la arena; el resto de checkpoints, el chat, los rollos y los minijuegos existentes siguen igual. | alta |
| RF-32 | Al pasar de `playing` a `results`, si el equipo del jugador local es el ganador (`winner === self.team`), se registra `hexfire-first-win` en `rw:missions:v1` y se desbloquea la skin `demon`; empates, derrotas y entradas tardías en `results` no la conceden. | alta |

### No funcionales

| ID | Requisito | Criterio |
| --- | --- | --- |
| RNF-1 | Servidor autoritativo | El cliente solo envía posición, disparo, granada, recarga y equipar. El servidor decide equipos, daño, bajas, respawns, pickups y resultado. |
| RNF-2 | Tráfico | `mg6-positions` cada 100 ms, redondeado a 2 decimales; ≤ 16 KiB por frame con 12 jugadores. `ByteBudget` avisa si se supera. |
| RNF-3 | Rendimiento | 60 FPS en hardware medio con 12 jugadores, 13 pickups y granadas activas. Sin monstruos ni IA. |
| RNF-4 | Determinismo | Dos clientes ven el mismo timer, equipos, scores, pickups, bajas y resultado. |
| RNF-5 | Sin fugas | Entrar/salir 10 veces no deja cuerpos, controladores, listeners ni timers residuales. |
| RNF-6 | Arena portable | Toda la geometría de Hexfire vive en `dmConfig.ts`; el mapa se reutiliza de `SPEC-023`. |
| RNF-7 | Balance | En `idle`/`countdown`, `abs(coven − hunters) ≤ 1`. En `playing` no hay cambios automáticos de equipo. |
| RNF-8 | Reloj | Timer basado en `serverTime`/`endsAt`; el cliente no puede adelantar ni retrasar la partida. |

## 5. Criterios de aceptación

- [ ] CA-1: El checkpoint `Witch House Deathmatch` aparece delante de la puerta del área 1 y `E` abre la room `deathmatch` con 1 jugador en espera.
- [ ] CA-2: Con 2 navegadores, uno entra a `Coven` y otro a `Hunters`; con 3, el tercero cae en el equipo con menos jugadores (2 vs 1).
- [ ] CA-3: Con 11 jugadores, los equipos quedan 6 vs 5 o 5 vs 6; nunca 7 vs 4 ni todos en el mismo equipo.
- [ ] CA-4: Un jugador que entra y sale repetidamente durante la espera/cuenta atrás no rompe el balance; el rebalanceo mueve al más reciente y emite `team-changed`.
- [ ] CA-5: La cuenta atrás dura 30 s, solo arranca con 2 jugadores, no se reinicia al entrar más jugadores y al llegar a 0 empieza `playing` con todos en sus spawns. Con 1 jugador se ve `Waiting for players` y el botón de salir.
- [ ] CA-6: Durante `countdown` el jugador no se mueve ni puede disparar; la cámara sí gira.
- [ ] CA-7: Coven aparece en `(-40, 0.55, -24)` y Hunters en `(40, 0.55, 20)`; la distancia entre anclas es ≈ 91 m y ningún spawn queda dentro de un edificio.
- [ ] CA-8: Las armas del mapa se ven, se recogen al pasar por encima y reaparecen tras su cooldown; el HUD actualiza arma, cargador y reserva.
- [ ] CA-9: La escopeta, el subfusil y el rifle gastan munición universal; `R` recarga; `1`–`4` cambian de ranura sin perder las demás.
- [ ] CA-10: Un disparo a un enemigo resta HP; a un compañero no le hace nada. Una granada enemiga daña; una propia solo daña al lanzador si está en el radio; una de compañero no hace nada.
- [ ] CA-11: Al morir, el atacante recibe +1 kill, su equipo +1 y la víctima +1 death; el killfeed lo muestra.
- [ ] CA-12: El jugador muerto ve `Respawning in 3…` y reaparece en un slot aleatorio seguro de su equipo (nunca donde murió) con 100 HP, pistola y 5 s de protección.
- [ ] CA-13: Durante la protección no recibe daño; al disparar, la protección desaparece inmediatamente.
- [ ] CA-14: El timer se ve siempre: `0:30` en countdown, `6:00` al empezar y baja hasta `0:00`; el marcador de equipos se actualiza en tiempo real.
- [ ] CA-15: Al llegar a 0:00 gana el equipo con más kills; si empatan, se muestra `Draw`. `results` dura 15 s.
- [ ] CA-16: En `results`, el botón `Back to the witch house` y el auto-salto a los 15 s devuelven a `global` en `(-33.01, 0.40, -22.90)`.
- [ ] CA-17: Entrar durante `playing` **se permite**: el jugador entra al equipo con menos jugadores, aparece con pistola y 5 s de protección, y no se rebalancea a nadie más.
- [ ] CA-18: Si un jugador se desconecta en `playing`, su equipo conserva el score y no se rebalancea a nadie; al reconectar vuelve a su equipo.
- [ ] CA-19: Dos navegadores ven el mismo timer, scores, jugadores, pickups, granadas y resultado.
- [ ] CA-20: Los remotos se mueven interpolados y sus disparos se ven desde el arma; no hay saltos a 10 Hz.
- [ ] CA-20b: El panel derecho con el top 5 de bajas se ve durante la partida y el botón lo oculta/muestra igual que el panel del chat.
- [x] CA-21: `dm:check`, `dm:balance`, `dm:match`, `check`, `lint`, `build`, `barnsiege:check` y `map:check` pasan en verde.
- [ ] CA-22: Entrar/salir 10 veces y reconectar no deja cuerpos, controladores, listeners ni errores en consola.
- [ ] CA-23: El mapa `barnsiege.glb` se renderiza solo con `sceneState.active === 'barnsiege'`; no se carga `map.glb` dentro de la partida.
- [ ] CA-24: El resto de checkpoints y minijuegos siguen funcionando; Hexfire no interfiere con `minigame-5`.

## 6. Archivos relevantes

| Ruta | Acción | Motivo |
| --- | --- | --- |
| `frontend/src/server/protocol.ts` | modificar | `LOBBY_IDS`, `MINIGAME_LOBBY_IDS`, `LOBBY_DEFINITIONS` con `minigame-6`; tipos `Mg6*`; unión de mensajes y `CLIENT_MESSAGE_TYPES`. |
| `frontend/src/server/validate.ts` | modificar | Esquemas de `mg6-position`, `mg6-shoot`, `mg6-throw`, `mg6-reload` y `mg6-equip`. |
| `frontend/src/server/engines/deathmatch.ts` | crear | Motor autoritativo: fases, equipos, balanceo, spawns, armas, pickups, daño, kills, respawns, timer y resultado. |
| `frontend/src/server/engines/combat.ts` | crear | Helpers compartidos de combate: contención al polígono, hitscan contra jugadores, dispersión, granadas y pickups. Reutilizable por `deathmatch.ts`. |
| `frontend/src/server/rooms/DeathmatchRoom.ts` | crear | Room `deathmatch`: ciclo de vida, mensajes, `tick` a 100 ms y `go-lobby` al terminar. |
| `frontend/rundot/rooms.config.json` | modificar | Alta de la room `deathmatch` (`maxPlayers: 12`, `allowReconnect: true`, `reconnectTimeout: 20`, `idleTimeout: 120`). |
| `frontend/src/lib/services/protocol.ts` | modificar | Duplicar tipos `Mg6*` y guards; ampliar `ClientMessage`, `ServerMessage`, `isServerMessage`, `LOBBY_IDS`, `MINIGAME_LOBBY_IDS`, `LOBBY_DEFINITIONS`. |
| `frontend/src/lib/services/lobbySocket.ts` | modificar | `ROOM_TYPE_BY_LOBBY['minigame-6'] = 'deathmatch'`; callbacks `onMg6State/onMg6Positions/onMg6Event`; senders `sendMg6*`; dispatch. |
| `frontend/src/lib/state/lobby.svelte.ts` | modificar | Wiring de callbacks/senders, reset de `minigame6`, `isDeathmatchLobbyId`, `exitRequest` a `DM_EXIT`. |
| `frontend/src/lib/state/checkpoints.svelte.ts` | modificar | Checkpoint `minigame-6` `Hexfire` en `(-33.01, 0.40, -22.90)`, `#a855f7`, radio 2. |
| `frontend/src/lib/state/playerState.ts` | modificar | `DM_ENTRY` / `DM_EXIT` (`-33.01, 0.40, -22.90`) y `inDeathmatch` en `playerRuntime`. |
| `frontend/src/lib/state/dmConfig.ts` | crear | **Único sitio** con constantes del modo: equipos, colores, spawns, timer, respawn, protección, pickups, puntos de mapa. Importa la arena y las armas de `wavesConfig.ts`. Marcado `// DEPENDE DEL MAPA — re-medir al cambiar barnsiege.glb`. |
| `frontend/src/lib/state/minigame6.svelte.ts` | crear | Store reactivo: snapshot, posiciones interpoladas, jugador local, killfeed, `respawnRequest`, `exitRequest`, acciones y `reset()`. |
| `frontend/src/lib/missions/minigames.ts` | crear | Misión `hexfire-first-win` (título y descripción) del registro local. |
| `frontend/src/lib/state/missions.svelte.ts` | modificar | Persistencia genérica de victorias de minijuego y `completeMinigameMission()`. |
| `frontend/src/lib/cosmetics/skins.ts` | modificar | `demon.unlockMissionId = 'hexfire-first-win'`. |
| `frontend/src/lib/state/dmEffects.svelte.ts` | crear | Efectos de presentación PvP: trazadoras, fogonazos, chispas, marcas de granada y último impacto. Misma API que `waveEffects`, sin tocar la room de oleadas. |
| `frontend/src/lib/state/dmInput.ts` | crear | Estado de entrada de combate (fire/grenade/reload/equip/scoreboard) separado de `playerInput` y de `waveInput`. |
| `frontend/src/lib/state/sceneState.svelte.ts` | modificar | `minigame-6` → `active === 'barnsiege'`; getter `inDeathmatch`; `inBarnsiege` sigue siendo válido para ambos. |
| `frontend/src/lib/Scene.svelte` | modificar | Montar los componentes de Hexfire cuando `sceneState.inDeathmatch`, sin tocar los de `inWaves`. |
| `frontend/src/lib/GamePage.svelte` | modificar | Montar `DeathmatchHud`/`DeathmatchOverlay` cuando `inDeathmatch`; ocultar `MissionHud` y no montar `WaveHud`. |
| `frontend/src/lib/components/player/PlayerBehaviour.svelte` | modificar | En `inDeathmatch`: movimiento normal salvo `countdown`/muerto/results; enviar `mg6-position`; clips de aim; sin coche. |
| `frontend/src/lib/components/player/PlayerCollider.svelte` | modificar | Teletransporte de respawn y salida a `DM_EXIT`; el cuerpo sigue el spawn autoritativo. |
| `frontend/src/lib/components/player/Player.svelte` | modificar | Sin cambios de avatar; visible en la arena con el color de equipo si el componente lo soporta. |
| `frontend/src/lib/components/ui/MobileControls.svelte` | modificar | En `inDeathmatch`: Fire / Grenade / Reload / Scoreboard, sin botón de coche. |
| `frontend/src/lib/components/deathmatch/DeathmatchSession.svelte` | crear | Reporta posición a 10 Hz; consume `respawnRequest` y `exitRequest`; gestión de `go-lobby`. |
| `frontend/src/lib/components/deathmatch/DeathmatchRemotes.svelte` | crear | Jugadores remotos con `SkinCharacter`, skin real, color de equipo e interpolación. |
| `frontend/src/lib/components/deathmatch/DeathmatchPickups.svelte` | crear | Pickups fijos del mapa: modelo GLB (`ammo_kit`, `med_kit`, `grenade` o arma), halo, disponibilidad y cooldown. |
| `frontend/src/lib/components/deathmatch/DeathmatchProjectiles.svelte` | crear | Granadas en vuelo, explosiones, trazadoras y chispas; reutiliza `GrenadeProjectile.svelte` y `WaveExplosion.svelte`. |
| `frontend/src/lib/components/deathmatch/DeathmatchSpawnPads.svelte` | crear | Marcadores de las dos zonas de aparición y slots (solo presentación). |
| `frontend/src/lib/components/deathmatch/DeathmatchControls.svelte` | crear | Clic/toque para disparar, `G` granada, `R` recarga, `1`–`4` equipar; asistencia de puntería sobre enemigos. |
| `frontend/src/lib/components/deathmatch/DeathmatchHud.svelte` | crear | Timer y marcador de equipos siempre visibles; HP, arma, munición, granadas, protección y respawn. |
| `frontend/src/lib/components/deathmatch/DeathmatchTop5.svelte` | crear | Panel lateral derecho con el top 5 de bajas y botón de ocultar/mostrar. |
| `frontend/src/lib/components/deathmatch/DeathmatchKillfeed.svelte` | crear | Últimas 5 bajas con arma y colores de equipo; 6 s por entrada. |
| `frontend/src/lib/components/deathmatch/DeathmatchOverlay.svelte` | crear | Espera, countdown, respawn, resultados y botón de salida. |
| `frontend/src/lib/components/waves/GrenadeProjectile.svelte` | reutilizar | Proyectil de granada y mecha. Sin cambios. |
| `frontend/src/lib/components/waves/WaveExplosion.svelte` | reutilizar | Explosión con paleta de granada. Sin cambios. |
| `frontend/src/lib/components/waves/heldWeapon.ts` | reutilizar (ampliado) | Arma visible en la mano de jugadores remotos y locales; consume `weaponModels.ts` y conserva `BarrelTip` y fallback procedural. |
| `frontend/src/lib/components/player/weaponModels.ts` | reutilizar | Caché compartida de GLB de armas y props, escalas, clones y precarga. |
| `frontend/static/weapons/{pistol,shotgun,mp5,sniper_rifle}.glb` | usar | Modelos en mano de las cuatro armas del inventario, compartidos con `SPEC-023`. |
| `frontend/static/props/{ammo_kit,med_kit,grenade}.glb` | usar | Modelos de los pickups de munición, botiquín y granada. |
| `frontend/world/assets.json` | modificar | Alta de `ammo-kit`, `med-kit` y `grenade` (`category: props`, `pipeline: static`) para `assets:check`/`assets:compress`. |
| `frontend/src/lib/state/wavesConfig.ts` | reutilizar | `ARENA_POLYGON`, `BUILDING_BLOCKS`, `WEAPON_DEFINITIONS`, `WEAPON_BY_ID`, `WEAPON_BY_SLOT`, `PLAYER_MAX_HEALTH`, `PLAYER_SPEED_CAP`, `STARTER_*`, `AMMO_PACK_AMOUNT`, `MEDKIT_AMOUNT`, `MAX_GRENADES`, `GRENADE_*`. Solo lectura. |
| `frontend/src/lib/audio/events.ts` | modificar | Eventos de audio de Hexfire: disparo, impacto, granada, pickup, kill, victoria/derrota. |
| `frontend/scripts/verify-deathmatch-arena.mjs` | crear | `dm:check`: valida checkpoint contra `WHH_Path`/`WHH_Porch` de `map.glb`, spawns y pickups contra `barnsiege.glb`, separación de equipos y ausencia de solapes con edificios. |
| `frontend/scripts/verify-deathmatch-balance.mjs` | crear | `dm:balance`: simula entradas/salidas/reconexiones y comprueba `abs(A−B) ≤ 1`, alternancia y bloqueo de joins en `playing`. |
| `frontend/scripts/verify-deathmatch-match.mjs` | crear | `dm:match`: simula countdown 30 s, partida 6 min, kills, respawns, protección, pickups, empate/victoria y `go-lobby`. |
| `frontend/package.json` | modificar | Scripts `dm:check`, `dm:balance`, `dm:match`. |
| `specs/SPEC-025-minijuego-5-hexfire-deathmatch-equipos.md` | crear | Este spec. |

## 7. Plan de implementación

### Fase 0 — Configuración, checkpoint y reutilización del mapa

- [x] Paso 1: Crear `frontend/src/lib/state/dmConfig.ts` con:
      `DM_MAX_PLAYERS = 12`, `DM_TEAM_SIZE = 6`,
      `DM_COUNTDOWN_MS = 30_000`, `DM_MATCH_MS = 360_000`,
      `DM_RESULT_MS = 15_000`, `DM_RESPAWN_MS = 3_000`,
      `DM_SPAWN_PROTECTION_MS = 5_000`, `DM_SPAWN_POSITION_LOCK_MS = 600`,
      `DM_PICKUP_RADIUS = 1.6`,
      `DM_TEAMS`, `DM_TEAM_SPAWNS`, `DM_PICKUPS`, cooldowns por pickup y
      `WITCH_CHECKPOINT`.
- [x] Paso 2: Importar de `wavesConfig.ts` `ARENA_POLYGON`,
      `BUILDING_BLOCKS`, `WEAPON_*`, `PLAYER_MAX_HEALTH`,
      `PLAYER_SPEED_CAP`, `STARTER_WEAPON`, `STARTER_AMMO`,
      `STARTER_GRENADES`, `MAX_GRENADES`, `AMMO_PACK_AMOUNT`,
      `MEDKIT_AMOUNT`, `GRENADE_*`. No duplicar tablas de armas.
- [x] Paso 3: Añadir el checkpoint `minigame-6` `Hexfire` en
      `checkpoints.svelte.ts` y `DM_ENTRY`/`DM_EXIT` en `playerState.ts`.
- [x] Paso 4: En `sceneState.svelte.ts`, mapear `minigame-6` a `barnsiege`
      y añadir `inDeathmatch`; `inBarnsiege` debe seguir siendo cierto para
      ambos minijuegos.
- [x] Paso 5: Añadir `dm:check` con
      `frontend/scripts/verify-deathmatch-arena.mjs`: validar que el
      checkpoint está sobre `WHH_Path`, a ≤ 3 m del porche, y que los 12
      slots de spawn y los 13 pickups caen dentro de `ARENA_POLYGON`, fuera
      de `BUILDING_BLOCKS` y con separación suficiente.
- [x] Paso 6: Verificar `bun run dm:check`, `bun run map:check` y
      `bun run barnsiege:check`.

### Fase 1 — Protocolo compartido

- [x] Paso 1: En `server/protocol.ts`, añadir `minigame-6` a `LOBBY_IDS`,
      `MINIGAME_LOBBY_IDS` y `LOBBY_DEFINITIONS`
      (`{ id: 'minigame-6', name: 'Hexfire', kind: 'minigame' }`).
- [x] Paso 2: Definir `Mg6Team`, `Mg6Phase`, `Mg6Winner`, `Mg6PlayerState`,
      `Mg6Pickup`, `Mg6Snapshot`, `Mg6Positions`, `Mg6EventKind`, `Mg6Event`.
- [x] Paso 3: Añadir a `ClientMessage`: `mg6-position`, `mg6-shoot`,
      `mg6-throw`, `mg6-reload`, `mg6-equip`; a `ServerMessage`:
      `mg6-state`, `mg6-positions`, `mg6-event`.
- [x] Paso 4: En `server/validate.ts`, validar finitos, rangos, arma en
      lista, `slot` 1–4, dirección normalizada y `targetId` opcional.
- [x] Paso 5: Duplicar los tipos y guards en `lib/services/protocol.ts`
      (`isMg6Snapshot`, `isMg6Positions`, `isMg6Event`) y ampliar
      `isServerMessage`.

### Fase 2 — Motor autoritativo y room

- [x] Paso 1: Crear `server/engines/combat.ts` con helpers compartidos:
      `pointInArena`, `clampToArena`, `hitscanPlayers`, `shotgunPellets`,
      `resolveGrenade`, `applyPickupEffect` y `pickSpawnSlot`.
- [x] Paso 2: Crear `server/engines/deathmatch.ts` con la API:
      `initDeathmatch(deps)`, `onEnter`, `onLeave`, `onPosition`,
      `onShoot`, `onThrow`, `onReload`, `onEquip`, `tick`, `buildSnapshot`.
- [x] Paso 3: Máquina de estados y equipos:
      `idle → countdown → playing → results → idle`.
      Primer jugador inicia `countdown`; `playing` solo con ≥ 2 jugadores;
      si vence el countdown con 1, se queda en `waitingForPlayers` y arranca
      al entrar el segundo. Al vaciarse la sala, `idle` + reset total.
- [x] Paso 4: `onEnter`: rechazar solo `DM_FULL`; permitir entrar en
      cualquier fase. Asignar equipo con `pickTeam()` (en `playing`, al de
      menos jugadores); asignar slot de spawn con `pickSpawnSlot()`; HP 100,
      pistola, 60 de reserva, 1 granada; emitir `player-joined` y snapshot.
      En `idle`/`countdown` iniciar la espera de 2 jugadores.
- [x] Paso 5: `rebalanceTeams()` tras cada entrada/salida en
      `idle`/`countdown`: mientras `abs(coven − hunters) > 1`, mover al
      jugador más reciente del equipo grande al pequeño, actualizar spawn y
      emitir `team-changed`. Nunca tocar equipos en `playing`.
- [x] Paso 6: `tick` de 100 ms: countdown, inicio de partida, respawns,
      pickups, granadas, protección, fin de partida y snapshots a 1 Hz o
      cambio. Enviar `mg6-positions` a 10 Hz.
- [x] Paso 7: Disparo hitscan: validar fase `playing`, jugador vivo, arma
      equipada, cargador, cadencia, origen ≤ 2 m, alcance y línea de visión
      contra `BUILDING_BLOCKS`; ignorar compañeros y al propio jugador;
      `targetId` solo si es enemigo vivo, delante y dentro del cono; aplicar
      daño y emitir `shot-fired` y `player-hurt`.
- [x] Paso 8: Granada: validar `playing`, vivo, granadas > 0; crear
      proyectil balístico con espoleta 1.5 s o impacto; al explotar, dañar a
      **enemigos y al lanzador** en 4.5 m con caída lineal; nunca a
      compañeros; emitir `grenade-exploded` y `self-damage` si aplica.
- [x] Paso 9: Muerte: si HP ≤ 0, acreditar al último atacante enemigo
      (ventana 5 s), incrementar kills/deaths y `teamScores`, emitir `kill`,
      marcar `alive = false`, `respawnAt = now + 3 s`; en `tick` reaparecer
      en un slot aleatorio seguro del equipo con inventario inicial y
      protección 5 s. Mientras está muerto y durante 600 ms tras reaparecer,
      el servidor ignora los reportes de posición para no pisar el spawn.
- [x] Paso 10: Pickups: en `tick`, si un jugador vivo está a ≤ 1.6 m de un
      pickup disponible, aplicar efecto, marcar `respawnAt`, emitir
      `pickup-taken`; al vencer el cooldown, `pickup-respawned`.
- [x] Paso 11: Protección: ignorar daño mientras `protectionUntil > now`;
      al disparar o lanzar granada, poner `protectionUntil = 0`.
- [x] Paso 12: Timer: al entrar en `playing`, `matchEndsAt = now +
      DM_MATCH_MS`; a `0`, calcular `winner` (`coven`/`hunters`/`draw`),
      pasar a `results` y emitir `match-ended`; a los 15 s, `go-lobby`.
- [x] Paso 13: `onLeave`: retirar jugador; si era conductor no aplica; si
      la sala queda vacía, reset. En `playing` no rebalancear; en
      `idle`/`countdown` sí.
- [x] Paso 14: Reconexión: mismo equipo y K/D; si `playing`, respawn a los
      3 s con protección.
- [x] Paso 15: `try/catch` en `tick`: registrar el error, resetear a `idle`
      y no dejar la sala bloqueada.

### Fase 3 — Room y configuración de RUN.world

- [x] Paso 1: Crear `DeathmatchRoom.ts` análogo a `WavesRoom.ts`:
      `RoomPort` con `ByteBudget`, `clock.setInterval('tick', …, 100)`,
      `onPlayerJoin → deathmatch.onEnter`, `onPlayerLeave →
      deathmatch.onLeave`, `onGameMessage` con `parseClientMessage` y
      switch de `mg6-*` + `ping`; `go-lobby` al terminar.
- [x] Paso 2: Añadir a `frontend/rundot/rooms.config.json`:
      `{ "type": "deathmatch", "file":
      "src/server/rooms/DeathmatchRoom.ts", "config": { "maxPlayers": 12,
      "allowReconnect": true, "reconnectTimeout": 20, "idleTimeout": 120 }
      }`.
- [x] Paso 3: Smoke test headless del motor en Bun (sin navegador): dos
      jugadores, balanceo, countdown, kills, respawn, fin de partida y
      `go-lobby`.

### Fase 4 — Protocolo y socket del cliente

- [x] Paso 1: En `lobbySocket.ts`, `ROOM_TYPE_BY_LOBBY['minigame-6'] =
      'deathmatch'`; callbacks y senders `Mg6`; dispatch de mensajes.
- [x] Paso 2: Crear `minigame6.svelte.ts`: snapshot, posiciones con
      interpolación de 150 ms, `self`, `teamScores`, `killfeed`,
      `respawnRequest`, `exitRequest`, acciones y `reset()`.
- [x] Paso 3: En `lobby.svelte.ts`: reset al desconectar/cambiar de lobby;
      wiring de callbacks; `isDeathmatchLobbyId`; al salir de
      `minigame-6`, `minigame6.exitRequest = { ...DM_EXIT }`;
      `syncMinigame`/`isInMinigame` incluyen `minigame-6`.
- [x] Paso 4: En `playerState.ts`, añadir `inDeathmatch` a
      `playerRuntime` y `DM_ENTRY`/`DM_EXIT`.

### Fase 5 — Componentes de la arena y jugadores

- [x] Paso 1: `DeathmatchSession.svelte`: enviar `mg6-position` a 10 Hz;
      aplicar `respawnRequest` (teletransporte local) y `exitRequest`.
- [x] Paso 2: `DeathmatchRemotes.svelte`: renderizar jugadores remotos con
      `SkinCharacter`, skin real, color de equipo e interpolación; ocultar
      a los que no están en la sala.
- [x] Paso 3: `DeathmatchSpawnPads.svelte`: marcar las dos zonas y sus seis
      slots con anillos de color de equipo (sin luces dinámicas).
- [x] Paso 4: `DeathmatchPickups.svelte`: halo, pulso y estado de
      reaparición; los datos vienen del snapshot.
- [x] Paso 4b: Sustituir los iconos primitivos por los GLB existentes:
      `weapons/{pistol,shotgun,mp5,sniper_rifle}.glb` y
      `props/{ammo_kit,med_kit,grenade}.glb`. Compartir la caché con
      `heldWeapon.ts`, escalar a ~0.35–0.55 m y mantener el halo. Solo armas
      básicas.
- [x] Paso 5: `DeathmatchProjectiles.svelte`: granadas en vuelo,
      explosiones, trazadoras y chispas; reutilizar
      `GrenadeProjectile.svelte`, `WaveExplosion.svelte` y
      `heldWeapon.ts`.
- [x] Paso 6: Montar estos componentes en `Scene.svelte` dentro del bloque
      de `barnsiege`, condicionados por `sceneState.inDeathmatch` para no
      duplicar los de `inWaves`.
- [x] Paso 7: En `PlayerBehaviour.svelte`, con `inDeathmatch`: no mover en
      `countdown`/muerto/results; enviar `mg6-position`; clips de aim;
      ocultar el arma en countdown si se desea; no activar coche.
- [x] Paso 8: En `PlayerCollider.svelte`, consumir `respawnRequest` y
      aplicar el teletransporte al slot; al salir, `DM_EXIT`.

### Fase 6 — HUD, overlays, controles y audio

- [x] Paso 1: `DeathmatchHud.svelte` (pointer-events-none):
      timer grande centrado, `Coven N — N Hunters`, HP, arma y
      cargador/reserva, granadas, protección y respawn.
- [x] Paso 2: `DeathmatchTop5.svelte`: panel lateral derecho con el top 5 de
      bajas por jugador (kills/deaths/equipo) y botón de ocultar/mostrar.
- [x] Paso 3: `DeathmatchKillfeed.svelte`: últimas 5 bajas, color de equipo
      y arma; 6 s por entrada.
- [x] Paso 4: `DeathmatchOverlay.svelte`: `Waiting for players` + botón
      `Leave`, countdown 30→1, `Respawning in 3…`, `Victory`/`Defeat`/`Draw`,
      MVP y botón `Back to the witch house`; auto-salida 15 s.
- [x] Paso 5: `DeathmatchControls.svelte`: `pointerdown` dispara, mantener
      para automáticas, `G` granada, `R` recarga, `1`–`4` equipar; ignorar
      `repeat`, inputs editables y `chat.isOpen`. Escribe en `dmInput` y
      aplica asistencia de puntería contra enemigos vivos.
- [x] Paso 6: `dmInput.ts`: mismas señales que `waveInput` (fire, granada,
      recarga, equipar) pero como store propio, para no acoplar el
      deathmatch a la room de oleadas.
- [x] Paso 7: `MobileControls.svelte`: en `inDeathmatch`, Fire / Grenade /
      Reload / Reload(tap) y toggle del top 5; sin coche.
- [x] Paso 8: `GamePage.svelte`: montar HUD/overlay/top 5; ocultar
      `MissionHud`; no montar `WaveHud` cuando `inDeathmatch`.
- [x] Paso 9: Audio: añadir eventos al sistema de `SPEC-024` para disparo,
      impacto, granada, pickup, kill, victoria y derrota; sin assets.

### Fase 7 — Verificación, balance y cierre

- [x] Paso 1: `dm:balance`: simular 1–12 jugadores, entradas, salidas y
      reconexiones; comprobar que nunca hay más de 1 de diferencia y que
      `playing` no rebalancea.
- [x] Paso 2: `dm:match`: simular 30 s de countdown, 6 min de partida,
      kills, respawns, protección, pickups, empate y victoria; comprobar
      `go-lobby` a los 15 s.
- [x] Paso 3: Anti-trampas: clamp al polígono, tope de velocidad 9 m/s,
      fire-rate, origen ≤ 2 m, alcance, cargador, arma poseída, fase y
      pertenencia; sin daño amigo.
- [ ] Paso 4: Medir FPS con 12 pestañas y comprobar `ByteBudget` de
      `mg6-positions` y snapshots.
- [x] Paso 5: Actualizar este spec (`estado`, `actualizado`, Progreso,
      Changelog, checkboxes).
- [x] Paso 6: Confirmar con el usuario las preguntas abiertas.

## 8. Verificación

```bash
# Frontend
cd frontend
bun run dm:check
bun run dm:balance
bun run dm:match
bun run check
bun run lint
bun run build
bun run barnsiege:check
bun run map:check

# Rooms: el type-check de svelte-check cubre DeathmatchRoom.ts y el bundle
# de build compila las rooms. Si hay CLI de rundot disponible, arrancar la
# room `deathmatch` y revisar logs.
```

Casos manuales:

1. **Checkpoint**: caminar hasta la puerta de la casa de la bruja del área 1;
   ver el prompt `Hexfire` y comprobar que está sobre el camino, delante del
   porche.
2. **Entrada**: `E`; se carga `barnsiege.glb` (solo ese mapa) y aparecer en el
   spawn de `Coven` o `Hunters`; overlay de espera.
3. **Balance 2 jugadores**: dos pestañas; uno en cada equipo; el segundo no
   reinicia el countdown.
4. **Balance 3–12**: abrir varias pestañas; comprobar 2 vs 1, 2 vs 2, 3 vs 2,
   … 6 vs 6; nunca todos en el mismo equipo.
5. **Countdown**: 30 s; no hay movimiento ni disparo; la cámara gira; al
   llegar a 0 empieza `playing` y el timer marca `6:00`.
6. **Spawns**: verificar que Coven y Hunters aparecen en lados opuestos y que
   al morir se reaparece en el lado propio.
7. **Armas**: recorrer el mapa, recoger escopeta/subfusil/rifle/granadas,
   munición y botiquín; ver el HUD y comprobar la reaparición del pickup.
8. **Disparo**: matar a un enemigo; comprobar `+1` kill, `+1` en el marcador
   de equipo, killfeed y respawn a los 3 s.
9. **Daño amigo / autodaño**: disparar y lanzar una granada a un compañero;
   no debe restar HP ni sumar kill. Lanzar una granada a los pies propios;
   el lanzador sí recibe daño (y puede morir).
10. **Protección**: al reaparecer, recibir disparos durante 5 s; no debe
    quitar vida; disparar y comprobar que la protección desaparece.
11. **Timer**: comprobar que baja de `6:00` a `0:00` y que el marcador se
    actualiza en tiempo real.
12. **Final**: dejar que llegue a 0:00; comprobar `Victory`/`Defeat`/`Draw`,
    el top 5 y el MVP; el botón y el auto-salto vuelven a la casa de la bruja.
13. **Entrada tardía**: entrar durante `playing`; debe unirse al equipo con
    menos jugadores con pistola y protección.
14. **Reconexión**: cerrar una pestaña en `playing`, volver a entrar antes de
    20 s; mismo equipo, K/D conservados y respawn con protección.
15. **Regresión**: chat, checkpoints 1–3, rollos, coches libres, carrera,
    cripta, roadmap y `minigame-5` siguen funcionando.
16. **Rendimiento**: 12 pestañas + granadas; revisar FPS y logs de
    `ByteBudget`.

## 9. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| Equipos desbalanceados al entrar o salir. | Alto | `pickTeam()` al menor equipo + `rebalanceTeams()` en `idle`/`countdown`; `dm:balance` simula 1–12 jugadores. |
| Un jugador cambia de equipo para stackear. | Alto | El cliente no elige equipo; el servidor asigna y solo rebalancea en `idle`/`countdown`; no hay cambio manual. |
| Spawn camping en las dos zonas. | Medio | Zonas a ≈ 91 m; `pickSpawnSlot()` elige al azar entre los slots que conservan ≥ 85 % de la distancia máxima al enemigo; 5 s de protección que se cancela al atacar. |
| El respawn con inventario completo hace bola de nieve. | Medio | Al morir se pierde el inventario y se vuelve a pistola; las armas del mapa son el motor del combate. |
| Timer desincronizado entre clientes. | Alto | `matchEndsAt` y `serverTime` en el snapshot; el cliente solo formatea, no decide. |
| Un cliente dispara a compañeros o desde lejos. | Alto | Validación de equipo, fase, arma, cargador, cadencia, origen ≤ 2 m y alcance en el servidor. |
| Ping alto y objetivos que se “comen” los disparos. | Medio | Asistencia de puntería con `targetId` + radios de impacto generosos; interpolación 150 ms. |
| Pickups infinitos o duplicados. | Medio | Cooldown por pickup en servidor; el cliente solo dibuja el snapshot; radio 1.6 m. |
| El checkpoint nuevo pisa el área 1 o queda dentro de la casa. | Alto | Coordenada medida sobre `WHH_Path`; `dm:check` valida contra `map.glb` y el porche. |
| Dos minijuegos usan la escena `barnsiege`. | Medio | `sceneState.inDeathmatch` e `inWaves` son excluyentes; los componentes se montan por lobby, no solo por escena. |
| `minigame-6` no está en los protocolos/socket. | Alto | Fase 1 y 4 actualizan ambos protocolos; `svelte-check` y `build` lo verifican. |
| La sala queda bloqueada si el motor lanza una excepción. | Medio | `try/catch` en `tick`, reset a `idle` y `go-lobby`; `dm:match` cubre el ciclo completo. |
| El mapa se sustituye y los spawns/pickups quedan dentro de edificios. | Medio | Todo en `dmConfig.ts`; `dm:check` falla si un punto cae fuera del polígono o dentro de `BUILDING_BLOCKS`. |
| 12 jugadores con granadas y trazadoras bajan FPS. | Medio | Sin IA ni monstruos; efectos con límites; `ByteBudget`; medir con 12 pestañas. |

## 10. Decisiones resueltas (antes preguntas abiertas)

| Pregunta | Decisión |
| --- | --- |
| Nombre visible | **Witch House Deathmatch**. |
| Empate | **Draw** (sin prórroga). |
| Inventario al morir | Se pierde; se reaparece con la **pistola básica**. |
| Entrada a mitad de partida | **Permitida**; al equipo con menos jugadores. |
| Autodaño de granada | **Sí** si el lanzador está en el radio; los compañeros siguen inmunes. |
| Coche calabaza | **Fuera** (sin vehículos). |
| Headshots | **No**; daño plano. |
| Marcador | **Panel lateral derecho con top 5 de bajas** y botón de ocultar/mostrar (como el chat), no `Tab`. |
| Cuenta atrás | Espera a **2 jugadores**; con uno solo, botón para salir. |

## 11. Decisiones y notas

### 11.1 Arena y checkpoint

- **Mapa**: `frontend/static/barnsiege.glb`, ya existente y validado por
  `SPEC-023`. No se duplica ni se modifica.
- **Escena**: `sceneState.active === 'barnsiege'` para `minigame-6`, igual que
  para `minigame-5`. `inBarnsiege` sigue siendo cierto; la UI se decide por
  `inDeathmatch`/`inWaves`.
- **Polígono**: `ARENA_POLYGON` de 16 vértices (±56.5 m). El servidor recorta
  cualquier reporte al polígono con margen 0.5 m.
- **Suelo**: `y = 0.5` (`ARENA_FLOOR_Y`).
- **Checkpoint**: `(-33.01, 0.40, -22.90)`, radio 2, color `#a855f7`,
  nombre `Witch House Deathmatch`. Está sobre el inicio de `WHH_Path`, a
  ≈ 1 m del porche (`WHH_Porch` termina en `z ≈ -23.55`), delante de la
  puerta del área 1.
- **`DM_ENTRY` / `DM_EXIT`**: mismo punto que el checkpoint. Al salir se
  teletransporta ahí, no al spawn global por defecto.

### 11.2 Equipos y balanceo

- **Equipos**: `coven` (`#a855f7`) y `hunters` (`#22d3ee`). Máximo 6 por
  equipo, 12 en total.
- **Asignación**:
  1. Si un equipo tiene menos jugadores, entra ahí.
  2. Si están empatados, alterna respecto al último asignado.
  3. Nunca se asigna a un equipo lleno; si ambos están llenos, `DM_FULL`.
- **Reequilibrio**: solo en `idle`/`countdown`. Mientras
  `abs(coven − hunters) > 1`, se mueve al jugador más reciente del equipo
  grande al pequeño. El movimiento actualiza su slot de spawn y emite
  `team-changed`.
- **En `playing`**: no se mueve a nadie. Si un equipo queda con menos
  jugadores por una desconexión, se mantiene así hasta la siguiente partida.
- **Reconexión**: vuelve a su equipo y conserva K/D. No dispara rebalanceo.
- **Sin cambio manual**: el cliente no puede elegir equipo; evita stacks y
  partidas 6 vs 1.

### 11.3 Máquina de estados y timer

```
idle
  └─ primer jugador ─→ countdown (30 s)
        ├─ entran más jugadores (no reinicia)
        ├─ salen jugadores (rebalanceo)
        └─ 0 s y ≥ 2 jugadores ─→ playing (360 s)
              ├─ kills / respawns / pickups
              ├─ se vacía la sala ─→ idle (reset)
              └─ 0 s ─→ results (15 s)
                    └─ go-lobby ─→ idle
```

- Con 1 jugador al vencer el countdown, `phase` sigue en `countdown` con
  `waitingForPlayers = true`; arranca en cuanto entra el segundo.
- `countdownEndsAt[matchEndsAt]` se publican en el snapshot; el HUD muestra
  `0:30`, `6:00` y `0:00` según la fase.
- `results` congela el combate y muestra el marcador final; no se puede
  disparar ni recoger pickups.
- Si la sala queda vacía en cualquier fase, reset completo a `idle`.

### 11.4 Spawns

| Equipo | Ancla | Slots |
| --- | --- | --- |
| Coven | `(-40.00, 0.55, -24.00)` | 6: `dx ∈ {-1.8, 0, 1.8}`, `dz ∈ {-0.5, +2}` |
| Hunters | `(40.00, 0.55, 20.00)` | 6: `dx ∈ {-1.8, 0, 1.8}`, `dz ∈ {-0.5, +2}` |

- Separación entre anclas: `sqrt(80² + 44²) ≈ 91.3 m`.
- La fila delantera usa `dz = −0.5` (en vez de `−2`) para no entrar en
  `BUILDING_BLOCKS[9]` (Coven, `maxZ = −26`) ni en `BUILDING_BLOCKS[18]`
  (Hunters, `maxZ = 18.6`); `dm:check` valida los 12 slots.
- `pickSpawnSlot(team)` calcula la distancia de cada slot al enemigo vivo
  más cercano, conserva los que están a ≥ 85 % de la distancia máxima y
  elige uno **al azar**. Así el respawn impredecible no cae nunca en el
  slot pegado al enemigo.
- `DM_SPAWN_PROTECTION_MS = 5_000`; se cancela al disparar o lanzar granada.
- `DM_SPAWN_POSITION_LOCK_MS = 600`: al reaparecer se ignoran los reportes
  de posición durante esa ventana para que los paquetes en vuelo desde el
  punto de muerte no sobrescriban el spawn. Mientras `!alive` también se
  ignoran.
- El servidor no usa navmesh: los jugadores se mueven con el controlador
  normal y las físicas del mapa; solo se valida la contención.

### 11.5 Armas y pickups

Se reutilizan las armas y estadísticas de `SPEC-023`:

| Arma | Daño | Cadencia | Alcance | Cargador | Reserva |
| --- | --- | --- | --- | --- | --- |
| Rusty Pistol | 12 | 6/s | 55 m | 12 | ∞ |
| Shotgun | 8 × 6 | 0.9/s | 20 m | 6 | universal |
| SMG | 9 | 11/s | 42 m | 30 | universal |
| Hunting Rifle | 46 | 1.5/s | 130 m | 5 | universal |

Modelos GLB (los mismos de `SPEC-023`, ya en `frontend/static/`):

| `Mg5WeaponId` | GLB | Nodo de boca |
| --- | --- | --- |
| `pistol` | `weapons/pistol.glb` | `WPN_Pistol_Muzzle.002` |
| `shotgun` | `weapons/shotgun.glb` | extremo de `WPN_Shotgun_Barrel.001` |
| `smg` | `weapons/mp5.glb` | `WPN_MP5_Muzzle.001` |
| `rifle` | `weapons/sniper_rifle.glb` | extremo de `WPN_Sniper_Barrel.001` |

`weaponModels.ts` resuelve el modelo con `WEAPON_MODEL_BY_ID`, lo clona para
cada jugador y conserva el `BarrelTip` en la boca del cañón; mientras carga,
la primitiva actual hace de fallback. `DeathmatchPickups.svelte` usa
`props/ammo_kit.glb`, `props/med_kit.glb` y `props/grenade.glb` para los
pickups de consumibles. Los props están registrados en `world/assets.json` y
comprimidos con Draco, así que `useGltf` debe recibir `dracoLoader:
asset('draco/')`. No hay colliders ni cambios de daño: los GLB son solo
presentación.

Pickups fijos (todos a `y = 0.85`, validados por `dm:check`):

| ID | Tipo | Posición | Respawn | Modelo |
| --- | --- | --- | --- | --- |
| `shotgun-fields` | Escopeta | `(-29, 0.85, 17)` | 20 s | `weapons/shotgun.glb` |
| `shotgun-farmhouse` | Escopeta | `(29, 0.85, 17)` | 20 s | `weapons/shotgun.glb` |
| `smg-silo` | Subfusil | `(-29, 0.85, -16)` | 18 s | `weapons/mp5.glb` |
| `smg-pumpkin` | Subfusil | `(29, 0.85, -16)` | 18 s | `weapons/mp5.glb` |
| `rifle-barn` | Rifle | `(-16, 0.85, -31)` | 30 s | `weapons/sniper_rifle.glb` |
| `rifle-gate` | Rifle | `(0, 0.85, 32)` | 30 s | `weapons/sniper_rifle.glb` |
| `grenades-plaza` | Granadas | `(0, 0.85, 0)` | 15 s | `props/grenade.glb` |
| `grenades-west` | Granadas | `(-38, 0.85, -2)` | 15 s | `props/grenade.glb` |
| `grenades-east` | Granadas | `(38, 0.85, -2)` | 15 s | `props/grenade.glb` |
| `ammo-south-west` | Munición | `(-46, 0.85, -30)` | 12 s | `props/ammo_kit.glb` |
| `ammo-north-east` | Munición | `(46, 0.85, 30)` | 12 s | `props/ammo_kit.glb` |
| `medkit-north-west` | Botiquín | `(-46, 0.85, 30)` | 25 s | `props/med_kit.glb` |
| `medkit-south-east` | Botiquín | `(46, 0.85, -30)` | 25 s | `props/med_kit.glb` |

- Pickup automático por proximidad (≤ 1.6 m) en el servidor.
- Recoger un arma que ya se tiene recarga su cargador y da +30 de munición
  universal; no crea duplicados.
- Granada +2 (máx. 6), munición +50, botiquín +40 HP (máx. 100).
- Al morir se pierde el inventario y se reaparece con pistola, 60 de reserva
  y 1 granada.
- No hay drops de jugadores muertos en esta versión: las armas están en el
  mapa y reaparecen.

### 11.6 Daño, muerte y respawn

- HP máximo: 100. Sin armadura.
- Disparos: hitscan contra cápsulas de jugador (radio 0.65, altura 2.0 m);
  `targetId` permite compensar el retardo de red si el enemigo sigue vivo,
  delante y dentro del cono. El segmento origen→objetivo se rechaza si
  atraviesa un `BUILDING_BLOCK` (granero, silo, ruina, granja, miradores,
  etc.), para no matar a través de paredes.
- Escopeta: 8 perdigones deterministas con dispersión ±7°; cada perdigón
  aplica 6 de daño.
- Granadas: 75 de daño en el centro, caída lineal hasta 30 en el borde,
  radio 4.5 m. Dañan a enemigos y **al propio lanzador**; nunca a compañeros.
  El autodaño puede matar al lanzador y cuenta como muerte sin kill.
- Sin headshots; el daño es plano por arma.
- Kill: último atacante enemigo en los últimos 5 s. Si no hay atacante
  válido, no se acredita a nadie.
- Al morir: `alive = false`, `respawnAt = now + 3_000`, overlay de respawn.
- Al reaparecer: 100 HP, pistola, 60 de reserva, 1 granada, 5 s de
  protección y un slot aleatorio seguro del propio equipo elegido por
  `pickSpawnSlot`. Nunca se reaparece en el punto de muerte.
- La protección se cancela al disparar o lanzar una granada; no al moverse.

### 11.7 HUD, scoreboard y overlays

- **HUD permanente** (pointer-events-none):
  - Timer grande centrado (`0:30`, `6:00` → `0:00`).
  - Marcador `Coven N — N Hunters` con colores de equipo.
  - HP, arma equipada, cargador/reserva, granadas.
  - Indicador de protección y de respawn.
  - Killfeed arriba a la derecha (5 entradas, 6 s).
- **Panel derecho de top 5** (como el panel del chat): jugadores con más
  bajas (kills, deaths, equipo), botón para ocultar/mostrar durante la partida.
  Sustituye al scoreboard modal; no se abre con `Tab`.
- **Overlays**: `Waiting for players` (con botón `Leave`), `3… 2… 1…`,
  `Respawning in 3…`, `Victory`/`Defeat`/`Draw`, MVP y botón
  `Back to the witch house`; auto 15 s.
- Todo el texto visible de la UI va en inglés, como el resto del HUD de
  `SPEC-023`.

### 11.8 Protocolo (resumen)

Cliente → servidor:

- `mg6-position {x,y,z,yaw}`
- `mg6-shoot {weapon, ox,oy,oz, dx,dy,dz, targetId?}`
- `mg6-throw {gx,gy,gz, dx,dy,dz, tx?, tz?}` (mismo formato y parábola que
  `mg5-throw`: `tx/tz` es el punto del suelo bajo la mira)
- `mg6-reload {}`
- `mg6-equip {slot}`

Servidor → cliente:

- `mg6-state {state}`:
  `{ phase, serverTime, teamScores, countdownEndsAt, matchEndsAt,
  waitingForPlayers, winner, players[], pickups[] }`.
- `mg6-positions {at, players[], grenades[]}`.
- `mg6-event {event}` con `event.kind`:
  `player-joined`, `team-changed`, `match-started`, `kill`,
  `player-died`, `player-respawned`, `pickup-taken`, `pickup-respawned`,
  `shot-fired`, `player-hurt`, `match-ended`.
- `go-lobby` y `error` reutilizados.

Eventos destacados:

- `kill {killerId, killerTeam, victimId, victimTeam, weapon}`.
- `team-changed {playerId, from, to, reason:'balance'|'join'}`.
- `player-respawned {playerId, x, y, z, protectionUntil}`.
- `pickup-taken {pickupId, playerId, kind, respawnAt}`.
- `match-ended {winner, teamScores, mvpId}`.
- `self-damage {playerId, amount}` (granada propia).

### 11.9 Reutilización concreta de `SPEC-023`

| Pieza de `SPEC-023` | Uso en Hexfire |
| --- | --- |
| `barnsiege.glb` + `Barnsiege.svelte` + `barnsiege.physics.json` | Mapa y físicas, sin cambios. |
| `ARENA_POLYGON`, `BUILDING_BLOCKS`, `ARENA_FLOOR_Y` | Contención y validación de spawns/pickups. |
| `WEAPON_DEFINITIONS`, `WEAPON_BY_ID`, `WEAPON_BY_SLOT`, `WEAPON_SLOT_BY_ID` | Armas, daño, cadencia, cargadores e inventario. |
| `STARTER_WEAPON`, `STARTER_AMMO`, `STARTER_GRENADES`, `MAX_GRENADES`, `AMMO_PACK_AMOUNT`, `MEDKIT_AMOUNT` | Loadout y efectos de pickup. |
| `GRENADE_*` | Granada, espoleta, radio y daño. |
| `PLAYER_MAX_HEALTH`, `PLAYER_SPEED_CAP` | Vida y tope anti-cheat. |
| `WaveExplosion.svelte`, `GrenadeProjectile.svelte`, `heldWeapon.ts` | Efectos de granada, proyectil y arma en mano. |
| `waveEffects`/`WaveTracers` (o copia `dmEffects`) | Trazadoras, fogonazos y chispas. |
| `WaveControls` como referencia | `DeathmatchControls` con la misma asistencia de puntería y disparo en `pointerdown`. |
| `WaveHud` como referencia | `DeathmatchHud` con timer/score en lugar de oleada/monstruos. |
| Patrón `WavesRoom` + `waves.ts` + `RoomPort` | `DeathmatchRoom` + `deathmatch.ts`, sin `.onCreate`/`.onRestore` duplicados. |
| `sceneState`, `lobbySocket`, `lobby.svelte.ts`, `checkpoints` | Mismo patrón de entrada/salida y wiring. |

### 11.10 Diferencias frente a Barn Siege

- Sin monstruos, oleadas, IA, ácido, rocas ni coche.
- El objetivo es PvP por equipos, no supervivencia.
- Timer fijo de 6 minutos y respawn continuo, no “caído hasta la siguiente
  oleada”.
- Las armas están en el mapa con cooldown; no hay drops probabilísticos de
  monstruos.
- Dos zonas de spawn con 6 slots aleatorios-seguros por equipo y 5 s de
  protección de aparición.
- El HUD siempre muestra timer y marcador de equipos.
- El top 5 de bajas vive en un panel lateral derecho ocultable; no hay
  scoreboard con `Tab`.

### 11.11 Autoridad y anti-cheat

- El cliente nunca decide equipo, daño, kills, respawn, pickup ni resultado.
- Cada mensaje valida fase, pertenencia, arma poseída, cargador, cadencia,
  origen (≤ 2 m del último reporte), alcance y `targetId`.
- El servidor ignora disparos de compañeros y del propio jugador; la única
  excepción de autodaño es la explosión de la propia granada.
- La posición se recorta a `ARENA_POLYGON`; velocidad máxima 9 m/s. Se
  ignoran los reportes de jugadores muertos y los de los 600 ms posteriores
  a un respawn, para que la posición autoritativa del spawn prevalezca.
- No se permite disparar en `countdown`, `results`, muerto o con protección
  activa que se haya cancelado al atacar.
- El balanceo de equipos solo ocurre en `idle`/`countdown`; el cliente no
  puede solicitar cambio de equipo.

## 12. Progreso

| Fecha | Estado | Nota |
| --- | --- | --- |
| 2026-11-05 | implementando | Spec actualizado con las decisiones del usuario: nombre `Witch House Deathmatch`, `Draw`, pistola al morir, entrada a mitad de partida, autodaño de granada, top 5 lateral ocultable y countdown con 2 jugadores + botón de salida. |
| 2026-11-05 | implementado | Motor autoritativo, room, protocolos, cliente, HUD/overlays, audio y scripts `dm:check`/`dm:balance`/`dm:match`. Todos verdes, igual que `check`, `lint`, `build`, `barnsiege:check` y `map:check`. Queda la QA manual con 2–12 navegadores y la medición de FPS. |
| 2026-11-05 | implementado | Fix de respawn: `respawnRequest` reactivo, bloqueo de reportes de posición de muertos y 600 ms tras reaparecer, spawn aleatorio entre los slots seguros del equipo y protección aumentada a 5 s. |
| 2026-11-11 | implementado | Origen de los disparos desde el cañón visible del arma (`BarrelTip` de `heldWeapon.ts`, leído por `DeathmatchControls`) y sangre procedural en los impactos sobre enemigos (`BloodHit.svelte` + evento `player-hurt` con coordenadas). |
| 2026-11-13 | implementado | **Modelos GLB de armas y kits**: `weaponModels.ts` cachea armas y props con Draco; `heldWeapon.ts` usa los modelos reales conservando `BarrelTip`, `DeathmatchPickups.svelte` muestra `ammo_kit`/`med_kit`/`grenade` y `DeathmatchSession` precarga durante la cuenta atrás. Verificado `check`, `assets:check` y `build`. |

## 13. Changelog

- 2026-11-05 — Creación del spec. Se reutiliza `barnsiege.glb` y el combate
  de `SPEC-023`; se fija el checkpoint en la puerta de la casa de la bruja
  del área 1 (`(-33.01, 0.40, -22.90)`), dos equipos con balanceo automático,
  spawns separados ≈ 91 m, armas recogibles en el mapa, cuenta atrás de 30 s,
  partida de 6 minutos y HUD permanente con timer y bajas por equipo.
- 2026-11-05 — Decisiones del usuario: nombre **Witch House Deathmatch**,
  empate `Draw`, pistola al morir, entrada permitida a mitad de partida,
  autodaño de la propia granada, sin coche ni headshots, top 5 lateral
  ocultable y countdown que espera a 2 jugadores con botón de salida.
- 2026-11-05 — Implementación completa: room `deathmatch`, motor con fases,
  equipos, spawns, pickups, daño PvP, respawns y timer; protocolo `Mg6*` en
  servidor y cliente; HUD, top 5, killfeed, overlays, controles y audio;
  scripts `dm:check`, `dm:balance` y `dm:match`. La fila delantera de spawns
  se ajusta a `dz = −0.5` para no tocar `BUILDING_BLOCKS[9]`/`[18]`.
- 2026-11-05 — Fix de respawn reportado en QA: `respawnRequest` pasa a
  `$state.raw` para que `PlayerCollider` reaccione al evento autoritativo;
  el servidor ignora posiciones de jugadores muertos y aplica un lock de
  600 ms tras reaparecer; `pickSpawnSlot()` elige al azar entre los slots
  seguros (≥ 85 % de la distancia máxima al enemigo) y la protección sube a
  5 s. `dm:check` y `dm:match` cubren los tres comportamientos.
- 2026-11-05 — **Recompensa de misión**: ganar una partida (equipo local con
  más bajas al pasar a `results`) registra `hexfire-first-win` y desbloquea
  `demon` (`Demon.glb`); el empate y la derrota no la conceden.
- 2026-11-11 — **Muzzle real y sangre**: las trazadoras locales y remotas
  salen ahora del `BarrelTip` del arma visible (`heldWeapon.ts`) en lugar de
  la altura de la cabeza; si el rig no expone la mano se conserva el estimado
  de hombro. Cada impacto confirmado sobre un enemigo dibuja una salpicadura
  procedural (`BloodHit.svelte`: shader de mancha + gotas con gravedad) y el
  servidor añade `x/y/z` a `player-hurt` para colocarla en el punto de daño.
- 2026-11-13 — **Mira de combate**: se reutiliza `AimCrosshair.svelte`, la
  retícula de cuatro ticks con punto central y marcador de impacto animado.
  `CrosshairTracker.svelte` comprueba el cilindro de aim assist del Deathmatch
  (enemigos vivos del equipo contrario) y colorea la mira de ámbar cuando hay
  un objetivo. Se oculta con el chat abierto, al morir y fuera de la fase
  `playing`; el cursor del navegador se oculta mientras se apunta.
- 2026-11-13 — **Modelos GLB de armas y pickups implementados**: el arma en
  mano de locales y remotos usa `weapons/pistol.glb`, `weapons/shotgun.glb`,
  `weapons/mp5.glb` y `weapons/sniper_rifle.glb` mediante `weaponModels.ts`
  (`WEAPON_MODEL_BY_ID`, Draco y caché), conservando `BarrelTip` y el fallback
  procedural. Los pickups usan `props/ammo_kit.glb`, `props/med_kit.glb` y
  `props/grenade.glb`, y `DeathmatchSession` los precarga durante la cuenta
  atrás. Solo se usan las cuatro armas básicas.
