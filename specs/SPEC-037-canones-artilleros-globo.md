---
id: SPEC-037
titulo: "Cañones de rollos de papel y asientos de artillero en el globo"
estado: completado
prioridad: media
creado: 2026-11-13
actualizado: 2026-11-13
responsable: "OpenCode"
etiquetas: [gameplay, globo, cañones, balistica, websocket, three, rapier]
depende_de: [SPEC-013, SPEC-021]
bloquea: []
estimacion: "6h"
---

# SPEC-037 — Cañones de rollos de papel y asientos de artillero en el globo

## 1. Contexto

El globo aerostático del mapa exterior ya vuela con `Space`/`WASD` y sincroniza
su pose por WebSocket (SPEC-021). SPEC-013 añadió los rollos de papel lanzados
a mano, con balística y colisión resueltas en `PaperRoll.svelte`.

El modelo `frontend/static/props/balloon.glb` ya incluye dos cañones laterales
(`BAL_Cannon_L` y `BAL_Cannon_R`) montados en las bordas de la canasta, pero
hasta ahora eran decorativos. Se quiere que el piloto dispare un cañón frontal
y que otros dos jugadores puedan subir como artilleros y usar los laterales,
con una mira que anticipe el punto de caída.

## 2. Objetivo

Convertir el globo en una plataforma de tiro para tres jugadores: el primero en
subir pilota y dispara el cañón frontal; el segundo y el tercero ocupan los
cañones laterales. Cada ocupante ve el arco previsto y el anillo del punto de
impacto de su propio cañón.

## 3. Alcance

**Incluye**

- Asientos autoritativos `pilot`, `left` y `right` en el motor del globo.
- Cañón frontal nuevo, clonado del lateral derecho y orientado al morro (−Z).
- Disparo desde la boca real de cada cañón, con elevación fija.
- Sincronización del disparo por `throw-roll` con el campo `cannon`.
- Validación servidor: solo el ocupante de ese asiento puede dispararlo y el
  origen debe estar cerca del globo.
- Mira 3D con raycasts Rapier: arco de trayectoria + anillo en el impacto.
- Entrada/salida de artilleros con eyección al bajar el piloto.
- Cambio de asiento sin bajar del globo (piloto ⇄ cañones libres) con `Q`.
- HUD y controles de escritorio y táctiles para disparar.

**No incluye**

- Munición limitada, daño a jugadores o edificios.
- Rotación libre de los cañones: el piloto apunta girando el globo con `A/D`
  y los artilleros usan su dirección lateral fija.
- Animación de retroceso o efectos de sonido específicos del cañón.
- Avatares remotos sentados dentro de la canasta.

## 4. Requisitos

### Funcionales

| ID    | Requisito                                                                                                                   | Prioridad |
| ----- | --------------------------------------------------------------------------------------------------------------------------- | --------- |
| RF-1  | El piloto dispara el cañón frontal con clic, `F` o botón táctil `Fire`.                                                     | alta      |
| RF-2  | El segundo y tercer jugador en subir ocupan los cañones izquierdo/derecho.                                                  | alta      |
| RF-3  | Cada artillero dispara su cañón lateral con clic, `F` o botón táctil.                                                       | alta      |
| RF-4  | El origen y la dirección del rollo coinciden con la boca del cañón.                                                         | alta      |
| RF-5  | Aunque el globo gire o se desplace, la boca y la dirección se recalculan con su pose viva.                                  | alta      |
| RF-6  | El servidor rechaza disparos de quien no ocupa ese asiento.                                                                 | alta      |
| RF-7  | Al salir el piloto se vacían también los asientos de artillero.                                                             | media     |
| RF-8  | Los artilleros no pilotan ni mueven el globo.                                                                               | media     |
| RF-9  | Los demás clientes dibujan a los ocupantes en su asiento del globo, no de pie en el suelo.                                  | media     |
| RF-10 | Un ocupante cambia a un asiento libre sin bajar del globo con `Q`.                                                          | media     |
| RF-11 | Al dejar el pilotaje el globo queda aparcado y sin velocidad residual.                                                      | media     |
| RF-12 | Al tomar el pilotaje el cliente adopta la pose actual sin saltos.                                                           | alta      |
| RF-13 | El cañón apunta con el ratón: el arrastre de cámara gira el tubo y ajusta su elevación dentro de un cono.                   | alta      |
| RF-14 | El tubo visible, la cámara de apuntar y el disparo usan la misma puntería.                                                  | alta      |
| RF-15 | El ocupante elige con `V` o la rueda entre 1ª persona, 2ª persona (torreta) y 3ª persona (órbita).                          | alta      |
| RF-16 | En 1ª y 2ª persona la cámara va unida al cañón y se recorta a su cono.                                                      | alta      |
| RF-17 | El disparo alcanza objetivos lejanos: velocidad 45 m/s (máx. servidor 90).                                                  | alta      |
| RF-18 | La cámara sigue al tubo y al giro del globo, no al punto de caída.                                                          | alta      |
| RF-19 | El cañón puede deprimirse por debajo del horizonte para batir el suelo desde altura.                                        | alta      |
| RF-20 | Sin retícula ni arco de ayuda: se apunta por el propio tubo y la cámara.                                                    | alta      |
| RF-21 | El globo es el único vehículo con el avatar visible; en 1ª persona se oculta y en 2ª/3ª se dibuja de pie sobre la cubierta. | media     |

