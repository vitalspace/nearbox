---
id: SPEC-033
titulo: "Tienda y centro de turismo: checkpoints interactivos y guía del pueblo"
estado: implementado
prioridad: alta
creado: 2026-11-12
actualizado: 2026-11-14
responsable: opencode
etiquetas:
  [
    frontend,
    svelte,
    threlte,
    tienda,
    turismo,
    guia,
    skins,
    misiones,
    checkpoint,
    hud,
    onboarding,
    nft,
    recompensas,
    skyfall,
    royale,
    islas-ciudad,
    progresion,
  ]
depende_de: [SPEC-005, SPEC-015, SPEC-016, SPEC-019, SPEC-040, SPEC-045]
bloquea: [SPEC-034]
estimacion: "8h"
---

# SPEC-033 — Tienda y centro de turismo: checkpoints interactivos y guía del pueblo

## 1. Contexto

El mapa exterior (`frontend/static/map.glb`) ya contiene dos edificios pensados
como puntos de interés, ambos frente al claro central:

| Edificio                     | Grupo GLB                  | Posición        | Rotación | Fachada |
| ---------------------------- | -------------------------- | --------------- | -------- | ------- |
| Tienda de cartón (Halloween) | `Halloween_Cardboard_Shop` | `(-20, 0.2, 0)` | `+π/2`   | `+X`    |
| Centro de turismo            | `Halloween_Tourism_Office` | `(20, 0.2, 0)`  | `-π/2`   | `-X`    |

El centro de turismo ya tiene un ancla vacía `TO_Interaccion` en
`[0, 1.2, 2]` local, que equivale a `(18, 1.4, 0)` en mundo. La tienda no tiene
ancla, pero su mostrador (`Shop_CounterFront`, `z = 1.53` local) y su cartel
(`Shop_AFrame_*`, `z ≈ 2.35–2.75` local) marcan la fachada hacia `+X`. Ninguno
de los dos edificios es interactivo hoy: son decorado con colliders.

El proyecto ya tiene las piezas que esta spec necesita:

- **Checkpoints de minijuego** (`SPEC-005`): pads con anillo, haz y cartel 3D,
  sensores Rapier y un aviso inferior con `E` (`CheckpointPrompt.svelte`). Están
  tipados como `MinigameLobbyId` y su lógica pertenece al lobby, así que no se
  pueden reutilizar tal cual para una tienda o una oficina de información.
- **Misiones locales** (`SPEC-015`): `missions.svelte.ts` expone
  `capturedCount`, `completed`, `cryptCompleted`, `isMissionCompleted()` y
  `missionTitle()`. El HUD de misiones vive arriba a la izquierda y el aviso de
  gato tiene prioridad sobre el de checkpoint.
- **Catálogo de skins** (`SPEC-016`, ampliado en `SPEC-019`): 11 skins en
  `cosmetics/skins.ts`, con `unlockMissionId`, `cosmetics.isUnlocked()` y
  `cosmetics.equip()`. `SettingsMenu.svelte` y el onboarding ya usan
  `SkinPreview.svelte`.
- **Mini tutorial de onboarding** (`SPEC-019`): ocho pasos con visor 3D
  (`OnboardingPreviewStage.svelte`) para explorar, los 25 gatos, Grand Prix,
  Haunted Highway, la cripta, Barn Siege, Witch House Deathmatch y Parkour
  Spire. Ese contenido y esos visores son exactamente la guía que debe mostrar
  el centro de turismo.
- **Progresión y recompensas NFT** (`SPEC-045`): `missions/progression.ts`
  define 7 pistas (`barn`, `royale`, `gp`, `hexfire`, `parkour`, `crypt`,
  `explorer`), 5 tramos (`T0`–`T4`) y 26 misiones. Cada misión con
  `reward.catalogId` mintea un NFT real (skin, arma o vehículo) desde
  `POST /rewards/claim`; `progression.svelte.ts` expone `missionState()`,
  `completedCount`, `claimedCount` y el estado de sincronización. La Central
  del HUD (`MissionHud`) ya muestra `Errands / Challenges / Rewards`.
- **Skyfall Royale** (`SPEC-040`): octavo minijuego jugable, lobby
  `minigame-8`, room `royale`, checkpoint `SKYFALL ROYALE` en
  `(60.0, 0.40, 60.0)` y mapa completo `islas-ciudad`
  (`frontend/static/maps/islas_ciudad.glb`, físicas `chunked`). Es un battle
  royale 12 participantes con bots de relleno, zepelín, tormenta, loot y
  victoria del último en pie.
- **Patrón de interacción por proximidad** (`ClubMusicBooth.svelte`): calcula
  la distancia al jugador en `useTask`, sin sensores ni colliders, y publica
  `nearby` en un store. Es el patrón adecuado para dos kioscos que no deben
  tocar la física del mapa.

La necesidad del usuario es:

1. Crear un **checkpoint/punto interactivo frente a la tienda** y otro frente
   al **centro de turismo**, con su marcador 3D y su aviso de `E`.
2. Añadir **dos divs/paneles**: uno que muestre la tienda y otro que informe
   dónde ir y qué hacer en el juego.
3. En el centro de turismo, listar **todas las misiones y minijuegos**
   —incluido el nuevo **Skyfall Royale** en `islas-ciudad`—, explicar qué se
   hace en cada uno, mostrar **un visor 3D de cada actividad** y decir **qué
   recompensa NFT** da su pista de progresión.
4. Reutilizar el contenido y los visores del onboarding (`SPEC-019`), el
   progreso de misiones (`SPEC-015`) y el catálogo NFT (`SPEC-045`), sin
   backend nuevo, sin economía y sin mintear desde el kiosco.

## 2. Objetivo

Añadir dos kioscos interactivos en el hub —**Halloween Shop** y **Tourism
Office**— con marcador 3D, aviso de `E` y panel modal propio. La tienda muestra
el catálogo de skins con vista 3D y permite equipar las desbloqueadas; la
oficina de turismo muestra una guía de las **nueve actividades** del pueblo —las
ocho de `SPEC-019` más **Skyfall Royale** en el mapa `islas-ciudad` de
`SPEC-040`— con su estado, **recompensa de skin y recompensa NFT de
`SPEC-045`**, ubicación, mapa y visor 3D reutilizado de `SPEC-019`. Todo
funciona en local, sin monedas, sin mintear desde el kiosco y sin dependencias
nuevas.

## 3. Alcance

**Incluye**

- Definición de dos kioscos (`shop`, `tourism`) con posición, color, radio y
  copy en un store nuevo.
- Marcadores 3D frente a los dos edificios, siguiendo el lenguaje visual de los
  checkpoints (disco, anillo, haz y cartel flotante) pero sin sensores Rapier.
- Detección de proximidad a 10 Hz con `playerState`, como el jukebox del club.
- Aviso inferior con nombre, pista, tecla `E` y botón táctil.
- Panel `#shop-panel`: catálogo de las 11 skins, vista 3D, estado
  disponible/bloqueada, condición de desbloqueo y botón `Equip`.
- Panel `#tourism-panel`: lista de las nueve actividades, estado de la misión,
  **estado y recompensa NFT de la pista de progresión**, recompensa de skin,
  mapa, ubicación/direcciones, viñetas de juego, controles y visor 3D.
- Entrada **Skyfall Royale** en la guía: lobby `minigame-8`, checkpoint
  `SKYFALL ROYALE`, mapa `islas-ciudad`, recompensas `sniper-gold` →
  `bazooka-gold` → `ghost` de la pista `royale` y estado de sus misiones
  `royale-first`, `royale-kills-10`, `royale-kills-50` y `royale-kills-200`.
- Reutilización de `OnboardingPreviewStage.svelte` para los visores, de
  `SkinPreview.svelte` para la tienda y de `progression.svelte.ts` /
  `progression.ts` para el estado y las recompensas NFT.
- Cierre con `X`, `Escape` y clic en el fondo; liberación del teclado mientras
  el panel está abierto.
- Prioridades de `E` entre gato, NPC, kiosco, checkpoint y jukebox.
- Estilos responsive y adaptación a controles táctiles.
- Verificación de tipos, formato, build, `map:check` y `royale:check`.

**No incluye**

- Monedas, precios, inventario, compras reales o economía. La tienda es un
  escaparate/vestuario: muestra y equipa lo que el perfil ya desbloqueó.
- Mintear, reclamar o transferir NFTs desde el kiosco. El turismo **solo
  informa**; el botón `Claim` sigue viviendo en la Central del HUD
  (`MissionHud → Rewards`) y en `POST /rewards/claim`.
- Desbloqueos nuevos: las condiciones de skin siguen siendo las de `SPEC-016` /
  `SPEC-019` (`cats-25`, `crypt-5-skulls`, `race-5-laps`, `barn-8-waves`,
  `hexfire-first-win`, `parkour-summit`) y las de NFT las de `SPEC-045`.
