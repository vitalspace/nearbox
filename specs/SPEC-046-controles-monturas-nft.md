---
id: SPEC-046
titulo: "Monturas NFT conducibles: skateboard y escoba mágica"
estado: completado
prioridad: alta
creado: 2026-11-14
actualizado: 2026-11-14
responsable: opencode
etiquetas:
  [
    nft,
    vehicle,
    skateboard,
    magic-broom,
    ride,
    controles,
    hub,
    fisicas,
    rapier,
    frontend,
    svelte,
  ]
depende_de: [SPEC-044, SPEC-037, SPEC-009, SPEC-014, SPEC-006, SPEC-001]
bloquea: []
estimacion: "4h"
---

# SPEC-046 — Monturas NFT conducibles: skateboard y escoba mágica

## 1. Contexto

`SPEC-044` equipara los NFTs de vehículo (`skateboard`, `magic-broom`) y los
renderiza como accesorio cosmético del avatar, pero dejaba explícitamente fuera
"vehículos conducibles en el hub". El jugador podía llevar la tabla o la escoba
a la espalda/pies, pero no subirse ni moverse con ellas.

`SPEC-014` ya define la conducción de los coches del hub y `SPEC-037` los
controles del globo aerostático: ambos usan `carInput` (WASD/flechas + botones
táctiles) y publican la posición del ocupante. Este spec añade una tercera
categoría de vehículo, más ligera: la montura NFT equipada en
`equipment.vehicle`.

La idea es reutilizar el controlador de personaje de `PlayerCollider` en vez de
crear un segundo cuerpo Rapier. La cápsula del jugador sigue colisionando con el
mapa; lo único que cambia es cómo se calcula la velocidad y el rumbo.

## 2. Objetivo

Que un jugador con el skateboard o la escoba mágica equipados pueda pulsar `E`
en el hub para montarse y conducir con WASD/flechas (o el stick táctil), con la
pose correcta (`HR_idle` de pie en la tabla, `HR_sit` sentado en la escoba), y
que otros clientes vean la montura y el movimiento por la presencia existente.

## 3. Alcance

**Incluye**

- Nuevo store `frontend/src/lib/state/ride.svelte.ts` con:
  - `RideId = 'skateboard' | 'magic-broom'`.
  - `RIDE_TUNING` (modelo, tamaño, altura visual, altura de pies, velocidades,
    aceleración, frenada, arrastre, giro y clip).
  - `rideIdFromCatalog()` para mapear el id del catálogo NFT.
  - `RideStore` (`activeId`, `speed`, `yaw`, `isRiding`, `equippedId`,
    `equipped`, `tuning`, `canRide`, `mount`, `dismount`, `toggle`, `reset`).
- Montaje/desmontaje con `E` desde `CarControls.svelte`, con prioridad para
  coches y globo cercanos.
- Movimiento con el character controller de Rapier en
  `PlayerCollider.svelte` (`stepRide`): aceleración, marcha atrás, frenada,
  giro dependiente de la velocidad y gravedad/colisiones existentes.
- Pose y sincronización del avatar en `PlayerBehaviour.svelte`: idle en la
  tabla, sentado en la escoba, `player-position` a la presencia.
- Render de la montura bajo el avatar en `Player.svelte` y ocultado del
  accesorio cosmético mientras se conduce.
- HUD de controles en `CarPrompt.svelte` (velocidad y teclas).
- Botones táctiles en `MobileControls.svelte` (stick y botón Ride/Exit).
- Perfil de cámara de conducción en `ThirdPersonCamera.svelte`.
- Bloqueo de interacciones incompatibles mientras se conduce: kioscos, NPCs,
  diálogos, chat, paleta de animaciones y reset de kioscos en `GamePage`.
- Disminución automática al salir del hub, al entrar a un coche/minijuego o si
  cambia/desaparece el NFT equipado.

**No incluye**

- Backend, contratos o nuevos mensajes WebSocket. La propiedad y el equipado
  siguen en `equipment`/`nftOwnership`; la posición viaja por `player-position`.
- Física de vehículo dedicada (masa, suspension, ruedas o vuelo). La montura
  usa la cápsula del jugador y el mismo character controller del hub.
- Monturas en minijuegos, carreras, Barn Siege, Hexfire, Skyfall Royale o el
  roadmap. Ahí el vehículo sigue siendo cosmético o se sustituye por el coche
  del minijuego.
