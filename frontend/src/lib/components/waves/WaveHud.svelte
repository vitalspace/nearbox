<script lang="ts">
	import Heart from '@lucide/svelte/icons/heart';
	import Bomb from '@lucide/svelte/icons/bomb';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Shield from '@lucide/svelte/icons/shield';
	import Skull from '@lucide/svelte/icons/skull';
	import Trophy from '@lucide/svelte/icons/trophy';
	import { lobby } from '../../state/lobby.svelte';
	import { minigame5 } from '../../state/minigame5.svelte';
	import { waveInput } from '../../state/waveInput';
	import { INVENTORY_SLOT_COUNT, WEAPON_BY_ID, WEAPON_BY_SLOT } from '../../state/wavesConfig';

	let now = $state(minigame5.serverNow());

	$effect(() => {
		const timer = setInterval(() => {
			now = minigame5.serverNow();
		}, 100);

		return () => clearInterval(timer);
	});

	const self = $derived(minigame5.self);
	const snapshot = $derived(minigame5.snapshot);
	const isDriving = $derived(minigame5.isDriving);
	const car = $derived(snapshot?.car ?? null);

	const healthPercent = $derived.by(() => {
		if (!self) return 0;
		return Math.max(0, Math.min(100, (self.health / self.maxHealth) * 100));
	});

	const carPercent = $derived.by(() => {
		if (!car) return 0;
		return Math.max(0, Math.min(100, (car.health / car.maxHealth) * 100));
	});

	const inventorySlots = $derived.by(() => {
		if (!self) return [];

		return Array.from({ length: INVENTORY_SLOT_COUNT }, (_, index) => {
			const slot = index + 1;
			const entry = self.inventory.find((item) => item.slot === slot) ?? null;
			const definition = entry ? WEAPON_BY_ID.get(entry.weapon) : undefined;

			return {
				slot,
				entry,
				name: definition?.name ?? WEAPON_BY_SLOT[slot] ?? 'Empty',
				equipped: entry !== null && entry.weapon === self.weapon,
				ammo: entry?.magAmmo ?? 0
			};
		});
	});

	const reserveLabel = $derived.by(() => {
		if (!self) return '';
		return self.reserveAmmo === null ? '∞' : String(self.reserveAmmo);
	});

	const healthColor = $derived.by(() => {
		if (healthPercent > 55) return 'bg-emerald-400';
		if (healthPercent > 25) return 'bg-amber-400';
		return 'bg-rose-500';
	});
</script>

