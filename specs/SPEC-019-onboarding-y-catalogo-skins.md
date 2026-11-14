---
id: SPEC-019
titulo: "Configuración inicial del jugador y catálogo ampliado de skins"
estado: implementado
prioridad: alta
creado: 2026-11-02
actualizado: 2026-11-14
responsable: opencode
etiquetas:
  [
    frontend,
    svelte,
    threlte,
    onboarding,
    cosmeticos,
    skins,
    glb,
    perfil,
    localstorage,
  ]
depende_de: [SPEC-015, SPEC-016]
bloquea: []
estimacion: "5h"
---

# SPEC-019 — Configuración inicial del jugador y catálogo ampliado de skins

## 1. Contexto

La `SPEC-015` crea el perfil local (`rw:profile:v1`) con un alias aleatorio en la
primera carga, y la `SPEC-016` añade el catálogo de cosméticos con dos skins
(`hero` y `crow-warden`) y su selector en ajustes. El jugador nunca elige su
nombre ni su aspecto antes de entrar: el alias se genera automáticamente y la
skin por defecto es la heroína.

Además, los assets `Witch.glb`, `Demon.glb`, `Frankenstein.glb`, `Ghost.glb`,
`Golem.glb`, `Mummy.glb`, `PumpkinKing.glb`, `Scarecrow_Feet.glb`,
`Skeleton.glb` y `Vampire.glb` ya existen en `frontend/static/`, pero solo el
espantapájaros está integrado en el juego.

La necesidad del usuario es:

1. Mostrar una **pantalla de configuración inicial** la primera vez que se
   juega, es decir, cuando no existe perfil en `localStorage`.
2. Obligar a elegir un **nombre** antes de empezar.
3. Mostrar **todas las skins disponibles** y permitir equipar las desbloqueadas.
4. Mantener bloqueadas las skins que dependen de completar una misión, con su
   condición visible.
5. Ampliar el catálogo con los nueve GLB que ya están en `frontend/static/`.

## 2. Objetivo

Añadir un onboarding modal de una sola vez que pida nombre y skin, y ampliar el
catálogo de cosméticos a once entradas reutilizando el mismo contrato de
renderizado, animaciones y persistencia de la `SPEC-016`.

## 3. Alcance

**Incluye**

- Campo `onboardingCompleted` en `rw:profile:v1`.
- Modal de configuración inicial con nombre obligatorio y selector de skins.
- Persistencia del alias elegido, la skin equipada y el fin del onboarding.
- Catálogo de once skins: `hero`, `crow-warden`, `witch`, `demon`,
  `frankenstein`, `ghost`, `golem`, `mummy`, `pumpkin-king`, `skeleton` y
  `vampire`.
- Componente genérico `SkinCharacter.svelte` para cualquier GLB con rig y prefijo
  de animaciones (`WH_`, `DM_`, `FR_`, `GH_`, `GO_`, `MU_`, `PK_`, `SF_`, `SK_`,
  `VA_`).
- Normalización automática de altura, centrado y pies en `y = 0` para todos los
  modelos.
- Ocultación de cabeza/sombrero en primera persona para las skins que lo
  necesitan.
- Bloqueo del espantapájaros hasta completar `cats-25`; el resto de skins con
  misión se bloquean hasta ganar su minijuego y las cuatro sin condición
  (`witch`, `frankenstein`, `golem`, `skeleton`) están disponibles desde el
  primer arranque.
- Selector de apariencia de ajustes mostrando los nuevos estados.
- Sincronización de la skin equipada entre jugadores mediante la presencia del
  lobby, tanto en el mapa exterior como en la cripta.

**No incluye**

- Inventario en backend, tienda, monedas o logros.
- Sincronizar las victorias de minijuego en el backend: el desbloqueo de
  `vampire`, `pumpkin-king`, `demon` y `ghost` se guarda solo en el perfil
  local, igual que el resto de recompensas.
- Cambiar el protocolo WebSocket.
- Repetir el tutorial desde ajustes ni traducirlo a varios idiomas: se muestra
  una sola vez a los perfiles nuevos y usa el mismo idioma que la interfaz.

## 4. Requisitos

