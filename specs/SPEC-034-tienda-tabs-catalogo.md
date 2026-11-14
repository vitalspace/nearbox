---
id: SPEC-034
titulo: "Shop tabs: skins, weapons, assets and vehicles"
estado: borrador
prioridad: alta
creado: 2026-11-12
actualizado: 2026-11-13
responsable: opencode
etiquetas:
  [
    frontend,
    svelte,
    threlte,
    shop,
    tabs,
    catalog,
    skins,
    weapons,
    assets,
    vehicles,
    hot,
    accessibility,
  ]
depende_de: [SPEC-033]
bloquea: []
estimacion: "7h"
---

# SPEC-034 — Shop tabs: skins, weapons, assets and vehicles

## 1. Context

`SPEC-033` delivered the Halloween Shop as a single-view modal:

- The player walks to the `shop` kiosk in front of `Halloween_Cardboard_Shop` and
  presses `E`.
- `hubKiosks.open("shop")` renders `#shop-panel` from
  `frontend/src/lib/components/ui/ShopPanel.svelte`.
- The panel currently contains one catalog: the 11 skins from
  `frontend/src/lib/cosmetics/skins.ts`, a `SkinPreview` canvas, the
  `Available` / `Locked` / `Equipped` states, the unlock mission title and an
  `Equip` button.
- The modal is already integrated with the rest of the game: it pauses player
  input through `PlayerBehaviour`, closes when the chat, settings, a car or
  another scene opens, and the tourism panel can switch to it with
  `hubKiosks.open("shop")`.

The shop now needs to browse more than skins. The requested structure is a tab
bar inside the same `#shop-panel` dialog/div with four categories:

| Tab        | Content requested                       |
| ---------- | --------------------------------------- |
| `Skins`    | The existing 11 playable skins          |
| `Weapons`  | The gold weapon variants                |
| `Assets`   | The hot crown and coin pistol cosmetics |
| `Vehicles` | The hot skateboard and magic broom      |

The project has real data for each tab, so the catalog does not need invented
content:

- **Skins**: `SKINS` in `frontend/src/lib/cosmetics/skins.ts`.
- **Weapons**: the five gold variants that already exist in
  `frontend/static/weapons/` (`pistol_gold`, `shotgun_gold`, `mp5_gold`,
  `sniper_rifle_gold`, `bazooka_gold`).
- **Assets**: exactly two hot cosmetics, the crown (`props/crown.glb`) and the
  coin pistol (`weapons/coin_pistol.glb`).
- **Vehicles**: the hot skateboard (`props/skateboard.glb`) and magic broom
  (`props/magic_broom.glb`). The three shared cars are no longer listed in the
  shop catalog.

There is still no economy: no coins, prices, inventory, vehicle ownership or
house ownership. `SPEC-033` defines the shop as a showroom/wardrobe. This spec
keeps that rule and turns the showroom into a four-tab catalog. The new HOT
entries are catalog offers with a visible hot badge; they do not charge coins
or write inventory until a separate economy spec exists.

This spec depends on `SPEC-033` and must not change the kiosk marker, the
proximity detection, the `E` prompt, the modal guards or the tourism guide.

## 2. Objective

Add an accessible, data-driven tab bar to `#shop-panel` with four tabs —
**Skins**, **Weapons**, **Assets** and **Vehicles** — each with its own item
list, detail pane, status and preview. The Skins tab keeps the current 3D
preview and equip flow. Weapons adds a gold catalog with HOT badges and a
shared 3D model turntable. Vehicles shows only the hot skateboard and magic
broom on the same turntable. Assets uses it for the crown and coin pistol.
Everything runs locally, in English, with no backend, no coins and no new
dependencies.

## 3. Scope

**Included**

- `ShopTabId`, `SHOP_TABS`, `SHOP_WEAPONS`, `SHOP_ASSETS` and `SHOP_VEHICLES`
  in a new typed catalog module.
- An accessible tab bar with mouse, touch and keyboard navigation.
- A preview switch that mounts exactly one 3D canvas at a time.
- A shared `ModelPreview` turntable for the gold weapons, crown, coin pistol,
  skateboard and magic broom.
- A generic 3D model preview (`ModelPreview`) that loads a GLB with Draco,
  centers and grounds it, and rotates it on a turntable.
- Poster fallback for any item that has no GLB.
- Per-tab item lists, selection, status chips and detail panes.
- A visible `HOT` pill on the new gold weapons, crown, coin pistol, skateboard
  and magic broom.
- Dynamic header counts and subtitles for each tab.
- English copy for every new string.
- Responsive layout for desktop and mobile.
- Type, format, build, map and backend verification.

**Not included**

- Coins, prices, purchases, inventory, ownership or trading. HOT entries are
  catalog offers only; they do not charge coins or grant ownership yet.
- Vehicle equipping, spawning or persistence.
- House sales or ownership. The shop does not list houses at all for now.
- New GLB files, new skins, new cars or new buildings.
- Changes to `map.glb`, colliders, kiosk markers, `KioskPrompt`, missions,
  cosmetics, tourism content or the backend.
- Persisting the active tab or the selected item across reloads.
- Translating the shop to Spanish or any other language.

## 4. Requirements

### Functional

