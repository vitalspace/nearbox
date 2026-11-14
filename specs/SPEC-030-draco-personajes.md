---
id: SPEC-030
titulo: "Draco y optimización de todos los personajes de `static/`"
estado: en-progreso
prioridad: alta
creado: 2026-11-12
actualizado: 2026-11-12
responsable: opencode
etiquetas:
  [draco, gltf-transform, personajes, skins, npcs, rendimiento, assets, threlte]
depende_de: [SPEC-007, SPEC-009, SPEC-028]
bloquea: []
estimacion: "5h"
---

# SPEC-030 — Draco y optimización de todos los personajes de `static/`

## 1. Contexto

Los personajes del juego se sirven como GLB sueltos desde
`frontend/static/`. Hoy suman **30,00 MB** repartidos en 21 archivos:

| Grupo                                                               | Archivos |  Peso actual |
| ------------------------------------------------------------------- | -------: | -----------: |
| Skins jugables                                                      |       12 |     14,76 MB |
| NPCs exclusivos del lobby                                           |        7 |     11,92 MB |
| Personajes sin referencia de runtime (`Shopkeeper`, `TouristGuide`) |        2 |      3,32 MB |
| **Total**                                                           |   **21** | **30,00 MB** |

`Hero.glb` y `Heroina.glb` se usan a la vez como skin del jugador y como
modelo de NPC (`Vera` y `Alba`), por eso no aparecen duplicados en la tabla.

Los 21 archivos tienen entre 0,81 y 1,72 MB. La mayor parte de ese peso **no
es geometría**: los humanos tienen 11 348 triángulos y 25 clips de animación
con claves horneadas por Blender. Draco comprime posiciones, normales, UV,
huesos y pesos, pero **no comprime los keyframes de animación**. Por eso una
compresión Draco directa solo ahorra un 21 %.

Medición de laboratorio con el encoder de `world-compress.mjs`:

| Archivo              |     Original |             Solo Draco |      Draco + pre-paso |
| -------------------- | -----------: | ---------------------: | --------------------: |
| `Abuela.glb`         |      1,71 MB |      1,26 MB (−26,4 %) |     0,47 MB (−72,7 %) |
| `Hero.glb`           |      1,69 MB |      1,25 MB (−25,6 %) |     0,46 MB (−72,7 %) |
| `Demon.glb`          |      1,16 MB |      1,02 MB (−12,0 %) |     0,41 MB (−64,7 %) |
| `Mummy.glb`          |      1,20 MB |      1,00 MB (−17,3 %) |     0,41 MB (−66,0 %) |
| `Scarecrow_Feet.glb` |      1,27 MB |      0,99 MB (−22,0 %) |     0,41 MB (−67,8 %) |
| **21 archivos**      | **30,00 MB** | **23,69 MB (−21,1 %)** | **9,05 MB (−69,8 %)** |

El pre-paso es una cadena de `@gltf-transform/functions`:

1. `dedup()` y `prune()`: elimina recursos duplicados o no usados.
2. `weld()`: une vértices idénticos sin mezclar atributos distintos.
3. `resample({ tolerance: 1e-4 })`: elimina keyframes repetidos que Blender
   hornea al aplicar IK. Es la parte que reduce el peso de las animaciones.
4. Reinyección del keyframe final en cada sampler cuya duración se haya
   acortado, para que los clips conserven su duración original.
5. `KHR_draco_mesh_compression` con `EDGEBREAKER` y la misma cuantización que
   usa el mapa (`POSITION: 14`, `NORMAL: 10`, `UV: 12`, `JOINTS/WEIGHTS: 12`).

`SPEC-009` ya dejó resuelto el patrón para el mapa: `world:compress` guarda el
export original en `world/source/<glb>`, comprime el GLB servido y el
componente registra el decodificador local `asset('draco/')`. Este spec aplica
el mismo patrón a los personajes, pero con el pre-paso de animación porque,
sin él, el ahorro no justifica el riesgo.

### Situación de los loaders

No todos los componentes que cargan personajes registran Draco:

| Loader                                   | GLB que carga     | ¿Registra Draco?                    |
| ---------------------------------------- | ----------------- | ----------------------------------- |
| `player/Hero.svelte` (generado)          | `Hero.glb`        | **Sí**, `useDraco(asset('draco/'))` |
| `loaders/AssetPreloader.svelte`          | assets del núcleo | **Sí**, vía `useLoader(GLTFLoader)` |
| `ui/TrackPreviewModel.svelte`            | previews          | **Sí**                              |
| `player/SkinCharacter.svelte`            | 11 skins          | **No**                              |
| `npc/NpcCharacter.svelte`                | 9 modelos de NPC  | **No**                              |
| `minigame2/MummyModel.svelte` (generado) | `Mummy.glb`       | **No**                              |

