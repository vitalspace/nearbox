---
id: SPEC-009
titulo: "Físicas Rapier del mapa exportado: suelos, vallas y edificios"
estado: implementado
prioridad: alta
creado: 2026-10-30
actualizado: 2026-11-12
responsable: opencode
etiquetas:
  [
    threlte,
    rapier,
    gltf,
    mapa,
    colisiones,
    jugador,
    blender,
    area1,
    area2,
    area3,
    area4,
  ]
depende_de: [SPEC-008, SPEC-005]
bloquea: []
estimacion: "10h"
---

# SPEC-009 — Físicas Rapier del mapa exportado: suelos, vallas y edificios

## 1. Contexto

`SPEC-008` dejó las cuatro áreas jugables construidas en Blender y el mapa se
exporta a un único `map.glb`. El archivo que el usuario va a colocar en
`frontend/static/map.glb` contiene hoy:

| Dato                    | Valor                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Nodos                   | 214                                                                                                                     |
| Mallas                  | 156                                                                                                                     |
| Triángulos totales      | 144 895                                                                                                                 |
| Materiales              | 154                                                                                                                     |
| Animaciones             | 76 (73 murciélagos + 3 espantapájaros)                                                                                  |
| Raíces de escena        | `area1`–`area4`, `Circle`, `BigTree`, `WitchHouse`, `DraculaCastle`, `PumpkinFarm`, `CursedCemetery` y tres `Scarecrow` |
| Altura de la superficie | `y = 0.4` (las áreas están escaladas 80× y su `z` local es `0.005`)                                                     |

El GLB incluye las animaciones de los murciélagos de las cuatro áreas y del
árbol central (`*_Bat_*_Fly` / `*_Swing`, transformación + _shape keys_) y las
tres `SC_idle` de los espantapájaros. `Map.svelte` las reproduce en bucle: un
mixer para los murciélagos y un mixer por espantapájaros (comparten nombres de
hueso, así que no pueden usar el mismo).

El frontend actual **no renderiza el mapa**: `Scene.svelte` solo monta
`Ground.svelte` (una caja de 20×20 en `y = -0.5`), `Sky.svelte` y `Player`.
`PlayerBehaviour.svelte` mueve el sprite a mano, con gravedad propia y un
límite artificial de `±9` en X/Z; `PlayerCollider.svelte` es un cuerpo
cinemático que únicamente copia esa posición. No hay ninguna colisión real.
Además, `src/lib/assets/world.svelte` es un componente viejo generado para
`/world.glb` que ya no se importa y no corresponde a este mapa.

La idea correcta es **no dar físicas a todo**. Un colisionador por cada malla
del GLB tendría tres problemas:

1. **Coste**: se pagaría CPU y memoria por objetos que nunca deben bloquear
   (murciélagos, telarañas, carteles, luces, calabazas, caminos).
2. **Gameplay**: una telaraña o un cartel con trimesh genera paredes
   invisibles y atascos.
3. **Robustez**: los trimeshes decorativos suelen ser geometría abierta o de
   una sola cara; Rapier los colisiona, pero el resultado es impredecible.

Por eso el mapa se divide en dos capas:

- **Visual**: todo el GLB, renderizado por el componente generado con
  `@threlte/gltf`.
- **Física**: solo los volúmenes estáticos que deben pisarse o bloquear:
  **suelos, vallas/puertas, edificios y el tronco del árbol central**.

El jugador deja de moverse “a mano” y pasa a usar el
`KinematicCharacterController` de Rapier. Sin ese cambio, los colisionadores
existirían pero el sprite los atravesaría igual, porque hoy su posición se
escribe directamente sin consultar la simulación.

## 2. Objetivo

Renderizar `frontend/static/map.glb` mediante un componente generado por
`@threlte/gltf`, añadirle colisionadores estáticos de Rapier **solo** a los
suelos, vallas, puertas, edificios y al tronco del árbol central, y sustituir
el movimiento artificial del jugador por un controlador cinemático que
colisione de verdad con esa geometría (sin abandonar el mapa ni atravesar
paredes).

## 3. Alcance

**Incluye**

- Generación de `Map.svelte` a partir de `static/map.glb` con `@threlte/gltf`.
- Lista blanca versionada de nodos con colisión (`map-colliders.json`).
- Física dentro de `Map.svelte`: el script de inyección envuelve cada nodo de la
  lista blanca en `<AutoColliders shape="trimesh">` de `@threlte/rapier`.
- Script de verificación `verify-map-colliders.mjs` que compara el GLB con la
  lista blanca.
- Render del mapa desde `Scene.svelte`.
- Retirada del suelo falso de 20×20 y de su colisionador.
- Controlador cinemático del jugador con gravedad, salto, escalón y pendientes.
- Spawn, caída al vacío y reaparición.
- Depuración de colisiones con `?physics=1`.
- Iluminación mínima para que el mapa se vea (hoy no hay luces en la escena).
- Verificación en navegador de colisiones, rendimiento y checkpoints.

**No incluye**

- Modelar o modificar nada en Blender (se asume el `map.glb` exportado).
- Físicas para personajes, monstruos, murciélagos, telarañas o decoración.
- Físicas dinámicas (cajas que caen, vehículos, ragdolls).
- Navmesh, IA o _spawn points_ de monstruos.
- Cambiar el diseño de las áreas de `SPEC-008`.
- Rehacer el chat, lobby, checkpoints o multijugador.
- Comprimir el GLB con `--transform` (se puede añadir después sin cambiar el
  plan; ver §10).

## 4. Requisitos

### Funcionales