- Backend, WebSocket, protocolo, base de datos o sincronización entre
  jugadores. El progreso de skins sigue siendo local (`rw:profile:v1`,
  `rw:missions:v1`) y el de NFT lo aporta `SPEC-045`.
- Nuevos GLB, nuevas skins, nuevos minijuegos propios o cambios en `map.glb`.
  **Skyfall Royale** y `islas_ciudad.glb` pertenecen a `SPEC-040`; esta spec
  solo los enlaza desde la guía.
- Cambios en `islas_ciudad.glb`, sus físicas, el catálogo NFT, el contrato o el
  relayer. La guía es de solo lectura.
- Teletransporte desde la guía: solo indica dónde ir; el jugador camina o usa
  el checkpoint correspondiente.
- Reproducir el onboarding, traducir la guía a varios idiomas o añadir voz.
- Cambiar el HUD de misiones, el chat, los ajustes o los controles móviles.

## 4. Requisitos

### Funcionales

| ID    | Requisito                                                                                                                                                                                                        | Prioridad |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| RF-1  | Existe `hubKiosks.svelte.ts` con `KioskId = 'shop' \| 'tourism'`, la tabla `VILLAGE_KIOSKS` y el estado reactivo `nearbyId`, `panelId`.                                                                          | alta      |
| RF-2  | La tienda se coloca en `(-17.2, y, 0)` y el turismo en `(16.9, y, 0)`, con `y` ajustada a la altura real del suelo del claro; ambos miran hacia el centro. La tabla de §11 es la fuente de verdad.               | alta      |
| RF-3  | `Kiosks.svelte` monta un `KioskMarker` por kiosco solo dentro del hub (`sceneState.inHub`), junto a `Checkpoints` y `Cats`, y no crea colliders ni objetos por frame.                                            | alta      |
| RF-4  | El marcador muestra disco en el suelo, anillo pulsante, haz vertical, un icono flotante y un cartel 3D con `HALLOWEEN SHOP` / `VILLAGE GUIDE`; el color es naranja para la tienda y turquesa para turismo.       | alta      |
| RF-5  | La proximidad se recalcula como máximo a 10 Hz con `playerState`, radio `3.2 m` en XZ y `2.5 m` en Y; solo escribe en el store cuando el resultado cambia.                                                       | alta      |
| RF-6  | Caminar hasta el kiosco muestra `KioskPrompt` con nombre, pista, `E` y botón táctil (`Browse` / `Guide`), sin tapar los controles móviles.                                                                       | alta      |
| RF-7  | `E` abre el panel del kiosco con las mismas guardas que `CatPrompt`: sin repetición, sin `Ctrl`/`Meta`/`Alt`, fuera de campos editables, con el chat cerrado y sin diálogo de NPC abierto.                       | alta      |
| RF-8  | `#shop-panel` es un modal que muestra las 11 skins de `SKINS`, con `SkinPreview` de la seleccionada, nombre, descripción, estado (`Available` / `Locked` / `Equipped`) y condición de desbloqueo.                | alta      |
| RF-9  | `#shop-panel` permite equipar una skin desbloqueada con `cosmetics.equip()`; una bloqueada no se puede equipar y muestra el título de la misión que la desbloquea (`missions.missionTitle`).                     | alta      |
| RF-10 | `#shop-panel` incluye un enlace «Not sure how to unlock it? See the village guide →» que cierra la tienda y abre el panel de turismo.                                                                            | media     |
| RF-11 | `#tourism-panel` lista las **nueve** actividades de `VILLAGE_GUIDE` (explorar, gatos, cripta, Grand Prix, Haunted Highway, Barn Siege, Deathmatch, Parkour y **Skyfall Royale**) con kicker, título, estado, mapa, recompensa de skin, recompensa NFT y ubicación. | alta      |
| RF-12 | La guía muestra el estado real de `SPEC-015`: gatos `n/25` y completado según `missions.capturedCount` / `missions.completed`; cripta y minijuegos según `missions.isMissionCompleted`; actividades libres como `Always open` / `Free ride`. | alta      |
| RF-13 | Seleccionar una actividad actualiza un único visor 3D `GuidePreview` con su `OnboardingPreviewKind`; el canvas anterior se desmonta (`{#key entry.id}`) y nunca hay más de un canvas de guía montado a la vez.   | alta      |
| RF-14 | Cada actividad muestra su descripción, viñetas de qué se hace, controles, **recompensa de skin** y **recompensa NFT de `SPEC-045`** (pista, tramo, misión y catálogo), reutilizando `onboardingTutorial.ts` y `missions/progression.ts`. | alta      |
| RF-15 | La guía indica dónde ir con una frase de dirección desde la oficina (N/E/S/O), el mapa (`NearBox village`, `Islas Ciudad`, etc.) y la etiqueta/color del checkpoint 3D cuando existe; no revela coordenadas numéricas. | media     |
| RF-16 | Al abrir el panel se enfoca el botón de cerrar y se marca `role="dialog"`, `aria-modal="true"` y `aria-labelledby`; `Escape` lo cierra.                                                                          | alta      |
| RF-17 | Los paneles se cierran con `X`, `Escape`, clic en el fondo o al salir del hub, abrir el chat, abrir ajustes o entrar en un coche/carrera.                                                                        | alta      |
| RF-18 | Mientras un panel está abierto, `PlayerBehaviour` libera teclas e intenciones (`pressed`, `playerInput`, `resetPlayerIntent`, `endPreview`) para que el avatar no siga caminando.                                | alta      |
| RF-19 | Mientras un kiosco está cerca, `E` no dispara `HR_pickup` ni el checkpoint de minijuego; el jugador ve la animación de interacción solo al pulsar en el panel.                                                   | media     |
| RF-20 | Prioridad de avisos: gato > diálogo de NPC > kiosco > checkpoint. Si el gato o el NPC están activos, `KioskPrompt` no aparece y no consume `E`.                                                                  | alta      |
| RF-21 | Si el jugador está en la cripta, en una carrera, en el roadmap, en Barn Siege, en el deathmatch, en el parkour, en **Skyfall Royale / `islas-ciudad`** o en el onboarding, no se muestran kioscos, avisos ni paneles. | alta      |
| RF-22 | Los paneles usan `z-[70]`, fondo oscuro con `backdrop-blur`, `pointer-events` correctos y botones de al menos `44 px` en táctil; el aviso sube con `html.touch-controls-active`.                                 | media     |
| RF-23 | No se añaden claves de `localStorage`, mensajes WebSocket ni cambios en `backend/`; la tienda se deriva de `playerProfile` / `cosmetics`, la guía de `missions` / `cosmetics` y las recompensas NFT de `progression` (`SPEC-045`). | alta      |
| RF-24 | La tienda y la guía funcionan con el backend apagado y con `localStorage` corrupto, usando el estado por defecto en memoria y la caché de progresión; la guía nunca rompe por falta de snapshot NFT.              | alta      |
| RF-25 | `villageGuide.ts` añade a cada entrada `progressionTrack`, `progressionMissionId`, `mapId` y `mapLabel`; la entrada `royale` apunta a `royale-kills-10` y a `islas-ciudad`. No se inventan recompensas: el catálogo y el objetivo vienen de `missions/progression.ts`. | alta      |
| RF-26 | La tarjeta NFT muestra pista, tramo, título de misión, `valor/objetivo`, recompensa (`sniper-gold`, `bazooka-gold`, `ghost`, etc.) y estado `Locked` / `Available` / `In progress` / `Ready to claim` / `Claimed` desde `progression.missionState()`. | alta      |
| RF-27 | El kiosco **no** mintea, no reclama, no firma ni escribe `RewardClaim`; solo muestra el estado y el texto «Claim it in Mission Central → Rewards». El reclamo sigue en `MissionHud → Rewards` y `POST /rewards/claim`. | alta      |
| RF-28 | Con `progression.snapshot === null` (sin sesión, offline o backend caído) la guía sigue mostrando el nombre de la recompensa NFT desde el catálogo estático y el estado `Sync to track`, sin errores ni tarjetas vacías. | alta      |
| RF-29 | Skyfall Royale se documenta como parte del mapa `islas-ciudad` (`SPEC-040`); la guía no monta el GLB ni las físicas del battle royale, solo enlaza su checkpoint `(60, 0.4, 60)` y su preview de actividad. | media     |

### No funcionales

