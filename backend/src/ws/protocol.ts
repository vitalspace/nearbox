import { z } from "zod";

export const LOBBY_IDS = [
  "global",
  "minigame-1",
  "minigame-2",
  "minigame-3",
] as const;
export type LobbyId = (typeof LOBBY_IDS)[number];

export const MINIGAME_LOBBY_IDS = [
  "minigame-1",
  "minigame-2",
  "minigame-3",
] as const;
export type MinigameLobbyId = (typeof MINIGAME_LOBBY_IDS)[number];

export const CAR_IDS = ["car-calabaza", "car-momia", "car-halloween"] as const;
export type CarId = (typeof CAR_IDS)[number];

export type LobbyKind = "global" | "minigame";

export type Player = {
  id: string;
  name: string;
  connectedAt: number;
  lobbyId: LobbyId;
};

export type Lobby = {
  id: LobbyId;
  name: string;
  kind: LobbyKind;
  players: Player[];
};

export type PresenceSnapshot = {
  total: number;
  lobbies: Lobby[];
};

export type ChatMessageKind = "user" | "emote" | "system";

export type ChatMessage = {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  sentAt: number;
  kind: ChatMessageKind;
};

export type LobbyDefinition = {
  id: LobbyId;
  name: string;
  kind: LobbyKind;
};

export const LOBBY_DEFINITIONS: readonly LobbyDefinition[] = [
  { id: "global", name: "Global", kind: "global" },
  { id: "minigame-1", name: "Minigame 1", kind: "minigame" },
  { id: "minigame-2", name: "Minigame 2", kind: "minigame" },
  { id: "minigame-3", name: "Minigame 3", kind: "minigame" },
];

const joinMessageSchema = z.object({
  type: z.literal("join"),
  name: z.string().optional(),
});

const enterLobbyMessageSchema = z.object({
  type: z.literal("enter-lobby"),
  lobbyId: z.enum(MINIGAME_LOBBY_IDS),
});

const leaveLobbyMessageSchema = z.object({
  type: z.literal("leave-lobby"),
});

const pingMessageSchema = z.object({
  type: z.literal("ping"),
});

const chatMessageSchema = z.object({
  type: z.literal("chat"),
  text: z.string(),
});

const mg2PositionMessageSchema = z.object({
  type: z.literal("mg2-position"),
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
  yaw: z.number().finite(),
});

const mg2DepositMessageSchema = z.object({
  type: z.literal("mg2-deposit"),
});

/** A paper roll hit a mummy: ask the room to stun it. */
const mg2StunMessageSchema = z.object({
  type: z.literal("mg2-stun"),
  mummyId: z
    .string()
    .min(1)
    .max(48)
    .regex(/^[A-Za-z0-9_-]+$/),
});

/** The mummy driver (designated player) reports their physical position. */
const mg2MummiesMessageSchema = z.object({
  type: z.literal("mg2-mummies"),
  mummies: z
    .array(
      z.object({
        id: z
          .string()
          .min(1)
          .max(48)
          .regex(/^[A-Za-z0-9_-]+$/),
        x: z.number().finite(),
        y: z.number().finite(),
        z: z.number().finite(),
      }),
    )
    .min(1)
    .max(8),
});

const throwRollMessageSchema = z.object({
  type: z.literal("throw-roll"),
  id: z
    .string()
    .min(1)
    .max(48)
    .regex(/^[A-Za-z0-9_-]+$/),
  scene: z.enum(["map", "crypt"]),
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
  vx: z.number().finite(),
  vy: z.number().finite(),
  vz: z.number().finite(),
  yaw: z.number().finite(),
});

/** Clips del rig del jugador (`Hero.glb`). Deben coincidir con el cliente. */
export const HERO_ANIMATIONS = [
  "HR_idle",
  "HR_walk",
  "HR_run",
  "HR_jump",
  "HR_attack",
  "HR_shoot",
  "HR_wave",
  "HR_pickup",
  "HR_sit",
  "HR_hit",
  "HR_death",
  "HR_aim",
  "HR_walk_aim",
  "HR_run_aim",
  "HR_crouch_aim",
  "HR_injured",
  "HR_heal",
  "HR_carry",
  "HR_throw",
  "HR_paquete",
  "HR_gracias",
  "HR_dormir",
  "HR_hablar",
  "HR_si",
  "HR_no",
  "HR_dance",
] as const;

export type HeroAnimation = (typeof HERO_ANIMATIONS)[number];

const playerAnimationMessageSchema = z.object({
  type: z.literal("player-animation"),
  animation: z.enum(HERO_ANIMATIONS),
});

const playerPositionMessageSchema = z.object({
  type: z.literal("player-position"),
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
  yaw: z.number().finite(),
});

const carIdSchema = z.enum(CAR_IDS);

const enterCarMessageSchema = z.object({
  type: z.literal("enter-car"),
  carId: carIdSchema,
});

