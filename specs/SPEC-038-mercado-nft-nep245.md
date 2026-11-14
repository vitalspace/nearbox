---
id: SPEC-038
titulo: "Mercado NFT NEP-245: colección on-chain, mint, venta y compra"
estado: en progreso
prioridad: alta
creado: 2026-11-13
actualizado: 2026-11-13
responsable: opencode
etiquetas:
  [
    near,
    nep245,
    nft,
    market,
    smart-contracts,
    rust,
    fast-auth,
    mpc,
    relayer,
    elysia,
    bun,
    svelte,
    sveltekit,
    economy,
  ]
depende_de: [SPEC-034, SPEC-036]
bloquea: []
estimacion: "38h"
---

# SPEC-038 — Mercado NFT NEP-245: colección on-chain, mint, venta y compra

## 1. Contexto

El juego ya tiene la puerta de entrada resuelta con Google/FastAuth (`SPEC-036`):

- El frontend es un SPA estático (`frontend/src/routes/+layout.ts`: `ssr = false`,
  `prerender = false`) servido con `adapter-static`.
- El backend real es Elysia + Bun (`backend/`), con un mini-relayer que solo
  implementa `POST /relayer/create-account`.
- Al entrar con Google se deriva una cuenta NEAR determinista
  `t-nearbox-<10 hex>.testnet` (o se adopta una cuenta antigua
  `t-<12 hex>.testnet`). La cuenta se crea **sin fondos** y su única access key
  la controla la MPC.
- No existe todavía `sign-tx`: el juego no puede firmar ni difundir
  transacciones propias. Tampoco existe ninguna lectura de contratos NFT.

La tienda (`SPEC-034`) ya tiene un catálogo real y tipado:
`SKINS` (11 skins de personaje), `SHOP_WEAPONS` (5 armas doradas),
`SHOP_ASSETS` (corona y pistola de monedas) y `SHOP_VEHICLES` (skateboard y
escoba mágica). Hoy es solo un showroom: no hay precios, inventario, propiedad
ni compras.

Esos 20 ítems son la colección: cada uno se puede mintear como NFT, pero con un
**tope de emisión por ítem** para que la economía no se infle. El tope se
aplica on-chain, cada copia es un NFT único con número de serie y la tienda
muestra cuántas quedan. La idea es que las skins, armas, assets y vehículos que
ya existen pasen a ser objetos poseíbles y comerciables, sin inventar contenido
nuevo ni cambiar el mapa. Las skins se pueden conseguir de dos formas: pasando
la misión que las desbloquea en el juego, o comprando/minteando su NFT en el
mercado.

> **Recompensas de misión (`SPEC-045`).** La colección no cambia: las
> recompensas de misión reutilizan los `catalog_id` existentes y añaden
> medallas/trofeos mediante `set_catalog_cap` + `set_catalog_metadata`, sin
> redeploy. El reclamo de una misión lo mintea el backend con un presupuesto
> separado; no se implementa en este spec.

El objetivo del usuario es dar el salto a una economía on-chain:

1. Crear primero un contrato que permita mintear NFTs.
2. Crear después un marketplace que permita venderlos y comprarlos.
3. Hacerlo desde el juego, sin wallet ni extensión, con la sesión de Google que
   ya existe.

Existe una implementación de referencia funcional en otro proyecto local,
`/home/vital/Desktop/near/market`:

- `contracts/mt-token/src/lib.rs`: contrato NEP-245 (mint, burn, transfer,
  metadata, enumeración).
- `contracts/market/src/lib.rs`: marketplace con escrow, `buy` y `cancel`.
- `contracts/deployments/testnet.json`: ejemplo de registro de deploy.
- `src/lib/near/tx.ts`: firma FastAuth/MPC y broadcast manual por JSON-RPC.
- `src/lib/server/relayer.ts`: `sign-tx` y extracción de la firma MPC.
- `src/lib/services/market.ts` y `src/lib/services/mt-token.ts`: lecturas y
  escrituras de ambos contratos.
- `specs/003-market-contract-client.md`: detalle de los problemas resueltos
  (firma en el receipt final, `from_index` de `Option<U128>`, tokens de firma
  viejos, doble copia de `@near-js/transactions`, finality, etc.).

Esa implementación **no se copia tal cual**: el market de referencia usa
SvelteKit con SSR y rutas API propias, mientras que este juego es estático y su
backend es Elysia. La lógica de contratos, firma y servicios sí se reutiliza,
adaptada a la arquitectura del juego.

### Aclaración: NEP-245 sí puede representar NFTs

No hay un estándar NEAR llamado NEP-25. Los estándares relevantes son
**NEP-171** (NFT clásico) y **NEP-245** (multi-token). NEP-245 no es "solo
tokens fungibles": es un contrato multi-token donde cada `token_id` tiene
metadata propia y una supply. Un NFT es simplemente un `token_id` con
`supply = 1`; NEP-245 lo soporta de forma nativa y es la misma primitiva que
usan los marketplaces de referencia.

Este spec usa **NEP-245 con 1 unidad por `token_id` y seriales únicos**:

- Cada mint crea un `token_id` nuevo, por ejemplo `pistol-gold#12`.
- Ese `token_id` tiene supply 1, dueño único y metadata propia: es un NFT.
- La colección puede tener varias copias del mismo ítem (hasta el tope), pero
  cada copia es un NFT distinto y transferible.
- Los topes limitan cuántas copias se emiten en total y cuántas puede mintear
  una misma cuenta, para evitar inflación y acaparamiento.

La alternativa "editions" (un solo `token_id` con supply > 1) también es
NEP-245 válida, pero se descarta porque el market de referencia indexa las
ventas por `(contrato, token_id)` y dos jugadores no podrían listar la misma
edición a la vez. Si se exige NEP-171 puro, el contrato y el marketplace
cambian por completo; queda como pregunta abierta.

### Restricción económica: solo 10 NEAR en testnet

Las cuentas de los jugadores se crean con saldo `0` y la cuenta maestra recibe
**10 NEAR** de testnet. Ese es el presupuesto total para desplegar y operar la
demo, así que el plan original de `0.5 NEAR` por cuenta y `1 NEAR` de faucet no
cabe. El rediseño usa **mint patrocinado**: el relayer crea la cuenta y paga el
depósito del mint a nombre del jugador, así que la cuenta no necesita saldo para
mintear. El jugador recibe `0.05 NEAR` para operar el mercado (listar/comprar) y
como fallback si el presupuesto patrocinado se agota.

Presupuesto propuesto:

| Concepto                     | NEAR | Nota                                                          |
| ---------------------------- | ---: | ------------------------------------------------------------- |
| Deploy NFT                   | 2.76 | WASM `271 290` B (265 KB) + estado; pago por byte             |
| Deploy market                | 2.02 | WASM `201 401` B (197 KB) + estado                            |
| Buffer de deploy             | 0.20 | margen si el WASM crece                                       |
| Buffer de ventas del market  | 0.30 | storage de ventas activas; ~200 ventas                        |
| Mint patrocinado             | 1.00 | ~160 mints a `~0.006`; lo paga el relayer                     |
| Reserva operativa            | 0.50 | gas, faucet y operación; no se toca el pool de jugadores         |
| Pool para jugadores          | 3.50 | ~70 cuentas a `0.05 NEAR`                                     |
| **Total**                    | **10.00** |                                                          |

> **Estado real (2026-11-13).** El deploy se hizo con la cuenta nueva
> `runworld-nep245.testnet`, creada con el faucet de testnet (`near create-account
> --useFaucet`) y **10 NEAR**. Se crearon `nft.runworld-nep245.testnet` y
> `market.runworld-nep245.testnet`, se desplegaron los WASM medidos, se recuperó
> el sobrante y quedan **4.237 NEAR** en el deployer como pool de jugadores y
> reserva del relayer (~84 cuentas a `0.05 NEAR`). La cuenta anterior
> `nep245-market-98a72698.testnet` y el proyecto de referencia quedaron intactos.

Dos reglas para que rinda:

1. **No sobrefondear los contratos, pero dejar buffer de ventas.** El storage se
   paga una vez y queda inmovilizado. La referencia dejó 4.01 + 5.39 = 9.4 NEAR
   atrapados; con 10 NEAR eso no es viable. Crear las subcuentas con un margen
   corto y devolver el sobrante con `near send`. El NFT queda con storage +
   `0.02`; el market queda con storage + `0.30` para las ventas activas.
2. **Mint patrocinado primero, autopago como fallback.** El relayer paga el
   depósito mientras quede presupuesto; cuando se agota, el jugador puede pagar
   su propio mint con el saldo de `0.05`. La UI muestra cuál de los dos aplica.

### Mint patrocinado

`mint(owner_id, catalog_id)` es público y recibe el owner como argumento. Eso
permite que el relayer sea el `predecessor`, pague gas y depósito, y mintee
directo a la cuenta del jugador:

1. El frontend manda `accountId`, `publicKey` y el JWT de Auth0.
2. El backend verifica que `accountId` sea la derivación determinista de
   `publicKey`, que la cuenta exista y contenga esa key, y que el JWT sea válido.
3. Si la cuenta no existe, la crea con `ensure-account` y le transfiere
   `NEW_ACCOUNT_FUNDING_NEAR` (`0.05`).
4. El relayer llama `mint(owner_id = accountId, catalog_id)` con
   `MINT_DEPOSIT_YOCTO` (`0.01`). El contrato usa ~`0.005` de storage y devuelve
   el sobrante al relayer.
5. El jugador recibe el NFT sin firmar la transacción y sin gastar su saldo.

Costo real por mint patrocinado: **~0.005-0.006 NEAR** (storage + gas), no
`0.05`. Con `1 NEAR` se cubren ~160 mints. El fondeo de `0.05 NEAR` de una
cuenta nueva es aparte y sale del pool de jugadores: por eso el límite de
jugadores nuevos es ~70, no 160. Los ~115 NFTs restantes se completan con
autopago o recargando el presupuesto. Listar, comprar y cancelar siguen firmados
por el MPC del jugador porque mueven tokens y NEAR.

Riesgo asumido: un atacante con JWT válido puede pedir mints patrocinados. Se
mitiga con rate limit por `sub`/IP/cuenta, topes globales y por cuenta, el
presupuesto de `1 NEAR` y un `request_id` idempotente. Es una decisión de
testnet; en producción el mint iría con allowlist o NEP-366.

### Capacidad: 10.000 jugadores no caben en 10 NEAR

Aun con el mint más barato posible hay un piso de storage:

| Concepto por jugador       | NEAR    |
| -------------------------- | ------: |
| Crear la cuenta (1 key)    | ~0.0018 |
| Token compacto (sin metadata repetida) | ~0.005 |
| Gas                        | ~0.0003 |
| **Total primer mint**      | **~0.007** |

Con `0.001 NEAR` no se puede: **ni siquiera alcanza para crear la cuenta**. Con
`0.01 NEAR` se paga un mint si el token es compacto, pero no queda margen para
listar ni comprar; por eso el fondeo es `0.05 NEAR` y el mint patrocinado separa
el costo del mint del saldo de trading.

Para 10.000 jugadores que mintean una vez hacen falta **~70 NEAR** solo de
storage, más el deploy. Y crear 10.000 cuentas vacías ya cuesta **~18 NEAR**.
Con 10 NEAR el techo realista es **~70 cuentas fondeadas** a `0.05 NEAR`, no
500-1.000. Esas 70 cuentas sí pueden emitir los 825 NFTs entre todas combinando
patrocinio y autopago, pero no hay 825 jugadores distintos. Aun con
fondos, los topes actuales suman **825 NFTs**: 10.000 jugadores no podrían
mintear sin subir topes o pasar a editions/lazy mint.

Por eso:

- El login **no crea la cuenta on-chain**; se crea en el primer mint. Así
  10.000 logins no cuestan nada.
- El mint se abarata: metadata una vez por catálogo, token compacto y el
  relayer paga el depósito (mint patrocinado).
- Hay un presupuesto de `1 NEAR` para ~160 mints patrocinados. Al agotarse, la
  UI pasa a autopago con el saldo de `0.05`; si tampoco hay saldo, muestra
  "Testnet mint capacity reached" y el mercado sigue en modo lectura.
- La faucet tiene presupuesto diario y reserva; no se vacía de golpe.
- Para 10.000 jugadores reales, el camino es **lazy mint** (inventario
  off-chain hasta la primera venta), una cuenta compartida o más presupuesto
  (~70-100 NEAR). Ninguna combinación de `0.001`/`0.01` lo hace caber en 10.

### ¿Se puede reciclar el saldo de las cuentas?

Parcialmente, y no resuelve el problema:

- **Crear y fondear por CLI sí se puede.**
  `near create-account t-<handle>.testnet --masterAccount <master> --publicKey <pk> --initialBalance 0.05`
  crea la cuenta y descuenta el saldo de la master. Es útil para pruebas o
  cuentas descartables, pero precrear 10.000 cuentas cuesta ~18 NEAR antes de
  que nadie mintee.
- **Devolver el sobrante con `near send` requiere la clave de la cuenta.** En
  el flujo FastAuth la clave la controla el jugador/MPC, no el relayer; el
  backend no puede vaciarle el saldo. Si el relayer conserva una full-access
  key para hacer sweep, se vuelve custodial y puede drenar a los jugadores.
- **`delete_account` también requiere la clave** y devuelve el saldo al
  beneficiario, pero borra la cuenta y deja huérfanos sus NFTs. Solo sirve para
  cuentas de prueba sin tokens.
- **El storage de cada NFT no se recupera al reciclar saldo del jugador.** Vive
  en el contrato NFT (~0.005 NEAR por token) y solo se libera quemando el token
  o migrando el contrato.
- **La creación diferida es mejor que precrear.** Si sólo 825 copias pueden
  existir por los topes, crear 10.000 cuentas por adelantado es gastar 18 NEAR
  para nada.

Conclusión: el reciclaje sirve para cuentas que controla el relayer, no para
10.000 cuentas de jugadores. La solución adoptada es el **mint patrocinado**:
el relayer paga unos `0.006` por mint y el jugador no necesita saldo para
mintear. Listar, comprar y cancelar sí requieren saldo y firma del jugador.

Si los 10 NEAR se agotan, **no hace falta redeployar**: los contratos ya tienen
su storage pagado. Basta con recargar la cuenta del relayer desde el faucet
oficial de testnet o desde otra cuenta. La faucet de la app se apaga sola al
llegar a la reserva.

## 2. Objetivo

Desplegar en testnet una colección NEP-245 propia y un marketplace con escrow,
y conectar ambos al juego para que un jugador con sesión de Google pueda, sin
wallet ni extensión:

1. Mintear un NFT a partir de un ítem del catálogo de la tienda, con un tope
   de emisión por ítem y por cuenta, usando **mint patrocinado** por el relayer.
2. Ver cuántas copias quedan de cada ítem y cuándo está agotado.
3. Ver sus NFTs, el número de serie de cada uno y su saldo NEAR.
4. Poner un NFT en venta con un precio en NEAR.
5. Ver las ventas activas y comprar la de otro jugador.
6. Cancelar una venta propia y recuperar el NFT.

El mint lo paga el relayer y no requiere firma de transacción del jugador.
Listar, comprar y cancelar sí se firman con la MPC de FastAuth a través del
mini-relayer, con estados de carga, errores legibles y relectura posterior.

## 3. Alcance

**Incluye**

- Workspace Rust `contracts/` con dos crates: `nft` (NEP-245) y `market`
  (escrow).
- Contrato NEP-245 con mint, burn, transfer, `mt_transfer_call`, metadata y
  enumeración; 1 unidad por token, seriales únicos y metadata base por catálogo
  para que el token ocupe lo mínimo.
- Creación de cuenta diferida al primer mint: el login solo deriva la cuenta.
- Mint patrocinado por el relayer (`POST /relayer/sponsor-mint`), con
  autopago como fallback cuando se agota el presupuesto.
- Presupuesto de `1 NEAR` para mints patrocinados y estado "capacity reached"
  cuando se agota, sin vaciar al relayer.
- Topes de emisión por ítem del catálogo: global y por cuenta, configurables
  por el owner, con views de supply y errores de agotado.
- Marketplace con whitelist de contratos, `mt_on_transfer`, `buy`, `cancel`,
  callbacks de resolución y views paginadas.
- Tests unitarios de ambos contratos y test de integración en sandbox local
  (deploy → mint → listar → comprar → cancelar → tope agotado).
- Deploy en testnet, registro en `contracts/deployments/testnet.json` y
  variables de entorno públicas/privadas.
- Presupuesto cerrado de 10 NEAR: deploy medido, recuperación del sobrante de
  los contratos, `1 NEAR` de mints patrocinados, `0.05 NEAR` por jugador para
  trading y presupuesto diario de faucet.
- Backend Elysia: `POST /relayer/sign-tx`, `POST /relayer/sponsor-mint`,
  `POST /relayer/ensure-account`, `POST /relayer/fund-account`, validación de
  entrada, rate limits y extracción de la firma MPC.
- Fondeo inicial de cuentas nuevas y faucet acotada para cuentas existentes.
- Núcleo de firma del frontend: `near/tx.ts`, `near/http.ts`, ampliación de
  `near/sdk.ts`, `near/config.ts` y `near/rpc.ts`.
