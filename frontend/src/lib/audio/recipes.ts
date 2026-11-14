import type { Mg5MonsterKind } from '../state/wavesConfig';
import {
	applyFilterSweep,
	fadeEdges,
	formantLayer,
	mix,
	mixInto,
	normalize,
	randBetween,
	renderNoise,
	renderTone,
	seamlessLoop,
	softClip,
	type Formant,
	type NoiseKind,
	type WaveShape
} from './dsp';
import type { BusId, Recipe, SoundPriority, SurfaceId } from './types';

type FootstepId = `footstep_${SurfaceId}_${0 | 1 | 2}`;
type MonsterSoundId = `monster_${Mg5MonsterKind}_${'idle' | 'attack' | 'hurt' | 'death'}`;
type AmbienceZone =
	'centro' | 'bosque' | 'castillo' | 'calabazar' | 'cementerio' | 'crypt' | 'race' | 'waves';
type AmbienceId = `ambience_${AmbienceZone}`;

export type SoundId =
	| FootstepId
	| MonsterSoundId
	| AmbienceId
	| 'jump'
	| 'land'
	| 'player_hurt_light'
	| 'player_hurt_heavy'
	| 'player_downed'
	| 'player_revive'
	| 'player_heal'
	| 'pickup_weapon'
	| 'pickup_ammo'
	| 'pickup_grenade'
	| 'pickup_health'
	| 'checkpoint'
	| 'shot_pistol'
	| 'shot_shotgun'
	| 'shot_smg'
	| 'shot_rifle'
	| 'dry_fire'
	| 'reload_start'
	| 'reload_end'
	| 'shell_drop'
	| 'grenade_throw'
	| 'grenade_bounce'
	| 'explosion'
	| 'acid_throw'
	| 'acid_impact'
	| 'acid_sizzle'
	| 'hit_flesh'
	| 'hit_bone'
	| 'hit_stone'
	| 'hit_wood'
	| 'car_engine'
	| 'car_tire'
	| 'car_impact_light'
	| 'car_impact_heavy'
	| 'car_rollover'
	| 'car_explosion'
	| 'car_enter'
	| 'car_exit'
	| 'missile_fire'
	| 'missile_hit'
	| 'mine_drop'
	| 'mine_explode'
	| 'ray_fire'
	| 'gate_pass'
	| 'lap'
	| 'item_pick'
	| 'item_use'
	| 'race_destroyed'
	| 'race_respawn'
	| 'race_finish'
	| 'amb_owl'
	| 'amb_crickets'
	| 'amb_creak'
	| 'amb_drip'
	| 'amb_thunder'
	| 'cat_meow'
	| 'cat_purr'
	| 'paper_throw'
	| 'countdown_tick'
	| 'countdown_go'
	| 'music_halloween'
	| 'mission_win'
	| 'mission_lose'
	| 'ui_click'
	| 'ui_confirm'
	| 'ui_error'
	| 'wave_start'
	| 'wave_clear'
	| 'parkour_fall'
	| 'parkour_respawn'
	| 'parkour_finish';

function recipe(
	duration: number,
	seed: number,
	bus: BusId,
	priority: SoundPriority,
	maxVoices: number,
	cooldownMs: number,
	render: Recipe['render'],
	loop = false
): Recipe {
	return { duration, seed, bus, priority, maxVoices, cooldownMs, loop, render };
}

function shortNoise(
	sr: number,
	duration: number,
	seed: number,
	filter: 'lowpass' | 'highpass' | 'bandpass',
	freq: number,
	q: number,
	kind: NoiseKind = 'white',
	gain = 1
): Float32Array {
	return renderNoise(sr, {
		duration,
		seed,
		kind,
		gain,
		attack: 0.002,
		decay: duration * 0.92,
		curve: 3,
		filter,
		freq,
		q
	});
}

function tone(
	sr: number,
	duration: number,
	f0: number,
	f1: number,
	wave: WaveShape = 'sine',
	gain = 0.6,
	curve = 2
): Float32Array {
	return renderTone(sr, {
		duration,
		f0,
		f1,
		wave,
		gain,
		attack: 0.004,
		decay: duration,
		curve
	});
}

function click(sr: number, seed: number, freq = 2200, gain = 0.5): Float32Array {
	const noise = shortNoise(sr, 0.045, seed, 'bandpass', freq, 1.4, 'white', gain);
	return fadeEdges(noise, sr, 0.001, 0.02);
}

// ---------------------------------------------------------------------------
// Pasos
// ---------------------------------------------------------------------------

const FOOTSTEP_CONFIG: Record<
	SurfaceId,
	{
		kind: NoiseKind;
		filter: 'lowpass' | 'highpass' | 'bandpass';
		freq: number;
		q: number;
		thump: number;
		thumpGain: number;
		noiseGain: number;
	}
> = {
	grass: {
		kind: 'white',
		filter: 'lowpass',
		freq: 760,
		q: 0.7,
		thump: 68,
		thumpGain: 0.35,
		noiseGain: 0.7
	},
	dirt: {
		kind: 'brown',
		filter: 'lowpass',
		freq: 520,
		q: 0.8,
		thump: 82,
		thumpGain: 0.45,
		noiseGain: 0.75
	},
	stone: {
		kind: 'white',
		filter: 'bandpass',
		freq: 1850,
		q: 1.1,
		thump: 110,
		thumpGain: 0.3,
		noiseGain: 0.55
	},
	wood: {
		kind: 'white',
		filter: 'bandpass',
		freq: 430,
		q: 2.2,
		thump: 175,
		thumpGain: 0.55,
		noiseGain: 0.6
	}
};

function footstep(surface: SurfaceId, variant: 0 | 1 | 2): Recipe {
	const config = FOOTSTEP_CONFIG[surface];
	const seed = 11_000 + surface.length * 37 + variant * 101;

	return recipe(0.13, seed, 'sfx', 2, 4, 35, (sr) => {
		const noise = renderNoise(sr, {
			duration: 0.1,
			seed,
			kind: config.kind,
			gain: config.noiseGain,
			attack: 0.002,
			decay: 0.095,
			curve: 2.8,
			filter: config.filter,
			freq: config.freq * (1 + (variant - 1) * 0.08),
			q: config.q
		});
		const thump = renderTone(sr, {
			duration: 0.09,
			f0: config.thump * (1 + (variant - 1) * 0.05),
			f1: config.thump * 0.62,
			wave: 'sine',
			gain: config.thumpGain,
			attack: 0.001,
			decay: 0.085,
			curve: 3
		});

		return fadeEdges(normalize(mix(noise, thump), 0.82), sr, 0.002, 0.012);
	});
}

const FOOTSTEPS = Object.fromEntries(
	(['grass', 'dirt', 'stone', 'wood'] as const).flatMap((surface) =>
		([0, 1, 2] as const).map((variant) => [
			`footstep_${surface}_${variant}`,
			footstep(surface, variant)
		])
	)
) as Record<FootstepId, Recipe>;

// ---------------------------------------------------------------------------
// Jugador
// ---------------------------------------------------------------------------

function hurtVoice(heavy: boolean): Recipe {
	const duration = heavy ? 0.42 : 0.24;
	const seed = heavy ? 2011 : 2010;

	return recipe(duration, seed, 'voice', 3, 2, 80, (sr) => {
		const voice = renderTone(sr, {
			duration,
			f0: heavy ? 150 : 205,
			f1: heavy ? 68 : 120,
			wave: 'saw',
			gain: heavy ? 0.7 : 0.55,
			attack: 0.008,
			decay: duration * 0.88,
			curve: 2.4,
			vibratoHz: 5.5,
			vibratoDepth: 0.04
		});
		const breath = renderNoise(sr, {
			duration,
			seed,
			kind: 'pink',
			gain: heavy ? 0.38 : 0.26,
			attack: 0.004,
			decay: duration * 0.9,
			curve: 2.5,
			filter: 'bandpass',
			freq: heavy ? 480 : 780,
			q: 1.1
		});

		return fadeEdges(normalize(mix(voice, breath), 0.82), sr);
	});
}

// ---------------------------------------------------------------------------
// Armas y recogida
// ---------------------------------------------------------------------------

function gunShot(kind: 'pistol' | 'shotgun' | 'smg' | 'rifle'): Recipe {
	const settings = {
		pistol: { duration: 0.14, seed: 3010, low: 115, high: 950, noiseGain: 0.8, tail: 0.11 },
		shotgun: { duration: 0.38, seed: 3011, low: 78, high: 1250, noiseGain: 1, tail: 0.32 },
		smg: { duration: 0.09, seed: 3012, low: 165, high: 1350, noiseGain: 0.65, tail: 0.07 },
		rifle: { duration: 0.46, seed: 3013, low: 92, high: 1750, noiseGain: 0.9, tail: 0.4 }
	}[kind];

	return recipe(settings.duration, settings.seed, 'sfx', 3, 6, 30, (sr) => {
		const noise = renderNoise(sr, {
			duration: settings.duration,
			seed: settings.seed,
			kind: 'white',
			gain: settings.noiseGain,
			attack: 0.001,
			decay: settings.tail,
			curve: 2.6,
			filter: kind === 'shotgun' ? 'lowpass' : 'highpass',
			freq: settings.high,
			q: 0.8
		});
		const body = renderTone(sr, {
			duration: settings.duration * 0.7,
			f0: settings.low,
			f1: settings.low * 0.45,
			wave: 'sine',
			gain: 0.7,
			attack: 0.001,
			decay: settings.duration * 0.65,
			curve: 3
		});
		const crack = click(sr, settings.seed + 1, settings.high, 0.55);

		return fadeEdges(softClip(normalize(mix(noise, body, crack), 0.94), 1.2), sr, 0.001, 0.02);
	});
}

