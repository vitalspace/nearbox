/**
 * Skyfall Royale (minijuego 8) — motor autoritativo.
 *
 * Fases: `idle → countdown (30 s) → playing (10 min) → results (20 s)`.
 * Sin equipos, sin respawn. El servidor decide zepelín, salto, loot, daño,
 * tormenta, puestos, bots y resultado.
 */
import type {
	Mg8Event,
	Mg8EventKind,
	Mg8Loot,
	Mg8Mode,
	Mg8Phase,
	Mg8PlayerState,
	Mg8Positions,
	Mg8Snapshot,
	Mg8Storm,
	Mg8VehiclePose,
	Mg8VehicleState,
	SkinId
} from '../protocol';
import { DEFAULT_SKIN } from '../protocol';
import type { RoomPort } from '../port';
import { attestEvent, newMatchId } from '../../progression/attest';
import {
	ROYALE_AMMO_PICKUP,
	ROYALE_BOARDING_MS,
	ROYALE_BOT_ANCHORS,
	ROYALE_BOT_FILL,
	ROYALE_COUNTDOWN_MS,
	ROYALE_GRENADE_COOLDOWN_MS,
	ROYALE_GRENADE_FUSE_MS,
	ROYALE_GRENADE_RADIUS,
	ROYALE_GRENADE_VERTICAL_REACH,
	ROYALE_HEALTH_MAX,
	ROYALE_JUMP_DELAY_MS,
	ROYALE_JUMP_WINDOW_MS,
	ROYALE_KILL_CREDIT_MS,
	ROYALE_KILL_Y,
	ROYALE_LAG_COMPENSATION_MS,
	ROYALE_LOOT_ANCHORS,
	ROYALE_LOOT_RADIUS,
	ROYALE_LOOT_VERTICAL,
	ROYALE_MATCH_MS,
	ROYALE_MAX_AMMO,
	ROYALE_MAX_GRENADES,
	ROYALE_MAX_GROUND_SPEED,
	ROYALE_MAX_PLAYERS,
	ROYALE_MAX_POSITION_Y,
	ROYALE_MEDKIT_HEAL,
	ROYALE_POSITION_INTERVAL_MS,
	ROYALE_RECONNECT_MS,
	ROYALE_RESULT_MS,
	ROYALE_SHIELD_MAX,
	ROYALE_SHIELD_PICKUP,
	ROYALE_SHOT_ORIGIN_TOL,
	ROYALE_STARTER_AMMO,
	ROYALE_STARTER_GRENADES,
	ROYALE_STARTER_WEAPON,
	ROYALE_STATE_INTERVAL_MS,
	ROYALE_STORM_DAMAGE_INTERVAL_MS,
	ROYALE_STORM_START_MS,
	ROYALE_WEAPON_BY_ID,
	ROYALE_WEAPON_SLOT_BY_ID,
	ROYALE_WEAPON_BY_SLOT,
	ROYALE_MAP_BOUNDS,
	ROYALE_BALLOON_BOUNDS_MARGIN,
	ROYALE_BALLOON_LIFT_SPEED,
	ROYALE_BALLOON_MAX_SPEED,
	ROYALE_BALLOON_MAX_Y,
	ROYALE_BALLOON_SEAT_OFFSET,
	ROYALE_CAR_MAX_SPEED,
	ROYALE_CAR_SEAT_OFFSET,
	ROYALE_VEHICLE_BLAST_DAMAGE,
	ROYALE_VEHICLE_BLAST_EDGE_DAMAGE,
	ROYALE_VEHICLE_BLAST_RADIUS,
	ROYALE_VEHICLE_ENTER_MAX_DY,
	ROYALE_VEHICLE_ENTER_RADIUS,
	ROYALE_VEHICLE_EXIT_DISTANCE,
	ROYALE_VEHICLE_HEALTH,
	ROYALE_VEHICLE_RAM_COOLDOWN_MS,
	ROYALE_VEHICLE_RAM_DAMAGE,
	ROYALE_VEHICLE_RAM_SPEED,
	ROYALE_VEHICLE_SPAWNS,
	ROYALE_VEHICLE_TELEPORT_TOL,
	ROYALE_WATER_RESCUE_Y,
	royaleArcHit,
	royaleBotId,
	royaleBotName,
	royaleBotStormMargin,
	royaleFallDamage,
	royaleJumpPosition,
	royaleRollLoot,
	royaleSafePoint,
	royaleStormAt,
	royaleZeppelinAt,
	type RoyaleLootKind,
	type RoyaleMode,
	type RoyaleStormState,
	type RoyaleVec3,
	type RoyaleVehicleKind,
	type RoyaleWeaponId
} from '../../lib/state/royaleConfig';
import {
	createBotMind,
	updateBot,
	type BotLoot,
	type BotMind,
	type BotPlayer,
	type BotStorm,
	type BotWorld
} from './royaleBots';
import {
	grenadeDamageAt,
	hasLineOfSight,
	rayPointDistance2D,
	round,
	spreadDirection
} from './royaleCombat';
import { findPath, floorHeightAt, nearestWalkable } from './royaleNav';

const GRENADE_GRAVITY = 9.8;
const GRENADE_THROW_FALLBACK_RANGE = 18;
const POSITION_SPEED_TOLERANCE = 2;

type RoyalePlayer = {
	id: string;
	name: string;
	skin: SkinId;
	isBot: boolean;
	alive: boolean;
	health: number;
	shield: number;
	kills: number;
	damage: number;
	weapon: RoyaleWeaponId;
	magAmmo: number;
	reserveAmmo: number;
	grenades: number;
	inventory: Map<RoyaleWeaponId, number>;
	mode: RoyaleMode;
	x: number;
	y: number;
	z: number;
	yaw: number;
	vy: number;
	seat: number;
	jumped: boolean;
	/** Altura de la barquilla al salir de un globo en vuelo; null en cualquier otro caso. */
	fallStartY: number | null;
	lastPositionAt: number;
	lastShotAt: number;
	lastReloadAt: number;
	lastGrenadeAt: number;
	lastAttackerId: string | null;
	lastAttackerAt: number;
	lastHurtEventAt: number;
	disconnectedAt: number | null;
	placement: number | null;
	seq: number;
	/** Posiciones recientes para compensar el retardo de render del cliente. */
	track: RoyaleTrack[];
	bot?: BotMind;
};

type RoyaleTrack = {
	at: number;
	x: number;
	y: number;
	z: number;
	mode: RoyaleMode;
};

type RoomGrenade = {
	id: string;
	ownerId: string;
	x: number;
	y: number;
	z: number;
	vx: number;
	vy: number;
	vz: number;
	originX: number;
	originY: number;
	originZ: number;
	launchedAt: number;
	flightMs: number;
	fuseAt: number;
	targetX: number;
	targetZ: number;
	/** Altura del impacto cuando la parábola choca con un muro. */
	clipY: number | null;
};

/**
 * Coche o globo del battle royale.
 *
 * El cliente que conduce simula la física y reporta la pose a 10 Hz; el
 * servidor valida rangos, velocidad y saltos imposibles, y es dueño de la
 * vida, la destrucción y la explosión. Los vehículos no respawnean durante
 * una partida: se restauran al empezar la siguiente.
 */
type RoomVehicle = {
	id: string;
	kind: RoyaleVehicleKind;
	name: string;
	model: string | null;
	spawnX: number;
	spawnY: number;
	spawnZ: number;
	spawnYaw: number;
	x: number;
	y: number;
	z: number;
	qx: number;
	qy: number;
	qz: number;
	qw: number;
	yaw: number;
	speed: number;
	health: number;
	maxHealth: number;
	destroyed: boolean;
	driverId: string | null;
	lastStateAt: number;
	lastHitAt: number;
	lastHitBy: string | null;
	/** Último atropello por víctima; evita daño múltiple en el mismo roce. */
	ramCooldowns: Map<string, number>;
};

export type RoyaleDeps = {
	moveToLobby: (playerId: string) => void;
};

export type RoyaleOptions = {
	seed?: number;
	botsEnabled?: boolean;
};

export type RoyaleEnterResult = { ok: true } | { ok: false; code: string; message: string };

let grenadeSeq = 0;

function nextGrenadeId(): string {
	grenadeSeq += 1;
	return `royale-grenade-${grenadeSeq}`;
}

/**
 * Determinismo barato para dispersión de escopeta y detalles de simulación.
 * No se usa para posiciones ni para la tormenta (esas usan `mulberry32`).
 */
function combatRandom(): number {
	combatSeq = (combatSeq * 1664525 + 1013904223) >>> 0;
	return combatSeq / 4294967296;
}

let combatSeq = 0x1234567;

export class Royale {
	private phase: Mg8Phase = 'idle';
	private players = new Map<string, RoyalePlayer>();
	private loot: BotLoot[] = [];
	private grenades: RoomGrenade[] = [];
	private vehicles = new Map<string, RoomVehicle>();
	private placements = new Map<string, number>();
	private countdownEndsAt: number | null = null;
	private matchStartedAt: number | null = null;
	private boardingStartedAt: number | null = null;
	private matchEndsAt: number | null = null;
	private resultEndsAt: number | null = null;
	private waitingForPlayers = false;
	private winner: string | null = null;
	/** Partida actual; las atestaciones de kills y resultado la reutilizan. */
	private matchId: string | null = null;
	private lastStormPhase = -1;
	private nextStormDamageAt = 0;
	private nextStateAt = 0;
	private lastPositionsAt = 0;
	private stateDirty = true;
	private nextSeq = 1;
	private nextBotIndex = 0;
	private dropSeq = 0;
	private readonly seed: number;
	private readonly botsEnabled: boolean;

	constructor(
		private readonly port: RoomPort,
		private readonly deps: RoyaleDeps,
		options: RoyaleOptions = {}
	) {
		this.seed = (options.seed ?? Math.floor(Math.random() * 0xffffffff)) >>> 0;
		this.botsEnabled = options.botsEnabled ?? true;
	}

	// ------------------------------------------------------------------
	// Entrada / salida
	// ------------------------------------------------------------------

