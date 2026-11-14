---
id: SPEC-015
titulo: "Misiones locales por jugador: atrapar 25 gatos en el mapa"
estado: implementado
prioridad: alta
creado: 2026-11-01
actualizado: 2026-11-12
responsable: opencode
etiquetas:
  [frontend, svelte, threlte, misiones, gatos, localstorage, perfil, hud, mapa]
depende_de: [SPEC-002, SPEC-005, SPEC-009]
bloquea: []
estimacion: "10h"
---

# SPEC-015 — Misiones locales por jugador: atrapar 25 gatos en el mapa

## 1. Contexto

El juego ya tiene:

- Un mapa exterior jugable (`frontend/static/map.glb`) con cuatro áreas temáticas y un claro central (`SPEC-009`). El claro central es una terraza a `y = 0`; las cuatro placas temáticas están a `y = 0.4`.
- Un jugador en tercera persona con física Rapier, movimiento con WASD/flechas, salto y animaciones (`PlayerBehaviour.svelte`, `PlayerCollider.svelte`).
- Checkpoints físicos con sensores Rapier y aviso inferior que se activa con `E` (`SPEC-005`). El patrón de interacción ya existe en `frontend/src/lib/components/ui/CheckpointPrompt.svelte`.
- Presencia y conexión WebSocket con reconexión automática (`SPEC-002`, `SPEC-003`), aunque la misión de este spec no necesita backend.
- `localStorage` ya se usa para dos preferencias sueltas:
  - alias del jugador en `lobby:name` (`frontend/src/lib/state/lobby.svelte.ts`),
  - color de la etiqueta 3D en `player:labelColor` (`frontend/src/lib/state/playerSettings.svelte.ts`).

No existe ningún sistema de misiones, ningún registro de progreso por jugador y ningún gato interactivo en el mapa exterior. El GLB contiene una malla decorativa `WHH_Cat` dentro de la casa de la bruja, que no es capturable. Para el render se usa el asset dedicado `frontend/static/gato.glb`.

La necesidad del usuario es:

1. Tener un **registro de misiones por jugador**, preparado para crecer a más misiones.
2. Empezar con una misión concreta: **encontrar y atrapar 25 gatos repartidos por el mapa**.
3. Al estar frente a un gato, mostrar un aviso y permitir capturarlo con `E`.
4. Persistir todo en `localStorage`; **no** implementar base de datos ni backend para misiones en esta fase.
5. Aprovechar el mismo almacenamiento local para centralizar la **configuración del usuario** (alias, color de etiqueta y visibilidad del HUD de misiones).

El detalle importante es la identidad: el `id` que asigna el servidor WebSocket cambia en cada conexión. Si el progreso se guardara con ese id, se perdería al recargar o reconectar. Por eso el spec introduce un **`playerId` local estable**, generado una vez y persistido en `localStorage`, independiente del socket.

## 2. Objetivo

Añadir un sistema de misiones local por jugador, con un perfil persistido en `localStorage`, y una primera misión jugable que reparte exactamente 25 gatos por el mapa exterior. El jugador se acerca a un gato, ve un aviso, pulsa `E` y lo captura; el gato desaparece, el progreso se guarda al instante y el HUD muestra el avance hasta completar `25/25`. Todo funciona sin backend y sin base de datos.

## 3. Alcance

**Incluye**

- Perfil local versionado con `playerId` estable, alias, color de etiqueta y visibilidad del HUD de misiones.
- Migración automática de las claves antiguas `lobby:name` y `player:labelColor`.
- Registro versionado de misiones por `playerId`, preparado para varias misiones.
- Una misión: `cats-25`, título «Los 25 gatos perdidos», objetivo 25.
- Catálogo fijo de 25 gatos con IDs estables, zona, nombre y posición en el mapa.
- Render de 25 gatos con el GLB `frontend/static/gato.glb`, clonado por instancia y tintado por ID, sin colisionadores.
- Detección de proximidad al gato más cercano y aviso contextual.
- Captura con `E` y botón táctil, con las mismas guardas que el aviso de checkpoints.
- Persistencia inmediata del progreso en `localStorage`.
- Gatos capturados ocultos al recargar.
- HUD de misión con contador `n/25`, barra de progreso y panel de registro agrupado por zona.
- Aviso temporal al capturar y banner al completar la misión.
- Sección de perfil y progreso en `SettingsMenu.svelte`, con reinicio de la misión bajo confirmación.
- Sincronización entre pestañas mediante el evento `storage`, fusionando capturas sin perder progreso.
- Manejo seguro de `localStorage` corrupto, no disponible o lleno.
- Verificación de tipos, formato y build del frontend.

**No incluye**

- Backend, WebSocket, protocolo, base de datos o sincronización de misiones entre jugadores.
- Gatos compartidos o persistentes en el servidor: cada navegador tiene su propio progreso.
- Movimiento, IA, sonido o animaciones complejas de los gatos (solo un balanceo idle).
- Modelado o exportación de un GLB de gato desde Blender; se reutiliza `gato.glb`.
- Inventario, recompensas, monedas, logros o desbloqueo de cosméticos.
- Más misiones jugables además de `cats-25`; solo se deja la estructura preparada.
- Gatos dentro de la cripta o de futuros minijuegos con escena propia.
- Anti-cheat: el progreso local es editable por el usuario.
- Múltiples perfiles locales en el mismo navegador; se usa un único perfil activo.
- Sincronización entre dispositivos o recuperación tras borrar datos del navegador.

## 4. Requisitos

### Funcionales

