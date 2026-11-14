<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import type { Readable } from 'svelte/store';
	import { Group, type AnimationAction, type PerspectiveCamera } from 'three';
	import type { SkinId } from '../../cosmetics/skins';
	import { CAR_MODEL_URLS } from '../../state/carConfig';
	import type { HeroAnimation } from '../../services/protocol';
	import CarModel from '../cars/CarModel.svelte';
	import PlayerSkin from '../player/PlayerSkin.svelte';
	import Cat from '../world/Cat.svelte';
	import type { OnboardingPreviewKind } from './onboardingTutorial';

	interface Props {
		kind: OnboardingPreviewKind;
	}

	let { kind }: Props = $props();

	const ACCENTS: Record<OnboardingPreviewKind, { ring: string; point: string }> = {
		village: { ring: '#fbbf24', point: '#fbbf24' },
		cats: { ring: '#fbbf24', point: '#fb923c' },
		race: { ring: '#fb7185', point: '#f43f5e' },
		roadmap: { ring: '#22d3ee', point: '#06b6d4' },
		crypt: { ring: '#a78bfa', point: '#8b5cf6' },
		barn: { ring: '#fb923c', point: '#f97316' },
		deathmatch: { ring: '#a855f7', point: '#c084fc' },
		parkour: { ring: '#eab308', point: '#f59e0b' }
	};

	const CAMERAS: Record<
		OnboardingPreviewKind,
		{ position: [number, number, number]; target: [number, number, number] }
	> = {
		village: { position: [0, 1.3, 5.2], target: [0, 1.1, 0] },
		cats: { position: [0, 1.05, 3], target: [0, 0.45, 0] },
		race: { position: [0, 3.2, 11.5], target: [0, 1.05, 0] },
		roadmap: { position: [0, 3.4, 11.5], target: [0, 1.1, 0] },
		crypt: { position: [0, 1.3, 5.2], target: [0, 1.1, 0] },
		barn: { position: [0, 1.3, 5.2], target: [0, 1.1, 0] },
		deathmatch: { position: [0, 1.5, 5.4], target: [0, 1.15, 0] },
		parkour: { position: [0, 3.6, 13.2], target: [0, 2.0, 0] }
	};

	const CHARACTER_SKINS: Partial<Record<OnboardingPreviewKind, SkinId>> = {
		village: 'hero',
		crypt: 'mummy',
		barn: 'crow-warden',
		deathmatch: 'witch',
		parkour: 'hero'
	};

	// Two floating steps and the spire of the parkour preview. Everything is
	// procedural so the onboarding never has to load the 22 MB Parkour.glb.
	const PARKOUR_STEPS: readonly { position: [number, number, number]; size: number }[] = [
		{ position: [-1.25, 0.16, 1.15], size: 0.95 },
		{ position: [-0.25, 0.62, 0.6], size: 0.8 }
	];

	const PARKOUR_WINDOWS: readonly {
		position: [number, number, number];
		rotation: [number, number, number];
	}[] = [
		{ position: [0, 0.78, 0.69], rotation: [0, 0, 0] },
		{ position: [-0.58, 1.72, 0.2], rotation: [0, -1.22, 0] },
		{ position: [0.58, 1.72, 0.2], rotation: [0, 1.22, 0] }
	];

	// The cat GLB is sculpted looking towards -X. Rotating it +1 rad around Y
	// makes its face point at the tutorial camera (+Z) instead of showing its
	// side.
	const CAT_PREVIEW_YAW = 1;

	const accent = $derived(ACCENTS[kind]);
	const framing = $derived(CAMERAS[kind]);
	const characterSkin = $derived(CHARACTER_SKINS[kind] ?? null);
	const isCar = $derived(kind === 'race' || kind === 'roadmap');
	const isDiorama = $derived(kind === 'parkour');
	const hasPlatform = $derived(!isCar);
	const platformRadius = $derived(kind === 'parkour' ? 2.3 : kind === 'cats' ? 1.1 : 1.6);

	let camera = $state<PerspectiveCamera>();
	let characterActions = $state<
		Readable<Partial<Record<HeroAnimation, AnimationAction>>> | undefined
	>();
	let currentAction: AnimationAction | null = null;

	const turntable = new Group();
	let elapsed = 0;

	$effect(() => {
		const target = framing.target;
		camera?.lookAt(target[0], target[1], target[2]);
	});

	// Play the idle clip of the showcased character so it does not stand in a
	// T-pose. The stage is keyed by `kind` in the wrapper, so this only runs
	// once per step.
	$effect(() => {
		const store = characterActions;

		if (!store) {
			return;
		}

		const unsubscribe = store.subscribe(($actions) => {
			const idle = $actions?.HR_idle;

			if (!idle || idle === currentAction) {
				return;
			}

			currentAction?.fadeOut(0.2);
			idle.reset().fadeIn(0.2).play();
			currentAction = idle;
		});

		return () => {
			unsubscribe();
			currentAction?.stop();
			currentAction = null;
		};
	});

	// Characters sway gently; cars rotate on a turntable so the model can be
	// seen from every side during the tutorial. The cat sways less so it stays
	// facing the camera, and the parkour diorama turns slowly to show the
	// floating steps and the spire.
	useTask((delta) => {
		elapsed += delta;
		const sway = kind === 'cats' ? 0.12 : 0.55;
		turntable.rotation.y = isCar
			? Math.PI + elapsed * 0.22
			: isDiorama
				? Math.sin(elapsed * 0.32) * 0.4
				: Math.sin(elapsed * 0.45) * sway;
	});
