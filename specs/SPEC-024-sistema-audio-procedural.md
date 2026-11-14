---
id: SPEC-024
titulo: "Audio procedural de alto rendimiento: pasos, combate, coches, monstruos y ambiente sin assets"
estado: implementado
prioridad: alta
creado: 2026-11-03
actualizado: 2026-11-04
responsable: opencode
etiquetas:
  [
    audio,
    web-audio,
    procedural,
    sintesis,
    sfx,
    ambiente,
    pasos,
    monstruos,
    coches,
    rendimiento,
    sin-assets,
    svelte,
    threlte,
  ]
depende_de: [SPEC-014, SPEC-018, SPEC-021, SPEC-023]
bloquea: []
estimacion: "20h"
---

# SPEC-024 — Audio procedural de alto rendimiento

## 1. Contexto

El proyecto **no tiene ningún sistema de audio**. No hay dependencia de audio en
`frontend/package.json`, no existen archivos de sonido en `frontend/static/` y
una búsqueda de `Audio`, `sound` o `Tone` en `frontend/src/lib` no devuelve
nada. `SPEC-023` excluye explícitamente el audio (“se añadirá aparte si se
pide”).

El usuario quiere sonido para:

- pasos al caminar y correr;
- impactos, disparos, daño y curación;
- el coche que conduce el jugador (motor, derrape, golpes, explosión);
- los monstruos del Barn Siege y las momias de la cripta;
- ambiente distinto por zona del mapa (claro central, bosque de la bruja,
  castillo de Drácula, calabazar, cementerio, cripta, pista del Grand Prix).

Restricciones del usuario:

- **Nada de MP3/WAV/OGG**: no debe aumentar la descarga del juego.
- Preocupación por el lag. Se propuso **Tone.js**, pero se quiere la opción
  más ligera y con menos latencia posible.
- El audio debe convivir con el multijugador y los minijuegos actuales sin
  tocar la lógica autoritativa del servidor.

Puntos de integración ya existentes y verificados:

| Sistema                       | Archivo                                                                                | Qué aporta                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Posición y estado del jugador | `frontend/src/lib/state/playerState.ts`                                                | `x`, `y` (pies), `z`, `grounded`, `cameraYaw`, `facingYaw`.                    |
| Modo de juego local           | `frontend/src/lib/state/playerState.ts`                                                | `playerRuntime.frozen`, `drivingCarId`, `racing`, `inWaves`.                   |
| Escena activa                 | `frontend/src/lib/state/sceneState.svelte.ts`                                          | `inCrypt`, `inGlobal`, `inRoadmap`, `inRace`, `inWaves`, `active`.             |
| Pasos y velocidades           | `frontend/src/lib/components/player/PlayerCollider.svelte`                             | `WALK_SPEED = 4`, `RUN_SPEED = 8`, `playerIntent.run`, `playerState.grounded`. |
| Coche libre                   | `frontend/src/lib/state/cars.svelte.ts` + `components/cars/CarPhysics.svelte`          | `selfCar`, `speed`, `steering`, `onImpact(impactSpeed, cause)`.                |
| Coches de carrera             | `frontend/src/lib/components/race/RaceCar.svelte`                                      | `onImpact` propio y telemetría por frame.                                      |
| Coche del roadmap             | `frontend/src/lib/components/cars/RoadmapCar.svelte`                                   | `VehiclePhysics` con `isDriver`.                                               |
| Coche del Barn Siege          | `frontend/src/lib/components/waves/WaveCar.svelte`                                     | `VehiclePhysics`, conductor local, `car-destroyed`.                            |
| Eventos del Barn Siege        | `frontend/src/lib/state/minigame5.svelte.ts`                                           | `events: SequencedMg5Event[]` con `seq`, `monsterKind`, `x/y/z`, `amount`.     |
| Eventos de la cripta          | `frontend/src/lib/state/minigame2.svelte.ts`                                           | `events: Mg2Event[]` (`skull-picked`, `round-start`, `round-won`, …).          |
| Eventos de carrera            | `frontend/src/lib/state/race.svelte.ts`                                                | `lastEvent: RaceEvent` (misil, mina, rayo, ítem, vuelta, destrucción).         |
| Eventos de coches             | `frontend/src/lib/state/cars.svelte.ts`                                                | `lastEvent: CarEvent` (`entered`, `exited`, `damaged`, `destroyed`).           |
| Ajustes y persistencia        | `frontend/src/lib/components/ui/SettingsMenu.svelte` + `state/playerProfile.svelte.ts` | Pestaña Profile, patrón `localStorage` + evento `storage`.                     |

Zonas del mapa ya usadas por las misiones de gatos (`missions/cats.ts`):
`centro` (claro central), `bosque` (`-33, -33`), `castillo` (`33, -33`),
`calabazar` (`-33, 33`) y `cementerio` (`33, 33`).

## 2. Objetivo

Añadir un **motor de audio procedural propio sobre la Web Audio API nativa**
que genere en tiempo de ejecución todos los sonidos del juego en `AudioBuffer`
deterministas, sin descargar ni un byte de audio. Debe cubrir pasos, combate,
vehículos, monstruos y ambiente por zona, con mezcla por buses, atenuación
posicional, límite de voces y ajustes persistentes, sin comprometer los 60 FPS
ni la estabilidad del multijugador.

## 3. Alcance

**Incluye**

- Motor singleton de audio con grafo de buses `master → compresor → destino`,
  y buses `sfx`, `ambience`, `music`, `voice` y `ui`.
- Síntesis DSP determinista (osciladores, ruido, filtros, envolventes,
  formantes, saturación) y caché de `AudioBuffer` a 22 050 Hz mono.
- Catálogo declarativo de recetas y generación perezosa por prioridad.
- Desbloqueo tras el primer gesto, suspensión al ocultar la pestaña,
  recuperación al volver y no-op limpio si no hay Web Audio.
- Pasos locales por superficie con acumulación de distancia, salto y aterrizaje.
- Pasos remotos de los 4 jugadores más cercanos, a volumen reducido.
- Sonidos de combate del Barn Siege: disparos, recarga, impactos, granadas,
  ácido, daño, caída, revivir, victoria y derrota.
- Voces de los 10 monstruos del Barn Siege: idle, ataque, daño y muerte.
- Sonidos de la cripta: momias, calaveras, ronda y depósito.
- Motor y derrape del coche local; golpes, vuelco y explosión; coches remotos
  cercanos; ítems y armas de la carrera.
- Ambiente procedural por zona con crossfade y eventos ambientales esporádicos
  (búho, grillos, crujidos, goteo, trueno).
- Música de Halloween procedural original: loop de vals tétrico de 8 s con
  melodía, bajo, pad y campanas, continuo entre escenas.
- Ajustes de volumen Master / Ambiente / Música / Efectos / Interfaz + mute,
  con persistencia en `localStorage` y sincronización entre pestañas.
- Componente de depuración solo en desarrollo (`?audio`) con catálogo,
  reproducción y contadores de voces.
- Script `audio:check` en Bun que valida todas las recetas (NaN, picos,
  duración y memoria estimada) sin navegador.

**No incluye**

- Música con licencia, canciones comerciales o audio grabado; la música del
  juego es una composición procedural propia y corta (loop de 8 s).
- Voz humana grabada, texto a voz, chat de voz ni micrófono.
- Audio posicional HRTF, `PannerNode` con convolución, oclusión por geometría,
  reverb por convolución o Doppler real.
- Audio autoritativo del servidor ni sincronización de reproducciones entre
  clientes; cada cliente decide qué suena según su cámara y sus eventos.
- Sonido de jugadores remotos distinto de los pasos (sin voces ni armas
  remotas).
- Ecualizador avanzado, límites por dispositivo, compresión por radio o
  análisis de espectro.
- Cambiar la lógica de juego, la red, el protocolo o el servidor.
- Añadir Tone.js, Howler.js ni cualquier dependencia de audio.

## 4. Requisitos

### Funcionales

