---
id: SPEC-010
titulo: "Minijuego 1: escapar de la casa de 5 pisos con 5 llaves"
estado: borrador
prioridad: alta
creado: 2026-10-31
actualizado: 2026-11-11
responsable: opencode
etiquetas: [minijuego, multijugador, websocket, svelte, threlte, rapier, gltf, interior, llaves, brujas, temporizador, servidor-autoritativo]
depende_de: [SPEC-002, SPEC-003, SPEC-005, SPEC-009]
bloquea: []
estimacion: "36h"
---

# SPEC-010 — Minijuego 1: escapar de la casa de 5 pisos con 5 llaves

## 1. Contexto

`SPEC-005` dejó tres checkpoints físicos que permiten entrar y salir de
`minigame-1`, `minigame-2` y `minigame-3`. Hoy esos mini lobbies solo cambian
la pertenencia del jugador en `presence`; no tienen reglas, mapa propio ni
estado de partida. `minigame-1` existe en el protocolo y en la UI, pero entrar
en él no cambia nada de la escena.

`SPEC-009` añadió el mapa exterior (`map.glb`) con físicas selectivas, el
controlador cinemático y la reaparición. Sobre esa base ya se puede construir
una sala de juego real, pero el interior de la casa no está montado: la escena
solo renderiza `Map`, `Checkpoints`, `Lighting`, `Sky` y `Player`.

El usuario aportó `frontend/static/Whi_Interior.glb`, la casa embrujada
completa. El archivo se midió al redactar este spec:

| Dato | Valor |
| ---- | ----- |
| Tamaño | 3 917 300 bytes (~3.9 MB) |
| Nodos | 2 509 |
| Mallas | 2 509 |
| Primitivas | 2 519 |
| Triángulos totales | 46 522 |
| Materiales | 51 |
| Animaciones | 0 |
| Raíces de escena | 2 487 mallas sueltas (sin un nodo raíz común) |
| Luces embebidas | 0 |

La casa tiene cinco superficies jugables reales, no cuatro más un sótano
decorativo. Los nodos `WHI_Floor_*` y las escaleras `WHI_Stair_*` definen la
altura de cada planta:

| # | Piso | Superficie `y` | Nodos de suelo | Escalera de acceso |
| - | ---- | -------------- | -------------- | ------------------ |
| 0 | Sótano | `-2.60` | `WHI_Floor_Basement_01` | `WHI_Stair_Base_*` |
| 1 | Planta baja | `0.00` | `WHI_Floor_Ground_01`–`04` | `WHI_Stair_G_F1_*` |
| 2 | Piso 1 | `2.60` | `WHI_Floor_F1_01`–`04` | `WHI_Stair_F1_F2_*` |
| 3 | Piso 2 | `5.20` | `WHI_Floor_F2_01`–`04` | `WHI_Stair_F2_F3_*` |
| 4 | Piso 3 / ático | `7.80` | `WHI_Floor_F3_01`–`04` | — (última planta) |

La casa es un laberinto vertical: el sótano tiene el altar ritual, la planta
baja la puerta principal, cocina, comedor y salón; el piso 1 tiene estudio y
habitación de invitados; el piso 2 la habitación principal y baños; el ático
el altar y las jaulas. Es un escenario natural para una huida cooperativa.

La experiencia buscada es la de un *escape room* multijugador: el equipo entra,
espera un conteo, se dispersa por las cinco plantas, encuentra cinco llaves,
las lleva a la puerta principal y escapa antes de cinco minutos mientras las
brujas patrullan. Perder una llave o morir tiene consecuencias para todo el
equipo, no solo para el jugador afectado.

## 2. Objetivo

Convertir `minigame-1` en una partida cooperativa para grupos de hasta 8
jugadores dentro de `Whi_Interior.glb`: al menos un jugador dentro inicia un
conteo de 30 s; después
el equipo dispone de 300 s para recoger exactamente 5 llaves —una por planta— y
depositarlas en la puerta principal, esquivando una bruja por planta, con todo
el estado autorizado por el servidor y sincronizado por WebSocket.

## 3. Alcance

**Incluye**

- Montar `Whi_Interior.glb` como escena jugable de `minigame-1`, con
  iluminación propia y cambio de escena al entrar/salir.
- Física Rapier selectiva del interior mediante lista blanca versionada.
- Entrada al minijuego desde el checkpoint existente de `minigame-1`.
- Máquina de estados de sala: `idle → countdown → playing → won/lost → idle`.
- Conteo de 30 s que bloquea el movimiento hasta `playing`.
- Ronda de 300 s con derrota global al agotarse.
- Exactamente 5 llaves, una por planta, con posiciones fijas.
- Recogida automática, transporte por jugador y depósito en la puerta.
- Contador por jugador y contador de equipo en el HUD.
- 5 brujas, una por planta, con patrulla, persecución, muerte y retorno al
  lobby global.
- Autoridad del servidor sobre fases, tiempos, llaves, depósitos, muertes y
  brujas; el cliente solo reporta su posición.
- Sincronización de estado, posiciones y eventos por WebSocket a todos los
  jugadores del lobby.
- Sincronización visual de jugadores remotos y brujas con interpolación.
- Manejo de jugadores que se van, se desconectan, mueren o entran a mitad de
  ronda.
- Verificación de tipos, lint, build y lista blanca de colisiones.

**No incluye**

- Modelar, animar o reexportar la casa, las brujas o los personajes.
- Físicas dinámicas para muebles (nada se empuja ni se cae).
- Navmesh o pathfinding: las brujas patrullan waypoints y persiguen en línea
  recta con límites de zona.
- Abrir físicamente la puerta principal. El depósito ocurre en el umbral; la
  hoja puede quedarse cerrada o abrirse solo como efecto visual.
- Inventario, objetos consumibles, salud, combate o armas.
- Varias salas simultáneas de `minigame-1`: hay una sola instancia por lobby.
- Persistencia de partidas si el backend se reinicia.
- Anti-cheat fuerte. El servidor valida rangos y ritmo, pero confía en la
  posición reportada para movimiento y recogida.
- Chat específico de la partida (se sigue usando el chat global de `SPEC-004`).
- Cambios en `minigame-2` o `minigame-3`.

## 4. Requisitos

### Funcionales

