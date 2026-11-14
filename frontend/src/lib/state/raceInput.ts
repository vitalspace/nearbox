/**
 * Driving input for the Grand Prix. Kept separate from `carInput` so the free
 * cars of SPEC-014 are never affected by the race controls.
 */
export type RaceInput = {
	throttle: number;
	steering: number;
	brake: boolean;
	handbrake: boolean;
	touchActive: boolean;
	touch: {
		throttle: number;
		steering: number;
		brake: boolean;
		handbrake: boolean;
	};
	applyTouch(): void;
	setTouch(throttle: number, steering: number): void;
	setTouchThrottle(throttle: number): void;
	setTouchSteering(steering: number): void;
	setTouchBrake(brake: boolean): void;
	setTouchHandbrake(handbrake: boolean): void;
	clearTouch(): void;
	reset(): void;
};

export const raceInput: RaceInput = {
	throttle: 0,
	steering: 0,
	brake: false,
	handbrake: false,
	touchActive: false,

	touch: {
		throttle: 0,
		steering: 0,
		brake: false,
		handbrake: false
	},

	applyTouch(): void {
		raceInput.throttle = raceInput.touch.throttle;
		raceInput.steering = raceInput.touch.steering;
		raceInput.brake = raceInput.touch.brake;
		raceInput.handbrake = raceInput.touch.handbrake;
		raceInput.touchActive =
			raceInput.touch.throttle !== 0 ||
			raceInput.touch.steering !== 0 ||
			raceInput.touch.brake ||
			raceInput.touch.handbrake;
	},

	setTouch(throttle: number, steering: number): void {
		raceInput.touch.throttle = Math.min(1, Math.max(-1, throttle));
		raceInput.touch.steering = Math.min(1, Math.max(-1, steering));
		raceInput.applyTouch();
	},

	setTouchThrottle(throttle: number): void {
		raceInput.touch.throttle = Math.min(1, Math.max(-1, throttle));
		raceInput.applyTouch();
	},

	setTouchSteering(steering: number): void {
		raceInput.touch.steering = Math.min(1, Math.max(-1, steering));
		raceInput.applyTouch();
	},

	setTouchBrake(brake: boolean): void {
		raceInput.touch.brake = brake;
		raceInput.applyTouch();
	},

	setTouchHandbrake(handbrake: boolean): void {
		raceInput.touch.handbrake = handbrake;
		raceInput.applyTouch();
	},

	clearTouch(): void {
		raceInput.touch.throttle = 0;
		raceInput.touch.steering = 0;
		raceInput.touch.brake = false;
		raceInput.touch.handbrake = false;
		raceInput.applyTouch();
	},

	reset(): void {
		raceInput.throttle = 0;
		raceInput.steering = 0;
		raceInput.brake = false;
		raceInput.handbrake = false;
		raceInput.touchActive = false;
		raceInput.touch.throttle = 0;
		raceInput.touch.steering = 0;
		raceInput.touch.brake = false;
		raceInput.touch.handbrake = false;
	}
};
