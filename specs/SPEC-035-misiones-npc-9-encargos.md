---
id: SPEC-035
titulo: "9 encargos locales asignados por los NPCs del lobby"
estado: borrador
prioridad: alta
creado: 2026-11-12
actualizado: 2026-11-14
responsable: opencode
etiquetas:
  [misiones, npcs, dialogos, localstorage, hud, threlte, svelte, encargos, lobby]
depende_de: [SPEC-015, SPEC-028, SPEC-029]
bloquea: [SPEC-045]
estimacion: "12h"
---

# SPEC-035 — 9 encargos locales asignados por los NPCs del lobby

## 1. Contexto

El juego ya tiene un sistema de misiones locales por jugador (`SPEC-015`):

- Perfil estable en `rw:profile:v1` con `playerId` UUID local.
- Registro versionado `rw:missions:v1` indexado por `playerId` y `missionId`.
- Misión `cats-25` con 25 gatos interactivos repartidos por el mapa.
- Aviso de proximidad con `E`, HUD con panel de misiones y registro por zonas.
- Persistencia inmediata en `localStorage`, sincronización entre pestañas y reinicio desde ajustes.
- Prioridad de interacción ya establecida: gato > checkpoint > NPC.

También existen 9 NPCs humanos que pasean por el lobby (`SPEC-028`) y que desde
`SPEC-029` están simulados por el servidor y replicados por WebSocket:

| ID | Nombre | Rol | Ruta |
| --- | --- | --- | --- |
| `alba` | Alba | Florist | bosque |
| `bruno` | Bruno | Baker | paseo |
| `carmen` | Carmen | Courier | centro |
| `mateo` | Mateo | Messenger | centro |
| `lucia` | Lucía | Neighbor | paseo |
| `tomas` | Tomás | Mechanic | paseo |
| `vera` | Vera | Explorer | castillo |
| `rosa` | Rosa | Kid | calabaza |
| `elias` | Elías | Caretaker | cementerio |

Cada NPC tiene un diálogo local con árbol de decisiones (`npcDialogues.ts`), un
prompt de proximidad (`NpcPrompt.svelte`) y un panel de diálogo (`NpcDialog.svelte`).
El servidor solo congela al NPC mientras el diálogo está abierto (`npc-dialog`);
las misiones no necesitan backend.

La necesidad del usuario es:

1. Crear **9 minimisiones locales**, una por cada NPC del lobby.
2. Que sea **el NPC quien asigna la misión** al hablar con él.
3. Que el jugador decida **aceptarla o no**; no se impone nada.
4. Que una misión aceptada se pueda cumplir por el mapa y quede registrada por jugador.
5. Mantener el mismo espíritu que la misión de los 25 gatos: objetos o puntos
   repartidos por el mapa, progreso persistente, HUD y avisos.

No existe hoy ningún sistema de encargos por NPC, ni objetos de misión
interactivos, ni una segunda pestaña de misiones en el HUD.

> **Relación con `SPEC-045`.** Este spec implementa el **contenido de mundo** de
> los 9 encargos: diálogo, aceptación, objetivos, marcadores, HUD y persistencia
> local. Las **recompensas NFT**, el **gating por posesión de NFTs**, la
> **progresión por tramos** y la **persistencia en MongoDB** viven en
> `SPEC-045`. Los IDs de encargo y de objetivo definidos aquí son la entrada de
> esa capa; no se duplican ni se renombran.

## 2. Objetivo

Añadir 9 encargos locales (`errands`) asignados por los 9 NPCs del lobby. Al
hablar con un NPC, su diálogo muestra una tarjeta de encargo con título,
descripción, objetivo y botón **Accept errand**. Si el jugador acepta, aparecen
los marcadores de ese encargo en el mundo: objetos que se recogen con `E` o
puntos que se visitan al acercarse. El progreso se guarda al instante en
`localStorage`, se muestra en el HUD de misiones y sobrevive a recargas. Si el
jugador no acepta, no aparece nada y puede aceptarlo más tarde. No hay backend,
recompensas ni turn-in obligatorio.

## 3. Alcance

**Incluye**

- Catálogo de 9 encargos, uno por NPC, con ID estable, título, descripción,
  tipo (`collect` o `visit`), objetivo, zona y textos de diálogo.
- Catálogo de 40 objetivos con IDs estables, nombre y posición fija.
- Tarjeta de encargo dentro de `NpcDialog.svelte` con estados
  `available` / `active` / `completed`, botón de aceptar y botón de abandonar.
- Aceptar un encargo desde el diálogo del NPC, con gesto `HR_si` y aviso.
- Objetos de misión procedurales en el mundo, sin GLB nuevos ni colliders:
  flor, caja, paquete, baliza, engranaje, cristal, calabaza y farol.
- Detección de proximidad a 10 Hz para objetos `collect` (radio 2,2 m, altura 2,5 m).
- Auto-completado de objetivos `visit` al entrar en un radio de 3,0 m.
- Aviso contextual `E` / botón táctil para recoger objetos `collect`.
- Persistencia por jugador en una clave nueva `rw:npc-missions:v1`.
- Progreso derivado de IDs únicos, sin duplicados ni doble conteo.
- HUD de misiones con dos pestañas: **Cats** (lo existente) y **Errands** (los 9).
- Lista de los 9 encargos con NPC, estado, contador, barra y objetivos.
- Avisos de aceptación, progreso y completado; banner de encargo completado.
- Sección «NPC errands» en `SettingsMenu.svelte` con resumen y reinicio global
  bajo confirmación.
- Abandonar un encargo activo desde el diálogo del NPC, con confirmación inline;
  vuelve a `available` y desaparecen sus marcadores.
- Sincronización entre pestañas por unión de IDs y estado más avanzado.
- Manejo seguro de `localStorage` corrupto, no disponible o lleno.
- Validación de las 40 posiciones contra la geometría de `map.glb`.
- Verificación de tipos, formato, build, `npcs:check` y backend sin cambios.

**No incluye**

- Backend, WebSocket, protocolo o base de datos para encargos.
- Sincronización de encargos entre jugadores: cada navegador tiene los suyos.
- Que otros jugadores vean los objetos de misión de otro jugador.
- Recompensas, monedas, skins, logros o desbloqueos al completar un encargo.
  Esto queda en `SPEC-045`: allí los encargos alimentan la pista `explorer` y
  pueden dar medallas de perfil o NFTs de tramo.
- Persistencia en servidor o en MongoDB. `SPEC-045` importa el progreso de
  `rw:npc-missions:v1` y pasa a Mongo como fuente de verdad.
- Turn-in obligatorio: el encargo se completa al cumplir el último objetivo.
- Misiones repetibles o diarias; cada encargo se hace una vez.
- Nuevos NPCs, rutas, modelos, clips o cambios en `npcConfig.ts`.
- Cambios en el árbol de diálogo existente (`npcDialogues.ts`) o en la quest
  del paquete de Carmen/Mateo; la tarjeta de encargo es una capa adicional.
- Cambios en `rw:missions:v1`, en la misión `cats-25`, en la cripta o en los
  minijuegos.
