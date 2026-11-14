<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import Lock from '@lucide/svelte/icons/lock';
	import ShoppingBag from '@lucide/svelte/icons/shopping-bag';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import X from '@lucide/svelte/icons/x';
	import { tick, untrack } from 'svelte';
	import { DEFAULT_SKIN, SKINS, type SkinDefinition, type SkinId } from '../../cosmetics/skins';
	import { SKIN_ICONS, SKIN_TONES } from '../../cosmetics/skinUi';
	import { cosmetics } from '../../state/cosmetics.svelte';
	import { hubKiosks } from '../../state/hubKiosks.svelte';
	import { nftMarket } from '../../state/nftMarket.svelte';
	import EquipNftButton from '../market/EquipNftButton.svelte';
	import MarketView from '../market/MarketView.svelte';
	import MintItemButton from '../market/MintItemButton.svelte';
	import { mintableCatalogItemById } from '../../nft/catalog.ts';
	import { nftOwnership } from '../../state/nftOwnership.svelte.ts';
	import ShopItemCard from './ShopItemCard.svelte';
	import ShopPreview from './ShopPreview.svelte';
	import ShopTabBar from './ShopTabBar.svelte';
	import {
		MARKET_TAB,
		SHOP_ASSETS,
		SHOP_TABS,
		SHOP_VEHICLES,
		SHOP_WEAPONS,
		type ShopAssetItem,
		type ShopPanelTabId,
		type ShopPreviewRef,
		type ShopTabId
	} from './shopCatalog';
	import type { ShopStatus } from './shopUi';

	const FREE_CLASS = 'border-cyan-300/30 bg-cyan-400/10 text-cyan-200';
	const HOT_CLASS = 'border-rose-300/40 bg-rose-500/20 text-rose-200';

	const PANEL_TABS = [...SHOP_TABS, MARKET_TAB] as const;
	const open = $derived(hubKiosks.panelId === 'shop');

	let activeTab = $state<ShopPanelTabId>('skins');
	let selectedIds = $state<Record<ShopTabId, string>>({
		skins: DEFAULT_SKIN,
		weapons: SHOP_WEAPONS[0].id,
		assets: SHOP_ASSETS[0].id,
		vehicles: SHOP_VEHICLES[0].id
	});
	let closeButton = $state<HTMLButtonElement>();
	let wasOpen = false;

	const activeTabDefinition = $derived(
		PANEL_TABS.find((tab) => tab.id === activeTab) ?? PANEL_TABS[0]
	);
	const selectedSkin = $derived(SKINS.find((skin) => skin.id === selectedIds.skins) ?? SKINS[0]);
	const selectedWeapon = $derived(
		SHOP_WEAPONS.find((item) => item.id === selectedIds.weapons) ?? SHOP_WEAPONS[0]
	);
	const selectedAsset = $derived(
		SHOP_ASSETS.find((item) => item.id === selectedIds.assets) ?? SHOP_ASSETS[0]
	);
	const selectedVehicle = $derived(
		SHOP_VEHICLES.find((item) => item.id === selectedIds.vehicles) ?? SHOP_VEHICLES[0]
	);
	const selectedSkinCatalog = $derived(mintableCatalogItemById(selectedSkin.id));
	const selectedWeaponCatalog = $derived(mintableCatalogItemById(selectedWeapon.id));
	const selectedAssetCatalog = $derived(mintableCatalogItemById(selectedAsset.id));
	const selectedVehicleCatalog = $derived(mintableCatalogItemById(selectedVehicle.id));

	// En la tienda nada es gratis: una skin solo se puede equipar si su NFT
	// está en el inventario. Las misiones ya no habilitan el equipado aquí.
	const selectedNftOwned = $derived(nftOwnership.owns(selectedSkin.id));
	const selectedUnlocked = $derived(selectedNftOwned);
	const selectedEquipped = $derived(cosmetics.equippedSkin === selectedSkin.id && selectedNftOwned);
	const availableCount = $derived(SKINS.filter((skin) => nftOwnership.owns(skin.id)).length);
	const selectedAssetStatus = $derived(assetStatus(selectedAsset));
	const selectedVehicleStatus = { label: 'Hot ride', className: HOT_CLASS };

	const skinPreview = $derived.by((): ShopPreviewRef => ({ kind: 'skin', skin: selectedSkin.id }));
	const weaponPreview = $derived.by((): ShopPreviewRef => {
		if (selectedWeapon.model) {
			return { kind: 'model', url: selectedWeapon.model, accent: selectedWeapon.accent };
		}

		return { kind: 'poster', icon: selectedWeapon.icon, accent: selectedWeapon.accent };
	});
	const assetPreview = $derived.by((): ShopPreviewRef => {
		if (selectedAsset.model) {
			return { kind: 'model', url: selectedAsset.model, accent: selectedAsset.accent };
		}

		return { kind: 'poster', icon: selectedAsset.icon, accent: selectedAsset.accent };
	});
	const vehiclePreview = $derived.by((): ShopPreviewRef => {
		if (selectedVehicle.model) {
			return { kind: 'model', url: selectedVehicle.model, accent: selectedVehicle.accent };
		}

		return { kind: 'poster', icon: selectedVehicle.icon, accent: selectedVehicle.accent };
	});

	const statusLabel = $derived(
		selectedEquipped ? 'Equipped' : selectedUnlocked ? 'Available' : 'NFT required'
	);
	const statusClass = $derived(
		selectedEquipped
			? 'border-amber-300/40 bg-amber-400/15 text-amber-200'
			: selectedUnlocked
				? 'border-emerald-300/30 bg-emerald-400/15 text-emerald-200'
				: 'border-white/10 bg-slate-900/70 text-slate-400'
	);

	const subtitle = $derived.by(() => {
		switch (activeTab) {
			case 'skins':
				return `${availableCount} / ${SKINS.length} skins owned · mint the NFT to equip`;
			case 'weapons':
				return `${SHOP_WEAPONS.length} gold weapons · HOT this week`;
			case 'assets':
				return `${SHOP_ASSETS.length} hot assets · crown and coin pistol`;
			case 'vehicles':
				return `${SHOP_VEHICLES.length} hot rides · skateboard and magic broom`;
			case 'market':
				return 'NEP-245 collectibles · mint, buy and sell on testnet';
		}
	});

	function assetStatus(item: ShopAssetItem): ShopStatus {
		return item.hot
			? { label: 'Hot item', className: HOT_CLASS, done: false }
			: { label: 'Always available', className: FREE_CLASS, done: false };
	}

	function unlockLabel(skin: SkinDefinition): string {
		return `Mint the ${skin.name} NFT to equip this skin.`;
	}

	function close(): void {
		nftMarket.setActive(false);
		hubKiosks.close();
	}

	function equipSelected(): void {
		if (!selectedUnlocked || selectedEquipped) {
			return;
		}

		cosmetics.equip(selectedSkin.id);
	}

	function selectTab(id: ShopPanelTabId): void {
		activeTab = id;
	}

	function selectSkin(id: SkinId): void {
		selectedIds.skins = id;
	}

	function selectWeapon(id: string): void {
		selectedIds.weapons = id;
	}

	function selectAsset(id: string): void {
		selectedIds.assets = id;
	}

	function selectVehicle(id: string): void {
		selectedIds.vehicles = id;
	}

	function openGuide(): void {
		hubKiosks.open('tourism');
	}

	$effect(() => {
		if (open === wasOpen) {
			return;
		}

		wasOpen = open;

		if (!open) {
			nftMarket.setActive(false);
			return;
		}

		activeTab = 'skins';
		nftMarket.setActive(true);
		selectedIds = {
			skins: untrack(() => cosmetics.equippedSkin),
			weapons: SHOP_WEAPONS[0].id,
			assets: SHOP_ASSETS[0].id,
			vehicles: SHOP_VEHICLES[0].id
		};
		void tick().then(() => closeButton?.focus());
	});

	$effect(() => {
		if (!open) {
			return;
		}

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.code !== 'Escape') {
				return;
			}

			event.preventDefault();
			close();
		};

		window.addEventListener('keydown', onKeyDown);

		return () => window.removeEventListener('keydown', onKeyDown);
	});
