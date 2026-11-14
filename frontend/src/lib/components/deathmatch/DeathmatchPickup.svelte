<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { Group } from 'three';
	import type { Mg6Pickup, Mg6PickupKind } from '../../services/protocol';
	import { minigame6 } from '../../state/minigame6.svelte';
	import { clonePickupModel, getCachedCombatModel, loadCombatModel } from '../player/weaponModels';

	interface Props {
		pickup: Mg6Pickup;
	}

	let { pickup }: Props = $props();

	const COLORS: Record<Mg6PickupKind, string> = {
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
	let available = $state(false);

	$effect(() => {
		const kind = pickup.kind;
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

	$effect(() => {
		available = pickup.availableAt <= minigame6.serverNow();
	});

	useTask((delta) => {
		elapsed += delta;
		available = pickup.availableAt <= minigame6.serverNow();

		if (!group) {
			return;
		}

		group.position.y = 0.75 + Math.sin(elapsed * 2) * 0.12;
		group.rotation.y = elapsed * 1.6;
	});
</script>

{#if available}
	<T.Group position={[pickup.x, 0, pickup.z]}>
		<T.Mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
			<T.CircleGeometry args={[0.55, 20]} />
			<T.MeshBasicMaterial
				color={COLORS[pickup.kind]}
				transparent
				opacity={0.32}
				depthWrite={false}
			/>
		</T.Mesh>

		<T.Group bind:ref={group}>
			<T.Group bind:ref={modelRoot} />
			{#if !modelReady}
				{#if pickup.kind === 'grenade'}
					<T.Mesh castShadow>
						<T.SphereGeometry args={[0.16, 12, 10]} />
						<T.MeshStandardMaterial color={0x3f6212} emissive={0xa3e635} emissiveIntensity={0.7} />
					</T.Mesh>
				{:else if pickup.kind === 'ammo'}
					<T.Mesh castShadow>
						<T.BoxGeometry args={[0.34, 0.24, 0.22]} />
						<T.MeshStandardMaterial color={0x713f12} emissive={0xfacc15} emissiveIntensity={0.45} />
					</T.Mesh>
				{:else if pickup.kind === 'medkit'}
					<T.Mesh castShadow>
						<T.BoxGeometry args={[0.36, 0.28, 0.24]} />
						<T.MeshStandardMaterial color={0xf8fafc} emissive={0xef4444} emissiveIntensity={0.28} />
					</T.Mesh>
				{:else}
					<T.Mesh castShadow rotation={[0, 0, Math.PI / 2]}>
						<T.CapsuleGeometry
							args={[
								0.07,
								pickup.kind === 'rifle' ? 0.75 : pickup.kind === 'shotgun' ? 0.6 : 0.45,
								6,
								8
							]}
						/>
						<T.MeshStandardMaterial
							color={0x27272a}
							emissive={COLORS[pickup.kind]}
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
