# Contratos NEAR — RunWorld NEP-245 + Marketplace

Workspace Rust con dos contratos:

| Contrato | Carpeta | Qué hace |
| -------- | ------- | -------- |
| `nft` | `nft/` | Colección NEP-245 basada en catálogo: `mint`, `burn`, transferencias, metadata y enumeración. |
| `market` | `market/` | Marketplace de NEP-245 con escrow: listar con `mt_transfer_call`, comprar y cancelar. |

La colección es **catalog-based**: cada `catalog_id` (por ejemplo `pistol-gold`) tiene
metadata base, un tope global (`cap`) y un tope por cuenta (`per_account_cap`). Cada
`mint` crea exactamente **1 unidad** con `token_id = "<catalog_id>#<serial>"`.

- El `serial` es `catalog_minted + 1` y **no se reutiliza**: quemar un token no libera
  cupo ni devuelve el número de serie.
- La metadata se guarda **una vez por catálogo** (`catalog_metadata`). El token solo
  guarda `TokenInfo { owner_id, catalog_id, serial }`, así que el storage por token es
  pequeño.
- No se implementan approvals: el marketplace usa escrow con `mt_transfer_call`.
- `mint` es público (testnet). Los topes limitan la emisión; endurecerlo con una
  allowlist queda para producción.

## Topes de emisión

| Ítem | `catalog_id` | `cap` | `per_account_cap` |
| ---- | ------------ | ----: | ----------------: |
| Golden Pistol | `pistol-gold` | 25 | 3 |
| Golden Shotgun | `shotgun-gold` | 25 | 3 |
| Golden SMG | `mp5-gold` | 25 | 3 |
| Golden Sniper | `sniper-gold` | 25 | 3 |
| Golden Bazooka | `bazooka-gold` | 25 | 3 |
| Crown | `crown` | 50 | 5 |
| Coin Pistol | `coin-pistol` | 50 | 5 |
| Skateboard | `skateboard` | 25 | 3 |
| Magic Broom | `magic-broom` | 25 | 3 |

Total máximo de la colección: **275 NFTs**. El owner puede ajustar los topes con
`set_catalog_cap` sin redeploy ni migración. El frontend siempre lee los valores
on-chain; los números de arriba son solo el fallback.

## Estructura

```
contracts/
├── Cargo.toml
├── rust-toolchain.toml
├── nft/
│   └── src/lib.rs
├── market/
│   ├── src/lib.rs
│   └── tests/market_flow.rs
├── deployments/testnet.json
└── scripts/near.sh
```

## Build y tests

```bash
cd contracts

# Tests unitarios (rápidos, sin red)
cargo test --offline --lib

# WASM optimizados
(cd nft    && cargo near build non-reproducible-wasm)
(cd market && cargo near build non-reproducible-wasm)

# Integración real en sandbox: deploy → mint → listar → comprar → cancelar
cargo test --offline -p market --test market_flow -- --nocapture
```

Los `.wasm` quedan en `target/near/nft/nft.wasm` y `target/near/market/market.wasm`.
Tamaños medidos: NFT `271 290` bytes y market `201 401` bytes.

> En este entorno crates.io no es accesible: usá `--offline` con el cache local.

## Deploy en testnet

Las claves del deploy viven en `contracts/.near-credentials/testnet/` (ignoradas por
git). Para usarlas:

```bash
./contracts/scripts/near.sh state <cuenta>.testnet
```

### 1. Subcuentas

```bash
DEPLOYER=<deployer>.testnet
near create-account nft.$DEPLOYER    --masterAccount $DEPLOYER --initialBalance 2.8
near create-account market.$DEPLOYER --masterAccount $DEPLOYER --initialBalance 2.5
```

### 2. NFT con `init`

