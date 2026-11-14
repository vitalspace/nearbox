---
id: SPEC-027
titulo: "Panel de animaciones del jugador actual"
estado: en-progreso
prioridad: media
creado: 2026-11-11
actualizado: 2026-11-11
responsable: opencode
etiquetas:
  [
    frontend,
    ui,
    animaciones,
    svelte,
    threlte,
    skins,
    accesibilidad,
  ]
depende_de: [SPEC-006, SPEC-007]
bloquea: []
estimacion: "6h"
---

# SPEC-027 — Panel de animaciones del jugador actual

## 1. Contexto

El jugador ya dispone de 25 clips en el rig `HR_*` y cada skin tiene su propio
prefijo (`WH_`, `GH_`, `SF_`, …). Los 19 GLB de `frontend/static/` se exportaron
con sus clips reales; algunos personajes no tienen todos:

| Skin / GLB | Clips | Faltan respecto a `HR_*` |
| ---------- | ----: | ------------------------ |
| `Hero.glb` y los 8 NPC `HR_*` | 25 | — |
| `Witch.glb`, `PumpkinKing.glb` | 24 | `wave` |
| `Demon.glb`, `Frankenstein.glb`, `Golem.glb`, `Mummy.glb`, `Scarecrow_Feet.glb`, `Skeleton.glb`, `Vampire.glb` | 23 | `wave`, `shoot` |
| `Ghost.glb` | 22 | `wave`, `shoot`, `sit` |

Estado actual del código:

- `frontend/src/lib/components/ui/MobileControls.svelte` dibuja una tira fija de
  7 botones (`ANIMATIONS`) solo en dispositivos táctiles. No muestra el resto de
  clips y no se adapta a la skin equipada.
- `frontend/src/lib/components/player/SkinCharacter.svelte` traduce los clips del
  GLB al contrato `HR_*` con `skinAnimations()` y descarta los que no existen en
  el modelo. El mapa resultante (`actions`) es la lista real de clips
  disponibles.
- `frontend/src/lib/components/player/Player.svelte` resuelve ese mapa
  (`actionsStore`) y lo pasa a `PlayerBehaviour.svelte`.
- `PlayerBehaviour.svelte` reproduce one-shots, vuelve a locomoción con el evento
  `finished` del `AnimationMixer` y emite cada cambio por WebSocket con
  `playerAnimations.broadcast()`.
- `frontend/src/lib/state/playerInput.ts` ya tiene un canal de peticiones
  (`requestAnimation` / `consumeAnimation` y `requestSitToggle`).

Problemas a resolver:

1. El contrato `HERO_ANIMATIONS` (cliente y servidores) no incluye los 6 clips
   nuevos `paquete`, `gracias`, `dormir`, `hablar`, `si`, `no`, y
   `skinAnimations()` tampoco los mapea. Sin ese cambio el panel nunca podría
   listarlos.
2. Los clips en bucle (`hablar`) no emiten `finished`; un preview necesita
   temporizador y cancelación explícita para no dejar al jugador atascado.
3. `dormir` termina tumbado; también necesita retorno automático a locomoción.

## 2. Objetivo

Añadir un botón flotante, visible en escritorio y táctil, que abra un panel con
**todas** las animaciones que posee la skin equipada en ese momento. Al pulsar
una entrada se reproduce en el jugador; los clips en bucle y los que terminan en
una pose estática vuelven solos a la locomoción. Al cambiar de skin, la lista se
actualiza a los clips de la nueva skin.

## 3. Alcance

**Incluye**

- Completar el contrato de clips (`HERO_ANIMATIONS`) y `skinAnimations()` con
  `HR_paquete`, `HR_gracias`, `HR_dormir`, `HR_hablar`, `HR_si`, `HR_no`.
- Marcar `HR_hablar` como clip en bucle en `playerAnimations.svelte.ts`.
- Publicar desde `Player.svelte` la lista real de clips disponibles (clave
  `HR_*`, nombre real del clip, duración y si es bucle).
- Estado del panel (`open`, `clips`, preview activo) en un store con runes.
- Componente `AnimationPalette.svelte` con disparador, panel agrupado y estados
  de accesibilidad.
- Modo preview en `PlayerBehaviour.svelte`: reproduce el clip pedido, lo emite
  una sola vez por WebSocket y vuelve a locomoción por temporizador o al
  moverse.
- Emitir cada preview una sola vez para que los demás jugadores vean el gesto;
  al terminar, reemitir la locomoción.
- Sustituir la tira fija de `MobileControls.svelte` por el nuevo panel (el resto
  de controles táctiles se mantiene).
- Montar el panel en `GamePage.svelte` para que también exista en escritorio.
- Comando de chat `/anim <nombre|número>` (con `/anim list`) que reproduce
  cualquier clip de la skin equipada sin enviarlo al chat global.
- Verificación de tipos, lint y pruebas manuales por skin.

**No incluye**

- Crear o modificar animaciones en Blender ni reexportar GLB.
- Buscador, favoritos, reordenación o persistencia de clips.
- Asignar atajos de teclado nuevos a cada clip (los atajos actuales
  `F/G/T/E/V/B` y `C` siguen igual).
