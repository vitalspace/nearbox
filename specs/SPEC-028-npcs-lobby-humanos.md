---
id: SPEC-028
titulo: "NPCs humanos que pasean, visitan e interactúan en el lobby"
estado: completado
prioridad: alta
creado: 2026-11-11
actualizado: 2026-11-11
responsable: opencode
etiquetas: [npcs, lobby, animaciones, threlte, gltf, interaccion, ui, paquete]
depende_de: [SPEC-007, SPEC-012, SPEC-015]
bloquea: []
estimacion: "14h"
---

# SPEC-028 — NPCs humanos que pasean, visitan e interactúan en el lobby

## 1. Contexto

El lobby exterior es el mapa `map.glb` (`sceneState.active === 'map'` / `sceneState.inHub`). Hoy el jugador y los avatares remotos usan modelos humanos con esqueleto `HR_*`, pero **no existe ningún NPC de ambiente**: los únicos elementos interactivos del lobby son los 25 gatos de `SPEC-015`, los checkpoints de minijuegos y los coches.

Los 9 modelos humanos que se usarán ya están copiados en `frontend/static/` y comparten exactamente el mismo rig y los mismos 26 clips:

| GLB | Clips | Prefijo |
| --- | --- | --- |
| `Hero.glb`, `Heroina.glb`, `Hombre.glb`, `Hombre2.glb` | 25 | `HR_` |
| `Abuelo.glb`, `Abuela.glb`, `NPC_Joven.glb`, `NPC_Jovena.glb`, `NPC_Nina.glb` | 25 | `HR_` |

Clips disponibles por modelo (verificados leyendo el chunk JSON del GLB):

`HR_heal`, `HR_injured`, `HR_crouch_aim`, `HR_run_aim`, `HR_walk_aim`, `HR_aim`, `HR_throw`, `HR_carry`, `HR_attack`, `HR_death`, `HR_hit`, `HR_idle`, `HR_jump`, `HR_pickup`, `HR_run`, `HR_shoot`, `HR_sit`, `HR_walk`, `HR_wave`, `HR_paquete`, `HR_gracias`, `HR_dormir`, `HR_hablar`, `HR_si`, `HR_no`.

Los 7 clips sociales (`HR_paquete`, `HR_gracias`, `HR_dormir`, `HR_hablar`, `HR_si`, `HR_no`, `HR_dance`) solo existen en los 9 GLB humanos. Los 10 GLB de monstruos (`Witch`, `Demon`, `Frankenstein`, `Ghost`, `Golem`, `Mummy`, `PumpkinKing`, `Scarecrow_Feet`, `Skeleton`, `Vampire`) tienen 22–24 clips y no incluyen esos seis, así que **este spec usa exclusivamente los 9 humanos y deja a los monstruos fuera del roster del lobby**.

### 1.1 Patrones existentes que se reutilizan

- `frontend/src/lib/components/world/Cat.svelte` y `Cats.svelte`: clonado de un GLB cacheado, normalización a suelo, detección de proximidad a 100 ms y prompt de interacción.
- `frontend/src/lib/components/ui/CatPrompt.svelte` y `CheckpointPrompt.svelte`: prompt HTML inferior, tecla `E`, botón táctil y prioridad entre interacciones.
- `frontend/src/lib/components/player/SkinCharacter.svelte`: `useGltf` + `cloneSkeleton` + `useGltfAnimations` + normalización por altura.
- `frontend/src/lib/components/player/PlayerBehaviour.svelte`: máquina de estados de clips, `playRigClip`, one-shots y evento `finished`.
- `frontend/src/lib/components/player/RemoteHero.svelte` y `frontend/src/lib/components/player/nameTag.ts`: etiqueta 3D (sprite con textura de canvas) sobre la cabeza, animación remota y actualización de posición.
- `frontend/src/lib/Scene.svelte` y `frontend/src/lib/GamePage.svelte`: puntos de montaje de la escena 3D y de los overlays HTML.
- `frontend/scripts/verify-race-track.mjs`: validación de coordenadas contra la geometría de `map.glb` (triángulos verticales y suelo).

### 1.2 Restricciones del stack

- Frontend: SvelteKit 3 + Svelte 5 + Threlte + Three.js + Rapier.
- Backend: ElysiaJS + Bun. **Este spec no requiere cambios de backend**: la simulación de NPCs es local y no se sincroniza por WebSocket.
- El jugador actual es un rig `HR_*`; los NPCs pueden compartir modelos con las skins del jugador (`Hero.glb` es la skin por defecto), pero son entidades independientes.

## 2. Objetivo

Poblar el lobby con 9 NPCs humanos que caminen de forma autónoma por rutas de la ciudad, se detengan en puntos de visita, reaccionen al jugador y permitan una interacción social con diálogo y animaciones (`hablar`, `paquete`, `gracias`, `si`, `no`, `wave`, `sit`, `dormir`). La interacción incluye una pequeña cadena de entrega de paquete entre dos NPCs, persistente en `localStorage`, sin dependencia del backend.

## 3. Alcance

**Incluye**

- Roster de los 9 modelos humanos, con nombre, rol, altura, color de etiqueta y ruta propia.
- Rutas de waypoints en bucle por el lobby: anillo central, paseo perimetral y rutas temáticas (bosque, castillo, calabaza, cementerio).
- Caminado suave con orientación, pausas en puntos de visita, gestos ambientales y evitación básica de jugador/otros NPCs.
- Muestreo de altura del suelo con raycast de Rapier para no flotar ni hundirse.
- Prompt de proximidad (`E`) y botón táctil, con prioridad frente a gatos y checkpoints.
- Diálogo HTML con árbol de decisiones, teclado (Escape, 1-9, E) y táctil.
- Uso de los clips `HR_idle`, `HR_walk`, `HR_wave`, `HR_hablar`, `HR_paquete`, `HR_gracias`, `HR_si`, `HR_no`, `HR_sit` y `HR_dormir`.
- Cadena de paquete: Carmen entrega un paquete (`HR_paquete`), Mateo lo recibe (`HR_gracias`) y el estado persiste.
- Comportamiento de descanso/sueño de Elías en el cementerio (`HR_sit` → `HR_dormir` → despertar).
- Etiquetas 3D de nombre/rol visibles a corta distancia.
- Overlay de depuración de rutas con `?npcs` en desarrollo.
- Script `npcs:check` que valida GLBs, clips, rutas, lanes y simulación headless.

**No incluye**

- Usar monstruos como NPCs del lobby.
- Sincronización de NPCs entre jugadores ni autoridad del servidor.
- Nuevos mapas, edificios, props, bancos o muebles.
- Combate, daño, colisiones físicas, empujones o muerte de NPCs.
- Voz, audio de diálogo, lip-sync o morph targets.
- Navmesh o librería de pathfinding; se usan rutas de waypoints validadas.
- Recompensas cosméticas, misiones globales o progresión de estadísticas.
- Modificar el catálogo de skins del jugador o el protocolo WebSocket.
- Traducir la interfaz al español; el juego usa inglés y este spec mantiene ese idioma en la UI.

## 4. Requisitos

### Funcionales

