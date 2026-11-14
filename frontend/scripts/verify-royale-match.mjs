/**
 * `royale:match` — partida headless contra el motor autoritativo de Skyfall
 * Royale (sin navegador).
 *
 * Cubre:
 *   1. `idle → countdown (30 s) → playing`, bloqueo de movimiento/salto/disparo
 *      durante la cuenta atrás y espera sin humanos.
 *   2. Zepelín autoritativo, salto manual, ventana de salto, auto-expulsión a
 *      los 32 s, caída/planeo y aterrizaje.
 *   3. Recogida de loot, granada con autodaño, daño, kill, killfeed, drop del
 *      arma y puestos.
 *   4. Resultados, `go-lobby`, reinicio a `idle`, y ranking por timeout.
 *   5. Muerte por caída y por tormenta, sin respawn ni crédito de baja.
 *   6. Reconexión de 20 s sin sustitución por bot.
 *   7. Modo `--bots`: 1 humano + 11 bots, partida completa sin errores.
 *
 * Se ejecuta con Bun: `bun scripts/verify-royale-match.mjs [--bots]`.
 */
import { Royale } from '../src/server/engines/royale.ts';
import { hasLineOfSight } from '../src/server/engines/royaleCombat.ts';
import {
	ROYALE_BOT_ANCHORS,
	ROYALE_COUNTDOWN_MS,
	ROYALE_JUMP_WINDOW_MS,
	ROYALE_MATCH_MS,
	ROYALE_RESULT_MS,
	ROYALE_SEAT_HEIGHT,
	ROYALE_SKYDIVE_DEPLOY_MS,
	ROYALE_SKYDIVE_DEPLOY_Y,
	ROYALE_STORM_START_MS,
	ROYALE_ZEPPELIN_ALTITUDE,
	royaleStormAt,
	royaleZeppelinAt
} from '../src/lib/state/royaleConfig.ts';

const botsMode = process.argv.includes('--bots');

/** Altura de los pies sobre el casco del zepelín al empezar `playing`. */
const BOARDING_ALTITUDE = ROYALE_ZEPPELIN_ALTITUDE + ROYALE_SEAT_HEIGHT;

function fail(message) {
	console.error(`royale:match ✗ ${message}`);
	process.exit(1);
}

function ok(message) {
	console.log(`royale:match ✓ ${message}`);
}

function assert(condition, message) {
	if (!condition) fail(message);
}

function round(value, digits = 2) {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}

function createEngine(seed, botsEnabled = false) {
	const messages = [];
	const lobbyCalls = [];
	const sendToCalls = [];
	const port = {
		broadcast: (message) => messages.push(message),
		sendTo: (playerId, message) => sendToCalls.push({ playerId, message })
	};
	const engine = new Royale(
		port,
		{ moveToLobby: (playerId) => lobbyCalls.push(playerId) },
		{ seed, botsEnabled }
	);

	return { engine, messages, lobbyCalls, sendToCalls };
}

function events(messages, type = 'mg8-event') {
	return messages
		.filter((message) => message.type === type)
		.map((message) => message.event ?? message);
}

function hasEvent(messages, kind) {
	return events(messages).some((event) => event.kind === kind);
}

function player(engine, id, now) {
	return engine.buildSnapshot(now).players.find((entry) => entry.id === id);
}

function aimAt(origin, target) {
	const dx = target.x - origin.x;
	const dy = target.y + 1.1 - origin.y;
	const dz = target.z - origin.z;
	const length = Math.hypot(dx, dy, dz) || 1;
	return { x: dx / length, y: dy / length, z: dz / length };
}

function raw(engine, id) {
	return engine.rawPlayers.find((entry) => entry.id === id);
}

function startPlaying(seed, humans = ['p1'], now = 1_700_000_000_000) {
	const context = createEngine(seed, false);

	for (const [index, id] of humans.entries()) {
		const result = context.engine.onEnter(id, `Human ${index + 1}`, now + index * 10);
		assert(result.ok, `no se pudo entrar con ${id}`);
	}

	now += ROYALE_COUNTDOWN_MS + 1;
	context.engine.tick(now);
	assert(context.engine.phaseName === 'playing', `fase=${context.engine.phaseName}`);
	context.startNow = now;

	return context;
}