- Reemitir el preview en cada frame (solo se emite una vez al iniciar).
- Cambiar el protocolo de red más allá de ampliar la lista de clips válidos
  (los previews reutilizan el mensaje `player-animation` existente).
- Rediseñar el resto de `MobileControls` (joystick, salto, rodar, coche).

## 4. Requisitos

### Funcionales

| ID    | Requisito | Prioridad |
| ----- | --------- | --------- |
| RF-1  | Debe existir un botón flotante «Animations» siempre accesible cuando el jugador no está conduciendo; en táctil convive con el joystick y los botones de acción sin solaparse. | alta |
| RF-2  | El panel debe listar exactamente las claves presentes en el mapa `actions` del jugador actual, no una lista estática. | alta |
| RF-3  | Cada entrada muestra una etiqueta legible, el nombre real del clip (`HR_si`, `GH_si`, …) y su duración. | media |
| RF-4  | Al pulsar una entrada se reproduce ese clip en el jugador local en el siguiente frame. | alta |
| RF-5  | Los clips en bucle se previsualizan durante un tiempo acotado (2–4 s) y vuelven solos a locomoción. | alta |
| RF-6  | Los one-shots vuelven a locomoción al terminar; si el clip no emite `finished` (p. ej. `dormir`), un temporizador de respaldo lo hace. | alta |
| RF-7  | Moverse, saltar, entrar en un coche, recibir un golpe/muerte o abrir el chat cancela el preview. | alta |
| RF-8  | La entrada activa queda resaltada mientras su preview está en curso y al sentarse. | media |
| RF-9  | `HR_sit` mantiene el comportamiento de toggle (sentarse/levantarse) y sigue resaltado mientras el jugador está sentado. | media |
| RF-10 | Cambiar de skin con el panel abierto refresca la lista y cancela cualquier preview incompatible. | alta |
| RF-11 | El panel se cierra con `Escape`, con el botón de cerrar y al hacer clic fuera. | media |
| RF-12 | El panel es usable con teclado: botón con `aria-expanded`, panel con `role="dialog"`, entradas `<button>` y foco devuelto al disparador al cerrar. | media |
| RF-13 | El contrato de clips del cliente, el servidor activo y la copia de referencia aceptan los 6 clips nuevos. | alta |
| RF-14 | Si el mapa `actions` está vacío (modelo cargando o skin sin clips), el panel muestra «No animations available» y no lanza errores. | media |
| RF-15 | La tira fija de animaciones de `MobileControls` desaparece para no duplicar controles; el resto de controles táctiles no cambia. | media |
| RF-16 | El chat acepta `/anim <nombre\|número>` para reproducir cualquier clip de la skin actual, con `/anim list` para ver el listado numerado. Los números 1–6 son los gestos sociales (`1 = yes`, `2 = no`, `3 = talk`, `4 = sleep`, `5 = thank you`, `6 = pick up package`). | alta |

### No funcionales

| ID     | Requisito | Criterio |
| ------ | --------- | -------- |
| RNF-1  | Sin dependencias nuevas. | Solo Svelte 5, Threlte/Three y `@lucide/svelte` ya instalados. |
| RNF-2  | Sin trabajo por frame innecesario. | `publish()` solo reasigna `clips` cuando cambia la firma `clip + duración`; el bucle de preview es O(1). |
| RNF-3  | No romper el render. | Panel y disparador usan `pointer-events-auto` solo en sus elementos; el canvas sigue recibiendo el resto de clics. |
| RNF-4  | Accesibilidad táctil. | Objetivos ≥ 40×40 px; contraste texto/fondo ≥ 4.5:1. |
| RNF-5  | Sin errores de consola. | `bun run check` y `bun run lint` limpios; sin warnings de Svelte por imports muertos. |
| RNF-6  | Preview compartido. | Cada preview se emite **una sola vez** al empezar (no por frame); al terminar o cancelarse se reemite el clip de locomoción. |

## 5. Criterios de aceptación

- [ ] CA-1: `cd frontend && bun run check && bun run lint` termina sin errores.
- [ ] CA-2: Con la skin `Hero`, el panel muestra **25** entradas y coincide con
      `Object.keys(actions).length`.
- [ ] CA-3: Con `Ghost`, muestra **22** entradas y **no** aparece `Sit`,
      `Shoot` ni `Wave`; con `Scarecrow_Feet`, **23** y no aparecen `Shoot` ni
      `Wave`; con `Witch`, **24** y no aparece `Wave`.
- [ ] CA-4: Pulsar `Yes` (`HR_si`) reproduce el clip en ≤ 1 frame, la entrada
      queda resaltada y a los ≤ 2 s vuelve a `idle`/locomoción.
- [ ] CA-5: Pulsar `Talk` (`HR_hablar`) reproduce el bucle y vuelve a
      locomoción entre 2 y 4.5 s después, sin quedar congelado.
- [ ] CA-6: Pulsar `Sleep` (`HR_dormir`) muestra la animación completa y vuelve
      a locomoción ≤ 0.5 s después de su duración, sin quedarse tumbado.
