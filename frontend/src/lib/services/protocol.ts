import { isSkinId, type SkinId } from '../cosmetics/skinIds';
import { NPC_CLIPS, type NpcClip } from '../npcs/npcAnimations';
import { NPC_DEFINITIONS, type NpcId } from '../npcs/npcConfig';

export const LOBBY_IDS = [
	'global',
	'minigame-1',
	'minigame-2',
	'minigame-3',
	'minigame-4',
	'minigame-5',
	'minigame-6',
	'minigame-7',
	'minigame-8'
] as const;
export type LobbyId = (typeof LOBBY_IDS)[number];

export const MINIGAME_LOBBY_IDS = [
	'minigame-1',
	'minigame-2',
	'minigame-3',
	'minigame-4',
	'minigame-5',
	'minigame-6',
	'minigame-7',
	'minigame-8'
] as const;
export type MinigameLobbyId = (typeof MINIGAME_LOBBY_IDS)[number];

export type LobbyKind = 'global' | 'minigame';

export type LobbyPhase = 'waiting' | 'countdown' | 'playing' | 'results';

export type LobbyStatus = {
	phase: LobbyPhase;
	/** Whether a new player would be accepted right now. */
	canEnter: boolean;
	/** Why entry is closed (server message), or `null` when open. */
	reason: string | null;
	maxPlayers: number | null;
};

export type Player = {
	id: string;
	name: string;
	/** Skin equipped by this player; remote avatars render this model. */
	skin: SkinId;
	/** NFT accessories equipped by this player; remote avatars render them. */
	crown: boolean;
	ride: string | null;
	weaponVariant: string | null;
	connectedAt: number;
	lobbyId: LobbyId;
};

export type Lobby = {
	id: LobbyId;
	name: string;
	kind: LobbyKind;
	players: Player[];
	/** Only mini lobbies report activity; the global hub has no match state. */
	status?: LobbyStatus;
};

export type PresenceSnapshot = {
	total: number;
	lobbies: Lobby[];
};

export type ChatMessageKind = 'user' | 'emote' | 'system';

export type ChatMessage = {
	id: string;
	playerId: string;
	playerName: string;
	text: string;
	sentAt: number;
	kind: ChatMessageKind;
};

/** Pista de la cola del club (SoundCloud). */
export type ClubTrack = {
	id: string;
	url: string;
	title: string;
	author: string;
	artworkUrl: string | null;
	durationMs: number | null;
	addedBy: string;
	addedAt: number;
};

/** Estado autoritativo del jukebox del club, sincronizado por WebSocket. */
export type ClubMusicSnapshot = {
	tracks: ClubTrack[];
	currentId: string | null;
	playing: boolean;
	position: number;
	serverTime: number;
	version: number;
};

export type Mg2Phase = 'idle' | 'countdown' | 'playing' | 'won' | 'lost';
export type Mg2Zone = 'west' | 'south' | 'east' | 'north' | 'chambers';
export type Mg2SkullStatus = 'available' | 'carried' | 'deposited' | 'dropped';
export type Mg2MummyStatus = 'patrol' | 'chase' | 'cooldown' | 'stunned';

export type Mg2PlayerState = {
	id: string;
	name: string;
	skullsCarried: number;
	skullsDeposited: number;
	alive: boolean;
	hp: number;
	maxHp: number;
	x: number;
	y: number;
	z: number;
	yaw: number;
};

export type Mg2SkullState = {
	id: string;
	zone: Mg2Zone;
	x: number;
	y: number;
	z: number;
	state: Mg2SkullStatus;
	carrierId: string | null;
};

export type Mg2MummyState = {
	id: string;
	zone: Mg2Zone;
	x: number;
	y: number;
	z: number;
	yaw: number;
	state: Mg2MummyStatus;
};

export type Mg2Snapshot = {
	phase: Mg2Phase;
	endsAt: number | null;
	serverTime: number;
	depositedTotal: number;
	/** Jugador que simula las momias con física y reporta sus posiciones. */
	mummyDriverId: string | null;
	players: Mg2PlayerState[];
	skulls: Mg2SkullState[];
	mummies: Mg2MummyState[];
};

export type Mg2PositionPlayer = {
	id: string;
	x: number;
	y: number;
	z: number;
	yaw: number;
	alive: boolean;
};

export type Mg2PositionMummy = {
	id: string;
	zone: Mg2Zone;
	x: number;
	y: number;
	z: number;
	yaw: number;
	state: Mg2MummyStatus;
	/** Objetivo que decide el servidor (waypoint o jugador perseguido). */
	goalX: number;
	goalZ: number;
};

/** Posición física de una momia reportada por el conductor. */
export type Mg2MummyReport = {
	id: string;
	x: number;
	y: number;
	z: number;
};

export type Mg2EventKind =
	| 'skull-picked'
	| 'skull-dropped'
	| 'skull-deposited'
	| 'player-hurt'
	| 'player-died'
	| 'mummy-stunned'
	| 'round-start'
	| 'round-won'
	| 'round-lost'
	| 'player-joined'
	| 'player-left';

export type Mg2Event = {
	kind: Mg2EventKind;
	playerId?: string;
	skullId?: string;
	mummyId?: string;
	amount?: number;
	hp?: number;
	at: number;
};

/** Escena en la que se lanzó un rollo de papel. */
export type PaperRollScene = 'map' | 'crypt';

export type PaperRollState = {
	id: string;
	ownerId: string;
	scene: PaperRollScene;
	x: number;
	y: number;
	z: number;
	vx: number;
	vy: number;
	vz: number;
	yaw: number;
	/** Marca de tiempo del servidor al lanzarse. */
	at: number;
};

/** Clips del rig del jugador (`Hero.glb`). */
export const HERO_ANIMATIONS = [
	'HR_idle',
	'HR_walk',
	'HR_run',
	'HR_jump',
	'HR_attack',
	'HR_shoot',
	'HR_wave',
	'HR_pickup',
	'HR_sit',
	'HR_hit',
	'HR_death',
	'HR_aim',
	'HR_walk_aim',
	'HR_run_aim',
	'HR_crouch_aim',
	'HR_injured',
	'HR_heal',
	'HR_carry',
	'HR_throw',
	'HR_paquete',
	'HR_gracias',
	'HR_dormir',
	'HR_hablar',
	'HR_si',
	'HR_no',
	'HR_dance'
] as const;

export type HeroAnimation = (typeof HERO_ANIMATIONS)[number];

/** Posición reportada de un jugador en el mapa exterior. */
export type RemotePosition = {
	x: number;
	y: number;
	z: number;
	yaw: number;
};

export const CAR_IDS = ['car-calabaza', 'car-momia', 'car-halloween'] as const;
export type CarId = (typeof CAR_IDS)[number];

export type CarModel = 'coche_calabaza' | 'coche_momia' | 'coche_halloween';
export type CarStatus = 'available' | 'occupied' | 'destroyed' | 'respawning';
export type CarImpactCause = 'collision' | 'rollover';
export type CarEventCause = CarImpactCause | 'fall' | 'disconnect' | 'lobby' | 'round-ended';

export type CarState = {
	id: CarId;
	name: string;
	model: CarModel;
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
};

export type CarsSnapshot = {
	serverTime: number;
	cars: CarState[];
};

export type CarEventKind =
	'entered' | 'exited' | 'damaged' | 'destroyed' | 'respawned' | 'released';

export type CarEvent = {
	kind: CarEventKind;
	carId: CarId;
	playerId?: string;
	playerName?: string;
	amount?: number;
	cause?: CarEventCause;
	at: number;
};

export function isCarId(value: unknown): value is CarId {
	return typeof value === 'string' && (CAR_IDS as readonly string[]).includes(value);
}

// Globo aerostático del mapa exterior — misma idea que los coches.

/** Asientos del globo: piloto (cañón frontal) o artillero lateral. */
export type BalloonSeat = 'pilot' | 'left' | 'right';

export type BalloonState = {
	driverId: string | null;
	driverName: string | null;
	/** Artillero del cañón izquierdo (dispara hacia −X local). */
	leftGunnerId: string | null;
	leftGunnerName: string | null;
	/** Artillero del cañón derecho (dispara hacia +X local). */
	rightGunnerId: string | null;
	rightGunnerName: string | null;
	position: { x: number; y: number; z: number };
	rotation: { x: number; y: number; z: number; w: number };
	velocity: { x: number; y: number; z: number };
	speed: number;
	updatedAt: number;
};

// NPCs del lobby — simulados por el servidor y replicados a todos los clientes.

export type { NpcClip, NpcId };

/** Un NPC en un instante del servidor. */
export type NpcState = {
	id: NpcId;
	x: number;
	y: number;
	z: number;
	yaw: number;
	clip: NpcClip;
	gesture: NpcClip | null;
	gestureSeq: number;
	updatedAt: number;
};

export type NpcsSnapshot = {
	serverTime: number;
	npcs: NpcState[];
};

export function isNpcId(value: unknown): value is NpcId {
	return typeof value === 'string' && NPC_DEFINITIONS.some((definition) => definition.id === value);
}

// Race (minigame-3) — Gran Premio on TWN_Track.

export type RacePhase = 'idle' | 'countdown' | 'playing' | 'results';
export type RacePower = 'nitro' | 'repair' | 'auto' | 'missile' | 'shield' | 'mine' | 'ray';
export type RaceStatus = 'grid' | 'racing' | 'destroyed' | 'finished' | 'left';
export type RaceModel = CarModel;

export const RACE_TRACK_IDS = ['grand-prix', 'roadmap'] as const;
export type RaceTrackId = (typeof RACE_TRACK_IDS)[number];

