/**
 * `royale:bots` — simulación masiva de Skyfall Royale.
 *
 *   1. 500 partidas con 12 bots y semillas fijas:
 *      - 1 ganador, puestos únicos 1–12, duración media 240–540 s, ninguna
 *        > 600 s, primera muerte ≥ 45 s.
 *      - todos los bots se mueven, hay loot y ≥ 70 % dispara.
 *      - sin NaN, sin posiciones fuera del mapa ni atascos > 10 s.
 *      - muertes por tormenta/caída.
 *   2. 200 partidas con 1 humano de referencia (error de puntería 1.0°,
 *      rota con la tormenta y recoge loot) + 11 bots:
 *      - win rate del humano entre 15 % y 45 %.
 *      - la tormenta decide ≤ 35 % de las partidas (el ganador no hizo daño).
 *
 * El trabajo se reparte entre varios procesos (`ROYALE_WORKERS`, por defecto
 * `min(8, cpus)`), cada uno con un shard de semillas. Los procesos hijos
 * imprimen un JSON agregado y el padre suma.
 *
 * Se ejecuta con Bun: `bun scripts/verify-royale-bots.mjs`.
 */
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { Royale } from '../src/server/engines/royale.ts';
import { createBotMind } from '../src/server/engines/royaleBots.ts';
import {
	ROYALE_BOT_ANCHORS,
	ROYALE_COUNTDOWN_MS,
	ROYALE_JUMP_WINDOW_MS,
	ROYALE_MAP_BOUNDS,
	ROYALE_MAX_PLAYERS,
	ROYALE_POIS,
	ROYALE_WEAPON_BY_ID,
	ROYALE_WEAPONS,
	mulberry32,
	royaleStormAt,
	royaleZeppelinAt
} from '../src/lib/state/royaleConfig.ts';
import { floorHeightAt, findPath } from '../src/server/engines/royaleNav.ts';
import { hasLineOfSight } from '../src/server/engines/royaleCombat.ts';

const HUMAN_ID = 'ref-human';
const BOT_MATCHES = Number(process.env.ROYALE_BOT_MATCHES ?? 500);
const HUMAN_MATCHES = Number(process.env.ROYALE_HUMAN_MATCHES ?? 200);
const BOT_SEED_BASE = 10_000;
const HUMAN_SEED_BASE = 1_000_000;
const TICK_MS = 100;
const MAX_TICKS = 6_200; // 620 s > 600 s de partida
const ENGAGE_MS = 45_000;

const scriptPath = fileURLToPath(import.meta.url);
const here = dirname(scriptPath);

function fail(message) {
	console.error(`royale:bots ✗ ${message}`);
	process.exit(1);
}

function assert(condition, message) {
	if (!condition) fail(message);
}

function round(value, digits = 1) {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}

function log(message) {
	console.log(`royale:bots ✓ ${message}`);
}

// ---------------------------------------------------------------------------
// Métricas
// ---------------------------------------------------------------------------

function emptyStats() {
	return {
		matches: 0,
		durations: [],
		firstDeathMin: Infinity,
		matchFailures: [],
		nanPositions: 0,
		outOfBounds: 0,
		maxStill: 0,
		maxStillInfo: null,
		moversOk: 0,
		looterMatches: 0,
		firerParticipations: 0,
		botParticipations: 0,
		stormDeaths: 0,
		fellDeaths: 0,
		stormDecisions: 0,
		humanWins: 0,
		earlyHumanEnds: 0,
		humanDeathsByStorm: 0
	};
}

function isFinitePosition(player) {
	return Number.isFinite(player.x) && Number.isFinite(player.y) && Number.isFinite(player.z);
}

function isOutOfBounds(player) {
	const margin = 4;
	return (
		player.x < ROYALE_MAP_BOUNDS.minX - margin ||
		player.x > ROYALE_MAP_BOUNDS.maxX + margin ||
		player.z < ROYALE_MAP_BOUNDS.minZ - margin ||
		player.z > ROYALE_MAP_BOUNDS.maxZ + margin
	);
}

/**
 * Bucle común de una partida. `driveHuman` se llama antes de cada tick para
 * pilotar al humano de referencia. Devuelve las métricas de la partida.
 */
