---
id: SPEC-040
titulo: "Minijuego 8: Skyfall Royale — battle royale todos contra todos en Islas Ciudad"
estado: completado
prioridad: alta
creado: 2026-11-13
actualizado: 2026-11-14
responsable: opencode
etiquetas:
  [
    minijuego,
    multijugador,
    battle-royale,
    royale,
    pvp,
    todos-contra-todos,
    islas-ciudad,
    zeppelin,
    skyfall,
    paracaidas,
    glider,
    tormenta,
    storm,
    loot,
    websocket,
    rooms,
    svelte,
    threlte,
    rapier,
    servidor-autoritativo,
    bots,
    ia,
    relleno-de-partida,
    minigame-8,
    nft,
    recompensas,
    progresion,
  ]
depende_de: [SPEC-005, SPEC-009, SPEC-012, SPEC-020, SPEC-023, SPEC-024, SPEC-025, SPEC-026, SPEC-030]
bloquea: []
estimacion: "64h"
---

# SPEC-040 — Minijuego 8: Skyfall Royale (battle royale todos contra todos)

> **Nombre vs. id técnico**: es el **octavo minijuego jugable** (después de
> las llaves, la cripta, el Grand Prix, Barn Siege, Witch House Deathmatch y
> Parkour Spire), pero usa el lobby **`minigame-8`**, la room **`royale`** y la
> escena **`islas-ciudad`**. No hay equipos: **todos contra todos**.

## 1. Contexto

El proyecto ya tiene siete minijuegos y un hub con checkpoints físicos. El
último modo grande que falta es un **battle royale** que use el mapa completo
de `islas_ciudad`, en lugar de una arena pequeña.

Antes de este spec ya se preparó el mapa:

- `frontend/static/maps/islas_ciudad.glb` está comprimido con Draco
  (15,853,636 B → 2,473,292 B, −84,4 %).
- `frontend/world/islas-ciudad.physics.json` existe con colisión `chunked`
  (`chunkSize: 16`), 2 255 nodos y 248 017 triángulos. Grupos: 509 `suelo`,
  1 365 `paredes`, 288 `muebles` y 93 `obstaculos`.
- `frontend/src/lib/components/world/IslasCiudad.svelte` monta el GLB con
  `useGltf` + `useDraco(asset('draco/'))`.
- `frontend/world/maps.json` ya tiene la entrada `islas-ciudad`, con spawn
  `(0, 2.4, -30)`, `manualComponent: true`, `manualPhysics: true` y
  `lighting: "global"`.
- La verificación `bun run islas-ciudad:check` pasa y un test de runtime
  confirmó que los 2 255 nombres configurados resuelven en `GLTFLoader`.
- `frontend/src/lib/world/registry.generated.ts` **todavía no incluye**
  `islas-ciudad`; hay que ejecutar `bun run world:sync` durante la
  implementación para que el mapa sea montable.

Sistemas reutilizables:

- `frontend/src/server/engines/deathmatch.ts` y
  `frontend/src/server/rooms/DeathmatchRoom.ts` son la referencia de motor
  autoritativo, fases, snapshots y `go-lobby`.
- `frontend/src/server/engines/combat.ts`, `wavesConfig.ts` y los GLB de
  `frontend/static/weapons/` + `frontend/static/props/` ya resuelven armas,
  pickups, dispersión, granadas y modelos.
- `frontend/src/lib/components/deathmatch/*` aporta HUD, killfeed, top 5,
  remotos interpolados, proyectiles y efectos.
- `frontend/src/lib/state/sceneState.svelte.ts`, `checkpoints.svelte.ts`,
  `lobby.svelte.ts`, `lobbySocket.ts` y los dos `protocol.ts` definen el patrón
  de lobby, checkpoint, transporte y mensajes.
- `frontend/src/server/engines/waves.ts` aporta el patrón de IA autoritativa
  (percepción, objetivos, movimiento, ataques y daño), aunque sus monstruos
  usan waypoints de una arena pequeña y no sirven tal cual para una ciudad.
- `frontend/src/lib/components/world/Zeppelin.svelte` ya carga el modelo,
  anima las hélices, permite posición fija y órbita circular.
- `SPEC-024` aporta el audio procedural y `SPEC-030` el pipeline Draco de
  personajes.

Lo que no existe todavía:

- Un vuelo de zepelín con **path scriptado** y una fase de salto.
- **Skydive/glider** en `PlayerCollider.svelte`; hoy solo hay gravedad,
  salto y `MAX_FALL_SPEED = 30`.
- **Tormenta**, **loot de suelo**, **sin respawn** y **último en pie**.
- **Bots de battle royale**: navegación por un mapa abierto, salto, loot,
  rotación de tormenta y combate contra humanos. `waves.ts` no se puede
  reutilizar directamente porque está atado a `barnsiege.glb` y a spawns
  fijos.
- Datos de **oclusión**, **anclas de loot** y **rejilla de navegación**
  medidos para `islas_ciudad`.

## 2. Objetivo

Añadir `Skyfall Royale`, un battle royale **12 participantes, todos contra
todos, sin respawn**, en el mapa `islas_ciudad`, con una salida desde un
zepelín controlado por el servidor, salto/paracaídas/planeo, tormenta que
cierra el círculo, loot repartido por la ciudad, combate autoritativo,
**bots que rellenan la partida cuando faltan jugadores reales** y victoria del
último jugador en pie.

## 3. Alcance

**Incluye**

- Lobby **`minigame-8`** (`Skyfall Royale`) y room de RUN.world **`royale`**
  (`maxPlayers: 12`, `allowReconnect: true`, `reconnectTimeout: 20`,
  `idleTimeout: 120`), no singleton. Los bots **no ocupan** plazas de
  `maxPlayers`; las plazas son solo para humanos.
- Checkpoint físico **`SKYFALL ROYALE`** en el mapa global, en
  `(60.0, 0.40, 60.0)`, radio 2.2, color `#38bdf8`; `E` entra y sale.
- Integración real de `islas-ciudad`: `world:sync`, `sceneState`, montaje del
  componente manual y físicas `chunked`. Sin GLB nuevos.
- **Bots de relleno**: con **1 humano** la partida ya puede empezar; el
  servidor completa hasta **12 participantes** con bots y los sustituye por
  humanos que entren durante la cuenta atrás. Los bots son jugadores
  virtuales del servidor, no conexiones WebSocket.
- IA de bot autoritativa: elección de salto y zona de aterrizaje, navegación
  A* por una rejilla generada, loot, rotación de tormenta, combate con
  percepción/LOS, granadas y muerte. Sin trampas ni visión a través de muros.
- Vuelo de zepelín con **path de 5 waypoints** sobre las islas, reutilizando
  el modelo, las hélices y las animaciones de `Zeppelin.svelte`.
- Salto desde el zepelín (`Space`/`E`) con caída libre y **planeo automático**
  a baja altura, control de aire y aterrizaje en cualquier superficie del mapa.
- Tormenta en **7 fases** con centro y radio autoritativos, daño creciente,
  aviso visual/sonoro y eliminación por quedarse fuera.
- **70 anclas de loot** generadas y verificadas sobre el mapa, con 4 armas
  reutilizadas, munición universal, botiquín, escudo y granadas. Sin
  reaparición de loot.
- Inventario de 4 ranuras, reserva universal, recarga, granadas y asistencia
  de puntería ya usada en los otros modos.
- Combate PvP autoritativo: hitscan, escopeta de 8 perdigones, granadas con
  daño en área y autodaño, sin daño amigo (no hay equipos).
- **Sin respawn**: al morir se muestra el puesto conseguido y se puede
  espectar; la partida sigue hasta que queda 1 jugador o se agota el tiempo.
- HUD completo (vivos, kills, tormenta, HP/escudo, arma/munición, granadas),
  minimapa, killfeed, panel lateral de vivos, overlays de espera, salto,
  eliminación, resultados y victoria.
- Audio procedural para salto, planeo, disparos, impactos, pickups, tormenta
  y victoria (sin assets nuevos).
- Misión local **`royale-first-win`**.
- **Recompensas NFT de la pista `royale`** (`SPEC-045`): `royale-first` (T0,
  sin mint), `royale-kills-10` → `sniper-gold`, `royale-kills-50` →
  `bazooka-gold` y `royale-kills-200` → `ghost`. Se reclaman en
  `MissionHud → Rewards`, no en el checkpoint ni en el turismo.
- Entrada **Skyfall Royale** en el centro de turismo (`SPEC-033`) con su mapa
  `islas-ciudad`, checkpoint, estado de misión y recompensas NFT.
- Scripts `royale:build`, `royale:check`, `royale:match`, `royale:balance` y
  `royale:bots`.

**No incluye**

- Equipos, revivir compañeros, espectador de equipo ni alianzas.
- Respawn, vidas extra o zona de práctica.
- Bots humanos conectados por WebSocket, bots con chat/voz, bots persistentes
  entre partidas, selector de dificultad, entrenamiento de IA o *machine
  learning*. Solo hay un perfil de bot «normal» determinista.
- Bots en `minigame-1`…`minigame-7` o en el hub.
- Vehículos, construcción, edición de estructuras, monturas o planeadoras
  permanentes.
- Cambios a `islas_ciudad.glb`, a sus físicas ya validadas o a otros mapas.
- Cambios de comportamiento en `minigame-1`…`minigame-7`.
- Rarezas de loot, cofres, misiones diarias, pase de batalla, XP, rangos,
  leaderboard global o estadísticas persistentes.
- Daño por caída, natación real, headshots o multiplicadores por parte del
  cuerpo.
- Nuevas skins o desbloqueos de cosméticos existentes. Las recompensas NFT de
  la pista `royale` las define `SPEC-045` y se reclaman en la Central; esta spec
  solo registra las estadísticas y la misión local `royale-first-win`.
- Cambios en el resto del backend. El motor de Skyfall Royale sí se porta a
  `backend/` (servidor WebSocket activo); `frontend/src/server/` es su copia de
  referencia para los scripts `verify-*` y ambas deben mantenerse iguales.

## 4. Requisitos

### Funcionales

