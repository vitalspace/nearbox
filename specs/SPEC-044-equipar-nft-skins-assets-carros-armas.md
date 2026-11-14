---
id: SPEC-044
titulo: "Equipar NFTs: skins, assets, vehículos y armas en cualquier momento"
estado: completado
prioridad: alta
creado: 2026-11-14
actualizado: 2026-11-14
responsable: opencode
etiquetas:
  [
    nft,
    nep-245,
    equip,
    skin,
    asset,
    vehicle,
    weapon,
    loadout,
    shop,
    cosméticos,
    frontend,
    svelte,
  ]
depende_de: [SPEC-038, SPEC-034, SPEC-036]
bloquea: []
estimacion: "4h"
---

# SPEC-044 — Equipar NFTs: skins, assets, vehículos y armas en cualquier momento

## 1. Contexto

`SPEC-038` ya desplegó la colección NEP-245, el marketplace y el mint en testnet.
Un jugador puede mintear y comprar NFTs de skins, armas (oro), assets (corona,
pistola de monedas) y vehículos (skateboard, escoba mágica).

Hasta ahora faltaba la última pieza: **usar el NFT en el juego**. El jugador
que ya posee un NFT debe poder equiparlo y cambiarlo en cualquier momento.
La única excepción son las armas, que solo tienen efecto dentro de los
minijuegos de armas (Barn Siege / `minigame-5`, Hexfire Deathmatch /
`minigame-6`, Skyfall Royale / `minigame-8`).

La mayor parte de la lógica ya existe en el código. Este spec la documenta,
la verifica y cubre los huecos menores.

## 2. Objetivo

Que un jugador con sesión de Google y un NFT en su cuenta pueda:

1. Equipar / cambiar su **skin** en cualquier momento desde la tienda (pestaña
   Skins), sin depender de misiones.
2. Equipar / cambiar su **asset** (corona, pistola de monedas) en cualquier
   momento desde la tienda (pestaña Assets).
3. Equipar / cambiar su **vehículo** (skateboard, escoba mágica) en cualquier
   momento desde la tienda (pestaña Vehicles).
4. Equipar un **arma** (pistola, escopeta, SMG, rifle, bazooka dorados) como
   variante cosmética que solo se aplica dentro de los minijuegos de armas
   (`minigame-5`, `minigame-6`, `minigame-8`). Fuera de esos minijuegos el arma
   equipada se guarda en el loadout pero no se renderiza.

## 3. Alcance

**Incluye**

- Lógica de equipado en `frontend/src/lib/nft/equip.ts`:
  `canEquipCatalogItem`, `isCatalogItemEquipped`, `equipCatalogItem`.
- Store de loadout `frontend/src/lib/state/equipment.svelte.ts` con slots
  `weapon` / `asset` / `vehicle`, persistencia en `localStorage`
  (`rw:nft-loadout:v1`) y getters `weaponVariantFor`, `hasCrown`,
  `equippedRide`.
- Inventario NFT cacheado `frontend/src/lib/state/nftOwnership.svelte.ts`
  (`owns`, `count`, `setFromTokens`, caché local `rw:nft-owned:v1`).
- Botón `EquipNftButton` en las pestañas Weapons / Assets / Vehicles del
  `ShopPanel` (`frontend/src/lib/components/market/EquipNftButton.svelte`).
- Equipado de skins vía `cosmetics.equip(id)` en la pestaña Skins del
  `ShopPanel`.
- Aplicación en el mundo 3D:
  - Corona en `Player.svelte` (`equipment.hasCrown`).
  - Vehículo en `Player.svelte` (`equipment.equippedRide`).
  - Variante de arma en `PlayerBehaviour.svelte` solo dentro de
    `inWaves` / `inDeathmatch` / `inRoyale`.
- Inicialización en `GamePage.svelte`: `equipment.init()` y
  `equipment.setAccount(accountId)` al hacer login.

**No incluye**

- Cambiar el desbloqueo local de skins por misiones: una skin sigue
  equipándose si está desbloqueada (misión o NFT); el NFT es una vía adicional.