| ID    | Requisito                                                                                                                                                                                                                                         | Prioridad |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| RF-1  | Existe un store `playerProfile` con estado reactivo para `playerId`, `alias`, `labelColor`, `missionHudVisible`, `createdAt` y `updatedAt`.                                                                                                       | alta      |
| RF-2  | El perfil se persiste bajo la clave versionada `rw:profile:v1`; no se crean claves nuevas por cada campo.                                                                                                                                         | alta      |
| RF-3  | En el primer arranque se genera un `playerId` estable con `crypto.randomUUID()` y fallback a un UUID manual; se conserva entre recargas.                                                                                                          | alta      |
| RF-4  | Si existen `lobby:name` o `player:labelColor`, se migran una sola vez al perfil y después se eliminan las claves antiguas.                                                                                                                        | alta      |
| RF-5  | `lobby.svelte.ts` deja de escribir `lobby:name` y usa el alias del perfil como fuente de verdad.                                                                                                                                                  | alta      |
| RF-6  | `playerSettings.svelte.ts` se convierte en una fachada del perfil; `Player.svelte`, `RemoteHero.svelte` y `SettingsMenu.svelte` siguen funcionando sin cambios de API.                                                                            | alta      |
| RF-7  | El alias se normaliza igual que hoy: recorte, colapso de espacios y máximo 24 caracteres; vacío genera un alias aleatorio estable.                                                                                                                | alta      |
| RF-8  | El color de etiqueta se valida como `#rrggbb`; un valor inválido vuelve al color por defecto `#f8fafc`.                                                                                                                                           | media     |
| RF-9  | El catálogo de gatos vive en `frontend/src/lib/missions/cats.ts` con exactamente 25 entradas y IDs estables `cat-01`…`cat-25`.                                                                                                                    | alta      |
| RF-10 | Cada gato tiene `id`, `name`, `zone`, `position: { x, y, z }` y una pista de zona; las posiciones son fijas y deterministas.                                                                                                                      | alta      |
| RF-11 | Los 25 gatos se reparten así: 5 en el claro central, 5 en el bosque de la bruja, 5 en el castillo, 5 en el calabazar y 5 en el cementerio.                                                                                                        | alta      |
| RF-12 | Cada gato está apoyado en la altura real de su zona (`y = 0` en el claro central, `y = 0.4` en las áreas), dentro del terreno caminable, separado al menos 4 m de los demás y de spawn/checkpoints.                                               | alta      |
| RF-13 | La misión `cats-25` declara título, descripción, objetivo `25` y la lista de IDs del catálogo; el progreso se deriva de IDs únicos.                                                                                                               | alta      |
| RF-14 | El registro de misiones se persiste bajo `rw:missions:v1` y se indexa por `playerId`; admite varias misiones sin cambiar el esquema.                                                                                                              | alta      |
| RF-15 | La estructura persistida incluye `missionId`, `status`, `collectedIds`, `startedAt`, `completedAt` y `updatedAt`.                                                                                                                                 | alta      |
| RF-16 | Al capturar un gato se añade su ID una sola vez; capturas duplicadas no incrementan el contador ni reescriben `completedAt`.                                                                                                                      | alta      |
| RF-17 | Un gato solo se puede capturar si el jugador está en el mapa exterior, no está congelado, no está en la cripta y está a ≤ 2.2 m en XZ y ≤ 2.5 m en Y.                                                                                             | alta      |
| RF-18 | La captura no requiere conexión WebSocket: la misión es local y funciona con el backend apagado.                                                                                                                                                  | alta      |
| RF-19 | El gato más cercano se recalcula como máximo a 10 Hz y solo cambia `nearestCatId` cuando el resultado es distinto, evitando renders por frame.                                                                                                    | media     |
| RF-20 | El aviso de gato muestra nombre, zona y acción `E` / botón `Atrapar`; desaparece al alejarse o capturar.                                                                                                                                          | alta      |
| RF-21 | `E` se ignora si es autorrepetición, si hay `Ctrl`/`Meta`/`Alt`, si el foco está en un campo editable o si el chat está abierto.                                                                                                                  | alta      |
| RF-22 | Al capturar, el gato desaparece de inmediato, se persiste el progreso, se muestra un aviso temporal y se mantiene la animación de recogida existente de `E`.                                                                                      | alta      |
| RF-23 | Al completar `25/25`, la misión pasa a `completed`, se muestra un banner de misión completada y no se repite el banner al recargar.                                                                                                               | alta      |
| RF-24 | El HUD de misión se reduce a un botón con icono en la esquina superior izquierda; al pulsarlo se abre un panel con las misiones disponibles, título, contador `n/25`, barra de progreso, estado y registro. La visibilidad del botón se persiste. | alta      |
| RF-25 | El panel de registro lista los 25 gatos agrupados por zona, con nombre y estado capturado/pendiente, sin revelar coordenadas exactas.                                                                                                             | media     |
| RF-26 | `SettingsMenu.svelte` incluye una sección «Perfil y progreso» con alias, color, progreso de la misión y botón de reinicio con confirmación.                                                                                                       | alta      |
| RF-27 | Reiniciar la misión borra solo `collectedIds`, `startedAt` y `completedAt` de `cats-25`; no toca el perfil, el alias ni el color.                                                                                                                 | alta      |
| RF-28 | Tras reiniciar, los 25 gatos vuelven a aparecer y el HUD muestra `0/25`.                                                                                                                                                                          | alta      |
| RF-29 | Los gatos solo se renderizan cuando la escena activa es el mapa exterior; en la cripta no aparecen ni se pueden capturar.                                                                                                                         | alta      |
| RF-30 | Si el aviso de gato y el de checkpoint coinciden, el gato tiene prioridad y el aviso de checkpoint se oculta o se ignora.                                                                                                                         | media     |
| RF-31 | Los cambios de perfil o misión en otra pestaña se reflejan vía `storage`; las capturas concurrentes se fusionan por unión de IDs.                                                                                                                 | media     |
| RF-32 | Un `localStorage` corrupto, no disponible o lleno no rompe la app: se usan valores por defecto en memoria y se registra un `console.warn`.                                                                                                        | alta      |
| RF-33 | Los IDs de gato desconocidos se descartan al cargar; los IDs repetidos se deduplican; `status` se recalcula según `collectedIds`.                                                                                                                 | media     |
| RF-34 | El sistema no envía ni recibe mensajes nuevos por WebSocket y no modifica `backend/`.                                                                                                                                                             | alta      |

