/**
 * `parkour:aim` — poderes de los guardianes contra un jugador en movimiento.
 *
 * En Parkour no hay daño: los guardianes solo empujan. El bug reportado era
 * que corriendo o saltando se podía atravesar la roca y el ácido sin recibir
 * el empuje, porque el servidor resolvía el impacto en el punto exacto del
 * lanzamiento y el proyectil se quedaba atrás. Este check simula posiciones
 * reportadas a 10 Hz, igual que `ParkourSession.svelte`, y verifica:
 *   1. correr en línea recta ya no concede inmunidad (roca y ácido empujan);
 *   2. saltar mientras se corre tampoco evade el impacto;
 *   3. parado se recibe el empuje (regresión del comportamiento original);
 *   4. cambiar de dirección tras el lanzamiento sí esquiva;
 *   5. el cono de fuego sigue empujando aunque el jugador salte.
 *
 * Se ejecuta con Bun porque importa el motor TypeScript directamente.
 */
import { PARKOUR_START, PARKOUR_WARDENS } from '../src/lib/state/parkourConfig.ts';
import { Parkour } from '../src/server/engines/parkour.ts';

function fail(message) {
	console.error(`parkour:aim ✗ ${message}`);
	process.exit(1);
}

function check(condition, message) {
	if (!condition) {
		fail(message);
	}
}

function shovesOf(messages) {
	return messages
		.filter((message) => message.type === 'mg7-event' && message.event.kind === 'shove')
		.map((message) => message.event);
}

const START = { x: PARKOUR_START.x, y: PARKOUR_START.y, z: PARKOUR_START.z };

/** Copia una definición real y la reubica cerca de la salida para el test. */
function testWarden(kind, distance) {
	const base = PARKOUR_WARDENS.find((warden) => warden.kind === kind);

	if (!base) {
		fail(`no hay guardián de tipo ${kind} en PARKOUR_WARDENS`);
	}

	return {
		...base,
		id: `test-${kind}`,
		x: START.x,
		y: START.y,
		z: START.z + distance
	};
}

/**
 * Simula 3 s de carrera con el guardián indicado. `path(elapsed)` devuelve la
 * posición que el cliente reportaría en ese instante; el ataque se lanza a
 * los 250 ms, cuando el servidor ya recibió dos posiciones y conoce la
 * velocidad real. `power` permite probar el cono de fuego.
 */
function scenario({ warden, path, power = warden.power, seconds = 3 }) {
	const messages = [];
	const parkour = new Parkour(
		{ broadcast: (message) => messages.push(message), sendTo: () => {} },
		{ moveToLobby: () => {} }
	);

	parkour.onEnter('p1', 'Tester', 1_000);
	parkour.phaseValue = 'playing';
	parkour.startedAt = 1_000;
	// Los guardianes reales no participan: el test controla el lanzamiento.
	parkour.updateWardens = () => {};

	const player = parkour.players.get('p1');
	const t0 = 100_000;
	const launchAt = t0 + 250;
	const end = t0 + seconds * 1_000;

	parkour.lastTickAt = t0 - 50;

	for (let t = t0; t <= end; t += 50) {
		const sample = path((t - t0) / 1_000);

		// Mismo ritmo que el cliente: una posición cada 100 ms.
		if (Math.round((t - t0) / 50) % 2 === 0) {
			parkour.onPosition('p1', sample.x, sample.y, sample.z, 0, t);
		}

		parkour.lastTickAt = t - 50;

		if (t === launchAt) {
			parkour.launchAttack({ ...warden, power }, player, t, {
				x: warden.x,
				y: warden.y,
				z: warden.z
			});
		}

		parkour.tick(t);
	}

	return { player, messages, shoves: shovesOf(messages) };
}

const STRAIGHT = (elapsed) => ({ x: START.x + elapsed * 6, y: START.y, z: START.z });
const JUMPING = (elapsed) => {
	// Salto de 1 m (v = 6, g = 18), uno cada 1.2 s.
	const cycle = elapsed % 1.2;
	const height = cycle < 0.666 ? 6 * cycle - 9 * cycle * cycle : 0;
	return { x: START.x + elapsed * 6, y: START.y + height, z: START.z };
};
const REVERSED = (elapsed) => {
	const turnAt = 0.35;
	const x =
		elapsed <= turnAt ? START.x + elapsed * 6 : START.x + turnAt * 6 - (elapsed - turnAt) * 6;
	return { x, y: START.y, z: START.z };
};
const STILL = () => ({ x: START.x, y: START.y, z: START.z });

const GOLEM = testWarden('golem', 14);
const WITCH = testWarden('witch', 14);
const DEMON = testWarden('demon', 10);

// --- 1. Correr en línea recta no da inmunidad ------------------------------
const rockRun = scenario({ warden: GOLEM, path: STRAIGHT });
check(rockRun.shoves.length > 0, 'corriendo, la roca no empujó (el jugador la atravesó)');

const acidRun = scenario({ warden: WITCH, path: STRAIGHT });
check(acidRun.shoves.length > 0, 'corriendo, el ácido no empujó (el jugador lo atravesó)');

// --- 2. Saltar mientras se corre tampoco evade -----------------------------
const rockJump = scenario({ warden: GOLEM, path: JUMPING });
check(rockJump.shoves.length > 0, 'saltando, la roca no empujó (el jugador la atravesó)');

const acidJump = scenario({ warden: WITCH, path: JUMPING });
check(acidJump.shoves.length > 0, 'saltando, el ácido no empujó (el jugador lo atravesó)');

// --- 3. Parado sigue recibiendo el empuje ----------------------------------
const rockStill = scenario({ warden: GOLEM, path: STILL });
check(rockStill.shoves.length > 0, 'parado, la roca no empujó');

const acidStill = scenario({ warden: WITCH, path: STILL });
check(acidStill.shoves.length > 0, 'parado, el ácido no empujó');

// --- 4. Cambiar de dirección tras el lanzamiento sí esquiva -----------------
const rockDodge = scenario({ warden: GOLEM, path: REVERSED });
check(rockDodge.shoves.length === 0, 'la roca alcanzó a un jugador que cambió de dirección');

const acidDodge = scenario({ warden: WITCH, path: REVERSED });
check(acidDodge.shoves.length === 0, 'el ácido alcanzó a un jugador que cambió de dirección');

// --- 5. El fuego no se evade saltando --------------------------------------
const fireJump = scenario({
	warden: DEMON,
	path: (elapsed) => ({ x: START.x, y: START.y + (elapsed % 1 < 0.5 ? 1 : 0), z: START.z + 1 }),
	power: 'fire'
});
check(fireJump.shoves.length > 0, 'saltando, el cono de fuego no empujó');

console.log(
	'parkour:aim ✓ correr/saltar ya no inmuniza contra roca y ácido; cambiar de dirección sigue esquivando y el fuego sigue empujando'
);
