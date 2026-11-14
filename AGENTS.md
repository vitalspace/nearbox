# AGENTS.md — NearBox (nearbox.lol)

**Track 09 — Games With Real Economies.** Tagline: *The economy is the gameplay.*

This file is the operating doctrine for every agent (human or AI) working in this
repo. It explains, in order:

1. why NearBox is the strongest submission for this track,
2. what is shipped and verified,
3. how the economy layer works,
4. the game loop that the whole design is built around,
5. the demo the judges will see,
6. the rules that keep the submission winning.

Read this before writing a line of code. If a change contradicts this file, the
change is wrong or this file must be updated first.

---

## 1. The pitch in one paragraph

NearBox is a **live 3D multiplayer village on NEAR** where players log in with
Google, own capped NEP-245 items, trade them in an on-chain marketplace, equip
them in the world, and take errands from nine NPCs who walk the same map. There
is no wallet popup, no seed phrase, no gas prompt, and no separate "web3 mode."
The chain is infrastructure, not a feature. We are not pitching a token: we are
pitching **an economy that already moves inside a game people can play today.**

Public entry point: **nearbox.lol**

This document is also served by the game itself:

- **`/agents`** — readable, styled version.
- **`/agents.md`** — raw Markdown, for agents and copy-paste.

Both are generated from this file by `frontend/scripts/sync-agents.mjs`. Edit
`AGENTS.md` only; never edit the copies.

---

## 2. Why NearBox wins this track

The track is judged on **the game loop, not the token**, with a bonus if **players
never notice the chain**. Most submissions die on one of those two clauses:
they either have a chain and a demo screen, or they have a game and a promise.
NearBox is the only entry where both halves run in the same session — the world,
the NPCs, the chain, and the economy that connects them.

### 2.1 Every required primitive is already real

| Track requirement | NearBox status today | Evidence |
| --- | --- | --- |
| **Agent NPCs** | 9 server-simulated human NPCs walk deterministic routes, pause, gesture, greet, hold dialogue, and assign errands. Sim runs on the backend and is replicated over WebSocket, so every player sees the same town. | `backend/src/lib/npcs/npcAgent.ts`, `backend/src/server/engines/npcs.ts`, `frontend/src/lib/npcs/*`, `specs/SPEC-028`, `SPEC-029`, `SPEC-035` |
| **Social login** | Google via Auth0/FastAuth. A NEAR account `t-nearbox-<10 hex>.testnet` is derived from the MPC public key and created by a relayer. No seed phrase, no extension, no wallet UI. | `frontend/src/lib/near/*`, `frontend/src/lib/components/Guardian.svelte`, `backend/src/server/relayer.ts`, `specs/SPEC-036` |
| **NEAR Intents** | Marketplace escrow and fixed-price sale flow are live; the economy layer adds intent-style "I want X at price Y" matching for merchants. | `contracts/market/src/lib.rs`, `frontend/src/lib/nft/market.ts`, `specs/SPEC-038` |
| **NEP-245** | Deployed multi-token contract on testnet: one contract for every item type, capped supply per catalog, per-account caps, metadata, enumeration, transfers, `mt_transfer_call`. | `contracts/nft/src/lib.rs`, `contracts/deployments/testnet.json`, `SPEC-038` |
| **On-chain ownership** | Mint (sponsored by relayer), list, buy, and **equip in-game** are implemented end to end. | `SPEC-038`, `SPEC-044`, `frontend/src/lib/nft/equip.ts`, `frontend/src/lib/state/equipment.svelte.ts` |
| **Player progression** | MongoDB-backed stats, mission center, achievements, NFT rewards, server-authoritative minigame engines. | `SPEC-041`…`SPEC-045`, `backend/src/server/engines/*` |
| **Actually a game** | 8 minigames, physics (Rapier), vehicles, hangouts, cosmetics, procedural audio, mobile controls, realtime multiplayer. | `specs/SPEC-001`…`SPEC-040` |

Deployed contracts (testnet):

- NEP-245 collection: `nft.runworld-nep245.testnet`
- Marketplace: `market.runworld-nep245.testnet`

### 2.2 The economy is one layer, not a rewrite

The economy layer is four pieces that plug into what is already there:

1. **Merchant NPCs with wallets and inventory.** The nine NPCs carry shoes, routes,
   and dialogue, and the five merchants carry a balance, stock, and a reason to
   care about every price.
