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
		type Object3D,
		type SpriteMaterial
	} from 'three';
	import type { HeroAnimation } from '../../services/protocol';
	import type { SkinId } from '../../cosmetics/skins';
	import { lobby } from '../../state/lobby.svelte';
	import { minigame8 } from '../../state/minigame8.svelte';
	import { WEAPON_VARIANT_BASE } from '../../state/equipment.svelte';
	import type { Mg5WeaponId } from '../../state/wavesConfig';
	import { asset } from '../../assets/path';
	import { catalogItemById } from '../../nft/catalog.ts';
	import { playRigClip } from '../../state/playerAnimations.svelte';
	import { buildHeldWeapon } from '../player/heldWeapon';
	import { createNameTagMaterial } from '../player/nameTag';
	import PlayerAccessory from '../player/PlayerAccessory.svelte';
	import PlayerSkin from '../player/PlayerSkin.svelte';

	interface Props {
		id: string;
		name: string;
		skin: SkinId;
		isBot: boolean;
	}

	let { id, name, skin, isBot }: Props = $props();

	// Bots have no presence entry; humans get their equipped NFTs from it.
	const presence = $derived(isBot ? undefined : lobby.playerById(id));
	const crown = $derived(presence?.crown ?? false);
	const rideModel = $derived(
		presence?.ride ? (catalogItemById(presence.ride)?.model ?? null) : null
	);

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

	let spriteMaterial = $state.raw<SpriteMaterial | null>(null);

	let weaponRoot: Group | null = null;
	let weaponOwner: Group | null = null;
	let weaponId: Mg5WeaponId | null = null;
	let weaponVariantId: string | null = null;

	let lastX = 0;
	let lastZ = 0;
	let speed = 0;

	/**
	 * Postura de puntería de los avatares remotos. El servidor no manda un
	 * estado «apuntando»: se deduce de cada `shot-fired`, que llega también
	 * para los bots. Durante ~1.6 s el avatar usa los clips de aim en vez de
	 * caminar con el arma colgando.
	 */
	const REMOTE_AIM_MS = 1600;
	let lastEventSeq = 0;
	let aimUntil = 0;

	const handWorld = new Vector3();
	const fingerWorld = new Vector3();
	const handQuaternion = new Quaternion();

	const tagColor = $derived(isBot ? '#fbbf24' : '#7dd3fc');

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
			weaponRoot.name = 'RoyaleHeldWeapon';
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
		const next = createNameTagMaterial(name, tagColor, isBot ? 'BOT' : undefined);

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

	useTask((delta) => {
		const sample = minigame8.sampleAt();
		const player = sample?.players.find((item) => item.id === id);
		const state = minigame8.snapshot?.players.find((item) => item.id === id);
		const vehicles = sample?.vehicles ?? minigame8.vehicles;
		const driving = vehicles.some((vehicle) => vehicle.driverId === id);

		// Solo se miran eventos nuevos: al montar se parte del último `seq`
		// para no reproducir la puntería de disparos viejos.
		if (lastEventSeq === 0 && minigame8.events.length > 0) {
			lastEventSeq = minigame8.events[minigame8.events.length - 1].seq;
		}

		for (const event of minigame8.events) {
			if (event.seq <= lastEventSeq) continue;

			lastEventSeq = event.seq;

			if (event.kind === 'shot-fired' && event.playerId === id) {
				aimUntil = performance.now() + REMOTE_AIM_MS;
			}
		}

		if (!group) return;

		if (!player || !player.alive || player.mode === 'riding' || driving) {
			// A bordo del zepelín o de un vehículo no se dibuja a nadie: el
			// avatar quedaría flotando sobre el asiento. Aparecen al saltar,
			// salir del coche o cuando el zepelín los expulsa.
			group.visible = false;
			updateHeldWeapon(null);
			return;
		}

		group.visible = true;
		group.position.set(player.x, player.y, player.z);
		group.rotation.y = player.yaw;

		speed = Math.hypot(player.x - lastX, player.z - lastZ) / Math.max(0.0001, delta);
		lastX = player.x;
		lastZ = player.z;

		const wanted = state?.weapon ?? null;
		updateHeldWeapon(wanted, variantFor(wanted));

		if (!actionsStore) return;

		const actions = get(actionsStore);
		let animation: HeroAnimation = 'HR_idle';

		if (player.mode === 'skydive' || player.mode === 'glide') {
			animation = 'HR_jump';
		} else if (performance.now() < aimUntil) {
			animation = speed > 6.5 ? 'HR_run_aim' : speed > 0.5 ? 'HR_walk_aim' : 'HR_aim';
		} else if (speed > 6.5) {
			animation = 'HR_run';
		} else if (speed > 0.5) {
			animation = 'HR_walk';
		}

		if (animation !== current && playRigClip(actions, current, animation)) {
			current = animation;
		}
	});
</script>

<PlayerSkin bind:ref={group} bind:actions={actionsStore} bind:mixer {skin} visible={false}>
	{#if spriteMaterial}
		<T.Sprite position={[0, 2.45, 0]} scale={[1.9, 0.48, 1]} material={spriteMaterial} />
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
