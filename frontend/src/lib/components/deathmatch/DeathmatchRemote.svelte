<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { get, type Readable } from 'svelte/store';
	import { untrack } from 'svelte';
	import {
		Group,
		Quaternion,
		Vector3,
		type AnimationAction,
		type AnimationMixer,
		type Object3D
	} from 'three';
	import type { SpriteMaterial } from 'three';
	import { DEFAULT_SKIN } from '../../cosmetics/skins';
	import type { HeroAnimation, Mg6Team } from '../../services/protocol';
	import { DM_TEAM_META } from '../../state/dmConfig';
	import { lobby } from '../../state/lobby.svelte';
	import { minigame6 } from '../../state/minigame6.svelte';
	import {
		isLoopingAnimation,
		playRigClip,
		playerAnimations,
		replayRigClip
	} from '../../state/playerAnimations.svelte';
	import { playerSettings } from '../../state/playerSettings.svelte';
	import { WEAPON_VARIANT_BASE } from '../../state/equipment.svelte';
	import type { Mg5WeaponId } from '../../state/wavesConfig';
	import { asset } from '../../assets/path';
	import { catalogItemById } from '../../nft/catalog.ts';
	import { buildHeldWeapon } from '../player/heldWeapon';
	import { createNameTagMaterial } from '../player/nameTag';
	import PlayerAccessory from '../player/PlayerAccessory.svelte';
	import PlayerSkin from '../player/PlayerSkin.svelte';

	interface Props {
		id: string;
		name: string;
		team: Mg6Team;
	}

	let { id, name, team }: Props = $props();

	const presence = $derived(lobby.playerById(id));
	const skin = $derived(presence?.skin ?? DEFAULT_SKIN);
	const crown = $derived(presence?.crown ?? false);
	const rideModel = $derived(
		presence?.ride ? (catalogItemById(presence.ride)?.model ?? null) : null
	);
	const teamMeta = $derived(DM_TEAM_META[team]);

	const variantFor = (base: Mg5WeaponId | null): string | null => {
		const variant = presence?.weaponVariant ?? null;

		return variant && base && WEAPON_VARIANT_BASE[variant] === base ? variant : null;
	};

	let actionsStore = $state<
		Readable<Partial<Record<HeroAnimation, AnimationAction>>> | undefined
	>();
	let mixer = $state<AnimationMixer | undefined>();
	let group = $state<Group | undefined>();
	let current = '';
	let lastAnimationRevision = -1;

	let spriteMaterial = $state.raw<SpriteMaterial | null>(null);

	let weaponRoot: Group | null = null;
	let weaponOwner: Group | null = null;
	let weaponId: Mg5WeaponId | null = null;
	let weaponVariantId: string | null = null;

	const handWorld = new Vector3();
	const fingerWorld = new Vector3();
	const handQuaternion = new Quaternion();

	const findHand = (root: Object3D): Object3D | undefined => {
		const direct = root.getObjectByName('handR') ?? root.getObjectByName('hand.R');

		if (direct) {
			return direct;
		}

		let found: Object3D | undefined;

		root.traverse((child) => {
			if (!found && /^hand.*r$/i.test(child.name)) {
				found = child;
			}
		});

		return found;
	};

	function updateHeldWeapon(wanted: Mg5WeaponId | null, variant: string | null = null): void {
		if (!group || !wanted) {
			if (weaponRoot) {
				weaponRoot.visible = false;
			}

			return;
		}

		const hand = findHand(group);

		if (!hand) {
			if (weaponRoot) {
				weaponRoot.visible = false;
			}

			return;
		}

		if (!weaponRoot || weaponOwner !== group) {
			weaponRoot = new Group();
			weaponRoot.name = 'RemoteHeldWeapon';
			weaponOwner = group;
			weaponId = null;
			weaponVariantId = null;
			group.add(weaponRoot);
		}

		weaponRoot.visible = true;

		if (weaponId !== wanted || weaponVariantId !== variant) {
			weaponId = wanted;
			weaponVariantId = variant;
			weaponRoot.clear();
			weaponRoot.add(buildHeldWeapon(wanted, variant));
		}

		group.updateWorldMatrix(true, false);
		hand.updateWorldMatrix(true, false);
		hand.getWorldPosition(handWorld);
		hand.getWorldQuaternion(handQuaternion);
		fingerWorld.set(0, 1, 0).applyQuaternion(handQuaternion).multiplyScalar(0.1).add(handWorld);

		group.worldToLocal(handWorld);
		group.worldToLocal(fingerWorld);

		weaponRoot.position
			.copy(handWorld)
			.addScaledVector(fingerWorld.sub(handWorld).normalize(), 0.07);
		weaponRoot.rotation.set(-0.04, -0.12, 0);
	}

	$effect(() => {
		const next = createNameTagMaterial(name, teamMeta.color);

		const previous = untrack(() => spriteMaterial);
		spriteMaterial = next;

		return () => {
			untrack(() => {
				if (spriteMaterial === next) {
					spriteMaterial = null;
				}
			});

			next?.map?.dispose();
			next?.dispose();
			previous?.map?.dispose();
			previous?.dispose();
		};
	});

	let previousActions: typeof actionsStore;

	$effect(() => {
		if (actionsStore === previousActions) return;

		previousActions = actionsStore;
		current = '';
	});

	$effect(() => {
		if (!actionsStore || !group) return;

		const animation = playerAnimations.get(id) ?? 'HR_idle';
		const revision = playerAnimations.revision(id);
		const isNewMessage = revision !== lastAnimationRevision;
		lastAnimationRevision = revision;
		const actions = get(actionsStore);

		if (animation !== current) {
			if (playRigClip(actions, current, animation)) {
				current = animation;
			}
		} else if (isNewMessage && !isLoopingAnimation(animation)) {
			replayRigClip(actions, animation);
		}
	});

	useTask(() => {
		const sample = minigame6.sampleAt();
		const player = sample?.players.find((item) => item.id === id);
		const state = minigame6.snapshot?.players.find((item) => item.id === id);

		if (!group) return;

		if (!player || !player.alive) {
			group.visible = false;
			updateHeldWeapon(null);
			return;
		}

		group.visible = true;
		group.position.set(player.x, player.y, player.z);
		group.rotation.y = player.yaw;

		const wanted = state?.alive ? state.weapon : null;
		updateHeldWeapon(wanted, variantFor(wanted));
	});
</script>

<PlayerSkin bind:ref={group} bind:actions={actionsStore} bind:mixer {skin} visible={false}>
	<!-- Team ring under the feet: the skin model is shared, this is the
	     cheapest way to tell Coven from Hunters at a distance. -->
	<T.Mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
		<T.RingGeometry args={[0.55, 0.78, 28]} />
		<T.MeshBasicMaterial color={teamMeta.color} transparent opacity={0.8} depthWrite={false} />
	</T.Mesh>

	{#if spriteMaterial}
		<T.Sprite position={[0, 2.45, 0]} scale={[1.8, 0.45, 1]} material={spriteMaterial} />
	{/if}

	{#if crown}
		<PlayerAccessory url={asset('props/crown.glb')} position={[0, 2.08, 0]} targetSize={0.52} />
	{/if}

	{#if rideModel}
		{#key rideModel}
			<PlayerAccessory url={asset(rideModel)} position={[0, 0.06, 0]} targetSize={1.7} />
		{/key}
	{/if}
</PlayerSkin>
