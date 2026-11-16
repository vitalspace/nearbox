import { browser } from '$app/env';
import { LobbySocket, type LobbySocketStatus } from '../services/lobbySocket';
import type {
	BalloonSeat,
	HeroAnimation,
	Lobby,
	LobbyId,
	LobbyStatus,
	Mg2MummyReport,
	Mg5WeaponId,
	Mg8Mode,
	Mg8VehiclePose,
	Mg8VehicleReport,
	MinigameLobbyId,
	NpcId,
	PaperRollState,
	Player,
	PresenceSnapshot,
	RemotePosition
} from '../services/protocol';
import { chat } from './chat.svelte';
import { checkpoints } from './checkpoints.svelte';
import { clubMusic } from './clubMusic.svelte';
import { cars } from './cars.svelte';
import { balloon } from './balloon.svelte';
import { minigame2 } from './minigame2.svelte';
import { minigame5 } from './minigame5.svelte';
import { minigame6 } from './minigame6.svelte';
import { minigame7 } from './minigame7.svelte';
import { minigame8 } from './minigame8.svelte';
import { npcs } from './npcs.svelte';
import { dmInput } from './dmInput';
import { paperRolls } from './paperRolls.svelte';
import { playerAnimations } from './playerAnimations.svelte';
import { playerProfile, normalizeAlias } from './playerProfile.svelte';
import { authSession } from './auth.svelte';
import {
	DM_EXIT,
	PARKOUR_EXIT,
	RACE_ENTRY,
	RACE_EXIT,
	ROADMAP_RACE_ENTRY,
	ROYALE_EXIT,
	WAVES_EXIT
} from './playerState';
import { race } from './race.svelte';
import { waveInput } from './waveInput';
import { remotePlayers } from './remotePlayers.svelte';
import type { CarId, CarImpactCause, RaceCarStateReport } from '../services/protocol';
import type { CarStateReport } from '../services/lobbySocket';
import type { BalloonStateReport } from '../services/lobbySocket';

export type LobbyToast = {
	id: number;
	message: string;
};

function isRaceLobbyId(lobbyId: LobbyId | null): boolean {
	return lobbyId === 'minigame-3' || lobbyId === 'minigame-4';
}

function isWavesLobbyId(lobbyId: LobbyId | null): boolean {
	return lobbyId === 'minigame-5';
}

function isDeathmatchLobbyId(lobbyId: LobbyId | null): boolean {
	return lobbyId === 'minigame-6';
}

function isParkourLobbyId(lobbyId: LobbyId | null): boolean {
	return lobbyId === 'minigame-7';
}

function isRoyaleLobbyId(lobbyId: LobbyId | null): boolean {
	return lobbyId === 'minigame-8';
}

class LobbyStore {
	status = $state<LobbySocketStatus>('idle');
	self = $state<Player | null>(null);
	presence = $state<PresenceSnapshot | null>(null);
	error = $state<string | null>(null);
	errorCode = $state<string | null>(null);
	reconnectAttempt = $state(0);
	nextRetryAt = $state<number | null>(null);
	toast = $state<LobbyToast | null>(null);

	private socket: LobbySocket | null = null;
	private initialized = false;
	private toastId = 0;

	get alias(): string {
		return playerProfile.alias;
	}

	init(): void {
		if (!browser || this.initialized) {
			return;
		}

		this.initialized = true;
		playerProfile.init();
	}

