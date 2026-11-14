<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { untrack } from 'svelte';
	import { Collider } from '@threlte/rapier';
	import type { Collider as RapierCollider } from '@dimforge/rapier3d-compat';
	import {
		AdditiveBlending,
		CanvasTexture,
		CircleGeometry,
		CylinderGeometry,
		DoubleSide,
		MeshBasicMaterial,
		OctahedronGeometry,
		PlaneGeometry,
		RingGeometry,
		SRGBColorSpace,
		TorusGeometry,
		Color,
		type Group,
		type Mesh
	} from 'three';
	import { checkpoints, type CheckpointDefinition } from '../../state/checkpoints.svelte';
	import { playerPhysics } from '../../state/playerPhysics';
	import CheckpointLabel from './CheckpointLabel.svelte';

	let { id, label, position, color, radius }: CheckpointDefinition = $props();

	const active = $derived(checkpoints.activeCheckpointId === id);
	const baseColor = untrack(() => new Color(color));
	const checkpointRadius = untrack(() => radius);
	const white = new Color('#ffffff');

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

	// Ground: tinted disc + soft radial halo.
	const padGeometry = new CircleGeometry(checkpointRadius * 0.92, 64);
	const padMaterial = new MeshBasicMaterial({
		color: baseColor,
		transparent: true,
		opacity: 0.18,
		depthWrite: false,
		toneMapped: false
	});

	const glowGeometry = new PlaneGeometry(checkpointRadius * 3.8, checkpointRadius * 3.8);
	const glowMaterial = new MeshBasicMaterial({
		map: glowTexture,
		color: baseColor,
		transparent: true,
		opacity: 0.55,
		depthWrite: false,
		blending: AdditiveBlending,
		side: DoubleSide,
		toneMapped: false
	});

	// Glow ring + sharp ring + three rotating arcs.
	const ringGlowGeometry = new RingGeometry(checkpointRadius * 0.78, checkpointRadius * 1.12, 64);
	const ringGlowMaterial = new MeshBasicMaterial({
		color: baseColor,
		transparent: true,
		opacity: 0.38,
		depthWrite: false,
		blending: AdditiveBlending,
		side: DoubleSide,
		toneMapped: false
	});

	const ringGeometry = new RingGeometry(checkpointRadius * 0.88, checkpointRadius, 64);
	const ringMaterial = new MeshBasicMaterial({
		color: baseColor,
		transparent: true,
		opacity: 0.9,
		depthWrite: false,
		side: DoubleSide,
		toneMapped: false
	});

	const arcGeometry = new RingGeometry(
		checkpointRadius * 0.95,
		checkpointRadius * 1.05,
		48,
		1,
		0,
		Math.PI * 0.42
	);
	const arcMaterial = new MeshBasicMaterial({
		color: white,
		transparent: true,
		opacity: 0.95,
		depthWrite: false,
		side: DoubleSide,
		toneMapped: false
	});

	// Light column with a vertical gradient.
	const beamGeometry = new CylinderGeometry(
		checkpointRadius * 0.95,
		checkpointRadius * 0.95,
		3,
		32,
		1,
		true
	);
	const beamMaterial = new MeshBasicMaterial({
		map: beamTexture,
		color: baseColor,
		transparent: true,
		opacity: 0.4,
		depthWrite: false,
		blending: AdditiveBlending,
		side: DoubleSide,
		toneMapped: false
	});

	const coreGeometry = new CylinderGeometry(
		checkpointRadius * 0.2,
		checkpointRadius * 0.3,
		3,
		16,
		1,
		true
	);
	const coreMaterial = new MeshBasicMaterial({
		color: white,
		transparent: true,
		opacity: 0.32,
		depthWrite: false,
		blending: AdditiveBlending,
		toneMapped: false
	});

	// Ring that rises from the ground and fades out.
	const pulseGeometry = new TorusGeometry(checkpointRadius * 0.76, 0.03, 8, 64);
	const pulseMaterial = new MeshBasicMaterial({
		color: baseColor,
		transparent: true,
		opacity: 0.45,
		depthWrite: false,
		blending: AdditiveBlending,
		toneMapped: false
	});

	// Floating crystal + aura.
	const crystalGeometry = new OctahedronGeometry(0.3, 0);
	const crystalMaterial = new MeshBasicMaterial({
		color: white,
		transparent: true,
		opacity: 0.95,
		toneMapped: false
	});
	const haloGeometry = new OctahedronGeometry(0.5, 0);
	const haloMaterial = new MeshBasicMaterial({
		color: baseColor,
		transparent: true,
		opacity: 0.24,
		depthWrite: false,
		blending: AdditiveBlending,
		toneMapped: false
	});

	// Orbiting sparks.
	const sparkGeometry = new OctahedronGeometry(0.055, 0);
	const sparkMaterial = new MeshBasicMaterial({
		color: white,
		transparent: true,
		opacity: 0.85,
		depthWrite: false,
		blending: AdditiveBlending,
		toneMapped: false
	});

	const sparks: [number, number, number][] = Array.from({ length: 5 }, (_, index) => {
		const angle = (index / 5) * Math.PI * 2;

		return [
			Math.cos(angle) * checkpointRadius * 0.78,
			0.55 + index * 0.42,
			Math.sin(angle) * checkpointRadius * 0.78
		];
	});

	let glowGroup = $state.raw<Group>();
	let arcsGroup = $state.raw<Group>();
	let crystalGroup = $state.raw<Group>();
	let crystal = $state.raw<Mesh>();
	let orbitGroup = $state.raw<Group>();
	let pulseRing = $state.raw<Mesh>();

	const SENSOR_HEIGHT = 3;
	const SENSOR_HALF_HEIGHT = SENSOR_HEIGHT / 2;
	const SENSOR_Y = 0.1 + SENSOR_HALF_HEIGHT;

	// The sensor detects any collider that passes through it (cars, corn cobs,
	// remote players...). Only the local player's collider should trigger the
	// enter/exit notice.
	function onSensorEnter(event: { targetCollider: RapierCollider }): void {
		if (event.targetCollider !== playerPhysics.collider) return;

		checkpoints.enter(id);
	}

	function onSensorExit(event: { targetCollider: RapierCollider }): void {
		if (event.targetCollider !== playerPhysics.collider) return;

		checkpoints.exit(id);
	}

	let elapsed = 0;
	let intensity = 0;

	useTask((delta) => {
		elapsed += delta;
		intensity += ((active ? 1 : 0) - intensity) * Math.min(1, delta * 5);

		const pulse = 0.5 + 0.5 * Math.sin(elapsed * 2.4);
		const boost = 1 + intensity * 0.9;

		padMaterial.opacity = 0.14 + intensity * 0.16;
		glowMaterial.opacity = Math.min(1, (0.45 + pulse * 0.12) * boost);
		ringGlowMaterial.opacity = Math.min(1, (0.3 + pulse * 0.16) * boost);
		ringMaterial.opacity = Math.min(1, 0.8 + pulse * 0.15 + intensity * 0.1);
		arcMaterial.opacity = Math.min(1, 0.8 + pulse * 0.15 + intensity * 0.1);
		beamMaterial.opacity = Math.min(1, (0.28 + pulse * 0.12) * boost);
		coreMaterial.opacity = Math.min(1, (0.26 + pulse * 0.16) * boost);
		haloMaterial.opacity = Math.min(1, (0.16 + pulse * 0.12) * boost);
		sparkMaterial.opacity = Math.min(1, (0.65 + pulse * 0.3) * boost);

		arcsGroup?.rotation.set(0, elapsed * (0.35 + intensity * 0.55), 0);
		orbitGroup?.rotation.set(0, -elapsed * (0.5 + intensity * 0.45), 0);

		glowGroup?.scale.setScalar(1 + pulse * 0.025 + intensity * 0.04);

		if (crystalGroup) {
			crystalGroup.position.y = 2.68 + Math.sin(elapsed * 1.8) * 0.1;
			crystalGroup.scale.setScalar(1 + intensity * 0.18 + pulse * 0.03);
		}

		if (crystal) {
			crystal.rotation.set(Math.sin(elapsed * 0.8) * 0.25, elapsed * 1.1, 0);
		}

		const pulseProgress = (elapsed * 0.5) % 1;

		if (pulseRing) {
			pulseRing.position.y = 0.12 + pulseProgress * 2.85;
			pulseRing.scale.setScalar(0.8 + pulseProgress * 0.4);
		}

		pulseMaterial.opacity = (1 - pulseProgress) * (0.3 + intensity * 0.5);
	});

	$effect(() => {
		return () => {
			glowTexture?.dispose();
			beamTexture?.dispose();
			padGeometry.dispose();
			glowGeometry.dispose();
			ringGlowGeometry.dispose();
			ringGeometry.dispose();
			arcGeometry.dispose();
			beamGeometry.dispose();
			coreGeometry.dispose();
			pulseGeometry.dispose();
			crystalGeometry.dispose();
			haloGeometry.dispose();
			sparkGeometry.dispose();
			padMaterial.dispose();
			glowMaterial.dispose();
			ringGlowMaterial.dispose();
			ringMaterial.dispose();
			arcMaterial.dispose();
			beamMaterial.dispose();
			coreMaterial.dispose();
			pulseMaterial.dispose();
			crystalMaterial.dispose();
			haloMaterial.dispose();
			sparkMaterial.dispose();
		};
	});
