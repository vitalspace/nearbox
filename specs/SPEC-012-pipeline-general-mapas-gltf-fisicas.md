---
id: SPEC-012
titulo: "Pipeline general de mapas GLB: generación, física selectiva y registro de escenas"
estado: borrador
prioridad: alta
creado: 2026-11-01
actualizado: 2026-11-01
responsable: opencode
etiquetas: [threlte, rapier, gltf, pipeline, mapas, colisiones, world, scripts, svelte]
depende_de: [SPEC-009, SPEC-011]
bloquea: []
estimacion: "18h"
---

# SPEC-012 — Pipeline general de mapas GLB: generación, física selectiva y registro de escenas

## 1. Contexto

Hoy cada mapa se integra a mano y con scripts duplicados:

| Mapa | GLB | Componente | Config de física | Scripts |
| ---- | --- | ---------- | ---------------- | ------- |
| Mundo exterior | `frontend/static/map.glb` | `src/lib/components/world/Map.svelte` | `map-colliders.json` | `build-map.sh`, `inject-map-colliders.mjs`, `verify-map-colliders.mjs` |
| Cripta | `frontend/static/game2.glb` | `src/lib/components/world/Crypt.svelte` | `crypt-colliders.json` | `build-crypt.sh`, `inject-crypt-colliders.mjs`, `verify-crypt-colliders.mjs` |

`SPEC-009` y `SPEC-011` resolvieron bien un mapa cada uno, pero el flujo no
escala: agregar un tercer `.glb` obliga a copiar scripts, escribir otra lista
blanca a mano, tocar `Scene.svelte`, `PlayerCollider.svelte` y el estado de
física, y volver a decidir qué mallas colisionan. El usuario colocará mapas
nuevos en `frontend/static` y espera que el pipeline los genere, mueva el
componente a `src/lib/components/world` y los use desde `Scene.svelte` sin
duplicar código.

El estado actual tiene cuatro problemas concretos:

1. **Duplicación**: `inject-*-colliders.mjs` y `verify-*-colliders.mjs` son casi
   el mismo programa dos veces. Cualquier mejora hay que aplicarla dos veces.
2. **Selección manual**: `map-colliders.json` y `crypt-colliders.json` enumeran
   a mano los nodos con física. Un mapa nuevo no tiene lista blanca y no hay
   forma de proponerla.
3. **Registro rígido**: `Scene.svelte` importa `Map` y `Crypt` directamente;
   `sceneState` solo conoce `global` y `crypt`; `PlayerCollider` mezcla
   `mapState`, `cryptState` y spawns hardcodeados.
4. **Mapas fragmentados**: un GLB como `static/Whi_Interior.glb` tiene 2 509
   nodos y 2 509 mallas, casi todas raíces sueltas. Envolver cada malla en
   `<AutoColliders>` crearía 2 509 colliders aunque solo una fracción sea
   suelo, pared o mueble. El pipeline general no puede asumir que todos los
   mapas vienen agrupados como `map.glb`.

La física selectiva sigue siendo obligatoria: dar collider a murciélagos,
telarañas, carteles, calabazas, velas, llamas, ventanas o cuadros produce
paredes invisibles, atascos y coste de CPU/memoria sin aportar juego. La regla
general es: **solo colisionan suelos, paredes, escaleras, edificios, muebles
grandes y obstáculos sólidos; la decoración y todo lo animado queda fuera**.

Además, un mapa puede necesitar una transformación de escena (posición,
rotación o escala) respecto al origen. Debe declararse una sola vez y aplicarse
de forma que la malla visible y los colliders compartan exactamente la misma
matriz. Hoy los mapas se montan en la identidad, pero el pipeline general no
debe depender de eso.

## 2. Objetivo

Sustituir los dos circuitos específicos por un pipeline único y reejecutable
que, dado cualquier `.glb` de `frontend/static`, genere su componente en
`frontend/src/lib/components/world`, proponga y valide una lista blanca de
colisionadores estáticos (suelos, paredes, escaleras, edificios, muebles y
obstáculos), excluya decoración y geometría animada, lo registre en un catálogo
tipado y permita montarlo desde `Scene.svelte` por identificador, conservando
el comportamiento actual de `map.glb` y `game2.glb`.

## 3. Alcance

**Incluye**

- Registro central `frontend/world/maps.json` con todos los mapas, su GLB,
  componente, configuración de física, spawn, transformación e iluminación.
- Comando `world:import` para validar, copiar si hace falta y registrar un GLB.
- Comando `world:scan` que analiza el GLB y genera una propuesta determinista
  de nodos con física, con métricas y motivos por nodo.
- Reglas de clasificación automática por nombre, jerarquía, animación, skin,
  material y geometría (AABB y triángulos).
- Modo `inject` (envolver nodos existentes con `AutoColliders`), modo
  `merged` (agrupar muchos nodos sueltos en pocos colliders fusionados creados
  una sola vez al cargar) y modo `chunked` (partir la geometría en celdas XZ
  para que el character controller no recorra mallas gigantes).
- Inyección idempotente de colliders y animaciones en el componente generado.
- Verificador `world:check` para todos los mapas: nombres, solapamientos,
  presupuesto de triángulos/colliders, hash del GLB y coherencia del componente.
- Generación de `src/lib/world/registry.generated.ts` a partir de `maps.json`.
- Estado de física unificado (`worldState`) para el mapa activo.
- `Scene.svelte` montando el mapa activo desde el registro, con selector de
  desarrollo `?map=<id>`.
- Migración de `map.glb` y `game2.glb` al pipeline sin cambiar su jugabilidad.
- Piloto con un mapa fragmentado real (`Whi_Interior.glb`) para validar el
  modo `merged`.
- Documentación del flujo para agregar un mapa nuevo.

**No incluye**

- Modelar, limpiar o reagrupar geometría en Blender. Si un mapa necesita
  grupos lógicos, se documenta como tarea de assets aparte; el modo `merged`
  debe cubrir el caso sin exigirlo.
