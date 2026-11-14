---
id: SPEC-032
titulo: "Jukebox compartido del club con enlaces de SoundCloud"
estado: completado
prioridad: alta
creado: 2026-11-12
actualizado: 2026-11-12
responsable: "OpenCode"
etiquetas: [club, audio, soundcloud, websocket, jukebox]
depende_de: [SPEC-020, SPEC-031]
bloquea: []
estimacion: "5h"
---

# SPEC-032 — Jukebox compartido del club con enlaces de SoundCloud

## 1. Contexto

El club del mapa principal tiene escenario, cabina de DJ (`DV_DJBooth`) y la
pantalla `DV_VideoWall` (SPEC-031). La música de fondo actual es procedural y
suena igual para todos, pero no se puede elegir ni compartir.

El usuario pidió un checkpoint en el club donde cualquier jugador pegue un enlace
de SoundCloud y la pista se reproduzca para **todos** los sockets conectados,
con cola, lista de canciones, selección, borrado, play/pausa y salto. También
pidió que la pantalla del club deje de reaccionar al audio procedural; eso se
resolvió en SPEC-031 con un pulso sintético a 128 BPM. Más tarde pidió que la
pantalla y las luces **sí** reaccionen a las canciones del jukebox: ahora leen el
espectro real del `<audio>` y vuelven al pulso sintético cuando no hay pista.

El servidor ya es autoritativo para el lobby global (`GLOBAL_TOPIC`) y el cliente
ya usa un único WebSocket para presencia, chat, coches, NPCs y minijuegos. El
jukebox se integra en ese mismo canal.

## 2. Objetivo

Añadir un jukebox autoritativo en el servidor y un checkpoint interactivo en el
club: los jugadores pegan enlaces públicos de SoundCloud, el servidor mantiene
la cola y el estado de reproducción, y cada cliente reproduce la pista con un
`<audio>` alimentado por un puente de streaming del backend. El audio pasa
directo al reproductor y no se guarda en disco; el iframe de SoundCloud queda
solo como respaldo para pistas sin stream progresivo.

## 3. Alcance

**Incluye**

- Motor `ClubMusic` en el backend: cola, pista actual, play/pausa, salto,
  selección, borrado, duración y avance automático al terminar.
- Validación y normalización de URLs de SoundCloud, límite de 40 pistas,
  deduplicación y rate limits por jugador.
- Enriquecimiento asíncrono de título/autor/artwork con SoundCloud oEmbed.
- Mensajes WebSocket `club-music-*` y snapshot `club-music-state` en
  `GLOBAL_TOPIC`, enviado también en el `welcome`.
- Store cliente `clubMusic` con extrapolación de posición usando el reloj del
  servidor.
- Scraper propio de SoundCloud en el backend: descarga la página del track,
  lee `window.__sc_hydration`, descubre el `client_id` público en la página o
  sus bundles JS y pide la transcodificación progresiva (MP3) o, si no existe,
  la HLS. El stream se reenvía con soporte de `Range`, sin almacenar audio.
- Proxy HLS (`/club/hls`) que reescribe playlists y segmentos, y cliente con
  `hls.js` (o HLS nativo en Safari) para pistas que solo ofrecen HLS.
- Respaldo con la API de terceros `cloudsaver.net` si el scrape falla o el MP3
  caduca; la URL se valida antes de usarla.
- Componente UI con formulario de enlace, cola, botones de control y
  `<audio>` oculto como reproductor principal.
- Respaldo con el iframe/widget de SoundCloud solo si ningún resolvedor
  devuelve un stream reproducible.
- Checkpoint 3D junto a la cabina del DJ con prompt `E`.
- Congelación del movimiento del jugador mientras el panel está abierto.
- Atenuación del bus de música procedural mientras suena la pista compartida.
- Audio del jukebox enganchado al motor (`attachMedia`): respeta master/mute y
  se atenúa/panea según la distancia al escenario del DJ.
- Desbloqueo del autoplay con el primer clic/tecla del jugador, sin obligar a
  abrir el panel.
- La pantalla `DV_VideoWall` y los láseres de las cabezas móviles reaccionan al
  espectro real del jukebox; sin pista usan un pulso sintético a 128 BPM.
  Nunca leen el bus de audio procedural.

