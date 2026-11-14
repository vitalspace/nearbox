/**
 * Verificación server-side de JWT de Auth0 (FastAuth testnet).
 *
 * El mint patrocinado no puede confiar en el `sub` que manda el cliente: el
 * backend valida la firma con el JWKS de Auth0, el `iss` y el `aud` antes de
 * gastar NEAR del relayer.
 *
 * Las claves se cachean en memoria (10 min) y se refrescan si aparece un `kid`
 * desconocido (rotación). No se loguea el token completo.
 */

const AUTH0_ISSUER =
  process.env.AUTH0_ISSUER || "https://login.testnet.fast-auth.com/";
const AUTH0_JWKS_URI =
  process.env.AUTH0_JWKS_URI ||
  "https://login.testnet.fast-auth.com/.well-known/jwks.json";
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE || "auth0.jwt.fast-auth.testnet";

/**
 * El frontend no puede pedir el audience de firma en silencio (Auth0 exige un
 * payload de transacción), así que el mint patrocinado y el sync de
 * estadísticas se autentican con el **ID token** de Auth0: mismo `iss` y firma,
 * `aud` = clientId. Solo se usa su `sub`; la autorización real del mint sale de
 * la publicKey on-chain del jugador.
 */
const AUTH0_CLIENT_ID =
  process.env.AUTH0_CLIENT_ID || "np8paqIpMWmNbzT4xAvOOapZBjsOpptl";
const AUTH0_AUDIENCES = [AUTH0_AUDIENCE, AUTH0_CLIENT_ID];

const JWKS_TTL_MS = 10 * 60_000;

type Jwk = {
  kid?: string;
  kty?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
  crv?: string;
  x?: string;
  y?: string;
};

type JwksCache = {
  fetchedAt: number;
  keys: Map<string, Jwk>;
};

export type Auth0Claims = {
  sub: string;
  aud?: string | string[];
  iss?: string;
  exp?: number;
  iat?: number;
  [key: string]: unknown;
};

export class AuthError extends Error {
  readonly status = 401;

  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

let jwks: JwksCache | null = null;

async function fetchJwks(): Promise<JwksCache> {
  let response: Response;

  try {
    response = await fetch(AUTH0_JWKS_URI, {
      headers: { accept: "application/json" },
    });
  } catch (cause) {
    throw new AuthError(
      `Could not reach the Auth0 JWKS endpoint: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
  }

  if (!response.ok) {
    throw new AuthError(`Auth0 JWKS responded with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as { keys?: Jwk[] };
  const keys = new Map<string, Jwk>();

  for (const key of payload.keys ?? []) {
    if (key.kid) keys.set(key.kid, key);
  }

  if (keys.size === 0) {
    throw new AuthError("Auth0 JWKS returned no keys");
  }

  jwks = { fetchedAt: Date.now(), keys };
  return jwks;
}

async function getJwk(kid: string): Promise<Jwk> {
  const fresh =
    jwks && Date.now() - jwks.fetchedAt < JWKS_TTL_MS ? jwks : await fetchJwks();
  const key = fresh.keys.get(kid);

  if (key) return key;

  // Rotación de claves: refrescamos una vez antes de rechazar.
  const refreshed = await fetchJwks();
  const retry = refreshed.keys.get(kid);

  if (!retry) {
    throw new AuthError("The Auth0 token was signed with an unknown key");
  }

  return retry;
}

function decodeBase64Url(segment: string): Uint8Array {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function decodeJson<T>(segment: string): T {
  try {
    return JSON.parse(new TextDecoder().decode(decodeBase64Url(segment))) as T;
  } catch {
    throw new AuthError("The Auth0 token is malformed");
  }
}

async function importKey(jwk: Jwk, alg: string): Promise<CryptoKey> {
  if (alg === "RS256" || alg === "PS256") {
    return await crypto.subtle.importKey(
      "jwk",
      {
        kty: "RSA",
        n: jwk.n,
        e: jwk.e,
        alg: alg === "PS256" ? "PS256" : "RS256",
        ext: true,
      },
      { name: alg === "PS256" ? "RSA-PSS" : "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  }

  if (alg === "ES256") {
    return await crypto.subtle.importKey(
      "jwk",
      { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, ext: true },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
  }

  throw new AuthError(`Unsupported Auth0 signing algorithm: ${alg}`);
}

export async function verifyAuth0Jwt(token: string): Promise<Auth0Claims> {
  const parts = token.split(".");

  if (parts.length !== 3) {
    throw new AuthError("The Auth0 token is malformed");
  }

  const header = decodeJson<{ alg?: string; kid?: string; typ?: string }>(parts[0]);

  if (!header.alg || !header.kid) {
    throw new AuthError("The Auth0 token header is missing alg or kid");
  }

  const jwk = await getJwk(header.kid);
  const key = await importKey(jwk, header.alg);
  const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = decodeBase64Url(parts[2]);

  const verified = await crypto.subtle.verify(
    header.alg === "ES256"
      ? { name: "ECDSA", hash: "SHA-256" }
      : header.alg === "PS256"
        ? { name: "RSA-PSS", saltLength: 32 }
        : { name: "RSASSA-PKCS1-v1_5" },
    key,
    signature as unknown as BufferSource,
    signingInput as unknown as BufferSource,
  );

  if (!verified) {
    throw new AuthError("The Auth0 token signature is invalid");
  }

  const claims = decodeJson<Auth0Claims>(parts[1]);

  if (claims.iss !== AUTH0_ISSUER) {
    throw new AuthError("The Auth0 token issuer is invalid");
  }

  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (
    !audience.some(
      (value): value is string =>
        typeof value === "string" && AUTH0_AUDIENCES.includes(value),
    )
  ) {
    throw new AuthError("The Auth0 token audience is invalid");
  }

  if (typeof claims.exp !== "number" || claims.exp * 1000 <= Date.now()) {
    throw new AuthError("The Auth0 token has expired");
  }

  if (typeof claims.sub !== "string" || claims.sub.length === 0) {
    throw new AuthError("The Auth0 token has no subject");
  }

  return claims;
}
