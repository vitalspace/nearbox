---
id: SPEC-008
titulo: "Escenas de área generadas desde el contorno real (area1–area4)"
estado: hecho
prioridad: alta
creado: 2026-10-30
actualizado: 2026-10-30
responsable: opencode
etiquetas: [blender, escenario, low-poly, halloween, area1, area2, area3, area4, contorno, valla]
depende_de: []
bloquea: []
estimacion: "6h (4/4 áreas hechas)"
---

# SPEC-008 — Escenas de área generadas desde el contorno real (area1–area4)

## 1. Contexto

La escena `blender/halloween-characters.blend` contiene los 11 monstruos, el
jugador `PL` y el árbol central `BigTree`, además de la malla `area1`, que es
el terreno donde va la primera zona jugable.

`area1` **no es un círculo**: es un polígono irregular de 12 vértices y una sola
cara ngon, a `z = 0.4`, con centroide en `(-33.053, 33.053)` y área de
`2293.7 m²`. El orden de la cara es
`[0, 2, 3, 4, 5, 10, 9, 8, 6, 7, 11, 1]`.

Un primer intento construyó la casa sobre un disco de suelo propio y una valla
circular. El usuario lo rechazó: la valla no seguía el contorno y se estaba
inventando un suelo en vez de usar `area1`. Este spec documenta la corrección:
toda la escena se genera a partir del polígono real de `area1`.

Quedan las cuatro áreas cubiertas. Ya existían las cuatro mallas en el
`.blend`: `area2` (noreste), `area3` (suroeste) y `area4` (sureste) son
variantes congruentes de `area1` (12 vértices, 2293.7 m², `z = 0.4`), con
centroides en `(±33.053, ±33.053)`. Cada una tiene tema propio: `area1` casa de
bruja, `area2` castillo de Drácula, `area3` calabazar embrujado y `area4`
cementerio maldito.

Stack: frontend SvelteKit 3 + Svelte 5 + Threlte + Rapier; backend ElysiaJS +
Bun. Esta tarea es solo de assets en Blender; no toca frontend ni backend.

## 2. Objetivo

Cada `areaN` queda decorada con una escena low-poly de Halloween apoyada en su
propia superficie, con la casa centrada en el centroide del polígono y la valla
siguiendo su contorno real, sin geometría fuera del área.

## 3. Alcance

**Incluye**

- Escena completa de la zona 1 sobre `area1` (casa, valla, patio, cementerio,
  decoración).
- Escena completa de la zona 2 sobre `area2` (castillo de Drácula, valla, patio,
  cementerio, decoración).
- Escena completa de la zona 3 sobre `area3` (calabazar embrujado: granja,
  granero, silo, calabaza gigante, campos, espantapájaros).
- Escena completa de la zona 4 sobre `area4` (cementerio maldito: capilla con
  campanario, mausoleo, lápidas, obeliscos, fantasmas).
- Scripts reejecutables `build_witch_house.py`, `build_dracula_castle.py`,
  `build_pumpkin_farm.py` y `build_cursed_cemetery.py`, sobre la base común
  `halloween_lib.py`.
- Murciélagos animados: un objeto por murciélago en cada área
  (`<PREFIX>_Bat_NN`) y en el árbol central (`TREE_Bat_01..09`), con ciclo de
  vuelo, aleteo por *shape keys* y péndulo para los colgados.
- Valla generada desde el *loop* real de vértices de `areaN`.
- Verificación numérica de contención (0 vértices fuera del polígono).

**No incluye**

- Modelar las mallas `area2`–`area4` (las aportó el usuario).
- Integración en Threlte, colisiones, navmesh o *spawn points*.
- Exportación a glTF/GLB.
- Cambios en frontend o backend.

## 4. Requisitos

### Funcionales

