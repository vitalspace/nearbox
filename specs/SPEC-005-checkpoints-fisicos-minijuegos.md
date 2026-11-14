---
id: SPEC-005
titulo: "Checkpoints físicos con sensores Rapier para entrar a los minijuegos"
estado: completado # borrador | en-progreso | bloqueado | completado | cancelado
prioridad: alta # baja | media | alta | crítica
creado: 2026-10-30
actualizado: 2026-10-30
responsable: opencode
etiquetas: [frontend, rapier, threlte, svelte, checkpoints, minijuegos, websocket]
depende_de: [SPEC-002, SPEC-003]
bloquea: []
estimacion: "5h"
---

# SPEC-005 — Checkpoints físicos con sensores Rapier para entrar a los minijuegos

## 1. Contexto

El lobby WebSocket (`SPEC-002`) ya define tres mini lobbies (`minigame-1`, `minigame-2`, `minigame-3`) y la reconexión automática (`SPEC-003`). La entrada y salida de esos lobbies ya está implementada de extremo a extremo:

- Backend (`backend/src/index.ts`) procesa `enter-lobby` y `leave-lobby`, cambia el `lobbyId` del jugador en `backend/src/ws/presence.ts` y difunde un nuevo `presence` con `setLobby`.
- Protocolo compartido en `backend/src/ws/protocol.ts` y `frontend/src/lib/services/protocol.ts`: `ClientMessage` incluye `{ type: 'enter-lobby', lobbyId }`, `{ type: 'leave-lobby' }` y `ServerMessage` incluye `welcome`/`presence`/`error`.
- Frontend (`frontend/src/lib/services/lobbySocket.ts` y `frontend/src/lib/state/lobby.svelte.ts`) expone `lobby.enterLobby(id)` y `lobby.leaveLobby()`; `LobbyOverlay.svelte` ya los usa desde la lista de "Mini lobbies".

Sin embargo, la única forma de entrar a un minijuego es el botón del panel HTML de la esquina superior derecha. El mundo 3D todavía no participa: `Ground.svelte` solo contiene una caja de suelo de 20×20 con `AutoColliders`, y el personaje (`PlayerBehaviour.svelte`) se mueve con lógica manual (WASD/flechas/Espacio, límite ±9) sin ningún cuerpo de Rapier. El único contacto con la física es el suelo estático, que hoy no se usa para nada.

Se quiere que el jugador entre al minijuego caminando hasta un checkpoint del mundo. El checkpoint actúa como un "guardián": un área física invisible (sensor de Rapier) que vigila cuándo el collider del jugador entra y sale. Al estar dentro, aparece un aviso y el jugador pulsa `E` para entrar al mini lobby correspondiente. Salir del área oculta el aviso. La lógica de lobby ya existe; lo que falta es el puente entre el mundo 3D y esa lógica.

## 2. Objetivo

Añadir tres checkpoints físicos al suelo, uno por minijuego, implementados como sensores de Rapier que detectan el collider cinemático del jugador. Mientras el jugador esté dentro de un checkpoint verá un aviso con el nombre del minijuego y podrá pulsar `E` (o el botón del aviso) para entrar o salir del mini lobby, reutilizando la conexión y el protocolo WebSocket existentes sin modificar el backend.

## 3. Alcance

**Incluye**

- Definición única de los tres checkpoints en el frontend: id de minijuego, nombre, posición, color y dimensiones del área.
- Render de los tres checkpoints en `Ground.svelte`, con una representación visual discreta sobre el suelo.
- Collider sensor estático por checkpoint (`sensor: true`), con eventos `onsensorenter` / `onsensorexit`.
- Collider cinemático del jugador (`kinematicPosition`) que sigue su posición visual para que los sensores puedan detectarlo.
- Sincronización del collider del jugador desde `playerState` en cada paso de física (`usePhysicsTask`).
- Estado reactivo compartido del checkpoint activo (`activeCheckpointId`), con soporte para cruces de zonas.
- HUD inferior con el nombre del minijuego y la acción disponible (`E` para entrar / salir).
- Manejo de `E` con guardas: sin autorrepetición, sin modificadores, ignorando campos editables (chat/alias) y sin actuar si el socket no está conectado.
- Botón clicable en el HUD como alternativa al teclado.
- Reutilización de `lobby.enterLobby` / `lobby.leaveLobby` y del estado `lobby.self?.lobbyId`; sin abrir una segunda conexión WebSocket.
- Actualización visual del checkpoint activo (por ejemplo, color/emissive y escala del anillo).
- Documentación del comportamiento y de las coordenadas en el spec.

