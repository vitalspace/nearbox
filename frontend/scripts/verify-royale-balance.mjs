/**
 * `royale:balance` — verifica el balance de Skyfall Royale sin navegador.
 *
 *   1. Estadísticas exactas de las 4 armas y TTK razonable contra 100 HP.
 *   2. Reparto del loot: 10 000 tiradas + 200 partidas reales de 70 anclas.
 *   3. Topes de vida, escudo, munición, granadas y radios de recogida.
 *   4. Relleno con bots: 1 humano + 11 bots, sustitución en countdown y
 *      `ROYALE_FULL` al superar 12 humanos.
 *   5. Los bots nunca reciben `sendTo` ni ocupan plazas de `maxPlayers`.
 *
 * Se ejecuta con Bun: `bun scripts/verify-royale-balance.mjs`.
 */
import { Royale } from '../src/server/engines/royale.ts';
import {
	ROYALE_AMMO_PICKUP,
	ROYALE_BOT_FILL,
	ROYALE_COUNTDOWN_MS,
	ROYALE_GRENADE_RADIUS,
	ROYALE_HEALTH_MAX,
	ROYALE_LOOT_RADIUS,
	ROYALE_LOOT_TABLE,
	ROYALE_LOOT_VERTICAL,
	ROYALE_MAX_AMMO,
	ROYALE_MAX_GRENADES,
	ROYALE_MAX_PLAYERS,
	ROYALE_MEDKIT_HEAL,
	ROYALE_SHIELD_MAX,
	ROYALE_SHIELD_PICKUP,
	ROYALE_STARTER_AMMO,
	ROYALE_STARTER_GRENADES,
	ROYALE_STARTER_WEAPON,
	ROYALE_WEAPON_LOOT_TABLE,
	ROYALE_WEAPONS,
	royaleRollLoot
} from '../src/lib/state/royaleConfig.ts';

function fail(message) {
	console.error(`royale:balance ✗ ${message}`);
	process.exit(1);
}

function ok(message) {
	console.log(`royale:balance ✓ ${message}`);
}

function assert(condition, message) {
	if (!condition) fail(message);
}

function round(value, digits = 2) {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}

function close(actual, expected, tolerance, label) {
	assert(
		Math.abs(actual - expected) <= tolerance,
		`${label}: ${round(actual, 3)}, esperado ${expected} ±${tolerance}`
	);
}

function createEngine(seed) {
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
		{ seed, botsEnabled: true }
	);

	return { engine, messages, lobbyCalls, sendToCalls };
}

// ---------------------------------------------------------------------------
// 1. Armas y TTK
// ---------------------------------------------------------------------------

const expectedWeapons = {
	pistol: { damage: 12, rate: 6, range: 55, magSize: 12, pellets: 1, spread: 0 },
	shotgun: { damage: 6, rate: 1.2, range: 32, magSize: 6, pellets: 8, spread: (7 * Math.PI) / 180 },
	smg: { damage: 9, rate: 11, range: 42, magSize: 30, pellets: 1, spread: 0 },
	rifle: { damage: 46, rate: 1.5, range: 130, magSize: 5, pellets: 1, spread: 0 }
};

assert(ROYALE_WEAPONS.length === 4, `${ROYALE_WEAPONS.length} armas, se esperaban 4`);

for (const [id, expected] of Object.entries(expectedWeapons)) {
	const weapon = ROYALE_WEAPONS.find((entry) => entry.id === id);
	assert(weapon, `falta el arma ${id}`);

	for (const [key, value] of Object.entries(expected)) {
		const actual = weapon[key];
		assert(
			typeof actual === 'number' && Math.abs(actual - value) <= 1e-9,
			`${id}.${key}=${actual}, se esperaba ${value}`
		);
	}
}

/**
 * TTK teórico contra 100 HP sin escudo: disparos necesarios y tiempo hasta el
 * último disparo (el primero cae en t=0).
 */
function timeToKill(weapon, health = ROYALE_HEALTH_MAX) {
	const perShot = weapon.damage * Math.max(1, weapon.pellets);
	const shots = Math.ceil(health / perShot);
	return { shots, seconds: (shots - 1) / weapon.rate, damage: perShot * shots };
}

const ttk = {};
for (const weapon of ROYALE_WEAPONS) {
	ttk[weapon.id] = timeToKill(weapon);
}