	/**
	 * Comprobación sin efectos: la usa el lobby para decidir si ofrece la
	 * entrada antes de mover la presencia del jugador. Reintentar con el mismo
	 * id (reconexión) siempre pasa.
	 */
	canEnter(playerId: string): RoyaleEnterResult {
		const existing = this.players.get(playerId);

		if (existing && !existing.isBot) {
			return { ok: true };
		}

		if (this.phase === 'playing' || this.phase === 'results') {
			return {
				ok: false,
				code: 'ROYALE_IN_PROGRESS',
				message: 'Skyfall Royale is already in progress'
			};
		}

		if (this.humanCount() >= ROYALE_MAX_PLAYERS) {
			return {
				ok: false,
				code: 'ROYALE_FULL',
				message: `The zeppelin is full (${ROYALE_MAX_PLAYERS} players)`
			};
		}

		return { ok: true };
	}

	onEnter(
		playerId: string,
		name: string,
		now: number,
		skin: SkinId = DEFAULT_SKIN
	): RoyaleEnterResult {
		const existing = this.players.get(playerId);

		if (existing && !existing.isBot) {
			existing.name = name;
			existing.skin = skin;

			if (existing.disconnectedAt !== null) {
				existing.disconnectedAt = null;
				this.emitEvent('player-joined', now, { playerId });
			}

			this.stateDirty = true;
			return { ok: true };
		}

		if (this.phase === 'playing' || this.phase === 'results') {
			return {
				ok: false,
				code: 'ROYALE_IN_PROGRESS',
				message: 'Skyfall Royale is already in progress'
			};
		}

		if (this.humanCount() >= ROYALE_MAX_PLAYERS) {
			return {
				ok: false,
				code: 'ROYALE_FULL',
				message: `The zeppelin is full (${ROYALE_MAX_PLAYERS} players)`
			};
		}

		const player = this.createPlayer(playerId, name, skin, now, false);
		this.players.set(playerId, player);

		if (this.phase === 'idle') {
			this.phase = 'countdown';
			this.waitingForPlayers = false;
			this.countdownEndsAt = now + ROYALE_COUNTDOWN_MS;
			this.winner = null;
			this.placements.clear();
		}

		this.syncBots(now);
		this.assignSeats();
		this.emitEvent('player-joined', now, {
			playerId,
			x: round(player.x),
			y: round(player.y),
			z: round(player.z),
			mode: player.mode
		});
		this.stateDirty = true;

		return { ok: true };
	}

	onLeave(playerId: string, now: number): void {
		const player = this.players.get(playerId);

		if (!player || player.isBot) {
			return;
		}

		const vehicle = this.vehicleDrivenBy(playerId);

		if (vehicle) {
			this.exitVehicle(vehicle, now, true);
		}

		this.emitEvent('player-left', now, { playerId });

		if (this.phase === 'idle' || this.phase === 'countdown') {
			this.players.delete(playerId);
			this.assignSeats();

			if (this.humanCount() === 0) {
				this.resetMatch();
				return;
			}

			this.syncBots(now);
			this.stateDirty = true;
			return;
		}

		// `playing`/`results`: el cuerpo queda 20 s para reconectar. Si era el
		// último humano, la partida se cancela por completo.
		player.disconnectedAt = now;
		player.bot = undefined;

		if (this.connectedHumanCount() === 0) {
			this.resetMatch();
			return;
		}

		this.stateDirty = true;
	}

	private createPlayer(
		id: string,
		name: string,
		skin: SkinId,
		now: number,
		isBot: boolean
	): RoyalePlayer {
		const seat = this.players.size;
		const spawn = this.boardingStartedAt
			? royaleJumpPosition(this.boardingStartedAt, now, seat)
			: royaleJumpPosition(now, now, seat);
		const pistol = ROYALE_WEAPON_BY_ID.get(ROYALE_STARTER_WEAPON)!;

		return {
			id,
			name,
			skin,
			isBot,
			alive: true,
			health: ROYALE_HEALTH_MAX,
			shield: 0,
			kills: 0,
			damage: 0,
			weapon: ROYALE_STARTER_WEAPON,
			magAmmo: pistol.magSize,
			reserveAmmo: ROYALE_STARTER_AMMO,
			grenades: ROYALE_STARTER_GRENADES,
			inventory: new Map([[ROYALE_STARTER_WEAPON, pistol.magSize]]),
			mode: 'riding',
			x: spawn.x,
			y: spawn.y,
			z: spawn.z,
			yaw: royaleZeppelinAt(this.boardingStartedAt ?? now, now).yaw,
			vy: 0,
			seat,
			jumped: false,
			fallStartY: null,
			lastPositionAt: 0,
			lastShotAt: 0,
			lastReloadAt: 0,
			lastGrenadeAt: 0,
			lastAttackerId: null,
			lastAttackerAt: 0,
			lastHurtEventAt: 0,
			disconnectedAt: null,
			placement: null,
			seq: this.nextSeq++,
			track: []
		};
	}

	// ------------------------------------------------------------------
	// Bots de relleno
	// ------------------------------------------------------------------

	private humanCount(): number {
		let count = 0;
		for (const player of this.players.values()) {
			if (!player.isBot) count += 1;
		}
		return count;
	}

	private connectedHumanCount(): number {
		let count = 0;
		for (const player of this.players.values()) {
			if (!player.isBot && player.disconnectedAt === null) count += 1;
		}
		return count;
	}

	private botCount(): number {
		let count = 0;
		for (const player of this.players.values()) {
			if (player.isBot) count += 1;
		}
		return count;
	}

	/** Mantiene `humanos + bots = 12` solo en `countdown` (nunca en playing). */
	private syncBots(now: number): void {
		if (this.phase !== 'idle' && this.phase !== 'countdown') {
			return;
		}

		const humans = this.humanCount();
		const desired =
			this.botsEnabled && humans > 0 ? Math.min(ROYALE_BOT_FILL, ROYALE_MAX_PLAYERS - humans) : 0;
		const bots = [...this.players.values()]
			.filter((player) => player.isBot)
			.sort((a, b) => b.seq - a.seq);

		while (bots.length > desired) {
			const removed = bots.shift()!;
			this.players.delete(removed.id);
			this.emitEvent('bot-removed', now, { playerId: removed.id });
		}

		while (bots.length < desired) {
			const index = this.nextBotIndex++;
			const id = royaleBotId(this.seed, index);
			const name = this.uniqueBotName(index);
			const bot = this.createPlayer(id, name, DEFAULT_SKIN, now, true);
			bot.bot = createBotMind(this.seed, index, this.botAnchor(index), now);
			this.players.set(id, bot);
			bots.push(bot);
			this.emitEvent('bot-added', now, { playerId: id });
		}

		this.assignSeats();
		this.stateDirty = true;
	}

	private uniqueBotName(index: number): string {
		const used = new Set(
			[...this.players.values()].filter((player) => player.isBot).map((player) => player.name)
		);
		let offset = 0;

		for (;;) {
			const name = royaleBotName(this.seed, index + offset);
			if (!used.has(name)) return name;
			offset += 1;
		}
	}

	private botAnchor(index: number): RoyaleVec3 {
		const anchors = ROYALE_BOT_ANCHORS;
		const chosen = anchors[(this.seed + index * 7) % anchors.length];
		return { x: chosen.x, y: chosen.y, z: chosen.z };
	}

	private assignSeats(): void {
		let seat = 0;
		for (const player of [...this.players.values()].sort((a, b) => a.seq - b.seq)) {
			player.seat = seat % ROYALE_MAX_PLAYERS;
			seat += 1;
		}
	}

	// ------------------------------------------------------------------
	// Mensajes del cliente
	// ------------------------------------------------------------------

	onPosition(
		playerId: string,
		x: number,
		y: number,
		z: number,
		yaw: number,
		mode: Mg8Mode,
		vy: number,
		now: number
	): void {
		const player = this.players.get(playerId);

		if (!player || player.isBot || !player.alive || this.phase !== 'playing') {
			return;
		}

		if (player.mode === 'riding') {
			// El zepelín es autoritativo; el cliente no puede mover al pasajero.
			return;
		}

		// Mientras conduce manda la pose del vehículo, no el cuerpo a pie.
		if (this.vehicleDrivenBy(playerId)) {
			return;
		}

		const reason = this.validatePosition(player, x, y, z, mode, now);

		if (reason) {
			this.sendCorrection(player, reason);
			return;
		}

		const previousMode = player.mode;
		player.x = x;
		player.y = y;
		player.z = z;
		player.yaw = yaw;
		player.vy = vy;
		player.mode = mode;
		player.lastPositionAt = now;

		if ((previousMode === 'skydive' || previousMode === 'glide') && mode === 'ground') {
			const floor = floorHeightAt(x, z);
			if (floor !== null && Math.abs(y - floor) <= 1.2) {
				player.y = floor;
			}

			this.applyFallDamage(player, previousMode === 'glide', now);

			this.emitEvent('player-landed', now, {
				playerId,
				x: round(player.x),
				y: round(player.y),
				z: round(player.z),
				mode: 'ground'
			});
		}

		this.stateDirty = true;
	}

	// ------------------------------------------------------------------
	// Vehículos (coches y globos)
	// ------------------------------------------------------------------

	private spawnVehicles(): void {
		this.vehicles.clear();

		for (const spawn of ROYALE_VEHICLE_SPAWNS) {
			const maxHealth = ROYALE_VEHICLE_HEALTH[spawn.kind];

			this.vehicles.set(spawn.id, {
				id: spawn.id,
				kind: spawn.kind,
				name: spawn.name,
				model: spawn.model,
				spawnX: spawn.x,
				spawnY: spawn.y,
				spawnZ: spawn.z,
				spawnYaw: spawn.yaw,
				x: spawn.x,
				y: spawn.y,
				z: spawn.z,
				qx: 0,
				qy: Math.sin(spawn.yaw / 2),
				qz: 0,
				qw: Math.cos(spawn.yaw / 2),
				yaw: spawn.yaw,
				speed: 0,
				health: maxHealth,
				maxHealth,
				destroyed: false,
				driverId: null,
				lastStateAt: 0,
				lastHitAt: 0,
				lastHitBy: null,
				ramCooldowns: new Map()
			});
		}
	}

	private vehicleDrivenBy(playerId: string): RoomVehicle | null {
		for (const vehicle of this.vehicles.values()) {
			if (vehicle.driverId === playerId) return vehicle;
		}

		return null;
	}