### No funcionales

| ID     | Requisito                                       | Criterio                                                                                                                                    |
| ------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| RNF-1  | Sin dependencias nuevas.                        | Solo Svelte, Threlte, Three, Tailwind y APIs del navegador ya usadas.                                                                       |
| RNF-2  | Sin errores de tipos.                           | `cd frontend && bun run check` termina con código 0.                                                                                        |
| RNF-3  | Sin errores de formato en los archivos tocados. | `bunx prettier --check` sobre los archivos del spec pasa.                                                                                   |
| RNF-4  | Build de producción correcto.                   | `cd frontend && bun run build` termina con código 0.                                                                                        |
| RNF-5  | SSR seguro.                                     | Ningún acceso a `window`, `localStorage` o `crypto` fuera de `onMount`, `$effect` o `init()`.                                               |
| RNF-6  | Rendimiento.                                    | 25 gatos con el GLB `gato.glb` (1 malla, 3 materiales, 442 triángulos) clonado por instancia; sin colliders; detección a 10 Hz.             |
| RNF-7  | Persistencia pequeña.                           | El perfil y el registro de misiones suman < 64 KB.                                                                                          |
| RNF-8  | Escrituras acotadas.                            | Solo se escribe en `localStorage` al capturar, reiniciar o cambiar una preferencia.                                                         |
| RNF-9  | Sin fugas.                                      | Cada `Cat.svelte` libera los materiales clonados al desmontarse (la geometría se comparte); los listeners `storage` y `keydown` se limpian. |
| RNF-10 | Accesibilidad básica.                           | El aviso usa `role="status"`, `aria-live="polite"` y el botón tiene etiqueta clara.                                                         |
| RNF-11 | La UI no bloquea el juego.                      | Contenedores `fixed` con `pointer-events-none`; solo los botones capturan clics.                                                            |
| RNF-12 | Compatibilidad con lo existente.                | Chat, checkpoints, lobby, cripta y minijuego 2 siguen funcionando sin regresiones.                                                          |
| RNF-13 | Migración segura.                               | Un perfil ya existente no se sobrescribe ni pierde alias/color al actualizar el código.                                                     |

## 5. Criterios de aceptación

- [x] CA-1: En un navegador limpio, la primera carga crea `rw:profile:v1` con un `playerId` UUID y un alias; al recargar, el `playerId` es el mismo.
- [x] CA-2: Si existen `lobby:name` y `player:labelColor`, el perfil los adopta y las claves antiguas desaparecen sin perder los valores.
- [x] CA-3: Hay exactamente 25 gatos visibles en el mapa exterior, con 5 por zona y en las posiciones de la tabla de §11.
- [x] CA-4: Al acercarse a un gato, aparece el aviso con su nombre y zona; al alejarse, desaparece.
- [x] CA-5: Pulsar `E` frente a un gato lo captura, lo oculta, muestra «Gato n/25» y el HUD sube a `1/25`.
- [x] CA-6: Tras recargar, el gato capturado sigue oculto y el HUD conserva `1/25`.
- [x] CA-7: Capturar el mismo gato dos veces no incrementa el contador.
- [x] CA-8: Pulsar `E` lejos de cualquier gato no captura nada ni muestra aviso.
- [x] CA-9: Pulsar `E` mientras se escribe en el chat, el alias o un campo editable no captura.
- [x] CA-10: Al capturar el gato 25, la misión pasa a completada, aparece el banner y el HUD muestra `25/25`.
- [x] CA-11: Tras recargar una misión completada, no se repite el banner y el HUD sigue en `25/25`.
- [x] CA-12: El panel de registro lista los 25 gatos agrupados por las cinco zonas y marca cuáles están capturados.
- [x] CA-13: Reiniciar la misión desde ajustes, tras confirmar, restaura los 25 gatos y `0/25`; alias y color no cambian.
- [ ] CA-14: En la cripta no se ven gatos ni aparece el aviso; al volver al mapa, reaparecen los pendientes.
- [ ] CA-15: El botón táctil `Atrapar` hace lo mismo que `E` y no se solapa con los controles móviles.
- [ ] CA-16: Con dos pestañas, capturar gatos distintos en cada una termina fusionando ambos IDs y el contador común sube.
- [x] CA-17: Un `rw:missions:v1` corrupto no rompe la app; se inicia en `0/25` y se puede capturar de nuevo.
- [x] CA-18: `bun run check`, Prettier acotado y `bun run build` pasan sin errores.
- [x] CA-19: `backend/` no tiene cambios y el juego sigue funcionando con el backend apagado.
- [x] CA-20: La misión no ocupa espacio permanente: solo hay un botón con icono y anillo de progreso en la esquina superior izquierda; al pulsarlo se abre el panel con las misiones, su progreso y el registro por zonas, y se cierra con el botón, `Escape` o un clic fuera.

## 6. Archivos relevantes

