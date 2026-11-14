---
id: SPEC-013
titulo: "Lanzar rollos de papel con sincronización por WebSocket"
estado: completado
prioridad: media
creado: 2026-11-01
actualizado: 2026-11-01
responsable: "OpenCode"
etiquetas: [gameplay, websocket, halloween, three]
depende_de: [SPEC-002, SPEC-011]
bloquea: []
estimacion: "3h"
---

# SPEC-013 — Lanzar rollos de papel con sincronización por WebSocket

## 1. Contexto

El jugador ya se mueve por el mapa exterior y por la cripta de `minigame-2`
(SPEC-009 / SPEC-011). La temática es Halloween y se quiere una acción lúdica:
lanzar rollos de papel higiénico (TP) que se vean también en los demás clientes.

El servidor ya es autoritativo para la cripta y difunde presencia y chat por
`GLOBAL_TOPIC`. La nueva acción se apoya en esa misma infraestructura.

## 2. Objetivo

Permitir que cada jugador lance hasta 5 rollos de papel desde la posición de su
personaje, sincronizados por WebSocket. Al lanzar el sexto se elimina el más
antiguo (FIFO) para no saturar el canvas.

## 3. Alcance

**Incluye**

- Acción de lanzar con clic izquierdo y botón táctil.
- Render 3D de rollo de papel con motivos de Halloween, tira de papel y
  trayectoria simulada con gravedad y colisión contra la geometría del mapa.
- Estado autoritativo del servidor: máximo 5 rollos por jugador, FIFO y TTL.
- Sincronización de posición/velocidad al lanzar mediante `throw-roll` y
  `rolls-state`.
- Filtrado por escena: los rollos del exterior no se dibujan en la cripta.

**No incluye**

- Daño, empuje o interacción física con momias u otros jugadores.
- Persistencia de rollos entre sesiones o reinicios del servidor.
- Inventario o límite de lanzamientos totales (solo se limita la cantidad
  simultánea visible).

## 4. Requisitos

### Funcionales

| ID   | Requisito                                                              | Prioridad |
| ---- | ---------------------------------------------------------------------- | --------- |
| RF-1 | El clic izquierdo (ratón) y el botón «Rollo» (táctil) lanzan un rollo.             | alta      |
| RF-2 | El rollo sale desde la mano del jugador hacia donde mira la cámara.    | alta      |
| RF-3 | El servidor difunde posición/velocidad y todos los clientes lo pintan. | alta      |
| RF-4 | Máximo 5 rollos por jugador; el sexto descarta el primero.             | alta      |
| RF-5 | Los rollos de otra escena no se renderizan en la escena activa.        | media     |
| RF-6 | Los rollos caducan a los 12 s y al desconectarse su dueño.             | media     |

### No funcionales

| ID    | Requisito                                       | Criterio                                              |
| ----- | ----------------------------------------------- | ----------------------------------------------------- |
| RNF-1 | No saturar el canvas                            | Máximo 5 por jugador + TTL de 12 s                    |
| RNF-2 | El lanzamiento no depende de la latencia        | El cliente pinta el rollo de inmediato                |
| RNF-3 | No romper el tipado ni el build                 | `svelte-check` y `tsc --noEmit` sin errores           |
| RNF-4 | Ritmo controlado                                | Enfriamiento de 220 ms en servidor y 240 ms en cliente |

## 5. Criterios de aceptación

- [x] CA-1: el clic izquierdo y el botón táctil lanzan un rollo visible.
- [x] CA-2: dos clientes conectados ven el mismo rollo tras el lanzamiento.
- [x] CA-3: tras 6 lanzamientos el cliente y el servidor conservan 5 y falta el
      primero.
- [x] CA-4: un `throw-roll` con escena distinta a la del lobby se ignora.
- [x] CA-5: al desconectar al dueño, sus rollos desaparecen en los demás.
- [x] CA-6: `npm run check` y `tsc --noEmit` terminan sin errores.

## 6. Archivos relevantes

