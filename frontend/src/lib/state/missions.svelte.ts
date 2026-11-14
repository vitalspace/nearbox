import { browser } from '$app/env';
import {
	CAT_BY_ID,
	CAT_INDEX_BY_ID,
	CATS_25,
	MISSION_CATS_25,
	type CatDefinition
} from '../missions/cats';
import { MISSION_CRYPT_5 } from '../missions/crypt';
import { MINIGAME_MISSION_BY_ID, type MinigameMissionId } from '../missions/minigames';
import { stats } from './stats.svelte';

const STORAGE_KEY = 'rw:missions:v1';
const MISSION_ID = MISSION_CATS_25.id;
const TOAST_MS = 2600;
const COMPLETION_MS = 5200;

export type MissionStatus = 'in-progress' | 'completed';

export type MissionProgress = {
	missionId: string;
	status: MissionStatus;
	collectedIds: string[];
	startedAt: number | null;
	completedAt: number | null;
	updatedAt: number;
};

export type PlayerMissionRegistry = {
	playerId: string;
	updatedAt: number;
	missions: Record<string, MissionProgress>;
};

export type MissionRegistry = {
	version: 1;
	players: Record<string, PlayerMissionRegistry>;
};

export type MissionToast = {
	id: number;
	message: string;
};

/** Último gato capturado, para que el audio lo celebre una sola vez. */
export type CatCaptureEvent = {
	seq: number;
	catId: string;
	position: { x: number; y: number; z: number };
	completed: boolean;
};

export type CaptureResult =
	| { ok: true; cat: CatDefinition; completed: boolean }
	| { ok: false; reason: 'not-ready' | 'unknown' | 'duplicate' | 'completed' };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function emptyRegistry(): MissionRegistry {
	return { version: 1, players: {} };
}

function emptyProgress(now = Date.now()): MissionProgress {
	return {
		missionId: MISSION_ID,
		status: 'in-progress',
		collectedIds: [],
		startedAt: null,
		completedAt: null,
		updatedAt: now
	};
}

function sortCatIds(ids: Iterable<string>): string[] {
	return [...new Set(ids)]
		.filter((id) => CAT_BY_ID.has(id))
		.sort((a, b) => (CAT_INDEX_BY_ID.get(a) ?? 0) - (CAT_INDEX_BY_ID.get(b) ?? 0));
}

function normalizeProgress(value: unknown, missionId: string, now = Date.now()): MissionProgress {
	if (!isRecord(value)) {
		return missionId === MISSION_ID
			? emptyProgress(now)
			: {
					missionId,
					status: 'in-progress',
					collectedIds: [],
					startedAt: null,
					completedAt: null,
					updatedAt: now
				};
	}

	const rawIds = Array.isArray(value.collectedIds)
		? value.collectedIds.filter((id): id is string => typeof id === 'string')
		: [];
	const collectedIds = missionId === MISSION_ID ? sortCatIds(rawIds) : [...new Set(rawIds)];
	const target = missionId === MISSION_ID ? MISSION_CATS_25.target : null;
	const completed = target !== null ? collectedIds.length >= target : value.status === 'completed';
	const startedAt = isFiniteNumber(value.startedAt)
		? value.startedAt
		: collectedIds.length > 0
			? now
			: null;
	const completedAt = completed
		? isFiniteNumber(value.completedAt)
			? value.completedAt
			: now
		: null;

	return {
		missionId,
		status: completed ? 'completed' : 'in-progress',
		collectedIds,
		startedAt,
		completedAt,
		updatedAt: isFiniteNumber(value.updatedAt) ? value.updatedAt : now
	};
}

function normalizeRegistry(value: unknown): MissionRegistry {
	const registry = emptyRegistry();

	if (!isRecord(value) || value.version !== 1 || !isRecord(value.players)) {
		return registry;
	}

	for (const [playerId, rawPlayer] of Object.entries(value.players)) {
		if (!isRecord(rawPlayer) || !isRecord(rawPlayer.missions)) {
			continue;
		}

		const missions: Record<string, MissionProgress> = {};

		for (const [missionId, rawProgress] of Object.entries(rawPlayer.missions)) {
			missions[missionId] = normalizeProgress(rawProgress, missionId);
		}

		registry.players[playerId] = {
			playerId,
			updatedAt: isFiniteNumber(rawPlayer.updatedAt) ? rawPlayer.updatedAt : Date.now(),
			missions
		};
	}

	return registry;
}