**No incluye**

- Cambios en el backend, en el protocolo WebSocket, en `presence.ts` ni en el esquema Zod.
- Validación de posición en el servidor o anti-cheat: el servidor sigue aceptando `enter-lobby` de cualquier cliente unido.
- Carga de una escena, nivel o minijuego 3D distinto: "entrar" significa unirse al mini lobby y reflejarlo en la presencia, igual que el botón actual.
- Teletransporte del jugador dentro del minijuego, salas separadas, instancias o matchmaking.
- Nuevos modelos GLTF, texturas, fuentes 3D, partículas o shaders.
- Controles táctiles completos para mover al personaje.
- Cambios en el chat (`SPEC-004`) más allá de la guarda para no disparar `E` mientras se escribe.
- Reemplazo o rediseño del panel `LobbyOverlay`; ambos accesos conviven.
- Persistencia del minijuego activo más allá de la sesión del socket.

## 4. Requisitos

### Funcionales

| ID    | Requisito                                                                                                                                                                       | Prioridad |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| RF-1  | Existe una única fuente de verdad `CHECKPOINTS` con exactamente tres entradas: `minigame-1`, `minigame-2` y `minigame-3`, cada una con `id`, `name`, `position`, `color` y `radius`. | alta      |
| RF-2  | Las tres posiciones caen dentro del suelo jugable (±9 en X/Z), están separadas al menos 4 unidades entre sí y ninguna coincide con el spawn `(0, 0, 0)`.                        | alta      |
| RF-3  | `Ground.svelte` renderiza los tres checkpoints iterando `CHECKPOINTS`; no hay coordenadas duplicadas ni hardcodeadas fuera de la definición.                                      | alta      |
| RF-4  | Cada checkpoint crea un collider estático `sensor: true` con forma de cilindro o caja que cubre al jugador de pies a cabeza y un radio mínimo de 2 unidades.                     | alta      |
| RF-5  | El sensor emite `onsensorenter` al entrar el collider del jugador y `onsensorexit` al salir; solo esos eventos modifican el checkpoint activo.                                    | alta      |
| RF-6  | El estado compartido expone `activeCheckpointId`; al entrar en una zona se fija ese id y al salir solo se limpia si el id que sale es el activo.                                  | alta      |
| RF-7  | El jugador tiene un rigid body `kinematicPosition` con un collider (cápsula o cubo) que representa su volumen físico; no se ve afectado por la gravedad ni por el suelo.          | alta      |
| RF-8  | El rigid body del jugador se sincroniza con `playerState.x`, `playerState.y` y `playerState.z` en cada paso de física, antes de que Rapier simule, usando `setNextKinematicTranslation`. | alta      |
| RF-9  | Mientras `activeCheckpointId` no sea `null`, se muestra un HUD inferior centrado con el nombre del minijuego y la acción disponible.                                              | alta      |
| RF-10 | Si el jugador no está en ningún mini lobby (o está en otro), el HUD muestra "Pulsa E para entrar a <nombre>" y `E` llama a `lobby.enterLobby(id)`.                              | alta      |
| RF-11 | Si el jugador ya está en el mini lobby de ese checkpoint, el HUD muestra "Pulsa E para salir" y `E` llama a `lobby.leaveLobby()`.                                                | alta      |
| RF-12 | Si el socket no está `connected`, el HUD muestra un aviso de conexión y `E` no envía mensajes ni provoca `NOT_CONNECTED` en el panel de lobby.                                  | alta      |
| RF-13 | `E` se ignora si el evento es autorrepetición, si hay `Ctrl`/`Meta`/`Alt`, o si el foco está en `input`, `textarea`, `select` o `[contenteditable]` (incluido el chat).          | alta      |
| RF-14 | El HUD incluye un botón clicable con la misma acción, etiqueta accesible en español y estado deshabilitado cuando no hay conexión.                                               | media     |
| RF-15 | El HUD desaparece cuando `activeCheckpointId` pasa a `null` y no captura clics fuera de su botón (`pointer-events-none` en el contenedor).                                       | alta      |
| RF-16 | Entrar o salir desde un checkpoint actualiza `lobby.self.lobbyId` mediante el `presence` del servidor; el HUD y `LobbyOverlay` reflejan el cambio sin recargar.                   | alta      |
| RF-17 | No se envía `enter-lobby` si el jugador ya está en ese lobby, ni `leave-lobby` si está en `global`, evitando los errores `ALREADY_IN_LOBBY` / `NOT_IN_LOBBY`.                     | alta      |
| RF-18 | El checkpoint activo se distingue visualmente (emissive, opacidad o color más intenso) y vuelve a su estado base al salir.                                                        | media     |
| RF-19 | Los listeners de teclado del HUD y los eventos de sensor se eliminan al desmontar los componentes; no quedan colisiones huérfanas en el mundo Rapier.                              | alta      |
| RF-20 | El sensor no bloquea el paso: el jugador puede atravesarlo y seguir moviéndose con normalidad.                                                                                   | alta      |
| RF-21 | Cruzar rápidamente una zona (velocidad máxima 8 u/s) no impide la detección: el volumen del sensor cubre al jugador durante varios frames.                                        | media     |
| RF-22 | `LobbyOverlay` sigue funcionando como hasta ahora; sus botones y los checkpoints comparten el mismo estado y no se desincronizan.                                                 | alta      |

