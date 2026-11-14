import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { ensureMongo, closeMongo } from '../src/db/mongo';
import { MissionProgress } from '../src/db/models/missionProgress';
import { Player } from '../src/db/models/player';
import { PlayerStats } from '../src/db/models/playerStats';
import { RewardClaim } from '../src/db/models/rewardClaim';
import { StatsEvent } from '../src/db/models/statsEvent';
import { createStatsRoutes, statsRoutes } from '../src/routes/stats';
import { emptyStats } from '../src/stats/schema';

// Tests always hit a throwaway database. Set MONGODB_URI_TEST to override the
// host/port; the database name must contain `_test` to avoid wiping dev data.
const fallback = 'mongodb://127.0.0.1:27017/nearbox_test';
const testUri = process.env.MONGODB_URI_TEST?.trim() || fallback;

if (!/(_test)(\?|$)/.test(testUri)) {
	throw new Error('MONGODB_URI_TEST must point to a database whose name ends with _test');
}

process.env.MONGODB_URI = testUri;

const connected = await ensureMongo();
const suite = connected ? describe : describe.skip;
const app = new Elysia().use(statsRoutes);

// Fake verifier: tests exercise ownership/merge without the real Auth0 JWKS.
const SUBJECTS: Record<string, string> = {
	'token-a': 'auth0|alice',
	'token-b': 'auth0|bob',
	'token-carol': 'auth0|carol'
};

const authedApp = new Elysia().use(
	createStatsRoutes(async (token) => {
		const sub = SUBJECTS[token];

		if (!sub) {
			throw new Error('Invalid test token');
		}

		return { sub };
	})
);

type ApiResponse = {
	status: number;
	body: any;
};

type HandleTarget = {
	handle: (request: Request) => Promise<Response>;
};

async function callOn(target: HandleTarget, path: string, init?: RequestInit): Promise<ApiResponse> {
	const response = await target.handle(new Request(`http://stats.local${path}`, init));
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

function authedCall(path: string, token: string, init?: RequestInit): Promise<ApiResponse> {
	const headers = new Headers(init?.headers);

	headers.set('authorization', `Bearer ${token}`);

	return callOn(authedApp, path, { ...init, headers });
}

function authedPut(path: string, token: string, payload: unknown): Promise<ApiResponse> {
	return authedCall(path, token, {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(payload)
	});
}

function authedPost(path: string, token: string, payload: unknown): Promise<ApiResponse> {
	return authedCall(path, token, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(payload)
	});
}

function post(path: string, payload: unknown): Promise<ApiResponse> {
	return call(path, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(payload)
	});
}

function put(path: string, payload: unknown): Promise<ApiResponse> {
	return call(path, {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(payload)
	});
}

function freshId(): string {
	return crypto.randomUUID();
}

function freshAccount(): string {
	return `t-nearbox-${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}.testnet`;
}

afterAll(async () => {
	if (connected) {
		await PlayerStats.deleteMany({});
		await StatsEvent.deleteMany({});
		await Player.deleteMany({});
		await MissionProgress.deleteMany({});
		await RewardClaim.deleteMany({});
	}

	await closeMongo();
});