| ID    | Requisito | Prioridad |
| ----- | --------- | --------- |
| RF-1 | La escena se apoya en la malla `area1` existente; no se crea ningún disco, base ni parche de suelo propio. | alta |
| RF-2 | El root de la escena se coloca en el **centroide del polígono** de `areaN`, no en el centro del *bounding box*. | alta |
| RF-3 | La valla recorre el contorno real de `areaN` (todos sus vértices y aristas), incluidos entrantes y biseles. | alta |
| RF-4 | La puerta se coloca en el lado largo del sur, con antorchas, calabazas-linterna en los postes y camino de piedras hasta el porche. | alta |
| RF-5 | La casa queda centrada en el área y ninguna pieza invade la valla. | alta |
| RF-6 | El script es idempotente: `clean()` borra la colección anterior y reconstruye sin duplicados. | alta |
| RF-7 | Todo el contenido vive bajo un empty raíz y una colección propios (`WitchHouse` / `WHH_*`). | media |
| RF-8 | El script lee la geometría de `areaN` en tiempo de ejecución; cambiar la malla y reejecutar recoloca la escena. | alta |
| RF-9 | El procedimiento es reutilizable para `area2`–`area4` cambiando solo el objeto de área, el prefijo y el tema. | alta |
| RF-10 | Cada área tiene tema, paleta y valla propios: casa de bruja, castillo, calabazar y cementerio. | media |
| RF-11 | El suelo es el polígono real de `areaN`, con material temático propio; no queda ninguna superficie con el material por defecto. | alta |

### No funcionales

| ID     | Requisito | Criterio |
| ------ | --------- | -------- |
| RNF-1 | Contención total | 0 vértices de la escena fuera del polígono de `areaN` (ray casting en XY). |
| RNF-2 | Estilo | Low-poly, colores planos, ≤ 40k triángulos por área. |
| RNF-3 | Altura | Todo apoya en la superficie del área (`z` del área = 0 local). |
| RNF-4 | Reproducibilidad | El `.blend` guardado contiene la escena; reejecutar el script da el mismo resultado. |
| RNF-5 | Nombres estables | Objetos `WHH_<Pieza>`, materiales `WHH_<Color>`, sin sufijos `.001`. |
| RNF-6 | Sin dependencias externas | Solo `bpy`, `bmesh`, `mathutils`, `math`, `random`. |

## 5. Criterios de aceptación

- [x] CA-1: Existe la colección `WitchHouse` con empty raíz `WitchHouse` en el centroide `(-33.053, 33.053, 0.4)`.
- [x] CA-2: La escena tiene 19 mallas `WHH_*` (18 piezas + cartel) y 31 158 triángulos.
- [x] CA-3: La valla sigue el polígono de 12 vértices, no un círculo.
- [x] CA-4: 0 vértices de `WitchHouse` quedan fuera de `area1`.
- [x] CA-5: La línea de valla queda a 0.5–1.0 m por dentro del borde; las hojas abiertas de la puerta llegan hasta ~2.9 m hacia dentro.
- [x] CA-6: La puerta está en la arista sur (longitud 44.05 m), centrada en local `(0, -23.655)` / mundo `(-33.053, 9.398)`.
- [x] CA-7: Hay camino de piedras desde la puerta hasta el porche y antorchas a ambos lados.
- [x] CA-8: Reejecutar `main()` no duplica objetos ni materiales.
- [x] CA-9: `area2` tiene su escena (castillo de Drácula) con el mismo procedimiento y 0 vértices fuera.
- [x] CA-10: `area3` tiene su escena (calabazar embrujado) con el mismo procedimiento, 38 265 triángulos y 0 vértices fuera.
- [x] CA-11: `area4` tiene su escena (cementerio maldito) con el mismo procedimiento, 28 948 triángulos y 0 vértices fuera.
- [x] CA-12: Las cuatro escenas están guardadas en `blender/halloween-characters.blend` (`is_dirty = False`).
- [x] CA-13: `area1`–`area4` y el terreno base `Circle` tienen material de suelo temático; la malla de cada área sigue siendo un único ngon de 12 vértices (0 triángulos añadidos).
- [x] CA-14: Las cuatro áreas suman 57 murciélagos animados (`WHH_Bat_*`, `DRC_Bat_*`, `PFM_Bat_*`, `CCC_Bat_*`), cada uno con acción `<nombre>_Fly`, claves de forma `FlapUp`/`FlapDown` y ciclo exacto de 96 frames a 24 fps.
- [x] CA-15: El árbol central tiene 9 murciélagos animados bajo `TREE_Bats` (`TREE_Bat_01..09`, 996 vértices y 1 584 triángulos): 6 vuelan con `<nombre>_Fly` y 3 se mecen con `<nombre>_Swing`; el bucle también coincide en los frames 1 y 97.

