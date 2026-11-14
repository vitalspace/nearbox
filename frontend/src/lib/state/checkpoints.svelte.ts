import type { MinigameLobbyId } from '../services/protocol';

export type CheckpointDefinition = {
	id: MinigameLobbyId;
	name: string;
	/** Large 3D sign floating above the checkpoint. Upper case reads better in
	 * the extruded font (helvetiker has no accented glyphs). */
	label: string;
	position: [number, number, number];
	color: string;
	radius: number;
};

export const CHECKPOINTS: readonly CheckpointDefinition[] = [
	{
		id: 'minigame-2',
		name: 'Mausoleum Crypt',
		label: 'MAUSOLEUM CRYPT',
		position: [21.48, 0.3, 35.5],
		color: '#f59e0b',
		radius: 2
	},
	{
		id: 'minigame-3',
		name: 'Grand Prix',
		label: 'GRAND PRIX TWN',
		position: [83.0, 0.06, -3.0],
		color: '#ef4444',
		radius: 2
	},
	{
		id: 'minigame-5',
		name: 'Barn Siege',
		label: 'BARN SIEGE',
		position: [-41.6, 0.4, 32.6],
		color: '#f97316',
		radius: 2
	},
	{
		id: 'minigame-6',
		name: 'Witch House Deathmatch',
		label: 'WITCH HOUSE DEATHMATCH',
		position: [-33.01, 0.4, -22.9],
		color: '#a855f7',
		radius: 2
	},
	{
		id: 'minigame-7',
		name: 'Parkour Spire',
		label: 'PARKOUR SPIRE',
		position: [33.0, 0.4, -23.9],
		color: '#eab308',
		radius: 2
	},
	{
		id: 'minigame-8',
		name: 'Skyfall Royale',
		label: 'SKYFALL ROYALE',
		position: [60.0, 0.4, 60.0],
		color: '#38bdf8',
		radius: 2.2
	}
];

class CheckpointStore {
	activeCheckpointId = $state<MinigameLobbyId | null>(null);

	trackSelectOpen = $state<boolean>(false);

	get active(): CheckpointDefinition | null {
		if (!this.activeCheckpointId) {
			return null;
		}

		return CHECKPOINTS.find((checkpoint) => checkpoint.id === this.activeCheckpointId) ?? null;
	}

	enter(id: MinigameLobbyId): void {
		this.activeCheckpointId = id;
	}

	exit(id: MinigameLobbyId): void {
		if (this.activeCheckpointId === id) {
			this.activeCheckpointId = null;
		}
	}

	openTrackSelect(): void {
		this.trackSelectOpen = true;
	}

	closeTrackSelect(): void {
		this.trackSelectOpen = false;
	}

	/** Clears the prompt when changing lobbies (the sensor stays inside the crypt). */
	clear(): void {
		this.activeCheckpointId = null;
	}
}

export const checkpoints = new CheckpointStore();