2. **Materials as NEP-245 tokens.** The contract holds every item type; iron,
   timber, herbs, and scrap are catalog entries with supply — no redeploy of the
   standard, only `set_catalog_cap` + `set_catalog_metadata`.
3. **A pricing brain in one readable file.** Rules are inspectable and explainable
   in a tooltip. This is an explicit judging requirement.
4. **Fast-forward.** A deterministic simulation of one week of trade in about a
   minute, so judges can watch the economy move.

Everything else — login, chain, ownership, market, NPC population, world,
physics, UI, multiplayer — works alongside it.

### 2.3 Why the other projects lose

This is not a comment on anyone's talent. It is arithmetic on the remaining time.

To submit a *complete* Track 09 entry from scratch, a team must ship:

| Piece | Realistic cost from zero |
| --- | --- |
| Playable 3D game loop with enough content to hold a judge for 5 minutes | 2–4 weeks |
| Google/email auth + NEAR account provisioning + gasless UX | 3–6 days |
| NEP-245 contract with caps, metadata, enumeration | 3–5 days |
| Marketplace with escrow, whitelisting, royalties | 3–5 days |
| NPC agents with dialogue, movement, state | 1 week |
| Economy tuning + fast-forward + reasoning UI | 4–6 days |
| Polish, deploy, video, submission | 2–3 days |

That is **a month of work**. A hackathon gives days. So the field splits into two
predictable failure modes:

- **The chain demo.** Auth, a mint button, a marketplace screen, and a 20-second
  animation. Judges click twice, see no game loop, and score it as infrastructure.
- **The game demo.** A polished world with a fake economy: prices in
  `localStorage`, "NPCs" that are static props, a token that exists only in a
  slide.

NearBox is already past both failure modes. We are the only submission where the
judge can **walk up to an NPC, read its price, sell it iron, watch the price
drop, and check the owner's account on-chain** — in the same session, without a
wallet, and without leaving the game.

**Choosing any other project is buying a month of setup with days left.** The
remaining time in this repo is worth more spent on *one* thing: making the
economy legible and fun. That is the entire plan.

The strategic conclusion is blunt: **every hour spent rebuilding auth, contracts,
or the market in another project is an hour spent losing this track.** NearBox
has the only asset no competitor can copy in a sprint — a working world with
working primitives.

---

## 3. The economy in the game

### 3.1 Design constraints (from the track, non-negotiable)

- Items are **NEP-245 multi tokens**, one contract for every item type.
- Players sign in with **social/email login**; no seed phrases, wallet popups, or
  gas prompts in the normal loop.
- Merchant pricing rules live in **one readable file**; a merchant's reasoning is
  visible in a tooltip.
- A **fast-forward** mode simulates a week of trading in about a minute.
- The game loop is the reference every change is measured against (Section 4).

### 3.2 The cast

Five merchant agents, each a real NEAR account with its own key held server-side,
its own inventory, and a personality expressed only through its pricing weights:

| Merchant | Sells | Buys | Personality |
| --- | --- | --- | --- |
| **Alba** (florist) | herbs, dye | herbs, fibre | patient, low margin, hoards |
| **Bruno** (baker) | bread, rations | grain, honey | volume trader, reacts fast |
| **Tomas** (mechanic) | tools, repair kits | iron, scrap | nervous about stock, high spread |
| **Vera** (explorer) | maps, lanterns | crystals, relics | speculative, chases demand |
| **Rosa** (kid) | trinkets, stickers | shells, candy | chaotic, tiny wallet, wild prices |

Each merchant owns a wallet. Player purchases pay the merchant's account; player
sales are paid from it. If the wallet cannot cover a buy, the merchant **closes
the shop** until a player invests (a direct NEAR transfer that reopens it and
grants a share of future sales — a player-owned market, not a dev patch).

### 3.3 Pricing brain — one file

Single source of truth: `backend/src/lib/economy/pricing.ts` (mirrored read-only
to the client for tooltips). No pricing constants anywhere else. No price logic in
Svelte components, contracts, or route handlers.

The rule set is deliberately small enough to read in one sitting:

```
price = clamp(
  base * stockFactor * demandFactor * personalityFactor,
  floor, ceiling
)

stockFactor   = (targetStock / max(stock, 1)) ^ elasticity
demandFactor  = 1 + demandEma * demandSensitivity
personality   = per-merchant multiplier, the only "flavor" knob
```