| Ruta                                                        | Acción     | Motivo                                                               |
| ----------------------------------------------------------- | ---------- | -------------------------------------------------------------------- |
| `frontend/src/lib/missions/cats.ts`                         | crear      | Tipos, zonas, catálogo de 25 gatos, misión `cats-25` y constantes.   |
| `frontend/src/lib/state/playerProfile.svelte.ts`            | crear      | Perfil local versionado, `playerId`, alias, color y preferencias.    |
| `frontend/src/lib/state/missions.svelte.ts`                 | crear      | Registro por jugador, captura, reinicio, progreso y sincronización.  |
| `frontend/src/lib/state/playerSettings.svelte.ts`           | modificar  | Fachada de `playerProfile` para conservar la API existente.          |
| `frontend/src/lib/state/lobby.svelte.ts`                    | modificar  | Alias desde el perfil; dejar de escribir `lobby:name`.               |
| `frontend/src/lib/components/world/Cat.svelte`              | crear      | Gato GLB (`/gato.glb`) clonado, tintado por ID y con animación idle. |
| `frontend/src/lib/components/world/Cats.svelte`             | crear      | Render de gatos pendientes y detector de proximidad a 10 Hz.         |
| `frontend/src/lib/components/ui/CatPrompt.svelte`           | crear      | Aviso contextual, tecla `E` y botón táctil de captura.               |
| `frontend/src/lib/components/ui/MissionHud.svelte`          | crear      | Contador, barra, registro por zonas, aviso y banner de completado.   |
| `frontend/src/lib/components/ui/SettingsMenu.svelte`        | modificar  | Sección «Perfil y progreso», visibilidad del HUD y reinicio.         |
| `frontend/src/lib/components/ui/CheckpointPrompt.svelte`    | modificar  | Ceder prioridad al aviso de gato cuando ambos estén activos.         |
| `frontend/src/lib/Scene.svelte`                             | modificar  | Montar `<Cats />` solo en el mapa exterior.                          |
| `frontend/src/routes/+page.svelte`                          | modificar  | Inicializar perfil/misiones y montar `CatPrompt` y `MissionHud`.     |
| `frontend/src/lib/components/player/Player.svelte`          | sin cambio | Sigue usando `playerSettings.labelColor`.                            |
| `frontend/src/lib/components/player/PlayerBehaviour.svelte` | sin cambio | `E` ya dispara `HR_pickup`; la captura reutiliza ese gesto.          |
| `frontend/static/gato.glb`                                  | existente  | Modelo del gato (1 malla, 3 materiales, 442 triángulos).             |
| `frontend/src/lib/state/playerState.ts`                     | sin cambio | Fuente de posición para la detección de proximidad.                  |
| `backend/src/index.ts`                                      | sin cambio | La misión es local; no hay mensajes nuevos.                          |
| `backend/src/ws/protocol.ts`                                | sin cambio | No se añaden tipos de misión al protocolo.                           |

## 7. Plan de implementación

### Fase 1 — Modelo de datos y almacenamiento local

- [x] Paso 1: Crear `frontend/src/lib/missions/cats.ts` con:
  - `CatZone = 'centro' | 'bosque' | 'castillo' | 'calabazar' | 'cementerio'`.
  - `CatDefinition = { id: string; name: string; zone: CatZone; position: { x: number; y: number; z: number } }`.
  - `CAT_ZONES` con etiqueta visible y descripción corta.
  - `CATS_25` con las 25 entradas de la tabla de §11.
  - `MISSION_CATS_25 = { id: 'cats-25', title, description, target: 25, catIds }`.
  - `CAT_CAPTURE_RADIUS = 2.2`, `CAT_CAPTURE_HEIGHT = 2.5`, `CAT_DETECTION_INTERVAL_MS = 100`.
- [x] Paso 2: Crear `frontend/src/lib/state/playerProfile.svelte.ts`:
  - Clave `rw:profile:v1`.
  - Tipo `PlayerProfile` con `version: 1`, `playerId`, `alias`, `labelColor`, `missionHudVisible`, `createdAt`, `updatedAt`.
  - `init()` idempotente, solo en navegador.
  - Lectura tolerante a JSON corrupto y validación de campos.
  - Generación de `playerId` con `crypto.randomUUID()` y fallback.
  - Migración desde `lobby:name` y `player:labelColor`.
  - Métodos `setAlias`, `setLabelColor`, `setMissionHudVisible`, `resetProfileCache` si hace falta.
  - Exportar `normalizeAlias` y `randomAlias` para reutilizarlos en `lobby.svelte.ts`.
- [x] Paso 3: Crear `frontend/src/lib/state/missions.svelte.ts`:
  - Clave `rw:missions:v1`.
  - Tipos `MissionStatus = 'in-progress' | 'completed'`, `MissionProgress`, `PlayerMissionRegistry`, `MissionRegistry`.
  - Estado reactivo: `progress`, `collectedIds`, `nearestCatId`, `toast`, `showCompletion`.
  - `init(playerId)` idempotente y carga del registro.
  - `isCaptured(id)`, `nearestCat` derivado, `capturedCount` derivado, `visibleCats` derivado.
  - `capture(catId)` con validación de catálogo, duplicados y estado.
  - `resetMission()` para `cats-25`.
  - Lectura/escritura con fusión de IDs y recálculo de `status`.
- [x] Paso 4: Modificar `frontend/src/lib/state/playerSettings.svelte.ts` para que `labelColor` y `setLabelColor` deleguen en `playerProfile`; `init()` llama a `playerProfile.init()`.
- [x] Paso 5: Modificar `frontend/src/lib/state/lobby.svelte.ts`:
  - Eliminar `STORAGE_KEY = 'lobby:name'` y `persistAlias`.
  - `init()` toma `playerProfile.alias`.
  - `connect()` normaliza y llama a `playerProfile.setAlias(name)`.
  - Mantener `lobby.alias` como espejo para no romper `LobbyOverlay` ni `SettingsMenu`.
- [x] Paso 6: En `frontend/src/routes/+page.svelte`, inicializar en este orden: `playerProfile.init()`, `missions.init(playerProfile.playerId)`, `playerSettings.init()`, `lobby.init()`, `lobby.connect()`.

### Fase 2 — Gatos en el mundo