- [ ] CA-7: Mantener `W` durante un preview cancela el clip en ≤ 100 ms y
      reanuda `walk`/`run`; lo mismo al pulsar salto, al entrar en un coche, al
      abrir el chat o al recibir un golpe.
- [ ] CA-8: `Sit` alterna sentado/levantado y el resaltado sigue el estado real;
      el atajo `C` sigue funcionando.
- [ ] CA-9: Cambiar de `Hero` a `Ghost` con el panel abierto actualiza la lista
      en el siguiente frame y elimina el resaltado de un clip inexistente.
- [ ] CA-10: `Escape`, clic fuera y el botón de cerrar cierran el panel; el foco
      vuelve al disparador y `aria-expanded="false"`.
- [ ] CA-11: En viewport móvil 390×844 con `?touch=1`, el disparador no se
      solapa con joystick, salto, rodar, correr ni el botón de coche, y el panel
      se puede desplazar sin tapar la barra inferior de controles.
- [ ] CA-12: En escritorio (sin `?touch=1`) el disparador es visible y operable
      con ratón y teclado.
- [ ] CA-13: Con el panel cerrado y el jugador quieto, otro cliente ve el clip
      que el primero previsualiza y vuelve a `HR_idle` cuando el preview
      termina.
- [ ] CA-14: `bunx tsc --noEmit` en `backend/` termina sin errores tras ampliar
      el contrato.
- [ ] CA-15: `/anim yes`, `/anim 2`, `/anim talk`, `/anim sentarse` y
      `/anim 1` reproducen el clip correcto; `/anim list` muestra el listado
      numerado; un nombre inexistente o un clip que la skin no tiene responde
      con un mensaje del sistema y no envía nada al chat global.

## 6. Archivos relevantes

| Ruta | Acción | Motivo |
| ---- | ------ | ------ |
| `frontend/src/lib/services/protocol.ts` | modificar | Añadir los 6 clips nuevos a `HERO_ANIMATIONS`; `HeroAnimation` e `isHeroAnimation()` se amplían solos. |
| `backend/src/server/protocol.ts` | modificar | Servidor WebSocket activo: misma lista para `HeroAnimation` y validación. |
| `backend/src/server/validate.ts` | verificar | Usa `HERO_ANIMATIONS`; no requiere cambios si la lista se amplía. |
| `frontend/src/server/protocol.ts` | modificar | Copia de referencia usada por scripts `verify-*`; mantener en sincronía. |
| `backend/src/ws/protocol.ts` | modificar (opcional) | Copia legacy con zod. Actualizar si se quiere evitar deriva; no la importa el runtime actual. |
| `frontend/src/lib/cosmetics/skins.ts` | modificar | Añadir los 6 mapeos `HR_*` → `${prefix}_*` en `skinAnimations()`. |
| `frontend/src/lib/cosmetics/animationLabels.ts` | crear | Etiquetas legibles y agrupación (`Movement`, `Actions`, `Social`) del catálogo. |
| `frontend/src/lib/cosmetics/animationCommands.ts` | crear | Resolver `/anim <nombre\|número>`, alias y listado de ayuda. |
| `frontend/src/lib/state/playerAnimations.svelte.ts` | modificar | Añadir `HR_hablar` a `LOOPING` y actualizar el comentario. |
| `frontend/src/lib/state/animationPalette.svelte.ts` | crear | Store del panel: `open`, `clips`, preview activo, sentado y `publish()`/`activate()`. |
| `frontend/src/lib/state/playerInput.ts` | modificar | Añadir `requestPreview()`/`consumePreview()`; retirar `requestAnimation`/`consumeAnimation`. |
| `frontend/src/lib/components/player/PlayerBehaviour.svelte` | modificar | Consumir previews, reproducirlos, emitirlos una sola vez, temporizador y cancelaciones. |
| `frontend/src/lib/components/player/Player.svelte` | modificar | Publicar el mapa `actions` resuelto en `animationPalette`. |
| `frontend/src/lib/components/ui/AnimationPalette.svelte` | crear | Disparador flotante, panel, grupos, estados activo/vacío y accesibilidad. |
| `frontend/src/lib/components/ui/ChatOverlay.svelte` | modificar | Interceptar `/anim` antes de enviarlo al servidor y mostrar el feedback local. |
| `frontend/src/lib/components/ui/MobileControls.svelte` | modificar | Eliminar `ANIMATIONS`, su markup y los imports que queden sin uso (`Armchair`, `Hand`, `HandGrab`, `HeartCrack`, `Skull`, `Swords`, `Component`, `HeroAnimation`). |
| `frontend/src/lib/GamePage.svelte` | modificar | Montar `<AnimationPalette />` dentro del bloque de UI listo (junto a `SettingsMenu`). |

## 7. Plan de implementación

> Orden pensado para que cada fase compile sola. No adelantar la UI antes de que
> el contrato y el preview funcionen.

### Fase 1 — Ampliar el contrato de clips