const exitCarMessageSchema = z.object({
  type: z.literal("exit-car"),
  carId: carIdSchema,
});

const carStateMessageSchema = z.object({
  type: z.literal("car-state"),
  carId: carIdSchema,
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
  qx: z.number().finite(),
  qy: z.number().finite(),
  qz: z.number().finite(),
  qw: z.number().finite(),
  vx: z.number().finite(),
  vy: z.number().finite(),
  vz: z.number().finite(),
  speed: z.number().finite(),
  steering: z.number().finite(),
});

const carImpactMessageSchema = z.object({
  type: z.literal("car-impact"),
  carId: carIdSchema,
  impactSpeed: z.number().finite(),
  cause: z.enum(["collision", "rollover"]),
});

const raceCarStateMessageSchema = z.object({
  type: z.literal("race-car-state"),
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
  qx: z.number().finite(),
  qy: z.number().finite(),
  qz: z.number().finite(),
  qw: z.number().finite(),
  vx: z.number().finite(),
  vy: z.number().finite(),
  vz: z.number().finite(),
  speed: z.number().finite(),
  steering: z.number().finite(),
});

const raceUseItemMessageSchema = z.object({
  type: z.literal("race-use-item"),
});

const raceResetMessageSchema = z.object({
  type: z.literal("race-reset"),
});

const raceImpactMessageSchema = z.object({
  type: z.literal("race-impact"),
  impactSpeed: z.number().finite(),
  cause: z.enum(["collision", "rollover"]),
});

