import type {
	BalloonSeat,
	BalloonState,
	CarEvent,
	CarId,
	CarImpactCause,
	CarState,
	ChatMessage,
	ClientMessage,
	ClubMusicSnapshot,
	HeroAnimation,
	LobbyId,
	Mg2Event,
	Mg2MummyReport,
	Mg2PositionMummy,
	Mg2PositionPlayer,
	Mg2Snapshot,
	Mg5CarStateReport,
	Mg5Event,
	Mg5Positions,
	Mg5Snapshot,
	Mg5WeaponId,
	Mg6Event,
	Mg6Positions,
	Mg6Snapshot,
	Mg7Event,
	Mg7Positions,
	Mg7Snapshot,
	Mg8Correct,
	Mg8Event,
	Mg8Mode,
	Mg8Positions,
	Mg8Snapshot,
	MinigameLobbyId,
	NpcId,
	NpcState,
	PaperRollState,
	Player,
	PresenceSnapshot,
	RaceCarStateReport,
	RaceEvent,
	RacePosition,
	RaceSnapshot,
	RemotePosition,
	ServerMessage
} from './protocol';

/**
 * Transport for the hub and the mini lobbies.
 *
 * A single `ws://…/ws` socket: the Bun/Elysia backend (`backend/`) keeps the
 * authoritative state for every scene and routes messages by the player's
 * `lobbyId`, exactly like it did before the RUN rooms migration.
 *
 * `enter-lobby` / `leave-lobby` change the player's presence and subscribe the
 * socket to the mini-lobby topic. `/me`, `/help` and normal chat travel as
 * `chat` messages; the server owns the history and the rate limit.
 */

type SceneLobbyId = Exclude<MinigameLobbyId, 'minigame-1'>;

const MAX_RECONNECT_ATTEMPTS = 10;

export type LobbySocketStatus =
	'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

export type ReconnectConfig = {
	baseDelayMs?: number;
	maxDelayMs?: number;
	jitterRatio?: number;
};

type ResolvedReconnectConfig = Required<ReconnectConfig>;

export type { CarState, NpcState };

export type BalloonStateReport = {
	x: number;
	y: number;
	z: number;
	qx: number;
	qy: number;
	qz: number;
	qw: number;
	vx: number;
	vy: number;
	vz: number;
	speed: number;
};

export type CarStateReport = {
	carId: CarId;
	x: number;
	y: number;
	z: number;
	qx: number;
	qy: number;
	qz: number;
	qw: number;
	vx: number;
	vy: number;
	vz: number;
	speed: number;
	steering: number;
};

export type LobbyIdentity = {
	token: string;
	accountId: string;
	publicKey: string;
};