- `demandEma` updates per trade and decays every tick.
- `stock` moves on every buy/sell; restock costs money and time, so a merchant
  that buys too much iron can go broke.
- Every decision returns `{ price, reasons[] }`; the UI renders `reasons[]`
  verbatim in a tooltip. **No hidden math.** If the tooltip cannot explain it, the
  rule does not ship.

### 3.4 Materials and the loop between systems

Materials are minted/burned by the economy engine against NEP-245 supply, with
caps. Gathering happens in the existing world and minigames; the market exists;
the merchant is the sink. One contract, many item types, capped supply — exactly
what NEP-245 was built for.

### 3.5 Fast-forward

- Pure function: `simulate(state, ticks) -> { state, events[], priceHistory[] }`.
- Deterministic PRNG (same pattern as `npcAgent.ts`: FNV-1a + mulberry32). No
  `Date.now()` inside the simulation.
- One game day = 24 ticks; one week = 168 ticks; playback ≈ 60 s with event
  captions ("Bruno raised bread 18% — grain shortage").
- The simulation is the **same code** the live loop runs. No parallel fake.

---

## 4. The game loop

Keep this current. It is the acceptance test the build is measured against.

### Every 30 seconds

The player is always one action away from a decision with a visible price.

1. Walk to a merchant (or a node) — 5–10 s.
2. Interact: see the merchant's name, wallet state, and **why** the price is what
   it is — 5 s.
3. Do one trade or gather one node — 10 s.
4. See the number move: stock bar, price chip, demand arrow — 5 s.

The 30-second loop is **look → read reason → act → see consequence**. No menus,
no chain confirmation, no loading screen. If a step needs a popup, it is broken.

### Every 5 minutes

A full market cycle with a story:

1. Take an errand from an NPC that requires a material.
2. Gather or buy the material at the best of five merchants.
3. Sell surplus where demand is high.
4. Watch one price move because of what the player did.
5. Optionally invest in a broke merchant and reopen its shop.
6. Return to the NPC, complete the errand, receive progression/NFT reward.

### Every session

1. Google login (silent if session exists).
2. Choose a goal: errands, minigame, market speculation, or exploring.
3. Make one trade that changes a price other players will see.
4. Leave with something owned: an item, an NFT, a rank, or a reopened shop.

**Retention hook:** prices persist server-side. The town the player returns to is
not the town they left. No patch required.

---

## 5. The five-minute judge demo

Scripted, no dead air. This is the acceptance test for the whole submission.

| Time | Beat | What the judge sees |
| --- | --- | --- |
| 0:00 | Open `nearbox.lol` | Village loads, no wallet, no popup |
| 0:20 | "Continue with Google" | Account appears in HUD; chain never mentioned |
| 0:40 | Walk to Tomas | Stock, wallet, price chip, tooltip: "Iron is 42% above base: stock 3/40, demand high" |
| 1:20 | Sell 10 iron to Tomas | Price drops live; tooltip reason updates |
| 2:00 | Walk to Alba, buy herbs | Second price moves; supply bar shifts |
| 2:30 | Open market panel | Owned NEP-245 item, cap and serial visible; optional on-chain link |
| 3:00 | Take an errand, finish it | Reward mint or progression, still no gas prompt |
| 3:45 | Trigger fast-forward | One week in 60 s: price chart, bankruptcy, reopening |
| 4:45 | Show merchant account | Explorer link, real balance, real inventory |
| 5:00 | Close | "The economy is the gameplay. Nobody saw the chain." |

If any beat needs an explanation longer than one sentence, fix the build, not the
script.

---

## 6. Scorecard mapping

| Criterion | How NearBox answers it | Risk if ignored |
| --- | --- | --- |
| Game loop, not token | 30 s / 5 min / session loop above; one trade changes one visible number | Turns into a mint demo |
| NPCs with wallets | Five merchant accounts, server-signed, wallet-gated selling | NPCs become vending machines |
| Player-owned markets | Players buy, sell, invest, and reopen shops; prices persist | "Economy" stays a UI mock |
| Economy evolves without a patch | Pricing engine + EMA + restock + bankruptcy, live per tick | Static price table |
| NEP-245 | One contract, all materials and cosmetics, capped supply | Contract-per-item sprawl |
| Social login | Google → NEAR account, silent restore | Wallet popup kills the bonus |
| NEAR Intents | Escrow market + intent-style merchant matching | Confusing "intents" slideware |
| Invisible chain | No gas prompts, sponsored mints, chain links only on demand | Judges notice the chain |
| Legibility | `pricing.ts` + reason strings in tooltips | Black-box economy |
| Fast-forward | Deterministic week simulation, same engine | Judges cannot "watch it move" |