/**
 * Simula el salto y la caída/planeo de un grupo de humanos hacia un ancla
 * caminable, respetando el límite de velocidad del servidor. Devuelve el
 * instante en el que todos han aterrizado.
 */
function landGroup(engine, state, members, clock) {
	const start = state.matchStartedAt;
	assert(start, 'la partida no tiene matchStartedAt');

	let jumpAt = null;
	let best = Infinity;

	for (
		let candidate = Math.max(clock.value, start + 1_500);
		candidate <= start + ROYALE_JUMP_WINDOW_MS - 500;
		candidate += 100
	) {
		const point = royaleZeppelinAt(start, candidate);
		let score = 0;

		for (const member of members) {
			score = Math.max(score, Math.hypot(point.x - member.x, point.z - member.z));
		}

		if (score < best) {
			best = score;
			jumpAt = candidate;
		}
	}

	assert(jumpAt !== null, 'no hay ventana de salto para el grupo');

	clock.value = jumpAt;
	engine.tick(jumpAt);

	for (const member of members) {
		engine.onJump(member.id, jumpAt);
	}

	const snapshot = engine.buildSnapshot(jumpAt);
	const data = new Map();

	for (const member of members) {
		const entry = snapshot.players.find((playerState) => playerState.id === member.id);
		assert(entry, `no se encontró a ${member.id} en el zepelín`);
		assert(entry.mode === 'skydive', `${member.id} no saltó (${entry.mode})`);
		data.set(member.id, { x: entry.x, y: entry.y, z: entry.z, gliding: false, landed: false });
	}

	let steps = 0;

	while ([...data.values()].some((entry) => !entry.landed)) {
		steps += 1;
		assert(steps < 500, 'la caída/planeo no terminó');

		clock.value += 100;
		const now = clock.value;

		for (const member of members) {
			const entry = data.get(member.id);
			if (entry.landed) continue;

			if (
				!entry.gliding &&
				(entry.y <= ROYALE_SKYDIVE_DEPLOY_Y || now - jumpAt >= ROYALE_SKYDIVE_DEPLOY_MS)
			) {
				entry.gliding = true;
			}

			const fall = entry.gliding ? 6 : 40;
			entry.y -= fall * 0.1;

			const dx = member.x - entry.x;
			const dz = member.z - entry.z;
			const distance = Math.hypot(dx, dz);

			if (distance > 0.05) {
				const advance = Math.min(distance, 15 * 0.1);
				entry.x += (dx / distance) * advance;
				entry.z += (dz / distance) * advance;
			}

			if (entry.y <= member.y) {
				entry.y = member.y;
				const remaining = Math.hypot(member.x - entry.x, member.z - entry.z);
				assert(remaining <= 1.2, `${member.id} aterrizó a ${round(remaining)} m del ancla`);
				engine.onPosition(member.id, member.x, member.y, member.z, 0, 'ground', 0, now);
				entry.landed = true;
			} else {
				engine.onPosition(
					member.id,
					entry.x,
					entry.y,
					entry.z,
					0,
					entry.gliding ? 'glide' : 'skydive',
					-fall,
					now
				);
			}
		}

		engine.tick(now);
	}

	return clock.value;
}

// ---------------------------------------------------------------------------
// 1. Countdown, bloqueo y zepelín
// ---------------------------------------------------------------------------

