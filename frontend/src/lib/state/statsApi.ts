import type { StatsData } from './stats.svelte';

const API_BASE = '/api/stats';
const TIMEOUT_MS = 8_000;

export type StatsSyncState = 'local' | 'syncing' | 'synced' | 'offline';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function readCount(value: unknown): number | null {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return null;
	}

	return Math.max(0, Math.floor(value));
}

function readTime(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readItems(value: unknown): Record<string, string[]> {
	if (!isRecord(value)) {
		return {};
	}

	const items: Record<string, string[]> = {};

	for (const [missionId, raw] of Object.entries(value)) {
		if (!Array.isArray(raw)) {
			continue;
		}

		items[missionId] = [
			...new Set(raw.filter((entry): entry is string => typeof entry === 'string'))
		];
	}

	return items;
}

/** Validates and normalizes a v1/v2 server payload before touching the store. */
export function asStatsData(value: unknown, playerId: string): StatsData | null {
	if (
		!isRecord(value) ||
		value.playerId !== playerId ||
		(value.version !== 1 && value.version !== 2)
	) {
		return null;
	}

	const createdAt = readTime(value.createdAt);
	const updatedAt = readTime(value.updatedAt);
	const missions = isRecord(value.missions) ? value.missions : null;

	if (createdAt === null || updatedAt === null || !missions) {
		return null;
	}

	const cats = isRecord(missions.cats) ? missions.cats : null;
	const crypt = isRecord(missions.crypt) ? missions.crypt : null;
	const barn = isRecord(missions.barn) ? missions.barn : null;
	const race = isRecord(missions.race) ? missions.race : null;

	if (!cats || !crypt || !barn || !race) {
		return null;
	}

	const royale = isRecord(missions.royale) ? missions.royale : {};
	const hexfire = isRecord(missions.hexfire) ? missions.hexfire : {};
	const parkour = isRecord(missions.parkour) ? missions.parkour : {};
	const errands = isRecord(missions.errands) ? missions.errands : {};

	const numbers = {
		catsPlayed: readCount(cats.played),
		catsCompleted: readCount(cats.completed),
		catsFound: readCount(cats.catsFound),
		cryptPlayed: readCount(crypt.played),
		cryptCompleted: readCount(crypt.completed),
		cryptFailed: readCount(crypt.failed),
		cryptDeaths: readCount(crypt.deaths),
		barnPlayed: readCount(barn.played),
		barnCompleted: readCount(barn.completed),
		barnFailed: readCount(barn.failed),
		barnDeaths: readCount(barn.deaths),
		barnKills: readCount(barn.kills),
		barnWaves: readCount(barn.waves),
		barnBestWave: readCount(barn.bestWave),
		racePlayed: readCount(race.played),
		raceFinished: readCount(race.finished),
		raceWon: readCount(race.won),
		raceLaps: readCount(race.laps),
		raceDeaths: readCount(race.deaths),
		racePodiums: readCount(race.podiums),
		royaleMatches: readCount(royale.matches),
		royaleFinished: readCount(royale.finished),
		royaleWins: readCount(royale.wins),
		royaleKills: readCount(royale.kills),
		royaleTop3: readCount(royale.top3),
		royaleBestPlacement: readCount(royale.bestPlacement),
		hexfireMatches: readCount(hexfire.matches),
		hexfireWins: readCount(hexfire.wins),
		hexfireKills: readCount(hexfire.kills),
		hexfireDeaths: readCount(hexfire.deaths),
		parkourPlayed: readCount(parkour.played),
		parkourFinishes: readCount(parkour.finishes),
		parkourWins: readCount(parkour.wins),
		parkourBestTimeMs: readCount(parkour.bestTimeMs),
		errandsAccepted: readCount(errands.accepted),
		errandsCompleted: readCount(errands.completed)
	};

	if (Object.values(numbers).some((entry) => entry === null)) {
		return null;
	}

	return {
		version: 2,
		playerId,
		createdAt,
		updatedAt,
		missions: {
			cats: {
				played: numbers.catsPlayed!,
				completed: numbers.catsCompleted!,
				catsFound: numbers.catsFound!
			},
			crypt: {
				played: numbers.cryptPlayed!,
				completed: numbers.cryptCompleted!,
				failed: numbers.cryptFailed!,
				deaths: numbers.cryptDeaths!
			},
			barn: {
				played: numbers.barnPlayed!,
				completed: numbers.barnCompleted!,
				failed: numbers.barnFailed!,
				deaths: numbers.barnDeaths!,
				kills: numbers.barnKills!,
				waves: numbers.barnWaves!,
				bestWave: numbers.barnBestWave!
			},
			race: {
				played: numbers.racePlayed!,
				finished: numbers.raceFinished!,
				won: numbers.raceWon!,
				laps: numbers.raceLaps!,
				deaths: numbers.raceDeaths!,
				podiums: numbers.racePodiums!
			},
			royale: {
				matches: numbers.royaleMatches!,
				finished: numbers.royaleFinished!,
				wins: numbers.royaleWins!,
				kills: numbers.royaleKills!,
				top3: numbers.royaleTop3!,
				bestPlacement: numbers.royaleBestPlacement!
			},
			hexfire: {
				matches: numbers.hexfireMatches!,
				wins: numbers.hexfireWins!,
				kills: numbers.hexfireKills!,
				deaths: numbers.hexfireDeaths!
			},
			parkour: {
				played: numbers.parkourPlayed!,
				finishes: numbers.parkourFinishes!,
				wins: numbers.parkourWins!,
				bestTimeMs: numbers.parkourBestTimeMs!
			},
			errands: {
				accepted: numbers.errandsAccepted!,
				completed: numbers.errandsCompleted!,
				items: readItems(errands.items)
			}
		}
	};
}

async function requestJson(path: string, init: RequestInit): Promise<unknown | null> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	const headers = new Headers(init.headers);

	headers.set('accept', 'application/json');

	try {
		const response = await fetch(`${API_BASE}${path}`, {
			...init,
			signal: controller.signal,
			headers
		});

		if (!response.ok) {
			return null;
		}

		return await response.json().catch(() => null);
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

function authHeaders(token?: string | null): Record<string, string> {
	return token ? { authorization: `Bearer ${token}` } : {};
}

export type StatsProfile = {
	alias?: string;
	skin?: string;
};

/** Uploads a full snapshot; the backend merges it with `$max`. */
export async function putStats(
	playerId: string,
	data: StatsData,
	token?: string | null,
	profile?: StatsProfile
): Promise<StatsData | null> {
	const payload = await requestJson(`/${encodeURIComponent(playerId)}`, {
		method: 'PUT',
		headers: { 'content-type': 'application/json', ...authHeaders(token) },
		body: JSON.stringify({
			version: 2,
			playerId,
			createdAt: data.createdAt,
			updatedAt: data.updatedAt,
			...(profile?.alias ? { alias: profile.alias } : {}),
			...(profile?.skin ? { skin: profile.skin } : {}),
			missions: data.missions
		})
	});

	return asStatsData(payload, playerId);
}

/** Resets the server counters. Returns false so the store keeps the flag. */
export async function resetRemoteStats(playerId: string, token?: string | null): Promise<boolean> {
	const payload = await requestJson(`/${encodeURIComponent(playerId)}/reset`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...authHeaders(token) },
		body: '{}'
	});

	return isRecord(payload) && payload.ok === true && asStatsData(payload.stats, playerId) !== null;
}

/**
 * Merges a legacy UUID snapshot into the authenticated account (one-way,
 * `$max` on the server). Returns the merged account snapshot.
 */
export async function linkLegacyStats(
	accountId: string,
	legacyPlayerId: string,
	token?: string | null
): Promise<StatsData | null> {
	if (!token) {
		return null;
	}

	const payload = await requestJson(`/${encodeURIComponent(accountId)}/merge`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...authHeaders(token) },
		body: JSON.stringify({ fromPlayerId: legacyPlayerId })
	});

	return isRecord(payload) && payload.ok === true ? asStatsData(payload.stats, accountId) : null;
}
