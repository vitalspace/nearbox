---
id: SPEC-003
titulo: "Reconexión automática y robustez del socket de lobby"
estado: completado
prioridad: alta
creado: 2026-10-30
actualizado: 2026-10-30
responsable: opencode
etiquetas: [frontend, websocket, reconexion, robustez, lobby]
depende_de: [SPEC-002]
bloquea: []
estimacion: "2h"
---

# SPEC-003 — Reconexión automática y robustez del socket de lobby

## 1. Contexto

`SPEC-002` dejó implementado el lobby WebSocket: backend Elysia en `/ws`, protocolo JSON de presencia, lobby global y 3 mini lobbies, y un overlay Svelte que conecta automáticamente al montar.

La conexión actual no se recupera sola. Si el backend se reinicia, la red parpadea o el socket se cierra de forma inesperada, el cliente queda en `Desconectado` y el jugador debe pulsar `Conectar` manualmente. Además, el servicio `LobbySocket` no distingue entre un cierre intencional y uno accidental, no tiene backoff y no limpia reintentos programados.

## 2. Objetivo

Hacer que el cliente del lobby se reconecte automáticamente tras una pérdida de conexión no intencional, con backoff exponencial y jitter, conservando el alias y volviendo a unirse al lobby global, sin reintentos infinitos ante errores fatales y sin fugas de timers ni sockets.

## 3. Alcance

**Incluye**

- Nuevo estado `reconnecting` en el ciclo de vida del socket.
- Reconexión automática ante `close` inesperado o error de red.
- Backoff exponencial: base 1 s, factor 2, máximo 15 s, jitter de ±20 %.
- Reset del backoff al recibir `welcome`.
- Reenvío automático de `join` con el alias actual en cada reconexión.
- Sin reconexión tras `disconnect()` manual ni tras cierre `4001` (timeout de `join`).
- Cancelación de reconexión desde la UI.
- Reintento inmediato al recuperar conexión (`window` evento `online`).
- Reintento inmediato al volver a la pestaña (`document` evento `visibilitychange`).
- Toast temporal `Conexión restablecida` al recuperar la conexión.
- UI con estado `Reconectando`, número de intento y cuenta atrás.
- Iconos de Lucide para los avisos y acciones de reconexión.
- Limpieza de timers, listeners y socket en `disconnect()` y al desmontar el overlay.
- Pruebas de caída/recuperación del backend y verificación de que no se duplican sockets.

**No incluye**

- Cambios en el protocolo de mensajes o en el backend.
- Identidad estable entre reconexiones: el servidor asignará un `id` nuevo.
- Heartbeat propio a nivel de aplicación; se confía en `onclose`/`onerror` del navegador.
- Recuperación del estado interno de un minijuego tras reconectar.
- Cola de mensajes offline o reenvío de acciones perdidas.
- Sincronización de posiciones.
- Sonidos o notificaciones nativas del sistema.
- Reintentos en segundo plano con la pestaña cerrada.

## 4. Requisitos

### Funcionales

| ID   | Requisito                                                                                                       | Prioridad |
| ---- | --------------------------------------------------------------------------------------------------------------- | --------- |
| RF-1 | Un cierre inesperado del socket (código distinto de 1000) pasa el estado a `reconnecting` y programa un reintento. | alta      |
| RF-2 | El primer reintento ocurre a ~1 s; cada fallo duplica la espera hasta un máximo de 15 s con jitter de ±20 %.      | alta      |
| RF-3 | Cada reintento abre un socket nuevo y reenvía `join` con el alias actual; nunca hay dos sockets abiertos a la vez. | alta      |
| RF-4 | Al recibir `welcome` se resetea el backoff y el contador de intentos.                                            | alta      |
| RF-5 | `disconnect()` manual cancela el reintento pendiente, cierra el socket y deja el estado en `disconnected`.        | alta      |
| RF-6 | Un cierre `4001` (`JOIN_TIMEOUT`) no se reintenta automáticamente; pasa a `error` y requiere acción manual.       | media     |
| RF-7 | El evento `online` del navegador adelanta el reintento pendiente si el estado es `reconnecting`.                   | media     |
| RF-8 | El overlay muestra `Reconectando…`, el número de intento y los segundos restantes.                              | alta      |
| RF-9 | El overlay permite cancelar la reconexión y volver a conectar manualmente.                                       | media     |
| RF-10 | Cambiar el alias durante una reconexión reinicia el ciclo inmediatamente con el nuevo alias.                     | media     |
| RF-11 | Al desmontar el overlay se cancelan timers/listeners y se cierra el socket sin programar reintentos.             | alta      |
| RF-12 | La presencia, entrada/salida de mini lobbies y el resto de funciones de `SPEC-002` siguen funcionando.          | alta      |
| RF-13 | El evento `visibilitychange` con la pestaña visible adelanta el reintento pendiente si el estado es `reconnecting`. | media     |
| RF-14 | Al recibir el primer `welcome` tras una reconexión se muestra el toast `Conexión restablecida` y se autooculta.    | media     |