| ID    | Requisito                                                                                                                                                                                                                                                                                                 | Prioridad |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| RF-1  | Checkpoint `SKYFALL ROYALE` en `(60.0, 0.40, 60.0)`, radio 2.2, color `#38bdf8`; `E` entra a la room `royale` con `minigame-8` y `E`/salida vuelve al mismo punto.                                                                                                                                       | alta      |
| RF-2  | `LOBBY_IDS` y `MINIGAME_LOBBY_IDS` incluyen `minigame-8`; `LOBBY_DEFINITIONS` lo llama `Skyfall Royale`; la room se declara en `rooms.config.json` con `maxPlayers: 12`, `allowReconnect: true`, `reconnectTimeout: 20`, `idleTimeout: 120`.                                                               | alta      |
| RF-3  | Fases: `idle → countdown (30 s) → playing (máx. 10 min) → results (20 s) → idle`. La cuenta atrás arranca con **≥ 1 humano** y el servidor completa la partida con bots hasta 12 participantes. Con 0 humanos se muestra `Waiting for players` y no avanza. No se reinicia al entrar más jugadores. | alta      |
| RF-4  | Entrada permitida en `idle` y `countdown` hasta 12 **humanos**. Si entran más humanos, se retiran bots para mantener 12 participantes; si un humano sale en `countdown`, se añade un bot. En `playing`/`results` se rechaza con `ROYALE_IN_PROGRESS` y `go-lobby` a `global`; nunca se permite entrar a mitad de partida. | alta      |
| RF-5  | Durante `countdown` el movimiento, el salto y el combate están bloqueados para humanos y bots; la cámara puede girar. Al empezar `playing` todos los participantes aparecen en el zepelín. | alta      |
| RF-6  | Al iniciar `playing`, cada participante (humano o bot) está en modo `riding` sobre el zepelín, a la altitud del path (140 m), con la física congelada y la posición sincronizada con el servidor. | alta      |
| RF-7  | El zepelín recorre 5 waypoints con velocidad constante `12.5 m/s` y tarda `36.5 s`; se puede saltar desde `1.5 s` hasta `32 s`; a los `32 s` el servidor expulsa automáticamente a quien siga a bordo (incluidos bots) y a los `36.5 s` el zepelín desaparece. | alta      |
| RF-8  | Salto con `Space` o `E`: transición `riding → skydive`, posición inicial calculada por el servidor desde el path y `jumpAt` registrado. El cliente no puede saltar dos veces ni saltar después de aterrizar.                                                                                               | alta      |
| RF-9  | Caída libre: gravedad `40 m/s²`, velocidad vertical máxima `40 m/s`, control horizontal `9 m/s`. El planeo se despliega automáticamente al bajar de `y = 55` o a los `4.5 s` del salto, lo que ocurra primero.                                                                                              | alta      |
| RF-10 | Planeo: caída vertical `6 m/s`, avance horizontal `12 m/s`, sin salto. Al tocar una superficie (`computedGrounded`) se pasa a `grounded` y se recupera el movimiento normal. Sin daño por caída.                                                                                                           | alta      |
| RF-11 | El servidor valida transiciones de modo (`riding → skydive → glide → ground`), velocidad horizontal máxima (10 en suelo, 16 en aire), altura y límites del mapa; si un reporte es inválido envía `mg8-correct` y el cliente se teletransporta a la última posición válida.                                    | alta      |
| RF-12 | Si un jugador se desconecta montado o cae fuera del mapa (`y < -8`), se elimina; si se desconecta en tierra, su cuerpo permanece 20 s y luego se elimina. Se permite reconectar dentro de esos 20 s conservando vida, escudo, inventario y posición.                                                        | media     |
| RF-13 | Tormenta autoritativa: radio inicial `400`, gracia de `60 s`, y 7 fases `260 → 180 → 120 → 70 → 35 → 10 → 3` con `waitMs`/`shrinkMs` y daño `1/2/3/5/8/12/20` HP/s. El centro de cada fase se elige con semilla de partida entre los 14 POI, garantizando que el nuevo círculo quede dentro del anterior. | alta      |
| RF-14 | El daño de tormenta se aplica cada 1 s, consume escudo antes que vida y no tiene autor. Una eliminación por tormenta muestra `X se perdió en la tormenta` y asigna el puesto correspondiente.                                                                                                               | alta      |
| RF-15 | El cliente dibuja el círculo actual y el siguiente con un cilindro translúcido y un anillo en el suelo; interpola radio/centro durante `shrinkMs` y avisa 10 s antes de cada cierre.                                                                                                                       | alta      |
| RF-16 | `royale:build` genera `frontend/world/islas-ciudad.royale.json` con: bounds del mapa, 14 POI, **70 anclas de loot** y **~700-1 200 cajas de oclusión** derivadas de `paredes` + `obstaculos`. El archivo se versiona y el servidor lo importa.                                                              | alta      |
| RF-17 | Cada ancla de loot se resuelve al inicio de la partida con una tabla determinista: 45 % arma, 20 % munición, 13 % escudo, 12 % botiquín, 10 % granada. Las armas se reparten 30 % escopeta, 30 % SMG, 20 % rifle, 20 % pistola. El loot no reaparece.                                                     | alta      |
| RF-18 | Pickup automático a ≤ 1.8 m horizontal y ≤ 2.5 m vertical: arma llena su ranura, recarga el cargador y añade una reserva de un cargador; si ya se tiene, recarga y añade munición. Munición +60 (máx. 300), botiquín +40 HP (máx. 100), escudo +50 (máx. 100), granada +1 (máx. 4).                     | alta      |
| RF-19 | Loadout inicial: 100 HP, 0 escudo, pistola con 12 en cargador y 60 de reserva universal, 0 granadas y las otras 3 ranuras vacías. No hay armas infinitas: la pistola también consume reserva.                                                                                                              | alta      |
| RF-20 | Inventario de 4 ranuras fijas (1 pistola, 2 escopeta, 3 SMG, 4 rifle), reserva universal 0–300, `R` recarga, `1`–`4` o clic/toque equipan. Recoger un arma que ya está en su ranura no crea duplicados.                                                                                                    | alta      |
| RF-21 | Estadísticas de armas idénticas a `wavesConfig.ts`: pistola 12 de daño, 6 disparos/s, 55 m, cargador 12; escopeta 8 × 6 con dispersión ±7°, 1.2 disparos/s, 32 m, cargador 6; SMG 9, 11/s, 42 m, cargador 30; rifle 46, 1.5/s, 130 m, cargador 5.                                                      | alta      |
| RF-22 | Disparo hitscan autoritativo con validación de fase, vivo, arma en mano, cargador, cadencia, origen ≤ 2.5 m del último reporte, alcance y línea de visión contra las cajas de oclusión. La escopeta usa 8 perdigones deterministas por disparo.                                                            | alta      |
| RF-23 | Asistencia de puntería: el cliente busca al jugador bajo el punto de mira (radio 1.4 m horizontal) y manda `targetId`; el servidor lo acepta solo si sigue vivo, está delante, dentro del cono y dentro del alcance. Todos los jugadores son enemigos.                                                      | alta      |
| RF-24 | Granada con `G`: espoleta 1.5 s o impacto, 75 de daño en el centro con caída lineal hasta 30 en el borde, radio 4.5 m; daña a cualquier jugador, incluido el lanzador. Máximo 4 granadas.                                                                                                                | alta      |
| RF-25 | El daño consume primero escudo y luego vida. No hay daño amigo porque no hay equipos. Al llegar a 0 HP el jugador muere, suelta el arma equipada con el cargador actual y no reaparece.                                                                                                                    | alta      |
| RF-26 | Crédito de baja al último jugador que hizo daño en los 5 s previos; evento `kill` con arma, killfeed y `kills++`. Una muerte por tormenta o caída no da crédito a nadie.                                                                                                                                    | alta      |
| RF-27 | Puesto de eliminación: `placement = vivosAntesDeMorir` (si mueren 12, el primero en morir es 12.º). El ganador es el último vivo y recibe `placement = 1`.                                                                                                                                                  | alta      |
| RF-28 | La partida termina cuando queda **1 vivo** o a los 600 s de `playing`. En timeout gana quien tenga más `HP + escudo`; desempata kills y luego daño infligido.                                                                                                                                              | alta      |
| RF-29 | `results` dura 20 s y muestra `VICTORY ROYALE` o el puesto local, kills, daño, tiempo sobrevivido y podio de los 3 primeros. Botón `Back to the village` y salida automática con `go-lobby` + teletransporte a `(60.0, 0.40, 60.0)`.                                                                       | alta      |
| RF-30 | Tras morir, overlay `ELIMINADO #N` con botón de salir y modo espectador: sigue al asesino (o al líder vivo) con cámara orbital; `V` cicla jugadores vivos; no se puede volver a jugar en esa partida.                                                                                                        | media     |
| RF-31 | HUD permanente: vivos/12, humanos/bots, kills, fase y timer de tormenta, dirección/distancia a la zona segura, HP, escudo, arma, cargador, reserva, granadas y estado de salto/planeo.                                                                                                                                    | alta      |
| RF-32 | Minimapa 2D de 180 × 180 con bounds del mapa, POI, círculo actual, círculo siguiente, jugador local y compañeros… **no hay compañeros**: solo jugador local y los vivos no se revelan.                                                                                                                     | media     |
| RF-33 | Panel lateral derecho con el top 5 de vivos por kills, colapsable como el panel del chat y con chip `BOT`; killfeed con arma, tormenta y bots. No hay scoreboard modal con `Tab`.                                                                                                                                                  | alta      |
| RF-34 | Overlays: espera, cuenta atrás, `SPACE TO JUMP` con altitud y cuenta atrás de expulsión, `GLIDER OPEN`, eliminación, resultados y victoria.                                                                                                                                                                 | alta      |
| RF-35 | Controles móviles en `inRoyale`: salto/expulsar del zepelín, disparar, granada, recargar, ranuras 1–4 y salir; sin botón de coche.                                                                                                                                                                          | alta      |
| RF-36 | Audio procedural: salto, planeo, disparos, impactos, pickups, aviso de tormenta, bucle de tormenta fuera de zona, eliminación y victoria. Sin archivos de audio nuevos.                                                                                                                                      | media     |
| RF-37 | Cliente: remotos humanos y bots interpolados a 10 Hz, skin real, chip `BOT`, animaciones de caminar/correr/apuntar/disparar/morir, disparos remotos y granadas interpoladas.                                                                                                                                                           | alta      |
| RF-38 | Protocolo `mg8-*` espejado en servidor y cliente, con guards y validación de cada mensaje. Snapshots a 1 Hz y posiciones a 10 Hz; `ByteBudget` avisa si un frame supera 16 KiB.                                                                                                                            | alta      |
| RF-39 | Al vaciarse la room en cualquier fase, vuelve a `idle` y limpia jugadores, bots, loot, granadas, tormenta y timers. Entrar/salir 10 veces no deja cuerpos, controladores ni listeners.                                                                                                                          | alta      |
| RF-40 | `royale-first-win` se registra en `rw:missions:v1` la primera vez que el jugador local gana; no desbloquea skins nuevas. Las recompensas NFT (`sniper-gold`, `bazooka-gold`, `ghost`) viven en la pista `royale` de `SPEC-045` y se reclaman en la Central. | baja      |
| RF-41 | `bun run world:sync` añade `islas-ciudad` a `registry.generated.ts`; `sceneState.active === 'islas-ciudad'` con `minigame-8`; `inRoyale` existe y `map.glb` no se monta dentro de la partida.                                                                                                                | alta      |
| RF-42 | El resto de checkpoints, minijuegos, chat, misiones, coches y rollos siguen funcionando; el nuevo checkpoint no se solapa con los existentes ni con edificios.                                                                                                                                              | alta      |
| RF-43 | Si el jugador local cae al mar (`y < -8`), el servidor lo elimina con causa `fell`; el cliente no puede quedarse cayendo indefinidamente ni reaparecer en el spawn del mapa.                                                                                                                                | alta      |
| RF-44 | El zepelín visual usa `Zeppelin.svelte` con un nuevo modo `path`; las hélices y animaciones siguen funcionando. La posición visual se calcula desde `boardingStartedAt` y el mismo path del servidor, sin mensajes por frame.                                                                                | alta      |
| RF-45 | `royale:check`, `royale:balance`, `royale:match`, `royale:bots`, `check`, `lint`, `build`, `islas-ciudad:check` y `map:check` pasan en verde.                                                                                                                                                                              | media     |
| RF-46 | **Relleno con bots**: al arrancar `countdown` el servidor añade bots hasta `humanos + bots = 12` (`ROYALE_BOT_FILL = 11`, máximo 11). Un humano que entra en `idle`/`countdown` sustituye al bot más reciente; uno que sale en `countdown` se reemplaza por otro bot. Con 0 humanos se cancela todo y no queda ningún bot. | alta      |
| RF-47 | Los bots son jugadores virtuales del servidor (`isBot: true`), sin WebSocket ni plaza en `maxPlayers`. Aparecen en `mg8-state`, `mg8-positions`, puestos, killfeed y espectador, pero `sendTo` nunca se llama para ellos. El cliente no ejecuta IA local. | alta      |
| RF-48 | Salto de bot determinista por semilla: `jumpAt` en `[3 s, 30 s]` y punto de aterrizaje elegido entre las 28 anclas de bot (celdas caminables a ≤ 130 m del path, repartidas por POI), con sesgo al POI más cercano a la trayectoria. Usa la misma caída/planeo que un humano; si el punto no es alcanzable, cae en la celda de navegación segura más cercana y aterriza a la altura del nav. | alta      |
| RF-49 | Navegación de bots sobre una rejilla `2 m` generada por `royale:build` (`walkable` + altura), A* con límite de nodos y suavizado por LOS. Los bots piensan a 5 Hz, recalculan ruta al cambiar de objetivo o quedar atascados > 1.5 s, se mueven a ≤ 8 m/s terrestres y nunca atraviesan paredes, agua ni cajas de oclusión. | alta      |
| RF-50 | Loot de bot: escanean loot disponible a ≤ 30 m, priorizan mejora de arma, munición si < 30, escudo, botiquín si HP < 75 y granada; se dirigen al más útil y recogen con la misma regla de 1.8 m. No duplican armas ni piden loot reservado a un humano. | alta      |
| RF-51 | Combate de bot: detección a ≤ 55 m y 120° de FOV con LOS real, reacción de 250–700 ms, error de puntería de 1.5–4° y seguimiento imperfecto; usan la cadencia, cargador y daño de `wavesConfig`, disparan en ráfagas y lanzan granadas con cooldown. No apuntan a través de muros ni tienen visión omnisciente. | alta      |
| RF-52 | Rotación de tormenta: si el bot está fuera del círculo actual o faltan ≤ 20 s para el siguiente cierre, calcula un punto dentro de la zona segura con 8 m de margen y navega hacia él; si A* falla, avanza en línea recta evitando oclusores. No se queda quieto recibiendo daño de tormenta. | alta      |
| RF-53 | Los bots pueden matar, ser eliminados, soltar arma y **ganar** la partida con las mismas reglas y puestos que un humano. El espectador puede seguirlos con `V`; `royale-first-win` solo se registra si gana el jugador local humano. | alta      |
| RF-54 | Nombres y aspecto: 24 nombres de bot deterministas por semilla, únicos en la partida y sin colisión con nombres humanos; skins existentes de `SkinCharacter`; chip `BOT` en HUD/panel/killfeed. Sin chat, voz, amigos ni invitaciones. | media     |
| RF-55 | Presupuesto de CPU: máximo 11 bots, pensamiento a 5 Hz, A* solo al cambiar de objetivo o atasco, sin pathfinding por frame ni por bot en cada tick; una room sin humanos no simula bots. El tick autoritativo sigue a 100 ms. | alta      |
| RF-56 | `royale:bots` simula 500 partidas solo-bots y 200 partidas 1 humano de referencia + 11 bots con semillas fijas: siempre 1 ganador, puestos únicos 1–12, duración media 240–540 s, ninguna partida > 600 s, sin NaN, sin posiciones fuera del mapa, sin bots atascados > 10 s y con muertes por tormenta/caída. | alta      |
| RF-57 | Si se va el último humano en cualquier fase, se cancelan timers, loot, granadas, tormenta y bots, y la room vuelve a `idle`. Los bots nunca mantienen viva una partida sin humanos. Un humano desconectado en `playing` conserva su ventana de reconexión de 20 s y **no** se sustituye por un bot. | alta      |
| RF-58 | `royale:build` genera la rejilla de navegación y los anclas de aterrizaje de bots; `royale:check` valida que los 14 POI y las 70 anclas de loot caen en celdas caminables, que la componente conectada principal cubre todos los POI y que no hay celdas caminables sobre agua o tejados. | alta      |

### No funcionales

