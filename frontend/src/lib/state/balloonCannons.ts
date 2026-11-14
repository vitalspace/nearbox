/**
 * Cañones de rollos de papel del globo.
 *
 * El piloto dispara el cañón frontal y cada artillero su cañón lateral. Cada
 * ocupante apunta con el ratón: el giro horizontal sigue el `yaw` de la cámara
 * y la elevación su inclinación, limitados a un cono alrededor de su asiento.
 *
 * Las bocas viven en coordenadas locales del globo (`BAL_Cannon_*` mide ±2.6 m
 * en X y la canasta ±1.68 m), así que al girar el globo hay que rotar también
 * el origen y la dirección.
 *
 * La balística es la misma que simula `PaperRoll.svelte`: gravedad 18 m/s²,
 * sin rozamiento. La mira usa estas funciones para que el punto previsto
 * coincida con la caída real.
 */

export const BALLOON_CANNON_IDS = ['front', 'left', 'right'] as const;
export type BalloonCannonId = (typeof BALLOON_CANNON_IDS)[number];

/** Debe coincidir con `GRAVITY` de `PaperRoll.svelte`. */
export const PAPER_ROLL_GRAVITY = 18;

/** Radio del rollo; la mira descuenta este radio al chocar. */
export const PAPER_ROLL_RADIUS = 0.13;

/** Velocidad inicial del disparo (m/s). El servidor acepta hasta 90. */
export const CANNON_SPEED = 45;

/** Ángulo de elevación por defecto (rad). */
export const CANNON_ELEVATION = 0.24;

/** Cuánto puede girar el cañón a cada lado de su dirección de asiento (rad). */
export const CANNON_MAX_YAW = 1.15;

/**
 * Elevación del cañón. Negativa deja picar el tiro para batir el suelo desde
 * el globo; positiva lanza por encima del horizonte.
 */
export const CANNON_MIN_PITCH = -0.35;
export const CANNON_MAX_PITCH = 0.85;

/** Cadencia del cañón; algo más lenta que un lanzamiento a mano. */
export const CANNON_COOLDOWN_MS = 420;

/** `phi` de cámara en el que el cañón apunta con su elevación por defecto. */
const CAMERA_NEUTRAL_PHI = 0.3;
/** Sensibilidad vertical: radianes de elevación por radián de cámara. */
const PITCH_PER_PHI = 1.15;

/**
 * `phi` de cámara que produce una elevación `pitch` (sin recortar).
 * Se usa para limitar la cámara de torreta al mismo rango que el cañón.
 */
export function cameraPhiForPitch(pitch: number): number {
	return CAMERA_NEUTRAL_PHI - (pitch - CANNON_ELEVATION) / PITCH_PER_PHI;
}

export type Vec3 = { x: number; y: number; z: number };

/** Pivote del cañón en espacio local del globo. */
const PIVOT: Record<BalloonCannonId, [number, number, number]> = {
	front: [0, 1.32, -1.45],
	left: [-1.68, 1.32, 0],
	right: [1.68, 1.32, 0]
};

/**
 * Boca del cañón relativa a su pivote, en el sistema del modelo (morro hacia
 * +X). Es el centro de la pieza `BAL_Cannon_Muzzle_*` una vez deshecha la
 * inclinación de 8° que trae el GLB.
 */
const MUZZLE_LEVER: Record<BalloonCannonId, [number, number, number]> = {
	front: [0.56, 0.32, 0],
	left: [0.906, 0.32, 0],
	right: [0.906, 0.32, 0]
};

/** `yaw` local al que apunta cada cañón cuando no se está apuntando. */
const DEFAULT_YAW: Record<BalloonCannonId, number> = {
	front: 0,
	left: Math.PI / 2,
	right: -Math.PI / 2
};

/** Giro local del asiento; equivale al `cameraYaw` que centra la mira. */
export function cannonDefaultYaw(cannon: BalloonCannonId): number {
	return DEFAULT_YAW[cannon];
}

/** Giro que el modelo ya trae para orientar su morro (+X) hacia el asiento. */
const BASE_YAW: Record<BalloonCannonId, number> = {
	front: Math.PI / 2,
	left: Math.PI,
	right: 0
};

/**
 * Inclinación de 8° que traen los cañones laterales en su propio anclaje del
 * GLB. El eje de puntería la cancela para que el tubo coincida con la
 * balística, que no la tiene en cuenta.
 */
export const CANNON_MODEL_PITCH = 0.13962634;

/** Punto al que se asoma cada ocupante para que la cámara siga al globo. */
const SEAT: Record<BalloonCannonId, [number, number, number]> = {
	front: [0, 1.2, 0],
	left: [-1.35, 1.2, 0],
	right: [1.35, 1.2, 0]
};

/** Altura de la cubierta de la canasta sobre la base del globo (`BAL_Cabin_Floor`). */
export const BALLOON_DECK_Y = 0.12;

export type CannonAim = {
	/** Giro horizontal respecto a la dirección por defecto del asiento. */
	offset: number;
	/** Elevación total del disparo. */
	pitch: number;
};