### No funcionales

| ID    | Requisito                                                          | Criterio                                                                 |
| ----- | ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| RNF-1 | Dependencias mínimas y sin librerías de red.                       | Solo `@lucide/svelte` para iconos, además de Svelte, TypeScript y WebSocket nativo |
| RNF-2 | Sin timers ni listeners huérfanos.                                | Cada timer se guarda y se limpia en `disconnect()`/desmontaje             |
| RNF-3 | Sin solapamiento de intentos.                                     | Un único timer de reintento y un único socket activo                      |
| RNF-4 | Prettier y typecheck sin errores.                                 | `bun run check` y Prettier acotado pasan                                   |
| RNF-5 | La UI no bloquea el juego ni parpadea en cada intento.            | El panel mantiene el último estado visible y solo actualiza el aviso       |
| RNF-6 | El backoff es determinista salvo el jitter.                       | Función pura exportada y verificable                                      |
| RNF-7 | Los iconos funcionan en cliente y en SSR.                         | `@lucide/svelte` incluido en `ssr.noExternal` y build verificado           |

## 5. Criterios de aceptación

- [x] CA-1: Con el cliente conectado, detener el backend cambia el estado a `Reconectando` sin cerrar la página.
- [x] CA-2: Mientras el backend está caído, los intentos muestran una espera creciente y no se acumulan sockets.
- [x] CA-3: Al levantar el backend, el cliente se reconecta solo, recibe `welcome` y vuelve a aparecer en el lobby global con el mismo alias.
- [x] CA-4: Tras reconectar, el contador de intentos vuelve a cero.
- [x] CA-5: Pulsar `Desconectar` durante la cuenta atrás cancela el reintento y no vuelve a conectar.
- [x] CA-6: Un cierre `4001` no genera reintentos automáticos y muestra un error.
- [x] CA-7: Recuperar la conexión de red con el evento `online` provoca un intento inmediato.
- [x] CA-8: Cambiar el alias mientras se reconecta usa el nuevo alias en el siguiente `join`.
- [x] CA-9: Al navegar fuera de la página no quedan timers ni sockets activos.
- [x] CA-10: Entrar, cambiar y salir de mini lobbies sigue funcionando después de una reconexión.
- [x] CA-11: `cd frontend && bun run check`, Prettier acotado y `bun run build` pasan.
- [x] CA-12: La prueba manual de matar/levantar el backend se completa sin recargar el navegador.
- [x] CA-13: Volver a la pestaña con `visibilitychange` mientras se reconecta provoca un intento inmediato.
- [x] CA-14: Al recuperar la conexión aparece el toast `Conexión restablecida` y desaparece solo.
- [x] CA-15: Los iconos de `@lucide/svelte` se renderizan y la build SSR de producción pasa.

## 6. Archivos relevantes

| Ruta                                                       | Acción    | Motivo                                                              |
| ---------------------------------------------------------- | --------- | ------------------------------------------------------------------- |
| `frontend/src/lib/services/lobbySocket.ts`                  | modificar | Backoff, estado `reconnecting`, timers, listeners y cierre intencional |
| `frontend/src/lib/state/lobby.svelte.ts`                    | modificar | Exponer intento, cuenta atrás, cancelar, toast y configuración       |
| `frontend/src/lib/components/ui/LobbyOverlay.svelte`        | modificar | Estado de reconexión, cuenta atrás, avisos, iconos y botones         |
| `frontend/vite.config.ts`                                   | modificar | `ssr.noExternal` para compilar `@lucide/svelte` en SSR              |
| `frontend/package.json`                                     | modificar | Añadir `@lucide/svelte`                                             |
| `specs/SPEC-003-reconexion-automatica.md`                    | crear     | Este spec                                                           |

