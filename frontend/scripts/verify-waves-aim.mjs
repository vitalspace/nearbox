/**
 * `waves:aim` — poderes de los monstruos contra un jugador en movimiento.
 *
 * El bug reportado era que corriendo (y saltando) se podía atravesar el
 * ácido y la roca sin recibir daño: el servidor apuntaba al punto exacto del
 * lanzamiento y el proyectil se quedaba atrás. Este check simula posiciones
 * reportadas a 10 Hz, igual que `WaveSession.svelte`, y verifica:
 *   1. correr en línea recta ya no concede inmunidad (ácido y roca conectan);
 *   2. saltar mientras se corre tampoco evade el impacto;
 *   3. parado se recibe el daño (regresión del comportamiento original);
 *   4. cambiar de dirección tras el lanzamiento sí esquiva (la habilidad
 *      sigue existiendo, pero hay que moverse con intención).
 *
 * Se ejecuta con Bun porque importa el motor TypeScript directamente.
 */
import { ARENA_FLOOR_Y, GOLEM_ROCK_DAMAGE, MONSTER_BY_KIND } from '../src/lib/state/wavesConfig.ts';
import { Waves } from '../src/server/engines/waves.ts';

function fail(message) {
	console.error(`waves:aim ✗ ${message}`);
	process.exit(1);
}

function check(condition, message) {
	if (!condition) {
		fail(message);
	}
}

function eventsOf(messages, kind) {
	return messages
		.filter((message) => message.type === 'mg5-event' && message.event.kind === kind)
		.map((message) => message.event);
}

/**
 * Simula 2.5 s de juego con el monstruo indicado. `path(elapsed)` devuelve la
 * posición que el cliente reportaría en ese instante.
 */
function scenario({ kind, monsterX, monsterZ, path, seconds = 2.5 }) {
	const messages = [];
	const waves = new Waves(
		{ broadcast: (message) => messages.push(message), sendTo: () => {} },
		{ moveToLobby: () => {} }
	);

	waves.onEnter('p1', 'Tester');
	waves.phase = 'playing';
	waves.wave = 5;
	waves.spawnQueue = [];
	waves.lastTickAt = 0;

	const player = waves.players.get('p1');
	const definition = MONSTER_BY_KIND.get(kind);
	const t0 = 100000;

	waves.monsters.set('d1', {
		id: 'd1',
		kind,
		health: definition.maxHealth,
		maxHealth: definition.maxHealth,
		x: monsterX,
		y: ARENA_FLOOR_Y,
		z: monsterZ,
		yaw: Math.PI,
		status: 'active',
		activeAt: 0,
		// Primer ataque 150 ms después de empezar a movernos: para entonces el
		// servidor ya recibió dos posiciones y conoce la velocidad real.
		lastAttackAt: t0 + 150 - definition.cooldownMs,
		lastRamAt: 0,
		deadAt: null
	});

	// Calentamiento: reporta la posición quieta para que el primer lanzamiento
	// no se descarte como "sin muestra previa".
	for (let t = t0 - 300; t < t0; t += 50) {
		waves.onPosition('p1', 0, ARENA_FLOOR_Y, 0, 0, t);
	}

	waves.lastTickAt = t0 - 50;

	for (let t = t0; t <= t0 + seconds * 1000; t += 50) {
		const sample = path((t - t0) / 1000);

		// Mismo ritmo que el cliente: una posición cada 100 ms.
		if (Math.round((t - t0) / 50) % 2 === 0) {
			waves.onPosition('p1', sample.x, sample.y, sample.z, 0, t);
		}

		waves.lastTickAt = t - 50;
		waves.tick(t);
	}

	return { player, messages, damage: 100 - player.health };
}

const STRAIGHT = (elapsed) => ({ x: elapsed * 6, y: ARENA_FLOOR_Y, z: 0 });
const JUMPING = (elapsed) => {
	// Salto de 1 m (v = 6, g = 18), uno cada 1.2 s.
	const cycle = elapsed % 1.2;
	const height = cycle < 0.666 ? 6 * cycle - 9 * cycle * cycle : 0;
	return { x: elapsed * 6, y: ARENA_FLOOR_Y + height, z: 0 };
};
const REVERSED = (elapsed) => {
	const turnAt = 0.25;
	const x = elapsed <= turnAt ? elapsed * 6 : turnAt * 6 - (elapsed - turnAt) * 6;
	return { x, y: ARENA_FLOOR_Y, z: 0 };
};
const STILL = () => ({ x: 0, y: ARENA_FLOOR_Y, z: 0 });

const GOLEM = { kind: 'golem', monsterX: 8, monsterZ: 9 };
const WITCH = { kind: 'witch', monsterX: 12, monsterZ: 6 };

// --- 1. Correr en línea recta no da inmunidad ------------------------------
const rockRun = scenario({ ...GOLEM, path: STRAIGHT });
check(
	rockRun.damage === GOLEM_ROCK_DAMAGE,
	`corriendo, la roca hizo ${rockRun.damage} de daño y debía hacer ${GOLEM_ROCK_DAMAGE}`
);
check(
	eventsOf(rockRun.messages, 'rock-hit').length === 1,
	'corriendo, la roca no emitió `rock-hit`'
);

const acidRun = scenario({ ...WITCH, path: STRAIGHT });
check(
	acidRun.damage === MONSTER_BY_KIND.get('witch').damage,
	`corriendo, el ácido hizo ${acidRun.damage} de daño y debía hacer ${MONSTER_BY_KIND.get('witch').damage}`
);

// --- 2. Saltar mientras se corre tampoco evade -----------------------------
const rockJump = scenario({ ...GOLEM, path: JUMPING });
check(
	rockJump.damage === GOLEM_ROCK_DAMAGE,
	`saltando, la roca hizo ${rockJump.damage} de daño y debía hacer ${GOLEM_ROCK_DAMAGE}`
);

// --- 3. Parado sigue recibiendo el daño ------------------------------------
const rockStill = scenario({ ...GOLEM, path: STILL });
check(
	rockStill.damage === GOLEM_ROCK_DAMAGE,
	`parado, la roca hizo ${rockStill.damage} de daño y debía hacer ${GOLEM_ROCK_DAMAGE}`
);

// --- 4. Cambiar de dirección tras el lanzamiento sí esquiva -----------------
const rockDodge = scenario({ ...GOLEM, path: REVERSED });
check(
	rockDodge.damage === 0,
	`la roca alcanzó a un jugador que cambió de dirección (${rockDodge.damage} dmg)`
);

const acidDodge = scenario({ ...WITCH, path: REVERSED });
check(
	acidDodge.damage === 0,
	`el ácido alcanzó a un jugador que cambió de dirección (${acidDodge.damage} dmg)`
);

console.log(
	'waves:aim ✓ correr/saltar ya no inmuniza contra ácido y roca; cambiar de dirección sigue esquivando'
);
