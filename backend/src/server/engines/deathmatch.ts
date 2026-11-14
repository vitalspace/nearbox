import {
	AMMO_PACK_AMOUNT,
	DM_CHECKPOINT,
	DM_COUNTDOWN_MS,
	DM_GRENADE_COOLDOWN_MS,
	DM_KILL_CREDIT_MS,
	DM_MATCH_MS,
	DM_MAX_PLAYERS,
	DM_MIN_PLAYERS,
	DM_PICKUPS,
	DM_PICKUP_RADIUS,
	DM_POSITION_INTERVAL_MS,
	DM_RESPAWN_MS,
	DM_RESULT_MS,
	DM_SHOT_ORIGIN_TOLERANCE,
	DM_SPAWN_POSITION_LOCK_MS,
	DM_SPAWN_PROTECTION_MS,
	DM_STARTER_AMMO,
	DM_STARTER_GRENADES,
	DM_STARTER_WEAPON,
	DM_STATE_INTERVAL_MS,
	DM_TEAM_META,
	DM_TEAM_SIZE,
	DM_TEAM_SPAWNS,
	DM_DUPLICATE_WEAPON_AMMO,
	GRENADE_FUSE_MS,
	GRENADE_RADIUS,
	GRENADE_VERTICAL_REACH,
	MAX_GRENADES,
	MEDKIT_AMOUNT,
	PLAYER_MAX_HEALTH,
	WEAPON_BY_ID,
	WEAPON_BY_SLOT,
	WEAPON_SLOT_BY_ID,
	dmClampToArena,
	dmPickupWeapon,
	dmPickSpawnSlot,
	enemyTeam,
	type DmPickupKind,
	type DmPhase,
	type DmTeam,
	type DmWeaponId,
	type DmWinner,
	type Mg5WeaponId
} from '../../lib/state/dmConfig';
import type {
	Mg6Event,
	Mg6EventKind,
	Mg6Pickup,
	Mg6PlayerState,
	Mg6Positions,
	Mg6Snapshot
} from '../protocol';
import type { RoomPort } from '../port';
import { attestEvent, newMatchId } from '../../progression/attest';
import {
	grenadeDamageAt,
	horizontalDistance,
	rayPointDistance2D,
	round,
	segmentBlocked,
	spreadDirection
} from './combat';

const GRENADE_GRAVITY = 9.8;
const GRENADE_THROW_FALLBACK_RANGE = 18;

type DmPlayer = {
	id: string;
	name: string;
	team: DmTeam;
	health: number;
	alive: boolean;
	kills: number;
	deaths: number;
	weapon: Mg5WeaponId;
	magAmmo: number;
	/** Armas poseídas → balas en el cargador de cada una. */
	inventory: Map<Mg5WeaponId, number>;
	/** Reserva universal; la pistola la ignora. */
	reserveAmmo: number;
	grenades: number;
	x: number;
	y: number;
	z: number;
	yaw: number;
	spawnSlot: number;
	/** Inmune a daño hasta este instante (0 = sin protección). */
	protectionUntil: number;
	/** Ignora reportes de posición hasta este instante (evita pisar el spawn). */
	positionLockUntil: number;
	/** Instante de reaparición; `null` si está vivo. */
	respawnAt: number | null;
	/** Para desempatar quién es el jugador más reciente en el rebalanceo. */
	seq: number;
	lastPositionAt: number;
	lastShotAt: number;
	lastReloadAt: number;
	lastGrenadeAt: number;
	lastAttackerId: string | null;
	lastAttackerAt: number;
	lastHurtEventAt: number;
};

type RoomPickup = {
	id: string;
	kind: DmPickupKind;
	x: number;
	y: number;
	z: number;
	availableAt: number;
	respawnMs: number;
};