- Habilidad de volar con la escoba: se desplaza pegada al suelo como el resto
  de vehículos del hub, aunque el clip sea de montar.
- Sonido propio de motor/ruedas; se mantiene el audio ambiental existente.

## 4. Requisitos

### Funcionales

| ID    | Requisito                                                                                                                                                  | Prioridad |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| RF-1  | `rideIdFromCatalog(id)` devuelve `'skateboard'` o `'magic-broom'` para esos ids y `null` para cualquier otro.                                             | alta      |
| RF-2  | `ride.equippedId` se resuelve desde `equipment.vehicle`; `ride.equipped` devuelve sus ajustes y `ride.canRide` exige montura equipada y `sceneState.inHub`. | alta      |
| RF-3  | Con una montura equipada y sin coche/globo cerca, `E` monta; con la montura activa, `E` desmonta.                                                          | alta      |
| RF-4  | Si hay un coche o un globo cerca, `E` mantiene la prioridad de esos vehículos (no monta la montura NFT).                                                   | alta      |
| RF-5  | `W/S` (o arriba/abajo) aceleran y retroceden; `A/D` (o izquierda/derecha) giran; `Space` frena.                                                              | alta      |
| RF-6  | La velocidad y el giro respetan `RIDE_TUNING`: skateboard 12 m/s y 2.5 rad/s; escoba 17 m/s y 1.9 rad/s.                                                   | alta      |
| RF-7  | El giro solo responde con velocidad y se invierte al retroceder; a velocidad cero la montura no gira sobre sí misma.                                       | media     |
| RF-8  | El jugador sigue colisionando con el mapa, subiendo pendientes y cayendo con gravedad; si cae por debajo del respawn, se desmonta y reaparece.              | alta      |
| RF-9  | La cámara usa un perfil de conducción más cercano (`RIDE_PROFILE`, radio 7.5 m) mientras se conduce.                                                       | media     |
| RF-10 | El avatar reproduce `HR_idle` en el skateboard y `HR_sit` en la escoba; si el rig no tiene el clip, cae a `HR_idle`.                                        | alta      |
| RF-11 | Mientras se conduce, el avatar visible se coloca sobre la montura: `footLift` 0.202 m en skateboard (sobre la tabla) y 0 en escoba (sentado sobre el eje); el modelo se centra bajo los pies. | alta      |
| RF-12 | El accesorio cosmético de la espalda/pies se oculta al montar y se vuelve a mostrar al desmontar.                                                           | media     |
| RF-13 | La posición y el rumbo se publican con `lobby.sendPlayerPosition` con el mismo intervalo que a pie; los avatares remotos ven la montura por presencia.     | alta      |
| RF-14 | El HUD muestra `Riding <nombre>`, la velocidad en km/h y las teclas `W/S`, `A/D`, `Space`, `E`; en táctil se ocultan las teclas.                            | media     |
| RF-15 | En móvil, el stick escribe en `carInput` y el botón de vehículo muestra `Ride`/`Exit`; las acciones de a pie (rollo, salto, animaciones) se ocultan.        | alta      |
| RF-16 | Mientras se conduce se bloquean kioscos, prompts/diálogos de NPC, gatos, checkpoints, jukebox, chat, paleta de animaciones y el lanzamiento de rollos de papel. | media |
| RF-17 | Al salir del hub, entrar a un coche, globo, carrera o minijuego, o al cambiar/perder el NFT equipado, la montura se desmonta automáticamente.               | alta      |
| RF-18 | `Space` no deja un salto pendiente al desmontar: `playerInput.consumeJump()` limpia el buffer en cada frame de conducción.                                  | baja      |

### No funcionales

| ID    | Requisito       | Criterio                                                                 |
| ----- | --------------- | ------------------------------------------------------------------------ |
| RNF-1 | Type safety     | `cd frontend && bun run check` termina con 0 errores.                    |
| RNF-2 | Formato         | `bunx prettier --check` pasa en todos los archivos tocados.              |
| RNF-3 | Build           | `cd frontend && bun run build` genera el sitio estático correctamente.   |
| RNF-4 | Rendimiento     | Sin cuerpos Rapier adicionales por montura ni asignaciones por frame.    |
| RNF-5 | Sin regresiones | Coches, globo, chat, kioscos, NPCs, cámara y minijuegos siguen iguales.  |

## 5. Criterios de aceptación

