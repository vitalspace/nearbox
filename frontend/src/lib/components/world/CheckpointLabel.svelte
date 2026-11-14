<script lang="ts">
	import { T, useCamera, useTask } from '@threlte/core';
	import { Text3DGeometry } from '@threlte/extras';
	import {
		AdditiveBlending,
		CanvasTexture,
		Color,
		DoubleSide,
		MeshBasicMaterial,
		MeshStandardMaterial,
		PlaneGeometry,
		SRGBColorSpace,
		Vector3,
		type Group
	} from 'three';
	import type { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
	import { asset } from '../../assets/path';
	import { checkpoints } from '../../state/checkpoints.svelte';
	import { lobby } from '../../state/lobby.svelte';
	import type { MinigameLobbyId } from '../../services/protocol';

	let {
		id,
		label,
		color
	}: {
		id: MinigameLobbyId;
		label: string;
		color: string;
	} = $props();

	const active = $derived(checkpoints.activeCheckpointId === id);
	const isHere = $derived(lobby.isInLobby(id));

	const raceStatuses = $derived(
		id === 'minigame-3'
			? (['minigame-3', 'minigame-4'] as const).map((lobbyId) => lobby.statusForLobby(lobbyId))
			: []
	);
	const status = $derived(lobby.statusForLobby(id));
	/** The Grand Prix sign stays open while either of its two tracks is open. */
	const canEnter = $derived(
		id === 'minigame-3'
			? raceStatuses.some((entry) => entry === null || entry.canEnter)
			: (status?.canEnter ?? true)
	);

	const subtitle = $derived.by(() => {
		if (isHere) {
			return 'PRESS E TO LEAVE';
		}

		if (!canEnter) {
			if (status?.reason?.toLowerCase().includes('full')) {
				return 'LOBBY FULL';
			}

			if (status?.phase === 'results') {
				return 'MATCH ENDING';
			}

			if (status?.phase === 'waiting' || status?.phase === 'countdown') {
				return 'LOBBY FULL';
			}

			return 'MATCH IN PROGRESS';
		}

		if (id === 'minigame-3') {
			return 'PRESS E TO CHOOSE';
		}

		if (status?.phase === 'playing') {
			return 'IN PROGRESS - PRESS E';
		}

		if (status?.phase === 'results') {
			return 'RESULTS - PRESS E';
		}

		if (status?.phase === 'countdown') {
			return 'STARTING SOON - PRESS E';
		}

		return 'PRESS E TO ENTER';
	});

	// Local font bundled in `static/fonts`, resolved against the real
	// `index.html` directory so it also works under the RUN.world subpath.
	const fontUrl = asset('fonts/helvetiker_bold.typeface.json');

	const baseColor = new Color(color);
	const white = new Color('#ffffff');

	// Layout (local units, inside the billboard group):
	//   subtitle baseline at y = 0, title baseline right above it.
	//   The whole block floats above the checkpoint portal.
	const LABEL_Y = 4.25;
	const TITLE_Y = 0.48;
	const TARGET_WIDTH = 6.2;

	const titleSize = 0.42;
	const subtitleSize = 0.2;

	function createGlowTexture(): CanvasTexture | null {
		if (typeof document === 'undefined') {
			return null;
		}

		const width = 512;
		const height = 128;
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d');

		if (!context) {
			return null;
		}

		// Soft horizontal band: bright in the middle, transparent at the ends.
		const gradient = context.createLinearGradient(0, 0, width, 0);
		gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
		gradient.addColorStop(0.18, 'rgba(255, 255, 255, 0.25)');
		gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.85)');
		gradient.addColorStop(0.82, 'rgba(255, 255, 255, 0.25)');
		gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
		context.fillStyle = gradient;
		context.fillRect(0, 0, width, height);

		// Fade the band vertically too, so it blends into the scene.
		const vertical = context.createLinearGradient(0, 0, 0, height);
		vertical.addColorStop(0, 'rgba(0, 0, 0, 0)');
		vertical.addColorStop(0.35, 'rgba(0, 0, 0, 0.15)');
		vertical.addColorStop(0.5, 'rgba(0, 0, 0, 0.85)');
		vertical.addColorStop(0.65, 'rgba(0, 0, 0, 0.15)');
		vertical.addColorStop(1, 'rgba(0, 0, 0, 0)');
		context.globalCompositeOperation = 'destination-in';
		context.fillStyle = vertical;
		context.fillRect(0, 0, width, height);
		context.globalCompositeOperation = 'source-over';

		const texture = new CanvasTexture(canvas);
		texture.colorSpace = SRGBColorSpace;

		return texture;
	}

	const glowTexture = createGlowTexture();
	const glowGeometry = new PlaneGeometry(1, 1);
	const glowMaterial = new MeshBasicMaterial({
		map: glowTexture,
		color: baseColor,
		transparent: true,
		opacity: 0.34,
		depthWrite: false,
		blending: AdditiveBlending,
		side: DoubleSide,
		toneMapped: false
	});

	let titleMaterial = $state.raw<MeshStandardMaterial>();
	let subtitleMaterial = $state.raw<MeshBasicMaterial>();
	let billboard = $state.raw<Group>();
	let titleGeometry = $state.raw<TextGeometry>();
	let subtitleGeometry = $state.raw<TextGeometry>();
	let titleScale = $state(1);
	let titleWidth = $state(TARGET_WIDTH);
	let subtitleWidth = $state(2.6);
	let previousSubtitleGeometry: TextGeometry | undefined;

	/** Centers the geometry on X and puts its bottom on y = 0. */
	function centerGeometry(geometry: TextGeometry): { width: number; height: number } {
		geometry.computeBoundingBox();
		const box = geometry.boundingBox;

		if (!box) {
			return { width: 0, height: 0 };
		}

		const width = box.max.x - box.min.x;
		const height = box.max.y - box.min.y;
		geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, 0);

		return { width, height };
	}

	$effect(() => {
		const geometry = titleGeometry;

		if (!geometry) {
			return;
		}

		const { width } = centerGeometry(geometry);
		const scale = width > 0 ? Math.min(1.45, TARGET_WIDTH / width) : 1;
		titleScale = scale;
		titleWidth = width * scale;
	});

	$effect(() => {
		const geometry = subtitleGeometry;

		if (!geometry) {
			return;
		}

		if (previousSubtitleGeometry && previousSubtitleGeometry !== geometry) {
			previousSubtitleGeometry.dispose();
		}

		previousSubtitleGeometry = geometry;

		const { width } = centerGeometry(geometry);
		subtitleWidth = width;
	});

	const { camera } = useCamera();
	const cameraPosition = new Vector3();
	const worldPosition = new Vector3();

	// Each checkpoint bobs with a slightly different phase.
	const phase = id.charCodeAt(id.length - 1) * 0.73;

	let elapsed = 0;
	let intensity = 0;

	useTask((delta) => {
		if (!billboard) {
			return;
		}

		elapsed += delta;
		intensity += ((active ? 1 : 0) - intensity) * Math.min(1, delta * 5);

		const pulse = 0.5 + 0.5 * Math.sin(elapsed * 2.2 + phase);
		const boost = 1 + intensity * 0.55;

		billboard.position.y = LABEL_Y + Math.sin(elapsed * 1.25 + phase) * 0.055;
		billboard.scale.setScalar(1 + intensity * 0.035 + pulse * 0.008);

		// Yaw-only billboard: readable from every side while staying upright.
		billboard.getWorldPosition(worldPosition);
		cameraPosition.copy(camera.current.position);
		billboard.rotation.y =
			Math.atan2(cameraPosition.x - worldPosition.x, cameraPosition.z - worldPosition.z) +
			Math.sin(elapsed * 0.85 + phase) * 0.055;

		if (titleMaterial) {
			titleMaterial.emissiveIntensity = (0.65 + pulse * 0.25) * boost;
		}

		if (subtitleMaterial) {
			subtitleMaterial.opacity = (0.75 + pulse * 0.15) * boost;
		}

		glowMaterial.opacity = (0.26 + pulse * 0.1) * boost;
	});

	$effect(() => {
		return () => {
			glowTexture?.dispose();
			glowGeometry.dispose();
			glowMaterial.dispose();
			titleMaterial?.dispose();
			subtitleMaterial?.dispose();
			titleGeometry?.dispose();
			subtitleGeometry?.dispose();
		};
	});