| ID    | Requisito                                                                                                                                                           | Prioridad |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| RF-1  | El audio se genera 100 % en runtime; cero archivos de audio y cero peticiones de red de audio.                                                                      | alta      |
| RF-2  | El motor crea el `AudioContext` de forma perezosa y lo reanuda en el primer `pointerdown`, `keydown` o `touchstart`.                                                | alta      |
| RF-3  | Grafo de buses: fuentes → ganancia de voz → paneo → bus → master → compresor → destino; volúmenes independientes de master, sfx, ambience, music, voice y ui.       | alta      |
| RF-4  | Cada sonido tiene una receta determinista (misma semilla → mismo buffer), duración, bus, prioridad y límite de voces.                                               | alta      |
| RF-5  | Los buffers se generan a 22 050 Hz mono en bloques de como máximo 4 ms de trabajo, con presupuesto por frame y sin bloquear el hilo principal más de 8 ms seguidos. | alta      |
| RF-6  | Los sonidos posicionales atenúan por distancia (`ref = 4 m`, `max = 45 m`; 22 m en cripta) y panean en estéreo según el vector oreja→fuente.                        | alta      |
| RF-7  | Límite global de 24 one-shots y 12 loops; al superarse se descarta la voz de menor prioridad y, a igualdad, la más lejana.                                          | alta      |
| RF-8  | Cooldown por sonido y por fuente (mínimo 40 ms) para evitar metralleo de eventos duplicados.                                                                        | media     |
| RF-9  | Pasos al caminar y correr según distancia acumulada (zancada 1,75 m / 2,45 m), solo con `grounded`, sin `frozen` y sin conducir/correr.                             | alta      |
| RF-10 | Superficies de paso: `grass`, `dirt`, `stone` y `wood`, con 3 variantes por superficie y pitch/ganancia ligeramente aleatorios.                                     | alta      |
| RF-11 | Salto (`whoosh`) y aterrizaje (golpe seco) cuando el aire dura más de 0,25 s.                                                                                       | media     |
| RF-12 | Pasos remotos: solo los 4 jugadores más cercanos, con zancada estimada por velocidad, a ≤ 18 m y con ganancia ×0,5.                                                 | baja      |
| RF-13 | Combate: disparos por arma, disparo en vacío, recarga, impactos en carne/piedra, daño recibido, caída, revivir y curación.                                          | alta      |
| RF-14 | Granadas y ácido: lanzamiento, rebote, explosión, impacto de ácido, charco burbujeante y explosión del coche.                                                       | alta      |
| RF-15 | Cada uno de los 10 monstruos del Barn Siege tiene idle, ataque, daño y muerte propios; solo suenan los 6 idle más cercanos a ≤ 25 m.                                | alta      |
| RF-16 | La cripta suena: momias (idle/ataque/muerte), calaveras recogidas/depositadas, inicio de ronda, victoria y derrota.                                                 | alta      |
| RF-17 | Coche local: loop de motor con pitch/ganancia según velocidad y acelerador; derrape con giro/freno de mano; golpes, vuelco y explosión.                             | alta      |
| RF-18 | Coches remotos y de carrera: motor de los 2 más cercanos a ≤ 25 m; sonidos de misil, mina, rayo, ítem, puerta, vuelta, destrucción y meta.                          | media     |
| RF-19 | Ambiente por zona con un loop activo y crossfade de 1,5 s: `centro`, `bosque`, `castillo`, `calabazar`, `cementerio`, `cripta`, `carrera` y `waves`.                | alta      |
| RF-20 | Eventos ambientales esporádicos (búho, grillos, crujido, goteo, trueno) con intervalo aleatorio de 8–25 s solo en la zona activa y con volumen > 0.                 | baja      |
| RF-21 | Victoria, derrota, oleada superada, cuenta atrás, ítem recogido y checkpoints tienen feedback sonoro de UI.                                                         | media     |
| RF-22 | Ajustes persistentes en `localStorage` (`rw:audio:v1`): master, ambience, music, sfx, ui, mute; el cambio se aplica en caliente y se sincroniza entre pestañas.     | alta      |
| RF-23 | Al ocultar la pestaña se suspende el contexto tras 250 ms; al volver se reanuda solo si ya se desbloqueó.                                                           | alta      |
| RF-24 | Al cambiar de escena o lobby se detienen loops y one-shots posicionales con fade de 150–300 ms; no quedan fuentes huérfanas.                                        | alta      |
| RF-25 | Si `AudioContext` no existe, falla o el usuario está en mute, todas las llamadas son no-op y el juego sigue igual.                                                  | alta      |
| RF-26 | `?audio` en desarrollo muestra un panel con todos los sonidos, botones de reproducción, volumen efectivo y voces activas.                                           | baja      |
| RF-27 | Los sonidos de eventos usan un cursor (`seq`/contador) para no repetir el mismo evento en cada frame.                                                               | alta      |
| RF-28 | El audio no se inicializa hasta que `gameAssets.status === 'ready'`; la precarga de recetas empieza durante la pantalla de carga.                                   | media     |
| RF-29 | La música de Halloween es un loop procedural continuo, independiente del ambiente, que sobrevive a los cambios de escena y tiene su propio volumen.                 | media     |

### No funcionales

| ID     | Requisito           | Criterio                                                                                               |
| ------ | ------------------- | ------------------------------------------------------------------------------------------------------ |
| RNF-1  | Descarga de audio   | 0 bytes de audio; incremento de bundle ≤ 15 KB gzip (límite duro 25 KB).                               |
| RNF-2  | Memoria de audio    | ≤ 12 MB de `AudioBuffer` decodificado en el peor caso; objetivo típico ≤ 9 MB.                         |
| RNF-3  | Latencia de disparo | ≤ 30 ms desde la llamada `play()` hasta el inicio audible en hardware medio.                           |
| RNF-4  | Coste por frame     | Actualización de listener/loops ≤ 0,1 ms; ningún frame con generación > 8 ms.                          |
| RNF-5  | Estabilidad         | 10 minutos de juego con combate, coche y ambiente sin `NaN`, clipping audible ni crecimiento de voces. |
| RNF-6  | Determinismo        | Dos ejecuciones generan buffers idénticos para la misma receta y semilla.                              |
| RNF-7  | Compatibilidad      | Chrome/Edge/Firefox/Safari actuales; degradación limpia sin Web Audio.                                 |
| RNF-8  | Mezcla              | Compresor en master evita clipping con 24 voces simultáneas; pico de salida ≤ -1 dBFS.                 |
| RNF-9  | Limpieza            | Salir/entrar 10 veces de cada minijuego no deja loops, timers ni suscripciones.                        |
| RNF-10 | Mantenibilidad      | Recetas declarativas en un único catálogo; añadir un sonido no toca el motor.                          |

## 5. Criterios de aceptación

- [ ] CA-1: `rg -n "Audio|sound|Howl|Tone" frontend/src/lib` solo encuentra el sistema nuevo; no hay archivos de audio en `frontend/static/` ni peticiones de audio en la pestaña Network.
- [ ] CA-2: Antes del primer clic no suena nada y no hay errores de autoplay; tras el primer clic/tecla el contexto queda `running`.
- [ ] CA-3: Caminar produce pasos a ~2,3 Hz y correr a ~3,3 Hz, sincronizados con el avance real (no con el reloj).
- [ ] CA-4: Hierba, tierra, piedra y madera suenan distintos; entrar en la cripta cambia el paso a piedra.
- [ ] CA-5: Saltar y aterrizar desde > 0,25 s de aire produce `whoosh` y golpe; saltos pequeños no duplican sonido.
- [ ] CA-6: Un disparo de pistola, escopeta, subfusil y rifle suenan distintos; quedarse sin cargador produce `dry_fire`.
- [ ] CA-7: Recibir daño, caer, revivir y curarse tienen sonidos diferenciados; el daño no se repite más de una vez por evento.
- [ ] CA-8: Una granada produce lanzamiento, rebote y explosión; el ácido produce lanzamiento, impacto y charco burbujeante.
- [ ] CA-9: Los 10 monstruos del Barn Siege tienen voz propia; con 20 monstruos solo se oyen los 6 idle más cercanos.
- [ ] CA-10: Un monstruo que ataca, recibe daño o muere produce su sonido en la posición correcta y con paneo coherente.
- [ ] CA-11: En la cripta se oyen momias y eventos de calaveras/ronda; al salir se cortan con fade.
- [ ] CA-12: Conducir el coche produce motor continuo; la frecuencia sube con la velocidad y baja al frenar; el derrape aparece al girar fuerte o usar freno de mano.
- [ ] CA-13: Un choque fuerte y un vuelco suenan distintos; la destrucción del coche termina en explosión y el motor se detiene.
- [ ] CA-14: En la carrera se oyen misil, mina, rayo, ítem, puerta, vuelta y meta; los coches remotos más cercanos aportan motor.
- [ ] CA-15: Al cruzar del claro central al bosque, castillo, calabazar o cementerio el ambiente cambia con crossfade de 1,5 s y sin cortes.
- [ ] CA-16: En la cripta, el roadmap/race y el Barn Siege el ambiente es el correcto y no se solapa con el del mapa.
- [ ] CA-17: Los sliders Master/Ambiente/Efectos/Interfaz y el mute cambian el volumen al instante; recargar la página conserva los valores.
- [ ] CA-18: Abrir dos pestañas y cambiar el volumen en una actualiza la otra.
- [ ] CA-19: Ocultar la pestaña silencia y suspende; volver reanuda sin ráfagas ni bucles desincronizados.
- [ ] CA-20: Entrar y salir 10 veces de cripta, carrera y Barn Siege no deja bucles sonando ni voces acumuladas.
- [ ] CA-21: Con 24 one-shots simultáneos no hay clipping audible ni caída de FPS; el contador de voces respeta el límite.
- [x] CA-22: `bun run audio:check`, `bun run check`, `bun run lint` y `bun run build` pasan.
- [ ] CA-23: `?audio` reproduce cualquier receta y muestra voces activas; en producción el panel no existe.
- [ ] CA-24: Deshabilitar Web Audio en DevTools no rompe el juego; consola sin excepciones no controladas.