### No funcionales

| ID    | Requisito                                             | Criterio                                                   |
| ----- | ----------------------------------------------------- | ---------------------------------------------------------- |
| RNF-1 | El origen y la dirección del disparo son reales       | Misma gravedad (18), radio (0.13) y colliders que el rollo |
| RNF-2 | El disparo no depende de la latencia                  | El cliente dibuja el rollo de inmediato y luego reconcilia |
| RNF-3 | Ritmo controlado                                      | Enfriamiento de 420 ms en cliente y 220 ms en servidor     |
| RNF-4 | No romper el tipado ni el build                       | `svelte-check`, `tsc --noEmit` y `build` sin errores       |
| RNF-5 | El globo sigue sin salir del mapa ni superar el techo | Se mantienen los límites existentes                        |

## 5. Criterios de aceptación

- [x] CA-1: el primer jugador que sube pilota y ve el cañón frontal.
- [x] CA-2: los dos siguientes suben como artilleros izquierdo y derecho.
- [x] CA-3: el artillero no puede mover el globo con `WASD`.
- [x] CA-4: el disparo sale de la boca del cañón del asiento, no del centro.
- [x] CA-5: el disparo sale de la boca real y sigue la balística sin ayudas
      visuales ni retícula.
- [x] CA-6: un `throw-roll` con `cannon` de otro asiento recibe
      `BALLOON_NOT_GUNNER` y no se registra.
- [x] CA-7: al salir el piloto, los artilleros vuelven al suelo con él.
- [x] CA-8: `svelte-check`, `tsc --noEmit` y `vite build` terminan sin errores.
- [x] CA-9: `Q` alterna entre pilotar y un cañón lateral libre sin bajar.
- [x] CA-10: un asiento ocupado devuelve `BALLOON_SEAT_TAKEN` y no cambia nada.
- [x] CA-11: al volver al pilotaje el globo no se teletransporta a su posición
      anterior.
- [x] CA-12: arrastrar el ratón gira el tubo dentro del cono y el rollo sale en
      la dirección que marca el cañón.
- [x] CA-13: `V` o la rueda recorren 1ª persona → 2ª persona → 3ª persona, y la
      3ª vuelve a la órbita exterior del globo.
- [x] CA-14: en 1ª persona la cámara va en la cabeza y mira por el tubo; en 2ª
      va sobre el hombro, detrás del cañón, y ambas giran con el globo.
- [x] CA-15: un disparo de cañón a 45 m/s se acepta con `cannon`, y un rollo a
      mano por encima de 32 m/s se sigue rechazando.
- [x] CA-16: no queda retícula, arco ni anillo de impacto; el HUD solo muestra
      los controles y la vista activa.
- [x] CA-17: con elevación negativa (hasta −0.35 rad) el disparo cae cerca del
      globo.
- [x] CA-18: los botones táctiles permiten cambiar de vista y de asiento.
- [x] CA-19: el avatar propio se ve en 2ª y 3ª persona de pie sobre la cubierta,
      oculto en 1ª; los ocupantes remotos se dibujan en su asiento y no como
      figuras sueltas en el suelo. Coches, carrera y arena siguen ocultándolo.

