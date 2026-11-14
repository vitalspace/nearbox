import type { RoyaleMode } from './royaleConfig';

/**
 * Input de Skyfall Royale (`minigame-8`), separado de `dmInput` y `waveInput`
 * para que ninguna room dependa de otra.
 *
 * Solo transporta intenciones del jugador local: el servidor sigue siendo la
 * única autoridad sobre daño, loot, tormenta y puestos.
 */
class RoyaleInput {
	/** True mientras se mantiene el botón de disparo (armas automáticas). */
	fireHeld = false;
	/** Disparo puntual pedido por el botón táctil. */
	fireRequested = false;
	grenadeRequested = false;
	reloadRequested = false;
	/** Ranura 1–4 pedida desde HUD o controles táctiles. */
	equipRequested: number | null = null;
	/** Despliegue manual del planeo durante la caída. */
	deployRequested = false;

	/** Modo local que `PlayerCollider` mantiene y `RoyaleSession` reporta. */
	mode: RoyaleMode = 'riding';
	/** Velocidad vertical local, para el reporte `mg8-position`. */
	vy = 0;

	/** Panel lateral de vivos colapsado. */
	topAliveVisible = true;

	/** Señales de animación consumidas por `PlayerBehaviour`. */
	grenadeThrownAt = 0;

	requestFire(): void {
		this.fireRequested = true;
	}

	consumeFire(): boolean {
		const requested = this.fireRequested;
		this.fireRequested = false;
		return requested;
	}

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

	requestDeploy(): void {
		this.deployRequested = true;
	}

	consumeDeploy(): boolean {
		const requested = this.deployRequested;
		this.deployRequested = false;
		return requested;
	}

	toggleTopAlive(): void {
		this.topAliveVisible = !this.topAliveVisible;
	}

	reset(): void {
		this.fireHeld = false;
		this.fireRequested = false;
		this.grenadeRequested = false;
		this.reloadRequested = false;
		this.equipRequested = null;
		this.deployRequested = false;
		this.mode = 'riding';
		this.vy = 0;
		this.topAliveVisible = true;
		this.grenadeThrownAt = 0;
	}
}

export const royaleInput = new RoyaleInput();