Si se comprime un GLB y el loader que lo abre no tiene `DRACOLoader`, Three
falla con `THREE.GLTFLoader: No DRACOLoader instance provided`. Por eso la
tarea no es solo comprimir archivos: hay que registrar el decodificador en
**todos** los caminos de carga.

Además, `loaders/gameAssets.svelte.ts` tiene los tamaños de los assets del
núcleo escritos a mano (`Hero.glb`: 1 484 184 B, `Scarecrow_Feet.glb`:
1 065 980 B, `Mummy.glb`: 995 836 B). Si se comprimen, esos números dejan de
ser ciertos y la barra de progreso se vuelve incorrecta.

### Archivos que no entran en esta tarea

- `Scarecrow.glb` (0,38 MB): es la fuente que importa
  `blender/scripts/build_barnsiege.py`; no lo carga el frontend. Comprimirlo
  podría romper la reimportación en Blender.
- `Mummy copy.glb` (0,36 MB) y `Scarecrow_Feet copy.glb` (0,42 MB): copias sin
  referencias. Se proponen para retirada en otra tarea, no para comprimir.
- `gato.glb` (11 KB), coches (`coche_*.glb`, ~1 MB en total) y escenas
  (`map.glb`, `Parkour.glb`, `barnsiege.glb`, `roadmap.glb`, `game2.glb`,
  `whi-interior.glb`). Quedan fuera de este spec.
- Compresión de texturas (KTX2/WebP): estos personajes no llevan imágenes
  embebidas.

## 2. Objetivo

Comprimir con Draco los 21 GLB de personajes de `frontend/static/`, usando un
pre-paso que reduzca las animaciones sin cambiar clips ni duraciones, y
registrar el decodificador local en todos los loaders que los abren. El peso
total de personajes debe bajar de 30,00 MB a **≤ 10 MB** sin cambios visibles
en rigs, animaciones ni gameplay.

## 3. Alcance

**Incluye**

- Manifiesto versionado de personajes (`world/characters.json`).
- Script `characters:compress` con backup de originales y modo `--restore`.
- Script `characters:check` que valida Draco, clips, duraciones y loaders.
- Compresión de los 21 personajes con pre-paso de animación + Draco.
- Originales sin comprimir en `frontend/world/source/`.
- Registro del decodificador local en `SkinCharacter`, `NpcCharacter` y
  `MummyModel`.
- Actualización de los tamaños de `gameAssets.svelte.ts`.
- Verificación de skins, NPCs, momias y monstruos de oleadas.
- Documentación de la decisión y de cómo regenerar los componentes.

**No incluye**

- Comprimir mapas, escenarios, coches, gatos o interiores.
- Comprimir `Scarecrow.glb` ni las copias `* copy.glb`.
- Borrar assets sin usar; se propone en §10.
- Cambiar rigs, clips, animaciones o lógica de juego.
- Sustituir Draco por meshopt/gltfpack o añadir otro decodificador.
- Optimizar texturas (no hay texturas embebidas en estos GLB).
- Tocar la física, el mapa o el multijugador.

## 4. Requisitos

### Funcionales

| ID    | Requisito                                                                                                                                                                                                                           | Prioridad |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| RF-1  | `frontend/world/characters.json` enumera los 21 personajes con `glb`, grupo, loaders, clips esperados y tamaño original. Es la única fuente de verdad.                                                                              | alta      |
| RF-2  | `bun run characters:compress` lee el manifiesto y comprime solo los GLB enumerados.                                                                                                                                                 | alta      |
| RF-3  | Antes de comprimir, si el GLB de `static/` no está comprimido se copia a `world/source/<glb>`. Si ya está comprimido y no existe la fuente, el script aborta. Si la fuente ya está comprimida, aborta. Nunca se comprime dos veces. | alta      |
| RF-4  | El pre-paso aplica `dedup()`, `prune()`, `weld()` y `resample({ tolerance: 1e-4 })` antes de Draco.                                                                                                                                 | alta      |
| RF-5  | La duración de cada clip se conserva: se mide antes de `resample` y, si un sampler queda más corto, se añade un keyframe final en la duración original con el último valor. La diferencia aceptada es ≤ 0,05 s.                     | alta      |
| RF-6  | Draco usa `KHR_draco_mesh_compression` con `EDGEBREAKER` y `POSITION: 14`, `NORMAL: 10`, `TEXCOORD_0/1: 12`, `COLOR_0: 8`, `WEIGHTS_0: 12`, `JOINTS_0: 12`, `GENERIC: 12`.                                                          | alta      |
| RF-7  | Los 21 GLB servidos declaran `KHR_draco_mesh_compression` en `extensionsUsed` y en `extensionsRequired`.                                                                                                                            | alta      |
| RF-8  | Nombres de nodos, materiales y mallas se conservan. El número y los nombres de clips se conservan.                                                                                                                                  | alta      |
| RF-9  | `SkinCharacter.svelte`, `NpcCharacter.svelte` y `MummyModel.svelte` registran `useDraco(asset('draco/'))` en su `useGltf`. `Hero.svelte`, `AssetPreloader.svelte` y `TrackPreviewModel.svelte` ya lo hacen y no se tocan.           | alta      |
| RF-10 | `package.json` añade `characters:compress` y `characters:check`.                                                                                                                                                                    | alta      |
| RF-11 | `characters:check` falla si: falta un GLB o su fuente; un GLB no usa Draco; un clip cambia de nombre, número o duración; cambian nodos/materiales; un loader de personaje no registra Draco; o se supera el presupuesto de tamaño.  | alta      |
| RF-12 | `gameAssets.svelte.ts` usa los tamaños reales de los GLB comprimidos de `Hero`, `Scarecrow_Feet` y `Mummy`.                                                                                                                         | media     |
| RF-13 | El total comprimido es ≤ 10 MB, ningún archivo supera 0,55 MB y la reducción global es ≥ 65 %.                                                                                                                                      | alta      |
| RF-14 | `characters:compress --restore` copia los originales de `world/source/` a `static/` y se niega a restaurar una fuente comprimida; `characters:check --allow-uncompressed` permite validar ese estado durante el rollback.           | media     |
| RF-15 | El juego sigue funcionando igual: skins, NPCs, momias, monstruos de oleadas y previews cargan sin errores de consola.                                                                                                               | alta      |
| RF-16 | `Scarecrow.glb`, `Mummy copy.glb`, `Scarecrow_Feet copy.glb` y los assets fuera del manifiesto no se modifican.                                                                                                                     | alta      |