**No incluye**

- Subida de archivos de audio ni hospedaje propio de pistas: el backend solo
  reenvía el stream en memoria, sin escribir ficheros.
- Búsqueda dentro del juego o listado del catálogo de SoundCloud.
- Sincronización muestra a muestra del waveform.
- Moderación por roles: cualquier jugador del hub puede controlar la cola,
  con rate limits.
- Persistencia de la cola al reiniciar el backend.

## 4. Requisitos

### Funcionales

| ID   | Requisito                                                                                      | Prioridad |
| ---- | ---------------------------------------------------------------------------------------------- | --------- |
| RF-1 | Pegar un enlace público de SoundCloud lo añade a la cola compartida                            | alta      |
| RF-2 | La primera pista añadida empieza a sonar automáticamente para todos                            | alta      |
| RF-2b | Añadir una pista hace cola: no cambia la actual ni reinicia su posición                       | alta      |
| RF-3 | La cola lista todas las pistas con título, autor y quién la añadió                             | alta      |
| RF-4 | Seleccionar una pista de la lista la reproduce desde el segundo 0                              | alta      |
| RF-5 | Play/pausa, anterior y siguiente se reflejan en todos los clientes                             | alta      |
| RF-6 | Borrar la pista actual salta a la siguiente (o vacía el estado si no queda ninguna)             | media     |
| RF-7 | Al terminar una pista, el servidor avanza una sola vez aunque varios clientes reporten el fin    | alta      |
| RF-8 | El servidor rechaza URLs inválidas, duplicadas, cola llena y acciones demasiado rápidas          | alta      |
| RF-9 | El checkpoint muestra un prompt al acercarse y abre el panel con `E`; `Escape` lo cierra        | alta      |
| RF-10 | El jugador no se mueve ni lanza rollos mientras el panel está abierto                           | media     |
| RF-11 | La música procedural baja de volumen mientras suena la pista del club                           | media     |
| RF-12 | La pantalla y los láseres reaccionan al espectro del jukebox; sin pista usan el pulso sintético, nunca el audio procedural | media     |
| RF-18 | Las seis cabezas móviles del escenario proyectan láseres que barren la pista y siguen el ritmo | media |
| RF-13 | Al salir del hub, el reproductor local se pausa; al volver, se resincroniza                    | media     |
| RF-14 | El backend hace scraping de la página del track y reenvía el audio sin guardarlo en disco        | alta      |
| RF-15 | Si la pista solo ofrece HLS, el cliente lo reproduce con hls.js o HLS nativo                     | alta      |
| RF-16 | Si el scrape falla, el backend prueba la API de CloudSaver antes de rendirse                    | alta      |
| RF-17 | Si no hay ningún stream reproducible, el cliente usa el iframe de SoundCloud como respaldo      | media     |

### No funcionales

| ID    | Requisito                     | Criterio                                                              |
| ----- | ----------------------------- | --------------------------------------------------------------------- |
| RNF-1 | Servidor autoritativo         | El cliente nunca decide la pista actual ni la posición                |
| RNF-2 | Sincronía tolerante a deriva  | Se corrige si la diferencia con el servidor supera ~1,4 s             |
| RNF-3 | Dependencias acotadas         | WebSocket, `fetch`, `<audio>`, `hls.js` y el script oficial de SoundCloud |
| RNF-4 | Límites de abuso              | 40 pistas, add 1,5 s y comandos 0,35 s por jugador                    |
| RNF-5 | Compatibilidad de protocolo   | Tipos y validadores en frontend y backend; `tsc` y `svelte-check` OK  |
| RNF-6 | Sin bloquear el hilo         | oEmbed se resuelve en segundo plano con timeout de 4 s                |
| RNF-7 | Streaming sin almacenamiento  | El backend reenvía el cuerpo y los `Range`; no escribe audio en disco |
| RNF-8 | Resiliencia del `client_id`   | Descubrimiento en página/bundles JS o `SOUNDCLOUD_CLIENT_ID`           |
| RNF-9 | Scrape acotado                | Página 8 s, scripts 4 s, presupuesto 12 s y caché de 10 min            |
| RNF-10 | Respaldo validado            | MP3 con `Range` mínimo y HLS comprobando `#EXTM3U`                     |
| RNF-11 | Proxy HLS restringido        | Solo hosts `*.soundcloud.cloud`, `*.sndcdn.com` y `*.soundcloud.com`   |
| RNF-12 | Jukebox espacial             | `attachMedia` respeta master/mute y atenúa desde el DJ booth            |