| ID | Requisito | Prioridad |
| -- | --------- | --------- |
| RF-1 | `frontend/static/Whi_Interior.glb` se sirve como `/Whi_Interior.glb` y `Interior.svelte` se genera con `@threlte/gltf` conservando nombres y jerarquía de mallas. | alta |
| RF-2 | `Scene.svelte` monta el interior y oculta el mapa exterior, los checkpoints y `Sky` cuando `lobby.self?.lobbyId === 'minigame-1'`; al salir restaura exactamente la escena exterior. | alta |
| RF-3 | El interior tiene iluminación propia (hemisférica tenue + luz lunar direccional + una luz por planta) y se ve sin depender de luces embebidas, que no existen en el GLB. | alta |
| RF-4 | Solo los nodos de `interior-colliders.json` reciben colisionador. El resto no crea cuerpo ni collider. | alta |
| RF-5 | Tienen colisión: suelos de las 5 plantas, muros exteriores e interiores, ventanas, marcos de puertas, hoja de la puerta principal, escaleras, barandillas, camas, sillas/mecedoras/tronos/sillones, mesas/escritorios/mesitas/aparadores/encimeras, armarios, estanterías, bañera/lavabo/inodoro, cocina, chimenea y porche. | alta |
| RF-6 | No tienen colisión: hojas de puertas interiores, pomos, velas, llamas, brillos, cera, libros, telarañas, alfombras, cuadros, apliques, calaveras sueltas, decoración pequeña, doll/cat y objetos de mesa. | alta |
| RF-7 | Las hojas de las puertas interiores se ocultan visualmente para no bloquear el paso; la hoja de `WHI_Door_Front_Slab` se conserva. | alta |
| RF-8 | La creación de colliders del interior no supera 20 000 triángulos y tarda menos de 500 ms en un portátil de gama media. | alta |
| RF-9 | Al entrar en `minigame-1` con la sala en `idle`, el servidor inicia `countdown` de 30 000 ms. | alta |
| RF-10 | Durante `countdown` los jugadores aparecen en el vestíbulo `(0, 0.05, 3.1)`, pueden mirar y usar el chat, pero no desplazarse, saltar ni ser matados. | alta |
| RF-11 | Al terminar el conteo, la sala pasa a `playing`, se colocan las 5 llaves y las brujas, y el movimiento se desbloquea para todos. | alta |
| RF-12 | `playing` dura exactamente 300 000 ms desde su inicio; el HUD muestra el tiempo restante con formato `m:ss`. | alta |
| RF-13 | Hay exactamente 5 llaves, una por planta, en las posiciones de la tabla de §11. No hay llaves extra ni aleatorias. | alta |
| RF-14 | Una llave se recoge automáticamente cuando un jugador vivo está a ≤ 1.25 m de ella y no está depositada ni en cooldown. | alta |
| RF-15 | Cualquier jugador puede llevar varias llaves; no hay límite de carga. | alta |
| RF-16 | Un jugador deposita todas sus llaves al pulsar `E` a ≤ 1.8 m de la puerta principal `(0, 0, 4.0)`. | alta |
| RF-17 | El equipo gana en cuanto `depositedTotal === 5`, sin importar quién depositó la última. | alta |
| RF-18 | Si el temporizador llega a 0 con menos de 5 llaves depositadas, el equipo pierde. | alta |
| RF-19 | Al ganar o perder, la sala pasa a `won`/`lost` durante 8 000 ms, muestra el resultado y devuelve a todos a `global`. | alta |
| RF-20 | Hay una bruja por planta, con patrulla entre waypoints, persecución a ≤ 7 m, velocidad de patrulla 1.2 m/s y de persecución 2.2 m/s, y radio de muerte 1.1 m. | alta |
| RF-21 | Una bruja solo mata a jugadores de su misma planta (diferencia vertical ≤ 1.2 m). La muerte es instantánea, sin salud. | alta |
| RF-22 | Al morir, el jugador suelta todas sus llaves en su última posición válida, queda en estado `dead` 2 500 ms y luego es devuelto a `global`. | alta |
| RF-23 | Las llaves soltadas quedan bloqueadas 2 000 ms antes de poder recogerse de nuevo. | alta |
| RF-24 | Si un jugador sale del lobby, se desconecta o cierra la pestaña, suelta sus llaves igual que al morir y el resto de la sala sigue. | alta |
| RF-25 | Si no queda ningún jugador en `minigame-1` durante `countdown`, `playing`, `won` o `lost`, la sala vuelve a `idle` y se limpian llaves, brujas y temporizadores. | alta |
| RF-26 | Se puede entrar a mitad de `countdown` o `playing`: el jugador aparece en el vestíbulo con 0 llaves y sin reiniciar la ronda. | media |
| RF-27 | El HUD muestra: fase, tiempo restante, llaves del equipo `n/5`, llaves transportadas por el jugador y tabla de jugadores con `transportadas` y `depositadas`. | alta |
| RF-28 | El servidor emite `mg1-state` completo al entrar, al cambiar de fase, al cambiar llaves/depósitos y cada 1 000 ms; emite `mg1-positions` a 10 Hz; emite `mg1-event` por cada evento relevante. | alta |
| RF-29 | El cliente envía `mg1-position` como máximo a 10 Hz mientras está en `minigame-1` y solo con números finitos. | alta |
| RF-30 | El servidor rechaza posiciones no finitas, las acota al volumen del interior (`x,z ∈ [-20, 20]`, `y ∈ [-4, 12]`) y limita el ritmo a 15 mensajes/s por jugador. | alta |
| RF-31 | Los jugadores remotos y las brujas se interpolan con un búfer de 150 ms; no se teletransportan entre paquetes. | media |
| RF-32 | El cliente muestra un aviso claro de muerte y de resultado, y desbloquea el movimiento al volver a `global`. | alta |
| RF-33 | `?physics=1` muestra también los colliders del interior cuando la escena activa es `minigame-1`. | media |
| RF-34 | `bun run interior:check` valida nombres, exclusiones y presupuesto de triángulos del interior contra el GLB. | media |
| RF-35 | Regenerar `Interior.svelte` con `interior:build` vuelve a inyectar los colliders y el ocultado de puertas; no se edita a mano. | media |

### No funcionales

| ID | Requisito | Criterio |
| -- | --------- | -------- |
| RNF-1 | Presupuesto de colisión | ≤ 20 000 triángulos de collider del interior; la estimación inicial con la lista propuesta está entre 12 000 y 15 000. |
| RNF-2 | Carga del interior | GLB descargado una sola vez; colliders listos en < 500 ms tras el primer montaje. |
| RNF-3 | Rendimiento | 60 fps con 8 jugadores, 5 brujas y el interior completo en un portátil de gama media. |
| RNF-4 | Latencia percibida | Las posiciones remotas se ven con ≤ 250 ms de retraso visual gracias a la interpolación. |
| RNF-5 | Tráfico | `mg1-positions` ≤ 4 KB por tick para 8 jugadores; estado completo ≤ 8 KB. |
| RNF-6 | Determinismo | Mismas posiciones iniciales de llaves y brujas en cada ronda. |
| RNF-7 | Autoridad | El cliente nunca decide recogidas, depósitos, muertes, fases ni tiempos. |
| RNF-8 | Tipado | `bun run check` y `bunx tsc --noEmit` pasan sin errores. |
| RNF-9 | Formato | `bun run lint` pasa en los archivos nuevos y modificados. |
| RNF-10 | SSR seguro | Todo el código de Rapier/GLTF vive dentro de `<Canvas>` o de un `$effect`; nada toca `window` en SSR. |
| RNF-11 | Aislamiento | El estado de `minigame-1` no altera `minigame-2`, `minigame-3`, el chat ni la presencia global. |
| RNF-12 | Recuperación | Un error del servidor de sala no tumba el WebSocket: se emite `error` y la sala se reinicia a `idle`. |
| RNF-13 | Accesibilidad | El HUD no bloquea el chat ni los controles táctiles; el aviso de depósito también funciona con el botón táctil `E`. |

