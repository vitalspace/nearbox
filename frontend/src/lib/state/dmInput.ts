/**
 * Combat input for Witch House Deathmatch (minigame-6), kept separate from
 * `waveInput` so neither room depends on the other.
 */
class DeathmatchInput {
	/** True while the fire button is held (auto weapons). */
	fireHeld = false;
	/** Consumed once by the session (edge-triggered). */
	grenadeRequested = false;
	reloadRequested = false;
	/** Weapon slot requested by the touch/HUD buttons (1–4). */
	equipRequested: number | null = null;
	/** Touch tap for semi-automatic weapons. */
	fireRequested = false;

	/** Local animation signals consumed by `PlayerBehaviour`. */
	grenadeThrownAt = 0;

	requestGrenade(): void {
		this.grenadeRequested = true;
	}

	consumeGrenade(): boolean {
		const requested = this.grenadeRequested;
		this.grenadeRequested = false;
		return requested;
	}

	requestReload(): void {
		this.reloadRequested = true;
	}

	consumeReload(): boolean {
		const requested = this.reloadRequested;
		this.reloadRequested = false;
		return requested;
	}

	requestEquip(slot: number): void {
		this.equipRequested = slot;
	}

	consumeEquip(): number | null {
		const slot = this.equipRequested;
		this.equipRequested = null;
		return slot;
	}

	requestFire(): void {
		this.fireRequested = true;
	}

	consumeFire(): boolean {
		const requested = this.fireRequested;
		this.fireRequested = false;
		return requested;
	}

	reset(): void {
		this.fireHeld = false;
		this.grenadeRequested = false;
		this.reloadRequested = false;
		this.equipRequested = null;
		this.fireRequested = false;
		this.grenadeThrownAt = 0;
	}
}

export const dmInput = new DeathmatchInput();
