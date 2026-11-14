import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { closeMongo, ensureMongo } from "../src/db/mongo";
import { MissionProgress } from "../src/db/models/missionProgress";
import { PlayerStats } from "../src/db/models/playerStats";
import { RewardClaim } from "../src/db/models/rewardClaim";
import { OwnershipUnavailableError } from "../src/progression/ownership";
import { createProgressionRoutes } from "../src/routes/progression";
import { emptyStats } from "../src/stats/schema";

const fallback = "mongodb://127.0.0.1:27017/nearbox_test";
const testUri = process.env.MONGODB_URI_TEST?.trim() || fallback;

if (!/(_test)(\?|$)/.test(testUri)) {
  throw new Error(
    "MONGODB_URI_TEST must point to a database whose name ends with _test",
  );
}

process.env.MONGODB_URI = testUri;

const connected = await ensureMongo();
const suite = connected ? describe : describe.skip;

const SUBJECTS: Record<string, string> = {
  "token-a": "auth0|alice",
  "token-b": "auth0|bob",
};

const app = new Elysia().use(
  createProgressionRoutes(
    async (token) => {
      const sub = SUBJECTS[token];

      if (!sub) {
        throw new Error("Invalid test token");
      }

      return { sub };
    },
    { loadOwnedCatalogIds: async () => [] },
  ),
);

const failingApp = new Elysia().use(
  createProgressionRoutes(
    async (token) => {
      const sub = SUBJECTS[token];

      if (!sub) {
        throw new Error("Invalid test token");
      }

      return { sub };
    },
    {
      loadOwnedCatalogIds: async () => {
        throw new OwnershipUnavailableError();
      },
    },
  ),
);

type ApiResponse = { status: number; body: any };

async function callOn(
  instance: { handle: (request: Request) => Promise<Response> },
  path: string,
  init?: RequestInit,
): Promise<ApiResponse> {
  const response = await instance.handle(
    new Request(`http://progression.local${path}`, init),
  );
  const text = await response.text();
  let body: unknown = null;

  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  return { status: response.status, body };
}

function call(path: string, init?: RequestInit): Promise<ApiResponse> {
  return callOn(app, path, init);
}

function authedCallOn(
  instance: { handle: (request: Request) => Promise<Response> },
  path: string,
  token: string,
): Promise<ApiResponse> {
  const headers = new Headers();
  headers.set("authorization", `Bearer ${token}`);

  return callOn(instance, path, { headers });
}