suite('stats API', () => {
	beforeEach(async () => {
		await PlayerStats.deleteMany({});
		await StatsEvent.deleteMany({});
		await Player.deleteMany({});
		await MissionProgress.deleteMany({});
		await RewardClaim.deleteMany({});
	});

	test('health reports the MongoDB connection', async () => {
		const response = await call('/stats/health');

		expect(response.status).toBe(200);
		expect(response.body.ok).toBe(true);
		expect(response.body.state).toBe('connected');
	});

	test('GET creates an empty stats document on first access', async () => {
		const playerId = freshId();
		const response = await call(`/stats/${playerId}`);

		expect(response.status).toBe(200);
		expect(response.body.playerId).toBe(playerId);
		expect(response.body.version).toBe(2);
		expect(typeof response.body.createdAt).toBe('number');
		expect(response.body.missions.crypt).toEqual({
			played: 0,
			completed: 0,
			failed: 0,
			deaths: 0
		});

		const stored = await PlayerStats.countDocuments({ playerId });

		expect(stored).toBe(1);
	});

	test('normalizes a v1 snapshot to v2 with zeroed sections', async () => {
		const playerId = freshId();
		const v1 = {
			version: 1,
			playerId,
			missions: {
				cats: { played: 1, completed: 1, catsFound: 2 },
				crypt: { played: 0, completed: 0, failed: 0, deaths: 0 },
				barn: { played: 1, completed: 0, failed: 1, deaths: 3, kills: 4 },
				race: { played: 0, finished: 0, won: 0, laps: 0, deaths: 0 }
			}
		};

		const response = await put(`/stats/${playerId}`, v1);

		expect(response.status).toBe(200);
		expect(response.body.version).toBe(2);
		expect(response.body.missions.barn.kills).toBe(4);
		expect(response.body.missions.royale).toEqual({
			matches: 0,
			finished: 0,
			wins: 0,
			kills: 0,
			top3: 0,
			bestPlacement: 0
		});
		expect(response.body.attested.barn.kills).toBe(0);
		expect(response.body.attested.royale.matches).toBe(0);
	});

	test('the client snapshot never writes attested counters', async () => {
		const playerId = freshId();

		const response = await put(`/stats/${playerId}`, {
			version: 2,
			playerId,
			missions: {
				...emptyStats(playerId).missions,
				barn: { ...emptyStats(playerId).missions.barn, kills: 9 }
			},
			attested: {
				...emptyStats(playerId).missions,
				barn: { ...emptyStats(playerId).missions.barn, kills: 999 }
			}
		});

		expect(response.status).toBe(200);
		expect(response.body.attested.barn.kills).toBe(0);

		const stored = (await PlayerStats.findOne({ playerId }).lean()) as any;

		expect(stored?.attested?.barn?.kills ?? 0).toBe(0);
	});

	test('events accumulate with atomic increments', async () => {
		const playerId = freshId();

		await post(`/stats/${playerId}/events`, { events: [{ type: 'death', mission: 'crypt' }] });
		const response = await post(`/stats/${playerId}/events`, {
			events: [
				{ type: 'death', mission: 'crypt' },
				{ type: 'kill', delta: 3 },
				{ type: 'lap' }
			]
		});

		expect(response.status).toBe(200);
		expect(response.body.applied).toBe(3);
		expect(response.body.stats.missions.crypt.deaths).toBe(2);
		expect(response.body.stats.missions.barn.kills).toBe(3);
		expect(response.body.stats.missions.race.laps).toBe(1);
	});

	test('derives played from completions and failures', async () => {
		const playerId = freshId();
		const response = await post(`/stats/${playerId}/events`, {
			events: [
				{ type: 'mission-complete', mission: 'barn' },
				{ type: 'mission-fail', mission: 'barn' },
				{ type: 'race-finish' },
				{ type: 'race-win' }
			]
		});

		expect(response.body.stats.missions.barn.played).toBe(2);
		expect(response.body.stats.missions.race.played).toBe(1);
	});

	test('concurrent events do not lose increments', async () => {
		const playerId = freshId();

		const responses = await Promise.all(
			Array.from({ length: 10 }, () =>
				post(`/stats/${playerId}/events`, { events: [{ type: 'death', mission: 'barn' }] })
			)
		);

		for (const response of responses) {
			expect(response.status).toBe(200);
		}

		const final = await call(`/stats/${playerId}`);

		expect(final.body.missions.barn.deaths).toBe(10);
	});

	test('PUT snapshots are monotonic', async () => {
		const playerId = freshId();
		const high = emptyStats(playerId);

		high.missions.crypt.completed = 5;
		high.missions.crypt.played = 5;
		high.missions.barn.kills = 4;

		const first = await put(`/stats/${playerId}`, high);

		expect(first.status).toBe(200);
		expect(first.body.missions.crypt.completed).toBe(5);

		const low = emptyStats(playerId);

		low.missions.crypt.completed = 1;
		low.missions.crypt.played = 1;

		const second = await put(`/stats/${playerId}`, low);

		expect(second.status).toBe(200);
		expect(second.body.missions.crypt.completed).toBe(5);
		expect(second.body.missions.crypt.played).toBe(5);
		expect(second.body.missions.barn.kills).toBe(4);
	});

	test('reset zeroes counters but keeps createdAt', async () => {
		const playerId = freshId();
		const created = await call(`/stats/${playerId}`);

		await post(`/stats/${playerId}/events`, {
			events: [
				{ type: 'death', mission: 'crypt' },
				{ type: 'cat-capture' }
			]
		});

		const response = await post(`/stats/${playerId}/reset`, {});

		expect(response.status).toBe(200);
		expect(response.body.stats.createdAt).toBe(created.body.createdAt);
		expect(response.body.stats.missions.crypt.deaths).toBe(0);
		expect(response.body.stats.missions.cats.catsFound).toBe(0);
		expect(response.body.stats.missions.barn).toEqual({
			played: 0,
			completed: 0,
			failed: 0,
			deaths: 0,
			kills: 0,
			waves: 0,
			bestWave: 0
		});
	});

	test('reset keeps MissionProgress and RewardClaim so a mission cannot be reclaimed', async () => {
		const playerId = freshId();
		await call(`/stats/${playerId}`);

		await MissionProgress.create({
			playerId,
			accountId: null,
			missions: [
				{
					missionId: 'barn-kills-25',
					completedAt: new Date(),
					claimedAt: new Date()
				}
			]
		});
		await RewardClaim.create({
			claimId: crypto.randomUUID(),
			playerId,
			accountId: playerId,
			missionId: 'barn-kills-25',
			catalogId: 'shotgun-gold',
			status: 'minted',
			requestId: crypto.randomUUID(),
			tokenId: 'shotgun-gold#1',
			serial: 1,
			txHash: 'tx-reset',
			attempts: 1
		});

		const response = await post(`/stats/${playerId}/reset`, {});

		expect(response.status).toBe(200);
		expect(await MissionProgress.countDocuments({ playerId })).toBe(1);
		expect(await RewardClaim.countDocuments({ playerId })).toBe(1);
	});

	test('rejects invalid ids and payloads', async () => {
		const badId = await call('/stats/bad%20id');

		expect(badId.status).toBe(400);
		expect(badId.body.error).toBe('INVALID_STATS_PAYLOAD');

		const playerId = freshId();
		const badBody = await put(`/stats/${playerId}`, { missions: { cats: {} } });

		expect(badBody.status).toBe(400);

		const badEvent = await post(`/stats/${playerId}/events`, {
			events: [{ type: 'death', mission: 'cats' }]
		});

		expect(badEvent.status).toBe(400);
	});

	test('keeps an append-only event log', async () => {
		const playerId = freshId();

		await post(`/stats/${playerId}/events`, {
			events: [
				{ type: 'mission-start', mission: 'race' },
				{ type: 'race-win' }
			]
		});
		await post(`/stats/${playerId}/reset`, {});

		const events = await StatsEvent.find({ playerId }).sort({ createdAt: 1 }).lean();

		expect(events.map((event) => event.type)).toEqual(['mission-start', 'race-win', 'reset']);
	});
});

