import {
	CAR_DEFINITIONS,
	type CarEvent,
	type CarEventCause,
	type CarEventKind,
	type CarId,
	type CarImpactCause,
	type CarState,
	type CarStatus,
	type Player,
	type ServerMessage
} from './protocol';

/**
 * Authoritative state of the three cars on the outdoor map.
 *
 * The server decides occupancy, health, destruction and respawn. The driver
 * simulates the physics on their client and reports position/velocity; here only
 * ranges, frequency and impossible jumps are validated.
 */

const MAX_SPEED = 40;
const MAX_COORD = 1000;
const MIN_Y = -200;
const MAX_Y = 300;
const FALL_Y = -20;

const IMPACT_SPEED_THRESHOLD = 5;
const IMPACT_COOLDOWN_MS = 600;
const ROLLOVER_DAMAGE = 12;
const MAX_IMPACT_DAMAGE = 35;

const RESPAWN_RETRY_MS = 1000;
const RESPAWN_MAX_DELAY_MS = 10_000;
const SPAWN_SAFE_RADIUS = 3;
const SPAWN_SAFE_DY = 3;

const ENTER_RADIUS = 5;
const ENTER_MAX_DY = 3;

const STATE_RATE_WINDOW_MS = 1000;
const STATE_RATE_MAX = 20;
const TELEPORT_TOLERANCE = 3;

/** A position older than this cannot be used to validate entries or respawns. */
const POSITION_STALE_MS = 15_000;

type CarsDeps = {
	publish: (message: ServerMessage) => void;
	reportError: (playerId: string, code: string, message: string) => void;
	listGlobal: () => Player[];
};

type CarRuntime = {
	id: CarId;
	name: string;
	model: CarState['model'];
	status: CarStatus;
	driverId: string | null;
	driverName: string | null;
	position: { x: number; y: number; z: number };
	rotation: { x: number; y: number; z: number; w: number };
	velocity: { x: number; y: number; z: number };
	speed: number;
	steering: number;
	health: number;
	maxHealth: number;
	respawnAt: number | null;
	updatedAt: number;
	destroyedAt: number | null;
	lastImpactAt: number;
	rateWindowStart: number;
	rateCount: number;
};

export type CarStateReport = {
	x: number;
	y: number;
	z: number;
	qx: number;
	qy: number;
	qz: number;
	qw: number;
	vx: number;
	vy: number;
	vz: number;
	speed: number;
	steering: number;
};

let deps: CarsDeps | null = null;

const cars = new Map<CarId, CarRuntime>();
const lastPositions = new Map<string, { x: number; y: number; z: number; at: number }>();