	connect(alias = this.alias): void {
		if (!browser) {
			return;
		}

		const name = normalizeAlias(alias);
		const skin = playerProfile.equippedSkin;

		playerProfile.setAlias(name);
		this.error = null;
		this.errorCode = null;
		this.self = null;
		this.presence = null;
		this.reconnectAttempt = 0;
		this.nextRetryAt = null;
		this.toast = null;
		chat.reset();
		cars.reset();
		balloon.reset();
		npcs.resetRemote();
		npcs.setSender(null);
		clubMusic.reset();
		clubMusic.setSender(null);
		race.reset();
		minigame5.reset();
		minigame6.reset();
		minigame7.reset();
		minigame8.reset();
		waveInput.reset();
		dmInput.reset();

		this.socket?.disconnect();

		const socket = new LobbySocket({
			reconnect: {
				baseDelayMs: 1000,
				maxDelayMs: 15000,
				jitterRatio: 0.2
			},
			getIdentity: async () => {
				if (!authSession.loggedIn || !authSession.accountId) {
					return null;
				}

				try {
					const token = await authSession.apiToken();

					if (!token) {
						return null;
					}

					return {
						token,
						accountId: authSession.accountId,
						publicKey: authSession.publicKey
					};
				} catch {
					return null;
				}
			},
			onStatus: (status) => {
				this.status = status;

				if (status === 'connected') {
					// The previous connection may have reset the senders; rebind
					// them before the player can press E or drive again.
					this.bindSenders();
				}

				if (status === 'disconnected' || status === 'error') {
					this.self = null;
					this.presence = null;
					this.reconnectAttempt = 0;
					this.nextRetryAt = null;
					minigame2.reset();
					paperRolls.reset();
					playerAnimations.reset();
					remotePlayers.reset();
					cars.reset();
					balloon.reset();
					npcs.resetRemote();
					npcs.setSender(null);
					clubMusic.reset();
					clubMusic.setSender(null);
					race.reset();
					minigame5.reset();
					minigame6.reset();
					minigame7.reset();
					minigame8.reset();
					waveInput.reset();
					dmInput.reset();
				}
			},
			onSelfId: (playerId) => {
				// The room handle knows who we are before/without `hello`.
				// Without this, a lost join burst leaves `selfId` null and the
				// client never recognises its own `car-event` when entering.
				this.self ??= {
					id: playerId,
					name: this.alias,
					skin,
					crown: false,
					ride: null,
					weaponVariant: null,
					connectedAt: Date.now(),
					lobbyId: 'global'
				};
				cars.selfId = playerId;
				balloon.selfId = playerId;
				race.selfId = playerId;
				minigame5.selfId = playerId;
				minigame6.selfId = playerId;
				minigame7.selfId = playerId;
				minigame8.selfId = playerId;
				paperRolls.selfId = playerId;
			},
			onReconnectScheduled: (attempt, retryAt) => {
				this.reconnectAttempt = attempt;
				this.nextRetryAt = retryAt;
				this.error = null;
				this.errorCode = null;
			},
			onWelcome: (self, presence) => {
				const recovered = this.reconnectAttempt > 0;

				this.self = self;
				this.presence = presence;
				this.error = null;
				this.errorCode = null;
				this.reconnectAttempt = 0;
				this.nextRetryAt = null;
				cars.selfId = self.id;
				balloon.selfId = self.id;
				race.selfId = self.id;
				minigame5.selfId = self.id;
				minigame6.selfId = self.id;
				minigame7.selfId = self.id;
				minigame8.selfId = self.id;

				if (recovered) {
					this.showToast('Connection restored');
				}

				this.syncMinigame(self);
			},
			onPresence: (presence) => {
				this.presence = presence;

				const selfId = this.self?.id;
				const previousLobbyId = this.self?.lobbyId ?? null;

				if (!selfId) {
					return;
				}

				const updated = presence.lobbies
					.flatMap((lobby) => lobby.players)
					.find((player) => player.id === selfId);

				if (updated) {
					this.self = updated;
					this.syncMinigame(updated);

					const wasRacing = isRaceLobbyId(previousLobbyId);
					const isRacing = isRaceLobbyId(updated.lobbyId);
					const wasWaves = isWavesLobbyId(previousLobbyId);
					const isWaves = isWavesLobbyId(updated.lobbyId);
					const wasDeathmatch = isDeathmatchLobbyId(previousLobbyId);
					const isDeathmatch = isDeathmatchLobbyId(updated.lobbyId);
					const wasParkour = isParkourLobbyId(previousLobbyId);
					const isParkour = isParkourLobbyId(updated.lobbyId);
					const wasRoyale = isRoyaleLobbyId(previousLobbyId);
					const isRoyale = isRoyaleLobbyId(updated.lobbyId);

					if (wasRacing && !isRacing) {
						// The server already moved us to `global`: put the body next
						// to the gantry and hand control back to the avatar.
						race.exitRequest = { ...RACE_EXIT };
						race.consumeEntry();
						race.clearSnapshot();
					} else if (!wasRacing && isRacing) {
						race.entryRequest =
							updated.lobbyId === 'minigame-4' ? { ...ROADMAP_RACE_ENTRY } : { ...RACE_ENTRY };
					}

					if (wasWaves && !isWaves) {
						// El servidor ya nos devolvió a `global`: aparecer junto al granero.
						minigame5.reset();
						waveInput.reset();
						minigame5.selfId = selfId;
						minigame5.exitRequest = { ...WAVES_EXIT };
					}

					if (wasDeathmatch && !isDeathmatch) {
						// Same contract as Barn Siege: go back to the witch house door.
						minigame6.reset();
						dmInput.reset();
						minigame6.selfId = selfId;
						minigame6.exitRequest = { ...DM_EXIT };
					}

					if (wasParkour && !isParkour) {
						// The server already moved us back to `global`: return to the
						// central plaza, next to the Parkour Spire checkpoint.
						minigame7.reset();
						minigame7.selfId = selfId;
						minigame7.exitRequest = { ...PARKOUR_EXIT };
					}

					if (wasRoyale && !isRoyale) {
						// Back to the village checkpoint after the results screen.
						minigame8.reset();
						minigame8.selfId = selfId;
						minigame8.exitRequest = { ...ROYALE_EXIT };
					}
				}

				const presentIds = presence.lobbies
					.flatMap((lobby) => lobby.players)
					.map((player) => player.id);
				playerAnimations.prune(presentIds);
				remotePlayers.prune(presentIds);
			},
			onChat: (message) => {
				chat.addMessage(message, this.self?.id);
			},
			onChatHistory: (messages) => {
				chat.setHistory(messages);
			},
			onClubMusicState: (state) => {
				clubMusic.applySnapshot(state);
			},
			onError: (code, message) => {
				this.errorCode = code;
				this.error = message;

				if (code.startsWith('CLUB_MUSIC_')) {
					clubMusic.setError(message);
				}

				// Car rejections are answered with `sendTo('error')`; without a
				// visible hint the player only sees that pressing E did nothing.
				if (code.startsWith('CAR_') || code === 'NOT_IN_GLOBAL' || code === 'NOT_DRIVING') {
					cars.setEntryHint(message);
				}

				if (code.startsWith('BALLOON_') || code === 'NOT_FLYING' || code === 'NOT_ABOARD') {
					balloon.setEntryHint(message);
				}
			},
			onMg2State: (state) => {
				minigame2.applySnapshot(state);
			},
			onMg2Positions: (players, mummies, at) => {
				minigame2.applyPositions(players, mummies, at);
			},
			onMg2Event: (event) => {
				minigame2.applyEvent(event);
			},
			onRollsState: (serverTime, rolls) => {
				paperRolls.applyServerState(serverTime, rolls);
			},
			onPlayerAnimation: (playerId, animation) => {
				playerAnimations.apply(playerId, animation);
			},
			onPlayerPosition: (playerId, position, at) => {
				remotePlayers.apply(playerId, position, at);
			},
			onCarsState: (serverTime, list) => {
				cars.applySnapshot(serverTime, list);
			},
			onCarEvent: (event) => {
				cars.applyEvent(event);
			},
			onBalloonState: (serverTime, state) => {
				balloon.applyState(serverTime, state);
			},
			onNpcsState: (serverTime, list) => {
				npcs.applySnapshot(serverTime, list);
			},
			onRaceState: (state) => {
				race.applySnapshot(state);
			},
			onRacePositions: (players, at) => {
				race.applyPositions(players, at);
			},
			onRaceEvent: (event) => {
				race.applyEvent(event);
			},
			onMg5State: (state) => {
				minigame5.applySnapshot(state);
			},
			onMg5Positions: (positions) => {
				minigame5.applyPositions(positions);
			},
			onMg5Event: (event) => {
				minigame5.applyEvent(event);
			},
			onMg6State: (state) => {
				minigame6.applySnapshot(state);
			},
			onMg6Positions: (positions) => {
				minigame6.applyPositions(positions);
			},
			onMg6Event: (event) => {
				minigame6.applyEvent(event);
			},
			onMg7State: (state) => {
				minigame7.applySnapshot(state);
			},
			onMg7Positions: (positions) => {
				minigame7.applyPositions(positions);
			},
			onMg7Event: (event) => {
				minigame7.applyEvent(event);
			},
			onMg8State: (state) => {
				minigame8.applySnapshot(state);
			},
			onMg8Positions: (positions) => {
				minigame8.applyPositions(positions);
			},
			onMg8Event: (event) => {
				minigame8.applyEvent(event);
			},
			onMg8Correct: (correct) => {
				minigame8.applyCorrect(correct);
			},
			onMg8VehicleCorrect: (correct) => {
				minigame8.applyVehicleCorrect(correct);
			}
		});

		this.socket = socket;
		this.bindSenders();
		socket.connect(name, skin);
	}

