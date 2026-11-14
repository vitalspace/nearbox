/**
 * Shader del oro del podio `Top3_Root`.
 *
 * El GLB trae `TOP3_Gold` como metal puro (`metallicFactor` por defecto = 1,
 * `roughness` = 0.16). En escena nocturna eso significa que el material sólo
 * refleja el cielo oscuro y el podio se lee casi negro: el dorado no aparece.
 *
 * Este shader no depende de luces ni de environment maps. Modela el oro con:
 * - luz principal cálida + relleno frío (equivalentes a las luces del mapa),
 * - reflexión falsa de cielo/horizonte teñida de oro,
 * - highlight especular duro y fresnel en los bordes,
 * - un brillo base para que nunca caiga a negro.
 *
 * `uGlow` permite dar más presencia a las piezas principales y menos a las
 * bandas oscuras. El tiempo anima un brillo muy sutil tipo metal pulido.
 */
export const GOLD_VERTEX_SHADER = /* glsl */ `
	varying vec3 vWorldPosition;
	varying vec3 vWorldNormal;

	void main() {
		vec4 worldPosition = modelMatrix * vec4(position, 1.0);

		vWorldPosition = worldPosition.xyz;
		vWorldNormal = normalize(mat3(modelMatrix) * normal);

		gl_Position = projectionMatrix * viewMatrix * worldPosition;
	}
`;

export const GOLD_FRAGMENT_SHADER = /* glsl */ `
	uniform float uTime;
	uniform vec3 uGold;
	uniform vec3 uGoldDeep;
	uniform float uGlow;
	uniform vec3 uLightDir;
	uniform vec3 uFillDir;
	uniform vec3 uSunDir;

	varying vec3 vWorldPosition;
	varying vec3 vWorldNormal;

	void main() {
		vec3 normal = normalize(vWorldNormal);
		if (!gl_FrontFacing) normal = -normal;

		vec3 viewDir = normalize(cameraPosition - vWorldPosition);
		vec3 halfDir = normalize(uLightDir + viewDir);

		float nDotL = max(dot(normal, uLightDir), 0.0);
		float nDotFill = max(dot(normal, uFillDir), 0.0);
		float nDotV = max(dot(normal, viewDir), 0.0);

		// Highlight apretado: el oro pulido tiene reflejos muy definidos.
		float spec = pow(max(dot(normal, halfDir), 0.0), 110.0);

		// Fresnel: los bordes y las superficies en ángulo se aclaran.
		float fresnel = pow(1.0 - nDotV, 4.0);
		float rim = pow(1.0 - nDotV, 2.5);

		// Reflexión falsa: horizonte cálido abajo, cielo azulado arriba y un
		// destello de luna/sol. Todo teñido de oro para que no se vuelva gris.
		vec3 reflected = reflect(-viewDir, normal);
		float horizon = smoothstep(-0.55, 0.4, reflected.y);
		float skyUp = smoothstep(0.15, 1.0, reflected.y);

		vec3 reflection = mix(uGoldDeep * 0.55, uGold * 1.25, horizon);
		reflection = mix(reflection, uGold * 0.55 + vec3(0.10, 0.13, 0.24), skyUp * 0.5);

		float sun = pow(max(dot(reflected, uSunDir), 0.0), 200.0);
		reflection += vec3(1.0, 0.82, 0.45) * sun * 3.2;

		// Difuso cálido + relleno frío muy leve.
		vec3 gold = mix(uGoldDeep, uGold, 0.25 + 0.75 * nDotL);
		gold += vec3(0.10, 0.14, 0.26) * nDotFill * 0.12;
		gold = mix(gold, reflection, 0.55);

		// Brillo animado muy sutil: se nota al girar la cámara, no distrae.
		float shimmer = 0.5 + 0.5 * sin(dot(vWorldPosition, vec3(3.1, 5.3, 2.7)) - uTime * 2.2);
		gold += uGold * shimmer * 0.035;

		gold += vec3(1.0, 0.93, 0.72) * spec * 1.7;
		gold += mix(uGold, vec3(1.0), 0.4) * rim * 0.45;
		gold += uGold * (uGlow + fresnel * uGlow);

		gl_FragColor = vec4(gold, 1.0);

		#include <tonemapping_fragment>
		#include <colorspace_fragment>
	}
`;
