<script lang="ts">
	import { T, useCamera, useTask } from '@threlte/core';
	import { Text3DGeometry } from '@threlte/extras';
	import { untrack } from 'svelte';
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

	interface Props {
		label: string;
		subtitle: string;
		color: string;
		active?: boolean;
	}

	let { label, subtitle, color, active = false }: Props = $props();

	const fontUrl = asset('fonts/helvetiker_bold.typeface.json');

	const baseColor = untrack(() => new Color(color));
	const white = new Color('#ffffff');

	// Layout inside the billboard group: subtitle baseline at y = 0 and the
	// extruded title right above it. The whole sign floats above the pad.
	const LABEL_Y = 3.55;
	const TITLE_Y = 0.46;
	const TARGET_WIDTH = 5.6;
	const titleSize = 0.38;
	const subtitleSize = 0.19;

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

		const gradient = context.createLinearGradient(0, 0, width, 0);
		gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
		gradient.addColorStop(0.18, 'rgba(255, 255, 255, 0.25)');
		gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.85)');
		gradient.addColorStop(0.82, 'rgba(255, 255, 255, 0.25)');
		gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
		context.fillStyle = gradient;
		context.fillRect(0, 0, width, height);

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
		opacity: 0.32,
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
	let subtitleWidth = $state(2.8);
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
		const scale = width > 0 ? Math.min(1.35, TARGET_WIDTH / width) : 1;
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

	const phase = untrack(() => (label.charCodeAt(0) + label.length) * 0.37);

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

		billboard.position.y = LABEL_Y + Math.sin(elapsed * 1.25 + phase) * 0.05;
		billboard.scale.setScalar(1 + intensity * 0.03 + pulse * 0.008);

		billboard.getWorldPosition(worldPosition);
		cameraPosition.copy(camera.current.position);
		billboard.rotation.y =
			Math.atan2(cameraPosition.x - worldPosition.x, cameraPosition.z - worldPosition.z) +
			Math.sin(elapsed * 0.8 + phase) * 0.05;

		if (titleMaterial) {
			titleMaterial.emissiveIntensity = (0.65 + pulse * 0.22) * boost;
		}

		if (subtitleMaterial) {
			subtitleMaterial.opacity = (0.75 + pulse * 0.15) * boost;
		}

		glowMaterial.opacity = (0.24 + pulse * 0.1) * boost;
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
	<T.Mesh
		position={[0, 0.36, -0.22]}
		scale={[Math.max(titleWidth, subtitleWidth) + 2.2, 1.9, 1]}
		geometry={glowGeometry}
		material={glowMaterial}
		renderOrder={20}
	/>

	<T.Group position={[0, TITLE_Y, 0]} scale={[titleScale, titleScale, 1]}>
		<T.Mesh castShadow={false} receiveShadow={false}>
			<Text3DGeometry
				bind:ref={titleGeometry}
				text={label}
				font={fontUrl}
				size={titleSize}
				depth={0.18}
				curveSegments={6}
				bevelEnabled
				bevelThickness={0.026}
				bevelSize={0.018}
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

	<T.Mesh position={[0, 0, 0.02]} renderOrder={22}>
		<Text3DGeometry
			bind:ref={subtitleGeometry}
			text={subtitle}
			font={fontUrl}
			size={subtitleSize}
			depth={0.045}
			curveSegments={4}
			bevelEnabled
			bevelThickness={0.007}
			bevelSize={0.005}
			bevelSegments={1}
		/>
		<T.MeshBasicMaterial
			bind:ref={subtitleMaterial}
			color={white}
			transparent
			opacity={0.9}
			depthWrite={false}
			toneMapped={false}
		/>
	</T.Mesh>
</T.Group>
