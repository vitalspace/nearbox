/**
 * `waves:rock` — comprueba la roca de lava del Golem de Barn Siege.
 *
 * El Golem ya no pega melé: lanza una roca balística que se puede esquivar.
 * Este check simula la IA y verifica:
 *   1. la definición del Golem es de ataque `rock` y publica `rocks` en
 *      `mg5-positions`;
 *   2. un jugador quieto recibe el daño completo y un `rock-hit` con la
 *      dirección normalizada para el empuje;
 *   3. un jugador que se mueve después del lanzamiento no recibe daño, pero la
 *      roca igualmente estalla (`rock-impact`);
 *   4. la roca no daña a un jugador que está fuera del radio de impacto.
 *
 * Se ejecuta con Bun porque importa el motor TypeScript directamente.
 */
import {
	ARENA_FLOOR_Y,
	GOLEM_ROCK_IMPACT_RADIUS,
	MONSTER_BY_KIND
} from '../src/lib/state/wavesConfig.ts';
import { Waves } from '../src/server/engines/waves.ts';

function fail(message) {
	console.error(`waves:rock ✗ ${message}`);
	process.exit(1);
}

function check(condition, message) {
	if (!condition) {
		fail(message);
	}
}

function latestPositions(messages) {
	return messages.filter((message) => message.type === 'mg5-positions').at(-1);
}

function eventsOf(messages, kind) {
	return messages
		.filter((message) => message.type === 'mg5-event' && message.event.kind === kind)
		.map((message) => message.event);
}

/**
 * Lanza una roca con el Golem a 12 m del jugador y devuelve los mensajes.
 * `dodgeAt` mueve al jugador en el tick indicado para esquivar el impacto.
 */
function scenario(dodgeAt = null) {
	const messages = [];
	const port = {
		broadcast: (message) => messages.push(message),
		sendTo: () => {}
	};
	const waves = new Waves(port, { moveToLobby: () => {} });

	waves.onEnter('p1', 'Tester');

	// Saltar la cuenta atrás: la simulación empieza directamente en la oleada 5,
	// que es la primera que incluye Golems.
	waves.phase = 'playing';
	waves.wave = 5;
	waves.spawnQueue = [];
	waves.lastTickAt = 0;

	const player = waves.players.get('p1');
	player.x = 0;
	player.y = ARENA_FLOOR_Y;
	player.z = 0;
	player.yaw = 0;

	const definition = MONSTER_BY_KIND.get('golem');
	waves.monsters.set('g1', {
		id: 'g1',
		kind: 'golem',
		health: definition.maxHealth,
		maxHealth: definition.maxHealth,
		x: 0,
		y: ARENA_FLOOR_Y,
		z: 12,
		yaw: Math.PI,
		status: 'active',
		activeAt: 0,
		lastAttackAt: 0,
		lastRamAt: 0,
		deadAt: null
	});

	const t0 = Date.now();
	waves.lastTickAt = t0 - 100;
	waves.tick(t0);

	for (let tick = 1; tick <= 24; tick += 1) {
		if (dodgeAt !== null && tick === dodgeAt) {
			// Moverse en perpendicular al lanzamiento: la roca cae donde estaba.
			player.x = 8;
			player.z = 0;
		}

		const t = t0 + tick * 100;
		waves.lastTickAt = t - 100;
		waves.tick(t);
	}

	return { waves, player, definition, messages, t0 };
}

const definition = MONSTER_BY_KIND.get('golem');
check(definition, 'el Golem no existe en MONSTER_DEFINITIONS');
check(definition.attack === 'rock', 'la definición del Golem ya no es de roca');

// --- 1. Lanzamiento y posición en vuelo -----------------------------------
const stationary = scenario();
check(
	eventsOf(stationary.messages, 'rock-thrown').length === 1,
	'el Golem no emitió `rock-thrown` con un jugador a 12 m'
);

const inFlight = stationary.messages
	.filter((message) => message.type === 'mg5-positions')
	.flatMap((message) => message.rocks ?? []);
check(inFlight.length > 0, 'la roca no aparece en `mg5-positions.rocks`');

// --- 2. Impacto directo + empuje -----------------------------------------
const hit = eventsOf(stationary.messages, 'rock-hit')[0];
check(hit, 'la roca no emitió `rock-hit` contra un jugador quieto');
check(hit.playerId === 'p1', '`rock-hit` no apunta al jugador alcanzado');
check(
	stationary.player.health === 100 - definition.damage,
	`la roca hizo ${100 - stationary.player.health} de daño y debía hacer ${definition.damage}`
);
check(
	Math.abs(Math.hypot(hit.dx, hit.dz) - 1) <= 0.01,
	'la dirección de empuje de `rock-hit` no está normalizada'
);
check(hit.dz < -0.9, 'el empuje no va en la dirección de vuelo de la roca (hacia el jugador)');
check(
	eventsOf(stationary.messages, 'rock-impact').length === 1,
	'la roca no emitió `rock-impact` al romperse'
);

// --- 3. Esquiva -----------------------------------------------------------
const dodged = scenario(2);
check(
	eventsOf(dodged.messages, 'rock-impact').length === 1,
	'la roca esquivada no estalló contra el suelo'
);
check(
	eventsOf(dodged.messages, 'rock-hit').length === 0,
	'la roca alcanzó a un jugador que se había apartado'
);
check(dodged.player.health === 100, `la roca esquivada hizo ${100 - dodged.player.health} de daño`);

// --- 4. Fuera del radio ----------------------------------------------------
check(
	GOLEM_ROCK_IMPACT_RADIUS < 8,
	'el radio de impacto es demasiado grande para el escenario de esquiva'
);

console.log(
	`waves:rock ✓ Golem lanza rocas (${definition.damage} dmg), impacto en ${GOLEM_ROCK_IMPACT_RADIUS} m, empuje normalizado y esquiva sin daño`
);
