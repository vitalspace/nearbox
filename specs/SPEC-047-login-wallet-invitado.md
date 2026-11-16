---
id: SPEC-047
titulo: "Entrada con wallet NEAR propia y modo invitado"
estado: completado
prioridad: alta
creado: 2026-11-15
actualizado: 2026-11-15
responsable: opencode
etiquetas:
  [
    auth,
    wallet,
    near,
    nep-413,
    meteor,
    guest,
    invitado,
    nearbox,
    mpc,
    relayer,
    svelte,
    elysia,
    bun,
  ]
depende_de: [SPEC-036, SPEC-038, SPEC-045]
bloquea: []
estimacion: "6h"
---

# SPEC-047 — Entrada con wallet NEAR propia y modo invitado

## 1. Contexto

`SPEC-036` dejó una única puerta de entrada: Google vía Auth0/FastAuth, que
deriva una clave MPC y crea una cuenta `t-nearbox-<10 hex>.testnet` con el
relayer. Ese flujo funciona en testnet, pero el cliente Auth0 compartido de
FastAuth **solo acepta el callback `http://localhost:3000`**. Mientras NearBox no
tenga su propio cliente Auth0 para `nearbox.lol`, el login con Google no se puede
usar en el dominio público.

El juego tampoco debe quedar cerrado a quien ya tiene una wallet NEAR: un
jugador con Meteor Wallet debería poder entrar con su propia cuenta y
recibir allí los NFTs de misión. Y un visitante sin cuenta debería poder probar
el mundo sin fricción.

Este spec añade dos modos de entrada junto al existente, sin tocar el loop de
juego ni el contrato NEP-245:

1. **Wallet propia** (`wallet`): Meteor conecta, el jugador firma
   un mensaje NEP-413 y el backend emite un token de sesión. El modo se comporta
   igual que Google en stats, progresión, mercado y reclamo de recompensas.
2. **Invitado** (`guest`): sin cuenta ni wallet. El mundo, los NPCs y los
   minijuegos funcionan; el progreso se guarda por UUID y los NFTs quedan
   deshabilitados.

El modo Google (`fastauth`) sigue intacto y es el que usa el flujo patrocinado
del relayer.

## 2. Objetivo

Permitir tres formas de entrar a NearBox —Google, wallet NEAR propia e
invitado— compartiendo el mismo backend, la misma progresión y el mismo mundo.
En modo wallet, los NFTs de misión se mintean a la cuenta del jugador y el
mercado funciona con su propia firma.

## 3. Alcance

**Incluye**

- Tres modos en `authSession`: `fastauth`, `wallet`, `guest`, persistidos en
  `localStorage` (`nearbox:auth:mode`).
- Login wallet con `@near-wallet-selector` (Meteor).
- Prueba de identidad NEP-413 (`signMessage`) verificada en el backend.
- Token de sesión propio `wbs1.<payload>.<hmac>` aceptado donde ya se aceptaba
  el JWT de Auth0.
- Reclamo de recompensas NFT en modo wallet: el relayer mintea a la cuenta de la
  wallet, sin pedir `publicKey` al cliente.
- Escrituras on-chain del mercado desde la wallet del jugador.
- Modo invitado con identidad UUID y aviso de que no puede reclamar NFTs.
- UI de `Guardian.svelte` con las tres opciones y copys neutrales.

**No incluye**

- Crear cuentas NEAR nuevas para wallets (la wallet ya existe).
- Fondeo, gas o depósito patrocinado para compras/ventas de mercado en modo
  wallet: esas transacciones las paga la wallet.
- Login con email/contraseña.
- Migrar progreso de invitado a cuenta (el flujo ya existe para UUID legacy vía
  `legacyPlayerId`; no se añade UI nueva).
- Cambiar contratos, catálogos NEP-245 o el motor de precios.

## 4. Requisitos

### Funcionales

