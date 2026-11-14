/**
 * Entrada de conducción. Es un objeto plano (no reactivo) porque la física lo
 * lee en cada tick; los controles de teclado y los controles táctiles lo
 * escriben.
 *
 * El stick táctil y los botones de móvil comparten el mismo estado `touch`:
 * así se pueden pulsar a la vez (girar con una mano y acelerar con la otra)
 * sin que uno sobrescriba al otro.
 */
export const carInput = {
	/** -1 (marcha atrás) .. 1 (acelerar). */
	throttle: 0,
	/** -1 (izquierda) .. 1 (derecha). */
	steering: 0,
	brake: false,
	handbrake: false,
	/** El control táctil tiene prioridad sobre el teclado mientras esté activo. */
	touchActive: false,

	touch: {
		throttle: 0,
		steering: 0,
		brake: false,
		handbrake: false
	},

	/** Vuelca el estado táctil en la entrada que lee la física. */
	applyTouch(): void {
		carInput.throttle = carInput.touch.throttle;
		carInput.steering = carInput.touch.steering;
		carInput.brake = carInput.touch.brake;
		carInput.handbrake = carInput.touch.handbrake;
		carInput.touchActive =
			carInput.touch.throttle !== 0 ||
			carInput.touch.steering !== 0 ||
			carInput.touch.brake ||
			carInput.touch.handbrake;
	},

	/** Stick analógico: acelerador y dirección a la vez. */
	setTouch(throttle: number, steering: number): void {
		carInput.touch.throttle = Math.min(1, Math.max(-1, throttle));
		carInput.touch.steering = Math.min(1, Math.max(-1, steering));
		carInput.applyTouch();
	},

	setTouchThrottle(throttle: number): void {
		carInput.touch.throttle = Math.min(1, Math.max(-1, throttle));
		carInput.applyTouch();
	},

	setTouchSteering(steering: number): void {
		carInput.touch.steering = Math.min(1, Math.max(-1, steering));
		carInput.applyTouch();
	},

	setTouchBrake(brake: boolean): void {
		carInput.touch.brake = brake;
		carInput.applyTouch();
	},

	setTouchHandbrake(handbrake: boolean): void {
		carInput.touch.handbrake = handbrake;
		carInput.applyTouch();
	},

	clearTouch(): void {
		carInput.touch.throttle = 0;
		carInput.touch.steering = 0;
		carInput.touch.brake = false;
		carInput.touch.handbrake = false;
		carInput.applyTouch();
	},

	reset(): void {
		carInput.throttle = 0;
		carInput.steering = 0;
		carInput.brake = false;
		carInput.handbrake = false;
		carInput.touchActive = false;
		carInput.touch.throttle = 0;
		carInput.touch.steering = 0;
		carInput.touch.brake = false;
		carInput.touch.handbrake = false;
	}
};