	/** (Re)binds the stores to this socket; safe to call after a reconnect. */
	private bindSenders(): void {
		paperRolls.setSender((roll, cannon) => this.sendPaperRoll(roll, cannon));
		playerAnimations.setSender((animation) => this.sendPlayerAnimation(animation));
		cars.setSender({
			enter: (carId) => this.sendEnterCar(carId),
			exit: (carId) => this.sendExitCar(carId),
			state: (report) => this.sendCarState(report),
			impact: (carId, impactSpeed, cause) => this.sendCarImpact(carId, impactSpeed, cause)
		});
		balloon.setSender({
			enter: () => this.sendEnterBalloon(),
			exit: () => this.sendExitBalloon(),
			switchSeat: (seat) => this.sendSwitchBalloonSeat(seat),
			state: (report) => this.sendBalloonState(report)
		});
		npcs.setSender({
			dialog: (npcId, open) => this.sendNpcDialog(npcId, open)
		});
		race.setSender({
			state: (report) => this.sendRaceCarState(report),
			useItem: () => this.sendRaceUseItem(),
			reset: () => this.sendRaceReset(),
			impact: (impactSpeed, cause) => this.sendRaceImpact(impactSpeed, cause)
		});
		minigame5.setSender({
			position: (x, y, z, yaw) => this.sendMg5Position(x, y, z, yaw),
			shoot: (weapon, origin, dir, targetId) => this.sendMg5Shoot(weapon, origin, dir, targetId),
			throwGrenade: (origin, dir, target) => this.sendMg5Throw(origin, dir, target),
			carEnter: () => this.sendMg5CarEnter(),
			carExit: () => this.sendMg5CarExit(),
			carState: (report) => this.sendMg5CarState(report),
			reload: () => this.sendMg5Reload(),
			equip: (slot) => this.sendMg5Equip(slot)
		});
		minigame6.setSender({
			position: (x, y, z, yaw) => this.sendMg6Position(x, y, z, yaw),
			shoot: (weapon, origin, dir, targetId) => this.sendMg6Shoot(weapon, origin, dir, targetId),
			throwGrenade: (origin, dir, target) => this.sendMg6Throw(origin, dir, target),
			reload: () => this.sendMg6Reload(),
			equip: (slot) => this.sendMg6Equip(slot)
		});
		minigame7.setSender({
			position: (x, y, z, yaw) => this.sendMg7Position(x, y, z, yaw)
		});
		minigame8.setSender({
			position: (x, y, z, yaw, mode, vy) => this.sendMg8Position(x, y, z, yaw, mode, vy),
			jump: () => this.sendMg8Jump(),
			shoot: (weapon, origin, dir, targetId) => this.sendMg8Shoot(weapon, origin, dir, targetId),
			throwGrenade: (origin, dir, target) => this.sendMg8Throw(origin, dir, target),
			reload: () => this.sendMg8Reload(),
			equip: (slot) => this.sendMg8Equip(slot),
			vehicleEnter: (vehicleId) => this.sendMg8VehicleEnter(vehicleId),
			vehicleExit: () => this.sendMg8VehicleExit(),
			vehicleState: (vehicleId, pose) => this.sendMg8VehicleState(vehicleId, pose)
		});
		clubMusic.setSender({
			add: (url) => this.sendClubMusicAdd(url),
			remove: (trackId) => this.sendClubMusicRemove(trackId),
			select: (trackId) => this.sendClubMusicSelect(trackId),
			play: () => this.sendClubMusicPlay(),
			pause: () => this.sendClubMusicPause(),
			skip: (direction) => this.sendClubMusicSkip(direction),
			ended: (trackId, version) => this.sendClubMusicEnded(trackId, version),
			duration: (trackId, durationMs) => this.sendClubMusicDuration(trackId, durationMs)
		});
	}

