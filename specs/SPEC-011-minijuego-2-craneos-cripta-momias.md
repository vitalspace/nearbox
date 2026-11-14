---
id: SPEC-011
titulo: "Minijuego 2: 10 cráneos y momias para la tumba principal de la cripta"
estado: en-progreso
prioridad: alta
creado: 2026-10-31
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
    gltf,
    cripta,
    craneos,
    momias,
    mausoleo,
    temporizador,
    servidor-autoritativo,
  ]
depende_de: [SPEC-002, SPEC-003, SPEC-005, SPEC-009, SPEC-010]
bloquea: []
estimacion: "34h"
---

# SPEC-011 — Minijuego 2: 10 cráneos y momias para la tumba principal de la cripta

## 1. Contexto

`SPEC-005` dejó tres checkpoints físicos para entrar y salir de
`minigame-1`, `minigame-2` y `minigame-3`. `SPEC-009` montó el mapa exterior
(`map.glb`) con físicas selectivas, el controlador cinemático y la
reaparición. `SPEC-010` define el primer minijuego real: una casa de cinco
plantas, cinco llaves y cinco brujas.

Este spec define el **segundo** minijuego usando un escenario distinto ya
aportado por el usuario: `frontend/static/game2.glb`, la cripta subterránea
que queda debajo del cementerio maldito del mapa exterior. La experiencia es
la misma familia que `SPEC-010`, pero cambia el objetivo y los enemigos:

- Ya no se recogen llaves, sino **10 cráneos**, dos por zona de la cripta.
- Ya no se escapa por una puerta, sino que los cráneos se depositan en la
  **tumba principal** (`A4C_Tombs`), en el centro de la sala.
- Los enemigos ya no son brujas, sino **momias** que patrullan cada zona: el
  contacto drena salud y los **rollos de papel** las aturden unos segundos.

La cripta de `game2.glb` está modelada justo debajo del cementerio:
`CursedCemetery` del mapa exterior está en `(33.05, 0.40, 33.05)` y la cripta
ocupa `x ∈ [-0.05, 61.20]`, `z ∈ [14.15, 65.55]`, `y ∈ [-8.45, 0.30]`. El
acceso natural es el mausoleo del mapa: el usuario ha pedido que el
checkpoint del minijuego esté **delante de `CCC_Mausoleum`**.

`CCC_Mausoleum` existe en `map.glb` (no en `game2.glb`) y ya tiene colisión
desde `SPEC-009`. Sus medidas en coordenadas de mundo son:

| Dato                             | Valor                                                                       |
| -------------------------------- | --------------------------------------------------------------------------- |
| BBox de `CCC_Mausoleum`          | `x ∈ [18.88, 24.08]`, `y ∈ [0.40, 5.10]`, `z ∈ [36.34, 41.39]`              |
| Hoja de la puerta (local)        | `x ∈ [-11, -9]`, `y ∈ [0.30, 2.80]`, `z ≈ 4.28`                             |
| Hoja de la puerta (mundo)        | `x ∈ [20.48, 22.48]`, `z ≈ 37.28–37.38`                                     |
| Fachada                          | Mira hacia `-Z` (sur); el escalón del porche está en `z ≈ 36.34–37.0`       |
| Punto libre delante del mausoleo | `(21.48, 0.40, 35.50)` (suelo `y = 0.40`, sin lápidas; centro de la puerta) |

`game2.glb` se midió al redactar este spec:

| Dato                | Valor                                                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Tamaño              | 1 386 524 bytes (~1.32 MB)                                                                                                 |
| SHA-256             | `2b20d7dd922e0930184e479b7434c9a0beebe278897737497f55c8e2bec53371`                                                         |
| Nodos               | 28 (22 con malla, 6 vacíos)                                                                                                |
| Mallas              | 22                                                                                                                         |
| Primitivas          | 82                                                                                                                         |
| Triángulos totales  | 26 522                                                                                                                     |
| Materiales          | 14                                                                                                                         |
| Animaciones         | 0                                                                                                                          |
| Texturas / imágenes | 0 / 0                                                                                                                      |
| Raíces de escena    | 27 (los 22 nodos con malla + `A4C_Chambers.001`, `A4C_Gallery`, `TREE_Bats`, `BigTree`, `CursedCemetery`, `DraculaCastle`) |
| Nodos vacíos        | `A4C_Chambers.001`, `A4C_Gallery`, `TREE_Bats`, `BigTree`, `CursedCemetery`, `DraculaCastle`                               |
| BBox total          | `x ∈ [-0.05, 61.20]`, `y ∈ [-8.45, 0.30]`, `z ∈ [14.15, 65.55]`                                                            |
| Superficie jugable  | `y ≈ -7.98` (criptas y sala) y `y ≈ -7.52` (plataforma de la tumba)                                                        |
| Luces embebidas     | 0                                                                                                                          |

La cripta tiene cuatro cámaras independientes (`a_Crypt`, `b_Crypt`,
`c_Crypt`, `d_Crypt`) conectadas por túneles (`A4C_Tunnels`) y una sala
central (`A4C_Hall`) con una pared de nichos (`A4C_Chambers`), una galería
(`A4C_Gallery.001`), una escalera de superficie (`A4C_Stairwell`) y la tumba
principal (`A4C_Tombs`). Es un escenario natural para un cooperativo de
"recoger y llevar al centro", con las momias como presión constante.

La escena actual (`frontend/src/lib/Scene.svelte`) solo monta `Map`,
`Checkpoints`, `Sky`, `Lighting`, `Player` y la cámara. No existe ninguna
rama para `minigame-2`, no hay estado de partida y la cámara actual usa un
radio de 12 m (`ThirdPersonCamera.svelte`), demasiado grande para una cripta
cerrada de 6 m de altura. Este spec también corrige ese último punto para la
cripta.

## 2. Objetivo

Convertir `minigame-2` en una partida cooperativa para grupos de hasta 8
jugadores dentro de `game2.glb`: al menos un jugador dentro inicia un conteo
de 30 s; después el equipo dispone de 300 s para recoger exactamente 10
cráneos —dos por zona— y depositarlos en la tumba principal, esquivando una
momia por zona. Las momias ya no matan al instante: cada contacto resta salud,
la salud se regenera tras unos segundos y los rollos de papel aturden a la
momia. Todo el estado lo autoriza el servidor y se sincroniza por WebSocket,
con cámara en primera persona colocada justo delante de la cabeza para que la
vista no quede dentro del modelo. El checkpoint de entrada se coloca delante de
`CCC_Mausoleum`.

## 3. Alcance

**Incluye**

- Montar `game2.glb` como escena jugable de `minigame-2`, con iluminación
  propia y cambio de escena al entrar/salir.
- Mover el checkpoint de `minigame-2` a `(21.48, 0.40, 35.50)`, delante de
  `CCC_Mausoleum`, sin tocar la geometría del mausoleo.
- Física Rapier selectiva de la cripta mediante lista blanca versionada.
- Entrada por el checkpoint existente y por el botón de `LobbyOverlay`.
- Máquina de estados de sala: `idle → countdown → playing → won/lost → idle`.
- Conteo de 30 s que bloquea el movimiento hasta `playing`.
- Ronda de 300 s con derrota global al agotarse.
- Exactamente 10 cráneos fijos, dos por zona: cripta oeste, cripta sur,
  cripta este, cripta norte y nichos del norte.
- Recogida automática, transporte por jugador y depósito en la tumba
  principal.
- Contador por jugador y contador de equipo en el HUD.
- Salud de 100 puntos: el contacto con una momia resta 25 con una ventana de
  invulnerabilidad de 1 s y la salud se regenera a 8 HP/s tras 6 s sin daño.
  La muerte solo ocurre al llegar a 0 HP.
- 5 momias, una por zona, con patrulla, persecución, daño por contacto, aturdido
  por rollos de papel y retorno al lobby global al morir el jugador.
- Rollo de papel: al impactar en una momia la deja aturdida 5 s, sin perseguir
  ni dañar, con la animación de daño `MU_hit` seguida de `MU_injured`.
- Autoridad del servidor sobre fases, tiempos, cráneos, depósitos, muertes y
  momias; el cliente solo reporta su posición.
- Sincronización de estado, posiciones y eventos por WebSocket a todos los
  jugadores del lobby.
- Sincronización visual de jugadores remotos y momias con interpolación.
- Retorno al mundo exterior en la puerta del mausoleo al terminar o salir.
- Cámara en primera persona dentro de la cripta: el objetivo de la vista se
  adelanta ligeramente respecto a la cabeza, con corrección por raycast para no
  atravesar muros.
- Manejo de jugadores que se van, se desconectan, mueren o entran a mitad de
  ronda.
- Verificación de tipos, lint, build y lista blanca de colisiones.

**No incluye**

- Modelar, animar o reexportar la cripta, las momias o los personajes.
- Abrir físicamente la puerta de `CCC_Mausoleum`; la entrada sigue siendo el
  sensor del checkpoint.
- Físicas dinámicas para ataúdes, velas, huesos o escombros (nada se empuja
  ni se cae).
- Navmesh o pathfinding: las momias patrullan waypoints y persiguen dentro de
  una zona rectangular.
- Inventario, objetos consumibles o combate cuerpo a cuerpo. Los rollos de
  papel existentes solo aturden; no hay armas nuevas.
- Cambiar `map.glb`, sus colisiones o la posición de los otros checkpoints.
- Varias salas simultáneas de `minigame-2`: hay una sola instancia por lobby.
- Persistencia de partidas si el backend se reinicia.
- Anti-cheat fuerte. El servidor valida rangos y ritmo, pero confía en la
  posición reportada para movimiento, recogida y depósito.
- Chat específico de la partida (se sigue usando el chat global de
  `SPEC-004`).
- Cambios en `minigame-1` más allá de la integración mínima de escena y
  cámara compartida.
- Un minimapa, brújula o marcador de objetivo a distancia.

## 4. Requisitos

### Funcionales

