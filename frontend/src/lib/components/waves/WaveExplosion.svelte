<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { onDestroy } from 'svelte';
	import {
		AdditiveBlending,
		BufferAttribute,
		BufferGeometry,
		DoubleSide,
		MeshBasicMaterial,
		PointsMaterial,
		RingGeometry,
		SphereGeometry,
		type Mesh,
		type PointLight
	} from 'three';
	import {
		ACID_POOL_RADIUS,
		ARENA_FLOOR_Y,
		GOLEM_ROCK_IMPACT_RADIUS,
		GRENADE_RADIUS
	} from '../../state/wavesConfig';

	interface Props {
		x: number;
		y: number;
		z: number;
		/** `acid` → green splash, `grenade` → orange fireball, `rock` → lava shatter. */
		kind: 'acid' | 'grenade' | 'rock';
		/** Optional gameplay blast radius (defaults to the waves arena value). */
		radius?: number;
		onDone?: () => void;
	}

	let { x, y, z, kind, radius, onDone }: Props = $props();

	// svelte-ignore state_referenced_locally
	const grenade = kind === 'grenade';
	// svelte-ignore state_referenced_locally
	const rock = kind === 'rock';
	const DURATION = grenade ? 1.15 : rock ? 0.85 : 0.9;
	// svelte-ignore state_referenced_locally
	const BLAST =
		radius ?? (grenade ? GRENADE_RADIUS : rock ? GOLEM_ROCK_IMPACT_RADIUS : ACID_POOL_RADIUS);
	const SPARKS = grenade ? 26 : rock ? 20 : 14;
	const SMOKE = grenade ? 12 : rock ? 9 : 6;

	const coreColor = grenade ? 0xfff3c4 : rock ? 0xffd08a : 0xeaffb0;
	const shellColor = grenade ? 0xff6a00 : rock ? 0xff3d00 : 0x84cc16;
	const ringColor = grenade ? 0xffb347 : rock ? 0xff6a00 : 0xa3e635;
	const sparkColor = grenade ? 0xffd166 : rock ? 0xff8a2a : 0xd9f99d;
	const smokeColor = grenade ? 0x2b2b28 : rock ? 0x2a1a12 : 0x1f2b10;

	// --- fireball ---------------------------------------------------------
	const sphereGeometry = new SphereGeometry(1, 20, 14);
	const coreMaterial = new MeshBasicMaterial({
		color: coreColor,
		transparent: true,
		opacity: 0.95,
		depthWrite: false,
		blending: AdditiveBlending
	});
	const shellMaterial = new MeshBasicMaterial({
		color: shellColor,
		transparent: true,
		opacity: 0.7,
		depthWrite: false,
		blending: AdditiveBlending
	});

	// --- shockwave --------------------------------------------------------
	const ringGeometry = new RingGeometry(0.82, 1, 48);
	const ringMaterial = new MeshBasicMaterial({
		color: ringColor,
		transparent: true,
		opacity: 0.85,
		depthWrite: false,
		side: DoubleSide,
		blending: AdditiveBlending
	});
	const ring2Material = ringMaterial.clone();
	ring2Material.opacity = 0.6;

	// --- sparks -----------------------------------------------------------
	const sparkGeometry = new BufferGeometry();
	const sparkPositions = new Float32Array(SPARKS * 3);
	const sparkVelocity = new Float32Array(SPARKS * 3);

	for (let i = 0; i < SPARKS; i += 1) {
		const speed = grenade
			? 4 + Math.random() * 7
			: rock
				? 3 + Math.random() * 5
				: 2 + Math.random() * 3.5;
		const theta = Math.random() * Math.PI * 2;
		const up = 0.35 + Math.random() * 0.9;
		const flat = Math.sqrt(Math.max(0, 1 - up * up));

		sparkPositions[i * 3] = 0;
		sparkPositions[i * 3 + 1] = 0.9;
		sparkPositions[i * 3 + 2] = 0;
		sparkVelocity[i * 3] = Math.cos(theta) * flat * speed;
		sparkVelocity[i * 3 + 1] = up * speed;
		sparkVelocity[i * 3 + 2] = Math.sin(theta) * flat * speed;
	}

	const sparkAttribute = new BufferAttribute(sparkPositions, 3);
	sparkGeometry.setAttribute('position', sparkAttribute);
	const sparkMaterial = new PointsMaterial({
		color: sparkColor,
		size: grenade ? 0.3 : rock ? 0.26 : 0.22,
		transparent: true,
		opacity: 1,
		depthWrite: false,
		blending: AdditiveBlending,
		sizeAttenuation: true
	});

	// --- smoke ------------------------------------------------------------
	const smokeGeometry = new BufferGeometry();
	const smokePositions = new Float32Array(SMOKE * 3);
	const smokeVelocity = new Float32Array(SMOKE * 3);

	for (let i = 0; i < SMOKE; i += 1) {
		const angle = Math.random() * Math.PI * 2;
		const radius = Math.random() * 0.7;

		smokePositions[i * 3] = Math.cos(angle) * radius;
		smokePositions[i * 3 + 1] = 0.8 + Math.random() * 0.5;
		smokePositions[i * 3 + 2] = Math.sin(angle) * radius;
		smokeVelocity[i * 3] = Math.cos(angle) * (0.2 + Math.random() * 0.5);
		smokeVelocity[i * 3 + 1] = 0.6 + Math.random() * 1.1;
		smokeVelocity[i * 3 + 2] = Math.sin(angle) * (0.2 + Math.random() * 0.5);
	}

	const smokeAttribute = new BufferAttribute(smokePositions, 3);
	smokeGeometry.setAttribute('position', smokeAttribute);
	const smokeMaterial = new PointsMaterial({
		color: smokeColor,
		size: 0.7,
		transparent: true,
		opacity: 0.32,
		depthWrite: false,
		sizeAttenuation: true
	});

	let core = $state<Mesh>();
	let shell = $state<Mesh>();
	let ring = $state<Mesh>();
	let ring2 = $state<Mesh>();
	let light = $state<PointLight>();
	let elapsed = 0;
	let active = $state(true);

	useTask((delta) => {
		if (!active) {
			return;
		}

		elapsed += delta;
		const progress = Math.min(1, elapsed / DURATION);
		const ease = 1 - (1 - progress) ** 2;
		const fade = 1 - progress;

		core?.scale.setScalar(0.35 + ease * (grenade ? 2 : rock ? 1.6 : 1.35));
		shell?.scale.setScalar(0.5 + ease * (grenade ? 3 : rock ? 2.35 : 1.95));
		ring?.scale.setScalar(0.3 + ease * (BLAST + 0.5));
		ring2?.scale.setScalar(0.2 + ease * (BLAST * 0.65 + 0.3));

		coreMaterial.opacity = 0.95 * fade ** 1.8;
		shellMaterial.opacity = 0.7 * fade ** 1.15;
		ringMaterial.opacity = 0.85 * fade ** 1.6;
		ring2Material.opacity = 0.6 * fade ** 2.2;

		const gravity = grenade ? 13 : rock ? 14 : 9;

		for (let i = 0; i < SPARKS; i += 1) {
			const index = i * 3;
			sparkVelocity[index + 1] -= gravity * delta;
			sparkPositions[index] += sparkVelocity[index] * delta;
			sparkPositions[index + 1] += sparkVelocity[index + 1] * delta;
			sparkPositions[index + 2] += sparkVelocity[index + 2] * delta;
		}

		sparkAttribute.needsUpdate = true;
		sparkMaterial.opacity = fade ** 1.2;
		sparkMaterial.size = (grenade ? 0.3 : rock ? 0.26 : 0.22) * (0.7 + ease * 0.7);

		for (let i = 0; i < SMOKE; i += 1) {
			const index = i * 3;
			smokeVelocity[index] *= 0.985;
			smokeVelocity[index + 2] *= 0.985;
			smokePositions[index] += smokeVelocity[index] * delta;
			smokePositions[index + 1] += smokeVelocity[index + 1] * delta;
			smokePositions[index + 2] += smokeVelocity[index + 2] * delta;
		}

		smokeAttribute.needsUpdate = true;
		smokeMaterial.opacity = 0.32 * fade ** 1.1;
		smokeMaterial.size = 0.7 + ease * (grenade ? 1.6 : rock ? 1.1 : 0.9);

		// A short light flash: the blast actually lights the ground and the
		// nearby monsters for a few frames instead of only drawing over them.
		if (light) {
			light.intensity = (grenade ? 48 : rock ? 32 : 24) * fade ** 2.4;
		}

		if (progress >= 1) {
			active = false;
			onDone?.();
		}
	});

	onDestroy(() => {
		sphereGeometry.dispose();
		coreMaterial.dispose();
		shellMaterial.dispose();
		ringGeometry.dispose();
		ringMaterial.dispose();
		ring2Material.dispose();
		sparkGeometry.dispose();
		sparkMaterial.dispose();
		smokeGeometry.dispose();
		smokeMaterial.dispose();
	});
