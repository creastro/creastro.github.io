import { Vec3, vec3 } from '../math/vector';
import { Ray } from './Ray';

/**
 * Isotropic point source. Rays are emitted in the XY plane (2D simulation).
 */
export class PointSource {
  readonly position: Vec3;
  readonly wavelengthNm: number;
  /** Total relative power. Each emitted ray carries power / count. */
  readonly power: number;

  constructor(position: Vec3, wavelengthNm = 550, power = 1) {
    this.position = position;
    this.wavelengthNm = wavelengthNm;
    this.power = power;
  }

  /**
   * Emits `count` rays spaced evenly over `spread` radians, starting at `startAngle`.
   * spread = 2π gives a full circle. Angles are measured counter-clockwise from +X in the XY plane.
   */
  emitFan(count: number, startAngle = 0, spread = 2 * Math.PI): Ray[] {
    if (!Number.isInteger(count) || count < 1) {
      throw new RangeError('count must be a positive integer');
    }
    const intensity = this.power / count;
    const rays: Ray[] = [];
    for (let i = 0; i < count; i++) {
      const theta = startAngle + (spread * i) / count;
      const dir = vec3(Math.cos(theta), Math.sin(theta), 0);
      rays.push(new Ray(this.position, dir, this.wavelengthNm, intensity));
    }
    return rays;
  }
}
