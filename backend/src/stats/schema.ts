import { z } from 'zod';

/**
 * Los ids legacy son UUID generados por el cliente. Las cuentas NEAR
 * (`t-<handle>.testnet`) también se aceptan y requieren JWT de Auth0.
 */
export const statsPlayerIdSchema = z
	.string()
	.trim()
	.min(1)
	.max(64)
	.regex(/^[A-Za-z0-9._:-]+$/, 'Invalid player id');

const counter = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

const catsSchema = z.object({
	played: counter,
	completed: counter,
	catsFound: counter
});

const cryptSchema = z.object({
	played: counter,
	completed: counter,
	failed: counter,
	deaths: counter
});

const barnSchema = z.object({
	played: counter,
	completed: counter,
	failed: counter,
	deaths: counter,
	kills: counter,
	waves: counter.default(0),
	bestWave: counter.default(0)
});

const raceSchema = z.object({
	played: counter,
	finished: counter,
	won: counter,
	laps: counter,
	deaths: counter,
	podiums: counter.default(0)
});

const royaleSchema = z
	.object({
		matches: counter,
		finished: counter,
		wins: counter,
		kills: counter,
		top3: counter,
		/** 0 = sin partida puntuada; 1 es el mejor puesto. */
		bestPlacement: counter
	})
	.default({ matches: 0, finished: 0, wins: 0, kills: 0, top3: 0, bestPlacement: 0 });

const hexfireSchema = z
	.object({
		matches: counter,
		wins: counter,
		kills: counter,
		deaths: counter
	})
	.default({ matches: 0, wins: 0, kills: 0, deaths: 0 });

const parkourSchema = z
	.object({
		played: counter,
		finishes: counter,
		wins: counter,
		/** 0 = sin llegada; en ms, menor es mejor. */
		bestTimeMs: counter
	})
	.default({ played: 0, finishes: 0, wins: 0, bestTimeMs: 0 });

const errandsSchema = z
	.object({
		accepted: counter,
		completed: counter,
		/** missionId → collected objective ids. */
		items: z.record(z.string(), z.array(z.string().max(64)).max(64)).default({})
	})
	.default({ accepted: 0, completed: 0, items: {} });

const missionsSchema = z.object({
	cats: catsSchema,
	crypt: cryptSchema,
	barn: barnSchema,
	race: raceSchema,
	royale: royaleSchema,
	hexfire: hexfireSchema,
	parkour: parkourSchema,
	errands: errandsSchema
});

/** v1 clients can keep syncing; the server fills the v2 sections with zeros. */
export const statsSnapshotSchema = z.object({
	version: z.union([z.literal(1), z.literal(2)]).optional(),
	playerId: z.string().optional(),
	createdAt: z.number().finite().nonnegative().optional(),
	updatedAt: z.number().finite().nonnegative().optional(),
	/** Optional public profile used by the Top 3 podium. */
	alias: z.string().trim().min(1).max(24).optional(),
	skin: z
		.string()
		.trim()
		.min(1)
		.max(32)
		.regex(/^[a-z0-9-]+$/, 'Invalid skin id')
		.optional(),
	missions: missionsSchema
});

const delta = z.number().int().min(1).max(1_000).default(1);
const meta = z.record(z.string(), z.unknown());

const eventSchemas = [
	z.object({
		type: z.literal('mission-start'),
		mission: z.enum(['cats', 'crypt', 'barn', 'race']),
		delta,
		meta: meta.optional()
	}),
	z.object({
		type: z.literal('mission-complete'),
		mission: z.enum(['cats', 'crypt', 'barn']),
		delta,
		meta: meta.optional()
	}),
	z.object({
		type: z.literal('mission-fail'),
		mission: z.enum(['crypt', 'barn']),
		delta,
		meta: meta.optional()
	}),
	z.object({
		type: z.literal('cat-capture'),
		delta,
		meta: meta.optional()
	}),
	z.object({
		type: z.literal('kill'),
		delta,
		meta: meta.optional()
	}),
	z.object({
		type: z.literal('death'),
		mission: z.enum(['crypt', 'barn', 'race']),
		delta,
		meta: meta.optional()
	}),
	z.object({
		type: z.literal('lap'),
		delta,
		meta: meta.optional()
	}),
	z.object({
		type: z.literal('race-finish'),
		delta,
		meta: meta.optional()
	}),
	z.object({
		type: z.literal('race-win'),
		delta,
		meta: meta.optional()
	})
] as const;

export const statsEventSchema = z.discriminatedUnion('type', eventSchemas);

export const statsEventsBodySchema = z.object({
	events: z.array(statsEventSchema).min(1).max(100)
});

/** Fusiona las stats de un UUID legacy en la cuenta autenticada. */
export const statsMergeSchema = z.object({
	fromPlayerId: statsPlayerIdSchema
});

export type StatsSnapshotInput = z.infer<typeof statsSnapshotSchema>;
export type StatsEventInput = z.infer<typeof statsEventSchema>;
export type StatsMissionsSnapshot = z.infer<typeof missionsSchema>;

export type StatsSnapshot = {
	version: 2;
	playerId: string;
	createdAt: number;
	updatedAt: number;
	alias?: string | null;
	skin?: string | null;
	/** Client-reported counters. */
	missions: StatsMissionsSnapshot;
	/** Server-attested counters. Never written by the client snapshot. */
	attested: StatsMissionsSnapshot;
};

export type StatsProfile = {
	alias?: string;
	skin?: string;
};

/** One row of the public Top 3 leaderboard. */
export type StatsLeaderboardEntry = {
	playerId: string;
	alias: string | null;
	skin: string | null;
	score: number;
	kills: number;
	updatedAt: number;
};

export function emptyMissions(): StatsMissionsSnapshot {
	return {
		cats: { played: 0, completed: 0, catsFound: 0 },
		crypt: { played: 0, completed: 0, failed: 0, deaths: 0 },
		barn: { played: 0, completed: 0, failed: 0, deaths: 0, kills: 0, waves: 0, bestWave: 0 },
		race: { played: 0, finished: 0, won: 0, laps: 0, deaths: 0, podiums: 0 },
		royale: { matches: 0, finished: 0, wins: 0, kills: 0, top3: 0, bestPlacement: 0 },
		hexfire: { matches: 0, wins: 0, kills: 0, deaths: 0 },
		parkour: { played: 0, finishes: 0, wins: 0, bestTimeMs: 0 },
		errands: { accepted: 0, completed: 0, items: {} }
	};
}

export function emptyStats(playerId: string, now = Date.now()): StatsSnapshot {
	return {
		version: 2,
		playerId,
		createdAt: now,
		updatedAt: now,
		missions: emptyMissions(),
		attested: emptyMissions()
	};
}