| ID    | Requisito                                                                                                                                                                                                                                                                                                                                                                     | Prioridad |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| RF-1  | `frontend/static/game2.glb` se sirve como `/game2.glb` y `Crypt.svelte` se genera con `@threlte/gltf` conservando nombres y jerarquía de mallas.                                                                                                                                                                                                                              | alta      |
| RF-2  | `Scene.svelte` monta la cripta y oculta el mapa exterior, los checkpoints y `Sky` cuando el jugador está en `minigame-2`; al salir restaura exactamente la escena exterior.                                                                                                                                                                                                   | alta      |
| RF-3  | La cripta tiene iluminación propia (hemisférica tenue, una luz por cámara, una luz central y una luz cálida en la tumba); el GLB no trae luces.                                                                                                                                                                                                                               | alta      |
| RF-4  | Solo los nodos de `crypt-colliders.json` reciben colisionador. El resto no crea cuerpo ni collider.                                                                                                                                                                                                                                                                           | alta      |
| RF-5  | Tienen colisión los 16 nodos de la lista blanca de §11.2: arquitectura, suelos, túneles, escalera, criptas, nichos, galería, props de piedra, tumbas y las cinco piezas pequeñas de hierro.                                                                                                                                                                                   | alta      |
| RF-6  | No tienen colisión `A4C_Bones`, `A4C_Bones.001`, `A4C_Candles`, `A4C_Candles.001`, `A4C_Candles.002` ni el `A4C_Ironwork` grande (decoración, llamas, huesos sueltos y candelabros).                                                                                                                                                                                          | alta      |
| RF-7  | La creación de colliders de la cripta no supera 25 000 triángulos y tarda menos de 500 ms en un portátil de gama media.                                                                                                                                                                                                                                                       | alta      |
| RF-8  | El checkpoint de `minigame-2` queda en `(21.48, 0.40, 35.50)`, delante de `CCC_Mausoleum`, con radio 2.0, nombre “Cripta del Mausoleo” y color ámbar.                                                                                                                                                                                                                         | alta      |
| RF-9  | El checkpoint se apoya sobre el suelo real (mundo `y = 0.40`; en `CHECKPOINTS` se guarda `y = 0.3` porque el grupo suma `0.1`) y su sensor cubre al jugador de pies a cabeza; la geometría del mausoleo sigue teniendo colisión y no se modifica.                                                                                                                             | alta      |
| RF-10 | Al entrar en `minigame-2` con la sala en `idle`, el servidor inicia `countdown` de 30 000 ms.                                                                                                                                                                                                                                                                                 | alta      |
| RF-11 | Durante `countdown` los jugadores aparecen en el centro de la nave, frente al sepulcro `(36.7, -7.98, 45.0)`, pueden mirar y usar el chat, pero no desplazarse, saltar ni ser matados.                                                                                                                                                                                        | alta      |
| RF-12 | Al terminar el conteo, la sala pasa a `playing`, se colocan los 10 cráneos y las 5 momias, y el movimiento se desbloquea para todos.                                                                                                                                                                                                                                          | alta      |
| RF-13 | `playing` dura exactamente 300 000 ms desde su inicio; el HUD muestra el tiempo restante con formato `m:ss`.                                                                                                                                                                                                                                                                  | alta      |
| RF-14 | Hay exactamente 10 cráneos, dos por zona, en las posiciones de §11.4. No hay cráneos extra ni aleatorios.                                                                                                                                                                                                                                                                     | alta      |
| RF-15 | Un cráneo se recoge automáticamente cuando un jugador vivo está a ≤ 1.5 m de él (distancia 3D al pecho) y no está depositado ni en cooldown.                                                                                                                                                                                                                                  | alta      |
| RF-16 | Cualquier jugador puede llevar varios cráneos; no hay límite de carga.                                                                                                                                                                                                                                                                                                        | alta      |
| RF-17 | Un jugador deposita todos sus cráneos al pulsar `E` a ≤ 2.5 m horizontales de `(36.68, -7.52, 40.30)` y con diferencia vertical ≤ 2.0 m.                                                                                                                                                                                                                                      | alta      |
| RF-18 | El equipo gana en cuanto `depositedTotal === 10`, sin importar quién depositó el último.                                                                                                                                                                                                                                                                                      | alta      |
| RF-19 | Si el temporizador llega a 0 con menos de 10 cráneos depositados, el equipo pierde.                                                                                                                                                                                                                                                                                           | alta      |
| RF-20 | Al ganar o perder, la sala pasa a `won`/`lost` durante 8 000 ms, muestra el resultado y devuelve a todos a `global`.                                                                                                                                                                                                                                                          | alta      |
| RF-21 | Hay una momia por zona, con patrulla entre waypoints, persecución a ≤ 9 m, velocidad de patrulla 1.2 m/s y de persecución 2.4 m/s, y radio de daño por contacto 1.1 m.                                                                                                                                                                                                        | alta      |
| RF-22 | Una momia solo persigue y daña dentro de su zona rectangular y con diferencia vertical ≤ 1.5 m. El contacto resta 25 HP con una ventana de invulnerabilidad de 1 s; no mata al instante.                                                                                                                                                                                      | alta      |
| RF-23 | Mientras un jugador siga vivo tras un golpe, su salud se regenera a 8 HP/s tras 6 s sin recibir daño. Al llegar a 0 HP suelta todos sus cráneos, queda en estado `dead` 2 500 ms y luego es devuelto a `global`.                                                                                                                                                              | alta      |
| RF-24 | Los cráneos soltados quedan bloqueados 2 000 ms antes de poder recogerse de nuevo.                                                                                                                                                                                                                                                                                            | alta      |
| RF-25 | Si un jugador sale del lobby, se desconecta o cierra la pestaña, suelta sus cráneos igual que al morir y el resto de la sala sigue.                                                                                                                                                                                                                                           | alta      |
| RF-26 | Si no queda ningún jugador en `minigame-2` durante `countdown`, `playing`, `won` o `lost`, la sala vuelve a `idle` y se limpian cráneos, momias y temporizadores.                                                                                                                                                                                                             | alta      |
| RF-27 | Se puede entrar a mitad de `countdown` o `playing`: el jugador aparece en el descanso inferior de la escalera con 0 cráneos y sin reiniciar la ronda.                                                                                                                                                                                                                         | media     |
| RF-28 | El HUD muestra: fase, tiempo restante, salud `hp/maxHp`, cráneos del equipo `n/10`, cráneos transportados por el jugador y tabla de jugadores con `transportados` y `depositados`.                                                                                                                                                                                            | alta      |
| RF-29 | El servidor emite `mg2-state` completo al entrar, al cambiar de fase, al cambiar cráneos/depósitos y cada 1 000 ms; emite `mg2-positions` a 10 Hz; emite `mg2-event` por cada evento relevante.                                                                                                                                                                               | alta      |
| RF-30 | El cliente envía `mg2-position` como máximo a 10 Hz mientras está en `minigame-2` y solo con números finitos.                                                                                                                                                                                                                                                                 | alta      |
| RF-31 | El servidor rechaza posiciones no finitas, las acota al volumen de la cripta (`x,z ∈ [-2, 64]`, `y ∈ [-10, 1]`) y limita el ritmo a 15 mensajes/s por jugador.                                                                                                                                                                                                                | alta      |
| RF-32 | Los jugadores remotos y las momias se interpolan con un búfer de 150 ms; no se teletransportan entre paquetes.                                                                                                                                                                                                                                                                | media     |
| RF-33 | Dentro de la cripta la cámara usa primera persona (radio 0.2 m) con el objetivo adelantado 0.7 m respecto a los ojos, lo que deja la cámara ~0.5 m por delante de la cabeza, sin suavizado de posición (el objetivo copia la posición del cuerpo cada frame) para que el avatar no se adelante al caminar, y un raycast hacia delante que reduce ese adelanto si hay un muro. | alta      |
| RF-34 | La cámara exterior conserva exactamente su comportamiento actual (radio 12, mínimo 6, máximo 24).                                                                                                                                                                                                                                                                             | alta      |
| RF-35 | Al salir de `minigame-2` a `global`, el jugador aparece delante de `CCC_Mausoleum` en `(21.48, 0.40, 35.50)`, no en el spawn global `(0, 0.4, 12)`.                                                                                                                                                                                                                           | alta      |
| RF-36 | Al cambiar de lobby se limpia `checkpoints.activeCheckpointId`, para que el aviso de entrada no quede pegado dentro de la cripta.                                                                                                                                                                                                                                             | media     |
| RF-37 | El aviso de depósito incluye botón táctil `E` y funciona sin teclado.                                                                                                                                                                                                                                                                                                         | media     |
| RF-38 | `?physics=1` muestra también los colliders de la cripta cuando la escena activa es `minigame-2`.                                                                                                                                                                                                                                                                              | media     |
| RF-39 | `bun run crypt:check` valida nombres, exclusiones y presupuesto de triángulos de la cripta contra el GLB.                                                                                                                                                                                                                                                                     | media     |
| RF-40 | Regenerar `Crypt.svelte` con `crypt:build` vuelve a inyectar los colliders; no se edita a mano.                                                                                                                                                                                                                                                                               | media     |
| RF-41 | Al observar la fase `won`, el cliente registra localmente `crypt-5-skulls` en `rw:missions:v1` y desbloquea la skin `mummy`; reiniciar la misión de gatos no la bloquea y no se equipa automáticamente.                                                                                                                                                                       | media     |
| RF-42 | `game2.glb` no se precarga al arrancar: se descarga y parsea al montar la escena de la cripta. Mientras el GLTF y sus colliders no están listos, el jugador permanece congelado y se muestra una pantalla de entrada; al salir se liberan los colliders.                                                                                                                      | media     |
| RF-43 | El rollo de papel que impacta en una momia envía `mg2-stun` al servidor; este valida fase `playing`, jugador vivo, momia existente, distancia horizontal ≤ 15 m y ritmo de 300 ms, y la deja `stunned` 5 000 ms.                                                                                                                                                              | alta      |
| RF-44 | Una momia `stunned` no persigue ni daña, se detiene y vuelve a `patrol` al vencer el aturdido. El cliente reproduce `MU_hit` durante el primer tramo y luego mantiene `MU_injured` en bucle.                                                                                                                                                                                  | alta      |
| RF-45 | En primera persona el avatar gira con el ratón: `facingYaw` sigue el yaw de la cámara (`θ + π`) cada frame y se publica en `mg2-position`, de modo que los demás jugadores ven al avatar mirar hacia donde mira la vista. La cámara conserva el pointer lock y el arrastre tal como estaban.                                                                                  | alta      |
| RF-46 | En tercera persona la cámara sigue girando con el ratón (pointer lock y arrastre, sin cambios) y el jugador se orienta con `A`/`D` al moverse, como antes. Los minijuegos de combate y la conducción no cambian.                                                                                                                                                              | alta      |

### No funcionales

