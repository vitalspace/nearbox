---
id: SPEC-004
titulo: "Chat global en el juego con historial de 20 mensajes"
estado: completado # borrador | en-progreso | bloqueado | completado | cancelado
prioridad: alta # baja | media | alta | crítica
creado: 2026-10-30
actualizado: 2026-10-30
responsable: opencode
etiquetas: [frontend, backend, websocket, chat, ui, elysia, svelte, tailwind]
depende_de: [SPEC-002, SPEC-003]
bloquea: []
estimacion: "5h"
---

# SPEC-004 — Chat global en el juego con historial de 20 mensajes

## 1. Contexto

`SPEC-002` implementó el lobby WebSocket en `ws://localhost:3000/ws` con un protocolo JSON de presencia (`join`, `welcome`, `presence`, `ping`, `error`) y tres mini lobbies. `SPEC-003` añadió reconexión automática con backoff y resolución del alias.

Hoy el juego no permite comunicarse entre jugadores. El backend (`backend/src/index.ts`) solo procesa mensajes de presencia y difunde snapshots por el topic `lobby:global`. El frontend monta `LobbyOverlay` desde `frontend/src/routes/+page.svelte`, y ese componente es el único propietario de la conexión (`lobby.connect()` en `onMount`).

El jugador controla al personaje con WASD/flechas/Espacio desde `frontend/src/lib/components/player/PlayerBehaviour.svelte`, que escucha `keydown`/`keyup` en `window` sin comprobar el elemento con foco. Cualquier input de texto que se añada debe aislarse de ese listener para que escribir en el chat no mueva al personaje.

El panel de `LobbyOverlay` ocupa la parte superior derecha (`fixed top-3 right-3 sm:w-80`). El chat se coloca a **media altura de la pantalla**: la lista en el borde izquierdo y el botón/input en el borde derecho, ambos centrados verticalmente, para no competir con el panel de lobby.

## 2. Objetivo

Añadir un chat de texto global sobre el WebSocket existente: el jugador abre el input con la tecla `T` o con un botón a media altura del borde derecho, envía mensajes que se difunden a todos los conectados, y ve el historial (máximo 20 mensajes, descartando los más antiguos) a media altura del borde izquierdo con formato `[HH:MM] usuario: mensaje`, sin que escribir en el chat interfiera con el control del personaje.

## 3. Alcance

**Incluye**

- Mensajes `chat` cliente → servidor y `chat` / `chat-history` servidor → cliente dentro del WebSocket `/ws` existente.
- Validación y saneado del texto en el servidor: recorte, colapso de espacios, eliminación de caracteres de control y límite de 200 caracteres.
- Límite de frecuencia por jugador (1 mensaje cada 500 ms) con error `RATE_LIMITED`.
- Historial en memoria del servidor con los últimos 20 mensajes globales.
- Envío de `chat-history` al unirse, justo después de `welcome`, para que un cliente nuevo vea los últimos 20 mensajes.
- Difusión de cada mensaje nuevo a todos los conectados por el topic `lobby:global`.
- Comandos de chat: `/help` (ayuda privada) y `/me <acción>` (emote difundido a todos).
- Estado reactivo de chat en el frontend: mensajes, apertura/cierre del input, borrador y contador de no leídos.
- Botón de chat a media altura del borde derecho con icono de Lucide (`MessageSquare`) y `aria-label`.
- Atajo `T` para abrir el input; `Enter` envía; `Escape` cierra.
- Lista de mensajes a media altura del borde izquierdo, con hora, autor, texto y scroll automático al más reciente.
- Formato de línea `[HH:MM] usuario: mensaje`, con variantes para emotes (`* usuario acción`) y mensajes de sistema.
- Límite de 20 mensajes también en el cliente: al superarlo se descarta el más antiguo.
- Distinción visual de los mensajes propios.
- Panel de `LobbyOverlay` colapsable (por defecto colapsado en móvil) para liberar espacio.
- Bloqueo del input de juego mientras el foco está en un campo editable y limpieza de teclas pulsadas al abrir el chat.
- Salida de pointer lock al abrir el chat para poder escribir con normalidad.
- Historial restaurado desde el servidor tras una reconexión.
- Documentación del nuevo protocolo en `backend/README.md`.

**No incluye**

- Chat por mini lobby, chat privado, mensajes directos ni canales.
- Persistencia en base de datos: el historial vive en memoria y se pierde al reiniciar el backend.
- Mensajes de sistema automáticos por conectar/desconectar o entrar/salir de lobbies (solo hay respuestas de sistema a comandos).
- Más comandos que `/help` y `/me`; no hay menciones, emojis personalizados ni adjuntos.
- Edición, borrado, respuestas, reacciones o historial paginado más allá de 20 mensajes.
- Moderación automática, filtro de palabras, silencios, reportes o roles.
- Cifrado extremo a extremo o autenticación de identidad (se usa el alias del lobby).
- Notificaciones nativas, sonidos de mensaje nuevo.
- Envío de mensajes con el socket desconectado o cola offline.
- Rediseño completo del panel de lobby o un sistema de pestañas.

## 4. Requisitos

### Funcionales