- Servicios `nft/collection.ts`, `nft/market.ts`, `nft/catalog.ts`,
  `nft/poll.ts`, `nft/errors.ts` y store `nftMarket.svelte.ts`.
- UI de mercado: quinta pestaña `Market` dentro del `ShopPanel` existente, con
  sub-pestañas Browse / My NFTs / My listings, formulario de mint, formulario
  de venta, tarjetas, arte/póster, estados y acciones.
- Indicador de supply por ítem (`minted / cap`), estado "Sold out" y cupo
  restante por cuenta en el formulario de mint.
- Balance NEAR, botón de faucet, enlaces al explorer y polling post-transacción.
- Copia en inglés para toda la UI nueva.
- Verificación de tipos, formato, build, `tsc`, tests Rust y pruebas on-chain.

**No incluye**

- NEP-171, approvals NEP-245, royalties, fees de plataforma, subastas u ofertas.
- Editions con supply > 1 por `token_id` o varios vendedores listando la misma
  edición a la vez.
- Economías dinámicas, NPCs con wallet, agentes que operen el mercado o
  NEAR Intents. Este spec deja la colección y el market listos para eso, pero
  no los implementa.
- Subida de imágenes a IPFS: `media` acepta una URL o `ipfs://…` existente.
- Precios en monedas del juego, economía fiat o conversión a otra moneda.
- Meta-transacciones NEP-366: el mint patrocinado de este spec lo resuelve con
  `mint(owner_id)` desde el relayer, sin NEP-366. Listar, comprar y cancelar
  siguen pagados por el jugador.
- Patrocinar compras: el comprador necesita el precio y el gas; el relayer solo
  patrocina el mint.
- Lazy mint o inventario off-chain hasta la primera venta. Es la vía para
  10.000 jugadores, pero cambia el modelo de propiedad y merece su propio spec.
- Mainnet, deploy de producción, gestión de secretos productivos o un cliente
  Auth0 propio.
- Migrar el perfil local (`rw:profile:v1`), las skins o las misiones a la cadena.
- Equipar NFTs en el mundo 3D desde el mercado. La propiedad se lee on-chain;
  aplicar el NFT al personaje/arma queda para otro spec.
- Un indexador o base de datos del mercado: todas las lecturas van por RPC.
- Cambiar el desbloqueo local de las skins: comprar o mintear el NFT de una
  skin no la habilita en el juego. Las misiones siguen siendo la vía de
  desbloqueo local; el NFT es una pieza de colección comerciable.
- Nuevos edificios, kioscos, colliders o cambios en `map.glb`. El mercado se
  abre como una pestaña dentro de la tienda existente.
- Vista 3D dentro del mercado: las tarjetas usan póster/icono para no montar
  decenas de canvas WebGL.
- Tests E2E automatizados de navegador; la validación final es manual.

## 4. Requisitos

### Funcionales

| ID    | Requisito                                                                                                                                                                                                                                                    | Prioridad |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| RF-1  | `contracts/` debe ser un workspace Rust con los crates `nft` y `market`, `rust-toolchain.toml` y perfil de release equivalente al proyecto de referencia.                                                                                                    | alta      |
| RF-2  | El contrato `nft` debe implementar NEP-245: `mint`, `burn`, `mt_transfer`, `mt_batch_transfer`, `mt_transfer_call`, `mt_batch_transfer_call`, `mt_resolve_transfer`, balances, supplies y `mt_token`.                                                          | alta      |
| RF-3  | El contrato `nft` debe implementar metadata y enumeración: `mt_metadata_contract`, `mt_metadata_token_by_token_id`, `mt_metadata_base_by_token_id`, `mt_tokens` y `mt_tokens_for_owner`.                                                                       | alta      |
| RF-4  | Cada `mint` debe crear exactamente 1 unidad de un `token_id` nuevo con formato `<catalogId>#<serial>` (por ejemplo `pistol-gold#12`), exigir un `catalog_id` habilitado y tomar la metadata del catálogo; el token solo guarda `catalog_id` y `serial`. El depósito debe cubrir el storage (~0.005 NEAR) y el sobrante debe devolverse. | alta      |
| RF-5  | El contrato `market` debe implementar `new(owner_id, token_contracts)`, `mt_on_transfer`, `buy`, `cancel`, `add_token_contract`, `remove_token_contract` y las views `get_sale`, `get_sales`, `get_sales_by_seller`, `get_sales_by_contract`.                   | alta      |
| RF-6  | El mercado debe usar escrow: al listar, el token queda en la cuenta del market; al comprar, el market transfiere el token al comprador y solo entonces paga al vendedor; si la transferencia falla, devuelve el NEAR al comprador.                             | alta      |
| RF-7  | El mercado debe rechazar contratos de token que no estén en la whitelist, ventas duplicadas, precios `<= 0`, compras del propio vendedor y cancelaciones de terceros.                                                                                         | alta      |
| RF-8  | Los contratos deben emitir eventos `EVENT_JSON` compatibles con NEP-297: `mt_mint`, `mt_burn`, `mt_transfer`, `sale_created` y `sale_bought`.                                                                                                                 | media     |
| RF-9  | Debe existir un `contracts/README.md` con build, test, deploy, init y ejemplos de `mint`/listar/comprar/cancelar por CLI.                                                                                                                                    | media     |
| RF-10 | El deploy de testnet debe crear `nft.<deployer>.testnet` y `market.<deployer>.testnet`, desplegar ambos WASM con sus `init` y registrar IDs, WASM, args, txs y explorer en `contracts/deployments/testnet.json`.                                              | alta      |
| RF-11 | El mercado debe inicializarse con el contrato NFT en la whitelist y con `owner_id` igual a la cuenta deployer, para poder administrar la whitelist sin claves del contrato.                                                                                   | alta      |
| RF-12 | El frontend debe leer `PUBLIC_NFT_CONTRACT_ID` y `PUBLIC_MARKET_CONTRACT_ID`; si faltan, la UI debe mostrar "Market is not configured" y deshabilitar lecturas/escrituras en vez de llamar a una cuenta vacía.                                                  | alta      |
| RF-13 | El backend debe exponer `POST /relayer/sign-tx` con `{ guard_id, verify_payload, sign_payload, algorithm }`, validar el guard y el payload, llamar `sign` en `fast-auth.testnet` y devolver `{ hash, signature }`.                                             | alta      |
| RF-14 | El relayer debe extraer la firma del `SuccessValue` del último receipt válido (EdDSA `signature[64]` o ECDSA `big_r`/`s`), no del `status` superior de la transacción.                                                                                          | alta      |
| RF-15 | El relayer debe decodificar `sign_payload` y rechazar transacciones cuyo `receiverId` no sea el contrato NFT o el market configurados. Si falta configuración, `sign-tx` debe responder `503`.                                                               | alta      |
| RF-16 | El backend debe exponer `POST /relayer/fund-account` con `{ accountId, publicKey }`, verificar que la cuenta existe y contiene esa public key, y transferir una cantidad acotada solo si el saldo está por debajo del umbral.                                  | alta      |
| RF-17 | Las cuentas nuevas deben recibir `NEW_ACCOUNT_FUNDING_NEAR` (por defecto `0.05`) al crearse; ese saldo es para listar/comprar y como fallback de mint, no para el mint patrocinado. Si la transferencia falla, la creación sigue siendo exitosa y la UI ofrece la faucet. La creación on-chain se difiere al primer mint. | alta      |
| RF-18 | La faucet debe tener rate limit por cuenta (1 vez/24 h), rate limit por IP, presupuesto diario (`FAUCET_DAILY_BUDGET_NEAR`) y una reserva mínima del relayer (`RELAYER_RESERVE_NEAR`) para no vaciarlo.                                                     | alta      |
| RF-19 | El frontend debe implementar `callMethod(accountId, contractId, method, args, { gas, deposit })` con el flujo FastAuth/MPC: access key, block hash, `requestTransactionSignature`, `getSignatureRequest`, `sign-tx`, comparación de bytes y `send_tx`. | alta      |
| RF-20 | Antes de difundir, el cliente debe comparar los bytes aprobados por Google con `encodeTransaction(tx)`; si no coinciden, debe abortar con un mensaje claro.                                                                                                  | alta      |
| RF-21 | El cliente debe limpiar los tokens de firma viejos de Auth0 antes de abrir el popup, para que la MPC no firme bytes de una transacción anterior.                                                                                                              | alta      |
| RF-22 | El frontend debe añadir `viewArray`, `explorerTxUrl` y un `jsonRpc` con `id`/`errorPrefix` reutilizable a `near/rpc.ts`.                                                                                                                                       | media     |
| RF-23 | Debe existir `nft/collection.ts` con `getOwnedTokens`, `getTokenMetadata`, `balanceOf`, `mint` y `listForSale`, usando `from_index: null` (nunca `0` numérico) para `mt_tokens_for_owner`.                                                                     | alta      |
| RF-24 | Debe existir `nft/market.ts` con `getSales`, `getSale`, `getSalesBySeller`, `getListings`, `getListingsBySeller`, `buy` y `cancel`; `getListings` debe decorar las ventas con metadata y tolerar fallos de metadata.                                           | alta      |
| RF-25 | Debe existir `nft/catalog.ts` que normalice `SKINS`, `SHOP_WEAPONS`, `SHOP_ASSETS` y `SHOP_VEHICLES` en `MintableCatalogItem`, derive la metadata base para el `init` del contrato, guarde `catalogId`/`model`/`accent`/`badge`/`kind` en `extra` y sepa reconstruir el arte desde `extra`. | alta      |
| RF-26 | El store `nftMarket.svelte.ts` debe exponer `active`, `tab`, `sales`, `owned`, `listings`, `catalogStats`, `balanceYocto`, `capacityReached`, `mintMode`, `sponsoredMintAvailable`, `loading`, `busy`, `error`, `notice` y las acciones `setActive`, `setTab`, `refresh`, `mint`, `list`, `buy`, `cancel`, `fund`. | alta      |
| RF-27 | La pestaña `Market` debe renderizar sub-pestañas Browse, My NFTs y My listings dentro del mismo `role="dialog"` de la tienda, compartiendo backdrop, X y Escape; no debe crear un segundo modal ni un botón en el HUD.                                       | alta      |
| RF-28 | Browse debe listar las ventas activas con arte, título, vendedor, precio y botón Buy; las ventas propias deben mostrar "Your listing" sin botón de compra.                                                                                                   | alta      |
| RF-29 | My NFTs debe listar los tokens del jugador con arte, título y botón Sell; debe permitir mintear un NFT del catálogo sin pedir metadata (todo viene de la metadata base).                                                                                         | alta      |
| RF-30 | My listings debe listar solo las ventas del jugador y permitir cancelarlas; al cancelar, el token debe volver a My NFTs.                                                                                                                                      | alta      |
| RF-31 | El formulario de venta debe aceptar un precio en NEAR, validarlo (> 0 y sin más de 24 decimales) y mostrar el precio en yoctoNEAR antes de confirmar.                                                                                                         | alta      |
| RF-32 | La UI debe mostrar el saldo NEAR, deshabilitar mint si no hay patrocinio disponible **y** el saldo es menor a `0.015 NEAR`, o si el ítem está agotado, la cuenta llegó a su cupo o no queda capacidad; debe ofrecer "Fund testnet wallet" cuando falte saldo y "Free mint" cuando el relayer patrocine.                          | alta      |
| RF-33 | La UI debe mostrar errores legibles de RPC, relayer, MPC, contrato y popup, sin stack traces; los errores de contrato deben traducirse (por ejemplo "Not enough NEAR", "Sale not found", "This token is already listed").                                      | alta      |
| RF-34 | Cada token y venta debe enlazar al explorer de testnet (cuenta y tx); el panel debe mostrar la cuenta corta y el contrato activo.                                                                                                                             | media     |
| RF-35 | Después de mint/listar/comprar/cancelar, la UI debe refrescar con `optimistic` y, si hace falta, caer a `final`; nunca debe quedarse mostrando estado viejo.                                                                                                  | alta      |
| RF-36 | El mercado no debe montar canvas 3D en las tarjetas; usa póster/icono del catálogo o `media` como imagen.                                                                                                                                                     | media     |
| RF-37 | La pestaña Market debe heredar el cierre de la tienda (`X`, `Escape`, backdrop) sin añadir su propio backdrop ni listener de Escape; el foco inicial sigue yendo al botón de cerrar de la tienda.                                                              | alta      |
| RF-38 | Al cerrar la tienda, abrir chat o ajustes, empezar a conducir, cambiar de escena o activar el onboarding, la vista de mercado debe dejar de sondear y limpiar sus timers. Mientras la tienda siga abierta, el sondeo continúa en cualquiera de las cinco pestañas.                                              | alta      |
| RF-39 | Toda la copia nueva de UI debe estar en inglés.                                                                                                                                                                                                                | alta      |
| RF-40 | La pestaña Market debe ser usable a `390×844`: sub-pestañas desplazables, botones de al menos 44 px, tarjetas apiladas y sin overflow horizontal.                                                                                                          | media     |
| RF-41 | El contrato NFT debe guardar por `catalog_id` un tope global (`cap`) y un tope por cuenta (`per_account_cap`), fijados en `init` y ajustables con `set_catalog_cap` (solo owner); un tope no puede bajar por debajo de lo ya minteado.                          | alta      |
| RF-42 | `mint` debe rechazar catálogos no habilitados, mints que superen el tope global y mints que superen el tope por cuenta, devolviendo el depósito y sin crear el token.                                                                                        | alta      |
| RF-43 | Las views `get_catalog_supply`, `get_catalog_supplies` y `get_account_minted` deben devolver `{ catalog_id, cap, minted, per_account_cap }` y los mints por cuenta; `minted` es monótono y no disminuye al quemar, porque el cupo es de emisión, no de circulación. | alta      |
| RF-44 | El deploy debe inicializar los topes por defecto: skins `50` global / `5` por cuenta, armas `25` / `3`, assets `50` / `5`, vehículos `25` / `3`. Los números quedan en `contracts/deployments/testnet.json` y como fallback en `nft/catalog.ts`.                                | alta      |
| RF-45 | El catálogo mintable debe mostrar por ítem `minted / cap`, marcar `Sold out` cuando no queden copias y calcular el cupo restante de la cuenta como `min(per_account_cap - accountMinted, cap - minted)`.                                                      | alta      |
| RF-46 | Tras un mint, la UI debe mostrar el número de serie del token (por ejemplo `Golden Pistol #12`) y el detalle del token debe conservarlo.                                                                                                                      | media     |
| RF-47 | El mercado debe ser una quinta pestaña dentro del `ShopPanel` existente, no un modal ni un botón nuevo del HUD; la tienda se sigue abriendo desde su kiosco y entra por Skins como hoy.                                                                       | alta      |
| RF-48 | El deploy debe medir el `storage_usage` real de cada contrato y devolver a la cuenta maestra el sobrante con `near send`: el NFT deja storage + `0.02 NEAR`; el market deja storage + `MARKET_STORAGE_BUFFER_NEAR` (`0.30`) para ventas activas.                                                                               | alta      |
| RF-49 | El backend debe exponer el presupuesto restante (reserva + patrocinio) y apagar faucet y `sponsor-mint` con `503` cuando el saldo del relayer caiga por debajo de `RELAYER_RESERVE_NEAR`; la UI debe mostrar "Testnet funds are running low". | alta      |
| RF-50 | La metadata de los 20 ítems debe guardarse una sola vez por `catalog_id` (`catalog_metadata`) y cada token debe referenciarla; `mt_metadata_token_by_token_id` sintetiza título, descripción y `extra` con `catalogId`/`serial` sin duplicar el JSON en cada token. | alta      |
| RF-51 | El backend debe llevar un presupuesto de mints patrocinados (`SPONSORED_MINT_BUDGET_NEAR`); al agotarse, la UI pasa a autopago con el saldo del jugador y, si tampoco alcanza, muestra "Testnet mint capacity reached" sin romper la sesión.                     | alta      |
| RF-52 | El backend debe exponer `POST /relayer/sponsor-mint` con `{ accountId, publicKey, catalogId, token, request_id }`; debe validar el JWT, derivar `accountId` desde `publicKey`, asegurar la cuenta y llamar `mint(owner_id = accountId, catalog_id)` desde el relayer. | alta      |
| RF-53 | El mint patrocinado debe pagar `MINT_DEPOSIT_YOCTO` desde el relayer y quedarse con el sobrante que devuelve el contrato; el jugador no firma ni gasta saldo.                                                                                                 | alta      |
| RF-54 | `sponsor-mint` debe ser idempotente por `request_id`, tener rate limit por `sub`/IP/cuenta, respetar topes on-chain y responder `429`/`503` sin difundir una transacción cuando no corresponda.                                                                 | alta      |
| RF-55 | La UI debe intentar el mint patrocinado primero, mostrar "Free mint" mientras haya presupuesto y caer a autopago firmado por MPC cuando se agote; nunca debe abrir el popup de Auth0 para un mint patrocinado.                                                     | alta      |
| RF-56 | El modo de mint debe quedar visible en el formulario (`Sponsored` / `0.01 NEAR` / deshabilitado) y el store debe refrescar `sponsoredMintAvailable` después de cada mint o al recibir `429`/`503`.                                                             | media     |
| RF-57 | Cada pestaña de la tienda (Skins, Weapons, Assets, Vehicles) debe mostrar en el detalle del ítem seleccionado un CTA `Mint NFT` con `minted / cap`, `Free mint` o `Mint · 0.01 NEAR`, `Sold out`, cupo por cuenta y el motivo cuando esté deshabilitado, sin obligar a ir a la pestaña Market. | alta      |
| RF-58 | La tienda debe mantener `nftMarket` activo y sondeando mientras esté abierta, en cualquiera de sus cinco pestañas; un mint desde una pestaña de catálogo debe refrescar el contador y My NFTs sin recargar la página.                                      | alta      |
| RF-59 | Las 11 skins deben ser minteables como NFT con su nombre, descripción, arte e ícono propios; el NFT no cambia el desbloqueo local ni el equipado de la skin, que siguen dependiendo de las misiones.                                                     | alta      |