## 5. Criterios de aceptación

- [ ] CA-1: `Whi_Interior.glb` existe, `Interior.svelte` se genera con `interior:build` y su cabecera apunta a `/Whi_Interior.glb`.
- [ ] CA-2: Al entrar en `minigame-1`, desaparecen el mapa exterior, los checkpoints y el cielo; aparece el interior con iluminación propia.
- [ ] CA-3: Al salir a `global`, el mapa exterior vuelve exactamente a su estado anterior y el jugador reaparece en `(0, 0.4, 12)`.
- [ ] CA-4: `bun run interior:check` informa ≤ 20 000 triángulos, sin nombres desconocidos y con las exclusiones aplicadas (la exclusión gana sobre la inclusión).
- [ ] CA-5: Con `?physics=1` se ven los colliders del interior y no los del mapa exterior.
- [ ] CA-6: El jugador recorre las cinco plantas por las escaleras y no atraviesa suelos, muros, barandillas ni muebles de la lista blanca.
- [ ] CA-7: Las hojas de puertas interiores no bloquean; la puerta principal sí tiene colisión y el depósito funciona a su alrededor.
- [ ] CA-8: El primer jugador que entra inicia un conteo visible de 30 s; durante el conteo nadie se mueve.
- [ ] CA-9: Al terminar el conteo, el movimiento se desbloquea para todos y aparecen las 5 llaves y las 5 brujas.
- [ ] CA-10: El HUD muestra el tiempo restante y baja de `5:00` a `0:00` en 300 s.
- [ ] CA-11: Hay exactamente 5 llaves y cada una está en su planta y coordenada de la tabla.
- [ ] CA-12: Acercarse a una llave la recoge automáticamente y el contador del jugador sube.
- [ ] CA-13: `E` cerca de la puerta deposita todas las llaves transportadas y el contador de equipo sube.
- [ ] CA-14: Al depositar la quinta llave, todos ven “¡Escapasteis!” y vuelven a `global` tras 8 s.
- [ ] CA-15: Al agotarse el tiempo con menos de 5 llaves, todos ven “La casa os ha atrapado” y vuelven a `global`.
- [ ] CA-16: Una bruja patrulla, detecta a un jugador a ≤ 7 m, lo persigue y lo mata al tocarlo.
- [ ] CA-17: Morir muestra el aviso, suelta las llaves en el suelo y devuelve al jugador a `global` tras 2.5 s.
- [ ] CA-18: Las llaves soltadas no se pueden recoger hasta pasados 2 s.
- [ ] CA-19: Si el jugador que muere llevaba llaves, el equipo puede recuperarlas; si se desconecta, ocurre lo mismo.
- [ ] CA-20: Un segundo jugador que entra a mitad de ronda aparece en el vestíbulo, no reinicia el conteo y ve el estado actual.
- [ ] CA-21: Si todos salen durante la partida, la sala vuelve a `idle`; al volver a entrar empieza un conteo nuevo.
- [ ] CA-22: La tabla del HUD muestra, por jugador, llaves transportadas y depositadas, actualizada en ≤ 1 s.
- [ ] CA-23: Dos navegadores ven las mismas llaves, brujas, tiempos y contadores.
- [ ] CA-24: Los jugadores remotos se mueven de forma fluida, sin saltos visibles entre paquetes.
- [ ] CA-25: `bun run check`, `bun run lint`, `bun run build` y `bunx tsc --noEmit` pasan.
- [ ] CA-26: Regenerar `Interior.svelte` y recargar no duplica colliders ni rompe el ocultado de puertas.

## 6. Archivos relevantes

| Ruta | Acción | Motivo |
| ---- | ------ | ------ |
| `frontend/static/Whi_Interior.glb` | aportar (usuario) | Interior completo de la casa; se sirve como `/Whi_Interior.glb`. |
| `frontend/src/lib/components/world/Interior.svelte` | crear (generado) | Componente `@threlte/gltf` con la casa y los `AutoColliders` inyectados. |
| `frontend/src/lib/components/world/interior-colliders.json` | crear | Única fuente de verdad de nodos con colisión y nodos ocultos. |
| `frontend/scripts/build-interior.sh` | crear | Genera `Interior.svelte`, lo mueve, inyecta colliders y aplica Prettier. |
| `frontend/scripts/inject-interior-colliders.mjs` | crear | Envuelve los nodos de la lista blanca y oculta las hojas de puertas interiores. |
| `frontend/scripts/verify-interior-colliders.mjs` | crear | Valida nombres, exclusiones y presupuesto de triángulos. |
| `frontend/src/lib/components/world/InteriorLighting.svelte` | crear | Iluminación del interior (hemisférica, lunar y una luz por planta). |
| `frontend/src/lib/components/minigame1/Keys.svelte` | crear | Render de las 5 llaves y su estado (disponible, transportada, depositada). |
| `frontend/src/lib/components/minigame1/Witches.svelte` | crear | Render interpolado de las 5 brujas. |
| `frontend/src/lib/components/minigame1/RemotePlayers.svelte` | crear | Sprites de jugadores remotos con nombre y llaves transportadas. |
| `frontend/src/lib/components/minigame1/DepositZone.svelte` | crear | Marca visual del umbral de la puerta y aviso de `E`. |
| `frontend/src/lib/components/minigame1/Minijuego1Hud.svelte` | crear | Temporizador, contadores, tabla de equipo y avisos de fase. |
| `frontend/src/lib/components/minigame1/RoundOverlay.svelte` | crear | Pantallas de conteo, muerte y resultado. |
| `frontend/src/lib/state/minigame1.svelte.ts` | crear | Espejo del estado del servidor, interpolación y acciones del cliente. |
| `frontend/src/lib/state/interiorState.svelte.ts` | crear | `ready`, métricas y estado de la escena interior. |
| `frontend/src/lib/Scene.svelte` | modificar | Montaje condicional exterior/interior y `InteriorLighting`. |
| `frontend/src/lib/components/player/PlayerCollider.svelte` | modificar | Spawn según escena activa, bloqueo de movimiento y reporte de posición. |
| `frontend/src/lib/state/playerState.ts` | modificar | Añadir spawn interior y `frozen`; documentar el cambio de origen. |
| `frontend/src/lib/services/protocol.ts` | modificar | Tipos y guardas de los mensajes `mg1-*`. |
| `frontend/src/lib/services/lobbySocket.ts` | modificar | Callbacks y envío de los mensajes `mg1-*`. |
| `frontend/src/lib/state/lobby.svelte.ts` | modificar | Conectar/desconectar la sala al entrar/salir de `minigame-1`. |
| `frontend/src/lib/components/ui/CheckpointPrompt.svelte` | sin cambios | La entrada sigue usando `E`; el prompt ya existe. |
| `frontend/package.json` | modificar | Scripts `interior:build` e `interior:check`. |
| `backend/src/ws/minigame1.ts` | crear | Motor de sala: fases, llaves, brujas, muertes y depósitos. |
| `backend/src/ws/protocol.ts` | modificar | Esquemas Zod y tipos de los mensajes `mg1-*`. |
| `backend/src/index.ts` | modificar | Enrutar mensajes, suscribir al topic de la sala y manejar salidas/cierre. |
| `backend/src/ws/presence.ts` | sin cambios | La pertenencia al lobby ya se gestiona aquí. |
| `specs/SPEC-010-minijuego-1-llaves-casa-5-pisos.md` | crear | Este spec. |