	private vehicleFeet(vehicle: RoomVehicle): number {
		return (
			vehicle.y +
			(vehicle.kind === 'car' ? ROYALE_CAR_SEAT_OFFSET : ROYALE_BALLOON_SEAT_OFFSET)
		);
	}

	private syncDriverToVehicle(vehicle: RoomVehicle, player: RoyalePlayer, now: number): void {
		player.x = vehicle.x;
		player.y = this.vehicleFeet(vehicle);
		player.z = vehicle.z;
		player.yaw = vehicle.yaw;
		player.mode = 'ground';
		player.vy = 0;
		player.lastPositionAt = now;
	}

	onVehicleEnter(playerId: string, vehicleId: string, now: number): void {
		const player = this.players.get(playerId);

		if (!player || player.isBot || this.phase !== 'playing' || !player.alive) return;
		if (player.mode !== 'ground' || this.vehicleDrivenBy(playerId)) return;

		const vehicle = this.vehicles.get(vehicleId);

		if (!vehicle || vehicle.destroyed || vehicle.driverId !== null) return;

		const distance = Math.hypot(player.x - vehicle.x, player.z - vehicle.z);
		const feet = this.vehicleFeet(vehicle);

		if (
			distance > ROYALE_VEHICLE_ENTER_RADIUS ||
			Math.abs(player.y - feet) > ROYALE_VEHICLE_ENTER_MAX_DY
		) {
			return;
		}

		vehicle.driverId = playerId;
		vehicle.speed = 0;
		vehicle.lastStateAt = 0;
		this.syncDriverToVehicle(vehicle, player, now);
		this.emitEvent('vehicle-enter', now, {
			playerId,
			vehicleId: vehicle.id,
			vehicleKind: vehicle.kind,
			x: round(vehicle.x),
			y: round(vehicle.y),
			z: round(vehicle.z)
		});
		this.stateDirty = true;
	}

	onVehicleExit(playerId: string, now: number): void {
		const vehicle = this.vehicleDrivenBy(playerId);

		if (!vehicle || this.phase !== 'playing') return;
		this.exitVehicle(vehicle, now, true);
	}

	private exitVehicle(vehicle: RoomVehicle, now: number, emit: boolean): void {
		const player = vehicle.driverId ? (this.players.get(vehicle.driverId) ?? null) : null;
		vehicle.driverId = null;
		vehicle.speed = 0;

		if (!player) return;

		const sideX = Math.sin(vehicle.yaw) * ROYALE_VEHICLE_EXIT_DISTANCE;
		const sideZ = Math.cos(vehicle.yaw) * ROYALE_VEHICLE_EXIT_DISTANCE;
		const feet = this.vehicleFeet(vehicle);
		const ground = floorHeightAt(vehicle.x + sideX, vehicle.z + sideZ);

		if (vehicle.kind === 'balloon' && (ground === null || feet > ground + 2.5)) {
			// Salir en vuelo deja al jugador planeando desde la barquilla.
			player.x = vehicle.x + sideX;
			player.z = vehicle.z + sideZ;
			player.y = feet;
			player.mode = 'glide';
			player.vy = -1;
			player.fallStartY = feet;
		} else {
			const point =
				nearestWalkable(vehicle.x + sideX, vehicle.z + sideZ, 8, feet) ??
				nearestWalkable(vehicle.x, vehicle.z, 8, feet);

			player.x = point?.x ?? vehicle.x + sideX;
			player.y = point?.y ?? Math.max(0, feet);
			player.z = point?.z ?? vehicle.z + sideZ;
			player.mode = 'ground';
			player.vy = 0;
			player.fallStartY = null;
		}

		player.lastPositionAt = now;

		if (emit) {
			this.emitEvent('vehicle-exit', now, {
				playerId: player.id,
				vehicleId: vehicle.id,
				vehicleKind: vehicle.kind,
				x: round(vehicle.x),
				y: round(vehicle.y),
				z: round(vehicle.z),
				px: round(player.x),
				py: round(player.y),
				pz: round(player.z),
				mode: player.mode
			});
		}

		this.stateDirty = true;
	}

	onVehicleState(
		playerId: string,
		vehicleId: string,
		report: {
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
		},
		now: number
	): void {
		const vehicle = this.vehicles.get(vehicleId);
		const player = this.players.get(playerId);

		if (
			!vehicle ||
			!player ||
			vehicle.driverId !== playerId ||
			vehicle.destroyed ||
			this.phase !== 'playing' ||
			!player.alive
		) {
			return;
		}

		const values = [
			report.x,
			report.y,
			report.z,
			report.qx,
			report.qy,
			report.qz,
			report.qw,
			report.speed
		];

		if (!values.every((value) => Number.isFinite(value))) return;

		const maxSpeed = vehicle.kind === 'car' ? ROYALE_CAR_MAX_SPEED : ROYALE_BALLOON_MAX_SPEED;
		const clamped = this.clampVehiclePosition(vehicle, report.x, report.y, report.z);
		const speed = Math.min(maxSpeed, Math.max(0, report.speed));

		if (vehicle.lastStateAt > 0) {
			const dt = Math.min(1.5, Math.max(0.001, (now - vehicle.lastStateAt) / 1000));
			const travelled = Math.hypot(clamped.x - vehicle.x, clamped.z - vehicle.z);

			if (travelled > maxSpeed * dt + ROYALE_VEHICLE_TELEPORT_TOL) {
				this.sendVehicleCorrection(vehicle);
				return;
			}
		}

		let length = Math.hypot(report.qx, report.qy, report.qz, report.qw);

		if (length < 1e-4) {
			report.qx = 0;
			report.qy = Math.sin(vehicle.yaw / 2);
			report.qz = 0;
			report.qw = Math.cos(vehicle.yaw / 2);
			length = 1;
		}

		vehicle.x = clamped.x;
		vehicle.y = clamped.y;
		vehicle.z = clamped.z;
		vehicle.qx = report.qx / length;
		vehicle.qy = report.qy / length;
		vehicle.qz = report.qz / length;
		vehicle.qw = report.qw / length;
		vehicle.yaw = Math.atan2(
			2 * (vehicle.qw * vehicle.qy + vehicle.qx * vehicle.qz),
			1 - 2 * (vehicle.qy * vehicle.qy + vehicle.qx * vehicle.qx)
		);
		vehicle.speed = speed;
		vehicle.lastStateAt = now;

		this.syncDriverToVehicle(vehicle, player, now);

		if (vehicle.kind === 'car' && speed >= ROYALE_VEHICLE_RAM_SPEED) {
			this.ramPlayers(vehicle, player, now);
		}

		this.stateDirty = true;
	}

	private clampVehiclePosition(
		vehicle: RoomVehicle,
		x: number,
		y: number,
		z: number
	): { x: number; y: number; z: number } {
		if (vehicle.kind === 'balloon') {
			const margin = ROYALE_BALLOON_BOUNDS_MARGIN;

			return {
				x: clamp(x, ROYALE_MAP_BOUNDS.minX + margin, ROYALE_MAP_BOUNDS.maxX - margin),
				y: clamp(y, vehicle.spawnY, ROYALE_BALLOON_MAX_Y),
				z: clamp(z, ROYALE_MAP_BOUNDS.minZ + margin, ROYALE_MAP_BOUNDS.maxZ - margin)
			};
		}

		return {
			x: clamp(x, ROYALE_MAP_BOUNDS.minX - 4, ROYALE_MAP_BOUNDS.maxX + 4),
			y: clamp(y, -20, ROYALE_MAX_POSITION_Y),
			z: clamp(z, ROYALE_MAP_BOUNDS.minZ - 4, ROYALE_MAP_BOUNDS.maxZ + 4)
		};
	}

	private sendVehicleCorrection(vehicle: RoomVehicle): void {
		if (!vehicle.driverId) return;

		this.port.sendTo(vehicle.driverId, {
			type: 'mg8-vehicle-correct',
			vehicleId: vehicle.id,
			x: round(vehicle.x),
			y: round(vehicle.y),
			z: round(vehicle.z),
			qx: round(vehicle.qx, 4),
			qy: round(vehicle.qy, 4),
			qz: round(vehicle.qz, 4),
			qw: round(vehicle.qw, 4)
		});
	}

	/** Mantiene al conductor pegado a la pose autoritativa del vehículo. */
	private updateVehicles(now: number): void {
		for (const vehicle of this.vehicles.values()) {
			if (vehicle.destroyed) {
				vehicle.speed = 0;
				continue;
			}

			if (!vehicle.driverId) continue;

			const driver = this.players.get(vehicle.driverId);

			if (!driver || !driver.alive || driver.disconnectedAt !== null) {
				vehicle.driverId = null;
				vehicle.speed = 0;
				continue;
			}

			this.syncDriverToVehicle(vehicle, driver, now);
		}
	}

	private ramPlayers(vehicle: RoomVehicle, driver: RoyalePlayer, now: number): void {
		for (const player of this.players.values()) {
			if (!player.alive || player.id === driver.id) continue;

			const distance = Math.hypot(player.x - vehicle.x, player.z - vehicle.z);

			if (distance > 2.9 || Math.abs(player.y + 1 - vehicle.y) > 2.8) continue;

			const last = vehicle.ramCooldowns.get(player.id) ?? 0;

			if (now - last < ROYALE_VEHICLE_RAM_COOLDOWN_MS) continue;

			vehicle.ramCooldowns.set(player.id, now);
			this.damage(player, ROYALE_VEHICLE_RAM_DAMAGE, {
				attackerId: driver.id,
				cause: 'combat',
				now
			});
		}
	}

	private damageVehicle(
		vehicle: RoomVehicle,
		amount: number,
		attackerId: string | null,
		now: number
	): void {
		if (vehicle.destroyed || amount <= 0 || this.phase !== 'playing') return;

		vehicle.health = Math.max(0, vehicle.health - amount);
		vehicle.lastHitAt = now;
		vehicle.lastHitBy = attackerId;

		this.emitEvent('vehicle-hit', now, {
			playerId: attackerId ?? undefined,
			vehicleId: vehicle.id,
			vehicleKind: vehicle.kind,
			amount: Math.round(amount),
			x: round(vehicle.x),
			y: round(vehicle.y),
			z: round(vehicle.z)
		});

		if (vehicle.health <= 0) {
			this.destroyVehicle(vehicle, now);
		}

		this.stateDirty = true;
	}