| ID     | Requisito             | Criterio                                                                                                                                 |
| ------ | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| RNF-1  | Sin dependencias.     | Solo Svelte, Threlte, Three, Tailwind, Lucide y APIs ya usadas.                                                                          |
| RNF-2  | Sin errores de tipos. | `cd frontend && bun run check` termina con código 0.                                                                                     |
| RNF-3  | Formato.              | `bunx prettier --check` sobre los archivos del spec pasa.                                                                                |
| RNF-4  | Build.                | `cd frontend && bun run build` termina con código 0.                                                                                     |
| RNF-5  | SSR seguro.           | Ningún `window`, `document` o medición DOM fuera de `$effect`, `onMount` o componentes montados solo en cliente.                         |
| RNF-6  | Rendimiento.          | Proximidad a 10 Hz, sin asignaciones por frame; un solo canvas 3D de guía montado; los canvas se desmontan al cerrar.                    |
| RNF-7  | Sin fugas.            | `KioskMarker` libera texturas, geometrías y materiales en `$effect`; los listeners de teclado y `pointerdown` se limpian.                |
| RNF-8  | Accesibilidad.        | Diálogo con `aria-modal`, foco inicial, cierre con `Escape`, botones con etiqueta y `aria-pressed` en la selección de skins/actividades. |
| RNF-9  | No regresiones.       | Chat, checkpoints, gatos, NPCs, jukebox, carreras, cripta, Skyfall Royale y controles móviles siguen funcionando.                        |
| RNF-10 | Sin backend.          | `backend/` no cambia y el juego funciona sin conexión; la guía usa la caché/snapshot de `progression` cuando existe.                     |
| RNF-11 | Solo lectura NFT.     | La guía no llama a `/rewards/claim`, al relayer ni al contrato; el estado NFT es una proyección de `progression` y `progression.ts`.     |

## 5. Criterios de aceptación

- [x] CA-1: Al caminar frente a la tienda aparece un aviso «Halloween Shop — Press E to browse the wardrobe» con botón `Browse`; al alejarse desaparece.
- [x] CA-2: `E` frente a la tienda abre `#shop-panel`; el panel muestra las 11 skins y la vista 3D de la equipada.
- [x] CA-3: En la tienda, una skin desbloqueada se puede equipar y el cambio persiste al recargar; una bloqueada muestra la misión necesaria y no se equipa.
- [x] CA-4: El enlace «Not sure how to unlock it? See the village guide →» cierra la tienda y abre el panel de turismo.
- [x] CA-5: Al caminar frente al centro de turismo aparece «Tourism Office — Press E to read the village guide»; `E` abre `#tourism-panel`.
- [x] CA-6: La guía lista las **nueve** actividades y muestra el estado real de `SPEC-015` (gatos `n/25`, completado) y de los minijuegos.
- [x] CA-7: Al seleccionar cada actividad se ven su título, descripción, viñetas, controles, **recompensa de skin**, **recompensa NFT** (pista, tramo, misión y estado), **mapa**, ubicación y un visor 3D.
- [x] CA-8: Solo hay un canvas de visor montado a la vez; al cambiar de actividad el anterior desaparece.
- [x] CA-9: `Escape`, `X` y el clic en el fondo cierran ambos paneles; el jugador recupera el control y puede volver a caminar.
- [x] CA-10: Con un panel abierto, `WASD` no mueve al jugador y `E` no captura gatos, no abre checkpoints y no dispara `HR_pickup`.
- [x] CA-11: Si hay un gato o un NPC interactuable al lado, el aviso del kiosco no aparece y `E` responde al gato/NPC.
- [x] CA-12: En la cripta, en una carrera, en Skyfall Royale (`islas-ciudad`) o durante el onboarding no aparecen kioscos, avisos ni paneles; al salir del hub, los paneles abiertos se cierran.
- [x] CA-13: En viewport móvil, el botón del aviso y los del panel son táctiles, no se solapan con el stick/salto/correr y el aviso sube por encima de los controles.
- [x] CA-14: Con el backend apagado y `localStorage` corrupto, ambos paneles abren y muestran el estado por defecto sin romper la app.
- [x] CA-15: `bun run check`, Prettier acotado, `bun run build`, `bun run map:check` y `bun run royale:check` pasan; no hay cambios en `backend/`.
- [x] CA-16: La entrada **Skyfall Royale** aparece en la guía con su misión local `royale-first-win`, checkpoint `minigame-8`, mapa `Islas Ciudad`, estado de las misiones `royale-*` y recompensas NFT `sniper-gold` → `bazooka-gold` → `ghost`.
- [x] CA-17: Cada actividad muestra su pista de progresión (`barn`, `royale`, `gp`, `hexfire`, `parkour`, `crypt`, `explorer`), su primer tramo NFT y el `valor/objetivo` de la misión cuando hay snapshot.
- [x] CA-18: Una misión NFT completada muestra `Ready to claim` y el texto «Claim it in Mission Central → Rewards»; una reclamada muestra `Claimed`; una bloqueada, `Locked` con su motivo.
- [x] CA-19: La guía no mintea ni reclama: abrir el panel, cambiar de actividad y cerrarlo no llama a `/rewards/claim`, al relayer ni al contrato, y no escribe `RewardClaim`.
- [x] CA-20: Sin sesión, con el backend caído o sin snapshot de progresión, la tarjeta NFT sigue mostrando el nombre del catálogo y `Sync to track`, sin errores ni tarjetas vacías.
- [x] CA-21: El mapa de la actividad se muestra en «Where to go» (`NearBox village`, `Mausoleum Crypt`, `Islas Ciudad`, `Barn Siege farm`, etc.) y coincide con `SPEC-040` para Skyfall Royale.

## 6. Archivos relevantes

| Ruta                                                           | Acción     | Motivo                                                                 |
| -------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------- |
| `frontend/src/lib/state/hubKiosks.svelte.ts`                   | crear      | Tipos, tabla de kioscos y estado `nearbyId` / `panelId`.               |
| `frontend/src/lib/components/world/Kiosks.svelte`              | crear      | Render de los kioscos y detección de proximidad a 10 Hz.               |
| `frontend/src/lib/components/world/KioskMarker.svelte`         | crear      | Disco, anillo, haz y cartel flotante de cada kiosco.                   |
| `frontend/src/lib/components/world/KioskLabel.svelte`          | crear      | Cartel 3D con `helvetiker_bold`, sin dependencias del lobby.           |
| `frontend/src/lib/components/ui/KioskPrompt.svelte`            | crear      | Aviso contextual, tecla `E` y botón táctil.                            |
| `frontend/src/lib/components/ui/ShopPanel.svelte`              | crear      | Div de la tienda con catálogo, vista 3D y equipado.                    |
| `frontend/src/lib/components/ui/TourismPanel.svelte`           | modificar  | Div de información con 9 actividades, mapa, recompensas de skin/NFT y visor 3D. |
| `frontend/src/lib/components/ui/villageGuide.ts`               | modificar  | Contenido y metadatos de las nueve actividades, pista NFT y mapa.      |
| `frontend/src/lib/components/ui/GuidePreview.svelte`           | crear      | `Canvas` + `OnboardingPreviewStage` reutilizado por la guía.           |
| `frontend/src/lib/Scene.svelte`                                | modificar  | Montar `<Kiosks />` dentro del hub, junto a `<Checkpoints />`.         |
| `frontend/src/lib/GamePage.svelte`                             | modificar  | Montar `<KioskPrompt />`, `<ShopPanel />` y `<TourismPanel />`.        |
| `frontend/src/lib/components/player/PlayerBehaviour.svelte`    | modificar  | Liberar input con el panel abierto y ceder `E` al kiosco cercano.      |
| `frontend/src/lib/components/ui/CheckpointPrompt.svelte`       | modificar  | Ocultar el aviso de checkpoint si hay un kiosco cerca.                 |
| `frontend/src/lib/components/ui/NpcPrompt.svelte`              | modificar  | Ceder prioridad al NPC y no abrir kiosco si hay diálogo.               |
| `frontend/src/lib/components/ui/CatPrompt.svelte`              | modificar  | No capturar gatos mientras un panel de kiosco está abierto.            |
| `frontend/src/lib/components/ui/OnboardingPreviewStage.svelte` | reutilizar | Visores 3D de las actividades (`SPEC-019`); Skyfall Royale reutiliza el escenario existente. |
| `frontend/src/lib/components/ui/SkinPreview.svelte`            | reutilizar | Visor 3D de la skin seleccionada en la tienda.                         |
| `frontend/src/lib/missions/progression.ts`                     | reutilizar | Catálogo de 26 misiones NFT, pistas, tramos y `reward.catalogId`.      |
| `frontend/src/lib/state/progression.svelte.ts`                 | reutilizar | `missionState()`, `snapshot`, `completedCount` y `claimedCount`.       |
| `frontend/src/lib/components/ui/RewardCard.svelte`             | referencia | Mismo lenguaje visual de recompensa NFT; no se monta en el kiosco.    |
| `frontend/src/lib/components/ui/MissionHud.svelte`             | referencia | `Mission Central → Rewards` es donde se reclaman los NFT.              |
| `frontend/src/lib/state/royaleConfig.ts`                       | referencia | Timings, path, tormenta y datos de Skyfall Royale (`SPEC-040`).        |
| `frontend/src/lib/state/checkpoints.svelte.ts`                 | referencia | Checkpoint `minigame-8` `SKYFALL ROYALE` en `(60, 0.4, 60)`.          |
| `frontend/world/maps.json`                                     | referencia | Entrada `islas-ciudad` con spawn, físicas `chunked` y `lighting`.       |
| `frontend/src/lib/components/world/Checkpoint.svelte`          | referencia | Lenguaje visual del marcador; no se modifica.                          |
| `frontend/src/lib/components/world/ClubMusicBooth.svelte`      | referencia | Patrón de proximidad por `playerState` en `useTask`; no se modifica.   |
| `frontend/src/lib/components/world/Map.svelte`                 | sin cambio | Solo se usa como referencia de coordenadas y fachada de los edificios. |
| `frontend/src/lib/missions/cats.ts`                            | sin cambio | Fuente de la misión `cats-25` y su progreso.                           |
| `frontend/src/lib/missions/crypt.ts`                           | sin cambio | Fuente de la misión `crypt-5-skulls`.                                  |
| `frontend/src/lib/missions/minigames.ts`                       | sin cambio | Fuente de las misiones de Grand Prix, Barn Siege, Hexfire y Parkour.   |
| `frontend/src/lib/cosmetics/skins.ts`                          | sin cambio | Catálogo de las 11 skins y sus condiciones de desbloqueo.              |
| `frontend/src/lib/state/missions.svelte.ts`                    | sin cambio | Progreso y `isMissionCompleted()` para la guía.                        |
| `frontend/src/lib/state/cosmetics.svelte.ts`                   | sin cambio | `isUnlocked()`, `equip()` y `rewardsForMission()`.                     |
| `backend/src/index.ts`                                         | sin cambio | La tienda y la guía son locales; no hay mensajes nuevos.               |
| `backend/src/ws/protocol.ts`                                   | sin cambio | No se añaden tipos al protocolo.                                       |

