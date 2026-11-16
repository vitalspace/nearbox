import {
	GameRoom,
	type GameMessage,
	type LeaveReason,
	type Player
} from '@series-inc/rundot-game-sdk/mp-server';
import { ByteBudget } from '../budget';
import { Royale } from '../engines/royale';
import type { RoomPort } from '../port';
import type { ClientMessage, ServerMessage } from '../protocol';
import { DEFAULT_SKIN } from '../protocol';
import { parseClientMessage } from '../validate';

/**
 * `royale` — minigame-8 (Skyfall Royale).
 *
 * Battle royale sin equipos ni respawn en `islas-ciudad`. Los bots son
 * participantes virtuales del servidor: no ocupan plazas ni abren WebSocket.
 */

type RoyaleServer = Extract<
	ServerMessage,
	{
		type:
			'mg8-state' | 'mg8-positions' | 'mg8-event' | 'mg8-correct' | 'error' | 'go-lobby' | 'pong';
	}
>;

type RoyaleClient = Extract<
	ClientMessage,
	{
		type:
			'ping' | 'mg8-position' | 'mg8-jump' | 'mg8-shoot' | 'mg8-throw' | 'mg8-reload' | 'mg8-equip';
	}
>;

export type RoyaleProtocol = RoyaleServer | RoyaleClient;

export default class RoyaleRoom extends GameRoom<RoyaleProtocol> {
	private port!: RoomPort;
	private budget!: ByteBudget;
	private royale!: Royale;
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
				this.broadcast(message as RoyaleProtocol);
			},
			sendTo: (playerId, message) => this.sendTo(playerId, message as RoyaleProtocol)
		};

		this.royale = new Royale(this.port, {
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

		this.clock.setInterval('tick', () => this.royale.tick(Date.now()), 100);
		this.log.info('royale room created', { roomId: this.roomId });
	}

	onPlayerJoin(player: Player): void {
		const result = this.royale.onEnter(player.id, player.username, Date.now(), DEFAULT_SKIN);

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

		this.log.info('player entered royale', { playerId: player.id, name: player.username });
	}

	onPlayerLeave(player: Player, reason: LeaveReason): void {
		this.royale.onLeave(player.id, Date.now());

		if (reason === 'disconnect') {
			this.log.info('player dropped in royale', { playerId: player.id });
		}
	}

	onGameMessage(message: GameMessage<RoyaleProtocol>): void {
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

			case 'mg8-position':
				this.royale.onPosition(
					sender.id,
					parsed.message.x,
					parsed.message.y,
					parsed.message.z,
					parsed.message.yaw,
					parsed.message.mode,
					parsed.message.vy,
					now
				);
				return;

			case 'mg8-jump':
				this.royale.onJump(sender.id, now);
				return;

			case 'mg8-shoot':
				this.royale.onShoot(
					sender.id,
					parsed.message.weapon,
					{ x: parsed.message.ox, y: parsed.message.oy, z: parsed.message.oz },
					{ x: parsed.message.dx, y: parsed.message.dy, z: parsed.message.dz },
					parsed.message.targetId,
					now
				);
				return;

			case 'mg8-throw':
				this.royale.onThrow(
					sender.id,
					{ x: parsed.message.gx, y: parsed.message.gy, z: parsed.message.gz },
					{ x: parsed.message.dx, y: parsed.message.dy, z: parsed.message.dz },
					parsed.message.tx,
					parsed.message.tz,
					now
				);
				return;

			case 'mg8-reload':
				this.royale.onReload(sender.id, now);
				return;

			case 'mg8-equip':
				this.royale.onEquip(sender.id, parsed.message.slot);
				return;

			case 'mg8-vehicle-enter':
				this.royale.onVehicleEnter(sender.id, parsed.message.vehicleId, now);
				return;

			case 'mg8-vehicle-exit':
				this.royale.onVehicleExit(sender.id, now);
				return;

			case 'mg8-vehicle-state':
				this.royale.onVehicleState(
					sender.id,
					parsed.message.vehicleId,
					{
						x: parsed.message.x,
						y: parsed.message.y,
						z: parsed.message.z,
						qx: parsed.message.qx,
						qy: parsed.message.qy,
						qz: parsed.message.qz,
						qw: parsed.message.qw,
						vx: parsed.message.vx,
						vy: parsed.message.vy,
						vz: parsed.message.vz,
						speed: parsed.message.speed,
						steering: parsed.message.steering
					},
					now
				);
				return;
		}
	}

	onDispose(): void {
		this.clock.clear('tick');
		this.log.info('royale room disposed', { roomId: this.roomId });
	}
}