| ID | Requisito | Prioridad |
| --- | --- | --- |
| RF-1 | Existen 9 NPCs humanos en el lobby, cada uno con un GLB distinto de la lista de 9 y un `id` estable. | alta |
| RF-2 | Los NPCs solo se montan y actualizan en `sceneState.inHub`; no aparecen en cripta, carrera, Barn Siege, deathmatch ni parkour. | alta |
| RF-3 | Cada NPC recorre una ruta de waypoints en bucle, con velocidad de 1,0–1,4 m/s, giro suavizado y sin teletransportes. | alta |
| RF-4 | Cada NPC se detiene en sus puntos de visita entre 3 y 8 s y puede ejecutar un gesto ambiental antes de continuar. | alta |
| RF-5 | Los NPCs se apoyan en el suelo real muestreado con raycast; la altura se corrige al menos cada 500 ms. | alta |
| RF-6 | Cuando el jugador está a ≤ 2,6 m, aparece un prompt con nombre, rol y acción `E`/botón táctil. | alta |
| RF-7 | Al interactuar, el NPC se detiene, mira al jugador y reproduce `HR_hablar` en bucle mientras el diálogo está abierto. | alta |
| RF-8 | Al abrir el diálogo se reproduce `HR_wave` como saludo; al cerrarlo se reproduce `HR_wave` o `HR_gracias` como despedida. | alta |
| RF-9 | Las respuestas de diálogo pueden reproducir `HR_si` o `HR_no` según la elección. | alta |
| RF-10 | Carmen puede entregar un paquete con `HR_paquete`; Mateo lo recibe con `HR_gracias`; el estado (`none`/`carrying`/`delivered`) se guarda. | alta |
| RF-11 | El estado del paquete se recupera tras recargar y cambia los nodos de diálogo de Carmen y Mateo. | alta |
| RF-12 | Elías tiene un punto de descanso: alterna `HR_sit` y `HR_dormir` durante una pausa larga y luego se levanta y sigue su ruta. | media |
| RF-13 | El diálogo se cierra con Escape, con el botón de cerrar, al alejarse > 4,5 m, al abrir el chat, al entrar en un vehículo o al cambiar de escena; el NPC vuelve a su rutina. | alta |
| RF-14 | Los NPCs no tienen collider de Rapier y no bloquean al jugador; aplican evitación visual simple para no atravesarlo. | media |
| RF-15 | El nombre y el rol del NPC se muestran sobre su cabeza cuando está a ≤ 18 m; fuera de ese radio no se muestra la etiqueta. | media |
| RF-16 | Los gatos y los checkpoints tienen prioridad sobre los NPCs: si hay un gato o checkpoint activo, no aparece el prompt de NPC y `E` no abre diálogo. | alta |
| RF-17 | Con un NPC interactuable o un diálogo abierto, `E` no dispara `HR_pickup` del jugador ni otras acciones de `KEY_ACTIONS`. | alta |
| RF-18 | En desarrollo, `?npcs` muestra las polilíneas de ruta, waypoints y puntos de visita para ajustar coordenadas. | baja |
| RF-19 | `npcs:check` valida que los 9 GLB existen, tienen los 26 clips y que cada ruta y lane no atraviesa geometría vertical del mapa. | alta |
| RF-20 | La simulación es determinista por `id` (semilla estable) y no produce `NaN`, saltos ni posiciones fuera del mapa. | media |

### No funcionales

| ID | Requisito | Criterio |
| --- | --- | --- |
| RNF-1 | Rendimiento de simulación | El update de los 9 NPCs (sin render) ≤ 2 ms/frame en un portátil medio; proximidad a 10 Hz y muestreo de suelo a 2 Hz, no cada frame. |
| RNF-2 | Rendimiento de render | Los NPCs fuera de 90 m se ocultan; solo los que están a ≤ 25 m proyectan sombra; se mantiene ≥ 30 FPS en móvil medio con el lobby cargado. |
| RNF-3 | Carga de assets | Los 8 GLB adicionales (Hero.glb ya es core como skin por defecto) no bloquean la pantalla de carga base; se cargan en segundo plano al entrar al hub, con caché de `useGltf` y aparición progresiva. |
| RNF-4 | Memoria | Al desmontar el hub se liberan mixers/acciones; no se duplican materiales ni texturas por NPC. |
| RNF-5 | Determinismo | La misma semilla produce la misma secuencia de pausas/gestos; no se usa `Math.random()` en el cerebro del agente. |
| RNF-6 | Sin red | No se añaden mensajes WebSocket, endpoints ni llamadas al backend para NPCs. |
| RNF-7 | Accesibilidad | El prompt usa `aria-live`; el diálogo se puede cerrar con Escape y navegar con teclado; los botones táctiles tienen tamaño mínimo de 44 px. |
| RNF-8 | Calidad | `bun run check`, `bun run lint` y `bun run npcs:check` pasan sin errores; el código sigue el estilo de Svelte 5 runes del repo. |

## 5. Criterios de aceptación

- [x] CA-1: En el lobby existen exactamente 9 NPCs humanos, uno por cada GLB del roster, con nombre y rol visibles.
- [x] CA-2: Los 9 caminan en bucle, giran hacia su dirección de avance y no flotan ni se hunden (error de altura ≤ 0,05 m).
- [x] CA-3: Los NPCs del paseo se detienen en los miradores de la plaza alineados con Diner, Gas Station A/B, Garage, Motel y Grandstand según su configuración.
- [x] CA-4: Al acercarse a ≤ 2,6 m aparece el prompt; `E` o el botón táctil abre el diálogo.
- [x] CA-5: Al abrir el diálogo el NPC se detiene, mira al jugador y reproduce `HR_wave` y después `HR_hablar` en bucle.
- [x] CA-6: Elegir una respuesta afirmativa reproduce `HR_si`; una negativa reproduce `HR_no`.
- [x] CA-7: Carmen entrega el paquete con `HR_paquete`; Mateo lo recibe con `HR_gracias`; el estado persiste tras recargar.
- [x] CA-8: Elías se sienta (`HR_sit`) y dormita (`HR_dormir`) en su punto de descanso, y después reanuda la ruta.
- [x] CA-9: El diálogo se cierra con Escape, con el botón, al alejarse > 4,5 m, al abrir el chat, al entrar en un vehículo o al cambiar de escena; el NPC reanuda su ruta.
- [x] CA-10: Si hay un gato o checkpoint activo, no se muestra el prompt de NPC y `E` no abre diálogo.
- [x] CA-11: Con prompt o diálogo de NPC activo, `E` no ejecuta `HR_pickup` del jugador.
- [x] CA-12: Los NPCs desaparecen en cripta/carrera/minijuegos y reaparecen al volver al hub sin errores en consola.
- [x] CA-13: `?npcs` muestra rutas y waypoints; `bun run npcs:check` reporta 9 modelos, 26 clips por modelo, los 7 clips sociales y 0 colisiones de ruta.
- [x] CA-14: `bun run check`, `bun run lint` y `bun run build` pasan.
- [x] CA-15: En móvil, el prompt y los botones del diálogo quedan por encima de los controles táctiles y son usables.