- [x] Paso 7: Crear `frontend/src/lib/components/world/Cat.svelte`:
  - Props `{ cat: CatDefinition }`.
  - Cargar `frontend/static/gato.glb` con `{#await gltf}`, clonar la escena por instancia (mismo patrón que `CarModel.svelte`) y normalizar los pies a `y = 0`.
  - Pelaje tintado de forma determinista por ID; ojos con emisión suave.
  - `T.Group` en `cat.position`, sin `Collider` ni `RigidBody`.
  - Animación idle con `useTask`: balanceo suave del cuerpo.
  - Limpieza de geometrías/materiales clonados en `$effect`.
- [x] Paso 8: Crear `frontend/src/lib/components/world/Cats.svelte`:
  - Derivar `visibleCats = missions.visibleCats` y renderizar `{#each visibleCats as cat (cat.id)} <Cat {cat} /> {/each}`.
  - Añadir un `useTask` con throttle de 100 ms que calcule el gato pendiente más cercano usando `playerState.x/y/z`.
  - Limpiar `missions.nearestCatId` si la escena no es el mapa exterior, si el jugador está congelado o si no hay gato dentro de `CAT_CAPTURE_RADIUS`.
  - No crear objetos por frame; usar variables locales reutilizadas.
- [x] Paso 9: Modificar `frontend/src/lib/Scene.svelte` para montar `<Cats />` dentro del bloque del mapa exterior, junto a `<Checkpoints />`, y no montarlo en la cripta.
- [x] Paso 10: Verificar las 25 posiciones analizando la geometría de `map.glb` y con `?physics=1`; se ajustaron las entradas del catálogo hasta que todas quedaron sobre suelo libre, fuera de colliders y alcanzables desde el spawn.

### Fase 3 — Interacción, HUD y ajustes

- [x] Paso 11: Crear `frontend/src/lib/components/ui/CatPrompt.svelte`:
  - Derivar `cat = missions.nearestCat`.
  - Mostrar nombre, zona y texto `Pulsa E para atrapar`.
  - Botón `Atrapar` para móvil y ratón.
  - Listener `keydown` con `event.code === 'KeyE'`, `!event.repeat`, sin `Ctrl`/`Meta`/`Alt`, fuera de campos editables y con `chat.isOpen === false`.
  - Al capturar, llamar a `missions.capture(cat.id)`; si devuelve éxito, cerrar el aviso.
  - Contenedor `fixed bottom-6 left-1/2 -translate-x-1/2 z-40 pointer-events-none`; botón con `pointer-events-auto`.
  - Ajustar `bottom` cuando `html.touch-controls-active` esté presente, como hace `CheckpointPrompt`.
- [x] Paso 12: Modificar `frontend/src/lib/components/ui/CheckpointPrompt.svelte` para no mostrar ni procesar `E` cuando `missions.nearestCatId !== null`; el gato tiene prioridad.
- [x] Paso 13: Crear `frontend/src/lib/components/ui/MissionHud.svelte`:
  - Botón circular fijo arriba a la izquierda (`top-3 left-3 z-40`) con icono de misiones y anillo de progreso; sin tarjeta permanente para no ensuciar la UI.
  - Al pulsar se abre un panel con la lista de misiones disponibles, estado, descripción, contador `n/25` y barra de progreso.
  - El panel se cierra con el botón, con `Escape` o al hacer clic fuera; se mantiene la prioridad de los controles de juego.
  - Botón secundario para desplegar el registro con las cinco zonas y los 25 gatos; cada fila indica capturado/pendiente.
  - Respetar `playerProfile.missionHudVisible` (oculta el botón completo).
  - Mostrar aviso temporal al capturar (`Atrapaste a <nombre> · n/25`) y banner de completado.
  - No repetir el banner si la misión ya estaba completada al cargar.
- [x] Paso 14: Modificar `frontend/src/routes/+page.svelte` para montar `<CatPrompt />` y `<MissionHud />` junto a los HUD existentes.
- [x] Paso 15: Modificar `frontend/src/lib/components/ui/SettingsMenu.svelte`:
  - Añadir sección «Perfil y progreso» con el progreso `n/25`, estado de la misión y botón `Reiniciar misión`.
  - El botón pide confirmación explícita antes de llamar a `missions.resetMission()`.
  - Añadir toggle «Mostrar HUD de misiones» ligado a `playerProfile.setMissionHudVisible`.
  - Mantener alias y color existentes; si el panel crece, añadir scroll interno `max-h-[calc(100vh-6rem)] overflow-y-auto`.
- [x] Paso 16: Revisar solapes visuales con `ChatOverlay` (izquierda), `SettingsMenu` (derecha), `Minijuego2Hud` (arriba centro) y `MobileControls` (abajo).

### Fase 4 — Verificación y cierre

- [x] Paso 17: Ejecutar la verificación de §8 y corregir errores.
- [x] Paso 18: Probar los casos manuales, incluida la migración, el reinicio, la cripta y dos pestañas.
- [x] Paso 19: Actualizar `estado`, `actualizado`, checkboxes, «Progreso» y «Changelog» de este spec.

### Contrato de datos

```ts
// frontend/src/lib/missions/cats.ts
export type CatZone =
  "centro" | "bosque" | "castillo" | "calabazar" | "cementerio";

export type CatDefinition = {
  id: string; // cat-01 … cat-25, estable
  name: string;
  zone: CatZone;
  position: { x: number; y: number; z: number };
};

export type MissionDefinition = {
  id: "cats-25";
  title: string;
  description: string;
  target: number;
  catIds: string[];
};
```

```ts
// frontend/src/lib/state/playerProfile.svelte.ts
export type PlayerProfile = {
  version: 1;
  playerId: string; // UUID local estable, no el id del socket
  alias: string;
  labelColor: string; // #rrggbb
  missionHudVisible: boolean;
  createdAt: number;
  updatedAt: number;
};
```