	disconnect(): void {
		this.socket?.disconnect();
		this.socket = null;
		this.self = null;
		this.presence = null;
		this.reconnectAttempt = 0;
		this.nextRetryAt = null;
		minigame2.reset();
		paperRolls.reset();
		playerAnimations.reset();
		remotePlayers.reset();
		cars.reset();
		npcs.resetRemote();
		npcs.setSender(null);
		clubMusic.reset();
		clubMusic.setSender(null);
		race.reset();
		minigame5.reset();
		minigame6.reset();
		minigame7.reset();
		minigame8.reset();
		waveInput.reset();
		dmInput.reset();
	}

	cancelReconnect(): void {
		this.disconnect();
	}

	retryNow(): void {
		this.socket?.retryNow();
	}

	/** Broadcasts the equipped skin; safe before the socket is connected. */
	sendPlayerSkin(skin: Player['skin']): boolean {
		return this.socket?.sendPlayerSkin(skin) ?? false;
	}

	/** Broadcasts equipped NFT accessories (crown, ride, weapon variant). */
	sendNftEquip(crown: boolean, ride: string | null, weaponVariant: string | null): boolean {
		return this.socket?.sendNftEquip(crown, ride, weaponVariant) ?? false;
	}

	setAlias(alias: string): void {
		const wasVisible = chat.visible;
		const wasManualHidden = chat.manualHidden;

		this.connect(alias);

		// `connect` resets the chat because it is a new session. When only
		// the name changes we keep whether it was hidden so the panel does not
		// pop up suddenly when pressing «Save».
		chat.visible = wasVisible;
		chat.manualHidden = wasManualHidden;
	}