## 7. Plan de implementación

### Fase 0 — Preparar el interior

- [ ] Paso 1: Confirmar que `frontend/static/Whi_Interior.glb` existe y empieza por la firma `glTF`; registrar tamaño, fecha y hash.
- [ ] Paso 2: Crear `frontend/scripts/build-interior.sh` con
  `npx @threlte/gltf@latest Whi_Interior.glb -K -k -d "https://www.gstatic.com/draco/versioned/decoders/1.4.3/"`
  desde `frontend/static`, mover el resultado a
  `frontend/src/lib/components/world/Interior.svelte` y pasar Prettier.
- [ ] Paso 3: Añadir a `frontend/package.json`:
  ```json
  "interior:build": "bash scripts/build-interior.sh",
  "interior:check": "node scripts/verify-interior-colliders.mjs"
  ```
- [ ] Paso 4: Ejecutar `bun run interior:build` y comprobar que la cabecera apunta a `/Whi_Interior.glb` y que no se editó el cuerpo generado a mano.
- [ ] Paso 5: Añadir parches mínimos al generado solo si el tipado lo exige (`cloneScene`, props por defecto), igual que en `Map.svelte`.

### Fase 1 — Lista blanca y verificador del interior

- [ ] Paso 1: Crear `interior-colliders.json` con grupos `suelos`, `muros`,
  `ventanas`, `puertas`, `escaleras`, `barandillas`, `muebles`, `bano`,
  `cocina`, `chimenea`, `porche` y una lista `exclude` explícita.
- [ ] Paso 2: Incluir en `include` los prefijos de §11 y en `exclude` los
  patrones `*Flame*`, `*Glow*`, `*Wax*`, `*Web*`, `*Stain*`, `*Rug*`,
  `*Portrait*`, `*Sconce*`, `*Candles*`, `*Chandelier*`, `*Candelabra*`,
  `*_Book_*`, `*Doll*`, `*Jar*`, `*Bottle*`, `*Plate*`, `*Herbs*`,
  `*Draw*`, `*Mirror*`, `*Lantern*`, `*Brazier*`, `*Cage*`, `*Circle*`,
  `*Crystal*`, `*Eye_*`, `*Hand_*`, `*Noose*`, `*Cat*`, `*Cauldron*` y
  las hojas de puertas interiores.
- [ ] Paso 3: Escribir `verify-interior-colliders.mjs` con solo Node (`fs`,
  `path`): leer el chunk JSON del GLB, recorrer nodos y mallas, sumar
  triángulos por primitiva y comparar con la lista blanca.
- [ ] Paso 4: El script falla con código 1 si un nombre no existe o si se
  superan 20 000 triángulos. La lista `exclude` tiene prioridad sobre
  `include`: un nodo que coincide con ambas nunca recibe collider y no se
  considera un error.
- [ ] Paso 5: Ejecutar `bun run interior:check` y guardar nodos, mallas,
  primitivas y triángulos en §12.

### Fase 2 — Montaje, iluminación y cambio de escena

- [ ] Paso 1: Implementar `interiorState.svelte.ts` con `ready`, `nodes`,
  `triangles` y `active` (derivado de `lobby.self.lobbyId === 'minigame-1'`).
- [ ] Paso 2: Crear `InteriorLighting.svelte`: `HemisphereLight` tenue, una
  `DirectionalLight` fría como luna y cinco `PointLight` (una por planta) sin
  sombras, más una luz cálida de emergencia en el vestíbulo.
- [ ] Paso 3: En `Scene.svelte`, montar `{#if interior.active}<Interior /> ... {:else}<Map /> ...{/if}`.
  Mantener `Player`, `ThirdPersonCamera` y los overlays siempre montados.
- [ ] Paso 4: Ocultar `Checkpoints` y `Sky` dentro del interior; conservar
  `Checkpoints` en el exterior.
- [ ] Paso 5: Verificar que desmontar `Map` elimina sus colliders del mundo
  Rapier y que volver a montarlo no duplica cuerpos. Si Threlte no los libera,
  forzar `world.removeRigidBody` en el `onDestroy` del componente.
- [ ] Paso 6: Medir el tiempo hasta `interiorState.ready` y registrarlo en
  consola solo en desarrollo (`[interior] física lista`).

### Fase 3 — Física selectiva del interior

- [ ] Paso 1: Implementar `inject-interior-colliders.mjs`; lee
  `interior-colliders.json`, localiza cada bloque del `Interior.svelte` y lo
  envuelve en `<AutoColliders shape="trimesh" friction={0.9} restitution={0}>`.
- [ ] Paso 2: Para grupos con muchas mallas (suelos, muros, escaleras),
  envolver el bloque contenedor si existe; si el generado las deja sueltas,
  agrupar por prefijo en el inyector antes de envolver.
- [ ] Paso 3: Añadir al inyector el ocultado de las hojas de puertas
  interiores (`WHI_Door_*_Slab` salvo `WHI_Door_Front_Slab`) mediante
  `visible={false}` en el nodo, sin borrar la geometría.
- [ ] Paso 4: Marcar `interiorState.ready = true` en el `oncreate` del primer
  `AutoColliders` de suelo, cuando los trimeshes ya existen.
- [ ] Paso 5: Verificar que las escaleras tienen colisión continua y que el
  *autostep* de 0.5 m de `SPEC-009` sube los escalones sin saltar.
- [ ] Paso 6: Añadir el `<Debug />` de `@threlte/rapier` cuando `?physics=1`.

### Fase 4 — Protocolo y motor de sala en el backend

- [ ] Paso 1: Extender `backend/src/ws/protocol.ts` con los esquemas Zod y los
  tipos de §11.3. Mantener `parseClientMessage` como única puerta de entrada.
