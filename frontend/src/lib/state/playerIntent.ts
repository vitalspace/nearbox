/**
 * Player movement intent for the current frame.
 *
 * `PlayerBehaviour` writes it from the keyboard/stick and `PlayerCollider`
 * consumes it from the physics task. It is kept outside `playerState` so as
 * not to mix “what I want to do” with “where I am”.
 */
export const playerIntent = {
	x: 0,
	z: 0,
	run: false,
	crouch: false
};

export function resetPlayerIntent(): void {
	playerIntent.x = 0;
	playerIntent.z = 0;
	playerIntent.run = false;
	playerIntent.crouch = false;
}
