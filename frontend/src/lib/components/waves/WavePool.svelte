<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import type { Group } from 'three';
	import type { Mg5Pool } from '../../services/protocol';

	interface Props {
		pool: Mg5Pool;
	}

	let { pool }: Props = $props();

	// Bubbling acid: a procedural shader instead of two flat circles. The
	// pool keeps the same authoritative radius; only the surface moves.
	const uniforms = { uTime: { value: Math.random() * 10 } };

	const vertexShader = `
		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}
	`;

	const fragmentShader = `
		uniform float uTime;
		varying vec2 vUv;

		void main() {
			vec2 p = vUv * 2.0 - 1.0;
			float r = length(p);
			float angle = atan(p.y, p.x);

			// Soft edge, so the circle does not end in a hard line.
			float edge = smoothstep(1.0, 0.76, r);

			// Bubbles drift from the centre outwards and swirl slowly.
			float bubbles = sin(
				r * 26.0 - uTime * 4.0 + sin(angle * 6.0 + uTime * 1.7) * 2.2
			);
			float spots = smoothstep(0.58, 0.98, bubbles) * (1.0 - r * 0.6);

			float swirl = sin(angle * 3.0 + r * 9.0 - uTime * 2.2) * 0.5 + 0.5;

			vec3 deep = vec3(0.14, 0.28, 0.02);
			vec3 acid = vec3(0.66, 0.92, 0.20);
			vec3 colour = mix(deep, acid, spots * 0.85 + swirl * 0.15);

			float alpha = edge * (0.44 + spots * 0.42);
			// A brighter rim sells the liquid layer.
			alpha += smoothstep(0.82, 0.98, r) * edge * 0.18;

			gl_FragColor = vec4(colour, alpha);
		}
	`;

	let group = $state<Group>();
	let elapsed = uniforms.uTime.value;

	useTask((delta) => {
		elapsed += delta;
		uniforms.uTime.value = elapsed;

		if (!group) {
			return;
		}

		const pulse = 1 + Math.sin(elapsed * 3.1) * 0.05;
		group.scale.set(pulse, 1, pulse);
	});
</script>

<T.Group position={[pool.x, pool.y + 0.02, pool.z]} bind:ref={group}>
	<T.Mesh rotation={[-Math.PI / 2, 0, 0]}>
		<T.CircleGeometry args={[pool.radius, 40]} />
		<T.ShaderMaterial
			{uniforms}
			{vertexShader}
			{fragmentShader}
			transparent
			depthWrite={false}
			toneMapped={false}
		/>
	</T.Mesh>
</T.Group>
