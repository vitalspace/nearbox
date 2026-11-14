import type { CarId, CarModel, CarState } from '../services/protocol';
import { asset } from '../assets/path';

/**
 * Catálogo y constantes de los coches. Debe coincidir con
 * `backend/src/ws/protocol.ts` (`CAR_DEFINITIONS`).
 */

export type CarSpawn = {
	x: number;
	y: number;
	z: number;
	yaw: number;
};

export const CAR_ORDER: readonly CarId[] = ['car-calabaza', 'car-momia', 'car-halloween'];

export const CAR_NAMES: Record<CarId, string> = {
	'car-calabaza': 'Pumpkin Car',
	'car-momia': 'Mummy Car',
	'car-halloween': 'Halloween Car'
};

export const CAR_MODEL_URLS: Record<CarModel, string> = {
	coche_calabaza: asset('vehicles/coche_calabaza.glb'),
	coche_momia: asset('vehicles/coche_momia.glb'),
	coche_halloween: asset('vehicles/coche_halloween.glb')
};

export const CAR_SPAWNS: Record<CarId, CarSpawn> = {
	'car-calabaza': { x: -7, y: 1.4, z: 12, yaw: 0 },
	'car-momia': { x: 7, y: 1.4, z: 12, yaw: Math.PI },
	'car-halloween': { x: 0, y: 1.4, z: 17, yaw: Math.PI / 2 }
};

/** Medio tamaño del collider del chasis (largo, alto, ancho). */
export const CHASSIS_HALF_EXTENTS = { x: 2.4, y: 0.55, z: 1.05 };
/** Altura del centro del chasis sobre el suelo. */
export const CHASSIS_CENTER_Y = 1.0;
/** Densidad del chasis: ~890 kg con el volumen actual. */
export const CHASSIS_DENSITY = 80;
/** Desplazamiento del modelo para que las ruedas apoyen en el suelo. */
export const MODEL_GROUND_OFFSET = -CHASSIS_CENTER_Y;

/** Punto de anclaje de la suspensión relativo al centro del chasis. */
export const WHEEL_CONNECTION = { x: 1.45, y: -0.2, z: 1.18 };
export const WHEEL_RADIUS = 0.6;
export const SUSPENSION_REST_LENGTH = 0.2;
export const SUSPENSION_TRAVEL = 0.3;
export const SUSPENSION_STIFFNESS = 24;
export const SUSPENSION_COMPRESSION = 0.8;
export const SUSPENSION_RELAXATION = 0.9;
export const WHEEL_FRICTION_SLIP = 2;
export const WHEEL_SIDE_FRICTION_STIFFNESS = 1;
export const WHEEL_MAX_SUSPENSION_FORCE = 20_000;

export const MAX_ENGINE_FORCE = 1200;
export const MAX_BRAKE = 8;
export const HANDBRAKE_FORCE = 30;
export const MAX_STEER = 0.55;
export const STEER_SPEED = 2.5;

/** Cada cuánto reporta el conductor su estado físico. */
export const STATE_INTERVAL_MS = 100;
export const IMPACT_SPEED_THRESHOLD = 5;
export const IMPACT_COOLDOWN_MS = 600;
export const IMPACT_MAX_DAMAGE = 35;
export const ROLLOVER_COOLDOWN_MS = 2000;
export const ROLLOVER_UP_THRESHOLD = 0.3;
export const ROLLOVER_TIME_MS = 1000;
export const RESPAWN_MS = 5000;

/** Radio horizontal para mostrar el prompt y validar la entrada. */
export const ENTER_RADIUS = 5;
export const ENTER_MAX_DY = 3;
/** Distancia lateral a la que aparece el jugador al salir o ser eyectado. */
export const EJECT_DISTANCE = 2.5;

/** Extrae el giro (yaw) de un cuaternión de rotación en Y. */
export function yawFromQuaternion(rotation: CarState['rotation']): number {
	return Math.atan2(
		2 * (rotation.w * rotation.y + rotation.x * rotation.z),
		1 - 2 * (rotation.y * rotation.y + rotation.x * rotation.x)
	);
}

export function isCarDrivable(car: CarState): boolean {
	return car.status === 'available';
}
