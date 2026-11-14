---
id: SPEC-026
titulo: "Minijuego 7: Parkour — carrera de la Torre de Halloween"
estado: implementado
prioridad: alta
creado: 2026-11-05
actualizado: 2026-11-05
responsable: opencode
etiquetas:
  [
    minijuego,
    multijugador,
    parkour,
    carrera,
    checkpoints,
    plataformas,
    torre,
    halloween,
    monstruos,
    empuje,
    caida,
    respawn,
    websocket,
    rooms,
    svelte,
    threlte,
    rapier,
    servidor-autoritativo,
    minigame-7,
  ]
depende_de:
  [SPEC-005, SPEC-009, SPEC-012, SPEC-018, SPEC-020, SPEC-023, SPEC-024]
bloquea: []
estimacion: "30h"
---

# SPEC-026 — Minijuego 7: Parkour (carrera de la Torre de Halloween)

> **Id técnico**: este modo es **`minigame-7`** y su room es **`parkour`**.
> Es el **sexto minijuego jugable** del roadmap (después de las llaves, la
> cripta, el Grand Prix, Barn Siege y Witch House Deathmatch), pero su id es
> 7 porque **`minigame-6` es el Witch House Deathmatch de `SPEC-025`**
> (antes Hexfire). Ambos modos son independientes: no se reutiliza ni se
> sobrescribe `SPEC-025`.

## 1. Contexto

El proyecto ya tiene:

- La arquitectura multijugador de RUN.world: rooms y engines autoritativos en
  `frontend/src/server/rooms/` y `frontend/src/server/engines/`, protocolo
  compartido en `frontend/src/server/protocol.ts` y
  `frontend/src/lib/services/protocol.ts`, y entrada por checkpoint físico con
  `E` (`SPEC-005`).
- El patrón de fases `idle → countdown → playing → results`, cuenta atrás,
  snapshots, posiciones a 10 Hz, reconciliación, reconexión y `go-lobby` ya
  probado en `SPEC-018` (carrera) y `SPEC-023` (Barn Siege).
- El controlador de personaje Rapier de `SPEC-009`
  (`PlayerCollider.svelte`), con carrera a **8 m/s**, salto `JUMP_SPEED = 6`,
  gravedad `18`, altura de salto ≈ **1.0 m** y alcance horizontal ≈ **5.3 m**.
  En parkour el salto usa `PARKOUR_JUMP_SPEED = 8.0` (≈ **1.78 m** de altura y
  ≈ **7.6 m** de alcance) para superar los escalones de 1.2 m y los obstáculos
  altos de la ruta sin cambiar el salto del resto de modos.
  Ya existe `teleport()`, `respawn()`, congelación de movimiento y un canal de
  knockback para la roca del Golem de `SPEC-023`.
- Los monstruos y sus poderes de `SPEC-023` (`Golem`, `Witch`, `Demon`,
  `Vampire`, `PumpkinKing`, `Ghost`) con sus GLB, clips, proyectiles, conos y
  efectos procedurales. En este modo **se reutilizan sin daño**.
- El sistema de audio procedural de `SPEC-024`, sin assets nuevos.
- Las salas actuales: `minigame-2` → `crypt`, `minigame-3` → `race`,
  `minigame-4` → `roadmap`, `minigame-5` → `waves`, `minigame-6` →
  `deathmatch` (`SPEC-025`). **`minigame-7` está libre**, así que este modo
  usa `minigame-7` y una room nueva `parkour`.

### 1.1 El mapa `Parkour.glb`

El mapa ya está en el repositorio y **no se modifica**:

| Dato               | Valor medido                                                       |
| ------------------ | ------------------------------------------------------------------ |
| Archivo            | `frontend/static/Parkour.glb`                                      |
| Tamaño             | **22 559 436 bytes**                                               |
| SHA-256            | `f70a40bb7c010c068fd8f8b754b1eaaeced17e92f50c5c78417690c3466728f3` |
| Escena por defecto | `HalloweenParkour`                                                 |
| Nodos              | **2 132**                                                          |
| Mallas             | **2 100**                                                          |
| Materiales         | **58**                                                             |
| Animaciones        | **57**                                                             |
| Raíces de escena   | **1 828**                                                          |
| Triángulos totales | **≈ 768 244**                                                      |
| Prefijo            | `HP_*`                                                             |

El GLB ya está exportado en **Y-up de juego**: no hay que rotarlo. Las
coordenadas del Blender original son Z-up; la conversión usada en este spec es:

```text
(x_game, y_game, z_game) = (x_blender, z_blender, -y_blender)
(x_blender, y_blender, z_blender) = (x_game, -z_game, y_game)
```

El mapa es una isla flotante con una ruta de plataformas que sube desde la
zona de salida (`z ≈ 82.5`, `y ≈ 0`) hasta la terraza de la torre
(`y = 86`, `z ≈ -112`). La ruta visible incluye:

- Salida en `HP_Spawn_Top` / `HP_SpawnPad`, con un arco decorativo
  `HAPPY HALLOWEEN` (`HP_ArchBeam`, centro `(0, 9.35, 71.2)`).
- Plataformas `HP_C01`–`HP_C06` y plaza `HP_CP1_Plaza`.
- Plataformas `HP_C07`–`HP_C10` y plaza `HP_CP2_Plaza`.
- Plataformas `HP_C11`–`HP_C13` y plaza `HP_CP3_Plaza`.
- Plataformas `HP_C14`–`HP_C17` y plaza `HP_CP4_Plaza`.
- Islas ascendentes `HP_A1`–`HP_A7`.
- Tejado `HP_RoofDeck`, pad de la torre `HP_SpirePad` y puente
  `HP_BridgeDeck`.
- Escalones de entrada `HP_SpireEntryStep0..2`.
- Ocho niveles de la torre: `HP_SP1`–`HP_SP8`, cada uno con su plaza,
  cuatro rampas perimetrales (`Step0..3`) y un `TowerLink`.
- Terraza final `HP_SummitTerrace` a `y = 86`.

La ruta tiene **START + 12 checkpoints + FINISH** (§11.1 y §11.2). El texto
`HP_FinishSub` / `HP_FinishSub2` del tejado es decorativo y **no** es la meta:
se oculta en el componente manual para que la única meta sea la terraza.

### 1.2 Checkpoint de entrada

Se propone un checkpoint nuevo en el área 2 del mapa global, delante de las
escaleras de entrada del Castillo de Drácula:

| Dato             | Valor                                            |
| ---------------- | ------------------------------------------------ |
| Lobby            | `minigame-7`                                     |
| Nombre visible   | `Parkour Spire`                                  |
| Posición         | `(33.0, 0.4, −23.9)`                                 |
| Radio            | `2.0 m`                                          |
| Color            | `#eab308`                                        |
| Entrada / salida | `E` en el checkpoint; `PARKOUR_EXIT` al terminar |
| Tecla / botón    | `E` y botón de `LobbyOverlay`                    |

Al entrar se carga **solo** `Parkour.glb`; al salir se vuelve al mismo punto
del mapa global. No se solapa con los checkpoints existentes
(`minigame-1`, `minigame-2`, `minigame-3`, `minigame-5`).

### 1.3 Por qué el parkour no es «otro Barn Siege»

En Barn Siege los monstruos persiguen, hacen daño y matan. Aquí **no hay
combate, ni vida, ni muerte**:

- Los jugadores no tienen HP, no reciben daño y no pueden morir.
- Los monstruos son **guardianes** anclados a una plataforma; **patrullan en
  órbita lenta alrededor de su checkpoint** (sin salir de la plaza) pero no
  hacen pathfinding ni persiguen al jugador.
- Sus ataques de `SPEC-023` se conservan **solo como empuje** (roca, ácido,
  fuego y zarpazo). El daño se sustituye por un impulso.
- Si un jugador cae, reaparece en su último checkpoint. La caída nunca es una
  muerte y nunca reinicia la partida.
- El objetivo es una carrera: llegar a la terraza de la torre después de
  pasar, en orden, los 12 checkpoints.

## 2. Objetivo

Crear **Parkour**, una carrera multijugador para hasta **12 jugadores** en
`Parkour.glb`: los jugadores esperan **30 segundos** en la salida, corren por
las plataformas flotantes, activan **12 checkpoints secuenciales**, esquivan o
reciben los empujes de seis guardianes con poderes de `SPEC-023` y llegan a la
terraza de la torre. El primero en llegar gana; caerse solo hace reaparecer en
el último checkpoint, sin daño ni muerte. Todo el estado de partida,
checkpoints, caídas, respawns y resultados lo decide el servidor.

## 3. Alcance

**Incluye**

- Lobby **`minigame-7`** (`Parkour Spire`) y room **`parkour`**
  (`maxPlayers: 12`, `allowReconnect: true`, `reconnectTimeout: 20`,
  `idleTimeout: 120`, no singleton).
- Checkpoint físico `Parkour Spire` en `(33.0, 0.4, −23.9)`, radio 2, color
  `#eab308`; entrada y salida con `E`.
- Registro del mapa `parkour` en `frontend/world/maps.json`, física
  `frontend/world/parkour.physics.json` y componente manual
  `frontend/src/lib/components/world/Parkour.svelte`.
- Física **`chunked`** con `chunkSize: 16`, solo superficies de ruta, sin
  islas decorativas, nubes, estrellas, luna, rocas, shaft/ribs/spines de la
  torre, banderas, señales, barandillas, arco ni merlones.
- START en `HP_SpawnPad` y rejilla de **12 slots (4 columnas × 3 filas)**.
- 12 checkpoints secuenciales por jugador, con progreso independiente y
  validación autoritativa.
- FINISH en `HP_SummitTerrace` (`y = 86`) tras completar CP12.
- Regla de caída: respawn automático en el último checkpoint, con retardo de
  1 s y 1.5 s de protección; nunca muerte, nunca HP.
- Seis guardianes reutilizando los poderes de `SPEC-023`: Golem (roca),
  Witch (ácido), Demon (cono de fuego), Vampire (ácido), PumpkinKing (ácido)
  y Ghost (zarpazo). Sin daño; solo empuje. Patrullan despacio alrededor de su
  checkpoint con una posición determinista compartida por servidor y cliente.
- Máquina de estados `idle → countdown → playing → results`.
- Cuenta atrás de **30 s** al entrar el primer jugador; se acorta a **10 s**
  una sola vez si la sala llega a **12/12**.
- Límite de partida de **10 minutos**; resultados de **15 s** y vuelta
  automática a `global` con `go-lobby`.
- HUD de carrera: checkpoints `n/12`, timer, posición, caídas, siguiente
  checkpoint y aviso de guardián.
- Balizas 3D solo en el siguiente checkpoint del jugador local, con número y
  color.