| ID    | Requisito                                                                                                                                     | Prioridad |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| RF-1  | El backend acepta `{ "type": "chat", "text": string }` de un jugador ya unido y lo valida con Zod dentro de la unión discriminada existente.   | alta      |
| RF-2  | El texto se sanea: se eliminan caracteres de control, se colapsan espacios y se recorta; si queda vacío se responde `EMPTY_MESSAGE`.          | alta      |
| RF-3  | Un texto saneado de más de 200 caracteres responde `MESSAGE_TOO_LONG` sin cerrar la conexión.                                                  | alta      |
| RF-4  | Un jugador no puede enviar más de un mensaje cada 500 ms; el exceso responde `RATE_LIMITED` sin cerrar la conexión.                            | media     |
| RF-5  | El servidor difunde a todos los conectados `{ "type": "chat", "message": ChatMessage }` por `lobby:global`.                                    | alta      |
| RF-6  | `ChatMessage` incluye `id`, `playerId`, `playerName`, `text`, `sentAt` y `kind` (`user`, `emote`, `system`); el nombre lo pone el servidor desde la presencia. | alta      |
| RF-7  | El servidor conserva en memoria los últimos 20 mensajes globales y descarta el más antiguo al superar el límite.                               | alta      |
| RF-8  | Al recibir `join`, el servidor envía `welcome`, luego `chat-history` con hasta 20 mensajes ordenados del más antiguo al más reciente.          | alta      |
| RF-9  | La tecla `T` abre el input de chat cuando el foco no está en un campo editable, no hay modificadores (`Ctrl`, `Meta`, `Alt`) y no es autorrepetición. | alta      |
| RF-10 | El botón de chat está fijo a media altura del borde derecho, abre/cierra el input y refleja el estado con `aria-expanded`.                      | alta      |
| RF-11 | `Enter` envía el mensaje y limpia el borrador; `Escape` cierra el input sin enviar; un mensaje vacío no se envía.                               | alta      |
| RF-12 | El input tiene `maxlength="200"`, se enfoca automáticamente al abrirse y se deshabilita si el socket no está conectado.                        | alta      |
| RF-13 | Los mensajes se listan a media altura del borde izquierdo, del más antiguo al más reciente, con formato `[HH:MM] usuario: texto`.              | alta      |
| RF-14 | La lista conserva como máximo 20 mensajes; al recibir el 21 se elimina el más antiguo (tanto en servidor como en cliente).                     | alta      |
| RF-15 | La lista hace scroll automático al último mensaje al recibir uno nuevo y muestra un estado vacío discreto cuando no hay mensajes.              | media     |
| RF-16 | Los mensajes propios se distinguen visualmente (color esmeralda y etiqueta `tú`).                                                              | media     |
| RF-17 | Con el chat cerrado, el botón muestra un contador de mensajes no leídos que se reinicia solo al abrir el input.                                 | baja      |
| RF-18 | `/help` responde solo al emisor con un mensaje `kind: 'system'` que lista los comandos disponibles; no se difunde ni entra en el historial.    | media     |
| RF-19 | `/me <acción>` difunde un mensaje `kind: 'emote'` que la UI muestra como `[HH:MM] * usuario acción`; un `/me` vacío responde `EMPTY_EMOTE`.     | media     |
| RF-20 | Un comando desconocido (por ejemplo `/foo`) responde solo al emisor con un mensaje `kind: 'system'` y no se difunde.                            | baja      |
| RF-21 | Mientras el foco está en el input de chat (o en cualquier `input`, `textarea`, `select` o `[contenteditable]`), `PlayerBehaviour` no registra teclas ni mueve al personaje. | alta      |
| RF-22 | Al abrir el chat se limpia el conjunto de teclas pulsadas y se llama a `document.exitPointerLock()` si el canvas tenía pointer lock.           | alta      |
| RF-23 | Al reconectar, `chat-history` reemplaza la lista local (no se duplican mensajes); al conectar manualmente con otro alias se vacía el chat.     | media     |
| RF-24 | La lista y el botón no bloquean el canvas: el contenedor usa `pointer-events-none` y solo los elementos interactivos usan `pointer-events-auto`. | alta      |
| RF-25 | La lista usa `role="log"` y `aria-live="polite"`; el input y el botón tienen etiquetas accesibles en español.                                  | media     |
| RF-26 | `ChatOverlay` no abre su propia conexión WebSocket: reutiliza el estado y el socket de `lobby.svelte.ts`.                                      | alta      |
| RF-27 | El panel de `LobbyOverlay` se puede colapsar desde su cabecera y arranca colapsado en pantallas menores de 640 px.                             | baja      |
| RF-28 | El usuario puede ocultar la lista de mensajes con un botón `Ocultar chat` (icono `EyeOff`); el historial se conserva y se puede volver a mostrar. | alta      |
| RF-29 | Si no llegan mensajes nuevos durante 15 s y el input está cerrado, la lista se oculta automáticamente; un mensaje nuevo o abrir el input la vuelve a mostrar. | media     |
| RF-30 | Ocultar el chat manualmente desactiva la reaparición automática por mensajes nuevos hasta que el usuario abra el chat o pulse `Mostrar chat`; el badge de no leídos sigue contando. | media     |
| RF-31 | En pantallas táctiles el chat cerrado se muestra como un aviso compacto con los tres mensajes más recientes; al abrir el input crece, se ancla arriba con altura acotada y oculta los controles táctiles y el HUD de misiones mientras se escribe. | alta      |

### No funcionales

