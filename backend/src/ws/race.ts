import type {
  Player,
  RaceCarStateReport,
  RaceEvent,
  RaceEventKind,
  RaceItemState,
  RaceMineState,
  RaceMissileState,
  RaceModel,
  RacePhase,
  RacePlayerState,
  RacePosition,
  RacePower,
  RaceSnapshot,
  RaceStatus,
  ServerMessage,
} from "./protocol";

/**
 * Authoritative engine for `minigame-3`: a 5-lap Grand Prix on `TWN_Track`.
 *
 * There is a single room per process. The client simulates its own car and
 * reports position/rotation/velocity; this module validates the report and
 * decides phases, laps, checkpoints, item boxes, powers, damage, missiles,
 * mines, rays, respawns and the final classification.
 */

export const RACE_MAX_PLAYERS = 6;
export const TOTAL_LAPS = 5;
export const COUNTDOWN_MS = 30_000;
export const COUNTDOWN_FULL_MS = 10_000;
export const RESULT_MS = 15_000;
export const RACE_MAX_MS = 480_000;
export const RESPAWN_MS = 3_000;
export const RESET_COOLDOWN_MS = 2_000;
export const MAX_SPEED = 55;
export const MIN_LAP_MS = 10_000;
export const MIN_GATE_MS = 500;
export const ITEM_RESPAWN_MS = 5_000;
export const ITEM_PICKUP_RADIUS = 3.5;
export const MAX_HEALTH = 100;
export const MISSILE_DAMAGE = 30;
export const MISSILE_RANGE = 60;
export const MISSILE_FLIGHT_MS = 1_200;
export const NITRO_MS = 3_000;
export const AUTO_REPAIR_MS = 5_000;
export const AUTO_REPAIR_RATE = 10;
export const SHIELD_MS = 4_000;
export const REPAIR_HP = 35;
export const MINE_DAMAGE = 30;
export const MINE_RADIUS = 2.6;
export const MINE_ARM_MS = 1_000;
export const MINE_LIFETIME_MS = 20_000;
export const MINE_MAX = 6;
export const MINE_OFFSET = 2.2;
export const RAY_DAMAGE = 25;
export const RAY_RANGE = 60;

export const TRACK_CENTER = { x: 0.1056, z: 0 } as const;
export const TRACK_CENTER_RADIUS = 93.0;
export const TRACK_SURFACE_Y = 0.02;
export const CHASSIS_SPAWN_Y = 1.1;
export const GATE_INNER_RADIUS = 86.5;
export const GATE_OUTER_RADIUS = 99.5;
export const OFF_TRACK_INNER = 84;
export const OFF_TRACK_OUTER = 102;

export const TRACK_EXIT = { x: 83.0, y: 0.05, z: -3.0 } as const;

export type RaceSlot = { x: number; y: number; z: number };

/** 6 grid slots, 3 columns × 2 rows, nose pointing +Z. */
export const RACE_GRID: readonly RaceSlot[] = [
  { x: 89.5, y: CHASSIS_SPAWN_Y, z: -4.5 },
  { x: 93.5, y: CHASSIS_SPAWN_Y, z: -4.5 },
  { x: 97.5, y: CHASSIS_SPAWN_Y, z: -4.5 },
  { x: 89.5, y: CHASSIS_SPAWN_Y, z: -11.0 },
  { x: 93.5, y: CHASSIS_SPAWN_Y, z: -11.0 },
  { x: 97.5, y: CHASSIS_SPAWN_Y, z: -11.0 },
];

export const GRID_YAW = -Math.PI / 2;

export const RACE_MODELS: readonly RaceModel[] = [
  "coche_calabaza",
  "coche_momia",
  "coche_halloween",
];

const ITEM_POSITIONS: readonly { x: number; y: number; z: number }[] = [
  { x: 84.68, y: 1.2, z: 30.78 },
  { x: 61.81, y: 1.2, z: 73.54 },
  { x: 15.73, y: 1.2, z: 88.63 },
  { x: -32.73, y: 1.2, z: 90.21 },
  { x: -68.84, y: 1.2, z: 57.85 },
  { x: -94.44, y: 1.2, z: 16.67 },
  { x: -84.47, y: 1.2, z: -30.78 },
  { x: -61.6, y: 1.2, z: -73.54 },
  { x: -15.52, y: 1.2, z: -88.63 },
  { x: 32.94, y: 1.2, z: -90.21 },
  { x: 69.05, y: 1.2, z: -57.85 },
  { x: 94.65, y: 1.2, z: -16.67 },
];

const POWER_WEIGHTS: readonly { power: RacePower; weight: number }[] = [
  { power: "nitro", weight: 25 },
  { power: "missile", weight: 20 },
  { power: "mine", weight: 15 },
  { power: "repair", weight: 15 },
  { power: "ray", weight: 10 },
  { power: "auto", weight: 10 },
  { power: "shield", weight: 5 },
];