- Física dinámica (cajas que caen, ragdolls, vehículos) o navmesh/IA.
- Cambiar el diseño de `map.glb`, `game2.glb` o los minijuegos.
- Multijugador, checkpoints, combate o nuevas mecánicas.
- Convertir automáticamente cualquier decoración en obstáculo. La decoración
  sigue sin físicas.
- Comprimir GLB con `--transform` por defecto. El pipeline puede aceptar la
  opción, pero no la activa sin decisión explícita.
- Exponer todos los mapas en el lobby o backend. El registro permite montarlos
  por id; la selección de partida sigue dependiendo de `sceneState`.

## 4. Requisitos

### Funcionales

| ID | Requisito | Prioridad |
| -- | --------- | --------- |
| RF-1 | `frontend/world/maps.json` es la única fuente de verdad de mapas. Cada entrada declara `id`, `glb`, `component`, `physics`, `spawn`, `transform`, `lighting` y `scene`. | alta |
| RF-2 | `bun run world:import -- <ruta.glb> [--id <id>]` valida la firma GLB, deriva un `id` kebab-case y un componente PascalCase, copia el archivo a `frontend/static/<id>.glb` si viene de fuera y lo registra sin duplicar entradas. | alta |
| RF-3 | La generación usa `@threlte/gltf` fijado en `devDependencies`, con `-K -k` obligatorios, `-d` solo si el GLB usa `KHR_draco_mesh_compression` y `--output` directo a `src/lib/components/world/<Component>.svelte`. | alta |
| RF-4 | `bun run world:scan -- <id>` lee el GLB, calcula AABB en espacio de mundo, triángulos y relaciones padre/hijo, y escribe/actualiza `frontend/world/<id>.physics.json` de forma determinista (mismo GLB ⇒ mismo JSON). | alta |
| RF-5 | La clasificación produce cuatro grupos: `suelo`, `paredes`, `muebles` y `obstaculos`. Solo estos cuatro grupos pueden recibir collider. | alta |
| RF-6 | La clasificación excluye siempre nodos animados, con skin, con materiales transparentes o emisivos puros, con `alphaMode` `BLEND`/`MASK`, con nombres de decoración y con tamaño ínfimo. La exclusión gana sobre cualquier inclusión automática. | alta |
| RF-7 | La lista blanca aprobada del JSON manda sobre la heurística. Los candidatos dudosos se escriben en `review` y no reciben collider hasta que el usuario los mueva a un grupo o los marque con `forceInclude`. | alta |
| RF-8 | Cada nodo puede declarar `shape`: `trimesh`, `convexHull` o `cuboid`. Por defecto: `trimesh` para suelos, paredes, escaleras y edificios; `convexHull` para muebles; `cuboid` para cajas simples declaradas. | alta |
| RF-9 | Todos los colliders del mapa son estáticos (sin `RigidBody`), con `friction` y `restitution` tomados de `maps.json` (0.9 y 0 por defecto) y sin `sensor`. | alta |
| RF-10 | Presupuesto por mapa: `maxColliderTriangles` (60 000 por defecto; la cripta conserva 25 000) y `maxColliders` (256 por defecto). `world:check` falla si se supera cualquiera. | alta |
| RF-11 | Modo `inject`: los nodos de la lista blanca que ya forman grupos lógicos se envuelven en `<AutoColliders shape="trimesh|convexHull|cuboid" friction={...} restitution={...}>` dentro del componente generado. | alta |
| RF-12 | Modo `merged`: si un mapa tiene más de `maxColliderNodes` (64 por defecto) mallas seleccionadas o nodos raíz sueltos, el pipeline agrupa por prefijo lógico y crea un collider fusionado por clúster (`trimesh`, `convexHull` o `cuboid`) una sola vez al cargar, no uno por malla. | alta |
| RF-13 | El modo se elige con `collision.mode`: `auto` (por defecto), `inject`, `merged`, `chunked` o `none`. `auto` usa `inject` si el mapa está agrupado y `merged` si está fragmentado. | alta |
| RF-14 | El componente generado incluye un marcador de `worldState` que pone `ready` del mapa activo cuando los colliders existen. En `inject` lo dispara el `readyNode`; en `merged` y `chunked`, el componente de colliders al terminar. | alta |
| RF-15 | Las animaciones del GLB se reproducen en bucle por defecto (`animations.mode: "auto"`); el JSON puede declarar `none` o mixers por rig. Regenerar el componente no pierde las animaciones. | alta |
| RF-16 | Una transformación de mapa (`transform.position`, `rotation`, `scale`) se aplica una sola vez en `WorldMap.svelte`; el componente visual y sus colliders quedan dentro de esa transformación, sin duplicarla ni aplicarla en el jugador. | alta |
| RF-17 | `bun run world:build -- <id|--all>` ejecuta generación, inyección, Prettier, hash del GLB y sincronización del registro. Es idempotente y no requiere editar el componente a mano. | alta |
| RF-18 | `bun run world:check -- <id|--all>` valida: entrada del registro, GLB y hash, componente existente, nodos de la lista blanca con geometría, solapamiento con exclusiones, presupuesto, número de `AutoColliders`/clústeres y hook de `ready`. | alta |
| RF-19 | `bun run world:sync` genera `src/lib/world/registry.generated.ts` con imports estáticos de cada componente y un tipo `WorldMapId`; el archivo generado no se edita a mano. | alta |
| RF-20 | `Scene.svelte` monta el mapa activo desde el registro; no importa `Map`, `Crypt` ni componentes de mapas nuevos directamente. La lógica específica de la cripta sigue condicionada por `sceneState.inCrypt`. | alta |
| RF-21 | En desarrollo, `?map=<id>` permite montar cualquier mapa registrado. En producción el parámetro se ignora y la escena sale de `sceneState`. | media |
| RF-22 | `worldState.svelte.ts` sustituye a `mapState`/`cryptState`: guarda `ready` por mapa, estadísticas y spawn activo; el jugador consulta el mapa activo, no dos estados hardcodeados. | alta |
| RF-23 | Al desmontar un mapa se eliminan sus colliders y se pone su `ready` a `false`; al montarlo de nuevo se recrean una sola vez. No quedan colliders huérfanos entre escenas. | alta |
| RF-24 | `PlayerCollider.svelte` usa `worldState.isReady(sceneState.active)` y el spawn del registro. Los spawns de entrada/salida de la cripta se conservan como excepciones documentadas hasta que el registro soporte entradas por escena. | alta |
| RF-25 | `?physics=1` muestra únicamente los colliders del mapa activo. Al cambiar de mapa, el debug no muestra colliders del mapa anterior. | media |
| RF-26 | Los comandos antiguos `map:build`, `map:check`, `crypt:build` y `crypt:check` siguen funcionando como alias del pipeline general. | alta |
| RF-27 | `map.glb` y `game2.glb` conservan su comportamiento: 24 nodos/51 323 triángulos en el mundo exterior y 16 nodos/21 031 triángulos en la cripta, sin colliders nuevos en decoración. | alta |
| RF-28 | Un mapa sin lista blanca aprobada se puede generar como visual (`physics: false`) pero no se registra como jugable hasta que tenga `readyNode` y al menos un suelo. `world:build` falla con un mensaje claro si intenta publicarlo sin física. | alta |
| RF-29 | `Whi_Interior.glb` se usa como piloto del modo `merged`: el escaneo debe agrupar sus 2 509 mallas en clústeres lógicos, no crear 2 509 colliders, y excluir velas, llamas, cuadros, ventanas, libros y demás decoración. | media |
| RF-30 | `frontend/world/README.md` documenta el flujo completo para agregar un mapa nuevo con un ejemplo copiable. | media |