## 6. Archivos relevantes

| Ruta                                                       | Acción    | Motivo                                                                                                         |
| ---------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------- |
| `frontend/src/lib/audio/types.ts`                          | crear     | `SoundId`, `BusId`, `SurfaceId`, `SoundPriority`, `Recipe`, `PlayOptions`, handles.                            |
| `frontend/src/lib/audio/dsp.ts`                            | crear     | PRNG determinista, ruido blanco/rosa/marrón, envolventes, biquad, formantes, saturación, pitch glide.          |
| `frontend/src/lib/audio/recipes.ts`                        | crear     | Catálogo declarativo de todas las recetas y semillas.                                                          |
| `frontend/src/lib/audio/synth.ts`                          | crear     | Render de recetas a `AudioBuffer`/`Float32Array`, caché, generación por bloques y métricas.                    |
| `frontend/src/lib/audio/engine.ts`                         | crear     | Singleton: contexto, buses, compresor, unlock, play/loop, paneo, atenuación, límites, suspend/resume, dispose. |
| `frontend/src/lib/audio/settings.svelte.ts`                | crear     | Store `$state` de volúmenes, mute, persistencia `rw:audio:v1` y evento `storage`.                              |
| `frontend/src/lib/audio/zones.ts`                          | crear     | Zonas de ambiente, prioridad, superficies de paso y utilidades de distancia.                                   |
| `frontend/src/lib/audio/events.ts`                         | crear     | Mapeo de eventos de dominio (`Mg5`, `Mg2`, `Race`, `Car`) a recetas; cursores anti-repetición.                 |
| `frontend/src/lib/components/audio/AudioBootstrap.svelte`  | crear     | Init tras carga, unlock global, visibilidad, settings, listeners de eventos y cleanup.                         |
| `frontend/src/lib/components/audio/SceneAudio.svelte`      | crear     | Dentro del Canvas: listener, pasos, motores, monstruos idle y ambiente por zona.                               |
| `frontend/src/lib/components/audio/AudioDebug.svelte`      | crear     | Panel dev `?audio` (solo `import.meta.env.DEV`).                                                               |
| `frontend/src/lib/GamePage.svelte`                         | modificar | Montar `AudioBootstrap`; `AudioDebug` en dev.                                                                  |
| `frontend/src/lib/Scene.svelte`                            | modificar | Montar `SceneAudio` una vez, fuera de los bloques de escena.                                                   |
| `frontend/src/lib/components/ui/SettingsMenu.svelte`       | modificar | Sección “Audio” en la pestaña Profile: 4 sliders + mute + nota de persistencia.                                |
| `frontend/src/lib/components/cars/VehiclePhysics.svelte`   | modificar | Añadir `onTelemetry?(speed, steering, throttle, handbrake)` opcional, sin cambiar física.                      |
| `frontend/src/lib/components/cars/CarPhysics.svelte`       | modificar | Propagar `onTelemetry`/`onImpact` al audio local.                                                              |
| `frontend/src/lib/components/cars/RoadmapCar.svelte`       | modificar | Propagar telemetría e impactos del coche del roadmap.                                                          |
| `frontend/src/lib/components/race/RaceCar.svelte`          | modificar | Propagar telemetría e impactos del coche de carrera.                                                           |
| `frontend/src/lib/components/waves/WaveCar.svelte`         | modificar | Propagar telemetría e impactos del coche calabaza.                                                             |
| `frontend/src/lib/state/race.svelte.ts`                    | modificar | Añadir `eventSeq` incremental para consumo fiable de `lastEvent`.                                              |
| `frontend/src/lib/state/cars.svelte.ts`                    | modificar | Añadir `eventSeq` incremental para consumo fiable de `lastEvent`.                                              |
| `frontend/src/lib/components/player/PlayerCollider.svelte` | modificar | Exponer `lastStepDistance`/`airTime` o publicar un evento de aterrizaje (sin cambiar movimiento).              |
| `frontend/scripts/verify-audio-recipes.ts`                 | crear     | `audio:check`: valida recetas, NaN, picos, duración y memoria.                                                 |
| `frontend/package.json`                                    | modificar | Script `"audio:check": "bun scripts/verify-audio-recipes.ts"`.                                                 |
| `specs/SPEC-024-sistema-audio-procedural.md`               | crear     | Este spec.                                                                                                     |

## 7. Plan de implementación

### Fase 0 — Núcleo DSP, catálogo y verificación

- [x] Paso 1: Crear `audio/types.ts` con `SoundId`, `BusId`, `SurfaceId`,
      `Priority` (0–3), `Recipe` (`duration`, `seed`, `bus`, `priority`,
      `maxVoices`, `cooldownMs`, `render(sr) => Float32Array`) y opciones de
      reproducción.
- [x] Paso 2: Crear `audio/dsp.ts` con `mulberry32(seed)`, ruido blanco/rosa/
      marrón, `applyEnvelope` (attack/decay/sustain/release), `biquad`
      (lowpass/highpass/bandpass), `formant`, `saturate`, `pitchGlide` y
      `normalizePeak(target = -1 dBFS)`.
- [x] Paso 3: Crear `audio/recipes.ts` con las recetas de §11.4 y las tablas de
      monstruos de §11.6. Todas puras, sin `window`, con semilla fija.
- [x] Paso 4: Crear `audio/synth.ts`: render a `Float32Array`, conversión a
      `AudioBuffer` a 22 050 Hz, caché por `SoundId`, generación en bloques de
      4 096 muestras con presupuesto de 4 ms y `requestIdleCallback` (fallback
      `setTimeout(0)`).
- [x] Paso 5: Crear `scripts/verify-audio-recipes.ts`: importa las recetas,
      renderiza cada una, comprueba `Number.isFinite`, pico ≤ 1, duración
      esperada ±1 muestra y suma la memoria; falla con exit code 1 si algo no
      cumple. Añadir `audio:check` a `package.json`.
- [x] Paso 6: Ejecutar `bun run audio:check` y ajustar recetas hasta verde.

### Fase 1 — Motor, buses y ajustes

- [x] Paso 1: Crear `audio/settings.svelte.ts` con `master = 0.8`,
      `ambience = 0.55`, `sfx = 0.85`, `ui = 0.6`, `muted = false`; clamp
      0–1; guardar `{ version: 1, ... }` en `rw:audio:v1`; escuchar `storage`.
- [x] Paso 2: Crear `audio/engine.ts`:
  ```ts
  init(): void
  unlock(): Promise<void>
  isReady(): boolean
  play(id: SoundId, opts?: PlayOptions): SoundHandle | null
  loop(id: SoundId, opts?: PlayOptions): LoopHandle | null
  setListener(x: number, y: number, z: number, yaw: number): void
  setVolumes(v: AudioVolumes): void
  prewarm(ids: SoundId[]): void
  suspend(): void
  resume(): void
  dispose(): void
  stats(): { oneShots: number; loops: number; cachedBytes: number; state: string }
  ```
- [x] Paso 3: Grafo `masterGain → DynamicsCompressor (threshold -12 dB,
knee 24, ratio 12, attack 0.003, release 0.25) → destination`; buses
      `sfx`, `ambience`, `voice`, `ui`. Aplicar volumen con curva perceptual
      (`gain = value²`).