### No funcionales

| ID    | Requisito            | Criterio                                                                                                     |
| ----- | -------------------- | ------------------------------------------------------------------------------------------------------------ |
| RNF-1 | Tiempo de compresión | Los 21 archivos se procesan en < 2 min en un portátil de gama media.                                         |
| RNF-2 | Determinismo         | La misma fuente y opciones producen el mismo GLB (mismo SHA-256).                                            |
| RNF-3 | Decodificador        | El WASM de Draco se descarga una sola vez desde `/draco/`; no hay decodificadores por modelo ni CDN externo. |
| RNF-4 | SSR seguro           | El script corre en Node; el runtime solo usa hooks de Threlte dentro de `<Canvas>`.                          |
| RNF-5 | Calidad              | Sin T-pose, saltos, pies deslizantes ni cambios visibles en idle/walk/run/attack/social.                     |
| RNF-6 | Compatibilidad       | El loader con Draco también acepta un GLB sin comprimir durante la migración.                                |
| RNF-7 | Tipo y formato       | `bun run check` y `bun run lint` pasan sin errores nuevos.                                                   |
| RNF-8 | Peso del repo        | Los originales viven en `world/` (no se sirven) y `dist` baja ~20,9 MB en personajes.                        |

## 5. Criterios de aceptación

- [x] CA-1: El reporte inicial de `characters:check` (o el log de `characters:compress --dry-run`) registra 21 archivos y 30,00 MB antes de comprimir.
- [x] CA-2: `bun run characters:compress` procesa los 21 archivos y muestra el antes/después de cada uno.
- [x] CA-3: El total comprimido es ≤ 10 MB, el mayor archivo es ≤ 0,55 MB y la reducción es ≥ 65 %.
- [x] CA-4: Los 21 GLB declaran `KHR_draco_mesh_compression` en `extensionsUsed` y `extensionsRequired`.
- [x] CA-5: Existen los 21 originales en `world/source/`, no usan Draco y conservan el tamaño del manifiesto.
- [x] CA-6: `bun run characters:check` pasa sin errores.
- [x] CA-7: Cada GLB conserva sus nodos, mallas, materiales y clips; las duraciones no cambian más de 0,05 s.
- [ ] CA-8: El jugador carga las 12 skins (incluida `Hero`) sin `No DRACOLoader instance provided`.
- [ ] CA-9: Los 9 NPCs del lobby cargan y se mueven con sus clips.
- [ ] CA-10: Las momias de `minigame-2` y los monstruos de `minigame-5` cargan y animan.
- [ ] CA-11: La barra de progreso de `AssetPreloader` termina en 100 % y los tamaños de `gameAssets` coinciden con los archivos.
- [x] CA-12: Volver a ejecutar `characters:compress` sin `--force` no recomprime ni altera los archivos.
- [x] CA-13: `characters:compress --restore` devuelve los originales a `static/` y `characters:check --allow-uncompressed` lo acepta.
- [x] CA-14: `bun run check`, `bun run lint` y `bun run build` pasan.
- [ ] CA-15: En el inspector de red no hay GLB de personaje sin comprimir ni peticiones 404 a `/draco/`.
- [x] CA-16: `dist` pesa ~20,9 MB menos en personajes y los originales no se copian a `dist`.

