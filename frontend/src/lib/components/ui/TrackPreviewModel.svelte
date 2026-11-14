<script lang="ts">
	import { T } from '@threlte/core';
	import { useGltf, useDraco } from '@threlte/extras';
	import { untrack } from 'svelte';
	import { asset } from '../../assets/path';
	import type { Group } from 'three';
	import { buildTrackPreview, type TrackId } from './trackPreview';

	interface Props {
		track: TrackId;
		/** Set once the GLB has been parsed and the miniature is on stage. */
		loaded?: boolean;
		/** Set when the GLB fails to load, so the parent can show a note. */
		failed?: boolean;
	}

	let { track, loaded = $bindable(false), failed = $bindable(false) }: Props = $props();

	// Note: previews mount inside their own <Canvas>, so the GLB is parsed a
	// second time (the browser still serves the bytes from its HTTP cache).
	// Parsing is cheaper than streaming the full scenery into the card.
	// `track` is fixed for the lifetime of this component (the parent rekeys
	// on change), so capturing it once is intentional.
	const url = untrack(() => (track === 'grand-prix' ? 'maps/map.glb' : 'maps/roadmap.glb'));
	const gltf = useGltf(asset(url), { dracoLoader: useDraco(asset('draco/')) });

	let preview = $state<Group | null>(null);

	$effect(() => {
		const unsubscribe = gltf.subscribe((resolved) => {
			if (!resolved || preview) {
				return;
			}

			preview = buildTrackPreview(resolved.scene, resolved.nodes, track);
			loaded = true;
		});

		return unsubscribe;
	});

	$effect(() => {
		const unsubscribe = gltf.error.subscribe((error) => {
			if (error) {
				failed = true;
				loaded = true;
			}
		});

		return unsubscribe;
	});
</script>

{#if preview}
	<T is={preview} />
{/if}
