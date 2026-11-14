<script lang="ts">
	import { Canvas } from '@threlte/core';
	import MissionThumbnailStage from './MissionThumbnailStage.svelte';

	interface Props {
		kind: 'cats' | 'crypt' | 'race';
	}

	let { kind }: Props = $props();
</script>

<div class="h-full w-full" aria-hidden="true">
	<Canvas>
		<MissionThumbnailStage {kind} />
	</Canvas>
</div>
