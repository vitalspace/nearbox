<script lang="ts">
	import { useTask } from '@threlte/core';
	import { onDestroy } from 'svelte';
	import { DoubleSide, ShaderMaterial, Vector2, type Group, type Material, type Mesh } from 'three';
	import {
		VIDEO_WALL_FRAGMENT_SHADER,
		VIDEO_WALL_VERTEX_SHADER,
		createVideoWallLogoTexture
	} from './videoWallShader';
	import { musicSpectrum } from '../../audio/spectrum';

	let { root }: { root?: Group } = $props();

	// Muro del club y pantallas de las dos torres nuevas. `Map.svelte` se
	// genera automáticamente, así que se buscan por nombre en tiempo de ejecución.
	const SCREEN_NAMES = ['DV_VideoWall', 'DV3_Tower_L_Screen', 'DV3_Tower_R_Screen'];

	// Los uniforms de tiempo/audio se comparten entre pantallas; cada una tiene
	// su propio `uWallSize` para que el contenido no se deforme.
	const sharedUniforms = {
		uTime: { value: 0 },
		uBass: { value: 0 },
		uMid: { value: 0 },
		uHigh: { value: 0 },
		uBeat: { value: 0 },
		uLogo: { value: createVideoWallLogoTexture() }
	};

	type Screen = {
		mesh: Mesh;
		material: ShaderMaterial;
		originalMaterial: Material | Material[];
	};

	const screens: Screen[] = [];
	const attached = new Set<Mesh>();

	let elapsed = 0;
	let bass = 0;
	let mid = 0;
	let high = 0;
	let beat = 0;

	function attach(mesh: Mesh): void {
		if (attached.has(mesh)) return;

		// Medidas reales del mesh para que la rejilla y el logo mantengan la
		// proporción tanto en el muro de 16 x 6 como en las pantallas pequeñas.
		mesh.geometry.computeBoundingBox();
		const box = mesh.geometry.boundingBox;
		const size = new Vector2(16, 6);
		if (box) size.set(box.max.x - box.min.x, box.max.y - box.min.y);

		// El logo ocupa siempre ~45 % de la altura de la pantalla: el muro del
		// club conserva su tamaño (2.7) y las pantallas pequeñas de las torres
		// lo reducen en la misma proporción.
		const logoScale = Math.min(2.7, Math.max(0.55, size.y * 0.45));

		const material = new ShaderMaterial({
			uniforms: {
				...sharedUniforms,
				uWallSize: { value: size },
				uLogoScale: { value: logoScale }
			},
			vertexShader: VIDEO_WALL_VERTEX_SHADER,
			fragmentShader: VIDEO_WALL_FRAGMENT_SHADER,
			side: DoubleSide,
			toneMapped: false,
			fog: false
		});

		const originalMaterial = mesh.material;
		mesh.material = material;
		screens.push({ mesh, material, originalMaterial });
		attached.add(mesh);
	}

	useTask((delta) => {
		const dt = Math.min(delta, 0.1);
		elapsed += dt;
		sharedUniforms.uTime.value = elapsed;

		if (root) {
			for (const name of SCREEN_NAMES) {
				const found = root.getObjectByName(name);
				if (found && (found as Mesh).isMesh) attach(found as Mesh);
			}
		}

		// Si el jukebox está sonando, la pantalla reacciona al espectro real de
		// la canción; si no hay pista, mantiene el pulso sintético a 128 BPM
		// para que el club nunca se quede quieto.
		const spectrum = musicSpectrum;
		const beatPhase = elapsed * (128 / 60);
		const syntheticKick = Math.pow(1 - (beatPhase % 1), 7);

		let targetBass: number;
		let targetMid: number;
		let targetHigh: number;
		let kick: number;

		if (spectrum.active) {
			targetBass = 0.16 + spectrum.bass * 0.9;
			targetMid = 0.16 + spectrum.mid * 0.85;
			targetHigh = 0.1 + spectrum.high * 0.95;
			kick = spectrum.beat;
		} else {
			targetBass = 0.22 + syntheticKick * 0.78;
			targetMid = 0.28 + 0.22 * Math.sin(elapsed * 2.3);
			targetHigh = 0.18 + 0.14 * Math.sin(elapsed * 5.7 + 1.3);
			kick = Math.max(0, (targetBass - 0.42) / 0.58);
		}

		const ease = 1 - Math.exp(-dt * 14);
		bass += (targetBass - bass) * ease;
		mid += (targetMid - mid) * ease;
		high += (targetHigh - high) * ease;

		beat = Math.max(beat * Math.exp(-dt * 5.5), kick);

		sharedUniforms.uBass.value = bass;
		sharedUniforms.uMid.value = mid;
		sharedUniforms.uHigh.value = high;
		sharedUniforms.uBeat.value = beat;
	});

	onDestroy(() => {
		for (const screen of screens) {
			screen.mesh.material = screen.originalMaterial;
			screen.material.dispose();
		}

		screens.length = 0;
		attached.clear();
		sharedUniforms.uLogo.value.dispose();
	});
</script>
