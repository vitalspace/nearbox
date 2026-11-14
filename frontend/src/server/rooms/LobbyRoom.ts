import {
	GameRoom,
	type GameMessage,
	type LeaveReason,
	type Player
} from '@series-inc/rundot-game-sdk/mp-server';
import { ByteBudget } from '../budget';
import { Cars } from '../engines/cars';
import { Emotes } from '../engines/chat';
import { PaperRolls } from '../engines/paperRolls';
import { Presence } from '../engines/presence';
import type { RoomPort } from '../port';
import {
	type ClientMessage,
	type HeroAnimation,
	type PresenceSnapshot,
	type Player as PresencePlayer,
	type ServerMessage
} from '../protocol';
import { parseClientMessage } from '../validate';

/**
 * `lobby` — the outdoor hub. Singleton: there is only one, everybody is in it.
 *
 * Replaces the `lobby:global` topic of the old Elysia backend:
 * - presence (who is online and in which mini lobby),
 * - `/me` and `/help` (normal chat is platform room chat),
 * - paper rolls (`throw-roll`) for both scenes,
 * - hero animation and position relays,
 * - the three cars.
 */

const POSITION_MIN_INTERVAL_MS = 60;
const MAX_POSITION_COORD = 1000;

type LobbyServer = Extract<
	ServerMessage,
	{
		type:
			| 'hello'
			| 'presence'
			| 'emote'
			| 'emote-history'
			| 'pong'
			| 'error'
			| 'rolls-state'
			| 'player-animation'
			| 'player-position'
			| 'cars-state'
			| 'car-event';
	}
>;

type LobbyClient = Extract<
	ClientMessage,
	{
		type:
			| 'ping'
			| 'sync'
			| 'emote'
			| 'set-lobby'
			| 'throw-roll'
			| 'player-animation'
			| 'player-skin'
			| 'player-nft-equip'
			| 'player-position'
			| 'enter-car'
			| 'exit-car'
			| 'car-state'
			| 'car-impact';
	}
>;

export type LobbyProtocol = LobbyServer | LobbyClient;

export default class LobbyRoom extends GameRoom<LobbyProtocol> {
	private port!: RoomPort;
	private budget!: ByteBudget;
	private presence!: Presence;
	private emotes!: Emotes;
	private rolls!: PaperRolls;
	private cars!: Cars;

	private readonly lastPositionAt = new Map<string, number>();
	private ready = false;

	onCreate(): void {
		this.initialize();
	}

	/**
	 * The platform can bring a saved room back with `handleRestore`, which runs
	 * *instead of* `onCreate`. Without this the engines would stay undefined and
	 * every join would fail with `Cannot read properties of undefined`.
	 */
	onRestore(): void {
		this.initialize();
	}

	private initialize(): void {
		if (this.ready) {
			return;
		}

		this.ready = true;
		this.budget = new ByteBudget(this.log);

		this.port = {
			broadcast: (message) => {
				this.budget.check(message);
				this.broadcast(message as LobbyProtocol);
			},
			sendTo: (playerId, message) => this.sendTo(playerId, message as LobbyProtocol)
		};

		this.presence = new Presence();
		this.emotes = new Emotes(this.port);
		this.rolls = new PaperRolls(this.port);
		this.cars = new Cars(this.port, {
			listGlobal: () => this.presence.listGlobal(),
			log: (event, data) => this.log.info(event, data)
		});

		// 10 Hz, same cadence as the old `setInterval(() => carsTick(), 100)`.
		this.clock.setInterval('cars', () => this.cars.tick(Date.now()), 100);
		this.clock.setInterval('rolls', () => this.rolls.tick(Date.now()), 500);
		this.log.info('lobby room created', { roomId: this.roomId });
	}

	onPlayerJoin(player: Player): void {
		const self = this.presence.ensure(player.id, player.username);

		this.sendWelcome(player.id, self);
		this.broadcastPresence();
	}

	/**
	 * Join burst: the `welcome` + chat-history + rolls + cars payload the client
	 * needs to draw the hub. Also used by `sync`, because the platform may
	 * deliver the burst before the client has attached its room handlers (the
	 * client then asks for it again after joining).
	 */
	private sendWelcome(playerId: string, self: PresencePlayer): void {
		this.sendTo(playerId, {
			type: 'hello',
			self,
			presence: this.presence.buildSnapshot()
		});
		this.sendTo(playerId, {
			type: 'emote-history',
			messages: this.emotes.getHistory()
		});
		this.sendTo(playerId, this.rolls.snapshot(Date.now()));
		this.sendTo(playerId, this.cars.snapshot(Date.now()));
	}

	onPlayerLeave(player: Player, reason: LeaveReason): void {
		this.lastPositionAt.delete(player.id);
		this.emotes.clearRateLimit(player.id);
		this.cars.onPlayerLeave(player.id, reason === 'disconnect' ? 'disconnect' : 'lobby');
		this.rolls.onPlayerLeave(player.id);

		const removed = this.presence.remove(player.id);

		this.broadcastPresence();

		if (removed) {
			this.log.info('player left lobby', { playerId: player.id, reason });
		}
	}

