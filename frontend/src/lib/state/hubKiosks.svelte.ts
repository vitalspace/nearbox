export type KioskId = 'shop' | 'tourism';

export type KioskDefinition = {
	id: KioskId;
	name: string;
	/** Large floating 3D sign. Upper case reads better in the extruded font. */
	label: string;
	/** Small line under the title, also extruded in 3D. */
	subtitle: string;
	hint: string;
	/** Phrase shown after the `E` key in the prompt. */
	prompt: string;
	action: string;
	/** Pad centre in world space. */
	position: [number, number, number];
	color: string;
	/** Interaction radius in metres on the XZ plane. */
	radius: number;
};

/**
 * The two village kiosks live in front of the map buildings:
 * - `shop` in front of `Halloween_Cardboard_Shop` (facing `+X`).
 * - `tourism` in front of `Halloween_Tourism_Office` (facing `-X`).
 *
 * Both pads sit on the central plaza, whose walkable surface is at `y = 0.4`
 * (the same height used by the Barn Siege, Deathmatch and Parkour checkpoints).
 */
export const VILLAGE_KIOSKS: readonly KioskDefinition[] = [
	{
		id: 'shop',
		name: 'Halloween Shop',
		label: 'HALLOWEEN SHOP',
		subtitle: 'PRESS E TO BROWSE',
		hint: 'Try on every skin you have unlocked and equip a new look.',
		prompt: 'to browse the wardrobe',
		action: 'Browse',
		position: [-17.2, 0.4, 0],
		color: '#fb923c',
		radius: 3.2
	},
	{
		id: 'tourism',
		name: 'Tourism Office',
		label: 'VILLAGE GUIDE',
		subtitle: 'PRESS E FOR THE GUIDE',
		hint: 'See every activity in NearBox and where to find it.',
		prompt: 'to read the village guide',
		action: 'Guide',
		position: [16.9, 0.4, 0],
		color: '#2dd4bf',
		radius: 3.2
	}
];

class HubKiosksStore {
	/** Kiosk whose interaction radius currently contains the player. */
	nearbyId = $state<KioskId | null>(null);
	/** Kiosk whose modal panel is open, if any. */
	panelId = $state<KioskId | null>(null);

	get nearby(): KioskDefinition | null {
		return VILLAGE_KIOSKS.find((kiosk) => kiosk.id === this.nearbyId) ?? null;
	}

	get panel(): KioskDefinition | null {
		return VILLAGE_KIOSKS.find((kiosk) => kiosk.id === this.panelId) ?? null;
	}

	get panelOpen(): boolean {
		return this.panelId !== null;
	}

	setNearby(id: KioskId | null): void {
		if (this.nearbyId === id) {
			return;
		}

		this.nearbyId = id;
	}

	open(id: KioskId): void {
		if (!VILLAGE_KIOSKS.some((kiosk) => kiosk.id === id)) {
			return;
		}

		this.panelId = id;
	}

	close(): void {
		this.panelId = null;
	}

	/** Clears both transient values when the hub scene is unmounted. */
	reset(): void {
		this.nearbyId = null;
		this.panelId = null;
	}
}

export const hubKiosks = new HubKiosksStore();
