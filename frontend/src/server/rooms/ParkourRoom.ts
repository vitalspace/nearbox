import {
	GameRoom,
	type GameMessage,
	type LeaveReason,
	type Player
} from '@series-inc/rundot-game-sdk/mp-server';
import { ByteBudget } from '../budget';
import { Parkour } from '../engines/parkour';
import type { RoomPort } from '../port';
import type { ClientMessage, ServerMessage } from '../protocol';
import { parseClientMessage } from '../validate';

/**
 * `parkour` — minigame-7 (Parkour Spire).
 *
 * El jugador entra por el checkpoint de la plaza central y sale al acabar la
 * carrera o al abandonar la torre. Hasta 12 jugadores, autoritativo del
 * servidor: fases, checkpoints, caídas, respawns, guardianes y resultados.
 */

type ParkourServer = Extract<
	ServerMessage,
	{ type: 'mg7-state' | 'mg7-positions' | 'mg7-event' | 'error' | 'go-lobby' | 'pong' }
>;

type ParkourClient = Extract<ClientMessage, { type: 'ping' | 'mg7-position' }>;

export type ParkourProtocol = ParkourServer | ParkourClient;

export default class ParkourRoom extends GameRoom<ParkourProtocol> {
	private port!: RoomPort;
	private budget!: ByteBudget;
	private parkour!: Parkour;
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
				this.broadcast(message as ParkourProtocol);
			},
			sendTo: (playerId, message) => this.sendTo(playerId, message as ParkourProtocol)
		};

		this.parkour = new Parkour(this.port, {
			moveToLobby: (playerId) => {
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

		this.clock.setInterval('tick', () => this.parkour.tick(Date.now()), 100);
		this.log.info('parkour room created', { roomId: this.roomId });
	}

	onPlayerJoin(player: Player): void {
		const result = this.parkour.onEnter(player.id, player.username, Date.now());

		if (!result.ok) {
			this.sendTo(player.id, {
				type: 'error',
				code: result.code,
				message: result.message
			});
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

		this.log.info('player entered parkour', { playerId: player.id, name: player.username });
	}

	onPlayerLeave(player: Player, reason: LeaveReason): void {
		this.parkour.onLeave(player.id, Date.now());

		if (reason === 'disconnect') {
			this.log.info('player dropped in parkour', { playerId: player.id });
		}
	}

	onGameMessage(message: GameMessage<ParkourProtocol>): void {
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

			case 'mg7-position':
				this.parkour.onPosition(
					sender.id,
					parsed.message.x,
					parsed.message.y,
					parsed.message.z,
					parsed.message.yaw,
					now
				);
				return;
		}
	}

	onDispose(): void {
		this.clock.clear('tick');
		this.log.info('parkour room disposed', { roomId: this.roomId });
	}
}