### No funcionales

| ID    | Requisito                                                       | Criterio                                                                                             |
| ----- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| RNF-1 | Sin dependencias nuevas.                                        | Solo `@threlte/core`, `@threlte/rapier`, `three`, Svelte y Tailwind ya instalados                     |
| RNF-2 | Sin errores de tipos ni de formato en los archivos tocados.     | `bun run check` y `bunx prettier --check <archivos tocados>` pasan; `bun run lint` global aún reporta 3 archivos preexistentes ajenos a este spec |
| RNF-3 | Sin errores de TypeScript en el backend.                        | `cd backend && bunx tsc --noEmit` termina con código 0                                               |
| RNF-4 | Coste físico despreciable.                                      | 3 colliders estáticos + 1 collider cinemático; sin cuerpos dinámicos adicionales                      |
| RNF-5 | Sin regresión de rendimiento notoria.                           | El escenario mantiene una sensación de 60 fps en un equipo de desarrollo típico                       |
| RNF-6 | Sin duplicación del contrato.                                   | Los ids de checkpoint son exactamente `MinigameLobbyId`; no se redefinen strings sueltos              |
| RNF-7 | Sin fugas de memoria ni de eventos.                             | Desmontar `Checkpoint`, `PlayerCollider` y `CheckpointPrompt` libera colliders y listeners            |
| RNF-8 | Accesibilidad básica.                                           | El aviso usa `role="status"`/`aria-live="polite"`, el botón tiene texto visible y `aria-label` claro  |
| RNF-9 | Compatibilidad con el protocolo actual.                         | `join`, `presence`, `enter-lobby`, `leave-lobby`, `ping` y `error` siguen funcionando igual            |
| RNF-10 | El HUD no interfiere con el canvas ni con el pointer lock.      | Contenedor `fixed`, `pointer-events-none`; solo el botón captura clics                                |

## 5. Criterios de aceptación

