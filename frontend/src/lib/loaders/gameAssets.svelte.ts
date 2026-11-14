import { sceneState } from '../state/sceneState.svelte';
import { asset } from '../assets/path';

export type GameAsset = {
	url: string;
	label: string;
	size: number;
};

export type GameAssetStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Recursos que forman la experiencia base. `map.glb` se precarga siempre
 * porque es el mundo por defecto. La cripta (`game2.glb`) se carga bajo demanda
 * al entrar en `minigame-2`: así no ocupa memoria ni retrasa el arranque para
 * los jugadores que nunca entran, y sus físicas ya se crean solo al montar la
 * escena. `whi-interior` solo se suma en la vista de desarrollo `?map=whi-interior`.
 */
const CORE_ASSETS: GameAsset[] = [
	{ url: asset('maps/map.glb'), label: 'The Cursed Forest', size: 4_556_244 },
	{ url: asset('characters/Hero.glb'), label: 'The hero', size: 564_188 },
	{ url: asset('characters/Scarecrow_Feet.glb'), label: 'The scarecrow', size: 502_636 },
	{ url: asset('characters/Mummy.glb'), label: 'The mummies', size: 500_748 },
	{ url: asset('props/gato.glb'), label: 'The lost cats', size: 5_084 },
	{ url: asset('vehicles/coche_calabaza.glb'), label: 'The pumpkin car', size: 74_608 },
	{ url: asset('vehicles/coche_halloween.glb'), label: 'The Halloween car', size: 76_088 },
	{ url: asset('vehicles/coche_momia.glb'), label: 'The mummy car', size: 75_144 }
];

const WHI_INTERIOR_ASSET: GameAsset = {
	url: asset('maps/whi-interior.glb'),
	label: "The witch's house",
	size: 2_293_896
};

export function getGameAssets(): GameAsset[] {
	const assets = [...CORE_ASSETS];

	if (sceneState.active === 'whi-interior') {
		assets.push(WHI_INTERIOR_ASSET);
	}

	return assets;
}

type Entry = {
	asset: GameAsset;
	loaded: number;
	done: boolean;
	failed: boolean;
};

/**
 * Progreso agregado de todos los GLB. Cada archivo aporta su tamaño conocido
 * para que la barra avance de forma uniforme incluso cuando el navegador no
 * informa `total` (por ejemplo, con compresión al vuelo).
 */
class GameAssetLoader {
	status = $state<GameAssetStatus>('idle');
	progress = $state(0);
	loadedBytes = $state(0);
	totalBytes = $state(0);
	completed = $state(0);
	total = $state(0);
	currentLabel = $state('Preparing the ritual…');
	error = $state<string | null>(null);

	private entries = new Map<string, Entry>();

	get ready(): boolean {
		return this.status === 'ready';
	}

	begin(assets: GameAsset[]): void {
		this.entries.clear();

		for (const asset of assets) {
			this.entries.set(asset.url, {
				asset,
				loaded: 0,
				done: false,
				failed: false
			});
		}

		this.status = 'loading';
		this.progress = 0;
		this.loadedBytes = 0;
		this.totalBytes = assets.reduce((sum, asset) => sum + asset.size, 0);
		this.completed = 0;
		this.total = assets.length;
		this.currentLabel = 'Preparing the ritual…';
		this.error = null;
	}

	update(url: string, event: ProgressEvent): void {
		const entry = this.entries.get(url);

		if (!entry || entry.done || entry.failed) {
			return;
		}

		const size = entry.asset.size;

		// Si el servidor comprime el GLB, `event.total` es el tamaño comprimido.
		// Escalamos la proporción al tamaño real del manifiesto para que la barra
		// no se quede a medias ni salte al 100% demasiado pronto.
		entry.loaded =
			event.total > 0
				? Math.min(size, (event.loaded / event.total) * size)
				: Math.min(size, event.loaded);

		this.recompute();
	}

	complete(url: string): void {
		const entry = this.entries.get(url);

		if (!entry) {
			return;
		}

		entry.loaded = entry.asset.size;
		entry.done = true;
		this.recompute();
	}

	fail(url: string, error: unknown): void {
		const entry = this.entries.get(url);

		if (!entry) {
			return;
		}

		entry.failed = true;
		this.error = error instanceof Error ? error.message : `Could not load ${entry.asset.label}.`;
		this.status = 'error';
		this.recompute();
	}

	finish(): void {
		if (this.status === 'error') {
			return;
		}

		this.progress = 1;
		this.loadedBytes = this.totalBytes;
		this.completed = this.total;
		this.currentLabel = 'The night is ready';
		this.status = 'ready';
	}

	reset(): void {
		this.entries.clear();
		this.status = 'idle';
		this.progress = 0;
		this.loadedBytes = 0;
		this.totalBytes = 0;
		this.completed = 0;
		this.total = 0;
		this.currentLabel = 'Preparing the ritual…';
		this.error = null;
	}

	private recompute(): void {
		let loaded = 0;
		let total = 0;
		let done = 0;
		let current: Entry | null = null;
		let currentRemaining = -1;

		for (const entry of this.entries.values()) {
			const size = entry.asset.size;
			const entryLoaded = Math.min(entry.loaded, size);

			total += size;
			loaded += entryLoaded;

			if (entry.done) {
				done += 1;
			}

			if (!entry.done && !entry.failed) {
				const remaining = size - entryLoaded;

				if (remaining > currentRemaining) {
					currentRemaining = remaining;
					current = entry;
				}
			}
		}

		this.loadedBytes = loaded;
		this.totalBytes = total;
		this.completed = done;

		const byteRatio = total > 0 ? loaded / total : 0;
		const doneRatio = this.entries.size > 0 ? done / this.entries.size : 0;

		// La descarga pesa el 90% y la preparación de la escena el 10% restante:
		// así el 100% solo aparece cuando todos los GLTF están resueltos.
		this.progress = Math.min(1, byteRatio * 0.9 + doneRatio * 0.1);

		if (this.status !== 'error' && this.entries.size > 0 && done === this.entries.size) {
			this.progress = 1;
		}

		if (this.status !== 'error') {
			this.currentLabel = current
				? `Loading ${current.asset.label.toLowerCase()}…`
				: 'Lighting the candles…';
		}
	}
}

export const gameAssets = new GameAssetLoader();