### No funcionales

| ID     | Requisito              | Criterio                                                                                                                     |
| ------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| RNF-1  | Type safety.           | `cd frontend && bun run check` termina con 0 errores.                                                                        |
| RNF-2  | Formato.               | `cd frontend && bun run lint` pasa para todos los archivos tocados.                                                           |
| RNF-3  | Build.                 | `cd frontend && bun run build` termina correctamente y genera el sitio estático.                                             |
| RNF-4  | Backend.               | `cd backend && bunx tsc --noEmit` termina sin errores.                                                                        |
| RNF-5  | Contratos.             | `cd contracts && cargo test --lib` y el test de sandbox pasan; los dos WASM compilan con `cargo near build`.                 |
| RNF-6  | Seguridad de claves.   | `RELAYER_PRIVATE_KEY` vive solo en `backend/.env`; no aparece en el bundle ni en respuestas.                                  |
| RNF-7  | Rendimiento de lectura. | Las views usan `fetch` JSON-RPC directo, sin cargar `near-api-js` en el listado; 50 ventas y 100 tokens por página como máximo. |
| RNF-8  | Resiliencia.           | El relayer serializa sus transacciones (una sola access key); los receipts se sondean con `optimistic` y fallback `final`.    |
| RNF-9  | Integridad.            | El cliente compara bytes antes de difundir; el market valida vendedor, precio y whitelist; el comprador no puede ser el vendedor. |
| RNF-10 | SSR safety.            | Ningún SDK de FastAuth, Auth0, `near-api-js` o `window` se evalúa en SSR; imports dinámicos y polyfills.                     |
| RNF-11 | Accesibilidad.         | `role="dialog"`, `aria-modal`, `aria-labelledby`, tabs con `aria-selected`/`aria-controls`, foco visible, `role="alert"`/`aria-live`. |
| RNF-12 | Sin regresiones.       | Login, Guardian, kioscos, tienda, chat, coches y minijuegos siguen funcionando.                                              |
| RNF-13 | Sin backend de estado. | El mercado no guarda ventas en el backend; la cadena es la fuente de verdad.                                                  |
| RNF-14 | Mobile.                | Sin overflow horizontal ni solapamiento con los controles táctiles a `390×844`.                                               |

## 5. Criterios de aceptación

- [x] CA-1: `cd contracts && cargo test --lib` pasa para `nft` y `market`.
- [x] CA-2: El test de sandbox despliega ambos contratos y completa mint → listar → comprar → cancelar y los casos de error.
- [x] CA-3: `nft.<deployer>.testnet` y `market.<deployer>.testnet` existen en testnet; `mt_metadata_contract` devuelve `spec: "mt-1.0.0"` y `get_token_contracts` incluye el NFT.
- [ ] CA-4: Un jugador con sesión puede mintear un ítem del catálogo desde la pestaña de su categoría (Skins, Weapons, Assets o Vehicles) y el NFT aparece en My NFTs sin recargar la página, con su número de serie y el contador `minted / cap` actualizado.
- [ ] CA-5: Al poner el NFT en venta, desaparece de My NFTs, aparece en My listings y el market queda como owner del token en escrow.
- [ ] CA-6: Otro jugador ve la venta en Browse, paga el precio exacto y recibe el NFT; el vendedor recibe el NEAR y la venta desaparece.
- [ ] CA-7: El vendedor ve su propia venta como "Your listing" y no puede comprarla.
- [ ] CA-8: El vendedor cancela su venta y el NFT vuelve a My NFTs.
- [ ] CA-9: Con sesión iniciada y saldo `0`, el mint patrocinado funciona sin popup de Auth0 y sin gastar saldo del jugador; cuando el presupuesto patrocinado se agota, Mint pasa a autopago y con saldo menor a `0.015 NEAR` queda deshabilitado con el motivo visible; "Fund testnet wallet" acredita `0.05 NEAR` y permite el autopago.
- [x] CA-10: `POST /relayer/sign-tx` rechaza `guard_id` inválido con `400` y un JWT falso con `502` legible; no difunde una transacción inválida.
- [ ] CA-11: Si los bytes aprobados no coinciden con la transacción local, el cliente aborta antes de `send_tx`.
- [x] CA-12: `POST /relayer/sign-tx` rechaza una transacción cuyo `receiverId` no es el NFT ni el market.
- [x] CA-13: La faucet rechaza una cuenta que no contiene la `publicKey`, una cuenta ya fondeada, respeta los rate limits y el presupuesto diario.
- [x] CA-14: El bundle del frontend no contiene `RELAYER_PRIVATE_KEY` ni claves de contrato.
- [x] CA-15: `bun run check`, `bun run lint`, `bun run build` y `bunx tsc --noEmit` pasan.
- [ ] CA-16: A `390×844`, el panel no desborda horizontalmente, las pestañas se desplazan y todos los botones miden al menos 44 px.
- [ ] CA-17: Con la tienda abierta en la pestaña Market, `WASD` no mueve al jugador y `E` no abre kioscos, gatos o NPCs; al cerrar la tienda, el input vuelve.
- [ ] CA-18: Abrir chat, ajustes, conducir o cambiar de escena cierra la tienda y la vista de mercado deja de sondear.
- [ ] CA-19: El mercado muestra póster/icono o imagen, nunca un canvas 3D por tarjeta; no aparecen warnings de contexto WebGL.
- [x] CA-20: Todas las cadenas nuevas de UI están en inglés.
- [x] CA-21: `contracts/deployments/testnet.json` registra IDs, WASM, args, topes, txs de deploy y explorer.
- [x] CA-22: `backend/` sigue compilando y el protocolo WebSocket no cambia.
- [x] CA-23: Llamar `mint` por CLI más allá del tope global o del tope por cuenta falla con un mensaje legible y devuelve el depósito.
- [ ] CA-24: Al agotarse un ítem, el catálogo muestra `Sold out` y el botón Mint queda deshabilitado tanto en el Market como en la pestaña de su categoría; los demás ítems siguen disponibles.
- [ ] CA-25: `get_catalog_supplies` coincide con los contadores de la UI después de varios mints y de un burn.
- [ ] CA-26: La pestaña Market se abre desde el kiosco de la tienda y comparte `X`/Escape/backdrop; no existe un botón nuevo en el HUD ni un segundo `role="dialog"`.
- [x] CA-27: Tras el deploy, el balance del NFT es `storage_usage × 10^-5 NEAR + 0.02` como máximo y el del market es `storage_usage × 10^-5 NEAR + 0.30`; el sobrante volvió a la cuenta maestra y ambos contratos siguen respondiendo.
- [ ] CA-28: Con el relayer por debajo de `RELAYER_RESERVE_NEAR`, `fund-account` y `sponsor-mint` responden `503` y la UI muestra "Testnet funds are running low" sin romper el resto del mercado.
- [x] CA-29: Un mint con `0.01 NEAR` de depósito tiene éxito, devuelve el sobrante y deja `storage_usage` del contrato por debajo de lo que costaría duplicar la metadata; el segundo mint del mismo catálogo no vuelve a escribir la metadata base.
- [ ] CA-30: Iniciar sesión con Google no crea una cuenta on-chain; la cuenta aparece recién en el primer mint y consume una sola creación.
- [ ] CA-31: Al agotarse el presupuesto de mints patrocinados, la UI pasa a autopago; si el jugador tampoco tiene saldo, muestra "Testnet mint capacity reached", el mercado sigue listando y comprando, y no se rompe la sesión.
- [ ] CA-32: Una cuenta con saldo `0` puede mintear por `POST /relayer/sponsor-mint`; el NFT queda en `mt_tokens_for_owner` del jugador y el depósito sobrante vuelve al relayer, no al jugador.
- [ ] CA-33: `sponsor-mint` rechaza un `accountId` nuevo que no sea `deriveAccountId(publicKey)` ni el handle automático derivado, una `publicKey` que no esté en las access keys de la cuenta y un JWT con firma/audience/issuer inválidos; no crea una cuenta arbitraria ni difunde transacción.
- [ ] CA-34: Repetir el mismo `request_id` devuelve la misma respuesta sin un segundo mint; superar el rate limit por `sub`/IP/cuenta devuelve `429`, y sin presupuesto o por debajo de la reserva devuelve `503`.
- [ ] CA-35: Si el presupuesto patrocinado se agota a mitad de una sesión, el siguiente mint se firma con MPC y paga `0.01 NEAR` del saldo del jugador; la UI cambia la etiqueta sin recargar.
- [ ] CA-36: El flujo patrocinado no abre el popup de Auth0 ni envía `sign-tx`; solo usa el JWT de sesión para autenticar la llamada al backend.
- [ ] CA-37: Las pestañas Skins, Weapons, Assets y Vehicles muestran el CTA de mint en el detalle del ítem seleccionado, con `Free mint` / `Mint · 0.01 NEAR`, `minted / cap`, cupo por cuenta y `Sold out`; no hace falta cambiar a la pestaña Market.
- [ ] CA-38: Las 11 skins aparecen en el catálogo mintable con su nombre, descripción, arte e ícono propios; mintear o comprar una skin no la desbloquea ni la equipa en el juego.
- [ ] CA-39: Con la tienda abierta en cualquier pestaña, el mercado sigue activo y refresca el supply; un mint desde una pestaña de catálogo actualiza el contador y My NFTs sin recargar.

## 6. Archivos relevantes

| Ruta                                                                       | Acción    | Motivo                                                                                       |
| -------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------- |
| `contracts/Cargo.toml`                                                     | crear     | Workspace Rust con `nft` y `market`.                                                          |
| `contracts/rust-toolchain.toml`                                            | crear     | Toolchain `1.95.0` + target `wasm32-unknown-unknown`.                                        |
| `contracts/.gitignore`                                                     | crear     | Ignorar `target/`, `.near-credentials/` y `.env`.                                             |
| `contracts/nft/Cargo.toml`                                                 | crear     | Crate del contrato NEP-245.                                                                   |
| `contracts/nft/src/lib.rs`                                                 | crear     | Mint, burn, transfer, metadata, enumeración, topes y eventos.                                 |
| `contracts/market/Cargo.toml`                                              | crear     | Crate del marketplace (incluye dev-deps de sandbox).                                          |
| `contracts/market/src/lib.rs`                                              | crear     | Escrow, whitelist, `buy`, `cancel`, callbacks y views.                                        |
| `contracts/market/tests/market_flow.rs`                                    | crear     | Test de integración en sandbox: deploy, mint, listar, comprar, cancelar y errores.            |
| `contracts/deployments/testnet.json`                                       | crear     | Registro del deploy y de las txs de prueba.                                                   |
| `contracts/README.md`                                                      | crear     | Build, test, deploy, init y ejemplos CLI.                                                     |
| `contracts/scripts/near.sh`                                                | crear     | Helper para usar credenciales locales con `near-cli`.                                         |
| `frontend/.env.example`                                                    | modificar | Añadir `PUBLIC_NFT_CONTRACT_ID`, `PUBLIC_MARKET_CONTRACT_ID` y overrides de red/RPC.          |
| `frontend/src/lib/near/config.ts`                                          | modificar | Contratos, guard, audience, gas, depósitos y URLs del relayer.                                |
| `frontend/src/lib/near/http.ts`                                            | crear     | `postJson` compartido por auth y firma.                                                       |
| `frontend/src/lib/near/sdk.ts`                                             | modificar | Añadir `loadTransactionSdk` y `loadSigningSdk`.                                               |
| `frontend/src/lib/near/rpc.ts`                                             | modificar | `viewArray`, `explorerTxUrl` y opciones de `jsonRpc`.                                         |
| `frontend/src/lib/near/tx.ts`                                              | crear     | Firma FastAuth/MPC, comparación de bytes y broadcast.                                         |
| `frontend/src/lib/near/format.ts`                                          | crear     | `formatNear`, `parseNear`, `shortAccount`, `tokenTitle`.                                      |
| `frontend/src/lib/near/auth.ts`                                            | modificar | Reutilizar `http.ts`; añadir `getIdentityToken()` (ID token de Auth0).                          |
| `frontend/src/lib/near/errors.ts`                                          | modificar | Mensajes para popup cerrado, JWT expirado, MPC y rate limit.                                  |
| `frontend/src/lib/nft/config.ts`                                           | crear     | Tipos de metadata, token, venta, listing, supply y constantes de gas/depósito.                |
| `frontend/src/lib/nft/collection.ts`                                       | crear     | Lecturas, supply por catálogo y escrituras del contrato NFT.                                   |
| `frontend/src/lib/nft/market.ts`                                           | crear     | Lecturas, decoración con metadata, `buy` y `cancel`.                                          |
| `frontend/src/lib/nft/catalog.ts`                                          | crear     | Catálogo mintable, topes fallback y mapeo `ShopItem` → metadata/`extra`.                       |
| `frontend/src/lib/nft/poll.ts`                                             | crear     | Sondeo post-transacción.                                                                      |
| `frontend/src/lib/nft/errors.ts`                                           | crear     | Traducción de errores de contrato y mercado.                                                  |
| `frontend/src/lib/state/nftMarket.svelte.ts`                               | crear     | Store reactivo del mercado con runes.                                                         |
| `frontend/src/lib/components/market/MarketView.svelte`                     | crear     | Contenido del mercado embebido en la pestaña Market del shop.                                  |
| `frontend/src/lib/components/market/MarketTabs.svelte`                     | crear     | Tablist accesible Browse / My NFTs / My listings.                                             |
| `frontend/src/lib/components/market/NftCard.svelte`                         | crear     | Tarjeta reutilizable para NFT o venta.                                                        |
| `frontend/src/lib/components/market/NftArt.svelte`                          | crear     | Póster/icono del catálogo o `media` como imagen.                                              |
| `frontend/src/lib/components/market/MintNftForm.svelte`                    | crear     | Formulario de mint con catálogo, supply, cupo y metadata base.                                |
| `frontend/src/lib/components/market/ListForSaleForm.svelte`                | crear     | Precio en NEAR, validación y resumen en yoctoNEAR.                                            |
| `frontend/src/lib/components/market/MarketBalance.svelte`                  | crear     | Cuenta, saldo, faucet y enlaces.                                                              |
| `frontend/src/lib/components/ui/ShopPanel.svelte`                          | modificar | Quinta pestaña Market y montaje de `<MarketView />` dentro del mismo diálogo.                  |
| `frontend/src/lib/components/ui/ShopTabBar.svelte`                         | modificar | Aceptar la pestaña Market en el tablist existente.                                            |
| `frontend/src/lib/components/ui/shopCatalog.ts`                            | modificar | Añadir el tipo/definición de la pestaña Market y los topes fallback del catálogo.             |
| `frontend/src/lib/components/ui/shopUi.ts`                                 | modificar | Icono de la pestaña Market en `SHOP_TAB_ICONS`.                                               |
| `backend/.env.example`                                                      | modificar | Contratos, guard, faucet, fondeo inicial, Auth0 y presupuesto de patrocinio.                  |
| `backend/src/server/relayer.ts`                                             | modificar | `relaySignTx`, `extractSignature`, `ensureAccount`, `relayFundAccount`, `sponsorMint`, presupuesto y validación de tx. |
| `backend/src/server/auth0.ts`                                               | crear     | Verificación de JWT con JWKS, `aud`/`iss` y cache de claves.                                  |
| `backend/src/routes/relayer.ts`                                             | modificar | Rutas `sign-tx`, `ensure-account`, `fund-account`, `sponsor-mint` y `status` con rate limits. |
| `backend/src/index.ts`                                                      | sin cambio | El plugin `relayerRoutes` ya está registrado.                                                 |
| `specs/SPEC-034-tienda-tabs-catalogo.md`                                    | modificar | Enlazar este spec como la economía que sigue al catálogo.                                     |
| `specs/SPEC-036-inicio-sesion-google-near-fast-auth.md`                     | modificar | Nota: este spec supersede el "sin funding" para testnet.                                      |

## 7. Plan de implementación

### Fase 1 — Contratos Rust

