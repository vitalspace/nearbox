/**
 * Public entry for the room server.
 *
 * `rundot/rooms.config.json` points at the room files directly, so this module
 * only exists for tests and for anything that wants the engines without a room.
 */

export { default as LobbyRoom, type LobbyProtocol } from './rooms/LobbyRoom';
export { default as CryptRoom, type CryptProtocol } from './rooms/CryptRoom';
export { default as RaceRoom, type RaceProtocol } from './rooms/RaceRoom';
export { default as DeathmatchRoom, type DeathmatchProtocol } from './rooms/DeathmatchRoom';
export { default as ParkourRoom, type ParkourProtocol } from './rooms/ParkourRoom';

export { Presence } from './engines/presence';
export { Emotes, CHAT_HISTORY_LIMIT, CHAT_MAX_LENGTH, CHAT_RATE_LIMIT_MS } from './engines/chat';
export { PaperRolls, MAX_ROLLS_PER_PLAYER, PAPER_ROLL_TTL_MS } from './engines/paperRolls';
export { Cars } from './engines/cars';
export { Race, RACE_MAX_PLAYERS, TOTAL_LAPS } from './engines/race';
export { Crypt } from './engines/minigame2';
export { Deathmatch } from './engines/deathmatch';
export { Parkour } from './engines/parkour';

export { parseClientMessage } from './validate';
export { ByteBudget, MAX_BROADCAST_BYTES } from './budget';
export type { RoomPort } from './port';
export * from './protocol';