| ID    | Requisito                                                              | Criterio                                                                                       |
| ----- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| RNF-1 | Sin dependencias nuevas en backend ni frontend.                        | Solo Elysia, Zod, Svelte, Tailwind y `@lucide/svelte` ya instalados                            |
| RNF-2 | Sin errores de TypeScript en backend.                                  | `cd backend && bunx tsc --noEmit` termina con código 0                                         |
| RNF-3 | Sin errores de tipos ni formato en los archivos tocados del frontend.  | `cd frontend && bun run check` y Prettier acotado pasan                                        |
| RNF-4 | Memoria acotada.                                                       | El servidor guarda como máximo 20 mensajes y el cliente como máximo 20 elementos               |
| RNF-5 | Sin riesgo de XSS.                                                     | El texto se renderiza con interpolación de Svelte; prohibido `{@html}`                          |
| RNF-6 | La UI no degrada el render 3D.                                         | Overlays en `position: fixed`, sin re-render del canvas por cada tecla                          |
| RNF-7 | Sin fugas de listeners.                                                | Los `keydown`/`keyup` globales se eliminan al desmontar `ChatOverlay` y `PlayerBehaviour`        |
| RNF-8 | Contrato duplicado y consistente.                                      | Los tipos de `backend/src/ws/protocol.ts` y `frontend/src/lib/services/protocol.ts` coinciden   |
| RNF-9 | Compatibilidad con el protocolo actual.                                | Los mensajes existentes (`join`, `presence`, `ping`, `error`) siguen funcionando igual           |

## 5. Criterios de aceptación

- [x] CA-1: Con dos clientes unidos (`Ana` y `Luis`), `Ana` envía `{"type":"chat","text":"hola"}` y ambos reciben `{ "type":"chat", "message": { "playerName":"Ana", "text":"hola", "kind":"user" } }`.
- [x] CA-2: Un cliente que se une después recibe `chat-history` con los mensajes previos, en orden y como máximo 20.
- [x] CA-3: Tras enviar 21 mensajes, el servidor y el cliente conservan exactamente 20 y el primero enviado ya no aparece.
- [x] CA-4: Enviar `{"type":"chat","text":"   "}` responde `error` con código `EMPTY_MESSAGE` y la conexión sigue abierta.
- [x] CA-5: Enviar un texto de 201 caracteres responde `error` con código `MESSAGE_TOO_LONG` y la conexión sigue abierta.
- [x] CA-6: Enviar dos mensajes en menos de 500 ms responde `error` con código `RATE_LIMITED` en el segundo y la conexión sigue abierta.
- [x] CA-7: Un cliente no unido que envía `chat` recibe `NOT_JOINED` (comportamiento ya existente) y no se difunde nada.
- [x] CA-8: Pulsar `T` con el juego en foco abre el input, lo enfoca y no escribe la letra `t` en el campo.
- [x] CA-9: Pulsar `T` mientras se escribe en el alias del lobby no abre el chat ni altera el alias.
- [x] CA-10: Escribir `wasd` en el input de chat no mueve al personaje; al cerrar con `Escape`, WASD vuelve a moverlo sin teclas atascadas.
- [x] CA-11: `Enter` envía el mensaje, el input se vacía y el mensaje aparece en la lista de ambos clientes como `[HH:MM] Ana: hola`.
- [x] CA-12: La lista de mensajes está a media altura del borde izquierdo y el botón/input a media altura del borde derecho.
- [x] CA-13: El botón de chat abre y cierra el input y muestra el contador de no leídos cuando hay mensajes nuevos con el chat cerrado; se reinicia solo al abrir.
- [x] CA-14: Con el socket desconectado, el input está deshabilitado y se muestra un aviso de que hay que reconectar.
- [x] CA-15: Al reconectar tras reiniciar el backend, el historial se reemplaza por el del servidor y no hay mensajes duplicados.
- [x] CA-16: `/help` muestra al emisor la lista de comandos sin difundirla; `/me se ríe` se difunde como `[HH:MM] * Ana se ríe`; `/foo` responde solo al emisor.
- [x] CA-17: El panel de lobby se puede colapsar y arranca colapsado en una pantalla menor de 640 px.
- [x] CA-18: `cd backend && bunx tsc --noEmit` y `cd frontend && bun run check` terminan sin errores.
- [x] CA-19: Prettier pasa en los archivos nuevos/modificados del frontend.
- [x] CA-20: El botón `Ocultar chat` oculta la lista, conserva los mensajes y deja un botón `Mostrar chat` en el borde izquierdo.
- [x] CA-21: Tras 15 s sin mensajes y con el input cerrado, la lista se oculta; al recibir un mensaje nuevo vuelve a mostrarse.
- [x] CA-22: Si el usuario ocultó el chat manualmente, un mensaje nuevo no lo reabre, pero el badge de no leídos aumenta y el botón `Mostrar chat` sigue visible.

## 6. Archivos relevantes

| Ruta                                                              | Acción    | Motivo                                                                  |
| ----------------------------------------------------------------- | --------- | ----------------------------------------------------------------------- |
| `backend/src/ws/protocol.ts`                                      | modificar | Añadir `ChatMessage` con `kind`, esquema `chat` y tipos del contrato    |
| `backend/src/ws/chat.ts`                                          | crear     | Historial acotado, saneado, comandos, generación de mensajes y rate limit |
| `backend/src/index.ts`                                            | modificar | Procesar `chat`, comandos, difundir y enviar `chat-history`             |
| `backend/README.md`                                               | modificar | Documentar `chat`, `chat-history`, comandos, límites y errores          |
| `frontend/src/lib/services/protocol.ts`                           | modificar | Espejo de tipos y guard `isChatMessage` / `isServerMessage`             |
| `frontend/src/lib/services/lobbySocket.ts`                        | modificar | `sendChat`, callbacks `onChat` y `onChatHistory`                        |
| `frontend/src/lib/state/lobby.svelte.ts`                          | modificar | Conectar callbacks de chat y exponer `sendChat`                         |
| `frontend/src/lib/state/chat.svelte.ts`                           | crear     | Estado reactivo: mensajes, visibilidad, apertura, borrador y no leídos |
| `frontend/src/lib/components/ui/ChatOverlay.svelte`               | crear     | Botón, input, lista de mensajes, hora, ocultar/auto-ocultar y atajos    |
| `frontend/src/lib/components/ui/LobbyOverlay.svelte`              | modificar | Añadir colapso del panel (por defecto colapsado en móvil)               |
| `frontend/src/lib/components/player/PlayerBehaviour.svelte`       | modificar | Ignorar teclas en campos editables y limpiar teclas al abrir el chat    |
| `frontend/src/routes/+page.svelte`                                | modificar | Montar `<ChatOverlay />` junto a `<Canvas />` y `<LobbyOverlay />`      |
| `specs/SPEC-004-chat-global.md`                                   | modificar | Respuestas a preguntas abiertas, comandos y nueva posición              |

