/**
 * Entrada vertical del globo. El movimiento horizontal reutiliza `carInput`
 * (W/S aceleran y frenan, A/D giran), igual que los controles táctiles de los
 * coches. `lift` es -1 (bajar) .. 1 (subir).
 */
export const balloonInput = {
	lift: 0,
	touchLift: 0,
	touchActive: false,

	applyTouch(): void {
		balloonInput.lift = balloonInput.touchLift;
		balloonInput.touchActive = balloonInput.touchLift !== 0;
	},

	setTouchLift(lift: number): void {
		balloonInput.touchLift = Math.min(1, Math.max(-1, lift));
		balloonInput.applyTouch();
	},

	clearTouch(): void {
		balloonInput.touchLift = 0;
		balloonInput.applyTouch();
	},

	reset(): void {
		balloonInput.lift = 0;
		balloonInput.touchLift = 0;
		balloonInput.touchActive = false;
	}
};