## 6. Archivos relevantes

| Ruta | Acción | Motivo |
| --- | --- | --- |
| `frontend/src/lib/npcs/npcAnimations.ts` | crear | Tipo `NpcClip`, mapa a clips `HR_*`, conjuntos loop/one-shot y helper de reproducción. |
| `frontend/src/lib/npcs/npcConfig.ts` | crear | Roster, nombres, roles, alturas, colores, radios, velocidades y referencias a rutas/diálogos. |
| `frontend/src/lib/npcs/npcRoutes.ts` | crear | Waypoints, lanes, puntos de visita y metadatos de las 6 rutas. |
| `frontend/src/lib/npcs/npcDialogues.ts` | crear | Árboles de diálogo, condiciones de paquete y textos en inglés. |
| `frontend/src/lib/npcs/npcAgent.ts` | crear | Estado y update puro del agente: waypoint, pausa, giro, visita, descanso, evitación y PRNG determinista. |
| `frontend/src/lib/npcs/npcGround.ts` | crear | Muestreo de altura del suelo con raycast de Rapier y fallback. |
| `frontend/src/lib/npcs/npcNameTag.ts` | crear | Sprite 3D con nombre y rol; reutiliza el patrón de `nameTag.ts`. |
| `frontend/src/lib/state/npcs.svelte.ts` | crear | Store: registro de posiciones, NPC cercano, diálogo activo, quest del paquete, persistencia y toasts. |
| `frontend/src/lib/components/npc/NpcCharacter.svelte` | crear | Clonado/normalización del GLB, mixer, animaciones, etiqueta y update visual del agente. |
| `frontend/src/lib/components/npc/NpcPopulation.svelte` | crear | Monta los 9 NPCs, crea agentes, muestrea suelo, calcula el más cercano y cierra el diálogo al alejarse. |
| `frontend/src/lib/components/npc/NpcDebug.svelte` | crear | Overlay de rutas/waypoints visible con `?npcs` en desarrollo. |
| `frontend/src/lib/components/ui/NpcPrompt.svelte` | crear | Prompt HTML de proximidad con `E` y botón táctil. |
| `frontend/src/lib/components/ui/NpcDialog.svelte` | crear | Panel de diálogo, opciones, cierre, teclado y toast. |
| `frontend/scripts/verify-npcs.ts` | crear | Validador de GLBs, clips, rutas, lanes y simulación headless. |
| `frontend/src/lib/Scene.svelte` | modificar | Montar `<NpcPopulation />` dentro del bloque `inGlobal && !inRace`. |
| `frontend/src/lib/GamePage.svelte` | modificar | Montar `<NpcPrompt />` y `<NpcDialog />`; inicializar y destruir el store `npcs`. |
| `frontend/src/lib/components/player/PlayerBehaviour.svelte` | modificar | Suprimir `KEY_ACTIONS`/`HR_pickup` cuando hay prompt o diálogo de NPC. |
| `frontend/package.json` | modificar | Añadir `"npcs:check": "bun scripts/verify-npcs.ts"`. |
| `frontend/src/lib/state/playerAnimations.svelte.ts` | sin cambios | Se reutilizan `playRigClip` y `replayRigClip`; los NPCs pasan el modo loop explícito. |
| `frontend/src/lib/components/player/nameTag.ts` | sin cambios | Se copia su patrón en `npcNameTag.ts`; el helper del jugador no se toca. |
| `frontend/src/lib/components/ui/CatPrompt.svelte` | sin cambios | Se mantiene la prioridad de gatos; el prompt de NPC se oculta si hay gato. |
| `frontend/src/lib/components/ui/CheckpointPrompt.svelte` | sin cambios | Se mantiene la prioridad de checkpoints; el prompt de NPC se oculta si hay checkpoint. |
| `frontend/src/lib/cosmetics/skins.ts` | sin cambios | Los NPCs usan su propio mapa de clips; no se amplía el contrato del jugador. |
| `frontend/src/lib/services/protocol.ts` | sin cambios | La simulación es local; no se añaden animaciones al protocolo WebSocket. |
| `frontend/src/lib/loaders/gameAssets.svelte.ts` | sin cambios | `Hero.glb` ya está en `CORE_ASSETS` como skin por defecto; los otros 8 GLB se cargan de forma diferida y no se suman a la carga bloqueante. |
| `frontend/static/Hero.glb`, `Heroina.glb`, `Hombre.glb`, `Hombre2.glb`, `Abuelo.glb`, `Abuela.glb`, `NPC_Joven.glb`, `NPC_Jovena.glb`, `NPC_Nina.glb` | sin cambios | Assets ya presentes y verificados. |
| `backend/**` | sin cambios | No hay red ni autoridad del servidor para NPCs en esta fase. |

## 7. Plan de implementación

### Fase 1 — Contrato de datos, roster y rutas

- [x] Paso 1: Crear `npcAnimations.ts` con `NpcClip` y el mapa exacto:
  ```ts
  export const NPC_CLIPS = {
    idle: 'HR_idle',
    walk: 'HR_walk',
    run: 'HR_run',
    sit: 'HR_sit',
    wave: 'HR_wave',
    talk: 'HR_hablar',
    package: 'HR_paquete',
    thanks: 'HR_gracias',
    sleep: 'HR_dormir',
    yes: 'HR_si',
    no: 'HR_no'
  } as const;
  ```
  Definir `LOOPING_NPC_CLIPS = new Set(['idle','walk','run','sit','talk','sleep'])` y `ONE_SHOT_NPC_CLIPS = new Set(['wave','package','thanks','yes','no'])`. No reutilizar `HeroAnimation` ni tocar `protocol.ts`.
- [x] Paso 2: Crear `npcConfig.ts` con `NpcId` (`alba`, `bruno`, `carmen`, `mateo`, `lucia`, `tomas`, `vera`, `rosa`, `elias`), `NPC_DEFINITIONS`, `NPC_INTERACT_RADIUS = 2.6`, `NPC_DIALOG_MAX_DISTANCE = 4.5`, `NPC_NAME_TAG_RADIUS = 18`, `NPC_DETECTION_INTERVAL_MS = 100`, `NPC_GROUND_INTERVAL_MS = 500`.
- [x] Paso 3: Crear `npcRoutes.ts` con las rutas de §11.1. Cada waypoint tiene `{ x, z, pause?: [minMs, maxMs], visit?: string }`; cada ruta tiene `id`, `loop: true`, `lane?: number` y `waypoints`.
- [x] Paso 4: Crear `npcDialogues.ts` con los árboles de §11.3, condiciones `none`/`carrying`/`delivered` y textos en inglés.
- [x] Paso 5: Crear el esqueleto de `verify-npcs.ts` y comprobar ya los 9 GLB y sus 26 clips. Debe fallar si falta un modelo o un clip social.
- [x] Paso 6: Revisar que `npcConfig.ts`, `npcRoutes.ts` y `npcDialogues.ts` no importen Svelte, DOM ni `useGltf`; así el validador de Bun puede importarlos.

### Fase 2 — Cerebro del agente y store

