---
id: SPEC-007
titulo: "Rigs, idle y animaciones de los 11 monstruos y el jugador"
estado: completado
prioridad: alta
creado: 2026-10-30
actualizado: 2026-11-03
responsable: opencode
etiquetas: [blender, rigging, animacion, personajes, gltf]
depende_de: []
bloquea: []
estimacion: "8h"
---

# SPEC-007 — Rigs, idle y animaciones de los 11 monstruos y el jugador

## 1. Contexto

La escena de Blender contiene 11 personajes low-poly de Halloween, cada uno en su propia colección `*_LowPoly` y bajo un empty que hace de raíz:

| Empty / colección | Mallas |
| ----------------- | ------ |
| `Witch` | `WH_Arms`, `WH_Body`, `WH_Broom`, `WH_Cat`, `WH_Hair`, `WH_Hat`, `WH_Head`, `WH_Legs` |
| `Demon` | `DM_Arms`, `DM_Body`, `DM_Head`, `DM_Legs`, `DM_Pet` |
| `Frankenstein` | `FR_Arms`, `FR_Body`, `FR_Head`, `FR_Legs`, `FR_Pet` |
| `Ghost` | `GH_Arms`, `GH_Body`, `GH_Pet` |
| `Golem` | `GO_Arms`, `GO_Body`, `GO_Head`, `GO_Legs`, `GO_Pet` |
| `Mummy` | `MU_Arms`, `MU_Body`, `MU_Head`, `MU_Legs`, `MU_Pet` |
| `PumpkinKing` | `PK_Arms`, `PK_Body`, `PK_Head`, `PK_Legs`, `PK_Pet` |
| `Skeleton` | `SK_Arms`, `SK_Body`, `SK_Head`, `SK_Legs`, `SK_Pet` |
| `Vampire` | `VA_Arms`, `VA_Body`, `VA_Head`, `VA_Legs`, `VA_Pet` |
| `Scarecrow` | `SC_Arms`, `SC_Body`, `SC_Crow`, `SC_Hat`, `SC_Head`, `SC_Post` |
| `Scarecrow_Feet` | `SF_Arms`, `SF_Body`, `SF_Crow`, `SF_Feet`, `SF_Hat`, `SF_Head`, `SF_Post` |

Antes de esta tarea solo la Witch tenía rig. El resto de personajes eran mallas sueltas parentadas al empty, sin esqueleto, sin pesos y sin ninguna animación. Golem tenía los brazos caídos y Mummy los brazos al frente; el resto ya estaban en T-pose.

El jugador del frontend (`frontend/src/lib/components/player/Player.svelte`) sigue siendo un `InstancedSprite` (billboard 2D), así que estos personajes 3D todavía no se renderizan en el juego. El objetivo de esta tarea es dejar los assets listos para una futura pipeline **Blender → glTF/GLB → `AnimationMixer` de Three.js** en Threlte.

Stack del repo: frontend SvelteKit 3 + Svelte 5 + Threlte + Three.js + Rapier; backend ElysiaJS + Bun.

## 2. Objetivo

Los 11 personajes deben tener un rig humanoide con el mismo esquema de huesos, pesos sin vértices huérfanos y una acción `idle` en bucle, de modo que cualquiera pueda exportarse a glTF y animarse sin retocar el rig.

## 3. Alcance

**Incluye**

- Rig de los 10 personajes que no lo tenían, con el mismo esquema que `Witch_Rig`.
- Normalización a T-pose de Golem y Mummy (geometría + huesos de brazo).
- Pesos por malla y validación de reposo.
- Acción `idle` por personaje, con bucle perfecto.
- Guardado de la escena en `blender/halloween-characters.blend`.
- Plan de animaciones futuras (walk, run, jump, etc.) documentado, sin implementar.

**No incluye**

- Exportación a glTF/GLB.
- Integración en Threlte (loader, `AnimationMixer`, máquina de estados).
- Animaciones distintas de `idle`.
- Renders o capturas.
- Cambios en el frontend o el backend.

> **Nota de alcance:** el spec se amplió después con el set completo de clips
> (`walk`, `run`, `sit`, `jump`, `pickup`, `attack`, `shoot`, `hit`, `death`),
> con la calibración del pickup (ver §14), con el clip `carry` de portar arma
> (§17), con el clip `throw` de lanzar una granada (§18) y con el clip `aim`
> de apuntar con el arma (§19). La lista anterior describe el alcance inicial.

## 4. Requisitos

### Funcionales

| ID   | Requisito | Prioridad |
| ---- | --------- | --------- |
| RF-1 | Cada personaje tiene un armature `<Personaje>_Rig` en su colección, hijo de su empty, con el esquema `root → hips → spine → chest → neck → head`. | alta |
| RF-2 | Los brazos usan `shoulder → upper_arm → forearm → hand` (`.L`/`.R`) y las piernas `thigh → shin → foot` (`.L`/`.R`) donde exista malla de piernas. | alta |
| RF-3 | Las mascotas y props (broom, cat, post, crow) están pesados a un hueso del rig (propio o `root`/`head`) y se mueven con él. | alta |
| RF-4 | Todas las mallas tienen Armature modifier apuntando a su rig y están parentadas al rig conservando su transformación mundial. | alta |
| RF-5 | Ningún vértice queda sin peso y en reposo la malla no se deforma. | alta |
| RF-6 | Golem y Mummy quedan en T-pose real, con sus huesos de brazo reajustados al nuevo eje. | alta |
| RF-7 | Cada rig tiene una acción `idle` en bucle de 60 frames con respiración sutil y brazos bajados. | alta |
| RF-8 | El frame 1 y el frame 61 del `idle` son idénticos (bucle sin salto). | alta |

### No funcionales

| ID    | Requisito | Criterio |
| ----- | --------- | -------- |
| RNF-1 | Reposo sin deformación | Desviación máxima ≤ 1e-5 unidades entre malla evaluada y malla original. |
| RNF-2 | Sin vértices huérfanos | 0 vértices con suma de pesos ≤ 1e-6 en las 59 mallas. |
| RNF-3 | Idle sutil | Desplazamiento máximo de vértices ≤ 2.0 unidades y error de bucle ≤ 1e-9. |
| RNF-4 | Nombres estables | Huesos con nombres fijos y sin sufijos `.001`; acciones con prefijo de personaje. |
| RNF-5 | Escena reproducible | El `.blend` guardado contiene los 11 rigs, los 11 `idle` y los backups de T-pose. |

