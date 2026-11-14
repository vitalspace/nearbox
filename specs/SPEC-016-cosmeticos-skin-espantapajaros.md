---
id: SPEC-016
titulo: "Cosméticos: desbloquear y equipar la skin del espantapájaros"
estado: completado
prioridad: media
creado: 2026-11-01
actualizado: 2026-11-14
responsable: opencode
etiquetas: [frontend, svelte, threlte, cosmeticos, skins, glb, perfil, misiones, localstorage]
depende_de: [SPEC-007, SPEC-009, SPEC-015]
bloquea: []
estimacion: "6h"
---

# SPEC-016 — Cosméticos: desbloquear y equipar la skin del espantapájaros

## 1. Contexto

La `SPEC-015` implementó el perfil local (`rw:profile:v1`), el registro de misiones (`rw:missions:v1`) y la misión `cats-25`: 25 gatos repartidos por el mapa, captura con `E`, HUD, persistencia y reinicio. Al completar la misión, el estado `completed` queda guardado en el perfil del jugador.

La respuesta del usuario a la pregunta de recompensa de la `SPEC-015` fue que, al completar los 25 gatos, el jugador debe poder portar `Scarecrow_Feet.glb`. Ese asset **no es solo unas botas**: es un personaje completo con su propio rig, materiales y animaciones, así que se decidió tratarlo en un spec aparte de cosméticos en lugar de mezclarlo con la misión.

Estado actual relevante del código:

- `frontend/src/lib/components/player/Player.svelte` monta siempre `Hero.svelte` (`/Hero.glb`) y pasa `ref`, `actions` y `mixer` a `PlayerBehaviour.svelte`.
- `Hero.svelte` carga el GLB, clona el esqueleto con `SkeletonUtils.clone`, monta los `SkinnedMesh` y expone `actions` (store de `useGltfAnimations`) y `mixer`.
- `PlayerBehaviour.svelte` traduce WASD/salto/gestos a `playerIntent`, mueve el `Group` y elige el clip: `HR_idle`, `HR_walk`, `HR_run`, `HR_jump`, `HR_sit`, `HR_attack`, `HR_shoot`, `HR_wave`, `HR_pickup`, `HR_hit`, `HR_death`. También emite el clip por WebSocket con `playerAnimations.broadcast`.
- `Player.svelte` pinta la etiqueta 3D a `y = 2.45` y oculta el modelo mientras se conduce (`visible={!driving}`).
- El perfil local ya se sincroniza entre pestañas con el evento `storage`; `playerProfile.apply()` recarga todos sus campos.
- No existe ningún catálogo de cosméticos, ninguna noción de skin equipada y ningún selector de apariencia.

Análisis del asset `blender/exports/Scarecrow_Feet.glb` (444 KB):

| Dato                        | Valor                                                                     |
| --------------------------- | ------------------------------------------------------------------------- |
| Nodos raíz                 | `Scarecrow_Feet` con traslación `(21.8, 0, 8.3)`                          |
| Esqueleto                  | `Scarecrow_Feet_Rig`, 20 huesos                                           |
| Mallas                     | 40 `SkinnedMesh` (7 mallas lógicas), 2 652 triángulos                     |
| Materiales                 | 19 (`SC_Straw`, `SC_Shirt`, `SC_Hat`, `SC_Glow`, `SC_Boot`, …)            |
| Altura                     | 3.18 m hasta la punta del sombrero; cuerpo ≈ 2.27 m                       |
| Animaciones                | `SF_idle`, `SF_walk`, `SF_run`, `SF_jump`, `SF_sit`, `SF_attack`, `SF_pickup`, `SF_hit`, `SF_death` |
| Sin equivalente            | `HR_shoot` y `HR_wave` no tienen clip en este rig                         |
| Movimiento de raíz         | Los clips son in-place: no hay desplazamiento horizontal del hueso `root` |

## 2. Objetivo

Añadir un catálogo mínimo de skins y un sistema de desbloqueo/equipado local: completar `cats-25` desbloquea de forma permanente la skin `crow-warden` (espantapájaros), el jugador puede equiparla desde ajustes o desde el banner de completado, y el jugador local se renderiza con `Scarecrow_Feet.glb` conservando movimiento, animaciones, etiqueta 3D y persistencia. Todo sin backend ni dependencias nuevas.