### No funcionales

| ID | Requisito | Criterio |
| -- | --------- | -------- |
| RNF-1 | Determinismo | Ejecutar `world:scan` dos veces sobre el mismo GLB produce JSON idéntico byte a byte. |
| RNF-2 | Coste de física | ≤ 60 000 triángulos y ≤ 256 colliders por mapa; la creación de colliders tarda < 500 ms en un portátil de gama media. |
| RNF-3 | Sin trabajo por frame | Los colliders se crean una vez; no se recorre la escena ni se fusiona geometría en `usePhysicsTask`. |
| RNF-4 | Carga de red | Cada GLB se descarga una sola vez; el registro no duplica imports ni cargas. |
| RNF-5 | Alineación | La matriz de `WorldMap` se aplica a visual y física; error visual/física ≤ 0.05 m. |
| RNF-6 | Idempotencia | `world:build` dos veces seguidas no duplica `AutoColliders`, animaciones, mixers ni entradas del registro. |
| RNF-7 | Tipado y estilo | `bun run check` y `bun run lint` pasan sin errores nuevos. |
| RNF-8 | SSR seguro | Nada de `window`, `location` o Rapier fuera de `<Canvas>`/`$effect`; `?map=` se lee solo en navegador y solo en desarrollo. |
| RNF-9 | Compatibilidad | Los alias antiguos y las rutas actuales de configuración siguen funcionando durante la migración. |
| RNF-10 | Mantenibilidad | No hay nombres de mapas hardcodeados en `Scene.svelte` ni en `PlayerCollider`; los casos especiales viven en `maps.json` o en la config del mapa. |
| RNF-11 | Reversibilidad | Si un mapa falla el escaneo, el pipeline no borra su configuración anterior ni su componente. |
| RNF-12 | Reproducibilidad | La versión de `@threlte/gltf` está fijada y el hash del GLB se guarda en la config. |

## 5. Criterios de aceptación

- [ ] CA-1: Existen `frontend/world/maps.json`, `frontend/world/map.physics.json` y `frontend/world/crypt.physics.json`; las configuraciones actuales se migraron sin perder nodos.
- [ ] CA-2: `bun run world:import -- frontend/static/Whi_Interior.glb --id whi-interior` crea la entrada en `maps.json`, copia/valida el GLB y genera `whi-interior.physics.json`.
- [ ] CA-3: `bun run world:scan -- whi-interior` detecta al menos un suelo, paredes y muebles; deja velas, llamas, cuadros, ventanas, libros y telas en `review` o `exclude`, nunca en los grupos con collider.
- [ ] CA-4: El modo `auto` elige `merged` para `whi-interior` porque tiene más de 64 mallas seleccionadas; el número de colliders generados es mucho menor que 2 509 y no supera `maxColliders`.
- [ ] CA-5: `bun run world:build -- whi-interior` genera `src/lib/components/world/WhiInterior.svelte`, inyecta los colliders fusionados y actualiza `registry.generated.ts`.
- [ ] CA-6: `bun run world:scan -- map` propone los 24 nodos actuales (o un superconjunto aprobado) y cero decoración; la config aprobada sigue dando 24 nodos y 51 323 triángulos.
- [ ] CA-7: `bun run world:scan -- crypt` conserva los 16 nodos y 21 031 triángulos de la cripta.
- [ ] CA-8: `bun run world:check -- --all` valida todos los mapas y termina con código 0; con un nombre inexistente o un presupuesto superado termina con código 1 y un mensaje accionable.
- [ ] CA-9: `bun run map:build`, `map:check`, `crypt:build` y `crypt:check` siguen funcionando y producen los mismos recuentos.
- [ ] CA-10: `Scene.svelte` no contiene imports directos de `Map.svelte` ni `Crypt.svelte`; monta el componente desde `worldMaps[sceneState.active]`.
- [ ] CA-11: Con `?map=whi-interior` en desarrollo se ve el mapa nuevo y el jugador aparece en el spawn declarado; en producción el parámetro no cambia la escena.
- [ ] CA-12: Con `?physics=1` se ven solo los colliders del mapa activo; al cambiar de `map` a `crypt` desaparecen los del mundo exterior.
- [ ] CA-13: En `map` el jugador camina sobre `Circle`, choca con vallas, casa, capilla y tronco, sube el escalón de 0.4 m, salta, atraviesa checkpoints y reaparece al caer.
- [ ] CA-14: En `crypt` el jugador camina sobre `A4C_Hall`, choca con criptas, props e hierro y puede entrar/salir del mausoleo como hoy.
- [ ] CA-15: En `whi-interior` el jugador no atraviesa suelos, paredes ni muebles grandes; puede atravesar velas, llamas, cuadros y libros.
- [ ] CA-16: Las 73 animaciones de murciélagos y las 3 `SC_idle` siguen reproduciéndose tras `world:build`; la cripta sigue sin animaciones.
- [ ] CA-17: Regenerar dos veces el mismo mapa no duplica `AutoColliders`, colliders fusionados, `AnimationMixer` ni entradas del registro.
- [ ] CA-18: Desmontar y volver a montar un mapa no deja colliders huérfanos y vuelve a marcar `ready`.
- [ ] CA-19: `bun run check`, `bun run lint` y `bun run build` pasan sin errores nuevos.
- [ ] CA-20: `frontend/world/README.md` permite a otra persona agregar un mapa con tres comandos sin leer el código de los scripts.