function runMatch(seed, driveHuman) {
	const messages = [];
	const engine = new Royale(
		{
			broadcast: (message) => messages.push(message),
			sendTo: () => {}
		},
		{ moveToLobby: () => {} },
		{ seed, botsEnabled: true }
	);

	let now = 1_700_000_000_000;
	engine.onEnter(HUMAN_ID, driveHuman ? 'Reference' : 'Harness', now);
	now += ROYALE_COUNTDOWN_MS + 1;
	engine.tick(now);
	assert(engine.phaseName === 'playing', `semilla ${seed}: fase ${engine.phaseName}`);

	const start = now;
	const matchStartedAt = now;

	if (!driveHuman) {
		// Producción nunca simula sin humanos: este harness convierte al humano
		// de entrada en el duodécimo bot para medir 500 partidas solo-bots.
		const harness = engine.rawPlayers.find((player) => player.id === HUMAN_ID);
		assert(harness, `semilla ${seed}: falta el humano de entrada`);
		const index = 999;
		const anchor = ROYALE_BOT_ANCHORS[(seed + index * 7) % ROYALE_BOT_ANCHORS.length];
		harness.isBot = true;
		harness.bot = createBotMind(seed, index, anchor, start);
	}

	const brain = driveHuman ? createHumanBrain(seed, start) : null;
	const seen = new Map();
	const movers = new Set();
	const looters = new Set();
	const firers = new Set();
	let firstDeathAt = null;
	let stormDeaths = 0;
	let fellDeaths = 0;
	let lastDeathCause = null;
	let humanDiedByStorm = false;
	let nanPositions = 0;
	let outOfBounds = 0;
	let maxStill = 0;
	let maxStillId = null;
	let ticks = 0;

	while (engine.phaseName === 'playing' && ticks < MAX_TICKS) {
		now += TICK_MS;
		ticks += 1;

		if (brain) brain.tick(engine, now);

		engine.tick(now);

		for (const message of messages.splice(0)) {
			if (message.type !== 'mg8-event') continue;
			const event = message.event;

			if (event.kind === 'player-died') {
				if (event.cause === 'storm') stormDeaths += 1;
				if (event.cause === 'fell') fellDeaths += 1;
				if (event.playerId === HUMAN_ID && event.cause === 'storm') humanDiedByStorm = true;
				lastDeathCause = event.cause;
				if (firstDeathAt === null) firstDeathAt = event.at - start;
			} else if (event.kind === 'loot-taken') {
				looters.add(event.playerId);
			} else if (event.kind === 'shot-fired') {
				firers.add(event.playerId);
			}
		}

		const players = engine.rawPlayers;

		for (const player of players) {
			if (!isFinitePosition(player)) {
				nanPositions += 1;
				continue;
			}
			if (isOutOfBounds(player)) outOfBounds += 1;

			let track = seen.get(player.id);

			if (!track) {
				track = {
					x: player.x,
					z: player.z,
					since: now,
					maxStill: 0,
					travel: 0
				};
				seen.set(player.id, track);
			}

			// Recorrido acumulado en el suelo: un bot que pelea y hace strafe
			// se mueve aunque su desplazamiento neto desde el aterrizaje sea < 5 m.
			if (player.mode === 'ground') {
				const step = Math.hypot(player.x - track.x, player.z - track.z);
				if (step < 5) track.travel += step;
				if (track.travel > 5) movers.add(player.id);
			}

			const moved = Math.hypot(player.x - track.x, player.z - track.z);

			if (moved > 0.05) {
				track.since = now;
				track.maxStill = 0;
			} else {
				track.maxStill = Math.max(track.maxStill, (now - track.since) / 1000);

				if (player.isBot && player.alive && player.mode === 'ground' && now - start >= ENGAGE_MS) {
					if (track.maxStill > maxStill) {
						maxStill = track.maxStill;
						maxStillId = player.id;
					}
				}
			}

			track.x = player.x;
			track.z = player.z;
		}
	}

	assert(ticks < MAX_TICKS, `semilla ${seed}: la partida superó ${MAX_TICKS / 10} s`);
	assert(engine.phaseName === 'results', `semilla ${seed}: no terminó (${engine.phaseName})`);

	const snapshot = engine.buildSnapshot(now);
	const alive = snapshot.players.filter((player) => player.alive).length;
	const placements = snapshot.placements.map((entry) => entry.placement);
	const unique = new Set(placements).size === placements.length;
	const validPlacements =
		placements.length === ROYALE_MAX_PLAYERS &&
		Math.min(...placements) === 1 &&
		Math.max(...placements) === ROYALE_MAX_PLAYERS;
	const winner = snapshot.players.find((player) => player.id === snapshot.winner) ?? null;
	const botParticipations = snapshot.players.filter((player) => player.isBot).length;

	return {
		seed,
		duration: (now - start) / 1000,
		firstDeath: firstDeathAt === null ? null : firstDeathAt / 1000,
		alive,
		winnerIsHuman: snapshot.winner === HUMAN_ID,
		winnerId: snapshot.winner,
		winnerKills: winner?.kills ?? 0,
		winnerDamage: winner?.damage ?? 0,
		uniquePlacements: unique && validPlacements && winner !== null,
		placements,
		winnerPresent: winner !== null,
		nanPositions,
		outOfBounds,
		maxStill,
		maxStillId,
		movers: movers.size,
		looters: looters.size,
		firers: firers.size,
		botParticipations,
		stormDeaths,
		fellDeaths,
		lastDeathCause,
		humanAlive: snapshot.players.find((player) => player.id === HUMAN_ID)?.alive ?? false,
		humanDiedByStorm
	};
}

