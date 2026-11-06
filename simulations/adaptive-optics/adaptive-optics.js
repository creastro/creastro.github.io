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

  const PR = new Float64Array(NF * NF), PI = new Float64Array(NF * NF);
  const psf = new Float32Array(NF * NF);
  const le = new Float32Array(NF * NF);
  const ideal = new Float32Array(NF * NF);
  let nLE = 0;
  let idealProfile = new Float32Array(40);

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
    if (ox >= NS) ox -= NS; else if (ox < 0) ox += NS;
    if (oy >= NS) oy -= NS; else if (oy < 0) oy += NS;
    simT += P.dt;
    sampleScreen(screen, ox, oy, atm, P.amp);

    if (!P.closed) {
      for (let k = 0; k < NPIX; k++) { res[k] = atm[k]; dmShown[k] = 0; }
      return;
    }
    sampleScreen(screenLow, ox, oy, atmLow, P.amp);

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

  function radialProfile(arr, out) {
    const cnt = new Float32Array(out.length);
    out.fill(0);
    for (let v = -NF / 2; v < NF / 2; v++) {
      for (let u = -NF / 2; u < NF / 2; u++) {
        const r = Math.round(Math.sqrt(u * u + v * v));
        if (r >= out.length) continue;
        out[r] += arr[((v + NF) % NF) * NF + ((u + NF) % NF)];
        cnt[r]++;
      }
    }
    for (let r = 0; r < out.length; r++) out[r] = cnt[r] ? out[r] / cnt[r] / IDEAL_PEAK : 0;
  }

  function resetLE() { le.fill(0); nLE = 0; }

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

  function drawCut(profile) {
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
    const trace = (arr, color, dash, width) => {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash);
      ctx.beginPath();
      let pen = false;
      for (let r = 0; r < arr.length; r++) {
        const lam = r / 2;
        if (lam > rmax) break;
        const lv = Math.log10(Math.max(arr[r], 1e-7));
        const y = Math.max(m.t, Math.min(h - m.b, Y(lv)));
        if (!pen) { ctx.moveTo(X(lam), y); pen = true; } else ctx.lineTo(X(lam), y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };
    trace(idealProfile, COLOR.grey, [6, 4], 1.5);
    trace(profile, COLOR.warm, [], 2.2);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLOR.warm;
    ctx.fillText('long exposure', w - m.r - 10, m.t + 6);
    ctx.fillStyle = COLOR.grey;
    ctx.fillText('perfect telescope', w - m.r - 10, m.t + 22);
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
    ox = 96; oy = 96; simT = 0;
    emaAtm = emaRes = 0;
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
    idealProfile = new Float32Array(40);
    radialProfile(ideal, idealProfile);
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
    drawWF($('wf-atm'), atm, scale);
    drawWF($('wf-dm'), dmShown, scale);
    drawWF($('wf-res'), res, scale);

    drawPSF(P.mode === 'long' ? le : psf);
    const prof = new Float32Array(40);
    radialProfile(le, prof);
    drawCut(prof);
    drawRMS();
    drawStrehl();

    if (frameCount % 4 === 0) {
      $('stats').innerHTML = 'Strehl <b>' + sInst.toFixed(2) + '</b> (short) · <b>' + sLE.toFixed(2) + '</b> (long exposure)<br>' +
        'RMS phase: atmosphere <b>' + rAtm.toFixed(2) + '</b> rad → residual <b>' + rRes.toFixed(2) + '</b> rad · t = ' + (simT * 1000).toFixed(0) + ' ms';
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
  document.querySelectorAll('input[name="expo"]').forEach((r) => r.addEventListener('change', onInput));
  playBtn.addEventListener('click', () => { playing = !playing; syncPlay(); schedule(); });
  $('restart').addEventListener('click', () => { readParams(); fullReset(true); schedule(); });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      onScreen = entries[0].isIntersecting;
      if (onScreen) schedule();
    }).observe($('psf'));
  }
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(schedule);
    ['wf-atm', 'wf-dm', 'wf-res', 'psf', 'cut', 'rms', 'strehl'].forEach((id) => ro.observe($(id)));
  } else {
    window.addEventListener('resize', schedule);
  }

  // Test hook: only exposed when a page sets window.__AO_DEBUG before this script runs.
  if (window.__AO_DEBUG) {
    window.__AO_DEBUG.api = {
      P, screen, screenLow, atm, res, mask, nPup, step, applyParams, readParams, generateScreen, fullReset, rms,
      computePSF, peakOf, psf, IDEAL_PEAK, setPlaying: (v) => { playing = v; },
      setSeed: (v) => { seed = v; }
    };
  }

  syncOutputs();
  syncPlay();
  applyParams(true);
  dirty = false;
  schedule();
})();