| ID    | Requisito      | Criterio                                                                                                                                        |
| ----- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| RNF-1 | Autoridad      | El cliente solo envía posición/modo, salto, disparo, granada, recarga y equipar. Daño, loot, tormenta, puestos y resultado los decide el servidor. |
| RNF-2 | Tráfico        | `mg8-positions` cada 100 ms, redondeado a 2 decimales; con 12 participantes y granadas ≤ 16 KiB por frame. `mg8-state` a 1 Hz.                       |
| RNF-3 | Rendimiento    | 60 FPS en hardware medio con el mapa completo, 12 participantes (humanos + hasta 11 bots), 70 loot y tormenta. Sin monstruos ni mallas extra por bot.            |
| RNF-4 | Determinismo   | Dos clientes ven el mismo timer, tormenta, loot, vivos, puestos, bots y resultado para la misma semilla.                                                     |
| RNF-5 | Sin fugas      | Entrar/salir 10 veces y reconectar no deja cuerpos, controladores, listeners, timers, bots ni loot residual.                                                 |
| RNF-6 | Portabilidad   | Todo el balance vive en `royaleConfig.ts` + `islas-ciudad.royale.json`; cambiar de mapa solo requiere regenerar el JSON y re-medir.                          |
| RNF-7 | Reloj          | Timers basados en `serverTime`/`endsAt`; el cliente no puede adelantar la tormenta, la cuenta atrás ni la IA de los bots.                                   |
| RNF-8 | Anti-cheat     | Rebote de posición inválida, límite de velocidad, línea de visión del servidor, cadencia y origen de disparo.                                               |
| RNF-9 | Accesibilidad  | Overlays legibles, botones táctiles ≥ 44 px, respeto a `prefers-reduced-motion` en animaciones de HUD.                                                      |
| RNF-10 | Compatibilidad | `islas_ciudad.glb` Draco + 419 017 triángulos sigue cargando en móvil; no se duplican mallas ni materiales por jugador.                                      |
| RNF-11 | CPU de bots    | 11 bots a 5 Hz añaden < 4 ms al tick medio del servidor; A* cacheado con ≤ 4 000 nodos y sin asignaciones grandes por frame.                                 |
| RNF-12 | Justicia       | Los bots usan las mismas armas, daño, cadencia, loot y reglas de tormenta; no tienen HP extra, puntería perfecta, visión a través de muros ni velocidad superior a la humana. |

## 5. Criterios de aceptación

- [x] CA-1: El checkpoint `SKYFALL ROYALE` se ve en `(60, 0.4, 60)`, no se solapa con otros checkpoints ni edificios, y `E` abre la room `royale` con `minigame-8`.
- [x] CA-2: Con **1 humano** arranca la cuenta atrás de 30 s y se rellena la partida con **11 bots**; con 2 humanos hay 10 bots. Un segundo humano que entra durante la cuenta atrás sustituye a un bot y el total sigue siendo 12.
- [x] CA-3: Durante la cuenta atrás ni humanos ni bots se mueven ni disparan; la cámara sí gira. Al llegar a 0 todos aparecen sobre el zepelín a 140 m.
- [x] CA-4: El zepelín recorre el path visible sobre las islas, las hélices giran y la posición coincide en dos clientes.
- [x] CA-5: `SPACE`/`E` hace saltar al jugador; se ve caída libre, el planeo se abre solo a `y ≤ 55` o 4.5 s y aterriza sin atravesar el suelo.
- [x] CA-6: Quien no salta (humano o bot) es expulsado automáticamente a los 32 s; a los 36.5 s el zepelín ya no está.
- [x] CA-7: Un jugador puede aterrizar en el Faro, un hotel, la calle de comercios, un muelle o el hospital sin quedarse atrapado ni caer al vacío.
- [x] CA-8: Hay 70 loot visibles; al pasar por encima se recogen automáticamente y desaparecen del mundo y del snapshot.
- [x] CA-9: Recoger escopeta/SMG/rifle llena su ranura, recarga y añade reserva; `1`–`4` cambian de arma; `R` recarga.
- [x] CA-10: Munición +60, botiquín +40 HP, escudo +50 y granada +1 respetan los máximos (300/100/100/4).
- [x] CA-11: Un disparo a otro jugador resta escudo y luego vida; no existe daño amigo porque todos son enemigos.
- [x] CA-12: La escopeta aplica 8 perdigones; el rifle 46; la SMG 9; la pistola 12; las cadencias y cargadores coinciden con `wavesConfig`.
- [x] CA-13: Una granada en el suelo explota a los 1.5 s, daña a todos los que estén en 4.5 m y puede matar al lanzador.
- [x] CA-14: No se puede disparar a través de una pared de hotel/tienda/muro; `royale:check` valida las cajas de oclusión.
- [x] CA-15: Al morir se muestra `ELIMINADO #N`, el asesino recibe +1 kill y la víctima suelta el arma equipada; no reaparece.
- [x] CA-16: El jugador muerto puede espectar al asesino o al líder vivo (humano o bot) con `V` y salir cuando quiera.
- [x] CA-17: La tormenta empieza a los 60 s, muestra el círculo actual y el siguiente, cierra en 7 fases y hace daño creciente fuera de zona.
- [x] CA-18: El daño de tormenta consume escudo y vida, no tiene autor y muestra `se perdió en la tormenta` en el killfeed.
- [x] CA-19: Dos clientes ven el mismo centro/radio de tormenta, el mismo timer y los mismos vivos.
- [x] CA-20: Al quedar 1 vivo se pasa a `results` con `VICTORY ROYALE` o derrota, kills, daño, tiempo y podio; si gana un bot se muestra su nombre con chip `BOT` y la misión local no se registra. A los 20 s o con el botón se vuelve a `(60, 0.4, 60)`.
- [x] CA-21: En timeout gana el mayor `HP + escudo`; si empatan, más kills; si también, más daño.
- [x] CA-22: Entrar en `playing` se rechaza con `ROYALE_IN_PROGRESS` y devuelve a `global`; no se puede hacer *stream snipe* ni sustituir un bot a mitad de partida.
- [x] CA-23: Reconectar dentro de 20 s conserva vida, escudo, inventario, posición y kills; pasado el plazo el jugador queda eliminado y **no** se crea un bot en su lugar.
- [x] CA-24: El minimapa muestra el mapa, los POI, el jugador y los dos círculos; el panel de vivos se colapsa y el killfeed se actualiza con humanos y bots.
- [x] CA-25: Los controles móviles permiten saltar, disparar, granada, recargar y cambiar de ranura; no aparece el botón de coche.
- [x] CA-26: El HUD de salto muestra altitud, `SPACE TO JUMP`, cuenta atrás de expulsión y `GLIDER OPEN` al desplegar.
- [x] CA-27: El audio suena en disparos, impactos, pickups, salto, planeo, tormenta, eliminación y victoria, sin errores de decode.
- [x] CA-28: Ganar una partida contra humanos o bots registra `royale-first-win` una sola vez y no altera desbloqueos de skins existentes; las recompensas NFT de la pista `royale` las concede `SPEC-045` desde la Central.
- [x] CA-43: El centro de turismo muestra **Skyfall Royale** como novena actividad, con el mapa `Islas Ciudad`, el checkpoint `minigame-8`, el estado de `royale-first-win` y las recompensas NFT `sniper-gold` → `bazooka-gold` → `ghost`; el kiosco no mintea ni reclama.
- [x] CA-29: `royale:build`, `royale:check`, `royale:balance`, `royale:match`, `royale:bots`, `check`, `lint`, `build`, `islas-ciudad:check` y `map:check` pasan.
- [x] CA-30: Entrar/salir 10 veces, morir, espectar, reconectar y dejar que entren/salgan bots no deja cuerpos, controladores, listeners, timers ni errores en consola.
- [x] CA-31: Un humano solo puede jugar una partida completa: 11 bots saltan del zepelín, aterrizan, recogen loot, se mueven por la ciudad y compiten por la victoria.
- [x] CA-32: Los bots aparecen en `mg8-positions` y se ven interpolados con skin, nombre, chip `BOT`, animaciones y disparos; no hay IA en el cliente.
- [x] CA-33: Un bot no dispara ni ve a través de una pared: se comprueba con un bot al otro lado de un hotel y no recibe daño hasta que hay LOS.
- [x] CA-34: Los bots rotan antes de cada cierre de tormenta, reciben daño si quedan fuera y no se quedan quietos muriendo por la zona.
- [x] CA-35: Al entrar un segundo humano durante `countdown`, desaparece un bot y el total sigue en 12; si el humano se va, vuelve un bot.
- [x] CA-36: Si se va el último humano, los bots se eliminan, la room vuelve a `idle` y deja de consumir CPU de IA.
- [x] CA-37: Un bot puede ser el último vivo y ganar; el podio y el killfeed lo muestran correctamente.
- [x] CA-38: El espectador puede ciclar con `V` sobre bots vivos y seguir su cámara.
- [x] CA-39: `royale:bots` completa 500 partidas solo-bots y 200 de 1 humano de referencia + 11 bots sin NaN, sin atascos, con 1 ganador y puestos únicos.
- [x] CA-40: `royale:check` valida la rejilla de navegación: 14 POI y 70 anclas en celdas caminables, componente conectada y ninguna celda sobre agua o tejados.
- [x] CA-41: Los nombres de bots son únicos, no colisionan con nombres humanos y se mantienen estables para la misma semilla.
- [x] CA-42: Un humano desconectado en `playing` conserva su cuerpo 20 s y puede reconectar; no aparece un bot en su lugar.

## 6. Archivos relevantes