| ID    | Requisito                                                                                                                                                                                                                                                               | Prioridad |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| RF-1  | El perfil añade `onboardingCompleted`; los perfiles existentes sin el campo se leen como `true` y los nuevos se crean con `false`.                                                                                                                                      | alta      |
| RF-2  | El onboarding solo se muestra cuando hay perfil inicializado, los assets están listos y `onboardingCompleted` es `false`.                                                                                                                                               | alta      |
| RF-3  | Mientras el onboarding está abierto se ocultan chat, ajustes, misiones, avisos y controles móviles de la partida.                                                                                                                                                       | alta      |
| RF-4  | El nombre es obligatorio, se recorta y respeta el máximo de 24 caracteres; vacío muestra un error y no permite continuar.                                                                                                                                               | alta      |
| RF-5  | Al confirmar se guarda el alias, se equipa la skin elegida y se marca `onboardingCompleted = true` en `rw:profile:v1`.                                                                                                                                                  | alta      |
| RF-6  | El alias se guarda también cuando no hay backend configurado (modo offline).                                                                                                                                                                                            | alta      |
| RF-7  | Las tarjetas muestran todas las skins del catálogo, con estado seleccionada, disponible o bloqueada.                                                                                                                                                                    | alta      |
| RF-8  | Una skin bloqueada no se puede seleccionar y muestra la condición para desbloquearla.                                                                                                                                                                                   | alta      |
| RF-9  | Las skins sin `unlockMissionId` están disponibles desde el primer arranque; `crow-warden` sigue ligada a `cats-25`, `mummy` a `crypt-5-skulls`, `vampire` a `race-5-laps`, `pumpkin-king` a `barn-8-waves`, `demon` a `hexfire-first-win` y `ghost` a `parkour-summit`. | alta      |
| RF-10 | El catálogo incluye los nueve GLB nuevos de `frontend/static/` con ID, nombre, descripción, ruta y prefijo de animación.                                                                                                                                                | alta      |
| RF-11 | Todos los modelos se renderizan con `SkinCharacter.svelte`, clonando el esqueleto y normalizando su altura a ≈ 2.23 m.                                                                                                                                                  | alta      |
| RF-12 | Los clips `HR_*` se mapean al prefijo de cada rig; los clips inexistentes se ignoran sin dejar poses clavadas.                                                                                                                                                          | alta      |
| RF-13 | En primera persona se ocultan los nodos de cabeza/sombrero definidos por cada skin.                                                                                                                                                                                     | media     |
| RF-14 | Si un GLB falla, se vuelve a `Hero.glb` sin modificar la skin guardada en el perfil.                                                                                                                                                                                    | alta      |
| RF-15 | El selector de ajustes sigue funcionando con el catálogo ampliado y conserva los estados disponible/equipada/bloqueada.                                                                                                                                                 | media     |
| RF-16 | El onboarding es modal: bloquea los atajos del juego salvo la escritura en el campo de nombre.                                                                                                                                                                          | alta      |
| RF-17 | No se añaden dependencias ni cambios en `backend/`.                                                                                                                                                                                                                     | alta      |
| RF-18 | La skin equipada se publica al conectar y al cambiarla; el servidor la guarda en la presencia y los avatares remotos (mapa y cripta) usan ese GLB con `hero` como fallback.                                                                                             | alta      |
| RF-19 | Antes de crear el personaje, el onboarding muestra un mini tutorial de ocho pasos: exploración, 25 gatos, Grand Prix, Haunted Highway, cripta, Barn Siege, Witch House Deathmatch y Parkour.                                                                            | alta      |
| RF-20 | Cada paso incluye una vista 3D representativa, título, descripción, viñetas de juego y atajos; se navega con Back/Next y se puede saltar el tutorial.                                                                                                                   | alta      |
| RF-21 | Las vistas 3D reutilizan assets ya precargados (héroe, gato, coche calabaza, coche Halloween, momia, espantapájaros y bruja) o geometría procedural (torre del parkour); no se añaden dependencias ni GLB nuevos.                                                       | alta      |
| RF-22 | El tutorial solo aparece cuando `onboardingCompleted` es `false`; los perfiles existentes entran directamente al juego como antes.                                                                                                                                      | alta      |
| RF-23 | El campo de nombre solo recibe el foco en el paso final; las flechas del teclado navegan pasos en el tutorial y cambian de skin en la creación del personaje.                                                                                                           | media     |
| RF-24 | El tutorial añade Witch House Deathmatch (`minigame-6`) y Parkour Spire (`minigame-7`) reutilizando contenido de `SPEC-025` y `SPEC-026`: 6v6, armas, granadas y respawn; 12 checkpoints, salto y guardianes que empujan.                                               | alta      |
| RF-25 | Deathmatch se previsualiza con la skin `witch` y las luces de equipo Coven/Hunters; Parkour usa una torre procedural con plataformas, ventanas y baliza, sin cargar `Parkour.glb` ni añadir GLB nuevos.                                                                 | alta      |
| RF-26 | Cada paso con misión muestra una insignia «Mission reward» con el icono y el nombre de la skin, y sus viñetas explican la condición de victoria: Scarecrow, Vampire, Mummy, Pumpkin King, Demon y Ghost.                                                                | alta      |

