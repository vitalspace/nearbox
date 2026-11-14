import { CanvasTexture, SpriteMaterial, SRGBColorSpace } from 'three';

const TAG_WIDTH = 320;
const TAG_HEIGHT = 80;

/**
 * Builds the material for the 3D label that floats above a player's
 * head. `color` tints the name; `badge` (for example `×3`) is drawn on
 * the right in green.
 */
export function createNameTagMaterial(
	name: string,
	color: string,
	badge?: string
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
	context.roundRect(4, 8, TAG_WIDTH - 8, TAG_HEIGHT - 16, 18);
	context.fill();

	context.textBaseline = 'middle';
	context.lineJoin = 'round';
	context.lineWidth = 4;
	context.strokeStyle = 'rgba(8, 10, 16, 0.85)';

	context.font = '600 26px ui-sans-serif, system-ui, sans-serif';
	context.strokeText(name.slice(0, 14), 18, 40);
	context.fillStyle = color;
	context.fillText(name.slice(0, 14), 18, 40);

	if (badge) {
		context.font = '700 26px ui-sans-serif, system-ui, sans-serif';
		context.textAlign = 'right';
		context.strokeText(badge, TAG_WIDTH - 20, 40);
		context.fillStyle = '#a7f3d0';
		context.fillText(badge, TAG_WIDTH - 20, 40);
	}

	const texture = new CanvasTexture(canvas);
	texture.colorSpace = SRGBColorSpace;

	return new SpriteMaterial({
		map: texture,
		transparent: true,
		depthTest: false,
		depthWrite: false
	});
}