- Nuevos assets GLB, texturas, sonidos o recetas de audio.
- Navmesh, colisiones físicas o empujones para los objetos de misión.
- Marcadores visibles a través de paredes o brújula/minimapa.
- Traducir la interfaz: los textos nuevos van en inglés, como el resto del juego.

## 4. Requisitos

### Funcionales

| ID    | Requisito                                                                                                                                                                                                 | Prioridad |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| RF-1  | Existe `frontend/src/lib/missions/npcMissions.ts` con exactamente 9 encargos, uno por cada NPC de `NPC_DEFINITIONS`.                                                                                       | alta      |
| RF-2  | Cada encargo tiene `id` estable, `npcId`, `title`, `description`, `kind`, `target`, `objectives`, `item` y textos `offer`/`active`/`completed`.                                                             | alta      |
| RF-3  | `kind` solo admite `collect` o `visit`; `target` siempre coincide con `objectives.length`.                                                                                                                 | alta      |
| RF-4  | Hay exactamente 40 objetivos con IDs únicos, nombre y posición `{ x, y, z }` fija.                                                                                                                         | alta      |
| RF-5  | Las posiciones se reparten por zona: 5 en bosque, 19 en paseo, 3 en centro, 4 en castillo, 5 en calabaza y 4 en cementerio.                                                                                | alta      |
| RF-6  | Cada objetivo está apoyado en la altura real de su zona: `y = 0` en centro, `y = 0.03` en el anillo del paseo y `y = 0.4` en las cuatro áreas temáticas.                                                  | alta      |
| RF-7  | Las 40 posiciones quedan sobre suelo caminable, fuera de colliders verticales, a ≥ 3 m de gatos y checkpoints, a ≥ 2 m del spawn y a ≥ 1,5 m entre objetivos de encargos distintos.                        | alta      |
| RF-8  | Existe un store `npcMissions` con estado reactivo para `playerId`, progreso de los 9 encargos, `nearestItemId`, `toast` y `showCompletion`.                                                                | alta      |
| RF-9  | El store persiste en la clave nueva `rw:npc-missions:v1`, indexada por `playerId` y `missionId`; no modifica `rw:missions:v1`.                                                                              | alta      |
| RF-10 | La estructura persistida incluye `missionId`, `status`, `collectedIds`, `acceptedAt`, `completedAt` y `updatedAt`.                                                                                         | alta      |
| RF-11 | Los estados posibles son `available`, `active` y `completed`; una misión ausente del registro se considera `available`.                                                                                    | alta      |
| RF-12 | `accept(missionId)` solo actúa sobre encargos `available`; marca `active`, guarda `acceptedAt` y muestra un aviso.                                                                                         | alta      |
| RF-13 | Aceptar un encargo no lo completa ni revela progreso previo: `collectedIds` empieza vacío.                                                                                                                | alta      |
| RF-14 | `collect(missionId, objectiveId)` añade el ID una sola vez, valida que el encargo esté `active`, que el objetivo exista y que no esté ya recogido.                                                          | alta      |
| RF-15 | `visit(missionId, objectiveId)` hace lo mismo que `collect` y se llama automáticamente al entrar en el radio de visita; es idempotente.                                                                    | alta      |
| RF-16 | Al recoger o visitar el último objetivo, el encargo pasa a `completed`, guarda `completedAt` y muestra banner/aviso una sola vez.                                                                          | alta      |
| RF-17 | `abandon(missionId)` solo actúa sobre encargos `active`; vuelve a `available`, borra `collectedIds`, `acceptedAt` y `completedAt`, y oculta sus marcadores.                                                 | alta      |
| RF-18 | Los encargos `completed` no vuelven a mostrar banner al recargar; la tarjeta del NPC muestra el texto de agradecimiento.                                                                                    | alta      |
| RF-19 | El diálogo de cada NPC muestra una tarjeta de encargo con su título, descripción, objetivo y estado; el NPC no necesita un árbol nuevo.                                                                     | alta      |
| RF-20 | La tarjeta muestra el botón `Accept errand` cuando el encargo está `available`, el progreso `n/target` cuando está `active` y el estado completado cuando está `completed`.                                  | alta      |
| RF-21 | Aceptar desde la tarjeta reproduce `HR_si` en el NPC y cierra el estado de oferta; abandonar reproduce `HR_no` y pide confirmación inline.                                                                  | alta      |
| RF-22 | La tecla `A` acepta el encargo cuando la tarjeta está `available`; `E` sigue eligiendo la primera opción del diálogo existente.                                                                            | media     |
| RF-23 | Los objetos `collect` solo se renderizan si su encargo está `active` y el objetivo no está recogido; los `visit` solo mientras estén pendientes.                                                            | alta      |
| RF-24 | Los objetos son procedurales, de baja poligonada, sin `Collider` ni `RigidBody`, con geometría y materiales compartidos y sin proyectar sombra.                                                             | alta      |
| RF-25 | El objeto `collect` más cercano se recalcula como máximo a 10 Hz y solo cambia `nearestItemId` cuando el resultado es distinto.                                                                             | media     |
| RF-26 | El aviso de objeto muestra el nombre del objetivo, el encargo y la acción `E` / botón `Collect`; desaparece al recogerlo, alejarse o abandonar.                                                            | alta      |
| RF-27 | Un objetivo `visit` se completa automáticamente al estar a ≤ 3,0 m en XZ y ≤ 2,5 m en Y, sin pulsar `E`.                                                                                                   | alta      |
| RF-28 | Los encargos y sus objetos solo existen en el lobby exterior (`sceneState.inHub`); no aparecen en cripta, carrera, Barn Siege, deathmatch, parkour ni roadmap.                                              | alta      |
| RF-29 | La prioridad de interacción es gato > objeto de encargo > checkpoint > NPC; una misma pulsación de `E` nunca dispara dos acciones.                                                                         | alta      |
| RF-30 | `CheckpointPrompt`, `npcs.canInteract` y `PlayerBehaviour` ceden la tecla `E` cuando hay un objeto de encargo activo.                                                                                      | alta      |
| RF-31 | `MissionHud.svelte` añade una pestaña **Errands** con los 9 encargos, NPC, estado, contador, barra y lista desplegable de objetivos.                                                                        | alta      |
| RF-32 | La pestaña **Cats** conserva el comportamiento actual y el anillo del botón sigue mostrando el progreso de los 25 gatos.                                                                                    | alta      |
| RF-33 | Los avisos de encargo se muestran en la zona superior central, sin tapar el chat, los ajustes, el HUD del minijuego 2 ni los controles móviles.                                                             | media     |
| RF-34 | `SettingsMenu.svelte` incluye «NPC errands» con `completed/9`, encargos activos y botón `Reset errands` con confirmación.                                                                                    | alta      |
| RF-35 | `Reset errands` devuelve los 9 encargos a `available`, borra todo su progreso y no toca el perfil, el alias, los gatos, la quest del paquete ni las estadísticas.                                          | alta      |
| RF-36 | Los cambios en otra pestaña se reflejan vía `storage`; el progreso concurrente se fusiona por unión de IDs y estado más avanzado.                                                                          | media     |
| RF-37 | Un `localStorage` corrupto, no disponible o lleno no rompe la app: se usan valores por defecto en memoria y se registra un `console.warn`.                                                                 | alta      |
| RF-38 | Los IDs de encargo u objetivo desconocidos se descartan; los repetidos se deduplican; `status` se recalcula según `collectedIds`.                                                                          | media     |
| RF-39 | El sistema no envía ni recibe mensajes nuevos por WebSocket y no modifica `backend/`.                                                                                                                       | alta      |
| RF-40 | El sistema no modifica `npcConfig.ts`, `npcDialogues.ts`, `npcRoutes.ts`, `npcAgent.ts` ni la copia del backend.                                                                                            | alta      |