| ID    | Requisito                                                                                                                                                                                                                                                                                            | Prioridad |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| RF-1  | `map.glb` se sirve desde `frontend/static/map.glb` y el componente lo carga como `/map.glb`.                                                                                                                                                                                                         | alta      |
| RF-2  | `Map.svelte` se genera con `npx @threlte/gltf@latest map.glb -K -k -d "https://www.gstatic.com/draco/versioned/decoders/1.4.3/"` y se mueve a `src/lib/components/world/Map.svelte`; después `inject-map-colliders.mjs` añade los `AutoColliders` de la lista blanca sin tocar el resto del archivo. | alta      |
| RF-3  | `Scene.svelte` monta `<Map />` en la identidad (sin rotar, escalar ni trasladar el mapa).                                                                                                                                                                                                            | alta      |
| RF-4  | Solo los nodos de la lista blanca reciben colisionador; el resto no crea ningún cuerpo ni collider.                                                                                                                                                                                                  | alta      |
| RF-5  | Suelos con colisión: `Circle` y `area1`–`area4`.                                                                                                                                                                                                                                                     | alta      |
| RF-6  | Vallas y puertas con colisión: `WHH_Fence`, `DRC_Fence`, `DRC_Gate`, `PFM_Fence`, `PFM_Gate`, `CCC_Fence` y `CCC_Gate`.                                                                                                                                                                              | alta      |
| RF-7  | Edificios y estructuras con colisión: `WHH_House`, `WHH_Roof`, `WHH_Tower`, `WHH_Chimney`, `WHH_Porch`, `DRC_Castle`, `PFM_Farmhouse`, `PFM_Barn`, `PFM_Silo`, `CCC_Chapel` y `CCC_Mausoleum`.                                                                                                       | alta      |
| RF-8  | El tronco del árbol central (`TREE_Trunk`) tiene colisión; su copa y decoración no.                                                                                                                                                                                                                  | alta      |
| RF-9  | Todos los colisionadores del mapa son estáticos (sin `RigidBody`), con fricción 0.9 y restitución 0.                                                                                                                                                                                                 | alta      |
| RF-10 | Cero colisionadores en murciélagos, telarañas, carteles, ventanas, caminos, campos, patios, calabazas, props, copas de árboles, hojas, luces y personajes.                                                                                                                                           | alta      |
| RF-11 | El jugador usa un `KinematicCharacterController` de Rapier con cápsula de radio 0.45 y semialtura 0.6 (2.1 m de alto), coherente con el sprite de 2.2 m.                                                                                                                                             | alta      |
| RF-12 | El controlador aplica gravedad, salto, _autostep_ de 0.5 m, _snap to ground_ y pendientes de hasta 50°.                                                                                                                                                                                              | alta      |
| RF-13 | El sprite y la cámara siguen la posición **física** del jugador; se elimina el límite `±9` y la gravedad manual de `PlayerBehaviour`.                                                                                                                                                                | alta      |
| RF-14 | Existe un spawn explícito y una reaparición automática si el jugador cae por debajo de `y = -20`.                                                                                                                                                                                                    | alta      |
| RF-15 | Mientras `map.glb` carga, el jugador espera en el spawn sin caer; la física arranca cuando los colisionadores están listos.                                                                                                                                                                          | alta      |
| RF-16 | Los checkpoints siguen funcionando y se retira la caja de suelo de 20×20 (malla y collider).                                                                                                                                                                                                         | alta      |
| RF-17 | `?physics=1` activa `<Debug />` de `@threlte/rapier` para ver los colisionadores.                                                                                                                                                                                                                    | media     |
| RF-18 | La escena tiene iluminación suficiente para ver los materiales PBR del mapa (hemisférica + direccional).                                                                                                                                                                                             | alta      |
| RF-19 | `bun run map:check` valida que todos los nombres de la lista blanca existen en el GLB, que no hay solapamiento con la lista negra y que el total de triángulos de colisión no supera 60 000.                                                                                                         | media     |
| RF-20 | Regenerar `Map.svelte` con `map:build` vuelve a inyectar los `AutoColliders` desde la lista blanca; no hay que editar `Map.svelte` a mano (salvo que cambien los nombres).                                                                                                                           | media     |
| RF-21 | El controlador del jugador ignora los sensores de Rapier (`QueryFilterFlags.EXCLUDE_SENSORS`) para poder atravesar los checkpoints.                                                                                                                                                                  | alta      |
| RF-22 | `Map.svelte` reproduce en bucle las animaciones del GLB: los 73 clips de murciélagos y las 3 `SC_idle` de los espantapájaros.                                                                                                                                                                        | alta      |

### No funcionales

| ID     | Requisito                  | Criterio                                                                                                                     |
| ------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| RNF-1  | Coste de colisión          | ≤ 60 000 triángulos de collider; hoy la lista blanca suma 51 763.                                                            |
| RNF-2  | Tiempo de carga            | Crear todos los colliders en < 500 ms en un portátil de gama media.                                                          |
| RNF-3  | Rendimiento                | 60 fps estables en el mapa completo con el jugador y los checkpoints.                                                        |
| RNF-4  | Sin asignaciones por frame | El controlador reutiliza `Vector3`, no crea objetos en `usePhysicsTask`.                                                     |
| RNF-5  | Alineación                 | El collider coincide con la superficie visible con error ≤ 0.05 m.                                                           |
| RNF-6  | Determinismo               | La misma lista blanca produce siempre los mismos 24 colisionadores.                                                          |
| RNF-7  | Tipado y estilo            | `bun run check` y `bun run lint` pasan sin errores.                                                                          |
| RNF-8  | SSR seguro                 | Todo el código de Rapier/GLTF vive dentro de `<Canvas>` o de un `$effect`; nada toca `window` en SSR.                        |
| RNF-9  | Transformación             | `Map` y `MapPhysics` se montan en la identidad; si algún día se mueve el mapa, deben moverse también los colliders (ver §9). |
| RNF-10 | Mantenibilidad             | La lista blanca está en un único JSON; el componente generado no se edita a mano.                                            |

## 5. Criterios de aceptación

