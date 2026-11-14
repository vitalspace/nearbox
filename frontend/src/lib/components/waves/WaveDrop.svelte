<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { Group } from 'three';
	import type { Mg5Drop } from '../../services/protocol';
	import { clonePickupModel, getCachedCombatModel, loadCombatModel } from '../player/weaponModels';

	interface Props {
		drop: Mg5Drop;
	}

	let { drop }: Props = $props();

	const DROP_COLORS: Record<Mg5Drop['kind'], string> = {
		shotgun: '#fb923c',
		smg: '#22d3ee',
		rifle: '#a78bfa',
		grenade: '#a3e635',
		ammo: '#facc15',
		medkit: '#f8fafc'
	};

	let group = $state<Group | undefined>();
	let modelRoot = $state<Group | undefined>();
	let modelReady = $state(false);
	let elapsed = Math.random() * Math.PI * 2;

	$effect(() => {
		const kind = drop.kind;
		const root = modelRoot;

		if (!root) {
			return;
		}

		let cancelled = false;
		root.clear();
		modelReady = false;

		const attach = () => {
			if (cancelled) {
				return;
			}

			const model = clonePickupModel(kind);

			if (!model) {
				return;
			}

			root.add(model);
			modelReady = true;
		};

		if (getCachedCombatModel(kind)) {
			attach();
		} else {
			void loadCombatModel(kind).then((source) => {
				if (source) {
					attach();
				}
			});
		}

		return () => {
			cancelled = true;
			root.clear();
		};
	});

	useTask((delta) => {
		elapsed += delta;

		if (!group) {
			return;
		}

		group.position.y = 0.75 + Math.sin(elapsed * 2) * 0.12;
		group.rotation.y = elapsed * 1.6;
	});
</script>

<T.Group position={[drop.x, 0, drop.z]}>
	<!-- Weld shadow on the ground -->
	<T.Mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
		<T.CircleGeometry args={[0.55, 20]} />
		<T.MeshBasicMaterial
			color={DROP_COLORS[drop.kind]}
			transparent
			opacity={0.35}
			depthWrite={false}
		/>
	</T.Mesh>

	<T.Group bind:ref={group}>
		<T.Group bind:ref={modelRoot} />
		{#if !modelReady}
			{#if drop.kind === 'grenade'}
				<T.Mesh castShadow>
					<T.SphereGeometry args={[0.16, 12, 10]} />
					<T.MeshStandardMaterial color={0x3f6212} emissive={0xa3e635} emissiveIntensity={0.7} />
				</T.Mesh>
			{:else if drop.kind === 'ammo'}
				<T.Mesh castShadow>
					<T.BoxGeometry args={[0.34, 0.24, 0.22]} />
					<T.MeshStandardMaterial color={0x713f12} emissive={0xfacc15} emissiveIntensity={0.45} />
				</T.Mesh>
			{:else if drop.kind === 'medkit'}
				<T.Mesh castShadow>
					<T.BoxGeometry args={[0.36, 0.28, 0.24]} />
					<T.MeshStandardMaterial color={0xf8fafc} emissive={0xef4444} emissiveIntensity={0.28} />
				</T.Mesh>
			{:else}
				<T.Mesh castShadow rotation={[0, 0, Math.PI / 2]}>
					<T.CapsuleGeometry
						args={[0.07, drop.kind === 'rifle' ? 0.75 : drop.kind === 'shotgun' ? 0.6 : 0.45, 6, 8]}
					/>
					<T.MeshStandardMaterial
						color={0x27272a}
						emissive={DROP_COLORS[drop.kind]}
						emissiveIntensity={0.55}
						metalness={0.6}
						roughness={0.35}
					/>
				</T.Mesh>
			{/if}
		{/if}
	</T.Group>
</T.Group>