// ---------------------------------------------------------------------------
// Explosivos e impactos
// ---------------------------------------------------------------------------

function explosion(seed: number, duration: number): Recipe {
	return recipe(duration, seed, 'sfx', 3, 4, 120, (sr) => {
		const rumble = renderNoise(sr, {
			duration,
			seed,
			kind: 'brown',
			gain: 1,
			attack: 0.002,
			decay: duration * 0.9,
			curve: 2.2
		});
		const filtered = applyFilterSweep(rumble, sr, 'lowpass', 1500, 70, 0.9, 64);
		const boom = renderTone(sr, {
			duration: duration * 0.8,
			f0: 70,
			f1: 28,
			wave: 'sine',
			gain: 0.9,
			attack: 0.002,
			decay: duration * 0.75,
			curve: 2.4
		});
		const crack = shortNoise(sr, 0.08, seed + 3, 'highpass', 1800, 0.8, 'white', 0.5);

		return fadeEdges(softClip(normalize(mix(filtered, boom, crack), 0.96), 1.35), sr, 0.002, 0.03);
	});
}

function impact(kind: 'flesh' | 'bone' | 'stone' | 'wood'): Recipe {
	const config = {
		flesh: {
			seed: 4010,
			duration: 0.12,
			filter: 'lowpass' as const,
			freq: 540,
			q: 0.9,
			thump: 105
		},
		bone: {
			seed: 4011,
			duration: 0.09,
			filter: 'highpass' as const,
			freq: 1900,
			q: 0.8,
			thump: 260
		},
		stone: {
			seed: 4012,
			duration: 0.1,
			filter: 'bandpass' as const,
			freq: 2400,
			q: 1.2,
			thump: 180
		},
		wood: { seed: 4013, duration: 0.11, filter: 'bandpass' as const, freq: 430, q: 2.1, thump: 190 }
	}[kind];

	return recipe(config.duration, config.seed, 'sfx', 3, 6, 30, (sr) => {
		const noise = shortNoise(
			sr,
			config.duration,
			config.seed,
			config.filter,
			config.freq,
			config.q
		);
		const thump = tone(
			sr,
			config.duration * 0.8,
			config.thump,
			config.thump * 0.6,
			'sine',
			0.4,
			2.5
		);

		return fadeEdges(normalize(mix(noise, thump), 0.8), sr, 0.001, 0.015);
	});
}

// ---------------------------------------------------------------------------
// Voces de monstruos
// ---------------------------------------------------------------------------

const MONSTER_IDS: readonly Mg5MonsterKind[] = [
	'skeleton',
	'mummy',
	'frankenstein',
	'golem',
	'demon',
	'scarecrow',
	'ghost',
	'witch',
	'vampire',
	'pumpkin-king'
];

type VoiceConfig = {
	base: number;
	wave: WaveShape;
	formants: Formant[];
	noiseFreq: number;
	noiseKind: NoiseKind;
	vibrato: number;
	drive: number;
	idle: number;
	noiseGain: number;
};

const VOICE_CONFIG: Record<Mg5MonsterKind, VoiceConfig> = {
	skeleton: {
		base: 230,
		wave: 'square',
		formants: [
			{ freq: 900, q: 5, gain: 0.8 },
			{ freq: 2100, q: 6, gain: 0.55 }
		],
		noiseFreq: 3400,
		noiseKind: 'white',
		vibrato: 7,
		drive: 1.1,
		idle: 2.0,
		noiseGain: 0.3
	},
	mummy: {
		base: 98,
		wave: 'saw',
		formants: [
			{ freq: 380, q: 4.5, gain: 1 },
			{ freq: 860, q: 5.5, gain: 0.6 },
			{ freq: 1900, q: 6, gain: 0.25 }
		],
		noiseFreq: 1100,
		noiseKind: 'pink',
		vibrato: 3.2,
		drive: 1.2,
		idle: 2.2,
		noiseGain: 0.22
	},
	frankenstein: {
		base: 74,
		wave: 'square',
		formants: [
			{ freq: 310, q: 4, gain: 1 },
			{ freq: 720, q: 5, gain: 0.55 },
			{ freq: 1500, q: 5, gain: 0.2 }
		],
		noiseFreq: 520,
		noiseKind: 'brown',
		vibrato: 2.4,
		drive: 1.6,
		idle: 2.2,
		noiseGain: 0.2
	},
	golem: {
		base: 52,
		wave: 'saw',
		formants: [
			{ freq: 150, q: 3.5, gain: 1 },
			{ freq: 340, q: 4, gain: 0.65 },
			{ freq: 780, q: 4.5, gain: 0.3 }
		],
		noiseFreq: 220,
		noiseKind: 'brown',
		vibrato: 1.8,
		drive: 2,
		idle: 2.2,
		noiseGain: 0.28
	},
	demon: {
		base: 128,
		wave: 'saw',
		formants: [
			{ freq: 520, q: 4.5, gain: 1 },
			{ freq: 1200, q: 5, gain: 0.6 },
			{ freq: 2500, q: 5.5, gain: 0.35 }
		],
		noiseFreq: 2400,
		noiseKind: 'white',
		vibrato: 6,
		drive: 1.7,
		idle: 2.05,
		noiseGain: 0.26
	},
	scarecrow: {
		base: 185,
		wave: 'triangle',
		formants: [
			{ freq: 1150, q: 5, gain: 0.9 },
			{ freq: 2300, q: 5.5, gain: 0.55 },
			{ freq: 3400, q: 6, gain: 0.25 }
		],
		noiseFreq: 4200,
		noiseKind: 'white',
		vibrato: 8,
		drive: 1.05,
		idle: 2.0,
		noiseGain: 0.32
	},
	ghost: {
		base: 320,
		wave: 'sine',
		formants: [
			{ freq: 900, q: 6, gain: 0.8 },
			{ freq: 1900, q: 7, gain: 0.5 },
			{ freq: 3100, q: 7, gain: 0.25 }
		],
		noiseFreq: 5200,
		noiseKind: 'white',
		vibrato: 4.5,
		drive: 1,
		idle: 2.1,
		noiseGain: 0.35
	},
	witch: {
		base: 265,
		wave: 'saw',
		formants: [
			{ freq: 740, q: 5, gain: 1 },
			{ freq: 1650, q: 5.5, gain: 0.65 },
			{ freq: 2900, q: 6, gain: 0.3 }
		],
		noiseFreq: 3000,
		noiseKind: 'pink',
		vibrato: 9,
		drive: 1.15,
		idle: 1.9,
		noiseGain: 0.24
	},
	vampire: {
		base: 158,
		wave: 'saw',
		formants: [
			{ freq: 620, q: 5, gain: 1 },
			{ freq: 1450, q: 5.5, gain: 0.6 },
			{ freq: 2800, q: 6, gain: 0.3 }
		],
		noiseFreq: 4800,
		noiseKind: 'white',
		vibrato: 5.5,
		drive: 1.35,
		idle: 2.05,
		noiseGain: 0.3
	},
	'pumpkin-king': {
		base: 62,
		wave: 'square',
		formants: [
			{ freq: 260, q: 4, gain: 1 },
			{ freq: 620, q: 4.5, gain: 0.65 },
			{ freq: 1400, q: 5, gain: 0.35 }
		],
		noiseFreq: 380,
		noiseKind: 'brown',
		vibrato: 2.2,
		drive: 2.2,
		idle: 2.2,
		noiseGain: 0.3
	}
};

