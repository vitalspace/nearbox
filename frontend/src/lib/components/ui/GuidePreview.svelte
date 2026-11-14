<script lang="ts">
	import { Canvas } from '@threlte/core';
	import type { OnboardingPreviewKind } from './onboardingTutorial';
	import OnboardingPreviewStage from './OnboardingPreviewStage.svelte';

	interface Props {
		kind: OnboardingPreviewKind;
	}

	let { kind }: Props = $props();
</script>

<div class="h-full w-full" aria-hidden="true">
	<Canvas>
		{#key kind}
			<OnboardingPreviewStage {kind} />
		{/key}
	</Canvas>
</div>