| Ruta                                                              | Acción    | Motivo                                             |
| ----------------------------------------------------------------- | --------- | -------------------------------------------------- |
| `backend/src/ws/protocol.ts`                                      | modificar | Tipos y validación de `throw-roll` / `rolls-state` |
| `backend/src/ws/paperRolls.ts`                                    | crear     | Registro autoritativo, FIFO, TTL y broadcast       |
| `backend/src/index.ts`                                            | modificar | Ruta del mensaje, snapshot al unirse y tick        |
| `frontend/src/lib/services/protocol.ts`                           | modificar | Tipos y validador de rollos                        |
| `frontend/src/lib/services/lobbySocket.ts`                        | modificar | Envío y callback de `rolls-state`                  |
| `frontend/src/lib/state/paperRolls.svelte.ts`                     | crear     | Estado local, lanzamiento y merge con servidor     |
| `frontend/src/lib/state/lobby.svelte.ts`                          | modificar | Cableado del socket y reset                        |
| `frontend/src/lib/components/player/PaperRoll.svelte`             | crear     | Malla, textura y simulación del rollo              |
| `frontend/src/lib/components/player/PaperRolls.svelte`            | crear     | Lista filtrada por escena                          |
| `frontend/src/lib/components/player/PlayerBehaviour.svelte`       | modificar | Clic izquierdo                                          |
| `frontend/src/lib/components/ui/MobileControls.svelte`            | modificar | Botón táctil «Rollo»                               |
| `frontend/src/lib/Scene.svelte`                                   | modificar | Montar `<PaperRolls />`                            |

## 7. Plan de implementación

### Fase 1 — Servidor

- [x] Añadir `PaperRollState`, esquema `throw-roll` y mensaje `rolls-state`.
- [x] Crear `paperRolls.ts` con map por jugador, máximo 5, FIFO, TTL y rate limit.
- [x] Difundir el estado completo al lanzar, al caducar y al desconectar.
- [x] Enviar el snapshot actual en el `welcome`.
- [x] Validar que la escena del rollo coincide con el lobby del jugador.

### Fase 2 — Cliente

- [x] Ampliar el protocolo y `LobbySocket`.
- [x] Crear el store `paperRolls` con render inmediato y merge de pendientes.
- [x] Crear los componentes 3D y la simulación con `Rapier` (raycast).
- [x] Añadir clic izquierdo, botón táctil y montaje en la escena.

## 8. Verificación

```bash
cd frontend && npm run check && npm run build
cd backend && ../frontend/node_modules/.bin/tsc --noEmit -p tsconfig.json
```

Prueba de integración WebSocket (dos clientes):

```bash
cd backend && PORT=3100 bun run src/index.ts
bun /tmp/opencode/rolls-ws-test.mjs
```

Resultado obtenido: FIFO correcto (`roll-a-1..5`), broadcast a ambos clientes,
escena inválida ignorada y limpieza al desconectar.

## 9. Riesgos y mitigaciones

| Riesgo                                       | Impacto | Mitigación                                              |
| -------------------------------------------- | ------- | ------------------------------------------------------- |
| Muchos jugadores llenan el canvas            | Alto    | Máximo 5 por jugador + TTL de 12 s                      |
| Relojes desincronizados entre cliente/servidor | Medio  | `rolls-state` incluye `serverTime` y se calcula offset  |
| Cliente pinta el rollo y el servidor lo rechaza | Bajo   | Pendientes con TTL de 2.5 s y merge por id              |
| Túnel a través de paredes finas               | Bajo    | Pasos de simulación de 1/60 s y raycast por segmento    |

## 10. Preguntas abiertas

- Ninguna para esta entrega.

## 11. Decisiones y notas

- La velocidad inicial se decide en el cliente y se envía al servidor; el
  servidor valida magnitud y posición.
- Los ids de rollo los genera el cliente para poder pintarlos al instante; el
  servidor rechaza duplicados.
- La simulación es determinista a partir de `at` + velocidad, sin física
  dinámica, para que los clientes que entran tarde vean el mismo resultado.

## 12. Progreso

| Fecha      | Estado     | Nota                          |
| ---------- | ---------- | ----------------------------- |
| 2026-11-01 | completado | Implementado y verificado     |

## 13. Changelog

- 2026-11-01 — Creación e implementación del spec.
