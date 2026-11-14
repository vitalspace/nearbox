<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import type { Mesh } from 'three';
	import { MeshBasicMaterial, TorusGeometry } from 'three';

	// Golden ring over the south platform of `A4C_Tombs`.
	const DEPOSIT: [number, number, number] = [36.68, -7.48, 40.3];

	const ringGeometry = new TorusGeometry(1.6, 0.045, 8, 72);
	const glowGeometry = new TorusGeometry(1.85, 0.09, 8, 72);

	const ringMaterial = new MeshBasicMaterial({
		color: '#f6c56b',
		transparent: true,
		opacity: 0.95,
		toneMapped: false
	});

	const glowMaterial = new MeshBasicMaterial({
		color: '#f59e0b',
		transparent: true,
		opacity: 0.28,
		toneMapped: false
	});

	let glow = $state<Mesh>();
	let elapsed = 0;

	useTask((delta) => {
		elapsed += delta;

		if (glow) {
			const pulse = 0.24 + Math.sin(elapsed * 2.2) * 0.08;
			glow.scale.setScalar(1 + Math.sin(elapsed * 2.2) * 0.02);
			glowMaterial.opacity = pulse;
		}
	});

	$effect(() => {
		return () => {
			ringGeometry.dispose();
			glowGeometry.dispose();
			ringMaterial.dispose();
			glowMaterial.dispose();
		};
	});
</script>

<T.Group position={DEPOSIT} rotation={[-Math.PI / 2, 0, 0]}>
	<T.Mesh geometry={ringGeometry} material={ringMaterial} />
	<T.Mesh bind:ref={glow} geometry={glowGeometry} material={glowMaterial} position={[0, 0, 0.02]} />
</T.Group>