const POWER_TOTAL_WEIGHT = POWER_WEIGHTS.reduce(
  (total, entry) => total + entry.weight,
  0,
);

type RaceDeps = {
  publish: (message: ServerMessage) => void;
  moveToGlobal: (playerId: string) => void;
};

type RoomPlayer = {
  id: string;
  name: string;
  model: RaceModel;
  slot: number;
  status: RaceStatus;
  lap: number;
  gate: number;
  /** Gate the server expects next (0 = finish line after the lap). */
  expectedGate: number;
  startedLap: boolean;
  lapStartedAt: number;
  rank: number;
  health: number;
  item: RacePower | null;
  shieldUntil: number;
  nitroUntil: number;
  autoRepairUntil: number;
  finishAt: number | null;
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  steering: number;
  previousX: number;
  previousZ: number;
  lastPositionAt: number;
  lastGateAt: number;
  lastImpactAt: number;
  lastResetAt: number;
  respawnAt: number | null;
  /** Where the car exploded; used to respawn in place after destruction. */
  deathX: number | null;
  deathZ: number | null;
  deathYaw: number | null;
  /** Increments on every respawn/reset so clients can hard-snap the body. */
  respawnSeq: number;
  offTrackSince: number;
  rateWindowStart: number;
  rateCount: number;
};

type RoomItem = {
  id: string;
  x: number;
  y: number;
  z: number;
  respawnAt: number | null;
};

type RoomMissile = {
  id: string;
  fromPlayerId: string;
  targetPlayerId: string | null;
  from: { x: number; y: number; z: number };
  to: { x: number; y: number; z: number };
  firedAt: number;
  hitAt: number;
};

type RoomMine = {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  z: number;
  placedAt: number;
  armedAt: number;
  expiresAt: number;
};

let deps: RaceDeps | null = null;

let phase: RacePhase = "idle";
let endsAt: number | null = null;
let startedAt: number | null = null;
let winnerId: string | null = null;
let countdownShortened = false;
let stateDirty = false;
let nextStateAt = 0;
let nextPositionsAt = 0;
let missileSeq = 0;
let mineSeq = 0;

const players = new Map<string, RoomPlayer>();
let items: RoomItem[] = [];
let missiles: RoomMissile[] = [];
let mines: RoomMine[] = [];

function publish(message: ServerMessage): void {
  deps?.publish(message);
}

