/**
 * Wire protocol shared with `frontend/src/lib/services/protocol.ts`.
 *
 * This is the active Bun backend protocol. It keeps the legacy handshake and
 * chat (`join` / `welcome` / `chat` / `chat-history`) and also accepts the
 * messages introduced during the RUN rooms migration (`hello`, `emote`,
 * `emote-history`, `set-lobby`, `sync`, `go-lobby`) so older clients and the
 * retired rooms server stay wire-compatible.
 *
 * No zod here: validation lives in `./validate.ts`, and the engines receive
 * already-typed messages.
 */

import { DEFAULT_SKIN, type SkinId } from '../lib/cosmetics/skinIds';
import type { NpcClip } from '../lib/npcs/npcAnimations';
import { NPC_DEFINITIONS, type NpcId } from '../lib/npcs/npcConfig';

export { DEFAULT_SKIN, type SkinId, type NpcClip, type NpcId };

export const LOBBY_IDS = [
	'global',
	'minigame-1',
	'minigame-2',
	'minigame-3',
	'minigame-4',
	'minigame-5',
	'minigame-6',
	'minigame-7',
	'minigame-8',
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
	'minigame-8',
] as const;
export type MinigameLobbyId = (typeof MINIGAME_LOBBY_IDS)[number];

export const CAR_IDS = ['car-calabaza', 'car-momia', 'car-halloween'] as const;
export type CarId = (typeof CAR_IDS)[number];

export type LobbyKind = 'global' | 'minigame';

export type Player = {
	id: string;
	name: string;
	/** Skin equipped by the player; relayed to every client through presence. */
	skin: SkinId;
	connectedAt: number;
	lobbyId: LobbyId;
};

/**
 * Public activity of a mini lobby, included in presence so the hub can show
 * whether a match is open, starting, already running or over.
 */
export type LobbyPhase = 'waiting' | 'countdown' | 'playing' | 'results';

export type LobbyStatus = {
	phase: LobbyPhase;
	/** Whether a new player would be accepted right now. */
	canEnter: boolean;
	/** Why entry is closed (server message), or `null` when open. */
	reason: string | null;
	maxPlayers: number | null;
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

export type RoomChatMessageKind = 'user' | 'emote' | 'system';

/**
 * Chat wire message. The old Bun backend owns the whole chat (history, rate
 * limit and fan-out), so `user` messages are back after the rooms port.
 */
export type RoomChatMessage = {
	id: string;
	playerId: string;
	playerName: string;
	text: string;
	sentAt: number;
	kind: RoomChatMessageKind;
};

/** Pista de la cola del club (SoundCloud). */
export type ClubTrack = {
	id: string;
	/** URL canónica de SoundCloud validada por el servidor. */
	url: string;
	title: string;
	author: string;
	artworkUrl: string | null;
	/** Duración en ms si SoundCloud la reportó; `null` si aún no se sabe. */
	durationMs: number | null;
	addedBy: string;
	addedAt: number;
};

/** Estado autoritativo del jukebox del club. */
export type ClubMusicSnapshot = {
	tracks: ClubTrack[];
	currentId: string | null;
	playing: boolean;
	/** Posición de la pista actual en segundos, medida en `serverTime`. */
	position: number;
	serverTime: number;
	version: number;
};

/** Name used by the old backend/client chat code. */
export type ChatMessage = RoomChatMessage;
export type ChatMessageKind = RoomChatMessageKind;

export type LobbyDefinition = {
	id: LobbyId;
	name: string;
	kind: LobbyKind;
};

export const LOBBY_DEFINITIONS: readonly LobbyDefinition[] = [
	{ id: 'global', name: 'Global', kind: 'global' },
	{ id: 'minigame-1', name: 'Minigame 1', kind: 'minigame' },
	{ id: 'minigame-2', name: 'Minigame 2', kind: 'minigame' },
	{ id: 'minigame-3', name: 'Minigame 3', kind: 'minigame' },
	{ id: 'minigame-4', name: 'Haunted Highway', kind: 'minigame' },
	{ id: 'minigame-5', name: 'Barn Siege', kind: 'minigame' },
	{ id: 'minigame-6', name: 'Witch House Deathmatch', kind: 'minigame' },
	{ id: 'minigame-7', name: 'Parkour Spire', kind: 'minigame' },
	{ id: 'minigame-8', name: 'Skyfall Royale', kind: 'minigame' },
];

/** Clips of the hero rig (`Hero.glb`). Must match the client. */
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
	'HR_dance',
] as const;

export type HeroAnimation = (typeof HERO_ANIMATIONS)[number];