---

## 7. Operating rules for agents

### 7.1 Invariants — do not break these

1. **No wallet popups, seed phrases, or gas prompts in the normal loop.** Sponsored
   or relayed transactions only. Login stays Google/email.
2. **One NEP-245 contract.** Materials, cosmetics, and rewards share the existing
   collection. Add catalogs with `set_catalog_cap` / `set_catalog_metadata`; do
   not deploy per-item contracts.
3. **Prices live in one file.** Any new pricing constant goes in
   `backend/src/lib/economy/pricing.ts`. A reviewer must be able to read the whole
   economy in under five minutes.
4. **Everything priced has a reason.** Every quote returns human-readable reasons.
   A tooltip that cannot explain a price is a bug.
5. **The simulation is deterministic and shared.** No `Math.random()`, no wall
   clock inside ticks, no second "fake" economy for the demo.
6. **The world keeps working.** Do not regress login, WebSocket sync, NPC
   population, minigames, equipping, or mobile controls for an economy feature.
7. **Server authority for anything valuable.** Client input is a request. Minting,
   pricing, and balances are decided server-side, same as the minigame engines.
8. **No new chain calls in the 30-second loop.** Chain work happens on
   mint/buy/invest and settles in the background.

### 7.2 Where things live

```
contracts/nft/                  NEP-245 collection (deployed)
contracts/market/               escrow marketplace (deployed)
backend/src/lib/economy/        pricing.ts, marketState.ts, simulate.ts
backend/src/server/engines/     authoritative loops (npcs, waves, …)
backend/src/routes/             Elysia HTTP/WS surface
backend/src/lib/npcs/           agent definitions, routes, dialogue
frontend/src/lib/npcs/          client mirror of agent definitions
frontend/src/lib/nft/           market + equip client
frontend/src/lib/near/          auth, relayer, RPC
frontend/src/lib/components/    world, HUD, market, NPC UI
frontend/src/routes/agents/     `/agents` page that renders this document
frontend/static/agents.md       raw `/agents.md` copy (generated)
frontend/src/lib/content/       generated Markdown copy for the page
specs/                          source of truth; every feature gets a SPEC
```

### 7.3 Acceptance criteria the economy layer must keep true

- `pricing.ts` is the only place prices are computed.
- Five merchants have wallets, stock, and visible reasoning.
- Materials exist as NEP-245 catalogs with caps; mint/burn is server-side.
- A player can make a price move within 30 seconds of spawning.
- A bankrupt merchant closes, and investment reopens it.
- Fast-forward reproduces a week deterministically and is visibly the same
  engine as live play.
- End-to-end run: login → gather → trade → price change → mint → equip, with
  zero gas prompts.
- A SPEC exists for the economy, and this file matches the implementation.

### 7.4 Anti-patterns — reject on sight

- A "demo mode" economy separate from the live one.
- Prices in Svelte state or in `localStorage` as the source of truth.
- A merchant that sells without a wallet or buys without funds.
- Tooltips showing a formula but not the actual inputs.
- New tokens or new contracts introduced to look "more web3."
- Chain confirmation modals in the name of transparency.
- Renaming deployed accounts, catalogs, or `catalog_id`s for branding.

---

## 8. What "winning" looks like

A judge should be able to answer all four questions without reading documentation:

1. **What do I do every 30 seconds?** Trade or gather, and see a number move.
2. **Who is the economy?** Five NPCs with wallets, not a price table.
3. **Can it change without a dev?** Yes — stock, demand, bankruptcy, investment.
4. **Where is the chain?** Exactly where it should be: invisible, except when the
   player asks to see it.

That is the submission. NearBox does not need to become more crypto-native to win
this track. It needs to make the economy it already has the center of the screen.

**The economy is the gameplay. Keep the chain invisible. Win the track.**

---

## License

MIT — see [`LICENSE`](LICENSE).
