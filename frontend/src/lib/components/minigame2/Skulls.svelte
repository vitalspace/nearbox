<script lang="ts">
	import { minigame2 } from '../../state/minigame2.svelte';
	import Skull from './Skull.svelte';

	const DEPOSIT = { x: 36.68, y: -6.9, z: 40.3 };

	const visible = $derived(minigame2.skulls.filter((skull) => skull.state !== 'carried'));

	function positionOf(index: number, skull: (typeof visible)[number]): [number, number, number] {
		if (skull.state === 'deposited') {
			const angle = index * 2.1;

			return [DEPOSIT.x + Math.cos(angle) * 0.62, DEPOSIT.y, DEPOSIT.z + Math.sin(angle) * 0.5];
		}

		return [skull.x, skull.y, skull.z];
	}
</script>

{#each visible as skull, index (skull.id)}
	<Skull
		position={positionOf(index, skull)}
		phase={index * 0.7}
		scale={skull.state === 'deposited' ? 0.8 : 1}
	/>
{/each}
