import { browser } from '$app/env';
import { playerProfile } from './playerProfile.svelte';
import { linkLegacyStats, putStats, resetRemoteStats, type StatsSyncState } from './statsApi';

const STORAGE_KEY = 'rw:stats:v1';
const SYNC_KEY = 'rw:stats:sync:v1';
const LINK_KEY = 'rw:stats:link:v1';
const SYNC_DELAY_MS = 700;
const RETRY_DELAY_MS = 15_000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Las cuentas (`t-<handle>.testnet`) no son UUID y exigen JWT. */
function isAccountId(playerId: string): boolean {
	return playerId !== '' && !UUID_PATTERN.test(playerId);
}

export type MissionStats = {
	played: number;
	completed: number;
	failed: number;
};

export type CatsStats = {
	played: number;
	completed: number;
	catsFound: number;
};

export type CryptStats = MissionStats & {
	deaths: number;
};

export type BarnStats = MissionStats & {
	deaths: number;
	kills: number;
	waves: number;
	bestWave: number;
};

export type RaceStats = {
	played: number;
	finished: number;
	won: number;
	laps: number;
	deaths: number;
	podiums: number;
};

export type RoyaleStats = {
	matches: number;
	finished: number;
	wins: number;
	kills: number;
	top3: number;
	bestPlacement: number;
};

export type HexfireStats = {
	matches: number;
	wins: number;
	kills: number;
	deaths: number;
};

export type ParkourStats = {
	played: number;
	finishes: number;
	wins: number;
	bestTimeMs: number;
};

export type ErrandsStats = {
	accepted: number;
	completed: number;
	items: Record<string, string[]>;
};

export type StatsMissions = {
	cats: CatsStats;
	crypt: CryptStats;
	barn: BarnStats;
	race: RaceStats;
	royale: RoyaleStats;
	hexfire: HexfireStats;
	parkour: ParkourStats;
	errands: ErrandsStats;
};

export type StatsData = {
	version: 2;
	playerId: string;
	createdAt: number;
	updatedAt: number;
	missions: StatsMissions;
};

export type MissionKind = 'cats' | 'crypt' | 'barn' | 'race';
export type DeathKind = 'crypt' | 'barn' | 'race';

function emptyMission(): MissionStats {
	return { played: 0, completed: 0, failed: 0 };
}

