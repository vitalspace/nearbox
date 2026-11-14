---
id: SPEC-021
titulo: "Mapa Roadmap: pista secundaria con físicas y selector de pista"
estado: completado
prioridad: alta
creado: 2026-11-02
actualizado: 2026-11-11
responsable: opencode
etiquetas: [threlte, rapier, gltf, mapa, roadmap, gran-premio, pista, dialog]
depende_de: [SPEC-009, SPEC-018]
bloquea: []
estimacion: "4h"
---

# SPEC-021 — Mapa Roadmap: pista secundaria con físicas y selector de pista

## 1. Contexto

`SPEC-018` implementó el Grand Prix sobre el circuito `TWN_Track` de
`map.glb`. El usuario añadió un segundo mapa exportado desde Blender,
`frontend/static/roadmap.glb`, con una pista de saltos (`HW_*`). El objetivo es
incorporarlo al juego sin mezclar su estado con el Grand Prix: cada pista debe
tener su propio mapa, sus propias físicas y su propio spawn.

## 2. Objetivo

Registrar `roadmap.glb` como mapa jugable, darle físicas Rapier **solo** a las
superficies indicadas por el usuario y ofrecer un diálogo al pulsar `E` en el
checkpoint del Grand Prix para elegir entre **Grand Prix** y **Roadmap**,
teletransportando al jugador al mapa elegido.

## 3. Alcance

**Incluye**

- Alta del mapa `roadmap` en `world/maps.json`.
- `world/roadmap.physics.json` con lista blanca explícita.
- Generación de `Roadmap.svelte` con `world:build`.
- Registro automático en `src/lib/world/registry.generated.ts`.
- Spawn propio del mapa (`0, 0.4, 0`).
- Diálogo `TrackSelectDialog.svelte` con dos opciones.
- Estado de escena independiente (`sceneState.setMap` / `resetMap`).
- Botón para volver al mapa exterior desde Roadmap.
- `worldState` separado por id de mapa.

**No incluye**

- Cambiar el motor de carrera del Grand Prix (`RaceRoom` / `Race`).
- Añadir una segunda sala de carrera autoritativa para Roadmap.
- Físicas para decoración, conos, cajas, lápidas, gradas, arcos o murciélagos.

## 4. Físicas

Solo estos nodos tienen collider `trimesh` estático:

- `HW_Curb_L`
- `HW_Curb_R`
- `HW_NeonEdge_Inner`
- `HW_NeonEdge_Outer`
- `HW_Track_Asphalt`
- `HW_Jump1_Up_Deck`
- `HW_Jump1_Landing_Deck`
- `HW_Jump2_Up_Deck`
- `HW_Jump2_Landing_Deck`
- `HW_Jump3_Up_Deck`
- `HW_Jump3_Landing_Deck`

`HW_Track_Asphalt` es el nodo que marca `worldState.markReady('roadmap')`.
El presupuesto resultante es de 11 colliders y 6 522 triángulos.

## 5. Integración de juego

- En el checkpoint `minigame-3`, pulsar `E` ya no entra directamente al
  Grand Prix: abre un diálogo con dos tarjetas.
- **Grand Prix**: llama a `lobby.enterLobby('minigame-3')` y conserva el flujo de
  `SPEC-018`.
- **Roadmap**: cierra el diálogo, limpia el checkpoint activo y llama a
  `sceneState.setMap('roadmap')`. `PlayerCollider` detecta el cambio de escena y
  desactiva el cuerpo del jugador a pie. `RoadmapCar` coloca un coche local en
  `HW_StartFinish_Checker` (`-79.36, 1.1, 132.29`, mirando hacia `+X`) y espera
  a que `worldState.isReady('roadmap')` antes de activar la física dinámica.
- El coche de Roadmap es local: no hay sala autoritativa ni reporte al servidor.
  Reutiliza el último modelo asignado en el Grand Prix y, si no hay ninguno,
  arranca con `coche_calabaza`.
- Controles: `WASD`/flechas, `Space` para freno de mano y `R` para volver al
  inicio. La cámara arranca detrás del coche y el HUD muestra la velocidad.
- **Volver al mapa**: botón flotante que llama a `sceneState.resetMap()`;
  `PlayerCollider` devuelve al jugador a `PLAYER_SPAWN`.
- Mientras se está en Roadmap, `PlayerBehaviour` no envía `player-position` y
  `RemoteHeroes` no se renderiza, para no mezclar posiciones con el mapa
  exterior.

## 6. Archivos

