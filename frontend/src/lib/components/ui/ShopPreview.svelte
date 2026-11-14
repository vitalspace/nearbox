<script lang="ts">
	import type { ShopPreviewRef } from './shopCatalog';
	import { SHOP_ICONS } from './shopUi';
	import ModelPreview from './ModelPreview.svelte';
	import SkinPreview from './SkinPreview.svelte';

	interface Props {
		preview: ShopPreviewRef;
	}

	let { preview }: Props = $props();

	const PosterIcon = $derived(preview.kind === 'poster' ? SHOP_ICONS[preview.icon] : null);
</script>

{#if preview.kind === 'skin'}
	<SkinPreview skin={preview.skin} />
{:else if preview.kind === 'model'}
	<ModelPreview url={preview.url} accent={preview.accent} />
{:else}
	<div
		class="relative flex h-full w-full items-center justify-center overflow-hidden"
		style:background={`radial-gradient(circle at 50% 32%, ${preview.accent}40, #120b08 72%)`}
		aria-hidden="true"
	>
		<div
			class="absolute inset-0 opacity-40"
			style:background={`radial-gradient(circle at 50% 75%, ${preview.accent}22, transparent 62%)`}
		></div>
		{#if PosterIcon}
			<PosterIcon size={96} strokeWidth={1.15} class="relative text-white/85" />
		{/if}
	</div>
{/if}
