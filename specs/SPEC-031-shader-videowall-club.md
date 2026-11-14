---
id: SPEC-031
titulo: "Shader musical y logo NEAR en DV_VideoWall del club"
estado: completado
prioridad: media
creado: 2026-11-12
actualizado: 2026-11-12
responsable: "OpenCode"
etiquetas: [shader, visuales, club, mapa]
depende_de: [SPEC-009, SPEC-024]
bloquea: []
estimacion: "3h"
---

# SPEC-031 — Shader musical y logo NEAR en DV_VideoWall del club

## 1. Contexto

El mapa principal (`frontend/static/map.glb`) incluye la zona del club con los meshes
`DV_*` (escenario, cabina de DJ, truss, pantalla). La pantalla del escenario es
`DV_VideoWall`: un cubo de 16 × 6 × 0.3 unidades centrado en `[0, 5, -20.22]`,
con material `DV_Screen` (azul emisivo plano).

`frontend/src/lib/components/world/Map.svelte` se genera automáticamente con
`@threlte/gltf`, por lo que editar ese archivo a mano se pierde en la siguiente
regeneración (`bun run map:build`). El render del mapa pasa por
`WorldMap.svelte`, que expone el grupo raíz del mapa.

El motor de audio procedural (SPEC-024) reproduce la música de fondo en el
bus `music` de `AudioEngine`, pero la pantalla no debe depender de ese audio:
su animación tiene que funcionar igual con el jukebox de SoundCloud o en silencio.

El usuario pidió que la pantalla del club parezca de música electrónica y aportó
el SVG del logo de NEAR para colocarlo en el centro.

## 2. Objetivo

Reemplazar en caliente el material de `DV_VideoWall` por un shader de pantalla de
música electrónica con un ecualizador, rejilla neón, barrido y pulso de kick, y
pintar el logo SVG de NEAR en el centro con un halo que late al ritmo. Todo sin
modificar el `Map.svelte` autogenerado y sin dependencias nuevas. La pantalla se
anima con un pulso sintético a 128 BPM y **no** reacciona al audio procedural.

## 3. Alcance

**Incluye**

- Componente `VideoWall.svelte` que localiza `DV_VideoWall` por nombre y sustituye su material.
- Shader `ShaderMaterial` (GLSL ES 1.0) con visuales de música electrónica.
- Rasterizado del SVG de NEAR a `CanvasTexture` y uso como máscara del logo central.
- Pulso sintético a 128 BPM para animar barras, kick y halo sin leer el audio.
- Restauración del material original y liberación de recursos al desmontar.

**No incluye**

- Cambios en `map.glb`, en `Map.svelte` ni en el pipeline de exportación.
- Iluminación dinámica real proyectada por la pantalla sobre el club.
- Nuevos sonidos, pistas o cambios en las recetas de audio.
- Edición del logo de NEAR desde la UI ni animaciones de texto.

## 4. Requisitos

### Funcionales

| ID   | Requisito                                                                                   | Prioridad |
| ---- | ------------------------------------------------------------------------------------------- | --------- |
| RF-1 | El shader se aplica a `DV_VideoWall` sin editar `Map.svelte`                                 | alta      |
| RF-2 | La pantalla muestra rejilla neón, ecualizador de 42 barras, barrido y pulso de kick          | alta      |
| RF-3 | La pantalla no lee ni reacciona al bus de audio procedural                              | alta      |
| RF-4 | La pantalla late con un pulso sintético a 128 BPM                                       | alta      |
| RF-5 | El SVG de NEAR aparece centrado con halo y responde al kick                                  | alta      |
| RF-6 | El componente solo se monta en la escena `map`                                               | media     |
| RF-7 | Al desmontar se restaura el material original y se liberan shader y textura                  | media     |

### No funcionales

| ID    | Requisito                                        | Criterio                                                        |
| ----- | ------------------------------------------------ | --------------------------------------------------------------- |
| RNF-1 | Sin dependencias nuevas                           | Solo `three` y APIs ya presentes en el proyecto                 |
| RNF-2 | Compatible con el renderer actual                | GLSL ES 1.0; `glslangValidator` sin errores                     |
| RNF-3 | Sin peticiones de red para el logo               | El SVG se rasteriza con `Path2D` en un canvas local             |
| RNF-4 | Coste contenido                                  | Un solo draw call extra de material; sin geometría adicional    |
| RNF-5 | Sin acoplamiento al audio                         | El shader no lee analizadores ni el bus `music`                 |

## 5. Criterios de aceptación

- [x] CA-1: En la escena `map`, `DV_VideoWall` usa el `ShaderMaterial` nuevo.
- [x] CA-2: La pantalla muestra ecualizador, rejilla y anillos animados con el tiempo.
- [x] CA-3: La pantalla no cambia con la música procedural del motor de audio.
- [x] CA-4: Las barras y el halo siguen un pulso sintético constante a 128 BPM.
- [x] CA-5: El logo de NEAR se ve centrado, nítido y con halo.
- [x] CA-6: `bun run check`, `bun run lint` y `bun run build` pasan.
- [x] CA-7: Al cambiar de escena no queda material ni textura huérfanos.

## 6. Archivos relevantes