- [x] Paso 4: `play()` crea `AudioBufferSourceNode → GainNode (envolvente de
voz) → StereoPannerNode → bus`; programa `start(ctx.currentTime + 0.005)`
      y desconecta en `ended`. Aplicar cooldown por id/fuente y límite de
      voces con prioridad y distancia.
- [x] Paso 5: `loop()` devuelve un handle con `setGain`, `setPan`, `setRate`,
      `setFilter`, `stop(fadeMs)`; sin recrear nodos por frame.
- [x] Paso 6: Atenuación: `d = max(0.01, distancia)`;
      `att = clamp(1 - (d - ref) / (max - ref), 0, 1)²`; `paneo =
clamp(dot(dirección, right) / (d + 2), -1, 1)`; sin sonido si `d > max`.
- [x] Paso 7: `unlock()` idempotente: crea contexto con `latencyHint:
'interactive'`; si `state === 'suspended'`, `resume()`. Enganchar
      `pointerdown`, `keydown` y `touchstart` una sola vez con `{ once: true,
passive: true }` y limpiar listeners tras el éxito.
- [x] Paso 8: `visibilitychange`: si `hidden`, `suspend()` a los 250 ms; si
      visible y desbloqueado, `resume()`.

### Fase 2 — Bootstrap, ajustes de UI y depuración

- [x] Paso 1: Crear `AudioBootstrap.svelte`: `onMount` inicializa settings;
      cuando `gameAssets.status === 'ready'`, llama `audio.prewarm()` con los
      sonidos de pasos, disparos, daño, motor y ambiente central; registra
      unlock y visibilidad. `onDestroy` llama `dispose()`.
- [x] Paso 2: Montar `<AudioBootstrap />` en `GamePage.svelte` fuera del
      `{#if gameReady}` para capturar el primer gesto, pero sin generar audio
      hasta que el juego esté listo.
- [x] Paso 3: En `SettingsMenu.svelte`, añadir sección “Audio” con sliders
      `input[type=range]` para Master, Ambience, Effects e Interface, un botón
      mute con icono `Volume2`/`VolumeX`, y texto “Saved in this browser”.
      Reutilizar el estilo de las secciones existentes.
- [x] Paso 4: Crear `AudioDebug.svelte`: lista agrupada por bus, botón ▶ por
      receta, sliders de volumen, `stats()` en vivo y botón “Stop all”. Solo se
      renderiza con `import.meta.env.DEV && new URLSearchParams(location.search).has('audio')`.
- [x] Paso 5: Montar condicionalmente `<AudioDebug />` en `GamePage.svelte`.
- [x] Paso 6: Verificar que sin Web Audio (`delete window.AudioContext`) el
      panel no rompe y `audio` queda en no-op.

### Fase 3 — Pasos, salto y aterrizaje

- [x] Paso 1: En `PlayerCollider.svelte`, guardar `airTime` y exponer en un
      módulo ligero (`state/playerMotion.ts`) `airTime` y un contador
      `landedAt` al tocar suelo con caída > 0,25 s. No cambiar la física.
- [x] Paso 2: Crear `SceneAudio.svelte` con un `useTask` que lea
      `playerState`, `playerIntent.run`, `playerRuntime` y
      `sceneState`; acumular distancia XZ y disparar paso al cruzar la zancada.
- [x] Paso 3: Implementar `surfaceAt(scene, x, z)` en `zones.ts` según §11.5;
      elegir `footstep_{surface}_{0|1|2}` con gain ±1,5 dB y rate 0,95–1,05.
- [x] Paso 4: Salto/aterrizaje: `jump` al despegar; `land` si `airTime >
0,25`; cooldown 120 ms para no duplicar.
- [x] Paso 5: Pasos remotos: recorrer `remotePlayers.positions`, ordenar por
      distancia, tomar 4 a ≤ 18 m, estimar velocidad por delta de posición y
      reutilizar la misma lógica con ganancia ×0,5 y prioridad baja.
- [x] Paso 6: Bloquear pasos si `playerRuntime.frozen`, `drivingCarId`,
      `racing`, `inWaves && caído`, o si la escena no está lista.

### Fase 4 — Combate, monstruos y eventos

- [x] Paso 1: Crear `audio/events.ts` con cursores `lastMg5Seq`, `lastMg2`,
      `lastRaceSeq`, `lastCarSeq` y funciones `consumeMg5(events)`,
      `consumeMg2(events)`, `consumeRace(event, seq)`, `consumeCar(event, seq)`.
- [x] Paso 2: Añadir `eventSeq` a `race.svelte.ts` y `cars.svelte.ts`
      (incrementar en `applyEvent`); no cambiar los tipos de evento.
- [x] Paso 3: En `AudioBootstrap.svelte`, `$effect` sobre
      `minigame5.events` para consumir solo eventos nuevos: `monster-attack`,
      `monster-hit`, `monster-died`, `acid-thrown`, `acid-impact`,
      `grenade-exploded`, `player-hurt`, `player-downed`, `player-revived`,
      `drop-picked`, `car-destroyed`, `wave-started`, `wave-cleared`,
      `victory`, `defeat`.
- [x] Paso 4: Posicionar sonidos de monstruo con `x/y/z` del evento; si falta,
      buscar `monsterId` en `minigame5.monsters`; si tampoco, reproducir 2D.
- [x] Paso 5: En `SceneAudio.svelte`, mantener loops idle de los 6 monstruos
      activos más cercanos: alta a ≤ 25 m, baja a > 28 m (histéresis), un loop
      por monstruo, pan/gain cada 100 ms.
- [x] Paso 6: Consumir `minigame2.events` para momias y calaveras; usar
      `minigame2.mummies` para posiciones y `phase` para ronda.
- [x] Paso 7: Sonidos de armas locales: enganchar `waveInput`/eventos de
      disparo o añadir un callback en `WaveControls`/`PlayerBehaviour` para
      disparo, recarga y disparo en vacío. Preferir eventos del servidor si
      existen; evitar duplicar el sonido local y el remoto.
- [x] Paso 8: UI: `ui_confirm` al guardar ajustes/skin, `ui_click` en botones
      de ajustes, `ui_error` al fallar una acción, `checkpoint` al activar un
      checkpoint y `pickup` al recoger ítems.
- [x] Paso 9: Aplicar prioridades de §11.10 y cooldowns; verificar que una
      ráfaga de 12 disparos no supera el límite de voces.

### Fase 5 — Vehículos y carrera

- [x] Paso 1: En `VehiclePhysics.svelte`, añadir prop opcional
      `onTelemetry?: (speed, steering, throttle, handbrake) => void` y llamarla
      dentro del `useTask` existente (sin nodos nuevos).
- [x] Paso 2: Crear en `SceneAudio.svelte` el control del coche local: loop
      `car_engine` con `rate = 0.65 + (speed / maxSpeed) * 1.75`, ganancia
      `0.04 + throttle * 0.08 + min(speed / maxSpeed, 1) * 0.06`, suavizado
      `setTargetAtTime(…, 0.08)`.
- [x] Paso 3: Loop `car_tire` cuando `speed > 6` y (`|steering| > 0.55` o
      `handbrake`); ganancia por deslizamiento, rate 0,9–1,2, fade 120 ms.
- [x] Paso 4: Propagar `onImpact` de `CarPhysics`, `RaceCar`, `RoadmapCar` y
      `WaveCar`: `< 8` → `car_impact_light`; `≥ 8` → `car_impact_heavy`;
      `rollover` → `car_rollover`.
- [x] Paso 5: Consumir `race.lastEvent`: `missile-fired`, `missile-hit`,
      `mine-placed`, `mine-hit`, `ray-fired`, `item-picked`, `item-used`,
      `gate-passed`, `lap-completed`, `player-destroyed`, `player-respawned`,
      `race-start`, `race-ended`.
- [x] Paso 6: Consumir `cars.lastEvent` para `entered`, `exited`, `damaged`,
      `destroyed`, `respawned`; `damaged` con `amount` alto usa impacto fuerte.
- [x] Paso 7: Coches remotos: los 2 más cercanos a ≤ 25 m reproducen
      `car_engine` al 30 % de ganancia y sin derrape; actualizar a 10 Hz.

### Fase 6 — Ambiente por zona

- [x] Paso 1: Implementar `activeAmbience(sceneState, playerState)` en
      `zones.ts` con la tabla de §11.8 y prioridad escena explícita >
      zona más cercana > `centro`.