| ID     | Requisito               | Criterio                                                                                                            |
| ------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| RNF-1  | Presupuesto de colisión | ≤ 25 000 triángulos de collider; la lista propuesta suma 21 820.                                                    |
| RNF-2  | Carga de la cripta      | GLB descargado una sola vez; colliders listos en < 500 ms tras el primer montaje.                                   |
| RNF-3  | Rendimiento             | 60 fps con 8 jugadores, 5 momias y la cripta completa en un portátil de gama media.                                 |
| RNF-4  | Latencia percibida      | Las posiciones remotas se ven con ≤ 250 ms de retraso visual gracias a la interpolación.                            |
| RNF-5  | Tráfico                 | `mg2-positions` ≤ 4 KB por tick para 8 jugadores; estado completo ≤ 8 KB.                                           |
| RNF-6  | Determinismo            | Mismas posiciones iniciales de cráneos y momias en cada ronda.                                                      |
| RNF-7  | Autoridad               | El cliente nunca decide recogidas, depósitos, muertes, fases ni tiempos.                                            |
| RNF-8  | Tipado                  | `bun run check` y `bunx tsc --noEmit` pasan sin errores.                                                            |
| RNF-9  | Formato                 | `bun run lint` pasa en los archivos nuevos y modificados.                                                           |
| RNF-10 | SSR seguro              | Todo el código de Rapier/GLTF vive dentro de `<Canvas>` o de un `$effect`; nada toca `window` en SSR.               |
| RNF-11 | Aislamiento             | El estado de `minigame-2` no altera `minigame-1`, `minigame-3`, el chat ni la presencia global.                     |
| RNF-12 | Recuperación            | Un error del servidor de sala no tumba el WebSocket: se emite `error` y la sala se reinicia a `idle`.               |
| RNF-13 | Accesibilidad           | El HUD no bloquea el chat ni los controles táctiles; el aviso de depósito también funciona con el botón táctil `E`. |
| RNF-14 | Sin dependencias nuevas | Solo `@threlte/*`, `three`, Rapier, Svelte, Tailwind y Zod ya instalados.                                           |
| RNF-15 | Integración             | El cambio de escena y el perfil de cámara no rompen `SPEC-010` ni el mundo exterior.                                |

## 5. Criterios de aceptación

- [x] CA-1: `game2.glb` existe, `Crypt.svelte` se genera con `crypt:build` y su cabecera apunta a `/game2.glb`. Verificado: SHA-256 `2b20d7dd…`, 1 386 524 bytes y cabecera con `/game2.glb`.
- [ ] CA-2: Al entrar en `minigame-2`, desaparecen el mapa exterior, los checkpoints y el cielo; aparece la cripta con iluminación propia.
- [ ] CA-3: Al salir a `global`, el mapa exterior vuelve exactamente a su estado anterior.
- [x] CA-4: `bun run crypt:check` informa ≤ 25 000 triángulos, sin nombres desconocidos y con las exclusiones aplicadas (la exclusión gana sobre la inclusión). Verificado: 21 820 / 25 000, 16 colliders, 6 nodos excluidos.
- [ ] CA-5: Con `?physics=1` se ven los colliders de la cripta y no los del mapa exterior.
- [ ] CA-6: El jugador recorre las cuatro criptas y la sala central sin atravesar suelos, muros, túneles, escalera, nichos ni la tumba principal.
- [ ] CA-7: El checkpoint de `minigame-2` está delante de `CCC_Mausoleum`, se apoya en el suelo (mundo `y = 0.40`) y muestra “Cripta del Mausoleo” al acercarse.
- [ ] CA-8: El primer jugador que entra inicia un conteo visible de 30 s; durante el conteo nadie se mueve.
- [ ] CA-9: Al terminar el conteo, el movimiento se desbloquea para todos y aparecen los 10 cráneos y las 5 momias.
- [ ] CA-10: El HUD muestra el tiempo restante y baja de `5:00` a `0:00` en 300 s.
- [ ] CA-11: Hay exactamente 10 cráneos, dos por zona, y cada uno está en su coordenada de la tabla.
- [ ] CA-12: Acercarse a un cráneo lo recoge automáticamente y el contador del jugador sube.
- [ ] CA-13: `E` cerca de la tumba principal deposita todos los cráneos transportados y el contador de equipo sube.
- [ ] CA-14: Al depositar el décimo cráneo, todos ven “El ritual se ha completado” y vuelven a `global` tras 8 s.
- [ ] CA-15: Al agotarse el tiempo con menos de 10 cráneos, todos ven “Las momias os han atrapado” y vuelven a `global`.
- [ ] CA-16: Una momia patrulla su zona, detecta a un jugador a ≤ 9 m, lo persigue y al tocarlo le resta 25 HP.
- [ ] CA-17: Recibir cuatro toques (o uno con la salud ya baja) deja al jugador a 0 HP; entonces suelta los cráneos, el aviso dura 2.5 s y vuelve a `global`.
- [ ] CA-18: Tras 6 s sin daño, la salud sube a 8 HP/s hasta el máximo de 100.
- [ ] CA-19: Si el jugador que muere llevaba cráneos, el equipo puede recuperarlos; si se desconecta, ocurre lo mismo.
- [ ] CA-20: Un segundo jugador que entra a mitad de ronda aparece en el descanso de la escalera, no reinicia el conteo y ve el estado actual.
- [ ] CA-21: Si todos salen durante la partida, la sala vuelve a `idle`; al volver a entrar empieza un conteo nuevo.
- [ ] CA-22: La tabla del HUD muestra, por jugador, cráneos transportados y depositados, actualizada en ≤ 1 s.
- [ ] CA-23: Dos navegadores ven los mismos cráneos, momias, tiempos y contadores.
- [ ] CA-24: Los jugadores remotos y las momias se mueven de forma fluida, sin saltos visibles entre paquetes.
- [ ] CA-25: Dentro de la cripta la cámara es en primera persona, la vista sale delante de la cabeza y no atraviesa muros; fuera conserva el comportamiento actual.
- [ ] CA-26: Al salir de `minigame-2`, el jugador aparece delante de `CCC_Mausoleum` en `(21.48, 0.40, 35.50)`.
- [x] CA-27: `bun run crypt:check`, `bun run check`, `bun run lint`, `bun run build` y `bunx tsc --noEmit` pasan. Verificado el 2026-10-31: 0 errores/avisos, formato correcto y build de producción completado.
- [ ] CA-28: Regenerar `Crypt.svelte` y recargar no duplica colliders ni rompe la escena.
- [ ] CA-29: Un rollo de papel que impacta en una momia la deja aturdida 5 s, sin perseguir ni dañar, con `MU_hit`/`MU_injured`; después vuelve a patrullar.
- [ ] CA-30: El HUD muestra la barra de salud y el contador de equipo usa `/10`.
- [ ] CA-31: Los cráneos soltados no se pueden recoger hasta pasados 2 s.
- [ ] CA-32: En la cripta, mirar con el ratón gira la cámara y también el avatar; los demás jugadores ven al personaje orientarse hacia donde mira, incluso sin caminar.
- [ ] CA-33: En el exterior, el ratón sigue girando la cámara con pointer lock/arrastre y `A`/`D` orientan al jugador como antes.

## 6. Archivos relevantes

| Ruta                                                          | Acción                           | Motivo                                                                                       |
| ------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------- |
| `frontend/static/game2.glb`                                   | aportar (usuario)                | Cripta subterránea; se sirve como `/game2.glb`.                                              |
| `frontend/src/lib/components/world/Crypt.svelte`              | crear (generado)                 | Componente `@threlte/gltf` con la cripta y los `AutoColliders` inyectados.                   |
| `frontend/src/lib/components/world/crypt-colliders.json`      | crear                            | Única fuente de verdad de nodos con colisión y nodos excluidos.                              |
| `frontend/scripts/build-crypt.sh`                             | crear                            | Genera `Crypt.svelte`, lo mueve, inyecta colliders y aplica Prettier.                        |
| `frontend/scripts/inject-crypt-colliders.mjs`                 | crear                            | Envuelve los nodos de la lista blanca en `AutoColliders`.                                    |
| `frontend/scripts/verify-crypt-colliders.mjs`                 | crear                            | Valida nombres, exclusiones y presupuesto de triángulos.                                     |
| `frontend/src/lib/components/world/CryptLighting.svelte`      | crear                            | Iluminación de la cripta (hemisférica, cinco luces de zona y tumba).                         |
| `frontend/src/lib/components/minigame2/Skulls.svelte`         | crear                            | Render de los 10 cráneos y su estado.                                                        |
| `frontend/src/lib/components/minigame2/Mummies.svelte`        | crear                            | Render interpolado de las 5 momias.                                                          |
| `frontend/src/lib/components/minigame2/Mummy.svelte`          | modificar                        | Animación de aturdido (`MU_hit` → `MU_injured`) y mapa collider → momia.                     |
| `frontend/src/lib/components/player/PaperRoll.svelte`         | modificar                        | Detectar el impacto del rollo propio en una momia y enviar `mg2-stun`.                       |
| `frontend/src/lib/components/minigame2/RemotePlayers.svelte`  | crear                            | Sprites de jugadores remotos con nombre y cráneos transportados.                             |
| `frontend/src/lib/components/minigame2/TombZone.svelte`       | crear                            | Aro de la tumba principal, aviso de `E` y botón táctil.                                      |
| `frontend/src/lib/components/minigame2/Minijuego2Hud.svelte`  | crear                            | Temporizador, contadores, tabla de equipo y leyenda de zonas.                                |
| `frontend/src/lib/components/minigame2/RoundOverlay.svelte`   | crear                            | Pantallas de conteo, muerte y resultado.                                                     |
| `frontend/src/lib/components/minigame2/CryptSession.svelte`   | crear                            | Reporte de posición a 10 Hz mientras la cripta está activa.                                  |
| `frontend/src/lib/state/minigame2.svelte.ts`                  | crear                            | Espejo del estado del servidor, interpolación y acciones del cliente.                        |
| `frontend/src/lib/state/cryptState.svelte.ts`                 | crear                            | `ready`, métricas y estado de la escena de la cripta.                                        |
| `frontend/src/lib/state/sceneState.svelte.ts`                 | crear (o reutilizar de SPEC-010) | Escena activa derivada de `lobby.self.lobbyId`.                                              |
| `frontend/src/lib/state/playerPhysics.ts`                     | crear                            | Expone el collider del jugador para excluirlo del raycast de cámara.                         |
| `frontend/src/lib/state/checkpoints.svelte.ts`                | modificar                        | Mover `minigame-2` a `(21.48, 0.3, 35.5)`, radio 2 y nombre “Cripta del Mausoleo”.           |
| `frontend/src/lib/Scene.svelte`                               | modificar                        | Montaje condicional exterior/cripta/interior y luces.                                        |
| `frontend/src/lib/components/player/PlayerCollider.svelte`    | modificar                        | Spawn según escena, bloqueo de movimiento, teletransporte y reporte.                         |
| `frontend/src/lib/state/playerState.ts`                       | modificar                        | Spawn mutable (`global`, `cripta`, `mausoleo`) y `frozen`.                                   |
| `frontend/src/lib/components/camera/ThirdPersonCamera.svelte` | modificar                        | Perfil de cámara por escena y corrección por raycast.                                        |
| `frontend/src/lib/components/camera/ThirdPersonControls.ts`   | modificar                        | Límites de radio configurables en caliente.                                                  |
| `frontend/src/lib/services/protocol.ts`                       | modificar                        | Tipos y guardas de los mensajes `mg2-*`.                                                     |
| `frontend/src/lib/services/lobbySocket.ts`                    | modificar                        | Callbacks y envío de los mensajes `mg2-*`.                                                   |
| `frontend/src/lib/state/lobby.svelte.ts`                      | modificar                        | Conectar/desconectar la sala al entrar/salir de `minigame-2` y limpiar el checkpoint activo. |
| `frontend/src/lib/components/ui/CheckpointPrompt.svelte`      | sin cambios                      | La entrada sigue usando `E`; el prompt ya existe.                                            |
| `frontend/package.json`                                       | modificar                        | Scripts `crypt:build` y `crypt:check`.                                                       |
| `backend/src/ws/minigame2.ts`                                 | crear                            | Motor de sala: fases, cráneos, momias, muertes y depósitos.                                  |
| `backend/src/ws/protocol.ts`                                  | modificar                        | Esquemas Zod y tipos de los mensajes `mg2-*`.                                                |
| `backend/src/index.ts`                                        | modificar                        | Enrutar mensajes, suscribir al topic de la sala y manejar salidas/cierre.                    |
| `backend/src/ws/presence.ts`                                  | sin cambios                      | La pertenencia al lobby ya se gestiona aquí.                                                 |
| `specs/SPEC-011-minijuego-2-craneos-cripta-momias.md`         | crear                            | Este spec.                                                                                   |