{
	const { engine, messages } = createEngine(1, false);
	let now = 1_700_000_000_000;

	engine.tick(now);
	assert(engine.phaseName === 'idle', `room vacía en ${engine.phaseName}`);

	engine.onEnter('p1', 'Human', now);
	engine.onEnter('p2', 'Human 2', now + 10);
	assert(engine.phaseName === 'countdown', `fase tras entrar=${engine.phaseName}`);
	let snapshot = engine.buildSnapshot(now);
	assert(snapshot.countdownEndsAt === now + ROYALE_COUNTDOWN_MS, 'countdownEndsAt incorrecto');
	assert(!snapshot.waitingForPlayers, 'con 1 humano no debe esperar');
	assert(snapshot.players[0].mode === 'riding', 'el humano no empieza a bordo');

	// Movimiento, salto y disparo bloqueados en countdown.
	engine.onPosition('p1', 42, 2, 42, 0, 'ground', 0, now + 100);
	engine.onJump('p1', now + 100);
	engine.onShoot(
		'p1',
		'pistol',
		{ x: 0, y: 1.6, z: 0 },
		{ x: 0, y: 0, z: -1 },
		undefined,
		now + 100
	);
	engine.tick(now + 100);
	snapshot = engine.buildSnapshot(now + 100);
	assert(snapshot.players[0].mode === 'riding', 'el humano se movió en countdown');
	assert(snapshot.players[0].magAmmo === 12, 'el humano disparó en countdown');
	assert(!hasEvent(messages, 'player-jumped'), 'hubo un salto en countdown');

	// Al llegar a 30 s empieza la partida.
	now += ROYALE_COUNTDOWN_MS;
	engine.tick(now);
	assert(engine.phaseName === 'playing', `fase=${engine.phaseName}`);
	snapshot = engine.buildSnapshot(now);
	assert(snapshot.boardingStartedAt === now, 'boardingStartedAt incorrecto');
	assert(snapshot.matchStartedAt === now, 'matchStartedAt incorrecto');
	assert(snapshot.matchEndsAt === now + ROYALE_MATCH_MS, 'matchEndsAt incorrecto');
	assert(
		snapshot.players.every((entry) => entry.mode === 'riding'),
		'alguien no está en el zepelín'
	);
	assert(
		Math.abs(snapshot.players[0].y - BOARDING_ALTITUDE) < 0.5,
		`altitud=${snapshot.players[0].y}`
	);

	ok('countdown 30 s, bloqueo y zepelín OK');
}

// ---------------------------------------------------------------------------
// 2. Ventana de salto, auto-expulsión y caída
// ---------------------------------------------------------------------------

{
	const context = startPlaying(2, ['p1', 'p2']);
	const { engine } = context;
	const start = context.startNow;

	engine.onJump('p1', start + 500);
	assert(player(engine, 'p1', start).mode === 'riding', 'saltó antes de 1.5 s');

	engine.onJump('p1', start + 2_000);
	let state = player(engine, 'p1', start + 2_000);
	assert(state.mode === 'skydive', `tras saltar=${state.mode}`);

	// El salto parte del casco del zepelín; la caída la simula el cliente.
	assert(Math.abs(state.y - BOARDING_ALTITUDE) < 0.5, `altura tras salto=${state.y}`);

	engine.onJump('p1', start + 2_500);
	assert(player(engine, 'p1', start + 2_500).mode === 'skydive', 'se pudo saltar dos veces');

	// Auto-expulsión: un segundo humano que no salta cae a los 32 s.
	engine.tick(start + 33_000);
	assert(player(engine, 'p2', start + 33_000).mode !== 'riding', 'p2 siguió en el zepelín');

	ok('ventana de salto [1.5, 32] s y auto-expulsión OK');
}

// ---------------------------------------------------------------------------
// 3. Loot, granada, daño, kill, drop y resultados
// ---------------------------------------------------------------------------

