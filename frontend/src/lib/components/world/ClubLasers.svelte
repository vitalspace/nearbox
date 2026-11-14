<script lang="ts">
	import { useTask } from '@threlte/core';
	import { onDestroy } from 'svelte';
	import {
		AdditiveBlending,
		CircleGeometry,
		Color,
		CylinderGeometry,
		DoubleSide,
		Group,
		Mesh,
		MeshBasicMaterial,
		Quaternion,
		SphereGeometry,
		Vector3,
		type MeshStandardMaterial,
		type Object3D
	} from 'three';
	import { musicSpectrum } from '../../audio/spectrum';

	/**
	 * Láseres del club.
	 *
	 * `Map.svelte` se genera automáticamente, así que no lo tocamos: buscamos
	 * las seis cabezas móviles del escenario (`DV2_MHHead_*`) y les colgamos un
	 * haz aditivo que barre la pista. Las cabezas y sus lentes también giran
	 * para que la luz parezca salir de ellas.
	 *
	 * El show corre con el mismo pulso sintético a 128 BPM que la pantalla del
	 * club, de modo que no depende del audio procedural ni del jukebox.
	 */
	let { root }: { root?: Group } = $props();

	const FIXTURE_X = [-7.5, -4.5, -1.5, 1.5, 4.5, 7.5];
	const FIXTURE_Y = 6.96;
	const FIXTURE_Z = -16.62;
	const HEAD_TILT = -1.13;
	const BEAM_LENGTH = 16.4;
	const FLOOR_Y = 0.02;
	const BEAM_COLORS = ['#ff2d55', '#22ff88', '#2d7bff', '#ffe23d', '#ff2d55', '#22ff88'];

	/** Fase/velocidad por fixture para que no barran todos a la vez. */
	const MOTION = [
		{ panSpeed: 0.55, panAmp: 0.55, tiltSpeed: 0.9, tiltAmp: 0.22, phase: 0 },
		{ panSpeed: 0.72, panAmp: 0.6, tiltSpeed: 1.1, tiltAmp: 0.18, phase: 1.1 },
		{ panSpeed: 0.63, panAmp: 0.5, tiltSpeed: 0.8, tiltAmp: 0.26, phase: 2.3 },
		{ panSpeed: 0.81, panAmp: 0.62, tiltSpeed: 1.0, tiltAmp: 0.2, phase: 3.6 },
		{ panSpeed: 0.48, panAmp: 0.52, tiltSpeed: 0.95, tiltAmp: 0.24, phase: 4.8 },
		{ panSpeed: 0.68, panAmp: 0.58, tiltSpeed: 1.15, tiltAmp: 0.19, phase: 5.9 }
	];

	type LensRestore = { material: MeshStandardMaterial; emissive: Color; intensity: number };

	type Fixture = {
		pivot: Group;
		head: Mesh | null;
		lens: Mesh | null;
		origin: Vector3;
		/** Pose original de la lente para restaurarla al desmontar. */
		lensParent: Object3D | null;
		lensPosition: Vector3;
		lensQuaternion: Quaternion;
		lensScale: Vector3;
		footprint: Mesh;
		lensMaterial: MeshStandardMaterial | null;
		coreMaterial: MeshBasicMaterial;
		haloMaterial: MeshBasicMaterial;
		glowMaterial: MeshBasicMaterial;
		spotMaterial: MeshBasicMaterial;
		motion: (typeof MOTION)[number];
	};

	// Geometrías compartidas por todos los haces.
	const coreGeometry = new CylinderGeometry(0.012, 0.042, BEAM_LENGTH, 6, 1, true);
	const haloGeometry = new CylinderGeometry(0.055, 0.19, BEAM_LENGTH, 10, 1, true);
	const glowGeometry = new SphereGeometry(0.16, 12, 12);
	const footprintGeometry = new CircleGeometry(0.72, 24);

	const fixtures: Fixture[] = [];
	const lensRestores: LensRestore[] = [];
	let built = false;
	let elapsed = 0;
	/** Tiempo del show: acelera con la energía de la canción sin saltos. */
	let showTime = 0;

	const direction = new Vector3();

	function lensMaterialOf(mesh: Mesh | null): MeshStandardMaterial | null {
		if (!mesh) {
			return null;
		}

		const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;

		if (material && 'emissive' in material) {
			return material as MeshStandardMaterial;
		}

		return null;
	}

	function build(): void {
		if (built || !root) {
			return;
		}

		// Espera a que el GLB haya creado las cabezas móviles.
		if (!root.getObjectByName('DV2_MHHead_0')) {
			return;
		}

		built = true;

		for (let i = 0; i < FIXTURE_X.length; i++) {
			const head = (root.getObjectByName(`DV2_MHHead_${i}`) as Mesh | undefined) ?? null;
			const lens = (root.getObjectByName(`DV2_MHLensObj_${i}`) as Mesh | undefined) ?? null;
			const color = new Color(BEAM_COLORS[i]);
			const origin = new Vector3(FIXTURE_X[i], FIXTURE_Y, FIXTURE_Z);

			const pivot = new Group();
			pivot.position.copy(origin);
			pivot.rotation.set(HEAD_TILT, 0, 0);
			root.add(pivot);

			const coreMaterial = new MeshBasicMaterial({
				color,
				transparent: true,
				opacity: 0.55,
				depthWrite: false,
				blending: AdditiveBlending,
				toneMapped: false,
				fog: false
			});
			const haloMaterial = new MeshBasicMaterial({
				color,
				transparent: true,
				opacity: 0.12,
				depthWrite: false,
				blending: AdditiveBlending,
				toneMapped: false,
				fog: false
			});
			const glowMaterial = new MeshBasicMaterial({
				color,
				transparent: true,
				opacity: 0.8,
				depthWrite: false,
				blending: AdditiveBlending,
				toneMapped: false,
				fog: false
			});
			const spotMaterial = new MeshBasicMaterial({
				color,
				transparent: true,
				opacity: 0.14,
				depthWrite: false,
				blending: AdditiveBlending,
				side: DoubleSide,
				toneMapped: false,
				fog: false
			});

			const core = new Mesh(coreGeometry, coreMaterial);
			core.position.y = -BEAM_LENGTH / 2;
			pivot.add(core);

			const halo = new Mesh(haloGeometry, haloMaterial);
			halo.position.y = -BEAM_LENGTH / 2;
			pivot.add(halo);

			const glow = new Mesh(glowGeometry, glowMaterial);
			glow.position.set(0, -0.02, 0.02);
			pivot.add(glow);

			const footprint = new Mesh(footprintGeometry, spotMaterial);
			footprint.rotation.x = -Math.PI / 2;
			footprint.position.set(FIXTURE_X[i], FLOOR_Y, FIXTURE_Z + 8);
			root.add(footprint);

			// Haz que las lentes emitan el color del láser.
			const lensMaterial = lensMaterialOf(lens);

			if (lensMaterial) {
				lensRestores.push({
					material: lensMaterial,
					emissive: lensMaterial.emissive.clone(),
					intensity: lensMaterial.emissiveIntensity
				});
				lensMaterial.emissive.copy(color);
				lensMaterial.emissiveIntensity = 1.6;
				lensMaterial.needsUpdate = true;
			}

			// La lente es un mesh hermano de la cabeza. La emparentamos para que
			// gire rígida con ella: así nunca se descuadra al panear/tiltear.
			const lensParent = lens?.parent ?? null;
			const lensPosition = lens ? lens.position.clone() : new Vector3();
			const lensQuaternion = lens ? lens.quaternion.clone() : new Quaternion();
			const lensScale = lens ? lens.scale.clone() : new Vector3(1, 1, 1);

			if (head && lens) {
				head.attach(lens);
			}

			fixtures.push({
				pivot,
				head,
				lens,
				origin,
				lensParent,
				lensPosition,
				lensQuaternion,
				lensScale,
				footprint,
				lensMaterial,
				coreMaterial,
				haloMaterial,
				glowMaterial,
				spotMaterial,
				motion: MOTION[i]
			});
		}
	}

	useTask((delta) => {
		const dt = Math.min(delta, 0.1);
		elapsed += dt;

		build();

		if (fixtures.length === 0) {
			return;
		}

		// Con canción, los láseres siguen el espectro real del jukebox; sin
		// pista, caen al pulso sintético de 128 BPM.
		const spectrum = musicSpectrum;
		const beatPhase = elapsed * (128 / 60);
		const syntheticKick = Math.pow(1 - (beatPhase % 1), 7);
		const kick = spectrum.active ? spectrum.beat : syntheticKick;
		const energy = spectrum.active
			? 0.45 + spectrum.bass * 0.45 + spectrum.mid * 0.2 + kick * 0.35
			: 0.7 + syntheticKick * 0.5;
		const speed = spectrum.active ? 0.75 + spectrum.energy * 1.0 : 1;
		const ampScale = 1 + spectrum.bass * 0.35;

		showTime += dt * speed;

		for (const fixture of fixtures) {
			const { motion } = fixture;
			const pan = Math.sin(showTime * motion.panSpeed + motion.phase) * motion.panAmp * ampScale;
			const tiltDelta = Math.sin(showTime * motion.tiltSpeed + motion.phase * 1.7) * motion.tiltAmp;
			const tilt = HEAD_TILT + tiltDelta;

			fixture.pivot.rotation.set(tilt, pan, 0);

			// La cabeza arrastra la lente (ya emparentada) y el haz.
			if (fixture.head) {
				fixture.head.rotation.set(tilt, pan, 0);
			}

			// Punto de impacto del haz en el suelo (plano y = FLOOR_Y).
			direction.set(0, -1, 0).applyEuler(fixture.pivot.rotation);

			if (direction.y < -0.08) {
				const travel = (FIXTURE_Y - FLOOR_Y) / -direction.y;
				const scale = Math.min(1.6, Math.max(0.7, travel / 16));
				fixture.footprint.visible = true;
				fixture.footprint.position.set(
					fixture.origin.x + direction.x * travel,
					FLOOR_Y,
					fixture.origin.z + direction.z * travel
				);
				fixture.footprint.scale.setScalar(scale);
			} else {
				fixture.footprint.visible = false;
			}

			const flicker = 0.85 + 0.15 * Math.sin(elapsed * 23 + motion.phase * 3);
			fixture.coreMaterial.opacity = Math.min(1, 0.42 * energy * flicker);
			fixture.haloMaterial.opacity = Math.min(0.4, 0.1 * energy * flicker);
			fixture.glowMaterial.opacity = Math.min(1, 0.55 + kick * 0.45);
			fixture.spotMaterial.opacity = Math.min(0.5, 0.1 * energy);

			if (fixture.lensMaterial) {
				fixture.lensMaterial.emissiveIntensity = 1.0 + kick * 2.4;
			}
		}
	});

	onDestroy(() => {
		for (const fixture of fixtures) {
			fixture.pivot.removeFromParent();
			fixture.footprint.removeFromParent();
			fixture.coreMaterial.dispose();
			fixture.haloMaterial.dispose();
			fixture.glowMaterial.dispose();
			fixture.spotMaterial.dispose();

			// Devuelve las cabezas y lentes a su pose original.
			if (fixture.head) {
				fixture.head.rotation.set(HEAD_TILT, 0, 0);
			}

			if (fixture.lens && fixture.lensParent) {
				fixture.lensParent.add(fixture.lens);
				fixture.lens.position.copy(fixture.lensPosition);
				fixture.lens.quaternion.copy(fixture.lensQuaternion);
				fixture.lens.scale.copy(fixture.lensScale);
			}
		}

		for (const restore of lensRestores) {
			restore.material.emissive.copy(restore.emissive);
			restore.material.emissiveIntensity = restore.intensity;
			restore.material.needsUpdate = true;
		}

		coreGeometry.dispose();
		haloGeometry.dispose();
		glowGeometry.dispose();
		footprintGeometry.dispose();
		fixtures.length = 0;
		lensRestores.length = 0;
	});
</script>
