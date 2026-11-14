<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { AdditiveBlending, type Group } from 'three';

	interface Props {
		x: number;
		y: number;
		z: number;
	}

	let { x, y, z }: Props = $props();

	// Procedural "plasma goo": a dark green blob with animated acid veins and
	// a fresnel rim that pulses, so the projectile reads as a glowing hazard
	// instead of a flat green ball.
	const uniforms = { uTime: { value: Math.random() * 20 } };

	const vertexShader = `
		varying vec3 vNormal;
		varying vec3 vViewDir;
		varying vec3 vLocal;

		void main() {
			vLocal = position;
			vNormal = normalize(normalMatrix * normal);
			vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
			vViewDir = normalize(-mvPosition.xyz);
			gl_Position = projectionMatrix * mvPosition;
		}
	`;

	const fragmentShader = `
		uniform float uTime;
		varying vec3 vNormal;
		varying vec3 vViewDir;
		varying vec3 vLocal;

		void main() {
			float swirl =
				sin(vLocal.y * 11.0 + uTime * 6.0) *
				sin(vLocal.x * 13.0 - uTime * 4.5) *
				sin(vLocal.z * 15.0 + uTime * 5.5);
			float veins = smoothstep(0.0, 0.85, 0.5 + 0.5 * swirl);
			float rim = pow(
				1.0 - clamp(dot(normalize(vNormal), normalize(vViewDir)), 0.0, 1.0),
				2.0
			);
			float pulse = 0.72 + 0.28 * sin(uTime * 9.0);

			vec3 dark = vec3(0.06, 0.18, 0.02);
			vec3 glow = vec3(0.72, 0.98, 0.30);
			vec3 colour = mix(dark, glow, veins) + glow * rim * 1.7 * pulse;

			gl_FragColor = vec4(colour, 1.0);
		}
	`;

	let group = $state<Group>();
	let elapsed = uniforms.uTime.value;

	useTask((delta) => {
		elapsed += delta;
		uniforms.uTime.value = elapsed;

		if (group) {
			// Small breathing wobble so the blob looks alive.
			group.scale.setScalar(1 + Math.sin(elapsed * 11) * 0.08);
		}
	});
</script>

<T.Group bind:ref={group} position={[x, y, z]}>
	<!-- Outer glow -->
	<T.Mesh>
		<T.SphereGeometry args={[0.33, 14, 10]} />
		<T.MeshBasicMaterial
			color={0xa3e635}
			transparent
			opacity={0.22}
			depthWrite={false}
			blending={AdditiveBlending}
		/>
	</T.Mesh>

	<!-- Acid core with the procedural shader -->
	<T.Mesh>
		<T.SphereGeometry args={[0.19, 20, 16]} />
		<T.ShaderMaterial {uniforms} {vertexShader} {fragmentShader} toneMapped={false} />
	</T.Mesh>
</T.Group>