{
	// Dos anclas reales separadas 8 m y con LOS: bot-01 (-1, 7) y bot-10 (-1, -1).
	const anchorA = ROYALE_BOT_ANCHORS.find((anchor) => anchor.id === 'bot-01');
	const anchorB = ROYALE_BOT_ANCHORS.find((anchor) => anchor.id === 'bot-10');
	assert(anchorA && anchorB, 'faltan las anclas de prueba');

	const context = startPlaying(3, ['p1', 'p2']);
	const { engine, messages, lobbyCalls } = context;
	const clock = { value: context.startNow };
	const start = context.startNow;

	landGroup(
		engine,
		engine.buildSnapshot(clock.value),
		[
			{ id: 'p1', x: anchorA.x, y: anchorA.y, z: anchorA.z },
			{ id: 'p2', x: anchorB.x, y: anchorB.y, z: anchorB.z }
		],
		clock
	);

	let snapshot = engine.buildSnapshot(clock.value);
	let p1 = snapshot.players.find((entry) => entry.id === 'p1');
	let p2 = snapshot.players.find((entry) => entry.id === 'p2');
	assert(p1.mode === 'ground' && p2.mode === 'ground', 'no aterrizaron en suelo');
	assert(hasEvent(messages, 'player-landed'), 'falta el evento player-landed');
	assert(
		Math.abs(p1.y - anchorA.y) < 0.5 && Math.abs(p2.y - anchorB.y) < 0.5,
		'las alturas de aterrizaje no coinciden'
	);

	// Fuerza la pistola y el escudo limpio para medir el combate.
	engine.onEquip('p1', 1);
	engine.onEquip('p2', 1);
	raw(engine, 'p1').shield = 0;
	raw(engine, 'p1').health = 100;
	raw(engine, 'p2').shield = 0;
	raw(engine, 'p2').health = 100;

	// Granada con autodaño: 75 en el centro.
	raw(engine, 'p1').grenades = 1;
	engine.onThrow(
		'p1',
		{ x: p1.x, y: p1.y + 1.2, z: p1.z },
		{ x: 0, y: 0, z: -1 },
		p1.x,
		p1.z,
		clock.value
	);

	clock.value += 1_600;
	engine.tick(clock.value);
	snapshot = engine.buildSnapshot(clock.value);
	p1 = snapshot.players.find((entry) => entry.id === 'p1');
	assert(hasEvent(messages, 'grenade-thrown'), 'falta grenade-thrown');
	assert(hasEvent(messages, 'grenade-exploded'), 'falta grenade-exploded');
	assert(p1.health === 25, `autodaño de granada dejó ${p1.health} HP, se esperaban 25`);
	assert(raw(engine, 'p1').grenades === 0, 'la granada no se consumió');

	// Combate hitscan: 9 disparos de pistola (12 daño) matan a p2.
	const origin = { x: p1.x, y: p1.y + 1.2, z: p1.z };
	let at = clock.value + 500;

	for (let shot = 0; shot < 9; shot += 1) {
		const target = player(engine, 'p2', at);
		assert(target.alive, `p2 murió antes del disparo ${shot + 1}`);
		engine.onShoot('p1', 'pistol', origin, aimAt(origin, target), 'p2', at);
		at += 200;
	}

	clock.value = at;
	engine.tick(at);
	snapshot = engine.buildSnapshot(at);
	p1 = snapshot.players.find((entry) => entry.id === 'p1');
	p2 = snapshot.players.find((entry) => entry.id === 'p2');

	assert(!p2.alive, 'p2 sigue vivo tras 9 disparos');
	assert(p2.health === 0, `p2 con ${p2.health} HP`);
	assert(p1.kills === 1, `p1 con ${p1.kills} kills`);
	assert(p1.damage >= 108, `p1 con ${p1.damage} de daño`);
	assert(hasEvent(messages, 'kill'), 'falta el evento kill');
	assert(hasEvent(messages, 'player-died'), 'falta el evento player-died');

	const drop = engine.rawLoot.find((loot) => loot.id.startsWith('drop:p2:'));
	assert(drop && drop.kind === 'weapon' && drop.weapon === 'pistol', 'no soltó la pistola');

	// Al quedar 1 vivo, el motor cierra en results.
	assert(engine.phaseName === 'results', `fase=${engine.phaseName}`);
	assert(snapshot.winner === 'p1', `winner=${snapshot.winner}`);
	const placements = Object.fromEntries(
		snapshot.placements.map((entry) => [entry.playerId, entry.placement])
	);
	assert(placements.p2 === 2 && placements.p1 === 1, `puestos=${JSON.stringify(placements)}`);
	assert(snapshot.matchEndsAt === start + ROYALE_MATCH_MS, 'matchEndsAt cambió al acabar antes');
	assert(snapshot.resultEndsAt === at + ROYALE_RESULT_MS, 'resultEndsAt incorrecto');
	assert(hasEvent(messages, 'match-ended'), 'falta match-ended');

	// 20 s después: go-lobby y reinicio.
	engine.tick(snapshot.resultEndsAt + 1);
	assert(lobbyCalls.includes('p1'), 'no se envió go-lobby');
	assert(engine.phaseName === 'idle', `la room no volvió a idle (${engine.phaseName})`);
	assert(engine.playerCount === 0, 'la room no se limpió');
	assert(engine.lootCount === 0, 'quedó loot tras results');

	ok('loot, granada, kill, drop, victoria y go-lobby OK');
}

