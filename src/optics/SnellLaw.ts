import { Vec3, add, dot, normalize, scale } from '../math/vector';

/**
 * Refraction of a ray at an interface, in vector form of Snell's law.
 *
 * Let I be the unit incident direction, N the unit surface normal facing the incident side,
 * η = n₁ / n₂, and cos θᵢ = −N·I. The transmitted unit direction is
 *
 *     T = η I + (η cos θᵢ − cos θₜ) N,    with   cos θₜ = √(1 − η² (1 − cos² θᵢ)).
 *
 * This is equivalent to n₁ sin θᵢ = n₂ sin θₜ, and it needs no trigonometric calls.
 *
 * When 1 − η² (1 − cos² θᵢ) < 0 there is total internal reflection (TIR), so no transmitted ray exists.
 * The function then returns null instead of NaN.
 *
 * @param incident  incident direction (need not be normalized)
 * @param normal   surface normal (need not be normalized; its sign is ignored)
 * @param n1       refractive index of the medium the light leaves
 * @param n2       refractive index of the medium the light enters
 * @returns unit transmitted direction, or null on total internal reflection
 */
export function refractDirection(incident: Vec3, normal: Vec3, n1: number, n2: number): Vec3 | null {
  if (!(n1 > 0) || !(n2 > 0)) {
    throw new RangeError('Refractive indices must be positive');
  }

  const I = normalize(incident);
  let N = normalize(normal);
  let cosI = -dot(N, I);

  // Make N face the incident side so that cos θᵢ ≥ 0.
  if (cosI < 0) {
    N = scale(N, -1);
    cosI = -cosI;
  }

  const eta = n1 / n2;
  const k = 1 - eta * eta * (1 - cosI * cosI);
  if (k < 0) {
    return null; // total internal reflection
  }

  const cosT = Math.sqrt(k);
  return normalize(add(scale(I, eta), scale(N, eta * cosI - cosT)));
}