| ID    | Requirement                                                                                                                                                                                                                                             | Priority |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| RF-1  | `shopCatalog.ts` exports `ShopTabId = "skins" \| "weapons" \| "assets" \| "vehicles"` and `SHOP_TABS` in that exact order, with `label`, `kicker`, `hint` and `accent`.                                                                                 | high     |
| RF-2  | `shopCatalog.ts` exports `SHOP_WEAPONS` (5 items), `SHOP_ASSETS` (2 items) and `SHOP_VEHICLES` (2 items). Every item has a stable `id`, `name`, `description`, `detail`, `accent`, `icon`, `badge`, optional `hot`, optional `model` and `guideId`.     | high     |
| RF-3  | Skin items are derived from `SKINS`; the catalog never duplicates skin names, descriptions or unlock missions.                                                                                                                                          | high     |
| RF-4  | Vehicle items are the two hot rides (`skateboard`, `magic-broom`) with their own GLB `model`; the catalog no longer derives cars from `CAR_ORDER`.                                                                                                      | high     |
| RF-5  | All new user-facing strings are English: tab labels, kickers, hints, badges, statuses, buttons and notes.                                                                                                                                               | high     |
| RF-6  | `ShopTabBar.svelte` renders a `role="tablist"` with four `role="tab"` buttons. Each button has `aria-controls`, `aria-selected`, `tabindex` and a visible focus ring.                                                                                   | high     |
| RF-7  | Keyboard navigation works with `ArrowLeft`, `ArrowRight`, `Home` and `End`. The focus wraps around, moves to the next tab and activates it. `Enter` and `Space` also activate the focused tab.                                                          | high     |
| RF-8  | All four panels are in the DOM as `role="tabpanel"` and are labelled by their tab; inactive panels use `hidden` so every `aria-controls` resolves. Only the active panel mounts its preview/canvas. The ids follow `shop-tab-<id>` / `shop-panel-<id>`. | high     |
| RF-9  | Opening the shop always starts on `skins`; the selected skin is `cosmetics.equippedSkin`; the close button receives focus. The initial selections are the first weapon, asset and vehicle. Tab and item selections are ephemeral `$state`.              | high     |
| RF-10 | The Skins tab preserves the current behavior: 3D `SkinPreview`, `Available` / `Locked` / `Equipped` status, mission unlock text, `Equip` button, skin grid and the `See the village guide` link.                                                        | high     |
| RF-11 | The Vehicles tab shows only the hot skateboard and magic broom in the 3D model turntable, with name, description, location and a `Hot ride` status chip. It has no equip or purchase action.                                                            |
| RF-12 | The Assets tab shows exactly 2 hot entries: the crown and the coin pistol. Both use the 3D model turntable, float gently, play their embedded clip when they have one (the coin pistol has `Fire`), and show `Hot item`.                                |
| RF-13 | The shop does not render a Houses tab or sell houses; there is no house catalog, ownership or teleport flow in this iteration.                                                                                                                          | high     |
| RF-14 | The header title becomes `The village collection`, the kicker stays `Halloween Shop`, and the subtitle/count changes with the active tab: unlocked/total skins, gold weapons, hot assets and hot rides.                                                 |
| RF-15 | `ShopPreview.svelte` mounts exactly one `Canvas` at a time. Skins and model items each use one canvas; switching tabs or items unmounts the previous canvas and mounts the new one. Poster items mount no canvas.                                       | high     |
| RF-16 | The poster preview is only used for items without a GLB and never loads `map.glb`, `whi-interior.glb`, `game2.glb` or any map-scale GLB. Model previews load only the item's own `model` path with Draco.                                               | high     |
| RF-17 | The tab bar scrolls horizontally on narrow screens, every tab is at least `44 px` tall, the close button stays visible and the panel never overflows horizontally.                                                                                      | medium   |
| RF-18 | On mobile the tab bar stays under the header, the preview is capped in height and the item list/detail stack vertically with internal scrolling.                                                                                                        | medium   |
| RF-19 | The dialog keeps `role="dialog"`, `aria-modal="true"`, `aria-labelledby="shop-title"`, initial focus, `Escape` close, `X` close and backdrop click close from every tab.                                                                                | high     |
| RF-20 | Closing behavior is unchanged: `hubKiosks.close()` / `hubKiosks.reset()`, `PlayerBehaviour` input release, chat/settings/driving close and scene changes close the panel.                                                                               | high     |
| RF-21 | No new `localStorage` keys, WebSocket messages or backend changes are introduced. Equipping a skin still writes only `rw:profile:v1` through `playerProfile`.                                                                                           | high     |
| RF-22 | If a selected id is missing or unknown, the tab falls back to its first item instead of throwing. TypeScript still validates the known catalog ids.                                                                                                     | medium   |
| RF-23 | The tourism panel, kiosk prompt, checkpoints, cats, NPCs, jukebox and mobile controls keep working exactly as in `SPEC-033`.                                                                                                                            | high     |
| RF-24 | The shop remains reachable only from the `shop` kiosk; switching tabs never opens another modal.                                                                                                                                                        | high     |
| RF-25 | Every new weapon, crown, coin pistol, skateboard and magic broom renders a visible `HOT` pill in both the item card and the detail preview. The pill uses `hot: true` in the catalog, is English, and never replaces the type badge.                    | high     |

### Non-functional

