import {
	LOBBY_DEFINITIONS,
	type Lobby,
	type LobbyId,
	type Player,
	type PresenceSnapshot
} from './protocol';

const players = new Map<string, Player>();

function copyPlayer(player: Player): Player {
	return { ...player };
}

function sortByConnection(players: Player[]): Player[] {
	return players.sort((a, b) => a.connectedAt - b.connectedAt);
}

export function addPlayer(id: string, name: string, connectedAt = Date.now()): Player {
	const player: Player = {
		id,
		name,
		connectedAt,
		lobbyId: 'global'
	};

	players.set(id, player);

	return copyPlayer(player);
}

export function removePlayer(id: string): Player | undefined {
	const player = players.get(id);

	if (!player) {
		return undefined;
	}

	players.delete(id);

	return copyPlayer(player);
}

export function getPlayer(id: string): Player | undefined {
	const player = players.get(id);

	return player ? copyPlayer(player) : undefined;
}

export function setLobby(id: string, lobbyId: LobbyId): Player | undefined {
	const player = players.get(id);

	if (!player) {
		return undefined;
	}

	player.lobbyId = lobbyId;

	return copyPlayer(player);
}

export function updateName(id: string, name: string): Player | undefined {
	const player = players.get(id);

	if (!player) {
		return undefined;
	}

	player.name = name;

	return copyPlayer(player);
}

export function listGlobal(): Player[] {
	return sortByConnection([...players.values()].map(copyPlayer));
}

export function listLobby(lobbyId: LobbyId): Player[] {
	return listGlobal().filter((player) => player.lobbyId === lobbyId);
}

export function buildSnapshot(): PresenceSnapshot {
	const globalPlayers = listGlobal();

	const lobbies: Lobby[] = LOBBY_DEFINITIONS.map((definition) => ({
		...definition,
		players:
			definition.id === 'global'
				? globalPlayers.map(copyPlayer)
				: globalPlayers.filter((player) => player.lobbyId === definition.id).map(copyPlayer)
	}));

	return {
		total: globalPlayers.length,
		lobbies
	};
}
