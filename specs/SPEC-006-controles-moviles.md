---
id: SPEC-006
titulo: "Controles táctiles móviles: stick, correr y saltar"
estado: en-progreso # borrador | en-progreso | bloqueado | completado | cancelado
prioridad: alta # baja | media | alta | crítica
creado: 2026-10-30
actualizado: 2026-10-30
responsable: opencode
etiquetas: [frontend, mobile, touch, svelte, threlte, controles]
depende_de: [SPEC-001, SPEC-005]
bloquea: []
estimacion: "4h"
---

# SPEC-006 — Controles táctiles móviles: stick, correr y saltar

## 1. Contexto

Hoy el jugador (`frontend/src/lib/components/player/PlayerBehaviour.svelte`) solo se puede mover con teclado:

- `WASD` / flechas para caminar.
- `Shift` para correr.
- `Espacio` para saltar.
- `Ctrl` para agacharse.
- El ratón (arrastre o pointer lock) rota la cámara desde `ThirdPersonCamera.svelte`.

La escena 3D vive dentro de `frontend/src/lib/Canvas.svelte`, que monta `@threlte/core` y `@threlte/rapier`. Los overlays HTML que sí se ven (`LobbyOverlay`, `CheckpointPrompt`) se renderizan fuera del canvas, como hermanos en `+page.svelte`. Por eso, cualquier control táctil debe ser HTML posicionado por encima del canvas y no un objeto 3D dentro de la escena (un mesh dentro del canvas no recibe toques de UI ni se ve como botón).

El juego tampoco tiene viewport `viewport-fit=cover`, así que en móviles con notch los elementos fijos pueden quedar tapados por las safe areas. Además, el arrastre táctil sobre el canvas intenta pedir pointer lock, algo pensado para ratón.

Se quiere una capa de controles táctiles visible sobre el canvas con:

- Stick analógico a la izquierda para mover al personaje en cualquier dirección relativa a la cámara.
- Botón de saltar a la derecha.
- Botón de correr a la derecha (mantener pulsado).
- Arrastre directo sobre el canvas para rotar la cámara.
- Convivencia con el aviso de checkpoints (`SPEC-005`) y el chat (`SPEC-004`).

## 2. Objetivo

Añadir controles táctiles móviles renderizados como HTML sobre el canvas, sin mover la lógica del jugador a la escena 3D. El stick y los botones escriben en un estado de entrada compartido que `PlayerBehaviour` mezcla con el teclado, de modo que el gameplay, las animaciones, el collider de Rapier y los checkpoints siguen funcionando igual en escritorio y en móvil.

## 3. Alcance

**Incluye**

- Estado de entrada compartido para movimiento analógico, correr y salto.
- Stick virtual con zona muerta, límite de recorrido y retorno al centro.
- Botón de saltar con disparo único por toque.
- Botón de correr de tipo "mantener pulsado".
- Detección de dispositivo táctil (`any-pointer: coarse`, `pointer: coarse` o `navigator.maxTouchPoints`).
- Forzado de controles en escritorio con `?touch=1` para pruebas.
- Render de los controles dentro de `Canvas.svelte`, como hermanos HTML del canvas 3D.
- Mezcla de entrada táctil + teclado en `PlayerBehaviour`.
- Velocidad proporcional al desplazamiento del stick; teclado sigue a velocidad completa.
- Arrastre táctil de cámara sin pointer lock y con seguimiento de un solo puntero.
- Soporte multi-touch: stick con un dedo y cámara/salto/correr con otros.
- Reposicionamiento del aviso de checkpoints por encima de los controles en pantallas táctiles.
- `viewport-fit=cover` y uso de `env(safe-area-inset-*)`.
- Bloqueo de scroll, zoom por gesto, selección de texto y menú contextual sobre los controles.
- Limpieza de listeners y reseteo de entradas al desmontar o perder el foco.

**No incluye**

- Migrar el movimiento a física/Rapier o cambiar el controlador cinemático existente.
- Botón de agacharse en móvil (se mantiene solo en teclado con `Ctrl`).
- Pinch-to-zoom de cámara o botones de zoom.
- Soporte de gamepad.
- Vibración háptica.
- Rediseño del lobby, chat o checkpoints.
- Cambios en backend, protocolo WebSocket o base de datos.
- Persistencia de la disposición de los botones.
- Controles configurables o reordenables por el usuario.

## 4. Requisitos

### Funcionales

