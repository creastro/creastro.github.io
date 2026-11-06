/**
 * Optical material. It has no mass. Its behaviour is set entirely by its refractive index,
 * transmittance and dispersion.
 */
export interface OpticalMaterial {
  readonly name: string;
  /** Refractive index n_d at the d-line (587.56 nm). Always ≥ 1. */
  readonly ior: number;
  /** Abbe number V_d = (n_d − 1) / (n_F − n_C). A larger value means weaker dispersion. */
  readonly abbeNumber: number;
  /** Internal transmittance in [0, 1] for a unit-thickness sample. */
  readonly transmittance: number;
}

// Standard Fraunhofer lines in µm: F (blue, 486.13 nm), d (yellow, 587.56 nm), C (red, 656.27 nm).
const LAMBDA_F = 0.48613;
const LAMBDA_D = 0.58756;
const LAMBDA_C = 0.65627;

/**
 * Cauchy coefficients for n(λ) = A + B / λ², with λ in µm.
 * B is fixed by matching n_F − n_C = (n_d − 1) / V_d. A is then fixed by n(λ_d) = n_d.
 */
export function cauchyCoefficients(m: OpticalMaterial): { readonly A: number; readonly B: number } {
  const B = (m.ior - 1) / (m.abbeNumber * (1 / (LAMBDA_F * LAMBDA_F) - 1 / (LAMBDA_C * LAMBDA_C)));
  const A = m.ior - B / (LAMBDA_D * LAMBDA_D);
  return { A, B };
}

/** Refractive index at wavelength wavelengthNm, from the Cauchy model. */
export function iorAt(m: OpticalMaterial, wavelengthNm: number): number {
  const { A, B } = cauchyCoefficients(m);
  const lambdaUm = wavelengthNm / 1000;
  return A + B / (lambdaUm * lambdaUm);
}