export type LobbySocketOptions = {
	reconnect?: ReconnectConfig;
	/** Optional Auth0/NEAR identity sent in `join` so the server can attest stats. */
	getIdentity?: () => Promise<LobbyIdentity | null>;
	onStatus?: (status: LobbySocketStatus) => void;
	/** `welcome`: who this connection is, plus the hub snapshot. */
	onWelcome?: (self: Player, presence: PresenceSnapshot) => void;
	/** The server-assigned player id, available as soon as `welcome` lands. */
	onSelfId?: (playerId: string) => void;
	onPresence?: (presence: PresenceSnapshot) => void;
	onChat?: (message: ChatMessage) => void;
	onChatHistory?: (messages: ChatMessage[]) => void;
	onClubMusicState?: (state: ClubMusicSnapshot) => void;
	onError?: (code: string, message: string) => void;
	onPong?: (at: number) => void;
	onMg2State?: (state: Mg2Snapshot) => void;
	onMg2Positions?: (players: Mg2PositionPlayer[], mummies: Mg2PositionMummy[], at: number) => void;
	onMg2Event?: (event: Mg2Event) => void;
	onRollsState?: (serverTime: number, rolls: PaperRollState[]) => void;
	onPlayerAnimation?: (playerId: string, animation: HeroAnimation, at: number) => void;
	onPlayerPosition?: (playerId: string, position: RemotePosition, at: number) => void;
	onCarsState?: (serverTime: number, cars: CarState[]) => void;
	onCarEvent?: (event: CarEvent) => void;
	onBalloonState?: (serverTime: number, balloon: BalloonState) => void;
	onNpcsState?: (serverTime: number, npcs: NpcState[]) => void;
	onRaceState?: (state: RaceSnapshot) => void;
	onRacePositions?: (players: RacePosition[], at: number) => void;
	onRaceEvent?: (event: RaceEvent) => void;
	onMg5State?: (state: Mg5Snapshot) => void;
	onMg5Positions?: (positions: Mg5Positions) => void;
	onMg5Event?: (event: Mg5Event) => void;
	onMg6State?: (state: Mg6Snapshot) => void;
	onMg6Positions?: (positions: Mg6Positions) => void;
	onMg6Event?: (event: Mg6Event) => void;
	onMg7State?: (state: Mg7Snapshot) => void;
	onMg7Positions?: (positions: Mg7Positions) => void;
	onMg7Event?: (event: Mg7Event) => void;
	onMg8State?: (state: Mg8Snapshot) => void;
	onMg8Positions?: (positions: Mg8Positions) => void;
	onMg8Event?: (event: Mg8Event) => void;
	onMg8Correct?: (correct: Mg8Correct) => void;
	onReconnectScheduled?: (attempt: number, retryAt: number) => void;
	/** Kept for API compatibility; the Bun backend moves the player directly. */
	onLobbyExit?: (lobbyId: LobbyId, reason: 'round-ended' | 'kicked') => void;
};

const DEFAULT_RECONNECT: ResolvedReconnectConfig = {
	baseDelayMs: 1000,
	maxDelayMs: 15000,
	jitterRatio: 0.2
};

