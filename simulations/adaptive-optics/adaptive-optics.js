/*
 * Adaptive optics loop simulation.
 *
 * Atmosphere : one frozen von Kármán phase screen (FFT method), translated by the wind.
 *              Phase at wavelength λ:  φ = (0.5 µm / λ) · (0.1 m / r0)^(5/6) · φ_ref,
 *              with φ_ref generated for r0 = 0.1 m at 500 nm.
 * Wavefront  : the telescope pupil is sampled on 64 × 64 points.
 * Mirror     : an ideal deformable mirror reproduces the spatial frequencies |k| ≤ N_act / 2 cycles per
 *              pupil diameter. Because this is a linear low-pass filter, the screen is split once into
 *              φ = φ_low + φ_high. The loop only has to track φ_low (pixel by pixel), and φ_high is the
 *              fitting error that no mirror of that size can remove.
 * Sensor     : ideal measurement of the correctable residual, plus photon noise per actuator cell.
 * Controller : integrator, command += gain · measurement, applied `delay` frames later.
 * Image      : PSF = |FFT(pupil · exp(i · residual phase))|², padded to 128 × 128 (λ / 2D per pixel).
 * Strehl     : peak of the PSF divided by the peak of the diffraction-limited PSF.
 */
(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const $ = (id) => document.getElementById(id);

  const NP = 64;            // pupil samples per side
  const NF = 128;           // PSF grid
  const NS = 256;           // phase-screen grid (4 pupil diameters)
  const NPIX = NP * NP;
  const VIEW = 64;          // PSF pixels shown (± 16 λ/D)
  const MAXPOINTS = 300;    // points kept in the time series

  const COLOR = {
    text: '#b3bfd8',
    grid: 'rgba(255,255,255,.08)',
    accent: '#8fe3ff',
    warm: '#ffcf6b',
    grey: 'rgba(179,191,216,.8)',
    red: '#ff7468'
  };

  /* ---------- FFT (radix 2, unnormalised; sign −1 forward, +1 inverse) ---------- */

  function makeFFT(N) {
    const bits = Math.round(Math.log2(N));
    const rev = new Uint16Array(N);
    for (let i = 0; i < N; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
      rev[i] = r;
    }
    const cos = new Float64Array(N / 2), sin = new Float64Array(N / 2);
    for (let i = 0; i < N / 2; i++) { cos[i] = Math.cos(TAU * i / N); sin[i] = Math.sin(TAU * i / N); }
    return { N, rev, cos, sin };
  }

  function fft1(re, im, off, stride, F, sign) {
    const N = F.N, rev = F.rev, cos = F.cos, sin = F.sin;
    for (let i = 0; i < N; i++) {
      const j = rev[i];
      if (j > i) {
        const a = off + i * stride, b = off + j * stride;
        let t = re[a]; re[a] = re[b]; re[b] = t;
        t = im[a]; im[a] = im[b]; im[b] = t;
      }
    }
    for (let len = 2; len <= N; len <<= 1) {
      const half = len >> 1, step = N / len;
      for (let s = 0; s < N; s += len) {
        for (let k = 0; k < half; k++) {
          const wr = cos[k * step], wi = sign * sin[k * step];
          const a = off + (s + k) * stride, b = off + (s + k + half) * stride;
          const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
        }
      }
    }
  }

  function fft2(re, im, F, sign) {
    const N = F.N;
    for (let r = 0; r < N; r++) fft1(re, im, r * N, 1, F, sign);
    for (let c = 0; c < N; c++) fft1(re, im, c, N, F, sign);
  }

  const FFT128 = makeFFT(NF), FFT256 = makeFFT(NS);

  /* ---------- random numbers ---------- */

  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let seed = 20261106;
  let rng = mulberry32(seed);
  function gauss() {
    let u = 0;
    while (u === 0) u = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rng());
  }

  /* ---------- pupil ---------- */

  const mask = new Uint8Array(NPIX);
  let nPup = 0;
  for (let j = 0; j < NP; j++) {
    for (let i = 0; i < NP; i++) {
      const x = i + 0.5 - NP / 2, y = j + 0.5 - NP / 2;
      if (x * x + y * y <= (NP / 2) * (NP / 2)) { mask[j * NP + i] = 1; nPup++; }
    }
  }
  const IDEAL_PEAK = nPup * nPup;

  /* ---------- controls ---------- */

  function field(id, label, min, max, step, value, unit) {
    return '<div class="field"><label for="' + id + '">' + label + '</label>' +
      '<input id="' + id + '" type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '">' +
      '<output for="' + id + '" data-unit="' + unit + '"></output></div>';
  }

  $('g-atm').innerHTML =
    field('r0', 'Fried parameter r₀ (500 nm)', 4, 30, 1, 10, ' cm') +
    field('L0', 'Outer scale L₀', 5, 100, 5, 25, ' m') +
    field('wind', 'Wind speed', 0, 40, 1, 10, ' m/s') +
    field('wdir', 'Wind direction', 0, 180, 5, 20, '°');
  $('g-tel').innerHTML =
    field('D', 'Telescope diameter D', 0.5, 10, 0.5, 1, ' m') +
    field('lam', 'Imaging wavelength λ', 0.5, 2.2, 0.1, 0.8, ' µm');
  $('g-ao').innerHTML =
    field('nact', 'Actuators across the pupil', 4, 24, 1, 12, '') +
    field('fs', 'Loop frequency', 100, 2000, 50, 500, ' Hz') +
    field('gain', 'Loop gain', 0.05, 1, 0.05, 0.5, '') +
    field('delay', 'Loop delay', 1, 4, 1, 2, ' frames') +
    field('mag', 'Guide-star magnitude', 4, 16, 0.5, 8, ' mag');

  function syncOutputs() {
    document.querySelectorAll('#controls output').forEach((o) => {
      const src = $(o.htmlFor);
      if (src) o.textContent = src.value + (o.dataset.unit || '');
    });
  }

  /* ---------- parameters ---------- */

  const P = {};

  function readParams() {
    P.closed = $('closed').checked;
    P.r0 = +$('r0').value / 100;
    P.L0 = +$('L0').value;
    P.wind = +$('wind').value;
    P.windDir = +$('wdir').value * Math.PI / 180;
    P.D = +$('D').value;
    P.lam = +$('lam').value;
    P.nAct = +$('nact').value;
    P.fs = +$('fs').value;
    P.gain = +$('gain').value;
    P.delay = +$('delay').value;
    P.mag = +$('mag').value;
    P.steps = +$('speed').value;
    P.mode = document.querySelector('input[name="expo"]:checked').value;

    P.dt = 1 / P.fs;
    P.amp = Math.pow(0.1 / P.r0, 5 / 6) * (0.5 / P.lam);           // reference screen → phase at λ
    P.pix = P.D / NP;                                                // metres per pupil sample
    P.shift = P.wind * P.dt / P.pix;                                 // pupil samples per loop frame
    P.shiftX = P.shift * Math.cos(P.windDir);
    P.shiftY = P.shift * Math.sin(P.windDir);
    P.pitch = P.D / P.nAct;
    P.r0lam = P.r0 * Math.pow(P.lam / 0.5, 1.2);
    const photons = 1.1e10 * Math.pow(10, -0.4 * P.mag) * 0.3 * P.pitch * P.pitch * P.dt;
    P.photons = photons;
    P.noiseOPD = 111 / Math.sqrt(Math.max(photons, 1e-3));          // nm (sensor at 0.7 µm, 1 rad / √N)
    P.noisePhase = TAU * (P.noiseOPD / 1000) / P.lam;                // rad at λ
    P.fitStrehl = Math.exp(-0.22 * Math.pow(P.pitch / P.r0lam, 5 / 3));
  }

  /* ---------- state ---------- */

  const screen = new Float32Array(NS * NS);       // full phase screen (reference r0 and wavelength)
  const screenLow = new Float32Array(NS * NS);    // part the mirror can reproduce
  let shModes = [];                               // subharmonic modes {fx, fy, a, b}, evaluated analytically (not periodic)
  const shBuf = new Float32Array(NPIX);
  const shCx = new Float64Array(NP), shSx = new Float64Array(NP), shCy = new Float64Array(NP), shSy = new Float64Array(NP);
  const coefRe = new Float32Array(NS * NS), coefIm = new Float32Array(NS * NS);
  const tmpRe = new Float64Array(NS * NS), tmpIm = new Float64Array(NS * NS);
  const atm = new Float32Array(NPIX);
  const atmLow = new Float32Array(NPIX);
  const res = new Float32Array(NPIX);
  const meas = new Float32Array(NPIX);
  const cmd = new Float32Array(NPIX);
  const dmShown = new Float32Array(NPIX);
  const noiseCoarse = new Float32Array(24 * 24);
  let pipe = [], head = 0;
  let ox = 96, oy = 96, simT = 0;
  let uox = 96, uoy = 96;                         // same position without wrapping, for the subharmonics

  const PR = new Float64Array(NF * NF), PI = new Float64Array(NF * NF);
  const psf = new Float32Array(NF * NF);
  const le = new Float32Array(NF * NF);
  const ideal = new Float32Array(NF * NF);
  let nLE = 0;

  /* ---------- turbulence ---------- */

  function generateScreen() {
    rng = mulberry32(seed);
    const N = NS, p = P.D / NP, df = 1 / (N * p);
    const k0 = 0.023 * Math.pow(0.1, -5 / 3);
    const inv = 1 / (P.L0 * P.L0);
    for (let ky = 0; ky < N; ky++) {
      const fy = (ky < N / 2 ? ky : ky - N) * df;
      for (let kx = 0; kx < N; kx++) {
        const fx = (kx < N / 2 ? kx : kx - N) * df;
        const idx = ky * N + kx;
        const a = gauss(), b = gauss();
        if (kx === 0 && ky === 0) { coefRe[idx] = 0; coefIm[idx] = 0; continue; }
        const amp = Math.sqrt(k0 * Math.pow(fx * fx + fy * fy + inv, -11 / 6)) * df;
        coefRe[idx] = a * amp;
        coefIm[idx] = b * amp;
      }
    }
    // Subharmonics (Lane et al. 1992): three levels of 3 × 3 frequencies below the screen's lowest frequency,
    // so that tilt and the other large scales are not limited by the finite screen. They are not periodic with
    // the screen, so they are kept as a list of modes and evaluated where the pupil is (see addSubharmonics).
    shModes = [];
    for (let lev = 1; lev <= 3; lev++) {
      const dfl = df / Math.pow(3, lev);
      for (let iy = -1; iy <= 1; iy++) {
        for (let ix = -1; ix <= 1; ix++) {
          if (!ix && !iy) continue;
          const fx = ix * dfl, fy = iy * dfl;
          const amp = Math.sqrt(k0 * Math.pow(fx * fx + fy * fy + inv, -11 / 6)) * dfl;
          shModes.push({ fx, fy, a: gauss() * amp, b: gauss() * amp });
        }
      }
    }
    for (let i = 0; i < N * N; i++) { tmpRe[i] = coefRe[i]; tmpIm[i] = coefIm[i]; }
    fft2(tmpRe, tmpIm, FFT256, +1);
    for (let i = 0; i < N * N; i++) screen[i] = tmpRe[i];
    updateLowpass();
  }

  // Spatial frequencies the mirror reproduces: |kx|, |ky| ≤ N_act / 2 cycles per pupil diameter.
  // The screen spans NS / NP pupil diameters, so the cutoff in screen index units is (NS / NP) · N_act / 2.
  function updateLowpass() {
    const N = NS, kc = (NS / NP) * P.nAct / 2;
    for (let ky = 0; ky < N; ky++) {
      const ay = Math.abs(ky < N / 2 ? ky : ky - N);
      const wy = Math.min(1, Math.max(0, kc + 0.5 - ay));
      for (let kx = 0; kx < N; kx++) {
        const ax = Math.abs(kx < N / 2 ? kx : kx - N);
        const w = wy * Math.min(1, Math.max(0, kc + 0.5 - ax));
        const idx = ky * N + kx;
        tmpRe[idx] = coefRe[idx] * w;
        tmpIm[idx] = coefIm[idx] * w;
      }
    }
    fft2(tmpRe, tmpIm, FFT256, +1);
    for (let i = 0; i < N * N; i++) screenLow[i] = tmpRe[i];
  }

  function sampleScreen(S, offX, offY, out, scale) {
    const x0 = Math.floor(offX), y0 = Math.floor(offY);
    const fx = offX - x0, fy = offY - y0;
    const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
    for (let j = 0; j < NP; j++) {
      const r0 = ((y0 + j) & (NS - 1)) * NS, r1 = ((y0 + j + 1) & (NS - 1)) * NS;
      for (let i = 0; i < NP; i++) {
        const a = (x0 + i) & (NS - 1), b = (a + 1) & (NS - 1);
        out[j * NP + i] = scale * (w00 * S[r0 + a] + w10 * S[r0 + b] + w01 * S[r1 + a] + w11 * S[r1 + b]);
      }
    }
  }

  // Adds the subharmonic modes (already in rad at the imaging wavelength) over the pupil window whose lower-left
  // corner is at (offX, offY) pupil samples. cos and sin factorise in x and y, so this costs about 24 · 64² operations.
  function subharmonicsAt(out, offX, offY) {
    out.fill(0);
    const pm = P.pix, amp = P.amp;
    for (let m = 0; m < shModes.length; m++) {
      const md = shModes[m];
      for (let q = 0; q < NP; q++) {
        const tx = TAU * md.fx * (offX + q) * pm, ty = TAU * md.fy * (offY + q) * pm;
        shCx[q] = Math.cos(tx); shSx[q] = Math.sin(tx);
        shCy[q] = Math.cos(ty); shSy[q] = Math.sin(ty);
      }
      for (let j = 0; j < NP; j++) {
        const u = amp * (md.a * shCy[j] - md.b * shSy[j]), v = amp * (md.a * shSy[j] + md.b * shCy[j]);
        const row = j * NP;
        for (let i = 0; i < NP; i++) out[row + i] += u * shCx[i] - v * shSx[i];
      }
    }
  }

  function rms(arr) {
    let s = 0, s2 = 0;
    for (let k = 0; k < NPIX; k++) if (mask[k]) { s += arr[k]; s2 += arr[k] * arr[k]; }
    s /= nPup;
    return Math.sqrt(Math.max(0, s2 / nPup - s * s));
  }

  /* ---------- AO loop ---------- */

  function addNoise(arr) {
    const sg = P.noisePhase, n = P.nAct;
    if (sg < 1e-4) return;
    for (let i = 0; i < n * n; i++) noiseCoarse[i] = gauss() * sg;
    for (let j = 0; j < NP; j++) {
      const v = (j + 0.5) / NP * n - 0.5;
      const v0 = Math.max(0, Math.min(n - 1, Math.floor(v))), v1 = Math.min(n - 1, v0 + 1), fv = Math.min(1, Math.max(0, v - v0));
      for (let i = 0; i < NP; i++) {
        const u = (i + 0.5) / NP * n - 0.5;
        const u0 = Math.max(0, Math.min(n - 1, Math.floor(u))), u1 = Math.min(n - 1, u0 + 1), fu = Math.min(1, Math.max(0, u - u0));
        const a = noiseCoarse[v0 * n + u0] * (1 - fu) + noiseCoarse[v0 * n + u1] * fu;
        const b = noiseCoarse[v1 * n + u0] * (1 - fu) + noiseCoarse[v1 * n + u1] * fu;
        arr[j * NP + i] += a * (1 - fv) + b * fv;
      }
    }
  }

  function resetLoop() {
    cmd.fill(0);
    dmShown.fill(0);
    pipe = [];
    for (let d = 0; d < P.delay; d++) pipe.push(new Float32Array(NPIX));
    head = 0;
  }

  function step() {
    ox += P.shiftX; oy += P.shiftY;
    uox += P.shiftX; uoy += P.shiftY;
    if (ox >= NS) ox -= NS; else if (ox < 0) ox += NS;
    if (oy >= NS) oy -= NS; else if (oy < 0) oy += NS;
    simT += P.dt;
    sampleScreen(screen, ox, oy, atm, P.amp);
    subharmonicsAt(shBuf, uox, uoy);
    for (let k = 0; k < NPIX; k++) atm[k] += shBuf[k];

    if (!P.closed) {
      for (let k = 0; k < NPIX; k++) { res[k] = atm[k]; dmShown[k] = 0; }
      return;
    }
    sampleScreen(screenLow, ox, oy, atmLow, P.amp);
    for (let k = 0; k < NPIX; k++) atmLow[k] += shBuf[k];

    // correction applied now was computed `delay` frames ago
    const applied = pipe[head];
    for (let k = 0; k < NPIX; k++) { dmShown[k] = applied[k]; res[k] = atm[k] - applied[k]; }

    // sensor: correctable part of the residual plus photon noise
    for (let k = 0; k < NPIX; k++) meas[k] = atmLow[k] - applied[k];
    addNoise(meas);

    // integrator, with a tiny leak and a clamp to keep an unstable loop finite
    const g = P.gain;
    for (let k = 0; k < NPIX; k++) {
      let c = 0.9995 * cmd[k] + g * meas[k];
      if (c > 60) c = 60; else if (c < -60) c = -60;
      cmd[k] = c;
    }
    applied.set(cmd);
    head = (head + 1) % P.delay;
  }

  /* ---------- image ---------- */

  function computePSF(phase, out) {
    PR.fill(0); PI.fill(0);
    for (let j = 0; j < NP; j++) {
      for (let i = 0; i < NP; i++) {
        const k = j * NP + i;
        if (!mask[k]) continue;
        const ph = phase ? phase[k] : 0;
        PR[j * NF + i] = Math.cos(ph);
        PI[j * NF + i] = Math.sin(ph);
      }
    }
    fft2(PR, PI, FFT128, -1);
    for (let k = 0; k < NF * NF; k++) out[k] = PR[k] * PR[k] + PI[k] * PI[k];
  }

  function peakOf(arr) {
    let m = 0;
    for (let k = 0; k < NF * NF; k++) if (arr[k] > m) m = arr[k];
    return m;
  }

  function resetLE() { le.fill(0); nLE = 0; fitInit = true; }

  /* ---------- profile fit and FWHM ---------- */

  // Radial profile of a PSF about the central pixel, in bins of 0.25 PSF pixel (1 pixel = λ/2D), up to 16 λ/D.
  const NB = 128, BW = 0.25;
  const prR = new Float64Array(NB), prV = new Float64Array(NB);
  const idR = new Float64Array(NB), idV = new Float64Array(NB);
  let prN = 0, idN = 0;
  const binSumR = new Float64Array(NB), binSumV = new Float64Array(NB), binCnt = new Int32Array(NB);

  function fineProfile(arr, outR, outV) {
    binSumR.fill(0); binSumV.fill(0); binCnt.fill(0);
    for (let v = -NF / 2; v < NF / 2; v++) {
      for (let u = -NF / 2; u < NF / 2; u++) {
        const r = Math.sqrt(u * u + v * v);
        if (r >= NB * BW) continue;
        const b = (r / BW) | 0;
        binSumR[b] += r;
        binSumV[b] += arr[((v + NF) % NF) * NF + ((u + NF) % NF)];
        binCnt[b]++;
      }
    }
    let n = 0;
    for (let b = 0; b < NB; b++) {
      if (!binCnt[b]) continue;
      outR[n] = binSumR[b] / binCnt[b];
      outV[n] = binSumV[b] / binCnt[b] / IDEAL_PEAK;
      n++;
    }
    return n;
  }

  // Bessel function J1 (Abramowitz & Stegun 9.4.4 and 9.4.6)
  function j1(x) {
    const ax = Math.abs(x);
    let v;
    if (ax < 3) {
      const t = (x / 3) * (x / 3);
      v = x * (0.5 + t * (-0.56249985 + t * (0.21093573 + t * (-0.03954289 + t * (0.00443319 + t * (-0.00031761 + t * 0.00001109))))));
    } else {
      const u = 3 / ax;
      const f1 = 0.79788456 + u * (0.00000156 + u * (0.01659667 + u * (0.00017105 + u * (-0.00249511 + u * (0.00113653 + u * -0.00020033)))));
      const th = ax - 2.35619449 + u * (0.12499612 + u * (0.00005650 + u * (-0.00637879 + u * (0.00074348 + u * (0.00079824 + u * -0.00029166)))));
      v = Math.cos(th) * f1 / Math.sqrt(ax);
      if (x < 0) v = -v;
    }
    return v;
  }

  // Components, parameterised by logarithms so that amplitudes, widths and β stay positive.
  //   Gaussian  A exp(−r² / 2σ²)                [lnA, lnσ]
  //   Moffat    A (1 + r²/α²)^(−β)              [lnA, lnα, ln(β−1)]
  //   Airy      A [2 J1(x) / x]², x = π r / w   [lnA, ln w]    (w = 2 pixels = λ/D for a perfect telescope)
  const NPAR = { gauss: 2, moffat: 3, airy: 2 };
  const NAMES = { gauss: 'Gaussian', moffat: 'Moffat', airy: 'Airy' };
  const FIT_COLOR = '#7bd88f';

  function compAt(type, p, o, r) {
    const A = Math.exp(p[o]);
    if (type === 'gauss') {
      const s = Math.exp(p[o + 1]);
      return A * Math.exp(-0.5 * r * r / (s * s));
    }
    if (type === 'moffat') {
      const al = Math.exp(p[o + 1]), be = 1 + Math.exp(p[o + 2]);
      return A * Math.pow(1 + r * r / (al * al), -be);
    }
    const x = Math.PI * r / Math.exp(p[o + 1]);
    if (x < 1e-6) return A;
    const t = 2 * j1(x) / x;
    return A * t * t;
  }

  function modelAt(types, p, r) {
    let s = 0, o = 0;
    for (let i = 0; i < types.length; i++) { s += compAt(types[i], p, o, r); o += NPAR[types[i]]; }
    return s;
  }

  function clampParams(types, p) {
    let o = 0;
    types.forEach((t) => {
      p[o] = Math.max(Math.log(1e-6), Math.min(Math.log(5), p[o]));
      p[o + 1] = Math.max(Math.log(0.05), Math.min(Math.log(80), p[o + 1]));
      if (t === 'moffat') p[o + 2] = Math.max(Math.log(0.02), Math.min(Math.log(30), p[o + 2]));
      o += NPAR[t];
    });
  }

  // Residuals are relative: (model − data) / (10 % of the data + 0.002), so the core and the halo both count.
  function cost(types, p, out) {
    let c = 0;
    for (let i = 0; i < prN; i++) {
      const d = prV[i];
      const e = (modelAt(types, p, prR[i]) - d) / (0.1 * d + 0.002);
      out[i] = e;
      c += e * e;
    }
    return c;
  }

  function solveLinear(A, b, n) {
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r * n + c]) > Math.abs(A[piv * n + c])) piv = r;
      if (Math.abs(A[piv * n + c]) < 1e-14) return null;
      if (piv !== c) {
        for (let k = 0; k < n; k++) { const t = A[c * n + k]; A[c * n + k] = A[piv * n + k]; A[piv * n + k] = t; }
        const t = b[c]; b[c] = b[piv]; b[piv] = t;
      }
      for (let r = c + 1; r < n; r++) {
        const f = A[r * n + c] / A[c * n + c];
        for (let k = c; k < n; k++) A[r * n + k] -= f * A[c * n + k];
        b[r] -= f * b[c];
      }
    }
    const x = new Array(n);
    for (let r = n - 1; r >= 0; r--) {
      let s = b[r];
      for (let k = r + 1; k < n; k++) s -= A[r * n + k] * x[k];
      x[r] = s / A[r * n + r];
    }
    return x;
  }

  const JAC = new Float64Array(NB * 8), RES0 = new Float64Array(NB), RES1 = new Float64Array(NB);

  // Levenberg–Marquardt, starting from p (updated in place). Returns the final cost.
  function levenbergMarquardt(types, p, iters) {
    const n = p.length;
    let c = cost(types, p, RES0);
    let lam = 1e-2;
    const A = new Float64Array(n * n), g = new Float64Array(n);
    for (let it = 0; it < iters; it++) {
      for (let j = 0; j < n; j++) {
        const pj = p[j];
        p[j] = pj + 1e-4;
        cost(types, p, RES1);
        p[j] = pj;
        for (let i = 0; i < prN; i++) JAC[i * n + j] = (RES1[i] - RES0[i]) / 1e-4;
      }
      A.fill(0); g.fill(0);
      for (let i = 0; i < prN; i++) {
        for (let a = 0; a < n; a++) {
          const ja = JAC[i * n + a];
          g[a] += ja * RES0[i];
          for (let b = a; b < n; b++) A[a * n + b] += ja * JAC[i * n + b];
        }
      }
      for (let a = 0; a < n; a++) for (let b = 0; b < a; b++) A[a * n + b] = A[b * n + a];
      let improved = false;
      for (let t = 0; t < 8 && !improved; t++) {
        const M = Float64Array.from(A);
        for (let a = 0; a < n; a++) M[a * n + a] += lam * (A[a * n + a] + 1e-9);
        const d = solveLinear(M, Array.from(g, (v) => -v), n);
        if (d) {
          const q = p.map((v, i) => v + Math.max(-1, Math.min(1, d[i])));
          clampParams(types, q);
          const c2 = cost(types, q, RES1);
          if (c2 < c) {
            for (let i = 0; i < n; i++) p[i] = q[i];
            c = c2;
            lam = Math.max(lam / 3, 1e-9);
            improved = true;
            cost(types, p, RES0);
            continue;
          }
        }
        lam *= 4;
      }
      if (!improved) break;
    }
    return c;
  }

  // First radius where a profile falls to half of its value at the centre (linear interpolation).
  function halfRadiusOf(f0, f) {
    const target = 0.5 * f0;
    let prev = f0;
    for (let r = 0.02; r <= 32; r += 0.02) {
      const v = f(r);
      if (v <= target) return r - 0.02 + 0.02 * (prev - target) / Math.max(prev - v, 1e-12);
      prev = v;
    }
    return NaN;
  }

  const fitSt = { key: '', types: [], p: [], cost: Infinity, ok: false, fwhm: NaN, hw: NaN, dataFwhm: NaN, misfit: NaN };
  let fitInit = true;

  // With two functions, either one can be the sharp core and the other the broad halo (swap picks which).
  function initialGuess(types, swap) {
    const A0 = Math.max(1e-3, Math.max(prV[0], prN > 1 ? prV[1] : 0));
    let h = 1;
    for (let i = 1; i < prN; i++) {
      if (prV[i] < 0.5 * A0) {
        h = prR[i - 1] + (prR[i] - prR[i - 1]) * (0.5 * A0 - prV[i - 1]) / (prV[i] - prV[i - 1] || -1e-9);
        break;
      }
    }
    h = Math.max(0.7, h);
    const p = [];
    const core = swap ? 1 : 0;
    types.forEach((t, i) => {
      const amp = types.length === 1 ? A0 : (i === core ? 0.65 * A0 : 0.3 * A0);
      const hw = i === core ? h : 4 * h;
      if (t === 'gauss') p.push(Math.log(amp), Math.log(hw / 1.1774));
      else if (t === 'moffat') { const be = 2.5; p.push(Math.log(amp), Math.log(hw / Math.sqrt(Math.pow(2, 1 / be) - 1)), Math.log(be - 1)); }
      else p.push(Math.log(amp), Math.log(2 * hw / 1.0287));
    });
    clampParams(types, p);
    return p;
  }

  function runFit() {
    const t1 = $('fit1').value, t2 = $('fit2').value;
    const types = t2 === 'none' ? [t1] : [t1, t2];
    const key = types.join('+');
    fitSt.ok = false;
    if (prN < 10 || prV[0] <= 0) return;

    const freshStarts = (iters) => {
      let best = null, bestCost = Infinity;
      for (let s = 0; s < (types.length > 1 ? 2 : 1); s++) {
        const q = initialGuess(types, s === 1);
        const c = levenbergMarquardt(types, q, iters);
        if (c < bestCost) { best = q; bestCost = c; }
      }
      return [best, bestCost];
    };
    if (fitInit || key !== fitSt.key || !fitSt.p.length) {
      const [q, c] = freshStarts(60);
      fitSt.p = q; fitSt.cost = c;
      fitSt.key = key; fitSt.types = types; fitInit = false;
    } else {
      fitSt.cost = levenbergMarquardt(types, fitSt.p, 8);
      if (frameCount % 40 === 0) {     // now and then, try fresh starts and keep the better fit
        const [q, c] = freshStarts(40);
        if (c < fitSt.cost) { fitSt.p = q; fitSt.cost = c; }
      }
    }
    if (!isFinite(fitSt.cost)) { fitInit = true; return; }

    const f = (r) => modelAt(fitSt.types, fitSt.p, r);
    fitSt.hw = halfRadiusOf(f(0), f);                      // in PSF pixels
    fitSt.fwhm = fitSt.hw;                                 // one pixel is λ/2D, so FWHM in λ/D equals the half radius in pixels
    let m2 = 0;
    for (let i = 0; i < prN; i++) { const e = (f(prR[i]) - prV[i]) / (prV[i] + 0.002); m2 += e * e; }
    fitSt.misfit = Math.sqrt(m2 / prN);
    // model-independent FWHM straight from the data
    fitSt.dataFwhm = NaN;
    for (let i = 1; i < prN; i++) {
      if (prV[i] < 0.5 * prV[0]) { fitSt.dataFwhm = prR[i - 1] + (prR[i] - prR[i - 1]) * (0.5 * prV[0] - prV[i - 1]) / (prV[i] - prV[i - 1]); break; }
    }
    fitSt.ok = isFinite(fitSt.fwhm);
  }

  // Theoretical widths, all as FWHM in units of λ/D at the imaging wavelength.
  function theory() {
    const lamDarc = P.lam * 1e-6 / P.D * 206264.806;
    const diff = 1.0287;                                       // Airy pattern of a circular aperture
    const kolm = 0.98 * P.D / P.r0lam;                         // 0.98 λ / r0
    const vk = kolm * Math.sqrt(Math.max(0.05, 1 - 2.183 * Math.pow(P.r0lam / P.L0, 0.356)));   // von Kármán outer-scale correction (Tokovinin 2002)
    const eps0 = (0.98 * 0.5e-6 / P.r0 * 206264.806) / lamDarc;   // conventional seeing, at 500 nm
    return { lamDarc, diff, kolm, vk, eps0, quad: Math.sqrt(diff * diff + vk * vk) };
  }

  function fmtArc(a) { return a < 0.1 ? a.toFixed(3) : a < 10 ? a.toFixed(2) : a.toFixed(1); }
  function fmtLD(v) { return isFinite(v) ? v.toFixed(2) : '–'; }

  function describeFit() {
    if (!fitSt.ok) return 'no fit';
    let o = 0;
    const parts = fitSt.types.map((t) => {
      const q = fitSt.p, s = [];
      if (t === 'gauss') s.push('σ = ' + (Math.exp(q[o + 1]) / 2).toFixed(2) + ' λ/D');
      else if (t === 'moffat') s.push('α = ' + (Math.exp(q[o + 1]) / 2).toFixed(2) + ' λ/D, β = ' + (1 + Math.exp(q[o + 2])).toFixed(2));
      else s.push('scale = ' + (Math.exp(q[o + 1]) / 2).toFixed(2) + ' λ/D');
      const out = NAMES[t] + ' (' + s[0] + ')';
      o += NPAR[t];
      return out;
    });
    return parts.join(' + ');
  }

  function updateFitTable() {
    const th = theory();
    const f = fitSt.ok ? fitSt.fwhm : NaN;
    const label = fitSt.types.map((t) => NAMES[t]).join(' + ') || '–';
    const rows = [
      ['fit', 'Fit: ' + label, f, false],
      ['', 'Measured on the data (no model)', fitSt.dataFwhm, true],
      ['', 'Diffraction limit, 1.03 λ/D', th.diff, true],
      ['', 'Seeing limit at λ: 0.98 λ/r₀ (von Kármán)', th.vk, true],
      ['', 'Seeing ε₀ at 500 nm: 0.98 λ/r₀', th.eps0, true],
      ['', 'Diffraction and seeing in quadrature', th.quad, true]
    ];
    let html = '<tr><th scope="col">Full width at half maximum</th><th scope="col">in λ/D</th><th scope="col">in arcsec</th><th scope="col">fit ÷ value</th></tr>';
    rows.forEach((r) => {
      html += '<tr class="' + r[0] + '"><td>' + r[1] + '</td><td>' + fmtLD(r[2]) + '</td><td>' + (isFinite(r[2]) ? fmtArc(r[2] * th.lamDarc) : '–') + '</td><td>' +
        (r[3] && isFinite(f) && isFinite(r[2]) ? (f / r[2]).toFixed(2) : '') + '</td></tr>';
    });
    $('fwhm').innerHTML = html.replace('<tr', '<thead><tr').replace('</tr>', '</tr></thead><tbody>') + '</tbody>';

    let note = 'Fit: ' + describeFit() + ' · typical misfit ' + (isFinite(fitSt.misfit) ? Math.round(fitSt.misfit * 100) + ' %' : '–') + '<br>';
    if (th.vk <= 1.05 * th.diff) {
      note += 'D / r₀ is small: this telescope is close to diffraction-limited even without AO.';
    } else if (fitSt.ok) {
      const pos = (f - th.diff) / (th.vk - th.diff);
      note += 'Position between the limits: <b>' + Math.round(100 * Math.max(0, Math.min(2, pos))) + ' %</b> (0 % diffraction-limited, 100 % seeing-limited)';
    }
    $('fit-note').innerHTML = note;
  }

  /* ---------- time series ---------- */

  const series = { t: [], atm: [], res: [], sInst: [], sLE: [] };
  function clearSeries() { for (const k in series) series[k].length = 0; }
  function pushSeries(vals) {
    for (const k in vals) { series[k].push(vals[k]); if (series[k].length > MAXPOINTS) series[k].shift(); }
  }

  /* ---------- drawing helpers ---------- */

  function fit(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  function niceStep(range, n) {
    const raw = range / n;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / p;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
  }

  const FONT = '12px system-ui, sans-serif';
  const BG = [13, 20, 38], WARM = [255, 170, 70], COOL = [90, 185, 255];

  const wfOff = document.createElement('canvas');
  wfOff.width = wfOff.height = NP;
  const wfOffCtx = wfOff.getContext('2d');
  const wfImg = wfOffCtx.createImageData(NP, NP);

  function drawWF(canvas, arr, scale) {
    const { ctx, w, h } = fit(canvas);
    if (!w) return;
    let s = 0;
    for (let k = 0; k < NPIX; k++) if (mask[k]) s += arr[k];
    s /= nPup;
    const d = wfImg.data;
    for (let k = 0; k < NPIX; k++) {
      const o = k * 4;
      if (!mask[k]) { d[o + 3] = 0; continue; }
      const v = Math.max(-1, Math.min(1, (arr[k] - s) / scale));
      const a = Math.pow(Math.abs(v), 0.8);
      const c = v > 0 ? WARM : COOL;
      d[o] = BG[0] + (c[0] - BG[0]) * a;
      d[o + 1] = BG[1] + (c[1] - BG[1]) * a;
      d[o + 2] = BG[2] + (c[2] - BG[2]) * a;
      d[o + 3] = 255;
    }
    wfOffCtx.putImageData(wfImg, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    const pad = 3;
    ctx.drawImage(wfOff, pad, pad, w - 2 * pad, h - 2 * pad);
    ctx.strokeStyle = 'rgba(143,227,255,.4)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, (w - 2 * pad) / 2, 0, TAU); ctx.stroke();
  }

  const psfOff = document.createElement('canvas');
  psfOff.width = psfOff.height = VIEW;
  const psfOffCtx = psfOff.getContext('2d');
  const psfImg = psfOffCtx.createImageData(VIEW, VIEW);
  const HEAT = [[0, 0, 4], [38, 12, 84], [140, 30, 100], [236, 105, 40], [255, 236, 150]];

  function heat(t) {
    const x = Math.max(0, Math.min(1, t)) * (HEAT.length - 1);
    const i = Math.min(HEAT.length - 2, Math.floor(x)), f = x - i;
    const a = HEAT[i], b = HEAT[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }

  function drawPSF(arr) {
    const { ctx, w, h } = fit($('psf'));
    if (!w) return;
    const d = psfImg.data;
    for (let v = 0; v < VIEW; v++) {
      for (let u = 0; u < VIEW; u++) {
        const val = arr[((v - VIEW / 2 + NF) % NF) * NF + ((u - VIEW / 2 + NF) % NF)] / IDEAL_PEAK;
        const t = (Math.log10(Math.max(val, 1e-6)) + 4.2) / 4.2;
        const c = heat(t);
        const o = (v * VIEW + u) * 4;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      }
    }
    psfOffCtx.putImageData(psfImg, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(psfOff, 0, 0, w, h);

    const px = w / VIEW;   // canvas pixels per PSF pixel (2 per λ/D)
    // control region
    if (P.closed) {
      const half = P.nAct * px;   // N_act/2 · λ/D = N_act PSF pixels
      ctx.strokeStyle = 'rgba(143,227,255,.7)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([6, 5]);
      ctx.strokeRect(w / 2 - half, h / 2 - half, 2 * half, 2 * half);
      ctx.setLineDash([]);
    }
    // scale bar: 4 λ/D
    const bar = 8 * px;
    ctx.strokeStyle = '#edf2ff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(14, h - 16); ctx.lineTo(14 + bar, h - 16); ctx.stroke();
    ctx.fillStyle = '#edf2ff';
    ctx.font = FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('4 λ/D', 14, h - 20);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(P.mode === 'long' ? 'long exposure' : 'short exposure', w - 12, 10);
  }

  function axesFrame(ctx, m, w, h) {
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(m.l + 0.5, m.t + 0.5, w - m.l - m.r - 1, h - m.t - m.b - 1);
  }

  function drawLines(canvas, lines, ymin, ymax, yfmt, ylabel, xlabelRange) {
    const { ctx, w, h } = fit(canvas);
    if (!w) return;
    ctx.clearRect(0, 0, w, h);
    const m = { l: 56, r: 12, t: 10, b: 28 };
    const pw = w - m.l - m.r, ph = h - m.t - m.b;
    const Y = (v) => m.t + (1 - (v - ymin) / (ymax - ymin)) * ph;
    ctx.font = FONT;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const ys = niceStep(ymax - ymin, 4);
    for (let v = Math.ceil(ymin / ys) * ys; v <= ymax + 1e-9; v += ys) {
      const y = Math.round(Y(v)) + 0.5;
      ctx.strokeStyle = COLOR.grid;
      ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(w - m.r, y); ctx.stroke();
      ctx.fillStyle = COLOR.text;
      ctx.fillText(yfmt(v), m.l - 8, y);
    }
    axesFrame(ctx, m, w, h);
    ctx.save();
    ctx.translate(12, m.t + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLOR.text;
    ctx.fillText(ylabel, 0, 0);
    ctx.restore();
    if (xlabelRange) {
      ctx.textBaseline = 'top';
      ctx.fillStyle = COLOR.text;
      ctx.textAlign = 'left';
      ctx.fillText(xlabelRange[0], m.l, h - m.b + 7);
      ctx.textAlign = 'right';
      ctx.fillText(xlabelRange[1], w - m.r, h - m.b + 7);
      ctx.textAlign = 'center';
      ctx.fillText('simulated time', m.l + pw / 2, h - m.b + 7);
    }
    lines.forEach((ln) => {
      const n = ln.data.length;
      if (n < 2) return;
      ctx.strokeStyle = ln.color;
      ctx.lineWidth = ln.width || 2;
      ctx.setLineDash(ln.dash || []);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = m.l + (i / (MAXPOINTS - 1)) * pw;
        const y = Math.max(m.t, Math.min(m.t + ph, Y(ln.data[i])));
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    });
    // legend
    let lx = m.l + 10;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((ln) => {
      if (!ln.name) return;
      ctx.strokeStyle = ln.color; ctx.lineWidth = 2; ctx.setLineDash(ln.dash || []);
      ctx.beginPath(); ctx.moveTo(lx, m.t + 10); ctx.lineTo(lx + 18, m.t + 10); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLOR.text;
      ctx.fillText(ln.name, lx + 24, m.t + 4);
      lx += 24 + ctx.measureText(ln.name).width + 16;
    });
  }

  function timeLabels() {
    const n = series.t.length;
    if (n < 2) return null;
    return [(series.t[0] * 1000).toFixed(0) + ' ms', (series.t[n - 1] * 1000).toFixed(0) + ' ms'];
  }

  function drawRMS() {
    let top = 0.5;
    series.atm.forEach((v) => { if (v > top) top = v; });
    top = Math.ceil(top * 1.15 * 10) / 10;
    drawLines($('rms'), [
      { data: series.atm, color: COLOR.grey, dash: [6, 4], name: 'atmosphere' },
      { data: series.res, color: COLOR.accent, name: 'residual' }
    ], 0, top, (v) => v.toFixed(1), 'RMS phase (rad)', null);
  }

  function drawStrehl() {
    drawLines($('strehl'), [
      { data: series.sInst, color: 'rgba(143,227,255,.55)', width: 1.4, name: 'short exposure' },
      { data: series.sLE, color: COLOR.warm, name: 'long exposure' }
    ], 0, 1, (v) => v.toFixed(1), 'Strehl ratio', timeLabels());
  }

  function drawCut() {
    const { ctx, w, h } = fit($('cut'));
    if (!w) return;
    ctx.clearRect(0, 0, w, h);
    const m = { l: 56, r: 12, t: 10, b: 34 };
    const pw = w - m.l - m.r, ph = h - m.t - m.b;
    const rmax = 16;     // λ/D
    const lo = -5, hi = 0.3;
    const X = (r) => m.l + (r / rmax) * pw;
    const Y = (lv) => m.t + (1 - (lv - lo) / (hi - lo)) * ph;
    ctx.font = FONT;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let e = -5; e <= 0; e++) {
      const y = Math.round(Y(e)) + 0.5;
      ctx.strokeStyle = COLOR.grid;
      ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(w - m.r, y); ctx.stroke();
      ctx.fillStyle = COLOR.text;
      ctx.fillText('10' + String(e).replace('-', '⁻').replace(/\d/, (c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c]), m.l - 8, y);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let r = 0; r <= rmax; r += 4) {
      const x = Math.round(X(r)) + 0.5;
      ctx.strokeStyle = COLOR.grid;
      ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, h - m.b); ctx.stroke();
      ctx.fillStyle = COLOR.text;
      ctx.fillText(String(r), x, h - m.b + 6);
    }
    ctx.fillText('angular distance from the star (λ/D)', m.l + pw / 2, h - 16);
    ctx.save();
    ctx.translate(12, m.t + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = COLOR.text;
    ctx.fillText('intensity / peak', 0, 0);
    ctx.restore();
    axesFrame(ctx, m, w, h);

    // control radius
    if (P.closed && P.nAct / 2 <= rmax) {
      const x = Math.round(X(P.nAct / 2)) + 0.5;
      ctx.strokeStyle = 'rgba(143,227,255,.6)';
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, h - m.b); ctx.stroke();
      ctx.setLineDash([]);
    }
    const clampY = (v) => Math.max(m.t, Math.min(h - m.b, Y(Math.log10(Math.max(v, 1e-7)))));
    const trace = (rs, vs, n, color, dash, width) => {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const lam = rs[i] / 2;
        if (lam > rmax) break;
        if (i === 0) ctx.moveTo(X(lam), clampY(vs[i])); else ctx.lineTo(X(lam), clampY(vs[i]));
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };
    const curve = (f, color, width, dash) => {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash);
      ctx.beginPath();
      for (let r = 0; r <= 32.001; r += 0.25) {
        if (r === 0) ctx.moveTo(X(r / 2), clampY(f(r))); else ctx.lineTo(X(r / 2), clampY(f(r)));
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };
    trace(idR, idV, idN, COLOR.grey, [6, 4], 1.5);
    trace(prR, prV, prN, COLOR.warm, [], 2.2);

    const showFit = $('showfit').checked && fitSt.ok;
    if (showFit) {
      if (fitSt.types.length > 1) {
        let o = 0;
        fitSt.types.forEach((t) => {
          const oo = o;
          curve((r) => compAt(t, fitSt.p, oo, r), 'rgba(123,216,143,.55)', 1.2, [2, 3]);
          o += NPAR[t];
        });
      }
      curve((r) => modelAt(fitSt.types, fitSt.p, r), FIT_COLOR, 2, []);
      if (isFinite(fitSt.hw) && fitSt.hw / 2 <= rmax) {
        const x = X(fitSt.hw / 2), y = clampY(modelAt(fitSt.types, fitSt.p, fitSt.hw));
        ctx.fillStyle = FIT_COLOR;
        ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(123,216,143,.5)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, h - m.b); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLOR.warm;
    ctx.fillText('long exposure', w - m.r - 10, m.t + 6);
    ctx.fillStyle = COLOR.grey;
    ctx.fillText('perfect telescope', w - m.r - 10, m.t + 22);
    if (showFit) {
      ctx.fillStyle = FIT_COLOR;
      ctx.fillText('fit: ' + fitSt.types.map((t) => NAMES[t]).join(' + ') + (isFinite(fitSt.hw) ? ' (dot: half maximum)' : ''), w - m.r - 10, m.t + 38);
    }
  }

  /* ---------- deformable mirror view ---------- */

  const dmTop = $('dm-top'), dmSide = $('dm-side');
  let emaStroke = 0;

  function pistonOf(arr) {
    let s = 0;
    for (let k = 0; k < NPIX; k++) if (mask[k]) s += arr[k];
    return s / nPup;
  }

  // Bilinear sample of a pupil-grid field at (xn, yn), in units of D from the centre, y pointing up.
  function fieldAt(arr, xn, yn, piston) {
    const fx = (xn + 0.5) * NP - 0.5, fy = (0.5 - yn) * NP - 0.5;
    const x0 = Math.max(0, Math.min(NP - 2, Math.floor(fx)));
    const y0 = Math.max(0, Math.min(NP - 2, Math.floor(fy)));
    const tx = Math.min(1, Math.max(0, fx - x0)), ty = Math.min(1, Math.max(0, fy - y0));
    const i = y0 * NP + x0;
    return (1 - ty) * ((1 - tx) * arr[i] + tx * arr[i + 1]) + ty * ((1 - tx) * arr[i + NP] + tx * arr[i + NP + 1]) - piston;
  }

  function stepTicks(range, n) { return niceStep(range, n); }

  function drawDM() {
    const toUm = P.lam / (4 * Math.PI);            // surface stroke (µm) from phase (rad): OPD = 2 · stroke
    const pD = pistonOf(dmShown), pA = pistonOf(atm);
    const n = P.nAct, pitch = 1 / n;

    const acts = [];
    let maxAbs = 0;
    for (let ja = 0; ja < n; ja++) {
      for (let ia = 0; ia < n; ia++) {
        const xn = (ia + 0.5) / n - 0.5, yn = 0.5 - (ja + 0.5) / n;
        if (Math.hypot(xn, yn) > 0.5 + 0.5 * pitch) continue;
        const z = fieldAt(dmShown, xn, yn, pD) * toUm;
        acts.push({ ia, ja, xn, yn, z });
        if (Math.abs(z) > maxAbs) maxAbs = Math.abs(z);
      }
    }

    // selected row of actuators
    const ys = +$('dm-row').value;
    const ja = Math.max(0, Math.min(n - 1, Math.round((0.5 - ys) * n - 0.5)));
    const yRow = 0.5 - (ja + 0.5) / n;
    const row = acts.filter((a) => a.ja === ja);

    // shared vertical scale (µm), smoothed so that it does not jitter
    let peak = maxAbs;
    if (row.length) {
      const x0 = row[0].xn - pitch / 2, x1 = row[row.length - 1].xn + pitch / 2;
      for (let q = 0; q <= 40; q++) {
        const v = Math.abs(fieldAt(atm, x0 + (x1 - x0) * q / 40, yRow, pA) * toUm);
        if (v > peak) peak = v;
      }
    }
    emaStroke = emaStroke ? emaStroke * 0.97 + peak * 0.03 : peak;
    const S = Math.max(0.1, 1.25 * Math.max(emaStroke, peak * 0.8));

    /* ----- top view ----- */
    {
      const { ctx, w, h } = fit(dmTop);
      if (w) {
        ctx.clearRect(0, 0, w, h);
        const cx = w / 2, cy = h / 2 - 8, Rp = Math.min(w, h) * 0.40;
        ctx.strokeStyle = 'rgba(143,227,255,.45)';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(cx, cy, Rp, 0, TAU); ctx.stroke();
        const rad = Math.max(2, 0.4 * pitch * 2 * Rp);
        acts.forEach((a) => {
          const x = cx + a.xn * 2 * Rp, y = cy - a.yn * 2 * Rp;
          const s = Math.max(-1, Math.min(1, a.z / S));
          const k = Math.pow(Math.abs(s), 0.8), c = s > 0 ? WARM : COOL;
          ctx.fillStyle = 'rgb(' + Math.round(BG[0] + (c[0] - BG[0]) * k) + ',' + Math.round(BG[1] + (c[1] - BG[1]) * k) + ',' + Math.round(BG[2] + (c[2] - BG[2]) * k) + ')';
          ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
          ctx.strokeStyle = a.ja === ja ? COLOR.accent : 'rgba(255,255,255,.22)';
          ctx.lineWidth = a.ja === ja ? 1.8 : 1;
          ctx.stroke();
        });
        // selected row
        ctx.strokeStyle = 'rgba(143,227,255,.55)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        const ry = cy - yRow * 2 * Rp;
        ctx.beginPath(); ctx.moveTo(cx - Rp * 1.12, ry); ctx.lineTo(cx + Rp * 1.12, ry); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = COLOR.text;
        ctx.font = FONT;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('dashed line: row of the side view', 8, 6);
        // colour bar
        const bw = Math.min(180, w * 0.6), bx = (w - bw) / 2, by = h - 26;
        const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
        g.addColorStop(0, 'rgb(' + COOL.join(',') + ')');
        g.addColorStop(0.5, 'rgb(' + BG.join(',') + ')');
        g.addColorStop(1, 'rgb(' + WARM.join(',') + ')');
        ctx.fillStyle = g;
        ctx.fillRect(bx, by, bw, 8);
        ctx.strokeStyle = 'rgba(255,255,255,.3)';
        ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, 7);
        ctx.fillStyle = COLOR.text;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillText('−' + S.toFixed(2) + ' µm', bx, by + 11);
        ctx.textAlign = 'right';
        ctx.fillText('+' + S.toFixed(2) + ' µm', bx + bw, by + 11);
        if (!P.closed) {
          ctx.fillStyle = COLOR.warm;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('AO loop open: the mirror stays flat', cx, cy + Rp + 14);
        }
      }
    }

    /* ----- side view ----- */
    {
      const { ctx, w, h } = fit(dmSide);
      if (w) {
        ctx.clearRect(0, 0, w, h);
        const m = { l: 56, r: 14, t: 26, b: 64 };
        const pw = w - m.l - m.r, ph = h - m.t - m.b;
        const half = 0.5 + 0.5 * pitch;
        const X = (xn) => m.l + (xn + half) / (2 * half) * pw;
        const Y = (z) => m.t + (1 - (z + S) / (2 * S)) * ph;

        ctx.font = FONT;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        const ys2 = stepTicks(2 * S, 4);
        for (let v = Math.ceil(-S / ys2) * ys2; v <= S + 1e-9; v += ys2) {
          const y = Math.round(Y(v)) + 0.5;
          ctx.strokeStyle = COLOR.grid;
          ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(w - m.r, y); ctx.stroke();
          ctx.fillStyle = COLOR.text;
          ctx.fillText((Math.abs(v) < 1e-9 ? 0 : v).toFixed(ys2 < 0.1 ? 2 : 1), m.l - 8, y);
        }
        ctx.save();
        ctx.translate(12, m.t + ph / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = COLOR.text;
        ctx.fillText(h < 260 ? 'stroke (µm)' : 'mirror surface stroke (µm)', 0, 0);
        ctx.restore();

        // horizontal axis in cm (small telescopes) or m
        const unit = P.D < 2 ? 100 : 1, uname = P.D < 2 ? 'cm' : 'm';
        const xs = stepTicks(2 * half * P.D * unit, 6);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (let v = Math.ceil(-half * P.D * unit / xs) * xs; v <= half * P.D * unit + 1e-9; v += xs) {
          const x = Math.round(X(v / (P.D * unit))) + 0.5;
          ctx.strokeStyle = COLOR.grid;
          ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, m.t + ph); ctx.stroke();
          ctx.fillStyle = COLOR.text;
          ctx.fillText(String(Math.round(v * 100) / 100), x, m.t + ph + 20);
        }
        ctx.fillText('position across the mirror (' + uname + ')', m.l + pw / 2, m.t + ph + 38);

        // pupil chord
        const chord = Math.sqrt(Math.max(0, 0.25 - yRow * yRow));
        if (chord > 0) {
          ctx.fillStyle = 'rgba(143,227,255,.06)';
          ctx.fillRect(X(-chord), m.t, X(chord) - X(-chord), ph);
          ctx.fillStyle = 'rgba(143,227,255,.7)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText('telescope pupil', (X(-chord) + X(chord)) / 2, m.t + 5);
        }

        // back plate
        const plateY = m.t + ph + 3;
        ctx.fillStyle = 'rgba(255,255,255,.16)';
        ctx.fillRect(m.l, plateY, pw, 12);
        ctx.fillStyle = 'rgba(237,242,255,.75)';
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('back plate (actuators are fixed here)', m.l + pw / 2, plateY + 6.5);
        ctx.font = FONT;

        // rest position
        ctx.strokeStyle = 'rgba(255,255,255,.45)';
        ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(m.l, Y(0)); ctx.lineTo(w - m.r, Y(0)); ctx.stroke();
        ctx.setLineDash([]);

        if (!row.length) {
          ctx.fillStyle = COLOR.text;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('No actuator in this row', m.l + pw / 2, m.t + ph / 2);
        } else {
          const x0 = row[0].xn - pitch / 2, x1 = row[row.length - 1].xn + pitch / 2;
          const curve = (arr, piston, color, width, dash) => {
            ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash);
            ctx.beginPath();
            for (let q = 0; q <= 120; q++) {
              const xn = x0 + (x1 - x0) * q / 120;
              const z = Math.max(-S, Math.min(S, fieldAt(arr, xn, yRow, piston) * toUm));
              if (q === 0) ctx.moveTo(X(xn), Y(z)); else ctx.lineTo(X(xn), Y(z));
            }
            ctx.stroke();
            ctx.setLineDash([]);
          };
          // pins from the back plate to the faceplate
          ctx.strokeStyle = 'rgba(237,242,255,.4)';
          ctx.lineWidth = 3;
          row.forEach((a) => {
            const x = X(a.xn);
            ctx.beginPath(); ctx.moveTo(x, plateY); ctx.lineTo(x, Y(Math.max(-S, Math.min(S, a.z)))); ctx.stroke();
          });
          curve(atm, pA, COLOR.grey, 1.6, [6, 4]);
          curve(dmShown, pD, COLOR.accent, 2.6, []);
          ctx.fillStyle = COLOR.accent;
          row.forEach((a) => {
            ctx.beginPath(); ctx.arc(X(a.xn), Y(Math.max(-S, Math.min(S, a.z))), 4, 0, TAU); ctx.fill();
          });
        }
        // legend
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        let lx = m.l + 8;
        [['mirror surface', COLOR.accent, []], [w < 480 ? 'turbulence' : 'shape asked by the turbulence', COLOR.grey, [6, 4]]].forEach((e) => {
          ctx.strokeStyle = e[1]; ctx.lineWidth = 2; ctx.setLineDash(e[2]);
          ctx.beginPath(); ctx.moveTo(lx, 12); ctx.lineTo(lx + 18, 12); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = COLOR.text;
          ctx.fillText(e[0], lx + 24, 12);
          lx += 24 + ctx.measureText(e[0]).width + 16;
        });
      }
    }

    // numbers
    let mn = Infinity, mx = -Infinity;
    for (let k = 0; k < NPIX; k++) {
      if (!mask[k]) continue;
      const v = (dmShown[k] - pD) * toUm;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    $('dm-stats').innerHTML = P.closed
      ? 'Stroke over the pupil: peak-to-valley <b>' + (mx - mn).toFixed(2) + ' µm</b> · RMS <b>' + (rms(dmShown) * toUm).toFixed(2) + ' µm</b><br>' +
        'Actuators: <b>' + acts.length + '</b> in the pupil (' + n + ' × ' + n + ' grid, pitch ' + (P.pitch * 100).toFixed(1) + ' cm)'
      : 'AO loop open: the mirror is flat. Actuators: <b>' + acts.length + '</b> in the pupil (' + n + ' × ' + n + ' grid).';
  }

  /* ---------- derived readouts ---------- */

  function updateReadouts() {
    const rows = [
      ['D / r₀ at the imaging wavelength', (P.D / P.r0lam).toFixed(1)],
      ['Actuator pitch d', (P.pitch * 100).toFixed(1) + ' cm  (d / r₀ = ' + (P.pitch / P.r0lam).toFixed(2) + ')'],
      ['Strehl limit from fitting error alone (ideal mirror)', P.fitStrehl.toFixed(2)],
      ['Photons per subaperture per frame', P.photons < 10 ? P.photons.toFixed(1) : Math.round(P.photons).toLocaleString('en-US')],
      ['Sensor noise per actuator (wavefront)', P.noiseOPD.toFixed(0) + ' nm']
    ];
    $('read').innerHTML = rows.map((r) => '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>').join('');
  }

  /* ---------- main loop ---------- */

  let playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let onScreen = true;
  let dirty = true;
  let raf = 0;
  let last = 0;
  let frameCount = 0;
  let emaAtm = 0, emaRes = 0;

  function warmup(n) {
    for (let k = 0; k < n; k++) step();
  }

  function fullReset(regen) {
    if (regen) generateScreen();
    resetLoop();
    resetLE();
    clearSeries();
    ox = 96; oy = 96; uox = 96; uoy = 96; simT = 0;
    emaAtm = emaRes = 0;
    emaStroke = 0;
    warmup(P.closed ? 120 : 1);
    emaAtm = emaRes = 0;
  }

  function applyParams(first) {
    const old = Object.assign({}, P);
    readParams();
    syncOutputs();
    const geom = first || old.D !== P.D || old.L0 !== P.L0;
    if (geom) { fullReset(true); }
    else if (old.delay !== P.delay || old.closed !== P.closed) { fullReset(false); }
    else {
      if (old.nAct !== P.nAct) updateLowpass();
      if (old.r0 !== P.r0 || old.lam !== P.lam || old.wind !== P.wind || old.windDir !== P.windDir ||
          old.nAct !== P.nAct || old.fs !== P.fs || old.gain !== P.gain || old.mag !== P.mag) resetLE();
    }
    idealProfileUpdate();
    updateReadouts();
  }

  function idealProfileUpdate() {
    // diffraction-limited reference (independent of the parameters, computed once)
    if (idealProfileUpdate.done) return;
    computePSF(null, ideal);
    idN = fineProfile(ideal, idR, idV);
    idealProfileUpdate.done = true;
  }

  function render() {
    computePSF(res, psf);
    const peak = peakOf(psf);
    const sInst = peak / IDEAL_PEAK;
    const a = 1 / Math.min(nLE + 1, 150);
    for (let k = 0; k < NF * NF; k++) le[k] += (psf[k] - le[k]) * a;
    nLE++;
    const sLE = peakOf(le) / IDEAL_PEAK;

    const rAtm = rms(atm), rRes = rms(res);
    emaAtm = emaAtm ? emaAtm * 0.9 + rAtm * 0.1 : rAtm;
    emaRes = emaRes ? emaRes * 0.9 + rRes * 0.1 : rRes;
    pushSeries({ t: simT, atm: rAtm, res: rRes, sInst: sInst, sLE: sLE });

    const scale = Math.max(1, 2.6 * emaAtm);
    $('cb-min').textContent = '−' + scale.toFixed(1) + ' rad';
    $('cb-max').textContent = '+' + scale.toFixed(1) + ' rad';
    drawWF($('wf-atm'), atm, scale);
    drawWF($('wf-dm'), dmShown, scale);
    drawWF($('wf-res'), res, scale);
    drawDM();

    drawPSF(P.mode === 'long' ? le : psf);
    prN = fineProfile(le, prR, prV);
    runFit();
    drawCut();
    drawRMS();
    drawStrehl();

    if (frameCount % 4 === 0) {
      $('stats').innerHTML = 'Strehl <b>' + sInst.toFixed(2) + '</b> (short) · <b>' + sLE.toFixed(2) + '</b> (long exposure)<br>' +
        'RMS phase: atmosphere <b>' + rAtm.toFixed(2) + '</b> rad → residual <b>' + rRes.toFixed(2) + '</b> rad · t = ' + (simT * 1000).toFixed(0) + ' ms';
      updateFitTable();
    }
    $('warn').classList.toggle('on', P.closed && emaRes > 1.5 * emaAtm && emaRes > 0.8);
    frameCount++;
  }

  function tick(ts) {
    raf = 0;
    if (dirty) { applyParams(false); dirty = false; }
    if (playing) {
      const n = last ? P.steps : 0;
      for (let k = 0; k < n; k++) step();
    }
    render();
    if (playing && onScreen) { last = ts; schedule(); } else last = 0;
  }

  function schedule() {
    if (!raf) raf = requestAnimationFrame(tick);
  }

  const playBtn = $('play');
  function syncPlay() {
    playBtn.textContent = playing ? 'Pause' : 'Play';
    playBtn.setAttribute('aria-label', playing ? 'Pause simulation' : 'Play simulation');
  }

  function onInput() { dirty = true; schedule(); }
  $('controls').addEventListener('input', onInput);
  $('controls').addEventListener('reset', () => setTimeout(onInput, 0));
  $('closed').addEventListener('change', onInput);
  $('speed').addEventListener('change', onInput);
  ['fit1', 'fit2'].forEach((id) => $(id).addEventListener('change', () => { fitInit = true; frameCount = 0; schedule(); }));
  $('showfit').addEventListener('change', schedule);
  document.querySelectorAll('input[name="expo"]').forEach((r) => r.addEventListener('change', onInput));
  playBtn.addEventListener('click', () => { playing = !playing; syncPlay(); schedule(); });
  function syncRowOut() {
    const v = +$('dm-row').value;
    $('dm-row-out').textContent = (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2) + ' D';
  }
  $('dm-row').addEventListener('input', () => { syncRowOut(); schedule(); });
  $('controls').addEventListener('reset', () => { $('dm-row').value = 0; syncRowOut(); });
  $('restart').addEventListener('click', () => { readParams(); fullReset(true); schedule(); });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      onScreen = entries[0].isIntersecting;
      if (onScreen) schedule();
    }).observe($('psf'));
  }
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(schedule);
    ['wf-atm', 'wf-dm', 'wf-res', 'psf', 'cut', 'rms', 'strehl', 'dm-top', 'dm-side'].forEach((id) => ro.observe($(id)));
  } else {
    window.addEventListener('resize', schedule);
  }

  // Test hook: only exposed when a page sets window.__AO_DEBUG before this script runs.
  if (window.__AO_DEBUG) {
    window.__AO_DEBUG.api = {
      P, screen, screenLow, atm, res, mask, nPup, step, subharmonicsAt, sampleScreen, applyParams, readParams, generateScreen, fullReset, rms,
      computePSF, peakOf, psf, IDEAL_PEAK, setPlaying: (v) => { playing = v; },
      setSeed: (v) => { seed = v; },
      fitSt, theory, runFit, fineProfile, prR, prV, get prN() { return prN; }, le, NF,
      runFrames: (n) => { for (let k = 0; k < n; k++) { for (let s = 0; s < P.steps; s++) step(); render(); } },
      resetLE
    };
  }

  syncOutputs();
  syncRowOut();
  syncPlay();
  applyParams(true);
  dirty = false;
  schedule();
})();
