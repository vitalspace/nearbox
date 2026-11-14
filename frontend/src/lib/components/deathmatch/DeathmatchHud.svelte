<script lang="ts">
	import Bomb from '@lucide/svelte/icons/bomb';
	import Heart from '@lucide/svelte/icons/heart';
	import LogOut from '@lucide/svelte/icons/log-out';
	import Shield from '@lucide/svelte/icons/shield';
	import Skull from '@lucide/svelte/icons/skull';
	import Timer from '@lucide/svelte/icons/timer';
	import {
		DM_TEAM_META,
		INVENTORY_SLOT_COUNT,
		WEAPON_BY_ID,
		WEAPON_BY_SLOT
	} from '../../state/dmConfig';
	import { dmInput } from '../../state/dmInput';
	import { lobby } from '../../state/lobby.svelte';
	import { minigame6 } from '../../state/minigame6.svelte';

	let now = $state(minigame6.serverNow());

	$effect(() => {
		const timer = setInterval(() => {
			now = minigame6.serverNow();
		}, 100);

		return () => clearInterval(timer);
	});

	const snapshot = $derived(minigame6.snapshot);
	const self = $derived(minigame6.self);
	const scores = $derived(minigame6.teamScores);
	const team = $derived(minigame6.team);

	const deadline = $derived.by(() => {
		if (!snapshot) return null;
		if (snapshot.phase === 'playing') return snapshot.matchEndsAt;
		if (snapshot.phase === 'countdown') return snapshot.countdownEndsAt;
		if (snapshot.phase === 'results') return snapshot.resultEndsAt;

		return null;
	});

	const remainingMs = $derived(deadline === null ? 0 : Math.max(0, deadline - now));

	const timerLabel = $derived.by(() => {
		const total = Math.ceil(remainingMs / 1000);
		const minutes = Math.floor(total / 60);
		const seconds = total % 60;

		return `${minutes}:${String(seconds).padStart(2, '0')}`;
	});

	const phaseLabel = $derived.by(() => {
		if (!snapshot) return '';
		if (snapshot.phase === 'playing') return 'Match time';
		if (snapshot.phase === 'countdown') return snapshot.waitingForPlayers ? 'Waiting' : 'Starting';
		if (snapshot.phase === 'results') return 'Results';

		return '';
	});

	const healthPercent = $derived.by(() => {
		if (!self) return 0;
		return Math.max(0, Math.min(100, (self.health / self.maxHealth) * 100));
	});

	const healthColor = $derived.by(() => {
		if (healthPercent > 55) return 'bg-emerald-400';
		if (healthPercent > 25) return 'bg-amber-400';
		return 'bg-rose-500';
	});

	const respawnLeft = $derived(Math.max(0, Math.ceil(minigame6.respawnInMs / 1000)));
	const protectedLeft = $derived.by(() => {
		if (!self) return 0;

		return Math.max(0, Math.ceil((self.protectedUntil - now) / 1000));
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
</script>

{#if snapshot && self}
	<div class="pointer-events-none fixed inset-0 z-30 select-none">
		<!-- Top center: timer and team score -->
		<div
			class="absolute top-20 left-1/2 flex -translate-x-1/2 flex-col items-center rounded-xl bg-slate-950/70 px-5 py-2 text-white shadow-lg backdrop-blur-sm sm:top-24"
		>
			<div class="text-[10px] font-semibold tracking-[0.3em] text-fuchsia-300 uppercase">
				Witch House Deathmatch
			</div>
			<div class="flex items-center gap-2">
				<Timer size={16} strokeWidth={2.4} class="text-slate-300" aria-hidden="true" />
				<span class="text-3xl font-black tabular-nums">{timerLabel}</span>
			</div>
			<div class="text-[9px] font-semibold tracking-[0.2em] text-slate-400 uppercase">
				{phaseLabel}
			</div>
			<div class="mt-1 flex items-center gap-2 text-sm font-bold tabular-nums">
				<span class="text-fuchsia-300">{DM_TEAM_META.coven.name}</span>
				<span class="text-slate-200">{scores.coven}</span>
				<span class="text-slate-500">—</span>
				<span class="text-slate-200">{scores.hunters}</span>
				<span class="text-cyan-300">{DM_TEAM_META.hunters.name}</span>
			</div>
		</div>

		<!-- Top right: abandon -->
		<button
			type="button"
			aria-label="Leave the deathmatch"
			title="Leave the deathmatch"
			class="pointer-events-auto absolute top-20 right-3 rounded-xl bg-slate-950/70 p-2.5 text-slate-300 shadow-lg backdrop-blur-sm transition hover:bg-slate-900/80 hover:text-white sm:top-24 sm:right-4"
			onclick={() => lobby.leaveLobby()}
		>
			<LogOut size={18} strokeWidth={2.2} aria-hidden="true" />
		</button>

		<!-- Bottom left: health, protection and respawn -->
		<div
			class="absolute bottom-24 left-3 flex w-48 flex-col gap-1.5 rounded-xl bg-slate-950/70 px-3 py-2.5 text-white shadow-lg backdrop-blur-sm sm:bottom-6 sm:left-4 sm:w-56"
		>
			<div
				class="flex items-center justify-between text-[10px] font-semibold tracking-widest text-slate-300 uppercase"
			>
				<span class="flex items-center gap-1.5">
					<Heart size={12} strokeWidth={2.4} aria-hidden="true" />
					{self.alive ? 'Health' : 'Downed'}
				</span>
				<span class="tabular-nums">{Math.ceil(self.health)}</span>
			</div>
			<div class="h-3 overflow-hidden rounded-full bg-slate-800">
				<div
					class={`h-full rounded-full transition-all ${healthColor}`}
					style:width={`${healthPercent}%`}
				></div>
			</div>

			<div class="flex items-center gap-1.5 text-[10px] font-semibold tracking-wide uppercase">
				{#if self.alive}
					<span class={team === 'coven' ? 'text-fuchsia-300' : 'text-cyan-300'}>
						{team ? DM_TEAM_META[team].name : 'Spectator'}
					</span>
					{#if protectedLeft > 0}
						<span class="ml-auto flex items-center gap-1 text-emerald-300">
							<Shield size={11} strokeWidth={2.4} aria-hidden="true" />
							{protectedLeft}s
						</span>
					{/if}
				{:else}
					<span class="flex items-center gap-1 text-rose-300">
						<Skull size={11} strokeWidth={2.4} aria-hidden="true" />
						Respawning in {respawnLeft}…
					</span>
				{/if}
			</div>
		</div>

		<!-- Bottom center: inventory and grenades -->
		<div
			class="absolute bottom-44 left-1/2 flex -translate-x-1/2 items-stretch gap-1 rounded-xl bg-slate-950/65 p-1 text-white shadow-lg backdrop-blur-sm lg:bottom-6 lg:gap-1.5 lg:p-1.5"
		>
			{#each inventorySlots as item (item.slot)}
				<button
					type="button"
					disabled={!item.entry || !self.alive}
					aria-label={item.entry ? `Equip ${item.name} (${item.slot})` : `Slot ${item.slot} empty`}
					title={item.entry
						? `${item.name} — press ${item.slot} to equip`
						: `Slot ${item.slot} empty`}
					class="pointer-events-auto flex min-w-[3.5rem] flex-col items-start gap-0.5 rounded-lg border px-1.5 py-1 text-left transition sm:min-w-[5.25rem] sm:px-2.5 sm:py-1.5 {item.equipped
						? 'border-fuchsia-300/70 bg-fuchsia-400/20'
						: item.entry
							? 'border-white/10 bg-slate-900/60 hover:bg-slate-800/80'
							: 'border-white/5 bg-slate-900/30 opacity-45'}"
					onclick={() => dmInput.requestEquip(item.slot)}
				>
					<span
						class="flex w-full items-center justify-between gap-1 text-[8px] font-bold tracking-widest uppercase sm:gap-1.5 sm:text-[9px]"
					>
						<span class={item.equipped ? 'text-fuchsia-200' : 'text-slate-400'}>
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

			<button
				type="button"
				disabled={self.grenades <= 0 || !self.alive}
				aria-label="Throw grenade (G)"
				title="Grenades — press G to throw"
				class="pointer-events-auto flex min-w-[3.5rem] flex-col items-start gap-0.5 rounded-lg border px-1.5 py-1 text-left transition sm:min-w-[5.25rem] sm:px-2.5 sm:py-1.5 {self.grenades >
				0
					? 'border-lime-300/40 bg-lime-400/10 hover:bg-lime-400/20'
					: 'border-white/5 bg-slate-900/30 opacity-45'}"
				onclick={() => dmInput.requestGrenade()}
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