## 3. Alcance

**Incluye**

- Catálogo de skins con dos entradas: `hero` (por defecto) y `crow-warden`.
- Desbloqueo permanente de `crow-warden` al completar `cats-25`, persistido en `rw:profile:v1`.
- Sincronización del desbloqueo para partidas ya completadas antes de este spec.
- Equipado y desequipado local de la skin, con persistencia y sincronización entre pestañas.
- Render del espantapájaros con su rig, sus animaciones y el mismo contrato `ref`/`actions`/`mixer` que `Hero.svelte`.
- Selector «Apariencia» en `SettingsMenu.svelte` con estados bloqueada, disponible y equipada.
- Aviso de recompensa y botón `Equipar` en el banner de misión completada.
- Fallback seguro a la skin por defecto si el GLB no carga.
- Verificación de tipos, formato, build y prueba visual en navegador.

**No incluye**

- Sincronizar la skin con otros jugadores: `RemoteHero` sigue mostrando `Hero.glb` para todos. Requeriría mensajes nuevos en el protocolo.
- Backend, base de datos, inventario genérico, tienda, monedas o logros.
- Editar el GLB, retargetear animaciones nuevas o crear clips para `HR_shoot`/`HR_wave`.
- Personalización de colores o partes del espantapájaros.
- Bloquear la skin al reiniciar la misión: el desbloqueo es permanente.
- Varias skins por misión o recompensas encadenadas.
- Cambios en `backend/` o en el protocolo WebSocket.

## 4. Requisitos

### Funcionales

| ID    | Requisito                                                                                                                                          | Prioridad |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| RF-1  | Existe `frontend/src/lib/cosmetics/skins.ts` con `SkinId = 'hero' \| 'crow-warden'`, `SkinDefinition`, `DEFAULT_SKIN`, `SKINS`, `SKIN_BY_ID` e `isSkinId`. | alta      |
| RF-2  | `hero` siempre está disponible y no tiene condición de desbloqueo; `crow-warden` declara `unlockMissionId: 'cats-25'` y `modelPath: '/Scarecrow_Feet.glb'`. | alta      |
| RF-3  | `playerProfile` añade `unlockedSkins: SkinId[]` y `equippedSkin: SkinId` al perfil existente, con valores por defecto `[]` y `'hero'`.               | alta      |
| RF-4  | El perfil sigue guardándose en `rw:profile:v1`; los perfiles antiguos sin los campos nuevos se leen con los valores por defecto, sin migración destructiva. | alta      |
| RF-5  | Al leer el perfil se descartan IDs de skin desconocidos y duplicados; si `equippedSkin` no está desbloqueada, se usa `'hero'`.                        | alta      |
| RF-6  | Existe un store `cosmetics` con `equippedSkin`, `isUnlocked(id)`, `equip(id)`, `init()`, `syncUnlocks()` y `rewardForMission(missionId)`.              | alta      |
| RF-7  | `syncUnlocks()` desbloquea `crow-warden` si `cats-25` está completada; es idempotente y no escribe si ya estaba desbloqueada.                        | alta      |
| RF-8  | La sincronización se ejecuta al arrancar (partidas ya completadas) y cuando la misión pasa a completada en la sesión actual.                          | alta      |
| RF-9  | Desbloquear una skin no la equipa automáticamente.                                                                                                 | media     |
| RF-10 | `equip(id)` solo equipa skins conocidas y desbloqueadas; devuelve `false` y no cambia nada en caso contrario.                                         | alta      |
| RF-11 | Reiniciar `cats-25` no vuelve a bloquear la skin: `resetMission()` no toca `unlockedSkins` ni `equippedSkin`.                                         | alta      |
| RF-12 | Los cambios de skin o desbloqueo en otra pestaña se aplican vía `storage` sin recargar.                                                             | media     |
| RF-13 | `Player.svelte` renderiza la skin equipada y usa `Hero.svelte` cuando es `hero`.                                                                    | alta      |
| RF-14 | `CrowWarden.svelte` carga `/Scarecrow_Feet.glb`, clona el esqueleto una sola vez por montaje, lo escala a ≈ 0.7 (2.23 m), centra X/Z y apoya los pies en `y = 0`. | alta      |
| RF-15 | `CrowWarden.svelte` expone `ref`, `actions` y `mixer` con el mismo contrato que `Hero.svelte`, remapeando `SF_*` a `HR_*`.                           | alta      |
| RF-16 | El mapeo cubre idle, walk, run, jump, sit, attack, pickup, hit y death.                                                                             | alta      |
| RF-17 | `HR_shoot` y `HR_wave` no existen en el espantapájaros: pulsarlos no reproduce clip, no deja el gesto clavado y el jugador vuelve a su animación de movimiento. | alta      |
| RF-18 | Al cambiar de skin, `PlayerBehaviour` reinicia su clip actual y el nuevo rig arranca en idle en el siguiente frame.                                  | alta      |
| RF-19 | El evento `finished` de un clip instantáneo se compara por acción, no por nombre de clip, para que funcione con los nombres `SF_*`.                  | alta      |
| RF-20 | La skin respeta `visible={!driving}`; en tercera persona se ve completa y en primera persona (cripta) conserva cuerpo, brazos y botas, pero oculta sombrero, cabeza, cuervo y poste para no tapar la cámara. La etiqueta 3D se mantiene en `y = 2.45`. | media     |
| RF-21 | `SettingsMenu.svelte` añade una sección «Apariencia» con una tarjeta por skin: nombre, descripción, estado bloqueada/equipada y botón accesible.        | alta      |
| RF-22 | Una skin bloqueada aparece deshabilitada con el texto «Completa Los 25 gatos perdidos»; al desbloquearse se puede equipar al instante.                | alta      |
| RF-23 | El banner de completado muestra «Recompensa desbloqueada: Espantapájaros» y un botón `Equipar` que llama a `cosmetics.equip('crow-warden')`.           | media     |
| RF-24 | Si el GLB de la skin falla, `CrowWarden` avisa por consola e invoca `onError`; `PlayerSkin` renderiza `Hero.glb` y el juego sigue jugable. El perfil conserva la skin elegida. | alta      |
| RF-25 | El sistema no añade mensajes WebSocket ni modifica `backend/`; la emisión de animaciones sigue usando los nombres `HR_*`.                              | alta      |

