'use strict';
// Run with: node --test simulations/doppler-broadening
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('./physics.js');

const C = P.SPEED_OF_LIGHT_MS;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' got ' + a + ', expected ' + b + ' ± ' + tol);
const linspace = (a, b, n) => Float64Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));

test('speed of light is exact', () => assert.equal(C, 299792458));

test('Doppler: zero radial velocity gives no shift', () => {
  for (const f of [P.calculateDopplerShift, P.calculateRelativisticDopplerShift]) {
    const r = f(656.281, 0);
    assert.equal(r.deltaLambdaNm, 0);
    assert.equal(r.z, 0);
    assert.equal(r.observedWavelengthNm, 656.281);
  }
});

test('Doppler: positive velocity redshifts, negative blueshifts', () => {
  for (const f of [P.calculateDopplerShift, P.calculateRelativisticDopplerShift]) {
    assert.ok(f(500, 30e3).deltaLambdaNm > 0 && f(500, 30e3).z > 0);
    assert.ok(f(500, -30e3).deltaLambdaNm < 0 && f(500, -30e3).z < 0);
  }
});

test('Doppler: non-relativistic known value, Halpha at +100 km/s', () => {
  const r = P.calculateDopplerShift(656.281, 100e3);
  near(r.deltaLambdaNm, 656.281 * (100e3 / C), 1e-12);
  near(r.deltaLambdaNm, 0.21891, 1e-4);
  near(r.z, 100e3 / C, 1e-15);
});

test('Doppler: relativistic known values', () => {
  near(P.calculateRelativisticDopplerShift(500, 0.6 * C).observedWavelengthNm, 1000, 1e-9); // sqrt(1.6/0.4) = 2
  near(P.calculateRelativisticDopplerShift(500, -0.6 * C).observedWavelengthNm, 250, 1e-9);
  near(P.calculateRelativisticDopplerShift(500, 0.8 * C).z, 2, 1e-12); // sqrt(1.8/0.2) = 3
});

test('Doppler: models agree at low speed (O(β²)) and diverge at high speed', () => {
  const v = 30e3, b = v / C;
  const d = P.calculateRelativisticDopplerShift(500, v).z - P.calculateDopplerShift(500, v).z;
  near(d, b * b / 2, 1e-9);
  assert.ok(Math.abs(P.calculateRelativisticDopplerShift(500, 0.5 * C).z - 0.5) > 0.1);
});

test('Doppler: relativistic is null (not NaN) at |v| >= c', () => {
  assert.equal(P.calculateRelativisticDopplerShift(500, C), null);
  assert.equal(P.calculateRelativisticDopplerShift(500, -1.5 * C), null);
});

test('Rotation: veq = 2πR/P (Sun, 25.4 d, gives ~2 km/s)', () => {
  const v = P.calculateEquatorialVelocity(6.957e8, 25.4 * 86400);
  near(v / 1e3, 1.99, 0.01);
});

test('Rotation: v sin i is 0 pole-on, maximum edge-on, veq/2 at 30°', () => {
  assert.equal(P.calculateProjectedRotationalVelocity(100e3, 0), 0);
  near(P.calculateProjectedRotationalVelocity(100e3, 90), 100e3, 1e-9);
  near(P.calculateProjectedRotationalVelocity(100e3, 30), 50e3, 1e-9);
  for (let i = 0; i < 90; i += 5) {
    assert.ok(P.calculateProjectedRotationalVelocity(100e3, i) <= P.calculateProjectedRotationalVelocity(100e3, i + 5));
  }
});

test('Rotation: line-of-sight velocity is antisymmetric and spans ±v sin i', () => {
  assert.equal(P.calculateLineOfSightVelocity(-1, 50e3), -50e3);
  assert.equal(P.calculateLineOfSightVelocity(1, 50e3), 50e3);
  assert.equal(P.calculateLineOfSightVelocity(0, 50e3), 0);
});

