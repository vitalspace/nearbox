import {
	GameRoom,
	type GameMessage,
	type LeaveReason,
	type Player
} from '@series-inc/rundot-game-sdk/mp-server';
import { ByteBudget } from '../budget';
import { Crypt } from '../engines/minigame2';
import type { RoomPort } from '../port';
import type { ClientMessage, ServerMessage } from '../protocol';
import { parseClientMessage } from '../validate';

/**
 * `crypt` — minigame-2. Replaces the `lobby:minigame-2` topic.
 *
 * The client joins this room when it walks into the crypt and leaves when it
 * comes back out; the lobby room keeps tracking `lobbyId` for presence.
 */

type CryptServer = Extract<
	ServerMessage,
	{ type: 'mg2-state' | 'mg2-positions' | 'mg2-event' | 'error' | 'go-lobby' | 'pong' }
>;

type CryptClient = Extract<
	ClientMessage,
	{ type: 'ping' | 'mg2-position' | 'mg2-deposit' | 'mg2-mummies' | 'mg2-stun' }
>;

export type CryptProtocol = CryptServer | CryptClient;

export default class CryptRoom extends GameRoom<CryptProtocol> {
	private port!: RoomPort;
	private budget!: ByteBudget;
	private crypt!: Crypt;
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
				this.broadcast(message as CryptProtocol);
			},
			sendTo: (playerId, message) => this.sendTo(playerId, message as CryptProtocol)
		};

		this.crypt = new Crypt(this.port, {
			moveToLobby: (playerId) => {
				// A room cannot move a player to another room: tell the client to
				// leave, and kick it out anyway if it does not act on the message so
				// the room cannot keep a ghost member forever.
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

		this.clock.setInterval('tick', () => this.crypt.tick(Date.now()), 100);
		this.log.info('crypt room created', { roomId: this.roomId });
	}

	onPlayerJoin(player: Player): void {
		this.crypt.onEnter(player.id, player.username);
	}

	onPlayerLeave(player: Player, reason: LeaveReason): void {
		this.crypt.onLeave(player.id);

		if (reason === 'disconnect') {
			this.log.info('player dropped in crypt', { playerId: player.id });
		}
	}

	onGameMessage(message: GameMessage<CryptProtocol>): void {
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

			case 'mg2-position':
				this.crypt.onPosition(
					sender.id,
					parsed.message.x,
					parsed.message.y,
					parsed.message.z,
					parsed.message.yaw,
					now
				);
				return;

			case 'mg2-deposit':
				this.crypt.onDeposit(sender.id, now);
				return;

			case 'mg2-mummies':
				this.crypt.onMummiesReport(sender.id, parsed.message.mummies, now);
				return;

			case 'mg2-stun':
				this.crypt.onStun(sender.id, parsed.message.mummyId, now);
				return;
		}
	}

	onDispose(): void {
		this.clock.clear('tick');
		this.log.info('crypt room disposed', { roomId: this.roomId });
	}
}
