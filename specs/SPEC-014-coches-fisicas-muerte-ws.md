---
id: SPEC-014
titulo: "Coches conducibles con física Rapier, muerte y estado autoritativo en WebSocket"
estado: implementado
prioridad: alta
creado: 2026-11-01
actualizado: 2026-11-01
responsable: opencode
etiquetas: [frontend, backend, threlte, rapier, websocket, coches, vehiculos, fisicas, muerte, respawn, multijugador]
depende_de: [SPEC-002, SPEC-009, SPEC-012]
bloquea: []
estimacion: "16h"
---

# SPEC-014 — Coches conducibles con física Rapier, muerte y estado autoritativo en WebSocket

## 1. Contexto

El proyecto ya tiene:

- Tres modelos de coche en `frontend/static/`:
  - `coche_calabaza.glb` (351 KB, raíz `PumpkinCar_Root`, 19 mallas, 1 animación).
  - `coche_momia.glb` (365 KB, raíz `MummyCar_Root`, 17 mallas, 1 animación).
  - `coche_halloween.glb` (347 KB, raíz `HalloweenCar_Root`, 20 mallas, 1 animación).
- Física Rapier en el mapa exterior y la cripta (`SPEC-009`, `SPEC-012`), con el jugador usando `KinematicCharacterController` en `frontend/src/lib/components/player/PlayerCollider.svelte`.
- Presencia y mensajes en tiempo real en `backend/src/ws/` y `frontend/src/lib/services/lobbySocket.ts`.
- Un patrón ya establecido para estado de juego en el servidor: `minigame-2` es autoritativo para fases, momias, calaveras, muertes y respawn (`backend/src/ws/minigame2.ts`), mientras que el movimiento del jugador en el mapa exterior es cliente-autoritativo y el servidor solo reenvía `player-position` a 10 Hz.
- Ningún código de coches: no hay componentes, estado, protocolo ni lógica de ocupación.

Los tres GLB comparten estructura y medidas aproximadas:

| Dato | Valor observado |
| ---- | --------------- |
| Largo (eje X local) | ≈ 5,7 m (`-3,24` a `+2,43`) |
| Ancho (eje Z local) | ≈ 2,2 m (`-1,12` a `+1,12`) |
| Alto (eje Y local) | ≈ 2,6 m (`0,02` a `2,59`) |
| Ruedas | `*_Wheel_FL`, `*_Wheel_FR`, `*_Wheel_RL`, `*_Wheel_RR` |
| Posición de ruedas | X `±1,45`, Z `±1,18`, Y `0,62`; radio ≈ `0,61` |
| Rotación de la raíz | `*_Root` trae +90° en Y (cuaternión `[0, 0.7071, 0, 0.7071]`) |
| Animación | Un único clip llamado `Animation` (murciélagos/fantasmas) |

La rotación de `*_Root` hace que el morro del coche quede mirando a `-Z` si se clona tal cual, mientras que el controlador de vehículo de Rapier usará un eje local concreto. Hay que neutralizar esa rotación al clonar para que el morro quede en `+X` local y coincida con el eje frontal del controlador.

El jugador ya puede caminar por el mapa exterior, pero los coches no existen en la escena. Tampoco hay forma de saber qué coche está libre, quién lo conduce, dónde está ni cuánta vida le queda. Sin ese estado compartido, dos jugadores podrían subirse al mismo coche y cada cliente vería una realidad distinta.

La decisión de diseño de este spec es:

- **Servidor autoritativo para ocupación, vida, destrucción y respawn.**
- **Cliente conductor autoritativo para el movimiento físico del coche** (igual que `player-position`), porque el servidor no simula Rapier ni conoce los colliders del mapa. El servidor valida rangos, velocidad, frecuencia y propiedad del coche, y difunde el estado.
- Los coches solo existen en el mapa exterior (`lobbyId === 'global'`). Entrar a un minijuego o a la cripta libera el coche.

## 2. Objetivo

Añadir tres coches conducibles en el mapa exterior con física de vehículo Rapier, daño por impacto, destrucción, eyección del conductor y respawn, y mantener su posición, rotación, velocidad, salud, disponibilidad y conductor en un estado autoritativo del backend difundido por WebSocket para que todos los clientes vean lo mismo.

## 3. Alcance

**Incluye**

- Tres coches fijos con IDs estables: `car-calabaza`, `car-momia`, `car-halloween`.
- Render de los tres GLB en el mapa exterior con orientación, escala y ruedas correctas.
- Física de vehículo con `DynamicRayCastVehicleController` de Rapier:
  - chasis dinámico con collider,
  - cuatro ruedas con suspensión, radio, fricción, motor, freno y dirección,
  - colisión con el mapa, el jugador y otros coches.
- Entrada y salida del coche con validación de distancia y ocupación en el servidor.
- Estado del coche en el backend: posición, rotación, velocidad, dirección, salud, estado y conductor.
- Sincronización por WebSocket:
  - snapshot completo `cars-state` al unirse y cuando cambie algo,
  - estado a 10 Hz mientras haya coches ocupados,
  - eventos `car-event` para entrada, salida, daño, destrucción y respawn.
- Movimiento cliente-autoritativo del conductor con validación y límites en el servidor.
- Daño por impacto fuerte y por vuelco; destrucción a 0 de vida; caída al vacío destruye.
- Explosión visual simple, eyección del conductor a un punto seguro y respawn a los 5 s en el spawn.
- HUD de coche: nombre, velocidad, salud, estado y cuenta atrás de respawn.
- Prompt contextual para entrar/salir (`E` en escritorio, botón en móvil).
- Cámara de conducción y ocultación del avatar del conductor.
- Controles de escritorio y móviles.
- Logs de backend para entrada, salida, destrucción y respawn.
- Documentación del protocolo en `backend/README.md`.

**No incluye**

- Simulación Rapier autoritativa en el servidor (el servidor no ejecuta el motor físico).
- Persistencia en base de datos: el estado de los coches vive en memoria y se reinicia con el proceso.
- Coches dentro de la cripta o de minijuegos con escena propia.
- Combate entre coches con armas, nitro, turbo, drift puntuado o daño a jugadores.
- Reparación manual, talleres, combustible, llaves, cerraduras o propiedad permanente.
- Sonido de motor, bocina, música o efectos de audio.
- Modelos nuevos, modificaciones en Blender o cambios en los GLB.
- Animaciones de murciélagos/fantasmas de los GLB (se pueden dejar estáticas en esta fase).
- Matchmaking, carreras, checkpoints de coche o puntuación.
- Anti-cheat fuerte: se aceptan límites y validaciones básicas, no un servidor de física autoritativo.
- Tests automatizados con framework nuevo; se usan smoke tests con Bun y pruebas manuales.

## 4. Requisitos

### Funcionales