| ID     | Requirement          | Criterion                                                                                                                  |
| ------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| RNF-1  | No new dependencies. | Only Svelte, Threlte, Three, Tailwind, Lucide and existing project APIs.                                                   |
| RNF-2  | Type safety.         | `cd frontend && bun run check` exits with code 0.                                                                          |
| RNF-3  | Formatting.          | `bunx prettier --check` passes for every file touched by this spec.                                                        |
| RNF-4  | Build.               | `cd frontend && bun run build` exits with code 0.                                                                          |
| RNF-5  | SSR safety.          | No `window`, `document` or DOM measurement outside `$effect`, `onMount` or client-only components.                         |
| RNF-6  | Rendering budget.    | One 3D canvas mounted at most; only the active preview loads its GLB; no allocations per frame.                            |
| RNF-7  | No leaks.            | Canvas unmounts on tab change and panel close; item changes swap only the model; no keyboard listener survives the panel.  |
| RNF-8  | Accessibility.       | Correct tab roles, `aria-selected`, `aria-controls`, keyboard support, focus ring, 44 px touch targets and English labels. |
| RNF-9  | No regressions.      | Skins, equip, tourism link, prompt, player input block and modal close keep working.                                       |
| RNF-10 | No backend.          | `backend/` does not change and the shop works with the backend offline.                                                    |

## 5. Acceptance criteria

- [ ] CA-1: Pressing `E` at the shop opens `#shop-panel` with four tabs in this order: Skins, Weapons, Assets, Vehicles. Skins is selected by default.
- [ ] CA-2: `ArrowLeft`, `ArrowRight`, `Home` and `End` move focus and activate the corresponding tab; the focus ring is visible and wraps at both ends.
- [ ] CA-3: The Weapons tab shows the 5 gold variants with a rotating 3D model preview and a `HOT` pill. Selecting any of them swaps the model and updates the name, description and variant line.
- [ ] CA-4: The Assets tab shows exactly 2 entries: the crown and coin pistol, both with a rotating, floating 3D model preview and a `HOT` pill. The coin pistol plays its embedded `Fire` clip on loop.
- [ ] CA-5: The Vehicles tab shows only the skateboard and magic broom with rotating, floating 3D models and a `HOT` pill. There is no equip or purchase button.
- [ ] CA-6: The shop has no Houses tab: there is no house catalog, sale or ownership flow, and no `Open village guide` action inside the shop.
- [ ] CA-7: Switching tabs and items twenty times leaves only one canvas in the DOM and produces no WebGL context-lost warning.
- [ ] CA-8: The Skins tab still shows 11 cards, the 3D preview, the lock/equipped states, the mission unlock text and a working `Equip` button that persists after reload.
- [ ] CA-9: The header count changes per tab: `n / 11 skins available`, `5 gold weapons`, `2 hot assets` and `2 hot rides`.
- [ ] CA-10: `X`, `Escape` and the backdrop close the panel from every tab; after closing, the player moves again.
- [ ] CA-11: With the panel open, `WASD` does not move the player, `E` does not capture cats, open checkpoints or trigger `HR_pickup`, and the existing guards remain.
- [ ] CA-12: At `390×844` with `?touch=1`, the tab bar scrolls horizontally, each tab is at least 44 px tall, the close button is visible and there is no horizontal page overflow.
- [ ] CA-13: Opening the chat or settings, starting to drive or leaving the hub closes the panel from any tab.
- [ ] CA-14: With the backend offline and `rw:profile:v1` / `rw:missions:v1` corrupted, the panel opens on Skins and all four tabs still render their default items.
- [ ] CA-15: No new storage key or WebSocket message is written; equipping a skin only updates `rw:profile:v1`.
- [ ] CA-16: `bun run check`, the scoped Prettier check, `bun run build`, `bun run map:check` and the backend `tsc --noEmit` pass. No file under `backend/` changes.
- [ ] CA-17: Every new shop string is in English and every `hot: true` item shows the `HOT` pill in its card and detail pane.

## 6. Relevant files

