<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { Collider } from '@threlte/rapier';
	import { untrack } from 'svelte';
	import {
		AdditiveBlending,
		CanvasTexture,
		CircleGeometry,
		Color,
		CylinderGeometry,
		DoubleSide,
		MeshBasicMaterial,
		MeshStandardMaterial,
		RingGeometry,
		SRGBColorSpace,
		SpriteMaterial,
		TorusGeometry,
		type Mesh,
		type Sprite
	} from 'three';
	import { clubMusic } from '../../state/clubMusic.svelte';
	import { playerState } from '../../state/playerState';
	import { sceneState } from '../../state/sceneState.svelte';

	/** Dance floor, right in front of the DJ booth. */
	const BOOTH_POSITION: [number, number, number] = [6.4, 0.06, -12.6];
	const NEARBY_RADIUS = 2.9;
	const NEARBY_HEIGHT = 2.4;

	const pink = untrack(() => new Color('#ff2fd6'));
	const cyan = untrack(() => new Color('#22d3ee'));

	function createLabelTexture(): CanvasTexture | null {
		if (typeof document === 'undefined') {
			return null;
		}

		const width = 1024;
		const height = 256;
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d');

		if (!context) {
			return null;
		}

		context.clearRect(0, 0, width, height);

		// Rounded translucent plate.
		const radius = 36;
		context.beginPath();
		context.roundRect(18, 18, width - 36, height - 36, radius);
		context.fillStyle = 'rgba(10, 8, 22, 0.82)';
		context.fill();
		context.lineWidth = 8;
		context.strokeStyle = 'rgba(255, 47, 214, 0.92)';
		context.stroke();

		// Soft inner glow line.
		context.beginPath();
		context.roundRect(32, 32, width - 64, height - 64, radius - 10);
		context.lineWidth = 2;
		context.strokeStyle = 'rgba(34, 211, 238, 0.55)';
		context.stroke();

		context.textAlign = 'center';
		context.textBaseline = 'middle';
		context.font = 'bold 104px system-ui, sans-serif';
		context.shadowColor = 'rgba(255, 47, 214, 0.9)';
		context.shadowBlur = 26;
		context.fillStyle = '#ffffff';
		context.fillText('CLUB JUKEBOX', width / 2, 112);
		context.shadowBlur = 0;

		context.font = 'bold 42px system-ui, sans-serif';
		context.fillStyle = '#8df6ff';
		context.fillText('PRESS E TO PICK A TRACK', width / 2, 192);

		const texture = new CanvasTexture(canvas);
		texture.colorSpace = SRGBColorSpace;

		return texture;
	}

	const labelTexture = createLabelTexture();
	const labelMaterial = new SpriteMaterial({
		map: labelTexture,
		transparent: true,
		depthWrite: false,
		toneMapped: false
	});

	// Base cabinet.
	const cabinetGeometry = new CylinderGeometry(0.78, 0.86, 0.95, 32);
	const cabinetMaterial = new MeshStandardMaterial({
		color: '#161022',
		metalness: 0.65,
		roughness: 0.32,
		emissive: pink,
		emissiveIntensity: 0.06
	});

	// Top plate.
	const topGeometry = new CylinderGeometry(0.8, 0.8, 0.12, 32);
	const topMaterial = new MeshStandardMaterial({
		color: '#241a38',
		metalness: 0.8,
		roughness: 0.2
	});

	// Turntables.
	const platterGeometry = new CylinderGeometry(0.27, 0.27, 0.05, 32);
	const platterMaterial = new MeshStandardMaterial({
		color: '#0b0b12',
		metalness: 0.9,
		roughness: 0.25,
		emissive: cyan,
		emissiveIntensity: 0.12
	});
	const labelDotGeometry = new CylinderGeometry(0.09, 0.09, 0.06, 24);
	const labelDotMaterial = new MeshStandardMaterial({
		color: '#ff2fd6',
		emissive: pink,
		emissiveIntensity: 1.4,
		toneMapped: false
	});

	// Neon rings.
	const neonGeometry = new TorusGeometry(0.92, 0.028, 10, 64);
	const neonMaterial = new MeshBasicMaterial({
		color: pink,
		transparent: true,
		opacity: 0.85,
		depthWrite: false,
		blending: AdditiveBlending,
		toneMapped: false
	});
	const floorRingGeometry = new RingGeometry(1.05, 1.22, 64);
	const floorRingMaterial = new MeshBasicMaterial({
		color: cyan,
		transparent: true,
		opacity: 0.35,
		depthWrite: false,
		blending: AdditiveBlending,
		side: DoubleSide,
		toneMapped: false
	});
	const floorGlowGeometry = new CircleGeometry(1.7, 48);
	const floorGlowMaterial = new MeshBasicMaterial({
		color: pink,
		transparent: true,
		opacity: 0.12,
		depthWrite: false,
		blending: AdditiveBlending,
		side: DoubleSide,
		toneMapped: false
	});

	let neonRing = $state.raw<Mesh>();
	let floorRing = $state.raw<Mesh>();
	let leftPlatter = $state.raw<Mesh>();
	let rightPlatter = $state.raw<Mesh>();
	let labelSprite = $state.raw<Sprite>();
	let elapsed = 0;
	let wasNearby = false;

	useTask((delta) => {
		elapsed += delta;

		const dx = playerState.x - BOOTH_POSITION[0];
		const dz = playerState.z - BOOTH_POSITION[2];
		const dy = Math.abs(playerState.y - BOOTH_POSITION[1]);
		const nearby = sceneState.inHub && Math.hypot(dx, dz) <= NEARBY_RADIUS && dy <= NEARBY_HEIGHT;

		if (nearby !== wasNearby) {
			wasNearby = nearby;
			clubMusic.setNearby(nearby);
		}

		const pulse = 0.5 + 0.5 * Math.sin(elapsed * 2.6);
		const active = clubMusic.playing && clubMusic.hasTracks ? 1 : 0;
		const spin = delta * (0.9 + active * 1.8);

		if (leftPlatter) {
			leftPlatter.rotation.y -= spin;
		}

		if (rightPlatter) {
			rightPlatter.rotation.y += spin;
		}

		if (neonRing) {
			neonRing.rotation.z = elapsed * 0.6;
		}

		if (floorRing) {
			floorRing.rotation.z = -elapsed * 0.35;
		}

		neonMaterial.opacity = 0.6 + pulse * 0.35;
		floorRingMaterial.opacity = 0.22 + pulse * 0.18 + active * 0.12;
		floorGlowMaterial.opacity = 0.08 + pulse * 0.06 + active * 0.08;
		labelDotMaterial.emissiveIntensity = 0.9 + pulse * 0.9;

		if (labelSprite) {
			labelSprite.position.y = 2.55 + Math.sin(elapsed * 1.5) * 0.06;
			const factor = (1 + pulse * 0.012) * (nearby ? 1.04 : 1);
			labelSprite.scale.set(4.1 * factor, 1.025 * factor, 1);
		}
	});

	$effect(() => {
		return () => {
			clubMusic.setNearby(false);
			labelTexture?.dispose();
			labelMaterial.dispose();
			cabinetGeometry.dispose();
			cabinetMaterial.dispose();
			topGeometry.dispose();
			topMaterial.dispose();
			platterGeometry.dispose();
			platterMaterial.dispose();
			labelDotGeometry.dispose();
			labelDotMaterial.dispose();
			neonGeometry.dispose();
			neonMaterial.dispose();
			floorRingGeometry.dispose();
			floorRingMaterial.dispose();
			floorGlowGeometry.dispose();
			floorGlowMaterial.dispose();
		};
	});
