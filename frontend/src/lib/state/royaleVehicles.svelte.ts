import type { Mg8VehicleState } from '../services/protocol';
import {
	ROYALE_BALLOON_SEAT_OFFSET,
	ROYALE_CAR_SEAT_OFFSET,
	ROYALE_VEHICLE_ENTER_MAX_DY,
	ROYALE_VEHICLE_ENTER_RADIUS
} from './royaleConfig';
import { minigame8 } from './minigame8.svelte';
import { playerState } from './playerState';
import { sceneState } from './sceneState.svelte';

/**
 * Vehículo más cercano al jugador local, para el prompt y la tecla E.
 *
 * Se recalcula en cada frame desde el snapshot (1 Hz) y las posiciones
 * (10 Hz): el snapshot manda sobre vida y ocupante, pero la distancia se mide
 * contra la última pose conocida para que el prompt no llegue un segundo tarde.
 */
class RoyaleVehiclesStore {
	nearby = $state.raw<Mg8VehicleState | null>(null);
	/** Cambia cuando el conductor pide enderezar/recolocar el coche con `R`. */
	flipToken = $state(0);
	/**
	 * Vista del globo de Royale. Por defecto primera persona: la barquilla
	 * queda alrededor de la cámara y apuntar desde el aire es mucho más
	 * cómodo que con la órbita exterior. `V` alterna a tercera persona.
	 */
	balloonView = $state<'first' | 'third'>('first');
	/**
	 * `yaw` local del globo pilotado, escrito por `RoyaleBalloon` cada frame.
	 * La cámara lo usa solo al entrar en primera persona, para arrancar
	 * mirando hacia donde apunta la barquilla.
	 */
	balloonYaw = $state(0);

	private nextScanAt = 0;

	get driving(): Mg8VehicleState | null {
		return minigame8.vehicle;
	}

	get drivingKind(): 'car' | 'balloon' | null {
		return minigame8.drivingKind;
	}

	get prompt(): string | null {
		const driving = this.driving;

		if (driving) {
			// El globo puede cambiar de vista: se anuncia la tecla, si no el
			// jugador no descubre la primera persona para apuntar.
			if (driving.kind === 'balloon') {
				return `E · Exit ${driving.name} · V · ${this.balloonView === 'first' ? 'Third person' : 'First person'}`;
			}

			return `E · Exit ${driving.name}`;
		}

		return this.nearby ? `E · Enter ${this.nearby.name}` : null;
	}

	scan(now: number): void {
		if (
			!sceneState.inRoyale ||
			minigame8.phase !== 'playing' ||
			!minigame8.isAlive ||
			minigame8.isDriving
		) {
			if (this.nearby !== null) this.nearby = null;
			return;
		}

		if (now < this.nextScanAt) return;
		this.nextScanAt = now + 120;

		const poses = minigame8.latestVehicles();
		let best: Mg8VehicleState | null = null;
		let bestDistance = Number.POSITIVE_INFINITY;

		for (const vehicle of minigame8.vehicles) {
			if (vehicle.destroyed || vehicle.driverId !== null) continue;

			const pose = poses.find((entry) => entry.id === vehicle.id);
			const x = pose?.x ?? vehicle.x;
			const y = pose?.y ?? vehicle.y;
			const z = pose?.z ?? vehicle.z;
			const seat =
				y + (vehicle.kind === 'car' ? ROYALE_CAR_SEAT_OFFSET : ROYALE_BALLOON_SEAT_OFFSET);

			if (Math.abs(playerState.y - seat) > ROYALE_VEHICLE_ENTER_MAX_DY) continue;

			const distance = Math.hypot(playerState.x - x, playerState.z - z);

			if (distance > ROYALE_VEHICLE_ENTER_RADIUS || distance >= bestDistance) continue;

			best = vehicle;
			bestDistance = distance;
		}

		this.nearby = best;
	}

	enter(): boolean {
		const vehicle = this.nearby;

		if (!vehicle) return false;

		// El globo arranca en 1ª persona: se guarda el rumbo del anclaje para
		// que la cámara nazca mirando hacia delante en el mismo frame.
		if (vehicle.kind === 'balloon') this.balloonYaw = vehicle.yaw;

		return minigame8.sendVehicleEnter(vehicle.id);
	}

	exit(): boolean {
		return minigame8.sendVehicleExit();
	}

	/** Endereza el coche en el sitio (misma tecla `R` que el Gran Premio). */
	flip(): boolean {
		if (!minigame8.isDriving) return false;
		this.flipToken += 1;
		return true;
	}

	/** Alterna 1ª/3ª persona del globo (tecla `V`). */
	toggleBalloonView(): boolean {
		if (minigame8.drivingKind !== 'balloon') return false;
		this.balloonView = this.balloonView === 'first' ? 'third' : 'first';
		return true;
	}

	reset(): void {
		this.nearby = null;
		this.flipToken = 0;
		this.balloonView = 'first';
		this.balloonYaw = 0;
		this.nextScanAt = 0;
	}
}

export const royaleVehicles = new RoyaleVehiclesStore();
