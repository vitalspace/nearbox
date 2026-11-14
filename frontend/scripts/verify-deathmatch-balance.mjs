/**
 * `dm:balance` — simula entradas, salidas y reconexiones contra el motor
 * autoritativo de Witch House Deathmatch y comprueba:
 *
 *   1. Con 1–12 jugadores, `abs(coven − hunters) ≤ 1` en `idle`/`countdown`.
 *   2. El reparto esperado: 2 → 1v1, 3 → 2v1, 11 → 6v5, 12 → 6v6.
 *   3. Al salir un jugador de más se rebalancea al más reciente y se emite
 *      `team-changed`.
 *   4. En `playing` no se rebalancea a nadie, ni al salir ni al entrar.
 *   5. Reconexión dentro de 20 s: mismo equipo.
 *   6. El jugador 13 recibe `DM_FULL`.
 *
 * Se ejecuta con Bun: `bun scripts/verify-deathmatch-balance.mjs`.
 */
import { Deathmatch } from '../src/server/engines/deathmatch.ts';
import { DM_COUNTDOWN_MS } from '../src/lib/state/dmConfig.ts';

function fail(message) {
	console.error(`dm:balance ✗ ${message}`);
	process.exit(1);
}

function ok(message) {
	console.log(`dm:balance ✓ ${message}`);
}

function assert(condition, message) {
	if (!condition) {
		fail(message);
	}
}

function teams(engine) {
	const counts = { coven: 0, hunters: 0 };

	for (const player of engine.teamSnapshot) {
		if (player.team !== 'coven' && player.team !== 'hunters') {
			fail(`jugador ${player.id} sin equipo válido: ${player.team}`);
		}

		counts[player.team] += 1;
	}

	return counts;
}

function assertBalanced(engine, label) {
	const counts = teams(engine);
	const total = counts.coven + counts.hunters;

	assert(total === engine.playerCount, `${label}: faltan jugadores sin equipo`);
	assert(
		Math.abs(counts.coven - counts.hunters) <= 1,
		`${label}: equipos desbalanceados ${counts.coven} vs ${counts.hunters} (${total} jugadores)`
	);

	return counts;
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

function enter(engine, id, now, name = id) {
	const result = engine.onEnter(id, name, now);

	if (!result.ok) {
		fail(`onEnter(${id}) rechazado: ${result.code} ${result.message}`);
	}

	return result;
}

// ---------------------------------------------------------------------------
// 1. Reparto progresivo 1–12
// ---------------------------------------------------------------------------

{
	const { engine } = createEngine();
	let now = 1_000;

	const expected = {
		1: [1, 0],
		2: [1, 1],
		3: [2, 1],
		4: [2, 2],
		5: [3, 2],
		6: [3, 3],
		7: [4, 3],
		8: [4, 4],
		9: [5, 4],
		10: [5, 5],
		11: [6, 5],
		12: [6, 6]
	};

	for (let count = 1; count <= 12; count += 1) {
		enter(engine, `p${count}`, now);
		now += 10;
		const counts = assertBalanced(engine, `tras ${count} entradas`);
		const [coven, hunters] = expected[count];

		assert(
			counts.coven === coven && counts.hunters === hunters,
			`tras ${count} entradas: ${counts.coven} vs ${counts.hunters}, se esperaba ${coven} vs ${hunters}`
		);
	}

	const rejected = engine.onEnter('p13', 'overflow', now);
	assert(!rejected.ok && rejected.code === 'DM_FULL', 'el jugador 13 debería recibir DM_FULL');
	assert(engine.playerCount === 12, 'el jugador 13 no debe entrar');

	ok('entradas 1–12 OK — 2→1v1, 3→2v1, 11→6v5, 12→6v6 y 13→DM_FULL');
}

// ---------------------------------------------------------------------------
// 2. Rebalanceo al salir en countdown (mueve al más reciente)
// ---------------------------------------------------------------------------

{
	const { engine, messages } = createEngine();
	let now = 5_000;

	for (const id of ['a', 'b', 'c', 'd', 'e']) {
		enter(engine, id, now);
		now += 10;
	}

	let counts = assertBalanced(engine, '5 jugadores');
	assert(
		counts.coven === 3 && counts.hunters === 2,
		`5 jugadores: ${counts.coven} vs ${counts.hunters}`
	);

	// El equipo grande (coven, 3) tiene como más reciente a `e`; al salir un
	// hunter queda 3 vs 1 y el motor debe mover a `e` a hunters (2 vs 2).
	const largeTeam = counts.coven > counts.hunters ? 'coven' : 'hunters';
	const newestLarge = engine.teamSnapshot.filter((p) => p.team === largeTeam).at(-1)?.id;
	const smallTeam = largeTeam === 'coven' ? 'hunters' : 'coven';
	const smallPlayer = engine.teamSnapshot.find((p) => p.team === smallTeam)?.id;

	assert(newestLarge && smallPlayer, 'no se pudo identificar a los jugadores del rebalanceo');

	messages.length = 0;
	engine.onLeave(smallPlayer, now);
	now += 10;

	counts = assertBalanced(engine, 'tras salida + rebalanceo');
	assert(
		counts.coven === 2 && counts.hunters === 2,
		`rebalanceo: ${counts.coven} vs ${counts.hunters}, se esperaba 2 vs 2`
	);

	const moved = engine.teamSnapshot.find((p) => p.id === newestLarge);
	assert(
		moved?.team === smallTeam,
		`no se movió al jugador más reciente (${newestLarge}) al equipo pequeño`
	);

	const teamChanged = messages.find(
		(message) => message.type === 'mg6-event' && message.event?.kind === 'team-changed'
	);
	assert(teamChanged, 'no se emitió team-changed al rebalancear');

	ok('rebalanceo OK — al salir con diferencia > 1 se mueve al más reciente y emite team-changed');
}

// ---------------------------------------------------------------------------
// 2b. Re-entradas/reconexiones: volver a su equipo no puede romper el balance
// ---------------------------------------------------------------------------

{
	const { engine, messages } = createEngine();
	let now = 8_000;

	for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) {
		enter(engine, id, now);
		now += 10;
	}

	assertBalanced(engine, '6 jugadores');

	const covenIds = engine.teamSnapshot.filter((p) => p.team === 'coven').map((p) => p.id);
	assert(covenIds.length === 3, `se esperaban 3 coven, hay ${covenIds.length}`);

	// Los 3 coven salen: el rebalanceo mueve hunters a coven y los deja 1 vs 2.
	for (const id of covenIds) {
		engine.onLeave(id, now);
		now += 10;
	}

	assertBalanced(engine, 'tras salir los 3 coven');

	// Vuelven los 3 dentro de la ventana de reconexión (mismo equipo): sin el
	// rebalanceo en `onEnter` quedarían 4 vs 2.
	messages.length = 0;

	for (const id of covenIds) {
		enter(engine, id, now + 1_000);
		now += 10;
	}

	const counts = assertBalanced(engine, 'tras volver a entrar los 3 coven');
	assert(
		counts.coven === 3 && counts.hunters === 3,
		`re-entradas: ${counts.coven} vs ${counts.hunters}, se esperaba 3 vs 3`
	);

	const teamChanged = messages.find(
		(message) => message.type === 'mg6-event' && message.event?.kind === 'team-changed'
	);
	assert(teamChanged, 'no se emitió team-changed al reequilibrar por una re-entrada');

	ok('re-entradas OK — reconectar dentro de 20 s no deja los equipos desbalanceados');
}

