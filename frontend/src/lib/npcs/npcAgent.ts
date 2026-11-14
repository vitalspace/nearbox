import type { NpcClip } from './npcAnimations';
import {
	NPC_GREETING_COOLDOWN_MS,
	NPC_GREETING_RADIUS,
	type NpcDefinition,
	type NpcId
} from './npcConfig';
import { lanePosition, routeWaypoint, type NpcRoute } from './npcRoutes';

export type NpcAgentPhase = 'walking' | 'pausing' | 'visiting' | 'resting';
export type NpcRestStage = 'sit' | 'sleep';

export type NpcAgent = {
	id: NpcId;
	definition: NpcDefinition;
	route: NpcRoute;
	x: number;
	/** Feet height; the population corrects it from the ground raycast. */
	y: number;
	z: number;
	yaw: number;
	targetIndex: number;
	phase: NpcAgentPhase;
	/** Seconds left in the current pause/visit/rest. */
	phaseRemaining: number;
	clip: NpcClip;
	gesture: NpcClip | null;
	gestureSeq: number;
	resting: boolean;
	restStage: NpcRestStage | null;
	rng: () => number;
	lastGreetingAt: number;
	playerWasNear: boolean;
};

export type NpcAgentContext = {
	delta: number;
	nowMs: number;
	playerActive: boolean;
	playerX: number;
	playerZ: number;
	/** The dialogue with this NPC is open: stop and face the player. */
	dialog: boolean;
	others: readonly NpcAgent[];
};

const TURN_RATE = 7;
const PLAYER_AVOID_RADIUS = 1.2;
const AGENT_AVOID_RADIUS = 0.7;
const ARRIVE_EPSILON = 0.04;

const AMBIENT_GESTURES: readonly NpcClip[] = ['wave', 'talk', 'yes', 'no', 'thanks'];

/** FNV-1a: stable seed per NPC id, no `Math.random()`. */
export function hashString(value: string): number {
	let hash = 2166136261;

	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}

	return hash >>> 0;
}

/** Small deterministic PRNG used for pauses and gestures. */
export function mulberry32(seed: number): () => number {
	let state = seed >>> 0;

	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

function randomRange(agent: NpcAgent, min: number, max: number): number {
	return min + agent.rng() * (max - min);
}

function smoothYaw(current: number, target: number, delta: number, rate = TURN_RATE): number {
	const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));

	return current + difference * (1 - Math.exp(-rate * delta));
}

function targetPosition(agent: NpcAgent): { x: number; z: number } {
	return lanePosition(routeWaypoint(agent.route, agent.targetIndex), agent.definition.lane);
}

function emitGesture(agent: NpcAgent, gesture: NpcClip): void {
	agent.gesture = gesture;
	agent.gestureSeq += 1;
}

function startVisit(agent: NpcAgent, waypoint: { pause?: [number, number] }): void {
	const [minMs, maxMs] = waypoint.pause ?? [3500, 7000];

	agent.phase = 'visiting';
	agent.phaseRemaining = randomRange(agent, minMs, maxMs) / 1000;

	if (agent.rng() < 0.32) {
		const gesture = AMBIENT_GESTURES[Math.floor(agent.rng() * AMBIENT_GESTURES.length)]!;

		if (gesture === 'talk') {
			agent.clip = 'talk';
			return;
		}

		agent.clip = 'idle';
		emitGesture(agent, gesture);
		return;
	}

	agent.clip = 'idle';
}

function startRest(agent: NpcAgent): void {
	agent.resting = true;
	agent.restStage = 'sit';
	agent.phase = 'resting';
	agent.phaseRemaining = randomRange(agent, 8, 12);
	agent.clip = 'sit';
}

function arrive(agent: NpcAgent): void {
	const arrivedIndex = agent.targetIndex;
	const waypoint = routeWaypoint(agent.route, arrivedIndex);
	const position = lanePosition(waypoint, agent.definition.lane);

	agent.x = position.x;
	agent.z = position.z;
	agent.targetIndex = (arrivedIndex + 1) % agent.route.waypoints.length;

	const visit = waypoint.visit;
	const allowed =
		visit !== undefined &&
		(agent.definition.visits === undefined || agent.definition.visits.includes(visit));

	if (allowed && agent.definition.restAt === visit) {
		startRest(agent);
		return;
	}

	if (allowed) {
		startVisit(agent, waypoint);
		return;
	}

	if (waypoint.pause) {
		agent.phase = 'pausing';
		agent.phaseRemaining = randomRange(agent, waypoint.pause[0], waypoint.pause[1]) / 1000;
		agent.clip = 'idle';
	}
}