- [x] CA-1: `bun run check` pasa con 0 errores tras crear `ride.svelte.ts` y
  tocar los componentes del jugador.
- [x] CA-2: `bun run build` termina y escribe el sitio estático.
- [x] CA-3: Con el skateboard equipado, `E` en el hub monta la tabla; el avatar
  queda de pie con `HR_idle` y avanza/frena/gira con WASD.
- [x] CA-4: Con la escoba equipada, `E` monta; el avatar adopta `HR_sit` y se
  desplaza más rápido que la tabla.
- [x] CA-5: Estando cerca de un coche o del globo, `E` sigue entrando al coche o
  al globo en lugar de montar la montura NFT.
- [x] CA-6: `Space` detiene la montura y no provoca un salto al desmontar.
- [x] CA-7: Con dos clientes, uno conduce y el otro ve el desplazamiento y la
  montura del avatar remoto sin recargar.
- [x] CA-8: Al entrar a un minijuego o coche, la montura se desmonta sola.
- [x] CA-9: En móvil, el stick conduce y el botón muestra `Ride`/`Exit`.
- [x] CA-10: Los prompts de kiosco/NPC/gato/checkpoint, el chat, el jukebox y la
  paleta de animaciones no aparecen ni responden mientras se conduce.

## 6. Archivos relevantes

| Ruta                                                               | Acción    | Motivo                                                                                         |
| ------------------------------------------------------------------ | --------- | ---------------------------------------------------------------------------------------------- |
| `frontend/src/lib/state/ride.svelte.ts`                            | crear     | Estado, tuning y mapeo del catálogo de monturas.                                               |
| `frontend/src/lib/components/player/PlayerCollider.svelte`         | modificar | `stepRide` con el character controller, gravedad, respawn y desmontaje automático.             |
| `frontend/src/lib/components/player/PlayerBehaviour.svelte`        | modificar | Pose, posición, sincronización remota y bloqueo de teclas/gestos mientras se conduce.          |
| `frontend/src/lib/components/player/Player.svelte`                 | modificar | Render de la montura activa bajo el avatar y ocultado del accesorio cosmético.                 |
| `frontend/src/lib/components/cars/CarControls.svelte`              | modificar | `E` monta/desmonta, prioridad coche/globo, entrada compartida y frenada.                       |
| `frontend/src/lib/components/ui/CarPrompt.svelte`                  | modificar | Prompt de montura equipada y HUD de conducción con velocidad.                                  |
| `frontend/src/lib/components/ui/MobileControls.svelte`             | modificar | Stick táctil y botón `Ride`/`Exit`; oculta acciones de a pie.                                   |
| `frontend/src/lib/components/camera/ThirdPersonCamera.svelte`      | modificar | `RIDE_PROFILE` y tratamiento de la cámara como conducción.                                     |
| `frontend/src/lib/state/npcs.svelte.ts`                            | modificar | `canInteract` falso mientras se conduce.                                                       |
| `frontend/src/lib/components/ui/KioskPrompt.svelte`                | modificar | Kioscos bloqueados mientras se conduce.                                                        |
| `frontend/src/lib/components/ui/CatPrompt.svelte`                  | modificar | Gatos no capturables ni visibles mientras se conduce.                                          |
| `frontend/src/lib/components/ui/CheckpointPrompt.svelte`           | modificar | Checkpoints/minijuegos bloqueados mientras se conduce.                                         |
| `frontend/src/lib/components/ui/ClubMusic.svelte`                  | modificar | Jukebox del club bloqueado mientras se conduce.                                                |
| `frontend/src/lib/components/ui/AnimationPalette.svelte`           | modificar | Paleta tratada como conducción.                                                                |
| `frontend/src/lib/components/ui/ChatOverlay.svelte`                | modificar | Chat tratado como conducción.                                                                  |
| `frontend/src/lib/components/ui/NpcDialog.svelte`                  | modificar | Diálogo de NPC se cierra al montar.                                                            |
| `frontend/src/lib/GamePage.svelte`                                 | modificar | Los paneles de kiosco se cierran al montar.                                                    |
| `frontend/src/lib/state/equipment.svelte.ts`                       | referencia | `equipment.vehicle` y `equippedRide`; fuente del NFT equipado.                                 |
| `frontend/src/lib/components/ui/shopCatalog.ts`                    | referencia | Ids y modelos `skateboard` / `magic-broom`.                                                    |
| `frontend/static/props/skateboard.glb`                             | referencia | Modelo de la tabla (largo ~0.86, alto ~0.18 nativos; orientado a +Z).                           |
| `frontend/static/props/magic_broom.glb`                            | referencia | Modelo de la escoba (largo ~1.83, alto ~0.25 nativos; orientado a +Z).                          |
| `specs/SPEC-044-equipar-nft-skins-assets-carros-armas.md`          | modificar | Nota de alcance: el vehículo equipado ya es conducible en el hub (este spec).                  |