## 7. Plan de implementación

### Fase 1 — Contrato y almacenamiento de chat en backend

- [x] Paso 1: En `backend/src/ws/protocol.ts`, añadir `ChatMessageKind = 'user' | 'emote' | 'system'` y `ChatMessage = { id, playerId, playerName, text, sentAt, kind }`.
- [x] Paso 2: Añadir `chatMessageSchema = z.object({ type: z.literal('chat'), text: z.string() })` a `clientMessageSchema`, incluir `'chat'` en `CLIENT_MESSAGE_TYPES` y ampliar `ServerMessage` con `{ type: 'chat'; message: ChatMessage }` y `{ type: 'chat-history'; messages: ChatMessage[] }`.
- [x] Paso 3: Crear `backend/src/ws/chat.ts` con las constantes `CHAT_HISTORY_LIMIT = 20`, `CHAT_MAX_LENGTH = 200` y `CHAT_RATE_LIMIT_MS = 500`.
- [x] Paso 4: Implementar `sanitizeChatText(raw: string): string` (quitar `\u0000-\u001f\u007f`, colapsar `\s+`, `trim`) e `isChatTextValid(text: string): boolean` (longitud 1–200).
- [x] Paso 5: Implementar `createChatMessage({ playerId, playerName, text, kind })` con `id` generado por `crypto.randomUUID()` y `sentAt: Date.now()`, y `addChatMessage(...)` que lo guarda en un array interno recortado con `slice(-CHAT_HISTORY_LIMIT)`.
- [x] Paso 6: Implementar `getChatHistory(): ChatMessage[]` (copia ordenada del más antiguo al más reciente), `checkChatRateLimit(playerId, now = Date.now()): boolean` y `clearChatRateLimit(playerId)` con un `Map<string, number>`.
- [x] Paso 7: Implementar `parseChatCommand(text): { type: 'none' } | { type: 'help' } | { type: 'emote'; text: string } | { type: 'unknown'; name: string }`, reconociendo `/help` y `/me <acción>` sin distinguir mayúsculas en el nombre del comando.

### Fase 2 — Endpoint WebSocket

- [x] Paso 8: En `backend/src/index.ts`, importar las funciones de `chat.ts` y `CHAT_MAX_LENGTH`.
- [x] Paso 9: En la rama de `join`, después de enviar `welcome`, enviar `{ type: 'chat-history', messages: getChatHistory() }` solo a ese socket.
- [x] Paso 10: En el `switch` de mensajes, añadir `case 'chat'`: sanear, validar vacío (`EMPTY_MESSAGE`), longitud (`MESSAGE_TOO_LONG`) y rate limit (`RATE_LIMITED`); después resolver comandos.
- [x] Paso 11: Para `/help` y comandos desconocidos, enviar solo al socket un `ChatMessage` con `kind: 'system'`, `playerId: 'system'` y `playerName: 'Sistema'`, sin añadirlo al historial.
- [x] Paso 12: Para `/me` sin texto, responder `EMPTY_EMOTE`; con texto, difundir `kind: 'emote'` con el texto de la acción. Para mensajes normales, difundir `kind: 'user'`. Ambos se añaden al historial.
- [x] Paso 13: En `close`, llamar a `clearChatRateLimit(ws.id)` para no acumular entradas en el `Map`.
- [x] Paso 14: Mantener sin cambios el comportamiento de `ping`, `enter-lobby`, `leave-lobby`, `welcome` y `presence`; los errores de chat nunca cierran el socket.

### Fase 3 — Cliente WebSocket y estado

- [x] Paso 15: En `frontend/src/lib/services/protocol.ts`, añadir `ChatMessageKind`, `ChatMessage`, extender `ClientMessage` con `{ type: 'chat'; text: string }`, extender `ServerMessage` con `chat` y `chat-history`, y crear `isChatMessage(value): value is ChatMessage`.
- [x] Paso 16: Ampliar `isServerMessage` para aceptar `chat` (valida `message`) y `chat-history` (valida array de `ChatMessage`).
- [x] Paso 17: En `frontend/src/lib/services/lobbySocket.ts`, añadir `onChat?: (message: ChatMessage) => void` y `onChatHistory?: (messages: ChatMessage[]) => void` a `LobbySocketOptions`, el método `sendChat(text: string): boolean` y las ramas correspondientes en `handleMessage`.
- [x] Paso 18: Crear `frontend/src/lib/state/chat.svelte.ts` con `class ChatStore` y runes: `messages`, `isOpen`, `draft` y `unread`.
- [x] Paso 19: Métodos de `ChatStore`: `addMessage(message, selfId?)` (deduplica por `id`, recorta a 20 y suma `unread` si está cerrado, no es sistema y no es propio), `setHistory(messages)` (reemplaza y recorta a 20), `open()` (marca leído), `close()`, `toggle()`, `reset()`; exportar `export const chat = new ChatStore()`.
- [x] Paso 20: En `frontend/src/lib/state/lobby.svelte.ts`, importar `chat` y pasar `onChat: (message) => chat.addMessage(message, this.self?.id)` y `onChatHistory: (messages) => chat.setHistory(messages)` al construir `LobbySocket`.
- [x] Paso 21: Añadir `sendChat(text: string): boolean` al store de lobby: comprobar `isOpen()`, llamar a `socket.sendChat(text)` y, si no hay conexión, usar `reportNotConnected()`; llamar a `chat.reset()` al inicio de `connect()`.

