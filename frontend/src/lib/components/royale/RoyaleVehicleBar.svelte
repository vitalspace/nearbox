<script lang="ts">
	import { HTML } from '@threlte/extras';

	type Props = {
		health: number;
		maxHealth: number;
		height: number;
		label: string;
		kind: 'car' | 'balloon';
		visible?: boolean;
	};

	let { health, maxHealth, height, label, kind, visible = true }: Props = $props();

	const percent = $derived(
		maxHealth > 0 ? Math.max(0, Math.min(100, (health / maxHealth) * 100)) : 0
	);
	const destroyed = $derived(health <= 0);
</script>

{#if visible}
	<HTML position={[0, height, 0]} center pointerEvents="none" zIndexRange={[12, 0]}>
		<div class="royale-vehicle-bar" class:destroyed>
			<div class="name">{label}</div>
			<div class="track">
				<div
					class="fill"
					class:balloon={kind === 'balloon'}
					style:width={`${destroyed ? 0 : percent}%`}
				></div>
			</div>
			{#if destroyed}
				<div class="wreck">WRECK</div>
			{/if}
		</div>
	</HTML>
{/if}

<style>
	.royale-vehicle-bar {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 4px 8px;
		border-radius: 8px;
		background: rgba(2, 6, 23, 0.72);
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
		backdrop-filter: blur(3px);
		white-space: nowrap;
		pointer-events: none;
	}

	.name {
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #e2e8f0;
	}

	.track {
		width: 86px;
		height: 6px;
		overflow: hidden;
		border-radius: 999px;
		background: rgba(51, 65, 85, 0.9);
	}

	.fill {
		height: 100%;
		border-radius: 999px;
		background: linear-gradient(90deg, #34d399, #22d3ee);
		transition: width 0.18s linear;
	}

	.fill.balloon {
		background: linear-gradient(90deg, #fbbf24, #fb7185);
	}

	.wreck {
		font-size: 8px;
		font-weight: 800;
		letter-spacing: 0.14em;
		color: #fb7185;
	}

	.destroyed .track {
		background: rgba(127, 29, 29, 0.8);
	}
</style>
