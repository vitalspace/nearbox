<script lang="ts">
	import Bomb from '@lucide/svelte/icons/bomb';
	import Heart from '@lucide/svelte/icons/heart';
	import LogOut from '@lucide/svelte/icons/log-out';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Shield from '@lucide/svelte/icons/shield';
	import Timer from '@lucide/svelte/icons/timer';
	import Users from '@lucide/svelte/icons/users';
	import Wind from '@lucide/svelte/icons/wind';
	import { lobby } from '../../state/lobby.svelte';
	import { minigame8 } from '../../state/minigame8.svelte';
	import {
		ROYALE_GLIDE_FALL,
		ROYALE_JUMP_WINDOW_MS,
		ROYALE_MAX_AMMO,
		ROYALE_WEAPON_BY_ID,
		ROYALE_WEAPON_BY_SLOT
	} from '../../state/royaleConfig';
	import { royaleInput } from '../../state/royaleInput';
	import { royaleVehicles } from '../../state/royaleVehicles.svelte';

	let now = $state(minigame8.serverNow());

	$effect(() => {
		const timer = setInterval(() => {
			now = minigame8.serverNow();
		}, 100);

		return () => clearInterval(timer);
	});

	const snapshot = $derived(minigame8.snapshot);
	const self = $derived(minigame8.self);
	const storm = $derived(minigame8.storm);
	const alive = $derived(minigame8.aliveCount);

	const healthPercent = $derived.by(() => {
		if (!self) return 0;
		return Math.max(0, Math.min(100, self.health));
	});

	const shieldPercent = $derived.by(() => {
		if (!self) return 0;
		return Math.max(0, Math.min(100, self.shield));
	});

	const healthColor = $derived.by(() => {
		if (healthPercent > 55) return 'bg-emerald-400';
		if (healthPercent > 25) return 'bg-amber-400';
		return 'bg-rose-500';
	});

	const stormLeft = $derived(Math.max(0, (storm?.endsAt ?? now) - now));
	const stormLabel = $derived.by(() => {
		if (!storm) return '';
		if (storm.state === 'shrink') return 'Storm closing';
		return 'Storm moves in';
	});
	const stormTimer = $derived.by(() => {
		const total = Math.ceil(stormLeft / 1000);
		return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
	});

	const matchLeft = $derived.by(() => {
		if (!snapshot?.matchEndsAt) return '';
		const total = Math.max(0, Math.ceil((snapshot.matchEndsAt - now) / 1000));
		return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
	});

	const ejectLeft = $derived.by(() => {
		if (!minigame8.riding) return 0;
		return Math.max(0, Math.ceil((ROYALE_JUMP_WINDOW_MS - minigame8.jumpElapsedMs) / 1000));
	});

	const slots = $derived.by(() => {
		if (!self) return [];

		return [1, 2, 3, 4].map((slot) => {
			const weapon = ROYALE_WEAPON_BY_SLOT[slot];
			const entry = self.inventory.find((item) => item.weapon === weapon) ?? null;
			const definition = ROYALE_WEAPON_BY_ID.get(weapon);

			return {
				slot,
				weapon,
				name: definition?.name ?? weapon,
				entry,
				equipped: self.weapon === weapon,
				ammo: entry?.magAmmo ?? 0
			};
		});
	});

	const reserveLabel = $derived(self ? `${self.reserveAmmo} / ${ROYALE_MAX_AMMO}` : '');

	const canReload = $derived.by(() => {
		if (!self || !self.alive) return false;
		const definition = ROYALE_WEAPON_BY_ID.get(self.weapon);
		if (!definition) return false;
		return self.reserveAmmo > 0 && self.magAmmo < definition.magSize;
	});

	/** El agua no mata: el servidor devuelve al jugador a la orilla. */
	const waterNotice = $derived(
		minigame8.lastWaterRescueAt > 0 && now - minigame8.lastWaterRescueAt < 2600
	);

	const modeLabel = $derived.by(() => {
		const driving = minigame8.vehicle;
		if (driving) return `DRIVING ${driving.name.toUpperCase()}`;
		if (minigame8.riding) return 'ON THE ZEPPELIN';
		if (royaleInput.mode === 'skydive') return 'FREEFALL';
		if (royaleInput.mode === 'glide') return 'GLIDER OPEN';
		return 'LOOT & FIGHT';
	});

	const vehicle = $derived(minigame8.vehicle);
	const vehicleHealthPercent = $derived.by(() => {
		if (!vehicle || vehicle.maxHealth <= 0) return 0;
		return Math.max(0, Math.min(100, (vehicle.health / vehicle.maxHealth) * 100));
	});