- [x] CA-1: Existen exactamente tres checkpoints en el suelo, uno por `minigame-1`, `minigame-2` y `minigame-3`, visibles y separados.
- [x] CA-2: Al caminar hasta un checkpoint, el HUD inferior muestra el nombre del minijuego y "Pulsa E para entrar".
- [x] CA-3: Al alejarse del checkpoint, el HUD desaparece y `activeCheckpointId` vuelve a `null`.
- [x] CA-4: Con el socket conectado, pulsar `E` dentro del checkpoint 2 envía `enter-lobby` con `lobbyId: "minigame-2"` y el jugador aparece en ese mini lobby en `LobbyOverlay`.
- [x] CA-5: Estando dentro del mini lobby 2, volver al checkpoint 2 muestra "Pulsa E para salir" y `E` devuelve al jugador a `global`.
- [x] CA-6: Pulsar `E` con el socket desconectado no envía nada, no muestra `NOT_CONNECTED` y el HUD indica que hay que conectarse.
- [x] CA-7: Pulsar `E` mientras se escribe en el chat o en el alias no entra al minijuego ni escribe la letra.
- [x] CA-8: Mantener pulsada `E` no genera entradas repetidas ni errores `ALREADY_IN_LOBBY`.
- [x] CA-9: El botón del HUD hace lo mismo que `E` y es accesible con teclado.
- [x] CA-10: El sensor no bloquea el movimiento: el jugador puede entrar, quedarse y salir caminando.
- [x] CA-11: Al entrar al minijuego 1 desde su checkpoint, el panel de lobby y el HUD muestran el mismo `lobbyId`.
- [x] CA-12: `cd frontend && bun run check`, `bunx prettier --check` sobre los archivos tocados y `cd backend && bunx tsc --noEmit` pasan sin errores. `bun run lint` global sigue fallando solo por 3 archivos preexistentes (`world.svelte`, `Sky.svelte` y un JSON de assets).

## 6. Archivos relevantes

| Ruta                                                        | Acción     | Motivo                                                                                                    |
| ----------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------- |
| `frontend/src/lib/state/checkpoints.svelte.ts`              | crear      | Fuente de verdad de los 3 checkpoints y estado reactivo `activeCheckpointId`.                             |
| `frontend/src/lib/components/world/Checkpoint.svelte`       | crear      | Visual del checkpoint + collider sensor + eventos `onsensorenter` / `onsensorexit`.                       |
| `frontend/src/lib/components/world/Ground.svelte`           | modificar  | Renderizar los 3 checkpoints sobre el suelo existente.                                                    |
| `frontend/src/lib/components/player/PlayerCollider.svelte`  | crear      | Rigid body cinemático del jugador y sincronización con `playerState` en `usePhysicsTask`.                  |
| `frontend/src/lib/components/player/Player.svelte`          | modificar  | Montar `PlayerCollider` junto al `InstancedSprite`.                                                       |
| `frontend/src/lib/components/ui/CheckpointPrompt.svelte`    | crear      | HUD inferior con nombre, acción y manejo de `E` / botón.                                                  |
| `frontend/src/routes/+page.svelte`                          | modificar  | Montar `CheckpointPrompt` junto a `Canvas` y `LobbyOverlay`.                                              |
| `frontend/src/lib/state/lobby.svelte.ts`                    | modificar  | Añadir helpers `isInLobby(id)` / `isInMinigame` para evitar mensajes redundantes y centralizar guardas.    |
| `frontend/src/lib/components/ui/LobbyOverlay.svelte`        | sin cambio | Sigue usando `lobby.enterLobby` / `lobby.leaveLobby`; no necesita cambios, solo verificar la convivencia. |
| `frontend/src/lib/components/player/PlayerBehaviour.svelte` | sin cambio | Ya publica `playerState` cada frame; el collider lo consume sin tocar el movimiento.                       |
| `frontend/src/lib/services/lobbySocket.ts`                  | sin cambio | `enterLobby` / `leaveLobby` ya existen.                                                                   |
| `frontend/src/lib/services/protocol.ts`                     | sin cambio | `MinigameLobbyId` y los mensajes ya cubren el caso.                                                       |
| `backend/src/index.ts`                                      | sin cambio | Los handlers `enter-lobby` y `leave-lobby` ya están implementados.                                        |
| `backend/src/ws/protocol.ts`                                | sin cambio | Los ids de minijuego ya están validados con Zod.                                                          |
| `backend/src/ws/presence.ts`                                | sin cambio | `setLobby` ya actualiza y difunde la presencia.                                                           |

## 7. Plan de implementación

### Fase 1 — Definición y visuales de los checkpoints