| ID    | Requisito                                                                                                                                                    | Prioridad |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| RF-1  | Existe un módulo de entrada compartido con `moveX`, `moveZ`, `run`, `requestJump()` y `consumeJump()`.                                                        | alta      |
| RF-2  | El stick entrega un vector analógico normalizado en `[-1, 1]` con zona muerta del 16 % y reescalado suave desde el borde de la zona muerta.                  | alta      |
| RF-3  | El stick limita el desplazamiento del knob al radio útil y vuelve al centro al soltar, cancelar o perder la captura del puntero.                              | alta      |
| RF-4  | Arriba en el stick equivale a avanzar (`moveZ < 0`), abajo a retroceder, izquierda/derecha a lateral, igual que `W/S/A/D`.                                    | alta      |
| RF-5  | El botón de saltar encola un salto que `PlayerBehaviour` consume una sola vez; toques repetidos no producen saltos dobles.                                     | alta      |
| RF-6  | El botón de correr activa `run` mientras se mantiene pulsado y lo desactiva al soltar, cancelar o perder la captura.                                          | alta      |
| RF-7  | `PlayerBehaviour` usa el stick cuando está activo y el teclado cuando el stick está en reposo, sin que ambos se sumen.                                        | alta      |
| RF-8  | La velocidad con stick es proporcional al desplazamiento; el teclado mantiene la velocidad actual (`WALK_SPEED` / `RUN_SPEED`).                               | media     |
| RF-9  | `Shift` del teclado y el botón de correr comparten el mismo efecto y pueden usarse indistintamente.                                                           | alta      |
| RF-10 | Los controles solo se muestran en dispositivos táctiles o con puntero grueso; `?touch=1` los fuerza para QA en escritorio.                                    | alta      |
| RF-11 | Los controles se renderizan dentro de `Canvas.svelte` como HTML superpuesto al canvas, con `pointer-events-none` en el contenedor y `pointer-events-auto` en los controles. | alta      |
| RF-12 | La cámara se puede rotar arrastrando un dedo sobre el canvas; en táctil no se solicita pointer lock.                                                          | alta      |
| RF-13 | El arrastre de cámara sigue un único `pointerId`; un segundo dedo no reinicia el gesto ni mueve la cámara.                                                    | media     |
| RF-14 | Stick, correr, saltar y cámara funcionan a la vez con varios dedos.                                                                                           | alta      |
| RF-15 | Al abrir el chat o perder el foco de la ventana se limpian stick, correr y salto para evitar movimiento fantasma.                                             | alta      |
| RF-16 | Los controles usan `touch-action: none`, `user-select: none`, `-webkit-tap-highlight-color: transparent` y `-webkit-touch-callout: none`.                     | media     |
| RF-17 | La disposición respeta `env(safe-area-inset-left/right/bottom)` y el viewport declara `viewport-fit=cover`.                                                    | media     |
| RF-18 | El aviso de checkpoints sube por encima de los controles cuando `html` tiene la clase `touch-controls-active` y sigue siendo clicable.                        | media     |
| RF-19 | Los botones tienen `aria-label` en español y el contenedor declara `role="group"` con etiqueta "Controles táctiles".                                          | media     |
| RF-20 | El wrapper del canvas bloquea scroll/zoom accidental y evita selección de texto durante el arrastre.                                                          | media     |
| RF-21 | Al desmontar `MobileControls` o `PlayerBehaviour` se eliminan listeners y se resetea el estado de entrada.                                                    | alta      |
| RF-22 | La implementación no añade dependencias nuevas.                                                                                                               | alta      |

### No funcionales

| ID    | Requisito                                  | Criterio                                                                                  |
| ----- | ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| RNF-1 | Sin dependencias nuevas.                    | Solo Svelte 5, Tailwind, `@lucide/svelte` y Threlte ya instalados                          |
| RNF-2 | Sin errores de Svelte/TS.                   | `cd frontend && bun run check` termina con 0 errores y 0 warnings                          |
| RNF-3 | Formato correcto en archivos tocados.        | `bunx prettier --check <archivos>` termina con código 0                                    |
| RNF-4 | 60 fps sin asignaciones por frame.           | El estado de entrada es un objeto plano; no usa stores reactivos dentro de `useTask`       |
| RNF-5 | Los controles no interfieren con overlays.   | Contenedor sin captura de clics; lobby, chat y checkpoint siguen usables                   |
| RNF-6 | Accesibilidad básica.                        | Botones reales, `aria-label`, `aria-pressed` en correr y grupo etiquetado                   |
| RNF-7 | Sin fugas de listeners.                      | `onMount`, `$effect` y `useTask` limpian en su retorno                                      |
| RNF-8 | Compatible con teclado y ratón.              | En escritorio los controles no se renderizan y el comportamiento previo no cambia          |

