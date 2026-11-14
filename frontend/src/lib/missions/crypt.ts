/**
 * Mission data for `minigame-2` (the mummy crypt).
 *
 * The server decides the round; the client only records the local victory so
 * the reward can be persisted in `rw:missions:v1` and `rw:profile:v1`, the same
 * way `cats-25` works.
 */
export const MISSION_CRYPT_5 = {
	id: 'crypt-5-skulls',
	title: 'The Mummy Crypt',
	description: 'Deposit all ten skulls in the main tomb and escape the mummies.',
	target: 10,
	skullIds: [
		'skull-west',
		'skull-west-2',
		'skull-south',
		'skull-south-2',
		'skull-east',
		'skull-east-2',
		'skull-north',
		'skull-north-2',
		'skull-niches',
		'skull-niches-2'
	]
} as const;