- [ ] Añadir a `HERO_ANIMATIONS` en `frontend/src/lib/services/protocol.ts`,
      `backend/src/server/protocol.ts` y `frontend/src/server/protocol.ts`, al
      final y en este orden:
      `'HR_paquete'`, `'HR_gracias'`, `'HR_dormir'`, `'HR_hablar'`, `'HR_si'`,
      `'HR_no'`.
- [ ] Añadir los mismos 6 a `backend/src/ws/protocol.ts` (zod legacy) si se
      decide mantenerlo sincronizado.
- [ ] En `skinAnimations()` añadir:
      ```ts
      HR_paquete: `${prefix}_paquete`,
      HR_gracias: `${prefix}_gracias`,
      HR_dormir: `${prefix}_dormir`,
      HR_hablar: `${prefix}_hablar`,
      HR_si: `${prefix}_si`,
      HR_no: `${prefix}_no`
      ```
- [ ] En `playerAnimations.svelte.ts`, añadir `'HR_hablar'` a `LOOPING`.
- [ ] Ejecutar `cd frontend && bun run check`; `Hero` debe tipar 25 claves sin
      `any`.

### Fase 2 — Estado del panel y canal de preview

- [ ] Crear `frontend/src/lib/cosmetics/animationLabels.ts`:
      ```ts
      import type { HeroAnimation } from '../services/protocol';

      export const ANIMATION_LABELS: Record<HeroAnimation, string> = {
        HR_idle: 'Idle',
        HR_walk: 'Walk',
        HR_run: 'Run',
        HR_jump: 'Jump',
        HR_sit: 'Sit',
        HR_aim: 'Aim',
        HR_walk_aim: 'Walk aim',
        HR_run_aim: 'Run aim',
        HR_crouch_aim: 'Crouch aim',
        HR_attack: 'Attack',
        HR_shoot: 'Shoot',
        HR_wave: 'Wave',
        HR_pickup: 'Pick up',
        HR_hit: 'Take a hit',
        HR_death: 'Fall',
        HR_injured: 'Injured',
        HR_heal: 'Heal',
        HR_carry: 'Carry',
        HR_throw: 'Throw',
        HR_paquete: 'Pick up package',
        HR_gracias: 'Thank you',
        HR_dormir: 'Sleep',
        HR_hablar: 'Talk',
        HR_si: 'Yes',
        HR_no: 'No'
      };

      export const ANIMATION_GROUPS = [
        {
          id: 'movement',
          label: 'Movement',
          clips: ['HR_idle', 'HR_walk', 'HR_run', 'HR_jump', 'HR_sit',
                  'HR_aim', 'HR_walk_aim', 'HR_run_aim', 'HR_crouch_aim']
        },
        {
          id: 'actions',
          label: 'Actions',
          clips: ['HR_attack', 'HR_shoot', 'HR_wave', 'HR_pickup', 'HR_hit',
                  'HR_death', 'HR_injured', 'HR_heal', 'HR_carry', 'HR_throw']
        },
        {
          id: 'social',
          label: 'Social',
          clips: ['HR_paquete', 'HR_gracias', 'HR_dormir', 'HR_hablar',
                  'HR_si', 'HR_no']
        }
      ] as const;
      ```
- [ ] Crear `frontend/src/lib/state/animationPalette.svelte.ts`. Contrato
      mínimo:
      ```ts
      export type PaletteClip = {
        animation: HeroAnimation;
        clip: string;        // nombre real en el GLB, p. ej. `GH_si`
        label: string;
        durationMs: number;  // duración del clip en ms
        looping: boolean;
      };

      export function previewDurationMs(durationSeconds: number, looping: boolean): number {
        const base = Math.max(durationSeconds, 0.4) * 1000;
        return looping
          ? Math.min(Math.max(base * 2, 2000), 4000)
          : Math.min(Math.max(base + 200, 800), 12000);
      }

      class AnimationPalette {
        open = $state(false);
        clips = $state<PaletteClip[]>([]);
        previewing = $state<HeroAnimation | null>(null);
        sitting = $state(false);
        private signature = '';

        get active(): HeroAnimation | null {
          return this.previewing ?? (this.sitting ? 'HR_sit' : null);
        }

        publish(actions: Partial<Record<HeroAnimation, AnimationAction>> | undefined): void { /* … */ }
        toggle(): void { this.open = !this.open; }
        close(): void { this.open = false; }
        activate(animation: HeroAnimation): void { /* … */ }
        markPreview(animation: HeroAnimation): void { this.previewing = animation; }
        endPreview(): void { this.previewing = null; }
        setSitting(value: boolean): void { this.sitting = value; }
        clear(): void { this.clips = []; this.previewing = null; this.sitting = false; this.signature = ''; }
      }

      export const animationPalette = new AnimationPalette();
      ```
- [ ] `publish(actions)`:
  - Ordena las claves según `HERO_ANIMATIONS` para que la lista no baile.
  - Construye `clip` con `action.getClip().name` y `durationMs` con
    `action.getClip().duration * 1000`.
  - Calcula una firma `animation:durationMs`; si no cambia, no reasigna
    `clips` (RNF-2).
  - Si `previewing` ya no existe en el nuevo mapa, lo limpia (`previewing =
    null`). `PlayerBehaviour` termina la reproducción al cambiar `actions`.