## 7. Plan de implementación

### Fase 1 — Datos y estado del kiosco

- [x] Paso 1: Crear `frontend/src/lib/state/hubKiosks.svelte.ts` con:
  - `export type KioskId = 'shop' | 'tourism';`
  - `KioskDefinition = { id, name, label, subtitle, hint, prompt, action, position: [number, number, number], color, radius }`.
  - `VILLAGE_KIOSKS` con las dos entradas de §11.
  - `HubKiosksStore` con `nearbyId = $state<KioskId | null>(null)` y
    `panelId = $state<KioskId | null>(null)`.
  - Derivados `nearby`, `panel`, `panelOpen` y métodos `setNearby(id)`,
    `open(id)`, `close()` y `reset()`.
- [x] Paso 2: Crear `frontend/src/lib/components/ui/villageGuide.ts` con
      `VillageGuideEntry` y `VILLAGE_GUIDE` (nueve entradas de §11). Importar
      `OnboardingPreviewKind` y `TutorialControl` desde `onboardingTutorial.ts` para
      no duplicar tipos ni copy, y `ProgressionTrackId` desde
      `missions/progression.ts`. Cada entrada declara `missionId`,
      `checkpointId`, `location`, `rewardSkinId`, `progressionTrack`,
      `progressionMissionId`, `mapId`, `mapLabel` y su `preview`.
- [x] Paso 3: Verificar que los textos de la guía no inventan mecánicas: copiar
      las viñetas y controles de `onboardingTutorial.ts` y ajustar solo la parte de
      ubicación/recompensa.

### Fase 2 — Marcadores en el mundo

- [x] Paso 4: Crear `KioskLabel.svelte` tomando como base
      `CheckpointLabel.svelte`, pero sin `checkpoints` ni `lobby`:
  - Usar `asset('fonts/helvetiker_bold.typeface.json')` y `Text3DGeometry`.
  - Mostrar el título en mayúsculas y el subtítulo (`PRESS E TO BROWSE` /
    `PRESS E FOR THE GUIDE`).
  - Liberar las geometrías y materiales al desmontar.
- [x] Paso 5: Crear `KioskMarker.svelte`:
  - Disco, anillo, halo, haz y un icono flotante simple (bolsa para la tienda,
    mapa para turismo) usando `MeshBasicMaterial` y blending aditivo.
  - Animar pulsación y rotación en `useTask`; nada de allocations por frame.
  - Liberar texturas, geometrías y materiales en `$effect`.
  - Aceptar `active` para intensificar el brillo cuando el jugador está cerca.
- [x] Paso 6: Crear `Kiosks.svelte`:
  - Renderizar `VILLAGE_KIOSKS` con `{#each ... (kiosk.id)}`.
  - En `useTask`, con un acumulador de 100 ms, calcular el kiosco más cercano
    con `playerState` y `sceneState.inHub`; llamar a `hubKiosks.setNearby()`
    solo si cambia el id, comparando con `hubKiosks.nearbyId` para no pisar
    reseteos externos (chat, ajustes, salida del hub).
  - Limpiar `nearbyId` al desmontar o al salir del hub.
- [x] Paso 7: Medir la altura real de los dos puntos. El disco del claro
      (`Circle`) tiene su cara superior en `y = 0.4` y los suelos `Shop_Floor` /
      `TO_Floor` están a `0.36–0.42`, así que ambos pads usan `y = 0.4` y el disco
      se dibuja `0.012` por encima. Los pads quedan fuera del mostrador, del cartel
      A-frame, del bucle de NPCs del centro (radio 14) y de `cat-01` / `cat-05`.

### Fase 3 — Aviso y paneles

- [x] Paso 8: Crear `KioskPrompt.svelte`:
  - `kiosk = $derived(sceneState.inHub ? hubKiosks.nearby : null)`.
  - Ocultar si `missions.nearestCatId !== null`, `npcs.canInteract`,
    `npcs.dialogOpen`, `clubMusic.nearby`, `chat.isOpen`, `cars.isDriving`,
    `race.inCar`, `minigame5.isDriving` o `hubKiosks.panelOpen`.
  - Listener `keydown` con `event.code === 'KeyE'`, sin repetición, sin
    modificadores, fuera de campos editables y con `!event.defaultPrevented`.
  - Al abrir, llamar a `hubKiosks.open(kiosk.id)`; no tocar `lobby`.
  - Contenedor `fixed inset-x-0 bottom-6 z-40 pointer-events-none`; botón con
    `pointer-events-auto`; subir a `11rem` con `html.touch-controls-active`.
- [x] Paso 9: Crear `ShopPanel.svelte` (`#shop-panel`):
  - `open = $derived(hubKiosks.panelId === 'shop')`.
  - Estado local `selectedId` inicializado con `cosmetics.equippedSkin`.
  - Vista 3D `<SkinPreview skin={selected.id} />` y ficha con nombre,
    descripción, estado y condición (`missions.missionTitle`).
  - Rejilla de las 11 skins con `SKIN_ICONS` / `SKIN_TONES`, `aria-pressed` y
    candado en las bloqueadas.
  - Botón `Equip` habilitado solo si `cosmetics.isUnlocked(selected.id)`;
    tras equipar, mantener el panel abierto y actualizar el estado.
  - Enlace «See the village guide» que llama a
    `hubKiosks.open('tourism')` (el panel cambia sin recargar).
  - Cerrar con `X`, `Escape` y clic en el fondo; foco inicial en el botón de
    cerrar; `role="dialog"` y `aria-modal="true"`.
- [x] Paso 10: Crear `GuidePreview.svelte`:
  - `Canvas` de Threlte + `OnboardingPreviewStage` con la prop `kind`.
  - Contenedor `h-full w-full` y `aria-hidden="true"`.
- [x] Paso 11: Crear `TourismPanel.svelte` (`#tourism-panel`):
  - Cabecera «Tourism Office» y subtítulo «Everything you can do in NearBox ·
    9 activities · NFT rewards».
  - Columna/lista de las nueve actividades: kicker, título, chip de estado,
    recompensa de skin y recompensa NFT. La selección inicial es la primera
    actividad no completada (gatos si están pendientes, si no cripta, etc.).
  - Panel derecho con `<GuidePreview kind={entry.preview} />` dentro de
    `{#key entry.id}`, descripción, viñetas, controles, tarjeta de skin,
    tarjeta NFT (pista, tramo, misión, progreso y estado de reclamo), mapa y
    `entry.location`.
  - Estado de misión calculado con `missions` y `cosmetics`:
    `n/25` para gatos, completado para cripta/minijuegos, `Always open` para
    explorar y Haunted Highway. El estado NFT se calcula con
    `progression.missionState(entry.progressionMissionId)`.
  - Responsive: en móvil el visor queda arriba y la lista debajo con scroll
    interno; en escritorio, lista a la izquierda y visor a la derecha.