## 7. Plan de implementación

### Fase 0 — Preparar la cripta y la integración de escena

- [x] Paso 1: Confirmar que `frontend/static/game2.glb` existe y empieza por la firma `glTF`; registrar tamaño, fecha y hash.
- [x] Paso 2: Crear `frontend/scripts/build-crypt.sh` con
      `npx @threlte/gltf@latest game2.glb -K -k -d "https://www.gstatic.com/draco/versioned/decoders/1.4.3/"`
      desde `frontend/static`, mover el resultado a
      `frontend/src/lib/components/world/Crypt.svelte` y pasar Prettier.
- [x] Paso 3: Añadir a `frontend/package.json`:
  ```json
  "crypt:build": "bash scripts/build-crypt.sh",
  "crypt:check": "node scripts/verify-crypt-colliders.mjs"
  ```
- [x] Paso 4: Ejecutar `bun run crypt:build` y comprobar que la cabecera apunta a `/game2.glb` y que no se editó el cuerpo generado a mano.
- [x] Paso 5: Crear `sceneState.svelte.ts` con `active: 'global' | 'interior' | 'crypt'` derivado de `lobby.self?.lobbyId`. Si `SPEC-010` ya lo creó, reutilizarlo tal cual.
- [x] Paso 6: Si `SPEC-010` todavía no está implementado, añadir la rama mínima de escena, el spawn mutable y `frozen` como parte de este spec; si ya existe, solo añadir la rama `crypt`.

### Fase 1 — Lista blanca y verificador de la cripta

- [x] Paso 1: Crear `crypt-colliders.json` con los 16 nodos de §11.2 y una lista `exclude` explícita con los 6 nodos de §11.2.
- [x] Paso 2: Escribir `verify-crypt-colliders.mjs` con solo Node (`fs`, `path`): leer el chunk JSON del GLB, recorrer nodos y mallas, sumar triángulos por primitiva y comparar con la lista blanca.
- [x] Paso 3: El script falla con código 1 si un nombre no existe o si se superan 25 000 triángulos. La lista `exclude` tiene prioridad sobre `include`: un nodo que coincide con ambas nunca recibe collider y no se considera un error.
- [x] Paso 4: Ejecutar `bun run crypt:check` y guardar nodos, mallas, primitivas y triángulos en §12.

### Fase 2 — Montaje, iluminación y cambio de escena

- [x] Paso 1: Implementar `cryptState.svelte.ts` con `ready`, `nodes`, `triangles` y `active` derivado de `sceneState.active === 'crypt'`.
- [x] Paso 2: Crear `CryptLighting.svelte`: `HemisphereLight` tenue, cinco `PointLight` (oeste, sur, este, norte y sala) y una luz cálida sobre la tumba principal. Sin sombras.
- [x] Paso 3: En `Scene.svelte`, montar `{#if sceneState.active === 'crypt'}<Crypt /><CryptLighting />{:else}...{/if}`. Mantener `Player`, `ThirdPersonCamera` y los overlays siempre montados.
- [x] Paso 4: Ocultar `Checkpoints` y `Sky` dentro de la cripta; conservarlos en el exterior.
- [ ] Paso 5: Verificar que desmontar `Map` elimina sus colliders del mundo Rapier y que volver a montarlo no duplica cuerpos. Si Threlte no los libera, forzar `world.removeRigidBody` en el `onDestroy` del componente.
- [x] Paso 6: Medir el tiempo hasta `cryptState.ready` y registrarlo en consola solo en desarrollo (`[crypt] física lista`).

### Fase 3 — Física selectiva de la cripta

- [x] Paso 1: Implementar `inject-crypt-colliders.mjs`; lee `crypt-colliders.json`, localiza cada bloque del `Crypt.svelte` y lo envuelve en `<AutoColliders shape="trimesh" friction={0.9} restitution={0}>`.
- [x] Paso 2: Marcar `cryptState.ready = true` en el `oncreate` del primer `AutoColliders` de la sala (`A4C_Hall`), cuando los trimeshes ya existen.
- [ ] Paso 3: Verificar que el jugador se apoya en `y ≈ -7.98` en la sala y las cuatro criptas y en `y ≈ -7.52` en la plataforma de la tumba.
- [ ] Paso 4: Verificar que la escalera de `A4C_Stairwell` tiene colisión continua y que el _autostep_ de 0.5 m de `SPEC-009` sube los escalones sin saltar.
- [x] Paso 5: Añadir el `<Debug />` de `@threlte/rapier` cuando `?physics=1`.

### Fase 4 — Checkpoint del mausoleo

- [x] Paso 1: En `checkpoints.svelte.ts`, cambiar la entrada `minigame-2` a
      `{ name: 'Cripta del Mausoleo', position: [21.48, 0.3, 35.5], color: '#f59e0b', radius: 2 }`.
      El `y = 0.3` es local: el grupo de `Checkpoints.svelte` suma `0.1` y el suelo del mausoleo está en `0.40`.
- [ ] Paso 2: Verificar en `?physics=1` que el sensor no se solapa con la geometría del mausoleo y que el jugador puede atravesarlo caminando.
- [ ] Paso 3: Comprobar que el aviso aparece delante de `CCC_Mausoleum` y que `E` entra en `minigame-2`.
- [x] Paso 4: Añadir al `lobby.svelte.ts` la limpieza de `checkpoints.activeCheckpointId` cuando el jugador deja `global` o cambia de lobby.
- [x] Paso 5: Definir `MAUSOLEUM_EXIT = { x: 21.48, y: 0.4, z: 35.5 }` en `playerState.ts` y usarlo al volver de `minigame-2`.

### Fase 5 — Protocolo y motor de sala en el backend

- [x] Paso 1: Extender `backend/src/ws/protocol.ts` con los esquemas Zod y los tipos de §11.3. Mantener `parseClientMessage` como única puerta de entrada.
- [x] Paso 2: Crear `backend/src/ws/minigame2.ts` con una única instancia de sala y esta API pública:
  ```ts
  type Mg2Phase = "idle" | "countdown" | "playing" | "won" | "lost";
  type Mg2Zone = "west" | "south" | "east" | "north" | "chambers" | "hall";
  type Mg2Player = {
    id: string;
    name: string;
    skullsCarried: number;
    skullsDeposited: number;
    alive: boolean;
    x: number;
    y: number;
    z: number;
    yaw: number;
    lastPositionAt: number;
  };
  type Mg2Skull = {
    id: string;
    zone: Mg2Zone;
    x: number;
    y: number;
    z: number;
    state: "available" | "carried" | "deposited" | "dropped";
    carrierId: string | null;
    pickupAfter: number;
  };
  type Mg2Mummy = {
    id: string;
    zone: Mg2Zone;
    x: number;
    y: number;
    z: number;
    yaw: number;
    state: "patrol" | "chase" | "cooldown";
    waypoint: number;
  };
  ```
- [x] Paso 3: Implementar `onEnter(playerId)`, `onLeave(playerId)`,
      `onPosition(playerId, x, y, z, yaw)`, `onDeposit(playerId)` y `tick(now)`.
- [x] Paso 4: `onEnter` añade al jugador con 0 cráneos y posición
      `(36.7, -7.98, 45.0)`; si la fase es `idle`, arranca `countdown` a 30 000 ms.
      Si entra con una ronda en `countdown`/`playing`, aparece en el descanso
      inferior de la escalera, `(21.3, -7.98, 50.0)`.
- [x] Paso 5: `onLeave` suelta cráneos, elimina al jugador y, si la sala queda
      vacía en `countdown`/`playing`, resetea a `idle`.
- [x] Paso 6: `tick` cada 100 ms actualiza fase y tiempos, mueve momias,
      detecta recogidas, depósitos y muertes; difunde `mg2-positions` y, si cambió
      cualquier contador, un `mg2-state` inmediato además del heartbeat de 1 s.
- [x] Paso 7: Implementar depósito: `E` solo se acepta si el jugador está en
      `playing`, vivo, a ≤ 2.5 m horizontales de `(36.68, 40.30)` y lleva al menos
      un cráneo.
- [x] Paso 8: Implementar `finish('won' | 'lost')`: fija `endsAt = now + 8000`,
      difunde estado y, al vencer, mueve a todos a `global` mediante un callback
      `sendToGlobal(playerId)` inyectado desde `index.ts` (que llama a `setLobby`
      y `broadcastPresence`); después resetea la sala.
- [x] Paso 9: Proteger el motor contra excepciones con `try/catch` por tick:
      registrar, emitir `error` a la sala y resetear a `idle`.
- [x] Paso 10: En `index.ts`, suscribir al entrar a `lobby:minigame-2` (ya se
      hace) y enrutar `mg2-position`/`mg2-deposit` a `minigame2.ts`; difundir
      `mg2-*` por `app.server?.publish('lobby:minigame-2', ...)`. Si el jugador
      cambia de lobby o usa `leave-lobby`, llamar antes a `onLeave` para soltar
      sus cráneos.
- [x] Paso 11: En `close(ws)`, llamar a `onLeave` antes de `removePlayer` para
      que los cráneos se suelten con la última posición conocida.

### Fase 6 — Estado y movimiento en el cliente