### No funcionales

| ID    | Requisito                    | Criterio                                                                                     |
| ----- | ---------------------------- | -------------------------------------------------------------------------------------------- |
| RNF-1 | Sin dependencias nuevas.     | Solo Svelte, Threlte, Three, `SkeletonUtils` y APIs ya usadas.                                |
| RNF-2 | Sin errores de tipos.        | `cd frontend && bun run check` termina con código 0.                                         |
| RNF-3 | Formato.                     | Prettier acotado a los archivos del spec pasa.                                               |
| RNF-4 | Build.                       | `cd frontend && bun run build` termina con código 0.                                         |
| RNF-5 | SSR seguro.                  | `localStorage`, `window` y `crypto` solo dentro de `init()`, `$effect` u `onMount`.            |
| RNF-6 | Rendimiento.                 | Una sola skin renderizada; GLB cacheado por `useGltf`; sin asignaciones nuevas por frame; 2 652 triángulos. |
| RNF-7 | Sin fugas.                   | El mixer se detiene y descarga sus clips al desmontar; los listeners existentes se limpian.   |
| RNF-8 | Persistencia pequeña.        | El perfil con las skins sigue muy por debajo de 64 KB.                                        |
| RNF-9 | Escrituras acotadas.         | Solo se escribe al desbloquear o equipar una skin.                                            |
| RNF-10 | Accesibilidad.               | Las tarjetas usan `aria-pressed`, texto de estado y no dependen solo del color.               |
| RNF-11 | La UI no bloquea el juego.   | El botón del banner usa `pointer-events-auto`; el resto mantiene `pointer-events-none`.         |
| RNF-12 | Compatibilidad.              | Misión de gatos, chat, checkpoints, coches y cripta siguen funcionando sin regresiones.       |
| RNF-13 | Modelo compartido.           | Se reutiliza `Hero.svelte` sin cambios de API; `RemoteHero` no cambia.                         |

## 5. Criterios de aceptación