## 7. Plan de implementación

### Fase 1 — Lógica de reconexión en el servicio

- [x] Paso 1: Ampliar `LobbySocketStatus` con `'reconnecting'`.
- [x] Paso 2: Añadir a `LobbySocketOptions` la configuración `reconnect?: { baseDelayMs, maxDelayMs, jitterRatio }` con valores por defecto `1000`, `15000` y `0.2`.
- [x] Paso 3: Exportar una función pura `getReconnectDelay(attempt, options, random = Math.random)` que devuelva `min(base * 2^(attempt-1), max)` con jitter; primer intento ≈1 s.
- [x] Paso 4: Añadir estado interno `attempt`, `reconnectTimer`, `manualClose` y `listenersAttached`; garantizar que solo existe un timer y un socket.
- [x] Paso 5: En `disconnect()`, marcar `manualClose = true`, limpiar el timer, cerrar el socket y emitir `disconnected` sin programar reintento.
- [x] Paso 6: En `onclose`, si el cierre no es manual y el código no es `4001`, incrementar `attempt`, emitir `reconnecting` y programar `connect()` tras el delay; si es `4001`, emitir `error` sin reintento.
- [x] Paso 7: En `onopen`, limpiar cualquier timer pendiente, hacer `manualClose = false` y enviar `join` con el alias; en `welcome`, resetear `attempt` a `0`.
- [x] Paso 8: En `onerror`, no abrir otro socket directamente; dejar que `onclose` gestione el reintento.
- [x] Paso 9: Añadir `retryNow()` que cancele el timer pendiente y ejecute un intento inmediato si el estado es `reconnecting`.
- [x] Paso 10: Registrar los listeners `online` y `visibilitychange` al conectar y retirarlos en `disconnect()`; llamar a `retryNow()` si aplica.

### Fase 2 — Estado reactivo

- [x] Paso 11: Añadir a `LobbyStore` `reconnectAttempt = $state(0)`, `nextRetryAt = $state<number | null>(null)` y `retryNow()`.
- [x] Paso 12: Pasar el estado `reconnecting` desde el servicio y actualizar intento/cuenta atrás a partir de `onStatus` y de un callback `onReconnectScheduled(attempt, retryAt)`.
- [x] Paso 13: Resetear `reconnectAttempt` y `nextRetryAt` en `onWelcome` y en `connect()` manual.
- [x] Paso 14: Exponer `cancelReconnect()` que llame a `disconnect()` y deje el estado en `disconnected`.
- [x] Paso 15: Al cambiar alias, llamar a `connect(alias)` para cancelar el ciclo actual y empezar de cero con el nuevo nombre.

### Fase 3 — UI

- [x] Paso 16: Añadir la etiqueta `Reconectando…` y color ámbar pulsante al indicador de estado.
- [x] Paso 17: Mostrar `Intento n · reintento en Xs` mientras `status === 'reconnecting'`, con un tick local de 250 ms que se limpia al salir de ese estado.
- [x] Paso 18: Mantener el formulario con `Reconectar`/`Conectar` y añadir un botón `Desconectar` durante `connecting`/`connected`/`reconnecting`.
- [x] Paso 19: Añadir un botón `Reintentar ahora` visible solo en `reconnecting`, conectado a `lobby.retryNow()`.
- [x] Paso 20: Mostrar un aviso si `navigator.onLine === false`: `Sin conexión a internet. Se reintentará al volver.`.
- [x] Paso 21: Mantener el último snapshot visible durante `reconnecting` para que la lista no desaparezca; limpiar solo en `disconnected`/`error`.

### Fase 4 — Verificación y cierre

