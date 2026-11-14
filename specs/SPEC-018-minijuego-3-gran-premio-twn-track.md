---
id: SPEC-018
titulo: "Minijuego 3: Gran Premio de 5 vueltas en TWN_Track con coches, poderes y checkpoints"
estado: en-progreso
prioridad: alta
creado: 2026-11-02
actualizado: 2026-11-11
responsable: opencode
etiquetas:
  [
    minijuego,
    multijugador,
    websocket,
    svelte,
    threlte,
    rapier,
    coches,
    carrera,
    gran-premio,
    twn-track,
    twn-gantry,
    checkpoints,
    vueltas,
    poderes,
    nitro,
    misil,
    servidor-autoritativo,
  ]
depende_de: [SPEC-002, SPEC-005, SPEC-009, SPEC-012, SPEC-014]
bloquea: []
estimacion: "44h"
---

# SPEC-018 — Minijuego 3: Gran Premio de 5 vueltas en TWN_Track

## 1. Contexto

El proyecto ya tiene:

- El mapa exterior `map.glb` montado con físicas selectivas (`SPEC-009` y
  `SPEC-012`). `TWN_Track` pertenece al grupo `suelo` y ya recibe un collider
  trimesh; `TWN_Gantry` pertenece a `paredes` y también tiene collider.
  `TWN_StartLine`, `TWN_TyreBarriers` y `TWN_BadgeLogo_*` están excluidos
  (decoración sin colisión).
- Tres coches conducibles con `DynamicRayCastVehicleController`, daño,
  destrucción, eyección y respawn (`SPEC-014`). Su estado vive en
  `backend/src/ws/cars.ts` y `frontend/src/lib/state/cars.svelte.ts`, y solo
  existe en `lobbyId === 'global'`.
- Tres checkpoints físicos (`SPEC-005`) y un `minigame-3` libre, hoy sin
  contenido propio. Su checkpoint está en `(0, 0, 6)`, en el centro del pueblo.
- Presencia, chat y un motor de sala autoritativo ya probado en
  `backend/src/ws/minigame2.ts`: fases, cuenta atrás, tick a 100 ms, snapshots,
  posiciones a 10 Hz y eventos.

### Geometría real de la pista (medida sobre `map.glb`)

`frontend/static/map.glb` mide 11 690 500 bytes y su SHA-256 es
`a6616e0f94b94652ab98ec719a75654664c404d520de05db36714b6968c3a272`.
Analizando el chunk JSON y los vértices en coordenadas de mundo se obtiene:

| Elemento                       | Valor medido                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------- |
| Centro de la pista (XZ)        | `(0.1056, 0.0)`                                                              |
| `TWN_Track` (asfalto)          | anillo completo, radio interior **86.0 m**, radio exterior **100.0 m**       |
| Superficie del asfalto         | `y = 0.02` (bordes/curbs a `y ≈ 0.07`)                                        |
| Ancho de pista                 | **14.0 m** constantes en toda la vuelta                                       |
| Longitud de la línea central   | `2π × 93.0 ≈ 584.3 m`; 5 vueltas ≈ **2 921 m**                               |
| `TWN_StartLine`                | `x ∈ [86.00, 100.00]`, `z ∈ [-1.08, 1.08]`, `y = 0.04`; cruza la pista de lado a lado |
| `TWN_Gantry` (arco de meta)    | `x ∈ [86.20, 99.80]`, `y ∈ [0.00, 8.50]`, `z ∈ [-0.35, 0.35]`                |
| Postes del gantry              | en los extremos `x ≈ 86.2` y `x ≈ 99.8`, fuera de la trazada                 |
| `TWN_Grandstand`               | `x ∈ [101.97, 115.35]`, `z ∈ [-13.50, 13.50]`, fuera del muro exterior       |
| Muro exterior `TWN_Walls`      | `x,z ∈ [-103, 103]`, altura 1.75 m; cierra la pista por fuera                |
| `TWN_Plaza` (interior)         | plano de 172×172 a `y = 0.03`; las zonas `area1..4` están a `y = 0.40`       |
| Obstáculos dentro del anillo   | ninguno: los edificios y vallas quedan fuera de `r ∈ [84, 102]`              |

La pista es, por tanto, un anillo limpio de 14 m de ancho alrededor del pueblo.
El arco `TWN_Gantry` está en el lado este (`θ = 0°`) y la línea de meta es
perpendicular al sentido de marcha en ese punto. La dirección elegida es
**θ creciente**: en la salida el morro apunta a **+Z** (de norte a sur), que es
la cara que muestra el texto `TWN_Gantry_TextN`.

El interior del anillo (radio < 86 m) es el pueblo, con calles abiertas. Sin una
barrera, un jugador podría cortar por el centro y saltarse parte del circuito;
por eso el spec añade una **barra invisible solo para coches de carrera** en
`r ≈ 86.6`, además de la validación de checkpoints en el servidor.

### Punto de entrada

El checkpoint de `minigame-3` se mueve del centro del pueblo a la hierba/plaza
interior junto al gantry, en `(83.0, 0.06, -3.0)` (radio 83.05, justo dentro del
borde interior de la pista y fuera de la trazada). Desde ahí se ve el arco de
meta y el jugador entra al Gran Premio con `E`, como en los otros minijuegos.

## 2. Objetivo

Convertir `minigame-3` en un Gran Premio multijugador para **hasta 6 pilotos**
en `TWN_Track`: al entrar, todos los coches se alinean en una parrilla delante
de `TWN_Gantry`, se espera una **cuenta atrás de 30 s** para que se unan los
jugadores y, al terminar, se corre **5 vueltas** con coches de modelo aleatorio,
8 checkpoints físicos por vuelta, cajas de poderes (nitro, reparación,
auto-reparación, misil, escudo, mina y rayo), daño, destrucción y respawn, con fases, vueltas,
posiciones, poderes y resultados decididos por el servidor y sincronizados por
WebSocket.

## 3. Alcance

**Incluye**

- Usar `TWN_Track` como circuito y `TWN_Gantry` como salida/meta, sin modificar
  `map.glb` ni sus colisiones existentes.
- Mover el checkpoint de `minigame-3` a `(83.0, 0.06, -3.0)`, junto al gantry.
- Parrilla de 6 coches delante de la línea de meta, alineada con el gantry.
- Sala autoritativa `minigame-3` con fases `idle → countdown → playing → results`.
- Cuenta atrás de 30 s al entrar el primer jugador; se acorta a 10 s si la sala
  llega a 6/6.
- Máximo 6 pilotos; rechazo de entrada si la sala está llena o la carrera ya
  empezó.
- 5 vueltas por carrera con 8 puertas de control por vuelta (meta + 7
  checkpoints) y validación de orden en el servidor.
- Asignación aleatoria de modelo de coche y de hueco de parrilla al entrar.
- Física de vehículo Rapier reutilizada de `SPEC-014` (chasis, 4 ruedas,
  suspensión, motor, freno, dirección, daño por impacto y vuelco).
- 12 cajas de poderes fijas en la pista; recogida y respawn autoritativos.
- 7 poderes: `nitro`, `repair`, `auto`, `missile`, `shield`, `mine` y `ray`.
- Daño por misil, mina, rayo y choque, destrucción, explosión y respawn a los
  3 s en el punto donde explotó el coche (si sigue sobre el asfalto).
- Reset manual del coche (`R`) si se queda atascado o volcado.
- Barrera interior invisible que solo colisiona con coches de carrera.
- HUD de carrera: vuelta, posición, velocidad, salud, poder, tiempo y lista de
  pilotos.
- Overlays de espera (30 s), salida (3-2-1-GO), destrucción y resultados.
- Controles de escritorio y táctiles (`W/A/S/D`, `Space`, `Q`, `R`).
- Cámara de coche reutilizada, avatares ocultos y retorno al mundo exterior.
- Sincronización de estado, posiciones, cajas, misiles, minas, rayos y eventos por WebSocket.
- Recompensa local al ganar el Gran Premio: desbloquea la skin `vampire`
  (`Vampire.glb`) mediante la misión `race-5-laps` en `rw:missions:v1`.
- Validación anti-trampas básica en el servidor (rangos, ritmo, saltos, orden de
  checkpoints, tiempo mínimo por vuelta).
- Script `race:check` que valida las constantes de la pista contra `map.glb`.
- Verificación de tipos, lint, build y pruebas manuales con dos navegadores.

**No incluye**

- Modificar, reexportar o rehacer `map.glb`, `TWN_Track`, `TWN_Gantry` o sus
  colliders.
- Simulación Rapier autoritativa en el servidor: el piloto simula su coche y
  reporta posición/rotación/velocidad; el servidor valida y difunde.
- Sonido de motor, música, bocina, choques o misiles.
- Minimapa, brújula, flechas 3D al siguiente checkpoint o vista de espectador
  (el minimapa/flecha queda aceptado para una fase posterior, no en esta).
- Matchmaking, ligas, ranking persistente, ELO o estadísticas históricas.
- Coches nuevos o tuning por coche: los tres modelos existentes y la misma
  física base.
- Armas distintas de misil, mina y rayo; drift puntuado, atajos, tunning o combustible.
- Atropellar o dañar a jugadores a pie: los coches de carrera solo se dañan
  entre sí con misiles, minas, rayos y choques.
- Persistencia si el backend se reinicia.
- Varias salas simultáneas de `minigame-3`: una sola instancia por proceso.
- Chat específico de la carrera (se usa el chat global de `SPEC-004`).
- Cambios en `minigame-1` o `minigame-2` más allá de compartir el componente de
  física extraído.
- Anti-cheat fuerte con servidor físico; se aceptan límites y validaciones
  básicas como en `SPEC-011`/`SPEC-014`.
- Replays, repeticiones o cámara libre.

## 4. Requisitos

### Funcionales

