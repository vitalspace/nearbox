<script lang="ts">
	import { useTask } from '@threlte/core';
	import { get, type Readable } from 'svelte/store';
	import type { AnimationAction, AnimationMixer, Group } from 'three';
	import { SKIN_BY_ID } from '../../cosmetics/skins';
	import type { HeroAnimation } from '../../services/protocol';
	import { minigame7 } from '../../state/minigame7.svelte';
	import type { ParkourWardenDefinition } from '../../state/parkourConfig';
	import {
		PARKOUR_WARDEN_VERTICAL_REACH,
		parkourWardenCanChase,
		parkourWardenChaseStep,
		parkourWardenPosition,
		type ParkourPoint
	} from '../../state/parkourConfig';
	import { playRigClip } from '../../state/playerAnimations.svelte';
	import { MONSTER_BY_KIND } from '../../state/wavesConfig';
	import SkinCharacter from '../player/SkinCharacter.svelte';

	interface Props {
		warden: ParkourWardenDefinition;
	}

	let { warden }: Props = $props();

	const definition = $derived(MONSTER_BY_KIND.get(warden.kind) ?? null);
	const skin = $derived(definition ? SKIN_BY_ID.get(definition.skinId) : undefined);
	const height = $derived(definition?.height ?? 2.1);

	let group = $state<Group | undefined>();
	let actionsStore = $state<
		Readable<Partial<Record<HeroAnimation, AnimationAction>>> | undefined
	>();
	let mixer = $state<AnimationMixer | undefined>();

	let current = '';
	let previousActions: typeof actionsStore;
	let lastSeq = 0;
	let attackClip: HeroAnimation | null = null;
	let attackUntil = 0;
	let lastX = 0;
	let lastZ = 0;
	let hasLastPosition = false;
	let chasePosition: ParkourPoint | null = null;

	const play = (name: HeroAnimation, loop = true) => {
		const actions = actionsStore ? get(actionsStore) : undefined;

		if (playRigClip(actions, current, name, loop)) {
			current = name;
		}
	};

	$effect(() => {
		const next = actionsStore;

		if (next === previousActions) return;

		previousActions = next;
		current = '';
	});

	// One-shot cast/swing driven by the authoritative `warden-attack` event.
	$effect(() => {
		for (const event of minigame7.events) {
			if (event.seq <= lastSeq) {
				continue;
			}

			lastSeq = event.seq;

			if (event.kind !== 'warden-attack' || event.attack?.wardenId !== warden.id) {
				continue;
			}

			attackClip = event.attack.kind === 'shove' ? 'HR_attack' : 'HR_throw';
			attackUntil = performance.now() + (event.attack.kind === 'shove' ? 700 : 1_200);

			const actions = actionsStore ? get(actionsStore) : undefined;
			const action = actions?.[attackClip];

			if (current === attackClip && action) {
				action.enabled = true;
				action.setEffectiveWeight(1);
				action.reset().play();
			}
		}
	});

	useTask((delta) => {
		if (!group) return;

		// `SkinCharacter` normalizes the model with its feet at y = 0, so the
		// anchor's `y` is the surface height. The warden patrols around its
		// checkpoint (same deterministic path as the server); melee wardens
		// (`chase`) leave the orbit while a racer is inside their plaza. The
		// sampled speed drives the walk clip, so the model does not slide.
		const serverNow = minigame7.serverNow();
		const players = minigame7.sampleAt()?.players ?? [];
		let position: ParkourPoint;

		if (warden.chase) {
			if (!chasePosition) {
				chasePosition = parkourWardenPosition(warden, serverNow);
			}

			let chaseTarget: ParkourPoint | null = null;
			let chaseBest = Number.POSITIVE_INFINITY;

			for (const player of players) {
				if (Math.abs(player.y - warden.y) > PARKOUR_WARDEN_VERTICAL_REACH) {
					continue;
				}

				if (!parkourWardenCanChase(warden, player)) {
					continue;
				}

				const distance = Math.hypot(player.x - warden.x, player.z - warden.z);

				if (distance < chaseBest) {
					chaseBest = distance;
					chaseTarget = player;
				}
			}

			chasePosition = parkourWardenChaseStep(
				warden,
				chasePosition,
				chaseTarget,
				delta * 1_000,
				serverNow
			);
			position = chasePosition;
		} else {
			position = parkourWardenPosition(warden, serverNow);
		}

		const step = hasLastPosition ? Math.hypot(position.x - lastX, position.z - lastZ) : 0;
		const speed = step / Math.max(delta, 0.001);

		lastX = position.x;
		lastZ = position.z;
		hasLastPosition = true;

		group.position.set(position.x, position.y, position.z);

		// The wardens never leave their plaza; they turn towards the nearest
		// racer when it is close and otherwise face their movement direction.
		let nearest: (typeof players)[number] | null = null;
		let best = Number.POSITIVE_INFINITY;

		for (const player of players) {
			const distance = Math.hypot(player.x - position.x, player.z - position.z);

			if (distance < best) {
				best = distance;
				nearest = player;
			}
		}

		const now = performance.now();
		const attacking = attackClip !== null && now < attackUntil;
		const ahead = parkourWardenPosition(warden, serverNow + 120);
		const patrolYaw = Math.atan2(ahead.x - position.x, ahead.z - position.z);

		if (nearest && (attacking || best < 8)) {
			group.rotation.y = Math.atan2(nearest.x - position.x, nearest.z - position.z);
		} else if (speed > 0.05) {
			group.rotation.y = patrolYaw;
		}

		if (attacking) {
			play(attackClip ?? 'HR_idle', false);
		} else if (speed > 0.12) {
			play('HR_walk', true);
		} else {
			play('HR_idle', true);
		}
	});
</script>

{#if skin && definition}
	{#key skin.id}
		<SkinCharacter
			{skin}
			targetHeight={height}
			bind:ref={group}
			bind:actions={actionsStore}
			bind:mixer
		/>
	{/key}
{/if}