- [ ] `activate(animation)`:
  - Si no existe en `clips`, no hace nada.
  - Si es `HR_sit`, llama a `playerInput.requestSitToggle()` (el estado real lo
    confirma `PlayerBehaviour` en Fase 3).
  - En otro caso, `playerInput.requestPreview(animation, previewDurationMs(...))`.
- [ ] En `playerInput.ts` añadir:
      ```ts
      private previewRequested: { animation: HeroAnimation; durationMs: number } | null = null;

      requestPreview(animation: HeroAnimation, durationMs: number): void {
        this.previewRequested = { animation, durationMs };
      }

      consumePreview(): { animation: HeroAnimation; durationMs: number } | null {
        const requested = this.previewRequested;
        this.previewRequested = null;
        return requested;
      }
      ```
  - Añadir `previewRequested = null` a `reset()`.
  - Eliminar `requestAnimation`/`consumeAnimation` (su único uso desaparece con
    la tira de `MobileControls`).

### Fase 3 — Preview en `PlayerBehaviour.svelte`

- [ ] Importar `animationPalette` e `isLoopingAnimation`.
- [ ] Añadir estado local:
      ```ts
      let preview: { name: HeroAnimation; until: number } | null = null;
      ```
- [ ] Helpers:
      ```ts
      const endPreview = () => {
        if (!preview) return;
        preview = null;
        animationPalette.endPreview();
      };

      const playPreview = (name: HeroAnimation) => {
        if (!actions?.[name]) return;
        const looping = isLoopingAnimation(name);
        if (current === name) {
          actions[name]?.reset().play();
          return;
        }
        if (playRigClip(actions, current, name, looping)) current = name;
      };
      ```
      `playPreview` no emite por frame: la petición se emite una sola vez al
      consumirla y el clip de locomoción se reemite al terminar.
- [ ] En el `useTask`, después de calcular `moving` y antes de la selección
      final de animación:
  - Consumir `playerInput.consumePreview()`. Si llega:
    - `oneShot = null`, `sitting = false`,
      `animationPalette.setSitting(false)`.
    - `preview = { name, until: performance.now() + durationMs }`.
    - `animationPalette.markPreview(name)`.
  - Si `preview` y (`moving` o `preview.until <= performance.now()`), llamar a
    `endPreview()`.
  - Si llega cualquier `oneShot` de gameplay, muerte, golpe o bloqueo de
    movimiento mientras hay preview, llamar a `endPreview()` antes de
    reproducir el one-shot.
- [ ] Mantener el toggle de sentarse y sincronizar el store:
      ```ts
      if (playerInput.consumeSitToggle()) {
        sitting = !sitting;
        oneShot = null;
        endPreview();
        animationPalette.setSitting(sitting);
      }
      ```
      Hacer lo mismo en el atajo `KeyC` y al entrar en modo conducción.
- [ ] Añadir `playPreview(preview.name)` a la cadena final **antes** de
      `sitting`/locomoción y **después** de `oneShot`:
      ```ts
      if (oneShot) { play(oneShot); }
      else if (preview) { playPreview(preview.name); }
      else if (sitting) { play('HR_sit'); }
      /* … locomoción actual … */
      ```
- [ ] Cancelar el preview al cambiar de skin (`$effect` de `actions`), al
      abrir el chat, en `onBlur`, al conducir (`cars.isDriving`, `race.inCar`,
      `minigame5.isDriving`) y al desmontar.
- [ ] En la rama temprana de conducción, descartar también la petición
      pendiente (`playerInput.consumePreview()`) para que no se dispare al
      volver a pie.
- [ ] Sustituir el bloque de `consumeAnimation()` (el que asignaba `oneShot`
      directamente) por la lógica anterior.

### Fase 4 — Publicar los clips disponibles desde `Player.svelte`

- [ ] Importar `animationPalette`.
- [ ] Derivar el mapa resuelto y publicarlo:
      ```ts
      const resolvedActions = $derived(actionsStore ? $actionsStore : undefined);

      $effect(() => {
        animationPalette.publish(resolvedActions);
      });
      ```
- [ ] En `onDestroy`, llamar a `animationPalette.clear()` para no dejar clips
      de un jugador desmontado (no usar el cleanup del `$effect`, que también
      se ejecuta al cambiar de skin).
- [ ] Verificar que `PlayerBehaviour` sigue recibiendo el mismo `actions`; no se
      cambia su API.

### Fase 5 — Componente `AnimationPalette.svelte`

- [ ] Crear `frontend/src/lib/components/ui/AnimationPalette.svelte`.
- [ ] Disparador:
  - Icono `Clapperboard` de `@lucide/svelte/icons/clapperboard` + etiqueta
    «Animations» en escritorio; solo icono en pantallas estrechas.
  - `aria-expanded={animationPalette.open}`, `aria-controls="animation-palette"`.
  - Visible cuando el jugador no conduce. Usar las mismas condiciones que el
    avatar (`cars.isDriving`, `race.inCar`, `minigame5.isDriving`) y ocultarlo
    mientras `!gameReady` (el componente ya se monta dentro de ese bloque).
  - Posición: `fixed` a la derecha; en táctil por encima del cluster de
    acciones (`bottom: max(8.75rem, calc(env(safe-area-inset-bottom) + 8rem))`),
    en puntero fino `bottom: 1.5rem`. No cubrir la barra inferior.