| ID    | Requisito                                                                                                                                                                                                                                    | Prioridad |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| RF-1  | `TWN_Track` se usa como circuito y `TWN_Gantry` como salida/meta; no se modifica la geometría ni las colisiones de `map.glb`.                                                                                                                | alta      |
| RF-2  | El checkpoint de `minigame-3` se mueve a `(83.0, 0.06, -3.0)`, radio 2.0, nombre “Grand Prix” y color `#ef4444`; el jugador lo alcanza caminando desde el pueblo y no se solapa con la trazada.                                             | alta      |
| RF-3  | Entrar con `E` al checkpoint (o con el botón de `LobbyOverlay`) une al jugador a `minigame-3`; el servidor lo coloca en un hueco libre de la parrilla y le asigna un modelo de coche aleatorio.                                             | alta      |
| RF-4  | La parrilla tiene 6 huecos fijos delante de `TWN_Gantry`: columnas `x = 89.5 / 93.5 / 97.5`, filas `z = -4.5 / -11.0`, `y = 1.1`, `yaw = -π/2` (morro hacia +Z).                                                                            | alta      |
| RF-5  | El servidor asigna al azar un hueco libre y un modelo (`coche_calabaza`, `coche_momia`, `coche_halloween`) al entrar; el hueco y el modelo no cambian durante la carrera. Se permite repetir modelo: dos o más pilotos pueden llevar el mismo coche.                                                                    | alta      |
| RF-6  | `RACE_MAX_PLAYERS = 6`; un séptimo jugador recibe `RACE_FULL` y permanece en `global` sin cambiar de lobby.                                                                                                                                 | alta      |
| RF-7  | Al entrar el primer jugador con la sala en `idle`, el servidor inicia `countdown` de 30 000 ms. Los siguientes jugadores que entran durante `countdown` se suman a la parrilla sin reiniciar el conteo.                                       | alta      |
| RF-8  | Si la sala llega a 6/6 durante `countdown`, el `endsAt` se recorta a `now + 10 000` ms (una sola vez) y se emite `countdown-shortened`.                                                                                                      | media     |
| RF-9  | Durante `countdown` los coches están congelados en la parrilla (cuerpo cinemático), la cámara sigue al coche, se puede mirar y usar el chat, pero no acelerar, girar, usar poderes ni recibir daño.                                          | alta      |
| RF-10 | Al terminar `countdown`, la sala pasa a `playing`, todos los cuerpos pasan a dinámicos y se emite `race-start` con el tiempo de salida.                                                                                                      | alta      |
| RF-11 | La carrera dura 5 vueltas y tiene un límite máximo de 480 000 ms; al llegar al límite se pasa a `results` con la clasificación por progreso.                                                                                                | alta      |
| RF-12 | Hay 8 puertas de control por vuelta: la 0 es la línea de meta de `TWN_Gantry` y las 1–7 están a 45°, 90°, 135°, 180°, 225°, 270° y 315° sobre el radio 93.0, con las coordenadas de §11.1.                                                | alta      |
| RF-13 | El servidor cuenta una vuelta solo cuando el coche cruza, en orden, las puertas 1→2→3→4→5→6→7→0; el primer cruce de la puerta 0 al arrancar marca el inicio de la vuelta 1 y no suma vuelta.                                               | alta      |
| RF-14 | El cruce de puerta se detecta por intersección del segmento entre la posición anterior y la nueva con la línea radial de la puerta (`r ∈ [86.5, 99.5]`), no por proximidad a un punto; además el vector del movimiento debe tener producto escalar positivo con la tangente de la carrera (θ creciente) para no validar un cruce en sentido contrario. | alta      |
| RF-15 | Una puerta fuera de orden, un salto de posición o una vuelta en menos de 10 000 ms no suman progreso; el servidor ignora el reporte y conserva el último estado válido.                                                                     | alta      |
| RF-16 | Las puertas son visuales (arcos/portales) y no otorgan progreso por sí mismas; el cliente nunca decide vueltas ni posición.                                                                                                                  | alta      |
| RF-17 | Hay 12 cajas de poderes fijas en la pista, en las coordenadas de §11.2, a `y = 1.2`; cada caja se puede recoger cada 5 000 ms.                                                                                                               | alta      |
| RF-18 | Una caja se recoge cuando el segmento recorrido por el coche pasa a ≤ 3.5 m de su centro; el servidor la desactiva, sortea un poder y emite `item-picked`.                                                                                   | alta      |
| RF-19 | Cada coche lleva como máximo un poder a la vez; recoger otra caja con un poder en mano no lo sustituye ni consume la caja.                                                                                                                   | alta      |
| RF-20 | El poder se usa con `Q` (escritorio) o el botón `Item` (táctil) y solo durante `playing` y con el coche vivo; el servidor valida propiedad y fase.                                                                                          | alta      |
| RF-21 | `nitro`: 3 000 ms de empuje extra (×1.8 de fuerza de motor) y velocidad máxima permitida 55 m/s; el HUD muestra un indicador.                                                                                                               | alta      |
| RF-22 | `repair`: suma 35 de salud al instante, sin pasar de 100.                                                                                                                                                                                    | alta      |
| RF-23 | `auto`: regenera 10 HP/s durante 5 000 ms (hasta 100) y se cancela al morir.                                                                                                                                                                 | alta      |
| RF-24 | `missile`: elige como objetivo al piloto inmediatamente por delante en la clasificación a ≤ 60 m; vuela 1 200 ms siguiendo el arco de la pista, impacta y aplica 30 de daño. Si no hay objetivo delante, se lanza hacia delante y se pierde.             | alta      |
| RF-25 | `shield`: 4 000 ms de inmunidad total a daño de misil, mina, rayo y choque; el coche sigue recibiendo empujes físicos.                                                                                                                       | alta      |
| RF-26 | El reparto de poderes es aleatorio con pesos `nitro 25`, `missile 20`, `mine 15`, `repair 15`, `ray 10`, `auto 10`, `shield 5`, calculado en el servidor.                                                                                   | alta      |
| RF-27 | Los coches empiezan con 100 de salud; el daño por choque usa la fórmula de `SPEC-014` (`clamp((impactSpeed - 5) × 3, 0, 35)`, enfriamiento 600 ms), el misil 30, la mina 30 y el rayo 25.                                                  | alta      |
| RF-28 | Al llegar a 0 de salud el coche explota, queda `destroyed` 3 000 ms y reaparece con 100 de salud en el punto donde explotó si sigue sobre el asfalto; si no, en la última puerta superada. Mira al sentido de la marcha, con velocidad cero y sin poder. | alta      |
| RF-29 | Un coche puede pedir `race-reset` con `R`/botón; el servidor lo reaparece en la última puerta con 2 000 ms de enfriamiento y sin perder vueltas.                                                                                           | media     |
| RF-30 | Si un coche reporta `y < -5` o permanece fuera del anillo (`r < 84` o `r > 102`) más de 2 000 ms, el servidor lo reaparece en la última puerta.                                                                                              | alta      |
| RF-31 | Al completar la vuelta 5, el piloto queda `finished`, se guarda su tiempo y se emite `player-finished`; puede seguir viendo la carrera pero ya no recibe daño.                                                                              | alta      |
| RF-32 | La carrera termina cuando todos los pilotos han terminado o al llegar a `RACE_MAX_MS`; pasa a `results` durante 15 000 ms y luego devuelve a todos a `global` en `RACE_EXIT`.                                                              | alta      |
| RF-33 | La clasificación ordena primero a los `finished` por `finishAt` y después al resto por `lap × 8 + gate` y distancia a la siguiente puerta.                                                                                                  | alta      |
| RF-34 | El HUD muestra: vuelta `n/5`, posición `P/6`, velocidad en km/h, barra de salud, poder en mano, tiempo de carrera y lista de pilotos con vuelta y estado.                                                                                   | alta      |
| RF-35 | El overlay de espera muestra `Waiting for players` y la cuenta atrás de 30 s; el de salida muestra `3, 2, 1, GO!` en los últimos 3 s; el de resultados muestra el podio y `Returning in Ns`.                                                | alta      |
| RF-36 | Si un jugador sale, se desconecta o cierra la pestaña, su coche se retira de la sala, se recalcula la clasificación y la carrera continúa; si no queda nadie, la sala vuelve a `idle`.                                                      | alta      |
| RF-37 | Si un jugador intenta entrar durante `playing` o `results`, recibe `RACE_IN_PROGRESS` y no cambia de lobby; si la sala está llena recibe `RACE_FULL`.                                                                                       | alta      |
| RF-38 | El servidor emite `race-state` completo al entrar, al cambiar de fase, al cambiar cualquier contador y cada 1 000 ms; emite `race-positions` a 10 Hz; emite `race-event` por cada evento relevante.                                          | alta      |
| RF-39 | El cliente envía `race-car-state` como máximo a 20 Hz (objetivo 10 Hz) y solo con números finitos mientras está en `minigame-3` y en `playing`; el campo `speed` se recorta a `MAX_SPEED = 55` antes de enviarse para que el nitro nunca provoque un rechazo.                                      | alta      |
| RF-40 | El servidor rechaza posiciones no finitas, coordenadas fuera de `±1000`, `y < -10` o `y > 50`, velocidades > 55 m/s, saltos > 60 m/s entre reportes y más de 20 mensajes/s por piloto.                                                     | alta      |
| RF-41 | Los coches remotos se interpolan con un búfer de 150 ms; los misiles recorren el arco de la pista entre origen y objetivo y no se teletransportan entre paquetes.                                                                            | media     |
| RF-42 | Los coches de carrera usan un grupo de colisión propio: chocan con el mapa, con la barrera interior, con los peatones y entre ellos, pero no con los coches libres de `SPEC-014`.                                                          | alta      |
| RF-43 | La barrera interior invisible está en `r ≈ 86.6`, mide 1.0 m de alto y solo colisiona con coches de carrera; no bloquea a los peatones ni a los coches libres.                                                                               | alta      |
| RF-44 | Mientras corre, el jugador no usa el avatar a pie: `PlayerCollider` queda deshabilitado, `playerState` se sincroniza con el chasis, `PlayerBehaviour` no envía `player-position` y `RemoteHeroes` oculta su avatar.                          | alta      |
| RF-45 | La cámara usa el perfil de coche de `SPEC-014` (radio 10, mínimo 6, máximo 16) y sigue al coche propio durante `countdown`, `playing` y `results`; al salir vuelve al perfil exterior.                                                       | alta      |
| RF-46 | Al terminar o abandonar la carrera, el jugador aparece en `RACE_EXIT = (83.0, 0.05, -3.0)`, recupera su avatar y su física y vuelve a enviar `player-position`.                                                                             | alta      |
| RF-47 | El cliente muestra las 12 cajas de poderes, los 8 arcos de checkpoint, los misiles en vuelo con forma de misil, las minas, los rayos, el escudo y la explosión de destrucción; el escudo es hijo del `RigidBody` del coche y lo sigue automáticamente. Todo se genera con geometría de Three, sin assets nuevos. | media     |
| RF-48 | Los arcos de checkpoint son visibles siempre sobre la pista; el arco 0 no se duplica (se usa `TWN_Gantry` + una línea de meta emisiva) y los arcos 1–7 muestran su número y se iluminan al ser la siguiente puerta del jugador local.        | media     |
| RF-49 | Controles de escritorio: `W/S` acelerar/frenar, `A/D` girar, `Space` freno de mano, `Q` usar poder, `R` resetear. En táctil: `Izq/Der`, `Acelerar`, `Freno`, `Item`, `Reset` y `Salir`.                                                     | alta      |
| RF-50 | El chat y los campos editables tienen prioridad: `W/A/S/D/Q/R/Space` no se procesan si el foco está en un input, `textarea`, `select`, `[contenteditable]` o el chat está abierto.                                                          | media     |
| RF-51 | `race:check` valida que el centro, los radios, el gantry, la línea de meta, los 6 huecos, las 8 puertas y las 12 cajas caen sobre el anillo de asfalto de `map.glb` y no dentro de geometría vertical colisionable.                          | media     |
| RF-52 | Cambiar de lobby, desconectar, entrar/salir repetidamente o terminar una carrera no deja cuerpos, controladores de vehículo, colliders, listeners ni intervalos huérfanos.                                                                     | alta      |
| RF-53 | `mine`: el piloto suelta una mina 2.2 m detrás del coche; se arma a los 1 000 ms, dura 20 000 ms, explota a ≤ 2.6 m de un rival y aplica 30 de daño; máximo 6 minas simultáneas.                                                               | alta      |
| RF-54 | `ray`: impacta al instante al piloto inmediatamente por delante a ≤ 60 m con 25 de daño y dibuja un rayo visible 450 ms entre ambos coches; el escudo lo bloquea.                                                                              | alta      |
| RF-55 | Ganar una carrera de `grand-prix` (evento autoritativo `race-ended` con `playerId === selfId`) registra `race-5-laps` en `rw:missions:v1` y desbloquea la skin `vampire`; la recompensa es permanente, idempotente y no se equipa automáticamente. | alta      |