| Ruta                                                              | Acción     | Motivo                                                                                                                       |
| ----------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `frontend/world/islas-ciudad.royale.json`                         | crear      | Datos generados: bounds, 14 POI, 70 anclas de loot, cajas de oclusión, rejilla de navegación de 2 m y anclas de aterrizaje de bots. |
| `frontend/scripts/build-royale-map.mjs`                           | crear      | Genera el JSON anterior desde `islas_ciudad.glb` + `islas-ciudad.physics.json`, incluida la rejilla caminable y su conectividad. |
| `frontend/scripts/verify-royale.mjs`                              | crear      | `royale:check`: valida mapa, POI, loot, oclusión, navegación, tormenta, path, checkpoint y timings.                            |
| `frontend/scripts/verify-royale-match.mjs`                        | crear      | `royale:match`: prueba el motor con 1–12 humanos y relleno de bots.                                                          |
| `frontend/scripts/verify-royale-balance.mjs`                      | crear      | `royale:balance`: simula loot y valida reparto/TTK.                                                                           |
| `frontend/scripts/verify-royale-bots.mjs`                         | crear      | `royale:bots`: 500 partidas solo-bots + 200 con humano de referencia; valida IA, navegación, puestos y duración.             |
| `frontend/package.json`                                           | modificar  | Scripts `royale:build`, `royale:check`, `royale:match`, `royale:balance`, `royale:bots`.                                      |
| `frontend/src/lib/state/royaleConfig.ts`                          | crear      | **Única fuente** de timings, path, tormenta, POI, loot, armas, bots y límites. Importa el JSON generado.                     |
| `frontend/src/lib/state/minigame8.svelte.ts`                      | crear      | Store reactivo: snapshot, posiciones, vivos, humanos/bots, loot, tormenta, killfeed, correcciones y `reset()`.               |
| `frontend/src/lib/state/royaleInput.ts`                           | crear      | Entrada de combate/salto separada de `playerInput`, `waveInput` y `dmInput`.                                                  |
| `frontend/src/lib/state/royaleEffects.svelte.ts`                  | crear      | Trazadoras, impactos, chispas, granadas, escudo roto y muerte; sin tocar `dmEffects`.                                        |
| `frontend/src/server/engines/royale.ts`                           | crear      | Motor autoritativo: fases, zepelín, salto, tormenta, loot, combate, bots, puestos y resultado.                               |
| `frontend/src/server/engines/royaleCombat.ts`                     | crear      | Hitscan, LOS contra cajas, dispersión, granadas y daño reutilizando `combat.ts`.                                              |
| `frontend/src/server/engines/royaleNav.ts`                        | crear      | Decodifica la rejilla, A* con límite de nodos, suavizado por LOS, altura de suelo y consultas de celda caminable.            |
| `frontend/src/server/engines/royaleBots.ts`                       | crear      | Controlador de bots: relleno/sustitución, salto, loot, percepción, combate, rotación de tormenta y estados.                  |
| `frontend/src/server/rooms/RoyaleRoom.ts`                         | crear      | Room `royale`: ciclo de vida, mensajes, `tick` a 100 ms, `go-lobby` y rechazo en curso.                                      |
| `backend/src/lib/state/royaleConfig.ts`                           | crear      | Copia de referencia del servidor activo: mismos timings, path, tormenta, POI, loot, armas y bots.                            |
| `backend/src/lib/state/islas-ciudad.royale.json`                  | crear      | Copia de los datos generados para que `backend/` sea autocontenido en el deploy.                                             |
| `backend/src/server/engines/royale.ts`                            | crear      | Motor autoritativo en el servidor WebSocket activo (misma API que la copia de `frontend/`).                                  |
| `backend/src/server/engines/royaleCombat.ts`                      | crear      | Hitscan, LOS, dispersión, granadas y daño del servidor activo.                                                               |
| `backend/src/server/engines/royaleNav.ts`                         | crear      | Rejilla, A* con ALT, suavizado y altura de suelo del servidor activo.                                                        |
| `backend/src/server/engines/royaleBots.ts`                        | crear      | IA de bots del servidor activo; nunca ocupa plazas ni envía mensajes.                                                        |
| `backend/src/server/protocol.ts`                                  | modificar  | `minigame-8`, definición `Skyfall Royale`, tipos `Mg8*`, uniones de servidor y cliente.                                       |
| `backend/src/server/validate.ts`                                  | modificar  | Validación de `mg8-position/jump/shoot/throw/reload/equip`.                                                                   |
| `backend/src/index.ts`                                            | modificar  | Topic `lobby:minigame-8`, puerto/engine, estado de lobby, tick a 100 ms, admisión y handlers `mg8-*`.                         |
| `frontend/rundot/rooms.config.json`                               | modificar  | Alta de la room `royale` con 12 humanos, reconexión 20 s e idle 120 s; los bots no cuentan como plazas.                        |
| `frontend/src/server/protocol.ts`                                 | modificar  | `minigame-8` en listas/definiciones; tipos `Mg8*` con `isBot`, `humans`, `bots`; unión de mensajes y `CLIENT_MESSAGE_TYPES`. |
| `frontend/src/server/validate.ts`                                 | modificar  | Esquemas de `mg8-position`, `mg8-jump`, `mg8-shoot`, `mg8-throw`, `mg8-reload` y `mg8-equip`; rechazo de mensajes de bots.    |
| `frontend/src/lib/services/protocol.ts`                           | modificar  | Espejo de tipos/guards `Mg8*` y `minigame-8`.                                                                                 |
| `frontend/src/lib/services/lobbySocket.ts`                        | modificar  | Callbacks `onMg8State/Positions/Event/Correct`, senders `sendMg8*` y dispatch.                                                |
| `frontend/src/lib/state/lobby.svelte.ts`                          | modificar  | Wiring de `minigame8`, `isRoyaleLobbyId`, reset y `exitRequest` a `ROYALE_EXIT`.                                             |
| `frontend/src/lib/state/checkpoints.svelte.ts`                    | modificar  | Checkpoint `minigame-8` `SKYFALL ROYALE` en `(60, 0.4, 60)`, `#38bdf8`, radio 2.2.                                           |
| `frontend/src/lib/state/playerState.ts`                           | modificar  | `ROYALE_ENTRY`/`ROYALE_EXIT` y `playerRuntime.inRoyale`.                                                                      |
| `frontend/src/lib/state/sceneState.svelte.ts`                     | modificar  | `minigame-8` → `islas-ciudad`; getter `inRoyale`.                                                                             |
| `frontend/src/lib/world/registry.generated.ts`                    | regenerar  | `bun run world:sync` añade `islas-ciudad` y su import de físicas.                                                             |
| `frontend/src/lib/components/world/Zeppelin.svelte`               | modificar  | Modo `path` con waypoints, velocidad, orientación tangente y posición calculada por tiempo.                                   |
| `frontend/src/lib/components/player/PlayerCollider.svelte`        | modificar  | Modos `riding/skydive/glide/ground`, gravedad aérea, control de aire, aterrizaje, kill floor y sync de entrada/salida.          |
| `frontend/src/lib/components/player/PlayerBehaviour.svelte`       | modificar  | En `inRoyale`: reportar `mg8-position` con modo, animaciones de salto/planeo/muerte, sin coche ni interacción de hub.          |
| `frontend/src/lib/Scene.svelte`                                   | modificar  | Montar `IslasCiudad`, `RoyaleSession`, remotos, loot, tormenta, proyectiles y zepelín solo en `inRoyale`.                      |
| `frontend/src/lib/GamePage.svelte`                                | modificar  | Montar `RoyaleHud`, `RoyaleMinimap`, `RoyaleKillfeed`, `RoyaleOverlay`, `RoyaleControls`; ocultar HUD de hub/misiones.          |
| `frontend/src/lib/components/royale/RoyaleSession.svelte`         | crear      | Reporta posición a 10 Hz, consume correcciones, gestiona `go-lobby` y reset.                                                  |
| `frontend/src/lib/components/royale/RoyaleDrop.svelte`            | crear      | Zepelín visual con `Zeppelin` en modo path, asientos y sincronización con `boardingStartedAt`.                                |
| `frontend/src/lib/components/royale/RoyaleRemotes.svelte`         | crear      | Jugadores remotos humanos y bots con skin real, chip `BOT`, interpolación y estado de salto/planeo.                         |
| `frontend/src/lib/components/royale/RoyaleLoot.svelte`            | crear      | 70 pickups con modelos GLB, halo, color y disponibilidad.                                                                    |
| `frontend/src/lib/components/royale/RoyaleStorm.svelte`           | crear      | Cilindro y anillo de tormenta con interpolación de centro/radio.                                                             |
| `frontend/src/lib/components/royale/RoyaleProjectiles.svelte`     | crear      | Granadas, explosiones, trazadoras y chispas reutilizando `GrenadeProjectile`/`WaveExplosion`.                                |
| `frontend/src/lib/components/royale/RoyaleHud.svelte`             | crear      | Vivos/12, humanos/bots, kills, timer de tormenta, HP/escudo, arma, munición, granadas y estado de salto.                     |
| `frontend/src/lib/components/royale/RoyaleMinimap.svelte`         | crear      | SVG 180 × 180 con bounds, POI, jugador, círculo actual y siguiente.                                                          |
| `frontend/src/lib/components/royale/RoyaleKillfeed.svelte`        | crear      | Killfeed con arma, tormenta, caída y chip `BOT` en asesinos/víctimas bot.                                                    |
| `frontend/src/lib/components/royale/RoyaleTopAlive.svelte`        | crear      | Panel lateral top 5 de vivos por kills, colapsable, con chip `BOT`.                                                          |
| `frontend/src/lib/components/royale/RoyaleOverlay.svelte`         | crear      | Espera, countdown, aviso `jugando con 11 bots`, eliminación, resultados, victoria y espectador.                              |
| `frontend/src/lib/components/royale/RoyaleControls.svelte`        | crear      | Clic/toque para disparar, `G`, `R`, `1`–`4`, salto y asistencia de puntería.                                                 |
| `frontend/src/lib/components/royale/RoyaleSpectator.svelte`       | crear      | Cámara orbital sobre el asesino/líder (humano o bot) y ciclo con `V`.                                                        |
| `frontend/src/lib/components/ui/MobileControls.svelte`            | modificar  | Botones de salto/planeo, disparo, granada, recarga y ranuras en `inRoyale`.                                                  |
| `frontend/src/lib/components/ui/villageGuide.ts`                  | modificar  | Entrada del nuevo checkpoint en la guía de la aldea.                                                                         |
| `frontend/src/lib/components/audio/AudioBootstrap.svelte`         | modificar  | `CountdownSource` incluye `royale`; audio de tormenta y victoria.                                                            |
| `frontend/src/lib/missions/minigames.ts`                          | modificar  | Misión `royale-first-win`.                                                                                                   |
| `frontend/src/lib/components/player/weaponModels.ts`              | reutilizar | Modelos de armas/pickups ya cacheados; no se modifica.                                                                       |
| `frontend/src/server/engines/deathmatch.ts`                       | referencia | Patrón de fases, snapshots, daño, granadas y resultados.                                                                     |
| `frontend/src/server/engines/combat.ts`                           | reutilizar | Helpers puros de distancia, dispersión, granadas y rayos; se importan en `royaleCombat.ts`.                                  |
| `frontend/src/lib/state/wavesConfig.ts`                           | reutilizar | Definiciones de armas, daño, cadencia, cargadores y modelos.                                                                 |
| `frontend/src/server/engines/waves.ts`                            | referencia | Patrón de IA autoritativa: percepción, objetivos, ataques, daño y limpieza; no se importa en el battle royale.               |
| `specs/SPEC-009-fisicas-rapier-mapa.md`                           | modificar  | Nota de integración final de `islas-ciudad` en el juego.                                                                     |

## 7. Plan de implementación

### Fase 0 — Datos del mapa, checkpoint y registro

- [x] Crear `frontend/scripts/build-royale-map.mjs`:
  - Leer `frontend/static/maps/islas_ciudad.glb` y
    `frontend/world/islas-ciudad.physics.json`.
  - Calcular `bounds` del mapa y los centros/AABB de los 14 POI.
  - Rasterizar los triángulos de `suelo` en celdas de 2 m para obtener altura y
    normal; descartar agua, pendientes > 20° y celdas sin suelo.
  - Generar 70 anclas (5 por POI) con separación mínima de 6 m, a 0.9 m sobre el
    suelo y a ≥ 1.2 m de cualquier pared.
  - Rasterizar una rejilla de navegación de 2 m con altura y pendiente;
    descartar agua, celdas sin suelo, paredes, tejados/azoteas (`Techo`,
    `Marquesina`, `Pretil`) y pendientes > 20°; calcular la componente
    conectada principal y guardar `nav` en formato compacto
    (`cellSize`, `origin`, `cols`, `rows`, `walkable`, `heights`).
  - Elegir 28 anclas de aterrizaje de bots entre celdas caminables a ≤ 130 m
    del path, repartidas por POI; los POIs fuera de alcance no reciben bot
    inicial y se alcanzan caminando.
  - Generar cajas de oclusión 3D desde `paredes` + `obstaculos`, excluyendo
    `Ventana`, `Puerta`, `Porton`, `Porche`, `Barandilla`, `Pretil`, `Techo` y
    `Marquesina`.
  - Escribir `frontend/world/islas-ciudad.royale.json` de forma determinista
    (sin fechas ni orden aleatorio).
- [x] Añadir `royale:build` a `frontend/package.json` y ejecutarlo.
- [x] Crear `frontend/src/lib/state/royaleConfig.ts` con tipos, constantes,
      path, tormenta, tabla de loot, perfil de bots y helpers puros
      (`royaleZeppelinAt`, `royaleStormAt`, `royaleDistance`,
      `royaleInSafeZone`, PRNG `mulberry32`).
- [x] Añadir el checkpoint `minigame-8` a `checkpoints.svelte.ts` y la entrada
      correspondiente a `villageGuide.ts`.
- [x] Añadir `ROYALE_ENTRY`/`ROYALE_EXIT` e `inRoyale` a `playerState.ts`.
- [x] Ejecutar `bun run world:sync` y comprobar que `registry.generated.ts`
      incluye `islas-ciudad`, `IslasCiudad.svelte` y su JSON de físicas.
- [x] Mapear `minigame-8 → 'islas-ciudad'` y añadir `inRoyale` en
      `sceneState.svelte.ts`.
- [x] Ejecutar `bun run royale:check` (aún sin motor) para validar datos,
      checkpoint y path.

### Fase 1 — Protocolo y configuración compartida

- [x] Añadir `minigame-8` a `LOBBY_IDS`, `MINIGAME_LOBBY_IDS` y
      `LOBBY_DEFINITIONS` en `server/protocol.ts` y su espejo cliente.
- [x] Definir tipos `Mg8Phase`, `Mg8PlayerState` (con `isBot`), `Mg8Loot`,
      `Mg8Storm`, `Mg8Placement`, `Mg8Snapshot` (con `humans` y `bots`),
      `Mg8Positions`, `Mg8Event` y `Mg8Correct`.
- [x] Añadir mensajes servidor `mg8-state`, `mg8-positions`, `mg8-event`,
      `mg8-correct`; cliente `mg8-position`, `mg8-jump`, `mg8-shoot`,
      `mg8-throw`, `mg8-reload`, `mg8-equip`. Los bots no envían mensajes.
- [x] Añadir validadores en `server/validate.ts` y guards en
      `lib/services/protocol.ts`.
- [x] Extender `lib/services/lobbySocket.ts` con callbacks, senders y dispatch.
- [x] Extender `lobby.svelte.ts` con `isRoyaleLobbyId`, wiring de
      `minigame8`, reset y `exitRequest`.
- [x] Declarar la room `royale` en `rundot/rooms.config.json`.

### Fase 2 — Motor autoritativo y room

- [x] Crear `server/engines/royale.ts` con la clase `Royale` y el puerto
      `RoyaleDeps` (`broadcast`, `sendTo`, `moveToLobby`).
- [x] Implementar `onEnter`: límite 12 humanos, rechazo en `playing`/`results`,
      creación de jugador, modo `riding`, posición del zepelín, arranque de
      countdown con ≥ 1 humano y relleno de bots hasta 12.
- [x] Implementar `onLeave` de humano: en `idle`/`countdown` retirar y
      reemplazar por bot; en `playing` mantener el cuerpo 20 s y **no**
      rellenar con bot; si no quedan humanos, cancelar y limpiar la partida.
- [x] Implementar `royaleBotFill`: añadir/quitar bots para que
      `humanos + bots = 12`, con IDs `bot:<seed>:<n>`, nombres únicos y sin
      tocar las plazas de `maxPlayers`.
- [x] Implementar `tick(now)` a 100 ms: countdown, auto-expulsión a los 32 s,
      fin de vuelo a los 36.5 s, tormenta, daño, pickups, granadas, bots,
      timeout y results.
- [x] Implementar `royaleZeppelinAt` y `royaleStormAt` como funciones puras
      compartidas con el cliente; incluir `boardingStartedAt`, `matchStartedAt`
      y semilla en el snapshot.
- [x] Implementar `onPosition`: validar modo, velocidad, altura, bounds y
      transiciones; actualizar posición y detectar aterrizaje; emitir
      `mg8-correct` si procede.
- [x] Implementar `onJump`: validar `riding`, ventana y que no haya saltado;
      calcular posición desde el path y pasar a `skydive`.