## 6. Archivos relevantes

| Ruta | Acción | Motivo |
| ---- | ------ | ------ |
| `blender/scripts/build_witch_house.py` | crear (hecho) | Genera casa, valla por contorno y decoración; idempotente. |
| `blender/scripts/build_dracula_castle.py` | crear (hecho) | Genera el castillo de Drácula sobre `area2` con el mismo procedimiento. |
| `blender/scripts/halloween_lib.py` | crear (hecho) | Helpers compartidos: `MB`, primitivas, `Palette`, `area_info`, vallas, puertas, cartel. |
| `blender/scripts/build_pumpkin_farm.py` | crear (hecho) | Genera el calabazar embrujado sobre `area3`. |
| `blender/scripts/build_cursed_cemetery.py` | crear (hecho) | Genera el cementerio maldito sobre `area4`. |
| `blender/scripts/build_area_grounds.py` | crear (hecho) | Asigna el material de suelo temático a `area1`–`area4` y a `Circle`; idempotente. |
| `blender/halloween-characters.blend` | modificar (hecho) | Contiene `area1`–`area4`, `WitchHouse`, `DraculaCastle`, `PumpkinFarm` y `CursedCemetery`; guardado. |
| `blender/scripts/build_tree.py` | modificar (hecho) | Árbol central y murciélagos animados `TREE_Bat_01..09` bajo `TREE_Bats`; `bats_main()` rehece solo los murciélagos. |
| `blender/scripts/build_bats_life.py` | crear (hecho) | Reconstruye solo los murciélagos animados de `area1`–`area4` sin tocar el resto de cada escena. |
| `specs/SPEC-008-escenas-de-area-por-contorno.md` | crear (hecho) | Este spec. |
| `specs/TEMPLATE.md` | sin cambios | Plantilla usada. |

## 7. Plan de implementación

### Fase 0 — Lectura del área (hecho)

- [x] Paso 1: Leer el *loop* de la cara de `area1` en coordenadas de mundo.
- [x] Paso 2: Calcular área y centroide con la fórmula del *shoelace*.
- [x] Paso 3: Comprobar que el polígono no se autointersecta (0 cruces).
- [x] Paso 4: Convertir los vértices a coordenadas locales respecto al centroide.

### Fase 1 — Casa y estructura (hecho)

- [x] Paso 1: Crear empty `WitchHouse` en el centroide y colección propia.
- [x] Paso 2: Construir casa de 2 pisos con desplazamiento, torre, tejado a dos aguas, chimenea con humo y porche.
- [x] Paso 3: Añadir ventanas emisivas, faroles, cartel "POCIONES" y puerta.
- [x] Paso 4: Emitir cada pieza como malla `WHH_<Pieza>` con `build_object()`.

### Fase 2 — Valla por contorno (hecho)

- [x] Paso 1: Escalar cada vértice del polígono hacia el centroide con `FENCE_INSET = 0.975`.
- [x] Paso 2: Poner un poste en cada vértice y postes intermedios cada ≤ 7 m en tiradas largas.
- [x] Paso 3: Rellenar con piquetes cada ~1 m y dos barandillas (z = 0.55 y 1.15).
- [x] Paso 4: Elegir la arista sur larga como puerta (`GATE_HALF = 1.9`) y dejar hueco en piquetes y barandillas.
- [x] Paso 5: Añadir hojas abiertas hacia dentro, postes de puerta, antorchas y calabazas-linterna.

### Fase 3 — Camino y decoración (hecho)

