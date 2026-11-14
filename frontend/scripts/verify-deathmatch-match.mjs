/**
 * `dm:match` — partida completa headless (sin navegador) contra el motor
 * autoritativo de Witch House Deathmatch.
 *
 * Cubre:
 *   1. Countdown de 30 s que solo arranca con 2 jugadores.
 *   2. Inicio de partida a 6:00 y bloqueo de disparo antes de `playing`.
 *   3. Disparo hitscan, kill, kills/deaths, marcador y `killfeed`.
 *   4. Respawn a los 3 s con pistola, 60 de reserva y 1 granada, en un slot
 *      aleatorio seguro del propio equipo (nunca en el punto de muerte).
 *   5. Protección de aparición de 5 s y su cancelación al disparar.
 *   6. Pickup por proximidad y reaparecida tras el cooldown.
 *   7. Granada propia con autodaño.
 *   8. Fin a los 6 min, victoria/empate y `go-lobby` a los 15 s.
 *   9. Reinicio de la sala a `idle` al terminar.
 *
 * Se ejecuta con Bun: `bun scripts/verify-deathmatch-match.mjs`.
 */
import { Deathmatch } from '../src/server/engines/deathmatch.ts';
import {
	DM_COUNTDOWN_MS,
	DM_MATCH_MS,
	DM_RESPAWN_MS,
	DM_RESULT_MS,
	DM_SPAWN_POSITION_LOCK_MS,
	DM_SPAWN_PROTECTION_MS,
	DM_TEAM_SPAWNS
} from '../src/lib/state/dmConfig.ts';

function fail(message) {
	console.error(`dm:match ✗ ${message}`);
	process.exit(1);
}

function ok(message) {
	console.log(`dm:match ✓ ${message}`);
}

function assert(condition, message) {
	if (!condition) {
		fail(message);
	}
}

function createEngine() {
	const messages = [];
	const lobbyCalls = [];
	const port = {
		broadcast: (message) => messages.push(message),
		sendTo: () => {}
	};
	const engine = new Deathmatch(port, {
		moveToLobby: (playerId) => lobbyCalls.push(playerId)
	});

	return { engine, messages, lobbyCalls };
}

function events(messages) {
	return messages.filter((message) => message.type === 'mg6-event').map((message) => message.event);
}

function hasEvent(messages, kind) {
	return events(messages).some((event) => event.kind === kind);
}

function player(engine, id, now) {
	return engine.buildSnapshot(now).players.find((entry) => entry.id === id);
}

function place(engine, id, x, z, now, y = 0.55) {
	engine.onPosition(id, x, y, z, 0, now);
}

function aimAt(origin, target) {
	const dx = target.x - origin.x;
	const dy = target.y + 1.1 - origin.y;
	const dz = target.z - origin.z;
	const length = Math.hypot(dx, dy, dz) || 1;

	return { x: dx / length, y: dy / length, z: dz / length };
}

/**
 * Dispara la pistola con `targetId` (asistencia de puntería) y devuelve el
 * `now` del último disparo.
 */
function shootPistol(engine, shooterId, targetId, now, shots = 1) {
	let at = now;

	for (let shot = 0; shot < shots; shot += 1) {
		const shooter = player(engine, shooterId, at);
		const target = targetId ? player(engine, targetId, at) : null;

		assert(shooter, `no se encontró al tirador ${shooterId}`);
		assert(shooter.alive, `el tirador ${shooterId} está muerto`);

		const origin = { x: shooter.x, y: shooter.y + 1.2, z: shooter.z };
		const dir = target ? aimAt(origin, target) : { x: 0, y: 0, z: -1 };

		engine.onShoot(shooterId, 'pistol', origin, dir, target?.id, at);
		at += 200;
	}

	// Devuelve el instante del último disparo, no el del siguiente.
	return at - 200;
}

// ---------------------------------------------------------------------------
// 1. Countdown con 2 jugadores
// ---------------------------------------------------------------------------