| ID | Requisito | Prioridad |
| -- | --------- | --------- |
| RF-1 | Existen exactamente tres coches con IDs estables: `car-calabaza`, `car-momia`, `car-halloween`; el ID no cambia aunque cambie el nombre visible o el modelo. | alta |
| RF-2 | El backend mantiene en memoria un `Map<CarId, CarState>` inicializado al arrancar con los tres coches en estado `available`, salud 100 y posición de spawn. | alta |
| RF-3 | Cada `CarState` incluye: `id`, `name`, `model`, `status`, `driverId`, `driverName`, `position`, `rotation` (cuaternión), `velocity`, `speed`, `steering`, `health`, `maxHealth`, `respawnAt` y `updatedAt`. | alta |
| RF-4 | Al recibir `join`, el servidor envía `cars-state` con los tres coches además de `welcome`, `chat-history` y `rolls-state`. | alta |
| RF-5 | `enter-car` solo se acepta si el jugador está en `lobbyId === 'global'`, el coche existe, está `available`, el jugador no conduce ya otro coche y está a ≤ 5 m horizontales del coche (si el servidor conoce su última posición). | alta |
| RF-6 | Si el coche está `occupied`, `enter-car` responde `CAR_OCCUPIED` sin cerrar el socket y sin cambiar el estado. | alta |
| RF-7 | Si el coche está `destroyed` o `respawning`, `enter-car` responde `CAR_DESTROYED` o `CAR_RESPAWNING`. | alta |
| RF-8 | Al aceptar `enter-car`, el servidor asigna `driverId`/`driverName`, pasa el coche a `occupied`, difunde `cars-state` y emite `car-event` con `kind: 'entered'`. | alta |
| RF-9 | `exit-car` solo lo puede enviar el conductor actual; pasa el coche a `available`, limpia `driverId`, pone velocidad a cero, difunde estado y emite `kind: 'exited'`. | alta |
| RF-10 | Un jugador no puede conducir dos coches a la vez; un segundo `enter-car` responde `ALREADY_DRIVING`. | alta |
| RF-11 | El conductor envía `car-state` a 10 Hz con posición, cuaternión, velocidad, velocidad escalar y ángulo de dirección; el servidor solo lo acepta si `driverId === player.id`, el coche está `occupied` y el jugador sigue en `global`. | alta |
| RF-12 | El servidor rechaza `car-state` no finitos, con coordenadas fuera de `±1000`, con `y < -200` o `y > 300`, con cuaternión no normalizable, con velocidad > 40 m/s o con saltos de posición imposibles; responde `CAR_INVALID_STATE` o `CAR_TELEPORT` sin cerrar el socket. | alta |
| RF-13 | El servidor limita `car-state` a un máximo de 20 Hz por conductor (`CAR_RATE_LIMITED`) y difunde un snapshot completo `cars-state` a 10 Hz mientras haya al menos un coche ocupado. | alta |
| RF-14 | El conductor envía `car-impact` con `impactSpeed` y `cause: 'collision' | 'rollover'`; el servidor lo acepta solo del conductor, con enfriamiento de 600 ms por coche, y calcula el daño. | alta |
| RF-15 | Daño por colisión: `clamp((impactSpeed - 5) * 3, 0, 35)` redondeado; daño por vuelco: 12. El servidor nunca acepta un daño mayor de 35 por evento. | alta |
| RF-16 | Si `health <= 0`, el servidor destruye el coche: `status: 'destroyed'`, `health: 0`, `driverId: null`, velocidad cero, `respawnAt = now + 5000`, emite `car-event` con `kind: 'destroyed'` y el `cause`. | alta |
| RF-17 | Si la posición reportada cae por debajo de `y = -20`, el servidor destruye el coche con `cause: 'fall'` aunque el cliente no envíe `car-impact`. | alta |
| RF-18 | Al cumplirse `respawnAt`, el servidor devuelve el coche a `available`, salud 100, posición/rotación de spawn, velocidad cero y emite `kind: 'respawned'`. | alta |
| RF-19 | Si al reaparecer hay un jugador a menos de 3 m horizontales del spawn, el servidor retrasa el respawn 1 s, hasta un máximo de 10 s. | media |
| RF-20 | Si el conductor se desconecta, el servidor libera el coche en su última posición (`available`, velocidad cero) y emite `kind: 'released'`; si estaba destruido, mantiene su respawn. | alta |
| RF-21 | Si el conductor entra en un mini lobby, sale de `global` o cambia de escena, el servidor lo expulsa del coche y libera el coche. | alta |
| RF-22 | Solo los jugadores en `global` pueden entrar o conducir; `enter-car` desde la cripta responde `NOT_IN_GLOBAL`. | alta |
| RF-23 | Los errores de coches usan códigos estables y no cierran el socket: `CAR_NOT_FOUND`, `CAR_OCCUPIED`, `CAR_DESTROYED`, `CAR_RESPAWNING`, `CAR_TOO_FAR`, `ALREADY_DRIVING`, `NOT_DRIVING`, `NOT_DRIVER`, `NOT_IN_GLOBAL`, `CAR_RATE_LIMITED`, `CAR_INVALID_STATE`, `CAR_TELEPORT`, `CAR_INVALID_IMPACT`. | media |
| RF-24 | El backend registra en consola entrada, salida, destrucción, causa y respawn con id de coche, id/nombre de jugador y estado. | media |
| RF-25 | El frontend duplica los tipos y guards de coches en `services/protocol.ts` y `isServerMessage` reconoce `cars-state` y `car-event`. | alta |
| RF-26 | `LobbySocket` expone `onCarsState`, `onCarEvent`, `sendEnterCar`, `sendExitCar`, `sendCarState` y `sendCarImpact`, y los despacha en `handleMessage`. | alta |
| RF-27 | Existe un store reactivo `cars.svelte.ts` con `cars`, `selfDrivingId`, `driverIds`, `nearestAvailable`, `applySnapshot`, `applyEvent`, `reset`, `requestEnter`, `requestExit`, `sendState` y `sendImpact`. | alta |
| RF-28 | `lobby.svelte.ts` integra el store: lo resetea al desconectar, lo actualiza con `cars-state`/`car-event`, marca `selfDrivingId` a partir de `driverId` y le pasa los senders del socket. | alta |
| RF-29 | Los tres GLB se cargan desde `/coche_calabaza.glb`, `/coche_momia.glb` y `/coche_halloween.glb`, se clonan por instancia y se neutraliza la rotación de `*_Root` para que el morro quede en `+X` local. | alta |
| RF-30 | Cada coche tiene un `RigidBody` con collider de chasis tipo cuboide, fricción ≈ 0,7 y restitución ≈ 0,1; el chasis colisiona con el mapa, el jugador y otros coches. | alta |
| RF-31 | El coche del conductor local usa `DynamicRayCastVehicleController` con cuatro ruedas, suspensión, radio, fricción, motor, freno y dirección; el resto de coches se representan como cuerpos cinemáticos que interpolan el estado del servidor. | alta |
| RF-32 | Controles de escritorio: `W`/`S` acelerar/frenar, `A`/`D` girar, `Space` freno de mano, `E` entrar/salir. En móvil, `Conducir`/`Salir` para entrar o salir y, durante la conducción, `Izq`/`Der`, `Acelerar`, `Freno` y `Reversa`; el stick también conduce. | alta |
| RF-33 | Las ruedas visuales giran según la velocidad y las delanteras se orientan según la dirección del controlador. | media |
| RF-34 | El cliente detecta impactos por caída brusca de velocidad (> 5 m/s en un tick sin frenar) y vuelcos (> 1 s con el eje arriba del coche por debajo de 0,3), y envía `car-impact` con enfriamiento local de 600 ms. | alta |
| RF-35 | Al destruirse, el coche oculta su modelo, muestra una explosión simple (esfera/expansión/luz) y el conductor es eyectado a un punto seguro al lado del coche; el jugador no muere. | alta |
| RF-36 | Mientras conduce, el avatar local se oculta, el jugador no envía `player-position`, la cámara sigue al coche y el avatar remoto de ese jugador se oculta en los demás clientes usando `driverIds`. | alta |
| RF-37 | Al salir o ser eyectado, el jugador reaparece de pie a 2,5 m del lado izquierdo del coche, recupera su avatar, su física y su cámara, y vuelve a enviar `player-position`. | alta |
| RF-38 | El HUD muestra nombre del coche, velocidad en km/h, barra de salud, estado (`Disponible`, `Ocupado por X`, `Destruido`, `Reaparece en N s`) y la tecla/acción para salir. | alta |
| RF-39 | El prompt contextual solo aparece en el mapa exterior, sin conducir y a ≤ 5 m de un coche disponible; muestra `E — Conducir <nombre>`. | media |
| RF-40 | Los coches solo se renderizan en la escena `global`; en la cripta o en un minijuego no se montan ni se actualizan visualmente. | alta |
| RF-41 | Entrar y salir repetidamente, cambiar de escena o reconectar no deja controladores de vehículo, cuerpos, colliders ni listeners huérfanos. | alta |
| RF-42 | El backend no añade dependencias nuevas; el frontend usa `@dimforge/rapier3d-compat`, `@threlte/rapier`, `three` y `@threlte/extras` ya instalados. | alta |
| RF-43 | En pantallas táctiles el HUD del coche se reduce a una píldora superior con velocidad y barra de salud (o coche y cuenta atrás si está destruido), se coloca fuera de los controles y oculta el HUD de misiones para no solaparse. | alta |

