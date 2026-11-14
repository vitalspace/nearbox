<script lang="ts">
	import { T, useTask, useThrelte } from '@threlte/core';
	import { get } from 'svelte/store';
	import { DoubleSide, Quaternion, Vector3, type Mesh } from 'three';

	interface Props {
		x: number;
		y: number;
		z: number;
		seed?: number;
		onDone?: () => void;
	}

	let { x, y, z, seed = Math.random() * 1000, onDone }: Props = $props();

	/**
	 * Blood impact for weapon hits.
	 *
	 * The server only reports the damage point (inside the target's body), so
	 * the splat is pushed towards the camera until it sits on the visible
	 * surface and is billboarded. The blot itself is a procedural shader: an
	 * irregular core with a few satellite droplets, dark red with a wet core.
	 * Small droplets fly out with gravity for the first fraction of a second.
	 */

	const { camera } = useThrelte();

	const LIFE = 1.15;
	const SPLAT_OFFSET = 0.55;
	const SPLAT_SIZE = 0.62;

	// Keyed by effect id: the seed is static per mount.
	// svelte-ignore state_referenced_locally
	const uniforms = {
		uTime: { value: 0 },
		uOpacity: { value: 0 },
		uSeed: { value: seed }
	};

	const vertexShader = `
		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}
	`;

	const fragmentShader = `
		uniform float uTime;
		uniform float uOpacity;
		uniform float uSeed;
		varying vec2 vUv;

		float hash(vec2 p) {
			p = fract(p * vec2(123.34, 456.21) + uSeed);
			p += dot(p, p + 45.32);
			return fract(p.x * p.y);
		}

		float noise(vec2 p) {
			vec2 i = floor(p);
			vec2 f = fract(p);
			f = f * f * (3.0 - 2.0 * f);

			return mix(
				mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
				mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
				f.y
			);
		}

		void main() {
			vec2 p = vUv * 2.0 - 1.0;
			p.x *= 1.12;

			float r = length(p);
			float angle = atan(p.y, p.x);
			float wobble = noise(vec2(cos(angle) * 2.1, sin(angle) * 2.1) + uSeed);
			float edge = 0.46 + wobble * 0.26;

			// Main blot: irregular, thick in the centre.
			float blot = 1.0 - smoothstep(edge - 0.18, edge, r);
			float core = 1.0 - smoothstep(0.0, edge * 0.8, r);

			// Satellite drops around the blot.
			float drops = 0.0;

			for (int i = 0; i < 5; i++) {
				float fi = float(i);
				vec2 centre = vec2(
					cos(fi * 2.399 + uSeed),
					sin(fi * 1.7 + uSeed * 1.3)
				) * (0.55 + 0.26 * fract(fi * 0.618));
				float drop = length((p - centre) * vec2(1.0, 1.32));
				drops += 1.0 - smoothstep(0.015, 0.085, drop);
			}

			float alpha = clamp(blot * 0.94 + drops * 0.85, 0.0, 1.0) * uOpacity;
			vec3 deep = vec3(0.16, 0.004, 0.006);
			vec3 red = vec3(0.52, 0.02, 0.028);
			vec3 colour = mix(deep, red, 0.35 + wobble * 0.45 + core * 0.25);
			colour += vec3(0.22, 0.03, 0.02) * pow(core, 3.0);
			// A faint dark rim keeps the blot readable on bright skins.
			colour *= 0.85 + 0.15 * (1.0 - smoothstep(0.0, edge, r));
			// Slight animation so the wet surface shimmers while it fades.
			colour += vec3(0.06, 0.0, 0.0) * sin(uTime * 22.0 + uSeed) * core * (1.0 - uTime);

			gl_FragColor = vec4(colour, alpha);
		}
	`;

	function random(index: number): number {
		const value = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
		return value - Math.floor(value);
	}

	// Initial burst: mostly outward, a little upward, then gravity.
	const droplets = Array.from({ length: 9 }, (_, index) => {
		const angle = random(index + 1) * Math.PI * 2;
		const speed = 1.1 + random(index + 11) * 2.4;

		return {
			vx: Math.cos(angle) * speed,
			vy: 0.7 + random(index + 21) * 2.1,
			vz: Math.sin(angle) * speed,
			size: 0.028 + random(index + 31) * 0.05,
			delay: random(index + 41) * 0.04
		};
	});

	let age = $state(0);
	let splat = $state<Mesh>();
	let finished = false;

	const cameraPosition = new Vector3();
	const cameraQuaternion = new Quaternion();
	const toCamera = new Vector3();

	const easeOut = (value: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, value)), 3);

	const splatScale = $derived(0.2 + SPLAT_SIZE * 0.55 * easeOut(age / 0.2));
	const dropletScale = $derived(Math.max(0.001, 1 - age / LIFE));

	function dropletPosition(drop: (typeof droplets)[number]): [number, number, number] {
		const t = Math.max(0, age - drop.delay);
		return [drop.vx * t, drop.vy * t - 4.9 * t * t, drop.vz * t];
	}

	useTask((delta) => {
		age += delta;

		const cameraObject = get(camera);

		if (cameraObject && splat) {
			cameraObject.getWorldPosition(cameraPosition);
			toCamera.set(cameraPosition.x - x, cameraPosition.y - y, cameraPosition.z - z);

			const distance = toCamera.length();

			if (distance > 0.01) {
				toCamera.multiplyScalar(Math.min(SPLAT_OFFSET, distance * 0.45) / distance);
				splat.position.copy(toCamera);
			}

			// The group has no rotation, so the camera's world quaternion is
			// also the local one and the plane always faces the player.
			cameraObject.getWorldQuaternion(cameraQuaternion);
			splat.quaternion.copy(cameraQuaternion);
		}

		const life = Math.min(1, age / LIFE);
		const fadeIn = Math.min(1, age / 0.05);
		const fadeOut = age < LIFE * 0.45 ? 1 : 1 - (age - LIFE * 0.45) / (LIFE * 0.55);

		uniforms.uTime.value = life;
		uniforms.uOpacity.value = Math.max(0, Math.min(1, fadeIn * fadeOut)) * 0.95;

		if (!finished && age >= LIFE) {
			finished = true;
			onDone?.();
		}
	});
</script>

<T.Group position={[x, y, z]}>
	<T.Mesh bind:ref={splat} scale={splatScale} renderOrder={5}>
		<T.PlaneGeometry args={[1, 1]} />
		<T.ShaderMaterial
			{uniforms}
			{vertexShader}
			{fragmentShader}
			transparent
			depthWrite={false}
			side={DoubleSide}
			toneMapped={false}
		/>
	</T.Mesh>

	{#each droplets as drop, index (index)}
		<T.Mesh
			position={dropletPosition(drop)}
			scale={drop.size * dropletScale}
			visible={age < LIFE * 0.82}
			renderOrder={5}
		>
			<T.SphereGeometry args={[1, 6, 5]} />
			<T.MeshBasicMaterial color={0x6f0b12} transparent opacity={0.92} depthWrite={false} />
		</T.Mesh>
	{/each}
</T.Group>