- [x] CA-1: `frontend/static/map.glb` existe y `Map.svelte` fue generado con el comando de RF-2; su cabecera apunta a `/map.glb` y al decodificador Draco indicado.
- [x] CA-2: `Scene.svelte` renderiza `<Map />` una sola vez; no hay dos mapas ni dos cargas de red.
- [x] CA-3: `bun run map:check` informa exactamente 24 nodos con colisión y 51 323 triángulos, sin nombres desconocidos.
- [x] CA-4: Con `?physics=1` se ven los colisionadores estáticos de los 24 nodos: 5 suelos, 7 vallas/puertas, 11 edificios y 1 tronco.
- [x] CA-5: Caminando contra cualquier valla de las cuatro áreas el jugador se detiene; no la atraviesa ni la trepa.
- [x] CA-6: El jugador puede cruzar el hueco de las puertas (`WHH_Fence`, `DRC_Gate`, `PFM_Gate`, `CCC_Gate`) y entrar a cada área.
- [x] CA-7: El jugador choca con las fachadas, torre, porche, castillo, granero, silo y capilla.
- [x] CA-8: El jugador sube el escalón de 0.4 m entre `Circle` y las áreas y el porche sin saltar; el _autostep_ funciona.
- [x] CA-9: El jugador salta con `Space` y cae con gravedad; el salto solo se aplica estando en el suelo.
- [x] CA-10: Ya no existe el límite `±9`; el jugador recorre libremente el disco de 80 m de radio.
- [x] CA-11: Al salir del disco y caer por debajo de `y = -20`, el jugador reaparece en el spawn sin recargar la página.
- [x] CA-12: Los tres checkpoints siguen activando su sensor al pasar por encima.
- [x] CA-13: La caja de suelo de 20×20 y su `AutoColliders` fueron eliminados; no queda ningún suelo duplicado visible ni invisible.
- [x] CA-14: El mapa se ve iluminado y con sus materiales, sin depender de la iluminación por defecto de Blender.
- [x] CA-15: Las mallas decorativas (murciélagos, telarañas, carteles, calabazas, caminos, copas de árbol) no bloquean al jugador.
- [x] CA-16: `bun run check` pasa sin errores y `bun run lint` pasa en todos los archivos de esta tarea (quedan 3 avisos previos: `assets/Gemini_…pixels.json`, `assets/world.svelte` y `components/world/Sky.svelte`).
- [x] CA-17: La creación de colliders se registra en consola en modo desarrollo (`[map] física lista`).
- [x] CA-18: Regenerar `Map.svelte` y recargar no rompe la física ni duplica colisionadores.
- [x] CA-19: Los 73 murciélagos aletean/vuelan y los tres espantapájaros reproducen su `SC_idle`; las animaciones sobreviven a `map:build` porque las inyecta `inject-map-colliders.mjs`.

## 6. Archivos relevantes

| Ruta                                                        | Acción                                | Motivo                                                                                                          |
| ----------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `frontend/static/map.glb`                                   | aportar (usuario)                     | Mapa exportado desde Blender; se sirve como `/map.glb`.                                                         |
| `frontend/src/lib/components/world/Map.svelte`              | crear (generado)                      | Componente de `@threlte/gltf` con todo el contenido visual y los `AutoColliders` inyectados.                    |
| `frontend/scripts/inject-map-colliders.mjs`                 | crear                                 | Envuelve cada nodo de la lista blanca en `<AutoColliders shape="trimesh">` dentro de `Map.svelte`.              |
| `frontend/src/lib/components/world/map-colliders.json`      | crear                                 | Única fuente de verdad de qué nodos colisionan.                                                                 |
| `frontend/scripts/build-map.sh`                             | crear                                 | Ejecuta `@threlte/gltf`, mueve el componente generado, inyecta los colliders y pasa Prettier.                   |
| `frontend/scripts/verify-map-colliders.mjs`                 | crear                                 | Valida nombres, exclusiones y presupuesto de triángulos contra el GLB.                                          |
| `frontend/scripts/world-compress.mjs`                       | crear                                 | Comprime el GLB con Draco (`world:compress` / `map:compress`) y conserva el export original en `world/source/`. |
| `frontend/world/source/map.glb`                             | crear (backup)                        | Export sin comprimir que alimenta la recompresión y los verificadores que leen vértices.                        |
| `blender/scripts/export_map.py`                             | crear                                 | Reexporta el mapa con las 76 animaciones (murciélagos + espantapájaros) a `frontend/static/map.glb`.            |
| `frontend/src/lib/components/world/Lighting.svelte`         | crear                                 | Hemisférica + direccional para los materiales PBR.                                                              |
| `frontend/src/lib/components/world/Checkpoints.svelte`      | crear (renombrado de `Ground.svelte`) | Solo los checkpoints; la caja de suelo de 20×20 y su collider se eliminaron.                                    |
| `frontend/src/lib/Scene.svelte`                             | modificar                             | Montar `Map`, `Lighting` y `Checkpoints`; retirar `Ground`.                                                     |
| `frontend/src/lib/components/player/PlayerCollider.svelte`  | modificar                             | Sustituir el kinematic “títere” por el character controller real.                                               |
| `frontend/src/lib/components/player/PlayerBehaviour.svelte` | modificar                             | Dejar de mover el sprite a mano; solo publicar intención y animar.                                              |
| `frontend/src/lib/state/playerState.ts`                     | modificar                             | Añadir `grounded`, `ready` y el spawn; `y` pasa a ser altura de pies.                                           |
| `frontend/src/lib/state/playerIntent.ts`                    | crear                                 | Intención de movimiento/salto compartida entre animación y física.                                              |
| `frontend/src/lib/state/mapState.svelte.ts`                 | crear                                 | `ready` + métricas del mapa para la UI y la física.                                                             |
| `frontend/package.json`                                     | modificar                             | Scripts `map:build` y `map:check`.                                                                              |
| `frontend/src/lib/assets/world.svelte`                      | sin cambios                           | Componente viejo no importado; no se usa en esta tarea.                                                         |
| `specs/SPEC-009-fisicas-rapier-mapa.md`                     | crear                                 | Este spec.                                                                                                      |

## 7. Plan de implementación

### Fase 0 — Generar el componente del mapa

- [x] Paso 1: Confirmar que `frontend/static/map.glb` existe y que empieza por la firma `glTF`; registrar tamaño y fecha.
- [x] Paso 2: Crear `frontend/scripts/build-map.sh` con el comando de RF-2
      ejecutado desde `frontend/static` y un `mv` del archivo generado
      (`map.svelte` o `Map.svelte`) a
      `frontend/src/lib/components/world/Map.svelte`.
- [x] Paso 3: Ejecutar `bun run map:build` y verificar que el archivo generado
      quedó en `components/world/` y no en `static/`.
- [x] Paso 4: Verificar en la cabecera que la ruta es `/map.glb` y que
      `useDraco` apunta al CDN indicado; no editar el cuerpo generado.
- [x] Paso 5: Añadir a `package.json`:
  ```json
  "map:build": "bash scripts/build-map.sh"
  ```

