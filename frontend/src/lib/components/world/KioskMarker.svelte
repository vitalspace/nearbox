<script lang="ts">
	import { T, useCamera, useTask } from '@threlte/core';
	import { untrack } from 'svelte';
	import {
		AdditiveBlending,
		BoxGeometry,
		CanvasTexture,
		CircleGeometry,
		Color,
		CylinderGeometry,
		DoubleSide,
		MeshBasicMaterial,
		OctahedronGeometry,
		PlaneGeometry,
		RingGeometry,
		SRGBColorSpace,
		SphereGeometry,
		TorusGeometry,
		Vector3,
		type Group,
		type Mesh
	} from 'three';
	import type { KioskDefinition } from '../../state/hubKiosks.svelte';
	import KioskLabel from './KioskLabel.svelte';

	interface Props {
		kiosk: KioskDefinition;
		active?: boolean;
	}

	let { kiosk, active = false }: Props = $props();

	// The interaction radius (3.2 m) is intentionally larger than the visual
	// pad so the prompt appears before the player is standing on the marker.
	const PAD_RADIUS = 1.55;
	const BEAM_HEIGHT = 2.6;
	const ICON_Y = 2.05;

	const baseColor = untrack(() => new Color(kiosk.color));
	const white = untrack(() => new Color('#ffffff'));
	const isShop = untrack(() => kiosk.id === 'shop');

	function createRadialGlowTexture(): CanvasTexture | null {
		if (typeof document === 'undefined') {
			return null;
		}

		const size = 256;
		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;

		const context = canvas.getContext('2d');

		if (!context) {
			return null;
		}

		const gradient = context.createRadialGradient(
			size / 2,
			size / 2,
			0,
			size / 2,
			size / 2,
			size / 2
		);
		gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
		gradient.addColorStop(0.35, 'rgba(255, 255, 255, 0.4)');
		gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.1)');
		gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

		context.fillStyle = gradient;
		context.fillRect(0, 0, size, size);

		const texture = new CanvasTexture(canvas);
		texture.colorSpace = SRGBColorSpace;

		return texture;
	}

	function createBeamTexture(): CanvasTexture | null {
		if (typeof document === 'undefined') {
			return null;
		}

		const width = 8;
		const height = 256;
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;

		const context = canvas.getContext('2d');

		if (!context) {
			return null;
		}

		const gradient = context.createLinearGradient(0, 0, 0, height);
		gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
		gradient.addColorStop(0.12, 'rgba(255, 255, 255, 0.5)');
		gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.95)');
		gradient.addColorStop(0.88, 'rgba(255, 255, 255, 0.5)');
		gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

		context.fillStyle = gradient;
		context.fillRect(0, 0, width, height);

		const texture = new CanvasTexture(canvas);
		texture.colorSpace = SRGBColorSpace;

		return texture;
	}

	const glowTexture = createRadialGlowTexture();
	const beamTexture = createBeamTexture();

	const padGeometry = new CircleGeometry(PAD_RADIUS * 0.92, 64);
	const padMaterial = new MeshBasicMaterial({
		color: baseColor,
		transparent: true,
		opacity: 0.18,
		depthWrite: false,
		toneMapped: false
	});

	const glowGeometry = new PlaneGeometry(PAD_RADIUS * 3.6, PAD_RADIUS * 3.6);
	const glowMaterial = new MeshBasicMaterial({
		map: glowTexture,
		color: baseColor,
		transparent: true,
		opacity: 0.5,
		depthWrite: false,
		blending: AdditiveBlending,
		side: DoubleSide,
		toneMapped: false
	});

	const ringGlowGeometry = new RingGeometry(PAD_RADIUS * 0.8, PAD_RADIUS * 1.1, 64);
	const ringGlowMaterial = new MeshBasicMaterial({
		color: baseColor,
		transparent: true,
		opacity: 0.35,
		depthWrite: false,
		blending: AdditiveBlending,
		side: DoubleSide,
		toneMapped: false
	});

	const ringGeometry = new RingGeometry(PAD_RADIUS * 0.9, PAD_RADIUS, 64);
	const ringMaterial = new MeshBasicMaterial({
		color: baseColor,
		transparent: true,
		opacity: 0.9,
		depthWrite: false,
		side: DoubleSide,
		toneMapped: false
	});

	const beamGeometry = new CylinderGeometry(
		PAD_RADIUS * 0.9,
		PAD_RADIUS * 0.9,
		BEAM_HEIGHT,
		32,
		1,
		true
	);
	const beamMaterial = new MeshBasicMaterial({
		map: beamTexture,
		color: baseColor,
		transparent: true,
		opacity: 0.38,
		depthWrite: false,
		blending: AdditiveBlending,
		side: DoubleSide,
		toneMapped: false
	});

	const pulseGeometry = new TorusGeometry(PAD_RADIUS * 0.78, 0.026, 8, 64);
	const pulseMaterial = new MeshBasicMaterial({
		color: baseColor,
		transparent: true,
		opacity: 0.4,
		depthWrite: false,
		blending: AdditiveBlending,
		toneMapped: false
	});

	// Floating icon: a shopping bag for the shop and a compass for tourism.
	const bagBodyGeometry = isShop ? new BoxGeometry(0.46, 0.4, 0.16) : null;
	const bagHandleGeometry = isShop ? new TorusGeometry(0.17, 0.032, 8, 24, Math.PI) : null;
	const bagStrapGeometry = isShop ? new BoxGeometry(0.05, 0.12, 0.17) : null;
	const compassRingGeometry = isShop ? null : new TorusGeometry(0.24, 0.034, 8, 32);
	const compassNeedleGeometry = isShop ? null : new OctahedronGeometry(0.15, 0);
	const compassDotGeometry = isShop ? null : new SphereGeometry(0.045, 12, 12);

	const iconMaterial = new MeshBasicMaterial({
		color: white,
		transparent: true,
		opacity: 0.95,
		toneMapped: false
	});
	const iconAccentMaterial = new MeshBasicMaterial({
		color: baseColor,
		transparent: true,
		opacity: 0.92,
		depthWrite: false,
		blending: AdditiveBlending,
		toneMapped: false
	});

	let glowGroup = $state.raw<Group>();
	let iconGroup = $state.raw<Group>();
	let pulseRing = $state.raw<Mesh>();

	const { camera } = useCamera();
	const iconWorld = new Vector3();
	const cameraPosition = new Vector3();

	const spin = isShop ? 0.7 : 0;
	const phase = untrack(() => (kiosk.label.charCodeAt(0) + kiosk.label.length) * 0.41);

	let elapsed = 0;
	let intensity = 0;

	useTask((delta) => {
		elapsed += delta;
		intensity += ((active ? 1 : 0) - intensity) * Math.min(1, delta * 5);

		const pulse = 0.5 + 0.5 * Math.sin(elapsed * 2.3 + phase);
		const boost = 1 + intensity * 0.85;

		padMaterial.opacity = 0.14 + intensity * 0.12;
		glowMaterial.opacity = Math.min(1, (0.4 + pulse * 0.12) * boost);
		ringGlowMaterial.opacity = Math.min(1, (0.28 + pulse * 0.14) * boost);
		ringMaterial.opacity = Math.min(1, 0.78 + pulse * 0.14 + intensity * 0.08);
		beamMaterial.opacity = Math.min(1, (0.26 + pulse * 0.1) * boost);

		if (glowGroup) {
			glowGroup.scale.setScalar(1 + pulse * 0.02 + intensity * 0.03);
		}

		const pulseProgress = (elapsed * 0.48) % 1;

		if (pulseRing) {
			pulseRing.position.y = 0.1 + pulseProgress * (BEAM_HEIGHT - 0.25);
			pulseRing.scale.setScalar(0.8 + pulseProgress * 0.38);
		}

		pulseMaterial.opacity = (1 - pulseProgress) * (0.28 + intensity * 0.45);

		if (!iconGroup) {
			return;
		}

		iconGroup.position.y = ICON_Y + Math.sin(elapsed * 1.6 + phase) * 0.075;
		iconGroup.scale.setScalar(1 + intensity * 0.12 + pulse * 0.02);

		if (isShop) {
			iconGroup.rotation.y = elapsed * spin;
			iconGroup.rotation.z = Math.sin(elapsed * 0.9 + phase) * 0.08;
		} else {
			// A compass is flat; keep it facing the camera so it reads from any
			// side of the office.
			iconGroup.getWorldPosition(iconWorld);
			cameraPosition.copy(camera.current.position);
			iconGroup.rotation.y = Math.atan2(
				cameraPosition.x - iconWorld.x,
				cameraPosition.z - iconWorld.z
			);
			iconGroup.rotation.z = Math.sin(elapsed * 0.9 + phase) * 0.1;
		}
	});

	$effect(() => {
		return () => {
			glowTexture?.dispose();
			beamTexture?.dispose();
			padGeometry.dispose();
			glowGeometry.dispose();
			ringGlowGeometry.dispose();
			ringGeometry.dispose();
			beamGeometry.dispose();
			pulseGeometry.dispose();
			bagBodyGeometry?.dispose();
			bagHandleGeometry?.dispose();
			bagStrapGeometry?.dispose();
			compassRingGeometry?.dispose();
			compassNeedleGeometry?.dispose();
			compassDotGeometry?.dispose();
			padMaterial.dispose();
			glowMaterial.dispose();
			ringGlowMaterial.dispose();
			ringMaterial.dispose();
			beamMaterial.dispose();
			pulseMaterial.dispose();
			iconMaterial.dispose();
			iconAccentMaterial.dispose();
		};
	});