## 5. Criterios de aceptación

- [x] CA-1: En un móvil o emulación táctil aparecen stick a la izquierda y botones "Correr"/"Saltar" a la derecha, por encima del canvas.
- [x] CA-2: Mover el stick desplaza al personaje en la dirección relativa a la cámara, con velocidad proporcional al recorrido.
- [x] CA-3: Soltar el stick, cancelar el toque o cambiar de app detiene el movimiento y centra el knob.
- [x] CA-4: Tocar "Saltar" ejecuta un salto y reproduce la animación `jump`.
- [x] CA-5: Mantener "Correr" mientras se usa el stick aplica `RUN_SPEED`; soltarlo vuelve a `WALK_SPEED`.
- [x] CA-6: Se puede mantener el stick con un dedo y pulsar saltar o correr con otro.
- [x] CA-7: Arrastrar sobre el canvas rota la cámara sin pedir pointer lock en táctil.
- [x] CA-8: En escritorio sin táctil los controles no se muestran; `?touch=1` los muestra.
- [x] CA-9: El aviso de checkpoint queda por encima de los controles y su botón sigue siendo tocable.
- [x] CA-10: La pantalla no hace scroll, zoom por doble toque ni selecciona texto al usar los controles.
- [ ] CA-11: En un móvil con notch los controles respetan las safe areas.
- [x] CA-12: `bun run check` no reporta errores y los archivos tocados por este spec no generan warnings; los archivos tocados pasan Prettier.
- [x] CA-13: Abrir el chat mientras se mantiene el stick no deja movimiento residual.

## 6. Archivos relevantes

| Ruta                                                       | Acción    | Motivo                                                                                  |
| ---------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------- |
| `frontend/src/lib/state/playerInput.ts`                    | crear     | Estado de entrada compartido: stick analógico, correr y cola de salto.                  |
| `frontend/src/lib/components/ui/MobileControls.svelte`     | crear     | Stick virtual, botones de correr/saltar, detección táctil y limpieza.                   |
| `frontend/src/lib/Canvas.svelte`                           | modificar | Montar `MobileControls` como hermano HTML del canvas y bloquear gestos del wrapper.     |
| `frontend/src/lib/components/player/PlayerBehaviour.svelte` | modificar | Mezclar teclado + stick, salto táctil, correr táctil y velocidad analógica.             |
| `frontend/src/lib/components/camera/ThirdPersonCamera.svelte` | modificar | Arrastre táctil sin pointer lock y seguimiento de un solo puntero.                      |
| `frontend/src/lib/components/ui/CheckpointPrompt.svelte`   | modificar | Subir el aviso por encima de los controles en pantallas táctiles.                       |
| `frontend/src/app.html`                                    | modificar | Añadir `viewport-fit=cover` para safe areas.                                            |
| `frontend/src/lib/components/player/PlayerCollider.svelte` | sin cambio | Sigue leyendo `playerState`; no depende de si la entrada es táctil o teclado.           |
| `frontend/src/lib/components/ui/LobbyOverlay.svelte`       | sin cambio | Queda en la esquina superior derecha y no se solapa con los controles.                   |
| `backend/src/**`                                           | sin cambio | El movimiento es de cliente; no hay protocolo ni persistencia nueva.                    |

## 7. Plan de implementación

### Fase 1 — Estado de entrada compartido

- [x] Paso 1: Crear `playerInput.ts` con `moveX`, `moveZ`, `run`, `setMove`, `setRun`, `requestJump`, `consumeJump` y `reset`.
- [x] Paso 2: Normalizar los ejes a `[-1, 1]` y exponer `isStickActive`.
- [x] Paso 3: Mantener el salto como evento consumible para que un toque no se repita cada frame.

### Fase 2 — Controles táctiles HTML

- [x] Paso 1: Crear `MobileControls.svelte` con detección `any-pointer: coarse` / `pointer: coarse` / `maxTouchPoints` y override `?touch=1`.
- [x] Paso 2: Implementar stick con captura de puntero, radio útil, zona muerta, reescalado y retorno al centro.
- [x] Paso 3: Implementar botón de correr con `pointerdown`/`pointerup`/`pointercancel` y captura de puntero.
- [x] Paso 4: Implementar botón de saltar con pulso visual de 140 ms y `requestJump()`.
- [x] Paso 5: Añadir estilos Tailwind coherentes con el HUD, safe areas, iconos de Lucide y etiquetas ARIA.
- [x] Paso 6: Resetear entradas en `blur`, cancelación y desmontaje.

### Fase 3 — Integración con jugador y canvas