- [ ] Paso 2: Crear `backend/src/ws/minigame1.ts` con una única instancia de
  sala y esta API pública:
  ```ts
  type Mg1Phase = 'idle' | 'countdown' | 'playing' | 'won' | 'lost';
  type Mg1Player = {
    id: string; name: string; keysCarried: number; keysDeposited: number;
    alive: boolean; floor: number; x: number; y: number; z: number; yaw: number;
    lastPositionAt: number;
  };
  type Mg1Key = {
    id: string; floor: number; x: number; y: number; z: number;
    state: 'available' | 'carried' | 'deposited' | 'dropped';
    carrierId: string | null; pickupAfter: number;
  };
  type Mg1Witch = {
    id: string; floor: number; x: number; y: number; z: number; yaw: number;
    state: 'patrol' | 'chase' | 'cooldown'; waypoint: number;
  };
  ```
- [ ] Paso 3: Implementar `onEnter(playerId)`, `onLeave(playerId)`,
  `onPosition(playerId, x, y, z, yaw)` y `tick(now)`.
- [ ] Paso 4: `onEnter` añade al jugador con 0 llaves y posición de vestíbulo;
  si la fase es `idle`, arranca `countdown` a 30 000 ms.
- [ ] Paso 5: `onLeave` suelta llaves, elimina al jugador y, si la sala queda
  vacía en `countdown`/`playing`, resetea a `idle`.
- [ ] Paso 6: `tick` cada 100 ms actualiza fase y tiempos, mueve brujas,
  detecta recogidas, depósitos y muertes; difunde `mg1-positions` y, si cambió
  cualquier contador, un `mg1-state` inmediato además del heartbeat de 1 s.
- [ ] Paso 7: Implementar depósito: `E` solo se acepta si el jugador está en
  `playing`, vivo, a ≤ 1.8 m de `(0, 0, 4.0)` y lleva al menos una llave.
- [ ] Paso 8: Implementar `finish('won' | 'lost')`: fija `endsAt = now + 8000`,
  difunde estado y, al vencer, mueve a todos a `global` mediante un callback
  `sendToGlobal(playerId)` inyectado desde `index.ts` (que llama a `setLobby`
  y `broadcastPresence`); después resetea la sala.
- [ ] Paso 9: Proteger el motor contra excepciones con `try/catch` por tick:
  registrar, emitir `error` a la sala y resetear a `idle`.
- [ ] Paso 10: En `index.ts`, suscribir al entrar a `lobby:minigame-1` (ya se
  hace) y enrutar `mg1-position`/`mg1-deposit` a `minigame1.ts`; difundir
  `mg1-*` por `app.server?.publish('lobby:minigame-1', ...)`. Si el jugador
  cambia de lobby o usa `leave-lobby`, llamar antes a `onLeave` para soltar
  sus llaves.
- [ ] Paso 11: En `close(ws)`, llamar a `onLeave` antes de `removePlayer` para
  que las llaves se suelten con la última posición conocida.

### Fase 5 — Estado y movimiento en el cliente

- [ ] Paso 1: Implementar `minigame1.svelte.ts` con `snapshot`, `positions`,
  `events`, `interpolatedPlayers`, `interpolatedWitches` y `reset()`.
- [ ] Paso 2: En `lobbySocket.ts`, añadir `sendPosition`, `sendDeposit` y los
  callbacks `onMg1State`, `onMg1Positions`, `onMg1Event`.
- [ ] Paso 3: En `lobby.svelte.ts`, al recibir `welcome`/`presence`, activar o
  desactivar el reporte según `lobbyId`; al salir, llamar a `minigame1.reset()`.
- [ ] Paso 4: En `playerState.ts`, añadir `INTERIOR_SPAWN = { x: 0, y: 0.05, z: 3.1 }`
  y `frozen: boolean`.
- [ ] Paso 5: En `PlayerCollider.svelte`, elegir spawn y `ready` según la
  escena activa; mientras `frozen` o `!ready`, no aplicar desplazamiento ni
  gravedad, pero sí mantener la posición.
- [ ] Paso 6: Publicar `mg1-position` a 10 Hz con `x`, `y`, `z` y `yaw`
  mientras `interior.active`; usar un acumulador de tiempo, no un `setInterval`.
- [ ] Paso 7: Al morir o al ganar/perder, congelar el input y dejar que la
  transición la decida el servidor.
- [ ] Paso 8: Al volver a `global`, teletransportar a `PLAYER_SPAWN`, limpiar
  `frozen` y reiniciar la cámara si quedó dentro de la casa.

### Fase 6 — Presentación y HUD

- [ ] Paso 1: Crear `Keys.svelte`: llave dorada simple (o icono 3D) que flota
  y gira; las transportadas no se dibujan en el mundo; las depositadas se
  muestran junto a la puerta.
- [ ] Paso 2: Crear `Witches.svelte`: cápsula oscura de 1.8 m con ojos
  emisivos y sombrero simple como marcador provisional; interpolar a 10 Hz.
- [ ] Paso 3: Crear `RemotePlayers.svelte`: billboard con el atlas de
  `dude.png`, nombre encima y contador de llaves; interpolar con búfer de 150 ms.
- [ ] Paso 4: Crear `DepositZone.svelte`: aro en el umbral y prompt `E` cuando
  el jugador está cerca y lleva llaves.
- [ ] Paso 5: Crear `Minijuego1Hud.svelte` con temporizador, `Equipo n/5`,
  `Tus llaves: n`, tabla de jugadores y leyenda de plantas.
- [ ] Paso 6: Crear `RoundOverlay.svelte` para conteo (`30…0`), muerte
  (`Te ha atrapado una bruja`) y resultado (`¡Escapasteis!` / `La casa os ha
  atrapado`), con temporizador de retorno.
- [ ] Paso 7: Montar el HUD y los overlays en `Scene.svelte` solo cuando
  `interior.active`; no tapar `ChatOverlay` ni `MobileControls`.

### Fase 7 — Verificación y cierre

- [ ] Paso 1: Ejecutar `bun run interior:check`, `bun run check`,
  `bun run lint`, `bun run build` y `bunx tsc --noEmit`.
- [ ] Paso 2: Probar con dos navegadores los 26 criterios de §5.
- [ ] Paso 3: Medir FPS, tráfico y latencia con 8 pestañas simuladas.
- [ ] Paso 4: Actualizar este spec (`estado`, `actualizado`, Progreso,
  Changelog y checkboxes).
- [ ] Paso 5: Confirmar con el usuario las preguntas abiertas antes de
  considerar cerrada la implementación.

## 8. Verificación

