import {
	GameRoom,
	type GameMessage,
	type LeaveReason,
	type Player
} from '@series-inc/rundot-game-sdk/mp-server';
import { ByteBudget } from '../budget';
import { Waves } from '../engines/waves';
import type { RoomPort } from '../port';
import type { ClientMessage, ServerMessage } from '../protocol';
import { parseClientMessage } from '../validate';

/**
 * `waves` — minigame-5 (Barn Siege).
 *
 * The player joins this room when it enters the checkpoint by the barn and
 * leaves when the match ends (victory/defeat) or when they walk out; the
 * lobby room keeps tracking `lobbyId` for presence.
 *
 * Up to 12 survivors, 8 waves, server-authoritative.
 */

type WavesServer = Extract<
	ServerMessage,
	{ type: 'mg5-state' | 'mg5-positions' | 'mg5-event' | 'error' | 'go-lobby' | 'pong' }
>;

type WavesClient = Extract<
	ClientMessage,
	{
		type:
			| 'ping'
			| 'mg5-position'
			| 'mg5-shoot'
			| 'mg5-throw'
			| 'mg5-car-enter'
			| 'mg5-car-exit'
			| 'mg5-car-state'
			| 'mg5-reload'
			| 'mg5-equip';
	}
>;

export type WavesProtocol = WavesServer | WavesClient;

export default class WavesRoom extends GameRoom<WavesProtocol> {
	private port!: RoomPort;
	private budget!: ByteBudget;
	private waves!: Waves;
	private ready = false;

	onCreate(): void {
		this.initialize();
	}

	/** Restored rooms skip `onCreate`; initialize here too. */
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
				this.broadcast(message as WavesProtocol);
			},
			sendTo: (playerId, message) => this.sendTo(playerId, message as WavesProtocol)
		};

		this.waves = new Waves(this.port, {
			moveToLobby: (playerId) => {
				// A room cannot move a player to another room: tell the client to
				// leave, and kick it out anyway if it does not act on the message
				// so the room cannot keep a ghost member forever.
				this.sendTo(playerId, {
					type: 'go-lobby',
					lobbyId: 'global',
					reason: 'round-ended'
				});

				this.clock.setTimeout(
					`go-lobby:${playerId}`,
					() => {
						try {
							this.kick(playerId, 'round-ended');
						} catch {
							// Already gone: the client left on its own.
						}
					},
					1_500
				);
			}
		});

		this.clock.setInterval('tick', () => this.waves.tick(Date.now()), 100);
		this.log.info('waves room created', { roomId: this.roomId });
	}

	onPlayerJoin(player: Player): void {
		const result = this.waves.onEnter(player.id, player.username);

		if (!result.ok) {
			this.sendTo(player.id, {
				type: 'error',
				code: result.code,
				message: result.message
			});
			// Reject: kick back to the hub so presence does not lie.
			this.sendTo(player.id, { type: 'go-lobby', lobbyId: 'global', reason: 'kicked' });
			this.clock.setTimeout(
				`reject:${player.id}`,
				() => {
					try {
						this.kick(player.id, 'rejected');
					} catch {
						// Already gone.
					}
				},
				1_000
			);
			return;
		}

		this.log.info('player entered waves', { playerId: player.id, name: player.username });
	}

	onPlayerLeave(player: Player, reason: LeaveReason): void {
		this.waves.onLeave(player.id);

		if (reason === 'disconnect') {
			this.log.info('player dropped in waves', { playerId: player.id });
		}
	}

	onGameMessage(message: GameMessage<WavesProtocol>): void {
		const sender = message.sender;
		const parsed = parseClientMessage(message.payload as unknown);

		if (!parsed.ok) {
			this.sendTo(sender.id, { type: 'error', code: parsed.code, message: parsed.message });
			return;
		}

		const now = Date.now();

		switch (parsed.message.type) {
			case 'ping':
				this.sendTo(sender.id, { type: 'pong', at: now });
				return;

			case 'mg5-position':
				this.waves.onPosition(
					sender.id,
					parsed.message.x,
					parsed.message.y,
					parsed.message.z,
					parsed.message.yaw,
					now
				);
				return;

			case 'mg5-shoot':
				this.waves.onShoot(
					sender.id,
					parsed.message.weapon,
					{ x: parsed.message.ox, y: parsed.message.oy, z: parsed.message.oz },
					{ x: parsed.message.dx, y: parsed.message.dy, z: parsed.message.dz },
					parsed.message.targetId,
					now
				);
				return;

			case 'mg5-throw':
				this.waves.onThrow(
					sender.id,
					{ x: parsed.message.gx, y: parsed.message.gy, z: parsed.message.gz },
					{ x: parsed.message.dx, y: parsed.message.dy, z: parsed.message.dz },
					parsed.message.tx,
					parsed.message.tz,
					now
				);
				return;

			case 'mg5-car-enter':
				this.waves.onCarEnter(sender.id, now);
				return;

			case 'mg5-car-exit':
				this.waves.onCarExit(sender.id);
				return;

			case 'mg5-car-state':
				this.waves.onCarState(sender.id, parsed.message);
				return;

			case 'mg5-reload':
				this.waves.onReload(sender.id, now);
				return;

			case 'mg5-equip':
				this.waves.onEquip(sender.id, parsed.message.slot);
				return;
		}
	}

	onDispose(): void {
		this.clock.clear('tick');
		this.log.info('waves room disposed', { roomId: this.roomId });
	}
}
