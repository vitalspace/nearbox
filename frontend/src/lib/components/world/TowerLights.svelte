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
		Object3D,
		PointLight,
		Quaternion,
		SpotLight,
		Vector3,
		type Material,
		type MeshStandardMaterial
	} from 'three';
	import { musicSpectrum } from '../../audio/spectrum';

	/**
	 * Luces de las torres DV3.
	 *
	 * Las torres nuevas traen cuatro pares y una barra de luz por torre, pero
	 * el GLB no incluye fuentes de luz reales. Este componente replica el show
	 * del escenario principal: haces aditivos, lentes emisivas, focos que
	 * iluminan el suelo y pulsos sincronizados con la música (o con el kick
	 * sintético a 128 BPM cuando no hay canción).
	 *
	 * `Map.svelte` es generado, así que todo se busca por nombre en runtime.
	 */
	let { root }: { root?: Group } = $props();

	const UP = new Vector3(0, 1, 0);
	const DOWN = new Vector3(0, -1, 0);

	type TowerSpec = {
		side: 'L' | 'R';
		colors: string[];
		glow: string;
		phase: number;
	};

	const TOWERS: TowerSpec[] = [
		{
			side: 'L',
			colors: ['#22d3ee', '#38bdf8', '#818cf8', '#e879f9'],
			glow: '#38bdf8',
			phase: 0
		},
		{
			side: 'R',
			colors: ['#fb7185', '#f472b6', '#fbbf24', '#f97316'],
			glow: '#f472b6',
			phase: 1.7
		}
	];

	const PAR_COUNT = 4;
	const PAR_AIM = 9.5;
	const FLOOR_Y = 0.12;
	const SPOT_ANGLE = 0.3;
	const SPOT_BASE_INTENSITY = 34;

	type Fixture = {
		light: SpotLight;
		target: Object3D;
		pivot: Group;
		origin: Vector3;
		offset: Vector3;
		footprint: Mesh;
		footprintScale: number;
		coreMaterial: MeshBasicMaterial;
		haloMaterial: MeshBasicMaterial;
		footprintMaterial: MeshBasicMaterial;
		lensMaterial: MeshStandardMaterial | null;
		phase: number;
	};

	type PulseLight = { light: PointLight; base: number; phase: number };
	type MaterialSwap = { mesh: Mesh; original: Material | Material[] };

	const fixtures: Fixture[] = [];
	const pulseLights: PulseLight[] = [];
	const materialSwaps: MaterialSwap[] = [];
	const barMaterials: { material: MeshStandardMaterial; phase: number }[] = [];

	// Geometrías compartidas por los ocho haces.
	const coreGeometry = new CylinderGeometry(0.02, 0.12, 1, 8, 1, true);
	const haloGeometry = new CylinderGeometry(0.06, 0.32, 1, 12, 1, true);
	const footprintGeometry = new CircleGeometry(1, 28);

	const tempQuaternion = new Quaternion();
	const tempDirection = new Vector3();
	const tempTarget = new Vector3();
	const tempOffset = new Vector3();

	let built = false;
	let elapsed = 0;

	function swapMaterial(mesh: Mesh): MeshStandardMaterial | null {
		const current = mesh.material;
		const source = Array.isArray(current) ? current[0] : current;
		if (!source || !('emissive' in source)) return null;

		const clone = source.clone() as MeshStandardMaterial;
		materialSwaps.push({ mesh, original: current });
		mesh.material = clone;
		return clone;
	}

	function build(): void {
		if (built || !root) return;

		// Espera a que el GLB haya creado las torres.
		if (
			!root.getObjectByName('DV3_Tower_L_ParLens_1') ||
			!root.getObjectByName('DV3_Tower_R_ParLens_1')
		) {
			return;
		}

		root.updateWorldMatrix(true, true);
		built = true;

		for (const tower of TOWERS) {
			const screen = root.getObjectByName(`DV3_Tower_${tower.side}_Screen`) as Mesh | undefined;
			const bar = root.getObjectByName(`DV3_Tower_${tower.side}_LightBar`) as Mesh | undefined;
			if (!screen) continue;

			// Las pantallas miran hacia el centro del mapa; los pares apuntan
			// en esa misma dirección y se inclinan hacia el suelo.
			const screenQuaternion = screen.getWorldQuaternion(tempQuaternion);
			const front = new Vector3(0, 0, 1).applyQuaternion(screenQuaternion).normalize();
			const screenRight = new Vector3(1, 0, 0).applyQuaternion(screenQuaternion).normalize();

			if (bar) {
				const material = swapMaterial(bar);
				if (material) {
					material.emissive = new Color(tower.glow);
					material.emissiveIntensity = 1.4;
					barMaterials.push({ material, phase: tower.phase });
				}

				const barLight = new PointLight(tower.glow, 12, 8, 2);
				barLight.position.copy(bar.getWorldPosition(new Vector3()).addScaledVector(front, 0.55));
				root.add(barLight);
				pulseLights.push({ light: barLight, base: 12, phase: tower.phase });
			}

			// Luz de relleno delante de la pantalla: hace que el shader
			// ilumine la estructura de la torre y el suelo cercano.
			const screenLight = new PointLight(tower.glow, 8, 7, 2);
			screenLight.position.copy(screen.getWorldPosition(new Vector3()).addScaledVector(front, 1.1));
			root.add(screenLight);
			pulseLights.push({ light: screenLight, base: 8, phase: tower.phase + 0.9 });

			for (let index = 0; index < PAR_COUNT; index += 1) {
				const lens = root.getObjectByName(`DV3_Tower_${tower.side}_ParLens_${index + 1}`) as
					Mesh | undefined;
				if (!lens) continue;

				const color = new Color(tower.colors[index % tower.colors.length]);
				const origin = lens.getWorldPosition(new Vector3());
				// Abre un poco el abanico para que los cuatro haces no se
				// apilen en el mismo punto y saturen la pantalla.
				const spread = (index - (PAR_COUNT - 1) / 2) * 1.15;
				const targetBase = origin
					.clone()
					.addScaledVector(front, PAR_AIM)
					.addScaledVector(screenRight, spread);
				targetBase.y = FLOOR_Y;
				const offset = targetBase.clone().sub(origin);
				const length = offset.length();

				const light = new SpotLight(color, 0, length * 2, SPOT_ANGLE, 0.62, 1.7);
				light.position.copy(origin);
				light.castShadow = false;
				root.add(light);

				const target = new Object3D();
				target.position.copy(targetBase);
				root.add(target);
				light.target = target;

				const pivot = new Group();
				pivot.position.copy(origin);
				root.add(pivot);

				const coreMaterial = new MeshBasicMaterial({
					color,
					transparent: true,
					opacity: 0.1,
					depthWrite: false,
					blending: AdditiveBlending,
					toneMapped: false,
					fog: false,
					side: DoubleSide
				});
				const haloMaterial = new MeshBasicMaterial({
					color,
					transparent: true,
					opacity: 0.03,
					depthWrite: false,
					blending: AdditiveBlending,
					toneMapped: false,
					fog: false,
					side: DoubleSide
				});
				const footprintMaterial = new MeshBasicMaterial({
					color,
					transparent: true,
					opacity: 0.12,
					depthWrite: false,
					blending: AdditiveBlending,
					toneMapped: false,
					fog: false,
					side: DoubleSide
				});

				const core = new Mesh(coreGeometry, coreMaterial);
				core.position.y = -length / 2;
				core.scale.y = length;
				pivot.add(core);

				const halo = new Mesh(haloGeometry, haloMaterial);
				halo.position.y = -length / 2;
				halo.scale.y = length;
				pivot.add(halo);

				const footprintScale = Math.min(2.5, Math.tan(SPOT_ANGLE) * length * 0.7);
				const footprint = new Mesh(footprintGeometry, footprintMaterial);
				footprint.rotation.x = -Math.PI / 2;
				footprint.position.copy(targetBase);
				footprint.position.y = 0.07;
				footprint.scale.setScalar(footprintScale);
				root.add(footprint);

				const lensMaterial = swapMaterial(lens);
				if (lensMaterial) {
					lensMaterial.emissive.copy(color);
					lensMaterial.emissiveIntensity = 4;
				}

				fixtures.push({
					light,
					target,
					pivot,
					origin,
					offset,
					footprint,
					footprintScale,
					coreMaterial,
					haloMaterial,
					footprintMaterial,
					lensMaterial,
					phase: tower.phase + index * 0.8
				});
			}
		}
	}

	useTask((delta) => {
		const dt = Math.min(delta, 0.1);
		elapsed += dt;

		build();

		if (fixtures.length === 0) return;

		// Mismo pulso que la pantalla y los láseres del club.
		const spectrum = musicSpectrum;
		const beatPhase = elapsed * (128 / 60);
		const syntheticKick = Math.pow(1 - (beatPhase % 1), 7);
		const kick = spectrum.active ? spectrum.beat : syntheticKick;
		const energy = spectrum.active
			? 0.45 + spectrum.bass * 0.45 + spectrum.mid * 0.2 + kick * 0.35
			: 0.7 + syntheticKick * 0.5;

		for (const fixture of fixtures) {
			// Barrido suave alrededor de la dirección base, sin cambiar la
			// altura del punto de impacto.
			const yaw = Math.sin(elapsed * 0.9 + fixture.phase) * 0.2;
			tempOffset.copy(fixture.offset).applyAxisAngle(UP, yaw);
			tempTarget.copy(fixture.origin).add(tempOffset);
			tempTarget.y = FLOOR_Y;

			fixture.target.position.copy(tempTarget);
			tempDirection.copy(tempTarget).sub(fixture.origin).normalize();
			fixture.pivot.quaternion.setFromUnitVectors(DOWN, tempDirection);

			fixture.footprint.position.set(tempTarget.x, 0.07, tempTarget.z);
			fixture.footprint.scale.setScalar(fixture.footprintScale * (0.9 + kick * 0.22));

			const flicker = 0.9 + 0.1 * Math.sin(elapsed * 17 + fixture.phase * 5);
			fixture.light.intensity = SPOT_BASE_INTENSITY * (0.55 + energy * 0.5 + kick * 0.6) * flicker;
			fixture.coreMaterial.opacity = Math.min(0.18, (0.04 + energy * 0.06 + kick * 0.07) * flicker);
			fixture.haloMaterial.opacity = Math.min(
				0.075,
				(0.012 + energy * 0.02 + kick * 0.02) * flicker
			);
			fixture.footprintMaterial.opacity = Math.min(0.16, 0.04 + energy * 0.05 + kick * 0.05);

			if (fixture.lensMaterial) {
				fixture.lensMaterial.emissiveIntensity = 3 + energy * 3 + kick * 5;
			}
		}

		for (const pulse of pulseLights) {
			const wave = 0.5 + 0.5 * Math.sin(elapsed * 2.2 + pulse.phase * 3);
			pulse.light.intensity = pulse.base * (0.6 + energy * 0.5 + kick * 0.5 + wave * 0.12);
		}

		for (const bar of barMaterials) {
			bar.material.emissiveIntensity =
				0.8 + energy * 1.2 + kick * 1.8 + 0.15 * Math.sin(elapsed * 3 + bar.phase);
		}
	});

	onDestroy(() => {
		for (const fixture of fixtures) {
			fixture.light.removeFromParent();
			fixture.target.removeFromParent();
			fixture.pivot.removeFromParent();
			fixture.footprint.removeFromParent();
			fixture.coreMaterial.dispose();
			fixture.haloMaterial.dispose();
			fixture.footprintMaterial.dispose();
		}

		for (const pulse of pulseLights) pulse.light.removeFromParent();

		for (const swap of materialSwaps) {
			const current = swap.mesh.material;
			if (Array.isArray(current)) current.forEach((material) => material.dispose());
			else current.dispose();
			swap.mesh.material = swap.original;
		}

		coreGeometry.dispose();
		haloGeometry.dispose();
		footprintGeometry.dispose();

		fixtures.length = 0;
		pulseLights.length = 0;
		materialSwaps.length = 0;
		barMaterials.length = 0;
	});
</script>