// ---------------------------------------------------------------------------
// 4. Ranking por timeout (HP + escudo, kills, daño)
// ---------------------------------------------------------------------------

{
	const context = startPlaying(4, ['p1', 'p2', 'p3']);
	const { engine, messages } = context;
	const start = context.startNow;
	const end = start + ROYALE_MATCH_MS;
	const storm = royaleStormAt(start, end, 4);

	for (const loot of engine.rawLoot) loot.available = false;

	const stats = {
		p1: { health: 100, shield: 0, kills: 2, damage: 200 },
		p2: { health: 80, shield: 50, kills: 1, damage: 100 },
		p3: { health: 100, shield: 0, kills: 0, damage: 50 }
	};

	for (const [id, values] of Object.entries(stats)) {
		const entry = raw(engine, id);
		entry.mode = 'ground';
		entry.x = storm.cx + 1;
		entry.z = storm.cz + 1;
		entry.y = 2.9;
		entry.health = values.health;
		entry.shield = values.shield;
		entry.kills = values.kills;
		entry.damage = values.damage;
	}

	engine.tick(end + 1);
	assert(engine.phaseName === 'results', `timeout en fase ${engine.phaseName}`);

	const snapshot = engine.buildSnapshot(end + 1);
	const placements = Object.fromEntries(
		snapshot.placements.map((entry) => [entry.playerId, entry.placement])
	);
	assert(snapshot.winner === 'p2', `ganador por timeout=${snapshot.winner}`);
	assert(
		placements.p1 === 2 && placements.p2 === 1 && placements.p3 === 3,
		`puestos=${JSON.stringify(placements)}`
	);
	assert(hasEvent(messages, 'match-ended'), 'falta match-ended en timeout');

	ok('timeout 600 s, ranking y desempates OK');
}

// ---------------------------------------------------------------------------
// 5. Muerte por caída y por tormenta, sin respawn
// ---------------------------------------------------------------------------

{
	const context = startPlaying(5, ['p1', 'p2']);
	const { engine, messages } = context;

	raw(engine, 'p1').y = -9;
	raw(engine, 'p1').mode = 'ground';
	engine.tick(context.startNow + 100);
	let snapshot = engine.buildSnapshot(context.startNow + 100);
	let p1 = snapshot.players.find((entry) => entry.id === 'p1');
	assert(!p1.alive, 'p1 no murió al caer al mar');
	assert(p1.placement === 2, `puesto por caída=${p1.placement}`);

	const died = events(messages).find(
		(event) => event.kind === 'player-died' && event.playerId === 'p1'
	);
	assert(died && died.cause === 'fell', `causa de caída=${died?.cause}`);
	assert(engine.phaseName === 'results', 'la partida no terminó al quedar 1 vivo');

	const endedAt = engine.buildSnapshot(context.startNow).resultEndsAt;
	engine.tick(endedAt + 1);
	assert(engine.phaseName === 'idle', 'la room no se reinició tras la caída');
	assert(!player(engine, 'p1', endedAt + 1), 'p1 reapareció tras morir');
}