- Armas como daño/base de munición en minijuegos: el NFT de arma solo cambia el
  modelo visible (variante cosmética); el arma base se recoge dentro del
  minijuego.
- Vehículos conducibles en el hub: `equippedRide` es el modelo cosmético;
  la física de coches queda en sus propios specs. **Actualizado:** la
  conducción de las monturas NFT (skateboard y escoba) se añadió en
  `SPEC-046`.
- Backend o contratos: todo es frontend/localStorage; la cadena es la fuente de
  verdad de la propiedad, leída por `nftMarket` mientras la tienda está abierta.

## 4. Requisitos

### Funcionales

| ID   | Requisito                                                                                                                                  | Prioridad |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| RF-1 | Si el jugador posee el NFT de un ítem (skin, asset, vehicle o weapon), `canEquipCatalogItem(item)` devuelve `true`.                        | alta      |
| RF-2 | `equipCatalogItem(item)` guarda la selección en el slot correspondiente y la persiste en `localStorage`.                                   | alta      |
| RF-3 | `isCatalogItemEquipped(item)` devuelve `true` solo si el ítem está en el slot y el jugador sigue poseyendo el NFT.                         | alta      |
| RF-4 | Al vender o transferir un NFT, el equipado deja de aplicarse automáticamente (`nftOwnership.owns` devuelve `false`).                       | alta      |
| RF-5 | Las skins se equipan con `cosmetics.equip(id)` y se reflejan en `playerProfile.equippedSkin`.                                              | alta      |
| RF-6 | El asset `crown` se renderiza en el mundo cuando `equipment.hasCrown` es `true` (sin depender de que el inventario on-chain ya esté sincronizado). | alta      |
| RF-7 | El vehículo equipado devuelve su modelo GLB vía `equipment.equippedRide` y se renderiza solo en el lobby, Barn Siege (`minigame-5`) y Skyfall Royale (`minigame-8`) (sin depender de `nftOwnership`). | alta      |
| RF-8 | El arma equipada solo se muestra como variante en minijuegos de armas (`inWaves`, `inDeathmatch`, `inRoyale`), nunca en el hub como arma de daño.            | alta      |
| RF-9 | `weaponVariantFor(base)` devuelve el NFT equipado si es variante del arma base (p. ej. `pistol-gold` para `pistol`, `coin-pistol` para `pistol`). En minijuegos el daño y las balas son los del arma base (pistola). | alta      |
| RF-10 | En el lobby, con el `coin-pistol` equipado, al hacer clic se lanza un rollo de papel **con animación de disparo** (`HR_shoot`) del arma de monedas, en lugar de lanzar con las manos vacías. | alta      |
| RF-11 | Al cambiar de cuenta, el loadout se resetea si no hay caché para esa cuenta.                                                             | media     |
| RF-12 | Si el jugador vende o transfiere un NFT equipado, se desequipa automáticamente al refrescar el inventario desde la cadena.                  | media     |
| RF-13 | Al equipar/desequipar, el cliente emite `player-nft-equip`; el servidor actualiza la presencia del jugador y la difunde a todos los clientes conectados (hub y minijuegos). | alta      |
| RF-14 | Los avatares remotos renderizan la corona, la montura y la variante de arma equipada (cuando la variante corresponde al arma que lleva en la mano). | alta      |
| RF-15 | Al (re)conectar, el cliente reenvía el último loadout NFT para que los demás jugadores lo vean sin esperar a un nuevo cambio de equipado. | alta      |
| RF-16 | El `coin-pistol` se monta en la mano en el lobby y en los minijuegos de armas. En el lobby el avatar adopta pose de apuntar para que el arma quede a la altura de la mira; al hacer clic lanza el rollo de papel y reproduce el clip `Fire`. | alta      |

### No funcionales