export type CannonShot = {
	origin: Vec3;
	velocity: Vec3;
	/** Orientación del rollo al salir (misma convención que `PaperRoll`). */
	yaw: number;
};

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function wrapAngle(angle: number): number {
	return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function rotateXZ(x: number, z: number, yaw: number): { x: number; z: number } {
	const cos = Math.cos(yaw);
	const sin = Math.sin(yaw);

	// Misma rotación que `T.Group.rotation.y` de Three.js.
	return { x: x * cos + z * sin, z: -x * sin + z * cos };
}

/**
 * Traduce la cámara en una puntería para el cañón del asiento.
 *
 * `cameraYaw` es el acimut orbital (la misma convención que el resto del
 * juego) y `cameraPhi` su inclinación (positivo mira hacia abajo). El cañón no
 * puede girar más de `CANNON_MAX_YAW` a cada lado de su dirección de asiento.
 */
export function cannonAim(
	balloonYaw: number,
	cameraYaw: number,
	cameraPhi: number,
	cannon: BalloonCannonId
): CannonAim {
	const localYaw = cameraYaw - balloonYaw;

	const offset = clamp(wrapAngle(localYaw - DEFAULT_YAW[cannon]), -CANNON_MAX_YAW, CANNON_MAX_YAW);

	const pitch = clamp(
		CANNON_ELEVATION + (CAMERA_NEUTRAL_PHI - cameraPhi) * PITCH_PER_PHI,
		CANNON_MIN_PITCH,
		CANNON_MAX_PITCH
	);

	return { offset, pitch };
}

/**
 * Convierte un cañón local en un disparo de mundo.
 *
 * `position` es la base del globo y `balloonYaw` su orientación (el morro mira
 * a −Z cuando yaw = 0). `aim.offset` gira el cañón respecto a su asiento y
 * `aim.pitch` es la elevación total.
 */
export function cannonShot(
	position: Vec3,
	balloonYaw: number,
	cannon: BalloonCannonId,
	aim: CannonAim = { offset: 0, pitch: CANNON_ELEVATION }
): CannonShot {
	const { offset, pitch } = aim;
	const localYaw = DEFAULT_YAW[cannon] + offset;
	const cosPitch = Math.cos(pitch);
	const sinPitch = Math.sin(pitch);

	// Dirección horizontal del tubo, rotada al mundo por el globo.
	const direction = rotateXZ(-Math.sin(localYaw), -Math.cos(localYaw), balloonYaw);

	// La boca gira con el cañón alrededor de su pivote: se aplica el cabeceo,
	// luego el giro de puntería y por último la orientación base del modelo.
	const lever = MUZZLE_LEVER[cannon];
	const leverX = lever[0] * cosPitch - lever[1] * sinPitch;
	const leverY = lever[0] * sinPitch + lever[1] * cosPitch;
	const yawedX = leverX * Math.cos(offset);
	const yawedZ = -leverX * Math.sin(offset);
	const base = BASE_YAW[cannon];
	const baseX = yawedX * Math.cos(base) + yawedZ * Math.sin(base);
	const baseZ = -yawedX * Math.sin(base) + yawedZ * Math.cos(base);

	const pivot = PIVOT[cannon];
	const muzzle = rotateXZ(pivot[0] + baseX, pivot[2] + baseZ, balloonYaw);

	const horizontal = cosPitch * CANNON_SPEED;
	const vertical = sinPitch * CANNON_SPEED;

	const velocity = {
		x: direction.x * horizontal,
		y: vertical,
		z: direction.z * horizontal
	};

	return {
		origin: {
			x: position.x + muzzle.x,
			y: position.y + pivot[1] + leverY,
			z: position.z + muzzle.z
		},
		velocity,
		yaw: Math.atan2(velocity.x, velocity.z)
	};
}

/** Posición local de la cámara de cada ocupante, rotada por el globo. */
export function cannonSeatPosition(position: Vec3, yaw: number, cannon: BalloonCannonId): Vec3 {
	const seat = SEAT[cannon];
	const rotated = rotateXZ(seat[0], seat[2], yaw);

	return {
		x: position.x + rotated.x,
		y: position.y + seat[1],
		z: position.z + rotated.z
	};
}

/**
 * Punto de apoyo de los pies del ocupante: el mismo asiento en horizontal,
 * pero sobre la cubierta de la canasta. `cannonSeatPosition` queda para la
 * cámara, que va ~1 m más alta (la altura de los ojos).
 */
export function cannonSeatDeckPosition(position: Vec3, yaw: number, cannon: BalloonCannonId): Vec3 {
	const seat = cannonSeatPosition(position, yaw, cannon);

	return { x: seat.x, y: position.y + BALLOON_DECK_Y, z: seat.z };
}

/**
 * `rotation.y` del avatar para mirar en la dirección del cañón. El modelo
 * mira a su +Z y el cañón, con `balloonYaw = 0`, apunta hacia −Z.
 */
export function cannonSeatFacing(yaw: number, cannon: BalloonCannonId): number {
	return yaw + DEFAULT_YAW[cannon] + Math.PI;
}
