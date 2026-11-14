<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { Group } from 'three';
	import type { Mg8Loot } from '../../services/protocol';
	import {
		clonePickupModel,
		getCachedCombatModel,
		loadCombatModel,
		type CombatModelId
	} from '../player/weaponModels';

	interface Props {
		loot: Mg8Loot;
	}

	let { loot }: Props = $props();

	const COLORS: Record<Mg8Loot['kind'], string> = {
		weapon: '#fb923c',
		ammo: '#facc15',
		shield: '#38bdf8',
		medkit: '#f8fafc',
		grenade: '#a3e635'
	};

	const modelId = $derived.by((): CombatModelId | null => {
		if (loot.kind === 'weapon') return loot.weapon ?? 'pistol';
		if (loot.kind === 'ammo') return 'ammo';
		if (loot.kind === 'medkit') return 'medkit';
		if (loot.kind === 'grenade') return 'grenade';
		return null;
	});

	const color = $derived(COLORS[loot.kind]);

	let group = $state<Group | undefined>();
	let modelRoot = $state<Group | undefined>();
	let modelReady = $state(false);
	let elapsed = Math.random() * Math.PI * 2;

	$effect(() => {
		const id = modelId;
		const root = modelRoot;

		if (!root || !id) {
			return;
		}

		let cancelled = false;
		root.clear();
		modelReady = false;

		const attach = () => {
			if (cancelled) return;

			const model = clonePickupModel(id);

			if (!model) return;

			root.add(model);
			modelReady = true;
		};

		if (getCachedCombatModel(id)) {
			attach();
		} else {
			void loadCombatModel(id).then((source) => {
				if (source) attach();
			});
		}

		return () => {
			cancelled = true;
			root.clear();
		};
	});

	useTask((delta) => {
		elapsed += delta;

		if (!group) return;

		group.position.y = 0.75 + Math.sin(elapsed * 2) * 0.12;
		group.rotation.y = elapsed * 1.6;
	});
</script>

{#if loot.available}
	<T.Group position={[loot.x, loot.y, loot.z]}>
		<T.Mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
			<T.CircleGeometry args={[0.55, 20]} />
			<T.MeshBasicMaterial {color} transparent opacity={0.32} depthWrite={false} />
		</T.Mesh>

		<T.Group bind:ref={group}>
			<T.Group bind:ref={modelRoot} />
			{#if !modelReady}
				{#if loot.kind === 'shield'}
					<T.Mesh castShadow>
						<T.OctahedronGeometry args={[0.26, 0]} />
						<T.MeshStandardMaterial color={0x0c4a6e} emissive={0x38bdf8} emissiveIntensity={0.8} />
					</T.Mesh>
				{:else if loot.kind === 'grenade'}
					<T.Mesh castShadow>
						<T.SphereGeometry args={[0.16, 12, 10]} />
						<T.MeshStandardMaterial color={0x3f6212} emissive={0xa3e635} emissiveIntensity={0.7} />
					</T.Mesh>
				{:else if loot.kind === 'ammo'}
					<T.Mesh castShadow>
						<T.BoxGeometry args={[0.34, 0.24, 0.22]} />
						<T.MeshStandardMaterial color={0x713f12} emissive={0xfacc15} emissiveIntensity={0.45} />
					</T.Mesh>
				{:else if loot.kind === 'medkit'}
					<T.Mesh castShadow>
						<T.BoxGeometry args={[0.36, 0.28, 0.24]} />
						<T.MeshStandardMaterial color={0xf8fafc} emissive={0xef4444} emissiveIntensity={0.28} />
					</T.Mesh>
				{:else}
					<T.Mesh castShadow rotation={[0, 0, Math.PI / 2]}>
						<T.CapsuleGeometry
							args={[
								0.07,
								loot.weapon === 'rifle' ? 0.75 : loot.weapon === 'shotgun' ? 0.6 : 0.45,
								6,
								8
							]}
						/>
						<T.MeshStandardMaterial
							color={0x27272a}
							emissive={0xfb923c}
							emissiveIntensity={0.55}
							metalness={0.6}
							roughness={0.35}
						/>
					</T.Mesh>
				{/if}
			{/if}
		</T.Group>
	</T.Group>
{/if}
