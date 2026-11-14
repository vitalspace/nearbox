import {
	GameRoom,
	type GameMessage,
	type LeaveReason,
	type Player
} from '@series-inc/rundot-game-sdk/mp-server';
import { ByteBudget } from '../budget';
import { Deathmatch } from '../engines/deathmatch';
import type { RoomPort } from '../port';
import type { ClientMessage, ServerMessage } from '../protocol';
import { parseClientMessage } from '../validate';

/**
 * `deathmatch` — minigame-6 (Witch House Deathmatch).
 *
 * El jugador entra por el checkpoint de la casa de la bruja y sale al acabar
 * la partida o al caminar fuera. La lobby room sigue trackeando `lobbyId`.
 *
 * Hasta 12 jugadores (6 vs 6), 6 minutos, autoritativo del servidor.
 */

type DeathmatchServer = Extract<
	ServerMessage,
	{ type: 'mg6-state' | 'mg6-positions' | 'mg6-event' | 'error' | 'go-lobby' | 'pong' }
>;

type DeathmatchClient = Extract<
	ClientMessage,
	{
		type: 'ping' | 'mg6-position' | 'mg6-shoot' | 'mg6-throw' | 'mg6-reload' | 'mg6-equip';
	}
>;

export type DeathmatchProtocol = DeathmatchServer | DeathmatchClient;

export default class DeathmatchRoom extends GameRoom<DeathmatchProtocol> {
	private port!: RoomPort;
	private budget!: ByteBudget;
	private deathmatch!: Deathmatch;
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
				this.broadcast(message as DeathmatchProtocol);
			},
			sendTo: (playerId, message) => this.sendTo(playerId, message as DeathmatchProtocol)
		};

		this.deathmatch = new Deathmatch(this.port, {
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

		this.clock.setInterval('tick', () => this.deathmatch.tick(Date.now()), 100);
		this.log.info('deathmatch room created', { roomId: this.roomId });
	}

	onPlayerJoin(player: Player): void {
		const result = this.deathmatch.onEnter(player.id, player.username, Date.now());

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

		this.log.info('player entered deathmatch', { playerId: player.id, name: player.username });
	}

	onPlayerLeave(player: Player, reason: LeaveReason): void {
		this.deathmatch.onLeave(player.id, Date.now());

		if (reason === 'disconnect') {
			this.log.info('player dropped in deathmatch', { playerId: player.id });
		}
	}

	onGameMessage(message: GameMessage<DeathmatchProtocol>): void {
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

			case 'mg6-position':
				this.deathmatch.onPosition(
					sender.id,
					parsed.message.x,
					parsed.message.y,
					parsed.message.z,
					parsed.message.yaw,
					now
				);
				return;

			case 'mg6-shoot':
				this.deathmatch.onShoot(
					sender.id,
					parsed.message.weapon,
					{ x: parsed.message.ox, y: parsed.message.oy, z: parsed.message.oz },
					{ x: parsed.message.dx, y: parsed.message.dy, z: parsed.message.dz },
					parsed.message.targetId,
					now
				);
				return;

			case 'mg6-throw':
				this.deathmatch.onThrow(
					sender.id,
					{ x: parsed.message.gx, y: parsed.message.gy, z: parsed.message.gz },
					{ x: parsed.message.dx, y: parsed.message.dy, z: parsed.message.dz },
					parsed.message.tx,
					parsed.message.tz,
					now
				);
				return;

			case 'mg6-reload':
				this.deathmatch.onReload(sender.id, now);
				return;

			case 'mg6-equip':
				this.deathmatch.onEquip(sender.id, parsed.message.slot);
				return;
		}
	}

	onDispose(): void {
		this.clock.clear('tick');
		this.log.info('deathmatch room disposed', { roomId: this.roomId });
	}
}
