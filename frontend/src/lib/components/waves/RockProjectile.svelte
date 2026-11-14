<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { AdditiveBlending, type Group } from 'three';

	interface Props {
		x: number;
		y: number;
		z: number;
	}

	let { x, y, z }: Props = $props();

	// Roca de lava del Golem: basalto oscuro con vetas incandescentes y un
	// borde fresnel anaranjado. Todo procedural para no depender de texturas.
	const uniforms = { uTime: { value: Math.random() * 20 } };

	const vertexShader = `
		uniform float uTime;
		varying vec3 vNormal;
		varying vec3 vViewDir;
		varying vec3 vLocal;

		float wobble(vec3 p) {
			return
				sin(p.x * 6.0 + uTime * 3.0) *
				sin(p.y * 7.0 - uTime * 2.0) *
				sin(p.z * 6.5 + uTime * 2.5);
		}

		void main() {
			// Pequeña deformación para que la roca no sea una esfera perfecta.
			vec3 displaced = position + normal * wobble(position) * 0.055;

			vLocal = displaced;
			vNormal = normalize(normalMatrix * normal);
			vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
			vViewDir = normalize(-mvPosition.xyz);
			gl_Position = projectionMatrix * mvPosition;
		}
	`;

	const fragmentShader = `
		uniform float uTime;
		varying vec3 vNormal;
		varying vec3 vViewDir;
		varying vec3 vLocal;

		float hash(vec3 p) {
			p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
			p *= 17.0;
			return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
		}

		float noise(vec3 x) {
			vec3 i = floor(x);
			vec3 f = fract(x);
			f = f * f * (3.0 - 2.0 * f);

			return mix(
				mix(
					mix(hash(i + vec3(0.0, 0.0, 0.0)), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
					mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x),
					f.y
				),
				mix(
					mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
					mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x),
					f.y
				),
				f.z
			);
		}

		float fbm(vec3 p) {
			float value = 0.0;
			float amplitude = 0.5;

			for (int i = 0; i < 4; i++) {
				value += amplitude * noise(p);
				p *= 2.02;
				amplitude *= 0.5;
			}

			return value;
		}

		void main() {
			// La lava fluye: el ruido se desplaza en vertical con el tiempo.
			vec3 flow = vLocal * 3.4 + vec3(0.0, uTime * 0.55, uTime * 0.22);
			float n = fbm(flow);
			float band = abs(n - 0.52);

			// Vetas finas (grietas) y charcos de lava más anchos.
			float cracks = 1.0 - smoothstep(0.018, 0.085, band);
			float pools = smoothstep(0.62, 0.88, n);
			float pulse = 0.75 + 0.25 * sin(uTime * 5.5 + n * 8.0);

			vec3 basalt = vec3(0.055, 0.048, 0.045);
			vec3 stone = vec3(0.16, 0.135, 0.125);
			vec3 rock = mix(basalt, stone, smoothstep(0.15, 0.85, n));

			vec3 deep = vec3(1.0, 0.16, 0.015);
			vec3 hot = vec3(1.0, 0.86, 0.32);
			vec3 lava = mix(deep, hot, smoothstep(0.35, 0.95, n));

			float rim = pow(
				1.0 - clamp(dot(normalize(vNormal), normalize(vViewDir)), 0.0, 1.0),
				2.2
			);

			vec3 colour = rock;
			colour = mix(colour, lava, cracks * 0.95);
			colour = mix(colour, lava, pools * 0.8);
			colour += deep * rim * 1.4 * pulse;
			colour += hot * cracks * 0.35 * pulse;

			gl_FragColor = vec4(colour, 1.0);
		}
	`;

	let group = $state<Group>();
	let elapsed = uniforms.uTime.value;

	useTask((delta) => {
		elapsed += delta;
		uniforms.uTime.value = elapsed;

		if (group) {
			// Gira y respira como una masa fundida en vuelo.
			group.rotation.x += delta * 2.1;
			group.rotation.y += delta * 2.8;
			group.scale.setScalar(1 + Math.sin(elapsed * 8) * 0.04);
		}
	});
</script>

<T.Group bind:ref={group} position={[x, y, z]}>
	<!-- Halo de calor -->
	<T.Mesh>
		<T.SphereGeometry args={[0.66, 16, 12]} />
		<T.MeshBasicMaterial
			color={0xff4d00}
			transparent
			opacity={0.16}
			depthWrite={false}
			blending={AdditiveBlending}
		/>
	</T.Mesh>

	<!-- Roca con shader de lava -->
	<T.Mesh>
		<T.IcosahedronGeometry args={[0.52, 2]} />
		<T.ShaderMaterial {uniforms} {vertexShader} {fragmentShader} toneMapped={false} />
	</T.Mesh>

	<!-- Luz cálida para que la roca ilumine el suelo al pasar -->
	<T.PointLight color={0xff5a1f} intensity={5} distance={7} decay={2} />
</T.Group>
