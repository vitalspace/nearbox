export type PhysicsCategory = 'suelo' | 'paredes' | 'muebles' | 'obstaculos';

export type ColliderShape = 'trimesh' | 'convexHull' | 'cuboid';

export type PhysicsCluster = {
	name: string;
	category: PhysicsCategory | string;
	shape: ColliderShape;
	triangles: number;
	names: string[];
};

export type PhysicsConfig = {
	id: string;
	glb: string;
	sourceSha256: string;
	collision: {
		mode: 'auto' | 'inject' | 'merged' | 'chunked' | 'none';
		readyNode: string | null;
		maxColliderTriangles: number;
		maxColliders: number;
		maxColliderNodes?: number;
		/** Tamaño de celda en metros para el modo `chunked` (por defecto 16). */
		chunkSize?: number;
		/**
		 * Monta solo los nodos de `groups` cuyo nombre coincide exactamente.
		 * Sin esto, `chunked` incluye también los hijos por prefijo (`_Rim`,
		 * `_Rock`, `_Sub`, `_Text`…), que en mapas como Parkour son adornos.
		 */
		exactGroups?: boolean;
	};
	animations?: {
		mode: 'auto' | 'none' | 'custom';
		rigs?: { group: string; clip: string }[];
	};
	friction?: number;
	restitution?: number;
	groups: Record<string, string[]>;
	clusters?: PhysicsCluster[];
	shapes: Record<string, ColliderShape>;
	excludePatterns: string[];
	forceInclude: string[];
	review: {
		name: string;
		category: string | null;
		confidence: number;
		triangles: number;
		reason: string;
	}[];
	stats?: {
		nodes: number;
		meshes: number;
		triangles: number;
		colliderNodes: number;
		colliderTriangles: number;
		colliders: number;
		mode: string;
	};
};
