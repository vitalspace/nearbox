---
id: SPEC-001
titulo: "Cámara en tercera persona que sigue al jugador"
estado: en-progreso
prioridad: alta
creado: 2026-10-29
actualizado: 2026-10-29
responsable: opencode
etiquetas: [frontend, camara, threlte, jugador]
depende_de: []
bloquea: []
estimacion: "2h"
---

# SPEC-001 — Cámara en tercera persona que sigue al jugador

## 1. Contexto

El jugador es un `InstancedSprite` controlado en `PlayerBehaviour.svelte`, con posición interna `x`, `y`, `z` que se actualiza cada frame y se aplica con `updatePosition`. La escena usa una `T.PerspectiveCamera` fija con `OrbitControls` (`Scene.svelte`), por lo que la cámara no acompaña al jugador y el jugador puede salir del encuadre.

Existe un `ThirdPersonControls` previo (aportado por el usuario) basado en coordenadas esféricas `theta`/`phi`, suavizado de posición y `lookAt`, que sirve como referencia.

## 2. Objetivo

La cámara debe seguir suavemente al jugador y orbitar a su alrededor con el ratón (arrastrar) y zoom con la rueda, manteniendo al jugador en el centro de la vista.

## 3. Alcance

**Incluye**

- Estado compartido con la posición del jugador y el yaw de la cámara.
- Rig de cámara en tercera persona con seguimiento suavizado.
- Mouse look con pointer lock (clic en canvas) y arrastre como fallback.
- Zoom con rueda.
- Movimiento WASD relativo a la orientación de la cámara.
- Sustitución de `OrbitControls` en la escena.

**No incluye**

- Colisión de cámara con geometría del mundo.
- Rotación automática de la cámara según la dirección de movimiento.
- Cambios en animaciones o salto del jugador.

## 4. Requisitos

### Funcionales

| ID   | Requisito                                                                    | Prioridad |
| ---- | ---------------------------------------------------------------------------- | --------- |
| RF-1 | La posición del jugador se publica en un estado compartido cada frame.        | alta      |
| RF-2 | La cámara sigue la posición del jugador con interpolación suave.              | alta      |
| RF-3 | Clic en canvas captura el puntero; mover el ratón rota la cámara (drag como fallback). | alta      |
| RF-4 | La rueda del ratón acerca/aleja la cámara dentro de límites.                  | media     |
| RF-5 | `theta`/`phi` se limitan para evitar volteos y posiciones invertidas.         | media     |
| RF-6 | W/A/S/D se mueven relativo al yaw actual de la cámara.                        | alta      |

### No funcionales

| ID    | Requisito                                                  | Criterio                                      |
| ----- | ---------------------------------------------------------- | --------------------------------------------- |
| RNF-1 | Movimiento de cámara independiente de los FPS.              | Interpolación basada en `delta`               |
| RNF-2 | Sin dependencias nuevas.                                    | Solo `three` y Threlte ya instalados          |
| RNF-3 | Typecheck y formato de los archivos tocados sin errores.    | `bun run check` + Prettier scoped             |

## 5. Criterios de aceptación

- [x] CA-1: Al mover al jugador con WASD/flechas, la cámara lo mantiene en el centro.
- [x] CA-2: Clic en el canvas captura el puntero y el mouse look rota la cámara; arrastre funciona como fallback.
- [x] CA-3: La rueda cambia la distancia sin superar los límites definidos.
- [x] CA-4: No quedan referencias a `OrbitControls` en la escena.
- [x] CA-5: `bun run check` y Prettier de los archivos tocados pasan (el lint global falla por 4 archivos preexistentes).
- [x] CA-6: Con la cámara rotada, W avanza hacia donde mira la cámara y A/D desplazan en horizontal de pantalla.

## 6. Archivos relevantes

| Ruta                                                          | Acción    | Motivo                                          |
| ------------------------------------------------------------- | --------- | ----------------------------------------------- |
| `frontend/src/lib/state/playerState.ts`                       | crear     | Posición compartida y yaw de cámara             |
| `frontend/src/lib/components/camera/ThirdPersonControls.ts`   | crear     | Lógica de órbita, seguimiento y zoom            |
| `frontend/src/lib/components/camera/ThirdPersonCamera.svelte` | crear     | Rig de cámara y eventos de entrada              |
| `frontend/src/lib/components/player/PlayerBehaviour.svelte`   | modificar | Publicar posición y movimiento relativo a cámara |
| `frontend/src/lib/Scene.svelte`                               | modificar | Usar el rig y quitar `OrbitControls`            |

## 7. Plan de implementación

### Fase 1 — Estado y controles

- [x] Crear `playerState` (posición + `cameraYaw`).
- [x] Implementar `ThirdPersonControls` (theta/phi, radio, suavizado, `lookAt`).
- [x] Publicar `x`, `y`, `z` del jugador desde `PlayerBehaviour`.
- [x] Rotar el vector de movimiento según `cameraYaw`.

### Fase 2 — Integración en escena

- [x] Crear `ThirdPersonCamera.svelte` con cámara por defecto, tarea de seguimiento, pointer lock y listeners de rueda.
- [x] Reemplazar cámara fija + `OrbitControls` en `Scene.svelte`.

### Fase 3 — Verificación

- [x] Ejecutar `bun run check`.
- [x] Ejecutar Prettier sobre archivos tocados (lint global con 4 avisos preexistentes).

## 8. Verificación

```bash
cd frontend && bun run check
cd frontend && bunx prettier --check src/lib/components/camera src/lib/components/player src/lib/state src/lib/Scene.svelte
```

Casos manuales:

1. Mover con W/A/S/D y flechas: la cámara acompaña sin saltos.
2. Saltar con Espacio: la cámara sigue en vertical suavemente.
3. Arrastrar con el ratón: órbita horizontal y vertical limitada.
4. Rueda: zoom entre radio mínimo y máximo.

## 9. Riesgos y mitigaciones

| Riesgo                                              | Impacto | Mitigación                                      |
| --------------------------------------------------- | ------- | ----------------------------------------------- |
| Conflicto entre arrastre y selección de UI          | medio   | Listeners solo sobre el canvas                  |
| Sensación de retraso por interpolación              | bajo    | Factor ajustable y dependiente de `delta`       |
| `InstancedSprite` con billboarding y cámara orbital | bajo    | El sprite siempre mira a cámara; comportamiento esperado |

## 10. Preguntas abiertas

- [ ] ¿Se desea rotación automática de cámara al cambiar de dirección? (no incluida)

## 11. Decisiones y notas

- Se usa pointer lock al hacer clic en el canvas; Escape libera el cursor. Arrastre queda como fallback si el navegador bloquea el lock.
- `theta = 0` coloca la cámara detrás del jugador (eje +Z), coherente con W = avanzar hacia -Z.
- El movimiento del jugador rota el input `(dx, dz)` por `cameraYaw`, así W siempre avanza hacia donde mira la cámara.
- `playerState` es un objeto plano (no `$state`) porque cámara y jugador lo leen dentro de tareas por frame.
- Sensibilidad, radio y límites quedan como constantes ajustables en el componente.

## 12. Progreso

| Fecha      | Estado      | Nota                       |
| ---------- | ----------- | -------------------------- |
| 2026-10-29 | en-progreso | Spec creado                |
| 2026-10-29 | completado  | Implementación y verificación |

## 13. Changelog

- 2026-10-29 — Creación del spec.
- 2026-10-29 — Implementación de cámara en tercera persona.
- 2026-10-29 — Movimiento del jugador relativo al yaw de cámara.
- 2026-10-29 — Mouse look con pointer lock y fallback de arrastre.