// Bandas de diseño: ninguna arma debe matar de un toque ni tardar más de 3 s
// con el cargador completo a bocajarro.
for (const [id, result] of Object.entries(ttk)) {
	assert(
		result.seconds >= 0.5 && result.seconds <= 3,
		`${id} TTK=${round(result.seconds)} s fuera de 0.5–3 s`
	);
}

close(ttk.pistol.seconds, 1.33, 0.02, 'pistol TTK');
close(ttk.shotgun.seconds, 1.67, 0.02, 'shotgun TTK');
close(ttk.smg.seconds, 1, 0.02, 'smg TTK');
close(ttk.rifle.seconds, 1.33, 0.02, 'rifle TTK');

assert(ttk.pistol.shots === 9, `pistol necesita ${ttk.pistol.shots} disparos`);
assert(ttk.shotgun.shots === 3, `shotgun necesita ${ttk.shotgun.shots} disparos`);
assert(ttk.smg.shots === 12, `smg necesita ${ttk.smg.shots} disparos`);
assert(ttk.rifle.shots === 3, `rifle necesita ${ttk.rifle.shots} disparos`);

ok(
	`armas OK — TTK ${Object.entries(ttk)
		.map(([id, value]) => `${id} ${round(value.seconds)} s`)
		.join(', ')}`
);

// ---------------------------------------------------------------------------
// 2. Reparto del loot
// ---------------------------------------------------------------------------

assert(ROYALE_LOOT_TABLE.length === 5, 'la tabla de loot necesita 5 categorías');
const lootWeights = Object.fromEntries(
	ROYALE_LOOT_TABLE.map((entry) => [entry.kind, entry.weight])
);
assert(lootWeights.weapon === 45, `peso weapon=${lootWeights.weapon}`);
assert(lootWeights.ammo === 20, `peso ammo=${lootWeights.ammo}`);
assert(lootWeights.shield === 13, `peso shield=${lootWeights.shield}`);
assert(lootWeights.medkit === 12, `peso medkit=${lootWeights.medkit}`);
assert(lootWeights.grenade === 10, `peso grenade=${lootWeights.grenade}`);

const weaponWeights = Object.fromEntries(
	ROYALE_WEAPON_LOOT_TABLE.map((entry) => [entry.weapon, entry.weight])
);
assert(weaponWeights.shotgun === 30, `peso shotgun=${weaponWeights.shotgun}`);
assert(weaponWeights.smg === 30, `peso smg=${weaponWeights.smg}`);
assert(weaponWeights.rifle === 20, `peso rifle=${weaponWeights.rifle}`);
assert(weaponWeights.pistol === 20, `peso pistol=${weaponWeights.pistol}`);

const ROLLS = 10_000;
const kindCounts = { weapon: 0, ammo: 0, shield: 0, medkit: 0, grenade: 0 };
const weaponCounts = { pistol: 0, shotgun: 0, smg: 0, rifle: 0 };

for (let index = 0; index < ROLLS; index += 1) {
	const roll = royaleRollLoot(((index + 1) * 2654435761) >>> 0);
	kindCounts[roll.kind] += 1;

	if (roll.kind === 'weapon') {
		assert(roll.weapon, 'un arma sin id de arma');
		weaponCounts[roll.weapon] += 1;
	} else {
		assert(roll.weapon === null, `${roll.kind} no debería traer arma`);
	}
}

const expectedKinds = { weapon: 45, ammo: 20, shield: 13, medkit: 12, grenade: 10 };
for (const [kind, expected] of Object.entries(expectedKinds)) {
	const percent = (kindCounts[kind] / ROLLS) * 100;
	close(percent, expected, 2, `loot ${kind} %`);
}

const weaponTotal = Object.values(weaponCounts).reduce((sum, count) => sum + count, 0);
for (const [weapon, expected] of Object.entries({ shotgun: 30, smg: 30, rifle: 20, pistol: 20 })) {
	const percent = (weaponCounts[weapon] / weaponTotal) * 100;
	close(percent, expected, 3, `arma ${weapon} %`);
}

ok(
	`loot 10 000 tiradas OK — ${Object.entries(kindCounts)
		.map(([kind, count]) => `${kind} ${round((count / ROLLS) * 100, 1)} %`)
		.join(', ')}`
);

// 200 partidas reales: cada una resuelve sus 70 anclas con la semilla.
const spawnKinds = { weapon: 0, ammo: 0, shield: 0, medkit: 0, grenade: 0 };
const spawnWeapons = { pistol: 0, shotgun: 0, smg: 0, rifle: 0 };
let spawnTotal = 0;

