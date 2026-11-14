---
id: SPEC-023
titulo: "Minijuego 4: Asedio al Granero — oleadas de monstruos cooperativo en la aldea de Barn Siege"
estado: en-progreso
prioridad: alta
creado: 2026-11-03
actualizado: 2026-11-13
responsable: opencode
etiquetas:
  [
    minijuego,
    multijugador,
    websocket,
    rooms,
    svelte,
    threlte,
    rapier,
    monstruos,
    oleadas,
    asedio,
    granero,
    barnsiege,
    aldea,
    calabazar,
    armas,
    granadas,
    acido,
    rocas,
    lava,
    empuje,
    servidor-autoritativo,
  ]
depende_de: [SPEC-005, SPEC-009, SPEC-011, SPEC-012, SPEC-014, SPEC-018, SPEC-019, SPEC-020]
bloquea: []
estimacion: "46h"
---

# SPEC-023 — Minijuego 4: Asedio al Granero (Barn Siege)

## 1. Contexto

El proyecto ya tiene:

- El mapa exterior `map.glb` con físicas selectivas (`SPEC-009` y `SPEC-012`).
  El área 3 (`area3`, el **calabazar embrujado**, prefijo `PFM_*`) sigue
  existiendo con granja, **granero** (`PFM_Barn`), silo, casa, calabaza
  gigante, campos, valla y puerta sur, pero **ya no es la arena** del
  minijuego: solo conserva el checkpoint físico “Barn Siege”.
- La arena se juega en **`frontend/static/barnsiege.glb`** (prefijo `BS_*`),
  una aldea amurallada de 56 nodos y 3 animaciones. Al entrar en
  `minigame-5`, `sceneState.active` pasa a `barnsiege` y **solo se renderiza
  ese mapa** (`SPEC-021`), liberando el `map.glb` global.
- Diez monstruos con rig y animaciones completas en `frontend/static/*.glb`
  (`Demon`, `Frankenstein`, `Ghost`, `Golem`, `Mummy`, `PumpkinKing`,
  `Scarecrow_Feet`, `Skeleton`, `Vampire`, `Witch`) y el rig del jugador
  (`Hero.glb`). **El usuario ha añadido nuevas animaciones** a todos ellos
  (`*_aim`, `*_walk_aim`, `*_run_aim`, `*_crouch_aim`, `*_injured`, `*_heal`,
  además de `*_carry` y `*_throw`), exportadas en `blender/exports/*.glb`
  (2026-11-03). Las copias de `frontend/static/` están **desactualizadas** y
  hay que reemplazarlas.
- **Modelos de armas y kits ya presentes** en `frontend/static/`: las cuatro
  armas básicas en `weapons/` (`pistol.glb`, `shotgun.glb`, `mp5.glb`,
  `sniper_rifle.glb`) y los kits/consumibles en `props/` (`ammo_kit.glb`,
  `med_kit.glb`, `grenade.glb`). No hay que modelar ni copiar nada: se usan
  tal cual para el arma en mano y para los drops.
- El sistema de skins (`cosmetics/skins.ts`) reutiliza esos mismos rigs: cada
  monstruo es la skin de un jugador (`witch`, `demon`, …). Los monstruos del
  minijuego se podrán renderizar con el mismo `SkinCharacter`.
- La arquitectura multijugador actual son **rooms de RUN.world**
  (`frontend/src/server/rooms/*` + `engines/*`), no el backend Elysia
  (deprecado, ver `SPEC-020` y `SPEC-022`). `minigame-2` → room `crypt`,
  `minigame-3` → room `race`, `minigame-4` → room `roadmap`. **`minigame-4`
  está ocupado** (Roadmap, la pista secundaria del Grand Prix), por lo que este
  minijuego usa **`minigame-5`** con una room nueva `waves` (no singleton,
  `maxPlayers: 12`).
- Patrones reutilizables: room + engine autoritativo de `minigame-2`
  (`Crypt`/`CryptRoom`) y de la carrera (`Race`/`RaceRoom`); entrada por
  checkpoint físico + `E`; salida con `go-lobby` + teletransporte;
  interpolación de remotos a 10 Hz; físicas de vehículo reutilizable
  (`VehiclePhysics`, `SPEC-014`/`SPEC-018`).

### Geometría real de la arena (medida sobre `barnsiege.glb`)

`barnsiege.glb` es una aldea amurallada centrada en `(0, 0)` con el suelo a
`y = 0.5`. La arena jugable es **todo el recinto cerrado por la valla**
(radio ≈ 56.5 m, área ≈ 9772 m²): incluye la plaza, los miradores, las calles
y los claros entre las casas. Antes era un anillo interior de radio ≈ 37.5 m;
los jugadores podían salir de él y quedarse fuera del alcance de los
monstruos. Ahora el servidor recorta cualquier reporte al polígono completo,
así que salir de la zona ya no concede inmunidad. El polígono de contención
tiene 16 vértices:

```
( 56.50,   0.00)  ( 52.00,  22.00)  ( 40.00,  40.00)  ( 22.00,  52.00)
(  0.00,  56.50)  (-22.00,  52.00)  (-40.00,  40.00)  (-52.00,  22.00)
(-56.50,   0.00)  (-52.00, -22.00)  (-40.00, -40.00)  (-22.00, -52.00)
(  0.00, -56.50)  ( 22.00, -52.00)  ( 40.00, -40.00)  ( 52.00, -22.00)
```

El suelo (`BS_Ground`, 136 × 136 m) cubre todo el polígono. Obstáculos
principales y su BBox en XZ:

| Elemento | XZ (min → max) | Física |
| --- | --- | --- |
| `BS_Barn` (granero) | `(-8.05, -22.87)` → `(8.05, -8.13)` | `paredes` |
| `BS_Silo` | `(-19.10, -14.15)` → `(-13.90, -8.85)` | `paredes` |
| `BS_FarmhouseRuin` | `(11.84, -13.31)` → `(22.13, -6.07)` | `paredes` |
| `BS_GiantPumpkin` | `(15.08, 4.25)` → `(21.96, 10.75)` | `obstaculos` |
| `BS_LakeShore` | `(6.75, -31.17)` → `(24.57, -15.26)` | `paredes` |
| `BS_Well` (pozo) | `(-10.30, 11.22)` → `(-6.70, 14.78)` | `muebles` |
| `BS_Cart` (carro) | `(8.50, 2.25)` → `(13.91, 4.75)` | `obstaculos` |
| `BS_Fence` | contorno del pueblo | `paredes` |

**Checkpoint del minijuego** (solo en el mapa global): junto al granero de
`map.glb`, delante de la puerta sur del granero, en **`(-41.60, 0.40, 32.60)`**.
Radio 2. Nombre visible: **“Barn Siege”**. Color `#f97316`. Al entrar se
cambia la escena a `barnsiege`; al salir se vuelve a ese mismo punto.

**Spawns de jugadores** (12): rejilla 4 × 3 en la plaza central de
`barnsiege`, `x ∈ {-6, -2, 2, 6}`, `z ∈ {-6, -2, 2}`, `y = 0.55`.

**Coche del minijuego**: `coche_calabaza` aparcado al este de la plaza en
**`(6.5, 1.5, -1.5)`**, mirando al oeste (`yaw = π`).

**Puntos de aparición de monstruos** (30): los seis portales decorativos del
anillo interior (`gate (0, 32.0)`, `barn (-16.0, -31.0)`,
`farmhouse (29.0, 17.0)`, `fields (-29.0, 17.0)`,
`giant-pumpkin (29.0, -16.0)`, `silo (-29.0, -16.0)`) más 24 claros, calles y
esquinas repartidos por todo el recinto (`MONSTER_SPAWNS` en
`wavesConfig.ts`). El servidor elige en cada spawn el punto más lejano a los
jugadores vivos, con 14 m de separación mínima, y el cliente dibuja allí el
portal de aparición. Así los monstruos pueden salir por todo el suelo
transitable y no solo por el anillo central.

> ⚠️ **Todas** las constantes de arena (polígono, spawns, coche)
> viven en `frontend/src/lib/state/wavesConfig.ts`, marcadas como
> *dependientes del mapa*; el servidor las importa directamente y valida
> contención con el polígono de 16 vértices. `bun run waves:check` las
> contrasta contra `barnsiege.glb`.
>
> ⚠️ **Runtime**: el motor que corre la partida es
> **`backend/src/server/engines/waves.ts`** (Bun/Elysia) con su copia de
> `backend/src/lib/state/wavesConfig.ts`. `frontend/src/server/` es la copia
> de referencia que usan los scripts `verify-*`; un cambio de gameplay debe
> aplicarse en el backend **y** replicarse en la referencia.

**Físicas y animaciones del mapa**: `frontend/world/barnsiege.physics.json`
usa el modo `chunked` (celdas XZ de 16 m): la geometría visual de los nodos
con física se reparte en 68 trimeshes, 80 644 triángulos, para que el
controlador de personaje solo consulte la celda donde está el jugador. Antes
se generaban 40 colisionadores en modo `inject`; sus buffers duplicaban
vértices y el controlador tardaba 200–1000 ms por frame en la plaza. Tienen
física el suelo, la muralla, el granero, el silo, la ruina de la casa, el
molino, la calabaza gigante, el carro, los portales, las tiendas y el atrezo
sólido. Se excluyen el zepelín, la pancarta, los espantapájaros, el agua y las
plantas del lago, los campos, los caminos y los carteles. Las animaciones del
GLB (`BS_WindmillSpin`, `BS_ZeppelinDrift`, `BS_BannerWave`) se reproducen en
bucle; los dos espantapájaros no traen clip, así que `world-inject.mjs`
genera un balanceo idle procedural (`animations.idle` con amplitud 0.045 rad).


### Assets nuevos (a copiar de `blender/exports/` a `frontend/static/`)

| GLB | Tris | Clips nuevos (además de los existentes) | Tamaño |
| --- | --- | --- | --- |
| `Hero.glb` | 11 348 | `HR_carry`, `HR_throw`, `HR_aim`, `HR_walk_aim`, `HR_run_aim`, `HR_crouch_aim`, `HR_injured`, `HR_heal` | 889 456 |
| `Demon.glb` | 1 200 | `DM_carry/throw/aim/walk_aim/run_aim/crouch_aim/injured/heal` | 321 360 |
| `Frankenstein.glb` | 1 008 | `FR_…` | 293 148 |
| `Ghost.glb` | 720 | `GH_…` (sin `GH_sit`, sin `GH_shoot`) | 201 332 |
| `Golem.glb` | 1 500 | `GO_…` | 352 640 |
| `Mummy.glb` | 1 992 | `MU_…` | 393 136 |
| `PumpkinKing.glb` | 1 032 | `PK_…` (+ `PK_shoot`) | 305 400 |
| `Scarecrow_Feet.glb` | 2 652 | `SF_…` | 471 520 |
| `Skeleton.glb` | 1 272 | `SK_…` | 315 972 |
| `Vampire.glb` | 936 | `VA_…` | 285 952 |
| `Witch.glb` | 854 | `WH_…` (+ `WH_shoot`) | 327 808 |

Duraciones de referencia (Hero): `HR_walk_aim` 1.000 s · `HR_run_aim` 0.667 s ·
`HR_crouch_aim` 2.500 s · `HR_injured` 3.000 s · `HR_heal` 3.000 s ·
`HR_aim` 2.500 s · `HR_throw` 1.500 s. Los `*_injured` y `*_heal` loopan 3 s;
los `*_aim`/`*_walk_aim`/`*_run_aim`/`*_crouch_aim` son clips de locomoción
(loop).

`Mummy copy.glb` y `Scarecrow_Feet copy.glb` son duplicados sin referencias
en el código (solo aparecen en la salida del build porque están en `static/`);
**no se borran en este spec**, quedan como limpieza pendiente con confirmación
del usuario.

### Modelos de armas, kits y granadas (ya en `frontend/static/`)

Estos GLB ya existen y **no se copian de `blender/exports/`**. Se usan como
modelo visible del arma en la mano y de los drops; el servidor sigue usando
las estadísticas de `WEAPON_DEFINITIONS` y no conoce geometría.

| Uso en juego | GLB | Prefijo de nodos | Bytes | Punta de cañón |
| --- | --- | --- | --- | --- |
| Rusty Pistol (`pistol`) | `weapons/pistol.glb` | `WPN_Pistol_*` | 25 592 | `WPN_Pistol_Muzzle.002` |
| Shotgun (`shotgun`) | `weapons/shotgun.glb` | `WPN_Shotgun_*` | 31 396 | extremo de `WPN_Shotgun_Barrel.001` |
| SMG (`smg`) | `weapons/mp5.glb` | `WPN_MP5_*` | 42 608 | `WPN_MP5_Muzzle.001` |
| Hunting Rifle (`rifle`) | `weapons/sniper_rifle.glb` | `WPN_Sniper_*` | 65 928 | extremo de `WPN_Sniper_Barrel.001` |
| Granada (`grenade`) | `props/grenade.glb` | `WPN_Gren_*` | 29 728 | — |
| Pack de munición (`ammo`) | `props/ammo_kit.glb` | `WPN_Ammo_*` | 29 096 | — |
| Botiquín (`medkit`) | `props/med_kit.glb` | `WPN_Med_*` | 23 840 | — |

Solo se cargan estas cuatro armas básicas y los tres props del inventario; las
demás variantes de `weapons/` no entran en este minijuego.

Reglas de integración:

- `weaponModels.ts` expone `WEAPON_MODEL_BY_ID: Record<Mg5WeaponId, string>` con
  las rutas de arriba y una caché compartida. `buildHeldWeapon()` sigue
  devolviendo un `Group`
  síncrono con la primitiva actual como **fallback** y, cuando el GLB resuelve
  (`useGltf`/`GLTFLoader` con caché compartida), sustituye los hijos por un
  clon del modelo. El clon se reutiliza para el jugador local y los remotos.
- El grupo conserva el nombre `HeldWeapon_<id>` y un `Object3D` llamado
  `BarrelTip` en la boca del cañón (nodo `*_Muzzle` cuando existe; si no, el
  extremo del `*_Barrel` en el espacio local). `WaveControls` y
  `DeathmatchControls` ya leen ese marcador para el origen de la trazadora.
- Alineación: cañón hacia **+Z** local mediante una rotación de corrección
  medida sobre la BBox, escala uniforme por arma (pistola ≈ 0.35–0.45 m de
  largo visible; escopeta/rifle ≈ 0.85–1.0 m; SMG ≈ 0.6 m) y empuñadura
  apoyada en el hueso `handR`. Sin cambios en el rig del personaje.
- `WaveDrop.svelte` sustituye las primitivas por `props/grenade.glb`,
  `props/ammo_kit.glb`, `props/med_kit.glb` y el GLB del arma correspondiente;
  conserva el halo en el suelo, la flotación y el giro, y escala cada modelo a
  ~0.35–0.55 m para que se lea desde la cámara en tercera persona.
- Los modelos son **solo presentación**: no crean colliders, no alteran el
  pickup (sigue siendo proximidad de 1.6 m en el servidor) ni el daño. Si un
  GLB falla al cargar, se queda la primitiva y el juego sigue funcionando.
- Precarga: las cuatro armas y los tres props se suman a `WAVES_ASSETS` (o se
  cargan durante la cuenta atrás de 30 s) para que el primer drop no aparezca
  como una caja.
- Los tres props están registrados en `frontend/world/assets.json`
  (`ammo-kit`, `med-kit`, `grenade`, `pipeline: "static"`) y comprimidos con
  Draco (`assets:check` en verde). Al cargarlos con `useGltf` hay que pasar
  `dracoLoader: asset('draco/')`, igual que el resto de armas y vehículos.

## 2. Objetivo

Convertir el minijuego en una **partida cooperativa de supervivencia por
oleadas** para **hasta 12 jugadores**: al entrar por el checkpoint junto al
granero (mapa global), todos aparecen en la plaza de la aldea de
`barnsiege.glb`; tras una cuenta atrás, llegan
**8 oleadas** de monstruos (esqueletos, momias, frankesteins, gólems, demonios,
espantapájaros, fantasmas, brujas, vampiros y el Rey Calabaza) que atacan a
**melé**, **arrojan ácido** (proyectil en arco + charco) o **lanzan rocas de
lava** (el Golem: proyectil balístico que daña y lanza al jugador por los aires
si acierta). El equipo gana si
sobrevive a la oleada 8; pierde si todos caen. Hay **armas recogibles de los
monstruos** (escopeta, subfusil, rifle, granadas, munición, botiquines) con
modelos GLB reales de `frontend/static/weapons/` y `frontend/static/props/`,
un arma básica inicial, un **coche calabaza** aparcable para atropellar
monstruos, y **todo el estado es autoritativo del servidor** sincronizado por
WebSocket (rooms de RUN.world).

## 3. Alcance

**Incluye**

- Lobby **`minigame-5`** (“Barn Siege”) y room de RUN.world **`waves`**
  (`maxPlayers: 12`, `allowReconnect: true`, `idleTimeout: 120`), no singleton.
- Checkpoint físico delante de la puerta sur del granero (`-41.60, 0.40, 32.60`,
  radio 2) y
  entrada/salida con `E` como en los demás minijuegos; al salir se teletransporta
  de vuelta al granero.
- Máquina de estados de sala: `idle → countdown → playing → intermission →
  playing … → won | lost → idle`. Cuenta atrás de 30 s al primer jugador
  (recortada a 10 s al llegar a 12/12); `intermission` de 12 s entre oleadas;
  resultados 15 s y vuelta automática a `global` con `go-lobby`.
- **8 oleadas** sin límite de tiempo; la oleada termina al no quedar monstruos;
  derrota si todos los jugadores caen durante `playing`.
