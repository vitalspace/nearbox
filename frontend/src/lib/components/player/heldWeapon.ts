import {
	AnimationMixer,
	Box3,
	BoxGeometry,
	CylinderGeometry,
	Group,
	LoopOnce,
	Mesh,
	MeshStandardMaterial,
	Object3D,
	Vector3,
	type AnimationAction
} from 'three';
import type { Mg5WeaponId } from '../../state/wavesConfig';
import {
	cloneHeldWeaponModel,
	getCachedCombatModel,
	getCachedWeaponVariant,
	getWeaponClips,
	loadCombatModel,
	loadWeaponVariant
} from './weaponModels';

/**
 * Armas visibles en la mano del jugador durante el Asedio al Granero.
 *
 * Se construyen con primitivas para no depender de GLB extra. El cañón apunta
 * hacia +Z (el frente local del personaje) y la empuñadura queda por debajo,
 * de modo que el arma se lee bien desde la cámara en tercera persona.
 */

const METAL = new MeshStandardMaterial({ color: 0x27272a, metalness: 0.75, roughness: 0.35 });
const DARK = new MeshStandardMaterial({ color: 0x18181b, metalness: 0.5, roughness: 0.55 });
const WOOD = new MeshStandardMaterial({ color: 0x78350f, metalness: 0.05, roughness: 0.8 });
const ACCENT = new MeshStandardMaterial({
	color: 0xf97316,
	emissive: 0x7c2d12,
	emissiveIntensity: 0.4,
	metalness: 0.2,
	roughness: 0.6
});

function box(
	parent: Group,
	width: number,
	height: number,
	depth: number,
	x: number,
	y: number,
	z: number,
	material: MeshStandardMaterial
): void {
	const mesh = new Mesh(new BoxGeometry(width, height, depth), material);
	mesh.position.set(x, y, z);
	mesh.castShadow = true;
	parent.add(mesh);
}

function barrel(
	parent: Group,
	radius: number,
	length: number,
	x: number,
	y: number,
	z: number,
	material: MeshStandardMaterial
): void {
	const mesh = new Mesh(new CylinderGeometry(radius, radius, length, 10), material);
	// El cilindro nace vertical (+Y); se tumba para apuntar hacia +Z.
	mesh.rotation.x = Math.PI / 2;
	mesh.position.set(x, y, z);
	mesh.castShadow = true;
	parent.add(mesh);
}

/**
 * Empty marker at the open end of the barrel.
 *
 * `DeathmatchControls` / `WaveControls` read its world position so the
 * hitscan tracer leaves the weapon instead of the player's head. The marker
 * is in weapon-group space, so the group's scale and rotation apply too.
 */
const BARREL_TIP_NAME = 'BarrelTip';

function barrelTip(parent: Group, x: number, y: number, z: number): void {
	const tip = new Object3D();
	tip.name = BARREL_TIP_NAME;
	tip.position.set(x, y, z);
	parent.add(tip);
}

/**
 * The local player's visible weapon group. Threlte keeps one `PlayerBehaviour`
 * for the local hero, so a module-level handle is enough and avoids walking
 * the whole scene on every shot.
 */
let localWeaponRoot: Group | null = null;

export function trackLocalHeldWeapon(root: Group | null): void {
	localWeaponRoot = root;
}

/** World-space muzzle position, or `false` when the gun is not on screen. */
export function localHeldWeaponMuzzle(out: Vector3): boolean {
	const root = localWeaponRoot;

	if (!root || !root.visible) {
		return false;
	}

	const tip = root.getObjectByName(BARREL_TIP_NAME);

	if (!tip) {
		return false;
	}

	tip.updateWorldMatrix(true, false);
	out.setFromMatrixPosition(tip.matrixWorld);

	return true;
}

/**
 * Busca el mixer/clip de disparo dentro del grupo visible. `buildHeldWeapon`
 * devuelve un grupo interno que se añade a `weaponRoot`, así que la animación
 * puede vivir un nivel por debajo del grupo que se pasa a estas funciones.
 */
function findWeaponAnimation(group: Group | null): {
	mixer?: AnimationMixer;
	action?: AnimationAction;
} {
	if (!group) {
		return {};
	}

	let action: AnimationAction | undefined;
	let mixer: AnimationMixer | undefined;

	group.traverse((child) => {
		if (action) {
			return;
		}

		const candidate = child.userData.weaponFireAction as AnimationAction | undefined;

		if (candidate) {
			action = candidate;
			mixer = child.userData.weaponMixer as AnimationMixer | undefined;
		}
	});

	return { mixer, action };
}

/**
 * Reproduce el clip horneado de disparo del arma equipada (el coin-pistol
 * trae un clip `Fire`). Las armas base no traen clips: es un no-op.
 */
export function playHeldWeaponFire(group: Group | null): void {
	const { action } = findWeaponAnimation(group);

	if (!action) {
		return;
	}

	action.reset();
	action.setLoop(LoopOnce, 1);
	action.clampWhenFinished = true;
	action.play();
}

/** Igual que `playHeldWeaponFire`, para el arma visible del jugador local. */
export function playLocalHeldWeaponFire(): void {
	playHeldWeaponFire(localWeaponRoot);
}

/** Avanza el mixer del arma visible (si tiene clips horneados). */
export function updateHeldWeaponAnimation(group: Group | null, delta: number): void {
	const { mixer } = findWeaponAnimation(group);

	mixer?.update(delta);
}