// ---------------------------------------------------------------------------
// Crypt (minigame-2)
// ---------------------------------------------------------------------------

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
	/** Player that simulates the mummies with physics and reports positions. */
	mummyDriverId: string | null;
	players: Mg2PlayerState[];
	skulls: Mg2SkullState[];
	mummies: Mg2MummyState[];
};

/** Mummy position along with the goal it is chasing (decided by the server). */
export type Mg2MummyPosition = Mg2MummyState & {
	goalX: number;
	goalZ: number;
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

export type Mg2MummyReport = {
	id: string;
	x: number;
	y: number;
	z: number;
};

// ---------------------------------------------------------------------------
// Outdoor map
// ---------------------------------------------------------------------------

/** Last known position of a player on the outdoor map. */
export type RemotePosition = {
	x: number;
	y: number;
	z: number;
	yaw: number;
};

/** Scene in which a paper roll was thrown. */
export type PaperRollScene = 'map' | 'crypt';

/**
 * Paper roll in flight. Positions are authoritative on the server and are sent
 * as full state so that a client joining late sees exactly the same rolls.
 */
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
	/** Server timestamp when thrown. */
	at: number;
};

export type CarModel = 'coche_calabaza' | 'coche_momia' | 'coche_halloween';
export type CarStatus = 'available' | 'occupied' | 'destroyed' | 'respawning';
export type CarImpactCause = 'collision' | 'rollover';
export type CarEventCause = CarImpactCause | 'fall' | 'disconnect' | 'lobby' | 'round-ended';

export type CarSpawn = {
	x: number;
	y: number;
	z: number;
	yaw: number;
};

export type CarDefinition = {
	id: CarId;
	name: string;
	model: CarModel;
	spawn: CarSpawn;
	maxHealth: number;
	respawnMs: number;
};

/**
 * Position `y` = chassis center (the model rests its wheels on the ground).
 * Spawns are provisional and validated with `?physics=1`.
 */
export const CAR_DEFINITIONS: readonly CarDefinition[] = [
	{
		id: 'car-calabaza',
		name: 'Pumpkin Car',
		model: 'coche_calabaza',
		spawn: { x: -7, y: 1.4, z: 12, yaw: 0 },
		maxHealth: 100,
		respawnMs: 5000,
	},
	{
		id: 'car-momia',
		name: 'Mummy Car',
		model: 'coche_momia',
		spawn: { x: 7, y: 1.4, z: 12, yaw: Math.PI },
		maxHealth: 100,
		respawnMs: 5000,
	},
	{
		id: 'car-halloween',
		name: 'Halloween Car',
		model: 'coche_halloween',
		spawn: { x: 0, y: 1.4, z: 17, yaw: Math.PI / 2 },
		maxHealth: 100,
		respawnMs: 5000,
	},
];

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

// ---------------------------------------------------------------------------
// NPCs del lobby
// ---------------------------------------------------------------------------

/** Los nueve NPCs humanos del lobby exterior. */
export const NPC_IDS = NPC_DEFINITIONS.map((definition) => definition.id);

/** Estado autoritativo de un NPC en un instante. */
export type NpcState = {
	id: NpcId;
	x: number;
	y: number;
	z: number;
	yaw: number;
	/** Animación de locomoción lógica (`idle`, `walk`, `sit`…). */
	clip: NpcClip;
	/** Gesto de un solo disparo, o `null`. */
	gesture: NpcClip | null;
	/** Contador monotónico para que el cliente reinicie el gesto. */
	gestureSeq: number;
	updatedAt: number;
};