| ID    | Requisito      | Criterio                                                                   |
| ----- | -------------- | -------------------------------------------------------------------------- |
| RNF-1 | Type safety    | `cd frontend && bun run check` termina con 0 errores.                      |
| RNF-2 | Build          | `cd frontend && bun run build` termina correctamente.                      |
| RNF-3 | Persistencia   | El loadout sobrevive al recargar la página para la misma cuenta.          |
| RNF-4 | Sin regresiones| Login, kioscos, tienda, chat, coches y minijuegos siguen funcionando.      |

## 5. Criterios de aceptación

- [x] CA-1: `bun run check` pasa en `frontend/` tras tocar `nft/equip.ts`,
  `equipment.svelte.ts`, `nftOwnership.svelte.ts`.
- [x] CA-2: Abrir la tienda, seleccionar un arma/asset/vehículo cuyo NFT se
  posee, pulsar "Equip" y verificar que el estado pasa a "Equipped".
- [x] CA-3: Cambiar de skin en la pestaña Skins y verificar que el avatar
  cambia en el mundo 3D.
- [x] CA-4: Equipar la corona y verificar que se.renderiza sobre la cabeza del
  personaje en el hub.
- [x] CA-5: Equipar skateboard o escoba mágica y verificar que `equippedRide`
  devuelve el modelo correspondiente.
- [x] CA-6: Entrar a Barn Siege, Hexfire o Skyfall Royale con un arma dorada
  equipada y verificar que el arma en mano usa el modelo dorado.
- [x] CA-7: Salir de un minijuego de armas al hub y verificar que el arma
  dorada no se renderiza en el personaje.
- [x] CA-8: Recargar la página y verificar que el loadout (weapon/asset/
  vehicle) se restaura desde `localStorage`.
- [x] CA-9: Equipar un asset (corona) y verificar que se renderiza en el hub sin
  esperar a que el inventario on-chain termine de sincronizarse.
- [x] CA-10: Equipar el arma de monedas (`coin-pistol`) y entrar a un minijuego
  de armas; verificar que el arma en mano usa el modelo de monedas y que dispara
  balas normales (daño de pistola).
- [x] CA-11: Equipar el arma de monedas (`coin-pistol`) en el lobby y hacer clic:
  verificar que lanza un rollo de papel con animación de disparo (`HR_shoot`)
  del arma de monedas, no con las manos vacías.
- [x] CA-12: Con dos clientes conectados, equipar corona, vehículo o arma
  dorada en uno y verificar que el otro ve el accesorio en el avatar remoto
  (hub y minijuegos de armas) sin recargar la página.
- [x] CA-13: Equipar el `coin-pistol` en el lobby y verificar que el arma se ve
  en la mano a la altura de la mira (no colgando junto a la pierna), que el clic
  lanza un rollo de papel y reproduce `Fire`; en Barn Siege/Hexfire/Skyfall,
  cada disparo reproduce `Fire`.

## 6. Archivos relevantes

