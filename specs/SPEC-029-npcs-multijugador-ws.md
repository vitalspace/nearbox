---
id: SPEC-029
titulo: "NPCs del lobby autoritativos por WebSocket"
estado: completado
prioridad: alta
creado: 2026-11-11
actualizado: 2026-11-11
responsable: opencode
etiquetas: [npcs, lobby, websocket, backend, sincronizacion, animaciones, threlte, rapier]
depende_de: [SPEC-002, SPEC-014, SPEC-028]
bloquea: []
estimacion: "8h"
---

# SPEC-029 — NPCs del lobby autoritativos por WebSocket

## 1. Contexto

SPEC-028 introdujo nueve NPCs humanos que pasean por el lobby exterior, pero
cada cliente los simulaba en local con una semilla estable por `id`. El
resultado era aceptable en solitario y **incoherente en multijugador**: dos
jugadores veían al mismo NPC en calles distintas, con pausas y visitas
distintas, y los saludos dependían de qué jugador estuviera cerca de cada
cliente.

Los coches (`SPEC-014`) ya resolvieron el mismo problema con un patrón que
funciona: el servidor mantiene el estado autoritativo y publica snapshots a
10 Hz (`cars-state`); el cliente interpola con `SampleBuffer` + `ServerClock`
y renderiza ~200 ms en el pasado para absorber el jitter de red.

Además, durante la migración se detectaron dos defectos visuales:

1. **Carmen no caminaba nunca.** El primer saludo llegaba antes de que
   `useGltfAnimations` poblara las acciones; el componente marcaba el gesto como
   consumido sin reproducirlo, `activeOneShot` se quedaba activo para siempre y
   bloqueaba la locomoción.
2. **Carmen y Lucía flotaban.** El muestreo de suelo lanzaba el rayo desde
   `altura_actual + 1,5 m` con `solid = true`. Si el origen caía dentro de
   cualquier colisionador (cápsula del jugador, tronco, valla o un sensor como
   el checkpoint), Rapier devolvía `toi = 0` y el NPC subía 1,5 m de golpe. Una
   vez arriba, el suelo quedaba fuera del alcance de 3 m y el valor erróneo se
   quedaba pegado para siempre.

## 2. Objetivo

Que los nueve NPC humanos del lobby estén simulados por el servidor y que todos
los clientes vean la misma posición, orientación, clip y gesto en todo momento,
con el mismo patrón que los coches, sin perder la corrección local de altura ni
la simulación de respaldo cuando no hay conexión.

## 3. Alcance

**Incluye**

- Motor `Npcs` en el backend: avanza las rutas, pausas, visitas, descansos,
  saludos y diálogos con las mismas funciones puras que el cliente.
- Mensaje `npcs-state` (servidor → cliente) a 10 Hz y en el `welcome`.
- Mensaje `npc-dialog` (cliente → servidor) para congelar al NPC mientras un
  jugador tiene su diálogo abierto.
- Store `npcs` con buffer de muestras, reloj de servidor, interpolación y
  snap en teleports/reconexiones.
- Fallback local: si no llegan snapshots o se cae la conexión, la simulación
  local de SPEC-028 vuelve a tomar el control sin saltos.
- Corrección de altura en cliente con raycast de Rapier (el servidor no tiene
  el trimesh del mapa).
- Corrección del gesto atascado en `NpcCharacter` y del muestreo de suelo.

**No incluye**

- Física completa de los NPCs (colisiones dinámicas, empujones o ragdoll).
- Autoridad de altura en el servidor: el mapa y sus colisionadores solo existen
  en el cliente; el servidor publica `route.groundY` como referencia.
- Persistencia de la quest en servidor: sigue en `localStorage` con la clave
  `rw:npcs:v1:<playerId>`.
- Nuevos NPCs, rutas, diálogos o modelos.

## 4. Requisitos

### Funcionales