```ts
// frontend/src/lib/state/missions.svelte.ts
export type MissionStatus = "in-progress" | "completed";

export type MissionProgress = {
  missionId: string;
  status: MissionStatus;
  collectedIds: string[];
  startedAt: number | null;
  completedAt: number | null;
  updatedAt: number;
};

export type PlayerMissionRegistry = {
  playerId: string;
  updatedAt: number;
  missions: Record<string, MissionProgress>;
};

export type MissionRegistry = {
  version: 1;
  players: Record<string, PlayerMissionRegistry>;
};
```

## 8. Verificación

```bash
# Frontend: tipos
cd frontend && bun run check

# Frontend: formato acotado a los archivos del spec
cd frontend && bunx prettier --check \
  src/lib/missions/cats.ts \
  src/lib/state/playerProfile.svelte.ts \
  src/lib/state/missions.svelte.ts \
  src/lib/state/playerSettings.svelte.ts \
  src/lib/state/lobby.svelte.ts \
  src/lib/components/world/Cat.svelte \
  src/lib/components/world/Cats.svelte \
  src/lib/components/ui/CatPrompt.svelte \
  src/lib/components/ui/MissionHud.svelte \
  src/lib/components/ui/SettingsMenu.svelte \
  src/lib/components/ui/CheckpointPrompt.svelte \
  src/lib/Scene.svelte \
  src/routes/+page.svelte

# Frontend: build
cd frontend && bun run build

# Backend: sin cambios, se comprueba que sigue compilando
cd backend && bunx tsc --noEmit
```

Casos manuales:

1. Abrir el juego en un navegador limpio y comprobar en DevTools que existe `rw:profile:v1` con un `playerId` UUID; recargar y verificar que no cambia.
2. Crear manualmente `lobby:name = "Ana"` y `player:labelColor = "#38bdf8"`, borrar `rw:profile:v1`, recargar; el perfil debe tener `alias = "Ana"` y el color azul, y las claves antiguas deben desaparecer.
3. Recorrer el mapa y comprobar que hay 25 gatos, 5 por zona, en las posiciones de §11.
4. Acercarse a un gato: aparece el aviso con nombre y zona; alejarse: desaparece.
5. Pulsar `E` frente a un gato: el gato desaparece, el HUD sube a `1/25` y aparece el aviso temporal. Recargar: sigue `1/25` y el gato no está.
6. Pulsar `E` lejos de un gato: no ocurre nada.
7. Abrir el chat y escribir con `E`: no se captura ningún gato.
8. Entrar en la cripta (`minigame-2`): no hay gatos ni aviso; salir al mapa: reaparecen los pendientes.
9. Capturar los 25 gatos (o preparar `rw:missions:v1` con los 25 IDs desde DevTools): aparece el banner de completado y el HUD queda en `25/25`. Recargar: no se repite el banner.
10. En ajustes, pulsar `Reiniciar misión`, cancelar y comprobar que no cambia nada; repetir y confirmar: vuelven los 25 gatos y `0/25`, sin cambiar alias ni color.
11. Abrir dos pestañas, capturar un gato distinto en cada una y comprobar que el contador común termina mostrando la unión de ambos.
12. Corromper `rw:missions:v1` con texto inválido y recargar: la app no rompe, muestra `0/25` y permite capturar.
13. Probar en viewport móvil o con `?touch=1`: el botón `Atrapar` funciona y no se solapa con el stick, salto o correr.
14. Apagar el backend y repetir una captura: la misión local sigue funcionando.

## 9. Riesgos y mitigaciones

| Riesgo                                                    | Impacto | Mitigación                                                                                                   |
| --------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| El usuario borra datos del navegador y pierde el progreso | alto    | Aceptado en esta fase; el HUD y los ajustes indican que el progreso es local.                                |
| El `playerId` se regenera por un fallo de migración       | alto    | `init()` idempotente, validación antes de escribir y prueba manual de recarga.                               |
| Las claves antiguas y el perfil nuevo se desincronizan    | medio   | Migración única, borrado de claves legacy y `lobby` leyendo solo del perfil.                                 |
| Alguna posición de gato cae dentro de un collider         | medio   | Tabla fija validada contra los triángulos de `map.glb`, flood-fill desde el spawn y prueba con `?physics=1`. |
| `E` dispara gato y checkpoint a la vez                    | medio   | Separación mínima de 4 m y prioridad explícita del gato en `CheckpointPrompt`.                               |
| 25 gatos bajan el rendimiento                             | medio   | GLB de 442 triángulos clonado, sin físicas y detección a 10 Hz.                                              |
| Dos pestañas se pisan el registro                         | medio   | Lectura-modificación-escritura con unión de `collectedIds` y evento `storage`.                               |
| `localStorage` lleno o bloqueado                          | medio   | Fallback en memoria, `try/catch` y aviso por consola; la app sigue jugable.                                  |
| El progreso local se puede editar a mano                  | bajo    | Aceptado: no hay recompensas ni economía; la misión es personal.                                             |
| El HUD tapa el chat, los ajustes o los controles móviles  | medio   | Posiciones fijas acordadas, panel plegable y ajuste de `bottom` con `touch-controls-active`.                 |
| El modelo del gato no convence visualmente                | bajo    | Sustituible por otro GLB sin cambiar el catálogo ni el estado; el ID y la posición mandan.                   |
| Cambiar nombres o zonas rompe progreso                    | bajo    | Los IDs `cat-01`…`cat-25` son la clave persistida; nombres y zonas son solo presentación.                    |

## 10. Preguntas abiertas (resueltas)

- [x] ¿El modelo procedural de gato es suficiente para esta fase o se prefiere un GLB hecho en Blender?
      Se usa el GLB existente `frontend/static/gato.glb`; no se modela nada nuevo.
- [x] ¿Los gatos deben ser visibles para otros jugadores o cada jugador ve solo los suyos?
      Solo los propios: es una misión por jugador y no hay backend.
- [x] ¿Las posiciones deben ser fijas o aleatorias por partida/jugador?
      Fijas y deterministas, para que el mapa sea aprendible.