| Path                                                        | Action    | Reason                                                                                       |
| ----------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------- |
| `frontend/src/lib/components/ui/shopCatalog.ts`             | modify    | Tab definitions and weapon/asset/vehicle catalogs, including the `hot` flag.                 |
| `frontend/src/lib/components/ui/shopUi.ts`                  | modify    | Lucide icon map and tone map for the new weapons, crown, coin, skateboard and broom entries. |
| `frontend/src/lib/components/ui/ShopTabBar.svelte`          | reuse     | Accessible `tablist`, keyboard navigation and active styling; already supports four tabs.    |
| `frontend/src/lib/components/ui/ShopItemCard.svelte`        | modify    | Reusable card for weapons, assets and vehicles, including the `HOT` pill.                    |
| `frontend/src/lib/components/ui/ShopPreview.svelte`         | modify    | Switches between skin canvas, model turntable and poster.                                    |
| `frontend/src/lib/components/ui/ModelPreview.svelte`        | create    | `Canvas` wrapper for the generic item turntable.                                             |
| `frontend/src/lib/components/ui/ModelPreviewStage.svelte`   | create    | Loads a GLB with Draco, centers, grounds, floats and rotates it; plays embedded clips.       |
| `frontend/src/lib/components/ui/VehiclePreview.svelte`      | no use    | Kept for the shared cars outside this catalog; not mounted by the shop.                      |
| `frontend/src/lib/components/ui/VehiclePreviewStage.svelte` | no use    | Kept for the shared cars outside this catalog; not mounted by the shop.                      |
| `frontend/src/lib/components/ui/ShopPanel.svelte`           | modify    | Mount the four tabs, catalogs, per-tab layouts and actions.                                  |
| `frontend/static/weapons/*_gold.glb`                        | reference | Gold variants shown by the Weapons tab and coin pistol asset.                                |
| `frontend/static/props/crown.glb`                           | reference | Crown asset shown by the Assets tab.                                                         |
| `frontend/static/props/skateboard.glb`                      | reference | Skateboard ride shown by the Vehicles tab.                                                   |
| `frontend/static/props/magic_broom.glb`                     | reference | Magic broom ride shown by the Vehicles tab.                                                  |
| `frontend/src/lib/components/ui/SkinPreview.svelte`         | reuse     | Existing 3D skin preview; no changes.                                                        |
| `frontend/src/lib/components/ui/SkinPreviewStage.svelte`    | reuse     | Existing skin stage; no changes.                                                             |
| `frontend/src/lib/components/cars/CarModel.svelte`          | no use    | Kept for the drivable cars in the world; not used by the shop.                               |
| `frontend/src/lib/state/carConfig.ts`                       | no use    | The shop no longer lists the three shared cars.                                              |
| `frontend/src/lib/cosmetics/skins.ts`                       | reference | Source of the 11 skins and their unlock missions.                                            |
| `frontend/src/lib/cosmetics/skinUi.ts`                      | reference | Pattern for icon/tone maps; not modified.                                                    |
| `frontend/src/lib/state/cosmetics.svelte.ts`                | reference | `equippedSkin`, `isUnlocked()` and `equip()`; not modified.                                  |
| `frontend/src/lib/state/missions.svelte.ts`                 | reference | Skin unlock missions; not modified.                                                          |
| `frontend/src/lib/state/hubKiosks.svelte.ts`                | reference | `open()`, `close()` and `panelId`; not modified.                                             |
| `frontend/src/lib/components/ui/TourismPanel.svelte`        | reference | Target of the skins guide link; not modified.                                                |
| `frontend/src/lib/components/player/PlayerBehaviour.svelte` | reference | Existing input guard uses `hubKiosks.panelOpen`; not modified.                               |
| `frontend/src/lib/components/ui/KioskPrompt.svelte`         | reference | Existing kiosk prompt; not modified.                                                         |
| `specs/SPEC-033-tienda-y-centro-de-turismo.md`              | modify    | Add the follow-up link to this spec.                                                         |
| `backend/src/index.ts`                                      | no change | The catalog is local.                                                                        |
| `backend/src/ws/protocol.ts`                                | no change | No protocol changes.                                                                         |

## 7. Implementation plan

### Phase 1 — Catalog and types

- [ ] Step 1: Create `frontend/src/lib/components/ui/shopCatalog.ts` with:
  - `ShopTabId`, `ShopTab`, `ShopIconKey`, `ShopItemBase`, `ShopWeaponItem`,
    `ShopAssetItem`, `ShopVehicleItem` and `ShopItem`.
  - `SHOP_TABS` with `skins`, `weapons`, `assets` and `vehicles`, in that order.
  - `SHOP_WEAPONS` with the five `*_gold` entries from §11.
  - `SHOP_ASSETS` with the two hot entries from §11.
  - `SHOP_VEHICLES` with only the skateboard and magic broom from §11.
  - The optional `hot?: boolean` flag on the shared item base.
- [ ] Step 2: Create `frontend/src/lib/components/ui/shopUi.ts` with
      `SHOP_TAB_ICONS` and `SHOP_ICONS`, using Lucide components and the same
      `Component<{ size?: number; strokeWidth?: number; class?: string }>`
      pattern as `skinUi.ts`.
- [ ] Step 3: Add a `shopTone` helper (or a `SHOP_TONES` record) for the poster
      gradients. Use the existing orange/teal/violet theme tokens, not new CSS
      variables. Add the weapon, crown, coin, skate and broom icons/tones.
- [ ] Step 4: Keep all copy in English and keep the `detail` field short enough
      to fit on two lines at `390 px`.

### Phase 2 — Tab bar and preview components

- [ ] Step 5: Create `ShopTabBar.svelte`:
  - Props: `tabs`, `active` and `onSelect`.
  - `<div role="tablist" aria-label="Shop categories">` with one button per tab.
  - Each button: `role="tab"`, `id="shop-tab-<id>"`,
    `aria-controls="shop-panel-<id>"`, `aria-selected={active === tab.id}`,
    `tabindex={active === tab.id ? 0 : -1}`.
  - `keydown`: `ArrowLeft` / `ArrowRight` wrap, `Home` / `End` jump, `Enter` /
    `Space` select. After selecting, focus the button of the new active tab.
  - Styling: horizontal scroll container, `min-h-11`, active underline/glow in
    the tab accent, visible `focus-visible:ring-2`.
- [ ] Step 6: Keep `VehiclePreview.svelte` and `VehiclePreviewStage.svelte`
      available for the drivable cars outside the shop. The shop does not mount
      them after the catalog was reduced to the two hot rides.
- [ ] Step 7: Keep the existing vehicle stage as the visual reference for the
      camera, lights, dark platform and accent ring of the generic model stage.
