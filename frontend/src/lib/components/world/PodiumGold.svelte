<script lang="ts">
	import { useTask } from '@threlte/core';
	import { onDestroy } from 'svelte';
	import {
		Color,
		DoubleSide,
		ShaderMaterial,
		Vector3,
		type Group,
		type Material,
		type Mesh
	} from 'three';
	import { GOLD_FRAGMENT_SHADER, GOLD_VERTEX_SHADER } from './goldShader';

	/**
	 * Oro visible del podio Top3.
	 *
	 * `Map.svelte` es generado automáticamente por `@threlte/gltf`, así que el
	 * material no se toca en el componente: se buscan los meshes en runtime y se
	 * les cambia el material por el shader de oro. `TOP3_GoldGlow` se deja
	 * intacto porque ya es emisivo y se ve bien.
	 */
	let { root }: { root?: Group } = $props();

	type GoldSpec = { color: string; deep: string; glow: number };

	const TARGETS: Record<string, GoldSpec> = {
		TOP3_Gold: { color: '#ffc84d', deep: '#4d2b05', glow: 0.22 },
		TOP3_GoldDark: { color: '#d69a2e', deep: '#3a1f04', glow: 0.1 }
	};

	const uTime = { value: 0 };
	const uLightDir = { value: new Vector3(45, 65, 25).normalize() };
	const uFillDir = { value: new Vector3(-35, 30, -20).normalize() };
	const uSunDir = { value: new Vector3(-0.35, 0.45, -0.82).normalize() };

	const materials = new Map<string, ShaderMaterial>();
	const swaps: { mesh: Mesh; original: Material | Material[] }[] = [];
	const attached = new Set<Mesh>();

	let elapsed = 0;

	function materialFor(name: string): ShaderMaterial {
		const cached = materials.get(name);
		if (cached) return cached;

		const spec = TARGETS[name];
		const material = new ShaderMaterial({
			uniforms: {
				uTime,
				uGold: { value: new Color(spec.color) },
				uGoldDeep: { value: new Color(spec.deep) },
				uGlow: { value: spec.glow },
				uLightDir,
				uFillDir,
				uSunDir
			},
			vertexShader: GOLD_VERTEX_SHADER,
			fragmentShader: GOLD_FRAGMENT_SHADER,
			side: DoubleSide,
			toneMapped: true
		});

		materials.set(name, material);
		return material;
	}

	function attach(mesh: Mesh): void {
		if (attached.has(mesh)) return;

		const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
		const name = source?.name;
		if (!name || !(name in TARGETS)) return;

		swaps.push({ mesh, original: mesh.material });
		mesh.material = materialFor(name);
		attached.add(mesh);
	}

	useTask((delta) => {
		elapsed += delta;
		uTime.value = elapsed;

		if (!root) return;

		// El GLB se resuelve de forma asíncrona; hasta que aparece el podio esta
		// búsqueda no devuelve nada y se reintenta en el siguiente frame.
		const podium = root.getObjectByName('Top3_Root');
		if (!podium) return;

		podium.traverse((child) => {
			if ((child as Mesh).isMesh) attach(child as Mesh);
		});
	});

	onDestroy(() => {
		for (const swap of swaps) swap.mesh.material = swap.original;
		for (const material of materials.values()) material.dispose();

		swaps.length = 0;
		attached.clear();
		materials.clear();
	});
</script>
