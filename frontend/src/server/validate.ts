/**
 * Runtime validation for inbound messages.
 *
 * The old backend used zod in `backend/src/ws/protocol.ts`. Rooms already
 * receive a parsed payload, but a malicious client can send anything inside it,
 * so every field crossing the wire is still checked here.
 */

import { isSkinId } from '../lib/cosmetics/skinIds';
import {
	CAR_IDS,
	HERO_ANIMATIONS,
	LOBBY_IDS,
	type CarId,
	type ClientMessage,
	type HeroAnimation,
	type LobbyId,
	type Mg5WeaponId,
	type ParseResult,
	type PaperRollScene
} from './protocol';

const CLIENT_MESSAGE_TYPES = [
	'ping',
	'sync',
	'emote',
	'set-lobby',
	'mg2-position',
	'mg2-deposit',
	'mg2-mummies',
	'mg2-stun',
	'throw-roll',
	'player-animation',
	'player-skin',
	'player-nft-equip',
	'player-position',
	'enter-car',
	'exit-car',
	'car-state',
	'car-impact',
	'race-car-state',
	'race-use-item',
	'race-reset',
	'race-impact',
	'race-debug',
	'mg5-position',
	'mg5-shoot',
	'mg5-throw',
	'mg5-car-enter',
	'mg5-car-exit',
	'mg5-car-state',
	'mg5-reload',
	'mg5-equip',
	'mg6-position',
	'mg6-shoot',
	'mg6-throw',
	'mg6-reload',
	'mg6-equip',
	'mg7-position',
	'mg8-position',
	'mg8-jump',
	'mg8-shoot',
	'mg8-throw',
	'mg8-reload',
	'mg8-equip',
	'mg8-vehicle-enter',
	'mg8-vehicle-exit',
	'mg8-vehicle-state'
] as const;

const ROLL_SCENES: readonly PaperRollScene[] = ['map', 'crypt'];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function isCarId(value: unknown): value is CarId {
	return typeof value === 'string' && (CAR_IDS as readonly string[]).includes(value);
}

function isLobbyId(value: unknown): value is LobbyId {
	return typeof value === 'string' && (LOBBY_IDS as readonly string[]).includes(value);
}

function isHeroAnimation(value: unknown): value is HeroAnimation {
	return typeof value === 'string' && (HERO_ANIMATIONS as readonly string[]).includes(value);
}

function isImpactCause(value: unknown): value is 'collision' | 'rollover' {
	return value === 'collision' || value === 'rollover';
}

const MG5_WEAPONS: readonly Mg5WeaponId[] = ['pistol', 'shotgun', 'smg', 'rifle'];

function isMg5WeaponId(value: unknown): value is Mg5WeaponId {
	return typeof value === 'string' && (MG5_WEAPONS as readonly string[]).includes(value);
}

const isMg6WeaponId = isMg5WeaponId;

const MG8_MODES = ['riding', 'skydive', 'glide', 'ground'] as const;

function isMg8Mode(value: unknown): value is (typeof MG8_MODES)[number] {
	return typeof value === 'string' && (MG8_MODES as readonly string[]).includes(value);
}

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function allFinite(values: readonly unknown[]): boolean {
	return values.every(isFiniteNumber);
}

function fail(code: string, message: string): ParseResult {
	return { ok: false, code, message };
}

/**
 * Validates an already-decoded payload. Returns the typed message or an error
 * code the room can send back with `sendTo(playerId, { type: 'error', ... })`.
 */