### No funcionales

| ID | Requisito | Criterio |
| -- | --------- | -------- |
| RNF-1 | Rendimiento | 60 fps estables con los tres coches visibles y uno conducido; 4 raycasts de rueda por coche activo. |
| RNF-2 | Red | `cars-state` a 10 Hz como máximo; con 3 coches el snapshot debe quedar por debajo de ~4 KB. |
| RNF-3 | Sin asignaciones por frame | El controlador y el sincronizador reutilizan `Vector3`, `Quaternion` y objetos de estado; no crean arrays por tick. |
| RNF-4 | Tipado | `cd backend && bunx tsc --noEmit` termina con código 0. |
| RNF-5 | Frontend | `cd frontend && bun run check` y Prettier acotado pasan sin errores. |
| RNF-6 | SSR seguro | Nada de Rapier, `window` o `localStorage` fuera de `<Canvas>`, `$effect`, `onMount` o guards de `browser`. |
| RNF-7 | Idempotencia | `enter-car`/`exit-car` repetidos no duplican eventos ni controladores; el servidor responde con error estable. |
| RNF-8 | Memoria del servidor | El estado de coches es un `Map` de 3 entradas y no crece con los jugadores ni con los eventos. |
| RNF-9 | Reversibilidad | Si un coche falla al cargar su GLB, los otros dos siguen funcionando y el servidor mantiene su estado. |
| RNF-10 | Compatibilidad | No se rompen presencia, chat, checkpoints, rollos de papel, `minigame-2` ni el movimiento del jugador. |
| RNF-11 | Interpolación | Los coches remotos se interpolan a 60 fps a partir de snapshots de 10 Hz sin saltos visibles. |
| RNF-12 | Accesibilidad de UI | El HUD y el prompt no capturan el puntero fuera de sus botones ni bloquean el canvas. |

## 5. Criterios de aceptación

- [x] CA-1: `cd backend && bunx tsc --noEmit` pasa y `bun run dev` arranca con los tres coches inicializados.
- [x] CA-2: Un cliente que hace `join` recibe `cars-state` con exactamente 3 coches, todos `available`, salud 100 y `driverId: null`.
- [x] CA-3: `enter-car` con `car-calabaza` desde `global` y a distancia válida devuelve `cars-state` con `status: 'occupied'`, `driverId` del jugador y emite `car-event` `entered`.
- [x] CA-4: Un segundo cliente que intenta `enter-car` sobre el mismo coche recibe `CAR_OCCUPIED` y el estado no cambia.
- [x] CA-5: Mientras el conductor envía `car-state`, el otro cliente ve la posición/rotación actualizada a ~10 Hz y el coche se mueve interpolado.
- [x] CA-6: Un cliente que no es el conductor y envía `car-state` recibe `NOT_DRIVER`; el estado del coche no cambia.
- [x] CA-7: `exit-car` del conductor deja el coche `available`, `driverId: null`, velocidad cero y emite `exited`.
- [x] CA-8: Cerrar la pestaña del conductor libera el coche y el otro cliente lo ve `available` en la última posición.
- [ ] CA-9: Si el conductor entra en `minigame-2` o `minigame-1`, el coche se libera y el jugador deja de conducir.
- [ ] CA-10: El coche se conduce con `W/A/S/D`, acelera, frena, gira y no atraviesa vallas, edificios ni el tronco del mapa.
- [x] CA-11: Las cuatro ruedas giran con el movimiento y las delanteras se orientan al girar; el coche queda apoyado sobre el suelo, sin hundirse ni flotar.
- [x] CA-12: Al entrar, el avatar local desaparece, la cámara pasa al perfil de coche y los demás clientes ocultan el avatar de ese jugador.
- [ ] CA-13: Un impacto fuerte reduce la salud en el HUD; el daño no se aplica dos veces por el mismo golpe ni supera 35 por evento.
- [ ] CA-14: Al llegar a 0 de salud, el coche se destruye, se ve la explosión, el conductor es eyectado y el HUD muestra la cuenta atrás.
- [x] CA-15: A los 5 s el coche reaparece en su spawn, con salud 100, `available`, y emite `respawned`.
- [ ] CA-16: Si el coche cae por debajo de `y = -20`, se destruye con `cause: 'fall'` sin esperar a un `car-impact`.
- [x] CA-17: Si un jugador está a menos de 3 m del spawn, el respawn se retrasa 1 s y se reintenta hasta 10 s.
- [x] CA-18: En móvil, los botones `Izq`/`Der`, `Acelerar`, `Freno` y `Reversa` conducen y `Conducir`/`Salir` entra o sale del coche sin romper los controles del jugador.
- [ ] CA-19: En la cripta no se renderizan coches, no aparece el prompt y `enter-car` responde `NOT_IN_GLOBAL`.
- [ ] CA-20: Entrar/salir 10 veces, cambiar de escena y reconectar no deja controladores ni cuerpos huérfanos; la consola no muestra errores de Rapier.
- [x] CA-21: `cd frontend && bun run check`, Prettier acotado y `bun run build` pasan.
- [x] CA-22: Dos pestañas + smoke test WebSocket con Bun reproducen ocupación, movimiento, salida y respawn.
- [x] CA-23: El morro de los tres coches apunta en la dirección de avance; las ruedas están en el suelo y el modelo no está rotado 90°.
- [ ] CA-24: Presencia, chat, checkpoints, rollos y `minigame-2` siguen funcionando igual que antes.

## 6. Archivos relevantes