## 6. Archivos relevantes

| Ruta | Acción | Motivo |
| ---- | ------ | ------ |
| `frontend/world/maps.json` | crear | Registro central de mapas, spawn, transformación, iluminación y versión del pipeline. |
| `frontend/world/<id>.physics.json` | crear | Lista blanca aprobada, exclusiones, formas, presupuesto, modo y candidatos `review` de cada mapa. |
| `frontend/world/map.physics.json` | crear | Migración de `map-colliders.json` con los 24 nodos actuales. |
| `frontend/world/crypt.physics.json` | crear | Migración de `crypt-colliders.json` con los 16 nodos actuales. |
| `frontend/world/whi-interior.physics.json` | crear (generado) | Piloto del clasificador y del modo `merged`. |
| `frontend/scripts/world-lib.mjs` | crear | Parser GLB, lector de accessors, matrices, AABB, triángulos, clasificación, JSON determinista y utilidades compartidas. |
| `frontend/scripts/world-import.mjs` | crear | Validación, copia, id/componente y alta en `maps.json`. |
| `frontend/scripts/world-scan.mjs` | crear | Generación de `<id>.physics.json` y lista `review`. |
| `frontend/scripts/world-build.mjs` | crear | Orquesta `@threlte/gltf`, inyección, Prettier, hash y `world:sync`. |
| `frontend/scripts/world-inject.mjs` | crear | Inyección idempotente de `AutoColliders`, `WorldColliders`, animaciones y hook de `ready`. |
| `frontend/scripts/world-verify.mjs` | crear | Verificador único para todos los mapas. |
| `frontend/scripts/world-sync.mjs` | crear | Genera el registro TypeScript desde `maps.json`. |
| `frontend/scripts/build-map.sh` | modificar | Pasar a wrapper de `world-build.mjs map`. |
| `frontend/scripts/build-crypt.sh` | modificar | Pasar a wrapper de `world-build.mjs crypt`. |
| `frontend/scripts/inject-map-colliders.mjs` | eliminar | Reemplazado por `world-inject.mjs`; verificar paridad antes de borrar. |
| `frontend/scripts/inject-crypt-colliders.mjs` | eliminar | Reemplazado por `world-inject.mjs`. |
| `frontend/scripts/verify-map-colliders.mjs` | eliminar | Reemplazado por `world-verify.mjs`. |
| `frontend/scripts/verify-crypt-colliders.mjs` | eliminar | Reemplazado por `world-verify.mjs`. |
| `frontend/src/lib/world/registry.generated.ts` | crear (generado) | Imports estáticos, `WorldMapId` y metadatos de cada mapa. |
| `frontend/src/lib/world/types.ts` | crear | Tipos de entrada del registro, transformación, spawn y modo de colisión. |
| `frontend/src/lib/components/world/WorldMap.svelte` | crear | Aplica transformación, monta el componente activo e ilumina según el registro. |
| `frontend/src/lib/components/world/WorldColliders.svelte` | crear | Crea colliders fusionados para el modo `merged` una sola vez y marca `ready`. |
| `frontend/src/lib/components/world/ChunkedColliders.svelte` | crear | Crea trimeshes por celda XZ para el modo `chunked` y marca `ready`. |
| `frontend/src/lib/components/world/Map.svelte` | regenerar | Componente de `map.glb` generado por el pipeline; no editar a mano. |
| `frontend/src/lib/components/world/Crypt.svelte` | regenerar | Componente de `game2.glb` generado por el pipeline; no editar a mano. |
| `frontend/src/lib/components/world/WhiInterior.svelte` | crear (generado) | Componente piloto del mapa fragmentado. |
| `frontend/src/lib/components/world/map-colliders.json` | eliminar | Migrado a `frontend/world/map.physics.json`. |
| `frontend/src/lib/components/world/crypt-colliders.json` | eliminar | Migrado a `frontend/world/crypt.physics.json`. |
| `frontend/src/lib/state/worldState.svelte.ts` | crear | Estado unificado de `ready`, estadísticas y spawn por mapa. |
| `frontend/src/lib/state/mapState.svelte.ts` | eliminar | Reemplazado por `worldState`. |
| `frontend/src/lib/state/cryptState.svelte.ts` | eliminar | Reemplazado por `worldState`. |
| `frontend/src/lib/state/sceneState.svelte.ts` | modificar | Tipo de escena basado en `WorldMapId`; override de desarrollo `?map=`. |
| `frontend/src/lib/Scene.svelte` | modificar | Montar `WorldMap` desde el registro; conservar capas de `crypt`. |
| `frontend/src/lib/components/player/PlayerCollider.svelte` | modificar | Leer `worldState` y el spawn del mapa activo; eliminar `mapState`/`cryptState`. |
| `frontend/src/lib/components/player/Player.svelte` | revisar | Confirmar que no hay dependencias directas de los estados eliminados. |
| `frontend/src/lib/components/world/Lighting.svelte` | revisar | Usarse desde `WorldMap` según `lighting` del registro. |
| `frontend/src/lib/components/world/CryptLighting.svelte` | revisar | Usarse desde `WorldMap` según `lighting` del registro. |
| `frontend/package.json` | modificar | Añadir `world:import`, `world:scan`, `world:build`, `world:check`, `world:sync`; conservar alias. |
| `frontend/world/README.md` | crear | Guía de tres comandos y esquema de configuración. |
| `specs/SPEC-012-pipeline-general-mapas-gltf-fisicas.md` | crear | Este spec. |