- [x] CA-1: Un perfil antiguo sin `unlockedSkins`/`equippedSkin` sigue cargando alias, color y HUD, y arranca con `hero` equipada.
- [x] CA-2: Con `cats-25` completada, al recargar la skin `crow-warden` aparece desbloqueada sin volver a capturar gatos.
- [x] CA-3: Al capturar el gato 25, el banner muestra la recompensa y el botón `Equipar`.
- [x] CA-4: Pulsar `Equipar` cambia el modelo del jugador al espantapájaros al instante.
- [x] CA-5: Desde ajustes › Apariencia se puede equipar `hero` y volver al modelo original.
- [x] CA-6: La skin equipada persiste tras recargar (`equippedSkin` en `rw:profile:v1`).
- [x] CA-7: Con la misión sin completar, la tarjeta del espantapájaros está bloqueada y `equip()` no cambia nada.
- [x] CA-8: Reiniciar la misión deja la skin desbloqueada y equipada, y los 25 gatos vuelven a aparecer.
- [x] CA-9: Con el espantapájaros equipado, idle, caminar, correr, saltar, sentarse, atacar, recoger, recibir golpe y morir reproducen su clip correspondiente.
- [x] CA-10: Pulsar `G` o `T` (sin `SF_shoot`/`SF_wave`) no reproduce clip del rig ni deja una pose clavada; `G` no altera el movimiento y `T` solo abre el chat global (comportamiento previo); al cerrarlo, moverse vuelve a walk/run.
- [x] CA-11: Cambiar de skin en mitad de una animación no deja el modelo en una pose clavada.
- [x] CA-12: La etiqueta 3D sigue sobre la cabeza y con el color elegido.
- [x] CA-13: Al conducir, el modelo se oculta igual que con `hero`; al salir, reaparece.
- [x] CA-14: La skin se usa en la cripta y en el mapa exterior; en la cripta se ven cuerpo, brazos y botas (cabeza/sombrero ocultos para la cámara).
- [x] CA-15: En primera persona la cámara no queda bloqueada por la geometría del sombrero.
- [x] CA-16: Con dos pestañas, equipar en una se refleja en la otra sin recargar.
- [x] CA-17: Si se renombra temporalmente `/Scarecrow_Feet.glb`, el juego cae a `Hero.glb`, avisa por consola y no rompe la partida.
- [x] CA-18: `bun run check`, Prettier acotado, `bun run build` y `bunx tsc --noEmit` del backend pasan.

## 6. Archivos relevantes

| Ruta                                                        | Acción    | Motivo                                                                  |
| ----------------------------------------------------------- | --------- | ----------------------------------------------------------------------- |
| `frontend/static/Scarecrow_Feet.glb`                        | crear     | Copia del asset jugable desde `blender/exports/`.                       |
| `frontend/src/lib/cosmetics/skins.ts`                       | crear     | Tipos, catálogo de skins, condición de desbloqueo y mapeo de clips.     |
| `frontend/src/lib/state/playerProfile.svelte.ts`            | modificar | Campos `unlockedSkins`/`equippedSkin`, validación y métodos de mutación. |
| `frontend/src/lib/state/cosmetics.svelte.ts`                | crear     | Store de desbloqueo, equipado y sincronización con misiones.            |
| `frontend/src/lib/components/player/CrowWarden.svelte`      | crear     | Render del GLB, clonado, normalización, animaciones y contrato común.    |
| `frontend/src/lib/components/player/PlayerSkin.svelte`      | crear     | Selector de modelo que reenvía `ref`/`actions`/`mixer`.                  |
| `frontend/src/lib/components/player/Player.svelte`          | modificar | Usar `PlayerSkin` y montar la conducta sobre la skin activa.            |
| `frontend/src/lib/components/player/PlayerBehaviour.svelte` | modificar | Reset de clip al cambiar de rig y cierre de gestos por acción.           |
| `frontend/src/lib/components/player/Hero.svelte`            | sin cambio | Ya expone el contrato que necesita `PlayerSkin`.                        |
| `frontend/src/lib/components/ui/SettingsMenu.svelte`        | modificar | Sección «Apariencia» con el selector de skins.                          |
| `frontend/src/lib/components/ui/MissionHud.svelte`          | modificar | Recompensa y botón `Equipar` en el banner de completado.                |
| `frontend/src/routes/+page.svelte`                          | modificar | Inicializar `cosmetics` y sincronizar al completar la misión.           |
| `frontend/src/lib/components/player/RemoteHero.svelte`      | sin cambio | Fuera de alcance: los demás jugadores siguen viendo `Hero.glb`.         |
| `backend/`                                                  | sin cambio | La recompensa es local y no usa WebSocket.                              |