</script>

{#if open}
	<div
		id="shop-panel"
		role="dialog"
		aria-modal="true"
		aria-labelledby="shop-title"
		class="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4"
	>
		<button
			type="button"
			class="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
			aria-label="Close Halloween Shop"
			onclick={close}
		></button>

		<section
			class="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-orange-400/30 bg-[#120b08]/95 text-slate-100 shadow-[0_0_60px_rgba(251,146,60,0.22)]"
		>
			<header
				class="flex items-start justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-orange-500/15 via-transparent to-amber-400/5 px-4 py-3 sm:px-5"
			>
				<div class="flex min-w-0 items-center gap-3">
					<span
						class="flex size-10 shrink-0 items-center justify-center rounded-full border border-orange-400/50 bg-orange-500/10 text-orange-300"
						aria-hidden="true"
					>
						<ShoppingBag class="size-5" />
					</span>
					<div class="min-w-0">
						<p class="text-[10px] font-semibold tracking-[0.3em] text-orange-300/80 uppercase">
							Halloween Shop
						</p>
						<h2 id="shop-title" class="truncate text-lg font-bold text-orange-50">
							The village collection
						</h2>
						<p class="text-[11px] text-slate-400">
							{subtitle}
						</p>
					</div>
				</div>

				<button
					bind:this={closeButton}
					type="button"
					class="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 p-2.5 text-slate-300 transition hover:bg-white/15 hover:text-white focus:ring-2 focus:ring-orange-400/60 focus:outline-none"
					onclick={close}
					aria-label="Close Halloween Shop"
				>
					<X class="size-5" />
				</button>
			</header>

			<ShopTabBar tabs={PANEL_TABS} active={activeTab} onSelect={selectTab} />

			<div class="min-h-0 flex-1 overflow-y-auto md:overflow-hidden">
				<div
					role="tabpanel"
					id="shop-panel-skins"
					aria-labelledby="shop-tab-skins"
					hidden={activeTab !== 'skins'}
				>
					<div class="grid md:h-full md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
						<div class="flex min-h-0 flex-col border-b border-white/10 md:border-r md:border-b-0">
							<div
								class="relative h-64 shrink-0 bg-gradient-to-b from-orange-500/10 to-transparent sm:h-72 md:h-auto md:min-h-[420px] md:flex-1"
							>
								{#if activeTab === 'skins'}
									<ShopPreview preview={skinPreview} />
								{/if}

								<div
									class="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3"
								>
									<span
										class="rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase backdrop-blur-sm {statusClass}"
									>
										{statusLabel}
									</span>
									<span
										class="rounded-full border border-white/10 bg-slate-950/70 px-2.5 py-1 text-[10px] font-medium text-slate-300 backdrop-blur-sm"
									>
										{SKINS.findIndex((skin) => skin.id === selectedSkin.id) + 1} / {SKINS.length}
									</span>
								</div>

								<div
									class="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#120b08] via-[#120b08]/85 to-transparent px-4 pt-10 pb-3"
								>
									<p
										class="text-[10px] font-semibold tracking-[0.25em] text-orange-300/80 uppercase"
									>
										{selectedUnlocked ? 'Selected skin' : 'NFT skin'}
									</p>
									<p class="truncate text-lg font-bold text-slate-50">{selectedSkin.name}</p>
									<p class="line-clamp-2 text-[11px] leading-snug text-slate-400">
										{selectedSkin.description}
									</p>
								</div>
							</div>

							<div class="space-y-2.5 p-4">
								<p class="text-[11px] leading-snug text-slate-400">
									{selectedEquipped
										? 'You own this skin NFT and it is equipped. Swap looks whenever you want.'
										: selectedUnlocked
											? 'You own this skin NFT. Equip it and swap looks whenever you want.'
											: 'Nothing in this shop is free: mint or buy the skin NFT to equip it.'}
								</p>

								<button
									type="button"
									disabled={!selectedUnlocked || selectedEquipped}
									onclick={equipSelected}
									class="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-xs font-semibold tracking-wide uppercase transition {selectedEquipped
										? 'cursor-default border-amber-400/30 bg-amber-400/10 text-amber-200'
										: selectedUnlocked
											? 'border-orange-400/40 bg-orange-500/25 text-orange-50 hover:bg-orange-500/35 active:scale-[0.99]'
											: 'cursor-not-allowed border-white/5 bg-slate-800/40 text-slate-500'}"
								>
									{#if selectedEquipped}
										<Check size={14} strokeWidth={2.5} aria-hidden="true" />
										Equipped
									{:else if selectedUnlocked}
										<Sparkles size={14} strokeWidth={2.5} aria-hidden="true" />
										Equip {selectedSkin.name}
									{:else}
										<Lock size={13} strokeWidth={2.5} aria-hidden="true" />
										Mint required
									{/if}
								</button>

								<button
									type="button"
									onclick={openGuide}
									class="min-h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-[11px] font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
								>
									How do I get it? See the village guide →
								</button>
							</div>
						</div>

						<div class="p-4">
							<div class="mb-2 flex items-baseline justify-between gap-2">
								<h3
									class="text-[10px] font-semibold tracking-[0.3em] uppercase"
									style:color={activeTabDefinition.accent}
								>
									{activeTabDefinition.kicker}
								</h3>
								<p class="text-[10px] text-slate-500">Tap a skin to preview it</p>
							</div>

							<ul class="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-3">
								{#each SKINS as skin (skin.id)}
									{@const unlocked = nftOwnership.owns(skin.id)}
									{@const equipped = unlocked && cosmetics.equippedSkin === skin.id}
									{@const isSelected = selectedSkin.id === skin.id}
									{@const Icon = SKIN_ICONS[skin.id]}
									<li>
										<button
											type="button"
											onclick={() => selectSkin(skin.id)}
											aria-pressed={isSelected}
											title={unlocked ? skin.name : `${skin.name} — ${unlockLabel(skin)}`}
											class="group relative flex min-h-11 w-full flex-col items-center gap-1 rounded-lg border px-1.5 py-2 transition {isSelected
												? 'border-orange-400/70 bg-orange-400/10 shadow-[0_0_18px_-6px_rgba(251,146,60,0.75)]'
												: 'border-white/10 bg-slate-900/50 hover:border-orange-400/30 hover:bg-orange-500/5'}"
										>
											<span
												class="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br {SKIN_TONES[
													skin.id
												]}"
												aria-hidden="true"
											>
												<Icon size={16} strokeWidth={2} />
											</span>
											<span
												class="w-full truncate text-center text-[10px] font-medium {isSelected
													? 'text-orange-200'
													: unlocked
														? 'text-slate-300'
														: 'text-slate-500'}"
											>
												{skin.name}
											</span>

											{#if !unlocked}
												<span
													class="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-slate-950/90 text-slate-400"
													aria-hidden="true"
												>
													<Lock size={9} strokeWidth={3} />
												</span>
											{:else if equipped}
												<span
													class="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-amber-950"
													aria-hidden="true"
												>
													<Check size={10} strokeWidth={3} />
												</span>
											{/if}
										</button>
									</li>
								{/each}
							</ul>

							<p class="mt-3 text-[10px] leading-snug text-slate-500">
								Only minted skins can be equipped. Completing a mission no longer unlocks a skin:
								mint or buy its NFT here or in the Market tab.
							</p>

							{#if selectedSkinCatalog}
								<div class="mt-3">
									<MintItemButton item={selectedSkinCatalog} />
								</div>
							{/if}
						</div>
					</div>
				</div>

				<div
					role="tabpanel"
					id="shop-panel-weapons"
					aria-labelledby="shop-tab-weapons"
					hidden={activeTab !== 'weapons'}
				>
					<div class="grid md:h-full md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
						<div class="flex min-h-0 flex-col border-b border-white/10 md:border-r md:border-b-0">
							<div
								class="relative h-64 shrink-0 bg-gradient-to-b from-amber-500/10 to-transparent sm:h-72 md:h-auto md:min-h-[400px] md:flex-1"
							>
								{#if activeTab === 'weapons'}
									<ShopPreview preview={weaponPreview} />
								{/if}

								<div
									class="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3"
								>
									<span class="flex items-center gap-1.5">
										<span
											class="rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase backdrop-blur-sm"
											style:border-color={`${selectedWeapon.accent}66`}
											style:background-color={`${selectedWeapon.accent}1a`}
											style:color={selectedWeapon.accent}
										>
											{selectedWeapon.badge}
										</span>
										<span
											class="rounded-full border border-rose-300/40 bg-rose-500/90 px-2.5 py-1 text-[10px] font-bold tracking-wider text-white uppercase backdrop-blur-sm"
										>
											HOT
										</span>
									</span>
									<span
										class="rounded-full border border-white/10 bg-slate-950/70 px-2.5 py-1 text-[10px] font-medium text-slate-300 backdrop-blur-sm"
									>
										{SHOP_WEAPONS.findIndex((item) => item.id === selectedWeapon.id) + 1} / {SHOP_WEAPONS.length}
									</span>
								</div>

								<div
									class="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#120b08] via-[#120b08]/85 to-transparent px-4 pt-10 pb-3"
								>
									<p
										class="text-[10px] font-semibold tracking-[0.25em] uppercase"
										style:color={selectedWeapon.accent}
									>
										{activeTabDefinition.kicker}
									</p>
									<p class="truncate text-lg font-bold text-slate-50">{selectedWeapon.name}</p>
									<p class="line-clamp-2 text-[11px] leading-snug text-slate-400">
										{selectedWeapon.description}
									</p>
								</div>
							</div>

							<div class="space-y-2.5 p-4">
								<div class="flex items-center justify-between gap-2">
									<span
										class="rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase {HOT_CLASS}"
									>
										Hot drop
									</span>
									<span class="text-[10px] text-slate-500">Gold variant</span>
								</div>

								<p class="text-[10px] font-semibold tracking-[0.25em] text-slate-400 uppercase">
									Variant
								</p>
								<p class="text-[11px] leading-snug text-slate-300">{selectedWeapon.detail}</p>
								<p class="text-[10px] leading-snug text-slate-500">
									HOT shop offer · mint the NFT to equip this weapon.
								</p>
							</div>
						</div>

						<div class="p-4">
							<div class="mb-2 flex items-baseline justify-between gap-2">
								<h3
									class="text-[10px] font-semibold tracking-[0.3em] uppercase"
									style:color={activeTabDefinition.accent}
								>
									{activeTabDefinition.kicker}
								</h3>
								<p class="text-[10px] text-slate-500">Pick one to see the details</p>
							</div>

							<ul class="space-y-1.5">
								{#each SHOP_WEAPONS as item (item.id)}
									<li>
										<ShopItemCard
											{item}
											selected={selectedWeapon.id === item.id}
											status={{ label: 'Hot drop', className: HOT_CLASS, done: false }}
											onSelect={() => selectWeapon(item.id)}
										/>
									</li>
								{/each}
							</ul>

							{#if selectedWeaponCatalog}
								<div class="mt-3 space-y-2">
									<EquipNftButton item={selectedWeaponCatalog} />
									<MintItemButton item={selectedWeaponCatalog} />
								</div>
							{/if}
						</div>
					</div>
				</div>

				<div
					role="tabpanel"
					id="shop-panel-assets"
					aria-labelledby="shop-tab-assets"
					hidden={activeTab !== 'assets'}
				>
					<div class="grid md:h-full md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
						<div class="flex min-h-0 flex-col border-b border-white/10 md:border-r md:border-b-0">
							<div
								class="relative h-64 shrink-0 bg-gradient-to-b from-violet-500/10 to-transparent sm:h-72 md:h-auto md:min-h-[400px] md:flex-1"
							>
								{#if activeTab === 'assets'}
									<ShopPreview preview={assetPreview} />
								{/if}

								<div
									class="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3"
								>
									<span class="flex items-center gap-1.5">
										<span
											class="rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase backdrop-blur-sm"
											style:border-color={`${selectedAsset.accent}66`}
											style:background-color={`${selectedAsset.accent}1a`}
											style:color={selectedAsset.accent}
										>
											{selectedAsset.badge}
										</span>
										{#if selectedAsset.hot}
											<span
												class="rounded-full border border-rose-300/40 bg-rose-500/90 px-2.5 py-1 text-[10px] font-bold tracking-wider text-white uppercase backdrop-blur-sm"
											>
												HOT
											</span>
										{/if}
									</span>
									<span
										class="rounded-full border border-white/10 bg-slate-950/70 px-2.5 py-1 text-[10px] font-medium text-slate-300 backdrop-blur-sm"
									>
										{SHOP_ASSETS.findIndex((item) => item.id === selectedAsset.id) + 1} / {SHOP_ASSETS.length}
									</span>
								</div>

								<div
									class="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#120b08] via-[#120b08]/85 to-transparent px-4 pt-10 pb-3"
								>
									<p
										class="text-[10px] font-semibold tracking-[0.25em] uppercase"
										style:color={selectedAsset.accent}
									>
										{activeTabDefinition.kicker}
									</p>
									<p class="truncate text-lg font-bold text-slate-50">{selectedAsset.name}</p>
									<p class="line-clamp-2 text-[11px] leading-snug text-slate-400">
										{selectedAsset.description}
									</p>
								</div>
							</div>

							<div class="space-y-2.5 p-4">
								<div class="flex items-center justify-between gap-2">
									<span
										class="rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase {selectedAssetStatus.className}"
									>
										{selectedAssetStatus.label}
									</span>
									<span class="text-[10px] text-slate-500"
										>{selectedAsset.hot ? 'Hot cosmetic' : 'Village relic'}</span
									>
								</div>

								<p class="text-[10px] font-semibold tracking-[0.25em] text-slate-400 uppercase">
									About this item
								</p>
								<p class="text-[11px] leading-snug text-slate-300">{selectedAsset.detail}</p>
								<p class="text-[10px] leading-snug text-slate-500">
									{selectedAsset.hot
										? 'HOT cosmetic · mint the NFT to equip it.'
										: 'Village relic · mint the NFT to equip it.'}
								</p>
							</div>
						</div>

						<div class="p-4">
							<div class="mb-2 flex items-baseline justify-between gap-2">
								<h3
									class="text-[10px] font-semibold tracking-[0.3em] uppercase"
									style:color={activeTabDefinition.accent}
								>
									{activeTabDefinition.kicker}
								</h3>
								<p class="text-[10px] text-slate-500">Pick one to see the details</p>
							</div>

							<ul class="space-y-1.5">
								{#each SHOP_ASSETS as item (item.id)}
									<li>
										<ShopItemCard
											{item}
											selected={selectedAsset.id === item.id}
											status={assetStatus(item)}
											onSelect={() => selectAsset(item.id)}
										/>
									</li>
								{/each}
							</ul>

							{#if selectedAssetCatalog}
								<div class="mt-3 space-y-2">
									<EquipNftButton item={selectedAssetCatalog} />
									<MintItemButton item={selectedAssetCatalog} />
								</div>
							{/if}
						</div>
					</div>
				</div>

				<div
					role="tabpanel"
					id="shop-panel-vehicles"
					aria-labelledby="shop-tab-vehicles"
					hidden={activeTab !== 'vehicles'}
				>
					<div class="grid md:h-full md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
						<div class="flex min-h-0 flex-col border-b border-white/10 md:border-r md:border-b-0">
							<div
								class="relative h-64 shrink-0 bg-gradient-to-b from-rose-500/10 to-transparent sm:h-80 md:h-auto md:min-h-[400px] md:flex-1"
							>
								{#if activeTab === 'vehicles'}
									<ShopPreview preview={vehiclePreview} />
								{/if}

								<div
									class="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3"
								>
									<span class="flex items-center gap-1.5">
										<span
											class="rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase backdrop-blur-sm"
											style:border-color={`${selectedVehicle.accent}66`}
											style:background-color={`${selectedVehicle.accent}1a`}
											style:color={selectedVehicle.accent}
										>
											{selectedVehicle.badge}
										</span>
										{#if selectedVehicle.hot}
											<span
												class="rounded-full border border-rose-300/40 bg-rose-500/90 px-2.5 py-1 text-[10px] font-bold tracking-wider text-white uppercase backdrop-blur-sm"
											>
												HOT
											</span>
										{/if}
									</span>
									<span
										class="rounded-full border border-white/10 bg-slate-950/70 px-2.5 py-1 text-[10px] font-medium text-slate-300 backdrop-blur-sm"
									>
										{SHOP_VEHICLES.findIndex((item) => item.id === selectedVehicle.id) + 1} / {SHOP_VEHICLES.length}
									</span>
								</div>

								<div
									class="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#120b08] via-[#120b08]/85 to-transparent px-4 pt-10 pb-3"
								>
									<p
										class="text-[10px] font-semibold tracking-[0.25em] uppercase"
										style:color={selectedVehicle.accent}
									>
										{activeTabDefinition.kicker}
									</p>
									<p class="truncate text-lg font-bold text-slate-50">{selectedVehicle.name}</p>
									<p class="line-clamp-2 text-[11px] leading-snug text-slate-400">
										{selectedVehicle.description}
									</p>
								</div>
							</div>

							<div class="space-y-2.5 p-4">
								<div class="flex items-center justify-between gap-2">
									<span
										class="rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase {selectedVehicleStatus.className}"
									>
										{selectedVehicleStatus.label}
									</span>
									<span class="text-[10px] text-slate-500">Shop ride</span>
								</div>

								<p class="text-[10px] font-semibold tracking-[0.25em] text-slate-400 uppercase">
									How to get it
								</p>
								<p class="text-[11px] leading-snug text-slate-300">{selectedVehicle.detail}</p>
								<p class="text-[10px] leading-snug text-slate-500">
									HOT shop ride · mint the NFT to equip it in the village.
								</p>
							</div>
						</div>

						<div class="p-4">
							<div class="mb-2 flex items-baseline justify-between gap-2">
								<h3
									class="text-[10px] font-semibold tracking-[0.3em] uppercase"
									style:color={activeTabDefinition.accent}
								>
									{activeTabDefinition.kicker}
								</h3>
								<p class="text-[10px] text-slate-500">Pick one to see the details</p>
							</div>

							<ul class="space-y-1.5">
								{#each SHOP_VEHICLES as item (item.id)}
									<li>
										<ShopItemCard
											{item}
											selected={selectedVehicle.id === item.id}
											onSelect={() => selectVehicle(item.id)}
										/>
									</li>
								{/each}
							</ul>

							{#if selectedVehicleCatalog}
								<div class="mt-3 space-y-2">
									<EquipNftButton item={selectedVehicleCatalog} />
									<MintItemButton item={selectedVehicleCatalog} />
								</div>
							{/if}
						</div>
					</div>
				</div>

				<div
					role="tabpanel"
					id="shop-panel-market"
					aria-labelledby="shop-tab-market"
					hidden={activeTab !== 'market'}
				>
					{#if activeTab === 'market'}
						<MarketView />
					{/if}
				</div>
			</div>
		</section>
	</div>
{/if}
