import type { CarEvent, CarId, CarState } from '../services/protocol';
import type { CarStateReport } from '../services/lobbySocket';
import {
	CAR_ORDER,
	CAR_SPAWNS,
	CHASSIS_CENTER_Y,
	EJECT_DISTANCE,
	ENTER_MAX_DY,
	ENTER_RADIUS,
	yawFromQuaternion
} from './carConfig';
import { PLAYER_SPAWN, playerState } from './playerState';
import {
	lerp,
	lerpQuaternion,
	REMOTE_RENDER_DELAY_MS,
	SampleBuffer,
	ServerClock,
	sameNumber
} from './remoteSync';

/** A teleport (respawn, release, reconnect) must snap instead of sliding. */
const MAX_SNAP_DISTANCE = 10;

export type CarVisual = {
	position: { x: number; y: number; z: number };
	rotation: { x: number; y: number; z: number; w: number };
	velocity: { x: number; y: number; z: number };
	speed: number;
	steering: number;
};

function visualFromCar(car: CarState): CarVisual {
	return {
		position: { x: car.position.x, y: car.position.y, z: car.position.z },
		rotation: {
			x: car.rotation.x,
			y: car.rotation.y,
			z: car.rotation.z,
			w: car.rotation.w
		},
		velocity: { x: car.velocity.x, y: car.velocity.y, z: car.velocity.z },
		speed: car.speed,
		steering: car.steering
	};
}

function sameVisual(a: CarVisual, b: CarVisual): boolean {
	return (
		sameNumber(a.position.x, b.position.x) &&
		sameNumber(a.position.y, b.position.y) &&
		sameNumber(a.position.z, b.position.z) &&
		sameNumber(a.rotation.x, b.rotation.x, 0.000001) &&
		sameNumber(a.rotation.y, b.rotation.y, 0.000001) &&
		sameNumber(a.rotation.z, b.rotation.z, 0.000001) &&
		sameNumber(a.rotation.w, b.rotation.w, 0.000001) &&
		sameNumber(a.speed, b.speed) &&
		sameNumber(a.steering, b.steering)
	);
}

function mixVisual(a: CarVisual, b: CarVisual, t: number): CarVisual {
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
		speed: lerp(a.speed, b.speed, t),
		steering: lerp(a.steering, b.steering, t)
	};
}

export type CarSender = {
	enter(carId: CarId): boolean;
	exit(carId: CarId): boolean;
	state(report: CarStateReport): boolean;
	impact(carId: CarId, impactSpeed: number, cause: 'collision' | 'rollover'): boolean;
};

export type CarEjectRequest = {
	x: number;
	/** Altura de los pies del jugador. */
	y: number;
	z: number;
};

class CarsStore {
	/** Último snapshot autoritativo del servidor, indexado por id. */
	cars = $state.raw<Partial<Record<CarId, CarState>>>({});
	selfId = $state<string | null>(null);
	selfDrivingId = $state<CarId | null>(null);
	lastDestroyedId = $state<CarId | null>(null);
	nearestId = $state<CarId | null>(null);
	ejectRequest = $state<CarEjectRequest | null>(null);
	lastEvent = $state<CarEvent | null>(null);
	/** Contador monotónico de sesión para consumir `lastEvent` una sola vez. */
	eventSeq = $state(0);
	/** Short player-facing reason why pressing E did not enter a car. */
	entryHint = $state<string | null>(null);

	private sender: CarSender | null = null;
	private clock = new ServerClock();
	private buffers = new Map<CarId, SampleBuffer<CarVisual>>();

	get selfCar(): CarState | null {
		return this.selfDrivingId ? (this.cars[this.selfDrivingId] ?? null) : null;
	}

	get nearestAvailable(): CarState | null {
		return this.nearestId ? (this.cars[this.nearestId] ?? null) : null;
	}

	get isDriving(): boolean {
		return this.selfDrivingId !== null;
	}

	/**
	 * Increments when the driver asks to right their car in place. The driver's
	 * `VehiclePhysics` watches it and clears roll/pitch without moving the car.
	 */
	flipToken = $state(0);

	requestFlip(): boolean {
		if (!this.selfDrivingId) {
			return false;
		}

		this.flipToken += 1;
		return true;
	}

	/** Jugadores que están dentro de un coche (para ocultar sus avatares). */
	get driverIds(): Set<string> {
		const ids = new Set<string>();

		for (const car of Object.values(this.cars)) {
			if (car?.driverId) {
				ids.add(car.driverId);
			}
		}

		return ids;
	}

	setSender(sender: CarSender): void {
		this.sender = sender;
	}

	applySnapshot(serverTime: number, list: CarState[]): void {
		// Same smoothed clock as every other multiplayer scene: replacing the
		// offset on every packet made remote cars jump with network jitter.
		// Snapshots arrive at 10 Hz, so only trim the drift a little each time.
		this.clock.sync(serverTime, 0.05);

		const next: Partial<Record<CarId, CarState>> = {};
		const alive = new Set<CarId>();

		for (const car of list) {
			next[car.id] = car;
			alive.add(car.id);

			let buffer = this.buffers.get(car.id);

			if (!buffer) {
				buffer = new SampleBuffer<CarVisual>(sameVisual);
				this.buffers.set(car.id, buffer);
			}

			const previous = this.cars[car.id];
			const visual = visualFromCar(car);
			const last = buffer.latest;

			if (previous && (previous.status !== car.status || previous.respawnAt !== car.respawnAt)) {
				// Destroyed/respawned/released: the body was repositioned by the
				// server, so interpolation must start over instead of sliding.
				buffer.clear();
			} else if (last) {
				const distance = Math.hypot(
					visual.position.x - last.value.position.x,
					visual.position.y - last.value.position.y,
					visual.position.z - last.value.position.z
				);

				if (distance > MAX_SNAP_DISTANCE) {
					buffer.clear();
				}
			}

			buffer.push(serverTime, visual);
		}

		for (const id of this.buffers.keys()) {
			if (!alive.has(id)) {
				this.buffers.delete(id);
			}
		}

		this.cars = next;

		if (this.selfId) {
			const driven = list.find((car) => car.driverId === this.selfId);
			this.selfDrivingId = driven?.id ?? null;
		}
	}