```bash
near deploy nft.$DEPLOYER target/near/nft/nft.wasm \
  --initFunction init \
  --initArgs '{
    "name": "RunWorld Collection",
    "owner_id": "'$DEPLOYER'",
    "catalog_caps": [
      {"catalog_id":"pistol-gold","cap":25,"per_account_cap":3},
      {"catalog_id":"shotgun-gold","cap":25,"per_account_cap":3},
      {"catalog_id":"mp5-gold","cap":25,"per_account_cap":3},
      {"catalog_id":"sniper-gold","cap":25,"per_account_cap":3},
      {"catalog_id":"bazooka-gold","cap":25,"per_account_cap":3},
      {"catalog_id":"crown","cap":50,"per_account_cap":5},
      {"catalog_id":"coin-pistol","cap":50,"per_account_cap":5},
      {"catalog_id":"skateboard","cap":25,"per_account_cap":3},
      {"catalog_id":"magic-broom","cap":25,"per_account_cap":3}
    ],
    "catalog_metadata": [
      {"catalog_id":"pistol-gold","title":"Golden Pistol","description":"A gold-plated sidearm that catches every barn light.","media":"","reference":"runworld://catalog/pistol-gold","extra":"{\"catalogId\":\"pistol-gold\",\"model\":\"weapons/pistol_gold.glb\",\"accent\":\"#fbbf24\",\"badge\":\"Gold\",\"hot\":true,\"kind\":\"weapons\"}"},
      {"catalog_id":"shotgun-gold","title":"Golden Shotgun","description":"The close-range classic, polished until the barrel glows.","media":"","reference":"runworld://catalog/shotgun-gold","extra":"{\"catalogId\":\"shotgun-gold\",\"model\":\"weapons/shotgun_gold.glb\",\"accent\":\"#facc15\",\"badge\":\"Gold\",\"hot\":true,\"kind\":\"weapons\"}"},
      {"catalog_id":"mp5-gold","title":"Golden SMG","description":"A compact gold SMG with a chrome magazine.","media":"","reference":"runworld://catalog/mp5-gold","extra":"{\"catalogId\":\"mp5-gold\",\"model\":\"weapons/mp5_gold.glb\",\"accent\":\"#f59e0b\",\"badge\":\"Gold\",\"hot\":true,\"kind\":\"weapons\"}"},
      {"catalog_id":"sniper-gold","title":"Golden Sniper","description":"A long-range rifle wrapped in gold leaf.","media":"","reference":"runworld://catalog/sniper-gold","extra":"{\"catalogId\":\"sniper-gold\",\"model\":\"weapons/sniper_rifle_gold.glb\",\"accent\":\"#fcd34d\",\"badge\":\"Gold\",\"hot\":true,\"kind\":\"weapons\"}"},
      {"catalog_id":"bazooka-gold","title":"Golden Bazooka","description":"The loudest item in the village, finished in polished gold.","media":"","reference":"runworld://catalog/bazooka-gold","extra":"{\"catalogId\":\"bazooka-gold\",\"model\":\"weapons/bazooka_gold.glb\",\"accent\":\"#fbbf24\",\"badge\":\"Gold\",\"hot\":true,\"kind\":\"weapons\"}"},
      {"catalog_id":"crown","title":"Crown","description":"A jewel-encrusted crown for the ruler of the plaza.","media":"","reference":"runworld://catalog/crown","extra":"{\"catalogId\":\"crown\",\"model\":\"props/crown.glb\",\"accent\":\"#fbbf24\",\"badge\":\"Cosmetic\",\"hot\":true,\"kind\":\"assets\"}"},
      {"catalog_id":"coin-pistol","title":"Coin Pistol","description":"A sidearm that fires shiny coins instead of bullets.","media":"","reference":"runworld://catalog/coin-pistol","extra":"{\"catalogId\":\"coin-pistol\",\"model\":\"weapons/coin_pistol.glb\",\"accent\":\"#f59e0b\",\"badge\":\"Weapon skin\",\"hot\":true,\"kind\":\"assets\"}"},
      {"catalog_id":"skateboard","title":"Skateboard","description":"A graffiti-covered deck with glowing wheels.","media":"","reference":"runworld://catalog/skateboard","extra":"{\"catalogId\":\"skateboard\",\"model\":\"props/skateboard.glb\",\"accent\":\"#22d3ee\",\"badge\":\"Hot ride\",\"hot\":true,\"kind\":\"vehicles\"}"},
      {"catalog_id":"magic-broom","title":"Magic Broom","description":"A witch broom that hovers just above the ground.","media":"","reference":"runworld://catalog/magic-broom","extra":"{\"catalogId\":\"magic-broom\",\"model\":\"props/magic_broom.glb\",\"accent\":\"#a855f7\",\"badge\":\"Flying ride\",\"hot\":true,\"kind\":\"vehicles\"}"}
    ]
  }' \
  --accountId nft.$DEPLOYER
```

> `owner_id` debe ser una cuenta con clave (el deployer), para poder administrar la
> whitelist y los topes. El contrato NFT no necesita access keys propias.

### 3. Market con whitelist

```bash
near deploy market.$DEPLOYER target/near/market/market.wasm \
  --initFunction new \
  --initArgs '{"owner_id":"'$DEPLOYER'","token_contracts":["nft.'$DEPLOYER'"]}' \
  --accountId market.$DEPLOYER
```

### 4. Devolver el sobrante

```bash
# storage_usage × 10^-5 NEAR + margen
near state nft.$DEPLOYER      # dejar storage + 0.02 NEAR
near state market.$DEPLOYER   # dejar storage + 0.30 NEAR
near send nft.$DEPLOYER    $DEPLOYER <exceso> --accountId nft.$DEPLOYER
near send market.$DEPLOYER $DEPLOYER <exceso> --accountId market.$DEPLOYER
```

Registrá IDs, hashes, args y balances en `deployments/testnet.json`.

## Uso por CLI

