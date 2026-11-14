import { browser } from '$app/env';
import { isSkinId, type SkinId } from '../cosmetics/skinIds';

const API_BASE = '/api/stats';
const CACHE_MS = 20_000;
const TIMEOUT_MS = 6_000;

/**
 * Una fila del Top global. El servidor solo expone el alias/skin públicos y
 * los contadores necesarios para pintar el podio.
 */
export type LeaderboardEntry = {
	playerId: string;
	alias: string | null;
	skin: SkinId | null;
	/** Misiones completadas (cats + crypt + barn + carreras ganadas). */
	score: number;
	kills: number;
	updatedAt: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function readCount(value: unknown): number | null {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return null;
	}

	return Math.max(0, Math.floor(value));
}

function readEntry(value: unknown): LeaderboardEntry | null {
	if (!isRecord(value) || typeof value.playerId !== 'string') {
		return null;
	}

	const score = readCount(value.score);
	const kills = readCount(value.kills);

	if (score === null || kills === null) {
		return null;
	}

	const alias =
		typeof value.alias === 'string' && value.alias.trim().length > 0
			? value.alias.trim().slice(0, 24)
			: null;
	const skin = isSkinId(value.skin) ? value.skin : null;
	const updatedAt =
		typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt) ? value.updatedAt : 0;

	return { playerId: value.playerId, alias, skin, score, kills, updatedAt };
}

class LeaderboardStore {
	entries = $state<LeaderboardEntry[]>([]);
	loading = $state(false);
	error = $state<string | null>(null);
	lastLoadedAt = $state(0);

	private inFlight: Promise<void> | null = null;

	/**
	 * Loads the global Top. `force` bypasses the short cache used to avoid
	 * hammering the API when the map mounts/unmounts repeatedly.
	 */
	load(limit = 3, force = false): Promise<void> {
		if (!browser) {
			return Promise.resolve();
		}

		if (!force && Date.now() - this.lastLoadedAt < CACHE_MS) {
			return Promise.resolve();
		}

		if (this.inFlight) {
			return this.inFlight;
		}

		this.loading = true;
		this.error = null;

		const request = this.fetchTop(limit)
			.then((entries) => {
				this.entries = entries;
				this.lastLoadedAt = Date.now();
			})
			.catch((cause: unknown) => {
				this.error = cause instanceof Error ? cause.message : 'Leaderboard unavailable';
			})
			.finally(() => {
				this.loading = false;
				this.inFlight = null;
			});

		this.inFlight = request;

		return request;
	}

	refresh(limit = 3): Promise<void> {
		return this.load(limit, true);
	}

	private async fetchTop(limit: number): Promise<LeaderboardEntry[]> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

		try {
			const response = await fetch(
				`${API_BASE}/leaderboard?limit=${encodeURIComponent(String(limit))}`,
				{
					headers: { accept: 'application/json' },
					signal: controller.signal
				}
			);

			if (!response.ok) {
				throw new Error(`Leaderboard request failed (${response.status})`);
			}

			const payload: unknown = await response.json();
			const players = isRecord(payload) && Array.isArray(payload.players) ? payload.players : [];

			return players
				.map(readEntry)
				.filter((entry): entry is LeaderboardEntry => entry !== null)
				.slice(0, Math.max(1, limit));
		} finally {
			clearTimeout(timer);
		}
	}
}

export const leaderboard = new LeaderboardStore();