function readRegistry(): MissionRegistry {
	if (!browser) {
		return emptyRegistry();
	}

	try {
		const raw = localStorage.getItem(STORAGE_KEY);

		if (!raw) {
			return emptyRegistry();
		}

		return normalizeRegistry(JSON.parse(raw));
	} catch (error) {
		console.warn('[missions] Could not read the local registry', error);

		return emptyRegistry();
	}
}

function writeRegistry(registry: MissionRegistry): void {
	if (!browser) {
		return;
	}

	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(registry));
	} catch (error) {
		console.warn('[missions] Could not save the local registry', error);
	}
}

function mergeProgress(a: MissionProgress, b: MissionProgress): MissionProgress {
	const collectedIds = sortCatIds([...a.collectedIds, ...b.collectedIds]);
	const completed = collectedIds.length >= MISSION_CATS_25.target;
	const startedAt =
		[a.startedAt, b.startedAt]
			.filter((value): value is number => value !== null)
			.sort((x, y) => x - y)[0] ?? null;
	const completedAt = completed
		? ([a.completedAt, b.completedAt]
				.filter((value): value is number => value !== null)
				.sort((x, y) => x - y)[0] ?? Date.now())
		: null;

	return {
		missionId: MISSION_ID,
		status: completed ? 'completed' : 'in-progress',
		collectedIds,
		startedAt,
		completedAt,
		updatedAt: Math.max(a.updatedAt, b.updatedAt)
	};
}

function progressEqual(a: MissionProgress, b: MissionProgress): boolean {
	return (
		a.status === b.status &&
		a.startedAt === b.startedAt &&
		a.completedAt === b.completedAt &&
		a.updatedAt === b.updatedAt &&
		a.collectedIds.length === b.collectedIds.length &&
		a.collectedIds.every((id, index) => id === b.collectedIds[index])
	);
}

class MissionStore {
	playerId = $state<string | null>(null);
	progress = $state<MissionProgress>(emptyProgress());
	nearestCatId = $state<string | null>(null);
	toast = $state<MissionToast | null>(null);
	/** Monotónico: el audio consume cada captura sin repetir el historial. */
	captureSeq = $state(0);
	lastCapture = $state<CatCaptureEvent | null>(null);
	showCompletion = $state(false);
	/** Local record of the crypt victory (reward: the mummy skin). */
	cryptCompleted = $state(false);
	cryptCompletedAt = $state<number | null>(null);
	/** Win time of every completed minigame mission, keyed by mission id. */
	completedMinigames = $state<Record<string, number>>({});
	/** Bumped on every new completion so cosmetics can resync unlocks. */
	completionSeq = $state(0);

	private initialized = false;
	private toastId = 0;
	private toastTimer: ReturnType<typeof setTimeout> | undefined;
	private completionTimer: ReturnType<typeof setTimeout> | undefined;

	private onStorage = (event: StorageEvent): void => {
		if (event.key !== STORAGE_KEY) {
			return;
		}

		this.reloadFromStorage();
	};

	get mission() {
		return MISSION_CATS_25;
	}

	get capturedCount(): number {
		return this.progress.collectedIds.length;
	}

	get completed(): boolean {
		return this.progress.status === 'completed';
	}

	get cryptMission() {
		return MISSION_CRYPT_5;
	}

	/** Whether a mission is completed for the local profile. */
	isMissionCompleted(missionId: string): boolean {
		if (missionId === MISSION_ID) {
			return this.completed;
		}

		if (missionId === MISSION_CRYPT_5.id) {
			return this.cryptCompleted;
		}

		return missionId in this.completedMinigames;
	}

	/** Display title of a mission, used by the skin unlock labels. */
	missionTitle(missionId: string): string | null {
		if (missionId === MISSION_ID) {
			return MISSION_CATS_25.title;
		}

		if (missionId === MISSION_CRYPT_5.id) {
			return MISSION_CRYPT_5.title;
		}

		return MINIGAME_MISSION_BY_ID.get(missionId)?.title ?? null;
	}

	get visibleCats(): readonly CatDefinition[] {
		return CATS_25.filter((cat) => !this.progress.collectedIds.includes(cat.id));
	}

	get nearestCat(): CatDefinition | null {
		return this.nearestCatId ? (CAT_BY_ID.get(this.nearestCatId) ?? null) : null;
	}

