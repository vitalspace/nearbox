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
	SkinId
} from '../protocol';
import { DEFAULT_SKIN } from '../protocol';
import { attestEvent, newMatchId } from '../../progression/attest';
import type { RoomPort } from '../port';
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
	royaleBotId,
	royaleBotName,
	royaleBotStormMargin,
	royaleJumpPosition,
	royaleRollLoot,
	royaleSafePoint,
	royaleStormAt,
	royaleZeppelinAt,
	type RoyaleLootKind,
	type RoyaleMode,
	type RoyaleStormState,
	type RoyaleVec3,
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
	bot?: BotMind;
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
			lastPositionAt: 0,
			lastShotAt: 0,
			lastReloadAt: 0,
			lastGrenadeAt: 0,
			lastAttackerId: null,
			lastAttackerAt: 0,
			lastHurtEventAt: 0,
			disconnectedAt: null,
			placement: null,
			seq: this.nextSeq++
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

		if (
			Math.hypot(player.x - origin.x, player.z - origin.z) > ROYALE_SHOT_ORIGIN_TOL ||
			Math.abs(player.y + 1.2 - origin.y) > 2.5
		) {
			return;
		}

		this.fire(player, weapon, origin, dir, targetId, now);
	}

	private fire(
		player: RoyalePlayer,
		weapon: RoyaleWeaponId,
		origin: RoyaleVec3,
		dir: RoyaleVec3,
		targetId: string | undefined,
		now: number
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
			? this.selectLockedTarget(player, origin, dir, definition.range, targetId)
			: null;
		const pellets = definition.pellets;

		for (let pellet = 0; pellet < pellets; pellet += 1) {
			const angle = definition.spread === 0 ? 0 : (combatRandom() * 2 - 1) * definition.spread;
			const pelletDir = spreadDirection(dir, definition.spread, angle);
			this.hitscan(player, origin, pelletDir, definition.range, definition.damage, now, locked);
		}

		this.stateDirty = true;
	}

	private selectLockedTarget(
		shooter: RoyalePlayer,
		origin: RoyaleVec3,
		dir: RoyaleVec3,
		range: number,
		targetId: string
	): RoyalePlayer | null {
		const target = this.players.get(targetId);

		if (!target || target.id === shooter.id || !target.alive) {
			return null;
		}

		const toX = target.x - origin.x;
		const toZ = target.z - origin.z;
		const distance = Math.hypot(toX, toZ);
		const flat = Math.hypot(dir.x, dir.z);
		const lateral = flat > 1e-4 ? Math.abs(toX * dir.z - toZ * dir.x) / flat : Infinity;
		const facing = toX * dir.x + toZ * dir.z > 0;

		if (distance <= range + 2 && facing && lateral <= 3 && this.hasClearShot(origin, target)) {
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
	private hasClearShot(origin: RoyaleVec3, target: RoyalePlayer): boolean {
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
		locked: RoyalePlayer | null
	): void {
		if (locked && locked.alive) {
			if (
				Math.hypot(origin.x - locked.x, origin.z - locked.z) <= range + 2 &&
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

			const hit = rayPointDistance2D(origin.x, origin.z, dir.x, dir.z, player.x, player.z);
			if (!hit || hit.along > range || hit.lateral > 0.85) continue;

			const rayY = origin.y + dir.y * hit.along;
			if (rayY < player.y - 0.35 || rayY > player.y + 2.2) continue;

			if (!this.hasClearShot(origin, player)) continue;

			if (hit.along < bestAlong) {
				bestAlong = hit.along;
				best = player;
			}
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

		if (
			Math.hypot(player.x - origin.x, player.z - origin.z) > ROYALE_SHOT_ORIGIN_TOL + 1 ||
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
			flightMs: flight * 1000,
			fuseAt: now + ROYALE_GRENADE_FUSE_MS,
			targetX: target.x,
			targetZ: target.z
		});

		this.emitEvent('grenade-thrown', now, { playerId: player.id });
		this.stateDirty = true;
	}

	onReload(playerId: string, now: number): void {
		const player = this.players.get(playerId);

		if (!player || player.isBot || !player.alive) return;
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
				this.updateAutoJump(now);
				this.updateBots(now);
				this.updateGrenades(now);
				this.updateStorm(now);
				this.updateLoot(now);
				this.updateFalls(now);
				this.updateEnd(now);
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
			shoot: (player, dir) => {
				const shooter = player as RoyalePlayer;
				if (shooter.mode === 'riding') return;
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
			emit: (kind, extra) => this.emitEvent(kind, now, extra),
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
					grenade.y = floorHeightAt(grenade.targetX, grenade.targetZ) ?? 0.5;
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

	private updateFalls(now: number): void {
		for (const player of this.players.values()) {
			if (!player.alive) continue;
			if (player.y >= ROYALE_KILL_Y) continue;

			this.damage(player, player.health + player.shield, {
				attackerId: null,
				cause: 'fell',
				now
			});
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

	private damage(
		player: RoyalePlayer,
		amount: number,
		options: {
			attackerId: string | null;
			weapon?: RoyaleWeaponId;
			cause: 'combat' | 'storm' | 'fell';
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
		cause: 'combat' | 'storm' | 'fell',
		weapon: RoyaleWeaponId | undefined,
		now: number
	): void {
		if (!victim.alive) return;

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
			}))
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
		this.placements.clear();
		this.countdownEndsAt = null;
		this.matchStartedAt = null;
		this.boardingStartedAt = null;
		this.matchEndsAt = null;
		this.resultEndsAt = null;
		this.waitingForPlayers = false;
		this.winner = null;
		this.matchId = null;
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
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