function buildPrimitiveWeapon(id: Mg5WeaponId): Group {
	const group = new Group();
	group.name = `PrimitiveWeapon_${id}`;
	group.scale.setScalar(1.15);

	if (id === 'pistol') {
		// Empuñadura + corredera + cañón corto.
		box(group, 0.09, 0.16, 0.13, 0, -0.08, -0.02, DARK);
		box(group, 0.11, 0.1, 0.32, 0, 0.02, 0.12, METAL);
		barrel(group, 0.028, 0.16, 0, 0.03, 0.32, METAL);
		barrelTip(group, 0, 0.03, 0.4);
	} else if (id === 'shotgun') {
		// Culata de madera, cuerpo metálico y cañón largo.
		box(group, 0.11, 0.18, 0.22, 0, -0.06, -0.14, WOOD);
		box(group, 0.12, 0.14, 0.34, 0, 0.04, 0.12, METAL);
		barrel(group, 0.04, 0.55, 0, 0.1, 0.5, METAL);
		box(group, 0.13, 0.06, 0.2, 0, -0.02, 0.26, WOOD);
		barrelTip(group, 0, 0.1, 0.775);
	} else if (id === 'smg') {
		// Cuerpo compacto, cargador curvado y culata plegable.
		box(group, 0.1, 0.18, 0.18, 0, -0.06, -0.02, DARK);
		box(group, 0.11, 0.12, 0.3, 0, 0.05, 0.14, METAL);
		barrel(group, 0.03, 0.24, 0, 0.07, 0.38, METAL);
		box(group, 0.07, 0.22, 0.1, 0, -0.16, 0.08, METAL);
		box(group, 0.06, 0.06, 0.16, 0, 0.02, -0.18, DARK);
		barrelTip(group, 0, 0.07, 0.5);
	} else {
		// Rifle de caza: cañón muy largo, culata y mira.
		box(group, 0.1, 0.16, 0.24, 0, -0.06, -0.16, WOOD);
		box(group, 0.12, 0.13, 0.38, 0, 0.05, 0.14, METAL);
		barrel(group, 0.032, 0.7, 0, 0.09, 0.6, METAL);
		box(group, 0.06, 0.1, 0.16, 0, 0.18, 0.2, DARK);
		box(group, 0.045, 0.045, 0.12, 0, 0.24, 0.26, ACCENT);
		barrelTip(group, 0, 0.09, 0.95);
	}

	return group;
}

function findByNameContaining(root: Object3D, fragment: string): Object3D | null {
	const needle = fragment.toLowerCase();
	let match: Object3D | null = null;

	root.traverse((child) => {
		if (!match && child.name.toLowerCase().includes(needle)) {
			match = child;
		}
	});

	return match;
}

/**
 * Sustituye la primitiva por el GLB real y coloca el `BarrelTip` en la boca
 * del cañón. Los nombres de nodo llegan saneados por `GLTFLoader` (sin puntos),
 * así que se busca por fragmento (`Muzzle`, `Barrel`).
 */
function installWeaponModel(group: Group, id: Mg5WeaponId, variantId: string | null): void {
	const model = cloneHeldWeaponModel(id, variantId);

	if (!model) {
		return;
	}

	model.updateMatrixWorld(true);

	const muzzle = findByNameContaining(model, 'muzzle');
	const tip = new Object3D();
	tip.name = BARREL_TIP_NAME;

	if (muzzle) {
		muzzle.getWorldPosition(tip.position);
	} else {
		const box = new Box3().setFromObject(model);
		const barrel = findByNameContaining(model, 'barrel');

		if (barrel) {
			barrel.getWorldPosition(tip.position);
		} else {
			tip.position.set(0, box.min.y + (box.max.y - box.min.y) * 0.6, 0);
		}

		tip.position.z = box.max.z + 0.02;
	}

	group.clear();
	group.add(model);
	group.add(tip);

	const clips = getWeaponClips(id, variantId);
	const fire = clips.find((clip) => /fire|shoot/i.test(clip.name));

	delete group.userData.weaponMixer;
	delete group.userData.weaponFireAction;

	if (fire) {
		const mixer = new AnimationMixer(model);
		const action = mixer.clipAction(fire);

		action.setLoop(LoopOnce, 1);
		action.clampWhenFinished = true;
		group.userData.weaponMixer = mixer;
		group.userData.weaponFireAction = action;
	}
}

/**
 * Devuelve un grupo válido de inmediato (primitiva de respaldo) y lo cambia
 * por el modelo GLB cuando termina de cargar. El `BarrelTip` se conserva para
 * que las trazadoras sigan saliendo del cañón.
 */
export function buildHeldWeapon(id: Mg5WeaponId, variantId: string | null = null): Group {
	const group = new Group();
	group.name = `HeldWeapon_${id}`;
	group.add(buildPrimitiveWeapon(id));

	if (variantId) {
		if (getCachedWeaponVariant(variantId)) {
			installWeaponModel(group, id, variantId);
		} else {
			void loadWeaponVariant(variantId).then((model) => {
				if (model) {
					installWeaponModel(group, id, variantId);
				}
			});
		}

		return group;
	}

	if (getCachedCombatModel(id)) {
		installWeaponModel(group, id, null);
	} else {
		void loadCombatModel(id).then((model) => {
			if (model) {
				installWeaponModel(group, id, null);
			}
		});
	}

	return group;
}
