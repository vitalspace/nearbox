import { DEFAULT_SKIN, type SkinId } from '../../lib/cosmetics/skinIds';
import {
	LOBBY_DEFINITIONS,
	type Lobby,
	type LobbyId,
	type LobbyStatus,
	type Player,
	type PresenceSnapshot
} from '../protocol';

/**
 * Presence of the outdoor hub.
 *
 * Old `backend/src/ws/presence.ts` held a module-level `Map`. Here it is a class
 * so each room instance owns its own roster (the platform may run more than one
 * room of the same type in the same worker).
 *
 * `lobbyId` is who the player *says* they are with: the room does not enforce
 * it. Enforcement lives in the crypt/race rooms themselves, which only accept
 * actions from their own members.
 */
export class Presence {
	private readonly players = new Map<string, Player>();

	private static copy(player: Player): Player {
		return { ...player };
	}

	private static sortByConnection(players: Player[]): Player[] {
		return players.sort((a, b) => a.connectedAt - b.connectedAt);
	}

	add(id: string, name: string, connectedAt = Date.now(), skin: SkinId = DEFAULT_SKIN): Player {
		const player: Player = { id, name, skin, connectedAt, lobbyId: 'global' };

		this.players.set(id, player);

		return Presence.copy(player);
	}

	/** Adds the player only when they are new; keeps their previous lobby. */
	ensure(id: string, name: string, connectedAt = Date.now()): Player {
		const existing = this.players.get(id);

		if (existing) {
			existing.name = name;

			return Presence.copy(existing);
		}

		return this.add(id, name, connectedAt);
	}

	remove(id: string): Player | undefined {
		const player = this.players.get(id);

		if (!player) {
			return undefined;
		}

		this.players.delete(id);

		return Presence.copy(player);
	}

	get(id: string): Player | undefined {
		const player = this.players.get(id);

		return player ? Presence.copy(player) : undefined;
	}

	setLobby(id: string, lobbyId: LobbyId): Player | undefined {
		const player = this.players.get(id);

		if (!player) {
			return undefined;
		}

		player.lobbyId = lobbyId;

		return Presence.copy(player);
	}

	rename(id: string, name: string): Player | undefined {
		const player = this.players.get(id);

		if (!player) {
			return undefined;
		}

		player.name = name;

		return Presence.copy(player);
	}

	setSkin(id: string, skin: SkinId): Player | undefined {
		const player = this.players.get(id);

		if (!player) {
			return undefined;
		}

		player.skin = skin;

		return Presence.copy(player);
	}

	size(): number {
		return this.players.size;
	}

	listGlobal(): Player[] {
		return Presence.sortByConnection([...this.players.values()].map(Presence.copy));
	}

	listLobby(lobbyId: LobbyId): Player[] {
		return this.listGlobal().filter((player) => player.lobbyId === lobbyId);
	}

	buildSnapshot(statusFor?: (lobbyId: LobbyId) => LobbyStatus | undefined): PresenceSnapshot {
		const globalPlayers = this.listGlobal();

		const lobbies: Lobby[] = LOBBY_DEFINITIONS.map((definition) => {
			const status = statusFor?.(definition.id);

			return {
				...definition,
				players:
					definition.id === 'global'
						? globalPlayers.map(Presence.copy)
						: globalPlayers.filter((player) => player.lobbyId === definition.id).map(Presence.copy),
				...(status ? { status } : {})
			};
		});

		return { total: globalPlayers.length, lobbies };
	}

	clear(): void {
		this.players.clear();
	}
}