- [x] Paso 1: Crear `contracts/Cargo.toml` (workspace `nft`, `market`),
      `contracts/rust-toolchain.toml` (`1.95.0`, `wasm32-unknown-unknown`) y
      `contracts/.gitignore` (`target/`, `.near-credentials/`, `.env`).
- [x] Paso 2: Crear `contracts/nft` copiando la base de
      `near/market/contracts/mt-token` y renombrando el crate a `nft`.
      Mantener la semántica probada:
      - `init(name, owner_id, catalog_caps, catalog_metadata)` con
        `CatalogCap { catalog_id, cap, per_account_cap }` y
        `CatalogMetadata { catalog_id, title, description, media, reference }`;
        `mint(owner_id, catalog_id)`, `set_catalog_metadata` (solo owner),
        `burn`.
      - `mt_transfer`, `mt_batch_transfer`, `mt_transfer_call`,
        `mt_batch_transfer_call`, `mt_resolve_transfer`.
      - `mt_balance_of`, `mt_batch_balance_of`, `mt_supply`,
        `mt_batch_supply`, `mt_token`.
      - `mt_tokens`, `mt_tokens_for_owner`, metadata por token y base.
      - `get_owner_id`, `get_catalog_supply`, `get_catalog_supplies`,
        `get_catalog_metadata`, `set_catalog_cap`.
      - `mint` exige un `catalog_id` habilitado con metadata base, crea 1
        unidad con `token_id = "<catalog_id>#<serial>"`, guarda solo
        `TokenInfo { owner, catalog_id, serial }` y devuelve el storage
        sobrante. `from_index` es `Option<U128>`.
      - Mapas `catalog_caps`, `catalog_minted` (monótono) y `account_minted`;
        `mint` rechaza tope global o por cuenta superado sin crear el token y
        devolviendo el depósito.
- [x] Paso 3: Añadir tests unitarios al contrato `nft`: mint crea 1 unidad con
      serial correcto, mint sin depósito falla, mint sin metadata base falla,
      transfer mueve balance, `mt_transfer_call` mueve balance,
      `mt_resolve_transfer` reembolsa lo no usado, metadata sintetizada desde
      el catálogo, tope global, tope por cuenta, catálogo desconocido,
      `set_catalog_cap`/`set_catalog_metadata` solo owner y burn no baja
      `minted`.
- [x] Paso 4: Crear `contracts/market` copiando
      `near/market/contracts/market` y ajustando nombres:
      - `new(owner_id, token_contracts)`, `add_token_contract`,
        `remove_token_contract`.
      - `mt_on_transfer`, `buy`, `cancel`, `resolve_buy`, `resolve_cancel`.
      - `get_sale`, `get_sales`, `get_sales_by_seller`, `get_sales_by_contract`.
      - Whitelist, precio > 0, no listar dos veces, no comprar la propia venta.
- [x] Paso 5: Añadir tests unitarios al market: listar, whitelist, doble
      listado, compra con depósito, compra sin depósito, cancelación del
      vendedor y cancelación de terceros.
- [x] Paso 6: Portar `contracts/market/tests/market_flow.rs` del proyecto de
      referencia, ajustando rutas de WASM a `target/near/nft/nft.wasm` y
      `target/near/market/market.wasm`.
- [x] Paso 7: Crear `contracts/README.md` y `contracts/scripts/near.sh` con
      build, test, deploy, init y ejemplos CLI de mint/listar/comprar/cancelar.

### Fase 2 — Deploy en testnet

- [x] Paso 1: Compilar los WASM y anotar tamaños:
      `(cd contracts/nft && cargo near build non-reproducible-wasm)` y
      `(cd contracts/market && cargo near build non-reproducible-wasm)`.
      Medido: NFT `271 290` bytes (265 KB, SHA-256 `03438444…`) y market
      `201 401` bytes (197 KB, SHA-256 `44607bfe…`), ambos por debajo de
      300 KB. Tamaños y hashes quedan en `contracts/deployments/testnet.json`.
- [x] Paso 2: Verificar el saldo de la cuenta maestra (10 NEAR) y crear las
      subcuentas con saldo acotado, no con 5 NEAR:
      `near create-account nft.<deployer>.testnet --masterAccount <deployer>.testnet --initialBalance 2.6`
      y lo mismo para `market.<deployer>.testnet` con `2.4` (storage ~2.05 +
      buffer de ventas `0.30`).
      Hecho con `runworld-nep245.testnet` (faucet, 10 NEAR): subcuentas
      `nft.…` con `3` NEAR y `market.…` con `2.2` NEAR.
- [x] Paso 3: Desplegar el NFT con
      `{"name":"RunWorld Collection","owner_id":"<deployer>.testnet","catalog_caps":[...],"catalog_metadata":[...]}`
      usando los topes de §7.1 (armas 25/3, assets 50/5, vehículos 25/3) y la
      metadata base de los 9 ítems originales de `shopCatalog.ts`.
      Tx `6wNK9ZBLZjptS3KJmZMy8J8BLFrSwv9RjkRH1brj1tif`.
      Las 11 skins se agregaron después sin redeploy con
      `set_catalog_cap` + `set_catalog_metadata` (50/5 cada una; txs en
      `contracts/deployments/testnet.json`).
- [x] Paso 4: Desplegar el market con
      `{"owner_id":"<deployer>.testnet","token_contracts":["nft.<deployer>.testnet"]}`.
      Tx `m4dvTB5LCRMpS9SPiPjVqT7oT92TLyCYxDJsjr4Uuk7`.
- [x] Paso 5: Recuperar el sobrante. Consultar `storage_usage` y `amount` de
      cada contrato, calcular `requerido = usage × 10⁻⁵ NEAR + margen` (NFT
      `0.02`, market `0.30`), y enviar el exceso a la cuenta maestra con
      `near send <contrato> <deployer> <exceso>`. Verificar que ambos
      contratos siguen respondiendo después del envío.
      NFT: `0.21` devueltos (buffer `0.0216`). Market: `0.12` añadidos para
      llegar al buffer `0.2999`.
- [x] Paso 6: Verificar por CLI `mt_metadata_contract`, `get_token_contracts`,
      `get_catalog_metadata`, `get_catalog_supplies` y `get_sales`; registrar
      IDs, WASM, tamaños, balances finales, args, topes, hashes y explorer en
      `contracts/deployments/testnet.json`. Verificado: `mt-1.0.0`, 9 topes,
      `get_token_contracts = ["nft.runworld-nep245.testnet"]`.
- [x] Paso 7: Actualizar `frontend/.env.example` y `backend/.env.example` con
      los nombres de las variables (sin claves privadas). El `.env` real queda
      gitignored.
- [x] Paso 8: Smoke test por CLI con una cuenta de prueba fondeada con `0.05`
      NEAR: mint con depósito `0.01`, listar a `0.005`, comprar con otra
      cuenta, cancelar, confirmar balances y comprobar que el cuarto mint del
      mismo ítem se rechaza por el tope por cuenta. Anotar el saldo restante de
      la cuenta maestra.
      Ejecutado: mint `pistol-gold#1`, listado `0.1`, compra, mint
      `pistol-gold#2`, listado `0.05` y cancelación. Tope por cuenta: tres
      `skateboard` OK y el cuarto falla con `Account mint limit reached`.
      Deployer final: `4.355 NEAR`.

### Fase 3 — Backend: firma, faucet y mint patrocinado

- [x] Paso 1: Ampliar `backend/src/server/relayer.ts` con:
      - `FAST_AUTH_CONTRACT_ID`, `FAST_AUTH_GUARD_ID`, `NFT_CONTRACT_ID`,
        `MARKET_CONTRACT_ID`, `NEW_ACCOUNT_FUNDING_NEAR` (0.05),
        `FAUCET_AMOUNT_NEAR` (0.05), `FAUCET_MIN_BALANCE_NEAR` (0.03),
        `FAUCET_DAILY_BUDGET_NEAR` (0.5), `RELAYER_RESERVE_NEAR` (0.5),
        `SPONSORED_MINT_BUDGET_NEAR` (1), `MINT_DEPOSIT_YOCTO` (0.01),
        `AUTH0_ISSUER`, `AUTH0_JWKS_URI`, `AUTH0_AUDIENCE`.
      - `SIGN_GAS = 300 TGas` y `SIGN_DEPOSIT_YOCTO = 1`.
      - `assertSignRequest(body)` con guard, algoritmo (`eddsa`, `ecdsa`,
        `secp256k1`), `verify_payload` no vacío y `sign_payload` de bytes 0-255.
      - `Transaction.decode` sobre `sign_payload` y validación de `receiverId`
        contra `NFT_CONTRACT_ID`/`MARKET_CONTRACT_ID`. Si falta configuración,
        lanzar un error 503.
      - `relaySignTx` con `fast-auth.testnet.sign` y `extractSignature` sobre
        el `SuccessValue` del último receipt válido.
- [x] Paso 2: Ampliar `relayCreateAccount` para transferir
      `NEW_ACCOUNT_FUNDING_NEAR` después de crear la cuenta. Si la transferencia
      falla, devolver `funded: false` sin romper el alta. Exponerlo como
      `POST /relayer/ensure-account` y llamarlo **solo en el primer mint**, no
      en el login; así 10.000 logins no crean 10.000 cuentas. La llamada debe
      ser idempotente por `accountId`.
- [x] Paso 3: Implementar `relayFundAccount({ accountId, publicKey })`:
      - Validar cuenta `t-*.testnet` y public key ed25519.
      - Verificar que la cuenta existe y contiene esa public key.
      - Si el saldo ya supera `FAUCET_MIN_BALANCE_NEAR`, devolver
        `alreadyFunded: true` sin transferir.
      - Transferir `FAUCET_AMOUNT_NEAR` desde el relayer.
      - Llevar un registro diario de lo fondeado (`budgetSpentYocto`) y
        rechazar con `503` si supera `FAUCET_DAILY_BUDGET_NEAR`.
      - Rechazar con `503` si el saldo del relayer menos el monto queda por
        debajo de `RELAYER_RESERVE_NEAR`.
      - Devolver `budgetRemainingYocto` en la respuesta para que la UI avise.
- [x] Paso 4: Implementar la autenticación del mint patrocinado:
      - `verifyAuth0Jwt(token)` valida firma con JWKS (`AUTH0_JWKS_URI`) y
        `aud`/`iss` (`AUTH0_AUDIENCE`, `AUTH0_ISSUER`); cachear las claves y
        rechazar con `401` tokens expirados o mal firmados.
      - `deriveAccountId(publicKey)` replica `t-<sha256(pk).slice(0,12)>.testnet`
        de `near/market/src/lib/near/auth.ts`, hasheando el string completo
        (incluido `ed25519:`), y se compara con `accountId`.
      - Verificar vía RPC que la cuenta existe y que `publicKey` está entre sus
        access keys. La primera vez, crear la cuenta con `ensure-account` y
        fondearla con `NEW_ACCOUNT_FUNDING_NEAR` solo si `accountId` es
        `deriveAccountId(publicKey)` o el handle automático
        `deriveAutoAccountId(publicKey)`; los handles personalizados o antiguos
        se aceptan únicamente si la cuenta ya existe y contiene la key.
- [x] Paso 5: Implementar `POST /relayer/sponsor-mint` con
      `{ accountId, publicKey, catalogId, token, request_id }`:
      - Exigir `request_id` UUID y guardar `request_id → respuesta` en un mapa
        con TTL para que el reintento no mintee dos veces.
      - Comprobar `SPONSORED_MINT_BUDGET_NEAR` y el saldo del relayer antes de
        firmar; si no alcanza, responder `503 { sponsored: false }` para que el
        cliente caiga a autopago.
      - Llamar `nft.mint({ owner_id: accountId, catalog_id: catalogId })` desde
        el relayer con `MINT_DEPOSIT_YOCTO`. El sobrante lo devuelve el
        contrato al relayer; no se transfiere al jugador.
      - Devolver `{ tokenId, serial, sponsored: true, budgetRemainingYocto }`.
- [x] Paso 6: En `backend/src/routes/relayer.ts`, añadir
      `POST /relayer/sign-tx`, `POST /relayer/ensure-account`,
      `POST /relayer/fund-account`, `POST /relayer/sponsor-mint` y
      `GET /relayer/status` con:
      - `400` para input inválido y `401` para JWT inválido.
      - `403` para public key que no pertenece a la cuenta.
      - `429` para rate limit.
      - `503` para relayer no configurado, sin saldo, sin presupuesto diario o
        sin presupuesto de mint patrocinado.
      - `502` para fallos del RPC/MPC.
      - Rate limits separados: sign-tx 30/min por IP; fund 3/min por IP y
        1/24 h por cuenta; sponsor-mint 5/min por `sub`/IP y 20/día por cuenta.
      - `GET /relayer/status` devuelve
        `{ sponsoredMintAvailable, reason, budgetRemainingYocto, mintDepositYocto }`;
        `sponsoredMintAvailable` es `false` cuando se agotó el presupuesto o el
        saldo cae por debajo de `RELAYER_RESERVE_NEAR`.
- [x] Paso 7: Documentar las variables nuevas en `backend/.env.example` y no
      loguear nunca `RELAYER_PRIVATE_KEY` ni el JWT completo.
- [x] Paso 8: Verificar `cd backend && bunx tsc --noEmit` y probar los
      endpoints con `curl` (guard inválido, JWT falso, public key ajena,
      cuenta ya fondeada, `request_id` repetido y rate limit).

### Fase 4 — Núcleo de firma del frontend

- [x] Paso 1: Ampliar `frontend/src/lib/near/config.ts` con:
      - `AUTH0_SIGNING_AUDIENCE = 'auth0.jwt.fast-auth.testnet'`.
      - `FAST_AUTH_GUARD_ID = 'jwt#https://login.testnet.fast-auth.com/'`.
      - `SIGN_GAS = 300_000_000_000_000n` y `SIGN_DEPOSIT_YOCTO = 1n`.
      - `NFT_CONTRACT_ID`, `MARKET_CONTRACT_ID` desde
        `PUBLIC_NFT_CONTRACT_ID` / `PUBLIC_MARKET_CONTRACT_ID`.
      - `MINT_GAS`, `MINT_DEPOSIT_YOCTO = 10_000_000_000_000_000_000_000n`
        (0.01 N), `MIN_MINT_BALANCE_YOCTO = 15_000_000_000_000_000_000_000n`
        (0.015 N), `LIST_GAS`, `LIST_DEPOSIT_YOCTO = 1n`,
        `MARKET_CALL_GAS = 100_000_000_000_000n`.
      - `RELAYER_SIGN_TX_URL = '/api/relayer/sign-tx'`,
        `RELAYER_FUND_URL = '/api/relayer/fund-account'`,
        `RELAYER_ENSURE_ACCOUNT_URL = '/api/relayer/ensure-account'`,
        `RELAYER_SPONSOR_MINT_URL = '/api/relayer/sponsor-mint'` y
        `RELAYER_STATUS_URL = '/api/relayer/status'`.
      - `isNftConfigured()`.
      - `vite.config.ts` declara `envPrefix: ['VITE_', 'PUBLIC_']`: sin eso,
        `import.meta.env.PUBLIC_*` llega `undefined` y el Market queda "not
        configured" aunque `.env.local` tenga los IDs.
- [x] Paso 2: Añadir a `frontend/src/lib/near/auth.ts` un
      `getIdentityToken()` que use el `Auth0Client` que `initAuth()` ya guarda en
      `provider.client` y lea el **ID token** de la caché
      (`cacheManager.getIdToken({ clientId })`) sin popup ni red. El audience de
      firma no se puede pedir en silencio (la Action de FastAuth exige payload de
      transacción) y el access token por defecto es un JWE, así que el backend usa
      el `sub` del ID token. Si no hay sesión, devolver `null` y dejar que el store
      caiga a autopago.
- [x] Paso 3: Crear `frontend/src/lib/near/http.ts` con `postJson<T>(url, body,
      fallbackError)`; hacer que `auth.ts` lo reutilice.
- [x] Paso 4: Ampliar `frontend/src/lib/near/sdk.ts` con
      `loadTransactionSdk()` y `loadSigningSdk()`, copiando el patrón de
      `near/market/src/lib/near/sdk.ts`.
- [x] Paso 5: Ampliar `frontend/src/lib/near/rpc.ts` con `viewArray<T>`,
      `explorerTxUrl(hash)` y `jsonRpc(method, params, { id, errorPrefix })`.
- [x] Paso 6: Crear `frontend/src/lib/near/tx.ts` portando
      `near/market/src/lib/near/tx.ts`:
      - `clearStaleSigningTokens()`.
      - `callMethod(accountId, contractId, method, args, { gas, deposit })`.
      - `executeTransaction`: access key + block `optimistic`, nonce + 1,
        `requestTransactionSignature`, `getSignatureRequest`, `sign-tx`,
        comparación de bytes, `SignedTransaction` y `send_tx`.
      - `broadcastTransaction` con `wait_until: 'EXECUTED'` y errores legibles.
- [x] Paso 7: Crear `frontend/src/lib/near/format.ts` con `formatNear`,
      `parseNear` (BigInt, sin floats), `shortAccount`, `tokenTitle`.
