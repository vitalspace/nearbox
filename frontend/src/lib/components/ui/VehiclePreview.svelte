<script lang="ts">
	import { Canvas } from '@threlte/core';
	import type { CarId } from '../../services/protocol';
	import VehiclePreviewStage from './VehiclePreviewStage.svelte';

	interface Props {
		car: CarId;
	}

	let { car }: Props = $props();
</script>

<div class="h-full w-full" aria-hidden="true">
	<Canvas>
		{#key car}
			<VehiclePreviewStage {car} />
		{/key}
	</Canvas>
</div>