type RoomGrenade = {
	id: string;
	ownerId: string;
	ownerTeam: DmTeam;
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

type RecentPlayer = {
	team: DmTeam;
	kills: number;
	deaths: number;
	leftAt: number;
};

export type DeathmatchDeps = {
	moveToLobby: (playerId: string) => void;
};

export type EnterResult = { ok: true } | { ok: false; code: string; message: string };

let grenadeSeq = 0;

function nextGrenadeId(): string {
	grenadeSeq += 1;
	return `dm-grenade-${grenadeSeq}`;
}

/**
 * Witch House Deathmatch — motor autoritativo.
 *
 * Fases: `idle → countdown (30 s, espera a 2) → playing (6 min) → results
 * (15 s) → idle`. Sin monstruos ni vehículos: solo PvP por equipos.
 */
export class Deathmatch {
	private phase: DmPhase = 'idle';
	private players = new Map<string, DmPlayer>();
	private recent = new Map<string, RecentPlayer>();
	private pickups: RoomPickup[] = DM_PICKUPS.map((pickup) => ({
		...pickup,
		availableAt: 0
	}));
	private grenades: RoomGrenade[] = [];
	private teamScores: Record<DmTeam, number> = { coven: 0, hunters: 0 };
	private countdownEndsAt: number | null = null;
	private matchEndsAt: number | null = null;
	private resultEndsAt: number | null = null;
	private waitingForPlayers = false;
	private winner: DmWinner | null = null;
	private mvpId: string | null = null;
	/** Partida actual; kills y resultado comparten este id. */
	private matchId: string | null = null;
	private lastAssignedTeam: DmTeam = 'hunters';
	private nextSeq = 1;
	private stateDirty = true;
	private nextStateAt = 0;
	private lastPositionsAt = 0;

	constructor(
		private readonly port: RoomPort,
		private readonly deps: DeathmatchDeps
	) {}

	// ------------------------------------------------------------------
	// Entrada / salida
	// ------------------------------------------------------------------

	canEnter(playerId: string): EnterResult {
		// Existing members can always stay; only a brand new player can find
		// the lobby full.
		if (this.players.has(playerId)) {
			return { ok: true };
		}

		if (this.players.size >= DM_MAX_PLAYERS) {
			return {
				ok: false,
				code: 'DM_FULL',
				message: `The witch house is full (${DM_MAX_PLAYERS} players)`
			};
		}

		return { ok: true };
	}

	onEnter(playerId: string, name: string, now: number): EnterResult {
		const existing = this.players.get(playerId);

		if (existing) {
			existing.name = name;
			this.stateDirty = true;
			return { ok: true };
		}

		const admission = this.canEnter(playerId);

		if (!admission.ok) {
			return admission;
		}

		const recent = this.recent.get(playerId);
		const reconnect = recent !== undefined && now - recent.leftAt <= 20_000;

		if (reconnect) {
			this.recent.delete(playerId);
		}

		const team = reconnect && recent ? this.teamForReconnect(recent.team) : this.pickTeam();
		this.lastAssignedTeam = team;

		const enemies = this.alivePlayersOf(enemyTeam(team));
		const spawnSlot = dmPickSpawnSlot(team, enemies, this.players.size);
		const spawn = DM_TEAM_SPAWNS[team][spawnSlot];
		const pistol = WEAPON_BY_ID.get(DM_STARTER_WEAPON)!;

		const player: DmPlayer = {
			id: playerId,
			name,
			team,
			health: PLAYER_MAX_HEALTH,
			alive: true,
			kills: reconnect && recent ? recent.kills : 0,
			deaths: reconnect && recent ? recent.deaths : 0,
			weapon: DM_STARTER_WEAPON,
			magAmmo: pistol.magSize,
			inventory: new Map([[DM_STARTER_WEAPON, pistol.magSize]]),
			reserveAmmo: DM_STARTER_AMMO,
			grenades: DM_STARTER_GRENADES,
			x: spawn.x,
			y: spawn.y,
			z: spawn.z,
			yaw: 0,
			spawnSlot,
			protectionUntil: this.phase === 'playing' ? now + DM_SPAWN_PROTECTION_MS : 0,
			positionLockUntil: 0,
			respawnAt: null,
			seq: this.nextSeq++,
			lastPositionAt: 0,
			lastShotAt: 0,
			lastReloadAt: 0,
			lastGrenadeAt: 0,
			lastAttackerId: null,
			lastAttackerAt: 0,
			lastHurtEventAt: 0
		};

		this.players.set(playerId, player);

		if (this.phase === 'idle') {
			this.phase = 'countdown';
			this.waitingForPlayers = true;
			this.countdownEndsAt = null;
			this.winner = null;
			this.mvpId = null;
			this.teamScores = { coven: 0, hunters: 0 };
		}

		this.refreshWaiting(now);

		// Un reconectado vuelve siempre a su equipo anterior: si mientras
		// estaba fuera el balanceo movió a otros jugadores, esa vuelta puede
		// dejar los equipos descompensados. Reequilibrar aquí (idle/countdown)
		// garantiza `abs(coven − hunters) ≤ 1` tras cada entrada.
		this.rebalanceTeams(now);

		this.emitEvent('player-joined', now, {
			playerId,
			team: player.team,
			x: round(player.x),
			y: round(player.y),
			z: round(player.z)
		});
		this.stateDirty = true;

		return { ok: true };
	}

	onLeave(playerId: string, now: number): void {
		const player = this.players.get(playerId);

		if (!player) {
			return;
		}

		this.players.delete(playerId);
		this.recent.set(playerId, {
			team: player.team,
			kills: player.kills,
			deaths: player.deaths,
			leftAt: now
		});

		this.emitEvent('player-left', now, { playerId, team: player.team });

		if (this.players.size === 0) {
			this.resetMatch();
			return;
		}

		if (this.phase === 'idle' || this.phase === 'countdown') {
			this.rebalanceTeams(now);
			this.refreshWaiting(now);
		}

		this.stateDirty = true;
	}

	private refreshWaiting(now: number): void {
		if (this.phase !== 'countdown') {
			this.waitingForPlayers = false;
			return;
		}

		if (this.players.size < DM_MIN_PLAYERS) {
			this.waitingForPlayers = true;
			this.countdownEndsAt = null;
			return;
		}

		if (this.waitingForPlayers || this.countdownEndsAt === null) {
			this.waitingForPlayers = false;

			// No reiniciar la cuenta atrás si ya estaba corriendo.
			if (this.countdownEndsAt === null) {
				this.countdownEndsAt = now + DM_COUNTDOWN_MS;
			}
		}
	}

	// ------------------------------------------------------------------
	// Equipos y balanceo
	// ------------------------------------------------------------------

	private teamCount(team: DmTeam): number {
		let count = 0;

		for (const player of this.players.values()) {
			if (player.team === team) {
				count += 1;
			}
		}

		return count;
	}

	private pickTeam(): DmTeam {
		const coven = this.teamCount('coven');
		const hunters = this.teamCount('hunters');

		if (coven < DM_TEAM_SIZE && coven < hunters) {
			return 'coven';
		}

		if (hunters < DM_TEAM_SIZE && hunters < coven) {
			return 'hunters';
		}

		if (coven >= DM_TEAM_SIZE && hunters < DM_TEAM_SIZE) {
			return 'hunters';
		}

		if (hunters >= DM_TEAM_SIZE && coven < DM_TEAM_SIZE) {
			return 'coven';
		}

		// Empatados y con hueco: alternancia.
		const preferred: DmTeam = this.lastAssignedTeam === 'coven' ? 'hunters' : 'coven';

		if (this.teamCount(preferred) < DM_TEAM_SIZE) {
			return preferred;
		}

		return preferred === 'coven' ? 'hunters' : 'coven';
	}

	private teamForReconnect(team: DmTeam): DmTeam {
		return this.teamCount(team) < DM_TEAM_SIZE ? team : this.pickTeam();
	}

	/** Solo en `idle`/`countdown`: mueve al más reciente mientras `diff > 1`. */
	private rebalanceTeams(now: number): void {
		if (this.phase !== 'idle' && this.phase !== 'countdown') {
			return;
		}

		for (let guard = 0; guard < DM_MAX_PLAYERS; guard += 1) {
			const coven = this.teamCount('coven');
			const hunters = this.teamCount('hunters');

			if (Math.abs(coven - hunters) <= 1) {
				return;
			}

			const from: DmTeam = coven > hunters ? 'coven' : 'hunters';
			const to: DmTeam = from === 'coven' ? 'hunters' : 'coven';
			let newest: DmPlayer | null = null;

			for (const player of this.players.values()) {
				if (player.team !== from) {
					continue;
				}

				if (!newest || player.seq > newest.seq) {
					newest = player;
				}
			}

			if (!newest) {
				return;
			}

			newest.team = to;
			const enemies = this.alivePlayersOf(enemyTeam(to));
			newest.spawnSlot = dmPickSpawnSlot(to, enemies, newest.seq);
			const spawn = DM_TEAM_SPAWNS[to][newest.spawnSlot];
			newest.x = spawn.x;
			newest.y = spawn.y;
			newest.z = spawn.z;

			this.emitEvent('team-changed', now, {
				playerId: newest.id,
				team: to,
				otherTeam: from
			});
			this.stateDirty = true;
		}
	}

	// ------------------------------------------------------------------
	// Mensajes del cliente
	// ------------------------------------------------------------------

	onPosition(playerId: string, x: number, y: number, z: number, yaw: number, now: number): void {
		const player = this.players.get(playerId);

		if (!player) {
			return;
		}

		// Mientras está muerto el cliente sigue reportando la posición del
		// cadáver. Ignorarla evita que el spawn autoritativo se sobrescriba.
		if (!player.alive) {
			return;
		}

		// Paquetes en vuelo desde el punto de muerte: durante una ventana
		// corta tras reaparecer mandamos el spawn, no lo que diga el cliente.
		if (now < player.positionLockUntil) {
			return;
		}

		const clamped = dmClampToArena(x, z);
		player.x = clamped.x;
		player.y = y;
		player.z = clamped.z;
		player.yaw = yaw;
		player.lastPositionAt = now;
	}

	onShoot(
		playerId: string,
		weapon: Mg5WeaponId,
		origin: { x: number; y: number; z: number },
		dir: { x: number; y: number; z: number },
		targetId: string | undefined,
		now: number
	): void {
		const player = this.players.get(playerId);

		if (!player || this.phase !== 'playing' || !player.alive) {
			return;
		}

		if (player.weapon !== weapon) {
			return;
		}

		const definition = WEAPON_BY_ID.get(weapon);

		if (!definition) {
			return;
		}

		const minInterval = 1000 / definition.rate;

		if (now - player.lastShotAt < minInterval * 0.8) {
			return;
		}

		if (
			horizontalDistance(player.x, player.z, origin.x, origin.z) > DM_SHOT_ORIGIN_TOLERANCE ||
			Math.abs(player.y - origin.y) > 2.5
		) {
			return;
		}

		if (player.magAmmo <= 0) {
			this.stateDirty = true;
			return;
		}

		player.magAmmo -= 1;
		player.inventory.set(player.weapon, player.magAmmo);
		player.lastShotAt = now;
		player.protectionUntil = 0;

		this.emitEvent('shot-fired', now, {
			playerId,
			weapon,
			x: origin.x,
			y: origin.y,
			z: origin.z,
			dx: dir.x,
			dy: dir.y,
			dz: dir.z
		});

		let locked: DmPlayer | null = null;

		if (targetId) {
			const target = this.players.get(targetId);

			if (target && target.alive && target.id !== player.id && target.team !== player.team) {
				const toX = target.x - origin.x;
				const toZ = target.z - origin.z;
				const distance = Math.hypot(toX, toZ);
				const flat = Math.hypot(dir.x, dir.z);
				const lateral =
					flat > 1e-4 ? Math.abs(toX * dir.z - toZ * dir.x) / flat : Number.POSITIVE_INFINITY;
				const facing = toX * dir.x + toZ * dir.z > 0;
				const clear = !segmentBlocked(origin.x, origin.z, target.x, target.z);

				if (distance <= definition.range + 2 && facing && lateral <= 3 && clear) {
					locked = target;
				}
			}
		}

		const pellets = definition.pellets ?? 1;

		for (let pellet = 0; pellet < pellets; pellet += 1) {
			const spread = definition.spread ?? 0;
			const angle = spread === 0 ? 0 : (Math.random() - 0.5) * 2 * spread;
			const pelletDir = spreadDirection(dir, spread, angle);

			this.hitscan(player, origin, pelletDir, definition.range, definition.damage, now, locked);
		}

		this.stateDirty = true;
	}

	private hitscan(
		shooter: DmPlayer,
		origin: { x: number; y: number; z: number },
		dir: { x: number; y: number; z: number },
		range: number,
		damage: number,
		now: number,
		locked: DmPlayer | null
	): void {
		if (locked && locked.alive) {
			if (
				horizontalDistance(origin.x, origin.z, locked.x, locked.z) <= range + 2 &&
				!segmentBlocked(origin.x, origin.z, locked.x, locked.z)
			) {
				this.damagePlayerFrom(locked, damage, shooter.id, shooter.weapon, now);
			}

			return;
		}

		let best: DmPlayer | null = null;
		let bestAlong = Number.POSITIVE_INFINITY;

		for (const player of this.players.values()) {
			if (!player.alive || player.id === shooter.id || player.team === shooter.team) {
				continue;
			}

			const hit = rayPointDistance2D(origin.x, origin.z, dir.x, dir.z, player.x, player.z);

			if (!hit || hit.along > range || hit.lateral > 0.7) {
				continue;
			}

			const rayY = origin.y + dir.y * hit.along;

			if (rayY < player.y - 0.25 || rayY > player.y + 2.1) {
				continue;
			}

			if (segmentBlocked(origin.x, origin.z, player.x, player.z)) {
				continue;
			}

			if (hit.along < bestAlong) {
				bestAlong = hit.along;
				best = player;
			}
		}

		if (best) {
			this.damagePlayerFrom(best, damage, shooter.id, shooter.weapon, now);
		}
	}

	onThrow(
		playerId: string,
		origin: { x: number; y: number; z: number },
		dir: { x: number; y: number; z: number },
		tx: number | undefined,
		tz: number | undefined,
		now: number
	): void {
		const player = this.players.get(playerId);

		if (!player || this.phase !== 'playing' || !player.alive) {
			return;
		}

		if (player.grenades <= 0) {
			return;
		}

		if (now - player.lastGrenadeAt < DM_GRENADE_COOLDOWN_MS) {
			return;
		}

		if (
			horizontalDistance(player.x, player.z, origin.x, origin.z) > DM_SHOT_ORIGIN_TOLERANCE + 1 ||
			Math.abs(player.y - origin.y) > 2.5
		) {
			return;
		}

		player.grenades -= 1;
		player.lastGrenadeAt = now;
		player.protectionUntil = 0;

		const fallback = {
			x: origin.x + dir.x * GRENADE_THROW_FALLBACK_RANGE,
			z: origin.z + dir.z * GRENADE_THROW_FALLBACK_RANGE
		};
		const target = dmClampToArena(
			tx !== undefined ? tx : fallback.x,
			tz !== undefined ? tz : fallback.z
		);
		const distance = horizontalDistance(origin.x, origin.z, target.x, target.z);
		const flight = Math.min(1.6, Math.max(0.55, 0.55 + distance / 22));
		const vx = (target.x - origin.x) / flight;
		const vz = (target.z - origin.z) / flight;
		const vy = (0.5 - origin.y) / flight + (GRENADE_GRAVITY * flight) / 2;

		this.grenades.push({
			id: nextGrenadeId(),
			ownerId: player.id,
			ownerTeam: player.team,
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
			fuseAt: now + GRENADE_FUSE_MS,
			targetX: target.x,
			targetZ: target.z
		});

		this.emitEvent('grenade-thrown', now, { playerId });
		this.stateDirty = true;
	}

	onReload(playerId: string, now: number): void {
		const player = this.players.get(playerId);

		if (!player || !player.alive) {
			return;
		}

		if (now - player.lastReloadAt < 500) {
			return;
		}

		const definition = WEAPON_BY_ID.get(player.weapon);

		if (!definition) {
			return;
		}

		const missing = definition.magSize - player.magAmmo;

		if (missing <= 0) {
			return;
		}

		if (player.weapon === 'pistol') {
			player.magAmmo = definition.magSize;
			player.inventory.set(player.weapon, player.magAmmo);
			player.lastReloadAt = now;
			this.stateDirty = true;
			return;
		}

		const take = Math.min(missing, player.reserveAmmo);

		if (take <= 0) {
			return;
		}

		player.magAmmo += take;
		player.inventory.set(player.weapon, player.magAmmo);
		player.reserveAmmo -= take;
		player.lastReloadAt = now;
		this.stateDirty = true;
	}

	onEquip(playerId: string, slot: number): void {
		const player = this.players.get(playerId);

		if (!player || !player.alive || this.phase !== 'playing') {
			return;
		}

		const weapon = WEAPON_BY_SLOT[slot];

		if (!weapon || !player.inventory.has(weapon)) {
			return;
		}

		if (player.weapon === weapon) {
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
			this.updatePhase(now);
			this.updateRespawns(now);
			this.updatePickups(now);
			this.updateGrenades(now);
			this.broadcast(now);
		} catch (error) {
			console.error('[deathmatch] tick failed', error);
			this.phase = 'idle';
			this.resetMatch();
		}
	}

	private updatePhase(now: number): void {
		if (this.phase === 'countdown') {
			this.refreshWaiting(now);

			if (this.countdownEndsAt !== null && now >= this.countdownEndsAt) {
				if (this.players.size >= DM_MIN_PLAYERS) {
					this.startMatch(now);
				} else {
					this.waitingForPlayers = true;
					this.countdownEndsAt = null;
				}
			}

			return;
		}

		if (this.phase === 'playing') {
			if (this.matchEndsAt !== null && now >= this.matchEndsAt) {
				this.finishMatch(now);
			}

			return;
		}

		if (this.phase === 'results' && this.resultEndsAt !== null && now >= this.resultEndsAt) {
			for (const playerId of [...this.players.keys()]) {
				this.deps.moveToLobby(playerId);
			}

			this.resetMatch();
		}
	}

	private startMatch(now: number): void {
		this.phase = 'playing';
		this.waitingForPlayers = false;
		this.countdownEndsAt = null;
		this.matchEndsAt = now + DM_MATCH_MS;
		this.resultEndsAt = null;
		this.winner = null;
		this.mvpId = null;
		this.matchId = newMatchId();
		this.teamScores = { coven: 0, hunters: 0 };
		this.grenades = [];

		for (const pickup of this.pickups) {
			pickup.availableAt = 0;
		}

		for (const player of this.players.values()) {
			player.kills = 0;
			player.deaths = 0;
			this.spawnPlayer(player, now, true);
		}

		this.emitEvent('match-started', now, {});
		this.stateDirty = true;
	}

	private finishMatch(now: number): void {
		const coven = this.teamScores.coven;
		const hunters = this.teamScores.hunters;
		this.phase = 'results';
		this.resultEndsAt = now + DM_RESULT_MS;
		this.winner = coven > hunters ? 'coven' : hunters > coven ? 'hunters' : 'draw';
		this.mvpId = this.computeMvp();
		this.grenades = [];

		for (const player of this.players.values()) {
			player.respawnAt = null;
		}

		this.emitEvent('match-ended', now, { winner: this.winner });
		this.stateDirty = true;

		if (!this.matchId) {
			return;
		}

		const matchId = this.matchId;
		const events: Promise<boolean>[] = [];

		for (const player of this.players.values()) {
			const base = { source: 'deathmatch' as const, matchId, wsId: player.id };

			events.push(
				attestEvent({ ...base, metric: 'hexfire.matches', eventKey: 'played' })
			);

			if (this.winner !== 'draw' && player.team === this.winner) {
				events.push(
					attestEvent({ ...base, metric: 'hexfire.wins', eventKey: 'win' })
				);
			}
		}

		void Promise.allSettled(events);
	}

	private computeMvp(): string | null {
		let best: DmPlayer | null = null;

		for (const player of this.players.values()) {
			if (!best) {
				best = player;
				continue;
			}

			if (
				player.kills > best.kills ||
				(player.kills === best.kills && player.deaths < best.deaths)
			) {
				best = player;
			}
		}

		return best?.id ?? null;
	}

	private updateRespawns(now: number): void {
		if (this.phase !== 'playing') {
			return;
		}

		for (const player of this.players.values()) {
			if (!player.alive && player.respawnAt !== null && now >= player.respawnAt) {
				this.spawnPlayer(player, now, false);
			}
		}
	}

	private spawnPlayer(player: DmPlayer, now: number, resetStats: boolean): void {
		const enemies = this.alivePlayersOf(enemyTeam(player.team));
		player.spawnSlot = dmPickSpawnSlot(player.team, enemies, player.seq);
		const spawn = DM_TEAM_SPAWNS[player.team][player.spawnSlot];
		const pistol = WEAPON_BY_ID.get(DM_STARTER_WEAPON)!;

		player.x = spawn.x;
		player.y = spawn.y;
		player.z = spawn.z;
		player.yaw = 0;
		player.health = PLAYER_MAX_HEALTH;
		player.alive = true;
		player.weapon = DM_STARTER_WEAPON;
		player.magAmmo = pistol.magSize;
		player.inventory = new Map([[DM_STARTER_WEAPON, pistol.magSize]]);
		player.reserveAmmo = DM_STARTER_AMMO;
		player.grenades = DM_STARTER_GRENADES;
		player.respawnAt = null;
		player.protectionUntil = now + DM_SPAWN_PROTECTION_MS;
		player.positionLockUntil = resetStats ? 0 : now + DM_SPAWN_POSITION_LOCK_MS;
		player.lastAttackerId = null;
		player.lastAttackerAt = 0;
		player.lastShotAt = 0;
		player.lastGrenadeAt = 0;
		player.lastReloadAt = 0;

		if (resetStats) {
			player.protectionUntil = 0;
		}

		this.emitEvent('player-respawned', now, {
			playerId: player.id,
			x: round(spawn.x),
			y: round(spawn.y),
			z: round(spawn.z),
			protectedUntil: player.protectionUntil
		});
		this.stateDirty = true;
	}

	private updatePickups(now: number): void {
		for (const pickup of this.pickups) {
			if (pickup.availableAt !== 0 && now >= pickup.availableAt) {
				pickup.availableAt = 0;
				this.emitEvent('pickup-respawned', now, {
					pickupId: pickup.id,
					pickupKind: pickup.kind
				});
				this.stateDirty = true;
			}
		}

		if (this.phase !== 'playing') {
			return;
		}

		for (const player of this.players.values()) {
			if (!player.alive) {
				continue;
			}

			for (const pickup of this.pickups) {
				if (pickup.availableAt !== 0) {
					continue;
				}

				if (horizontalDistance(player.x, player.z, pickup.x, pickup.z) > DM_PICKUP_RADIUS) {
					continue;
				}

				if (Math.abs(player.y - pickup.y) > 2) {
					continue;
				}

				this.applyPickup(player, pickup, now);
				break;
			}
		}
	}

	private applyPickup(player: DmPlayer, pickup: RoomPickup, now: number): void {
		const weapon = dmPickupWeapon(pickup.kind);

		if (weapon) {
			const definition = WEAPON_BY_ID.get(weapon);

			if (definition) {
				if (player.inventory.has(weapon)) {
					player.magAmmo = definition.magSize;
					player.inventory.set(weapon, definition.magSize);
					player.reserveAmmo += DM_DUPLICATE_WEAPON_AMMO;
				} else {
					player.inventory.set(weapon, definition.magSize);
					player.magAmmo = definition.magSize;
				}

				player.weapon = weapon;
			}
		} else if (pickup.kind === 'grenade') {
			player.grenades = Math.min(MAX_GRENADES, player.grenades + 2);
		} else if (pickup.kind === 'ammo') {
			player.reserveAmmo += AMMO_PACK_AMOUNT;
		} else if (pickup.kind === 'medkit') {
			player.health = Math.min(PLAYER_MAX_HEALTH, player.health + MEDKIT_AMOUNT);
		}

		pickup.availableAt = now + pickup.respawnMs;

		this.emitEvent('pickup-taken', now, {
			pickupId: pickup.id,
			pickupKind: pickup.kind,
			playerId: player.id
		});
		this.stateDirty = true;
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
					grenade.y = 0.5;
				}

				this.explodeGrenade(grenade, now);
				continue;
			}

			remaining.push(grenade);
		}

		this.grenades = remaining;
	}

	private explodeGrenade(grenade: RoomGrenade, now: number): void {
		const owner = this.players.get(grenade.ownerId);
		const ownerTeam = owner?.team ?? grenade.ownerTeam;

		for (const player of this.players.values()) {
			if (!player.alive) {
				continue;
			}

			// El lanzador sí se daña a sí mismo; sus compañeros no.
			if (player.id !== grenade.ownerId && player.team === ownerTeam) {
				continue;
			}

			const distance = horizontalDistance(player.x, player.z, grenade.x, grenade.z);

			if (distance > GRENADE_RADIUS || Math.abs(player.y - grenade.y) > GRENADE_VERTICAL_REACH) {
				continue;
			}

			const damage = grenadeDamageAt(distance);

			if (damage <= 0) {
				continue;
			}

			this.damagePlayerFrom(player, damage, grenade.ownerId, 'grenade', now);
		}

		this.emitEvent('grenade-exploded', now, {
			playerId: grenade.ownerId,
			x: round(grenade.x),
			y: round(grenade.y),
			z: round(grenade.z)
		});
		this.stateDirty = true;
	}

	// ------------------------------------------------------------------
	// Daño, muerte y respawn
	// ------------------------------------------------------------------

	private damagePlayerFrom(
		player: DmPlayer,
		amount: number,
		attackerId: string | null,
		weapon: DmWeaponId,
		now: number
	): void {
		if (this.phase !== 'playing' || !player.alive) {
			return;
		}

		if (player.protectionUntil > now) {
			return;
		}

		const attacker =
			attackerId && attackerId !== player.id ? (this.players.get(attackerId) ?? null) : null;
		const sameTeam = attacker !== null && attacker.team === player.team;

		if (sameTeam) {
			return;
		}

		player.health -= amount;

		if (attacker) {
			player.lastAttackerId = attacker.id;
			player.lastAttackerAt = now;
		}

		const isSelf = attackerId === player.id;

		if (amount >= 8 || now - player.lastHurtEventAt >= 400) {
			player.lastHurtEventAt = now;
			this.emitEvent('player-hurt', now, {
				playerId: player.id,
				otherId: attacker?.id,
				amount: Math.round(amount),
				weapon,
				// Point on the victim used by the client for the blood splat.
				x: round(player.x),
				y: round(player.y + 1.2),
				z: round(player.z)
			});
		}

		if (isSelf) {
			this.emitEvent('self-damage', now, {
				playerId: player.id,
				amount: Math.round(amount),
				weapon
			});
		}

		if (player.health <= 0) {
			this.killPlayer(player, now, weapon);
		}

		this.stateDirty = true;
	}

	private killPlayer(victim: DmPlayer, now: number, weapon: DmWeaponId): void {
		if (!victim.alive) {
			return;
		}

		victim.alive = false;
		victim.health = 0;
		victim.deaths += 1;
		victim.respawnAt = now + DM_RESPAWN_MS;

		let killer: DmPlayer | null = null;

		if (victim.lastAttackerId !== null && now - victim.lastAttackerAt <= DM_KILL_CREDIT_MS) {
			const candidate = this.players.get(victim.lastAttackerId);

			if (candidate && candidate.team !== victim.team && candidate.id !== victim.id) {
				killer = candidate;
			}
		}

		if (killer) {
			killer.kills += 1;
			this.teamScores[killer.team] += 1;

			if (this.matchId) {
				void attestEvent({
					source: 'deathmatch',
					matchId: this.matchId,
					wsId: killer.id,
					metric: 'hexfire.kills',
					eventKey: `kill:${victim.id}:${victim.deaths}`
				});
			}
		}

		this.emitEvent('kill', now, {
			playerId: killer?.id,
			otherId: victim.id,
			team: killer?.team,
			otherTeam: victim.team,
			weapon
		});
		this.emitEvent('player-died', now, {
			playerId: victim.id,
			otherId: killer?.id,
			team: victim.team
		});
		this.stateDirty = true;
	}

	// ------------------------------------------------------------------
	// Snapshots & broadcasts
	// ------------------------------------------------------------------

	private alivePlayersOf(team: DmTeam): DmPlayer[] {
		const list: DmPlayer[] = [];

		for (const player of this.players.values()) {
			if (player.team === team && player.alive) {
				list.push(player);
			}
		}

		return list;
	}

	private copyPlayer(player: DmPlayer): Mg6PlayerState {
		return {
			id: player.id,
			name: player.name,
			team: player.team,
			health: Math.round(player.health),
			maxHealth: PLAYER_MAX_HEALTH,
			alive: player.alive,
			kills: player.kills,
			deaths: player.deaths,
			weapon: player.weapon,
			magAmmo: player.magAmmo,
			reserveAmmo: player.weapon === 'pistol' ? null : player.reserveAmmo,
			inventory: [...player.inventory.entries()]
				.map(([weapon, magAmmo]) => ({
					weapon,
					slot: WEAPON_SLOT_BY_ID[weapon],
					magAmmo
				}))
				.sort((a, b) => a.slot - b.slot),
			grenades: player.grenades,
			protectedUntil: player.protectionUntil,
			respawnAt: player.respawnAt,
			x: round(player.x),
			y: round(player.y),
			z: round(player.z),
			yaw: round(player.yaw, 3)
		};
	}

	buildSnapshot(now: number): Mg6Snapshot {
		return {
			phase: this.phase,
			serverTime: now,
			countdownEndsAt: this.countdownEndsAt,
			matchEndsAt: this.matchEndsAt,
			resultEndsAt: this.resultEndsAt,
			waitingForPlayers: this.waitingForPlayers,
			teamScores: { ...this.teamScores },
			winner: this.winner,
			mvpId: this.mvpId,
			players: [...this.players.values()].map((player) => this.copyPlayer(player)),
			pickups: this.pickups.map((pickup): Mg6Pickup => ({
				id: pickup.id,
				kind: pickup.kind,
				x: round(pickup.x),
				y: round(pickup.y),
				z: round(pickup.z),
				availableAt: pickup.availableAt
			}))
		};
	}

	private broadcast(now: number): void {
		if (this.phase === 'idle') {
			return;
		}

		if (this.stateDirty && now >= this.nextStateAt) {
			this.stateDirty = false;
			this.nextStateAt = now + DM_STATE_INTERVAL_MS;
			this.port.broadcast({ type: 'mg6-state', state: this.buildSnapshot(now) });
		}

		if (now - this.lastPositionsAt < DM_POSITION_INTERVAL_MS) {
			return;
		}

		this.lastPositionsAt = now;

		const positions: Mg6Positions = {
			at: now,
			players: [...this.players.values()].map((player) => ({
				id: player.id,
				x: round(player.x),
				y: round(player.y),
				z: round(player.z),
				yaw: round(player.yaw, 3),
				alive: player.alive
			})),
			grenades: this.grenades.map((grenade) => ({
				id: grenade.id,
				x: round(grenade.x),
				y: round(grenade.y),
				z: round(grenade.z)
			}))
		};

		this.port.broadcast({ type: 'mg6-positions', ...positions });
	}

	private emitEvent(kind: Mg6EventKind, now: number, extra: Partial<Mg6Event> = {}): void {
		const event: Mg6Event = { kind, at: now, ...extra };
		this.port.broadcast({ type: 'mg6-event', event });
	}

	private resetMatch(): void {
		this.phase = 'idle';
		this.players.clear();
		this.grenades = [];
		this.teamScores = { coven: 0, hunters: 0 };
		this.countdownEndsAt = null;
		this.matchEndsAt = null;
		this.resultEndsAt = null;
		this.waitingForPlayers = false;
		this.winner = null;
		this.mvpId = null;
		this.matchId = null;
		this.nextSeq = 1;
		this.lastPositionsAt = 0;
		this.nextStateAt = 0;
		this.stateDirty = true;

		for (const pickup of this.pickups) {
			pickup.availableAt = 0;
		}
	}

	// ------------------------------------------------------------------
	// Introspección (scripts de verificación)
	// ------------------------------------------------------------------

	get phaseName(): DmPhase {
		return this.phase;
	}

	get isWaitingForPlayers(): boolean {
		return this.waitingForPlayers;
	}

	get teamScore(): Record<DmTeam, number> {
		return { ...this.teamScores };
	}

	get playerCount(): number {
		return this.players.size;
	}

	get teamSnapshot(): Array<{ id: string; team: DmTeam; kills: number; deaths: number }> {
		return [...this.players.values()].map((player) => ({
			id: player.id,
			team: player.team,
			kills: player.kills,
			deaths: player.deaths
		}));
	}

	get checkpoint(): typeof DM_CHECKPOINT {
		return DM_CHECKPOINT;
	}

	get teamNames(): Record<DmTeam, string> {
		return {
			coven: DM_TEAM_META.coven.name,
			hunters: DM_TEAM_META.hunters.name
		};
	}
}