```bash
NFT=nft.$DEPLOYER
MARKET=market.$DEPLOYER
ALICE=alice.testnet
BOB=bob.testnet

# Mintear (el depósito paga storage; el sobrante vuelve al caller)
near call $NFT mint '{"owner_id":"'$ALICE'","catalog_id":"pistol-gold"}' \
  --accountId $ALICE --deposit 0.01 --gas 100000000000000

# Ver token, balance y supply
near view $NFT mt_balance_of '{"account_id":"'$ALICE'","token_id":"pistol-gold#1"}'
near view $NFT mt_metadata_token_by_token_id '{"token_ids":["pistol-gold#1"]}'
near view $NFT get_catalog_supply '{"catalog_id":"pistol-gold"}'
near view $NFT get_account_minted '{"account_id":"'$ALICE'","catalog_ids":["pistol-gold"]}'

# Listar en escrow (precio en yoctoNEAR: 1 NEAR = 10^24)
near call $NFT mt_transfer_call \
  '{"receiver_id":"'$MARKET'","token_id":"pistol-gold#1","amount":"1","approval":null,"memo":null,"msg":"{\"price\":\"1000000000000000000000000\"}"}' \
  --accountId $ALICE --depositYocto 1 --gas 150000000000000

# Ver ventas
near view $MARKET get_sales '{"from_index":0,"limit":20}'
near view $MARKET get_sale '{"token_contract":"'$NFT'","token_id":"pistol-gold#1"}'

# Comprar adjuntando el precio exacto
near call $MARKET buy '{"token_contract":"'$NFT'","token_id":"pistol-gold#1"}' \
  --accountId $BOB --deposit 1 --gas 100000000000000

# Cancelar (solo el vendedor)
near call $MARKET cancel '{"token_contract":"'$NFT'","token_id":"pistol-gold#1"}' \
  --accountId $ALICE --gas 100000000000000
```

## API del contrato NFT

| Método | Quién | Descripción |
| ------ | ----- | ----------- |
| `init(name, owner_id?, catalog_caps, catalog_metadata)` | deploy | Configura nombre, owner, topes y metadata base. |
| `mint(owner_id?, catalog_id)` payable | cualquiera | Crea 1 unidad `<catalog_id>#<serial>`. |
| `burn(token_id, amount)` | dueño del token | Quema unidades; no libera cupo. |
| `mt_transfer`, `mt_batch_transfer`, `mt_transfer_call`, `mt_batch_transfer_call` | dueño del token | Transferencias NEP-245. |
| `mt_balance_of`, `mt_supply`, `mt_token`, `mt_tokens`, `mt_tokens_for_owner` | view | Balances, supplies y enumeración. |
| `mt_metadata_contract`, `mt_metadata_token_by_token_id`, `mt_metadata_base_by_token_id` | view | Metadata NEP-245. |
| `get_catalog_supply`, `get_catalog_supplies`, `get_account_minted` | view | Topes y mints por cuenta. |
| `set_catalog_cap`, `set_catalog_metadata` | owner | Administración sin redeploy. |

## API del market

| Método | Quién | Descripción |
| ------ | ----- | ----------- |
| `new(owner_id?, token_contracts)` | deploy | Inicializa y define la whitelist. |
| `mt_on_transfer(sender, previous_owners, token_ids, amounts, msg)` | NFT | Registra la venta (`msg = {"price":"<yoctoNEAR>"}`). |
| `buy(token_contract, token_id)` payable | cualquiera | Compra y paga al vendedor solo si el token se transfiere. |
| `cancel(token_contract, token_id)` | vendedor | Devuelve el token al vendedor. |
| `add_token_contract` / `remove_token_contract` | owner | Gestiona la whitelist. |
| `get_sale`, `get_sales`, `get_sales_by_seller`, `get_sales_by_contract` | view | Consultas. |

## Flujo del marketplace (escrow, sin approvals)

```
Vendedor                    NFT                       Market                 Comprador
   │                         │                          │                       │
   │ mt_transfer_call ─────► │                          │                       │
   │  receiver = market      │  transfiere el token     │                       │
   │  msg = {"price":"..."}  │  y llama mt_on_transfer ►│  guarda la venta      │
   │                         │                          │ ◄──── buy (adjunta NEAR)
   │                         │ ◄── mt_transfer ─────────│                       │
   │                         │ ─── token ─────────────────────────────────────► │
   │                         │                          │ ─── paga al vendedor ►│
```

- El token queda en escrow en la cuenta del market.
- Al comprar, el market primero transfiere el token y **solo si eso funciona** paga al
  vendedor (`resolve_buy`). Si falla, devuelve el NEAR al comprador.
- El market solo acepta contratos de token whitelisteados.

## Eventos

`EVENT_JSON` compatible con NEP-297:

- NFT (`standard: "nep245"`): `mt_mint`, `mt_burn`, `mt_transfer`.
- Market (`standard: "nep245-market"`): `sale_created`, `sale_bought`.
