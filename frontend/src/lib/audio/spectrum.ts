/**
 * Espectro de la música que suena en el jukebox del club.
 *
 * Es un módulo plano (sin runas) para que la pantalla del club y los láseres
 * lo lean cada frame sin provocar re-renders. El motor de audio lo actualiza
 * desde un `AnalyserNode` enganchado al `<audio>` del jukebox; cuando no hay
 * pista (o está en pausa) los valores caen a cero y los visuales vuelven a su
 * pulso sintético de respaldo.
 */
export type MusicSpectrum = {
	/** Energía 0–1 de graves, medios y agudos. */
	bass: number;
	mid: number;
	high: number;
	/** Pico de golpe (kick) 0–1 con caída exponencial. */
	beat: number;
	/** Mezcla ponderada de las tres bandas, 0–1. */
	energy: number;
	/** Hay una pista reproduciéndose ahora mismo. */
	active: boolean;
};

export const musicSpectrum: MusicSpectrum = {
	bass: 0,
	mid: 0,
	high: 0,
	beat: 0,
	energy: 0,
	active: false
};

export function setMusicSpectrum(values: Partial<MusicSpectrum>): void {
	if (values.bass !== undefined) musicSpectrum.bass = values.bass;
	if (values.mid !== undefined) musicSpectrum.mid = values.mid;
	if (values.high !== undefined) musicSpectrum.high = values.high;
	if (values.beat !== undefined) musicSpectrum.beat = values.beat;
	if (values.energy !== undefined) musicSpectrum.energy = values.energy;
	if (values.active !== undefined) musicSpectrum.active = values.active;
}

export function resetMusicSpectrum(): void {
	musicSpectrum.bass = 0;
	musicSpectrum.mid = 0;
	musicSpectrum.high = 0;
	musicSpectrum.beat = 0;
	musicSpectrum.energy = 0;
	musicSpectrum.active = false;
}
