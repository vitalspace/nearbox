/**
 * Server copy of `frontend/src/lib/npcs/npcRoutes.ts`.
 * Keep both files in sync: the backend simulates the same nine NPCs so every
 * player sees them at the same place at the same time.
 */
export type NpcRouteId = 'centro' | 'paseo' | 'bosque' | 'castillo' | 'calabaza' | 'cementerio';

export type NpcWaypoint = {
	x: number;
	z: number;
	/** Pause range in milliseconds when the agent stops here. */
	pause?: [number, number];
	/** Visit id; NPCs only stop when it is listed in their definition. */
	visit?: string;
};

export type NpcRoute = {
	id: NpcRouteId;
	label: string;
	loop: true;
	/** Approximate support height, used until the first ground raycast. */
	groundY: number;
	waypoints: readonly NpcWaypoint[];
};

/**
 * Rutas validadas contra los triángulos verticales de `paredes` y `obstaculos`
 * de `map.glb`. Las coordenadas son `x, z`; la altura real se muestrea con
 * Rapier en tiempo de ejecución.
 */
export const NPC_ROUTES: Record<NpcRouteId, NpcRoute> = {
	centro: {
		id: 'centro',
		label: 'Plaza tree',
		loop: true,
		groundY: 0,
		waypoints: [
			{ x: 14, z: 0 },
			{ x: 9.9, z: 9.9 },
			{ x: 0, z: 14, pause: [3500, 5500], visit: 'tree-north' },
			{ x: -9.9, z: 9.9 },
			{ x: -14, z: 0 },
			{ x: -9.9, z: -9.9 },
			{ x: 0, z: -14, pause: [3500, 5500], visit: 'tree-south' },
			{ x: 9.9, z: -9.9 }
		]
	},
	paseo: {
		id: 'paseo',
		label: 'Plaza promenade',
		loop: true,
		groundY: 0.03,
		waypoints: [
			{ x: 85, z: 0, pause: [4000, 7000], visit: 'grandstand' },
			{ x: 73.61, z: 42.5 },
			{ x: 42.5, z: 73.61 },
			{ x: 0, z: 85, pause: [4000, 7000], visit: 'garage' },
			{ x: -42.5, z: 73.61 },
			{ x: -60.1, z: 60.1, pause: [4000, 7000], visit: 'gas-b' },
			{ x: -73.61, z: 42.5 },
			{ x: -85, z: 0, pause: [5000, 8000], visit: 'motel' },
			{ x: -73.61, z: -42.5 },
			{ x: -60.1, z: -60.1, pause: [4000, 8000], visit: 'diner' },
			{ x: -42.5, z: -73.61 },
			{ x: 0, z: -85 },
			{ x: 42.5, z: -73.61 },
			{ x: 60.1, z: -60.1, pause: [4000, 7000], visit: 'gas-a' },
			{ x: 73.61, z: -42.5 }
		]
	},
	bosque: {
		id: 'bosque',
		label: 'Witch woods',
		loop: true,
		groundY: 0.4,
		waypoints: [
			{ x: -30, z: -12 },
			{ x: -50, z: -25, pause: [4000, 8000], visit: 'witch-house' },
			{ x: -43.5, z: -49 },
			{ x: -22, z: -50 },
			{ x: -17, z: -32 }
		]
	},
	castillo: {
		id: 'castillo',
		label: 'Castle road',
		loop: true,
		groundY: 0.4,
		waypoints: [
			{ x: 33, z: -14 },
			{ x: 48, z: -18 },
			{ x: 50, z: -30 },
			{ x: 47, z: -40 },
			{ x: 42, z: -46 },
			{ x: 30, z: -48 },
			{ x: 18, z: -42 },
			{ x: 15, z: -30 },
			{ x: 20, z: -22, pause: [4000, 8000], visit: 'castle' }
		]
	},
	calabaza: {
		id: 'calabaza',
		label: 'Pumpkin field',
		loop: true,
		groundY: 0.4,
		waypoints: [
			{ x: -33, z: 14 },
			{ x: -20, z: 20 },
			{ x: -16, z: 34 },
			{ x: -18, z: 46 },
			{ x: -26, z: 53 },
			{ x: -36, z: 54, pause: [4000, 8000], visit: 'barn' },
			{ x: -43, z: 50 },
			{ x: -47, z: 47 },
			{ x: -48, z: 44 },
			{ x: -49, z: 42 },
			{ x: -52, z: 40 },
			{ x: -52, z: 35 },
			{ x: -49, z: 28 },
			{ x: -45, z: 24 },
			{ x: -38, z: 16 }
		]
	},
	cementerio: {
		id: 'cementerio',
		label: 'Cemetery',
		loop: true,
		groundY: 0.4,
		waypoints: [
			{ x: 33, z: 14 },
			{ x: 48, z: 20 },
			{ x: 52, z: 32 },
			{ x: 49, z: 42 },
			{ x: 46, z: 48 },
			{ x: 30, z: 57 },
			{ x: 22, z: 60 },
			{ x: 16, z: 50 },
			{ x: 16, z: 40, pause: [8000, 12000], visit: 'mausoleum' },
			{ x: 16, z: 30 },
			{ x: 22, z: 20 }
		]
	}
};

export function routeWaypoint(route: NpcRoute, index: number): NpcWaypoint {
	return route.waypoints[
		((index % route.waypoints.length) + route.waypoints.length) % route.waypoints.length
	];
}

/**
 * Applies the radial lane offset to a waypoint. Shared circular routes
 * (`centro`, `paseo`) keep their agents apart without extra waypoints.
 */
export function lanePosition(waypoint: NpcWaypoint, lane: number): { x: number; z: number } {
	if (lane === 0) {
		return { x: waypoint.x, z: waypoint.z };
	}

	const radius = Math.hypot(waypoint.x, waypoint.z);

	if (radius < 0.0001) {
		return { x: waypoint.x, z: waypoint.z };
	}

	const scale = (radius + lane) / radius;

	return { x: waypoint.x * scale, z: waypoint.z * scale };
}