- [x] Paso 1: Implementar `npcAgent.ts` como módulo puro: `createAgent(definition, route, seed)`, `updateAgent(agent, delta, context)`.
- [x] Paso 2: Sembrar cada agente con `mulberry32(hash(id))`; usar la semilla para pausas, visitas y gestos ambientales. No usar `Math.random()`.
- [x] Paso 3: Implementar el ciclo `walking → pausing → visiting → walking`, con pausa inicial por `phase` y límite de `delta` a 0,1 s para evitar saltos al volver de una pestaña inactiva.
- [x] Paso 4: Implementar el giro con interpolación angular exponencial y el avance con `min(speed * delta, distanceToWaypoint)`.
- [x] Paso 5: Implementar `lane` radial para rutas circulares compartidas y evitación simple: si el jugador está a < 1,2 m en un cono frontal, pausar; si otro agente está a < 0,7 m, reducir velocidad.
- [x] Paso 6: Implementar `npcGround.ts` con `world.castRay` desde `y + 1,5` hacia abajo, `maxToi = 3`, y fallback a la altura anterior. Cachear y suavizar el resultado.
- [x] Paso 7: Crear `npcs.svelte.ts` con:
  - registro plano `runtime: Record<NpcId, { x, y, z, yaw }>` (fuera de `$state` para no re-renderizar cada frame);
  - `nearestId`, `nearestDistance`, `dialogNpcId`, `dialogNodeId`, `quest`, `gestureRequest` y `toast` como `$state`, más un getter `dialogOpen` (`dialogNpcId !== null`);
  - `publish(id, x, y, z, yaw, clip)`, `setNearest(id, distance)`, `interact()`, `choose(choiceId)`, `closeDialog()`, `init(playerId)` y `destroy()`.
- [x] Paso 8: Persistir el paquete en `localStorage` con clave `rw:npcs:v1:<playerId>`, validando el valor (`none`/`carrying`/`delivered`). Si falla la lectura, usar `none`.
- [x] Paso 9: Añadir al validador una simulación headless de 480 s por agente (una vuelta completa del `paseo`) y comprobar `Number.isFinite`, límites del mapa (`|x| ≤ 134`, `|z| ≤ 134`), velocidad y ausencia de saltos.

### Fase 3 — Render de NPCs

- [x] Paso 1: Implementar `NpcCharacter.svelte` con `useGltf(asset(def.model))`, `cloneSkeleton`, normalización a `targetHeight` y apoyo en `y = 0` (mismo patrón que `SkinCharacter.prepare`).
- [x] Paso 2: Integrar `useGltfAnimations(() => $gltf, () => ref)`; las claves de `actions` ya son los nombres de clip, así que usar `NPC_CLIPS.*` directamente como nombre y no duplicar un mapa `NpcClip → AnimationAction`.
- [x] Paso 3: Implementar la reproducción con `playRigClip(actions, current, clip, loop)`; para one-shots, escuchar `mixer.finished` y volver al clip de locomoción. Si el gesto pedido es el clip actual, usar `replayRigClip` para que un saludo repetido no se descarte.
- [x] Paso 4: Hacer de `NpcCharacter` un renderizador puro: en su `useTask`, leer la entrada de `npcs.runtime[id]` y aplicar posición, yaw y clip. Mientras `npcs.dialogNpcId === id`, forzar pausa, mirar al jugador y `talk`.
- [x] Paso 5: Añadir una etiqueta 3D sobre la cabeza (sprite con textura de canvas, nombre, rol y color) generada por `npcNameTag.ts`, colocada a `targetHeight + 0,25 m`; mostrarla solo si el modelo está cargado y la distancia ≤ 18 m.
- [x] Paso 6: Añadir culling de render: `visible = distance ≤ 90`; `castShadow = distance ≤ 25` actualizado a 2 Hz para no recorrer la jerarquía cada frame.
- [x] Paso 7: Implementar `NpcPopulation.svelte`: montar los 9 componentes con `{#each NPC_DEFINITIONS as def (def.id)}`, crear los agentes y un sampler de suelo compartido, muestrear el suelo de cada spawn antes del primer frame, y ejecutar un único `useTask` que simule a los 9 agentes y escriba en `npcs.runtime` sin re-render de Svelte.
- [x] Paso 8: En ese tick, hacer el escaneo de proximidad a 10 Hz usando `playerState.x/y/z` (pies del jugador), comparar distancia horizontal y vertical (`|dy| ≤ 2,0`) y llamar a `npcs.setNearest`. Si el diálogo está abierto y la distancia supera 4,5 m, cerrarlo.
- [x] Paso 9: Modificar `Scene.svelte` para montar `<NpcPopulation />` junto a `<Cats />`, dentro de `sceneState.inGlobal && !sceneState.inRace`.
- [x] Paso 10: Implementar `NpcDebug.svelte` y montarlo en `Scene.svelte` solo si `import.meta.env.DEV` y `new URLSearchParams(location.search).has('npcs')`. Dibujar cada ruta con `BufferGeometry` + `LineBasicMaterial` a una altura fija de `0,6 m` y esferas pequeñas en los waypoints.

### Fase 4 — Prompt y diálogo

- [x] Paso 1: Implementar `NpcPrompt.svelte` con el patrón de `CatPrompt.svelte` y `CheckpointPrompt.svelte`: contenedor inferior centrado, `aria-live`, icono, nombre, rol, `Press E to talk` y botón `Talk`.
- [x] Paso 2: El prompt se muestra solo si `npcs.nearestNpc !== null` y `npcs.canInteract`; ocultarlo si `missions.nearestCatId !== null`, `checkpoints.active !== null`, `chat.isOpen`, `playerRuntime.frozen`, `cars.isDriving`, `sceneState.inRace` o `!sceneState.inHub`.
- [x] Paso 3: `NpcPrompt` escucha `KeyE` y llama a `npcs.interact()` solo si no hay diálogo abierto; comprobar `event.defaultPrevented` y no interferir con gatos/checkpoints.
- [x] Paso 4: Implementar `NpcDialog.svelte` como panel inferior con nombre/rol, texto, botones de opción, botón de cerrar y toast de estado (el toast se sigue mostrando si el panel ya se cerró). Las opciones se filtran por `requires` y `quest`. Un `$effect` cierra el diálogo si `chat.isOpen`, `cars.isDriving`, `sceneState.inRace` o `!sceneState.inHub`.
- [x] Paso 5: Añadir teclado: `Escape` cierra, `1`–`9` eligen la opción correspondiente, `E` elige la primera opción o cierra si no hay opciones. Enfocar el panel al abrir y devolver el foco al cerrar.
- [x] Paso 6: Modificar `GamePage.svelte`: importar `NpcPrompt`, `NpcDialog` y `npcs`; llamar a `npcs.init(playerProfile.playerId)` después de `playerProfile.init()`; llamar a `npcs.destroy()` en el cleanup; montar prompt y diálogo cuando `gameReady && !needsOnboarding`.
- [x] Paso 7: Modificar `PlayerBehaviour.svelte`: importar `npcs`; en `onKeyDown`, si `npcs.dialogOpen` o (`e.code === 'KeyE'` y `npcs.canInteract`), no ejecutar `KEY_ACTIONS` ni `HR_pickup`. Mantener el movimiento normal.
- [x] Paso 8: CSS móvil: replicar la regla de `CatPrompt`/`CheckpointPrompt` para subir prompt y diálogo por encima de los controles táctiles (`html.touch-controls-active`).