- [x] Paso 1: Trazar el camino de piedras desde la puerta al porche con vaivén sinusoidal.
- [x] Paso 2: Montar patio con mesas, estantería y botellas de pociones.
- [x] Paso 3: Caldero sobre trípode con brebaje emisivo y fogata.
- [x] Paso 4: Añadir cementerio, árboles muertos, calabazas, murciélagos, setas, telarañas, gato negro y cartel.

### Fase 4 — Verificación (hecho)

- [x] Paso 1: Comprobar contención de los 19 objetos con ray casting.
- [x] Paso 2: Medir distancia de la valla al borde del área.
- [x] Paso 3: Renderizar vistas 3/4, cenital, puerta, patio y tejado; revisar y borrar cámara/luces temporales.
- [x] Paso 4: Reejecutar el script y confirmar que no duplica nada.

### Fase 5 — Guardado (hecho)

- [x] Paso 1: Confirmar con el usuario que se puede guardar el `.blend`.
- [x] Paso 2: Guardar `blender/halloween-characters.blend` y verificar que `is_dirty` queda en `False`.

### Fase 6 — Réplica en area2, area3 y area4 (hecha)

- [x] Paso 1: Confirmar que existen las mallas `area2`–`area4` y leer su *loop*, área y centroide adaptando `area_polygon()` para recibir el nombre del objeto.
- [x] Paso 2: Parametrizar el script: `AREA_OBJECT`, `COLLECTION`, `PREFIX`, `EMPTY_NAME`, `BASE` y semilla `RND`.
- [x] Paso 3: Añadir offset real de polígono si el área no es estrellada respecto al centroide (ver §9); `area2` es variante rotada de `area1`, así que el inset por escala funciona.
- [x] Paso 4: Adaptar la detección de puerta si no hay arista sur válida (fallback: arista más larga). En `area2` la puerta cae en la arista 9 del contorno local.
- [x] Paso 5: Elegir tema por área (casa de bruja, castillo de Drácula, …) y prefijar materiales por área (`WHH_*` / `DRC_*`).
- [x] Paso 6: Ejecutar `area3`, verificar contención y guardar.
- [x] Paso 7: Ejecutar `area4`, verificar contención y guardar.
- [x] Paso 8: Extraer los helpers comunes a `halloween_lib.py` para que las cuatro escenas compartan el mismo procedimiento.

## 8. Verificación

No hay cambios en frontend ni backend; la verificación es en Blender con el
add-on MCP.

```python
import sys
import bpy
from mathutils import Vector

sys.path.append("/home/vital/Desktop/runworld/game1/blender/scripts")

area = bpy.data.objects["area1"]
poly = [area.matrix_world @ area.data.vertices[i].co
        for i in area.data.polygons[0].vertices]

def inside(x, y):
    res = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i].x, poly[i].y
        xj, yj = poly[j].x, poly[j].y
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            res = not res
        j = i
    return res

coll = bpy.data.collections["WitchHouse"]
outside = {
    o.name: sum(1 for v in o.data.vertices
                if not inside(*(o.matrix_world @ v.co).xy))
    for o in coll.objects if o.type == "MESH"
}
assert not any(outside.values()), outside   # CA-4

# distancia de la valla al borde
def edge_dist(p):
    best = 1e9
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        ab = Vector((b.x - a.x, b.y - a.y))
        t = max(0, min(1, Vector((p.x - a.x, p.y - a.y)).dot(ab) / ab.length_squared))
        best = min(best, (p - Vector((a.x + ab.x * t, a.y + ab.y * t, 0))).length)
    return best

fence = bpy.data.objects["WHH_Fence"]
d = [edge_dist(fence.matrix_world @ v.co) for v in fence.data.vertices]
assert 0.4 <= min(d) <= 1.1, min(d)                # CA-5

# idempotencia
import build_witch_house
n1 = len(bpy.data.collections["WitchHouse"].objects)
build_witch_house.main()
n2 = len(bpy.data.collections["WitchHouse"].objects)
assert n1 == n2, (n1, n2)                          # CA-8
```