</script>

<T.Group position={BOOTH_POSITION}>
	<!-- Floor halo + pulsing ring -->
	<T.Mesh
		rotation={[-Math.PI / 2, 0, 0]}
		position={[0, 0.005, 0]}
		geometry={floorGlowGeometry}
		material={floorGlowMaterial}
		renderOrder={3}
	/>
	<T.Mesh
		bind:ref={floorRing}
		rotation={[-Math.PI / 2, 0, 0]}
		position={[0, 0.02, 0]}
		geometry={floorRingGeometry}
		material={floorRingMaterial}
		renderOrder={4}
	/>

	<!-- Cabinet -->
	<T.Mesh
		position={[0, 0.475, 0]}
		geometry={cabinetGeometry}
		material={cabinetMaterial}
		castShadow
		receiveShadow
	/>
	<T.Mesh position={[0, 1.01, 0]} geometry={topGeometry} material={topMaterial} castShadow />

	<!-- Turntables -->
	<T.Mesh
		bind:ref={leftPlatter}
		position={[-0.34, 1.085, 0.05]}
		geometry={platterGeometry}
		material={platterMaterial}
	/>
	<T.Mesh
		bind:ref={rightPlatter}
		position={[0.34, 1.085, 0.05]}
		geometry={platterGeometry}
		material={platterMaterial}
	/>
	<T.Mesh position={[-0.34, 1.12, 0.05]} geometry={labelDotGeometry} material={labelDotMaterial} />
	<T.Mesh position={[0.34, 1.12, 0.05]} geometry={labelDotGeometry} material={labelDotMaterial} />

	<!-- Neon ring -->
	<T.Mesh
		bind:ref={neonRing}
		rotation={[Math.PI / 2, 0, 0]}
		position={[0, 0.18, 0]}
		geometry={neonGeometry}
		material={neonMaterial}
		renderOrder={6}
	/>

	<!-- Floating sign -->
	<T.Sprite
		bind:ref={labelSprite}
		position={[0, 2.55, 0]}
		scale={[4.1, 1.025, 1]}
		material={labelMaterial}
		renderOrder={20}
	/>

	<!-- Static collider so the player cannot walk through the cabinet -->
	<T.Group position={[0, 0.5, 0]}>
		<Collider shape="cylinder" args={[0.5, 0.82]} type="static" />
	</T.Group>
</T.Group>