- [x] ¿La misión debe dar alguna recompensa o desbloquear algo al completarse?
      Sí: al completar los 25, el jugador desbloquea `Scarecrow_Feet.glb` para portarlo. El desbloqueo y el equipado se implementan en `SPEC-016` (cosméticos/skins); esta spec deja el estado `completed` persistido como disparador.
- [x] ¿Se permite reiniciar la misión desde ajustes?
      Sí, con confirmación explícita.
- [x] ¿Hace falta sonido al capturar o al completar?
      No en esta fase.
- [x] ¿Se quieren varios perfiles locales en el mismo navegador?
      Un único perfil activo.
- [x] ¿Debe haber una pista visual tipo brillo o huella para gatos lejanos?
      No: solo el gato y el aviso de proximidad.
- [x] ¿La misión debe seguir disponible si el backend está apagado?
      Sí, todo es local.

## 11. Decisiones y notas

### Identidad y persistencia

- El progreso se indexa por un `playerId` local estable, **no** por `lobby.self.id`. El id del socket cambia al reconectar y no sirve para persistencia.
- Todo vive en `localStorage`; no se añade backend ni base de datos. El esquema ya está separado por `playerId` y `missionId` para poder migrarlo a una tabla en el futuro.
- Se usan claves versionadas `rw:profile:v1` y `rw:missions:v1`. Las claves antiguas (`lobby:name`, `player:labelColor`) se migran y se eliminan.
- El alias y el color siguen siendo la configuración visible del jugador; `lobby.svelte.ts` y `playerSettings.svelte.ts` pasan a ser consumidores del perfil.
- Si `localStorage` falla, la app funciona con estado en memoria durante la sesión; no se bloquea la captura.

### Catálogo de 25 gatos

Todos los gatos están apoyados en la altura real de su zona: `y = 0` en el claro central y `y = 0.4` en las cuatro áreas. La columna `Zona` usa las etiquetas visibles; el ID es la clave persistida. Las posiciones se verificaron contra los triángulos de `map.glb` (suelo libre, fuera de colliders) y mediante flood-fill desde el spawn.

| ID     | Zona       | Nombre    | X     | Y   | Z   |
| ------ | ---------- | --------- | ----- | --- | --- |
| cat-01 | Centro     | Michi     | -14   | 0.0 | 6   |
| cat-02 | Centro     | Bigotes   | 7     | 0.0 | 2   |
| cat-03 | Centro     | Sombra    | -7    | 0.0 | 2   |
| cat-04 | Centro     | Calcetín  | 0     | 0.0 | -10 |
| cat-05 | Centro     | Luna      | 6     | 0.0 | -12 |
| cat-06 | Bosque     | Ceniza    | -33   | 0.4 | -22 |
| cat-07 | Bosque     | Mora      | -30   | 0.4 | -12 |
| cat-08 | Bosque     | Hechizo   | -22   | 0.4 | -50 |
| cat-09 | Bosque     | Belladona | -50   | 0.4 | -25 |
| cat-10 | Bosque     | Musgo     | -43.5 | 0.4 | -49 |
| cat-11 | Castillo   | Vlad      | 33    | 0.4 | -14 |
| cat-12 | Castillo   | Noche     | 20    | 0.4 | -22 |
| cat-13 | Castillo   | Cripta    | 48    | 0.4 | -25 |
| cat-14 | Castillo   | Murci     | 33    | 0.4 | -52 |
| cat-15 | Castillo   | Gárgola   | 19    | 0.4 | -37 |
| cat-16 | Calabazar  | Calabaza  | -33   | 0.4 | 14  |
| cat-17 | Calabazar  | Maíz      | -40   | 0.4 | 19  |
| cat-18 | Calabazar  | Heno      | -25   | 0.4 | 28  |
| cat-19 | Calabazar  | Semilla   | -42   | 0.4 | 48  |
| cat-20 | Calabazar  | Susto     | -20   | 0.4 | 50  |
| cat-21 | Cementerio | Hueso     | 33    | 0.4 | 14  |
| cat-22 | Cementerio | Lápida    | 20    | 0.4 | 20  |
| cat-23 | Cementerio | Vela      | 48    | 0.4 | 20  |
| cat-24 | Cementerio | Niebla    | 33    | 0.4 | 47  |
| cat-25 | Cementerio | Alma      | 18    | 0.4 | 39  |

Zonas visibles:

| Zona         | Etiqueta            | Descripción corta                             |
| ------------ | ------------------- | --------------------------------------------- |
| `centro`     | Claro central       | Alrededor del árbol grande y los checkpoints. |
| `bosque`     | Bosque de la bruja  | Camino y cementerio junto a la casa.          |
| `castillo`   | Castillo de Drácula | Camino de acceso y laterales del castillo.    |
| `calabazar`  | Calabazar           | Campos, camino y corral de la granja.         |
| `cementerio` | Cementerio maldito  | Camino, tumbas y mausoleo.                    |

Notas de colocación:

- La separación mínima entre gatos es `6.32 m` (`cat-04` / `cat-05`), muy por encima de los 4 m exigidos.
- La distancia mínima al spawn `(0, 0, 12)` o a los checkpoints `(-6, 0, -6)`, `(21.48, 0.3, 35.5)` y `(0, 0, 6)` es `7.21 m` (`cat-04` respecto a `(-6, 0, -6)`), fuera del radio de captura de 2.2 m.
- `cat-25` está a `4.9 m` del checkpoint de la cripta `(21.48, 35.5)`, de modo que ambos avisos no se activan a la vez.
- Ninguna posición toca un collider de valla, edificio, tronco, coche aparcado o escenario. Las 25 posiciones se revalidaron contra los triángulos de `map.glb` con un margen de 0.35 m, y todas son alcanzables caminando desde el spawn (comprobado con flood-fill sobre la malla de suelo y con `__world.teleport`/`__world.step` en el navegador).
- El claro central y las áreas usan alturas distintas (`0` y `0.4`); el catálogo lo refleja con `CAT_Y_CENTER` y `CAT_Y_AREA`.

