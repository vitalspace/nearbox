import { audio } from './engine';
import type { AudioVolumes } from './types';

/**
 * Preferencias de audio persistentes.
 *
 * Igual que el perfil del jugador, la lectura es tolerante: un JSON corrupto o
 * valores fuera de rango vuelven a los valores por defecto sin romper el
 * arranque. Los cambios se aplican en caliente al motor y se sincronizan entre
 * pestañas con el evento `storage`.
 */

export const AUDIO_STORAGE_KEY = 'rw:audio:v1';

const DEFAULTS: AudioVolumes & { muted: boolean } = {
	master: 0.8,
	ambience: 0.55,
	music: 0.45,
	sfx: 0.85,
	ui: 0.6,
	muted: false
};

const WRITE_DEBOUNCE_MS = 150;

function clamp01(value: unknown, fallback: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return fallback;
	}

	return Math.min(1, Math.max(0, value));
}

type StoredAudio = {
	version?: unknown;
	master?: unknown;
	ambience?: unknown;
	music?: unknown;
	sfx?: unknown;
	ui?: unknown;
	muted?: unknown;
};

function parseStored(raw: string | null): (AudioVolumes & { muted: boolean }) | null {
	if (!raw) {
		return null;
	}

	try {
		const value = JSON.parse(raw) as StoredAudio;

		if (!value || typeof value !== 'object' || value.version !== 1) {
			return null;
		}

		return {
			master: clamp01(value.master, DEFAULTS.master),
			ambience: clamp01(value.ambience, DEFAULTS.ambience),
			music: clamp01(value.music, DEFAULTS.music),
			sfx: clamp01(value.sfx, DEFAULTS.sfx),
			ui: clamp01(value.ui, DEFAULTS.ui),
			muted: typeof value.muted === 'boolean' ? value.muted : DEFAULTS.muted
		};
	} catch (error) {
		console.warn('[audio] Could not read stored settings', error);
		return null;
	}
}

class AudioSettingsStore {
	master = $state(DEFAULTS.master);
	ambience = $state(DEFAULTS.ambience);
	music = $state(DEFAULTS.music);
	sfx = $state(DEFAULTS.sfx);
	ui = $state(DEFAULTS.ui);
	muted = $state(DEFAULTS.muted);
	/** `false` hasta que `init()` ha leído el almacenamiento. */
	loaded = $state(false);

	private writeTimer: ReturnType<typeof setTimeout> | null = null;
	private listening = false;

	/** Volúmenes en el formato que espera el motor. */
	volumes(): AudioVolumes {
		return {
			master: this.master,
			ambience: this.ambience,
			music: this.music,
			sfx: this.sfx,
			ui: this.ui
		};
	}

	init(): void {
		if (typeof window === 'undefined') {
			return;
		}

		if (!this.loaded) {
			const stored = parseStored(this.read());
			this.apply(stored ?? DEFAULTS);
			this.loaded = true;
		}

		if (!this.listening) {
			window.addEventListener('storage', this.onStorage);
			this.listening = true;
		}

		this.push();
	}

	setMaster(value: number): void {
		this.master = this.clamp(value, this.master);
		this.commit();
	}

	setAmbience(value: number): void {
		this.ambience = this.clamp(value, this.ambience);
		this.commit();
	}

	setMusic(value: number): void {
		this.music = this.clamp(value, this.music);
		this.commit();
	}

	setSfx(value: number): void {
		this.sfx = this.clamp(value, this.sfx);
		this.commit();
	}

	setUi(value: number): void {
		this.ui = this.clamp(value, this.ui);
		this.commit();
	}

	toggleMuted(): void {
		this.muted = !this.muted;
		this.commit();
	}

	setMuted(value: boolean): void {
		this.muted = value;
		this.commit();
	}

	reset(): void {
		this.apply(DEFAULTS);
		this.commit();
	}

	private clamp(value: number, fallback: number): number {
		return clamp01(value, fallback);
	}

	private apply(values: AudioVolumes & { muted: boolean }): void {
		this.master = values.master;
		this.ambience = values.ambience;
		this.music = values.music;
		this.sfx = values.sfx;
		this.ui = values.ui;
		this.muted = values.muted;
	}

	private commit(): void {
		this.push();
		this.scheduleWrite();
	}

	/** Aplica los valores al motor sin tocar el almacenamiento. */
	push(): void {
		audio.setVolumes(this.volumes());
		audio.setMuted(this.muted);
	}

	private scheduleWrite(): void {
		if (typeof window === 'undefined') {
			return;
		}

		if (this.writeTimer !== null) {
			clearTimeout(this.writeTimer);
		}

		this.writeTimer = setTimeout(() => {
			this.writeTimer = null;
			this.write();
		}, WRITE_DEBOUNCE_MS);
	}

	private write(): void {
		try {
			localStorage.setItem(
				AUDIO_STORAGE_KEY,
				JSON.stringify({
					version: 1,
					master: this.master,
					ambience: this.ambience,
					music: this.music,
					sfx: this.sfx,
					ui: this.ui,
					muted: this.muted
				})
			);
		} catch (error) {
			console.warn('[audio] Could not save settings', error);
		}
	}

	private read(): string | null {
		try {
			return localStorage.getItem(AUDIO_STORAGE_KEY);
		} catch {
			return null;
		}
	}

	private onStorage = (event: StorageEvent): void => {
		if (event.key !== AUDIO_STORAGE_KEY) {
			return;
		}

		const stored = parseStored(event.newValue);
		this.apply(stored ?? DEFAULTS);
		this.push();
	};

	dispose(): void {
		if (this.writeTimer !== null) {
			clearTimeout(this.writeTimer);
			this.writeTimer = null;
		}

		if (this.listening && typeof window !== 'undefined') {
			window.removeEventListener('storage', this.onStorage);
			this.listening = false;
		}
	}
}

export const audioSettings = new AudioSettingsStore();