## 5. Criterios de aceptación

- [x] CA-1: Un enlace válido aparece en la cola de todos los clientes del hub.
- [x] CA-2: La pista añadida suena (o queda lista para desbloquear con un clic).
- [x] CA-3: Play, pausa, anterior, siguiente, seleccionar y borrar se sincronizan.
- [x] CA-4: Varios clientes pueden reportar `FINISH` sin saltarse pistas.
- [x] CA-5: URLs inválidas, duplicadas y rate limits devuelven error visible.
- [x] CA-6: El prompt y el panel del checkpoint funcionan con `E`/`Escape`.
- [x] CA-7: El movimiento y el lanzamiento de rollos se bloquean con el panel abierto.
- [x] CA-8: `bun run check`, `bun run lint`, `bun run build` y `bunx tsc --noEmit` pasan.
- [x] CA-9: Dos clientes WebSocket reciben el mismo snapshot al añadir y saltar.
- [x] CA-9b: Añadir pistas con una sonando mantiene `currentId` y la posición avanza sin rebobinar.
- [x] CA-10: `/club/stream` devuelve 400 para URLs inválidas y 404 si no hay stream.
- [x] CA-11: El `<audio>` reproduce el stream del backend sin que el servidor guarde audio.
- [x] CA-12: Si SoundCloud falla, el mock de CloudSaver resuelve el MP3 y el proxy lo reenvía.
- [x] CA-14: El scraper lee `__sc_hydration`, descubre el `client_id` y pide la transcodificación en un mock.
- [x] CA-15: `/club/source` devuelve `kind: "hls"` y `/club/hls` reescribe playlist, clave y segmentos en un mock.
- [x] CA-16: El cliente reproduce HLS con `hls.js` y cae al iframe si el manifest falla.
- [ ] CA-13: Verificación manual con una pista real y dos navegadores (requiere red externa).

## 6. Archivos relevantes

| Ruta                                                        | Acción    | Motivo                                                         |
| ----------------------------------------------------------- | --------- | -------------------------------------------------------------- |
| `backend/src/server/clubMusic.ts`                           | crear     | Motor autoritativo de cola y reproducción                      |
| `backend/src/server/soundcloudStream.ts`                    | crear     | Scraper, CloudSaver y puente de audio con `Range`              |
| `backend/src/server/hlsProxy.ts`                            | crear     | Proxy de playlists/segmentos HLS y allowlist de hosts          |
| `backend/src/server/protocol.ts`                            | modificar | Tipos `ClubTrack`, `ClubMusicSnapshot` y mensajes              |
| `backend/src/server/validate.ts`                            | modificar | Validación de todos los `club-music-*`                         |
| `backend/src/index.ts`                                      | modificar | Instancia, broadcast, `welcome`, switch y `/club/stream`        |
| `frontend/vite.config.ts`                                   | modificar | Proxy de desarrollo `/club` hacia el backend                   |
| `frontend/src/lib/services/protocol.ts`                     | modificar | Tipos y guards del snapshot                                    |
| `frontend/src/lib/services/lobbySocket.ts`                  | modificar | Envíos y callback `onClubMusicState`                           |
| `frontend/src/lib/state/clubMusic.svelte.ts`                | crear     | Store cliente, offset de reloj y acciones                      |
| `frontend/src/lib/state/lobby.svelte.ts`                    | modificar | Binding del sender, snapshot, reset y errores                  |
| `frontend/src/lib/components/ui/ClubMusic.svelte`           | crear     | Panel, cola, `<audio>`/hls.js y respaldo SoundCloud            |
| `frontend/src/lib/components/world/ClubMusicBooth.svelte`   | crear     | Checkpoint 3D y detección de proximidad                        |
| `frontend/src/lib/components/player/PlayerBehaviour.svelte` | modificar | Congelar movimiento y rollos con el panel abierto              |
| `frontend/src/lib/Scene.svelte`                             | modificar | Montar el booth solo en el hub                                 |
| `frontend/src/lib/GamePage.svelte`                          | modificar | Montar el panel UI                                             |
| `frontend/src/lib/audio/engine.ts`                          | modificar | `setMusicDuck()`, `attachMedia()` y analizador del jukebox     |
| `frontend/src/lib/audio/spectrum.ts`                        | crear     | Espectro compartido (bass/mid/high/beat) para los visuales      |
| `frontend/src/lib/components/world/VideoWall.svelte`        | modificar | Espectro del jukebox con respaldo de pulso sintético            |
| `frontend/src/lib/components/world/ClubLasers.svelte`       | crear     | Láseres de las cabezas móviles animados por el espectro         |
| `frontend/src/lib/components/world/WorldMap.svelte`         | modificar | Montar `ClubLasers` junto a `VideoWall`                         |
| `specs/SPEC-031-shader-videowall-club.md`                   | modificar | Documentar el desacople del audio                              |
| `specs/SPEC-032-jukebox-soundcloud-club.md`                 | crear     | Este documento                                                 |

