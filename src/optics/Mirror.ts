import { Vec3, dot, normalize, reflect, sub } from '../math/vector';
import { Ray } from './Ray';

/**
 * Planar mirror, defined by a point on its surface and a unit normal.
 * Reflection follows the law of reflection d' = d − 2 (d·n) n.
 */
export class Mirror {
  readonly point: Vec3;
  readonly normal: Vec3;
  /** Fraction of intensity reflected, in [0, 1]. */
  readonly reflectance: number;

  constructor(point: Vec3, normal: Vec3, reflectance = 1) {
    if (!(reflectance >= 0 && reflectance <= 1)) {
      throw new RangeError('reflectance must be in [0, 1]');
    }
    this.point = point;
    this.normal = normalize(normal);
    this.reflectance = reflectance;
  }

  /**
   * Parameter t ≥ 0 where the ray meets the mirror, or null if it misses
   * (parallel ray, or the surface lies behind the origin).
   */
  intersect(ray: Ray, epsilon = 1e-9): number | null {
    const denom = dot(ray.direction, this.normal);
    if (Math.abs(denom) < epsilon) {
      return null;
    }
    const t = dot(sub(this.point, ray.origin), this.normal) / denom;
    return t >= epsilon ? t : null;
  }

  /** Reflected ray leaving from the hit point, with intensity scaled by reflectance. */
  reflect(ray: Ray, t: number): Ray {
    const hit = ray.at(t);
    return new Ray(hit, reflect(ray.direction, this.normal), ray.wavelengthNm, ray.intensity * this.reflectance);
  }
}
