<script lang="ts">
	import { Collider, CollisionGroups, RigidBody } from '@threlte/rapier';
	import { useTask } from '@threlte/core';
	import type { RigidBody as RapierRigidBody } from '@dimforge/rapier3d-compat';
	import { get, type Readable } from 'svelte/store';
	import type { AnimationAction, AnimationMixer, Group } from 'three';
	import { SKIN_BY_ID } from '../../cosmetics/skins';
	import type { HeroAnimation } from '../../services/protocol';
	import { MONSTER_BY_KIND, MONSTER_COLLISION_BITS } from '../../state/wavesConfig';
	import { minigame5 } from '../../state/minigame5.svelte';
	import { playRigClip } from '../../state/playerAnimations.svelte';
	import SkinCharacter from '../player/SkinCharacter.svelte';

	interface Props {
		id: string;
	}

	let { id }: Props = $props();

	// Tipo y salud vienen del snapshot (1 Hz); la posición se interpola a
	// 10 Hz en `sampleAt()`.
	const snapshotMonster = $derived(
		minigame5.snapshot?.monsters.find((monster) => monster.id === id) ?? null
	);
	const definition = $derived(
		snapshotMonster ? (MONSTER_BY_KIND.get(snapshotMonster.kind) ?? null) : null
	);
	const skin = $derived(definition ? SKIN_BY_ID.get(definition.skinId) : undefined);
	const height = $derived(definition?.height ?? 1.9);

	let group = $state<Group | undefined>();
	let body = $state<RapierRigidBody>();
	let actionsStore = $state<
		Readable<Partial<Record<HeroAnimation, AnimationAction>>> | undefined
	>();
	let mixer = $state<AnimationMixer | undefined>();

	let current = '';
	let previousActionsStore: typeof actionsStore;
	let lastSeq = 0;
	let attackClip: HeroAnimation | null = null;
	let attackUntil = 0;
	let hitUntil = 0;
	let dead = false;
	let placed = false;
	let lastX = 0;
	let lastZ = 0;
	let hasLastPosition = false;

	const CAPSULE_HALF_HEIGHT = $derived(Math.max(0.6, height / 2 - 0.15));
	const CAPSULE_RADIUS = 0.4;
	const CAPSULE_CENTER = $derived(CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS);

	/**
	 * Restarts the attack clip on every attack event.
	 *
	 * Fast monsters (the ghost has a 900 ms cooldown while `HR_attack` lasts
	 * 1 s) can attack again while the previous clip is still running; the
	 * action then ends mid-swing and stays clamped because the clip is already
	 * `current`. Restarting keeps the swing in sync with the hit.
	 */
	const triggerAttack = (clip: HeroAnimation, ms: number) => {
		attackClip = clip;
		attackUntil = performance.now() + ms;

		const actions = actionsStore ? get(actionsStore) : undefined;
		const action = actions?.[clip];

		if (current === clip && action) {
			action.enabled = true;
			action.setEffectiveWeight(1);
			action.reset().play();
		}
	};

	// Eventos dirigidos a este monstruo (ataque / impacto / muerte).
	$effect(() => {
		for (const event of minigame5.events) {
			if (event.seq <= lastSeq) {
				continue;
			}

			lastSeq = event.seq;

			if (event.monsterId !== id) {
				continue;
			}

			if (event.kind === 'monster-attack') {
				triggerAttack('HR_attack', 1000);
			} else if (event.kind === 'acid-thrown') {
				triggerAttack('HR_throw', 1500);
			} else if (event.kind === 'rock-thrown') {
				// El Golem arranca una roca y la lanza: mismo clip de casteo.
				triggerAttack('HR_throw', 1500);
			} else if (event.kind === 'fire-breath') {
				// El demonio echa la cabeza atrás y escupe: `*_throw` es el clip
				// de casteo del rig y dura lo que el chorro.
				triggerAttack('HR_throw', 1100);
			} else if (event.kind === 'monster-hit') {
				if (performance.now() >= attackUntil) {
					hitUntil = performance.now() + 600;
				}
			} else if (event.kind === 'monster-died') {
				dead = true;
				attackClip = null;
			}
		}
	});

	const play = (name: HeroAnimation, loop = true) => {
		const actions = actionsStore ? get(actionsStore) : undefined;

		if (playRigClip(actions, current, name, loop)) {
			current = name;
		}
	};

	// Al cambiar de skin (o al terminar de cargar el GLB) las acciones son
	// otras: descarta el clip activo para no quedarse con una pose heredada.
	$effect(() => {
		const next = actionsStore;

		if (next === previousActionsStore) {
			return;
		}

		previousActionsStore = next;
		current = '';
	});

	useTask((delta) => {
		if (!group || !definition) {
			return;
		}

		const sample = minigame5.sampleAt();
		const monster = sample?.monsters.find((item) => item.id === id);

		if (!monster) {
			group.visible = false;
			return;
		}

		group.visible = true;

		if (monster.status === 'dead') {
			dead = true;
		}

		// Velocidad real entre muestras: los monstruos quietos (esperando en
		// el portal o atacando) deben estar en idle, no corriendo en el sitio.
		const step = hasLastPosition ? Math.hypot(monster.x - lastX, monster.z - lastZ) : 0;
		const speed = step / Math.max(delta, 0.001);
		lastX = monster.x;
		lastZ = monster.z;
		hasLastPosition = true;
		const moving = speed > 0.2;

		group.position.set(monster.x, monster.y, monster.z);
		group.rotation.y = monster.yaw;

		if (body) {
			// El cuerpo lleva el centro de la cápsula; el collider coincide con el origen.
			const translation = { x: monster.x, y: monster.y + CAPSULE_CENTER, z: monster.z };

			if (!placed) {
				placed = true;
				body.setTranslation(translation, true);
			} else {
				body.setNextKinematicTranslation(translation);
			}
		}

		// Selección de clip: muerte > ataque > impacto > locomoción.
		const now = performance.now();

		if (dead) {
			play('HR_death', false);
		} else if (attackClip && now < attackUntil) {
			play(attackClip, false);
		} else if (now < hitUntil) {
			play('HR_hit', false);
		} else if (monster.status === 'spawn' || !moving) {
			play('HR_idle', true);
		} else {
			play('HR_run', true);
		}
	});
</script>

{#if skin && definition}
	<!-- El modelo NO es hijo del cuerpo: se coloca en absoluto cada frame
	     (mismo patrón que `Mummy.svelte`). -->
	{#key skin.id}
		<SkinCharacter
			{skin}
			targetHeight={height}
			bind:ref={group}
			bind:actions={actionsStore}
			bind:mixer
		/>
	{/key}
	<RigidBody type="kinematicPosition" bind:rigidBody={body}>
		<!-- Los monstruos comparten el grupo 4 y solo chocan con el mapa y los
		     jugadores (bit 0). Así nunca empujan ni colisionan con el coche. -->
		<CollisionGroups
			memberships={MONSTER_COLLISION_BITS.memberships}
			filter={MONSTER_COLLISION_BITS.filter}
		>
			<Collider
				shape="capsule"
				args={[CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS]}
				friction={0}
				restitution={0}
			/>
		</CollisionGroups>
	</RigidBody>
{:else}
	<!-- Monster no longer exists on the server -->
	<group></group>
{/if}