- **10 tipos de monstruo** con estadísticas y comportamiento propios (melé,
  ácido o roca a distancia), IA en el servidor (perseguir → atacar → enfriar),
  separación entre monstruos, contención en el polígono del área y bloqueo
  deslizante contra los edificios (no atraviesan granero/silo/farmhouse).
- **Armas**: pistola oxidada inicial (reserva infinita, recarga con R) y drops de monstruos:
  escopeta, subfusil, rifle de caza, granadas, packs de munición universal y
  botiquines. Pickup automático por proximidad. Las armas recogidas se guardan en
  un **inventario de 4 ranuras fijas** (1 pistola · 2 escopeta · 3 subfusil ·
  4 rifle); las teclas `1`–`4` (o clic/toque en la barra del HUD) equipan la
  ranura correspondiente sin perder las demás. El arma en mano y los drops usan
  los GLB de `frontend/static/weapons/` (`pistol`, `shotgun`, `mp5`,
  `sniper_rifle`) y de `frontend/static/props/` (`ammo_kit`, `med_kit`,
  `grenade`).
- **Granadas**: consumible recogible, se lanzan con `G` (o botón táctil),
  espoleta 1.5 s (o al tocar el suelo), 75 de daño, radio 4.5 m.
- **Ácido**: proyectil balístico simulado en el servidor; al impactar hace
  daño directo (radio 1.2 m) y deja un **charco** de 2.2 m de radio que daña
  8 HP/s durante 6 s (máximo 10 charcos; el más viejo se sustituye). El
  lanzamiento anticipa la velocidad reportada del jugador, y el proyectil
  barre su cápsula en vuelo: correr en línea recta ya no lo atraviesa.
- **Rocas de lava (Golem)**: el Golem ya no pega melé. Lanza una roca en arco
  hacia la posición anticipada del objetivo (19 m de alcance, 32 de daño,
  3.2 s de recarga); para **esquivarla** hay que cambiar de dirección después
  del lanzamiento. Al impactar daña en un radio de 2 m y, si alcanza a un
  jugador, el servidor emite `rock-hit` y el cliente aplica un **empuje**
  (10 m/s horizontal + 6.2 m/s vertical, amortiguado) que lo lanza por los
  aires. La roca se dibuja con un **shader procedural de lava** (vetas
  incandescentes, fresnel anaranjado, halo y luz puntual).
- **Coche calabaza** aparcable: entrable con `E` (radio 2.5 m), HP 600;
  atropellar hace 55 de daño por monstruo (enfriamiento 0.7 s por monstruo);
  el melé y el ácido de los monstruos dañan el coche; a 0 HP explota, queda
  como chatarra y el conductor sale con 25 de daño. No reaparece en la partida.
- **Revivir entre oleadas**: al limpiar la oleada, los caídos vuelven con
  50 HP. En mitad de la oleada no se revive (nadie puede entrar a mitad de
  partida: `WAVES_IN_PROGRESS`).
- **Recompensa al ganar**: limpiar la oleada 8 registra `barn-8-waves` en
  `rw:missions:v1` y desbloquea la skin `pumpkin-king` (`PumpkinKing.glb`).
  La derrota no da la skin y la recompensa es permanente e idempotente.
- HUD propio (oleada, monstruos restantes, salud, arma y munición, granadas,
  puntuación de equipo, barra de vida del coche al conducir) y overlays
  (espera/cuenta atrás, intermission, victoria/derrota con estadísticas).
- Sincronización: posiciones a 10 Hz (jugadores, monstruos, proyectiles,
  granadas, coche), snapshot completo cuando cambia algo o cada 1 s, eventos
  (`wave-started`, `monster-died`, …). Interpolación en el cliente.
- **Assets**: copia de los 11 GLB actualizados de `blender/exports/` a
  `frontend/static/`; `HERO_ANIMATIONS` y `skinAnimations` ampliados con los
  clips nuevos (el gunplay usa `HR_walk_aim` / `HR_run_aim` / `HR_crouch_aim` /
  `HR_aim`; `HR_injured` al recibir cualquier golpe (el daño continuo avisa
  como máximo cada 700 ms); `HR_heal` al curarse e
  intermission; `HR_throw` para brujas/vampiros/Rey Calabaza).
- Precarga de los 10 GLB de monstruo durante la cuenta atrás de 30 s (sin
  overlay dedicado: los ~3 MB cargan mientras esperas; la sala no depende de
  ellos hasta la oleada 1).
- `waves:check` (`frontend/scripts/verify-waves-arena.mjs`): valida que el
  polígono, los 30 puntos de aparición, el coche y los BBox de los edificios
  encajan en `barnsiege.glb` (nodos, animaciones y suelo incluidos), y que
  ningún spawn cae dentro de `BUILDING_BLOCKS` (inflado 0.5 m).
- `waves:terrain` (`frontend/scripts/verify-waves-terrain.mjs`): simula la IA
  de subida y comprueba que los monstruos llegan a la plataforma de los dos
  miradores desde el pie, el lado y detrás de la torre, que no se
  “teletransportan” desde el suelo y que la altura de la plataforma supera el
  alcance vertical de melé y de los charcos de ácido desde el suelo (el
  proyectil de ácido sí puede apuntar a la altura real del jugador).
- `waves:fire` (`frontend/scripts/verify-waves-fire.mjs`): simula el aliento
  del Demon y comprueba que sale de la boca, que la dirección va normalizada,
  que resta vida por ticks, que deja de dañar al expirar y que el cono no
  alcanza a un objetivo situado detrás.
- `waves:rock` (`frontend/scripts/verify-waves-rock.mjs`): simula la roca del
  Golem y comprueba que la definición es de tipo `rock`, que publica
  `mg5-positions.rocks`, que un jugador quieto recibe el daño completo y un
  `rock-hit` con empuje normalizado, que la roca estalla (`rock-impact`) y que
  un jugador que se aparta tras el lanzamiento no recibe daño.

**No incluye**

- Cambios de modelado en `barnsiege.glb`: la aldea se usa tal cual; las
  constantes de arena están centralizadas en `wavesConfig.ts`.
- Interior del granero: la partida ocurre **al aire libre**, en la plaza y el
  anillo interior de la aldea.
- Pathfinding/navmesh completo: los monstruos se mueven con separación y
  deslizamiento por contacto; las dos escaleras de los miradores se aproximan
  analíticamente con `MONSTER_CLIMBS` (rampa + plataforma), no con un navmesh.
  Otros obstáculos (granero, silo, ruina, lago, pozo, carro) siguen siendo
  volúmenes bloqueantes y pueden hacer que un monstruo se atasque; aceptable.
- Combate a través de alturas: el daño es 2.5D. Melé exige ≤ 1.6 m de
  diferencia vertical y la granada ≤ 2.5 m. El ácido resuelve la parábola
  contra la altura real del objetivo y el fuego del Demon es un cono 3D con
  6 m de alcance vertical, así que ambos alcanzan a un jugador en la rampa o
  en el mirador; los charcos siguen atados a la superficie donde impactan (un
  charco en el suelo no daña a quien está en la plataforma, ni al revés).
- Daño amigo (ni granadas ni ácido dañan a compañeros); el ácido y las
  granadas solo dañan monstruos (y las granadas tampoco dañan el coche).
- Revivir durante la oleada; revivir entre oleadas solo.
- Récords persistentes / leaderboard (la victoria muestra puntuación de la
  partida y vuelve al mapa; solo se persiste el desbloqueo de `pumpkin-king`).
- Audio (el proyecto no tiene sistema de sonido; se añadirá aparte si se pide).
- Tocar `backend/` (deprecado por `SPEC-020`); esta sala vive en
  `frontend/src/server/rooms/`.
- Borrar `Mummy copy.glb` / `Scarecrow_Feet copy.glb` (limpieza pendiente de
  confirmación).
- Cambiar el comportamiento de la cripta, la carrera, el roadmap ni los coches
  libres.

## 4. Requisitos

### Funcionales