## 5. Criterios de aceptación

- [x] CA-1: Con `localStorage` limpio, tras cargar los assets aparece «Create your character» con nombre y las once skins.
- [x] CA-2: Pulsar «Start playing» sin nombre muestra el error y mantiene el onboarding abierto.
- [x] CA-3: Al escribir un nombre y elegir una skin disponible, se guarda el alias correcto y la skin elegida.
- [x] CA-4: Tras recargar, el onboarding no vuelve a aparecer y se conservan nombre y skin.
- [x] CA-5: Con un perfil antiguo (sin `onboardingCompleted`), el juego entra directamente y no muestra el onboarding.
- [x] CA-6: El espantapájaros aparece bloqueado si `cats-25` no está completada, y disponible si lo está.
- [x] CA-7: Las demás skins se pueden seleccionar desde el primer arranque.
- [x] CA-8: Witch, Ghost, Pumpkin King y Golem se renderizan con escala y orientación correctas en el mapa.
- [x] CA-9: Una skin bloqueada guardada a mano en el perfil cae a `hero` al cargar.
- [x] CA-10: `bun run check`, Prettier y `bun run build` pasan sin errores.
- [ ] CA-11: Al equipar una skin, los demás clientes redibujan el avatar remoto con esa skin en el mapa y en la cripta.
- [x] CA-12: Con `localStorage` limpio, el onboarding abre en «Explore Monster Village» con la vista 3D del héroe y el indicador 1/9.
- [x] CA-13: Back/Next recorren los ocho pasos, Skip tutorial salta a la creación del personaje y el último botón cambia a «Create character».
- [x] CA-14: Cada paso de actividad muestra su modelo 3D (gato, coche calabaza, coche Halloween, momia, espantapájaros, bruja y torre) y sus atajos; el gato del paso de los 25 gatos mira de frente a la cámara.
- [x] CA-15: Un perfil con `onboardingCompleted = true` no vuelve a ver el tutorial.
- [x] CA-16: El paso de Witch House Deathmatch explica los equipos 6v6, las armas, la granada y el respawn, y previsualiza a la bruja con las luces Coven/Hunters.
- [x] CA-17: El paso de Parkour Spire explica los 12 checkpoints, el salto y los empujes de los guardianes, y previsualiza una torre procedural con plataformas, ventanas y baliza sin cargar `Parkour.glb`.
- [x] CA-18: Los seis pasos de misión muestran la insignia de recompensa con su skin (Scarecrow, Vampire, Mummy, Pumpkin King, Demon y Ghost) y la condición de victoria correspondiente; la creación de personaje resume las seis recompensas.

## 6. Archivos relevantes

| Ruta                                                           | Acción    | Motivo                                                                   |
| -------------------------------------------------------------- | --------- | ------------------------------------------------------------------------ |
| `frontend/src/lib/cosmetics/skins.ts`                          | modificar | Catálogo de 11 skins, prefijos y nodos ocultos.                          |
| `frontend/src/lib/state/playerProfile.svelte.ts`               | modificar | `onboardingCompleted`, skins gratuitas y normalización.                  |
| `frontend/src/lib/state/cosmetics.svelte.ts`                   | modificar | Desbloqueo de skins sin misión.                                          |
| `frontend/src/lib/components/player/SkinCharacter.svelte`      | crear     | Render genérico de cualquier skin con rig.                               |
| `frontend/src/lib/components/player/PlayerSkin.svelte`         | modificar | Selector de modelo con fallback y remontaje por skin.                    |
| `frontend/src/lib/components/player/CrowWarden.svelte`         | eliminar  | Sustituido por `SkinCharacter.svelte`.                                   |
| `frontend/src/lib/components/ui/OnboardingOverlay.svelte`      | modificar | Pantalla inicial: tutorial por pasos, nombre y skin.                     |
| `frontend/src/lib/components/ui/onboardingTutorial.ts`         | crear     | Contenido y metadatos de los ocho pasos del tutorial.                    |
| `frontend/src/lib/components/ui/OnboardingPreview.svelte`      | crear     | Canvas del visor 3D del tutorial.                                        |
| `frontend/src/lib/components/ui/OnboardingPreviewStage.svelte` | crear     | Escena 3D por actividad: héroe, gato, coches, momia o espantapájaros.    |
| `frontend/src/lib/components/world/Cat.svelte`                 | modificar | `yaw` opcional para orientar el gato del tutorial de frente a la cámara. |
| `frontend/src/lib/GamePage.svelte`                             | modificar | Montar el onboarding y ocultar el resto de HUD mientras está abierto.    |
| `frontend/static/*.glb`                                        | existente | Assets ya copiados; no se duplican.                                      |