## 6. Archivos relevantes

| Ruta                                                                                                                                                                                                   | Acción                  | Motivo                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------- |
| `frontend/world/characters.json`                                                                                                                                                                       | crear                   | Manifiesto de los 21 personajes, grupos, loaders y clips esperados.                   |
| `frontend/scripts/characters-compress.mjs`                                                                                                                                                             | crear                   | Backup, pre-paso de animación, Draco, `--force`, `--restore` y `--only`.              |
| `frontend/scripts/characters-check.mjs`                                                                                                                                                                | crear                   | Valida Draco, fuentes, clips, duraciones, loaders y presupuesto.                      |
| `frontend/scripts/world-lib.mjs`                                                                                                                                                                       | modificar               | Extraer opciones Draco y helper de lectura/escritura compartido con `world-compress`. |
| `frontend/scripts/world-compress.mjs`                                                                                                                                                                  | modificar               | Reutilizar el helper compartido sin cambiar su comportamiento para mapas.             |
| `frontend/package.json`                                                                                                                                                                                | modificar               | Scripts `characters:compress` y `characters:check`.                                   |
| `frontend/world/source/*.glb`                                                                                                                                                                          | crear (21 backups)      | Exports originales sin comprimir; `sourceGlbPath()` ya busca aquí.                    |
| `frontend/static/Hero.glb`, `Heroina.glb`, `Scarecrow_Feet.glb`, `Witch.glb`, `Demon.glb`, `Frankenstein.glb`, `Ghost.glb`, `Golem.glb`, `Mummy.glb`, `PumpkinKing.glb`, `Skeleton.glb`, `Vampire.glb` | modificar (comprimidos) | Skins jugables.                                                                       |
| `frontend/static/Abuela.glb`, `Abuelo.glb`, `Hombre.glb`, `Hombre2.glb`, `NPC_Joven.glb`, `NPC_Jovena.glb`, `NPC_Nina.glb`                                                                             | modificar (comprimidos) | NPCs exclusivos del lobby.                                                            |
| `frontend/static/Shopkeeper.glb`, `TouristGuide.glb`                                                                                                                                                   | modificar (comprimidos) | Personajes presentes en `static/` sin referencia actual.                              |
| `frontend/src/lib/components/player/SkinCharacter.svelte`                                                                                                                                              | modificar               | Añadir `useDraco(asset('draco/'))` a `useGltf`.                                       |
| `frontend/src/lib/components/npc/NpcCharacter.svelte`                                                                                                                                                  | modificar               | Añadir `useDraco(asset('draco/'))` a `useGltf`.                                       |
| `frontend/src/lib/components/minigame2/MummyModel.svelte`                                                                                                                                              | modificar               | Componente generado: añadir `useDraco(asset('draco/'))`.                              |
| `frontend/src/lib/components/player/Hero.svelte`                                                                                                                                                       | sin cambios             | Ya registra Draco local.                                                              |
| `frontend/src/lib/loaders/AssetPreloader.svelte`                                                                                                                                                       | sin cambios             | Ya configura `GLTFLoader.setDRACOLoader()`.                                           |
| `frontend/src/lib/loaders/gameAssets.svelte.ts`                                                                                                                                                        | modificar               | Actualizar tamaños de `Hero`, `Scarecrow_Feet` y `Mummy`.                             |
| `frontend/src/lib/components/ui/TrackPreviewModel.svelte`                                                                                                                                              | sin cambios             | Ya registra Draco.                                                                    |
| `specs/SPEC-030-draco-personajes.md`                                                                                                                                                                   | crear                   | Este spec.                                                                            |

## 7. Plan de implementación

### Fase 0 — Línea base y manifiesto

- [x] Paso 1: Crear `world/characters.json` con los 21 archivos de §1,
      agrupados en `skins`, `npcs` y `unused`, y anotar el tamaño actual de
      cada uno.
- [x] Paso 2: Añadir a cada entrada el número de clips esperado: 25 para los
      humanos y `Scarecrow_Feet`, 23 para `Mummy`, 24 para `Witch`, 23 para
      `Demon`/`Frankenstein`/`Golem`/`Skeleton`, 22 para `Ghost`, 24 para
      `PumpkinKing`, 23 para `Vampire`, 25 para `Shopkeeper`/`TouristGuide`.
- [x] Paso 3: Registrar en §12 el peso total inicial (30,00 MB) y el SHA-256
      de cada GLB para poder comparar los backups.
- [x] Paso 4: Confirmar que `Scarecrow.glb` y las copias quedan fuera del
      manifiesto.

### Fase 1 — Compresor compartido

- [x] Paso 1: Extraer de `world-compress.mjs` a `world-lib.mjs` la cuantización
      (`DRACO_QUANTIZATION_BITS`) y un helper `createDracoIO()` para no
      duplicar la configuración en dos scripts.