function emitEvent(
  kind: RaceEventKind,
  now: number,
  extra: Partial<RaceEvent> = {},
): void {
  const event: RaceEvent = { kind, at: now, ...extra };
  publish({ type: "race-event", event });
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function horizontalDistance(
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  return Math.hypot(ax - bx, az - bz);
}

function trackRadius(x: number, z: number): number {
  return Math.hypot(x - TRACK_CENTER.x, z - TRACK_CENTER.z);
}

function gateAngle(index: number): number {
  return (index * Math.PI) / 4;
}

function gatePoint(
  index: number,
  radius = TRACK_CENTER_RADIUS,
): { x: number; z: number } {
  const angle = gateAngle(index);
  return {
    x: TRACK_CENTER.x + radius * Math.cos(angle),
    z: TRACK_CENTER.z + radius * Math.sin(angle),
  };
}

/** Yaw for a car whose local forward axis is +X to face the rising θ tangent. */
function yawForAngle(angle: number): number {
  return Math.atan2(-Math.cos(angle), -Math.sin(angle));
}

function yawFromQuaternion(
  qx: number,
  qy: number,
  qz: number,
  qw: number,
): number {
  return Math.atan2(2 * (qw * qy + qx * qz), 1 - 2 * (qy * qy + qx * qx));
}

export function initRace(next: RaceDeps): void {
  deps = next;
  resetRoom();
}

function resetRoom(): void {
  phase = "idle";
  endsAt = null;
  startedAt = null;
  winnerId = null;
  countdownShortened = false;
  stateDirty = false;
  nextStateAt = 0;
  nextPositionsAt = 0;
  missileSeq = 0;
  mineSeq = 0;
  players.clear();
  items = [];
  missiles = [];
  mines = [];
}

function resetItems(): void {
  items = ITEM_POSITIONS.map((position, index) => ({
    id: `item-${index}`,
    x: position.x,
    y: position.y,
    z: position.z,
    respawnAt: null,
  }));
}

function emptyPlayer(
  player: Player,
  slot: number,
  model: RaceModel,
  now: number,
): RoomPlayer {
  const spawn = RACE_GRID[slot] ?? RACE_GRID[0];

  return {
    id: player.id,
    name: player.name,
    model,
    slot,
    status: "grid",
    lap: 0,
    gate: 0,
    expectedGate: 0,
    startedLap: false,
    lapStartedAt: now,
    rank: slot + 1,
    health: MAX_HEALTH,
    item: null,
    shieldUntil: 0,
    nitroUntil: 0,
    autoRepairUntil: 0,
    finishAt: null,
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    yaw: GRID_YAW,
    speed: 0,
    steering: 0,
    previousX: spawn.x,
    previousZ: spawn.z,
    lastPositionAt: 0,
    lastGateAt: 0,
    lastImpactAt: 0,
    lastResetAt: 0,
    respawnAt: null,
    deathX: null,
    deathZ: null,
    deathYaw: null,
    respawnSeq: 0,
    offTrackSince: 0,
    rateWindowStart: now,
    rateCount: 0,
  };
}

export function canEnter(
  _playerId: string,
): { ok: true } | { ok: false; code: string; message: string } {
  if (phase === "playing" || phase === "results") {
    return {
      ok: false,
      code: "RACE_IN_PROGRESS",
      message: "The Grand Prix has already started",
    };
  }

  if (players.size >= RACE_MAX_PLAYERS) {
    return {
      ok: false,
      code: "RACE_FULL",
      message: "The Grand Prix is full (6/6)",
    };
  }

  return { ok: true };
}

export function onEnter(player: Player, now = Date.now()): void {
  if (players.has(player.id)) {
    return;
  }

  const check = canEnter(player.id);
  if (!check.ok) {
    return;
  }

  const used = new Set([...players.values()].map((entry) => entry.slot));
  const free: number[] = [];

  for (let slot = 0; slot < RACE_MAX_PLAYERS; slot += 1) {
    if (!used.has(slot)) {
      free.push(slot);
    }
  }

  const slot = free[Math.floor(Math.random() * free.length)] ?? 0;
  const model =
    RACE_MODELS[Math.floor(Math.random() * RACE_MODELS.length)] ??
    RACE_MODELS[0];

  players.set(player.id, emptyPlayer(player, slot, model, now));

  if (phase === "idle") {
    phase = "countdown";
    endsAt = now + COUNTDOWN_MS;
    countdownShortened = false;
    resetItems();
  }

  maybeShortenCountdown(now);

  emitEvent("player-joined", now, { playerId: player.id });
  stateDirty = true;
  broadcastState(now);
  console.log(
    `[race] enter ${player.id} ${player.name} slot=${slot} model=${model}`,
  );
}

function maybeShortenCountdown(now: number): void {
  if (phase !== "countdown" || countdownShortened) {
    return;
  }

  if (players.size < RACE_MAX_PLAYERS) {
    return;
  }

  countdownShortened = true;

  const target = now + COUNTDOWN_FULL_MS;

  if (endsAt === null || endsAt > target) {
    endsAt = target;
  }

  emitEvent("countdown-shortened", now);
  stateDirty = true;
}

export function onLeave(playerId: string, now = Date.now()): void {
  const player = players.get(playerId);

  if (!player) {
    return;
  }

  players.delete(playerId);
  missiles = missiles.filter(
    (missile) =>
      missile.fromPlayerId !== playerId && missile.targetPlayerId !== playerId,
  );
  mines = mines.filter((mine) => mine.ownerId !== playerId);

  emitEvent("player-left", now, { playerId });

  if (players.size === 0) {
    resetRoom();
    broadcastState(now);
    return;
  }

  recomputeRanking(now);
  stateDirty = true;
  broadcastState(now);
}

export function onCarState(
  playerId: string,
  report: RaceCarStateReport,
  now = Date.now(),
): void {
  const player = players.get(playerId);

  if (!player || phase !== "playing" || player.status !== "racing") {
    return;
  }

  // Sliding 1 s window.
  if (now - player.rateWindowStart >= 1000) {
    player.rateWindowStart = now;
    player.rateCount = 0;
  }

  player.rateCount += 1;

  if (player.rateCount > 20) {
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
    report.vx,
    report.vy,
    report.vz,
    report.speed,
    report.steering,
  ];

  if (values.some((value) => !Number.isFinite(value))) {
    return;
  }

  if (Math.abs(report.x) > 1000 || Math.abs(report.z) > 1000) {
    return;
  }

  if (report.y < -10 || report.y > 50) {
    return;
  }

  const speed = Math.abs(report.speed);
  if (speed > MAX_SPEED + 0.5) {
    return;
  }

  const quaternionNorm = Math.hypot(report.qx, report.qy, report.qz, report.qw);
  if (quaternionNorm < 0.1 || quaternionNorm > 10) {
    return;
  }

  if (player.lastPositionAt > 0) {
    const dt = Math.max(0.001, (now - player.lastPositionAt) / 1000);
    const allowed = 60 * dt + 2;
    const travelled = Math.hypot(
      report.x - player.x,
      report.y - player.y,
      report.z - player.z,
    );

    if (travelled > allowed) {
      return;
    }
  }

  player.previousX = player.x;
  player.previousZ = player.z;
  player.x = report.x;
  player.y = report.y;
  player.z = report.z;
  player.yaw = yawFromQuaternion(report.qx, report.qy, report.qz, report.qw);
  player.speed = speed;
  player.steering = clamp(report.steering, -1, 1);
  player.lastPositionAt = now;

  processGates(player, now);
  processItems(player, now);
  processOffTrack(player, now);

  stateDirty = true;
}

function segmentIntersection(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  dx: number,
  dz: number,
): { t: number; u: number } | null {
  const rX = bx - ax;
  const rZ = bz - az;
  const sX = dx - cx;
  const sZ = dz - cz;
  const denominator = rX * sZ - rZ * sX;

  if (Math.abs(denominator) < 1e-9) {
    return null;
  }

  const t = ((cx - ax) * sZ - (cz - az) * sX) / denominator;
  const u = ((cx - ax) * rZ - (cz - az) * rX) / denominator;

  if (t < 0 || t > 1 || u < 0 || u > 1) {
    return null;
  }

  return { t, u };
}

function processGates(player: RoomPlayer, now: number): void {
  const gate = player.expectedGate;

  if (now - player.lastGateAt < MIN_GATE_MS) {
    return;
  }

  const angle = gateAngle(gate);
  const inner = gatePoint(gate, GATE_INNER_RADIUS);
  const outer = gatePoint(gate, GATE_OUTER_RADIUS);
  const hit = segmentIntersection(
    player.previousX,
    player.previousZ,
    player.x,
    player.z,
    inner.x,
    inner.z,
    outer.x,
    outer.z,
  );

  if (!hit) {
    return;
  }

  // Only crossings in the race direction (rising θ) count.
  const tangentX = -Math.sin(angle);
  const tangentZ = Math.cos(angle);
  const moveX = player.x - player.previousX;
  const moveZ = player.z - player.previousZ;

  if (moveX * tangentX + moveZ * tangentZ <= 0) {
    return;
  }

  player.lastGateAt = now;

  if (gate === 0) {
    if (!player.startedLap) {
      player.startedLap = true;
      player.lap = 0;
      player.gate = 0;
      player.expectedGate = 1;
      player.lapStartedAt = now;
      emitEvent("gate-passed", now, { playerId: player.id, gate: 0, lap: 0 });
      stateDirty = true;
      return;
    }

    if (now - player.lapStartedAt < MIN_LAP_MS) {
      return;
    }

    player.lap += 1;
    player.gate = 0;
    player.expectedGate = 1;

    if (player.lap >= TOTAL_LAPS) {
      player.lap = TOTAL_LAPS;
      player.status = "finished";
      player.finishAt = now;
      player.expectedGate = 0;
      player.item = null;
      player.speed = 0;
      winnerId = winnerId ?? player.id;
      emitEvent("player-finished", now, {
        playerId: player.id,
        lap: TOTAL_LAPS,
      });
      console.log(
        `[race] finish ${player.id} time=${now - (startedAt ?? now)}ms`,
      );
    } else {
      player.lapStartedAt = now;
      emitEvent("lap-completed", now, { playerId: player.id, lap: player.lap });
    }

    stateDirty = true;
    return;
  }

  player.gate = gate;
  player.expectedGate = gate === 7 ? 0 : gate + 1;
  emitEvent("gate-passed", now, { playerId: player.id, gate, lap: player.lap });
  stateDirty = true;
}

function distancePointToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSquared = dx * dx + dz * dz;

  if (lengthSquared < 1e-6) {
    return Math.hypot(px - ax, pz - az);
  }

  const t = clamp(((px - ax) * dx + (pz - az) * dz) / lengthSquared, 0, 1);

  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

function rollPower(): RacePower {
  let roll = Math.random() * POWER_TOTAL_WEIGHT;

  for (const entry of POWER_WEIGHTS) {
    roll -= entry.weight;

    if (roll <= 0) {
      return entry.power;
    }
  }

  return POWER_WEIGHTS[0].power;
}

function processItems(player: RoomPlayer, now: number): void {
  if (player.item !== null) {
    return;
  }

  for (const item of items) {
    if (item.respawnAt !== null && now < item.respawnAt) {
      continue;
    }

    const distance = distancePointToSegment(
      item.x,
      item.z,
      player.previousX,
      player.previousZ,
      player.x,
      player.z,
    );

    if (distance > ITEM_PICKUP_RADIUS) {
      continue;
    }

    const power = rollPower();
    item.respawnAt = now + ITEM_RESPAWN_MS;
    player.item = power;
    emitEvent("item-picked", now, {
      playerId: player.id,
      itemId: item.id,
      power,
    });
    stateDirty = true;
    return;
  }
}

function processOffTrack(player: RoomPlayer, now: number): void {
  const radius = trackRadius(player.x, player.z);

  if (player.y < -5 || radius < OFF_TRACK_INNER || radius > OFF_TRACK_OUTER) {
    if (player.offTrackSince === 0) {
      player.offTrackSince = now;
    } else if (now - player.offTrackSince > 2_000) {
      respawnPlayer(player, now);
    }
  } else {
    player.offTrackSince = 0;
  }
}

function applyDamage(player: RoomPlayer, amount: number, now: number): number {
  if (player.status !== "racing" || amount <= 0) {
    return 0;
  }

  if (player.shieldUntil > now) {
    return 0;
  }

  const applied = Math.min(player.health, amount);
  player.health = Math.max(0, player.health - applied);
  stateDirty = true;

  if (player.health <= 0) {
    destroyPlayer(player, now);
  }

  return applied;
}

function destroyPlayer(player: RoomPlayer, now: number): void {
  player.status = "destroyed";
  player.health = 0;
  player.item = null;
  player.speed = 0;
  player.respawnAt = now + RESPAWN_MS;
  player.deathX = player.x;
  player.deathZ = player.z;
  player.deathYaw = player.yaw;
  player.offTrackSince = 0;
  emitEvent("player-destroyed", now, { playerId: player.id });
  console.log(`[race] destroy ${player.id}`);
  stateDirty = true;
}

/** Distance a blocked respawn is pushed backwards along the race tangent. */
const RESPAWN_SHIFT = 3;
/** A gate is considered occupied when another racer is this close to it. */
const RESPAWN_CLEAR_RADIUS = 4;

/**
 * True when another active racer is too close to the candidate respawn point.
 * Used to avoid materialising a car on top of someone else.
 */
function respawnBlocked(player: RoomPlayer, x: number, z: number): boolean {
  for (const other of players.values()) {
    if (other.id === player.id || other.status !== "racing") {
      continue;
    }

    if (horizontalDistance(other.x, other.z, x, z) < RESPAWN_CLEAR_RADIUS) {
      return true;
    }
  }

  return false;
}

function respawnPlayer(player: RoomPlayer, now: number, reset = false): void {
  let x = RACE_GRID[player.slot]?.x ?? RACE_GRID[0].x;
  let y = CHASSIS_SPAWN_Y;
  let z = RACE_GRID[player.slot]?.z ?? RACE_GRID[0].z;
  let yaw = GRID_YAW;
  let usedDeathPoint = false;

  // A destroyed car comes back where it exploded, as long as the point is
  // still on the asphalt. Manual resets and off-track recoveries keep using
  // the last gate so the pilot cannot exploit a reset to skip a corner.
  if (!reset && player.deathX !== null && player.deathZ !== null) {
    const radius = trackRadius(player.deathX, player.deathZ);

    if (radius >= OFF_TRACK_INNER + 2 && radius <= OFF_TRACK_OUTER - 2) {
      x = player.deathX;
      z = player.deathZ;
      yaw =
        player.deathYaw ??
        yawForAngle(Math.atan2(z - TRACK_CENTER.z, x - TRACK_CENTER.x));
      usedDeathPoint = true;
    }
  }

  if (!usedDeathPoint && player.startedLap) {
    const angle = gateAngle(player.gate);
    const point = gatePoint(player.gate);
    x = point.x;
    z = point.z;
    y = CHASSIS_SPAWN_Y;
    yaw = yawForAngle(angle);
  }

  // Walk backwards along the tangent until the point is clear, so a car that
  // respawns there does not overlap a racer still crossing it.
  const angle = Math.atan2(z - TRACK_CENTER.z, x - TRACK_CENTER.x);
  const tangentX = -Math.sin(angle);
  const tangentZ = Math.cos(angle);

  for (
    let attempt = 0;
    attempt < 4 && respawnBlocked(player, x, z);
    attempt += 1
  ) {
    x -= tangentX * RESPAWN_SHIFT;
    z -= tangentZ * RESPAWN_SHIFT;
  }

  player.x = x;
  player.y = y;
  player.z = z;
  player.previousX = x;
  player.previousZ = z;
  player.yaw = yaw;
  player.speed = 0;
  player.steering = 0;
  player.health = MAX_HEALTH;
  player.item = null;
  player.shieldUntil = 0;
  player.nitroUntil = 0;
  player.autoRepairUntil = 0;
  player.lastPositionAt = 0;
  player.lastGateAt = now;
  player.respawnAt = null;
  player.deathX = null;
  player.deathZ = null;
  player.deathYaw = null;
  player.offTrackSince = 0;
  player.status = "racing";
  player.respawnSeq += 1;
  emitEvent("player-respawned", now, { playerId: player.id });

  if (reset) {
    player.lastResetAt = now;
  }

  stateDirty = true;
}

export function onUseItem(playerId: string, now = Date.now()): void {
  const player = players.get(playerId);

  if (
    !player ||
    phase !== "playing" ||
    player.status !== "racing" ||
    !player.item
  ) {
    return;
  }

  const power = player.item;
  player.item = null;

  switch (power) {
    case "nitro":
      player.nitroUntil = now + NITRO_MS;
      break;

    case "repair":
      player.health = Math.min(MAX_HEALTH, player.health + REPAIR_HP);
      break;

    case "auto":
      player.autoRepairUntil = now + AUTO_REPAIR_MS;
      break;

    case "shield":
      player.shieldUntil = now + SHIELD_MS;
      break;

    case "mine": {
      const forwardX = Math.cos(player.yaw);
      const forwardZ = -Math.sin(player.yaw);

      if (mines.length >= MINE_MAX) {
        mines.shift();
      }

      mineSeq += 1;
      const mine: RoomMine = {
        id: `mine-${mineSeq}`,
        ownerId: player.id,
        x: player.x - forwardX * MINE_OFFSET,
        y: 0.35,
        z: player.z - forwardZ * MINE_OFFSET,
        placedAt: now,
        armedAt: now + MINE_ARM_MS,
        expiresAt: now + MINE_LIFETIME_MS,
      };

      mines.push(mine);
      emitEvent("mine-placed", now, {
        playerId: player.id,
        mineId: mine.id,
        from: { x: mine.x, y: mine.y, z: mine.z },
      });
      break;
    }

    case "ray": {
      const ranking = sortedPlayers(now);
      const index = ranking.findIndex((entry) => entry.id === player.id);
      const ahead = index > 0 ? ranking[index - 1] : null;
      const distance = ahead
        ? Math.hypot(ahead.x - player.x, ahead.y - player.y, ahead.z - player.z)
        : Number.POSITIVE_INFINITY;
      const target = ahead && distance <= RAY_RANGE ? ahead : null;
      const forwardX = Math.cos(player.yaw);
      const forwardZ = -Math.sin(player.yaw);
      const from = { x: player.x, y: player.y + 0.7, z: player.z };
      const to = target
        ? { x: target.x, y: target.y + 0.7, z: target.z }
        : {
            x: player.x + forwardX * 30,
            y: player.y + 0.7,
            z: player.z + forwardZ * 30,
          };
      const applied = target ? applyDamage(target, RAY_DAMAGE, now) : 0;

      emitEvent("ray-fired", now, {
        playerId: player.id,
        otherId: target?.id,
        amount: applied,
        from,
        to,
      });
      break;
    }

    case "missile": {
      const ranking = sortedPlayers(now);
      const index = ranking.findIndex((entry) => entry.id === player.id);
      const ahead = index > 0 ? ranking[index - 1] : null;
      const distance = ahead
        ? Math.hypot(ahead.x - player.x, ahead.y - player.y, ahead.z - player.z)
        : Number.POSITIVE_INFINITY;
      const target = ahead && distance <= MISSILE_RANGE ? ahead : null;

      missileSeq += 1;
      const forwardX = Math.cos(player.yaw);
      const forwardZ = -Math.sin(player.yaw);

      const missile: RoomMissile = {
        id: `missile-${missileSeq}`,
        fromPlayerId: player.id,
        targetPlayerId: target?.id ?? null,
        from: { x: player.x, y: player.y + 0.8, z: player.z },
        to: target
          ? { x: target.x, y: target.y + 0.8, z: target.z }
          : {
              x: player.x + forwardX * 30,
              y: player.y + 0.8,
              z: player.z + forwardZ * 30,
            },
        firedAt: now,
        hitAt: now + MISSILE_FLIGHT_MS,
      };

      missiles.push(missile);
      emitEvent("missile-fired", now, {
        playerId: player.id,
        otherId: target?.id,
        missileId: missile.id,
      });
      break;
    }
  }

  emitEvent("item-used", now, { playerId: player.id, power });
  stateDirty = true;
}

export function onReset(playerId: string, now = Date.now()): void {
  const player = players.get(playerId);

  if (!player || phase !== "playing" || player.status !== "racing") {
    return;
  }

  if (now - player.lastResetAt < RESET_COOLDOWN_MS) {
    return;
  }

  respawnPlayer(player, now, true);
}

export function onImpact(
  playerId: string,
  impactSpeed: number,
  cause: "collision" | "rollover",
  now = Date.now(),
): void {
  const player = players.get(playerId);

  if (!player || phase !== "playing" || player.status !== "racing") {
    return;
  }

  if (now - player.lastImpactAt < 600) {
    return;
  }

  const damage =
    cause === "rollover"
      ? 12
      : Math.round(clamp((Math.max(0, impactSpeed) - 5) * 3, 0, 35));

  if (damage <= 0) {
    return;
  }

  player.lastImpactAt = now;
  applyDamage(player, damage, now);
}

function updateMissiles(now: number): void {
  if (missiles.length === 0) {
    return;
  }

  const remaining: RoomMissile[] = [];

  for (const missile of missiles) {
    if (now < missile.hitAt) {
      remaining.push(missile);
      continue;
    }

    const target = missile.targetPlayerId
      ? players.get(missile.targetPlayerId)
      : undefined;

    if (!target || target.status !== "racing") {
      continue;
    }

    const applied = applyDamage(target, MISSILE_DAMAGE, now);
    emitEvent("missile-hit", now, {
      playerId: missile.fromPlayerId,
      otherId: target.id,
      missileId: missile.id,
      amount: applied,
    });
  }

  missiles = remaining;
}

function updateMines(now: number): void {
  if (mines.length === 0) {
    return;
  }

  const remaining: RoomMine[] = [];

  for (const mine of mines) {
    if (now >= mine.expiresAt) {
      stateDirty = true;
      continue;
    }

    if (now < mine.armedAt) {
      remaining.push(mine);
      continue;
    }

    let victim: RoomPlayer | null = null;

    for (const player of players.values()) {
      if (player.id === mine.ownerId || player.status !== "racing") {
        continue;
      }

      if (
        horizontalDistance(player.x, player.z, mine.x, mine.z) <= MINE_RADIUS
      ) {
        victim = player;
        break;
      }
    }

    if (!victim) {
      remaining.push(mine);
      continue;
    }

    const applied = applyDamage(victim, MINE_DAMAGE, now);
    emitEvent("mine-hit", now, {
      playerId: mine.ownerId,
      otherId: victim.id,
      mineId: mine.id,
      amount: applied,
      from: { x: mine.x, y: mine.y, z: mine.z },
      to: { x: victim.x, y: victim.y, z: victim.z },
    });
    stateDirty = true;
  }

  mines = remaining;
}

function updateAutoRepair(now: number): void {
  let changed = false;

  for (const player of players.values()) {
    if (player.autoRepairUntil <= now || player.status !== "racing") {
      continue;
    }

    if (player.health >= MAX_HEALTH) {
      continue;
    }

    player.health = Math.min(MAX_HEALTH, player.health + AUTO_REPAIR_RATE / 10);
    changed = true;
  }

  if (changed) {
    stateDirty = true;
  }
}

function updateRespawns(now: number): void {
  for (const player of players.values()) {
    if (
      player.status === "destroyed" &&
      player.respawnAt !== null &&
      now >= player.respawnAt
    ) {
      respawnPlayer(player, now);
    }
  }
}

function updateItems(now: number): void {
  for (const item of items) {
    if (item.respawnAt !== null && now >= item.respawnAt) {
      item.respawnAt = null;
      stateDirty = true;
    }
  }
}

function progressScore(player: RoomPlayer): number {
  return player.lap * 8 + player.gate;
}

function sortedPlayers(now: number): RoomPlayer[] {
  void now;
  const list = [...players.values()];

  return list.sort((a, b) => {
    const aFinished = a.status === "finished";
    const bFinished = b.status === "finished";

    if (aFinished && bFinished) {
      return (a.finishAt ?? 0) - (b.finishAt ?? 0);
    }

    if (aFinished) return -1;
    if (bFinished) return 1;

    const scoreDiff = progressScore(b) - progressScore(a);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    // Same gate: the one closer (in angle) to the next gate goes first.
    return distanceToNextGate(a) - distanceToNextGate(b);
  });
}

function distanceToNextGate(player: RoomPlayer): number {
  const point = gatePoint(player.expectedGate);
  return horizontalDistance(player.x, player.z, point.x, point.z);
}

function recomputeRanking(now: number): void {
  const list = sortedPlayers(now);
  list.forEach((player, index) => {
    player.rank = index + 1;
  });
}

function copyPlayer(player: RoomPlayer): RacePlayerState {
  return {
    id: player.id,
    name: player.name,
    model: player.model,
    slot: player.slot,
    status: player.status,
    lap: player.lap,
    gate: player.gate,
    rank: player.rank,
    health: Math.round(player.health),
    maxHealth: MAX_HEALTH,
    item: player.item,
    shieldUntil: player.shieldUntil > 0 ? player.shieldUntil : null,
    nitroUntil: player.nitroUntil > 0 ? player.nitroUntil : null,
    autoRepairUntil: player.autoRepairUntil > 0 ? player.autoRepairUntil : null,
    finishAt: player.finishAt,
    respawnSeq: player.respawnSeq,
    x: round(player.x),
    y: round(player.y),
    z: round(player.z),
    yaw: round(player.yaw),
    speed: round(player.speed),
  };
}

function copyPosition(player: RoomPlayer): RacePosition {
  const half = player.yaw / 2;

  return {
    id: player.id,
    x: round(player.x),
    y: round(player.y),
    z: round(player.z),
    qx: 0,
    qy: Math.sin(half),
    qz: 0,
    qw: Math.cos(half),
    vx: 0,
    vy: 0,
    vz: 0,
    speed: round(player.speed),
    steering: round(player.steering),
    health: Math.round(player.health),
    lap: player.lap,
    gate: player.gate,
    status: player.status,
  };
}

export function buildSnapshot(now = Date.now()): RaceSnapshot {
  recomputeRanking(now);

  return {
    phase,
    endsAt,
    startedAt,
    serverTime: now,
    totalLaps: TOTAL_LAPS,
    raceMaxMs: RACE_MAX_MS,
    winnerId,
    players: sortedPlayers(now).map(copyPlayer),
    items: items.map<RaceItemState>((item) => ({
      id: item.id,
      x: item.x,
      y: item.y,
      z: item.z,
      respawnAt: item.respawnAt,
    })),
    missiles: missiles.map<RaceMissileState>((missile) => ({
      id: missile.id,
      fromPlayerId: missile.fromPlayerId,
      targetPlayerId: missile.targetPlayerId,
      from: { ...missile.from },
      to: { ...missile.to },
      firedAt: missile.firedAt,
      hitAt: missile.hitAt,
    })),
    mines: mines.map<RaceMineState>((mine) => ({
      id: mine.id,
      ownerId: mine.ownerId,
      x: round(mine.x),
      y: round(mine.y),
      z: round(mine.z),
      placedAt: mine.placedAt,
      armedAt: mine.armedAt,
      expiresAt: mine.expiresAt,
    })),
  };
}

function broadcastState(now: number): void {
  stateDirty = false;
  nextStateAt = now + 1000;
  publish({ type: "race-state", state: buildSnapshot(now) });
}

function broadcastPositions(now: number): void {
  recomputeRanking(now);
  publish({
    type: "race-positions",
    at: now,
    players: [...players.values()].map(copyPosition),
  });
  nextPositionsAt = now + 100;
}

function startRace(now: number): void {
  phase = "playing";
  startedAt = now;
  endsAt = now + RACE_MAX_MS;
  winnerId = null;
  missiles = [];
  mines = [];

  for (const player of players.values()) {
    player.status = "racing";
    player.startedLap = false;
    player.lap = 0;
    player.gate = 0;
    player.expectedGate = 0;
    player.lapStartedAt = now;
    player.lastGateAt = 0;
    player.lastPositionAt = 0;
    player.health = MAX_HEALTH;
  }

  emitEvent("race-start", now);
  console.log(`[race] start players=${players.size}`);
  stateDirty = true;
}

function finishRace(now: number): void {
  if (phase !== "playing") {
    return;
  }

  phase = "results";
  endsAt = now + RESULT_MS;
  missiles = [];
  mines = [];
  emitEvent("race-ended", now, winnerId ? { playerId: winnerId } : {});
  console.log(`[race] end winner=${winnerId ?? "none"}`);
  stateDirty = true;
}

function endRace(now: number): void {
  const ids = [...players.keys()];
  resetRoom();
  nextStateAt = now + 1000;
  publish({ type: "race-state", state: buildSnapshot(now) });

  for (const id of ids) {
    deps?.moveToGlobal(id);
  }
}

export function tick(now = Date.now()): void {
  try {
    if (phase === "idle") {
      return;
    }

    if (endsAt !== null && now >= endsAt) {
      if (phase === "countdown") {
        startRace(now);
      } else if (phase === "playing") {
        finishRace(now);
      } else {
        endRace(now);
        return;
      }
    }

    if (phase === "playing") {
      updateAutoRepair(now);
      updateMissiles(now);
      updateMines(now);
      updateRespawns(now);
      updateItems(now);

      const allFinished =
        players.size > 0 &&
        [...players.values()].every((player) => player.status === "finished");

      if (allFinished) {
        finishRace(now);
      }
    }

    if (phase === "playing" || phase === "countdown") {
      if (now >= nextPositionsAt) {
        broadcastPositions(now);
      }
    }

    if (stateDirty || now >= nextStateAt) {
      broadcastState(now);
    }
  } catch (error) {
    console.error("[race] tick error:", error);
    publish({
      type: "error",
      code: "RACE_ROOM_ERROR",
      message: "The race was restarted due to an internal error",
    });
    resetRoom();
    broadcastState(now);
  }
}

export function snapshot(now = Date.now()): RaceSnapshot {
  return buildSnapshot(now);
}

/** For automated tests only. */
export function debugState(): {
  phase: RacePhase;
  players: number;
  items: number;
  missiles: number;
  mines: number;
} {
  return {
    phase,
    players: players.size,
    items: items.length,
    missiles: missiles.length,
    mines: mines.length,
  };
}