for (let seed = 1; seed <= 200; seed += 1) {
	const { engine } = createEngine(seed);
	let now = 1_700_000_000_000;
	engine.onEnter('human', 'Human', now);
	now += ROYALE_COUNTDOWN_MS + 1;
	engine.tick(now);
	assert(engine.phaseName === 'playing', `semilla ${seed} no arrancó la partida`);

	for (const loot of engine.rawLoot) {
		spawnKinds[loot.kind] += 1;
		spawnTotal += 1;
		if (loot.kind === 'weapon') {
			assert(loot.weapon, `semilla ${seed}: arma sin id`);
			spawnWeapons[loot.weapon] += 1;
		} else {
			assert(loot.weapon === null, `semilla ${seed}: ${loot.kind} con arma`);
		}
	}
}

assert(spawnTotal === 200 * 70, `${spawnTotal} spawns de loot, se esperaban 14 000`);

for (const [kind, expected] of Object.entries(expectedKinds)) {
	const percent = (spawnKinds[kind] / spawnTotal) * 100;
	close(percent, expected, 2.5, `spawn ${kind} %`);
}

const spawnWeaponTotal = Object.values(spawnWeapons).reduce((sum, count) => sum + count, 0);
for (const [weapon, expected] of Object.entries({ shotgun: 30, smg: 30, rifle: 20, pistol: 20 })) {
	const percent = (spawnWeapons[weapon] / spawnWeaponTotal) * 100;
	close(percent, expected, 4, `spawn arma ${weapon} %`);
}

ok(
	`loot 200 partidas OK — ${Object.entries(spawnKinds)
		.map(([kind, count]) => `${kind} ${round((count / spawnTotal) * 100, 1)} %`)
		.join(', ')}`
);

// ---------------------------------------------------------------------------
// 3. Topes, recogida y loadout inicial
// ---------------------------------------------------------------------------

close(ROYALE_HEALTH_MAX, 100, 0, 'vida máxima');
close(ROYALE_SHIELD_MAX, 100, 0, 'escudo máximo');
close(ROYALE_MAX_AMMO, 300, 0, 'munición máxima');
close(ROYALE_MAX_GRENADES, 4, 0, 'granadas máximas');
close(ROYALE_LOOT_RADIUS, 1.8, 0, 'radio de recogida');
close(ROYALE_LOOT_VERTICAL, 2.5, 0, 'radio vertical de recogida');
close(ROYALE_AMMO_PICKUP, 60, 0, 'munición por pickup');
close(ROYALE_MEDKIT_HEAL, 40, 0, 'curación de botiquín');
close(ROYALE_SHIELD_PICKUP, 50, 0, 'escudo por pickup');
close(ROYALE_GRENADE_RADIUS, 4.5, 0, 'radio de granada');
close(ROYALE_STARTER_AMMO, 60, 0, 'reserva inicial');
close(ROYALE_STARTER_GRENADES, 0, 0, 'granadas iniciales');
assert(ROYALE_STARTER_WEAPON === 'pistol', `arma inicial=${ROYALE_STARTER_WEAPON}`);

// Loadout inicial real de un humano al empezar la partida.
{
	const { engine } = createEngine(42);
	let now = 1_700_000_000_000;
	engine.onEnter('p1', 'Human', now);
	now += ROYALE_COUNTDOWN_MS + 1;
	engine.tick(now);

	const state = engine.buildSnapshot(now).players.find((player) => player.id === 'p1');
	assert(state, 'no se encontró al humano');
	assert(state.health === 100 && state.shield === 0, 'vida/escudo iniciales incorrectos');
	assert(state.weapon === 'pistol', `arma inicial=${state.weapon}`);
	assert(state.magAmmo === 12, `cargador inicial=${state.magAmmo}`);
	assert(state.reserveAmmo === 60, `reserva inicial=${state.reserveAmmo}`);
	assert(state.grenades === 0, `granadas iniciales=${state.grenades}`);
	assert(state.inventory.length === 1, `inventario inicial=${state.inventory.length}`);
	assert(state.inventory[0].weapon === 'pistol', 'el inventario inicial no es la pistola');
}

ok('topes, radios y loadout inicial OK');

// ---------------------------------------------------------------------------
// 4. Relleno con bots, sustitución y límite de humanos
// ---------------------------------------------------------------------------

