import { CanvasTexture, SpriteMaterial, SRGBColorSpace } from 'three';

const TAG_WIDTH = 320;
const TAG_HEIGHT = 96;

/**
 * 3D label for an NPC: name on the first line, role under it.
 *
 * Follows the same canvas-sprite pattern as `player/nameTag.ts`, but keeps the
 * name and the role on separate baselines so long roles stay readable.
 */
export function createNpcNameTagMaterial(
	name: string,
	role: string,
	color: string
): SpriteMaterial | null {
	if (typeof document === 'undefined') {
		return null;
	}

	const canvas = document.createElement('canvas');
	canvas.width = TAG_WIDTH;
	canvas.height = TAG_HEIGHT;

	const context = canvas.getContext('2d');

	if (!context) {
		return null;
	}

	context.clearRect(0, 0, TAG_WIDTH, TAG_HEIGHT);

	context.fillStyle = 'rgba(8, 10, 16, 0.72)';
	context.beginPath();
	context.roundRect(4, 6, TAG_WIDTH - 8, TAG_HEIGHT - 12, 18);
	context.fill();

	context.textBaseline = 'middle';
	context.textAlign = 'left';
	context.lineJoin = 'round';
	context.lineWidth = 4;
	context.strokeStyle = 'rgba(8, 10, 16, 0.85)';

	context.font = '700 27px ui-sans-serif, system-ui, sans-serif';
	context.strokeText(name.slice(0, 14), 20, 36);
	context.fillStyle = color;
	context.fillText(name.slice(0, 14), 20, 36);

	context.font = '500 19px ui-sans-serif, system-ui, sans-serif';
	context.strokeText(role.slice(0, 22), 20, 68);
	context.fillStyle = 'rgba(226, 232, 240, 0.9)';
	context.fillText(role.slice(0, 22), 20, 68);

	const texture = new CanvasTexture(canvas);
	texture.colorSpace = SRGBColorSpace;

	return new SpriteMaterial({
		map: texture,
		transparent: true,
		depthTest: false,
		depthWrite: false
	});
}