| ID   | Requisito | Prioridad |
| ---- | --------- | --------- |
| RF-1 | `Guardian.svelte` ofrece Google, Meteor y “Play as guest”. | alta |
| RF-2 | La wallet conecta y firma un mensaje `NearBox sign-in\n<ISO>` (NEP-413). | alta |
| RF-3 | El backend verifica firma, frescura (±5 min), nonce de un solo uso y access key en cadena. | alta |
| RF-4 | El backend emite un token de sesión `wbs1.…` con `sub = wallet:<accountId>` y TTL de 7 días. | alta |
| RF-5 | Stats, progresión, recompensas y WebSocket aceptan el token de wallet igual que el JWT. | alta |
| RF-6 | El reclamo de recompensa en modo wallet exige que la cuenta del token coincida con `accountId` y mintea a esa cuenta sin `publicKey`. | alta |
| RF-7 | El mercado en modo wallet firma con la wallet (`signAndSendTransaction`) y paga gas/depósito. | alta |
| RF-8 | El modo invitado usa el UUID local, no envía token y no puede reclamar NFTs. | media |
| RF-9 | Al recargar, la sesión se restaura sin volver a pedir login (wallet incluida). | alta |
| RF-10 | Logout limpia token, modo y conexión de wallet. | media |

### No funcionales

| ID    | Requisito | Criterio |
| ----- | --------- | -------- |
| RNF-1 | Sin popups de wallet ni gas en el loop normal de Google. | El modo `fastauth` no cambia. |
| RNF-2 | La cuenta de la wallet no se acepta por input del cliente. | Firma NEP-413 + `view_access_key` en cadena. |
| RNF-3 | Una firma capturada no se puede reutilizar. | Nonce en caché + ventana de frescura. |
| RNF-4 | El token no se puede forjar ni modificar. | HMAC-SHA256 con comparación en tiempo constante. |
| RNF-5 | El modo wallet paga sus propias transacciones de mercado. | Queda explícito en la UI/errores. |
| RNF-6 | El invitado no rompe stats/progresión. | UUID sin dueño, mismas rutas que SPEC-042. |

## 5. Criterios de aceptación

- [x] CA-1: Con Meteor, entrar firma el mensaje y muestra la cuenta en el HUD.
- [x] CA-2: Una firma alterada, un mensaje viejo o un nonce repetido devuelven 401.
- [x] CA-3: Con una wallet real de testnet, `/stats` y `/progression` responden
      con el token `wbs1.…`.
- [x] CA-4: Completar una misión y reclamar en modo wallet mintea el NFT a la
      cuenta de la wallet (relayer patrocina; la wallet no paga gas).
- [x] CA-5: Comprar/listar en el mercado en modo wallet abre la wallet y firma
      la transacción.
- [x] CA-6: “Play as guest” entra al mundo sin cuenta y el HUD avisa que los
      NFTs requieren iniciar sesión.
- [x] CA-7: Recargar la página restaura el modo y la cuenta sin nuevo login.
- [x] CA-8: `bun test` del backend y `svelte-check` del frontend pasan.

## 6. Archivos relevantes

| Ruta | Acción | Motivo |
| ---- | ------ | ------ |
| `backend/src/server/wallet.ts` | crear | NEP-413, access key, token `wbs1`. |
| `backend/src/server/sessionToken.ts` | crear | Verificador dual Auth0/wallet. |
| `backend/src/routes/auth.ts` | crear | `GET /auth/wallet/config`, `POST /auth/wallet`. |
| `backend/src/server/identity.ts` | modificar | Identidad WS desde token de wallet. |
| `backend/src/routes/stats.ts` | modificar | Verificador dual por defecto. |
| `backend/src/routes/progression.ts` | modificar | Verificador dual por defecto. |
| `backend/src/progression/rewards.ts` | modificar | Reclamo sin `publicKey` en wallet. |
| `backend/src/routes/rewards.ts` | modificar | `publicKey` opcional en el schema. |
| `backend/src/stats/identity.ts` | modificar | Mensajes/copys neutrales. |
| `backend/tests/wallet.test.ts` | crear | Firma, replay, token, expiración. |
| `frontend/src/lib/near/wallet.ts` | crear | Selector, NEP-413, sesión, transacciones. |
| `frontend/src/lib/state/auth.svelte.ts` | modificar | Tres modos y restauración. |
| `frontend/src/lib/near/tx.ts` | modificar | `callMethod` despacha a la wallet. |
| `frontend/src/lib/nft/collection.ts` | modificar | Mint propio en modo wallet. |
| `frontend/src/lib/state/progression.svelte.ts` | modificar | Token y `publicKey` opcional. |
| `frontend/src/lib/state/stats.svelte.ts` | modificar | Token de sesión. |
| `frontend/src/lib/state/lobby.svelte.ts` | modificar | Identidad WS por token. |
| `frontend/src/lib/state/nftMarket.svelte.ts` | modificar | Reconexión y copys neutrales. |
| `frontend/src/lib/GamePage.svelte` | modificar | Identidad de invitado. |
| `frontend/src/lib/components/Guardian.svelte` | modificar | UI de las tres entradas. |
| `frontend/src/lib/components/ui/RewardCard.svelte` | modificar | Gate por cuenta, no por modo. |
| `frontend/src/lib/components/ui/SettingsMenu.svelte` | modificar | Aviso de invitado. |
| `frontend/src/lib/near/config.ts` | modificar | `WALLET_AUTH_URL`, recipient. |
| `frontend/vite.config.ts` | modificar | Proxy `/api/auth`. |
| `backend/.env.example` | modificar | `WALLET_AUTH_RECIPIENT`, `WALLET_SESSION_SECRET`. |
| `frontend/.env.example` | modificar | `PUBLIC_WALLET_AUTH_RECIPIENT`. |
| `AGENTS.md` | modificar | Registrar las tres entradas. |