function emptyStats(playerId = '', now = Date.now()): StatsData {
	return {
		version: 2,
		playerId,
		createdAt: now,
		updatedAt: now,
		missions: {
			cats: { played: 0, completed: 0, catsFound: 0 },
			crypt: { ...emptyMission(), deaths: 0 },
			barn: { ...emptyMission(), deaths: 0, kills: 0, waves: 0, bestWave: 0 },
			race: { played: 0, finished: 0, won: 0, laps: 0, deaths: 0, podiums: 0 },
			royale: { matches: 0, finished: 0, wins: 0, kills: 0, top3: 0, bestPlacement: 0 },
			hexfire: { matches: 0, wins: 0, kills: 0, deaths: 0 },
			parkour: { played: 0, finishes: 0, wins: 0, bestTimeMs: 0 },
			errands: { accepted: 0, completed: 0, items: {} }
		}
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

/** Reads a non-negative integer, falling back to 0 for corrupted saves. */
function count(value: unknown): number {
	return isFiniteNumber(value) ? Math.max(0, Math.floor(value)) : 0;
}

function readMission(value: unknown): MissionStats {
	if (!isRecord(value)) {
		return emptyMission();
	}

	return {
		played: count(value.played),
		completed: count(value.completed),
		failed: count(value.failed)
	};
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

function readStats(value: unknown, playerId: string): StatsData {
	const fallback = emptyStats(playerId);

	if (
		!isRecord(value) ||
		(value.version !== 1 && value.version !== 2) ||
		value.playerId !== playerId
	) {
		return fallback;
	}

	const missions = isRecord(value.missions) ? value.missions : {};
	const cats = isRecord(missions.cats) ? missions.cats : {};
	const crypt = isRecord(missions.crypt) ? missions.crypt : {};
	const barn = isRecord(missions.barn) ? missions.barn : {};
	const race = isRecord(missions.race) ? missions.race : {};
	const royale = isRecord(missions.royale) ? missions.royale : {};
	const hexfire = isRecord(missions.hexfire) ? missions.hexfire : {};
	const parkour = isRecord(missions.parkour) ? missions.parkour : {};
	const errands = isRecord(missions.errands) ? missions.errands : {};
	const now = Date.now();

	return {
		version: 2,
		playerId,
		createdAt: isFiniteNumber(value.createdAt) ? value.createdAt : now,
		updatedAt: isFiniteNumber(value.updatedAt) ? value.updatedAt : now,
		missions: {
			cats: {
				...readMission(cats),
				catsFound: count(cats.catsFound)
			},
			crypt: {
				...readMission(crypt),
				deaths: count(crypt.deaths)
			},
			barn: {
				...readMission(barn),
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
		}
	};
}

function readRawStorage(): unknown {
	if (!browser) {
		return null;
	}

	try {
		const raw = localStorage.getItem(STORAGE_KEY);

		return raw ? JSON.parse(raw) : null;
	} catch (error) {
		console.warn('[stats] Could not read the local stats', error);

		return null;
	}
}

/** Reads the saved snapshot only when it belongs to `playerId`. */
function readSavedStats(playerId: string): StatsData | null {
	const raw = readRawStorage();

	if (!isRecord(raw) || raw.playerId !== playerId) {
		return null;
	}

	return readStats(raw, playerId);
}

type LinkMarkers = Record<string, string>;

function readLinkMarkers(): LinkMarkers {
	if (!browser) {
		return {};
	}

	try {
		const raw = localStorage.getItem(LINK_KEY);

		if (!raw) {
			return {};
		}

		const value: unknown = JSON.parse(raw);
		const markers: LinkMarkers = {};

		if (isRecord(value)) {
			for (const [accountId, legacyId] of Object.entries(value)) {
				if (typeof legacyId === 'string' && legacyId !== '') {
					markers[accountId] = legacyId;
				}
			}
		}

		return markers;
	} catch {
		return {};
	}
}

function isLegacyLinked(accountId: string, legacyId: string): boolean {
	return legacyId !== '' && readLinkMarkers()[accountId] === legacyId;
}

function markLegacyLinked(accountId: string, legacyId: string): void {
	if (!browser || !accountId || !legacyId) {
		return;
	}

	try {
		const markers = readLinkMarkers();

		markers[accountId] = legacyId;
		localStorage.setItem(LINK_KEY, JSON.stringify(markers));
	} catch (error) {
		console.warn('[stats] Could not save the legacy link marker', error);
	}
}

function writeStorage(data: StatsData): void {
	if (!browser || !data.playerId) {
		return;
	}

	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
	} catch (error) {
		console.warn('[stats] Could not save the local stats', error);
	}
}

type PendingReset = {
	playerId: string;
	pendingReset: boolean;
};

function readPendingReset(playerId: string): boolean {
	if (!browser) {
		return false;
	}

	try {
		const raw = localStorage.getItem(SYNC_KEY);

		if (!raw) {
			return false;
		}

		const value: unknown = JSON.parse(raw);

		return isRecord(value) && value.playerId === playerId && value.pendingReset === true;
	} catch {
		return false;
	}
}

function writePendingReset(playerId: string, pendingReset: boolean): void {
	if (!browser) {
		return;
	}

	try {
		if (pendingReset) {
			const value: PendingReset = { playerId, pendingReset: true };

			localStorage.setItem(SYNC_KEY, JSON.stringify(value));
			return;
		}

		const raw = localStorage.getItem(SYNC_KEY);

		if (!raw) {
			return;
		}

		const value: unknown = JSON.parse(raw);

		if (isRecord(value) && value.playerId === playerId) {
			localStorage.removeItem(SYNC_KEY);
		}
	} catch (error) {
		console.warn('[stats] Could not save the pending sync state', error);
	}
}

function mergeItems(
	a: Record<string, string[]>,
	b: Record<string, string[]>
): Record<string, string[]> {
	const merged: Record<string, string[]> = {};

	for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
		merged[key] = [...new Set([...(a[key] ?? []), ...(b[key] ?? [])])];
	}

	return merged;
}

function lowestPositive(a: number, b: number): number {
	if (a <= 0) return b;
	if (b <= 0) return a;

	return Math.min(a, b);
}

/** Counters are monotonic, so the newest local state always wins per field. */
function mergeStats(remote: StatsData, local: StatsData): StatsData {
	const max = Math.max;

	return {
		version: 2,
		playerId: local.playerId,
		createdAt: Math.min(remote.createdAt, local.createdAt),
		updatedAt: max(remote.updatedAt, local.updatedAt),
		missions: {
			cats: {
				played: max(remote.missions.cats.played, local.missions.cats.played),
				completed: max(remote.missions.cats.completed, local.missions.cats.completed),
				catsFound: max(remote.missions.cats.catsFound, local.missions.cats.catsFound)
			},
			crypt: {
				played: max(remote.missions.crypt.played, local.missions.crypt.played),
				completed: max(remote.missions.crypt.completed, local.missions.crypt.completed),
				failed: max(remote.missions.crypt.failed, local.missions.crypt.failed),
				deaths: max(remote.missions.crypt.deaths, local.missions.crypt.deaths)
			},
			barn: {
				played: max(remote.missions.barn.played, local.missions.barn.played),
				completed: max(remote.missions.barn.completed, local.missions.barn.completed),
				failed: max(remote.missions.barn.failed, local.missions.barn.failed),
				deaths: max(remote.missions.barn.deaths, local.missions.barn.deaths),
				kills: max(remote.missions.barn.kills, local.missions.barn.kills),
				waves: max(remote.missions.barn.waves, local.missions.barn.waves),
				bestWave: max(remote.missions.barn.bestWave, local.missions.barn.bestWave)
			},
			race: {
				played: max(remote.missions.race.played, local.missions.race.played),
				finished: max(remote.missions.race.finished, local.missions.race.finished),
				won: max(remote.missions.race.won, local.missions.race.won),
				laps: max(remote.missions.race.laps, local.missions.race.laps),
				deaths: max(remote.missions.race.deaths, local.missions.race.deaths),
				podiums: max(remote.missions.race.podiums, local.missions.race.podiums)
			},
			royale: {
				matches: max(remote.missions.royale.matches, local.missions.royale.matches),
				finished: max(remote.missions.royale.finished, local.missions.royale.finished),
				wins: max(remote.missions.royale.wins, local.missions.royale.wins),
				kills: max(remote.missions.royale.kills, local.missions.royale.kills),
				top3: max(remote.missions.royale.top3, local.missions.royale.top3),
				bestPlacement: lowestPositive(
					remote.missions.royale.bestPlacement,
					local.missions.royale.bestPlacement
				)
			},
			hexfire: {
				matches: max(remote.missions.hexfire.matches, local.missions.hexfire.matches),
				wins: max(remote.missions.hexfire.wins, local.missions.hexfire.wins),
				kills: max(remote.missions.hexfire.kills, local.missions.hexfire.kills),
				deaths: max(remote.missions.hexfire.deaths, local.missions.hexfire.deaths)
			},
			parkour: {
				played: max(remote.missions.parkour.played, local.missions.parkour.played),
				finishes: max(remote.missions.parkour.finishes, local.missions.parkour.finishes),
				wins: max(remote.missions.parkour.wins, local.missions.parkour.wins),
				bestTimeMs: lowestPositive(
					remote.missions.parkour.bestTimeMs,
					local.missions.parkour.bestTimeMs
				)
			},
			errands: {
				accepted: max(remote.missions.errands.accepted, local.missions.errands.accepted),
				completed: max(remote.missions.errands.completed, local.missions.errands.completed),
				items: mergeItems(remote.missions.errands.items, local.missions.errands.items)
			}
		}
	};
}

export type StatsInitOptions = {
	/** UUID con las stats antiguas de este navegador (SPEC-042). */
	legacyPlayerId?: string;
	/** Inyectable en tests; por defecto usa el token silencioso de Auth0. */
	getToken?: () => Promise<string | null>;
};

class StatsStore {
	data = $state<StatsData>(emptyStats());
	syncState = $state<StatsSyncState>('local');
	lastSyncedAt = $state<number | null>(null);

	private initialized = false;
	private revision = 0;
	private resetEpoch = 0;
	private pendingReset = false;
	private syncInFlight = false;
	private syncAgain = false;
	private syncTimer: ReturnType<typeof setTimeout> | null = null;
	private retryTimer: ReturnType<typeof setTimeout> | null = null;
	private account = false;
	private legacyId = '';
	private legacyNeedsLink = false;
	private tokenGetter: (() => Promise<string | null>) | null = null;

	private onStorage = (event: StorageEvent): void => {
		if (!this.data.playerId) {
			return;
		}

		if (event.key === STORAGE_KEY) {
			const stored = readSavedStats(this.data.playerId);

			// Ignore snapshots from another identity (e.g. an old UUID tab).
			if (!stored) {
				return;
			}

			this.data = stored;
			this.revision += 1;
			this.scheduleSync();
			return;
		}

		if (event.key === SYNC_KEY) {
			this.pendingReset = readPendingReset(this.data.playerId);

			if (this.pendingReset) {
				this.resetEpoch += 1;
			}

			this.scheduleSync(0);
			return;
		}

		if (event.key === LINK_KEY && this.account && this.legacyId) {
			this.legacyNeedsLink = !isLegacyLinked(this.data.playerId, this.legacyId);
		}
	};

	private onOnline = (): void => {
		void this.syncNow();
	};

	private onVisibility = (): void => {
		if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
			void this.syncNow();
		}
	};

	get missionsPlayed(): number {
		const { cats, crypt, barn, race, royale, hexfire, parkour } = this.data.missions;

		return (
			cats.played +
			crypt.played +
			barn.played +
			race.played +
			royale.matches +
			hexfire.matches +
			parkour.played
		);
	}

	get missionsCompleted(): number {
		const { cats, crypt, barn, race, royale, hexfire, parkour } = this.data.missions;

		return (
			cats.completed +
			crypt.completed +
			barn.completed +
			race.won +
			royale.wins +
			hexfire.wins +
			parkour.wins
		);
	}

	get totalKills(): number {
		const { barn, royale, hexfire } = this.data.missions;

		return barn.kills + royale.kills + hexfire.kills;
	}

	get totalDeaths(): number {
		const { crypt, barn, race, hexfire } = this.data.missions;

		return crypt.deaths + barn.deaths + race.deaths + hexfire.deaths;
	}

	get racesPlayed(): number {
		return this.data.missions.race.played;
	}

	init(playerId: string, options: StatsInitOptions = {}): void {
		if (!browser || !playerId) {
			return;
		}

		const legacyId = (options.legacyPlayerId ?? '').trim();

		if (
			this.initialized &&
			this.data.playerId === playerId &&
			this.legacyId === (isAccountId(playerId) ? legacyId : '')
		) {
			return;
		}

		this.clearTimers();

		const account = isAccountId(playerId);
		const stored = readSavedStats(playerId);
		let data = stored ?? emptyStats(playerId);

		// First sync of an account: adopt the local UUID counters so the game
		// keeps working offline. The server-side merge is done in `syncNow`.
		if (account && legacyId && !isLegacyLinked(playerId, legacyId)) {
			const legacy = readSavedStats(legacyId);

			if (legacy) {
				data = mergeStats(legacy, data);
			}
		}

		this.data = data;
		this.account = account;
		this.legacyId = account ? legacyId : '';
		this.legacyNeedsLink = account && legacyId !== '' && !isLegacyLinked(playerId, legacyId);
		this.tokenGetter = options.getToken ?? null;
		this.initialized = true;
		this.revision += 1;
		this.pendingReset = readPendingReset(playerId);
		this.syncState = 'local';
		this.lastSyncedAt = null;
		writeStorage(this.data);

		// Re-init (e.g. account switch) must not stack listeners.
		window.removeEventListener('storage', this.onStorage);
		window.removeEventListener('online', this.onOnline);
		document.removeEventListener('visibilitychange', this.onVisibility);

		window.addEventListener('storage', this.onStorage);
		window.addEventListener('online', this.onOnline);
		document.addEventListener('visibilitychange', this.onVisibility);

		// Upload the local snapshot so a pre-existing `localStorage` save
		// migrates to MongoDB (the backend merges with `$max`).
		this.scheduleSync(0);
	}
	destroy(): void {
		if (!browser) {
			return;
		}

		this.clearTimers();
		window.removeEventListener('storage', this.onStorage);
		window.removeEventListener('online', this.onOnline);
		document.removeEventListener('visibilitychange', this.onVisibility);
		this.initialized = false;

		// Best-effort final flush; retries are disabled once `initialized` is false.
		if (this.data.playerId) {
			void this.syncNow();
		}
	}

	startMission(kind: MissionKind): void {
		this.update((draft) => {
			draft.missions[kind].played += 1;
		});
	}

	completeMission(kind: 'cats' | 'crypt' | 'barn'): void {
		this.update((draft) => {
			if (kind === 'cats') {
				const mode = draft.missions.cats;
				mode.completed += 1;
				mode.played = Math.max(mode.played, mode.completed);
				return;
			}

			const mode = draft.missions[kind];
			mode.completed += 1;
			// A player can join a round already in progress; never show more
			// results than runs.
			mode.played = Math.max(mode.played, mode.completed + mode.failed);
		});
	}

	failMission(kind: 'crypt' | 'barn'): void {
		this.update((draft) => {
			const mode = draft.missions[kind];
			mode.failed += 1;
			mode.played = Math.max(mode.played, mode.completed + mode.failed);
		});
	}

	recordCatCapture(): void {
		this.update((draft) => {
			draft.missions.cats.catsFound += 1;
		});
	}

	recordBarnKill(): void {
		this.update((draft) => {
			draft.missions.barn.kills += 1;
		});
	}

	recordDeath(kind: DeathKind): void {
		this.update((draft) => {
			draft.missions[kind].deaths += 1;
		});
	}

	recordLap(): void {
		this.update((draft) => {
			draft.missions.race.laps += 1;
		});
	}

	recordRaceFinish(): void {
		this.update((draft) => {
			const race = draft.missions.race;
			race.finished += 1;
			race.played = Math.max(race.played, race.finished);
		});
	}

	recordRaceWin(): void {
		this.update((draft) => {
			const race = draft.missions.race;
			race.won += 1;
			race.played = Math.max(race.played, race.finished, race.won);
		});
	}

	recordRoyaleKill(): void {
		this.update((draft) => {
			draft.missions.royale.kills += 1;
		});
	}

	recordRoyaleResult(placement: number, finished = true): void {
		this.update((draft) => {
			const royale = draft.missions.royale;

			royale.matches += 1;

			if (finished) {
				royale.finished += 1;
			}

			if (placement === 1) {
				royale.wins += 1;
			}

			if (placement >= 1 && placement <= 3) {
				royale.top3 += 1;
			}

			if (placement >= 1) {
				royale.bestPlacement =
					royale.bestPlacement === 0 ? placement : Math.min(royale.bestPlacement, placement);
			}
		});
	}

	recordHexfireKill(): void {
		this.update((draft) => {
			draft.missions.hexfire.kills += 1;
		});
	}

	recordHexfireResult(won: boolean): void {
		this.update((draft) => {
			const hexfire = draft.missions.hexfire;

			hexfire.matches += 1;

			if (won) {
				hexfire.wins += 1;
			}
		});
	}

	recordParkourFinish(timeMs: number, won = false): void {
		this.update((draft) => {
			const parkour = draft.missions.parkour;

			parkour.played += 1;
			parkour.finishes += 1;

			if (won) {
				parkour.wins += 1;
			}

			if (timeMs > 0) {
				parkour.bestTimeMs =
					parkour.bestTimeMs === 0
						? Math.round(timeMs)
						: Math.min(parkour.bestTimeMs, Math.round(timeMs));
			}
		});
	}

	recordErrandAccepted(): void {
		this.update((draft) => {
			draft.missions.errands.accepted += 1;
		});
	}

	recordErrandItem(missionId: string, collectedIds: string[]): void {
		this.update((draft) => {
			const current = draft.missions.errands.items[missionId] ?? [];

			draft.missions.errands.items[missionId] = [...new Set([...current, ...collectedIds])];
		});
	}

	recordErrandCompleted(): void {
		this.update((draft) => {
			draft.missions.errands.completed += 1;
		});
	}

	/** Pushes a snapshot when the public profile (alias/skin) changes. */
	syncProfile(): void {
		if (!this.initialized || !this.data.playerId) {
			return;
		}

		this.scheduleSync();
	}

	resetStats(): void {
		if (!this.initialized || !this.data.playerId) {
			return;
		}

		const now = Date.now();

		this.data = {
			...emptyStats(this.data.playerId, now),
			createdAt: this.data.createdAt
		};
		this.revision += 1;
		this.resetEpoch += 1;
		this.pendingReset = true;
		writeStorage(this.data);
		writePendingReset(this.data.playerId, true);

		// Reset must go through `/reset`: a zero snapshot cannot lower the
		// server counters because `PUT` uses `$max`.
		this.scheduleSync(0);
	}

	private scheduleSync(delay = SYNC_DELAY_MS): void {
		if (!browser || !this.initialized || !this.data.playerId) {
			return;
		}

		if (this.syncTimer) {
			clearTimeout(this.syncTimer);
		}

		this.syncTimer = setTimeout(() => {
			this.syncTimer = null;
			void this.syncNow();
		}, delay);
	}

	private markOffline(): void {
		this.syncState = 'offline';

		if (!this.initialized || this.retryTimer) {
			return;
		}

		this.retryTimer = setTimeout(() => {
			this.retryTimer = null;
			void this.syncNow();
		}, RETRY_DELAY_MS);
	}

	private clearTimers(): void {
		if (this.syncTimer) {
			clearTimeout(this.syncTimer);
			this.syncTimer = null;
		}

		if (this.retryTimer) {
			clearTimeout(this.retryTimer);
			this.retryTimer = null;
		}
	}

	/** Token silencioso de Auth0; un fallo se trata como offline. */
	private async resolveToken(): Promise<string | null> {
		if (!this.account) {
			return null;
		}

		if (this.tokenGetter) {
			try {
				return await this.tokenGetter();
			} catch {
				return null;
			}
		}

		try {
			const { getIdentityToken } = await import('../near/auth.ts');

			return await getIdentityToken();
		} catch {
			return null;
		}
	}

	private async syncNow(): Promise<void> {
		if (!browser || !this.data.playerId) {
			return;
		}

		if (this.syncInFlight) {
			this.syncAgain = true;
			return;
		}

		this.syncInFlight = true;
		this.syncState = 'syncing';

		const playerId = this.data.playerId;
		const revision = this.revision;
		const resetEpoch = this.resetEpoch;

		try {
			const token = this.account ? await this.resolveToken() : null;

			// Account stats cannot be written without a token. Keep everything
			// local and retry; gameplay never waits for this.
			if (this.account && !token) {
				this.markOffline();
				return;
			}

			if (this.data.playerId !== playerId) {
				this.syncAgain = true;
				return;
			}

			// One migration per account: merge the old UUID snapshot with `$max`
			// before uploading the account snapshot.
			if (this.account && this.legacyNeedsLink && this.legacyId) {
				const linked = await linkLegacyStats(playerId, this.legacyId, token);

				if (!linked) {
					this.markOffline();
					return;
				}

				this.legacyNeedsLink = false;
				markLegacyLinked(playerId, this.legacyId);
			}

			if (this.pendingReset) {
				const reset = await resetRemoteStats(playerId, token);

				if (!reset) {
					this.markOffline();
					return;
				}

				this.pendingReset = false;
				writePendingReset(playerId, false);
			}

			// The player may have changed while the reset request was in flight.
			if (this.data.playerId !== playerId) {
				this.syncAgain = true;
				return;
			}

			// The podium renders the avatar with the equipped skin, so every
			// snapshot also carries the public profile.
			const remote = await putStats(playerId, this.data, token, {
				alias: playerProfile.alias,
				skin: playerProfile.equippedSkin
			});

			if (!remote) {
				this.markOffline();
				return;
			}

			// The player changed or a reset happened while the request was in
			// flight: discard this response and let the queued sync decide.
			if (this.data.playerId !== playerId || this.resetEpoch !== resetEpoch) {
				this.syncAgain = true;
				return;
			}

			if (this.revision === revision) {
				this.data = remote;
			} else {
				// Local changes landed during the request; the response only
				// covers the older snapshot. Merge by maximum and push again.
				this.data = mergeStats(remote, this.data);
				this.syncAgain = true;
			}

			writeStorage(this.data);
			this.syncState = 'synced';
			this.lastSyncedAt = Date.now();

			if (this.retryTimer) {
				clearTimeout(this.retryTimer);
				this.retryTimer = null;
			}
		} finally {
			this.syncInFlight = false;

			if (this.syncAgain) {
				this.syncAgain = false;
				this.scheduleSync(0);
			}
		}
	}

	private update(mutator: (draft: StatsData) => void): void {
		if (!this.initialized || !this.data.playerId) {
			return;
		}

		const next: StatsData = {
			...this.data,
			updatedAt: Date.now(),
			missions: {
				cats: { ...this.data.missions.cats },
				crypt: { ...this.data.missions.crypt },
				barn: { ...this.data.missions.barn },
				race: { ...this.data.missions.race },
				royale: { ...this.data.missions.royale },
				hexfire: { ...this.data.missions.hexfire },
				parkour: { ...this.data.missions.parkour },
				errands: {
					...this.data.missions.errands,
					items: { ...this.data.missions.errands.items }
				}
			}
		};

		mutator(next);
		this.data = next;
		this.revision += 1;
		writeStorage(next);
		this.scheduleSync();
	}
}

export const stats = new StatsStore();