## 7. Decisiones y notas

- **Solo una vez:** el perfil recién creado nace con `onboardingCompleted =
false`. Los perfiles antiguos sin el campo se consideran ya configurados para
  no interrumpir partidas existentes.
- **Skins gratuitas:** cuatro de las diez skins nuevas (`witch`,
  `frankenstein`, `golem`, `skeleton`) no tienen condición de misión y están
  disponibles desde el primer arranque. El resto son recompensas: el
  espantapájaros de `cats-25`, la momia de `crypt-5-skulls`, el vampiro de
  `race-5-laps`, el Rey Calabaza de `barn-8-waves`, el demonio de
  `hexfire-first-win` y el fantasma de `parkour-summit`. Las victorias se
  registran localmente al observar la fase autoritativa del servidor. El
  esquema `unlockMissionId` es
  genérico: `syncUnlocks()` desbloquea cualquier skin cuya misión figure como
  completada en `rw:missions:v1`.
- **Normalización:** `SkinCharacter` escala cada modelo a 2.23 m con `Box3`,
  centra X/Z y apoya los pies en `y = 0`, así que no hacen falta escalas por
  asset.
- **Animaciones:** todos los GLB exportados comparten el mismo contrato de clips
  (`<PREFIJO>_idle`, `_walk`, `_run`, `_jump`, `_sit`, `_attack`, `_pickup`,
  `_hit`, `_death`). Ghost no tiene `sit` y Ghost/Scarecrow no tienen `shoot` ni
  `wave`; el comportamiento existente ya ignora los clips ausentes.
- **Primera persona:** cada skin declara los nodos de cabeza/sombrero que deben
  ocultarse en la cripta; el cuerpo, brazos y piernas siguen visibles.
- **Persistencia offline:** el alias se escribe directamente en el perfil antes
  de llamar a `lobby.setAlias`, porque `connect()` no hace nada si no hay URL de
  WebSocket configurada.
- **Modalidad:** el onboarding captura los `keydown` en fase de captura para que
  los atajos del juego no se disparen, excepto cuando el foco está en el campo
  de nombre.
- **Mini tutorial:** antes del paso de creación, ocho pasos explican el mapa y
  cada actividad (exploración, 25 gatos, Grand Prix, Haunted Highway, cripta,
  Barn Siege, Witch House Deathmatch y Parkour). Cada paso monta un visor 3D
  con un modelo ya precargado o geometría procedural y una ficha con qué hacer
  y qué teclas usar. Solo lo ven los perfiles nuevos; no se reproduce con una
  partida real ni modifica el estado del juego.
- **Recompensas:** cada paso de misión muestra una insignia «Mission reward»
  con el icono y el nombre de la recompensa, además de una viñeta con la
  condición de victoria. Cinco misiones dan skin: `race-5-laps` → Vampire,
  `crypt-5-skulls` → Mummy, `barn-8-waves` → Pumpkin King,
  `hexfire-first-win` → Demon y `parkour-summit` → Ghost. Los 25 gatos muestran
  el NFT Witch y no desbloquean skin local; el Scarecrow es NFT-only.
- **Deathmatch en el tutorial:** la vista reutiliza la skin `witch` sobre una
  plataforma oscura con dos balizas de equipo (morado Coven y cian Hunters) y
  una luz cian secundaria. El texto resume 6v6, pickups, granadas, respawn de
  3 s y protección de 5 s de `SPEC-025`, sin cargar `barnsiege.glb` ni abrir
  una room.
- **Parkour en el tutorial:** la vista se construye con primitivas de Three.js
  (torre de tres cuerpos, tejado, ventanas encendidas, anillo y haz de baliza,
  dos plataformas flotantes y el héroe encima). No se carga el `Parkour.glb` de
  22 MB ni se instancia `parkour.physics.json`; el texto cubre los 12
  checkpoints, el salto y los empujes de guardianes de `SPEC-026`.