## 5. Criterios de aceptación

- [x] CA-1: Existen 11 armatures `<Personaje>_Rig`, cada uno en su colección y con su empty como padre.
- [x] CA-2: Los 11 rigs comparten el esquema de huesos (22 en Witch, 21 en humanoides, 15 en Ghost, 14 en Scarecrow, 20 en Scarecrow_Feet).
- [x] CA-3: Las 59 mallas están parentadas al rig y tienen Armature modifier.
- [x] CA-4: 0 vértices sin peso en las 59 mallas.
- [x] CA-5: Desviación máxima en reposo ≤ 3.82e-6.
- [x] CA-6: Golem y Mummy están en T-pose y sus huesos de brazo apuntan a ±X.
- [x] CA-7: Los 11 rigs tienen acción `<PREFIJO>_idle` con `use_fake_user`, `clip="idle"` y `loop=True`.
- [x] CA-8: En los 11 `idle`, el error de bucle entre frame 1 y 61 es ≤ 1.5e-17 (0 en la práctica).
- [x] CA-9: La escena está guardada en `blender/halloween-characters.blend`.

## 6. Archivos relevantes

| Ruta | Acción | Motivo |
| ---- | ------ | ------ |
| `blender/halloween-characters.blend` | crear | Escena con los 11 rigs, pesos, `idle` y backups de T-pose. |
| `blender/scripts/build_animations.py` | crear | Genera el set de clips por personaje (idle ya existente + walk/run/sit/jump/pickup/attack/shoot/hit/death) y calibra el pickup. |
| `blender/scripts/build_player.py` | crear | Construye el jugador `PL`: rig de 20 huesos, malla base y outfits M/F. |
| `blender/scripts/list_animations.py` | crear | Lista las acciones por personaje y regenera el text datablock `LISTA_ANIMACIONES`. |
| `blender/scripts/export_gltf.py` | crear | Exporta personaje(s) a GLB con todos sus clips usando pistas NLA temporales. |
| `specs/SPEC-007-rigs-idle-personajes.md` | crear | Este spec. |
| `frontend/src/lib/components/player/Player.svelte` | sin cambios | El jugador actual es un sprite; se usa solo como referencia de la integración futura. |
| `frontend/package.json` | sin cambios | Confirma el stack Threlte/Three/Rapier para la futura integración. |

## 7. Plan de implementación

### Fase 1 — Análisis de la escena

- [x] Paso 1: Inventariar empties, colecciones, mallas y bounding boxes de los 11 personajes.
- [x] Paso 2: Detectar la pose de brazos de cada personaje (T-pose, brazos caídos o al frente).
- [x] Paso 3: Analizar las islas de geometría de brazos y piernas para elegir la estrategia de pesos.

### Fase 2 — T-pose de Golem y Mummy

- [x] Paso 1: Guardar las coordenadas originales de `GO_Arms` y `MU_Arms` en los text datablocks `GO_Arms_TPOSE_BACKUP` y `MU_Arms_TPOSE_BACKUP`.
- [x] Paso 2: Rotar cada brazo con el arco más corto desde la dirección hombro→mano hasta ±X, alrededor del pivote del hombro.
- [x] Paso 3: Reajustar `upper_arm`, `forearm` y `hand` al nuevo eje ±X con cortes al 45 % y 72 % de la longitud.
- [x] Paso 4: Reasignar pesos de brazo por isla según la posición sobre el nuevo eje.

### Fase 3 — Rigs de los 10 personajes restantes

- [x] Paso 1: Crear el armature y los huesos del torso a partir del alto real del cuerpo.
- [x] Paso 2: Crear brazos y piernas a partir de la geometría real, con rolls alineados.
- [x] Paso 3: Crear el hueso `pet` y los huesos de props (`broom`, `cat`); `post` y `crow` se pesan a `root` y `head`.
- [x] Paso 4: Parentar las mallas al rig y añadir el Armature modifier.

### Fase 4 — Pesos

- [x] Paso 1: Cuerpo con mezcla suave por altura (`hips → spine → chest → neck`).
- [x] Paso 2: Cabeza, pelo y sombrero rígidos a `head`.
- [x] Paso 3: Brazos por isla a lo largo del eje del brazo (umbrales 0.45 y 0.70).
- [x] Paso 4: Piernas por isla; si una isla abarca toda la pierna, reparto por vértice con bandas de rodilla y tobillo.
- [x] Paso 5: Mascotas y props rígidos a su hueso.

### Fase 5 — Validación del reposo

- [x] Paso 1: Comprobar que no hay vértices sin peso.
- [x] Paso 2: Comparar malla evaluada contra malla original en reposo.
- [x] Paso 3: Probar rotaciones de huesos de brazo, mano, pierna y comprobar que la malla se mueve.

### Fase 6 — Animación idle

- [x] Paso 1: Definir la pose base del idle (brazos bajados, ligera flexión de codo).
- [x] Paso 2: Añadir respiración (spine, chest, neck, head) y vaivén de brazos con 5 claves (1, 16, 31, 46, 61).
- [x] Paso 3: Añadir vaivén de mascota y flotación del Ghost.
- [x] Paso 4: Convertir rotaciones de espacio mundo al espacio local de cada hueso.
- [x] Paso 5: Marcar las acciones con `use_fake_user`, `clip="idle"` y `loop=True`.
- [x] Paso 6: Validar bucle y desplazamiento.

### Fase 7 — Guardado y documentación

- [x] Paso 1: Guardar la escena en `blender/halloween-characters.blend` sin dependencias externas.
- [x] Paso 2: Escribir este spec con resultados y plan futuro.

### Fase 8 — Set completo de animaciones (ampliación)

- [x] Paso 1: Generar `walk`, `run`, `sit`, `jump`, `pickup`, `attack`, `shoot`, `hit` y `death` desde `blender/scripts/build_animations.py`.
- [x] Paso 2: Apoyar los pies en `z=0` evaluando la malla deformada en cada clave y entre claves; el Ghost flota y el Scarecrow clavado no camina.
- [x] Paso 3: Anclar mascotas y props a su hueso para que no se hundan al bajar la raíz.
- [x] Paso 4: Calibrar el pickup por personaje: profundidad de agachado y pitch de brazo para que la malla de la mano derecha toque el suelo.
- [x] Paso 5: Verificar que el apoyo de pies no levanta el rig por culpa del sombrero/pelo y que la mascota del Demon no se atraviesa.
- [x] Paso 6: Guardar la escena con las 95 acciones y el idle asignado en cada rig.