- [x] Paso 2: Crear `characters-compress.mjs` con los flags `--force`,
      `--only <patrón>`, `--dry-run` y `--restore`.
- [x] Paso 3: Implementar la regla de backup de RF-3 usando
      `world/source/<basename>` y `readGlb().json.extensionsUsed` para detectar
      Draco.
- [x] Paso 4: Implementar el pre-paso en este orden: `dedup({ keepUniqueNames: true })`,
      `prune`, `weld`, `resample`. Guardar antes la duración máxima de cada
      animación. `keepUniqueNames` evita fusionar materiales, mallas o skins con
      nombre propio.
- [x] Paso 5: Implementar `preserveDurations(document, durations)`: para cada
      sampler no `CUBICSPLINE`, si su último tiempo es menor que la duración
      original, crear accessors nuevos con un keyframe final en la duración
      original y repetir el último valor.
- [x] Paso 6: Aplicar `prune()` y `dedup({ keepUniqueNames: true })` después de
      preservar duraciones y antes de Draco.
- [x] Paso 7: Escribir el GLB comprimido en un `.tmp.glb` y renombrarlo, igual
      que hace `world-compress.mjs`, para no dejar un archivo a medias.
- [x] Paso 8: Registrar por consola `archivo: X MB → Y MB (−Z %)` y el total.

### Fase 2 — Loaders y decodificador local

- [x] Paso 1: En `SkinCharacter.svelte`, importar `useDraco` y `asset`, y
      cambiar `useGltf(skin.modelPath ?? '')` por
      `useGltf(skin.modelPath ?? '', { dracoLoader: useDraco(asset('draco/')) })`.
- [x] Paso 2: En `NpcCharacter.svelte`, hacer lo mismo con
      `useGltf(asset(definition.model), { dracoLoader: useDraco(asset('draco/')) })`.
- [x] Paso 3: En `MummyModel.svelte`, importar `useDraco` y cambiar
      `useGltf(asset('Mummy.glb'))` por la versión con `dracoLoader`. Anotar en
      la cabecera que el componente es generado y que el parche debe repetirse
      si se regenera.
- [x] Paso 4: Confirmar que `Hero.svelte` y `TrackPreviewModel.svelte` ya usan
      `useDraco(asset('draco/'))` y que `AssetPreloader.svelte` configura el
      `GLTFLoader` con `setDRACOLoader`.
- [x] Paso 5: Añadir a `package.json` los scripts `characters:compress` y
      `characters:check`, apuntando a `node scripts/characters-compress.mjs` y
      `node scripts/characters-check.mjs`.

### Fase 3 — Comprimir y actualizar tamaños

- [x] Paso 1: Ejecutar `bun run characters:compress`.
- [x] Paso 2: Verificar que los 21 GLB de `static/` empiezan por `glTF`, que
      pesan lo esperado y que los originales están en `world/source/`.
- [x] Paso 3: Actualizar `gameAssets.svelte.ts` con los bytes exactos de
      `Hero.glb`, `Scarecrow_Feet.glb` y `Mummy.glb` comprimidos.
- [x] Paso 4: Confirmar que ningún original de `world/source/` se copia a
      `dist/`.
- [x] Paso 5: Revisar que los assets que no están en el manifiesto siguen
      intactos.

### Fase 4 — Verificador

- [x] Paso 1: Crear `characters-check.mjs` usando `readGlb()` de
      `world-lib.mjs`; no hace falta cargar Three ni Draco para leer el JSON.
- [x] Paso 2: Validar por archivo: existencia, extensión Draco en
      `extensionsUsed` y `extensionsRequired`, fuente en `world/source/` sin
      Draco, tamaño y SHA-256 del original.
- [x] Paso 3: Comparar fuente y comprimido: nombres/cantidad de animaciones,
      duración máxima por clip (±0,05 s), nombres de nodos y materiales,
      cantidad de mallas.
- [x] Paso 4: Validar los loaders: `SkinCharacter.svelte`,
      `NpcCharacter.svelte` y `MummyModel.svelte` deben contener
      `useDraco(asset('draco/'))`; cualquier `useGltf(asset('<personaje>.glb'))`
      literal debe llevar `dracoLoader`.
- [x] Paso 5: Validar presupuesto: total ≤ 10 MB, archivo ≤ 0,55 MB,
      reducción ≥ 65 %.
- [x] Paso 6: Añadir `--allow-uncompressed` para que el verificador sirva
      durante el rollback con `--restore`.
- [x] Paso 7: Ejecutar `bun run characters:check` y guardar el resultado en
      §12.

### Fase 5 — Verificación manual y cierre

- [ ] Paso 1: Arrancar `bun run dev` con caché desactivada y recorrer las 12
      skins.
