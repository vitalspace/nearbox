import { MathUtils, Vector3, type OrthographicCamera, type PerspectiveCamera } from 'three';

export interface ThirdPersonControlsConfig {
	offset?: Vector3;
	sensitivity?: number;
	radius?: number;
	minRadius?: number;
	maxRadius?: number;
	interpolationFactor?: number;
	theta?: number;
	phi?: number;
	maxPhi?: number;
	minPhi?: number;
}

export class ThirdPersonControls {
	public sensitivity: number;
	public radius: number;
	public targetRadius: number;
	public offset: Vector3;
	public interpolationFactor: number;
	public theta: number;
	public phi: number;
	public maxPhi: number;
	public minPhi: number;
	public minRadius: number;
	public maxRadius: number;
	/** Desplazamiento lateral en espacio de cámara (hombro). 0 = centrado. */
	public shoulder = 0;
	/**
	 * First person: copy the target instead of smoothing it. The avatar snaps
	 * to the physics position every frame, so a smoothed camera would trail
	 * behind while walking and the head would end up in front of the view.
	 */
	public positionSnap = false;

	private currentTarget = new Vector3();
	private desiredTarget = new Vector3();
	private initialized = false;

	constructor(
		private camera: PerspectiveCamera | OrthographicCamera,
		config: ThirdPersonControlsConfig = {}
	) {
		const {
			offset = new Vector3(0, 0, 0),
			sensitivity = 0.0045,
			radius = 12,
			minRadius = 6,
			maxRadius = 24,
			interpolationFactor = 0.15,
			theta = 0,
			phi = 0.3,
			maxPhi = 1.2,
			minPhi = -0.35
		} = config;

		this.offset = offset;
		this.sensitivity = sensitivity;
		this.radius = radius;
		this.targetRadius = radius;
		this.minRadius = minRadius;
		this.maxRadius = maxRadius;
		this.interpolationFactor = interpolationFactor;
		this.theta = theta;
		this.phi = phi;
		this.maxPhi = maxPhi;
		this.minPhi = minPhi;
	}

	rotate(deltaX: number, deltaY: number) {
		this.theta = MathUtils.euclideanModulo(this.theta - deltaX * this.sensitivity, Math.PI * 2);
		this.phi = MathUtils.clamp(this.phi + deltaY * this.sensitivity, this.minPhi, this.maxPhi);
	}

	zoom(delta: number) {
		this.targetRadius = MathUtils.clamp(this.targetRadius + delta, this.minRadius, this.maxRadius);
	}

	/**
	 * Changes the camera profile without recreating the controls. Used when
	 * entering or leaving the crypt and when switching between third and first person.
	 */
	setLimits(
		radius: number,
		minRadius: number,
		maxRadius: number,
		minPhi = this.minPhi,
		maxPhi = this.maxPhi
	) {
		this.minRadius = minRadius;
		this.maxRadius = maxRadius;
		this.minPhi = minPhi;
		this.maxPhi = maxPhi;
		this.targetRadius = MathUtils.clamp(radius, minRadius, maxRadius);
		this.radius = MathUtils.clamp(this.radius, minRadius, maxRadius);
		this.phi = MathUtils.clamp(this.phi, this.minPhi, this.maxPhi);
	}

	get targetPosition(): Vector3 {
		return this.currentTarget;
	}

	setTarget(x: number, y: number, z: number) {
		this.desiredTarget.set(x, y, z).add(this.offset);
	}

	update(delta: number) {
		if (!this.initialized) {
			this.currentTarget.copy(this.desiredTarget);
			this.initialized = true;
		}

		const t = 1 - Math.pow(1 - this.interpolationFactor, delta * 60);

		if (this.positionSnap) {
			this.currentTarget.copy(this.desiredTarget);
		} else {
			this.currentTarget.lerp(this.desiredTarget, t);
		}

		this.radius = MathUtils.lerp(this.radius, this.targetRadius, t);

		const cosPhi = Math.cos(this.phi);
		const sinTheta = Math.sin(this.theta);
		const cosTheta = Math.cos(this.theta);

		// El hombro desplaza cámara y punto de mira en el mismo vector lateral:
		// el jugador queda a un lado de la pantalla sin cambiar la dirección.
		const lookX = this.currentTarget.x + cosTheta * this.shoulder;
		const lookZ = this.currentTarget.z - sinTheta * this.shoulder;

		this.camera.position.set(
			lookX + this.radius * sinTheta * cosPhi,
			this.currentTarget.y + this.radius * Math.sin(this.phi),
			lookZ + this.radius * cosTheta * cosPhi
		);
		this.camera.lookAt(lookX, this.currentTarget.y, lookZ);
	}
}
