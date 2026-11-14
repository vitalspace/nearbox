/* eslint-disable */
// AUTO-GENERADO por scripts/world-sync.mjs. No editar a mano.
import type { Component } from 'svelte';
import { asset } from '../assets/path';
import BarnsiegeComponent from '../components/world/Barnsiege.svelte';
import CryptComponent from '../components/world/Crypt.svelte';
import IslasCiudadComponent from '../components/world/IslasCiudad.svelte';
import MapComponent from '../components/world/Map.svelte';
import ParkourComponent from '../components/world/Parkour.svelte';
import RoadmapComponent from '../components/world/Roadmap.svelte';
import WhiInteriorComponent from '../components/world/WhiInterior.svelte';
import BarnsiegePhysics from '../../../world/barnsiege.physics.json';
import CryptPhysics from '../../../world/crypt.physics.json';
import IslasCiudadPhysics from '../../../world/islas-ciudad.physics.json';
import MapPhysics from '../../../world/map.physics.json';
import ParkourPhysics from '../../../world/parkour.physics.json';
import RoadmapPhysics from '../../../world/roadmap.physics.json';
import WhiInteriorPhysics from '../../../world/whi-interior.physics.json';

export type WorldMapId =
	'barnsiege' | 'crypt' | 'islas-ciudad' | 'map' | 'parkour' | 'roadmap' | 'whi-interior';

export type WorldMapTransform = {
	position: [number, number, number];
	rotation: [number, number, number];
	scale: [number, number, number];
};

export type WorldMapSpawn = { x: number; y: number; z: number };

export type WorldMapEntry = {
	id: WorldMapId;
	glb: string;
	component: Component<any>;
	physics: Record<string, any>;
	spawn: WorldMapSpawn;
	transform: WorldMapTransform;
	lighting: string;
	scene: string;
};

export const worldMaps: Record<WorldMapId, WorldMapEntry> = {
	barnsiege: {
		id: 'barnsiege',
		glb: asset('maps/barnsiege.glb'),
		component: BarnsiegeComponent,
		physics: BarnsiegePhysics,
		spawn: { x: 0, y: 0.53, z: 0 },
		transform: {
			position: [0, 0, 0],
			rotation: [0, 0, 0],
			scale: [1, 1, 1]
		},
		lighting: 'global',
		scene: 'global'
	},
	crypt: {
		id: 'crypt',
		glb: asset('maps/game2.glb'),
		component: CryptComponent,
		physics: CryptPhysics,
		spawn: { x: 36.7, y: -7.98, z: 45 },
		transform: {
			position: [0, 0, 0],
			rotation: [0, 0, 0],
			scale: [1, 1, 1]
		},
		lighting: 'crypt',
		scene: 'crypt'
	},
	'islas-ciudad': {
		id: 'islas-ciudad',
		glb: asset('maps/islas_ciudad.glb'),
		component: IslasCiudadComponent,
		physics: IslasCiudadPhysics,
		spawn: { x: 0, y: 2.4, z: -30 },
		transform: {
			position: [0, 0, 0],
			rotation: [0, 0, 0],
			scale: [1, 1, 1]
		},
		lighting: 'global',
		scene: 'global'
	},
	map: {
		id: 'map',
		glb: asset('maps/map.glb'),
		component: MapComponent,
		physics: MapPhysics,
		spawn: { x: 0, y: 0.4, z: 12 },
		transform: {
			position: [0, 0, 0],
			rotation: [0, 0, 0],
			scale: [1, 1, 1]
		},
		lighting: 'global',
		scene: 'global'
	},
	parkour: {
		id: 'parkour',
		glb: asset('maps/Parkour.glb'),
		component: ParkourComponent,
		physics: ParkourPhysics,
		spawn: { x: 0, y: 0.15, z: 82.5 },
		transform: {
			position: [0, 0, 0],
			rotation: [0, 0, 0],
			scale: [1, 1, 1]
		},
		lighting: 'global',
		scene: 'parkour'
	},
	roadmap: {
		id: 'roadmap',
		glb: asset('maps/roadmap.glb'),
		component: RoadmapComponent,
		physics: RoadmapPhysics,
		spawn: { x: -79, y: 0.4, z: 132 },
		transform: {
			position: [0, 0, 0],
			rotation: [0, 0, 0],
			scale: [1, 1, 1]
		},
		lighting: 'global',
		scene: 'global'
	},
	'whi-interior': {
		id: 'whi-interior',
		glb: asset('maps/whi-interior.glb'),
		component: WhiInteriorComponent,
		physics: WhiInteriorPhysics,
		spawn: { x: 0, y: 0.1, z: 0 },
		transform: {
			position: [0, 0, 0],
			rotation: [0, 0, 0],
			scale: [1, 1, 1]
		},
		lighting: 'global',
		scene: 'global'
	}
};