test('Kernel: unit area, symmetric, zero outside, for several limb-darkening values', () => {
  for (const eps of [0, 0.3, 0.6, 1]) {
    const n = 200000;
    let s = 0;
    for (let k = 0; k < n; k++) s += P.calculateRotationalBroadeningKernel(-1 + ((k + 0.5) * 2) / n, eps) * (2 / n);
    near(s, 1, 1e-4, 'eps=' + eps);
    near(P.calculateRotationalBroadeningKernel(0.4, eps), P.calculateRotationalBroadeningKernel(-0.4, eps), 1e-15);
    assert.equal(P.calculateRotationalBroadeningKernel(1.01, eps), 0);
    assert.equal(P.calculateRotationalBroadeningKernel(-1, eps), 0);
  }
});

test('Kernel: ε = 0 is the semi-ellipse (2/π)√(1−x²)', () => {
  near(P.calculateRotationalBroadeningKernel(0, 0), 2 / Math.PI, 1e-15);
  near(P.calculateRotationalBroadeningKernel(0.5, 0), (2 / Math.PI) * Math.sqrt(0.75), 1e-15);
});

test('Kernel equals the brute-force 2D integral over the limb-darkened disk', () => {
  const eps = 0.6, N = 1200, bins = 20;
  const hist = new Float64Array(bins);
  let total = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = -1 + ((i + 0.5) * 2) / N, y = -1 + ((j + 0.5) * 2) / N, r2 = x * x + y * y;
    if (r2 >= 1) continue;
    const I = P.limbDarkening(Math.sqrt(1 - r2), eps);
    hist[Math.min(bins - 1, Math.floor(((x + 1) / 2) * bins))] += I;
    total += I;
  }
  for (let b = 0; b < bins; b++) {
    // analytic bin average of G by fine sub-sampling
    let g = 0;
    for (let k = 0; k < 500; k++) g += P.calculateRotationalBroadeningKernel(-1 + (2 * (b + (k + 0.5) / 500)) / bins, eps);
    near(hist[b] / total, (g / 500) * (2 / bins), 2e-3, 'bin ' + b);
  }
});

const base = { centerNm: 656.281, depth: 0.5, sigmaNm: 0.02, epsilon: 0.6 };
const grid = linspace(654, 658.5, 4501);
const widthFor = (vsini) => P.measureFwhmNm(grid, P.calculateBroadenedSpectralProfile({ ...base, gridNm: grid, halfWidthNm: P.calculateMaxRotationalShift(base.centerNm, vsini * 1e3) }));

test('Profile: zero rotation reproduces the Gaussian line exactly', () => {
  const f = P.calculateBroadenedSpectralProfile({ ...base, gridNm: grid, halfWidthNm: 0 });
  near(Math.min(...f), 0.5, 1e-12);
  near(P.measureFwhmNm(grid, f), 2.3548 * base.sigmaNm, 2e-3);
});

test('Profile: pole-on (i = 0°) is not broadened; edge-on is', () => {
  const poleOn = P.calculateProjectedRotationalVelocity(150e3, 0);
  const edgeOn = P.calculateProjectedRotationalVelocity(150e3, 90);
  assert.equal(poleOn, 0);
  const fPole = P.calculateBroadenedSpectralProfile({ ...base, gridNm: grid, halfWidthNm: P.calculateMaxRotationalShift(base.centerNm, poleOn) });
  const unb = P.calculateBroadenedSpectralProfile({ ...base, gridNm: grid, halfWidthNm: 0 });
  assert.deepEqual(fPole, unb);
  assert.ok(widthFor(edgeOn / 1e3) > 10 * P.measureFwhmNm(grid, unb));
});

test('Profile: width increases monotonically with v sin i', () => {
  let prev = 0;
  for (const v of [0, 5, 10, 20, 40, 80, 160]) {
    const w = widthFor(v);
    assert.ok(w > prev, 'v sin i = ' + v);
    prev = w;
  }
});