| Ruta | Acción | Motivo |
| ---- | ------ | ------ |
| `backend/src/ws/cars.ts` | crear | Definiciones, estado en memoria, validación, daño, destrucción, respawn y snapshots. |
| `backend/src/ws/protocol.ts` | modificar | Tipos `CarId`, `CarState`, `CarsSnapshot`, `CarEvent`, esquemas Zod y unión de mensajes. |
| `backend/src/index.ts` | modificar | Enviar `cars-state` al unirse, casos `enter-car`/`exit-car`/`car-state`/`car-impact`, hooks de posición/desconexión/cambio de lobby y `setInterval` de tick. |
| `backend/README.md` | modificar | Documentar protocolo, estados, códigos de error y smoke test. |
| `frontend/src/lib/services/protocol.ts` | modificar | Duplicar tipos y guards de coches; ampliar `ClientMessage`, `ServerMessage` e `isServerMessage`. |
| `frontend/src/lib/services/lobbySocket.ts` | modificar | Callbacks `onCarsState`/`onCarEvent` y métodos `sendEnterCar`/`sendExitCar`/`sendCarState`/`sendCarImpact`. |
| `frontend/src/lib/state/lobby.svelte.ts` | modificar | Integrar el store de coches, senders, reseteo y `selfDrivingId`. |
| `frontend/src/lib/state/cars.svelte.ts` | crear | Store reactivo de coches, selección de coche cercano y envío de acciones. |
| `frontend/src/lib/state/carConfig.ts` | crear | Catálogo frontend: IDs, nombres, modelos, spawns, constantes de física y daño. |
| `frontend/src/lib/state/carInput.ts` | crear | Entrada de conducción (acelerador, dirección, freno) separada de `playerInput`. |
| `frontend/src/lib/state/playerState.ts` | modificar | Añadir `drivingCarId` a `playerRuntime` y helpers de entrada/salida. |
| `frontend/src/lib/components/cars/CarModel.svelte` | crear | Carga y clona el GLB, neutraliza `*_Root`, expone ruedas y raíz visual. |
| `frontend/src/lib/components/cars/CarPhysics.svelte` | crear | `RigidBody`, collider, `DynamicRayCastVehicleController`, entrada, daño y envío de estado. |
| `frontend/src/lib/components/cars/Car.svelte` | crear | Une modelo + física + explosión para un coche concreto. |
| `frontend/src/lib/components/cars/Cars.svelte` | crear | Renderiza los tres coches solo en la escena global. |
| `frontend/src/lib/components/cars/CarExplosion.svelte` | crear | Efecto visual simple de destrucción. |
| `frontend/src/lib/components/cars/CarControls.svelte` | crear | Listeners de `E`/`Space`, entrada/salida y freno de mano. |
| `frontend/src/lib/components/ui/CarPrompt.svelte` | crear | Prompt contextual de coche cercano. |
| `frontend/src/lib/components/ui/CarHud.svelte` | crear | HUD de velocidad, salud, estado y respawn. |
| `frontend/src/lib/components/player/PlayerCollider.svelte` | modificar | Congelar física del jugador mientras conduce, espejar posición del coche y restaurar al salir. |
| `frontend/src/lib/components/player/PlayerBehaviour.svelte` | modificar | Ignorar movimiento/acciones y no enviar `player-position` mientras conduce. |
| `frontend/src/lib/components/player/Player.svelte` | modificar | Ocultar el avatar local mientras conduce. |
| `frontend/src/lib/components/player/RemoteHeroes.svelte` | modificar | Excluir jugadores que están conduciendo (`cars.driverIds`). |
| `frontend/src/lib/components/camera/ThirdPersonCamera.svelte` | modificar | Perfil de cámara de coche y seguimiento del vehículo. |
| `frontend/src/lib/components/ui/MobileControls.svelte` | modificar | Botón de entrar/salir y botones táctiles de dirección, acelerador, freno y reversa. |
| `frontend/src/lib/Scene.svelte` | modificar | Montar `<Cars />`, `<CarControls />`, `<CarPrompt />` y `<CarHud />` solo en la escena global. |

## 7. Plan de implementación

### Fase 1 — Contrato y estado de coches en backend

- [x] Paso 1: En `backend/src/ws/protocol.ts`, añadir `CAR_IDS = ['car-calabaza','car-momia','car-halloween'] as const`, `CarId`, `CarStatus`, `CarState`, `CarsSnapshot`, `CarEventKind`, `CarEvent`, `CarDefinition` y `CAR_DEFINITIONS` con nombres, modelos y spawns.
- [x] Paso 2: Definir `CAR_DEFINITIONS` con:
  - `car-calabaza`: nombre `Coche Calabaza`, modelo `coche_calabaza`, spawn `{ x: -7, y: 1.4, z: 12, yaw: 0 }`.
  - `car-momia`: nombre `Coche Momia`, modelo `coche_momia`, spawn `{ x: 7, y: 1.4, z: 12, yaw: Math.PI }`.
  - `car-halloween`: nombre `Coche Halloween`, modelo `coche_halloween`, spawn `{ x: 0, y: 1.4, z: 17, yaw: Math.PI / 2 }`.
  - `maxHealth: 100`, `respawnMs: 5000`.
  - Estos spawns son iniciales: se verifican con `?physics=1` y se ajustan si hay árboles, vallas o edificios.
- [x] Paso 3: Añadir esquemas Zod:
  - `enter-car` con `carId: z.enum(CAR_IDS)`.
  - `exit-car` con `carId`.
  - `car-state` con `carId`, `x/y/z`, `qx/qy/qz/qw`, `vx/vy/vz`, `speed`, `steering`, todos finitos y numéricos.
  - `car-impact` con `carId`, `impactSpeed` y `cause: z.enum(['collision','rollover'])`.
- [x] Paso 4: Ampliar `ClientMessage` y `ServerMessage`:
  - Cliente: `enter-car`, `exit-car`, `car-state`, `car-impact`.
  - Servidor: `cars-state` y `car-event`.
- [x] Paso 5: Actualizar `CLIENT_MESSAGE_TYPES` y `parseClientMessage` para que `enter-car`/`exit-car` con un `carId` inválido devuelvan `INVALID_CAR` y no `INVALID_MESSAGE` genérico.
- [x] Paso 6: Crear `backend/src/ws/cars.ts` con:
  - `initCars(deps)` para publicar mensajes y consultar presencia,
  - `listCars()`, `getCar(carId)`, `buildCarsSnapshot()`,
  - `onEnter(player, carId)`, `onExit(playerId, carId)`,
  - `onState(playerId, carId, state)`, `onImpact(playerId, carId, impact)`,
  - `onPlayerLeave(playerId)`, `onPlayerPosition(playerId, x, y, z)`,
  - `tick(now)`, `resetCars()`.
- [x] Paso 7: Implementar la validación de `enter-car` con distancia horizontal ≤ 5 m y `|dy| ≤ 3` si hay última posición conocida del jugador; si no hay posición, permitir la primera entrada y registrarlo.
- [x] Paso 8: Implementar la máquina de estados:
  - `available` → `occupied` al entrar.
  - `occupied` → `available` al salir o liberar.
  - `occupied`/`available` → `destroyed` al llegar a 0 o caer.
  - `destroyed` → `available` al cumplir `respawnAt`.
  - `respawning` se usa solo si se necesita distinguir el intervalo; si no, `destroyed` + `respawnAt` es suficiente.

### Fase 2 — Integración del backend

