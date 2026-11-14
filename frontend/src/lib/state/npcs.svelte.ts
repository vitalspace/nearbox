import { browser } from '$app/env';
import type { NpcClip } from '../npcs/npcAnimations';
import { NPC_BY_ID, NPC_DEFINITIONS, type NpcDefinition, type NpcId } from '../npcs/npcConfig';
import {
	NPC_DIALOGUES,
	getDialogueChoices,
	resolveDialogueStart,
	type NpcChoice,
	type NpcDialogue,
	type NpcDialogueNode,
	type NpcQuest
} from '../npcs/npcDialogues';
import type { NpcState } from '../services/protocol';
import { cars } from './cars.svelte';
import { chat } from './chat.svelte';
import { checkpoints } from './checkpoints.svelte';
import { missions } from './missions.svelte';
import { playerRuntime } from './playerState';
import { ride } from './ride.svelte';
import {
	lerp,
	lerpAngle,
	REMOTE_RENDER_DELAY_MS,
	SampleBuffer,
	ServerClock,
	sameNumber
} from './remoteSync';
import { sceneState } from './sceneState.svelte';

const STORAGE_PREFIX = 'rw:npcs:v1:';
const TOAST_MS = 2600;

export type NpcRenderState = {
	x: number;
	y: number;
	z: number;
	yaw: number;
	clip: NpcClip;
	gesture: NpcClip | null;
	/** Contador de render: sube con cada gesto, local o del servidor. */
	gestureSeq: number;
	/** Último `gestureSeq` recibido del servidor (`null` hasta el primer snapshot). */
	serverGestureSeq: number | null;
};

/** Estado interpolado de un NPC tal y como lo publica el servidor. */
export type NpcVisual = {
	x: number;
	y: number;
	z: number;
	yaw: number;
	clip: NpcClip;
	gesture: NpcClip | null;
	serverGestureSeq: number;
};

export type NpcSender = {
	dialog: (npcId: NpcId, open: boolean) => boolean;
};

/** A teleport (reconnect or first snapshot) must snap instead of sliding. */
const MAX_NPC_SNAP_DISTANCE = 6;

function visualFromState(state: NpcState): NpcVisual {
	return {
		x: state.x,
		y: state.y,
		z: state.z,
		yaw: state.yaw,
		clip: state.clip,
		gesture: state.gesture,
		serverGestureSeq: state.gestureSeq
	};
}

function sameVisual(a: NpcVisual, b: NpcVisual): boolean {
	return (
		sameNumber(a.x, b.x) &&
		sameNumber(a.y, b.y) &&
		sameNumber(a.z, b.z) &&
		sameNumber(a.yaw, b.yaw, 0.000001) &&
		a.clip === b.clip &&
		a.gesture === b.gesture &&
		a.serverGestureSeq === b.serverGestureSeq
	);
}

function mixVisual(a: NpcVisual, b: NpcVisual, t: number): NpcVisual {
	return {
		x: lerp(a.x, b.x, t),
		y: lerp(a.y, b.y, t),
		z: lerp(a.z, b.z, t),
		yaw: lerpAngle(a.yaw, b.yaw, t),
		// Discrete fields switch at the sample boundary, not mid-fade.
		clip: a.clip,
		gesture: a.gesture,
		serverGestureSeq: a.serverGestureSeq
	};
}

export type NpcGestureRequest = {
	id: NpcId;
	gesture: NpcClip;
	seq: number;
};

export type NpcToast = {
	id: number;
	message: string;
};

function emptyRuntime(): Record<NpcId, NpcRenderState> {
	const runtime = {} as Record<NpcId, NpcRenderState>;

	for (const definition of NPC_DEFINITIONS) {
		runtime[definition.id] = {
			x: 0,
			y: 0,
			z: 0,
			yaw: 0,
			clip: 'idle',
			gesture: null,
			gestureSeq: 0,
			serverGestureSeq: null
		};
	}

	return runtime;
}

function isQuest(value: unknown): value is NpcQuest {
	return value === 'none' || value === 'carrying' || value === 'delivered';
}

function storageKey(playerId: string): string {
	return `${STORAGE_PREFIX}${playerId}`;
}

function readQuest(playerId: string): NpcQuest {
	if (!browser) {
		return 'none';
	}

	try {
		const raw = localStorage.getItem(storageKey(playerId));

		if (!raw) {
			return 'none';
		}

		const value: unknown = JSON.parse(raw);

		if (
			typeof value === 'object' &&
			value !== null &&
			isQuest((value as { quest?: unknown }).quest)
		) {
			return (value as { quest: NpcQuest }).quest;
		}
	} catch (error) {
		console.warn('[npcs] Could not read the package quest', error);
	}

	return 'none';
}