- [x] Implementar `onShoot`: fase, vivo, arma, cargador, cadencia, origen,
      alcance, LOS y `targetId`; aplicar daño a escudo/vida.
- [x] Implementar `onThrow`, simulación de granadas y explosión con daño a
      todos los jugadores dentro del radio.
- [x] Implementar `onReload` y `onEquip` con las mismas reglas que
      `deathmatch.ts`, pero con reserva universal.
- [x] Implementar loot: resolver 70 anclas al inicio con la semilla, entrega
      automática por proximidad, retirada del mundo y eventos.
- [x] Implementar muertes, crédito de baja, drop del arma equipada, puesto,
      killfeed y condición de victoria/timeout.
- [x] Implementar reconexión: conservar estado 20 s, eliminar al expirar,
      rechazar entrada nueva en `playing`, sin sustituir al desconectado por bot.
- [x] Crear `server/rooms/RoyaleRoom.ts` copiando el patrón de
      `DeathmatchRoom.ts`, con `tick` a 100 ms, `onPlayerJoin/Leave`,
      `go-lobby` y rechazo.
- [x] Crear `server/engines/royaleCombat.ts` con segmento 3D vs cajas,
      `spreadDirection`, `rayPointDistance2D` y daño de granada.
- [x] Crear `server/engines/royaleNav.ts`: decodificar `nav`, `worldToCell`,
      `cellToWorld`, `isWalkable`, `findPath` A* (≤ 4 000 nodos), suavizado
      por segmento vs oclusores y altura de suelo.
- [x] Crear `server/engines/royaleBots.ts` con el estado de cada bot:
      `riding → skydive → glide → ground`, objetivo de loot/rotación/combate,
      percepción, reacción, puntería con error, granadas, atasco y muerte.
- [x] Integrar los bots en `tick`: pensar a 5 Hz (contador de 2 ticks),
      mover a 10 Hz, recoger loot con la misma función que los humanos,
      aplicar tormenta y resolver disparos con `royaleCombat`.

### Fase 3 — Cliente: store, escena y zepelín

- [x] Crear `minigame8.svelte.ts` con snapshot, self, posiciones
      interpoladas, vivos, loot, tormenta, killfeed, corrección y `reset()`.
- [x] Crear `royaleInput.ts` y `royaleEffects.svelte.ts`.
- [x] Extender `Zeppelin.svelte` con props `path`, `pathSpeed`, `pathTime` y
      `pathActive`; calcular posición y yaw tangente; conservar órbita/fija.
- [x] Crear `RoyaleDrop.svelte` que monta `Zeppelin` con el path compartido y
      calcula la posición desde `boardingStartedAt`.
- [x] Añadir `islas-ciudad` al render de `Scene.svelte` y montar
      `RoyaleSession`, `RoyaleDrop`, `RoyaleRemotes`, `RoyaleLoot`,
      `RoyaleStorm` y `RoyaleProjectiles` solo con `inRoyale`.
- [x] Extender `PlayerCollider.svelte`:
  - `riding`: cuerpo pegado al zepelín, gravedad 0 y `frozen` lógico.
  - `skydive`: gravedad 40, caída máxima 40, control 9, deploy a 55/4.5 s.
  - `glide`: caída 6, avance 12, sin salto.
  - `ground`: física actual.
  - Kill floor `y < -8`, sin respawn dentro de la partida.
  - Entrada/salida de escena y `ROYALE_EXIT`.
- [x] Extender `PlayerBehaviour.svelte` para reportar `mg8-position` con modo,
      yaw y velocidad vertical; animaciones de salto/planeo/muerte; ocultar
      interacciones de hub.
- [x] Crear `RoyaleSession.svelte` que envíe posición a 10 Hz, consuma
      `mg8-correct`, `respawnRequest` (no aplica), `exitRequest` y `go-lobby`.
- [x] Asegurar que el cliente trata a los bots como remotos normales: sin IA
      local, sin física local, solo interpolación desde `mg8-positions`.

### Fase 4 — Escena de combate y loot

- [x] Crear `RoyaleLoot.svelte`: modelos de `weaponModels.ts`, halo, color,
      y `visible` según snapshot; sin duplicar geometría.
- [x] Crear `RoyaleStorm.svelte`: cilindro abierto, anillo, interpolación y
      material con `depthWrite: false`.
- [x] Crear `RoyaleProjectiles.svelte` reutilizando `GrenadeProjectile` y
      `WaveExplosion`; trazadoras/chispas desde `royaleEffects`.
- [x] Crear `RoyaleRemotes.svelte` con `SkinCharacter`, interpolación 10 Hz,
      etiqueta de nombre, chip `BOT`, escudo y estado de salto/planeo.
- [x] Crear `RoyaleControls.svelte` con disparo, granada, recarga, ranuras,
      salto/expulsión y asistencia de puntería.
- [x] Añadir los controles táctiles de `inRoyale` en `MobileControls.svelte`.

### Fase 5 — HUD, minimapa y overlays

- [x] Crear `RoyaleHud.svelte` con vivos, humanos/bots, kills, timer de
      tormenta, HP, escudo, arma, cargador, reserva, granadas, estado de salto
      y flecha a la zona segura.
- [x] Crear `RoyaleMinimap.svelte` en SVG con `projectRoyale(x,z)`, bounds,
      POI, jugador, círculo actual y siguiente.
- [x] Crear `RoyaleKillfeed.svelte` y `RoyaleTopAlive.svelte` con chip `BOT`.
- [x] Crear `RoyaleOverlay.svelte` con espera, countdown, aviso de bots,
      salto, eliminación, espectador, resultados y victoria.
- [x] Crear `RoyaleSpectator.svelte` y enlazarlo a la cámara cuando el jugador
      local está muerto; debe poder seguir a un bot.
- [x] Montar HUD/overlays en `GamePage.svelte` y ocultar `MissionHud` durante
      la partida.

### Fase 6 — Audio, misión y cierre

- [x] Añadir `royale` a `CountdownSource` de `AudioBootstrap.svelte` y los
      cues de salto, planeo, tormenta, eliminación y victoria.
- [x] Añadir `royale-first-win` a `lib/missions/minigames.ts` y persistirlo con
      el helper genérico de misiones.
- [x] Crear `verify-royale.mjs`, `verify-royale-match.mjs`,
      `verify-royale-balance.mjs` y `verify-royale-bots.mjs`.
- [x] Añadir los scripts a `package.json`.
- [x] Actualizar `SPEC-009` con la integración final del mapa.
- [x] Ejecutar la verificación completa y actualizar este spec (estado,
      progreso, checkboxes y changelog).

## 8. Verificación

```bash
cd frontend

# Datos del battle royale, mapa y bots
bun run royale:build
bun run royale:check
bun run royale:balance
bun run royale:match
bun run royale:bots

# Registro del mapa y físicas
bun run world:sync
bun run islas-ciudad:check
bun run map:check

# Calidad general
bun run check
bun run lint
bun run build
```

> `world:check` completo puede seguir mostrando los SHA preexistentes de mapas
> antiguos. La comprobación que debe pasar para este spec es
> `islas-ciudad:check` y `map:check`.

Casos manuales:

1. **Checkpoint**: entrar a `global`, caminar hasta `(60, 0, 60)`, ver el cartel
   `SKYFALL ROYALE`, pulsar `E` y comprobar que se entra a `minigame-8`.
2. **Solo con bots**: entrar con una sola pestaña y comprobar que se ve
   `1 humano + 11 bots`, que la cuenta atrás de 30 s arranca sola y que se
   puede jugar la partida completa sin esperar a nadie.
3. **Zepelín**: al empezar `playing`, el humano y los 11 bots aparecen en el
   mismo zepelín sobre el path, a 140 m, con hélices girando; comparar la
   posición de un bot en dos clientes.
4. **Salto y planeo**: pulsar `Space`, ver caída libre, `GLIDER OPEN` a 55 m,
   aterrizar en el Faro y caminar; repetir cayendo en un hotel y en un muelle.
5. **Auto-expulsión**: no pulsar nada; a los 32 s el jugador cae solo y a los
   36.5 s el zepelín ya no está.
6. **Loot**: recoger escopeta, SMG, rifle, munición, botiquín, escudo y granada;
   comprobar HUD, modelos y que el objeto desaparece para el otro cliente.
7. **Combate**: disparar a un bot, comprobar escudo/vida, kill, killfeed, drop
   del arma y que no reaparece.
8. **Tormenta**: esperar fuera de zona y comprobar daño creciente, escudo, HUD,
   cilindro, aviso de 10 s y muerte por tormenta sin autor.
9. **Victoria contra bots**: matar al último bot y ver `VICTORY ROYALE`, podio,
   stats, botón y auto-salida a `(60, 0.4, 60)`.
10. **Timeout y reconexión**: forzar 600 s sin muertes y comprobar el ranking;
    recargar una pestaña en `playing` y reconectar dentro de 20 s; comprobar
    que no aparece un bot en el hueco del desconectado.
11. **Móvil**: probar salto, disparo, granada, recarga, ranuras y espectador en
    una vista táctil.
12. **Regresión**: entrar a cripta, Grand Prix, Barn Siege, Witch House,
    Parkour y hub; comprobar que el nuevo checkpoint y la room `royale` no
    interfieren.
13. **Entrada con bots**: abrir una segunda pestaña durante `countdown` y
    comprobar que desaparece un bot, el total sigue en 12 y la cuenta atrás no
    se reinicia. Cerrar la segunda pestaña y comprobar que vuelve un bot.
14. **IA de bots**: observar que los bots saltan en momentos distintos,
    aterrizan en POIs distintos, recogen loot, rotan con la tormenta, se
    cubren, disparan en ráfagas y no atraviesan paredes.
15. **Bot ganador y espectador**: dejar que gane un bot y comprobar el podio,
    el chip `BOT` y que la misión local no se registra; morir y espectar a un
    bot con `V`.
16. **Cierre con humanos**: salir de la única pestaña en `playing` y
    comprobar que la room vuelve a `idle`, que no quedan bots y que no siguen
    timers ni consumo de IA.

## 9. Riesgos y mitigaciones

| Riesgo                                                      | Impacto | Mitigación                                                                                                                   |
| ----------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `islas_ciudad.glb` es grande y puede bajar FPS en móvil     | alto    | Draco, `three` cacheado, sin duplicar materiales, 70 loot y 12 remotos; medir con `?physics` y limitar sombras.              |
| Anclas de loot dentro de paredes, agua o tejados            | alto    | `royale:build` rasteriza suelo y descarta paredes/agua; `royale:check` vuelve a validar y falla si un ancla no es válida.     |
| El cliente atraviesa el suelo al aterrizar desde 140 m      | alto    | `PlayerCollider` usa el character controller existente, limita `dt` y valida `computedGrounded`; prueba desde cada POI.       |
| Desincronización del zepelín entre clientes                 | medio   | Posición calculada desde `boardingStartedAt` + path compartido; sin mensajes por frame; snapshot incluye el tiempo.           |
| Tormenta deja el círculo final en agua o fuera del mapa     | alto    | Centros elegidos entre 14 POI validados; containment matemático; `royale:check` simula 1 000 semillas.                        |
| LOS del servidor con ~1 000 cajas es costoso                | medio   | Slab test 3D puro, solo en disparos (no en tick), cajas fusionadas y primera caja que corta el segmento.                       |
| Loot mal repartido (todo armas o todo curas)                | medio   | Tabla ponderada + `royale:balance` con 10 000 simulaciones y rangos aceptados.                                                |
| El jugador muerto no tiene nada que hacer                   | medio   | Overlay de eliminación con puesto, stats, espectador y salida inmediata.                                                     |
| Entrada tardía rompe la partida                             | alto    | Rechazo en `playing`/`results` con `ROYALE_IN_PROGRESS`; solo `idle`/`countdown`.                                             |
| Reconexión deja un cuerpo fantasma                          | medio   | `player-left` mantiene el cuerpo 20 s; al expirar se elimina y se emite evento; `reset()` limpia todo al vaciar la room.      |
| HUD demasiado cargado en móvil                              | medio   | Panel de vivos colapsable, killfeed corto, minimapa 180 px y botones táctiles ≥ 44 px.                                       |
| Cambios en `Zeppelin.svelte` rompen el zepelín del hub       | medio   | El modo `path` es opt-in; sin `path` se conserva órbita/fija y las pruebas de `map:check` siguen pasando.                    |
| Bots atascados o atravesando paredes                         | alto    | Rejilla de 2 m validada por `royale:check`, A* con componente conectada, suavizado por LOS, detección de atasco y repath; `royale:bots` prueba 500 partidas y falla si un bot no avanza. |
| Bots demasiado letales o demasiado tontos                    | alto    | Perfil único con error de puntería 1.5–4°, reacción 250–700 ms y seguimiento imperfecto; `royale:bots` mide duración, muertes y win rate del humano de referencia y falla fuera de rango. |
| CPU del servidor por 11 bots                                 | alto    | Pensamiento a 5 Hz, movimiento a 10 Hz, A* solo al cambiar de objetivo/atasco, límite de 4 000 nodos y caché por bot; una room sin humanos no simula nada. |
| Los bots revelan posiciones o se sienten injustos           | medio   | Detección con FOV + LOS real, sin visión omnisciente, sin disparos a través de muros, chip `BOT` visible y sustitución por humanos en cuanto entran. |
| Los bots mantienen viva una partida sin humanos              | medio   | Al salir el último humano se cancelan timers y se eliminan bots, loot y tormenta; se verifica entrando/saliendo 10 veces.                                     |
| La rejilla de navegación queda obsoleta si cambia el mapa    | medio   | `royale:build` la regenera y `royale:check` valida POI, anclas, agua y conectividad antes de aceptar el JSON.                                                |

