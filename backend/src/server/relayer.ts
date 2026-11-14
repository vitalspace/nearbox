/**
 * Mini-relayer server-side: cuentas NEAR, faucet, firma MPC y mint patrocinado.
 *
 * - `ensure-account`: crea la cuenta `t-*.testnet` con la public key MPC del
 *   jugador y la fondea con `NEW_ACCOUNT_FUNDING_NEAR`.
 * - `fund-account`: faucet acotada para autopago de mints.
 * - `sign-tx`: llama `sign` en `fast-auth.testnet` y extrae la firma del
 *   `SuccessValue` del último receipt válido.
 * - `sponsor-mint`: el relayer paga gas + depósito y llama
 *   `mint(owner_id = jugador, catalog_id)`.
 *
 * El broadcast usa JSON-RPC directo: hay dos copias de `@near-js/transactions`
 * en el árbol de dependencias y `provider.sendTransaction` falla por
 * `instanceof`.
 */
import { createHash } from "node:crypto";
import { Account, connect, keyStores, KeyPair, utils } from "near-api-js";
import type { KeyPairString } from "near-api-js/lib/utils/key_pair";
import {
  Transaction,
  encodeTransaction,
  functionCall,
  transfer,
} from "near-api-js/lib/transaction";
import type { Action, SignedTransaction } from "near-api-js/lib/transaction";
import type { FinalExecutionOutcome } from "near-api-js/lib/providers/provider";
import { verifyAuth0Jwt } from "./auth0";
import { errorMessage } from "./errors";
import { isRewardCatalog, isRewardOnlyCatalog } from "../progression/catalog";

const NETWORK_ID = process.env.NEAR_NETWORK_ID || "testnet";
const RPC_URL = process.env.NEAR_RPC_URL || "https://rpc.testnet.fastnear.com";
const ROOT_ACCOUNT_ID = NETWORK_ID;
const CREATE_ACCOUNT_GAS = 300_000_000_000_000n;
const SIGN_GAS = 300_000_000_000_000n;
const SIGN_DEPOSIT_YOCTO = 1n;
const MINT_GAS = 100_000_000_000_000n;

