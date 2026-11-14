import type { ClubMusicSnapshot, ClubTrack } from '../services/protocol';

type ClubMusicSender = {
	add: (url: string) => boolean;
	remove: (trackId: string) => boolean;
	select: (trackId: string) => boolean;
	play: () => boolean;
	pause: () => boolean;
	skip: (direction: 1 | -1) => boolean;
	ended: (trackId: string, version: number) => boolean;
	duration: (trackId: string, durationMs: number) => boolean;
};

/**
 * Estado del jukebox del club en el cliente.
 *
 * La cola y la reproducción las decide el servidor; este store guarda la
 * última instantánea, extrapola la posición entre snapshots y expone acciones
 * que el lobby traduce a mensajes WebSocket.
 */
class ClubMusicStore {
	tracks = $state<ClubTrack[]>([]);
	currentId = $state<string | null>(null);
	playing = $state(false);
	position = $state(0);
	serverTime = $state(0);
	version = $state(0);
	connected = $state(false);

	/** Panel de la cola abierto (checkpoint del DJ). */
	panelOpen = $state(false);
	/** El jugador está dentro del radio del checkpoint. */
	nearby = $state(false);
	/** Último error del servidor (URL inválida, cola llena, etc.). */
	error = $state<string | null>(null);

	private sender: ClubMusicSender | null = null;
	private serverOffset = 0;

	get current(): ClubTrack | null {
		if (!this.currentId) {
			return null;
		}

		return this.tracks.find((track) => track.id === this.currentId) ?? null;
	}

	get hasTracks(): boolean {
		return this.tracks.length > 0;
	}

	get currentIndex(): number {
		if (!this.currentId) {
			return -1;
		}

		return this.tracks.findIndex((track) => track.id === this.currentId);
	}

	/** Posición actual en segundos, corregida con el reloj del servidor. */
	get livePosition(): number {
		if (!this.playing || !this.currentId) {
			return this.position;
		}

		const serverNow = Date.now() + this.serverOffset;
		return this.position + Math.max(0, serverNow - this.serverTime) / 1000;
	}

	get currentDuration(): number | null {
		return this.current?.durationMs ?? null;
	}

	setSender(sender: ClubMusicSender | null): void {
		this.sender = sender;
	}

	applySnapshot(snapshot: ClubMusicSnapshot): void {
		this.tracks = snapshot.tracks;
		this.currentId = snapshot.currentId;
		this.playing = snapshot.playing;
		this.position = snapshot.position;
		this.serverTime = snapshot.serverTime;
		this.version = snapshot.version;
		this.serverOffset = snapshot.serverTime - Date.now();
		this.connected = true;
		this.error = null;
	}

	reset(): void {
		this.tracks = [];
		this.currentId = null;
		this.playing = false;
		this.position = 0;
		this.serverTime = 0;
		this.version = 0;
		this.connected = false;
		this.panelOpen = false;
		this.nearby = false;
		this.error = null;
	}

	openPanel(): void {
		this.panelOpen = true;
		this.error = null;
	}

	closePanel(): void {
		this.panelOpen = false;
	}

	togglePanel(): void {
		if (this.panelOpen) {
			this.closePanel();
		} else {
			this.openPanel();
		}
	}

	setNearby(value: boolean): void {
		this.nearby = value;

		if (!value) {
			this.panelOpen = false;
		}
	}

	setError(message: string | null): void {
		this.error = message;
	}

	add(url: string): boolean {
		this.error = null;
		return this.sender?.add(url) ?? false;
	}

	remove(trackId: string): boolean {
		return this.sender?.remove(trackId) ?? false;
	}

	select(trackId: string): boolean {
		return this.sender?.select(trackId) ?? false;
	}

	play(): boolean {
		return this.sender?.play() ?? false;
	}

	pause(): boolean {
		return this.sender?.pause() ?? false;
	}

	skip(direction: 1 | -1): boolean {
		return this.sender?.skip(direction) ?? false;
	}

	ended(trackId: string, version: number): boolean {
		return this.sender?.ended(trackId, version) ?? false;
	}

	reportDuration(trackId: string, durationMs: number): boolean {
		return this.sender?.duration(trackId, durationMs) ?? false;
	}
}

export const clubMusic = new ClubMusicStore();