| ID | Requisito | Prioridad |
| --- | --- | --- |
| RF-1 | Checkpoint “Barn Siege” en `(-41.60, 0.40, 32.60)`, delante de la puerta sur del granero, radio 2, `E` entra a la sala `waves` con `minigame-5`. | alta |
| RF-2 | Hasta 12 jugadores por partida; entrada rechazada con `WAVES_IN_PROGRESS` si la fase no es `idle`/`countdown` o no hay sitio (`WAVES_FULL`). | alta |
| RF-3 | `idle → countdown` al primer jugador (30 s; 10 s al llegar a 12/12); `countdown → playing` al vencer; movimiento bloqueado hasta `playing`. | alta |
| RF-4 | La partida consta de 8 oleadas definidas en la tabla de §11.2; no hay límite de tiempo; la oleada acaba al morir todos sus monstruos. | alta |
| RF-5 | Tras cada oleada, `intermission` de 12 s; los caídos reviven con 50 HP; luego empieza la siguiente oleada. | alta |
| RF-6 | Victoria al limpiar la oleada 8 (`won`); derrota cuando todos los jugadores están caídos en `playing` (`lost`). | alta |
| RF-7 | 10 tipos de monstruo con HP/velocidad/daño/tipo de ataque (melé, ácido, fuego o roca) según §11.3; el servidor decide posiciones, objetivos, ataques y muertes. | alta |
| RF-8 | Melé: alcance 1.8–2.4 m, enfriamiento 0.9–1.8 s, daño por tipo; el objetivo es el jugador vivo más cercano (o el coche, si conduce). El golpe exige además ≤ `MELEE_VERTICAL_REACH` (1.6 m) de diferencia vertical entre los pies del monstruo y los del jugador. | alta |
| RF-9 | Ácido (Witch/Vampire/PumpkinKing): proyectil balístico; daño directo en radio 1.2 m; charco de 2.2 m, 8 HP/s, 6 s; máx. 10 charcos. El proyectil resuelve la parábola contra la altura real del objetivo (`targetY`, acotada a `ARENA_FLOOR_Y + 6`), así que impacta en el suelo, en la rampa o en la plataforma de un mirador. El charco queda en la superficie del impacto y solo daña a quien está a ≤ `ACID_VERTICAL_REACH` (1.4 m) de esa superficie. El lanzamiento anticipa la velocidad reportada (`ACID_TARGET_LEAD` = 0.85) y cada tick barre la cápsula del jugador (`ACID_SWEEP_RADIUS` = 0.45 m + cuerpo), de modo que correr o saltar a través del proyectil recibe daño; cambiar de dirección sigue esquivando. | alta |
| RF-9b | Aliento de fuego (Demon): cono de 8.5 m y ~20.6° desde la boca, 950 ms con daño en 3 ticks (16 total), reorientado en 3D al objetivo; solo daña dentro del cono y a ≤ `DEMON_FIRE_VERTICAL_REACH` (6 m) de diferencia vertical, suficiente para alcanzar a un jugador en un mirador (~3.46 m). El cliente dibuja el cono con shader procedural (`FireBreath.svelte`); el daño lo decide el servidor. | alta |
| RF-9c | Roca de lava (Golem): ataque a distancia de 19 m, 32 de daño y 3.2 s de recarga; el proyectil resuelve la parábola contra la **posición anticipada** del objetivo (`GOLEM_ROCK_TARGET_LEAD` = 0.8 sobre la velocidad reportada), así que correr en línea recta ya no esquiva: hay que cambiar de dirección tras el lanzamiento. Cada tick barre la cápsula del jugador (`GOLEM_ROCK_SWEEP_RADIUS` = 0.7 m) para que un impacto visible cuente aunque el punto de caída esté más lejos. Al impactar daña en 2 m de radio (≤ `GOLEM_ROCK_VERTICAL_REACH` = 2.6 m) y emite `rock-hit {playerId, dx, dz}` para cada jugador alcanzado; su cliente aplica un empuje de 10 m/s y 6.2 m/s de salto con amortiguación 2.6, que lo lanza por los aires. La roca se dibuja con shader de lava procedural (`RockProjectile.svelte`). | alta |
| RF-10 | Drop al morir: shotgun 18 %, subfusil 16 %, rifle 10 %, granada 22 %, munición 14 %, botiquín 12 %, nada 8 % (§11.5). | alta |
| RF-11 | Pickup automático (radio 1.6 m): el arma recogida se guarda en su ranura del inventario y se equipa; granada +2 (máx. 6); munición +50 universal; botiquín +40 HP (máx. 100). | alta |
| RF-11b | Inventario de 4 ranuras fijas (1 pistola, 2 escopeta, 3 subfusil, 4 rifle): conserva el cargador de cada arma y permite cambiar con `1`–`4` o clic/toque en la barra inferior central; el HUD muestra todas las armas poseídas con su munición. | alta |
| RF-12 | Arma inicial: Rusty Pistol (12 dmg, 6 disparos/s, alcance 55 m, cargador 12, reserva infinita; recarga con `R`). | alta |
| RF-13 | Granada con `G`: espoleta 1.5 s, impacto con el suelo o **proximidad a un monstruo** (≲1.1 m); 75 dmg en 4.5 m (caída lineal); NO daña a compañeros ni al coche. | alta |
| RF-14 | Coche calabaza en `(-34.30, 1.40, 41.00)`: `E` entra/sale (2.5 m); HP 600; atropello 55 dmg/monstruo (0.7 s por monstruo); melé y ácido lo dañan; a 0 HP explota y queda chatarra toda la partida. | alta |
| RF-15 | El coche no puede salir del área (el servidor recorta el reporte al polígono); el jugador al volante no puede disparar (sale con `E` para combatir). | media |
| RF-16 | HUD en inglés: oleada n/8, monstruos restantes, HP, arma + cargador/reserva, granadas en la misma barra que las armas (`G`), puntuación de equipo, caídos, HP del coche al conducir. | alta |
| RF-17 | Overlays en inglés: countdown (espera + 10…1), caído (“You are down — you'll revive after the wave”), intermission (oleada superada + 12 s), victoria/derrota (puntuación, kills, MVP, botón/continuar a 15 s). | alta |
| RF-18 | Al terminar, todos vuelven a `global` con `go-lobby` y teletransporte al granero; el checkpoint se limpia. | alta |
| RF-19 | Si la sala se vacía en cualquier fase, vuelve a `idle` y se limpia (monstruos, drops, charcos, granadas, coche). | alta |
| RF-20 | Reconexión estándar de RUN.world (`allowReconnect`, 20 s); al reconectar, el jugador recupera su estado (HP, arma, posición). | media |
| RF-21 | Clips nuevos en el jugador: `HR_walk_aim`/`HR_run_aim`/`HR_crouch_aim`/`HR_aim` en combate, `HR_injured` con cualquier golpe (throttle de 700 ms para fuego/charco), `HR_heal` al curarse/revivir, `HR_throw` en la animación de lanzar granada. | alta |
| RF-22 | Monstruos reproducen `*_run` al perseguir, `*_walk` al deambular/reaparecer, `*_attack` (melé) o `*_throw` (ácido) al atacar, `*_hit` al recibir daño, `*_death` al morir (2 s y desaparece). | alta |
| RF-23 | `waves:check` valida geometría de arena contra `barnsiege.glb`, `waves:terrain` valida las rampas/plataformas y el alcance vertical, `waves:fire` valida el aliento del Demon, `waves:rock` valida la roca del Golem (daño, empuje y esquiva) y `waves:aim` valida los proyectiles contra un jugador en movimiento (correr/saltar recibe daño; cambiar de dirección esquiva); los cinco deben pasar en verde. | media |
| RF-24 | Los jugadores remotos se ven con su skin (`SkinCharacter`) e interpolados a 10 Hz; los monstruos se renderizan con el mismo rig de skins (mapeo 1:1, §11.6). | alta |
| RF-24b | Los disparos de jugadores remotos se ven desde el arma en su mano: el servidor emite `shot-fired` solo para disparos aceptados y el cliente dibuja trazadora + fogonazo; el arma equipada visible de cada remoto sigue su snapshot. | alta |
| RF-25 | Los monstruos de melé pueden subir las rampas de los dos miradores (`ADD_Mirador_Wood` ≈ `x = -26`, `ADD_Mirador_Stone` ≈ `x = +26`) muestreando la altura caminable en cada paso; `MONSTER_MAX_STEP` (0.35 m) impide escalar muros. Sin objetivo en alto no suben ni se teletransportan a la plataforma. | alta |
| RF-26 | Todo reporte de posición se recorta a `ARENA_POLYGON` (16 vértices, margen 0.5 m): un jugador que intenta salir queda en el borde y **sigue siendo objetivo y recibiendo daño**. No existe flag de inmunidad por abandonar la arena; los monstruos también aparecen y persiguen por todo el recinto. | alta |
| RF-27 | Limpiar la oleada 8 (`phase = 'won'`) registra `barn-8-waves` en `rw:missions:v1` y desbloquea la skin `pumpkin-king`; perder o abandonar no la desbloquea y el premio no se equipa automáticamente. | alta |

### No funcionales

| ID | Requisito | Criterio |
| --- | --- | --- |
| RNF-1 | Servidor autoritativo | El cliente solo envía posición, disparos, lanzamientos y reportes de coche; el servidor valida ritmo (fire-rate), alcance, origen (≤ 2 m del último reporte), contención y pertenencia. |
| RNF-2 | Tráfico ≤ 16 KiB/frame | Payload de `mg5-positions` redondeado a 2 decimales; si se supera, avisar por `ByteBudget` (no truncar). |
| RNF-3 | Rendimiento | ≤ 26 monstruos concurrentes; 60 FPS en hardware medio con 12 jugadores + 26 monstruos animados. |
| RNF-4 | Sin fugas | Entrar/salir 10 veces: sin cuerpos, controladores ni suscripciones residuales; `svelte-check`/`lint`/`build` verdes. |
| RNF-5 | Determinismo de partida | Dos clientes ven la misma oleada, los mismos monstruos, drops, charcos y resultado. |
| RNF-6 | Arena portable | Todas las constantes de arena en `wavesConfig.ts` / `waves.ts` (sección “Arena”); cambiar de mapa no toca la lógica. |
| RNF-7 | Combate coherente con la altura | Melé y granada usan la diferencia vertical; el ácido y la roca apuntan a la altura real del objetivo; el charco del ácido queda en esa superficie; el fuego del Demon es un cono 3D con 6 m de alcance vertical. Un charco en el suelo no daña a quien está en una plataforma, pero un ataque a distancia (ácido, fuego o roca) sí puede alcanzarlo. |

## 5. Criterios de aceptación

- [ ] CA-1: El checkpoint “Barn Siege” aparece junto al granero y `E` abre la sala con 1 jugador en `countdown`.
- [ ] CA-2: Con 2 navegadores, ambos aparecen en la plaza; el segundo no reinicia la cuenta atrás.
- [ ] CA-3: Al llegar a 12/12 la cuenta atrás se recorta a 10 s (verificable con `?dev=…` o reduciendo `COUNTDOWN_MS` en dev).
- [ ] CA-4: En `countdown` el jugador no se mueve (o se mueve sin efecto de juego) y no puede dañar ni ser dañado.
- [ ] CA-5: Empieza la oleada 1: aparecen esqueletos en los puntos de aparición (los seis portales y el resto del recinto) con efecto de aparición 1 s antes.
- [ ] CA-6: Un esqueleto persigue al jugador más cercano y le pega a melé; el jugador pierde HP y ve viñeta roja.
- [ ] CA-7: Una bruja mantiene la distancia y lanza ácido; el proyectil describe un arco; al caer aparece un charco que daña al pisarlo durante 6 s.
- [ ] CA-8: Al morir un monstruo suelta un drop según probabilidades; al pasar por encima se recoge; el HUD muestra el arma/munición/granadas actualizadas.
- [ ] CA-9: La escopeta/subfusil/rifle gastan munición universal; al agotarse no disparan (clic suena vacío / HUD en rojo) y `R` o el botón táctil recarga del pool universal (o no dispara si está vacío).
- [ ] CA-10: Una granada lanzada con `G` explota al tocar el suelo o a los 1.5 s; mata monstruos en 4.5 m; no daña al lanzador ni a compañeros ni al coche.
- [ ] CA-11: El jugador entra al coche con `E`; atropella a un monstruo (muere o pierde 55 HP) con enfriamiento; un melé contra el coche le resta HP al coche (HUD muestra HP del coche).
- [ ] CA-12: Al llegar el coche a 0 HP explota, queda como chatarra y no se puede volver a entrar.
- [ ] CA-13: Al limpiar la oleada 1 aparece “¡Oleada superada!” y 12 s de intermission; los caídos reaparecen con 50 HP.
- [ ] CA-14: Al caer en mitad de la oleada el jugador queda inmóvil con el mensaje de espera; si todos caen, derrota inmediata.
- [ ] CA-15: Al limpiar la oleada 8 aparece la pantalla de victoria con puntuación y bajas por jugador; a los 15 s todos vuelven a `global` junto al granero.
- [ ] CA-16: Si todos salen durante la partida, la sala vuelve a `idle` y la siguiente entrada empieza una espera nueva.
- [ ] CA-17: Entrar durante `playing` devuelve `WAVES_IN_PROGRESS` y no cambia de lobby.
- [ ] CA-18: Dos navegadores ven los mismos monstruos, drops, charcos, granadas, HP de jugadores y del coche.
- [ ] CA-19: Los remotos se mueven interpolados; los monstruos también (sin saltos a 10 Hz).
- [ ] CA-20: En victoria/derrota el jugador aparece en `(-41.60, 0.40, 32.60)` con su avatar, cámara y movimiento a pie.
- [ ] CA-21: `bun run waves:check`, `bun run waves:terrain`, `bun run waves:fire`, `bun run waves:rock`, `bun run check`, `bun run lint`, `bun run build` pasan; el build de rooms compila `WavesRoom.ts`.
- [ ] CA-22: Entrar/salir 10 veces y reconectar no deja cuerpos, controladores ni errores en consola.
- [ ] CA-23: El jugador en combate reproduce `HR_walk_aim`/`HR_run_aim`/`HR_crouch_aim`; al recibir cualquier golpe reproduce `HR_injured` (también los golpes de 8–12 dmg); al usar botiquín/revivir, `HR_heal`.
- [ ] CA-24: Los monstruos reproducen `*_run`/`*_attack`/`*_throw`/`*_death` según su estado; un monstruo muerto desaparece a los ~2 s.
- [ ] CA-25: El checkpoint de `minigame-5` no aparece si el jugador ya está dentro; el chat, los checkpoints 1–3, los rollos y los coches siguen funcionando igual.
- [ ] CA-26: Al entrar en `minigame-5` se renderiza solo `barnsiege.glb` (`sceneState.active === 'barnsiege'`), con el zepelín, el molino, la pancarta y los espantapájaros animados, y el resto de mapas queda fuera de escena.
- [ ] CA-27: Un jugador subido a la plataforma de un mirador (~3.46 m) no recibe melé de monstruos que están abajo, pero sí puede recibir ácido (el proyectil apunta a su altura) y fuego del Demon (cono 3D, 6 m); un esqueleto de melé sube la rampa y, al llegar arriba, vuelve a hacerle daño. Un jugador que intenta salir del polígono queda recortado al borde y sigue recibiendo daño.
- [ ] CA-28: `bun run waves:terrain` simula la subida desde el pie, el lado y detrás de cada mirador y falla si un monstruo no llega, si se teletransporta desde el suelo o si la plataforma queda dentro del alcance vertical de melé y de los charcos de ácido desde el suelo.
- [ ] CA-29: Un Demon a ~6 m escupe un cono de fuego visible desde su boca; el jugador pierde vida por ticks mientras dura, detrás del Demon no hay daño y un jugador en un mirador (~3.46 m) sí recibe el cono porque se reorienta en 3D y el alcance vertical es 6 m. `bun run waves:fire` pasa en verde.
- [ ] CA-30: Un Golem a ~12–15 m lanza una roca de lava visible (shader animado) en arco. Si el jugador no se mueve, pierde 32 HP y sale despedido unos metros por los aires; si se aparta después del lanzamiento, la roca estalla en el suelo sin dañarlo. `bun run waves:rock` pasa en verde.

## 6. Archivos relevantes

| Ruta | Acción | Motivo |
| --- | --- | --- |
| `frontend/static/Hero.glb` | modificar (copiar) | Clips `HR_*_aim`, `HR_injured`, `HR_heal`, `HR_carry`, `HR_throw`. |
| `frontend/static/{Demon,Frankenstein,Ghost,Golem,Mummy,PumpkinKing,Scarecrow_Feet,Skeleton,Vampire,Witch}.glb` | modificar (copiar) | Ídem con prefijos `DM_`, `FR_`, `GH_`, `GO_`, `MU_`, `PK_`, `SF_`, `SK_`, `VA_`, `WH_`. |
| `frontend/src/server/protocol.ts` | modificar | Tipos `Mg5*`, `LOBBY_IDS`/`MINIGAME_LOBBY_IDS`/`LOBBY_DEFINITIONS` con `minigame-5`, `HERO_ANIMATIONS` ampliado, unión de mensajes y `CLIENT_MESSAGE_TYPES`. |
| `frontend/src/server/validate.ts` | modificar | Esquemas de `mg5-position`, `mg5-shoot`, `mg5-throw`, `mg5-car-enter/exit/state`, `mg5-reload`. |
| `frontend/src/server/engines/waves.ts` | crear | Motor autoritativo: fases, oleadas, IA de monstruos, ácido, **rocas de lava con empuje**, drops, granadas, coche, daño, revivir, puntuación. IA 2.5D: rampas de los miradores, melé con alcance vertical, ácido/roca balísticos contra la altura real y contención al recinto completo (salir no da inmunidad). |
| `frontend/src/server/rooms/WavesRoom.ts` | crear | Room `waves`: ciclo de vida, mensajes, `tick` a 100 ms, `go-lobby` al terminar. |
| `frontend/rundot/rooms.config.json` | modificar | Alta de la room `waves` (`maxPlayers: 12`). |
| `frontend/src/lib/services/protocol.ts` | modificar | Duplicar tipos `Mg5*` + guards `isMg5Snapshot/isMg5Positions/isMg5Event`; ampliar `ClientMessage`, `ServerMessage`, `isServerMessage`, `LOBBY_IDS`, `MINIGAME_LOBBY_IDS`, `LOBBY_DEFINITIONS`, `HERO_ANIMATIONS`; `Mg5Positions.rocks` y eventos `rock-thrown`/`rock-impact`/`rock-hit`. |
| `frontend/src/lib/services/lobbySocket.ts` | modificar | `ROOM_TYPE_BY_LOBBY['minigame-5'] = 'waves'`; callbacks `onMg5State/onMg5Positions/onMg5Event`; senders `sendMg5*`; dispatch en `handleMessage`. |
| `frontend/src/lib/state/lobby.svelte.ts` | modificar | Wire de callbacks/senders; reset de `minigame5`; `syncMinigame`; `isMinigame5LobbyId`; teletransporte a `WAVES_EXIT` al salir. |
| `frontend/static/barnsiege.glb` | usar | Arena del minijuego (aldea amurallada, prefijo `BS_*`, 3 animaciones). |
| `frontend/static/weapons/{pistol,shotgun,mp5,sniper_rifle}.glb` | usar | Modelos en mano de las cuatro armas básicas del inventario (pistola, escopeta, subfusil, rifle). |
| `frontend/static/props/{ammo_kit,med_kit,grenade}.glb` | usar | Modelos de los drops de munición, botiquín y granada. |
| `frontend/world/assets.json` | modificar | Alta de `ammo-kit`, `med-kit` y `grenade` (`category: props`, `pipeline: static`) para `assets:check`/`assets:compress`. |
| `frontend/src/lib/components/player/heldWeapon.ts` | modificar | Consume `weaponModels.ts`, conserva el `BarrelTip` y deja la primitiva como fallback mientras carga el GLB. |
| `frontend/src/lib/components/player/weaponModels.ts` | crear | Caché única de GLB (`GLTFLoader` + `DRACOLoader`), `WEAPON_MODEL_BY_ID`, escalas por arma, clones con sombras y precarga de armas/props. |
| `frontend/src/lib/components/waves/WaveDrop.svelte` | modificar | Sustituye las primitivas por los GLB de armas y props, manteniendo halo, flotación y giro. |
| `frontend/world/barnsiege.physics.json` | crear | Físicas de la arena: 40 colliders, exclusiones (zepelín, espantapájaros, agua, campos, carteles) e `animations.idle` de los espantapájaros. |
| `frontend/world/maps.json` | modificar | Alta del mapa `barnsiege` (`glb`, componente, física y spawn). |
| `frontend/scripts/world-inject.mjs` | modificar | Inyecta `AutoColliders` y el balanceo idle procedural de los espantapájaros. |
| `frontend/src/lib/components/world/Barnsiege.svelte` | generar | Componente del mapa, generado por `bun run barnsiege:build` (no editar a mano). |
| `frontend/src/lib/state/sceneState.svelte.ts` | modificar | `minigame-5` → `active === 'barnsiege'`; getter `inBarnsiege`; solo se renderiza ese mapa (`SPEC-021`). |
| `frontend/src/lib/state/checkpoints.svelte.ts` | modificar | Checkpoint `minigame-5` “Barn Siege” en `(-41.60, 0.40, 32.60)`, `#f97316`, radio 2. |
| `frontend/src/lib/state/playerState.ts` | modificar | `WAVES_EXIT` (`-41.60, 0.40, 32.60`) y `waves: boolean` en `playerRuntime`; `setPlayerSpawn` al salir. |
| `frontend/src/lib/state/wavesConfig.ts` | crear | **Único sitio** con la geometría de arena: polígono, 30 spawns, checkpoint, coche, `BUILDING_BLOCKS`; estadísticas de monstruos, tabla de oleadas, armas, drops, probabilidades, **constantes de la roca del Golem** (`GOLEM_ROCK_*`, empuje incluido) y `MONSTER_CLIMBS`. Marcado `// DEPENDE DEL MAPA — re-medir al cambiar barnsiege.glb`. |
| `frontend/src/lib/state/minigame5.svelte.ts` | crear | Store reactivo: snapshot, posiciones interpoladas (incluidas `rocks`), **knockback pendiente del jugador local**, acciones (disparar, lanzar, recargar, entrar/salir coche) y resets. |
| `frontend/src/lib/missions/minigames.ts` | crear | Misión `barn-8-waves` (título y descripción) del registro local. |
| `frontend/src/lib/state/missions.svelte.ts` | modificar | Persistencia genérica de victorias de minijuego y `completeMinigameMission()`. |
| `frontend/src/lib/cosmetics/skins.ts` | modificar | `pumpkin-king.unlockMissionId = 'barn-8-waves'`. |
| `frontend/src/lib/audio/events.ts` | modificar | Nuevos eventos `rock-thrown` (sonido de lanzamiento) y `rock-impact` (piedra + explosión atenuada) en `consumeMg5`. |
| `frontend/src/lib/state/waveInput.ts` | crear | Estado de entrada de combate (fire/grenade/reload/car E) separado de `playerInput`. |
| `frontend/src/lib/cosmetics/skins.ts` | modificar | `skinAnimations` ampliado: `HR_aim→*_aim`, `HR_walk_aim→*_walk_aim`, `HR_run_aim→*_run_aim`, `HR_crouch_aim→*_crouch_aim`, `HR_injured→*_injured`, `HR_heal→*_heal`, `HR_carry→*_carry`, `HR_throw→*_throw`. |
| `frontend/src/lib/components/waves/WaveSession.svelte` | crear | Reporta posición a 10 Hz; gestiona `go-lobby` (teletransporte) y resets. |
| `frontend/src/lib/components/waves/WaveMonster.svelte` | crear | Instancia un monstruo: `SkinCharacter` (mapeo §11.6) + altura por tipo + collider cinemático + clips por estado; `rock-thrown` reproduce `*_throw`. |
| `frontend/src/lib/components/waves/WaveMonsters.svelte` | crear | Itera `minigame5.monsters`; solo con snapshot. |
| `frontend/src/lib/components/waves/WaveDrops.svelte` | crear | Drops flotantes (icono por tipo), recogida por proximidad (cliente avisa; el servidor decide). |
| `frontend/src/lib/components/waves/WavePools.svelte` | crear | Charcos de ácido (círculo emisivo translúcido). |
| `frontend/src/lib/components/waves/WaveProjectiles.svelte` | crear | Proyectiles de ácido, **rocas de lava** y granadas en vuelo (esferas/balas + estelas), explosiones (incluida la roca) y conos de fuego. |
| `frontend/src/lib/components/waves/RockProjectile.svelte` | crear | Roca del Golem con **shader procedural de lava** (basalto, vetas incandescentes, fresnel, halo aditivo y `PointLight`), giro y deformación animados. |
| `frontend/src/lib/components/waves/WaveExplosion.svelte` | modificar | Tercera paleta `rock`: rotura de roca con núcleo naranja, ondas, chispas, humo y fogonazo (`PointLight`), usando `GOLEM_ROCK_IMPACT_RADIUS`. |
| `frontend/src/lib/components/waves/FireBreath.svelte` | crear | Cono de fuego del Demon con shader procedural (llama + núcleo, chispas, fogonazo en la boca y `PointLight`). |
| `frontend/src/lib/components/waves/WaveCar.svelte` | crear | `coche_calabaza` + `VehiclePhysics` (HP 600, atropello vía reporte del conductor) o chatarra si está destruido. |
| `frontend/src/lib/components/waves/WaveRemotes.svelte` | crear | Jugadores remotos de la partida con skins e interpolación (análogo a `RemotePlayers` de la cripta). |
| `frontend/src/lib/components/waves/WaveControls.svelte` | crear | `G` granada, `R` recargar, `E` coche, clic/toque disparo (dispara en `pointerdown`); asistencia de puntería sobre el monstruo bajo el punto de mira; ignora inputs editables y `chat.isOpen`. |
| `frontend/src/lib/state/waveEffects.svelte.ts` | crear | Efectos de presentación del combate: trazadoras, fogonazos, chispas de impacto y marca de tiempo del último acierto. |
| `frontend/src/lib/components/waves/WaveTracers.svelte` | crear | Dibuja trazadoras, fogonazo y chispas a partir de `waveEffects`. |
| `frontend/src/lib/components/waves/WaveHud.svelte` | crear | Oleada, restantes, HP, arma/munición, granadas, score, barra del coche. |
| `frontend/src/lib/components/waves/WaveOverlay.svelte` | crear | Countdown, caído, intermission, victoria/derrota. |
| `frontend/src/lib/Scene.svelte` | modificar | Montar componentes `waves` cuando `sceneState.inWaves` y renderizar `WorldMap mapId={sceneState.active}` (`barnsiege` dentro de la partida). |
| `frontend/src/lib/GamePage.svelte` | modificar | `WaveHud` y `WaveOverlay` cuando `inWaves`; ocultar `MissionHud` mientras tanto. |
| `frontend/src/lib/components/player/PlayerBehaviour.svelte` | modificar | En `inWaves`: movimiento normal salvo caído; enviar `mg5-position` en vez de `player-position`; clips de aim según estado; `ControlLeft/Right` agacharse ya existe. |
| `frontend/src/lib/components/player/PlayerCollider.svelte` | modificar | Consume `minigame5.knockback` y aplica el impulso de la roca (10 m/s horizontal + 6.2 m/s vertical, amortiguación 2.6) al controlador; el cuerpo sigue volando aunque quede caído y la nueva posición se reporta a 10 Hz. |
| `frontend/src/lib/components/player/Player.svelte` | modificar | Sin cambios de avatar (visible en la arena). |
| `frontend/src/lib/components/ui/MobileControls.svelte` | modificar | En `inWaves`: botones Fire / Grenade / Reload / Car además del stick. |
| `frontend/src/lib/loaders/gameAssets.svelte.ts` | modificar | Hero pasa a 889 456 B; añadir `WAVES_ASSETS` (10 monstruos) precargados al entrar; exportar `getWavesAssets()`. |
| `frontend/src/lib/components/cars/VehiclePhysics.svelte` | verificar/reusar | El coche de la arena lo reutiliza con `isDriver` para el conductor local; sin tocar la lógica de SPEC-014/018. |
| `frontend/scripts/verify-waves-arena.mjs` | modificar | `waves:check` (solo Node): lee `barnsiege.glb`, comprueba nodos, animaciones, polígono, spawns, coche y BBox de edificios. |
| `frontend/scripts/verify-waves-terrain.mjs` | crear | `waves:terrain` (Bun): simula la IA de subida a los miradores y valida alturas de combate. |
| `frontend/scripts/verify-waves-fire.mjs` | crear | `waves:fire` (Bun): simula el aliento del Demon y valida boca, cono, daño por ticks y expiración. |
| `frontend/scripts/verify-waves-rock.mjs` | crear | `waves:rock` (Bun): simula la roca del Golem y valida tipo de ataque, `rocks` en posiciones, daño completo, empuje normalizado, impacto y esquiva. |
| `frontend/scripts/verify-waves-aim.mjs` | crear | `waves:aim` (Bun): reporta posiciones a 10 Hz y valida que ácido y roca conectan al correr/saltar, que parado dañan y que cambiar de dirección esquiva. |
| `frontend/package.json` | modificar | Scripts `waves:check`, `waves:terrain`, `waves:fire`, `waves:rock`, `waves:aim`, `barnsiege:build` y `barnsiege:check`. |
| `specs/SPEC-023-minijuego-4-asedio-al-granero.md` | crear | Este spec. |

## 7. Plan de implementación

### Fase 0 — Assets y protocolo base

- [x] Paso 1: Copiar los 11 GLB de `blender/exports/` a `frontend/static/`
      (sobrescribir; `Hero.glb` incluido). No tocar los `* copy.glb`.
- [x] Paso 2: Ampliar `HERO_ANIMATIONS` en **ambos** `protocol.ts`:
      `HR_aim`, `HR_walk_aim`, `HR_run_aim`, `HR_crouch_aim`, `HR_injured`,
      `HR_heal`, `HR_carry`, `HR_throw` (los 4 rigs de monstruo y Hero los
      tienen todos; Ghost no tiene `*_sit`/`*_shoot`, y ya está el manejo de
      clips faltantes).
- [x] Paso 3: Ampliar `skinAnimations` con los 8 clips nuevos y verificar
      `bun run check`.
- [x] Paso 4: Actualizar tamaño de `Hero.glb` en `gameAssets.svelte.ts` y
      añadir `WAVES_ASSETS` + `getWavesAssets()`.
- [x] Paso 4b: Mapear los GLB existentes de `frontend/static/weapons/`
      (`pistol`, `shotgun`, `mp5`, `sniper_rifle`) y `frontend/static/props/`
      (`ammo_kit`, `med_kit`, `grenade`) a `WEAPON_MODEL_BY_ID` y a los drops
      de `WaveDrop.svelte`; añadirlos a `WAVES_ASSETS`, normalizar escala y
      orientación, y conservar el `BarrelTip` y la primitiva de fallback.
- [x] Paso 5: Añadir `minigame-5` a `LOBBY_IDS`, `MINIGAME_LOBBY_IDS`,
      `LOBBY_DEFINITIONS` (`{ id: 'minigame-5', name: 'Barn Siege', kind:
      'minigame' }`) en ambos protocolos; `MinigameLobbyId` se propaga solo.
- [x] Paso 6: Crear `wavesConfig.ts` con §11.1–11.6 (polígono, spawns,
      spawns de monstruos, checkpoint, coche, monstruos, oleadas, armas,
      drops). Crear `frontend/scripts/verify-waves-arena.mjs` y
      `bun run waves:check`; debe pasar en verde.

### Fase 1 — Contrato y motor en el servidor

- [x] Paso 1: En `server/protocol.ts`, añadir tipos `Mg5*` de §11.7
      (`Mg5Phase`, `Mg5MonsterKind`, `Mg5WeaponId`, `Mg5DropKind`,
      `Mg5PlayerState`, `Mg5MonsterState_`, `Mg5Pool`, `Mg5Drop`,
      `Mg5Snapshot`, `Mg5Positions`, `Mg5EventKind`, `Mg5Event`) y ampliar
      `ClientMessage`, `ServerMessage` y `CLIENT_MESSAGE_TYPES` con los
      mensajes `mg5-*`.
- [x] Paso 2: En `server/validate.ts`, añadir los esquemas de validación de
      los 5 mensajes de cliente `mg5-*` (finitos, rangos, `weapon` en lista,
      `dx/dy/dz` normalizado o re-normalizar, `steering` finito).
- [x] Paso 3: Crear `server/engines/waves.ts`:
      ```ts
      initWaves(deps): void            // deps = { publish/sendTo via RoomPort, moveToLobby }
      onEnter(playerId, name, skin): { ok } | { ok: false, code, message }
      onLeave(playerId: string): void
      onPosition(playerId, x, y, z, yaw, now): void
      onShoot(playerId, weapon, origin, dir, now): void
      onThrow(playerId, origin, dir, now): void
      onReload(playerId, now): void
      onCarEnter(playerId, now): void
      onCarExit(playerId, now): void
      onCarState(playerId, report, now): void
      tick(now): void
      buildSnapshot(now): Mg5Snapshot
      ```
- [x] Paso 4: Máquina de estados: `idle → countdown` (30 s, recorte a 10 s con
      12/12) → `playing` → (oleada limpiada) → `intermission` 12 s → siguiente
      oleada → … → `won` | `lost` → 15 s → `go-lobby` a todos y `idle`.
      `playing → lost` si todos los jugadores vivos están caídos.
- [x] Paso 5: `onEnter`: rechaza si `phase` no es `idle`/`countdown` o está
      lleno (`WAVES_IN_PROGRESS` / `WAVES_FULL`); asigna aparición en la
      plaza (rejilla de 12 huecos), HP 100, pistola
      oxidada, 1 granada, 60 munición universal, 0 puntos; publica snapshot y
      `player-joined`. Si `idle`, arranca `countdown`.
- [x] Paso 6: Implementar la cola de spawn de la oleada: al empezar, encolar
      los monstruos de la tabla con spawn escalonado 0.65 s; cada spawn emite
      `monster-spawned {kind, spawnId}` 1 s antes (portal) y luego aparece en
      `playing`. Monstruos máximos concurrentes: 26 (las tablas nunca superan
      22).
- [x] Paso 7: IA por monstruo (tick 100 ms): objetivo = jugador vivo más
      cercano (o el coche si conduce y es el “jugador” más cercano); melé
      persigue hasta `range` y ataca con enfriamiento; ácido mantiene
      9–13 m (retrocede si está más cerca, se acerca si está más lejos) y
      lanza con enfriamiento. Separación: push radial entre monstruos que se
      solapan (min 0.9 m). Contención: punto dentro del polígono de 16
      vértices (ray-casting); si sale, se proyecta de vuelta.
- [x] Paso 8: Ácido: proyectil balístico (gravedad 9.8, tiempo de vuelo
      `clamp(dist/14, 0.6, 1.4)` s) calculado en el disparo contra la altura
      real del objetivo (`targetY`); en `tick` se evalúa la parábola exacta y,
      al cumplirse el vuelo, impacta en el punto apuntado (suelo, rampa o
      plataforma): daño directo en 1.2 m (jugadores y coche) y creación de
      charco (r 2.2, 8 HP/s, 6 s, máx. 10, FIFO). El charco queda en la
      superficie del impacto; daña solo a jugadores a pie (no al coche).
- [x] Paso 9: Disparo hitscan (`onShoot`): validar fase `playing`, jugador
      vivo, no conduciendo, arma en mano, cadencia por arma (pistola 6/s,
      escopeta 0.9/s, subfusil 11/s, rifle 1.5/s), origen ≤ 2 m del último
      reporte, alcance por arma. Rayo vs círculos de monstruos (XZ, radio
      0.55, más altura: ignorar Y salvo rango vertical ±2.5 m). El impacto más
      cercano recibe el daño; escopeta = 8 pellets con dispersión ±7°
      (determinista con semilla por disparo) y 6 dmg por pellet.
- [x] Paso 10: Muerte de monstruo: roll de drop (tabla §11.5) → `drops[]`
      (id, kind, posición, `despawnAt` 45 s); emite `monster-died`; cadáver
      se muestra con `*_death` 2 s y se retira. Puntuación por tipo (§11.4).
- [x] Paso 11: Pickup (`tick`): jugador a pie vivo a ≤ 1.6 m de un drop →
      aplica efecto (arma reemplaza; granada +2 máx 6; munición +50; botiquín
      +40 HP cap 100) y emite `drop-picked`. Drops expiran a los 45 s.
- [x] Paso 12: Granada (`onThrow`): valida granada en mano > 0; crea proyectil
      balístico (misma fórmula) con espoleta 1.5 s o al tocar suelo; al
      explotar: 75 dmg (caída lineal a 30 en el borde) a monstruos en 4.5 m;
      emite `grenade-exploded`; NO daña jugadores ni coche.
- [x] Paso 13: Coche: `onCarEnter` (fase `playing`/`intermission`, coche no
      destruido, ≤ 2.5 m) asigna `driverId`; `onCarExit` libera; `onCarState`
      guarda el reporte y lo retransmite a 10 Hz en `mg5-positions.car` para
      los remotos; atropello: si un monstruo está a ≤ 2.3 m del coche y el
      cooldown por-monstruo (0.7 s) venció → 55 dmg; monstruos melé cuyo
      objetivo es el coche le hacen daño al coche en vez de al conductor;
      ácido directo también daña al coche; a 0 HP → `car-destroyed`,
      `destroyed = true`, el conductor sale con 25 dmg; el coche queda chatarra.
- [x] Paso 14: Daño a jugador: melé/ácido/charco restan HP; ≥ 20 dmg emite
      `player-hurt`; a 0 HP → caído (`downed`, inmóvil, no objetivo de melé,
      no recoge drops); si todos caídos en `playing` → `lost`. En
      `intermission`: caídos reviven con 50 HP (`player-revived`).
- [x] Paso 15: `tick`: fases, spawn queue, IA, proyectiles, charcos (ticks
      de daño 1 Hz), drops (expiración), coche, revivir en intermission,
      puntuación, `mg5-positions` a 10 Hz, `mg5-state` cuando cambie algo o
      cada 1 s. `try/catch`: registrar y resetear a `idle`.
- [x] Paso 16: `onLeave`: retira al jugador; limpia su objetivo de monstruos;
      si la sala queda vacía → `idle` y limpiar todo; si era el conductor,
      coche queda libre (`driverId = null`).

### Fase 2 — Room y config

- [x] Paso 1: Crear `WavesRoom.ts` (análogo a `CryptRoom.ts`): `RoomPort` con
      `ByteBudget`, `clock.setInterval('tick', …, 100)`, `onPlayerJoin →
      waves.onEnter`, `onPlayerLeave → waves.onLeave`, `onGameMessage` con
      `parseClientMessage` y switch de `mg5-*` y `ping`; `go-lobby` al
      terminar (sendTo + `kick` a 1.5 s de respaldo, como la cripta).
- [x] Paso 2: `rooms.config.json`: añadir
      `{ "type": "waves", "file": "src/server/rooms/WavesRoom.ts", "config":
      { "maxPlayers": 12, "allowReconnect": true, "reconnectTimeout": 20,
      "idleTimeout": 120 } }`.
- [ ] Paso 3: Smoke test en navegador con dos clientes (la lógica del motor está verificada headless en Bun; falta la pasada en vivo) (entrar, esperar, moverse,
      disparar, limpiar oleada 1 forzando daños por debug o HP bajo).

### Fase 3 — Protocolo y socket en el cliente

- [x] Paso 1: Duplicar en `lib/services/protocol.ts` los tipos `Mg5*` y guards;
      ampliar `ClientMessage`, `ServerMessage`, `isServerMessage`.
- [x] Paso 2: En `lobbySocket.ts`: `'minigame-5': 'waves'` en
      `ROOM_TYPE_BY_LOBBY`; `onMg5State/onMg5Positions/onMg5Event`;
      `sendMg5Position/Shoot/Throw/CarEnter/CarExit/CarState/Reload`; dispatch.
- [x] Paso 3: Crear `state/minigame5.svelte.ts` (snapshot, positions con
      interpolación 150 ms, acciones, `reset()`), `state/waveInput.ts`.
- [x] Paso 4: En `lobby.svelte.ts`: reset de `minigame5` en disconnect y
      cambio de lobby; wiring de callbacks y senders; `isWavesLobbyId`;
      al pasar de `minigame-5` a `global`, `minigame5.exitRequest = { ...WAVES_EXIT }`;
      `syncMinigame` y `isInMinigame` incluyen `minigame-5`.
- [x] Paso 5: En `sceneState.svelte.ts`: `inWaves` getter; la escena sigue
      siendo `map`. En `checkpoints.svelte.ts`: checkpoint nuevo.

### Fase 4 — Componentes de la arena

- [x] Paso 1: `WaveMonster.svelte`: wrapper de `SkinCharacter` con altura por
      tipo (§11.3), `<MonsterCollider>` cinemático (cilindro r 0.45,
      halfHeight ~altura/2) reposicionado con `setNextKinematicTranslation`
      cada frame a la posición interpolada; clips por estado (`run/walk` al
      perseguir/spawn, `attack`/`throw` al atacar, `hit` al recibir, `death`
      al morir, retirada a los 2 s).
- [x] Paso 2: `WaveMonsters.svelte`, `WaveDrops.svelte`, `WavePools.svelte`,
      `WaveProjectiles.svelte` (ácido + granadas + explosiones con luz
      puntual breve y anillo expansivo).
- [x] Paso 3: `WaveCar.svelte`: instancia `coche_calabaza` con
      `VehiclePhysics` (`isDriver = car.driverId === selfId`, activo solo con
      conductor local; remotos interpolados); si `destroyed`, renderiza chatarra
      estática (mismo modelo, material oscurecido, sin física).
- [x] Paso 4: `WaveRemotes.svelte`: jugadores remotos con `SkinCharacter` +
      interpolación; oculta a los que no están en la sala.
- [x] Paso 5: `WaveSession.svelte`: envía `mg5-position` a 10 Hz (no en
      `countdown` para el movimiento? sí se envía, el servidor ignora daño);
      gestiona `minigame5.exitRequest` → teletransporte a `WAVES_EXIT`.
- [x] Paso 6: Montaje en `Scene.svelte` dentro del bloque del mapa (no
      `inCrypt`), visible solo si `sceneState.inWaves && minigame5.snapshot`.
- [x] Paso 7: Portales de spawn: anillo emisivo + haz vertical translúcido
      (sin luces dinámicas), 1 s de telegrafiado.

### Fase 5 — HUD, overlays y controles

- [x] Paso 1: `WaveHud.svelte` (pointer-events-none): oleada `n/8`,
      `monstersRemaining`, HP (o HP del coche si conduces), arma +
      `magAmmo/reserveAmmo` (∞ para pistola), granadas, score de equipo,
      caídos `n`.
- [x] Paso 2: `WaveOverlay.svelte`: `countdown` (“Barn Siege” + espera +
      cuenta atrás), caído (“You are down…”), `intermission` (“Wave N
      cleared!” + 12 s), `won`/`lost` (puntuación, kills, MVP, botón
      “Back to the farm” + auto 15 s).
- [x] Paso 3: `WaveControls.svelte`: `G` lanzar granada, `R` recargar,
      clic izquierdo disparar (mantener para automáticas), `E` coche; ignora
      repeat, modificadores, inputs editables y `chat.isOpen`.
- [x] Paso 4: En `PlayerBehaviour.svelte`: en `inWaves`, si caído, no mueve ni
      salta ni envía posición; clips de aim según movimiento/agachado;
      `HR_injured` en cualquier golpe; `HR_heal` con botiquín/revivir.
- [x] Paso 5: `MobileControls.svelte`: en `inWaves`, botones Fire /
      Grenade / Reload / Car (escriben en `waveInput`).
- [x] Paso 6: `GamePage.svelte`: montar HUD/overlay; ocultar `MissionHud` en
      la arena.
- [x] Paso 7: Precarga durante la cuenta atrás (overlay descartado) mientras se precargan los 10 GLB al entrar
      (como la cripta).

### Fase 6 — Pulido, verificación y cierre

- [x] Paso 1: Anti-trampas: clamp de reportes al polígono, tope de velocidad
      (9 m/s), fire-rate estricto, origen de disparo ≤ 2 m, validación de fase
      y pertenencia en cada mensaje.
- [x] Paso 2: `bun run waves:check` ✓ · `waves:fire` ✓ · `barnsiege:check` ✓ · `check` ✓ ·
      `lint` ✓ · `build` ✓ — falta solo la pasada manual en navegador con dos
      clientes (CA de §5).
- [ ] Paso 3: Medir FPS con 12 pestañas y 22 monstruos; revisar tamaño de
      frames (`ByteBudget` avisa).
- [ ] Paso 4: Actualizar este spec (`estado`, `actualizado`, Progreso,
      Changelog, checkboxes).
- [ ] Paso 5: Confirmar con el usuario las preguntas abiertas.

### Fase 7 — Roca de lava del Golem (2026-11-04)

- [x] Paso 1: `wavesConfig.ts`: nuevo tipo de ataque `rock`, definición del
      Golem a distancia (19 m, 32 dmg, 3.2 s) y constantes `GOLEM_ROCK_*`
      (vuelo, gravedad, radio de impacto, alcance vertical y empuje).
- [x] Paso 2: `engines/waves.ts`: `throwRock` balístico contra la altura real
      del objetivo, `rockImpact` con daño en área, `rock-hit` (dirección de
      empuje normalizada) y `rock-impact`; `projectiles`/`mg5-positions.rocks`.
- [x] Paso 3: Protocolos y store del cliente: `rocks` en `Mg5Positions`,
      eventos `rock-thrown`/`rock-impact`/`rock-hit`, interpolación y
      `minigame5.knockback`.
- [x] Paso 4: `RockProjectile.svelte` con shader de lava procedural y
      `WaveExplosion` con paleta `rock`; `WaveMonster` reproduce `*_throw`.
- [x] Paso 5: `PlayerCollider.svelte` consume el `rock-hit` y aplica el
      impulso al controlador (horizontal + salto + amortiguación), también
      cuando el golpe deja al jugador caído.
- [x] Paso 6: `waves:rock`, sonido de lanzamiento/impacto y verificación:
      `waves:check`, `waves:terrain`, `waves:fire`, `waves:rock`, `check`,
      `lint` y `build` en verde.

## 8. Verificación

```bash
# Frontend
cd frontend
bun run waves:check
bun run waves:terrain
bun run waves:fire
bun run waves:rock
bun run check
bun run lint
bun run build

# Rooms (type-check vía svelte-check, incluido en `check`)
# y arranque local con el CLI de rundot si está disponible.
```

Casos manuales:

1. **Checkpoint**: caminar hasta la puerta sur del granero
   (`(-41.6, 0.4, 32.6)`) y ver “Pulsa E para entrar a Barn Siege”.
2. **Entrada**: `E`; se carga `barnsiege.glb` (solo ese mapa) y aparece en la
   plaza; overlay de espera.
3. **Espera**: con un jugador, 30 s; `W` no mueve al personaje en efecto.
4. **Segundo jugador**: otra pestaña/navegador; no reinicia el conteo.
5. **Oleada 1**: al vencer el contador, esqueletos spawnean por los puntos de
   aparición (portales y resto del recinto) con telegrafiado; persiguen y
   atacan melé.
6. **Ácido**: una bruja lanza un globo que estalla en arco; charco visible;
   pisarlo resta HP.
7. **Drop**: matar un monstruo; recoger el drop; HUD actualizado.
8. **Grenade**: `G`; explosión en el suelo a 1.5 s o al impactar; bajas en
   radio.
9. **Coche**: `E` junto al calabaza; atropellar; ser atacado por frankesteins;
   HP del coche baja; a 0 → explosión y chatarra; `E` ya no entra.
10. **Caído**: HP a 0 → inmóvil con mensaje; al limpiar la oleada → 50 HP.
11. **Victoria**: limpiar oleada 8 → pantalla de victoria; `global` al granero.
12. **Derrota**: morir todos → pantalla de derrota; vuelta al granero.
13. **Salir**: `E`?? No: salir de la partida = botón “Abandonar” en overlay o
    cerrar; al volver al hub aparece junto al granero.
14. **Altura**: subir la rampa de un mirador; los charcos de abajo no dañan,
    pero una bruja puede acertar con el ácido y un Demon con el fuego; un
    esqueleto de melé sube la rampa para volver a atacar. Bajar y comprobar
    que el daño de suelo vuelve.
15. **Fuera de la arena**: cruzar el límite; el servidor recorta la posición
    al borde y los monstruos siguen persiguiendo y quitando vida. Volver al
    centro y comprobar que la persecución continúa con normalidad.
16. **Roca del Golem**: dejar que un Golem (oleada 5) lance desde ~12–15 m;
    ver la roca con vetas de lava en arco. Quieto: −32 HP y el personaje sale
    despedido por los aires. Apartarse tras el lanzamiento: la roca estalla en
    el suelo sin dañar.
17. **Regresión**: chat, checkpoints 1–3, rollos, coches libres, carrera,
    cripta y roadmap funcionan igual.

## 9. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| El mapa se sustituye y la arena queda fuera. | Alto | Toda la geometría en `wavesConfig.ts` + `waves.ts`; `waves:check` falla si un punto cae fuera del polígono; re-medir y ajustar un único archivo. |
| 22–26 monstruos animados tumban los FPS. | Alto | Rigs de ≤ 2 700 tris; `SkinCharacter` comparte materiales; sin sombras dinámicas para monstruos (o solo el jugador proyecta); límite 26; LOD opcional posterior. |
| El servidor de rooms no aguanta 12 jugadores + IA a 10 Hz. | Medio | IA O(n·m) con n≤26 monstruos y m≤12 jugadores es trivial; charcos/drops con límites; snapshot solo al cambiar o 1 Hz; `ByteBudget` vigila el tope de 16 KiB. |
| Un jugador tanquea con el coche y anula el juego. | Medio | HP 600, no revive, monstruos melé dañan el coche; ácido de brujas/vampiros/Rey Calabaza lo desgasta; sin disparo desde el coche; el coche no sale del área. |
| Los monstruos se atascan en el barn/farmhouse. | Medio | Movimiento con sliding por contacto + clamp al polígono; los spawns están fuera de los BBox; aceptable para esta iteración. |
| El ácido es injusto (charcos en cadena). | Medio | Máx. 10 charcos FIFO, duración 6 s, daño 8/s, telegrafiado visual; los lanzadores mantienen distancia y tienen cooldown. |
| La roca del Golem desequilibra o el empuje saca al jugador del mapa. | Medio | La roca anticipa la velocidad reportada (se esquiva cambiando de dirección), radio 2 m y recarga 3.2 s; el empuje pasa por el controlador de personaje (no atraviesa muros) y el servidor sigue recortando la posición al polígono. |
| Cheats: disparos desde lejos / fire-rate. | Alto | Validación: fase, pertenencia, cadencia por arma, origen ≤ 2 m del último reporte, alcance por arma, ray vs círculos XZ. |
| Desync con 12 clientes (posiciones). | Medio | Interpolación 150 ms; `mg5-positions` a 10 Hz; snap si > 8 m de error. |
| Estado huérfano al desconectar (coche, drops). | Medio | `onLeave` limpia conductor/objetivos; si queda vacío → `idle` y reset total; drops/charcos expiran solos. |
| Explotar el drop de armas (cambiar arma infinitamente). | Bajo | Cambiar de arma no devuelve la anterior; el HUD siempre muestra la actual; sin penalización. |
| `minigame-5` id vs “minijuego 4” (el usuario lo llama así). | Bajo | Documentado: `minigame-4` está ocupado por Roadmap; este es `minigame-5`. El spec y el checkpoint dicen “Barn Siege”. |
| GLB con animaciones nuevas no copiados a static. | Alto | Fase 0 paso 1; el build los empaqueta desde `static/`; `bun run build` los verifica. |
| El checkpoint/E conflictúa con entrar al coche (también `E`). | Bajo | Dentro de la arena no existe el sensor de checkpoint; `E` prioriza coche si estás a ≤ 2.5 m; si no, no hace nada. |

## 10. Preguntas abiertas

- [x] ¿Id del minijuego? → **`minigame-5`** (`minigame-4` es Roadmap).
- [x] ¿Dónde se juega? → **`barnsiege.glb`** (aldea amurallada), con el
      checkpoint de entrada en el `map.glb` global junto al granero.
- [x] ¿Cómo termina? → **8 oleadas fijas**; ganas si sobrevives a la última;
      pierdes si todos caen. Sin límite de tiempo por oleada.
- [x] ¿Coches? → **Un `coche_calabaza`** en la plaza de la aldea; atropello daña
      monstruos; el coche tiene HP y puede ser destruido.
- [x] ¿Co-op y muerte? → **Hasta 12 jugadores**; en mitad de la oleada no se
      revive; entre oleadas los caídos vuelven con 50 HP.
- [x] ¿Armas? → **Drops de monstruos** + **pistola básica inicial**
      (reserva infinita).
- [x] ¿Granadas? → **Consumible recogible** (drop de monstruos), lanzable con
      `G`, daño en área; no dañan a compañeros ni al coche.
- [x] ¿Ácido? → **Proyectil en arco + charco** (8 HP/s, 6 s).
- [x] ¿Lanzadores vs melé? → Brujas/Vampiros/Rey Calabaza lanzan ácido; el
      resto melé (Fantasma rápido).
- [x] ¿Vuelta al terminar? → **Sí**: `go-lobby` + teletransporte al granero;
      sin récords persistentes (mejor futura).
- [x] ¿El checkpoint mira al granero por el norte (`z = 46.3`) o prefieres el
      lado sur (`z ≈ 33`, mirando al farmhouse)? → **Lado sur, delante de la
      puerta del granero** (`z = 32.6`).
- [ ] ¿Duración de la intermission 12 s está bien o la quieres más corta
      (p. ej. 8 s) o con botón “¡Listos!”?
- [ ] ¿La puntuación del equipo debe mostrarse entre oleadas o solo al final?
- [x] ¿Quieres desbloqueo de skin al ganar (p. ej. “Rey Calabaza”) como
      recompensa, o lo dejamos fuera? → **Sí**: ganar desbloquea `pumpkin-king`.
- [ ] ¿El coche debe poder arrastrar/empujar monstruos o solo daño por
      atropello? (Hoy: solo daño.)
- [x] ¿Los charcos de ácido deben ralentizar (slow) además de dañar?
- [x] ¿El Golem pega melé o ataca a distancia? → **Lanza rocas de lava en
      arco** (19 m, 32 dmg, 3.2 s) que se pueden esquivar; si aciertan, el
      jugador sale despedido. La roca lleva shader de lava procedural.

## 11. Decisiones y notas

### 11.1 Arena (`barnsiege.glb`, dependiente del mapa)

- **Mapa**: `frontend/static/barnsiege.glb` (`BS_*`; 56 nodos, 54 mallas,
  3 animaciones, 80 500 triángulos). Sustituye al área 3 de `map.glb`, que
  solo conserva el checkpoint de entrada. Al entrar en `minigame-5`,
  `sceneState.active` devuelve `barnsiege` y el `map.glb` deja de renderizarse.
- **Suelo**: `y = 0.5` (`BS_Ground`, caja 136 × 136 m, de −68 a 68).
- **Polígono** (16 vértices, recinto completo hasta la valla, ≈ 9772 m²):
  `(56.50, 0) (52.00, 22.00) (40.00, 40.00) (22.00, 52.00)
   (0, 56.50) (-22.00, 52.00) (-40.00, 40.00) (-52.00, 22.00)
   (-56.50, 0) (-52.00, -22.00) (-40.00, -40.00) (-22.00, -52.00)
   (0, -56.50) (22.00, -52.00) (40.00, -40.00) (52.00, -22.00)`
  Contención: ray-casting en XZ con margen 0.5 m. Salir no concede inmunidad:
  el reporte se recorta al borde y el jugador sigue siendo objetivo.
- **Spawns de jugadores**: rejilla 4 × 3 en la plaza, `x ∈ {-6, -2, 2, 6}`,
  `z ∈ {-6, -2, 2}`, `y = 0.55`.
- **Puntos de aparición de monstruos** (30): los seis portales decorativos
  `gate (0, 32.0)` · `barn (-16.0, -31.0)` · `farmhouse (29.0, 17.0)` ·
  `fields (-29.0, 17.0)` · `giant-pumpkin (29.0, -16.0)` · `silo (-29.0, -16.0)`
  más 24 claros, calles y esquinas repartidos por todo el recinto
  (`MONSTER_SPAWNS`). El servidor elige en cada spawn el punto más lejano a
  los jugadores vivos (≥ 14 m) y el cliente dibuja allí el portal.
- **Coche**: `(6.5, 1.5, -1.5)`, `yaw = π`.
- **Checkpoint** (mapa global): `(-41.60, 0.40, 32.60)` “Barn Siege”, delante
  de la puerta sur del granero. `WAVES_EXIT` usa el mismo punto.
- **Físicas**: 40 colliders del `barnsiege.physics.json`; se excluyen zepelín,
  pancarta, espantapájaros, agua/plantas del lago, campos, caminos y carteles.
- **Animaciones**: bucles `BS_WindmillSpin`, `BS_ZeppelinDrift` y
  `BS_BannerWave`; los espantapájaros usan un idle procedural generado por
  `world-inject.mjs`.

### 11.2 Oleadas (8)

| Oleada | Nombre | Composición |
| --- | --- | --- |
| 1 | Cornfield Skeletons | 6× Skeleton |
| 2 | The Undead | 6× Skeleton, 3× Mummy |
| 3 | Bandages and Bones | 5× Mummy, 4× Skeleton, 2× Witch |
| 4 | Fresh Meat | 3× Frankenstein, 4× Mummy, 2× Vampire |
| 5 | Stone and Fire | 2× Golem, 4× Demon, 2× Witch, 2× Vampire |
| 6 | The Harvest | 2× PumpkinKing, 4× Demon, 3× Scarecrow_Feet, 2× Witch |
| 7 | The Coven | 3× Golem, 4× Demon, 2× PumpkinKing, 3× Vampire, 4× Ghost |
| 8 | The Final Night | 2× PumpkinKing, 4× Demon, 2× Golem, 2× Witch, 2× Vampire, 4× Ghost, 6× Skeleton |

Spawn escalonado 0.65 s; máximo concurrente 26. Puntuación por baja:
Skeleton/Ghost 10 · Mummy/Scarecrow 15 · Witch/Vampire/Frankenstein 20 ·
Demon 25 · Golem 35 · PumpkinKing 50.

### 11.3 Monstruos (servidor)

| Tipo | HP | Vel. (m/s) | Daño | Tipo | Alcance | Cooldown | Altura render |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Skeleton | 40 | 2.6 | 8 | melé | 2.0 m | 1.2 s | 1.9 m |
| Mummy | 80 | 1.9 | 12 | melé | 2.0 m | 1.3 s | 2.0 m |
| Frankenstein | 130 | 1.6 | 18 | melé | 2.2 m | 1.5 s | 2.1 m |
| Golem | 220 | 1.25 | 32 | roca | 19 m | 3.2 s | 2.6 m |
| Demon | 95 | 2.4 | 16 | fuego (cono) | 8.5 m | 2.6 s | 2.0 m |
| Scarecrow_Feet | 85 | 2.3 | 12 | melé | 2.1 m | 1.2 s | 2.0 m |
| Ghost | 45 | 3.6 | 10 | melé rápido | 1.8 m | 0.9 s | 1.8 m |
| Witch | 60 | 2.1 | 10 | ácido | 16 m | 2.6 s | 1.8 m |
| Vampire | 75 | 2.9 | 12 | ácido | 14 m | 2.2 s | 1.9 m |
| PumpkinKing | 160 | 1.9 | 18 | ácido | 20 m | 3.0 s | 2.4 m |

IA: objetivo = jugador vivo más cercano (o el coche si es quien conduce y está
más cerca en su lugar). Melé: chase hasta alcance; ácido: mantener 9–13 m
(retroceder si está más cerca, avanzar si está más lejos) y lanzar. El Demon
mantiene ~6 m (70 % de su alcance) y escupe el cono de fuego desde la boca. El
Golem mantiene ~12 m (62 % de su alcance) y lanza rocas; si el jugador se le
acerca demasiado retrocede mientras recarga. Separación radial (mín. 0.9 m).
Contención por polígono.

**Aliento de fuego (Demon)**: cono de `DEMON_FIRE_RANGE = 8.5 m` y semiángulo
`DEMON_FIRE_HALF_ANGLE = 0.36 rad` (~20.6°), origen en la boca
(`DEMON_FIRE_MOUTH_HEIGHT = 1.56 m` sobre los pies + 0.45 m al frente). Dura
`DEMON_FIRE_DURATION_MS = 950 ms`, reparte el daño en ticks de
`DEMON_FIRE_TICK_MS = 320 ms` (6 + 5 + 5 = 16 HP; el primer tick absorbe el
resto del redondeo) y se reorienta hacia el objetivo vivo
mientras está activo. Solo daña si `|player.y − monster.y| ≤
DEMON_FIRE_VERTICAL_REACH` (6 m): el cono se reorienta en 3D y sube por la
rampa, así que alcanza de sobra la plataforma de los miradores (~3.46 m); el
límite solo protege tejados muy altos. El servidor publica el cono en
`mg5-positions.breaths` y el evento `fire-breath`; el cliente lo dibuja con
`FireBreath.svelte` (shader procedural de llama + núcleo, chispas y
`PointLight`). El cliente no calcula daño.

**Roca de lava (Golem)**: `GOLEM_ROCK_RANGE = 19 m`, `GOLEM_ROCK_DAMAGE = 32`,
`GOLEM_ROCK_COOLDOWN_MS = 3200`, gravedad `GOLEM_ROCK_GRAVITY = 12` y vuelo
`clamp(distancia / GOLEM_ROCK_SPEED, 0.55, 1.45)` s. El origen está en la mano
(pies + 2.05 m, 0.55 m al frente) y la parábola apunta a la **posición
anticipada** del objetivo (`targetX/Z` = posición + `GOLEM_ROCK_TARGET_LEAD`
× velocidad × vuelo; `targetY` = pies + 0.9 m, acotada a `ARENA_FLOOR_Y + 6`),
así que correr en línea recta no esquiva y hay que cambiar de dirección tras
el lanzamiento. Cada tick se barre el tramo recorrido contra la cápsula del
jugador (`GOLEM_ROCK_SWEEP_RADIUS = 0.7 m` + cuerpo) y el impacto se resuelve
ahí si lo atraviesa. Al romperse: daño en `GOLEM_ROCK_IMPACT_RADIUS = 2 m` con
`GOLEM_ROCK_VERTICAL_REACH = 2.6 m`, también al coche. Por cada jugador
alcanzado se emite `rock-hit {playerId, x, y, z, dx, dz}` con la dirección de
vuelo normalizada. El servidor **no** mueve la posición autoritativa por el
empuje: `PlayerCollider.svelte` consume `minigame5.knockback` y aplica
`GOLEM_ROCK_KNOCKBACK_SPEED = 10 m/s` horizontal +
`GOLEM_ROCK_KNOCKBACK_LIFT = 6.2 m/s` vertical con amortiguación
`GOLEM_ROCK_KNOCKBACK_DAMPING = 2.6`; el desplazamiento resultante se reporta
a 10 Hz como cualquier movimiento. La roca se dibuja con `RockProjectile.svelte`
(shader de lava: basalto, vetas, fresnel, halo y `PointLight`) y su rotura con
la paleta `rock` de `WaveExplosion.svelte`.

**Altura y escaleras (2.5D)**: el servidor no usa navmesh. Cada tick muestrea
la altura caminable en `(x, z)`; `MONSTER_MAX_STEP = 0.35 m` deja subir la
rampa de un mirador (~0.12 m/tick) y bloquea muros de 3 m. `MONSTER_CLIMBS`
describe las dos rampas y sus plataformas; `climbWaypoint()` lleva al monstruo
de melé al pie de la rampa, arriba, o rodea la torre si viene por detrás. Un
monstruo a ras de suelo nunca adopta la altura de la plataforma, así que no se
teletransporta. El daño es vertical: melé ≤ 1.6 m y granada ≤ 2.5 m. El ácido
resuelve la parábola contra la altura real del objetivo y estalla allí; el
charco queda en esa superficie y solo daña a ≤ 1.4 m de ella. La roca del Golem
también apunta a `targetY`, así que puede impactar en la rampa o en la
plataforma de un mirador. El aliento de
fuego es un cono 3D con ≤ 6 m de diferencia vertical. Un jugador fuera del
polígono se recorta al borde y sigue siendo objetivo y recibiendo daño.

### 11.4 Armas

| Arma | Daño | Cadencia | Alcance | Cargador | Reserva | Notas |
| --- | --- | --- | --- | --- | --- | --- |
| Rusty Pistol | 12 | 6/s | 55 m | 12 | ∞ | Inicial |
| Shotgun | 8×6 | 0.9/s | 20 m | 6 | universal | Dispersión ±7° |
| SMG | 9 | 11/s | 42 m | 30 | universal | Automática |
| Hunting Rifle | 46 | 1.5/s | 130 m | 5 | universal | Precisión |

Munición universal inicial: 60; packs de +50. Recarga con `R` o auto al
fallar vacío (si hay reserva universal; la pistola nunca recarga).

**Inventario (ranuras fijas)**: `1` pistola oxidada · `2` escopeta · `3`
subfusil · `4` rifle de caza. Al recoger un arma se guarda en su ranura con el
cargador lleno y se equipa; la anterior no se pierde. Cada ranura conserva su
propio cargador y todas comparten la reserva universal (la pistola muestra `∞`).
El HUD dibuja la barra en el centro inferior (estilo PUBG) con nombre y munición
de cada ranura; las teclas `1`–`4` o un clic/toque equipan el arma.

**Modelos GLB de las armas** (`WEAPON_MODEL_BY_ID`, ya en `static/`):

| `Mg5WeaponId` | GLB | Nodo de boca |
| --- | --- | --- |
| `pistol` | `weapons/pistol.glb` | `WPN_Pistol_Muzzle.002` |
| `shotgun` | `weapons/shotgun.glb` | extremo de `WPN_Shotgun_Barrel.001` |
| `smg` | `weapons/mp5.glb` | `WPN_MP5_Muzzle.001` |
| `rifle` | `weapons/sniper_rifle.glb` | extremo de `WPN_Sniper_Barrel.001` |

- `heldWeapon.ts` devuelve el grupo con la primitiva actual mientras el GLB
  carga y lo sustituye por un clon del modelo cuando resuelve; el nombre
  `HeldWeapon_<id>` y el `BarrelTip` se conservan para que las trazadoras
  locales y remotas salgan del cañón.
- Orientación: cañón a **+Z** local, escala uniforme por arma (pistola
  ≈ 0.35–0.45 m; SMG ≈ 0.6 m; escopeta/rifle ≈ 0.85–1.0 m) y empuñadura en
  `handR`. No se toca el rig ni el material de las skins.
- Son solo presentación: no hay colliders ni cambios en daño, cadencia,
  alcance, cargador o pickup. Si el GLB falla, la primitiva sigue disponible.

### 11.5 Drops (al morir un monstruo)

| Drop | Probabilidad | Efecto | Modelo |
| --- | --- | --- | --- |
| Granada | 22 % | +2 granadas (máx. 6) | `props/grenade.glb` |
| Shotgun | 18 % | Equipa escopeta | `weapons/shotgun.glb` |
| SMG | 16 % | Equipa subfusil | `weapons/mp5.glb` |
| Munición | 14 % | +50 munición universal | `props/ammo_kit.glb` |
| Hunting Rifle | 10 % | Equipa rifle | `weapons/sniper_rifle.glb` |
| Botiquín | 12 % | +40 HP | `props/med_kit.glb` |
| Nada | 8 % | — | — |

Despawn 45 s; pickup 1.6 m. El drop flota y gira con halo en el suelo; el GLB
se escala a ~0.35–0.55 m y se comparte desde una caché, sin colliders.

### 11.6 Mapeo monstruo → skin (reutiliza `SkinCharacter`)

`skeleton→skeleton · mummy→mummy · frankenstein→frankenstein · golem→golem ·
demon→demon · scarecrow→crow-warden · ghost→ghost · witch→witch ·
vampire→vampire · pumpkin-king→pumpkin-king`.

Los monstruos usan el mismo rig y materiales que las skins de jugador; no se
crean componentes de modelo nuevos, solo un wrapper con la altura por tipo y la
lógica de clips por estado.

### 11.7 Protocolo (resumen)

Cliente → servidor: `mg5-position {x,y,z,yaw}` · `mg5-shoot {weapon, ox,oy,oz,
dx,dy,dz}` · `mg5-throw {gx,gy,gz, dx,dy,dz}` · `mg5-car-enter {}` ·
`mg5-car-exit {}` · `mg5-car-state {x,y,z,qx,qy,qz,qw,vx,vy,vz,speed,steering}`
· `mg5-reload {}` · `mg5-equip {slot}`.

Servidor → cliente: `mg5-state {state}` · `mg5-positions {at, players,
monsters, projectiles, grenades, rocks, breaths, car?}` · `mg5-event {event}`
(`player-joined`, `wave-started`, `monster-spawned`, `monster-died`,
`drop-picked`, `grenade-exploded`, `acid-thrown`, `acid-impact`, `fire-breath`,
`rock-thrown`, `rock-impact`, `rock-hit`,
`player-hurt`, `player-downed`, `player-revived`, `car-destroyed`,
`wave-cleared`, `shot-fired`, `victory`, `defeat`) ·
`go-lobby` (reutilizado) · `error`.

`rock-hit` lleva `playerId`, `x/y/z` del jugador y `dx/dz` normalizados; el
cliente del jugador alcanzado lo usa para el empuje y el resto solo ve el
movimiento reportado. `rock-thrown` lleva `monsterId`/`monsterKind` para el
clip `*_throw`; `rock-impact` lleva el punto de rotura para la explosión.

`Mg5Snapshot`: `{ phase, serverTime, wave, totalWaves: 8, endsAt,
intermissionEndsAt, monstersRemaining, teamScore, players[], monsters[],
pools[], drops[], car }`.

### 11.8 Decisiones y notas

- **`minigame-5`, no `minigame-4`**: el id 4 está ocupado por Roadmap (el
  usuario lo llamó “minijuego 4”; el spec y la UI lo nombran “Barn Siege”).
- **Partida al aire libre en `barnsiege.glb`**: no hay asset de interior del
  granero; la muralla y el polígono hacen de arena, y el granero/silo/ruina
  son obstáculos con colisión del propio mapa.
- **Servidor autoritativo, sin driver**: a diferencia de la cripta (un cliente
  conduce la física de las momias), aquí la IA es 2D en el servidor y los
  clientes interpolan; los monstruos llevan colliders cinemáticos solo para
  bloquear al jugador.
- **Sin daño amigo**: granadas y ácido solo dañan monstruos (y el ácido también
  al coche). Coherente con el espíritu co-op y con SPEC-018.
- **El coche es consumible del match**: 600 HP, sin respawn, chatarra al
  destruirse; la entrada/salida usa `E` como SPEC-014.
- **El Golem lanza rocas, no melé**: la roca apunta a la posición anticipada
  del jugador (correr en recta no esquiva; cambiar de dirección sí), barre su
  cápsula en vuelo, daña en 2 m y lo lanza por los aires si acierta. El empuje
  se aplica en el cliente (el servidor no simula el vuelo del jugador) y se
  comunica con `rock-hit`; el shader de lava es puramente visual y no afecta
  al daño.
- **Revive entre oleadas**: 50 HP al limpiar la oleada; en mitad de la oleada
  no (mantiene la tensión).
- **Clips nuevos cableados**: aim para combatir, `HR_injured`, `HR_heal`;
  `HR_carry/HR_throw` reservados (lanzar granada usa `HR_throw`). Los clips
  `HR_aim`, `HR_walk_aim`, `HR_run_aim` y `HR_crouch_aim` son locomoción y van
  en bucle; disparar **no** reproduce `HR_shoot` (clip sin arma que parece
  `HR_attack`): el disparo se lee por trazadora, fogonazo y chispa de impacto.
- **Skins = monstruos**: los remotos y los monstruos comparten `SkinCharacter`;
  añadir un monstruo nuevo = una entrada en `SKINS` + una fila en §11.2/11.3.
- **`backend/` intacto**: la sala vive en rooms de RUN.world.
- **Cámara**: se mantiene la tercera persona; sin cambios de cámara en esta
  versión. El rayo de `camera.getWorldDirection()` **no** sirve como dirección
  de disparo: con el hombro a 0.9 m y `phi 0.16` se desvía lateralmente y apunta
  al suelo. El cliente hace asistencia de puntería sobre el monstruo bajo el
  punto de mira y dispara desde la boca del arma hacia su centro.
- **Estado en memoria**: como la cripta y la carrera; si el room se reinicia,
  la partida se pierde y los jugadores vuelven al hub al reconectar.
- **El `E` de coche y el checkpoint**: dentro de la arena no existe el sensor
  de checkpoint; `E` prioriza el coche a ≤ 2.5 m.

## 12. Progreso

| Fecha | Estado | Nota |
| --- | --- | --- |
| 2026-11-03 | borrador | Spec creado tras medir `map.glb` (área 3), inventariar los GLB nuevos de `blender/exports/` y fijar las decisiones con el usuario (`minigame-5`, 8 oleadas, co-op 12, coche, drops, ácido). |
| 2026-11-03 | en-progreso | Implementación completa (fases 0–6) y **deploy 1.15.0 a Review (aprobada) y Public**. Verificado headless: `waves:check`, `svelte-check`, `prettier`, `build` (rooms compiladas en `dist/server-bundle.js`), smoke tests del motor en Bun (oleada completa con bajas reales, derrota por horda, sala vacía→idle, granada con espoleta de proximidad) y arranque del build de producción en Chromium headless. Pendiente: pasada en navegador con 2 clientes y revisión de FPS con 12 jugadores. |
| 2026-11-03 | en-progreso | **Deploy 1.15.1 a Public** con las correcciones de la pasada en producción. **1.15.2 en Review** (movimiento libre durante la cuenta atrás); pendiente de aprobación para Public. |
| 2026-11-03 | en-progreso | Corrección de los bugs reportados en producción: GLB de monstruos reexportados con curvas reales (ya no salen en T-pose), spawn de jugadores movido al claro este (lejos del portal del granero), eliminado el teletransporte periódico del cliente que devolvía al jugador a su posición inicial, coche a `y=1.40` (ya no aparece bajo el suelo), grupos de colisión de monstruos para no chocar con el coche, cuenta atrás de 30 s y arma visible en la mano. Verificado `check`, `lint`, `waves:check`, `map:check` y `build`. |
| 2026-11-03 | en-progreso | **Deploy 1.15.3 a Review**: los raycasts de las ruedas del coche filtran el grupo de los monstruos (`updateVehicle(dt, EXCLUDE_SENSORS, collisionGroups)`), así el vehículo ya no se engancha en sus colisiones. Public, Review y Private quedan en 1.15.3. |
| 2026-11-03 | en-progreso | **Deploy 1.15.4**: el arma se engancha al hueso real (`handR`; `GLTFLoader` sanea `hand.R`) y apunta al frente; los portales se eligen al telegrafiar, a ≥14 m de los jugadores vivos, y los monstruos se materializan 0.9 s antes de moverse; los monstruos quietos usan idle en vez de correr en el sitio; el clip se reinicia al cambiar de skin; cámara de asedio más cercana y sobre el hombro derecho. Verificado `check`, `lint`, `waves:check`, `map:check`, `build` y smoke en Bun de portales/materialización. Public, Review y Private en 1.15.4. |
| 2026-11-03 | en-progreso | **Deploy 1.15.5**: ventana de gracia de 300 ms entre golpes directos (`WAVES_PLAYER_HIT_GRACE_MS`), de modo que varios monstruos ya no pueden restar la vida entera en un mismo tick; los charcos de ácido siguen aplicando daño continuo. Verificado `check`, `lint`, `waves:check`, `map:check`, `build` y smoke en Bun (dos golpes a 100 ms solo aplican el primero; el tick de charco a 50 ms sí entra). **Public, Review y Private en 1.15.5.** |
| 2026-11-03 | en-progreso | **Deploy 1.15.6**: animaciones que se quedaban congeladas en la última pose. `playRigClip` ignora un clip si ya es el actual, así que al disparar en automático (pistola 6/s, subfusil 11/s) contra `HR_shoot` (0.96 s) la acción terminaba, `oneShot` no se limpiaba y el personaje quedaba clavado. `triggerOneShot` reinicia la acción si ya terminó, aplicado a disparo, granada, daño y curación; `triggerAttack` hace lo mismo en los monstruos (el fantasma ataca cada 900 ms y `HR_attack` dura 1 s). Además se deja de pedir pointer lock dentro del iframe de RUN.world (sandbox sin `allow-pointer-lock`, solo generaba errores) y se desactiva el poll de `version.json` de SvelteKit (pedía `/_app/version.json` en la raíz del dominio y devolvía 404 bajo el subpath). Verificado `check`, `lint`, `waves:check`, `map:check`, `build` y que una acción `LoopOnce` terminada se reinicia con `reset().play()`. |
| 2026-11-03 | en-progreso | **Deploy 1.15.7**: cierre de los dos caminos de congelación que quedaban. Los avatares remotos solo recibían animación cuando cambiaba el clip, así que al mantener el disparo se quedaban clavados en la última pose de `HR_shoot`; ahora cada gesto se reemite y `replayRigClip` reinicia el one-shot terminado, con un contador de revisión por jugador para no reiniciar a los demás avatares cuando emite otro. Los monstruos rápidos reinician siempre su ataque al recibir un nuevo evento (antes solo si la acción ya había terminado, y el fantasma podía quedar bloqueado entre el final del clip y el siguiente golpe). Verificado `check`, `lint`, `waves:check`, `map:check` y `build`. **Public, Review y Private en 1.15.7.** |
| 2026-11-03 | en-progreso | **Corrección del combate + deploy 1.15.8 a Private y Review** (Public sigue en 1.15.7 hasta aprobar el review): el clic izquierdo no mataba monstruos. Tres causas: (1) solo se disparaba al soltar el botón dentro de 350 ms, así que apuntar con calma perdía el disparo; ahora se dispara en `pointerdown` y mantener pulsado sostiene las automáticas. (2) La cámara de asedio está sobre el hombro derecho (radio 6.5, `shoulder 0.9`, `phi 0.16`) y disparar con `camera.getWorldDirection()` desde el ojo desviaba el rayo ~0.9 m a la izquierda del punto de mira y lo hundía bajo el suelo (el servidor rechaza impactos por debajo de `ARENA_FLOOR_Y - 0.2`); se añade asistencia de puntería: se busca el monstruo bajo el punto de mira (radio 1.0 m) y el disparo converge desde la boca del arma al centro de su cuerpo. Verificado headless en Bun contra el motor autoritativo: 6/6 monstruos alcanzados a 14–22 m. (3) En la oleada cada disparo reproducía `HR_shoot`, un clip de cuerpo entero sin arma que parece `HR_attack` y saca al avatar de la pose de puntería; ahora el combate se queda en `HR_aim`/`HR_walk_aim`/`HR_run_aim`/`HR_crouch_aim` y el disparo se comunica con trazadora, fogonazo y chispa de impacto. Los clips de puntería entran en `LOOPING` (antes los remotos se quedaban congelados en la última pose). Se añade marcador de impacto en el HUD (150 ms), `monster-hit` lleva las coordenadas del impacto y `MONSTER_RADIUS` sube de 0.55 a 0.7 m para absorber la interpolación. Verificado `check`, `lint`, `waves:check`, `predeploy` (0 críticos) y `build`; falta la pasada en navegador (requiere login de Google). |
| 2026-11-04 | en-progreso | **Deploy 1.15.9** (Private y Review; Público tras el review): seguía sin hacerse daño a las momias aunque el arma disparaba. La prueba de puntería era 3D contra un punto a la altura del pecho: apuntar a la cabeza o a los pies —lo natural— la hacía fallar y el disparo de reserva seguía el rayo de cámara, que cae al suelo unos metros delante. Ahora la asistencia mide la distancia **horizontal** al punto de mira (1.4 m), contra la posición que se está renderizando (no la última muestra, 200 ms por delante), y sin objetivo dispara recto a la altura del ojo. Además el cliente envía `targetId` (el monstruo bajo la mira) y el servidor lo bloquea si sigue vivo, está delante y dentro del cono: un impacto visible ya no se pierde por el retardo de red. `MONSTER_RADIUS` sube a 0.9 m y, si el cargador está vacío, el arma recarga sola en vez de dibujar trazadoras sin daño. Se añade telemetría temporal en el room (`[waves] shots received/locked/hits/damage/rejected`) para confirmar desde `rundot rooms logs` si los mensajes llegan y por qué se rechazan. Verificado `check`, `lint`, `waves:check` y `build`. |
| 2026-11-03 | en-progreso | **Deploy 1.15.12** (Private y Review; Public en 1.15.11, mismo build): granadas apuntables y efectos nuevos. La granada ya no sale siempre en el mismo arco de ~21 m: el cliente calcula el punto del suelo bajo la mira (intersección del rayo de cámara con `ARENA_FLOOR_Y`, limitada a 4–34 m) y envía `tx/tz`; el servidor recorta al arena y resuelve la parábola (`flight = clamp(0.55 + distancia/22, 0.55, 1.6)`, `vy = (suelo − y)/flight + g·flight/2`) con fusible de seguridad tras el aterrizaje. Se añade `WaveThrowMark`, un anillo aditivo en el punto de caída. `WaveExplosion` se reescribe: bola de fuego en dos capas, doble onda expansiva, chispas con gravedad y humo, todo aditivo; `GrenadeProjectile` aporta cuerpo giratorio con banda emisiva y mecha. El ácido usa `ShaderMaterial` procedural (venas animadas + fresnel pulsante) en `AcidProjectile` y otro en `WavePool` (burbujas, remolino y borde suave). Los eventos `acid-impact`/`grenade-exploded` siguen disparando las explosiones. Verificado `check` (0/0), `lint`, `waves:check` y `build`. **Deploy 1.15.13** (Private y Review; Public en 1.15.12): la explosión añade un `PointLight` con caída cuadrática (48 de intensidad, 16 m de alcance en la granada) para que el fogonazo ilumine de verdad el suelo y los monstruos cercanos. |
| 2026-11-04 | en-progreso | **Inventario de armas (ranuras 1–4)**: las armas recogidas ya no se pierden al cambiar. El servidor guarda el cargador de cada arma poseída (`inventory` en `Mg5PlayerState`), el pickup rellena su ranura y equipa, y el nuevo mensaje `mg5-equip {slot}` cambia de arma validando propiedad/fase. El HUD muestra una barra estilo PUBG en el centro inferior con nombre y munición de cada ranura; las teclas `1`–`4`, el teclado numérico y un clic/toque en la barra equipan. Verificado `check`, `prettier` de los archivos tocados, `waves:check`, `build` y un smoke en Bun (recoger escopeta/rifle, cambiar de ranura y conservar cargadores). |
| 2026-11-04 | en-progreso | **Disparos de jugadores remotos visibles**: el motor emite `shot-fired {playerId, weapon, origin, dir}` únicamente para disparos aceptados; el cliente lo consume y dibuja trazadora + fogonazo desde el arma del remoto (sin duplicar el disparo local). Los avatares remotos montan el arma equipada en el hueso de la mano y la actualizan con el snapshot. Verificado `check` (0/0) y smoke en Bun del evento `shot-fired`. |
| 2026-11-04 | en-progreso | **Deploy 1.17.0 aprobado y `Public` en 1.17.0**: nueva arena `barnsiege.glb` con spawns en la plaza, coche en `(6.5, 1.5, -1.5)`, seis portales, 40 colliders y animaciones de molino/zepelín/pancarta/espantapájaros; checkpoint de entrada movido al frente sur del granero en `(-41.6, 0.4, 32.6)`. Verificados `check`, `lint`, `map`, `crypt`, `race`, `roadmap`, `waves`, `barnsiege`, `audio`, `build` y `predeploy` (0 críticos). |
| 2026-11-04 | en-progreso | **Checkpoint movido al frente del granero**: estaba detrás (norte, `z = 46.3`), donde no se ve la puerta. Se coloca delante de la puerta sur, en `(-41.6, 0.4, 32.6)` (radio 2), y `WAVES_EXIT`/`WAVES_ENTRY` se alinean con ese punto. Verificado `check`, `lint` y `waves:check`. |
| 2026-11-04 | en-progreso | **Nueva arena `barnsiege.glb`**: la partida deja el área 3 de `map.glb` y se juega en la aldea amurallada `frontend/static/barnsiege.glb`. El checkpoint físico “Barn Siege” sigue en el mapa global en `(-41.6, 0.4, 32.6)`, delante de la puerta sur del granero; al entrar, `sceneState.active` pasa a `barnsiege` y solo se renderiza ese mapa. Se recolocan los 12 spawns de jugadores en la plaza (`x ∈ {-6,-2,2,6}`, `z ∈ {-6,-2,2}`), el coche en `(6.5, 1.5, -1.5)` con `yaw = π` y los 6 portales en el anillo interior (`gate`, `barn`, `farmhouse`, `fields`, `giant-pumpkin`, `silo`). Nuevo polígono de 16 vértices (radio ≈ 37.5, 4306 m²), **ampliado después a todo el recinto (±56.5, 9772 m²) y a 30 puntos de aparición**. `BUILDING_BLOCKS` del motor adaptados a granero/silo/ruina/lago/pozo/carro. Físicas: 40 colliders (80 500 triángulos) con todo el atrezo sólido; se excluyen zepelín, pancarta, espantapájaros, agua/plantas, campos, caminos y carteles. Animaciones del GLB en bucle (`BS_WindmillSpin`, `BS_ZeppelinDrift`, `BS_BannerWave`) y balanceo idle procedural para los dos espantapájaros. Verificado `barnsiege:check`, `waves:check`, `check` (0/0), `lint` y `build`. |
| 2026-11-04 | completado | **Hotfix del crash al entrar al asedio — deploy 1.17.1 y `Public` en 1.17.1**: 1.17.0 fallaba con `TypeError: Cannot read properties of undefined (reading 'geometry')` al cargar el mapa. Causa: el `barnsiege.glb` de 1.17.0 tenía los dos espantapájaros apuntando a la **misma malla** (`BS_Scarecrow_Field`, mesh 36); el CLI de `@threlte/gltf` generó referencias a `BS_Scarecrow_Field_17`, pero three reutiliza la malla cacheada y nunca crea ese nodo. El GLB corregido renombra el segundo espantapájaros a `BS_Scarecrow_Field_B` (malla 54 propia), se regeneró `Barnsiege.svelte` y se reconstruyó `dist`/`.build`. Verificado `barnsiege:check`, `waves:check`, `build` y las 269 referencias `gltf.nodes.*` contra los nombres reales del GLB cargado con three (0 faltantes). Deploy 1.17.1 aprobado y publicado; el chunk servido por el CDN no contiene `_17` y coincide byte a byte con `dist`. Room `J5DDV5` (1.17.0, 2 jugadores) cerrada. El upload fallaba al 100% por `HTTP_PROXY`; se desplegó sin proxy. |
| 2026-11-04 | completado | **Lag y bloqueo en el spawn del asedio**: entrar a `barnsiege` congelaba el juego y el jugador no podía moverse de la plaza; al morir el lag desaparecía porque `playerRuntime.frozen` saltaba la consulta del controlador. Medido: `computeColliderMovement` tardaba 190–1042 ms por frame en la plaza y `world.step()` solo 0,1 ms. Causa: los `AutoColliders` del modo `inject` duplicaban los buffers de vértices (la segunda mitad era geometría de una malla hermana elevada en Y), inflando los AABB hasta 136 m. Se añade el modo genérico `chunked` (`ChunkedColliders.svelte` + `collision.chunkSize`): parte la geometría visual en celdas XZ de 16 m y crea un trimesh por celda. Barn Siege pasa a 68 celdas / 80 644 triángulos. Verificado en Chromium: controlador 0,1–1,1 ms, caída al suelo correcta (`y=1,509`), paredes siguen bloqueando y el jugador camina 5,9 m en 1,5 s; 60 fps sin `&physics` (el flag de debug dibuja los 111 k triángulos y baja a ~20 fps, no representa el juego real). `check` 0/0, `barnsiege:check` OK. |
| 2026-11-04 | en-progreso | **Golem lanza rocas de lava**: el Golem del Granero deja el cuerpo a cuerpo y pasa a atacar a distancia con rocas balísticas (alcance 19 m, 32 de daño, recarga 3,2 s, velocidad 1,25) apuntadas a la posición del objetivo en el momento del lanzamiento, así que moverse esquiva el impacto. El impacto tiene 2 m de radio y 2,6 m de alcance vertical, daña a jugadores y al coche, y al acertar a un jugador el servidor emite `rock-hit` para que el cliente aplique el empuje (10 m/s horizontal, 6,2 m/s de elevación, amortiguación 2,6) con física local, también estando derribado o congelado. La roca usa un `ShaderMaterial` de lava (basalto, vetas animadas, fresnel, halo aditivo y `PointLight`) y la explosión de impacto tiene paleta propia. Verificado `waves:check`, `waves:terrain`, `waves:fire`, `waves:rock`, `check` 0/0, `lint` y `build`. |
| 2026-11-04 | en-progreso | **HUD y overlays en inglés**: se revierte la traducción al español de la interfaz del asedio. Armas (`Rusty Pistol`, `Shotgun`, `SMG`, `Hunting Rifle`), oleadas (`Cornfield Skeletons`, `The Undead`, `Bandages and Bones`…), HUD (team, left, Health, Downed, Empty, Grenades, Pumpkin Car), overlays (Hold the Farm, Wave cleared, Victory, The farm has fallen…), botones táctiles (Fire/Grenade/Reload) y `aria-label`/`title` vuelven a estar en inglés. Verificado `check` 0/0, `lint` y `build`. |
| 2026-11-05 | en-progreso | **Ataques a distancia contra jugadores elevados y aparición en todo el recinto**: el ácido y el fuego no alcanzaban a quien estaba en la rampa o el mirador. El ácido ahora resuelve la parábola exacta contra la altura real del objetivo (`targetY`) y estalla allí; el fuego del Demon sube su alcance vertical a 6 m porque el cono se reorienta en 3D. Además, los monstruos aparecen en 30 puntos repartidos por todo el suelo (antes 6 portales) y se elimina la inmunidad de `outsideArena`: salir solo recorta al borde y el jugador sigue siendo objetivo. `BUILDING_BLOCKS` se mueve a `wavesConfig.ts` para que `waves:check` valide los spawns contra los mismos obstáculos que la IA. Verificado `waves:check` (43 puntos, ninguno dentro de edificios), `waves:terrain`, `check` 0/0, `lint` y `build`. |
| 2026-11-11 | en-progreso | **Muzzle real y sangre en los monstruos**: las trazadoras locales y remotas salen del `BarrelTip` del arma visible (`heldWeapon.ts`) en lugar de la altura de la cabeza, con el estimado de hombro como reserva si el rig no expone la mano. Cada `monster-hit` del jugador local dibuja una salpicadura procedural (`BloodHit.svelte`) en el punto de daño, con mancha irregular y gotas con gravedad. Verificado `check` 0/0, `lint` de los archivos tocados, `waves:check`, `dm:match` y `build`. |
| 2026-11-13 | en-progreso | **Modelos GLB de armas y kits**: `weaponModels.ts` cachea con `GLTFLoader` + `DRACOLoader` y `heldWeapon.ts` sustituye la primitiva por el arma real (`pistol`, `shotgun`, `mp5`, `sniper_rifle`) conservando `BarrelTip`; `WaveDrop.svelte` usa `ammo_kit`, `med_kit`, `grenade` y los modelos de arma; `WaveSession` precarga durante la cuenta atrás. Verificado `check` 0/0, `assets:check` y `build`. |


## 13. Changelog

- 2026-11-03 — Creación del spec.
- 2026-11-03 — Respuestas del usuario integradas: `minigame-5`, arena en el
  área 3 del `map.glb` (cambiable más adelante), 8 oleadas sin límite de
  tiempo con victoria/derrota, revivir entre oleadas con 50 HP, coche
  calabaza aparcable con HP propio, granadas como drops, ácido en arco +
  charco, monstruos lanzadores = bruja/vampiro/Rey Calabaza, vuelta al
  granero al terminar, hasta 12 jugadores.
- 2026-11-03 — Medidas reales: polígono de `area3` (12 vértices), BBox de
  `PFM_Barn`/`PFM_Silo`/`PFM_Farmhouse`, posición de puerta y campos;
  checkpoint fijado en `(-41.60, 0.40, 46.30)` y coche en `(-34.30, 1.40,
  41.00)`.
- 2026-11-03 — Inventariados los 11 GLB con animaciones nuevas; plan de
  copia a `frontend/static/` y ampliación de `HERO_ANIMATIONS` /
  `skinAnimations`; motor, room `waves` (12 jugadores), arena, HUD, overlays y
  controles implementados y verificados (sin navegador todavía).
- 2026-11-03 — Deploy 1.15.0 a Review (aprobada) y Public con Barn Siege completo;
  `dist/rooms.config.json` incluye la room `waves` (12 jugadores).
- 2026-11-03 — **Deploy 1.15.1 a Public** (Review también actualizada) con
  las correcciones de la pasada en producción.
- 2026-11-03 — **Deploy 1.15.2 a Review** con movimiento libre durante la
  cuenta atrás de 30 s; Public sigue en 1.15.1 hasta aprobar la Review.
- 2026-11-03 — **Deploy 1.15.3 a Review**: las ruedas del coche ignoran el
  grupo de colisión de los monstruos en sus raycasts, de modo que el coche
  atraviesa la horda sin engancharse. **Public, Review y Private en 1.15.3.**
- 2026-11-03 — Correcciones de la pasada en producción: los 10 GLB de monstruo
  se reexportaron con las pistas NLA reparadas y `export_optimize_animation_size=False`
  (antes cada clip quedaba en 2 keys STEP idénticas y el personaje se veía en
  T-pose); spawn de jugadores trasladado al claro este de la arena; se quitó el
  snap periódico cliente→snapshot (a 1 Hz provocaba un bucle de teletransporte);
  coche del minijuego a `y=1.40` para que el chasis no quede enterrado; los
  monstruos usan el grupo de colisión 4 y no colisionan con el coche; cuenta
  atrás reducida a 30 s; arma procedural visible en `hand.R`.
- 2026-11-03 — Correcciones durante la verificación: la pistola recarga desde
  su reserva infinita (sin esto quedaba inutilizable a los 12 disparos);
  granadas con espoleta de proximidad a monstruos (el alcance fijo dejaba la
  granada lejos del objetivo); monstruos con bloqueo deslizante contra
  granero/silo/farmhouse; la cámara adopta el perfil de coche al conducir el
  calabaza; teletransporte de cortesía en cliente si el servidor recoloca al
  jugador (p. ej. salir despedido del coche destruido); botón `Fire` táctil
  con pointer capture.
- 2026-11-03 — **Deploy 1.15.4**: el arma procedural se engancha a `handR`
  (three.js sanea `hand.R`) y se orienta al frente del personaje; los portales
  de spawn se eligen al telegrafiar, nunca a menos de 14 m de un jugador vivo,
  y el monstruo queda 0.9 s materializándose antes de poder moverse o atacar;
  los monstruos usan `HR_idle` cuando están quietos (antes corrían en el sitio);
  el clip activo se reinicia si cambia la skin; la cámara del asedio pasa a un
  perfil cercano (radio 6.5) sobre el hombro derecho para que se vean el arma y
  la horda. **Public, Review y Private en 1.15.4.**
- 2026-11-03 — **Deploy 1.15.5**: ventana de gracia de 300 ms entre golpes
  directos para que una horda no pueda matar al jugador en un solo tick; el
  daño continuo de los charcos de ácido no se ve afectado. **Public, Review y
  Private en 1.15.5.**
- 2026-11-03 — **Deploy 1.15.6**: se corrige el congelamiento de animaciones.
  Un one-shot que ya había terminado no se volvía a reproducir porque
  `playRigClip` descarta el clip cuando ya es el actual: al mantener el disparo
  automático el personaje quedaba clavado en la última pose de `HR_shoot`.
  Ahora `triggerOneShot` reinicia la acción terminada (disparo, granada, daño y
  curación) y `triggerAttack` hace lo mismo con los ataques de los monstruos
  (el fantasma ataca cada 900 ms con un clip de 1 s). También se evita pedir
  pointer lock dentro del iframe sandbox de RUN.world y se desactiva el poll de
  `version.json` que daba 404 bajo el subpath.
- 2026-11-03 — **Deploy 1.15.7**: los avatares remotos también se congelaban,
  porque solo recibían animación al cambiar de clip; ahora cada gesto se
  reemite y `replayRigClip` reinicia el one-shot terminado. Se añade un
  contador de revisión por jugador para que el mensaje de un jugador no
  reinicie los gestos de los demás. Los monstruos reinician siempre el ataque
  al recibir un evento, evitando que el fantasma quede bloqueado entre el
  final del clip y el siguiente golpe.
- 2026-11-03 — **Corrección del combate del asedio**: el clic izquierdo dispara
  en `pointerdown` (antes exigía soltar en menos de 350 ms) y las armas
  automáticas siguen disparando mientras se mantiene pulsado. Se añade
  asistencia de puntería que selecciona el monstruo bajo el punto de mira y
  hace converger el disparo desde la boca del arma al centro de su cuerpo,
  porque la cámara sobre el hombro desviaba el rayo ~0.9 m y lo hundía bajo el
  suelo. Se deja de reproducir `HR_shoot` en la oleada (es un clip sin arma que
  parecía `HR_attack` y rompía la pose de puntería) y se añaden trazadoras,
  fogonazo, chispas y marcador de impacto; los clips `HR_*_aim` pasan a
  `LOOPING` para que los remotos no se congelen. `monster-hit` incluye el punto
  de impacto y `MONSTER_RADIUS` sube a 0.7 m. Verificado headless en Bun
  (impactos a 14–22 m), `check`, `lint`, `waves:check` y `build`. **Deploy
  1.15.8 a Private y Review**; Public permanece en 1.15.7 hasta aprobar el
  review.
- 2026-11-04 — **Deploy 1.15.9** (Private y Review; Público tras el review).
  Los disparos seguían sin matar momias. La asistencia de puntería medía en 3D
  contra un punto a la altura del pecho, así que apuntar a la cabeza o a los
  pies la hacía fallar; el disparo de reserva seguía el rayo de cámara desde el
  ojo y caía al suelo. Ahora la comprobación es horizontal (1.4 m) contra la
  posición renderizada y, sin objetivo, se dispara recto a la altura del ojo.
  El cliente manda `targetId` (el monstruo bajo la mira) y el servidor lo
  bloquea si sigue vivo, delante y dentro del cono, de modo que el retardo de
  red (~200 ms) no descarta un impacto visible. `MONSTER_RADIUS` sube a 0.9 m y
  el arma recarga sola al vaciar el cargador (antes el cliente dibujaba
  trazadoras con el cargador vacío y el servidor descartaba los disparos en
  silencio). Se añade telemetría temporal en el room
  (`[waves] shots received/locked/hits/damage/rejected`) para confirmar desde
  `rundot rooms logs` si los mensajes llegan y por qué se rechazan. Verificado
  `check`, `lint`, `waves:check` y `build`.
- 2026-11-03 — **Deploy 1.15.12** (Private y Review; Public en 1.15.11, mismo
  build). Granadas apuntables: el cliente calcula el punto del suelo bajo la
  mira y lo manda en `tx/tz`; el servidor recorta al arena y resuelve la
  parábola para caer exactamente ahí, con un anillo (`WaveThrowMark`) que marca
  el punto de caída. Nuevos efectos: explosión con bola de fuego en dos capas,
  doble onda expansiva, chispas con gravedad y humo; granada en vuelo con
  cuerpo giratorio, banda emisiva y mecha; proyectil ácido y charco con
  `ShaderMaterial` procedural (venas, fresnel pulsante, burbujas y borde
  suave). Verificado `check`, `lint`, `waves:check` y `build`.
- 2026-11-03 — **Deploy 1.15.13** (Private y Review; Public en 1.15.12). La
  explosión emite además una luz puntual de destello (`PointLight`, caída
  cuadrática) que ilumina el suelo y los monstruos cercanos durante la
  detonación, en vez de solo dibujar encima.
- 2026-11-04 — **Inventario de armas 1–4**: las armas recogidas se guardan en su
  ranura (pistola, escopeta, subfusil, rifle) y conservan su cargador en el
  servidor; `mg5-equip {slot}` cambia de arma sin perder las demás. El HUD añade
  una barra central inferior estilo PUBG con nombre y munición de cada ranura,
  y las teclas `1`–`4` / teclado numérico / clic o toque equipan el arma.
- 2026-11-04 — **Disparos remotos visibles**: nuevo evento `shot-fired` con
  autor, arma, origen y dirección, emitido solo para disparos aceptados. Los
  demás clientes dibujan la trazadora y el fogonazo, y los avatares remotos
  llevan el arma equipada en la mano.
- 2026-11-04 — **Arena movida a `barnsiege.glb`**: el minijuego deja de jugarse
  en el área 3 de `map.glb`. El checkpoint “Barn Siege” permanece en el mapa
  global (`(-41.6, 0.4, 32.6)`, delante de la puerta sur), pero al entrar la escena activa pasa a
  `barnsiege` y solo se renderiza esa aldea. Nuevos spawns en la plaza, coche en
  `(6.5, 1.5, -1.5)`, seis portales en el anillo y polígono de 16 vértices
  (4306 m²), **luego ampliado a todo el recinto (±56.5, 9772 m²) con 30 puntos
  de aparición**. 40 colliders con físicas para todo el atrezo sólido, excluyendo
  zepelín, pancarta, espantapájaros, agua, campos, caminos y carteles; bucles
  de molino/zepelín/pancarta e idle procedural de los espantapájaros.
  Verificado `barnsiege:check`, `waves:check`, `check`, `lint` y `build`.
- 2026-11-04 — **Checkpoint de Barn Siege al frente**: se mueve de detrás del
  granero (`z = 46.3`) a la puerta sur, en `(-41.6, 0.4, 32.6)`, de modo que
  el jugador lo encuentra de frente. `WAVES_EXIT` y `WAVES_ENTRY` usan el
  mismo punto.
- 2026-11-04 — **Deploy 1.17.0** aprobado y `Public` en 1.17.0. Build verificado
  con todos los checks de mapas, `predeploy` sin críticos y sin rooms viejas
  que cerrar.
- 2026-11-04 — **Hotfix del crash al entrar en Barn Siege, desplegado en 1.17.1
  y `Public` en 1.17.1**: el GLB de 1.17.0 tenía dos nodos
  (`BS_Scarecrow_Field` y `BS_Scarecrow_Field_2`) usando la misma malla, y el
  componente generado pedía `BS_Scarecrow_Field_17`, que no existe en runtime
  porque three reutiliza la malla cacheada para el segundo nodo. El GLB
  corregido separa el segundo espantapájaros como `BS_Scarecrow_Field_B` (malla
  propia), se regeneró el componente y se reconstruyó `dist`. El chunk
  publicado en el CDN no contiene `_17` y coincide byte a byte con `dist`;
  room `J5DDV5` (1.17.0, 2 jugadores) cerrada. El deploy fallaba al 100% por
  `HTTP_PROXY`; se ejecutó sin proxy.
- 2026-11-04 — **Colisión por celdas para eliminar el lag del asedio**: el
  controlador de personaje tardaba 190–1042 ms por frame en la plaza porque
  los `AutoColliders` de `inject` generaban trimeshes con vértices duplicados
  y AABB de hasta 136 m. Se añade el modo `chunked` a `PhysicsConfig`
  (`collision.chunkSize`), el componente `ChunkedColliders.svelte` y su montaje
  en `WorldMap.svelte`; `world-inject.mjs` ya no inserta `AutoColliders` en
  este modo. `barnsiege.physics.json` pasa a `chunked` con celdas de 16 m
  (68 colliders, 80 644 triángulos). Medido en Chromium: 0,1–1,1 ms por
  consulta, caída al suelo correcta, paredes sólidas y 60 fps sin el flag de
  debug `&physics`. Verificado `check`, `barnsiege:check` y regeneración del
  componente. **Desplegado en 1.17.2 y `Public` en 1.17.2**; el chunk público
  `CWZIhlyP.js` contiene `chunkSize:16` y coincide con `dist`.
- 2026-11-05 — **Combate vertical y escaleras en Barn Siege**: los monstruos
  pegaban a través del suelo de los miradores porque melé/ácido solo medían
  `dx/dz`. Ahora melé exige ≤ 1.6 m de diferencia vertical, el charco de ácido
  ≤ 1.4 m desde su superficie y la granada ≤ 2.5 m. La contención recorta la
  posición al borde del polígono completo, pero **salir no concede inmunidad**
  (se eliminó el flag `outsideArena`: el jugador recortado sigue siendo
  objetivo y recibiendo daño). Además, los monstruos de melé suben las
  rampas de los dos miradores con altura caminable por paso
  (`MONSTER_MAX_STEP = 0.35 m`, `MONSTER_CLIMBS`, `climbWaypoint()`), rodeando
  la torre si vienen por detrás; sin objetivo en alto no se teletransportan.
  Verificado con `waves:terrain` (subida desde pie, lado y detrás de ambos
  miradores), smoke en Bun del motor (plataforma dañada al subir, fuera de la
  arena también recibe daño, suelo sigue dañando), `check` 0/0, `lint`,
  `waves:check`, `barnsiege:check` y `build`.
- 2026-11-04 — **Aliento de fuego del Demon**: el Demon deja de ser melé y
  pasa a atacar a distancia con un cono de fuego de 8.5 m y ~20.6° que sale de
  su boca (`DEMON_FIRE_MOUTH_HEIGHT = 1.56 m`), dura 950 ms y reparte 16 de
  daño en 3 ticks mientras se reorienta en 3D hacia el objetivo. Solo daña
  dentro del cono y a ≤ 6 m de diferencia vertical, así que también alcanza a
  un jugador en un mirador (~3.46 m). El servidor
  publica `mg5-positions.breaths` y el evento `fire-breath`; el cliente lo
  dibuja con `FireBreath.svelte` (shader procedural de llama y núcleo, chispas,
  fogonazo en la boca y `PointLight`). Nuevo check `waves:fire` que simula el
  ataque en Bun y verifica boca, dirección normalizada, daño por ticks,
  expiración y que el cono no alcanza por detrás. Verificado `waves:fire`,
  `check` 0/0 y `lint`.
- 2026-11-05 — **Corrección de los ataques a distancia y aparición en todo el
  recinto**: los jugadores en la rampa o en la plataforma de un mirador no
  recibían ácido ni fuego. El ácido ahora guarda origen, instante de lanzamiento
  y altura real del objetivo (`originX/Y/Z`, `launchedAt`, `flightMs`,
  `targetY`) y `updateProjectiles()` evalúa la parábola analítica: al cumplirse
  el vuelo impacta exactamente en el punto apuntado, sin quedarse corto como
  hacía la integración de Euler. El charco sigue ligado a la superficie del
  impacto. El aliento del Demon sube a `DEMON_FIRE_VERTICAL_REACH = 6 m`, porque
  el cono se orienta en 3D y debe cubrir la plataforma (~3.46 m). Los
  `MONSTER_SPAWNS` pasan de 6 portales a 30 puntos por todo el recinto, y
  `BUILDING_BLOCKS` se centraliza en `wavesConfig.ts` para que `waves:check`
  compruebe que ningún spawn cae dentro de un edificio (inflado 0.5 m). Se
  elimina `outsideArena`: todo reporte se recorta al polígono completo y el
  jugador del borde sigue siendo objetivo, así que ya no hay zona segura.
  Verificado `waves:check` (43 puntos), `waves:terrain`, smoke en Bun (ácido y
  fuego dañan a un jugador a `y = 3.46`), `check` 0/0, `lint` y `build`.
- 2026-11-04 — **Reacción de daño y HUD en español**: el servidor solo emitía
  `player-hurt` con golpes de ≥ 20, así que esqueletos (8), momias (12),
  fantasmas (10), brujas, vampiros y los ticks de fuego/ácido no reproducían
  `HR_injured`. Ahora cualquier golpe avisa al cliente; el daño continuo se
  limita a un evento cada 700 ms para no reiniciar la animación ni el sonido en
  cada tick. El HUD pasa a español y mueve el contador de granadas a la barra
  de armas, junto a las ranuras `1`–`4`, con etiqueta `[G]`, icono, cantidad y
  clic para lanzar; se elimina el panel derecho que mostraba el nombre del arma
  en inglés. Armas y oleadas usan nombres en español (`Pistola oxidada`,
  `Escopeta`, `Subfusil`, `Rifle de caza`, `Esqueletos del maizal`…), y también
  se traducen los overlays y los botones táctiles (Disparar/Granada/Recargar).
  Verificado `waves:fire` (incluye un golpe de 8 dmg), `check` 0/0, `lint` y
  `build`.
- 2026-11-04 — **Golem a distancia con rocas de lava**: el Golem del Granero
  sustituye el golpe cuerpo a cuerpo por el lanzamiento de rocas balísticas
  (19 m de alcance, 32 de daño, 3,2 s de recarga) apuntadas a la posición del
  objetivo en el instante del lanzamiento, de modo que moverse esquiva el
  impacto. El estallido cubre 2 m de radio y 2,6 m en vertical, daña a
  jugadores y coche, y al impactar en un jugador emite `rock-hit` con el
  vector de empuje: el cliente aplica 10 m/s horizontales y 6,2 m/s de
  elevación con amortiguación 2,6, también durante el derribo o la
  congelación. La roca se renderiza con un `ShaderMaterial` de lava (basalto,
  vetas animadas, fresnel, halo aditivo y `PointLight`) y `WaveExplosion`
  gana la paleta `rock`; `WaveMonster` reproduce `HR_throw` con
  `rock-thrown` y el audio usa `grenade_throw` y `hit_stone`. Se añade el
  script `waves:rock` (`bun run waves:rock`) para verificar daño, radio de
  impacto, empuje normalizado y esquiva. Verificado `waves:check`,
  `waves:terrain`, `waves:fire`, `waves:rock`, `check` 0/0, `lint` y `build`.
- 2026-11-04 — **Interfaz del asedio en inglés**: se revierte la traducción al
  español del HUD, los overlays, los botones táctiles, las armas y las
  oleadas. Armas: `Rusty Pistol`, `Shotgun`, `SMG`, `Hunting Rifle`. Oleadas:
  `Cornfield Skeletons`, `The Undead`, `Bandages and Bones`, `Fresh Meat`,
  `Stone and Fire`, `The Harvest`, `The Coven`, `The Final Night`. HUD:
  `team`, `left`, `Health`, `Downed`, `Empty`, `Grenades`, `Pumpkin Car`.
  Overlays: `Hold the Farm`, `Wave N cleared!`, `Victory!`, `The farm has
  fallen`, `You are down`, `Back to the farm`. Botones: `Fire`, `Grenade`,
  `Reload`. Los `aria-label`/`title` también pasan a inglés. Verificado
  `check` 0/0, `lint` y `build`.
- 2026-11-05 — **Recompensa de misión**: limpiar la oleada 8 registra
  `barn-8-waves` en `rw:missions:v1` y desbloquea `pumpkin-king`
  (`PumpkinKing.glb`); perder o abandonar no la concede.
- 2026-11-11 — **Muzzle real y sangre**: las trazadoras locales y remotas
  salen ahora del `BarrelTip` del arma visible (`heldWeapon.ts`) en lugar de
  la altura de la cabeza; si el rig no expone la mano se conserva el estimado
  de hombro. Cada impacto confirmado del jugador local sobre un monstruo
  dibuja una salpicadura procedural (`BloodHit.svelte`: shader de mancha +
  gotas con gravedad), además del marcador de impacto existente.
- 2026-11-11 — **Poderes contra jugadores en movimiento**: el servidor
  guarda la velocidad reportada en `onPosition` (10 Hz, descartando saltos
  imposibles) y el ácido y la roca anticipan el punto de impacto
  (`ACID_TARGET_LEAD` 0.85, `GOLEM_ROCK_TARGET_LEAD` 0.8). Además, cada tick
  barre el tramo recorrido por el proyectil contra la cápsula del jugador
  (pies → 1.9 m, radio 0.55 m + proyectil), así que correr o saltar a través
  de un poder visible ya no lo atraviesa; cambiar de dirección después del
  lanzamiento sigue esquivando. El aliento del Demon ya reorientaba el cono
  cada tick y no cambia. Nuevo `waves:aim` (`bun run waves:aim`) con
  escenarios de carrera recta, salto, quieto y cambio de dirección.
  Verificado `waves:check`, `waves:terrain`, `waves:fire`, `waves:rock`,
  `waves:aim`, `check` 0/0 y `build`.
- 2026-11-11 — **Corrección de runtime**: el arreglo anterior se había
  aplicado solo a `frontend/src/server/` (copia de referencia), así que la
  partida seguía usando el motor viejo de `backend/src/server/`. Se replica
  el fix en el backend activo (velocidad, anticipación, barrido y charco) y
  se porta también el `player-hurt` con `x/y/z` que faltaba allí para la
  sangre del Deathmatch. `bunx tsc --noEmit` en `backend/` y los scripts
  `waves:*` en verde. Regla añadida a los README de backend y de
  `frontend/src/server`.
- 2026-11-13 — **Mira de combate compartida**: la retícula pasa de un punto
  con círculo a un componente `AimCrosshair.svelte` (cuatro ticks, punto
  central y sombra para leerla sobre el cielo). `CrosshairTracker.svelte`
  reproduce el test XZ del aim assist y tiñe la mira de ámbar cuando hay un
  monstruo bajo ella; el marcador de impacto es una X diagonal animada.
  También se oculta el cursor del navegador mientras se apunta. El mismo
  componente se reutiliza en el Deathmatch (`SPEC-025`).
- 2026-11-13 — **Modelos GLB de armas y pickups implementados**: se enlazan
  los GLB de `frontend/static/weapons/` (`pistol.glb`, `shotgun.glb`,
  `mp5.glb`, `sniper_rifle.glb`) para el arma visible en la mano, y de
  `frontend/static/props/` (`ammo_kit.glb`, `med_kit.glb`, `grenade.glb`)
  para los drops. `weaponModels.ts` centraliza la carga (Draco + caché) y
  `heldWeapon.ts` cambia la primitiva por el modelo conservando `BarrelTip`;
  `WaveDrop.svelte` hace lo mismo con los drops y `WaveSession` precarga
  durante la cuenta atrás. Solo se usan las cuatro armas básicas. Los tres
  props se registran en `world/assets.json` y se comprimen con Draco
  (`assets:check` en verde).