	private destroyVehicle(vehicle: RoomVehicle, now: number): void {
		if (vehicle.destroyed) return;

		vehicle.destroyed = true;
		vehicle.health = 0;
		vehicle.speed = 0;

		if (vehicle.driverId) {
			this.exitVehicle(vehicle, now, false);
		}

		this.emitEvent('vehicle-destroyed', now, {
			playerId: vehicle.lastHitBy ?? undefined,
			vehicleId: vehicle.id,
			vehicleKind: vehicle.kind,
			x: round(vehicle.x),
			y: round(vehicle.y),
			z: round(vehicle.z)
		});

		const centerY = vehicle.y + (vehicle.kind === 'car' ? 0.5 : 1.2);

		for (const player of this.players.values()) {
			if (!player.alive) continue;

			const distance = Math.hypot(player.x - vehicle.x, player.z - vehicle.z);

			if (distance > ROYALE_VEHICLE_BLAST_RADIUS) continue;
			if (Math.abs(player.y + 1 - centerY) > ROYALE_VEHICLE_BLAST_RADIUS) continue;

			// La explosión tampoco atraviesa muros: la metralla sale del centro
			// del vehículo y un edificio entre ambos corta el daño. Antes el
			// estallido hería a través de cualquier pared de la isla.
			if (
				!hasLineOfSight(
					{ x: vehicle.x, y: centerY, z: vehicle.z },
					{ x: player.x, y: player.y + 1, z: player.z }
				)
			) {
				continue;
			}

			const ratio = Math.min(1, distance / ROYALE_VEHICLE_BLAST_RADIUS);
			const damage =
				ROYALE_VEHICLE_BLAST_DAMAGE +
				(ROYALE_VEHICLE_BLAST_EDGE_DAMAGE - ROYALE_VEHICLE_BLAST_DAMAGE) * ratio;

			this.damage(player, damage, {
				attackerId: vehicle.lastHitBy,
				cause: 'combat',
				now
			});
		}

		this.stateDirty = true;
	}

	private validatePosition(
		player: RoyalePlayer,
		x: number,
		y: number,
		z: number,
		mode: Mg8Mode,
		now: number
	): string | null {
		if (
			!Number.isFinite(x) ||
			!Number.isFinite(y) ||
			!Number.isFinite(z) ||
			y > ROYALE_MAX_POSITION_Y ||
			y < ROYALE_KILL_Y - 2
		) {
			return 'invalid-position';
		}

		if (
			x < ROYALE_MAP_BOUNDS.minX - 4 ||
			x > ROYALE_MAP_BOUNDS.maxX + 4 ||
			z < ROYALE_MAP_BOUNDS.minZ - 4 ||
			z > ROYALE_MAP_BOUNDS.maxZ + 4
		) {
			return 'out-of-bounds';
		}

		const allowed: Record<Mg8Mode, readonly Mg8Mode[]> = {
			riding: ['riding'],
			skydive: ['skydive', 'glide', 'ground'],
			glide: ['glide', 'ground'],
			ground: ['ground']
		};

		if (!allowed[player.mode].includes(mode)) {
			return 'invalid-mode';
		}

		if (player.lastPositionAt > 0) {
			const dt = Math.min(1, Math.max(0.001, (now - player.lastPositionAt) / 1000));
			const maxSpeed = mode === 'ground' ? ROYALE_MAX_GROUND_SPEED : 16;
			const travelled = Math.hypot(x - player.x, z - player.z);
			const vertical = Math.abs(y - player.y);

			if (travelled > maxSpeed * dt + POSITION_SPEED_TOLERANCE) {
				return 'speed';
			}

			if (vertical > 40 * dt + 8) {
				return 'vertical-speed';
			}
		}

		return null;
	}

	private sendCorrection(player: RoyalePlayer, reason: string): void {
		this.port.sendTo(player.id, {
			type: 'mg8-correct',
			correct: {
				x: round(player.x),
				y: round(player.y),
				z: round(player.z),
				mode: player.mode,
				reason
			}
		});
	}

	onJump(playerId: string, now: number): void {
		const player = this.players.get(playerId);

		if (!player || player.isBot || this.phase !== 'playing' || !player.alive) {
			return;
		}

		if (player.mode !== 'riding' || player.jumped || this.boardingStartedAt === null) {
			return;
		}

		const elapsed = now - this.boardingStartedAt;

		if (elapsed < ROYALE_JUMP_DELAY_MS || elapsed > ROYALE_JUMP_WINDOW_MS) {
			return;
		}

		this.jumpPlayer(player, now);
	}

	private jumpPlayer(player: RoyalePlayer, now: number): void {
		if (this.boardingStartedAt === null || player.mode !== 'riding' || !player.alive) {
			return;
		}

		const target = royaleJumpPosition(this.boardingStartedAt, now, player.seat);
		player.x = target.x;
		player.y = target.y;
		player.z = target.z;
		player.mode = 'skydive';
		player.vy = 0;
		player.jumped = true;
		// El salto del zepelín es la entrada estándar: se salta con planeo,
		// así que no se cobra daño. Solo se registra la altura al abandonar
		// un globo en vuelo, que es una salida improvisada.
		player.fallStartY = null;
		player.lastPositionAt = now;

		if (player.bot) {
			player.bot.jumpStartedAt = now;
		}

		this.emitEvent('player-jumped', now, {
			playerId: player.id,
			x: round(player.x),
			y: round(player.y),
			z: round(player.z),
			mode: 'skydive'
		});
		this.stateDirty = true;
	}

	onShoot(
		playerId: string,
		weapon: RoyaleWeaponId,
		origin: RoyaleVec3,
		dir: RoyaleVec3,
		targetId: string | undefined,
		now: number
	): void {
		const player = this.players.get(playerId);

		if (!player || player.isBot || this.phase !== 'playing' || !player.alive) {
			return;
		}

		if (player.mode === 'riding') {
			return;
		}

		// Se puede disparar desde un coche o un globo. El origen se calcula
		// desde el asiento local, que va por delante del último reporte a
		// 10 Hz: se amplía el margen solo mientras se conduce.
		const vehicle = this.vehicleDrivenBy(playerId);
		const originTolerance = ROYALE_SHOT_ORIGIN_TOL + (vehicle ? 3.5 : 0);

		if (
			Math.hypot(player.x - origin.x, player.z - origin.z) > originTolerance ||
			Math.abs(player.y + 1.2 - origin.y) > 2.5
		) {
			return;
		}

		this.fire(player, weapon, origin, dir, targetId, now, now - ROYALE_LAG_COMPENSATION_MS);
	}

	private fire(
		player: RoyalePlayer,
		weapon: RoyaleWeaponId,
		origin: RoyaleVec3,
		dir: RoyaleVec3,
		targetId: string | undefined,
		now: number,
		rewindAt: number | null = null
	): void {
		if (!player.alive || player.weapon !== weapon) {
			return;
		}

		const definition = ROYALE_WEAPON_BY_ID.get(weapon);
		if (!definition) return;

		const minInterval = 1000 / definition.rate;
		if (now - player.lastShotAt < minInterval * 0.8) return;
		if (player.magAmmo <= 0) {
			this.stateDirty = true;
			return;
		}
		if (Math.hypot(dir.x, dir.y, dir.z) < 1e-6) return;

		player.magAmmo -= 1;
		player.inventory.set(player.weapon, player.magAmmo);
		player.lastShotAt = now;

		this.emitEvent('shot-fired', now, {
			playerId: player.id,
			weapon,
			x: round(origin.x),
			y: round(origin.y),
			z: round(origin.z),
			dx: round(dir.x, 3),
			dy: round(dir.y, 3),
			dz: round(dir.z, 3)
		});

		const locked = targetId
			? this.selectLockedTarget(player, origin, dir, definition.range, targetId, rewindAt)
			: null;
		const pellets = definition.pellets;

		for (let pellet = 0; pellet < pellets; pellet += 1) {
			const angle = definition.spread === 0 ? 0 : (combatRandom() * 2 - 1) * definition.spread;
			const pelletDir = spreadDirection(dir, definition.spread, angle);
			this.hitscan(
				player,
				origin,
				pelletDir,
				definition.range,
				definition.damage,
				now,
				locked,
				rewindAt
			);
		}

		this.stateDirty = true;
	}

	private selectLockedTarget(
		shooter: RoyalePlayer,
		origin: RoyaleVec3,
		dir: RoyaleVec3,
		range: number,
		targetId: string,
		rewindAt: number | null
	): RoyalePlayer | null {
		const target = this.players.get(targetId);

		if (!target || target.id === shooter.id || !target.alive) {
			return null;
		}

		const point = this.trackedPosition(target, rewindAt);
		const toX = point.x - origin.x;
		const toZ = point.z - origin.z;
		const distance = Math.hypot(toX, toZ);
		const flat = Math.hypot(dir.x, dir.z);
		const lateral = flat > 1e-4 ? Math.abs(toX * dir.z - toZ * dir.x) / flat : Infinity;
		const facing = toX * dir.x + toZ * dir.z > 0;

		if (
			distance <= range + 2 &&
			facing &&
			lateral <= 3 &&
			this.hasClearShot(origin, point) &&
			// También se exige línea al cuerpo actual: si el objetivo ya se
			// cubrió tras un muro, no vale apuntar a su silueta rebobinada
			// para atravesarlo.
			this.hasClearShot(origin, target)
		) {
			return target;
		}

		return null;
	}

	/**
	 * Línea de tiro válida. Prueba pecho, cabeza y cadera: el origen puede ser
	 * el cañón pegado a una esquina y, aun así, la mayor parte del cuerpo del
	 * objetivo estar a la vista. Antes solo se comprobaba el pecho y los
	 * disparos con mira asistida se descartaban en cuanto un borde lo tapaba.
	 */
	private hasClearShot(origin: RoyaleVec3, target: { x: number; y: number; z: number }): boolean {
		for (const height of [1.2, 1.7, 0.7]) {
			if (hasLineOfSight(origin, { x: target.x, y: target.y + height, z: target.z })) {
				return true;
			}
		}

		return false;
	}