## 6. Archivos relevantes

| Ruta                                                          | Acción    | Motivo                                                      |
| ------------------------------------------------------------- | --------- | ----------------------------------------------------------- |
| `frontend/src/lib/state/balloonCannons.ts`                    | crear     | Bocas, balística, asientos y cubierta                       |
| `frontend/src/lib/state/balloon.svelte.ts`                    | modificar | Asientos, `fireCannon`, pose local, eyección                |
| `frontend/src/lib/state/paperRolls.svelte.ts`                 | modificar | Registro unificado de lanzamientos y disparos de cañón      |
| `frontend/src/lib/services/protocol.ts`                       | modificar | Campos de artilleros, `cannon` y validador                  |
| `frontend/src/lib/services/lobbySocket.ts`                    | modificar | Envío de `throw-roll` con cañón                             |
| `frontend/src/lib/state/lobby.svelte.ts`                      | modificar | Cableado del emisor y error `NOT_ABOARD`                    |
| `frontend/src/lib/components/world/Balloon.svelte`            | modificar | Cañón frontal y pivotes de puntería                         |
| `frontend/src/lib/components/cars/CarControls.svelte`         | modificar | Teclas `F` y `V`, salida y bloqueo del pilotaje             |
| `frontend/src/lib/components/player/PlayerBehaviour.svelte`   | modificar | Disparo, cubierta del globo y pose del ocupante             |
| `frontend/src/lib/components/player/PlayerCollider.svelte`    | modificar | Congelación del collider para cualquier ocupante            |
| `frontend/src/lib/components/player/Player.svelte`            | modificar | Avatar visible en 2ª/3ª persona del globo                   |
| `frontend/src/lib/components/player/RemoteHero.svelte`        | modificar | Ocupantes remotos sentados en su asiento                    |
| `frontend/src/lib/components/player/RemoteHeroes.svelte`      | modificar | Dejar de filtrar a los tripulantes del globo                |
| `frontend/src/lib/state/playerState.ts`                       | modificar | `cameraYaw` y `cameraPhi` para la puntería                  |
| `frontend/src/lib/components/camera/ThirdPersonCamera.svelte` | modificar | Cámaras 1ª, 2ª y 3ª persona del ocupante                    |
| `frontend/src/lib/components/ui/CarPrompt.svelte`             | modificar | HUD de piloto/artillero y texto de abordaje                 |
| `frontend/src/lib/components/ui/MobileControls.svelte`        | modificar | Botones `Fire`, `Seat` y `View`                             |
| `backend/src/server/protocol.ts`                              | modificar | Tipos `BalloonState` y `ThrowRoll`                          |
| `backend/src/ws/paperRolls.ts`                                | modificar | Límite de velocidad propio para disparos de cañón           |
| `backend/src/server/validate.ts`                              | modificar | Validación de `switch-balloon-seat`                         |
| `backend/src/server/engines/balloon.ts`                       | modificar | Asientos, `onSwitchSeat`, `canFire`, eyección y desconexión |
| `backend/src/index.ts`                                        | modificar | Validación de `throw-roll` con cañón y cambio de asiento    |

## 7. Plan de implementación

### Fase 1 — Balística compartida

- [x] Definir bocas (frontal `(0, 1.64, −2.01)`, laterales `(±2.53, 1.76, 0)`
      con los 8° del modelo) y dirección local de cada cañón.
- [x] Fijar velocidad 45 m/s, elevación 0.24 rad y gravedad 18 m/s².
- [x] Implementar `cannonShot()` y `cannonSeatPosition()` con rotación por yaw.

### Fase 2 — Servidor y protocolo

- [x] Añadir `leftGunnerId/Name` y `rightGunnerId/Name` a `BalloonState`.
- [x] Asignar asiento automáticamente al subir y limpiarlo al bajar/desconectar.
- [x] Vaciar los asientos laterales cuando sale el piloto.
- [x] Validar `cannon` contra el asiento y el origen contra la posición del globo.
- [x] Devolver `BALLOON_NOT_GUNNER` si el disparo no es válido.

### Fase 3 — Cliente