Casos manuales:

1. Abrir el `.blend`, seleccionar `WitchHouse` y comprobar que el empty está en
   el centro del polígono, no del *bounding box*.
2. Vistas cenital: la valla debe copiar el contorno (incluido el bisel del
   sureste), no una circunferencia.
3. Acercarse a la puerta sur: hueco de 3.8 m, dos postes, antorchas y camino.
4. Comprobar que no hay suelo inventado bajo la casa: se ve la cara de `area1`.

Resultados obtenidos (area1):

| Comprobación | Resultado |
| ------------ | --------- |
| Centroide / root | `(-33.053, 33.053, 0.4)` |
| Área del polígono | `2293.7 m²` |
| Vértices del polígono | 12, sin autointersecciones |
| Objetos de malla | 19 |
| Triángulos | 31 158 |
| Materiales usados | 42 |
| Vértices fuera de `area1` | 0 |
| Distancia valla-borde | 0.5–1.0 m |
| Arista de puerta | índice 4, longitud 44.05 m |
| Centro de puerta | local `(0, -23.655)` / mundo `(-33.053, 9.398)` |

Resultados obtenidos (area2 — castillo de Drácula):

| Comprobación | Resultado |
| ------------ | --------- |
| Centroide / root | `(33.053, 33.053, 0.4)` |
| Área del polígono | `2293.7 m²` |
| Vértices del polígono | 12, sin autointersecciones |
| Objetos de malla | 12 (+ empty raíz) |
| Triángulos | 31 986 |
| Materiales usados | 23 |
| Vértices fuera de `area2` | 0 (tras `view_layer.update()`) |
| Distancia valla-borde (XY) | 0.049–1.088 m |
| Arista de puerta | índice 9, longitud 45.18 m |
| Centro de puerta | local `(0, -23.655)` / mundo `(33.053, 9.398)` |
| Altura de la aguja | ~23 m sobre el suelo |
| Triángulos por objeto | `Castle` 2748, `Windows` 5084, `Fence` 9600, `Gate` 1596, `Path` 432, `Courtyard` 2248, `Graveyard` 360, `DeadTrees` 2672, `Bats` 4464, `Pumpkins` 870, `Webs` 504, `SignText` 1408 |

Resultados obtenidos (area3 — calabazar embrujado):

| Comprobación | Resultado |
| ------------ | --------- |
| Centroide / root | `(-33.053, -33.053, 0.4)` |
| Área del polígono | `2293.7 m²` |
| Vértices del polígono | 12, sin autointersecciones |
| Objetos de malla | 14 (+ empty raíz) |
| Triángulos | 38 265 |
| Materiales usados | 28 |
| Vértices fuera de `area3` | 0 |
| Distancia valla-borde (XY) | 0.55–2.83 m (máx. en hojas abiertas y braseros) |
| Arista de puerta | índice 9, longitud 44.05 m |
| Centro de puerta | local `(0, 23.655)` / mundo `(-33.053, -9.398)` |
| Altura máxima | 15.4 m (silo / árboles) |
| Triángulos por objeto | `Fence` 12816, `Fields` 9474, `Bats` 2976, `Yard` 2774, `Trees` 2672, `SignText` 1524, `Scarecrows` 1170, `Path` 1040, `Farmhouse` 1006, `Gate` 756, `Webs` 672, `GiantPumpkin` 661, `Barn` 448, `Silo` 276 |

Resultados obtenidos (area4 — cementerio maldito):