## 7. Plan de implementación

### Fase 0 — Línea base y decisiones

- [ ] Paso 1: Ejecutar `bun run map:check` y `bun run crypt:check`; guardar nodos,
  mallas, triángulos y recuentos actuales en §12.
- [ ] Paso 2: Confirmar en `@threlte/gltf --help` las opciones `-K`, `-k`, `-d`,
  `-o` y `-T`; fijar la versión que se va a usar en `devDependencies`.
- [ ] Paso 3: Decidir la ubicación de `frontend/world/` y confirmar que Vite
  puede importar el JSON y el registro generado sin rutas fuera de `src`.
- [ ] Paso 4: Documentar en §10 las dudas de clasificación y responderlas antes
  de implementar el escaneo.

### Fase 1 — Biblioteca GLB y clasificador

- [ ] Paso 1: Crear `world-lib.mjs` con lectura del chunk JSON y BIN, validación
  de firma, accessors, materiales, skins y animaciones.
- [ ] Paso 2: Implementar matrices de nodo (TRS o `matrix`), multiplicación
  padre-hijo y AABB de mundo a partir de `accessors[].min/max`; calcular
  triángulos por primitiva.
- [ ] Paso 3: Implementar normalización de nombres, patrones glob, vocabulario
  de categorías y reglas geométricas de §11.
- [ ] Paso 4: Implementar exclusiones duras: animado, skin, transparencia,
  `alphaMode`, nombres de decoración, tamaño mínimo y volúmenes de trigger.
- [ ] Paso 5: Implementar confianza y salida determinista: grupos ordenados,
  `review` ordenado, sin timestamps ni rutas absolutas.
- [ ] Paso 6: Añadir pruebas unitarias mínimas con `node --test` o un script
  `world:test` para patrones, AABB y presupuesto.

### Fase 2 — Importación y escaneo

- [ ] Paso 1: Crear `world-import.mjs`: validar GLB, derivar id/componente,
  copiar si está fuera de `static`, detectar Draco y añadir la entrada a
  `maps.json` sin duplicar.
- [ ] Paso 2: Crear `world-scan.mjs`: por defecto escribe `<id>.physics.json`;
  con `--dry-run` solo imprime el resumen; con `--force` regenera aunque exista
  configuración aprobada (haciendo copia `.bak`).
- [ ] Paso 3: Conservar la lista blanca existente si el mapa ya tiene grupos
  aprobados; añadir candidatos nuevos solo a `review`.
- [ ] Paso 4: Elegir `readyNode`: primer suelo por área; si no hay suelo, el
  nodo horizontal más grande; si tampoco, error accionable.
- [ ] Paso 5: Sugerir `spawn` en el centro del suelo principal, a `topY + 0.4`,
  sin sobrescribir un spawn aprobado salvo `--reset-spawn`.
- [ ] Paso 6: Ejecutar `world:scan` sobre `map`, `crypt` y `whi-interior` y
  revisar los resúmenes.

### Fase 3 — Generación, inyección y modos de colisión

- [ ] Paso 1: Crear `world-build.mjs`: resolver id/GLB/componente, lanzar
  `@threlte/gltf` con `--output` y los flags de RF-3, y registrar el hash
  SHA-256 del GLB en la config.
- [ ] Paso 2: Crear `world-inject.mjs` con búsqueda de bloques por nombre
  (multilínea y nombres sin puntos), inyección idempotente y detección de
  `AutoColliders`/`WorldColliders` ya presentes.
- [ ] Paso 3: Implementar modo `inject`: envolver grupos o mallas con
  `<AutoColliders>` y añadir `oncreate` de `worldState.markReady(id)` en
  `readyNode`.
- [ ] Paso 4: Implementar modo `merged`: inyectar
  `<WorldColliders mapId="<id>" root={ref} />` después de la escena y antes de
  cerrar el grupo raíz.
- [ ] Paso 5: Crear `WorldColliders.svelte`: recorrer `root`, localizar los
  nombres de cada clúster, fusionar geometrías con `applyMatrix4(matrixWorld)`,
  crear `ColliderDesc.trimesh`/`convexHull`/`cuboid` estáticos con
  `world.createCollider`, y liberar en `onDestroy`.
- [ ] Paso 6: Marcar `ready` solo cuando todos los clústeres estén creados;
  registrar en consola `[world:<id>] física lista` en desarrollo.
- [ ] Paso 7: Inyectar animaciones según `animations`: `auto` reproduce todos
  los clips en bucle; `custom` usa los mixers declarados; `none` no toca nada.
- [ ] Paso 8: Pasar Prettier al componente generado y ejecutar `world:sync`.
- [ ] Paso 9: Verificar idempotencia ejecutando `world:build` dos veces.

### Fase 4 — Verificador y registro

- [ ] Paso 1: Crear `world-verify.mjs` con comprobaciones de RF-18 y salida
  resumida por mapa.
- [ ] Paso 2: Comparar el hash del GLB con `sourceSha256`; fallar si el GLB
  cambió sin `world:build`.
- [ ] Paso 3: Comprobar que cada nodo de los grupos existe, tiene triángulos y
  no coincide con `excludePatterns`; que `review` no se usa para colliders.
- [ ] Paso 4: Comprobar presupuesto de triángulos y `maxColliders`; en modo
  `merged`, contar clústeres, no mallas.
- [ ] Paso 5: Comprobar que el componente tiene el número esperado de
  `AutoColliders` o el `WorldColliders` inyectado y el hook de `ready`.
- [ ] Paso 6: Crear `world-sync.mjs`: leer `maps.json`, ordenar por id, emitir
  imports estáticos y `registry.generated.ts` con cabecera "no editar".
- [ ] Paso 7: Ejecutar `world:check -- --all` y corregir hasta que pase.

### Fase 5 — Estado y escena