export function parseClientMessage(raw: unknown): ParseResult {
	if (typeof raw === 'string') {
		try {
			return parseClientMessage(JSON.parse(raw));
		} catch {
			return fail('INVALID_JSON', 'The message is not valid JSON');
		}
	}

	if (!isRecord(raw)) {
		return fail('INVALID_MESSAGE', 'The message does not match the expected format');
	}

	const type = raw.type;

	if (typeof type !== 'string' || !(CLIENT_MESSAGE_TYPES as readonly string[]).includes(type)) {
		return fail('UNKNOWN_TYPE', `Unknown message type: ${String(type ?? 'no type')}`);
	}

	switch (type) {
		case 'ping':
			return { ok: true, message: { type: 'ping' } };

		case 'sync':
			return { ok: true, message: { type: 'sync' } };

		// Rooms-era chat command (`/me`, `/help`).
		case 'emote': {
			if (typeof raw.text !== 'string') {
				return fail('INVALID_MESSAGE', 'Invalid emote text');
			}

			return { ok: true, message: { type: 'emote', text: raw.text } };
		}

		case 'set-lobby': {
			if (!isLobbyId(raw.lobbyId)) {
				return fail('INVALID_LOBBY', `Invalid lobby: ${String(raw.lobbyId ?? 'no id')}`);
			}

			return { ok: true, message: { type: 'set-lobby', lobbyId: raw.lobbyId } };
		}

		case 'mg2-position': {
			if (!allFinite([raw.x, raw.y, raw.z, raw.yaw])) {
				return fail('INVALID_MESSAGE', 'Invalid position');
			}

			return {
				ok: true,
				message: {
					type: 'mg2-position',
					x: raw.x as number,
					y: raw.y as number,
					z: raw.z as number,
					yaw: raw.yaw as number
				}
			};
		}

		case 'mg2-deposit':
			return { ok: true, message: { type: 'mg2-deposit' } };

		case 'mg2-mummies': {
			const mummies = raw.mummies;

			if (!Array.isArray(mummies) || mummies.length < 1 || mummies.length > 8) {
				return fail('INVALID_MESSAGE', 'Invalid mummy report');
			}

			const parsed: Array<{ id: string; x: number; y: number; z: number }> = [];

			for (const entry of mummies) {
				if (!isRecord(entry)) {
					return fail('INVALID_MESSAGE', 'Invalid mummy entry');
				}

				const { id, x, y, z } = entry;

				if (typeof id !== 'string' || id.length < 1 || id.length > 48 || !ID_PATTERN.test(id)) {
					return fail('INVALID_MESSAGE', 'Invalid mummy id');
				}

				if (!allFinite([x, y, z])) {
					return fail('INVALID_MESSAGE', 'Invalid mummy position');
				}

				parsed.push({ id, x: x as number, y: y as number, z: z as number });
			}

			return { ok: true, message: { type: 'mg2-mummies', mummies: parsed } };
		}

		case 'mg2-stun': {
			const { mummyId } = raw;

			if (
				typeof mummyId !== 'string' ||
				mummyId.length < 1 ||
				mummyId.length > 48 ||
				!ID_PATTERN.test(mummyId)
			) {
				return fail('INVALID_MESSAGE', 'Invalid mummy id');
			}

			return { ok: true, message: { type: 'mg2-stun', mummyId } };
		}

		case 'throw-roll': {
			const { id, scene, x, y, z, vx, vy, vz, yaw } = raw;

			if (typeof id !== 'string' || id.length < 1 || id.length > 48 || !ID_PATTERN.test(id)) {
				return fail('INVALID_MESSAGE', 'Invalid roll id');
			}

			if (typeof scene !== 'string' || !(ROLL_SCENES as readonly string[]).includes(scene)) {
				return fail('INVALID_MESSAGE', 'Invalid roll scene');
			}

			if (!allFinite([x, y, z, vx, vy, vz, yaw])) {
				return fail('INVALID_MESSAGE', 'Invalid roll state');
			}

			return {
				ok: true,
				message: {
					type: 'throw-roll',
					id,
					scene: scene as PaperRollScene,
					x: x as number,
					y: y as number,
					z: z as number,
					vx: vx as number,
					vy: vy as number,
					vz: vz as number,
					yaw: yaw as number
				}
			};
		}

		case 'player-animation': {
			if (!isHeroAnimation(raw.animation)) {
				return fail('INVALID_MESSAGE', 'Invalid animation');
			}

			return { ok: true, message: { type: 'player-animation', animation: raw.animation } };
		}

		case 'player-skin': {
			if (!isSkinId(raw.skin)) {
				return fail('INVALID_SKIN', `Invalid skin: ${String(raw.skin ?? 'no id')}`);
			}

			return { ok: true, message: { type: 'player-skin', skin: raw.skin } };
		}

		case 'player-nft-equip': {
			const isAccessoryId = (value: unknown): value is string | null =>
				value === null ||
				(typeof value === 'string' && value.length <= 64 && /^[a-z0-9-]+$/i.test(value));

			if (
				typeof raw.crown !== 'boolean' ||
				!isAccessoryId(raw.ride) ||
				!isAccessoryId(raw.weaponVariant)
			) {
				return fail('INVALID_MESSAGE', 'Invalid NFT equip payload');
			}

			return {
				ok: true,
				message: {
					type: 'player-nft-equip',
					crown: raw.crown,
					ride: raw.ride,
					weaponVariant: raw.weaponVariant
				}
			};
		}

		case 'player-position': {
			if (!allFinite([raw.x, raw.y, raw.z, raw.yaw])) {
				return fail('INVALID_MESSAGE', 'Invalid position');
			}

			return {
				ok: true,
				message: {
					type: 'player-position',
					x: raw.x as number,
					y: raw.y as number,
					z: raw.z as number,
					yaw: raw.yaw as number
				}
			};
		}

		case 'enter-car':
		case 'exit-car': {
			if (!isCarId(raw.carId)) {
				return fail('INVALID_CAR', `Invalid car: ${String(raw.carId ?? 'no id')}`);
			}

			return { ok: true, message: { type, carId: raw.carId } };
		}

		case 'car-state': {
			if (!isCarId(raw.carId)) {
				return fail('INVALID_CAR', `Invalid car: ${String(raw.carId ?? 'no id')}`);
			}

			const values = [
				raw.x,
				raw.y,
				raw.z,
				raw.qx,
				raw.qy,
				raw.qz,
				raw.qw,
				raw.vx,
				raw.vy,
				raw.vz,
				raw.speed,
				raw.steering
			];

			if (!allFinite(values)) {
				return fail('CAR_INVALID_STATE', 'Car state out of range');
			}

			return {
				ok: true,
				message: {
					type: 'car-state',
					carId: raw.carId,
					x: raw.x as number,
					y: raw.y as number,
					z: raw.z as number,
					qx: raw.qx as number,
					qy: raw.qy as number,
					qz: raw.qz as number,
					qw: raw.qw as number,
					vx: raw.vx as number,
					vy: raw.vy as number,
					vz: raw.vz as number,
					speed: raw.speed as number,
					steering: raw.steering as number
				}
			};
		}

		case 'car-impact': {
			if (!isCarId(raw.carId)) {
				return fail('INVALID_CAR', `Invalid car: ${String(raw.carId ?? 'no id')}`);
			}

			if (!isFiniteNumber(raw.impactSpeed) || !isImpactCause(raw.cause)) {
				return fail('INVALID_MESSAGE', 'Invalid impact');
			}

			return {
				ok: true,
				message: {
					type: 'car-impact',
					carId: raw.carId,
					impactSpeed: raw.impactSpeed,
					cause: raw.cause
				}
			};
		}

		case 'race-car-state': {
			const values = [
				raw.x,
				raw.y,
				raw.z,
				raw.qx,
				raw.qy,
				raw.qz,
				raw.qw,
				raw.vx,
				raw.vy,
				raw.vz,
				raw.speed,
				raw.steering
			];

			if (!allFinite(values)) {
				return fail('INVALID_MESSAGE', 'Invalid car state');
			}

			return {
				ok: true,
				message: {
					type: 'race-car-state',
					x: raw.x as number,
					y: raw.y as number,
					z: raw.z as number,
					qx: raw.qx as number,
					qy: raw.qy as number,
					qz: raw.qz as number,
					qw: raw.qw as number,
					vx: raw.vx as number,
					vy: raw.vy as number,
					vz: raw.vz as number,
					speed: raw.speed as number,
					steering: raw.steering as number
				}
			};
		}

		case 'race-use-item':
			return { ok: true, message: { type: 'race-use-item' } };

		case 'race-reset':
			return { ok: true, message: { type: 'race-reset' } };

		case 'race-impact': {
			if (!isFiniteNumber(raw.impactSpeed) || !isImpactCause(raw.cause)) {
				return fail('INVALID_MESSAGE', 'Invalid impact');
			}

			return {
				ok: true,
				message: {
					type: 'race-impact',
					impactSpeed: raw.impactSpeed,
					cause: raw.cause
				}
			};
		}

		// Optional client telemetry for debugging; the room only logs it.
		case 'race-debug': {
			if (typeof raw.event !== 'string') {
				return fail('INVALID_MESSAGE', 'Invalid debug event');
			}

			if (raw.detail !== undefined && typeof raw.detail !== 'string') {
				return fail('INVALID_MESSAGE', 'Invalid debug detail');
			}

			return {
				ok: true,
				message: { type: 'race-debug', event: raw.event, detail: raw.detail }
			};
		}

		case 'mg5-position': {
			if (!allFinite([raw.x, raw.y, raw.z, raw.yaw])) {
				return fail('INVALID_MESSAGE', 'Invalid position');
			}

			return {
				ok: true,
				message: {
					type: 'mg5-position',
					x: raw.x as number,
					y: raw.y as number,
					z: raw.z as number,
					yaw: raw.yaw as number
				}
			};
		}

		case 'mg5-shoot': {
			if (!isMg5WeaponId(raw.weapon)) {
				return fail('INVALID_MESSAGE', 'Invalid weapon');
			}

			if (!allFinite([raw.ox, raw.oy, raw.oz, raw.dx, raw.dy, raw.dz])) {
				return fail('INVALID_MESSAGE', 'Invalid shot');
			}

			const dx = raw.dx as number;
			const dy = raw.dy as number;
			const dz = raw.dz as number;
			const length = Math.hypot(dx, dy, dz);

			if (length < 0.001) {
				return fail('INVALID_MESSAGE', 'Zero direction');
			}

			return {
				ok: true,
				message: {
					type: 'mg5-shoot',
					weapon: raw.weapon,
					ox: raw.ox as number,
					oy: raw.oy as number,
					oz: raw.oz as number,
					dx: dx / length,
					dy: dy / length,
					dz: dz / length,
					targetId:
						typeof raw.targetId === 'string' && raw.targetId.length > 0
							? raw.targetId.slice(0, 64)
							: undefined
				}
			};
		}

		case 'mg5-throw': {
			if (!allFinite([raw.gx, raw.gy, raw.gz, raw.dx, raw.dy, raw.dz])) {
				return fail('INVALID_MESSAGE', 'Invalid throw');
			}

			const dx = raw.dx as number;
			const dy = raw.dy as number;
			const dz = raw.dz as number;
			const length = Math.hypot(dx, dy, dz);

			if (length < 0.001) {
				return fail('INVALID_MESSAGE', 'Zero direction');
			}

			const hasTarget = raw.tx !== undefined || raw.tz !== undefined;

			if (hasTarget && !allFinite([raw.tx, raw.tz])) {
				return fail('INVALID_MESSAGE', 'Invalid throw target');
			}

			return {
				ok: true,
				message: {
					type: 'mg5-throw',
					gx: raw.gx as number,
					gy: raw.gy as number,
					gz: raw.gz as number,
					dx: dx / length,
					dy: dy / length,
					dz: dz / length,
					tx: hasTarget ? (raw.tx as number) : undefined,
					tz: hasTarget ? (raw.tz as number) : undefined
				}
			};
		}

		case 'mg5-car-enter':
			return { ok: true, message: { type: 'mg5-car-enter' } };

		case 'mg5-car-exit':
			return { ok: true, message: { type: 'mg5-car-exit' } };

		case 'mg5-car-state': {
			const values = [
				raw.x,
				raw.y,
				raw.z,
				raw.qx,
				raw.qy,
				raw.qz,
				raw.qw,
				raw.vx,
				raw.vy,
				raw.vz,
				raw.speed,
				raw.steering
			];

			if (!allFinite(values)) {
				return fail('INVALID_MESSAGE', 'Invalid car state');
			}

			return {
				ok: true,
				message: {
					type: 'mg5-car-state',
					x: raw.x as number,
					y: raw.y as number,
					z: raw.z as number,
					qx: raw.qx as number,
					qy: raw.qy as number,
					qz: raw.qz as number,
					qw: raw.qw as number,
					vx: raw.vx as number,
					vy: raw.vy as number,
					vz: raw.vz as number,
					speed: raw.speed as number,
					steering: raw.steering as number
				}
			};
		}

		case 'mg5-reload':
			return { ok: true, message: { type: 'mg5-reload' } };

		case 'mg5-equip': {
			const slot = raw.slot;

			if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 1 || slot > 4) {
				return fail('INVALID_MESSAGE', 'Invalid inventory slot');
			}

			return { ok: true, message: { type: 'mg5-equip', slot } };
		}

		case 'mg6-position': {
			if (!allFinite([raw.x, raw.y, raw.z, raw.yaw])) {
				return fail('INVALID_MESSAGE', 'Invalid position');
			}

			return {
				ok: true,
				message: {
					type: 'mg6-position',
					x: raw.x as number,
					y: raw.y as number,
					z: raw.z as number,
					yaw: raw.yaw as number
				}
			};
		}

		case 'mg6-shoot': {
			if (!isMg6WeaponId(raw.weapon)) {
				return fail('INVALID_MESSAGE', 'Invalid weapon');
			}

			if (!allFinite([raw.ox, raw.oy, raw.oz, raw.dx, raw.dy, raw.dz])) {
				return fail('INVALID_MESSAGE', 'Invalid shot');
			}

			const dx = raw.dx as number;
			const dy = raw.dy as number;
			const dz = raw.dz as number;
			const length = Math.hypot(dx, dy, dz);

			if (length < 0.001) {
				return fail('INVALID_MESSAGE', 'Zero direction');
			}

			return {
				ok: true,
				message: {
					type: 'mg6-shoot',
					weapon: raw.weapon,
					ox: raw.ox as number,
					oy: raw.oy as number,
					oz: raw.oz as number,
					dx: dx / length,
					dy: dy / length,
					dz: dz / length,
					targetId:
						typeof raw.targetId === 'string' && raw.targetId.length > 0
							? raw.targetId.slice(0, 64)
							: undefined
				}
			};
		}

		case 'mg6-throw': {
			if (!allFinite([raw.gx, raw.gy, raw.gz, raw.dx, raw.dy, raw.dz])) {
				return fail('INVALID_MESSAGE', 'Invalid throw');
			}

			const dx = raw.dx as number;
			const dy = raw.dy as number;
			const dz = raw.dz as number;
			const length = Math.hypot(dx, dy, dz);

			if (length < 0.001) {
				return fail('INVALID_MESSAGE', 'Zero direction');
			}

			const hasTarget = raw.tx !== undefined || raw.tz !== undefined;

			if (hasTarget && !allFinite([raw.tx, raw.tz])) {
				return fail('INVALID_MESSAGE', 'Invalid throw target');
			}

			return {
				ok: true,
				message: {
					type: 'mg6-throw',
					gx: raw.gx as number,
					gy: raw.gy as number,
					gz: raw.gz as number,
					dx: dx / length,
					dy: dy / length,
					dz: dz / length,
					tx: hasTarget ? (raw.tx as number) : undefined,
					tz: hasTarget ? (raw.tz as number) : undefined
				}
			};
		}

		case 'mg6-reload':
			return { ok: true, message: { type: 'mg6-reload' } };

		case 'mg6-equip': {
			const slot = raw.slot;

			if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 1 || slot > 4) {
				return fail('INVALID_MESSAGE', 'Invalid inventory slot');
			}

			return { ok: true, message: { type: 'mg6-equip', slot } };
		}

		case 'mg7-position': {
			if (!allFinite([raw.x, raw.y, raw.z, raw.yaw])) {
				return fail('INVALID_MESSAGE', 'Invalid position');
			}

			return {
				ok: true,
				message: {
					type: 'mg7-position',
					x: raw.x as number,
					y: raw.y as number,
					z: raw.z as number,
					yaw: raw.yaw as number
				}
			};
		}

		case 'mg8-position': {
			if (!allFinite([raw.x, raw.y, raw.z, raw.yaw, raw.vy])) {
				return fail('INVALID_MESSAGE', 'Invalid position');
			}

			if (!isMg8Mode(raw.mode)) {
				return fail('INVALID_MESSAGE', 'Invalid movement mode');
			}

			return {
				ok: true,
				message: {
					type: 'mg8-position',
					x: raw.x as number,
					y: raw.y as number,
					z: raw.z as number,
					yaw: raw.yaw as number,
					mode: raw.mode,
					vy: raw.vy as number
				}
			};
		}

		case 'mg8-jump':
			return { ok: true, message: { type: 'mg8-jump' } };

		case 'mg8-shoot': {
			if (!isMg5WeaponId(raw.weapon)) {
				return fail('INVALID_MESSAGE', 'Invalid weapon');
			}

			if (!allFinite([raw.ox, raw.oy, raw.oz, raw.dx, raw.dy, raw.dz])) {
				return fail('INVALID_MESSAGE', 'Invalid shot');
			}

			const dx = raw.dx as number;
			const dy = raw.dy as number;
			const dz = raw.dz as number;
			const length = Math.hypot(dx, dy, dz);

			if (length < 0.001) {
				return fail('INVALID_MESSAGE', 'Zero direction');
			}

			return {
				ok: true,
				message: {
					type: 'mg8-shoot',
					weapon: raw.weapon,
					ox: raw.ox as number,
					oy: raw.oy as number,
					oz: raw.oz as number,
					dx: dx / length,
					dy: dy / length,
					dz: dz / length,
					targetId:
						typeof raw.targetId === 'string' && raw.targetId.length > 0
							? raw.targetId.slice(0, 64)
							: undefined
				}
			};
		}

		case 'mg8-throw': {
			if (!allFinite([raw.gx, raw.gy, raw.gz, raw.dx, raw.dy, raw.dz])) {
				return fail('INVALID_MESSAGE', 'Invalid throw');
			}

			const dx = raw.dx as number;
			const dy = raw.dy as number;
			const dz = raw.dz as number;
			const length = Math.hypot(dx, dy, dz);

			if (length < 0.001) {
				return fail('INVALID_MESSAGE', 'Zero direction');
			}

			const hasTarget = raw.tx !== undefined || raw.tz !== undefined;

			if (hasTarget && !allFinite([raw.tx, raw.tz])) {
				return fail('INVALID_MESSAGE', 'Invalid throw target');
			}

			return {
				ok: true,
				message: {
					type: 'mg8-throw',
					gx: raw.gx as number,
					gy: raw.gy as number,
					gz: raw.gz as number,
					dx: dx / length,
					dy: dy / length,
					dz: dz / length,
					tx: hasTarget ? (raw.tx as number) : undefined,
					tz: hasTarget ? (raw.tz as number) : undefined
				}
			};
		}

		case 'mg8-reload':
			return { ok: true, message: { type: 'mg8-reload' } };

		case 'mg8-equip': {
			const slot = raw.slot;

			if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 1 || slot > 4) {
				return fail('INVALID_MESSAGE', 'Invalid inventory slot');
			}

			return { ok: true, message: { type: 'mg8-equip', slot } };
		}

		case 'mg8-vehicle-enter': {
			const vehicleId = raw.vehicleId;

			if (
				typeof vehicleId !== 'string' ||
				vehicleId.length < 1 ||
				vehicleId.length > 48 ||
				!ID_PATTERN.test(vehicleId)
			) {
				return fail('INVALID_MESSAGE', 'Invalid vehicle id');
			}

			return { ok: true, message: { type: 'mg8-vehicle-enter', vehicleId } };
		}

		case 'mg8-vehicle-exit':
			return { ok: true, message: { type: 'mg8-vehicle-exit' } };

		case 'mg8-vehicle-state': {
			const vehicleId = raw.vehicleId;

			if (
				typeof vehicleId !== 'string' ||
				vehicleId.length < 1 ||
				vehicleId.length > 48 ||
				!ID_PATTERN.test(vehicleId)
			) {
				return fail('INVALID_MESSAGE', 'Invalid vehicle id');
			}

			if (
				!allFinite([
					raw.x,
					raw.y,
					raw.z,
					raw.qx,
					raw.qy,
					raw.qz,
					raw.qw,
					raw.vx,
					raw.vy,
					raw.vz,
					raw.speed,
					raw.steering
				])
			) {
				return fail('INVALID_MESSAGE', 'Invalid vehicle state');
			}

			return {
				ok: true,
				message: {
					type: 'mg8-vehicle-state',
					vehicleId,
					x: raw.x as number,
					y: raw.y as number,
					z: raw.z as number,
					qx: raw.qx as number,
					qy: raw.qy as number,
					qz: raw.qz as number,
					qw: raw.qw as number,
					vx: raw.vx as number,
					vy: raw.vy as number,
					vz: raw.vz as number,
					speed: raw.speed as number,
					steering: raw.steering as number
				}
			};
		}

		default:
			return fail('INVALID_MESSAGE', 'The message does not match the expected format');
	}
}

export type ClientMessageType = (typeof CLIENT_MESSAGE_TYPES)[number];

/** Message types each room understands. Used by the shared dispatcher. */
export function isKnownTo(message: ClientMessage, types: readonly ClientMessageType[]): boolean {
	return (types as readonly string[]).includes(message.type);
}