### No funcionales

| ID     | Requisito                                       | Criterio                                                                                                                                 |
| ------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| RNF-1  | Sin dependencias nuevas.                        | Solo Svelte, Threlte, Three, Tailwind y APIs del navegador ya usadas.                                                                    |
| RNF-2  | Sin errores de tipos.                           | `cd frontend && bun run check` termina con código 0.                                                                                     |
| RNF-3  | Sin errores de formato en los archivos tocados. | `bunx prettier --check` sobre los archivos del spec pasa.                                                                                |
| RNF-4  | Build de producción correcto.                   | `cd frontend && bun run build` termina con código 0.                                                                                     |
| RNF-5  | SSR seguro.                                     | Ningún acceso a `window`, `localStorage` o `crypto` fuera de `onMount`, `$effect` o `init()`.                                             |
| RNF-6  | Rendimiento.                                    | Máximo 40 marcadores de baja poligonada, geometría/material compartidos, sin sombras ni colliders; detección a 10 Hz y sin asignaciones por frame. |
| RNF-7  | Persistencia pequeña.                           | El registro de encargos suma < 32 KB.                                                                                                    |
| RNF-8  | Escrituras acotadas.                            | Solo se escribe al aceptar, recoger, visitar, abandonar, completar o reiniciar.                                                            |
| RNF-9  | Sin fugas.                                      | Los listeners `storage` y `keydown` se limpian; la geometría/material compartida se libera una sola vez al desmontar la app.              |
| RNF-10 | Accesibilidad básica.                           | El aviso usa `role="status"`/`aria-live="polite"`; los botones tienen etiqueta y tamaño mínimo de 44 px en móvil.                          |
| RNF-11 | La UI no bloquea el juego.                      | Contenedores `fixed` con `pointer-events-none`; solo los botones capturan clics.                                                         |
| RNF-12 | Compatibilidad con lo existente.                | Gatos, checkpoints, NPCs, chat, lobby, cripta, carrera y minijuegos siguen funcionando sin regresiones.                                    |
| RNF-13 | Migración segura.                               | No se tocan las claves `rw:profile:v1`, `rw:missions:v1` ni `rw:npcs:v1:<playerId>`; la nueva clave es independiente.                      |
| RNF-14 | Validador.                                      | `bun run npcs:check` valida los 9 encargos, 40 objetivos, alturas, colisiones y separaciones, y termina con 0 errores.                     |

## 5. Criterios de aceptación

- [ ] CA-1: Hay exactamente 9 encargos, uno por cada NPC, y el HUD los lista como disponibles.
- [ ] CA-2: Al hablar con Alba aparece una tarjeta «Moonflowers for Alba» con descripción, objetivo `0/5` y botón `Accept errand`.
- [ ] CA-3: Aceptar el encargo lo marca como activo, muestra un aviso, guarda `rw:npc-missions:v1` y hace aparecer sus 5 marcadores en el bosque.
- [ ] CA-4: No aceptar el encargo deja la tarjeta disponible, no crea marcadores y permite aceptarlo en otra conversación.
- [ ] CA-5: Acercarse a un objeto `collect` muestra el aviso con nombre y `E`/`Collect`; pulsar `E` lo recoge y sube el contador.
- [ ] CA-6: Un objetivo `visit` se completa solo al acercarse; no muestra prompt de `E`.
- [ ] CA-7: Recoger el último objetivo de un encargo lo marca completado, muestra el banner y hace desaparecer los marcadores restantes.
- [ ] CA-8: Tras recargar, el encargo completado sigue completado y no repite el banner; los activos conservan solo los objetivos pendientes.
- [ ] CA-9: Al volver a hablar con el NPC tras completar, la tarjeta muestra el texto de agradecimiento y no pide turn-in.
- [ ] CA-10: Abandonar un encargo activo, tras confirmar, lo devuelve a disponible, borra el progreso y oculta sus marcadores.
- [ ] CA-11: La pestaña Errands del HUD lista los 9 encargos con NPC, estado, `n/target` y objetivos desplegables.
- [ ] CA-12: La pestaña Cats sigue mostrando `25/25`, el registro por zonas y el reinicio de gatos sin cambios.
- [ ] CA-13: `Reset errands` en ajustes, tras confirmar, devuelve los 9 encargos a `0` y no cambia alias, color, gatos ni paquete.
- [ ] CA-14: Con un gato y un objeto de encargo cerca, solo aparece el aviso del gato; tras capturarlo aparece el del objeto.
- [ ] CA-15: Con un checkpoint y un objeto de encargo cerca, gana el objeto y `E` no entra al minijuego.
- [ ] CA-16: Con un objeto de encargo y un NPC cerca, gana el objeto y `E` no abre el diálogo.
- [ ] CA-17: En cripta, carrera, Barn Siege, deathmatch, parkour y roadmap no se ven marcadores ni avisos de encargo.
- [ ] CA-18: Dos pestañas con encargos activos fusionan sus IDs sin perder progreso y actualizan el contador común.
- [ ] CA-19: Un `rw:npc-missions:v1` corrupto no rompe la app; los 9 encargos aparecen disponibles.
- [ ] CA-20: IDs desconocidos y duplicados se descartan/deduplican y el estado se recalcula.
- [ ] CA-21: `bun run check`, Prettier acotado, `bun run build`, `bun run npcs:check` y `bunx tsc --noEmit` del backend pasan.
- [ ] CA-22: En móvil, la tarjeta del diálogo y el aviso `Collect` quedan por encima de los controles táctiles y son usables.

## 6. Archivos relevantes