- [ ] Panel:
  - `role="dialog"`, `aria-label="Player animations"`, `id="animation-palette"`.
  - Lista agrupada con `ANIMATION_GROUPS`; omite grupos sin clips disponibles.
  - Cada entrada: `<button type="button">` con etiqueta, nombre real del clip
    (`entry.clip`) y duración en segundos (`(entry.durationMs / 1000).toFixed(1) + 's'`).
  - `aria-pressed={animationPalette.active === entry.animation}` y clase de
    resaltado cuando está activa.
  - `onclick={() => animationPalette.activate(entry.animation)}`.
  - Si `animationPalette.clips.length === 0`: «No animations available».
  - Scroll interno `max-h-[min(60vh,32rem)] overflow-y-auto`, ancho
    `w-[min(22rem,calc(100vw-2rem))]`.
- [ ] Cierre:
  - `Escape` en `window` mientras `open` (con cleanup).
  - Clic fuera del panel y del disparador (listener en `window`, comparar
    `event.target` con el contenedor).
  - Botón `X` con `aria-label="Close animations"`.
  - Al cerrar, devolver el foco al disparador (`triggerEl?.focus()`).
- [ ] En `MobileControls.svelte`:
  - Borrar la constante `ANIMATIONS`, el tipo `AnimationButton` y el bloque
    `{#if !cars.isDriving && !sceneState.inDeathmatch}` de la tira superior.
  - Quitar imports sin uso: `Armchair`, `Hand`, `HandGrab`, `HeartCrack`,
    `Skull`, `Swords`, `type Component` y `HeroAnimation`.
  - Mantener `Crosshair`, el joystick, salto, rodar, correr y coche.
- [ ] Montar en `GamePage.svelte` junto a `<SettingsMenu />`:
      ```svelte
      <SettingsMenu />
      <AnimationPalette />
      ```
- [ ] Revisar `z-index`: el panel debe quedar por encima del canvas y de los
      HUDs (`z-40`) pero por debajo de overlays modales (`z-50`, onboarding,
      track select). Usar `z-40`.

### Fase 6 — Verificación y documentación

- [ ] Ejecutar la sección 8 completa.
- [ ] Actualizar este spec: `estado`, `actualizado`, Progreso y Changelog.
- [ ] Anotar en el Changelog cualquier desviación (p. ej. si se decide emitir
      previews o no).

### Fase 7 — Comando de chat `/anim`

- [x] Crear `animationCommands.ts` con el orden numérico (sociales primero),
      alias, resolución por etiqueta/clave/nombre real y ayuda.
- [x] Interceptar `/anim` en `ChatOverlay.svelte` antes de `lobby.sendChat()`;
      los comandos se resuelven en local y no se envían al chat global.
- [x] Mostrar feedback local (`Playing: …`, clip no disponible, desconocido) y
      cerrar el chat tras un comando válido para ver el gesto.
- [x] Añadir `/anim` a los textos de `/help` del servidor activo y del engine
      de salas.

## 8. Verificación

```bash
# Frontend: tipos y formato
cd frontend && bun run check && bun run lint

# Backend activo: tipos
cd backend && bunx tsc --noEmit

# Opcional: build de producción
cd frontend && bun run build
```

Comprobación rápida de que el contrato y los GLB coinciden:

```bash
cd frontend/static && python3 - <<'EOF'
import json, struct

def anims(path):
    data = open(path, 'rb').read()
    off = 12
    while off < len(data):
        length, ctype = struct.unpack_from('<II', data, off)
        off += 8
        chunk = data[off:off+length]
        off += length
        if ctype == 0x4E4F534A:
            return [a.get('name') for a in json.loads(chunk.decode('utf-8')).get('animations', [])]
    return []

for name, expected in {
    'Hero': 25, 'Ghost': 22, 'Scarecrow_Feet': 23, 'Witch': 24, 'Demon': 23
}.items():
    got = len(anims(name + '.glb'))
    print(('OK ' if got == expected else 'FAIL'), name, got, '/', expected)
EOF
```

Casos manuales (usar `cd frontend && bun run dev`):

1. **Escritorio, skin Hero**: abrir el panel; deben aparecer 25 entradas
   agrupadas. Pulsar `Yes`, `Talk`, `Sleep` y `Sit`; comprobar reproducción,
   resaltado y retorno a locomoción.
2. **Cambio de skin**: sin cerrar el panel, equipar `Ghost` desde ajustes.
   Deben quedar 22 entradas sin `Sit`/`Shoot`/`Wave`; el preview activo se
   cancela.
3. **Cancelación**: iniciar `Talk`, mantener `W`; el clip debe cortarse y
   empezar `walk`/`run`. Repetir entrando en un coche y abriendo el chat.
