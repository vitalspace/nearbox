import { browser } from '$app/env';
import { DEFAULT_SKIN, isSkinId, SKIN_BY_ID, type SkinId } from '../cosmetics/skins';

const STORAGE_KEY = 'rw:profile:v1';
const LEGACY_ALIAS_KEY = 'lobby:name';
const LEGACY_COLOR_KEY = 'player:labelColor';
const DEFAULT_LABEL_COLOR = '#f8fafc';

export type PlayerProfile = {
	version: 1;
	playerId: string;
	alias: string;
	labelColor: string;
	missionHudVisible: boolean;
	onboardingCompleted: boolean;
	unlockedSkins: SkinId[];
	/** Skins unlocked because the player owns their NFT. Cleared when the NFT is sold. */
	nftSkins: SkinId[];
	equippedSkin: SkinId;
	createdAt: number;
	updatedAt: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

export function randomAlias(): string {
	const suffix = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0');

	return `Player-${suffix}`;
}

export function normalizeAlias(alias: string): string {
	const cleaned = alias.replace(/\s+/g, ' ').trim().slice(0, 24);

	return cleaned.length > 0 ? cleaned : randomAlias();
}

function normalizeColor(value: string | null): string {
	return value && /^#[0-9a-f]{6}$/i.test(value) ? value : DEFAULT_LABEL_COLOR;
}

function normalizeSkins(value: unknown): SkinId[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const skins: SkinId[] = [];

	for (const id of value) {
		if (isSkinId(id) && id !== DEFAULT_SKIN && !skins.includes(id)) {
			skins.push(id);
		}
	}

	return skins;
}

function normalizeEquippedSkin(value: unknown, nftSkins: readonly SkinId[]): SkinId {
	if (!isSkinId(value)) {
		return DEFAULT_SKIN;
	}

	return value === DEFAULT_SKIN || nftSkins.includes(value) ? value : DEFAULT_SKIN;
}

function createPlayerId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}

	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
		const random = Math.floor(Math.random() * 16);
		const value = char === 'x' ? random : (random & 0x3) | 0x8;

		return value.toString(16);
	});
}

function readProfile(): PlayerProfile | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);

		if (!raw) {
			return null;
		}

		const value: unknown = JSON.parse(raw);

		if (!isRecord(value) || value.version !== 1) {
			return null;
		}

		const playerId =
			typeof value.playerId === 'string' && value.playerId.length > 0 ? value.playerId : null;

		if (!playerId) {
			return null;
		}

		const now = Date.now();
		const unlockedSkins = normalizeSkins(value.unlockedSkins);
		const nftSkins = normalizeSkins(value.nftSkins);

		return {
			version: 1,
			playerId,
			alias: normalizeAlias(typeof value.alias === 'string' ? value.alias : randomAlias()),
			labelColor: normalizeColor(typeof value.labelColor === 'string' ? value.labelColor : null),
			missionHudVisible:
				typeof value.missionHudVisible === 'boolean' ? value.missionHudVisible : true,
			// Profiles created before onboarding existed are already set up.
			onboardingCompleted:
				typeof value.onboardingCompleted === 'boolean' ? value.onboardingCompleted : true,
			unlockedSkins,
			nftSkins,
			equippedSkin: normalizeEquippedSkin(value.equippedSkin, nftSkins),
			createdAt: isFiniteNumber(value.createdAt) ? value.createdAt : now,
			updatedAt: isFiniteNumber(value.updatedAt) ? value.updatedAt : now
		};
	} catch (error) {
		console.warn('[profile] Could not read the local profile', error);

		return null;
	}
}

function writeProfile(profile: PlayerProfile): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
	} catch (error) {
		console.warn('[profile] Could not save the local profile', error);
	}
}