</script>

{#if snapshot && self}
	<div class="pointer-events-none fixed inset-0 z-30 select-none">
		<!-- Top center: alive, humans/bots and storm -->
		<div
			class="absolute top-20 left-1/2 flex -translate-x-1/2 flex-col items-center rounded-xl bg-slate-950/70 px-5 py-2 text-white shadow-lg backdrop-blur-sm sm:top-24"
		>
			<div class="text-[10px] font-semibold tracking-[0.3em] text-sky-300 uppercase">
				Skyfall Royale
			</div>
			<div class="flex items-center gap-3">
				<span class="flex items-baseline gap-1">
					<span class="text-3xl font-black tabular-nums">{alive}</span>
					<span class="text-sm font-bold text-slate-400">/ 12 alive</span>
				</span>
				<span class="text-slate-600">·</span>
				<span class="text-xs font-semibold text-slate-300 tabular-nums">
					{snapshot.humans} humans / {snapshot.bots} bots
				</span>
			</div>
			<div class="mt-0.5 flex items-center gap-2 text-[10px] font-semibold text-slate-300">
				<Timer size={12} strokeWidth={2.4} aria-hidden="true" />
				<span class="tabular-nums">{matchLeft}</span>
				<span class="text-slate-500">·</span>
				<span class="flex items-center gap-1 text-sky-300">
					<Wind size={12} strokeWidth={2.4} aria-hidden="true" />
					{stormLabel}
					{stormTimer}
				</span>
				<span class="rounded bg-white/10 px-1.5 py-0.5 text-[9px] tracking-wide text-slate-300">
					PHASE {Math.min(8, (storm?.phase ?? 0) + 1)} · {storm?.dps ?? 0} DPS
				</span>
			</div>
		</div>

		<!-- Top right: leave -->
		<button
			type="button"
			aria-label="Leave Skyfall Royale"
			title="Leave Skyfall Royale"
			class="pointer-events-auto absolute top-20 right-3 rounded-xl bg-slate-950/70 p-2.5 text-slate-300 shadow-lg backdrop-blur-sm transition hover:bg-slate-900/80 hover:text-white sm:top-24 sm:right-4"
			onclick={() => lobby.leaveLobby()}
		>
			<LogOut size={18} strokeWidth={2.2} aria-hidden="true" />
		</button>

		<!-- Rescate en el agua: se avisa para que no parezca que el jugador se teletransportó -->
		{#if waterNotice}
			<div
				class="pointer-events-none absolute top-40 left-1/2 -translate-x-1/2 rounded-lg border border-sky-300/60 bg-sky-500/25 px-4 py-2 text-center text-[11px] font-bold tracking-wide text-sky-50 uppercase shadow-lg backdrop-blur-sm sm:top-44"
			>
				Rescued from the water · back on shore
			</div>
		{/if}

		<!-- Bottom left: HP, shield and mode -->
		<div
			class="absolute bottom-24 left-3 flex w-48 flex-col gap-1.5 rounded-xl bg-slate-950/70 px-3 py-2.5 text-white shadow-lg backdrop-blur-sm sm:bottom-6 sm:left-4 sm:w-56"
		>
			<div
				class="flex items-center justify-between text-[10px] font-semibold tracking-widest text-slate-300 uppercase"
			>
				<span class="flex items-center gap-1.5">
					<Heart size={12} strokeWidth={2.4} aria-hidden="true" />
					Health
				</span>
				<span class="tabular-nums">{Math.ceil(self.health)}</span>
			</div>
			<div class="h-3 overflow-hidden rounded-full bg-slate-800">
				<div
					class={`h-full rounded-full transition-all ${healthColor}`}
					style:width={`${healthPercent}%`}
				></div>
			</div>

			<div
				class="flex items-center justify-between text-[10px] font-semibold tracking-widest text-slate-300 uppercase"
			>
				<span class="flex items-center gap-1.5">
					<Shield size={12} strokeWidth={2.4} aria-hidden="true" />
					Shield
				</span>
				<span class="tabular-nums">{Math.ceil(self.shield)}</span>
			</div>
			<div class="h-2 overflow-hidden rounded-full bg-slate-800">
				<div
					class="h-full rounded-full bg-sky-400 transition-all"
					style:width={`${shieldPercent}%`}
				></div>
			</div>

			<div
				class="flex items-center justify-between pt-0.5 text-[9px] font-bold tracking-widest uppercase"
			>
				<span class="text-sky-300">{modeLabel}</span>
				<span class="text-slate-400">{self.kills} KILLS · {self.damage} DMG</span>
			</div>

			{#if vehicle}
				<div class="rounded-lg bg-cyan-400/10 px-2 py-1 text-[10px] text-cyan-100">
					<div class="flex items-center justify-between">
						<span class="truncate pr-2 font-bold">{vehicle.name}</span>
						<span class="tabular-nums">{Math.ceil(vehicle.health)} / {vehicle.maxHealth}</span>
					</div>
					<div class="mt-1 h-2 overflow-hidden rounded-full bg-slate-800">
						<div
							class={`h-full rounded-full transition-all ${
								vehicleHealthPercent > 50
									? 'bg-emerald-400'
									: vehicleHealthPercent > 25
										? 'bg-amber-400'
										: 'bg-rose-500'
							}`}
							style:width={`${vehicleHealthPercent}%`}
						></div>
					</div>
					<div class="mt-1 text-[9px] font-semibold tracking-wide text-cyan-300 uppercase">
						{vehicle.kind === 'balloon'
							? 'WASD FLY · SPACE UP · SHIFT DOWN · R RELOAD · E EXIT'
							: 'WASD DRIVE · SPACE HANDBRAKE · R FLIP · E EXIT'}
					</div>
				</div>
			{:else if minigame8.riding}
				<div class="rounded-lg bg-sky-400/10 px-2 py-1 text-[10px] text-sky-100">
					<div class="flex items-center justify-between">
						<span class="font-bold">{Math.round(self.y)} m altitude</span>
						<span class="tabular-nums">Eject in {ejectLeft}s</span>
					</div>
					<div class="mt-0.5 text-[9px] font-semibold tracking-wide text-sky-300 uppercase">
						{minigame8.canJump ? 'SPACE / E TO JUMP' : 'Jump window closed'}
					</div>
				</div>
			{:else if royaleInput.mode === 'skydive'}
				<div class="rounded-lg bg-amber-400/10 px-2 py-1 text-[10px] text-amber-100">
					<div class="flex items-center justify-between">
						<span class="font-bold">{Math.max(0, Math.round(self.y))} m altitude</span>
						<span class="text-[9px] text-amber-300 uppercase">Glider at 55 m</span>
					</div>
				</div>
			{:else if royaleInput.mode === 'glide'}
				<div class="rounded-lg bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-200">
					<div class="flex items-center justify-between">
						<span class="font-bold">GLIDER OPEN</span>
						<span class="text-[9px] text-emerald-300 uppercase">
							{Math.max(0, Math.round(self.y))} m · {ROYALE_GLIDE_FALL} m/s
						</span>
					</div>
				</div>
			{/if}
		</div>

		<!-- Bottom center: vehicle prompt -->
		{#if royaleVehicles.prompt}
			<div
				class="pointer-events-none absolute bottom-60 left-1/2 -translate-x-1/2 rounded-lg border border-cyan-300/50 bg-slate-950/80 px-3 py-1.5 text-center text-[11px] font-bold tracking-wide text-cyan-100 shadow-lg backdrop-blur-sm lg:bottom-20"
			>
				{royaleVehicles.prompt}
			</div>
		{/if}

		<!-- Bottom center: inventory and grenades -->
		<div
			class="absolute bottom-44 left-1/2 flex -translate-x-1/2 items-stretch gap-1 rounded-xl bg-slate-950/65 p-1 text-white shadow-lg backdrop-blur-sm lg:bottom-6 lg:gap-1.5 lg:p-1.5"
		>
			{#each slots as item (item.slot)}
				<button
					type="button"
					disabled={!item.entry || !self.alive}
					aria-label={item.entry ? `Equip ${item.name} (${item.slot})` : `Slot ${item.slot} empty`}
					title={item.entry
						? `${item.name} — press ${item.slot} to equip`
						: `Slot ${item.slot} empty`}
					class="pointer-events-auto flex min-w-[3.5rem] flex-col items-start gap-0.5 rounded-lg border px-1.5 py-1 text-left transition sm:min-w-[5.25rem] sm:px-2.5 sm:py-1.5 {item.equipped
						? 'border-sky-300/70 bg-sky-400/20'
						: item.entry
							? 'border-white/10 bg-slate-900/60 hover:bg-slate-800/80'
							: 'border-white/5 bg-slate-900/30 opacity-45'}"
					onclick={() => royaleInput.requestEquip(item.slot)}
				>
					<span
						class="flex w-full items-center justify-between gap-1 text-[8px] font-bold tracking-widest uppercase sm:gap-1.5 sm:text-[9px]"
					>
						<span class={item.equipped ? 'text-sky-200' : 'text-slate-400'}>[{item.slot}]</span>
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
								/ {reserveLabel}</span
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
				onclick={() => royaleInput.requestGrenade()}
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

			<!-- Recarga siempre a mano: en el globo o el coche se puede seguir
			disparando, así que también se puede recargar. -->
			<button
				type="button"
				disabled={!canReload}
				aria-label="Reload weapon (R)"
				title="Reload — press R"
				class="pointer-events-auto hidden min-w-[3.5rem] flex-col items-start gap-0.5 rounded-lg border px-1.5 py-1 text-left transition sm:flex sm:min-w-[5.25rem] sm:px-2.5 sm:py-1.5 {canReload
					? 'border-sky-300/40 bg-sky-400/10 hover:bg-sky-400/20'
					: 'border-white/5 bg-slate-900/30 opacity-45'}"
				onclick={() => royaleInput.requestReload()}
			>
				<span
					class="flex w-full items-center justify-between gap-1 text-[8px] font-bold tracking-widest uppercase sm:gap-1.5 sm:text-[9px]"
				>
					<span class="text-sky-200">[R]</span>
					<span class="truncate text-slate-200">Reload</span>
				</span>
				<span class="flex items-center gap-1 text-base font-black text-sky-300 tabular-nums sm:text-lg">
					<RotateCcw size={13} strokeWidth={2.4} aria-hidden="true" />
					{self.magAmmo}
				</span>
			</button>
		</div>

		<!-- Bottom right: participants -->
		<div
			class="absolute right-3 bottom-24 flex items-center gap-1.5 rounded-lg bg-slate-950/60 px-2.5 py-1.5 text-[10px] font-semibold text-slate-200 shadow-lg backdrop-blur-sm sm:right-4 sm:bottom-6"
		>
			<Users size={13} strokeWidth={2.4} class="text-sky-300" aria-hidden="true" />
			{alive}/12 · {snapshot.humans}H / {snapshot.bots}B
		</div>
	</div>
{/if}