{
	// Tormenta fuera de zona: daño sin autor y muerte con su puesto.
	const context = startPlaying(6, ['p1', 'p2']);
	const { engine, messages } = context;
	const start = context.startNow;

	// Fase 3 (radio 180, 3 dps) a los 266 s de partida.
	const at = start + ROYALE_STORM_START_MS + 75_000 + 45_000 + 30_000 + 30_000 + 25_000 + 1_000;
	const storm = royaleStormAt(start, at, 6);
	assert(storm.radius === 180, `radio de prueba=${storm.radius}`);

	const victim = raw(engine, 'p2');
	victim.mode = 'ground';
	victim.x = storm.cx + storm.radius + 5;
	victim.z = storm.cz;
	victim.y = 2.9;
	victim.health = 2;
	victim.shield = 0;

	const safe = raw(engine, 'p1');
	safe.mode = 'ground';
	safe.x = storm.cx;
	safe.z = storm.cz;
	safe.y = 2.9;

	engine.tick(at);
	assert(!raw(engine, 'p2').alive, 'la tormenta no mató a p2');

	const died = events(messages).find(
		(event) => event.kind === 'player-died' && event.playerId === 'p2'
	);
	assert(died && died.cause === 'storm', `causa de tormenta=${died?.cause}`);
	assert(!died.otherId, 'la tormenta dio crédito de baja');
	assert(hasEvent(messages, 'storm-damage'), 'falta storm-damage');

	const snapshot = engine.buildSnapshot(at);
	assert(snapshot.winner === 'p1', `ganador tras tormenta=${snapshot.winner}`);
	assert(player(engine, 'p1', at).alive, 'p1 murió dentro de la zona segura');

	ok('caída y tormenta OK — sin autor, sin respawn y con puesto');
}

// ---------------------------------------------------------------------------
// 6. Reconexión de 20 s sin sustitución por bot
// ---------------------------------------------------------------------------

{
	// Aquí sí hay bots (10), para probar que no sustituyen a un humano que se
	// desconecta en `playing`.
	const { engine } = createEngine(7, true);
	let now = 1_700_000_000_000;
	engine.onEnter('p1', 'Human 1', now);
	engine.onEnter('p2', 'Human 2', now + 10);
	now += ROYALE_COUNTDOWN_MS + 1;
	engine.tick(now);

	assert(engine.phaseName === 'playing', `fase=${engine.phaseName}`);
	assert(engine.botCountValue === 10, `bots=${engine.botCountValue}`);

	raw(engine, 'p2').health = 55;
	engine.onLeave('p2', now + 1_000);
	engine.tick(now + 1_000);
	let snapshot = engine.buildSnapshot(now + 1_000);
	let p2 = snapshot.players.find((entry) => entry.id === 'p2');
	assert(p2, 'el cuerpo de p2 desapareció al desconectar');
	assert(p2.disconnectedAt !== null, 'p2 no quedó marcado como desconectado');
	assert(engine.botCountValue === 10, 'un bot sustituyó al humano desconectado');

	const reconnect = engine.onEnter('p2', 'Human 2', now + 11_000);
	assert(reconnect.ok, 'no se pudo reconectar');
	engine.tick(now + 11_000);
	snapshot = engine.buildSnapshot(now + 11_000);
	p2 = snapshot.players.find((entry) => entry.id === 'p2');
	assert(p2.disconnectedAt === null, 'p2 sigue desconectado tras reconectar');
	assert(p2.health === 55, `vida tras reconectar=${p2.health}`);

	engine.tick(now + 25_000);
	assert(player(engine, 'p2', now + 25_000), 'p2 se eliminó fuera de su ventana de reconexión');

	ok('reconexión 20 s OK — conserva vida y no la cubre un bot');
}

// ---------------------------------------------------------------------------
// 7. Corrección de posición inválida
// ---------------------------------------------------------------------------

{
	const context = startPlaying(8, ['p1', 'p2']);
	const { engine, sendToCalls } = context;
	const clock = { value: context.startNow };
	const anchor = ROYALE_BOT_ANCHORS.find((entry) => entry.id === 'bot-01');
	assert(anchor, 'falta el ancla bot-01');

	landGroup(
		engine,
		engine.buildSnapshot(clock.value),
		[{ id: 'p1', x: anchor.x, y: anchor.y, z: anchor.z }],
		clock
	);

	engine.onPosition('p1', anchor.x + 100, anchor.y, anchor.z, 0, 'ground', 0, clock.value + 100);
	assert(sendToCalls.length > 0, 'no se envió mg8-correct');
	const correction = sendToCalls.at(-1);
	assert(correction.playerId === 'p1', 'la corrección fue para otro jugador');
	assert(correction.message.type === 'mg8-correct', `mensaje=${correction.message.type}`);
	assert(
		correction.message.correct.reason === 'speed',
		`motivo=${correction.message.correct.reason}`
	);

	ok('rebote de posición inválida OK');
}