### No funcionales

| ID     | Requisito               | Criterio                                                                                                                     |
| ------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| RNF-1  | Rendimiento             | 60 fps con 6 coches de carrera, 12 cajas, 8 arcos y el mapa completo en un portátil de gama media.                           |
| RNF-2  | Red                     | `race-positions` ≤ 4 KB por tick para 6 pilotos; `race-state` ≤ 10 KB; 10 Hz de posiciones y 1 Hz de heartbeat.              |
| RNF-3  | Sin asignaciones por frame | El interpolador y el controlador reutilizan `Vector3`/`Quaternion`; no se crean arrays por tick.                            |
| RNF-4  | Autoridad               | El cliente nunca decide fases, vueltas, checkpoints, cajas, poderes, daño, destrucción, respawn ni resultados.               |
| RNF-5  | Tipado                  | `cd backend && bunx tsc --noEmit` y `cd frontend && bun run check` pasan sin errores.                                        |
| RNF-6  | Formato                 | `bun run lint` pasa en los archivos nuevos y modificados (o Prettier acotado si el lint global tiene deuda previa).           |
| RNF-7  | SSR seguro              | Nada de Rapier, `window` ni `localStorage` fuera de `<Canvas>`, `$effect`, `onMount` o guards de `browser`.                   |
| RNF-8  | Determinismo            | Posiciones de parrilla, puertas y cajas son fijas; solo son aleatorios el hueco, el modelo y el poder.                        |
| RNF-9  | Aislamiento             | El estado de la carrera no altera `minigame-1`, `minigame-2`, los coches libres, el chat, la presencia ni las misiones.      |
| RNF-10 | Recuperación            | Una excepción en el tick de carrera se registra, emite `error` a la sala y reinicia la sala a `idle` sin tumbar el socket.    |
| RNF-11 | Memoria del servidor    | El estado de la sala es un `Map` de 6 pilotos, 12 cajas, un máximo de 6 misiles y 6 minas; no crece con el tiempo.           |
| RNF-12 | Accesibilidad           | El HUD no bloquea el canvas ni el chat; los botones táctiles tienen `aria-label`; los avisos usan `role="status"`.            |
| RNF-13 | Sin dependencias nuevas | Solo `@threlte/*`, `three`, Rapier, Svelte, Tailwind y Zod ya instalados.                                                    |
| RNF-14 | Compatibilidad          | `SPEC-005`, `SPEC-009`, `SPEC-011`, `SPEC-012`, `SPEC-013` y `SPEC-014` siguen funcionando igual.                            |
| RNF-15 | Reversibilidad          | Si la carrera falla, el jugador puede volver a `global` con `leave-lobby` y el mapa sigue jugable.                           |

## 5. Criterios de aceptación

- [ ] CA-1: `bun run race:check` valida `map.glb`, el anillo `r ∈ [86, 100]`, el gantry, la línea de meta, los 6 huecos, las 8 puertas y las 12 cajas sin errores.
- [ ] CA-2: El checkpoint de `minigame-3` está junto al gantry, en `(83.0, 0.06, -3.0)`, y muestra “Pulsa E para entrar a Grand Prix”.
- [ ] CA-3: Al pulsar `E`, el jugador entra a `minigame-3`, aparece en un hueco de la parrilla y ve su coche (modelo aleatorio) delante del gantry.
- [ ] CA-4: Con un solo jugador dentro, el HUD muestra `Waiting for players` y una cuenta atrás de 30 s; el coche no se mueve aunque se pulse `W`.
- [ ] CA-5: Un segundo jugador que entra durante la espera ocupa otro hueco y ve la misma cuenta atrás sin reiniciarla.
- [ ] CA-6: Con 6 pilotos, la cuenta atrás se recorta a 10 s y se emite `countdown-shortened`.
- [ ] CA-7: Un séptimo jugador recibe `RACE_FULL` y no cambia de lobby.
- [ ] CA-8: Al llegar a 0, se ve `3, 2, 1, GO!`, todos los coches se mueven y el HUD marca la vuelta 1/5.
- [ ] CA-9: Los coches arrancan alineados en 3 columnas × 2 filas detrás de la línea de meta, con el morro hacia +Z.
- [ ] CA-10: El coche acelera, frena, gira y choca contra el muro exterior sin atravesarlo; las ruedas giran y las delanteras se orientan.
- [ ] CA-11: Al cruzar la línea de meta la primera vez no suma vuelta; tras pasar 1→2→…→7→0 el HUD sube a la vuelta 2/5.
- [ ] CA-12: Saltarse una puerta (por ejemplo, cortar por el centro) no suma vuelta; el servidor mantiene el progreso anterior.
- [ ] CA-13: La barrera interior impide a los coches de carrera cortar por el pueblo, pero un jugador a pie puede atravesarla.
- [ ] CA-14: Recoger una caja muestra el poder en el HUD y la caja desaparece para todos durante 5 s.
- [ ] CA-15: Con un poder en mano, pasar por otra caja no lo sustituye.
- [ ] CA-16: `Q` con `nitro` acelera el coche por encima de la velocidad normal durante 3 s y el HUD lo indica.
- [ ] CA-17: `Q` con `repair` sube la salud 35 puntos sin pasar de 100.
- [ ] CA-18: `Q` con `auto` regenera salud durante 5 s.
- [ ] CA-19: `Q` con `missile` lanza un proyectil visible contra el piloto de delante y le quita 30 de salud al impactar.
- [ ] CA-20: `Q` con `shield` hace inmune al daño durante 4 s y se ve el escudo.
- [ ] CA-21: Un choque fuerte o un misil reducen la salud en el HUD sin aplicar el mismo daño dos veces.
- [ ] CA-22: Al llegar a 0 de salud el coche explota, desaparece 3 s y reaparece donde explotó (si sigue sobre el asfalto) con 100 de salud y las vueltas intactas.
- [ ] CA-37: `Q` con `mine` suelta una mina visible detrás del coche; al pasar un rival por encima explode y le quita 30 de salud.
- [ ] CA-38: `Q` con `ray` dibuja un rayo instantáneo contra el piloto de delante y le quita 25 de salud.
- [ ] CA-23: `R` reaparece el coche en la última puerta con un enfriamiento de 2 s.
- [ ] CA-24: Un coche que cae por debajo de `y = -5` o se sale del anillo más de 2 s reaparece en la última puerta.
- [ ] CA-25: Al completar la vuelta 5, el piloto ve `You finished!` y su posición final; los demás siguen corriendo.
- [ ] CA-26: Al terminar todos o agotarse los 8 min, se muestra el podio y a los 15 s todos vuelven a `global` en `(83.0, 0.05, -3.0)`.
- [ ] CA-27: Dos navegadores ven los mismos coches, cajas, misiles, vueltas, posiciones y tiempos.
- [ ] CA-28: Los coches remotos se mueven interpolados, sin saltos, y los misiles viajan de forma continua.
- [ ] CA-29: Si un piloto cierra la pestaña, su coche desaparece, la clasificación se recalcula y la carrera continúa.
- [ ] CA-30: Si todos salen durante la carrera, la sala vuelve a `idle`; al volver a entrar empieza una espera nueva.
- [ ] CA-31: Entrar durante `playing` devuelve `RACE_IN_PROGRESS` y no cambia de lobby.
- [ ] CA-32: Mientras corre, el avatar del piloto no se ve, la cámara sigue al coche y los demás clientes ocultan su avatar.
- [ ] CA-33: Al salir, el jugador aparece junto al gantry, recupera su avatar, su cámara y su movimiento a pie.
- [ ] CA-34: El chat, el alias, los checkpoints, los rollos de papel, `minigame-2` y los coches libres siguen funcionando igual.
- [ ] CA-35: `cd backend && bunx tsc --noEmit`, `cd frontend && bun run check`, `bun run lint`, `bun run race:check` y `bun run build` pasan.
- [ ] CA-36: Entrar/salir 10 veces, cambiar de escena y reconectar no deja cuerpos, controladores ni errores de Rapier en consola.

## 6. Archivos relevantes

