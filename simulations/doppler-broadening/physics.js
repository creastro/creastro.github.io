/*
 * Physics of the "Doppler Effect & Rotational Line Broadening" simulation. Pure functions, no DOM.
 * Loaded as a plain script in the browser (window.DopplerPhysics) and with require() in the tests.
 *
 * Units: velocities in m/s, lengths in m, times in s, angles in degrees at the interface (converted inside),
 * wavelengths in nm (named *Nm). Sign convention: a positive radial velocity means the source recedes (redshift).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DopplerPhysics = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SPEED_OF_LIGHT_MS = 299792458; // exact, m/s (299 792.458 km/s)
  const DEG = Math.PI / 180;

  /* ---------- radial Doppler shift ---------- */

  // Non-relativistic: Δλ/λ0 = vr/c, so λobs = λ0 (1 + vr/c). Valid for |vr| << c.
  function calculateDopplerShift(restWavelengthNm, radialVelocityMs) {
    const lambdaObsNm = restWavelengthNm * (1 + radialVelocityMs / SPEED_OF_LIGHT_MS);
    return shiftResult(restWavelengthNm, lambdaObsNm);
  }

  // Relativistic, purely radial motion: λobs = λ0 sqrt((1+β)/(1−β)), β = vr/c.
  // This includes the time dilation of the source; it equals the first-order result up to O(β²).
  // |β| must be below 1; otherwise the result is null rather than NaN.
  function calculateRelativisticDopplerShift(restWavelengthNm, radialVelocityMs) {
    const beta = radialVelocityMs / SPEED_OF_LIGHT_MS;
    if (!(Math.abs(beta) < 1)) return null;
    return shiftResult(restWavelengthNm, restWavelengthNm * Math.sqrt((1 + beta) / (1 - beta)));
  }

  function shiftResult(restWavelengthNm, lambdaObsNm) {
    return {
      restWavelengthNm,
      observedWavelengthNm: lambdaObsNm,
      deltaLambdaNm: lambdaObsNm - restWavelengthNm,
      z: lambdaObsNm / restWavelengthNm - 1
    };
  }

  /* ---------- rigid rotation ---------- */

  // veq = 2πR/P for a rigid sphere of radius R (m) and rotation period P (s).
  function calculateEquatorialVelocity(radiusM, periodS) {
    return (2 * Math.PI * radiusM) / periodS;
  }

  // Only the component along the line of sight is measured: v sin i = veq sin i.
  // The spin axis is tilted by the inclination i from the line of sight (i = 0°: pole-on, 90°: edge-on).
  function calculateProjectedRotationalVelocity(equatorialVelocityMs, inclinationDeg) {
    return equatorialVelocityMs * Math.sin(inclinationDeg * DEG);
  }

  // Line-of-sight velocity of a surface element at sky position x (in stellar radii, x = −1 approaching limb,
  // +1 receding limb). It depends on x only: every point on a line parallel to the projected spin axis has the same
  // velocity, whatever its latitude, because v_los = ω × r · line of sight = veq sin i · x.
  function calculateLineOfSightVelocity(x, projectedVelocityMs) {
    return projectedVelocityMs * x;
  }

  /* ---------- rotational broadening ---------- */

  // Linear limb darkening: I(μ)/I(1) = 1 − ε (1 − μ), with μ = cosine of the angle to the surface normal.
  function limbDarkening(mu, epsilon) {
    return 1 - epsilon * (1 - mu);
  }

  // Normalised broadening kernel (Gray 2005, eq. 18.14), with x = Δλ/Δλmax and ∫G dx = 1.
  // It is the flux of the strip of the disk at position x: the chord length 2√(1−x²) weighted by the limb darkening.
  // (1−ε)·2s + ε·πs²/2 with s = √(1−x²) is the exact integral of 1−ε+εμ along that strip.
  function calculateRotationalBroadeningKernel(x, epsilon) {
    const x2 = x * x;
    if (x2 >= 1) return 0;
    const s2 = 1 - x2;
    return (2 * (1 - epsilon) * Math.sqrt(s2) + (Math.PI * epsilon / 2) * s2) / (Math.PI * (1 - epsilon / 3));
  }

  // Half-width Δλmax = λ (v sin i)/c of the broadened line, in nm. λ is the wavelength of the line centre.
  function calculateMaxRotationalShift(centerWavelengthNm, projectedVelocityMs) {
    return (centerWavelengthNm * projectedVelocityMs) / SPEED_OF_LIGHT_MS;
  }

  /*
   * Continuum-normalised absorption line seen in the light of the whole disk:
   *     F(λ) = 1 − depth · ∫ G(x) g(λ − λc − x Δλmax) dx,     g(u) = exp(−u²/2σ²)
   * g is a Gaussian of peak 1 for the intrinsic line (thermal, turbulent, instrument), so the equivalent width of the
   * broadened line equals that of the unbroadened line: rotation redistributes the absorption, it does not add any.
   * The integral is a sum over strips of the disk, each strip shifted by its own line-of-sight velocity.
   * halfWidthNm = 0 (pole-on, or no rotation) reduces exactly to the unbroadened line.
   */
  function calculateBroadenedSpectralProfile(opt) {
    const { gridNm, centerNm, depth, sigmaNm, halfWidthNm, epsilon } = opt;
    const out = new Float64Array(gridNm.length);
    const inv2s2 = 1 / (2 * sigmaNm * sigmaNm);
    if (!(halfWidthNm > 0)) {
      for (let i = 0; i < gridNm.length; i++) {
        const u = gridNm[i] - centerNm;
        out[i] = 1 - depth * Math.exp(-u * u * inv2s2);
      }
      return out;
    }
    // Enough strips that neighbouring Gaussians overlap (spacing <= σ/3), so the sum has no ripple.
    const n = Math.min(4001, Math.max(201, Math.ceil((6 * halfWidthNm) / sigmaNm)));
    const offsetNm = new Float64Array(n);
    const w = new Float64Array(n);
    let wsum = 0;
    for (let k = 0; k < n; k++) {
      const x = -1 + ((k + 0.5) * 2) / n;
      offsetNm[k] = centerNm + x * halfWidthNm;
      w[k] = calculateRotationalBroadeningKernel(x, epsilon);
      wsum += w[k];
    }
    for (let k = 0; k < n; k++) w[k] /= wsum; // discrete normalisation: exactly conserves the equivalent width
    for (let i = 0; i < gridNm.length; i++) {
      let a = 0;
      for (let k = 0; k < n; k++) {
        const u = gridNm[i] - offsetNm[k];
        a += w[k] * Math.exp(-u * u * inv2s2);
      }
      out[i] = 1 - depth * a;
    }
    return out;
  }

  /* ---------- measurements on a sampled profile ---------- */

  // Full width at half depth (nm), by linear interpolation of the two crossings. Returns null if the line is not resolved.
  function measureFwhmNm(gridNm, flux) {
    let iMin = 0;
    for (let i = 1; i < flux.length; i++) if (flux[i] < flux[iMin]) iMin = i;
    const half = 1 - (1 - flux[iMin]) / 2;
    let left = null, right = null;
    for (let i = iMin; i > 0; i--) {
      if (flux[i - 1] >= half) { left = lerpCross(gridNm, flux, i - 1, i, half); break; }
    }
    for (let i = iMin; i < flux.length - 1; i++) {
      if (flux[i + 1] >= half) { right = lerpCross(gridNm, flux, i, i + 1, half); break; }
    }
    return left === null || right === null ? null : right - left;
  }

  function lerpCross(g, f, i, j, level) {
    const t = (level - f[i]) / (f[j] - f[i]);
    return g[i] + t * (g[j] - g[i]);
  }

  // Absorption-weighted mean wavelength, ∫λ(1−F)dλ / ∫(1−F)dλ.
  function measureCentroidNm(gridNm, flux) {
    let num = 0, den = 0;
    for (let i = 0; i < flux.length; i++) { const a = 1 - flux[i]; num += a * gridNm[i]; den += a; }
    return num / den;
  }

  // Equivalent width ∫(1−F)dλ (nm), trapezoid rule.
  function measureEquivalentWidthNm(gridNm, flux) {
    let s = 0;
    for (let i = 1; i < flux.length; i++) s += 0.5 * ((1 - flux[i]) + (1 - flux[i - 1])) * (gridNm[i] - gridNm[i - 1]);
    return s;
  }

  return {
    SPEED_OF_LIGHT_MS,
    calculateDopplerShift,
    calculateRelativisticDopplerShift,
    calculateEquatorialVelocity,
    calculateProjectedRotationalVelocity,
    calculateLineOfSightVelocity,
    limbDarkening,
    calculateRotationalBroadeningKernel,
    calculateMaxRotationalShift,
    calculateBroadenedSpectralProfile,
    measureFwhmNm,
    measureCentroidNm,
    measureEquivalentWidthNm
  };
});