- Overlays de espera/cuenta atrás, caída/respawn, fin de carrera y resultados.
- Interpolación de jugadores remotos y sincronización de posiciones a 10 Hz.
- Reconexión: el jugador vuelve a su checkpoint y conserva su progreso.
- Audio procedural de `SPEC-024` para checkpoint, caída, respawn, ataques y
  meta; sin assets nuevos.
- Recompensa al ganar: ser el primero en llegar a FINISH registra
  `parkour-summit` en `rw:missions:v1` y desbloquea la skin `ghost`
  (`Ghost.glb`). Llegar después, caerse o agotar el tiempo no da la skin.
- Script `parkour:check` que valida el GLB, coordenadas, ruta, física y
  guardianes.
- Verificación de tipos, lint, build, física y pruebas manuales con dos
  navegadores.

**No incluye**

- Modificar, reexportar o rehacer `Parkour.glb`, su arte o sus animaciones.
- Un componente generado automáticamente con 2 100 mallas: el componente es
  manual y el pipeline no lo sobrescribe.
- Vida, daño, muerte, downs, revives, botiquines, armas o combate de jugador.
- Matar o dañar a los guardianes; son invulnerables y no tienen barra de vida.
- IA de persecución, navmesh, oleadas, spawns dinámicos o monstruos que salten
  entre plataformas.
- Coches, vehículos, poderes de jugador, inventario, granadas o tienda.
- Checkpoint en el aire, teletransporte manual, atajos, alas, doble salto,
  escalada o _grappling_.
- Minimapa, brújula, cámara libre, espectador o replay.
- Persistencia de récords, leaderboard global, XP o rangos. Solo se persiste el
  desbloqueo de la skin `ghost` al ganar.
- Varias salas simultáneas de `parkour`; una instancia por proceso, como el
  resto de minijuegos.
- Cambios en `backend/` (deprecado por `SPEC-020`).
- Cambios en Barn Siege, Witch House Deathmatch, la cripta, la carrera, el roadmap, el hub,
  las misiones de gatos, los rollos de papel o los coches libres.

## 4. Requisitos

### Funcionales