| ID   | Requisito | Prioridad |
| ---- | --------- | --------- |
| RF-1 | El servidor simula los 9 NPCs con `updateAgent` y publica `npcs-state` a 10 Hz. | alta |
| RF-2 | `welcome` incluye un snapshot inmediato para que el recién conectado no espere al siguiente tick. | alta |
| RF-3 | El cliente interpola posiciones con `SampleBuffer`/`ServerClock` y aplica snap si la distancia supera 6 m. | alta |
| RF-4 | `npc-dialog { npcId, open }` congela al NPC y lo gira hacia el jugador que abrió el diálogo; al cerrar, reanuda el paseo. | alta |
| RF-5 | Los gestos del servidor y los locales (decisiones de diálogo/despedida) conviven sin pisarse. | alta |
| RF-6 | Sin snapshots (offline/dev sin backend) la simulación local sigue funcionando con las mismas rutas y clips. | alta |
| RF-7 | La altura `y` se corrige en el cliente con un raycast de Rapier y nunca se queda flotando. | alta |
| RF-8 | Un gesto que llega antes de que el GLB tenga acciones no bloquea la locomoción. | alta |
| RF-9 | Al entrar en un minijuego o al desconectarse, el jugador deja de contar para saludos/diálogos y el estado remoto se limpia. | media |

### No funcionales

| ID    | Requisito | Criterio |
| ----- | --------- | -------- |
| RNF-1 | Coste de red | `npcs-state` ≈ 1,3 KB; 9 NPCs × 10 Hz dentro del presupuesto de 16 KiB por frame. |
| RNF-2 | Determinismo servidor | Misma semilla por `id`; el estado solo depende de `delta` y posiciones de jugadores. |
| RNF-3 | Tipos y validación | `npcs:check`, `svelte-check`, `tsc --noEmit` y `prettier --check` sin errores. |
| RNF-4 | Compatibilidad | El cliente sigue funcionando contra un backend antiguo (se queda en modo local). |

## 5. Criterios de aceptación

- [x] Un cliente nuevo recibe `npcs-state` en el `welcome` y a 10 Hz después.
- [x] Dos pestañas abiertas muestran a los mismos NPCs en las mismas
      coordenadas (±0,1 m) y con el mismo clip.
- [x] `npc-dialog` abre/cierra el diálogo sin errores `INVALID_NPC`.
- [x] Los 9 NPCs se mueven y su `y` se mantiene en el nivel de su ruta
      (0, 0,03 o 0,4 m) durante una vuelta completa.
- [x] Carmen reproduce `HR_walk` en cuanto el GLB está listo.
- [x] Al desconectar (`lobby.disconnect()`), los NPCs siguen caminando en local
      sin saltos > 2 m y sin cambiar de altura.
- [x] `bun run npcs:check`, `bun run check`, `tsc --noEmit` y `bun run build`
      pasan.

## 6. Archivos relevantes

**Backend**

- `backend/src/server/engines/npcs.ts` (nuevo) — motor autoritativo, mapa de
  posiciones de jugadores, `talking`, `tick` y `snapshot`.
- `backend/src/server/protocol.ts` (modificado) — `NpcId`, `NpcClip`,
  `NpcState`, `NpcsSnapshot`, `npcs-state` y `npc-dialog`.
- `backend/src/server/validate.ts` (modificado) — validación de `npc-dialog`
  con error `INVALID_NPC`.
- `backend/src/index.ts` (modificado) — instancia `npcs`, snapshot en
  `sendWelcome`, `onPlayerPosition`, `onDialog`, `onPlayerLeave` y tick de
  100 ms.
- `backend/src/lib/npcs/*.ts` (nuevos) — copia servidor de `npcAnimations`,
  `npcConfig`, `npcDialogues`, `npcRoutes` y `npcAgent`.

**Frontend**

- `frontend/src/lib/services/protocol.ts` (modificado) — tipos, guardas y
  parseo de `npcs-state`; `npc-dialog` en `ClientMessage`.
- `frontend/src/lib/services/lobbySocket.ts` (modificado) — `onNpcsState`,
  `sendNpcDialog` y reexport de `NpcState`.