| Ruta                                                          | Acción    | Motivo                                                                 |
| ------------------------------------------------------------- | --------- | ---------------------------------------------------------------------- |
| `frontend/src/lib/missions/npcMissions.ts`                    | crear     | Tipos, 9 encargos, 40 objetivos, constantes y mapas por ID/NPC.        |
| `frontend/src/lib/state/npcMissions.svelte.ts`                | crear     | Store, persistencia, aceptar/abandonar/recoger/visitar, avisos y sync. |
| `frontend/src/lib/components/world/QuestObjective.svelte`     | crear     | Marcador procedural por objetivo (flor, caja, paquete, baliza, etc.).  |
| `frontend/src/lib/components/world/QuestObjectives.svelte`    | crear     | Render de objetivos activos y detección a 10 Hz; visitas automáticas.  |
| `frontend/src/lib/components/ui/QuestPrompt.svelte`           | crear     | Aviso `E` / botón `Collect` para objetivos `collect`.                  |
| `frontend/src/lib/components/ui/NpcDialog.svelte`             | modificar | Tarjeta de encargo, aceptar, abandonar y atajo `A`.                    |
| `frontend/src/lib/components/ui/MissionHud.svelte`            | modificar | Pestaña Errands, lista de encargos, avisos y banner de completado.     |
| `frontend/src/lib/components/ui/SettingsMenu.svelte`          | modificar | Sección «NPC errands», resumen y `Reset errands`.                      |
| `frontend/src/lib/components/ui/CheckpointPrompt.svelte`      | modificar | Ceder prioridad al objeto de encargo.                                  |
| `frontend/src/lib/components/player/PlayerBehaviour.svelte`   | modificar | Suprimir `KEY_ACTIONS`/`HR_pickup` con objeto de encargo activo.       |
| `frontend/src/lib/state/npcs.svelte.ts`                       | modificar | `canInteract` también exige que no haya objeto de encargo cerca.       |
| `frontend/src/lib/Scene.svelte`                               | modificar | Montar `<QuestObjectives />` en el bloque del lobby exterior.          |
| `frontend/src/lib/GamePage.svelte`                            | modificar | `npcMissions.init/destroy` y montar `<QuestPrompt />` en orden.        |
| `frontend/scripts/verify-npcs.ts`                             | modificar | Validar 9 encargos, 40 objetivos, alturas, colisiones y separaciones.  |
| `frontend/src/lib/missions/cats.ts`                           | sin cambio | La misión de gatos y su catálogo se reutilizan solo para separación.   |
| `frontend/src/lib/state/missions.svelte.ts`                   | sin cambio | Los encargos usan un store y una clave independientes.                 |
| `frontend/src/lib/npcs/npcConfig.ts`                          | sin cambio | El mapa NPC → encargo vive en `npcMissions.ts`.                        |
| `frontend/src/lib/npcs/npcDialogues.ts`                       | sin cambio | La tarjeta de encargo es una capa de UI, no un árbol nuevo.            |
| `frontend/src/lib/state/playerProfile.svelte.ts`              | sin cambio | `playerId` y `missionHudVisible` ya existen.                           |
| `backend/**`                                                  | sin cambio | Los encargos son locales y no añaden mensajes de protocolo.            |

## 7. Plan de implementación

### Fase 1 — Modelo de datos y almacenamiento local

- [ ] Paso 1: Crear `frontend/src/lib/missions/npcMissions.ts` con:
  - `NpcMissionId`, `NpcMissionKind`, `NpcMissionStatus`, `NpcMissionObjective`,
    `NpcMissionItemShape`, `NpcMissionDefinition`.
  - `NPC_MISSIONS` con los 9 encargos de §11.1.
  - `NPC_MISSION_BY_ID` y `NPC_MISSION_BY_NPC`.
  - `QUEST_ITEM_RADIUS = 2.2`, `QUEST_ITEM_HEIGHT = 2.5`,
    `QUEST_VISIT_RADIUS = 3.0`, `QUEST_VISIT_HEIGHT = 2.5`,
    `QUEST_DETECTION_INTERVAL_MS = 100`.
  - Sin imports de Svelte, DOM ni Threlte: el validador de Bun debe poder importarlo.
- [ ] Paso 2: Crear `frontend/src/lib/state/npcMissions.svelte.ts`:
  - Clave `rw:npc-missions:v1`.
  - Tipos `NpcMissionProgress`, `PlayerNpcMissions`, `NpcMissionRegistry`.
  - `init(playerId)` idempotente, solo en navegador.
  - Lectura tolerante a JSON corrupto, normalización de estados e IDs.
  - `missionForNpc(npcId)`, `progressFor(missionId)`, `statusFor(missionId)`,
    `isObjectiveDone(missionId, objectiveId)`, `visibleObjectives`,
    `nearestObjective`, `completedCount`, `activeCount`.
  - `accept(missionId)`, `abandon(missionId)`, `collect(missionId, objectiveId)`,
    `visit(missionId, objectiveId)`, `setNearestItem(objectiveKey)`,
    `resetAll()`, `destroy()`.
  - Avisos `toast` y `showCompletion` con temporizadores y `seq` monotónico.
  - Fusión entre pestañas por unión de IDs y estado más avanzado.
- [ ] Paso 3: Extender `frontend/scripts/verify-npcs.ts` con una sección de
      encargos que valide:
  - 9 encargos y 9 NPCs únicos; `target === objectives.length`.
  - IDs de encargo y objetivo únicos; posiciones finitas y dentro de `|x|,|z| ≤ 134`.
  - Altura correcta por zona (`0`, `0.03`, `0.4`).
  - Suelo debajo y ausencia de geometría vertical con margen de `0.35 m`,
    reutilizando los helpers que ya usa el script para las rutas.
  - Separación ≥ 3 m de gatos y checkpoints, ≥ 2 m del spawn y ≥ 1,5 m entre
    objetivos de encargos distintos.
  - Imprimir un resumen: encargos, objetivos y errores.
- [ ] Paso 4: Ejecutar `bun run npcs:check` y ajustar las coordenadas de §11.1
      hasta que las 40 posiciones queden sobre suelo libre y sin conflictos.

### Fase 2 — Marcadores en el mundo e interacción

- [ ] Paso 5: Crear `QuestObjective.svelte`:
  - Props `{ mission: NpcMissionDefinition; objective: NpcMissionObjective }`.
  - `T.Group` en `objective.position`; sin `Collider` ni `RigidBody`.
  - Formas procedurales según `mission.item.shape`:
    - `flower`: tallo, pétalos y centro con emisión suave.
    - `crate`: caja con listones.
    - `parcel`: caja con cinta.
    - `beacon`: anillo en el suelo y haz vertical translúcido.
    - `gear`: toro con dientes.
    - `crystal`: octaedro con emisión.
    - `pumpkin`: esfera achatada y tallo.
    - `lantern`: poste y orbe emisivo.
  - Geometrías y materiales compartidos a nivel de módulo; sin sombras.
  - Animación idle de balanceo/giro con `useTask`.
- [ ] Paso 6: Crear `QuestObjectives.svelte`:
  - Derivar `npcMissions.visibleObjectives`.
  - Renderizar `{#each ... as { mission, objective } (key)} <QuestObjective ... /> {/each}`.
  - `useTask` con throttle de 100 ms:
    - Si `!sceneState.inHub` o `playerRuntime.frozen`, limpiar `nearestItemId` y salir.
    - Para objetivos `visit`, si el jugador está a ≤ 3,0 m en XZ y ≤ 2,5 m en Y,
      llamar a `npcMissions.visit(mission.id, objective.id)`.
    - Para objetivos `collect`, calcular el más cercano dentro de 2,2 m en XZ y
      2,5 m en Y y llamar a `npcMissions.setNearestItem(...)`.
  - No crear objetos por frame; reutilizar variables locales.
- [ ] Paso 7: Montar `<QuestObjectives />` en `Scene.svelte` dentro de
      `sceneState.inGlobal && !sceneState.inRace`, junto a `<Cats />` y
      `<NpcPopulation />`.