### Fase 4 — UI y aislamiento del input de juego

- [x] Paso 22: Crear `frontend/src/lib/components/ui/ChatOverlay.svelte` con dos bloques fijos: lista a media altura del borde izquierdo (`fixed left-3 top-1/2 -translate-y-1/2 z-40`, `pointer-events-none`) y control a media altura del borde derecho (`fixed right-3 top-1/2 -translate-y-1/2 z-[60]`).
- [x] Paso 23: La lista usa `role="log"` y `aria-live="polite"`, contenedor con `max-h-[60vh] overflow-y-auto` y ancho `w-[min(22rem,calc(100vw-1.5rem))]`; cada mensaje se renderiza como `[HH:MM] usuario: texto`, con `kind: 'emote'` en cursiva y `* usuario acción`, y `kind: 'system'` en ámbar; sin mensajes, mostrar `Sin mensajes todavía`.
- [x] Paso 24: Formatear la hora en 24 h con dos dígitos (`getHours`/`getMinutes` con `padStart`) para mostrar `[12:02]` sin depender del locale del navegador.
- [x] Paso 25: El botón usa el icono `MessageSquare` de `@lucide/svelte/icons/message-square`, `aria-label="Abrir chat (T)"`, `aria-expanded={chat.isOpen}` y un badge con `chat.unread` cuando sea mayor que 0.
- [x] Paso 26: El input se renderiza en el bloque derecho (`w-[min(20rem,calc(100vw-1.5rem))]`) con `maxlength="200"`, `autocomplete="off"`, `aria-label="Mensaje de chat"`, botón de enviar y botón de cerrar; `disabled` cuando `lobby.status !== 'connected'`, con aviso `Conecta para chatear` y ayuda `Escribe /help para ver comandos`.
- [x] Paso 27: Al abrir el chat, enfocar el input (`tick()` + `inputEl?.focus()`), llamar a `document.exitPointerLock()` si hay pointer lock, marcar como leído y limpiar el borrador al cerrar.
- [x] Paso 28: Gestionar `onsubmit`: recortar el borrador, no enviar vacío, llamar a `lobby.sendChat(text)`; si devuelve `true`, limpiar el borrador. `Escape` en el input cierra el chat.
- [x] Paso 29: Añadir un listener `keydown` en `window` dentro de `onMount`: si `event.key.toLowerCase() === 't'`, sin `ctrlKey/metaKey/altKey`, sin `event.repeat` y el `event.target` no es editable, hacer `event.preventDefault()` y `chat.open()`; eliminarlo en el cleanup.
- [x] Paso 30: Añadir un `$effect` que haga scroll al final de la lista cuando cambie `chat.messages.length` o se abra el chat; en `<sm`, ocultar la lista mientras el input está abierto.
- [x] Paso 31: En `PlayerBehaviour.svelte`, crear `isEditableTarget(target: EventTarget | null): boolean` y salir de `onKeyDown`/`onKeyUp` sin `preventDefault`, sin `pressed.add` y sin `pressed.delete` cuando el target sea editable; añadir un `$effect` que haga `pressed.clear()` cuando `chat.isOpen` sea `true`.
- [x] Paso 32: En `LobbyOverlay.svelte`, añadir un botón de colapso en la cabecera (`ChevronDown`/`ChevronUp`), ocultar el cuerpo cuando esté colapsado y arrancar colapsado si `window.matchMedia('(max-width: 639px)').matches`.
- [x] Paso 33: En `frontend/src/routes/+page.svelte`, montar `<ChatOverlay />` después de `<LobbyOverlay />`; no llamar a `lobby.connect()` desde `ChatOverlay`.

### Fase 5 — Ocultación manual y automática

- [x] Paso 34: En `frontend/src/lib/state/chat.svelte.ts`, añadir `visible = $state(true)`, `manualHidden = $state(false)` y `lastActivityAt = $state(Date.now())`, más la constante exportada `CHAT_AUTO_HIDE_MS = 15_000`.
- [x] Paso 35: Implementar `show()` (visible, `manualHidden = false`, resetea `lastActivityAt`), `hide(manual = true)` (visible a `false`, cierra el input y, si es manual, marca `manualHidden`), y actualizar `open()` para mostrar y desmarcar `manualHidden`; `addMessage` pone `visible = true` solo si `!manualHidden`, actualiza `lastActivityAt` y sigue contando no leídos.
- [x] Paso 36: En `ChatOverlay.svelte`, añadir un botón `Ocultar chat` (`EyeOff`) en la cabecera de la lista, un botón `Mostrar chat` (`MessageSquare`) a media altura izquierda cuando `!chat.visible`, y un `$effect` que programe `chat.hide(false)` tras `CHAT_AUTO_HIDE_MS` sin mensajes nuevos, reiniciándolo con `lastActivityAt` y cancelándolo si el input está abierto o el chat ya no está visible.

### Fase 6 — Documentación, verificación y cierre