## 8. Verificación

No hay cambios de código en frontend ni backend, así que no aplica `bun run check`. La verificación se hace en Blender con el add-on MCP:

```python
import bpy

# 1. Reposo sin deformación
rig = bpy.data.objects["Demon_Rig"]
act = rig.animation_data.action
rig.animation_data.action = None
for pb in rig.pose.bones:
    pb.rotation_quaternion = (1, 0, 0, 0)
    pb.location = (0, 0, 0)
    pb.scale = (1, 1, 1)
bpy.context.view_layer.update()

ob = bpy.data.objects["DM_Body"]
dg = bpy.context.evaluated_depsgraph_get()
ev = ob.evaluated_get(dg)
me = ev.to_mesh()
dev = max(((ev.matrix_world @ v.co) - (ob.matrix_world @ ob.data.vertices[i].co)).length
          for i, v in enumerate(me.vertices))
ev.to_mesh_clear()
rig.animation_data.action = act
assert dev < 1e-5, dev

# 2. Bucle del idle
bpy.context.scene.frame_set(1)
m1 = {pb.name: pb.matrix.copy() for pb in rig.pose.bones}
bpy.context.scene.frame_set(61)
loop_dev = max(abs(m1[pb.name][i][j] - pb.matrix[i][j])
               for pb in rig.pose.bones for i in range(4) for j in range(4))
assert loop_dev < 1e-9, loop_dev

# 3. Sin vértices huérfanos
for ob in rig.children:
    assert not [v for v in ob.data.vertices if sum(g.weight for g in v.groups) <= 1e-6]
```

Casos manuales:

1. Abrir `blender/halloween-characters.blend` y comprobar que cada colección `*_LowPoly` contiene su empty, su rig y sus mallas.
2. Seleccionar un rig, entrar en Pose Mode y reproducir la acción `<PREFIJO>_idle` (frames 1–61).
3. Comprobar que los brazos están bajados y que el movimiento es sutil, sin saltos entre el frame 61 y el 1.
4. Mover un hueso de brazo y confirmar que la malla de brazo responde.

Resultados obtenidos:

| Comprobación | Resultado |
| ------------ | --------- |
| Rigs creados | 11/11 |
| Mallas parentadas con Armature modifier | 59/59 |
| Vértices sin peso | 0 |
| Desviación máxima en reposo | 3.82e-6 |
| Acciones `idle` | 11/11 |
| Error de bucle (frame 1 vs 61) | ≤ 1.5e-17 en los 11 |
| Desplazamiento máximo del idle | 0.44–1.93 según personaje |
| Acciones totales en la escena | 95 (11 `idle` + 84 clips) |
| Bucles de `walk` y `run` | error 0 en los 11 rigs |
| Pickup: altura mínima de la mano | 0.002–0.030 en los 10 personajes con pickup |

## 9. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
| ------ | ------- | ---------- |
| Las piernas de `SF_Feet` son una sola caja por pierna; al doblar la rodilla la caja se cizalla. | Medio | Se reparte el peso por vértice para que la rodilla doble, pero la geometría no tiene loop cut. Añadir un corte a media pierna si se anima caminar/correr. |
| En el pickup, un agachado profundo puede hundir el sombrero/pelo y hacer que el apoyo de pies levante todo el rig (la mano deja de tocar el suelo). | Medio | La calibración mide la malla de la mano, no el hueso, y descarta poses donde otra parte del cuerpo queda por debajo de `z=0`. Además el `head_pitch` del pickup es 0 para no clavar el sombrero. |
| Ghost y Scarecrow no tienen piernas, así que los clips con tracks de `thigh/shin/foot` no aplican. | Medio | Usar un subconjunto reducido de animaciones o añadir huesos de pierna antes de retargetear. |
| El mismo clip en distintos rigs puede dar poses distintas si cambian los rolls o la pose de reposo. | Alto | Todos los rigs están en T-pose y con rolls alineados; aun así, validar con retarget antes de producir walk/run. |
| Nombres de acción únicos en Blender (`WH_idle`, `DM_idle`, …) frente a un nombre de clip compartido (`idle`). | Bajo | Cada acción lleva la propiedad personalizada `clip="idle"`; el export debe usar esa propiedad o renombrar el clip en el GLB. |
| Golem y Mummy se re-posaron rotando la geometría rígidamente; los backups están en text datablocks. | Bajo | `GO_Arms_TPOSE_BACKUP` y `MU_Arms_TPOSE_BACKUP` permiten revertir. |
| La escena estaba sin guardar y todo el trabajo vivía en memoria. | Alto | Guardada en `blender/halloween-characters.blend` sin dependencias externas. |

## 10. Preguntas abiertas

- [x] ¿Exportar un GLB por personaje (malla + esqueleto + clips) o un `animations.glb` separado solo con clips?
  De momento no se exporta ningún GLB: la malla, el esqueleto y los clips se quedan en el `.blend`. La exportación se decidirá al integrar Threlte.
- [x] ¿Retarget en runtime con `SkeletonUtils.retargetClip` o bake por personaje en Blender?
  Bake por personaje en Blender (ya implementado). El retarget en runtime queda como opción si se añaden clips externos.
- [x] ¿Añadir huesos de pierna a Ghost y Scarecrow para poder compartir todo el set de clips?
  No: el Ghost flota y no tiene pies; el Scarecrow está clavado en un poste y solo usa `attack`, `hit` y `death`.
- [x] ¿Añadir un loop cut a media pierna en `SF_Feet` para que la rodilla doble limpio?
  Sí, pendiente. El pickup ya estira la rodilla solo ~8.5 %, pero un loop cut mejorará walk/run.
- [x] ¿Se usan clips de Mixamo como base para walk/run/attack o se animan a mano?
  Los clips actuales están animados a mano en Blender. Mixamo queda como referencia/opción para pulir walk y run. Set objetivo: idle, walk, run, sit, jump, pickup, attack, shoot (solo Witch y PumpkinKing) e hit/death.