- [x] Paso 1: Implementar `minigame2.svelte.ts` con `snapshot`, `positions`,
      `events`, `interpolatedPlayers`, `interpolatedMummies` y `reset()`.
- [x] Paso 2: En `lobbySocket.ts`, añadir `sendMg2Position`, `sendMg2Deposit`
      y los callbacks `onMg2State`, `onMg2Positions`, `onMg2Event`.
- [x] Paso 3: En `lobby.svelte.ts`, al recibir `welcome`/`presence`, activar o
      desactivar el reporte según `lobbyId`; al salir, llamar a `minigame2.reset()`.
- [x] Paso 4: En `playerState.ts`, añadir `CRYPT_SPAWN = { x: 36.7, y: -7.98, z: 45.0 }`,
      `MAUSOLEUM_EXIT = { x: 21.48, y: 0.4, z: 35.5 }`, `spawn` mutable y `frozen: boolean`.
- [x] Paso 5: En `PlayerCollider.svelte`, elegir `spawn` y `ready` según la
      escena activa; mientras `frozen` o `!ready`, no aplicar desplazamiento ni
      gravedad, pero sí mantener la posición. Reaccionar a cambios de `spawn`
      teletransportando el cuerpo.
- [x] Paso 6: Publicar `mg2-position` a 10 Hz con `x`, `y`, `z` y `yaw`
      mientras `sceneState.active === 'crypt'`; usar un acumulador de tiempo, no un
      `setInterval`. Puede vivir en `CryptSession.svelte` montado con la cripta.
- [x] Paso 7: Al morir o al ganar/perder, congelar el input y dejar que la
      transición la decida el servidor.
- [x] Paso 8: Al volver a `global`, teletransportar a `MAUSOLEUM_EXIT`, limpiar
      `frozen`, limpiar el checkpoint activo y reiniciar la cámara si quedó dentro
      de la cripta.

### Fase 7 — Presentación y HUD

- [x] Paso 1: Crear `Skulls.svelte`: cráneo hueso con cuencas oscuras y brillo
      verde frío, flotando y girando; los transportados no se dibujan en el mundo;
      los depositados se muestran alrededor de la tumba principal.
- [x] Paso 2: Crear `Mummies.svelte`: cápsula vendada de 2.0 m con ojos
      emisivos ámbar y brazos al frente como marcador provisional; interpolar a
      10 Hz.
- [x] Paso 3: Crear `RemotePlayers.svelte`: billboard con el atlas de
      `dude.png`, nombre encima y contador de cráneos; interpolar con búfer de
      150 ms.
- [x] Paso 4: Crear `TombZone.svelte`: aro dorado sobre la plataforma de
      `A4C_Tombs`, prompt `E` cuando el jugador está cerca y lleva cráneos, y
      botón táctil.
- [x] Paso 5: Crear `Minijuego2Hud.svelte` con temporizador, `Equipo n/10`,
      `Tus cráneos: n`, salud y tabla de jugadores.
- [x] Paso 6: Crear `RoundOverlay.svelte` para conteo (`30…0`), muerte
      (`Te ha atrapado una momia`) y resultado (`El ritual se ha completado` /
      `Las momias os han atrapado`), con temporizador de retorno.
- [x] Paso 7: Montar el HUD y los overlays en `routes/+page.svelte` (fuera del
      canvas) solo cuando `sceneState.active === 'crypt'`; no tapar `ChatOverlay`
      ni `MobileControls`.

### Fase 8 — Cámara cerrada y pulido

- [x] Paso 1: Añadir a `ThirdPersonControls.ts` un método `setLimits(radius, minRadius, maxRadius)` que ajuste `radius`, `targetRadius`, `minRadius` y `maxRadius`.
- [x] Paso 2: En `ThirdPersonCamera.svelte`, elegir el perfil según `sceneState.active`:
      exterior `{ radius: 12, min: 6, max: 24 }`; cripta en primera persona
      `{ radius: 0.2, min: 0.2, max: 2 }` con el objetivo adelantado 0.7 m y
      `positionSnap` en primera persona.
- [x] Paso 3: Con `useRapier`, lanzar un rayo desde los ojos hacia delante y
      recortar el adelanto de la vista antes de tocar un muro (margen 0.12 m),
      excluyendo el collider del jugador (`playerPhysics.collider`).
- [x] Paso 4: Publicar `playerPhysics.collider` desde `PlayerCollider.svelte` y limpiarlo al desmontar.
- [ ] Paso 5: Verificar que la vista no queda dentro de la cabeza, no atraviesa
      las paredes de las criptas y que el exterior no cambia.
- [x] Paso 6: En primera persona, hacer que `facingYaw` siga el yaw de la
      cámara (`θ + π`) cada frame, para que el avatar gire con el ratón y los
      remotos lo vean orientarse aunque el jugador no camine.
- [x] Paso 7: Conservar sin cambios el ratón y el pointer lock de la cámara en
      todas las escenas, y el giro del jugador con `A`/`D` en tercera persona.
- [ ] Paso 8: Probar en navegador que el avatar de la cripta gira con el ratón,
      que el exterior conserva su cámara y que no hay doble rotación.

### Fase 9 — Verificación y cierre

- [x] Paso 1: Ejecutar `bun run crypt:check`, `bun run check`, `bun run lint`,
      `bun run build` y `bunx tsc --noEmit`.
- [ ] Paso 2: Probar con dos navegadores los 28 criterios de §5.
- [ ] Paso 3: Medir FPS, tráfico y latencia con 8 pestañas simuladas.
- [x] Paso 4: Actualizar este spec (`estado`, `actualizado`, Progreso,
      Changelog y checkboxes).
- [ ] Paso 5: Confirmar con el usuario las preguntas abiertas antes de
      considerar cerrada la implementación.

## 8. Verificación