- [x] Paso 1: Montar `<MobileControls />` dentro de `Canvas.svelte`, fuera de `<Canvas>` y `<World>`.
- [x] Paso 2: Añadir `relative`, `touch-none`, `overflow-hidden` y `select-none` al wrapper del canvas.
- [x] Paso 3: En `PlayerBehaviour`, usar el stick cuando esté activo y el teclado en caso contrario.
- [x] Paso 4: Unificar `Shift` y `playerInput.run`; usar `playerInput.consumeJump()` junto a `Space`.
- [x] Paso 5: Escalar la velocidad por la magnitud del stick manteniendo la normalización diagonal del teclado.
- [x] Paso 6: Limpiar `playerInput` al abrir el chat, perder foco o desmontar el componente.

### Fase 4 — Cámara táctil

- [x] Paso 1: Diferenciar `pointerType === 'mouse'` para no pedir pointer lock en táctil.
- [x] Paso 2: Guardar `activePointerId` y aceptar solo el puntero que inició el arrastre.
- [x] Paso 3: Forzar `touch-action: none` en el canvas y restaurarlo al desmontar.
- [x] Paso 4: Mantener el arrastre con ratón y el pointer lock existentes.

### Fase 5 — Convivencia y verificación

- [x] Paso 1: Marcar `html.touch-controls-active` desde `MobileControls` y subir `.checkpoint-prompt` con CSS cuando los controles estén visibles.
- [x] Paso 2: Añadir `viewport-fit=cover` al viewport de `app.html`.
- [x] Paso 3: Ejecutar `bun run check` y Prettier sobre los archivos tocados; comprobar que no haya diagnósticos en los archivos de este spec.
- [ ] Paso 4: Probar en un móvil real o emulación táctil: stick, saltar, correr, cámara y checkpoints.
- [ ] Paso 5: Confirmar multi-touch (stick + saltar/correr) y ausencia de scroll/zoom accidental.

## 8. Verificación

```bash
# Frontend
cd frontend && bun run check
cd frontend && bunx prettier --check \
  src/lib/state/playerInput.ts \
  src/lib/components/ui/MobileControls.svelte \
  src/lib/components/player/PlayerBehaviour.svelte \
  src/lib/components/camera/ThirdPersonCamera.svelte \
  src/lib/components/ui/CheckpointPrompt.svelte \
  src/lib/Canvas.svelte \
  src/app.html

# Backend (sin cambios; solo se comprueba que sigue compilando)
cd backend && bunx tsc --noEmit
```

`bun run lint` recorre todo el repo y falla por tres archivos preexistentes ajenos a este spec (`src/lib/assets/Gemini_Generated_Image_gzx3ougzx3ougzx3.pixels.json`, `src/lib/assets/world.svelte` y `src/lib/components/world/Sky.svelte`). La verificación de este cambio usa Prettier solo sobre los archivos tocados.

`svelte-check` puede mostrar warnings en `src/lib/components/world/Checkpoint.svelte` por el trabajo visual de `SPEC-005`; ninguno de los archivos modificados por este spec genera diagnósticos.

Casos manuales:

1. Abrir `http://localhost:5173/?touch=1` en escritorio y comprobar que aparecen stick y botones.
2. Abrir en un móvil real (misma red) o en emulación táctil de DevTools y comprobar que aparecen automáticamente.
3. Mover el stick en las cuatro direcciones y diagonales; verificar animación de caminar y orientación del sprite.
4. Mantener "Correr" y repetir el movimiento; verificar que la velocidad aumenta.
5. Tocar "Saltar" en reposo y en movimiento; verificar un solo salto por toque.
6. Mantener el stick y pulsar "Correr" y "Saltar" con otros dedos; verificar multi-touch.
7. Arrastrar el dedo sobre el canvas fuera de los controles; verificar rotación de cámara sin pointer lock.
8. Caminar hasta un checkpoint; verificar que el aviso aparece por encima de los controles y que su botón responde al toque.
9. Abrir el chat mientras se mantiene el stick; verificar que el personaje se detiene.
10. Cambiar de app o perder foco; verificar que no queda movimiento residual.

## 9. Riesgos y mitigaciones

