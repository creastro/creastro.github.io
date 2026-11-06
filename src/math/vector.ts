/**
 * Plain 3D vector helpers for ray optics.
 *
 * Kept free of Three.js so the geometry runs as pure functions on the CPU
 * and can be checked against analytic results. Convert to THREE.Vector3 only at the rendering boundary.
 */

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

export const add = (a: Vec3, b: Vec3): Vec3 => vec3(a.x + b.x, a.y + b.y, a.z + b.z);

export const sub = (a: Vec3, b: Vec3): Vec3 => vec3(a.x - b.x, a.y - b.y, a.z - b.z);

export const scale = (a: Vec3, s: number): Vec3 => vec3(a.x * s, a.y * s, a.z * s);

export const length = (a: Vec3): number => Math.sqrt(dot(a, a));

/** Returns the unit vector. Throws on the zero vector, so callers never receive NaN. */
export function normalize(a: Vec3): Vec3 {
  const len = length(a);
  if (len === 0) {
    throw new RangeError('Cannot normalize the zero vector');
  }
  return scale(a, 1 / len);
}

/**
 * Mirror reflection of direction d about a surface with unit normal n.
 * Formula: d' = d − 2 (d·n) n.
 */
export function reflect(d: Vec3, n: Vec3): Vec3 {
  return sub(d, scale(n, 2 * dot(d, n)));
}
