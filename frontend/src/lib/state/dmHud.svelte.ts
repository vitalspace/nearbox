/**
 * Small amount of UI-only state shared by the Deathmatch HUD and the touch
 * controls: the top 5 side panel can be collapsed from either of them.
 */
class DeathmatchHudState {
	top5Visible = $state(true);

	toggleTop5(): void {
		this.top5Visible = !this.top5Visible;
	}

	reset(): void {
		this.top5Visible = true;
	}
}

export const dmHud = new DeathmatchHudState();