| Ruta                                                                   | Acción     | Motivo                                                                                          |
| ---------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------- |
| `backend/src/ws/race.ts`                                               | crear      | Motor autoritativo de la sala: fases, parrilla, vueltas, cajas, poderes, daño, misiles y resultados. |
| `backend/src/ws/protocol.ts`                                           | modificar  | Tipos `Race*`, esquemas Zod, unión de mensajes y `CLIENT_MESSAGE_TYPES`.                        |
| `backend/src/index.ts`                                                 | modificar  | Pre-chequeo de entrada, rutas de mensajes, `raceTick`, hooks de salida/desconexión y `RACE_TOPIC`. |
| `backend/README.md`                                                    | modificar  | Documentar el protocolo de carrera, fases, poderes y códigos de error.                          |
| `frontend/src/lib/services/protocol.ts`                                | modificar  | Duplicar tipos y guards `Race*`; ampliar `ClientMessage`, `ServerMessage` e `isServerMessage`.    |
| `frontend/src/lib/services/lobbySocket.ts`                             | modificar  | Callbacks `onRaceState`/`onRacePositions`/`onRaceEvent` y senders `sendRace*`.                    |
| `frontend/src/lib/state/race.svelte.ts`                                | crear      | Store reactivo, interpolación, clasificación local y acciones del cliente.                      |
| `frontend/src/lib/missions/minigames.ts`                               | crear      | Misión `race-5-laps` (título y descripción) compartida con el registro local.                   |
| `frontend/src/lib/state/missions.svelte.ts`                            | modificar  | Persistencia genérica de victorias de minijuego y `completeMinigameMission()`.                   |
| `frontend/src/lib/cosmetics/skins.ts`                                  | modificar  | `vampire.unlockMissionId = 'race-5-laps'`.                                                      |
| `frontend/src/lib/state/raceConfig.ts`                                 | crear      | Constantes de pista, parrilla, puertas, cajas, modelos, poderes y física.                       |
| `frontend/src/lib/state/raceInput.ts`                                  | crear      | Entrada de conducción de carrera separada de `carInput`.                                        |
| `frontend/src/lib/state/lobby.svelte.ts`                               | modificar  | Integrar el store, senders, reseteo y transición de salida.                                     |
| `frontend/src/lib/state/checkpoints.svelte.ts`                         | modificar  | Mover `minigame-3` a `(83.0, 0.06, -3.0)`, radio 2 y nombre “Grand Prix”.                        |
| `frontend/src/lib/state/sceneState.svelte.ts`                          | modificar  | Añadir `inRace` derivado de `lobby.self.lobbyId === 'minigame-3'`.                                |
| `frontend/src/lib/state/playerState.ts`                                | modificar  | Añadir `RACE_EXIT`, `RACE_ENTRY` de respaldo y `racing` a `playerRuntime`.                        |
| `frontend/src/lib/components/cars/VehiclePhysics.svelte`               | crear      | Física de vehículo reutilizable (chasis, ruedas, motor, daño, reporte e interpolación).          |
| `frontend/src/lib/components/cars/CarPhysics.svelte`                   | modificar  | Pasar a usar `VehiclePhysics` sin cambiar el comportamiento de `SPEC-014`.                       |
| `frontend/src/lib/components/race/RaceCar.svelte`                      | crear      | Modelo + física + escudo/explosión de un coche de carrera.                                       |
| `frontend/src/lib/components/race/RaceCars.svelte`                     | crear      | Renderiza los coches de la sala solo para los participantes.                                     |
| `frontend/src/lib/components/race/RaceGates.svelte`                    | crear      | Arcos de los 7 checkpoints y línea de meta emisiva.                                              |
| `frontend/src/lib/components/race/RaceItems.svelte`                    | crear      | Cajas de poderes con estado y respawn.                                                           |
| `frontend/src/lib/components/race/RaceMissiles.svelte`                 | crear      | Misiles con forma de proyectil, trayectoria curva y explosión de impacto.                        |
| `frontend/src/lib/components/race/RaceMines.svelte`                    | crear      | Minas soltadas en pista con armado, parpadeo y explosión.                                        |
| `frontend/src/lib/components/race/RaceRays.svelte`                     | crear      | Rayo instantáneo entre el piloto y su objetivo.                                                  |
| `frontend/src/lib/components/race/RaceGuardrail.svelte`                | crear      | Barrera interior invisible con colisión solo para coches de carrera.                             |
| `frontend/src/lib/components/race/RaceHud.svelte`                      | crear      | Vuelta, posición, velocidad, salud, poder, tiempo y lista de pilotos.                            |
| `frontend/src/lib/components/race/RaceOverlay.svelte`                  | crear      | Espera, salida 3-2-1-GO, destrucción y resultados.                                               |
| `frontend/src/lib/components/race/RaceControls.svelte`                 | crear      | Teclas `Q`/`R`/`Space` y entrada de conducción.                                                  |
| `frontend/src/lib/components/ui/MobileControls.svelte`                 | modificar  | Botones `Item`, `Reset`, `Salir` y controles de conducción de carrera.                           |
| `frontend/src/lib/components/player/PlayerCollider.svelte`             | modificar  | Deshabilitar el cuerpo y sincronizar `playerState` mientras se corre; teleport a `RACE_EXIT`.    |
| `frontend/src/lib/components/player/PlayerBehaviour.svelte`            | modificar  | No mover ni enviar `player-position` mientras `playerRuntime.racing`.                            |
| `frontend/src/lib/components/player/Player.svelte`                     | modificar  | Ocultar el avatar local mientras se corre.                                                       |
| `frontend/src/lib/components/player/RemoteHeroes.svelte`               | modificar  | Ocultar a los pilotos usando `race.racerIds`.                                                    |
| `frontend/src/lib/components/camera/ThirdPersonCamera.svelte`          | modificar  | Seguir el coche de carrera con el perfil de coche.                                               |
| `frontend/src/lib/Scene.svelte`                                        | modificar  | Montar `RaceCars`, `RaceGates`, `RaceItems`, `RaceMines`, `RaceMissiles`, `RaceRays` y `RaceGuardrail` en el mapa. |
| `frontend/src/lib/GamePage.svelte`                                     | modificar  | Montar `RaceHud` y `RaceOverlay` cuando `sceneState.inRace`.                                     |
| `frontend/scripts/verify-race-track.mjs`                               | crear      | Valida la pista y las constantes contra `map.glb`.                                               |
| `frontend/package.json`                                                | modificar  | Script `race:check`.                                                                             |
| `specs/SPEC-018-minijuego-3-gran-premio-twn-track.md`                  | crear      | Este spec.                                                                                       |

## 7. Plan de implementación

### Fase 0 — Verificar la pista y fijar constantes

- [ ] Paso 1: Confirmar con un script de solo lectura (o `race:check`) que
      `TWN_Track` es el anillo `r ∈ [86, 100]` centrado en `(0.1056, 0)`, que el
      asfalto está a `y = 0.02` y que `TWN_Gantry` y `TWN_StartLine` están en
      `x ≈ 93` con la línea perpendicular a +Z.
- [ ] Paso 2: Crear `frontend/src/lib/state/raceConfig.ts` con las constantes de
      §11 (pista, parrilla, puertas, cajas, poderes, física y red).
- [ ] Paso 3: Crear `frontend/scripts/verify-race-track.mjs` (solo Node: `fs`,
      `path`, `zlib` si hace falta) que lea el chunk JSON del GLB, calcule
      bounding boxes en mundo y compruebe:
      - anillo interior/exterior y altura del asfalto;
      - gantry y línea de meta;
      - los 6 huecos de parrilla dentro de `r ∈ [87, 99]`;
      - las 8 puertas dentro de `r ∈ [86.5, 99.5]`;
      - las 12 cajas dentro de `r ∈ [87, 99]`;
      - que ningún punto cae dentro de un triángulo vertical colisionable
        (paredes, edificios, vallas, postes del gantry).
- [ ] Paso 4: Añadir `"race:check": "node scripts/verify-race-track.mjs"` a
      `frontend/package.json` y ejecutarlo.

### Fase 1 — Contrato y motor de sala en el backend

- [ ] Paso 1: En `backend/src/ws/protocol.ts`, añadir:
      ```ts
      export type RacePhase = 'idle' | 'countdown' | 'playing' | 'results';
      export type RacePower = 'nitro' | 'repair' | 'auto' | 'missile' | 'shield' | 'mine' | 'ray';
      export type RaceStatus = 'grid' | 'racing' | 'destroyed' | 'finished' | 'left';
      ```
      y los tipos `RacePlayerState`, `RaceItemState`, `RaceMissileState`,
      `RaceSnapshot`, `RacePosition`, `RaceCarStateReport`, `RaceEventKind` y
      `RaceEvent` de §11.3.
- [ ] Paso 2: Añadir esquemas Zod:
      - `race-car-state`: `x,y,z,qx,qy,qz,qw,vx,vy,vz,speed,steering` finitos.
      - `race-use-item`: `{}`.
      - `race-reset`: `{}`.
      - `race-impact`: `impactSpeed` y `cause: 'collision' | 'rollover'`.
- [ ] Paso 3: Ampliar `ClientMessage`, `ServerMessage` y `CLIENT_MESSAGE_TYPES`
      con los cuatro mensajes de cliente y los tres de servidor.
- [ ] Paso 4: Crear `backend/src/ws/race.ts` con:
      ```ts
      initRace(deps): void
      canEnter(playerId: string): { ok: true } | { ok: false; code: string; message: string }
      onEnter(player: Player): void
      onLeave(playerId: string, reason: 'lobby' | 'disconnect'): void
      onCarState(playerId: string, report: RaceCarStateReport): void
      onUseItem(playerId: string): void
      onReset(playerId: string): void
      onImpact(playerId: string, impactSpeed: number, cause: 'collision' | 'rollover'): void
      tick(now: number): void
      buildSnapshot(): RaceSnapshot
      ```
      con `deps = { publish, reportError, moveToGlobal }`; `publish` emite al
      topic `lobby:minigame-3`.
- [ ] Paso 5: Implementar la máquina de estados:
      - `idle → countdown` al primer `onEnter` (`endsAt = now + 30_000`).
      - `countdown → playing` al vencer (`startedAt = now`); si llega a 6/6,
        recortar `endsAt` a `now + 10_000` una sola vez.
      - `playing → results` cuando todos terminan o vence `RACE_MAX_MS`.
      - `results → idle` a los 15 s; mover a todos a `global` con
        `moveToGlobal` y limpiar la sala.
- [ ] Paso 6: Implementar `onEnter`:
      - rechazar si `phase === 'playing' | 'results'` (`RACE_IN_PROGRESS`);
      - rechazar si hay 6 pilotos (`RACE_FULL`);
      - elegir al azar un hueco libre de §11.1 y un modelo de coche;
      - crear el piloto con `lap = 0`, `gate = 0`, `status = 'grid'`,
        `health = 100`, `item = null` y posición del hueco;
      - si la sala estaba `idle`, arrancar `countdown`;
      - publicar estado y `race-event` `player-joined`.
- [ ] Paso 7: Implementar el cruce de puertas con el segmento
      `previousPosition → newPosition` contra la línea radial de cada puerta
      (`r ∈ [86.5, 99.5]`, `y` ignorada) y comprobar que el producto escalar del
      desplazamiento con la tangente de la puerta (`θ` creciente) es positivo;
      un cruce hacia atrás no valida. Solo se acepta la puerta
      `gate + 1` (con `0` después de `7`); el primer cruce de la puerta `0`
      después de la salida marca `startedLap = true` y no suma vuelta.
      Añadir `MIN_LAP_MS = 10_000` y `MIN_GATE_MS = 500`.