</script>

{#if active}
	<T.Group position={[x, Math.max(y, ARENA_FLOOR_Y), z]}>
		<!-- Ground shockwave -->
		<T.Mesh
			bind:ref={ring}
			position={[0, 0.03, 0]}
			rotation={[-Math.PI / 2, 0, 0]}
			geometry={ringGeometry}
			material={ringMaterial}
		/>
		<T.Mesh
			bind:ref={ring2}
			position={[0, 0.045, 0]}
			rotation={[-Math.PI / 2, 0, 0]}
			geometry={ringGeometry}
			material={ring2Material}
		/>

		<!-- Fireball -->
		<T.Mesh
			bind:ref={shell}
			position={[0, 0.9, 0]}
			geometry={sphereGeometry}
			material={shellMaterial}
		/>
		<T.Mesh
			bind:ref={core}
			position={[0, 0.9, 0]}
			geometry={sphereGeometry}
			material={coreMaterial}
		/>

		<!-- Sparks and smoke -->
		<T.Points geometry={sparkGeometry} material={sparkMaterial} frustumCulled={false} />
		<T.Points geometry={smokeGeometry} material={smokeMaterial} frustumCulled={false} />

		<!-- Light flash -->
		<T.PointLight
			bind:ref={light}
			position={[0, 1.1, 0]}
			color={ringColor}
			intensity={grenade ? 48 : rock ? 32 : 24}
			distance={grenade ? 16 : rock ? 11 : 9}
			decay={2}
		/>
	</T.Group>
{/if}
