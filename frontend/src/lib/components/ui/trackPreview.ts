import { Box3, Group, Vector3, type Object3D } from 'three';

export type TrackId = 'grand-prix' | 'roadmap';

type TrackPreviewRules = {
	names: ReadonlySet<string>;
	prefixes: readonly string[];
};

/**
 * Node whitelists for the two race tracks. Both GLBs ship every piece of the
 * set-dressing baked in world space, so the preview clones only the meshes
 * that give each track its identity (track surface, curbs, gantry/arches,
 * jumps, start line, skyline) instead of rendering ~1000 nodes per card.
 */
const RULES: Record<TrackId, TrackPreviewRules> = {
	'grand-prix': {
		names: new Set([
			'TWN_Ground',
			'TWN_Track',
			'TWN_Rim',
			'TWN_StartLine',
			'TWN_Gantry',
			'TWN_Gantry_TextN',
			'TWN_Gantry_TextS',
			'TWN_Walls',
			'TWN_Plaza',
			'TWN_Grandstand',
			'TWN_Grandstand_Sign',
			'TWN_TyreBarriers',
			'TWN_BackStreet',
			'TWN_Sidewalk',
			'TWN_DeadTrees',
			'TWN_Pumpkins'
		]),
		prefixes: [
			'TWN_Building_',
			'TWN_Diner',
			'TWN_Motel',
			'TWN_Garage',
			'TWN_GasStation_',
			'TWN_Lamps',
			'TWN_BackLamps',
			'TWN_BadgeLogo_Gantry',
			'area'
		]
	},
	roadmap: {
		names: new Set([
			'Ground_300x300',
			'HW_Track_Asphalt',
			'HW_Curb_L',
			'HW_Curb_R',
			'HW_NeonEdge_Inner',
			'HW_NeonEdge_Outer',
			'HW_CenterLine',
			'HW_StartFinish_Checker',
			'HW_Castle_Spooky',
			'HW_Castle_SkullEmblem'
		]),
		prefixes: [
			'HW_Jump',
			'HW_Arch',
			'HW_Gate',
			'HW_TireStack_',
			'HW_GiantPumpkin_',
			'HW_Grandstand_',
			'Skull_LowPoly'
		]
	}
};

/** Largest world-space dimension of the normalized preview, in three units. */
const PREVIEW_SIZE = 5.6;

function matches(rules: TrackPreviewRules, name: string | undefined): boolean {
	if (!name) {
		return false;
	}

	return rules.names.has(name) || rules.prefixes.some((prefix) => name.startsWith(prefix));
}

function collectNodes(scene: Object3D): Object3D[] {
	const nodes: Object3D[] = [];
	scene.traverse((object) => nodes.push(object));
	return nodes;
}

/**
 * Builds a normalized, self-contained copy of the given track for the
 * selection preview. The clones share geometry and materials with the live
 * scene, so the result must never be disposed — only dropped.
 *
 * The returned group is centered on the origin with its base sitting on
 * y = 0, scaled so the largest dimension fits {@link PREVIEW_SIZE}.
 */
export function buildTrackPreview(
	scene: Object3D,
	nodes: Record<string, Object3D> | undefined,
	track: TrackId
): Group | null {
	const rules = RULES[track];
	const candidates =
		nodes && Object.keys(nodes).length > 0 ? Object.values(nodes) : collectNodes(scene);

	// Keep only the topmost matching node of each branch so children of a kept
	// group are not added twice.
	const roots: Object3D[] = [];

	for (const object of candidates) {
		if (!matches(rules, object.name)) {
			continue;
		}

		let parent = object.parent;
		let covered = false;

		while (parent) {
			if (matches(rules, parent.name)) {
				covered = true;
				break;
			}
			parent = parent.parent;
		}

		if (!covered) {
			roots.push(object);
		}
	}

	if (roots.length === 0) {
		return null;
	}

	const inner = new Group();

	for (const root of roots) {
		const clone = root.clone(true);
		root.updateWorldMatrix(true, false);
		root.matrixWorld.decompose(clone.position, clone.quaternion, clone.scale);
		inner.add(clone);
	}

	const box = new Box3().setFromObject(inner);

	if (box.isEmpty()) {
		return null;
	}

	const center = box.getCenter(new Vector3());
	const size = box.getSize(new Vector3());
	const maxDim = Math.max(size.x, size.y, size.z) || 1;
	const scale = PREVIEW_SIZE / maxDim;

	inner.position.set(-center.x, -center.y, -center.z);

	const wrapper = new Group();
	wrapper.add(inner);
	wrapper.scale.setScalar(scale);
	// Offset so the base of the model rests on the platform (y = 0).
	wrapper.position.y = (center.y - box.min.y) * scale;

	return wrapper;
}