- [x] Paso 8: Ampliar `frontend/src/lib/near/errors.ts` con mensajes para
      popup cerrado, JWT expirado, MPC sin firma, rate limit y byte mismatch.
- [x] Paso 9: Verificar que ningún import de SDK quede estático fuera de
      `sdk.ts`/`auth-loader.ts`.

### Fase 5 — Servicios NFT y store

- [x] Paso 1: Crear `frontend/src/lib/nft/config.ts` con tipos
      `TokenMetadata`, `TokenMetadataInput`, `MtToken`, `Sale`, `Listing`,
      `OwnedToken`, `CatalogExtra`, `CatalogSupply`, y constantes de
      métodos/gas.
- [x] Paso 2: Crear `frontend/src/lib/nft/collection.ts`:
      - `getOwnedTokens(accountId, fromIndex = 0, limit = 100, finality)` con
        `from_index: fromIndex > 0 ? String(fromIndex) : null`.
      - `getTokenMetadata(tokenIds, finality)`.
      - `getCatalogSupplies(catalogIds, finality)` contra
        `get_catalog_supplies`.
      - `balanceOf(accountId, tokenId, finality)`.
      - `mint(accountId, catalogId)`: intenta `POST /relayer/sponsor-mint` con
        el JWT y `request_id`; si responde `503`/`429` o el token no está
        disponible, cae a autopago firmado con `owner_id: null`,
        `MINT_GAS` y `MINT_DEPOSIT_YOCTO`. Antes del primer mint llama a
        `ensure-account` de forma idempotente.
      - `listForSale(accountId, tokenId, priceYocto)` con
        `mt_transfer_call`, `receiver_id: MARKET_CONTRACT_ID`,
        `msg: JSON.stringify({ price: priceYocto.toString() })`.
- [x] Paso 3: Crear `frontend/src/lib/nft/market.ts`:
      - `getSales`, `getSale`, `getSalesBySeller`, `getSalesByContract`.
      - `getListings` / `getListingsBySeller` con batch de metadata agrupado
        por contrato y fallback a `Token <id>`.
      - `buy(accountId, sale)` con depósito exacto `BigInt(sale.price)`.
      - `cancel(accountId, sale)` sin depósito.
      - `saleKey(sale)`.
- [x] Paso 4: Crear `frontend/src/lib/nft/catalog.ts`:
      - `MINTABLE_ITEMS` normaliza `SKINS` + `SHOP_WEAPONS` + `SHOP_ASSETS` +
        `SHOP_VEHICLES` en `MintableCatalogItem` (`kind: 'skins' | 'weapons' |
        'assets' | 'vehicles'`).
      - `CATALOG_CAPS` fallback (skins 50/5, armas 25/3, assets 50/5,
        vehículos 25/3) usado solo si el contrato no responde.
      - `catalogItemById(id)` y `catalogCap(item)`.
      - `metadataForCatalog(item)` con `title`, `description`,
        `reference: 'runworld://catalog/<id>'` y `extra` JSON con
        `catalogId`, `model`, `accent`, `badge`, `hot`, `kind`; se usa para el
        `catalog_metadata` del `init` y para `NftArt`, no por mint.
      - `catalogExtraFor(item)`, `catalogFromMetadata(meta)`,
        `artForMetadata(meta)` y
        `tokenSerial(tokenId)` para mostrar `#12`.
- [x] Paso 5: Crear `frontend/src/lib/nft/poll.ts` con `pollUntil(fn, done,
      { attempts = 20, delayMs = 300 })`.
- [x] Paso 6: Crear `frontend/src/lib/nft/errors.ts` con la traducción de
      `Not enough deposit to cover storage`, `Catalog metadata is missing`,
      `Catalog item is not enabled`, `Mint limit reached for this item`,
      `Account mint limit reached`, `Sale not found`,
      `Seller cannot buy their own token`, `Not enough NEAR attached`,
      `This token is already listed`, `Token contract is not allowed`,
      `Only the seller can cancel this sale`.
- [x] Paso 7: Crear `frontend/src/lib/state/nftMarket.svelte.ts` con la clase
      descrita en §7.1 y las acciones `setActive`, `setTab`, `refresh`, `mint`,
      `list`, `buy`, `cancel`, `fund`; leer `sponsoredMintAvailable`,
      `reason`, `budgetRemainingYocto` y `mintDepositYocto` de
      `/relayer/status`, y exponer `mintMode` (`'sponsored' | 'self' |
      'unavailable'`) junto a `capacityReached`.
- [x] Paso 8: En `mint()`, generar un `request_id` (`crypto.randomUUID()`) por
      intento, reintentar solo con el mismo id, y refrescar
      `sponsoredMintAvailable` después de cada respuesta `200`, `429` o `503`.
      Un `401` debe limpiar el JWT cacheado y caer a autopago, no abrir popup.
- [x] Paso 9: En `refresh()`, usar `Promise.allSettled` para saldo, tokens,
      supply por catálogo, ventas y ventas propias; un fallo de metadata o de
      supply no debe ocultar la lista.

### Fase 6 — UI del mercado dentro de la tienda

- [x] Paso 1: Crear `MarketView.svelte` (sin modal propio):
      - Header compacto con "Village Market", cuenta corta, saldo, botón de
        faucet, refrescar y estado.
      - `<MarketTabs>` y un contenedor con scroll interno.
      - Sin backdrop, sin `Escape` propio y sin `role="dialog"`: el diálogo,
        el cierre y el foco los aporta `ShopPanel`.
- [x] Paso 2: Crear `MarketTabs.svelte` con `role="tablist"`, tres
      `role="tab"` (Browse, My NFTs, My listings), `aria-selected`,
      `aria-controls`, `tabindex` móvil, `ArrowLeft`/`ArrowRight`/`Home`/`End`
      y foco visible.
- [x] Paso 3: Crear `NftArt.svelte`:
      - Si `media` empieza por `http` o `ipfs://`, renderizar `<img>` con
        `onerror` y fallback.
      - Si no, usar `SHOP_ICONS`/`SHOP_TONES` según `catalogId`; fallback a
        `Package` y un gradiente neutro.
      - Sin canvas, sin `map.glb`, sin GLB.
- [x] Paso 4: Crear `NftCard.svelte` con arte, título, serie `#N`, chip de
      estado, precio y un slot de acciones; `aria-pressed` cuando aplique;
      altura mínima 44 px en botones.
- [x] Paso 5: Crear `MintNftForm.svelte`:
      - Select de `MINTABLE_ITEMS` con la metadata base ya definida; no se
        piden título, descripción ni media (todo viene del catálogo y abarata
        el mint).
      - Cada opción muestra `minted / cap` y `Sold out` si no quedan copias.
      - Preview con `NftArt` y cupo restante de la cuenta
        (`min(per_account_cap - accountMinted, cap - minted)`).
      - Botón Mint muestra `Free mint` si
        `mintMode === 'sponsored'`, `Mint · 0.01 NEAR` si es autopago, y queda
        deshabilitado si no hay contrato, el ítem está agotado, la cuenta llegó
        a su cupo, no hay patrocinio **y** el saldo es menor a `0.015 NEAR`, o
        hay una acción en curso; mostrar el motivo.
      - Un mint patrocinado no debe abrir el popup de Auth0 ni mostrar estados
        de "approve in wallet".
- [x] Paso 6: Crear `ListForSaleForm.svelte`:
      - Input de precio en NEAR, botones rápidos (0.5, 1, 5).
      - Validación con `parseNear`; mostrar el equivalente en yoctoNEAR.
      - Botón Sell deshabilitado si el precio es inválido o hay una acción en
        curso.
- [x] Paso 7: Crear `MarketBalance.svelte` con cuenta, saldo formateado,
      botón "Fund testnet wallet", enlace a la cuenta en el explorer, aviso de
      saldo bajo y "Testnet funds are running low" cuando la faucet responde
      `503` o el presupuesto restante es bajo.
- [x] Paso 8: Implementar Browse: grilla de ventas, estado vacío, botón Buy,
      "Your listing" para las propias, precio formateado y vendedor corto.
- [x] Paso 9: Implementar My NFTs: grilla de tokens con serie, botón Sell,
      formulario inline, y botón "Mint NFT" que muestra `MintNftForm` con los
      contadores de supply.
- [x] Paso 10: Implementar My listings: lista de ventas propias, botón Cancel,
      confirmación y estado "Escrowed".
- [x] Paso 11: Conectar todas las acciones al store con estados `busy`,
      `error` y `notice`; `role="alert"` para errores y `role="status"` /
      `aria-live` para confirmaciones.
- [x] Paso 12: Extender `shopCatalog.ts` con `MARKET_TAB` y
      `ShopPanelTabId = ShopItemTabId | 'market'` (mantener
      `ShopTabId = ShopItemTabId` como alias para no romper imports),
      `shopUi.ts` con el icono `store` en `SHOP_TAB_ICONS`, y
      `ShopTabBar.svelte` para aceptar `ShopPanelTabId`. `selectedIds` sigue
      tipado como `Record<ShopItemTabId, string>`.
- [x] Paso 13: En `ShopPanel.svelte`, usar
      `PANEL_TABS = [...SHOP_TABS, MARKET_TAB]`, añadir el `case 'market'` al
      subtítulo, el `role="tabpanel"` de Market con
      `{#if activeTab === 'market'}<MarketView />{/if}` y mantener
      `nftMarket` activo mientras la tienda esté abierta (cualquier pestaña),
      no solo en Market.
- [x] Paso 14: Mantener el reset a `skins` y el foco en cerrar tal como están;
      no añadir botón al HUD, no montar nada nuevo en `GamePage.svelte` y no
      tocar los guards de `PlayerBehaviour`/prompts (ya usan
      `hubKiosks.panelOpen`).
- [x] Paso 15: Al cerrar la tienda, cortar el polling y limpiar timers; al
      abrirla o cambiar de pestaña, refrescar saldo, tokens, supply y ventas.
- [x] Paso 16: Revisar la anidación y el z-index dentro de `z-[70]`: el
      contenido no debe crear stacking contexts que tapen el cierre de la
      tienda ni `MobileControls`.
- [x] Paso 18: Añadir `MintItemButton.svelte` y colocarlo en el detalle de la
      pestaña de cada ítem (Skins, Weapons, Assets, Vehicles), reutilizando
      `nftMarket.mint(catalogId)`, con `minted / cap`, cupo restante, `Free
      mint`/autopago, `Sold out` y motivo visible. `catalog.ts` normaliza las
      11 skins en `MintableCatalogItem`; `NftArt` usa el ícono y tono de cada
      skin.
- [ ] Paso 17: Revisar mobile a `390×844` con `?touch=1`: pestañas
      desplazables, tarjetas apiladas, botones de 44 px y sin overflow
      horizontal.

### Fase 7 — Verificación y cierre

- [x] Paso 1: Ejecutar todos los comandos de §8 y corregir tipos, formato,
      build, `tsc` y tests.
- [ ] Paso 2: Ejecutar los casos manuales de §8 con dos cuentas de Google
      (vendedor y comprador) y registrar tx hashes.
- [ ] Paso 3: Actualizar `contracts/deployments/testnet.json` con las txs de
      mint patrocinado/mint autopago/listar/comprar/cancelar de la prueba real y
      el balance del relayer antes/después.
- [ ] Paso 4: Actualizar `estado`, `actualizado`, checkboxes, "Progreso" y
      "Changelog" de este spec.

### 7.1 Contratos e interfaces

#### Contrato NFT (`contracts/nft/src/lib.rs`)

```rust
pub type TokenId = String;

pub struct TokenMetadata {
    pub title: Option<String>,
    pub description: Option<String>,
    pub media: Option<String>,
    pub media_hash: Option<String>,
    pub issued_at: Option<String>,
    pub expires_at: Option<String>,
    pub starts_at: Option<String>,
    pub updated_at: Option<String>,
    pub extra: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<String>,
}

pub struct CatalogCap {
    pub catalog_id: String,
    pub cap: u32,
    /// 0 = sin límite por cuenta.
    pub per_account_cap: u32,
}

pub struct CatalogMetadata {
    pub catalog_id: String,
    pub title: String,
    pub description: Option<String>,
    pub media: Option<String>,
    pub reference: Option<String>,
}

/// Almacenamiento compacto por token: sin metadata repetida.
pub struct TokenInfo {
    pub owner_id: AccountId,
    pub catalog_id: String,
    pub serial: u32,
}

pub struct CatalogSupply {
    pub catalog_id: String,
    pub cap: u32,
    pub minted: u32,
    pub per_account_cap: u32,
}

#[init]
pub fn init(
    name: String,
    owner_id: Option<AccountId>,
    catalog_caps: Vec<CatalogCap>,
    catalog_metadata: Vec<CatalogMetadata>,
) -> Self;

#[payable]
pub fn mint(owner_id: Option<AccountId>, catalog_id: String) -> TokenId;

pub fn burn(token_id: TokenId, amount: U128);

pub fn set_catalog_cap(catalog_id: String, cap: u32, per_account_cap: u32);
pub fn set_catalog_metadata(metadata: CatalogMetadata);

#[payable]
pub fn mt_transfer(receiver_id: AccountId, token_id: TokenId, amount: U128, approval: Option<Approval>, memo: Option<String>);

#[payable]
pub fn mt_transfer_call(receiver_id: AccountId, token_id: TokenId, amount: U128, approval: Option<Approval>, memo: Option<String>, msg: String) -> Promise;

pub fn mt_balance_of(account_id: AccountId, token_id: TokenId) -> U128;
pub fn mt_supply(token_id: TokenId) -> Option<U128>;
pub fn mt_tokens(from_index: Option<U128>, limit: Option<u32>) -> Vec<Token>;
pub fn mt_tokens_for_owner(account_id: AccountId, from_index: Option<U128>, limit: Option<u32>) -> Vec<Token>;
pub fn mt_metadata_contract() -> ContractMetadata;
pub fn mt_metadata_token_by_token_id(token_ids: Vec<TokenId>) -> Vec<TokenMetadata>;
pub fn get_owner_id() -> AccountId;
pub fn get_catalog_metadata(catalog_id: String) -> Option<CatalogMetadata>;
pub fn get_catalog_supply(catalog_id: String) -> Option<CatalogSupply>;
pub fn get_catalog_supplies(catalog_ids: Vec<String>) -> Vec<CatalogSupply>;
pub fn get_account_minted(account_id: AccountId, catalog_ids: Vec<String>) -> Vec<u32>;
```

Notas:

- `mint` es público en testnet, igual que la referencia. Cualquiera puede
  mintear en la colección; la UI solo ofrece el catálogo y los topes limitan la
  emisión. Endurecerlo con una allowlist o una firma del backend queda para
  producción.
- Como `mint` acepta `owner_id`, el relayer puede llamarlo con el jugador como
  owner: paga gas y depósito y el NFT queda en la cuenta del jugador. El
  sobrante del depósito se devuelve a `predecessor` (el relayer), así que el
  mint patrocinado no le transfiere NEAR al jugador.
- El `token_id` es `"<catalog_id>#<serial>"`, con `serial = minted + 1`. El
  contrato rechaza un `catalog_id` que contenga `#`.
- `catalog_minted` solo sube: quemar un token no libera cupo ni reutiliza el
  serial. Así el tope es de emisión total, no de circulación.
- La metadata vive una vez en `catalog_metadata` (9 entradas). El token guarda
  `TokenInfo { owner, catalog_id, serial }` y `mt_metadata_token_by_token_id`
  arma la respuesta con `title`, `description`, `media`, `reference` y un
  `extra` con `{"catalogId":"...","serial":N}`. Esto deja el token en ~500
  bytes en vez de duplicar el JSON completo.
- `set_catalog_cap` y `set_catalog_metadata` son solo para el owner;
  `set_catalog_cap` no puede fijar un `cap` menor que `catalog_minted`.
- No se implementan approvals: el market usa escrow con `mt_transfer_call`.
- Cada `mint` crea 1 unidad. Los tokens se comportan como NFTs 1-of-1 con
  serie.

#### Topes de emisión por defecto

| Ítem           | `catalog_id`    | `cap` | `per_account_cap` |
| -------------- | --------------- | ----: | ----------------: |
| Heroine        | `hero`          |    50 |                 5 |
| Scarecrow      | `crow-warden`   |    50 |                 5 |
| Witch          | `witch`         |    50 |                 5 |
| Demon          | `demon`         |    50 |                 5 |
| Frankenstein   | `frankenstein`  |    50 |                 5 |
| Ghost          | `ghost`         |    50 |                 5 |
| Golem          | `golem`         |    50 |                 5 |
| Mummy          | `mummy`         |    50 |                 5 |
| Pumpkin King   | `pumpkin-king`  |    50 |                 5 |
| Skeleton       | `skeleton`      |    50 |                 5 |
| Vampire        | `vampire`       |    50 |                 5 |
| Golden Pistol  | `pistol-gold`   |    25 |                 3 |
| Golden Shotgun | `shotgun-gold`  |    25 |                 3 |
| Golden SMG     | `mp5-gold`      |    25 |                 3 |
| Golden Sniper  | `sniper-gold`   |    25 |                 3 |
| Golden Bazooka | `bazooka-gold`  |    25 |                 3 |
| Crown          | `crown`         |    50 |                 5 |
| Coin Pistol    | `coin-pistol`   |    50 |                 5 |
| Skateboard     | `skateboard`    |    25 |                 3 |
| Magic Broom    | `magic-broom`   |    25 |                 3 |