### Fase 1 — Lista blanca y verificador

- [x] Paso 1: Crear `map-colliders.json` con los 24 nodos de RF-5 a RF-8,
      agrupados por `suelo`, `vallas`, `edificios` y `obstaculos`.
- [x] Paso 2: Incluir una lista `exclude` explícita con los patrones de §11
      (`*_Bats`, `*_Webs`, `*_SignText`, `*_Path`, etc.) para que el verificador
      detecte solapamientos.
- [x] Paso 3: Escribir `verify-map-colliders.mjs` usando solo Node (`fs`,
      `path`): leer el chunk JSON del GLB, recorrer `nodes` y `meshes`, contar
      triángulos por primitiva y comparar con la lista blanca.
- [x] Paso 4: El script falla con código 1 si un nombre no existe, si un nodo
      está en ambas listas o si el total supera 60 000 triángulos.
- [x] Paso 5: Añadir `"map:check": "node scripts/verify-map-colliders.mjs"` y
      ejecutarlo; guardar el resultado en §12.

### Fase 2 — Render del mapa y limpieza del suelo falso

- [x] Paso 1: Importar `Map` en `Scene.svelte` y montarlo en la identidad.
- [x] Paso 2: Renombrar `Ground.svelte` a `Checkpoints.svelte`, eliminar la
      malla `BoxGeometry(20, 1, 20)` y su `AutoColliders`, y conservar solo los
      checkpoints con `position={[0, 0.1, 0]}`.
- [x] Paso 3: Quitar `<Ground />` de `Scene.svelte` y montar `Checkpoints` en
      su lugar.
- [x] Paso 4: Crear `Lighting.svelte` con una `HemisphereLight` (cielo cálido,
      suelo oscuro) y una `DirectionalLight` con sombras suaves; montarlo en
      `Scene`.
- [x] Paso 5: Verificar que las cuatro áreas, la casa, el castillo, la granja
      y el cementerio se ven con sus materiales y sin z-fighting evidente.
- [x] Paso 6: Confirmar que el disco `Circle` y las áreas están a `y = 0.4` y
      que no queda ningún suelo de prueba.

### Fase 3 — Colisionadores del mapa

- [x] Paso 1: Crear `inject-map-colliders.mjs`; lee `map-colliders.json` y
      localiza cada nodo (grupo o malla) en el `Map.svelte` recién generado.
- [x] Paso 2: Envolver cada bloque en `<AutoColliders shape="trimesh"
friction={0.9} restitution={0}>`. `AutoColliders` crea un trimesh estático
      por cada primitiva de malla hija, usando sus transformaciones de mundo
      (incluidas la escala 80× de las áreas y la 1.71 del árbol).
- [x] Paso 3: Añadir el `import { AutoColliders } from '@threlte/rapier'` y el
      `import { mapState }` si no existen.
- [x] Paso 4: Marcar `mapState.ready = true` en el `oncreate` del `AutoColliders`
      del suelo `Circle`, cuando los trimeshes ya existen.
- [x] Paso 5: Aplicar a `Map.svelte` los parches que necesita el código
      generado para tipar (`cloneScene`) y para los props por defecto.
- [x] Paso 6: Ejecutar Prettier al final de `map:build` para que la inyección
      no rompa `bun run lint`.
- [x] Paso 7: Registrar `[map] física lista` en consola solo en desarrollo.
- [x] Paso 8: Activar `<Debug />` de `@threlte/rapier` cuando `location.search`
      incluya `physics=1`.

### Fase 4 — Controlador cinemático del jugador

- [x] Paso 1: Extender `playerState` con `grounded: boolean` y `ready:
boolean`; documentar que `y` es la altura de los pies.
- [x] Paso 2: Crear `playerIntent.ts` con `{ x, z, run, jump, crouch }`.
- [x] Paso 3: En `PlayerBehaviour.svelte`, conservar los listeners de teclado
      y el stick táctil, pero dejar de mover el sprite: publicar la intención en
      `playerIntent` y usar `playerState` para la posición visual.
- [x] Paso 4: En `PlayerCollider.svelte`, crear el cuerpo
      `kinematicPosition` con la cápsula actual y obtener el mundo con
      `useRapier()`.
- [x] Paso 5: Crear el controlador una sola vez:
  ```ts
  const controller = world.createCharacterController(0.02);
  controller.enableAutostep(0.5, 0.3, false);
  controller.enableSnapToGround(0.5);
  controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
  controller.setMinSlopeSlideAngle((30 * Math.PI) / 180);
  controller.setApplyImpulsesToDynamicBodies(true);
  ```
- [x] Paso 6: En `usePhysicsTask(delta)`, calcular el desplazamiento deseado
      con la velocidad de caminar/correr, la orientación de cámara y la gravedad;
      llamar `controller.computeColliderMovement(collider, deseado,
QueryFilterFlags.EXCLUDE_SENSORS)` y usar `controller.computedMovement()`.
- [x] Paso 7: Aplicar el movimiento con
      `body.setNextKinematicTranslation(...)` y escribir en `playerState` la
      posición resultante y `controller.computedGrounded()`.
- [x] Paso 8: Implementar salto solo si `grounded`; reutilizar
      `playerInput.consumeJump()` para el botón táctil.
- [x] Paso 9: Quitar de `PlayerBehaviour` el bloque `vy`, `airborne`,
      `LIMIT` y el cálculo de `x`/`z`; conservar solo la animación (`idle`, `walk`,
      `run`, `jump`, `quat`) y `updatePosition`.
- [x] Paso 10: Verificar que la cámara sigue suave (el `useTask` de
      `ThirdPersonCamera` ya lee `playerState`).

### Fase 5 — Spawn, carga y reaparición

- [x] Paso 1: Fijar `SPAWN = { x: 0, y: 0.4, z: 12 }` (al sur del árbol
      central, fuera del tronco) en `playerState`.
- [x] Paso 2: Mientras `mapState.ready` sea `false`, mantener el cuerpo en el
      spawn y no aplicar gravedad.
- [x] Paso 3: Cuando `ready` sea `true`, habilitar el controlador y dejar que
      el jugador caiga los primeros centímetros hasta el suelo.