- [ ] Step 7b: Create `ModelPreview.svelte` and `ModelPreviewStage.svelte`:
  - `ModelPreview` receives `url` and `accent`, mounts one `<Canvas>` and keys
    `ModelPreviewStage` by `url`.
  - `ModelPreviewStage` loads the GLB with `useGltf` + `useDraco(asset("draco/"))`.
  - Clone the scene, compute its `Box3`, center it on X/Z, ground it on Y and
    scale its longest side to ~2.2 m so every item fills the turntable.
  - Reuse the vehicle stage's camera, lights, dark platform and accent rings;
    rotate the group with `useTask`.
  - Add a slow float (`position.y = 0.06 + sin(elapsed * 1.5) * 0.06`).
  - If the GLB has clips, create an `AnimationMixer`, play every action with
    `LoopRepeat` and update it in `useTask` (coin pistol → `Fire`).
  - No physics, colliders, HUD or input.
- [ ] Step 8: Update `ShopPreview.svelte`:
  - Props: `preview` union:
    - `{ kind: "skin"; skin: SkinId }`
    - `{ kind: "model"; url: string; accent: string }`
    - `{ kind: "poster"; icon: ShopIconKey; accent: string }`
  - Skins → `SkinPreview`; items with a `model` → `ModelPreview`; the rest → a
    gradient poster with `SHOP_ICONS[icon]`.
  - Key the inner stage by the selected item id/url so only the model swaps.

### Phase 3 — ShopPanel integration

- [ ] Step 9: In `ShopPanel.svelte`, add:
  - `let activeTab = $state<ShopTabId>("skins")`.
  - `let selectedIds = $state<Record<ShopTabId, string>>` with defaults
    `cosmetics.equippedSkin`, `SHOP_WEAPONS[0].id`, `SHOP_ASSETS[0].id`
    and `SHOP_VEHICLES[0].id`.
  - Fallback helpers that return the first item when an id is missing.
  - `activeSkin`, `activeWeapon`, `activeAsset`, `activeVehicle`
    and `activePreview` derived values.
- [ ] Step 10: On open (`$effect` with `wasOpen`), reset `activeTab` to `skins`,
      reset the selected skin to `cosmetics.equippedSkin`, reset the other three
      selections to their first item and focus the close button. Keep the
      existing `Escape` listener.
- [ ] Step 11: Change the header title to `The village collection` (the
      `Halloween Shop` kicker stays) and replace the static header subtitle
      with a derived per-tab subtitle:
  - Skins: `{availableCount} / {SKINS.length} skins available · no coins, just unlocked looks`
  - Weapons: `{SHOP_WEAPONS.length} gold weapons · HOT this week`
  - Assets: `{SHOP_ASSETS.length} hot assets · crown and coin pistol`
  - Vehicles: `{SHOP_VEHICLES.length} hot rides · skateboard and magic broom`
- [ ] Step 12: Mount `<ShopTabBar tabs={SHOP_TABS} active={activeTab} onSelect={...} />`
      between the header and the scrollable body. On mobile it stays visible
      under the header; the tab strip scrolls horizontally. Show the active
      tab's `kicker` as the item-list heading and its `hint` as a small line
      under the tab strip or a `title` tooltip on each tab.
- [ ] Step 13: Keep the Skins tab markup as it is today, but wrap it in a
      `role="tabpanel"` with `id="shop-panel-skins"`,
      `aria-labelledby="shop-tab-skins"` and `hidden={activeTab !== "skins"}`.
      Keep the `SkinPreview`, status, unlock text, `Equip` button and tourism
      link.
- [ ] Step 14: Add the Weapons tab panel:
  - Left: `ShopPreview` 3D model turntable, `Gold` badge, `HOT` pill, name,
    description and the `Gold variant` detail.
  - Right: `ShopItemCard` list of `SHOP_WEAPONS`, each with `Hot drop` status.
  - No equip or purchase action.
- [ ] Step 15: Add the Assets tab panel:
  - Left: `ShopPreview` model turntable, badge, `HOT` pill, name, description,
    status chip and `About this item` detail.
  - Right: `ShopItemCard` list of the 2 `SHOP_ASSETS` entries.
  - `assetStatus(item)` → `Hot item` for both.
  - No action button.
- [ ] Step 16: Add the Vehicles tab panel:
  - Left: `ShopPreview` model turntable for the skateboard and magic broom,
    `HOT` pill, name, description, location and `Hot ride` status.
  - Right: `ShopItemCard` list of the 2 `SHOP_VEHICLES` entries.
  - No equip or purchase action.
- [ ] Step 17: Do not add a Houses tab. The shop does not list or sell houses in
      this iteration, so there is no house catalog, poster, ownership flow or
      `Open village guide` action inside the shop.
- [ ] Step 18: Update `ShopItemCard.svelte`:
  - Props: `item: ShopItem`, `selected`, `status` and `onSelect`.
  - Renders the icon, name, `HOT` pill when `item.hot`, badge/status chip,
    selected glow and `aria-pressed={selected}`.
  - Minimum `44 px` height and a `focus-visible:ring-2`.
- [ ] Step 19: Render all four tab panels with a `hidden` attribute on the
      inactive ones so every `aria-controls` resolves, but mount `ShopPreview`
      only inside the active panel. Only one preview exists at a time. Key the
      preview by `activeTab`; key the inner skin stage by the selected item id.