Total máximo de la colección: **825 NFTs** (11 skins × 50 = 550, 5 armas ×
25 = 125, 2 assets × 50 = 100, 2 vehículos × 25 = 50). Los topes se pasan en el
`init` del deploy, se guardan on-chain y el owner puede ajustarlos sin
redeploy. El frontend muestra siempre los valores on-chain; `CATALOG_CAPS` solo
es un fallback si la lectura falla. Ajustar los números no requiere migrar
tokens.

#### Contrato Market (`contracts/market/src/lib.rs`)

```rust
pub struct Sale {
    pub seller_id: AccountId,
    pub token_contract: AccountId,
    pub token_id: TokenId,
    pub amount: U128,
    pub price: U128,
}

#[init]
pub fn new(owner_id: Option<AccountId>, token_contracts: Vec<AccountId>) -> Self;

pub fn mt_on_transfer(
    sender_id: AccountId,
    previous_owner_ids: Vec<AccountId>,
    token_ids: Vec<TokenId>,
    amounts: Vec<U128>,
    msg: String,
) -> Vec<U128>;

#[payable]
pub fn buy(token_contract: AccountId, token_id: TokenId) -> Promise;

pub fn cancel(token_contract: AccountId, token_id: TokenId) -> Promise;

pub fn get_sale(token_contract: AccountId, token_id: TokenId) -> Option<Sale>;
pub fn get_sales(from_index: Option<u32>, limit: Option<u32>) -> Vec<Sale>;
pub fn get_sales_by_seller(seller_id: AccountId, from_index: Option<u32>, limit: Option<u32>) -> Vec<Sale>;
pub fn get_sales_by_contract(token_contract: AccountId, from_index: Option<u32>, limit: Option<u32>) -> Vec<Sale>;
```

#### Metadata de catálogo

La metadata base (una por `catalog_id`) guarda el ítem de la tienda y se pasa en
el `init`. Su `extra` incluye los datos de arte:

```json
{
  "catalogId": "pistol-gold",
  "model": "weapons/pistol_gold.glb",
  "accent": "#fbbf24",
  "badge": "Gold",
  "hot": true,
  "kind": "weapons"
}
```

El token no repite ese JSON: `mt_metadata_token_by_token_id` toma `title`,
`description`, `media` y `reference` de la metadata base y devuelve un `extra`
mínimo con `{"catalogId":"pistol-gold","serial":12}`. La UI reconstruye el arte
desde `nft/catalog.ts`. Si `extra` falta o no parsea, cae a `media`/`title` y a
un póster genérico.

#### Tipos del frontend

```ts
type TokenMetadata = {
  title?: string | null;
  description?: string | null;
  media?: string | null;
  media_hash?: string | null;
  issued_at?: string | null;
  expires_at?: string | null;
  starts_at?: string | null;
  updated_at?: string | null;
  extra?: string | null;
  reference?: string | null;
  reference_hash?: string | null;
};

type TokenMetadataInput = {
  title: string;
  description?: string;
  media?: string;
  media_hash?: string;
  extra?: string;
  reference?: string;
  reference_hash?: string;
};

type MtToken = {
  token_id: string;
  owner_id?: string | null;
  token_metadata?: TokenMetadata | null;
  base_metadata_id: string;
};

type OwnedToken = MtToken & {
  title: string;
  serial: number | null;
  catalog: CatalogExtra | null;
};

type CatalogSupply = {
  catalog_id: string;
  cap: number;
  minted: number;
  per_account_cap: number;
  account_minted: number;
  remaining: number;
};

type Sale = {
  seller_id: string;
  token_contract: string;
  token_id: string;
  amount: string;
  price: string; // yoctoNEAR
};

type Listing = Sale & {
  title: string;
  description?: string | null;
  media?: string | null;
  catalog: CatalogExtra | null;
};

type CatalogExtra = {
  catalogId: string;
  model: string | null;
  accent: string;
  badge: string;
  hot: boolean;
  kind: 'weapons' | 'assets' | 'vehicles';
};

type MintMode = 'sponsored' | 'self' | 'unavailable';

type MintResult = {
  hash: string | null; // null en mint patrocinado
  tokenId: string;
  sponsored: boolean;
  budgetRemainingYocto?: string;
};

type RelayerStatus = {
  sponsoredMintAvailable: boolean;
  reason: 'ok' | 'budget' | 'reserve' | 'disabled' | 'error';
  budgetRemainingYocto: string;
  mintDepositYocto: string;
};
```

#### Servicios

```ts
// nft/collection.ts
getOwnedTokens(accountId, fromIndex?, limit?, finality?): Promise<OwnedToken[]>
getTokenMetadata(tokenIds, finality?): Promise<TokenMetadata[]>
getCatalogSupplies(catalogIds, accountId, finality?): Promise<CatalogSupply[]>
balanceOf(accountId, tokenId, finality?): Promise<bigint>
mint(accountId, catalogId): Promise<MintResult>
sponsorMint(accountId, publicKey, catalogId, requestId): Promise<MintResult>
ensureAccount(accountId): Promise<{ accountId: string, funded: boolean }>
getRelayerStatus(): Promise<RelayerStatus>
listForSale(accountId, tokenId, priceYocto: bigint): Promise<{ hash: string | null }>

// nft/market.ts
getSales(fromIndex?, limit?, finality?): Promise<Sale[]>
getSale(tokenContract, tokenId, finality?): Promise<Sale | null>
getSalesBySeller(sellerId, fromIndex?, limit?, finality?): Promise<Sale[]>
getListings(fromIndex?, limit?, finality?): Promise<Listing[]>
getListingsBySeller(sellerId, fromIndex?, limit?, finality?): Promise<Listing[]>
buy(accountId, sale): Promise<{ hash: string | null }>
cancel(accountId, sale): Promise<{ hash: string | null }>
saleKey(sale): string

// near/tx.ts
callMethod(accountId, contractId, method, args?, { gas?, deposit? }): Promise<{ hash: string | null }>

// near/format.ts
formatNear(yocto: bigint | string, digits?): string
parseNear(value: string): bigint
shortAccount(accountId: string): string
tokenTitle(title: string | null | undefined, fallback: string): string
```

`getCatalogSupplies` combina `get_catalog_supplies` (global) con
`get_account_minted` (por cuenta) y calcula
`remaining = min(per_account_cap - account_minted, cap - minted)`.

```ts
// state/nftMarket.svelte.ts
class NftMarketStore {
  active = $state(false);
  tab = $state<'browse' | 'owned' | 'listings'>('browse');
  sales = $state<Sale[]>([]);
  owned = $state<OwnedToken[]>([]);
  listings = $state<Listing[]>([]);
  catalogStats = $state<Record<string, CatalogSupply>>({});
  balanceYocto = $state(0n);
  capacityReached = $state(false);
  mintMode = $state<MintMode>('unavailable');
  sponsoredMintAvailable = $state(false);
  budgetRemainingYocto = $state(0n);
  mintDepositYocto = $state(MINT_DEPOSIT_YOCTO);
  loading = $state(false);
  busy = $state(false);
  error = $state<string | null>(null);
  notice = $state<string | null>(null);

  setActive(active: boolean): void;
  setTab(tab: MarketTab): void;
  refresh(): Promise<void>;
  mint(catalogId: string): Promise<void>; // sponsor → fallback firmado
  list(tokenId: string, priceYocto: bigint): Promise<void>;
  buy(sale: Sale): Promise<void>;
  cancel(sale: Sale): Promise<void>;
  fund(): Promise<void>;
}
```

`mint` intenta primero `sponsorMint` con el JWT de sesión y un `request_id`
estable por intento. Si el backend responde `503`/`429` o no hay token, cae a
`ensureAccount` + `mint` firmado por MPC. Si `ensureAccount` falla, no se pide
la firma MPC. `mintMode` se recalcula con el saldo y `RelayerStatus`.

#### Endpoints del backend

```ts
// POST /relayer/sign-tx
type SignTxBody = {
  guard_id: string; // debe ser FAST_AUTH_GUARD_ID
  verify_payload: string; // JWT de Auth0
  sign_payload: number[]; // bytes de la transacción aprobada
  algorithm: 'eddsa' | 'ecdsa' | 'secp256k1';
};
// 200: { hash: string | null, signature: string /* payload MPC en base64 */ }
// 400: input inválido | 403: receiver no permitido | 502: MPC/RPC
// 503: relayer sin configurar

// POST /relayer/ensure-account
type EnsureAccountBody = {
  accountId: string; // t-<handle>.testnet
  publicKey: string; // ed25519:<base58>
};
// 200: { accountId: string, created: boolean, funded: boolean }
// 400: input inválido | 403: la key no pertenece a la cuenta
// 429: rate limit | 503: relayer sin saldo o sin config

// POST /relayer/fund-account
type FundAccountBody = {
  accountId: string; // t-<handle>.testnet
  publicKey: string; // ed25519:<base58>
};
// 200: { hash: string | null, amountYocto: string, alreadyFunded: boolean, budgetRemainingYocto: string }
// 400: input inválido | 403: la key no pertenece a la cuenta
// 429: rate limit | 503: relayer sin saldo, sin presupuesto o sin config

// POST /relayer/sponsor-mint
type SponsorMintBody = {
  accountId: string; // t-<handle>.testnet, debe ser deriveAccountId(publicKey)
  publicKey: string; // ed25519:<base58>
  catalogId: string;
  token: string; // JWT de Auth0
  request_id: string; // UUID, idempotente
};
// 200: { tokenId: string, serial: number, sponsored: true, budgetRemainingYocto: string }
// 400: input inválido o accountId no derivado de publicKey
// 401: JWT inválido/expirado | 403: la key no pertenece a la cuenta
// 409: request_id ya usado con otro body | 429: rate limit
// 503: sin presupuesto, reserva baja o relayer sin config

// GET /relayer/status
// 200: { sponsoredMintAvailable: boolean, reason: 'ok'|'budget'|'reserve'|'disabled'|'error',
//        budgetRemainingYocto: string, mintDepositYocto: string }
```

#### Variables de entorno

| Variable                        | Ámbito  | Default / obligatoriedad                                           |
| ------------------------------- | ------- | ------------------------------------------------------------------ |
| `PUBLIC_NEAR_NETWORK`           | Público | `testnet`                                                          |
| `PUBLIC_NEAR_NODE_URL`          | Público | `https://rpc.testnet.fastnear.com`                                 |
| `PUBLIC_NFT_CONTRACT_ID`        | Público | Obligatorio para el mercado (ej. `nft.<deployer>.testnet`)         |
| `PUBLIC_MARKET_CONTRACT_ID`     | Público | Obligatorio para el mercado (ej. `market.<deployer>.testnet`)      |
| `PUBLIC_AUTH0_CLIENT_ID`        | Público | Cliente compartido de testnet si está vacío                        |
| `PUBLIC_AUTH0_DOMAIN`           | Público | `login.testnet.fast-auth.com`                                      |
| `RELAYER_ACCOUNT_ID`            | Server  | Obligatorio para crear cuentas, firmar y fondear                   |
| `RELAYER_PRIVATE_KEY`           | Server  | Obligatorio; nunca al cliente                                      |
| `NFT_CONTRACT_ID`               | Server  | Obligatorio para validar `sign-tx`                                 |
| `MARKET_CONTRACT_ID`            | Server  | Obligatorio para validar `sign-tx` y patrocinar mints              |
| `FAST_AUTH_CONTRACT_ID`         | Server  | `fast-auth.testnet`                                                |
| `FAST_AUTH_GUARD_ID`            | Server  | `jwt#https://login.testnet.fast-auth.com/`                         |
| `AUTH0_ISSUER`                  | Server  | `https://login.testnet.fast-auth.com/`                             |
| `AUTH0_JWKS_URI`                | Server  | `https://login.testnet.fast-auth.com/.well-known/jwks.json`        |
| `AUTH0_AUDIENCE`                | Server  | `auth0.jwt.fast-auth.testnet`                                      |
| `NEW_ACCOUNT_FUNDING_NEAR`      | Server  | `0.05`; `0` desactiva el fondeo inicial (presupuesto 10 NEAR)       |
| `FAUCET_AMOUNT_NEAR`            | Server  | `0.05`                                                             |
| `FAUCET_MIN_BALANCE_NEAR`       | Server  | `0.03` (por debajo se ofrece la faucet)                            |
| `FAUCET_DAILY_BUDGET_NEAR`      | Server  | `0.5`; tope diario de fondeos                                      |
| `RELAYER_RESERVE_NEAR`          | Server  | `0.5`; sin patrocinio ni faucet por debajo de esta reserva          |
| `SPONSORED_MINT_BUDGET_NEAR`    | Server  | `1`; ~160 mints; al agotarse la UI pasa a autopago                 |
| `MINT_DEPOSIT_YOCTO`            | Server  | `10000000000000000000000` (0.01 N); lo paga el relayer             |
| `MARKET_STORAGE_BUFFER_NEAR`    | Server  | `0.30`; colchón del market para ventas activas                     |

Constantes de código (no env): `SIGN_GAS`, `SIGN_DEPOSIT_YOCTO`,
`MINT_GAS`, `MINT_DEPOSIT_YOCTO`, `MIN_MINT_BALANCE_YOCTO`, `LIST_GAS`,
`LIST_DEPOSIT_YOCTO`, `MARKET_CALL_GAS`, `SALE_PAGE_SIZE = 50`,
`OWNED_PAGE_SIZE = 100`.

`MINT_DEPOSIT_YOCTO` arranca en `0.01 NEAR`. Durante la Fase 1 se mide el
storage real de un mint con metadata base y se ajusta al valor medido + 20 %;
si el contrato queda por encima de `0.01`, se sube el depósito y el umbral
`MIN_MINT_BALANCE_YOCTO` en vez de aceptar mints que fallen por falta de
storage.

## 8. Verificación

```bash
# Contratos: tests unitarios y build de WASM
cd contracts && cargo test --lib
(cd contracts/nft && cargo near build non-reproducible-wasm)
(cd contracts/market && cargo near build non-reproducible-wasm)

# Contratos: test de integración en sandbox (requiere los WASM anteriores)
cd contracts && cargo test -p market --test market_flow -- --nocapture

# Frontend
cd frontend && bun run check
cd frontend && bun run lint
cd frontend && bun run build

# Backend
cd backend && bunx tsc --noEmit
```

Casos manuales:

1. **Deploy**: abrir `https://testnet.nearblocks.io/address/<nft>` y
   `<market>`; verificar `mt_metadata_contract`, `get_token_contracts` y
   `get_catalog_supplies` con los topes esperados. Confirmar que el NFT quedó
   con `storage_usage × 10⁻⁵ NEAR + 0.02`, el market con
   `storage_usage × 10⁻⁵ NEAR + 0.30`, y que la cuenta maestra recuperó el
   sobrante.
2. **Entrada**: caminar al kiosco Halloween Shop, pulsar `E`, cambiar a la
   pestaña `Market` y confirmar que comparte el mismo diálogo, `X`, `Escape` y
   backdrop; no debe abrirse un segundo modal.
3. **Login**: iniciar sesión con Google y confirmar que **no** se creó una
   cuenta on-chain todavía (la cuenta aparece recién en el primer mint).
4. **Mint patrocinado**: ir a Market → My NFTs → Mint NFT, elegir "Golden
   Pistol" y mintear. Confirmar que **no** se abre el popup de Auth0, que la
   cuenta se crea en ese momento (si no existía), que el NFT aparece sin
   recargar con su serie (`#1`, `#2`, …) y el contador `1 / 25`, y que el saldo
   del jugador no bajó. Comparar el balance del relayer antes/después: debe
   bajar ~`0.005-0.006 NEAR`, no `0.01`.
   - **Desde la tienda**: repetir el mint desde la pestaña Weapons, Assets o
     Vehicles usando el CTA del detalle del ítem, sin pasar por Market. El
     contador y My NFTs deben actualizarse igual.
   - **Skins**: en la pestaña Skins, elegir una skin y mintearla con el mismo
     CTA; el contador debe ser `1 / 50` y la skin local no debe cambiar de
     estado (seguir bloqueada o equipada según las misiones).
   - **Fallback**: agotar `SPONSORED_MINT_BUDGET_NEAR` o simularlo; el siguiente
     mint debe mostrar `Mint · 0.01 NEAR`, abrir el popup de Auth0 y descontar
     el depósito del saldo del jugador. Sin saldo, Mint debe quedar deshabilitado
     y ofrecer "Fund testnet wallet".
5. **Topes**: verificar que el formulario muestra `minted / cap` y el cupo
   restante de la cuenta. Mintear 3 unidades del mismo ítem con una cuenta: el
   cuarto intento debe estar deshabilitado con el motivo visible. Llamar `mint`
   por CLI por encima del tope debe fallar y devolver el depósito.