- [x] Paso 37: Actualizar `backend/README.md` con `chat` y `chat-history`, `ChatMessage` con `kind`, comandos `/help` y `/me`, límites (200 caracteres, 20 mensajes, 500 ms) y códigos `EMPTY_MESSAGE`, `MESSAGE_TOO_LONG`, `RATE_LIMITED`, `EMPTY_EMOTE`.
- [x] Paso 38: Ejecutar la verificación de la sección 8 y corregir errores de tipos, formato o comportamiento.
- [x] Paso 39: Probar los casos manuales con dos pestañas y con un cliente Bun, incluyendo comandos, límite de 20, rate limit, foco del input, colapso del lobby, ocultación manual, auto-ocultado y reconexión.
- [x] Paso 40: Actualizar `estado`, `actualizado`, checkboxes, "Progreso" y "Changelog" de este spec.

### Contrato de mensajes

```ts
type ChatMessageKind = 'user' | 'emote' | 'system';

type ChatMessage = {
  id: string; // uuid generado por el servidor
  playerId: string; // id del socket/jugador; 'system' para respuestas de sistema
  playerName: string; // alias saneado del lobby; 'Sistema' para respuestas de sistema
  text: string; // 1..200 caracteres saneados
  sentAt: number; // epoch ms del servidor
  kind: ChatMessageKind;
};

// Cliente → servidor (añadido a la unión existente)
type ClientMessage =
  | { type: 'join'; name?: string }
  | { type: 'enter-lobby'; lobbyId: 'minigame-1' | 'minigame-2' | 'minigame-3' }
  | { type: 'leave-lobby' }
  | { type: 'chat'; text: string }
  | { type: 'ping' };

// Servidor → cliente (añadido a la unión existente)
type ServerMessage =
  | { type: 'welcome'; self: Player; presence: PresenceSnapshot }
  | { type: 'presence'; presence: PresenceSnapshot }
  | { type: 'chat'; message: ChatMessage }
  | { type: 'chat-history'; messages: ChatMessage[] }
  | { type: 'pong'; at: number }
  | { type: 'error'; code: string; message: string };
```

Secuencia de un mensaje:

1. El cliente envía `{ type: 'chat', text: 'hola' }`.
2. El servidor valida `join`, sanea, comprueba longitud y rate limit.
3. El servidor resuelve el comando si empieza por `/`.
4. El servidor crea el `ChatMessage` con `playerId`, `playerName`, `sentAt`, `id` y `kind`.
5. El servidor publica `{ type: 'chat', message }` en `lobby:global` (o solo al emisor si es `system`).
6. Todos los clientes reciben el mensaje, lo añaden y recortan a 20.

Comandos:

| Entrada            | Comportamiento                                                                 |
| ------------------ | ------------------------------------------------------------------------------ |
| `/help`            | Solo al emisor: `kind: 'system'` con `Comandos: /help y /me <acción>`           |
| `/me se ríe`       | Difundido: `kind: 'emote'`, texto `se ríe`                                      |
| `/me`              | Error `EMPTY_EMOTE`                                                             |
| `/foo`             | Solo al emisor: `kind: 'system'` con `Comando desconocido: /foo`                |
| `hola`             | Difundido: `kind: 'user'`, texto `hola`                                         |

Límites y errores:

| Caso                              | Respuesta del servidor                              |
| --------------------------------- | --------------------------------------------------- |
| Texto vacío tras sanear           | `{ type: 'error', code: 'EMPTY_MESSAGE' }`          |
| Texto saneado de más de 200       | `{ type: 'error', code: 'MESSAGE_TOO_LONG' }`       |
| Dos mensajes en menos de 500 ms   | `{ type: 'error', code: 'RATE_LIMITED' }`           |
| `/me` sin acción                  | `{ type: 'error', code: 'EMPTY_EMOTE' }`            |
| Socket sin `join`                 | `{ type: 'error', code: 'NOT_JOINED' }` (existente) |
| Texto válido                      | `{ type: 'chat', message: ChatMessage }`            |

## 8. Verificación

```bash
# Backend
cd backend && bunx tsc --noEmit
cd backend && bun run dev

# Frontend
cd frontend && bun run check
cd frontend && bunx prettier --check \
  src/lib/services/protocol.ts \
  src/lib/services/lobbySocket.ts \
  src/lib/state/chat.svelte.ts \
  src/lib/state/lobby.svelte.ts \
  src/lib/components/ui/ChatOverlay.svelte \
  src/lib/components/ui/LobbyOverlay.svelte \
  src/lib/components/player/PlayerBehaviour.svelte \
  src/routes/+page.svelte
cd frontend && bun run build
```

Prueba de chat con dos clientes (backend levantado, en otra terminal):

```bash
cd backend && bun -e '
const url = "ws://localhost:3000/ws";
const send = (ws, msg) => ws.send(JSON.stringify(msg));
const a = new WebSocket(url);
const b = new WebSocket(url);
a.onopen = () => send(a, { type: "join", name: "Ana" });
b.onopen = () => send(b, { type: "join", name: "Luis" });
a.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === "welcome") {
    send(a, { type: "chat", text: "hola desde Ana" });
    setTimeout(() => send(a, { type: "chat", text: "/me se ríe" }), 600);
    setTimeout(() => send(a, { type: "chat", text: "/help" }), 1200);
  }
  if (msg.type === "chat") console.log("Ana recibe", msg.message.kind, msg.message.playerName, msg.message.text);
  if (msg.type === "chat-history") console.log("historial Ana", msg.messages.length);
  if (msg.type === "error") console.log("error Ana", msg.code);
};
b.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === "chat") console.log("Luis recibe", msg.message.kind, msg.message.playerName, msg.message.text);
  if (msg.type === "chat-history") console.log("historial Luis", msg.messages.length);
  if (msg.type === "error") console.log("error Luis", msg.code);
};
setTimeout(() => { a.close(); b.close(); process.exit(0); }, 3000);
'
```