## 7. Plan de implementación

### Fase 1 — Prueba de identidad en el backend

- [x] Serializar el payload NEP-413 en Borsh, hashear con SHA-256 y verificar con
      `utils.PublicKey.verify`.
- [x] Exigir mensaje `NearBox sign-in\n<ISO>`, ventana de ±5 minutos y nonce
      nuevo.
- [x] Consultar `view_access_key` en el RPC para atar la clave a la cuenta.
- [x] Emitir `wbs1.<payload>.<hmac>` con `sub = wallet:<accountId>`.
- [x] Rate limit por IP en `POST /auth/wallet` (10/min).

### Fase 2 — Aceptar el token en todos los endpoints

- [x] `verifySessionToken` elige entre JWT y token de wallet.
- [x] Stats y progresión usan el verificador dual por defecto.
- [x] WebSocket acepta el token de wallet al autenticar la sesión.
- [x] Recompensas: si hay `walletAccountId`, se exige coincidencia con
      `accountId`, se omite `assertOwned` y se mintea a la wallet.

### Fase 3 — Cliente

- [x] Selector solo con Meteor; `signIn` pide acceso FullAccess para
      poder operar en el mercado.
- [x] `createWalletSession` firma NEP-413 y canjea el token; se cachea por
      cuenta.
- [x] `authSession` con `mode`, `isGuest/isWallet/isFastAuth`, `canPlay`,
      `apiToken()` y `reconnect()`.
- [x] `callMethod` usa `signAndSendTransaction` en modo wallet.
- [x] Mint de mercado: la wallet paga gas/depósito; el minteo de recompensas
      sigue patrocinado por el relayer.
- [x] Invitado: identidad `playerProfile.playerId`, sin token, sin NFTs.

### Fase 4 — UI y documentación

- [x] `Guardian.svelte` con Google, dos wallets y “Play as guest”.
- [x] Textos de mercado y ajustes sin asumir Google.
- [x] Variables de entorno documentadas.
- [x] Este spec y `AGENTS.md` actualizados.

## 8. Verificación

```bash
# Backend
cd backend && bunx tsc --noEmit && bun test

# Frontend
cd frontend && bunx svelte-check --tsconfig ./tsconfig.json --output machine
```

Casos manuales:

1. Abrir `http://localhost:3000`, pulsar Meteor, aprobar conexión y firma;
   el HUD debe mostrar `<cuenta>.testnet`.
2. Recargar: la sesión debe restaurarse sin abrir la wallet.
3. Completar una misión de prueba y reclamar: el NFT debe aparecer en la cuenta
   de la wallet en el explorer.
4. Ir al Market, mintear un ítem: la wallet debe pedir firma y pagar gas.
5. Cerrar sesión y entrar con “Play as guest”: mundo jugable, recompensas con
   “Sign in to claim”.
6. Probar `POST /auth/wallet` con el nonce repetido: debe devolver 401.

