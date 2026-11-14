export type CatZone = 'centro' | 'bosque' | 'castillo' | 'calabazar' | 'cementerio';

export type CatDefinition = {
	id: string;
	name: string;
	zone: CatZone;
	position: { x: number; y: number; z: number };
};

export type MissionDefinition = {
	id: 'cats-25';
	title: string;
	description: string;
	target: number;
	catIds: string[];
};

export const CAT_ZONE_ORDER: readonly CatZone[] = [
	'centro',
	'bosque',
	'castillo',
	'calabazar',
	'cementerio'
];

export const CAT_ZONES: Record<CatZone, { label: string; description: string }> = {
	centro: {
		label: 'Central Clearing',
		description: 'Around the big tree and the checkpoints.'
	},
	bosque: {
		label: "Witch's Forest",
		description: 'Path and graveyard next to the house.'
	},
	castillo: {
		label: "Dracula's Castle",
		description: 'Access road and the castle side grounds.'
	},
	calabazar: {
		label: 'Pumpkin Patch',
		description: 'Fields, road and farm pen.'
	},
	cementerio: {
		label: 'Cursed Cemetery',
		description: 'Road, tombs and mausoleum.'
	}
};

/**
 * Alturas de la superficie jugable del `map.glb`:
 * - El claro central (`Circle`) es una terraza a `y = 0`.
 * - Las cuatro áreas temáticas (`area1`…`area4`) son placas a `y = 0.4`.
 *
 * Las posiciones están elegidas sobre suelo libre: al menos 4 m entre gatos,
 * 4 m de los checkpoints y del spawn, fuera de los colliders de edificios,
 * vallas y del tronco, y también fuera de los coches aparcados y del
 * escenario del baile, dentro de la zona caminable de cada área.
 */
const CAT_Y_CENTER = 0;
const CAT_Y_AREA = 0.4;

export const CATS_25: readonly CatDefinition[] = [
	// Claro central: alrededor del árbol grande y los checkpoints.
	{ id: 'cat-01', name: 'Kitty', zone: 'centro', position: { x: -14, y: CAT_Y_CENTER, z: 6 } },
	{ id: 'cat-02', name: 'Whiskers', zone: 'centro', position: { x: 7, y: CAT_Y_CENTER, z: 2 } },
	{ id: 'cat-03', name: 'Shadow', zone: 'centro', position: { x: -7, y: CAT_Y_CENTER, z: 2 } },
	{ id: 'cat-04', name: 'Sock', zone: 'centro', position: { x: 0, y: CAT_Y_CENTER, z: -10 } },
	{ id: 'cat-05', name: 'Moon', zone: 'centro', position: { x: 6, y: CAT_Y_CENTER, z: -12 } },

	// área 1 (bosque de la bruja): patio, hoguera, cementerio y lindes.
	{ id: 'cat-06', name: 'Ash', zone: 'bosque', position: { x: -33, y: CAT_Y_AREA, z: -22 } },
	{ id: 'cat-07', name: 'Berry', zone: 'bosque', position: { x: -30, y: CAT_Y_AREA, z: -12 } },
	{ id: 'cat-08', name: 'Spell', zone: 'bosque', position: { x: -22, y: CAT_Y_AREA, z: -50 } },
	{ id: 'cat-09', name: 'Nightshade', zone: 'bosque', position: { x: -50, y: CAT_Y_AREA, z: -25 } },
	{ id: 'cat-10', name: 'Moss', zone: 'bosque', position: { x: -43.5, y: CAT_Y_AREA, z: -49 } },

	// área 2 (castillo): patio de entrada, jardines y lado sur.
	{ id: 'cat-11', name: 'Vlad', zone: 'castillo', position: { x: 33, y: CAT_Y_AREA, z: -14 } },
	{ id: 'cat-12', name: 'Night', zone: 'castillo', position: { x: 20, y: CAT_Y_AREA, z: -22 } },
	{ id: 'cat-13', name: 'Crypt', zone: 'castillo', position: { x: 48, y: CAT_Y_AREA, z: -25 } },
	{ id: 'cat-14', name: 'Batty', zone: 'castillo', position: { x: 33, y: CAT_Y_AREA, z: -52 } },
	{ id: 'cat-15', name: 'Gargoyle', zone: 'castillo', position: { x: 19, y: CAT_Y_AREA, z: -37 } },

	// área 3 (calabazar): camino, campos, corral y tras el granero.
	{ id: 'cat-16', name: 'Pumpkin', zone: 'calabazar', position: { x: -33, y: CAT_Y_AREA, z: 14 } },
	{ id: 'cat-17', name: 'Corn', zone: 'calabazar', position: { x: -40, y: CAT_Y_AREA, z: 19 } },
	{ id: 'cat-18', name: 'Hay', zone: 'calabazar', position: { x: -25, y: CAT_Y_AREA, z: 28 } },
	{ id: 'cat-19', name: 'Seed', zone: 'calabazar', position: { x: -42, y: CAT_Y_AREA, z: 48 } },
	{ id: 'cat-20', name: 'Fright', zone: 'calabazar', position: { x: -20, y: CAT_Y_AREA, z: 50 } },

	// área 4 (cementerio): puerta, tumbas, capilla y mausoleo.
	{ id: 'cat-21', name: 'Bone', zone: 'cementerio', position: { x: 33, y: CAT_Y_AREA, z: 14 } },
	{
		id: 'cat-22',
		name: 'Tombstone',
		zone: 'cementerio',
		position: { x: 20, y: CAT_Y_AREA, z: 20 }
	},
	{ id: 'cat-23', name: 'Candle', zone: 'cementerio', position: { x: 48, y: CAT_Y_AREA, z: 20 } },
	{ id: 'cat-24', name: 'Mist', zone: 'cementerio', position: { x: 33, y: CAT_Y_AREA, z: 47 } },
	{ id: 'cat-25', name: 'Soul', zone: 'cementerio', position: { x: 18, y: CAT_Y_AREA, z: 39 } }
];

export const CAT_BY_ID: ReadonlyMap<string, CatDefinition> = new Map(
	CATS_25.map((cat) => [cat.id, cat])
);

export const CAT_INDEX_BY_ID: ReadonlyMap<string, number> = new Map(
	CATS_25.map((cat, index) => [cat.id, index])
);

export const MISSION_CATS_25: MissionDefinition = {
	id: 'cats-25',
	title: 'The 25 Lost Cats',
	description: 'Find and catch the 25 cats hiding across the map. Press E when you are close.',
	target: CATS_25.length,
	catIds: CATS_25.map((cat) => cat.id)
};

export const CAT_CAPTURE_RADIUS = 2.2;
export const CAT_CAPTURE_HEIGHT = 2.5;
export const CAT_DETECTION_INTERVAL_MS = 100;
