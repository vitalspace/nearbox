import type { BalloonState } from '../services/protocol';
import type { BalloonStateReport } from '../services/lobbySocket';
import { cannonAim, cannonShot, type BalloonCannonId } from './balloonCannons';
import { paperRolls } from './paperRolls.svelte';
import {
	BALLOON_EJECT_DISTANCE,
	BALLOON_ENTER_MAX_DY,
	BALLOON_ENTER_RADIUS,
	BALLOON_MAX_RADIUS
} from './balloonConfig';
import { yawFromQuaternion } from './carConfig';
import { PLAYER_SPAWN, playerState } from './playerState';
import {
	lerp,
	lerpQuaternion,
	REMOTE_RENDER_DELAY_MS,
	SampleBuffer,
	ServerClock,
	sameNumber
} from './remoteSync';

/** A teleport (reconnect, respawn) must snap instead of sliding. */
const MAX_SNAP_DISTANCE = 20;

export type BalloonSeat = 'pilot' | 'left' | 'right';

/** Vista de cámara del ocupante local. */
export type BalloonView = 'first' | 'turret' | 'third';

/** Orden del ciclo de la tecla `V`. */
export const BALLOON_VIEWS: readonly BalloonView[] = ['first', 'turret', 'third'];

function seatOf(state: BalloonState | null, playerId: string | null): BalloonSeat | null {
	if (!state || !playerId) return null;
	if (state.driverId === playerId) return 'pilot';
	if (state.leftGunnerId === playerId) return 'left';
	if (state.rightGunnerId === playerId) return 'right';
	return null;
}

/** Un asiento está libre si nadie lo ocupa. */
function isSeatFree(state: BalloonState, seat: BalloonSeat): boolean {
	if (seat === 'pilot') return state.driverId === null;
	if (seat === 'left') return state.leftGunnerId === null;
	return state.rightGunnerId === null;
}

export function cannonForSeat(seat: BalloonSeat): BalloonCannonId {
	return seat === 'pilot' ? 'front' : seat === 'left' ? 'left' : 'right';
}

export type BalloonVisual = {
	position: { x: number; y: number; z: number };
	rotation: { x: number; y: number; z: number; w: number };
	velocity: { x: number; y: number; z: number };
	speed: number;
};

function visualFromBalloon(balloon: BalloonState): BalloonVisual {
	return {
		position: { x: balloon.position.x, y: balloon.position.y, z: balloon.position.z },
		rotation: {
			x: balloon.rotation.x,
			y: balloon.rotation.y,
			z: balloon.rotation.z,
			w: balloon.rotation.w
		},
		velocity: { x: balloon.velocity.x, y: balloon.velocity.y, z: balloon.velocity.z },
		speed: balloon.speed
	};
}

function sameVisual(a: BalloonVisual, b: BalloonVisual): boolean {
	return (
		sameNumber(a.position.x, b.position.x) &&
		sameNumber(a.position.y, b.position.y) &&
		sameNumber(a.position.z, b.position.z) &&
		sameNumber(a.rotation.x, b.rotation.x, 0.000001) &&
		sameNumber(a.rotation.y, b.rotation.y, 0.000001) &&
		sameNumber(a.rotation.z, b.rotation.z, 0.000001) &&
		sameNumber(a.rotation.w, b.rotation.w, 0.000001) &&
		sameNumber(a.speed, b.speed)
	);
}

function mixVisual(a: BalloonVisual, b: BalloonVisual, t: number): BalloonVisual {
	return {
		position: {
			x: lerp(a.position.x, b.position.x, t),
			y: lerp(a.position.y, b.position.y, t),
			z: lerp(a.position.z, b.position.z, t)
		},
		rotation: lerpQuaternion(a.rotation, b.rotation, t),
		velocity: {
			x: lerp(a.velocity.x, b.velocity.x, t),
			y: lerp(a.velocity.y, b.velocity.y, t),
			z: lerp(a.velocity.z, b.velocity.z, t)
		},
		speed: lerp(a.speed, b.speed, t)
	};
}

export type BalloonSender = {
	enter(): boolean;
	exit(): boolean;
	switchSeat(seat: BalloonSeat): boolean;
	state(report: BalloonStateReport): boolean;
};

export type BalloonEjectRequest = {
	x: number;
	/** Altura de los pies del jugador. */
	y: number;
	z: number;
};

class BalloonStore {
	/** Último snapshot autoritativo del servidor. */
	state = $state.raw<BalloonState | null>(null);
	selfId = $state<string | null>(null);
	nearest = $state(false);
	entryHint = $state<string | null>(null);
	ejectRequest = $state<BalloonEjectRequest | null>(null);
	/** Vista del ocupante local: 1ª persona, torreta o 3ª persona. */
	view = $state<BalloonView>('first');

	private sender: BalloonSender | null = null;
	private clock = new ServerClock();
	private buffer = new SampleBuffer<BalloonVisual>(sameVisual);
	/** Última pose local, usada para disparar sin esperar al snapshot. */
	private liveVisual: BalloonVisual | null = null;