- [x] Paso 9: En `backend/src/index.ts`, importar `initCars`, `buildCarsSnapshot`, `onEnter`, `onExit`, `onState`, `onImpact`, `onPlayerLeave`, `onPlayerPosition` y `tick`.
- [x] Paso 10: Inicializar `initCars({ publish, getPlayer, listGlobal, moveToGlobal })` antes de `new Elysia()`.
- [x] Paso 11: En el caso `join`, enviar `cars-state` con `serverTime: Date.now()` y `cars: buildCarsSnapshot()`.
- [x] Paso 12: En el `switch` de mensajes, añadir:
  - `enter-car`: llamar a `onEnter(player, message.carId)`.
  - `exit-car`: llamar a `onExit(player.id, message.carId)`.
  - `car-state`: comprobar `player.lobbyId === 'global'`, llamar a `onState`.
  - `car-impact`: comprobar `player.lobbyId === 'global'`, llamar a `onImpact`.
- [x] Paso 13: En el caso `player-position`, llamar a `onPlayerPosition(player.id, message.x, message.y, message.z)` antes de publicar, para que el servidor tenga la última posición y pueda validar distancia y respawn seguro.
- [x] Paso 14: En `enter-lobby` y `leave-lobby`, si el jugador conduce un coche, llamar a `onPlayerLeave(player.id)` antes de cambiar de lobby.
- [x] Paso 15: En `close`, llamar a `onPlayerLeave(ws.id)` y limpiar cualquier estado de conductor.
- [x] Paso 16: Añadir `setInterval(() => carsTick(Date.now()), 100)` junto a los intervalos existentes; el tick gestiona respawns y difusión a 10 Hz si hay coches ocupados.
- [x] Paso 17: Añadir logs `[cars] enter ...`, `[cars] exit ...`, `[cars] destroyed ...`, `[cars] respawn ...`.
- [x] Paso 18: Verificar el contrato con un smoke test de Bun de dos clientes antes de tocar el frontend.

### Fase 3 — Protocolo, socket y store del frontend

- [x] Paso 19: Duplicar en `frontend/src/lib/services/protocol.ts` los tipos `CarId`, `CarStatus`, `CarState`, `CarsSnapshot`, `CarEventKind`, `CarEvent` y las constantes `CAR_IDS`.
- [x] Paso 20: Añadir guards `isCarState`, `isCarsSnapshot`, `isCarEvent` y extender `isServerMessage` con `cars-state` y `car-event`.
- [x] Paso 21: Extender `ClientMessage`/`ServerMessage` con los cuatro mensajes de cliente y los dos de servidor.
- [x] Paso 22: En `lobbySocket.ts`, añadir `onCarsState(serverTime, cars)`, `onCarEvent(event)`, `sendEnterCar(carId)`, `sendExitCar(carId)`, `sendCarState(state)` y `sendCarImpact(impact)`.
- [x] Paso 23: Crear `frontend/src/lib/state/carConfig.ts` con el catálogo de modelos (`/coche_calabaza.glb`, etc.), nombres, spawns de fallback y constantes de física/daño.
- [x] Paso 24: Crear `frontend/src/lib/state/cars.svelte.ts`:
  - `cars = $state.raw<Record<CarId, CarState>>({})`.
  - `selfDrivingId = $state<CarId | null>(null)`.
  - `driverIds = $derived(new Set(...))`.
  - `nearestAvailable` derivado de `playerState` y `cars`.
  - `applySnapshot(serverTime, cars)`, `applyEvent(event)`, `reset()`.
  - `setSender(...)`, `requestEnter(carId)`, `requestExit()`, `sendState(state)`, `sendImpact(impact)`.
- [x] Paso 25: En `lobby.svelte.ts`, importar `cars`, resetearlo al desconectar y en `onStatus === 'disconnected'|'error'`, y enlazar `onCarsState`/`onCarEvent`.
- [x] Paso 26: En `onWelcome`, asignar `cars.selfId = self.id`; en `onPresence`, si `self.lobbyId !== 'global'` y `cars.selfDrivingId !== null`, llamar a `cars.resetDriving()` (el servidor también lo hará).
- [x] Paso 27: Pasar los senders de coches al socket en `connect()` y limpiarlos en `disconnect()`.

### Fase 4 — Modelo y física del coche

- [x] Paso 28: Crear `CarModel.svelte` con `useGltf(modelUrl)`, clonar la escena por instancia y neutralizar la rotación del nodo `*_Root` (`rotation.set(0, 0, 0)`) para que el morro quede en `+X`.
- [x] Paso 29: Exponer por `bind:` la raíz visual y un mapa de ruedas `{ FL, FR, RL, RR }`; si el GLB no trae una rueda, dejar la entrada a `undefined` sin romper.
- [x] Paso 30: Crear `CarPhysics.svelte` con `<RigidBody type={isDriver ? 'dynamic' : 'kinematicPosition'} colliders={false}>` y `<Collider shape="cuboid" args={[2.4, 0.55, 1.05]} friction={0.7} restitution={0.1} />`.
- [x] Paso 31: En `$effect`, cuando `body` exista y `isDriver`, crear `world.createVehicleController(body)`; en `onDestroy` llamar a `world.removeVehicleController(controller)` y limpiar referencias.
- [x] Paso 32: Configurar el controlador:
  - eje arriba `1` (Y),
  - eje frontal `0` (X local),
  - cuatro ruedas en `x = ±1.45`, `z = ±1.18`, `y ≈ -0.3` respecto al centro del chasis,
  - `suspensionRestLength ≈ 0.25`, `radius ≈ 0.6`,
  - `frictionSlip ≈ 2.0`, `sideFrictionStiffness ≈ 1.0`,
  - `maxSuspensionTravel ≈ 0.3`, `suspensionStiffness ≈ 24`, `suspensionCompression ≈ 0.8`, `suspensionRelaxation ≈ 0.9`.
- [x] Paso 33: En `usePhysicsTask`, si es el conductor:
  - leer `carInput.throttle` (-1..1) y `carInput.steering` (-1..1),
  - aplicar fuerza de motor a las ruedas traseras o a las cuatro (valor inicial `engineForce ≈ 900` por rueda, ajustar),
  - aplicar dirección a las ruedas delanteras (`maxSteer ≈ 0.55 rad`),
  - aplicar freno (`brake ≈ 8`) si `carInput.brake`,
  - llamar a `controller.updateVehicle(delta, QueryFilterFlags.EXCLUDE_SENSORS)`,
  - enviar `car-state` cada 100 ms con `body.translation()`, `body.rotation()`, `body.linvel()`, `controller.currentVehicleSpeed()` y `controller.wheelSteering(0)`.
- [x] Paso 34: Para coches remotos, en `usePhysicsTask` interpolar posición/cuaternión desde `cars.cars[id]` y aplicar `setNextKinematicTranslation`/`setNextKinematicRotation`; usar `1 - exp(-12 * delta)` para la posición y `slerp` para la rotación.
- [x] Paso 35: En `useTask`, sincronizar ruedas visuales:
  - `FL/FR`: `rotation.y = controller.wheelSteering(i)`,
  - las cuatro: `rotation.z = -controller.wheelRotation(i)` (ajustar signo si el sentido visual es incorrecto),
  - usar orden de Euler `YXZ`.
- [x] Paso 36: Añadir detección de impacto:
  - guardar `previousSpeed` cada tick,
  - si `previousSpeed > 6`, `previousSpeed - speed > 5` y no se está frenando, enviar `car-impact` con `impactSpeed = clamp(previousSpeed - speed, 0, 60)` y `cause: 'collision'`,
  - enfriamiento local de 600 ms.