| Ruta                                                       | Acción    | Motivo                                                        |
| ---------------------------------------------------------- | --------- | ------------------------------------------------------------- |
| `frontend/src/lib/components/world/VideoWall.svelte`       | crear     | Localiza el mesh, aplica el material y anima los uniforms      |
| `frontend/src/lib/components/world/videoWallShader.ts`     | crear     | Shaders GLSL y rasterizado del SVG a textura                   |
| `frontend/src/lib/components/world/WorldMap.svelte`        | modificar | Monta `VideoWall` solo cuando `mapId === 'map'`                |
| `frontend/src/lib/audio/engine.ts`                         | modificar | Retira el analizador de música y añade `setMusicDuck()`         |
| `frontend/static/map.glb`                                  | sin tocar | El mesh y sus transformaciones se reutilizan tal cual          |
| `specs/SPEC-031-shader-videowall-club.md`                  | crear     | Documentación de la tarea                                      |

## 7. Plan de implementación

### Fase 1 — Shader y logo

- [x] Paso 1: Crear `videoWallShader.ts` con vertex/fragment shader GLSL ES 1.0.
- [x] Paso 2: Rasterizar el path del SVG de NEAR a `CanvasTexture` con alfa.
- [x] Paso 3: Implementar rejilla, ecualizador, barrido, anillos, halo y viñeta.
- [x] Paso 4: Validar los shaders con `glslangValidator`.

### Fase 2 — Integración con el mapa

- [x] Paso 1: Crear `VideoWall.svelte` y buscar `DV_VideoWall` con `getObjectByName`.
- [x] Paso 2: Sustituir el material en caliente y calcular `uWallSize` desde el bounding box.
- [x] Paso 3: Montar el componente en `WorldMap.svelte` solo para `mapId === 'map'`.
- [x] Paso 4: Restaurar material y liberar recursos en `onDestroy`.

### Fase 3 — Pulso sintético

- [x] Paso 1: Animar barras, kick y halo con un reloj interno a 128 BPM.
- [x] Paso 2: No leer `AnalyserNode` ni el bus `music` desde la pantalla.
- [x] Paso 3: Eliminar `musicLevels()` y el analizador del `AudioEngine`.
- [x] Paso 4: Dejar `setMusicDuck()` para que el jukebox atenúe la música procedural.

### Fase 4 — Verificación

- [x] Paso 1: Ejecutar `bun run check`.
- [x] Paso 2: Ejecutar `bun run lint`.
- [x] Paso 3: Ejecutar `bun run build`.

## 8. Verificación

```bash
# Frontend
cd frontend && bun run check && bun run lint && bun run build

# Validación de shaders (opcional, herramienta del sistema)
glslangValidator -S vert /tmp/opencode/wall.vert
glslangValidator -S frag /tmp/opencode/wall.frag
```

Casos manuales:

1. Entrar a la escena `map` y mirar hacia el escenario del club (`z ≈ -20`).
2. Confirmar que la pantalla muestra rejilla, barras y anillos en movimiento.
3. Comprobar que la pantalla mantiene su pulso a 128 BPM aunque cambie la música procedural.
4. Verificar que el logo de NEAR queda centrado y legible desde la pista.
5. Cambiar a la cripta y volver: no debe haber errores ni pantalla negra.

## 9. Riesgos y mitigaciones

| Riesgo                                                        | Impacto | Mitigación                                                           |
| ------------------------------------------------------------- | ------- | -------------------------------------------------------------------- |
| Regenerar `Map.svelte` borra los cambios                      | alto    | No se edita: el material se sustituye en tiempo de ejecución          |
| El shader no compila en el renderer del juego                 | alto    | GLSL ES 1.0 validado con `glslangValidator`                          |
| El shader vuelve a depender del audio                          | medio   | La animación usa solo `elapsed`; no hay analizadores ni buses         |
| Coste del shader en móviles                                   | medio   | Sin bucles de geometría; 8 muestras de textura para el halo           |
| Orientación del logo por `flipY` de `CanvasTexture`           | bajo    | El logo de NEAR tiene simetría de 180°, el resultado es correcto      |
| El mesh no aparece al primer frame                            | bajo    | La búsqueda se reintenta cada frame hasta encontrarlo                 |

## 10. Preguntas abiertas

- [ ] ¿Se quiere que la pantalla ilumine físicamente el club con una luz dinámica?
- [ ] ¿Se reutilizará este shader en `DV_StageLED` o en futuras pantallas?

## 11. Decisiones y notas

- Se elige sustituir el material del mesh existente en vez de añadir un plano
  superpuesto: conserva la geometría, el frustum culling y los colliders.
- El logo se hornea en el fragment shader en lugar de ser un mesh aparte: así
  queda integrado con el brillo, el kick y la viñeta, sin z-fighting.
- El SVG se rasteriza con `Path2D` (sin cargar imágenes) para que funcione
  offline y dentro del iframe de RUN.world.
- La pantalla se desacopló por completo del audio procedural: el jukebox de
  SoundCloud (SPEC-032) puede sonar para todos sin que el shader reaccione.
  La animación usa un kick sintético a 128 BPM.
- El tamaño del muro se lee del bounding box de la geometría para no acoplar el
  shader a las medidas actuales del GLB.

## 12. Progreso

| Fecha      | Estado     | Nota                                                   |
| ---------- | ---------- | ------------------------------------------------------ |
| 2026-11-12 | borrador   | Spec creado                                            |
| 2026-11-12 | completado | Shader, logo y verificación completados                |
| 2026-11-12 | completado | Shader desacoplado del audio procedural (pulso 128 BPM) |

## 13. Changelog

- 2026-11-12 — Creación del spec e implementación del shader musical con logo NEAR.
- 2026-11-12 — Se retira la reactividad al audio procedural; la pantalla usa un pulso sintético.