| Comprobación | Resultado |
| ------------ | --------- |
| Centroide / root | `(33.053, -33.053, 0.4)` |
| Área del polígono | `2293.7 m²` |
| Vértices del polígono | 12, sin autointersecciones |
| Objetos de malla | 11 (+ empty raíz) |
| Triángulos | 28 948 |
| Materiales usados | 25 |
| Vértices fuera de `area4` | 0 |
| Distancia valla-borde (XY) | 0.41–3.53 m (mín. en el bisel del contorno, máx. en braseros) |
| Arista de puerta | índice 4, longitud 44.05 m |
| Centro de puerta | local `(0, 23.655)` / mundo `(33.053, -9.398)` |
| Altura máxima | 20.4 m (cruz de la aguja) |
| Triángulos por objeto | `Fence` 7896, `Bats` 3968, `Chapel` 3378, `Trees` 3340, `Graves` 2844, `Props` 2472, `Path` 1820, `SignText` 1412, `Gate` 956, `Webs` 504, `Mausoleum` 358 |

## 9. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
| ------ | ------- | ---------- |
| `area2`–`area4` pueden ser cóncavas o no estrelladas respecto al centroide; escalar los vértices hacia el centroide puede sacar la valla del área o cortar entrantes. | Alto | Implementar offset real por aristas (normales internas + unión de esquinas) y validar contención; usar la escala solo si el área es convexa/estrellada. |
| El criterio de puerta (arista sur con cambio de signo en X y longitud > 10 m) puede no existir en otra área. | Medio | Fallback a la arista más larga y, si sigue sin valir, parámetro manual `GATE_EDGE`. |
| Los materiales son globales `WHH_*`; cuatro áreas con temas distintos pueden colisionar. | Medio | Prefijar materiales y colecciones por área (`WH2_`, `WH3_`…) o compartir paleta conscientemente. |
| Reejecutar `main()` borra la colección `WitchHouse`; si el usuario editó a mano, se pierde. | Alto | Avisar antes de reejecutar; el script solo toca su propia colección, nunca `areaN` ni otras colecciones. |
| El script tiene un fallback circular de 24 lados si no encuentra `areaN`. | Medio | Quitar el fallback o hacerlo fallar con error explícito para no volver a generar un círculo por accidente. |
| La escena está en memoria sin guardar. | Alto | Guardar el `.blend` en cuanto el usuario lo confirme (Fase 5). |

## 10. Preguntas abiertas

- [x] ¿Dónde están/estarán las mallas `area2`, `area3` y `area4`? Ya existen las tres en el `.blend`.
- [x] ¿Cada área lleva el mismo tema (casa de bruja) o temas distintos? Temas distintos: `area1` casa de bruja, `area2` castillo de Drácula.
- [x] ¿`area3` y `area4` mantienen temas propios (mansión, calabazar, laboratorio…) o reutilizan los dos ya hechos? Temas propios: `area3` calabazar embrujado, `area4` cementerio maldito.
- [x] ¿Un único script parametrizado por área o un script por área? Un script por área con la misma base (`build_witch_house.py`, `build_dracula_castle.py`).
- [x] ¿La valla debe ir exactamente sobre el borde (`FENCE_INSET = 1.0`) o mantener 0.5–1 m de margen? Se mantiene 0.975 (0.05–1.09 m).
- [x] ¿Se puede guardar ya `blender/halloween-characters.blend` con las escenas de `area1` y `area2`? Sí; guardado con las cuatro áreas.
- [x] ¿Las áreas comparten materiales o cada una tiene su paleta? Cada área tiene prefijo propio: `WHH_*`, `DRC_*`, `PFM_*` y `CCC_*`.

## 11. Decisiones y notas

- **Centro del área**: centroide del polígono por *shoelace*, no centro del
  *bounding box*. Para `area1` la diferencia era de ~3.6 m y descentraba la casa.
- **Valla**: se recorre el *loop* de la cara, no la lista de vértices. El orden
  importa: `[0, 2, 3, 4, 5, 10, 9, 8, 6, 7, 11, 1]`.
- **Inset**: `p' = C + (p - C) * 0.975`. Deja la valla 0.5–1.0 m dentro, suficiente
  para que los piquetes (0.16 m de ancho) no sobresalgan.
- **Puerta**: primera arista con ambos extremos en `y < 0`, cambio de signo en
  `x` y longitud > 10 m. En `area1` es la arista 4 (44.05 m).