	private hitscan(
		shooter: RoyalePlayer,
		origin: RoyaleVec3,
		dir: RoyaleVec3,
		range: number,
		damage: number,
		now: number,
		locked: RoyalePlayer | null,
		rewindAt: number | null
	): void {
		if (locked && locked.alive) {
			const lockedPoint = this.trackedPosition(locked, rewindAt);

			if (
				Math.hypot(origin.x - lockedPoint.x, origin.z - lockedPoint.z) <= range + 2 &&
				this.hasClearShot(origin, lockedPoint) &&
				this.hasClearShot(origin, locked)
			) {
				this.damage(locked, damage, {
					attackerId: shooter.id,
					weapon: shooter.weapon,
					cause: 'combat',
					now
				});
			}

			return;
		}

		let best: RoyalePlayer | null = null;
		let bestAlong = Number.POSITIVE_INFINITY;

		for (const player of this.players.values()) {
			if (!player.alive || player.id === shooter.id) continue;

			const point = this.trackedPosition(player, rewindAt);
			const hit = rayPointDistance2D(origin.x, origin.z, dir.x, dir.z, point.x, point.z);
			if (!hit || hit.along > range || hit.lateral > 0.85) continue;

			const rayY = origin.y + dir.y * hit.along;
			if (rayY < point.y - 0.35 || rayY > point.y + 2.2) continue;

			if (!this.hasClearShot(origin, point) || !this.hasClearShot(origin, player)) continue;

			if (hit.along < bestAlong) {
				bestAlong = hit.along;
				best = player;
			}
		}

		// Los vehículos son blancos válidos: se comparan por distancia con el
		// jugador más cercano para que una carrocería tape a quien va detrás.
		// El vehículo que conduce el tirador se ignora: el cañón está dentro o
		// pegado a él y, sin esto, cada disparo desde un coche o globo impactaba
		// en la propia carrocería y nunca llegaba al enemigo.
		const shooterVehicle = this.vehicleDrivenBy(shooter.id);
		let bestVehicle: RoomVehicle | null = null;
		let vehicleAlong = Number.POSITIVE_INFINITY;

		for (const vehicle of this.vehicles.values()) {
			if (vehicle.destroyed) continue;
			if (vehicle.id === shooterVehicle?.id) continue;

			const hit = rayPointDistance2D(origin.x, origin.z, dir.x, dir.z, vehicle.x, vehicle.z);
			if (!hit || hit.along > range || hit.lateral > (vehicle.kind === 'car' ? 1.9 : 2.4)) {
				continue;
			}

			const rayY = origin.y + dir.y * hit.along;
			const minY = vehicle.y + (vehicle.kind === 'car' ? -1.1 : -0.2);
			const maxY = vehicle.y + (vehicle.kind === 'car' ? 1.6 : 3.2);

			if (rayY < minY || rayY > maxY) continue;

			if (
				!this.hasClearShot(origin, {
					x: vehicle.x,
					y: clamp(rayY, minY, maxY),
					z: vehicle.z
				})
			) {
				continue;
			}

			if (hit.along < vehicleAlong) {
				vehicleAlong = hit.along;
				bestVehicle = vehicle;
			}
		}

		// La carrocería tapa al conductor: a igual distancia gana el vehículo.
		if (bestVehicle && vehicleAlong <= bestAlong) {
			this.damageVehicle(bestVehicle, damage, shooter.id, now);
			return;
		}

		if (best) {
			this.damage(best, damage, {
				attackerId: shooter.id,
				weapon: shooter.weapon,
				cause: 'combat',
				now
			});
		}
	}

	onThrow(
		playerId: string,
		origin: RoyaleVec3,
		dir: RoyaleVec3,
		tx: number | undefined,
		tz: number | undefined,
		now: number
	): void {
		const player = this.players.get(playerId);

		if (!player || player.isBot || this.phase !== 'playing' || !player.alive) {
			return;
		}

		const vehicle = this.vehicleDrivenBy(playerId);
		const tolerance = ROYALE_SHOT_ORIGIN_TOL + (vehicle ? 4.5 : 1);

		if (
			Math.hypot(player.x - origin.x, player.z - origin.z) > tolerance ||
			Math.abs(player.y + 1.2 - origin.y) > 2.5
		) {
			return;
		}

		this.throwGrenade(player, origin, dir, tx, tz, now);
	}

	private throwBotGrenade(
		player: RoyalePlayer,
		point: { x: number; z: number },
		now: number
	): void {
		const origin = { x: player.x, y: player.y + 1.2, z: player.z };
		const dx = point.x - origin.x;
		const dz = point.z - origin.z;
		const length = Math.hypot(dx, dz) || 1;
		this.throwGrenade(
			player,
			origin,
			{ x: dx / length, y: 0, z: dz / length },
			point.x,
			point.z,
			now
		);
	}

	private throwGrenade(
		player: RoyalePlayer,
		origin: RoyaleVec3,
		dir: RoyaleVec3,
		tx: number | undefined,
		tz: number | undefined,
		now: number
	): void {
		if (!player.alive || player.grenades <= 0) return;
		if (now - player.lastGrenadeAt < ROYALE_GRENADE_COOLDOWN_MS) return;

		player.grenades -= 1;
		player.lastGrenadeAt = now;

		const fallback = {
			x: origin.x + dir.x * GRENADE_THROW_FALLBACK_RANGE,
			z: origin.z + dir.z * GRENADE_THROW_FALLBACK_RANGE
		};
		const target = {
			x: clamp(tx ?? fallback.x, ROYALE_MAP_BOUNDS.minX, ROYALE_MAP_BOUNDS.maxX),
			z: clamp(tz ?? fallback.z, ROYALE_MAP_BOUNDS.minZ, ROYALE_MAP_BOUNDS.maxZ)
		};
		const distance = Math.hypot(origin.x - target.x, origin.z - target.z);
		const flight = Math.min(1.6, Math.max(0.55, 0.55 + distance / 22));
		const vx = (target.x - origin.x) / flight;
		const vz = (target.z - origin.z) / flight;
		const floor = floorHeightAt(target.x, target.z) ?? 0.5;
		const vy = (floor - origin.y) / flight + (GRENADE_GRAVITY * flight) / 2;

		// La granada no atraviesa paredes: si la parábola corta un muro antes de
		// llegar, estalla contra él. Antes el cliente mandaba un destino plano y
		// el servidor solo lo recortaba a los límites del mapa, así que una
		// granada tirada contra un edificio explotaba al otro lado.
		const clip = royaleArcHit(origin, { x: vx, y: vy, z: vz }, flight, GRENADE_GRAVITY);
		const landing = clip ? { x: clip.x, z: clip.z } : target;
		const flightMs = flight * (clip ? clip.t : 1) * 1000;

		this.grenades.push({
			id: nextGrenadeId(),
			ownerId: player.id,
			x: origin.x,
			y: origin.y,
			z: origin.z,
			vx,
			vy,
			vz,
			originX: origin.x,
			originY: origin.y,
			originZ: origin.z,
			launchedAt: now,
			flightMs,
			fuseAt: now + ROYALE_GRENADE_FUSE_MS,
			targetX: landing.x,
			targetZ: landing.z,
			clipY: clip ? clip.y : null
		});

		this.emitEvent('grenade-thrown', now, { playerId: player.id });
		this.stateDirty = true;
	}

	onReload(playerId: string, now: number): void {
		const player = this.players.get(playerId);

		if (!player || player.isBot || !player.alive) return;

		// También se recarga desde un vehículo: el arma va en la barquilla y el
		// servidor ya acepta disparos desde coche o globo. Antes el conductor
		// se quedaba sin poder recargar y el arma quedaba inservible al vaciar
		// el cargador.

		this.reloadPlayer(player, now);
	}

	private reloadPlayer(player: RoyalePlayer, now: number): void {
		if (now - player.lastReloadAt < 500) return;

		const definition = ROYALE_WEAPON_BY_ID.get(player.weapon);
		if (!definition) return;

		const missing = definition.magSize - player.magAmmo;
		if (missing <= 0) return;

		const take = Math.min(missing, player.reserveAmmo);
		if (take <= 0) return;

		player.magAmmo += take;
		player.reserveAmmo -= take;
		player.inventory.set(player.weapon, player.magAmmo);
		player.lastReloadAt = now;
		this.stateDirty = true;
	}

	onEquip(playerId: string, slot: number): void {
		const player = this.players.get(playerId);

		if (!player || player.isBot || !player.alive || this.phase !== 'playing') return;
		if (this.vehicleDrivenBy(playerId)) return;
		this.equipPlayer(player, slot);
	}

	private equipPlayer(player: RoyalePlayer, slot: number): void {
		const weapon = ROYALE_WEAPON_BY_SLOT[slot];

		if (!weapon || !player.inventory.has(weapon) || player.weapon === weapon) {
			return;
		}

		player.weapon = weapon;
		player.magAmmo = player.inventory.get(weapon) ?? 0;
		this.stateDirty = true;
	}

	// ------------------------------------------------------------------
	// Tick
	// ------------------------------------------------------------------

	tick(now: number): void {
		try {
			this.updateDisconnects(now);
			this.updatePhase(now);

			if (this.phase === 'playing') {
				this.updateRiding(now);
				this.updateVehicles(now);
				this.updateAutoJump(now);
				this.updateBots(now);
				this.updateGrenades(now);
				this.updateStorm(now);
				this.updateLoot(now);
				this.updateFalls(now);
				this.updateEnd(now);
				this.recordTrack(now);
			}

			this.broadcast(now);
		} catch (error) {
			console.error('[royale] tick failed', error);
			this.resetMatch();
		}
	}

	private updateDisconnects(now: number): void {
		for (const player of [...this.players.values()]) {
			if (player.isBot || player.disconnectedAt === null) continue;

			if (now - player.disconnectedAt >= ROYALE_RECONNECT_MS) {
				this.removeDisconnected(player, now);
			}
		}
	}

	private removeDisconnected(player: RoyalePlayer, now: number): void {
		const vehicle = this.vehicleDrivenBy(player.id);

		if (vehicle) {
			vehicle.driverId = null;
			vehicle.speed = 0;
		}

		this.players.delete(player.id);

		if (this.phase === 'playing' && player.alive) {
			const placement = this.aliveCount() + 1;
			this.placements.set(player.id, placement);
			player.alive = false;
			this.emitEvent('player-died', now, {
				playerId: player.id,
				cause: 'combat'
			});
		}

		if (this.connectedHumanCount() === 0) {
			this.resetMatch();
			return;
		}

		this.stateDirty = true;
	}