function writeQuest(playerId: string, quest: NpcQuest): void {
	if (!browser || !playerId) {
		return;
	}

	try {
		localStorage.setItem(storageKey(playerId), JSON.stringify({ quest, updatedAt: Date.now() }));
	} catch (error) {
		console.warn('[npcs] Could not save the package quest', error);
	}
}

class NpcStore {
	/**
	 * Plain registry of render positions. Kept out of `$state`: it is written by
	 * the population every frame and read by each `NpcCharacter` task, so making
	 * it reactive would re-render the nine components on every tick.
	 */
	readonly runtime: Record<NpcId, NpcRenderState> = emptyRuntime();

	/** Hay snapshots del servidor: la simulación local queda en espera. */
	online = $state(false);

	nearestId = $state<NpcId | null>(null);
	nearestDistance = $state(0);
	dialogNpcId = $state<NpcId | null>(null);
	dialogNodeId = $state<string | null>(null);
	quest = $state<NpcQuest>('none');
	gestureRequest = $state<NpcGestureRequest | null>(null);
	toast = $state<NpcToast | null>(null);

	private playerId: string | null = null;
	private initialized = false;
	private toastId = 0;
	private toastTimer: ReturnType<typeof setTimeout> | undefined;
	private sender: NpcSender | null = null;
	private clock = new ServerClock();
	private buffers = new Map<NpcId, SampleBuffer<NpcVisual>>();

	get dialogOpen(): boolean {
		return this.dialogNpcId !== null;
	}

	get nearestNpc(): NpcDefinition | null {
		return this.nearestId ? (NPC_BY_ID.get(this.nearestId) ?? null) : null;
	}

	get dialogNpc(): NpcDefinition | null {
		return this.dialogNpcId ? (NPC_BY_ID.get(this.dialogNpcId) ?? null) : null;
	}

	get dialog(): NpcDialogue | null {
		const npc = this.dialogNpc;

		return npc ? NPC_DIALOGUES[npc.dialogueId] : null;
	}

	get dialogNode(): NpcDialogueNode | null {
		const dialogue = this.dialog;

		if (!dialogue || !this.dialogNodeId) {
			return null;
		}

		return dialogue.nodes[this.dialogNodeId] ?? null;
	}

	get dialogChoices(): NpcChoice[] {
		const node = this.dialogNode;

		return node ? getDialogueChoices(node, this.quest) : [];
	}

	/**
	 * Cats and checkpoints keep priority. The prompt is also hidden while the
	 * player is frozen, driving, chatting or outside the hub.
	 */
	get canInteract(): boolean {
		return (
			this.nearestId !== null &&
			this.dialogNpcId === null &&
			sceneState.inHub &&
			!chat.isOpen &&
			!cars.isDriving &&
			!ride.isRiding &&
			!playerRuntime.frozen &&
			missions.nearestCatId === null &&
			checkpoints.active === null
		);
	}

	init(playerId: string): void {
		if (!browser || !playerId) {
			return;
		}

		if (this.initialized && this.playerId === playerId) {
			return;
		}

		this.playerId = playerId;
		this.quest = readQuest(playerId);
		this.initialized = true;
	}

	destroy(): void {
		if (this.dialogNpcId) {
			this.sender?.dialog(this.dialogNpcId, false);
		}

		clearTimeout(this.toastTimer);
		this.toast = null;
		this.nearestId = null;
		this.nearestDistance = 0;
		this.dialogNpcId = null;
		this.dialogNodeId = null;
		this.gestureRequest = null;
		this.initialized = false;
		this.playerId = null;
		this.resetRemote();
	}

	setSender(sender: NpcSender | null): void {
		this.sender = sender;
	}

	/**
	 * Stores one authoritative snapshot. Positions are buffered and rendered a
	 * little in the past so the 10 Hz cadence does not look like stepping.
	 */
	applySnapshot(serverTime: number, list: NpcState[]): void {
		this.clock.sync(serverTime, 0.05);
		this.online = true;

		const alive = new Set<NpcId>();

		for (const npc of list) {
			alive.add(npc.id);

			let buffer = this.buffers.get(npc.id);

			if (!buffer) {
				buffer = new SampleBuffer<NpcVisual>(sameVisual);
				this.buffers.set(npc.id, buffer);
			}

			const visual = visualFromState(npc);
			const last = buffer.latest;

			if (
				last &&
				Math.hypot(visual.x - last.value.x, visual.z - last.value.z) > MAX_NPC_SNAP_DISTANCE
			) {
				buffer.clear();
			}

			buffer.push(serverTime, visual);
		}

		for (const id of this.buffers.keys()) {
			if (!alive.has(id)) {
				this.buffers.delete(id);
			}
		}
	}

