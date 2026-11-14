<script lang="ts">
	import { T } from '@threlte/core';
	import { untrack } from 'svelte';
	import {
		AdditiveBlending,
		CanvasTexture,
		DoubleSide,
		SpriteMaterial,
		SRGBColorSpace
	} from 'three';
	import { minigame7 } from '../../state/minigame7.svelte';
	import {
		PARKOUR_FINISH,
		parkourCheckpointAt,
		parkourCheckpointName
	} from '../../state/parkourConfig';

	const ACCENT = '#eab308';

	const active = $derived(
		minigame7.snapshot !== null && minigame7.phase === 'playing' && !minigame7.finished
	);

	const next = $derived(minigame7.nextCheckpoint);
	const point = $derived(parkourCheckpointAt(next));
	const label = $derived(next >= PARKOUR_FINISH.index ? 'FINISH' : `CP ${next}`);
	const name = $derived(parkourCheckpointName(next));

	function createBeaconMaterial(title: string, subtitle: string): SpriteMaterial | null {
		if (typeof document === 'undefined') {
			return null;
		}

		const canvas = document.createElement('canvas');
		canvas.width = 512;
		canvas.height = 256;
		const context = canvas.getContext('2d');

		if (!context) {
			return null;
		}

		context.clearRect(0, 0, canvas.width, canvas.height);

		context.fillStyle = 'rgba(8, 10, 16, 0.78)';
		context.beginPath();
		context.roundRect(16, 16, 480, 224, 36);
		context.fill();
		context.lineWidth = 6;
		context.strokeStyle = ACCENT;
		context.stroke();

		context.textAlign = 'center';
		context.textBaseline = 'middle';

		context.font = '700 30px ui-sans-serif, system-ui, sans-serif';
		context.fillStyle = '#fde68a';
		context.fillText('NEXT CHECKPOINT', 256, 70);

		context.font = '900 88px ui-sans-serif, system-ui, sans-serif';
		context.fillStyle = '#ffffff';
		context.fillText(title, 256, 148);

		context.font = '600 26px ui-sans-serif, system-ui, sans-serif';
		context.fillStyle = '#e2e8f0';
		context.fillText(subtitle.slice(0, 24), 256, 208);

		const texture = new CanvasTexture(canvas);
		texture.colorSpace = SRGBColorSpace;
		texture.needsUpdate = true;

		return new SpriteMaterial({
			map: texture,
			transparent: true,
			depthWrite: false
		});
	}

	let spriteMaterial = $state.raw<SpriteMaterial | null>(null);

	$effect(() => {
		const title = label;
		const subtitle = name;
		const nextMaterial = createBeaconMaterial(title, subtitle);
		const previous = untrack(() => spriteMaterial);
		spriteMaterial = nextMaterial;

		return () => {
			untrack(() => {
				if (spriteMaterial === nextMaterial) {
					spriteMaterial = null;
				}
			});

			nextMaterial?.map?.dispose();
			nextMaterial?.dispose();
			previous?.map?.dispose();
			previous?.dispose();
		};
	});
</script>

{#if active && point}
	<T.Group position={[point.x, point.y, point.z]}>
		<!-- Vertical beam: the only checkpoint the local player can activate. -->
		<T.Mesh position={[0, 4, 0]} frustumCulled={false}>
			<T.CylinderGeometry args={[0.22, 0.5, 8, 16, 1, true]} />
			<T.MeshBasicMaterial
				color={ACCENT}
				transparent
				opacity={0.28}
				depthWrite={false}
				side={DoubleSide}
				blending={AdditiveBlending}
			/>
		</T.Mesh>

		<!-- Ground ring so the target is readable from above. -->
		<T.Mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false}>
			<T.RingGeometry args={[2.5, 3.05, 40]} />
			<T.MeshBasicMaterial
				color={ACCENT}
				transparent
				opacity={0.75}
				depthWrite={false}
				side={DoubleSide}
				blending={AdditiveBlending}
			/>
		</T.Mesh>

		{#if spriteMaterial}
			<T.Sprite position={[0, 3.4, 0]} scale={[4.8, 2.4, 1]} material={spriteMaterial} />
		{/if}
	</T.Group>
{/if}