- [ ] Paso 8: Implementar cajas y poderes:
      - 12 cajas fijas de §11.2 con `respawnAt = null`;
      - recogida por distancia del segmento recorrido al centro ≤ 3.5 m;
      - si el piloto ya lleva poder, no consumir la caja;
      - sorteo con pesos de §11.4;
      - `onUseItem` valida `phase === 'playing'`, piloto vivo y poder en mano.
- [ ] Paso 9: Implementar efectos:
      - `nitro`: `nitroUntil = now + 3000`, se refleja en el snapshot;
      - `repair`: `health = min(100, health + 35)`;
      - `auto`: `autoRepairUntil = now + 5000`, +10 HP/s en `tick`;
      - `shield`: `shieldUntil = now + 4000`;
      - `missile`: elegir objetivo por clasificación (siguiente por delante a
        ≤ 60 m), crear `RaceMissileState` con `hitAt = now + 1200` y emitir
        `missile-fired`; en `tick`, al vencer, aplicar 30 de daño salvo escudo.
      - `mine`: soltar una `RaceMineState` 2.2 m detrás, armar a 1 s, durar 20 s
        y explotar al primer rival a ≤ 2.6 m con 30 de daño;
      - `ray`: impactar al siguiente piloto por delante a ≤ 60 m con 25 de daño
        y emitir `ray-fired` con origen y destino para el rayo visual.
- [ ] Paso 10: Implementar daño, destrucción y respawn:
      - fórmula de choque de `SPEC-014` y enfriamiento de 600 ms;
      - `health <= 0` → `destroyed`, `respawnAt = now + 3000`, explosión y
        `player-destroyed`;
      - respawn en el punto de la explosión si sigue sobre el asfalto; si no,
        en la puerta `gate` con `yaw` tangente, salud 100, velocidad 0 y sin poder;
      - `race-reset` con enfriamiento de 2 s;
      - caída (`y < -5`) o fuera del anillo > 2 s → respawn automático.
- [ ] Paso 11: Implementar `tick(now)` cada 100 ms: fases, auto-reparación,
      misiles, minas, respawns, respawn de cajas, tiempo máximo, ranking,
      `race-positions` a 10 Hz y `race-state` cuando cambie algo o cada 1 s.
- [ ] Paso 12: Proteger el tick con `try/catch`: registrar, emitir `error` y
      resetear a `idle`.

### Fase 2 — Integración del backend

- [ ] Paso 1: En `backend/src/index.ts`, definir
      `const RACE_TOPIC = 'lobby:minigame-3'` e `initRace({...})` antes de
      `new Elysia()`, con `publish` al topic y `moveToGlobal` análogo a
      `initMinigame2`.
- [ ] Paso 2: En `case 'enter-lobby'`, antes de `carsOnPlayerLeave`, comprobar
      `if (message.lobbyId === 'minigame-3')` y llamar a `raceCanEnter(player.id)`;
      si falla, `sendError` y `return` sin cambiar de lobby.
- [ ] Paso 3: Tras `setLobby`, llamar a `raceOnEnter(updated)` cuando
      `message.lobbyId === 'minigame-3'`.
- [ ] Paso 4: En `leave-lobby`, llamar a `raceOnLeave(ws.id, 'lobby')` antes de
      `setLobby('global')`; en `close`, llamarlo con `'disconnect'`.
- [ ] Paso 5: Enrutar `race-car-state`, `race-use-item`, `race-reset` y
      `race-impact`; comprobar `player.lobbyId === 'minigame-3'` y responder
      `NOT_IN_RACE` si no.
- [ ] Paso 6: Añadir `setInterval(() => raceTick(Date.now()), 100)` junto a los
      demás intervalos.
- [ ] Paso 7: Añadir logs `[race] enter …`, `[race] start …`, `[race] lap …`,
      `[race] finish …`, `[race] destroy …`, `[race] respawn …`, `[race] end …`.
- [ ] Paso 8: Verificar el contrato con un smoke test de Bun de dos clientes
      (entrar, esperar, moverse, cruzar puertas, usar un poder, salir) antes de
      tocar el frontend.

### Fase 3 — Protocolo, socket y store del frontend

- [ ] Paso 1: Duplicar en `frontend/src/lib/services/protocol.ts` los tipos y
      constantes `Race*`, y añadir guards `isRaceSnapshot`, `isRacePositions`,
      `isRaceEvent`; extender `isServerMessage` con `race-state`,
      `race-positions` y `race-event`.
- [ ] Paso 2: En `lobbySocket.ts`, añadir `onRaceState`, `onRacePositions`,
      `onRaceEvent`, `sendRaceCarState`, `sendRaceUseItem`, `sendRaceReset` y
      `sendRaceImpact`, y despacharlos en `handleMessage`.
- [ ] Paso 3: Crear `frontend/src/lib/state/race.svelte.ts`:
      - `snapshot = $state.raw<RaceSnapshot | null>(null)`;
      - `positions = $state.raw<Record<string, RacePosition>>({})`;
      - `selfId`, `self`, `phase`, `inCar`, `racerIds`, `rank`, `lap`, `gate`,
        `item`, `health`, `speed`;
      - `applySnapshot`, `applyPositions`, `applyEvent`, `reset`;
      - `setSender`, `sendState`, `useItem`, `requestReset`, `sendImpact`;
      - `interpolatedCars` con búfer de 150 ms.
- [ ] Paso 4: En `lobby.svelte.ts`, resetear `race` al desconectar, enlazar los
      callbacks y pasar los senders en `connect()`.
- [ ] Paso 5: En `onWelcome`, asignar `race.selfId`; en `onPresence`, guardar el
      `lobbyId` anterior y, si pasa de `'minigame-3'` a `'global'`, asignar
      `race.exitRequest = RACE_EXIT`, limpiar `raceInput` y llamar a
      `race.resetDriving()`; si `self.lobbyId !== 'minigame-3'` sin transición,
      solo resetear la conducción. `PlayerCollider` consume `exitRequest` en su
      siguiente frame (el servidor también mueve al jugador).
- [ ] Paso 6: En `sceneState.svelte.ts`, añadir `get inRace()` y usarlo en
      `GamePage.svelte`; la escena 3D sigue siendo `map`.

### Fase 4 — Física de vehículo compartida y coches de carrera

- [ ] Paso 1: Extraer de `CarPhysics.svelte` un `VehiclePhysics.svelte` con
      props:
      ```ts
      type VehicleSnapshot = {
        x: number; y: number; z: number;
        qx: number; qy: number; qz: number; qw: number;
        vx: number; vy: number; vz: number;
        speed: number; steering: number;
      };
      type Props = {
        snapshot: VehicleSnapshot;
        model: CarModel;
        isDriver: boolean;
        active: boolean;
        input: VehicleInput;
        snapToken: string;
        onReport?: (report: RaceCarStateReport) => void;
        onImpact?: (impactSpeed: number, cause: 'collision' | 'rollover') => void;
      };
      ```
      Debe conservar exactamente la física, las ruedas, la detección de impacto
      y vuelco, el `DynamicRayCastVehicleController` y la limpieza en
      `onDestroy` de `SPEC-014`.
- [ ] Paso 2: Adaptar `CarPhysics.svelte` para usar `VehiclePhysics` con el
      estado de `cars.cars[car.id]`; verificar que los coches libres siguen
      funcionando igual.
- [ ] Paso 3: Crear `RaceCar.svelte`: recibe `player` y `position`, resuelve el
      modelo con `CAR_MODEL_URLS`, monta `VehiclePhysics`, aplica
      `snapToken = player.id + ':' + status + ':' + respawnAt`, y muestra
      escudo/explosión.
- [ ] Paso 4: En `RaceCar.svelte`, mientras `phase === 'countdown'` el coche
      propio está `active = false` (cinemático en la parrilla); al pasar a
      `playing`, cambiar el cuerpo a dinámico (`body.setBodyType`) y colocar en
      el hueco.
- [ ] Paso 5: Para los coches remotos, `isDriver = false` y la posición se toma
      de `race.interpolatedCars`.
- [ ] Paso 6: Configurar `collisionGroups` de §11.5: coches de carrera en
      `GROUP_RACECAR`, coches libres en `GROUP_FREECAR`, barrera en
      `GROUP_RACEGUARD`; verificar que carrera y coches libres no colisionan.
- [ ] Paso 7: Crear `RaceCars.svelte` que itere `race.snapshot.players` y
      renderice un `RaceCar` por piloto; solo se monta si
      `sceneState.inRace && race.snapshot`.

### Fase 5 — Pista, checkpoints y cajas

- [ ] Paso 1: Crear `RaceGuardrail.svelte`: 32 segmentos de cuboide de 0.4 m de
      grosor × 1.0 m de alto a `r = 86.6`, `y = 0.5`, con
      `collisionGroups` de solo coches de carrera; sin malla visible.
- [ ] Paso 2: Crear `RaceGates.svelte`:
      - arco 0: línea de meta emisiva sobre `TWN_StartLine` (`x ∈ [86.5, 99.5]`,
        `z = 0`, `y = 0.05`) y texto “FINISH”;
      - arcos 1–7: dos postes + dintel de 12 m de ancho × 5 m de alto, color
        cian, número grande y brillo cuando son la siguiente puerta del jugador.
- [ ] Paso 3: Crear `RaceItems.svelte`: caja flotante giratoria con icono de
      interrogación, oculta mientras `respawnAt > now`, y anillo de respawn.
- [ ] Paso 4: Crear `RaceMissiles.svelte`: esfera emisiva con estela que
      interpola desde el origen al objetivo durante 1.2 s; al impactar, destello
      y explosión de 0.4 s.
- [ ] Paso 5: Montar `RaceCars`, `RaceGates`, `RaceItems`, `RaceMines`,
      `RaceMissiles`, `RaceRays` y `RaceGuardrail` en `Scene.svelte` dentro del
      bloque del mapa, solo cuando `sceneState.inRace`; los elementos con
      estado (coches, cajas, minas, misiles) solo se montan si hay snapshot.

### Fase 6 — Entrada, cámara y jugador a pie

- [ ] Paso 1: En `checkpoints.svelte.ts`, cambiar `minigame-3` a
      `{ name: 'Grand Prix', position: [83.0, 0.06, -3.0], color: '#ef4444', radius: 2 }`.
- [ ] Paso 2: En `playerState.ts`, añadir
      `RACE_EXIT = { x: 83.0, y: 0.05, z: -3.0 }`, `RACE_ENTRY` de respaldo
      `{ x: 93.5, y: 1.1, z: -4.5 }` y `racing: boolean` a `playerRuntime`.