export type NpcsSnapshot = {
	serverTime: number;
	npcs: NpcState[];
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

// ---------------------------------------------------------------------------
// Globo aerostático del mapa exterior
// ---------------------------------------------------------------------------

/** Punto de aparición del globo (a la derecha del podio Top 3). */
export const BALLOON_SPAWN = { x: 14.16, y: 0.02, z: -9 } as const;

/**
 * Límites de vuelo. El globo nunca sale del recinto: el servidor recorta
 * cualquier posición reportada que supere estos valores.
 */
export const BALLOON_MAX_RADIUS = 90;
export const BALLOON_MIN_Y = BALLOON_SPAWN.y;
export const BALLOON_MAX_Y = 40;

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

export type BalloonStateReport = {
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
};

// ---------------------------------------------------------------------------
// Race (minigame-3) — Gran Premio on TWN_Track
// ---------------------------------------------------------------------------

export type RacePhase = 'idle' | 'countdown' | 'playing' | 'results';
export type RacePower = 'nitro' | 'repair' | 'auto' | 'missile' | 'shield' | 'mine' | 'ray';
export type RaceStatus = 'grid' | 'racing' | 'destroyed' | 'finished' | 'left';
export type RaceModel = 'coche_calabaza' | 'coche_momia' | 'coche_halloween';

export const RACE_TRACK_IDS = ['grand-prix', 'roadmap'] as const;
export type RaceTrackId = (typeof RACE_TRACK_IDS)[number];

/** Report sent by the pilot at 10 Hz. `speed` is already capped at 55. */
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

// ---------------------------------------------------------------------------
// Barn Siege (minigame-5)
// ---------------------------------------------------------------------------

export type Mg5Phase = 'idle' | 'countdown' | 'playing' | 'intermission' | 'won' | 'lost';
export type { Mg5MonsterKind, Mg5WeaponId, Mg5DropKind } from '../lib/state/wavesConfig';
import type { Mg5DropKind, Mg5MonsterKind, Mg5WeaponId } from '../lib/state/wavesConfig';

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
	/** Inmóvil y sin poder atacar ni recoger hasta el final de la oleada. */
	downed: boolean;
	/** Conduce el coche del minijuego. */
	driving: boolean;
	kills: number;
	score: number;
	weapon: Mg5WeaponId;
	magAmmo: number;
	/** Armas poseídas ordenadas por slot (la pistola siempre está). */
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
	/** `spawn` = telegrafiando en el portal (1 s, no se mueve). */
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
	/** 1..totalWaves; 0 antes de la primera oleada. */
	wave: number;
	totalWaves: number;
	waveName: string | null;
	/** Fin de la cuenta atrás (fase `countdown`). */
	endsAt: number | null;
	/** Fin de la intermission (fase `intermission`). */
	intermissionEndsAt: number | null;
	/** Monstruos vivos + en cola de la oleada actual. */
	monstersRemaining: number;
	teamScore: number;
	players: Mg5PlayerState[];
	monsters: Mg5MonsterSnapshot[];
	pools: Mg5Pool[];
	drops: Mg5Drop[];
	car: Mg5CarState;
};

export type Mg5Positions = {
	at: number;
	players: Array<{
		id: string;
		x: number;
		y: number;
		z: number;
		yaw: number;
		downed: boolean;
	}>;
	monsters: Array<{
		id: string;
		x: number;
		y: number;
		z: number;
		yaw: number;
		status: Mg5MonsterStatus;
	}>;
	projectiles: Array<{ id: string; x: number; y: number; z: number }>;
	grenades: Array<{ id: string; x: number; y: number; z: number }>;
	/** Rocas de lava del Golem en vuelo. */
	rocks: Array<{ id: string; x: number; y: number; z: number }>;
	/** Conos de fuego activos: origen en la boca del demonio + dirección. */
	breaths: Array<{
		id: string;
		x: number;
		y: number;
		z: number;
		dx: number;
		dy: number;
		dz: number;
	}>;
	car: Mg5CarState | null;
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
	DmPhase as Mg6PhaseBase,
	DmPickupKind as Mg6PickupKindBase,
	DmTeam as Mg6TeamBase,
	DmWeaponId,
	DmWinner as Mg6WinnerBase,
} from '../lib/state/dmConfig';

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
	/** `null` = reserva infinita (pistola). */
	reserveAmmo: number | null;
	inventory: Mg6InventoryEntry[];
	grenades: number;
	/** Momento hasta el que es inmune a daño (0 = sin protección). */
	protectedUntil: number;
	/** Momento de reaparición; `null` si está vivo. */
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
	/** 0 = disponible; si no, momento en el que vuelve a estarlo. */
	availableAt: number;
};

export type Mg6TeamScores = {
	coven: number;
	hunters: number;
};

export type Mg6Snapshot = {
	phase: Mg6Phase;
	serverTime: number;
	/** Fin de la espera/cuenta atrás. */
	countdownEndsAt: number | null;
	/** Fin de la partida. */
	matchEndsAt: number | null;
	/** Fin de la pantalla de resultados. */
	resultEndsAt: number | null;
	/**
	 * `true` mientras el countdown no avanza porque todavía no hay
	 * `DM_MIN_PLAYERS` jugadores.
	 */
	waitingForPlayers: boolean;
	teamScores: Mg6TeamScores;
	winner: Mg6Winner | null;
	/** MVP por kills (y, en empate, menos deaths). */
	mvpId: string | null;
	players: Mg6PlayerState[];
	pickups: Mg6Pickup[];
};