- [x] Paso 2: En `SceneAudio.svelte`, mantener un loop activo con crossfade:
      nuevo `loop()` a ganancia 0 → subir a objetivo en 1,5 s; el anterior baja
      a 0 y se detiene a los 1,5 s. Nunca más de 2 loops de ambiente.
- [x] Paso 3: Implementar pseudo-estéreo barato solo para ambiente:
      `ChannelSplitter` → `DelayNode` de 9 ms en el canal derecho →
      `ChannelMerger` → `StereoPanner`, sin duplicar buffers. Si el coste no
      compensa, dejar el ambiente mono y anotarlo en el spec.
- [x] Paso 4: Eventos ambientales: temporizador aleatorio 8–25 s; si la zona
      tiene eventos y el volumen > 0, reproducir uno posicional cerca del
      jugador (radio 8–20 m) con ganancia baja.
- [x] Paso 5: Al cambiar de escena (`inCrypt`, `inRace`, `inWaves`,
      `inRoadmap`) forzar reevaluación y fade de 200 ms; no esperar al
      siguiente tick de zona.
- [x] Paso 6: En `waves`, subir ligeramente la intensidad del loop durante
      `playing` y bajarla en `intermission`/`countdown` (multiplicador de
      ganancia, no nueva receta).
- [x] Paso 7: Verificar que el ambiente no tapa SFX: `ambience` por defecto
      0,55 y `sfx` 0,85.

### Fase 7 — Integración, rendimiento y cierre

- [x] Paso 1: Revisar todos los montajes: `AudioBootstrap` una sola vez,
      `SceneAudio` una sola vez, sin duplicar listeners en HMR.
- [x] Paso 2: Medir con Performance: generación inicial, memoria
      (`performance.memory` si existe), voces activas, FPS con 24 one-shots.
- [x] Paso 3: Probar 10 minutos de partida con coche, carrera, cripta y
      Barn Siege; buscar `NaN`, clipping, loops huérfanos y errores de consola.
- [x] Paso 4: Revisar que no hay sonidos en pestaña oculta y que al volver no
      se acumulan eventos.
- [x] Paso 5: Ejecutar `bun run audio:check`, `bun run check`, `bun run lint`,
      `bun run build`.
- [x] Paso 6: Actualizar este spec (`estado`, `actualizado`, Progreso,
      Changelog y checkboxes).

## 8. Verificación

```bash
# Frontend
cd frontend
bun run audio:check
bun run check
bun run lint
bun run build
```

Casos manuales:

1. **Autoplay**: abrir el juego sin tocar nada; no suena ni hay error. Hacer
   clic; el contexto pasa a `running` (visible en `?audio`).
2. **Pasos**: caminar y correr en el claro; el ritmo sigue la distancia, no el
   reloj. Cambiar a hierba/tierra/piedra/madera y oír la diferencia.
3. **Salto**: saltar desde una altura y aterrizar; `whoosh` + golpe. Saltitos
   cortos no duplican.
4. **Cripta**: entrar; pasos de piedra, ambiente de cripta, momias y calaveras.
   Salir; fade y vuelta al ambiente del mapa.
5. **Combate**: entrar a Barn Siege; disparar las 4 armas, recargar, quedarse
   sin balas, recibir daño, caer, revivir, lanzar granada y ver ácido.
6. **Monstruos**: con una oleada grande, comprobar que solo los 6 más cercanos
   tienen idle y que ataque/daño/muerte se oyen en su posición.
7. **Coche**: conducir el coche libre; motor sube/baja, derrape al girar,
   choque fuerte, vuelco y explosión.
8. **Carrera**: usar misil, mina y rayo; pasar puertas y vueltas; oír ítems y
   meta.
9. **Zonas**: recorrer centro → bosque → castillo → calabazar → cementerio;
   crossfade de 1,5 s, sin solapes.
10. **Ajustes**: mover los 4 sliders y mute; recargar; dos pestañas
    sincronizadas.
11. **Visibilidad**: ocultar 10 s y volver; sin ráfaga de sonidos atrasados.
12. **Estrés**: oleada 8 + coche + ambiente; contador de voces ≤ 24 one-shots
    y ≤ 12 loops; FPS estable.
13. **No-op**: en DevTools, `delete window.AudioContext` antes de cargar; el
    juego funciona sin audio y sin excepciones.
14. **Regresión**: chat, checkpoints, rollos, gatos, cripta, carrera, roadmap,
    Barn Siege y coches siguen funcionando.

## 9. Riesgos y mitigaciones

| Riesgo                                              | Impacto | Mitigación                                                                                                                       |
| --------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| La generación de buffers bloquea el hilo principal. | Alto    | Generación perezosa por prioridad, bloques de 4 096 muestras, presupuesto 4 ms, `requestIdleCallback`, prewarm durante la carga. |
| Demasiadas voces simultáneas saturan la mezcla.     | Alto    | Límite 24 one-shots/12 loops, prioridad, cooldowns, compresor en master y normalización a -1 dBFS.                               |
| El ambiente suena a bucle repetitivo.               | Medio   | Buffers de 8 s con componentes periódicas, crossfade de 1,5 s, eventos aleatorios y pseudo-estéreo con delay.                    |
| Safari/iOS no reanuda el audio.                     | Alto    | `resume()` en `pointerdown`/`touchstart`, reintento en cada gesto hasta `running`, no-op si falla.                               |
| Los eventos se reproducen varias veces por frame.   | Medio   | Cursores `seq`/`eventSeq`; `$effect` consume solo eventos nuevos; cooldown por id.                                               |
| Bucles huérfanos al cambiar de escena.              | Alto    | `SceneAudio` mantiene un registro de handles; `stop(fade)` en cambio de escena y `dispose()` al desmontar.                       |
| El audio tapa diálogos o UI.                        | Bajo    | Buses separados, `ui` 0,6, `ambience` 0,55, ducking manual de ambiente si hay overlay.                                           |
| El código de síntesis crece demasiado.              | Medio   | Catálogo declarativo, helpers DSP compartidos, límite 15 KB gzip y revisión en `build`.                                          |
| Los buffers ocupan demasiada memoria.               | Medio   | 22 050 Hz mono, ambientes de 8 s, idle de monstruos de 2–3 s, caché ≤ 12 MB, recetas lazy.                                       |
| El coche suena mal por telemetría a 10 Hz.          | Medio   | `onTelemetry` por frame desde `VehiclePhysics`, suavizado `setTargetAtTime(0.08)`, rate continuo.                                |
| El audio del servidor y el local se duplican.       | Medio   | Solo el cliente local reproduce su disparo/impacto; los eventos remotos se limitan a monstruos y coches cercanos.                |
| La pestaña oculta sigue consumiendo CPU.            | Bajo    | `visibilitychange` suspende el contexto; no se generan recetas oculto.                                                           |
| Ruido/clipping por sumar muchas fuentes.            | Medio   | Compresor, ganancias por bus, normalización, pruebas de estrés de §8.12.                                                         |

## 10. Preguntas abiertas

- [ ] ¿El ambiente debe sonar también en el lobby/onboarding o solo cuando el
      juego está listo? Propuesta: solo con `gameAssets.status === 'ready'`.
- [ ] ¿Volumen por defecto de ambiente 0,55 y efectos 0,85, o prefieres el
      ambiente más bajo (0,35)?
- [ ] ¿Quieres pasos remotos o solo los del jugador local? Propuesta: los 4
      más cercanos para dar presencia, con ganancia ×0,5.
- [x] ¿La música de fondo queda fuera del alcance? Resuelto: se añadió un loop
      de Halloween procedural (`music_halloween`) con bus y slider propios.
- [ ] ¿El estilo de las voces de monstruos (gritos, gruñidos, susurros) es
      suficiente o quieres referencias concretas por tipo?
- [ ] ¿El panel `?audio` debe existir también en producción oculto tras una
      combinación de teclas, o solo en dev?
- [ ] ¿Los ajustes de audio deben vivir en `rw:audio:v1` separado del perfil
      (propuesta) o dentro de `rw:profile:v1`?
- [ ] ¿Se permite un `DelayNode` de 9 ms para dar anchura al ambiente o
      prefieres mono puro para ahorrar nodos?
- [ ] ¿La carrera y el roadmap comparten ambiente de viento o quieres uno
      distinto para cada pista?

## 11. Decisiones y notas

### 11.1 Tone.js vs Web Audio nativo

**Decisión: Web Audio API nativa, sin Tone.js.**