// ---------------------------------------------------------------------------
// Humano de referencia
// ---------------------------------------------------------------------------

const CENTER_ANCHORS = ROYALE_BOT_ANCHORS.filter((anchor) => Math.hypot(anchor.x, anchor.z) <= 20);

function createHumanBrain(seed, start) {
	const random = mulberry32((seed ^ 0x51ed270b) >>> 0);
	const landing =
		CENTER_ANCHORS[Math.floor(random() * CENTER_ANCHORS.length) % CENTER_ANCHORS.length];

	// Salta cuando el zepelín pasa más cerca del ancla.
	let jumpAt = start + 3_000;
	let closest = Infinity;

	for (let elapsed = 3_000; elapsed <= ROYALE_JUMP_WINDOW_MS - 500; elapsed += 100) {
		const point = royaleZeppelinAt(start, start + elapsed);
		const distance = Math.hypot(point.x - landing.x, point.z - landing.z);
		if (distance < closest) {
			closest = distance;
			jumpAt = start + elapsed;
		}
	}

	const state = {
		jumpAt,
		jumpStartedAt: 0,
		deployed: false,
		path: null,
		pathIndex: 0,
		goal: null,
		relay: null,
		repathAt: 0,
		thinkAt: 0,
		enemyId: null,
		engage: false,
		reactionUntil: 0,
		lastShotAt: 0,
		lastReloadAt: 0,
		lastStrafeAt: 0,
		strafeDir: random() < 0.5 ? -1 : 1,
		lastX: landing.x,
		lastZ: landing.z,
		stuckAt: 0
	};

	const selfOf = (engine) => engine.rawPlayers.find((player) => player.id === HUMAN_ID);

	function setGoal(engine, now, x, z) {
		const self = selfOf(engine);
		if (!self) return;

		const goalChanged = !state.goal || Math.hypot(state.goal.x - x, state.goal.z - z) > 2.5;

		if (!goalChanged && now < state.repathAt) return;

		const floor = floorHeightAt(x, z);
		if (floor === null) {
			state.path = null;
			state.goal = null;
			state.relay = null;
			return;
		}

		if (state.relay && Math.hypot(self.x - state.relay.x, self.z - state.relay.z) <= 3) {
			state.relay = null;
		}

		state.goal = { x, z };
		state.repathAt = now + 1_500;

		const from = { x: self.x, y: self.y, z: self.z };
		const destination = state.relay ?? { x, y: floor, z };
		let path = findPath(from, destination);

		// Ruta directa demasiado larga para el presupuesto de A*: enlaza por
		// el POI que menos desvía (las islas obligan a rodeos de cientos de m).
		if (!path && !state.relay) {
			const relays = ROYALE_POIS.filter(
				(poi) =>
					Math.hypot(poi.x - x, poi.z - z) > 4 && Math.hypot(poi.x - self.x, poi.z - self.z) > 4
			)
				.map((poi) => ({
					poi,
					score: Math.hypot(poi.x - self.x, poi.z - self.z) + Math.hypot(poi.x - x, poi.z - z)
				}))
				.sort((a, b) => a.score - b.score)
				.slice(0, 4);

			for (const { poi } of relays) {
				const relayFloor = floorHeightAt(poi.x, poi.z);
				if (relayFloor === null) continue;

				const relayPath = findPath(from, { x: poi.x, y: relayFloor, z: poi.z });
				if (relayPath && relayPath.length > 0) {
					state.relay = { x: poi.x, z: poi.z };
					path = relayPath;
					break;
				}
			}
		}

		state.path = path;
		state.pathIndex = 1;
	}

	function findSafePoint(storm, self) {
		const next = {
			cx: storm.nextCx,
			cz: storm.nextCz,
			radius: Math.max(0, storm.nextRadius)
		};
		const margin = Math.max(0.75, Math.min(12, next.radius * 0.25));
		const usable = Math.max(0, next.radius - margin);
		const dx = self.x - next.cx;
		const dz = self.z - next.cz;
		const distance = Math.hypot(dx, dz);

		// Fuera del siguiente círculo: apunta a su borde más cercano, no a un
		// punto aleatorio al otro lado del mapa.
		if (distance > usable) {
			const angle = Math.atan2(dz, dx);

			for (const offset of [0, 0.2, -0.2, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2]) {
				const x = next.cx + Math.cos(angle + offset) * usable;
				const z = next.cz + Math.sin(angle + offset) * usable;
				if (floorHeightAt(x, z) !== null) return { x, z };
			}
		}

		// Dentro: patrulla corta para no quedarse parado mientras se cierra.
		for (let attempt = 0; attempt < 32; attempt += 1) {
			const angle = random() * Math.PI * 2;
			const step = 0.6 + random() * Math.min(18, Math.max(0.8, usable));
			const x = self.x + Math.cos(angle) * step;
			const z = self.z + Math.sin(angle) * step;

			if (Math.hypot(x - next.cx, z - next.cz) > usable) continue;
			if (floorHeightAt(x, z) === null) continue;
			return { x, z };
		}

		if (floorHeightAt(next.cx, next.cz) !== null) return { x: next.cx, z: next.cz };
		return null;
	}

	function think(engine, now) {
		const self = selfOf(engine);
		if (!self) return;

		const storm = royaleStormAt(start, now, seed);
		const enemies = engine.rawPlayers.filter(
			(player) => player.alive && player.id !== HUMAN_ID && player.mode === 'ground'
		);

		const outsideSafe = Math.hypot(self.x - storm.cx, self.z - storm.cz) > storm.radius - 10;
		const outsideNext =
			Math.hypot(self.x - storm.nextCx, self.z - storm.nextCz) > storm.nextRadius - 12;
		const closingSoon = storm.endsAt - now <= 22_000;
		const alive = engine.rawPlayers.filter((player) => player.alive).length;

		if (outsideSafe || (closingSoon && outsideNext) || (alive <= 4 && outsideNext)) {
			const point = findSafePoint(storm, self);
			if (point) setGoal(engine, now, point.x, point.z);
			state.enemyId = null;
			state.engage = false;
			return;
		}

		const needsAmmo = self.magAmmo === 0 && self.reserveAmmo < 20;

		if (!needsAmmo) {
			const enemy = nearestEnemy(self, enemies);
			if (enemy) {
				if (state.enemyId !== enemy.id) {
					state.enemyId = enemy.id;
					state.reactionUntil = now + 250 + random() * 250;
				}

				const distance = Math.hypot(enemy.x - self.x, enemy.z - self.z);
				const weapon = bestWeapon(self, distance);
				const definition = ROYALE_WEAPON_BY_ID.get(weapon);

				if (definition && distance <= definition.range) {
					state.engage = true;
					state.path = null;
					state.goal = null;
					state.relay = null;
					return;
				}

				state.engage = false;
				setGoal(engine, now, enemy.x, enemy.z);
				return;
			}
		}

		state.enemyId = null;
		state.engage = false;

		const loot = nearestLoot(self, engine.rawLoot);
		if (loot) {
			setGoal(engine, now, loot.x, loot.z);
			return;
		}

		const point = findSafePoint(storm, self);
		if (point) setGoal(engine, now, point.x, point.z);
	}

	function nearestEnemy(self, enemies) {
		let best = null;
		let bestDistance = Infinity;
		const eye = { x: self.x, y: self.y + 1.2, z: self.z };

		for (const enemy of enemies) {
			const distance = Math.hypot(enemy.x - self.x, enemy.z - self.z);
			if (distance > 55 || distance < 1e-3) continue;
			if (distance >= bestDistance) continue;
			if (!hasLineOfSight(eye, { x: enemy.x, y: enemy.y + 1.2, z: enemy.z })) continue;
			best = enemy;
			bestDistance = distance;
		}

		return best;
	}

	function nearestLoot(self, lootList) {
		let best = null;
		let bestScore = Infinity;

		for (const loot of lootList) {
			if (!loot.available) continue;
			const distance = Math.hypot(loot.x - self.x, loot.z - self.z);
			if (distance > 45) continue;
			if (Math.abs(self.y - loot.y) > 2.5) continue;
			const score = lootScore(self, loot);

			if (score <= 0) continue;
			if (distance / score < bestScore) {
				best = loot;
				bestScore = distance / score;
			}
		}

		return best;
	}

	function lootScore(self, loot) {
		switch (loot.kind) {
			case 'weapon':
				if (!loot.weapon) return 0;
				return self.inventory.has(loot.weapon) ? 12 : 100;
			case 'ammo':
				return self.reserveAmmo < 60 ? 80 : 6;
			case 'shield':
				return self.shield < 60 ? 70 : 0;
			case 'medkit':
				return self.health < 75 ? 90 : 0;
			case 'grenade':
				return self.grenades < 2 ? 30 : 0;
			default:
				return 0;
		}
	}

	function bestWeapon(self, distance) {
		const owned = ROYALE_WEAPONS.filter((weapon) => self.inventory.has(weapon.id));
		if (owned.length === 0) return 'pistol';

		if (distance < 12) {
			const shotgun = owned.find((weapon) => weapon.id === 'shotgun');
			if (shotgun) return 'shotgun';
		}
		if (distance < 30) {
			const smg = owned.find((weapon) => weapon.id === 'smg');
			if (smg) return 'smg';
		}
		if (distance > 30) {
			const rifle = owned.find((weapon) => weapon.id === 'rifle');
			if (rifle) return 'rifle';
		}

		const pistol = owned.find((weapon) => weapon.id === 'pistol');
		return pistol ? 'pistol' : owned.sort((a, b) => b.damage - a.damage)[0].id;
	}

	function move(engine, self, now, speed) {
		let x = self.x;
		let z = self.z;
		let step = speed * 0.1;

		if (state.path) {
			while (step > 0 && state.pathIndex < state.path.length) {
				const point = state.path[state.pathIndex];
				const dx = point.x - x;
				const dz = point.z - z;
				const distance = Math.hypot(dx, dz);

				if (distance <= 0.5) {
					state.pathIndex += 1;
					continue;
				}

				const advance = Math.min(step, distance);
				x += (dx / distance) * advance;
				z += (dz / distance) * advance;
				step -= advance;
				break;
			}

			if (state.pathIndex >= state.path.length) state.path = null;
		} else if (state.goal) {
			const dx = state.goal.x - x;
			const dz = state.goal.z - z;
			const distance = Math.hypot(dx, dz);

			if (distance <= 0.3) {
				state.goal = null;
			} else {
				const advance = Math.min(step, distance);
				x += (dx / distance) * advance;
				z += (dz / distance) * advance;
			}
		}

		const floor = floorHeightAt(x, z);
		if (floor === null) return;

		const yaw = Math.atan2(x - self.x, z - self.z) || self.yaw;
		engine.onPosition(HUMAN_ID, x, floor, z, yaw, 'ground', 0, now);
		state.lastX = x;
		state.lastZ = z;
	}

	function strafe(engine, self, now, enemy) {
		if (now < state.lastStrafeAt + 900) return;
		state.lastStrafeAt = now;

		const yaw = Math.atan2(enemy.x - self.x, enemy.z - self.z);
		const sideX = Math.cos(yaw) * state.strafeDir;
		const sideZ = -Math.sin(yaw) * state.strafeDir;
		const x = self.x + sideX * 1.6;
		const z = self.z + sideZ * 1.6;
		const floor = floorHeightAt(x, z);

		if (floor === null) {
			state.strafeDir *= -1;
			return;
		}

		engine.onPosition(HUMAN_ID, x, floor, z, yaw, 'ground', 0, now);
		state.strafeDir = random() < 0.25 ? -state.strafeDir : state.strafeDir;
	}

	function aimWithError(self, enemy, error) {
		const dx = enemy.x - self.x;
		const dy = enemy.y + 1.1 - (self.y + 1.2);
		const dz = enemy.z - self.z;
		const length = Math.hypot(dx, dy, dz) || 1;
		const base = { x: dx / length, y: dy / length, z: dz / length };
		const angle = error * (random() * 2 - 1);
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);

		return {
			x: base.x * cos - base.z * sin,
			y: base.y,
			z: base.x * sin + base.z * cos
		};
	}

	return {
		jumpAt,
		tick(engine, now) {
			const self = selfOf(engine);
			if (!self || !self.alive) return;

			if (self.mode === 'riding') {
				if (now >= state.jumpAt) {
					engine.onJump(HUMAN_ID, now);
					state.jumpStartedAt = now;
				}
				return;
			}

			if (self.mode === 'skydive' || self.mode === 'glide') {
				if (!state.deployed && (self.y <= 55 || now - state.jumpStartedAt >= 4_500)) {
					state.deployed = true;
				}

				const fall = state.deployed ? 6 : 40;
				const speed = 14;
				let x = self.x;
				let z = self.z;
				const dx = landing.x - x;
				const dz = landing.z - z;
				const distance = Math.hypot(dx, dz);

				if (distance > 0.05) {
					const advance = Math.min(distance, speed * 0.1);
					x += (dx / distance) * advance;
					z += (dz / distance) * advance;
				}

				const y = self.y - fall * 0.1;

				if (y <= landing.y) {
					engine.onPosition(HUMAN_ID, landing.x, landing.y, landing.z, 0, 'ground', 0, now);
				} else {
					engine.onPosition(
						HUMAN_ID,
						x,
						y,
						z,
						Math.atan2(dx, dz) || 0,
						state.deployed ? 'glide' : 'skydive',
						-fall,
						now
					);
				}
				return;
			}

			// Suelo.
			if (now >= state.thinkAt) {
				state.thinkAt = now + 300;
				think(engine, now);
			}

			if (self.magAmmo <= 0 && self.reserveAmmo > 0 && now - state.lastReloadAt >= 600) {
				engine.onReload(HUMAN_ID, now);
				state.lastReloadAt = now;
			}

			const enemy =
				state.engage && state.enemyId
					? (engine.rawPlayers.find((player) => player.id === state.enemyId && player.alive) ??
						null)
					: null;

			if (enemy && state.engage) {
				const distance = Math.hypot(enemy.x - self.x, enemy.z - self.z);
				const weapon = bestWeapon(self, distance);
				const definition = ROYALE_WEAPON_BY_ID.get(weapon);

				if (self.weapon !== weapon) {
					const slot = { pistol: 1, shotgun: 2, smg: 3, rifle: 4 }[weapon];
					engine.onEquip(HUMAN_ID, slot);
				} else if (
					definition &&
					self.magAmmo > 0 &&
					now >= state.reactionUntil &&
					now - state.lastShotAt >= (1000 / definition.rate) * 1.02
				) {
					const origin = { x: self.x, y: self.y + 1.2, z: self.z };
					engine.onShoot(
						HUMAN_ID,
						self.weapon,
						origin,
						aimWithError(self, enemy, (1.0 * Math.PI) / 180),
						enemy.id,
						now
					);
					state.lastShotAt = now;
				}

				strafe(engine, self, now, enemy);
				return;
			}

			move(engine, self, now, 8);
		}
	};
}

