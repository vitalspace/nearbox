<script lang="ts">
	import { useTask } from '@threlte/core';
	import { useRapier } from '@threlte/rapier';
	import { createAgent, hashString, updateAgent, type NpcAgent } from '../../npcs/npcAgent';
	import {
		NPC_DETECTION_INTERVAL_MS,
		NPC_DIALOG_MAX_DISTANCE,
		NPC_GROUND_INTERVAL_MS,
		NPC_INTERACT_RADIUS,
		NPC_DEFINITIONS,
		type NpcId
	} from '../../npcs/npcConfig';
	import { approachHeight, createNpcGroundSampler } from '../../npcs/npcGround';
	import { NPC_ROUTES } from '../../npcs/npcRoutes';
	import { npcs } from '../../state/npcs.svelte';
	import { playerRuntime, playerState } from '../../state/playerState';
	import NpcCharacter from './NpcCharacter.svelte';

	const { world } = useRapier();
	const sampler = createNpcGroundSampler(world);

	// The agents are also the offline fallback: while the socket is connected
	// the server simulates them and these mirrors just follow its snapshots.
	const agents: NpcAgent[] = NPC_DEFINITIONS.map((definition) =>
		createAgent(definition, NPC_ROUTES[definition.routeId], hashString(definition.id))
	);

	const lastGroundAt = new Map<NpcId, number>();
	const groundTargets = new Map<NpcId, number>();
	const renderHeights = new Map<NpcId, number>();
	const publishedGestureSeq = new Map<NpcId, number>();
	const lastServerXZ = new Map<NpcId, { x: number; z: number }>();

	let sampledInitial = false;
	let lastDetectionAt = 0;

	$effect(() => {
		return () => npcs.setNearest(null);
	});

	useTask((delta) => {
		const step = Math.min(Math.max(delta, 0), 0.1);
		const now = Date.now();
		const online = npcs.online;

		if (!sampledInitial) {
			sampledInitial = true;

			for (const agent of agents) {
				renderHeights.set(agent.id, sampler.sample(agent.x, agent.z, agent.y));
				groundTargets.set(agent.id, renderHeights.get(agent.id) ?? agent.y);
				lastGroundAt.set(agent.id, now);
			}
		}

		if (online) {
			// Authoritative server pose; yaw and clip are already resolved.
			for (const agent of agents) {
				const visual = npcs.sample(agent.id);

				if (!visual) {
					continue;
				}

				agent.x = visual.x;
				agent.z = visual.z;
				agent.yaw = visual.yaw;
				agent.clip = visual.clip;
				agent.gesture = visual.gesture;
				agent.gestureSeq = visual.serverGestureSeq;

				npcs.applyServerGesture(agent.id, visual.gesture, visual.serverGestureSeq);
				publishedGestureSeq.set(agent.id, agent.gestureSeq);

				const previous = lastServerXZ.get(agent.id);

				if (previous && Math.hypot(visual.x - previous.x, visual.z - previous.z) > 2.5) {
					// Server reset/teleport: re-anchor the floor instead of
					// dragging the old height across the map.
					const height = sampler.sample(visual.x, visual.z, visual.y);
					renderHeights.set(agent.id, height);
					groundTargets.set(agent.id, height);
				}

				lastServerXZ.set(agent.id, { x: visual.x, z: visual.z });

				if (!renderHeights.has(agent.id)) {
					renderHeights.set(agent.id, visual.y);
				}
			}
		} else {
			const dialogId = npcs.dialogNpcId;

			for (const agent of agents) {
				updateAgent(agent, {
					delta: step,
					nowMs: now,
					playerActive: !playerRuntime.frozen,
					playerX: playerState.x,
					playerZ: playerState.z,
					dialog: dialogId === agent.id,
					others: agents
				});

				if ((publishedGestureSeq.get(agent.id) ?? 0) !== agent.gestureSeq) {
					publishedGestureSeq.set(agent.id, agent.gestureSeq);
					npcs.emitGesture(agent.id, agent.gesture ?? 'wave');
				}
			}
		}

		// The server has no map colliders, so the walkable height is always
		// sampled here. It only corrects y; x/z/yaw come from the server.
		for (const agent of agents) {
			if (now - (lastGroundAt.get(agent.id) ?? 0) >= NPC_GROUND_INTERVAL_MS) {
				lastGroundAt.set(agent.id, now);
				groundTargets.set(
					agent.id,
					sampler.sample(agent.x, agent.z, renderHeights.get(agent.id) ?? agent.y)
				);
			}

			const current = renderHeights.get(agent.id) ?? agent.y;
			const target = groundTargets.get(agent.id) ?? current;
			const y = approachHeight(current, target, step);

			renderHeights.set(agent.id, y);
			agent.y = y;
			npcs.publish(agent.id, agent.x, y, agent.z, agent.yaw, agent.clip);
		}

		if (now - lastDetectionAt >= NPC_DETECTION_INTERVAL_MS) {
			lastDetectionAt = now;

			let nearest: NpcId | null = null;
			let nearestDistance = NPC_INTERACT_RADIUS;

			for (const agent of agents) {
				const horizontal = Math.hypot(playerState.x - agent.x, playerState.z - agent.z);

				if (Math.abs(playerState.y - agent.y) > 2) {
					continue;
				}

				if (horizontal <= nearestDistance) {
					nearest = agent.id;
					nearestDistance = horizontal;
				}
			}

			npcs.setNearest(nearest, nearestDistance);
		}

		const dialogId = npcs.dialogNpcId;

		if (dialogId) {
			const state = npcs.runtime[dialogId];
			const horizontal = Math.hypot(playerState.x - state.x, playerState.z - state.z);

			if (horizontal > NPC_DIALOG_MAX_DISTANCE) {
				npcs.closeDialog();
			}
		}
	});
</script>

{#each NPC_DEFINITIONS as definition (definition.id)}
	<NpcCharacter {definition} />
{/each}