### Fase 5 — Comportamiento social y quest

- [x] Paso 1: Al abrir el diálogo, emitir `gestureRequest` con `wave`; el NPC lo reproduce una vez y después entra en `talk` loop.
- [x] Paso 2: Al elegir una opción, emitir el gesto correspondiente (`yes`, `no`, `package`, `thanks`) y actualizar el nodo de diálogo.
- [x] Paso 3: Implementar la quest del paquete: Carmen (`give-package`) solo si `quest === 'none'`; Mateo (`deliver-package`) solo si `quest === 'carrying'`; persistir y mostrar toast.
- [x] Paso 4: Al cerrar el diálogo, emitir `wave` o `thanks`; el NPC vuelve a `idle`/`walk` tras el one-shot.
- [x] Paso 5: Implementar saludos ambientales: si el jugador entra a < 5 m y no hay diálogo, el NPC puede hacer `wave` una vez cada 45 s.
- [x] Paso 6: Implementar visitas y gestos ambientales: en cada visita, pausa de 3–8 s; 20–35 % de probabilidad de `wave`, `talk`, `yes`, `no` o `thanks`; el resto, `idle`.
- [x] Paso 7: Implementar el descanso de Elías: al llegar a su waypoint de descanso, `sit` durante 8–12 s; con 30 % de probabilidad, `sleep` 15–25 s; después `idle` y reanudar. Si el jugador interactúa, despertar y hablar.
- [x] Paso 8: Comprobar que los one-shots no se quedan clavados: al terminar, limpiar `oneShot` y volver al clip de locomoción; si el clip no existe, caer a `idle`.

### Fase 6 — Verificación y ajuste

- [x] Paso 1: Completar `verify-npcs.ts`:
  - 9 GLB existen y contienen exactamente los 26 clips; los 7 sociales y `HR_wave` están presentes.
  - Cada `NpcDefinition` referencia un `routeId` y un `dialogueId` existentes.
  - Cada ruta tiene ≥ 3 waypoints, `loop: true`, IDs de visita únicos y coordenadas dentro del mapa.
  - Cada segmento de ruta (incluyendo lanes) se muestrea cada 0,5 m y no intersecta triángulos verticales de `paredes`/`obstaculos`; hay suelo debajo.
  - Simulación headless de 480 s por agente sin `NaN`, sin salir de límites y con velocidad coherente.
  - Imprimir resumen: modelos, clips, rutas, waypoints y errores.
- [x] Paso 2: Añadir `"npcs:check": "bun scripts/verify-npcs.ts"` a `frontend/package.json`.
- [x] Paso 3: Ejecutar `bun run npcs:check`; ajustar waypoints de las rutas temáticas si alguna colisión. Si una ruta no se puede arreglar sin navmesh, reducirla al anillo central/paseo y anotarlo en el spec.
- [x] Paso 4: Ejecutar `bun run check`, `bun run lint` y `bun run build`.
- [x] Paso 5: Probar los casos manuales de §8 y ajustar distancias, alturas, velocidades y UI.
- [x] Paso 6: Medir rendimiento con `?npcs` y el panel de desarrollo; si el móvil baja de 30 FPS, reducir el radio de render de NPCs o el número de NPCs visibles, no la simulación.
- [x] Paso 7: Revisar que no queden `console.log` de depuración fuera de `import.meta.env.DEV`.

### Fase 7 — Documentación y cierre

- [x] Paso 1: Actualizar `estado` a `completado`, `actualizado`, la tabla de Progreso y el Changelog.
- [x] Paso 2: Marcar los checkboxes de criterios y plan.
- [x] Paso 3: Añadir una nota con las coordenadas finales de las rutas si cambiaron respecto a §11.1.
- [x] Paso 4: Registrar en Decisions la deuda técnica: NPCs locales no sincronizados; futura spec de NPCs autoritativos si se necesita.

## 8. Verificación

```bash
# Frontend
cd frontend
bun install
bun run npcs:check
bun run check
bun run lint
bun run build
```

No hay comandos de backend porque este spec no modifica `backend/`.

Casos manuales:

1. **Arranque en el lobby**: al entrar, aparecen NPCs caminando en el anillo central y en el paseo; no hay errores en consola y las etiquetas se ven solo de cerca.
2. **Ruta central**: Carmen y Mateo caminan alrededor del árbol, giran suavemente, se detienen y reanudan; no atraviesan el tronco.
3. **Paseo perimetral**: Bruno, Lucía y Tomás recorren el anillo de la plaza y se detienen en Diner, Gas Station A/B, Garage, Motel y Grandstand según su configuración.
4. **Rutas temáticas**: Alba, Vera, Rosa y Elías recorren bosque, castillo, calabazar y cementerio sin atravesar casas, vallas, granero ni mausoleo.
5. **Prompt**: acercarse a ≤ 2,6 m muestra `Press E to talk`; el botón táctil funciona; a más distancia desaparece.
6. **Diálogo**: `E` abre el panel; el NPC se detiene, mira al jugador, saluda con `HR_wave` y habla con `HR_hablar`.
7. **Respuestas**: elegir “Yes” reproduce `HR_si`; “No” reproduce `HR_no`; las opciones cambian según el NPC.
8. **Paquete**: Carmen pide llevar el paquete; al aceptar hace `HR_paquete`; Mateo lo recibe con `HR_gracias`; recargar mantiene el estado y cambia los textos.
9. **Descanso**: Elías se sienta (`HR_sit`), dormita (`HR_dormir`) y se levanta; si se interactúa, despierta y habla.
10. **Cierre**: Escape, botón de cerrar, alejarse > 4,5 m o entrar a una carrera/cripta cierra el diálogo y el NPC vuelve a su rutina.
11. **Prioridad**: acercarse a un gato y a un NPC a la vez muestra solo el prompt del gato; tras capturarlo, aparece el del NPC.
12. **Tecla E**: con prompt/diálogo de NPC activo, el jugador no reproduce `HR_pickup`; con el diálogo cerrado, `E` sigue funcionando como antes.
13. **Escenas**: entrar a cripta, Grand Prix, Barn Siege, deathmatch y parkour oculta a los NPCs; volver al lobby los muestra de nuevo.
14. **Móvil**: prompt y diálogo quedan por encima de los controles; los botones se pulsan sin mover la cámara.
15. **Depuración**: `?npcs` dibuja las rutas y waypoints; `npcs:check` no reporta colisiones.