```bash
# Frontend
cd frontend
bun run interior:check
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

Resultado esperado de `interior:check` con el GLB actual:

| Comprobación | Esperado |
| ------------ | -------- |
| Nodos del GLB | 2 509 |
| Mallas del GLB | 2 509 |
| Primitivas | 2 519 |
| Materiales | 51 |
| Animaciones | 0 |
| Nodos con collider | ~1 000–1 300 (el verificador fija el número exacto) |
| Triángulos de collider | ~12 000–15 000 |
| Triángulos totales | 46 522 |
| Presupuesto máximo | 20 000 |
| Hojas interiores ocultas | 9 (`Bath2`, `Child`, `Ensuite`, `Guest`, `Kitchen`, `KitchenPantry`, `Master`, `Pantry`, `Study`) |
| Puerta principal visible | 1 (`WHI_Door_Front_Slab`) |

Casos manuales:

1. **Entrada**: un jugador pisa el checkpoint de `minigame-1` en `(-6, 0, -6)`, pulsa `E` y aparece en el vestíbulo `(0, 0.05, 3.1)`.
2. **Conteo**: con un solo jugador dentro, el HUD muestra 30 s; intentar caminar, saltar y ser tocado por una bruja no tiene efecto.
3. **Inicio**: al llegar a 0, aparecen las 5 llaves y las 5 brujas; el movimiento se desbloquea.
4. **Plantas**: subir del sótano al ático por las cuatro escaleras; no se atraviesa ningún suelo ni barandilla.
5. **Llave del sótano**: recogerla en `(4.8, -2.0, -2.8)`; el contador personal sube a 1.
6. **Depósito**: bajar a la puerta con la llave y pulsar `E` en `(0, 0, 4.0)`; el equipo sube a `1/5`.
7. **Victoria**: depositar las 5 llaves entre varios jugadores; aparece “¡Escapasteis!” y a los 8 s todos vuelven a `global`.
8. **Derrota**: dejar que el temporizador llegue a 0 con 4 llaves; aparece “La casa os ha atrapado”.
9. **Bruja**: acercarse a una bruja; a ≤ 7 m empieza a perseguir y al tocarla mata.
10. **Muerte**: morir con 2 llaves; se sueltan en el suelo, el aviso dura 2.5 s y el jugador vuelve a `global`.
11. **Recuperación**: otro jugador recoge las llaves soltadas tras 2 s.
12. **Desconexión**: cerrar una pestaña con llaves; las llaves quedan en el suelo y la ronda sigue.
13. **Mitad de ronda**: entrar con la ronda empezada; aparece en el vestíbulo, sin conteo nuevo, con 0 llaves.
14. **Sala vacía**: salir todos durante `playing`; la sala vuelve a `idle` y el siguiente que entra ve un conteo nuevo.
15. **Sincronización**: en dos navegadores, ver la misma llave desaparecer, el mismo contador y las mismas brujas.
16. **Física**: `?physics=1` muestra solo los colliders del interior mientras se juega.
17. **Regeneración**: ejecutar `interior:build`, recargar y repetir 1, 4 y 6.

## 9. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
| ------ | ------- | ---------- |
| El GLB tiene 2 509 mallas sueltas y el inyector no encuentra bloques contenedores. | Alto | Agrupar por prefijo en el inyector y envolver el grupo, no la malla suelta; validar con `interior:check`. |
| Los trimeshes de muebles disparan el coste o el arranque. | Medio | Lista blanca cerrada y presupuesto de 20 000 tris; si se supera, sustituir muebles por `cuboid`/`convexHull` en el JSON. |
| Las escaleras tienen peldaños finos y el personaje se atasca. | Alto | Trimesh continuo del tramo completo (`WHI_Stair_*_Tread_*` + `Riser_*` + `Stringer*`) y autostep de 0.5 m ya probado en `SPEC-009`. |
| Desmontar `Map` deja colliders huérfanos en Rapier. | Alto | Verificar en `?physics=1`; si ocurre, eliminar cuerpos explícitamente en `onDestroy` y no solo confiar en Threlte. |
| El interior se ve negro. | Alto | `InteriorLighting.svelte` con cinco luces de planta y luz de vestíbulo; comprobar antes de cerrar la fase 2. |
| Las brujas atraviesan paredes al perseguir en línea recta. | Medio | Persecución limitada a la zona rectangular de la planta y waypoints; si el jugador está al otro lado de un muro, la bruja vuelve a patrulla tras 2 s sin línea de visión aproximada. |
| El servidor confía en la posición del cliente. | Medio | Validar finitud, rango, ritmo y velocidad máxima (≤ 8 m/s entre muestras); aceptar el riesgo de cheats en esta iteración. |
| Caída de paquetes o picos de latencia. | Medio | Estado completo cada 1 s además de posiciones a 10 Hz; interpolación de 150 ms; el HUD usa el estado, no las posiciones. |
| El reloj del cliente y el del servidor divergen. | Bajo | Enviar `serverTime` y `endsAt`; el HUD calcula con `Date.now() + offset` estimado. |
| Dos jugadores recogen la misma llave en el mismo tick. | Medio | El tick procesa llaves en orden fijo y marca `carried` de forma atómica antes de pasar a la siguiente. |
| Un jugador muere dentro de una pared y la llave queda inaccesible. | Medio | Validar la posición de caída contra el AABB de la planta; si no es válida, soltar en el centro de la planta. |
| Todos mueren a la vez y la sala queda vacía. | Bajo | `onLeave` detecta sala vacía y resetea a `idle` sin mostrar derrota. |
| El HUD tapa el chat o los controles táctiles. | Medio | Panel superior compacto, `pointer-events-none` salvo botones; probar en móvil. |
| El GLB se reexporta y cambian nombres. | Alto | `interior:check` falla y obliga a actualizar el JSON; no usar patrones difusos en runtime. |
| La puerta principal cerrada impide ver el depósito. | Bajo | El depósito se valida por distancia al umbral, no por atravesar la hoja; el aro y el prompt lo hacen evidente. |

## 10. Preguntas abiertas

- [ ] ¿La muerte debe soltar las llaves (propuesta) o eliminarlas para siempre?
  Soltar mantiene la partida recuperable y castiga sin bloquear.
- [ ] ¿El ático cuenta como quinta planta? La propuesta es sí: `WHI_Floor_F3_*`
  a `y = 7.80`, con la llave en el altar.
- [ ] ¿La puerta principal debe abrirse visualmente al depositar la quinta
  llave? Propuesta: sí, como animación simple de rotación, sin física.
- [ ] ¿Se permite reentrar tras morir? Propuesta: sí, desde el checkpoint,
  con 0 llaves y sin reiniciar la ronda.
- [ ] ¿Las brujas deben tener modelo propio o vale el marcador provisional
  (cápsula + ojos)? Propuesta: marcador ahora; arte en un spec posterior.
- [ ] ¿Debe haber un aviso de qué planta tiene cada llave? Propuesta: leyenda
  en el HUD con las plantas, sin revelar la posición exacta.
- [ ] ¿Se añaden físicas a más muebles (cómodas, tocadores, sofás grandes)?
  Propuesta: solo los de la lista blanca de §11.2.
- [ ] ¿Se debe mostrar un mapa minimapa? Propuesta: no en esta iteración.
- [ ] ¿La sala debe sobrevivir a un reinicio del backend? Propuesta: no; es
  estado en memoria y se reinicia a `idle`.
- [ ] ¿El conteo debe empezar con el primer jugador o esperar 10 s a que se
  llene la sala? Propuesta: primer jugador, como pidió el usuario.
- [ ] ¿La ronda de 300 s y las velocidades de las brujas están balanceadas
  para grupos pequeños? Propuesta: ajustar tras la primera prueba con 2 y 8
  jugadores; los valores de §11 son el punto de partida.

## 11. Decisiones y notas

### 11.1 Máquina de estados

| Fase | Entra cuando | Duración | Qué ocurre | Sale a |
| ---- | ------------ | -------- | ---------- | ------ |
| `idle` | No hay nadie o la ronda anterior terminó | — | Sin llaves ni brujas; espera de jugadores | `countdown` al entrar el primero |
| `countdown` | Primer jugador en `minigame-1` | 30 000 ms | Movimiento bloqueado; brujas inactivas; HUD con cuenta atrás | `playing` al vencer; `idle` si se vacía |
| `playing` | Fin del conteo | 300 000 ms | Llaves y brujas activas; recogida, depósito y muerte habilitados | `won` si 5 depositadas; `lost` al vencer; `idle` si se vacía |
| `won` | `depositedTotal === 5` | 8 000 ms | Resultado y bloqueo de acciones | `idle` y todos a `global` |
| `lost` | Temporizador a 0 con < 5 | 8 000 ms | Resultado y bloqueo de acciones | `idle` y todos a `global` |

Muertes: no cambian la fase de la sala. El jugador pasa por `dead` 2 500 ms y
sale a `global`; la sala sigue si queda alguien vivo.

### 11.2 Lista blanca de colisiones del interior

Se incluyen estos grupos. El número exacto de nodos y triángulos lo fija
`interior-colliders.json` y lo valida `interior:check`.

| Grupo | Patrones incluidos | Motivo |
| ----- | ------------------ | ------ |
| Suelos | `WHI_Floor_Basement_*`, `WHI_Floor_Ground_*`, `WHI_Floor_F1_*`, `WHI_Floor_F2_*`, `WHI_Floor_F3_*` | Superficie de las cinco plantas. |
| Muros y estructura | `WHI_Ext_*`, `WHI_Int_*`, `WHI_Gable_*`, `WHI_Roof_*`, `WHI_Rafter_*`, `WHI_RidgeBeam`, `WHI_Chimney*` | Fachadas, tabiques, tejado y chimenea. |
| Ventanas | `WHI_Win_*` | Marcos, tablones y cristales que deben bloquear. |
| Puertas | `WHI_Door_*_Frame*`, `WHI_Door_Front_Slab` | Marcos y hoja principal; las hojas interiores se ocultan. |
| Escaleras | `WHI_Stair_Base_*`, `WHI_Stair_G_F1_*`, `WHI_Stair_F1_F2_*`, `WHI_Stair_F2_F3_*` | Circulación vertical. |
| Barandillas | `WHI_Rail_*`, `WHI_Guard_*` | Evitan caer al hueco de la escalera. |
| Camas | `*_Bed_*` | Camas de niño, invitado y principal. |
| Asientos | `WHI_*_Chair*`, `WHI_*_Rocker_*`, `WHI_Ritual_Throne_*`, `WHI_Par_Arm*`, `WHI_Study_Arm*` | Sillas, mecedoras, trono y sillones. |
| Mesas y almacenaje | `WHI_*_Table_*`, `WHI_*_Desk_*`, `WHI_*_Nightstand_*`, `WHI_*_Sideboard_*`, `WHI_*_Counter_*`, `WHI_*_Wardrobe_*`, `WHI_*_Trunk_*`, `WHI_*_Shelf*`, `WHI_*_Books_*` | Mesas, escritorios, armarios, cómodas y estanterías. |
| Baño | `WHI_Bath_*`, `WHI_Bath2_*` | Bañera, lavabo, inodoro y sus muebles. |
| Cocina | `WHI_Kit_Stove_*`, `WHI_Kit_Counter_*`, `WHI_Kit_Shelf_*` | Cocina y encimera. |
| Chimenea y altar | `WHI_Par_Fire_*`, `WHI_Base_Altar_*`, `WHI_Ritual_Altar_*` | Volúmenes grandes que no deben atravesarse. |
| Porche | `WHI_Porch_Floor`, `WHI_Porch_Step`, `WHI_Porch_Post*`, `WHI_Porch_Beam*`, `WHI_Porch_Roof` | Entrada y escalón exterior. |

Exclusiones principales: hojas de puertas interiores, pomos, `*Flame*`,
`*Glow*`, `*Wax*`, `*Candles*`, `*Chandelier*`, `*Candelabra*`, `*Web*`,
`*Stain*`, `*Rug*`, `*Portrait*`, `*Sconce*`, libros sueltos, `*Doll*`,
`*Jar*`, `*Bottle*`, `*Plate*`, `*Herbs*`, `*Draw*`, `*Mirror*`, `*Lantern*`,
`*Brazier*`, `*Cage*`, `*Circle*`, `*Crystal*`, `*Eye_*`, `*Hand_*`,
`*Noose*`, `WHI_Cat`, `WHI_Cauldron` y toda la decoración pequeña.

### 11.3 Contrato WebSocket

Todos los mensajes comparten el sobre existente (`type` + campos). Los
mensajes `mg1-*` solo se aceptan y emiten dentro de `minigame-1`.

**Cliente → servidor**

| Tipo | Campos | Frecuencia | Validación |
| ---- | ------ | ---------- | ---------- |
| `mg1-position` | `x`, `y`, `z`, `yaw` (números finitos) | ≤ 10 Hz | Rango `x,z ∈ [-20, 20]`, `y ∈ [-4, 12]`; máx. 15/s por jugador |
| `mg1-deposit` | — | Al pulsar `E` | Fase `playing`, vivo, ≤ 1.8 m de `(0, 0, 4.0)`, ≥ 1 llave |

**Servidor → cliente**

| Tipo | Cuándo | Contenido |
| ---- | ------ | --------- |
| `mg1-state` | Al entrar, al cambiar de fase y cada 1 s | `phase`, `endsAt`, `serverTime`, `depositedTotal`, `players[]`, `keys[]`, `witches[]` |
| `mg1-positions` | Cada 100 ms durante `playing` | `players[]` con `id,x,y,z,yaw,floor,alive` y `witches[]` con `id,x,y,z,yaw,floor,state` |
| `mg1-event` | En cada evento | `kind`: `key-picked`, `key-dropped`, `key-deposited`, `player-died`, `round-start`, `round-won`, `round-lost`, `player-joined`, `player-left`; `playerId?`, `keyId?`, `at` |

`mg1-state` es la fuente de verdad; `mg1-positions` solo suaviza el movimiento.
El cliente descarta posiciones de jugadores que ya no están en el estado.

### 11.4 Posiciones iniciales

**Llaves** (una por planta, `y` = superficie + 0.6):

| Llave | Planta | Posición | Zona aproximada |
| ----- | ------ | -------- | --------------- |
| `key-0-basement` | Sótano | `(4.8, -2.0, -2.8)` | Altar / estanterías del sótano |
| `key-1-ground` | Planta baja | `(5.0, 0.8, 3.2)` | Cocina / office |
| `key-2-f1` | Piso 1 | `(4.7, 3.2, -2.5)` | Estudio |
| `key-3-f2` | Piso 2 | `(-4.7, 5.8, 2.1)` | Habitación principal |
| `key-4-f3` | Piso 3 / ático | `(4.5, 8.4, 2.0)` | Altar del ático |

**Brujas** (una por planta; `y` = superficie):

| Bruja | Planta | Spawn | Waypoints (patrulla) |
| ----- | ------ | ----- | -------------------- |
| `witch-basement` | Sótano | `(0, -2.6, -5.0)` | `(0,-2.6,-5.0)` ↔ `(4.5,-2.6,2.5)` ↔ `(-4.5,-2.6,2.5)` |
| `witch-ground` | Planta baja | `(-5.5, 0, -1.0)` | `(-5.5,0,-1.0)` ↔ `(5.0,0,-3.5)` ↔ `(5.0,0,4.0)` |
| `witch-f1` | Piso 1 | `(0, 2.6, -5.0)` | `(0,2.6,-5.0)` ↔ `(5.0,2.6,2.0)` ↔ `(-5.0,2.6,2.0)` |
| `witch-f2` | Piso 2 | `(-5.5, 5.2, 1.0)` | `(-5.5,5.2,1.0)` ↔ `(5.0,5.2,-1.0)` ↔ `(5.0,5.2,3.5)` |
| `witch-f3` | Piso 3 / ático | `(0, 7.8, -4.5)` | `(0,7.8,-4.5)` ↔ `(4.0,7.8,1.5)` ↔ `(-4.0,7.8,1.5)` |

Zonas de persecución (rectángulos; la bruja nunca sale de ellos):

| Planta | `x` | `z` |
| ------ | --- | --- |
| Sótano | `[-6.0, 6.0]` | `[-5.5, 5.5]` |
| Planta baja | `[-7.0, 7.0]` | `[-5.5, 6.5]` |
| Piso 1 | `[-6.5, 6.5]` | `[-5.5, 5.5]` |
| Piso 2 | `[-6.5, 6.5]` | `[-5.5, 5.5]` |
| Piso 3 / ático | `[-5.5, 5.5]` | `[-5.0, 5.0]` |

El depósito está en el umbral de la puerta principal, `(0, 0, 4.0)`, radio
1.8 m. El spawn de la partida es el vestíbulo, `(0, 0.05, 3.1)`.

### 11.5 Decisiones de diseño

- **Cinco plantas reales**: sótano, planta baja, piso 1, piso 2 y ático. Las
  alturas `-2.60`, `0.00`, `2.60`, `5.20` y `7.80` salen de los nodos
  `WHI_Floor_*` y de las escaleras, no de una suposición.
- **Servidor autoritativo para el juego, cliente autoritativo para el
  movimiento**: el servidor decide llaves, depósitos, muertes, brujas y
  tiempos; el cliente solo reporta dónde está. Es el mismo reparto que ya usa
  el proyecto para presencia y chat, y evita reescribir el controlador
  cinemático de `SPEC-009`.
- **Un tick de 100 ms**: suficiente para brujas, recogidas y muertes, y
  coincide con la frecuencia de `mg1-positions`. No se simula física de red.
- **Brujas en el servidor**: así todos ven la misma bruja y no hay
  discrepancias de muerte. El cliente solo interpola.
- **Llaves fijas, no aleatorias**: el usuario pidió exactamente 5 llaves en 5
  plantas; posiciones fijas hacen la partida reproducible y comprobable.
- **Recogida automática y depósito con `E`**: reduce fricción en móvil y
  reutiliza la tecla que ya usa el checkpoint. El botón táctil existente debe
  mapear a la misma acción.
- **Soltar llaves al morir/salir**: evita que una muerte accidental bloquee la
  partida y mantiene el cooperativo. El cooldown de 2 s impide que la bruja
  “robe” la llave al matar. Las llaves ya depositadas son permanentes: morir
  después de depositar no las devuelve al suelo ni resta al contador del
  equipo.
- **Reutilizar `lobby:minigame-1`**: el jugador ya se suscribe a ese topic al
  entrar. No hace falta un topic nuevo ni cambiar `presence.ts`.
- **Una sola sala**: el lobby `minigame-1` es una única instancia. Si en el
  futuro se quieren varias partidas, habrá que añadir `roomId` al protocolo;
  queda fuera de alcance.
- **Puerta principal como objetivo**: el depósito se valida por distancia al
  umbral. Abrir la hoja es un efecto visual opcional, no un requisito de
  física.
- **Hojas interiores ocultas**: el GLB las modela cerradas y con colisión
  bloquearían el laberinto. Se ocultan visualmente y se excluyen de la lista
  blanca; la puerta principal se conserva.
- **Modelo provisional de bruja**: el GLB no trae brujas ni animaciones. Se
  usa una cápsula con ojos emisivos y sombrero simple; el arte definitivo va
  en otro spec.
- **Iluminación propia**: el GLB no tiene luces. Sin `InteriorLighting` la
  casa se vería negra, igual que ocurrió con el mapa en `SPEC-009`.
- **Reconexión sin reanudar**: `SPEC-003` reconecta al jugador en `global`.
  Si se cae a mitad de ronda, el cierre del socket suelta sus llaves y el
  cliente desmonta el interior; al volver a entrar aparece en el vestíbulo de
  la fase actual con 0 llaves. No se intenta reanudar la sesión ni la posición.

## 12. Progreso

| Fecha | Estado | Nota |
| ----- | ------ | ---- |
| 2026-10-31 | borrador | Spec creado. GLB medido: 2 509 nodos/mallas, 2 519 primitivas, 46 522 tris, 51 materiales, 0 animaciones. Lista blanca propuesta: ~1 000–1 300 nodos y ~12 000–15 000 tris. Pendiente de revisión del usuario. |

## 13. Changelog

- 2026-10-31 — Creación del spec: casa de 5 plantas, 5 llaves fijas, conteo
  de 60 s, ronda de 300 s, 5 brujas, contrato WebSocket `mg1-*`, lista blanca
  de colisiones y plan en 8 fases.
- 2026-11-11 — Cuenta atrás de espera reducida de 60 s a 30 s para unificar
  todos los minijuegos. La duración de la ronda (300 s) no cambia.