```bash
# Frontend
cd frontend
bun run crypt:check
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

Resultado esperado de `crypt:check` con el GLB actual:

| Comprobación           | Esperado       |
| ---------------------- | -------------- |
| Nodos del GLB          | 28             |
| Nodos con malla        | 22             |
| Mallas                 | 22             |
| Primitivas             | 82             |
| Materiales             | 14             |
| Animaciones            | 0              |
| Nodos con collider     | 16             |
| Triángulos de collider | 21 820         |
| Triángulos totales     | 26 522         |
| Presupuesto máximo     | 25 000         |
| Nodos excluidos        | 6 (4 702 tris) |

Casos manuales:

> Estado 2026-10-31: las comprobaciones automáticas de CA-1, CA-4 y CA-27
> pasan. Los casos manuales 1–21 siguen pendientes de ejecutar con dos
> navegadores.

1. **Checkpoint**: caminar hasta delante de `CCC_Mausoleum`, en
   `(21.48, 0.4, 35.5)`, y comprobar que aparece “Pulsa E para entrar a
   Cripta del Mausoleo”.
2. **Entrada**: pulsar `E` y aparecer en el centro de la nave, frente al
   sepulcro, `(36.7, -7.98, 45.0)`.
3. **Conteo**: con un solo jugador dentro, el HUD muestra 30 s; intentar
   caminar, saltar y ser tocado por una momia no tiene efecto.
4. **Inicio**: al llegar a 0, aparecen los 10 cráneos y las 5 momias; el
   movimiento se desbloquea.
5. **Cráneo oeste**: recorrer la cripta oeste y recoger los dos cráneos en
   `(11.6, -6.95, 35.5)` y `(7.5, -6.95, 40.5)`; el contador personal sube a 2.
6. **Depósito**: volver a la sala central, subir a la plataforma de la tumba
   y pulsar `E` en `(36.68, 40.3)`; el equipo sube a `1/10`.
7. **Victoria**: depositar los 10 cráneos entre varios jugadores; aparece
   “El ritual se ha completado” y a los 8 s todos vuelven a `global` delante
   del mausoleo.
8. **Derrota**: dejar que el temporizador llegue a 0 con 9 cráneos; aparece
   “Las momias os han atrapado”.
9. **Momia**: acercarse a una momia de la zona; a ≤ 9 m empieza a perseguir y
   al tocarla resta 25 HP, sin matar de un golpe.
10. **Muerte**: recibir golpes con 2 cráneos hasta 0 HP; se sueltan en el suelo,
    el aviso dura 2.5 s y el jugador vuelve a `global`.
11. **Recuperación**: otro jugador recoge los cráneos soltados tras 2 s.
12. **Desconexión**: cerrar una pestaña con cráneos; los cráneos quedan en el
    suelo y la ronda sigue.
13. **Mitad de ronda**: entrar con la ronda empezada; aparece en el descanso
    de la escalera, sin conteo nuevo, con 0 cráneos.
14. **Sala vacía**: salir todos durante `playing`; la sala vuelve a `idle` y
    el siguiente que entra ve un conteo nuevo.
15. **Sincronización**: en dos navegadores, ver el mismo cráneo desaparecer,
    el mismo contador y las mismas momias.
16. **Cámara**: dentro de la cripta, comprobar que la vista sale delante de la
    cabeza y que al mirar a una pared no se atraviesa. En el exterior, comprobar
    que sigue igual.
17. **Retorno**: salir desde el panel de lobby y comprobar que el jugador
    aparece delante de `CCC_Mausoleum`, no en `(0, 0.4, 12)`.
18. **Física**: `?physics=1` muestra solo los colliders de la cripta mientras
    se juega.
19. **Regeneración**: ejecutar `crypt:build`, recargar y repetir 1, 6 y 16.
20. **Aturdido**: lanzar un rollo de papel a una momia y comprobar que deja de
    perseguir 5 s, reproduce `MU_hit`/`MU_injured` y luego vuelve a patrullar.
21. **Salud**: recibir un golpe, ver la barra bajar 25 HP y comprobar que sube
    sola tras 6 s sin daño.

## 9. Riesgos y mitigaciones

| Riesgo                                                                             | Impacto | Mitigación                                                                                                                                                               |
| ---------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| El GLB se reexporta y cambian nombres.                                             | Alto    | `crypt:check` falla y obliga a actualizar el JSON; no usar patrones difusos en runtime.                                                                                  |
| La cripta se ve negra.                                                             | Alto    | `CryptLighting.svelte` con cinco luces de zona y una luz de tumba; comprobar antes de cerrar la fase 2.                                                                  |
| La cámara de 12 m atraviesa muros y techo.                                         | Alto    | Primera persona con radio 0.2 m, vista adelantada 0.7 m, objetivo sin suavizado y raycast que recorta el adelanto antes de un muro; validar en cada cripta y en la sala. |
| Desmontar `Map` deja colliders huérfanos en Rapier.                                | Alto    | Verificar en `?physics=1`; si ocurre, eliminar cuerpos explícitamente en `onDestroy`.                                                                                    |
| Las momias atraviesan paredes al perseguir en línea recta.                         | Medio   | Persecución limitada a la zona rectangular y waypoints; si el jugador está al otro lado de un muro, la momia vuelve a patrulla tras 2 s sin línea de visión aproximada.  |
| El depósito en la plataforma de la tumba no es accesible por el escalón de 0.46 m. | Medio   | Radio horizontal de 2.5 m permite depositar desde el borde inferior; el autostep de 0.5 m debería subir. Validar con `?physics=1`.                                       |
| El servidor confía en la posición del cliente.                                     | Medio   | Validar finitud, rango, ritmo y velocidad máxima (≤ 8 m/s entre muestras); aceptar el riesgo de cheats en esta iteración.                                                |
| Caída de paquetes o picos de latencia.                                             | Medio   | Estado completo cada 1 s además de posiciones a 10 Hz; interpolación de 150 ms; el HUD usa el estado, no las posiciones.                                                 |
| El reloj del cliente y el del servidor divergen.                                   | Bajo    | Enviar `serverTime` y `endsAt`; el HUD calcula con `Date.now() + offset` estimado.                                                                                       |
| Dos jugadores recogen el mismo cráneo en el mismo tick.                            | Medio   | El tick procesa cráneos en orden fijo y marca `carried` de forma atómica antes de pasar al siguiente.                                                                    |
| Un jugador muere dentro de una pared y el cráneo queda inaccesible.                | Medio   | Validar la posición de caída contra el AABB de la zona; si no es válida, soltar en el centro de la zona.                                                                 |
| Todos mueren a la vez y la sala queda vacía.                                       | Bajo    | `onLeave` detecta sala vacía y resetea a `idle` sin mostrar derrota.                                                                                                     |
| Dos instancias del backend comparten el puerto 3000.                               | Alto    | Elysia activa `reusePort` por defecto y partiría presencia y salas entre procesos. Se fuerza `reusePort: false`: la segunda instancia falla con `EADDRINUSE`.            |
| El checkpoint del mausoleo se confunde con una lápida.                             | Medio   | El checkpoint ya dibuja halo, haz y cristal; el nombre “Cripta del Mausoleo” y el color ámbar lo distinguen.                                                             |
| El jugador no encuentra el mausoleo desde el spawn global.                         | Bajo    | Está a ~33 m del spawn; el checkpoint emite un haz visible y el cementerio tiene caminos. Se puede añadir brújula en otro spec.                                          |
| El HUD tapa el chat o los controles táctiles.                                      | Medio   | Panel superior compacto, `pointer-events-none` salvo botones; probar en móvil.                                                                                           |
| La rama de escena de `SPEC-010` y la de este spec chocan.                          | Medio   | Usar `sceneState.svelte.ts` como única fuente y coordinar la modificación de `Scene.svelte`; la rama `interior` y la rama `crypt` son excluyentes.                       |

## 10. Preguntas abiertas

- [ ] ¿Este juego debe ocupar `minigame-2`? Propuesta: sí, porque
      `SPEC-010` ya ocupa `minigame-1` y `game2.glb` es el segundo escenario.
- [ ] ¿`A4C_Tombs` es la “tumba principal”? Propuesta: sí; es el conjunto
      central de sarcófagos de `A4C_Hall`, en `(36.68, -6.82, 37.75)`, y el
      depósito se hace en su plataforma sur, `(36.68, -7.52, 40.30)`.
- [x] ¿Son 5 cráneos, uno por zona, o debe haber más? Resuelto: 10 cráneos,
      dos por cripta y dos en los nichos del norte, para cubrir todo el nivel
      con más recorrido.
- [ ] ¿Las momias deben usar el rig `Mummy_LowPoly` de `SPEC-007` o vale el
      marcador provisional (cápsula vendada + ojos)? Propuesta: marcador ahora;
      arte y animaciones en un spec posterior.
- [ ] ¿La puerta de `CCC_Mausoleum` debe abrirse visualmente al entrar o
      salir? Propuesta: no; el checkpoint es el portal y la puerta queda cerrada.
- [ ] ¿El retorno desde `minigame-2` debe ser siempre delante del mausoleo,
      incluso si el jugador entró desde el panel de lobby? Propuesta: sí.
- [ ] ¿Debe haber un aviso de qué zona tiene cada cráneo? Propuesta: leyenda
      en el HUD con las zonas, sin revelar la posición exacta.
- [ ] ¿Se permite reentrar tras morir? Propuesta: sí, desde el checkpoint,
      con 0 cráneos y sin reiniciar la ronda.
- [ ] ¿La sala debe sobrevivir a un reinicio del backend? Propuesta: no; es
      estado en memoria y se reinicia a `idle`.
- [ ] ¿El conteo debe empezar con el primer jugador o esperar a que se llene
      la sala? Propuesta: primer jugador, igual que `SPEC-010`.
- [ ] ¿La ronda de 300 s y las velocidades de las momias están balanceadas
      para 2 y 8 jugadores? Propuesta: ajustar tras la primera prueba; §11 es el
      punto de partida.
- [ ] ¿Se debe añadir un minimapa o una brújula hacia la tumba? Propuesta:
      no en esta iteración.

## 11. Decisiones y notas

### 11.1 Máquina de estados

| Fase        | Entra cuando                             | Duración   | Qué ocurre                                                                | Sale a                                                        |
| ----------- | ---------------------------------------- | ---------- | ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `idle`      | No hay nadie o la ronda anterior terminó | —          | Sin cráneos ni momias; espera de jugadores                                | `countdown` al entrar el primero                              |
| `countdown` | Primer jugador en `minigame-2`           | 30 000 ms  | Movimiento bloqueado; momias inactivas; HUD con cuenta atrás              | `playing` al vencer; `idle` si se vacía                       |
| `playing`   | Fin del conteo                           | 300 000 ms | Cráneos y momias activas; recogida, depósito, daño y aturdido habilitados | `won` si 10 depositados; `lost` al vencer; `idle` si se vacía |
| `won`       | `depositedTotal === 10`                  | 8 000 ms   | Resultado y bloqueo de acciones                                           | `idle` y todos a `global`                                     |
| `lost`      | Temporizador a 0 con < 10                | 8 000 ms   | Resultado y bloqueo de acciones                                           | `idle` y todos a `global`                                     |

Muertes: no cambian la fase de la sala. Las momias restan 25 HP por contacto
(con 1 s de invulnerabilidad); al llegar a 0 HP el jugador pasa por `dead`
2 500 ms y sale a `global`; la sala sigue si queda alguien vivo. La salud se
regenera a 8 HP/s tras 6 s sin daño.

### 11.2 Lista blanca de colisiones de la cripta

Incluidos (16 nodos, 21 820 triángulos):

| Nodo               | Triángulos | Motivo                               |
| ------------------ | ---------- | ------------------------------------ |
| `A4C_Chambers`     | 30         | Pared de nichos del norte.           |
| `A4C_Gallery.001`  | 484        | Galería elevada al sur.              |
| `A4C_Hall`         | 4 478      | Sala central, suelos, muros y techo. |
| `A4C_Ironwork.001` | 68         | Verja de la escalera.                |
| `A4C_Ironwork.002` | 62         | Verja de la escalera.                |
| `A4C_Ironwork.003` | 16         | Herraje pequeño de la verja.         |
| `A4C_Ironwork.004` | 8          | Herraje pequeño de la verja.         |
| `A4C_Ironwork.005` | 24         | Herraje pequeño de la verja.         |
| `A4C_Stairwell`    | 306        | Escalera de superficie.              |
| `A4C_StoneProps`   | 420        | Props de piedra grandes.             |
| `A4C_Tombs`        | 128        | Tumba principal y sarcófagos.        |
| `A4C_Tunnels`      | 4 680      | Túneles que conectan las cámaras.    |
| `a_Crypt`          | 2 490      | Cripta oeste.                        |
| `b_Crypt`          | 4 638      | Cripta sur.                          |
| `c_Crypt`          | 2 020      | Cripta este.                         |
| `d_Crypt`          | 1 968      | Cripta norte.                        |

Excluidos (6 nodos, 4 702 triángulos):

| Nodo              | Triángulos | Motivo                                                    |
| ----------------- | ---------- | --------------------------------------------------------- |
| `A4C_Bones`       | 672        | Huesos decorativos del suelo.                             |
| `A4C_Bones.001`   | 180        | Huesos decorativos.                                       |
| `A4C_Candles`     | 1 788      | Velas, llamas y brillos.                                  |
| `A4C_Candles.001` | 66         | Velas pequeñas.                                           |
| `A4C_Candles.002` | 396        | Cera y velas.                                             |
| `A4C_Ironwork`    | 1 600      | Candelabros y herrajes grandes; evita paredes invisibles. |

La exclusión gana sobre la inclusión. No hay nodos ocultos: la cripta se
modela completa; no hace falta ocultar hojas de puertas.

### 11.3 Contrato WebSocket

Todos los mensajes comparten el sobre existente (`type` + campos). Los
mensajes `mg2-*` solo se aceptan y emiten dentro de `minigame-2`.

**Cliente → servidor**

| Tipo           | Campos                                 | Frecuencia    | Validación                                                                               |
| -------------- | -------------------------------------- | ------------- | ---------------------------------------------------------------------------------------- |
| `mg2-position` | `x`, `y`, `z`, `yaw` (números finitos) | ≤ 10 Hz       | Rango `x,z ∈ [-2, 64]`, `y ∈ [-10, 1]`; máx. 15/s por jugador; ≤ 8 m/s entre muestras    |
| `mg2-deposit`  | —                                      | Al pulsar `E` | Fase `playing`, vivo, ≤ 2.5 m horizontales de `(36.68, 40.30)`, \|dy\| ≤ 2.0, ≥ 1 cráneo |
| `mg2-stun`     | `mummyId` (string)                     | Al impactar   | Fase `playing`, jugador vivo, momia existente, ≤ 15 m horizontales; máx. 1 cada 300 ms   |

**Servidor → cliente**

| Tipo            | Cuándo                                   | Contenido                                                                                                                                                                                                                                        |
| --------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mg2-state`     | Al entrar, al cambiar de fase y cada 1 s | `phase`, `endsAt`, `serverTime`, `depositedTotal`, `players[]` con `hp,maxHp`, `skulls[]`, `mummies[]` con `state` incluido `stunned`                                                                                                            |
| `mg2-positions` | Cada 100 ms durante `playing`            | `players[]` con `id,x,y,z,yaw,alive` y `mummies[]` con `id,x,y,z,yaw,zone,state,goalX,goalZ`                                                                                                                                                     |
| `mg2-event`     | En cada evento                           | `kind`: `skull-picked`, `skull-dropped`, `skull-deposited`, `player-hurt`, `player-died`, `mummy-stunned`, `round-start`, `round-won`, `round-lost`, `player-joined`, `player-left`; `playerId?`, `skullId?`, `mummyId?`, `amount?`, `hp?`, `at` |

