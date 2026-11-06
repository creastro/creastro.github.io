// Refraction helpers for GPU ray tracing (GLSL ES 3.00, WebGL2).
// Include this file after `#version 300 es` and a precision qualifier.
// The same logic is in src/optics/SnellLaw.ts. Keep the two in sync.

// Vector form of Snell's law.
//   I   : unit incident direction
//   N   : unit surface normal (its sign does not matter)
//   eta : n1 / n2
// Returns the unit transmitted direction, or vec3(0.0) on total internal reflection.
// Unlike the built-in refract(), this makes TIR explicit so the caller can branch on it.
vec3 refractDirection(vec3 I, vec3 N, float eta) {
    float cosI = -dot(N, I);
    vec3 n = N;
    if (cosI < 0.0) {
        n = -N;
        cosI = -cosI;
    }
    float k = 1.0 - eta * eta * (1.0 - cosI * cosI);
    if (k < 0.0) {
        return vec3(0.0);
    }
    return normalize(eta * I + (eta * cosI - sqrt(k)) * n);
}

// Schlick approximation of the Fresnel reflectance for unpolarized light.
//   cosI : cosine of the angle of incidence, in [0, 1]
//   n1, n2 : refractive indices
float fresnelSchlick(float cosI, float n1, float n2) {
    float r0 = (n1 - n2) / (n1 + n2);
    r0 *= r0;
    return r0 + (1.0 - r0) * pow(1.0 - cosI, 5.0);
}