export type RaceCarStateReport = {
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

export type RacePlayerState = {
	id: string;
	name: string;
	model: RaceModel;
	slot: number;
	status: RaceStatus;
	lap: number;
	gate: number;
	rank: number;
	health: number;
	maxHealth: number;
	item: RacePower | null;
	shieldUntil: number | null;
	nitroUntil: number | null;
	autoRepairUntil: number | null;
	finishAt: number | null;
	/** Increments on every respawn/reset so clients can snap the body. */
	respawnSeq: number;
	x: number;
	y: number;
	z: number;
	yaw: number;
	speed: number;
};

export type RaceItemState = {
	id: string;
	x: number;
	y: number;
	z: number;
	respawnAt: number | null;
};

export type RaceMissileState = {
	id: string;
	fromPlayerId: string;
	targetPlayerId: string | null;
	from: { x: number; y: number; z: number };
	to: { x: number; y: number; z: number };
	firedAt: number;
	hitAt: number;
};

export type RaceMineState = {
	id: string;
	ownerId: string;
	x: number;
	y: number;
	z: number;
	placedAt: number;
	armedAt: number;
	expiresAt: number;
};

export type RaceSnapshot = {
	phase: RacePhase;
	endsAt: number | null;
	startedAt: number | null;
	serverTime: number;
	track: RaceTrackId;
	trackName: string;
	totalLaps: number;
	gateCount: number;
	maxPlayers: number;
	raceMaxMs: number;
	winnerId: string | null;
	players: RacePlayerState[];
	items: RaceItemState[];
	missiles: RaceMissileState[];
	mines: RaceMineState[];
};

export type RacePosition = {
	id: string;
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
	health: number;
	lap: number;
	gate: number;
	status: RaceStatus;
};

export type RaceEventKind =
	| 'player-joined'
	| 'player-left'
	| 'countdown-shortened'
	| 'race-start'
	| 'gate-passed'
	| 'gate-missed'
	| 'lap-completed'
	| 'player-finished'
	| 'item-picked'
	| 'item-used'
	| 'missile-fired'
	| 'missile-hit'
	| 'mine-placed'
	| 'mine-hit'
	| 'ray-fired'
	| 'player-destroyed'
	| 'player-respawned'
	| 'race-ended';

export type RaceEvent = {
	kind: RaceEventKind;
	playerId?: string;
	otherId?: string;
	gate?: number;
	lap?: number;
	itemId?: string;
	power?: RacePower;
	missileId?: string;
	mineId?: string;
	amount?: number;
	from?: { x: number; y: number; z: number };
	to?: { x: number; y: number; z: number };
	at: number;
};

export function isHeroAnimation(value: unknown): value is HeroAnimation {
	return typeof value === 'string' && (HERO_ANIMATIONS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Barn Siege (minigame-5)
// ---------------------------------------------------------------------------

export type Mg5Phase = 'idle' | 'countdown' | 'playing' | 'intermission' | 'won' | 'lost';
export type { Mg5MonsterKind, Mg5WeaponId, Mg5DropKind } from '../state/wavesConfig';
import type { Mg5DropKind, Mg5MonsterKind, Mg5WeaponId } from '../state/wavesConfig';

export type Mg5MonsterStatus = 'spawn' | 'active' | 'dead';

/** A weapon owned by the player. `slot` is the PUBG-style hotkey (1–4). */
export type Mg5InventoryEntry = {
	weapon: Mg5WeaponId;
	slot: number;
	magAmmo: number;
};

export type Mg5PlayerState = {
	id: string;
	name: string;
	health: number;
	maxHealth: number;
	downed: boolean;
	driving: boolean;
	kills: number;
	score: number;
	weapon: Mg5WeaponId;
	magAmmo: number;
	/** Owned weapons, ordered by slot (the pistol is always present). */
	inventory: Mg5InventoryEntry[];
	/** `null` = reserva infinita (pistola oxidada). */
	reserveAmmo: number | null;
	grenades: number;
	x: number;
	y: number;
	z: number;
	yaw: number;
};

export type Mg5MonsterSnapshot = {
	id: string;
	kind: Mg5MonsterKind;
	status: Mg5MonsterStatus;
	health: number;
	maxHealth: number;
	x: number;
	y: number;
	z: number;
	yaw: number;
};

export type Mg5Pool = {
	id: string;
	x: number;
	/** Altura de la superficie donde reposa el charco (suelo o mirador). */
	y: number;
	z: number;
	radius: number;
	expiresAt: number;
};

export type Mg5Drop = {
	id: string;
	kind: Mg5DropKind;
	x: number;
	y: number;
	z: number;
	expiresAt: number;
};

export type Mg5CarState = {
	health: number;
	maxHealth: number;
	destroyed: boolean;
	driverId: string | null;
	x: number;
	y: number;
	z: number;
	yaw: number;
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

export type Mg5Snapshot = {
	phase: Mg5Phase;
	serverTime: number;
	wave: number;
	totalWaves: number;
	waveName: string | null;
	endsAt: number | null;
	intermissionEndsAt: number | null;
	monstersRemaining: number;
	teamScore: number;
	players: Mg5PlayerState[];
	monsters: Mg5MonsterSnapshot[];
	pools: Mg5Pool[];
	drops: Mg5Drop[];
	car: Mg5CarState;
};

export type Mg5CarStateReport = {
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

export type Mg5PositionPlayer = {
	id: string;
	x: number;
	y: number;
	z: number;
	yaw: number;
	downed: boolean;
};

export type Mg5PositionMonster = {
	id: string;
	x: number;
	y: number;
	z: number;
	yaw: number;
	status: Mg5MonsterStatus;
};

export type Mg5Positions = {
	at: number;
	players: Mg5PositionPlayer[];
	monsters: Mg5PositionMonster[];
	projectiles: Array<{ id: string; x: number; y: number; z: number }>;
	grenades: Array<{ id: string; x: number; y: number; z: number }>;
	/** Rocas de lava del Golem en vuelo. */
	rocks: Array<{ id: string; x: number; y: number; z: number }>;
	breaths: Mg5Breath[];
	car: Mg5CarState | null;
};

/** Cono de fuego del demonio: origen en la boca + dirección normalizada. */
export type Mg5Breath = {
	id: string;
	x: number;
	y: number;
	z: number;
	dx: number;
	dy: number;
	dz: number;
};

export type Mg5EventKind =
	| 'player-joined'
	| 'player-left'
	| 'countdown-shortened'
	| 'wave-started'
	| 'monster-spawned'
	| 'monster-died'
	| 'monster-hit'
	| 'monster-attack'
	| 'shot-fired'
	| 'acid-thrown'
	| 'acid-impact'
	| 'fire-breath'
	| 'rock-thrown'
	| 'rock-impact'
	| 'rock-hit'
	| 'drop-picked'
	| 'grenade-thrown'
	| 'grenade-exploded'
	| 'player-hurt'
	| 'player-downed'
	| 'player-revived'
	| 'car-destroyed'
	| 'wave-cleared'
	| 'victory'
	| 'defeat';

export type Mg5Event = {
	kind: Mg5EventKind;
	playerId?: string;
	otherId?: string;
	monsterId?: string;
	monsterKind?: Mg5MonsterKind;
	dropId?: string;
	dropKind?: Mg5DropKind;
	wave?: number;
	amount?: number;
	weapon?: Mg5WeaponId;
	x?: number;
	y?: number;
	z?: number;
	dx?: number;
	dy?: number;
	dz?: number;
	at: number;
};

// ---------------------------------------------------------------------------
// Witch House Deathmatch (minigame-6)
// ---------------------------------------------------------------------------

import type {
	DmPickupKind as Mg6PickupKindBase,
	DmPhase as Mg6PhaseBase,
	DmTeam as Mg6TeamBase,
	DmWeaponId,
	DmWinner as Mg6WinnerBase
} from '../state/dmConfig';

export type Mg6Team = Mg6TeamBase;
export type Mg6Phase = Mg6PhaseBase;
export type Mg6Winner = Mg6WinnerBase;
export type Mg6PickupKind = Mg6PickupKindBase;

export type Mg6InventoryEntry = {
	weapon: Mg5WeaponId;
	slot: number;
	magAmmo: number;
};

export type Mg6PlayerState = {
	id: string;
	name: string;
	team: Mg6Team;
	health: number;
	maxHealth: number;
	alive: boolean;
	kills: number;
	deaths: number;
	weapon: Mg5WeaponId;
	magAmmo: number;
	reserveAmmo: number | null;
	inventory: Mg6InventoryEntry[];
	grenades: number;
	protectedUntil: number;
	respawnAt: number | null;
	x: number;
	y: number;
	z: number;
	yaw: number;
};

export type Mg6Pickup = {
	id: string;
	kind: Mg6PickupKind;
	x: number;
	y: number;
	z: number;
	availableAt: number;
};

export type Mg6TeamScores = {
	coven: number;
	hunters: number;
};

export type Mg6Snapshot = {
	phase: Mg6Phase;
	serverTime: number;
	countdownEndsAt: number | null;
	matchEndsAt: number | null;
	resultEndsAt: number | null;
	waitingForPlayers: boolean;
	teamScores: Mg6TeamScores;
	winner: Mg6Winner | null;
	mvpId: string | null;
	players: Mg6PlayerState[];
	pickups: Mg6Pickup[];
};

export type Mg6PositionPlayer = {
	id: string;
	x: number;
	y: number;
	z: number;
	yaw: number;
	alive: boolean;
};

export type Mg6Positions = {
	at: number;
	players: Mg6PositionPlayer[];
	grenades: Array<{ id: string; x: number; y: number; z: number }>;
};

export type Mg6EventKind =
	| 'player-joined'
	| 'player-left'
	| 'team-changed'
	| 'match-started'
	| 'kill'
	| 'player-died'
	| 'player-respawned'
	| 'pickup-taken'
	| 'pickup-respawned'
	| 'shot-fired'
	| 'grenade-thrown'
	| 'grenade-exploded'
	| 'player-hurt'
	| 'self-damage'
	| 'match-ended';

export type Mg6Event = {
	kind: Mg6EventKind;
	playerId?: string;
	otherId?: string;
	team?: Mg6Team;
	otherTeam?: Mg6Team;
	weapon?: DmWeaponId;
	pickupId?: string;
	pickupKind?: Mg6PickupKind;
	amount?: number;
	winner?: Mg6Winner;
	x?: number;
	y?: number;
	z?: number;
	dx?: number;
	dy?: number;
	dz?: number;
	protectedUntil?: number;
	at: number;
};

// ---------------------------------------------------------------------------
// Parkour (minigame-7)
// ---------------------------------------------------------------------------

export type Mg7Phase = 'idle' | 'countdown' | 'playing' | 'results';

export type Mg7PlayerState = {
	id: string;
	name: string;
	skin: SkinId;
	/** 0 = START, 1..12 = checkpoint, 13 = FINISH. */
	checkpoint: number;
	/** 1..13: the only checkpoint/finish that can be activated next. */
	nextCheckpoint: number;
	falls: number;
	x: number;
	y: number;
	z: number;
	yaw: number;
	finishedAt: number | null;
	respawnAt: number | null;
	protectionUntil: number | null;
};

export type Mg7Snapshot = {
	phase: Mg7Phase;
	serverTime: number;
	/** Deadline of the current phase (countdown, match or results). */
	endsAt: number | null;
	countdownEndsAt: number | null;
	startedAt: number | null;
	maxPlayers: number;
	/** Sorted by race position: first is the current leader. */
	players: Mg7PlayerState[];
	winnerId: string | null;
};

export type Mg7Position = {
	id: string;
	x: number;
	y: number;
	z: number;
	yaw: number;
};

export type Mg7Positions = {
	players: Mg7Position[];
	at: number;
};

export type Mg7WardenAttack = {
	id: string;
	wardenId: string;
	kind: 'rock' | 'acid' | 'fire' | 'shove';
	targetId: string;
	origin: { x: number; y: number; z: number };
	target: { x: number; y: number; z: number };
	dx: number;
	dz: number;
	at: number;
	impactAt: number;
};

export type Mg7EventKind =
	| 'player-joined'
	| 'player-left'
	| 'countdown-shortened'
	| 'checkpoint'
	| 'fall'
	| 'respawn'
	| 'finish'
	| 'warden-attack'
	| 'shove'
	| 'match-start'
	| 'match-end';

export type Mg7Event = {
	kind: Mg7EventKind;
	playerId?: string;
	/** Checkpoint index for `checkpoint`, `fall` and `respawn`. */
	index?: number;
	name?: string;
	checkpoint?: number;
	x?: number;
	y?: number;
	z?: number;
	protectionUntil?: number;
	/** Finish position (1-based) and race time. */
	position?: number;
	timeMs?: number;
	attack?: Mg7WardenAttack;
	/** Power that produced a `shove` (the event `kind` is already taken). */
	power?: 'rock' | 'acid' | 'fire' | 'shove';
	/** Shove velocity: horizontal components (m/s) and vertical lift (m/s). */
	dx?: number;
	dy?: number;
	dz?: number;
	winnerId?: string | null;
	at: number;
};

// ---------------------------------------------------------------------------
// Skyfall Royale (minigame-8)
// ---------------------------------------------------------------------------

export type Mg8Phase = 'idle' | 'countdown' | 'playing' | 'results';
export type Mg8Mode = 'riding' | 'skydive' | 'glide' | 'ground';
export type Mg8LootKind = 'weapon' | 'ammo' | 'shield' | 'medkit' | 'grenade';

export type Mg8InventoryEntry = {
	weapon: Mg5WeaponId;
	magAmmo: number;
};

export type Mg8PlayerState = {
	id: string;
	name: string;
	skin: SkinId;
	isBot: boolean;
	alive: boolean;
	health: number;
	shield: number;
	kills: number;
	damage: number;
	weapon: Mg5WeaponId;
	magAmmo: number;
	reserveAmmo: number;
	grenades: number;
	inventory: Mg8InventoryEntry[];
	mode: Mg8Mode;
	x: number;
	y: number;
	z: number;
	yaw: number;
	placement: number | null;
	disconnectedAt: number | null;
};

export type Mg8Loot = {
	id: string;
	kind: Mg8LootKind;
	weapon: Mg5WeaponId | null;
	x: number;
	y: number;
	z: number;
	available: boolean;
};

export type Mg8Storm = {
	phase: number;
	cx: number;
	cz: number;
	radius: number;
	nextCx: number;
	nextCz: number;
	nextRadius: number;
	endsAt: number;
	dps: number;
	state: 'wait' | 'shrink';
};

export type Mg8Placement = {
	playerId: string;
	placement: number;
};

export type Mg8Snapshot = {
	phase: Mg8Phase;
	serverTime: number;
	countdownEndsAt: number | null;
	matchStartedAt: number | null;
	boardingStartedAt: number | null;
	matchEndsAt: number | null;
	resultEndsAt: number | null;
	storm: Mg8Storm;
	players: Mg8PlayerState[];
	humans: number;
	bots: number;
	loot: Mg8Loot[];
	placements: Mg8Placement[];
	winner: string | null;
	waitingForPlayers: boolean;
	seed: number;
};

export type Mg8PositionPlayer = {
	id: string;
	x: number;
	y: number;
	z: number;
	yaw: number;
	mode: Mg8Mode;
	alive: boolean;
	isBot: boolean;
};

export type Mg8Positions = {
	at: number;
	players: Mg8PositionPlayer[];
	grenades: Array<{ id: string; x: number; y: number; z: number }>;
};

export type Mg8EventKind =
	| 'player-joined'
	| 'player-left'
	| 'bot-added'
	| 'bot-removed'
	| 'match-started'
	| 'player-jumped'
	| 'player-landed'
	| 'loot-taken'
	| 'shot-fired'
	| 'grenade-thrown'
	| 'grenade-exploded'
	| 'player-hurt'
	| 'kill'
	| 'player-died'
	| 'storm-phase'
	| 'storm-damage'
	| 'match-ended';

export type Mg8Event = {
	kind: Mg8EventKind;
	playerId?: string;
	otherId?: string;
	weapon?: Mg5WeaponId;
	lootId?: string;
	lootKind?: Mg8LootKind;
	amount?: number;
	placement?: number;
	cause?: 'storm' | 'fell' | 'combat';
	winner?: string | null;
	mode?: Mg8Mode;
	x?: number;
	y?: number;
	z?: number;
	dx?: number;
	dy?: number;
	dz?: number;
	stormPhase?: number;
	stormRadius?: number;
	at: number;
};

export type Mg8Correct = {
	x: number;
	y: number;
	z: number;
	mode: Mg8Mode;
	reason: string;
};

export type ClientMessage =
	| { type: 'join'; name?: string; token?: string; accountId?: string; publicKey?: string }
	| { type: 'enter-lobby'; lobbyId: MinigameLobbyId }
	| { type: 'leave-lobby' }
	| { type: 'chat'; text: string }
	| { type: 'ping' }
	| { type: 'mg2-position'; x: number; y: number; z: number; yaw: number }
	| { type: 'mg2-deposit' }
	| { type: 'mg2-mummies'; mummies: Mg2MummyReport[] }
	| { type: 'mg2-stun'; mummyId: string }
	| {
			type: 'throw-roll';
			id: string;
			scene: PaperRollScene;
			x: number;
			y: number;
			z: number;
			vx: number;
			vy: number;
			vz: number;
			yaw: number;
			/** Si viene, el rollo sale de un cañón del globo. */
			cannon?: 'front' | 'left' | 'right';
	  }
	| { type: 'player-animation'; animation: HeroAnimation }
	| { type: 'player-skin'; skin: SkinId }
	| { type: 'player-nft-equip'; crown: boolean; ride: string | null; weaponVariant: string | null }
	| { type: 'player-position'; x: number; y: number; z: number; yaw: number }
	| { type: 'club-music-add'; url: string }
	| { type: 'club-music-remove'; trackId: string }
	| { type: 'club-music-select'; trackId: string }
	| { type: 'club-music-play' }
	| { type: 'club-music-pause' }
	| { type: 'club-music-skip'; direction: 1 | -1 }
	| { type: 'club-music-ended'; trackId: string; version: number }
	| { type: 'club-music-duration'; trackId: string; durationMs: number }
	| { type: 'enter-car'; carId: CarId }
	| { type: 'exit-car'; carId: CarId }
	| { type: 'enter-balloon' }
	| { type: 'exit-balloon' }
	/** Cambia de asiento sin bajar del globo (piloto ⇄ cañones). */
	| { type: 'switch-balloon-seat'; seat: BalloonSeat }
	| {
			type: 'balloon-state';
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
	  }
	/** Un jugador abre o cierra el diálogo de un NPC (congela su paseo). */
	| { type: 'npc-dialog'; npcId: NpcId; open: boolean }
	| {
			type: 'car-state';
			carId: CarId;
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
	  }
	| { type: 'car-impact'; carId: CarId; impactSpeed: number; cause: CarImpactCause }
	| ({ type: 'race-car-state' } & RaceCarStateReport)
	| { type: 'race-use-item' }
	| { type: 'race-reset' }
	| { type: 'race-impact'; impactSpeed: number; cause: CarImpactCause }
	| { type: 'mg5-position'; x: number; y: number; z: number; yaw: number }
	| {
			type: 'mg5-shoot';
			weapon: Mg5WeaponId;
			ox: number;
			oy: number;
			oz: number;
			dx: number;
			dy: number;
			dz: number;
			/**
			 * Monster the client had under the crosshair when it fired. The
			 * server uses it as a lag-tolerant lock so a hit that the player
			 * saw cannot be dropped because the rendered monster trails the
			 * authoritative one by a couple of ticks.
			 */
			targetId?: string;
	  }
	| {
			type: 'mg5-throw';
			gx: number;
			gy: number;
			gz: number;
			dx: number;
			dy: number;
			dz: number;
			/** Punto del suelo bajo la mira: la granada cae ahí. */
			tx?: number;
			tz?: number;
	  }
	| { type: 'mg5-car-enter' }
	| { type: 'mg5-car-exit' }
	| {
			type: 'mg5-car-state';
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
	  }
	| { type: 'mg5-reload' }
	| { type: 'mg5-equip'; slot: number }
	| { type: 'mg6-position'; x: number; y: number; z: number; yaw: number }
	| {
			type: 'mg6-shoot';
			weapon: Mg5WeaponId;
			ox: number;
			oy: number;
			oz: number;
			dx: number;
			dy: number;
			dz: number;
			/** Enemy under the crosshair when the client fired. */
			targetId?: string;
	  }
	| {
			type: 'mg6-throw';
			gx: number;
			gy: number;
			gz: number;
			dx: number;
			dy: number;
			dz: number;
			/** Punto del suelo bajo la mira: la granada cae ahí. */
			tx?: number;
			tz?: number;
	  }
	| { type: 'mg6-reload' }
	| { type: 'mg6-equip'; slot: number }
	| { type: 'mg7-position'; x: number; y: number; z: number; yaw: number }
	| {
			type: 'mg8-position';
			x: number;
			y: number;
			z: number;
			yaw: number;
			mode: Mg8Mode;
			vy: number;
	  }
	| { type: 'mg8-jump' }
	| {
			type: 'mg8-shoot';
			weapon: Mg5WeaponId;
			ox: number;
			oy: number;
			oz: number;
			dx: number;
			dy: number;
			dz: number;
			targetId?: string;
	  }
	| {
			type: 'mg8-throw';
			gx: number;
			gy: number;
			gz: number;
			dx: number;
			dy: number;
			dz: number;
			tx?: number;
			tz?: number;
	  }
	| { type: 'mg8-reload' }
	| { type: 'mg8-equip'; slot: number };

export type ServerMessage =
	| { type: 'welcome'; self: Player; presence: PresenceSnapshot }
	/** Legacy alias of `welcome` kept for old server builds. */
	| { type: 'hello'; self: Player; presence: PresenceSnapshot }
	| { type: 'presence'; presence: PresenceSnapshot }
	| { type: 'chat'; message: ChatMessage }
	/** Legacy alias of `chat` kept for old server builds. */
	| { type: 'emote'; message: ChatMessage }
	| { type: 'chat-history'; messages: ChatMessage[] }
	/** Legacy alias of `chat-history` kept for old server builds. */
	| { type: 'emote-history'; messages: ChatMessage[] }
	/** Server-initiated exit from a mini lobby. Bun only sends it via presence. */
	| { type: 'go-lobby'; lobbyId: LobbyId; reason: 'round-ended' | 'kicked' }
	| { type: 'pong'; at: number }
	| { type: 'error'; code: string; message: string }
	| { type: 'club-music-state'; state: ClubMusicSnapshot }
	| { type: 'mg2-state'; state: Mg2Snapshot }
	| {
			type: 'mg2-positions';
			at: number;
			players: Mg2PositionPlayer[];
			mummies: Mg2PositionMummy[];
	  }
	| { type: 'mg2-event'; event: Mg2Event }
	| { type: 'rolls-state'; serverTime: number; rolls: PaperRollState[] }
	| { type: 'player-animation'; playerId: string; animation: HeroAnimation; at: number }
	| { type: 'player-position'; playerId: string; position: RemotePosition; at: number }
	| { type: 'cars-state'; serverTime: number; cars: CarState[] }
	| { type: 'car-event'; event: CarEvent }
	| { type: 'balloon-state'; serverTime: number; balloon: BalloonState }
	| { type: 'npcs-state'; serverTime: number; npcs: NpcState[] }
	| { type: 'race-state'; state: RaceSnapshot }
	| { type: 'race-positions'; at: number; players: RacePosition[] }
	| { type: 'race-event'; event: RaceEvent }
	| { type: 'mg5-state'; state: Mg5Snapshot }
	| ({ type: 'mg5-positions' } & Mg5Positions)
	| { type: 'mg5-event'; event: Mg5Event }
	| { type: 'mg6-state'; state: Mg6Snapshot }
	| ({ type: 'mg6-positions' } & Mg6Positions)
	| { type: 'mg6-event'; event: Mg6Event }
	| { type: 'mg7-state'; state: Mg7Snapshot }
	| ({ type: 'mg7-positions' } & Mg7Positions)
	| { type: 'mg7-event'; event: Mg7Event }
	| { type: 'mg8-state'; state: Mg8Snapshot }
	| ({ type: 'mg8-positions' } & Mg8Positions)
	| { type: 'mg8-event'; event: Mg8Event }
	| { type: 'mg8-correct'; correct: Mg8Correct };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isLobbyId(value: unknown): value is LobbyId {
	return typeof value === 'string' && (LOBBY_IDS as readonly string[]).includes(value);
}

function isPlayer(value: unknown): value is Player {
	return (
		isRecord(value) &&
		typeof value.id === 'string' &&
		typeof value.name === 'string' &&
		isSkinId(value.skin) &&
		typeof value.connectedAt === 'number' &&
		isLobbyId(value.lobbyId)
	);
}

function isLobbyStatus(value: unknown): value is LobbyStatus {
	return (
		isRecord(value) &&
		(value.phase === 'waiting' ||
			value.phase === 'countdown' ||
			value.phase === 'playing' ||
			value.phase === 'results') &&
		typeof value.canEnter === 'boolean' &&
		(value.reason === null || typeof value.reason === 'string') &&
		(value.maxPlayers === null || typeof value.maxPlayers === 'number')
	);
}

function isLobby(value: unknown): value is Lobby {
	return (
		isRecord(value) &&
		isLobbyId(value.id) &&
		typeof value.name === 'string' &&
		(value.kind === 'global' || value.kind === 'minigame') &&
		Array.isArray(value.players) &&
		value.players.every(isPlayer) &&
		(value.status === undefined || isLobbyStatus(value.status))
	);
}

function isPresenceSnapshot(value: unknown): value is PresenceSnapshot {
	return (
		isRecord(value) &&
		typeof value.total === 'number' &&
		Array.isArray(value.lobbies) &&
		value.lobbies.every(isLobby)
	);
}

export function isChatMessage(value: unknown): value is ChatMessage {
	return (
		isRecord(value) &&
		typeof value.id === 'string' &&
		typeof value.playerId === 'string' &&
		typeof value.playerName === 'string' &&
		typeof value.text === 'string' &&
		typeof value.sentAt === 'number' &&
		(value.kind === 'user' || value.kind === 'emote' || value.kind === 'system')
	);
}

export function isClubTrack(value: unknown): value is ClubTrack {
	return (
		isRecord(value) &&
		typeof value.id === 'string' &&
		typeof value.url === 'string' &&
		typeof value.title === 'string' &&
		typeof value.author === 'string' &&
		(value.artworkUrl === null || typeof value.artworkUrl === 'string') &&
		(value.durationMs === null || typeof value.durationMs === 'number') &&
		typeof value.addedBy === 'string' &&
		typeof value.addedAt === 'number'
	);
}

export function isClubMusicSnapshot(value: unknown): value is ClubMusicSnapshot {
	return (
		isRecord(value) &&
		Array.isArray(value.tracks) &&
		value.tracks.every(isClubTrack) &&
		(value.currentId === null || typeof value.currentId === 'string') &&
		typeof value.playing === 'boolean' &&
		typeof value.position === 'number' &&
		typeof value.serverTime === 'number' &&
		typeof value.version === 'number'
	);
}

export function isMg2Snapshot(value: unknown): value is Mg2Snapshot {
	return (
		isRecord(value) &&
		(value.phase === 'idle' ||
			value.phase === 'countdown' ||
			value.phase === 'playing' ||
			value.phase === 'won' ||
			value.phase === 'lost') &&
		(value.endsAt === null || typeof value.endsAt === 'number') &&
		typeof value.serverTime === 'number' &&
		typeof value.depositedTotal === 'number' &&
		(value.mummyDriverId === null || typeof value.mummyDriverId === 'string') &&
		Array.isArray(value.players) &&
		value.players.every(
			(player) =>
				isRecord(player) &&
				typeof player.id === 'string' &&
				typeof player.name === 'string' &&
				typeof player.skullsCarried === 'number' &&
				typeof player.skullsDeposited === 'number' &&
				typeof player.alive === 'boolean' &&
				typeof player.hp === 'number' &&
				typeof player.maxHp === 'number' &&
				typeof player.x === 'number' &&
				typeof player.y === 'number' &&
				typeof player.z === 'number' &&
				typeof player.yaw === 'number'
		) &&
		Array.isArray(value.skulls) &&
		value.skulls.every(
			(skull) =>
				isRecord(skull) &&
				typeof skull.id === 'string' &&
				typeof skull.zone === 'string' &&
				typeof skull.x === 'number' &&
				typeof skull.y === 'number' &&
				typeof skull.z === 'number' &&
				typeof skull.state === 'string' &&
				(skull.carrierId === null || typeof skull.carrierId === 'string')
		) &&
		Array.isArray(value.mummies) &&
		value.mummies.every(
			(mummy) =>
				isRecord(mummy) &&
				typeof mummy.id === 'string' &&
				typeof mummy.zone === 'string' &&
				typeof mummy.x === 'number' &&
				typeof mummy.y === 'number' &&
				typeof mummy.z === 'number' &&
				typeof mummy.yaw === 'number' &&
				typeof mummy.state === 'string'
		)
	);
}

function isMg2PositionPlayer(value: unknown): value is Mg2PositionPlayer {
	return (
		isRecord(value) &&
		typeof value.id === 'string' &&
		typeof value.x === 'number' &&
		typeof value.y === 'number' &&
		typeof value.z === 'number' &&
		typeof value.yaw === 'number' &&
		typeof value.alive === 'boolean'
	);
}

function isMg2PositionMummy(value: unknown): value is Mg2PositionMummy {
	return (
		isRecord(value) &&
		typeof value.id === 'string' &&
		typeof value.zone === 'string' &&
		typeof value.x === 'number' &&
		typeof value.y === 'number' &&
		typeof value.z === 'number' &&
		typeof value.yaw === 'number' &&
		typeof value.state === 'string' &&
		typeof value.goalX === 'number' &&
		typeof value.goalZ === 'number'
	);
}

function isMg2Event(value: unknown): value is Mg2Event {
	return (
		isRecord(value) &&
		typeof value.kind === 'string' &&
		typeof value.at === 'number' &&
		(value.playerId === undefined || typeof value.playerId === 'string') &&
		(value.skullId === undefined || typeof value.skullId === 'string') &&
		(value.mummyId === undefined || typeof value.mummyId === 'string') &&
		(value.amount === undefined || typeof value.amount === 'number') &&
		(value.hp === undefined || typeof value.hp === 'number')
	);
}

function isRemotePosition(value: unknown): value is RemotePosition {
	return (
		isRecord(value) &&
		typeof value.x === 'number' &&
		typeof value.y === 'number' &&
		typeof value.z === 'number' &&
		typeof value.yaw === 'number'
	);
}

function isCarStatus(value: unknown): value is CarStatus {
	return (
		value === 'available' || value === 'occupied' || value === 'destroyed' || value === 'respawning'
	);
}

function isCarState(value: unknown): value is CarState {
	return (
		isRecord(value) &&
		isCarId(value.id) &&
		typeof value.name === 'string' &&
		(value.model === 'coche_calabaza' ||
			value.model === 'coche_momia' ||
			value.model === 'coche_halloween') &&
		isCarStatus(value.status) &&
		(value.driverId === null || typeof value.driverId === 'string') &&
		(value.driverName === null || typeof value.driverName === 'string') &&
		isRecord(value.position) &&
		typeof value.position.x === 'number' &&
		typeof value.position.y === 'number' &&
		typeof value.position.z === 'number' &&
		isRecord(value.rotation) &&
		typeof value.rotation.x === 'number' &&
		typeof value.rotation.y === 'number' &&
		typeof value.rotation.z === 'number' &&
		typeof value.rotation.w === 'number' &&
		isRecord(value.velocity) &&
		typeof value.velocity.x === 'number' &&
		typeof value.velocity.y === 'number' &&
		typeof value.velocity.z === 'number' &&
		typeof value.speed === 'number' &&
		typeof value.steering === 'number' &&
		typeof value.health === 'number' &&
		typeof value.maxHealth === 'number' &&
		(value.respawnAt === null || typeof value.respawnAt === 'number') &&
		typeof value.updatedAt === 'number'
	);
}

export function isCarsSnapshot(value: unknown): value is CarsSnapshot {
	return (
		isRecord(value) &&
		typeof value.serverTime === 'number' &&
		Array.isArray(value.cars) &&
		value.cars.every(isCarState)
	);
}

export function isBalloonState(value: unknown): value is BalloonState {
	return (
		isRecord(value) &&
		(value.driverId === null || typeof value.driverId === 'string') &&
		(value.driverName === null || typeof value.driverName === 'string') &&
		(value.leftGunnerId === null || typeof value.leftGunnerId === 'string') &&
		(value.leftGunnerName === null || typeof value.leftGunnerName === 'string') &&
		(value.rightGunnerId === null || typeof value.rightGunnerId === 'string') &&
		(value.rightGunnerName === null || typeof value.rightGunnerName === 'string') &&
		isRecord(value.position) &&
		typeof value.position.x === 'number' &&
		typeof value.position.y === 'number' &&
		typeof value.position.z === 'number' &&
		isRecord(value.rotation) &&
		typeof value.rotation.x === 'number' &&
		typeof value.rotation.y === 'number' &&
		typeof value.rotation.z === 'number' &&
		typeof value.rotation.w === 'number' &&
		isRecord(value.velocity) &&
		typeof value.velocity.x === 'number' &&
		typeof value.velocity.y === 'number' &&
		typeof value.velocity.z === 'number' &&
		typeof value.speed === 'number' &&
		typeof value.updatedAt === 'number'
	);
}

function isNpcClip(value: unknown): value is NpcClip {
	return typeof value === 'string' && value in NPC_CLIPS;
}

function isNpcState(value: unknown): value is NpcState {
	return (
		isRecord(value) &&
		isNpcId(value.id) &&
		typeof value.x === 'number' &&
		typeof value.y === 'number' &&
		typeof value.z === 'number' &&
		typeof value.yaw === 'number' &&
		isNpcClip(value.clip) &&
		(value.gesture === null || isNpcClip(value.gesture)) &&
		typeof value.gestureSeq === 'number' &&
		typeof value.updatedAt === 'number'
	);
}

export function isNpcsSnapshot(value: unknown): value is NpcsSnapshot {
	return (
		isRecord(value) &&
		typeof value.serverTime === 'number' &&
		Array.isArray(value.npcs) &&
		value.npcs.every(isNpcState)
	);
}

const CAR_EVENT_KINDS: readonly string[] = [
	'entered',
	'exited',
	'damaged',
	'destroyed',
	'respawned',
	'released'
];

export function isCarEvent(value: unknown): value is CarEvent {
	return (
		isRecord(value) &&
		typeof value.kind === 'string' &&
		CAR_EVENT_KINDS.includes(value.kind) &&
		isCarId(value.carId) &&
		(value.playerId === undefined || typeof value.playerId === 'string') &&
		(value.playerName === undefined || typeof value.playerName === 'string') &&
		(value.amount === undefined || typeof value.amount === 'number') &&
		(value.cause === undefined || typeof value.cause === 'string') &&
		typeof value.at === 'number'
	);
}

export function isPaperRollState(value: unknown): value is PaperRollState {
	return (
		isRecord(value) &&
		typeof value.id === 'string' &&
		typeof value.ownerId === 'string' &&
		(value.scene === 'map' || value.scene === 'crypt') &&
		typeof value.x === 'number' &&
		typeof value.y === 'number' &&
		typeof value.z === 'number' &&
		typeof value.vx === 'number' &&
		typeof value.vy === 'number' &&
		typeof value.vz === 'number' &&
		typeof value.yaw === 'number' &&
		typeof value.at === 'number'
	);
}

function isRaceStatus(value: unknown): value is RaceStatus {
	return (
		value === 'grid' ||
		value === 'racing' ||
		value === 'destroyed' ||
		value === 'finished' ||
		value === 'left'
	);
}

function isRacePower(value: unknown): value is RacePower {
	return (
		value === 'nitro' ||
		value === 'repair' ||
		value === 'auto' ||
		value === 'missile' ||
		value === 'shield' ||
		value === 'mine' ||
		value === 'ray'
	);
}

function isRaceModel(value: unknown): value is RaceModel {
	return value === 'coche_calabaza' || value === 'coche_momia' || value === 'coche_halloween';
}

function isRaceTrackId(value: unknown): value is RaceTrackId {
	return value === 'grand-prix' || value === 'roadmap';
}

function isRacePlayerState(value: unknown): value is RacePlayerState {
	return (
		isRecord(value) &&
		typeof value.id === 'string' &&
		typeof value.name === 'string' &&
		isRaceModel(value.model) &&
		typeof value.slot === 'number' &&
		isRaceStatus(value.status) &&
		typeof value.lap === 'number' &&
		typeof value.gate === 'number' &&
		typeof value.rank === 'number' &&
		typeof value.health === 'number' &&
		typeof value.maxHealth === 'number' &&
		(value.item === null || isRacePower(value.item)) &&
		(value.shieldUntil === null || typeof value.shieldUntil === 'number') &&
		(value.nitroUntil === null || typeof value.nitroUntil === 'number') &&
		(value.autoRepairUntil === null || typeof value.autoRepairUntil === 'number') &&
		(value.finishAt === null || typeof value.finishAt === 'number') &&
		typeof value.x === 'number' &&
		typeof value.y === 'number' &&
		typeof value.z === 'number' &&
		typeof value.yaw === 'number' &&
		typeof value.speed === 'number'
	);
}

export function isRaceSnapshot(value: unknown): value is RaceSnapshot {
	return (
		isRecord(value) &&
		(value.phase === 'idle' ||
			value.phase === 'countdown' ||
			value.phase === 'playing' ||
			value.phase === 'results') &&
		(value.endsAt === null || typeof value.endsAt === 'number') &&
		(value.startedAt === null || typeof value.startedAt === 'number') &&
		typeof value.serverTime === 'number' &&
		isRaceTrackId(value.track) &&
		typeof value.trackName === 'string' &&
		typeof value.totalLaps === 'number' &&
		typeof value.gateCount === 'number' &&
		typeof value.maxPlayers === 'number' &&
		typeof value.raceMaxMs === 'number' &&
		(value.winnerId === null || typeof value.winnerId === 'string') &&
		Array.isArray(value.players) &&
		value.players.every(isRacePlayerState) &&
		Array.isArray(value.items) &&
		value.items.every(
			(item) =>
				isRecord(item) &&
				typeof item.id === 'string' &&
				typeof item.x === 'number' &&
				typeof item.y === 'number' &&
				typeof item.z === 'number' &&
				(item.respawnAt === null || typeof item.respawnAt === 'number')
		) &&
		Array.isArray(value.missiles) &&
		value.missiles.every(
			(missile) =>
				isRecord(missile) &&
				typeof missile.id === 'string' &&
				typeof missile.fromPlayerId === 'string' &&
				(missile.targetPlayerId === null || typeof missile.targetPlayerId === 'string') &&
				isRecord(missile.from) &&
				isRecord(missile.to) &&
				typeof missile.firedAt === 'number' &&
				typeof missile.hitAt === 'number'
		) &&
		Array.isArray(value.mines) &&
		value.mines.every(
			(mine) =>
				isRecord(mine) &&
				typeof mine.id === 'string' &&
				typeof mine.ownerId === 'string' &&
				typeof mine.x === 'number' &&
				typeof mine.y === 'number' &&
				typeof mine.z === 'number' &&
				typeof mine.placedAt === 'number' &&
				typeof mine.armedAt === 'number' &&
				typeof mine.expiresAt === 'number'
		)
	);
}

function isRacePosition(value: unknown): value is RacePosition {
	return (
		isRecord(value) &&
		typeof value.id === 'string' &&
		typeof value.x === 'number' &&
		typeof value.y === 'number' &&
		typeof value.z === 'number' &&
		typeof value.qx === 'number' &&
		typeof value.qy === 'number' &&
		typeof value.qz === 'number' &&
		typeof value.qw === 'number' &&
		typeof value.vx === 'number' &&
		typeof value.vy === 'number' &&
		typeof value.vz === 'number' &&
		typeof value.speed === 'number' &&
		typeof value.steering === 'number' &&
		typeof value.health === 'number' &&
		typeof value.lap === 'number' &&
		typeof value.gate === 'number' &&
		isRaceStatus(value.status)
	);
}

function isRaceEvent(value: unknown): value is RaceEvent {
	return (
		isRecord(value) &&
		typeof value.kind === 'string' &&
		typeof value.at === 'number' &&
		(value.playerId === undefined || typeof value.playerId === 'string') &&
		(value.otherId === undefined || typeof value.otherId === 'string') &&
		(value.gate === undefined || typeof value.gate === 'number') &&
		(value.lap === undefined || typeof value.lap === 'number') &&
		(value.itemId === undefined || typeof value.itemId === 'string') &&
		(value.power === undefined || isRacePower(value.power)) &&
		(value.missileId === undefined || typeof value.missileId === 'string') &&
		(value.mineId === undefined || typeof value.mineId === 'string') &&
		(value.amount === undefined || typeof value.amount === 'number') &&
		(value.from === undefined ||
			(isRecord(value.from) &&
				typeof value.from.x === 'number' &&
				typeof value.from.y === 'number' &&
				typeof value.from.z === 'number')) &&
		(value.to === undefined ||
			(isRecord(value.to) &&
				typeof value.to.x === 'number' &&
				typeof value.to.y === 'number' &&
				typeof value.to.z === 'number'))
	);
}

function isMg5MonsterKind(value: unknown): value is Mg5MonsterKind {
	return (
		value === 'skeleton' ||
		value === 'mummy' ||
		value === 'frankenstein' ||
		value === 'golem' ||
		value === 'demon' ||
		value === 'scarecrow' ||
		value === 'ghost' ||
		value === 'witch' ||
		value === 'vampire' ||
		value === 'pumpkin-king'
	);
}

function isMg5WeaponId(value: unknown): value is Mg5WeaponId {
	return value === 'pistol' || value === 'shotgun' || value === 'smg' || value === 'rifle';
}

function isMg5DropKind(value: unknown): value is Mg5DropKind {
	return (
		value === 'shotgun' ||
		value === 'smg' ||
		value === 'rifle' ||
		value === 'grenade' ||
		value === 'ammo' ||
		value === 'medkit'
	);
}

function isMg5MonsterStatus(value: unknown): value is Mg5MonsterStatus {
	return value === 'spawn' || value === 'active' || value === 'dead';
}

function isMg5Phase(value: unknown): value is Mg5Phase {
	return (
		value === 'idle' ||
		value === 'countdown' ||
		value === 'playing' ||
		value === 'intermission' ||
		value === 'won' ||
		value === 'lost'
	);
}

function isMg5CarState(value: unknown): value is Mg5CarState {
	return (
		isRecord(value) &&
		typeof value.health === 'number' &&
		typeof value.maxHealth === 'number' &&
		typeof value.destroyed === 'boolean' &&
		(value.driverId === null || typeof value.driverId === 'string') &&
		typeof value.x === 'number' &&
		typeof value.y === 'number' &&
		typeof value.z === 'number' &&
		typeof value.yaw === 'number' &&
		typeof value.qx === 'number' &&
		typeof value.qy === 'number' &&
		typeof value.qz === 'number' &&
		typeof value.qw === 'number' &&
		typeof value.vx === 'number' &&
		typeof value.vy === 'number' &&
		typeof value.vz === 'number' &&
		typeof value.speed === 'number' &&
		typeof value.steering === 'number'
	);
}

function isMg5InventoryEntry(value: unknown): value is Mg5InventoryEntry {
	return (
		isRecord(value) &&
		isMg5WeaponId(value.weapon) &&
		typeof value.slot === 'number' &&
		typeof value.magAmmo === 'number'
	);
}

function isMg5PlayerState(value: unknown): value is Mg5PlayerState {
	return (
		isRecord(value) &&
		typeof value.id === 'string' &&
		typeof value.name === 'string' &&
		typeof value.health === 'number' &&
		typeof value.maxHealth === 'number' &&
		typeof value.downed === 'boolean' &&
		typeof value.driving === 'boolean' &&
		typeof value.kills === 'number' &&
		typeof value.score === 'number' &&
		isMg5WeaponId(value.weapon) &&
		typeof value.magAmmo === 'number' &&
		(value.reserveAmmo === null || typeof value.reserveAmmo === 'number') &&
		typeof value.grenades === 'number' &&
		Array.isArray(value.inventory) &&
		value.inventory.every(isMg5InventoryEntry) &&
		typeof value.x === 'number' &&
		typeof value.y === 'number' &&
		typeof value.z === 'number' &&
		typeof value.yaw === 'number'
	);
}

function isMg5MonsterSnapshot(value: unknown): value is Mg5MonsterSnapshot {
	return (
		isRecord(value) &&
		typeof value.id === 'string' &&
		isMg5MonsterKind(value.kind) &&
		isMg5MonsterStatus(value.status) &&
		typeof value.health === 'number' &&
		typeof value.maxHealth === 'number' &&
		typeof value.x === 'number' &&
		typeof value.y === 'number' &&
		typeof value.z === 'number' &&
		typeof value.yaw === 'number'
	);
}

export function isMg5Snapshot(value: unknown): value is Mg5Snapshot {
	return (
		isRecord(value) &&
		isMg5Phase(value.phase) &&
		typeof value.serverTime === 'number' &&
		typeof value.wave === 'number' &&
		typeof value.totalWaves === 'number' &&
		(value.waveName === null || typeof value.waveName === 'string') &&
		(value.endsAt === null || typeof value.endsAt === 'number') &&
		(value.intermissionEndsAt === null || typeof value.intermissionEndsAt === 'number') &&
		typeof value.monstersRemaining === 'number' &&
		typeof value.teamScore === 'number' &&
		Array.isArray(value.players) &&
		value.players.every(isMg5PlayerState) &&
		Array.isArray(value.monsters) &&
		value.monsters.every(isMg5MonsterSnapshot) &&
		Array.isArray(value.pools) &&
		value.pools.every(
			(pool) =>
				isRecord(pool) &&
				typeof pool.id === 'string' &&
				typeof pool.x === 'number' &&
				typeof pool.y === 'number' &&
				typeof pool.z === 'number' &&
				typeof pool.radius === 'number' &&
				typeof pool.expiresAt === 'number'
		) &&
		Array.isArray(value.drops) &&
		value.drops.every(
			(drop) =>
				isRecord(drop) &&
				typeof drop.id === 'string' &&
				isMg5DropKind(drop.kind) &&
				typeof drop.x === 'number' &&
				typeof drop.y === 'number' &&
				typeof drop.z === 'number' &&
				typeof drop.expiresAt === 'number'
		) &&
		isMg5CarState(value.car)
	);
}

export function isMg5Positions(value: unknown): value is Mg5Positions {
	return (
		isRecord(value) &&
		typeof value.at === 'number' &&
		Array.isArray(value.players) &&
		value.players.every(
			(player) =>
				isRecord(player) &&
				typeof player.id === 'string' &&
				typeof player.x === 'number' &&
				typeof player.y === 'number' &&
				typeof player.z === 'number' &&
				typeof player.yaw === 'number' &&
				typeof player.downed === 'boolean'
		) &&
		Array.isArray(value.monsters) &&
		value.monsters.every(
			(monster) =>
				isRecord(monster) &&
				typeof monster.id === 'string' &&
				typeof monster.x === 'number' &&
				typeof monster.y === 'number' &&
				typeof monster.z === 'number' &&
				typeof monster.yaw === 'number' &&
				isMg5MonsterStatus(monster.status)
		) &&
		Array.isArray(value.projectiles) &&
		value.projectiles.every(
			(projectile) =>
				isRecord(projectile) &&
				typeof projectile.id === 'string' &&
				typeof projectile.x === 'number' &&
				typeof projectile.y === 'number' &&
				typeof projectile.z === 'number'
		) &&
		Array.isArray(value.grenades) &&
		value.grenades.every(
			(grenade) =>
				isRecord(grenade) &&
				typeof grenade.id === 'string' &&
				typeof grenade.x === 'number' &&
				typeof grenade.y === 'number' &&
				typeof grenade.z === 'number'
		) &&
		Array.isArray(value.rocks) &&
		value.rocks.every(
			(rock) =>
				isRecord(rock) &&
				typeof rock.id === 'string' &&
				typeof rock.x === 'number' &&
				typeof rock.y === 'number' &&
				typeof rock.z === 'number'
		) &&
		Array.isArray(value.breaths) &&
		value.breaths.every(
			(breath) =>
				isRecord(breath) &&
				typeof breath.id === 'string' &&
				typeof breath.x === 'number' &&
				typeof breath.y === 'number' &&
				typeof breath.z === 'number' &&
				typeof breath.dx === 'number' &&
				typeof breath.dy === 'number' &&
				typeof breath.dz === 'number'
		) &&
		(value.car === null || isMg5CarState(value.car))
	);
}

const MG5_EVENT_KINDS: readonly Mg5EventKind[] = [
	'player-joined',
	'player-left',
	'countdown-shortened',
	'wave-started',
	'monster-spawned',
	'monster-died',
	'monster-hit',
	'monster-attack',
	'shot-fired',
	'acid-thrown',
	'acid-impact',
	'fire-breath',
	'rock-thrown',
	'rock-impact',
	'rock-hit',
	'drop-picked',
	'grenade-thrown',
	'grenade-exploded',
	'player-hurt',
	'player-downed',
	'player-revived',
	'car-destroyed',
	'wave-cleared',
	'victory',
	'defeat'
];

function isMg5Event(value: unknown): value is Mg5Event {
	return (
		isRecord(value) &&
		typeof value.kind === 'string' &&
		(MG5_EVENT_KINDS as readonly string[]).includes(value.kind) &&
		typeof value.at === 'number' &&
		(value.playerId === undefined || typeof value.playerId === 'string') &&
		(value.otherId === undefined || typeof value.otherId === 'string') &&
		(value.monsterId === undefined || typeof value.monsterId === 'string') &&
		(value.monsterKind === undefined || isMg5MonsterKind(value.monsterKind)) &&
		(value.dropId === undefined || typeof value.dropId === 'string') &&
		(value.dropKind === undefined || isMg5DropKind(value.dropKind)) &&
		(value.wave === undefined || typeof value.wave === 'number') &&
		(value.amount === undefined || typeof value.amount === 'number') &&
		(value.weapon === undefined || isMg5WeaponId(value.weapon)) &&
		(value.x === undefined || typeof value.x === 'number') &&
		(value.y === undefined || typeof value.y === 'number') &&
		(value.z === undefined || typeof value.z === 'number') &&
		(value.dx === undefined || typeof value.dx === 'number') &&
		(value.dy === undefined || typeof value.dy === 'number') &&
		(value.dz === undefined || typeof value.dz === 'number')
	);
}

function isMg6Team(value: unknown): value is Mg6Team {
	return value === 'coven' || value === 'hunters';
}

function isMg6Phase(value: unknown): value is Mg6Phase {
	return value === 'idle' || value === 'countdown' || value === 'playing' || value === 'results';
}

function isMg6Winner(value: unknown): value is Mg6Winner {
	return isMg6Team(value) || value === 'draw';
}

function isMg6PickupKind(value: unknown): value is Mg6PickupKind {
	return (
		value === 'shotgun' ||
		value === 'smg' ||
		value === 'rifle' ||
		value === 'grenade' ||
		value === 'ammo' ||
		value === 'medkit'
	);
}

function isMg6InventoryEntry(value: unknown): value is Mg6InventoryEntry {
	return (
		isRecord(value) &&
		isMg5WeaponId(value.weapon) &&
		typeof value.slot === 'number' &&
		typeof value.magAmmo === 'number'
	);
}

function isMg6PlayerState(value: unknown): value is Mg6PlayerState {
	return (
		isRecord(value) &&
		typeof value.id === 'string' &&
		typeof value.name === 'string' &&
		isMg6Team(value.team) &&
		typeof value.health === 'number' &&
		typeof value.maxHealth === 'number' &&
		typeof value.alive === 'boolean' &&
		typeof value.kills === 'number' &&
		typeof value.deaths === 'number' &&
		isMg5WeaponId(value.weapon) &&
		typeof value.magAmmo === 'number' &&
		(value.reserveAmmo === null || typeof value.reserveAmmo === 'number') &&
		Array.isArray(value.inventory) &&
		value.inventory.every(isMg6InventoryEntry) &&
		typeof value.grenades === 'number' &&
		typeof value.protectedUntil === 'number' &&
		(value.respawnAt === null || typeof value.respawnAt === 'number') &&
		typeof value.x === 'number' &&
		typeof value.y === 'number' &&
		typeof value.z === 'number' &&
		typeof value.yaw === 'number'
	);
}

export function isMg6Snapshot(value: unknown): value is Mg6Snapshot {
	return (
		isRecord(value) &&
		isMg6Phase(value.phase) &&
		typeof value.serverTime === 'number' &&
		(value.countdownEndsAt === null || typeof value.countdownEndsAt === 'number') &&
		(value.matchEndsAt === null || typeof value.matchEndsAt === 'number') &&
		(value.resultEndsAt === null || typeof value.resultEndsAt === 'number') &&
		typeof value.waitingForPlayers === 'boolean' &&
		isRecord(value.teamScores) &&
		typeof value.teamScores.coven === 'number' &&
		typeof value.teamScores.hunters === 'number' &&
		(value.winner === null || isMg6Winner(value.winner)) &&
		(value.mvpId === null || typeof value.mvpId === 'string') &&
		Array.isArray(value.players) &&
		value.players.every(isMg6PlayerState) &&
		Array.isArray(value.pickups) &&
		value.pickups.every(
			(pickup) =>
				isRecord(pickup) &&
				typeof pickup.id === 'string' &&
				isMg6PickupKind(pickup.kind) &&
				typeof pickup.x === 'number' &&
				typeof pickup.y === 'number' &&
				typeof pickup.z === 'number' &&
				typeof pickup.availableAt === 'number'
		)
	);
}

export function isMg6Positions(value: unknown): value is Mg6Positions {
	return (
		isRecord(value) &&
		typeof value.at === 'number' &&
		Array.isArray(value.players) &&
		value.players.every(
			(player) =>
				isRecord(player) &&
				typeof player.id === 'string' &&
				typeof player.x === 'number' &&
				typeof player.y === 'number' &&
				typeof player.z === 'number' &&
				typeof player.yaw === 'number' &&
				typeof player.alive === 'boolean'
		) &&
		Array.isArray(value.grenades) &&
		value.grenades.every(
			(grenade) =>
				isRecord(grenade) &&
				typeof grenade.id === 'string' &&
				typeof grenade.x === 'number' &&
				typeof grenade.y === 'number' &&
				typeof grenade.z === 'number'
		)
	);
}

const MG6_EVENT_KINDS: readonly Mg6EventKind[] = [
	'player-joined',
	'player-left',
	'team-changed',
	'match-started',
	'kill',
	'player-died',
	'player-respawned',
	'pickup-taken',
	'pickup-respawned',
	'shot-fired',
	'grenade-thrown',
	'grenade-exploded',
	'player-hurt',
	'self-damage',
	'match-ended'
];

function isMg6Event(value: unknown): value is Mg6Event {
	return (
		isRecord(value) &&
		typeof value.kind === 'string' &&
		(MG6_EVENT_KINDS as readonly string[]).includes(value.kind) &&
		typeof value.at === 'number' &&
		(value.playerId === undefined || typeof value.playerId === 'string') &&
		(value.otherId === undefined || typeof value.otherId === 'string') &&
		(value.team === undefined || isMg6Team(value.team)) &&
		(value.otherTeam === undefined || isMg6Team(value.otherTeam)) &&
		(value.weapon === undefined || isMg5WeaponId(value.weapon) || value.weapon === 'grenade') &&
		(value.pickupId === undefined || typeof value.pickupId === 'string') &&
		(value.pickupKind === undefined || isMg6PickupKind(value.pickupKind)) &&
		(value.amount === undefined || typeof value.amount === 'number') &&
		(value.winner === undefined || isMg6Winner(value.winner)) &&
		(value.x === undefined || typeof value.x === 'number') &&
		(value.y === undefined || typeof value.y === 'number') &&
		(value.z === undefined || typeof value.z === 'number') &&
		(value.dx === undefined || typeof value.dx === 'number') &&
		(value.dy === undefined || typeof value.dy === 'number') &&
		(value.dz === undefined || typeof value.dz === 'number') &&
		(value.protectedUntil === undefined || typeof value.protectedUntil === 'number')
	);
}

// ---------------------------------------------------------------------------
// Parkour (minigame-7) guards
// ---------------------------------------------------------------------------

function isMg7Phase(value: unknown): value is Mg7Phase {
	return value === 'idle' || value === 'countdown' || value === 'playing' || value === 'results';
}

function isPoint3(value: unknown): value is { x: number; y: number; z: number } {
	return (
		isRecord(value) &&
		typeof value.x === 'number' &&
		typeof value.y === 'number' &&
		typeof value.z === 'number'
	);
}

function isMg7PlayerState(value: unknown): value is Mg7PlayerState {
	return (
		isRecord(value) &&
		typeof value.id === 'string' &&
		typeof value.name === 'string' &&
		isSkinId(value.skin) &&
		typeof value.checkpoint === 'number' &&
		typeof value.nextCheckpoint === 'number' &&
		typeof value.falls === 'number' &&
		typeof value.x === 'number' &&
		typeof value.y === 'number' &&
		typeof value.z === 'number' &&
		typeof value.yaw === 'number' &&
		(value.finishedAt === null || typeof value.finishedAt === 'number') &&
		(value.respawnAt === null || typeof value.respawnAt === 'number') &&
		(value.protectionUntil === null || typeof value.protectionUntil === 'number')
	);
}

export function isMg7Snapshot(value: unknown): value is Mg7Snapshot {
	return (
		isRecord(value) &&
		isMg7Phase(value.phase) &&
		typeof value.serverTime === 'number' &&
		(value.endsAt === null || typeof value.endsAt === 'number') &&
		(value.countdownEndsAt === null || typeof value.countdownEndsAt === 'number') &&
		(value.startedAt === null || typeof value.startedAt === 'number') &&
		typeof value.maxPlayers === 'number' &&
		Array.isArray(value.players) &&
		value.players.every(isMg7PlayerState) &&
		(value.winnerId === null || typeof value.winnerId === 'string')
	);
}

export function isMg7Positions(value: unknown): value is Mg7Positions {
	return (
		isRecord(value) &&
		typeof value.at === 'number' &&
		Array.isArray(value.players) &&
		value.players.every(
			(player) =>
				isRecord(player) &&
				typeof player.id === 'string' &&
				typeof player.x === 'number' &&
				typeof player.y === 'number' &&
				typeof player.z === 'number' &&
				typeof player.yaw === 'number'
		)
	);
}

function isMg7AttackKind(value: unknown): value is Mg7WardenAttack['kind'] {
	return value === 'rock' || value === 'acid' || value === 'fire' || value === 'shove';
}

function isMg7WardenAttack(value: unknown): value is Mg7WardenAttack {
	return (
		isRecord(value) &&
		typeof value.id === 'string' &&
		typeof value.wardenId === 'string' &&
		isMg7AttackKind(value.kind) &&
		typeof value.targetId === 'string' &&
		isPoint3(value.origin) &&
		isPoint3(value.target) &&
		typeof value.dx === 'number' &&
		typeof value.dz === 'number' &&
		typeof value.at === 'number' &&
		typeof value.impactAt === 'number'
	);
}

const MG7_EVENT_KINDS: readonly Mg7EventKind[] = [
	'player-joined',
	'player-left',
	'countdown-shortened',
	'checkpoint',
	'fall',
	'respawn',
	'finish',
	'warden-attack',
	'shove',
	'match-start',
	'match-end'
];

function isMg7Event(value: unknown): value is Mg7Event {
	return (
		isRecord(value) &&
		typeof value.kind === 'string' &&
		(MG7_EVENT_KINDS as readonly string[]).includes(value.kind) &&
		typeof value.at === 'number' &&
		(value.playerId === undefined || typeof value.playerId === 'string') &&
		(value.index === undefined || typeof value.index === 'number') &&
		(value.name === undefined || typeof value.name === 'string') &&
		(value.checkpoint === undefined || typeof value.checkpoint === 'number') &&
		(value.x === undefined || typeof value.x === 'number') &&
		(value.y === undefined || typeof value.y === 'number') &&
		(value.z === undefined || typeof value.z === 'number') &&
		(value.protectionUntil === undefined || typeof value.protectionUntil === 'number') &&
		(value.position === undefined || typeof value.position === 'number') &&
		(value.timeMs === undefined || typeof value.timeMs === 'number') &&
		(value.attack === undefined || isMg7WardenAttack(value.attack)) &&
		(value.power === undefined || isMg7AttackKind(value.power)) &&
		(value.dx === undefined || typeof value.dx === 'number') &&
		(value.dy === undefined || typeof value.dy === 'number') &&
		(value.dz === undefined || typeof value.dz === 'number') &&
		(value.winnerId === undefined || value.winnerId === null || typeof value.winnerId === 'string')
	);
}

const MG8_MODES: readonly Mg8Mode[] = ['riding', 'skydive', 'glide', 'ground'];
const MG8_LOOT_KINDS: readonly Mg8LootKind[] = ['weapon', 'ammo', 'shield', 'medkit', 'grenade'];
const MG8_EVENT_KINDS: readonly Mg8EventKind[] = [
	'player-joined',
	'player-left',
	'bot-added',
	'bot-removed',
	'match-started',
	'player-jumped',
	'player-landed',
	'loot-taken',
	'shot-fired',
	'grenade-thrown',
	'grenade-exploded',
	'player-hurt',
	'kill',
	'player-died',
	'storm-phase',
	'storm-damage',
	'match-ended'
];

function isMg8Mode(value: unknown): value is Mg8Mode {
	return typeof value === 'string' && (MG8_MODES as readonly string[]).includes(value);
}

function isMg8LootKind(value: unknown): value is Mg8LootKind {
	return typeof value === 'string' && (MG8_LOOT_KINDS as readonly string[]).includes(value);
}

function isNullableNumber(value: unknown): boolean {
	return value === null || typeof value === 'number';
}

function isMg8InventoryEntry(value: unknown): value is Mg8InventoryEntry {
	return isRecord(value) && isMg5WeaponId(value.weapon) && typeof value.magAmmo === 'number';
}

function isMg8PlayerState(value: unknown): value is Mg8PlayerState {
	return (
		isRecord(value) &&
		typeof value.id === 'string' &&
		typeof value.name === 'string' &&
		isSkinId(value.skin) &&
		typeof value.isBot === 'boolean' &&
		typeof value.alive === 'boolean' &&
		typeof value.health === 'number' &&
		typeof value.shield === 'number' &&
		typeof value.kills === 'number' &&
		typeof value.damage === 'number' &&
		isMg5WeaponId(value.weapon) &&
		typeof value.magAmmo === 'number' &&
		typeof value.reserveAmmo === 'number' &&
		typeof value.grenades === 'number' &&
		Array.isArray(value.inventory) &&
		value.inventory.every(isMg8InventoryEntry) &&
		isMg8Mode(value.mode) &&
		typeof value.x === 'number' &&
		typeof value.y === 'number' &&
		typeof value.z === 'number' &&
		typeof value.yaw === 'number' &&
		isNullableNumber(value.placement) &&
		isNullableNumber(value.disconnectedAt)
	);
}

function isMg8Loot(value: unknown): value is Mg8Loot {
	return (
		isRecord(value) &&
		typeof value.id === 'string' &&
		isMg8LootKind(value.kind) &&
		(value.weapon === null || isMg5WeaponId(value.weapon)) &&
		typeof value.x === 'number' &&
		typeof value.y === 'number' &&
		typeof value.z === 'number' &&
		typeof value.available === 'boolean'
	);
}

function isMg8Storm(value: unknown): value is Mg8Storm {
	return (
		isRecord(value) &&
		typeof value.phase === 'number' &&
		typeof value.cx === 'number' &&
		typeof value.cz === 'number' &&
		typeof value.radius === 'number' &&
		typeof value.nextCx === 'number' &&
		typeof value.nextCz === 'number' &&
		typeof value.nextRadius === 'number' &&
		typeof value.endsAt === 'number' &&
		typeof value.dps === 'number' &&
		(value.state === 'wait' || value.state === 'shrink')
	);
}

export function isMg8Snapshot(value: unknown): value is Mg8Snapshot {
	return (
		isRecord(value) &&
		(value.phase === 'idle' ||
			value.phase === 'countdown' ||
			value.phase === 'playing' ||
			value.phase === 'results') &&
		typeof value.serverTime === 'number' &&
		isNullableNumber(value.countdownEndsAt) &&
		isNullableNumber(value.matchStartedAt) &&
		isNullableNumber(value.boardingStartedAt) &&
		isNullableNumber(value.matchEndsAt) &&
		isNullableNumber(value.resultEndsAt) &&
		isMg8Storm(value.storm) &&
		Array.isArray(value.players) &&
		value.players.every(isMg8PlayerState) &&
		typeof value.humans === 'number' &&
		typeof value.bots === 'number' &&
		Array.isArray(value.loot) &&
		value.loot.every(isMg8Loot) &&
		Array.isArray(value.placements) &&
		value.placements.every(
			(entry) =>
				isRecord(entry) && typeof entry.playerId === 'string' && typeof entry.placement === 'number'
		) &&
		(value.winner === null || typeof value.winner === 'string') &&
		typeof value.waitingForPlayers === 'boolean' &&
		typeof value.seed === 'number'
	);
}

export function isMg8Positions(value: unknown): value is Mg8Positions {
	return (
		isRecord(value) &&
		typeof value.at === 'number' &&
		Array.isArray(value.players) &&
		value.players.every(
			(player) =>
				isRecord(player) &&
				typeof player.id === 'string' &&
				typeof player.x === 'number' &&
				typeof player.y === 'number' &&
				typeof player.z === 'number' &&
				typeof player.yaw === 'number' &&
				isMg8Mode(player.mode) &&
				typeof player.alive === 'boolean' &&
				typeof player.isBot === 'boolean'
		) &&
		Array.isArray(value.grenades) &&
		value.grenades.every(
			(grenade) =>
				isRecord(grenade) &&
				typeof grenade.id === 'string' &&
				typeof grenade.x === 'number' &&
				typeof grenade.y === 'number' &&
				typeof grenade.z === 'number'
		)
	);
}

function isMg8Event(value: unknown): value is Mg8Event {
	return (
		isRecord(value) &&
		typeof value.kind === 'string' &&
		(MG8_EVENT_KINDS as readonly string[]).includes(value.kind) &&
		typeof value.at === 'number' &&
		(value.playerId === undefined || typeof value.playerId === 'string') &&
		(value.otherId === undefined || typeof value.otherId === 'string') &&
		(value.weapon === undefined || isMg5WeaponId(value.weapon)) &&
		(value.lootId === undefined || typeof value.lootId === 'string') &&
		(value.lootKind === undefined || isMg8LootKind(value.lootKind)) &&
		(value.amount === undefined || typeof value.amount === 'number') &&
		(value.placement === undefined || typeof value.placement === 'number') &&
		(value.cause === undefined ||
			value.cause === 'storm' ||
			value.cause === 'fell' ||
			value.cause === 'combat') &&
		(value.winner === undefined || value.winner === null || typeof value.winner === 'string') &&
		(value.mode === undefined || isMg8Mode(value.mode)) &&
		(value.x === undefined || typeof value.x === 'number') &&
		(value.y === undefined || typeof value.y === 'number') &&
		(value.z === undefined || typeof value.z === 'number') &&
		(value.dx === undefined || typeof value.dx === 'number') &&
		(value.dy === undefined || typeof value.dy === 'number') &&
		(value.dz === undefined || typeof value.dz === 'number') &&
		(value.stormPhase === undefined || typeof value.stormPhase === 'number') &&
		(value.stormRadius === undefined || typeof value.stormRadius === 'number')
	);
}

function isMg8Correct(value: unknown): value is Mg8Correct {
	return (
		isRecord(value) &&
		typeof value.x === 'number' &&
		typeof value.y === 'number' &&
		typeof value.z === 'number' &&
		isMg8Mode(value.mode) &&
		typeof value.reason === 'string'
	);
}

export function isServerMessage(value: unknown): value is ServerMessage {
	if (!isRecord(value) || typeof value.type !== 'string') {
		return false;
	}

	switch (value.type) {
		case 'welcome':
		case 'hello':
			return isPlayer(value.self) && isPresenceSnapshot(value.presence);
		case 'presence':
			return isPresenceSnapshot(value.presence);
		case 'chat':
		case 'emote':
			return isChatMessage(value.message);
		case 'chat-history':
		case 'emote-history':
			return Array.isArray(value.messages) && value.messages.every(isChatMessage);
		case 'go-lobby':
			return (
				isLobbyId(value.lobbyId) && (value.reason === 'round-ended' || value.reason === 'kicked')
			);
		case 'pong':
			return typeof value.at === 'number';
		case 'mg2-state':
			return isMg2Snapshot(value.state);
		case 'mg2-positions':
			return (
				typeof value.at === 'number' &&
				Array.isArray(value.players) &&
				value.players.every(isMg2PositionPlayer) &&
				Array.isArray(value.mummies) &&
				value.mummies.every(isMg2PositionMummy)
			);
		case 'mg2-event':
			return isMg2Event(value.event);
		case 'rolls-state':
			return (
				typeof value.serverTime === 'number' &&
				Array.isArray(value.rolls) &&
				value.rolls.every(isPaperRollState)
			);
		case 'player-animation':
			return (
				typeof value.playerId === 'string' &&
				isHeroAnimation(value.animation) &&
				typeof value.at === 'number'
			);
		case 'player-position':
			return (
				typeof value.playerId === 'string' &&
				isRemotePosition(value.position) &&
				typeof value.at === 'number'
			);
		case 'cars-state':
			return isCarsSnapshot(value);
		case 'car-event':
			return isCarEvent(value.event);
		case 'balloon-state':
			return isBalloonState(value.balloon);
		case 'npcs-state':
			return isNpcsSnapshot(value);
		case 'race-state':
			return isRaceSnapshot(value.state);
		case 'race-positions':
			return (
				typeof value.at === 'number' &&
				Array.isArray(value.players) &&
				value.players.every(isRacePosition)
			);
		case 'race-event':
			return isRaceEvent(value.event);
		case 'mg5-state':
			return isMg5Snapshot(value.state);
		case 'mg5-positions':
			return isMg5Positions(value);
		case 'mg5-event':
			return isMg5Event(value.event);
		case 'mg6-state':
			return isMg6Snapshot(value.state);
		case 'mg6-positions':
			return isMg6Positions(value);
		case 'mg6-event':
			return isMg6Event(value.event);
		case 'mg7-state':
			return isMg7Snapshot(value.state);
		case 'mg7-positions':
			return isMg7Positions(value);
		case 'mg7-event':
			return isMg7Event(value.event);
		case 'mg8-state':
			return isMg8Snapshot(value.state);
		case 'mg8-positions':
			return isMg8Positions(value);
		case 'mg8-event':
			return isMg8Event(value.event);
		case 'mg8-correct':
			return isMg8Correct(value.correct);
		case 'club-music-state':
			return isClubMusicSnapshot(value.state);
		case 'error':
			return typeof value.code === 'string' && typeof value.message === 'string';
		default:
			return false;
	}
}