	private updatePhase(now: number): void {
		if (this.phase === 'countdown') {
			if (this.countdownEndsAt !== null && now >= this.countdownEndsAt) {
				if (this.connectedHumanCount() > 0) {
					this.startMatch(now);
				} else {
					this.resetMatch();
				}
			}

			return;
		}

		if (this.phase === 'results' && this.resultEndsAt !== null && now >= this.resultEndsAt) {
			for (const player of this.players.values()) {
				if (!player.isBot && player.disconnectedAt === null) {
					this.deps.moveToLobby(player.id);
				}
			}

			this.resetMatch();
		}
	}

	private startMatch(now: number): void {
		this.phase = 'playing';
		this.waitingForPlayers = false;
		this.countdownEndsAt = null;
		this.matchStartedAt = now;
		this.boardingStartedAt = now;
		this.matchEndsAt = now + ROYALE_MATCH_MS;
		this.resultEndsAt = null;
		this.winner = null;
		this.matchId = newMatchId();
		this.placements.clear();
		this.grenades = [];
		this.lastStormPhase = -1;
		this.nextStormDamageAt = 0;
		this.spawnVehicles();
		this.loot = ROYALE_LOOT_ANCHORS.map((anchor, index) => {
			const roll = royaleRollLoot((this.seed ^ (index * 2654435761)) >>> 0);
			return {
				id: anchor.id,
				kind: roll.kind as RoyaleLootKind,
				weapon: roll.weapon,
				x: anchor.x,
				y: anchor.y,
				z: anchor.z,
				available: true
			};
		});

		const players = [...this.players.values()].sort((a, b) => a.seq - b.seq);

		players.forEach((player, index) => {
			const pistol = ROYALE_WEAPON_BY_ID.get(ROYALE_STARTER_WEAPON)!;

			player.alive = true;
			player.health = ROYALE_HEALTH_MAX;
			player.shield = 0;
			player.kills = 0;
			player.damage = 0;
			player.weapon = ROYALE_STARTER_WEAPON;
			player.magAmmo = pistol.magSize;
			player.reserveAmmo = ROYALE_STARTER_AMMO;
			player.grenades = ROYALE_STARTER_GRENADES;
			player.inventory = new Map([[ROYALE_STARTER_WEAPON, pistol.magSize]]);
			player.mode = 'riding';
			player.vy = 0;
			player.jumped = false;
			player.placement = null;
			player.lastAttackerId = null;
			player.lastAttackerAt = 0;
			player.lastShotAt = 0;
			player.lastReloadAt = 0;
			player.lastGrenadeAt = 0;
			player.lastPositionAt = 0;
			player.seat = index % ROYALE_MAX_PLAYERS;
			player.track = [];

			if (player.bot) {
				const anchor = this.botAnchor(player.bot.index);
				player.bot = createBotMind(this.seed, player.bot.index, anchor, now);
			}
		});

		this.assignSeats();
		this.updateRiding(now);
		this.emitEvent('match-started', now, {});
		this.stateDirty = true;
	}

	private updateRiding(now: number): void {
		if (this.boardingStartedAt === null) return;

		for (const player of this.players.values()) {
			if (!player.alive || player.mode !== 'riding') continue;

			const seat = royaleJumpPosition(this.boardingStartedAt, now, player.seat);
			const zeppelin = royaleZeppelinAt(this.boardingStartedAt, now);
			player.x = seat.x;
			player.y = seat.y;
			player.z = seat.z;
			player.yaw = zeppelin.yaw;
			player.vy = 0;
		}
	}

	/**
	 * Guarda una muestra de cada jugador para la compensación de retardo.
	 * Ocho muestras a 10 Hz cubren 800 ms: más que los 200 ms que el cliente
	 * dibuja en el pasado.
	 */
	private recordTrack(now: number): void {
		for (const player of this.players.values()) {
			player.track.push({ at: now, x: player.x, y: player.y, z: player.z, mode: player.mode });

			if (player.track.length > 8) {
				player.track.splice(0, player.track.length - 8);
			}
		}
	}

	/** Posición autoritativa del objetivo en el instante que vio el cliente. */
	private trackedPosition(player: RoyalePlayer, at: number | null): RoyaleTrack | RoyalePlayer {
		if (at === null || player.track.length === 0) return player;

		let best = player.track[0];

		for (const sample of player.track) {
			if (Math.abs(sample.at - at) < Math.abs(best.at - at)) best = sample;
		}

		if (Math.abs(best.at - at) > ROYALE_LAG_COMPENSATION_MS * 2) return player;

		// Si el objetivo acaba de aterrizar o de saltar, no se rebobina hasta
		// el zepelín: esa silueta ya no es un objetivo válido.
		if (player.mode === 'ground' && best.mode !== 'ground') return player;
		if (best.mode === 'riding' && player.mode !== 'riding') return player;

		return best;
	}

	private updateAutoJump(now: number): void {
		if (this.boardingStartedAt === null) return;

		const elapsed = now - this.boardingStartedAt;

		if (elapsed < ROYALE_JUMP_WINDOW_MS) return;

		for (const player of this.players.values()) {
			if (player.alive && player.mode === 'riding') {
				this.jumpPlayer(player, now);
			}
		}
	}

	private currentStorm(now: number): RoyaleStormState {
		if (this.matchStartedAt === null) {
			return {
				phase: 0,
				cx: 0,
				cz: 0,
				radius: 400,
				nextCx: 0,
				nextCz: 0,
				nextRadius: 260,
				endsAt: 0,
				dps: 0,
				state: 'wait'
			};
		}

		return royaleStormAt(this.matchStartedAt, now, this.seed);
	}

	private updateBots(now: number): void {
		const storm = this.currentStorm(now);
		const world: BotWorld = {
			now,
			players: [...this.players.values()],
			loot: this.loot,
			storm: storm as BotStorm,
			aliveCount: this.aliveCount(),
			findPath,
			hasLineOfSight,
			floorHeight: floorHeightAt,
			safePoint: (value, x, z) => {
				const radius = value.nextRadius;
				const margin = royaleBotStormMargin(radius);
				const usable = Math.max(0, radius - margin);
				const dx = x - value.nextCx;
				const dz = z - value.nextCz;
				const distance = Math.hypot(dx, dz);

				// Desde fuera, apunta al borde más cercano del siguiente círculo
				// en vez de cruzar toda la isla hasta un punto aleatorio.
				if (distance > usable + 0.5) {
					const angle = Math.atan2(dz, dx);

					for (const offset of [0, 0.15, -0.15, 0.3, -0.3, 0.6, -0.6, 1, -1]) {
						const px = value.nextCx + Math.cos(angle + offset) * usable;
						const pz = value.nextCz + Math.sin(angle + offset) * usable;

						if (floorHeightAt(px, pz) !== null) return { x: px, z: pz };
					}
				}

				return royaleSafePoint(
					{
						cx: value.nextCx,
						cz: value.nextCz,
						radius
					},
					(this.seed ^ Math.round(radius * 7919)) >>> 0,
					margin
				);
			},
			jump: (player) => this.jumpPlayer(player as RoyalePlayer, now),
			shoot: (player, dir, targetId) => {
				const shooter = player as RoyalePlayer;
				if (shooter.mode === 'riding') return;

				// El cliente dibuja a los demás 200 ms en el pasado. Si en esa
				// silueta el bot estaba tapado, no dispara: así no se ven
				// tiros saliendo de detrás de una pared por desfase visual.
				const seen = this.trackedPosition(shooter, now - ROYALE_LAG_COMPENSATION_MS);
				const target = targetId ? (this.players.get(targetId) ?? null) : null;

				if (target && seen.mode === 'ground') {
					const seenEye = { x: seen.x, y: seen.y + 1.2, z: seen.z };

					if (!this.hasClearShot(seenEye, target)) return;
				}

				this.fire(
					shooter,
					shooter.weapon,
					{ x: shooter.x, y: shooter.y + 1.2, z: shooter.z },
					dir,
					undefined,
					now
				);
			},
			throwGrenade: (player, point) => this.throwBotGrenade(player as RoyalePlayer, point, now),
			emit: (kind, extra) => {
				if (kind === 'player-landed' && extra.playerId) {
					const landed = this.players.get(extra.playerId);
					// Los bots siempre planean antes de tocar suelo.
					if (landed) this.applyFallDamage(landed, true, now);
				}
				this.emitEvent(kind, now, extra);
			},
			markDirty: () => {
				this.stateDirty = true;
			}
		};

		for (const player of this.players.values()) {
			if (!player.isBot || !player.alive) continue;
			updateBot(player as BotPlayer, world);
		}
	}

	private updateGrenades(now: number): void {
		const remaining: RoomGrenade[] = [];

		for (const grenade of this.grenades) {
			const elapsed = Math.max(0, (now - grenade.launchedAt) / 1000);
			const flight = grenade.flightMs / 1000;
			const t = Math.min(elapsed, flight);

			grenade.x = grenade.originX + grenade.vx * t;
			grenade.y = grenade.originY + grenade.vy * t - 0.5 * GRENADE_GRAVITY * t * t;
			grenade.z = grenade.originZ + grenade.vz * t;

			if (elapsed >= flight || now >= grenade.fuseAt) {
				if (elapsed >= flight) {
					grenade.x = grenade.targetX;
					grenade.z = grenade.targetZ;
					grenade.y = grenade.clipY ?? floorHeightAt(grenade.targetX, grenade.targetZ) ?? 0.5;
				}

				this.explodeGrenade(grenade, now);
				continue;
			}

			remaining.push(grenade);
		}

		this.grenades = remaining;
	}