	/** Interpolated pose of one NPC, or `null` before the first snapshot. */
	sample(id: NpcId): NpcVisual | null {
		const buffer = this.buffers.get(id);

		if (!buffer) {
			return null;
		}

		return (
			buffer.sample(this.clock.now() - REMOTE_RENDER_DELAY_MS, mixVisual) ??
			buffer.latest?.value ??
			null
		);
	}

	/** Drops the remote state so the local simulation can take over again. */
	resetRemote(): void {
		this.online = false;
		this.buffers.clear();
		this.clock.reset();

		for (const state of Object.values(this.runtime)) {
			state.serverGestureSeq = null;
		}
	}

	/** Writes the render state of one NPC (called by the population task). */
	publish(id: NpcId, x: number, y: number, z: number, yaw: number, clip: NpcClip): void {
		const state = this.runtime[id];

		state.x = x;
		state.y = y;
		state.z = z;
		state.yaw = yaw;
		state.clip = clip;
	}

	/**
	 * Applies a gesture produced by the server simulation. The renderer uses a
	 * monotonic counter, so local gestures (dialogue choices, farewells) and
	 * server gestures never overwrite each other.
	 */
	applyServerGesture(id: NpcId, gesture: NpcClip | null, serverSeq: number): void {
		const state = this.runtime[id];

		if (state.serverGestureSeq === null) {
			state.serverGestureSeq = serverSeq;
			return;
		}

		if (serverSeq === state.serverGestureSeq) {
			return;
		}

		state.serverGestureSeq = serverSeq;

		if (!gesture) {
			return;
		}

		state.gesture = gesture;
		state.gestureSeq += 1;
	}

	/** Queues a one-shot gesture for the renderer. */
	emitGesture(id: NpcId, gesture: NpcClip): void {
		const state = this.runtime[id];

		if (!state) {
			return;
		}

		state.gesture = gesture;
		state.gestureSeq += 1;
		this.gestureRequest = { id, gesture, seq: state.gestureSeq };
	}

	setNearest(id: NpcId | null, distance = 0): void {
		if (this.nearestId === id && Math.abs(this.nearestDistance - distance) < 0.01) {
			return;
		}

		this.nearestId = id;
		this.nearestDistance = distance;
	}

	interact(): boolean {
		const npc = this.nearestNpc;

		if (!npc || !this.canInteract) {
			return false;
		}

		this.dialogNpcId = npc.id;
		this.dialogNodeId = resolveDialogueStart(NPC_DIALOGUES[npc.dialogueId], this.quest);
		this.sender?.dialog(npc.id, true);

		if (!this.online) {
			// Online the server freezes the NPC and plays the greeting.
			this.emitGesture(npc.id, 'wave');
		}

		return true;
	}

	choose(choiceId: string): boolean {
		const npc = this.dialogNpc;
		const node = this.dialogNode;

		if (!npc || !node) {
			return false;
		}

		const choice = getDialogueChoices(node, this.quest).find((item) => item.id === choiceId);

		if (!choice) {
			return false;
		}

		if (choice.action === 'give-package') {
			this.setQuest('carrying');
			this.showToast('Package for Mateo');
		} else if (choice.action === 'deliver-package') {
			this.setQuest('delivered');
			this.showToast('Mateo received the package');
		}

		if (choice.action === 'close') {
			this.closeDialog((choice.gesture ?? 'thanks') as NpcClip);
			return true;
		}

		if (choice.gesture) {
			this.emitGesture(npc.id, choice.gesture);
		}

		if (choice.next) {
			const next = NPC_DIALOGUES[npc.dialogueId].nodes[choice.next];

			if (next) {
				this.dialogNodeId = choice.next;
			}
		}

		return true;
	}

	closeDialog(farewell: NpcClip = 'wave'): void {
		const id = this.dialogNpcId;

		this.dialogNpcId = null;
		this.dialogNodeId = null;

		if (id) {
			this.sender?.dialog(id, false);
			this.emitGesture(id, farewell);
		}
	}

	private setQuest(quest: NpcQuest): void {
		if (quest === this.quest) {
			return;
		}

		this.quest = quest;

		if (this.playerId) {
			writeQuest(this.playerId, quest);
		}
	}

	private showToast(message: string): void {
		this.toastId += 1;
		const toast = { id: this.toastId, message };

		this.toast = toast;
		clearTimeout(this.toastTimer);
		this.toastTimer = setTimeout(() => {
			if (this.toast?.id === toast.id) {
				this.toast = null;
			}
		}, TOAST_MS);
	}
}

export const npcs = new NpcStore();