- **Hojas**: 1.7 m, abiertas 1.35 rad hacia dentro, ancladas a los postes.
- **Camino**: piedras de 7 lados cada 0.9 m desde `gate_y + 0.45` hasta
  `y = -9.7`, con vaivén `x = sin((y - gate_y) * 0.55) * 0.25`.
- **Suelo**: cero geometría de terreno. `z = 0` local equivale a la superficie
  de `area1` (`z = 0.4` mundo).
- **Escala**: la casa ocupa el centro; el resto de piezas se colocan en
  coordenadas locales para que mover el root mueva todo.
- **Idempotencia**: `clean()` elimina la colección `WitchHouse` y todos sus
  objetos antes de reconstruir; nunca toca `area1`.
- **Temporales**: las cámaras y luces de verificación se crean con prefijo `__`
  y se borran al terminar cada render.
- **Tema por área**: `area1` = casa de bruja (`WitchHouse`/`WHH_*`), `area2` =
  castillo de Drácula (`DraculaCastle`/`DRC_*`). Materiales y colecciones con
  prefijo propio para que no colisionen.
- **Contención del cartel**: `DRC_SignText` (1 424 vértices) es un objeto de
  texto convertido a malla; su matriz se calcula al actualizar el *view layer*,
  así que la comprobación debe hacerse **después** de
  `bpy.context.view_layer.update()`.
- **Librería compartida**: `halloween_lib.py` concentra `MB`, primitivas,
  `Palette`, `area_polygon`, `area_info`, `gate_geometry`, `scene_matrix`,
  `iron_fence`, `picket_fence`, `iron_gate`, `wooden_gate`, `sign_text` y los
  props comunes. Cada escena solo describe su tema.
- **Orientación de la escena**: la geometría se autora con el frente en `-y`;
  `scene_matrix()` la gira 180° cuando la puerta cae en `y > 0` (`area3`,
  `area4`), de modo que el frente siempre mira al árbol central.
- **Cartel de puerta**: se orienta con la normal exterior `n = normalize(gate)`
  y giro `atan2(n.x, -n.y)`; el texto se separa `0.14 m` hacia fuera para no
  quedar embebido en el tablón.
- **Decoración de puerta**: los faroles y braseros se colocan con
  `n_in = -normalize(gate_center)`; con el offset anterior (`+y`) 86 vértices
  del portón de `area4` quedaban fuera del polígono.
- **Temas elegidos**: `area3` (suroeste) calabazar embrujado con valla de
  estacas y paleta cálida; `area4` (sureste) cementerio maldito con valla de
  hierro y paleta fría, para que las cuatro áreas se distingan por silueta y
  color.
- **Rosetón de `area4`**: los pétalos se extruyen en el plano de la fachada
  (`ry - 0.10`) y los radios giran sobre `Y`; antes girábase sobre `Z` (barras
  verticales) y los pétalos quedaban dentro del muro.
- **Nombres de malla**: `build_object()` y `sign_text()` borran el *mesh*
  huérfano con el mismo nombre antes de crear el nuevo, para que no aparezcan
  sufijos `.001`–`.008` al reejecutar.
- **Suelo temático**: las mallas `area1`–`area4` no tenían material y se veían
  con el gris por defecto. `build_area_grounds.py` les asigna un Principled con
  color plano y `Roughness` 0.82–0.96: verde musgo (`GND_WitchForest`), piedra
  fría (`GND_CastleStone`), tierra de labor (`GND_FarmSoil`) y hierba de
  cementerio (`GND_Graveyard`). El terreno base `Circle` recibe `GND_World`.
- **Detalle sin geometría**: el color va plano en el Principled (exportable a
  glTF) y el relieve se consigue solo con un `Bump` procedural (noise en las
  áreas, Voronoi *distance to edge* en el castillo) conectado al Normal. No se
  añade un solo triángulo al suelo.
- **Escala del ruido**: coordenadas `Object` + nodo `Mapping` con la escala del
  objeto, porque `Circle` está escalado 80× y sus coordenadas locales son un
  disco unitario; sin ese ajuste el relieve salía estirado y plano.