Prueba del límite de 20 (debe imprimir `20` y el primer texto ya no estar):

```bash
cd backend && bun -e '
const ws = new WebSocket("ws://localhost:3000/ws");
ws.onopen = () => ws.send(JSON.stringify({ type: "join", name: "Limite" }));
let i = 0;
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === "welcome") {
    const timer = setInterval(() => {
      ws.send(JSON.stringify({ type: "chat", text: `msg-${++i}` }));
      if (i === 21) clearInterval(timer);
    }, 550);
  }
  if (msg.type === "chat-history") {
    console.log("historial", msg.messages.length, msg.messages[0]?.text);
  }
};
setTimeout(() => process.exit(0), 13000);
'
```

Casos manuales:

1. Levantar backend y frontend; abrir `http://localhost:5173` con dos pestañas y alias distintos.
2. Pulsar `T` en la primera: el input aparece a media altura del borde derecho, tiene el foco y no se escribe ninguna `t`.
3. Escribir `wasd` y comprobar que el personaje no se mueve; pulsar `Escape` y comprobar que WASD vuelve a moverlo sin quedarse atascado.
4. Enviar `hola` con `Enter`: el mensaje aparece a media altura del borde izquierdo de ambas pestañas como `[HH:MM] Ana: hola`.
5. Con el chat cerrado, recibir un mensaje de la otra pestaña: el botón muestra un badge de no leídos; al abrir el chat, el badge desaparece (no al hacer scroll).
6. Enviar 21 mensajes: la lista muestra 20 y el primero ya no aparece.
7. Enviar un mensaje vacío y uno de 201 caracteres: no se difunden y no se rompe la conexión.
8. Enviar dos mensajes seguidos muy rápido: el segundo se rechaza con `RATE_LIMITED`.
9. Enviar `/help`: solo el emisor ve la ayuda; enviar `/me se ríe`: ambos ven `[HH:MM] * Ana se ríe`; enviar `/foo`: solo el emisor ve el aviso.
10. Abrir una tercera pestaña: recibe el historial con los últimos 20 mensajes.
11. Detener y reiniciar el backend: la pestaña reconecta, el historial del servidor (vacío tras el reinicio) reemplaza al local y no se duplican mensajes.
12. Comprobar que la lista no bloquea el canvas: arrastrar el ratón sobre la zona de mensajes sigue rotando la cámara.
13. En una ventana menor de 640 px, el panel de lobby arranca colapsado y se puede expandir/colapsar; el chat sigue siendo usable.
14. Pulsar `Ocultar chat`: la lista desaparece, los mensajes se conservan y aparece `Mostrar chat` a media altura izquierda; pulsarlo vuelve a mostrar la lista.
15. Dejar el chat cerrado y sin mensajes durante 15 s: la lista se oculta sola; al recibir un mensaje de la otra pestaña vuelve a mostrarse.
16. Ocultar el chat manualmente y recibir un mensaje: la lista no reaparece, el badge de no leídos aumenta y `Mostrar chat` sigue disponible.

## 9. Riesgos y mitigaciones

| Riesgo                                                          | Impacto | Mitigación                                                                                         |
| --------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| Escribir en el chat mueve al personaje                          | alto    | `isEditableTarget` en `PlayerBehaviour` + `pressed.clear()` al abrir el chat                         |
| Tecla `T` se escribe dentro del input al abrirse                | medio   | `preventDefault()` en el atajo y comprobación de target editable antes de abrir                      |
| Pointer lock impide hacer clic o ver el cursor en el input      | medio   | `document.exitPointerLock()` al abrir el chat                                                       |
| Solapamiento del input con el panel de lobby a media altura     | medio   | `z-[60]` para el chat y panel de lobby colapsable; en móvil arranca colapsado                       |
| Spam o flood de mensajes                                        | alto    | Rate limit de 500 ms, límite de 200 caracteres y errores sin cerrar el socket                       |
| Crecimiento ilimitado de memoria                                | medio   | Ring buffer de 20 en servidor y `slice(-20)` en cliente                                             |
| XSS por HTML en los mensajes                                    | alto    | Interpolación de Svelte y prohibición de `{@html}`; el servidor elimina caracteres de control        |
| Duplicación de mensajes al reconectar                           | medio   | `chat-history` reemplaza la lista; `addMessage` deduplica por `id`                                   |
| Cliente nuevo sin contexto de la conversación                   | bajo    | `chat-history` enviado tras `welcome`                                                               |
| Dos conexiones WebSocket por montar un segundo overlay          | alto    | `ChatOverlay` nunca llama a `lobby.connect()`; solo consume el estado existente                      |
| Respuestas de sistema contaminando el historial global          | medio   | `/help` y errores de comando se envían solo al emisor y no pasan por `addChatMessage`                |
| Comandos usados para saltarse el rate limit                     | medio   | El rate limit se comprueba antes de resolver el comando                                              |
| Mensajes tapando el juego en pantallas pequeñas                 | medio   | `pointer-events-none`, altura acotada y, en táctil, vista compacta de tres líneas con el panel abierto anclado arriba y controles ocultos |
| Timestamps inconsistentes entre clientes                        | bajo    | `sentAt` lo genera siempre el servidor                                                              |
| Alias cambiado a mitad de sesión y mensajes antiguos con otro nombre | bajo | El nombre se congela en cada `ChatMessage`; es el esperado para un historial                         |

## 10. Preguntas abiertas

