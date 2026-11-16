<script lang="ts">
	import { T, useTask, useThrelte } from '@threlte/core';
	import { QueryFilterFlags, Ray as RapierRay } from '@dimforge/rapier3d-compat';
	import { useRapier } from '@threlte/rapier';
	import { untrack } from 'svelte';
	import { PerspectiveCamera, MathUtils, Vector3 } from 'three';
	import { playerState } from '../../state/playerState';
	import { playerPhysics } from '../../state/playerPhysics';
	import { cars } from '../../state/cars.svelte';
	import { balloon, cannonForSeat, type BalloonSeat } from '../../state/balloon.svelte';
	import {
		cameraPhiForPitch,
		cannonAim,
		cannonDefaultYaw,
		cannonSeatPosition,
		CANNON_MAX_PITCH,
		CANNON_MAX_YAW,
		CANNON_MIN_PITCH
	} from '../../state/balloonCannons';
	import { ROYALE_BALLOON_EYE_OFFSET } from '../../state/royaleConfig';
	import { race } from '../../state/race.svelte';
	import { ride } from '../../state/ride.svelte';
	import { minigame5 } from '../../state/minigame5.svelte';
	import { minigame8 } from '../../state/minigame8.svelte';
	import { royaleVehicles } from '../../state/royaleVehicles.svelte';
	import { sceneState } from '../../state/sceneState.svelte';
	import { ThirdPersonControls } from './ThirdPersonControls';

	const EXTERIOR_PROFILE = {
		radius: 12,
		minRadius: 6,
		maxRadius: 24,
		minPhi: -0.35,
		maxPhi: 1.2
	};
	// Barn Siege: closer over-the-shoulder view so the avatar, the weapon and
	// the monsters stay readable during combat.
	const WAVES_PROFILE = {
		radius: 6.5,
		minRadius: 4,
		maxRadius: 12,
		minPhi: -0.2,
		maxPhi: 1.0
	};
	// Skyfall Royale reuses the Barn Siege combat view (SPEC-023): close,
	// slightly over the right shoulder, so the avatar, the weapon and the
	// enemies stay readable. The wide exterior orbit hid the player behind
	// the map and made aiming feel disconnected.
	const ROYALE_PROFILE = {
		radius: 6.5,
		minRadius: 4,
		maxRadius: 12,
		minPhi: -0.2,
		maxPhi: 1.0
	};
	// Globo de Skyfall Royale: se pilota desde la barquilla y hay que ver el
	// envelope y el suelo para apuntar. Es más cerrado que el globo del mapa
	// libre para que los enemigos sigan legibles desde el aire.
	const ROYALE_BALLOON_PROFILE = {
		radius: 13,
		minRadius: 8,
		maxRadius: 20,
		minPhi: -0.35,
		maxPhi: 1.15
	};
	const CRYPT_PROFILE = {
		radius: 4,
		minRadius: 2,
		maxRadius: 6.5,
		minPhi: -0.35,
		maxPhi: 1.2
	};
	// Minigames: the target sits slightly in front of the head and the camera
	// barely behind it, so the view looks out from the eyes instead of through
	// the back of the skull. theta/phi rotate it and the wheel pulls it back up
	// to 2 m for an over-the-shoulder view.
	const FIRST_PERSON_PROFILE = {
		radius: 0.2,
		minRadius: 0.2,
		maxRadius: 2,
		minPhi: -0.35,
		maxPhi: 1.25
	};
	// How far in front of the eye the FP target (and therefore the view) is.
	// The hero head is ~0.18 m deep but the walk/run clips lean it forward, so
	// this leaves the camera ~0.5 m ahead of the head centre (radius 0.2 m
	// behind the target) even while moving, well out of the skull.
	const FP_FORWARD_OFFSET = 0.7;
	// Third-person camera smoothing. First person snaps to the body position:
	// a smoothed target fell ~0.5 m behind at running speed and let the head
	// overtake the view, showing the inside of the skull.
	const CAMERA_SMOOTHING = 0.15;
	// Keep this margin between the camera and the wall it might face.
	const FP_WALL_MARGIN = 0.12;
	// Driving: camera somewhat lower and closer than the exterior on-foot one.
	const CAR_PROFILE = {
		radius: 10,
		minRadius: 6,
		maxRadius: 16,
		minPhi: -0.35,
		maxPhi: 1.2
	};
	// Monturas NFT: órbita más cercana que la de un coche para que el avatar y
	// la tabla/escoba se lean bien.
	const RIDE_PROFILE = {
		radius: 7.5,
		minRadius: 4.5,
		maxRadius: 13,
		minPhi: -0.35,
		maxPhi: 1.2
	};
	// The balloon is bigger than a car: pull back so the envelope stays visible.
	const BALLOON_PROFILE = {
		radius: 20,
		minRadius: 12,
		maxRadius: 32,
		minPhi: -0.5,
		maxPhi: 1.25
	};
	const EXTERIOR_FOV = 60;
	const FIRST_PERSON_FOV = 75;
	/** La torreta abre un poco el campo para que se vea el arco del disparo. */
	const TURRET_FOV = 68;
	/** Player eye height (1.8 m model). */
	const EYE_HEIGHT = 1.6;

	const { canvas } = useThrelte();
	const { world } = useRapier();

	let camera = $state<PerspectiveCamera>();
	let controlsReady = $state(false);
	let controls: ThirdPersonControls | undefined;
	let lastProfile: typeof EXTERIOR_PROFILE | null = null;
	let wasInRoadmap = false;
	let wasInWaves = false;
	let wasInRoyale = false;
	let wasRoyaleBalloonFirst = false;

	const ray = new RapierRay({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
	const desiredDirection = new Vector3();
	const fpForward = new Vector3();
	const turretEye = new Vector3();
	const turretLook = new Vector3();

	// Cámara de los ocupantes del globo.
	// 1ª persona: el ojo va en la cabeza y mira por el tubo, como un artillero.
	const FIRST_PERSON_EYE_UP = 0.55;
	// Torreta (2ª persona): el ojo va por encima del hombro del ocupante y algo
	// detrás, para ver a la vez el avatar, el tubo y la zona del objetivo. El
	// desplazamiento lateral deja la cabeza fuera del centro de la mira.
	const TURRET_BACK = 0.75;
	const TURRET_UP = 0.62;
	const TURRET_SIDE = 0.42;
	const TURRET_LOOK = 40;
	/**
	 * En torreta la cámara no mira al punto de caída (eso la dejaba clavada en
	 * el suelo): mira casi por el tubo, unos grados por debajo, para que el
	 * horizonte quede a la vista.
	 */
	const TURRET_PITCH_DROP = 0.12;
	/** Último `yaw` del globo visto por la cámara: la vista gira con él. */
	let turretBalloonYaw: number | null = null;

	$effect(() => {
		if (!camera) return;
		controls = new ThirdPersonControls(camera, {
			offset: new Vector3(0, 1.4, 0),
			sensitivity: 0.0025,
			radius: EXTERIOR_PROFILE.radius,
			minRadius: EXTERIOR_PROFILE.minRadius,
			maxRadius: EXTERIOR_PROFILE.maxRadius,
			interpolationFactor: CAMERA_SMOOTHING,
			theta: 0,
			phi: 0.3
		});
		controlsReady = true;
	}); // Minigames with their own scene: very close view (camera behind the head,
	// never inside). Crypt outside this profile: short profile with
	// collision correction. Exterior: current wide profile.
	$effect(() => {
		const firstPerson = sceneState.firstPerson;
		const ballooning = balloon.isOccupant;
		const riding = ride.isRiding;
		const driving =
			cars.isDriving ||
			ballooning ||
			riding ||
			race.inCar ||
			sceneState.inRoadmap ||
			minigame5.isDriving ||
			minigame8.isDriving;
		const royaleBallooning = minigame8.isDriving && minigame8.drivingKind === 'balloon';
		const royaleBalloonFirst = royaleBallooning && royaleVehicles.balloonView === 'first';
		const profile = ballooning
			? BALLOON_PROFILE
			: royaleBallooning
				? royaleBalloonFirst
					? FIRST_PERSON_PROFILE
					: ROYALE_BALLOON_PROFILE
				: riding
					? RIDE_PROFILE
					: driving
						? CAR_PROFILE
						: firstPerson
							? FIRST_PERSON_PROFILE
							: sceneState.inCrypt
								? CRYPT_PROFILE
								: sceneState.inWaves
									? WAVES_PROFILE
									: sceneState.inRoyale
										? ROYALE_PROFILE
										: EXTERIOR_PROFILE;

		if (!controlsReady || !controls) return;

		if (profile !== lastProfile) {
			controls.setLimits(
				profile.radius,
				profile.minRadius,
				profile.maxRadius,
				profile.minPhi,
				profile.maxPhi
			);
			lastProfile = profile;
		}

		// The Haunted Highway car starts on the top straight pointing +X: put the
		// camera behind it so the first view follows the jumps instead of
		// looking at the car side-on. Only do it when entering the track:
		// race snapshots re-run this effect and used to reset the view,
		// which made the camera feel locked while driving.
		const inRoadmap = sceneState.inRoadmap;

		if (inRoadmap && !wasInRoadmap) {
			controls.theta = -Math.PI / 2;
		}

		wasInRoadmap = inRoadmap;

		// Barn Siege and Skyfall Royale: start behind the avatar, at chest
		// height, so the first seconds show the weapon and the enemies instead
		// of the sky.
		const inWaves = sceneState.inWaves && !driving;
		const inRoyale = sceneState.inRoyale && !driving;

		if (inWaves && !wasInWaves) {
			controls.theta = Math.PI;
			controls.phi = 0.16;
		}

		if (inRoyale && !wasInRoyale) {
			controls.theta = Math.PI;
			controls.phi = 0.16;
		}

		wasInWaves = inWaves;
		wasInRoyale = inRoyale;

		// Globo de Royale en 1ª persona: al entrar, la vista arranca mirando
		// hacia donde apunta la barquilla en vez de heredar el rumbo que el
		// jugador llevaba a pie. `enter()` guarda el `yaw` del anclaje y
		// `RoyaleBalloon` lo mantiene al día mientras se vuela.
		if (royaleBalloonFirst && !wasRoyaleBalloonFirst) {
			controls.theta = untrack(() => royaleVehicles.balloonYaw);
			controls.phi = 0.12;
		}

		wasRoyaleBalloonFirst = royaleBalloonFirst;

		// In FP a slightly wider view helps with orientation.
		if (camera) {
			const fov = balloon.isOccupant
				? balloon.view === 'first'
					? FIRST_PERSON_FOV
					: balloon.view === 'turret'
						? TURRET_FOV
						: EXTERIOR_FOV
				: royaleBallooning
					? royaleBalloonFirst
						? FIRST_PERSON_FOV
						: EXTERIOR_FOV
					: firstPerson && !driving
						? FIRST_PERSON_FOV
						: EXTERIOR_FOV;

			if (camera.fov !== fov) {
				camera.fov = fov;
				camera.updateProjectionMatrix();
			}
		}
	});

	// Al ocupar un asiento del globo, la cámara mira hacia fuera del cañón:
	// la mira empieza centrada en su cono en vez de apuntar a la canasta.
	let lastSeat: BalloonSeat | null = null;
	$effect(() => {
		const seat = balloon.selfSeat;

		if (!controlsReady || !controls) return;
		if (seat === lastSeat) return;

		lastSeat = seat;
		turretBalloonYaw = null;
		if (!seat) return;

		controls.theta = MathUtils.euclideanModulo(
			balloon.yaw + cannonDefaultYaw(cannonForSeat(seat)),
			Math.PI * 2
		);
		// La mira arranca algo elevada, no apuntando al suelo.
		controls.phi = 0.3;
	});

	$effect(() => {
		let dragging = false;
		let activePointerId: number | null = null;
		let lastX = 0;
		let lastY = 0;
		/** Evita que un trackpad recorra las tres cámaras en un solo gesto. */
		let lastViewSwitchAt = 0;

		const isLocked = () => document.pointerLockElement === canvas;
		const isMouse = (event: PointerEvent) => event.pointerType === 'mouse';

		const onPointerDown = (event: PointerEvent) => {
			if (isLocked() || activePointerId !== null) return;
			if (isMouse(event) && event.button !== 0) return;

			// On touch, pointer lock is not requested: direct dragging controls the camera.
			if (!isMouse(event)) {
				event.preventDefault();
			}

			dragging = true;
			activePointerId = event.pointerId;
			lastX = event.clientX;
			lastY = event.clientY;
			canvas.setPointerCapture(event.pointerId);

			if (isMouse(event)) {
				canvas.style.cursor = 'grabbing';

				// RUN.world embeds the game in a sandboxed iframe without
				// `allow-pointer-lock`; requesting it there only spams console
				// errors. Drag-to-look is the fallback and works everywhere.
				if (window.top !== window.self) {
					return;
				}

				try {
					const request = canvas.requestPointerLock();
					if (request instanceof Promise) request.catch(() => {});
				} catch {
					// Pointer lock unavailable: drag fallback keeps working
				}
			}
		};

		const onPointerMove = (event: PointerEvent) => {
			if (isLocked() || !dragging || !controls || event.pointerId !== activePointerId) return;

			if (!isMouse(event)) {
				event.preventDefault();
			}

			const deltaX = event.clientX - lastX;
			const deltaY = event.clientY - lastY;
			lastX = event.clientX;
			lastY = event.clientY;
			controls.rotate(deltaX, deltaY);
		};

		const onPointerUp = (event: PointerEvent) => {
			if (event.pointerId !== activePointerId) return;

			dragging = false;
			activePointerId = null;

			if (canvas.hasPointerCapture(event.pointerId)) {
				canvas.releasePointerCapture(event.pointerId);
			}

			canvas.style.cursor = isLocked() ? 'none' : 'grab';
		};

		const onMouseMove = (event: MouseEvent) => {
			if (!isLocked() || !controls) return;
			controls.rotate(event.movementX, event.movementY);
		};

		const onPointerLockChange = () => {
			dragging = false;
			activePointerId = null;
			canvas.style.cursor = isLocked() ? 'none' : 'grab';
		};

		const onWheel = (event: WheelEvent) => {
			event.preventDefault();

			// A bordo del globo la rueda cambia de cámara, como `V`.
			if (balloon.isOccupant) {
				const now = performance.now();

				if (Math.abs(event.deltaY) < 1 || now - lastViewSwitchAt < 220) return;

				lastViewSwitchAt = now;
				balloon.cycleView(event.deltaY > 0 ? 1 : -1);
				return;
			}

			controls?.zoom(event.deltaY * 0.01);
		};

		canvas.style.cursor = 'grab';
		canvas.style.touchAction = 'none';
		canvas.addEventListener('pointerdown', onPointerDown);
		canvas.addEventListener('pointermove', onPointerMove);
		canvas.addEventListener('pointerup', onPointerUp);
		canvas.addEventListener('pointercancel', onPointerUp);
		canvas.addEventListener('wheel', onWheel, { passive: false });
		document.addEventListener('mousemove', onMouseMove);
		document.addEventListener('pointerlockchange', onPointerLockChange);

		return () => {
			canvas.removeEventListener('pointerdown', onPointerDown);
			canvas.removeEventListener('pointermove', onPointerMove);
			canvas.removeEventListener('pointerup', onPointerUp);
			canvas.removeEventListener('pointercancel', onPointerUp);
			canvas.removeEventListener('wheel', onWheel);
			document.removeEventListener('mousemove', onMouseMove);
			document.removeEventListener('pointerlockchange', onPointerLockChange);
			canvas.style.cursor = '';
			canvas.style.touchAction = '';
		};
	});

	/**
	 * Cámara de los ocupantes del globo (piloto y artilleros).
	 *
	 * - `first`: ojo en la cabeza del ocupante, mirando por el tubo. Es la
	 *   vista de apuntar «de verdad», sin retícula.
	 * - `turret`: sobre el hombro, un poco detrás y por encima del cañón, para
	 *   ver a la vez el tubo y la zona del objetivo.
	 *
	 * En ambas la vista se recorta al cono del cañón y acompaña la rotación del
	 * globo. La tercera persona usa la cámara orbital de siempre.
	 */
	function updateOccupantCamera(): void {
		if (!controls || !camera) return;

		const seat = balloon.selfSeat;

		if (!seat) return;

		const cannon = cannonForSeat(seat);
		const baseYaw = balloon.yaw + cannonDefaultYaw(cannon);

		// La cámara va montada en el globo: si el piloto gira con A/D, la
		// vista gira con él en vez de que el cañón compense en secreto.
		const previousYaw = turretBalloonYaw ?? balloon.yaw;
		const turn = Math.atan2(
			Math.sin(balloon.yaw - previousYaw),
			Math.cos(balloon.yaw - previousYaw)
		);
		turretBalloonYaw = balloon.yaw;
		controls.theta += turn;

		// Se recorta la entrada, no solo la puntería: al volver el ratón
		// responde de inmediato en vez de arrastrar un giro oculto.
		const relative = Math.atan2(
			Math.sin(controls.theta - baseYaw),
			Math.cos(controls.theta - baseYaw)
		);

		controls.theta = baseYaw + MathUtils.clamp(relative, -CANNON_MAX_YAW, CANNON_MAX_YAW);
		controls.phi = MathUtils.clamp(
			controls.phi,
			cameraPhiForPitch(CANNON_MAX_PITCH),
			cameraPhiForPitch(CANNON_MIN_PITCH)
		);

		const aim = cannonAim(balloon.yaw, controls.theta, controls.phi, cannon);
		const aimYaw = baseYaw + aim.offset;
		const firstPerson = balloon.view === 'first';

		// 1ª persona: la mirada sigue exactamente al tubo. Torreta: baja un
		// poco la mirada para que el horizonte no se vaya fuera de cuadro.
		const lookPitch = firstPerson
			? aim.pitch
			: MathUtils.clamp(aim.pitch - TURRET_PITCH_DROP, -0.35, 0.62);
		const eyeBack = firstPerson ? 0 : TURRET_BACK;
		const eyeUp = firstPerson ? FIRST_PERSON_EYE_UP : TURRET_UP;
		const eyeSide = firstPerson ? 0 : TURRET_SIDE;
		const cosLook = Math.cos(lookPitch);

		const backX = -Math.sin(aimYaw);
		const backZ = -Math.cos(aimYaw);
		// Derecha del tubo: al mirar hacia −Z (yaw 0), el hombro derecho es +X.
		const rightX = Math.cos(aimYaw);
		const rightZ = -Math.sin(aimYaw);

		// Asiento real del ocupante, sin depender del orden de las tareas.
		const seatPosition = cannonSeatPosition(balloon.position, balloon.yaw, cannon);

		turretEye.set(
			seatPosition.x - backX * eyeBack + rightX * eyeSide,
			seatPosition.y + eyeUp,
			seatPosition.z - backZ * eyeBack + rightZ * eyeSide
		);
		turretLook.set(
			turretEye.x - Math.sin(aimYaw) * cosLook * TURRET_LOOK,
			turretEye.y + Math.sin(lookPitch) * TURRET_LOOK,
			turretEye.z - Math.cos(aimYaw) * cosLook * TURRET_LOOK
		);

		camera.position.copy(turretEye);
		camera.lookAt(turretLook);
	}

	useTask((delta) => {
		if (!controls) return;

		const firstPerson = sceneState.firstPerson;
		// En 1ª persona y torreta la cámara se coloca a mano; la 3ª persona del
		// globo sigue usando la órbita de siempre.
		const occupantCamera = balloon.isOccupant && balloon.view !== 'third';
		const driving =
			cars.isDriving ||
			balloon.isOccupant ||
			ride.isRiding ||
			race.inCar ||
			sceneState.inRoadmap ||
			minigame5.isDriving ||
			minigame8.isDriving;
		const royaleBallooning = minigame8.isDriving && minigame8.drivingKind === 'balloon';
		const royaleBalloonFirst = royaleBallooning && royaleVehicles.balloonView === 'first';

		// The avatar snaps to the physics position every frame. In first person
		// the camera must do the same or it trails behind while walking and the
		// head ends up in front of the view. Third person keeps its smoothing.
		controls.positionSnap = firstPerson || royaleBalloonFirst;

		// `setTarget` adds `offset`: in FP the offset is 0 and the target becomes
		// the eye height; in third person everything stays the same. While
		// driving, `playerState` is updated by the car physics and the target
		// stays at chassis height.
		if (occupantCamera) {
			updateOccupantCamera();
		} else if (royaleBalloonFirst) {
			// Barquilla en 1ª persona: la vista nace en el asiento y apunta con
			// el ratón. El objetivo va un poco por delante para que la cámara
			// quede fuera de la cesta y el disparo siga la mirada, igual que a
			// pie en primera persona.
			controls.offset.y = ROYALE_BALLOON_EYE_OFFSET;
			controls.shoulder = 0;
			controls.setTarget(
				playerState.x - Math.sin(controls.theta) * FP_FORWARD_OFFSET,
				playerState.y,
				playerState.z - Math.cos(controls.theta) * FP_FORWARD_OFFSET
			);
		} else if (driving) {
			controls.offset.y = 1.4;
			controls.shoulder = 0;
			controls.setTarget(playerState.x, playerState.y, playerState.z);
		} else {
			const inCombat = sceneState.inWaves || sceneState.inRoyale;
			// Barn Siege / Skyfall Royale: aim at chest height and shift the
			// camera over the right shoulder so the weapon and crosshair stay
			// readable.
			controls.offset.y = firstPerson ? 0 : inCombat ? 0 : 1.4;
			controls.shoulder = inCombat && !firstPerson ? 0.9 : 0;

			// First person: push the look target just in front of the eye so the
			// camera looks outward instead of being stuck inside the head.
			let forwardX = 0;
			let forwardZ = 0;

			if (firstPerson) {
				fpForward.set(-Math.sin(controls.theta), 0, -Math.cos(controls.theta));
				let forwardDistance = FP_FORWARD_OFFSET;

				// Do not let the forward offset cross a wall.
				ray.origin.x = playerState.x;
				ray.origin.y = playerState.y + EYE_HEIGHT;
				ray.origin.z = playerState.z;
				ray.dir.x = fpForward.x;
				ray.dir.y = fpForward.y;
				ray.dir.z = fpForward.z;

				const hit = world.castRay(
					ray,
					FP_FORWARD_OFFSET + FP_WALL_MARGIN,
					true,
					QueryFilterFlags.EXCLUDE_SENSORS,
					undefined,
					playerPhysics.collider ?? undefined
				);

				if (hit) {
					forwardDistance = Math.max(0, hit.timeOfImpact - FP_WALL_MARGIN);
				}

				forwardX = fpForward.x * forwardDistance;
				forwardZ = fpForward.z * forwardDistance;
			}

			controls.setTarget(
				playerState.x + forwardX,
				playerState.y + (firstPerson ? EYE_HEIGHT : inCombat ? 1.55 : 1.4),
				playerState.z + forwardZ
			);
		}
		if (!occupantCamera) {
			turretBalloonYaw = null;
			controls.update(delta);
		}
		playerState.cameraYaw = controls.theta;
		playerState.cameraPhi = controls.phi;

		// La cámara de ocupante se coloca a mano; no hay corrección de colisión.
		if (occupantCamera) return;

		// Collision correction does not apply in first person: the camera sits
		// right at the eye and the forward offset is already wall-clamped above.
		if (!sceneState.inCrypt || firstPerson) return;

		// Ray from the target toward the camera: if a wall or the ceiling is
		// in between, the camera is moved closer to the player.
		const target = controls.targetPosition;
		desiredDirection.copy(camera?.position ?? target).sub(target);

		const distance = desiredDirection.length();
		if (distance < 0.001) return;

		desiredDirection.divideScalar(distance);
		ray.origin.x = target.x;
		ray.origin.y = target.y;
		ray.origin.z = target.z;
		ray.dir.x = desiredDirection.x;
		ray.dir.y = desiredDirection.y;
		ray.dir.z = desiredDirection.z;

		const hit = world.castRay(
			ray,
			distance,
			true,
			QueryFilterFlags.EXCLUDE_SENSORS,
			undefined,
			playerPhysics.collider ?? undefined
		);

		if (hit && camera) {
			const safeDistance = Math.max(0.8, hit.timeOfImpact - 0.2);

			if (safeDistance < distance) {
				camera.position.copy(target).addScaledVector(desiredDirection, safeDistance);
			}
		}
	});
</script>

<T.PerspectiveCamera bind:ref={camera} makeDefault fov={60} near={0.1} far={20000} />