- [x] Paso 12: Revisar los textos de la guía contra las fuentes reales:
      `SPEC-015` (25 gatos, recompensa Scarecrow), `SPEC-019` (onboarding y
      catálogo de skins), `SPEC-040` (Skyfall Royale, `islas-ciudad`, checkpoint
      `(60, 0.4, 60)`), `SPEC-045` (pistas, tramos y `catalog_id` NFT) y las
      specs de cada minijuego (`SPEC-010`, `SPEC-011`, `SPEC-018`, `SPEC-021`,
      `SPEC-023`, `SPEC-025`, `SPEC-026`). No prometer recompensas ni teclas
      que no existan.

### Fase 4 — Integración y guardas de entrada

- [x] Paso 13: En `Scene.svelte`, montar `<Kiosks />` dentro de
      `{#if sceneState.inGlobal}` y `{#if !sceneState.inRace}`, junto a
      `<Checkpoints />` y `<Cats />`, para que no aparezca en la cripta,
      `islas-ciudad` / `inRoyale` ni en las carreras.
- [x] Paso 14: En `GamePage.svelte`, montar `<KioskPrompt />`, `<ShopPanel />` y
      `<TourismPanel />` en el mismo bloque que `<CheckpointPrompt />` y
      `<MissionHud />`, solo cuando `gameReady` y el onboarding no está abierto.
- [x] Paso 15: En `PlayerBehaviour.svelte`:
  - Añadir `hubKiosks.panelOpen` al `$effect` que limpia `pressed`,
    `playerInput`, `resetPlayerIntent`, `oneShot` y `endPreview`.
  - Añadir `hubKiosks.nearby` a la guarda que impide `HR_pickup` con `E`,
    igual que `clubMusic.nearby`.
- [x] Paso 16: En `CheckpointPrompt.svelte`, ocultar el aviso y no procesar
      `E` cuando `hubKiosks.nearbyId !== null` o hay un panel abierto; el kiosco
      gana al checkpoint.
- [x] Paso 17: En `NpcPrompt.svelte`, no procesar `E` ni abrir un NPC mientras
      `hubKiosks.panelOpen`. En sentido inverso, `KioskPrompt` ya se oculta con
      `npcs.canInteract` y `npcs.dialogOpen`, así que el NPC conserva la prioridad.
      `CatPrompt` también ignora `E` con un panel abierto.
- [x] Paso 18: Cerrar los paneles al salir del hub o al abrir chat/ajustes:
      un `$effect` en `GamePage.svelte` llama a `hubKiosks.reset()` cuando no hay
      `gameReady`, el onboarding está abierto, no se está en el hub, el chat está
      abierto o el jugador conduce. `SettingsMenu` llama a `hubKiosks.close()` al
      abrirse.
- [x] Paso 19: Revisar `z-index`, solapes y responsive con
      `ChatOverlay` (izquierda), `SettingsMenu` (derecha), `MissionHud` (arriba
      izquierda), `TrackSelectDialog` (`z-[60]`), `OnboardingOverlay` (`z-[90]`) y
      `MobileControls` (abajo). Los paneles usan `z-[70]`.

### Fase 5 — Verificación y cierre

- [x] Paso 20: Ejecutar la verificación de §8 y corregir errores.
- [x] Paso 21: Probar los casos manuales, incluida la prioridad con gatos/NPCs,
      la cripta, el modo táctil y el backend apagado.
- [x] Paso 22: Actualizar `estado`, `actualizado`, checkboxes, «Progreso» y
      «Changelog» de este spec.

### Fase 6 — Recompensas NFT y nuevo mapa (2026-11-14)

- [x] Paso 23: Extender `villageGuide.ts` con `progressionTrack`,
      `progressionMissionId`, `mapId` y `mapLabel`. Mapear cada actividad a su
      pista de `SPEC-045` y a su primer hito NFT: `cats-25` → `witch`,
      `crypt-5` → `crown`, `gp-podium-3` → `skateboard`, `barn-kills-25` →
      `shotgun-gold`, `hexfire-wins-5` → `demon`, `parkour-wins-3` → `ghost`
      y `royale-kills-10` → `sniper-gold`.
- [x] Paso 24: Añadir la entrada **Skyfall Royale** a la guía con
      `checkpointId: 'minigame-8'`, `mapId: 'islas-ciudad'`,
      `mapLabel: 'Islas Ciudad'`, misión local `royale-first-win` y pista
      `royale` de `SPEC-040` / `SPEC-045`.
- [x] Paso 25: En `TourismPanel.svelte`, añadir la tarjeta NFT con
      `missionById()` y `progression.missionState()`: pista, tramo, título,
      `valor/objetivo`, catálogo y estado `Locked` / `Available` / `In progress`
      / `Ready to claim` / `Claimed`. Sin mutaciones: el texto enlaza a
      `Mission Central → Rewards`.
- [x] Paso 26: Mostrar el mapa de la actividad en «Where to go» y añadir el
      contador «9 activities · NFT rewards» en la cabecera. Con snapshot nulo,
      mostrar `Sync to track` sin romper la tarjeta.
- [x] Paso 27: Verificar `bun run check`, Prettier de `TourismPanel` /
      `villageGuide`, `bun run build`, `map:check` y `royale:check`; confirmar
      que no se llama a `/rewards/claim` desde el kiosco.

### Contrato de datos

```ts
// frontend/src/lib/state/hubKiosks.svelte.ts
export type KioskId = "shop" | "tourism";

export type KioskDefinition = {
  id: KioskId;
  name: string;
  /** Cartel 3D en mayúsculas; helvetiker no tiene acentos. */
  label: string;
  /** Línea pequeña bajo el cartel 3D (`PRESS E TO BROWSE`). */
  subtitle: string;
  hint: string;
  /** Frase tras la tecla `E` en el aviso inferior. */
  prompt: string;
  action: string;
  /** Centro del pad en mundo; `y = 0.4` es la cara del claro. */
  position: [number, number, number];
  color: string;
  radius: number;
};
```

```ts
// frontend/src/lib/components/ui/villageGuide.ts
import type { SkinId } from "../../cosmetics/skins";
import type { ProgressionTrackId } from "../../missions/progression";
import type { MinigameLobbyId } from "../../services/protocol";
import type {
  OnboardingPreviewKind,
  TutorialControl,
} from "./onboardingTutorial";

export type VillageGuideEntry = {
  id: string;
  kicker: string;
  title: string;
  description: string;
  points: readonly string[];
  controls: readonly TutorialControl[];
  preview: OnboardingPreviewKind;
  accent: string;
  caption: string;
  /** Misión local cuyo estado y recompensa de skin se muestran. */
  missionId: string | null;
  /** Checkpoint del minijuego, si la actividad tiene uno. */
  checkpointId: MinigameLobbyId | null;
  /** Dirección y punto de referencia desde la oficina de turismo. */
  location: string;
  /** Skin que desbloquea la actividad, si tiene recompensa. */
  rewardSkinId: SkinId | null;
  /** Pista de progresión NFT de SPEC-045. */
  progressionTrack: ProgressionTrackId | null;
  /** Primer hito NFT de la pista (`royale-kills-10`, `barn-kills-25`…). */
  progressionMissionId: string | null;
  /** Mapa que aloja la actividad; `map` es el pueblo NearBox. */
  mapId: string;
  mapLabel: string;
};
```

```ts
// Estado NFT consumido por TourismPanel.svelte (solo lectura).
const nftMission = missionById(entry.progressionMissionId); // static catalog
const nftState = progression.missionState(entry.progressionMissionId); // live status
const nftStatus =
  nftState?.status === "claimed"
    ? "Claimed"
    : nftState?.status === "completed"
      ? "Ready to claim"
      : nftState?.status === "active"
        ? "In progress"
        : nftState?.status === "available"
          ? "Available"
          : progression.snapshot
            ? "Locked"
            : "Sync to track";
```

> `TourismPanel` nunca importa `auth`, el relayer ni el contrato: solo lee
> `progression.snapshot`. El botón de reclamo permanece en
> `MissionHud → Rewards`.

## 8. Verificación

```bash
# Frontend: tipos, formato acotado y build
cd frontend && bun run check
cd frontend && bunx prettier --check \
  src/lib/state/hubKiosks.svelte.ts \
  src/lib/components/world/Kiosks.svelte \
  src/lib/components/world/KioskMarker.svelte \
  src/lib/components/world/KioskLabel.svelte \
  src/lib/components/ui/KioskPrompt.svelte \
  src/lib/components/ui/ShopPanel.svelte \
  src/lib/components/ui/TourismPanel.svelte \
  src/lib/components/ui/villageGuide.ts \
  src/lib/components/ui/GuidePreview.svelte \
  src/lib/Scene.svelte \
  src/lib/GamePage.svelte \
  src/lib/components/player/PlayerBehaviour.svelte \
  src/lib/components/ui/CheckpointPrompt.svelte \
  src/lib/components/ui/NpcPrompt.svelte \
  src/lib/components/ui/CatPrompt.svelte \
  src/lib/components/ui/SettingsMenu.svelte
cd frontend && bun run build

# Mapa: sin cambios en mallas ni colliders
cd frontend && bun run map:check

# Skyfall Royale / islas-ciudad: datos, checkpoint y path
cd frontend && bun run royale:check

# Backend: sin cambios, se comprueba que sigue compilando
cd backend && bunx tsc --noEmit
```