## 7. Plan de implementación

### Fase 1 — Catálogo, perfil y store de cosméticos

- [x] Paso 1: Crear `frontend/src/lib/cosmetics/skins.ts`:
  - `SkinId`, `SkinDefinition` y `DEFAULT_SKIN`.
  - `SKINS` con `hero` y `crow-warden` (nombre «Espantapájaros», descripción, `modelPath`, `unlockMissionId`).
  - `SKIN_BY_ID`, `isSkinId` y `CROW_WARDEN_ANIMATIONS` con el mapeo `HR_* → SF_*`.
- [x] Paso 2: Ampliar `playerProfile.svelte.ts`:
  - Añadir `unlockedSkins: SkinId[]` y `equippedSkin: SkinId` al tipo y al estado.
  - Normalizar en lectura: IDs conocidos, sin duplicados, `equippedSkin` desbloqueada o `hero`.
  - `unlockSkin(id)` idempotente y `setEquippedSkin(id)` validado; persistir con `touch()`.
- [x] Paso 3: Crear `cosmetics.svelte.ts`:
  - Derivar `equippedSkin`, `isUnlocked` y la lista con metadatos.
  - `syncUnlocks()`: si `missions.completed`, desbloquear cada skin con `unlockMissionId === 'cats-25'`.
  - `equip(id)` valida y delega en el perfil; `rewardForMission(missionId)` devuelve la skin desbloqueada por esa misión.
  - `init()` idempotente y seguro en SSR.
- [x] Paso 4: En `+page.svelte`, tras `missions.init(...)`, llamar a `cosmetics.init()` y añadir un `$effect` que ejecute `cosmetics.syncUnlocks()` cuando `missions.completed` sea verdadero.

### Fase 2 — Render del espantapájaros

- [x] Paso 5: Copiar `blender/exports/Scarecrow_Feet.glb` a `frontend/static/Scarecrow_Feet.glb`.
- [x] Paso 6: Crear `CrowWarden.svelte`:
  - `useGltf('/Scarecrow_Feet.glb')`, clonar una vez con `SkeletonUtils.clone`.
  - Aplicar `scale = 0.7`, `Box3` para centrar X/Z y dejar `min.y = 0`; activar `castShadow`.
  - `useGltfAnimations(() => $gltf, () => ref)` y un store derivado que remapee `SF_*` a `HR_*`.
  - `bind:ref`, `bind:actions`, `bind:mixer`; prop `visible`.
- [x] Paso 7: Crear `PlayerSkin.svelte` con `skin`, `visible`, un snippet `children` y los bindings; renderizar `CrowWarden` o `Hero` según la skin y reenviar el snippet dentro del grupo activo (para que la etiqueta y `PlayerBehaviour` sigan al jugador).
- [x] Paso 8: En `Player.svelte`, sustituir `<Hero>` por `<PlayerSkin>`, conservar la etiqueta 3D y montar `PlayerBehaviour` con el `ref`/`actions`/`mixer` resueltos.
- [x] Paso 9: En `PlayerBehaviour.svelte`:
  - Limpiar `current` y `oneShot` cuando cambie `actions` (nuevo rig).
  - Ignorar `oneShot` si el rig no tiene esa acción, para que `HR_shoot`/`HR_wave` no bloqueen el movimiento.
  - Comparar el evento `finished` por identidad de acción (`actions?.[oneShot] === finished`) en vez de por nombre de clip.
- [x] Paso 10: Fallback: `CrowWarden` recibe `onError`, avisa por consola al rechazarse `useGltf` y `PlayerSkin` conmuta un estado local `failed` para renderizar `Hero` con las mismas bindings. No se modifica el perfil.

### Fase 3 — Ajustes y recompensa