- [ ] Paso 1: Crear `worldState.svelte.ts` con `ready` por `WorldMapId`,
  `markReady`, `reset`, `isReady`, estadísticas y spawn activo.
- [ ] Paso 2: Migrar `Map.svelte`, `Crypt.svelte`, `PlayerCollider.svelte` y las
  pantallas que usen `mapState`/`cryptState`; borrar los dos estados viejos.
- [ ] Paso 3: Extender `sceneState` para usar `WorldMapId` y aceptar
  `?map=<id>` solo en desarrollo y navegador.
- [ ] Paso 4: Crear `WorldMap.svelte`: resolver entrada, aplicar `transform` en
  un `<T.Group>`, montar componente y luz según `lighting`.
- [ ] Paso 5: Sustituir en `Scene.svelte` los imports directos por
  `<WorldMap map={...} />`; conservar las capas de `crypt` bajo
  `sceneState.inCrypt`.
- [ ] Paso 6: Mover `Debug` de Rapier si hace falta para que solo se active con
  el mapa presente y `?physics=1`.
- [ ] Paso 7: Verificar que cambiar de mapa resetea `ready`, recrea colliders y
  no deja cuerpos huérfanos.

### Fase 6 — Migración de los mapas existentes

- [ ] Paso 1: Migrar `map-colliders.json` a `map.physics.json` sin cambiar
  nombres ni grupos; fijar `collision.mode: "inject"`.
- [ ] Paso 2: Migrar `crypt-colliders.json` a `crypt.physics.json`; fijar
  `maxColliderTriangles: 25000` y `readyNode: "A4C_Hall"`.
- [ ] Paso 3: Regenerar `Map.svelte` y `Crypt.svelte` con el pipeline nuevo.
- [ ] Paso 4: Ejecutar los alias `map:build`, `map:check`, `crypt:build` y
  `crypt:check`; comparar recuentos con la línea base.
- [ ] Paso 5: Probar en navegador los casos de §8 para mundo exterior y cripta.
- [ ] Paso 6: Borrar los scripts y JSON duplicados solo después de que los
  alias y la paridad estén verificados.

### Fase 7 — Piloto de mapa fragmentado

- [ ] Paso 1: Importar `Whi_Interior.glb` como `whi-interior`.
- [ ] Paso 2: Ejecutar `world:scan` y revisar que el modo `auto` elija `merged`.
- [ ] Paso 3: Ajustar el vocabulario/umbrales si algún suelo, pared o mueble
  grande queda en `review`, o si velas/libros/cuadros entran en un grupo.
- [ ] Paso 4: Ejecutar `world:build`; comprobar que no se generan 2 509
  colliders y que el presupuesto se respeta.
- [ ] Paso 5: Montar con `?map=whi-interior` y probar suelo, paredes, escaleras,
  muebles y decoración.
- [ ] Paso 6: Medir tiempo de creación de colliders y FPS con `?physics=1`
  apagado.

### Fase 8 — Rendimiento, documentación y cierre

- [ ] Paso 1: Medir `performance.now()` alrededor de la creación de colliders
  en los tres mapas; < 500 ms por mapa.
- [ ] Paso 2: Revisar red: cada GLB se descarga una sola vez.
- [ ] Paso 3: Escribir `frontend/world/README.md` con el flujo
  `world:import` → `world:scan` → `world:build` → `world:check` y el esquema de
  configuración.
- [ ] Paso 4: Ejecutar `bun run world:check -- --all`, `bun run check`,
  `bun run lint` y `bun run build`.
- [ ] Paso 5: Repasar los criterios de aceptación y actualizar este spec.
- [ ] Paso 6: Confirmar con el usuario antes de borrar `world.svelte` o assets
  viejos ajenos a este pipeline.

## 8. Verificación

```bash
cd frontend

# 1. Importar y escanear un mapa nuevo
bun run world:import -- static/Whi_Interior.glb --id whi-interior
bun run world:scan -- whi-interior

# 2. Generar componente, física, animaciones y registro
bun run world:build -- whi-interior
bun run world:build -- --all

# 3. Validar todos los mapas
bun run world:check -- --all

# 4. Alias antiguos
bun run map:build
bun run map:check
bun run crypt:build
bun run crypt:check

# 5. Tipos, formato y build
bun run check
bun run lint
bun run build

# 6. Prueba manual
bun run dev
# http://localhost:5173/?physics=1
# http://localhost:5173/?physics=1&map=whi-interior
```

Resultado esperado con los mapas actuales:

| Comprobación | Mundo exterior | Cripta |
| ------------ | -------------- | ------ |
| Nodos del GLB | 214 | 27 |
| Mallas del GLB | 156 | 25 |
| Animaciones | 76 | 0 |
| Nodos con collider | 24 | 16 |
| Triángulos de collider | 51 323 | 21 031 |
| Nodos decorativos con collider | 0 | 0 |

Casos manuales:

1. **Suelo exterior**: el jugador aparece en `(0, 0.4, 12)`, cae unos
   centímetros y queda de pie; no atraviesa `Circle` ni las áreas.
2. **Vallas y puertas**: se detiene contra `WHH_Fence`, `DRC_Fence`,
   `PFM_Fence` y `CCC_Fence`; cruza los huecos de las puertas.
3. **Edificios**: choca con casa, torre, castillo, granero, silo, capilla y
   mausoleo.
4. **Escalón**: sube el desnivel de 0.4 m entre `Circle`, las áreas y el porche
   sin saltar.
5. **Salto**: salta contra una valla y no queda montado en el borde.
6. **Decoración**: atraviesa murciélagos, telarañas, carteles, calabazas,
   caminos, velas, llamas y copas de árbol.
7. **Checkpoints**: los tres siguen activando su aviso al pasar por encima.
8. **Cripta**: se camina sobre `A4C_Hall`, se choca con criptas, props y hierro,
   y se entra/sale del mausoleo como hoy.
9. **Mapa nuevo**: con `?map=whi-interior` el jugador aparece en el spawn,
   camina sobre el suelo, choca con paredes y muebles grandes y atraviesa
   decoración.