## 7. Plan de implementación

### Fase 1 — Protocolo y motor del servidor

- [x] Paso 1: Definir `ClubTrack`, `ClubMusicSnapshot` y mensajes en ambos protocolos.
- [x] Paso 2: Crear `ClubMusic` con cola, posición, versión y reloj interno.
- [x] Paso 3: Normalizar URLs de SoundCloud y rechazar hosts/rutas no válidas.
- [x] Paso 4: Añadir rate limits, límite de 40 pistas y deduplicación.
- [x] Paso 5: Implementar add/remove/select/play/pause/skip/ended/duration.
- [x] Paso 6: Enriquecer metadatos con oEmbed en segundo plano.

### Fase 2 — WebSocket

- [x] Paso 1: Validar cada mensaje `club-music-*` en `validate.ts`.
- [x] Paso 2: Instanciar `ClubMusic` en `index.ts` y publicar snapshots en `GLOBAL_TOPIC`.
- [x] Paso 3: Enviar el snapshot en `sendWelcome`.
- [x] Paso 4: Restringir comandos al lobby `global` y devolver errores tipados.
- [x] Paso 5: Avanzar solo si `trackId` y `version` coinciden en `ended`.

### Fase 3 — Cliente

- [x] Paso 1: Extender `lobbySocket` con envíos y `onClubMusicState`.
- [x] Paso 2: Crear el store `clubMusic` con snapshot, offset y posición viva.
- [x] Paso 3: Enlazar sender, reset y errores en `lobby.svelte.ts`.
- [x] Paso 4: Crear el panel UI con formulario, controles y cola.
- [x] Paso 5: Integrar el reproductor directo `<audio>` con el snapshot del servidor.
- [x] Paso 6: Añadir botón de gesto para desbloquear el autoplay.
- [x] Paso 7: Crear el checkpoint 3D y detectar proximidad con `playerState`.
- [x] Paso 8: Montar booth y UI; manejar `E`/`Escape`.
- [x] Paso 9: Congelar input y rollos con `clubMusic.panelOpen`.
- [x] Paso 10: Atenuar el bus procedural con `audio.setMusicDuck()`.

### Fase 3.5 — Stream directo de SoundCloud

- [x] Paso 1: Descargar la página del track y leer `window.__sc_hydration`.
- [x] Paso 2: Descubrir el `client_id` en la página/bundles JS o `SOUNDCLOUD_CLIENT_ID`.
- [x] Paso 3: Exponer `GET /club/stream?url=…` reenviando `Range`/`Content-Range` sin guardar audio.
- [x] Paso 4: Reintentar una vez si el CDN o el `client_id` caducan.
- [x] Paso 5: Añadir el proxy `/club` en Vite y usar `<audio src="/club/stream?url=…">`.
- [x] Paso 6: Exponer `GET /club/source` para que el cliente sepa si es MP3 o HLS.
- [x] Paso 7: Respaldo con `cloudsaver.net` si el scrape falla, validando MP3 y HLS.
- [x] Paso 8: Crear `/club/hls` con reescritura de playlists y allowlist de hosts.
- [x] Paso 9: Reproducir HLS con `hls.js` (o nativo en Safari) y caer al iframe solo si falla todo.

