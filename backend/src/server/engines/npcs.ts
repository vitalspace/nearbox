import { NPC_DEFINITIONS, type NpcId } from '../../lib/npcs/npcConfig';
import { NPC_ROUTES } from '../../lib/npcs/npcRoutes';
import { createAgent, hashString, updateAgent, type NpcAgent } from '../../lib/npcs/npcAgent';
import type { NpcState, Player, ServerMessage } from '../protocol';
import type { RoomPort } from '../port';

/**
 * Los nueve NPC humanos del lobby exterior, simulados por el servidor.
 *
 * El cliente ya no decide dónde está cada NPC: el servidor avanza las mismas
 * rutas y pausas que antes corrían en local y publica un snapshot a 10 Hz. Así
 * todos los jugadores ven al mismo NPC en el mismo sitio y los gestos (saludos,
 * visitas, el descanso de Elías) son coherentes entre clientes.
 *
 * La altura exacta sigue siendo una corrección del cliente: aquí solo se usa
 * `route.groundY` porque el servidor no tiene el trimesh del mapa.
 */

const TICK_DELTA_MAX = 0.25;
/** Una posición de jugador más vieja que esto no cuenta para saludos. */
const POSITION_STALE_MS = 15_000;

type NpcsDeps = {
	/** Jugadores presentes en el lobby exterior. */
	listGlobal: () => Player[];
	/** Logger opcional de la sala. */
	log?: (event: string, data: Record<string, unknown>) => void;
};

type PlayerPosition = {
	x: number;
	y: number;
	z: number;
	at: number;
};

function round(value: number): number {
	return Math.round(value * 1000) / 1000;
}

export class Npcs {
	private agents: NpcAgent[] = [];
	private readonly positions = new Map<string, PlayerPosition>();
	/** Jugadores con el diálogo abierto, por NPC. */
	private readonly talking = new Map<NpcId, Set<string>>();
	private lastTickAt = 0;

	constructor(
		private readonly port: RoomPort,
		private readonly deps: NpcsDeps,
	) {
		this.reset();
	}

	reset(now = Date.now()): void {
		this.agents = NPC_DEFINITIONS.map((definition) =>
			createAgent(definition, NPC_ROUTES[definition.routeId], hashString(definition.id)),
		);
		this.positions.clear();
		this.talking.clear();
		this.lastTickAt = now;
	}

	snapshot(now = Date.now()): Extract<ServerMessage, { type: 'npcs-state' }> {
		return {
			type: 'npcs-state',
			serverTime: now,
			npcs: this.buildSnapshot(now),
		};
	}

	buildSnapshot(now = Date.now()): NpcState[] {
		return this.agents.map((agent) => ({
			id: agent.id,
			x: round(agent.x),
			y: round(agent.y),
			z: round(agent.z),
			yaw: round(agent.yaw),
			clip: agent.clip,
			gesture: agent.gesture,
			gestureSeq: agent.gestureSeq,
			updatedAt: now,
		}));
	}

	/** Posición de los jugadores del lobby, usada por saludos y diálogos. */
	onPlayerPosition(playerId: string, x: number, y: number, z: number, now = Date.now()): void {
		this.positions.set(playerId, { x, y, z, at: now });
	}

	/**
	 * Un jugador abre o cierra el diálogo de un NPC. Mientras haya alguno
	 * abierto, el NPC se detiene y mira al jugador que lo inició.
	 */
	onDialog(playerId: string, npcId: NpcId, open: boolean, now = Date.now()): void {
		let players = this.talking.get(npcId);

		if (open) {
			if (!players) {
				players = new Set();
				this.talking.set(npcId, players);
			}

			players.add(playerId);
			// Wake Elías immediately instead of waiting for the next tick.
			this.tick(now);
			return;
		}

		if (!players) {
			return;
		}

		players.delete(playerId);

		if (players.size === 0) {
			this.talking.delete(npcId);
		}

		this.tick(now);
	}

	onPlayerLeave(playerId: string): void {
		this.positions.delete(playerId);

		for (const [npcId, players] of this.talking) {
			if (!players.delete(playerId)) {
				continue;
			}

			if (players.size === 0) {
				this.talking.delete(npcId);
			}
		}
	}

	tick(now = Date.now()): void {
		const delta = Math.min(Math.max((now - this.lastTickAt) / 1000, 0), TICK_DELTA_MAX);

		this.lastTickAt = now;

		const players = this.freshPlayers(now);
		const positions = new Map(players.map((player) => [player.id, player]));

		for (const agent of this.agents) {
			const talking = this.talking.get(agent.id);
			const focus = talking?.size ? this.focusFor(talking, positions) : null;
			const nearest = focus ?? this.nearestPlayer(agent, players);

			updateAgent(agent, {
				delta,
				nowMs: now,
				playerActive: nearest !== null,
				playerX: nearest?.x ?? 0,
				playerZ: nearest?.z ?? 0,
				dialog: talking !== undefined && talking.size > 0,
				others: this.agents,
			});
		}

		this.port.broadcast(this.snapshot(now));
	}

	private freshPlayers(now: number): Array<{ id: string } & PlayerPosition> {
		const online = new Set(this.deps.listGlobal().map((player) => player.id));
		const fresh: Array<{ id: string } & PlayerPosition> = [];

		for (const [playerId, position] of this.positions) {
			if (!online.has(playerId)) {
				continue;
			}

			if (now - position.at > POSITION_STALE_MS) {
				continue;
			}

			fresh.push({ id: playerId, ...position });
		}

		return fresh;
	}

	private focusFor(
		players: Set<string>,
		positions: Map<string, PlayerPosition>,
	): PlayerPosition | null {
		for (const playerId of players) {
			const position = positions.get(playerId);

			if (position) {
				return position;
			}
		}

		return null;
	}

	private nearestPlayer(
		agent: NpcAgent,
		players: Array<{ id: string } & PlayerPosition>,
	): PlayerPosition | null {
		let best: PlayerPosition | null = null;
		let bestDistance = Infinity;

		for (const player of players) {
			const distance = Math.hypot(player.x - agent.x, player.z - agent.z);

			if (distance < bestDistance) {
				best = player;
				bestDistance = distance;
			}
		}

		return best;
	}

	/** Para tests y depuración: estado resumido de los agentes. */
	debugState(): Array<{
		id: NpcId;
		x: number;
		z: number;
		clip: string;
		gestureSeq: number;
	}> {
		return this.agents.map((agent) => ({
			id: agent.id,
			x: round(agent.x),
			z: round(agent.z),
			clip: agent.clip,
			gestureSeq: agent.gestureSeq,
		}));
	}
}