10. **Debug**: `?physics=1` muestra solo los colliders del mapa activo.
11. **Cambio de escena**: entrar a la cripta y volver no deja colliders del
    mapa anterior ni atasca al jugador.
12. **Regeneración**: ejecutar `world:build` dos veces y repetir los casos 1–3;
    no hay colliders ni animaciones duplicadas.
13. **Mapa sin física**: un GLB sin `readyNode` se puede generar como visual,
    pero `world:build` falla si se intenta publicar como jugable.

## 9. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
| ------ | ------- | ---------- |
| La heurística incluye decoración y crea paredes invisibles. | Alto | Exclusiones duras por nombre/animación/material; candidatos dudosos van a `review`; `world:check` y prueba manual. |
| La heurística omite un suelo o una pared y el jugador cae o atraviesa. | Alto | Reglas geométricas de suelo/pared, `readyNode` obligatorio, presupuesto y prueba con `?physics=1`. |
| Un mapa fragmentado genera cientos o miles de colliders. | Alto | Modo `merged` por clúster, `maxColliders` y `maxColliderTriangles`; el escaneo elige `merged` automáticamente. |
| La fusión de geometría tarda demasiado al cargar. | Medio | Límite de triángulos, creación única, medición con `performance.now()` y fallback a `inject` si el mapa está agrupado. |
| El merge de trimeshes duplica memoria. | Medio | Se fusiona solo lo seleccionado, se liberan geometrías temporales y no se hace por frame. |
| La transformación del mapa no coincide con los colliders. | Alto | Una sola matriz en `WorldMap.svelte`; colliders dentro del mismo grupo; comprobar con `?physics=1`. |
| El spawn queda dentro de un collider. | Medio | Escaneo sugiere el centro del suelo; validación manual y opción de spawn en `maps.json`. |
| Regenerar el componente pisa cambios manuales. | Alto | El componente es generado; todos los cambios viven en JSON o scripts; `world:build` es idempotente. |
| `@threlte/gltf@latest` cambia el formato generado. | Medio | Fijar versión en `devDependencies` y regenerar con `bunx`. |
| El GLB cambia de nombres y la lista blanca queda obsoleta. | Alto | `sourceSha256` y `world:check` fallan; no se crean colliders por patrón difuso sin aprobación. |
| Los mapas animados reciben colliders en huesos o mallas móviles. | Alto | Exclusión de nodos animados/skinned y de sus descendientes. |
| Migrar `mapState`/`cryptState` rompe la espera de carga. | Alto | `worldState` mantiene `ready` por mapa; probar entrada/salida de cripta y recarga. |
| Quedan colliders huérfanos al desmontar. | Medio | `onDestroy` elimina colliders y resetea `ready`; probar cambio de escena con `?physics=1`. |
| El modo `merged` no reproduce huecos de puertas si agrupa de más. | Medio | Clústeres por prefijo lógico y `trimesh`; permitir overrides por nodo y `review`. |
| El presupuesto de 60 000 triángulos es insuficiente para un mapa nuevo. | Bajo | El límite es por mapa y configurable; si se sube, medir FPS y documentar la excepción. |
| `?map=` se filtra a producción. | Bajo | Leer solo con `import.meta.env.DEV` y `browser`; en producción ignorar. |

## 10. Preguntas abiertas

- [ ] ¿La clasificación automática debe incluir muebles por defecto, o solo
  suelos, paredes, escaleras y edificios, dejando los muebles en `review`?
  Propuesta: incluirlos solo con confianza alta y tamaño mínimo de 0.3 m.
- [ ] ¿El modo `merged` debe ser el predeterminado para mapas nuevos, o solo
  cuando `auto` detecte fragmentación? Propuesta: `auto` con umbral de 64
  mallas seleccionadas.
- [ ] ¿Los clústeres de `Whi_Interior` deben agruparse por prefijo de nombre o
  por proximidad espacial? Propuesta: prefijo lógico primero, proximidad como
  respaldo.
- [ ] ¿La transformación del mapa se aplica en `WorldMap` o se hornea en una
  copia del GLB? Propuesta: en `WorldMap`; es reversible y mantiene alineados
  visual y física.
- [ ] ¿Se migran `Map.svelte` y `Crypt.svelte` a `merged`, o se conserva
  `inject` por paridad? Propuesta: conservar `inject` en esta tarea y evaluar
  `merged` después.
- [ ] ¿Se borran los scripts viejos o se dejan wrappers? Propuesta: wrappers
  para los comandos de `package.json` y borrar los inyectores/verificadores
  duplicados.
- [ ] ¿`Whi_Interior.glb` se queda registrado como mapa jugable o solo como
  piloto temporal? Propuesta: dejarlo registrado y montarlo con `?map=` hasta
  que exista una escena/minijuego que lo use.
- [ ] ¿Se añade `--transform` de `@threlte/gltf` como opción del build?
  Propuesta: aceptar el flag, pero no activarlo por defecto.
- [ ] ¿El spawn de la cripta debe venir del registro o seguir usando
  `CRYPT_SPAWN`/`MAUSOLEUM_EXIT`? Propuesta: registro como fallback y conservar
  las entradas especiales actuales.

## 11. Decisiones y notas

### Esquema de `maps.json`

```json
{
	"version": 1,
	"defaults": {
		"friction": 0.9,
		"restitution": 0,
		"maxColliderTriangles": 60000,
		"maxColliders": 256,
		"collisionMode": "auto",
		"animations": "auto"
	},
	"maps": {
		"map": {
			"glb": "map.glb",
			"component": "Map",
			"physics": "map.physics.json",
			"spawn": { "x": 0, "y": 0.4, "z": 12 },
			"transform": {
				"position": [0, 0, 0],
				"rotation": [0, 0, 0],
				"scale": [1, 1, 1]
			},
			"lighting": "global",
			"scene": "global"
		},
		"crypt": {
			"glb": "game2.glb",
			"component": "Crypt",
			"physics": "crypt.physics.json",
			"spawn": { "x": 36.7, "y": -7.98, "z": 45 },
			"lighting": "crypt",
			"scene": "crypt"
		}
	}
}
```