- [x] Paso 1: Crear `frontend/src/lib/state/checkpoints.svelte.ts`:
  - Tipo `CheckpointDefinition = { id: MinigameLobbyId; name: string; position: [number, number, number]; color: string; radius: number }`.
  - Constante congelada `CHECKPOINTS` con tres entradas, por ejemplo:
    - `minigame-1` → `name: 'Minijuego 1'`, `position: [-6, 0, -6]`, `color: '#22d3ee'`, `radius: 2`.
    - `minigame-2` → `name: 'Minijuego 2'`, `position: [6, 0, -6]`, `color: '#c084fc'`, `radius: 2`.
    - `minigame-3` → `name: 'Minijuego 3'`, `position: [0, 0, 6]`, `color: '#4ade80'`, `radius: 2`.
  - Clase `CheckpointStore` con `activeCheckpointId = $state<MinigameLobbyId | null>(null)`, `enter(id)` y `exit(id)` (limpiar solo si coincide).
  - Exportar `checkpoints = new CheckpointStore()`.
- [x] Paso 2: Crear `frontend/src/lib/components/world/Checkpoint.svelte` con props `id`, `name`, `position`, `color`, `radius`.
  - `<T.Group position={position}>`.
  - Visual tipo portal de energía: disco tintado en el suelo, halo radial aditivo, aro nítido + glow, tres arcos giratorios, columna de luz con degradado vertical, núcleo brillante, anillo que asciende, cristal flotante con aura y 5 chispas en órbita. Todo generado con `MeshBasicMaterial`/geometrías de Three y texturas de canvas procedurales (sin assets externos).
  - Sensor: `<Collider shape="cylinder" args={[1.5, 2]} type="static" sensor onsensorenter={...} onsensorexit={...} />` (`halfHeight = 1.5`, `radius = 2`) centrado en `y = 1.5`, de modo que cubre de `y = 0` a `y = 3`. Si se usa `AutoColliders`, marcar `sensor` y usar un mesh hijo oculto; preferir `Collider` directo para no acoplar el visual.
  - En `onsensorenter`, llamar `checkpoints.enter(id)`; en `onsensorexit`, `checkpoints.exit(id)`.
  - Resaltar cuando `checkpoints.activeCheckpointId === id` (emissive/opacidad/escala).
- [x] Paso 3: Modificar `frontend/src/lib/components/world/Ground.svelte` para importar `CHECKPOINTS` y renderizar `{#each CHECKPOINTS as checkpoint (checkpoint.id)} <Checkpoint {...checkpoint} /> {/each}` dentro del grupo del suelo. Mantener intacto el `AutoColliders` del piso.

### Fase 2 — Collider cinemático del jugador

- [x] Paso 1: Crear `frontend/src/lib/components/player/PlayerCollider.svelte`:
  - `<RigidBody type="kinematicPosition" colliders={false} lockRotations oncreate={(body) => (rigidBody = body)}>` con `<Collider shape="capsule" args={[0.6, 0.45]} />` o `shape="cuboid" args={[0.45, 1.1, 0.45]}`.
  - Guardar la referencia del body creado.
- [x] Paso 2: Usar `usePhysicsTask` para llamar `rigidBody.setNextKinematicTranslation({ x: playerState.x, y: playerState.y + 1.1, z: playerState.z })` antes de cada simulación.
  - No usar fuerzas, gravedad ni velocidades: el movimiento sigue siendo el de `PlayerBehaviour`.
  - Ignorar el primer frame si el body aún no existe.
- [x] Paso 3: Modificar `frontend/src/lib/components/player/Player.svelte` para montar `<PlayerCollider />` junto al `InstancedSprite` (fuera del mismo, en el nivel raíz del componente).
- [x] Paso 4: Verificar en modo `Debug` de Rapier (`Canvas.svelte` ya tiene `debug`) que el collider del jugador se mueve con el sprite y que el suelo no lo desplaza.

### Fase 3 — Estado y guardas en el store de lobby

- [x] Paso 1: En `frontend/src/lib/state/lobby.svelte.ts`, añadir:
  - `get currentLobbyId(): LobbyId | null` a partir de `this.self?.lobbyId`.
  - `isInLobby(lobbyId: MinigameLobbyId): boolean`.
  - `isInMinigame(): boolean`.
  - Opcional: `toggleLobby(lobbyId: MinigameLobbyId)` que entre si no está en ese lobby y salga si ya está, reutilizando `enterLobby`/`leaveLobby`.