Casos manuales:

1. Arrancar con el backend apagado y caminar hasta la tienda (`-17.2, 0.4, 0`).
   Comprobar que el marcador está a ras del suelo y que aparece el aviso.
2. Pulsar `E`: se abre `#shop-panel`, se ve la skin equipada en 3D y las 11
   tarjetas. Equipar una skin disponible, cerrar y recargar: se conserva.
3. Seleccionar una skin bloqueada: no se puede equipar y se muestra la misión
   necesaria y el enlace a la guía.
4. Caminar hasta el centro de turismo (`16.9, 0.4, 0`) y abrir la guía con `E`.
5. Recorrer las nueve actividades: cada una cambia el visor 3D, el título, las
   viñetas, los controles, el mapa y las tarjetas de recompensa; solo hay un
   canvas montado.
6. Completar la misión de gatos y abrir la guía: `25/25` y la recompensa
   Scarecrow marcada como desbloqueada/equipada.
7. Comprobar el estado de las misiones de cripta, Grand Prix, Barn Siege,
   Hexfire, Parkour y Skyfall Royale tras completarlas (o preparando
   `rw:missions:v1`).
8. Con un gato al lado de un kiosco, comprobar que el aviso del gato gana y que
   `E` captura el gato, no abre el kiosco.
9. Abrir el chat y los ajustes con el panel abierto: el panel se cierra y el
   foco vuelve al juego.
10. Entrar en la cripta, en una carrera y en Skyfall Royale (`islas-ciudad`):
    no hay kioscos ni avisos; al volver al mapa reaparecen.
11. Con el panel abierto, mantener `W`: el avatar no se mueve. Cerrar y
    comprobar que vuelve a moverse.
12. Probar `?touch=1`: el aviso sube sobre los controles y los botones del panel
    son cómodos de pulsar.
13. Cerrar con `X`, `Escape` y clic en el fondo; comprobar que no queda ningún
    listener ni canvas activo en DevTools.
14. Corromper `rw:missions:v1`, recargar: los paneles abren con el estado por
    defecto. Un `rw:profile:v1` corrupto reinicia el onboarding (comportamiento
    preexistente); al terminarlo, los paneles vuelven a funcionar.
15. Seleccionar **Skyfall Royale**: se ven el checkpoint `SKYFALL ROYALE`, el
    mapa `Islas Ciudad`, la misión local `royale-first-win` y las recompensas
    NFT `Golden Sniper` (T1) → `Golden Bazooka` (T2) → `Ghost` (T3).
16. Con sesión y snapshot de progresión, comprobar que una misión completada
    muestra `Ready to claim` y que una reclamada muestra `Claimed`; sin sesión,
    la tarjeta muestra `Sync to track` y el nombre del NFT.
17. Reclamar `sniper-gold` en `Mission Central → Rewards`, volver al kiosco y
    comprobar que el estado pasa a `Claimed` sin recargar la página.
18. Con el backend apagado y sin snapshot, abrir la guía y recorrer las nueve
    actividades: ninguna tarjeta NFT rompe el panel ni dispara peticiones de
    reclamo.

> **Pendiente de prueba manual del usuario (2026-11-14).** Esta actualización
> se validó solo con `bun run check`; el flujo con login/NFT y el render de
> `islas-ciudad` queda para una sesión autenticada.

### Validación en runtime (2026-11-12)

Se ejecutó el juego en Chromium headless con render por software, perfil local
sembrado (`onboardingCompleted: true`) y los helpers de desarrollo
`window.__world` para colocar al jugador en cada pad:

- Los dos marcadores se ven desde el spawn, a ras de suelo, con disco, anillo,
  haz, icono flotante y cartel 3D (`HALLOWEEN SHOP` / `VILLAGE GUIDE`).
- En `(-17.2, 0.4, 0.2)` y `(16.9, 0.4, 0.2)` aparece el aviso correcto con el
  texto nuevo (`Press E to browse the wardrobe` / `Press E to read the village
guide`) y el botón `Browse` / `Guide`; a 8 m del pad desaparece.
- `E` abre el panel y oculta el aviso. La tienda muestra 11 tarjetas, un canvas
  y el foco en cerrar; la guía muestra 8 actividades, sus estados reales y un
  único canvas al recorrer las ocho.
- Equipar Scarecrow desde la tienda escribe `equippedSkin: "crow-warden"` en
  `rw:profile:v1` y mueve la insignia; una skin bloqueada (Demon) muestra la
  misión `Hexfire Deathmatch` y no se puede equipar.
- El enlace «See the village guide» cambia de panel sin recargar y sin dejar los
  dos abiertos.
- El panel se cierra con `X`, `Escape` y clic en el fondo; el aviso vuelve al
  cerrar y el canvas de la guía se desmonta.
- Con un panel abierto, mantener `W` no mueve al jugador (desplazamiento
  `< 1e-6 m`).
- Junto a `cat-01` (`-14, 0, 6`) aparece el aviso del gato y no el del kiosco.
- Viewport móvil `390×844` con `?touch=1`: `touch-controls-active`, aviso a
  `176 px` del fondo con botón de `44 px`, panel de `366×776` y cerrar de
  `44×44`.
- Con `rw:missions:v1` corrupto, la guía abre con `0/25` y ocho entradas.
- Con `/ws` y `/club` bloqueados (backend caído), ambos paneles abren y
  muestran el catálogo completo; el progreso local sigue funcionando.
- Sin errores de consola en el flujo normal (backend conectado).

### Actualización de la guía (2026-11-14)

- Se añadieron la novena actividad (**Skyfall Royale**) y las recompensas NFT
  de `SPEC-045` a `villageGuide.ts` y `TourismPanel.svelte`.
- `bun run check` pasa sin errores; el build y la prueba visual quedan a cargo
  del usuario porque requieren sesión y no se ejecutaron aquí.

## 9. Riesgos y mitigaciones

| Riesgo                                                           | Impacto | Mitigación                                                                                                                 |
| ---------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| Los pads quedan enterrados o flotando por la altura del claro    | medio   | Medir con `?physics=1`, ajustar `y` en la tabla y validar a pie de cada edificio.                                          |
| El aviso del kiosco tapa el del gato o el de un checkpoint       | medio   | Prioridad explícita gato > NPC > kiosco > checkpoint; `KioskPrompt` comprueba `missions.nearestCatId` y `npcs`.            |
| Dos canvas 3D (tienda y guía) consumen demasiados contextos      | medio   | Solo se monta el canvas del panel abierto; la guía usa un único `GuidePreview` con `{#key}`; se desmonta al cerrar.        |
| El jugador sigue caminando mientras lee el panel                 | alto    | `hubKiosks.panelOpen` limpia `pressed`, `playerInput` y `resetPlayerIntent`, como hace `clubMusic.panelOpen`.              |
| La guía promete recompensas o teclas incorrectas                 | alto    | El contenido se copia de `onboardingTutorial.ts`, de `missions/progression.ts` y de las specs de cada minijuego; revisión del Paso 12. |
| La guía se interpreta como un lugar para reclamar NFT            | medio   | La tarjeta usa solo lectura y el texto «Claim it in Mission Central → Rewards»; el `RewardCard`/`Claim` no se monta en el kiosco.    |
| El estado NFT no carga sin sesión o backend caído                | medio   | `nftStatusFor()` distingue `Sync to track`; el nombre de la recompensa sale del catálogo estático `progression.ts`, no de la red.    |
| El catálogo de progresión cambia y la guía queda desfasada       | medio   | `progressionMissionId` apunta a IDs estables de `SPEC-045`; `missionById()` devuelve `null` y la tarjeta se oculta sin romper.         |
| Skyfall Royale confunde su mapa con el hub                       | bajo    | La entrada usa `mapId: 'islas-ciudad'` y muestra «Islas Ciudad»; el kiosco no monta el GLB ni las físicas de `SPEC-040`.             |
| La tienda se interpreta como una economía real                   | medio   | Se define como escaparate/vestuario; no hay monedas ni precios. La compra queda como pregunta abierta para otra spec.      |
| El panel tapa el chat, los ajustes o los controles móviles       | medio   | `z-[70]`, cierre al abrir chat/ajustes, botones `min-h-11`, aviso elevado con `html.touch-controls-active`.                |
| Se rompe la interacción de los checkpoints de minijuego          | alto    | Los kioscos usan un store y un componente aparte; `CheckpointPrompt` solo añade una guarda y `Checkpoints` no se modifica. |
| Un kiosco cae sobre el bucle de NPCs del centro                  | bajo    | Los pads están en `x = ±17`, fuera del radio 14 del bucle `centro`; validar con `?npcs=1`.                                 |
| El canvas del onboarding se reutiliza con un `kind` no soportado | bajo    | `VILLAGE_GUIDE` usa los `OnboardingPreviewKind` existentes; Skyfall Royale reutiliza el escenario de Parkour hasta tener un diorama propio. TypeScript lo verifica. |

