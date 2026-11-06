import { Vec3, add, normalize, scale } from '../math/vector';

/**
 * A geometric ray: origin + t · direction, t ≥ 0.
 * The direction is always stored as a unit vector.
 */
export class Ray {
  readonly origin: Vec3;
  readonly direction: Vec3;
  /** Vacuum wavelength in nanometres. */
  readonly wavelengthNm: number;
  /** Relative radiant intensity, in [0, 1]. */
  readonly intensity: number;

  constructor(origin: Vec3, direction: Vec3, wavelengthNm = 550, intensity = 1) {
    this.origin = origin;
    this.direction = normalize(direction);
    this.wavelengthNm = wavelengthNm;
    this.intensity = intensity;
  }

  /** Point on the ray at parameter t. */
  at(t: number): Vec3 {
    return add(this.origin, scale(this.direction, t));
  }
}