// ---------------------------------------------------------------------------
// Ejecución de un shard
// ---------------------------------------------------------------------------

function runShard(index, count) {
	const stats = emptyStats();

	const botRuns = [];
	const humanRuns = [];

	for (let match = index; match < BOT_MATCHES; match += count) {
		botRuns.push(BOT_SEED_BASE + match);
	}
	for (let match = index; match < HUMAN_MATCHES; match += count) {
		humanRuns.push(HUMAN_SEED_BASE + match);
	}

	for (const seed of botRuns) {
		const result = runMatch(seed, false);
		stats.matches += 1;
		stats.durations.push(result.duration);
		stats.firstDeathMin = Math.min(
			stats.firstDeathMin,
			result.firstDeath ?? Number.POSITIVE_INFINITY
		);
		stats.nanPositions += result.nanPositions;
		stats.outOfBounds += result.outOfBounds;
		if (result.maxStill > stats.maxStill) {
			stats.maxStill = result.maxStill;
			stats.maxStillInfo = { seed, id: result.maxStillId };
		}
		stats.stormDeaths += result.stormDeaths;
		stats.fellDeaths += result.fellDeaths;
		stats.botParticipations += result.botParticipations;
		stats.firerParticipations += result.firers;
		if (result.movers >= result.botParticipations) stats.moversOk += 1;
		else
			stats.matchFailures.push(
				`semilla ${seed}: solo ${result.movers}/${result.botParticipations} bots se movieron`
			);
		if (result.looters >= 3) stats.looterMatches += 1;
		if (result.winnerKills === 0 && result.winnerDamage === 0) stats.stormDecisions += 1;

		if (!result.uniquePlacements) {
			stats.matchFailures.push(
				`semilla ${seed}: puestos=${JSON.stringify(result.placements)} winner=${result.winnerId} presente=${result.winnerPresent} alive=${result.alive}`
			);
		}
		if (result.duration > 600.01) {
			stats.matchFailures.push(`semilla ${seed}: ${round(result.duration)} s`);
		}
		if (result.firstDeath !== null && result.firstDeath < 44.9) {
			stats.matchFailures.push(`semilla ${seed}: primera muerte a ${round(result.firstDeath)} s`);
		}
	}

	for (const seed of humanRuns) {
		const result = runMatch(seed, true);
		stats.matches += 1;
		stats.durations.push(result.duration);
		stats.nanPositions += result.nanPositions;
		stats.outOfBounds += result.outOfBounds;
		if (result.maxStill > stats.maxStill) {
			stats.maxStill = result.maxStill;
			stats.maxStillInfo = { seed, id: result.maxStillId };
		}
		stats.stormDeaths += result.stormDeaths;
		stats.fellDeaths += result.fellDeaths;
		stats.botParticipations += result.botParticipations;
		stats.firerParticipations += result.firers;
		if (result.winnerKills === 0 && result.winnerDamage === 0) stats.stormDecisions += 1;
		if (result.winnerIsHuman) stats.humanWins += 1;
		if (result.humanDiedByStorm) stats.humanDeathsByStorm += 1;
		if (result.duration < 300 && result.alive > 3) stats.earlyHumanEnds += 1;

		if (!result.uniquePlacements) {
			stats.matchFailures.push(
				`semilla ${seed}: puestos=${JSON.stringify(result.placements)} winner=${result.winnerId} presente=${result.winnerPresent} alive=${result.alive}`
			);
		}
		if (result.duration > 600.01) {
			stats.matchFailures.push(`semilla ${seed}: ${round(result.duration)} s`);
		}
	}

	stats.firstDeathMin = stats.firstDeathMin === Infinity ? null : stats.firstDeathMin;

	console.log(`ROYALE_SHARD ${JSON.stringify({ index, count, ...stats })}`);
}