## 10. Preguntas abiertas (resueltas)

- [x] ¿La tienda debe cobrar monedas o vender desbloqueos?
      No en esta spec. No existe economía y `SPEC-019` define los desbloqueos
      por misión. La tienda es un escaparate/vestuario con vista 3D y equipado.
      Si se quiere una economía real, se hará en una spec aparte.
- [x] ¿Los kioscos deben usar sensores Rapier como los checkpoints?
      No. Se usa proximidad por `playerState` a 10 Hz, como el jukebox del club:
      no añade colliders ni interfiere con el controlador del jugador.
- [x] ¿Hace falta un GLB nuevo para la tienda o el turismo?
      No. Los dos edificios ya existen en `map.glb` y se reutilizan tal cual.
- [x] ¿La guía debe teletransportar al jugador?
      No. Solo indica la dirección y el checkpoint que hay que seguir.
- [x] ¿La guía debe traducirse?
      No en esta fase; usa el mismo inglés que el onboarding y el resto del HUD.
- [x] ¿Se deben mostrar las coordenadas exactas en la guía?
      No. Se muestra una dirección (N/E/S/O) y un punto de referencia visible,
      no números.
- [x] ¿Dónde se montan los marcadores si no es en `Map.svelte`?
      En `Kiosks.svelte`, montado desde `Scene.svelte`, igual que
      `Checkpoints.svelte`. `Map.svelte` solo aporta las posiciones y la
      fachada de los edificios; no se toca el GLB ni los colliders.
- [x] ¿Qué pasa si el jugador abre la tienda con la misión de gatos a medias?
      La tienda muestra igualmente todas las skins; las bloqueadas indican la
      misión y un enlace a la guía del turismo.
- [x] ¿La guía debe mostrar las recompensas NFT de `SPEC-045`?
      Sí. Cada actividad muestra la pista, el primer hito NFT, su catálogo y el
      estado de reclamo. Es solo lectura: el `Claim` sigue en la Central del HUD
      y el kiosco nunca mintea ni llama al relayer.
- [x] ¿La guía debe incluir Skyfall Royale y `islas-ciudad`?
      Sí. Es la novena actividad (`SPEC-040`), con su checkpoint
      `minigame-8`, su mapa y la pista `royale` de recompensas NFT
      (`sniper-gold` → `bazooka-gold` → `ghost`). La guía no monta el GLB del
      battle royale ni sus físicas.
- [x] ¿Qué pasa si no hay sesión o snapshot de progresión?
      La tarjeta NFT sigue mostrando el nombre del catálogo estático y el estado
      `Sync to track`; no se rompe ni inventa progreso.

## 11. Decisiones y notas

### Kioscos y coordenadas

Los dos edificios están enfrentados al claro central. La tienda se abre hacia
`+X` (rotación `+π/2`) y el turismo hacia `-X` (rotación `-π/2`). El ancla
`TO_Interaccion` del turismo ya apunta al frente del mostrador, en
`(18, 1.4, 0)` de mundo. Para que el jugador pueda rodear el pad sin meterse en
el edificio, el centro de interacción se adelanta 1–1.3 m hacia el claro:

| Kiosco    | Nombre visible | Posición          | Y     | Color     | Radio | Fachada |
| --------- | -------------- | ----------------- | ----- | --------- | ----- | ------- |
| `shop`    | Halloween Shop | `(-17.2, 0.4, 0)` | `0.4` | `#fb923c` | 3.2   | `+X`    |
| `tourism` | Tourism Office | `(16.9, 0.4, 0)`  | `0.4` | `#2dd4bf` | 3.2   | `-X`    |

- El bucle de NPCs del centro tiene radio 14 (`NPC_ROUTES.centro`), así que los
  pads en `x = ±17` quedan fuera del tránsito de Alba, Carmen, Mateo, etc.
- `cat-01` está en `(-14, 0, 6)` y `cat-05` en `(6, 0, -12)`; ningún gato cae
  dentro del radio de 3.2 m de los kioscos.
- Los checkpoints de minijuego están a más de 40 m; no hay solape de avisos.
- La altura `y` se midió en el Paso 7: la cara superior del disco del claro está
  en `0.4` y los suelos de los dos edificios en `0.36–0.42`, así que los pads
  usan `y = 0.4` y su disco se separa `0.012` para evitar z-fighting. Los pads
  de interacción se adelantan al claro para que el jugador no tenga que entrar
  en el edificio.

### Aspecto del marcador

Se reutiliza el lenguaje visual de `Checkpoint.svelte` (disco tintado, halo,
anillo, haz vertical y cartel flotante), pero con una versión más ligera:

- Sin `Collider` ni `RigidBody`: la detección es por distancia.
- Sin cristal, chispas ni anillos orbitando: dos kioscos no necesitan el
  presupuesto visual de un checkpoint de minijuego.
- Icono flotante propio: bolsa de compra para la tienda y mapa/brújula para
  turismo, construido con primitivas de Three.
- Cartel 3D `HALLOWEEN SHOP` / `VILLAGE GUIDE` y subtítulo `PRESS E TO
BROWSE` / `PRESS E FOR THE GUIDE`, con la misma fuente local que los
  checkpoints (`fonts/helvetiker_bold.typeface.json`). Sin acentos: helvetiker
  no los tiene.

### Paneles

- `#shop-panel` es el div de la tienda: muestra el catálogo completo y la vista
  3D de la skin seleccionada. No hay precios ni monedas; el estado
  `Locked` explica qué misión hay que ganar y enlaza a la guía.
- Seguimiento: `SPEC-034` añade las pestañas **Skins / Assets / Vehicles /
  Houses** al mismo `#shop-panel`, con un catálogo tipado y una sola vista 3D
  montada a la vez. Esta spec solo cubre la vista de skins original.
- `#tourism-panel` es el div de información: lista las **nueve actividades** y
  responde a «¿dónde voy?», «¿qué hago aquí?» y «¿qué NFT me llevo?». La lista
  se puede recorrer con ratón, teclado o toque; el visor 3D y las tarjetas de
  recompensa cambian con la selección.
- La tarjeta NFT es de **solo lectura**: muestra pista, tramo, misión,
  `valor/objetivo`, catálogo y estado (`Locked`, `Available`, `In progress`,
  `Ready to claim`, `Claimed`, `Sync to track`). No monta `RewardCard` ni llama
  a `/rewards/claim`; el reclamo vive en `MissionHud → Rewards`.
- Ambos usan el mismo patrón modal que `TrackSelectDialog` / el onboarding:
  fondo oscuro, `role="dialog"`, `aria-modal`, foco inicial en cerrar y
  `Escape`. Mientras están abiertos, `PlayerBehaviour` libera el input.
- Se cierran al salir del hub, al abrir el chat o los ajustes y al empezar a
  conducir. Nunca se abren en la cripta, carreras, roadmap, Barn Siege,
  deathmatch, parkour, **Skyfall Royale / `islas-ciudad`** ni onboarding.

### Contenido de la guía

La guía reutiliza los pasos del onboarding de `SPEC-019`; no se inventa
contenido nuevo. Cada entrada añade la capa de «dónde ir», «qué skin» y «qué
NFT»:

| Actividad              | Preview      | Misión local        | Skin         | Pista NFT | Hito NFT (`valor/objetivo`) | NFT                | Mapa           |
| ---------------------- | ------------ | ------------------- | ------------ | --------- | --------------------------- | ------------------ | -------------- |
| Explore the village    | `village`    | —                   | —            | —         | —                           | —                  | NearBox village |
| The 25 Lost Cats       | `cats`       | `cats-25`           | —            | explorer  | `cats-25` (`25/25`)         | Witch              | NearBox village |
| The Mausoleum Crypt    | `crypt`      | `crypt-5-skulls`    | Mummy        | crypt     | `crypt-5` (`5/5`)           | Crown              | Mausoleum Crypt |
| Grand Prix             | `race`       | `race-5-laps`       | Vampire      | gp        | `gp-podium-3` (`3/3`)       | Skateboard         | NearBox ring   |
| Haunted Highway        | `roadmap`    | —                   | —            | —         | —                           | —                  | Haunted Highway |
| Barn Siege             | `barn`       | `barn-8-waves`      | Pumpkin King | barn      | `barn-kills-25` (`25/25`)   | Golden Shotgun     | Barn Siege farm |
| Witch House Deathmatch | `deathmatch` | `hexfire-first-win` | Demon        | hexfire   | `hexfire-wins-5` (`5/5`)    | Demon              | Witch House    |
| Parkour Spire          | `parkour`    | `parkour-summit`    | Ghost        | parkour   | `parkour-wins-3` (`3/3`)    | Ghost              | Parkour Spire  |
| Skyfall Royale         | `parkour`*   | `royale-first-win`  | —            | royale    | `royale-kills-10` (`10/10`) | Golden Sniper      | Islas Ciudad   |