</script>

<T.Group bind:ref={billboard} position={[0, LABEL_Y, 0]} renderOrder={20}>
	<!-- Colored halo behind the text -->
	<T.Mesh
		position={[0, 0.38, -0.22]}
		scale={[Math.max(titleWidth, subtitleWidth) + 2.4, 1.95, 1]}
		geometry={glowGeometry}
		material={glowMaterial}
		renderOrder={20}
	/>

	<!-- Extruded title -->
	<T.Group position={[0, TITLE_Y, 0]} scale={[titleScale, titleScale, 1]}>
		<T.Mesh castShadow={false} receiveShadow={false}>
			<Text3DGeometry
				bind:ref={titleGeometry}
				text={label}
				font={fontUrl}
				size={titleSize}
				depth={0.2}
				curveSegments={6}
				bevelEnabled
				bevelThickness={0.028}
				bevelSize={0.02}
				bevelOffset={0}
				bevelSegments={2}
			/>
			<T.MeshStandardMaterial
				bind:ref={titleMaterial}
				color={white}
				emissive={baseColor}
				emissiveIntensity={0.75}
				metalness={0.35}
				roughness={0.32}
				toneMapped={false}
			/>
		</T.Mesh>
	</T.Group>

	<!-- Instruction line -->
	<T.Mesh position={[0, 0, 0.02]} renderOrder={22}>
		<Text3DGeometry
			bind:ref={subtitleGeometry}
			text={subtitle}
			font={fontUrl}
			size={subtitleSize}
			depth={0.05}
			curveSegments={4}
			bevelEnabled
			bevelThickness={0.008}
			bevelSize={0.006}
			bevelSegments={1}
		/>
		<T.MeshBasicMaterial
			bind:ref={subtitleMaterial}
			color={white}
			transparent
			opacity={0.92}
			depthWrite={false}
			toneMapped={false}
		/>
	</T.Mesh>
</T.Group>