6. **Agotado**: con un deploy de prueba de tope bajo, agotar un ítem y
   confirmar `Sold out`, el botón deshabilitado y que los demás ítems siguen
   disponibles.
7. **Saldo**: antes de mintear con una cuenta nueva, verificar que el saldo
   alcanza; si no, usar "Fund testnet wallet" y confirmar que el saldo sube
   `0.05 NEAR`. Con `0.015 NEAR` o menos, Mint debe estar deshabilitado.
8. **Listar**: poner el NFT en venta a `0.005 NEAR`; confirmar que desaparece de
   My NFTs, aparece en My listings y que el owner on-chain es el market.
9. **Comprar**: con una segunda cuenta de Google, abrir Browse, comprar la
   venta y aprobar el popup. Confirmar que el NFT pasa al comprador, el
   vendedor recibe el NEAR y la venta desaparece.
10. **Venta propia**: con la cuenta vendedora, verificar que la venta propia
   muestra "Your listing" y no se puede comprar.
11. **Cancelar**: desde My listings, cancelar y confirmar que el NFT vuelve a
    My NFTs y la venta desaparece.
12. **Errores**: cancelar desde la cuenta compradora (debe fallar), comprar sin
    saldo (mensaje legible), comprar una venta ya cerrada y mintear por encima
    del tope (mensaje legible).
13. **Firma**: con un JWT inválido o un `guard_id` incorrecto, `sign-tx`
    responde `400`/`502` y no difunde nada. Simular bytes alterados y confirmar
    que el cliente aborta antes de `send_tx`.
14. **Faucet**: pedir la faucet dos veces seguidas; la segunda debe respetar el
    rate limit o devolver `alreadyFunded`. Pedir con una public key ajena y
    confirmar `403`.
15. **Presupuesto**: bajar el saldo del relayer (o simularlo con una env de
    reserva alta) y confirmar que `fund-account` y `sponsor-mint` responden
    `503`, la UI muestra "Testnet funds are running low", el mint cae a
    autopago y el resto del mercado sigue funcionando.
16. **Input**: con la tienda abierta en Market, `WASD` no mueve al jugador y
    `E` no abre kioscos, gatos, NPCs ni checkpoints. Al cerrar la tienda, el
    movimiento vuelve.
17. **Cierre**: abrir chat, ajustes, conducir y cambiar de escena; la tienda
    debe cerrarse y el mercado debe dejar de sondear.
18. **Mobile**: a `390×844` con `?touch=1`, comprobar tabs desplazables,
    botones de 44 px, sin overflow horizontal y sin tapar los controles.
19. **Rendimiento**: Browse con 50 ventas no debe montar canvas 3D; revisar
    DOM/consola y confirmar que no hay warnings de WebGL.
20. **Seguridad**: buscar `RELAYER_PRIVATE_KEY` en `frontend/.svelte-kit` y en
    `frontend/dist`; no debe aparecer.
21. **Regresiones**: login, Guardian, tienda, turismo, chat, coches y un
    minijuego siguen funcionando.
22. **Auth del patrocinio**: llamar `sponsor-mint` con un `accountId` que no
    corresponda a `deriveAccountId(publicKey)`, con una key ajena y con un JWT
    expirado; debe responder `400`/`403`/`401` sin crear cuenta ni difundir
    transacción.
23. **Idempotencia**: repetir el mismo `request_id` y confirmar que hay un solo
    NFT y que la respuesta es la misma; usar el mismo id con otro `catalogId`
    debe responder `409`.
24. **Rate limit**: superar 5 `sponsor-mint` por minuto o 20 por cuenta/día y
    confirmar `429`; la UI muestra el motivo y no rompe la sesión.
25. **Sin JWT**: forzar `getIdentityToken()` a `null` y confirmar que el
    store cae a autopago firmado, sin abrir un popup inesperado ni dejar el
    botón colgado.
26. **Catálogo de skins**: confirmar que `get_catalog_supplies` devuelve las 11
    skins con `cap: 50` y `per_account_cap: 5`, que el selector de Market las
    agrupa bajo "Skins" y que `NftArt` muestra el ícono/tono de cada una (no un
    ícono genérico).

## 9. Riesgos y mitigaciones

| Riesgo                                                          | Impacto | Mitigación                                                                                                         |
| --------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| La cuenta del jugador tiene saldo 0 y no puede mintear          | alto    | Mint patrocinado: el relayer paga depósito y gas; el fondeo de `0.05 NEAR` queda para trading y autopago.             |
| La faucet o el fondeo inicial vacían al relayer                 | alto    | Montos de `0.05 NEAR`, presupuesto diario `0.5 NEAR`, reserva `0.5 NEAR` y comprobación de saldo antes de transferir.  |
| Los 10 NEAR de testnet no alcanzan                              | alto    | Deploy medido (~4.5), sobrante devuelto, `1 NEAR` de mints patrocinados, fondeo `0.05` por jugador y faucet acotada. Si se agota, se recarga el relayer sin redeploy. |
| Abuso del mint patrocinado con JWTs válidos                     | alto    | Rate limit por `sub`/IP/cuenta, topes on-chain global y por cuenta, `request_id` idempotente y presupuesto de `1 NEAR`. Es testnet; en producción iría con allowlist o NEP-366. |
| El depósito patrocinado se devuelve al jugador                  | medio   | `mint` reembolsa a `predecessor` (el relayer); verificar en el smoke test que el saldo del jugador no cambia.          |
| Precrear cuentas por CLI para “reciclar” saldo                  | medio   | Solo funciona con claves que controla el relayer; en FastAuth la clave es del jugador. Precrear 10.000 cuentas cuesta ~18 NEAR y no recupera el storage de los NFTs. |
| Entran 10.000 jugadores y el pool se vacía                      | alto    | La cuenta se crea en el primer mint, no en el login; `1 NEAR` cubre ~160 mints patrocinados y el pool de `3.5 NEAR` fondea ~70 cuentas. 10.000 primeros mints cuestan ~70 NEAR, así que no caben en 10: la demo se limita a ~70 jugadores y 825 NFTs. |
| El mint de `0.01` no cubre el storage real                      | alto    | Medir `storage_usage` en Fase 1 con metadata base y ajustar `MINT_DEPOSIT_YOCTO`/`MIN_MINT_BALANCE_YOCTO` al valor medido + 20 %. |
| Sobrefondear las cuentas de los contratos                       | alto    | Crear con `2.6`/`2.4`, medir `storage_usage` y devolver el exceso con `near send`; no copiar los 4-5 NEAR de la referencia. |
| `mint` público permite tokens falsos en la colección            | alto    | Aceptado para testnet; la UI solo ofrece el catálogo y los topes limitan la emisión. Para producción, allowlist o firma del backend. |
| Un jugador acapara todo el stock de un ítem                     | medio   | Tope global + tope por cuenta (`3`/`5` según el ítem); el owner puede ajustarlos sin redeploy.                      |
| Los topes del frontend y del contrato divergen                  | medio   | La UI lee `get_catalog_supplies`/`get_account_minted`; `CATALOG_CAPS` solo es fallback. El contrato siempre manda.  |
| Quemar un NFT no libera cupo                                    | bajo    | Decisión explícita: `catalog_minted` es monótono para no repetir seriales; el cupo es de emisión, no de circulación. |
| El JWT de firma expira o el usuario cierra el popup             | alto    | Mensaje "Sign in again" y reintento; no se difunde nada sin firma.                                                 |
| Un token de firma viejo hace firmar bytes de otra tx            | alto    | Limpieza de la caché de Auth0 + comparación de bytes antes de `send_tx`.                                           |
| El relayer firma `sign` para transacciones arbitrarias          | alto    | Decodificar `sign_payload` y validar `receiverId` contra NFT/market; rate limit y guard válido.                    |
| Dos copias de `@near-js/transactions` rompen `instanceof`       | medio   | Broadcast manual con `encodeTransaction` de la misma copia que armó la tx.                                         |
| `mt_tokens_for_owner` con `from_index: 0` numérico devuelve []  | medio   | Enviar `null` o string; nunca el número 0.                                                                         |
| La lectura `final` va atrás de la tx y muestra estado viejo     | medio   | Polling `optimistic` post-tx y fallback a `final`.                                                                 |
| El mercado queda con tokens en escrow si un callback falla      | alto    | Tests unitarios y de sandbox de `resolve_buy`/`resolve_cancel`; el token solo se mueve tras confirmar.             |
| El comprador paga y no recibe el token                          | alto    | El market paga al vendedor solo si la transferencia del token tuvo éxito; si falla, reembolsa al comprador.         |
| Precios con decimales mal parseados                             | medio   | `parseNear` con BigInt y regex de hasta 24 decimales; mostrar el yoctoNEAR antes de confirmar.                     |
| El RPC público limita pedidos (429)                             | medio   | Mensajes claros, polling tolerante y reintento manual.                                                             |
| El panel monta demasiados canvas 3D                             | medio   | Tarjetas solo con póster/icono o `<img>`; ningún `ModelPreview` en el mercado.                                      |
| El mercado tapa o rompe el input del jugador                    | alto    | Vive dentro de `ShopPanel`; `hubKiosks.panelOpen` ya bloquea input y prompts. Al cerrar la tienda se restaura.      |
| Cambia la forma de `SignResponseAny` en la MPC                  | medio   | `extractSignature` soporta EdDSA y ECDSA; ignora receipts intermedios.                                              |
| Las claves del deployer quedan con acceso al contrato           | alto    | Solo testnet; documentar el riesgo y rotar/eliminar claves de upgrade en producción.                               |
| NEP-245 no es un NFT "puro"                                     | medio   | NEP-245 sí representa NFTs con supply 1; se usan seriales únicos. Si se exige NEP-171, se reescribe el contrato y el market. |
| El owner del market no puede cambiar la whitelist               | medio   | `owner_id` = deployer (con clave) en vez de `null`; documentar cómo agregar contratos.                              |
| Cambios en `shopCatalog` rompen el mapeo de arte                | bajo    | `catalogId` estable, fallback a póster genérico y tipos TS.                                                        |

## 10. Preguntas abiertas

Resueltas en la revisión del 2026-11-13:

- [x] NEP-245 con 1 unidad por token y seriales únicos. Sí sirve para NFTs.
- [x] Fondeo inicial de `0.05 NEAR` + faucet de `0.05 NEAR` cada 24 h, por el
      presupuesto de 10 NEAR.
- [x] Entrada dentro del div de la tienda, como pestaña del `ShopPanel`.
- [x] `mint` público en testnet, limitado por topes on-chain.
- [x] Metadata base por catálogo y `mint(owner_id, catalog_id)` para bajar el
      costo del token y permitir depósitos de `0.01 NEAR`.
- [x] La cuenta on-chain se crea en el primer mint, no en el login.
- [x] No se precrean cuentas por CLI para “reciclar” saldo: en FastAuth la clave
      es del jugador y el storage de los NFTs queda en el contrato.
- [x] Mint patrocinado por el relayer como flujo principal, con autopago por MPC
      como fallback cuando se agota el presupuesto de `1 NEAR`.

Pendientes:

- [x] Topes definitivos para esta iteración: skins `50/5`, armas `25/3`,
      assets `50/5`, vehículos `25/3`. Se pueden ajustar sin redeploy.
- [ ] ¿El tope por cuenta debe existir desde el inicio o solo el global? El
      spec lo incluye para evitar que una cuenta acapare todo el stock.
- [ ] ¿Se quieren fees de plataforma o royalties? Este spec no los incluye.
- [x] Las skins de personaje también se mintean como NFT. Se pueden comprar
      directamente en el mercado o desbloquear pasando misiones; el NFT no
      cambia el desbloqueo local.
- [ ] ¿Se necesita subida de imágenes a IPFS desde el juego, o alcanza con
      pegar una URL/`ipfs://` existente?
- [ ] ¿Se planea mainnet? Cambian contratos, Auth0, RPC, faucet y política de
      claves.
- [ ] ¿Hay otra fuente de NEAR testnet (faucet oficial, otra cuenta) para
      recargar el relayer si los 10 NEAR se agotan, o el presupuesto es
      estrictamente 10?
- [ ] ¿10.000 jugadores es un requisito real o una estimación? Si es real, este
      spec no alcanza: hacen falta ~70+ NEAR o lazy mint, que sería otro spec.
      Además, los topes actuales solo permiten 825 NFTs.
- [ ] ¿Quieres un spec posterior para NPCs con wallet, agentes que operen el
      mercado y NEAR Intents? Este spec deja la base, pero no los implementa.
- [ ] Solo si el jurado exige NEP-171 puro: habría que reescribir contrato y
      marketplace. La recomendación es quedarse con NEP-245.

## 11. Decisiones y notas

### Estándar

- **NEP-245, no NEP-25.** NEP-25 no existe. NEP-245 sí puede representar NFTs:
  cada `token_id` con supply 1 y metadata propia es un NFT. Se usa 1 unidad por
  `token_id` con serial único (`pistol-gold#12`) porque el marketplace de
  referencia ya está probado con escrow y `mt_transfer_call`, y evita
  approvals.
- **Sin approvals.** El token queda en escrow en la cuenta del market. Listar =
  `mt_transfer_call` con `msg = {"price":"<yoctoNEAR>"}`.
- **Whitelist.** El market solo acepta el contrato NFT configurado; un contrato
  falso no puede crear ventas sin tokens.
- **Sin fees ni royalties.** El vendedor recibe el 100% del precio. Se puede
  agregar después con un `fee_bps` y un `fee_recipient`.

### Suministro y antiinflación

- **Los 20 ítems de la tienda son la colección.** Las 11 skins de personaje,
  las 5 armas, los 2 assets y los 2 vehículos. Las skins se pueden desbloquear
  con misiones o coleccionar/comprar como NFT; el NFT no altera el desbloqueo
  local.
- **Tope global + tope por cuenta.** Cada `catalog_id` tiene `cap` y
  `per_account_cap`. Los valores iniciales son 50/5 para skins, 25/3 para
  armas, 50/5 para assets y 25/3 para vehículos (825 NFTs como máximo). El
  owner puede cambiarlos sin redeploy.
- **Serie única.** Cada mint crea `catalog_id#serial`; la serie se muestra en
  la tarjeta y sale del `token_id`.
- **`minted` es monótono.** Quemar no libera cupo ni reutiliza seriales. El tope
  controla emisión total, no circulación.
- **La cadena manda.** La UI lee los topes y los mints por cuenta del contrato;
  `CATALOG_CAPS` solo es fallback. Un intento por CLI también respeta el tope.
- **Por qué así.** Evita inflación, permite escasez real y deja la puerta
  abierta a temporadas o drops con topes distintos sin tocar el código.

### Fondeo y presupuesto

- **10 NEAR es el techo.** El reparto es deploy ~4.7, buffer de ventas 0.3,
  mints patrocinados 1, reserva 0.5 y pool de jugadores 3.5. Cualquier cambio de
  montos debe respetar ese total.
- **Cuentas nuevas: `0.05 NEAR`.** Creadas en el primer mint, no en el login.
  Ese saldo es para listar/comprar y para el autopago si se agota el
  patrocinio; el mint patrocinado no lo gasta. Esto supersede la decisión de
  `SPEC-036` de no fondear.
- **Mint patrocinado: `~0.006 NEAR` por mint.** El relayer paga el depósito de
  `0.01` y recupera el sobrante; `1 NEAR` cubre ~160 mints. Es el flujo
  principal y no requiere firma del jugador.
- **Autopago.** Cuando se agota el presupuesto patrocinado, el jugador firma con
  MPC y paga `0.01 NEAR` de su saldo. La UI cambia de `Free mint` a
  `Mint · 0.01 NEAR`.
- **Faucet: `0.05 NEAR`.** Solo para cuentas con saldo menor a `0.03 NEAR`,
  una vez cada 24 h y con presupuesto diario de `0.5 NEAR`. La reserva
  `RELAYER_RESERVE_NEAR = 0.5` apaga faucet y patrocinio antes de vaciar al
  relayer.
- **Capacidad del pool.** `1 NEAR` de patrocinio cubre ~160 mints; `3.5 NEAR` de
  fondeo cubre ~70 cuentas a `0.05`. Los 825 NFTs se completan combinando
  patrocinio y autopago.
- **Controles.** La faucet verifica que la cuenta exista y contenga la public
  key; limita por cuenta/IP. `sponsor-mint` valida JWT, deriva `accountId`,
  exige `request_id` y limita por `sub`/IP/cuenta. Es una solución de demo, no
  un sistema de incentivos de producción.
- **No sobrefondear contratos.** Se crean con `2.6`/`2.4`, se mide el storage
  real y se devuelve el exceso. El NFT queda con storage + `0.02`; el market con
  storage + `0.30` para el storage de las ventas activas.
- **Saldo mínimo para autopago.** `0.015 NEAR` cubre el depósito de `0.01` más
  margen de gas. Si la medición del storage obliga a subir el depósito, el
  umbral sube con él.
