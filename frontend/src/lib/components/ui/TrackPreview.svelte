<script lang="ts">
	import { Canvas } from '@threlte/core';
	import TrackPreviewStage from './TrackPreviewStage.svelte';
	import type { TrackId } from './trackPreview';

	interface Props {
		track: TrackId;
		loaded?: boolean;
		failed?: boolean;
	}

	let { track, loaded = $bindable(false), failed = $bindable(false) }: Props = $props();
</script>

<div class="h-full w-full" aria-hidden="true">
	<Canvas>
		<TrackPreviewStage {track} bind:loaded bind:failed />
	</Canvas>
</div>