- [ ] Paso 2: Verificar los 9 NPCs, sus rutas y sus diálogos.
- [ ] Paso 3: Entrar a `minigame-2` y comprobar las momias.
- [ ] Paso 4: Entrar a `minigame-5` y comprobar los monstruos de oleadas.
- [ ] Paso 5: Comparar a ojo idle, walk, run, attack, hit y clips sociales
      contra los originales de `world/source/`.
- [x] Paso 6: Ejecutar `bun run check`, `bun run lint` y `bun run build`.
- [x] Paso 7: Actualizar este spec (estado, progreso, changelog y criterios).

## 8. Verificación

```bash
cd frontend

# 1. Comprimir todos los personajes del manifiesto
bun run characters:compress

# 2. Validar Draco, fuentes, clips, loaders y presupuesto
bun run characters:check

# 3. Tipos, formato y build
bun run check
bun run lint
bun run build

# 4. Prueba manual
bun run dev
# abrir http://localhost:5173/ con la caché del navegador desactivada
```

Resultado esperado con la medición de laboratorio (puede variar ±2 % según la
versión de `draco3dgltf`):

| Archivo              | Grupo       |        Antes |     Después |  Reducción |
| -------------------- | ----------- | -----------: | ----------: | ---------: |
| `Hero.glb`           | skin        |      1,69 MB |     0,46 MB |     72,7 % |
| `Heroina.glb`        | skin/NPC    |      1,69 MB |     0,46 MB |     72,6 % |
| `Scarecrow_Feet.glb` | skin        |      1,27 MB |     0,41 MB |     67,8 % |
| `Witch.glb`          | skin        |      1,19 MB |     0,43 MB |     63,7 % |
| `Demon.glb`          | skin        |      1,16 MB |     0,41 MB |     64,7 % |
| `Frankenstein.glb`   | skin        |      1,12 MB |     0,40 MB |     64,4 % |
| `Ghost.glb`          | skin        |      0,81 MB |     0,27 MB |     66,4 % |
| `Golem.glb`          | skin        |      1,19 MB |     0,41 MB |     65,3 % |
| `Mummy.glb`          | skin        |      1,20 MB |     0,41 MB |     66,0 % |
| `PumpkinKing.glb`    | skin        |      1,17 MB |     0,42 MB |     64,1 % |
| `Skeleton.glb`       | skin        |      1,15 MB |     0,39 MB |     65,6 % |
| `Vampire.glb`        | skin        |      1,12 MB |     0,41 MB |     63,9 % |
| `Abuela.glb`         | NPC         |      1,71 MB |     0,47 MB |     72,7 % |
| `Abuelo.glb`         | NPC         |      1,71 MB |     0,47 MB |     72,7 % |
| `Hombre.glb`         | NPC         |      1,69 MB |     0,46 MB |     72,7 % |
| `Hombre2.glb`        | NPC         |      1,70 MB |     0,46 MB |     72,8 % |
| `NPC_Joven.glb`      | NPC         |      1,70 MB |     0,46 MB |     72,8 % |
| `NPC_Jovena.glb`     | NPC         |      1,69 MB |     0,46 MB |     72,7 % |
| `NPC_Nina.glb`       | NPC         |      1,72 MB |     0,47 MB |     72,9 % |
| `Shopkeeper.glb`     | sin runtime |      1,63 MB |     0,45 MB |     72,3 % |
| `TouristGuide.glb`   | sin runtime |      1,70 MB |     0,46 MB |     72,7 % |
| **Total**            |             | **30,00 MB** | **9,05 MB** | **69,8 %** |

Casos manuales:

1. **Skin del jugador**: cargar `Hero` y cambiar a cada una de las 11 skins
   restantes. No debe aparecer T-pose ni error de Draco en consola.
2. **NPCs**: acercarse a los 9 NPCs del lobby; deben caminar, girar, saludar y
   reproducir sus clips sociales.
3. **Momias**: entrar a `minigame-2`; las momias deben aparecer, perseguir y
   atacar con `MU_*`.
4. **Oleadas**: entrar a `minigame-5`; cada tipo de monstruo debe cargar su
   skin y animar `HR_*`/`*_*` sin saltos.
5. **Duraciones**: comparar un clip de 4 s (`HR_idle`) contra el original;
   debe seguir durando ~4 s y ciclar sin salto.
6. **Ataques**: comprobar que los clips de ataque no terminan antes de tiempo
   ni se quedan congelados al final.
7. **Preview**: abrir la vista previa de skin; debe cargar con Draco.
8. **Precarga**: recargar con la caché desactivada; la barra debe llegar al
   100 % y no quedarse bloqueada.
9. **Red**: en el inspector, todos los GLB de personaje deben mostrar
   `Content-Encoding`/tamaño comprimido y ninguna petición debe ir a un CDN de
   Draco.
10. **Rollback**: `characters:compress --restore`, recargar y comprobar que el
    juego sigue funcionando con los GLB originales.
11. **Idempotencia**: volver a ejecutar `characters:compress` sin `--force`;
    no debe reescribir archivos ni perder los backups.