- [ ] Paso 8: Crear `QuestPrompt.svelte`:
  - Derivar el objetivo más cercano solo si `sceneState.inHub`, no hay gato,
    no hay diálogo de NPC, no hay chat/kiosk abierto y el jugador no está congelado.
  - Mostrar nombre del objetivo, título del encargo y `E`/`Collect`.
  - Listener `keydown` con `KeyE`, `!event.repeat`, sin `Ctrl`/`Meta`/`Alt`,
    fuera de campos editables y con `chat.isOpen === false`.
  - Al recoger, llamar a `npcMissions.collect(...)`; si devuelve éxito, cerrar aviso.
  - Contenedor `fixed bottom-6 left-1/2 -translate-x-1/2 z-40 pointer-events-none`;
    botón `pointer-events-auto`; subir con `html.touch-controls-active`.
- [ ] Paso 9: Modificar `CheckpointPrompt.svelte` para no mostrar ni procesar
      `E` cuando `npcMissions.nearestItemId !== null`.
- [ ] Paso 10: Modificar `npcs.canInteract` para exigir
      `npcMissions.nearestItemId === null`.
- [ ] Paso 11: Modificar `PlayerBehaviour.svelte` para no ejecutar
      `KEY_ACTIONS`/`HR_pickup` cuando `npcMissions.nearestItemId !== null`.
- [ ] Paso 12: Modificar `GamePage.svelte`:
  - Importar `npcMissions` y `QuestPrompt`.
  - Llamar a `npcMissions.init(playerProfile.playerId)` después de
    `missions.init(...)` y antes de `npcs.init(...)`.
  - Llamar a `npcMissions.destroy()` en el cleanup.
  - Montar `<QuestPrompt />` después de `<CatPrompt />` y antes de
    `<CheckpointPrompt />`, para que el orden de listeners respete la prioridad.

### Fase 3 — Asignación desde el NPC

- [ ] Paso 13: Modificar `NpcDialog.svelte`:
  - Derivar `mission = npcMissions.missionForNpc(npc.id)` y
    `status = npcMissions.statusFor(mission.id)`.
  - Mostrar una tarjeta de encargo entre el texto del diálogo y las opciones:
    - `available`: chip «Errand», título, descripción, `target` + etiqueta del
      objeto, cita `mission.dialogue.offer`, botón `Accept errand` y botón
      `Not now`.
    - `active`: chip «In progress», título, `n/target`, barra, resumen de
      objetivos pendientes, cita `mission.dialogue.active`, botón
      `Abandon errand` con confirmación inline.
    - `completed`: chip «Complete», título, cita `mission.dialogue.completed`,
      sin botones de acción.
  - `Accept errand` llama a `npcMissions.accept(mission.id)` y
    `npcs.emitGesture(npc.id, 'yes')`.
  - `Abandon errand` confirmado llama a `npcMissions.abandon(mission.id)` y
    `npcs.emitGesture(npc.id, 'no')`.
  - Añadir atajo `A` para aceptar cuando la tarjeta está `available`; no
    interceptar `E` ni `1`–`9`.
  - Mantener el scroll interno del panel y el offset móvil existente.
- [ ] Paso 14: Comprobar que el gesto `HR_si`/`HR_no` no se pierde si el GLB
      aún no tiene acciones y que el diálogo existente sigue funcionando.

### Fase 4 — HUD y ajustes

- [ ] Paso 15: Modificar `MissionHud.svelte`:
  - Añadir un selector de pestañas `Cats` / `Errands` dentro del panel.
  - Mantener intacta la pestaña Cats (contador, barra, registro por zonas).
  - En Errands, listar los 9 encargos ordenados por estado
    (`active` → `available` → `completed`) y luego por NPC:
    - Nombre y rol del NPC, título, chip de estado, `n/target` y barra.
    - Botón `View objectives` para encargos activos/completados con la lista de
      nombres de objetivos y check/pendiente.
    - Para `available`, texto `Talk to <NPC> to accept`.
  - El anillo del botón sigue mostrando el progreso de los 25 gatos.
  - Mostrar `npcMissions.toast` en la zona superior central y un banner
    `Errand complete: <title>` cuando `npcMissions.showCompletion` esté activo.
  - No repetir el banner al cargar un encargo ya completado.
- [ ] Paso 16: Modificar `SettingsMenu.svelte`:
  - En la pestaña Progress, añadir la sección «NPC errands».
  - Mostrar `completed/9`, encargos activos y un botón `Reset errands` con
    confirmación inline.
  - `Reset errands` llama a `npcMissions.resetAll()` y muestra un mensaje
    temporal; no toca gatos, perfil, paquete ni estadísticas.
- [ ] Paso 17: Revisar solapes visuales con `ChatOverlay` (izquierda),
      `SettingsMenu` (derecha), `Minijuego2Hud` (arriba centro), `NpcDialog`
      (abajo centro) y `MobileControls` (abajo).

### Fase 5 — Verificación y cierre

- [ ] Paso 18: Ejecutar la verificación de §8 y corregir errores.
- [ ] Paso 19: Probar los casos manuales, incluida la prioridad con gatos,
      checkpoints y NPCs, el abandono, el reinicio y dos pestañas.
- [ ] Paso 20: Actualizar `estado`, `actualizado`, checkboxes, «Progreso» y
      «Changelog» de este spec.

### Contrato de datos

```ts
// frontend/src/lib/missions/npcMissions.ts
import type { NpcId } from '../npcs/npcConfig';

export type NpcMissionId =
	| 'alba-moonflowers'
	| 'bruno-ingredients'
	| 'carmen-parcels'
	| 'mateo-mail-run'
	| 'lucia-watch'
	| 'tomas-parts'
	| 'vera-relics'
	| 'rosa-pumpkins'
	| 'elias-lanterns';

export type NpcMissionKind = 'collect' | 'visit';
export type NpcMissionStatus = 'available' | 'active' | 'completed';

export type NpcMissionObjective = {
	id: string; // moon-01 … lantern-04, estable
	name: string;
	position: { x: number; y: number; z: number };
};

export type NpcMissionItemShape =
	| 'flower'
	| 'crate'
	| 'parcel'
	| 'beacon'
	| 'gear'
	| 'crystal'
	| 'pumpkin'
	| 'lantern';

export type NpcMissionDefinition = {
	id: NpcMissionId;
	npcId: NpcId;
	title: string;
	description: string;
	kind: NpcMissionKind;
	target: number;
	objectives: readonly NpcMissionObjective[];
	item: {
		label: string;
		shape: NpcMissionItemShape;
		color: string;
	};
	dialogue: {
		offer: string;
		active: string;
		completed: string;
	};
};
```

```ts
// frontend/src/lib/state/npcMissions.svelte.ts
export type NpcMissionProgress = {
	missionId: string;
	status: NpcMissionStatus;
	collectedIds: string[];
	acceptedAt: number | null;
	completedAt: number | null;
	updatedAt: number;
};

export type PlayerNpcMissions = {
	playerId: string;
	updatedAt: number;
	missions: Record<string, NpcMissionProgress>;
};

export type NpcMissionRegistry = {
	version: 1;
	players: Record<string, PlayerNpcMissions>;
};

export type NpcMissionToast = {
	id: number;
	message: string;
};

export type NpcMissionResult =
	| { ok: true; mission: NpcMissionDefinition; completed: boolean }
	| { ok: false; reason: 'not-ready' | 'unknown' | 'not-active' | 'duplicate' | 'completed' };
```

## 8. Verificación