/**
 * Pure agent brain: movement, pauses, visits, rests and simple avoidance.
 * It never touches the DOM, Three.js or the reactive store so the offline
 * validator can run the same simulation with Bun.
 */
export function createAgent(
	definition: NpcDefinition,
	route: NpcRoute,
	seed = hashString(definition.id)
): NpcAgent {
	const startIndex =
		((definition.startIndex % route.waypoints.length) + route.waypoints.length) %
		route.waypoints.length;
	const start = lanePosition(routeWaypoint(route, startIndex), definition.lane);
	const nextIndex = (startIndex + 1) % route.waypoints.length;
	const next = lanePosition(routeWaypoint(route, nextIndex), definition.lane);
	const yaw = Math.atan2(next.x - start.x, next.z - start.z);

	return {
		id: definition.id,
		definition,
		route,
		x: start.x,
		y: route.groundY,
		z: start.z,
		yaw: Number.isFinite(yaw) ? yaw : 0,
		targetIndex: nextIndex,
		phase: 'walking',
		phaseRemaining: 0,
		clip: 'walk',
		gesture: null,
		gestureSeq: 0,
		resting: false,
		restStage: null,
		rng: mulberry32(seed),
		lastGreetingAt: -Infinity,
		playerWasNear: false
	};
}

export function updateAgent(agent: NpcAgent, context: NpcAgentContext): void {
	const delta = Math.min(Math.max(context.delta, 0), 0.1);
	const playerDx = context.playerX - agent.x;
	const playerDz = context.playerZ - agent.z;
	const playerDistance = Math.hypot(playerDx, playerDz);

	if (context.dialog) {
		agent.yaw = smoothYaw(agent.yaw, Math.atan2(playerDx, playerDz), delta, 12);
		agent.clip = 'talk';

		// Talking wakes Elías: after the dialogue he stands up and walks on.
		if (agent.resting) {
			agent.resting = false;
			agent.restStage = null;
			agent.phase = 'pausing';
			agent.phaseRemaining = 1.5;
		}

		return;
	}

	if (context.playerActive) {
		const near = playerDistance <= NPC_GREETING_RADIUS;

		if (
			near &&
			!agent.playerWasNear &&
			context.nowMs - agent.lastGreetingAt >= NPC_GREETING_COOLDOWN_MS
		) {
			agent.lastGreetingAt = context.nowMs;
			emitGesture(agent, 'wave');
		}

		agent.playerWasNear = near;
	} else {
		agent.playerWasNear = false;
	}

	if (agent.phase === 'resting') {
		agent.phaseRemaining -= delta;

		if (agent.phaseRemaining > 0) {
			agent.clip = agent.restStage === 'sleep' ? 'sleep' : 'sit';
			return;
		}

		if (agent.restStage === 'sit' && agent.rng() < 0.3) {
			agent.restStage = 'sleep';
			agent.phaseRemaining = randomRange(agent, 15, 25);
			agent.clip = 'sleep';
			return;
		}

		agent.resting = false;
		agent.restStage = null;
		agent.phase = 'walking';
		agent.clip = 'walk';
	}

	if (agent.phase === 'pausing' || agent.phase === 'visiting') {
		agent.phaseRemaining -= delta;

		if (agent.phaseRemaining > 0) {
			return;
		}

		agent.phase = 'walking';
		agent.clip = 'walk';
	}

	const target = targetPosition(agent);
	const dx = target.x - agent.x;
	const dz = target.z - agent.z;
	const distance = Math.hypot(dx, dz);

	if (distance <= ARRIVE_EPSILON) {
		arrive(agent);
		return;
	}

	agent.yaw = smoothYaw(agent.yaw, Math.atan2(dx, dz), delta);

	if (context.playerActive && playerDistance < PLAYER_AVOID_RADIUS) {
		const forwardX = Math.sin(agent.yaw);
		const forwardZ = Math.cos(agent.yaw);
		const facing = (playerDx * forwardX + playerDz * forwardZ) / Math.max(playerDistance, 0.0001);

		if (facing > 0.25) {
			agent.clip = 'idle';
			return;
		}
	}

	let speedScale = 1;

	for (const other of context.others) {
		if (other.id === agent.id) {
			continue;
		}

		const otherDistance = Math.hypot(other.x - agent.x, other.z - agent.z);

		if (otherDistance < AGENT_AVOID_RADIUS) {
			speedScale = 0.35;
			break;
		}
	}

	const step = Math.min(agent.definition.speed * speedScale * delta, distance);

	agent.x += (dx / distance) * step;
	agent.z += (dz / distance) * step;
	agent.clip = 'walk';

	if (distance - step <= ARRIVE_EPSILON) {
		arrive(agent);
	}
}
