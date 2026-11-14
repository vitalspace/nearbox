<script lang="ts">
	import {
		ColliderDesc,
		RigidBodyDesc,
		type Collider,
		type RigidBody
	} from '@dimforge/rapier3d-compat';
	import { T, useTask } from '@threlte/core';
	import { useDraco, useGltf } from '@threlte/extras';
	import { useRapier } from '@threlte/rapier';
	import { onDestroy, untrack } from 'svelte';
	import {
		BoxGeometry,
		BufferGeometry,
		Float32BufferAttribute,
		Group,
		Matrix4,
		Mesh,
		Quaternion,
		Vector3,
		type Material,
		type Object3D
	} from 'three';
	import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
	import { asset } from '../../assets/path';
	import { balloon, cannonForSeat, type BalloonVisual } from '../../state/balloon.svelte';
	import {
		cannonAim,
		cannonSeatPosition,
		CANNON_MODEL_PITCH,
		type BalloonCannonId
	} from '../../state/balloonCannons';
	import {
		BALLOON_ACCELERATION,
		BALLOON_LIFT_SPEED,
		BALLOON_MAX_RADIUS,
		BALLOON_MAX_SPEED,
		BALLOON_MAX_Y,
		BALLOON_MIN_Y,
		BALLOON_SPAWN,
		BALLOON_STATE_INTERVAL_MS,
		BALLOON_YAW_SPEED
	} from '../../state/balloonConfig';
	import { balloonInput } from '../../state/balloonInput';
	import { carInput } from '../../state/carInput';
	import { playerState } from '../../state/playerState';
	import { yawFromQuaternion } from '../../state/carConfig';

	type Vector3Tuple = [number, number, number];

	let {
		position = [BALLOON_SPAWN.x, BALLOON_SPAWN.y, BALLOON_SPAWN.z] as Vector3Tuple,
		scale = 1 as number | Vector3Tuple,
		/** Crea colliders para la canasta (no para la vela ni los cañones). */
		collision = true
	}: {
		position?: Vector3Tuple;
		scale?: number | Vector3Tuple;
		collision?: boolean;
	} = $props();

	// El GLB se extrae de map.glb con `world:externalize` y se comparte por caché.
	const gltf = useGltf(asset('props/balloon.glb'), {
		dracoLoader: useDraco(asset('draco/'))
	});
	const rapier = useRapier();

	/**
	 * Solo la canasta es sólida. La vela, cuerdas, cañones y llamas son
	 * decoración: si colisionaran, el jugador se quedaría atrapado en el aire.
	 */
	const BASKET_MESHES = new Set([
		'BAL_Cabin_Floor',
		'BAL_Cabin_WallBack',
		'BAL_Cabin_WallFront_L',
		'BAL_Cabin_WallFront_R',
		'BAL_Cabin_WallLeft',
		'BAL_Cabin_WallRight',
		'BAL_Rim_B',
		'BAL_Rim_F_L',
		'BAL_Rim_F_R',
		'BAL_Rim_L',
		'BAL_Rim_R',
		'BAL_Door',
		'BAL_Step_Lower',
		'BAL_Step_Upper'
	]);

	const UP = new Vector3(0, 1, 0);
	const tempVector = new Vector3();
	const tempMatrix = new Matrix4();
	const tempQuaternion = new Quaternion();

	const colliders: Collider[] = [];
	let basketBody: RigidBody | undefined;

	let built = false;
	let root = $state.raw<Group>();
	let sourceScene: Object3D | null = null;
	let model: Object3D | null = null;

	/** Plataforma de madera del cañón frontal (geometría propia). */
	let frontSupportGeometry: BoxGeometry | null = null;

	type CannonRig = {
		/** Giro horizontal del cañón. */
		yaw: Group;
		/** Elevación del tubo. */
		pitch: Group;
	};

	const cannonRigs = new Map<BalloonCannonId, CannonRig>();

	/**
	 * Cuelga el modelo bajo dos grupos para poder apuntarlo con el ratón.
	 *
	 * `trim` cancela la inclinación que el modelo trae de fábrica: los anclajes
	 * laterales están rotados 8° alrededor de Z, y sin descontarla el giro
	 * horizontal inclinaría el tubo en vez de mantener la elevación de la mira.
	 */
	function addAimRig(basePivot: Group, model: Object3D, trim = 0): CannonRig {
		const yaw = new Group();
		const pitch = new Group();

		if (trim !== 0) {
			// El recorte va entre el anclaje y el giro: así los ejes de las dos
			// articulaciones quedan vertical/horizontal en el espacio del globo.
			const trimGroup = new Group();
			trimGroup.rotation.z = trim;
			basePivot.add(trimGroup);
			trimGroup.add(yaw);
		} else {
			basePivot.add(yaw);
		}

		yaw.add(pitch);
		pitch.add(model);

		return { yaw, pitch };
	}

	/**
	 * Añade el cañón frontal y convierte los laterales en pivotes.
	 *
	 * Los cañones laterales del GLB ya están modelados a 1.68 m del centro y
	 * apuntan hacia ±X. El frontal se clona del derecho, se centra y se gira
	 * 90° para que dispare hacia −Z (el morro del globo).
	 */
	function prepareCannons(object: Object3D): void {
		const left = object.getObjectByName('BAL_Cannon_L');
		const right = object.getObjectByName('BAL_Cannon_R');

		if (!left || !right) return;

		// Laterales: el pivote hereda la posición y la rotación del anclaje, y el
		// cañón queda en el origen. Así el conjunto conserva exactamente su
		// aspecto (el izquierdo está espejado 180° en el GLB) y se puede apuntar.
		const leftPivot = new Group();
		leftPivot.name = 'BAL_CannonPivot_L';
		leftPivot.position.copy(left.position);
		leftPivot.quaternion.copy(left.quaternion);
		object.add(leftPivot);
		left.position.set(0, 0, 0);
		left.rotation.set(0, 0, 0);
		left.scale.set(1, 1, 1);
		cannonRigs.set('left', addAimRig(leftPivot, left, -CANNON_MODEL_PITCH));

		const rightPivot = new Group();
		rightPivot.name = 'BAL_CannonPivot_R';
		rightPivot.position.copy(right.position);
		rightPivot.quaternion.copy(right.quaternion);
		object.add(rightPivot);
		right.position.set(0, 0, 0);
		right.rotation.set(0, 0, 0);
		right.scale.set(1, 1, 1);
		cannonRigs.set('right', addAimRig(rightPivot, right, -CANNON_MODEL_PITCH));

		// Frontal: clon del derecho (morro hacia +X), centrado sobre el pivote
		// y girado +90° para apuntar a −Z. El centro del cuerpo está en
		// x ≈ 0.345, así que se desplaza eso para que la boca caiga en −2.02.
		const front = right.clone(true);
		front.name = 'BAL_Cannon_Front';
		front.position.set(-0.345, 0, 0);
		front.rotation.set(0, 0, 0);
		front.scale.set(1, 1, 1);

		const frontPivot = new Group();
		frontPivot.name = 'BAL_CannonPivot_Front';
		frontPivot.position.set(0, 1.32, -1.45);
		frontPivot.rotation.y = Math.PI / 2;
		object.add(frontPivot);
		cannonRigs.set('front', addAimRig(frontPivot, front));

		// Plataforma que une el cañón con el borde de la canasta. Se reutiliza la
		// madera oscura del propio globo para que no desentone.
		let woodMaterial: Material | Material[] | undefined;
		object.traverse((child) => {
			if (woodMaterial) return;
			const mesh = child as Mesh;
			if (!mesh.isMesh) return;

			const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

			if (materials.some((material) => material.name === 'BAL_DarkWood')) {
				woodMaterial = mesh.material;
			}
		});

		let fallbackMaterial: Material | Material[] | undefined;
		front.traverse((child) => {
			const mesh = child as Mesh;
			if (!fallbackMaterial && mesh.isMesh) fallbackMaterial = mesh.material;
		});

		const supportMaterial = woodMaterial ?? fallbackMaterial;

		if (supportMaterial) {
			frontSupportGeometry = new BoxGeometry(1.1, 0.32, 1.0);
			const support = new Mesh(frontSupportGeometry, supportMaterial);
			support.name = 'BAL_Cannon_FrontSupport';
			support.position.set(0, 1.16, -1.45);
			object.add(support);
		}
	}

	/** Estado local del piloto (autoridad del cliente mientras vuela). */
	const initialPosition = untrack(() => position);
	const local = {
		x: initialPosition[0],
		y: initialPosition[1],
		z: initialPosition[2],
		yaw: 0,
		speed: 0,
		vy: 0
	};

	let wasOccupant = false;
	let wasDriving = false;
	let lastReportAt = 0;

	const visual: BalloonVisual = {
		position: { x: local.x, y: local.y, z: local.z },
		rotation: { x: 0, y: 0, z: 0, w: 1 },
		velocity: { x: 0, y: 0, z: 0 },
		speed: 0
	};

	/** Clona el modelo para que varias instancias no compartan la misma escena. */
	function prepare(scene: Object3D): Object3D {
		if (sourceScene === scene && model) return model;

		sourceScene = scene;
		const clone = cloneSkeleton(scene);
		clone.position.set(0, 0, 0);
		clone.rotation.set(0, 0, 0);
		clone.scale.setScalar(1);
		prepareCannons(clone);

		model = clone;
		return clone;
	}

	/**
	 * Copia la malla en coordenadas locales del globo (sin normales ni UVs),
	 * para poder colgarla de un cuerpo kinemático que sigue al modelo.
	 */
	function preparedGeometry(mesh: Mesh, toRoot: Matrix4): BufferGeometry | null {
		const positionAttribute = mesh.geometry.attributes.position;
		if (!positionAttribute) return null;

		const vertices = new Float32Array(positionAttribute.count * 3);
		for (let index = 0; index < positionAttribute.count; index += 1) {
			tempVector.fromBufferAttribute(positionAttribute, index).applyMatrix4(mesh.matrixWorld);
			tempVector.applyMatrix4(toRoot);
			vertices[index * 3] = tempVector.x;
			vertices[index * 3 + 1] = tempVector.y;
			vertices[index * 3 + 2] = tempVector.z;
		}

		const geometry = new BufferGeometry();
		geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));

		const sourceIndex = mesh.geometry.index;
		if (sourceIndex) {
			geometry.setIndex(Array.from(sourceIndex.array));
		} else {
			geometry.setIndex(Array.from({ length: positionAttribute.count }, (_, index) => index));
		}

		return geometry;
	}

	function buildColliders(): void {
		if (built || !collision || !root) return;

		const world = rapier?.world;
		if (!world) return;

		const meshes: Mesh[] = [];
		root.traverse((child) => {
			const mesh = child as Mesh;
			if (mesh.isMesh && BASKET_MESHES.has(mesh.name)) meshes.push(mesh);
		});

		// El GLTF puede tardar un frame en montarse; se reintenta en el siguiente.
		if (meshes.length === 0) return;

		root.updateWorldMatrix(true, true);

		const worldPosition = new Vector3();
		const worldQuaternion = new Quaternion();
		root.matrixWorld.decompose(worldPosition, worldQuaternion, tempVector);

		// Los vértices se guardan relativos al globo: el cuerpo kinemático se
		// mueve con él y la canasta nunca se queda atrás.
		const toRoot = tempMatrix.copy(root.matrixWorld).invert();

		basketBody = world.createRigidBody(
			RigidBodyDesc.kinematicPositionBased()
				.setTranslation(worldPosition.x, worldPosition.y, worldPosition.z)
				.setRotation(worldQuaternion)
		);

		for (const mesh of meshes) {
			const geometry = preparedGeometry(mesh, toRoot);
			if (!geometry) continue;

			const positions = geometry.attributes.position;
			const index = geometry.index;
			const vertices = new Float32Array(positions.array as Float32Array);
			const indices = index
				? new Uint32Array(index.array as ArrayLike<number>)
				: Uint32Array.from({ length: positions.count }, (_, item) => item);

			const description = ColliderDesc.trimesh(vertices, indices);
			description.setFriction(0.9).setRestitution(0);
			colliders.push(world.createCollider(description, basketBody));

			geometry.dispose();
		}

		built = true;

		if (import.meta.env.DEV) {
			console.info(`[balloon] canasta sólida (${colliders.length} colliders)`);
		}
	}

	/** Mantiene el collider de la canasta pegado a la posición visual. */
	function syncBasketBody(): void {
		if (!basketBody || !root) return;

		root.updateWorldMatrix(true, false);

		const worldPosition = new Vector3();
		const worldQuaternion = new Quaternion();
		root.matrixWorld.decompose(worldPosition, worldQuaternion, tempVector);

		basketBody.setNextKinematicTranslation(worldPosition);
		basketBody.setNextKinematicRotation(worldQuaternion);
	}

	function clampFlight(): void {
		const radius = Math.hypot(local.x, local.z);

		if (radius > BALLOON_MAX_RADIUS) {
			const factor = BALLOON_MAX_RADIUS / radius;
			local.x *= factor;
			local.z *= factor;
			local.speed = 0;
		}

		if (local.y < BALLOON_MIN_Y) {
			local.y = BALLOON_MIN_Y;
			local.vy = Math.max(0, local.vy);
		} else if (local.y > BALLOON_MAX_Y) {
			local.y = BALLOON_MAX_Y;
			local.vy = Math.min(0, local.vy);
		}
	}

	function simulate(delta: number): void {
		const dt = Math.min(delta, 0.05);

		// A/D giran; W/S aceleran o retroceden.
		local.yaw -= carInput.steering * BALLOON_YAW_SPEED * dt;

		const targetSpeed = carInput.throttle * BALLOON_MAX_SPEED;
		const maxStep = BALLOON_ACCELERATION * dt;
		local.speed += Math.max(-maxStep, Math.min(maxStep, targetSpeed - local.speed));

		// El morro del globo mira hacia -Z cuando yaw = 0.
		const forwardX = -Math.sin(local.yaw);
		const forwardZ = -Math.cos(local.yaw);

		local.x += forwardX * local.speed * dt;
		local.z += forwardZ * local.speed * dt;

		// Space sube, Shift baja. Sin entrada la velocidad vertical se frena.
		const targetLift = balloonInput.lift * BALLOON_LIFT_SPEED;
		local.vy += (targetLift - local.vy) * Math.min(1, 5 * dt);
		local.y += local.vy * dt;

		clampFlight();

		tempQuaternion.setFromAxisAngle(UP, local.yaw);

		visual.position.x = local.x;
		visual.position.y = local.y;
		visual.position.z = local.z;
		visual.rotation.x = tempQuaternion.x;
		visual.rotation.y = tempQuaternion.y;
		visual.rotation.z = tempQuaternion.z;
		visual.rotation.w = tempQuaternion.w;
		visual.velocity.x = forwardX * local.speed;
		visual.velocity.y = local.vy;
		visual.velocity.z = forwardZ * local.speed;
		visual.speed = Math.abs(local.speed);

		// La cámara sigue al piloto desde la canasta.
		playerState.x = local.x;
		playerState.y = local.y + 1.2;
		playerState.z = local.z;
		playerState.facingYaw = local.yaw;
		playerState.grounded = true;
	}

	/**
	 * Orienta el tubo del cañón con la puntería del ratón. No hay arco ni
	 * retícula: se apunta por el propio tubo y la cámara del asiento.
	 */
	function updateAim(): void {
		const seat = balloon.selfSeat;

		if (!seat) return;

		const cannon = cannonForSeat(seat);
		const yaw = yawFromQuaternion(visual.rotation);
		const aim = cannonAim(yaw, playerState.cameraYaw, playerState.cameraPhi, cannon);
		const rig = cannonRigs.get(cannon);

		if (rig) {
			// En los laterales el recorte del anclaje ya descuenta sus 8°.
			rig.yaw.rotation.y = aim.offset;
			rig.pitch.rotation.z = aim.pitch;
		}
	}

	function report(): void {
		const now = Date.now();

		if (now - lastReportAt < BALLOON_STATE_INTERVAL_MS) {
			return;
		}

		lastReportAt = now;
		balloon.sendState({
			x: visual.position.x,
			y: visual.position.y,
			z: visual.position.z,
			qx: visual.rotation.x,
			qy: visual.rotation.y,
			qz: visual.rotation.z,
			qw: visual.rotation.w,
			vx: visual.velocity.x,
			vy: visual.velocity.y,
			vz: visual.velocity.z,
			speed: visual.speed
		});
	}

	useTask((delta) => {
		buildColliders();

		const driving = balloon.isDriving;
		const occupant = balloon.isOccupant;

		if (occupant && !wasOccupant) {
			// Al subir a la canasta se adopta la posición autoritativa. El
			// piloto empieza sin velocidad; el artillero solo hereda la pose.
			const state = balloon.state;

			if (state) {
				local.x = state.position.x;
				local.y = state.position.y;
				local.z = state.position.z;
				local.yaw = yawFromQuaternion(state.rotation);

				if (driving) {
					local.speed = 0;
					local.vy = 0;
				}
			}

			lastReportAt = 0;
		} else if (driving && !wasDriving) {
			// Cambio de asiento dentro de la canasta: se adopta la pose que
			// ya se está dibujando (el globo estaba parado) para no saltar
			// atrás a la última posición reportada.
			local.x = visual.position.x;
			local.y = visual.position.y;
			local.z = visual.position.z;
			local.yaw = yawFromQuaternion(visual.rotation);
			local.speed = 0;
			local.vy = 0;
			lastReportAt = 0;
		}

		if (driving) {
			simulate(delta);
			report();
		} else {
			const sampled = balloon.sample(balloon.serverNow());

			if (sampled) {
				visual.position.x = sampled.position.x;
				visual.position.y = sampled.position.y;
				visual.position.z = sampled.position.z;
				visual.rotation.x = sampled.rotation.x;
				visual.rotation.y = sampled.rotation.y;
				visual.rotation.z = sampled.rotation.z;
				visual.rotation.w = sampled.rotation.w;
				visual.velocity.x = sampled.velocity.x;
				visual.velocity.y = sampled.velocity.y;
				visual.velocity.z = sampled.velocity.z;
				visual.speed = sampled.speed;
			}

			const seat = balloon.selfSeat;

			if (seat) {
				// El artillero viaja en su cañón: la cámara y el collider del
				// jugador siguen esta posición mientras el globo se mueve.
				const yaw = yawFromQuaternion(visual.rotation);
				const seatPosition = cannonSeatPosition(visual.position, yaw, cannonForSeat(seat));

				playerState.x = seatPosition.x;
				playerState.y = seatPosition.y;
				playerState.z = seatPosition.z;
				playerState.facingYaw = yaw;
				playerState.grounded = true;
			}

			if (wasOccupant) {
				// Keep the camera from snapping back while the avatar is
				// teleported beside the basket.
				local.yaw = yawFromQuaternion(visual.rotation);
			}
		}

		wasOccupant = occupant;
		wasDriving = driving;
		balloon.setLiveVisual(visual);

		if (root) {
			root.position.set(visual.position.x, visual.position.y, visual.position.z);
			root.quaternion.set(
				visual.rotation.x,
				visual.rotation.y,
				visual.rotation.z,
				visual.rotation.w
			);

			syncBasketBody();
		}

		updateAim();
	});

	onDestroy(() => {
		frontSupportGeometry?.dispose();

		if (!rapier?.world) return;

		if (basketBody) {
			rapier.world.removeRigidBody(basketBody);
			basketBody = undefined;
		}

		colliders.length = 0;
	});
</script>

<T.Group {scale} bind:ref={root}>
	{#await gltf}
		<!-- El GLB llega desde la caché; no se dibuja nada mientras carga. -->
	{:then loaded}
		<T is={prepare(loaded.scene)} dispose={false} />
	{/await}
</T.Group>