- [x] Paso 37: Añadir detección de vuelco:
  - calcular el vector local `(0,1,0)` rotado por la rotación del cuerpo,
  - si `up.y < 0.3` durante más de 1 s y `speed < 2`, enviar `car-impact` con `cause: 'rollover'`,
  - enfriamiento de 2 s.
- [x] Paso 38: Crear `Car.svelte` que reciba `car: CarState`, renderice `CarModel` dentro de `CarPhysics`, y muestre `CarExplosion` si `status === 'destroyed'`.
- [x] Paso 39: Crear `Cars.svelte` que itere `cars.cars` y renderice un `Car` por coche; montarlo solo si `sceneState.inGlobal`.
- [x] Paso 40: Verificar con `?physics=1` que el chasis, las ruedas y el modelo coinciden; ajustar `CHASSIS_CENTER_Y`, conexiones de rueda y spawns.

### Fase 5 — Entrada/salida, cámara y avatares

- [x] Paso 41: Crear `CarControls.svelte`:
  - escuchar `keydown`/`keyup` de `KeyE` y `Space`,
  - `KeyE` llama a `cars.requestEnter(cars.nearestAvailable.id)` o `cars.requestExit()` según `selfDrivingId`,
  - `Space` activa `carInput.brake` mientras se conduce,
  - ignorar eventos cuando el foco está en un input/textarea/contenteditable o el chat está abierto.
- [x] Paso 42: Crear `CarPrompt.svelte` con el nombre del coche disponible y la tecla `E`; solo visible en `global`, sin conducir y con `cars.nearestAvailable`.
- [x] Paso 43: Crear `CarHud.svelte`:
  - visible solo si `cars.selfDrivingId` o si el último coche destruido era el propio,
  - mostrar nombre, velocidad (`Math.round(speed * 3.6)` km/h), barra de salud,
  - mostrar `E — Salir`,
  - si `status === 'destroyed'`, mostrar `Reaparece en N s` usando `respawnAt` y un tick local de 250 ms.
- [x] Paso 44: En `PlayerCollider.svelte`, añadir un `$effect` que:
  - si `cars.selfDrivingId` existe, ponga `playerRuntime.drivingCarId` y `playerRuntime.frozen = true`,
  - copie `playerState.x/y/z` desde la posición del coche para que la cámara y los sistemas existentes sigan teniendo una referencia,
  - al salir, limpie `drivingCarId`, `frozen = false`, haga `teleport` al lado izquierdo del coche y actualice `playerState`.
- [x] Paso 45: En `PlayerBehaviour.svelte`, si `playerRuntime.drivingCarId` no es `null`, no procesar movimiento/salto/acciones y no enviar `player-position`; seguir actualizando solo lo necesario para no romper el ciclo.
- [x] Paso 46: En `Player.svelte`, pasar `visible={!driving}` al `Hero` o envolver el avatar en `{#if !driving}`; mantener `PlayerCollider` montado.
- [x] Paso 47: En `RemoteHeroes.svelte`, filtrar `player.id` que esté en `cars.driverIds`.
- [x] Paso 48: En `ThirdPersonCamera.svelte`, añadir `CAR_PROFILE` (radio 10, min 6, max 16, phi 0.25) y usar la posición del coche conducido como target cuando `cars.selfDrivingId` exista; al salir, volver al perfil exterior.
- [x] Paso 49: En `MobileControls.svelte`, añadir un botón contextual `Conducir`/`Salir` que llame a `cars.requestEnter/Exit`; mientras se conduce, mostrar botones `Izq`/`Der`, `Acelerar`, `Freno` y `Reversa` que escriben en `carInput.touch` (varios a la vez) en vez de `playerIntent`.
- [x] Paso 50: En `Scene.svelte`, montar `<Cars />`, `<CarControls />`, `<CarPrompt />` y `<CarHud />` dentro de `{#if sceneState.inGlobal}` (los controles y el HUD pueden montarse siempre, pero deben ocultarse fuera de `global`).

### Fase 6 — Muerte, eyección y respawn

- [x] Paso 51: En `CarPhysics.svelte`, al recibir `car-event` `destroyed` del coche propio:
  - desmontar/desactivar el controlador,
  - ocultar el modelo,
  - mostrar `CarExplosion`,
  - llamar a `cars.ejectSelf(carId)` para limpiar `selfDrivingId` y restaurar al jugador en un punto seguro.
- [x] Paso 52: Implementar `cars.ejectSelf(carId)` en el store:
  - calcular un punto a 2,5 m al lado izquierdo del coche usando su rotación,
  - comprobar que no está por debajo del suelo; si lo está, usar el spawn del jugador,
  - limpiar `selfDrivingId`, `playerRuntime.drivingCarId` y `playerRuntime.frozen`,
  - notificar a `PlayerCollider` para teletransportar.
- [x] Paso 53: En `CarExplosion.svelte`, animar una esfera emisiva y una luz durante ~1,2 s con `useTask`; limpiar geometría/material/luz al terminar o al desmontar.
- [x] Paso 54: En el servidor, al destruir, poner `driverId: null` y `driverName: null`; el conductor no se elimina de la presencia.
- [x] Paso 55: En el servidor, al respawnear, comprobar la distancia de jugadores a `spawn` usando las últimas posiciones conocidas; si hay alguien a < 3 m, posponer 1 s hasta 10 s.
- [x] Paso 56: En `CarHud.svelte`, mostrar el estado `Destruido` y la cuenta atrás; al recibir `respawned`, volver a `Disponible` y limpiar el estado de eyección.
- [x] Paso 57: Verificar que el coche destruido no se puede entrar (`CAR_DESTROYED`) y que el respawn no se solapa con un jugador.

### Fase 7 — Verificación y cierre

- [x] Paso 58: Ejecutar la verificación de la sección 8 y corregir errores de tipos, formato y build.
- [x] Paso 59: Probar con dos pestañas: ocupación, rechazo del segundo jugador, movimiento remoto, salida, destrucción, eyección y respawn.
- [x] Paso 60: Probar el smoke test WebSocket de dos clientes con Bun (entrar, mover, chocar, salir, reconectar).
- [x] Paso 61: Actualizar `backend/README.md` con el protocolo y los estados.
- [x] Paso 62: Actualizar `estado`, `actualizado`, checkboxes, "Progreso" y "Changelog" de este spec.

### Contrato de mensajes

```ts
export const CAR_IDS = ['car-calabaza', 'car-momia', 'car-halloween'] as const;
export type CarId = (typeof CAR_IDS)[number];

export type CarStatus = 'available' | 'occupied' | 'destroyed' | 'respawning';

export type CarState = {
	id: CarId;
	name: string;
	model: 'coche_calabaza' | 'coche_momia' | 'coche_halloween';
	status: CarStatus;
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

export type CarsSnapshot = {
	serverTime: number;
	cars: CarState[];
};

export type CarEventKind =
	| 'entered'
	| 'exited'
	| 'damaged'
	| 'destroyed'
	| 'respawned'
	| 'released';

export type CarEvent = {
	kind: CarEventKind;
	carId: CarId;
	playerId?: string;
	playerName?: string;
	amount?: number;
	cause?: 'collision' | 'rollover' | 'fall' | 'disconnect' | 'lobby';
	at: number;
};

// Cliente → servidor
type ClientMessage =
	| { type: 'enter-car'; carId: CarId }
	| { type: 'exit-car'; carId: CarId }
	| {
			type: 'car-state';
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
			type: 'car-impact';
			carId: CarId;
			impactSpeed: number;
			cause: 'collision' | 'rollover';
	  };

// Servidor → cliente
type ServerMessage =
	| { type: 'cars-state'; serverTime: number; cars: CarState[] }
	| { type: 'car-event'; event: CarEvent };
```