### Interacción y rendimiento

- La detección de proximidad usa distancia al `playerState`, no 25 sensores Rapier. Es más simple, no añade colliders y no interfiere con el controlador del jugador.
- Los 25 gatos comparten una sola descarga de `/gato.glb` (la caché de `useGltf`); cada instancia clona la escena, tinta solo el material del pelaje y reutiliza geometría y texturas. El material tintado se libera al desmontar.
- La captura no exige mirar al gato: basta con estar dentro de `CAT_CAPTURE_RADIUS`. Se prioriza que sea fácil y no frustrante.
- `E` conserva el comportamiento actual de `PlayerBehaviour` (`HR_pickup`), así que la animación de recoger ya se reproduce sin añadir código nuevo.
- El aviso de gato y el de checkpoint comparten la franja inferior. El gato gana si ambos están activos.
- Los gatos no se renderizan en la cripta ni en escenas de minijuego con geometría propia.
- El HUD de misión se coloca arriba a la izquierda como un botón discreto con anillo de progreso; el detalle (misiones, progreso y registro por zonas) solo aparece al pulsarlo. Así el juego queda despejado y el chat, los ajustes y el HUD del minijuego 2 conservan su espacio.

### Sincronización entre pestañas

- Al capturar, se lee el registro actual de `localStorage`, se fusionan los IDs propios con los almacenados y se escribe la unión. Esto evita que dos pestañas se pisen.
- El evento `storage` recarga perfil y misiones cuando otra pestaña cambia los datos.
- Si una pestaña ve una misión completada, no vuelve a mostrar el banner de completado; solo actualiza el HUD.

## 12. Progreso

| Fecha      | Estado       | Nota                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-01 | borrador     | Spec creado: perfil local, misión de 25 gatos y HUD.                                                                                                                                                                                                                                                                                                                                                 |
| 2026-11-01 | implementado | Perfil versionado, registro de misiones, catálogo de 25 gatos, render con `gato.glb`, detección a 10 Hz, aviso `E`/táctil, HUD, ajustes y sincronización entre pestañas. Las 25 posiciones se validaron contra la geometría de `map.glb` (suelo libre, fuera de colliders y alcanzables desde el spawn). `bun run check`, Prettier acotado, `bun run build` y `bunx tsc --noEmit` del backend pasan. |
| 2026-11-02 | implementado | UI de misiones rediseñada: el HUD permanente se sustituye por un botón con icono y anillo de progreso arriba a la izquierda. Al pulsarlo se abre un panel con las misiones disponibles, estado, contador, barra y el registro por zonas; se cierra con el botón, `Escape` o clic fuera. `bun run check`, Prettier y `bun run build` pasan y se verificó el panel en Chromium headless.               |
| 2026-11-04 | implementado | Audio de captura: cada gato reproduce `cat_meow` y `cat_purr` posicionados en el punto donde estaba al pulsar `E`/`Catch`. El evento usa un `seq` monotónico en `MissionStore` y no se repite al recargar.                                                                                                                                                                                           |
| 2026-11-12 | implementado | Reposicionados `cat-01` y `cat-05`, que quedaban bajo el coche de Halloween y dentro del escenario del baile: `cat-01` pasa a `(-14, 0, 6)` y `cat-05` a `(6, 0, -12)`. Las 25 posiciones se revalidaron contra los triángulos de `map.glb`: 0 colisiones con vallas, edificios, tronco, coches o escenario, suelo correcto en todas y separación mínima de 6.32 m. `npcs:check`, `map:check`, `check` y `lint` en verde. |

Pendiente de prueba manual: dos pestañas reales con capturas concurrentes (CA-16), entrada/salida de la cripta durante la misión (CA-14) y botón táctil `Atrapar` en viewport móvil (CA-15). El resto de criterios se comprobó en Chromium headless con `?physics=1`, teletransportes vía `__world` y eventos de teclado CDP: perfiles y migración, captura de los 25 gatos, aviso, HUD, panel por zonas, completado, reinicio, persistencia y corrupción del registro.

## 13. Changelog

- 2026-11-01 — Creación del spec con catálogo de 25 gatos, perfil local y registro de misiones en `localStorage`.
- 2026-11-01 — Implementación completa del perfil, el registro de misiones, el render, el aviso, el HUD y los ajustes. El modelo procedural se sustituye por el GLB `gato.glb`.
- 2026-11-01 — Reposicionados los 25 gatos sobre suelo caminable real (claro central a `y = 0`, áreas a `y = 0.4`), fuera de colliders, con separación mínima de 7.81 m y alcance verificado desde el spawn.
- 2026-11-01 — Verificación en Chromium headless con `__world.teleport` y eventos de teclado CDP: captura, HUD, completado y persistencia tras recarga.
- 2026-11-02 — Rediseño de la UI de misiones: botón con icono y anillo de progreso en la esquina superior izquierda; panel desplegable con misiones, progreso y registro por zonas, cerrable con botón, `Escape` o clic fuera.
- 2026-11-02 — El registro `rw:missions:v1` se reutiliza para la misión de la cripta (`crypt-5-skulls`), que otorga la skin `mummy`; los gatos siguen otorgando `crow-warden`.
- 2026-11-04 — Sonido de captura: maullido y ronroneo procedurales
  (`cat_meow`, `cat_purr`) en la posición del gato, sin assets ni red.
- 2026-11-12 — `cat-01` y `cat-05` salen de debajo del coche de Halloween y
  del escenario del baile (`-14, 0, 6` y `6, 0, -12`). Revalidación de las 25
  posiciones contra la geometría del `map.glb` actual, incluidos los elementos
  nuevos.