## 11. Decisiones y notas

- **Esquema de huesos**: `root → hips → spine → chest → neck → head`; `chest → shoulder → upper_arm → forearm → hand` (`.L`/`.R`); `hips → thigh → shin → foot` (`.L`/`.R`); `root → pet`; props aparte.
- **Convención de lados**: los personajes miran hacia −Y, así que la izquierda del personaje es +X y `.L` corresponde a `x > 0`.
- **Cortes de brazo**: `upper_arm` 0–45 %, `forearm` 45–72 %, `hand` 72–100 %. Pesos por isla con umbrales 0.45 y 0.70.
- **Piernas**: peso por isla; si la isla ocupa más del 40 % del alto de la pierna, se reparte por vértice con bandas de 5 % en rodilla y tobillo.
- **T-pose**: solo Golem (brazos caídos) y Mummy (brazos al frente) necesitaban corrección. Witch ya se corrigió antes y su backup es `WH_Arms_TPOSE_BACKUP`.
- **Rotación de T-pose**: arco más corto desde la dirección hombro→mano hasta ±X, alrededor del pivote del hombro. Golem 67.99°, Mummy 80.34°.
- **Idle**: 60 frames (1–61) a 24 fps = 2.5 s. La T-pose es solo pose de reposo; el idle baja los brazos (25–62° según personaje) y añade respiración y vaivén.
- **Sin traslación de root en personajes con pies**: evita que los pies atraviesen el suelo. Solo el Ghost flota (bob de 6 cm).
- **Demon**: baja los brazos solo 40° (el resto, 55–62°) y los adelanta 8° para que la mano no atraviese su mascota, que está a su lado.
- **Pickup**: la pose profunda combina agachado y estiramiento del brazo derecho. La calibración busca por bisección la profundidad mínima a la que la mano llega a `z≈0.03` y después afina el pitch del brazo. Se mide la **malla** de la mano (`hand.R` con peso > 0.5), no el extremo del hueso, porque la geometría sobresale del hueso.
- **Pickup sin atravesar el suelo**: se descartan las poses donde la mano o cualquier otra malla del cuerpo baja de `z=0`; así el apoyo automático de pies no levanta el rig entero. El `head_pitch` del pickup es 0 para que el sombrero de la Witch no toque el suelo.
- **Pickup por personaje**: los de brazos largos (Golem, Frankenstein, Vampire, Mummy) apenas se agachan (`depth` negativo o cercano a 0); los de brazos cortos (Witch, Scarecrow_Feet) se agachan más. El Scarecrow clavado no tiene clip de pickup.
- **Clips**: `walk`, `run`, `sit`, `jump`, `pickup`, `attack`, `shoot` (solo Witch y PumpkinKing), `hit` y `death`; `sit` no aplica a Ghost y Scarecrow; Scarecrow solo tiene `attack`, `hit` y `death`.
- **Suelo**: en cada clave se apoya la malla de piernas en `z=0`; después se muestrea frame a frame todo el cuerpo (sin props) y se sube la raíz solo si algo atraviesa el suelo. El Ghost flota (`root_z` entre 0.08 y 0.75 según clip) y no usa apoyo.
- **Props**: mascotas, escoba y gato se anclan a su posición de reposo en cada frame para que no se hundan cuando la raíz baja (sit, death, pickup).
- **Nombres**: acciones `<PREFIJO>_idle` (`WH_idle`, `DM_idle`, …) con `clip="idle"` y `loop=True` como propiedades personalizadas.
- **Backups**: coordenadas originales de brazos en text datablocks para poder revertir la T-pose.

## 12. Progreso

| Fecha | Estado | Nota |
| ----- | ------ | ---- |
| 2026-10-30 | en-progreso | Análisis de los 11 personajes y T-pose de Golem y Mummy. |
| 2026-10-30 | en-progreso | Rigs, pesos y validación de reposo de los 10 personajes restantes. |
| 2026-10-30 | en-progreso | Acción `idle` creada y validada en los 11 rigs. |
| 2026-10-30 | completado | Escena guardada en `blender/halloween-characters.blend` y spec actualizado. |
| 2026-10-30 | completado | Set de 84 clips (walk/run/sit/jump/pickup/attack/shoot/hit/death) generado y validado. |
| 2026-10-30 | completado | Pickup recalibrado por personaje; la mano derecha toca el suelo con los pies apoyados. |
| 2026-10-30 | completado | Jugador `PL` añadido con malla base + outfits M/F y sus 10 clips. |

## 13. Changelog

- 2026-10-30 — Creación del spec.
- 2026-10-30 — T-pose de Golem y Mummy con backup y reajuste de huesos de brazo.
- 2026-10-30 — 10 rigs nuevos con esquema común, pesos y validación sin vértices huérfanos.
- 2026-10-30 — `idle` de 60 frames en los 11 rigs con bucle exacto.
- 2026-10-30 — Vaivén de brazos recalculado en espacio mundo; Demon ajustado para no atravesar su mascota.
- 2026-10-30 — Escena guardada en `blender/halloween-characters.blend`.
- 2026-10-30 — Set completo de animaciones generado desde `blender/scripts/build_animations.py` (95 acciones).
- 2026-10-30 — Pickup con calibración por personaje: profundidad de agachado + pitch de brazo medidos sobre la malla de la mano; sombrero y pies protegidos.
- 2026-10-30 — Demon sin atravesar su mascota (distancia mínima mano-mascota 1.56 en pickup); rodilla de `SF_Feet` con estiramiento máximo 8.5 %.
- 2026-10-30 — Escena guardada con el idle asignado en los 11 rigs y frame 1.
- 2026-10-30 — `LISTA_ANIMACIONES` (text datablock) y `blender/scripts/list_animations.py` para ver la lista desde Blender.
- 2026-10-30 — `blender/scripts/export_gltf.py`: exportación NLA verificada (Witch 10 clips/1 skin; los 11 95 clips/11 skins, cada clip atado a su personaje) con clips empezando en `t=0`.
- 2026-10-30 — Jugador `PL`: malla base chunky + outfits M/F, rig de 20 huesos y 10 clips; pickup con mano a 0.030, pies a 0 y bucles exactos.
- 2026-10-30 — `list_animations.py` y `export_gltf.py` incluyen `Player_Rig`; export de los 12 personajes = 105 clips/12 skins.
- 2026-11-03 — Clip `<PREFIJO>_carry` de portar arma añadido a los 11 monstruos con `build_carry_animations.py`; bucle exacto y pies apoyados. Ver §17.
- 2026-11-03 — Clip `<PREFIJO>_throw` de lanzar granada añadido a los 11 monstruos con `build_throw_animations.py`; arco sobre la cabeza y retorno al idle. Ver §18.
- 2026-11-03 — Clip `<PREFIJO>_aim` de apuntar con el arma añadido a los 11 monstruos con `build_aim_animations.py`; bucle exacto y respiración sutil. Ver §19.