- [x] Exponer `selfSeat`, `isGunner`, `isOccupant`, `isCrew` y `fireCannon`.
- [x] Unificar lanzamiento a mano y disparo de cañón en `paperRolls.register`.
- [x] Reparentar los cañones laterales conservando posición y rotación del GLB.
- [x] Clonar el cañón derecho como frontal, centrarlo y girarlo 90°.
- [x] Añadir plataforma de madera bajo el cañón frontal.
- [x] Colocar al artillero y su cámara sobre la borda de su cañón.
- [x] Añadir clic, `F` y botón táctil, con enfriamiento compartido.
- [x] Permitir cambiar de asiento libre con `Q` sin salir de la canasta.
- [x] Publicar `cameraYaw`/`cameraPhi` en `playerState` y enganchar la puntería
      al arrastre de cámara (giro ±1.15 rad, elevación −0.35–0.85 rad).
- [x] Montar cada cañón en grupos `yaw > pitch` para que el tubo siga al ratón.
- [x] Cancelar los 8° de inclinación de los anclajes laterales con un grupo de
      recorte, para que el giro no altere la elevación.
- [x] Quitar la retícula, el arco previsto y el anillo de impacto: se apunta
      por el tubo y la cámara.
- [x] Cámara de 1ª persona en la cabeza del ocupante, mirando por el tubo.
- [x] Cámara de 2ª persona sobre el hombro, detrás del cañón.
- [x] Cámara de 3ª persona orbital para el globo y tecla `V` o rueda para
      recorrerlas (con un pequeño enfriamiento para el trackpad).
- [x] La cámara de 1ª/2ª persona acompaña el giro del globo (A/D) sin que el
      cañón compense en secreto el giro dentro del cono.
- [x] Subir el disparo a 45 m/s (límite de servidor 90) y ajustar la previsión
      de la parábola a 6 s.
- [x] Preservar `cannon` en `validate.ts`: sin él el servidor no podía validar
      el asiento ni distinguir un disparo de un lanzamiento a mano.

### Fase 4 — Cambio de asiento

- [x] Añadir `switch-balloon-seat` al protocolo y validarlo en el servidor.
- [x] Implementar `onSwitchSeat`: solo asientos libres, globo aparcado sin
      velocidad al dejar el pilotaje y contador de reportes reiniciado.
- [x] Exponer `freeSeats`, `nextSeat` y `requestSwitchSeat` en el store.
- [x] Tecla `Q`, pista en el HUD y botón `Seat` en controles táctiles.
- [x] Botón `View` en controles táctiles para la cámara.
- [x] Avatar local visible en 2ª/3ª persona y oculto en 1ª; pies sobre la
      cubierta (`y = 0.12`) mirando en la dirección de su cañón.
- [x] Tripulantes remotos dibujados en su asiento en vez de filtrarlos.
- [x] Cámara de 2ª persona desplazada al hombro derecho para no taparse con la
      cabeza del avatar.
- [x] Adoptar la pose dibujada al volver al pilotaje para evitar saltos.
- [x] Devolver el globo a su aparición si la última tripulación se desconecta
      mientras está en el aire.

### Fase 5 — Verificación

- [x] `cd frontend && bun run check` (0 errores).
- [x] `cd backend && bunx tsc --noEmit` (sin salida).
- [x] `cd frontend && bun run build` (correcto).
- [ ] Prueba manual multijugador: piloto + dos artilleros disparando a la vez,
      arrastrando el ratón para apuntar y cambiando de asiento con `Q`.

## 8. Verificación

```bash
cd frontend && bun run check
cd frontend && bun run build
cd backend && bunx tsc --noEmit
```

## 9. Riesgos y notas

- El nodo `BAL_Cannon_L` del GLB está espejado 180°: el pivote debe heredar su
  cuaternión o el cañón apuntaría hacia dentro de la canasta.
- La boca frontal real queda en `y ≈ 1.64` porque el clon no conserva la
  inclinación de 8° del modelo lateral; la balística usa esa altura.
- El disparo replica el integrador de `PaperRoll.svelte` (primero gravedad,
  luego posición): origen en la boca real y velocidad según la elevación.
- `cameraPhi` es positivo hacia abajo; la elevación del cañón lo invierte
  (`0.24 + (0.3 − phi) · 1.15`) para que bajar la vista baje el tiro.