```bash
# Frontend: tipos
cd frontend && bun run check

# Frontend: formato acotado a los archivos del spec
cd frontend && bunx prettier --check \
  src/lib/missions/npcMissions.ts \
  src/lib/state/npcMissions.svelte.ts \
  src/lib/components/world/QuestObjective.svelte \
  src/lib/components/world/QuestObjectives.svelte \
  src/lib/components/ui/QuestPrompt.svelte \
  src/lib/components/ui/NpcDialog.svelte \
  src/lib/components/ui/MissionHud.svelte \
  src/lib/components/ui/SettingsMenu.svelte \
  src/lib/components/ui/CheckpointPrompt.svelte \
  src/lib/components/player/PlayerBehaviour.svelte \
  src/lib/state/npcs.svelte.ts \
  src/lib/Scene.svelte \
  src/lib/GamePage.svelte \
  scripts/verify-npcs.ts

# Frontend: validador de NPCs + encargos
cd frontend && bun run npcs:check

# Frontend: build
cd frontend && bun run build

# Backend: sin cambios, se comprueba que sigue compilando
cd backend && bunx tsc --noEmit
```

Casos manuales:

1. Abrir el juego en un navegador limpio; en DevTools no existe
   `rw:npc-missions:v1` hasta aceptar el primer encargo.
2. Hablar con Alba: aparece la tarjeta «Moonflowers for Alba» con `0/5` y
   `Accept errand`; no hay marcadores en el bosque antes de aceptar.
3. Aceptar: se crea `rw:npc-missions:v1`, aparece el aviso y los 5 marcadores
   de flor en el bosque.
4. Recoger una flor con `E`: desaparece, el contador sube a `1/5` y el aviso
   muestra el progreso. Recargar: sigue `1/5` y la flor no está.
5. Recoger las 5: el encargo pasa a completado, aparece el banner y no quedan
   marcadores. Recargar: no se repite el banner.
6. Hablar con Alba tras completar: la tarjeta muestra el agradecimiento.
7. Aceptar el encargo de Mateo (`Mail Run`): los 5 puntos de visita aparecen
   como balizas; acercarse a uno lo completa sin pulsar `E`.
8. Abandonar un encargo activo desde el diálogo: confirmar, el encargo vuelve
   a disponible y sus marcadores desaparecen.
9. Aceptar dos encargos de zonas distintas y comprobar que cada uno mantiene su
   progreso y que el HUD muestra ambos.
10. Abrir la pestaña Errands del HUD: los 9 encargos aparecen con NPC, estado y
    contador; los activos despliegan sus objetivos.
11. En ajustes, `Reset errands`, cancelar y comprobar que no cambia nada;
    repetir y confirmar: los 9 vuelven a `available` y los gatos siguen igual.
12. Acercarse a un gato y a una flor a la vez: solo aparece el aviso del gato;
    tras capturarlo aparece el de la flor.
13. Acercarse a un checkpoint y a un objeto de encargo a la vez: gana el
    objeto; `E` no entra al minijuego.
14. Acercarse a un NPC y a un objeto de encargo a la vez: gana el objeto; `E`
    no abre el diálogo.
15. Entrar en cripta, carrera, Barn Siege, deathmatch, parkour y roadmap: no
    hay marcadores ni avisos de encargo; volver al lobby los restaura.
16. Abrir dos pestañas, aceptar el mismo encargo y recoger objetivos distintos
    en cada una: el contador común termina mostrando la unión.
17. Corromper `rw:npc-missions:v1` con texto inválido y recargar: la app no
    rompe y los 9 encargos aparecen disponibles.
18. Probar en viewport móvil o con `?touch=1`: la tarjeta del diálogo y el
    botón `Collect` quedan por encima de los controles táctiles.

## 9. Riesgos y mitigaciones

| Riesgo                                                          | Impacto | Mitigación                                                                                                                     |
| --------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 40 marcadores ensucian el mapa o bajan el rendimiento            | medio   | Solo se renderizan objetivos de encargos activos; geometría/material compartidos, sin sombras ni colliders, baja poligonada.     |
| Dos encargos comparten un mismo punto del paseo                  | bajo    | Radios distintos (r=80, 82, 84, 85) y separación mínima de 1,5 m; el detector elige el más cercano y se recogen de uno en uno. |
| Un objetivo cae dentro de un collider o sobre un gato            | medio   | `npcs:check` valida suelo, geometría vertical, altura y separación de gatos/checkpoints/spawn; se ajustan coordenadas.            |
| `E` dispara gato, objeto, checkpoint y NPC a la vez              | alto    | Prioridad explícita gato > objeto > checkpoint > NPC, guardas en cada prompt y orden de montaje en `GamePage`.                   |
| El jugador acepta los 9 encargos y se satura                     | bajo    | Los marcadores son visibles y ligeros; puede abandonar los que no quiera desde el diálogo del NPC.                              |
| La tarjeta del diálogo tapa las opciones o los controles móviles | medio   | Panel con scroll interno, `max-h`, offset móvil y botones de 44 px; la tarjeta no bloquea el movimiento.                         |
| Dos pestañas se pisan el registro                                | medio   | Lectura-modificación-escritura con unión de `collectedIds` y evento `storage`.                                                  |
| `localStorage` lleno, bloqueado o corrupto                       | medio   | Fallback en memoria, `try/catch`, `console.warn` y estado `available` por defecto.                                               |
| El encargo se completa pero el NPC no lo refleja                 | bajo    | La tarjeta lee `statusFor(missionId)` en cada apertura; no hay turn-in ni caché de diálogo.                                      |
| Cambiar nombres o posiciones rompe el progreso                   | bajo    | Los IDs de encargo y objetivo son la clave persistida; nombres y posiciones son solo presentación.                              |
| Se toca sin querer la misión de gatos o la quest del paquete     | alto    | Store y clave independientes; no se modifica `missions.svelte.ts` ni `npcDialogues.ts`; reset separado.                          |

## 10. Preguntas abiertas (resueltas)

- [x] ¿Los encargos dan recompensa, skin o moneda?
      No en esta fase: son contenido de mundo y progreso personal. Se deja el
      estado `completed` persistido para que `SPEC-045` lo importe y lo use como
      progreso de la pista `explorer` (sellos, medallas y NFTs de tramo).
- [x] ¿Hay que volver al NPC para entregar el encargo?
      No. Se completa al cumplir el último objetivo; el NPC lo agradece la
      próxima vez que se hable con él.
- [x] ¿Se puede abandonar un encargo activo?
      Sí, desde la tarjeta del NPC, con confirmación inline. Vuelve a
      `available` y borra su progreso.
- [x] ¿Los 9 encargos están disponibles desde el principio?
      Sí, pero sus objetos no aparecen hasta que el jugador los acepta.
- [x] ¿Se reutiliza `rw:missions:v1` o se crea una clave nueva?
      Una clave nueva, `rw:npc-missions:v1`, para no tocar el esquema probado
      de gatos, cripta y minijuegos.
- [x] ¿Los encargos cuentan en las estadísticas existentes?
      No en esta fase; `stats.svelte.ts` no se modifica.
- [x] ¿Los objetos son visibles para otros jugadores?
      No: son locales, como los gatos y el progreso.
- [x] ¿Los encargos son repetibles o diarios?
      No: cada encargo se completa una vez por perfil local.
