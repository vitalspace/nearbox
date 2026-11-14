<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { onDestroy } from 'svelte';
	import {
		AdditiveBlending,
		BufferAttribute,
		BufferGeometry,
		CylinderGeometry,
		DoubleSide,
		PointsMaterial,
		ShaderMaterial,
		SphereGeometry,
		MeshBasicMaterial,
		type Group,
		type PointLight
	} from 'three';
	import { DEMON_FIRE_HALF_ANGLE, DEMON_FIRE_RANGE } from '../../state/wavesConfig';

	interface Props {
		x: number;
		y: number;
		z: number;
		dx: number;
		dy: number;
		dz: number;
		/** Cone length in metres; the parkour guardians use a longer reach. */
		length?: number;
	}

	let { x, y, z, dx, dy, dz, length = DEMON_FIRE_RANGE }: Props = $props();

	// El servidor manda el cono exacto (alcance y semiángulo compartidos en
	// `wavesConfig`). El cliente no decide daño: solo dibuja la llamarada.
	// svelte-ignore state_referenced_locally
	const LENGTH = length;
	const RADIUS = LENGTH * Math.tan(DEMON_FIRE_HALF_ANGLE);
	const SEED = Math.random() * 40;

	const glowGeometry = new SphereGeometry(0.34, 16, 12);
	const glowMaterial = new MeshBasicMaterial({
		color: 0xffb347,
		transparent: true,
		opacity: 0.85,
		depthWrite: false,
		blending: AdditiveBlending
	});

	/**
	 * Cono con el vértice en la boca y la base hacia +Z. `CylinderGeometry`
	 * nace a lo largo de Y; se baja medio cuerpo (ápice en el origen) y se
	 * gira para que el eje coincida con el `lookAt` del grupo.
	 */
	function makeCone(radius: number, length: number): CylinderGeometry {
		const geometry = new CylinderGeometry(0.05, radius, length, 28, 12, true);
		geometry.translate(0, -length / 2, 0);
		geometry.rotateX(-Math.PI / 2);
		return geometry;
	}

	const outerGeometry = makeCone(RADIUS, LENGTH);
	const coreGeometry = makeCone(RADIUS * 0.52, LENGTH * 0.92);

	const vertexShader = `
		uniform float uLength;
		varying vec2 vUv;
		varying float vAlong;
		varying vec3 vNormal;
		varying vec3 vViewDir;

		void main() {
			vUv = uv;
			vAlong = clamp(position.z / uLength, 0.0, 1.0);
			vNormal = normalize(normalMatrix * normal);
			vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
			vViewDir = normalize(-mvPosition.xyz);
			gl_Position = projectionMatrix * mvPosition;
		}
	`;

	const fragmentShader = `
		uniform float uTime;
		uniform float uSeed;
		uniform float uIntensity;
		varying vec2 vUv;
		varying float vAlong;
		varying vec3 vNormal;
		varying vec3 vViewDir;

		float hash(vec2 p) {
			return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
		}

		float noise(vec2 p) {
			vec2 i = floor(p);
			vec2 f = fract(p);
			vec2 u = f * f * (3.0 - 2.0 * f);
			return mix(
				mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
				mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
				u.y
			);
		}

		float fbm(vec2 p) {
			float value = 0.0;
			float amplitude = 0.5;

			for (int i = 0; i < 4; i += 1) {
				value += amplitude * noise(p);
				p *= 2.07;
				amplitude *= 0.5;
			}

			return value;
		}

		void main() {
			float along = vAlong;
			float t = uTime + uSeed;

			// Dos capas de ruido: una gruesa que viaja hacia el final del cono
			// (como el chorro) y otra fina que rompe el borde en lenguas.
			float flow = fbm(vec2(vUv.x * 3.0 + uSeed, along * 3.6 - t * 2.4));
			float detail = fbm(vec2(vUv.x * 11.0 + uSeed * 2.0, along * 9.5 - t * 5.2));
			float tongues = smoothstep(0.34, 0.92, flow * 0.7 + detail * 0.5);

			float flicker = 0.78 + 0.22 * sin(t * 19.0 + along * 14.0 + uSeed * 5.0);

			// Rampa de color: blanco-amarillo en la boca → naranja → brasa.
			vec3 hot = vec3(1.0, 0.97, 0.80);
			vec3 flame = vec3(1.0, 0.52, 0.09);
			vec3 ember = vec3(0.55, 0.07, 0.01);
			vec3 colour = mix(hot, flame, smoothstep(0.0, 0.42, along));
			colour = mix(colour, ember, smoothstep(0.45, 1.0, along));

			// El borde visto de refilón se enciende: da volumen al cono.
			float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewDir))), 1.5);
			colour += hot * rim * 0.6;
			colour *= 0.74 + flow * 0.62;

			// Entra rápido en la boca y se apaga antes de la punta.
			float startFade = smoothstep(0.0, 0.06, along);
			float endFade = 1.0 - smoothstep(0.5, 1.0, along);
			float alpha = (0.2 + tongues * 0.5 + detail * 0.22) * startFade * endFade;
			alpha *= flicker * uIntensity;

			gl_FragColor = vec4(colour * (1.0 + detail * 0.4), alpha);
		}
	`;

	const outerUniforms = {
		uTime: { value: 0 },
		uLength: { value: LENGTH },
		uSeed: { value: SEED },
		uIntensity: { value: 0.52 }
	};
	const coreUniforms = {
		uTime: { value: 0 },
		uLength: { value: LENGTH * 0.92 },
		uSeed: { value: SEED + 11.7 },
		uIntensity: { value: 0.95 }
	};

	const outerMaterial = new ShaderMaterial({
		uniforms: outerUniforms,
		vertexShader,
		fragmentShader,
		transparent: true,
		depthWrite: false,
		side: DoubleSide,
		blending: AdditiveBlending,
		toneMapped: false
	});
	const coreMaterial = new ShaderMaterial({
		uniforms: coreUniforms,
		vertexShader,
		fragmentShader,
		transparent: true,
		depthWrite: false,
		side: DoubleSide,
		blending: AdditiveBlending,
		toneMapped: false
	});

	// Chispas: salen de la boca siguiendo el eje del cono con algo de gravedad.
	const EMBERS = 20;
	const emberGeometry = new BufferGeometry();
	const emberPositions = new Float32Array(EMBERS * 3);
	const emberVelocity = new Float32Array(EMBERS * 3);

	for (let i = 0; i < EMBERS; i += 1) {
		const index = i * 3;
		emberPositions[index] = 0;
		emberPositions[index + 1] = 0;
		emberPositions[index + 2] = Math.random() * 0.3;
		emberVelocity[index] = (Math.random() - 0.5) * 1.6;
		emberVelocity[index + 1] = (Math.random() - 0.5) * 1.2;
		emberVelocity[index + 2] = 3.5 + Math.random() * 6;
	}

	const emberAttribute = new BufferAttribute(emberPositions, 3);
	emberGeometry.setAttribute('position', emberAttribute);
	const emberMaterial = new PointsMaterial({
		color: 0xffb347,
		size: 0.14,
		transparent: true,
		opacity: 0.95,
		depthWrite: false,
		blending: AdditiveBlending,
		sizeAttenuation: true
	});

	let group = $state<Group>();
	let light = $state<PointLight>();
	let elapsed = 0;

	useTask((delta) => {
		elapsed += delta;
		outerUniforms.uTime.value = elapsed;
		coreUniforms.uTime.value = elapsed;

		if (group) {
			group.position.set(x, y, z);
			// `lookAt` orienta el +Z local (el eje del cono) hacia la dirección
			// que calcula el servidor desde la boca del demonio.
			group.lookAt(x + dx, y + dy, z + dz);

			// Latido leve del volumen: el fuego nunca queda rígido.
			const pulse = 1 + Math.sin(elapsed * 23 + SEED) * 0.035;
			group.scale.set(pulse, pulse, 1 + Math.sin(elapsed * 17 + SEED) * 0.05);
		}

		if (light) {
			light.intensity = 16 + Math.sin(elapsed * 31 + SEED) * 6;
		}

		// Las chispas viajan hacia delante y caen un poco antes de reciclarse.
		for (let i = 0; i < EMBERS; i += 1) {
			const index = i * 3;
			emberVelocity[index + 1] -= 3.2 * delta;
			emberPositions[index] += emberVelocity[index] * delta;
			emberPositions[index + 1] += emberVelocity[index + 1] * delta;
			emberPositions[index + 2] += emberVelocity[index + 2] * delta;

			if (emberPositions[index + 2] > LENGTH) {
				emberPositions[index] = (Math.random() - 0.5) * 0.25;
				emberPositions[index + 1] = (Math.random() - 0.5) * 0.2;
				emberPositions[index + 2] = 0;
				emberVelocity[index] = (Math.random() - 0.5) * 1.6;
				emberVelocity[index + 1] = (Math.random() - 0.5) * 1.2;
				emberVelocity[index + 2] = 3.5 + Math.random() * 6;
			}
		}

		emberAttribute.needsUpdate = true;
	});

	onDestroy(() => {
		outerGeometry.dispose();
		coreGeometry.dispose();
		glowGeometry.dispose();
		outerMaterial.dispose();
		coreMaterial.dispose();
		glowMaterial.dispose();
		emberGeometry.dispose();
		emberMaterial.dispose();
	});
</script>

<T.Group bind:ref={group} position={[x, y, z]}>
	<!-- Llama exterior: cono ancho, naranja e irregular. -->
	<T.Mesh geometry={outerGeometry} material={outerMaterial} frustumCulled={false} />
	<!-- Núcleo: más corto, estrecho y blanco-amarillo. -->
	<T.Mesh geometry={coreGeometry} material={coreMaterial} frustumCulled={false} />
	<!-- Chispas que escapan del chorro. -->
	<T.Points geometry={emberGeometry} material={emberMaterial} frustumCulled={false} />
	<!-- Fogonazo en la boca: tapa el nacimiento del cono y se lee como fuego. -->
	<T.Mesh geometry={glowGeometry} material={glowMaterial} position={[0, 0, 0.05]} />
	<T.PointLight
		bind:ref={light}
		color={0xff7a18}
		intensity={18}
		distance={11}
		decay={2}
		position={[0, 0, 0.6]}
	/>
</T.Group>
