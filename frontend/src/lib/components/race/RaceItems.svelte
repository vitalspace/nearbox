<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { CatmullRomCurve3, TubeGeometry, Vector3 } from 'three';
	import { race } from '../../state/race.svelte';

	let elapsed = $state(0);
	let now = $state(Date.now());

	useTask((delta) => {
		elapsed += delta;
		now = race.serverNow();
	});

	// Question mark drawn with primitives so no font asset or texture is
	// needed. The tube follows the hook; the sphere is the dot.
	const questionMark = new TubeGeometry(
		new CatmullRomCurve3([
			new Vector3(-0.17, 0.13, 0),
			new Vector3(-0.15, 0.26, 0),
			new Vector3(-0.02, 0.32, 0),
			new Vector3(0.12, 0.27, 0),
			new Vector3(0.17, 0.15, 0),
			new Vector3(0.13, 0.04, 0),
			new Vector3(0.0, -0.04, 0)
		]),
		32,
		0.055,
		8,
		false
	);

	const items = $derived(
		(race.snapshot?.items ?? []).filter((item) => item.respawnAt === null || item.respawnAt <= now)
	);
</script>

{#each items as item (item.id)}
	<T.Group position={[item.x, item.y + Math.sin(elapsed * 2 + item.x * 0.1) * 0.15, item.z]}>
		<!-- Glowing glass shell -->
		<T.Mesh rotation={[0.35, elapsed * 0.8, 0.15]}>
			<T.BoxGeometry args={[1.25, 1.25, 1.25]} />
			<T.MeshStandardMaterial
				color="#fbbf24"
				emissive="#f59e0b"
				emissiveIntensity={0.65}
				transparent
				opacity={0.2}
				depthWrite={false}
			/>
		</T.Mesh>

		<!-- Bright wireframe edges -->
		<T.Mesh rotation={[0.35, elapsed * 0.8, 0.15]}>
			<T.BoxGeometry args={[1.27, 1.27, 1.27]} />
			<T.MeshBasicMaterial color="#fef3c7" wireframe transparent opacity={0.55} />
		</T.Mesh>

		<!-- Spinning core -->
		<T.Mesh rotation={[elapsed * 1.7, elapsed * 2.3, elapsed * 0.9]}>
			<T.OctahedronGeometry args={[0.48, 0]} />
			<T.MeshBasicMaterial color="#fffbeb" transparent opacity={0.95} />
		</T.Mesh>

		<!-- Two orbit rings -->
		<T.Mesh rotation={[Math.PI / 2 + Math.sin(elapsed) * 0.3, elapsed * 1.1, 0]}>
			<T.TorusGeometry args={[0.82, 0.035, 8, 40]} />
			<T.MeshBasicMaterial color="#fde68a" transparent opacity={0.75} depthWrite={false} />
		</T.Mesh>
		<T.Mesh rotation={[0, elapsed * -1.4, Math.PI / 2 + Math.cos(elapsed) * 0.3]}>
			<T.TorusGeometry args={[0.92, 0.025, 8, 40]} />
			<T.MeshBasicMaterial color="#fbbf24" transparent opacity={0.55} depthWrite={false} />
		</T.Mesh>

		<!-- Question mark -->
		<T.Mesh geometry={questionMark}>
			<T.MeshBasicMaterial color="#fffbeb" transparent opacity={0.98} />
		</T.Mesh>
		<T.Mesh position={[0, -0.22, 0]}>
			<T.SphereGeometry args={[0.055, 12, 10]} />
			<T.MeshBasicMaterial color="#fffbeb" transparent opacity={0.98} />
		</T.Mesh>

		<!-- Ground halo -->
		<T.Mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.0, 0]}>
			<T.RingGeometry args={[0.9, 1.25, 24]} />
			<T.MeshBasicMaterial color="#fde68a" transparent opacity={0.5} depthWrite={false} />
		</T.Mesh>

		<T.PointLight color="#fbbf24" intensity={2.5} distance={5} decay={2} />
	</T.Group>
{/each}