## 10. Preguntas abiertas

Ninguna bloqueante. Las decisiones de diseño están cerradas en §11.

Futuras mejoras fuera de este spec:

- [ ] ¿Añadir estadísticas históricas de victorias/kills por jugador?
- [ ] ¿Añadir escuadrones 2v2/3v3 en una room separada?
- [ ] ¿Añadir rarezas de loot y cofres con animación?
- [ ] ¿Añadir selector de dificultad de bots (`fácil`, `normal`, `difícil`) y perfiles por arma?
- [ ] ¿Añadir bots de relleno a otros minijuegos multijugador?
- [ ] ¿Añadir chat/voz o *emotes* de bots? (fuera de alcance: los bots no chatean)

## 11. Decisiones y notas

### 11.1 Mapa, checkpoint y datos generados

- Se usa `islas_ciudad.glb` completo; no se recorta ni se crea una arena.
- El checkpoint vive en el mapa global (`map.glb`), no dentro de la partida.
  Coordenada `(60.0, 0.40, 60.0)`, en la zona abierta entre la plaza y
  `TWN_Building_16`, con radio 2.2. El `y = 0.4` es la altura del marcador
  sobre el suelo, no la del terreno.
- Validación realizada contra `frontend/world/source/map.glb` +
  `frontend/world/map.physics.json` (raycast descendente desde `y = 300`):
  - el punto cae sobre `TWN_Plaza` a `y ≈ 0.03`, sin techo ni edificio encima;
  - el muro/obstáculo más cercano está a **17.0 m** (`CCC_Fence`), así que el
    checkpoint no se solapa con ninguna pared;
  - el checkpoint existente más cercano es el Grand Prix `(83, 0.06, -3)` a
    **67 m**; no hay solape con `minigame-2`…`minigame-7`;
  - no hay agua en el punto (el hub no usa el océano de `islas_ciudad`).
- `royale:check` repite esta validación de forma automática y falla si el
  punto deja de estar sobre suelo transitable o se acerca a menos de 2.5 m de
  un muro.
- `frontend/world/islas-ciudad.royale.json` es dato de build, no de runtime:
  - `bounds`: AABB del mapa.
  - `pois`: 14 centros con nombre, radio de influencia y bounds.
  - `lootAnchors`: 70 posiciones `{ id, poi, x, y, z }` a 0.9 m del suelo.
  - `occluders`: cajas `[minX, minY, minZ, maxX, maxY, maxZ]` para LOS.
- El JSON se importa desde `royaleConfig.ts`; el servidor y el cliente ven
  exactamente los mismos datos.

### 11.2 Reglas, fases y timings

| Constante                    | Valor       | Nota                                                     |
| ---------------------------- | ----------- | -------------------------------------------------------- |
| `ROYALE_MAX_PLAYERS`         | 12          | Sin equipos.                                             |
| `ROYALE_MIN_HUMANS`          | 1           | Con bots, un solo humano puede empezar.                  |
| `ROYALE_BOTS_ENABLED`        | true        | Se puede desactivar en pruebas.                          |
| `ROYALE_BOT_FILL`            | 11          | Bots máximos para completar 12 participantes.            |
| `ROYALE_BOT_THINK_MS`        | 200         | La IA decide a 5 Hz; el movimiento se aplica a 10 Hz.    |
| `ROYALE_BOT_VIEW_RANGE`      | 55          | Detección de enemigos, con LOS.                          |
| `ROYALE_BOT_FOV_DEG`         | 120         | Cono de visión inicial.                                  |
| `ROYALE_BOT_REACTION_MS`     | 250–700     | Retardo antes del primer disparo.                        |
| `ROYALE_BOT_AIM_ERROR_DEG`   | 1.5–4.0     | Error angular determinista por bot y objetivo.           |
| `ROYALE_BOT_JUMP_MS`         | 3 000–30 000| Ventana de salto; nunca después de la auto-expulsión.    |
| `ROYALE_BOT_LOOT_SCAN`       | 30          | Radio de búsqueda de loot.                               |
| `ROYALE_BOT_STORM_MARGIN`    | 8           | Margen dentro del círculo seguro.                        |
| `ROYALE_BOT_GRENADE_CD_MS`   | 8 000       | Cooldown de granada por bot.                             |
| `ROYALE_COUNTDOWN_MS`        | 30 000      | No se reinicia.                                          |
| `ROYALE_MATCH_MS`            | 600 000     | 10 min; timeout por HP+escudo/kills/daño.                |
| `ROYALE_RESULT_MS`           | 20 000      | Salida manual o automática.                              |
| `ROYALE_JUMP_DELAY_MS`       | 1 500       | Se puede saltar casi al instante.                        |
| `ROYALE_JUMP_WINDOW_MS`      | 32 000      | Auto-expulsión a los 32 s.                               |
| `ROYALE_BOARDING_MS`         | 36 500      | Fin del vuelo.                                           |
| `ROYALE_POSITION_INTERVAL_MS`| 100         | 10 Hz.                                                   |
| `ROYALE_STATE_INTERVAL_MS`   | 1 000       | 1 Hz.                                                    |
| `ROYALE_SHOT_ORIGIN_TOL`     | 2.5         | Margen de red para el origen del disparo.                |
| `ROYALE_LOOT_RADIUS`         | 1.8         | Pickup automático.                                       |
| `ROYALE_MAX_AMMO`            | 300         | Reserva universal.                                       |
| `ROYALE_MAX_GRENADES`        | 4           | Granada.                                                 |
| `ROYALE_MAX_SHIELD`          | 100         | Escudo.                                                  |
| `ROYALE_KILL_Y`              | −8          | Por debajo se elimina (`fell`).                          |

- `idle`: sala abierta, se puede entrar/salir. Al entrar el primer humano se
  completa con bots y arranca `countdown`.
- `countdown`: 30 s, movimiento/combate bloqueados, cámara libre; los humanos
  que entran sustituyen bots y los que salen se reemplazan por bots.
- `playing`: empieza el vuelo del zepelín; humanos y bots pueden saltar,
  aterrizar, luchar y morir; la tormenta espera 60 s. Termina con 1 vivo o a
  los 600 s.
- `results`: 20 s; ganador, podio, stats locales y salida.
- Al quedarse sin humanos se vuelve a `idle`, se eliminan los bots y se limpia
  todo.

### 11.3 Zepelín y path

Path compartido `ROYALE_ZEPPELIN_PATH` (altitud 140 m):

| # | Waypoint (x, y, z) | Zona sobrevolada        |
| - | ------------------ | ----------------------- |
| 0 | `(-150, 140, -170)` | Resort noroeste / sur   |
| 1 | `(-80, 140, -80)`   | Isla oeste              |
| 2 | `(0, 140, 0)`       | Faro Viejo              |
| 3 | `(80, 140, 80)`     | Resort este             |
| 4 | `(160, 140, 160)`   | Comercios / hoteles     |

- Velocidad `12.5 m/s`, longitud ≈ 453 m, duración ≈ 36.5 s.
- `royaleZeppelinAt(boardingStartedAt, now)` devuelve `{ x, y, z, yaw }`.
- Los jugadores se colocan en asientos laterales alrededor del zepelín para no
  solaparse (offsets de 1.2 m en X/Z). Los bots usan los mismos asientos.
- `Zeppelin.svelte` gana un modo `path` opt-in:
  ```svelte
  <Zeppelin path={ROYALE_ZEPPELIN_PATH} pathTime={elapsed} pathActive />
  ```
  Sin `path` conserva la órbita actual del hub.
- El cliente calcula `elapsed` desde `serverNow() - boardingStartedAt`; no se
  envían posiciones del zepelín por red.

### 11.4 Skydive y glider

| Estado    | Gravedad | Caída máx. | Avance | Salto | Condición de salida                  |
| --------- | -------- | ---------- | ------ | ----- | ------------------------------------ |
| `riding`  | 0        | 0          | 0      | no    | `mg8-jump` o auto-expulsión          |
| `skydive` | 40       | 40         | 9      | no    | `y ≤ 55` o 4.5 s desde el salto      |
| `glide`   | 6        | 6          | 12     | no    | `computedGrounded`                   |
| `ground`  | 18       | 30         | 8      | sí    | —                                    |

- El planeo se abre automáticamente; no hay botón de cerrar.
- El cliente envía `mode` en cada `mg8-position`; el servidor solo acepta la
  secuencia `riding → skydive → glide → ground` (o `riding → ground` si cae
  justo en el zepelín).
- No hay daño por caída.
- Si `y < -8` el servidor elimina con causa `fell`.
- Los bots usan exactamente las mismas alturas, gravedad y planeo; su salto y
  su punto de aterrizaje los decide el servidor, no el cliente.
- La cámara mantiene la tercera persona con el perfil de combate de
  Barn Siege (`SPEC-023`): radio `6.5 m` (rango `4–12`), hombro derecho
  `0.9 m`, objetivo a la altura del pecho (`+1.55 m`), entrada detrás del
  avatar (`theta = π`, `phi = 0.16`, `phi ∈ [-0.2, 1.0]`). El FOV puede subir
  ligeramente en caída libre (opcional, solo presentación).

### 11.5 Tormenta

| Fase | Radio | `waitMs` | `shrinkMs` | Daño (HP/s) |
| ---- | ----- | -------- | ---------- | ----------- |
| 0    | 400   | 75 000   | 0          | 0           |
| 1    | 260   | 45 000   | 30 000     | 1           |
| 2    | 180   | 30 000   | 25 000     | 2           |
| 3    | 120   | 30 000   | 25 000     | 3           |
| 4    | 70    | 30 000   | 25 000     | 5           |
| 5    | 35    | 30 000   | 25 000     | 8           |
| 6    | 10    | 30 000   | 20 000     | 12          |
| 7    | 3     | 20 000   | 15 000     | 20          |

- `ROYALE_STORM_START_MS = 60_000` después de `playing`. La fase 0 no hace
  daño y cubre todo el mapa (radio 400 desde `(0,0)`).
- Centros: `royaleStormAt(matchStartedAt, now, seed)` usa `mulberry32(seed)` y
  elige un POI que cumpla `dist(prev, next) ≤ prevRadius - nextRadius - 5`.
  Si no hay candidato, camina hacia el POI más cercano y recorta la distancia.
- El snapshot incluye `storm: { phase, cx, cz, radius, nextCx, nextCz,
  nextRadius, endsAt, dps, state: 'wait'|'shrink' }`.
- El daño se aplica cada 1 s a quien esté a `dist > radius`. Consume escudo
  antes que vida. No tiene autor.
- El cliente dibuja un cilindro de 200 m de alto centrado en `(cx, cz)`, un
  anillo en el suelo y el siguiente círculo con línea discontinua. Durante
  `shrink` interpola centro y radio con el reloj del servidor.
- Los bots consultan la misma tormenta: si están fuera o falta ≤ 20 s para el
  cierre, navegan a un punto seguro con 8 m de margen. Nunca reciben un trato
  especial.

### 11.6 POI, loot y economía

14 POI de referencia (el JSON generado ajusta el `y` al suelo real):

| POI                  | Centro XZ     | Tema / loot                                                        |
| -------------------- | ------------- | ------------------------------------------------------------------ |
| `faro-viejo`         | `(0, 8)`      | Faro, plaza y calles centrales; alta densidad.                     |
| `comercios-este`     | `(158, 6)`    | Calle de tiendas; armas y escudos.                                 |
| `resort-este`        | `(105, 55)`   | Resort con piscinas y habitaciones.                                |
| `resort-noreste`     | `(100, -100)` | Resort grande; loot disperso.                                      |
| `resort-noroeste`    | `(-100, -100)`| Resort con jardines.                                               |
| `resort-oeste`       | `(-140, 0)`   | Resort junto al muelle oeste.                                      |
| `hoteles-norte`      | `(-110, 120)` | Hoteles altos; rifle y botiquines.                                 |
| `servicios-norte`    | `(-20, 100)`  | Naves de servicio; munición.                                       |
| `isla-sur`           | `(0, -160)`   | Isla sur; loot equilibrado.                                        |
| `distrito-civico`    | `(6, 163)`    | Hospital, bomberos y policía; botiquines y escudos.                |
| `muelle-sur`         | `(0, -205)`   | Docks; armas y munición.                                           |
| `muelle-este`        | `(190, 0)`    | Docks; escopeta/SMG.                                               |
| `muelle-oeste`       | `(-170, 0)`   | Docks; rifle.                                                      |
| `muelle-norte`       | `(0, 230)`    | Docks; loot variado.                                               |

- 70 anclas, 5 por POI, separadas ≥ 6 m, a 0.9 m sobre el suelo y ≥ 1.2 m de
  paredes.
- Tabla por ancla: 45 % arma, 20 % munición, 13 % escudo, 12 % botiquín,
  10 % granada.
- Arma: 30 % escopeta, 30 % SMG, 20 % rifle, 20 % pistola.
- Munición universal: +60, máximo 300. Botiquín: +40 HP, máximo 100. Escudo:
  +50, máximo 100. Granada: +1, máximo 4.
- Un arma recogida llega con cargador lleno y una reserva de un cargador
  (pistola 12, escopeta 6, SMG 30, rifle 5). Si ya se tiene, se recarga y se
  añade munición.
