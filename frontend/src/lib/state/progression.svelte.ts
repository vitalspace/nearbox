import { browser } from '$app/env';
import {
	PROGRESSION_MISSIONS,
	missionById,
	type ProgressionMissionState,
	type RewardClaimState
} from '../missions/progression.ts';

/**
 * Store de la Central de progresión (SPEC-045).
 *
 * El servidor (Mongo) es la fuente de verdad; `localStorage` solo guarda una
 * caché del último snapshot y la cola de encargos pendientes. Un fallo de red
 * nunca borra la caché ni bloquea el HUD.
 */

export type ProgressionStatsSnapshot = {
	reported: unknown;
	attested: unknown;
};

export type ProgressionSnapshot = {
	version: 1;
	playerId: string;
	accountId: string | null;
	stats: ProgressionStatsSnapshot;
	missions: ProgressionMissionState[];
	claims: RewardClaimState[];
	ownedCatalogIds: string[];
	ownershipUnverified?: boolean;
	serverTime: number;
};

type ProgressionCache = {
	version: 1;
	playerId: string;
	snapshot: ProgressionSnapshot | null;
	pendingErrands: Record<string, string[]>;
	/** Misiones ya anunciadas, para no repetir el banner al recargar. */
	notifiedCompleted: string[];
	/** La migración de `rw:missions:v1` ya se envió al servidor. */
	legacySent: boolean;
	updatedAt: number;
};

export type ProgressionSyncState = 'idle' | 'syncing' | 'synced' | 'offline';

const STORAGE_KEY = 'rw:progression:v1';
const API_BASE = '/api/progression';
const REWARDS_BASE = '/api/rewards';
const TIMEOUT_MS = 8_000;
const REFRESH_DEBOUNCE_MS = 700;
const NOTICE_MS = 6_000;

class ProgressionApiError extends Error {
	readonly status: number;
	readonly code: string;

	constructor(status: number, code: string, message: string) {
		super(message);
		this.name = 'ProgressionApiError';
		this.status = status;
		this.code = code;
	}
}

function readCache(): ProgressionCache | null {
	if (!browser) return null;

	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;

		const value: unknown = JSON.parse(raw);
		if (!value || typeof value !== 'object') return null;

		const record = value as Record<string, unknown>;
		if (record.version !== 1 || typeof record.playerId !== 'string') return null;

		const snapshot =
			record.snapshot && typeof record.snapshot === 'object'
				? (record.snapshot as ProgressionSnapshot)
				: null;
		const pendingErrands: Record<string, string[]> = {};

		if (record.pendingErrands && typeof record.pendingErrands === 'object') {
			for (const [missionId, ids] of Object.entries(record.pendingErrands)) {
				if (!Array.isArray(ids)) continue;
				pendingErrands[missionId] = [
					...new Set(ids.filter((id): id is string => typeof id === 'string'))
				];
			}
		}

		const notifiedCompleted = Array.isArray(record.notifiedCompleted)
			? record.notifiedCompleted.filter((id): id is string => typeof id === 'string')
			: [];

		return {
			version: 1,
			playerId: record.playerId,
			snapshot,
			pendingErrands,
			notifiedCompleted,
			legacySent: record.legacySent === true,
			updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : 0
		};
	} catch {
		return null;
	}
}

function emptySnapshot(playerId: string): ProgressionSnapshot {
	return {
		version: 1,
		playerId,
		accountId: playerId,
		stats: { reported: {}, attested: {} },
		missions: PROGRESSION_MISSIONS.map((mission) => ({
			missionId: mission.id,
			status: mission.tier === 'T0' && !mission.unlock.nft ? 'available' : 'locked',
			value: 0,
			target:
				mission.objective.type === 'collect'
					? mission.objective.objectiveIds.length
					: mission.objective.target,
			collectedIds: [],
			lockedReason: mission.tier === 'T0' && !mission.unlock.nft ? null : 'Progress is syncing',
			completedAt: null,
			claimedAt: null,
			claim: null
		})),
		claims: [],
		ownedCatalogIds: [],
		serverTime: 0
	};
}