export const clientMessageSchema = z.discriminatedUnion("type", [
  joinMessageSchema,
  enterLobbyMessageSchema,
  leaveLobbyMessageSchema,
  chatMessageSchema,
  pingMessageSchema,
  mg2PositionMessageSchema,
  mg2DepositMessageSchema,
  mg2StunMessageSchema,
  throwRollMessageSchema,
  playerAnimationMessageSchema,
  playerPositionMessageSchema,
  mg2MummiesMessageSchema,
  enterCarMessageSchema,
  exitCarMessageSchema,
  carStateMessageSchema,
  carImpactMessageSchema,
  raceCarStateMessageSchema,
  raceUseItemMessageSchema,
  raceResetMessageSchema,
  raceImpactMessageSchema,
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type Mg2Phase = "idle" | "countdown" | "playing" | "won" | "lost";
export type Mg2Zone = "west" | "south" | "east" | "north" | "chambers";
export type Mg2SkullStatus = "available" | "carried" | "deposited" | "dropped";
export type Mg2MummyStatus = "patrol" | "chase" | "cooldown" | "stunned";

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
  /** Player that simulates the mummies with physics and reports their positions. */
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
  | "skull-picked"
  | "skull-dropped"
  | "skull-deposited"
  | "player-hurt"
  | "player-died"
  | "mummy-stunned"
  | "round-start"
  | "round-won"
  | "round-lost"
  | "player-joined"
  | "player-left";

export type Mg2Event = {
  kind: Mg2EventKind;
  playerId?: string;
  skullId?: string;
  mummyId?: string;
  amount?: number;
  hp?: number;
  at: number;
};

/** Last known position of a player on the outdoor map. */
export type RemotePosition = {
  x: number;
  y: number;
  z: number;
  yaw: number;
};

/** Scene in which a paper roll was thrown. */
export type PaperRollScene = "map" | "crypt";

/**
 * Paper roll in flight. The positions are authoritative on the server and are
 * sent as full state so that any client joining late sees
 * exactly the same rolls.
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

export type CarModel = "coche_calabaza" | "coche_momia" | "coche_halloween";
export type CarStatus = "available" | "occupied" | "destroyed" | "respawning";
export type CarImpactCause = "collision" | "rollover";
export type CarEventCause = CarImpactCause | "fall" | "disconnect" | "lobby";

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
 * The spawns are provisional and are validated with `?physics=1`.
 */
export const CAR_DEFINITIONS: readonly CarDefinition[] = [
  {
    id: "car-calabaza",
    name: "Pumpkin Car",
    model: "coche_calabaza",
    spawn: { x: -7, y: 1.4, z: 12, yaw: 0 },
    maxHealth: 100,
    respawnMs: 5000,
  },
  {
    id: "car-momia",
    name: "Mummy Car",
    model: "coche_momia",
    spawn: { x: 7, y: 1.4, z: 12, yaw: Math.PI },
    maxHealth: 100,
    respawnMs: 5000,
  },
  {
    id: "car-halloween",
    name: "Halloween Car",
    model: "coche_halloween",
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

export type CarEventKind =
  "entered" | "exited" | "damaged" | "destroyed" | "respawned" | "released";

export type CarEvent = {
  kind: CarEventKind;
  carId: CarId;
  playerId?: string;
  playerName?: string;
  amount?: number;
  cause?: CarEventCause;
  at: number;
};

// Race (minigame-3) — Gran Premio on TWN_Track.

export type RacePhase = "idle" | "countdown" | "playing" | "results";
export type RacePower =
  "nitro" | "repair" | "auto" | "missile" | "shield" | "mine" | "ray";
export type RaceStatus = "grid" | "racing" | "destroyed" | "finished" | "left";
export type RaceModel = "coche_calabaza" | "coche_momia" | "coche_halloween";

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
  totalLaps: number;
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
  | "player-joined"
  | "player-left"
  | "countdown-shortened"
  | "race-start"
  | "gate-passed"
  | "lap-completed"
  | "player-finished"
  | "item-picked"
  | "item-used"
  | "missile-fired"
  | "missile-hit"
  | "mine-placed"
  | "mine-hit"
  | "ray-fired"
  | "player-destroyed"
  | "player-respawned"
  | "race-ended";

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

export type ServerMessage =
  | { type: "welcome"; self: Player; presence: PresenceSnapshot }
  | { type: "presence"; presence: PresenceSnapshot }
  | { type: "chat"; message: ChatMessage }
  | { type: "chat-history"; messages: ChatMessage[] }
  | { type: "pong"; at: number }
  | { type: "error"; code: string; message: string }
  | { type: "mg2-state"; state: Mg2Snapshot }
  | {
      type: "mg2-positions";
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
  | { type: "mg2-event"; event: Mg2Event }
  | { type: "rolls-state"; serverTime: number; rolls: PaperRollState[] }
  | {
      type: "player-animation";
      playerId: string;
      animation: HeroAnimation;
      at: number;
    }
  | {
      type: "player-position";
      playerId: string;
      position: RemotePosition;
      at: number;
    }
  | { type: "cars-state"; serverTime: number; cars: CarState[] }
  | { type: "car-event"; event: CarEvent }
  | { type: "race-state"; state: RaceSnapshot }
  | { type: "race-positions"; at: number; players: RacePosition[] }
  | { type: "race-event"; event: RaceEvent };

export type ParseResult =
  | { ok: true; message: ClientMessage }
  | { ok: false; code: string; message: string };

const CLIENT_MESSAGE_TYPES = [
  "join",
  "enter-lobby",
  "leave-lobby",
  "chat",
  "ping",
  "mg2-position",
  "mg2-deposit",
  "mg2-mummies",
  "mg2-stun",
  "throw-roll",
  "player-animation",
  "player-position",
  "enter-car",
  "exit-car",
  "car-state",
  "car-impact",
  "race-car-state",
  "race-use-item",
  "race-reset",
  "race-impact",
] as const;

export function parseClientMessage(raw: string): ParseResult {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      code: "INVALID_JSON",
      message: "The message is not valid JSON",
    };
  }

  const parsed = clientMessageSchema.safeParse(parsedJson);

  if (parsed.success) {
    return { ok: true, message: parsed.data };
  }

  const type =
    typeof parsedJson === "object" &&
    parsedJson !== null &&
    "type" in parsedJson
      ? parsedJson.type
      : undefined;

  if (
    typeof type !== "string" ||
    !CLIENT_MESSAGE_TYPES.includes(
      type as (typeof CLIENT_MESSAGE_TYPES)[number],
    )
  ) {
    return {
      ok: false,
      code: "UNKNOWN_TYPE",
      message: `Unknown message type: ${String(type ?? "no type")}`,
    };
  }

  if (type === "enter-lobby") {
    const lobbyId =
      typeof parsedJson === "object" &&
      parsedJson !== null &&
      "lobbyId" in parsedJson
        ? parsedJson.lobbyId
        : undefined;

    if (
      typeof lobbyId !== "string" ||
      !MINIGAME_LOBBY_IDS.includes(lobbyId as MinigameLobbyId)
    ) {
      return {
        ok: false,
        code: "INVALID_LOBBY",
        message: `Invalid mini lobby: ${String(lobbyId ?? "no id")}`,
      };
    }
  }

  if (
    type === "enter-car" ||
    type === "exit-car" ||
    type === "car-state" ||
    type === "car-impact"
  ) {
    const carId =
      typeof parsedJson === "object" &&
      parsedJson !== null &&
      "carId" in parsedJson
        ? parsedJson.carId
        : undefined;

    if (typeof carId !== "string" || !CAR_IDS.includes(carId as CarId)) {
      return {
        ok: false,
        code: "INVALID_CAR",
        message: `Invalid car: ${String(carId ?? "no id")}`,
      };
    }
  }

  return {
    ok: false,
    code: "INVALID_MESSAGE",
    message: "The message does not match the expected format",
  };
}

export function sanitizeName(name: string | undefined, id: string): string {
  const cleaned = (name ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);

  if (cleaned.length > 0) {
    return cleaned;
  }

  const suffix = id
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 4)
    .toUpperCase();

  return `Player-${suffix || "0000"}`;
}
