<script lang="ts">
	import { T } from '@threlte/core';
	import {
		BufferGeometry,
		Group,
		Line,
		LineBasicMaterial,
		Mesh,
		MeshBasicMaterial,
		SphereGeometry,
		Vector3,
		type Material
	} from 'three';
	import { NPC_ROUTES, type NpcRouteId } from '../../npcs/npcRoutes';

	const COLORS: Record<NpcRouteId, number> = {
		centro: 0xfdba74,
		paseo: 0x67e8f9,
		bosque: 0x86efac,
		castillo: 0xc4b5fd,
		calabaza: 0xfda4af,
		cementerio: 0xd6d3d1
	};

	const group = new Group();
	const waypointGeometry = new SphereGeometry(0.22, 8, 6);
	const visitGeometry = new SphereGeometry(0.42, 10, 8);
	const visitMaterial = new MeshBasicMaterial({
		color: 0xfacc15,
		depthTest: false,
		transparent: true,
		opacity: 0.9
	});

	for (const route of Object.values(NPC_ROUTES)) {
		const color = COLORS[route.id];
		const points = route.waypoints.map((waypoint) => new Vector3(waypoint.x, 0.6, waypoint.z));

		if (route.loop && points.length > 0) {
			points.push(points[0]!.clone());
		}

		const line = new Line(
			new BufferGeometry().setFromPoints(points),
			new LineBasicMaterial({
				color,
				depthTest: false,
				transparent: true,
				opacity: 0.85
			})
		);

		line.renderOrder = 900;
		group.add(line);

		const markerMaterial = new MeshBasicMaterial({
			color,
			depthTest: false,
			transparent: true,
			opacity: 0.9
		});

		for (const waypoint of route.waypoints) {
			const marker = new Mesh(
				waypoint.visit ? visitGeometry : waypointGeometry,
				waypoint.visit ? visitMaterial : markerMaterial
			);

			marker.position.set(waypoint.x, 0.65, waypoint.z);
			marker.renderOrder = 901;
			group.add(marker);
		}
	}

	visitGeometry.userData.shared = true;
	waypointGeometry.userData.shared = true;

	$effect(() => {
		return () => {
			group.traverse((child) => {
				const mesh = child as Mesh;

				if (mesh.isMesh) {
					if (!mesh.geometry.userData.shared) {
						mesh.geometry.dispose();
					}

					const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

					for (const material of materials as Material[]) {
						if (material !== visitMaterial) {
							material.dispose();
						}
					}
				} else if ((child as Line).isLine) {
					(child as Line).geometry.dispose();
					((child as Line).material as Material).dispose();
				}
			});

			visitMaterial.dispose();
			visitGeometry.dispose();
			waypointGeometry.dispose();
		};
	});
</script>

<T is={group} dispose={false} />