{#if snapshot && self}
	<div class="pointer-events-none fixed inset-0 z-30 select-none">
		<!-- Top left: score -->
		<div
			class="absolute top-20 left-3 flex items-center gap-2 rounded-xl bg-slate-950/65 px-3 py-2 text-white shadow-lg backdrop-blur-sm sm:top-24 sm:left-4"
		>
			<Trophy size={16} strokeWidth={2.2} class="text-amber-300" aria-hidden="true" />
			<span class="text-base font-black tabular-nums">{snapshot.teamScore}</span>
			<span
				class="hidden text-[10px] font-semibold tracking-widest text-slate-300 uppercase sm:inline"
			>
				team
			</span>
		</div>

		<!-- Top center: wave and remaining -->
		<div
			class="absolute top-20 left-1/2 flex -translate-x-1/2 flex-col items-center rounded-xl bg-slate-950/65 px-5 py-2 text-white shadow-lg backdrop-blur-sm sm:top-24"
		>
			<div class="text-[10px] font-semibold tracking-[0.3em] text-orange-300 uppercase">
				Barn Siege
			</div>
			<div class="flex items-baseline gap-2">
				<span class="text-2xl font-black tabular-nums">
					{snapshot.wave}<span class="text-sm font-semibold text-slate-400"
						>/{snapshot.totalWaves}</span
					>
				</span>
				<span class="flex items-center gap-1 text-xs font-semibold text-slate-200">
					<Skull size={13} strokeWidth={2.4} aria-hidden="true" />
					{snapshot.monstersRemaining} left
				</span>
			</div>
			{#if snapshot.waveName}
				<div class="hidden text-[10px] text-slate-400 sm:block">{snapshot.waveName}</div>
			{/if}
		</div>

		<!-- Top right: abandon -->
		<button
			type="button"
			aria-label="Leave the siege"
			title="Leave the siege"
			class="pointer-events-auto absolute top-20 right-3 rounded-xl bg-slate-950/65 p-2.5 text-slate-300 shadow-lg backdrop-blur-sm transition hover:bg-slate-900/80 hover:text-white sm:top-24 sm:right-4"
			onclick={() => lobby.leaveLobby()}
		>
			<LogOut size={18} strokeWidth={2.2} aria-hidden="true" />
		</button>

		<!-- Bottom left: health or car -->
		<div
			class="absolute bottom-24 left-3 flex w-48 flex-col gap-1.5 rounded-xl bg-slate-950/65 px-3 py-2.5 text-white shadow-lg backdrop-blur-sm sm:bottom-6 sm:left-4 sm:w-56"
		>
			{#if isDriving && car}
				<div
					class="flex items-center justify-between text-[10px] font-semibold tracking-widest text-slate-300 uppercase"
				>
					<span class="flex items-center gap-1.5">
						<Shield size={12} strokeWidth={2.4} aria-hidden="true" />
						Pumpkin Car
					</span>
					<span class="tabular-nums">{Math.ceil(car.health)}</span>
				</div>
				<div class="h-3 overflow-hidden rounded-full bg-slate-800">
					<div
						class="h-full rounded-full bg-orange-400 transition-all"
						style:width={`${carPercent}%`}
					></div>
				</div>
			{:else}
				<div
					class="flex items-center justify-between text-[10px] font-semibold tracking-widest text-slate-300 uppercase"
				>
					<span class="flex items-center gap-1.5">
						<Heart size={12} strokeWidth={2.4} aria-hidden="true" />
						{self.downed ? 'Downed' : 'Health'}
					</span>
					<span class="tabular-nums">{Math.ceil(self.health)}</span>
				</div>
				<div class="h-3 overflow-hidden rounded-full bg-slate-800">
					<div
						class={`h-full rounded-full transition-all ${healthColor}`}
						style:width={`${healthPercent}%`}
					></div>
				</div>
			{/if}
		</div>

		<!-- Bottom center: armas (1–4) + granadas (G), estilo PUBG -->
		<div
			class="absolute bottom-44 left-1/2 flex -translate-x-1/2 items-stretch gap-1 rounded-xl bg-slate-950/65 p-1 text-white shadow-lg backdrop-blur-sm lg:bottom-6 lg:gap-1.5 lg:p-1.5"
		>
			{#each inventorySlots as item (item.slot)}
				<button
					type="button"
					disabled={!item.entry}
					aria-label={item.entry ? `Equip ${item.name} (${item.slot})` : `Slot ${item.slot} empty`}
					title={item.entry
						? `${item.name} — press ${item.slot} to equip`
						: `Slot ${item.slot} empty`}
					class="pointer-events-auto flex min-w-[3.5rem] flex-col items-start gap-0.5 rounded-lg border px-1.5 py-1 text-left transition sm:min-w-[5.25rem] sm:px-2.5 sm:py-1.5 {item.equipped
						? 'border-orange-300/70 bg-orange-400/20'
						: item.entry
							? 'border-white/10 bg-slate-900/60 hover:bg-slate-800/80'
							: 'border-white/5 bg-slate-900/30 opacity-45'}"
					onclick={() => waveInput.requestEquip(item.slot)}
				>
					<span
						class="flex w-full items-center justify-between gap-1 text-[8px] font-bold tracking-widest uppercase sm:gap-1.5 sm:text-[9px]"
					>
						<span class={item.equipped ? 'text-orange-200' : 'text-slate-400'}>
							[{item.slot}]
						</span>
						{#if item.entry}
							<span class="truncate text-slate-200">{item.name}</span>
						{:else}
							<span class="text-slate-500">Empty</span>
						{/if}
					</span>
					{#if item.entry}
						<span
							class="text-base font-black tabular-nums sm:text-lg {item.ammo === 0
								? 'text-rose-400'
								: item.equipped
									? 'text-white'
									: 'text-slate-300'}"
						>
							{item.ammo}<span class="text-[10px] font-semibold text-slate-400">
								/ {item.entry.weapon === 'pistol' ? '∞' : reserveLabel}</span
							>
						</span>
					{:else}
						<span class="text-base font-black text-slate-600 sm:text-lg">—</span>
					{/if}
				</button>
			{/each}

			<!-- Grenade: same bar, G key -->
			<button
				type="button"
				disabled={self.grenades <= 0}
				aria-label="Throw grenade (G)"
				title="Grenades — press G to throw"
				class="pointer-events-auto flex min-w-[3.5rem] flex-col items-start gap-0.5 rounded-lg border px-1.5 py-1 text-left transition sm:min-w-[5.25rem] sm:px-2.5 sm:py-1.5 {self.grenades >
				0
					? 'border-lime-300/40 bg-lime-400/10 hover:bg-lime-400/20'
					: 'border-white/5 bg-slate-900/30 opacity-45'}"
				onclick={() => waveInput.requestGrenade()}
			>
				<span
					class="flex w-full items-center justify-between gap-1 text-[8px] font-bold tracking-widest uppercase sm:gap-1.5 sm:text-[9px]"
				>
					<span class="text-lime-200">[G]</span>
					<span class="truncate text-slate-200">Grenades</span>
				</span>
				<span
					class="flex items-center gap-1 text-base font-black text-lime-300 tabular-nums sm:text-lg"
				>
					<Bomb size={13} strokeWidth={2.4} aria-hidden="true" />
					{self.grenades}
				</span>
			</button>
		</div>
	</div>
{/if}