</script>

<T.PerspectiveCamera
	makeDefault
	bind:ref={camera}
	position={framing.position}
	fov={30}
	near={0.1}
	far={40}
/>

<T.AmbientLight intensity={1.5} />
<T.DirectionalLight position={[3.5, 6, 4]} intensity={2.6} castShadow />
<T.DirectionalLight position={[-4, 2.5, -3]} intensity={1.4} color="#c4b5fd" />
<T.PointLight position={[0, 2.8, 3.2]} intensity={8} distance={14} decay={2} color={accent.point} />

{#if kind === 'deathmatch'}
	<!-- Second team light so the Coven (purple) and Hunters (cyan) colours read. -->
	<T.PointLight position={[1.4, 1.6, 1.2]} intensity={4} distance={6} decay={2} color="#22d3ee" />
{/if}

{#if hasPlatform}
	<!-- Soft platform that grounds the character or the cat. -->
	<T.Mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} receiveShadow>
		<T.CircleGeometry args={[platformRadius, 64]} />
		<T.MeshStandardMaterial
			color="#0b1020"
			transparent
			opacity={0.85}
			roughness={0.9}
			metalness={0}
		/>
	</T.Mesh>
	<T.Mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
		<T.RingGeometry args={[platformRadius - 0.06, platformRadius + 0.04, 64]} />
		<T.MeshBasicMaterial color={accent.ring} transparent opacity={0.45} />
	</T.Mesh>
{/if}

<T is={turntable}>
	{#if kind === 'deathmatch'}
		<!-- Team beacons: purple Coven and cyan Hunters. -->
		<T.Group position={[-1.3, 0, -0.2]}>
			<T.Mesh position={[0, 0.62, 0]}>
				<T.CylinderGeometry args={[0.035, 0.05, 1.24, 8]} />
				<T.MeshStandardMaterial color="#312e81" roughness={0.55} metalness={0.35} />
			</T.Mesh>
			<T.Mesh position={[0, 1.32, 0]}>
				<T.SphereGeometry args={[0.12, 16, 16]} />
				<T.MeshBasicMaterial color="#a855f7" />
			</T.Mesh>
		</T.Group>
		<T.Group position={[1.3, 0, -0.2]}>
			<T.Mesh position={[0, 0.62, 0]}>
				<T.CylinderGeometry args={[0.035, 0.05, 1.24, 8]} />
				<T.MeshStandardMaterial color="#155e75" roughness={0.55} metalness={0.35} />
			</T.Mesh>
			<T.Mesh position={[0, 1.32, 0]}>
				<T.SphereGeometry args={[0.12, 16, 16]} />
				<T.MeshBasicMaterial color="#22d3ee" />
			</T.Mesh>
		</T.Group>
	{/if}

	{#if isDiorama}
		<!-- Procedural Halloween Tower: floating steps, spire and beacon. -->
		<T.Group position={[0.95, 0, -0.8]}>
			<T.Mesh position={[0, 0.15, 0]}>
				<T.CylinderGeometry args={[0.8, 0.92, 0.3, 8]} />
				<T.MeshStandardMaterial color="#111827" roughness={0.9} />
			</T.Mesh>
			<T.Mesh position={[0, 0.98, 0]}>
				<T.CylinderGeometry args={[0.62, 0.75, 1.35, 8]} />
				<T.MeshStandardMaterial color="#1f2937" roughness={0.85} metalness={0.08} />
			</T.Mesh>
			<T.Mesh position={[0, 2.12, 0]}>
				<T.CylinderGeometry args={[0.48, 0.6, 0.95, 8]} />
				<T.MeshStandardMaterial color="#292524" roughness={0.85} metalness={0.08} />
			</T.Mesh>
			<T.Mesh position={[0, 3.05, 0]} rotation={[0, Math.PI / 8, 0]}>
				<T.ConeGeometry args={[0.62, 0.9, 8]} />
				<T.MeshStandardMaterial color="#4c1d95" roughness={0.7} metalness={0.15} />
			</T.Mesh>

			<T.Mesh position={[0, 1.65, 0]} rotation={[-Math.PI / 2, 0, 0]}>
				<T.RingGeometry args={[0.7, 0.8, 32]} />
				<T.MeshStandardMaterial color="#3b0764" roughness={0.8} />
			</T.Mesh>
			<T.Mesh position={[0, 2.6, 0]} rotation={[-Math.PI / 2, 0, 0]}>
				<T.RingGeometry args={[0.56, 0.68, 32]} />
				<T.MeshStandardMaterial color="#3b0764" roughness={0.8} />
			</T.Mesh>

			{#each PARKOUR_WINDOWS as panel}
				<T.Mesh position={panel.position} rotation={panel.rotation}>
					<T.BoxGeometry args={[0.16, 0.26, 0.05]} />
					<T.MeshBasicMaterial color="#fde68a" />
				</T.Mesh>
			{/each}

			<T.Mesh position={[0, 4.15, 0]}>
				<T.CylinderGeometry args={[0.04, 0.14, 1.4, 12, 1, true]} />
				<T.MeshBasicMaterial color="#eab308" transparent opacity={0.35} depthWrite={false} />
			</T.Mesh>
			<T.Mesh position={[0, 3.6, 0]} rotation={[-Math.PI / 2, 0, 0]}>
				<T.RingGeometry args={[0.26, 0.32, 32]} />
				<T.MeshBasicMaterial color="#eab308" transparent opacity={0.9} />
			</T.Mesh>
		</T.Group>

		{#each PARKOUR_STEPS as step}
			<T.Mesh position={step.position}>
				<T.BoxGeometry args={[step.size, 0.12, step.size]} />
				<T.MeshStandardMaterial color="#312e81" roughness={0.75} metalness={0.15} />
			</T.Mesh>
		{/each}
	{/if}

	{#if kind === 'cats'}
		<Cat
			cat={{
				id: 'cat-06',
				name: 'Preview',
				zone: 'centro',
				position: { x: 0, y: 0, z: 0 }
			}}
			yaw={CAT_PREVIEW_YAW}
		/>
	{:else if kind === 'race'}
		<T.Group position={[0, 1, 0]}>
			<CarModel modelUrl={CAR_MODEL_URLS.coche_calabaza} />
		</T.Group>
	{:else if kind === 'roadmap'}
		<T.Group position={[0, 1, 0]} rotation={[0.12, 0, -0.18]}>
			<CarModel modelUrl={CAR_MODEL_URLS.coche_halloween} />
		</T.Group>
	{:else if characterSkin}
		<T.Group position={kind === 'parkour' ? [-0.25, 0.68, 0.6] : [0, 0, 0]}>
			{#key characterSkin}
				<PlayerSkin skin={characterSkin} bind:actions={characterActions} />
			{/key}
		</T.Group>
	{/if}
</T>
