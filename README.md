<div align="center">
  <img src="frontend/static/NearBox.png" alt="NearBox" width="320" />
</div>

# NearBox

**The economy is the gameplay.** A live 3D multiplayer village on NEAR where
players sign in with Google, their own NEAR wallet, or as a guest, own capped
NEP-245 items, trade them in an on-chain marketplace, equip them in the world,
and take errands from nine NPCs walking the same map. For Google players there is
no wallet popup, no seed phrase, and no gas prompt: the chain is infrastructure,
not a feature.

🌐 **Demo:** [nearbox.lol](https://nearbox.lol)
📄 **Doctrine and economy:** [AGENTS.md](AGENTS.md) · [`/agents`](frontend/src/routes/agents/+page.svelte)

---

## What is inside

| Piece | Status |
| --- | --- |
| 3D multiplayer world | Persistent village, Rapier physics, vehicles, hangouts, cosmetics, procedural audio, mobile controls |
| Social login | Google via Auth0/FastAuth (NEAR account derived from the MPC key and created by a relayer), own wallet via NEP-413, or guest mode with a local UUID |
| NEP-245 | Multi-token contract on testnet: one contract for every item type, supply and per-account caps per catalog, metadata, enumeration, `mt_transfer_call` |
| Marketplace | On-chain escrow and fixed-price sales |
| Real ownership | Sponsored mint, list, buy, and **equip in-game** |
| NPCs | 9 server-simulated NPCs with deterministic routes, dialogue, and errands, replicated over WebSocket |
| Progression | MongoDB stats, mission center, achievements, NFT rewards, server-authoritative minigame engines |
| Minigames | 8: crypt, Gran Premio, Haunted Highway, Barn Siege, Witch House Deathmatch, Parkour Spire, Skyfall Royale, and more |
| Economy | Five merchants with wallets and inventory, explainable tooltips, bankruptcy and investment, deterministic fast-forward |

Deployed contracts (testnet):

- NEP-245: `nft.runworld-nep245.testnet`
- Marketplace: `market.runworld-nep245.testnet`

---

## The economy

Five merchants, each with its own NEAR account, inventory, and a personality
expressed only through pricing weights: **Alba** (florist), **Bruno** (baker),
**Tomas** (mechanic), **Vera** (explorer), and **Rosa** (kid).

```
price = clamp(base * stockFactor * demandFactor * personalityFactor, floor, ceiling)
```

- All pricing lives in one readable file: `backend/src/lib/economy/pricing.ts`.
- Every quote returns `{ price, reasons[] }`; the tooltip shows the actual inputs,
  never a formula without data.
- When a merchant runs out of funds it closes; a player can invest to reopen it
  and take a share of future sales.
- Fast-forward simulates one week of trade in about a minute with the same code
  the live loop runs.

The game loop is designed at three scales: every 30 seconds (look → read the
reason → act → see the consequence), every 5 minutes (take an errand → gather the
material → sell → watch one price move), and every session (log in → trade →
leave with something owned).

---

## Monorepo layout

```
contracts/nft/          NEP-245 collection
contracts/market/       escrow marketplace
backend/                Elysia + Bun server (HTTP/WS, economy, NPCs, Mongo)
frontend/               SvelteKit + Threlte client (world, HUD, market, auth)
specs/                  one spec per feature
AGENTS.md               operating doctrine and economy design
```

## Getting started

Requirements: [Bun](https://bun.sh), Node, and Rust (for the contracts).

```bash
# Backend
cd backend
bun install
bun run dev          # http://localhost:4000  ·  ws://localhost:4000/ws

# Frontend
cd frontend
bun install
bun run dev          # Vite + SvelteKit

# Contracts
cd contracts
cargo near build     # or: ./scripts/near.sh
```

The frontend reads `VITE_WS_URL` to pin the WebSocket; when unset it uses the same
origin with `/ws`.

## Verification

```bash
cd frontend
bun run check        # svelte-check
bun run npcs:check   # NPCs
bun run audio:check  # procedural audio
bun run parkour:check
bun run dm:check
bun run royale:check
```

In `backend`: `bun test` and `bunx tsc --noEmit`.

## Documentation

- [AGENTS.md](AGENTS.md): pitch, primitives, economy, game loop, the five-minute
  judge demo, scorecard, and operating rules.
- [`specs/`](specs/): one spec per feature.
- [`backend/README.md`](backend/README.md): WebSocket protocol, lobbies, and engines.

## License

[MIT](LICENSE)

---

<div align="center">
  <sub>NearBox · Track 09 — Games With Real Economies</sub>
</div>