- [ ] Step 20: Review z-index and layout against `ChatOverlay`, `SettingsMenu`,
      `MissionHud`, `TrackSelectDialog`, `OnboardingOverlay` and
      `MobileControls`. Keep `z-[70]` and the existing backdrop.

### Phase 4 — Verification and close

- [ ] Step 21: Run the verification commands from §8 and fix every type, format,
      build or map error.
- [ ] Step 22: Run the manual cases from §8, including keyboard navigation,
      mobile, corrupt storage, backend offline and repeated tab switching.
- [ ] Step 23: Update `estado`, `actualizado`, the checkboxes, the Progress table
      and the Changelog of this spec.

### Data contract

```ts
// frontend/src/lib/components/ui/shopCatalog.ts
import type { SkinId } from "../../cosmetics/skins";

export type ShopTabId = "skins" | "weapons" | "assets" | "vehicles";

export type ShopTab = {
  id: ShopTabId;
  label: string;
  kicker: string;
  hint: string;
  accent: string;
};

export type ShopIconKey = "weapon" | "crown" | "coin" | "skate" | "broom";

type ShopItemBase = {
  id: string;
  name: string;
  description: string;
  /** Where to find it or what it does. */
  detail: string;
  accent: string;
  icon: ShopIconKey;
  badge: string;
  /** Shows the HOT pill on the card and the detail pane. */
  hot?: boolean;
  /** Optional GLB under static/ for the 3D shop preview. */
  model?: string;
  /** Village guide entry this item can point to, if any. */
  guideId: string | null;
};

export type ShopWeaponItem = ShopItemBase & { tab: "weapons" };
export type ShopAssetItem = ShopItemBase & { tab: "assets" };
export type ShopVehicleItem = ShopItemBase & { tab: "vehicles" };
export type ShopItem = ShopWeaponItem | ShopAssetItem | ShopVehicleItem;

export const SHOP_TABS: readonly ShopTab[] = [];
export const SHOP_WEAPONS: readonly ShopWeaponItem[] = [];
export const SHOP_ASSETS: readonly ShopAssetItem[] = [];
export const SHOP_VEHICLES: readonly ShopVehicleItem[] = [];
```

```ts
// frontend/src/lib/components/ui/ShopPreview.svelte (props)
import type { SkinId } from "../../cosmetics/skins";
import type { ShopIconKey } from "./shopCatalog";

type Preview =
  | { kind: "skin"; skin: SkinId }
  | { kind: "model"; url: string; accent: string }
  | { kind: "poster"; icon: ShopIconKey; accent: string };
```

## 8. Verification

```bash
# Frontend: types, formatting, build and map checks
cd frontend && bun run check
cd frontend && bunx prettier --check \
  src/lib/components/ui/shopCatalog.ts \
  src/lib/components/ui/shopUi.ts \
  src/lib/components/ui/ShopTabBar.svelte \
  src/lib/components/ui/ShopItemCard.svelte \
  src/lib/components/ui/ShopPreview.svelte \
  src/lib/components/ui/ModelPreview.svelte \
  src/lib/components/ui/ModelPreviewStage.svelte \
  src/lib/components/ui/VehiclePreview.svelte \
  src/lib/components/ui/VehiclePreviewStage.svelte \
  src/lib/components/ui/ShopPanel.svelte
cd frontend && bun run build
cd frontend && bun run map:check

# Backend: unchanged, but must still compile
cd backend && bunx tsc --noEmit
```

Manual cases:

1. Walk to the shop kiosk, press `E` and verify the four tabs appear in the
   order Skins, Weapons, Assets, Vehicles with Skins active.
2. Use `ArrowRight`, `ArrowLeft`, `Home` and `End`; verify focus and content move
   together and wrap correctly.
3. Open Weapons: verify 5 gold variants, the `HOT` pill and the rotating 3D
   model. Verify only one canvas is mounted.
4. Open Assets: verify exactly 2 entries, the crown and coin pistol. Both rotate
   and float in 3D, the coin pistol loops its `Fire` clip and both show `HOT`.
5. Open Vehicles: verify only the skateboard and broom render in 3D with
   `HOT`. Verify there is no equip or buy button.
6. Confirm the shop has no Houses tab and no house sale flow.
7. Return to Skins and equip a skin; reload and verify it stays equipped.
8. Select a locked skin: verify the mission name and the `See the village guide`
   link still appear and that the skin cannot be equipped.
9. Switch tabs and items 20 times; inspect the DOM and console and verify only
   one canvas exists and no WebGL context warning appears.
10. At `390×844` with `?touch=1`: scroll the tab bar, tap every tab, verify 44 px
    targets, no horizontal overflow and a visible close button.
11. Close from every tab with `X`, `Escape` and the backdrop; verify `WASD`
    works again.
12. With a panel open, hold `W`: the avatar must not move. Press `E`: no cat,
    checkpoint or `HR_pickup`.
13. Open the chat, open settings and start driving from every tab: the panel
    must close.
14. Corrupt `rw:profile:v1` and `rw:missions:v1`, stop the backend, reload: the
    shop must open with the default items on every tab.
15. Confirm that no new storage key or WebSocket message appears and that
    `backend/` has no diff.
16. Confirm every new string is English and every hot item shows the `HOT` pill.

## 9. Risks and mitigations