const { engine, messages, lobbyCalls } = createEngine();
let now = 1_000;

engine.onEnter('p1', 'Coven One', now);
now += 10;
assert(engine.phaseName === 'countdown', 'el primer jugador debería iniciar countdown');
assert(
	engine.buildSnapshot(now).waitingForPlayers,
	'con un solo jugador debe estar waitingForPlayers'
);

engine.onEnter('p2', 'Hunters One', now);
now += 10;

const countdown = engine.buildSnapshot(now);
assert(engine.phaseName === 'countdown', 'con 2 jugadores sigue en countdown');
assert(!countdown.waitingForPlayers, 'con 2 jugadores no debe esperar');
assert(countdown.countdownEndsAt === now + DM_COUNTDOWN_MS - 10, 'el countdown no dura 30 s');

const countdownEndsAt = countdown.countdownEndsAt;
assert(countdownEndsAt !== null, 'countdownEndsAt no puede ser null');

// Un disparo antes de `playing` se ignora por completo.
const beforeShots = events(messages).filter((event) => event.kind === 'shot-fired').length;
shootPistol(engine, 'p1', 'p2', now);
assert(
	events(messages).filter((event) => event.kind === 'shot-fired').length === beforeShots,
	'un disparo en countdown no debe emitir shot-fired'
);

engine.tick(countdownEndsAt - 1);
assert(engine.phaseName === 'countdown', 'no debe empezar antes de los 30 s');

engine.tick(countdownEndsAt);
assert(engine.phaseName === 'playing', 'la partida no arrancó al vencer el countdown');
assert(hasEvent(messages, 'match-started'), 'falta el evento match-started');

const started = engine.buildSnapshot(countdownEndsAt);
assert(started.matchEndsAt === countdownEndsAt + DM_MATCH_MS, 'la partida no dura 6 minutos');
assert(
	started.teamScores.coven === 0 && started.teamScores.hunters === 0,
	'los marcadores deben empezar a 0'
);

now = countdownEndsAt + 20;

ok('countdown OK — 30 s, espera a 2 jugadores y arranque exacto a 6:00');

// ---------------------------------------------------------------------------
// 2. Kill hitscan, marcador y killfeed
// ---------------------------------------------------------------------------

place(engine, 'p1', 0, 0, now);
place(engine, 'p2', 2, 0, now);

const p1Team = player(engine, 'p1', now).team;
const p2Team = player(engine, 'p2', now).team;
assert(p1Team !== p2Team, 'los dos primeros jugadores deben estar en equipos distintos');

let shotAt = shootPistol(engine, 'p1', 'p2', now, 9);
const dead = player(engine, 'p2', shotAt);

assert(!dead.alive, 'p2 debería morir tras 9 disparos de pistola (9 × 12 = 108)');
assert(dead.health === 0, `p2 murió con health=${dead.health}`);
assert(dead.deaths === 1, 'la víctima debería sumar 1 death');

const killer = player(engine, 'p1', shotAt);
assert(killer.kills === 1, `el atacante debería sumar 1 kill, tiene ${killer.kills}`);

const scores = engine.teamScore;
assert(scores[p1Team] === 1, `el equipo ${p1Team} debería sumar 1 baja`);

const killEvent = events(messages).find((event) => event.kind === 'kill');
assert(killEvent, 'falta el evento kill (killfeed)');
assert(killEvent.playerId === 'p1' && killEvent.otherId === 'p2', 'el kill event apunta mal');
assert(killEvent.weapon === 'pistol', 'el kill event no incluye el arma');
assert(hasEvent(messages, 'shot-fired'), 'faltan los eventos shot-fired');
assert(hasEvent(messages, 'player-hurt'), 'faltan los eventos player-hurt');
assert(hasEvent(messages, 'player-died'), 'falta el evento player-died');

ok('kill OK — +1 kill, +1 death, +1 al equipo y eventos de killfeed');