- **Murciélagos animados**: un objeto por murciélago en lugar de una malla
  “bakeada” por área. El ciclo dura 4 s (96 frames a 24 fps) y el frame 1 y el
  97 coinciden exactamente; la interpolación es lineal. El aleteo usa dos
  *shape keys* (`FlapUp`/`FlapDown`) a 3 Hz. Las alas se localizan por material
  en las áreas (`bat_wing`); en el árbol comparten material con el cuerpo, así
  que `bat()` devuelve los índices de sus 14 vértices alares. Los murciélagos
  colgados del árbol usan el anclaje de la cuerda como origen y una acción
  `_Swing`; el resto usa `_Fly`. Los *loops* se comprobaron en los frames
  1/16/32/48/64/80/96 sin vértices fuera de cada área.

## 12. Progreso

| Fecha | Estado | Nota |
| ----- | ------ | ---- |
| 2026-10-30 | en-progreso | Primer intento con disco propio y valla circular; rechazado por el usuario. |
| 2026-10-30 | en-progreso | Lectura del polígono real de `area1` (12 vértices, área 2293.7 m²). |
| 2026-10-30 | en-progreso | Casa recentrada en el centroide y valla reconstruida sobre el contorno. |
| 2026-10-30 | en-progreso | 19 objetos, 31 158 tris, 0 vértices fuera de `area1`; renders verificados. |
| 2026-10-30 | en-progreso | Mallas `area2`–`area4` renombradas; `area2` construida como castillo de Drácula (12 objetos, 31 986 tris, 0 fuera). |
| 2026-10-30 | en-progreso | `halloween_lib.py` extraída; `area3` calabazar (14 objetos, 38 265 tris, 0 fuera) y `area4` cementerio (11 objetos, 28 948 tris, 0 fuera). |
| 2026-10-30 | hecho | Cuatro escenas verificadas, nombres sin sufijos y `.blend` guardado (`is_dirty = False`, 130 357 tris en total). |
| 2026-10-30 | hecho | Suelos temáticos aplicados a `area1`–`area4` y `Circle` (0 triángulos añadidos) y `.blend` guardado. |
| 2026-10-30 | hecho | Murciélagos de `area1`–`area4` animados (57 objetos: 11/18/12/16) con ciclo de 96 frames y aleteo por *shape keys*. |
| 2026-10-30 | hecho | Árbol central: `TREE_Decor_Bats` sustituido por 9 murciélagos animados bajo `TREE_Bats` (6 `_Fly` + 3 `_Swing`, 996 vértices y 1 584 triángulos); `.blend` guardado. |

## 13. Changelog

- 2026-10-30 — Creación del spec.
- 2026-10-30 — Documentado el rechazo del disco/valla circular y la corrección por contorno.
- 2026-10-30 — Registradas medidas de `area1`, conteo de objetos/triángulos y verificación de contención.
- 2026-10-30 — Añadido el plan de réplica para `area2`, `area3` y `area4`, con el riesgo del offset en polígonos cóncavos.
- 2026-10-30 — `area2` documentada (castillo de Drácula) y CA-9 marcado.
- 2026-10-30 — `area3` (calabazar) y `area4` (cementerio) construidas con `halloween_lib.py`; CA-10, CA-11 y CA-12 marcados.
- 2026-10-30 — Corregido el rosetón de la capilla, la orientación del cartel y los sufijos de malla; `.blend` guardado.
- 2026-10-30 — Suelo temático por área (`GND_*`) con color plano exportable y bump procedural; CA-13 marcado.
- 2026-10-30 — `area2` completada como castillo de Drácula: CA-9 marcado, medidas y reparto de triángulos registrados, preguntas abiertas resueltas.
- 2026-10-30 — Murciélagos de las cuatro áreas animados (un objeto por murciélago, vuelo y aleteo); CA-14 marcado.
- 2026-10-30 — Murciélagos del árbol central animados (`TREE_Bat_01..09`, vuelo/péndulo); CA-15 marcado y `.blend` guardado.
