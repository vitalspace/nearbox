<script lang="ts">
	import { Canvas } from '@threlte/core';
	import ModelPreviewStage from './ModelPreviewStage.svelte';

	interface Props {
		url: string;
		accent: string;
	}

	let { url, accent }: Props = $props();
</script>

<div class="h-full w-full" aria-hidden="true">
	<Canvas>
		{#key url}
			<ModelPreviewStage {url} {accent} />
		{/key}
	</Canvas>
</div>