export type Mg6Positions = {
	at: number;
	players: Array<{
		id: string;
		x: number;
		y: number;
		z: number;
		yaw: number;
		alive: boolean;
	}>;
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
	/** Fin de protección al reaparecer. */
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

export type Mg8VehicleKind = 'car' | 'balloon';

/** Estado autoritativo de un coche o globo del battle royale. */
export type Mg8VehicleState = {
	id: string;
	kind: Mg8VehicleKind;
	name: string;
	model: string | null;
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
};

/** Pose interpolable de vehículo (10 Hz). */
export type Mg8VehiclePose = {
	id: string;
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
	destroyed: boolean;
	driverId: string | null;
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
	vehicles: Mg8VehicleState[];
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
	vehicles: Mg8VehiclePose[];
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
	| 'vehicle-enter'
	| 'vehicle-exit'
	| 'vehicle-hit'
	| 'vehicle-destroyed'
	| 'match-ended';

export type Mg8Event = {
	kind: Mg8EventKind;
	playerId?: string;
	otherId?: string;
	weapon?: Mg5WeaponId;
	lootId?: string;
	lootKind?: Mg8LootKind;
	vehicleId?: string;
	vehicleKind?: Mg8VehicleKind;
	amount?: number;
	placement?: number;
	cause?: 'storm' | 'fell' | 'fall' | 'combat';
	winner?: string | null;
	mode?: Mg8Mode;
	/** Posición de aterrizaje/abandono al salir de un vehículo. */
	px?: number;
	py?: number;
	pz?: number;
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

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export type ServerMessage =
	| { type: 'presence'; presence: PresenceSnapshot }
	/** Legacy Bun handshake: own record + initial snapshot. */
	| { type: 'welcome'; self: Player; presence: PresenceSnapshot }
	| { type: 'chat'; message: ChatMessage }
	| { type: 'chat-history'; messages: ChatMessage[] }
	/** Kept for compatibility with clients built during the rooms migration. */
	| { type: 'hello'; self: Player; presence: PresenceSnapshot }
	| { type: 'emote'; message: RoomChatMessage }
	| { type: 'emote-history'; messages: RoomChatMessage[] }
	| { type: 'pong'; at: number }
	| { type: 'error'; code: string; message: string }
	| { type: 'club-music-state'; state: ClubMusicSnapshot }
	| { type: 'go-lobby'; lobbyId: LobbyId; reason: 'round-ended' | 'kicked' }
	| { type: 'mg2-state'; state: Mg2Snapshot }
	| {
			type: 'mg2-positions';
			at: number;
			players: Array<{
				id: string;
				x: number;
				y: number;
				z: number;
				yaw: number;
				alive: boolean;
			}>;
			mummies: Mg2MummyPosition[];
	  }
	| { type: 'mg2-event'; event: Mg2Event }
	| { type: 'rolls-state'; serverTime: number; rolls: PaperRollState[] }
	| {
			type: 'player-animation';
			playerId: string;
			animation: HeroAnimation;
			at: number;
	  }
	| {
			type: 'player-position';
			playerId: string;
			position: RemotePosition;
			at: number;
	  }
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
	| { type: 'mg8-correct'; correct: Mg8Correct }
	| {
			type: 'mg8-vehicle-correct';
			vehicleId: string;
			x: number;
			y: number;
			z: number;
			qx: number;
			qy: number;
			qz: number;
			qw: number;
	  };

export type ClientMessage =
	/** Legacy Bun handshake. Identity comes from the socket id. */
	| { type: 'join'; name?: string; token?: string; accountId?: string; publicKey?: string }
	| { type: 'enter-lobby'; lobbyId: MinigameLobbyId }
	| { type: 'leave-lobby' }
	| { type: 'chat'; text: string }
	| { type: 'ping' }
	/** Re-sends the join burst (`welcome`, chat, rolls, cars). */
	| { type: 'sync' }
	/** Kept for compatibility with clients built during the rooms migration. */
	| { type: 'emote'; text: string }
	| { type: 'set-lobby'; lobbyId: LobbyId }
	| { type: 'mg2-position'; x: number; y: number; z: number; yaw: number }
	| { type: 'mg2-deposit' }
	| { type: 'mg2-mummies'; mummies: Mg2MummyReport[] }
	/** A paper roll thrown by the sender hit a mummy: stun it for a few seconds. */
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
	| ({ type: 'balloon-state' } & BalloonStateReport)
	/** Un jugador abre o cierra el diálogo de un NPC. */
	| { type: 'npc-dialog'; npcId: NpcId; open: boolean }
	| ({ type: 'car-state'; carId: CarId } & CarStateReport)
	| {
			type: 'car-impact';
			carId: CarId;
			impactSpeed: number;
			cause: CarImpactCause;
	  }
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
			/** Monster under the crosshair when the client fired. */
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
	| { type: 'mg8-equip'; slot: number }
	| { type: 'mg8-vehicle-enter'; vehicleId: string }
	| { type: 'mg8-vehicle-exit' }
	| {
			type: 'mg8-vehicle-state';
			vehicleId: string;
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
	/** Temporary client telemetry; the race room logs it to `rundot rooms logs`. */
	| { type: 'race-debug'; event: string; detail?: string };

export type ParseResult =
	{ ok: true; message: ClientMessage } | { ok: false; code: string; message: string };
