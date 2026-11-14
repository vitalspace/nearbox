import { Elysia } from "elysia";
import { verifyAuth0Jwt } from "../server/auth0";
import {
  assertCreateAccountInput,
  assertSignRequest,
  assertSponsorMintInput,
  ensureAccount,
  getRelayerStatus,
  relayCreateAccount,
  relayFundAccount,
  relaySignTx,
  sponsorMint,
} from "../server/relayer";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const dailyBuckets = new Map<string, Bucket>();

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");

  if (forwarded) {
    return forwarded.split(",")[0]!.trim();
  }

  return request.headers.get("x-real-ip") ?? "unknown";
}

function allow(
  store: Map<string, Bucket>,
  key: string,
  max: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const current = store.get(key);

  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (current.count >= max) return false;

  current.count += 1;
  return true;
}

// Limpieza oportunista: el mapa no debe crecer sin límite en un servidor vivo.
function cleanup(now: number): void {
  if (buckets.size < 500 && dailyBuckets.size < 500) return;

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }

  for (const [key, bucket] of dailyBuckets) {
    if (bucket.resetAt <= now) dailyBuckets.delete(key);
  }
}

function errorStatus(cause: unknown): number {
  const status = (cause as Error & { status?: number }).status;

  if (status === 400 || status === 401 || status === 403) return status;
  if (status === 409) return 409;
  if (status === 429) return 429;
  if (status === 503) return 503;

  return 502;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export const relayerRoutes = new Elysia({ prefix: "/relayer" })
  .post("/create-account", async ({ body, request, set }) => {
    const ip = clientIp(request);
    cleanup(Date.now());

    if (!allow(buckets, `create:${ip}`, 5, MINUTE)) {
      set.status = 429;
      return { message: "Too many requests. Wait a minute and try again." };
    }

    try {
      const input = assertCreateAccountInput(body);
      const result = await relayCreateAccount(input);

      return {
        hash: result.hash,
        alreadyExists: result.alreadyExists,
        funded: result.funded,
      };
    } catch (cause) {
      const status = errorStatus(cause);
      console.error("[relayer] create-account failed:", errorMessage(cause));
      set.status = status;
      return {
        message: errorMessage(cause) || "Could not create the account",
      };
    }
  })
  .post("/ensure-account", async ({ body, request, set }) => {
    const ip = clientIp(request);
    cleanup(Date.now());

    if (!allow(buckets, `ensure:${ip}`, 5, MINUTE)) {
      set.status = 429;
      return { message: "Too many requests. Wait a minute and try again." };
    }

    try {
      const input = assertCreateAccountInput(body);
      return await ensureAccount(input);
    } catch (cause) {
      const status = errorStatus(cause);
      console.error("[relayer] ensure-account failed:", errorMessage(cause));
      set.status = status;
      return {
        message: errorMessage(cause) || "Could not ensure the account",
      };
    }
  })
  .post("/fund-account", async ({ body, request, set }) => {
    const ip = clientIp(request);
    cleanup(Date.now());

    if (!allow(buckets, `fund:${ip}`, 3, MINUTE)) {
      set.status = 429;
      return { message: "Too many faucet requests. Wait a minute." };
    }

    try {
      const input = assertCreateAccountInput(body);

      if (
        !allow(
          dailyBuckets,
          `fund:${input.accountId}`,
          1,
          DAY,
        )
      ) {
        set.status = 429;
        return {
          message:
            "This wallet already received testnet funds in the last 24 hours.",
        };
      }

      return await relayFundAccount(input);
    } catch (cause) {
      const status = errorStatus(cause);
      console.error("[relayer] fund-account failed:", errorMessage(cause));
      set.status = status;
      return {
        message: errorMessage(cause) || "Could not fund the account",
      };
    }
  })
  .post("/sign-tx", async ({ body, request, set }) => {
    const ip = clientIp(request);
    cleanup(Date.now());

    if (!allow(buckets, `sign:${ip}`, 30, MINUTE)) {
      set.status = 429;
      return { message: "Too many signing requests. Wait a minute." };
    }

    try {
      const input = assertSignRequest(body);
      return await relaySignTx(input);
    } catch (cause) {
      const status = errorStatus(cause);
      console.error("[relayer] sign-tx failed:", errorMessage(cause));
      set.status = status;
      return {
        message: errorMessage(cause) || "Could not sign the transaction",
      };
    }
  })
  .post("/sponsor-mint", async ({ body, request, set }) => {
    const ip = clientIp(request);
    cleanup(Date.now());

    try {
      const input = assertSponsorMintInput(body);
      const claims = await verifyAuth0Jwt(input.token);

      if (!allow(buckets, `sponsor:${claims.sub}:${ip}`, 5, MINUTE)) {
        set.status = 429;
        return { message: "Too many mint requests. Wait a minute." };
      }

      if (
        !allow(
          dailyBuckets,
          `sponsor:${input.accountId}`,
          20,
          DAY,
        )
      ) {
        set.status = 429;
        return {
          message:
            "This wallet reached the daily sponsored mint limit (20).",
        };
      }

      return await sponsorMint({
        ...input,
        subject: claims.sub,
        requestIp: ip,
      });
    } catch (cause) {
      const status = errorStatus(cause);
      console.error("[relayer] sponsor-mint failed:", errorMessage(cause));
      set.status = status;
      return {
        message: errorMessage(cause) || "Could not sponsor the mint",
      };
    }
  })
  .get("/status", async ({ set }) => {
    try {
      return await getRelayerStatus();
    } catch (cause) {
      set.status = 502;
      return {
        sponsoredMintAvailable: false,
        reason: "error",
        budgetRemainingYocto: "0",
        mintDepositYocto: process.env.MINT_DEPOSIT_YOCTO || "10000000000000000000000",
        message: errorMessage(cause),
      };
    }
  });