### Constantes iniciales de física

| Constante | Valor inicial | Nota |
| --------- | ------------- | ---- |
| `CHASSIS_HALF_EXTENTS` | `{ x: 2.4, y: 0.55, z: 1.05 }` | Ajustar al modelo. |
| `CHASSIS_CENTER_Y` | `1.0` | Centro del chasis sobre el suelo. |
| `WHEEL_CONNECTION` | `{ x: ±1.45, y: -0.3, z: ±1.18 }` | Relativo al centro del chasis. |
| `WHEEL_RADIUS` | `0.6` | Coincide con el GLB. |
| `SUSPENSION_REST_LENGTH` | `0.25` | Ajustar para que las ruedas toquen el suelo. |
| `MAX_ENGINE_FORCE` | `900` por rueda | Ajustar según masa y sensación. |
| `MAX_BRAKE` | `8` | Freno normal. |
| `MAX_STEER` | `0.55 rad` | ≈ 31°. |
| `MAX_SPEED` | `40 m/s` | Límite de validación del servidor. |
| `STATE_INTERVAL_MS` | `100` | 10 Hz. |
| `IMPACT_SPEED_THRESHOLD` | `5 m/s` | Por debajo no hay daño. |
| `IMPACT_COOLDOWN_MS` | `600` | Servidor y cliente. |
| `RESPAWN_MS` | `5000` | 5 s. |
| `SPAWN_SAFE_RADIUS` | `3 m` | Retrasa el respawn. |

## 8. Verificación

```bash
# Backend: tipos y arranque
cd backend && bunx tsc --noEmit
cd backend && bun run dev

# Frontend: tipos, formato acotado y build
cd frontend && bun run check
cd frontend && bunx prettier --check \
  src/lib/services/protocol.ts \
  src/lib/services/lobbySocket.ts \
  src/lib/state/cars.svelte.ts \
  src/lib/state/carConfig.ts \
  src/lib/state/carInput.ts \
  src/lib/state/lobby.svelte.ts \
  src/lib/components/cars \
  src/lib/components/ui/CarHud.svelte \
  src/lib/components/ui/CarPrompt.svelte \
  src/lib/components/player/PlayerCollider.svelte \
  src/lib/components/player/PlayerBehaviour.svelte \
  src/lib/components/player/Player.svelte \
  src/lib/components/player/RemoteHeroes.svelte \
  src/lib/components/camera/ThirdPersonCamera.svelte \
  src/lib/components/ui/MobileControls.svelte \
  src/lib/Scene.svelte
cd frontend && bun run build
```

Smoke test de dos clientes (backend levantado, en otra terminal):

```bash
cd backend && bun -e '
const url = "ws://localhost:3000/ws";
const send = (ws, msg) => ws.send(JSON.stringify(msg));
const a = new WebSocket(url);
const b = new WebSocket(url);
let carId = "car-calabaza";

a.onopen = () => send(a, { type: "join", name: "Ana" });
b.onopen = () => send(b, { type: "join", name: "Luis" });

a.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === "welcome") {
    send(a, { type: "player-position", x: -7, y: 0.4, z: 12, yaw: 0 });
    send(a, { type: "enter-car", carId });
  }
  if (msg.type === "cars-state") {
    const car = msg.cars.find((item) => item.id === carId);
    console.log("Ana", car.status, car.driverId, car.position.x.toFixed(2));
  }
};

b.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === "welcome") {
    send(b, { type: "player-position", x: 0, y: 0.4, z: 12, yaw: 0 });
    setTimeout(() => send(b, { type: "enter-car", carId }), 500);
  }
  if (msg.type === "error") console.log("Luis error", msg.code);
};

setTimeout(() => { a.close(); b.close(); process.exit(0); }, 4000);
'
```

Casos manuales:

1. Abrir `http://localhost:5173` con el backend levantado; el mapa exterior debe mostrar los tres coches sobre el suelo, con el morro en el sentido de avance.
2. Acercarse a un coche disponible; aparece `E — Conducir Coche Calabaza`. Pulsar `E`; el avatar desaparece, la cámara pasa al coche y el HUD muestra velocidad y salud.
3. Conducir con `W/A/S/D`; el coche acelera, frena, gira y choca contra vallas/edificios sin atravesarlos. Las ruedas giran y las delanteras se orientan.
4. Abrir una segunda pestaña; el segundo jugador ve el coche moverse interpolado y el avatar del conductor oculto. Si intenta entrar, recibe `CAR_OCCUPIED` y el prompt no se lo permite.
5. Pulsar `E` para salir; el conductor aparece al lado izquierdo, recupera su avatar y el coche queda disponible en esa posición.
6. Chocar contra un edificio a velocidad alta; la salud baja, el HUD se actualiza y el daño no se repite en cada frame.
7. Insistir hasta 0 de salud; el coche explota, el conductor es eyectado, el HUD muestra la cuenta atrás y a los 5 s reaparece en el spawn con salud 100.
8. Cerrar la pestaña del conductor; el otro cliente ve el coche `available` y puede entrar.
9. Entrar en `minigame-2` mientras se conduce; el coche se libera y al volver al mapa exterior está disponible.
10. Probar en móvil: `Conducir` entra al coche, `Izq`/`Der` giran en el sentido correcto, `Acelerar`/`Freno`/`Reversa` responden, `Salir` devuelve al jugador a pie y el stick sigue funcionando al caminar.
11. Entrar/salir 10 veces y cambiar de escena; no deben quedar controladores, cuerpos ni errores de Rapier en consola.

## 9. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
| ------ | ------- | ---------- |
| Movimiento cliente-autoritativo permite teletransportes o velocidad excesiva | alto | Validar coordenadas, cuaternión, velocidad, delta de posición y frecuencia en el servidor; límites documentados. |
| Dos conductores ven colisiones distintas entre coches | medio | Cada cliente simula su coche y trata los remotos como cinemáticos; el servidor reconcilia posición y ocupación. Aceptado en esta fase. |
| El modelo queda girado 90° o las ruedas flotan | alto | Neutralizar `*_Root`, verificar con `?physics=1`, ajustar `CHASSIS_CENTER_Y` y conexiones de rueda. |
| El coche atraviesa el mapa por colliders incorrectos | alto | Reutilizar los colliders de `SPEC-009`/`SPEC-012`; el chasis es dinámico y las ruedas usan raycasts contra el mapa. |
| Spawns dentro de árboles, vallas o edificios | alto | Verificar los tres spawns con `?physics=1`; moverlos si hay solapamiento. |
| El respawn aparece encima de un jugador | medio | Última posición conocida + retraso de 1 s hasta 10 s si hay alguien a < 3 m. |
| El conductor se queda atascado dentro del coche al destruirse | alto | Eyección explícita a un lado del coche; si el punto es inválido, usar el spawn del jugador. |
| Controladores de vehículo huérfanos al salir o cambiar de escena | alto | `onDestroy` llama a `world.removeVehicleController`; `Car.svelte` se desmonta al salir de `global`. |
| El HUD o el prompt bloquean el canvas | medio | Paneles con `pointer-events-none` y solo botones con `pointer-events-auto`; `position: fixed`. |
| El servidor difunde demasiado estado | bajo | Snapshot a 10 Hz solo con coches ocupados; 3 coches y payload pequeño. |
| El jugador remoto se ve de pie sobre el coche | medio | `cars.driverIds` filtra `RemoteHeroes`; el conductor local oculta su avatar. |
| La cámara del jugador se queda mirando al coche tras salir | medio | Restaurar perfil exterior y `playerState` al salir; probar entrar/salir repetido. |
| Pérdida de estado al reiniciar el backend | bajo | Aceptado: estado en memoria; los coches vuelven a spawn. |
| El GLB tiene materiales costosos o muchos triángulos | medio | Tres modelos pequeños (~350 KB); si baja el rendimiento, reducir sombras o distancia de cámara. |
| El chat o los inputs capturan `W/A/S/D` mientras se conduce | medio | `CarControls` ignora inputs editables y `chat.isOpen`; `PlayerBehaviour` no procesa movimiento mientras conduce. |