## 9. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
| ------ | ------- | ---------- |
| Replay de una firma capturada | Suplantación de sesión | Nonce de un solo uso + ventana de ±5 min. |
| Phishing con otro `recipient` | Firma usada en otro sitio | El backend exige `WALLET_AUTH_RECIPIENT` exacto. |
| Clave no registrada en la cuenta | Suplantación por firma suelta | `view_access_key` en cadena antes de emitir el token. |
| `WALLET_SESSION_SECRET` efímero | Sesiones caen al reiniciar | Documentado; fallback estable desde `RELAYER_PRIVATE_KEY`. |
| Wallet sin `signMessage` | Login imposible con ese módulo | Error explícito; Meteor lo soporta. |
| El jugador espera gas patrocinado en mercado wallet | Fricción inesperada | El flujo de recompensas sigue patrocinado; el mercado se explica como transacción propia. |
| Invitado pierde progreso al limpiar storage | Pérdida de stats locales | El progreso también vive en Mongo por UUID; los NFTs requieren cuenta. |

## 10. Preguntas abiertas

- [ ] ¿NearBox tendrá un cliente Auth0 propio para `nearbox.lol`? Si sí, el modo
      Google vuelve a ser la entrada principal en producción y wallet/invitado
      quedan como alternativas.

## 11. Decisiones y notas

- **NEP-413, no `signMessage` ad hoc.** Se replica el Borsh de
  `@near-wallet-selector/core` (tag `2147484061`) y se firma `sha256(payload)`;
  así cualquier wallet compatible sirve sin código específico por proveedor.
- **El token es una sesión, no una cuenta.** No crea cuentas ni mueve fondos:
  convierte una firma válida en un `sub` estable para Mongo y el WebSocket.
- **`sub = wallet:<accountId>`.** Evita colisiones con `auth0|…` y deja claro
  qué cuenta respalda la sesión.
- **Recompensas patrocinadas también en wallet.** El relayer paga el mint; la
  wallet solo prueba quién es. Es la única forma de cumplir “cero gas prompts”
  en el loop de misión.
- **Mercado con firma de la wallet.** Comprar/listar/mintear mueve fondos del
  jugador; sería incorrecto patrocinarlo sin control. La wallet paga su gas.
- **Invitado sin NFT.** El UUID no puede firmar ni probar propiedad. Se mantiene
  el mundo completo y se avisa en la UI.
- **Modo persistido.** `nearbox:auth:mode` decide qué restaurar; si la wallet
  guardada ya no está disponible, se muestra el login en vez de entrar con otra
  identidad.
- **MyNearWallet retirado.** Su web ya no acepta conexiones nuevas (“MyNearWallet
  is being retired”), así que se eliminó el módulo
  `@near-wallet-selector/my-near-wallet`, su botón y su dependencia. Ofrecerlo
  solo producía un callejón sin salida; Meteor es la única wallet propia.
- **Errores de wallet sin copy de Google.** `humanizeError` recibe contexto
  (`google` o `wallet`): cerrar, bloquear o rechazar la conexión de Meteor ya no
  muestra “Google window”, sino un mensaje propio de la wallet.
- **Meteor pide una allowance de gas.** Al conectar, Meteor crea una access key
  de función limitada al contrato NFT y le asigna 0.25 NEAR de allowance (su
  valor por defecto). No es un cobro ni una transferencia a NearBox: es el
  máximo de gas que esa clave puede consumir en las transacciones que el
  jugador firma. Los mints de misión siguen patrocinados por el relayer.
- **Meteor y el `process` de Node.** `@meteorwallet/sdk` arrastra
  `@near-js/accounts`, que evalúa `process.env.DEFAULT_FINALITY` al importarse.
  En el navegador ese global no existe. El build ya lo sustituye, pero el
  prebundle de desarrollo de Vite 8 (Rolldown) no aplica el `define` superior;
  por eso `vite.config.ts` lo define también en
  `optimizeDeps.rolldownOptions.transform.define`. Sin eso, pulsar Meteor
  fallaba con `process is not defined` solo en `localhost`.

## 12. Progreso

| Fecha | Estado | Nota |
| ----- | ------ | ---- |
| 2026-11-15 | completado | Backend NEP-413 + token, cliente wallet, invitado, UI y tests. |

## 13. Changelog

- 2026-11-15 — Creación del spec e implementación completa.