	get driverId(): string | null {
		return this.state?.driverId ?? null;
	}

	/** Asiento del jugador local: piloto, artillero o `null`. */
	get selfSeat(): BalloonSeat | null {
		return seatOf(this.state, this.selfId);
	}

	get isDriving(): boolean {
		return this.selfSeat === 'pilot';
	}

	get isGunner(): boolean {
		return this.selfSeat === 'left' || this.selfSeat === 'right';
	}

	/** Hay alguien a bordo (piloto o artillero). */
	get isOccupied(): boolean {
		return this.driverId !== null;
	}

	/** El jugador local está a bordo (pilota o dispara un cañón lateral). */
	get isOccupant(): boolean {
		return this.selfSeat !== null;
	}

	/** Etiqueta corta de la vista actual, para el HUD. */
	get viewLabel(): string {
		return this.view === 'first'
			? '1st person'
			: this.view === 'turret'
				? '2nd person'
				: '3rd person';
	}

	/** Rota la vista: 1ª persona → torreta → 3ª persona (o al revés). */
	cycleView(direction: 1 | -1 = 1): void {
		const index = BALLOON_VIEWS.indexOf(this.view);
		const count = BALLOON_VIEWS.length;

		this.view = BALLOON_VIEWS[(index + direction + count) % count];
	}

	/** ¿Ese jugador ocupa un asiento (piloto o artillero)? */
	isCrew(playerId: string | null | undefined): boolean {
		const state = this.state;

		if (!state || !playerId) return false;

		return (
			state.driverId === playerId ||
			state.leftGunnerId === playerId ||
			state.rightGunnerId === playerId
		);
	}

	/** Asiento de cualquier jugador (local o remoto), o `null`. */
	seatOfPlayer(playerId: string | null | undefined): BalloonSeat | null {
		return seatOf(this.state, playerId ?? null);
	}

	/** Orientación actual del globo (rad). */
	get yaw(): number {
		const visual = this.liveVisual;
		if (visual) return yawFromQuaternion(visual.rotation);
		return this.state ? yawFromQuaternion(this.state.rotation) : 0;
	}

	/** Posición actual del globo en el mundo. */
	get position(): { x: number; y: number; z: number } {
		const visual = this.liveVisual;
		if (visual) return visual.position;
		return this.state ? this.state.position : { x: 0, y: 0, z: 0 };
	}

	get hasFreeSeat(): boolean {
		return this.freeSeats.length > 0;
	}

	/** Asientos libres, en orden de preferencia. */
	get freeSeats(): BalloonSeat[] {
		const state = this.state;

		if (!state) return [];

		const seats: BalloonSeat[] = [];

		if (!state.driverId) seats.push('pilot');
		if (!state.leftGunnerId) seats.push('left');
		if (!state.rightGunnerId) seats.push('right');

		return seats;
	}

	/**
	 * Siguiente asiento al que puede saltar el jugador local sin bajarse.
	 * Desde un cañón se prioriza el pilotaje; desde el pilotaje se rota a un
	 * cañón libre. Devuelve `null` si no hay otro asiento disponible.
	 */
	get nextSeat(): BalloonSeat | null {
		const state = this.state;
		const current = this.selfSeat;

		if (!state || !current) return null;

		const order: BalloonSeat[] =
			current === 'pilot' ? ['left', 'right'] : ['pilot', current === 'left' ? 'right' : 'left'];

		for (const seat of order) {
			if (isSeatFree(state, seat)) return seat;
		}

		return null;
	}

	/** Guarda la pose que se está dibujando para calcular el disparo. */
	setLiveVisual(visual: BalloonVisual): void {
		if (!this.liveVisual) {
			this.liveVisual = {
				position: { ...visual.position },
				rotation: { ...visual.rotation },
				velocity: { ...visual.velocity },
				speed: visual.speed
			};
			return;
		}

		this.liveVisual.position.x = visual.position.x;
		this.liveVisual.position.y = visual.position.y;
		this.liveVisual.position.z = visual.position.z;
		this.liveVisual.rotation.x = visual.rotation.x;
		this.liveVisual.rotation.y = visual.rotation.y;
		this.liveVisual.rotation.z = visual.rotation.z;
		this.liveVisual.rotation.w = visual.rotation.w;
		this.liveVisual.velocity.x = visual.velocity.x;
		this.liveVisual.velocity.y = visual.velocity.y;
		this.liveVisual.velocity.z = visual.velocity.z;
		this.liveVisual.speed = visual.speed;
	}

	setSender(sender: BalloonSender): void {
		this.sender = sender;
	}

	applyState(serverTime: number, state: BalloonState): void {
		this.clock.sync(serverTime, 0.05);

		const previous = this.state;
		const previousSeat = seatOf(previous, this.selfId);
		const nextSeat = seatOf(state, this.selfId);

		const visual = visualFromBalloon(state);
		const last = this.buffer.latest;

		if (!previous || previous.driverId !== state.driverId) {
			this.buffer.clear();
		} else if (last) {
			const distance = Math.hypot(
				visual.position.x - last.value.position.x,
				visual.position.y - last.value.position.y,
				visual.position.z - last.value.position.z
			);

			if (distance > MAX_SNAP_DISTANCE) {
				this.buffer.clear();
			}
		}

		this.buffer.push(serverTime, visual);
		this.state = state;

		if (previousSeat && !nextSeat && previous) {
			this.ejectNear(previous);
		}
	}