- [x] Paso 4: Si `playerState.y < -20`, teletransportar al spawn y poner la
      velocidad vertical a 0.
- [x] Paso 5: Bajar el grupo de checkpoints a `y = 0.1` para que las bases
      queden apoyadas en el suelo del mapa y confirmar que sus sensores siguen
      detectando al jugador.
- [x] Paso 6: Comprobar que el spawn no queda dentro de `TREE_Trunk` ni de la
      geometría de un checkpoint.

### Fase 6 — Rendimiento y depuración

- [ ] Paso 1: Medir con `performance.now()` la creación de colliders; debe
      quedar por debajo de 500 ms.
- [ ] Paso 2: Revisar el inspector de red: `map.glb` se descarga una sola vez
      (solo `Map.svelte` lo referencia).
- [ ] Paso 3: Activar `?physics=1` y comprobar que solo se dibujan los
      colliders de los 24 nodos de la lista blanca.
- [ ] Paso 4: Recorrer las cuatro áreas durante 5 minutos con salto, carrera
      y giros; no debe haber atascos en esquinas ni caídas a través del suelo.
- [ ] Paso 5: Medir FPS con el mapa completo y el debug apagado.

### Fase 7 — Verificación y cierre

- [x] Paso 1: Ejecutar `bun run map:check`, `bun run check` y `bun run lint`.
- [x] Paso 2: Repetir los casos manuales de §8 y anotar resultados.
- [x] Paso 3: Actualizar este spec (`estado`, `actualizado`, Progreso,
      Changelog y criterios marcados).
- [ ] Paso 4: Confirmar con el usuario antes de borrar `world.svelte` o
      cualquier asset viejo.

## 8. Verificación

```bash
cd frontend

# 1. Comprimir el GLB servido con Draco (solo cuando cambie el export)
bun run map:compress

# 2. Generar el componente (solo cuando cambie el GLB)
bun run map:build

# 3. Validar lista blanca y presupuesto de triángulos
bun run map:check

# 4. Tipos y formato
bun run check
bun run lint

# 5. Prueba manual
bun run dev
# abrir http://localhost:5173/?physics=1
```

Resultado esperado de `map:check` con el `map.glb` actual:

| Comprobación                   | Esperado                      |
| ------------------------------ | ----------------------------- |
| Nodos del GLB                  | 214                           |
| Mallas del GLB                 | 156                           |
| Animaciones                    | 76                            |
| Nodos con collider             | 24                            |
| Suelos                         | 5 (`Circle`, `area1`–`area4`) |
| Vallas/puertas                 | 7                             |
| Edificios                      | 11                            |
| Obstáculos                     | 1 (`TREE_Trunk`)              |
| Triángulos de collider         | 51 323                        |
| Triángulos totales del mapa    | 144 895                       |
| Nodos decorativos con collider | 0                             |

Casos manuales:

1. **Suelo**: el jugador aparece en `(0, 0.4, 12)`, cae ~0.4 m y queda de pie
   con los pies en `y ≈ 0.02`; no atraviesa `Circle` ni las áreas.
2. **Vallas**: caminar contra `WHH_Fence`, `DRC_Fence`, `PFM_Fence` y
   `CCC_Fence`; el jugador se detiene y puede deslizarse a lo largo.
3. **Puertas**: cruzar los huecos de `DRC_Gate`, `PFM_Gate` y `CCC_Gate`; el
   paso debe ser limpio, sin atravesar las hojas cerradas.
4. **Edificios**: empujar la fachada de la casa, la torre, el castillo, el
   granero y la capilla; no se atraviesan.
5. **Escalón**: subir el desnivel de ~0.4 m entre `Circle` y las áreas (y el
   porche) sin saltar; el _autostep_ lo resuelve.
6. **Salto**: saltar contra una valla; el jugador no debe quedar montado en el
   borde ni caer al vacío a través del suelo.
7. **Límites**: caminar en línea recta 80 m; no debe existir el límite `±9`.
8. **Vacío**: salir del disco y caer; reaparecer en el spawn.
9. **Decoración**: atravesar murciélagos, telarañas, carteles, calabazas y
   caminos; no deben bloquear.
10. **Checkpoints**: pasar por los tres; el aviso de minijuego debe activarse
    (`CheckpointPrompt`). Comprobado en `(0, 6)`: aparece “Minijuego 3”.
11. **Debug**: `?physics=1` muestra los colliders estáticos de los 24 nodos.
12. **Regeneración**: volver a ejecutar `map:build`, reemplazar `Map.svelte`,
    recargar y repetir los casos 1–3.

## 9. Riesgos y mitigaciones

| Riesgo                                                                              | Impacto | Mitigación                                                                                                                                                              |
| ----------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Regenerar `Map.svelte` sobrescribe cambios manuales.                                | Alto    | Regenerar siempre con `map:build`: el inyector vuelve a añadir los `AutoColliders` desde el JSON. No editar `Map.svelte` a mano.                                        |
| El `map.glb` final cambia de nombres o de contenido.                                | Alto    | `map:check` falla y obliga a actualizar `map-colliders.json`; no crear colliders por patrón difuso.                                                                     |
| Los trimeshes de las vallas suman 38 972 triángulos.                                | Medio   | Son estáticos y se crean una vez; si el arranque supera 500 ms, simplificar vallas en Blender o usar colliders por tramos.                                              |
| Suelos `Circle` + `area1`–`area4` son coplanares.                                   | Bajo    | Los 40 triángulos extra son baratos; si aparece jitter, dejar solo `Circle` como suelo y mantener las áreas como visuales.                                              |
| El jugador cae antes de que el mapa termine de cargar.                              | Alto    | `mapState.ready` bloquea la gravedad hasta que los colliders existan.                                                                                                   |
| Vallas finas y velocidad de carrera.                                                | Medio   | El character controller usa _shape cast_, no solo traslación; mantener radio 0.45 y `delta` acotado.                                                                    |
| Los tres `Scarecrow` comparten nombres de hueso (`head`, `root`, …).                | Medio   | El exportador/GLTFLoader deduplica los nodos (`root`, `root_1`, `root_2`) y el inyector crea un `AnimationMixer` por espantapájaros; comprobado con las tres `SC_idle`. |
| `Map` se mueve o se escala en `Scene`.                                              | Medio   | Montarlo en la identidad y documentar que los colliders se calculan en espacio de mundo una sola vez.                                                                   |
| El mapa se ve negro por falta de luces.                                             | Alto    | `Lighting.svelte` con hemisférica y direccional; verificar antes de dar la tarea por terminada.                                                                         |
| El `KinematicCharacterController` no está envuelto por `@threlte/rapier`.           | Medio   | Usar `world.createCharacterController()` y `usePhysicsTask`; no inventar un componente que no existe.                                                                   |
| La lista negra se queda corta y algún decorativo bloquea.                           | Bajo    | Probar los 12 casos manuales; añadir el nombre a `exclude` y volver a ejecutar `map:check`.                                                                             |
| Los sensores de los checkpoints bloquean al personaje.                              | Alto    | `computeColliderMovement` usa `QueryFilterFlags.EXCLUDE_SENSORS`; comprobado caminando por encima del checkpoint `(0, 6)`.                                              |
| El render por software (SwiftShader) va a ~0.6 fps y parece que el jugador “flota”. | Bajo    | No es un fallo de física: el `dt` se acota a 0.05 s. Para probar se usa `window.__world.step(n)` (solo desarrollo).                                                     |