## 9. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| Las rutas temáticas cruzan casas, vallas o el granero. | NPCs atravesando geometría. | `npcs:check` muestrea cada segmento contra triángulos verticales; añadir waypoints de desvío o limitar la ruta al anillo central/paseo. |
| Los 9 GLB suman ~16 MB y retrasan la experiencia. | Carga lenta o pop-in. | Carga diferida al entrar al hub; `useGltf` cachea por URL; aparición progresiva; opción de reducir el roster si el rendimiento es malo. |
| 9 NPCs × ~26 mallas = ~230 draw calls. | Caída de FPS en móvil. | Ocultar NPCs a > 90 m; sombras solo a ≤ 25 m; etiquetas a ≤ 18 m; medir con `?npcs` y ajustar radios. |
| `E` abre diálogo y también dispara `HR_pickup`. | Gesto incorrecto del jugador. | Guard en `PlayerBehaviour`: si `npcs.canInteract` o `dialogOpen`, no ejecutar `KEY_ACTIONS`. |
| Conflicto con gatos/checkpoints. | Dos prompts superpuestos y `E` ambiguo. | Los gatos y checkpoints tienen prioridad; `npcs.canInteract` devuelve `false` si hay gato o checkpoint activo. |
| El NPC se queda clavado en un one-shot. | Pose congelada. | Escuchar `mixer.finished`, limpiar `oneShot` y volver a `idle`/`walk`; fallback si el clip no existe. |
| `HR_sit`/`HR_dormir` no encajan con el suelo o no hay asiento. | Pose rara en el cementerio. | Probar visualmente; usar los escalones del mausoleo como punto de descanso; si no encaja, convertir el descanso en `idle` + `talk` y anotarlo. |
| El raycast de suelo golpea un techo o una rama. | NPC flotando. | Rayo desde `y + 1,5` con `maxToi = 3`; el tronco es el único collider del árbol y la copa está excluida; fallback a la altura anterior. |
| Los NPCs se solapan entre sí o con el jugador. | Atravesarse visualmente. | Lanes radiales distintos, fases iniciales separadas, pausa por proximidad y evitación frontal simple. |
| Los NPCs locales no coinciden entre jugadores. | Cada cliente ve posiciones distintas. | Aceptado en v1; simulación local determinista por id. Anotar futura spec de NPCs autoritativos. |
| `localStorage` corrupto o de otra versión. | Quest bloqueada o reseteada. | Validar el valor y usar `none` como fallback; clave versionada `rw:npcs:v1`. |
| El diálogo tapa al NPC o los controles. | Mala UX. | Panel inferior con scroll y offset móvil; permitir cerrar con Escape/botón; no bloquear el movimiento. |

## 10. Preguntas abiertas

- [x] ¿Se usan los 9 humanos o solo un subconjunto? **Suposición por defecto:** los 9, uno por modelo.
si los 9 humanos
- [x] ¿El diálogo debe estar en inglés o español? **Suposición por defecto:** inglés, para coincidir con el resto de la UI (`Catch`, `Global chat`, misiones).
  si ingles

- [x] ¿La quest del paquete debe dar una recompensa? **Suposición por defecto:** no; es flavor y demuestra `paquete`/`gracias`.
si
- [x] ¿Los NPCs deben sincronizarse entre jugadores? **Suposición por defecto:** no en v1; simulación local.
  si deben syncronizarse de una ves 
- [x] ¿Deben caminar solo por el anillo central o también por el paseo perimetral? **Suposición por defecto:** ambos, más rutas temáticas.
  por todo el lobby hasta llegar a la carretera mas haya nope
- [x] ¿Se quiere un prop visible de paquete en la mano del jugador? **Suposición por defecto:** no; solo animaciones y estado.
  animacion
- [x] ¿Los NPCs deben tener colisión física? **Suposición por defecto:** no; solo evitación visual.
  si colision si no como van a detectar cuando un usuario les habla
- [x] ¿Se quiere audio/voz de diálogo? **Suposición por defecto:** no; el sistema de audio procedural queda para otra spec.
  no
- [x] ¿Los NPCs deben reaccionar a emotes/chat del jugador? **Suposición por defecto:** no en v1.
- [x] ¿Debe haber NPCs de día y de noche? **Suposición por defecto:** el mapa es nocturno permanente; `dormir` es solo una conducta de descanso.


## 11. Decisiones y notas

### 11.1 Roster y rutas

| ID | GLB | Nombre | Rol | Ruta | Altura | Color |
| --- | --- | --- | --- | --- | --- | --- |
| `alba` | `Heroina.glb` | Alba | Florist | `bosque` | 2.10 | `#f9a8d4` |
| `bruno` | `Hombre.glb` | Bruno | Baker | `paseo` | 2.15 | `#fcd34d` |
| `carmen` | `Abuela.glb` | Carmen | Courier | `centro` | 1.95 | `#fdba74` |
| `mateo` | `NPC_Joven.glb` | Mateo | Messenger | `centro` | 2.05 | `#93c5fd` |
| `lucia` | `NPC_Jovena.glb` | Lucía | Neighbor | `paseo` | 2.00 | `#c4b5fd` |
| `tomas` | `Hombre2.glb` | Tomás | Mechanic | `paseo` | 2.12 | `#86efac` |
| `vera` | `Hero.glb` | Vera | Explorer | `castillo` | 2.10 | `#67e8f9` |
| `rosa` | `NPC_Nina.glb` | Rosa | Kid | `calabaza` | 1.55 | `#fda4af` |
| `elias` | `Abuelo.glb` | Elías | Caretaker | `cementerio` | 2.00 | `#d6d3d1` |

Rutas finales (coordenadas `x, z`; la `y` se muestrea con raycast):

```ts
// centro: anillo alrededor del árbol, radio 14 (suelo y≈0).
// Visitas: tree-north (0, 14) y tree-south (0, -14), pausa 3,5–5,5 s.
[
  [14, 0], [9.9, 9.9], [0, 14], [-9.9, 9.9],
  [-14, 0], [-9.9, -9.9], [0, -14], [9.9, -9.9]
]

// paseo: anillo de la plaza (TWN_Plaza, y≈0.03), radio 85. El anillo va de
// r=80 a r=86 y está separado de los edificios por la pista de carreras.
[
  [85, 0], [73.61, 42.5], [42.5, 73.61], [0, 85],
  [-42.5, 73.61], [-60.1, 60.1], [-73.61, 42.5], [-85, 0],
  [-73.61, -42.5], [-60.1, -60.1], [-42.5, -73.61], [0, -85],
  [42.5, -73.61], [60.1, -60.1], [73.61, -42.5]
]

// bosque: rodea la casa de la bruja, sin cortar su esquina noreste.
[[-30, -12], [-50, -25], [-43.5, -49], [-22, -50], [-17, -32]]

// castillo: rodea el castillo por el este, el sur y el oeste, sin cruzar la
// valla DRC_Fence (x≈52 en el tramo sur). Se añadieron waypoints intermedios.
[[33, -14], [48, -18], [50, -30], [47, -40], [42, -46], [30, -48],
 [18, -42], [15, -30], [20, -22]]

// calabaza: rodea granero y granja dentro de la valla ovalada del campo.
// El tramo oeste se pega a la valla (x≈-52) sin tocarla.
[[-33, 14], [-20, 20], [-16, 34], [-18, 46], [-26, 53], [-36, 54],
 [-43, 50], [-47, 47], [-48, 44], [-49, 42], [-52, 40], [-52, 35],
 [-49, 28], [-45, 24], [-38, 16]]

// cementerio: rodea capilla y mausoleo por el norte y el oeste, sin cruzar
// CCC_Fence (borde norte en z≈57–60). El descanso de Elías está en (16, 40).
[[33, 14], [48, 20], [52, 32], [49, 42], [46, 48], [30, 57], [22, 60],
 [16, 50], [16, 40], [16, 30], [22, 20]]
```