- [ ] Paso 3: En `PlayerCollider.svelte`:
      - `enabled={!cars.isDriving && !race.inCar}`;
      - `playerRuntime.frozen = ... || race.inCar`;
      - `playerRuntime.racing = race.inCar`;
      - mientras `race.inCar`, copiar `playerState.x/y/z` desde el coche;
      - al recibir `race.exitRequest`, hacer `teleport(RACE_EXIT)` y limpiar.
- [ ] Paso 4: En `PlayerBehaviour.svelte`, si `playerRuntime.racing`, no
      procesar movimiento/salto y no enviar `player-position`.
- [ ] Paso 5: En `Player.svelte`, ocultar el avatar si `race.inCar`; en
      `RemoteHeroes.svelte`, filtrar `race.racerIds`.
- [ ] Paso 6: En `ThirdPersonCamera.svelte`, usar el perfil de coche y el
      objetivo del coche de carrera cuando `race.inCar`.
- [ ] Paso 7: En `race.svelte.ts`, exponer `entryRequest` y `exitRequest`
      consumibles por `PlayerCollider`, igual que `cars.ejectRequest`.

### Fase 7 — Sesión, HUD, overlays y controles

- [ ] Paso 1: Enviar `race-car-state` a 10 Hz desde `VehiclePhysics` a través
      de `RaceCar.onReport` mientras `race.inCar && phase === 'playing'`, con
      `speed = Math.min(speed, MAX_SPEED)` y descartando el mensaje si algún
      número no es finito. No se necesita un componente `RaceSession` aparte.
- [ ] Paso 2: Crear `RaceControls.svelte`: `W/S/A/D`, `Space`, `Q`, `R`; ignorar
      eventos repetidos, modificadores, inputs editables y `chat.isOpen`.
- [ ] Paso 3: Crear `RaceHud.svelte` con:
      - vuelta `n/5`, posición `P/6`, tiempo `m:ss`;
      - velocidad `Math.round(speed * 3.6)` km/h;
      - barra de salud y nombre del poder con su tecla;
      - lista de pilotos con vuelta, estado y si están delante/detrás.
- [ ] Paso 4: Crear `RaceOverlay.svelte`:
      - `countdown`: “Waiting for players” + `N/6` + cuenta atrás;
      - últimos 3 s: `3, 2, 1, GO!`;
      - `destroyed`: “You were destroyed” + `Respawning in Ns`;
      - `results`: podio, tiempos y `Returning in Ns`.
- [ ] Paso 5: Montar `RaceHud` y `RaceOverlay` en `GamePage.svelte` cuando
      `sceneState.inRace`; no tapar `ChatOverlay`, `MissionHud` ni
      `MobileControls`.
- [ ] Paso 6: En `MobileControls.svelte`, mientras `race.inCar`, sustituir el
      stick por `Izq/Der`, `Acelerar`, `Freno`, `Item`, `Reset` y `Salir`, que
      escriben en `raceInput.touch` sin pisar `carInput.touch`.
- [ ] Paso 7: Al terminar o abandonar, limpiar `raceInput`, `race.reset()`,
      `playerRuntime.racing` y el checkpoint activo, y teletransportar a
      `RACE_EXIT`.

### Fase 8 — Anti-trampas, recuperación y pulido

- [ ] Paso 1: Validar en el servidor todos los reportes: finitos, rangos,
      velocidad, salto, ritmo, fase y pertenencia a la sala.
- [ ] Paso 2: Añadir la comprobación de anillo (`r ∈ [84, 102]`) y el respawn
      automático tras 2 s fuera.
- [ ] Paso 3: Añadir `MIN_LAP_MS` y `MIN_GATE_MS`; una vuelta incompleta no
      cuenta aunque el cliente la muestre.
- [ ] Paso 4: Recalcular la clasificación en cada tick y en cada cruce; no
      confiar en el orden del cliente.
- [ ] Paso 5: Manejar jugadores que se van, se desconectan o entran tarde;
      limpiar misiles cuyo objetivo desaparece y minas de pilotos que salen.
- [ ] Paso 6: Verificar que `race` se resetea al cambiar de lobby, desconectar
      o cerrar la pestaña.
- [ ] Paso 7: Añadir el respawn seguro: si la puerta de respawn está ocupada,
      desplazar 3 m hacia atrás a lo largo de la tangente.

### Fase 9 — Verificación y cierre

- [ ] Paso 1: Ejecutar `bun run race:check`, `bun run check`, `bun run lint`,
      `bun run build` y `bunx tsc --noEmit`.
- [ ] Paso 2: Probar con dos navegadores los 36 criterios de §5.
- [ ] Paso 3: Medir FPS, tráfico y latencia con 6 pestañas simuladas.
- [ ] Paso 4: Actualizar este spec (`estado`, `actualizado`, Progreso,
      Changelog y checkboxes).
- [ ] Paso 5: Confirmar con el usuario las preguntas abiertas antes de
      considerar cerrada la implementación.

### Contrato de mensajes

```ts
// Cliente → servidor
type ClientMessage =
	| {
			type: 'race-car-state';
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
	| { type: 'race-use-item' }
	| { type: 'race-reset' }
	| { type: 'race-impact'; impactSpeed: number; cause: 'collision' | 'rollover' };

// Servidor → cliente
type ServerMessage =
	| { type: 'race-state'; state: RaceSnapshot }
	| { type: 'race-positions'; at: number; players: RacePosition[] }
	| { type: 'race-event'; event: RaceEvent };
```

## 8. Verificación

```bash
# Frontend
cd frontend
bun run race:check
bun run check
bun run lint
bun run build

# Backend
cd backend
bunx tsc --noEmit

# Prueba manual
cd frontend && bun run dev
# abrir http://localhost:5173/?physics=1 en dos navegadores
```

Resultado esperado de `race:check`:

| Comprobación                    | Esperado                          |
| ------------------------------- | --------------------------------- |
| Centro de pista                 | `(0.1056, 0)`                     |
| Radio interior / exterior       | 86.0 / 100.0                      |
| Altura del asfalto              | 0.02                              |
| Gantry (`TWN_Gantry`)           | `x ∈ [86.2, 99.8]`, `z ≈ 0`       |
| Línea de meta                   | `x ∈ [86, 100]`, `z ∈ [-1.08, 1.08]` |
| Huecos de parrilla              | 6 dentro del anillo               |
| Puertas                         | 8 dentro del anillo               |
| Cajas                           | 12 dentro del anillo              |
| Puntos dentro de geometría      | 0                                 |

Smoke test de dos clientes (backend levantado, en otra terminal):

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
  if (msg.type === "welcome") send(a, { type: "enter-lobby", lobbyId: "minigame-3" });
  if (msg.type === "race-state") {
    console.log("Ana", msg.state.phase, msg.state.players.length, msg.state.players.find((p) => p.name === "Ana")?.slot);
  }
};

b.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === "welcome") setTimeout(() => send(b, { type: "enter-lobby", lobbyId: "minigame-3" }), 500);
  if (msg.type === "error") console.log("Luis error", msg.code);
};