// ---------------------------------------------------------------------------
// 3. En playing no se rebalancea
// ---------------------------------------------------------------------------

{
	const { engine } = createEngine();
	let now = 10_000;

	enter(engine, 'p1', now);
	enter(engine, 'p2', now + 10);
	now += 20;

	engine.tick(now);
	assert(engine.phaseName === 'countdown', 'la fase debería ser countdown');

	engine.tick(now + DM_COUNTDOWN_MS + 1);
	now += DM_COUNTDOWN_MS + 1;
	assert(engine.phaseName === 'playing', 'la fase debería ser playing');

	const before = teams(engine);
	const leaving = engine.teamSnapshot.find((p) => p.team === 'hunters')?.id;
	assert(leaving, 'no hay jugador hunter para probar la salida');

	engine.onLeave(leaving, now);
	now += 10;
	engine.tick(now);

	const after = teams(engine);
	assert(
		after.coven === before.coven && after.hunters === before.hunters - 1,
		`playing rebalanceó al salir: ${before.coven} vs ${before.hunters} → ${after.coven} vs ${after.hunters}`
	);

	// Entrar en playing va al equipo con menos jugadores, sin tocar al resto.
	enter(engine, 'late', now);
	now += 10;
	engine.tick(now);
	const latePlayer = engine.teamSnapshot.find((p) => p.id === 'late');
	assert(latePlayer, 'el jugador tardío no entró');
	assert(engine.phaseName === 'playing', 'entrar a mitad de partida no debe reiniciar la fase');

	ok('playing OK — ni salidas ni entradas mueven a los jugadores existentes');
}

// ---------------------------------------------------------------------------
// 4. Reconexión con el mismo equipo
// ---------------------------------------------------------------------------

{
	const { engine } = createEngine();
	let now = 20_000;

	enter(engine, 're1', now);
	enter(engine, 're2', now + 10);
	now += 20;
	engine.tick(now);
	engine.tick(now + DM_COUNTDOWN_MS + 1);
	now += DM_COUNTDOWN_MS + 1;

	const original = engine.teamSnapshot.find((p) => p.id === 're1');
	assert(original, 'no se encontró re1');

	engine.onLeave('re1', now);
	now += 5_000;
	enter(engine, 're1', now, 're1');

	const reconnected = engine.teamSnapshot.find((p) => p.id === 're1');
	assert(reconnected, 're1 no volvió a entrar');
	assert(
		reconnected.team === original.team,
		`reconexión: re1 volvió como ${reconnected.team}, se esperaba ${original.team}`
	);

	ok('reconexión OK — mismo equipo dentro de la ventana de 20 s');
}

// ---------------------------------------------------------------------------
// 5. Sala vacía → reset
// ---------------------------------------------------------------------------

{
	const { engine } = createEngine();
	let now = 30_000;

	enter(engine, 'solo1', now);
	enter(engine, 'solo2', now + 10);
	now += 20;
	engine.tick(now + DM_COUNTDOWN_MS + 1);

	engine.onLeave('solo1', now);
	engine.onLeave('solo2', now);

	assert(
		engine.phaseName === 'idle',
		`la sala vacía debería volver a idle, está en ${engine.phaseName}`
	);
	assert(engine.playerCount === 0, 'la sala vacía conserva jugadores');
	assert(
		engine.teamScore.coven === 0 && engine.teamScore.hunters === 0,
		'la sala vacía conserva scores'
	);

	ok('reset OK — sala vacía vuelve a idle y limpia jugadores/scores');
}

console.log('dm:balance ✓ todo correcto');