- `frontend/src/lib/state/npcs.svelte.ts` (modificado) — `NpcVisual`,
  `NpcSender`, `online`, `applySnapshot`, `sample`, `resetRemote`,
  `applyServerGesture` y avisos de diálogo al servidor.
- `frontend/src/lib/state/lobby.svelte.ts` (modificado) — `onNpcsState`,
  `setSender`, `sendNpcDialog` y `resetRemote` en connect/disconnect.
- `frontend/src/lib/components/npc/NpcPopulation.svelte` (modificado) — modo
  online vs. fallback, corrección de suelo y reanclaje tras un teleport.
- `frontend/src/lib/components/npc/NpcCharacter.svelte` (modificado) — no
  consumir gestos sin acciones y limpieza de `activeOneShot`.
- `frontend/src/lib/npcs/npcGround.ts` (modificado) — ventana de sondeo corta,
  `solid = false`, límite de subida y bajada.

**Specs**

- `specs/SPEC-028-npcs-lobby-humanos.md` (modificado) — §11.7 apunta a esta
  spec.
- `specs/SPEC-029-npcs-multijugador-ws.md` (nuevo) — este documento.

## 7. Plan de implementación

1. Duplicar los módulos puros de NPCs en `backend/src/lib/npcs/` con cabecera
   "Server copy of frontend/…".
2. Añadir tipos y mensajes al protocolo del backend y su validación.
3. Implementar `Npcs` (rutas, pausas, gestos, diálogo, posiciones de jugador) y
   cablearlo en `index.ts`: `welcome`, `player-position`, `npc-dialog`,
   `enter-lobby`, `close` y `setInterval(100)`.
4. Añadir tipos, guardas, parser y transporte en el frontend.
5. Implementar el modo online del store (`applySnapshot`, `sample`,
   `resetRemote`, `applyServerGesture`) y notificar el diálogo al servidor.
6. Adaptar `NpcPopulation` para alternar online/local y corregir la altura en
   ambos modos, con reanclaje en teleports.
7. Corregir el gesto atascado de `NpcCharacter` y el muestreo de suelo.
8. Verificar tipos, lint, build, `npcs:check` y pruebas en navegador (snapshots,
   diálogo, animación, caída de conexión).

## 8. Verificación

```bash
# Backend y protocolo
cd backend && bunx tsc --noEmit

# Frontend
cd frontend
bun run check
bun run npcs:check
bun run build

# Sondeo directo del WebSocket (9 NPCs, 10 Hz)
bun -e 'const ws=new WebSocket("ws://127.0.0.1:4000/ws");ws.onopen=()=>ws.send(JSON.stringify({type:"join",alias:"Probe",skin:"hero"}));ws.onmessage=(e)=>{const m=JSON.parse(e.data);if(m.type==="npcs-state"){console.log(m.npcs.length,m.npcs[0]);process.exit(0)}}'
```

Resultado de la última pasada:

- `tsc --noEmit` (backend): sin errores.
- `svelte-check`: 0 errores, 3 avisos preexistentes en `CheckpointLabel`.
- `npcs:check`: 9 NPCs, 9 modelos, 25 clips, 0 colisiones, 129 600 pasos.
- `build`: correcto.
- Navegador (Playwright, SwiftShader): `npcs-state` recibido; 9 grupos
  moviéndose con `y ∈ [0; 0,4]`; Carmen con `HR_walk` activo y huesos
  rotando; tras `lobby.disconnect()` la simulación local continúa sin saltos.

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
| ------ | ---------- |
| Los módulos copiados en `backend/src/lib/npcs/` se desincronizan. | Cabecera "Server copy of frontend/…" y `npcs:check` como red de seguridad. Al cambiar reglas, copiar y volver a ejecutar. |
| El servidor no conoce el trimesh del mapa. | Solo publica `route.groundY`; el cliente corrige `y` con Rapier. |
| Un `delta` grande en el servidor (proceso bloqueado) teletransporta a los NPCs. | `TICK_DELTA_MAX = 0,25 s` y snap del cliente a más de 6 m. |
| El rayo de suelo vuelve a engancharse en sensores o props. | Ventana corta anclada a la altura previa, `solid = false` y límites de subida/bajada. |
| El diálogo se queda abierto si el jugador se desconecta. | `onPlayerLeave` limpia `talking` y `positions`. |

