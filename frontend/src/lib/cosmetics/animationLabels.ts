import type { HeroAnimation } from '../services/protocol';

/** Etiquetas legibles del catálogo de clips del jugador. */
export const ANIMATION_LABELS: Record<HeroAnimation, string> = {
	HR_idle: 'Idle',
	HR_walk: 'Walk',
	HR_run: 'Run',
	HR_jump: 'Jump',
	HR_sit: 'Sit',
	HR_aim: 'Aim',
	HR_walk_aim: 'Walk aim',
	HR_run_aim: 'Run aim',
	HR_crouch_aim: 'Crouch aim',
	HR_attack: 'Attack',
	HR_shoot: 'Shoot',
	HR_wave: 'Wave',
	HR_pickup: 'Pick up',
	HR_hit: 'Take a hit',
	HR_death: 'Fall',
	HR_injured: 'Injured',
	HR_heal: 'Heal',
	HR_carry: 'Carry',
	HR_throw: 'Throw',
	HR_paquete: 'Pick up package',
	HR_gracias: 'Thank you',
	HR_dormir: 'Sleep',
	HR_hablar: 'Talk',
	HR_si: 'Yes',
	HR_no: 'No',
	HR_dance: 'Dance'
};

export type AnimationGroup = {
	id: string;
	label: string;
	clips: HeroAnimation[];
};

/** Agrupación del panel; las entradas sin clip disponible se omiten al pintar. */
export const ANIMATION_GROUPS: AnimationGroup[] = [
	{
		id: 'movement',
		label: 'Movement',
		clips: [
			'HR_idle',
			'HR_walk',
			'HR_run',
			'HR_jump',
			'HR_sit',
			'HR_aim',
			'HR_walk_aim',
			'HR_run_aim',
			'HR_crouch_aim'
		]
	},
	{
		id: 'actions',
		label: 'Actions',
		clips: [
			'HR_attack',
			'HR_shoot',
			'HR_wave',
			'HR_pickup',
			'HR_hit',
			'HR_death',
			'HR_injured',
			'HR_heal',
			'HR_carry',
			'HR_throw'
		]
	},
	{
		id: 'social',
		label: 'Social',
		clips: ['HR_paquete', 'HR_gracias', 'HR_dormir', 'HR_hablar', 'HR_si', 'HR_no', 'HR_dance']
	}
];
