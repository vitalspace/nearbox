<script lang="ts">
	import { T } from '@threlte/core';
	import { useDraco, useGltf } from '@threlte/extras';
	import { asset } from '../../assets/path';

	/**
	 * Componente manual de `islas_ciudad.glb`.
	 *
	 * El mapa tiene ~3 100 mallas y ningún clip; `@threlte/gltf` generaría un
	 * componente enorme y además falla con los nombres Unicode (`Recamara_Buró_*`).
	 * Se monta la escena tal cual y `ChunkedColliders` construye la física desde
	 * la lista blanca de `world/islas-ciudad.physics.json`.
	 */
	const gltf = useGltf(asset('maps/islas_ciudad.glb'), {
		dracoLoader: useDraco(asset('draco/'))
	});
</script>

{#if $gltf}
	<T is={$gltf.scene} />
{/if}