- [x] Paso 2: Mantener las guardas de conexión existentes (`socket.isOpen()` → `reportNotConnected()`), sin duplicar mensajes.
- [x] Paso 3: Confirmar que `onPresence` actualiza `self` con el jugador encontrado por id (ya implementado) para que el HUD reaccione sin recargar.

### Fase 4 — HUD y tecla E

- [x] Paso 1: Crear `frontend/src/lib/components/ui/CheckpointPrompt.svelte`:
  - Leer `checkpoints.activeCheckpointId` y buscar su definición en `CHECKPOINTS`.
  - Derivar `isHere = lobby.isInLobby(active.id)`, `connected = lobby.status === 'connected'`.
  - Texto:
    - Sin conexión → "Conéctate para entrar a <nombre>".
    - `isHere` → "Estás en <nombre> · Pulsa E para salir".
    - Otro caso → "Pulsa E para entrar a <nombre>".
  - Botón que llama a la acción (`leaveLobby` o `enterLobby`), `disabled` si no hay conexión.
  - `onMount`/`$effect` con `window.addEventListener('keydown', onKeyDown)` y limpieza en el `return`.
  - `onKeyDown`: comprobar `event.code === 'KeyE'`, `!event.repeat`, sin `ctrlKey/metaKey/altKey`, y `isEditableTarget(event.target)`; luego `event.preventDefault()` y ejecutar la acción.
  - `isEditableTarget`: `target instanceof HTMLElement` y `target.closest('input, textarea, select, [contenteditable="true"]')`.
  - Contenedor `fixed bottom-6 left-1/2 -translate-x-1/2 z-40 pointer-events-none`; botón con `pointer-events-auto`.
  - `role="status"` y `aria-live="polite"`; estilo Tailwind coherente con `LobbyOverlay` (fondo `slate-950/85`, borde blanco/10, texto claro).
- [x] Paso 2: Modificar `frontend/src/routes/+page.svelte` para montar `<CheckpointPrompt />` después de `<LobbyOverlay />`.
- [x] Paso 3: Añadir `aria-label` al botón, por ejemplo `Entrar al Minijuego 1` / `Salir del Minijuego 1`.
- [x] Paso 4: Comprobar que el HUD no tapa el chat de `SPEC-004` (esquina superior izquierda) ni el panel de lobby (esquina superior derecha).

### Fase 5 — Pulido y verificación

- [x] Paso 1: Ajustar visuales de los checkpoints para que se lean sobre el suelo y no tapen al personaje.
- [x] Paso 2: Probar cruces entre zonas, entrada/salida repetida y reconexión del socket dentro de una zona.
- [x] Paso 3: Ejecutar la verificación de la sección 8.
- [x] Paso 4: Actualizar este spec: estado, progreso, checkboxes y changelog.

## 8. Verificación

```bash
# Frontend
cd frontend && bun run check && bun run lint

# Backend (sin cambios, se verifica que sigue compilando)
cd backend && bunx tsc --noEmit
```

Casos manuales:

1. Arrancar backend y frontend (`cd backend && bun run dev`; `cd frontend && bun run dev`) y abrir el juego.
2. Caminar hasta cada uno de los tres checkpoints y comprobar que el HUD muestra el nombre correcto.
3. Entrar al checkpoint 1, pulsar `E` y verificar en `LobbyOverlay` que el jugador aparece en "Minijuego 1".
4. Volver al mismo checkpoint y comprobar que el HUD ofrece salir; pulsar `E` y verificar que vuelve a "Global".
5. Entrar al checkpoint 2, luego caminar al checkpoint 3 y pulsar `E`: debe cambiar de `minigame-2` a `minigame-3` sin error.
6. Desconectar el socket desde el panel y pulsar `E` dentro de una zona: no debe enviarse nada ni aparecer `NOT_CONNECTED`.
7. Abrir el chat (`SPEC-004`) y pulsar `E` mientras se escribe: no debe entrar al minijuego.
8. Mantener `E` pulsada 2 segundos: no debe haber mensajes repetidos ni `ALREADY_IN_LOBBY`.
9. Activar `debug` en `Canvas.svelte` y comprobar que el collider del jugador sigue al sprite y que los sensores son atravesables.
10. Entrar y salir de una zona varias veces para confirmar que no quedan colliders ni listeners duplicados.

