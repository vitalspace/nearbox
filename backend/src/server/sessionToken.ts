/**
 * Verificación de identidad para todos los endpoints autenticados.
 *
 * Hay dos formas de probar quién juega:
 *  - JWT de Auth0 (FastAuth / Google), `sub` = `auth0|…`;
 *  - token de sesión de wallet (`wbs1.…`), `sub` = `wallet:<accountId>`.
 *
 * Los endpoints de stats, progresión y recompensas solo necesitan un `sub`
 * estable, así que aceptan ambas. Así el modo wallet tiene exactamente el
 * mismo progreso, mercado y reclamo de NFTs que el modo Google.
 */
import { verifyAuth0Jwt, type Auth0Claims } from "./auth0";
import { isWalletToken, verifyWalletToken, type WalletSession } from "./wallet";

export type SessionClaims = Auth0Claims & {
  /** Presente solo en sesiones de wallet: cuenta que firmó el NEP-413. */
  walletAccountId?: string;
  walletPublicKey?: string;
};

export function isWalletSessionToken(token: string): boolean {
  return isWalletToken(token);
}

/** Verifica un token de wallet, o lanza `WalletAuthError`. */
export function readWalletSession(token: string): WalletSession {
  return verifyWalletToken(token);
}

/** Acepta JWT de Auth0 o token de wallet. */
export async function verifySessionToken(token: string): Promise<SessionClaims> {
  if (isWalletToken(token)) {
    const session = verifyWalletToken(token);

    return {
      sub: session.sub,
      walletAccountId: session.accountId,
      walletPublicKey: session.publicKey,
      exp: Math.floor(session.expiresAt / 1000),
    };
  }

  return await verifyAuth0Jwt(token);
}