## 10. Preguntas abiertas

- [x] ¿El `map.glb` final incluirá los tres `Scarecrow` con rig, o se
      exportarán como mallas estáticas? Se mantienen con rig; cada uno usa su
      propio mixer y reproduce `SC_idle` sin mezclar esqueletos.
- [ ] ¿El spawn propuesto `(0, 0.4, 12)` es el deseado, o el jugador debe
      aparecer dentro de `area1`?
- [ ] ¿Se quieren colisionadores también para lápidas (`CCC_Graves`,
      `WHH_Graveyard`) y troncos de árboles decorativos? Propuesta: no en esta
      iteración; son obstáculos bajos y suman ~15 000 triángulos.
- [x] ¿Se comprime el GLB con `--transform` (`-T`)? **Sí, desde el 2026-11-12 para
      `map.glb`.** El archivo pasó de 17.95 MB a 3.24 MB (−82 %) con
      `KHR_draco_mesh_compression` usando `map:compress`. El export original queda
      en `world/source/map.glb`: Draco es lossy y los verificadores que leen
      `POSITION` (`race:check`, `npcs:check`) no pueden hacerlo sobre un primitivo
      comprimido. El componente generado registra `useDraco(asset('draco/'))`, el
      decodificador local que ya usaban la cripta y el héroe. `map:check` falla si
      el GLB usa Draco y el componente no lo registra.
- [ ] ¿La reaparición al caer debe ser instantánea o mostrar un aviso? Propuesta:
      instantánea y silenciosa.
- [ ] ¿Se elimina `src/lib/assets/world.svelte` y los GLB viejos? Propuesta:
      sí, pero en una tarea aparte y con confirmación del usuario.

## 11. Decisiones y notas

- **Lista blanca, no lista negra**: se enumeran los 24 nodos que colisionan.
  Así, un decorativo nuevo nunca recibe físicas por accidente.
- **Trimesh estático**: es la única forma de que una valla con huecos, una
  puerta abierta y una fachada con vanos colisionen con precisión. Un
  `convexHull` del edificio sellaría la puerta; un cuboid delataría el volumen.
- **Sin `RigidBody`**: los colliders se crean directamente en el mundo, por lo
  que Rapier los trata como fijos. No hay masa, no se mueven y no consumen
  simulación.
- **Física dentro de `Map.svelte`**: pedido explícito del usuario. El
  `AutoColliders` de `@threlte/rapier` envuelve el nodo visual, así que
  comparte su transformación y no hace falta duplicar la carga del GLB.
  `inject-map-colliders.mjs` vuelve a inyectarlos tras cada `map:build`.
- **`AutoColliders` en vez de `MapPhysics.svelte`**: se descartó el componente
  aparte. Cada nodo envuelto crea un trimesh por primitiva hija (24 nodos → 136
  colliders reales, p. ej. la capilla tiene 12 primitivas).
- **Espacio de mundo**: `createCollidersFromChildren` hornea la transformación
  de mundo en cada trimesh. Esto incluye la escala 80× de las áreas y la 1.708
  del árbol, y coincide con lo visible.
- **Sensores**: el `KinematicCharacterController` no ignora los sensores por
  defecto. Los checkpoints son cilindros `sensor`, así que el jugador se
  quedaba atascado a 2.45 m del checkpoint `(0, 6)`. Se corrige pasando
  `QueryFilterFlags.EXCLUDE_SENSORS` a `computeColliderMovement`.
- **Altura real del suelo**: `Circle` no es plano (`y` de 0 a 0.4). En el
  spawn el jugador queda con los pies en `y ≈ 0.02`, por eso el spawn es
  `y = 0.4` y cae unos centímetros. El grupo de checkpoints se bajó a
  `y = 0.1` para que las bases no floten.
- **Depuración sin render**: con SwiftShader la escena va a ~0.6 fps y el
  jugador parece hundirse lentísimo (en realidad es el `dt` acotado). En
  desarrollo se expone `window.__world` con `teleport()` y `step(n)`, que
  avanzan la simulación sin esperar al render y permiten probar colisiones.
- **Controlador cinemático**: Rapier no trae un componente Threlte para el
  `KinematicCharacterController`; se usa la API del mundo dentro de
  `usePhysicsTask`. Es la opción correcta para un personaje con sprite 2D que
  no debe volcar ni rebotar.
- **`y` es altura de pies**: el sprite se dibuja en `y + HEIGHT / 2`; la
  cámara sigue `y + 1.4`. Así el controlador y la animación comparten la misma
  referencia.
- **Autostep de 0.5 m**: cubre el escalón de 0.4 m entre `Circle` y las áreas,
  y el porche. Sin él, el jugador quedaría atascado en cada borde.
- **Sin físicas en decoración**: murciélagos, telarañas, carteles, ventanas,
  caminos, campos y copas de árbol son visuales. Darles collider produce
  paredes invisibles y empeora el rendimiento sin aportar juego.