`mg2-state` es la fuente de verdad; `mg2-positions` solo suaviza el
movimiento. El cliente descarta posiciones de jugadores que ya no están en el
estado.

### 11.4 Posiciones iniciales

**Cráneos** (10; `y` = superficie + 1.03):

| Cráneo           | Zona   | Posición              | Zona aproximada           |
| ---------------- | ------ | --------------------- | ------------------------- |
| `skull-west`     | Oeste  | `(11.6, -6.95, 35.5)` | Centro de `a_Crypt`       |
| `skull-west-2`   | Oeste  | `(7.5, -6.95, 40.5)`  | Interior de `a_Crypt`     |
| `skull-south`    | Sur    | `(36.7, -6.95, 59.8)` | Centro de `b_Crypt`       |
| `skull-south-2`  | Sur    | `(31.5, -6.95, 63.5)` | Interior de `b_Crypt`     |
| `skull-east`     | Este   | `(55.2, -6.95, 38.4)` | Centro de `c_Crypt`       |
| `skull-east-2`   | Este   | `(50.8, -6.95, 44.5)` | Interior de `c_Crypt`     |
| `skull-north`    | Norte  | `(36.7, -6.95, 19.9)` | Centro de `d_Crypt`       |
| `skull-north-2`  | Norte  | `(31.8, -6.95, 23.8)` | Interior de `d_Crypt`     |
| `skull-niches`   | Nichos | `(36.7, -6.95, 27.0)` | Delante de `A4C_Chambers` |
| `skull-niches-2` | Nichos | `(40.5, -6.95, 27.2)` | Delante de `A4C_Chambers` |

**Zonas, suelos y rectángulos de persecución**:

| Zona              | `x`            | `z`            | Suelo             | Centro de caída       |
| ----------------- | -------------- | -------------- | ----------------- | --------------------- |
| Oeste (`a_Crypt`) | `[3.5, 19.5]`  | `[27.5, 43.5]` | `-7.98`           | `(11.6, -7.98, 35.5)` |
| Sur (`b_Crypt`)   | `[28.5, 44.5]` | `[53.5, 65.8]` | `-7.98`           | `(36.7, -7.98, 59.8)` |
| Este (`c_Crypt`)  | `[48.8, 61.5]` | `[30.5, 46.5]` | `-7.98`           | `(55.2, -7.98, 38.4)` |
| Norte (`d_Crypt`) | `[28.8, 44.5]` | `[13.8, 26.2]` | `-7.98`           | `(36.7, -7.98, 19.9)` |
| Nichos / sala     | `[20.0, 49.5]` | `[25.0, 50.6]` | `-7.98` / `-7.52` | `(36.7, -7.98, 37.8)` |

**Momias** (una por zona; `y` = superficie):

| Momia         | Zona          | Spawn                 | Waypoints (patrulla)                                          |
| ------------- | ------------- | --------------------- | ------------------------------------------------------------- |
| `mummy-west`  | Oeste         | `(8.5, -7.98, 33.0)`  | `(8.5,33.0)` ↔ `(14.0,36.0)` ↔ `(8.5,42.0)` ↔ `(7.0,36.5)`    |
| `mummy-south` | Sur           | `(33.0, -7.98, 59.0)` | `(33.0,59.0)` ↔ `(40.0,59.0)` ↔ `(40.0,64.0)` ↔ `(31.0,64.0)` |
| `mummy-east`  | Este          | `(52.5, -7.98, 40.5)` | `(52.5,40.5)` ↔ `(58.0,40.5)` ↔ `(58.0,33.0)` ↔ `(52.5,33.0)` |
| `mummy-north` | Norte         | `(36.7, -7.98, 20.8)` | `(36.7,20.8)` ↔ `(32.0,24.0)` ↔ `(41.5,20.8)` ↔ `(36.7,16.5)` |
| `mummy-hall`  | Nichos / sala | `(32.0, -7.98, 29.0)` | `(32.0,29.0)` ↔ `(41.0,29.0)` ↔ `(41.0,35.0)` ↔ `(32.0,35.0)` |

Las coordenadas de waypoints se validaron con raycast sobre el GLB; si al
implementar una momia se queda atascada, se ajusta ±0.5 m y se registra en
este spec.

El depósito está en la plataforma sur de la tumba principal,
`(36.68, -7.52, 40.30)`, radio horizontal 2.5 m y tolerancia vertical 2.0 m.
El spawn de la partida es el centro de la nave, frente al sepulcro,
`(36.7, -7.98, 45.0)`. El retorno al mundo exterior es delante del mausoleo,
`(21.48, 0.40, 35.50)`.

La entrada con una ronda ya en `countdown` o `playing` usa el descanso inferior
de `A4C_Stairwell`, `(21.3, -7.98, 50.0)`. El servidor fija esa posición y el
cliente la aplica con el primer `mg2-state` antes de empezar a reportar
`mg2-position`, para que el jugador no aparezca en el centro ni reinicie la
ronda.

### 11.5 Decisiones de diseño

- **`minigame-2` es la cripta**: el id ya existe en el protocolo y en la UI;
  no hace falta un cuarto lobby ni tocar `presence.ts`.
- **Checkpoint delante del mausoleo**: el mausoleo es la entrada natural a la
  cripta y ya tiene colisión. El checkpoint es solo un sensor; no se abre la
  puerta ni se modifica `map.glb`.
- **Cinco zonas, diez cráneos, cinco momias**: dos cráneos por zona cubren las
  cuatro cámaras y los nichos de la sala central, obligan a recorrer todo el
  nivel y alargan la ronda sin añadir más momias.
- **Tumba principal `A4C_Tombs`**: es el conjunto central de sarcófagos de la
  sala; el depósito ocurre en su plataforma sur, no dentro de la geometría.
- **Servidor autoritativo para el juego, cliente autoritativo para el
  movimiento**: el servidor decide cráneos, depósitos, muertes, momias y
  tiempos; el cliente solo reporta dónde está. Es el mismo reparto que usan
  presencia, chat y `SPEC-010`.
- **Tick de 100 ms**: suficiente para momias, recogidas y muertes, y coincide
  con `mg2-positions`. No se simula física de red.
- **Pies, no centro de cápsula**: la `y` de momias y jugadores en el protocolo
  es la superficie del suelo. El cliente suma `0.95` m para colocar el centro
  de la cápsula de la momia; el conductor reporta de vuelta la altura de los
  pies. El servidor acota esa altura a la banda del suelo y limita su cambio
  por reporte, de modo que un fallo del conductor nunca hace “volar” a una
  momia en el resto de clientes.
- **Momias en el servidor**: así todos ven la misma momia y no hay
  discrepancias de muerte. El cliente solo interpola.
- **Cráneos fijos, no aleatorios**: el usuario pidió recoger cráneos y
  llevarlos a la tumba principal; posiciones fijas hacen la partida
  reproducible y comprobable.
- **Recogida automática y depósito con `E`**: reduce fricción en móvil y
  reutiliza la tecla del checkpoint. El botón táctil existente debe mapear a
  la misma acción.
- **Soltar cráneos al morir/salir**: evita que una muerte accidental bloquee
  la partida. El cooldown de 2 s impide que la momia “robe” el cráneo al
  matar. Los cráneos ya depositados son permanentes.
- **Zonas rectangulares en vez de altura**: todas las cámaras comparten el
  mismo nivel (`y ≈ -7.98`), así que la pertenencia a una zona se decide por
  el rectángulo XZ, no por la altura.
- **Cámara en primera persona**: la cripta se juega en FP y la vista se
  adelanta 0.7 m respecto a los ojos con un raycast que la recorta antes de un
  muro, para no ver el interior de la cabeza ni atravesar geometría. En FP el
  objetivo copia la posición del cuerpo cada frame (`positionSnap`): el avatar
  también se ajusta al cuerpo físico sin suavizado, y dejar la cámara con
  interpolación la retrasaba ~0.5 m al correr, metiendo la cabeza en la vista.
  El exterior conserva su perfil de 12 m.
- **Rotación del jugador, no de la cámara**: la cámara siempre gira con el
  ratón y su pointer lock/arrastre, como desde `SPEC-001`. Lo que cambia es el
  avatar: en primera persona su `facingYaw` sigue el yaw de la cámara
  (`θ + π`) cada frame, así que mirar con el ratón también gira al personaje y
  los demás jugadores lo ven orientarse. En tercera persona el jugador sigue
  orientándose con `A`/`D` al moverse, sin tocar el control de cámara.
- **Daño con salud, no muerte instantánea**: el contacto con una momia resta
  25 HP con 1 s de invulnerabilidad y la salud se regenera a 8 HP/s tras 6 s
  sin daño. La muerte conserva el flujo anterior de soltar cráneos y volver a
  `global`, pero solo al llegar a 0 HP.
- **Rollo de papel que aturde**: los rollos ya existen y se simulan en el
  cliente; el servidor valida distancia y ritmo antes de marcar a la momia como
  `stunned` durante 5 s. Mientras dura, no persigue ni daña y usa `MU_hit` y
  `MU_injured`, de modo que el aturdido se lee como daño y no como un fallo de
  la IA.
- **Id de misión heredado**: la recompensa sigue registrándose como
  `crypt-5-skulls` para no invalidar `rw:missions:v1`; el objetivo real ya es de
  10 cráneos y así se muestra en la descripción de la misión y en el HUD.
- **Retorno al mausoleo**: al terminar o salir, el jugador aparece delante de
  `CCC_Mausoleum`, no en el spawn global, para que la transición se sienta
  continua.
- **Sin arte definitivo de momia**: `game2.glb` no incluye momias ni
  animaciones. Se usa un marcador provisional; el arte y las animaciones van
  en otro spec.
- **Iluminación propia**: el GLB no tiene luces. Sin `CryptLighting` la
  cripta se vería negra, igual que ocurrió con el mapa en `SPEC-009`.
- **Reconexión sin reanudar**: `SPEC-003` reconecta al jugador en `global`.
  Si se cae a mitad de ronda, el cierre del socket suelta sus cráneos y el
  cliente desmonta la cripta; al volver a entrar aparece en el descanso de la
  escalera de la fase actual con 0 cráneos. No se intenta reanudar la sesión
  ni la posición.

## 12. Progreso

