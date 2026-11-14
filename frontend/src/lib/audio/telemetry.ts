/**
 * Telemetría de cliente para el audio.
 *
 * Es un módulo plano, sin runas ni imports de audio, para que la física pueda
 * escribir en él sin acoplarse al motor de sonido ni provocar ciclos. El
 * `SceneAudio` lo lee cada frame y `AudioBootstrap` consume los impactos.
 */

export type CarTelemetry = {
	/** El jugador local conduce y el coche está activo. */
	driving: boolean;
	speed: number;
	maxSpeed: number;
	steering: number;
	throttle: number;
	handbrake: boolean;
	/** Marca de tiempo del último reporte, para descartar telemetría vieja. */
	at: number;
};

export const carTelemetry: CarTelemetry = {
	driving: false,
	speed: 0,
	maxSpeed: 40,
	steering: 0,
	throttle: 0,
	handbrake: false,
	at: 0
};

export function setCarTelemetry(
	values: Omit<CarTelemetry, 'at' | 'driving'> & { driving?: boolean }
): void {
	carTelemetry.driving = values.driving ?? true;
	carTelemetry.speed = values.speed;
	carTelemetry.maxSpeed = Math.max(1, values.maxSpeed);
	carTelemetry.steering = values.steering;
	carTelemetry.throttle = values.throttle;
	carTelemetry.handbrake = values.handbrake;
	carTelemetry.at = typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function clearCarTelemetry(): void {
	carTelemetry.driving = false;
	carTelemetry.speed = 0;
	carTelemetry.steering = 0;
	carTelemetry.throttle = 0;
	carTelemetry.handbrake = false;
}

export type CarImpactCause = 'collision' | 'rollover';

export type QueuedCarImpact = {
	seq: number;
	impactSpeed: number;
	cause: CarImpactCause;
	at: number;
};

let impactSeq = 0;
const pendingImpacts: QueuedCarImpact[] = [];

/** Encola un impacto local para que el audio lo reproduzca una sola vez. */
export function reportCarImpact(impactSpeed: number, cause: CarImpactCause): void {
	impactSeq += 1;
	pendingImpacts.push({
		seq: impactSeq,
		impactSpeed,
		cause,
		at: typeof performance !== 'undefined' ? performance.now() : Date.now()
	});

	// Si nadie consume (audio desactivado), no crecer sin límite.
	if (pendingImpacts.length > 16) {
		pendingImpacts.splice(0, pendingImpacts.length - 16);
	}
}

export function drainCarImpacts(): QueuedCarImpact[] {
	return pendingImpacts.splice(0, pendingImpacts.length);
}

/** Estado de movimiento del jugador escrito por `PlayerCollider`. */
export const playerMotion = {
	/** Segundos acumulados en el aire; 0 en suelo. */
	airTime: 0,
	/** `performance.now()` del último aterrizaje con caída relevante. */
	landedAt: 0,
	/** Velocidad vertical aproximada al aterrizar; permite graduar el golpe. */
	landFallSpeed: 0,
	/** Distancia XZ acumulada desde el último paso (la consume el audio). */
	stepDistance: 0
};

export function reportPlayerGrounded(grounded: boolean, delta: number, fallSpeed = 0): void {
	if (grounded) {
		if (playerMotion.airTime > 0.25) {
			playerMotion.landedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
			playerMotion.landFallSpeed = Math.abs(fallSpeed);
		} else {
			playerMotion.landFallSpeed = 0;
		}

		playerMotion.airTime = 0;
		return;
	}

	playerMotion.airTime += Math.max(0, delta);
}