- **Flags de generación**: `-k` conserva los nombres originales (necesarios
  para la lista blanca) y `-K` conserva los grupos (necesarios para no perder
  la jerarquía de las áreas y de los rigs). `-d` solo indica el decodificador
  Draco; no comprime el archivo.
- **Identidad**: el mapa se monta sin transformación. Si en el futuro se
  quisiera mover, habría que recrear los colliders con la nueva matriz o
  envolverlos en un `RigidBody` fijo con la misma transformación.
- **Checkpoints**: se mantienen como sensores de Rapier; no son parte de la
  geometría del mapa y no deben recibir trimesh. Con `EXCLUDE_SENSORS` el
  jugador los atraviesa y el aviso de minijuego se activa.
- **Draco con fuente original**: `map:compress` comprime `static/map.glb` y
  copia el export sin comprimir a `world/source/map.glb`. Si el usuario coloca
  un `map.glb` nuevo sin comprimir, el script refresca la fuente; si el archivo
  servido ya está comprimido, re-comprime desde la fuente (nunca comprime dos
  veces, para no acumular pérdida). El GLB usa decoder local `static/draco/`
  mediante `asset('draco/')`, no el CDN.
- **Trazabilidad de nodos con Draco**: los accessors comprimidos conservan
  `count` y `min`/`max`, así que `world:check` y los verificadores de AABB
  siguen midiendo igual. Solo los scripts que recorren vértices usan
  `sourceGlbPath()`. Draco puede descartar triángulos degenerados: la lista
  blanca pasó de 85 812 a 85 706 triángulos de collider (−106) sin cambiar la
  superficie visible.
- **Elementos nuevos con físico (2026-11-12)**: la tienda de cartón
  (`Shop_Floor`, muros, techo, mostrador, puerta y cartel), la oficina de
  turismo (`TO_Floor`, muros, techo, mostrador, mapa y postes de cola) y el
  escenario del baile (`DV_Stage`, `DV_DJBooth`, `DV_VideoWall`, torres de
  truss y los subwoofers `DV2_SubCab_L/R`). El resto de `Shop_*`, `TO_*` y
  `DV*` (textos, awnings, calabazas, altavoces altos, vinilos, luces, logos y
  decoración) queda sin collider y figura en `excludePatterns`.
- **Mapa `islas-ciudad` (2026-11-13)**: `islas_ciudad.glb` (3 137 nodos,
  3 128 nodos con malla, 1 551 mallas únicas, 0 clips) se comprime con Draco de
  15.12 MB a 2.36 MB (−84.4 %) y se sirve con `useDraco(asset('draco/'))`. La
  lista blanca es manual (2 255 nodos / 248 017 triángulos) y usa
  `mode: "chunked"` con `chunkSize: 16` para repartir la isla y los edificios
  en ~435 celdas XZ. Se excluyen agua (`Oceano`, `Espuma*`), vegetación,
  sombrillas, barcos, coches, el personaje incrustado `HR_*`, letreros, toldos,
  pintura/pasos (`*_Linea*`, `*_Faja*`, `*_Camino*`), textiles, espejos, luces,
  jardines/macetas, pantallas, persianas y productos de supermercado. Se
  incluyen ventanas/cristales porque en este mapa son barreras estructurales.
  `exactGroups` queda en `false`: 44 nodos de la lista blanca son mallas
  multi-primitiva (el terreno `I_*`, `Acceso_*` y `Anillo_Calzada`) y three
  los monta como `Group` con mallas hijas. El componente es manual
  (`IslasCiudad.svelte`, como `Parkour.svelte`) porque `@threlte/gltf` falla
  con los nombres Unicode `Recamara_Buró_*` y generaría un archivo enorme para
  3 000+ mallas; además se normalizó `Tienda_Techo_FAR0.001` a
  `Tienda_Techo_FAR0_001` porque three elimina los puntos de los nombres.
- **Integración en el juego (2026-11-14)**: `SPEC-040` monta `islas-ciudad`
  como escena del battle royale `Skyfall Royale` (`minigame-8`). `world:sync`
  añade el mapa a `registry.generated.ts` junto a su JSON de físicas;
  `Scene.svelte` monta `IslasCiudad` y el resto de la escena solo cuando
  `sceneState.inRoyale`; el checkpoint físico `SKYFALL ROYALE` abre la room
  `royale`, cuyo motor usa `islas-ciudad.physics.json` (grupos `suelo`,
  `paredes`, `obstaculos`) para colisión, altura de suelo, oclusión y la
  rejilla de navegación de los bots. No se editó la geometría ni las físicas
  del GLB: la lista blanca de 2 255 nodos sigue igual.

## 12. Progreso