## 14. Ampliación — set de animaciones y calibración del pickup

### 14.1 Clips por personaje

| Personaje | `idle` | `walk` | `run` | `sit` | `jump` | `pickup` | `attack` | `shoot` | `hit` | `death` |
| --------- | :----: | :----: | :---: | :---: | :----: | :------: | :------: | :-----: | :---: | :-----: |
| Witch | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Demon | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| Frankenstein | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| Ghost | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| Golem | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| Mummy | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| PumpkinKing | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Scarecrow | ✓ | — | — | — | — | — | ✓ | — | ✓ | ✓ |
| Scarecrow_Feet | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| Skeleton | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| Vampire | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| Player | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Total: 105 acciones (12 `idle` + 93 clips). `walk` y `run` son bucles de 24 y 16
frames; `idle` de 60. El resto son clips de una pasada.

### 14.2 Calibración del pickup

El clip `pickup` tiene dos parámetros por personaje:

- `pickup_depth` ∈ [−1, 1]: profundidad del agachado (piernas y torso).
- `pickup_x`: pitch del brazo derecho en grados.

La calibración busca por bisección la profundidad mínima a la que la mano
derecha puede bajar a `z≈0.03`, y luego afina el pitch. Se mide la **malla**
pesada a `hand.R`, no el extremo del hueso. Se descartan las poses en las que
la mano u otra parte del cuerpo atraviesa el suelo, porque el apoyo de pies
levantaría el rig entero.

| Personaje | `depth` | `pickup_x` | Mano min `z` | Pies min `z` |
| --------- | ------: | ---------: | -----------: | -----------: |
| Witch | 0.219 | −69° | 0.030 | 0 |
| Demon | −0.828 | −75° | 0.030 | 0 |
| Frankenstein | −1.000 | −41° | 0.022 | 0 |
| Ghost | −1.000 | −87° | 0.110¹ | — |
| Golem | −1.000 | −41° | 0.002 | 0 |
| Mummy | −0.516 | −69° | 0.029 | 0 |
| PumpkinKing | −0.195 | −93° | 0.030 | 0 |
| Scarecrow_Feet | 0.539 | −101° | 0.028 | 0 |
| Skeleton | −0.641 | −73° | 0.030 | 0 |
| Vampire | −0.406 | −83° | 0.029 | 0 |

¹ El Ghost flota 0.08, así que su mano queda a 0.11 del suelo. El Scarecrow
clavado no tiene clip de pickup.

Comprobaciones adicionales:

- La mascota del Demon no se atraviesa en `pickup`: distancia mínima
  mano-mascota 1.56.
- La rodilla de `SF_Feet` en `pickup` estira como máximo 8.5 % (ratio 1.085).
- `body_min_z` en todos los pickups es ≥ 0: los pies quedan apoyados y el
  sombrero/pelo no obliga a levantar la raíz.

### 14.3 Verificación del pickup

```python
import bpy
from mathutils import Vector

rig = bpy.data.objects["Witch_Rig"]
act = bpy.data.actions["WH_pickup"]
rig.animation_data.action = act
if act.slots:
    rig.animation_data.action_slot = act.slots[0]

lo = 1e9
for f in range(int(act.frame_start), int(act.frame_end) + 1):
    bpy.context.scene.frame_set(f)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    for ob in rig.children:
        vg = ob.vertex_groups.get("hand.R")
        if vg is None:
            continue
        idx = [v.index for v in ob.data.vertices
               if any(g.group == vg.index and g.weight > 0.5 for g in v.groups)]
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        for i in idx:
            lo = min(lo, (ev.matrix_world @ me.vertices[i].co).z)
        ev.to_mesh_clear()
assert lo < 0.05, lo  # la mano llega al suelo
```

Resultado: `lo ≈ 0.030` para la Witch y entre 0.002 y 0.030 en los 10
personajes con pickup.


## 15. Exportación a glTF/GLB para Three.js

El script `blender/scripts/export_gltf.py` exporta malla + esqueleto + clips.
No sustituye a la integración en Threlte (fuera de alcance), pero deja el GLB
listo para cargarlo.

```python
import sys
sys.path.append("/ruta/al/proyecto/blender/scripts")
import export_gltf

export_gltf.export_character("Witch_Rig", "/tmp/witch.glb")   # 10 clips, 1 skin
export_gltf.export_all("/tmp/characters.glb")                  # 95 clips, 11 skins
export_gltf.export_each("/tmp/glb")                            # un GLB por personaje
```

### 15.1 Por qué NLA y no `ACTIONS`

Los 11 rigs comparten los mismos nombres de hueso, y el modo `ACTIONS` busca
acciones por nombre de hueso. Resultado medido:

| Exportación | Ajustes | Clips | Problema |
| ----------- | ------- | ----: | -------- |
| Witch sola | `ACTIONS`, `export_anim_single_armature=True` (defecto) | 95 | Todas las acciones atadas al skin de la Witch |
| Witch sola | `ACTIONS`, `export_anim_single_armature=False` | 1 | Solo la acción activa |
| 11 personajes | `ACTIONS`, `export_anim_single_armature=True` | 9 | Solo la acción activa de cada rig |
| Witch sola | `NLA_TRACKS` + pistas temporales | 10 | Correcto: solo `WH_*` |
| 11 personajes | `NLA_TRACKS` + pistas temporales | 95 | Correcto: cada clip atado a su skin |

El script crea una pista NLA por acción (`track.name = action.name`), exporta,
borra las pistas y vuelve a asignar el `idle` en frame 1. La escena queda igual
que antes de exportar.

### 15.2 Tiempos y bucles