## 10. Preguntas abiertas

- ¿Debe el servidor conocer un navmesh simplificado para bloquear a los NPCs
  contra obstáculos dinámicos? Hoy las rutas están validadas sin colisiones
  estáticas y el cliente solo corrige la altura. Queda como deuda si aparecen
  obstáculos nuevos.

## 11. Decisiones y notas

### 11.1 Autoridad y altura

El servidor es autoritativo en `x`, `z`, `yaw`, `clip` y `gesto`. La altura `y`
se corrige en el cliente porque el backend no carga `map.glb` ni sus
colisionadores; publicar una altura inventada sería peor que ignorarla.

### 11.2 Dos contadores de gesto

`NpcRenderState.gestureSeq` es el contador de render y sube con cualquier gesto
(local o de servidor). `serverGestureSeq` guarda el último contador del
servidor para detectar gestos nuevos sin reemitir los locales. Así una
despedida elegida en el diálogo no se pierde cuando llega el siguiente
snapshot.

### 11.3 Diálogo

`npc-dialog` solo se acepta en el lobby global. Mientras hay jugadores
hablando, el NPC se detiene y mira al que abrió el diálogo (`focusFor`). El
cierre por distancia lo sigue decidiendo el cliente
(`NPC_DIALOG_MAX_DISTANCE`), que también notifica `open: false`.

### 11.4 Muestreo de suelo

El muestreo usa `solid = false` para ignorar colisionadores que contienen el
origen (cápsula del jugador, troncos, vallas, sensores de checkpoints) y una
ventana de `+0,6 / -1,2 m` alrededor de la última altura. Rechaza superficies a
más de 0,25 m por encima (props en los que no debe subirse). Esto elimina el
salto de +1,5 m y el valor pegado que dejaba a Carmen flotando toda la vuelta.

### 11.5 Gesto atascado

`NpcCharacter` no consume gestos hasta que el GLB tiene acciones. Si el gesto
llega antes, se queda pendiente y se aplica en el primer frame con acciones.
Además, si la acción de un one-shot no existe o ya terminó sin disparar
`finished`, `activeOneShot` se limpia en el siguiente frame.

### 11.6 Fallback

`npcs.online` se activa con el primer snapshot y se desactiva con
`resetRemote()` en `connect`, `disconnect` y estados `disconnected|error`. En
modo local se usa `updateAgent` con `playerState`, igual que en SPEC-028.

### 11.7 Coste

`npcs-state` con 9 NPCs y 9 campos por NPC ocupa ≈ 1,3 KB por frame; a 10 Hz
son ≈ 13 KB/s, dentro del límite de 16 KiB por frame del transporte.
`Npcs` mantiene una única instancia por lobby y recorre 9 agentes por tick.

## 12. Progreso

| Fecha | Estado | Nota |
| --- | --- | --- |
| 2026-11-11 | en-progreso | Copias del backend, protocolo, validación, motor `Npcs`, transporte y modo online del store. |
| 2026-11-11 | completado | Cableado en `lobby.svelte.ts`, corrección de altura y del gesto atascado, verificación en navegador y documentación. |

## 13. Changelog

- 2026-11-11 — Migración a NPCs autoritativos: `Npcs` + `npcs-state` a 10 Hz +
  `npc-dialog`, interpolación cliente y fallback local.
- 2026-11-11 — Corrección del gesto que bloqueaba la locomoción de Carmen y del
  muestreo de suelo que la dejaba flotando a 1,75 m.
- 2026-11-11 — Verificación completa: tipos, lint, build, `npcs:check` y pruebas
  de navegador con conexión y sin ella.