function authedCall(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<ApiResponse> {
  const headers = new Headers(init?.headers);
  headers.set("authorization", `Bearer ${token}`);

  return call(path, { ...init, headers });
}

function authedPost(
  path: string,
  token: string,
  payload?: unknown,
): Promise<ApiResponse> {
  return authedCall(path, token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
}

function freshAccount(): string {
  return `t-nearbox-${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}.testnet`;
}

async function markAttested(playerId: string, patch: Record<string, unknown>) {
  await PlayerStats.updateOne(
    { playerId },
    {
      $setOnInsert: {
        playerId,
        subject: SUBJECTS["token-a"],
        version: 2,
        missions: emptyStats(playerId).missions,
        attested: emptyStats(playerId).attested,
      },
    },
    { upsert: true },
  );

  await PlayerStats.updateOne({ playerId }, { $set: patch });
}

function missionState(body: any, missionId: string) {
  const state = body.missions.find(
    (entry: any) => entry.missionId === missionId,
  );

  if (!state) {
    throw new Error(`missing mission ${missionId}`);
  }

  return state;
}

afterAll(async () => {
  if (connected) {
    await MissionProgress.deleteMany({});
    await RewardClaim.deleteMany({});
    await PlayerStats.deleteMany({});
  }

  await closeMongo();
});

suite("progression API", () => {
  beforeEach(async () => {
    await MissionProgress.deleteMany({});
    await RewardClaim.deleteMany({});
    await PlayerStats.deleteMany({});
  });

  test("catalog is public and exposes the 42 missions", async () => {
    const response = await call("/progression/catalog");

    expect(response.status).toBe(200);
    expect(response.body.version).toBe(1);
    expect(response.body.missions).toHaveLength(42);
    expect(response.body.rewards).toHaveLength(20);
    expect(response.body.fingerprint).toBe("d4669fb7");
  });

  test("account progression requires a token", async () => {
    const response = await call(`/progression/${freshAccount()}`);
    expect(response.status).toBe(401);
  });

  test("an attested stat completes a T0 mission and persists completedAt", async () => {
    const account = freshAccount();

    await markAttested(account, {
      "attested.barn.completed": 1,
    });

    const response = await authedCall(`/progression/${account}`, "token-a");

    expect(response.status).toBe(200);
    expect(response.body.accountId).toBe(account);
    expect(missionState(response.body, "barn-first").status).toBe("completed");

    const stored = await MissionProgress.findOne({
      playerId: account,
    }).lean<any>();
    const entry = stored?.missions?.find(
      (item: any) => item.missionId === "barn-first",
    );

    expect(entry).toBeTruthy();
    expect(entry.completedAt).toBeInstanceOf(Date);
  });

  test("accept and abandon toggle an available mission", async () => {
    const account = freshAccount();

    await authedPost(
      `/progression/${account}/missions/barn-first/accept`,
      "token-a",
    );

    const accepted = await authedCall(`/progression/${account}`, "token-a");
    expect(missionState(accepted.body, "barn-first").status).toBe("active");

    await authedPost(
      `/progression/${account}/missions/barn-first/abandon`,
      "token-a",
    );

    const abandoned = await authedCall(`/progression/${account}`, "token-a");
    expect(missionState(abandoned.body, "barn-first").status).toBe("available");
  });

  test("collect progress only merges known objective ids", async () => {
    const account = freshAccount();

    await authedPost(
      `/progression/${account}/missions/alba-moonflowers/progress`,
      "token-a",
      { collectedIds: ["moon-01", "moon-03", "nope"] },
    );

    const response = await authedCall(`/progression/${account}`, "token-a");
    const state = missionState(response.body, "alba-moonflowers");

    expect(state.value).toBe(2);
    expect(state.collectedIds).toEqual(["moon-01", "moon-03"]);
  });

  test("sync imports the nine errands without duplicating ids", async () => {
    const account = freshAccount();

    await authedPost(`/progression/${account}/sync`, "token-a", {
      errands: [
        { missionId: "alba-moonflowers", collectedIds: ["moon-01", "moon-02"] },
        { missionId: "not-a-mission", collectedIds: ["x"] },
      ],
    });

    await authedPost(`/progression/${account}/sync`, "token-a", {
      errands: [
        { missionId: "alba-moonflowers", collectedIds: ["moon-02", "moon-03"] },
      ],
    });

    const response = await authedCall(`/progression/${account}`, "token-a");
    const state = missionState(response.body, "alba-moonflowers");

    expect(state.value).toBe(3);
    expect(state.collectedIds).toEqual(["moon-01", "moon-02", "moon-03"]);
  });

  test("legacy sync migrates once and respects the allowlist", async () => {
    const account = freshAccount();

    await authedPost(`/progression/${account}/sync`, "token-a", {
      errands: [],
      legacyCompleted: [
        "barn-first",
        "cats-25",
        "tier-initiate",
        "not-a-mission",
      ],
    });

    const first = await authedCall(`/progression/${account}`, "token-a");
    expect(missionState(first.body, "barn-first").status).toBe("completed");
    expect(missionState(first.body, "cats-25").status).toBe("completed");
    expect(missionState(first.body, "tier-initiate").status).not.toBe(
      "completed",
    );

    const stored = await MissionProgress.findOne({
      playerId: account,
    }).lean<any>();
    expect(stored?.migratedFromLocalAt).toBeInstanceOf(Date);

    await authedPost(`/progression/${account}/sync`, "token-a", {
      errands: [],
      legacyCompleted: ["royale-first"],
    });

    const second = await authedCall(`/progression/${account}`, "token-a");
    expect(missionState(second.body, "royale-first").status).not.toBe(
      "completed",
    );
  });

  test("snapshot fails closed when NFT ownership cannot be verified", async () => {
    const account = freshAccount();

    await markAttested(account, {
      "attested.barn.kills": 100,
      "attested.barn.completed": 1,
    });

    const response = await authedCallOn(
      failingApp,
      `/progression/${account}`,
      "token-a",
    );

    expect(response.status).toBe(200);
    expect(response.body.ownershipUnverified).toBe(true);
    expect(response.body.ownedCatalogIds).toEqual([]);

    const gated = missionState(response.body, "barn-kills-100");
    expect(gated.status).toBe("locked");
    expect(gated.lockedReason).toContain("Own ");

    const stored = await MissionProgress.findOne({
      playerId: account,
    }).lean<any>();
    const entry = stored?.missions?.find(
      (item: any) => item.missionId === "barn-kills-100",
    );
    expect(entry?.completedAt ?? null).toBeNull();
  });

  test("another account cannot read the progression", async () => {
    const account = freshAccount();

    await authedCall(`/progression/${account}`, "token-a");

    const response = await authedCall(`/progression/${account}`, "token-b");

    expect(response.status).toBe(403);
  });
});