- [x] Paso 11: En `SettingsMenu.svelte`, añadir la sección «Apariencia» entre el color y «Perfil y progreso»:
  - Tarjeta por skin con nombre, descripción y estado (`Equipada`, `Disponible`, `Bloqueada`).
  - Botón/`aria-pressed` para equipar; `disabled` si está bloqueada.
  - Texto de desbloqueo con el título de la misión.
- [x] Paso 12: En `MissionHud.svelte`, dentro del banner de completado, mostrar la recompensa de la misión y un botón `Equipar` con `pointer-events-auto` que llame a `cosmetics.equip`.
- [x] Paso 13: Revisar solapes del banner con el HUD, el chat y los controles móviles.

### Fase 4 — Verificación y cierre

- [x] Paso 14: Ejecutar la verificación de §8 y corregir errores.
- [x] Paso 15: Probar los casos manuales: perfil antiguo, desbloqueo, equipado, recarga, reinicio, dos pestañas, cripta, primera persona y fallo del GLB.
- [x] Paso 16: Actualizar `estado`, `actualizado`, checkboxes, «Progreso» y «Changelog» de este spec.

### Contrato de datos

```ts
// frontend/src/lib/cosmetics/skins.ts
import type { HeroAnimation } from '../services/protocol';

export type SkinId = 'hero' | 'crow-warden';

export type SkinDefinition = {
	id: SkinId;
	name: string;
	description: string;
	modelPath: string | null;
	unlockMissionId: string | null;
};

export const DEFAULT_SKIN: SkinId = 'hero';
export const CROW_WARDEN_ANIMATIONS: Partial<Record<HeroAnimation, string>>;
```

```ts
// frontend/src/lib/state/playerProfile.svelte.ts (extensión)
export type PlayerProfile = {
	version: 1;
	playerId: string;
	alias: string;
	labelColor: string;
	missionHudVisible: boolean;
	unlockedSkins: SkinId[];
	equippedSkin: SkinId;
	createdAt: number;
	updatedAt: number;
};
```

```ts
// frontend/src/lib/state/cosmetics.svelte.ts
export class CosmeticsStore {
	get equippedSkin(): SkinId;
	get skins(): readonly SkinDefinition[];
	isUnlocked(id: SkinId): boolean;
	equip(id: SkinId): boolean;
	init(): void;
	syncUnlocks(): void;
	rewardForMission(missionId: string): SkinDefinition | null;
}
export const cosmetics: CosmeticsStore;
```

## 8. Verificación

```bash
# Frontend: tipos
cd frontend && bun run check

# Frontend: formato acotado a los archivos del spec
cd frontend && bunx prettier --check \
  src/lib/cosmetics/skins.ts \
  src/lib/state/playerProfile.svelte.ts \
  src/lib/state/cosmetics.svelte.ts \
  src/lib/components/player/CrowWarden.svelte \
  src/lib/components/player/PlayerSkin.svelte \
  src/lib/components/player/Player.svelte \
  src/lib/components/player/PlayerBehaviour.svelte \
  src/lib/components/ui/SettingsMenu.svelte \
  src/lib/components/ui/MissionHud.svelte \
  src/routes/+page.svelte

# Frontend: build
cd frontend && bun run build

# Backend: sin cambios, se comprueba que sigue compilando
cd backend && bunx tsc --noEmit
```

Casos manuales:

1. Con un perfil antiguo (sin `unlockedSkins`), cargar el juego: alias, color y HUD intactos; en ajustes aparece `hero` equipada y el espantapájaros bloqueado.
2. Con `rw:missions:v1` marcando `cats-25` completada, recargar: la skin aparece desbloqueada sin recapturar nada.
3. Capturar los 25 gatos: el banner muestra la recompensa y `Equipar`; pulsarlo cambia el modelo.
4. Equipar desde ajustes las dos skins varias veces y comprobar que el modelo cambia sin poses clavadas.
5. Recargar: se conserva la skin equipada.
6. Reiniciar la misión: vuelven los 25 gatos y la skin sigue desbloqueada/equipada.
7. Con el espantapájaros, probar idle, caminar, correr, saltar, `C`, `F`, `E`, `V`, `B`, `G` y `T`; `G`/`T` no deben congelar el modelo (con `T` se cierra el chat con `Escape` y se comprueba que el movimiento se reanuda).
8. Comprobar etiqueta 3D, coche y cripta (la cripta es primera persona): el sombrero no debe tapar la vista.
9. Abrir dos pestañas, equipar en una y ver el cambio en la otra.
10. Renombrar `frontend/static/Scarecrow_Feet.glb` temporalmente y recargar: fallback a `hero`, consola con aviso y partida jugable.