test('Profile: for large v sin i the FWHM approaches the analytic kernel width', () => {
  // Kernel half maximum at x with G(x) = G(0)/2. For ε = 0: sqrt(1−x²)=1/2 → FWHM = √3 Δλmax.
  const eps0 = { ...base, epsilon: 0, sigmaNm: 0.005 };
  const hw = P.calculateMaxRotationalShift(base.centerNm, 200e3);
  const f = P.calculateBroadenedSpectralProfile({ ...eps0, gridNm: grid, halfWidthNm: hw });
  near(P.measureFwhmNm(grid, f) / hw, Math.sqrt(3), 0.02);
});

test('Profile: equivalent width is conserved by rotation', () => {
  const w0 = P.measureEquivalentWidthNm(grid, P.calculateBroadenedSpectralProfile({ ...base, gridNm: grid, halfWidthNm: 0 }));
  for (const v of [10, 60, 200]) {
    const f = P.calculateBroadenedSpectralProfile({ ...base, gridNm: grid, halfWidthNm: P.calculateMaxRotationalShift(base.centerNm, v * 1e3) });
    near(P.measureEquivalentWidthNm(grid, f), w0, 1e-4 * w0 + 1e-6, 'v sin i = ' + v);
    near(w0, base.depth * base.sigmaNm * Math.sqrt(2 * Math.PI), 2e-4, 'analytic Gaussian EW');
  }
});

test('Profile: matches the brute-force sum over disk pixels', () => {
  const vsini = 60e3, hw = P.calculateMaxRotationalShift(base.centerNm, vsini);
  const g = linspace(655.5, 657.1, 81);
  const f = P.calculateBroadenedSpectralProfile({ ...base, gridNm: g, halfWidthNm: hw });
  const N = 700, ref = new Float64Array(g.length);
  let tot = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = -1 + ((i + 0.5) * 2) / N, y = -1 + ((j + 0.5) * 2) / N, r2 = x * x + y * y;
    if (r2 >= 1) continue;
    const I = P.limbDarkening(Math.sqrt(1 - r2), base.epsilon);
    const c = base.centerNm + P.calculateLineOfSightVelocity(x, vsini) / C * base.centerNm;
    tot += I;
    for (let k = 0; k < g.length; k++) ref[k] += I * Math.exp(-((g[k] - c) ** 2) / (2 * base.sigmaNm ** 2));
  }
  for (let k = 0; k < g.length; k++) near(f[k], 1 - base.depth * ref[k] / tot, 2e-3, 'λ index ' + k);
});

test('Combined: radial velocity shifts the centre, v sin i sets the width, independently', () => {
  const vr = 120e3, vsini = 50e3;
  const lam = P.calculateDopplerShift(base.centerNm, vr).observedWavelengthNm;
  const hw = P.calculateMaxRotationalShift(lam, vsini);
  const g = linspace(655, 659.5, 4501);
  const rot = P.calculateBroadenedSpectralProfile({ ...base, gridNm: g, centerNm: lam, halfWidthNm: hw });
  const norot = P.calculateBroadenedSpectralProfile({ ...base, gridNm: g, centerNm: lam, halfWidthNm: 0 });
  near(P.measureCentroidNm(g, rot), lam, 1e-4); // symmetric kernel: centroid stays at the Doppler-shifted wavelength
  near(P.measureCentroidNm(g, norot), lam, 1e-4);
  assert.ok(P.measureFwhmNm(g, rot) > P.measureFwhmNm(g, norot));
  // the width does not depend on vr: same v sin i at another radial velocity gives the same FWHM to O(β)
  const lam2 = P.calculateDopplerShift(base.centerNm, -300e3).observedWavelengthNm;
  const rot2 = P.calculateBroadenedSpectralProfile({ ...base, gridNm: g, centerNm: lam2, halfWidthNm: P.calculateMaxRotationalShift(lam2, vsini) });
  near(P.measureFwhmNm(g, rot2), P.measureFwhmNm(g, rot), 0.01 * P.measureFwhmNm(g, rot));
});
