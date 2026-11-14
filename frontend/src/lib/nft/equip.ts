import { isSkinId } from '../cosmetics/skins.ts';
import { cosmetics } from '../state/cosmetics.svelte.ts';
import { equipment } from '../state/equipment.svelte.ts';
import { nftOwnership } from '../state/nftOwnership.svelte.ts';
import type { MintableCatalogItem } from './catalog.ts';

/** El ítem del catálogo está puesto ahora mismo. */
export function isCatalogItemEquipped(item: MintableCatalogItem): boolean {
	if (item.kind === 'skins') {
		return cosmetics.equippedSkin === item.id;
	}

	return equipment.isEquipped(item);
}

/** Hay un NFT que permite equiparlo. En la tienda nada es gratis: las skins también exigen NFT. */
export function canEquipCatalogItem(item: MintableCatalogItem): boolean {
	if (item.kind === 'skins') {
		return isSkinId(item.id) && nftOwnership.owns(item.id);
	}

	return equipment.canEquip(item);
}

/** Equipa el ítem. Devuelve `false` si no hay NFT o falló la validación. */
export function equipCatalogItem(item: MintableCatalogItem): boolean {
	if (item.kind === 'skins') {
		return isSkinId(item.id) && nftOwnership.owns(item.id) && cosmetics.equip(item.id);
	}

	return equipment.equip(item);
}
