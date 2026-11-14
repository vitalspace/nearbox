import type { NpcDialogueId } from './npcDialogues';
import type { NpcRouteId } from './npcRoutes';

export type NpcId =
	'alba' | 'bruno' | 'carmen' | 'mateo' | 'lucia' | 'tomas' | 'vera' | 'rosa' | 'elias';

export type NpcDefinition = {
	id: NpcId;
	/** GLB file in `static/`. The component resolves it with `asset()`. */
	model: string;
	name: string;
	role: string;
	routeId: NpcRouteId;
	dialogueId: NpcDialogueId;
	/** Normalized model height in meters (feet at y = 0). */
	height: number;
	/** Name-tag tint. */
	color: string;
	/** Walk speed in m/s. Kept between 1.0 and 1.4. */
	speed: number;
	/** Radial offset from the route waypoints (shared circular routes). */
	lane: number;
	/** Waypoint where the agent starts, to spread the initial phases. */
	startIndex: number;
	/** Visits this NPC stops at. Omitted means every route visit. */
	visits?: readonly string[];
	/** Visit id where the agent sits down and rests (Elías). */
	restAt?: string;
};

export const NPC_DEFINITIONS: readonly NpcDefinition[] = [
	{
		id: 'alba',
		model: 'characters/Heroina.glb',
		name: 'Alba',
		role: 'Florist',
		routeId: 'bosque',
		dialogueId: 'alba',
		height: 2.1,
		color: '#f9a8d4',
		speed: 1.15,
		lane: 0,
		startIndex: 0,
		visits: ['witch-house']
	},
	{
		id: 'bruno',
		model: 'characters/Hombre.glb',
		name: 'Bruno',
		role: 'Baker',
		routeId: 'paseo',
		dialogueId: 'bruno',
		height: 2.15,
		color: '#fcd34d',
		speed: 1.05,
		lane: -1.2,
		startIndex: 0,
		visits: ['diner', 'motel']
	},
	{
		id: 'carmen',
		model: 'characters/Abuela.glb',
		name: 'Carmen',
		role: 'Courier',
		routeId: 'centro',
		dialogueId: 'carmen',
		height: 1.95,
		color: '#fdba74',
		speed: 1.0,
		lane: 0,
		startIndex: 2,
		visits: ['tree-north']
	},
	{
		id: 'mateo',
		model: 'characters/NPC_Joven.glb',
		name: 'Mateo',
		role: 'Messenger',
		routeId: 'centro',
		dialogueId: 'mateo',
		height: 2.05,
		color: '#93c5fd',
		speed: 1.25,
		lane: -1.2,
		startIndex: 6,
		visits: ['tree-south']
	},
	{
		id: 'lucia',
		model: 'characters/NPC_Jovena.glb',
		name: 'Lucía',
		role: 'Neighbor',
		routeId: 'paseo',
		dialogueId: 'lucia',
		height: 2.0,
		color: '#c4b5fd',
		speed: 1.1,
		lane: -0.6,
		startIndex: 5,
		visits: ['grandstand', 'gas-b']
	},
	{
		id: 'tomas',
		model: 'characters/Hombre2.glb',
		name: 'Tomás',
		role: 'Mechanic',
		routeId: 'paseo',
		dialogueId: 'tomas',
		height: 2.12,
		color: '#86efac',
		speed: 1.2,
		lane: 0,
		startIndex: 10,
		visits: ['garage', 'gas-a']
	},
	{
		id: 'vera',
		model: 'characters/Hero.glb',
		name: 'Vera',
		role: 'Explorer',
		routeId: 'castillo',
		dialogueId: 'vera',
		height: 2.1,
		color: '#67e8f9',
		speed: 1.2,
		lane: 0,
		startIndex: 0,
		visits: ['castle']
	},
	{
		id: 'rosa',
		model: 'characters/NPC_Nina.glb',
		name: 'Rosa',
		role: 'Kid',
		routeId: 'calabaza',
		dialogueId: 'rosa',
		height: 1.55,
		color: '#fda4af',
		speed: 1.3,
		lane: 0,
		startIndex: 0,
		visits: ['barn']
	},
	{
		id: 'elias',
		model: 'characters/Abuelo.glb',
		name: 'Elías',
		role: 'Caretaker',
		routeId: 'cementerio',
		dialogueId: 'elias',
		height: 2.0,
		color: '#d6d3d1',
		speed: 1.0,
		lane: 0,
		startIndex: 0,
		visits: ['mausoleum'],
		restAt: 'mausoleum'
	}
];

export const NPC_BY_ID: ReadonlyMap<NpcId, NpcDefinition> = new Map(
	NPC_DEFINITIONS.map((definition) => [definition.id, definition])
);

/** Distance at which the interaction prompt appears. */
export const NPC_INTERACT_RADIUS = 2.6;
/** The dialogue closes when the player walks away this far. */
export const NPC_DIALOG_MAX_DISTANCE = 4.5;
/** Name tags are hidden beyond this distance. */
export const NPC_NAME_TAG_RADIUS = 18;
/** Proximity scan frequency. */
export const NPC_DETECTION_INTERVAL_MS = 100;
/** Ground raycast frequency per NPC. */
export const NPC_GROUND_INTERVAL_MS = 500;
/** NPCs beyond this distance are not drawn. */
export const NPC_RENDER_RADIUS = 90;
/** Only close NPCs cast shadows. */
export const NPC_SHADOW_RADIUS = 25;
/** Ambient greeting trigger radius. */
export const NPC_GREETING_RADIUS = 5;
/** Minimum time between two ambient greetings from the same NPC. */
export const NPC_GREETING_COOLDOWN_MS = 45_000;