\* Skyfall Royale reutiliza el escenario 3D de Parkour hasta que exista un
diorama propio de `islas-ciudad`; el contenido, el mapa y las recompensas sí son
los de `SPEC-040` / `SPEC-045`.

Los 25 gatos no otorgan skin local: la única recompensa es el NFT Witch. La skin
Scarecrow (`crow-warden`) pasa a ser NFT-only y se obtiene poseyendo su NFT
(recompensa de `tier-veteran` o tienda), no completando `cats-25`.

Las recompensas de tramo posteriores también se documentan en
`missions/progression.ts` y se muestran en la Central:

| Pista     | T1               | T2                | T3              |
| --------- | ---------------- | ----------------- | --------------- |
| `barn`    | `shotgun-gold`   | `pistol-gold`     | `frankenstein`  |
| `royale`  | `sniper-gold`    | `bazooka-gold`    | `ghost`         |
| `gp`      | `skateboard`     | `vampire`         | `vampire`       |
| `hexfire` | `demon`          | `mp5-gold`        | `demon`         |
| `parkour` | `ghost`          | `magic-broom`     | `magic-broom`   |
| `crypt`   | `crown`          | `crown`           | `mummy`         |
| `explorer`| `witch` / `coin-pistol` | `golem`    | `skeleton`      |

El estado se deriva en tiempo real:

- Gatos: `missions.capturedCount` / `missions.mission.target` y
  `missions.completed`.
- Cripta: `missions.cryptCompleted`.
- Grand Prix, Barn Siege, Hexfire, Parkour y Skyfall Royale:
  `missions.isMissionCompleted(entry.missionId)`.
- Recompensas de skin: `cosmetics.rewardsForMission(entry.missionId)` y
  `cosmetics.equippedSkin`.
- Recompensas NFT: `missionById(entry.progressionMissionId)` para el catálogo y
  `progression.missionState(entry.progressionMissionId)` para estado, valor y
  objetivo; `progression.snapshot === null` produce `Sync to track`.
- Actividades sin misión: chip `Always open` / `Free ride`.

### Estructura de los divs

Los tres contenedores que pide el usuario quedan identificados en el DOM:

```svelte
<!-- KioskPrompt.svelte: aviso inferior compartido por los dos kioscos -->
<div id="kiosk-prompt" class="pointer-events-none fixed inset-x-0 bottom-6 z-40 ...">
	<div class="pointer-events-auto ...">
		<!-- icono + nombre + pista + kbd E + botón -->
	</div>
</div>

<!-- ShopPanel.svelte: el div de la tienda -->
<div id="shop-panel" role="dialog" aria-modal="true" aria-labelledby="shop-title">
	<header><!-- HALLOWEEN SHOP · n/11 available · cerrar --></header>
	<section><!-- SkinPreview 3D + ficha + Equip --></section>
	<section><!-- rejilla de las 11 skins --></section>
</div>

<!-- TourismPanel.svelte: el div que informa dónde ir, qué hacer y qué NFT dan -->
<div id="tourism-panel" role="dialog" aria-modal="true" aria-labelledby="tourism-title">
	<header><!-- TOURISM OFFICE · 9 activities · NFT rewards · cerrar --></header>
	<div class="grid ...">
		<nav><!-- lista de las 9 actividades, estado de misión y recompensas --></nav>
		<section>
			<div><!-- GuidePreview: visor 3D del elemento seleccionado --></div>
			<!-- descripción + viñetas + controles -->
			<!-- Where to go: dirección + mapa (Islas Ciudad, Barn Siege farm…) -->
			<!-- Skin reward: nombre, unlocked/equipped -->
			<!-- NFT reward: pista, tramo, misión, valor/objetivo, estado y catálogo -->
			<!-- Claim it in Mission Central → Rewards (sin botón de mint) -->
		</section>
	</div>
</div>
```

`#kiosk-prompt` nunca convive con el aviso de gato/NPC/checkpoint. Los dos
paneles son excluyentes: abrir uno cierra el otro (`hubKiosks.open(id)`).

### Prioridades de `E`

| Situación               | Quién consume `E`             |
| ----------------------- | ----------------------------- |
| Onboarding abierto      | Onboarding (captura global)   |
| Panel de kiosco abierto | Panel (`Escape`, `X` o fondo) |
| Diálogo de NPC abierto  | Diálogo                       |
| Gato a ≤ 2.2 m          | `CatPrompt`                   |
| NPC interactuable       | `NpcPrompt`                   |
| Kiosco a ≤ 3.2 m        | `KioskPrompt`                 |
| Checkpoint de minijuego | `CheckpointPrompt`            |
| Jukebox del club        | `ClubMusic`                   |

### Persistencia

No se añaden claves. La tienda lee `cosmetics.equippedSkin` y
`cosmetics.isUnlocked()`; la guía lee `missions`, `cosmetics` y, solo como
proyección de lectura, `progression.snapshot` (`SPEC-045`). Equipar una skin
sigue escribiendo en `rw:profile:v1` mediante `playerProfile`. El estado de los
paneles es efímero (`$state`) y se pierde al recargar, que es lo deseado. Los
NFT se reclaman en la Central; el kiosco no escribe `RewardClaim` ni llama al
relayer.

## 12. Progreso

| Fecha      | Estado       | Nota                                                                                     |
| ---------- | ------------ | ---------------------------------------------------------------------------------------- |
| 2026-11-12 | borrador     | Spec creado.                                                                             |
| 2026-11-12 | implementado | Kioscos, marcadores, aviso, tienda, guía, integración de entrada y guardas de prioridad. |
| 2026-11-12 | verificado   | `check`, Prettier acotado, `build`, `map:check`, `tsc` del backend y validación runtime. |
| 2026-11-14 | actualizado  | Guía de 9 actividades, recompensas NFT (`SPEC-045`), Skyfall Royale / `islas-ciudad` (`SPEC-040`) y mapa por actividad. Solo `bun run check`; prueba manual pendiente. |

## 13. Changelog

- 2026-11-12 — Creación del spec: kioscos de tienda y turismo, paneles modales,
  guía de las ocho actividades y reutilización de los visores 3D de `SPEC-019`
  y del progreso de `SPEC-015`.
- 2026-11-12 — Implementación completa: `hubKiosks`, `villageGuide`,
  `Kiosks`, `KioskMarker`, `KioskLabel`, `KioskPrompt`, `ShopPanel`,
  `TourismPanel` y `GuidePreview`; montaje en `Scene`/`GamePage` y guardas en
  `PlayerBehaviour`, `CheckpointPrompt`, `NpcPrompt`, `CatPrompt` y
  `SettingsMenu`.
- 2026-11-12 — Ajustes tras la validación: frase explícita del aviso por kiosco
  (`prompt`), botones de cierre de `44×44`, altura de pad confirmada en `0.4` y
  comparación del muestreo contra `hubKiosks.nearbyId` para no pisar reseteos
  externos.
- 2026-11-12 — Validación en Chromium headless: marcadores, proximidad, `E`,
  equipado persistente, cambio tienda ↔ guía, cierre por `X`/`Escape`/fondo,
  bloqueo de movimiento, prioridad del gato, viewport móvil, almacenamiento
  corrupto y backend bloqueado.
- 2026-11-12 — Spec de seguimiento `SPEC-034`: pestañas Skins / Assets /
  Vehicles / Houses dentro de `#shop-panel`. No cambia el comportamiento de
  esta spec; solo amplía el catálogo de la tienda.
- 2026-11-14 — **Recompensas NFT y Skyfall Royale en el centro de turismo**:
  `villageGuide.ts` gana `progressionTrack`, `progressionMissionId`, `mapId` y
  `mapLabel`; `TourismPanel.svelte` muestra una tarjeta NFT de solo lectura
  (pista, tramo, misión, progreso, catálogo y estado de reclamo) y el mapa de
  cada actividad. Se añade la novena actividad **Skyfall Royale** con
  `minigame-8`, `islas-ciudad` y las recompensas `sniper-gold` →
  `bazooka-gold` → `ghost` de la pista `royale` (`SPEC-040` / `SPEC-045`). El
  kiosco no mintea ni reclama. Verificado con `bun run check`; la prueba con
  login/NFT y render de `islas-ciudad` queda pendiente para el usuario.
- 2026-11-14 — Los 25 gatos dejan de mostrar recompensa de skin local: la guía
  solo anuncia el NFT Witch y el bloque local pasa a «No local skin». La skin
  Scarecrow queda NFT-only y se obtiene poseyendo su NFT.