	private explodeGrenade(grenade: RoomGrenade, now: number): void {
		for (const player of this.players.values()) {
			if (!player.alive) continue;

			const distance = Math.hypot(player.x - grenade.x, player.z - grenade.z);
			if (distance > ROYALE_GRENADE_RADIUS) continue;
			if (Math.abs(player.y + 1.2 - grenade.y) > ROYALE_GRENADE_VERTICAL_REACH) continue;

			// La explosión no atraviesa muros: si el cuerpo está tapado por una
			// pared, la metralla no llega. Antes una granada lanzada al otro
			// lado de un edificio mataba igual y parecía que los bots veían a
			// través de las paredes.
			const blastOrigin = { x: grenade.x, y: grenade.y + 0.4, z: grenade.z };
			const chest = { x: player.x, y: player.y + 1.2, z: player.z };

			if (!hasLineOfSight(blastOrigin, chest)) continue;

			const damage = grenadeDamageAt(distance);
			if (damage <= 0) continue;

			this.damage(player, damage, {
				attackerId: grenade.ownerId,
				cause: 'combat',
				now
			});
		}

		this.emitEvent('grenade-exploded', now, {
			playerId: grenade.ownerId,
			x: round(grenade.x),
			y: round(grenade.y),
			z: round(grenade.z)
		});
		this.stateDirty = true;
	}

	private updateStorm(now: number): void {
		const storm = this.currentStorm(now);

		if (storm.phase !== this.lastStormPhase) {
			this.lastStormPhase = storm.phase;

			if (this.matchStartedAt !== null && now >= this.matchStartedAt + ROYALE_STORM_START_MS) {
				this.emitEvent('storm-phase', now, {
					stormPhase: storm.phase,
					stormRadius: storm.radius
				});
			}

			this.stateDirty = true;
		}

		if (now < this.nextStormDamageAt) return;
		this.nextStormDamageAt = now + ROYALE_STORM_DAMAGE_INTERVAL_MS;

		if (storm.dps <= 0) return;

		for (const player of this.players.values()) {
			if (!player.alive || player.mode === 'riding') continue;

			const distance = Math.hypot(player.x - storm.cx, player.z - storm.cz);
			if (distance <= storm.radius) continue;

			this.damage(player, storm.dps, {
				attackerId: null,
				cause: 'storm',
				now
			});

			this.emitEvent('storm-damage', now, {
				playerId: player.id,
				amount: Math.round(storm.dps),
				x: round(player.x),
				y: round(player.y),
				z: round(player.z)
			});
		}
	}

	private updateLoot(now: number): void {
		for (const player of [...this.players.values()].sort((a, b) => a.seq - b.seq)) {
			if (!player.alive || player.mode === 'riding') continue;

			for (const loot of this.loot) {
				if (!loot.available) continue;
				if (Math.hypot(player.x - loot.x, player.z - loot.z) > ROYALE_LOOT_RADIUS) continue;
				if (Math.abs(player.y - loot.y) > ROYALE_LOOT_VERTICAL) continue;

				this.applyPickup(player, loot, now);
				break;
			}
		}
	}

	private applyPickup(player: RoyalePlayer, loot: BotLoot, now: number): void {
		switch (loot.kind) {
			case 'weapon': {
				if (!loot.weapon) return;

				const definition = ROYALE_WEAPON_BY_ID.get(loot.weapon);
				if (!definition) return;

				if (player.inventory.has(loot.weapon)) {
					player.magAmmo = definition.magSize;
					player.inventory.set(loot.weapon, definition.magSize);
					player.reserveAmmo = Math.min(ROYALE_MAX_AMMO, player.reserveAmmo + definition.magSize);
				} else {
					player.inventory.set(loot.weapon, definition.magSize);
					player.weapon = loot.weapon;
					player.magAmmo = definition.magSize;
					player.reserveAmmo = Math.min(ROYALE_MAX_AMMO, player.reserveAmmo + definition.magSize);
				}
				break;
			}

			case 'ammo':
				player.reserveAmmo = Math.min(ROYALE_MAX_AMMO, player.reserveAmmo + ROYALE_AMMO_PICKUP);
				break;

			case 'shield':
				player.shield = Math.min(ROYALE_SHIELD_MAX, player.shield + ROYALE_SHIELD_PICKUP);
				break;

			case 'medkit':
				player.health = Math.min(ROYALE_HEALTH_MAX, player.health + ROYALE_MEDKIT_HEAL);
				break;

			case 'grenade':
				player.grenades = Math.min(ROYALE_MAX_GRENADES, player.grenades + 1);
				break;
		}

		loot.available = false;
		this.emitEvent('loot-taken', now, {
			playerId: player.id,
			lootId: loot.id,
			lootKind: loot.kind,
			weapon: loot.weapon ?? undefined
		});
		this.stateDirty = true;
	}

	/**
	 * Agua = rescate, no muerte. Por debajo de `ROYALE_WATER_RESCUE_Y` solo
	 * hay mar; el jugador vuelve a la celda caminable más cercana (la orilla)
	 * conservando vida y escudo. Si llevaba un vehículo, lo abandona: el coche
	 * se pierde en el fondo y el conductor reaparece en la costa.
	 *
	 * `fell` queda como red de seguridad para posiciones fuera del mapa donde
	 * no existe ninguna celda caminable.
	 */
	private updateFalls(now: number): void {
		for (const player of this.players.values()) {
			if (!player.alive) continue;
			if (player.y >= ROYALE_WATER_RESCUE_Y) continue;

			const vehicle = this.vehicleDrivenBy(player.id);
			const landing = nearestWalkable(vehicle?.x ?? player.x, vehicle?.z ?? player.z, 200);

			if (!landing) {
				this.damage(player, player.health + player.shield, {
					attackerId: null,
					cause: 'fell',
					now
				});
				continue;
			}

			if (vehicle) {
				vehicle.driverId = null;
				vehicle.speed = 0;
			}

			player.x = landing.x;
			player.y = landing.y;
			player.z = landing.z;
			player.vy = 0;
			player.fallStartY = null;
			player.mode = 'ground';
			player.lastPositionAt = now;

			if (vehicle) {
				// `vehicle-exit` ya lleva el punto de destino: el cliente deja
				// de conducir y se coloca en la orilla sin una corrección
				// extra que pudiera pisar este punto.
				this.emitEvent('vehicle-exit', now, {
					playerId: player.id,
					vehicleId: vehicle.id,
					vehicleKind: vehicle.kind,
					x: round(vehicle.x),
					y: round(vehicle.y),
					z: round(vehicle.z),
					px: round(player.x),
					py: round(player.y),
					pz: round(player.z),
					mode: 'ground'
				});
			} else {
				this.sendCorrection(player, 'water-rescue');
			}

			this.emitEvent('player-landed', now, {
				playerId: player.id,
				x: round(player.x),
				y: round(player.y),
				z: round(player.z),
				mode: 'ground'
			});

			this.stateDirty = true;
		}
	}

	private updateEnd(now: number): void {
		const alive = this.aliveCount();

		if (alive <= 1) {
			this.finishMatch(now);
			return;
		}

		if (this.matchEndsAt !== null && now >= this.matchEndsAt) {
			this.finishMatch(now);
		}
	}

	private finishMatch(now: number): void {
		if (this.phase !== 'playing') return;

		let survivors = [...this.players.values()]
			.filter((player) => player.alive)
			.sort((a, b) => {
				const scoreA = a.health + a.shield;
				const scoreB = b.health + b.shield;
				return scoreB - scoreA || b.kills - a.kills || b.damage - a.damage;
			});

		// Todos pueden morir en el mismo tick de tormenta. En ese caso el
		// último eliminado (puesto 1) sigue siendo el ganador determinista.
		if (survivors.length === 0) {
			const lastStanding = [...this.players.values()]
				.filter((player) => (player.placement ?? this.placements.get(player.id)) === 1)
				.sort((a, b) => b.kills - a.kills || b.damage - a.damage);

			survivors =
				lastStanding.length > 0
					? [lastStanding[0]]
					: [...this.players.values()]
							.sort((a, b) => b.kills - a.kills || b.damage - a.damage)
							.slice(0, 1);
		}

		survivors.forEach((player, index) => {
			this.placements.set(player.id, index + 1);
		});

		this.winner = survivors[0]?.id ?? null;
		this.phase = 'results';
		this.resultEndsAt = now + ROYALE_RESULT_MS;
		this.grenades = [];

		this.emitEvent('match-ended', now, { winner: this.winner });
		this.stateDirty = true;

		if (!this.matchId) {
			return;
		}

		const matchId = this.matchId;
		const events: Promise<boolean>[] = [];

		for (const player of this.players.values()) {
			if (player.isBot) {
				continue;
			}

			const placement = player.placement ?? this.placements.get(player.id) ?? 0;
			const base = { source: 'royale' as const, matchId, wsId: player.id };

			events.push(
				attestEvent({ ...base, metric: 'royale.matches', eventKey: 'played' })
			);

			if (placement === 1) {
				events.push(
					attestEvent({ ...base, metric: 'royale.wins', eventKey: 'win' })
				);
			}

			if (placement > 0 && placement <= 3) {
				events.push(
					attestEvent({ ...base, metric: 'royale.top3', eventKey: 'top3' })
				);
			}

			if (placement > 0) {
				events.push(
					attestEvent({
						...base,
						metric: 'royale.bestPlacement',
						amount: placement,
						eventKey: 'best'
					})
				);
			}
		}

		void Promise.allSettled(events);
	}

	// ------------------------------------------------------------------
	// Daño y muerte
	// ------------------------------------------------------------------

	private aliveCount(): number {
		let count = 0;
		for (const player of this.players.values()) {
			if (player.alive) count += 1;
		}
		return count;
	}

	/**
	 * Daño por caída al tocar suelo. Solo se aplica si el jugador salió de un
	 * globo en vuelo: el salto del zepelín es la entrada estándar y no registra
	 * altura. El planeo amortigua pero no anula el daño.
	 */
	private applyFallDamage(player: RoyalePlayer, gliding: boolean, now: number): void {
		const startY = player.fallStartY;
		player.fallStartY = null;

		if (startY === null || !player.alive) return;

		const amount = royaleFallDamage(startY - player.y, gliding);

		if (amount <= 0) return;

		this.damage(player, amount, {
			attackerId: null,
			cause: 'fall',
			now
		});
	}

