import type { NpcClip } from './npcAnimations';

export type NpcGesture = Extract<
	NpcClip,
	'wave' | 'talk' | 'package' | 'thanks' | 'yes' | 'no' | 'sit' | 'sleep'
>;

export type NpcQuest = 'none' | 'carrying' | 'delivered';

export type NpcChoice = {
	id: string;
	label: string;
	next?: string;
	gesture?: NpcGesture;
	action?: 'give-package' | 'deliver-package' | 'close';
	requires?: NpcQuest;
};

export type NpcDialogueNode = {
	text: string;
	gesture?: NpcGesture;
	choices: NpcChoice[];
};

export type NpcDialogue = {
	starts: Partial<Record<NpcQuest, string>> & { default: string };
	nodes: Record<string, NpcDialogueNode>;
};

export type NpcDialogueId =
	'alba' | 'bruno' | 'carmen' | 'mateo' | 'lucia' | 'tomas' | 'vera' | 'rosa' | 'elias';

const CLOSE: NpcChoice = {
	id: 'bye',
	label: 'Goodnight',
	gesture: 'wave',
	action: 'close'
};

export const NPC_DIALOGUES: Record<NpcDialogueId, NpcDialogue> = {
	carmen: {
		starts: { none: 'intro', carrying: 'reminder', delivered: 'blessing', default: 'intro' },
		nodes: {
			intro: {
				text: 'Evening, dear. I have a parcel for Mateo, but my knees are not what they were. Could you take it?',
				choices: [
					{
						id: 'accept',
						label: "I'll deliver it",
						action: 'give-package',
						gesture: 'package',
						next: 'given',
						requires: 'none'
					},
					{
						id: 'who',
						label: 'Who is Mateo?',
						next: 'who',
						requires: 'none'
					},
					{
						id: 'later',
						label: 'Not right now',
						gesture: 'no',
						action: 'close'
					}
				]
			},
			who: {
				text: 'Young Mateo, the messenger. He walks the ring around the big tree. You cannot miss him.',
				choices: [
					{
						id: 'accept',
						label: "I'll deliver it",
						action: 'give-package',
						gesture: 'package',
						next: 'given',
						requires: 'none'
					},
					{
						id: 'later',
						label: 'Maybe later',
						gesture: 'no',
						action: 'close'
					}
				]
			},
			given: {
				text: 'Take care of it, dear. He is usually by the big tree, walking the plaza loop.',
				choices: [
					{
						id: 'find',
						label: "I'll find him",
						gesture: 'thanks',
						action: 'close'
					}
				]
			},
			reminder: {
				text: 'Mateo is walking the plaza loop. Thank you, dear.',
				choices: [
					{
						id: 'find',
						label: "I'll find him",
						gesture: 'thanks',
						action: 'close'
					},
					{
						id: 'where',
						label: 'Where is he again?',
						next: 'hint'
					}
				]
			},
			hint: {
				text: 'Around the old tree, in the middle of the plaza. The lanterns make it easy to spot him.',
				choices: [CLOSE]
			},
			blessing: {
				text: 'You found him! Bless you, dear. The parcel made his whole evening.',
				choices: [
					{
						id: 'welcome',
						label: "You're welcome",
						gesture: 'thanks',
						action: 'close'
					}
				]
			}
		}
	},
	mateo: {
		starts: { none: 'chat', carrying: 'package', delivered: 'delivered', default: 'chat' },
		nodes: {
			chat: {
				text: 'Evening! Fine night for a walk around the old tree, is it not?',
				choices: [
					{ id: 'yes', label: 'It is', gesture: 'yes', next: 'chat-yes' },
					{ id: 'no', label: 'Too foggy for me', gesture: 'no', next: 'chat-no' },
					CLOSE
				]
			},
			'chat-yes': {
				text: 'Right? The lanterns make the whole plaza glow. I could walk this loop all night.',
				choices: [CLOSE]
			},
			'chat-no': {
				text: 'Ha! Fair enough. The fog is thick tonight, but it keeps the streets quiet.',
				choices: [CLOSE]
			},
			package: {
				text: 'Is that for me? You are a lifesaver.',
				choices: [
					{
						id: 'deliver',
						label: 'Here you go',
						action: 'deliver-package',
						gesture: 'thanks',
						next: 'received',
						requires: 'carrying'
					},
					{
						id: 'not-yet',
						label: 'Not yet',
						gesture: 'no',
						action: 'close'
					}
				]
			},
			received: {
				text: "Carmen's parcel! I have been waiting all evening. Thank you.",
				choices: [
					{
						id: 'welcome',
						label: "You're welcome",
						gesture: 'thanks',
						action: 'close'
					}
				]
			},
			delivered: {
				text: "Carmen's parcel is safe with me. You saved me a long walk tonight.",
				choices: [
					{
						id: 'welcome',
						label: 'Any time',
						gesture: 'thanks',
						action: 'close'
					}
				]
			}
		}
	},
	alba: {
		starts: { default: 'start' },
		nodes: {
			start: {
				text: 'The witch house garden keeps blooming, even in this fog. Flowers do not care about curses.',
				choices: [
					{ id: 'yes', label: 'It is beautiful', gesture: 'yes', next: 'agree' },
					{ id: 'no', label: 'It gives me the creeps', gesture: 'no', next: 'disagree' },
					CLOSE
				]
			},
			agree: {
				text: 'I pick a few every dusk. The pink ones only open when the moon is up.',
				choices: [CLOSE]
			},
			disagree: {
				text: 'Oh, the woods are gentle enough if you keep to the path. Mostly.',
				choices: [CLOSE]
			}
		}
	},
	bruno: {
		starts: { default: 'start' },
		nodes: {
			start: {
				text: 'I have been baking since sunset. The diner smells like cinnamon all the way out here.',
				choices: [
					{ id: 'yes', label: 'Smells delicious', gesture: 'yes', next: 'agree' },
					{ id: 'no', label: 'I am not hungry', gesture: 'no', next: 'disagree' },
					CLOSE
				]
			},
			agree: {
				text: 'Come by the diner later. I always save one roll for a friendly face.',
				choices: [CLOSE]
			},
			disagree: {
				text: 'More for the night shift, then. The racers eat like wolves.',
				choices: [CLOSE]
			}
		}
	},
	lucia: {
		starts: { default: 'start' },
		nodes: {
			start: {
				text: 'Did you hear the engines from the grandstand? Sounds like race night again.',
				choices: [
					{ id: 'yes', label: 'I heard them', gesture: 'yes', next: 'agree' },
					{ id: 'no', label: 'I was not listening', gesture: 'no', next: 'disagree' },
					CLOSE
				]
			},
			agree: {
				text: 'They shake the whole plaza. My teacups rattle on the shelf every lap.',
				choices: [CLOSE]
			},
			disagree: {
				text: 'Lucky you. I can set my clock by the third lap.',
				choices: [CLOSE]
			}
		}
	},
	tomas: {
		starts: { default: 'start' },
		nodes: {
			start: {
				text: 'These old engines only wake up when the moon does. Strange machines, stranger town.',
				choices: [
					{ id: 'yes', label: 'They sound alive', gesture: 'yes', next: 'agree' },
					{ id: 'no', label: 'They sound broken', gesture: 'no', next: 'disagree' },
					CLOSE
				]
			},
			agree: {
				text: 'Alive is the right word. I swear the garage one hums a tune when it idles.',
				choices: [CLOSE]
			},
			disagree: {
				text: 'Broken is just a machine asking for a little attention. I can fix that.',
				choices: [CLOSE]
			}
		}
	},
	vera: {
		starts: { default: 'start' },
		nodes: {
			start: {
				text: 'The castle keeps its doors shut, but the stones remember every visitor.',
				choices: [
					{ id: 'yes', label: 'I want to go in', gesture: 'yes', next: 'agree' },
					{ id: 'no', label: 'Some doors should stay shut', gesture: 'no', next: 'disagree' },
					CLOSE
				]
			},
			agree: {
				text: 'Then keep an eye on the tower. On clear nights a light moves from window to window.',
				choices: [CLOSE]
			},
			disagree: {
				text: 'Wise. The castle has waited a hundred years. It can wait a little longer.',
				choices: [CLOSE]
			}
		}
	},
	rosa: {
		starts: { default: 'start' },
		nodes: {
			start: {
				text: 'I saw a pumpkin with teeth! It was THIS big. It looked right at me.',
				choices: [
					{ id: 'yes', label: 'I believe you', gesture: 'yes', next: 'agree' },
					{ id: 'no', label: 'Pumpkins do not have teeth', gesture: 'no', next: 'disagree' },
					CLOSE
				]
			},
			agree: {
				text: 'Right? I am going to draw it tomorrow. With extra teeth.',
				choices: [CLOSE]
			},
			disagree: {
				text: 'They do so! Maybe not in the daytime. But at night, anything can have teeth.',
				choices: [CLOSE]
			}
		}
	},
	elias: {
		starts: { default: 'start' },
		nodes: {
			start: {
				text: 'I keep the lanterns lit for those who rest here. Even caretakers get tired, you know.',
				choices: [
					{ id: 'rest', label: 'Rest a while', gesture: 'yes', next: 'rest' },
					{
						id: 'goodnight',
						label: 'I will let you sleep',
						gesture: 'thanks',
						action: 'close'
					},
					CLOSE
				]
			},
			rest: {
				text: 'Maybe just a moment. The stones are quiet tonight, and the fog keeps the noise away.',
				choices: [CLOSE]
			}
		}
	}
};

export function resolveDialogueStart(dialogue: NpcDialogue, quest: NpcQuest): string {
	return dialogue.starts[quest] ?? dialogue.starts.default;
}

export function getDialogueChoices(node: NpcDialogueNode, quest: NpcQuest): NpcChoice[] {
	return node.choices.filter(
		(choice) => choice.requires === undefined || choice.requires === quest
	);
}