{
	const { engine, sendToCalls } = createEngine(7);
	let now = 1_700_000_000_000;
	engine.onEnter('p1', 'Human', now);
	now += 1_000;

	let snapshot = engine.buildSnapshot(now);
	assert(snapshot.phase === 'countdown', `fase inicial=${snapshot.phase}`);
	assert(snapshot.humans === 1, `humanos=${snapshot.humans}`);
	assert(snapshot.bots === 11, `bots=${snapshot.bots}`);
	assert(snapshot.players.length === 12, `participantes=${snapshot.players.length}`);
	assert(!snapshot.waitingForPlayers, 'con un humano no debe esperar');

	const botNames = new Set();
	for (const player of snapshot.players.filter((entry) => entry.isBot)) {
		assert(!botNames.has(player.name), `nombre de bot duplicado: ${player.name}`);
		botNames.add(player.name);
		assert(player.name !== 'Human', 'un bot usa el nombre del humano');
		assert(player.alive, `el bot ${player.name} no está vivo`);
	}

	// Un segundo humano retira un bot.
	engine.onEnter('p2', 'Second', now + 10);
	now += 100;
	snapshot = engine.buildSnapshot(now);
	assert(
		snapshot.humans === 2 && snapshot.bots === 10,
		`2 humanos → ${snapshot.humans}/${snapshot.bots}`
	);

	// Si sale un humano en countdown, vuelve a entrar un bot.
	engine.onLeave('p2', now + 10);
	now += 100;
	snapshot = engine.buildSnapshot(now);
	assert(
		snapshot.humans === 1 && snapshot.bots === 11,
		`tras salir → ${snapshot.humans}/${snapshot.bots}`
	);

	// Hasta 12 humanos: los bots desaparecen.
	for (let index = 2; index <= 12; index += 1) {
		engine.onEnter(`h${index}`, `Human ${index}`, now + index * 10);
	}

	now += 1_000;
	snapshot = engine.buildSnapshot(now);
	assert(snapshot.humans === 12, `humanos=${snapshot.humans}`);
	assert(snapshot.bots === 0, `bots=${snapshot.bots}`);
	assert(snapshot.players.length === 12, `participantes=${snapshot.players.length}`);

	// El humano 13 se rechaza sin tocar la partida.
	const rejected = engine.onEnter('h13', 'Human 13', now + 20);
	assert(rejected.ok === false && rejected.code === 'ROYALE_FULL', 'el humano 13 no fue rechazado');
	assert(engine.humanCountValue === 12, `humanos tras rechazo=${engine.humanCountValue}`);

	// Los bots nunca reciben `sendTo` (solo los humanos con correcciones).
	for (const call of sendToCalls) {
		const player = engine.rawPlayers.find((entry) => entry.id === call.playerId);
		assert(!player || !player.isBot, `sendTo llamado para el bot ${call.playerId}`);
	}

	ok('relleno OK — 1 humano + 11 bots, sustitución en countdown y ROYALE_FULL a 13');
}

// ---------------------------------------------------------------------------
// 5. Sin humanos no hay bots ni simulación
// ---------------------------------------------------------------------------

{
	const { engine } = createEngine(9);
	assert(engine.playerCount === 0, 'la room vacía tiene jugadores');
	assert(engine.botCountValue === 0, 'la room vacía tiene bots');

	engine.tick(1_700_000_000_000);
	assert(engine.phaseName === 'idle', `room vacía en fase ${engine.phaseName}`);
	assert(engine.playerCount === 0, 'la room vacía simuló participantes');
	assert(engine.lootCount === 0, 'la room vacía generó loot');
}

// En `playing` no se rellena ni se permite entrar.
{
	const { engine } = createEngine(11);
	let now = 1_700_000_000_000;
	engine.onEnter('solo', 'Solo', now);
	now += ROYALE_COUNTDOWN_MS + 1;
	engine.tick(now);
	assert(engine.phaseName === 'playing', `fase=${engine.phaseName}`);
	assert(engine.botCountValue === 11, `bots en playing=${engine.botCountValue}`);

	const rejected = engine.onEnter('late', 'Late', now + 1_000);
	assert(
		rejected.ok === false && rejected.code === 'ROYALE_IN_PROGRESS',
		'entrar en playing no fue rechazado'
	);

	assert(engine.botCountValue === 11, 'un humano tardío alteró el relleno de bots');
}

ok('salas vacías y entrada tardía OK');
console.log('royale:balance ✓ todo correcto');