4. **Táctil**: abrir con `?touch=1` en viewport 390×844; comprobar que el
   disparador no tapa joystick/acciones y que el panel hace scroll.
5. **Accesibilidad**: recorrer el panel con `Tab`, activar con `Enter`,
   cerrar con `Escape`; el foco vuelve al disparador.
6. **Multijugador**: con dos pestañas, previsualizar clips en una y confirmar
   que la otra ve el mismo gesto y vuelve a `idle` al terminar el preview.
7. **Regresión**: probar los atajos `F/G/T/E/V/B`, `C`, salto, rodar y los
   controles táctiles que quedan.

## 9. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
| ------ | ------- | ---------- |
| El servidor rechaza los clips nuevos con «invalid animation». | Alto | Ampliar `HERO_ANIMATIONS` en `backend/src/server/protocol.ts` (runtime activo) y en la copia de referencia `frontend/src/server/protocol.ts`; `validate.ts` se actualiza solo. |
| Un clip en bucle se queda activo y bloquea la locomoción. | Alto | Temporizador acotado + cancelación por movimiento/one-shot/chat/coche; `endPreview()` centralizado. |
| `dormir` termina tumbado y no emite `finished` en algunos rigs. | Medio | Respaldo por duración (`previewDurationMs`) y cancelación explícita. |
| El panel tapa controles táctiles. | Medio | Posición por encima del cluster inferior, scroll interno y prueba en 390×844. |
| `publish()` reasigna en cada frame y provoca re-render. | Medio | Firma `clip:duration`; solo publica cuando cambia. |
| Se emiten previews a otros jugadores y saturan el WebSocket. | Medio | Cada preview emite un único `player-animation` al iniciar (no por frame); los bucles no se reemiten. |
| Cambio de skin deja entradas obsoletas. | Bajo | `publish()` limpia `previewing` si el clip ya no existe; `PlayerBehaviour` cancela preview al cambiar `actions`. |
| La copia legacy `backend/src/ws/protocol.ts` queda desincronizada. | Bajo | No la importa el runtime; actualizarla en la misma fase o documentar que es legacy. |

## 10. Preguntas abiertas

- [x] ¿Los previews deben verse también en los demás jugadores? **Resuelto**:
      sí se emiten, pero una sola vez al iniciar el preview y no en cada bucle;
      al terminar se reemite el clip de locomoción. Si el emisor cancela el
      preview fuera del bucle de frames (blur, chat, coche) se emite `HR_idle`
      como respaldo.
- [ ] ¿El panel debe abrirse también en los minijuegos de combate
      (`minigame-5`/`minigame-6`) y parkour? La propuesta es que el disparador
      esté disponible salvo al conducir, pero los clips de gameplay siguen
      teniendo prioridad y cancelan el preview.
- [ ] ¿Se mantiene `requestAnimation`/`consumeAnimation` como API pública
      aunque quede sin uso, o se elimina? La propuesta es eliminarla para no
      dejar dos caminos de activación.
- [ ] ¿La etiqueta del disparador debe ser «Animations» o un icono sin texto en
      todos los tamaños? La propuesta es texto en escritorio e icono con
      `aria-label` en móvil.

## 11. Decisiones y notas

- **Fuente de verdad de la lista**: el mapa `actions` que produce
  `SkinCharacter.svelte` tras aplicar `skinAnimations()`. No se usa
  `HERO_ANIMATIONS` directamente porque incluye clips que la skin no tiene
  (Ghost sin `sit`, Scarecrow sin `shoot`/`wave`).
- **Orden**: se ordena según `HERO_ANIMATIONS` y se agrupa por categoría para
  que la posición de cada clip sea estable entre skins.
- **Nombre mostrado**: etiqueta legible + nombre real del clip; así se ve
  `GH_si` vs `HR_si` y sirve para depurar.
- **Preview compartido**: el clip se reproduce con `playRigClip` y se emite
  una sola vez con `playerAnimations.broadcast()` al iniciar; al terminar, la
  locomoción reemite su clip normal, que es el que ven los remotos. Los bucles
  no se reemiten por frame.
- **`sit` es estado, no preview**: se conserva el toggle porque sentarse es
  persistente; el resto de clips son gestos temporales.
- **Duración**: one-shots = duración del clip + 200 ms (mínimo 800 ms); bucles =
  2× duración acotado a 2–4 s.
- **Prioridad**: one-shots de gameplay > preview > sentado > locomoción.
- **Tira antigua**: se elimina para que no haya dos listas de animaciones y
  porque solo mostraba 7 clips fijos.

## 12. Progreso