## 7. Plan de implementación

### Fase 1 — Estado y tuning

- [x] Crear `ride.svelte.ts` con `RideId`, `RIDE_TUNING`, `rideIdFromCatalog` y
  `RideStore`.
- [x] Resolver `equippedId` desde `equipment.vehicle` y limitar `canRide` al hub.
- [x] Definir tuning diferenciado para tabla y escoba (velocidad, giro, clip,
  tamaño, `visualY`, `footLift`).

### Fase 2 — Movimiento y avatar

- [x] Implementar `stepRide(dt)` en `PlayerCollider` reutilizando
  `controller.computeColliderMovement`, gravedad y respawn.
- [x] Añadir la rama de montura al inicio de `stepPlayer`.
- [x] Desmontar al salir del hub o al cambiar/perder el NFT equipado.
- [x] Colocar el avatar y reproducir `HR_idle`/`HR_sit` en `PlayerBehaviour`.
- [x] Publicar `player-position` mientras se conduce.
- [x] Renderizar la montura bajo el avatar en `Player.svelte` y ocultar el
  accesorio cosmético.

### Fase 3 — Entrada, HUD y cámara

- [x] Añadir `E` de montaje/desmontaje con prioridad coche/globo en
  `CarControls`.
- [x] Compartir `carInput` para acelerador, dirección, freno y freno de mano.
- [x] Añadir prompt/HUD de montura y velocidad en `CarPrompt`.
- [x] Integrar stick y botón `Ride`/`Exit` en `MobileControls`.
- [x] Añadir `RIDE_PROFILE` a `ThirdPersonCamera`.

### Fase 4 — Bloqueos de interacción

- [x] Bloquear kioscos, NPCs, gatos, checkpoints, jukebox, diálogos, chat,
  paleta de animaciones y tirada de rollos mientras `ride.isRiding`.
- [x] Cerrar paneles de kiosco al montar desde `GamePage`.

### Fase 5 — Verificación y cierre

- [x] Formatear los archivos tocados con Prettier.
- [x] `cd frontend && bun run check` → 0 errores.
- [x] `cd frontend && bun run build` → sitio estático generado.
- [x] Crear este spec y enlazarlo desde `SPEC-044`.

## 8. Verificación

```bash
# Frontend
cd frontend && bunx prettier --check \
  src/lib/state/ride.svelte.ts \
  src/lib/components/player/PlayerCollider.svelte \
  src/lib/components/player/PlayerBehaviour.svelte \
  src/lib/components/player/Player.svelte \
  src/lib/components/cars/CarControls.svelte \
  src/lib/components/ui/CarPrompt.svelte \
  src/lib/components/ui/MobileControls.svelte \
  src/lib/components/camera/ThirdPersonCamera.svelte
cd frontend && bun run check
cd frontend && bun run build
```

Casos manuales:

1. **Skateboard**: equipar el NFT, pulsar `E` en el hub → el avatar queda de pie
   sobre la tabla con `HR_idle`; `W` acelera, `S` frena/retrocede, `A/D` giran,
   `Space` frena y `E` desmonta.
2. **Escoba**: equipar la escoba, `E` → el avatar se sienta (`HR_sit`) y alcanza
   más velocidad que la tabla.
3. **Prioridad de vehículos**: colocarse junto a un coche o al globo → `E` entra
   al coche/globo, no a la montura.
4. **Colisiones**: conducir contra una pared, una rampa y un borde → la cápsula
   frena/sube/cae igual que a pie; caer al vacío desmonta y reaparece.
5. **Multijugador**: dos clientes en el hub → uno conduce y el otro ve el
   movimiento y la montura del avatar remoto.
6. **Cambio de escena**: montar y entrar a un minijuego/coche → la montura se
   desmonta sin dejar el avatar flotando.
