import {
	GameRoom,
	type GameMessage,
	type LeaveReason,
	type Player
} from '@series-inc/rundot-game-sdk/mp-server';
import { ByteBudget } from '../budget';
import { Race } from '../engines/race';
import { trackForRoomType } from '../engines/raceTracks';
import type { RoomPort } from '../port';
import { DEFAULT_SKIN, type ClientMessage, type ServerMessage } from '../protocol';
import { parseClientMessage } from '../validate';

/**
 * `race` — minigame-3, the Grand Prix. Replaces the `lobby:minigame-3` topic.
 *
 * The old backend published `race-positions` to every subscriber of the race
 * topic. Here the room *is* the topic, so each frame goes only to the pilots.
 *
 * Frame budget: the room WS frame is capped at 16 KiB. A full
 * `race-positions` frame for 6 pilots is roughly 1.5 KiB, so the 10 Hz
 * broadcast fits with room to spare; `race-state` (1 Hz) stays under 4 KiB.
 */

type RaceServer = Extract<
	ServerMessage,
	{ type: 'race-state' | 'race-positions' | 'race-event' | 'error' | 'go-lobby' | 'pong' }
>;

type RaceClient = Extract<
	ClientMessage,
	{ type: 'ping' | 'race-car-state' | 'race-use-item' | 'race-reset' | 'race-impact' }
>;

export type RaceProtocol = RaceServer | RaceClient;

export default class RaceRoom extends GameRoom<RaceProtocol> {
	private port!: RoomPort;
	private budget!: ByteBudget;
	private race!: Race;
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
				this.broadcast(message as RaceProtocol);
			},
			sendTo: (playerId, message) => this.sendTo(playerId, message as RaceProtocol)
		};

		this.race = new Race(
			this.port,
			{
				log: (event, data) => this.log.info(event, data),
				moveToLobby: (playerId) => {
					// Rooms cannot move players: the client leaves on this message, and
					// it is kicked out if it does not, so the room never keeps a ghost
					// member after the results screen.
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
			},
			trackForRoomType(this.roomType)
		);

		this.clock.setInterval('tick', () => this.race.tick(Date.now()), 100);
		this.log.info('race room created', { roomId: this.roomId, roomType: this.roomType });
	}

	onPlayerJoin(player: Player): void {
		const check = this.race.canEnter(player.id);

		this.log.info('race join request', {
			playerId: player.id,
			username: player.username,
			allowed: check.ok,
			reason: check.ok ? null : check.code
		});

		if (!check.ok) {
			this.reject({ reason: check.message });
			return;
		}

		// The engine works with the wire `Player` (it carries `lobbyId`); the room
		// only knows the platform player.
		this.race.onEnter({
			id: player.id,
			name: player.username,
			skin: DEFAULT_SKIN,
			crown: false,
			ride: null,
			weaponVariant: null,
			connectedAt: player.joinedAt,
			lobbyId: 'global'
		});
	}

	onPlayerLeave(player: Player, reason: LeaveReason): void {
		this.race.onLeave(player.id);

		this.log.info('race pilot left', { playerId: player.id, reason });
		if (reason === 'disconnect') {
			this.log.info('pilot dropped in race', { playerId: player.id });
		}
	}

	onGameMessage(message: GameMessage<RaceProtocol>): void {
		const sender = message.sender;
		const parsed = parseClientMessage(message.payload as unknown);

		if (!parsed.ok) {
			this.log.warn('race message rejected', {
				playerId: sender.id,
				code: parsed.code,
				message: parsed.message
			});
			this.sendTo(sender.id, { type: 'error', code: parsed.code, message: parsed.message });
			return;
		}

		const now = Date.now();

		switch (parsed.message.type) {
			case 'ping':
				this.sendTo(sender.id, { type: 'pong', at: now });
				return;

			case 'race-car-state':
				this.race.onCarState(sender.id, parsed.message, now);
				return;

			case 'race-use-item':
				this.race.onUseItem(sender.id, now);
				return;

			case 'race-reset':
				this.race.onReset(sender.id, now);
				return;

			case 'race-impact':
				this.race.onImpact(sender.id, parsed.message.impactSpeed, parsed.message.cause, now);
				return;
		}
	}

	onDispose(): void {
		this.clock.clear('tick');
		this.log.info('race room disposed', { roomId: this.roomId });
	}
}