- [x] Paso 22: Ejecutar typecheck, Prettier y build.
- [x] Paso 23: Probar caída y recuperación del backend, cancelación, alias, evento `online` y `visibilitychange`.
- [x] Paso 24: Confirmar que mini lobbies siguen funcionando tras reconectar.
- [x] Paso 25: Actualizar estado, checkboxes, “Progreso” y “Changelog” de este spec.
- [x] Paso 26: Añadir el toast `Conexión restablecida` al detectar un `welcome` posterior a una reconexión, con autocierre a los 3,5 s y botón de cierre.
- [x] Paso 27: Instalar `@lucide/svelte` y usar sus iconos en el toast, aviso offline, banner de reintento y botones; añadir `ssr.noExternal` en Vite.
- [x] Paso 28: Verificar el cierre fatal `4001` y los cierres inesperados con servidores WebSocket de prueba.
- [x] Paso 29: Ejecutar un E2E headless que cubra caída, backoff, recuperación, toast, cancelación manual, alias, mini lobbies, `online`, `visibilitychange` y navegación fuera.

### Notas de diseño

- El servidor no cambia: al reconectar, el jugador recibe un `id` nuevo y un `welcome` nuevo. El alias se conserva en el cliente.
- El cierre `1000` iniciado por el propio cliente nunca reintenta.
- El cierre `4001` es fatal para ese intento: reintentar con el mismo alias sin cambiar nada solo repetiría el fallo.
- `onerror` del navegador no aporta detalles; se usa solo como señal y la decisión final se toma en `onclose`.
- El listener `online` solo adelanta el temporizador; no crea un socket si ya hay uno abierto. `visibilitychange` reutiliza la misma ruta `retryNow()`.
- La cuenta atrás es solo presentación; la fuente de verdad del siguiente intento es `nextRetryAt`.
- El toast se dispara cuando llega un `welcome` con `reconnectAttempt > 0`; se autooculta a los 3,5 s y también se puede cerrar a mano.
- `@lucide/svelte` se importa por icono (`@lucide/svelte/icons/*`) y se compila en SSR con `ssr.noExternal` para evitar que Node intente cargar archivos `.svelte`.
- El cierre `4001` se cubre con un servidor WS de prueba que cierra al abrir: no se programa ningún reintento.

## 8. Verificación

```bash
cd frontend && bun install
cd frontend && bun run check
cd frontend && bunx prettier --check \
  src/lib/services/lobbySocket.ts \
  src/lib/state/lobby.svelte.ts \
  src/lib/components/ui/LobbyOverlay.svelte \
  vite.config.ts \
  package.json
cd frontend && bun run build
```

Pruebas automatizadas ejecutadas:

- Función pura `getReconnectDelay`: 1 s, 2 s, 4 s, 8 s y tope de 15 s; jitter de 800–1200 ms en el primer intento.
- Servicio con servidor WS que cierra con `4001`: estado `error`, un solo socket y cero reintentos.
- Servicio con servidor WS que cierra con `1011`: estado `reconnecting` y reintentos sucesivos.
- E2E headless con Chromium: caída del backend, backoff creciente, recuperación con toast, desconexión manual, cambio de alias, mini lobbies, `online`, `visibilitychange` y navegación fuera.

Casos manuales:

1. Levantar backend y frontend; comprobar `Conectado`.
2. Detener el backend; el overlay pasa a `Reconectando…` y la espera crece: ~1 s, ~2 s, ~4 s, ~8 s, 15 s.
3. Levantar el backend; la conexión se recupera sola, aparece `Conexión restablecida` y el contador vuelve a cero.
4. Entrar en un mini lobby y repetir la caída; tras reconectar, el jugador vuelve al global con su alias.
5. Durante la cuenta atrás, pulsar `Desconectar`; no debe volver a intentar.
6. Pulsar `Reintentar ahora` con el backend levantado; debe conectar de inmediato.
7. Desconectar la red del sistema o simular offline; al volver, el evento `online` debe acelerar el reintento.
8. Cambiar el alias mientras está reconectando; el siguiente `welcome` debe usar el nuevo alias.
9. Navegar fuera de la página; no deben quedar sockets ni timers.
10. Cambiar de pestaña y volver durante la reconexión; debe intentar conectar de inmediato.
11. Comprobar que los iconos de Lucide se ven en el banner, el aviso offline, el toast y los botones.

## 9. Riesgos y mitigaciones