// ---------------------------------------------------------------------------
// Padre: reparte y agrega
// ---------------------------------------------------------------------------

if (process.env.ROYALE_SHARD) {
	const [index, count] = process.env.ROYALE_SHARD.split('/').map(Number);
	runShard(index, count);
} else {
	const workers = Math.max(
		1,
		Math.min(
			8,
			availableParallelism(),
			Number(process.env.ROYALE_WORKERS ?? 8),
			Math.max(BOT_MATCHES, HUMAN_MATCHES)
		)
	);

	const label = `${BOT_MATCHES} bot + ${HUMAN_MATCHES} humano de referencia en ${workers} proceso(s)`;
	console.log(`royale:bots · ${label}`);

	const started = performance.now();

	const shards = Array.from({ length: workers }, (_, index) => index);
	const results = await Promise.all(
		shards.map(
			(index) =>
				new Promise((resolve, reject) => {
					const child = spawn(process.execPath, [scriptPath], {
						cwd: here,
						env: {
							...process.env,
							ROYALE_SHARD: `${index}/${workers}`
						},
						stdio: ['ignore', 'pipe', 'pipe']
					});

					let stdout = '';
					let stderr = '';
					child.stdout.on('data', (chunk) => {
						stdout += chunk;
					});
					child.stderr.on('data', (chunk) => {
						stderr += chunk;
					});
					child.on('error', reject);
					child.on('close', (code) => {
						if (code !== 0) {
							reject(new Error(`shard ${index} terminó con ${code}\n${stderr}`));
							return;
						}

						const line = stdout.split('\n').find((entry) => entry.startsWith('ROYALE_SHARD '));

						if (!line) {
							reject(new Error(`shard ${index} sin resultado\n${stdout}\n${stderr}`));
							return;
						}

						resolve(JSON.parse(line.slice('ROYALE_SHARD '.length)));
					});
				})
		)
	);

	const totals = emptyStats();
	totals.firstDeathMin = Infinity;

	for (const shard of results) {
		totals.matches += shard.matches;
		totals.durations.push(...shard.durations);
		if (shard.firstDeathMin !== null) {
			totals.firstDeathMin = Math.min(totals.firstDeathMin, shard.firstDeathMin);
		}
		totals.nanPositions += shard.nanPositions;
		totals.outOfBounds += shard.outOfBounds;
		if (shard.maxStill > totals.maxStill) {
			totals.maxStill = shard.maxStill;
			totals.maxStillInfo = shard.maxStillInfo;
		}
		totals.moversOk += shard.moversOk;
		totals.looterMatches += shard.looterMatches;
		totals.firerParticipations += shard.firerParticipations;
		totals.botParticipations += shard.botParticipations;
		totals.stormDeaths += shard.stormDeaths;
		totals.fellDeaths += shard.fellDeaths;
		totals.stormDecisions += shard.stormDecisions;
		totals.humanWins += shard.humanWins;
		totals.earlyHumanEnds += shard.earlyHumanEnds;
		totals.humanDeathsByStorm += shard.humanDeathsByStorm;
		totals.matchFailures.push(...shard.matchFailures);
	}

	const elapsed = (performance.now() - started) / 1000;
	const durations = totals.durations;
	const average = durations.reduce((sum, value) => sum + value, 0) / durations.length;
	const sorted = [...durations].sort((a, b) => a - b);
	const median = sorted[Math.floor(sorted.length / 2)];
	const humanWinRate = totals.humanWins / HUMAN_MATCHES;
	const stormRate = totals.stormDecisions / totals.matches;
	const fireRate = totals.firerParticipations / Math.max(1, totals.botParticipations);

	assert(totals.matchFailures.length === 0, totals.matchFailures.slice(0, 5).join('; '));
	assert(totals.matches === BOT_MATCHES + HUMAN_MATCHES, `partidas=${totals.matches}`);
	assert(totals.nanPositions === 0, `${totals.nanPositions} posiciones NaN`);
	assert(totals.outOfBounds === 0, `${totals.outOfBounds} posiciones fuera del mapa`);
	assert(totals.maxStill <= 10.01, `atasco máximo ${round(totals.maxStill)} s > 10 s`);
	assert(
		totals.moversOk === BOT_MATCHES,
		`${totals.moversOk}/${BOT_MATCHES} partidas con todos los bots moviéndose`
	);
	assert(
		totals.looterMatches >= BOT_MATCHES * 0.98,
		`${totals.looterMatches}/${BOT_MATCHES} partidas con loot`
	);
	assert(fireRate >= 0.7, `solo el ${round(fireRate * 100)} % de los bots disparó`);
	assert(
		totals.firstDeathMin === null || totals.firstDeathMin >= 44.9,
		`primera muerte a ${round(totals.firstDeathMin)} s`
	);
	assert(average >= 240 && average <= 540, `duración media ${round(average)} s fuera de 240–540 s`);
	assert(median <= 600.01, `mediana ${round(median)} s > 600 s`);
	assert(Math.max(...durations) <= 600.01, `partida de ${round(Math.max(...durations))} s > 600 s`);
	assert(
		humanWinRate >= 0.15 && humanWinRate <= 0.45,
		`win rate humano ${round(humanWinRate * 100)} %`
	);
	assert(stormRate <= 0.35, `la tormenta decidió el ${round(stormRate * 100)} % de las partidas`);
	assert(
		totals.earlyHumanEnds === 0,
		`${totals.earlyHumanEnds} partidas humanas < 300 s con > 3 vivos`
	);
	assert(totals.stormDeaths + totals.fellDeaths > 0, 'no hubo muertes por tormenta ni por caída');

	log(
		`${BOT_MATCHES}+${HUMAN_MATCHES} partidas en ${round(elapsed)} s — ` +
			`media ${round(average)} s, mediana ${round(median)} s, ` +
			`primera muerte ${round(totals.firstDeathMin ?? 0)} s`
	);
	log(
		`bots: ${round(fireRate * 100)} % dispara, atascos ≤ ${round(totals.maxStill)} s, ` +
			`muertes tormenta ${totals.stormDeaths} / caída ${totals.fellDeaths}`
	);
	log(
		`humano de referencia: ${round(humanWinRate * 100)} % victorias; ` +
			`tormenta decide ${round(stormRate * 100)} %`
	);
	console.log('royale:bots ✓ todo correcto');
}