## 9. Riesgos y mitigaciones

| Riesgo                                                                 | Impacto | Mitigación                                                                                                                        |
| ---------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| El sensor no emite eventos porque el collider del jugador no existe.   | alto    | Implementar `PlayerCollider` antes de cablear los sensores y validar con `Debug` de Rapier.                                       |
| El collider cinemático va un frame por detrás del sprite.              | bajo    | Usar `usePhysicsTask` (antes de la simulación) y un volumen de sensor de 2 unidades de radio y 3 de alto.                         |
| El jugador puede atravesar el sensor a velocidad 8 u/s.                | bajo    | El sensor cubre 6 unidades de diámetro y 3 de alto; a 60 fps el desplazamiento es ~0.13 u/frame.                                   |
| `E` entra en conflicto con el chat o el alias.                         | alto    | Guarda `isEditableTarget` y comprobación de modificadores/autorrepetición, igual que el patrón de `SPEC-004`.                      |
| Se envían mensajes redundantes (`ALREADY_IN_LOBBY`, `NOT_IN_LOBBY`).    | medio   | Usar `lobby.isInLobby(id)` y `lobby.isInMinigame()` antes de enviar; el HUD refleja la acción correcta.                            |
| El HUD tapa otros overlays o bloquea el canvas.                        | medio   | Contenedor `pointer-events-none`, posición inferior centrada, solo el botón con `pointer-events-auto`.                            |
| Zonas solapadas hacen que el estado oscile.                            | bajo    | Separar los checkpoints al menos 4 unidades y limpiar `activeCheckpointId` solo si el id que sale coincide con el activo.        |
| Los eventos de sensor se disparan con el suelo u otros colliders.      | medio   | El suelo es fijo y no tiene collider cinemático; solo el jugador se mueve. Si hiciera falta, limitar con `collisionGroups`.       |
| El servidor sigue aceptando `enter-lobby` sin posición.                | bajo    | Es aceptable en este alcance; la validación física es de cliente. Documentado como "No incluye".                                  |
| Cambios en el tamaño del suelo rompen las coordenadas.                 | bajo    | Las posiciones viven en `CHECKPOINTS` y se validan contra el límite ±9 en revisión; el suelo actual es 20×20.                      |

## 10. Preguntas abiertas

- [x] ¿Las posiciones propuestas (`[-6, 0, -6]`, `[6, 0, -6]`, `[0, 0, 6]`) y los colores son los definitivos, o se quiere otro layout (por ejemplo, en línea o alrededor del spawn)?
  si agregales un color distinto aca cada uno pero deja especificado que se tiene que hacer para modificarlos al gusto
  **Resuelto:** cada checkpoint usa un color distinto (`#22d3ee` cian, `#c084fc` violeta, `#4ade80` verde). Para cambiarlos, edita el campo `color` de cada entrada en `frontend/src/lib/state/checkpoints.svelte.ts`; el componente `Checkpoint.svelte` deriva de ese valor el disco, halo, aros, haz, anillo y cristal. Para cambiar tamaño/intensidad, ajusta `radius` en el mismo archivo o las opacidades base en `Checkpoint.svelte`. 

- [ ] ¿El aviso debe mostrar también el número de jugadores dentro del mini lobby?
  si esta bien
- [ ] ¿`E` debe salir del mini lobby cuando ya estás dentro, o solo entrar y dejar la salida al panel de `LobbyOverlay`?
  si en el checkpoint sale como texto flotante, cuando preicona e entonces entras al mini game
- [ ] ¿Se quiere un efecto sonoro o una animación al entrar/salir, o basta con el cambio visual del checkpoint y el HUD?
  si por que no
- [ ] ¿Debe funcionar también con mando/táctil en esta iteración o solo teclado y clic?
  si claro seria un plus para mobil

## 11. Decisiones y notas