| Riesgo                                                       | Impacto | Mitigación                                                              |
| ------------------------------------------------------------ | ------- | ----------------------------------------------------------------------- |
| Bucles de reconexión si el servidor rechaza siempre          | medio   | No reintentar `4001`; backoff con máximo 15 s                            |
| Dos sockets activos por reconexiones solapadas               | alto    | Un único `reconnectTimer`; cerrar el socket previo antes de abrir otro   |
| Timers huérfanos tras desmontar la UI                        | alto    | Limpieza explícita en `disconnect()` y en el retorno de `onMount`        |
| Falsa sensación de conectado con snapshot viejo              | bajo    | Estado `reconnecting` visible y aviso de cuenta atrás                    |
| Jitter demasiado agresivo retrasa la recuperación            | bajo    | ±20 % sobre el valor base, máximo duro de 15 s                          |
| `online` dispara intentos mientras ya hay conexión           | bajo    | `retryNow()` solo actúa en `reconnecting` y con timer pendiente          |
| Identidad nueva tras reconectar                               | bajo    | Aceptado; el alias se conserva y la presencia se refresca                |
| `@lucide/svelte` se externaliza y rompe el SSR                 | medio   | `ssr.noExternal` en `vite.config.ts` y build de producción verificado     |
| El toast tapa el panel o se acumula                           | bajo    | Un solo toast, autocierre a los 3,5 s y descarte manual                  |

## 10. Preguntas resueltas

- [x] ¿Se quiere un límite máximo de intentos o reintentar indefinidamente con tope de 15 s?
  Se reintenta indefinidamente con un tope duro de 15 s entre intentos.
- [x] ¿Debe conservarse la identidad del jugador entre reconexiones (session id)?
  No. No se usan bases de datos en esta fase; el servidor asigna un `id` nuevo y el alias se conserva en `localStorage`.
- [x] ¿Se añade un heartbeat de aplicación en una iteración posterior?
  No hace falta. Se confía en el cierre del socket y en los eventos del navegador.
- [x] ¿Debe reconectarse también al volver a la pestaña (`visibilitychange`)?
  Sí. Si la pestaña vuelve a estar visible durante `reconnecting`, se adelanta el reintento.
- [x] ¿Se quiere mostrar un toast al recuperar la conexión?
  Sí. Se muestra `Conexión restablecida` y se autooculta.
## 11. Decisiones y notas

- La reconexión vive en `LobbySocket`, no en el componente; el estado solo refleja y controla.
- No hay cambios de protocolo ni de backend.
- El cierre manual usa código `1000` y marca `manualClose` para no reintentar.
- El backoff se resetea al recibir `welcome`, no al abrir el socket.
- Se reintenta indefinidamente, con base 1 s, factor 2, jitter de ±20 % y máximo de 15 s.
- No se conserva la identidad entre reconexiones; no hay sesiones ni base de datos.
- No se añade heartbeat de aplicación.
- `online` y `visibilitychange` comparten `retryNow()` y solo actúan en `reconnecting`.
- El toast `Conexión restablecida` se muestra al recibir un `welcome` tras una reconexión.
- El alias se mantiene en `localStorage` (`lobby:name`) y se reutiliza en cada `join`.
- La UI conserva el último snapshot durante `reconnecting` para evitar parpadeos.
- La cuenta atrás se calcula con `nextRetryAt` y un tick local; no programa reconexiones.
- Los listeners de red se registran solo en cliente y se limpian en `disconnect()`.
- Los iconos usan `@lucide/svelte`; `ssr.noExternal` permite compilarlos en la build de servidor.

## 12. Progreso

| Fecha      | Estado      | Nota                                                                 |
| ---------- | ----------- | -------------------------------------------------------------------- |
| 2026-10-30 | borrador    | Spec creado                                                          |
| 2026-10-30 | en progreso | Servicio, estado reactivo y UI de reconexión implementados            |
| 2026-10-30 | en progreso | Añadidos `visibilitychange`, toast de recuperación e iconos Lucide    |
| 2026-10-30 | completado  | Verificación con typecheck, Prettier, build, tests de servicio y E2E  |

## 13. Changelog

- 2026-10-30 — Creación del spec.
- 2026-10-30 — Implementación del backoff, estado `reconnecting`, cancelación y cuenta atrás.
- 2026-10-30 — Añadido reintento al volver a la pestaña (`visibilitychange`) y toast `Conexión restablecida`.
- 2026-10-30 — Iconos con `@lucide/svelte`; `ssr.noExternal` para la build SSR.
- 2026-10-30 — Verificación: `svelte-check`, Prettier, build, tests de servicio (`4001`/`1011`) y E2E headless de 9 fases.