| Fecha | Estado | Nota |
| ----- | ------ | ---- |
| 2026-11-11 | borrador | Spec creado; pendiente de aprobación e implementación. |
| 2026-11-11 | en-progreso | Implementadas las fases 1–5. `bun run check` (0 errores), `bunx tsc --noEmit` y `bun run build` correctos. Pendientes las pruebas manuales de la sección 8. |
| 2026-11-11 | en-progreso | Corregido el preview congelado: `playPreview()` reiniciaba el clip cada frame porque se ejecuta en bucle. Ahora solo transiciona cuando cambia el clip y el temporizador descuenta el mismo `delta` que el `AnimationMixer`. Verificado con un navegador headless (el clip de `Talk` mueve los brazos y el tiempo de la acción avanza). |
| 2026-11-11 | en-progreso | Los previews ya se comunican a los demás jugadores: se emiten una sola vez al consumir la petición y se reemite `HR_idle` cuando la cancelación ocurre fuera del bucle de frames (blur, chat, coche). Pendiente de prueba manual multijugador. |
| 2026-11-11 | en-progreso | Añadido el comando de chat `/anim <nombre\|número>` con alias en inglés y español, `/anim list` y feedback local. `svelte-check` sin errores y `prettier` limpio. |
| 2026-11-13 | en-progreso | Añadido `HR_dance` (26.º clip) al contrato y al panel; `/anim dance`, `bailar` y `baile` lo reproducen. Los 19 rigs se reexportaron y comprimieron con Draco. `check`, `lint`, `characters:check`, `npcs:check` y `build` en verde. |

## 13. Changelog

- 2026-11-11 — Creación del spec con contrato ampliado, preview temporizado y
  panel dinámico por skin.
- 2026-11-11 — Implementación: contrato de 25 clips, `animationLabels.ts`,
  `animationPalette.svelte.ts`, preview local en `PlayerBehaviour.svelte`,
  `AnimationPalette.svelte`, montaje en `GamePage.svelte` y retirada de la tira
  fija de `MobileControls.svelte`.
- Desviaciones respecto al borrador:
  - `backend/src/ws/protocol.ts` (legacy) se sincronizó con los 25 clips, no
    solo con los 6 nuevos, porque partía de una lista de 11.
  - El preview también se cancela si el jugador no está en el suelo (salto).
  - `Player.svelte` se suscribe al store de acciones con `store.subscribe()`
    dentro de un `$effect` en lugar de `$derived`, para reaccionar a las
    actualizaciones de `useGltfAnimations`.
  - El panel permanece abierto al activar un clip para poder probar varios
    seguidos.
- 2026-11-11 — Previews compartidos con los demás jugadores:
  - `PlayerBehaviour.svelte` emite el clip del preview una sola vez al
    consumir la petición (`playerAnimations.broadcast`), en lugar de mantenerlo
    solo en local.
  - Al terminar el preview, la rama de locomoción reemite su clip normal, de
    modo que el avatar remoto vuelve a `idle`/`walk`/`run`.
  - Si la cancelación ocurre fuera del bucle de frames (blur, chat, entrar en
    un coche, cambio de skin), se emite `HR_idle` como respaldo para que el
    avatar remoto no se quede clavado en el gesto.
  - El subtítulo del panel pasa de «previews are local» a «shared with other
    players».
  - Desviación respecto al borrador: se invierte RNF-6 (antes exigía previews
    locales) y CA-13 ahora comprueba que el gesto sí se ve en el otro cliente.
- 2026-11-11 — Comando de chat `/anim`:
  - Nuevo `frontend/src/lib/cosmetics/animationCommands.ts` con orden numérico
    (sociales primero: `1 = yes`, `2 = no`, `3 = talk`, `4 = sleep`,
    `5 = thank you`, `6 = pick up package`), alias en inglés y español y
    resolución por etiqueta, clave `HR_*`, nombre real del GLB o número.
  - `ChatOverlay.svelte` intercepta `/anim` antes de `lobby.sendChat()`; el
    comando no se envía al chat global, se resuelve contra los clips de la
    skin equipada y deja feedback local. Tras un comando válido el chat se
    cierra para ver el gesto.
  - `/anim list` (o `/anim`, `/anim help`, `/anim ?`) muestra el listado
    numerado en mensajes cortos.
  - Los textos de `/help` del servidor activo y del engine de salas mencionan
    el nuevo comando.
- 2026-11-11 — Corrección del preview congelado:
  - `playPreview()` se ejecuta cada frame y reiniciaba el clip cuando ya era el
    actual, dejándolo clavado en el primer frame. Ahora solo hace la transición
    una vez.
  - Un clic repetido sobre el mismo clip limpia `current` al consumir la
    petición, para forzar el replay una sola vez.
  - El temporizador del preview descuenta el `delta` de `useTask` (el mismo que
    recibe el mixer) en vez de usar `performance.now()`, de modo que en equipos
    lentos el clip termina de reproducirse antes de volver a locomoción.
- 2026-11-13 — **Clip `Dance`**:
  - `HR_dance` se añade al contrato de 26 clips en cliente, servidor de salas y
    backend activo; las skins no humanas lo mapean a su prefijo (`WH_dance`,
    `DM_dance`, …) y los rigs humanos comparten `HR_dance`.
  - El panel lo muestra en el grupo **Social** con la etiqueta `Dance` y
    `/anim dance` (alias `bailar`, `baile`) lo reproduce. Al ser un one-shot,
    el preview dura los ~8,08 s completos y luego vuelve a locomoción.

