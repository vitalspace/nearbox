<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { HTML } from '@threlte/extras';
	import { get, type Readable } from 'svelte/store';
	import type { AnimationAction } from 'three';
	import type { SkinDefinition } from '../../cosmetics/skins';
	import type { HeroAnimation } from '../../services/protocol';
	import { playRigClip } from '../../state/playerAnimations.svelte';
	import PlayerSkin from '../player/PlayerSkin.svelte';

	interface Props {
		skin: SkinDefinition;
		/** Feet position, relative to `Top3_Root`. */
		position: [number, number, number];
		name: string;
		score: number;
		kills: number;
		rank: number;
	}

	let { skin, position, name, score, kills, rank }: Props = $props();

	let actionsStore = $state<
		Readable<Partial<Record<HeroAnimation, AnimationAction>>> | undefined
	>();

	let current = '';
	let previousActions: typeof actionsStore;

	// A skin swap replaces the rig and its action store; restart the idle on
	// the new one instead of waiting for another animation event.
	$effect(() => {
		const next = actionsStore;

		if (next === previousActions) {
			return;
		}

		previousActions = next;
		current = '';
	});

	// The avatar is decorative: it stands still and loops the idle clip so the
	// podium does not look like a wax museum.
	useTask(() => {
		if (current === 'HR_idle') {
			return;
		}

		const actions = actionsStore ? get(actionsStore) : undefined;

		if (playRigClip(actions, current, 'HR_idle', true)) {
			current = 'HR_idle';
		}
	});

	const medal = $derived(rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉');
</script>

<T.Group {position}>
	{#key skin.id}
		<PlayerSkin skin={skin.id} bind:actions={actionsStore} />
	{/key}

	<!-- `occlude` hace raycast contra la escena: la etiqueta se oculta si una
	     pared u otro objeto queda delante de la cámara. -->
	<HTML position={[0, 2.7, 0]} center pointerEvents="none" zIndexRange={[10, 0]} occlude>
		<div
			class="flex min-w-36 flex-col items-center gap-0.5 rounded-xl border border-amber-200/35 bg-slate-950/80 px-3 py-1.5 text-center text-white shadow-[0_6px_24px_rgba(0,0,0,0.55)] backdrop-blur-sm"
		>
			<span class="text-[11px] font-black tracking-wide text-amber-200">
				{medal}
				{name}
			</span>
			<span class="text-[10px] font-semibold text-amber-100/80">
				{score} missions · {kills} kills
			</span>
		</div>
	</HTML>
</T.Group>