- Al morir se suelta el arma equipada con el cargador actual (no la reserva).
- No hay loot que reaparezca; si se acaba, se acaba.
- Los bots compiten por el mismo loot: no existe reserva ni prioridad para
  humanos. El primero que llega en el tick del servidor se lo queda.

### 11.7 Combate, daño y muerte

- HP 100 + escudo 100. El escudo absorbe primero; no se regenera.
- Pistola 12 / 6 Hz / 55 m / cargador 12.
- Escopeta 8 × 6 con dispersión ±7° / 1.2 Hz / 32 m / cargador 6.
- SMG 9 / 11 Hz / 42 m / cargador 30.
- Rifle 46 / 1.5 Hz / 130 m / cargador 5.
- Granada: 75 centro → 30 borde, radio 4.5 m, espoleta 1.5 s, autodaño.
- Sin daño amigo (todos son enemigos). Sin headshots ni multiplicadores.
- El servidor valida LOS con las cajas de oclusión; no se puede matar a través
  de paredes, techos o rocas.
- Crédito de baja: último daño en 5 s. Tormenta/caída no dan kill.
- Al morir: `placement = vivosAntesDeMorir`, drop del arma, evento `kill` o
  `death`, killfeed y paso a espectador.
- No hay respawn bajo ningún concepto; reconectar no revive.
- Los bots aplican y reciben exactamente el mismo daño, escudo, cadencia y
  crédito de baja; sus disparos se resuelven con el mismo hitscan del servidor.

### 11.8 Victoria, resultados y espectador

- Gana el último vivo. Si el último muere por tormenta junto a otro, gana el
  que quede vivo; si no queda ninguno, `winner = null` y se muestra `Draw`.
- Timeout: ranking por `HP + escudo` descendente, luego kills, luego daño.
- `results` muestra `VICTORY ROYALE` o `#N`, kills, daño, tiempo, podio de 3 y
  botón `Back to the village`; auto-salida a 20 s.
- El jugador eliminado ve `ELIMINADO #N` y puede:
  - espectar al asesino o al líder vivo (`V` cicla),
  - orbitar con ratón/stick,
  - salir a `global`.
- La cámara de espectador no colisiona ni dispara; el cuerpo local queda
  oculto.
- Los bots pueden ser asesinos, líderes vivos o ganadores; el espectador y el
  podio los tratan igual que a un humano, con chip `BOT`.

### 11.9 HUD, minimapa y controles

- HUD superior: `ALIVE 7 / 12`, `HUMANS 2 · BOTS 10`, `KILLS 3`, timer de
  tormenta (`CIERRE EN 0:45` o `CÍRCULO 3/7`), fase y daño por segundo.
- HUD inferior: HP, escudo, arma, cargador/reserva, granadas y ranuras 1–4.
- Flecha de zona segura: ángulo y distancia; roja si estás fuera.
- Minimapa 180 × 180, norte arriba, bounds
  `x [-190, 230]`, `z [-240, 260]`; proyecta con escala única y letterbox.
- Panel derecho: top 5 de vivos por kills, colapsable, con chip `BOT`; estado
  vacío si no hay datos.
- Killfeed: `A eliminó a B con Rifle`, `Bot Paco eliminó a A con SMG`,
  `B se perdió en la tormenta`, `B cayó al mar`.
- Controles: `WASD`, ratón, `Space` (saltar/saltar del zepelín), `G`
  (granada), `R` (recargar), `1`–`4` (ranuras), `V` (espectador), `Esc`
  (salir/pausa local).
- Móvil: joystick, arrastre para cámara, botones de disparo/granada/recarga,
  salto y ranuras; sin botón de coche.

### 11.10 Protocolo (resumen)

Servidor → cliente:

- `mg8-state`: fase, `serverTime`, `countdownEndsAt`, `matchStartedAt`,
  `boardingStartedAt`, `matchEndsAt`, `resultEndsAt`, `storm`, `players`
  (con `isBot`), `humans`, `bots`, `loot`, `placements`, `winner`,
  `waitingForPlayers`.
- `mg8-positions`: `at`, jugadores `{ id, x, y, z, yaw, mode, alive }`
  (humanos y bots), granadas `{ id, x, y, z }`.
- `mg8-event`: `player-joined`, `player-left`, `bot-added`, `bot-removed`,
  `match-started`, `player-jumped`, `player-landed`, `loot-taken`,
  `shot-fired`, `grenade-thrown`, `grenade-exploded`, `player-hurt`, `kill`,
  `player-died`, `storm-phase`, `storm-damage`, `match-ended`.
- `mg8-correct`: `{ x, y, z, mode, reason }`.
- `error`, `go-lobby`, `pong`.

Cliente → servidor:

- `mg8-position`: `{ x, y, z, yaw, mode, vy }`.
- `mg8-jump`, `mg8-shoot`, `mg8-throw`, `mg8-reload`, `mg8-equip`.

Reglas:

- `player-joined`/`player-left` son solo humanos; los bots usan
  `bot-added`/`bot-removed`.
- Los bots **no envían** mensajes cliente→servidor; los genera y consume el
  propio motor.
- Posiciones redondeadas a 2 decimales.
- `mg8-state` a 1 Hz y en cada cambio de fase o de plantilla (bot añadido o
  sustituido).
- `mg8-positions` a 10 Hz.
- `mg8-correct` solo cuando un reporte humano viola velocidad, modo, altura o
  bounds.
- `ByteBudget` comprueba cada broadcast; si supera 16 KiB, se recorta el
  killfeed/loot del snapshot (nunca el estado de los jugadores vivos ni los
  bots).

### 11.11 Autoridad y anti-cheat

- El cliente **no decide** loot, daño, kills, tormenta, puestos ni resultado.
- Posición: el servidor guarda la última posición válida y rechaza saltos de
  más de `maxSpeed * dt + 2 m`; en modo `ground` la velocidad máxima es 10,
  en aire 16. Si el reporte es inválido, `mg8-correct`.
- Salto: solo desde `riding`, una vez, dentro de la ventana.
- Disparo: arma equipada, cargador, cadencia, origen, alcance, LOS y target
  dentro del cono.
- Granada: máximo 4, cooldown 500 ms, posición de origen válida y simulación
  del servidor.
- Loot: el servidor comprueba distancia y disponibilidad; el primero que
  llega se lo queda.
- Tormenta: calculada con reloj del servidor; el cliente solo interpola.
- Bots: viven solo en el servidor; el cliente no puede crearlos, moverlos,
  matarlos ni cambiar su dificultad. No tienen mensajes ni canal propio.
- No se confía en `kills`, `damage` ni `placement` enviados por el cliente.

### 11.12 Reutilización concreta

- **Mapa**: `IslasCiudad.svelte`, `islas-ciudad.physics.json`, Draco local.
- **Zepelín**: `Zeppelin.svelte` (modelo, hélices, animaciones) + modo `path`.
- **Armas**: `wavesConfig.ts`, `weaponModels.ts`, GLB de `static/weapons` y
  `static/props`.
- **Combate**: `combat.ts` (helpers puros), patrón de `deathmatch.ts`.
- **IA**: patrón de percepción/objetivos/ataques de `waves.ts`, reescrito para
  navegación abierta y participantes humanos; sin importar spawns ni monstruos.
- **Pickups**: `DeathmatchPickups.svelte` como referencia visual; nueva
  `RoyaleLoot.svelte` porque no hay reaparición ni 13 posiciones fijas.
- **HUD**: `DeathmatchHud`, `DeathmatchKillfeed`, `DeathmatchTop5`,
  `DeathmatchOverlay` como referencia; nueva carpeta `royale/` para no mezclar
  reglas.
- **Protocolo/rooms**: patrón `Mg6*`, `DeathmatchRoom`, `go-lobby`.
- **Audio**: `SPEC-024`, sin assets nuevos.
- **Misiones**: `missions.svelte.ts` y `missions/minigames.ts`.

### 11.13 Rendimiento y presupuesto

- El mapa tiene 419 017 triángulos y 3 137 nodos; no se clona por jugador.
- Los remotos usan `SkinCharacter` cacheado.
- Loot: 70 modelos clonados desde caché; si un modelo falla, se usa una
  primitiva de respaldo.
- Tormenta: 2 mallas (cilindro + anillo), no un shader por píxel.
- Minimapa: SVG estático + círculos; no se redibuja el mapa cada frame.
- Snapshot: 12 jugadores × 4 ranuras + 70 loot ≈ 6–8 KiB; posiciones
  ≈ 1.5 KiB/frame. El campo `isBot` y `humans`/`bots` añaden < 100 B.
- Bots: 11 × 5 Hz de pensamiento y 11 × 10 Hz de movimiento; A* solo cuando
  cambia el objetivo o hay atasco. Presupuesto < 4 ms por tick; si se supera,
  se baja la frecuencia de pensamiento a 2.5 Hz antes que recortar visión o
  reglas.
- Se prueba con `?physics` y en móvil; si baja de 45 FPS, se reduce la sombra
  del mapa y el número de partículas, no la lógica.

### 11.14 Bots de relleno

#### 11.14.1 Plantilla y ciclo de vida

| Situación                          | Comportamiento                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1 humano entra a `idle`            | Se completa con 11 bots y arranca `countdown`.                                                          |
| 2–11 humanos en `idle`/`countdown` | Se completa con `12 - humanos` bots.                                                                    |
| 12 humanos                        | Se retiran todos los bots.                                                                              |
| Humano entra en `countdown`        | Se elimina el bot más reciente y se mantiene el total en 12.                                            |
| Humano sale en `countdown`         | Se añade un bot para volver a 12.                                                                       |
| Humano sale en `playing`           | Su cuerpo queda 20 s para reconectar; **no** se sustituye por un bot.                                   |
| Último humano sale                 | Se cancelan partida, timers, tormenta, loot, granadas y bots; la room vuelve a `idle`.                  |
| 0 humanos en `idle`                | No hay bots: no se simula IA sin jugadores.                                                             |

- `humanos + bots = 12`; los bots no ocupan plazas de `maxPlayers` ni tienen
  WebSocket. El motor mantiene `humans` y `bots` separados (o un flag
  `isBot`) y filtra el conteo de la room, `sendTo` y la validación de
  mensajes.
- IDs `bot:<seed>:<n>`; nombres de una lista de 24, elegidos con la semilla y
  sin repetir. `isBot: true` viaja en el snapshot y en `mg8-positions`.
- El relleno ocurre en el mismo instante en que arranca `countdown`; una room
  vacía no simula IA ni tiene bots esperando.
- En `results` no se añaden bots; la composición queda congelada hasta
  `idle`.

#### 11.14.2 Perfil único «normal»

- No hay selector de dificultad. Todos los bots usan el mismo perfil, con
  variación determinista por semilla:
  - reacción inicial `250–700 ms`;
  - error de puntería `1.5–4.0°`, mayor a más distancia;
  - ráfagas de `3–8` disparos y pausas de `0.4–1.1 s`;
  - strafe continuo con cambio de sentido cada `0.7–1.6 s`;
  - 12 % de probabilidad de granada por ventana de 8 s, si el objetivo está a
    `10–28 m` y hay LOS;
  - velocidad terrestre `5.5 m/s` (`3.1 m/s` al hacer strafe cerca y `8 m/s`
    al rotar o huir).
- Los bots no tienen HP extra, escudo gratis, munición infinita, visión
  omnisciente ni velocidad superior a la humana.
- Tampoco usan la asistencia de puntería del cliente: calculan una dirección
  con error y el servidor resuelve el hitscan como el de cualquier jugador.

#### 11.14.3 Navegación

- `royale:build` rasteriza el suelo a `2 m` y guarda una rejilla compacta:
  `{ cellSize: 2, originX, originZ, cols, rows, walkable, heights }`.
- Solo se marcan celdas caminables si:
  - hay suelo (`suelo`) y no es agua;
  - no es un tejado, azotea, marquesina ni pretil;
  - la pendiente es ≤ 20°;
  - hay ≥ 0.9 m libres respecto a `paredes`/`obstaculos`;
  - la celda pertenece a la componente conectada principal.
- `royaleNav.findPath` usa A* 4-direccional (diagonales solo si ambos vecinos
  ortogonales son caminables), coste 1/1.414, máximo 4 000 nodos y suavizado
  por segmento contra cajas de oclusión. La heurística es ALT: campos de
  distancia Dijkstra desde seis *landmarks* (extremos y centro de los POI),
  calculados una sola vez y usados como cota inferior admisible. Sin ellos,
  las rutas largas entre islas agotaban el presupuesto de 4 000 nodos; con
  ALT encuentran la misma ruta en ~600 nodos.
- El bot piensa a `5 Hz` (cada `200 ms`) pero se desplaza en cada tick del
  servidor (`10 Hz`, pasos de `0.1 s`): el movimiento es continuo y la
  rotación se interpola a `8 rad/s`. Así se ve tan fluido como los enemigos de
  Barn Siege en vez de dar saltos de `200 ms`.
- El bot avanza por waypoints con radio de llegada `0.5 m`; la altura sale de
  la celda de destino y los escalones pequeños se suavizan. Antes de pisar una
  celda se comprueba que sea caminable: un waypoint de loot pegado a una pared
  ya no puede dejarlo atrapado dentro de una celda no caminable.
- La meta exacta de A* solo se usa si cae en una celda caminable; si no, se
  conserva el centro de la última celda válida.
- Si una intención no lo mueve (pared, esquina o agua) durante `0.3 s`, elige
  una celda libre cercana y la camina durante `1.5 s` con prioridad sobre el
  resto de intenciones. Si aun así aparece en una celda no caminable (estado
  heredado de una ruta antigua), se le lleva una sola vez al borde caminable
  más cercano (`≤ 3.8 m`); en navegación normal no hay teleport.