setTimeout(() => { a.close(); b.close(); process.exit(0); }, 5000);
'
```

Casos manuales:

1. **Checkpoint**: caminar hasta `(83.0, 0.05, -3.0)`, junto al gantry, y ver
   “Pulsa E para entrar a Grand Prix”.
2. **Entrada**: pulsar `E`; aparecer en un hueco de la parrilla, con el coche
   mirando a +Z y el gantry delante.
3. **Espera**: con un solo jugador, ver 30 s y comprobar que `W` no mueve el
   coche.
4. **Segundo jugador**: abrir otra pestaña, entrar y ver que ocupa otro hueco
   sin reiniciar el conteo.
5. **Salida**: al llegar a 0, ver `3, 2, 1, GO!` y arrancar.
6. **Conducción**: acelerar, girar, frenar y comprobar que el muro exterior y
   la barrera interior contienen el coche.
7. **Vueltas**: dar una vuelta completa pasando los 8 arcos y ver subir a
   `Lap 2/5`; comprobar que la primera línea no cuenta.
8. **Trampa**: cortar por el centro; la barrera lo impide y, si se fuerza, la
   vuelta no sube.
9. **Caja**: pasar por una caja y ver el poder en el HUD; la caja desaparece
   para ambos.
10. **Poderes**: probar `nitro`, `repair`, `auto`, `missile` y `shield` con `Q`.
11. **Misil**: lanzarlo contra el piloto de delante y ver el proyectil y la
    pérdida de salud.
12. **Destrucción**: recibir daño hasta 0, ver la explosión, esperar 3 s y
    reaparecer en la última puerta.
13. **Reset**: volcar el coche y pulsar `R`; reaparecer en la última puerta.
14. **5 vueltas**: completar 5 vueltas y ver `You finished!`.
15. **Resultados**: esperar a que terminen todos y ver el podio y la cuenta
    atrás de 15 s.
16. **Retorno**: al terminar, aparecer en `(83.0, 0.05, -3.0)`, a pie.
17. **Sincronización**: en dos navegadores, ver los mismos coches, cajas,
    misiles y vueltas.
18. **Desconexión**: cerrar la pestaña de un piloto y comprobar que su coche
    desaparece y la carrera sigue.
19. **Sala vacía**: salir todos durante `playing`; la sala vuelve a `idle`.
20. **Regresión**: comprobar chat, checkpoints, rollos, `minigame-2` y los
    coches libres.

## 9. Riesgos y mitigaciones

| Riesgo                                                                 | Impacto | Mitigación                                                                                                                              |
| ---------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| La pista se mide mal y la parrilla o las puertas caen fuera del asfalto. | Alto    | `race:check` lee `map.glb` y falla si un punto sale del anillo o cae dentro de geometría vertical; validar con `?physics=1`.             |
| Un jugador corta por el pueblo y se salta checkpoints.                  | Alto    | Barrera interior solo para coches de carrera + validación de orden de puertas en el servidor + vuelta mínima de 10 s.                    |
| El coche se queda atascado o volcado.                                   | Alto    | `R` con enfriamiento de 2 s; respawn automático al caer o salir del anillo; respawn seguro si la puerta está ocupada.                    |
| Dos coches de carrera se atraviesan o explotan al chocar.               | Medio   | Grupos de colisión separados de los coches libres; chasis dinámico y ruedas con raycasts; daño limitado por evento.                      |
| El cliente reporta vueltas o posiciones falsas.                         | Alto    | El servidor calcula vueltas por intersección de segmentos, ignora saltos y limita velocidad/ritmo; el HUD muestra el valor del servidor. |
| La cuenta atrás de 30 s aburre con la sala llena.                       | Medio   | Recorte automático a 10 s al llegar a 6/6; se puede añadir botón “Ready” en una fase posterior.                                          |
| Los misiles, minas o cajas generan demasiado tráfico.                   | Bajo    | 12 cajas, ≤ 6 misiles y ≤ 6 minas; el estado se difunde a 10 Hz y solo a `lobby:minigame-3`.                                             |
| El jugador a pie colisiona con su propio coche o con la barrera.        | Medio   | El cuerpo del jugador se deshabilita mientras corre; la barrera solo colisiona con coches de carrera.                                    |
| El refactor de `CarPhysics` rompe `SPEC-014`.                            | Alto    | `VehiclePhysics` conserva la lógica exacta; probar entrar/salir, ruedas, daño, explosión y respawn de los coches libres.                 |
| La sala se queda con estado huérfano al desconectar.                     | Medio   | `onLeave` en `leave-lobby` y `close`; limpieza de misiles, cajas y pilotos; reset a `idle` si no queda nadie.                            |
| La cámara se queda mirando al coche tras salir.                         | Medio   | `race.exitRequest` teletransporta a `RACE_EXIT` y restaura el perfil exterior.                                                           |
| El HUD tapa el chat o los controles táctiles.                           | Bajo    | Overlays `pointer-events-none`, botones concretos con `pointer-events-auto` y ocultación del HUD de misiones mientras se corre.           |
| El backend se reinicia y se pierde la carrera.                          | Bajo    | Aceptado: estado en memoria; los jugadores vuelven a `global` al reconectar.                                                            |
| Los coches remotos dan saltos por paquetes de 10 Hz.                    | Medio   | Interpolación con búfer de 150 ms y `slerp` para la rotación.                                                                            |

## 10. Preguntas abiertas

- [x] ¿La dirección de carrera es +Z en la salida (θ creciente) o se prefiere
      la contraria? Se ha elegido +Z porque es la cara que muestra
      `TWN_Gantry_TextN` hacia la parrilla.

asi como esta bien

- [x] ¿“auto” significa auto-reparación (interpretación de este spec) o
      autopiloto? Si es autopiloto, se sustituye el efecto de §11.4 sin cambiar
      el resto del sistema.

  se autorepare osea por el poder

- [x] ¿La cuenta atrás debe empezar al primer jugador o solo cuando haya al
      menos 2? Se propone que empiece siempre a los 30 s, incluso en solitario.

  si con el primer jugador si no siempre va estar bloqueado el player

- [x] ¿Se permite entrar a mitad de carrera como piloto tardío o se rechaza con
      `RACE_IN_PROGRESS`? Se propone rechazar.

  no rechaza 

- [x] ¿Los 5 poderes son suficientes o se quiere añadir “turbo ilimitado”,
      “minas” o “rayo”?

    me gusta la mina y el rayo agregalos, solo que mira los poderes se ven feos el misil ni parece misil y no siquiera sigue la rayectoria de la pista se va derecho pero la pista es redonda checa el mapa

- [x] ¿El daño por choque debe desactivarse para que la carrera sea más limpia,
      o se mantiene como en `SPEC-014`?

    no asi dejalo si no los poderes no van afectar a los jugadores

- [x] ¿La salud debe regenerarse sola entre vueltas o solo con `repair`/`auto`?

  no solo con el auto repair poder pero si explota deberia de volver hacer el spawn con un nuevo coche donde exploto para seguir en la carrera 

- [x] ¿Se quiere un botón “Ready” para acortar la espera cuando ya están todos?

no asi dejalo pero dejalo para futuras feats

- [x] ¿Los coches libres de `SPEC-014` deben poder ver la carrera desde fuera
      o quedar completamente aislados?

  ailados cualquiera se podria meter a la carrera mientras hay una y esta mal no? osea lo ideal es que nadie pueda ver la carrera solo los que la estan jugando para asi evitar errores 

- [x] ¿Se quiere un minimapa o una flecha al siguiente checkpoint en una fase
      posterior?

  si me gusta

- [x] ¿El límite de 8 minutos es adecuado para 5 vueltas o se prefiere sin
      límite?

  si esta bien 

- [x] ¿Debe haber una vuelta de calentamiento o la salida es parada?

asi como esta esta bien

## 11. Decisiones y notas

### 11.1 Parrilla, puertas y cajas

**Parrilla** (6 huecos, `y = 1.1`, `yaw = -π/2`):

| Hueco | x    | y   | z     |
| ----- | ---- | --- | ----- |
| 0     | 89.5 | 1.1 | -4.5  |
| 1     | 93.5 | 1.1 | -4.5  |
| 2     | 97.5 | 1.1 | -4.5  |
| 3     | 89.5 | 1.1 | -11.0 |
| 4     | 93.5 | 1.1 | -11.0 |
| 5     | 97.5 | 1.1 | -11.0 |

**Puertas** (radio 93.0, centro `(0.1056, 0)`, `y` de detección ignorada):

| Puerta | Ángulo | x       | z       | Etiqueta                  |
| ------ | ------ | ------- | ------- | ------------------------- |
| 0      | 0°     | 93.11   | 0.00    | Meta / Salida (`TWN_Gantry`) |
| 1      | 45°    | 65.87   | 65.76   | Checkpoint 1              |
| 2      | 90°    | 0.11    | 93.00   | Checkpoint 2              |
| 3      | 135°   | -65.66  | 65.76   | Checkpoint 3              |
| 4      | 180°   | -92.89  | 0.00    | Checkpoint 4              |
| 5      | 225°   | -65.66  | -65.76  | Checkpoint 5              |
| 6      | 270°   | 0.11    | -93.00  | Checkpoint 6              |
| 7      | 315°   | 65.87   | -65.76  | Checkpoint 7              |

**Cajas de poderes** (`y = 1.2`, 12 cajas):

| Caja | Ángulo | Radio | x       | z       |
| ---- | ------ | ----- | ------- | ------- |
| 0    | 20°    | 90    | 84.68   | 30.78   |
| 1    | 50°    | 96    | 61.81   | 73.54   |
| 2    | 80°    | 90    | 15.73   | 88.63   |
| 3    | 110°   | 96    | -32.73  | 90.21   |
| 4    | 140°   | 90    | -68.84  | 57.85   |
| 5    | 170°   | 96    | -94.44  | 16.67   |
| 6    | 200°   | 90    | -84.47  | -30.78  |
| 7    | 230°   | 96    | -61.60  | -73.54  |
| 8    | 260°   | 90    | -15.52  | -88.63  |
| 9    | 290°   | 96    | 32.94   | -90.21  |
| 10   | 320°   | 90    | 69.05   | -57.85  |
| 11   | 350°   | 96    | 94.65   | -16.67  |

### 11.2 Constantes

| Constante              | Valor                          | Nota                                   |
| ---------------------- | ------------------------------ | -------------------------------------- |
| `TRACK_CENTER`         | `{ x: 0.1056, z: 0 }`          | Centro del anillo                      |
| `TRACK_INNER_RADIUS`   | 86.0                           | Borde interior del asfalto             |
| `TRACK_OUTER_RADIUS`   | 100.0                          | Borde exterior del asfalto             |
| `TRACK_SURFACE_Y`      | 0.02                           | Altura del asfalto                     |
| `TRACK_CENTER_RADIUS`  | 93.0                           | Radio de la trazada y las puertas      |
| `TOTAL_LAPS`           | 5                              | Vueltas por carrera                    |
| `RACE_MAX_PLAYERS`     | 6                              | Máximo de pilotos                      |
| `COUNTDOWN_MS`         | 30 000                         | Espera de jugadores                    |
| `COUNTDOWN_FULL_MS`    | 10 000                         | Recorte con 6/6                        |
| `RESULT_MS`            | 15 000                         | Pantalla de resultados                 |
| `RACE_MAX_MS`          | 480 000                        | Límite duro de carrera                 |
| `RESPAWN_MS`           | 3 000                          | Respawn tras destrucción               |
| `RESET_COOLDOWN_MS`    | 2 000                          | Enfriamiento del reset manual          |
| `MAX_SPEED`            | 55                             | Límite de validación (incluye nitro)   |
| `STATE_INTERVAL_MS`    | 100                            | 10 Hz                                  |
| `MIN_LAP_MS`           | 10 000                         | Vuelta mínima creíble                  |
| `MIN_GATE_MS`          | 500                            | Separación mínima entre puertas        |
| `GATE_INNER_RADIUS`    | 86.5                           | Inicio de la línea de puerta           |
| `GATE_OUTER_RADIUS`    | 99.5                           | Fin de la línea de puerta              |
| `ITEM_RESPAWN_MS`      | 5 000                          | Reaparición de caja                    |
| `ITEM_PICKUP_RADIUS`   | 3.5                            | Distancia del segmento al centro       |
| `MAX_HEALTH`           | 100                            | Salud máxima                           |
| `MISSILE_DAMAGE`       | 30                             | Daño del misil                         |
| `MISSILE_RANGE`        | 60                             | Alcance del objetivo                   |
| `MISSILE_FLIGHT_MS`    | 1 200                          | Vuelo del misil                        |
| `NITRO_MS`             | 3 000                          | Duración del nitro                     |
| `NITRO_ENGINE_FACTOR`  | 1.8                            | Multiplicador de fuerza                |
| `REPAIR_HP`            | 35                             | Curación instantánea                   |
| `AUTO_REPAIR_MS`       | 5 000                          | Duración de auto-reparación            |
| `AUTO_REPAIR_RATE`     | 10                             | HP por segundo                         |
| `SHIELD_MS`            | 4 000                          | Duración del escudo                    |
| `MINE_DAMAGE`          | 30                             | Daño de la mina                        |
| `MINE_RADIUS`          | 2.6                            | Radio de detonación                    |
| `MINE_ARM_MS`          | 1 000                          | Tiempo de armado                       |
| `MINE_LIFETIME_MS`     | 20 000                         | Vida de la mina                        |
| `MINE_MAX`             | 6                              | Minas simultáneas                      |
| `MINE_OFFSET`          | 2.2                            | Distancia detrás del coche             |
| `RAY_DAMAGE`           | 25                             | Daño del rayo                          |
| `RAY_RANGE`            | 60                             | Alcance del rayo                       |
| `RACE_EXIT`            | `{ x: 83.0, y: 0.05, z: -3.0 }` | Salida junto al gantry                 |
| `RACE_ENTRY_FALLBACK`  | `{ x: 93.5, y: 1.1, z: -4.5 }` | Hueco 1 si no hay snapshot             |

### 11.3 Tipos del protocolo

```ts
export type RacePhase = 'idle' | 'countdown' | 'playing' | 'results';
export type RacePower = 'nitro' | 'repair' | 'auto' | 'missile' | 'shield' | 'mine' | 'ray';
export type RaceStatus = 'grid' | 'racing' | 'destroyed' | 'finished' | 'left';

