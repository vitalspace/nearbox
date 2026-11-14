import {
	CanvasTexture,
	ClampToEdgeWrapping,
	DataTexture,
	LinearFilter,
	RGBAFormat,
	SRGBColorSpace,
	type Texture
} from 'three';

/**
 * Shader de la pantalla del club (`DV_VideoWall`).
 *
 * Es una pantalla de música electrónica: rejilla neón, ecualizador de barras
 * que responde al bus de música, anillos giratorios, línea de barrido y un
 * pulso de "kick" que ilumina toda la superficie. El logo del local se pinta
 * en el centro con un halo que late al ritmo.
 */

/** Path del SVG original (viewBox 0 0 90.1 90). */
const LOGO_PATH =
	'M72.2,4.6L53.4,32.5c-1.3,1.9,1.2,4.2,3,2.6L74.9,19c0.5-0.4,1.2-0.1,1.2,0.6v50.3c0,0.7-0.9,1-1.3,0.5l-56-67C17,1.2,14.4,0,11.5,0h-2C4.3,0,0,4.3,0,9.6v70.8C0,85.7,4.3,90,9.6,90c3.3,0,6.4-1.7,8.2-4.6l18.8-27.9c1.3-1.9-1.2-4.2-3-2.6l-18.5,16c-0.5,0.4-1.2,0.1-1.2-0.6V20.1c0-0.7,0.9-1,1.3-0.5l56,67c1.8,2.2,4.5,3.4,7.3,3.4h2c5.3,0,9.6-4.3,9.6-9.6V9.6c0-5.3-4.3-9.6-9.6-9.6C77.1,0,74,1.7,72.2,4.6z';

/** Tamaño del lienzo donde se rasteriza el SVG. */
const LOGO_TEXTURE_SIZE = 512;

/**
 * Rasteriza el SVG a una textura con alfa, para poder usarlo como máscara
 * dentro del shader sin depender de cargas de red ni de imágenes externas.
 */
export function createVideoWallLogoTexture(): Texture {
	if (typeof document === 'undefined') {
		return new DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, RGBAFormat);
	}

	const canvas = document.createElement('canvas');
	canvas.width = LOGO_TEXTURE_SIZE;
	canvas.height = LOGO_TEXTURE_SIZE;

	const context = canvas.getContext('2d');

	if (!context) {
		return new DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, RGBAFormat);
	}

	const padding = LOGO_TEXTURE_SIZE * 0.05;
	const scale = (LOGO_TEXTURE_SIZE - padding * 2) / 90.1;

	context.clearRect(0, 0, LOGO_TEXTURE_SIZE, LOGO_TEXTURE_SIZE);
	context.save();
	context.translate(padding, padding);
	context.scale(scale, scale);
	context.fillStyle = '#ffffff';
	context.fill(new Path2D(LOGO_PATH));
	context.restore();

	const texture = new CanvasTexture(canvas);
	texture.colorSpace = SRGBColorSpace;
	texture.wrapS = ClampToEdgeWrapping;
	texture.wrapT = ClampToEdgeWrapping;
	texture.minFilter = LinearFilter;
	texture.magFilter = LinearFilter;
	texture.needsUpdate = true;

	return texture;
}

export const VIDEO_WALL_VERTEX_SHADER = /* glsl */ `
	varying vec3 vLocalPos;
	varying vec3 vLocalNormal;
	varying vec3 vWorldNormal;
	varying vec3 vViewDir;

	void main() {
		vLocalPos = position;
		vLocalNormal = normal;
		vec4 worldPosition = modelMatrix * vec4(position, 1.0);
		vWorldNormal = normalize(mat3(modelMatrix) * normal);
		vViewDir = normalize(cameraPosition - worldPosition.xyz);
		gl_Position = projectionMatrix * viewMatrix * worldPosition;
	}
`;