| Ruta                                                                 | Acción     | Motivo                                                                                            |
| -------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------- |
| `frontend/src/lib/nft/equip.ts`                                      | existente  | `canEquipCatalogItem`, `isCatalogItemEquipped`, `equipCatalogItem`.                               |
| `frontend/src/lib/state/equipment.svelte.ts`                         | existente  | Slots weapon/asset/vehicle, persistencia, `weaponVariantFor`, `hasCrown`, `equippedRide`; se suscribe a `nftOwnership.onRefreshed` para desequipar si el NFT deja de poseerse. |
| `frontend/src/lib/state/nftOwnership.svelte.ts`                      | existente  | Inventario NFT del jugador (`owns`, `count`, `setFromTokens`, `onRefreshed`, caché local).           |
| `frontend/src/lib/nft/catalog.ts`                                    | existente  | `MINTABLE_ITEMS`, `MintableCatalogItem`, `catalogItemById`, `catalogCap`.                         |
| `frontend/src/lib/components/market/EquipNftButton.svelte`           | existente  | Botón Equip en pestañas Weapons / Assets / Vehicles del ShopPanel.                                |
| `frontend/src/lib/components/ui/ShopPanel.svelte`                    | existente  | Pestaña Skins con botón de equipar skin; pestañas Weapons/Assets/Vehicles con `EquipNftButton`.   |
| `frontend/src/lib/state/cosmetics.svelte.ts`                         | existente  | `cosmetics.equip(id)`, `isUnlocked`, `equippedSkin`.                                              |
| `frontend/src/lib/state/playerProfile.svelte.ts`                     | existente  | `setEquippedSkin`, `nftSkins`, `equippedSkin`.                                                    |
| `frontend/src/lib/components/player/Player.svelte`                   | existente  | Renderiza corona (`hasCrown`) y vehículo (`equippedRide`).                                        |
| `frontend/src/lib/components/player/PlayerBehaviour.svelte`          | existente  | Aplica variante de arma solo en `inWaves` / `inDeathmatch` / `inRoyale`.                          |
| `frontend/src/lib/GamePage.svelte`                                   | existente  | Llama `equipment.init()` y `equipment.setAccount(accountId)` al hacer login.                      |
| `frontend/src/lib/state/sceneState.svelte.ts`                        | referencia | `inWaves` (minigame-5), `inDeathmatch` (minigame-6), `inRoyale` (minigame-8).                     |
| `frontend/src/server/protocol.ts`                                    | modificado | `Player` incluye `crown`, `ride` y `weaponVariant`; nuevo mensaje `player-nft-equip`.             |
| `frontend/src/server/validate.ts`                                    | modificado | Valida `player-nft-equip`.                                                                        |
| `frontend/src/server/engines/presence.ts`                            | modificado | Guarda y actualiza los accesorios NFT del jugador (`setNftEquip`).                                |
| `frontend/src/server/rooms/LobbyRoom.ts`                             | modificado | Reemite la presencia al recibir `player-nft-equip`.                                               |
| `frontend/src/lib/services/protocol.ts`                              | modificado | Mismos campos en `Player` y mensaje `player-nft-equip` en el cliente.                             |
| `frontend/src/lib/services/lobbySocket.ts`                           | modificado | `sendNftEquip` recuerda el loadout y lo reenvía al (re)conectar.                                  |
| `frontend/src/lib/state/lobby.svelte.ts`                             | modificado | Expone `sendNftEquip`.                                                                            |
| `frontend/src/lib/components/player/PlayerBehaviour.svelte`          | modificado | Emite el loadout NFT al servidor cuando cambia.                                                   |
| `frontend/src/lib/components/player/RemoteHero.svelte`               | modificado | Renderiza corona y montura en avatares remotos del hub.                                           |
| `frontend/src/lib/components/player/RemoteHeroes.svelte`             | modificado | Pasa `crown`, `ride`, `weaponVariant` a `RemoteHero`.                                             |
| `frontend/src/lib/components/waves/WaveRemote.svelte`                | modificado | Corona, montura y variante de arma en Barn Siege.                                                 |
| `frontend/src/lib/components/deathmatch/DeathmatchRemote.svelte`     | modificado | Corona, montura y variante de arma en Hexfire.                                                    |
| `frontend/src/lib/components/royale/RoyaleRemote.svelte`             | modificado | Corona, montura y variante de arma en Skyfall Royale.                                             |
| `frontend/src/lib/components/player/weaponModels.ts`                 | modificado | Conserva los clips horneados (`Fire` del coin-pistol) junto al modelo.                            |
| `frontend/src/lib/components/player/heldWeapon.ts`                   | modificado | Mixer del arma, `playHeldWeaponFire`/`playLocalHeldWeaponFire` y avance por frame.                |
| `frontend/src/lib/components/waves/WaveControls.svelte`              | modificado | Dispara la animación del arma equipada en cada disparo.                                           |
| `frontend/src/lib/components/deathmatch/DeathmatchControls.svelte`   | modificado | Dispara la animación del arma equipada en cada disparo.                                           |
| `frontend/src/lib/components/royale/RoyaleControls.svelte`           | modificado | Dispara la animación del arma equipada en cada disparo.                                           |

## 7. Plan de implementación

El código ya está implementado. El plan queda como registro y verificación:

### Fase 1 — Verificar que el equipado funciona