Puntos de visita del paseo (radio 85, en el anillo de la plaza; el edificio queda al otro lado de la pista, a 18–20 m, así que son **miradores**, no accesos):

| ID | Coordenada | Edificio real | Pausa |
| --- | --- | --- | --- |
| `grandstand` | `(85, 0)` | `TWN_Grandstand` | 4–7 s |
| `gas-a` | `(60.1, -60.1)` | `TWN_GasStation_A` | 4–7 s |
| `diner` | `(-60.1, -60.1)` | `TWN_Diner` | 4–8 s |
| `gas-b` | `(-60.1, 60.1)` | `TWN_GasStation_B` | 4–7 s |
| `motel` | `(-85, 0)` | `TWN_Motel` | 5–8 s |
| `garage` | `(0, 85)` | `TWN_Garage` | 4–7 s |

Asignación de visitas:

- Bruno: `diner`, `motel`.
- Lucía: `grandstand`, `gas-b`.
- Tomás: `garage`, `gas-a`.

Lanes: `centro` usa offsets radiales `0` (Carmen) y `-1.2` (Mateo). El `paseo` usa `-1.2`, `-0.6`, `0` sobre una base de radio 85: las farolas del paseo están a `r=83`, así que ninguna lane debe superar `r=85` para no atravesarlas. Las fases iniciales se reparten para que no arranquen juntos: Carmen empieza en `(0, 14)` (`startIndex 2`) y Mateo en `(0, -14)` (`startIndex 6`) para que la quest sea descubrible desde el spawn.

Visitas temáticas:

- `bosque` pausa en `(-50, -25)` (noroeste de la casa de la bruja, fuera del checkpoint).
- `castillo` pausa en `(20, -22)` (lado noroeste del castillo, sobre la carretera).
- `calabaza` pausa en `(-36, 54)` (norte del granero, vista al conjunto).
- `cementerio` pausa en `(16, 40)` (lado oeste del mausoleo, delante de la puerta).

Estas coordenadas se validaron contra `map.glb`: los triángulos verticales de `paredes` y `obstaculos` se muestrearon cada `0,5 m` con un margen de `0,35 m` y ninguna ruta ni lane los intersecta. La valla del campo de calabazas es ovalada (su borde oeste se cierra de `x=-65` a `x=-14` según avanza `z`), por eso la ruta de `calabaza` no puede usar un rectángulo y se pega a `x≈-52` en el tramo oeste.

### 11.2 Animaciones

| Clip | Uso en NPCs | Modo |
| --- | --- | --- |
| `HR_idle` | Estado base en pausas. | Loop |
| `HR_walk` | Caminar entre waypoints. | Loop |
| `HR_run` | Reservado para futuras rutas con prisa; no se usa en v1. | Loop |
| `HR_sit` | Descanso de Elías. | Loop |
| `HR_wave` | Saludo al abrir diálogo, despedida y saludo ambiental. | One-shot |
| `HR_hablar` | Diálogo abierto. | Loop |
| `HR_paquete` | Carmen entrega el paquete. | One-shot |
| `HR_gracias` | Mateo recibe el paquete / despedida. | One-shot |
| `HR_dormir` | Elías dormita en el descanso. | Loop |
| `HR_si` | Respuesta afirmativa. | One-shot |
| `HR_no` | Respuesta negativa. | One-shot |
| `HR_jump`, `HR_attack`, `HR_shoot`, `HR_hit`, `HR_death`, `HR_injured`, `HR_heal`, `HR_aim`, `HR_walk_aim`, `HR_run_aim`, `HR_crouch_aim`, `HR_throw`, `HR_pickup`, `HR_carry` | Reservados; no se usan en NPCs en v1. | — |

Reglas de reproducción:

- Fundido de 0,12–0,15 s entre clips.
- One-shots con `LoopOnce`, `clampWhenFinished = true`; al recibir `finished`, volver a `idle` o `walk`.
- `playRigClip` descarta el clip si ya es el actual; para gestos repetidos (`wave`, `yes`, `no`) reiniciar con `replayRigClip` o `action.reset()`.
- Si un clip no existe en el GLB, caer a `idle` y registrar un warning solo en desarrollo.
- `talk` se mantiene mientras `npcs.dialogNpcId === id`; al cerrar, `wave`/`thanks` y vuelta a la rutina.
- `sit`/`sleep` solo se usan en el punto de descanso de Elías, nunca en movimiento.

### 11.3 Contrato de diálogo

```ts
export type NpcGesture =
  | 'wave' | 'talk' | 'package' | 'thanks' | 'yes' | 'no' | 'sit' | 'sleep';

export type NpcQuest = 'none' | 'carrying' | 'delivered';

export type NpcChoice = {
  id: string;
  label: string;
  next?: string;
  gesture?: NpcGesture;
  action?: 'give-package' | 'deliver-package' | 'close';
  requires?: NpcQuest;
};

export type NpcDialogueNode = {
  text: string;
  gesture?: NpcGesture;
  choices: NpcChoice[];
};

export type NpcDialogue = {
  starts: Partial<Record<NpcQuest, string>> & { default: string };
  nodes: Record<string, NpcDialogueNode>;
};
```

- Al abrir, el nodo inicial es `starts[quest] ?? starts.default`.
- Las opciones con `requires` solo se muestran si coincide con `npcs.quest`.
- `give-package` cambia `quest` a `carrying`; `deliver-package` a `delivered`.
- Todos los nodos deben tener al menos una opción de cierre para que el diálogo nunca quede sin salida.
- Los textos se escriben en inglés y en tono de pueblo de Halloween; no se usan emojis para evitar problemas de fuente.

Ejemplo de la cadena del paquete:

- Carmen (`none`): “Evening, dear. I have a parcel for Mateo, but my knees are not what they were. Could you take it?”
  - “I'll deliver it” → `give-package`, gesto `package`, nodo `given`.
  - “Not right now” → gesto `no`, cierre.
- Carmen (`carrying`): “Mateo is walking the plaza loop. Thank you, dear.”
  - “I'll find him” → gesto `thanks`, cierre.
- Carmen (`delivered`): “You found him! Bless you.”
  - “You're welcome” → gesto `thanks`, cierre.
- Mateo (`carrying`): “Is that for me? You're a lifesaver.”
  - “Here you go” → `deliver-package`, gesto `thanks`, nodo `received`.
  - “Not yet” → gesto `no`, cierre.
- Mateo (`none`/`delivered`): charla corta sobre el paquete o el pueblo.

### 11.4 Persistencia y quest

