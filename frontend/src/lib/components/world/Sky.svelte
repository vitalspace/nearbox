<script lang="ts">
	import { T, useTask, useThrelte } from '@threlte/core';
	import {
		BackSide,
		CubeCamera,
		HalfFloatType,
		LinearMipmapLinearFilter,
		Mesh,
		Vector3,
		WebGLCubeRenderTarget
	} from 'three';

	/*
	 * Halloween night sky.
	 *
	 * A single inverted sphere with a procedural shader: deep indigo gradient,
	 * a violet nebula band, twinkling stars, a warm full moon with craters and
	 * slowly drifting clouds. Everything is painted per-pixel, so it costs one
	 * draw call and no extra assets or geometry in the scene.
	 *
	 * The dome follows the camera so the stars stay infinitely far away, and a
	 * small cube capture feeds `scene.environment` so PBR materials keep their
	 * sky reflections (same behaviour the old `<Sky>` had).
	 */

	const SKY_RADIUS = 12000;
	const ENV_MAP_SIZE = 128;

	// Harvest moon low over the village, in the direction the camera faces on spawn.
	const MOON_DIRECTION = new Vector3(-0.57, 0.14, -0.81).normalize();

	const vertexShader = /* glsl */ `
		varying vec3 vDirection;

		void main() {
			// The dome is centred on the camera, so the local position is the
			// view direction. Normalising in the fragment shader keeps the
			// gradient smooth across the low-poly sphere.
			vDirection = position;

			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}
	`;

	const fragmentShader = /* glsl */ `
		uniform float uTime;
		uniform vec3 uMoonDirection;

		varying vec3 vDirection;

		// sRGB authored colours; the final colorspace pass converts them back.
		vec3 srgb(vec3 c) {
			return pow(c, vec3(2.2));
		}

		float hash13(vec3 p) {
			p = fract(p * 0.1031);
			p += dot(p, p.zyx + 31.32);
			return fract((p.x + p.y) * p.z);
		}

		float hash21(vec2 p) {
			p = fract(p * vec2(123.34, 456.21));
			p += dot(p, p + 45.32);
			return fract(p.x * p.y);
		}

		float noise2(vec2 p) {
			vec2 i = floor(p);
			vec2 f = fract(p);
			vec2 u = f * f * (3.0 - 2.0 * f);

			float a = hash21(i);
			float b = hash21(i + vec2(1.0, 0.0));
			float c = hash21(i + vec2(0.0, 1.0));
			float d = hash21(i + vec2(1.0, 1.0));

			return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
		}

		float fbm(vec2 p) {
			float value = 0.0;
			float amplitude = 0.5;

			for (int i = 0; i < 4; i++) {
				value += amplitude * noise2(p);
				p = p * 2.03 + vec2(17.13, 9.27);
				amplitude *= 0.5;
			}

			return value;
		}

		// One layer of stars: hash a 3D grid around the unit sphere. Stars are
		// stable in world space and only their brightness twinkles.
		float starLayer(vec3 direction, float scale, float threshold, float time) {
			vec3 position = direction * scale;
			vec3 cell = floor(position);
			vec3 offset = fract(position) - 0.5;

			float seed = hash13(cell);
			if (seed < threshold) {
				return 0.0;
			}

			float brightness = (seed - threshold) / (1.0 - threshold);
			float radius = mix(0.16, 0.34, hash13(cell + 7.1));
			float core = smoothstep(radius, 0.0, length(offset));
			float twinkle = 0.68 + 0.32 * sin(time * (1.2 + seed * 2.5) + seed * 41.0);

			return pow(core, 1.6) * twinkle * (0.3 + 0.7 * brightness);
		}

		void main() {
			vec3 direction = normalize(vDirection);
			float height = direction.y;
			float up = clamp(height, 0.0, 1.0);
			float azimuth = atan(direction.z, direction.x);

			// ---------- Base gradient ----------
			vec3 horizonColor = srgb(vec3(0.105, 0.042, 0.175));
			vec3 midColor = srgb(vec3(0.041, 0.022, 0.098));
			vec3 zenithColor = srgb(vec3(0.010, 0.007, 0.030));

			vec3 color = mix(horizonColor, midColor, smoothstep(0.0, 0.38, up));
			color = mix(color, zenithColor, smoothstep(0.28, 0.95, up));

			// Below the horizon: near-black haze so distant gaps blend in.
			vec3 groundColor = mix(
				srgb(vec3(0.030, 0.017, 0.052)),
				srgb(vec3(0.008, 0.005, 0.017)),
				clamp(-height * 3.0, 0.0, 1.0)
			);

			// Warm village glow on the horizon, a cool witch-green haze opposite.
			float warmGlow = exp(-pow((azimuth - 3.65) * 1.15, 2.0)) * exp(-up * 9.0);
			color += srgb(vec3(0.32, 0.11, 0.035)) * warmGlow * 0.28;

			float witchGlow = exp(-pow((azimuth + 1.25) * 1.5, 2.0)) * exp(-up * 7.0);
			color += srgb(vec3(0.045, 0.28, 0.13)) * witchGlow * 0.09;

			// Thin fog band right at the horizon.
			color += srgb(vec3(0.10, 0.045, 0.15)) * exp(-up * 26.0) * 0.30;

			// ---------- Nebula ----------
			// Planar projection keeps the noise seamless across the dome.
			vec2 nebulaUv = direction.xz / (0.35 + up) * 0.9;
			float nebula = fbm(nebulaUv * 1.35 + vec2(uTime * 0.003, -uTime * 0.002));

			vec3 bandNormal = normalize(vec3(0.62, 0.18, -0.76));
			float band = exp(-pow(dot(direction, bandNormal) * 3.2, 2.0));
			// Fade the nebula out before the horizon: its planar projection
			// stretches into streaks when seen edge-on.
			float dustFade = smoothstep(0.0, 0.24, height);
			float dust = smoothstep(0.34, 0.84, nebula) * band * dustFade;

			color += srgb(vec3(0.30, 0.10, 0.55)) * dust * 0.24;
			color += srgb(vec3(0.05, 0.26, 0.15)) * pow(dust, 2.0) * 0.12;
			color += srgb(vec3(0.45, 0.40, 0.65)) * pow(nebula, 2.0) * band * dustFade * 0.035;

			// ---------- Stars ----------
			float starFade = smoothstep(0.0, 0.22, height);
			float stars = starLayer(direction, 150.0, 0.986, uTime) * 0.7
				+ starLayer(direction, 62.0, 0.992, uTime) * 1.15;

			float starSeed = hash13(floor(direction * 97.0));
			vec3 starTint = mix(
				srgb(vec3(1.0, 0.93, 0.78)),
				srgb(vec3(0.74, 0.84, 1.0)),
				starSeed
			);

			color += starTint * stars * starFade;

			// ---------- Moon ----------
			float moonDot = dot(direction, uMoonDirection);
			float moonDisc = smoothstep(0.99930, 0.99952, moonDot);

			if (moonDisc > 0.0) {
				// Tangent frame on the moon disc, used for craters.
				vec3 tangent = normalize(cross(uMoonDirection, vec3(0.0, 1.0, 0.0)));
				vec3 bitangent = cross(uMoonDirection, tangent);
				vec2 moonUv = vec2(dot(direction, tangent), dot(direction, bitangent)) / 0.029;
				float radiusSq = dot(moonUv, moonUv);

				float craters = fbm(moonUv * 2.6 + 4.7);
				float maria = smoothstep(0.44, 0.72, craters);
				vec3 moonColor = mix(
					srgb(vec3(0.98, 0.93, 0.78)),
					srgb(vec3(0.68, 0.57, 0.41)),
					maria
				);

				// Dim the limb so the moon reads as a sphere, not a flat circle.
				moonColor *= mix(0.60, 1.0, pow(max(0.0, 1.0 - radiusSq), 0.35));

				color = mix(color, moonColor, moonDisc);
			}

			float halo = pow(max(moonDot, 0.0), 320.0) * 0.55
				+ pow(max(moonDot, 0.0), 24.0) * 0.055;
			color += srgb(vec3(0.85, 0.62, 0.28)) * halo * (1.0 - moonDisc);

			// ---------- Clouds ----------
			if (height > 0.0) {
				vec2 cloudUv = direction.xz / (height + 0.12) * 0.6;
				vec2 drift = vec2(uTime * 0.0045, uTime * 0.0015);

				float base = fbm(cloudUv * 1.7 + drift);
				float detail = fbm(cloudUv * 3.9 - drift * 1.6 + 21.3);
				float cloud = smoothstep(0.56, 0.80, base * 0.72 + detail * 0.38);

				// Keep the horizon busy and let clouds thin out overhead.
				cloud *= smoothstep(0.0, 0.16, height);
				cloud *= 1.0 - smoothstep(0.55, 1.0, height) * 0.5;

				float moonLight = pow(max(moonDot, 0.0), 5.0);
				vec3 cloudColor = mix(
					srgb(vec3(0.045, 0.025, 0.085)),
					srgb(vec3(0.32, 0.24, 0.45)),
					moonLight * 0.85 + 0.1
				);
				cloudColor += srgb(vec3(0.30, 0.10, 0.03)) * warmGlow * 0.5;

				color = mix(color, cloudColor, cloud * 0.72);
			}

			// Everything below the horizon dissolves into the dark ground haze:
			// the sky only has to cover the world, not the floor.
			color = mix(groundColor, color, smoothstep(-0.025, 0.02, height));

			gl_FragColor = vec4(color, 1.0);

			#include <tonemapping_fragment>
			#include <colorspace_fragment>
		}
	`;

	const uniforms = {
		uTime: { value: 0 },
		uMoonDirection: { value: MOON_DIRECTION }
	};

	const { camera, renderer, scene, invalidate } = useThrelte();

	let skyMesh = $state<Mesh>();
	let elapsed = 0;

	useTask((delta) => {
		elapsed += delta;
		uniforms.uTime.value = elapsed;

		// Keep the dome centred on the camera: no parallax, no clipping.
		if (skyMesh) {
			skyMesh.position.copy(camera.current.position);
		}
	});

	// Bake the sky once into a small cube map for `scene.environment`. This
	// replaces the reflection/ambient contribution the old Sky component
	// provided, so PBR materials do not lose their sky lighting.
	$effect(() => {
		if (!skyMesh) return;

		const target = new WebGLCubeRenderTarget(ENV_MAP_SIZE, {
			type: HalfFloatType,
			generateMipmaps: true,
			minFilter: LinearMipmapLinearFilter
		});
		const cubeCamera = new CubeCamera(1, SKY_RADIUS * 2, target);
		const previousEnvironment = scene.environment;

		cubeCamera.update(renderer, skyMesh);
		scene.environment = target.texture;
		invalidate();

		return () => {
			scene.environment = previousEnvironment;

			try {
				target.dispose();
			} catch (error) {
				console.warn('Could not dispose the sky environment map:', error);
			}
		};
	});
</script>

<T.Mesh bind:ref={skyMesh} frustumCulled={false} renderOrder={-1000}>
	<T.SphereGeometry args={[SKY_RADIUS, 64, 48]} />
	<T.ShaderMaterial
		{uniforms}
		{vertexShader}
		{fragmentShader}
		side={BackSide}
		depthWrite={false}
		depthTest={false}
	/>
</T.Mesh>