function readLegacy(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function removeLegacy(key: string): void {
	try {
		localStorage.removeItem(key);
	} catch {
		// Sin almacenamiento disponible: no hay nada que limpiar.
	}
}

class PlayerProfileStore {
	playerId = $state('');
	alias = $state('');
	labelColor = $state(DEFAULT_LABEL_COLOR);
	missionHudVisible = $state(true);
	onboardingCompleted = $state(false);
	unlockedSkins = $state<SkinId[]>([]);
	nftSkins = $state<SkinId[]>([]);
	equippedSkin = $state<SkinId>(DEFAULT_SKIN);
	createdAt = $state(0);
	updatedAt = $state(0);

	private initialized = false;

	private onStorage = (event: StorageEvent): void => {
		if (event.key !== STORAGE_KEY || !event.newValue) {
			return;
		}

		const stored = readProfile();

		if (stored) {
			this.apply(stored);
		}
	};

	init(): void {
		if (!browser || this.initialized) {
			return;
		}

		this.initialized = true;

		const stored = readProfile();

		if (stored) {
			this.apply(stored);
		} else {
			const now = Date.now();
			const legacyAlias = readLegacy(LEGACY_ALIAS_KEY);
			const legacyColor = readLegacy(LEGACY_COLOR_KEY);

			this.playerId = createPlayerId();
			this.alias = normalizeAlias(legacyAlias ?? randomAlias());
			this.labelColor = normalizeColor(legacyColor);
			this.missionHudVisible = true;
			this.onboardingCompleted = false;
			this.unlockedSkins = [];
			this.nftSkins = [];
			this.equippedSkin = DEFAULT_SKIN;
			this.createdAt = now;
			this.updatedAt = now;
			this.persist();
			removeLegacy(LEGACY_ALIAS_KEY);
			removeLegacy(LEGACY_COLOR_KEY);
		}

		window.addEventListener('storage', this.onStorage);
	}

	destroy(): void {
		if (!browser) {
			return;
		}

		window.removeEventListener('storage', this.onStorage);
		this.initialized = false;
	}

	setAlias(alias: string): void {
		const next = normalizeAlias(alias);

		if (next === this.alias) {
			return;
		}

		this.alias = next;
		this.touch();
	}

	setLabelColor(color: string): void {
		const next = normalizeColor(color);

		if (next === this.labelColor) {
			return;
		}

		this.labelColor = next;
		this.touch();
	}

	setMissionHudVisible(visible: boolean): void {
		if (visible === this.missionHudVisible) {
			return;
		}

		this.missionHudVisible = visible;
		this.touch();
	}

	completeOnboarding(): void {
		if (this.onboardingCompleted) {
			return;
		}

		this.onboardingCompleted = true;
		this.touch();
	}

	/** Añade una skin al inventario local. Idempotente. */
	unlockSkin(id: SkinId): boolean {
		if (!isSkinId(id) || id === DEFAULT_SKIN || this.unlockedSkins.includes(id)) {
			return false;
		}

		this.unlockedSkins = [...this.unlockedSkins, id];
		this.touch();

		return true;
	}

	/** Equipa una skin conocida y desbloqueada. Devuelve si se pudo aplicar. */
	setEquippedSkin(id: SkinId): boolean {
		if (!isSkinId(id)) {
			return false;
		}

		const skin = SKIN_BY_ID.get(id);

		if (!skin) {
			return false;
		}

		if (id !== DEFAULT_SKIN && !this.nftSkins.includes(id)) {
			return false;
		}

		if (id === this.equippedSkin) {
			return true;
		}

		this.equippedSkin = id;
		this.touch();

		return true;
	}

	/**
	 * Reemplaza las skins desbloqueadas por NFT. Si la skin equipada ya no
	 * pertenece al jugador (la vendió), vuelve a la skin por defecto.
	 */
	syncNftSkins(ids: readonly string[]): void {
		const next = normalizeSkins(ids);
		const same =
			next.length === this.nftSkins.length &&
			next.every((id, index) => id === this.nftSkins[index]);

		if (same) {
			return;
		}

		this.nftSkins = next;

		if (this.equippedSkin !== DEFAULT_SKIN && !this.isSkinAvailable(this.equippedSkin)) {
			this.equippedSkin = DEFAULT_SKIN;
		}

		this.touch();
	}

	private isSkinAvailable(id: SkinId): boolean {
		const skin = SKIN_BY_ID.get(id);

		if (!skin) {
			return false;
		}

		return id === DEFAULT_SKIN || this.nftSkins.includes(id);
	}

	private apply(profile: PlayerProfile): void {
		this.playerId = profile.playerId;
		this.alias = profile.alias;
		this.labelColor = profile.labelColor;
		this.missionHudVisible = profile.missionHudVisible;
		this.onboardingCompleted = profile.onboardingCompleted;
		this.unlockedSkins = [...profile.unlockedSkins];
		this.nftSkins = [...profile.nftSkins];
		this.equippedSkin = profile.equippedSkin;
		this.createdAt = profile.createdAt;
		this.updatedAt = profile.updatedAt;
	}

	private touch(): void {
		this.updatedAt = Date.now();
		this.persist();
	}

	private persist(): void {
		if (!browser || !this.playerId) {
			return;
		}

		writeProfile({
			version: 1,
			playerId: this.playerId,
			alias: this.alias,
			labelColor: this.labelColor,
			missionHudVisible: this.missionHudVisible,
			onboardingCompleted: this.onboardingCompleted,
			unlockedSkins: [...this.unlockedSkins],
			nftSkins: [...this.nftSkins],
			equippedSkin: this.equippedSkin,
			createdAt: this.createdAt,
			updatedAt: this.updatedAt
		});
	}
}

export const playerProfile = new PlayerProfileStore();
