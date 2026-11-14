<script lang="ts">
	import { minigame8 } from '../../state/minigame8.svelte';
	import { ROYALE_MAP_BOUNDS, ROYALE_POIS, royaleStormAt } from '../../state/royaleConfig';

	const SIZE = 180;
	const PAD = 7;
	const width = ROYALE_MAP_BOUNDS.maxX - ROYALE_MAP_BOUNDS.minX;
	const depth = ROYALE_MAP_BOUNDS.maxZ - ROYALE_MAP_BOUNDS.minZ;
	const scale = Math.min((SIZE - PAD * 2) / width, (SIZE - PAD * 2) / depth);
	const offsetX = PAD + (SIZE - PAD * 2 - width * scale) / 2;
	const offsetY = PAD + (SIZE - PAD * 2 - depth * scale) / 2;

	function px(x: number): number {
		return offsetX + (x - ROYALE_MAP_BOUNDS.minX) * scale;
	}

	function pz(z: number): number {
		return offsetY + (z - ROYALE_MAP_BOUNDS.minZ) * scale;
	}

	const self = $derived(minigame8.self);
	const latestSelf = $derived(
		minigame8.latestPlayers().find((player) => player.id === minigame8.selfId) ?? null
	);
	const playerX = $derived(latestSelf?.x ?? self?.x ?? 0);
	const playerZ = $derived(latestSelf?.z ?? self?.z ?? 0);

	const storm = $derived.by(() => {
		const snapshot = minigame8.snapshot;
		if (!snapshot || snapshot.matchStartedAt === null) return null;
		return royaleStormAt(snapshot.matchStartedAt, minigame8.serverNow(), snapshot.seed);
	});
</script>

{#if minigame8.snapshot}
	<div
		class="pointer-events-none fixed top-20 left-3 z-30 rounded-xl border border-white/10 bg-slate-950/70 p-1.5 shadow-lg backdrop-blur-sm sm:top-24 sm:left-4"
	>
		<svg
			viewBox={`0 0 ${SIZE} ${SIZE}`}
			class="h-32 w-32 sm:h-40 sm:w-40"
			role="img"
			aria-label="Skyfall Royale minimap"
		>
			<defs>
				<clipPath id="royale-map-clip">
					<rect x="0" y="0" width={SIZE} height={SIZE} rx="10" />
				</clipPath>
			</defs>

			<rect x="0" y="0" width={SIZE} height={SIZE} rx="10" fill="#0b2436" />
			<g clip-path="url(#royale-map-clip)">
				<!-- Water/island background grid -->
				<g stroke="#155e75" stroke-width="0.5" opacity="0.35">
					{#each Array.from({ length: 9 }, (_, index) => index) as index}
						<line
							x1={PAD + index * ((SIZE - PAD * 2) / 8)}
							y1={PAD}
							x2={PAD + index * ((SIZE - PAD * 2) / 8)}
							y2={SIZE - PAD}
						/>
						<line
							x1={PAD}
							y1={PAD + index * ((SIZE - PAD * 2) / 8)}
							x2={SIZE - PAD}
							y2={PAD + index * ((SIZE - PAD * 2) / 8)}
						/>
					{/each}
				</g>

				{#if storm}
					<!-- Next safe circle -->
					<circle
						cx={px(storm.nextCx)}
						cy={pz(storm.nextCz)}
						r={Math.max(2, storm.nextRadius * scale)}
						fill="none"
						stroke="#fbbf24"
						stroke-width="1"
						stroke-dasharray="3 3"
						opacity="0.8"
					/>
					<!-- Current safe circle -->
					<circle
						cx={px(storm.cx)}
						cy={pz(storm.cz)}
						r={Math.max(2, storm.radius * scale)}
						fill="#38bdf8"
						fill-opacity="0.08"
						stroke="#38bdf8"
						stroke-width="1.4"
					/>
				{/if}

				{#each ROYALE_POIS as poi (poi.id)}
					<circle cx={px(poi.x)} cy={pz(poi.z)} r="1.6" fill="#94a3b8" />
				{/each}

				{#if self?.alive}
					<g transform={`translate(${px(playerX)} ${pz(playerZ)})`}>
						<circle r="4" fill="#f8fafc" stroke="#0ea5e9" stroke-width="1.6" />
						<circle r="1.4" fill="#0ea5e9" />
					</g>
				{:else}
					<circle cx={px(playerX)} cy={pz(playerZ)} r="2.4" fill="#f43f5e" opacity="0.8" />
				{/if}
			</g>
		</svg>
		<div
			class="mt-0.5 flex items-center justify-between px-1 text-[8px] font-semibold tracking-widest text-slate-400 uppercase"
		>
			<span>Islas Ciudad</span>
			<span class="text-sky-300">{minigame8.aliveCount}/12</span>
		</div>
	</div>
{/if}