// ---------------------------------------------------------------------------
// 8. Modo `--bots`: 1 humano + 11 bots, partida completa
// ---------------------------------------------------------------------------

if (botsMode) {
	const { engine, messages, lobbyCalls } = createEngine(2026, true);
	let now = 1_700_000_000_000;
	engine.onEnter('human', 'Harness', now);
	now += ROYALE_COUNTDOWN_MS + 1;
	engine.tick(now);

	assert(engine.phaseName === 'playing', `fase=${engine.phaseName}`);
	let snapshot = engine.buildSnapshot(now);
	assert(
		snapshot.humans === 1 && snapshot.bots === 11,
		`humanos/bots=${snapshot.humans}/${snapshot.bots}`
	);
	assert(snapshot.players.length === 12, `participantes=${snapshot.players.length}`);

	const start = now;
	const botIds = new Set(snapshot.players.filter((entry) => entry.isBot).map((entry) => entry.id));
	const firstX = new Map();
	let badPositions = 0;
	let ticks = 0;

	while (engine.phaseName === 'playing' && ticks < 7_000) {
		now += 100;
		ticks += 1;
		engine.tick(now);
		snapshot = engine.buildSnapshot(now);

		for (const entry of snapshot.players) {
			if (!firstX.has(entry.id)) firstX.set(entry.id, { x: entry.x, z: entry.z });
			if (!Number.isFinite(entry.x) || !Number.isFinite(entry.y) || !Number.isFinite(entry.z)) {
				badPositions += 1;
			}
			if (entry.y < -8 && entry.alive) badPositions += 1;
		}
	}

	assert(engine.phaseName === 'results', `la partida no terminó (${engine.phaseName})`);
	assert(ticks < 7_000, 'la partida superó 600 s');
	snapshot = engine.buildSnapshot(now);
	assert(snapshot.players.length === 12, 'se perdieron participantes');
	assert(snapshot.placements.length === 12, `puestos=${snapshot.placements.length}`);

	const placements = snapshot.placements.map((entry) => entry.placement);
	assert(new Set(placements).size === 12, 'los puestos no son únicos');
	assert(
		Math.min(...placements) === 1 && Math.max(...placements) === 12,
		'rango de puestos inválido'
	);
	assert(
		snapshot.winner && snapshot.players.some((entry) => entry.id === snapshot.winner),
		'sin ganador'
	);

	const deaths = events(messages).filter((event) => event.kind === 'player-died');
	assert(deaths.length >= 1, 'no hubo ninguna muerte en modo bots');
	assert(deaths.length <= 11, `${deaths.length} muertes, máximo 11`);
	const firstDeath = Math.min(...deaths.map((event) => event.at)) - start;
	assert(
		firstDeath >= 45_000,
		`primera muerte a ${round(firstDeath / 1000, 1)} s (debe ser ≥ 45 s)`
	);
	assert(badPositions === 0, `${badPositions} posiciones no finitas o bajo el mapa`);

	// Los bots se mueven y el humano también recibe auto-expulsión a los 32 s.
	let moved = 0;
	for (const [id, origin] of firstX) {
		const entry = snapshot.players.find((playerState) => playerState.id === id);
		if (entry && Math.hypot(entry.x - origin.x, entry.z - origin.z) > 1) moved += 1;
	}
	assert(moved >= 12, `solo ${moved}/12 participantes se movieron`);

	engine.tick(snapshot.resultEndsAt + 1);
	assert(engine.phaseName === 'idle', 'la room no volvió a idle tras bots');
	assert(lobbyCalls.length === 1 && lobbyCalls[0] === 'human', 'go-lobby incorrecto en modo bots');
	assert(botIds.size === 11, `bots=${botIds.size}`);

	ok(
		`modo --bots OK — ${round((now - start) / 1000, 1)} s, ganador ${snapshot.winner}, ` +
			`primera muerte ${round(firstDeath / 1000, 1)} s`
	);
}

console.log('royale:match ✓ todo correcto');