### Fase 4 — Pantalla y documentación

- [x] Paso 1: Retirar `audio.musicLevels()` y el analizador del motor.
- [x] Paso 2: Animar `DV_VideoWall` con pulso sintético y, después, con el espectro real del jukebox.
- [x] Paso 3: Actualizar SPEC-031 y crear SPEC-032.

### Fase 5 — Verificación

- [x] Paso 1: `cd frontend && bun run check`.
- [x] Paso 2: `cd frontend && bun run lint`.
- [x] Paso 3: `cd frontend && bun run build`.
- [x] Paso 4: `cd backend && bunx tsc --noEmit`.
- [x] Paso 5: Prueba de protocolo con dos clientes WebSocket.

## 8. Verificación

```bash
# Frontend
cd frontend && bun run check && bun run lint && bun run build

# Backend
cd backend && bunx tsc --noEmit
```

Casos manuales:

1. Entrar al hub y caminar hasta la cabina del DJ (delante del escenario).
2. Comprobar que aparece `CLUB JUKEBOX · E`.
3. Pulsar `E`, pegar un enlace público de SoundCloud y añadirlo.
4. Verificar que otro cliente conectado ve la pista y la escucha sincronizada.
5. Añadir dos o tres pistas, seleccionar una, saltar y borrar.
6. Pausar y reanudar; comprobar que el botón de gesto aparece si el navegador
   bloquea el autoplay.
7. Comprobar el puente de audio:

```bash
# URL inválida → 400
curl -i 'http://localhost:4000/club/stream?url=https%3A%2F%2Fexample.com%2Fx'

# La pista devuelve kind y la fuente que debe usar el cliente
curl -s 'http://localhost:4000/club/source?url=https%3A%2F%2Fsoundcloud.com%2Fikarun%2Fu-sweet-featarei'

# MP3 progresivo → 200/206 con audio/mpeg y Accept-Ranges
curl -i 'http://localhost:4000/club/stream?url=https%3A%2F%2Fsoundcloud.com%2Fforss%2Fflickermood'

# HLS: la playlist reescrita apunta a /club/hls?url=…
curl -s 'http://localhost:4000/club/hls?url=<playlist.m3u8-codificada>'

# Diagnóstico del scraper/CloudSaver (sin descargar la pista)
curl -s 'http://localhost:4000/club/resolve?url=https%3A%2F%2Fsoundcloud.com%2Fforss%2Fflickermood'
```

Si el descubrimiento del `client_id` falla en el entorno de despliegue, definir
`SOUNDCLOUD_CLIENT_ID` en el backend. El proxy no escribe ningún byte en disco:
mantiene el cuerpo en memoria y reenvía los rangos al `<audio>` del cliente. En
HLS, `/club/hls` reescribe playlists y segmentos para que `hls.js` siga
pidiéndolos al backend.

8. Abrir el panel y confirmar que el avatar no camina ni lanza rollos.
9. Entrar a un minijuego y volver: el reproductor se pausa y se resincroniza.
10. Comprobar que la pantalla y los láseres siguen la canción y vuelven al pulso sintético cuando no hay pista.

Prueba de protocolo:

```bash
# Backend en una terminal
cd backend && bun run dev

# En otra, dos clientes que añaden y saltan
# (usar el script de verificación del repo o un cliente WS manual)
```

## 9. Riesgos y mitigaciones

| Riesgo                                             | Impacto | Mitigación                                                        |
| -------------------------------------------------- | ------- | ----------------------------------------------------------------- |
| Autoplay bloqueado por el navegador                | alto    | Botón "Tap to enable audio" con gesto de usuario                  |
| Stream progresivo no disponible                    | alto    | HLS con `hls.js`; si falla, iframe oficial de SoundCloud          |
| HLS caducado o bloqueado por el CDN                | medio   | Reintento de resolución y fallback al iframe oficial              |
| SoundCloud cambia el HTML o `__sc_hydration`       | alto    | Respaldo CloudSaver y, si falla, iframe oficial                   |
| El audio se corta al cerrar el panel               | alto    | El `<audio>` vive fuera del panel y no se desmonta                |
| Varios clientes reportan `FINISH` a la vez         | alto    | El servidor exige `trackId` + `version` antes de avanzar          |
| Enlaces privados o eliminados                      | medio   | El reproductor emite `error` y se muestra un mensaje local        |
| `client_id` caducado o bloqueado                   | medio   | Reintento con descubrimiento nuevo o `SOUNDCLOUD_CLIENT_ID`       |
| CloudSaver caído o con formato distinto            | medio   | Se valida la URL con `Range`; si falla, queda el iframe oficial    |
| Spam de comandos o URLs gigantes                   | medio   | Rate limits, límite de 512 caracteres y 40 pistas                 |
| Deriva entre clientes                              | medio   | Corrección periódica si la diferencia supera ~1,4 s               |
| oEmbed lento o caído                               | bajo    | Timeout de 4 s y metadatos de respaldo desde el slug              |
| La música procedural tapa la pista compartida      | bajo    | `setMusicDuck(0.08)` mientras el reproductor está listo           |