12. **Build**: revisar que `dist/` no contiene `world/source/` y que los GLB
    servidos son los comprimidos.

## 9. Riesgos y mitigaciones

| Riesgo                                                                                   | Impacto | Mitigación                                                                                                                            |
| ---------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `resample` acorta la duración de un clip y rompe el loop o la sincronización de ataques. | Alto    | Guardar la duración original por clip y reinyectar el keyframe final; `characters:check` compara duraciones con tolerancia ±0,05 s.   |
| `weld` mezcla vértices con huesos o pesos distintos.                                     | Alto    | `weld` solo une vértices con todos los atributos idénticos; validar que nodos, mallas y clips no cambien y probar las skins en juego. |
| Se comprime un GLB y algún loader no registra Draco.                                     | Alto    | Checklist de RF-9 y validación automática de `characters:check`; probar precarga y carga directa con caché limpia.                    |
| El GLB ya estaba comprimido y se comprime otra vez.                                      | Alto    | El script aborta si la fuente también está comprimida; `--force` solo recomprime desde `world/source/`.                               |
| Se pierde el export original.                                                            | Alto    | Backup obligatorio en `world/source/`; `--restore` para volver atrás; el script aborta si falta la fuente.                            |
| Regenerar `MummyModel.svelte` con `@threlte/gltf` borra el `useDraco`.                   | Medio   | Documentar el parche en la cabecera del componente y hacer que `characters:check` falle si el loader no registra Draco.               |
| Cambian los nombres de nodos o clips por `prune`/`dedup`.                                | Medio   | El verificador compara nombres y cantidades contra la fuente; si cambia algo, se ajusta el pipeline antes de publicar.                |
| La cuantización de normales (`NORMAL: 10`) produce facetas visibles.                     | Bajo    | Comparar visualmente contra el original; si aparece, subir a 12 bits o relajar la compresión de normales.                             |
| El peso del repo crece por los 30 MB de backups.                                         | Bajo    | `world/` no se sirve ni se copia a `dist`; es el precio de poder revertir.                                                            |
| La web sigue pesada por escenarios (`Parkour.glb` 21,5 MB, `barnsiege.glb` 5,6 MB).      | Medio   | Este spec baja ~21 MB de personajes; el resto se aborda en un spec aparte.                                                            |
| `useGltf` cachea por URL y una carga previa sin Draco envenena la caché.                 | Medio   | Todos los loaders registran Draco; la precarga también; probar con recarga dura y caché desactivada.                                  |
| Los GLB de `Shopkeeper`/`TouristGuide` no se usan y no se prueban.                       | Bajo    | Se comprimen igual para mantener `static/` coherente; no hay loader que actualizar.                                                   |

## 10. Preguntas abiertas

- [ ] ¿Se comprimen también `Shopkeeper.glb` y `TouristGuide.glb` aunque hoy no
      tengan referencias de runtime? Propuesta: sí, para que todo personaje de
      `static/` quede con el mismo formato.
- [ ] ¿Se eliminan `Mummy copy.glb` y `Scarecrow_Feet copy.glb`? Propuesta: sí,
      en una tarea aparte y con confirmación; suman 0,78 MB y no se usan.
- [ ] ¿Se comprime `Scarecrow.glb`? Propuesta: no, porque
      `blender/scripts/build_barnsiege.py` lo importa como fuente.
- [ ] ¿La tolerancia de `resample` debe ser `1e-4` o más conservadora
      (`1e-5`)? Propuesta: `1e-4`, que ya reduce ~70 %; bajar a `1e-5` si aparece
      cualquier artefacto visual.
- [ ] ¿Se añade compresión de animaciones con meshopt/gltfpack en otro spec?
      Propuesta: no ahora; requeriría un decodificador adicional.
- [ ] ¿Se actualiza también `gameAssets` para incluir las skins/NPCs que hoy
      no se precargan? Propuesta: no en este spec; solo corregir los tamaños de los
      tres assets ya listados.

## 11. Decisiones y notas

- **Draco solo no basta**: la medición muestra −21,1 %. El peso restante son
  keyframes de animación, no vértices. Por eso el pipeline incluye `resample`.
- **`resample` no es “borrar animación”**: elimina keyframes redundantes que
  reproducen el mismo valor; con `tolerance: 1e-4` conserva el movimiento y
  reduce el archivo. Es la misma técnica que usa el `optimize` de
  glTF-Transform.
- **Duración preservada**: el keyframe final se reinyecta después de
  `resample`. Sin ese paso, `Abuela` pasaba de 4,000 s a 2,458 s y `Mummy` de
  3,958 s a 1,000 s, lo que rompería loops y esperas de ataque.
- **Backups en `world/source/`**: reutiliza la convención de `SPEC-009` y
  `sourceGlbPath()`. Los verificadores que necesiten leer `POSITION` siguen
  teniendo el original.
