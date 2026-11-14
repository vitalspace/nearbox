import type { HeroAnimation } from '../services/protocol';
import { equipment } from './equipment.svelte';
import { playerState } from './playerState';
import { sceneState } from './sceneState.svelte';

/**
 * Monturas NFT conducibles (skateboard y escoba mágica).
 *
 * La propiedad del NFT la sigue resolviendo `equipment`; este store solo
 * convierte el vehículo equipado en un modo de conducción local. El movimiento
 * lo integra `PlayerCollider` con el mismo character controller que usa al
 * jugador a pie, así que se reutilizan colisiones, pendientes y límites del
 * mapa sin crear un segundo cuerpo físico.
 */

export type RideId = 'skateboard' | 'magic-broom';

export type RideTuning = {
	id: RideId;
	name: string;
	/** Ruta relativa a `static/`. */
	model: string;
	/** Tamaño máximo del modelo normalizado, en metros. */
	targetSize: number;
	/** Altura del modelo respecto a los pies del avatar. */
	visualY: number;
	/** Altura extra de los pies sobre el suelo mientras se conduce. */
	footLift: number;
	maxSpeed: number;
	reverseSpeed: number;
	/** Aceleración al mantener W. */
	acceleration: number;
	/** Frenada al pulsar S en marcha o al frenar con Space. */
	braking: number;
	/** Reducción de velocidad al soltar el acelerador. */
	drag: number;
	/** Velocidad angular máxima, en rad/s. */
	turnRate: number;
	/**
	 * Clip que adopta el avatar mientras conduce. El skateboard mantiene la
	 * pose idle de pie; la escoba usa la pose sentada del rig.
	 */
	animation: HeroAnimation;
};

export const RIDE_TUNING: Readonly<Record<RideId, RideTuning>> = {
	skateboard: {
		id: 'skateboard',
		name: 'Skateboard',
		model: 'props/skateboard.glb',
		targetSize: 0.98,
		visualY: -0.101,
		footLift: 0.202,
		maxSpeed: 12,
		reverseSpeed: 4,
		acceleration: 10,
		braking: 16,
		drag: 2.2,
		turnRate: 2.5,
		animation: 'HR_idle'
	},
	'magic-broom': {
		id: 'magic-broom',
		name: 'Magic Broom',
		model: 'props/magic_broom.glb',
		targetSize: 2.1,
		visualY: 0.44,
		footLift: 0,
		maxSpeed: 17,
		reverseSpeed: 5,
		acceleration: 8,
		braking: 13,
		drag: 1.4,
		turnRate: 1.9,
		animation: 'HR_sit'
	}
};

/** Normaliza el id del catálogo NFT al id de montura conocida. */
export function rideIdFromCatalog(id: string | null): RideId | null {
	return id === 'skateboard' || id === 'magic-broom' ? id : null;
}

class RideStore {
	/** Montura activa; `null` mientras el jugador va a pie. */
	activeId = $state<RideId | null>(null);
	/** Velocidad longitudinal en m/s (negativa al retroceder). */
	speed = $state(0);
	/** Rumbo del vehículo en radianes. */
	yaw = $state(0);

	get isRiding(): boolean {
		return this.activeId !== null;
	}

	/** Montura equipada en el loadout NFT, si es una de las conducibles. */
	get equippedId(): RideId | null {
		return rideIdFromCatalog(equipment.vehicle);
	}

	/** Ajustes de la montura equipada (para HUD, prompts y vista previa). */
	get equipped(): RideTuning | null {
		const id = this.equippedId;
		return id ? RIDE_TUNING[id] : null;
	}

	/** Ajustes de la montura que se está conduciendo. */
	get tuning(): RideTuning | null {
		return this.activeId ? RIDE_TUNING[this.activeId] : null;
	}

	/**
	 * Solo las monturas equipadas y el hub tienen controles de conducción. En
	 * minijuegos y carreras el vehículo sigue siendo un cosmético.
	 */
	get canRide(): boolean {
		return this.equippedId !== null && sceneState.inHub;
	}

	mount(): boolean {
		if (this.activeId || !this.canRide) return false;

		this.activeId = this.equippedId;
		this.speed = 0;
		this.yaw = playerState.facingYaw;
		return this.activeId !== null;
	}

	dismount(): void {
		if (!this.activeId) return;

		this.activeId = null;
		this.speed = 0;
	}

	toggle(): boolean {
		if (this.isRiding) {
			this.dismount();
			return true;
		}

		return this.mount();
	}

	/** Al cambiar de escena o desconectarse: vuelta a pie sin teleportar. */
	reset(): void {
		this.activeId = null;
		this.speed = 0;
		this.yaw = 0;
	}
}

export const ride = new RideStore();
