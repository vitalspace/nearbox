/**
 * Sesión de wallet NEAR para NearBox (SPEC-047).
 *
 * El jugador que entra con su propia wallet (Meteor) no tiene una clave MPC
 * que el backend pueda comprobar contra un JWT de Auth0. La prueba de identidad
 * es una firma NEP-413 (`signMessage`) sobre un mensaje con timestamp: si la
 * firma valida y la `publicKey` es una access key real de la cuenta, el backend
 * emite un token propio de sesión.
 *
 * El token resultante (`wbs1.<payload>.<hmac>`) se acepta en los mismos
 * endpoints que el JWT de Auth0 (`verifySessionToken`), así la progresión, las
 * estadísticas y el reclamo de recompensas funcionan igual en ambos modos. El
 * `sub` es `wallet:<accountId>`, estable para Mongo.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { utils } from "near-api-js";
import { errorMessage } from "./errors";

const RPC_URL = process.env.NEAR_RPC_URL || "https://rpc.testnet.fastnear.com";
const NETWORK_ID = process.env.NEAR_NETWORK_ID || "testnet";

/** Dominio de la firma: evita reutilizar la prueba en otra web. */
const RECIPIENT = process.env.WALLET_AUTH_RECIPIENT || "nearbox.lol";

/** El mensaje firmado empieza por este texto y termina con un ISO timestamp. */
export const WALLET_MESSAGE_PREFIX = "NearBox sign-in\n";

const SESSION_TTL_MS = 7 * 24 * 60 * 60_000;
const CLOCK_SKEW_MS = 5 * 60_000;
const TOKEN_PREFIX = "wbs1";
const TOKEN_SEPARATOR = ".";
/** Nonces ya usados: una firma capturada no puede canjearse dos veces. */
const seenNonces = new Map<string, number>();

const ACCOUNT_ID_PATTERN =
  /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]\.(?:testnet|near)$/;
const PUBLIC_KEY_PATTERN = /^(?:ed25519|secp256k1):[1-9A-HJ-NP-Za-km-z]{40,70}$/;
const SIGNATURE_PATTERN = /^[A-Za-z0-9+/=_-]{40,120}$/;

export class WalletAuthError extends Error {
  readonly status = 401;
  readonly code = "WALLET_AUTH_FAILED";

  constructor(message: string) {
    super(message);
    this.name = "WalletAuthError";
  }
}

export type WalletSession = {
  /** `wallet:<accountId>`; se usa como `sub` en stats y progresión. */
  sub: string;
  accountId: string;
  publicKey: string;
  /** Instante de expiración, en ms. */
  expiresAt: number;
};

export type WalletSignInInput = {
  accountId: string;
  publicKey: string;
  signature: string;
  message: string;
  /** Nonce NEP-413 en base64 (32 bytes). */
  nonce: string;
  recipient?: string;
  callbackUrl?: string;
};

/* ------------------------------------------------------------------ */
/* NEP-413                                                             */
/* ------------------------------------------------------------------ */

function u32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0, 0);
  return buffer;
}

function borshString(value: string): Buffer {
  const encoded = Buffer.from(value, "utf8");
  return Buffer.concat([u32(encoded.length), encoded]);
}

/**
 * Serializa el payload NEP-413 exactamente como `serializeNep413` de
 * `@near-wallet-selector/core` (Borsh):
 *   tag:u32, message:string, nonce:[u8;32], recipient:string, callbackUrl?:string
 */
export function serializeNep413(input: {
  message: string;
  nonce: Buffer;
  recipient: string;
  callbackUrl?: string;
}): Buffer {
  const parts = [
    u32(2147484061),
    borshString(input.message),
    input.nonce,
    borshString(input.recipient),
  ];

  if (input.callbackUrl) {
    parts.push(Buffer.from([1]), borshString(input.callbackUrl));
  } else {
    parts.push(Buffer.from([0]));
  }

  return Buffer.concat(parts);
}

/** Verifica la firma de `signMessage` (browser) sin salir del proceso. */
export function verifyNep413(input: {
  publicKey: string;
  signature: string;
  message: string;
  nonce: string;
  recipient: string;
  callbackUrl?: string;
}): boolean {
  const nonce = Buffer.from(input.nonce, "base64");
  const signature = Buffer.from(input.signature, "base64");

  if (nonce.length !== 32 || (signature.length !== 64 && signature.length !== 65)) {
    return false;
  }

  const payload = serializeNep413({
    message: input.message,
    nonce,
    recipient: input.recipient,
    callbackUrl: input.callbackUrl,
  });
  const hashed = createHash("sha256").update(payload).digest();

  try {
    return utils.PublicKey.from(input.publicKey).verify(hashed, signature);
  } catch {
    return false;
  }
}