## 9. Riesgos y mitigaciones

| Riesgo                                                        | Impacto | Mitigación                                                                                   |
| ------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------- |
| El modelo mide 3.18 m y desentona                                 | medio   | Escala 0.7 (≈ 2.23 m) y normalización con `Box3`; captura de pantalla para ajustar.            |
| El rig no tiene `SF_shoot`/`SF_wave` y bloquea gestos             | alto    | `PlayerBehaviour` limpia `oneShot` cuando la acción no existe; `G`/`T` no hacen nada.          |
| El cierre de clips compara nombres `SF_*` con `HR_*`             | alto    | Comparar por identidad de `AnimationAction` en el evento `finished`.                          |
| El perfil antiguo se corrompe al añadir campos                   | alto    | Campos aditivos con defaults, validación al leer y CAs de perfil antiguo.                     |
| Cambiar de skin deja una pose clavada                            | medio   | Reset de `current`/`oneShot` al cambiar `actions`.                                            |
| El GLB no carga o pesa demasiado                                 | medio   | `useGltf` cachea la descarga; fallback a `hero` y `console.warn`.                             |
| El espantapájaros tapa la cámara en primera persona              | medio   | Prueba manual y ajuste de escala/offset; la cámara usa `playerState`, no el modelo.            |
| Los demás jugadores ven `hero` mientras tú ves el espantapájaros | bajo    | Aceptado en esta fase; requiere protocolo y se anota como trabajo futuro.                     |
| El selector de skins tapa el HUD o el chat                       | bajo    | Se integra en el panel de ajustes existente con scroll interno.                               |
| Reiniciar la misión parece que debería bloquear la skin          | bajo    | Texto explícito en ajustes: «La skin desbloqueada se conserva».                               |

## 10. Preguntas abiertas

- [x] ¿Desbloquear la skin la equipa automáticamente?
      No: se desbloquea y el jugador decide con `Equipar` o desde ajustes.
- [x] ¿Reiniciar la misión vuelve a bloquear la recompensa?
      No: el desbloqueo es permanente; reiniciar solo resetea el progreso de los gatos.
- [x] ¿Los demás jugadores ven la skin equipada?
      No en esta fase. Requiere un mensaje nuevo en el protocolo; `RemoteHero` no cambia.
- [x] ¿Qué pasa con los gestos sin animación en el rig (`G`/`T`)?
      Se ignoran sin congelar el modelo; el jugador vuelve a idle/walk/run.
- [x] ¿Se usa el asset completo con sombrero y poste?
      Sí, se usa `Scarecrow_Feet.glb` tal cual, escalado y normalizado.
- [x] ¿Dónde se elige la skin?
      En ajustes › Apariencia y, tras completar la misión, desde el banner de recompensa.

## 11. Decisiones y notas

### Catálogo y persistencia

- El catálogo vive en `frontend/src/lib/cosmetics/skins.ts`; la skin por defecto es `hero` y no se guarda como recompensa.
- El perfil mantiene `rw:profile:v1`: los campos nuevos son aditivos y tienen defaults, así que no hace falta migrar ni arriesgar alias/color.
- `unlockedSkins` guarda solo IDs conocidos y sin duplicados. `equippedSkin` siempre apunta a una skin desbloqueada; en caso contrario se normaliza a `hero`.
- El desbloqueo es permanente e idempotente. `syncUnlocks()` se ejecuta al arrancar y al completar cualquier misión, de modo que las partidas ya completadas reciben su recompensa sin recapturar. El mismo mecanismo se reutiliza para la momia (`crypt-5-skulls`, ver `SPEC-011`); el espantapájaros sigue ligado a `cats-25`.
- La recompensa no se elimina al reiniciar la misión. Reiniciar el perfil desde DevTools sí la borra, como cualquier dato local.

### Render y animaciones

