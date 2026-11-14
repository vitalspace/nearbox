<script lang="ts">
	import { cars } from '../../state/cars.svelte';
	import { lobby } from '../../state/lobby.svelte';
	import { race } from '../../state/race.svelte';
	import RemoteHero from './RemoteHero.svelte';

	// Only global lobby players: the crypt has its own avatars
	// (`minigame2/RemotePlayers`), and anyone in a mini lobby is not on the
	// outdoor map. Drivers are hidden: their body goes inside the car. Balloon
	// crew stays visible: `RemoteHero` parks them on their seat.
	const others = $derived(
		(lobby.presence?.lobbies ?? [])
			.flatMap((entry) => entry.players)
			.filter(
				(player) =>
					player.lobbyId === 'global' &&
					player.id !== lobby.self?.id &&
					!cars.driverIds.has(player.id) &&
					!race.racerIds.has(player.id)
			)
	);
</script>

{#each others as player (player.id)}
	<RemoteHero
		id={player.id}
		name={player.name}
		skin={player.skin}
		crown={player.crown}
		ride={player.ride}
		weaponVariant={player.weaponVariant}
	/>
{/each}