function envNear(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

function nearToYocto(value: string): bigint {
  return BigInt(utils.format.parseNearAmount(value) ?? "0");
}

const NFT_CONTRACT_ID = process.env.NFT_CONTRACT_ID || "";
const MARKET_CONTRACT_ID = process.env.MARKET_CONTRACT_ID || "";
const FAST_AUTH_CONTRACT_ID =
  process.env.FAST_AUTH_CONTRACT_ID || "fast-auth.testnet";
const FAST_AUTH_GUARD_ID =
  process.env.FAST_AUTH_GUARD_ID ||
  "jwt#https://login.testnet.fast-auth.com/";

const NEW_ACCOUNT_FUNDING_YOCTO = nearToYocto(
  envNear("NEW_ACCOUNT_FUNDING_NEAR", "0.05"),
);
const FAUCET_AMOUNT_YOCTO = nearToYocto(envNear("FAUCET_AMOUNT_NEAR", "0.05"));
const FAUCET_MIN_BALANCE_YOCTO = nearToYocto(
  envNear("FAUCET_MIN_BALANCE_NEAR", "0.03"),
);
const FAUCET_DAILY_BUDGET_YOCTO = nearToYocto(
  envNear("FAUCET_DAILY_BUDGET_NEAR", "0.5"),
);
const RELAYER_RESERVE_YOCTO = nearToYocto(
  envNear("RELAYER_RESERVE_NEAR", "0.5"),
);
const SPONSORED_MINT_BUDGET_YOCTO = nearToYocto(
  envNear("SPONSORED_MINT_BUDGET_NEAR", "1"),
);
const MINT_DEPOSIT_YOCTO = BigInt(
  process.env.MINT_DEPOSIT_YOCTO || "10000000000000000000000",
);
/** Coste medio medido de un mint (storage + gas), para el prechequeo. */
const SPONSORED_MINT_ESTIMATE_YOCTO = BigInt(
  process.env.SPONSORED_MINT_ESTIMATE_YOCTO || "6000000000000000000000",
);

/**
 * Presupuesto separado de las recompensas (SPEC-045 §11.4). No compite con el
 * presupuesto de la tienda: agotar mints patrocinados no bloquea un logro.
 */
const REWARD_MINT_BUDGET_YOCTO = nearToYocto(
  envNear("REWARD_MINT_BUDGET_NEAR", "3"),
);
const REWARD_MINT_ESTIMATE_YOCTO = BigInt(
  process.env.REWARD_MINT_ESTIMATE_YOCTO || "6000000000000000000000",
);
const REWARD_DAILY_MINT_LIMIT = Math.max(
  1,
  Math.floor(Number(process.env.REWARD_DAILY_MINT_LIMIT || "60")) || 60,
);

const SPONSOR_TTL_MS = 24 * 60 * 60_000;
const ACCOUNT_COOLDOWN_MS = 24 * 60 * 60_000;

export type RelayerContext = {
  accountId: string;
  near: Awaited<ReturnType<typeof connect>>;
};

export type CreateAccountRequest = { accountId: string; publicKey: string };
export type CreateAccountResult = {
  hash: string | null;
  alreadyExists: boolean;
  funded: boolean;
};

export type EnsureAccountResult = {
  accountId: string;
  created: boolean;
  funded: boolean;
};

export type SponsorMintResult = {
  tokenId: string;
  serial: number;
  sponsored: true;
  budgetRemainingYocto: string;
};

export type RelayerStatus = {
  sponsoredMintAvailable: boolean;
  reason: "ok" | "budget" | "reserve" | "disabled" | "error";
  budgetRemainingYocto: string;
  mintDepositYocto: string;
  /** Presupuesto separado de recompensas (SPEC-045). */
  rewardMintAvailable: boolean;
  rewardReason: "ok" | "budget" | "reserve" | "disabled" | "error";
  rewardBudgetRemainingYocto: string;
  rewardDailyRemaining: number;
  rewardEstimateYocto: string;
};

export type RewardMintStatus = {
  rewardMintAvailable: boolean;
  reason: "ok" | "budget" | "reserve" | "disabled" | "error";
  budgetRemainingYocto: string;
  dailyRemaining: number;
  dailyLimit: number;
  estimateYocto: string;
};

export type RewardMintResult = {
  tokenId: string;
  serial: number;
  txHash: string | null;
  budgetRemainingYocto: string;
  dailyRemaining: number;
};

let relayer: Promise<RelayerContext> | null = null;

function jsonRpcError(message: string): Error {
  return new Error(message);
}

async function jsonRpc<T>(
  method: string,
  params: Record<string, unknown>,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "runworld-relayer",
        method,
        params,
      }),
    });
  } catch (cause) {
    throw jsonRpcError(
      `Could not connect to the NEAR RPC (${RPC_URL}): ${errorMessage(cause)}`,
    );
  }

  if (!response.ok) {
    throw jsonRpcError(`The NEAR RPC responded with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    result?: T;
    error?: { message?: string; cause?: { name?: string }; data?: unknown };
  };

  if (payload.error) {
    const detail = payload.error.data
      ? ` — ${JSON.stringify(payload.error.data).slice(0, 500)}`
      : "";
    throw jsonRpcError(
      `${payload.error.message ?? payload.error.cause?.name ?? "RPC error"}${detail}`,
    );
  }

  if (payload.result === undefined) {
    throw jsonRpcError("The NEAR RPC returned an empty response");
  }

  return payload.result;
}

function isUnknownAccount(error: unknown): boolean {
  return /UNKNOWN_ACCOUNT|does not exist while viewing/i.test(
    errorMessage(error),
  );
}

async function accountExists(accountId: string): Promise<boolean> {
  try {
    await jsonRpc("query", {
      request_type: "view_account",
      finality: "final",
      account_id: accountId,
    });
    return true;
  } catch (cause) {
    if (isUnknownAccount(cause)) return false;
    throw cause;
  }
}

async function accountBalanceYocto(accountId: string): Promise<bigint> {
  const result = await jsonRpc<{ amount: string }>("query", {
    request_type: "view_account",
    finality: "final",
    account_id: accountId,
  });

  return BigInt(result.amount);
}

async function accountPublicKeys(accountId: string): Promise<string[]> {
  const result = await jsonRpc<{ keys: Array<{ public_key: string }> }>(
    "query",
    {
      request_type: "view_access_key_list",
      finality: "final",
      account_id: accountId,
    },
  );

  return result.keys.map((entry) => entry.public_key);
}

async function initRelayer(): Promise<RelayerContext> {
  const accountId = process.env.RELAYER_ACCOUNT_ID;
  const privateKey = process.env.RELAYER_PRIVATE_KEY;

  if (!accountId || !privateKey) {
    throw new Error(
      "Missing relayer config: set RELAYER_ACCOUNT_ID and RELAYER_PRIVATE_KEY in backend/.env.",
    );
  }

  const keyStore = new keyStores.InMemoryKeyStore();
  await keyStore.setKey(
    NETWORK_ID,
    accountId,
    KeyPair.fromString(privateKey as KeyPairString),
  );

  const near = await connect({
    networkId: NETWORK_ID,
    nodeUrl: RPC_URL,
    keyStore,
  });
  const account = new Account(near.connection, accountId);

  try {
    await account.state();
  } catch (cause) {
    throw new Error(
      `The relayer account does not exist or its key is invalid: ${errorMessage(cause)}`,
    );
  }

  return { accountId, near };
}

export async function getRelayer(): Promise<RelayerContext> {
  relayer ??= initRelayer();
  return await relayer;
}

/** Una sola access key: serializamos para no chocar nonces entre requests. */
let chain: Promise<unknown> = Promise.resolve();

function serialize<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(job, job);
  chain = run.catch(() => undefined);
  return run;
}

type TransactionSigner = {
  signTransaction(
    receiverId: string,
    actions: Action[],
  ): Promise<[Uint8Array, SignedTransaction]>;
};

function broadcast(
  signedTx: SignedTransaction,
): Promise<FinalExecutionOutcome> {
  return jsonRpc<FinalExecutionOutcome>("send_tx", {
    signed_tx_base64: Buffer.from(encodeTransaction(signedTx)).toString(
      "base64",
    ),
    wait_until: "EXECUTED",
  });
}

async function sendRelayerTx(
  context: RelayerContext,
  receiverId: string,
  actions: Action[],
): Promise<FinalExecutionOutcome> {
  // `Account` cachea la access key y su nonce por instancia; una instancia
  // nueva por tx fuerza a releer el nonce de la cadena.
  const account = new Account(context.near.connection, context.accountId);
  const signer = account as unknown as TransactionSigner;
  const [, signedTx] = await signer.signTransaction(receiverId, actions);
  return await broadcast(signedTx);
}

async function withRelayerAccount<T>(
  job: (context: RelayerContext) => Promise<T>,
): Promise<T> {
  const context = await getRelayer();
  return await serialize(() => job(context));
}

function outcomeFailure(outcome: FinalExecutionOutcome): unknown {
  const status = outcome.status;

  if (!status || typeof status !== "object" || !("Failure" in status)) {
    return null;
  }

  return (status as { Failure?: unknown }).Failure ?? null;
}

function isAccountAlreadyExists(outcome: FinalExecutionOutcome): boolean {
  const failure = outcomeFailure(outcome) as
    | { ActionError?: { kind?: Record<string, unknown> } }
    | null
    | undefined;

  const kind = failure?.ActionError?.kind;
  return Boolean(
    kind && typeof kind === "object" && "AccountAlreadyExists" in kind,
  );
}

function describeFailure(outcome: FinalExecutionOutcome): string {
  const failure = outcomeFailure(outcome);
  return failure ? JSON.stringify(failure).slice(0, 500) : "unknown status";
}

function successValue(outcome: FinalExecutionOutcome): unknown {
  const status = outcome.status as { SuccessValue?: string } | undefined;

  if (!status?.SuccessValue) return null;

  try {
    return JSON.parse(Buffer.from(status.SuccessValue, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Misma derivación que usa la referencia de FastAuth:
 * `t-<sha256(publicKey).slice(0,12)>.testnet`, hasheando el string completo
 * (`ed25519:...`).
 */
export function deriveAccountId(publicKey: string): string {
  const hash = createHash("sha256").update(publicKey).digest("hex");
  return `t-${hash.slice(0, 12)}.testnet`;
}

/** Handle automático del juego (`t-nearbox-<10 hex>.testnet`). */
export function deriveAutoAccountId(publicKey: string): string {
  const hash = createHash("sha256").update(publicKey).digest("hex");
  return `t-nearbox-${hash.slice(0, 10)}.testnet`;
}

/**
 * Cuentas aceptadas: `t-<handle>.testnet` (handle legible o hash de 12 hex).
 * El backend comprueba además que la publicKey esté entre sus access keys.
 */
const ACCOUNT_ID_PATTERN =
  /^t-(?:[0-9a-f]{12}|[a-z0-9](?:[a-z0-9-]{1,18}[a-z0-9])?)\.testnet$/;
const PUBLIC_KEY_PATTERN = /^ed25519:[1-9A-HJ-NP-Za-km-z]{40,60}$/;
const CATALOG_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function statusError(message: string, status: number, code?: string): Error {
  const error = new Error(message) as Error & { status: number; code?: string };
  error.status = status;
  if (code) error.code = code;
  return error;
}

function badRequest(message: string): Error {
  return statusError(message, 400);
}

function forbidden(message: string): Error {
  return statusError(message, 403);
}

function conflict(message: string): Error {
  return statusError(message, 409);
}

function unavailable(message: string): Error {
  return statusError(message, 503);
}

function capacity(message: string): Error {
  return statusError(message, 503, "REWARD_CAPACITY");
}

export function assertCreateAccountInput(body: unknown): CreateAccountRequest {
  if (!body || typeof body !== "object") {
    throw badRequest("invalid body");
  }

  const { accountId, publicKey } = body as Record<string, unknown>;

  if (typeof accountId !== "string" || typeof publicKey !== "string") {
    throw badRequest("missing accountId or publicKey");
  }

  if (!ACCOUNT_ID_PATTERN.test(accountId)) {
    throw badRequest("accountId must match the format t-<handle>.testnet");
  }

  if (!PUBLIC_KEY_PATTERN.test(publicKey)) {
    throw badRequest("publicKey must be ed25519:<base58>");
  }

  return { accountId, publicKey };
}

type SignRequest = {
  payload: number[];
  guardId: string;
  verifyPayload: string;
  algorithm: string;
};

export function assertSignRequest(body: unknown): SignRequest {
  if (!body || typeof body !== "object") {
    throw badRequest("invalid body");
  }

  const input = body as Record<string, unknown>;
  const algorithm =
    typeof input.algorithm === "string" ? input.algorithm : "eddsa";

  if (input.guard_id !== FAST_AUTH_GUARD_ID) {
    throw badRequest("Invalid guard_id");
  }

  if (
    algorithm !== "eddsa" &&
    algorithm !== "ecdsa" &&
    algorithm !== "secp256k1"
  ) {
    throw badRequest("Invalid algorithm");
  }

  if (
    typeof input.verify_payload !== "string" ||
    input.verify_payload.length === 0
  ) {
    throw badRequest("Invalid verify_payload");
  }

  const signPayload = input.sign_payload;
  const valid =
    Array.isArray(signPayload) &&
    signPayload.length > 0 &&
    signPayload.every(
      (value) =>
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= 0 &&
        value <= 255,
    );

  if (!valid) {
    throw badRequest("Invalid sign_payload");
  }

  return {
    payload: signPayload as number[],
    guardId: String(input.guard_id),
    verifyPayload: input.verify_payload,
    algorithm,
  };
}

async function assertRelayerAvailable(): Promise<RelayerContext> {
  const context = await getRelayer().catch((cause) => {
    throw unavailable(
      `The relayer is not configured: ${errorMessage(cause)}`,
    );
  });

  const balance = await accountBalanceYocto(context.accountId);

  if (balance <= RELAYER_RESERVE_YOCTO) {
    throw unavailable("Testnet funds are running low. Try again later.");
  }

  return context;
}

export async function assertOwnedAccount(
  accountId: string,
  publicKey: string,
): Promise<void> {
  if (!(await accountExists(accountId))) {
    throw forbidden("The account does not exist yet");
  }

  const keys = await accountPublicKeys(accountId);

  if (!keys.includes(publicKey)) {
    throw forbidden("That public key does not belong to the account");
  }
}

async function createAccountAndFund(
  accountId: string,
  publicKey: string,
): Promise<{ created: boolean; funded: boolean; hash: string | null }> {
  const context = await assertRelayerAvailable();
  const balance = await accountBalanceYocto(context.accountId);

  if (await accountExists(accountId)) {
    const keys = await accountPublicKeys(accountId);

    if (!keys.includes(publicKey)) {
      throw conflict("That name is already taken. Choose another one.");
    }

    return { created: false, funded: false, hash: null };
  }

  const needsFunding =
    NEW_ACCOUNT_FUNDING_YOCTO > 0n &&
    balance > RELAYER_RESERVE_YOCTO + NEW_ACCOUNT_FUNDING_YOCTO;

  const outcome = await withRelayerAccount(async (relayerContext) => {
    const created = await sendRelayerTx(relayerContext, ROOT_ACCOUNT_ID, [
      functionCall(
        "create_account",
        {
          new_account_id: accountId,
          new_public_key: publicKey,
        },
        CREATE_ACCOUNT_GAS,
        0n,
      ),
    ]);

    if (isAccountAlreadyExists(created)) {
      const keys = await accountPublicKeys(accountId);

      if (!keys.includes(publicKey)) {
        throw conflict("That name is already taken. Choose another one.");
      }

      return { created: false, funded: false, hash: null };
    }

    if (outcomeFailure(created)) {
      throw new Error(`create_account failed: ${describeFailure(created)}`);
    }

    let funded = false;

    if (needsFunding) {
      try {
        await sendRelayerTx(relayerContext, accountId, [
          transfer(NEW_ACCOUNT_FUNDING_YOCTO),
        ]);
        funded = true;
      } catch (cause) {
        // La creación sigue siendo exitosa; la UI ofrece la faucet.
        console.warn(
          "[relayer] account created but funding failed:",
          errorMessage(cause),
        );
      }
    }

    return {
      created: true,
      funded,
      hash: created.transaction_outcome?.id ?? null,
    };
  });

  return outcome;
}

/**
 * Crea la cuenta si no existe y la fondea con `NEW_ACCOUNT_FUNDING_NEAR`.
 * Idempotente: si ya existe con la misma key no vuelve a crear ni a fondear.
 */
export async function ensureAccount(
  input: CreateAccountRequest,
): Promise<EnsureAccountResult> {
  if (await accountExists(input.accountId)) {
    const keys = await accountPublicKeys(input.accountId);

    if (!keys.includes(input.publicKey)) {
      throw conflict("That name is already taken. Choose another one.");
    }

    return { accountId: input.accountId, created: false, funded: false };
  }

  const result = await createAccountAndFund(input.accountId, input.publicKey);
  return {
    accountId: input.accountId,
    created: result.created,
    funded: result.funded,
  };
}

/**
 * Compatibilidad con el endpoint antiguo. Crea y fondea la cuenta.
 */
export async function relayCreateAccount(
  input: CreateAccountRequest,
): Promise<CreateAccountResult> {
  if (await accountExists(input.accountId)) {
    const existingKeys = await accountPublicKeys(input.accountId);

    if (existingKeys.includes(input.publicKey)) {
      return { hash: null, alreadyExists: true, funded: false };
    }

    throw conflict("That name is already taken. Choose another one.");
  }

  const result = await createAccountAndFund(input.accountId, input.publicKey);
  return {
    hash: result.hash,
    alreadyExists: !result.created,
    funded: result.funded,
  };
}

/* ------------------------------------------------------------------ */
/* Faucet                                                              */
/* ------------------------------------------------------------------ */

let faucetDay = "";
let faucetSpentYocto = 0n;
const accountFundedAt = new Map<string, number>();

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function faucetBudgetAvailable(): boolean {
  if (faucetDay !== today()) {
    faucetDay = today();
    faucetSpentYocto = 0n;
  }

  return faucetSpentYocto + FAUCET_AMOUNT_YOCTO <= FAUCET_DAILY_BUDGET_YOCTO;
}

export type FundAccountResult = {
  hash: string | null;
  amountYocto: string;
  alreadyFunded: boolean;
  budgetRemainingYocto: string;
};

export async function relayFundAccount(
  input: CreateAccountRequest,
): Promise<FundAccountResult> {
  const context = await assertRelayerAvailable();

  await assertOwnedAccount(input.accountId, input.publicKey);

  const balance = await accountBalanceYocto(input.accountId);

  if (balance >= FAUCET_MIN_BALANCE_YOCTO) {
    return {
      hash: null,
      amountYocto: "0",
      alreadyFunded: true,
      budgetRemainingYocto: (
        FAUCET_DAILY_BUDGET_YOCTO - faucetSpentYocto
      ).toString(),
    };
  }

  const lastFunding = accountFundedAt.get(input.accountId) ?? 0;
  if (Date.now() - lastFunding < ACCOUNT_COOLDOWN_MS) {
    throw statusError(
      "This wallet already received testnet funds in the last 24 hours.",
      429,
    );
  }

  if (!faucetBudgetAvailable()) {
    throw unavailable("The daily testnet faucet budget is exhausted.");
  }

  const relayerBalance = await accountBalanceYocto(context.accountId);

  if (
    relayerBalance - FAUCET_AMOUNT_YOCTO <= RELAYER_RESERVE_YOCTO
  ) {
    throw unavailable("Testnet funds are running low. Try again later.");
  }

  let hash: string | null = null;

  try {
    const outcome = await withRelayerAccount((relayerContext) =>
      sendRelayerTx(relayerContext, input.accountId, [
        transfer(FAUCET_AMOUNT_YOCTO),
      ]),
    );

    if (outcomeFailure(outcome)) {
      throw new Error(`transfer failed: ${describeFailure(outcome)}`);
    }

    hash = outcome.transaction_outcome?.id ?? null;
  } catch (cause) {
    const status = (cause as Error & { status?: number }).status;
    if (status) throw cause;
    throw new Error(`The faucet transfer failed: ${errorMessage(cause)}`);
  }

  faucetSpentYocto += FAUCET_AMOUNT_YOCTO;
  accountFundedAt.set(input.accountId, Date.now());

  return {
    hash,
    amountYocto: FAUCET_AMOUNT_YOCTO.toString(),
    alreadyFunded: false,
    budgetRemainingYocto: (
      FAUCET_DAILY_BUDGET_YOCTO - faucetSpentYocto
    ).toString(),
  };
}

/* ------------------------------------------------------------------ */
/* Firma MPC                                                           */
/* ------------------------------------------------------------------ */

/**
 * `sign` en NEAR Auth devuelve `Promise` (guard → MPC → callback), así que la
 * firma no está en el `status.SuccessValue` de la transacción sino en el
 * `SuccessValue` del último receipt.
 */
function extractSignature(outcome: FinalExecutionOutcome): string | null {
  const values: string[] = [];
  const pushStatus = (status: unknown) => {
    if (
      status &&
      typeof status === "object" &&
      "SuccessValue" in status &&
      typeof (status as { SuccessValue?: string }).SuccessValue === "string" &&
      (status as { SuccessValue?: string }).SuccessValue
    ) {
      values.push((status as { SuccessValue: string }).SuccessValue);
    }
  };

  pushStatus(outcome.status);
  for (const receipt of outcome.receipts_outcome ?? []) {
    pushStatus(receipt.outcome?.status);
  }

  for (let index = values.length - 1; index >= 0; index -= 1) {
    const raw = values[index];
    let decoded: string;

    try {
      decoded = Buffer.from(raw, "base64").toString("utf8");
    } catch {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(decoded);
    } catch {
      continue;
    }

    if (parsed && typeof parsed === "object") {
      const payload = parsed as Record<string, unknown>;
      const hasEdDsa =
        Array.isArray(payload.signature) && payload.signature.length === 64;
      const hasEcdsa = Boolean(payload.big_r) && Boolean(payload.s);

      if (hasEdDsa || hasEcdsa) return raw;
    }

    if (typeof parsed === "string" && parsed.length >= 32) return parsed;
  }

  return null;
}

export async function relaySignTx(input: SignRequest): Promise<{
  hash: string | null;
  signature: string;
}> {
  if (!NFT_CONTRACT_ID || !MARKET_CONTRACT_ID) {
    throw unavailable(
      "The relayer has no NFT_CONTRACT_ID or MARKET_CONTRACT_ID configured.",
    );
  }

  try {
    const decoded = Transaction.decode(Uint8Array.from(input.payload));
    const receiverId = decoded.receiverId;

    if (receiverId !== NFT_CONTRACT_ID && receiverId !== MARKET_CONTRACT_ID) {
      throw forbidden(
        `Transactions to ${receiverId} are not allowed by this relayer`,
      );
    }
  } catch (cause) {
    const status = (cause as Error & { status?: number }).status;
    if (status) throw cause;
    throw badRequest("sign_payload is not a valid NEAR transaction");
  }

  return await withRelayerAccount(async (context) => {
    const outcome = await sendRelayerTx(context, FAST_AUTH_CONTRACT_ID, [
      functionCall(
        "sign",
        {
          guard_id: input.guardId,
          sign_payload: input.payload,
          verify_payload: input.verifyPayload,
          algorithm: input.algorithm,
        },
        SIGN_GAS,
        SIGN_DEPOSIT_YOCTO,
      ),
    ]);
    const hash = outcome.transaction_outcome?.id ?? null;
    const signature = extractSignature(outcome);

    if (!signature) {
      const logs = (outcome.receipts_outcome ?? []).flatMap(
        (receipt) => receipt.outcome?.logs ?? [],
      );
      const rejected = logs.some((log) => /reject/i.test(log));
      throw new Error(
        rejected
          ? "NEAR Auth rejected the Google token (the session may have expired)."
          : "NEAR Auth did not return the MPC signature.",
      );
    }

    return { hash, signature };
  });
}

/* ------------------------------------------------------------------ */
/* Mint patrocinado                                                    */
/* ------------------------------------------------------------------ */

let sponsoredSpentYocto = 0n;

/* ------------------------------------------------------------------ */
/* Recompensas (SPEC-045)                                              */
/* ------------------------------------------------------------------ */

let rewardDay = "";
let rewardDailyCount = 0;
let rewardSpentYocto = 0n;

function resetRewardDay(): void {
  const day = today();

  if (rewardDay === day) return;

  rewardDay = day;
  rewardDailyCount = 0;
}

function rewardBudgetRemaining(): bigint {
  const remaining = REWARD_MINT_BUDGET_YOCTO - rewardSpentYocto;
  return remaining > 0n ? remaining : 0n;
}

function rewardDailyRemaining(): number {
  resetRewardDay();
  return Math.max(0, REWARD_DAILY_MINT_LIMIT - rewardDailyCount);
}

export async function rewardMintStatus(): Promise<RewardMintStatus> {
  const dailyRemaining = rewardDailyRemaining();
  const budgetRemaining = rewardBudgetRemaining();
  const base = {
    budgetRemainingYocto: budgetRemaining.toString(),
    dailyRemaining,
    dailyLimit: REWARD_DAILY_MINT_LIMIT,
    estimateYocto: REWARD_MINT_ESTIMATE_YOCTO.toString(),
  };

  if (!process.env.RELAYER_ACCOUNT_ID || !process.env.RELAYER_PRIVATE_KEY) {
    return { ...base, rewardMintAvailable: false, reason: "disabled" };
  }

  if (
    dailyRemaining <= 0 ||
    budgetRemaining < REWARD_MINT_ESTIMATE_YOCTO
  ) {
    return { ...base, rewardMintAvailable: false, reason: "budget" };
  }

  const balance = await relayerBalanceSafe();

  if (balance === null) {
    return { ...base, rewardMintAvailable: false, reason: "error" };
  }

  if (balance < RELAYER_RESERVE_YOCTO + REWARD_MINT_ESTIMATE_YOCTO) {
    return { ...base, rewardMintAvailable: false, reason: "reserve" };
  }

  return { ...base, rewardMintAvailable: true, reason: "ok" };
}

async function rewardReason(): Promise<RewardMintStatus["reason"]> {
  return (await rewardMintStatus()).reason;
}

type RewardRequestEntry = {
  bodyKey: string;
  expiresAt: number;
  result?: RewardMintResult;
  promise?: Promise<RewardMintResult>;
};

const rewardRequests = new Map<string, RewardRequestEntry>();

function cleanupRewardRequests(): void {
  const now = Date.now();

  for (const [key, entry] of rewardRequests) {
    if (entry.expiresAt <= now) rewardRequests.delete(key);
  }
}

/**
 * Mintea una recompensa de progresión. El llamador (`/rewards/claim`) ya
 * verificó la cuenta, el JWT y los requisitos; aquí solo se controla el
 * presupuesto, el tope diario y la idempotencia del `request_id`.
 */
export async function rewardMint(input: {
  accountId: string;
  catalogId: string;
  requestId: string;
}): Promise<RewardMintResult> {
  cleanupRewardRequests();

  if (!isRewardCatalog(input.catalogId)) {
    throw badRequest("catalogId is not a progression reward");
  }

  const bodyKey = `${input.accountId}|${input.catalogId}`;
  const existing = rewardRequests.get(input.requestId);

  if (existing) {
    if (existing.bodyKey !== bodyKey) {
      throw conflict("request_id was already used with a different request");
    }

    if (existing.result) return existing.result;
    if (existing.promise) return await existing.promise;
  }

  const entry: RewardRequestEntry = {
    bodyKey,
    expiresAt: Date.now() + SPONSOR_TTL_MS,
  };
  rewardRequests.set(input.requestId, entry);

  const run = (async (): Promise<RewardMintResult> => {
    resetRewardDay();

    if (!NFT_CONTRACT_ID) {
      throw unavailable("The relayer has no NFT_CONTRACT_ID configured.");
    }

    if (rewardDailyRemaining() <= 0) {
      throw capacity(
        "The daily reward mint limit is reached. Your claim is saved.",
      );
    }

    if (rewardBudgetRemaining() < REWARD_MINT_ESTIMATE_YOCTO) {
      throw capacity("The reward mint budget is exhausted. Your claim is saved.");
    }

    const context = await assertRelayerAvailable();
    const balanceBefore = await accountBalanceYocto(context.accountId);

    if (
      balanceBefore <
      RELAYER_RESERVE_YOCTO + REWARD_MINT_ESTIMATE_YOCTO
    ) {
      throw capacity("Testnet funds are running low. Your claim is saved.");
    }

    const outcome = await withRelayerAccount((relayerContext) =>
      sendRelayerTx(relayerContext, NFT_CONTRACT_ID, [
        functionCall(
          "mint",
          {
            owner_id: input.accountId,
            catalog_id: input.catalogId,
          },
          MINT_GAS,
          MINT_DEPOSIT_YOCTO,
        ),
      ]),
    );

    if (outcomeFailure(outcome)) {
      throw new Error(`reward mint failed: ${describeFailure(outcome)}`);
    }

    const tokenId = successValue(outcome);

    if (typeof tokenId !== "string" || !tokenId.includes("#")) {
      throw new Error("The NFT contract did not return a token id");
    }

    const serial = Number(tokenId.split("#").pop());

    const balanceAfter = await accountBalanceYocto(context.accountId);
    const spent =
      balanceBefore > balanceAfter ? balanceBefore - balanceAfter : 0n;

    rewardSpentYocto += spent;
    rewardDailyCount += 1;

    const result: RewardMintResult = {
      tokenId,
      serial: Number.isFinite(serial) ? serial : 0,
      txHash: outcome.transaction_outcome?.id ?? null,
      budgetRemainingYocto: rewardBudgetRemaining().toString(),
      dailyRemaining: rewardDailyRemaining(),
    };

    entry.result = result;
    entry.promise = undefined;
    entry.expiresAt = Date.now() + SPONSOR_TTL_MS;

    return result;
  })();

  entry.promise = run;

  try {
    return await run;
  } catch (cause) {
    // Un fallo de capacidad se puede reintentar con el mismo request_id.
    rewardRequests.delete(input.requestId);
    throw cause;
  }
}

type SponsorEntry = {
  bodyKey: string;
  expiresAt: number;
  result?: SponsorMintResult;
  promise?: Promise<SponsorMintResult>;
};

const sponsorRequests = new Map<string, SponsorEntry>();

function cleanupSponsorRequests(): void {
  const now = Date.now();

  for (const [key, entry] of sponsorRequests) {
    if (entry.expiresAt <= now) sponsorRequests.delete(key);
  }
}

function sponsorBudgetRemaining(): bigint {
  const remaining = SPONSORED_MINT_BUDGET_YOCTO - sponsoredSpentYocto;
  return remaining > 0n ? remaining : 0n;
}

async function relayerBalanceSafe(): Promise<bigint | null> {
  try {
    const context = await getRelayer();
    return await accountBalanceYocto(context.accountId);
  } catch {
    return null;
  }
}

export async function getRelayerStatus(): Promise<RelayerStatus> {
  const budgetRemaining = sponsorBudgetRemaining();
  const reward = await rewardMintStatus();
  const base = {
    budgetRemainingYocto: budgetRemaining.toString(),
    mintDepositYocto: MINT_DEPOSIT_YOCTO.toString(),
    rewardMintAvailable: reward.rewardMintAvailable,
    rewardReason: reward.reason,
    rewardBudgetRemainingYocto: reward.budgetRemainingYocto,
    rewardDailyRemaining: reward.dailyRemaining,
    rewardEstimateYocto: reward.estimateYocto,
  };

  if (!process.env.RELAYER_ACCOUNT_ID || !process.env.RELAYER_PRIVATE_KEY) {
    return { ...base, sponsoredMintAvailable: false, reason: "disabled" };
  }

  if (budgetRemaining < SPONSORED_MINT_ESTIMATE_YOCTO) {
    return { ...base, sponsoredMintAvailable: false, reason: "budget" };
  }

  const balance = await relayerBalanceSafe();

  if (balance === null) {
    return { ...base, sponsoredMintAvailable: false, reason: "error" };
  }

  if (
    balance < RELAYER_RESERVE_YOCTO + SPONSORED_MINT_ESTIMATE_YOCTO
  ) {
    return { ...base, sponsoredMintAvailable: false, reason: "reserve" };
  }

  return { ...base, sponsoredMintAvailable: true, reason: "ok" };
}

export type SponsorMintInput = {
  accountId: string;
  publicKey: string;
  catalogId: string;
  token: string;
  requestId: string;
  subject: string;
  requestIp: string;
};

export function assertSponsorMintInput(body: unknown): {
  accountId: string;
  publicKey: string;
  catalogId: string;
  token: string;
  requestId: string;
} {
  const input = assertCreateAccountInput(body) as CreateAccountRequest & {
    catalogId?: unknown;
    token?: unknown;
    request_id?: unknown;
  };
  const raw = body as Record<string, unknown>;
  const catalogId = raw.catalogId;
  const token = raw.token;
  const requestId = raw.request_id;

  if (
    typeof catalogId !== "string" ||
    !CATALOG_ID_PATTERN.test(catalogId)
  ) {
    throw badRequest("catalogId is invalid");
  }

  if (typeof token !== "string" || token.length === 0) {
    throw badRequest("token is required");
  }

  if (typeof requestId !== "string" || !UUID_PATTERN.test(requestId)) {
    throw badRequest("request_id must be a UUID");
  }

  return {
    accountId: input.accountId,
    publicKey: input.publicKey,
    catalogId,
    token,
    requestId,
  };
}

export async function sponsorMint(
  input: SponsorMintInput,
): Promise<SponsorMintResult> {
  if (isRewardOnlyCatalog(input.catalogId)) {
    throw forbidden(
      "Reward catalogs can only be minted through /rewards/claim",
    );
  }

  cleanupSponsorRequests();

  const bodyKey = `${input.accountId}|${input.publicKey}|${input.catalogId}|${input.subject}`;
  const existing = sponsorRequests.get(input.requestId);

  if (existing) {
    if (existing.bodyKey !== bodyKey) {
      throw conflict("request_id was already used with a different request");
    }

    if (existing.result) return existing.result;
    if (existing.promise) return await existing.promise;
  }

  // Reservamos el `request_id` antes del primer await: dos requests idénticos
  // que llegan juntos comparten la misma promesa y producen un solo mint.
  const entry: SponsorEntry = {
    bodyKey,
    expiresAt: Date.now() + SPONSOR_TTL_MS,
  };
  sponsorRequests.set(input.requestId, entry);

  const run = (async (): Promise<SponsorMintResult> => {
    const claims = await verifyAuth0Jwt(input.token).catch((cause) => {
      const status = (cause as Error & { status?: number }).status;
      throw status === 401
        ? statusError(errorMessage(cause), 401)
        : cause;
    });

    if (claims.sub !== input.subject && input.subject) {
      throw statusError("The Auth0 token does not match the request", 401);
    }

    // La cuenta debe existir y contener la clave del jugador. Si todavía no
    // existe, solo se crea una cuenta derivada de la publicKey: la cuenta
    // determinista de FastAuth o el handle automático del juego. Los handles
    // ya existentes se aceptan validando la access key.
    const derivedIds = new Set([
      deriveAccountId(input.publicKey),
      deriveAutoAccountId(input.publicKey),
    ]);

    if (!(await accountExists(input.accountId))) {
      if (!derivedIds.has(input.accountId)) {
        throw forbidden("accountId is not derived from publicKey");
      }

      await ensureAccount({
        accountId: input.accountId,
        publicKey: input.publicKey,
      });
    } else {
      await assertOwnedAccount(input.accountId, input.publicKey);
    }

    const budgetRemaining = sponsorBudgetRemaining();

    if (budgetRemaining < SPONSORED_MINT_ESTIMATE_YOCTO) {
      throw unavailable("The sponsored mint budget is exhausted.");
    }

    const context = await assertRelayerAvailable();
    const balanceBefore = await accountBalanceYocto(context.accountId);

    if (
      balanceBefore <
      RELAYER_RESERVE_YOCTO + SPONSORED_MINT_ESTIMATE_YOCTO
    ) {
      throw unavailable("Testnet funds are running low. Try again later.");
    }

    const outcome = await withRelayerAccount((relayerContext) =>
      sendRelayerTx(relayerContext, NFT_CONTRACT_ID, [
        functionCall(
          "mint",
          {
            owner_id: input.accountId,
            catalog_id: input.catalogId,
          },
          MINT_GAS,
          MINT_DEPOSIT_YOCTO,
        ),
      ]),
    );

    if (outcomeFailure(outcome)) {
      throw new Error(`mint failed: ${describeFailure(outcome)}`);
    }

    const tokenId = successValue(outcome);

    if (typeof tokenId !== "string" || !tokenId.includes("#")) {
      throw new Error("The NFT contract did not return a token id");
    }

    const serial = Number(tokenId.split("#").pop());

    const balanceAfter = await accountBalanceYocto(context.accountId);
    const spent =
      balanceBefore > balanceAfter ? balanceBefore - balanceAfter : 0n;
    sponsoredSpentYocto += spent;

    const result: SponsorMintResult = {
      tokenId,
      serial: Number.isFinite(serial) ? serial : 0,
      sponsored: true,
      budgetRemainingYocto: sponsorBudgetRemaining().toString(),
    };

    entry.result = result;
    entry.promise = undefined;
    entry.expiresAt = Date.now() + SPONSOR_TTL_MS;

    return result;
  })();

  entry.promise = run;

  try {
    return await run;
  } catch (cause) {
    // Permitir reintentar el mismo request_id tras un fallo del RPC/contrato.
    sponsorRequests.delete(input.requestId);
    throw cause;
  }
}