	init(playerId: string): void {
		if (!browser || !playerId) {
			return;
		}

		if (this.initialized && this.playerId === playerId) {
			return;
		}

		this.playerId = playerId;

		const registry = readRegistry();
		const stored = registry.players[playerId]?.missions[MISSION_ID];
		const normalized = normalizeProgress(stored, MISSION_ID);
		const storedCrypt = registry.players[playerId]?.missions[MISSION_CRYPT_5.id];
		const crypt = normalizeProgress(storedCrypt, MISSION_CRYPT_5.id);
		const completedMinigames: Record<string, number> = {};

		for (const [missionId, rawProgress] of Object.entries(
			registry.players[playerId]?.missions ?? {}
		)) {
			if (missionId === MISSION_ID) {
				continue;
			}

			const progress = normalizeProgress(rawProgress, missionId);

			if (progress.status === 'completed') {
				completedMinigames[missionId] = progress.completedAt ?? Date.now();
			}
		}

		this.progress = normalized;
		this.completedMinigames = completedMinigames;
		this.cryptCompleted = crypt.status === 'completed' || MISSION_CRYPT_5.id in completedMinigames;
		this.cryptCompletedAt = crypt.completedAt;
		this.initialized = true;

		window.addEventListener('storage', this.onStorage);
	}

	destroy(): void {
		if (!browser) {
			return;
		}

		window.removeEventListener('storage', this.onStorage);
		clearTimeout(this.toastTimer);
		clearTimeout(this.completionTimer);
		this.toast = null;
		this.showCompletion = false;
		this.nearestCatId = null;
		this.initialized = false;
	}

	isCaptured(catId: string): boolean {
		return this.progress.collectedIds.includes(catId);
	}

	setNearestCat(catId: string | null): void {
		if (this.nearestCatId === catId) {
			return;
		}

		this.nearestCatId = catId;
	}

	capture(catId: string): CaptureResult {
		if (!this.playerId) {
			return { ok: false, reason: 'not-ready' };
		}

		const cat = CAT_BY_ID.get(catId);

		if (!cat) {
			return { ok: false, reason: 'unknown' };
		}

		if (this.completed) {
			return { ok: false, reason: 'completed' };
		}

		if (this.isCaptured(catId)) {
			return { ok: false, reason: 'duplicate' };
		}

		const now = Date.now();
		const registry = readRegistry();
		const stored = registry.players[this.playerId]?.missions[MISSION_ID];
		const merged = stored ? mergeProgress(this.progress, stored) : this.progress;

		if (merged.collectedIds.includes(catId)) {
			this.progress = merged;
			this.persist(merged);

			return { ok: false, reason: 'duplicate' };
		}

		const wasCompleted = merged.status === 'completed';
		const startsRun = merged.collectedIds.length === 0;
		const collectedIds = sortCatIds([...merged.collectedIds, catId]);
		const completed = collectedIds.length >= MISSION_CATS_25.target;
		const next: MissionProgress = {
			missionId: MISSION_ID,
			status: completed ? 'completed' : 'in-progress',
			collectedIds,
			startedAt: merged.startedAt ?? now,
			completedAt: completed ? (merged.completedAt ?? now) : null,
			updatedAt: now
		};

		this.progress = next;
		this.nearestCatId = null;
		this.persist(next);
		this.captureSeq += 1;
		this.lastCapture = {
			seq: this.captureSeq,
			catId: cat.id,
			position: { ...cat.position },
			completed
		};
		this.showToast(`You caught ${cat.name} · ${collectedIds.length}/${MISSION_CATS_25.target}`);

		if (startsRun) {
			stats.startMission('cats');
		}

		stats.recordCatCapture();

		if (completed && !wasCompleted) {
			stats.completeMission('cats');
			this.showCompletionBanner();
		}

		return { ok: true, cat, completed };
	}

	/** Marks a minigame mission as won and persists the local reward. */
	completeMinigameMission(missionId: MinigameMissionId): boolean {
		return this.completeMission(missionId);
	}

	/** Marks the crypt mission as won and persists the local reward. */
	completeCryptMission(): boolean {
		return this.completeMission(MISSION_CRYPT_5.id);
	}