	/** Estimated server time, used by the renderer. */
	serverNow(): number {
		return this.clock.now();
	}

	/**
	 * Interpolated visual state of a free car. The local driver is rendered by
	 * Rapier (authority) and should use the raw snapshot instead; remote and
	 * parked cars use this.
	 */
	sampleCar(carId: CarId, now = this.clock.now()): CarVisual | null {
		const car = this.cars[carId];

		if (!car) {
			return null;
		}

		const buffer = this.buffers.get(carId);

		if (!buffer) {
			return visualFromCar(car);
		}

		return buffer.sample(now - REMOTE_RENDER_DELAY_MS, mixVisual) ?? visualFromCar(car);
	}

	applyEvent(event: CarEvent): void {
		this.lastEvent = event;
		this.eventSeq += 1;
		const isSelf = event.playerId !== undefined && event.playerId === this.selfId;

		if (event.kind === 'entered' && isSelf) {
			this.selfDrivingId = event.carId;
			this.lastDestroyedId = null;
			this.entryHint = null;
		}

		if (event.kind === 'destroyed' && this.selfDrivingId === event.carId) {
			this.lastDestroyedId = event.carId;
			this.ejectSelf(event.carId);
		}

		if (event.kind === 'exited' && isSelf) {
			this.ejectSelf(event.carId);
		}

		// Al cambiar de escena o desconectar no se eyecta: la escena destino
		// coloca al jugador en su propio spawn.
		if (event.kind === 'released' && isSelf) {
			this.selfDrivingId = null;
		}

		if (event.kind === 'respawned' && this.lastDestroyedId === event.carId) {
			this.lastDestroyedId = null;
		}
	}

	/** Calcula el coche disponible más cercano para el prompt y el móvil. */
	updateNearest(x: number, z: number): void {
		let best: CarId | null = null;
		let bestDistance = ENTER_RADIUS;

		for (const id of CAR_ORDER) {
			const car = this.cars[id];

			if (!car || car.status !== 'available') {
				continue;
			}

			const horizontal = Math.hypot(x - car.position.x, z - car.position.z);
			const vertical = Math.abs(playerState.y + 1 - car.position.y);

			if (horizontal <= bestDistance && vertical <= ENTER_MAX_DY) {
				best = id;
				bestDistance = horizontal;
			}
		}

		if (this.nearestId !== best) {
			this.nearestId = best;
		}
	}

	requestEnter(carId: CarId | null = this.nearestId): boolean {
		if (!carId || this.selfDrivingId) {
			return false;
		}

		return this.sender?.enter(carId) ?? false;
	}

	requestExit(): boolean {
		const carId = this.selfDrivingId;

		if (!carId) {
			return false;
		}

		return this.sender?.exit(carId) ?? false;
	}

	sendState(report: CarStateReport): boolean {
		return this.sender?.state(report) ?? false;
	}

	sendImpact(carId: CarId, impactSpeed: number, cause: 'collision' | 'rollover'): boolean {
		return this.sender?.impact(carId, impactSpeed, cause) ?? false;
	}

	consumeEject(): void {
		this.ejectRequest = null;
	}

	setEntryHint(message: string | null): void {
		this.entryHint = message;
	}

	/** Limpia el estado de conducción sin tocar los snapshots (cambio de escena). */
	resetDriving(): void {
		this.selfDrivingId = null;
		this.ejectRequest = null;
	}

	reset(): void {
		this.cars = {};
		this.selfId = null;
		this.selfDrivingId = null;
		this.lastDestroyedId = null;
		this.nearestId = null;
		this.ejectRequest = null;
		this.lastEvent = null;
		this.entryHint = null;
		this.flipToken = 0;
		this.sender = null;
		this.buffers.clear();
		this.clock.reset();
	}

	private ejectSelf(carId: CarId): void {
		const car = this.cars[carId];
		const spawn = CAR_SPAWNS[carId];

		let x = PLAYER_SPAWN.x;
		let y = PLAYER_SPAWN.y;
		let z = PLAYER_SPAWN.z;

		if (car) {
			const yaw = yawFromQuaternion(car.rotation);

			// Lado izquierdo del coche: el morro local es +X, así que la
			// izquierda es -Z local, que en mundo es (-sin yaw, 0, -cos yaw).
			x = car.position.x - Math.sin(yaw) * EJECT_DISTANCE;
			z = car.position.z - Math.cos(yaw) * EJECT_DISTANCE;
			y = Math.max(PLAYER_SPAWN.y, car.position.y - CHASSIS_CENTER_Y + 0.05);
		} else {
			x = spawn.x;
			y = spawn.y - CHASSIS_CENTER_Y;
			z = spawn.z;
		}

		this.ejectRequest = { x, y, z };
		this.selfDrivingId = null;
	}
}

export const cars = new CarsStore();