| Risk                                                        | Impact | Mitigation                                                                                                                    |
| ----------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Multiple WebGL contexts from per-tab canvases               | high   | Only one `ShopPreview` is mounted; keying by `activeTab` and the item url unmounts the previous canvas.                       |
| Model previews load extra GLBs                              | medium | Only the active item loads its own small weapon/prop GLB with Draco; no map-scale GLBs are used.                              |
| Tab state becomes stale after equipping a skin elsewhere    | medium | Reset the Skins selection to `cosmetics.equippedSkin` every time the panel opens; the `Equipped` state is derived.            |
| Vehicle GLBs increase shop load time                        | medium | Load them only when the Vehicles tab is opened; the browser cache serves the same GLBs used by the game.                      |
| HOT items feel like placeholders                            | medium | Every tab is seeded with real game assets and the HOT items have animated 3D previews.                                        |
| Long English copy overflows at 390 px                       | medium | Short `detail` strings, `line-clamp`, stacked layout, internal scrolling and a capped preview height.                         |
| Incorrect ARIA or focus traps inside the modal              | high   | Follow the tab pattern: `tablist`, `tab`, `tabpanel`, `aria-selected`, `aria-controls`, roving `tabindex`, `Home`/`End`.      |
| Tab bar covers the close button or the mobile controls      | medium | Header stays above the tab bar; tab bar scrolls; `z-[70]`; verify with `?touch=1`.                                            |
| The shop tries to load map-scale GLBs                       | high   | Every preview loads only the item's own small GLB; `map.glb`, `whi-interior.glb` and `game2.glb` are forbidden in this panel. |
| A catalog id is renamed and the selection breaks            | low    | Use stable ids, fall back to the first item, and let TypeScript validate the known unions.                                    |
| The tourism link creates two open panels                    | high   | `hubKiosks.open("tourism")` replaces `panelId`; only one panel is rendered at a time.                                         |
| New copy slips into Spanish                                 | low    | CA-17 and a manual grep for Spanish words before closing the spec.                                                            |
| The `HOT` pill collides with the type badge on narrow cards | low    | Both pills live in a flex row with `shrink-0`; the name truncates first; verify at 390 px.                                    |

## 10. Open questions (resolved)

- [x] Does the shop start selling items? Not yet. The shop remains a showroom.
      No coins, prices, inventory or ownership are added. The new HOT entries
      are catalog offers with a visible badge; a real purchase flow needs a
      separate economy spec.
- [x] Can the player equip or spawn a vehicle from the Vehicles tab? No. The
      tab only previews the skateboard and magic broom as catalog-only HOT
      rides.
- [x] Can the player buy or own a house? No. The shop does not list houses at
      all for now, so there is no house sale or ownership flow.
- [x] What are "Assets"? For this iteration the tab contains exactly two hot
      cosmetics: the crown (`props/crown.glb`) and the coin pistol
      (`weapons/coin_pistol.glb`). The previous relic/prop entries were removed
      from the catalog at the user's request.
- [x] Do the HOT items need 3D previews? Yes. Weapons, the crown and the coin
      pistol use the shared `ModelPreview` turntable that loads their own GLB.
      The coin pistol plays its embedded `Fire` clip; models without clips
      float and rotate.
- [x] What does the `HOT` pill mean? It marks the new gold weapons, crown, coin
      pistol, skateboard and magic broom as featured catalog entries. It is
      driven by `hot: true` and does not imply ownership.
- [x] Is the active tab persisted? No. It resets to Skins every time the panel
      opens, which keeps the wardrobe as the primary action.
- [x] Does the skins guide link deep-link to one activity? No. It opens the
      tourism panel at its normal initial selection. Deep-linking can be added
      later with a shared tourism selection store.
- [x] Is the tab bar translated? No. All shop copy is English, matching the
      rest of the HUD and the onboarding.

## 11. Decisions and notes

### Tab table

| Order | Tab id     | Label      | Kicker          | Accent    | Content source      |
| ----- | ---------- | ---------- | --------------- | --------- | ------------------- |
| 1     | `skins`    | `Skins`    | `Wardrobe`      | `#fb923c` | `SKINS` (11)        |
| 2     | `weapons`  | `Weapons`  | `Gold arsenal`  | `#fbbf24` | `SHOP_WEAPONS` (5)  |
| 3     | `assets`   | `Assets`   | `Hot cosmetics` | `#a78bfa` | `SHOP_ASSETS` (2)   |
| 4     | `vehicles` | `Vehicles` | `Hot rides`     | `#f43f5e` | `SHOP_VEHICLES` (2) |

### Catalog content

**Weapons (5, all `HOT`)**

| Id             | Name           | Badge  | Model                           | Detail                 |
| -------------- | -------------- | ------ | ------------------------------- | ---------------------- |
| `pistol-gold`  | Golden Pistol  | `Gold` | `weapons/pistol_gold.glb`       | Gold variant · pistol  |
| `shotgun-gold` | Golden Shotgun | `Gold` | `weapons/shotgun_gold.glb`      | Gold variant · shotgun |
| `mp5-gold`     | Golden SMG     | `Gold` | `weapons/mp5_gold.glb`          | Gold variant · SMG     |
| `sniper-gold`  | Golden Sniper  | `Gold` | `weapons/sniper_rifle_gold.glb` | Gold variant · rifle   |
| `bazooka-gold` | Golden Bazooka | `Gold` | `weapons/bazooka_gold.glb`      | Gold variant · bazooka |

**Assets (2, both `HOT`)**