- **Gato del tutorial:** `Cat.svelte` acepta un `yaw` opcional para las vistas
  que necesitan una orientación fija. El mapa sigue usando el giro derivado del
  id (variedad entre los 25 gatos), pero el visor del tutorial pasa
  `yaw = 1 rad` para que el gato mire a la cámara (el GLB está esculpido hacia
  −X), con un balanceo reducido (±0.12 rad) que no lo saca de frente.

## 8. Verificación

```bash
cd frontend && bun run check
cd frontend && bunx prettier --check \
  src/lib/cosmetics/skins.ts \
  src/lib/state/playerProfile.svelte.ts \
  src/lib/state/cosmetics.svelte.ts \
  src/lib/components/player/SkinCharacter.svelte \
  src/lib/components/player/PlayerSkin.svelte \
  src/lib/components/ui/OnboardingOverlay.svelte \
  src/lib/components/ui/onboardingTutorial.ts \
  src/lib/components/ui/OnboardingPreview.svelte \
  src/lib/components/ui/OnboardingPreviewStage.svelte \
  src/lib/components/world/Cat.svelte \
  src/lib/GamePage.svelte
cd frontend && bun run build
```

Comprobado en Chromium headless: onboarding con `localStorage` limpio, error de
nombre vacío, selección de Witch, guardado de alias/skin, recarga sin onboarding,
fallback de una skin bloqueada a `hero` y render de Witch, Ghost, Pumpkin King y
Golem.

## 9. Progreso

| Fecha      | Estado       | Nota                                                                                                                                                                                       |
| ---------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-11-02 | implementado | Onboarding de nombre y skin, catálogo de 11 skins, render genérico y verificación completa en Chromium.                                                                                    |
| 2026-11-03 | implementado | La skin equipada viaja por la presencia del lobby y se aplica a los avatares remotos del mapa y la cripta.                                                                                 |
| 2026-11-04 | implementado | Mini tutorial de seis pasos con visor 3D por actividad antes de crear el personaje; solo para perfiles nuevos.                                                                             |
| 2026-11-04 | implementado | El gato del tutorial mira de frente a la cámara (`yaw = 1 rad` y balanceo reducido); el resto de gatos del mapa conservan su orientación variada.                                          |
| 2026-11-05 | implementado | El tutorial crece a ocho pasos con Witch House Deathmatch y Parkour Spire, sus fichas, dos visores 3D (bruja con equipos y torre procedural) y la recompensa de skin de las seis misiones. |

## 10. Changelog

- 2026-11-02 — Creación e implementación del onboarding inicial y ampliación del catálogo de skins con los GLB existentes.
- 2026-11-02 — La momia deja de ser gratuita: se desbloquea al ganar la misión de la cripta (`crypt-5-skulls`). El desbloqueo por misión se generaliza para admitir varias misiones completadas.
- 2026-11-03 — La skin equipada se sincroniza con los demás jugadores: mensaje `player-skin`, campo `skin` en la presencia y render remoto con el GLB de cada skin (mapa exterior y cripta).
- 2026-11-04 — Se añade un mini tutorial de bienvenida con seis pasos y vistas 3D de cada actividad (exploración, gatos, Grand Prix, Haunted Highway, cripta y Barn Siege) antes de crear el personaje.
- 2026-11-04 — El gato del paso de los 25 gatos se muestra de frente: `Cat.svelte` admite un `yaw` opcional y el visor del tutorial fuerza `yaw = 1 rad` con un balanceo menor, sin cambiar la orientación variada de los gatos repartidos por el mapa.
- 2026-11-05 — Se añaden dos pasos al tutorial (Witch House Deathmatch y Parkour Spire) con sus atajos y visores 3D: la bruja con balizas Coven/Hunters y una torre procedural con plataformas y baliza, sin cargar `Parkour.glb`.
- 2026-11-05 — El tutorial muestra la recompensa de las seis misiones (Scarecrow, Vampire, Mummy, Pumpkin King, Demon y Ghost) con una insignia «Mission reward» y la condición de victoria en cada paso.
- 2026-11-05 — Se amplían las recompensas de misión: `vampire` (Grand Prix), `pumpkin-king` (Barn Siege), `demon` (Hexfire) y `ghost` (Parkour) dejan de ser gratuitas. Quedan libres `witch`, `frankenstein`, `golem` y `skeleton`.
- 2026-11-14 — Los 25 gatos dejan de desbloquear la skin Scarecrow: la recompensa del tutorial pasa a ser el NFT Witch y `crow-warden` se marca `nftOnly` (se obtiene poseyendo su NFT, vía `tier-veteran` o tienda). Los perfiles que ya la desbloquearon la conservan.