async function identityToken(): Promise<string | null> {
	try {
		const { authSession } = await import('./auth.svelte.ts');
		return await authSession.apiToken();
	} catch {
		return null;
	}
}

function errorMessage(cause: unknown): string {
	return cause instanceof Error ? cause.message : String(cause);
}

/** `rw:missions:v1` → misiones de progresión (SPEC-045 §11.10). */
const LEGACY_MISSION_MAP: Readonly<Record<string, readonly string[]>> = {
	'race-5-laps': ['gp-first'],
	'barn-8-waves': ['barn-first'],
	'royale-first-win': ['royale-first'],
	'hexfire-first-win': ['hexfire-first'],
	'parkour-summit': ['parkour-first'],
	'crypt-5-skulls': ['crypt-first'],
	'cats-25': ['cats-first', 'cats-25']
};

type LegacyImport = {
	completed: string[];
	errands: Record<string, string[]>;
};

function readJsonRecord(key: string): Record<string, unknown> | null {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		const value: unknown = JSON.parse(raw);
		return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

/** Acepta el registro por jugador y una variante plana por si cambia el formato. */
function playerMissions(
	record: Record<string, unknown> | null,
	playerId: string
): Record<string, unknown>[] {
	if (!record) return [];

	const players = record.players;
	let missions: unknown = null;

	if (players && typeof players === 'object') {
		const entry = (players as Record<string, unknown>)[playerId];
		if (entry && typeof entry === 'object') {
			missions = (entry as Record<string, unknown>).missions;
		}
	}

	if (!missions && record[playerId] && typeof record[playerId] === 'object') {
		missions = (record[playerId] as Record<string, unknown>).missions;
	}

	if (!missions) missions = record.missions;

	if (!missions || typeof missions !== 'object') return [];

	return Object.values(missions as Record<string, unknown>).filter(
		(value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object'
	);
}

function readLegacyImport(legacyPlayerId: string): LegacyImport {
	const completed = new Set<string>();
	const errands: Record<string, string[]> = {};

	if (!browser || !legacyPlayerId) {
		return { completed: [], errands };
	}

	// Gatos y victorias de minijuego (`rw:missions:v1`).
	for (const entry of playerMissions(readJsonRecord('rw:missions:v1'), legacyPlayerId)) {
		const missionId = typeof entry.missionId === 'string' ? entry.missionId : '';
		if (entry.status !== 'completed' || !missionId) continue;

		for (const mapped of LEGACY_MISSION_MAP[missionId] ?? []) {
			completed.add(mapped);
		}
	}

	// Encargos de SPEC-035 (`rw:npc-missions:v1`), si existen en este navegador.
	for (const entry of playerMissions(readJsonRecord('rw:npc-missions:v1'), legacyPlayerId)) {
		const missionId = typeof entry.missionId === 'string' ? entry.missionId : '';
		const mission = missionById(missionId);

		if (!mission || mission.objective.type !== 'collect') continue;
		if (entry.status !== 'completed') continue;

		errands[missionId] = mission.objective.objectiveIds.filter(
			(id): id is string => typeof id === 'string'
		);
	}

	return { completed: [...completed], errands };
}

class ProgressionStore {
	playerId = $state('');
	snapshot = $state<ProgressionSnapshot | null>(null);
	loading = $state(false);
	offline = $state(false);
	error = $state<string | null>(null);
	notice = $state<string | null>(null);
	syncState = $state<ProgressionSyncState>('idle');
	claiming = $state<string[]>([]);
	pendingErrands = $state<Record<string, string[]>>({});

	private initialized = false;
	private inFlight: Promise<void> | null = null;
	private refreshTimer: ReturnType<typeof setTimeout> | null = null;
	private noticeTimer: ReturnType<typeof setTimeout> | null = null;
	private tokenGetter: (() => Promise<string | null>) | null = null;
	private notifiedCompleted = new Set<string>();
	private sawServerSnapshot = false;
	private legacySent = false;
	private legacyCompleted: string[] = [];

	private onStorage = (event: StorageEvent): void => {
		if (event.key !== STORAGE_KEY || !this.playerId) return;

		const cache = readCache();
		if (!cache || cache.playerId !== this.playerId) return;

		if (cache.snapshot) this.snapshot = cache.snapshot;
		this.pendingErrands = cache.pendingErrands;
	};

	private onOnline = (): void => {
		this.offline = false;
		this.scheduleRefresh(0);
	};

	private onVisibility = (): void => {
		if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
			this.scheduleRefresh();
		}
	};

	get missions(): ProgressionMissionState[] {
		return this.snapshot?.missions ?? [];
	}

	get completedCount(): number {
		return this.missions.filter(
			(state) => state.status === 'completed' || state.status === 'claimed'
		).length;
	}

	get claimedCount(): number {
		return this.missions.filter((state) => state.status === 'claimed').length;
	}

	get claimableCount(): number {
		return this.missions.filter((state) => {
			if (state.status !== 'completed') return false;
			const mission = missionById(state.missionId);
			return mission?.reward != null && !state.claim;
		}).length;
	}

	get totalCount(): number {
		return PROGRESSION_MISSIONS.length;
	}

	get percent(): number {
		return this.totalCount > 0 ? Math.round((this.completedCount / this.totalCount) * 100) : 0;
	}

	get syncLabel(): string {
		if (this.loading || this.syncState === 'syncing') return 'Syncing…';
		if (this.offline || this.syncState === 'offline') return 'Offline · showing cache';
		if (this.syncState === 'synced') return 'Synced with the server';
		return 'Local cache';
	}

	missionState(missionId: string): ProgressionMissionState | null {
		return this.snapshot?.missions.find((state) => state.missionId === missionId) ?? null;
	}

	isClaiming(missionId: string): boolean {
		return this.claiming.includes(missionId);
	}

	init(
		playerId: string,
		options: { getToken?: () => Promise<string | null>; legacyPlayerId?: string } = {}
	): void {
		if (!browser || !playerId) return;

		this.tokenGetter = options.getToken ?? null;

		if (this.initialized && this.playerId === playerId) {
			this.scheduleRefresh(0);
			return;
		}

		this.clearTimers();
		this.playerId = playerId;
		this.notifiedCompleted = new Set();
		this.sawServerSnapshot = false;
		this.legacySent = false;
		this.legacyCompleted = [];

		const cache = readCache();

		if (cache && cache.playerId === playerId) {
			this.snapshot = cache.snapshot;
			this.pendingErrands = cache.pendingErrands;
			this.notifiedCompleted = new Set(cache.notifiedCompleted);
			this.legacySent = cache.legacySent;
			this.sawServerSnapshot = Boolean(cache.snapshot);
			this.offline = false;
		} else {
			this.snapshot = emptySnapshot(playerId);
			this.pendingErrands = {};
		}

		if (!this.legacySent) {
			const legacy = readLegacyImport(options.legacyPlayerId ?? playerId);
			this.legacyCompleted = legacy.completed;

			for (const [missionId, ids] of Object.entries(legacy.errands)) {
				const union = new Set([...(this.pendingErrands[missionId] ?? []), ...ids]);
				this.pendingErrands = {
					...this.pendingErrands,
					[missionId]: [...union]
				};
			}
		}

		this.initialized = true;
		this.error = null;
		this.syncState = 'idle';

		window.removeEventListener('storage', this.onStorage);
		window.removeEventListener('online', this.onOnline);
		document.removeEventListener('visibilitychange', this.onVisibility);

		window.addEventListener('storage', this.onStorage);
		window.addEventListener('online', this.onOnline);
		document.addEventListener('visibilitychange', this.onVisibility);

		this.scheduleRefresh(0);
	}

	destroy(): void {
		if (!browser) return;

		this.clearTimers();
		window.removeEventListener('storage', this.onStorage);
		window.removeEventListener('online', this.onOnline);
		document.removeEventListener('visibilitychange', this.onVisibility);
		this.initialized = false;
	}

	scheduleRefresh(delay = REFRESH_DEBOUNCE_MS): void {
		if (!browser || !this.playerId) return;

		if (this.refreshTimer) clearTimeout(this.refreshTimer);

		this.refreshTimer = setTimeout(() => {
			this.refreshTimer = null;
			void this.refresh();
		}, delay);
	}

	async refresh(): Promise<void> {
		if (!browser || !this.playerId) return;
		if (this.inFlight) return await this.inFlight;

		this.inFlight = (async () => {
			this.loading = true;
			this.syncState = 'syncing';

			try {
				const token = await this.resolveToken();
				const payload = await this.request<ProgressionSnapshot>(
					`${API_BASE}/${encodeURIComponent(this.playerId)}`,
					{ method: 'GET' },
					token
				);

				if (payload.playerId !== this.playerId) return;

				const initial = !this.sawServerSnapshot;

				this.snapshot = payload;
				this.sawServerSnapshot = true;
				this.offline = false;
				this.error = null;
				this.syncState = 'synced';
				this.announceCompletions(payload, initial);
				this.writeCache();

				if (
					Object.keys(this.pendingErrands).length > 0 ||
					(!this.legacySent && this.legacyCompleted.length > 0)
				) {
					void this.syncNow();
				}
			} catch (cause) {
				this.offline = true;
				this.syncState = 'offline';

				if (!this.snapshot) {
					this.error = 'Could not load your progress. Playing offline.';
				}

				if (cause instanceof ProgressionApiError && cause.status === 401) {
					this.error = 'Sign in to sync your Central.';
				}
			} finally {
				this.loading = false;
				this.inFlight = null;
			}
		})();

		return await this.inFlight;
	}

	async accept(missionId: string): Promise<void> {
		const state = this.missionState(missionId);
		if (!state) return;

		state.status = 'active';

		try {
			await this.request(
				`${API_BASE}/${encodeURIComponent(this.playerId)}/missions/${encodeURIComponent(missionId)}/accept`,
				{ method: 'POST' },
				await this.resolveToken()
			);
			this.error = null;
		} catch (cause) {
			if (cause instanceof ProgressionApiError && cause.status !== 401) {
				this.error = 'Could not accept the mission.';
			}
			this.scheduleRefresh(0);
		}
	}

	async abandon(missionId: string): Promise<void> {
		const state = this.missionState(missionId);
		if (!state) return;

		state.status = 'available';
		state.collectedIds = [];

		try {
			await this.request(
				`${API_BASE}/${encodeURIComponent(this.playerId)}/missions/${encodeURIComponent(missionId)}/abandon`,
				{ method: 'POST' },
				await this.resolveToken()
			);
			this.error = null;
		} catch {
			this.scheduleRefresh(0);
		}
	}

	async progressErrand(missionId: string, collectedIds: readonly string[]): Promise<void> {
		if (!this.playerId || collectedIds.length === 0) return;

		const state = this.missionState(missionId);
		const union = new Set([...(this.pendingErrands[missionId] ?? []), ...collectedIds]);

		this.pendingErrands = { ...this.pendingErrands, [missionId]: [...union] };

		if (state) {
			state.collectedIds = [...new Set([...state.collectedIds, ...collectedIds])];
			if (state.status === 'available' || state.status === 'locked') {
				state.status = 'active';
			}
			state.value = state.collectedIds.length;
		}

		this.writeCache();

		try {
			await this.request(
				`${API_BASE}/${encodeURIComponent(this.playerId)}/missions/${encodeURIComponent(missionId)}/progress`,
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ collectedIds: [...collectedIds] })
				},
				await this.resolveToken()
			);

			this.clearPending(missionId, collectedIds);
		} catch {
			// La cola se reintenta en `syncNow`; no se pierde el progreso local.
			this.offline = true;
		}
	}

	async syncNow(): Promise<void> {
		if (!browser || !this.playerId) return;
		if (this.loading) return;

		const errands = Object.entries(this.pendingErrands)
			.filter(([, ids]) => ids.length > 0)
			.map(([missionId, ids]) => ({ missionId, collectedIds: ids }));
		const legacyCompleted = this.legacySent ? [] : this.legacyCompleted;

		if (errands.length === 0 && legacyCompleted.length === 0) {
			if (!this.legacySent && Object.keys(this.pendingErrands).length === 0) {
				// Nada que migrar: no vuelvas a leer el almacenamiento local.
				this.legacySent = true;
				this.writeCache();
			}

			this.scheduleRefresh();
			return;
		}

		this.syncState = 'syncing';

		try {
			await this.request(
				`${API_BASE}/${encodeURIComponent(this.playerId)}/sync`,
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						errands,
						...(legacyCompleted.length > 0 ? { legacyCompleted } : {})
					})
				},
				await this.resolveToken()
			);

			for (const errand of errands) {
				this.clearPending(errand.missionId, errand.collectedIds);
			}

			this.legacySent = true;
			this.legacyCompleted = [];
			this.offline = false;
			this.writeCache();
			this.scheduleRefresh(0);
		} catch {
			this.offline = true;
			this.syncState = 'offline';
		}
	}

	/** Devuelve los encargos no completados a `available`; nunca toca reclamos. */
	async resetErrands(): Promise<void> {
		const targets = this.missions.filter((state) => {
			if (state.status === 'completed' || state.status === 'claimed') return false;
			const mission = missionById(state.missionId);
			return mission?.objective.type === 'collect';
		});

		this.pendingErrands = {};

		for (const state of targets) {
			await this.abandon(state.missionId);
		}

		this.showNotice('Errands reset. Claimed rewards are kept.');
		this.writeCache();
	}

	async claim(
		missionId: string,
		accountId: string,
		publicKey: string
	): Promise<{ minted: boolean; alreadyClaimed: boolean } | null> {
		if (!browser || !this.playerId) return null;
		if (this.isClaiming(missionId)) return null;

		const token = await this.resolveToken();

		if (!token) {
			this.error = 'Sign in to claim rewards.';
			return null;
		}

		this.claiming = [...this.claiming, missionId];
		this.error = null;

		try {
			const response = await this.request<{
				claim: RewardClaimState;
				minted: boolean;
				alreadyClaimed: boolean;
			}>(
				`${REWARDS_BASE}/claim`,
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						accountId,
						// En modo wallet la prueba de propiedad va dentro del token
						// NEP-413; el backend no necesita publicKey.
						publicKey: publicKey || undefined,
						missionId,
						token,
						request_id: crypto.randomUUID()
					})
				},
				token
			);

			this.applyClaim(
				missionId,
				response.claim,
				response.minted ? 'minted' : response.claim.status
			);
			this.showNotice(
				response.minted
					? `Reward claimed: ${this.rewardLabel(missionId)}${response.claim.serial != null ? ` #${response.claim.serial}` : ''}`
					: 'Already owned: this reward is already in your wallet.'
			);

			if (response.minted || response.claim.status === 'already-owned') {
				void this.refreshNftOwnership();
			}

			return {
				minted: response.minted,
				alreadyClaimed: response.alreadyClaimed
			};
		} catch (cause) {
			if (cause instanceof ProgressionApiError) {
				if (cause.code === 'REWARD_CAPACITY') {
					this.showNotice('Reward capacity reached; your claim is saved.');
				} else if (cause.status === 401) {
					this.error = 'Sign in to claim rewards.';
				} else {
					this.error = cause.message || 'Could not claim the reward.';
				}
			} else {
				this.error = 'Could not claim the reward.';
			}

			return null;
		} finally {
			this.claiming = this.claiming.filter((id) => id !== missionId);
		}
	}

	showNotice(message: string): void {
		this.notice = message;

		if (this.noticeTimer) clearTimeout(this.noticeTimer);

		this.noticeTimer = setTimeout(() => {
			this.notice = null;
			this.noticeTimer = null;
		}, NOTICE_MS);
	}

	/**
	 * Avisa de las misiones que acaban de completarse, una sola vez.
	 * La primera carga solo siembra el estado: no repite el historial.
	 */
	private announceCompletions(snapshot: ProgressionSnapshot, initial: boolean): void {
		const completed = snapshot.missions
			.filter((state) => state.status === 'completed' || state.status === 'claimed')
			.map((state) => state.missionId);

		if (initial) {
			for (const missionId of completed) this.notifiedCompleted.add(missionId);
			return;
		}

		const fresh = completed.filter((missionId) => !this.notifiedCompleted.has(missionId));

		for (const missionId of fresh) this.notifiedCompleted.add(missionId);

		if (fresh.length === 0) return;

		const mission = missionById(fresh[0]);
		const suffix = fresh.length > 1 ? ` (+${fresh.length - 1} more)` : '';
		this.showNotice(`Mission complete: ${mission?.title ?? 'Challenge'}${suffix}`);
	}

	private async refreshNftOwnership(): Promise<void> {
		try {
			const { nftOwnership } = await import('./nftOwnership.svelte.ts');
			await nftOwnership.refresh(true);
		} catch {
			// Sin RPC, la caché local sigue mostrando el NFT en la próxima carga.
		}
	}

	private applyClaim(
		missionId: string,
		claim: RewardClaimState,
		status: 'minted' | RewardClaimState['status']
	): void {
		const snapshot = this.snapshot;
		if (!snapshot) return;

		const mission = snapshot.missions.find((state) => state.missionId === missionId);
		if (!mission) return;

		mission.claim = claim;
		mission.status = status === 'minted' || status === 'already-owned' ? 'claimed' : 'completed';

		if (mission.status === 'claimed') {
			mission.claimedAt = claim.updatedAt || Date.now();
		}

		snapshot.claims = [...snapshot.claims.filter((entry) => entry.missionId !== missionId), claim];

		this.writeCache();
	}

	private rewardLabel(missionId: string): string {
		const mission = missionById(missionId);
		return mission?.reward?.label ?? 'Reward';
	}

	private clearPending(missionId: string, ids: readonly string[]): void {
		const remaining = (this.pendingErrands[missionId] ?? []).filter((id) => !ids.includes(id));
		const next = { ...this.pendingErrands };

		if (remaining.length > 0) {
			next[missionId] = remaining;
		} else {
			delete next[missionId];
		}

		this.pendingErrands = next;
		this.writeCache();
	}

	private writeCache(): void {
		if (!browser || !this.playerId) return;

		try {
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({
					version: 1,
					playerId: this.playerId,
					snapshot: this.snapshot,
					pendingErrands: this.pendingErrands,
					notifiedCompleted: [...this.notifiedCompleted],
					legacySent: this.legacySent,
					updatedAt: Date.now()
				} satisfies ProgressionCache)
			);
		} catch {
			// Sin almacenamiento: el snapshot en memoria sigue funcionando.
		}
	}

	private async resolveToken(): Promise<string | null> {
		if (this.tokenGetter) {
			try {
				return await this.tokenGetter();
			} catch {
				return null;
			}
		}

		return await identityToken();
	}

	private async request<T = unknown>(
		path: string,
		init: RequestInit,
		token: string | null
	): Promise<T> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

		try {
			const headers = new Headers(init.headers);

			if (token) headers.set('authorization', `Bearer ${token}`);

			const response = await fetch(path, {
				...init,
				headers,
				signal: controller.signal
			});
			const text = await response.text();
			let body: unknown = null;

			if (text.length > 0) {
				try {
					body = JSON.parse(text);
				} catch {
					body = text;
				}
			}

			if (!response.ok) {
				const record = (body ?? {}) as Record<string, unknown>;
				const message =
					typeof record.message === 'string'
						? record.message
						: `Request failed with HTTP ${response.status}`;
				const code = typeof record.error === 'string' ? record.error : 'PROGRESSION_REQUEST_FAILED';

				throw new ProgressionApiError(response.status, code, message);
			}

			return body as T;
		} finally {
			clearTimeout(timer);
		}
	}

	private clearTimers(): void {
		if (this.refreshTimer) {
			clearTimeout(this.refreshTimer);
			this.refreshTimer = null;
		}

		if (this.noticeTimer) {
			clearTimeout(this.noticeTimer);
			this.noticeTimer = null;
		}
	}
}

export const progression = new ProgressionStore();