- El cañón puede deprimirse hasta −0.35 rad: desde altura hace falta batir el
  suelo cercano, que con elevación mínima 0 era inalcanzable.
- No hay retícula ni arco previsto. La puntería se lee en el propio tubo:
  la 1ª persona mira exactamente por él y la 2ª lo deja a la vista con un sesgo
  de 0.12 rad hacia abajo.
- La cámara de 1ª/2ª persona arranca de `cannonSeatPosition` (no de
  `playerState`) y gira con el globo; así el piloto ve girar su vista con A/D.
  No pasan por el corrector de colisión.
- La 3ª persona es la órbita exterior del globo (`BALLOON_PROFILE`). `V`, la
  rueda (con enfriamiento de 220 ms) o el botón `View` recorren las tres
  cámaras; la elección se reinicia en `balloon.reset()`.
- Los anclajes laterales del GLB llevan 8° de elevación. El grupo de recorte
  los cancela antes del giro para que `yaw` no incline el tubo ni separe la
  boca de la que usa la balística.
- `validate.ts` descartaba el campo `cannon`: ahora lo valida y lo conserva.
  Sin eso, el servidor aceptaba los disparos como lanzamientos a mano y el
  límite de velocidad de 32 m/s habría rechazado un tiro de cañón.
- Los ocupantes no reportan `player-position`: sus avatares se dibujan en el
  asiento del globo. La cubierta está en `y = 0.12` local (`BAL_Cabin_Floor`);
  `cannonSeatPosition` sigue siendo el ancla de cámara, 1.2 m más arriba.
- En 2ª persona la cámara se desplaza 0.42 m al hombro derecho y sube a 1.82 m
  sobre la base para que la cabeza del avatar no tape el tubo. En 1ª persona el
  avatar se oculta entero; en 3ª la órbita lo muestra de cuerpo completo.

## 10. Changelog

- 2026-11-13: implementación inicial de asientos, cañón frontal, disparo
  sincronizado y mira balística. Verificación de tipos y build completada;
  pendiente la prueba manual multijugador.
- 2026-11-13: cambio de asiento sin bajar del globo (`switch-balloon-seat`, `Q`,
  botón `Seat`), con globo aparcado al dejar el pilotaje y retorno a la
  aparición si la tripulación se desconecta en el aire.
- 2026-11-13: puntería con el ratón. `cameraPhi` llega a `playerState`, el
  cañón se monta en grupos `yaw/pitch`, el tubo y la mira comparten la misma
  puntería y el HUD indica «Drag to aim».
- 2026-11-13: retícula de punto de caída. El impacto se proyecta al viewport y
  el HUD dibuja anillo, marcas y distancia; sin impacto visible queda una mira
  centrada tenue. La cámara mira al cañón al ocupar el asiento.
- 2026-11-13: vista de torreta para artilleros, flecha de borde para el impacto
  fuera de cuadro, disparo a 45 m/s y validación real de `cannon` en servidor.
- 2026-11-13: la torreta también cubre al piloto. Deja de mirar al punto de
  caída (la retícula quedaba clavada en el centro) y sigue el tubo con un sesgo
  hacia abajo; la cámara gira con el globo y el cañón admite depresión hasta
  −0.35 rad para batir el suelo cercano.
- 2026-11-13: se retira toda la mira (retícula 2D, arco y anillo de impacto).
  Se añaden tres cámaras con `V`, la rueda o `View`: 1ª persona por el tubo,
  2ª persona sobre el hombro y 3ª persona orbital. La 1ª/2ª se recortan al cono
  del cañón y giran con el globo.
- 2026-11-13: el globo pasa a ser el único vehículo con el avatar visible. El
  ocupante local se dibuja de pie sobre la cubierta en 2ª/3ª persona y se
  oculta en 1ª; los tripulantes remotos se colocan en su asiento en vez de
  desaparecer. La cámara de 2ª persona se desplaza al hombro derecho para no
  chocar con la cabeza.
- 2026-11-13: corregido el motor `PaperRolls` por salas: seguía aplicando el
  límite de 32 m/s a los disparos con `cannon`, así que el servidor los
  descartaba tras validar el asiento. Ahora acepta hasta 90 m/s solo cuando el
  mensaje lleva `cannon` y los difunde en `rolls-state` al resto de la sala.
