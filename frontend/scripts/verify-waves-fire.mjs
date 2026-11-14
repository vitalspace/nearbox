/**
 * `waves:fire` — comprueba el aliento de fuego del Demon de Barn Siege.
 *
 * El demonio escupe un cono desde la boca que daña por ticks; este check
 * simula la IA con un jugador delante y verifica:
 *   1. el servidor emite `fire-breath` y publica el cono en `mg5-positions`;
 *   2. la boca está a `DEMON_FIRE_MOUTH_HEIGHT` y la dirección va normalizada;
 *   3. el jugador recibe daño durante la llamarada y deja de recibirlo al
 *      expirar;
 *   4. el cono no daña a quien está detrás del demonio.
 *
 * Se ejecuta con Bun porque importa el motor TypeScript directamente.
 */
import {
	ARENA_FLOOR_Y,
	DEMON_FIRE_DURATION_MS,
	DEMON_FIRE_MOUTH_HEIGHT,
	MONSTER_BY_KIND
} from '../src/lib/state/wavesConfig.ts';
import { Waves } from '../src/server/engines/waves.ts';

function fail(message) {
	console.error(`waves:fire ✗ ${message}`);
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

const messages = [];
const port = {
	broadcast: (message) => messages.push(message),
	sendTo: () => {}
};
const waves = new Waves(port, { moveToLobby: () => {} });

waves.onEnter('p1', 'Tester');

// Saltar la cuenta atrás: la simulación empieza directamente en la oleada 5,
// que es la primera que incluye demonios.
waves.phase = 'playing';
waves.wave = 5;
waves.spawnQueue = [];
waves.lastTickAt = 0;

const player = waves.players.get('p1');
player.x = 0;
player.y = ARENA_FLOOR_Y;
player.z = 0;
player.yaw = 0;

const definition = MONSTER_BY_KIND.get('demon');
check(definition?.attack === 'fire', 'la definición del Demon ya no es de fuego');

waves.monsters.set('d1', {
	id: 'd1',
	kind: 'demon',
	health: definition.maxHealth,
	maxHealth: definition.maxHealth,
	x: 0,
	y: ARENA_FLOOR_Y,
	z: 6,
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

const event = messages.find(
	(message) => message.type === 'mg5-event' && message.event.kind === 'fire-breath'
);
check(event, 'el Demon no emitió `fire-breath` con un jugador a 6 m');

const breath = latestPositions(messages)?.breaths?.[0];
check(breath, 'el cono no aparece en `mg5-positions.breaths`');

const mouthY = ARENA_FLOOR_Y + DEMON_FIRE_MOUTH_HEIGHT;
check(
	Math.abs(breath.y - mouthY) <= 0.02,
	`la boca está a ${breath.y} m y debería estar a ${mouthY.toFixed(2)} m`
);
check(
	Math.abs(Math.hypot(breath.dx, breath.dy, breath.dz) - 1) <= 0.01,
	'la dirección del cono no está normalizada'
);

// Avanzar la simulación a 10 Hz durante toda la llamarada.
for (let t = t0 + 100; t <= t0 + DEMON_FIRE_DURATION_MS + 250; t += 100) {
	waves.lastTickAt = t - 100;
	waves.tick(t);
}

const burnedHealth = player.health;
check(burnedHealth < 100, 'el fuego no restó vida al jugador');
check(
	100 - burnedHealth === definition.damage,
	`el fuego hizo ${100 - burnedHealth} de daño y debía hacer exactamente ${definition.damage}`
);

// Al expirar el cono no debe seguir dañando (el demonio aún está en cooldown).
const expiredAt = t0 + DEMON_FIRE_DURATION_MS + 300;
for (let t = expiredAt; t <= expiredAt + 700; t += 100) {
	waves.lastTickAt = t - 100;
	waves.tick(t);
}
check(
	player.health === burnedHealth,
	'el jugador siguió perdiendo vida después de apagarse la llamarada'
);

// El cono solo daña hacia delante: un punto detrás del demonio queda fuera.
check(
	!waves.insideFireCone(breath, 0, ARENA_FLOOR_Y + 1, 7.5, 0.55),
	'el cono dañó a un objetivo situado detrás del Demon'
);

// Golpes débiles (esqueletos de 8 dmg) también deben disparar la reacción de
// daño del cliente; antes solo se avisaba a partir de 20.
const beforeMelee = messages.length;
waves.damagePlayer(player, 8, 'melee', t0 + DEMON_FIRE_DURATION_MS + 1_500);
const meleeHurt = messages
	.slice(beforeMelee)
	.find((message) => message.type === 'mg5-event' && message.event.kind === 'player-hurt');
check(meleeHurt, 'un golpe de 8 de daño no emitió `player-hurt`');
check(meleeHurt.event.amount === 8, '`player-hurt` no lleva el daño del golpe');

console.log(
	`waves:fire ✓ cono desde la boca (${mouthY.toFixed(2)} m), dirección normalizada, ${100 - burnedHealth} de daño en ticks y reacción en golpes débiles`
);