| Fecha      | Estado      | Nota                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-31 | borrador    | Spec creado. GLB medido: 28 nodos (22 con malla), 82 primitivas, 26 522 tris, 14 materiales, 0 animaciones. Lista blanca: 16 nodos, 21 820 tris. Checkpoint del mausoleo fijado en `(21.48, 0.40, 35.50)`. Pendiente de revisión del usuario.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-11-01 | en-progreso | Implementadas las 9 fases a nivel de código: cripta, lista blanca, checkpoint, motor autoritativo, protocolo `mg2-*`, HUD, cámara cerrada y retorno al mausoleo. `crypt:check`, `check`, `lint`, `build` y `tsc` pasan; el flujo del motor se probó con tiempos simulados (conteo, recogida, depósito, derrota, victoria, expulsión y suelte de cráneos) y con un cliente WebSocket real contra un servidor temporal (conteo, unión, posiciones y salida). Añadida entrada tardía en `(21.3, -7.98, 50.0)`, reloj de servidor en el HUD y leyenda de zonas. Pendiente la prueba manual con dos navegadores de §8 y confirmar las preguntas abiertas.                                                            |
| 2026-11-01 | en-progreso | Corregida la física de las momias: el servidor envía la altura de los pies y el cliente colocaba el centro de la cápsula en esa altura, por lo que quedaba enterrada ~0.95 m, se atascaba contra el suelo y el controlador trepaba al detectar jugadores (colliders "volando" con `?physics=1`). Ahora el cuerpo se coloca en `pies + 0.95`, se aplica gravedad y `snapToGround`, el cliente reporta pies (no centro) y el servidor recorta `y` a la banda del suelo, limita el cambio vertical por reporte, acota `x/z` a la zona de cada momia y baja la velocidad máxima aceptada a 3 m/s. Verificado en navegador: las 5 momias patrullan, persiguen y matan con `y ≈ -7.95` estable, sin saltos ni vuelos. |
| 2026-11-02 | en-progreso | Corregida la rotación remota: `CryptSession` enviaba `playerState.cameraYaw` (giro de cámara) en `mg2-position`, así que los avatares remotos no giraban al caminar con WASD. Ahora se publica `playerState.facingYaw` desde `PlayerBehaviour` y se envía ese yaw. Desplegado como v1.11.2 pública a las 22:55 UTC; room `UUZXH2` en 1.11.2 sin errores. Pendiente validar con dos cuentas dentro de la cripta.                                                                                                                                                                                                                                                                                                 |
| 2026-11-04 | en-progreso | Audio de momias: al pasar a `chase` suena `monster_mummy_attack` y mientras persiguen a ≤ 24 m se mantiene un loop posicional `monster_mummy_idle`; al volver a `patrol`/`cooldown` o terminar la ronda se corta con fade. Sin cambios de servidor.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-11-04 | en-progreso | Momias más agresivas: detección a 9 m, patrulla 1.2 m/s, persecución 2.4 m/s y contacto 1.1 m; el servidor sigue limitando la velocidad reportada a 3.0 m/s.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-11-11 | en-progreso | Rotación del avatar en FP: la cámara mantiene exactamente el ratón con pointer lock/arrastre de siempre; lo que cambia es que `facingYaw` (y por tanto el modelo y `mg2-position`) sigue el yaw de la cámara (`θ + π`) cada frame, así que el personaje gira con la vista incluso parado. En tercera persona el jugador se sigue orientando con `A`/`D`. `prettier`, `svelte-check` y `build` en verde. Pendiente prueba manual con dos navegadores.                                                                                                                                                                                                                                                            |
| 2026-11-04 | en-progreso | Ajuste de combate y recolección: 10 cráneos (dos por zona), salud de 100 HP con 25 de daño por contacto, 1 s de invulnerabilidad y regeneración de 8 HP/s tras 6 s; los rollos de papel aturden 5 s (`mg2-stun`, `stunned`, `MU_hit`/`MU_injured`). Añadidos `hp`/`maxHp` y eventos `player-hurt`/`mummy-stunned` al protocolo, HUD con barra de vida y contador `/10`. Cámara FP adelantada 0.55 m con recorte por muro. Verificación automática del 2026-11-04: `check`, `lint`, `build`, `tsc --noEmit` (frontend y backend) y `crypt:check` en verde. Pendiente la prueba manual.                                                                                                                           |

## 13. Changelog

- 2026-11-11 — **Corregida la cabeza en primera persona al caminar**: la
  cámara interpolaba su objetivo (15 %/frame) mientras el avatar se ajustaba a
  la física sin retardo, así que al correr la cabeza se adelantaba ~0.5 m y se
  veía su interior. En FP el objetivo ahora copia la posición del cuerpo
  (`positionSnap`) y el adelanto sube de 0.55 a 0.7 m para cubrir la inclinación
  de las animaciones de caminar/correr.
- 2026-11-11 — **Rotación del avatar en primera persona**: la cámara sigue
  girando siempre con el ratón (pointer lock y arrastre sin cambios), pero en
  la cripta el `facingYaw` del avatar sigue el yaw de la cámara cada frame, de
  modo que el personaje gira con la vista y los remotos lo ven hacerlo. En
  tercera persona el jugador se sigue orientando con `A`/`D`; no se toca el
  control de cámara de combate ni de conducción.
- 2026-11-11 — Cuenta atrás de espera reducida de 60 s a 30 s para unificar
  todos los minijuegos. La duración de la ronda (300 s) no cambia.
- 2026-11-05 — **Checkpoint centrado en la puerta**: `minigame-2` pasa de
  `(23.05, 0.30, 35.50)` a `(21.48, 0.30, 35.50)` y `MAUSOLEUM_EXIT` de
  `x = 23.05` a `21.48`. El GLB actual tiene el mausoleo en
  `x ∈ [18.88, 24.08]` y la puerta de hierro en `x ∈ [20.48, 22.48]`, así que
  `21.48` es el centro exacto de la entrada; antes el portal quedaba 1.57 m
  desplazado a la derecha. También se corrigen la BBox del spec y las
  referencias de `SPEC-015`.
- 2026-11-04 — Momias más agresivas: el radio de detección pasa de 6 a 9 m,
  la patrulla de 1.0 a 1.2 m/s, la persecución de 1.8 a 2.4 m/s y el radio de
  contacto de 1.0 a 1.1 m. Se mantiene el límite de validación del servidor
  (`MUMMY_MAX_SPEED = 3.0 m/s`).
- 2026-11-04 — Salud y aturdido: las momias ya no matan de un toque; restan
  25 HP con 1 s de invulnerabilidad y la salud se regenera a 8 HP/s tras 6 s
  sin daño. Los rollos de papel dejan a la momia `stunned` 5 s (`mg2-stun`,
  validado por el servidor) y el cliente reproduce `MU_hit` y luego
  `MU_injured`. Se pasa de 5 a 10 cráneos (dos por zona), el HUD muestra la
  vida y el contador `/10`, y la cámara FP se adelanta 0.55 m respecto a la
  cabeza con recorte por muro.
- 2026-11-04 — Audio de persecución: las momias gruñen al entrar en `chase`
  y mantienen un loop cercano mientras persiguen; se apaga con fade al perder
  al jugador. Reutiliza las recetas de `monster_mummy_*` de SPEC-024.
- 2026-11-02 — Recompensa local: ganar la ronda registra `crypt-5-skulls` en
  `rw:missions:v1` y desbloquea la skin `mummy` (antes gratuita). La victoria
  sigue siendo autoritativa del servidor; el cliente solo persiste el resultado
  y muestra el banner con `Equip Mummy` en `RoundOverlay`. No hay cambios de
  backend ni de WebSocket.
- 2026-11-02 — Carga bajo demanda: `game2.glb` sale del precargador base y se
  resuelve con `useGltf` al entrar a la cripta. Se añade `CryptLoadingOverlay`
  mientras el GLTF y `worldState` no están listos; las físicas ya eran lazy y
  los colliders se liberan al desmontar la escena.
- 2026-10-31 — Creación del spec: cripta de `game2.glb`, 5 cráneos, 5 momias,
  depósito en `A4C_Tombs`, checkpoint delante de `CCC_Mausoleum`, contrato
  WebSocket `mg2-*`, lista blanca de colisiones, cámara cerrada y plan en 9
  fases.
- 2026-10-31 — Implementación completa a nivel de código. Motor autoritativo
  con tick de 100 ms, protocolo `mg2-*`, HUD, escena de cripta, cámara cerrada
  y retorno al mausoleo. Correcciones de esta sesión: entrada tardía en el
  descanso de la escalera `(21.3, -7.98, 50.0)`, sincronización del primer
  snapshot antes de habilitar `mg2-positions`, congelación segura con snapshot
  nulo, vaciado de la cola de salto, reloj estimado del servidor en el HUD,
  leyenda de zonas, validación de velocidad más estricta, publicación de
  errores de sala y colocación táctil del aviso de depósito. `crypt:check`,
  `check`, `lint`, `build` y `tsc --noEmit` pasan; flujos de conteo, recogida,
  depósito, derrota, victoria, expulsión y suelte de cráneos probados con
  tiempos simulados, más una prueba de integración WebSocket con dos clientes
  (unión, conteo, posiciones y salida). Pendiente la prueba manual con dos
  navegadores.
- 2026-11-01 — Corregido el reparto de jugadores entre procesos: Elysia activa
  `reusePort` por defecto, así que dos instancias del backend podían escuchar
  el mismo puerto 3000 y dividir presencia, salas y contadores. Ahora
  `.listen({ port, reusePort: false })` hace que la segunda instancia falle
  con `EADDRINUSE`. También se mataron las instancias duplicadas que dejaban
  jugadores fantasma y hacían que con 2+ jugadores los contadores no
  cuadraran.
- 2026-11-01 — Corregida la física de las momias. El cliente trataba la `y`
  del servidor (altura de los pies) como centro de la cápsula, enterrándola
  0.95 m: el controlador no las movía o trepaba para salir y los colliders
  “volaban” al detectar jugadores en `?physics=1`. Ahora se usa
  `BODY_CENTER_Y = 0.95`, hay gravedad y `snapToGround`, el conductor reporta
  los pies y el servidor recorta `y` a `[-8.4, -7.3]`, limita el cambio
  vertical a 0.35 m por reporte, acota `x/z` a la zona y acepta como máximo
  3 m/s. Verificado en navegador con las cinco momias patrullando,
  persiguiendo y matando sin elevarse.
- 2026-11-02 — Corregida la rotación de los jugadores remotos. `mg2-position`
  enviaba `cameraYaw` (la cámara) en lugar de la orientación del avatar; al
  caminar con WASD el modelo local giraba pero los demás clientes lo veían
  fijo. `PlayerBehaviour` publica ahora `playerState.facingYaw` y
  `CryptSession` la envía. Desplegado en la v1.11.2 pública y verificado el
  arranque de la room `UUZXH2` sin errores.