	onGameMessage(message: GameMessage<LobbyProtocol>): void {
		const sender = message.sender;
		const parsed = parseClientMessage(message.payload as unknown);

		if (!parsed.ok) {
			this.sendTo(sender.id, { type: 'error', code: parsed.code, message: parsed.message });
			return;
		}

		const now = Date.now();
		const self = this.presence.get(sender.id) ?? this.presence.ensure(sender.id, sender.username);

		switch (parsed.message.type) {
			case 'ping':
				this.sendTo(sender.id, { type: 'pong', at: now });
				return;

			case 'sync':
				this.sendWelcome(sender.id, self);
				return;

			case 'emote': {
				const result = this.emotes.onInput(
					{
						playerId: sender.id,
						playerName: self.name,
						text: parsed.message.text
					},
					now
				);

				if (!result.ok) {
					this.sendTo(sender.id, {
						type: 'error',
						code: result.code,
						message: result.message
					});
				}

				return;
			}

			case 'set-lobby': {
				// Presence only. Joining the actual crypt/race room is the client's
				// job (`joinOrCreateRoom('crypt')`), and those rooms enforce their
				// own membership, so a lie here is cosmetic.
				const previous = self.lobbyId;

				this.presence.setLobby(sender.id, parsed.message.lobbyId);

				// A car only exists on the outdoor map: entering a mini lobby
				// releases it at its last position.
				// (old backend: `carsOnPlayerLeave(player.id, 'lobby')`)
				if (previous === 'global' && parsed.message.lobbyId !== 'global') {
					this.cars.onPlayerLeave(sender.id, 'lobby');
				}

				this.broadcastPresence();
				return;
			}

			case 'throw-roll': {
				// Only rolls from the player's real scene are accepted: it stops
				// someone flooding the crypt from outside (or vice versa).
				const scene = self.lobbyId === 'minigame-2' ? 'crypt' : 'map';

				if (parsed.message.scene !== scene) {
					return;
				}

				this.rolls.onThrow(sender.id, parsed.message, now);
				return;
			}

			case 'player-animation': {
				const payload: LobbyServer = {
					type: 'player-animation',
					playerId: sender.id,
					animation: parsed.message.animation as HeroAnimation,
					at: now
				};

				this.broadcast(payload);
				return;
			}

			case 'player-skin': {
				// Presence is the shared roster: every client already listens to
				// it, so a skin change reaches the outdoor map and the crypt.
				const updated = this.presence.setSkin(sender.id, parsed.message.skin);

				if (updated) {
					this.broadcastPresence();
				}

				return;
			}

			case 'player-nft-equip': {
				const updated = this.presence.setNftEquip(
					sender.id,
					parsed.message.crown,
					parsed.message.ride,
					parsed.message.weaponVariant
				);

				if (updated) {
					this.broadcastPresence();
				}

				return;
			}

			case 'player-position': {
				if (self.lobbyId !== 'global') {
					return;
				}

				const { x, y, z, yaw } = parsed.message;

				if ([x, y, z, yaw].some((value) => Math.abs(value) > MAX_POSITION_COORD)) {
					return;
				}

				const last = this.lastPositionAt.get(sender.id) ?? 0;

				if (now - last < POSITION_MIN_INTERVAL_MS) {
					return;
				}

				this.lastPositionAt.set(sender.id, now);
				this.cars.onPlayerPosition(sender.id, x, y, z, now);

				this.broadcast({
					type: 'player-position',
					playerId: sender.id,
					position: { x, y, z, yaw },
					at: now
				});
				return;
			}

			case 'enter-car': {
				this.cars.onEnter(self, parsed.message.carId, now);

				const car = this.cars.getCar(parsed.message.carId);

				this.log.info('enter-car', {
					playerId: sender.id,
					carId: parsed.message.carId,
					lobbyId: self.lobbyId,
					status: car?.status ?? 'missing',
					driverId: car?.driverId ?? null
				});
				return;
			}

			case 'exit-car':
				this.cars.onExit(sender.id, parsed.message.carId, now);
				return;

			case 'car-state': {
				if (self.lobbyId !== 'global') {
					this.sendTo(sender.id, {
						type: 'error',
						code: 'NOT_IN_GLOBAL',
						message: 'You can only drive on the outdoor map'
					});
					return;
				}

				this.cars.onState(sender.id, parsed.message.carId, parsed.message, now);
				return;
			}

			case 'car-impact': {
				if (self.lobbyId !== 'global') {
					this.sendTo(sender.id, {
						type: 'error',
						code: 'NOT_IN_GLOBAL',
						message: 'You can only drive on the outdoor map'
					});
					return;
				}

				this.cars.onImpact(
					sender.id,
					parsed.message.carId,
					parsed.message.impactSpeed,
					parsed.message.cause,
					now
				);
				return;
			}
		}
	}

	onDispose(): void {
		this.clock.clear('cars');
		this.clock.clear('rolls');
		this.lastPositionAt.clear();
		this.log.info('lobby room disposed', { roomId: this.roomId });
	}

	private broadcastPresence(): void {
		const presence: PresenceSnapshot = this.presence.buildSnapshot();

		this.broadcast({ type: 'presence', presence });
	}
}