7. **Móvil**: el stick conduce y el botón de vehículo muestra `Ride`/`Exit`; no
   aparecen los botones de rollo/salto mientras se conduce.
8. **UI**: acercarse a un kiosco o NPC mientras se conduce → no aparece el
   prompt; abrir el chat o la paleta de animaciones → no responden.

## 9. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
| ------ | ------- | ---------- |
| Reutilizar la cápsula del jugador hace que la montura "flote" o atraviese objetos bajos. | Medio | Se mantiene la cápsula de 2.1 m; la tabla usa `footLift` (0.202 m) para que los pies queden sobre la cubierta y las ruedas en el suelo, y la escoba se eleva con `visualY` sin tocar el suelo. |
| El tuning visual depende del GLB y del rig. | Medio | `visualY`, `targetSize` y `footLift` están centralizados en `RIDE_TUNING`; se midieron las cajas de los GLB para ajustar la tabla y la escoba. |
| `Space` compartido entre salto y freno. | Bajo | Mientras `ride.isRiding`, `PlayerBehaviour` ignora el teclado y `stepRide` consume el salto pendiente. |
| Cambiar o vender el NFT mientras se conduce deja una montura fantasma. | Bajo | El efecto de `PlayerCollider` desmonta si `activeId !== equippedId`. |
| Conflictos con prompts de coche/globo/NPC. | Medio | Coches y globo conservan prioridad en `E`; kioscos, NPCs, chat y paleta se bloquean mientras se conduce. |
| Duplicar el cuerpo físico y romper la sincronización. | Alto | No se crea un cuerpo Rapier nuevo: se reutiliza `body`/`collider`/`controller` del jugador. |

## 10. Preguntas abiertas

- [ ] Ninguna. El alcance queda limitado al hub y a las dos monturas del
  catálogo actual.

## 11. Decisiones y notas

- **Local y hub-only**: no hay cambios de protocolo ni backend. La montura se
  resuelve del loadout local y solo se activa en `sceneState.inHub`; en
  minijuegos el vehículo sigue siendo cosmético.
- **Sin cuerpo propio**: la conducción es una variante del controlador de
  personaje. Esto conserva colisiones, pendientes, spawned/respawn y la cámara
  sin introducir un segundo sistema físico.
- **Velocidad y giro**: se copia el modelo de los coches (`carInput.throttle`,
  `steering`, `brake`, `handbrake`) pero con menos inercia y giro dependiente de
  la velocidad para que la tabla se sienta ágil y la escoba más pesada.
- **Poses**: el skateboard mantiene la pose idle de pie; la escoba usa la pose
  sentada del rig (`HR_sit`). Si el clip no existe en la skin, se usa `HR_idle`.
- **Accesorio cosmético**: `Player.svelte` ya no dibuja la montura "a la espalda"
  cuando `ride.isRiding`; en su lugar dibuja el modelo activo centrado bajo el
  avatar.
- **Sincronización remota**: se reutiliza `player-position` y el campo `ride` de
  la presencia. No se envía estado de velocidad ni de montura activa: los
  clientes remotos ya renderizan la montura equipada del jugador.
- **Escala**: skateboard `targetSize` 0.98 m y `visualY` -0.101 (tabla de ~0.20 m
  de alto; la superficie queda justo en los pies y `footLift` 0.202 mantiene las
  ruedas en el suelo). Escoba `targetSize` 2.1 m y `visualY` 0.44 (el eje queda
  a la altura de la pelvis de la pose sentada, con `footLift` 0).
- **Pose sentada estable**: `HR_sit` incluye la transición de pie → sentado →
  de pie. Al conducir la escoba se reproduce el clip y se fija su tiempo en la
  mitad (`duration * 0.5`) con `paused = true`, para que el jinete no se levante
  en bucle. Al desmontar, `HR_idle` vuelve a activar el clip normalmente.

## 12. Progreso

| Fecha      | Estado     | Nota                                                              |
| ---------- | ---------- | ----------------------------------------------------------------- |
| 2026-11-14 | en-progreso | Store, movimiento, avatar, HUD y cámara integrados.               |
| 2026-11-14 | completado | Bloques de interacción, formato, type check y build verificados.  |

## 13. Changelog

- 2026-11-14 — Creación del spec e implementación de las monturas NFT
  conducibles (`skateboard`, `magic-broom`) en el hub, reutilizando el character
  controller y `carInput`.