| Estado del jugador | Clip pedido | Clip del espantapájaros |
| ------------------ | ----------- | ----------------------- |
| Quieto             | `HR_idle`   | `SF_idle`               |
| Caminar            | `HR_walk`   | `SF_walk`               |
| Correr             | `HR_run`    | `SF_run`                |
| Salto              | `HR_jump`   | `SF_jump`               |
| Sentado            | `HR_sit`    | `SF_sit`                |
| Ataque (`F`)       | `HR_attack` | `SF_attack`             |
| Recoger (`E`)      | `HR_pickup` | `SF_pickup`             |
| Golpe (`V`)        | `HR_hit`    | `SF_hit`                |
| Muerte (`B`)       | `HR_death`  | `SF_death`              |
| Disparo (`G`)      | `HR_shoot`  | — (se ignora)           |
| Saludo (`T`)       | `HR_wave`   | — (se ignora)           |

- El GLB se clona con `SkeletonUtils` una vez por montaje; la geometría y los materiales se comparten con la caché de `useGltf` para no duplicar memoria.
- La normalización sigue el patrón de `Cat.svelte`: escalar, calcular `Box3`, centrar X/Z y dejar los pies en `y = 0`.
- Los clips del espantapájaros son in-place (sin desplazamiento horizontal del hueso `root`), así que la posición la sigue mandando `PlayerBehaviour`/`PlayerCollider`.
- `PlayerBehaviour` sigue emitiendo nombres `HR_*` por WebSocket; no cambia el protocolo ni afecta a los avatares remotos.
- En primera persona (cripta), `Player` pasa `hideHead={sceneState.firstPerson}` a `PlayerSkin` y este a `CrowWarden`. Un `$effect` oculta los grupos `SF_Hat`, `SF_Head`, `SF_Crow` y `SF_Post`; el cuerpo, los brazos y las botas siguen montados, animados y visibles al mirar hacia abajo. Así la skin sigue presente en la cripta sin que el sombrero tape la cámara.
- `T` conserva el atajo global que abre el chat (comportamiento previo, también con `hero`). El rig del espantapájaros ignora `HR_wave`, así que no reproduce clip ni deja pose clavada; al cerrar el chat con `Escape`, moverse vuelve a walk/run.

### UI

- La sección «Apariencia» se coloca en el panel de ajustes existente, que ya tiene scroll interno, para no añadir otro overlay.
- Cada tarjeta indica el estado con texto además del color y usa `aria-pressed`/`disabled`.
- El banner de completado añade una línea de recompensa y un botón `Equipar`; el contenedor sigue siendo `pointer-events-none` y solo el botón captura clics.

## 12. Progreso

| Fecha      | Estado     | Nota                                                                                                      |
| ---------- | ---------- | --------------------------------------------------------------------------------------------------------- |
| 2026-11-01 | borrador   | Spec creado: catálogo de skins, desbloqueo por misión y equipado.                                          |
| 2026-11-01 | completado | Catálogo, perfil, store, render, selector, banner y fallback implementados; verificaciones y pruebas manuales superadas. |

## 13. Changelog

- 2026-11-01 — Creación del spec con el análisis del asset, los requisitos, el plan y los criterios de aceptación.
- 2026-11-01 — Implementación completa: catálogo de skins, persistencia en `rw:profile:v1`, store de cosméticos, `CrowWarden`/`PlayerSkin`, sección «Apariencia», banner de recompensa y fallback a `Hero.glb`.
- 2026-11-01 — Ajuste de primera persona: en la cripta se ocultan cabeza, sombrero, cuervo y poste del espantapájaros; el resto del rig sigue visible y la cámara queda despejada.
- 2026-11-02 — El catálogo se amplía a 11 skins y `CrowWarden.svelte` se sustituye por el componente genérico `SkinCharacter.svelte`; ver `SPEC-019`.
- 2026-11-02 — `syncUnlocks()` se generaliza para desbloquear cualquier skin cuya misión esté completada; la momia se convierte en recompensa de `crypt-5-skulls` (misión de la cripta).
- 2026-11-14 — `cats-25` deja de desbloquear la skin: la recompensa local desaparece y el espantapájaros pasa a ser NFT-only (`nftOnly: true`); se obtiene poseyendo su NFT (recompensa de `tier-veteran` o tienda). Los perfiles que ya la tenían conservan el desbloqueo.