## 10. Preguntas abiertas

- [ ] ¿Los spawns propuestos (`-7, 12`, `7, 12`, `0, 17`) son válidos o hay que moverlos tras revisar el mapa?
- [ ] ¿La muerte del coche debe eyeectar al conductor o también matar/reaparecer al jugador?
- [ ] ¿Los coches deben poder atropellar o dañar a jugadores, o solo colisionar?
- [ ] ¿La salud debe regenerarse con el tiempo o solo al reaparecer?
- [ ] ¿Se permite reparar el coche en algún punto del mapa?
- [ ] ¿La velocidad máxima y la fuerza del motor son las adecuadas para el tamaño del mapa?
- [ ] ¿Los coches deben poder entrar en la cripta o quedarse siempre en el mapa exterior?
- [ ] ¿Se necesita un botón de “reiniciar coche” si se queda atascado?
- [ ] ¿Se quieren sonidos de motor, choque y explosión en una fase posterior?
- [ ] ¿El estado de los coches debe persistir entre reinicios del backend?
- [ ] ¿Se necesita un sistema de llaves/propiedad o cualquiera puede conducir cualquier coche libre?
- [ ] ¿El servidor debe simular el movimiento en una fase futura para evitar cheats?

## 11. Decisiones y notas

- **Servidor autoritativo para ciclo de vida, cliente autoritativo para movimiento.** El backend decide quién conduce, cuándo se destruye y cuándo reaparece; el cliente que conduce simula Rapier y reporta posición/rotación/velocidad. Es el mismo reparto que ya existe para `player-position` y evita ejecutar Rapier en Bun.
- **Tres coches fijos, sin creación dinámica.** Los IDs son estables y no dependen del nombre visible ni del modelo.
- **Solo mapa exterior.** Los coches viven en `lobbyId === 'global'`; entrar en un mini lobby o en la cripta libera el coche.
- **Snapshot completo `cars-state`.** Con tres coches es más simple y robusto que eventos delta; se difunde a 10 Hz mientras haya coches ocupados y al cambiar cualquier estado.
- **Coches remotos cinemáticos.** El coche propio es dinámico; los demás se interpolan como cuerpos cinemáticos para que el jugador y el coche local colisionen con ellos sin simular dos veces la misma física.
- **El conductor no muere al destruirse el coche.** Es eyectado a un punto seguro y el coche reaparece a los 5 s. La muerte de jugador queda fuera de alcance.
- **Daño por impacto basado en pérdida de velocidad.** Evita depender de eventos de contacto de Rapier en Threlte y es suficiente para una primera versión; el servidor limita el daño por evento y el enfriamiento.
- **Modelo:** se neutraliza la rotación de `*_Root` para que el morro quede en `+X` local, que es el eje frontal del controlador. Las ruedas se localizan por nombre (`*_Wheel_FL/FR/RL/RR`) y se animan a partir de `wheelSteering`/`wheelRotation`.
- **Spawns iniciales:** `-7, 12`, `7, 12` y `0, 17` alrededor del spawn del jugador (`0, 0.4, 12`). Son provisionales y deben validarse con `?physics=1`.
- **El estado del servidor es un `Map` en memoria** y se reinicia con el proceso, igual que la presencia y `minigame-2`.
- **No se añaden dependencias.** Rapier ya incluye `DynamicRayCastVehicleController` en la versión instalada (`@dimforge/rapier3d-compat ^0.21.0`).
- **La UI de coches no bloquea el canvas.** Prompt y HUD son overlays con `pointer-events-none` salvo en botones concretos.
- **Signo de dirección.** El `DynamicRayCastVehicleController` de Rapier gira a la izquierda con un ángulo de dirección positivo; `CarPhysics` invierte el signo para que `D` (o el stick hacia la derecha) gire a la derecha. El ángulo visual de las ruedas usa el valor real del controlador, así que también queda coherente.
- **Controles táctiles de conducción.** En móvil, al conducir se sustituye el stick de a pie por un volante de botones: `Izq`/`Der` a la izquierda y `Acelerar`, `Freno`, `Reversa` y `Salir` a la derecha. El estado táctil vive en `carInput.touch` para poder mantener varios botones a la vez sin que se pisen, y el teclado recupera el control al soltarlos.
- **HUD de coche compacto en móvil.** En táctil el panel inferior de escritorio se sustituye por una píldora superior con velocidad y salud (o nombre y cuenta atrás al destruirse). El HUD de misiones se oculta mientras la píldora está visible y los controles táctiles recuperan toda la franja inferior.
- **El chat y los inputs editables tienen prioridad.** `E`, `W`, `A`, `S`, `D` y `Space` no se procesan si el foco está en un campo de texto o el chat está abierto.

## 12. Progreso

| Fecha | Estado | Nota |
| ----- | ------ | ---- |
| 2026-11-01 | borrador | Spec creado con física, muerte, ocupación y estado WS. |
| 2026-11-01 | implementado | Backend, frontend, física, daño, respawn, HUD y controles implementados. `bunx tsc --noEmit`, `bun run check`, Prettier acotado y `bun run build` pasan. Smoke test WS de dos clientes completo. Verificado en Chromium headless: render de los tres coches, spawns sin solapes, prompt, entrada/salida, HUD, cámara de coche y controles táctiles. |
| 2026-11-01 | implementado | Corregido el sentido de giro (A/D y stick iban invertidos) y añadidos los controles táctiles de conducción (`Izq`/`Der`, `Acelerar`, `Freno`, `Reversa`, `Salir`). El signo se comprobó con un test aislado de Rapier: dirección positiva = izquierda, por lo que el cliente invierte la entrada. |

Pendiente de prueba en dispositivo real y con dos pestañas en GPU: colisiones contra vallas/edificios, explosión y eyección, caída al vacío, liberación al entrar en minijuego/cripta, 10 entradas/salidas sin fugas y regresiones de chat/checkpoints/rollos/`minigame-2` (CA-9, CA-10, CA-13, CA-14, CA-16, CA-19, CA-20, CA-24).

## 13. Changelog

- 2026-11-01 — Creación del spec.
- 2026-11-01 — Implementación completa de backend y frontend; smoke test WS y verificación de build.
- 2026-11-01 — Corrección del sentido de giro (A/D invertidos) y controles táctiles de conducción con botones de dirección, acelerador, freno, reversa y salida.
- 2026-11-01 — HUD de coche compacto en táctil (píldora superior) para liberar la zona de controles y evitar solapes con el HUD de misiones.