	get currentLobbyId(): LobbyId | null {
		return this.self?.lobbyId ?? null;
	}

	isInLobby(lobbyId: MinigameLobbyId): boolean {
		return this.self?.lobbyId === lobbyId;
	}

	isInMinigame(): boolean {
		const lobbyId = this.self?.lobbyId;

		return lobbyId !== undefined && lobbyId !== 'global';
	}

	/** Presence record of any online player, in any lobby. */
	playerById(playerId: string): Player | undefined {
		return this.presence?.lobbies
			.flatMap((lobby) => lobby.players)
			.find((player) => player.id === playerId);
	}

	lobbyById(lobbyId: LobbyId): Lobby | undefined {
		return this.presence?.lobbies.find((lobby) => lobby.id === lobbyId);
	}

	/** Activity reported by the server for a mini lobby, when available. */
	statusForLobby(lobbyId: LobbyId): LobbyStatus | null {
		return this.lobbyById(lobbyId)?.status ?? null;
	}

	/** Optimistic UI gate; the server still has the final say. */
	canEnterLobby(lobbyId: LobbyId): boolean {
		return this.statusForLobby(lobbyId)?.canEnter ?? true;
	}

	enterLobby(lobbyId: MinigameLobbyId): void {
		if (!this.socket?.isOpen()) {
			this.reportNotConnected();
			return;
		}

		checkpoints.clear();
		this.socket.enterLobby(lobbyId);
	}

	leaveLobby(): void {
		if (!this.socket?.isOpen()) {
			this.reportNotConnected();
			return;
		}

		checkpoints.clear();
		this.socket.leaveLobby();
	}

	sendChat(text: string): boolean {
		if (!this.socket?.isOpen()) {
			this.reportNotConnected();
			return false;
		}

		return this.socket.sendChat(text);
	}

