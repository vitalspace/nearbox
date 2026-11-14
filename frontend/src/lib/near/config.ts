/**
 * Configuración NEAR + FastAuth para el login con Google.
 *
 * Todo es testnet por ahora. La cuenta del jugador es `t-<handle>.testnet`
 * (automático `t-nearbox-<10 hex>` para cuentas nuevas) o, para cuentas
 * antiguas, la derivación determinista `t-<sha256(publicKey)[0..12]>.testnet`.
 */

export const NEAR_NETWORK_ID = 'testnet';
export const NEAR_RPC_URL = 'https://rpc.testnet.fastnear.com';

/**
 * Auth0 compartido de FastAuth testnet (solo acepta localhost:3000).
 *
 * `PUBLIC_AUTH0_CLIENT_ID` permite usar un cliente propio más adelante; en dev
 * el prefijo `PUBLIC_` lo expone SvelteKit/Vite. El fallback es el cliente
 * compartido de testnet.
 */
const PUBLIC_ENV = import.meta.env as Record<string, string | undefined>;

export const AUTH0_CLIENT_ID =
	PUBLIC_ENV.PUBLIC_AUTH0_CLIENT_ID || 'np8paqIpMWmNbzT4xAvOOapZBjsOpptl';
export const AUTH0_DOMAIN = PUBLIC_ENV.PUBLIC_AUTH0_DOMAIN || 'login.testnet.fast-auth.com';

export const FAST_AUTH_CONTRACT_ID = 'fast-auth.testnet';
export const MPC_CONTRACT_ID = 'v1.signer-prod.testnet';

/**
 * Cuenta: `t-<handle>.testnet`.
 *
 * Las cuentas nuevas usan un handle automático `t-nearbox-<10 hex>.testnet`
 * derivado de la public key, porque NEAR no permite renombrar cuentas y así el
 * jugador no tiene que elegir nada. Las cuentas antiguas `t-<12 hex>.testnet`
 * siguen siendo válidas y se adoptan sin pedir handle.
 */
export const ACCOUNT_PREFIX = 't-';
export const ACCOUNT_SUFFIX = `.${NEAR_NETWORK_ID}`;
export const ACCOUNT_HASH_HEX_LENGTH = 12;
/** Handle automático de las cuentas nuevas: `nearbox-` + 10 hex de la pubkey. */
export const AUTO_HANDLE_PREFIX = 'nearbox-';
export const AUTO_HANDLE_ID_LENGTH = 10;

export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 20;
/** localStorage por publicKey: el handle elegido para esa identidad. */
export const HANDLE_STORAGE_PREFIX = 'fastauth:handle:';

/** Endpoints del mini-relayer, proxeados por Vite al backend Elysia. */
export const RELAYER_CREATE_ACCOUNT_URL = '/api/relayer/create-account';
export const RELAYER_ENSURE_ACCOUNT_URL = '/api/relayer/ensure-account';
export const RELAYER_FUND_URL = '/api/relayer/fund-account';
export const RELAYER_SIGN_TX_URL = '/api/relayer/sign-tx';
export const RELAYER_SPONSOR_MINT_URL = '/api/relayer/sponsor-mint';
export const RELAYER_STATUS_URL = '/api/relayer/status';

/**
 * NEP-245 + marketplace. Si faltan, la pestaña Market muestra
 * "Market is not configured" y no llama a contratos vacíos.
 */
export const NFT_CONTRACT_ID = PUBLIC_ENV.PUBLIC_NFT_CONTRACT_ID || '';
export const MARKET_CONTRACT_ID = PUBLIC_ENV.PUBLIC_MARKET_CONTRACT_ID || '';

export function isNftConfigured(): boolean {
	return NFT_CONTRACT_ID.length > 0 && MARKET_CONTRACT_ID.length > 0;
}

/** Auth0 audience del scope de firma de transacciones (FastAuth). */
export const AUTH0_SIGNING_AUDIENCE = 'auth0.jwt.fast-auth.testnet';
export const FAST_AUTH_GUARD_ID = 'jwt#https://login.testnet.fast-auth.com/';

/** Gas/depósitos de las escrituras del juego. */
export const SIGN_GAS = 300_000_000_000_000n;
export const SIGN_DEPOSIT_YOCTO = 1n;
export const MINT_GAS = 100_000_000_000_000n;
export const MINT_DEPOSIT_YOCTO = 10_000_000_000_000_000_000_000n; // 0.01 NEAR
export const MIN_MINT_BALANCE_YOCTO = 15_000_000_000_000_000_000_000n; // 0.015 NEAR
export const LIST_GAS = 150_000_000_000_000n;
export const LIST_DEPOSIT_YOCTO = 1n;
export const MARKET_CALL_GAS = 100_000_000_000_000n;
/** Compatibilidad con `callMethod` (gas por defecto). */
export const DEFAULT_GAS = 100_000_000_000_000n;