</script>

<T.Group position={kiosk.position}>
	<!-- Tinted disc -->
	<T.Mesh
		renderOrder={0}
		position={[0, 0.012, 0]}
		rotation={[-Math.PI / 2, 0, 0]}
		geometry={padGeometry}
		material={padMaterial}
	/>

	<!-- Soft halo on the ground -->
	<T.Group bind:ref={glowGroup} position={[0, 0.015, 0]}>
		<T.Mesh
			renderOrder={1}
			rotation={[-Math.PI / 2, 0, 0]}
			geometry={glowGeometry}
			material={glowMaterial}
		/>
	</T.Group>

	<!-- Ring glow and sharp ring -->
	<T.Mesh
		renderOrder={2}
		position={[0, 0.04, 0]}
		rotation={[-Math.PI / 2, 0, 0]}
		geometry={ringGlowGeometry}
		material={ringGlowMaterial}
	/>
	<T.Mesh
		renderOrder={3}
		position={[0, 0.05, 0]}
		rotation={[-Math.PI / 2, 0, 0]}
		geometry={ringGeometry}
		material={ringMaterial}
	/>

	<!-- Vertical beam -->
	<T.Mesh
		renderOrder={4}
		position={[0, BEAM_HEIGHT / 2, 0]}
		geometry={beamGeometry}
		material={beamMaterial}
	/>

	<!-- Rising ring -->
	<T.Mesh
		bind:ref={pulseRing}
		renderOrder={5}
		rotation={[-Math.PI / 2, 0, 0]}
		geometry={pulseGeometry}
		material={pulseMaterial}
	/>

	<!-- Floating icon -->
	<T.Group bind:ref={iconGroup} position={[0, ICON_Y, 0]}>
		{#if isShop}
			<T.Mesh geometry={bagBodyGeometry ?? undefined} material={iconAccentMaterial} />
			<T.Mesh
				position={[0, 0.2, 0]}
				geometry={bagHandleGeometry ?? undefined}
				material={iconMaterial}
			/>
			<T.Mesh
				position={[-0.13, 0.2, 0]}
				geometry={bagStrapGeometry ?? undefined}
				material={iconMaterial}
			/>
			<T.Mesh
				position={[0.13, 0.2, 0]}
				geometry={bagStrapGeometry ?? undefined}
				material={iconMaterial}
			/>
		{:else}
			<T.Mesh geometry={compassRingGeometry ?? undefined} material={iconMaterial} />
			<T.Mesh
				scale={[0.72, 1.35, 0.72]}
				geometry={compassNeedleGeometry ?? undefined}
				material={iconAccentMaterial}
			/>
			<T.Mesh geometry={compassDotGeometry ?? undefined} material={iconMaterial} />
		{/if}
	</T.Group>

	<!-- Floating 3D sign -->
	<KioskLabel label={kiosk.label} subtitle={kiosk.subtitle} color={kiosk.color} {active} />
</T.Group>
