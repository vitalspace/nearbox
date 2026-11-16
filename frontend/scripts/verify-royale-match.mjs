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
 *   5. Agua = rescate en la orilla (a pie y con coche) y muerte por tormenta,
 *      sin respawn ni crédito de baja.
 *   6. Reconexión de 20 s sin sustitución por bot.
 *   7. Modo `--bots`: 1 humano + 11 bots, partida completa sin errores.
 *
 * Se ejecuta con Bun: `bun scripts/verify-royale-match.mjs [--bots]`.
 */
import { Royale } from '../src/server/engines/royale.ts';
import { hasLineOfSight } from '../src/server/engines/royaleCombat.ts';
import { createBotMind, updateBot } from '../src/server/engines/royaleBots.ts';
import { floorHeightAt } from '../src/server/engines/royaleNav.ts';
import {
	ROYALE_BALLOON_BOUNDS_MARGIN,
	ROYALE_BALLOON_MAX_Y,
	ROYALE_BALLOON_SEAT_OFFSET,
	ROYALE_BOT_ANCHORS,
	ROYALE_CAR_MAX_SPEED,
	ROYALE_COUNTDOWN_MS,
	ROYALE_JUMP_WINDOW_MS,
	ROYALE_MAP_BOUNDS,
	ROYALE_MATCH_MS,
	ROYALE_OCCLUDERS,
	ROYALE_RESULT_MS,
	ROYALE_SEAT_HEIGHT,
	ROYALE_SKYDIVE_DEPLOY_MS,
	ROYALE_SKYDIVE_DEPLOY_Y,
	ROYALE_STORM_START_MS,
	ROYALE_VEHICLE_RAM_DAMAGE,
	ROYALE_VEHICLE_SPAWNS,
	ROYALE_WATER_RESCUE_Y,
	ROYALE_ZEPPELIN_ALTITUDE,
	royaleFallDamage,
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

	// El daño por caída se comprueba en su propio bloque. Aquí el aterrizaje es
	// solo la puesta en escena de combate/loot, así que se devuelve la vida
	// completa para no alterar las aserciones de esas pruebas.
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
// 2b. Daño por caída: salida de globo en vuelo (el zepelín es gratis)
// ---------------------------------------------------------------------------

{
	const anchor = ROYALE_BOT_ANCHORS.find((entry) => entry.id === 'bot-01');
	assert(anchor, 'falta el ancla de prueba para daño por caída');

	// El salto del zepelín es la entrada estándar: se salta con planeo, así que
	// aterrizar ileso no es un bug. Solo la salida improvisada de un globo cobra.
	{
		const context = startPlaying(21, ['p1', 'p2']);
		const { engine, messages } = context;
		const clock = { value: context.startNow };

		landGroup(
			engine,
			engine.buildSnapshot(clock.value),
			[{ id: 'p1', x: anchor.x, y: anchor.y, z: anchor.z }],
			clock
		);

		const body = raw(engine, 'p1');

		assert(
			body.health === 100 && body.shield === 0,
			`vida tras el salto del zepelín=${body.health}`
		);
		assert(body.fallStartY === null, 'el salto del zepelín no debe registrar altura de caída');
		assert(!hasEvent(messages, 'player-hurt'), 'el salto del zepelín no debe hacer daño');
	}

	// Salir de un globo en vuelo también lesiona: el planeo amortigua, pero
	// caer desde decenas de metros no puede salir gratis.
	{
		const context = startPlaying(22, ['p1', 'p2']);
		const { engine } = context;
		const balloonSpawn = ROYALE_VEHICLE_SPAWNS.find((spawn) => spawn.kind === 'balloon');
		assert(balloonSpawn, 'falta un globo de prueba');
		const clock = { value: context.startNow };

		landGroup(
			engine,
			engine.buildSnapshot(clock.value),
			[{ id: 'p1', x: anchor.x, y: anchor.y, z: anchor.z }],
			clock
		);

		const balloon = engine.rawVehicles.find((entry) => entry.id === balloonSpawn.id);
		assert(balloon, 'falta el globo en el motor');
		balloon.x = anchor.x;
		balloon.z = anchor.z;
		balloon.y = anchor.y;

		clock.value += 100;
		engine.onVehicleEnter('p1', balloonSpawn.id, clock.value);
		assert(balloon.driverId === 'p1', 'p1 no entró en el globo de prueba');

		// El globo asciende y el jugador salta de la barquilla en vuelo.
		balloon.y = anchor.y + 40;
		clock.value += 100;
		engine.onVehicleExit('p1', clock.value);
		const body = raw(engine, 'p1');

		assert(body.mode === 'glide', `salida en globo dejó ${body.mode}`);
		assert(
			body.fallStartY !== null && body.fallStartY > anchor.y + 39,
			`altura de salida del globo=${body.fallStartY}`
		);

		const startY = body.fallStartY;
		let y = body.y;
		while (y > anchor.y + 0.6) {
			clock.value += 100;
			y = Math.max(anchor.y + 0.4, y - 0.6);
			engine.onPosition('p1', anchor.x, y, anchor.z, 0, 'glide', -6, clock.value);
		}

		clock.value += 100;
		engine.onPosition('p1', anchor.x, anchor.y, anchor.z, 0, 'ground', 0, clock.value);

		const expected = royaleFallDamage(startY - anchor.y, true);
		assert(
			expected > 0 && Math.abs(body.health - (100 - expected)) < 0.01,
			`daño por saltar del globo=${100 - body.health}, esperado=${expected}`
		);
		assert(body.fallStartY === null, 'no se limpió la altura de salida al aterrizar');
	}

	// Caída corta: el umbral de seguridad sigue sin hacer daño.
	assert(royaleFallDamage(5, true) === 0, 'una caída de 5 m debería ser segura');
	assert(royaleFallDamage(5, false) === 0, 'una caída libre de 5 m debería ser segura');
	assert(royaleFallDamage(20, false) > royaleFallDamage(20, true), 'el planeo debe amortiguar');

	ok('daño por caída OK — zepelín gratis, globo lesiona, planeo amortigua');
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

	// Combate hitscan: 6 disparos de pistola (17 daño) matan a p2.
	const origin = { x: p1.x, y: p1.y + 1.2, z: p1.z };
	let at = clock.value + 500;

	for (let shot = 0; shot < 6; shot += 1) {
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

	assert(!p2.alive, 'p2 sigue vivo tras 6 disparos');
	assert(p2.health === 0, `p2 con ${p2.health} HP`);
	assert(p1.kills === 1, `p1 con ${p1.kills} kills`);
	assert(p1.damage >= 102, `p1 con ${p1.damage} de daño`);
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
// 3b. Compensación de retardo: vale la posición que el cliente dibujó
// ---------------------------------------------------------------------------

{
	// Los mismos anclas separadas 8 m en Z, con LOS limpia. El cliente ve a p2
	// 200 ms en el pasado; si dispara a esa silueta, el servidor debe contar
	// el impacto aunque la posición actual ya esté 1.1 m a un lado.
	const anchorA = ROYALE_BOT_ANCHORS.find((anchor) => anchor.id === 'bot-01');
	const anchorB = ROYALE_BOT_ANCHORS.find((anchor) => anchor.id === 'bot-10');
	assert(anchorA && anchorB, 'faltan las anclas de prueba');

	const context = startPlaying(6, ['p1', 'p2']);
	const { engine } = context;
	const clock = { value: context.startNow };

	landGroup(
		engine,
		engine.buildSnapshot(clock.value),
		[
			{ id: 'p1', x: anchorA.x, y: anchorA.y, z: anchorA.z },
			{ id: 'p2', x: anchorB.x, y: anchorB.y, z: anchorB.z }
		],
		clock
	);

	const t0 = clock.value + 100;
	engine.tick(t0);
	const seen = player(engine, 'p2', t0);
	assert(seen && seen.alive, 'p2 no aterrizó para la prueba de retardo');

	const t1 = t0 + 200;
	engine.onPosition('p2', seen.x + 1.1, seen.y, seen.z, 0, 'ground', 0, t1);
	engine.tick(t1);

	const current = player(engine, 'p2', t1);
	assert(
		current && Math.abs(current.x - seen.x) >= 1,
		`p2 no se movió lo suficiente (${current ? current.x - seen.x : 'sin estado'})`
	);

	const p1 = player(engine, 'p1', t1);
	assert(p1 && p1.alive, 'p1 no aterrizó para la prueba de retardo');
	const origin = { x: p1.x, y: p1.y + 1.2, z: p1.z };
	engine.onShoot('p1', 'pistol', origin, aimAt(origin, seen), undefined, t1);

	const hit = player(engine, 'p2', t1);
	assert(hit && hit.health === 83, `el disparo al cuerpo dibujado dejó ${hit?.health} HP`);

	ok('compensación de retardo: disparo a la silueta de hace 200 ms OK');
}

// ---------------------------------------------------------------------------
// 3c. Línea de visión: un muro real corta el segmento
// ---------------------------------------------------------------------------

{
	const wall = ROYALE_OCCLUDERS.find((box) => {
		const width = box[3] - box[0];
		const depth = box[5] - box[2];
		const height = box[4] - box[1];

		return height >= 2.5 && Math.max(width, depth) >= 1 && Math.min(width, depth) >= 0.15;
	});
	assert(wall, 'no hay un muro válido para la prueba de LOS');

	const middleZ = (wall[2] + wall[5]) / 2;
	const middleY = wall[1] + (wall[4] - wall[1]) * 0.5;
	const left = { x: wall[0] - 1, y: middleY, z: middleZ };
	const right = { x: wall[3] + 1, y: middleY, z: middleZ };

	assert(!hasLineOfSight(left, right), 'el muro no bloquea la línea de visión');
	assert(
		hasLineOfSight(
			{ x: left.x, y: wall[4] + 2, z: middleZ },
			{ x: right.x, y: wall[4] + 2, z: middleZ }
		),
		'un segmento por encima del muro quedó bloqueado'
	);

	ok('LOS de combate OK — los muros bloquean y el cielo no');
}

// ---------------------------------------------------------------------------
// 3d. Bots sin LOS: no refrescan la posición exacta ni disparan/granadean
// ---------------------------------------------------------------------------

{
	let now = 1_700_000_000_000;
	const mind = createBotMind(11, 0, { x: 0, y: 0, z: 0 }, now - 10_000);
	mind.nextThinkAt = 0;
	mind.engageAt = 0;
	mind.targetId = 'enemy';
	mind.lastSeenAt = now - 100;
	mind.lastSeenX = 999;
	mind.lastSeenZ = 999;
	mind.reactionUntil = 0;
	mind.burstPauseUntil = 0;
	mind.nextGrenadeAt = 0;

	const bot = {
		id: 'bot',
		isBot: true,
		alive: true,
		health: 100,
		shield: 0,
		weapon: 'smg',
		magAmmo: 30,
		reserveAmmo: 90,
		grenades: 4,
		inventory: new Map([['smg', 30]]),
		mode: 'ground',
		x: 0,
		y: 0,
		z: 0,
		yaw: 0,
		vy: 0,
		seat: 0,
		jumped: false,
		lastShotAt: 0,
		lastReloadAt: 0,
		lastGrenadeAt: 0,
		lastAttackerId: null,
		lastAttackerAt: 0,
		bot: mind
	};
	const enemy = {
		...bot,
		id: 'enemy',
		isBot: false,
		z: 10,
		bot: undefined
	};

	let shots = 0;
	let grenades = 0;
	let visible = false;
	const world = {
		now,
		players: [bot, enemy],
		loot: [],
		storm: {
			phase: 0,
			cx: 0,
			cz: 0,
			radius: 400,
			nextCx: 0,
			nextCz: 0,
			nextRadius: 400,
			endsAt: now + 60_000,
			state: 'wait',
			dps: 0
		},
		aliveCount: 2,
		findPath: () => null,
		hasLineOfSight: () => visible,
		floorHeight: () => 0,
		safePoint: (_storm, x, z) => ({ x, z }),
		jump: () => {},
		shoot: () => {
			shots += 1;
		},
		throwGrenade: () => {
			grenades += 1;
		},
		emit: () => {},
		markDirty: () => {}
	};

	updateBot(bot, world);
	assert(mind.lastSeenX === 999 && mind.lastSeenZ === 999, 'el bot recordó la posición sin LOS');
	assert(shots === 0, `el bot disparó ${shots} veces sin LOS`);
	assert(grenades === 0, `el bot lanzó ${grenades} granadas sin LOS`);

	now += 200;
	world.now = now;
	mind.nextThinkAt = 0;
	visible = true;
	updateBot(bot, world);
	assert(mind.lastSeenX === enemy.x && mind.lastSeenZ === enemy.z, 'el bot no refrescó con LOS');
	assert(shots > 0, 'el bot no disparó con LOS');

	ok('bots sin LOS OK — no refrescan la posición ni disparan/granadean');
}

// ---------------------------------------------------------------------------
// 3e. Anti-wallhack: disparos, granadas y explosiones no atraviesan muros
// ---------------------------------------------------------------------------

{
	const wall = ROYALE_OCCLUDERS.find((box) => {
		const width = box[3] - box[0];
		const depth = box[5] - box[2];
		const height = box[4] - box[1];

		return (
			height >= 2.5 &&
			Math.max(width, depth) >= 1 &&
			Math.min(width, depth) >= 0.15 &&
			Math.min(width, depth) <= 2
		);
	});
	assert(wall, 'no hay muro para la prueba anti-wallhack');

	const thicknessX = wall[3] - wall[0] <= wall[5] - wall[2];
	const middleX = (wall[0] + wall[3]) / 2;
	const middleZ = (wall[2] + wall[5]) / 2;
	const floorY = wall[1];

	/** Coloca un jugador en crudo y limpia el historial de retardo. */
	function resetRaw(engine, id, x, y, z) {
		const entry = raw(engine, id);
		entry.x = x;
		entry.y = y;
		entry.z = z;
		entry.mode = 'ground';
		entry.alive = true;
		entry.health = 100;
		entry.shield = 0;
		entry.weapon = 'pistol';
		entry.magAmmo = 12;
		entry.reserveAmmo = 60;
		entry.grenades = 4;
		entry.lastShotAt = 0;
		entry.lastGrenadeAt = 0;
		entry.lastPositionAt = 0;
		entry.track = [];
		return entry;
	}

	function aimPoint(origin, point) {
		const dx = point.x - origin.x;
		const dy = point.y - origin.y;
		const dz = point.z - origin.z;
		const length = Math.hypot(dx, dy, dz) || 1;
		return { x: dx / length, y: dy / length, z: dz / length };
	}

	// Lados opuestos del muro, cada uno a `offset` de su cara.
	function sides(offset) {
		if (thicknessX) {
			return {
				a: { x: wall[0] - offset, z: middleZ },
				b: { x: wall[3] + offset, z: middleZ }
			};
		}
		return {
			a: { x: middleX, z: wall[2] - offset },
			b: { x: middleX, z: wall[5] + offset }
		};
	}

	// 1) Un origen dentro del AABB de un edificio no ve a través de él.
	{
		const envelope = ROYALE_OCCLUDERS.map((box) => ({
			box,
			height: box[4] - box[1],
			area: (box[3] - box[0]) * (box[5] - box[2])
		}))
			.filter((entry) => entry.height >= 5 && entry.area >= 60)
			.sort((first, second) => second.area - first.area)[0];
		assert(envelope, 'no hay edificio para la prueba de origen dentro');

		const inside = {
			x: (envelope.box[0] + envelope.box[3]) / 2,
			y: envelope.box[1] + 2,
			z: (envelope.box[2] + envelope.box[5]) / 2
		};
		const outside = { x: envelope.box[3] + 6, y: inside.y, z: inside.z };

		assert(!hasLineOfSight(inside, outside), 'un origen dentro del edificio ve a través de él');
	}

	// 2) Disparos: un muro real corta el daño, con y sin objetivo bloqueado.
	{
		const context = startPlaying(12, ['p1', 'p2']);
		const { engine } = context;
		const points = sides(1.3);
		const yA = floorHeightAt(points.a.x, points.a.z) ?? floorY;
		const yB = floorHeightAt(points.b.x, points.b.z) ?? floorY;

		resetRaw(engine, 'p1', points.a.x, yA, points.a.z);
		resetRaw(engine, 'p2', points.b.x, yB, points.b.z);

		const origin = { x: points.a.x, y: yA + 1.2, z: points.a.z };
		const target = raw(engine, 'p2');
		const aim = aimAt(origin, target);

		engine.onShoot('p1', 'pistol', origin, aim, undefined, context.startNow + 50);
		assert(target.health === 100, `el disparo sin bloqueo atravesó el muro (${target.health} HP)`);

		engine.onShoot('p1', 'pistol', origin, aim, 'p2', context.startNow + 400);
		assert(target.health === 100, `el disparo bloqueado atravesó el muro (${target.health} HP)`);

		// Control: mismo muro, mismo lado y línea limpia → el disparo sí daña.
		const along = thicknessX
			? { x: points.a.x, z: points.a.z - 6 }
			: { x: points.a.x - 6, z: points.a.z };
		const yAlone = floorHeightAt(along.x, along.z) ?? floorY;
		resetRaw(engine, 'p1', points.a.x, yA, points.a.z);
		resetRaw(engine, 'p2', along.x, yAlone, along.z);
		const controlOrigin = { x: points.a.x, y: yA + 1.2, z: points.a.z };
		const controlTarget = raw(engine, 'p2');
		engine.onShoot(
			'p1',
			'pistol',
			controlOrigin,
			aimAt(controlOrigin, controlTarget),
			undefined,
			context.startNow + 800
		);
		assert(
			controlTarget.health < 100,
			`el disparo de control no dañó (${controlTarget.health} HP)`
		);
	}

	// 3) Granada: la parábola se recorta en el muro y no alcanza a quien se cubre.
	{
		const context = startPlaying(13, ['p1', 'p2']);
		const { engine, messages } = context;
		const points = sides(2);
		const yA = floorHeightAt(points.a.x, points.a.z) ?? floorY;
		const yB = floorHeightAt(points.b.x, points.b.z) ?? floorY;

		const p1 = resetRaw(engine, 'p1', points.a.x, yA, points.a.z);
		const p2 = resetRaw(engine, 'p2', points.b.x, yB, points.b.z);
		const origin = { x: points.a.x, y: yA + 1.2, z: points.a.z };

		engine.onThrow('p1', origin, { x: 0, y: 0, z: 0 }, p2.x, p2.z, context.startNow + 50);
		engine.tick(context.startNow + 2_600);

		assert(hasEvent(messages, 'grenade-thrown'), 'la granada del muro no se lanzó');
		assert(hasEvent(messages, 'grenade-exploded'), 'la granada del muro no explotó');
		assert(p2.health === 100, `la granada atravesó el muro (${p2.health} HP)`);

		// Control: misma granada sin muro de por medio → sí daña.
		const along = thicknessX
			? { x: points.a.x, z: points.a.z - 6 }
			: { x: points.a.x - 6, z: points.a.z };
		const yAlone = floorHeightAt(along.x, along.z) ?? floorY;
		const controlP1 = resetRaw(engine, 'p1', points.a.x, yA, points.a.z);
		const controlP2 = resetRaw(engine, 'p2', along.x, yAlone, along.z);
		const controlOrigin = { x: points.a.x, y: yA + 1.2, z: points.a.z };

		engine.onThrow(
			'p1',
			controlOrigin,
			{ x: 0, y: 0, z: 0 },
			controlP2.x,
			controlP2.z,
			context.startNow + 3_200
		);
		engine.tick(context.startNow + 5_800);

		assert(controlP1.alive, 'el lanzador de control murió');
		assert(
			controlP2.health < 100,
			`la granada de control no dañó (${controlP2.health} HP)`
		);
	}

	// 4) Explosión de vehículo: un muro entre el coche y la víctima corta el daño.
	{
		const context = startPlaying(14, ['p1', 'p2']);
		const { engine } = context;
		const points = sides(1.3);
		const yA = floorHeightAt(points.a.x, points.a.z) ?? floorY;
		const yB = floorHeightAt(points.b.x, points.b.z) ?? floorY;

		const vehicle = engine.rawVehicles.find((entry) => entry.kind === 'car');
		assert(vehicle, 'falta un coche para la prueba de explosión');

		// Coche pegado a la cara cercana del muro.
		vehicle.x = points.a.x;
		vehicle.y = yA;
		vehicle.z = points.a.z;
		vehicle.destroyed = false;
		vehicle.health = 1;
		vehicle.driverId = null;

		// Tirador en el mismo lado, 3 m a lo largo del muro.
		const shooterAt = thicknessX
			? { x: points.a.x, z: points.a.z - 3 }
			: { x: points.a.x - 3, z: points.a.z };
		resetRaw(engine, 'p1', shooterAt.x, yA, shooterAt.z);
		const victim = resetRaw(engine, 'p2', points.b.x, yB, points.b.z);
		const origin = { x: shooterAt.x, y: yA + 1.2, z: shooterAt.z };

		engine.onShoot(
			'p1',
			'pistol',
			origin,
			aimPoint(origin, { x: vehicle.x, y: vehicle.y + 0.5, z: vehicle.z }),
			undefined,
			context.startNow + 50
		);
		engine.tick(context.startNow + 60);

		assert(vehicle.destroyed, 'el coche no explotó');
		assert(victim.health === 100, `la explosión atravesó el muro (${victim.health} HP)`);

		// Control: víctima en el mismo lado del coche → la explosión sí la daña.
		const controlP2 = resetRaw(
			engine,
			'p2',
			thicknessX ? points.a.x : points.a.x - 6,
			yA,
			thicknessX ? points.a.z - 6 : points.a.z
		);
		const controlVehicle = engine.rawVehicles.find((entry) => entry.kind === 'car');
		controlVehicle.destroyed = false;
		controlVehicle.health = 1;
		controlVehicle.x = points.a.x;
		controlVehicle.y = yA;
		controlVehicle.z = points.a.z;
		controlVehicle.driverId = null;
		resetRaw(engine, 'p1', shooterAt.x, yA, shooterAt.z);

		engine.onShoot(
			'p1',
			'pistol',
			origin,
			aimPoint(origin, { x: controlVehicle.x, y: controlVehicle.y + 0.5, z: controlVehicle.z }),
			undefined,
			context.startNow + 900
		);
		engine.tick(context.startNow + 910);

		assert(controlVehicle.destroyed, 'el coche de control no explotó');
		assert(
			controlP2.health < 100,
			`la explosión de control no dañó (${controlP2.health} HP)`
		);
	}

	ok('anti-wallhack OK — disparos, granadas y explosiones no atraviesan muros');
}

// ---------------------------------------------------------------------------
// 3b. Vehículos: coche, globo, vida, límites y destrucción
// ---------------------------------------------------------------------------

{
	const context = startPlaying(7, ['p1', 'p2']);
	const { engine, messages, sendToCalls } = context;
	const clock = { value: context.startNow };
	const spawns = ROYALE_VEHICLE_SPAWNS;
	const carSpawn = spawns.find((spawn) => spawn.id === 'car-comercios');
	const balloonSpawn = spawns.find((spawn) => spawn.id === 'balloon-faro');
	assert(carSpawn && balloonSpawn, 'faltan los vehículos de prueba');

	// El ancla y del coche es el centro del chasis; los pies van 1 m abajo.
	landGroup(
		engine,
		engine.buildSnapshot(clock.value),
		[
			{ id: 'p1', x: carSpawn.x, y: carSpawn.y - 1, z: carSpawn.z },
			{ id: 'p2', x: carSpawn.x + 2, y: carSpawn.y - 1, z: carSpawn.z }
		],
		clock
	);

	const enterAt = clock.value + 100;
	engine.onVehicleEnter('p1', carSpawn.id, enterAt);
	clock.value = enterAt;
	engine.tick(enterAt);

	let vehicle = engine.rawVehicles.find((entry) => entry.id === carSpawn.id);
	assert(vehicle && vehicle.driverId === 'p1', 'p1 no entró en el coche');
	assert(hasEvent(messages, 'vehicle-enter'), 'falta el evento vehicle-enter');

	// También se dispara desde el coche: el servidor ignora el propio
	// vehículo del tirador, así la carrocería no se come el disparo.
	const carTarget = player(engine, 'p2', clock.value);
	const carOrigin = { x: vehicle.x, y: vehicle.y + 0.55, z: vehicle.z };
	engine.onShoot(
		'p1',
		'pistol',
		carOrigin,
		aimAt(carOrigin, { x: carTarget.x, y: carTarget.y, z: carTarget.z }),
		undefined,
		enterAt + 50
	);
	clock.value = enterAt + 50;
	engine.tick(clock.value);
	const carTargetAfter = player(engine, 'p2', clock.value);
	assert(
		carTargetAfter.health + carTargetAfter.shield < carTarget.health + carTarget.shield,
		'el disparo desde el coche no dañó al objetivo'
	);

	// Conducción válida: el conductor sigue la pose del vehículo. Se mueve
	// hacia el lado contrario a p2 para que el primer reporte no atropelle y
	// el golpe se pueda medir en el segundo.
	engine.onVehicleState(
		'p1',
		carSpawn.id,
		{
			x: carSpawn.x - 2,
			y: carSpawn.y,
			z: carSpawn.z,
			qx: 0,
			qy: 0,
			qz: 0,
			qw: 1,
			vx: 0,
			vy: 0,
			vz: 0,
			speed: 999,
			steering: 0
		},
		enterAt + 100
	);
	clock.value = enterAt + 100;
	engine.tick(clock.value);
	vehicle = engine.rawVehicles.find((entry) => entry.id === carSpawn.id);
	assert(Math.abs(vehicle.x - (carSpawn.x - 2)) < 0.01, 'el coche no se movió');
	assert(vehicle.speed <= ROYALE_CAR_MAX_SPEED, `velocidad ${vehicle.speed} sin tope`);
	assert(
		Math.abs(player(engine, 'p1', clock.value).x - vehicle.x) < 0.01,
		'el conductor no siguió al coche'
	);

	// Atropello: p2 está a 2 m y el coche circula a 10 m/s.
	const beforeRam = player(engine, 'p2', clock.value);
	engine.onVehicleState(
		'p1',
		carSpawn.id,
		{
			x: carSpawn.x + 2,
			y: carSpawn.y,
			z: carSpawn.z + 1,
			qx: 0,
			qy: 0,
			qz: 0,
			qw: 1,
			vx: 0,
			vy: 0,
			vz: 10,
			speed: 10,
			steering: 0
		},
		clock.value + 100
	);
	clock.value += 100;
	engine.tick(clock.value);
	const afterRam = player(engine, 'p2', clock.value);
	assert(
		beforeRam.health + beforeRam.shield - (afterRam.health + afterRam.shield) ===
			ROYALE_VEHICLE_RAM_DAMAGE,
		`el atropello dejó ${afterRam.health + afterRam.shield} HP+escudo`
	);

	// Salto imposible: el servidor manda corrección y no mueve el coche.
	const beforeCheat = { x: engine.rawVehicles.find((entry) => entry.id === carSpawn.id).x };
	engine.onVehicleState(
		'p1',
		carSpawn.id,
		{
			x: beforeCheat.x + 500,
			y: carSpawn.y,
			z: carSpawn.z,
			qx: 0,
			qy: 0,
			qz: 0,
			qw: 1,
			vx: 100,
			vy: 0,
			vz: 0,
			speed: 26,
			steering: 0
		},
		clock.value + 100
	);
	assert(
		sendToCalls.some(
			(call) => call.playerId === 'p1' && call.message.type === 'mg8-vehicle-correct'
		),
		'falta mg8-vehicle-correct tras un salto imposible'
	);
	assert(
		Math.abs(engine.rawVehicles.find((entry) => entry.id === carSpawn.id).x - beforeCheat.x) < 0.01,
		'el coche aceptó el teletransporte'
	);

	// Los disparos dañan el coche antes que al conductor.
	const car = engine.rawVehicles.find((entry) => entry.id === carSpawn.id);
	const shooter = player(engine, 'p2', clock.value);
	const origin = { x: shooter.x, y: shooter.y + 1.2, z: shooter.z };
	const aim = aimAt(origin, { x: car.x, y: car.y, z: car.z });
	engine.onShoot('p2', 'pistol', origin, aim, undefined, clock.value + 50);
	clock.value += 50;
	engine.tick(clock.value);
	vehicle = engine.rawVehicles.find((entry) => entry.id === carSpawn.id);
	assert(vehicle.health === vehicle.maxHealth - 17, `el coche quedó a ${vehicle.health} HP`);
	assert(hasEvent(messages, 'vehicle-hit'), 'falta el evento vehicle-hit');

	// Destrucción: explosión, eyección del conductor y evento.
	const carBefore = engine.rawVehicles.find((entry) => entry.id === carSpawn.id);
	const shooter2 = player(engine, 'p2', clock.value);
	const origin2 = { x: shooter2.x, y: shooter2.y + 1.2, z: shooter2.z };
	const aim2 = aimAt(origin2, { x: carBefore.x, y: carBefore.y, z: carBefore.z });
	carBefore.health = 5;
	const shotAt = clock.value + 500;
	engine.onShoot('p2', 'pistol', origin2, aim2, undefined, shotAt);
	clock.value = shotAt;
	engine.tick(shotAt);
	vehicle = engine.rawVehicles.find((entry) => entry.id === carSpawn.id);
	assert(vehicle.destroyed && vehicle.health === 0, 'el coche no se destruyó');
	assert(vehicle.driverId === null, 'el conductor sigue dentro del coche destruido');
	assert(hasEvent(messages, 'vehicle-destroyed'), 'falta el evento vehicle-destroyed');
	assert(
		!player(engine, 'p1', clock.value).alive || player(engine, 'p1', clock.value).health < 100,
		'la explosión no dañó al conductor'
	);

	ok('coche OK — entrar, conducir, atropellar, disparar, explotar y corregir saltos');
}

{
	const context = startPlaying(8, ['p1', 'p2']);
	const { engine, messages } = context;
	const clock = { value: context.startNow };
	const balloonSpawn = ROYALE_VEHICLE_SPAWNS.find((spawn) => spawn.id === 'balloon-faro');
	assert(balloonSpawn, 'falta el globo de prueba');

	const state = engine.buildSnapshot(clock.value);
	const balloonTarget = ROYALE_BOT_ANCHORS.find((entry) => entry.id === 'bot-10');
	assert(balloonTarget, 'falta el ancla bot-10');
	landGroup(
		engine,
		state,
		[
			{ id: 'p1', x: balloonSpawn.x, y: balloonSpawn.y - 0.02, z: balloonSpawn.z },
			{ id: 'p2', x: balloonTarget.x, y: balloonTarget.y, z: balloonTarget.z }
		],
		clock
	);

	const enterAt = clock.value + 100;
	engine.onVehicleEnter('p1', balloonSpawn.id, enterAt);
	clock.value = enterAt;
	engine.tick(enterAt);
	let balloon = engine.rawVehicles.find((entry) => entry.id === balloonSpawn.id);
	assert(balloon && balloon.driverId === 'p1', 'p1 no entró en el globo');

	// Se puede disparar desde la barquilla: el servidor ya no bloquea el
	// combate del conductor. El origen se calcula desde el asiento local.
	const targetHealth = player(engine, 'p2', clock.value).health;
	const targetShield = player(engine, 'p2', clock.value).shield;
	const balloonOrigin = {
		x: balloon.x,
		y: balloon.y + ROYALE_BALLOON_SEAT_OFFSET + 1.2,
		z: balloon.z
	};
	engine.onShoot(
		'p1',
		'pistol',
		balloonOrigin,
		aimAt(balloonOrigin, { x: balloonTarget.x, y: balloonTarget.y, z: balloonTarget.z }),
		undefined,
		clock.value + 100
	);
	clock.value += 100;
	engine.tick(clock.value);
	const targetAfter = player(engine, 'p2', clock.value);
	assert(
		targetAfter.health + targetAfter.shield < targetHealth + targetShield,
		'el disparo desde el globo no dañó al objetivo'
	);

	// Recargar también funciona desde la barquilla: antes el vehículo ocupado
	// bloqueaba `onReload` y el arma quedaba seca en pleno vuelo.
	const shooterAt = raw(engine, 'p1');
	assert(shooterAt.magAmmo === 11, `cargador tras disparar=${shooterAt.magAmmo}`);
	const reserveBefore = shooterAt.reserveAmmo;
	engine.onReload('p1', clock.value + 500);
	clock.value += 500;
	engine.tick(clock.value);
	assert(shooterAt.magAmmo === 12, `cargador tras recargar=${shooterAt.magAmmo}`);
	assert(
		shooterAt.reserveAmmo === reserveBefore - 1,
		`reserva tras recargar=${shooterAt.reserveAmmo}`
	);

	// Primer reporte: se aceptan los topes sin corrección por teleport.
	engine.onVehicleState(
		'p1',
		balloonSpawn.id,
		{
			x: ROYALE_MAP_BOUNDS.maxX + 100,
			y: balloonSpawn.y - 20,
			z: balloonSpawn.z,
			qx: 0,
			qy: 0,
			qz: 0,
			qw: 1,
			vx: 0,
			vy: -10,
			vz: 0,
			speed: 5,
			steering: 0
		},
		enterAt + 100
	);
	clock.value += 100;
	engine.tick(clock.value);
	balloon = engine.rawVehicles.find((entry) => entry.id === balloonSpawn.id);
	assert(
		Math.abs(balloon.x - (ROYALE_MAP_BOUNDS.maxX - ROYALE_BALLOON_BOUNDS_MARGIN)) < 0.01,
		`el globo salió del margen: x=${balloon.x}`
	);
	assert(Math.abs(balloon.y - balloonSpawn.y) < 0.01, `el globo bajó del suelo: y=${balloon.y}`);

	// Techo de altitud.
	engine.onVehicleState(
		'p1',
		balloonSpawn.id,
		{
			x: balloon.x,
			y: ROYALE_BALLOON_MAX_Y + 40,
			z: balloon.z,
			qx: 0,
			qy: 0,
			qz: 0,
			qw: 1,
			vx: 0,
			vy: 6,
			vz: 0,
			speed: 0,
			steering: 0
		},
		clock.value + 100
	);
	clock.value += 100;
	engine.tick(clock.value);
	balloon = engine.rawVehicles.find((entry) => entry.id === balloonSpawn.id);
	assert(Math.abs(balloon.y - ROYALE_BALLOON_MAX_Y) < 0.01, `techo del globo y=${balloon.y}`);

	// Salir en vuelo deja planeando y el evento trae el punto de abandono.
	engine.onVehicleExit('p1', clock.value + 100);
	clock.value += 100;
	engine.tick(clock.value);
	const exitEvent = events(messages).find(
		(event) => event.kind === 'vehicle-exit' && event.playerId === 'p1'
	);
	assert(exitEvent, 'falta el evento vehicle-exit del globo');
	assert(exitEvent.mode === 'glide', `modo de salida ${exitEvent.mode}`);
	assert(
		typeof exitEvent.px === 'number' &&
			typeof exitEvent.py === 'number' &&
			typeof exitEvent.pz === 'number',
		'el evento de salida no trae el punto de abandono'
	);
	assert(
		Math.abs(exitEvent.py - (balloon.y + ROYALE_BALLOON_SEAT_OFFSET)) < 0.05,
		`punto de abandono y=${exitEvent.py}`
	);

	ok('globo OK — entrar, disparar, recargar, limitar altura/mapa y salir planeando');
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
// 5. Agua = rescate en la orilla (a pie y con coche), tormenta = muerte
// ---------------------------------------------------------------------------

{
	// Caer al mar no mata: el servidor devuelve al jugador a la celda
	// caminable más cercana conservando vida y escudo.
	const context = startPlaying(5, ['p1', 'p2']);
	const { engine, messages, sendToCalls } = context;
	const p1Raw = raw(engine, 'p1');
	p1Raw.y = ROYALE_WATER_RESCUE_Y - 6;
	p1Raw.mode = 'ground';
	const healthBefore = p1Raw.health;
	const shieldBefore = p1Raw.shield;

	engine.tick(context.startNow + 100);
	const p1 = player(engine, 'p1', context.startNow + 100);
	assert(p1.alive, 'p1 murió al caer al mar');
	assert(
		p1.y > ROYALE_WATER_RESCUE_Y,
		`p1 no volvió a la orilla: y=${p1.y}`
	);
	assert(
		p1.health === healthBefore && p1.shield === shieldBefore,
		'el rescate del agua quitó vida o escudo'
	);
	assert(player(engine, 'p2', context.startNow + 100).alive, 'el rescate mató a p2');
	assert(engine.phaseName === 'playing', `fase tras rescate=${engine.phaseName}`);

	const correction = sendToCalls.find(
		(call) => call.playerId === 'p1' && call.message.type === 'mg8-correct'
	);
	assert(
		correction && correction.message.correct.reason === 'water-rescue',
		`corrección de agua=${correction?.message?.correct?.reason}`
	);
	assert(
		hasEvent(messages, 'player-landed'),
		'falta player-landed al rescatar del agua'
	);
	assert(
		!events(messages).some(
			(event) => event.kind === 'player-died' && event.playerId === 'p1'
		),
		'el agua emitió player-died'
	);

	// Con coche: el conductor abandona el vehículo y reaparece en la orilla,
	// sin corrección extra que pudiera pisar el punto del rescate.
	const carSpawn = ROYALE_VEHICLE_SPAWNS.find((spawn) => spawn.kind === 'car');
	assert(carSpawn, 'falta un coche de prueba');
	const clock = { value: context.startNow + 200 };
	const seated = raw(engine, 'p1');
	seated.x = carSpawn.x;
	seated.y = carSpawn.y - 1;
	seated.z = carSpawn.z;
	seated.mode = 'ground';
	engine.tick(clock.value);
	assert(
		raw(engine, 'p1').alive,
		'p1 murió al colocarse junto al coche de prueba'
	);

	engine.onVehicleEnter('p1', carSpawn.id, clock.value + 100);
	clock.value += 100;
	engine.tick(clock.value);
	assert(
		engine.rawVehicles.find((entry) => entry.id === carSpawn.id)?.driverId === 'p1',
		'p1 no entró en el coche para la prueba de agua'
	);

	engine.onVehicleState(
		'p1',
		carSpawn.id,
		{
			x: carSpawn.x,
			y: ROYALE_WATER_RESCUE_Y - 6,
			z: carSpawn.z,
			qx: 0,
			qy: 0,
			qz: 0,
			qw: 1,
			vx: 0,
			vy: -6,
			vz: 0,
			speed: 0,
			steering: 0
		},
		clock.value + 100
	);
	clock.value += 100;
	engine.tick(clock.value);

	const driver = player(engine, 'p1', clock.value);
	assert(driver.alive, 'el conductor murió al hundir el coche');
	assert(driver.y > ROYALE_WATER_RESCUE_Y, `conductor sin rescatar: y=${driver.y}`);
	const abandoned = engine.rawVehicles.find((entry) => entry.id === carSpawn.id);
	assert(abandoned && abandoned.driverId === null, 'el coche no se abandonó al hundirse');
	const exit = events(messages)
		.filter((event) => event.kind === 'vehicle-exit' && event.playerId === 'p1')
		.pop();
	assert(exit && exit.mode === 'ground', `salida del coche=${exit?.mode}`);
	assert(
		Math.abs(exit.px - driver.x) < 0.05 && Math.abs(exit.pz - driver.z) < 0.05,
		'el evento de salida no apunta a la orilla'
	);

	ok('agua OK — rescate en la orilla a pie y con coche, sin muerte');
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

	ok('tormenta OK — daño sin autor, sin respawn y con puesto');
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