export const VIDEO_WALL_FRAGMENT_SHADER = /* glsl */ `
	uniform float uTime;
	uniform float uBass;
	uniform float uMid;
	uniform float uHigh;
	uniform float uBeat;
	uniform sampler2D uLogo;
	uniform vec2 uWallSize;
	uniform float uLogoScale;

	varying vec3 vLocalPos;
	varying vec3 vLocalNormal;
	varying vec3 vWorldNormal;
	varying vec3 vViewDir;

	float hash11(float p) {
		p = fract(p * 0.1031);
		p *= p + 33.33;
		p *= p + p;
		return fract(p);
	}

	// Paleta cíclica: cian -> violeta -> magenta -> lima.
	vec3 neon(float t) {
		return 0.5 + 0.5 * cos(6.28318 * (vec3(t) + vec3(0.0, 0.33, 0.67)));
	}

	float logoAlpha(vec2 p) {
		return texture2D(uLogo, p / uLogoScale + 0.5).a;
	}

	void main() {
		vec2 uv = vLocalPos.xy / uWallSize + 0.5;
		// La cara frontal se detecta en espacio local para que el shader
		// funcione igual en el muro del club y en pantallas giradas (torres).
		float front = smoothstep(0.3, 0.7, vLocalNormal.z);

		// Fondo profundo con degradado y una niebla de color que respira.
		vec3 background = mix(
			vec3(0.008, 0.035, 0.09),
			vec3(0.02, 0.008, 0.075),
			uv.y
		);
		background += neon(0.55 + uv.x * 0.22 + uTime * 0.03) * 0.04;
		background += neon(0.1 + uv.y * 0.3 - uTime * 0.02) * 0.025 * uMid;

		vec3 screen = background;

		// Rejilla neón que se desplaza lentamente.
		vec2 gridUV = abs(fract(uv * vec2(24.0, 9.0) + vec2(uTime * 0.04, 0.0)) - 0.5);
		float grid = smoothstep(0.47, 0.5, max(gridUV.x, gridUV.y));
		screen += neon(0.15 + uv.y * 0.28 + uTime * 0.05) * grid * (0.1 + uMid * 0.28);

		// Ecualizador: 42 barras ancladas al borde inferior.
		float barCount = 42.0;
		float barX = uv.x * barCount;
		float barId = floor(barX);
		float barLocal = fract(barX);
		float seed = hash11(barId * 12.9898);
		float wobble = 0.5 + 0.5 * sin(uTime * (2.0 + seed * 5.0) + barId * 0.7);
		float height = 0.05 + (0.08 + 0.3 * wobble) * (0.35 + 0.65 * uBass);
		height += uHigh * 0.16 * hash11(barId * 3.17 + floor(uTime * 8.0));
		float barMask = step(0.16, barLocal) * step(barLocal, 0.84);
		float bar = barMask * (1.0 - smoothstep(height - 0.012, height + 0.012, uv.y));
		bar *= step(uv.y, 0.58);
		vec3 barColor = neon(barId / barCount * 0.62 + uTime * 0.12);
		screen += barColor * bar * (0.55 + uBeat * 0.95);
		screen += barColor * barMask * exp(-abs(uv.y - height) * 30.0) * 0.45;

		// Línea de barrido vertical.
		float scanY = fract(uTime * 0.09);
		float scan = smoothstep(0.035, 0.0, abs(uv.y - scanY));
		screen += neon(0.3 + uTime * 0.08) * scan * 0.16;

		// Anillo de guiones girando alrededor del logo.
		vec2 p = (uv - vec2(0.5, 0.54)) * uWallSize;
		float radius = length(p);
		float angle = atan(p.y, p.x);
		float ring = smoothstep(0.035, 0.0, abs(radius - 1.95));
		float dashes = step(0.35, fract(angle / 6.28318 * 36.0 - uTime * 0.32));
		screen += neon(0.62 + uTime * 0.08) * ring * dashes * (0.28 + uBass * 0.9);

		// Logo central con halo. Se muestrea varias veces para el resplandor.
		float logo = logoAlpha(p);
		float glow = 0.0;
		for (int i = 0; i < 8; i++) {
			float a = float(i) * 0.785398;
			glow += logoAlpha(p + vec2(cos(a), sin(a)) * 0.11);
		}
		glow /= 8.0;

		vec3 logoColor = mix(vec3(1.0, 0.98, 1.0), neon(0.08 + uTime * 0.05), 0.22);
		screen = mix(screen, logoColor * (1.15 + uBeat * 0.6), logo);
		screen += neon(0.52 + uTime * 0.12) * glow * (0.32 + uBass * 0.8);

		// Destello global del kick.
		screen += neon(uTime * 0.25 + 0.5) * uBeat * 0.07;

		// Fresnel en los bordes y viñeta tipo CRT.
		float fresnel = pow(1.0 - abs(dot(normalize(vWorldNormal), normalize(vViewDir))), 3.0);
		screen += neon(0.4 + uTime * 0.1) * fresnel * 0.18;

		float vignette = smoothstep(1.3, 0.25, length((uv - 0.5) * vec2(1.0, 1.35)));
		screen *= 0.7 + 0.3 * vignette;
		screen *= 0.96 + 0.04 * sin(uv.y * 380.0 + uTime * 6.0);

		// Caras laterales y trasera: carcasa oscura con un brillo tenue.
		vec3 shell = vec3(0.008, 0.01, 0.018) + neon(0.5 + uTime * 0.02) * 0.014;
		vec3 color = mix(shell, screen, front);

		gl_FragColor = vec4(color, 1.0);
	}
`;