Se exporta con `export_anim_slide_to_zero=True`. Sin ese flag cada clip empieza
en `t = 1/24 s` y dura un frame de más, lo que descuadra los bucles:

| Clip | Sin slide | Con slide |
| ---- | --------- | --------- |
| `idle` | 0.0417 → 2.5417 | 0 → 2.500 |
| `walk` | 0.0417 → 1.0417 | 0 → 1.000 |
| `run` | 0.0417 → 0.7083 | 0 → 0.667 |

El GLB **no** guarda el bucle ni las propiedades `clip`/`loop`/`fps`: los objetos
`animations` solo tienen `channels`, `name` y `samplers`. En Three.js hay que
marcar `THREE.LoopRepeat` para `idle`, `walk` y `run`, y `THREE.LoopOnce` con
`clampWhenFinished` para el resto. Los nombres de clip llevan prefijo de
personaje (`WH_idle`, `DM_walk`, ...).

### 15.3 Exportar cada personaje (paso a paso)

1. Abrir `blender/halloween-characters.blend`.
2. Comprobar que cada rig tiene su `idle` asignado y que la escena está en frame 1
   (el script lo restaura al terminar, pero conviene partir de ahí).
3. Text Editor → Open → `blender/scripts/export_gltf.py` → Run Script (Alt+P).
   `main()` llama a `export_each()` y escribe un GLB por personaje en
   `blender/exports/`.
4. Alternativa por consola de Python, un solo personaje:

   ```python
   import sys
   sys.path.append("/home/vital/Desktop/runworld/game1/blender/scripts")
   import export_gltf
   export_gltf.export_character("Witch_Rig", "/home/vital/Desktop/runworld/game1/blender/exports/Witch.glb")
   ```

5. El nombre del archivo sale de quitar `_Rig` al rig: `Witch.glb`,
   `Scarecrow_Feet.glb`, `PumpkinKing.glb`, etc.

El script devuelve la lista de clips escritos, así que se puede comprobar sin
abrir el GLB:

```python
clips = export_gltf.export_character("Witch_Rig", "/tmp/witch.glb")
assert len(clips) == 10 and all(c.startswith("WH_") for c in clips)
```

### 15.4 Clips y archivo por personaje

| Personaje | Prefijo | Archivo | Clips | Nº |
| --------- | :-----: | ------- | ----- | -: |
| Witch | `WH` | `Witch.glb` | idle, walk, run, sit, jump, pickup, attack, shoot, hit, death | 10 |
| Demon | `DM` | `Demon.glb` | idle, walk, run, sit, jump, pickup, attack, hit, death | 9 |
| Frankenstein | `FR` | `Frankenstein.glb` | idle, walk, run, sit, jump, pickup, attack, hit, death | 9 |
| Ghost | `GH` | `Ghost.glb` | idle, walk, run, jump, pickup, attack, hit, death | 8 |
| Golem | `GO` | `Golem.glb` | idle, walk, run, sit, jump, pickup, attack, hit, death | 9 |
| Mummy | `MU` | `Mummy.glb` | idle, walk, run, sit, jump, pickup, attack, hit, death | 9 |
| PumpkinKing | `PK` | `PumpkinKing.glb` | idle, walk, run, sit, jump, pickup, attack, shoot, hit, death | 10 |
| Scarecrow | `SC` | `Scarecrow.glb` | idle, attack, hit, death | 4 |
| Scarecrow_Feet | `SF` | `Scarecrow_Feet.glb` | idle, walk, run, sit, jump, pickup, attack, hit, death | 9 |
| Skeleton | `SK` | `Skeleton.glb` | idle, walk, run, sit, jump, pickup, attack, hit, death | 9 |
| Vampire | `VA` | `Vampire.glb` | idle, walk, run, sit, jump, pickup, attack, hit, death | 9 |
| Player | `PL` | `Player.glb` | idle, walk, run, sit, jump, pickup, attack, shoot, hit, death | 10 |

Total: 105 clips. Los casos especiales (`shoot` solo Witch/PumpkinKing/Player,
`sit` fuera de Ghost/Scarecrow, Scarecrow sin locomoción) están en §14.1.

### 15.5 Duraciones y bucle

| Clip | Frames | Duración | Bucle |
| ---- | -----: | -------: | :---: |
| idle | 1–61 | 2.500 s | sí |
| walk | 1–25 | 1.000 s | sí |
| run | 1–17 | 0.667 s | sí |
| sit | 1–37 | 1.500 s | no |
| jump | 1–31 | 1.250 s | no |
| pickup | 1–37 | 1.500 s | no |
| attack | 1–25 | 1.000 s | no |
| shoot | 1–25 | 1.000 s | no |
| hit | 1–19 | 0.750 s | no |
| death | 1–49 | 2.000 s | no |

### 15.6 Cargar en Three.js

```js
const LOOPING = new Set(['idle', 'walk', 'run']);

const clip = THREE.AnimationClip.findByName(gltf.animations, `${prefix}_${name}`);
if (!clip) throw new Error(`Falta el clip ${prefix}_${name}`);

const action = mixer.clipAction(clip);
if (LOOPING.has(name)) {
  action.setLoop(THREE.LoopRepeat, Infinity);
} else {
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
}
action.reset().play();
```

- `prefix` es el de la tabla §15.4 (`WH`, `DM`, …); `name` es `idle`, `walk`, etc.
- Para cambiar de clip: `action.fadeOut(0.2)` y `nueva.reset().fadeIn(0.2).play()`.
- `death` y `hit` necesitan `LoopOnce` + `clampWhenFinished` para no volver al
  primer frame.

### 15.7 Checklist antes de exportar

- [ ] Cada rig tiene su `<PREFIJO>_idle` asignado y `frame_current == 1`.
- [ ] No hay pistas NLA permanentes en los rigs (el script solo crea temporales).
- [ ] Las 105 acciones tienen `use_fake_user=True`.
- [ ] El `.blend` está guardado antes de exportar (el export no lo modifica, pero
      deja la escena igual).
- [ ] Tras exportar, comprobar que el número de clips coincide con §15.4 y que
      todos llevan el prefijo del personaje.

## 16. Jugador humano (`PL`)

El jugador es el humano que escapa de los monstruos. Se añadió después de los
11 monstruos, al final de la fila de personajes, y comparte su esquema de
huesos y su set de clips para que sirva de base a la partida.