- Si no avanza > `0.5 m` en `1.5 s`, recalcula ruta; si falla 3 veces, elige
  otro objetivo de loot/rotación. El objetivo de patrulla y el de tormenta se
  mantienen estables hasta llegar o caducar; antes se recalculaban a `5 Hz` y
  el bot giraba en círculos sin avanzar.
- Los bots no suben tejados, no usan parkour, no conducen y no atraviesan
  puertas cerradas. Las puertas y porches abiertos sí forman parte de la
  rejilla.

#### 11.14.4 Salto y aterrizaje

- `jumpAt` se elige por semilla dentro de `[3 s, 30 s]` desde
  `boardingStartedAt`, siempre antes de la auto-expulsión de los 32 s.
- El punto de aterrizaje se elige entre las 28 anclas de bot (celdas
  caminables a ≤ 130 m del path, repartidas por POI), con un sesgo hacia el
  POI más cercano a la trayectoria del zepelín y evitando que todos caigan en
  el mismo sitio. El par `jumpAt`/ancla se valida contra el alcance horizontal
  del salto+planeo (~130 m); si no llega, se elige otra ancla o se adelanta el
  salto. Los POIs fuera del alcance del planeo se alcanzan caminando después
  de aterrizar.
- La caída y el planeo usan las mismas constantes que un humano
  (`skydive 40/40/9`, `glide 6/6/12`). El servidor mueve al bot y comprueba
  que el punto final está en una celda caminable; si no, usa la celda
  caminable más cercana.
- Al aterrizar se pasa a `ground`, se busca loot y se empieza a navegar. No hay
  daño por caída.

#### 11.14.5 Loot y economía

- Cada bot escanea loot no recogido en `30 m` y puntúa:
  1. arma que mejora su loadout o llena una ranura vacía;
  2. munición si tiene < 30;
  3. escudo si tiene < 50;
  4. botiquín si HP < 75;
  5. granada si tiene < 2.
- Se dirige al objetivo y recoge con la misma regla de `1.8 m` horizontal y
  `2.5 m` vertical que un humano. El motor aplica el pickup en el mismo tick
  para todos. Si el loot no es alcanzable (A* falla), se descarta y se elige
  el siguiente.
- Si no hay loot útil, patrulla hacia el POI seguro más cercano o hacia el
  centro de la zona segura.
- Los bots no reservan loot ni tienen prioridad; si un humano y un bot llegan
  en el mismo tick, gana el orden estable del servidor.

#### 11.14.6 Percepción y combate

- Detección inicial: enemigo a ≤ `55 m`, dentro de `120°` de FOV y con LOS
  contra las cajas de oclusión.
- Los disparos a ≤ `35 m` generan un «ruido» que actualiza la última posición
  conocida con un error de `±6 m`; los bots pueden investigar, pero no ver a
  través de paredes.
- El bot mantiene el objetivo durante `2 s` aunque salga del FOV, siempre que
  no haya perdido la LOS; después vuelve a patrullar.
- Elige el arma según distancia: escopeta < 12 m, SMG < 30 m, rifle > 30 m,
  pistola como respaldo. Recarga y cambia de arma con las mismas reglas.
- Dispara solo si el ángulo de error es menor que el umbral del arma y la
  cadencia lo permite; el daño lo aplica `royaleCombat` con el mismo hitscan,
  dispersión y alcance que un humano.
- La línea de tiro se valida contra pecho, cabeza y cadera del objetivo. El
  origen puede ser el cañón pegado a una esquina; antes bastaba con que un
  borde tapara el pecho para descartar el disparo con mira asistida y los bots
  parecían inmortales. El hitscan sin bloqueo usa `0.85 m` de tolerancia
  lateral y `y ∈ [-0.35, +2.2]`.
- Si recibe daño y no ve al atacante, se gira hacia la última posición
  conocida y busca cobertura u objetivo cercano; no dispara al aire.
- Si le queda poca vida, prioriza huir hacia una celda con cobertura y buscar
  botiquín/escudo, pero puede seguir combatiendo si no hay ruta.

#### 11.14.7 Tormenta y final de partida

- Si el bot está fuera del círculo actual, o faltan ≤ `20 s` para el cierre,
  navega a un punto fijo por fase dentro del siguiente círculo con `8 m` de
  margen. El punto se recalcula solo al cambiar de fase: antes la semilla del
  punto cambiaba en cada tick y el bot temblaba en el sitio.
- Si A* falla, avanza en línea recta hacia el centro evitando oclusores; si
  queda atrapado, el empujón de emergencia lo saca a una celda libre y sigue
  recibiendo daño como cualquiera.
- Con ≤ 4 vivos, reduce el radio de patrulla y se mueve hacia el centro seguro,
  usando paredes/rocas como cobertura. No se queda quieto en campo abierto.
- Los bots pueden morir por tormenta o caída; en ese caso no dan kill a nadie y
  se les asigna su puesto.

#### 11.14.8 HUD, espectador y misión

- `mg8-state` incluye `humans` y `bots` para que el HUD muestre
  `HUMANS 1 · BOTS 11`.
- Los bots llevan chip `BOT` en el panel de vivos, killfeed y podio. No se
  disfrazan de humanos.
- El espectador puede seguirlos con `V`; si el asesino es un bot, la cámara
  orbita sobre él.
- `royale-first-win` solo se registra si el ganador es el jugador local
  humano. Ganar contra bots cuenta para la misión; que gane un bot, no.
- La progresión NFT de la pista `royale` (`SPEC-045`) usa las estadísticas
  `royale.matches`, `royale.kills`, `royale.wins` y `royale.top3`. La guía de
  turismo (`SPEC-033`) muestra `royale-kills-10` → `sniper-gold`,
  `royale-kills-50` → `bazooka-gold` y `royale-kills-200` → `ghost`. El
  checkpoint y el kiosco no reclaman; el `Claim` vive en
  `MissionHud → Rewards`.

#### 11.14.9 Verificación y balance

- `royale:bots` ejecuta 500 partidas con 12 bots y semillas fijas:
  - exactamente 1 ganador y puestos únicos `1–12`;
  - duración media `240–540 s`, ninguna > `600 s`;
  - primera muerte después de `45 s`;
  - todos los bots se mueven, recogen loot y al menos el 70 % dispara;
  - sin NaN, sin `y < -8` en suelo, sin salir del mapa, sin atascos > `10 s`.
- Ejecuta 200 partidas con 1 humano de referencia (mira con error `1.0°`,
  rota con la tormenta y recoge loot) + 11 bots:
  - win rate del humano de referencia entre `15 %` y `45 %`;
  - ninguna partida termina antes de `300 s` por agresividad excesiva, salvo
    que queden ≤ 3 vivos;
  - los bots no ganan por daño de tormenta en > 35 % de las partidas.
- `royale:check` valida que los 14 POI, las 70 anclas de loot y las 28 anclas
  de bot están en celdas caminables y conectadas.
- `royale:match` incluye un modo `--bots` para probar 1 humano + 11 bots sin
  abrir 12 pestañas.
- El harness de `royale:bots` puede instanciar 12 bots sin humanos para medir
  la IA; producción nunca simula una room sin humanos.

### 11.15 Servidor activo (`backend/`)

- El juego en ejecución usa `backend/` (Elysia + Bun, WebSocket nativo en
  `/ws`), no las rooms de `frontend/src/server/`; estas últimas se conservan
  como copia de referencia para `royale:check`, `royale:balance`,
  `royale:match` y `royale:bots`.
- Por eso `minigame-8` existe en **ambos**: `backend/src/server/protocol.ts`
  declara los tipos `Mg8*`, `validate.ts` valida `mg8-*`, `index.ts` enruta
  `enter-lobby` al motor, publica `mg8-state/positions/event/correct` en
  `lobby:minigame-8` y lo tickea cada 100 ms.
- `backend/src/lib/state/royaleConfig.ts` y
  `backend/src/lib/state/islas-ciudad.royale.json` son copias del archivo
  generado; al cambiar el mapa o el balance hay que ejecutar `royale:build` y
  copiar ambos a `backend/`.
- El motor expone `canEnter(playerId)` sin efectos para que la presencia
  anuncie `canEnter` antes de mover al jugador; `onEnter` sigue siendo la
  autoridad final (rechaza `ROYALE_IN_PROGRESS` y `ROYALE_FULL`).

## 12. Progreso

| Fecha      | Estado   | Nota                                                                                                    |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------- |
| 2026-11-13 | borrador | Spec creado. Mapa `islas-ciudad` comprimido, físicas y componente manual ya validados.                  |
| 2026-11-13 | borrador | Añadidos bots de relleno: IA autoritativa, navegación A*, loot, combate, tormenta y verificación propia. |
| 2026-11-14 | implementado | **Skyfall Royale completo en `islas-ciudad`.** Checkpoint `minigame-8`, room `royale`, datos generados (`world/islas-ciudad.royale.json`: 14 POI, 70 loot, 28 anclas, 914 oclusores, rejilla 210×250 con 10 075 celdas), motor autoritativo y bots de relleno (hasta 11), cliente y HUD completos, audio, misión `royale-first-win` y guía. Navegación A* con heurística ALT por *landmarks* (mismas rutas, ~600 nodos frente al límite de 4 000); margen de tormenta adaptativo en círculos finales. Pasan `royale:build`, `royale:check`, `royale:balance`, `royale:match` (normal y `--bots`), `royale:bots` (500 solo-bots + 200 con humano de referencia), `world:sync`, `islas-ciudad:check`, `map:check`, `check`, `lint` y `build`. `SPEC-009` actualizado con la integración del mapa. |
| 2026-11-14 | implementado | **Portado al servidor activo `backend/`.** El checkpoint no iniciaba nada porque el runtime usa el WebSocket de Elysia/Bun y `frontend/src/server/` es solo la copia de verificación. Añadidos `minigame-8` en `LOBBY_IDS`/`MINIGAME_LOBBY_IDS`/`LOBBY_DEFINITIONS`, tipos `Mg8*`, validadores `mg8-*`, confianza de lobby (`canEnter`), topic `lobby:minigame-8`, tick a 100 ms y engine completo con bots. Smoke test real por WebSocket: `enter-lobby minigame-8` → presencia dentro, `mg8-state` en `countdown` con 1 humano + 11 bots. `bunx tsc --noEmit` en `backend/` en verde. |
| 2026-11-14 | implementado | **Pulido de cámara y bots.** La cámara de Royale usa el perfil de combate de Barn Siege (radio 6.5, hombro 0.9, pecho 1.55, entrada `theta = π`/`phi = 0.16`). Los bots piensan a 5 Hz pero se mueven de forma continua a 10 Hz con giro suavizado, objetivos de patrulla/tormenta estables y strafe continuo; ya no giran en círculos ni dan saltos de 200 ms. Corregida la navegación: los waypoints solo pisan celdas caminables, el objetivo exacto de A* se valida y un empujón de emergencia rescata al bot de una celda inválida. La línea de tiro acepta pecho/cabeza/cadera y el hitscan tiene tolerancia lateral `0.85 m`, así los bots son killables. Muestreo `royale:bots` 200+60: atascos ≤ `0.3 s`, humano de referencia `31.7 %` de victorias; la ejecución completa 500+200 queda en verde. |
| 2026-11-14 | actualizado  | **Recompensas NFT y guía de turismo.** La pista `royale` de `SPEC-045` documenta `royale-first` (T0, sin mint), `royale-kills-10` → `sniper-gold`, `royale-kills-50` → `bazooka-gold` y `royale-kills-200` → `ghost` (T3, requiere 200 kills y 5 victorias). El centro de turismo (`SPEC-033`) lista Skyfall Royale como novena actividad con el mapa `islas-ciudad`; solo lectura, sin mint desde el kiosco. |

## 13. Changelog

- 2026-11-13 — Creación del spec `SPEC-040` para el battle royale `Skyfall Royale` en `islas_ciudad`.
- 2026-11-13 — Añadidos bots de relleno para que un solo humano pueda jugar sin esperar a más jugadores reales.
- 2026-11-14 — Implementación completa: mapa, checkpoint, room, motor, bots, cliente, HUD, audio, misión y verificación. Añadida heurística ALT a `royaleNav` para que las rutas largas entre islas quepan en el presupuesto de A* sin subir el límite de nodos.
- 2026-11-14 — Portado el motor al backend activo (`backend/`): `minigame-8`, protocolo `Mg8*`, validación `mg8-*`, estado de lobby, tick y handlers. El checkpoint ya inicia la partida en el juego real; el fallo era que solo existía en la copia de referencia de `frontend/src/server/`.
- 2026-11-14 — Cámara de Royale alineada con Barn Siege (`ROYALE_PROFILE`) y bots fluidos: pensamiento a 5 Hz con desplazamiento continuo a 10 Hz, giro suavizado, patrulla/tormenta estables, strafe continuo y red de seguridad contra atascos. Navegación endurecida para no pisar celdas no caminables y combate con LOS a pecho/cabeza/cadera y tolerancia lateral mayor para que todos los bots sean killables.
- 2026-11-14 — Recompensas NFT documentadas: pista `royale` de `SPEC-045` con `sniper-gold`, `bazooka-gold` y `ghost`, y entrada de Skyfall Royale en el centro de turismo (`SPEC-033`) con `islas-ciudad` y estado de misión. Sin mint desde el checkpoint ni desde el kiosco.