// ---------------------------------------------------------------------------
// 3. Respawn y protección de aparición
// ---------------------------------------------------------------------------

engine.tick(shotAt + DM_RESPAWN_MS - 1);
assert(!player(engine, 'p2', now).alive, 'p2 no debe reaparecer antes de 3 s');

// Mientras está muerto, los reportes del cadáver se ignoran: la posición no
// debe moverse del sitio donde murió.
place(engine, 'p2', 30, 30, shotAt + DM_RESPAWN_MS - 1);
const deadPosition = player(engine, 'p2', shotAt + DM_RESPAWN_MS - 1);
assert(
	deadPosition.x === 2 && deadPosition.z === 0,
	`el reporte de un muerto movió el cuerpo a (${deadPosition.x}, ${deadPosition.z})`
);

let respawnNow = shotAt + DM_RESPAWN_MS + 1;
engine.tick(respawnNow);

const respawned = player(engine, 'p2', respawnNow);
assert(respawned.alive, 'p2 no reapareció a los 3 s');
const ownSpawn = DM_TEAM_SPAWNS[p2Team].find(
	(slot) => slot.x === respawned.x && slot.z === respawned.z
);
assert(
	ownSpawn !== undefined,
	`p2 reapareció en (${respawned.x}, ${respawned.z}), fuera de los spawns de ${p2Team}`
);
assert(
	!(respawned.x === deadPosition.x && respawned.z === deadPosition.z),
	'p2 reapareció en el punto de muerte en vez de en su spawn'
);
assert(respawned.health === 100, `p2 reapareció con ${respawned.health} HP`);
assert(respawned.weapon === 'pistol', 'p2 no reapareció con la pistola');
// La pistola reporta reserva infinita (`null`); el motor conserva 60 de
// munición universal para las demás armas que se recojan.
assert(
	respawned.reserveAmmo === null || respawned.reserveAmmo === 60,
	`p2 reapareció con reserva inesperada ${respawned.reserveAmmo}`
);
assert(respawned.grenades === 1, 'p2 no reapareció con 1 granada');
assert(
	respawned.protectedUntil === respawnNow + DM_SPAWN_PROTECTION_MS,
	'la protección de aparición no dura 5 s'
);
assert(hasEvent(messages, 'player-respawned'), 'falta el evento player-respawned');

// Un paquete en vuelo desde el punto de muerte no debe pisar el spawn.
const staleAt = respawnNow + 10;
place(engine, 'p2', deadPosition.x, deadPosition.z, staleAt);
const afterStale = player(engine, 'p2', staleAt);
assert(
	afterStale.x === respawned.x && afterStale.z === respawned.z,
	`el reporte tardío movió a p2 a (${afterStale.x}, ${afterStale.z})`
);

// Disparar a un jugador protegido no resta HP. Se coloca a ambos después de
// la ventana anti-paquetes-tardíos del respawn.
const reposedAt = respawnNow + DM_SPAWN_POSITION_LOCK_MS + 10;
place(engine, 'p1', 0, 0, reposedAt);
place(engine, 'p2', 2, 0, reposedAt);
let protectedShot = shootPistol(engine, 'p1', 'p2', reposedAt + 10, 1);
const stillFull = player(engine, 'p2', protectedShot);
assert(stillFull.health === 100, `la protección no evitó daño: ${stillFull.health} HP`);

// El protegido cancela su protección disparando (hacia el vacío).
const p2State = player(engine, 'p2', protectedShot);
engine.onShoot(
	'p2',
	'pistol',
	{ x: p2State.x, y: p2State.y + 1.2, z: p2State.z },
	{ x: 0, y: 0, z: -1 },
	undefined,
	protectedShot + 1
);

let damagingShot = shootPistol(engine, 'p1', 'p2', protectedShot + 300, 1);
const damaged = player(engine, 'p2', damagingShot);
assert(
	damaged.health === 88,
	`tras cancelar la protección, p2 debería tener 88 HP y tiene ${damaged.health}`
);