- **Capacidad de la demo.** Aun bajando el fondeo a `0.02` por jugador, 10 NEAR
  no alcanzan para 10.000 primeros mints (~70 NEAR). Con `0.05` el pool fondea
  ~70 cuentas; esas cuentas pueden emitir los 825 NFTs combinando patrocinio y
  autopago, pero no hay 825 jugadores distintos. Al agotarse ambos, la UI
  muestra "capacity reached" y el mercado sigue en modo lectura.
- **No precrear cuentas para reciclar.** El relayer solo puede devolver saldo de
  cuentas cuya clave controla. En FastAuth la clave es del jugador; además, el
  storage de cada NFT queda en el contrato. Precrear 10.000 cuentas cuesta
  ~18 NEAR y no evita el costo de los mints.
- **Si se agota.** Recargar solo la cuenta del relayer; los contratos no
  necesitan redeploy ni más storage.

### Seguridad del mint patrocinado

- **Autenticación.** El frontend manda el JWT de Auth0; el backend verifica
  firma con JWKS, `aud` y `iss`. Un token vencido cae a autopago, no a un popup.
- **Identidad.** Para crear una cuenta nueva, `accountId` debe ser
  `deriveAccountId(publicKey)` (`t-<sha256 12 hex>.testnet`) o el handle
  automático del juego (`t-nearbox-<sha256 10 hex>.testnet`). Los handles
  personalizados o antiguos se aceptan solo si la cuenta ya existe y contiene
  la `publicKey` entre sus access keys. Así el relayer no crea cuentas
  arbitrarias ni mintea a una cuenta ajena a pedido de un atacante.
- **Idempotencia y abuso.** `request_id` evita dobles mints por reintento; rate
  limit por `sub`/IP/cuenta, topes on-chain y presupuesto de `1 NEAR` acotan el
  daño. Es testnet: en producción iría con allowlist o NEP-366.

### Firma

- **FastAuth/MPC.** El cliente arma la transacción, pide la firma al popup de
  Auth0, manda el payload al relayer y este llama `sign` en
  `fast-auth.testnet`. La firma útil está en el `SuccessValue` del receipt
  final, no en el `status` superior.
- **Broadcast manual.** Se codifica con la misma copia de
  `@near-js/transactions` que armó la transacción y se envía por JSON-RPC
  `send_tx` con `wait_until: 'EXECUTED'`.
- **Validación de bytes.** Antes de difundir se compara `signPayload` con
  `encodeTransaction(tx)`; si no coinciden, se aborta.
- **Mint patrocinado sin firma.** El jugador no firma el mint: el relayer llama
  `mint(owner_id = jugador, catalog_id)` y paga gas + depósito. El JWT de Auth0
  autentica la llamada HTTP, pero no autoriza mover tokens ni NEAR del jugador.
- **Validación del relayer.** Además del guard, se decodifica la transacción y
  se exige que el `receiverId` sea el NFT o el market. Esto evita usar el
  relayer como firmante genérico.

### UI

- **Entrada dentro de la tienda.** El mercado es una quinta pestaña del
  `ShopPanel` existente, al lado de Skins / Weapons / Assets / Vehicles. No hay
  botón nuevo en el HUD ni kiosco nuevo: se entra por el kiosco Halloween Shop
  y se comparte el diálogo, el backdrop y el cierre.
- **Tres sub-pestañas.** Browse (ventas activas), My NFTs (tokens propios +
  mint) y My listings (ventas propias + cancelar).
- **Cupo visible.** El formulario de mint muestra `minted / cap`, el cupo
  restante de la cuenta y `Sold out` cuando corresponde.
- **Arte sin canvas.** Las tarjetas usan el póster/icono de `shopUi.ts` o
  `media` como `<img>`. El mercado no monta `ModelPreview` para evitar decenas
  de contextos WebGL; la vista 3D sigue en la tienda.
- **Inglés.** Toda la copia nueva de UI va en inglés, igual que el resto del
  HUD y el onboarding.

### Datos y estado

- **La cadena es la fuente de verdad.** No hay base de datos de ventas en el
  backend. El store refresca por RPC y sondea después de cada tx.
- **Paginación.** 50 ventas por página y 100 tokens propios; la UI muestra la
  primera página en esta iteración.
- **Metadata.** Vive una sola vez por catálogo en el contrato; el token solo
  guarda `catalog_id` y `serial`. `mt_metadata_token_by_token_id` sintetiza
  `title`/`media` desde la metadata base y un `extra` con
  `{"catalogId":"...","serial":N}`. Si el token viene de otra colección, la UI
  cae a `title`/`media`.
- **Supply.** Los topes y los mints por cuenta se leen del contrato en cada
  `refresh`; no se cachean en `localStorage`. La UI muestra la primera página
  y el supply completo de los 20 ítems.
- **Persistencia.** Solo se persiste la sesión de Auth0. No se agregan claves
  nuevas de `localStorage` para el mercado.

### Deploy

- **Cuenta deployer.** Se recomienda reutilizar `RELAYER_ACCOUNT_ID` y crear
  `nft.<deployer>.testnet` y `market.<deployer>.testnet`.
- **Storage y recuperación.** Crear las subcuentas con `2.6` y `2.4 NEAR`,
  desplegar, medir `storage_usage`, devolver el exceso con `near send` y dejar
  el NFT con storage + `0.02 NEAR` y el market con storage + `0.30 NEAR` para
  ventas activas. Balance esperado: ~2.45 y ~2.35 NEAR. No repetir los 4-5 NEAR
  por contrato de la referencia.
- **Owner del market.** `owner_id` = deployer para poder administrar la
  whitelist. El contrato NFT usa el deployer como owner informativo.
- **Topes.** El `init` del NFT recibe los 9 `CatalogCap` originales; las 11
  skins se agregan con `set_catalog_cap` del owner. Quedan on-chain y se
  registran en `contracts/deployments/testnet.json`. Cambiarlos después es una
  llamada `set_catalog_cap` del owner, no un redeploy.
- **Registro.** `contracts/deployments/testnet.json` guarda IDs, WASM, args,
  topes, balances finales, txs y explorer, igual que el proyecto de referencia.
- **Claves.** El `.env` real y `.near-credentials/` están gitignored. Las claves
  del deployer no se incluyen en el frontend.

### Economía del juego

- **La economía es el gameplay.** La colección usa objetos que ya existen
  (armas, assets y vehículos). El valor viene de la escasez (topes), la
  propiedad y el mercado secundario, no de un token nuevo.
- **Mercado de los jugadores.** Los precios los ponen los jugadores; el
  contrato solo custodia y liquida. No hay precios fijados por el juego.
- **Fuera de alcance por ahora.** NPCs con wallet propia, agentes que compren o
  vendan solos y NEAR Intents. La base on-chain los permite después, pero este
  spec no los implementa.

## 12. Progreso

| Fecha      | Estado   | Nota                                                                                          |
| ---------- | -------- | --------------------------------------------------------------------------------------------- |
| 2026-11-13 | borrador | Spec creado: contratos NEP-245 + market escrow, firma FastAuth/MPC, faucet y UI de mercado.   |
| 2026-11-13 | borrador | Revisión: topes de emisión on-chain, serie por NFT, entrada como pestaña del ShopPanel.        |
| 2026-11-13 | borrador | Presupuesto de 10 NEAR: deploy medido, sobrante devuelto, fondeo y faucet de 0.05 NEAR.        |
| 2026-11-13 | borrador | Mint compacto: metadata base por catálogo, `mint(owner_id, catalog_id)`, depósito 0.01 NEAR.    |
| 2026-11-13 | borrador | Mint patrocinado por el relayer, JWT/JWKS, `request_id` idempotente y autopago como fallback.   |
| 2026-11-13 | en progreso | Implementación local completa: contratos + tests, backend, servicios y pestaña Market. WASM medidos. Deploy en testnet pendiente de fondos. |
| 2026-11-13 | en progreso | Deploy en testnet: `nft.runworld-nep245.testnet` y `market.runworld-nep245.testnet`; smoke test mint/listar/comprar/cancelar y tope por cuenta. Queda la aceptación manual en navegador. |
| 2026-11-13 | en progreso | Skins mintables: 11 catálogos on-chain 50/5 y CTA de mint en las cuatro pestañas de la tienda. Supply total 825 NFTs. |
| 2026-11-14 | en progreso | `USER_NOT_LOGGED_IN`: el iframe de renovación de Auth0 fallaba (cookies de terceros bloqueadas en Brave) y el SDK borraba la sesión en silencio. Fix: `useRefreshTokensFallback: false` y botón "Sign in again". |
| 2026-11-14 | en progreso | El audience de firma no se puede pedir en silencio (Auth0 FastAuth exige payload de transacción). El mint patrocinado y las stats usan ahora el **ID token** (`aud` = clientId) ya cacheado; el backend acepta ese `aud`. Verificado: `coin-pistol#1` minteado gratis y en la chain. |

## 13. Changelog

- 2026-11-13 — Creación del spec: colección NEP-245 1-of-1, marketplace con
  escrow, deploy en testnet, `sign-tx` y faucet en el backend Elysia, servicios
  NFT, store y panel de mercado con Browse / My NFTs / My listings.
- 2026-11-13 — Revisión con el usuario: se confirma NEP-245 para NFTs, se
  agregan topes de emisión globales y por cuenta (25/3, 50/5, 25/3), serial
  `catalogId#N`, views de supply y estado `Sold out`. El mercado pasa a ser una
  pestaña dentro del `ShopPanel`, no un modal ni un botón del HUD. Se aclara
  que NPCs con wallet y NEAR Intents quedan para un spec posterior.
- 2026-11-13 — Presupuesto de testnet: como la cuenta maestra solo tiene 10
  NEAR, se baja el fondeo a `0.05 NEAR` por cuenta y la faucet a `0.05 NEAR` con
  presupuesto diario y reserva. El deploy mide `storage_usage` y devuelve el
  sobrante; los contratos quedan con solo storage + `0.02 NEAR`.
- 2026-11-13 — Mint barato: la metadata se guarda una vez por catálogo, el token
  solo guarda `catalog_id`/`serial`, `mint` deja de recibir metadata y el
  depósito baja a `0.01 NEAR`. La cuenta on-chain se crea en el primer mint, no
  en el login; con 10 NEAR el techo es ~70 cuentas fondeadas y 825 NFTs, no
  10.000 jugadores.
- 2026-11-13 — Fondeo final en `0.05 NEAR` por jugador y faucet de `0.05 NEAR`
  (pool ~70 cuentas). Se documenta que precrear cuentas por CLI no permite
  reciclar saldo de jugadores FastAuth ni recupera el storage de los NFTs.
- 2026-11-13 — Mint patrocinado adoptado como flujo principal:
  `POST /relayer/sponsor-mint` valida JWT/JWKS, deriva `accountId` de la
  `publicKey`, verifica la key on-chain y llama `mint(owner_id = jugador)`.
  Presupuesto de `1 NEAR` (~160 mints a ~0.006), `request_id` idempotente, rate
  limits y autopago firmado como fallback. El market sube su buffer a `0.30
  NEAR` y la reserva operativa baja a `0.5 NEAR`.
- 2026-11-13 — Implementación local: contratos NEP-245 y market con 20 tests
  unitarios y sandbox; backend con JWKS, faucet, `sign-tx`, `sponsor-mint`
  idempotente y límites; frontend con firma MPC, store y pestaña Market dentro
  de `ShopPanel`. WASM medidos (NFT `271 290` B, market `201 401` B); el deploy
  en testnet queda pendiente de completar el presupuesto de la cuenta relayer.
- 2026-11-13 — Deploy real con la cuenta `runworld-nep245.testnet` creada por el
  faucet de testnet (10 NEAR). Se desplegaron
  `nft.runworld-nep245.testnet` (tx `6wNK9Z…`) y
  `market.runworld-nep245.testnet` (tx `m4dvTB…`), se recuperó el sobrante
  (NFT con buffer `0.0216`, market con `0.2999`) y el deployer quedó con
  `4.298 NEAR`. Smoke test por CLI: mint → listar → comprar → cancelar y tope
  por cuenta (`Account mint limit reached`). `contracts/deployments/testnet.json`,
  `frontend/.env.local` y `backend/.env` apuntan a las cuentas nuevas.
- 2026-11-13 — Fix de configuración del cliente: `import.meta.env` solo expone
  variables con prefijo `VITE_`, así que los `PUBLIC_*` documentados (contratos
  y Auth0) llegaban `undefined` y el bundle decía "Market is not configured".
  `vite.config.ts` ahora declara `envPrefix: ['VITE_', 'PUBLIC_']` y el build
  incluye `nft.runworld-nep245.testnet` / `market.runworld-nep245.testnet`.
- 2026-11-13 — Smoke test del relayer: con `backend/.env` nuevo, `ensure-account`
  creó y fondeó `t-nearbox-b5d836eacc.testnet` y `t-nearbox-f0334fe4fc.testnet`
  con `0.05 NEAR` y su `publicKey` como única FullAccess key; `sponsor-mint`
  rechazó un JWT inválido con `401` y un `request_id` no UUID con `400`;
  `sign-tx` devolvió `403` para un receiver no permitido, `400` para un
  `guard_id` inválido y `502` para un JWT falso; la faucet devolvió `403` con
  una key ajena, `200 alreadyFunded` con una cuenta ya fondeada y `429` al
  repetir. Con `RELAYER_RESERVE_NEAR=100` simulado en una instancia aparte,
  `fund-account` y `ensure-account` respondieron `503` con "Testnet funds are
  running low" sin crear cuentas ni mover fondos.
- 2026-11-13 — Skins incluidas en la colección: se agregaron 11 catálogos
  on-chain con `set_catalog_cap(50,5)` + `set_catalog_metadata` desde
  `runworld-nep245.testnet`, sin redeploy (txs en
  `contracts/deployments/testnet.json`). `nft/catalog.ts` ahora normaliza
  `SKINS` + `SHOP_WEAPONS` + `SHOP_ASSETS` + `SHOP_VEHICLES` en
  `MintableCatalogItem`, `NftArt` usa el ícono y tono de cada skin y
  `MintItemButton` permite mintear desde el detalle de las cuatro pestañas de
  la tienda. El mercado queda activo mientras la tienda esté abierta y el
  supply total pasa a **825 NFTs**. Se enviaron `0.01 NEAR` al NFT para
  mantener el buffer storage + `0.02`.
- 2026-11-14 — `USER_NOT_LOGGED_IN` al mintear: venía del SDK de FastAuth
  (`FastAuthClient.getSigner()` → `JavascriptProvider.isLoggedIn()`), no del
  relayer ni del contrato. Causa raíz: el cliente de Auth0 se creó con
  `useRefreshTokensFallback: true`; al pedir por primera vez el audience de
  firma (pedirla en silencio), el SDK intenta el
  iframe oculto de Auth0, Brave bloquea sus cookies de terceros, el iframe
  responde `login_required` y auth0-spa-js reacciona con un `logout({openUrl:
  false})` **silencioso** que borra el cache (`CacheManager.clear(clientId)`).
  El log de LevelDB de `http://localhost:3000` lo muestra literal: `PUT
  @@auth0spajs@@::<clientId>::@@user@@` + `PUT ::default::…` al entrar y, dos
  operaciones después, los `DEL` de esas mismas claves. El mint seguía, el
  fallback a autopago llamaba `getSigner()` con el cache vacío y aparecía
  `USER_NOT_LOGGED_IN`. Arreglo: `useRefreshTokensFallback: false` (nunca
  iframe) y `clearStaleSigningTokens()` ya no borra el token de login (solo los
  de `transaction:sign`). Además `getSigner()` traduce `USER_NOT_LOGGED_IN` a
  `SessionExpiredError`, `nft/errors.ts` lo mapea a "Your Google session
  expired. Sign in again to continue." y el mercado expone `needsLogin` +
  `reconnect()` con el botón **Sign in again** (`MintItemButton`/`MarketView`)
  para reabrir el popup sin recargar el juego.
- 2026-11-14 — Descubrimiento: pedir el audience de firma en el **login** es
  inválido: la Action de Auth0 FastAuth responde `Signing audience requested
  without transaction payload`. Ese intento se revirtió. El audience de firma
  solo se puede pedir abriendo el popup de firma, y el access token por defecto
  es un JWE de 5 segmentos que no se puede verificar contra JWKS. Así que el
  mint patrocinado y el sync de stats pasan a autenticarse con el **ID token**
  de Auth0 (`aud` = clientId), que `auth0-spa-js` ya guarda en la caché al
  entrar. `getIdentityToken()` lee `cacheManager.getIdToken({clientId})`: sin
  popup y sin red. `backend/src/server/auth0.ts` acepta además el `aud` del
  clientId (env `AUTH0_CLIENT_ID`) y solo usa el `sub`. Verificado contra el SDK
  real 2.30.0 en Node (la caché `@@user@@` devuelve el ID token sin tocar la
  red) y con un ID token real del browser: `verifyAuth0Jwt()` lo acepta
  (`sub=google-oauth2|…`). `bunx tsc --noEmit` limpio; `svelte-check` con 0
  errores. **Verificación end-to-end en navegador**: login con Google (sin error
  de `Signing audience`) y mint patrocinado correcto; `mt_tokens_for_owner`
  muestra `coin-pistol#1` de `t-nearbox-f465a090b8.testnet`.