- [x] ¿Se añaden sonidos nuevos?
      No. Se reutilizan los sonidos de UI existentes (`ui_confirm`, `ui_click`)
      al aceptar, abandonar o completar.
- [x] ¿Los objetivos `visit` requieren `E`?
      No: se completan automáticamente al entrar en el radio de 3,0 m.
- [x] ¿Se modifica el árbol de diálogo de `npcDialogues.ts`?
      No. La asignación se muestra como una tarjeta dentro de `NpcDialog.svelte`,
      conservando intactos los diálogos actuales y la quest del paquete.
- [x] ¿Se añaden modelos GLB nuevos?
      No. Los marcadores son procedurales con primitivas de Three.js.

## 11. Decisiones y notas

### 11.1 Catálogo de los 9 encargos

Todos los textos de misión van en inglés, como el resto de la interfaz.

| ID                | NPC     | Título                  | Tipo    | Objetivo | Zona       | Objeto          |
| ----------------- | ------- | ----------------------- | ------- | -------- | ---------- | --------------- |
| `alba-moonflowers`| `alba`  | Moonflowers for Alba    | collect | 5        | bosque     | Moonflower      |
| `bruno-ingredients`| `bruno`| Midnight Batch          | collect | 4        | paseo      | Ingredient crate|
| `carmen-parcels`  | `carmen`| Lost Parcels            | collect | 3        | centro     | Parcel          |
| `mateo-mail-run`  | `mateo` | Mail Run                | visit   | 5        | paseo      | Mail stop       |
| `lucia-watch`     | `lucia` | Neighborhood Watch      | visit   | 6        | paseo      | Watch post      |
| `tomas-parts`     | `tomas` | Missing Parts           | collect | 4        | paseo      | Car part        |
| `vera-relics`     | `vera`  | Castle Relics           | collect | 4        | castillo   | Relic           |
| `rosa-pumpkins`   | `rosa`  | Pumpkin Hunt            | collect | 5        | calabaza   | Pumpkin         |
| `elias-lanterns`  | `elias` | Lanterns for the Resting| collect | 4        | cementerio | Lantern         |

Colores de marcador:

| Encargo              | `item.color` | Forma      |
| -------------------- | ------------ | ---------- |
| `alba-moonflowers`   | `#f9a8d4`    | `flower`   |
| `bruno-ingredients`  | `#fcd34d`    | `crate`    |
| `carmen-parcels`     | `#fdba74`    | `parcel`   |
| `mateo-mail-run`     | `#93c5fd`    | `beacon`   |
| `lucia-watch`        | `#c4b5fd`    | `beacon`   |
| `tomas-parts`        | `#86efac`    | `gear`     |
| `vera-relics`        | `#67e8f9`    | `crystal`  |
| `rosa-pumpkins`      | `#fda4af`    | `pumpkin`  |
| `elias-lanterns`     | `#d6d3d1`    | `lantern`  |

### 11.2 Objetivos y coordenadas

Las coordenadas son fijas y deterministas. Las de las áreas temáticas y del
centro se apoyan en waypoints ya validados de las rutas de NPCs y en posiciones
de gatos, desplazadas para no compartir radio de interacción. Las del paseo se
reparten en anillos de radio `80`, `82`, `84` y `85`; las farolas están en
`r = 83`, así que ningún objetivo usa ese radio.

**Alba — Moonflowers for Alba (`collect`, bosque, `y = 0.4`)**

| Objetivo   | Nombre                       | X     | Y   | Z   |
| ---------- | ---------------------------- | ----- | --- | --- |
| `moon-01`  | Moonflower by the path       | -26   | 0.4 | -10 |
| `moon-02`  | Moonflower at the witch house| -47   | 0.4 | -21 |
| `moon-03`  | Moonflower by the old graves | -47   | 0.4 | -47 |
| `moon-04`  | Moonflower at the tree line  | -22   | 0.4 | -47 |
| `moon-05`  | Moonflower by the clearing   | -19   | 0.4 | -32 |

**Bruno — Midnight Batch (`collect`, paseo, `y = 0.03`, r = 80)**

| Objetivo  | Nombre                     | X      | Y    | Z      |
| --------- | -------------------------- | ------ | ---- | ------ |
| `ing-01`  | Crate at the Grandstand    | 80     | 0.03 | 0      |
| `ing-02`  | Crate at the Garage        | 0      | 0.03 | 80     |
| `ing-03`  | Crate at the Motel         | -80    | 0.03 | 0      |
| `ing-04`  | Crate on the south walk    | 0      | 0.03 | -80    |

**Carmen — Lost Parcels (`collect`, centro, `y = 0`)**

| Objetivo    | Nombre                        | X   | Y | Z   |
| ----------- | ----------------------------- | --- | - | --- |
| `parcel-01` | Parcel on the east ring       | 11  | 0 | 8   |
| `parcel-02` | Parcel on the west ring       | -8  | 0 | -11 |
| `parcel-03` | Parcel on the south-east ring | 11  | 0 | -8  |

**Mateo — Mail Run (`visit`, paseo, `y = 0.03`, r = 82)**

| Objetivo   | Nombre                    | X    | Y    | Z    |
| ---------- | ------------------------- | ---- | ---- | ---- |
| `mail-01`  | Grandstand mail stop      | 82   | 0.03 | 0    |
| `mail-02`  | North-east mail stop      | 58   | 0.03 | 58   |
| `mail-03`  | Gas Station B mail stop   | -58  | 0.03 | 58   |
| `mail-04`  | Diner mail stop           | -58  | 0.03 | -58  |
| `mail-05`  | Gas Station A mail stop   | 58   | 0.03 | -58  |

**Lucía — Neighborhood Watch (`visit`, paseo, `y = 0.03`, r = 85)**

| Objetivo   | Nombre                  | X     | Y    | Z     |
| ---------- | ----------------------- | ----- | ---- | ----- |
| `watch-01` | Grandstand watch post   | 85    | 0.03 | 0     |
| `watch-02` | North-east watch post   | 42.5  | 0.03 | 73.6  |
| `watch-03` | North-west watch post   | -42.5 | 0.03 | 73.6  |
| `watch-04` | Motel watch post        | -85   | 0.03 | 0     |
| `watch-05` | South-west watch post   | -42.5 | 0.03 | -73.6 |
| `watch-06` | South-east watch post   | 42.5  | 0.03 | -73.6 |

**Tomás — Missing Parts (`collect`, paseo, `y = 0.03`, r = 84)**

| Objetivo   | Nombre                   | X     | Y    | Z    |
| ---------- | ------------------------ | ----- | ---- | ---- |
| `part-01`  | East promenade car part  | 72.7  | 0.03 | 42   |
| `part-02`  | North-west car part      | -72.7 | 0.03 | 42   |
| `part-03`  | South-west car part      | -72.7 | 0.03 | -42  |
| `part-04`  | South-east car part      | 72.7  | 0.03 | -42  |

**Vera — Castle Relics (`collect`, castillo, `y = 0.4`)**