	sendMg2Position(x: number, y: number, z: number, yaw: number): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendMg2Position(x, y, z, yaw);
	}

	sendMg2Deposit(): boolean {
		if (!this.socket?.isOpen()) {
			this.reportNotConnected();
			return false;
		}

		return this.socket.sendMg2Deposit();
	}

	/** Mummy report (driver only). Does nothing when offline. */
	sendMg2Mummies(mummies: Mg2MummyReport[]): boolean {
		if (!this.socket?.isOpen() || mummies.length === 0) {
			return false;
		}

		return this.socket.sendMg2Mummies(mummies);
	}

	/** Reports that a local paper roll hit a mummy so the room can stun it. */
	sendMg2Stun(mummyId: string): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendMg2Stun(mummyId);
	}

	/** Sends a thrown roll. When offline it stays on the client only. */
	sendPaperRoll(roll: PaperRollState, cannon?: 'front' | 'left' | 'right'): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendThrowRoll(roll, cannon);
	}

	/** Broadcasts the player's rig clip. When offline it stays local. */
	sendPlayerAnimation(animation: HeroAnimation): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendPlayerAnimation(animation);
	}

	/** Reports own position on the world map. Does nothing when offline. */
	sendPlayerPosition(x: number, y: number, z: number, yaw: number): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendPlayerPosition(x, y, z, yaw);
	}

	/** Tells the server that the local dialogue with `npcId` opened or closed. */
	sendNpcDialog(npcId: NpcId, open: boolean): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendNpcDialog(npcId, open);
	}

	sendEnterCar(carId: CarId): boolean {
		if (!this.socket?.isOpen()) {
			this.reportNotConnected();
			return false;
		}

		return this.socket.sendEnterCar(carId);
	}

	sendExitCar(carId: CarId): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendExitCar(carId);
	}

	sendCarState(report: CarStateReport): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendCarState(report);
	}

	sendCarImpact(carId: CarId, impactSpeed: number, cause: CarImpactCause): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendCarImpact(carId, impactSpeed, cause);
	}

	sendEnterBalloon(): boolean {
		if (!this.socket?.isOpen()) {
			this.reportNotConnected();
			return false;
		}

		return this.socket.sendEnterBalloon();
	}

	sendExitBalloon(): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendExitBalloon();
	}

	sendSwitchBalloonSeat(seat: BalloonSeat): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendSwitchBalloonSeat(seat);
	}

	sendBalloonState(report: BalloonStateReport): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendBalloonState(report);
	}

	sendRaceCarState(report: RaceCarStateReport): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendRaceCarState(report);
	}

	sendRaceUseItem(): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendRaceUseItem();
	}

	sendRaceReset(): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendRaceReset();
	}

	sendRaceImpact(impactSpeed: number, cause: CarImpactCause): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendRaceImpact(impactSpeed, cause);
	}

	sendMg5Position(x: number, y: number, z: number, yaw: number): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendMg5Position(x, y, z, yaw);
	}

	sendMg5Shoot(
		weapon: Mg5WeaponId,
		origin: { x: number; y: number; z: number },
		dir: { x: number; y: number; z: number },
		targetId?: string | null
	): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendMg5Shoot(weapon, origin, dir, targetId);
	}

	sendMg5Throw(
		origin: { x: number; y: number; z: number },
		dir: { x: number; y: number; z: number },
		target?: { x: number; z: number }
	): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendMg5Throw(origin, dir, target);
	}

	sendMg5CarEnter(): boolean {
		if (!this.socket?.isOpen()) {
			return this.reportNotConnected();
		}

		return this.socket.sendMg5CarEnter();
	}

	sendMg5CarExit(): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendMg5CarExit();
	}

	sendMg5CarState(report: Parameters<LobbySocket['sendMg5CarState']>[0]): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendMg5CarState(report);
	}

	sendMg5Reload(): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendMg5Reload();
	}

	sendMg5Equip(slot: number): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendMg5Equip(slot);
	}

	sendMg6Position(x: number, y: number, z: number, yaw: number): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendMg6Position(x, y, z, yaw);
	}

	sendMg6Shoot(
		weapon: Mg5WeaponId,
		origin: { x: number; y: number; z: number },
		dir: { x: number; y: number; z: number },
		targetId?: string | null
	): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendMg6Shoot(weapon, origin, dir, targetId);
	}

	sendMg6Throw(
		origin: { x: number; y: number; z: number },
		dir: { x: number; y: number; z: number },
		target?: { x: number; z: number }
	): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendMg6Throw(origin, dir, target);
	}

	sendMg6Reload(): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendMg6Reload();
	}

	sendMg6Equip(slot: number): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendMg6Equip(slot);
	}

	sendMg7Position(x: number, y: number, z: number, yaw: number): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendMg7Position(x, y, z, yaw);
	}

	sendMg8Position(
		x: number,
		y: number,
		z: number,
		yaw: number,
		mode: Mg8Mode,
		vy: number
	): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendMg8Position(x, y, z, yaw, mode, vy);
	}

	sendMg8Jump(): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendMg8Jump();
	}

	sendMg8Shoot(
		weapon: Mg5WeaponId,
		origin: { x: number; y: number; z: number },
		dir: { x: number; y: number; z: number },
		targetId?: string | null
	): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendMg8Shoot(weapon, origin, dir, targetId);
	}

	sendMg8Throw(
		origin: { x: number; y: number; z: number },
		dir: { x: number; y: number; z: number },
		target?: { x: number; z: number }
	): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendMg8Throw(origin, dir, target);
	}

	sendMg8Reload(): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendMg8Reload();
	}

	sendMg8Equip(slot: number): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendMg8Equip(slot);
	}

	sendMg8VehicleEnter(vehicleId: string): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendMg8VehicleEnter(vehicleId);
	}

	sendMg8VehicleExit(): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendMg8VehicleExit();
	}

	sendMg8VehicleState(vehicleId: string, pose: Mg8VehicleReport): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.sendMg8VehicleState(vehicleId, pose);
	}

	// -- club jukebox -------------------------------------------------------

	sendClubMusicAdd(url: string): boolean {
		if (!this.socket?.isOpen()) {
			this.reportNotConnected();
			return false;
		}

		return this.socket.addClubTrack(url);
	}

	sendClubMusicRemove(trackId: string): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.removeClubTrack(trackId);
	}

	sendClubMusicSelect(trackId: string): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.selectClubTrack(trackId);
	}

	sendClubMusicPlay(): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.clubMusicPlay();
	}

	sendClubMusicPause(): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.clubMusicPause();
	}

	sendClubMusicSkip(direction: 1 | -1): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.clubMusicSkip(direction);
	}

	sendClubMusicEnded(trackId: string, version: number): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.clubMusicEnded(trackId, version);
	}

	sendClubMusicDuration(trackId: string, durationMs: number): boolean {
		if (!this.socket?.isOpen()) {
			return false;
		}

		return this.socket.clubMusicDuration(trackId, durationMs);
	}

	ping(): void {
		if (!this.socket?.isOpen()) {
			this.reportNotConnected();
			return;
		}

		this.socket.ping();
	}

	showToast(message: string): void {
		this.toastId += 1;
		this.toast = { id: this.toastId, message };
	}

	dismissToast(): void {
		this.toast = null;
	}

	private reportNotConnected(): boolean {
		this.errorCode = 'NOT_CONNECTED';
		this.error = 'Connect before using the mini lobbies';
		return false;
	}

	/** Keeps the mini-game mirrors tied to the player's lobby. */
	private syncMinigame(player: Player): void {
		minigame2.selfId = player.id;
		paperRolls.selfId = player.id;
		cars.selfId = player.id;
		balloon.selfId = player.id;
		race.selfId = player.id;
		minigame5.selfId = player.id;
		minigame6.selfId = player.id;
		minigame7.selfId = player.id;
		minigame8.selfId = player.id;

		if (player.lobbyId !== 'minigame-2') {
			minigame2.reset();
		}

		if (player.lobbyId !== 'minigame-5') {
			minigame5.reset();
			waveInput.reset();
		}

		if (player.lobbyId !== 'minigame-6') {
			minigame6.reset();
			dmInput.reset();
		}

		if (player.lobbyId !== 'minigame-7') {
			minigame7.reset();
		}

		if (player.lobbyId !== 'minigame-8') {
			minigame8.reset();
		}

		if (player.lobbyId !== 'global') {
			cars.resetDriving();
			balloon.resetDriving();
		}

		if (!isRaceLobbyId(player.lobbyId)) {
			race.resetDriving();
		}
	}
}

export const lobby = new LobbyStore();