- [x] ¿"Esquina media superior" se refiere a las esquinas superiores de la pantalla o a media altura del borde derecho/izquierdo? → **Media altura de la pantalla**: lista a la izquierda y botón/input a la derecha, centrados verticalmente.
- [x] ¿El chat debe ser global o separado por mini lobby? → **Global**.
- [x] ¿Se debe conservar el historial al reiniciar el backend? → **No**; sin base de datos, memoria volátil.
- [x] ¿Se muestran mensajes de sistema al conectar/desconectar o al entrar/salir de un mini lobby? → **No**; solo respuestas de sistema a comandos.
- [x] ¿Se admiten comandos como `/me` o `/help`? → **Sí**: `/help` y `/me <acción>`.
- [x] ¿Hace falta moderación, filtro de palabras o silenciar jugadores? → **No** en esta fase.
- [x] ¿Se muestra la hora de cada mensaje? → **Sí**, en formato `[HH:MM] usuario: mensaje`.
- [x] ¿El panel de lobby debe poder colapsarse en móvil? → **Sí**; colapsable y colapsado por defecto en `<640px`.
- [x] ¿El contador de no leídos se reinicia también al hacer scroll? → **No**, solo al abrir el input.
- [x] ¿Cuánto tiempo sin mensajes debe pasar para ocultar el chat? → **15 s** (`CHAT_AUTO_HIDE_MS`), solo con el input cerrado.
- [x] ¿Ocultar el chat borra el historial? → **No**; solo cambia la visibilidad y el historial sigue disponible al volver a mostrarlo.

## 11. Decisiones y notas

- El chat viaja por el WebSocket `/ws` existente; no se crea un endpoint ni una conexión nueva.
- La identidad y el nombre del emisor los pone el servidor desde la presencia; el cliente solo envía `text`.
- El historial es un array en memoria con `slice(-20)`; no hay base de datos ni persistencia.
- El servidor envía `chat-history` inmediatamente después de `welcome`, solo al socket que se une.
- Los mensajes se difunden por `lobby:global` porque todos los sockets están suscritos desde `open` y el chat es global.
- El rate limit se guarda por `playerId` en un `Map` y se limpia al cerrar el socket; se aplica también a los comandos.
- `ChatMessage.kind` distingue `user`, `emote` y `system`; las respuestas `system` se envían solo al emisor y no entran en el historial.
- Los comandos se resuelven en el servidor para que el cliente no pueda falsificar el autor ni el `kind`.
- `ChatOverlay` es puramente de presentación y estado; el socket sigue siendo propiedad exclusiva de `lobby.svelte.ts`.
- `lobby.svelte.ts` pasa su `self?.id` a `chat.addMessage` para distinguir mensajes propios sin que `chat.svelte.ts` importe el store de lobby (evita un ciclo de imports).
- El input es de una sola línea; los saltos de línea se colapsan como espacios en el saneado.
- El límite de 20 se aplica en ambos lados para que la UI nunca crezca aunque el servidor cambie.
- El chat se ancla a `top-1/2 -translate-y-1/2` en ambos bordes, según la respuesta del usuario; el panel de lobby permanece arriba a la derecha y ahora es colapsable.
- En desktop se ve la lista y el input a la vez; en `<sm` la lista se oculta mientras el input está abierto para evitar solapamientos.
- La lista de mensajes tiene visibilidad propia (`visible`) separada del input (`isOpen`): cerrar el input no oculta el historial.
- `hide(true)` marca `manualHidden` y bloquea la reaparición automática por mensajes nuevos; `show()` u `open()` lo desmarcan.
- El auto-ocultado usa `CHAT_AUTO_HIDE_MS = 15_000` y solo se programa si la lista está visible y el input cerrado; cada mensaje nuevo reinicia el temporizador.
- Ocultar el chat no borra mensajes ni el historial del servidor; solo afecta a la UI.
- La hora se formatea manualmente en 24 h con `padStart` para que `[12:02]` sea estable independientemente del locale.
- `T` se elige por no estar usado por el control actual (WASD, flechas, Espacio, Shift, Ctrl); se ignoran modificadores y autorrepetición.
- La verificación de frontend usa Prettier acotado porque el lint global tiene avisos preexistentes ajenos a este spec.
- En táctil el chat cerrado se limita a los tres mensajes más recientes y a una franja estrecha; al abrir el input se ancla arriba con `max-height` acotado y se marcan `html.chat-open` para que misiones y controles se aparten.

## 12. Progreso

| Fecha      | Estado      | Nota                                                          |
| ---------- | ----------- | ------------------------------------------------------------- |
| 2026-10-30 | borrador    | Spec creado                                                   |
| 2026-10-30 | en-progreso | Preguntas respondidas; comandos, hora y posición actualizados |
| 2026-10-30 | en-progreso | Backend de chat, estado y overlay implementados; añadida ocultación manual y auto-ocultado a 15 s |
| 2026-10-30 | completado   | Backend y UI verificados; `tsc`, `svelte-check`, Prettier, build y prueba UI con Playwright en verde |

## 13. Changelog

- 2026-10-30 — Creación del spec.
- 2026-10-30 — Respuestas del usuario: posición a media altura, chat global, sin persistencia, comandos `/help` y `/me`, hora `[HH:MM]`, lobby colapsable.
- 2026-10-30 — Añadida ocultación manual del chat y auto-ocultado tras 15 s sin mensajes nuevos.
- 2026-10-30 — Verificación final: `bunx tsc --noEmit`, `bun run check`, Prettier, `bun run build`, prueba WebSocket (`PASS chat`) y prueba UI con Playwright (`PASS UI`) incluyendo ocultación manual, auto-ocultado y reapertura por mensaje.
- 2026-11-01 — Vista compacta en táctil: tres mensajes cuando está cerrado y panel abierto acotado y anclado arriba; desaparecen controles y HUD de misiones mientras se escribe.
