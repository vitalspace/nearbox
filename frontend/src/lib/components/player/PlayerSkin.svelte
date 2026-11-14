<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Readable } from 'svelte/store';
	import type { AnimationAction, AnimationMixer, Group } from 'three';
	import { SKIN_BY_ID, type SkinId } from '../../cosmetics/skins';
	import type { HeroAnimation } from '../../services/protocol';
	import Hero from './Hero.svelte';
	import SkinCharacter from './SkinCharacter.svelte';

	interface Props {
		skin: SkinId;
		visible?: boolean;
		/** First person: non-hero skins hide their head/hat nodes. */
		hideHead?: boolean;
		children?: Snippet;
		ref?: Group;
		actions?: Readable<Partial<Record<HeroAnimation, AnimationAction>>>;
		mixer?: AnimationMixer;
	}

	let {
		skin,
		visible = true,
		hideHead = false,
		children,
		ref = $bindable(),
		actions = $bindable(),
		mixer = $bindable()
	}: Props = $props();

	// If a skin GLB fails, it falls back to the hero model without touching
	// the skin saved in the profile.
	let failed = $state(false);
	let previousSkin: SkinId | null = null;

	$effect(() => {
		if (previousSkin !== null && skin !== previousSkin) {
			failed = false;
		}

		previousSkin = skin;
	});

	const definition = $derived(SKIN_BY_ID.get(skin));
	const useCustomSkin = $derived(skin !== 'hero' && !!definition && !failed);

	function handleError(): void {
		failed = true;
	}
</script>

{#if useCustomSkin && definition}
	{#key skin}
		<SkinCharacter
			skin={definition}
			bind:ref
			bind:actions
			bind:mixer
			{visible}
			{hideHead}
			onError={handleError}
		>
			{@render children?.()}
		</SkinCharacter>
	{/key}
{:else}
	<Hero bind:ref bind:actions bind:mixer {visible}>
		{@render children?.()}
	</Hero>
{/if}