| Criterio             | Tone.js                                                  | Web Audio nativo                                          |
| -------------------- | -------------------------------------------------------- | --------------------------------------------------------- |
| Descarga             | Dependencia extra (decenas de KB gzip) + código propio   | Solo código propio; 0 KB de audio                         |
| Latencia             | Web Audio por debajo, pero añade scheduling y objetos JS | Arranque directo de `AudioBufferSourceNode`               |
| Control              | Capa de alto nivel; cuesta bajar al buffer               | Control total de buffers, envelopes, filtros y mezcla     |
| Rendimiento          | Crea nodos/objetos por nota; transporte y reloj propios  | Nodos mínimos, reutilización de buffers, sin reloj global |
| Mantenimiento        | Versión y API externas                                   | Código pequeño y propio, sin breaking changes             |
| Curva de aprendizaje | API cómoda                                               | Más DSP, pero acotado a este catálogo                     |

Tone.js no es “lento” por usar Web Audio, pero para este caso añade peso y una
capa de scheduling que no se necesita: los sonidos son cortos, se disparan por
eventos y no hay secuencias musicales. La Web Audio nativa permite además
generar los buffers una vez y reproducirlos con coste casi nulo.

### 11.2 Grafo de audio

```text
one-shot:  AudioBufferSource → Gain (envelope) → StereoPanner → busGain ┐
loop:      AudioBufferSource → Biquad (opcional) → Gain → StereoPanner ─┤
                                                                        ├→ masterGain
ui/voice/sfx/ambience ──────────────────────────────────────────────────┘
                                                                        ↓
                                                          DynamicsCompressor
                                                                        ↓
                                                                   destination
```

- `master`: volumen general.
- `sfx`: pasos, armas, impactos, coches.
- `ambience`: loops de zona y eventos ambientales.
- `voice`: monstruos, daño del jugador, criaturas.
- `ui`: clics, confirmaciones, avisos.
- Compresor: `threshold -12 dB`, `knee 24`, `ratio 12`, `attack 0.003`,
  `release 0.25`.
- Volumen perceptual: `gain = clamp(value, 0, 1)²`.

### 11.3 Técnicas de síntesis

Todo se genera muestra a muestra con funciones puras:

- **Ruido**: blanco (PRNG), rosa (Voss-McCartney simplificado), marrón
  (integración con fuga).
- **Envolventes**: ataque/decaimiento exponencial o lineal, con curva de
  saturación para colas naturales.
- **Filtros**: biquad directo (lowpass, highpass, bandpass) con Q ajustable;
  sweep de frecuencia para whooshes y explosiones.
- **Osciladores**: seno, sierra, cuadrada y diente; glide de frecuencia;
  vibrato LFO.
- **Formantes**: 2–3 bandpass en paralelo sobre una fuente rica para voces de
  monstruo.
- **Saturación**: `tanh(x * drive)` para growls y motores.
- **Mezcla**: suma de capas, normalización a -1 dBFS, semilla fija por receta.
- **Bucles**: 6 s para ambiente, 8 s para música y 2–3 s para idle; crossfade
  interno entre final y principio para que el loop no chasquee.

### 11.4 Catálogo de sonidos

Duraciones orientativas; todas las recetas se normalizan y se cachean.

| Grupo       | IDs                                                                                                                                                                  | Duración    | Bus       | Voces máx. |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------- | ---------- |
| Pasos       | `footstep_grass_0..2`, `footstep_dirt_0..2`, `footstep_stone_0..2`, `footstep_wood_0..2`                                                                             | 90–130 ms   | sfx       | 4          |
| Salto       | `jump`, `land`                                                                                                                                                       | 150–220 ms  | sfx       | 2          |
| Jugador     | `player_hurt_light`, `player_hurt_heavy`, `player_downed`, `player_revive`, `player_heal`, `paper_throw`                                                             | 180–600 ms  | voice/sfx | 2          |
| Recogida    | `pickup_weapon`, `pickup_ammo`, `pickup_grenade`, `pickup_health`, `checkpoint`                                                                                      | 120–350 ms  | ui        | 2          |
| Armas       | `shot_pistol`, `shot_shotgun`, `shot_smg`, `shot_rifle`, `dry_fire`                                                                                                  | 80–450 ms   | sfx       | 6          |
| Recarga     | `reload_start`, `reload_end`, `shell_drop`                                                                                                                           | 90–300 ms   | sfx       | 2          |
| Explosivos  | `grenade_throw`, `grenade_bounce`, `explosion`, `acid_throw`, `acid_impact`, `acid_sizzle`                                                                           | 150–900 ms  | sfx       | 4          |
| Impactos    | `hit_flesh`, `hit_bone`, `hit_stone`, `hit_wood`                                                                                                                     | 70–140 ms   | sfx       | 6          |
| Monstruos   | `monster_{kind}_idle` (loop), `_attack`, `_hurt`, `_death`                                                                                                           | 300 ms–3 s  | voice     | 2 por tipo |
| Gatos       | `cat_meow`, `cat_purr`                                                                                                                                               | 0,6–0,95 s  | voice     | 2          |
| Coche       | `car_engine` (loop), `car_tire` (loop), `car_impact_light`, `car_impact_heavy`, `car_rollover`, `car_explosion`, `car_enter`, `car_exit`                             | 150 ms–8 s  | sfx       | 4          |
| Carrera     | `missile_fire`, `missile_hit`, `mine_drop`, `mine_explode`, `ray_fire`, `gate_pass`, `lap`, `item_pick`, `item_use`, `race_destroyed`, `race_respawn`, `race_finish` | 100–800 ms  | sfx/ui    | 4          |
| Ambiente    | `ambience_centro`, `ambience_bosque`, `ambience_castillo`, `ambience_calabazar`, `ambience_cementerio`, `ambience_crypt`, `ambience_race`, `ambience_waves`          | 6 s (loop)  | ambience  | 2          |
| Ambiente FX | `amb_owl`, `amb_crickets`, `amb_creak`, `amb_drip`, `amb_thunder`                                                                                                    | 500 ms–2 s  | ambience  | 2          |
| Música      | `music_halloween` (loop)                                                                                                                                             | 8 s         | music     | 1          |
| UI          | `ui_click`, `ui_confirm`, `ui_error`, `wave_start`, `wave_clear`, `victory`, `defeat`                                                                                | 80 ms–1,5 s | ui        | 2          |

Los IDs de monstruo son exactamente los de `Mg5MonsterKind`:
`skeleton`, `mummy`, `frankenstein`, `golem`, `demon`, `scarecrow`, `ghost`,
`witch`, `vampire`, `pumpkin-king`.

### 11.5 Pasos y superficies

La zancada acumula distancia XZ, no tiempo:

- caminar: 1,75 m → ~2,3 pasos/s a 4 m/s;
- correr: 2,45 m → ~3,3 pasos/s a 8 m/s;
- si el jugador se queda quieto, no hay pasos;
- si está en el aire, no se acumula;
- al aterrizar de > 0,25 s, `land` y reinicio del acumulador.

`surfaceAt(scene, x, z)` es una aproximación barata, sin raycast:

| Contexto                    | Superficie                                       |
| --------------------------- | ------------------------------------------------ |
| `crypt`                     | `stone`                                          |
| `race`, `roadmap`           | `stone` (asfalto)                                |
| `waves`                     | `dirt` dentro del calabazar, `grass` en el resto |
| mapa: `centro` (r ≤ 22)     | `stone`/`dirt`                                   |
| mapa: `castillo` (r ≤ 20)   | `stone`                                          |
| mapa: `cementerio` (r ≤ 24) | `stone`                                          |
| mapa: `calabazar` (r ≤ 28)  | `dirt`                                           |
| resto del mapa              | `grass`                                          |

La tabla vive en `zones.ts` y está marcada como dependiente del mapa, igual que
`wavesConfig.ts`.

### 11.6 Voces de monstruos

| Tipo         | Idle                              | Ataque                 | Daño             | Muerte                |
| ------------ | --------------------------------- | ---------------------- | ---------------- | --------------------- |
| Skeleton     | Castañeteo de huesos cada 2–4 s   | Chasquido seco + golpe | Crujido corto    | Desmoronamiento       |
| Mummy        | Gemido nasal grave, vibrato lento | Jadeo + golpe          | Queja ahogada    | Caída de vendas       |
| Frankenstein | Respiración pesada + gruñido      | Rugido corto           | Gruñido de dolor | Golpe sordo           |
| Golem        | Rumor de piedra + sub-bajo        | Impacto grave          | Fractura         | Derrumbe              |
| Demon        | Growl modulado en anillo          | Grito agudo            | Siseo            | Explosión grave       |
| Scarecrow    | Crujido de paja                   | Golpe de tela/madera   | Chasquido        | Deshilachado          |
| Ghost        | Suspiro con aire                  | Lamento corto          | Eco tembloroso   | Disipación            |
| Witch        | Risa entrecortada                 | Chillido               | Jadeo            | Risa que se apaga     |
| Vampire      | Siseo agudo                       | Rugido                 | Gruñido          | Polvo                 |
| Pumpkin King | Rugido profundo + crepitar        | Bramido                | Gruñido          | Explosión de calabaza |