| Objetivo   | Nombre                | X   | Y   | Z   |
| ---------- | --------------------- | --- | --- | --- |
| `relic-01` | Relic by the gate     | 48  | 0.4 | -18 |
| `relic-02` | Relic on the south road| 47 | 0.4 | -40 |
| `relic-03` | Relic by the east wall| 30  | 0.4 | -48 |
| `relic-04` | Relic on the west path| 15  | 0.4 | -30 |

**Rosa — Pumpkin Hunt (`collect`, calabaza, `y = 0.4`)**

| Objetivo     | Nombre                    | X    | Y   | Z   |
| ------------ | ------------------------- | ---- | --- | --- |
| `pumpkin-01` | Pumpkin by the field gate | -20  | 0.4 | 20  |
| `pumpkin-02` | Pumpkin by the fence      | -18  | 0.4 | 46  |
| `pumpkin-03` | Pumpkin at the barn       | -36  | 0.4 | 54  |
| `pumpkin-04` | Pumpkin on the west row   | -48  | 0.4 | 44  |
| `pumpkin-05` | Pumpkin by the hay bales  | -49  | 0.4 | 28  |

**Elías — Lanterns for the Resting (`collect`, cementerio, `y = 0.4`)**

| Objetivo     | Nombre                   | X   | Y   | Z   |
| ------------ | ------------------------ | --- | --- | --- |
| `lantern-01` | Lantern by the entrance  | 36  | 0.4 | 16  |
| `lantern-02` | Lantern by the chapel    | 52  | 0.4 | 32  |
| `lantern-03` | Lantern by the mausoleum | 46  | 0.4 | 48  |
| `lantern-04` | Lantern on the west path | 16  | 0.4 | 30  |

Notas de colocación:

- Las 40 posiciones se validan contra `map.glb` con el mismo criterio que las
  rutas de NPCs y los gatos: suelo debajo, ausencia de triángulos verticales
  con margen de `0.35 m` y accesibilidad caminando desde el spawn.
- Las posiciones del paseo están en el anillo caminable `r = 80…86`; se evita
  `r = 83` porque ahí están las farolas.
- Se mantiene una separación mínima de `3 m` respecto a los 25 gatos y a los
  checkpoints para que los avisos no se activen a la vez.
- La separación mínima entre objetivos de encargos distintos es `1,5 m`; el
  detector elige el más cercano y cada pulsación de `E` recoge uno.
- `lantern-01` se desplaza a `(36, 16)` para no coincidir con `cat-21` en
  `(33, 14)`; `moon-01`, `moon-02` y `moon-03` se separan de sus gatos
  correspondientes por al menos `4 m`.

### 11.3 Estados y persistencia

- `available`: el encargo se ofrece, no hay marcadores y `collectedIds` está vacío.
- `active`: el jugador lo aceptó; se renderizan solo los objetivos pendientes.
- `completed`: todos los objetivos están en `collectedIds`; no hay marcadores.
- Una misión ausente del registro se normaliza a `available` sin escribir nada.
- Si el registro dice `available` pero tiene IDs, se normaliza a `active`; si
  tiene todos los IDs, a `completed`.
- `acceptedAt` se guarda al aceptar; `completedAt` al completar; `updatedAt` en
  cada cambio.
- La clave es `rw:npc-missions:v1`; no se toca `rw:missions:v1`.
- El registro es pequeño: 9 misiones y 40 IDs de objetivo como máximo en total.

### 11.4 Asignación sin tocar el árbol de diálogo

- `npcDialogues.ts` sigue siendo el árbol de charla y de la quest del paquete.
- `NpcDialog.svelte` añade una tarjeta de encargo independiente, alimentada por
  `npcMissions.missionForNpc(npc.id)`.
- La tarjeta no cambia el nodo de diálogo ni las opciones existentes; convive
  con ellas. Así Carmen conserva su quest del paquete y su nuevo encargo de
  paquetes perdidos.
- Aceptar o abandonar no cierra el diálogo; el jugador puede seguir hablando.
- El NPC se congela mientras el diálogo está abierto gracias a `npc-dialog`
  (`SPEC-029`); no hace falta ningún mensaje nuevo.

### 11.5 Prioridad e interacción

- Orden definitivo: **gato > objeto de encargo > checkpoint > NPC**.
- `CatPrompt` sigue siendo el primero en montarse y en consumir `E`.
- `QuestPrompt` se monta después de `CatPrompt` y antes de `CheckpointPrompt`.
- `CheckpointPrompt` comprueba `npcMissions.nearestItemId` y cede la tecla.
- `npcs.canInteract` exige que no haya gato, checkpoint ni objeto de encargo.
- `PlayerBehaviour` no ejecuta `KEY_ACTIONS`/`HR_pickup` si hay diálogo de NPC o
  un objeto de encargo activo.
- Los objetivos `visit` no consumen `E`; se completan solos y no interfieren.

### 11.6 Marcadores procedurales

- No se añaden GLB. Cada marcador usa primitivas de Three.js (`SphereGeometry`,
  `BoxGeometry`, `CylinderGeometry`, `TorusGeometry`, `OctahedronGeometry`).
- Las geometrías y materiales se crean una vez a nivel de módulo y se comparten
  entre los 40 marcadores; no se clonan por instancia.
- Sin `Collider`/`RigidBody`, sin sombras y sin texturas.
- Los `collect` flotan y giran suavemente; los `visit` muestran un anillo en el
  suelo y un haz vertical translúcido para que se vean de lejos.
- Si el rendimiento en móvil baja, se ocultan los marcadores a más de `90 m`;
  no se reduce la lógica de progreso.

### 11.7 HUD y ajustes

- El botón de misiones y su anillo siguen mostrando el progreso de los gatos.
- El panel añade dos pestañas: **Cats** y **Errands**.
- En Errands se listan los 9 encargos; los activos van primero y despliegan
  sus objetivos con check/pendiente.
- Los encargos disponibles indican `Talk to <NPC> to accept`.
- Los avisos de encargo y el banner de completado se muestran en la zona
  superior central, sin tapar el chat, los ajustes ni los controles móviles.
- En ajustes, «NPC errands» muestra `completed/9`, activos y `Reset errands`
  con confirmación; el reinicio es independiente del de gatos.

### 11.8 Sincronización entre pestañas

- Al aceptar, recoger, visitar o abandonar se lee el registro actual, se
  fusiona con el estado propio y se escribe la unión.
- La fusión usa la unión de `collectedIds`, el `acceptedAt` más antiguo y el
  `completedAt` más antiguo; el estado resultante es `completed` si alguno lo
  está o si se alcanza el objetivo, `active` si alguno lo está, y `available`
  en caso contrario.
- El evento `storage` recarga el registro cuando otra pestaña cambia la clave.
- Si una pestaña ve un encargo completado, no vuelve a mostrar el banner; solo
  actualiza el HUD y la tarjeta del NPC.

## 12. Progreso

| Fecha      | Estado   | Nota                                                                 |
| ---------- | -------- | -------------------------------------------------------------------- |
| 2026-11-12 | borrador | Spec creado: 9 encargos de NPC, 40 objetivos, HUD, diálogo y persistencia. |

## 13. Changelog

- 2026-11-12 — Creación del spec con 9 encargos asignados por los NPCs, 40
  objetivos procedurales, tarjeta de encargo en el diálogo, pestaña Errands,
  persistencia local y plan de validación.