function round(value: number): number {
	return Math.round(value * 1000) / 1000;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function horizontalDistance(ax: number, az: number, bx: number, bz: number): number {
	return Math.hypot(ax - bx, az - bz);
}

function definitionOf(carId: CarId) {
	return CAR_DEFINITIONS.find((definition) => definition.id === carId);
}

function yawToQuaternion(yaw: number): CarRuntime['rotation'] {
	return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

function createCar(definition: (typeof CAR_DEFINITIONS)[number]): CarRuntime {
	return {
		id: definition.id,
		name: definition.name,
		model: definition.model,
		status: 'available',
		driverId: null,
		driverName: null,
		position: { x: definition.spawn.x, y: definition.spawn.y, z: definition.spawn.z },
		rotation: yawToQuaternion(definition.spawn.yaw),
		velocity: { x: 0, y: 0, z: 0 },
		speed: 0,
		steering: 0,
		health: definition.maxHealth,
		maxHealth: definition.maxHealth,
		respawnAt: null,
		updatedAt: Date.now(),
		destroyedAt: null,
		lastImpactAt: 0,
		rateWindowStart: 0,
		rateCount: 0
	};
}

function copyCar(car: CarRuntime): CarState {
	return {
		id: car.id,
		name: car.name,
		model: car.model,
		status: car.status,
		driverId: car.driverId,
		driverName: car.driverName,
		position: { ...car.position },
		rotation: { ...car.rotation },
		velocity: { ...car.velocity },
		speed: round(car.speed),
		steering: round(car.steering),
		health: Math.round(car.health),
		maxHealth: car.maxHealth,
		respawnAt: car.respawnAt,
		updatedAt: car.updatedAt
	};
}

function publish(message: ServerMessage): void {
	deps?.publish(message);
}

function reportError(playerId: string, code: string, message: string): void {
	deps?.reportError(playerId, code, message);
}

function emitEvent(kind: CarEventKind, carId: CarId, now: number, extra: Partial<CarEvent> = {}): void {
	const event: CarEvent = { kind, carId, at: now, ...extra };
	publish({ type: 'car-event', event });
}

function broadcast(now: number): void {
	publish({ type: 'cars-state', serverTime: now, cars: buildCarsSnapshot() });
}

function findCarByDriver(playerId: string): CarRuntime | undefined {
	for (const car of cars.values()) {
		if (car.driverId === playerId) {
			return car;
		}
	}

	return undefined;
}

function releaseCar(
	car: CarRuntime,
	now: number,
	kind: CarEventKind,
	playerId?: string,
	cause?: CarEventCause
): void {
	car.status = 'available';
	car.driverId = null;
	car.driverName = null;
	car.velocity = { x: 0, y: 0, z: 0 };
	car.speed = 0;
	car.steering = 0;
	car.respawnAt = null;
	car.destroyedAt = null;
	car.updatedAt = now;

	emitEvent(kind, car.id, now, {
		...(playerId ? { playerId } : {}),
		...(cause ? { cause } : {})
	});
}

function destroyCar(car: CarRuntime, now: number, cause: CarEventCause): void {
	const definition = definitionOf(car.id);
	const respawnMs = definition?.respawnMs ?? 5000;

	car.status = 'destroyed';
	car.health = 0;
	car.driverId = null;
	car.driverName = null;
	car.velocity = { x: 0, y: 0, z: 0 };
	car.speed = 0;
	car.steering = 0;
	car.destroyedAt = now;
	car.respawnAt = now + respawnMs;
	car.updatedAt = now;

	emitEvent('destroyed', car.id, now, { cause });
	console.log(`[cars] destroyed ${car.id} cause=${cause} respawnIn=${respawnMs}ms`);
}

function applyDamage(car: CarRuntime, damage: number, cause: CarImpactCause, now: number): void {
	if (damage <= 0 || car.status !== 'occupied') {
		return;
	}

	car.health = Math.max(0, car.health - damage);
	car.updatedAt = now;

	emitEvent('damaged', car.id, now, {
		...(car.driverId ? { playerId: car.driverId } : {}),
		amount: damage,
		cause
	});

	if (car.health <= 0) {
		destroyCar(car, now, cause);
	}

	broadcast(now);
}

function respawnCar(car: CarRuntime, now: number): void {
	const definition = definitionOf(car.id);

	if (!definition) {
		return;
	}

	car.status = 'available';
	car.health = car.maxHealth;
	car.position = {
		x: definition.spawn.x,
		y: definition.spawn.y,
		z: definition.spawn.z
	};
	car.rotation = yawToQuaternion(definition.spawn.yaw);
	car.velocity = { x: 0, y: 0, z: 0 };
	car.speed = 0;
	car.steering = 0;
	car.respawnAt = null;
	car.destroyedAt = null;
	car.updatedAt = now;

	emitEvent('respawned', car.id, now);
	console.log(`[cars] respawn ${car.id} at ${definition.spawn.x},${definition.spawn.y},${definition.spawn.z}`);
}

function isSpawnBlocked(carId: CarId, now: number): boolean {
	const definition = definitionOf(carId);

	if (!definition || !deps) {
		return false;
	}

	for (const player of deps.listGlobal()) {
		const last = lastPositions.get(player.id);

		if (!last || now - last.at > POSITION_STALE_MS) {
			continue;
		}

		if (
			horizontalDistance(last.x, last.z, definition.spawn.x, definition.spawn.z) <
				SPAWN_SAFE_RADIUS &&
			Math.abs(last.y - definition.spawn.y) < SPAWN_SAFE_DY
		) {
			return true;
		}
	}

	return false;
}

export function initCars(next: CarsDeps): void {
	deps = next;
	resetCars();
}

export function resetCars(): void {
	cars.clear();
	lastPositions.clear();

	for (const definition of CAR_DEFINITIONS) {
		cars.set(definition.id, createCar(definition));
	}
}

export function listCars(): CarState[] {
	return buildCarsSnapshot();
}

export function getCar(carId: CarId): CarState | undefined {
	const car = cars.get(carId);

	return car ? copyCar(car) : undefined;
}

export function buildCarsSnapshot(): CarState[] {
	return CAR_DEFINITIONS.map((definition) => cars.get(definition.id))
		.filter((car): car is CarRuntime => car !== undefined)
		.map(copyCar);
}

export function onEnter(player: Player, carId: CarId, now = Date.now()): void {
	if (player.lobbyId !== 'global') {
		reportError(player.id, 'NOT_IN_GLOBAL', 'You can only drive on the outdoor map');
		return;
	}

	const car = cars.get(carId);

	if (!car) {
		reportError(player.id, 'CAR_NOT_FOUND', `The car ${carId} does not exist`);
		return;
	}

	if (findCarByDriver(player.id)) {
		reportError(player.id, 'ALREADY_DRIVING', 'You are already driving another car');
		return;
	}

	if (car.status === 'occupied') {
		reportError(player.id, 'CAR_OCCUPIED', `${car.name} is already occupied`);
		return;
	}

	if (car.status === 'destroyed') {
		reportError(player.id, 'CAR_DESTROYED', `${car.name} is destroyed`);
		return;
	}

	if (car.status === 'respawning') {
		reportError(player.id, 'CAR_RESPAWNING', `${car.name} is respawning`);
		return;
	}

	const last = lastPositions.get(player.id);

	if (last && now - last.at <= POSITION_STALE_MS) {
		const distance = horizontalDistance(last.x, last.z, car.position.x, car.position.z);
		const vertical = Math.abs(last.y - car.position.y);

		if (distance > ENTER_RADIUS || vertical > ENTER_MAX_DY) {
			reportError(player.id, 'CAR_TOO_FAR', `You are too far from ${car.name}`);
			return;
		}
	}

	car.status = 'occupied';
	car.driverId = player.id;
	car.driverName = player.name;
	car.velocity = { x: 0, y: 0, z: 0 };
	car.speed = 0;
	car.steering = 0;
	car.updatedAt = now;
	car.rateWindowStart = now;
	car.rateCount = 0;

	lastPositions.delete(player.id);

	emitEvent('entered', car.id, now, { playerId: player.id, playerName: player.name });
	broadcast(now);
	console.log(`[cars] enter ${car.id} player=${player.id} ${player.name}`);
}

export function onExit(playerId: string, carId: CarId, now = Date.now()): void {
	const car = cars.get(carId);

	if (!car) {
		reportError(playerId, 'CAR_NOT_FOUND', `El coche ${carId} no existe`);
		return;
	}

	if (!car.driverId) {
		reportError(playerId, 'NOT_DRIVING', 'You are not driving that car');
		return;
	}

	if (car.driverId !== playerId) {
		reportError(playerId, 'NOT_DRIVER', 'Only the driver can leave the car');
		return;
	}

	releaseCar(car, now, 'exited', playerId);
	broadcast(now);
	console.log(`[cars] exit ${car.id} player=${playerId}`);
}

export function onState(
	playerId: string,
	carId: CarId,
	state: CarStateReport,
	now = Date.now()
): void {
	const car = cars.get(carId);

	if (!car) {
		reportError(playerId, 'CAR_NOT_FOUND', `El coche ${carId} no existe`);
		return;
	}

	if (car.status !== 'occupied' || !car.driverId) {
		reportError(playerId, 'NOT_DRIVING', 'That car is not being driven');
		return;
	}

	if (car.driverId !== playerId) {
		reportError(playerId, 'NOT_DRIVER', 'Only the driver can report the state');
		return;
	}

	if (now - car.rateWindowStart >= STATE_RATE_WINDOW_MS) {
		car.rateWindowStart = now;
		car.rateCount = 0;
	}

	car.rateCount += 1;

	if (car.rateCount > STATE_RATE_MAX) {
		reportError(playerId, 'CAR_RATE_LIMITED', 'Too many state reports per second');
		return;
	}

	if (
		[state.x, state.y, state.z, state.vx, state.vy, state.vz].some(
			(value) => !Number.isFinite(value) || Math.abs(value) > MAX_COORD
		) ||
		state.y < MIN_Y ||
		state.y > MAX_Y
	) {
		reportError(playerId, 'CAR_INVALID_STATE', 'Car state out of range');
		return;
	}

	if (state.y < FALL_Y) {
		destroyCar(car, now, 'fall');
		broadcast(now);
		return;
	}

	const norm = Math.hypot(state.qx, state.qy, state.qz, state.qw);

	if (!Number.isFinite(norm) || norm < 0.1 || norm > 10) {
		reportError(playerId, 'CAR_INVALID_STATE', 'Invalid rotation quaternion');
		return;
	}

	const speed = Math.abs(state.speed);

	if (!Number.isFinite(speed) || speed > MAX_SPEED + 0.5) {
		reportError(playerId, 'CAR_INVALID_STATE', 'Speed out of range');
		return;
	}

	const elapsed = Math.max(0.001, (now - car.updatedAt) / 1000);
	const allowed = MAX_SPEED * elapsed + TELEPORT_TOLERANCE;
	const travelled = Math.hypot(
		state.x - car.position.x,
		state.y - car.position.y,
		state.z - car.position.z
	);

	if (travelled > allowed) {
		reportError(playerId, 'CAR_TELEPORT', 'Position jump too large');
		return;
	}

	car.position = { x: state.x, y: state.y, z: state.z };
	car.rotation = {
		x: state.qx / norm,
		y: state.qy / norm,
		z: state.qz / norm,
		w: state.qw / norm
	};
	car.velocity = { x: state.vx, y: state.vy, z: state.vz };
	car.speed = speed;
	car.steering = clamp(state.steering, -1, 1);
	car.updatedAt = now;

	// The driver does not send `player-position`: their last known position is
	// the car's, which is needed to validate the safe respawn.
	lastPositions.set(playerId, { x: state.x, y: state.y, z: state.z, at: now });
}

export function onImpact(
	playerId: string,
	carId: CarId,
	impactSpeed: number,
	cause: CarImpactCause,
	now = Date.now()
): void {
	const car = cars.get(carId);

	if (!car) {
		reportError(playerId, 'CAR_NOT_FOUND', `El coche ${carId} no existe`);
		return;
	}

	if (car.status !== 'occupied' || !car.driverId) {
		reportError(playerId, 'NOT_DRIVING', 'That car is not being driven');
		return;
	}

	if (car.driverId !== playerId) {
		reportError(playerId, 'NOT_DRIVER', 'Only the driver can report impacts');
		return;
	}

	// The cooldown is applied per car: the client can detect the same
	// hit across several consecutive frames.
	if (now - car.lastImpactAt < IMPACT_COOLDOWN_MS) {
		return;
	}

	const damage =
		cause === 'rollover'
			? ROLLOVER_DAMAGE
			: Math.round(
					clamp((Math.max(0, impactSpeed) - IMPACT_SPEED_THRESHOLD) * 3, 0, MAX_IMPACT_DAMAGE)
				);

	if (damage <= 0) {
		return;
	}

	car.lastImpactAt = now;
	applyDamage(car, damage, cause, now);
}

export function onPlayerPosition(
	playerId: string,
	x: number,
	y: number,
	z: number,
	now = Date.now()
): void {
	lastPositions.set(playerId, { x, y, z, at: now });
}

export function onPlayerLeave(
	playerId: string,
	cause: CarEventCause = 'disconnect',
	now = Date.now()
): void {
	lastPositions.delete(playerId);

	const car = findCarByDriver(playerId);

	if (!car) {
		return;
	}

	releaseCar(car, now, 'released', playerId, cause);
	broadcast(now);
	console.log(`[cars] release ${car.id} player=${playerId} cause=${cause}`);
}

export function tick(now = Date.now()): void {
	let dirty = false;

	for (const car of cars.values()) {
		if (car.status !== 'destroyed' || car.respawnAt === null) {
			continue;
		}

		if (now < car.respawnAt) {
			continue;
		}

		if (isSpawnBlocked(car.id, now)) {
			const destroyedAt = car.destroyedAt ?? now;

			if (now - destroyedAt < RESPAWN_MAX_DELAY_MS) {
				car.respawnAt = now + RESPAWN_RETRY_MS;
				dirty = true;
				continue;
			}
		}

		respawnCar(car, now);
		dirty = true;
	}

	if (dirty || hasOccupiedCars()) {
		broadcast(now);
	}
}

function hasOccupiedCars(): boolean {
	for (const car of cars.values()) {
		if (car.status === 'occupied') {
			return true;
		}
	}

	return false;
}

/** For automated tests only. */
export function debugState(): Array<{
	id: CarId;
	status: CarStatus;
	driverId: string | null;
	health: number;
	respawnAt: number | null;
}> {
	return [...cars.values()].map((car) => ({
		id: car.id,
		status: car.status,
		driverId: car.driverId,
		health: car.health,
		respawnAt: car.respawnAt
	}));
}