Cada receta usa formantes distintos (frecuencias y Q) y una semilla fija.
Idle: solo los 6 más cercanos, con histéresis 25/28 m y un loop por monstruo.

En la cripta, cada momia en estado `chase` emite `monster_mummy_attack` al
entrar en persecución y luego un loop `monster_mummy_idle` posicional mientras
siga persiguiendo a ≤ 24 m. Al volver a `patrol`/`cooldown`, o al terminar la
ronda, el loop se corta con fade. Los coches aparcados no emiten motor: los
loops remotos solo se crean para coches con `driverId`, y en carrera solo
durante `phase === 'playing'`.
Ataque/daño/muerte: one-shot posicional, prioridad alta, cooldown 120 ms.

### 11.7 Vehículos

- **Motor local**: loop de 2 s generado con armónicos de 40–60 Hz + ruido
  filtrado. `rate = 0.65 + (speed / maxSpeed) * 1.75`.
  `gain = 0.04 + throttle * 0.08 + min(speed / maxSpeed, 1) * 0.06`.
  Suavizado `setTargetAtTime(..., 0.08)`.
- **Derrape**: loop de ruido bandpass 1,8–3,2 kHz con LFO; activo con
  `speed > 6` y (`|steering| > 0.55` o freno de mano); ganancia por
  deslizamiento.
- **Impactos**: `onImpact(impactSpeed, cause)`; `< 8` ligero, `≥ 8` fuerte,
  `rollover` específico; cooldown 150 ms.
- **Explosión**: `car_explosion` + parada del motor con fade 250 ms.
- **Coches remotos**: los 2 más cercanos, motor al 30 %, sin derrape, ≤ 25 m.
- La telemetría se toma por frame del `VehiclePhysics` local, no del snapshot
  de red, para que el pitch no escalone a 10 Hz.

### 11.8 Zonas de ambiente

| Zona         | Centro / condición     | Radio | Loop                  | Eventos                |
| ------------ | ---------------------- | ----- | --------------------- | ---------------------- |
| `centro`     | `(0, 0)` y fallback    | 24 m  | `ambience_centro`     | grillos, búho          |
| `bosque`     | `(-33, -33)`           | 30 m  | `ambience_bosque`     | búho, crujido          |
| `castillo`   | `(33, -33)`            | 30 m  | `ambience_castillo`   | trueno, goteo          |
| `calabazar`  | `(-33, 33)`            | 30 m  | `ambience_calabazar`  | crujido, grillos       |
| `cementerio` | `(33, 33)`             | 30 m  | `ambience_cementerio` | búho, viento           |
| `cripta`     | `sceneState.inCrypt`   | —     | `ambience_crypt`      | goteo                  |
| `carrera`    | `inRace` o `inRoadmap` | —     | `ambience_race`       | viento                 |
| `waves`      | `inWaves`              | —     | `ambience_waves`      | crujido, trueno lejano |

Prioridad: escena explícita (`crypt`, `race`, `waves`) > zona más cercana >
`centro`. Crossfade 1,5 s. Solo un loop activo (máximo dos durante el fade).
Durante `playing` en `waves`, multiplicar la ganancia del loop por 1,15; en
`intermission`/`countdown`, por 0,85.

### 11.8.1 Música de Halloween

`music_halloween` es una composición procedural original de 8 s en La menor,
a 120 BPM y compás de 4/4 (16 pulsos):

- melodía de **theremin** (seno con scoop de afinación, vibrato de 5,6 Hz y
  dos ecos manuales) que usa la menor armónica, el tritono `D#` y un descenso
  cromático `A-G#-G-F#-F-E` para sonar inequívocamente tétrica;
- bajo caminante y staccato en `Am`, `Dm`, `E7` y `Am`;
- acordes de órgano con trémolo (`Am`, `Dm`, `E7`, `Am`) y una capa de sierra
  desafinada muy baja;
- drone grave `A2` con batido lento, campanas de tritono y un lamento final
  que cae de `A4` a `G#4`.

El loop se genera con `seamlessLoop` (crossfade de 0,5 s) y un pulso de
entrada para que el crossfade no se coma el primer ataque. Vive en el bus
`music`. Se arranca tras el primer gesto y **no se detiene al cambiar de
escena**: `audio.stopAll(140, 'music')` conserva las voces cuyo `sourceId` es
`music`. Al no caber en el presupuesto, los loops de ambiente bajaron de 8 s a
6 s. La música tiene slider propio (por defecto 0,45) además del volumen
general, así que se puede bajar o silenciar sin tocar el ambiente ni los
efectos.

### 11.9 Mapeo de eventos

| Fuente             | Evento                                                                 | Sonido                                                                           |
| ------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `minigame5.events` | `monster-attack`                                                       | `monster_{kind}_attack`                                                          |
| `minigame5.events` | `monster-hit`                                                          | `hit_flesh`/`hit_bone`/`hit_stone` según tipo + `monster_{kind}_hurt` (cooldown) |
| `minigame5.events` | `monster-died`                                                         | `monster_{kind}_death`                                                           |
| `minigame5.events` | `acid-thrown` / `acid-impact`                                          | `acid_throw` / `acid_impact` + `acid_sizzle`                                     |
| `minigame5.events` | `grenade-exploded`                                                     | `explosion`                                                                      |
| `minigame5.events` | `player-hurt` / `player-downed` / `player-revived`                     | `player_hurt_*` / `player_downed` / `player_revive`                              |
| `minigame5.events` | `drop-picked`                                                          | `pickup_*` según `dropKind`                                                      |
| `minigame5.events` | `car-destroyed`                                                        | `car_explosion`                                                                  |
| `minigame5.events` | `wave-started` / `wave-cleared` / `victory` / `defeat`                 | `wave_start` / `wave_clear` / `mission_win` / `mission_lose`                     |
| `minigame2.events` | `skull-picked` / `skull-dropped` / `skull-deposited`                   | `pickup_weapon` / `hit_bone` / `ui_confirm`                                      |
| `minigame2.events` | `round-start` / `round-won` / `round-lost` / `player-died`             | `wave_start` / `mission_win` / `mission_lose` / `player_downed`                  |
| `race.lastEvent`   | `missile-fired`, `missile-hit`, `mine-placed`, `mine-hit`, `ray-fired` | `missile_fire`, `missile_hit`, `mine_drop`, `mine_explode`, `ray_fire`           |
| `race.lastEvent`   | `item-picked`, `item-used`, `gate-passed`, `lap-completed`             | `item_pick`, `item_use`, `gate_pass`, `lap`                                      |
| `race.lastEvent`   | `player-destroyed`, `player-respawned`, `race-start`                   | `race_destroyed`, `race_respawn`, `wave_start`                                   |
| `race.lastEvent`   | `race-ended` (`playerId` = ganador)                                    | `mission_win` si ganamos; `mission_lose` si no                                   |
| `missions`         | 25.º gato capturado                                                    | `mission_win`                                                                    |
| `cars.lastEvent`   | `entered`, `exited`, `damaged`, `destroyed`, `respawned`               | `car_enter`, `car_exit`, `car_impact_*`, `car_explosion`, `car_enter`            |
| Local              | disparo/recarga                                                        | `shot_*`, `dry_fire`, `reload_*`                                                 |
| Local              | botones de ajustes                                                     | `ui_click`, `ui_confirm`, `ui_error`                                             |

Los eventos de `minigame5` ya llevan `seq`; `minigame2` guarda un array; a
`race` y `cars` se les añade `eventSeq` para consumir `lastEvent` sin repetir.
Reglas de los cursores:

- `lastMg5Seq` puede sobrevivir a `reset()` porque `eventSeq` de `minigame5`
  es monotónico y no se reinicia.
- `lastMg2` se reinicia cuando el array de eventos se vacía (cambio de escena
  o reset de la ronda).
- `eventSeq` de `race`/`cars` es monotónico de sesión: no se reinicia en
  `reset()`, solo se reinicia al recargar la página.