suite('stats account authentication and merge', () => {
	beforeEach(async () => {
		await PlayerStats.deleteMany({});
		await StatsEvent.deleteMany({});
		await Player.deleteMany({});
		await MissionProgress.deleteMany({});
		await RewardClaim.deleteMany({});
	});

	test('account ids require a bearer token', async () => {
		const accountId = freshAccount();
		const response = await call(`/stats/${accountId}`);

		expect(response.status).toBe(401);
		expect(response.body.error).toBe('AUTH_REQUIRED');
		expect(await PlayerStats.countDocuments({ playerId: accountId })).toBe(0);
	});

	test('legacy UUID ids keep working without a token', async () => {
		const playerId = freshId();
		const response = await call(`/stats/${playerId}`);

		expect(response.status).toBe(200);
		expect(response.body.playerId).toBe(playerId);
	});

	test('invalid tokens are rejected', async () => {
		const accountId = freshAccount();
		const response = await authedCall(`/stats/${accountId}`, 'not-a-token');

		expect(response.status).toBe(401);
		expect(await PlayerStats.countDocuments({ playerId: accountId })).toBe(0);
	});

	test('the first valid token binds the account to its subject', async () => {
		const accountId = freshAccount();
		const response = await authedCall(`/stats/${accountId}`, 'token-a');

		expect(response.status).toBe(200);

		const stored = await PlayerStats.findOne({ playerId: accountId }).lean();

		expect(stored?.subject).toBe('auth0|alice');
	});

	test('claims a pre-existing account document on first authenticated use', async () => {
		const accountId = freshAccount();

		await PlayerStats.create({ playerId: accountId, version: 1, missions: {} });

		const response = await authedCall(`/stats/${accountId}`, 'token-a');

		expect(response.status).toBe(200);

		const stored = await PlayerStats.findOne({ playerId: accountId }).lean();

		expect(stored?.subject).toBe('auth0|alice');
	});

	test('legacy UUIDs are never bound to a subject', async () => {
		const playerId = freshId();
		const response = await authedCall(`/stats/${playerId}`, 'token-a');

		expect(response.status).toBe(200);

		const stored = await PlayerStats.findOne({ playerId }).lean();

		expect(stored?.subject ?? null).toBeNull();
	});

	test('another subject cannot read or write the account', async () => {
		const accountId = freshAccount();

		expect((await authedCall(`/stats/${accountId}`, 'token-a')).status).toBe(200);

		const read = await authedCall(`/stats/${accountId}`, 'token-b');
		expect(read.status).toBe(403);
		expect(read.body.error).toBe('STATS_FORBIDDEN');

		const low = emptyStats(accountId);
		const write = await authedPut(`/stats/${accountId}`, 'token-b', low);
		expect(write.status).toBe(403);

		const reset = await authedPost(`/stats/${accountId}/reset`, 'token-b', {});
		expect(reset.status).toBe(403);
	});

	test('leaderboard ranks by completed missions and returns alias/skin', async () => {
		const alice = freshAccount();
		const bob = freshAccount();
		const carol = freshAccount();

		const aliceStats = emptyStats(alice);
		aliceStats.missions.cats.completed = 2;
		aliceStats.missions.cats.played = 2;
		aliceStats.missions.barn.kills = 1;

		const bobStats = emptyStats(bob);
		bobStats.missions.crypt.completed = 5;
		bobStats.missions.crypt.played = 5;
		bobStats.missions.barn.kills = 9;

		// No completed missions, but enough kills to still make the podium.
		const carolStats = emptyStats(carol);
		carolStats.missions.barn.played = 1;
		carolStats.missions.barn.kills = 33;

		const alicePut = await authedPut(`/stats/${alice}`, 'token-a', {
			...aliceStats,
			alias: 'Alice',
			skin: 'witch'
		});
		const bobPut = await authedPut(`/stats/${bob}`, 'token-b', {
			...bobStats,
			alias: 'Bob',
			skin: 'demon'
		});
		const carolPut = await authedPut(`/stats/${carol}`, 'token-carol', {
			...carolStats,
			alias: 'Carol',
			skin: 'ghost'
		});

		expect(alicePut.status).toBe(200);
		expect(alicePut.body.alias).toBe('Alice');
		expect(alicePut.body.skin).toBe('witch');
		expect(bobPut.status).toBe(200);
		expect(carolPut.status).toBe(200);

		const response = await call('/stats/leaderboard?limit=3');

		expect(response.status).toBe(200);
		expect(response.body.players).toHaveLength(3);
		expect(response.body.players[0]).toMatchObject({
			playerId: bob,
			alias: 'Bob',
			skin: 'demon',
			score: 5,
			kills: 9
		});
		expect(response.body.players[1]).toMatchObject({
			playerId: alice,
			alias: 'Alice',
			skin: 'witch',
			score: 2,
			kills: 1
		});
		expect(response.body.players[2]).toMatchObject({
			playerId: carol,
			alias: 'Carol',
			skin: 'ghost',
			score: 0,
			kills: 33
		});
	});

	test('merge copies legacy counters with $max and is idempotent', async () => {
		const legacyId = freshId();
		const accountId = freshAccount();

		const legacy = emptyStats(legacyId);
		legacy.missions.crypt.completed = 7;
		legacy.missions.crypt.played = 7;
		legacy.missions.barn.kills = 5;

		expect((await put(`/stats/${legacyId}`, legacy)).status).toBe(200);

		const account = emptyStats(accountId);
		account.missions.barn.kills = 2;

		expect((await authedPut(`/stats/${accountId}`, 'token-a', account)).status).toBe(200);

		const first = await authedPost(`/stats/${accountId}/merge`, 'token-a', {
			fromPlayerId: legacyId
		});

		expect(first.status).toBe(200);
		expect(first.body.stats.missions.crypt.completed).toBe(7);
		expect(first.body.stats.missions.barn.kills).toBe(5);

		const second = await authedPost(`/stats/${accountId}/merge`, 'token-a', {
			fromPlayerId: legacyId
		});

		expect(second.status).toBe(200);
		expect(second.body.stats.missions.crypt.completed).toBe(7);
		expect(second.body.stats.missions.barn.kills).toBe(5);

		const link = await StatsEvent.findOne({ playerId: accountId, type: 'link' }).lean();

		expect((link?.meta as { fromPlayerId?: string } | null)?.fromPlayerId).toBe(legacyId);
	});

	test('merge requires authentication and a legacy UUID source', async () => {
		const legacyId = freshId();
		const accountId = freshAccount();

		const anonymous = await post(`/stats/${accountId}/merge`, { fromPlayerId: legacyId });
		expect(anonymous.status).toBe(401);

		expect((await authedCall(`/stats/${accountId}`, 'token-a')).status).toBe(200);

		const badSource = await authedPost(`/stats/${accountId}/merge`, 'token-a', {
			fromPlayerId: freshAccount()
		});
		expect(badSource.status).toBe(400);

		const uuidTarget = await authedPost(`/stats/${legacyId}/merge`, 'token-a', {
			fromPlayerId: freshId()
		});
		expect(uuidTarget.status).toBe(400);
	});
});