function monsterVoice(kind: Mg5MonsterKind, mode: 'idle' | 'attack' | 'hurt' | 'death'): Recipe {
	const config = VOICE_CONFIG[kind];
	const pitch = mode === 'attack' ? 1.22 : mode === 'hurt' ? 1.1 : mode === 'death' ? 0.72 : 1;
	const duration =
		mode === 'idle' ? config.idle + 0.3 : mode === 'attack' ? 0.62 : mode === 'hurt' ? 0.34 : 1.0;
	const gain = mode === 'idle' ? 0.22 : mode === 'attack' ? 0.7 : mode === 'hurt' ? 0.42 : 0.78;
	const seed =
		50_000 +
		MONSTER_IDS.indexOf(kind) * 97 +
		(mode === 'idle' ? 1 : mode === 'attack' ? 2 : mode === 'hurt' ? 3 : 4) * 13;

	return recipe(
		mode === 'idle' ? config.idle : duration,
		seed,
		'voice',
		mode === 'attack' || mode === 'death' ? 3 : 2,
		2,
		mode === 'hurt' ? 90 : 140,
		(sr) => {
			const tone = renderTone(sr, {
				duration,
				f0: config.base * pitch,
				f1: config.base * pitch * (mode === 'death' ? 0.45 : mode === 'attack' ? 1.18 : 0.9),
				wave: config.wave,
				gain,
				attack: mode === 'idle' ? 0.24 : 0.012,
				decay: duration * 0.88,
				curve: mode === 'idle' ? 1.1 : 2.2,
				vibratoHz: config.vibrato,
				vibratoDepth: mode === 'attack' ? 0.09 : 0.045,
				drive: config.drive
			});
			const voiced = formantLayer(tone, sr, config.formants);
			const breath = renderNoise(sr, {
				duration,
				seed: seed + 1,
				kind: config.noiseKind,
				gain: config.noiseGain * (mode === 'attack' ? 1.3 : 1),
				attack: mode === 'idle' ? 0.2 : 0.008,
				decay: duration * 0.9,
				curve: 2.4,
				filter: 'bandpass',
				freq: config.noiseFreq,
				q: 1.2
			});
			const output = mix(voiced, breath);

			if (mode === 'idle') {
				return fadeEdges(
					normalize(seamlessLoop(output, sr, config.idle, 0.25), 0.58),
					sr,
					0.02,
					0.04
				);
			}

			return fadeEdges(normalize(output, 0.82), sr);
		},
		mode === 'idle'
	);
}

const MONSTERS = Object.fromEntries(
	MONSTER_IDS.flatMap((kind) =>
		(['idle', 'attack', 'hurt', 'death'] as const).map((mode) => [
			`monster_${kind}_${mode}`,
			monsterVoice(kind, mode)
		])
	)
) as Record<MonsterSoundId, Recipe>;

// ---------------------------------------------------------------------------
// Vehículos
// ---------------------------------------------------------------------------

function carEngine(): Recipe {
	const loop = 2;
	const fade = 0.3;

	return recipe(
		loop,
		60_001,
		'sfx',
		3,
		2,
		0,
		(sr) => {
			const total = loop + fade;
			const data = new Float32Array(Math.floor(total * sr));

			for (const harmonic of [1, 2, 3, 4]) {
				mixInto(
					data,
					renderTone(sr, {
						duration: total,
						f0: 40 * harmonic,
						f1: 40 * harmonic,
						wave: 'saw',
						gain: 0.24 / harmonic,
						attack: 0.05,
						decay: total,
						curve: 1
					}),
					1
				);
			}

			const rumble = renderNoise(sr, {
				duration: total,
				seed: 60_003,
				kind: 'brown',
				gain: 0.3,
				attack: 0.05,
				decay: total,
				curve: 1,
				filter: 'lowpass',
				freq: 420,
				q: 0.7
			});

			mixInto(data, rumble, 1);

			return fadeEdges(normalize(seamlessLoop(data, sr, loop, fade), 0.76), sr, 0.02, 0.04);
		},
		true
	);
}

function carTire(): Recipe {
	const loop = 2;
	const fade = 0.25;

	return recipe(
		loop,
		60_010,
		'sfx',
		2,
		1,
		0,
		(sr) => {
			const total = loop + fade;
			const noise = renderNoise(sr, {
				duration: total,
				seed: 60_011,
				kind: 'white',
				gain: 0.75,
				attack: 0.05,
				decay: total,
				curve: 1,
				filter: 'bandpass',
				freq: 2400,
				q: 2.4
			});

			for (let index = 0; index < noise.length; index += 1) {
				const t = index / sr;
				noise[index] *= 0.55 + 0.45 * Math.sin(Math.PI * 2 * 7 * t);
			}

			return fadeEdges(normalize(seamlessLoop(noise, sr, loop, fade), 0.62), sr, 0.02, 0.04);
		},
		true
	);
}

// ---------------------------------------------------------------------------
// Ambiente
// ---------------------------------------------------------------------------

type AmbienceConfig = {
	kind: NoiseKind;
	filter: 'lowpass' | 'bandpass';
	freq: number;
	q: number;
	lfo: number;
	drone?: number;
	events: Array<'owl' | 'crickets' | 'creak' | 'drip' | 'thunder'>;
	eventCount: number;
};

const AMBIENCE_CONFIG: Record<AmbienceZone, AmbienceConfig> = {
	centro: {
		kind: 'brown',
		filter: 'lowpass',
		freq: 620,
		q: 0.7,
		lfo: 0.11,
		events: ['crickets', 'owl'],
		eventCount: 3
	},
	bosque: {
		kind: 'pink',
		filter: 'lowpass',
		freq: 900,
		q: 0.8,
		lfo: 0.08,
		events: ['owl', 'creak', 'crickets'],
		eventCount: 4
	},
	castillo: {
		kind: 'brown',
		filter: 'lowpass',
		freq: 440,
		q: 0.8,
		lfo: 0.06,
		drone: 48,
		events: ['thunder', 'drip'],
		eventCount: 2
	},
	calabazar: {
		kind: 'pink',
		filter: 'lowpass',
		freq: 780,
		q: 0.8,
		lfo: 0.09,
		events: ['creak', 'crickets'],
		eventCount: 4
	},
	cementerio: {
		kind: 'brown',
		filter: 'lowpass',
		freq: 520,
		q: 0.8,
		lfo: 0.07,
		events: ['owl', 'creak'],
		eventCount: 3
	},
	crypt: {
		kind: 'brown',
		filter: 'lowpass',
		freq: 300,
		q: 0.8,
		lfo: 0.05,
		drone: 42,
		events: ['drip', 'creak'],
		eventCount: 4
	},
	race: {
		kind: 'pink',
		filter: 'lowpass',
		freq: 720,
		q: 0.7,
		lfo: 0.12,
		events: [],
		eventCount: 0
	},
	waves: {
		kind: 'brown',
		filter: 'lowpass',
		freq: 480,
		q: 0.8,
		lfo: 0.08,
		drone: 55,
		events: ['creak', 'thunder'],
		eventCount: 3
	}
};

function ambienceEvent(
	sr: number,
	type: 'owl' | 'crickets' | 'creak' | 'drip' | 'thunder',
	seed: number
): Float32Array {
	if (type === 'owl') {
		const first = tone(sr, 0.42, 430, 360, 'sine', 0.22, 2.4);
		const second = tone(sr, 0.48, 380, 300, 'sine', 0.18, 2.8);
		return mix(first, second);
	}

	if (type === 'crickets') {
		const burst = new Float32Array(Math.floor(0.5 * sr));

		for (let index = 0; index < 6; index += 1) {
			mixInto(
				burst,
				tone(sr, 0.045, 3100 + index * 40, 3000, 'sine', 0.08, 2),
				index % 2 === 0 ? 0.55 : 0.75,
				Math.floor((index * 0.07 + 0.02) * sr)
			);
		}

		return burst;
	}

	if (type === 'creak') {
		return renderTone(sr, {
			duration: 0.5,
			f0: 190,
			f1: 120,
			wave: 'saw',
			gain: 0.14,
			attack: 0.04,
			decay: 0.42,
			curve: 2.2,
			vibratoHz: 5,
			vibratoDepth: 0.08
		});
	}

	if (type === 'drip') {
		return tone(sr, 0.2, 980, 420, 'sine', 0.25, 3);
	}

	return renderNoise(sr, {
		duration: 0.9,
		seed,
		kind: 'brown',
		gain: 0.36,
		attack: 0.05,
		decay: 0.85,
		curve: 2,
		filter: 'lowpass',
		freq: 260,
		q: 0.7
	});
}

function ambienceRecipe(zone: AmbienceZone): Recipe {
	const config = AMBIENCE_CONFIG[zone];
	// 6 s: suficiente para que el viento no se note repetitivo y deja sitio
	// en el presupuesto de PCM para la música.
	const loop = 6;
	const fade = 0.4;

	return recipe(
		loop,
		70_000 + zone.length * 31,
		'ambience',
		1,
		2,
		0,
		(sr) => {
			const total = loop + fade;
			const wind = renderNoise(sr, {
				duration: total,
				seed: 71_000 + zone.length * 53,
				kind: config.kind,
				gain: 0.52,
				attack: 0.4,
				decay: total,
				curve: 1
			});
			const filtered = applyFilterSweep(
				wind,
				sr,
				config.filter,
				config.freq * 0.8,
				config.freq,
				config.q,
				128
			);

			for (let index = 0; index < filtered.length; index += 1) {
				const t = index / sr;
				const lfo = 0.72 + 0.28 * Math.sin(Math.PI * 2 * config.lfo * t + 0.7);
				filtered[index] *= lfo;
			}

			const layers: Float32Array[] = [filtered];

			if (config.drone) {
				layers.push(
					renderTone(sr, {
						duration: total,
						f0: config.drone,
						f1: config.drone,
						wave: 'sine',
						gain: 0.16,
						attack: 0.5,
						decay: total,
						curve: 1
					})
				);
			}

			const random = mulberry32ForAmbience(71_500 + zone.length * 17);

			for (let index = 0; index < config.eventCount; index += 1) {
				const type = config.events[Math.floor(random() * config.events.length)];

				if (!type) {
					continue;
				}

				const at = randBetween(random, 0.8, loop - 1.2);
				const event = ambienceEvent(sr, type, 72_000 + index + zone.length);
				mixInto(layers[0], event, 1, Math.floor(at * sr));
			}

			return fadeEdges(
				normalize(seamlessLoop(mix(...layers), sr, loop, fade), 0.7),
				sr,
				0.03,
				0.06
			);
		},
		true
	);
}

