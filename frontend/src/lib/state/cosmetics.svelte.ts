import { browser } from '$app/env';
import {
	DEFAULT_SKIN,
	isSkinId,
	SKINS,
	SKIN_BY_ID,
	type SkinDefinition,
	type SkinId
} from '../cosmetics/skins';
import { missions } from './missions.svelte';
import { nftOwnership } from './nftOwnership.svelte';
import { playerProfile } from './playerProfile.svelte';

/**
 * Catálogo local de cosméticos: equipado, desbloqueos y recompensas por misión.
 *
 * No hay backend: la fuente de verdad es `playerProfile` (con sincronización
 * entre pestañas vía `storage`). Las misiones completadas desbloquean la skin
 * correspondiente al arrancar y cada vez que cambia su estado.
 */
class CosmeticsStore {
	private initialized = false;

	get equippedSkin(): SkinId {
		return playerProfile.equippedSkin;
	}

	get skins(): readonly SkinDefinition[] {
		return SKINS;
	}

	/**
	 * Solo el avatar por defecto es gratis. Cualquier otra skin exige poseer su
	 * NFT: completar la misión ya no desbloquea el equipado, solo habilita el
	 * reclamo de la recompensa on-chain.
	 */
	isUnlocked(id: SkinId): boolean {
		const skin = SKIN_BY_ID.get(id);

		if (!skin) {
			return false;
		}

		return id === DEFAULT_SKIN || playerProfile.nftSkins.includes(id) || nftOwnership.owns(id);
	}

	/** La skin está disponible solo porque el jugador posee su NFT. */
	isNftOwned(id: SkinId): boolean {
		return nftOwnership.owns(id);
	}

	equip(id: SkinId): boolean {
		if (!isSkinId(id) || !this.isUnlocked(id)) {
			return false;
		}

		return playerProfile.setEquippedSkin(id);
	}

	init(): void {
		if (!browser || this.initialized) {
			return;
		}

		this.initialized = true;
		this.syncUnlocks();
	}

	/** Desbloquea las skins cuya misión ya está completada. Idempotente. */
	syncUnlocks(): void {
		if (!browser) {
			return;
		}

		for (const skin of SKINS) {
			if (
				skin.unlockMissionId !== null &&
				missions.isMissionCompleted(skin.unlockMissionId) &&
				!playerProfile.unlockedSkins.includes(skin.id)
			) {
				playerProfile.unlockSkin(skin.id);
			}
		}
	}

	rewardForMission(missionId: string): SkinDefinition | null {
		return this.rewardsForMission(missionId)[0] ?? null;
	}

	/** Todas las skins desbloqueadas por una misión, en orden del catálogo. */
	rewardsForMission(missionId: string): SkinDefinition[] {
		return SKINS.filter((skin) => skin.unlockMissionId === missionId);
	}
}

export const cosmetics = new CosmeticsStore();
