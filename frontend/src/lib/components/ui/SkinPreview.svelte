<script lang="ts">
	import { Canvas } from '@threlte/core';
	import type { SkinId } from '../../cosmetics/skins';
	import SkinPreviewStage from './SkinPreviewStage.svelte';

	interface Props {
		skin: SkinId;
	}

	let { skin }: Props = $props();
</script>

<div class="h-full w-full">
	<Canvas>
		<SkinPreviewStage {skin} />
	</Canvas>
</div>