- [x] Comprobar que `nft/equip.ts` exporta las tres funciones usadas por
  `EquipNftButton`.
- [x] Comprobar que `equipment.svelte.ts` tiene slots weapon/asset/vehicle
  y persiste en `localStorage`.
- [x] Comprobar que `nftOwnership.svelte.ts` se llena desde
  `nftMarket.refresh()` vía `setFromTokens`.
- [x] Comprobar que `EquipNftButton` se monta en las 3 pestañas del catálogo.
- [x] Comprobar que `PlayerBehaviour` aplica el arma solo en minijuegos de
  armas y que `Player` aplica corona/vehículo en el hub.

### Fase 2 — Type check y build

- [x] `cd frontend && bun run check` → 0 errores.
- [x] `cd frontend && bun run lint` → pasa para los archivos tocados.
- [x] `cd frontend && bun run build` → sitio estático generado.

### Fase 3 — Cierre del spec

- [x] Marcar `estado: completado`, actualizar `actualizado`, checkboxes,
  "Progreso" y "Changelog".

## 8. Verificación

```bash
# Frontend
cd frontend && bun run check
cd frontend && bun run lint
cd frontend && bun run build
```

Casos manuales:

1. **Equipar arma/asset/vehículo**: tienda → pestaña del ítem → NFT poseído →
   "Equip" → estado "Equipped" → recargar página → se conserva.
2. **Equipar skin**: tienda → pestaña Skins → skin desbloqueada/NFT → "Equip" →
   avatar cambia en el mundo 3D.
3. **Corona**: equipar `crown` → se ve en la cabeza en el hub (no en primera
   persona ni conduciendo).
4. **Vehículo**: equipar skateboard/escoba → `equipment.equippedRide` devuelve
   el modelo GLB.
5. **Arma solo en minijuegos**: equipar arma dorada → en el hub no se ve;
   entrar a Barn Siege/Hexfire/Skyfall → el arma en mano es la variante dorada.
6. **Vender NFT**: poner un NFT equipado en venta → al refrescar el inventario
   desde la cadena, el equipado se elimina automáticamente y el ítem deja de
   renderizarse.
7. **Sincronización entre clientes**: abrir dos sesiones → equipar corona,
   skateboard o arma dorada en una → la otra ve el accesorio en el avatar
   remoto (hub y minijuegos de armas) sin recargar.

## 9. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
| ------ | ------- | ---------- |
| Circular dependency al importar `sceneState` en `nft/equip.ts`. | Medio | No se importa `sceneState` en `equip.ts`; la restricción de armas solo se aplica en `PlayerBehaviour`, que ya sabe en qué minijuego está. |
| El loadout se guarda en `localStorage` por cuenta; si cambia la cuenta sin logout, puede quedarse el loadout anterior. | Bajo | `equipment.setAccount()` resetea el loadout si no hay caché para la nueva cuenta. |
| `nftOwnership` solo se refresca mientras la tienda está abierta. | Medio | El caché local permite equipar al arrancar; el equipado no se rompe sin RPC. |

## 10. Preguntas abiertas

- [ ] Ninguna. El flujo está completo y verificado.

## 11. Decisiones y notas

- Las armas NFT son **variantes cosméticas**, no armas de daño: el modelo
  dorado reemplaza al arma base recogida dentro del minijuego.
- `coin-pistol` (asset) también actúa como variante cosmética del `pistol` en
  minijuegos de armas (daño y balas de pistola normal, modelo de monedas).
- **En el lobby**, con `coin-pistol` equipado, hacer clic lanza un rollo de papel
  con animación de disparo (`HR_shoot`) del arma de monedas, no con las manos vacías.
- La skin no requiere NFT obligatorio: basta con estar desbloqueada (misión o
  NFT). El NFT es una vía adicional de desbloqueo.
- Todo el estado de equipado es local (localStorage + estado de la sesión);
  la propiedad se lee on-chain vía `nftMarket` / `nftOwnership`.