ok('respawn OK — 3 s, spawn aleatorio del equipo, protección 5 s y cancelación al disparar');

// ---------------------------------------------------------------------------
// 4. Pickups
// ---------------------------------------------------------------------------

const pickupBefore = player(engine, 'p1', damagingShot);
assert(
	!pickupBefore.inventory.some((entry) => entry.weapon === 'shotgun'),
	'p1 no debería tener la escopeta antes de recogerla'
);

place(engine, 'p1', -29, 17, damagingShot + 10);
engine.tick(damagingShot + 20);

const pickupAfter = player(engine, 'p1', damagingShot + 20);
assert(
	pickupAfter.inventory.some((entry) => entry.weapon === 'shotgun'),
	'el pickup de escopeta no añadió el arma al inventario'
);
assert(pickupAfter.weapon === 'shotgun', 'el arma recogida no se equipó automáticamente');
assert(
	events(messages).some(
		(event) => event.kind === 'pickup-taken' && event.pickupId === 'shotgun-fields'
	),
	'falta el evento pickup-taken de shotgun-fields'
);

const shotgunPickup = engine
	.buildSnapshot(damagingShot + 20)
	.pickups.find((pickup) => pickup.id === 'shotgun-fields');
assert(shotgunPickup, 'no se encontró el pickup shotgun-fields');
assert(shotgunPickup.availableAt > 0, 'el pickup no entró en cooldown');

engine.tick(shotgunPickup.availableAt);
assert(
	events(messages).some(
		(event) => event.kind === 'pickup-respawned' && event.pickupId === 'shotgun-fields'
	),
	'falta el evento pickup-respawned al vencer el cooldown'
);

ok('pickups OK — recogida por proximidad, equipado, cooldown y reaparición');

// ---------------------------------------------------------------------------
// 5. Granada propia con autodaño
// ---------------------------------------------------------------------------

const thrower = player(engine, 'p1', shotgunPickup.availableAt + 10);
const throwAt = shotgunPickup.availableAt + 20;

engine.onThrow(
	'p1',
	{ x: thrower.x, y: thrower.y + 1.2, z: thrower.z },
	{ x: 0, y: 0, z: -1 },
	thrower.x,
	thrower.z,
	throwAt
);

const afterThrow = player(engine, 'p1', throwAt);
assert(afterThrow.grenades === thrower.grenades - 1, 'la granada no descontó del inventario');
assert(hasEvent(messages, 'grenade-thrown'), 'falta el evento grenade-thrown');

engine.tick(throwAt + 700);

const afterBlast = player(engine, 'p1', throwAt + 700);
assert(
	afterBlast.health < afterThrow.health || !afterBlast.alive,
	'la granada propia no dañó al lanzador'
);
assert(hasEvent(messages, 'grenade-exploded'), 'falta el evento grenade-exploded');
assert(hasEvent(messages, 'self-damage'), 'falta el evento self-damage');

ok('granadas OK — explotar a los pies del lanzador aplica autodaño');

// ---------------------------------------------------------------------------
// 6. Fin de partida, victoria y go-lobby
// ---------------------------------------------------------------------------

const end = engine.buildSnapshot(throwAt + 700);
assert(end.matchEndsAt !== null, 'matchEndsAt no puede ser null');

const finalScores = engine.teamScore;
const expectedWinner =
	finalScores.coven > finalScores.hunters
		? 'coven'
		: finalScores.hunters > finalScores.coven
			? 'hunters'
			: 'draw';

engine.tick(end.matchEndsAt);
assert(engine.phaseName === 'results', 'la partida no terminó a los 6 minutos');

const results = engine.buildSnapshot(end.matchEndsAt);
assert(
	results.winner === expectedWinner,
	`winner=${results.winner}, se esperaba ${expectedWinner}`
);
assert(results.mvpId !== null, 'los resultados no tienen MVP');
assert(hasEvent(messages, 'match-ended'), 'falta el evento match-ended');