## 10. Preguntas abiertas

- [ ] ¿La cola debe persistir entre reinicios del backend?
- [ ] ¿Se quieren permisos de DJ para que solo un jugador controle la cola?
- [ ] ¿Se reutilizará el jukebox en otros escenarios además del club?

## 11. Decisiones y notas

- El servidor es la única fuente de verdad: guarda pista actual, estado y
  posición; los clientes solo extrapolan entre snapshots.
- La posición se mide en el reloj del servidor (`serverTime`) y el cliente
  calcula un offset para no depender de la latencia exacta.
- `club-music-ended` incluye `trackId` y `version`: así varios clientes pueden
  avisar del fin sin que la cola salte varias canciones.
- El snapshot se difunde por `GLOBAL_TOPIC` y también en el `welcome`, de modo
  que un jugador que entra a mitad de canción se sincroniza de inmediato.
- El `<audio>` del jukebox se mantiene montado fuera del panel para que cerrar
  la UI no corte la música. Primero consulta `/club/source`: si hay MP3, su
  `src` apunta a `/club/stream`; si solo hay HLS, `hls.js` carga `/club/hls`.
  En ambos casos el backend reenvía el audio sin almacenarlo.
- El `<audio>` se engancha una sola vez al motor (`audio.attachMedia`) y se
  posiciona en el DJ booth: comparte master/mute y se atenúa/panea al alejarse
  del escenario, igual que los loops procedurales.
- Cualquier `pointerdown`/`keydown` del jugador reintenta `play()` y reanuda el
  `AudioContext`; así todos los sockets empiezan a sonar sin abrir el panel.
- Si SoundCloud solo ofrece HLS, el componente lo reproduce con `hls.js` en
  Chrome/Brave y con HLS nativo en Safari; si el manifest o los segmentos
  fallan, cae al iframe/widget oficial solo para esa pista.
- `cloudsaver.net` es el segundo resolvedor: se llama solo si el scrape falla,
  y su respuesta se trata como no confiable (se recogen URLs, se puntúan y se
  valida la elegida con `Range` para MP3 o `#EXTM3U` para HLS antes de usarla).
- La pantalla y los láseres leen `musicSpectrum`, alimentado por el
  `AnalyserNode` del `<audio>` del jukebox. Con pista siguen el ritmo real
  (graves, medios, agudos y golpes); sin pista vuelven al pulso sintético a
  128 BPM para que el club nunca quede estático.

## 12. Progreso

| Fecha      | Estado     | Nota                                                         |
| ---------- | ---------- | ------------------------------------------------------------ |
| 2026-11-12 | borrador   | Spec creado                                                  |
| 2026-11-12 | en-progreso | Motor del servidor y protocolo implementados                 |
| 2026-11-12 | completado | UI, checkpoint, sincronía, build y verificación completados  |

## 13. Changelog

- 2026-11-12 — Creación del spec e implementación del jukebox compartido.
- 2026-11-12 — Se desacopla `DV_VideoWall` del audio procedural (pulso sintético).
- 2026-11-12 — Scraper propio de SoundCloud con respaldo CloudSaver.
- 2026-11-12 — Soporte HLS: `/club/source`, `/club/hls` y `hls.js` en el cliente.
- 2026-11-12 — Láseres animados en las seis cabezas móviles del escenario.
- 2026-11-12 — Pantalla y láseres reaccionan al espectro real del jukebox.