	private completeMission(missionId: string): boolean {
		if (!this.playerId || this.isMissionCompleted(missionId)) {
			return false;
		}

		const now = Date.now();
		const registry = readRegistry();
		const player = registry.players[this.playerId] ?? {
			playerId: this.playerId,
			updatedAt: now,
			missions: {}
		};
		const existing = player.missions[missionId];
		const progress: MissionProgress = {
			missionId,
			status: 'completed',
			collectedIds:
				missionId === MISSION_CRYPT_5.id
					? [...MISSION_CRYPT_5.skullIds]
					: (existing?.collectedIds ?? []),
			startedAt: existing?.startedAt ?? now,
			completedAt: existing?.completedAt ?? now,
			updatedAt: now
		};

		player.missions[missionId] = progress;
		player.updatedAt = now;
		registry.players[this.playerId] = player;
		writeRegistry(registry);

		this.completedMinigames = {
			...this.completedMinigames,
			[missionId]: progress.completedAt ?? now
		};
		this.completionSeq += 1;

		if (missionId === MISSION_CRYPT_5.id) {
			this.cryptCompleted = true;
			this.cryptCompletedAt = progress.completedAt;
		}

		return true;
	}

	resetMission(): void {
		if (!this.playerId) {
			return;
		}

		const now = Date.now();
		const next = emptyProgress(now);
		const registry = readRegistry();
		const player = registry.players[this.playerId] ?? {
			playerId: this.playerId,
			updatedAt: now,
			missions: {}
		};

		player.missions[MISSION_ID] = next;
		player.updatedAt = now;
		registry.players[this.playerId] = player;
		writeRegistry(registry);

		this.progress = next;
		this.nearestCatId = null;
		this.showCompletion = false;
		this.toast = null;
	}

	private persist(progress: MissionProgress): void {
		if (!this.playerId) {
			return;
		}

		const registry = readRegistry();
		const now = Date.now();
		const player = registry.players[this.playerId] ?? {
			playerId: this.playerId,
			updatedAt: now,
			missions: {}
		};

		player.missions[MISSION_ID] = progress;
		player.updatedAt = now;
		registry.players[this.playerId] = player;
		writeRegistry(registry);
	}

	private reloadFromStorage(): void {
		if (!this.playerId) {
			return;
		}

		const registry = readRegistry();
		const storedMissions = registry.players[this.playerId]?.missions ?? {};
		const stored = storedMissions[MISSION_ID];
		const completedMinigames = { ...this.completedMinigames };
		let completedChanged = false;

		for (const [missionId, rawProgress] of Object.entries(storedMissions)) {
			if (missionId === MISSION_ID) {
				continue;
			}

			const progress = normalizeProgress(rawProgress, missionId);

			if (progress.status === 'completed' && !(missionId in completedMinigames)) {
				completedMinigames[missionId] = progress.completedAt ?? Date.now();
				completedChanged = true;
			}
		}

		if (stored) {
			const merged = mergeProgress(this.progress, stored);

			if (!progressEqual(stored, merged)) {
				const player = registry.players[this.playerId] ?? {
					playerId: this.playerId,
					updatedAt: Date.now(),
					missions: {}
				};

				player.missions[MISSION_ID] = merged;
				player.updatedAt = Date.now();
				registry.players[this.playerId] = player;
				writeRegistry(registry);
			}

			if (!progressEqual(this.progress, merged)) {
				this.progress = merged;
			}
		}

		if (completedChanged) {
			this.completedMinigames = completedMinigames;
			this.completionSeq += 1;
		}

		const crypt = normalizeProgress(storedMissions[MISSION_CRYPT_5.id], MISSION_CRYPT_5.id);

		if (crypt.status === 'completed' && !this.cryptCompleted) {
			this.cryptCompleted = true;
			this.cryptCompletedAt = crypt.completedAt;
		}
	}

	private showToast(message: string): void {
		this.toastId += 1;
		const toast = { id: this.toastId, message };

		this.toast = toast;
		clearTimeout(this.toastTimer);
		this.toastTimer = setTimeout(() => {
			if (this.toast?.id === toast.id) {
				this.toast = null;
			}
		}, TOAST_MS);
	}

	private showCompletionBanner(): void {
		this.showCompletion = true;
		clearTimeout(this.completionTimer);
		this.completionTimer = setTimeout(() => {
			this.showCompletion = false;
		}, COMPLETION_MS);
	}
}

export const missions = new MissionStore();