	private damage(
		player: RoyalePlayer,
		amount: number,
		options: {
			attackerId: string | null;
			weapon?: RoyaleWeaponId;
			cause: 'combat' | 'storm' | 'fell' | 'fall';
			now: number;
		}
	): void {
		if (this.phase !== 'playing' || !player.alive || amount <= 0) return;

		const total = Math.round(amount * 100) / 100;
		const shieldTaken = Math.min(player.shield, total);
		player.shield = Math.max(0, player.shield - shieldTaken);
		const healthTaken = Math.max(0, total - shieldTaken);
		player.health = Math.max(0, player.health - healthTaken);

		const attacker =
			options.attackerId && options.attackerId !== player.id
				? (this.players.get(options.attackerId) ?? null)
				: null;

		if (attacker) {
			player.lastAttackerId = attacker.id;
			player.lastAttackerAt = options.now;
			attacker.damage += total;
		}

		if (options.cause !== 'storm' && options.cause !== 'fell') {
			if (total >= 8 || options.now - player.lastHurtEventAt >= 400) {
				player.lastHurtEventAt = options.now;
				this.emitEvent('player-hurt', options.now, {
					playerId: player.id,
					otherId: attacker?.id,
					weapon: options.weapon,
					amount: Math.round(total),
					x: round(player.x),
					y: round(player.y + 1.2),
					z: round(player.z)
				});
			}
		}

		if (player.health <= 0) {
			this.killPlayer(player, options.cause, options.weapon, options.now);
		}

		this.stateDirty = true;
	}

	private killPlayer(
		victim: RoyalePlayer,
		cause: 'combat' | 'storm' | 'fell' | 'fall',
		weapon: RoyaleWeaponId | undefined,
		now: number
	): void {
		if (!victim.alive) return;

		const vehicle = this.vehicleDrivenBy(victim.id);

		if (vehicle) {
			this.exitVehicle(vehicle, now, true);
		}

		const aliveBefore = this.aliveCount();
		victim.alive = false;
		victim.health = 0;
		victim.placement = aliveBefore;
		this.placements.set(victim.id, aliveBefore);

		// Suelta el arma equipada con el cargador actual.
		this.dropSeq += 1;
		this.loot.push({
			id: `drop:${victim.id}:${this.dropSeq}`,
			kind: 'weapon',
			weapon: victim.weapon,
			x: victim.x,
			y: victim.y + 0.9,
			z: victim.z,
			available: true
		});

		let killer: RoyalePlayer | null = null;

		if (victim.lastAttackerId !== null && now - victim.lastAttackerAt <= ROYALE_KILL_CREDIT_MS) {
			const candidate = this.players.get(victim.lastAttackerId);
			if (candidate && candidate.id !== victim.id && candidate.alive) {
				killer = candidate;
			}
		}

		if (killer) {
			killer.kills += 1;
			this.emitEvent('kill', now, {
				playerId: killer.id,
				otherId: victim.id,
				weapon: weapon ?? killer.weapon,
				x: round(victim.x),
				y: round(victim.y),
				z: round(victim.z)
			});

			if (!killer.isBot && this.matchId) {
				void attestEvent({
					source: 'royale',
					matchId: this.matchId,
					wsId: killer.id,
					metric: 'royale.kills',
					eventKey: `kill:${victim.id}:${aliveBefore}`
				});
			}
		}

		this.emitEvent('player-died', now, {
			playerId: victim.id,
			otherId: killer?.id,
			cause,
			placement: aliveBefore
		});
		this.stateDirty = true;
	}

	// ------------------------------------------------------------------
	// Snapshots
	// ------------------------------------------------------------------

	private toStorm(storm: RoyaleStormState): Mg8Storm {
		return {
			phase: storm.phase,
			cx: round(storm.cx),
			cz: round(storm.cz),
			radius: round(storm.radius),
			nextCx: round(storm.nextCx),
			nextCz: round(storm.nextCz),
			nextRadius: round(storm.nextRadius),
			endsAt: storm.endsAt,
			dps: storm.dps,
			state: storm.state
		};
	}

	private copyVehicle(vehicle: RoomVehicle): Mg8VehicleState {
		return {
			id: vehicle.id,
			kind: vehicle.kind,
			name: vehicle.name,
			model: vehicle.model,
			x: round(vehicle.x),
			y: round(vehicle.y),
			z: round(vehicle.z),
			qx: round(vehicle.qx, 4),
			qy: round(vehicle.qy, 4),
			qz: round(vehicle.qz, 4),
			qw: round(vehicle.qw, 4),
			yaw: round(vehicle.yaw, 3),
			speed: round(vehicle.speed, 2),
			health: Math.round(vehicle.health),
			maxHealth: vehicle.maxHealth,
			destroyed: vehicle.destroyed,
			driverId: vehicle.driverId
		};
	}

	private copyVehiclePose(vehicle: RoomVehicle): Mg8VehiclePose {
		return {
			id: vehicle.id,
			x: round(vehicle.x),
			y: round(vehicle.y),
			z: round(vehicle.z),
			qx: round(vehicle.qx, 4),
			qy: round(vehicle.qy, 4),
			qz: round(vehicle.qz, 4),
			qw: round(vehicle.qw, 4),
			yaw: round(vehicle.yaw, 3),
			speed: round(vehicle.speed, 2),
			health: Math.round(vehicle.health),
			destroyed: vehicle.destroyed,
			driverId: vehicle.driverId
		};
	}

	private copyPlayer(player: RoyalePlayer): Mg8PlayerState {
		return {
			id: player.id,
			name: player.name,
			skin: player.skin,
			isBot: player.isBot,
			alive: player.alive,
			health: Math.round(player.health),
			shield: Math.round(player.shield),
			kills: player.kills,
			damage: Math.round(player.damage),
			weapon: player.weapon,
			magAmmo: player.magAmmo,
			reserveAmmo: player.reserveAmmo,
			grenades: player.grenades,
			inventory: [...player.inventory.entries()]
				.map(([weapon, magAmmo]) => ({ weapon, magAmmo }))
				.sort((a, b) => ROYALE_WEAPON_SLOT_BY_ID[a.weapon] - ROYALE_WEAPON_SLOT_BY_ID[b.weapon]),
			mode: player.mode,
			x: round(player.x),
			y: round(player.y),
			z: round(player.z),
			yaw: round(player.yaw, 3),
			placement: player.placement,
			disconnectedAt: player.disconnectedAt
		};
	}

	buildSnapshot(now: number): Mg8Snapshot {
		const storm = this.currentStorm(now);
		const humans = this.humanCount();
		const bots = this.botCount();
		const players = [...this.players.values()].sort((a, b) => a.seq - b.seq);

		return {
			phase: this.phase,
			serverTime: now,
			countdownEndsAt: this.countdownEndsAt,
			matchStartedAt: this.matchStartedAt,
			boardingStartedAt: this.boardingStartedAt,
			matchEndsAt: this.matchEndsAt,
			resultEndsAt: this.resultEndsAt,
			storm: this.toStorm(storm),
			players: players.map((player) => this.copyPlayer(player)),
			humans,
			bots,
			loot: this.loot.map((loot): Mg8Loot => ({
				id: loot.id,
				kind: loot.kind,
				weapon: loot.weapon,
				x: round(loot.x),
				y: round(loot.y),
				z: round(loot.z),
				available: loot.available
			})),
			vehicles: [...this.vehicles.values()].map((vehicle) => this.copyVehicle(vehicle)),
			placements: players
				.filter((player) => this.placements.has(player.id) || player.placement !== null)
				.map((player) => ({
					playerId: player.id,
					placement: player.placement ?? this.placements.get(player.id) ?? 0
				}))
				.sort((a, b) => a.placement - b.placement),
			winner: this.winner,
			waitingForPlayers: this.phase === 'countdown' && this.connectedHumanCount() === 0,
			seed: this.seed
		};
	}

	private broadcast(now: number): void {
		if (this.phase === 'idle') return;

		if (this.stateDirty && now >= this.nextStateAt) {
			this.stateDirty = false;
			this.nextStateAt = now + ROYALE_STATE_INTERVAL_MS;
			this.port.broadcast({ type: 'mg8-state', state: this.buildSnapshot(now) });
		}

		if (now - this.lastPositionsAt < ROYALE_POSITION_INTERVAL_MS) return;
		this.lastPositionsAt = now;

		const players = [...this.players.values()].sort((a, b) => a.seq - b.seq);
		const positions: Mg8Positions = {
			at: now,
			players: players.map((player) => ({
				id: player.id,
				x: round(player.x),
				y: round(player.y),
				z: round(player.z),
				yaw: round(player.yaw, 3),
				mode: player.mode,
				alive: player.alive,
				isBot: player.isBot
			})),
			grenades: this.grenades.map((grenade) => ({
				id: grenade.id,
				x: round(grenade.x),
				y: round(grenade.y),
				z: round(grenade.z)
			})),
			vehicles: [...this.vehicles.values()].map((vehicle) => this.copyVehiclePose(vehicle))
		};

		this.port.broadcast({ type: 'mg8-positions', ...positions });
	}

	private emitEvent(kind: Mg8EventKind, now: number, extra: Partial<Mg8Event> = {}): void {
		const event: Mg8Event = { kind, at: now, ...extra };
		this.port.broadcast({ type: 'mg8-event', event });
	}

	private resetMatch(): void {
		this.phase = 'idle';
		this.players.clear();
		this.loot = [];
		this.grenades = [];
		this.vehicles.clear();
		this.placements.clear();
		this.countdownEndsAt = null;
		this.matchStartedAt = null;
		this.boardingStartedAt = null;
		this.matchEndsAt = null;
		this.resultEndsAt = null;
		this.waitingForPlayers = false;
		this.winner = null;
		this.lastStormPhase = -1;
		this.nextStormDamageAt = 0;
		this.nextStateAt = 0;
		this.lastPositionsAt = 0;
		this.nextSeq = 1;
		this.nextBotIndex = 0;
		this.stateDirty = true;
	}

	// ------------------------------------------------------------------
	// Introspección (scripts de verificación)
	// ------------------------------------------------------------------

	get phaseName(): Mg8Phase {
		return this.phase;
	}

	get playerCount(): number {
		return this.players.size;
	}

	get humanCountValue(): number {
		return this.humanCount();
	}

	get botCountValue(): number {
		return this.botCount();
	}

	get lootCount(): number {
		return this.loot.filter((loot) => loot.available).length;
	}

	get seedValue(): number {
		return this.seed;
	}

	get rawPlayers(): RoyalePlayer[] {
		return [...this.players.values()];
	}

	get rawLoot(): readonly BotLoot[] {
		return this.loot;
	}

	get vehicleCount(): number {
		return this.vehicles.size;
	}

	get rawVehicles(): RoomVehicle[] {
		return [...this.vehicles.values()];
	}
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