export function getReconnectDelay(
	attempt: number,
	config: ReconnectConfig = {},
	random: () => number = Math.random
): number {
	const { baseDelayMs, maxDelayMs, jitterRatio } = {
		...DEFAULT_RECONNECT,
		...config
	};
	const exponent = Math.max(0, attempt - 1);
	const rawDelay = Math.min(baseDelayMs * 2 ** exponent, maxDelayMs);
	const jitter = rawDelay * jitterRatio * (random() * 2 - 1);

	return Math.round(Math.min(maxDelayMs, Math.max(0, rawDelay + jitter)));
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function serverUrl(): string {
	const configured = import.meta.env.VITE_WS_URL as string | undefined;

	if (configured) {
		return configured;
	}

	if (typeof window === 'undefined') {
		return 'ws://localhost:4000/ws';
	}

	const secure = window.location.protocol === 'https:';
	const protocol = secure ? 'wss:' : 'ws:';

	// Mismo origen: en desarrollo Vite reenvía `/ws` al backend Elysia/Bun
	// (`server.proxy` en `vite.config.ts`); en producción se espera el backend
	// detrás del mismo host. `VITE_WS_URL` sigue teniendo prioridad.
	return `${protocol}//${window.location.host}/ws`;
}

export class LobbySocket {
	private readonly options: LobbySocketOptions;
	private readonly reconnect: ResolvedReconnectConfig;

	private socket: WebSocket | null = null;
	private selfId: string | null = null;
	private alias = '';
	/** Last equipped skin; re-sent on every (re)connection. */
	private skin: Player['skin'] | null = null;
	/** Last equipped NFT accessories; re-sent on every (re)connection. */
	private nftEquip: { crown: boolean; ride: string | null; weaponVariant: string | null } | null =
		null;

	private statusValue: LobbySocketStatus = 'idle';
	private reconnectAttempt = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private manualClose = false;
	private listenersAttached = false;
	/** `join` is sent asynchronously once the identity token is available. */
	private joined = false;
	private outbox: ClientMessage[] = [];

	constructor(options: LobbySocketOptions) {
		this.options = options;
		this.reconnect = { ...DEFAULT_RECONNECT, ...options.reconnect };
	}

	get status(): LobbySocketStatus {
		return this.statusValue;
	}

	get attempt(): number {
		return this.reconnectAttempt;
	}

	get playerId(): string | null {
		return this.selfId;
	}

	isOpen(): boolean {
		return this.socket?.readyState === WebSocket.OPEN;
	}

	connect(alias: string, skin?: Player['skin']): void {
		this.alias = alias;

		if (skin) {
			this.skin = skin;
		}

		this.manualClose = false;
		this.reconnectAttempt = 0;
		this.selfId = null;
		this.joined = false;
		this.outbox = [];
		this.clearReconnectTimer();
		this.attachWindowListeners();
		this.setStatus('connecting');
		this.open();
	}

	disconnect(): void {
		this.manualClose = true;
		this.clearReconnectTimer();
		this.detachWindowListeners();
		this.reconnectAttempt = 0;
		this.selfId = null;
		this.closeSocket();
		this.setStatus('disconnected');
	}

	retryNow(): void {
		if (this.statusValue !== 'reconnecting') {
			return;
		}

		this.clearReconnectTimer();
		this.open();
	}

	// -- hub ----------------------------------------------------------------

	enterLobby(lobbyId: MinigameLobbyId): boolean {
		if (!this.isOpen()) {
			this.options.onError?.('NOT_CONNECTED', 'The socket is not connected');
			return false;
		}

		return this.send({ type: 'enter-lobby', lobbyId });
	}

	leaveLobby(): boolean {
		if (!this.isOpen()) {
			this.options.onError?.('NOT_CONNECTED', 'The socket is not connected');
			return false;
		}

		return this.send({ type: 'leave-lobby' });
	}

	sendChat(text: string): boolean {
		const trimmed = text.trim();

		if (trimmed.length === 0) {
			return false;
		}

		return this.send({ type: 'chat', text: trimmed });
	}

	// -- club jukebox -------------------------------------------------------

	addClubTrack(url: string): boolean {
		return this.send({ type: 'club-music-add', url });
	}

	removeClubTrack(trackId: string): boolean {
		return this.send({ type: 'club-music-remove', trackId });
	}

	selectClubTrack(trackId: string): boolean {
		return this.send({ type: 'club-music-select', trackId });
	}

	clubMusicPlay(): boolean {
		return this.send({ type: 'club-music-play' });
	}

	clubMusicPause(): boolean {
		return this.send({ type: 'club-music-pause' });
	}

	clubMusicSkip(direction: 1 | -1): boolean {
		return this.send({ type: 'club-music-skip', direction });
	}

	clubMusicEnded(trackId: string, version: number): boolean {
		return this.send({ type: 'club-music-ended', trackId, version });
	}

	clubMusicDuration(trackId: string, durationMs: number): boolean {
		return this.send({ type: 'club-music-duration', trackId, durationMs });
	}

	ping(): boolean {
		return this.send({ type: 'ping' });
	}

	// -- outdoor map --------------------------------------------------------

	sendThrowRoll(roll: PaperRollState, cannon?: 'front' | 'left' | 'right'): boolean {
		return this.send({
			type: 'throw-roll',
			id: roll.id,
			scene: roll.scene,
			x: roll.x,
			y: roll.y,
			z: roll.z,
			vx: roll.vx,
			vy: roll.vy,
			vz: roll.vz,
			yaw: roll.yaw,
			...(cannon ? { cannon } : {})
		});
	}

	sendPlayerAnimation(animation: HeroAnimation): boolean {
		return this.send({ type: 'player-animation', animation });
	}

	/**
	 * Stores the equipped skin and tells the server so every remote avatar
	 * updates. While disconnected it only remembers it; `open` sends it again.
	 */
	sendPlayerSkin(skin: Player['skin']): boolean {
		this.skin = skin;

		if (!this.isOpen()) {
			return false;
		}

		return this.send({ type: 'player-skin', skin });
	}

	/**
	 * Broadcasts equipped NFT accessories (crown, ride, weapon variant).
	 * While disconnected it only remembers them; `handleOpen` sends them again
	 * so players who were already in the lobby still see the loadout.
	 */
	sendNftEquip(crown: boolean, ride: string | null, weaponVariant: string | null): boolean {
		this.nftEquip = { crown, ride, weaponVariant };

		if (!this.isOpen()) {
			return false;
		}

		return this.send({ type: 'player-nft-equip', crown, ride, weaponVariant });
	}

	sendPlayerPosition(x: number, y: number, z: number, yaw: number): boolean {
		return this.send({ type: 'player-position', x, y, z, yaw });
	}

	sendEnterCar(carId: CarId): boolean {
		return this.send({ type: 'enter-car', carId });
	}

	sendExitCar(carId: CarId): boolean {
		return this.send({ type: 'exit-car', carId });
	}

	sendCarState(state: CarStateReport): boolean {
		return this.send({ type: 'car-state', ...state });
	}

	sendCarImpact(carId: CarId, impactSpeed: number, cause: CarImpactCause): boolean {
		return this.send({ type: 'car-impact', carId, impactSpeed, cause });
	}

	sendEnterBalloon(): boolean {
		return this.send({ type: 'enter-balloon' });
	}

	sendExitBalloon(): boolean {
		return this.send({ type: 'exit-balloon' });
	}

	sendSwitchBalloonSeat(seat: BalloonSeat): boolean {
		return this.send({ type: 'switch-balloon-seat', seat });
	}

	sendBalloonState(state: BalloonStateReport): boolean {
		return this.send({ type: 'balloon-state', ...state });
	}

	/** Stops or resumes a lobby NPC while its dialogue is open. */
	sendNpcDialog(npcId: NpcId, open: boolean): boolean {
		return this.send({ type: 'npc-dialog', npcId, open });
	}

	// -- crypt --------------------------------------------------------------

	sendMg2Position(x: number, y: number, z: number, yaw: number): boolean {
		return this.send({ type: 'mg2-position', x, y, z, yaw });
	}

	sendMg2Deposit(): boolean {
		return this.send({ type: 'mg2-deposit' });
	}

	sendMg2Mummies(mummies: Mg2MummyReport[]): boolean {
		if (mummies.length === 0) {
			return false;
		}

		return this.send({ type: 'mg2-mummies', mummies });
	}

	/** A local paper roll hit a mummy: asks the server to stun it. */
	sendMg2Stun(mummyId: string): boolean {
		return this.send({ type: 'mg2-stun', mummyId });
	}

	// -- race ---------------------------------------------------------------

	sendRaceCarState(state: RaceCarStateReport): boolean {
		return this.send({ type: 'race-car-state', ...state });
	}

	sendRaceUseItem(): boolean {
		return this.send({ type: 'race-use-item' });
	}

	sendRaceReset(): boolean {
		return this.send({ type: 'race-reset' });
	}

	sendRaceImpact(impactSpeed: number, cause: CarImpactCause): boolean {
		return this.send({ type: 'race-impact', impactSpeed, cause });
	}

	// -- waves --------------------------------------------------------------

	sendMg5Position(x: number, y: number, z: number, yaw: number): boolean {
		return this.send({ type: 'mg5-position', x, y, z, yaw });
	}

	sendMg5Shoot(
		weapon: Mg5WeaponId,
		origin: { x: number; y: number; z: number },
		dir: { x: number; y: number; z: number },
		targetId?: string | null
	): boolean {
		return this.send({
			type: 'mg5-shoot',
			weapon,
			ox: origin.x,
			oy: origin.y,
			oz: origin.z,
			dx: dir.x,
			dy: dir.y,
			dz: dir.z,
			...(targetId ? { targetId } : {})
		});
	}

	sendMg5Throw(
		origin: { x: number; y: number; z: number },
		dir: { x: number; y: number; z: number },
		target?: { x: number; z: number }
	): boolean {
		return this.send({
			type: 'mg5-throw',
			gx: origin.x,
			gy: origin.y,
			gz: origin.z,
			dx: dir.x,
			dy: dir.y,
			dz: dir.z,
			...(target ? { tx: target.x, tz: target.z } : {})
		});
	}

	sendMg5CarEnter(): boolean {
		return this.send({ type: 'mg5-car-enter' });
	}

	sendMg5CarExit(): boolean {
		return this.send({ type: 'mg5-car-exit' });
	}

	sendMg5CarState(report: Mg5CarStateReport): boolean {
		return this.send({ type: 'mg5-car-state', ...report });
	}

	sendMg5Reload(): boolean {
		return this.send({ type: 'mg5-reload' });
	}

	sendMg5Equip(slot: number): boolean {
		return this.send({ type: 'mg5-equip', slot });
	}

	// -- deathmatch ---------------------------------------------------------

	sendMg6Position(x: number, y: number, z: number, yaw: number): boolean {
		return this.send({ type: 'mg6-position', x, y, z, yaw });
	}

	sendMg6Shoot(
		weapon: Mg5WeaponId,
		origin: { x: number; y: number; z: number },
		dir: { x: number; y: number; z: number },
		targetId?: string | null
	): boolean {
		return this.send({
			type: 'mg6-shoot',
			weapon,
			ox: origin.x,
			oy: origin.y,
			oz: origin.z,
			dx: dir.x,
			dy: dir.y,
			dz: dir.z,
			...(targetId ? { targetId } : {})
		});
	}

	sendMg6Throw(
		origin: { x: number; y: number; z: number },
		dir: { x: number; y: number; z: number },
		target?: { x: number; z: number }
	): boolean {
		return this.send({
			type: 'mg6-throw',
			gx: origin.x,
			gy: origin.y,
			gz: origin.z,
			dx: dir.x,
			dy: dir.y,
			dz: dir.z,
			...(target ? { tx: target.x, tz: target.z } : {})
		});
	}

	sendMg6Reload(): boolean {
		return this.send({ type: 'mg6-reload' });
	}

	sendMg6Equip(slot: number): boolean {
		return this.send({ type: 'mg6-equip', slot });
	}

	// -- parkour ------------------------------------------------------------

	sendMg7Position(x: number, y: number, z: number, yaw: number): boolean {
		return this.send({ type: 'mg7-position', x, y, z, yaw });
	}

	// -- skyfall royale ------------------------------------------------------

	sendMg8Position(
		x: number,
		y: number,
		z: number,
		yaw: number,
		mode: Mg8Mode,
		vy: number
	): boolean {
		return this.send({ type: 'mg8-position', x, y, z, yaw, mode, vy });
	}

	sendMg8Jump(): boolean {
		return this.send({ type: 'mg8-jump' });
	}

	sendMg8Shoot(
		weapon: Mg5WeaponId,
		origin: { x: number; y: number; z: number },
		dir: { x: number; y: number; z: number },
		targetId?: string | null
	): boolean {
		return this.send({
			type: 'mg8-shoot',
			weapon,
			ox: origin.x,
			oy: origin.y,
			oz: origin.z,
			dx: dir.x,
			dy: dir.y,
			dz: dir.z,
			...(targetId ? { targetId } : {})
		});
	}

	sendMg8Throw(
		origin: { x: number; y: number; z: number },
		dir: { x: number; y: number; z: number },
		target?: { x: number; z: number }
	): boolean {
		return this.send({
			type: 'mg8-throw',
			gx: origin.x,
			gy: origin.y,
			gz: origin.z,
			dx: dir.x,
			dy: dir.y,
			dz: dir.z,
			...(target ? { tx: target.x, tz: target.z } : {})
		});
	}

	sendMg8Reload(): boolean {
		return this.send({ type: 'mg8-reload' });
	}

	sendMg8Equip(slot: number): boolean {
		return this.send({ type: 'mg8-equip', slot });
	}

	// -- connection ---------------------------------------------------------

	private open(): void {
		this.closeSocket();

		try {
			const socket = new WebSocket(serverUrl());

			this.socket = socket;
			socket.onopen = () => this.handleOpen(socket);
			socket.onmessage = (event) => this.handleRawMessage(event.data);
			socket.onerror = () => this.options.onError?.('NETWORK_ERROR', 'WebSocket error');
			socket.onclose = (event) => this.handleClose(socket, event);
		} catch (error) {
			this.options.onError?.('CONNECTION_ERROR', errorMessage(error));
			this.scheduleReconnect();
		}
	}

	private handleOpen(socket: WebSocket): void {
		if (this.socket !== socket) {
			return;
		}

		this.reconnectAttempt = 0;
		this.setStatus('connected');
		this.joined = false;
		void this.sendJoin(socket);
	}

	private async sendJoin(socket: WebSocket): Promise<void> {
		let identity: LobbyIdentity | null = null;

		try {
			identity = (await this.options.getIdentity?.()) ?? null;
		} catch {
			identity = null;
		}

		if (this.socket !== socket) {
			return;
		}

		this.joined = true;
		this.send({
			type: 'join',
			name: this.alias,
			...(identity ?? {})
		});

		if (this.skin) {
			this.send({ type: 'player-skin', skin: this.skin });
		}

		if (this.nftEquip) {
			this.send({ type: 'player-nft-equip', ...this.nftEquip });
		}

		const queued = this.outbox;

		this.outbox = [];

		for (const message of queued) {
			this.send(message);
		}
	}

	private handleRawMessage(data: unknown): void {
		if (typeof data !== 'string') {
			return;
		}

		let message: ServerMessage;

		try {
			message = JSON.parse(data) as ServerMessage;
		} catch {
			return;
		}

		this.handleMessage(message);
	}

	private handleClose(socket: WebSocket, event: CloseEvent): void {
		if (this.socket !== socket) {
			return;
		}

		this.socket = null;
		this.selfId = null;
		this.joined = false;
		this.outbox = [];

		if (this.manualClose) {
			this.setStatus('disconnected');
			return;
		}

		this.options.onError?.('CONNECTION_CLOSED', `Connection closed (${event.code})`);
		this.scheduleReconnect();
	}

	private closeSocket(): void {
		const socket = this.socket;

		this.socket = null;

		if (!socket) {
			return;
		}

		socket.onopen = null;
		socket.onmessage = null;
		socket.onerror = null;
		socket.onclose = null;

		if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
			socket.close();
		}
	}

	private send(message: ClientMessage): boolean {
		const socket = this.socket;

		if (!socket || socket.readyState !== WebSocket.OPEN) {
			this.options.onError?.('NOT_CONNECTED', 'The socket is not connected');
			return false;
		}

		// Do not race the asynchronous `join`: queue anything sent before it.
		if (!this.joined && message.type !== 'join') {
			this.outbox.push(message);
			return true;
		}

		socket.send(JSON.stringify(message));
		return true;
	}

	private handleMessage(message: ServerMessage): void {
		switch (message.type) {
			case 'welcome':
			case 'hello':
				this.selfId = message.self.id;
				this.options.onSelfId?.(message.self.id);
				this.options.onWelcome?.(message.self, message.presence);
				return;

			case 'presence':
				this.options.onPresence?.(message.presence);
				return;

			case 'chat':
			case 'emote':
				this.options.onChat?.(message.message);
				return;

			case 'chat-history':
			case 'emote-history':
				this.options.onChatHistory?.(message.messages);
				return;

			case 'club-music-state':
				this.options.onClubMusicState?.(message.state);
				return;

			case 'pong':
				this.options.onPong?.(message.at);
				return;

			case 'error':
				this.options.onError?.(message.code, message.message);
				return;

			case 'go-lobby':
				this.options.onLobbyExit?.(message.lobbyId, message.reason);
				return;

			case 'rolls-state':
				this.options.onRollsState?.(message.serverTime, message.rolls);
				return;

			case 'player-animation':
				this.options.onPlayerAnimation?.(message.playerId, message.animation, message.at);
				return;

			case 'player-position':
				this.options.onPlayerPosition?.(message.playerId, message.position, message.at);
				return;

			case 'cars-state':
				this.options.onCarsState?.(message.serverTime, message.cars);
				return;

			case 'car-event':
				this.options.onCarEvent?.(message.event);
				return;

			case 'balloon-state':
				this.options.onBalloonState?.(message.serverTime, message.balloon);
				return;

			case 'npcs-state':
				this.options.onNpcsState?.(message.serverTime, message.npcs);
				return;

			case 'mg2-state':
				this.options.onMg2State?.(message.state);
				return;

			case 'mg2-positions':
				this.options.onMg2Positions?.(message.players, message.mummies, message.at);
				return;

			case 'mg2-event':
				this.options.onMg2Event?.(message.event);
				return;

			case 'race-state':
				this.options.onRaceState?.(message.state);
				return;

			case 'race-positions':
				this.options.onRacePositions?.(message.players, message.at);
				return;

			case 'race-event':
				this.options.onRaceEvent?.(message.event);
				return;

			case 'mg5-state':
				this.options.onMg5State?.(message.state);
				return;

			case 'mg5-positions': {
				const { type: _type, ...rest } = message;
				this.options.onMg5Positions?.(rest);
				return;
			}

			case 'mg5-event':
				this.options.onMg5Event?.(message.event);
				return;

			case 'mg6-state':
				this.options.onMg6State?.(message.state);
				return;

			case 'mg6-positions': {
				const { type: _type, ...rest } = message;
				this.options.onMg6Positions?.(rest);
				return;
			}

			case 'mg6-event':
				this.options.onMg6Event?.(message.event);
				return;

			case 'mg7-state':
				this.options.onMg7State?.(message.state);
				return;

			case 'mg7-positions': {
				const { type: _type, ...rest } = message;
				this.options.onMg7Positions?.(rest);
				return;
			}

			case 'mg7-event':
				this.options.onMg7Event?.(message.event);
				return;

			case 'mg8-state':
				this.options.onMg8State?.(message.state);
				return;

			case 'mg8-positions': {
				const { type: _type, ...rest } = message;
				this.options.onMg8Positions?.(rest);
				return;
			}

			case 'mg8-event':
				this.options.onMg8Event?.(message.event);
				return;

			case 'mg8-correct':
				this.options.onMg8Correct?.(message.correct);
				return;

			default:
				return;
		}
	}

	private scheduleReconnect(delayOverride?: number): void {
		this.clearReconnectTimer();
		this.reconnectAttempt += 1;

		if (this.reconnectAttempt > MAX_RECONNECT_ATTEMPTS) {
			this.setStatus('disconnected');
			return;
		}

		const delay = delayOverride ?? getReconnectDelay(this.reconnectAttempt, this.reconnect);
		const retryAt = Date.now() + delay;

		this.setStatus('reconnecting');
		this.options.onReconnectScheduled?.(this.reconnectAttempt, retryAt);

		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.open();
		}, delay);
	}

	private clearReconnectTimer(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
	}

	private attachWindowListeners(): void {
		if (typeof window === 'undefined' || this.listenersAttached) {
			return;
		}

		window.addEventListener('online', this.handleOnline);
		document.addEventListener('visibilitychange', this.handleVisibilityChange);
		this.listenersAttached = true;
	}

	private detachWindowListeners(): void {
		if (typeof window === 'undefined' || !this.listenersAttached) {
			return;
		}

		window.removeEventListener('online', this.handleOnline);
		document.removeEventListener('visibilitychange', this.handleVisibilityChange);
		this.listenersAttached = false;
	}

	private handleOnline = (): void => {
		this.retryNow();
	};

	private handleVisibilityChange = (): void => {
		if (document.visibilityState === 'visible') {
			this.retryNow();
		}
	};

	private setStatus(status: LobbySocketStatus): void {
		if (this.statusValue === status) {
			return;
		}

		this.statusValue = status;
		this.options.onStatus?.(status);
	}
}