- Clave: `rw:npcs:v1:<playerId>`.
- Valor: `{ "quest": "none" | "carrying" | "delivered", "updatedAt": number }`.
- Se lee en `npcs.init(playerProfile.playerId)` y se escribe en cada cambio.
- Si el jugador recarga con `carrying`, Carmen y Mateo usan los nodos `carrying`.
- No hay recompensa ni estadística; solo cambia el diálogo y el toast (“Package for Mateo” / “Mateo received the package”).
- `?npcs` no debe resetear la quest; para pruebas manuales se puede borrar la clave desde DevTools.

### 11.5 Rendimiento y carga

- No se añaden 8 GLB nuevos a `CORE_ASSETS` (`Hero.glb` ya está por ser la skin por defecto); se cargan cuando `NpcPopulation` se monta en el hub.
- `useGltf` cachea por URL: cambiar de escena y volver no vuelve a descargar.
- Aparición progresiva: el NPC se muestra cuando su GLTF resuelve; no se bloquea la escena.
- `NpcPopulation` mantiene un registro plano de posiciones y un único `useTask`: simula los 9 agentes, muestrea el suelo a 2 Hz y hace el escaneo de proximidad a 10 Hz. Los `NpcCharacter` solo leen `npcs.runtime[id]` en su propio `useTask` de render, sin re-render de Svelte.
- Sombras y etiquetas con radio; el resto de NPCs sigue simulando pero no se dibuja.
- Si en móvil no se alcanza 30 FPS, reducir primero el radio de render/sombras y, como último recurso, limitar el roster visible a 6; no cambiar la lógica de rutas.

### 11.6 Integración y prioridades

- `Scene.svelte` monta `NpcPopulation` solo en `inGlobal && !inRace`, igual que `Cats`, `Cars` y `Checkpoints`.
- `GamePage.svelte` monta los overlays HTML y llama `npcs.init(playerProfile.playerId)` tras `playerProfile.init()`.
- Prioridad de interacción: gato > checkpoint > NPC. `npcs.canInteract` incorpora las comprobaciones de `missions.nearestCatId`, `checkpoints.active`, `chat.isOpen`, `playerRuntime.frozen`, `cars.isDriving`, `sceneState.inRace` y `sceneState.inHub`.
- `PlayerBehaviour` ignora `KEY_ACTIONS` (incluido `KeyE` → `HR_pickup`) mientras haya prompt o diálogo de NPC.
- El diálogo no congela al jugador; si se aleja, se cierra. Esto evita bloquear el movimiento y mantiene la sensación de mundo abierto.

### 11.7 Notas de implementación y deuda técnica

- ~~Los NPCs son locales y no autoritativos~~: **migrado en SPEC-029**. El
  servidor simula los 9 NPCs y publica `npcs-state` a 10 Hz; el cliente
  interpola con `SampleBuffer`/`ServerClock` y usa la simulación local solo como
  respaldo cuando no hay snapshots. La lógica pura (`npcAgent`, rutas y
  diálogos) se comparte mediante una copia en `backend/src/lib/npcs/`.
- El servidor sigue sin conocer el trimesh del mapa: publica `route.groundY` y
  el cliente corrige la altura con un raycast de Rapier. Ver SPEC-029 §11.1.
- Si en el futuro se añaden obstáculos dinámicos en las rutas, hará falta un
  navmesh simplificado en servidor; hoy las rutas están validadas sin
  colisiones estáticas.
- `NpcDebug` solo se monta en desarrollo con `?npcs`; no añade coste en producción.
- El validador `npcs:check` tarda unos segundos porque simula 480 s por agente (129 600 pasos) para cubrir una vuelta completa del `paseo`.

## 12. Progreso

| Fecha | Estado | Nota |
| --- | --- | --- |
| 2026-11-11 | borrador | Spec creado como SPEC-028; assets, clips y rutas verificados contra `map.glb`; pendiente de aprobación e implementación. |
| 2026-11-11 | implementación | Creados los 7 módulos de `npcs/`, el store, los 5 componentes y el validador. Rutas corregidas contra `DRC_Fence`, `PFM_Fence`, `CCC_Chapel` y `A4C_Stairwell`. |
| 2026-11-11 | completado | `npcs:check` (9 NPCs, 9 modelos, 25 clips, 0 colisiones), `check`, `lint` y `build` pasan. |
| 2026-11-11 | completado | NPCs migrados a autoritativos por WebSocket en **SPEC-029**; se corrige la altura flotante y el gesto atascado de Carmen. |

## 13. Changelog

- 2026-11-11 — Creación del spec con roster de 9 humanos, rutas, diálogo, quest de paquete, animaciones sociales y plan de verificación.
- 2026-11-11 — Renumerado a **SPEC-028**: `SPEC-027` ya estaba ocupado por el panel de animaciones del jugador. Se corrigió el dato de los clips sociales (solo existen en los 9 humanos; los 10 monstruos tienen 22–24 clips y no los incluyen). Se validaron las rutas contra `map.glb` y se corrigieron cuatro trazados que cruzaban la casa de la bruja, el castillo, el granero y el mausoleo. El `paseo` pasa a `r=85` porque las farolas de la plaza están en `r=83`. Se aclara que los puntos de visita del paseo son miradores al otro lado de la pista, no accesos a los edificios.
- 2026-11-11 — Implementación completa. Rutas finales ajustadas: `castillo` rodea `DRC_Fence` por el sur con 9 waypoints; `calabaza` se pega al borde ovalado de `PFM_Fence` en el tramo oeste; `cementerio` rodea `CCC_Fence` por el norte y el descanso de Elías pasa a `(16, 40)`, delante del mausoleo. El validador usa 480 s de simulación por agente y margen de 0,35 m contra geometría vertical. `Scene`, `GamePage` y `PlayerBehaviour` integrados; `build` de producción correcto.
- 2026-11-11 — La deuda de §11.7 se resuelve en **SPEC-029**: los NPCs pasan a estar simulados por el servidor y replicados por WebSocket, con corrección local de altura y respaldo offline.
- 2026-11-11 — Corregido que `E` no abriera el diálogo (solo el botón `Talk`): `CarControls` se monta dentro del `Canvas`, registra su `keydown` antes que `NpcPrompt` y consumía `KeyE` en todo el lobby con `preventDefault()` para mostrar «Move closer to a car». Ahora cede la tecla cuando hay prompt/diálogo de NPC, gato o checkpoint activo, y conserva `E` para salir del coche. Mismo arreglo para las teclas `E` de gatos y checkpoints, que sufrían la misma regresión.
- 2026-11-11 — Corregido que la misma pulsación de `E` que abría el diálogo eligiera en el acto la primera opción: `NpcDialog` procesaba el evento después de `NpcPrompt`; si la primera opción era de cierre (Carmen `reminder`/`blessing`, Mateo `delivered`) el panel se abría y cerraba al instante, y en el resto avanzaba de nodo o aceptaba el paquete sin querer. `NpcDialog` ahora ignora los eventos ya consumidos (`event.defaultPrevented`).
- 2026-11-13 — Los 9 GLB humanos se reexportaron con `HR_dance` (26 clips). `verify-npcs.ts` pasa a exigir 26 clips y valida también el clip social `HR_dance`; no cambia el comportamiento de los NPCs, que siguen usando su mapa acotado de `npcAnimations.ts`.