### 16.1 Escena y rig

- Colección `Player_LowPoly`, empty raíz `Player` en `(61.4, −8.3, 0)`.
- Rig `Player_Rig` con 20 huesos: `root → hips → spine → chest → neck → head`,
  `chest → shoulder → upper_arm → forearm → hand` (`.L`/`.R`) y
  `hips → thigh → shin → foot` (`.L`/`.R`).
- Reposo en T (brazos a lo largo de ±X), mira hacia −Y y su izquierda es +X.
  Así las poses de `build_animations.py` se aplican sin retarget.
- Alturas: 1.60 m total, cabeza 1.06–1.52, torso 0.70–1.09, hombros 0.97,
  cadera 0.60, rodilla 0.32 y tobillo 0.10.

### 16.2 Estilo y geometría

Proporciones "chunky" de juguete, como la referencia: cabeza grande (≈3.3
cabezas de alto), cuerpo corto, manos y pies grandes y colores planos.

- Secciones **superelípticas** (`power=4` en cabeza/torso y `3.5` en
  extremidades) para conseguir cajas redondeadas en vez de cilindros.
- Manos, pies, zapatillas, pelo y mochila son cajas biseladas.
- Cara: ojos grandes oscuros con brillo blanco, cejas finas, nariz redondeada
  y boca pequeña.

### 16.3 Malla base y ropa intercambiable

`PL_Body` es la malla base común (piel). La ropa son mallas aparte, pesadas al
mismo rig, que se muestran u ocultan para cambiar de outfit:

| Malla | Hombre (`M`) | Mujer (`F`) |
| ----- | ------------ | ----------- |
| `PL_Shirt_M` / `PL_Shirt_F` | sudadera naranja con capucha | chaqueta teal con cinturón |
| `PL_Pants_M` / `PL_Pants_F` | vaqueros azules | pantalón morado |
| `PL_Hair_M` / `PL_Hair_F` | pelo corto castaño | melena castaña |
| `PL_Shoes` | zapatillas blancas | zapatillas blancas |
| `PL_Backpack` | mochila verde (opcional) | — |

```python
import build_player
build_player.set_outfit("M")      # o "F" / "both"
build_player.set_backpack(True)   # False para quitarla
```

El rig guarda `rig["outfit"]` con el valor activo. En el `.blend` el jugador se
guarda con el outfit `M` y la mochila puesta.

### 16.4 Clips

Los 10 clips estándar, generados con el mismo `build_animations.py`:

| Clip | Frames | Duración | Bucle |
| ---- | -----: | -------: | :---: |
| idle | 1–61 | 2.500 s | sí |
| walk | 1–25 | 1.000 s | sí |
| run | 1–17 | 0.667 s | sí |
| sit | 1–37 | 1.500 s | no |
| jump | 1–31 | 1.250 s | no |
| pickup | 1–37 | 1.500 s | no |
| attack | 1–25 | 1.000 s | no |
| shoot | 1–25 | 1.000 s | no |
| hit | 1–19 | 0.750 s | no |
| death | 1–49 | 2.000 s | no |

`PL_idle` es una copia de `WH_idle` sin las fcurves de props (gato, escoba) y
con la raíz corregida frame a frame para que los pies queden en `z=0`.

### 16.5 Verificación

```python
# mano derecha y cuerpo en PL_pickup
hand_min_z ≈ 0.0301   # la mano llega al suelo
body_min_z = 0        # ninguna malla atraviesa el suelo

# PL_idle: los pies no flotan ni se hunden
min_z = 0 en todos los frames

# bucles exactos
PL_idle = PL_walk = PL_run = 0
```

- 10 acciones `PL_*` (1 `idle` + 9 clips), todas con `use_fake_user=True` y
  propiedades `clip`, `loop`, `fps` y `frames`.
- El jugador queda con `PL_idle` asignado y `frame_current == 1` al guardar.

### 16.6 Exportación

`export_gltf.py` incluye `Player_Rig: "PL"` en `PREFIX`:

```python
export_gltf.export_character("Player_Rig", "/tmp/player.glb")
# 10 clips, 1 skin, 20 joints

export_gltf.export_all("/tmp/characters.glb")
# 105 clips, 12 skins
```

El exportador solo incluye las mallas **visibles**: para exportar el outfit
femenino hay que llamar antes a `build_player.set_outfit("F")` (y
`set_backpack(False)` si no se quiere la mochila). Las mallas ocultas no se
seleccionan y no llegan al GLB.

### 16.7 Reconstruir el jugador

`build_player.main()` borra las acciones `PL_*`; después hay que regenerarlas:

```python
import build_player, build_animations
build_player.main()
build_animations.main(only=["Player_Rig"])
```

El text datablock `LISTA_ANIMACIONES` incluye al jugador y se regenera con
`blender/scripts/list_animations.py`.

## 17. Clip `carry` (portar arma)

Ninguno de los 11 monstruos tenía un clip de portar armas: sus acciones eran
`idle`, `walk`, `run`, `sit`, `jump`, `pickup`, `attack`, `shoot`, `hit` y
`death`. Se añadió una acción `<PREFIJO>_carry` por rig con el script
`blender/scripts/build_carry_animations.py`.

- 60 frames (0–60) a 24 fps; bucle perfecto (error 0 entre el frame 0 y el 60).
- Parte de la pose `idle` de cada personaje. Los brazos se resuelven con un IK
  analítico de dos huesos usando el ancho de hombros del rig, así que la pose
  escala con cada personaje y funciona tanto en A-pose como en T-pose.
- Mano izquierda adelantada y alta (apoyo) y mano derecha baja y atrás
  (empuñadura), con respiración y vaivén sutiles.
- Props anclados a su posición de reposo; pies en `z=0` (el Ghost flota 0.10).
- La acción lleva `use_fake_user`, las propiedades `clip="carry"`,
  `loop=True`, `fps=24`, `frames="0-60"` y una pista NLA `<PREFIJO>_carry` con
  influencia 0, igual que el resto de clips.

Validación en el frame 30 de los 11 clips:

| Comprobación | Resultado |
| ------------ | --------- |
| Acciones `carry` creadas | 11/11 |
| Error de bucle frame 0 ↔ 60 | 0 en los 11 rigs |
| Pies en el suelo (`min_z`) | 0 en los 10 rigs con pies; Ghost 0.1008 (flota) |
| Distancia entre puños | 0.34–1.25 m según el tamaño del personaje |
| Acciones totales de la escena | 113 (102 previas + 11 `carry`) |

