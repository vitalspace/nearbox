import { playerProfile } from './playerProfile.svelte';

/**
 * Preferencias visuales del jugador local.
 *
 * Se mantiene esta fachada para no cambiar la API que ya consumen
 * `Player.svelte`, `RemoteHero.svelte`, `RemotePlayer.svelte` y `SettingsMenu`.
 * La fuente de verdad es `playerProfile`.
 */
class PlayerSettings {
	get labelColor(): string {
		return playerProfile.labelColor;
	}

	init(): void {
		playerProfile.init();
	}

	setLabelColor(color: string): void {
		playerProfile.setLabelColor(color);
	}
}

export const playerSettings = new PlayerSettings();