- Al cambiar de escena se descartan los one-shots posicionales pendientes y se
  detienen los loops de la escena anterior.

### 11.10 Presupuestos y prioridades

| Recurso                   | Presupuesto                                      |
| ------------------------- | ------------------------------------------------ |
| Descarga de audio         | 0 bytes                                          |
| Código incremental        | ≤ 15 KB gzip (límite duro 25 KB)                 |
| Buffers decodificados     | ≤ 12 MB (objetivo ≤ 9 MB)                        |
| One-shots simultáneos     | 24                                               |
| Loops simultáneos         | 12 (2 ambiente, 2 coche, 6 monstruos, 2 reserva) |
| Actualización de listener | 15 Hz, ≤ 0,1 ms                                  |
| Generación por frame      | ≤ 4 ms, nunca > 8 ms                             |
| Latencia de disparo       | ≤ 30 ms                                          |
| Distancia máxima          | 45 m mapa, 22 m cripta, 25 m monstruos/coches    |

Prioridades:

- **3 (alta)**: daño al jugador, ataque de monstruo cercano, explosión,
  disparo local, motor local.
- **2 (media)**: pasos locales, muerte de monstruo, impactos de coche, UI.
- **1 (baja)**: pasos remotos, idle de monstruos, ambiente.
- **0 (mínima)**: eventos ambientales esporádicos.

Al superar el límite se descarta la prioridad más baja; a igualdad, la fuente
más lejana.

### 11.11 Ajustes y persistencia

Clave `rw:audio:v1`:

```json
{
  "version": 1,
  "master": 0.8,
  "ambience": 0.55,
  "music": 0.45,
  "sfx": 0.85,
  "ui": 0.6,
  "muted": false
}
```

- Lectura tolerante: valores fuera de rango se recortan a 0–1; JSON corrupto
  vuelve a los valores por defecto y no rompe el arranque.
- Escritura con debounce de 150 ms para no escribir en cada movimiento del
  slider.
- Evento `storage` para sincronizar pestañas, igual que `playerProfile`.
- `muted` multiplica todos los buses por 0; no destruye el contexto ni los
  buffers.

### 11.12 API y contrato interno

```ts
export type BusId = "sfx" | "ambience" | "music" | "voice" | "ui";
export type SoundPriority = 0 | 1 | 2 | 3;

export type PlayOptions = {
  position?: { x: number; y: number; z: number };
  volume?: number; // multiplicador 0–1
  rate?: number; // 0.5–2
  sourceId?: string; // para cooldown por fuente
  priority?: SoundPriority;
  bus?: BusId; // override de la receta
};

export type SoundHandle = { stop(fadeMs?: number): void };
export type LoopHandle = SoundHandle & {
  setGain(gain: number, smoothMs?: number): void;
  setPan(pan: number, smoothMs?: number): void;
  setRate(rate: number, smoothMs?: number): void;
  setFilter(freq: number, q?: number, smoothMs?: number): void;
};
```

`audio.play()` devuelve `null` si el motor no está listo, el sonido está en
cooldown, se superó el límite o el volumen es 0. Nunca lanza por falta de
soporte.

### 11.13 Degradación y accesibilidad

- Sin `AudioContext` o sin `resume()` exitoso: el motor queda en modo no-op;
  `play()`/`loop()` devuelven `null`; el resto del juego no cambia.
- No se crea ningún `AudioContext` hasta que el usuario interactúa.
- El botón de mute está siempre accesible en ajustes; el estado se recuerda.
- No se usan sonidos por encima de -1 dBFS; el compresor evita sustos.
- Los sonidos de UI son cortos y de volumen bajo; no hay alertas agresivas.
- No se reproduce nada con la pestaña oculta.
- Los IDs y recetas están tipados: añadir un sonido sin entrada en el catálogo
  falla en `svelte-check`.

## 12. Progreso

| Fecha      | Estado       | Nota                                                                                                                                                                                             |
| ---------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-11-03 | borrador     | Spec creado. Sin cambios de código ni assets todavía.                                                                                                                                            |
| 2026-11-03 | implementado | 122 recetas, motor, ajustes, componentes e integraciones. `audio:check`, `check`, `lint` y `build` en verde.                                                                                     |
| 2026-11-04 | implementado | Captura de gatos (`cat_meow`/`cat_purr`), gruñidos de momias al perseguir en la cripta, sonido al lanzar rollos (`paper_throw`) y motor remoto solo para coches ocupados. 125 recetas, 11,87 MB. |
| 2026-11-11 | implementado | Jingles de victoria/derrota precargados y reintento de one-shots largos; cuenta atrás también en Parkour y Deathmatch; derrota/empate en Parkour; desbloqueo de audio reintentable. |

## 13. Changelog

- 2026-11-03 — Creación del spec con decisión Web Audio nativa frente a
  Tone.js, catálogo procedural, plan por fases y presupuestos de rendimiento.
- 2026-11-03 — Implementación completa. Medición de `audio:check`:
  122 sonidos, 11,70 MB de PCM a 22 050 Hz mono, 703 ms de render total.
  - El ambiente se deja mono (sin `DelayNode` de pseudo-estéreo): el paneo por
    posición y el crossfade ya dan suficiente anchura sin añadir nodos.
  - Los loops idle de monstruos se ajustaron a 1,9–2,2 s para respetar el
    presupuesto duro de 12 MB sin bajar la frecuencia de muestreo.
  - Los pasos remotos usan solo los 4 jugadores más cercanos a ≤ 18 m, como
    proponía la pregunta abierta.
  - Ajustes en `rw:audio:v1`, separados de `rw:profile:v1`.
- 2026-11-04 — Ampliación: maullido y ronroneo al capturar un gato, gruñido
  de persecución de las momias de la cripta, whoosh al lanzar un rollo de
  papel y corrección del motor de coches aparcados.
- 2026-11-04 — Victoria de misión (`victory` al completar los 25 gatos, al
  ganar la ronda de la cripta y al ganar Barn Siege) y cuenta atrás 3-2-1
  (`countdown_tick`/`countdown_go`) en carrera, cripta y Barn Siege.
- 2026-11-04 — Música de Halloween procedural (`music_halloween`), bus
  `music`, slider propio en ajustes y continuidad entre escenas. Los loops de
  ambiente pasan a 6 s para respetar el presupuesto. `audio:check`: 128
  sonidos, 11,25 MB, 874 ms de render.
- 2026-11-04 — Jingle propio de resultado de misión: `mission_win` (acorde
  menor que resuelve a mayor, campanas y timbal) y `mission_lose` (lamento
  cromático descendente y campana grave). Se usan en gatos, cripta, Barn Siege
  y carrera; en carrera la victoria depende del `winnerId` comparado con el
  jugador local. `audio:check`: 128 sonidos, 11,37 MB, 876 ms de render.
- 2026-11-04 — La música se recompone para sonar más de Halloween: 120 BPM,
  theremin, menor armónica, tritono, descenso cromático, bajo staccato y
  órgano con trémolo. `audio:check`: 128 sonidos, 11,25 MB, 956–1275 ms.
- 2026-11-11 — Corrección de los avisos de resultado y de la cuenta atrás.
  - `mission_win`/`mission_lose` duran > 0,8 s y no estaban en `PREWARM`: el
    primer `play()` no podía renderizarlos en el acto y la partida terminaba
    antes de que el PCM estuviera listo, así que el jingle no sonaba. Ahora
    encabezan la cola de precarga al cargar el mundo y al desbloquear el audio.
  - El motor encola los one-shots largos cuyo PCM aún se está generando y los
    reproduce en cuanto está listo (máx. 4 s), en lugar de descartarlos. Los
    `stopAll()` de cambio de escena limpian esa cola.
  - La cuenta atrás incluye Parkour (`countdownEndsAt`) además de carrera,
    cripta, Barn Siege y Deathmatch.
  - Parkour reproduce `mission_lose` al perder `match-end` y `ui_confirm` si
    no hay ganador; antes solo sonaba la victoria local.
  - Si el primer gesto no basta para desbloquear el `AudioContext`, se vuelven
    a registrar los listeners en vez de quedarse sin audio toda la sesión.
  - Verificado en Chromium sobre el singleton real: 3 × `countdown_tick` +
    `countdown_go` en Barn Siege y Parkour, `mission_lose` al perder Parkour y
    reproducción diferida de un sonido largo sin precargar. `audio:check`:
    131 sonidos, 11,57 MB, 1222 ms; `check` sin errores.