engine.tick(end.matchEndsAt + DM_RESULT_MS + 1);
assert(lobbyCalls.includes('p1') && lobbyCalls.includes('p2'), 'go-lobby no se envió a todos');
assert(engine.phaseName === 'idle', `la sala no volvió a idle tras results (${engine.phaseName})`);
assert(engine.playerCount === 0, 'la sala no se limpió tras results');

ok(`fin OK — victoria ${expectedWinner}, results 15 s y go-lobby a todos`);

// ---------------------------------------------------------------------------
// 7. Reconexión conserva equipo y K/D
// ---------------------------------------------------------------------------

{
	const reconnect = createEngine();
	let at = 80_000;

	reconnect.engine.onEnter('k1', 'Killer', at);
	reconnect.engine.onEnter('k2', 'Victim', at + 10);
	at += 20;

	const countdownState = reconnect.engine.buildSnapshot(at);
	assert(countdownState.countdownEndsAt !== null, 'reconnect: falta countdownEndsAt');
	reconnect.engine.tick(countdownState.countdownEndsAt);
	at = countdownState.countdownEndsAt + 20;

	place(reconnect.engine, 'k1', 0, 0, at);
	place(reconnect.engine, 'k2', 2, 0, at);

	const killAt = shootPistol(reconnect.engine, 'k1', 'k2', at, 9);
	const originalTeam = player(reconnect.engine, 'k1', killAt).team;
	assert(player(reconnect.engine, 'k1', killAt).kills === 1, 'reconnect: k1 no sumó la kill');

	reconnect.engine.onLeave('k1', killAt + 100);
	reconnect.engine.onEnter('k1', 'Killer', killAt + 5_000);

	const reconnectedKiller = player(reconnect.engine, 'k1', killAt + 5_000);
	assert(reconnectedKiller.team === originalTeam, 'reconnect: k1 cambió de equipo');
	assert(
		reconnectedKiller.kills === 1,
		`reconnect: k1 perdió sus kills (${reconnectedKiller.kills})`
	);

	reconnect.engine.onLeave('k2', killAt + 5_100);
	reconnect.engine.onEnter('k2', 'Victim', killAt + 10_000);

	const reconnectedVictim = player(reconnect.engine, 'k2', killAt + 10_000);
	assert(
		reconnectedVictim.deaths === 1,
		`reconnect: k2 perdió sus deaths (${reconnectedVictim.deaths})`
	);

	ok('reconexión OK — equipo, kills y deaths se conservan durante 20 s');
}

// ---------------------------------------------------------------------------
// 8. Empate (Draw)
// ---------------------------------------------------------------------------

{
	const draw = createEngine();
	let at = 50_000;

	draw.engine.onEnter('d1', 'Draw One', at);
	draw.engine.onEnter('d2', 'Draw Two', at + 10);
	at += 20;

	const countdown = draw.engine.buildSnapshot(at);
	assert(countdown.countdownEndsAt !== null, 'draw: falta countdownEndsAt');
	draw.engine.tick(countdown.countdownEndsAt);

	const playing = draw.engine.buildSnapshot(countdown.countdownEndsAt);
	assert(playing.matchEndsAt !== null, 'draw: falta matchEndsAt');
	assert(
		playing.teamScores.coven === 0 && playing.teamScores.hunters === 0,
		'draw: scores iniciales'
	);

	draw.engine.tick(playing.matchEndsAt);

	const result = draw.engine.buildSnapshot(playing.matchEndsAt);
	assert(draw.engine.phaseName === 'results', 'draw: no terminó en results');
	assert(result.winner === 'draw', `draw: winner=${result.winner}`);

	draw.engine.tick(playing.matchEndsAt + DM_RESULT_MS + 1);
	assert(draw.engine.phaseName === 'idle', 'draw: no volvió a idle');
}

ok('empate OK — 0 bajas por equipo termina en Draw');

console.log('dm:match ✓ todo correcto');
