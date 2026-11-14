import { Player } from '../db/models/player';
import { PlayerStats } from '../db/models/playerStats';
import { StatsEvent, type StatsEventType, type StatsMission } from '../db/models/statsEvent';
import {
	StatsForbiddenError,
	StatsRequestError,
	isUuidPlayerId,
	ownedSubject
} from './identity';
import {
	emptyMissions,
	type StatsEventInput,
	type StatsLeaderboardEntry,
	type StatsMissionsSnapshot,
	type StatsProfile,
	type StatsSnapshot
} from './schema';

type LeanStats = {
	playerId: string;
	subject?: string | null;
	alias?: string | null;
	skin?: string | null;
	version?: number;
	createdAt?: Date;
	updatedAt?: Date;
	missions?: unknown;
	attested?: unknown;
};

function count(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function record(value: unknown): Record<string, unknown> {
	return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function dateMs(value: Date | string | number | undefined, fallback: number): number {
	if (value instanceof Date) {
		return value.getTime();
	}

	if (typeof value === 'string' || typeof value === 'number') {
		const parsed = new Date(value).getTime();

		return Number.isFinite(parsed) ? parsed : fallback;
	}

	return fallback;
}

function readItems(value: unknown): Record<string, string[]> {
	const source =
		value instanceof Map ? Object.fromEntries(value.entries()) : record(value);
	const items: Record<string, string[]> = {};

	for (const [missionId, raw] of Object.entries(source)) {
		if (typeof missionId !== 'string' || missionId.length === 0 || missionId.length > 64) {
			continue;
		}

		if (!Array.isArray(raw)) {
			continue;
		}

		const ids = [...new Set(raw.filter((entry): entry is string => typeof entry === 'string'))]
			.map((entry) => entry.slice(0, 64))
			.slice(0, 64);

		items[missionId] = ids;
	}

	return items;
}

export function normalizeMissions(value: unknown): StatsMissionsSnapshot {
	const missions = record(value);
	const cats = record(missions.cats);
	const crypt = record(missions.crypt);
	const barn = record(missions.barn);
	const race = record(missions.race);
	const royale = record(missions.royale);
	const hexfire = record(missions.hexfire);
	const parkour = record(missions.parkour);
	const errands = record(missions.errands);

	return {
		cats: {
			played: count(cats.played),
			completed: count(cats.completed),
			catsFound: count(cats.catsFound)
		},
		crypt: {
			played: count(crypt.played),
			completed: count(crypt.completed),
			failed: count(crypt.failed),
			deaths: count(crypt.deaths)
		},
		barn: {
			played: count(barn.played),
			completed: count(barn.completed),
			failed: count(barn.failed),
			deaths: count(barn.deaths),
			kills: count(barn.kills),
			waves: count(barn.waves),
			bestWave: count(barn.bestWave)
		},
		race: {
			played: count(race.played),
			finished: count(race.finished),
			won: count(race.won),
			laps: count(race.laps),
			deaths: count(race.deaths),
			podiums: count(race.podiums)
		},
		royale: {
			matches: count(royale.matches),
			finished: count(royale.finished),
			wins: count(royale.wins),
			kills: count(royale.kills),
			top3: count(royale.top3),
			bestPlacement: count(royale.bestPlacement)
		},
		hexfire: {
			matches: count(hexfire.matches),
			wins: count(hexfire.wins),
			kills: count(hexfire.kills),
			deaths: count(hexfire.deaths)
		},
		parkour: {
			played: count(parkour.played),
			finishes: count(parkour.finishes),
			wins: count(parkour.wins),
			bestTimeMs: count(parkour.bestTimeMs)
		},
		errands: {
			accepted: count(errands.accepted),
			completed: count(errands.completed),
			items: readItems(errands.items)
		}
	};
}

export function toSnapshot(doc: LeanStats): StatsSnapshot {
	const now = Date.now();

	return {
		version: 2,
		playerId: doc.playerId,
		createdAt: dateMs(doc.createdAt, now),
		updatedAt: dateMs(doc.updatedAt, now),
		alias: doc.alias ?? null,
		skin: doc.skin ?? null,
		missions: normalizeMissions(doc.missions),
		attested: normalizeMissions(doc.attested)
	};
}

/** Stores metadata about the player without blocking the stats write. */
async function touchPlayer(playerId: string): Promise<void> {
	try {
		await Player.updateOne(
			{ playerId },
			{ $set: { lastSeenAt: new Date() }, $setOnInsert: { playerId } },
			{ upsert: true, timestamps: false, setDefaultsOnInsert: false }
		);
	} catch (cause) {
		// A concurrent upsert can win the unique index; metadata is best-effort.
		console.warn('[stats] could not update player metadata:', cause instanceof Error ? cause.message : cause);
	}
}

function isDuplicateKey(cause: unknown): boolean {
	const error = cause as { code?: number; codeName?: string };

	return error?.code === 11_000 || error?.codeName === 'DuplicateKey';
}

/**
 * Vincula un documento sin dueño al `sub` autenticado y rechaza los documentos
 * que ya pertenecen a otra cuenta.
 */
async function claimOwnership(playerId: string, owner: string | null): Promise<void> {
	if (!owner) {
		return;
	}

	const current = await PlayerStats.findOne({ playerId }).select({ subject: 1 }).lean<{
		subject?: string | null;
	}>();

	if (!current) {
		return;
	}

	if (!current.subject) {
		// Conditional update: two concurrent first requests may try to bind at
		// the same time, but only one of them can win.
		await PlayerStats.updateOne(
			{ playerId, $or: [{ subject: { $exists: false } }, { subject: null }] },
			{ $set: { subject: owner } }
		);

		const fresh = await PlayerStats.findOne({ playerId }).select({ subject: 1 }).lean<{
			subject?: string | null;
		}>();

		if (fresh?.subject && fresh.subject !== owner) {
			throw new StatsForbiddenError();
		}

		return;
	}

	if (current.subject !== owner) {
		throw new StatsForbiddenError();
	}
}

/**
 * Filtro que solo deja operar sobre documentos sin dueño o del mismo `sub`.
 * Evita que una carrera escriba contadores en una cuenta ajena antes de que
 * `claimOwnership` detecte el conflicto.
 */
function ownedQuery(playerId: string, owner: string | null): Record<string, unknown> {
	const query: Record<string, unknown> = { playerId };

	if (owner) {
		query.$or = [{ subject: owner }, { subject: { $exists: false } }, { subject: null }];
	}

	return query;
}

/**
 * Valida que la petición pueda operar sobre `playerId`: los UUID legacy no
 * requieren token y las cuentas exigen un JWT vinculado a un único `sub`.
 */
export async function ensureStatsOwnership(
	playerId: string,
	subject: string | null
): Promise<void> {
	const owner = ownedSubject(playerId, subject);

	await claimOwnership(playerId, owner);
}

/** Reads the stats document, creating an empty one on first access. */
export async function getOrCreateStats(
	playerId: string,
	subject: string | null = null
): Promise<StatsSnapshot> {
	const owner = ownedSubject(playerId, subject);
	const now = new Date();
	const query = ownedQuery(playerId, owner);
	const insert: Record<string, unknown> = {
		playerId,
		version: 2,
		missions: emptyMissions(),
		attested: emptyMissions(),
		createdAt: now,
		updatedAt: now
	};

	if (owner) {
		insert.subject = owner;
	}

	try {
		const doc = await PlayerStats.findOneAndUpdate(
			query,
			{ $setOnInsert: insert },
			{
				upsert: true,
				returnDocument: 'after',
				lean: true,
				timestamps: false,
				setDefaultsOnInsert: false
			}
		).lean<LeanStats>();

		if (!doc) {
			throw new Error('Could not create the stats document');
		}

		await claimOwnership(playerId, owner);

		return toSnapshot(doc);
	} catch (cause) {
		// Two concurrent first requests can race on the unique index. The
		// winner has already created the document, so just read it.
		if (isDuplicateKey(cause)) {
			const existing = await PlayerStats.findOne({ playerId }).lean<LeanStats>();

			if (existing) {
				await claimOwnership(playerId, owner);

				return toSnapshot(existing);
			}
		}

		throw cause;
	}
}

type SnapshotUpdate = {
	max: Record<string, number>;
	min: Record<string, number>;
};

function snapshotUpdate(missions: StatsMissionsSnapshot): SnapshotUpdate {
	const max: Record<string, number> = {
		'missions.cats.played': missions.cats.played,
		'missions.cats.completed': missions.cats.completed,
		'missions.cats.catsFound': missions.cats.catsFound,
		'missions.crypt.played': missions.crypt.played,
		'missions.crypt.completed': missions.crypt.completed,
		'missions.crypt.failed': missions.crypt.failed,
		'missions.crypt.deaths': missions.crypt.deaths,
		'missions.barn.played': missions.barn.played,
		'missions.barn.completed': missions.barn.completed,
		'missions.barn.failed': missions.barn.failed,
		'missions.barn.deaths': missions.barn.deaths,
		'missions.barn.kills': missions.barn.kills,
		'missions.barn.waves': missions.barn.waves,
		'missions.barn.bestWave': missions.barn.bestWave,
		'missions.race.played': missions.race.played,
		'missions.race.finished': missions.race.finished,
		'missions.race.won': missions.race.won,
		'missions.race.laps': missions.race.laps,
		'missions.race.deaths': missions.race.deaths,
		'missions.race.podiums': missions.race.podiums,
		'missions.royale.matches': missions.royale.matches,
		'missions.royale.finished': missions.royale.finished,
		'missions.royale.wins': missions.royale.wins,
		'missions.royale.kills': missions.royale.kills,
		'missions.royale.top3': missions.royale.top3,
		'missions.hexfire.matches': missions.hexfire.matches,
		'missions.hexfire.wins': missions.hexfire.wins,
		'missions.hexfire.kills': missions.hexfire.kills,
		'missions.hexfire.deaths': missions.hexfire.deaths,
		'missions.parkour.played': missions.parkour.played,
		'missions.parkour.finishes': missions.parkour.finishes,
		'missions.parkour.wins': missions.parkour.wins,
		'missions.errands.accepted': missions.errands.accepted,
		'missions.errands.completed': missions.errands.completed
	};

	// Lower is better and 0 means "no result yet".
	const min: Record<string, number> = {};

	if (missions.royale.bestPlacement > 0) {
		min['missions.royale.bestPlacement'] = missions.royale.bestPlacement;
	}

	if (missions.parkour.bestTimeMs > 0) {
		min['missions.parkour.bestTimeMs'] = missions.parkour.bestTimeMs;
	}

	return { max, min };
}

function emptyUpdate(update: SnapshotUpdate): Record<string, unknown> {
	const result: Record<string, unknown> = { $max: update.max };

	if (Object.keys(update.min).length > 0) {
		result.$min = update.min;
	}

	return result;
}

/**
 * Upserts a full snapshot using `$max`, so a client with stale counters can
 * never move a statistic backwards. Resetting is a separate operation.
 */
export async function applySnapshot(
	playerId: string,
	missions: StatsMissionsSnapshot,
	subject: string | null = null,
	profile: StatsProfile = {}
): Promise<StatsSnapshot> {
	const owner = ownedSubject(playerId, subject);
	const now = new Date();
	const query = ownedQuery(playerId, owner);
	const update = snapshotUpdate(missions);
	const $setOnInsert: Record<string, unknown> = { playerId, version: 2, createdAt: now };

	if (owner) {
		$setOnInsert.subject = owner;
	}

	const set: Record<string, unknown> = { updatedAt: now };

	// The profile is display-only metadata, so the newest client wins (unlike
	// the counters, which are monotonic).
	if (profile.alias) {
		set.alias = profile.alias;
	}

	if (profile.skin) {
		set.skin = profile.skin;
	}

	const document = {
		...emptyUpdate(update),
		$set: set,
		$setOnInsert
	};

	let doc: LeanStats | null = null;

	try {
		doc = await PlayerStats.findOneAndUpdate(query, document, {
			upsert: true,
			returnDocument: 'after',
			lean: true,
			timestamps: false,
			setDefaultsOnInsert: false
		}).lean<LeanStats>();
	} catch (cause) {
		if (!isDuplicateKey(cause)) {
			throw cause;
		}

		// Concurrent first writes: the document now exists. Claim (or reject)
		// ownership before retrying so another account is never mutated.
		await claimOwnership(playerId, owner);

		doc = await PlayerStats.findOneAndUpdate(
			query,
			{
				...emptyUpdate(update),
				$set: set
			},
			{ returnDocument: 'after', lean: true, timestamps: false, setDefaultsOnInsert: false }
		).lean<LeanStats>();
	}

	if (!doc) {
		throw new Error('Could not save the stats snapshot');
	}

	await claimOwnership(playerId, owner);
	void touchPlayer(playerId);

	return toSnapshot(doc);
}

function missionForEvent(event: StatsEventInput): StatsMission | null {
	switch (event.type) {
		case 'mission-start':
		case 'mission-complete':
		case 'mission-fail':
		case 'death':
			return event.mission;
		case 'cat-capture':
			return 'cats';
		case 'kill':
			return 'barn';
		case 'lap':
		case 'race-finish':
		case 'race-win':
			return 'race';
		default:
			return null;
	}
}

function incrementPath(event: StatsEventInput): string {
	switch (event.type) {
		case 'mission-start':
			return `missions.${event.mission}.played`;
		case 'mission-complete':
			return `missions.${event.mission}.completed`;
		case 'mission-fail':
			return `missions.${event.mission}.failed`;
		case 'cat-capture':
			return 'missions.cats.catsFound';
		case 'kill':
			return 'missions.barn.kills';
		case 'death':
			return `missions.${event.mission}.deaths`;
		case 'lap':
			return 'missions.race.laps';
		case 'race-finish':
			return 'missions.race.finished';
		case 'race-win':
			return 'missions.race.won';
	}
}

/**
 * `played` is a derived counter: a player can join a round already in progress
 * and send `complete`/`fail` without `start`. Recompute it with `$max` after
 * every event so it never lags behind the other counters.
 */
function playedNormalizationStage(mission: StatsMission): Record<string, unknown> {
	switch (mission) {
		case 'cats':
			return {
				'missions.cats.played': {
					$max: [
						{ $ifNull: ['$missions.cats.played', 0] },
						{ $ifNull: ['$missions.cats.completed', 0] }
					]
				}
			};
		case 'crypt':
			return {
				'missions.crypt.played': {
					$max: [
						{ $ifNull: ['$missions.crypt.played', 0] },
						{
							$add: [
								{ $ifNull: ['$missions.crypt.completed', 0] },
								{ $ifNull: ['$missions.crypt.failed', 0] }
							]
						}
					]
				}
			};
		case 'barn':
			return {
				'missions.barn.played': {
					$max: [
						{ $ifNull: ['$missions.barn.played', 0] },
						{
							$add: [
								{ $ifNull: ['$missions.barn.completed', 0] },
								{ $ifNull: ['$missions.barn.failed', 0] }
							]
						}
					]
				}
			};
		case 'race':
			return {
				'missions.race.played': {
					$max: [
						{ $ifNull: ['$missions.race.played', 0] },
						{ $ifNull: ['$missions.race.finished', 0] },
						{ $ifNull: ['$missions.race.won', 0] }
					]
				}
			};
	}
}

export type AppliedEvents = {
	snapshot: StatsSnapshot;
	applied: number;
};

/** Applies game events with atomic `$inc` operations. */
export async function applyEvents(
	playerId: string,
	events: StatsEventInput[],
	subject: string | null = null
): Promise<AppliedEvents> {
	// Make sure the document and every counter exist before incrementing.
	await getOrCreateStats(playerId, subject);

	const inc: Record<string, number> = {};
	const missions = new Set<StatsMission>();

	for (const event of events) {
		const path = incrementPath(event);
		inc[path] = (inc[path] ?? 0) + event.delta;

		const mission = missionForEvent(event);

		if (mission) {
			missions.add(mission);
		}
	}

	const now = new Date();

	const doc = await PlayerStats.findOneAndUpdate(
		{ playerId },
		{ $inc: inc, $set: { updatedAt: now } },
		{
			returnDocument: 'after',
			lean: true,
			timestamps: false,
			setDefaultsOnInsert: false
		}
	).lean<LeanStats>();

	if (!doc) {
		throw new Error('Could not apply the stats events');
	}

	for (const mission of missions) {
		await PlayerStats.updateOne(
			{ playerId },
			[{ $set: playedNormalizationStage(mission) }],
			{ timestamps: false, updatePipeline: true }
		);
	}

	const fresh = await PlayerStats.findOne({ playerId }).lean<LeanStats>();

	const snapshot = toSnapshot(fresh ?? doc);

	// The counters are already committed. The log is secondary: failing to
	// write it must not turn a successful increment into a retryable error
	// (retries would double-count).
	try {
		await StatsEvent.insertMany(
			events.map((event) => ({
				playerId,
				type: event.type as StatsEventType,
				mission: missionForEvent(event),
				delta: event.delta,
				meta: 'meta' in event ? event.meta : null
			}))
		);
	} catch (cause) {
		console.warn(
			'[stats] could not append events:',
			cause instanceof Error ? cause.message : cause
		);
	}

	void touchPlayer(playerId);

	return { snapshot, applied: events.length };
}

/** Resets every counter, preserving the account's `createdAt`. */
export async function resetStats(
	playerId: string,
	subject: string | null = null
): Promise<StatsSnapshot> {
	await getOrCreateStats(playerId, subject);

	const doc = await PlayerStats.findOneAndUpdate(
		{ playerId },
		{ $set: { missions: emptyMissions(), updatedAt: new Date() } },
		{ returnDocument: 'after', lean: true, timestamps: false, setDefaultsOnInsert: false }
	).lean<LeanStats>();

	if (!doc) {
		throw new Error('Could not reset the stats');
	}

	await StatsEvent.create({
		playerId,
		type: 'reset' satisfies StatsEventType,
		mission: null,
		delta: 0,
		meta: null
	}).catch((cause) => {
		console.warn(
			'[stats] could not append the reset event:',
			cause instanceof Error ? cause.message : cause
		);
	});

	void touchPlayer(playerId);

	return toSnapshot(doc);
}

/**
 * Fusiona las stats de un UUID legacy en la cuenta autenticada usando `$max`.
 * Es idempotente: repetir el merge nunca suma ni reduce contadores.
 */
export async function mergeStatsFrom(
	targetPlayerId: string,
	sourcePlayerId: string,
	subject: string | null
): Promise<StatsSnapshot> {
	if (isUuidPlayerId(targetPlayerId)) {
		throw new StatsRequestError('The merge target must be an account id');
	}

	if (!isUuidPlayerId(sourcePlayerId)) {
		throw new StatsRequestError('The merge source must be a legacy UUID');
	}

	if (targetPlayerId === sourcePlayerId) {
		throw new StatsRequestError('Cannot merge a player id into itself');
	}

	const owner = ownedSubject(targetPlayerId, subject);

	// Ensures the target exists, is owned by this subject and is claimable.
	await getOrCreateStats(targetPlayerId, owner);

	const source = await PlayerStats.findOne({ playerId: sourcePlayerId }).lean<LeanStats>();

	if (!source) {
		const current = await PlayerStats.findOne({ playerId: targetPlayerId }).lean<LeanStats>();

		if (!current) {
			throw new Error('Could not read the merged stats');
		}

		return toSnapshot(current);
	}

	const missions = normalizeMissions(source.missions);
	const update = snapshotUpdate(missions);

	const doc = await PlayerStats.findOneAndUpdate(
		{ playerId: targetPlayerId },
		{ ...emptyUpdate(update), $set: { updatedAt: new Date() } },
		{ returnDocument: 'after', lean: true, timestamps: false, setDefaultsOnInsert: false }
	).lean<LeanStats>();

	if (!doc) {
		throw new Error('Could not merge the stats');
	}

	void touchPlayer(targetPlayerId);

	// The counters are already merged; an audit failure must not make the
	// client retry (which would be harmless, but noisy).
	await StatsEvent.create({
		playerId: targetPlayerId,
		type: 'link' satisfies StatsEventType,
		mission: null,
		delta: 0,
		meta: { fromPlayerId: sourcePlayerId }
	}).catch((cause) => {
		console.warn(
			'[stats] could not append the link event:',
			cause instanceof Error ? cause.message : cause
		);
	});

	return toSnapshot(doc);
}

type LeaderboardRow = {
	playerId: string;
	alias?: string | null;
	skin?: string | null;
	score?: number;
	kills?: number;
	updatedAt?: Date | string | number;
};

/**
 * Global Top 3 (configurable) ordered by completed missions, then kills.
 * Players with kills but no completed mission still qualify, and the public
 * response carries only the alias/skin metadata needed by the podium.
 */
export async function getLeaderboard(limit = 10): Promise<StatsLeaderboardEntry[]> {
	const size = Math.max(1, Math.min(Math.trunc(limit), 20));
	const rows = await PlayerStats.aggregate<LeaderboardRow>([
		{
			$addFields: {
				_score: {
					$add: [
						{ $ifNull: ['$missions.cats.completed', 0] },
						{ $ifNull: ['$missions.crypt.completed', 0] },
						{ $ifNull: ['$missions.barn.completed', 0] },
						{ $ifNull: ['$missions.race.won', 0] }
					]
				},
				_kills: { $ifNull: ['$missions.barn.kills', 0] }
			}
		},
		{ $match: { $or: [{ _score: { $gt: 0 } }, { _kills: { $gt: 0 } }] } },
		{ $sort: { _score: -1, _kills: -1, updatedAt: 1 } },
		{ $limit: size },
		{
			$project: {
				_id: 0,
				playerId: 1,
				alias: 1,
				skin: 1,
				score: '$_score',
				kills: '$_kills',
				updatedAt: 1
			}
		}
	]);

	const now = Date.now();

	return rows.map((row) => ({
		playerId: row.playerId,
		alias: row.alias ?? null,
		skin: row.skin ?? null,
		score: count(row.score),
		kills: count(row.kills),
		updatedAt: dateMs(row.updatedAt, now)
	}));
}