| Id            | Name        | Badge         | Model                     | Preview                            |
| ------------- | ----------- | ------------- | ------------------------- | ---------------------------------- |
| `crown`       | Crown       | `Cosmetic`    | `props/crown.glb`         | 3D turntable + float               |
| `coin-pistol` | Coin Pistol | `Weapon skin` | `weapons/coin_pistol.glb` | 3D turntable + float + `Fire` clip |

**Vehicles (2, both `HOT`)**

| Id            | Name        | Model                   | Spawn               | Badge      |
| ------------- | ----------- | ----------------------- | ------------------- | ---------- |
| `skateboard`  | Skateboard  | `props/skateboard.glb`  | Street ride · `HOT` | `Hot ride` |
| `magic-broom` | Magic Broom | `props/magic_broom.glb` | Flying ride · `HOT` | `Hot ride` |

### Preview policy

- **Skins** use the existing `SkinPreview` canvas.
- **Weapons, crown, coin pistol, skateboard and broom** use `ModelPreview`,
  which loads the item's `model` GLB with Draco, centers it, scales its longest
  side to ~2.2 m, floats it and rotates it on the same dark platform. Embedded
  clips (coin pistol `Fire`) play on loop through an `AnimationMixer`.
- The preview area is keyed by the selected item id/url so switching items
  unmounts the previous canvas and its listeners.
- The 3D canvas is `aria-hidden="true"`; the item name and description remain
  available as text.

### DOM structure

```svelte
<div id="shop-panel" role="dialog" aria-modal="true" aria-labelledby="shop-title">
	<header>
		<!-- Halloween Shop · dynamic count · close button -->
	</header>

	<div role="tablist" aria-label="Shop categories">
		<button role="tab" id="shop-tab-skins" aria-controls="shop-panel-skins" aria-selected="true">
			Skins
		</button>
		<button role="tab" id="shop-tab-weapons" aria-controls="shop-panel-weapons" aria-selected="false">
			Weapons
		</button>
		<button role="tab" id="shop-tab-assets" aria-controls="shop-panel-assets" aria-selected="false">
			Assets
		</button>
		<button role="tab" id="shop-tab-vehicles" aria-controls="shop-panel-vehicles" aria-selected="false">
			Vehicles
		</button>
	</div>

	<div class="min-h-0 flex-1 overflow-y-auto">
		<section
			role="tabpanel"
			id="shop-panel-skins"
			aria-labelledby="shop-tab-skins"
			hidden={activeTab !== 'skins'}
		>
			<!-- SkinPreview (only when active) + skin details + skin grid -->
		</section>
		<section
			role="tabpanel"
			id="shop-panel-weapons"
			aria-labelledby="shop-tab-weapons"
			hidden={activeTab !== 'weapons'}
		>
			<!-- model turntable (only when active) + weapon details + item list -->
		</section>
		<section
			role="tabpanel"
			id="shop-panel-assets"
			aria-labelledby="shop-tab-assets"
			hidden={activeTab !== 'assets'}
		>
			<!-- model/poster preview (only when active) + asset details + item list -->
		</section>
		<section
			role="tabpanel"
			id="shop-panel-vehicles"
			aria-labelledby="shop-tab-vehicles"
			hidden={activeTab !== 'vehicles'}
		>
			<!-- model turntable (only when active) + vehicle details + item list -->
		</section>
	</div>
</div>
```

### State

- `activeTab` and `selectedIds` are local `$state` in `ShopPanel.svelte`.
- Opening the panel resets them; closing discards them.
- No `localStorage`, no WebSocket message and no new store is required.
- The only persisted action is `cosmetics.equip()`, which already writes
  `rw:profile:v1` through `playerProfile`.

### English copy examples

- Tabs: `Skins`, `Weapons`, `Assets`, `Vehicles`.
- Skins: `Available`, `Locked`, `Equipped`, `Equip`, `Not sure how to unlock it? See the village guide →`.
- Weapons: `Gold arsenal`, `HOT`, `Hot drop`, `Gold variant · pistol showcase.`.
- Assets: `Hot cosmetics`, `HOT`, `Hot item`, `About this item`, `HOT cosmetic · animated 3D preview.`.
- Vehicles: `Hot rides`, `Hot ride`, `HOT shop ride · animated 3D preview.`, `How to get it`.

## 12. Progress

| Date       | Status   | Note                                                                                                                                                                                                             |
| ---------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-12 | borrador | Spec created for the shop tab catalog.                                                                                                                                                                           |
| 2026-11-13 | borrador | Added Weapons tab, crown and coin pistol assets, skateboard and broom rides with HOT pills and a shared animated 3D model preview. Assets and Vehicles reduced to the requested hot entries; Houses tab removed. |

## 13. Changelog

- 2026-11-12 — Creation of the spec: four shop tabs, typed catalog, accessible
  tab bar, one-canvas preview policy and integration with the existing
  `SPEC-033` shop modal.
- 2026-11-13 — Added the Weapons tab (`SHOP_WEAPONS`), reduced Assets to the hot
  crown and coin pistol, reduced Vehicles to the skateboard and magic broom,
  added the `hot` flag with a visible `HOT` pill, and the generic animated
  `ModelPreview` turntable (rotation, float and embedded clips such as the coin
  pistol `Fire`). Removed the Houses tab because there are no houses for sale
  yet.