</script>

<T.Group {position}>
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

	<!-- Ring glow -->
	<T.Mesh
		renderOrder={2}
		position={[0, 0.04, 0]}
		rotation={[-Math.PI / 2, 0, 0]}
		geometry={ringGlowGeometry}
		material={ringGlowMaterial}
	/>

	<!-- Sharp ring -->
	<T.Mesh
		renderOrder={3}
		position={[0, 0.05, 0]}
		rotation={[-Math.PI / 2, 0, 0]}
		geometry={ringGeometry}
		material={ringMaterial}
	/>

	<!-- Rotating arcs -->
	<T.Group bind:ref={arcsGroup} position={[0, 0.07, 0]}>
		<T.Group rotation={[-Math.PI / 2, 0, 0]}>
			{#each [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3] as angle}
				<T.Mesh
					renderOrder={4}
					rotation={[0, 0, angle]}
					geometry={arcGeometry}
					material={arcMaterial}
				/>
			{/each}
		</T.Group>
	</T.Group>

	<!-- Energy column and core -->
	<T.Mesh
		renderOrder={5}
		position={[0, SENSOR_Y, 0]}
		geometry={beamGeometry}
		material={beamMaterial}
	/>
	<T.Mesh
		renderOrder={6}
		position={[0, SENSOR_Y, 0]}
		geometry={coreGeometry}
		material={coreMaterial}
	/>

	<!-- Rising ring -->
	<T.Mesh
		bind:ref={pulseRing}
		renderOrder={7}
		rotation={[-Math.PI / 2, 0, 0]}
		geometry={pulseGeometry}
		material={pulseMaterial}
	/>

	<!-- Floating crystal -->
	<T.Group bind:ref={crystalGroup} position={[0, 2.68, 0]}>
		<T.Mesh
			bind:ref={crystal}
			renderOrder={8}
			geometry={crystalGeometry}
			material={crystalMaterial}
		/>
		<T.Mesh renderOrder={9} scale={1.55} geometry={haloGeometry} material={haloMaterial} />
	</T.Group>

	<!-- Orbiting sparks -->
	<T.Group bind:ref={orbitGroup}>
		{#each sparks as spark}
			<T.Mesh renderOrder={10} position={spark} geometry={sparkGeometry} material={sparkMaterial} />
		{/each}
	</T.Group>

	<!-- Floating 3D sign with the minigame name -->
	<CheckpointLabel {id} {label} {color} />

	<!-- Rapier sensor: watches the player's entry and exit -->
	<T.Group position={[0, SENSOR_Y, 0]}>
		<Collider
			shape="cylinder"
			args={[SENSOR_HALF_HEIGHT, radius]}
			type="static"
			sensor
			onsensorenter={onSensorEnter}
			onsensorexit={onSensorExit}
		/>
	</T.Group>
</T.Group>