- **Sin cambios en backend**: `enter-lobby` y `leave-lobby` ya existen y validan `MinigameLobbyId` con Zod. El checkpoint es solo una nueva forma de disparar los mismos mensajes.
- **"Entrar" = unirse al mini lobby**, no cargar otra escena. Cualquier transición visual de nivel queda fuera de alcance.
- **Sensor, no trigger de contacto**: se usa `sensor: true` para que el área no produzca contactos físicos y el jugador pueda atravesarla. Threlte activa `ActiveEvents.COLLISION_EVENTS` automáticamente al registrar `onsensorenter`/`onsensorexit` (`applyColliderActiveEvents`).
- **Collider del jugador cinemático**: `PlayerBehaviour` mantiene su movimiento manual; el collider solo replica la posición para que Rapier pueda detectarlo. No se migra el control a física en este spec.
- **Una sola fuente de verdad**: `CHECKPOINTS` en `checkpoints.svelte.ts`; `Ground.svelte` y `CheckpointPrompt.svelte` la consumen. Los ids son `MinigameLobbyId`, no strings libres.
- **Convención de tecla**: `E` es la tecla de interacción; se documenta en el HUD para que el jugador la descubra sin leer código.
- **Conviviencia con `LobbyOverlay`**: el panel sigue siendo la vía alternativa; ambos leen `lobby.self.lobbyId` y el mismo socket, por lo que no hay estado duplicado.
- **Debug**: `Canvas.svelte` ya expone `debug`; se reutiliza para validar colliders durante el desarrollo, sin añadir UI nueva.
- **Sensores elevados 0,1 u sobre el suelo**: el suelo es un cubo de 20×1×20 centrado en `y = -0.5`, así que su cara superior está exactamente en `y = 0`. El cilindro sensor vive en `y = 1.6` con `halfHeight = 1.5` (de `y = 0.1` a `y = 3.1`) para no intersectar el collider del suelo y aun así solaparse siempre con la cápsula del jugador (de `y = 0` a `y = 2.1`).
- **`ActiveCollisionTypes.ALL`**: Rapier no detecta por defecto colisiones entre cuerpos kinematic y fixed. Threlte aplica `ActiveCollisionTypes.ALL` a cada collider creado con su componente `Collider`, por lo que el sensor fijo sí detecta al jugador cinemático. Esto se validó con un script aislado de Rapier antes de la prueba en navegador.
- **Verificación E2E**: en Chromium headless se movió al jugador hasta `(-5.66, -6.06)`, apareció el HUD de "Minijuego 1", se pulsó `E` y el backend pasó al jugador a `minigame-1`; el HUD cambió a "Estás dentro · pulsa E para salir" y `LobbyOverlay` mostró el mini lobby activo.
- **Diseño visual final**: checkpoints tipo portal de energía con disco tintado, halo radial, aro nítido, arcos giratorios, haz de luz, núcleo, anillo ascendente, cristal flotante y chispas. Los colores viven solo en `CHECKPOINTS`; `Checkpoint.svelte` los consume y genera el resto del efecto automáticamente. El estado activo intensifica opacidades, acelera los giros y agranda el cristal.

## 12. Progreso

| Fecha      | Estado   | Nota        |
| ---------- | -------- | ----------- |
| 2026-10-30 | borrador | Spec creado |
| 2026-10-30 | completado | Implementación terminada y verificada con `bun run check`, `bun run build`, `bunx tsc --noEmit` y una prueba E2E en Chromium headless (mover al checkpoint 1 → HUD → `E` → `minigame-1`). |

## 13. Changelog

- 2026-10-30 — Creación del spec.
- 2026-10-30 — Implementación completada: `checkpoints.svelte.ts`, `Checkpoint.svelte`, `PlayerCollider.svelte`, `CheckpointPrompt.svelte`; `Ground.svelte`, `Player.svelte`, `+page.svelte` y `lobby.svelte.ts` adaptados. Verificado en navegador headless.
- 2026-10-30 — Rediseño visual de los checkpoints: portal de energía con halo, arcos, haz, cristal, chispas y anillo ascendente; colores cian/violeta/verde.
- 2026-11-11 — El HUD y el cartel 3D muestran la fase del mini lobby (`waiting`, `countdown`, `playing`, `results`) y cierran la entrada cuando `canEnter` es falso. Los checkpoints dejan de renderizarse durante Grand Prix/Haunted Highway, donde el mapa del hub sigue cargado.