### 17.1 Regenerar

```python
exec(open("blender/scripts/build_carry_animations.py").read())
```

El script es idempotente: borra y recrea `<PREFIJO>_carry` y su pista NLA, sin
tocar el resto de acciones. `build_animations.py` conserva `<PREFIJO>_carry` en
`remove_old_actions()`, así que regenerar el set base no borra el clip.

El clip se generó y guardó en `blender/halloween-characters-carry.blend` (escena
de los 11 rigs, 113 acciones). Para llevarlo al `.blend` principal hay que abrir
`halloween-characters.blend` y ejecutar el mismo script; después basta con
exportar con `export_gltf.py`, que ya reconoce el patrón `<PREFIJO>_[a-z]+`.

## 18. Clip `throw` (lanzar granada)

Tampoco existía un clip de lanzamiento. Se añadió `<PREFIJO>_throw` a los 11
monstruos con `blender/scripts/build_throw_animations.py`, reutilizando el IK
de dos huesos del clip `carry`.

- 36 frames (0–36) a 24 fps = 1.5 s. **No es un bucle**: el frame 0 y el 36 son
  la pose de `idle` exacta para poder entrar y salir con un fundido.
- Fases: 0–8 anticipación, 8–12 armado con la mano derecha detrás de la cabeza,
  13 paso del brazo por encima de la cabeza, 12–15 lanzamiento, 15–19
  seguimiento cruzando el cuerpo, 19–36 recuperación.
- El torso gira y se inclina (spine, chest y head) y la mano izquierda acompaña
  el gesto; los objetivos de las muñecas se escalan con el ancho de hombros.
- Los frames se generan uno a uno interpolando las claves con suavizado
  (smoothstep) para que el brazo describa un arco y no atraviese la cabeza.
- Props anclados a su posición de reposo. Los pies no se mueven: el `min_z`
  coincide con el del `idle` (0 en la mayoría; Ghost 0.1008 por flotar;
  Skeleton 0.02 ya en su idle).
- Acción con `use_fake_user`, `clip="throw"`, `loop=False`, `fps=24`,
  `frames="0-36"` y pista NLA `<PREFIJO>_throw` con influencia 0.

Validación:

| Comprobación | Resultado |
| ------------ | --------- |
| Acciones `throw` creadas | 11/11 |
| Diferencia frame 0 ↔ idle (huesos humanoides) | ≤ 2.1e-5 |
| Pies (`min_z`) | Igual que el idle en los 11 rigs |
| Trayectoria mano derecha | detrás de la cabeza (f12) → encima (f13) → adelante (f15) → abajo (f19) |
| Acciones totales de la escena | 124 (113 + 11 `throw`) |

### 18.1 Regenerar

```python
exec(open("blender/scripts/build_throw_animations.py").read())
```

Es idempotente: borra y recrea `<PREFIJO>_throw` y su pista NLA. Tanto
`build_carry_animations.py` como `build_throw_animations.py` pueden ejecutarse
en cualquier orden, y `build_animations.py` conserva ambos clips.

Los clips `carry` y `throw` están en
`blender/halloween-characters-carry.blend`, que ahora tiene 124 acciones. Para
pasarlos al `.blend` principal hay que abrir `halloween-characters.blend` y
ejecutar los dos scripts.

## 19. Clip `aim` (apuntar con el arma)

Tampoco existía un clip de apuntado. Se añadió `<PREFIJO>_aim` a los 11
monstruos con `blender/scripts/build_aim_animations.py`, reutilizando el IK
analítico de dos huesos de `carry` y `throw`.

- 60 frames (0–60) a 24 fps = 2.5 s. **Es un bucle exacto**: el frame 0 y el 60
  coinciden, y la respiración (0,3° en el torso y 0,5 % en las muñecas) vuelve
  al punto de partida.
- Pose de arma encarada: la mano derecha queda en la empuñadura, junto al pecho
  y por debajo del hombro; la mano izquierda se extiende hacia delante
  sujetando el guardamanos, ligeramente más baja. La silueta lee como un arma
  de dos manos, no como las manos juntas al pecho.
- Los objetivos de las muñecas se escalan de forma mixta: el adelanto de la
  mano izquierda en fracción del **largo del brazo** (para que los rigs de
  brazos cortos como Witch o Hero también extiendan) y la mano derecha en
  fracción del **ancho de hombros** (para que se quede al pecho incluso en
  Demon, Ghost o Golem, que tienen brazos muy largos).
- Torso con un giro leve (`spine −4°, chest −8°, head +6°`) y una inclinación
  mínima; los codos apuntan hacia fuera y abajo.
- Props anclados a su posición de reposo; los pies no se mueven, así que el
  `min_z` es idéntico al del `idle` (Skeleton 0.02 ya en su idle; Ghost 0.1008
  por flotar).
- Acción con `use_fake_user`, `clip="aim"`, `loop=True`, `fps=24`,
  `frames="0-60"` y pista NLA `<PREFIJO>_aim` con influencia 0.

Validación:

| Comprobación | Resultado |
| ------------ | --------- |
| Acciones `aim` creadas | 11/11 |
| Diferencia frame 0 ↔ frame 60 | 0.0 en los 11 rigs |
| Pies (`min_z`) | Igual que el idle en los 11 rigs |
| Separación de manos en profundidad | mano izquierda claramente adelantada en los 11 rigs |
| Acciones totales de la escena | 135 (124 + 11 `aim`) |

### 19.1 Regenerar

```python
exec(open("blender/scripts/build_aim_animations.py").read())
```

Es idempotente: borra y recrea `<PREFIJO>_aim` y su pista NLA. Los tres scripts
de clips (`build_carry_animations.py`, `build_throw_animations.py` y
`build_aim_animations.py`) pueden ejecutarse en cualquier orden;
`build_animations.py` conserva los tres clips al regenerar el set base.

Los clips `carry`, `throw` y `aim` están en
`blender/halloween-characters-carry.blend`, que ahora tiene 135 acciones. Para
pasarlos al `.blend` principal hay que abrir `halloween-characters.blend` y
ejecutar los tres scripts.