| Ruta | Acción |
| ---- | ------ |
| `frontend/world/maps.json` | añadir entrada `roadmap` |
| `frontend/world/roadmap.physics.json` | lista blanca de 11 nodos |
| `frontend/src/lib/components/world/Roadmap.svelte` | generar con `world:build` |
| `frontend/src/lib/world/registry.generated.ts` | regenerado por `world:sync` |
| `frontend/src/lib/state/sceneState.svelte.ts` | `overrideMap`, `inRoadmap`, `setMap`, `resetMap` |
| `frontend/src/lib/state/checkpoints.svelte.ts` | estado del diálogo |
| `frontend/src/lib/components/ui/CheckpointPrompt.svelte` | interceptar `E` para `minigame-3` |
| `frontend/src/lib/components/ui/TrackSelectDialog.svelte` | diálogo de dos pistas |
| `frontend/src/lib/GamePage.svelte` | montar el diálogo y el botón de volver |
| `frontend/src/lib/Scene.svelte` | renderizar `Roadmap` y ocultar remotos fuera del mapa global |
| `frontend/src/lib/components/player/PlayerCollider.svelte` | spawn del roadmap, cuerpo a pie desactivado y retorno al mapa |
| `frontend/src/lib/components/player/PlayerBehaviour.svelte` | no reportar posición fuera del mapa global |
| `frontend/src/lib/state/roadmapCar.svelte.ts` | estado del coche local, spawn y reset |
| `frontend/src/lib/components/cars/RoadmapCar.svelte` | instancia local de `VehiclePhysics` |
| `frontend/src/lib/components/roadmap/RoadmapControls.svelte` | teclado y reset del coche |
| `frontend/src/lib/components/roadmap/RoadmapHud.svelte` | HUD de velocidad y carga |
| `frontend/src/lib/Scene.svelte` | montar coche y controles en Roadmap |
| `frontend/src/lib/GamePage.svelte` | HUD, reset y volver al mapa |
| `frontend/src/lib/components/camera/ThirdPersonCamera.svelte` | perfil de cámara de coche y vista inicial trasera |
| `frontend/src/lib/state/race.svelte.ts` | recordar el último modelo de coche del Grand Prix |
| `frontend/package.json` | scripts `roadmap:build` y `roadmap:check` |

## 7. Verificación

```bash
cd frontend
bun run roadmap:check
bun run check
bun run lint
bun run build
```

Resultado esperado:

```
[world:check] roadmap: 980 nodos, 974 mallas, 20 animaciones · 11 colliders · 6522 triángulos · modo inject
[world:check] OK
```

Prueba manual:

1. Caminar hasta `(83.0, 0.05, -3.0)`.
2. Pulsar `E`: aparece el diálogo con Grand Prix y Roadmap.
3. Elegir Grand Prix: entra al lobby de `minigame-3` como antes.
4. Elegir Roadmap: se carga `roadmap.glb` y el coche aparece sobre
   `HW_StartFinish_Checker`, mirando hacia la primera rampa.
5. Conducir con `WASD`/flechas; `Space` frena con el freno de mano.
6. `R` devuelve el coche al inicio; caer al vacío hace lo mismo automáticamente.
7. Comprobar que arcos, gradas, conos, cajas, lápidas y murciélagos no
   bloquean.
8. Pulsar “Back to map”: vuelve al spawn exterior sin recargar.
9. `?physics=1&map=roadmap` dibuja solo los 11 colliders.

## 8. Progreso

| Fecha | Estado | Nota |
| ----- | ------ | ---- |
| 2026-11-02 | completado | Mapa registrado, física inyectada, diálogo y teletransporte implementados. `roadmap:check`, `check`, `lint` y `build` en verde. |
| 2026-11-02 | completado | Spawn corregido a `HW_StartFinish_Checker` con coche local, cámara trasera, HUD, reset por `R`, caída y cuerpo a pie desactivado. |
| 2026-11-11 | completado | El HUD de carrera compartido muestra el reloj de la Haunted Highway: `raceMaxMs` (7 min) antes de salir y tiempo restante `m:ss` durante la carrera, en rojo en los últimos 30 s. |

## 9. Changelog

- 2026-11-02 — Creación e implementación del mapa Roadmap, lista blanca de
  físicas, selector de pista y estado de escena independiente.
- 2026-11-02 — Spawn con coche en `HW_StartFinish_Checker`, controles locales,
  reset y reutilización del último coche del Grand Prix.
- 2026-11-11 — `RaceHud` compartido añade el reloj de carrera. En la Haunted
  Highway el límite son 7 min (`raceMaxMs` del snapshot) y el contador baja con
  `endsAt` mientras se corre.
- 2026-11-11 — Pantalla de resultados unificada con el resto de minijuegos:
  tarjeta oscura con borde rosa, trofeo, lista compacta de posiciones con
  medallas y botón con `Returning in Ns`.