- **Corregido**: `hasCrown`, `equippedRide`, `isEquipped` y `weaponVariantFor`
  ya no exigen que `nftOwnership.owns()` devuelva `true`. Esto evita que el
  equipado de assets (corona, coin-pistol, vehículo) falle solo porque el
  inventario on-chain aún no se ha sincronizado tras abrir la tienda.
  `equipment` se suscribe a `nftOwnership.onRefreshed`, que solo se emite tras
  un refresco autoritativo desde la cadena; así un caché vacío al arrancar no
  desequipa nada, y si el jugador vende o transfiere un NFT equipado se
  desequipa automáticamente.
- **Sincronización**: el loadout NFT viaja por la presencia del servidor
  (`player-nft-equip` → `Presence.setNftEquip` → `presence` broadcast). Así los
  demás clientes ven los accesorios en tiempo real. No se añadió una consulta
  on-chain por jugador: el servidor solo retransmite lo que el cliente declara,
  igual que ya ocurre con la skin. La pertenencia sigue validándose localmente
  antes de equipar.
- El loadout se reenvía automáticamente al abrir o reconectar el socket, así
  que los jugadores que ya están en el lobby no necesitan un cambio extra para
  ver los accesorios de quien acaba de entrar.
- **Animación del arma**: el `coin-pistol` es el único GLB de arma con clips
  horneados (`Fire`). `weaponModels` guarda esos clips y `heldWeapon` crea un
  `AnimationMixer` al montar el modelo; cada disparo hace `reset().play()` del
  clip. Las armas base y las doradas no traen clips, así que el disparo sigue
  siendo un no-op para ellas.
- **Monturas conducibles**: el vehículo equipado dejó de ser solo cosmético en
  el hub. `SPEC-046` añade montaje con `E`, controles WASD/táctiles, pose
  `HR_idle`/`HR_sit` y movimiento con el character controller para el skateboard
  y la escoba mágica. Fuera del hub sigue aplicándose lo descrito aquí.
- **Pose en el lobby**: con el `coin-pistol` equipado, el hub fuerza las
  animaciones de apuntar (`HR_aim` / `HR_walk_aim` / `HR_run_aim`) para que el
  arma quede a la altura de la mira en vez de colgar junto a la pierna con los
  brazos en idle. Al hacer clic se reproduce el clip `Fire` del arma y se lanza
  el rollo de papel como "bala".

## 12. Progreso

| Fecha       | Estado    | Nota                                       |
| ----------- | --------- | ------------------------------------------ |
| 2026-11-14  | borrador  | Spec creado a partir de código existente.  |
| 2026-11-14  | completado| Implementación verificada; spec cerrado.   |

## 13. Changelog

- 2026-11-14 — Creación del spec. Documenta el equipado de NFTs (skins,
  assets, vehículos, armas) ya implementado en `nft/equip.ts`,
  `equipment.svelte.ts`, `nftOwnership.svelte.ts`, `EquipNftButton.svelte`,
  `Player.svelte` y `PlayerBehaviour.svelte`. Las armas solo se aplican en
  minijuegos de armas (minigame-5/6/8).
- 2026-11-14 — Sincronización del equipado entre sockets: nuevo mensaje
  `player-nft-equip`, presencia con `crown`/`ride`/`weaponVariant`, reenvío al
  reconectar y renderizado de accesorios en avatares remotos del hub, Barn
  Siege, Hexfire y Skyfall Royale.
- 2026-11-14 — `coin-pistol` visible en la mano del lobby y animación `Fire`
  horneada al disparar (lobby y minijuegos), además del `HR_shoot` del avatar.
- 2026-11-14 — Corrección: el mixer/clip se busca recorriendo el grupo visible,
  porque `buildHeldWeapon` devuelve un grupo interno un nivel por debajo de
  `weaponRoot`; antes la animación existía pero nunca se encontraba.
- 2026-11-14 — El `coin-pistol` se monta en el lobby en pose de apuntar para
  que quede a la altura de la mira (no junto a la pierna), y dispara rollos de
  papel con el clip `Fire`.
- 2026-11-14 — Enlace a `SPEC-046`: el skateboard y la escoba equipados ya se
  pueden conducir en el hub.