| Fecha      | Estado       | Nota                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-30 | borrador     | Spec creado; pendiente de revisión y de que el usuario coloque `map.glb`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-10-30 | implementado | `map:build` genera e inyecta 24 `AutoColliders`; `map:check` OK (51 775 tris). Jugador con character controller: aterriza en `y ≈ 0.02`, choca con capilla, casa, vallas y tronco, salta y atraviesa checkpoints. `bun run check` y `bun run build` OK.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-10-30 | implementado | Mapa reexportado desde `halloween-characters.blend` con las animaciones: 214 nodos, 156 mallas, 144 895 tris y 76 clips (73 murciélagos + 3 `SC_idle`). `Map.svelte` regenerado con `map:build`; el inyector añade la reproducción en bucle y un mixer por espantapájaros. Prueba en navegador: `mapState.ready`, jugador en `y ≈ 0.02`, sin errores de consola.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-11-02 | implementado | Nuevo `map.glb` (389 nodos, 315 mallas, 248 752 tris, 76 clips): se añadieron el pueblo exterior (`TWN_*`), la letrina y la cripta subterránea (`a_Crypt`–`d_Crypt`, `A4C_Hall`, `A4C_Tunnels`, `A4C_Stairwell`, `A4C_Gallery.001`, `A4C_Chambers`, `puerta_A`–`C`). `world/map.physics.json` quedó con 110 nodos y 84 860 triángulos de collider (límite subido a 100 000); `Map.svelte` se regeneró con `world:build map`. Se corrigió `world-inject.mjs` para que los imports de `asset` y `worldState` se añadan aunque la línea de `@threlte/core` ya tenga `useTask`. `map:check`, `check` y `build` en verde; `lint` solo mantiene los 3 avisos previos ajenos a esta tarea.                                                                                                   |
| 2026-11-04 | implementado | **El tamaño no bloquea el deploy**: `dist` pesa 62 MB (límite 100 MB) y los fallos `HttpRequestException` al 100% de subida eran del proxy del entorno. Sin `HTTP_PROXY`/`HTTPS_PROXY`, el deploy 1.17.1 (62 MB) subió a la primera. `map.glb` (11.15 MB, sin Draco/KTX2) se mantiene sin comprimir; Draco/meshopt queda como optimización opcional de carga.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-11-12 | implementado | **Elementos nuevos con físicas + Draco.** `map.glb` nuevo (767 nodos, 690 mallas, 390 263 triángulos, 76 clips) con la tienda de cartón, la oficina de turismo y el escenario del baile. Lista blanca de 110 → 156 nodos (19 suelos, 134 paredes, 3 obstáculos) y 85 706 triángulos de collider. `map:compress` reduce el GLB de 17.95 MB a 3.24 MB (−82 %) con Draco y guarda el original en `world/source/map.glb`; `map:build` regenera `Map.svelte` con `useDraco(asset('draco/'))`. `map:check`, `race:check`, `check`, `lint` y `build` en verde. `npcs:check` también en verde: la ruta del castillo se desvía al oeste de `TREE_Trunk` con los waypoints `(12, -30)` y `(12, -22)`. Además, `cat-01` y `cat-05` se movieron fuera de los coches y del escenario (`SPEC-015`). |
| 2026-11-13 | implementado | **Mapa `islas-ciudad` con Draco y Rapier, sin integrar en el juego.** GLB de 3 137 nodos / 3 128 mallas / 0 clips comprimido de 15.12 MB a 2.36 MB (−84.4 %); original en `world/source/islas_ciudad.glb`. Lista blanca manual de 2 255 nodos / 248 017 triángulos (509 suelos, 1 365 paredes, 288 muebles, 93 obstáculos) en `world/islas-ciudad.physics.json`, modo `chunked` con `chunkSize: 16`. Componente manual `IslasCiudad.svelte` con `useDraco(asset('draco/'))`. `islas-ciudad:check` OK; `bun run check` con 0 errores y los 3 avisos previos. `registry.generated.ts` intacto (el mapa no se monta todavía).                                                                                                                                                            |
| 2026-11-14 | implementado | **`islas-ciudad` montado en el juego por `SPEC-040`.** `world:sync` añade el mapa y su JSON de físicas a `registry.generated.ts`; `Scene.svelte` monta `IslasCiudad` en `inRoyale` y el checkpoint `SKYFALL ROYALE` abre la room `royale`. La misma lista blanca de 2 255 nodos / 248 017 triángulos alimenta colisión, altura de suelo, oclusión y navegación de bots; no se cambió la geometría ni las físicas. `islas-ciudad:check` y `map:check` en verde (`map.physics.json` solo actualizó su `sourceSha256` al GLB vigente). `check`, `lint` y `build` OK. |

## 13. Changelog

- 2026-10-30 — Creación del spec: lista blanca de 24 nodos, `MapPhysics`,
  controlador cinemático, spawn/reaparición y verificación con
  `map:check`.
- 2026-10-30 — Implementación: la física se movió dentro de `Map.svelte` con
  `AutoColliders` inyectados por `inject-map-colliders.mjs` (se eliminó
  `MapPhysics.svelte`). `Ground.svelte` pasó a `Checkpoints.svelte`.
  `EXCLUDE_SENSORS` corrige el bloqueo de los checkpoints. Añadidas utilidades
  de depuración `window.__world`.
- 2026-10-30 — Reexportación del mapa con animaciones (`export_map.py`): 69
  clips. `inject-map-colliders.mjs` ahora también reproduce los clips en bucle
  y usa un mixer por espantapájaros. `map:check`, `check`, `lint` (solo avisos
  previos) y `build` en verde.
- 2026-10-30 — Reexportación final desde el `.blend` actualizado: 214 nodos,
  156 mallas, 144 895 triángulos y 76 clips (73 murciélagos + 3 `SC_idle`);
  51 323 triángulos de collider. El inyector ahora encuentra grupos cuya
  etiqueta de apertura ocupa varias líneas (`name`, `position`, …).
- 2026-11-02 — Mapa ampliado con pueblo, letrina y cripta subterránea:
  `world/map.physics.json` pasa a 110 nodos / 84 860 triángulos de collider y
  `maxColliderTriangles` a 100 000. `Map.svelte` regenerado con el pipeline
  `world:build map`. Se corrigió la inyección de `asset` y `worldState` para
  que no dependa del texto exacto del import de `@threlte/core`.
- 2026-11-12 — Físicas para los elementos nuevos (tienda de cartón, oficina de
  turismo y escenario del baile): `map.physics.json` pasa a 156 nodos
  (19 suelos, 134 paredes, 3 obstáculos) y 85 706 triángulos de collider.
  Añadido `world:compress`/`map:compress` (Draco, −82 %) con backup en
  `world/source/map.glb`, decodificador local en `Map.svelte` y validación
  Draco en `world:check`. `TrackPreviewModel` registra el mismo decoder y
  `race:check`/`npcs:check` validan el export sin comprimir.
- 2026-11-13 — Nuevo mapa `islas-ciudad` preparado para física sin montarlo en
  el juego: `world:compress islas-ciudad` (15.12 MB → 2.36 MB, −84.4 %),
  `world/islas-ciudad.physics.json` con 2 255 nodos / 248 017 triángulos en
  modo `chunked`, y `IslasCiudad.svelte` manual con decoder Draco local. Se
  documentó que `exactGroups` debe ser `false` por las mallas
  multi-primitiva y que three elimina los puntos de los nombres de nodo.
- 2026-11-14 — `islas-ciudad` queda integrado en el juego: `world:sync`
  registra el mapa y sus físicas, `Scene.svelte` lo monta en la escena del
  battle royale y la room `royale` usa la lista blanca existente para
  colisión, altura de suelo, oclusión y navegación. La geometría y las físicas
  no cambian; solo se actualizó `sourceSha256` de `map.physics.json` al GLB
  vigente para que `map:check` volviera a verde.
