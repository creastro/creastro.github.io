import { Vec3 } from '../math/vector';
import { OpticalMaterial, iorAt } from './Material';

/**
 * Thick spherical lens. Its behaviour depends only on material IOR and geometry.
 *
 * Sign convention: R > 0 when the centre of curvature lies after the surface (along the light),
 * and R = Infinity for a flat surface.
 */
export class SphericalLens {
  readonly center: Vec3;
  readonly material: OpticalMaterial;
  /** Radius of the first surface R₁ in metres. */
  readonly r1M: number;
  /** Radius of the second surface R₂ in metres. */
  readonly r2M: number;
  /** Centre thickness d in metres. */
  readonly thicknessM: number;

  constructor(center: Vec3, material: OpticalMaterial, r1M: number, r2M: number, thicknessM: number) {
    this.center = center;
    this.material = material;
    this.r1M = r1M;
    this.r2M = r2M;
    this.thicknessM = thicknessM;
  }

  /**
   * Effective focal length in metres from the thick-lens (lensmaker) equation:
   *
   *     1/f = (n − 1) [ 1/R₁ − 1/R₂ + (n − 1) d / (n R₁ R₂) ]
   *
   * The index n is evaluated at wavelengthNm, so chromatic focal shift is included.
   * Use Infinity for a flat surface: 1/Infinity = 0 in JavaScript.
   */
  focalLengthM(wavelengthNm = 587.56): number {
    const n = iorAt(this.material, wavelengthNm);
    const invR1 = 1 / this.r1M;
    const invR2 = 1 / this.r2M;
    const power =
      (n - 1) * (invR1 - invR2 + ((n - 1) * this.thicknessM) / (n * this.r1M * this.r2M));
    return 1 / power;
  }
}