- **Nombres preservados con `dedup({ keepUniqueNames: true })`**: el `dedup`
  por defecto ignora el nombre al comparar materiales y fusionó dos materiales
  de `Hombre.glb` y uno de `NPC_Nina.glb`. Con `keepUniqueNames` se mantienen
  todos los nombres sin perder el ahorro de los accessors duplicados.
- **Manifiesto explícito**: no se comprime por patrón `*.glb`. Así un archivo
  nuevo (o `Scarecrow.glb`, que es fuente de Blender) no entra por accidente.
- **Decodificador local**: `asset('draco/')` sirve `static/draco/`, que ya
  existe. No se usa el CDN de Google para evitar una dependencia de red y
  facilitar el deploy relativo.
- **`useGltf` con opciones**: se pasa `dracoLoader` en cada carga. Aunque la
  precarga ya configure el loader y `useGltf` comparta caché, no se depende de
  ese orden: una carga directa sin precarga también debe funcionar.
- **Componentes generados**: `Hero.svelte` y `MummyModel.svelte` vienen de
  `@threlte/gltf`. El parche de Draco es pequeño y se documenta; si se
  regeneran, el verificador obliga a volver a aplicarlo.
- **Por qué no KTX2/WebP**: estos GLB no tienen `images`; todo el peso es
  geometría + animación. La compresión de texturas no aplica.
- **Por qué no gltfpack/meshopt**: requeriría otro decodificador en runtime y
  cambiar el pipeline de `@threlte/extras`; Draco ya está integrado y el
  decodificador local ya se sirve.
- **`Scarecrow.glb` no se toca**: no lo carga el frontend y es entrada del
  build de Blender. Comprimirlo puede romper `build_barnsiege.py`.
- **`Shopkeeper`/`TouristGuide`**: se incluyen para que todo personaje de
  `static/` quede igual; si se confirma que son basura, se retiran en otra
  tarea junto con las copias.

## 12. Progreso

| Fecha      | Estado      | Nota                                                                                                                                                                                                                                                                                                                            |
| ---------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-12 | borrador    | Spec creado. Línea base medida: 21 personajes, 30,00 MB. Draco directo −21,1 %; con pre-paso + duraciones preservadas −69,8 % (9,05 MB). Pendiente de aprobación e implementación.                                                                                                                                              |
| 2026-11-12 | en-progreso | Implementado y comprimido: 30,00 MB → 9,05 MB (−69,8 %), mayor archivo 489 364 B. `characters:check` OK; `npcs:check` OK; `check`, `lint` y `build` OK; decodificación real con NodeIO OK; idempotencia, determinismo y rollback probados con `Hero.glb`. Pendiente la verificación visual en navegador (CA-8 a CA-11 y CA-15). |
| 2026-11-13 | en-progreso | Reexport de los 19 rigs con `*_dance`: 33,12 MB → 10,41 MB (−68,6 %), presupuesto total a 12 MiB. `characters:check` y `npcs:check` OK. Añadidos `assets.json`, `assets:compress` y `assets:check`; proyecto completo 96,65 MB → 26,51 MB (−72,6 %). |

## 13. Changelog

- 2026-11-12 — Creación del spec: manifiesto de 21 personajes, compresor
  Draco con pre-paso de animación, preservación de duraciones, registro del
  decodificador en `SkinCharacter`, `NpcCharacter` y `MummyModel`, y verificador
  `characters:check`.
- 2026-11-12 — Implementación: manifiesto `world/characters.json`, scripts
  `characters:compress`/`characters:check`, helpers `createDracoIO()` e
  `isDracoGlb()` en `world-lib.mjs`, `dedup({ keepUniqueNames: true })` para
  conservar nombres de materiales, decodificador local en los tres loaders,
  tamaños de `gameAssets` actualizados y 21 originales en `world/source/`.
  Compresión final: 30,00 MB → 9,05 MB (−69,8 %).
- 2026-11-13 — **Reexport con baile y compresión del resto de assets**:
  - Los 19 rigs de `personajes.blend` se reexportaron con el nuevo clip
    `<PREFIX>_dance`; los humanos comparten `HR_dance` y el resto usa su
    prefijo (`WH_dance`, `DM_dance`, …).
  - `world/characters.json` se actualizó (bytes, SHA-256, clips, nodos,
    mallas y materiales) y el presupuesto total sube a 12 MiB para absorber
    los ~1,4 MB de animación extra. Resultado: 33,12 MB → 10,41 MB (−68,6 %).
  - Se añadió `world/assets.json` + `assets:compress`/`assets:check` para
    armas, vehículos, props y mapas. Todos los loaders usan ya
    `useDraco(asset('draco/'))`; total del proyecto 93,54 MB → 25,15 MB
    (−73,1 %). `Scarecrow.glb` y `_unused/` siguen excluidos.