	/** Estimated server time, used by the renderer. */
	serverNow(): number {
		return this.clock.now();
	}

	/** Interpolated visual state for remote/parked balloons. */
	sample(now = this.clock.now()): BalloonVisual | null {
		const state = this.state;

		if (!state) {
			return null;
		}

		return this.buffer.sample(now - REMOTE_RENDER_DELAY_MS, mixVisual) ?? visualFromBalloon(state);
	}

	/** ¿Está el jugador lo bastante cerca de la canasta para subir? */
	updateNearest(x: number, y: number, z: number): void {
		const state = this.state;
		let near = false;

		if (state && !this.selfSeat && this.hasFreeSeat) {
			const horizontal = Math.hypot(x - state.position.x, z - state.position.z);
			const vertical = Math.abs(y - state.position.y);

			near = horizontal <= BALLOON_ENTER_RADIUS && vertical <= BALLOON_ENTER_MAX_DY;
		}

		if (this.nearest !== near) {
			this.nearest = near;
		}
	}

	requestEnter(): boolean {
		if (this.isOccupant || !this.hasFreeSeat) {
			return false;
		}

		return this.sender?.enter() ?? false;
	}

	requestExit(): boolean {
		if (!this.isOccupant) {
			return false;
		}

		return this.sender?.exit() ?? false;
	}

	/**
	 * Cambia de asiento sin bajar del globo. Sin argumento usa `nextSeat`
	 * (pilotar ⇄ cañones). Solo se aceptan asientos libres.
	 */
	requestSwitchSeat(seat?: BalloonSeat): boolean {
		const state = this.state;
		const target = seat ?? this.nextSeat;

		if (!state || !this.isOccupant || !target) {
			return false;
		}

		if (target === this.selfSeat || !isSeatFree(state, target)) {
			return false;
		}

		// Al dejar el pilotaje se reporta primero la pose dibujada: el globo
		// queda aparcado donde se ve, no donde llegó el último reporte (que
		// puede ir con hasta un intervalo de retraso).
		if (this.isDriving && this.liveVisual) {
			const visual = this.liveVisual;

			this.sendState({
				x: visual.position.x,
				y: visual.position.y,
				z: visual.position.z,
				qx: visual.rotation.x,
				qy: visual.rotation.y,
				qz: visual.rotation.z,
				qw: visual.rotation.w,
				vx: 0,
				vy: 0,
				vz: 0,
				speed: 0
			});
		}

		return this.sender?.switchSeat(target) ?? false;
	}

	sendState(report: BalloonStateReport): boolean {
		return this.sender?.state(report) ?? false;
	}

	/** Dispara el cañón del asiento local. Devuelve `true` si salió el rollo. */
	fireCannon(): boolean {
		const seat = this.selfSeat;

		if (!seat) {
			return false;
		}

		const visual = this.liveVisual ?? (this.state ? visualFromBalloon(this.state) : null);

		if (!visual) {
			return false;
		}

		const cannon = cannonForSeat(seat);
		const yaw = yawFromQuaternion(visual.rotation);
		const aim = cannonAim(yaw, playerState.cameraYaw, playerState.cameraPhi, cannon);
		const shot = cannonShot(visual.position, yaw, cannon, aim);

		return paperRolls.fireCannon(cannon, shot.origin, shot.velocity) !== null;
	}

	consumeEject(): void {
		this.ejectRequest = null;
	}

	setEntryHint(message: string | null): void {
		this.entryHint = message;
	}

	/** Limpia el pilotaje sin borrar el snapshot (cambio de escena). */
	resetDriving(): void {
		this.ejectRequest = null;
	}

	reset(): void {
		this.state = null;
		this.selfId = null;
		this.nearest = false;
		this.entryHint = null;
		this.ejectRequest = null;
		this.view = 'first';
		this.sender = null;
		this.buffer.clear();
		this.clock.reset();
		this.liveVisual = null;
	}

	/** Coloca al jugador junto a la canasta al bajar del globo. */
	private ejectNear(balloon: BalloonState): void {
		const yaw = yawFromQuaternion(balloon.rotation);

		let x = balloon.position.x + Math.cos(yaw) * BALLOON_EJECT_DISTANCE;
		let z = balloon.position.z - Math.sin(yaw) * BALLOON_EJECT_DISTANCE;

		const radius = Math.hypot(x, z);

		if (radius > BALLOON_MAX_RADIUS - 2) {
			const scale = (BALLOON_MAX_RADIUS - 2) / radius;
			x *= scale;
			z *= scale;
		}

		this.ejectRequest = { x, y: PLAYER_SPAWN.y, z };
	}
}

export const balloon = new BalloonStore();