/** PRNG local para repartir eventos; evita importar más helpers en el catálogo. */
function mulberry32ForAmbience(seed: number): () => number {
	let state = seed >>> 0;

	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

const AMBIENCE = Object.fromEntries(
	(
		['centro', 'bosque', 'castillo', 'calabazar', 'cementerio', 'crypt', 'race', 'waves'] as const
	).map((zone) => [`ambience_${zone}`, ambienceRecipe(zone)])
) as Record<AmbienceId, Recipe>;

// ---------------------------------------------------------------------------
// Música
// ---------------------------------------------------------------------------

const MUSIC_LOOP_SECONDS = 8;
const MUSIC_FADE_SECONDS = 0.5;
/** 120 BPM en 4/4: 16 pulsos de 0,5 s = 8 s. */
const MUSIC_BEAT_SECONDS = MUSIC_LOOP_SECONDS / 16;
/** Un pulso de entrada: el crossfade del loop no debe comerse el primer ataque. */
const MUSIC_LEAD_IN_BEATS = 1;

type MusicNote = {
	/** Inicio en pulsos desde el principio del loop. */
	beat: number;
	/** Duración en pulsos. */
	beats: number;
	freq: number;
	gain: number;
	/** Glissando final opcional, para el lamento del theremin. */
	endFreq?: number;
};

/**
 * Motivo original de Halloween: menor armónica, tritono (re#) y un descenso
 * cromático. El theremin hace un pequeño scoop al atacar cada nota.
 */
const HALLOWEEN_MELODY: readonly MusicNote[] = [
	{ beat: 0, beats: 0.45, freq: 440, gain: 0.26 },
	{ beat: 0.5, beats: 0.45, freq: 440, gain: 0.22 },
	{ beat: 1, beats: 0.45, freq: 523.25, gain: 0.24 },
	{ beat: 1.5, beats: 0.45, freq: 440, gain: 0.22 },
	{ beat: 2, beats: 0.9, freq: 659.25, gain: 0.26 },
	{ beat: 3, beats: 0.45, freq: 622.25, gain: 0.24 },
	{ beat: 3.5, beats: 0.45, freq: 659.25, gain: 0.24 },
	{ beat: 4, beats: 0.45, freq: 698.46, gain: 0.26 },
	{ beat: 4.5, beats: 0.45, freq: 659.25, gain: 0.24 },
	{ beat: 5, beats: 0.45, freq: 587.33, gain: 0.24 },
	{ beat: 5.5, beats: 0.45, freq: 523.25, gain: 0.22 },
	{ beat: 6, beats: 0.9, freq: 493.88, gain: 0.25 },
	{ beat: 7, beats: 1, freq: 415.3, gain: 0.25 },
	{ beat: 8, beats: 0.45, freq: 880, gain: 0.26 },
	{ beat: 8.5, beats: 0.45, freq: 830.61, gain: 0.24 },
	{ beat: 9, beats: 0.45, freq: 783.99, gain: 0.24 },
	{ beat: 9.5, beats: 0.45, freq: 739.99, gain: 0.22 },
	{ beat: 10, beats: 0.45, freq: 698.46, gain: 0.22 },
	{ beat: 10.5, beats: 0.45, freq: 659.25, gain: 0.22 },
	{ beat: 11, beats: 1, freq: 622.25, gain: 0.26 },
	{ beat: 12, beats: 0.45, freq: 659.25, gain: 0.24 },
	{ beat: 12.5, beats: 0.45, freq: 523.25, gain: 0.22 },
	{ beat: 13, beats: 0.45, freq: 440, gain: 0.22 },
	{ beat: 13.5, beats: 0.45, freq: 493.88, gain: 0.22 },
	{ beat: 14, beats: 1.9, freq: 440, gain: 0.26, endFreq: 415.3 }
];

/** Bajo caminante y staccato: La menor, Re menor, Mi7, La menor. */
const HALLOWEEN_BASS: readonly MusicNote[] = [
	{ beat: 0, beats: 0.45, freq: 110, gain: 0.24 },
	{ beat: 1, beats: 0.45, freq: 164.81, gain: 0.22 },
	{ beat: 2, beats: 0.45, freq: 110, gain: 0.24 },
	{ beat: 3, beats: 0.45, freq: 164.81, gain: 0.22 },
	{ beat: 4, beats: 0.45, freq: 146.83, gain: 0.24 },
	{ beat: 5, beats: 0.45, freq: 220, gain: 0.22 },
	{ beat: 6, beats: 0.45, freq: 146.83, gain: 0.24 },
	{ beat: 7, beats: 0.45, freq: 220, gain: 0.22 },
	{ beat: 8, beats: 0.45, freq: 82.41, gain: 0.24 },
	{ beat: 9, beats: 0.45, freq: 123.47, gain: 0.22 },
	{ beat: 10, beats: 0.45, freq: 82.41, gain: 0.24 },
	{ beat: 11, beats: 0.45, freq: 123.47, gain: 0.22 },
	{ beat: 12, beats: 0.45, freq: 110, gain: 0.24 },
	{ beat: 13, beats: 0.45, freq: 164.81, gain: 0.22 },
	{ beat: 14, beats: 1.7, freq: 110, gain: 0.24 }
];

type MusicChord = {
	beat: number;
	beats: number;
	freqs: readonly number[];
};

const HALLOWEEN_CHORDS: readonly MusicChord[] = [
	{ beat: 0, beats: 3.7, freqs: [220, 261.63, 329.63] },
	{ beat: 4, beats: 3.7, freqs: [293.66, 349.23, 440] },
	{ beat: 8, beats: 3.7, freqs: [329.63, 415.3, 493.88, 587.33] },
	{ beat: 12, beats: 3.7, freqs: [220, 261.63, 329.63] }
];

const HALLOWEEN_BELLS: readonly MusicNote[] = [
	{ beat: 3, beats: 3, freq: 1244.51, gain: 0.055 },
	{ beat: 7.5, beats: 2, freq: 830.61, gain: 0.045 },
	{ beat: 11, beats: 3, freq: 1244.51, gain: 0.055 }
];

function thereminNote(sr: number, note: MusicNote): Float32Array {
	const duration = note.beats * MUSIC_BEAT_SECONDS;
	const base = renderTone(sr, {
		duration,
		// Pequeño scoop de afinación: el theremin "busca" la nota.
		f0: note.freq * 0.962,
		f1: note.endFreq ?? note.freq,
		wave: 'sine',
		gain: note.gain,
		attack: 0.028,
		decay: duration,
		curve: 1.55,
		vibratoHz: 5.6,
		vibratoDepth: 0.016
	});

	const output = new Float32Array(base.length + Math.floor(0.9 * sr));
	mixInto(output, base, 1);
	mixInto(output, base, 0.3, Math.floor(0.22 * sr));
	mixInto(output, base, 0.12, Math.floor(0.44 * sr));

	return output;
}

function bassNote(sr: number, note: MusicNote): Float32Array {
	const duration = note.beats * MUSIC_BEAT_SECONDS;

	return renderTone(sr, {
		duration,
		f0: note.freq,
		f1: note.freq,
		wave: 'saw',
		gain: note.gain,
		attack: 0.004,
		decay: duration,
		curve: 2.6,
		drive: 1.5
	});
}

function organChord(sr: number, chord: MusicChord): Float32Array {
	const duration = chord.beats * MUSIC_BEAT_SECONDS;
	const output = new Float32Array(Math.floor(duration * sr));

	for (const freq of chord.freqs) {
		mixInto(
			output,
			renderTone(sr, {
				duration,
				f0: freq,
				f1: freq,
				wave: 'triangle',
				gain: 0.032,
				attack: 0.05,
				decay: duration,
				curve: 1.35,
				tremoloHz: 5.2,
				tremoloDepth: 0.4
			}),
			1
		);
		mixInto(
			output,
			renderTone(sr, {
				duration,
				f0: freq * 1.005,
				f1: freq,
				wave: 'saw',
				gain: 0.008,
				attack: 0.06,
				decay: duration,
				curve: 1.2
			}),
			1
		);
	}

	return output;
}

function bellNote(sr: number, note: MusicNote): Float32Array {
	const duration = note.beats * MUSIC_BEAT_SECONDS;
	const base = renderTone(sr, {
		duration,
		f0: note.freq,
		f1: note.freq,
		wave: 'sine',
		gain: note.gain,
		attack: 0.003,
		decay: duration,
		curve: 2.2,
		vibratoHz: 3.1,
		vibratoDepth: 0.004
	});

	const output = new Float32Array(base.length + Math.floor(1.0 * sr));
	mixInto(output, base, 1);
	mixInto(output, base, 0.35, Math.floor(0.19 * sr));
	mixInto(output, base, 0.15, Math.floor(0.38 * sr));

	return output;
}

function halloweenMusic(sr: number): Float32Array {
	const loop = MUSIC_LOOP_SECONDS;
	const fade = MUSIC_FADE_SECONDS;
	const total = loop + fade;
	const output = new Float32Array(Math.floor(total * sr));
	const leadIn = MUSIC_LEAD_IN_BEATS * MUSIC_BEAT_SECONDS * sr;

	// Drone grave con batido lento: inquietud sin tapar la melodía.
	mixInto(
		output,
		renderTone(sr, {
			duration: total,
			f0: 110,
			f1: 110,
			wave: 'sine',
			gain: 0.06,
			attack: 0.5,
			decay: total,
			curve: 1,
			tremoloHz: 0.24,
			tremoloDepth: 0.3
		}),
		1
	);
	mixInto(
		output,
		renderTone(sr, {
			duration: total,
			f0: 110.6,
			f1: 110.6,
			wave: 'sine',
			gain: 0.045,
			attack: 0.6,
			decay: total,
			curve: 1
		}),
		1
	);

	for (const chord of HALLOWEEN_CHORDS) {
		mixInto(
			output,
			organChord(sr, chord),
			1,
			Math.floor(leadIn + chord.beat * MUSIC_BEAT_SECONDS * sr)
		);
	}

	for (const note of HALLOWEEN_MELODY) {
		mixInto(
			output,
			thereminNote(sr, note),
			1,
			Math.floor(leadIn + note.beat * MUSIC_BEAT_SECONDS * sr)
		);
	}

	for (const note of HALLOWEEN_BASS) {
		mixInto(
			output,
			bassNote(sr, note),
			1,
			Math.floor(leadIn + note.beat * MUSIC_BEAT_SECONDS * sr)
		);
	}

	for (const note of HALLOWEEN_BELLS) {
		mixInto(
			output,
			bellNote(sr, note),
			1,
			Math.floor(leadIn + note.beat * MUSIC_BEAT_SECONDS * sr)
		);
	}

	return normalize(seamlessLoop(output, sr, loop, fade), 0.78);
}

const MUSIC: Record<'music_halloween', Recipe> = {
	music_halloween: recipe(MUSIC_LOOP_SECONDS, 94_000, 'music', 1, 1, 0, halloweenMusic, true)
};

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

export const RECIPES: Record<SoundId, Recipe> = {
	...FOOTSTEPS,
	...MONSTERS,
	...AMBIENCE,
	...MUSIC,

	jump: recipe(0.2, 1010, 'sfx', 2, 2, 80, (sr) => {
		const air = applyFilterSweep(
			renderNoise(sr, {
				duration: 0.2,
				seed: 1011,
				kind: 'white',
				gain: 0.5,
				attack: 0.01,
				decay: 0.19,
				curve: 2.2
			}),
			sr,
			'bandpass',
			520,
			1600,
			1.1
		);

		return fadeEdges(normalize(air, 0.55), sr);
	}),

	land: recipe(0.18, 1020, 'sfx', 2, 2, 90, (sr) => {
		const noise = shortNoise(sr, 0.16, 1021, 'lowpass', 420, 0.8, 'brown', 0.8);
		const thump = tone(sr, 0.17, 72, 44, 'sine', 0.75, 2.8);

		return fadeEdges(normalize(mix(noise, thump), 0.86), sr);
	}),

	player_hurt_light: hurtVoice(false),
	player_hurt_heavy: hurtVoice(true),

	player_downed: recipe(0.7, 2020, 'voice', 3, 1, 300, (sr) => {
		const voice = renderTone(sr, {
			duration: 0.7,
			f0: 170,
			f1: 48,
			wave: 'saw',
			gain: 0.6,
			attack: 0.01,
			decay: 0.66,
			curve: 2.2,
			vibratoHz: 4,
			vibratoDepth: 0.06
		});
		const breath = shortNoise(sr, 0.7, 2021, 'lowpass', 420, 0.8, 'pink', 0.32);

		return fadeEdges(normalize(mix(voice, breath), 0.8), sr, 0.005, 0.08);
	}),

	player_revive: recipe(0.62, 2030, 'voice', 2, 1, 300, (sr) => {
		const rise = renderTone(sr, {
			duration: 0.58,
			f0: 210,
			f1: 430,
			wave: 'sine',
			gain: 0.42,
			attack: 0.04,
			decay: 0.54,
			curve: 1.4,
			tremoloHz: 6,
			tremoloDepth: 0.3
		});
		const shimmer = shortNoise(sr, 0.5, 2031, 'highpass', 2400, 0.8, 'white', 0.18);

		return fadeEdges(normalize(mix(rise, shimmer), 0.68), sr, 0.01, 0.08);
	}),

	player_heal: recipe(0.55, 2040, 'voice', 2, 1, 250, (sr) => {
		const first = tone(sr, 0.28, 520, 560, 'sine', 0.32, 1.6);
		const second = tone(sr, 0.32, 660, 700, 'sine', 0.28, 1.6);

		return fadeEdges(normalize(mix(first, second), 0.62), sr, 0.01, 0.06);
	}),

	pickup_weapon: recipe(0.22, 2100, 'ui', 2, 2, 80, (sr) => {
		const metal = shortNoise(sr, 0.16, 2101, 'bandpass', 2600, 1.6, 'white', 0.5);
		const chime = tone(sr, 0.2, 780, 1180, 'triangle', 0.38, 1.8);

		return fadeEdges(normalize(mix(metal, chime), 0.7), sr);
	}),

	pickup_ammo: recipe(0.22, 2110, 'ui', 1, 2, 70, (sr) =>
		fadeEdges(normalize(mix(click(sr, 2111, 1800, 0.45), click(sr, 2112, 2500, 0.38)), 0.64), sr)
	),

	pickup_grenade: recipe(0.22, 2120, 'ui', 1, 2, 70, (sr) => {
		const thump = tone(sr, 0.18, 190, 120, 'sine', 0.4, 2.4);
		const clickLayer = click(sr, 2121, 1400, 0.35);

		return fadeEdges(normalize(mix(thump, clickLayer), 0.66), sr);
	}),

	pickup_health: recipe(0.34, 2130, 'ui', 1, 2, 70, (sr) => {
		const first = tone(sr, 0.18, 440, 470, 'sine', 0.3, 1.7);
		const second = tone(sr, 0.22, 660, 700, 'sine', 0.26, 1.7);

		return fadeEdges(normalize(mix(first, second), 0.6), sr);
	}),

	checkpoint: recipe(0.62, 2140, 'ui', 2, 2, 300, (sr) => {
		const notes = [523, 659, 784];
		const output = new Float32Array(Math.floor(0.62 * sr));

		for (let index = 0; index < notes.length; index += 1) {
			mixInto(
				output,
				tone(sr, 0.34, notes[index], notes[index], 'sine', 0.26, 1.8),
				1,
				Math.floor(index * 0.12 * sr)
			);
		}

		return fadeEdges(normalize(output, 0.62), sr, 0.01, 0.05);
	}),

	parkour_fall: recipe(0.72, 91_010, 'sfx', 3, 1, 400, (sr) => {
		const wind = applyFilterSweep(
			renderNoise(sr, {
				duration: 0.72,
				seed: 91_011,
				kind: 'white',
				gain: 0.5,
				attack: 0.02,
				decay: 0.7,
				curve: 1.7
			}),
			sr,
			'lowpass',
			1800,
			220,
			1.1
		);
		const thump = tone(sr, 0.36, 120, 42, 'sine', 0.52, 2.4);

		return fadeEdges(normalize(mix(wind, thump), 0.8), sr);
	}),

	parkour_respawn: recipe(0.56, 91_020, 'voice', 2, 1, 300, (sr) => {
		const rise = renderTone(sr, {
			duration: 0.52,
			f0: 240,
			f1: 620,
			wave: 'triangle',
			gain: 0.4,
			attack: 0.02,
			decay: 0.5,
			curve: 1.4
		});
		const shimmer = shortNoise(sr, 0.46, 91_021, 'highpass', 2600, 0.8, 'white', 0.18);

		return fadeEdges(normalize(mix(rise, shimmer), 0.7), sr, 0.01, 0.07);
	}),

	parkour_finish: recipe(1.1, 91_030, 'ui', 3, 1, 600, (sr) => {
		const notes = [523, 659, 784, 1047];
		const output = new Float32Array(Math.floor(1.1 * sr));

		for (let index = 0; index < notes.length; index += 1) {
			mixInto(
				output,
				tone(
					sr,
					index === notes.length - 1 ? 0.7 : 0.36,
					notes[index],
					notes[index],
					'sine',
					0.3,
					1.8
				),
				1,
				Math.floor(index * 0.17 * sr)
			);
		}

		const shimmer = shortNoise(sr, 0.8, 91_031, 'highpass', 3200, 0.8, 'white', 0.14);

		return fadeEdges(normalize(mix(output, shimmer), 0.78), sr, 0.01, 0.08);
	}),

	shot_pistol: gunShot('pistol'),
	shot_shotgun: gunShot('shotgun'),
	shot_smg: gunShot('smg'),
	shot_rifle: gunShot('rifle'),

	dry_fire: recipe(0.12, 3020, 'sfx', 2, 3, 45, (sr) =>
		fadeEdges(normalize(mix(click(sr, 3021, 2700, 0.45), click(sr, 3022, 1500, 0.3)), 0.55), sr)
	),

	reload_start: recipe(0.3, 3030, 'sfx', 2, 2, 100, (sr) => {
		const first = click(sr, 3031, 1600, 0.4);
		const metal = shortNoise(sr, 0.2, 3032, 'bandpass', 2200, 1.8, 'white', 0.28);

		return fadeEdges(normalize(mix(first, metal), 0.58), sr);
	}),

	reload_end: recipe(0.24, 3040, 'sfx', 2, 2, 100, (sr) => {
		const first = click(sr, 3041, 2100, 0.42);
		const second = click(sr, 3042, 1200, 0.32);

		return fadeEdges(normalize(mix(first, second), 0.6), sr);
	}),

	shell_drop: recipe(0.16, 3050, 'sfx', 1, 3, 50, (sr) =>
		fadeEdges(
			normalize(
				mix(click(sr, 3051, 3200, 0.3), tone(sr, 0.1, 900, 700, 'triangle', 0.18, 2)),
				0.48
			),
			sr
		)
	),

	grenade_throw: recipe(0.28, 3060, 'sfx', 2, 3, 80, (sr) => {
		const whoosh = applyFilterSweep(
			renderNoise(sr, {
				duration: 0.28,
				seed: 3061,
				kind: 'white',
				gain: 0.55,
				attack: 0.02,
				decay: 0.26,
				curve: 2
			}),
			sr,
			'bandpass',
			380,
			1500,
			1.1
		);

		return fadeEdges(normalize(whoosh, 0.6), sr);
	}),

	grenade_bounce: recipe(0.12, 3070, 'sfx', 1, 3, 60, (sr) =>
		fadeEdges(
			normalize(mix(click(sr, 3071, 800, 0.4), tone(sr, 0.09, 240, 160, 'sine', 0.3, 2.4)), 0.55),
			sr
		)
	),

	explosion: explosion(3080, 0.95),

	acid_throw: recipe(0.3, 3090, 'sfx', 2, 3, 90, (sr) => {
		const whoosh = applyFilterSweep(
			renderNoise(sr, {
				duration: 0.3,
				seed: 3091,
				kind: 'pink',
				gain: 0.45,
				attack: 0.02,
				decay: 0.28,
				curve: 2
			}),
			sr,
			'bandpass',
			280,
			950,
			1.2
		);
		const toneLayer = renderTone(sr, {
			duration: 0.25,
			f0: 220,
			f1: 110,
			wave: 'saw',
			gain: 0.18,
			attack: 0.01,
			decay: 0.24,
			curve: 2
		});

		return fadeEdges(normalize(mix(whoosh, toneLayer), 0.6), sr);
	}),

	acid_impact: recipe(0.32, 3100, 'sfx', 3, 4, 70, (sr) => {
		const splat = shortNoise(sr, 0.22, 3101, 'bandpass', 620, 1.6, 'pink', 0.65);
		const wet = renderTone(sr, {
			duration: 0.28,
			f0: 150,
			f1: 65,
			wave: 'saw',
			gain: 0.22,
			attack: 0.003,
			decay: 0.26,
			curve: 2.4
		});

		return fadeEdges(normalize(mix(splat, wet), 0.78), sr);
	}),

	acid_sizzle: recipe(0.72, 3110, 'sfx', 1, 2, 200, (sr) => {
		const noise = renderNoise(sr, {
			duration: 0.72,
			seed: 3111,
			kind: 'white',
			gain: 0.22,
			attack: 0.03,
			decay: 0.68,
			curve: 1.4,
			filter: 'highpass',
			freq: 2800,
			q: 0.8
		});

		for (let index = 0; index < noise.length; index += 1) {
			const t = index / sr;
			noise[index] *= 0.45 + 0.55 * Math.sin(Math.PI * 2 * 11 * t) ** 2;
		}

		return fadeEdges(normalize(noise, 0.38), sr, 0.02, 0.08);
	}),

	hit_flesh: impact('flesh'),
	hit_bone: impact('bone'),
	hit_stone: impact('stone'),
	hit_wood: impact('wood'),

	car_engine: carEngine(),
	car_tire: carTire(),

	car_impact_light: recipe(0.24, 61_000, 'sfx', 2, 3, 100, (sr) => {
		const metal = shortNoise(sr, 0.2, 61_001, 'bandpass', 2400, 1.4, 'white', 0.55);
		const thump = tone(sr, 0.22, 140, 70, 'sine', 0.6, 2.4);

		return fadeEdges(normalize(mix(metal, thump), 0.78), sr);
	}),

	car_impact_heavy: recipe(0.55, 61_010, 'sfx', 3, 3, 150, (sr) => {
		const metal = shortNoise(sr, 0.45, 61_011, 'bandpass', 1500, 1.2, 'white', 0.7);
		const thump = tone(sr, 0.5, 105, 38, 'sine', 0.85, 2.2);
		const crunch = shortNoise(sr, 0.35, 61_012, 'lowpass', 700, 0.8, 'brown', 0.5);

		return fadeEdges(softClip(normalize(mix(metal, thump, crunch), 0.9), 1.2), sr);
	}),

	car_rollover: recipe(0.8, 61_020, 'sfx', 3, 2, 300, (sr) => {
		const scrape = renderNoise(sr, {
			duration: 0.75,
			seed: 61_021,
			kind: 'brown',
			gain: 0.5,
			attack: 0.04,
			decay: 0.7,
			curve: 1.6
		});
		const metal = shortNoise(sr, 0.5, 61_022, 'bandpass', 1800, 1.2, 'white', 0.35);
		const thump = tone(sr, 0.4, 90, 55, 'sine', 0.55, 2.3);

		return fadeEdges(normalize(mix(scrape, metal, thump), 0.82), sr);
	}),

	car_explosion: explosion(61_030, 1.15),

	car_enter: recipe(0.38, 61_040, 'sfx', 2, 1, 200, (sr) => {
		const clunk = shortNoise(sr, 0.18, 61_041, 'lowpass', 700, 0.9, 'brown', 0.65);
		const metal = click(sr, 61_042, 1400, 0.3);

		return fadeEdges(normalize(mix(clunk, metal), 0.7), sr);
	}),

	car_exit: recipe(0.34, 61_050, 'sfx', 2, 1, 200, (sr) => {
		const clunk = shortNoise(sr, 0.16, 61_051, 'lowpass', 620, 0.9, 'brown', 0.55);
		const clickLayer = click(sr, 61_052, 1900, 0.28);

		return fadeEdges(normalize(mix(clunk, clickLayer), 0.66), sr);
	}),

	missile_fire: recipe(0.42, 80_000, 'sfx', 3, 3, 100, (sr) => {
		const whoosh = applyFilterSweep(
			renderNoise(sr, {
				duration: 0.4,
				seed: 80_001,
				kind: 'white',
				gain: 0.65,
				attack: 0.01,
				decay: 0.38,
				curve: 1.8
			}),
			sr,
			'bandpass',
			600,
			2200,
			1.4
		);
		const launch = tone(sr, 0.3, 260, 120, 'saw', 0.28, 2.2);

		return fadeEdges(normalize(mix(whoosh, launch), 0.76), sr);
	}),

	missile_hit: explosion(80_010, 0.65),
	mine_drop: recipe(0.18, 80_020, 'sfx', 2, 3, 80, (sr) =>
		fadeEdges(
			normalize(mix(click(sr, 80_021, 1200, 0.4), tone(sr, 0.15, 180, 110, 'sine', 0.3, 2.2)), 0.6),
			sr
		)
	),
	mine_explode: explosion(80_030, 0.8),

	ray_fire: recipe(0.5, 80_040, 'sfx', 3, 3, 120, (sr) => {
		const zap = renderTone(sr, {
			duration: 0.45,
			f0: 1600,
			f1: 160,
			wave: 'saw',
			gain: 0.38,
			attack: 0.005,
			decay: 0.42,
			curve: 2,
			vibratoHz: 18,
			vibratoDepth: 0.2
		});
		const noise = shortNoise(sr, 0.4, 80_041, 'highpass', 2600, 0.8, 'white', 0.26);

		return fadeEdges(normalize(mix(zap, noise), 0.74), sr);
	}),

	gate_pass: recipe(0.35, 80_050, 'ui', 2, 2, 100, (sr) => {
		const whoosh = shortNoise(sr, 0.25, 80_051, 'bandpass', 900, 1.4, 'white', 0.35);
		const chime = tone(sr, 0.25, 880, 1320, 'sine', 0.3, 1.6);

		return fadeEdges(normalize(mix(whoosh, chime), 0.64), sr);
	}),

	lap: recipe(0.55, 80_060, 'ui', 2, 2, 400, (sr) => {
		const notes = [784, 988, 1175];
		const output = new Float32Array(Math.floor(0.55 * sr));

		for (let index = 0; index < notes.length; index += 1) {
			mixInto(
				output,
				tone(sr, 0.26, notes[index], notes[index], 'sine', 0.24, 1.7),
				1,
				Math.floor(index * 0.09 * sr)
			);
		}

		return fadeEdges(normalize(output, 0.62), sr);
	}),

	item_pick: recipe(0.34, 80_070, 'ui', 2, 2, 100, (sr) => {
		const first = tone(sr, 0.2, 620, 820, 'triangle', 0.3, 1.8);
		const second = tone(sr, 0.22, 920, 1080, 'sine', 0.26, 1.8);

		return fadeEdges(normalize(mix(first, second), 0.62), sr);
	}),

	item_use: recipe(0.35, 80_080, 'sfx', 2, 3, 100, (sr) =>
		fadeEdges(
			normalize(
				applyFilterSweep(
					renderNoise(sr, {
						duration: 0.32,
						seed: 80_081,
						kind: 'white',
						gain: 0.45,
						attack: 0.02,
						decay: 0.3,
						curve: 2
					}),
					sr,
					'bandpass',
					500,
					1800,
					1.2
				),
				0.58
			),
			sr
		)
	),

	race_destroyed: explosion(80_090, 1.2),
	race_respawn: recipe(0.7, 80_100, 'ui', 2, 1, 300, (sr) => {
		const rise = renderTone(sr, {
			duration: 0.65,
			f0: 200,
			f1: 640,
			wave: 'triangle',
			gain: 0.32,
			attack: 0.04,
			decay: 0.6,
			curve: 1.4
		});
		const shimmer = shortNoise(sr, 0.6, 80_101, 'highpass', 2600, 0.8, 'white', 0.16);

		return fadeEdges(normalize(mix(rise, shimmer), 0.62), sr);
	}),

	race_finish: recipe(1.4, 80_110, 'ui', 3, 1, 1000, (sr) => {
		const output = new Float32Array(Math.floor(1.4 * sr));
		const notes = [523, 659, 784, 1046];

		for (let index = 0; index < notes.length; index += 1) {
			mixInto(
				output,
				tone(sr, 0.55, notes[index], notes[index], 'sine', 0.24, 1.5),
				1,
				Math.floor(index * 0.16 * sr)
			);
		}

		return fadeEdges(normalize(output, 0.72), sr, 0.01, 0.2);
	}),

	amb_owl: recipe(1.0, 73_000, 'ambience', 0, 2, 600, (sr) => {
		const first = tone(sr, 0.4, 430, 360, 'sine', 0.3, 2.4);
		const second = tone(sr, 0.45, 380, 300, 'sine', 0.24, 2.6);

		return fadeEdges(normalize(mix(first, second), 0.55), sr, 0.01, 0.1);
	}),

	amb_crickets: recipe(0.6, 73_010, 'ambience', 0, 2, 400, (sr) => {
		const output = new Float32Array(Math.floor(0.6 * sr));

		for (let index = 0; index < 6; index += 1) {
			mixInto(
				output,
				tone(sr, 0.05, 3050 + index * 35, 3000, 'sine', 0.12, 2),
				1,
				Math.floor((index * 0.08 + 0.02) * sr)
			);
		}

		return fadeEdges(normalize(output, 0.4), sr, 0.01, 0.05);
	}),

	amb_creak: recipe(0.6, 73_020, 'ambience', 0, 2, 700, (sr) => {
		const creak = renderTone(sr, {
			duration: 0.55,
			f0: 190,
			f1: 120,
			wave: 'saw',
			gain: 0.2,
			attack: 0.04,
			decay: 0.5,
			curve: 2.1,
			vibratoHz: 5,
			vibratoDepth: 0.09
		});

		return fadeEdges(normalize(creak, 0.48), sr, 0.01, 0.08);
	}),

	amb_drip: recipe(0.26, 73_030, 'ambience', 0, 2, 300, (sr) =>
		fadeEdges(normalize(tone(sr, 0.22, 980, 420, 'sine', 0.35, 3), 0.55), sr)
	),

	amb_thunder: recipe(1.1, 73_040, 'ambience', 1, 2, 1200, (sr) => {
		const rumble = renderNoise(sr, {
			duration: 1.05,
			seed: 73_041,
			kind: 'brown',
			gain: 0.7,
			attack: 0.04,
			decay: 1,
			curve: 1.8,
			filter: 'lowpass',
			freq: 300,
			q: 0.7
		});
		const crack = shortNoise(sr, 0.18, 73_042, 'highpass', 1600, 0.8, 'white', 0.3);

		return fadeEdges(normalize(mix(rumble, crack), 0.72), sr, 0.01, 0.15);
	}),

	countdown_tick: recipe(0.16, 93_000, 'ui', 3, 1, 50, (sr) => {
		const beep = tone(sr, 0.14, 880, 880, 'sine', 0.42, 1.8);
		const click = shortNoise(sr, 0.04, 93_001, 'highpass', 2200, 0.8, 'white', 0.18);

		return fadeEdges(normalize(mix(beep, click), 0.58), sr, 0.002, 0.03);
	}),

	countdown_go: recipe(0.55, 93_010, 'ui', 3, 1, 100, (sr) => {
		const output = new Float32Array(Math.floor(0.55 * sr));

		mixInto(output, tone(sr, 0.2, 660, 660, 'triangle', 0.34, 1.6), 1);
		mixInto(output, tone(sr, 0.38, 1320, 1320, 'sine', 0.3, 1.4), 1, Math.floor(0.12 * sr));

		return fadeEdges(normalize(output, 0.66), sr, 0.005, 0.08);
	}),

	ui_click: recipe(0.08, 90_000, 'ui', 1, 3, 30, (sr) =>
		fadeEdges(normalize(click(sr, 90_001, 1800, 0.32), 0.36), sr, 0.001, 0.02)
	),

	ui_confirm: recipe(0.24, 90_010, 'ui', 2, 2, 50, (sr) => {
		const first = tone(sr, 0.12, 660, 680, 'sine', 0.24, 1.6);
		const second = tone(sr, 0.16, 880, 900, 'sine', 0.22, 1.6);

		return fadeEdges(normalize(mix(first, second), 0.5), sr);
	}),

	ui_error: recipe(0.2, 90_020, 'ui', 1, 2, 80, (sr) => {
		const buzz = renderTone(sr, {
			duration: 0.18,
			f0: 220,
			f1: 180,
			wave: 'square',
			gain: 0.22,
			attack: 0.005,
			decay: 0.17,
			curve: 2.2
		});

		return fadeEdges(normalize(buzz, 0.4), sr);
	}),

	wave_start: recipe(0.8, 90_030, 'ui', 3, 1, 500, (sr) => {
		const horn = renderTone(sr, {
			duration: 0.75,
			f0: 180,
			f1: 240,
			wave: 'saw',
			gain: 0.34,
			attack: 0.08,
			decay: 0.68,
			curve: 1.5,
			vibratoHz: 4,
			vibratoDepth: 0.02
		});
		const noise = shortNoise(sr, 0.5, 90_031, 'lowpass', 600, 0.8, 'brown', 0.2);

		return fadeEdges(normalize(mix(horn, noise), 0.68), sr, 0.02, 0.12);
	}),

	wave_clear: recipe(0.8, 90_040, 'ui', 3, 1, 500, (sr) => {
		const output = new Float32Array(Math.floor(0.8 * sr));
		const notes = [523, 659, 784, 1046];

		for (let index = 0; index < notes.length; index += 1) {
			mixInto(
				output,
				tone(sr, 0.35, notes[index], notes[index], 'sine', 0.22, 1.6),
				1,
				Math.floor(index * 0.12 * sr)
			);
		}

		return fadeEdges(normalize(output, 0.68), sr, 0.01, 0.1);
	}),

	/**
	 * Victoria de misión: acorde menor que resuelve a mayor (tercera de
	 * Picardía), campanas ascendentes y timbal. Suena a recompensa de Halloween.
	 */
	mission_win: recipe(2.2, 95_000, 'ui', 3, 1, 1500, (sr) => {
		const output = new Float32Array(Math.floor(2.2 * sr));

		mixInto(
			output,
			renderTone(sr, {
				duration: 0.45,
				f0: 70,
				f1: 44,
				wave: 'sine',
				gain: 0.5,
				attack: 0.004,
				decay: 0.44,
				curve: 2.8
			}),
			1
		);
		mixInto(
			output,
			renderTone(sr, {
				duration: 2.05,
				f0: 110,
				f1: 110,
				wave: 'sine',
				gain: 0.16,
				attack: 0.02,
				decay: 2,
				curve: 1.2
			}),
			1
		);

		const minor = [220, 261.63, 329.63];
		const major = [220, 277.18, 329.63];

		for (const freq of minor) {
			mixInto(
				output,
				renderTone(sr, {
					duration: 1,
					f0: freq,
					f1: freq,
					wave: 'triangle',
					gain: 0.075,
					attack: 0.03,
					decay: 1,
					curve: 1.3,
					tremoloHz: 6,
					tremoloDepth: 0.35
				}),
				1
			);
		}

		for (const freq of major) {
			mixInto(
				output,
				renderTone(sr, {
					duration: 1.2,
					f0: freq,
					f1: freq,
					wave: 'triangle',
					gain: 0.075,
					attack: 0.03,
					decay: 1.15,
					curve: 1.3,
					tremoloHz: 6,
					tremoloDepth: 0.35
				}),
				1,
				Math.floor(0.9 * sr)
			);
		}

		const bells = [
			{ freq: 440, at: 0 },
			{ freq: 523.25, at: 0.16 },
			{ freq: 659.25, at: 0.32 },
			{ freq: 880, at: 0.5 },
			{ freq: 1318.51, at: 1.1 }
		];

		for (const bell of bells) {
			mixInto(
				output,
				renderTone(sr, {
					duration: 1.1,
					f0: bell.freq,
					f1: bell.freq,
					wave: 'sine',
					gain: 0.12,
					attack: 0.004,
					decay: 1.05,
					curve: 2.2,
					vibratoHz: 4.2,
					vibratoDepth: 0.005
				}),
				1,
				Math.floor(bell.at * sr)
			);
		}

		mixInto(
			output,
			shortNoise(sr, 1.2, 95_001, 'highpass', 2800, 0.9, 'white', 0.12),
			1,
			Math.floor(0.35 * sr)
		);

		return fadeEdges(normalize(output, 0.8), sr, 0.01, 0.3);
	}),

	/** Derrota de misión: lamento cromático descendente y campana grave. */
	mission_lose: recipe(2.1, 95_100, 'ui', 3, 1, 1500, (sr) => {
		const output = new Float32Array(Math.floor(2.1 * sr));
		const notes = [
			{ freq: 659.25, at: 0 },
			{ freq: 622.25, at: 0.18 },
			{ freq: 587.33, at: 0.36 },
			{ freq: 554.37, at: 0.54 },
			{ freq: 523.25, at: 0.72 },
			{ freq: 220, at: 1.05 }
		];

		for (const note of notes) {
			const long = note.at >= 1;
			mixInto(
				output,
				renderTone(sr, {
					duration: long ? 0.95 : 0.55,
					f0: note.freq * 1.035,
					f1: note.freq,
					wave: 'sine',
					gain: 0.22,
					attack: 0.02,
					decay: long ? 0.92 : 0.52,
					curve: 1.6,
					vibratoHz: 5.1,
					vibratoDepth: 0.012
				}),
				1,
				Math.floor(note.at * sr)
			);
		}

		for (const at of [0.05, 1.15]) {
			mixInto(
				output,
				renderTone(sr, {
					duration: 0.95,
					f0: 110,
					f1: 110,
					wave: 'sine',
					gain: 0.26,
					attack: 0.005,
					decay: 0.92,
					curve: 2.6
				}),
				1,
				Math.floor(at * sr)
			);
		}

		mixInto(output, shortNoise(sr, 1.9, 95_101, 'lowpass', 240, 0.7, 'brown', 0.18), 1);

		return fadeEdges(normalize(output, 0.72), sr, 0.02, 0.3);
	}),

	cat_meow: recipe(0.62, 91_000, 'voice', 2, 2, 120, (sr) => {
		const output = new Float32Array(Math.floor(0.62 * sr));

		// «Mii-ow»: subida corta y caída más larga, con vibrato de gatito.
		mixInto(
			output,
			renderTone(sr, {
				duration: 0.24,
				f0: 470,
				f1: 790,
				wave: 'triangle',
				gain: 0.44,
				attack: 0.02,
				decay: 0.22,
				curve: 1.5,
				vibratoHz: 8,
				vibratoDepth: 0.04
			}),
			1
		);
		mixInto(
			output,
			renderTone(sr, {
				duration: 0.42,
				f0: 780,
				f1: 430,
				wave: 'triangle',
				gain: 0.36,
				attack: 0.01,
				decay: 0.4,
				curve: 2.3,
				start: 0.16,
				vibratoHz: 6,
				vibratoDepth: 0.03
			}),
			0.9
		);

		const voiced = formantLayer(output, sr, [
			{ freq: 900, q: 4, gain: 1 },
			{ freq: 1900, q: 5, gain: 0.45 }
		]);
		const breath = renderNoise(sr, {
			duration: 0.62,
			seed: 91_001,
			kind: 'white',
			gain: 0.07,
			attack: 0.03,
			decay: 0.55,
			curve: 2
		});

		return fadeEdges(normalize(mix(voiced, breath), 0.7), sr, 0.01, 0.06);
	}),

	paper_throw: recipe(0.42, 92_000, 'sfx', 1, 2, 60, (sr) => {
		const output = new Float32Array(Math.floor(0.42 * sr));
		const whoosh = applyFilterSweep(
			renderNoise(sr, {
				duration: 0.4,
				seed: 92_001,
				kind: 'white',
				gain: 0.42,
				attack: 0.015,
				decay: 0.38,
				curve: 2
			}),
			sr,
			'bandpass',
			700,
			2400,
			1.3
		);

		mixInto(output, whoosh, 1);
		mixInto(
			output,
			shortNoise(sr, 0.12, 92_002, 'highpass', 2600, 0.8, 'white', 0.18),
			1,
			Math.floor(0.04 * sr)
		);

		return fadeEdges(normalize(output, 0.55), sr, 0.005, 0.06);
	}),

	cat_purr: recipe(0.95, 91_010, 'voice', 1, 2, 200, (sr) => {
		// Ronroneo: zumbido grave con tremolo rápido y aire filtrado.
		const rumble = renderTone(sr, {
			duration: 0.9,
			f0: 48,
			f1: 42,
			wave: 'saw',
			gain: 0.34,
			attack: 0.06,
			decay: 0.85,
			curve: 1.2,
			tremoloHz: 24,
			tremoloDepth: 0.75
		});
		const breath = renderNoise(sr, {
			duration: 0.9,
			seed: 91_011,
			kind: 'brown',
			gain: 0.16,
			attack: 0.05,
			decay: 0.85,
			curve: 1.2,
			filter: 'lowpass',
			freq: 320,
			q: 0.7
		});

		return fadeEdges(normalize(mix(rumble, breath), 0.48), sr, 0.04, 0.08);
	})
};

export const SOUND_GROUPS: ReadonlyArray<{ label: string; ids: SoundId[] }> = [
	{
		label: 'Footsteps',
		ids: (['grass', 'dirt', 'stone', 'wood'] as const).flatMap((surface) =>
			([0, 1, 2] as const).map((variant) => `footstep_${surface}_${variant}` as SoundId)
		)
	},
	{
		label: 'Player',
		ids: [
			'jump',
			'land',
			'player_hurt_light',
			'player_hurt_heavy',
			'player_downed',
			'player_revive',
			'player_heal',
			'paper_throw'
		]
	},
	{
		label: 'Weapons',
		ids: [
			'shot_pistol',
			'shot_shotgun',
			'shot_smg',
			'shot_rifle',
			'dry_fire',
			'reload_start',
			'reload_end',
			'shell_drop',
			'grenade_throw',
			'grenade_bounce',
			'explosion',
			'acid_throw',
			'acid_impact',
			'acid_sizzle'
		]
	},
	{
		label: 'Impacts',
		ids: ['hit_flesh', 'hit_bone', 'hit_stone', 'hit_wood']
	},
	{
		label: 'Monsters',
		ids: MONSTER_IDS.flatMap((kind) =>
			(['idle', 'attack', 'hurt', 'death'] as const).map(
				(mode) => `monster_${kind}_${mode}` as SoundId
			)
		)
	},
	{
		label: 'Parkour',
		ids: ['parkour_fall', 'parkour_respawn', 'parkour_finish']
	},
	{
		label: 'Critters',
		ids: ['cat_meow', 'cat_purr']
	},
	{
		label: 'Vehicles',
		ids: [
			'car_engine',
			'car_tire',
			'car_impact_light',
			'car_impact_heavy',
			'car_rollover',
			'car_explosion',
			'car_enter',
			'car_exit'
		]
	},
	{
		label: 'Race',
		ids: [
			'missile_fire',
			'missile_hit',
			'mine_drop',
			'mine_explode',
			'ray_fire',
			'gate_pass',
			'lap',
			'item_pick',
			'item_use',
			'race_destroyed',
			'race_respawn',
			'race_finish'
		]
	},
	{
		label: 'Music',
		ids: ['music_halloween']
	},
	{
		label: 'Ambience',
		ids: [
			'ambience_centro',
			'ambience_bosque',
			'ambience_castillo',
			'ambience_calabazar',
			'ambience_cementerio',
			'ambience_crypt',
			'ambience_race',
			'ambience_waves',
			'amb_owl',
			'amb_crickets',
			'amb_creak',
			'amb_drip',
			'amb_thunder'
		]
	},
	{
		label: 'UI',
		ids: [
			'pickup_weapon',
			'pickup_ammo',
			'pickup_grenade',
			'pickup_health',
			'checkpoint',
			'countdown_tick',
			'countdown_go',
			'ui_click',
			'ui_confirm',
			'ui_error',
			'wave_start',
			'wave_clear',
			'mission_win',
			'mission_lose'
		]
	}
];

export function isSoundId(value: string): value is SoundId {
	return value in RECIPES;
}