/**
 * Reporte que envía el piloto a 10 Hz. `speed` ya viene recortada a
 * MAX_SPEED (55) por el cliente, incluido durante el nitro.
 */
export type RaceCarStateReport = {
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
};

export type RacePlayerState = {
	id: string;
	name: string;
	model: 'coche_calabaza' | 'coche_momia' | 'coche_halloween';
	slot: number;
	status: RaceStatus;
	lap: number;
	gate: number;
	rank: number;
	health: number;
	maxHealth: number;
	item: RacePower | null;
	shieldUntil: number | null;
	nitroUntil: number | null;
	autoRepairUntil: number | null;
	finishAt: number | null;
	x: number;
	y: number;
	z: number;
	yaw: number;
	speed: number;
};

export type RaceItemState = {
	id: string;
	x: number;
	y: number;
	z: number;
	respawnAt: number | null;
};

export type RaceMissileState = {
	id: string;
	fromPlayerId: string;
	targetPlayerId: string | null;
	from: { x: number; y: number; z: number };
	to: { x: number; y: number; z: number };
	firedAt: number;
	hitAt: number;
};

export type RaceMineState = {
	id: string;
	ownerId: string;
	x: number;
	y: number;
	z: number;
	placedAt: number;
	armedAt: number;
	expiresAt: number;
};

export type RaceSnapshot = {
	phase: RacePhase;
	endsAt: number | null;
	startedAt: number | null;
	serverTime: number;
	totalLaps: number;
	raceMaxMs: number;
	winnerId: string | null;
	players: RacePlayerState[];
	items: RaceItemState[];
	missiles: RaceMissileState[];
	mines: RaceMineState[];
};

export type RacePosition = {
	id: string;
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
	health: number;
	lap: number;
	gate: number;
	status: RaceStatus;
};

export type RaceEventKind =
	| 'player-joined'
	| 'player-left'
	| 'countdown-shortened'
	| 'race-start'
	| 'gate-passed'
	| 'lap-completed'
	| 'player-finished'
	| 'item-picked'
	| 'item-used'
	| 'missile-fired'
	| 'missile-hit'
	| 'mine-placed'
	| 'mine-hit'
	| 'ray-fired'
	| 'player-destroyed'
	| 'player-respawned'
	| 'race-ended';

export type RaceEvent = {
	kind: RaceEventKind;
	playerId?: string;
	otherId?: string;
	gate?: number;
	lap?: number;
	itemId?: string;
	power?: RacePower;
	missileId?: string;
	mineId?: string;
	amount?: number;
	from?: { x: number; y: number; z: number };
	to?: { x: number; y: number; z: number };
	at: number;
};
```

### 11.4 Poderes

| Poder     | Peso | Efecto                                                        |
| --------- | ---- | ------------------------------------------------------------- |
| `nitro`   | 25   | 3 s de ×1.8 de motor y hasta 55 m/s                           |
| `missile` | 20   | 30 de daño al piloto de delante a ≤ 60 m; arco de pista, 1.2 s|
| `mine`    | 15   | Mina detrás del coche, 30 de daño, arma a 1 s y dura 20 s     |
| `repair`  | 15   | +35 de salud instantáneos                                     |
| `ray`     | 10   | 25 de daño instantáneo al piloto de delante a ≤ 60 m          |
| `auto`    | 10   | +10 HP/s durante 5 s                                          |
| `shield`  | 5    | 4 s de inmunidad total a daño                                 |

### 11.5 Grupos de colisión

| Grupo         | Máscara      | Miembros     | Colisiona con                          |
| ------------- | ------------ | ------------ | -------------------------------------- |
| `GROUP_DEFAULT` | `0x0001`   | mapa, jugadores, edificios | todo                     |
| `GROUP_FREECAR` | `0x0002`   | coches de `SPEC-014` | mapa, jugadores, coches libres |
| `GROUP_RACECAR` | `0x0004`   | coches de carrera | mapa, jugadores, barrera y otros coches de carrera |
| `GROUP_RACEGUARD` | `0x0008` | barrera interior | solo coches de carrera             |

- Coche libre: `memberships = GROUP_FREECAR`, `filter = GROUP_DEFAULT | GROUP_FREECAR`.
- Coche de carrera: `memberships = GROUP_RACECAR`, `filter = GROUP_DEFAULT | GROUP_RACECAR | GROUP_RACEGUARD`.
- Barrera: `memberships = GROUP_RACEGUARD`, `filter = GROUP_RACECAR`.
- Los colliders del mapa tienen `memberships = ALL`, por lo que ambos tipos de coche chocan con el mapa.

### Notas de diseño

- **La carrera vive en `minigame-3` y en el mapa exterior.** No hay escena
  nueva: el circuito es parte de `map.glb`. Por eso `sceneState.active` sigue
  siendo `map` y `inRace` se deriva del lobby, no de la escena.
- **El servidor decide vueltas y checkpoints.** Las puertas son visuales; el
  progreso se calcula con los reportes de posición del piloto. Esto evita que un
  cliente modifique su HUD para “ganar”.
- **Parrilla aleatoria, modelos aleatorios.** El hueco y el modelo se sortean al
  entrar. El jugador no puede elegir coche en esta versión y se permite que dos
  pilotos lleven el mismo modelo: solo hay tres GLB y hasta seis pilotos.
- **Poderes clásicos de kart.** Un solo poder en mano, cajas compartidas con
  respawn de 5 s y efecto inmediato al pulsar `Q`. Se añadieron `mine` y `ray`
  a los cinco originales.
- **Misiles sobre la pista.** El proyectil interpola el ángulo alrededor del
  centro del anillo, no una recta entre origen y objetivo, para que la curva
  visible coincida con `TWN_Track`.
- **Respawn tras destrucción en el punto de la explosión.** Si el coche
  explotó sobre el asfalto reaparece allí; si cayó fuera del anillo o el punto
  no es válido, usa la última puerta. El reset manual (`R`) siempre usa la
  última puerta.
- **“auto” = auto-reparación.** Se interpreta así porque el usuario escribió
  “nitro repar auto misil”. Si quería autopiloto, se cambia el efecto sin tocar
  el resto del sistema.
- **La barrera interior es invisible y solo afecta a coches de carrera.** El
  pueblo sigue siendo transitable a pie y los coches libres no se ven afectados.
- **Refactor de física controlado.** `VehiclePhysics` se extrae de
  `CarPhysics.svelte` conservando la lógica exacta; `SPEC-014` debe seguir
  pasando sus pruebas.
- **Sin dependencias nuevas.** Todo se construye con Three, Threlte, Rapier,
  Svelte y Zod ya instalados; los tres GLB de coche ya están precargados en
  `gameAssets.svelte.ts`.
- **Estado en memoria.** Igual que `minigame-2` y los coches libres, la carrera
  se pierde si el backend se reinicia.
- **Recompensa: `vampire`.** Ganar el Gran Premio es la única condición de la
  misión `race-5-laps`; las carreras del roadmap no la completan. El desbloqueo
  se guarda en el perfil local y no se equipa solo, igual que `cats-25` y
  `crypt-5-skulls`.

## 12. Progreso

| Fecha      | Estado      | Nota                                                                 |
| ---------- | ----------- | -------------------------------------------------------------------- |
| 2026-11-02 | borrador    | Spec creado con pista medida, parrilla, puertas, cajas y poderes.    |
| 2026-11-02 | en-progreso | Implementación base completa; añadidas minas, rayos, misil curvo y respawn en el punto de explosión. `race:check`, `tsc`, `svelte-check` y `build` pasan. |
| 2026-11-05 | en-progreso | Recompensa añadida: ganar `grand-prix` registra `race-5-laps` y desbloquea la skin `vampire`. |
| 2026-11-11 | en-progreso | HUD: reloj de carrera visible (`raceMaxMs` / `endsAt`) con tiempo restante en `m:ss`, límite de 8 min y aviso en rojo en los últimos 30 s. |

## 13. Changelog

- 2026-11-11 — Cuenta atrás de espera reducida de 60 s a 30 s para unificar
  todos los minijuegos. La duración de la carrera (5 vueltas o 480 s) no cambia.
- 2026-11-02 — Creación del spec.
- 2026-11-02 — Correcciones de coherencia: `RACE_EXIT.y = 0.05`, cruce de
  puertas solo en sentido de carrera, `RaceCarStateReport`, recorte de
  velocidad a 55, modelos repetidos y salida al detectar el cambio de presencia.
- 2026-11-02 — Respuestas del usuario: se mantiene +Z, `auto` es
  auto-reparación, la cuenta atrás empieza con el primer piloto, se rechaza la
  entrada tardía, el daño por choque se mantiene, el respawn tras destrucción
  ocurre donde explotó el coche y la carrera solo la ven sus participantes.
- 2026-11-02 — Añadidos los poderes `mine` y `ray`, misil con trayectoria curva
  sobre `TWN_Track`, minas y rayos visuales, y aspecto mejorado de cajas y
  proyectiles. Pesos actualizados: `nitro 25`, `missile 20`, `mine 15`,
  `repair 15`, `ray 10`, `auto 10`, `shield 5`.
- 2026-11-02 — Corregido el escudo: ahora se renderiza dentro del `RigidBody`
  del coche (prop `shielded` de `VehiclePhysics`), por lo que queda pegado al
  vehículo y lo sigue sin depender de las posiciones del servidor.
- 2026-11-05 — Recompensa de misión: ganar el Gran Premio (`grand-prix`)
  registra `race-5-laps` en `rw:missions:v1` y desbloquea `vampire`
  (`Vampire.glb`). Las carreras del roadmap y las derrotas no dan la skin.
- 2026-11-11 — `RaceHud` muestra el tiempo que puede durar la carrera: usa
  `raceMaxMs` (8 min) antes de salir y `endsAt` durante `playing`, con formato
  `m:ss`, etiqueta `Time left` y color rojo en los últimos 30 s. Se conserva el
  tiempo transcurrido como `Elapsed`.
- 2026-11-11 — Resultados rediseñados con el lenguaje visual del resto de
  minijuegos: tarjeta `#171020`, borde rosa, trofeo, clasificación compacta en
  filas con medallas y botón con la cuenta atrás de salida integrada. Se elimina
  el podio de bloques amarillos.