| Riesgo                                                        | Impacto | Mitigación                                                                                         |
| ------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| Los controles se renderizan dentro del canvas y no reciben toques. | alto    | Se montan como HTML hermano del canvas en `Canvas.svelte`, no como meshes de la escena.             |
| El contenedor de controles bloquea clics del canvas.           | alto    | `pointer-events-none` en el overlay y `pointer-events-auto` solo en stick y botones.                |
| El stick se queda "pegado" al perder el puntero.               | alto    | `setPointerCapture`, `pointercancel`, `lostpointercapture`, `blur` y `reset()`.                    |
| Se pide pointer lock en táctil y el navegador muestra comportamientos raros. | medio   | Pointer lock solo para `pointerType === 'mouse'`; en táctil se usa arrastre directo.               |
| El segundo dedo reinicia el arrastre de cámara.                | medio   | Se guarda `activePointerId` y se ignoran otros punteros.                                            |
| El aviso de checkpoint queda tapado por los botones.           | medio   | `MobileControls` marca `html.touch-controls-active`; `CheckpointPrompt` sube a `11rem` desde abajo cuando la clase está presente. |
| El navegador móvil hace scroll o zoom al tocar.                | medio   | `touch-action: none` en wrapper, canvas y controles; `viewport-fit=cover`.                          |
| Los controles aparecen en un portátil táctil y estorban.       | bajo    | Es intencional: el dispositivo puede usarse sin teclado. Se documenta y no rompe el teclado.       |
| Cambiar la velocidad del stick altera el balance del juego.    | bajo    | El teclado conserva sus velocidades; el stick solo interpola entre 0 y la velocidad seleccionada.   |
| El chat abierto deja una dirección retenida.                   | bajo    | `PlayerBehaviour` resetea `playerInput` cuando `chat.isOpen`.                                       |

## 10. Preguntas abiertas

- [ ] ¿Se quiere añadir más adelante un botón táctil de agacharse y otro de interacción dedicado (`E`), o basta con tocar el aviso de checkpoint? En esta iteración se dejaron fuera para no saturar la pantalla.
- [ ] ¿Se quiere un modo de correr por toggle (un toque activa/desactiva) en lugar de mantener pulsado? Se implementó mantener pulsado por ser el patrón habitual en móvil.

## 11. Decisiones y notas

- **HTML sobre canvas**: los controles viven en `Canvas.svelte` como hermanos de `<Canvas>`/`<World>`. Es la capa correcta para UI táctil; dentro de la escena 3D no se comportan como botones.
- **Un solo estado de entrada**: `playerInput` es un objeto plano, no un store reactivo. `useTask` lo lee cada frame sin coste de suscripción.
- **Stick analógico**: se aplica zona muerta del 16 % y se reescala la magnitud para que el personaje acelere de forma continua. El teclado sigue entregando magnitud 1.
- **Correr = mantener**: el botón usa pointer capture para seguir activo aunque el dedo se desplace. Se descartó el toggle para esta iteración.
- **Salto = evento**: `requestJump()`/`consumeJump()` evita que mantener el botón produzca saltos consecutivos; el teclado conserva el comportamiento previo con `Space`.
- **Cámara**: en ratón se mantiene pointer lock; en táctil se arrastra directamente sobre el canvas. El canvas y el wrapper usan `touch-action: none`.
- **Detección**: `navigator.maxTouchPoints > 0` o `matchMedia('(any-pointer: coarse), (pointer: coarse)')`. `?touch=1` permite QA en escritorio.
- **Safe areas**: `viewport-fit=cover` + `env(safe-area-inset-*)` en stick y botones; en iPhone con notch no quedan bajo la barra inferior.
- **Convivencia con checkpoints**: `MobileControls` añade `touch-controls-active` a `<html>`; `CheckpointPrompt` usa esa clase para subir el aviso a `11rem` y deja 32 px de separación sobre el stick. Sigue siendo un botón HTML clicable, por lo que no fue necesario duplicar la lógica de `lobby.enterLobby`/`leaveLobby`.
- **Fuera de alcance**: agacharse, zoom táctil, gamepad y reordenar controles.

## 12. Progreso

| Fecha      | Estado     | Nota                                                                 |
| ---------- | ---------- | -------------------------------------------------------------------- |
| 2026-10-30 | borrador   | Spec creado a partir del contexto del usuario.                       |
| 2026-10-30 | en-progreso | Implementados estado de entrada, controles, jugador, cámara y safe areas. `bun run check` y Prettier pasan. Probado con emulación táctil por CDP (stick, correr, saltar, multi-touch, cámara y aviso de checkpoint). Falta validar safe areas en un móvil con notch. |

## 13. Changelog

- 2026-10-30 — Creación del spec.
- 2026-10-30 — Implementación inicial: stick, correr, saltar, cámara táctil, detección de touch, safe areas y convivencia con checkpoints.
- 2026-10-30 — Verificación con emulación táctil (CDP): movimiento analógico, reset, correr, salto, multi-touch, cámara sin pointer lock y aviso de checkpoints 32 px por encima del stick.