### Esquema de `<id>.physics.json`

```json
{
	"id": "item",
	"glb": "item.glb",
	"sourceSha256": "…",
	"collision": {
		"mode": "auto",
		"maxColliderTriangles": 60000,
		"maxColliders": 256,
		"readyNode": "WHI_Base_Floor"
	},
	"groups": {
		"suelo": ["WHI_Base_Floor", "WHI_Floor_*"],
		"paredes": ["WHI_Base_Wall_*", "WHI_Ext_*"],
		"muebles": ["WHI_Kit_Table", "WHI_Attic_Bed"],
		"obstaculos": ["WHI_Base_Well"]
	},
	"shapes": {
		"WHI_Kit_Table": "convexHull",
		"WHI_Base_Well": "cuboid"
	},
	"excludePatterns": ["*Candle*", "*Flame*", "*Glow*", "*Book*", "*Painting*", "*Window*"],
	"forceInclude": [],
	"review": [
		{
			"name": "WHI_Hall_SmallStool",
			"category": "muebles",
			"confidence": 0.55,
			"triangles": 48,
			"reason": "nombre de mueble pero dimensión máxima < 0.3 m"
		}
	]
}
```

Los grupos son la lista blanca aprobada. `review` es informativo y nunca crea
colliders. `excludePatterns` se valida contra los grupos: un nombre en ambos es
error. `forceInclude` solo se usa para excepciones revisadas.

### Reglas de clasificación

| Señal | Suelo | Pared | Mueble | Obstáculo |
| ----- | ----- | ----- | ------ | --------- |
| Nombre | `floor`, `ground`, `terrain`, `suelo`, `piso`, `platform` | `wall`, `pared`, `fence`, `valla`, `gate`, `door`, `roof`, `house`, `castle`, `stairs`, `column` | `table`, `chair`, `bed`, `shelf`, `cabinet`, `chest`, `barrel`, `crate`, `bench`, `altar`, `coffin` | `trunk`, `rock`, `statue`, `well`, `pillar` |
| Geometría | AABB aplanado, huella ≥ 2 m², normal superior mayoritaria | altura ≥ 1 m, grosor horizontal ≤ 0.5 m, altura ≥ 2× grosor | volumen 0.01–12 m³, dimensión máxima ≤ 4 m | volumen ≥ 0.05 m³ y dimensión máxima ≥ 0.4 m |
| Prioridad | alta | alta | media | media |

- Una señal semántica fuerte vale 0.9; una geométrica 0.6; ambas 1.0.
- `auto` incluye ≥ 0.8. Entre 0.5 y 0.8 va a `review`. < 0.5 se descarta.
- Las exclusiones duras se aplican antes de puntuar y ganan siempre.
- Nodos con hijos se evalúan como un todo; si un hijo está animado, se excluye
  el subárbol.
- Los nombres repetidos usan el primero del GLB y `world:check` avisa, como hoy.

### Modos de colisión

- **`inject`**: el mapa ya trae grupos lógicos (por ejemplo `area1`,
  `WHH_House`, `A4C_Hall`). Se envuelve el bloque generado con `AutoColliders`.
  Es el modo de `map` y `crypt` para conservar la paridad exacta.
- **`merged`**: el mapa trae cientos de mallas sueltas. `WorldColliders`
  agrupa por prefijo lógico y fusiona geometría en uno o pocos trimeshes por
  clúster. Se crean una vez al cargar, en espacio de mundo, y se liberan al
  desmontar.
- **`chunked`**: el mapa tiene mallas con triángulos que abarcan decenas de
  metros (suelo, plazas, caminos). `ChunkedColliders` parte la geometría visual
  en celdas XZ de `collision.chunkSize` metros (16 por defecto) y crea un
  trimesh por celda. Así el broad phase del character controller solo consulta
  la celda del jugador y no un BVH de escala de mapa. `world-inject.mjs` no
  inserta `AutoColliders` en este modo.
- **`none`**: solo visual; el mapa no se marca `ready` ni se registra como
  jugable.
- **`auto`**: usa `inject` si hay ≤ 64 mallas seleccionadas y `merged` si hay
  más o si dominan nodos raíz sin grupo.

### Por qué no dar físicas a todo

- **Coste**: cada trimesh ocupa memoria y se consulta en cada movimiento del
  character controller. 2 509 mallas decorativas son inviables.
- **Gameplay**: una telaraña, una vela o un cuadro con collider crea paredes
  invisibles y atascos.
- **Robustez**: geometría abierta, de una cara o con transparencia da
  colisiones impredecibles.
- **Mantenibilidad**: una lista blanca aprobada por mapa es auditable; una
  regla “todo colisiona” no.

### Transformaciones

- La entrada `transform` de `maps.json` es la única transformación de escena.
- `WorldMap.svelte` la aplica con un `<T.Group>` alrededor del componente.
- Los colliders se calculan dentro de ese grupo, así que heredan la matriz.
- El spawn se declara en coordenadas de mundo (después de la transformación).
- No se aplica la transformación al jugador ni a la cámara.

### Compatibilidad

- `map:build` y `crypt:build` se mantienen como alias para no romper la
  documentación ni los hábitos del usuario.
- Los JSON viejos se migran una vez; después se eliminan para no tener dos
  fuentes de verdad.
- `Map.svelte` y `Crypt.svelte` se regeneran con el pipeline nuevo; no se
  editan a mano.

## 12. Progreso

| Fecha | Estado | Nota |
| ----- | ------ | ---- |
| 2026-11-01 | borrador | Spec creado. Línea base: `map` 24 nodos/51 323 triángulos; `crypt` 16 nodos/21 031 triángulos; ambos `check` en verde. Pendiente de revisar las preguntas abiertas antes de implementar. |

## 13. Changelog

- 2026-11-01 — Creación del spec: pipeline único de importación, escaneo,
  generación e inyección; clasificación de suelos/paredes/muebles/obstáculos;
  modos `inject` y `merged`; registro tipado; `worldState`; piloto
  `Whi_Interior.glb`.