| ID    | Requisito                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Prioridad |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| RF-1  | Checkpoint `Parkour Spire` en `(33.0, 0.4, −23.9)`, radio 2, color `#eab308`; `E` entra a la room `parkour` con `minigame-7` y carga solo `Parkour.glb`.                                                                                                                                                                                                                                                                                                                                                                                                                                                    | alta      |
| RF-2  | `PARKOUR_MAX_PLAYERS = 12`. Entrada rechazada con `PARKOUR_FULL` si no hay hueco y con `PARKOUR_IN_PROGRESS` si la fase es `playing` o `results`.                                                                                                                                                                                                                                                                                                                                                                                                                                                       | alta      |
| RF-3  | El primer jugador que entra en `idle` inicia `countdown` de 30 000 ms. Los jugadores que entran después se suman sin reiniciar la cuenta atrás.                                                                                                                                                                                                                                                                                                                                                                                                                                                         | alta      |
| RF-4  | Si la sala llega a 12/12 durante `countdown`, `endsAt` se recorta una sola vez a `now + 10 000` y se emite `countdown-shortened`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | media     |
| RF-5  | Movimiento y salto bloqueados durante `countdown` y `results`; la cámara puede girar y el chat funciona. Los guardianes no atacan en esas fases.                                                                                                                                                                                                                                                                                                                                                                                                                                                        | alta      |
| RF-6  | Al terminar `countdown`, la fase pasa a `playing`, se desbloquea el movimiento y empieza el reloj de partida.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | alta      |
| RF-7  | La partida tiene un máximo de 600 000 ms desde el inicio de `playing`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | alta      |
| RF-8  | Hay exactamente **12 checkpoints** (`CP1`–`CP12`) más START y FINISH. START se marca al empezar `playing`; FINISH solo cuenta tras CP12.                                                                                                                                                                                                                                                                                                                                                                                                                                                                | alta      |
| RF-9  | Los checkpoints son secuenciales y por jugador: solo el siguiente esperado (`nextCheckpoint`) puede activarse. Un checkpoint fuera de orden se ignora sin alterar el progreso.                                                                                                                                                                                                                                                                                                                                                                                                                          | alta      |
| RF-10 | Un checkpoint se activa cuando los pies del jugador están dentro de un cilindro de radio **3.0 m** y `y ∈ [cp.y − 0.75, cp.y + 3.0]`, con `cp.y` igual a la superficie superior de la plaza.                                                                                                                                                                                                                                                                                                                                                                                                            | alta      |
| RF-11 | FINISH se activa al pisar la **zona rectangular de la terraza** (`x ∈ [−12.5, 12.5]`, `z ∈ [−124.5, −99.5]`, `y = 86 ± 3.0/0.75`) y solo si `nextCheckpoint === 13` (CP12 completado). La zona cubre toda la terraza para que también cuente al llegar desde las escaleras.                                                                                                                                                                                                                                                                                                                             | alta      |
| RF-12 | START asigna el checkpoint 0 y el punto de respawn `(0, 0.15, 82.5)`. CP1–CP12 actualizan el respawn a su propio centro con holgura vertical `+0.15 m`; el cliente actualiza también `playerRuntime.spawn` para que el respawn de emergencia use el mismo punto.                                                                                                                                                                                                                                                                                                                                        | alta      |
| RF-13 | Caída: si `y < lastCheckpoint.y − 2.5` durante **250 ms** o `y < −8`, el servidor marca `fall`, espera **1 000 ms** y emite `respawn` en el último checkpoint con **1 500 ms** de protección.                                                                                                                                                                                                                                                                                                                                                                                                           | alta      |
| RF-14 | La caída nunca resta HP, nunca mata y nunca reinicia checkpoints; solo incrementa `falls` y provoca el respawn.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | alta      |
| RF-15 | Durante la protección de respawn el jugador no puede recibir empujes de guardianes; la protección dura 1.5 s y no hay ataque del jugador que pueda cancelarla.                                                                                                                                                                                                                                                                                                                                                                                                                                          | alta      |
| RF-16 | Los jugadores no tienen HP, no reciben daño y no pueden morir. No hay HUD de vida ni pantalla de muerte.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | alta      |
| RF-17 | Los guardianes son invulnerables y no hacen pathfinding fuera de su plaza. **Patrullan alrededor de su ancla** (`patrolRadius` 0.8–2.0 m, dentro de la plaza y a 0.5–1.4 m/s) usando una posición determinista basada en el tiempo autoritativo. El **Ghost es melee y persigue** al jugador más cercano mientras esté dentro de su plaza (`chaseBounds`), manteniendo 1.5 m de distancia; al salir el jugador vuelve a su órbita sin abandonar el checkpoint. Su modelo reproduce `HR_walk` mientras avanza y solo gira hacia el objetivo cercano. Atacan si está dentro de su rango y `\|Δy\| ≤ 8 m`. | alta      |
| RF-18 | Los guardianes solo pueden atacar en `playing`, tras `WARDEN_ARM_DELAY_MS = 2 000 ms` desde el inicio, y respetan el cooldown de `SPEC-023`.                                                                                                                                                                                                                                                                                                                                                                                                                                                            | alta      |
| RF-19 | Golem (CP2, rango **30 m**): roca balística de `SPEC-023`; al impactar en radio **5 m** aplica empuje `(14.0 m/s horizontal, 8.0 m/s vertical)` y no daño.                                                                                                                                                                                                                                                                                                                                                                                                                                              | alta      |
| RF-20 | Witch (CP4, rango **26 m**): ácido de `SPEC-023`; al impactar en radio **3.5 m** aplica empuje `(10.0, 4.5)` y no daño. El charco es solo visual.                                                                                                                                                                                                                                                                                                                                                                                                                                                       | alta      |
| RF-21 | Demon (CP6, rango **17 m**): cono de fuego de `SPEC-023`; mientras el jugador sigue dentro del cono aplica hasta 3 pulsos de empuje `(6.5, 2.8)` cada 320 ms y no daño.                                                                                                                                                                                                                                                                                                                                                                                                                                 | alta      |
| RF-22 | Vampire (CP8, rango **24 m**): ácido de `SPEC-023`; al impactar en radio **3.2 m** aplica empuje `(10.0, 4.0)`. PumpkinKing (CP10, rango **32 m**): ácido de `SPEC-023`; al impactar en radio **4.0 m** aplica empuje `(12.0, 5.0)`.                                                                                                                                                                                                                                                                                                                                                                    | alta      |
| RF-23 | Ghost (CP12, rango **5 m**): zarpazo de `SPEC-023`; a ≤ 5 m aplica empuje `(8.0, 3.0)` y no daño.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | alta      |
| RF-24 | El empuje acumulado se limita a **16 m/s horizontal** y **9 m/s vertical**; `PlayerCollider.svelte` lo aplica al controlador y el desplazamiento se reporta como movimiento normal.                                                                                                                                                                                                                                                                                                                                                                                                                     | alta      |
| RF-25 | El servidor emite `warden-attack` para el efecto visual y `shove` solo para los jugadores realmente alcanzados. El cliente no calcula impactos.                                                                                                                                                                                                                                                                                                                                                                                                                                                         | alta      |
| RF-26 | La salida tiene una rejilla fija de 12 slots, 4 columnas × 3 filas, dentro de `HP_SpawnPad` (`x ∈ [−3.2, 3.2]`, `z ∈ [79.3, 85.7]`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | alta      |
| RF-27 | La partida termina cuando el primer jugador llega a FINISH (con una ventana de gracia de **3 500 ms** para empates y para mostrar la victoria) o al llegar a 600 000 ms. Pasa a `results` durante 15 000 ms.                                                                                                                                                                                                                                                                                                                                                                                            | alta      |
| RF-28 | El ganador es el primer `finishedAt`; si nadie termina, gana quien tenga más checkpoints, luego menos caídas, luego menor distancia al siguiente checkpoint.                                                                                                                                                                                                                                                                                                                                                                                                                                            | alta      |
| RF-29 | Al llegar a FINISH el jugador queda `finished` y bloqueado en la terraza, sin empujes, hasta `results`. El cliente muestra un overlay grande de **«YOU WIN!»** si quedó primero o **«FINISHED!»** si llegó después, con el tiempo total, y un aviso «X reached the summit!» al resto. El overlay de victoria se oculta en cuanto empieza `results`, donde solo se muestra el panel de resultados (ganador, podio, checkpoints, caídas, `Returning in Ns`) sin capas superpuestas.                                                                                                                       | alta      |
| RF-30 | Al terminar `results`, todos vuelven a `global` con `go-lobby` y teletransporte a `PARKOUR_EXIT = (33.0, 0.4, −23.9)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | alta      |
| RF-31 | Si la sala se vacía en cualquier fase, vuelve a `idle` y limpia jugadores, checkpoints, caídas, ataques, proyectiles y timers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | alta      |
| RF-32 | Reconexión estándar (`allowReconnect`, 20 s): el jugador vuelve a su checkpoint, conserva `falls` y, si está en `playing`, reaparece con protección.                                                                                                                                                                                                                                                                                                                                                                                                                                                    | media     |
| RF-33 | HUD permanente: timer `m:ss`, checkpoints `n/12`, posición `P/12`, caídas y nombre del siguiente checkpoint.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | alta      |
| RF-34 | Baliza 3D visible solo para el siguiente checkpoint del jugador local: haz vertical, número y color `#eab308`; los checkpoints ya pasados se apagan.                                                                                                                                                                                                                                                                                                                                                                                                                                                    | media     |
| RF-35 | Overlay de espera: `Waiting for players`, jugadores `n/12` y cuenta atrás. Overlay de salida: `3, 2, 1, GO!` en los últimos 3 s.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | alta      |
| RF-36 | Overlay de caída: `You fell! Returning to checkpoint N…`; overlay de respawn: `Spawn protection 1.5s`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | alta      |
| RF-37 | Cliente: posiciones remotas interpoladas a 10 Hz con `SkinCharacter` y skin real; sin saltos visibles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | alta      |
| RF-38 | El cliente envía `mg7-position` a 10 Hz (máximo 20 Hz) solo en `playing`; el servidor valida fase, rango, velocidad y secuencia.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | alta      |
| RF-39 | El servidor rechaza posiciones no finitas, fuera de `x ∈ [−80, 80]`, `z ∈ [−160, 110]`, `y ∈ [−30, 110]`, saltos horizontales > 5 m por reporte, `                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Δy        | > 10 m` por reporte o más de 20 reportes/s. | alta |
| RF-40 | El servidor valida que el checkpoint reportado sea el siguiente esperado, esté dentro del cilindro y que el jugador haya reportado una posición válida en los últimos 500 ms.                                                                                                                                                                                                                                                                                                                                                                                                                           | alta      |
| RF-41 | `parkour:check` valida el GLB, las 12 coordenadas, la ruta, los 85 nodos de física, los guardianes y las constantes del motor.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | media     |
| RF-42 | El checkpoint de entrada no aparece dentro de la escena `parkour`; los checkpoints, el chat, los rollos y los minijuegos existentes siguen igual.                                                                                                                                                                                                                                                                                                                                                                                                                                                       | alta      |
| RF-43 | En parkour el salto usa `PARKOUR_JUMP_SPEED = 8.0` (≈1.78 m con gravedad 18) para superar los escalones de hasta 1.2 m y los obstáculos altos de las plazas; el resto de modos conserva `JUMP_SPEED = 6`.                                                                                                                                                                                                                                                                                                                                                                                               | alta      |
| RF-44 | Al entrar en `results`, si `winnerId === selfId`, se registra `parkour-summit` en `rw:missions:v1` y se desbloquea la skin `ghost`; el resto de posiciones no la concede y la recompensa no se equipa automáticamente.                                                                                                                                                                                                                                                                                                                                                                          | alta      |

### No funcionales

| ID     | Requisito             | Criterio                                                                                                                                                                 |
| ------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RNF-1  | Servidor autoritativo | El cliente solo envía posiciones. El servidor decide fase, checkpoints, caídas, respawns, ataques, ganador y resultados.                                                 |
| RNF-2  | Tráfico               | `mg7-positions` cada 100 ms, redondeado a 2 decimales; ≤ 12 KiB por frame con 12 jugadores. `ByteBudget` avisa si se supera.                                             |
| RNF-3  | Rendimiento           | 60 FPS objetivo y ≥ 45 FPS en hardware medio con 12 jugadores, 6 guardianes y efectos activos. Si el mapa baja de 45 FPS, se fusionan mallas decorativas por material.   |
| RNF-4  | Física                | `collision.mode = chunked`, `chunkSize = 16`, `readyNode = HP_Spawn_Top`, ≤ 60 000 triángulos de colisión y ≤ 256 colliders. Solo las 85 superficies de ruta colisionan. |
| RNF-5  | Determinismo          | Dos clientes ven el mismo timer, checkpoints, caídas, ganador y resultados.                                                                                              |
| RNF-6  | Sin fugas             | Entrar/salir 10 veces no deja cuerpos, controladores, listeners, proyectiles ni timers residuales.                                                                       |
| RNF-7  | Reloj                 | Timer basado en `serverTime`/`endsAt`; el cliente no puede adelantar ni retrasar la partida.                                                                             |
| RNF-8  | Portabilidad          | Toda la geometría de la carrera vive en `parkourConfig.ts` y `parkour.physics.json`; cambiar el GLB obliga a re-medir y actualizar ambos.                                |
| RNF-9  | Accesibilidad         | El HUD no depende solo del color: checkpoints y siguiente objetivo llevan número y texto.                                                                                |
| RNF-10 | Sin assets nuevos     | Solo se reutilizan GLB y audio procedural existentes; las balizas y efectos se generan con Three.js.                                                                     |

## 5. Criterios de aceptación

- [ ] CA-1: El checkpoint `Parkour Spire` aparece en `(33.0, 0.4, −23.9)` y `E` abre la room `parkour` con 1 jugador en `countdown`.
- [ ] CA-2: Con 2 navegadores, ambos aparecen en la rejilla de salida, congelados, y ven la misma cuenta atrás de 30 s.
- [ ] CA-3: Durante `countdown` el jugador no se mueve ni salta; la cámara sí gira. Al llegar a 0 empieza `playing` y puede correr.
- [ ] CA-4: Con 12 jugadores durante `countdown`, la cuenta atrás se recorta a 10 s una sola vez y se emite `countdown-shortened`.
- [ ] CA-5: Un 13.º jugador recibe `PARKOUR_FULL` y permanece en `global`.
- [ ] CA-6: Un jugador que intenta entrar en `playing` o `results` recibe `PARKOUR_IN_PROGRESS`.
- [ ] CA-7: START cuenta como checkpoint 0; el HUD muestra `0/12` y la primera baliza apunta a CP1.
- [ ] CA-8: Al llegar a CP1 se emite `checkpoint` con índice 1, el HUD muestra `1/12` y el respawn pasa a CP1.
- [ ] CA-9: Si el jugador cae entre CP1 y CP2, reaparece en CP1 tras 1 s, con 1.5 s de protección y `falls = 1`; no pierde HP ni muere.
- [ ] CA-10: Si el jugador llega a CP2 sin haber activado CP1, no se activa nada; el HUD sigue en `0/12` o `1/12`.
- [ ] CA-11: Los 12 checkpoints se activan en orden y solo el siguiente esperado enciende la baliza.
- [ ] CA-12: Al llegar a la terraza después de CP12 se emite `finish` y la partida pasa a `results` tras la ventana de gracia.
- [ ] CA-13: Si nadie termina en 10 minutos, la partida pasa a `results` y ordena por checkpoints, caídas y distancia.
- [ ] CA-14: El Golem lanza una roca visible; si acierta, el jugador sale despedido sin perder HP. No hay oleadas ni combate, pero el empuje es el mismo que en `SPEC-023`.
- [ ] CA-15: El Demon escupe el cono; dentro del cono el jugador recibe pulsos de empuje, fuera no. No hay daño.
- [ ] CA-16: Witch, Vampire y PumpkinKing lanzan ácido visible; el impacto empuja, el charco no daña ni ralentiza.
- [ ] CA-17: El Ghost solo empuja a ≤ 1.8 m; no persigue fuera de su plataforma.
- [ ] CA-18: Durante la protección de respawn los ataques no mueven al jugador.
- [ ] CA-19: Los guardianes no atacan en `countdown` ni en `results`, y no atacan antes de 2 s de `playing`.
- [ ] CA-20: El jugador que cae al vacío desde CP5 reaparece en CP5; no aterriza en islas decorativas ni atraviesa colisiones de adorno.
- [ ] CA-21: Solo las superficies de ruta tienen collider: nubes, estrellas, luna, islas inferiores, rocas, shaft/ribs/spines, banderas, señales, barandillas, arco y merlones no bloquean.
- [ ] CA-22: Dos navegadores ven las mismas posiciones interpoladas, checkpoints, caídas y resultados; no hay saltos a 10 Hz.
- [ ] CA-23: Un jugador que se desconecta en `playing` y reconecta vuelve a su último checkpoint con su progreso y sus caídas.
- [ ] CA-24: Al terminar `results`, todos vuelven a `global` en `(33.0, 0.4, −23.9)`.
- [ ] CA-25: Entrar/salir 10 veces no deja cuerpos, listeners, proyectiles, timers ni errores en consola.
- [ ] CA-26: `parkour:check`, `world:check parkour`, `check`, `lint` y `build` pasan en verde.
- [ ] CA-27: El HUD no muestra vida, daño, muerte, downs ni armas; solo timer, checkpoints, posición, caídas y siguiente objetivo.
- [ ] CA-28: El componente manual `Parkour.svelte` no es sobrescrito por `world:build` y el registro incluye `parkour`.

## 6. Archivos relevantes

| Ruta                                                         | Acción     | Motivo                                                                                                         |
| ------------------------------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------- |
| `frontend/static/Parkour.glb`                                | reutilizar | Mapa de la carrera; no se modifica.                                                                            |
| `frontend/world/maps.json`                                   | modificar  | Añadir `parkour` con `manualComponent: true`, `manualPhysics: true`, spawn y física.                           |
| `frontend/world/parkour.physics.json`                        | crear      | Física `chunked`, 85 superficies exactas, hash y grupos.                                                       |
| `frontend/src/lib/components/world/Parkour.svelte`           | crear      | Carga manual del GLB, animaciones, ocultación de `HP_FinishSub*` y del cielo solo si la medición lo justifica. |
| `frontend/src/lib/world/registry.generated.ts`               | regenerar  | `bun run world:sync` añade `parkour`.                                                                          |
| `frontend/scripts/world-build.mjs`                           | modificar  | Respetar `manualComponent` / `manualPhysics` y no regenerar `Parkour.svelte` ni `parkour.physics.json`.        |
| `frontend/src/lib/world/types.ts`                            | modificar  | Añadir `collision.exactGroups?: boolean`.                                                                      |
| `frontend/src/lib/components/world/ChunkedColliders.svelte`  | modificar  | Montar solo nombres exactos cuando `exactGroups` es verdadero.                                                 |
| `frontend/scripts/world-check.mjs`                           | revisar    | Debe aceptar el componente manual y la física `chunked` exacta.                                                |
| `frontend/scripts/verify-parkour.mjs`                        | crear      | Script `parkour:check`.                                                                                        |
| `frontend/package.json`                                      | modificar  | Añadir `parkour:check` y `parkour:build` si hace falta.                                                        |
| `frontend/src/server/protocol.ts`                            | modificar  | `minigame-7`, `parkour`, tipos `Mg7*` y mensajes.                                                              |
| `frontend/src/lib/services/protocol.ts`                      | modificar  | Espejo de tipos y guards `isMg7*`.                                                                             |
| `frontend/src/server/validate.ts`                            | modificar  | Validación de mensajes `mg7-*`.                                                                                |
| `frontend/src/server/rooms/ParkourRoom.ts`                   | crear      | Room `parkour`.                                                                                                |
| `frontend/src/server/engines/parkour.ts`                     | crear      | Motor autoritativo de carrera, checkpoints, caídas y guardianes.                                               |
| `frontend/src/server/index.ts`                               | modificar  | Exportar `ParkourRoom` y `Parkour`.                                                                            |
| `frontend/rundot/rooms.config.json`                          | modificar  | Añadir room `parkour` con `maxPlayers: 12`.                                                                    |
| `frontend/src/lib/services/lobbySocket.ts`                   | modificar  | `minigame-7 → parkour`, callbacks `mg7-*` y envíos.                                                            |
| `frontend/src/lib/state/lobby.svelte.ts`                     | modificar  | `isParkourLobbyId`, `minigame7.setSender/reset`, reconexión.                                                   |
| `frontend/src/lib/state/minigame7.svelte.ts`                 | crear      | Snapshot, posiciones, checkpoints, empujes y resets.                                                           |
| `frontend/src/lib/missions/minigames.ts`                     | crear      | Misión `parkour-summit` (título y descripción) del registro local.                                             |
| `frontend/src/lib/state/missions.svelte.ts`                  | modificar  | Persistencia genérica de victorias de minijuego y `completeMinigameMission()`.                                 |
| `frontend/src/lib/cosmetics/skins.ts`                        | modificar  | `ghost.unlockMissionId = 'parkour-summit'`.                                                                    |
| `frontend/src/lib/state/parkourConfig.ts`                    | crear      | START, 12 CP, FINISH, rejilla, guardianes y constantes.                                                        |
| `frontend/src/lib/state/checkpoints.svelte.ts`               | modificar  | Añadir `minigame-7` (`Parkour Spire`).                                                                         |
| `frontend/src/lib/state/playerState.ts`                      | modificar  | `PARKOUR_ENTRY` y `PARKOUR_EXIT`.                                                                              |
| `frontend/src/lib/state/sceneState.svelte.ts`                | modificar  | `active === 'parkour'` y `inParkour`.                                                                          |
| `frontend/src/lib/Scene.svelte`                              | modificar  | Cargar `WorldMap mapId="parkour"` y `ParkourSession`.                                                          |
| `frontend/src/lib/GamePage.svelte`                           | modificar  | Ocultar `MissionHud` y montar `ParkourHud` / `ParkourOverlay`.                                                 |
| `frontend/src/lib/components/player/PlayerCollider.svelte`   | modificar  | Spawn de `parkour`, respawn, freeze y knockback `minigame7`.                                                   |
| `frontend/src/lib/components/player/PlayerBehaviour.svelte`  | modificar  | No enviar `player-position` en parkour; usar `mg7-position`; congelar.                                         |
| `frontend/src/lib/components/parkour/ParkourHud.svelte`      | crear      | HUD de timer, checkpoints, posición, caídas y siguiente CP.                                                    |
| `frontend/src/lib/components/parkour/ParkourOverlay.svelte`  | crear      | Espera, countdown, caída, respawn y resultados.                                                                |
| `frontend/src/lib/components/parkour/ParkourSession.svelte`  | crear      | Monta guardianes, balizas, remotos y efectos.                                                                  |
| `frontend/src/lib/components/parkour/ParkourWarden.svelte`   | crear      | Un guardián con skin, clip y ancla.                                                                            |
| `frontend/src/lib/components/parkour/ParkourWardens.svelte`  | crear      | Los seis guardianes de `parkourConfig`.                                                                        |
| `frontend/src/lib/components/parkour/ParkourAttackFx.svelte` | crear      | Roca, ácido, fuego y zarpazo; reutiliza shaders/geometrías.                                                    |
| `frontend/src/lib/components/parkour/ParkourBeacons.svelte`  | crear      | Baliza del siguiente checkpoint.                                                                               |
| `frontend/src/lib/components/parkour/ParkourRemotes.svelte`  | crear      | Jugadores remotos interpolados con `SkinCharacter`.                                                            |
| `frontend/src/lib/audio/events.ts`                           | modificar  | Cursores y cues `mg7-*`.                                                                                       |
| `frontend/src/lib/audio/recipes.ts`                          | modificar  | Recetas procedurales `parkour_fall`, `parkour_respawn`, `parkour_finish`.                                      |
| `frontend/src/server/README.md`                              | modificar  | Documentar la room `parkour` y su límite.                                                                      |

## 7. Plan de implementación

### Fase 1 — Registrar el mapa y la física

- [x] Paso 1: Ejecutar `bun run world:add -- frontend/static/Parkour.glb --id parkour --no-build` para registrar el GLB y el spawn.
- [x] Paso 2: Crear `frontend/world/parkour.physics.json` con `sourceSha256`, `collision.mode: "chunked"`, `chunkSize: 16`, `readyNode: "HP_Spawn_Top"`, `exactGroups: true`, `maxColliderTriangles: 60000`, `maxColliders: 256`, `maxColliderNodes: 96` y el grupo `suelo` con los **85 nodos exactos** de §11.3.
- [x] Paso 3: Añadir a `maps.json` los campos `manualComponent: true`, `manualPhysics: true` y `spawn: { x: 0, y: 0.15, z: 82.5 }`.
- [x] Paso 4: Modificar `world-build.mjs` para que, si `manualComponent` / `manualPhysics` son verdaderos y los archivos existen, no regenere el componente ni la física; `world:sync` sí puede regenerar el registro.
- [x] Paso 5: Modificar `ChunkedColliders.svelte` para que `exactGroups: true` monte solo los nombres exactos, sin incluir `_Rim`, `_Rock`, `_Sub`, `_Text` ni otros hijos por prefijo.
- [x] Paso 6: Ejecutar `bun run world:sync` y comprobar que `registry.generated.ts` importa `Parkour.svelte` y `parkour.physics.json`.

### Fase 2 — Componente manual y escena

- [x] Paso 1: Crear `Parkour.svelte` con `useGltf(asset('parkour.glb'))`, `<T is={gltf.scene} />`, `AnimationMixer` para los 57 clips y limpieza en `onDestroy`.
- [x] Paso 2: Ocultar siempre `HP_FinishSub` y `HP_FinishSub2`; ocultar `HP_Cloud*`, `HP_Star*`, `HP_Moon*` solo si la medición de `renderer.info` lo justifica.
- [x] Paso 3: Añadir `active === 'parkour'` e `inParkour` en `sceneState.svelte.ts`; `minigame-7` debe resolver a `parkour`.
- [x] Paso 4: En `Scene.svelte`, cargar `<WorldMap mapId="parkour" />` y `<ParkourSession />`; no montar `<Sky />` dentro de parkour.
- [x] Paso 5: En `GamePage.svelte`, ocultar `MissionHud` y montar `ParkourHud` y `ParkourOverlay` solo en `inParkour`.

### Fase 3 — Configuración y checkpoint de entrada

- [x] Paso 1: Crear `parkourConfig.ts` con START, 12 CP, FINISH, rejilla, bounds, tiempos, radios y guardianes (§11.1–§11.4).
- [x] Paso 2: Añadir `minigame-7` a `LOBBY_IDS`, `MINIGAME_LOBBY_IDS`, `LOBBY_DEFINITIONS` y `MinigameLobbyId` en ambos protocolos.
- [x] Paso 3: Añadir `minigame-7` a `CHECKPOINTS` con nombre `Parkour Spire`, posición `(33.0, 0.4, −23.9)`, radio 2 y color `#eab308`.
- [x] Paso 4: Añadir `PARKOUR_ENTRY` / `PARKOUR_EXIT` en `playerState.ts` y usarlos en la entrada/salida.

### Fase 4 — Protocolo y room

- [x] Paso 1: Definir `Mg7Phase`, `Mg7PlayerState`, `Mg7Snapshot`, `Mg7Positions`, `Mg7WardenAttack`, `Mg7Event` y uniones `ClientMessage`/`ServerMessage` en ambos protocolos.
- [x] Paso 2: Añadir `mg7-position` al cliente y `mg7-state`, `mg7-positions`, `mg7-event`, `error`, `go-lobby` al servidor.
- [x] Paso 3: Crear `ParkourRoom.ts` siguiendo `WavesRoom.ts`: `ByteBudget`, `RoomPort`, tick de 100 ms, snapshots y `go-lobby` de seguridad.
- [x] Paso 4: Crear `src/server/engines/parkour.ts` con la máquina de estados, checkpoints, caídas, respawns, guardianes y resultados.
- [x] Paso 5: Añadir `parkour` a `rundot/rooms.config.json` con `maxPlayers: 12`, reconexión 20 s e idle 120 s.
- [x] Paso 6: Añadir la room al `server/index.ts` y al `server/README.md`.

### Fase 5 — Cliente, estado y movimiento

- [x] Paso 1: Crear `minigame7.svelte.ts` con snapshot, posiciones interpoladas, `checkpoint`, `lastCheckpoint`, `falls`, `knockback`, `blocksMovement` y `reset()`; en cada `checkpoint`/`respawn` actualizar `playerRuntime.spawn`.
- [x] Paso 2: En `lobbySocket.ts`, mapear `minigame-7 → parkour`, añadir callbacks `onMg7State/onMg7Positions/onMg7Event` y métodos `sendMg7Position`.
- [x] Paso 3: En `lobby.svelte.ts`, instalar `minigame7.setSender`, resetear al cambiar de lobby y restaurar snapshot/progreso al reconectar.
- [x] Paso 4: En `PlayerCollider.svelte`, usar el spawn de `parkour`, congelar en countdown/results, aplicar `minigame7.knockback` y respetar `respawn`/protección.
- [x] Paso 5: En `PlayerBehaviour.svelte`, no enviar `player-position` en parkour; enviar `mg7-position` a 10 Hz y mantener el avatar oculto si el jugador está terminado.
- [x] Paso 6: Añadir `ParkourRemotes.svelte` con interpolación de 150 ms, skins reales y sin colisión entre jugadores.

### Fase 6 — Guardianes y efectos

- [x] Paso 1: Implementar los seis guardianes de §11.4 con `SkinCharacter`, ancla fija, orientación al objetivo y clips `*_idle`, `*_attack`, `*_throw`.
- [x] Paso 2: Implementar ataques del servidor: roca y ácido con impacto diferido, fuego con cono y pulsos, zarpazo inmediato; sin daño.
- [x] Paso 3: Implementar `shove` autoritativo y el límite de empuje; el cliente solo aplica el impulso local.
- [x] Paso 4: Crear `ParkourAttackFx.svelte` reutilizando `RockProjectile`, `FireBreath`, `WaveExplosion` o extrayendo su parte presentacional si están acoplados a `minigame5`.
- [x] Paso 5: Crear balizas de checkpoint con haz, número y pulso; solo la siguiente para el jugador local.
- [x] Paso 6: Conectar audio procedural para checkpoint, caída, respawn, ataques y meta.

### Fase 7 — HUD, overlays y resultados

- [x] Paso 1: `ParkourHud.svelte`: timer, `n/12`, posición, caídas, siguiente CP y aviso de guardián cercano.
- [x] Paso 2: `ParkourOverlay.svelte`: espera `n/12`, countdown, `You fell!`, protección, `GO!`, resultados y `Returning in Ns`.
- [x] Paso 3: Mostrar podio y estado del jugador local en `results`; bloquear movimiento.
- [x] Paso 4: Auto-salida a 15 s y botón `Back to the plaza`.

### Fase 8 — Verificación y documentación

- [x] Paso 1: Crear `verify-parkour.mjs` y `parkour:check` (§8).
- [x] Paso 2: Ejecutar `parkour:check`, `world:check parkour`, `check`, `lint` y `build`.
- [ ] Paso 3: Probar con 2 y 12 navegadores, caídas, reconexión y los seis guardianes.
- [x] Paso 4: Actualizar este spec con resultados, decisiones cerradas y changelog.

## 8. Verificación

```bash
# Frontend
cd frontend
bun run parkour:check
bun run parkour:aim
bun run world:check parkour
bun run check
bun run lint
bun run build

# Regresión de los mapas existentes
bun run map:check
bun run barnsiege:check
bun run race:check
bun run waves:check
```

`parkour:check` debe comprobar, como mínimo:

1. `Parkour.glb` existe, pesa 22 559 436 bytes y su SHA-256 coincide con
   `parkour.physics.json`.
2. La escena por defecto tiene 2 132 nodos, 2 100 mallas y 57 animaciones.
3. Existen `HP_Spawn_Top`, `HP_SpawnPad`, `HP_CP1_Root`–`HP_CP12_Root` y
   `HP_SummitTerrace`.
4. Las coordenadas de START y CP1–CP12 coinciden con las traslaciones de sus
   nodos `*_Root` (tolerancia 0.01 m); FINISH coincide con la **superficie
   superior** de `HP_SummitTerrace` (`y = 86`), no con el origen del nodo
   (`y ≈ 85.4`). La zona de meta cubre casi toda la terraza (25×25 m).
5. Los 12 checkpoints están sobre plazas con superficie superior igual a su
   `y`, y la meta está sobre `HP_SummitTerrace` (`y = 86`).
6. La rejilla de salida cabe dentro de `HP_SpawnPad` y no se solapa con el
   arco.
7. Los 85 nombres del grupo `suelo` existen, son mallas y suman ≤ 60 000
   triángulos; ningún nombre excluido (`*Island*`, `*Cloud*`, `*Star*`,
   `*Moon*`, `*Rock*`, `*Shaft*`, `*Rib*`, `*Spine*`, `*Flag*`, `*Sign*`,
   `*Rail*`, `*Arch*`, `*Merlon*`) está en el grupo.
8. Las transiciones directas entre plataformas `C`, `A` y plazas tienen hueco
   de borde ≤ 5.2 m y subida ≤ 1.2 m; las rampas `SP*_Step0..3` tienen
   pendiente ≤ 0.40 y no se tratan como saltos. El salto más exigente es
   `HP_Spawn_Top → HP_C01`, con 5.0 m de hueco y desnivel 0.
9. Los seis guardianes están sobre una superficie de ruta, fuera del radio de
   activación del checkpoint, con `y` igual a la superficie y con
   la órbita completa (`x ± patrolRadius`, `z ± patrolRadius`) dentro del AABB de su plaza.
10. `CHECKPOINT_RADIUS = 3.0`, `FINISH_RADIUS = 3.5`, `MAX_PLAYERS = 12`,
    `COUNTDOWN_MS = 30000`, `COUNTDOWN_SHORT_MS = 10000`,
    `MATCH_MAX_MS = 600000`, `RESULTS_MS = 15000`,
    `MAX_PUSH_HORIZONTAL = 20`, `MAX_PUSH_VERTICAL = 11` y
    `WARDEN_VERTICAL_REACH = 8`; cada guardián tiene `range ≥ 5`,
    `impactRadius > 1`, una velocidad de patrulla `≥ 0.5 m/s` y empujes dentro
    del límite. El Ghost valida además que `chaseBounds` quede dentro de su plaza.

`parkour:aim` simula posiciones a 10 Hz (igual que `ParkourSession.svelte`) y
comprueba que correr en línea recta o saltar ya no permite atravesar la roca y
el ácido (el empuje se aplica), que parado también empuja, que cambiar de
dirección tras el lanzamiento sigue esquivando y que el cono de fuego empuja
aunque el jugador salte.

Casos manuales:

1. Entrar con `E`, ver el checkpoint `Parkour Spire` y comprobar que se carga
   solo `Parkour.glb`.
2. Con 2 navegadores, ver la rejilla 4×3, la cuenta atrás de 30 s y el
   movimiento congelado.
3. Al empezar, correr y saltar por C01–C06; comprobar que los saltos son
   posibles con la física actual.
4. Caer entre C01 y C02; ver `You fell!`, esperar 1 s y reaparecer en START.
5. Activar CP1 y caer; reaparecer en CP1 con protección de 1.5 s.
6. Intentar activar CP2 sin CP1; comprobar que no avanza.
7. Recorrer CP1–CP12 y comprobar que la baliza cambia al siguiente en cada
   activación.
8. Llegar a la terraza tras CP12 desde cualquier borde (no solo el centro);
   ver el overlay «YOU WIN!» o «FINISHED!» con el tiempo, el aviso al resto,
   los resultados y la vuelta a `(33.0, 0.4, −23.9)`.
9. Repetir con 12 jugadores; comprobar la rejilla, el recorte a 10 s y que no
   hay solapamientos.
10. Provocar al Golem, Witch, Demon, Vampire, PumpkinKing y Ghost a distancia;
    comprobar que sensan desde más lejos, que su área de empuje es mayor, que
    patrullan sin salir de su plaza y que la protección de respawn bloquea el
    empuje.
11. Caer desde CP5 y comprobar que no se aterriza en islas decorativas.
12. Desconectar en `playing` y reconectar; comprobar checkpoint y caídas.
13. Entrar/salir 10 veces y revisar consola, cuerpos y listeners.
14. Comprobar que no hay HUD de HP, daño, muerte, downs ni armas.
15. Provocar roca/ácido y correr en línea recta o saltar: el empuje debe
    aplicarse igualmente (no se atraviesa el poder). Cambiar de dirección justo
    después del lanzamiento sí debe esquivarlo.

## 9. Riesgos y mitigaciones

| Riesgo                                                 | Impacto | Mitigación                                                                                                                                             |
| ------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2 100 mallas / 768k triángulos bajan los FPS           | Alto    | Componente manual, ocultar cielo y `HP_FinishSub*`, medir `renderer.info`; si < 45 FPS, fusionar mallas decorativas por material o usar `BatchedMesh`. |
| La física incluye rims/rocks por prefijo               | Alto    | `exactGroups: true` y lista exacta de 85 superficies; `parkour:check` verifica que no entra ningún nombre excluido.                                    |
| Una isla decorativa atrapa al jugador que cae          | Alto    | Excluir `HP_*Island*`, `HP_SpireIsland_*` y `HP_FarIsland*` de la física; probar caída desde CP5 y CP8.                                                |
| El servidor no puede validar toda la física            | Medio   | Validar fase, rangos, delta, checkpoint esperado y cadencia; el cliente simula el movimiento, como en la carrera.                                      |
| Los empujes del Golem expulsan demasiado lejos         | Medio   | Límite de 16 m/s horizontal y 9 m/s vertical, cooldown 3.0 s, roca esquivable y protección de respawn.                                                 |
| Los guardianes disparan a través de la torre           | Medio   | Rango, `\|Δy\| ≤ 8`, fase y patrulla alrededor del ancla; si se detecta abuso, añadir comprobación de línea de visión 2D.                              |
| La ruta SP requiere saltos imposibles                  | Alto    | `parkour:check` valida rampas y huecos; las rampas SP se recorren, no se saltan.                                                                       |
| `world:build` sobrescribe `Parkour.svelte` o la física | Alto    | `manualComponent: true`, `manualPhysics: true` y guard explícito en `world-build.mjs`; nunca ejecutar `world:build parkour` sin el guard.              |
| El checkpoint de entrada se solapa con otros           | Bajo    | Medido delante de las escaleras de entrada del castillo `(33.0, 0.4, −23.9)`, radio 2; `parkour:check` comprueba distancias.                                                                             |
| La partida se alarga demasiado                         | Medio   | Límite de 10 min y ventana de gracia de 3.5 s tras el primer FINISH.                                                                                   |
| Reconexión pierde el progreso                          | Medio   | El servidor conserva checkpoint y caídas por `playerId` durante 20 s; el cliente restaura el snapshot.                                                 |
| El HUD tapa la ruta en móvil                           | Bajo    | HUD compacto, overlay de cuenta atrás, sin minimapa; probar en viewport táctil.                                                                        |

## 10. Preguntas abiertas

- [x] El checkpoint de entrada se mueve al área 2, delante de las escaleras de entrada del Castillo de Drácula, en `(33.0, 0.4, −23.9)`.
- [ ] ¿La ventana de gracia de 3.5 s tras el primer FINISH basta para empates por latencia y para leer la victoria, o conviene subirla a 4 s?
- [ ] ¿Los guardianes deben tener línea de visión 2D contra la torre o basta con rango + altura?
- [ ] ¿Conviene ocultar las islas inferiores y el mar de nubes para evitar que se vea el paso a través de ellas al caer, o se dejan visibles?
- [ ] En pruebas con 12 jugadores, ¿la rejilla 4×3 y los remotos siguen siendo legibles, o hay que bajar el máximo a 8?

## 11. Decisiones y notas

### 11.1 Coordenadas de START, checkpoints y FINISH

Coordenadas de juego (Y-up) medidas sobre `Parkour.glb`. `y` es la superficie
superior de la plaza; el respawn usa `y + 0.15`.

| Paso   | Nodo               | Nombre        | Juego `(x, y, z)`         | Blender `(x, y, z)`      |
| ------ | ------------------ | ------------- | ------------------------- | ------------------------ |
| START  | `HP_SpawnPadGlow`  | Start         | `(0, 0.15, 82.5)`         | `(0, -82.5, 0.15)`       |
| CP1    | `HP_CP1_Root`      | Checkpoint 1  | `(0, 3.0, 21.5)`          | `(0, -21.5, 3.0)`        |
| CP2    | `HP_CP2_Root`      | Checkpoint 2  | `(35, 7.5, -6)`           | `(35, 6, 7.5)`           |
| CP3    | `HP_CP3_Root`      | Checkpoint 3  | `(33, 9.2, -39.5)`        | `(33, 39.5, 9.2)`        |
| CP4    | `HP_CP4_Root`      | Checkpoint 4  | `(-6.5, 13.2, -53)`       | `(-6.5, 53, 13.2)`       |
| CP5    | `HP_SP1_Root`      | Checkpoint 5  | `(0, 22, -96.8)`          | `(0, 96.8, 22)`          |
| CP6    | `HP_SP2_Root`      | Checkpoint 6  | `(10.267, 30, -123.208)`  | `(10.267, 123.208, 30)`  |
| CP7    | `HP_SP3_Root`      | Checkpoint 7  | `(-15.142, 38, -110.670)` | `(-15.142, 110.670, 38)` |
| CP8    | `HP_SP4_Root`      | Checkpoint 8  | `(12.064, 46, -102.753)`  | `(12.064, 102.753, 46)`  |
| CP9    | `HP_SP5_Root`      | Checkpoint 9  | `(-2.650, 54, -126.967)`  | `(-2.650, 126.967, 54)`  |
| CP10   | `HP_SP6_Root`      | Checkpoint 10 | `(-8.156, 62, -99.173)`   | `(-8.156, 99.173, 62)`   |
| CP11   | `HP_SP7_Root`      | Checkpoint 11 | `(14.678, 70, -115.949)`  | `(14.678, 115.949, 70)`  |
| CP12   | `HP_SP8_Root`      | Checkpoint 12 | `(-13.491, 78, -119.002)` | `(-13.491, 119.002, 78)` |
| FINISH | `HP_SummitTerrace` | Summit        | `(0, 86, -112)`           | `(0, 112, 86)`           |

Notas:

- `HP_SpawnPad` tiene la superficie a `y ≈ 0.13`; `HP_SpawnPadGlow` está a
  `0.15`. La rejilla usa `y = 0.15`.
- `HP_Spawn_Top` mide `x ∈ [−11, 11]`, `z ∈ [70, 88]`, con superficie a
  `y = 0`. Es el único suelo de la salida.
- `HP_SummitTerrace` mide `x ∈ [−13, 13]`, `z ∈ [−125, −99]`, con superficie
  a `y = 86`.
- `HP_FinishSub` (`(0, 20.93, −63.01)`) y `HP_FinishSub2` son texto
  decorativo del tejado; se ocultan.

### 11.2 Ruta medida y superficies

La ruta se recorre en este orden. Las plataformas `C` y `A` son saltos
directos; las plazas `CP` son checkpoints; los niveles `SP` se suben por cuatro
rampas perimetrales, no por un salto directo.

| Tramo   | Nodo                 | Centro juego `(x, y, z)`  | Superficie `y` | Rol                      |
| ------- | -------------------- | ------------------------- | -------------- | ------------------------ |
| Salida  | `HP_Spawn_Top`       | `(0, 0, 79)`              | `0.0`          | Suelo de salida          |
| Salida  | `HP_SpawnPad`        | `(0, 0.13, 82.5)`         | `0.13`         | Pad de aparición         |
| Arco    | `HP_ArchBeam`        | `(0, 9.35, 71.2)`         | `10.03`        | Decorativo, sin collider |
| 1       | `HP_C01`             | `(0, 0, 62)`              | `0.0`          | Plataforma               |
| 2       | `HP_C02`             | `(0, 0.5, 53.5)`          | `0.5`          | Plataforma               |
| 3       | `HP_C03`             | `(−3.5, 1, 47.5)`         | `1.0`          | Plataforma               |
| 4       | `HP_C04`             | `(2, 1.5, 41)`            | `1.5`          | Plataforma               |
| 5       | `HP_C05`             | `(−2, 2, 35)`             | `2.0`          | Plataforma               |
| 6       | `HP_C06`             | `(3, 2.5, 29)`            | `2.5`          | Plataforma               |
| CP1     | `HP_CP1_Plaza`       | `(0, 3, 21.5)`            | `3.0`          | Checkpoint 1             |
| 7       | `HP_C07`             | `(7, 4, 14)`              | `4.0`          | Plataforma               |
| 8       | `HP_C08`             | `(14, 5, 8.5)`            | `5.0`          | Plataforma               |
| 9       | `HP_C09`             | `(21, 6, 4.5)`            | `6.0`          | Plataforma               |
| 10      | `HP_C10`             | `(28.5, 7, 1.5)`          | `7.0`          | Plataforma               |
| CP2     | `HP_CP2_Plaza`       | `(35, 7.5, −6)`           | `7.5`          | Checkpoint 2             |
| 11      | `HP_C11`             | `(37.5, 8, −14)`          | `8.0`          | Plataforma               |
| 12      | `HP_C12`             | `(39, 8.5, −22)`          | `8.5`          | Plataforma               |
| 13      | `HP_C13`             | `(37, 9, −30)`            | `9.0`          | Plataforma               |
| CP3     | `HP_CP3_Plaza`       | `(33, 9.2, −39.5)`        | `9.2`          | Checkpoint 3             |
| 14      | `HP_C14`             | `(25, 10, −44)`           | `10.0`         | Plataforma               |
| 15      | `HP_C15`             | `(17.5, 10.8, −47)`       | `10.8`         | Plataforma               |
| 16      | `HP_C16`             | `(9.5, 11.6, −49.5)`      | `11.6`         | Plataforma               |
| 17      | `HP_C17`             | `(1.5, 12.4, −51.5)`      | `12.4`         | Plataforma               |
| CP4     | `HP_CP4_Plaza`       | `(−6.5, 13.2, −53)`       | `13.2`         | Checkpoint 4             |
| A1      | `HP_A1`              | `(−13, 14.2, −54)`        | `14.2`         | Isla                     |
| A2      | `HP_A2`              | `(−17.5, 15.3, −54.2)`    | `15.3`         | Isla                     |
| A3      | `HP_A3`              | `(−22, 16.4, −55.5)`      | `16.4`         | Isla                     |
| A4      | `HP_A4`              | `(−17, 17.5, −56.54)`     | `17.5`         | Isla                     |
| A5      | `HP_A5`              | `(−12, 18.6, −56.5)`      | `18.6`         | Isla                     |
| A6      | `HP_A6`              | `(−7, 19.6, −56.5)`       | `19.6`         | Isla                     |
| A7      | `HP_A7`              | `(−2, 20.5, −56.5)`       | `20.5`         | Isla                     |
| Tejado  | `HP_RoofDeck`        | `(0, 20.73, −70)`         | `20.73`        | Cubierta                 |
| Pad     | `HP_SpirePad`        | `(0, 20.9, −74.6)`        | `20.9`         | Pad de la torre          |
| Puente  | `HP_BridgeDeck`      | `(0, 20.72, −86.8)`       | `20.72`        | Puente                   |
| Entrada | `HP_SpireEntryStep0` | `(0, 21.12, −88.4)`       | `21.12`        | Rampa                    |
| Entrada | `HP_SpireEntryStep1` | `(0, 21.52, −89.7)`       | `21.52`        | Rampa                    |
| Entrada | `HP_SpireEntryStep2` | `(0, 21.92, −91)`         | `21.92`        | Rampa                    |
| CP5     | `HP_SP1_Plaza`       | `(0, 22, −96.8)`          | `22.0`         | Checkpoint 5             |
| CP6     | `HP_SP2_Plaza`       | `(10.267, 30, −123.208)`  | `30.0`         | Checkpoint 6             |
| CP7     | `HP_SP3_Plaza`       | `(−15.142, 38, −110.670)` | `38.0`         | Checkpoint 7             |
| CP8     | `HP_SP4_Plaza`       | `(12.064, 46, −102.753)`  | `46.0`         | Checkpoint 8             |
| CP9     | `HP_SP5_Plaza`       | `(−2.650, 54, −126.967)`  | `54.0`         | Checkpoint 9             |
| CP10    | `HP_SP6_Plaza`       | `(−8.156, 62, −99.173)`   | `62.0`         | Checkpoint 10            |
| CP11    | `HP_SP7_Plaza`       | `(14.678, 70, −115.949)`  | `70.0`         | Checkpoint 11            |
| CP12    | `HP_SP8_Plaza`       | `(−13.491, 78, −119.002)` | `78.0`         | Checkpoint 12            |
| FINISH  | `HP_SummitTerrace`   | `(0, 86, −112)`           | `86.0`         | Meta                     |

Cada nivel `HP_SPn` tiene cuatro rampas `Step0..3` y un `TowerLink`. Las rampas
suben 1.6 m entre centros y se validan por pendiente, no como saltos. El tramo
`A7 → HP_RoofDeck` usa la cubierta (borde en `z = −59.2`), no un salto de
13.6 m. El tramo `HP_RoofDeck → HP_SpirePad → HP_BridgeDeck` usa las cubiertas
existentes; la entrada a la torre usa `SpireEntryStep0..2`.

El salto de borde más largo de la ruta es `HP_Spawn_Top → HP_C01`: el suelo de
salida termina en `z = 70` y `HP_C01` empieza en `z = 65`, es decir **5.0 m**
de hueco sin desnivel. El resto de saltos `C`, `A` y plazas quedan por debajo
de 4.0 m de hueco. Por eso el límite de `parkour:check` es 5.2 m y el diseño no
debe añadir ninguna plataforma intermedia.

### 11.3 Física: solo la ruta

`parkour.physics.json` debe declarar `exactGroups: true` para que
`ChunkedColliders` monte exactamente los nombres del grupo `suelo`, sin incluir
por prefijo `_Rim`, `_Rock`, `_Sub`, `_Text` ni otros adornos. La lista exacta
es:

```text
HP_Spawn_Top, HP_SpawnPad,
HP_CP1_Plaza, HP_CP2_Plaza, HP_CP3_Plaza, HP_CP4_Plaza,
HP_C01..HP_C17,
HP_A1..HP_A7,
HP_RoofDeck, HP_SpirePad, HP_BridgeDeck,
HP_SpireEntryStep0, HP_SpireEntryStep1, HP_SpireEntryStep2,
HP_SP1_Plaza..HP_SP8_Plaza,
HP_SP1_Step0..HP_SP1_Step3, ... HP_SP8_Step0..HP_SP8_Step3,
HP_SP1_TowerLink..HP_SP8_TowerLink,
HP_SummitTerrace
```

Son **85 nodos** (2 de salida, 4 plazas CP, 17 C, 7 A, 3 cubiertas, 3
escalones de entrada, 8 plazas SP, 32 rampas SP, 8 tower links y la terraza).
La malla de colisión suma **3 244 triángulos** (medidos sobre los 85 nodos
exactos); el límite de 60 000 deja un margen enorme para futuras variantes.

Quedan **fuera** de la física, aunque sigan visibles salvo que se oculten por rendimiento:

- `HP_Cloud*`, `HP_Star*`, `HP_Moon*` (cielo).
- `HP_*Island*`, `HP_FarIsland*`, `HP_SpireIsland_*` (islas inferiores).
- `HP_*_Rock`, `HP_SpireRock*` (rocas decorativas).
- `HP_SpireShaft`, `HP_SpireRib*`, `HP_SpireSpine*` (torre).
- `HP_*Flag*`, `HP_*Sign*`, `HP_*Rail*`, `HP_*Post*`, `HP_*Arch*`,
  `HP_*Merlon*`, `HP_*Lamp*`, `HP_*Torch*`, `HP_*Flame*`, `HP_*Win*`,
  `HP_*Banner*` y `HP_FinishSub*`.

El mapa no tiene suelo global: si se cae fuera de la ruta, se cae al vacío y
salta el respawn. No hay barreras invisibles ni contención lateral.

### 11.4 Guardianes

Los seis guardianes patrullan en órbita alrededor de su ancla (sin salir de la
plaza) y giran hacia el objetivo cercano. Usan los poderes de `SPEC-023` con
`damage = 0`.

| ID             | Tipo        | Ancla `(x, y, z)`     | Poder        | Rango | Cooldown | Empuje `(horizontal, vertical)` |
| -------------- | ----------- | --------------------- | ------------ | ----- | -------- | ------------------------------- |
| `golem-cp2`    | Golem       | `(38.2, 7.5, −8.6)`   | Roca         | 34 m  | 2.6 s    | `(17.0, 10.0)`                  |
| `witch-cp4`    | Witch       | `(−9.6, 13.2, −55.6)` | Ácido        | 30 m  | 2.0 s    | `(13.0, 6.0)`                   |
| `ghost-cp6`    | Ghost       | `(13.2, 30, −125.6)`  | Zarpazo      | 8 m   | 0.7 s    | `(11.0, 5.0)`                   |
| `vampire-cp8`  | Vampire     | `(14.7, 46, −105.0)`  | Ácido        | 28 m  | 1.7 s    | `(13.0, 5.5)`                   |
| `pumpkin-cp10` | PumpkinKing | `(−10.8, 62, −101.7)` | Ácido        | 36 m  | 2.4 s    | `(15.0, 6.5)`                   |
| `demon-cp12`   | Demon       | `(−10.9, 78, −121.4)` | Fuego (cono) | 21 m  | 2.0 s    | `(9.0, 4.5)` × 3 pulsos         |

Reglas:

- Objetivo: jugador no terminado, no protegido, más cercano dentro de rango y
  `|Δy| ≤ 8 m`.
- `ParkourWarden.svelte` coloca el grupo visual en la posición de patrulla
  determinista alrededor del ancla `(x, y, z)` de cada guardián; `y` es la
  superficie de la plataforma y el modelo apoya los pies en `y = 0` tras
  normalizarse. Reproduce `HR_walk` mientras avanza.
- El **Ghost es melee y persigue**: si hay un jugador dentro de su plaza
  (`chaseBounds`), avanza hacia él a `chaseSpeed` (3.6 m/s) y se detiene a
  `chaseStandoff` (1.5 m). Si el jugador sale de la plaza, vuelve a su órbita.
  La persecución está limitada a `chaseBounds` y nunca abandona el checkpoint;
  servidor y cliente usan `parkourWardenChaseStep()`.
- No hay daño, veneno, ralentización ni muerte; el ácido solo empuja en el
  impacto y su charco es visual.
- La roca y el ácido apuntan a la **posición anticipada** del objetivo
  (velocidad reportada × tiempo de vuelo × 0.8 / 0.85) y resuelven el impacto
  0.55–1.45 s después. Además, cada tick se barre el segmento recorrido por el
  proyectil contra una cápsula del cuerpo del jugador (0.55 m de radio,
  1.9 m de alto), así que correr en línea recta o saltar ya no permite
  atravesarlos: para esquivar hay que cambiar de dirección o frenar después
  del lanzamiento. Las constantes viven en `parkourConfig.ts`
  (`PARKOUR_*_TARGET_LEAD`, `PARKOUR_*_SWEEP_RADIUS`).
- El fuego reorienta el cono y aplica hasta tres pulsos; salir del cono cancela
  los pulsos restantes.
- El zarpazo ocurre a ≤ 8 m; el Ghost persigue, pero no sale de su plaza.
- `WARDEN_ARM_DELAY_MS = 2000` desde `playing`.
- La protección de respawn (`1.5 s`) hace al jugador inmune a empujes.
- Los guardianes no atacan en `countdown` ni en `results`.

### 11.5 Protocolo

Tipos compartidos (resumen; se implementan en ambos protocolos):

```ts
export type Mg7Phase = "idle" | "countdown" | "playing" | "results";

export type Mg7PlayerState = {
  id: string;
  name: string;
  skin: SkinId;
  checkpoint: number; // 0 = START, 1..12 = CP, 13 = FINISH
  nextCheckpoint: number; // 1..13
  falls: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  finishedAt: number | null;
  respawnAt: number | null;
  protectionUntil: number | null;
};

export type Mg7Snapshot = {
  phase: Mg7Phase;
  serverTime: number;
  endsAt: number | null;
  countdownEndsAt: number | null;
  startedAt: number | null;
  maxPlayers: number;
  players: Mg7PlayerState[];
  winnerId: string | null;
};

export type Mg7Position = {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
};

export type Mg7Positions = {
  players: Mg7Position[];
  at: number;
};

export type Mg7WardenAttack = {
  id: string;
  wardenId: string;
  kind: "rock" | "acid" | "fire" | "shove";
  targetId: string;
  origin: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  dx: number;
  dz: number;
  at: number;
  impactAt: number;
};

export type Mg7Event =
  | {
      kind: "checkpoint";
      playerId: string;
      index: number;
      name: string;
      at: number;
    }
  | { kind: "fall"; playerId: string; checkpoint: number; at: number }
  | {
      kind: "respawn";
      playerId: string;
      checkpoint: number;
      x: number;
      y: number;
      z: number;
      protectionUntil: number;
      at: number;
    }
  | {
      kind: "finish";
      playerId: string;
      position: number;
      timeMs: number;
      at: number;
    }
  | { kind: "warden-attack"; attack: Mg7WardenAttack }
  | {
      kind: "shove";
      playerId: string;
      kind: Mg7WardenAttack["kind"];
      dx: number;
      dy: number;
      at: number;
    }
  | { kind: "match-start"; at: number }
  | { kind: "match-end"; winnerId: string | null; at: number }
  | { kind: "player-joined"; playerId: string; at: number }
  | { kind: "player-left"; playerId: string; at: number };
```

Cliente → servidor: `ping`, `mg7-position`.

Servidor → cliente: `pong`, `mg7-state`, `mg7-positions`, `mg7-event`, `error`,
`go-lobby`.

El cliente no envía checkpoints, caídas, respawns ni impactos. Esas decisiones
son del servidor.

### 11.6 Máquina de estados y caída

```text
idle
  └─ primer jugador → countdown (30 s; 10 s si 12/12)
       └─ 0 s → playing (máx. 10 min)
            ├─ primer FINISH + 1.5 s de gracia → results (15 s)
            └─ 10 min → results (15 s)
                 └─ 15 s → go-lobby → idle
```

Caída por jugador:

1. El cliente reporta posición a 10 Hz.
2. El servidor compara `y` con `lastCheckpoint.y − 2.5`.
3. Si se mantiene 250 ms por debajo, o si `y < −8`, marca `fall`,
   incrementa `falls`, emite `fall` y fija `respawnAt = now + 1000`.
4. A los 1 000 ms emite `respawn` con el centro del último checkpoint,
   `y + 0.15`, y `protectionUntil = now + 1500`.
5. El cliente teletransporta al jugador y muestra la protección.
6. La caída no toca HP, checkpoints, posición en la carrera ni el timer.

`PlayerCollider` mantiene además su respawn de emergencia en `y < −20` para
que un cliente congelado o sin red no caiga indefinidamente.

### 11.7 Rejilla de salida

12 slots dentro de `HP_SpawnPad`:

| Columna | `x`    |
| ------- | ------ |
| 1       | `−2.4` |
| 2       | `−0.8` |
| 3       | `0.8`  |
| 4       | `2.4`  |

| Fila | `z`    |
| ---- | ------ |
| 1    | `81.0` |
| 2    | `82.6` |
| 3    | `84.2` |

Todos con `y = 0.15` y `yaw = π` (mirando hacia `−Z`, hacia la ruta). La
separación mínima es 1.6 m; el cuerpo del jugador no se solapa con el borde del
pad. La superficie real de `HP_SpawnPad` es octogonal: las filas se mantienen
lejos de las esquinas de su AABB, que caen sobre `HP_Spawn_Rim` (sin collider).
`parkour:check` comprueba con los triángulos reales del pad que los 12 slots
tienen suelo.

### 11.8 Decisiones cerradas

- **Id `minigame-7`**: `minigame-6` es Witch House Deathmatch (`SPEC-025`,
  antes Hexfire); no se reutiliza.
- **Room `parkour`**: no singleton, 12 jugadores, reconexión 20 s.
- **Mapa Y-up**: no se rota el GLB; las coordenadas del usuario se convierten
  con `(x, z, −y)`.
- **Física `chunked`**: 16 m, 85 superficies exactas, 3 244 triángulos.
- **Solo rutas colisionables**: las islas decorativas y el cielo no frenan la
  caída.
- **Checkpoints secuenciales**: no hay atajos; solo el siguiente cuenta.
- **Sin daño**: los poderes de `SPEC-023` se reducen a empuje.
- **Guardianes fijos**: no hay pathfinding ni oleadas.
- **Componente manual**: `Parkour.svelte` no se genera con `@threlte/gltf`.
- **Texto de meta engañoso**: `HP_FinishSub` y `HP_FinishSub2` se ocultan.
- **Resultados**: 15 s y vuelta a la plaza; el ganador es el primer FINISH.

## 12. Progreso

| Fecha      | Estado       | Nota                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-11-05 | borrador     | Spec creado; pendiente de implementación y validación del GLB.                                                                                                                                                                                                                                                                                                                                               |
| 2026-11-05 | implementado | Fases 1–7 completas. `parkour:check`, `world:check parkour`, `check`, `lint`, `build` y las regresiones de mapa/race/waves/dm/audio en verde. Pendiente la prueba manual con 2 y 12 navegadores (Fase 8, paso 3).                                                                                                                                                                                            |
| 2026-11-05 | corregido    | Fix de la caída en la salida: rejilla recolocada sobre la superficie real de `HP_SpawnPad` y `ChunkedColliders` replica los triángulos grandes en todas las celdas que cubren para evitar agujeros de colisión. `parkour:check` valida ahora el suelo real de cada slot.                                                                                                                                     |
| 2026-11-05 | corregido    | Guardianes: la posición del ancla se aplica ahora cada frame (como `WaveMonster`/`ParkourRemote`); antes el cast entero se quedaba en el origen del mapa. Salto del parkour subido a `PARKOUR_JUMP_SPEED = 8.0` (≈1.78 m) para los obstáculos altos.                                                                                                                                                         |
| 2026-11-05 | ajustado     | Guardianes más agresivos: sensan desde más lejos (17–32 m salvo Ghost), patrullan en órbita alrededor de su checkpoint sin salir de la plaza, área de impacto/onda más grande, empujes hasta 16/9 m/s y alcance vertical 8 m. La meta pasa a una zona rectangular de 25×25 m que cubre toda la terraza, con 3.5 s de gracia y overlay «YOU WIN!»/«FINISHED!».                                                |
| 2026-11-05 | corregido    | El overlay de victoria se ocultaba al entrar en `results` y dejaba el panel de resultados debajo; ahora son mutuamente excluyentes y los resultados se ven en una sola capa. Los guardianes patrullan más rápido (0.5–1.4 m/s) y reproducen `HR_walk` mientras avanzan, mirando al jugador solo cuando está cerca.                                                                                           |
| 2026-11-05 | ajustado     | Ghost y Demon intercambian posición: el Ghost pasa a CP6 (plaza baja) y el Demon a CP12 (terraza alta). Todos los guardianes suben su poder de ataque (Golem 34 m/17-10, Witch 30 m/13-6, Ghost 8 m/11-5, Vampire 28 m/13-5.5, Pumpkin 36 m/15-6.5, Demon 21 m/9-4.5) con cooldowns más cortos. El Ghost, al ser melee, persigue al jugador dentro de los límites de su plaza y vuelve a la órbita al salir. |
| 2026-11-10 | corregido    | **Caída al vacío con 2+ jugadores**: `ChunkedColliders` esperaba la malla un máximo de 180 *frames* (3 s a 60 FPS, 1,25 s a 144 Hz) y `Parkour.glb` (22 MB) se carga bajo demanda; con dos clientes descargándolo el mapa se marcaba listo con **0 colisionadores** y el jugador atravesaba el suelo. Ahora espera 20 s reales y nunca marca listo sin celdas.                                               |
| 2026-11-11 | corregido    | **Poderes de guardianes atravesables**: roca y ácido anticipan la velocidad del jugador y barren el segmento del proyectil contra su cápsula cada tick; correr recto o saltar ya no evita el empuje, cambiar de dirección sí. Verificado con `parkour:aim`. |

## 13. Changelog

- 2026-11-05 — Creación del spec con coordenadas medidas, ruta, física,
  guardianes, protocolo y plan de implementación.
- 2026-11-05 — Aclarado el id técnico: Parkour es **`minigame-7`** y la room
  **`parkour`**; **`minigame-6`** pertenece al Witch House Deathmatch
  (`SPEC-025`). Actualizados título y nombre del archivo.
- 2026-11-05 — Implementación completa de las fases 1–7: mapa y física manual
  (`exactGroups`), componente `Parkour.svelte`, protocolo `mg7-*`, room,
  motor autoritativo, estado cliente, guardianes, efectos, HUD, overlays,
  audio y `parkour:check`.
- 2026-11-05 — Correcciones de integración: la rejilla 4×3 se aplica desde el
  primer snapshot (no solo al empezar `playing`), el respawn y la salida se
  consumen por efectos reactivos, el empuje acumulado se limita a 12/7 m/s,
  el HUD muestra como máximo `12/12` al terminar y los resultados por tiempo
  ya no afirman que el líder alcanzó la terraza.
- 2026-11-05 — **Fix de caída en la salida**: la rejilla usaba las esquinas del
  AABB de `HP_SpawnPad`, que en realidad caen sobre `HP_Spawn_Rim` (sin
  collider) y el primer jugador caía al empezar. Las filas pasan a
  `81.0 / 82.6 / 84.2`, `parkour:check` valida el suelo con los triángulos
  reales del pad y `ChunkedColliders` duplica cada triángulo en todas las celdas
  que cubre, no solo en la de su centroide; así los suelos grandes
  (`HP_Spawn_Top`, plazas y terraza) ya no dejan agujeros entre chunks.
- 2026-11-05 — Correcciones de reconexión y HUD: un jugador que ya había
  terminado conserva `finishedAt` al reconectar, la protección de respawn se
  muestra como `1.5s`, los resultados usan `Returning in Ns` y el aviso de
  «Waiting for the results…» ya no se solapa con el panel de resultados.
- 2026-11-05 — Guardianes visibles en su checkpoint: `ParkourWarden` fija
  `group.position` en el `useTask` de cada frame (el `$effect` se ejecutaba
  antes de que el binding de `SkinCharacter` quedase resuelto y los seis
  modelos aparecían juntos en el origen del mapa). Salto del parkour subido de
  7.0 a 8.0 m/s (≈1.36 → 1.78 m) para superar los obstáculos altos sin tocar
  `JUMP_SPEED` del resto de modos.
- 2026-11-05 — **Guardianes más agresivos y meta clara**: rangos de sensado
  ampliados (Golem 30 m, Witch 26 m, Demon 17 m, Vampire 24 m, Pumpkin 32 m y
  Ghost 5 m), radios de impacto/onda de 3.2–17 m, empujes hasta 14/8 m/s y
  alcance vertical 8 m. Cada guardián patrulla en órbita lenta alrededor de su
  ancla con `parkourWardenPosition()` (misma posición determinista en servidor
  y cliente). FINISH usa una zona rectangular que cubre toda la terraza
  (`25×25 m`), la gracia sube a 3.5 s y el cliente muestra un overlay grande
  «YOU WIN!»/«FINISHED!» con tiempo total, además del aviso «reached the
  summit» para el resto.
- 2026-11-05 — **Fix de overlays y patrulla visible**: el overlay de victoria
  solo se renderiza mientras `phase !== 'results'`; antes seguía visible con
  `z-50` y tapaba el panel de resultados de `z-40`, que además tenía otra capa
  duplicada. Ahora victoria y resultados son excluyentes y el panel usa `z-50`.
  Los guardianes aumentan su velocidad de patrulla a 0.5–1.4 m/s y reproducen
  `HR_walk` mientras se desplazan; `parkour:check` verifica que la órbita
  completa quede dentro del AABB de la plaza.
- 2026-11-05 — **Ghost y Demon intercambiados y ataques más fuertes**: el Ghost ocupa
  ahora el checkpoint 6 (`13.2, 30, −125.6`) y el Demon el 12 (`−10.9, 78, −121.4`).
  Los seis guardianes amplían rango, radio de impacto y empuje (hasta 17/10 m/s; los
  límites autoritativos suben a 20/11) y reducen cooldowns. El Ghost es melee y
  **persigue** al jugador dentro de su plaza (`chaseBounds`), deteniéndose a 1.5 m;
  si el jugador sale del checkpoint vuelve a su órbita y nunca abandona la plaza.
  Servidor y cliente comparten `parkourWardenChaseStep()`.
- 2026-11-05 — **Recompensa de misión**: ser el primero en llegar a FINISH
  (`winnerId === selfId` al entrar en `results`) registra `parkour-summit` en
  `rw:missions:v1` y desbloquea `ghost` (`Ghost.glb`). El resto de posiciones no
  obtiene la skin.
- 2026-11-05 — **Checkpoint de entrada movido**: de la puerta exterior del
  castillo `(32.9, 0.4, −7.0)` a delante de las escaleras de entrada
  `(33.0, 0.4, −23.9)`. Se actualizan `PARKOUR_ENTRY`/`PARKOUR_EXIT` y el cartel
  3D se mueve con el checkpoint.
- 2026-11-10 — **Fix de caída al vacío con 2+ jugadores**:
  `ChunkedColliders` esperaba los nodos de física un máximo de 180 *frames*,
  que son 3 s a 60 FPS pero solo 1,25 s a 144 Hz. Como `Parkour.glb` (22 MB) no
  está en la precarga y se descarga al entrar, dos clientes compitiendo por la
  descarga agotaban ese presupuesto antes de montar los 85 nodos: el mapa se
  marcaba como listo con **0 colisionadores** y el jugador atravesaba el suelo.
  Ahora el límite es de `BUILD_TIMEOUT_MS = 20_000` por tiempo real, nunca se
  llama a `worldState.markReady()` sin mallas ni celdas, `mountedNames()`
  resuelve los nodos en un único `traverse` (en lugar de 85
  `getObjectByName`), y la espera larga (`> 2 s`) o el fallo final se registran
  una sola vez en consola. El log de éxito incluye los ms empleados.
- 2026-11-11 — **Los poderes de los guardianes ya no se atraviesan**: el
  servidor solo resolvía el impacto en el punto capturado al lanzar, así que
  correr en línea recta o saltar dejaba roca y ácido sin efecto. Ahora
  `onPosition` guarda la velocidad reportada (descartando saltos imposibles),
  el objetivo se anticipa con `PARKOUR_ROCK_TARGET_LEAD = 0.8` /
  `PARKOUR_ACID_TARGET_LEAD = 0.85` y cada tick se barre el segmento del
  proyectil contra la cápsula del jugador (`PLAYER_BODY_RADIUS = 0.55`,
  `PLAYER_BODY_HEIGHT = 1.9`). Cambiar de dirección o frenar después del
  lanzamiento sigue esquivando. Nuevo `bun run parkour:aim` con escenarios de
  carrera recta, salto, quieto, cambio de dirección y cono de fuego. Los
  cambios viven en `backend/src/` y se replican en `frontend/src/server/`
  (copia de referencia de los scripts `verify-*`).