/** El mensaje debe ser nuestro y reciente: firma fresca, no replay antiguo. */
function assertFreshMessage(message: string): void {
  if (!message.startsWith(WALLET_MESSAGE_PREFIX)) {
    throw new WalletAuthError("The signed message is not a NearBox sign-in");
  }

  const stamp = Date.parse(message.slice(WALLET_MESSAGE_PREFIX.length).trim());

  if (!Number.isFinite(stamp)) {
    throw new WalletAuthError("The signed message has no timestamp");
  }

  if (Math.abs(Date.now() - stamp) > CLOCK_SKEW_MS) {
    throw new WalletAuthError("The sign-in message expired. Try again.");
  }
}

function assertNonceUnused(nonce: Buffer): void {
  const key = nonce.toString("hex");
  const now = Date.now();

  for (const [seen, expiresAt] of seenNonces) {
    if (expiresAt <= now) seenNonces.delete(seen);
  }

  if (seenNonces.has(key)) {
    throw new WalletAuthError("That sign-in was already used. Sign again.");
  }

  seenNonces.set(key, now + CLOCK_SKEW_MS * 2);
}

/* ------------------------------------------------------------------ */
/* Access key en cadena                                                */
/* ------------------------------------------------------------------ */

async function rpc<T>(method: string, params: Record<string, unknown>): Promise<T> {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "nearbox-wallet", method, params }),
  });

  if (!response.ok) {
    throw new WalletAuthError(`The NEAR RPC responded with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as { result?: T; error?: { message?: string } };

  if (payload.error || payload.result === undefined) {
    throw new WalletAuthError(payload.error?.message || "The NEAR RPC rejected the query");
  }

  return payload.result;
}

/**
 * La firma prueba que el jugador controla la clave, no que la cuenta exista.
 * Aquí se comprueba además que esa clave está registrada en la cuenta.
 */
export async function assertWalletKeyOnChain(
  accountId: string,
  publicKey: string
): Promise<void> {
  try {
    await rpc("query", {
      request_type: "view_access_key",
      finality: "final",
      account_id: accountId,
      public_key: publicKey,
    });
  } catch (cause) {
    if (/unknown|does not exist|not found/i.test(errorMessage(cause))) {
      throw new WalletAuthError(
        `The account ${accountId} does not exist on ${NETWORK_ID} or the key is not registered`
      );
    }

    throw cause;
  }
}

/* ------------------------------------------------------------------ */
/* Token de sesión                                                     */
/* ------------------------------------------------------------------ */

let cachedSecret: Buffer | null = null;

function secret(): Buffer {
  if (cachedSecret) return cachedSecret;

  const configured = process.env.WALLET_SESSION_SECRET;

  if (configured && configured.length >= 16) {
    cachedSecret = createHash("sha256").update(configured).digest();
    return cachedSecret;
  }

  if (process.env.RELAYER_PRIVATE_KEY) {
    cachedSecret = createHmac("sha256", "nearbox:wallet-session")
      .update(process.env.RELAYER_PRIVATE_KEY)
      .digest();
    return cachedSecret;
  }

  console.warn(
    "[wallet] WALLET_SESSION_SECRET is not set; sessions will expire on restart."
  );
  cachedSecret = randomBytes(32);
  return cachedSecret;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function walletSub(accountId: string): string {
  return `wallet:${accountId}`;
}

/** Emite el token de sesión para una wallet ya verificada. */
export function issueWalletToken(input: {
  accountId: string;
  publicKey: string;
  ttlMs?: number;
}): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + (input.ttlMs ?? SESSION_TTL_MS);
  const payload = Buffer.from(
    JSON.stringify({
      sub: walletSub(input.accountId),
      accountId: input.accountId,
      publicKey: input.publicKey,
      exp: expiresAt,
    }),
    "utf8"
  ).toString("base64url");

  return {
    token: `${TOKEN_PREFIX}${TOKEN_SEPARATOR}${payload}${TOKEN_SEPARATOR}${sign(payload)}`,
    expiresAt,
  };
}

export function isWalletToken(token: string): boolean {
  return token.startsWith(`${TOKEN_PREFIX}${TOKEN_SEPARATOR}`);
}

/** Devuelve la sesión o lanza `WalletAuthError`. */
export function verifyWalletToken(token: string): WalletSession {
  const parts = token.split(TOKEN_SEPARATOR);

  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) {
    throw new WalletAuthError("The wallet session token is malformed");
  }

  const expected = Buffer.from(sign(parts[1]), "utf8");
  const received = Buffer.from(parts[2], "utf8");

  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    throw new WalletAuthError("The wallet session signature is invalid");
  }

  let claims: { sub?: unknown; accountId?: unknown; publicKey?: unknown; exp?: unknown };

  try {
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new WalletAuthError("The wallet session token is malformed");
  }

  if (
    typeof claims.accountId !== "string" ||
    typeof claims.publicKey !== "string" ||
    typeof claims.exp !== "number"
  ) {
    throw new WalletAuthError("The wallet session is incomplete");
  }

  if (claims.exp <= Date.now()) {
    throw new WalletAuthError("The wallet session expired. Sign in again.");
  }

  return {
    sub: walletSub(claims.accountId),
    accountId: claims.accountId,
    publicKey: claims.publicKey,
    expiresAt: claims.exp,
  };
}

/* ------------------------------------------------------------------ */
/* Sign-in                                                             */
/* ------------------------------------------------------------------ */

export type WalletAuthOptions = {
  /** Inyectable en tests para no depender del RPC de testnet. */
  assertKeyOnChain?: (accountId: string, publicKey: string) => Promise<void>;
};

/**
 * Valida una prueba NEP-413 y emite la sesión. Nunca se confía en el
 * `accountId` enviado: la firma y la access key en cadena lo respaldan.
 */
export async function signInWithWallet(
  input: WalletSignInInput,
  options: WalletAuthOptions = {}
): Promise<{
  token: string;
  expiresAt: number;
  accountId: string;
  publicKey: string;
}> {
  const assertKeyOnChain = options.assertKeyOnChain ?? assertWalletKeyOnChain;
  if (
    typeof input.accountId !== "string" ||
    !ACCOUNT_ID_PATTERN.test(input.accountId)
  ) {
    throw new WalletAuthError("accountId must be a full testnet/near account");
  }

  if (
    typeof input.publicKey !== "string" ||
    !PUBLIC_KEY_PATTERN.test(input.publicKey)
  ) {
    throw new WalletAuthError("publicKey must be a NEAR public key");
  }

  if (
    typeof input.signature !== "string" ||
    !SIGNATURE_PATTERN.test(input.signature)
  ) {
    throw new WalletAuthError("signature is missing");
  }

  if (typeof input.nonce !== "string" || input.nonce.length === 0) {
    throw new WalletAuthError("nonce is missing");
  }

  if ((input.recipient || "") !== RECIPIENT) {
    throw new WalletAuthError(`The signed message must target ${RECIPIENT}`);
  }

  assertFreshMessage(input.message);

  const valid = verifyNep413({
    publicKey: input.publicKey,
    signature: input.signature,
    message: input.message,
    nonce: input.nonce,
    recipient: RECIPIENT,
    callbackUrl: input.callbackUrl,
  });

  // Algunas versiones de Meteor firman sin el `callbackUrl` aunque se lo
  // enviemos. Se aceptan ambas variantes: el campo no aporta seguridad (la
  // prueba está en `recipient`, `message` y `nonce`), solo contexto de la web.
  const validWithoutCallback =
    !valid &&
    Boolean(input.callbackUrl) &&
    verifyNep413({
      publicKey: input.publicKey,
      signature: input.signature,
      message: input.message,
      nonce: input.nonce,
      recipient: RECIPIENT,
    });

  if (!valid && !validWithoutCallback) {
    throw new WalletAuthError("The wallet signature is invalid");
  }

  assertNonceUnused(Buffer.from(input.nonce, "base64"));
  await assertKeyOnChain(input.accountId, input.publicKey);

  const issued = issueWalletToken({
    accountId: input.accountId,
    publicKey: input.publicKey,
  });

  return {
    ...issued,
    accountId: input.accountId,
    publicKey: input.publicKey,
  };
}

export const WALLET_AUTH_RECIPIENT = RECIPIENT;
