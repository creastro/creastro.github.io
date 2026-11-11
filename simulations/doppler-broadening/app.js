/*
 * Controls, state and plots of the "Doppler Effect & Rotational Line Broadening" simulation.
 * Physics: physics.js. Drawing helpers: charts.js, scene.js.
 *
 * A (Doppler)    : λobs from the radial velocity vr (positive = receding = redshift).
 * B (Rotation)   : veq (or R and P) and inclination i give v sin i; the profile is the disk integral of the kernel G.
 * C (Combined)   : the same broadened line, centred on λobs. Its width scales with λobs, not with vr itself.
 */
(() => {
  'use strict';
  const Ph = window.DopplerPhysics, Ch = window.DopplerCharts, Sc = window.DopplerScene;
  const { COLOR } = Ch;
  const $ = (id) => document.getElementById(id);
  const C_KMS = Ph.SPEED_OF_LIGHT_MS / 1000;
  const R_SUN_M = 6.957e8;
  const DAY_S = 86400;

  const LINES = [
    ['Hα (H I)', 656.281], ['Hβ (H I)', 486.135], ['Na I D₂', 588.995], ['Ca II K', 393.366],
    ['Mg I b₂', 517.270], ['[O III]', 500.686], ['Fe I', 438.355], ['Li I', 670.776]
  ];
  $('line').innerHTML = LINES.map((l, i) => '<option value="' + l[1] + '"' + (i === 0 ? ' selected' : '') + '>' + l[0] + ' · ' + l[1] + ' nm</option>').join('') +
    '<option value="custom">Custom wavelength…</option>';

  /* ---------- formatting ---------- */
  const sgn = (x) => (x > 0 ? '+' : x < 0 ? '−' : '');
  function sig(x, n) {                       // n significant digits, never exponent for the sizes used here
    if (x === 0) return '0';
    const d = Math.max(0, n - 1 - Math.floor(Math.log10(Math.abs(x))));
    return Math.abs(x).toFixed(Math.min(d, 9));
  }
  const signed = (x, n) => sgn(x) + sig(x, n);
  const nm = (x) => x.toFixed(4) + ' nm';
  const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const trim = (x, n) => { const t = sig(x, n); return t.includes('.') ? t.replace(/\.?0+$/, '') : t; };
  function zText(z) {                       // small shifts in scientific notation, e.g. +4.002 × 10⁻⁴
    if (z === 0) return '0';
    if (Math.abs(z) >= 1e-3) return signed(z, 4);
    const [m, e] = Math.abs(z).toExponential(3).split('e');
    return sgn(z) + m + ' × 10⁻' + String(-e).replace(/\d/g, (d) => SUP[d]);
  }

  /* ---------- state ---------- */
  const S = {};
  let phase = 0;
  let playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let hoverX = null;
  let dirty = true, raf = 0, last = 0, onScreen = true, dialogOpen = false, tWave = 0;

  function applyScale() {
    const rel = $('scale').value === 'rel', sp = $('speed');
    const cur = +sp.value;
    sp.max = rel ? 270000 : 600;
    sp.step = rel ? 500 : 1;
    sp.value = Math.min(cur, +sp.max);
  }

  function readParams() {
    const dir = $('dir').value;
    const sel = $('line').value;
    $('lambda0').disabled = sel !== 'custom';
    if (sel !== 'custom') $('lambda0').value = sel;
    S.lambda0 = Math.min(2000, Math.max(100, +$('lambda0').value || 656.281));
    $('speed').disabled = dir === 'still';
    S.speedKms = dir === 'still' ? 0 : +$('speed').value;
    S.vrKms = dir === 'rec' ? S.speedKms : dir === 'app' ? -S.speedKms : 0;
    S.model = $('model').value;
    S.depth = +$('depth').value;
    S.sigmaKms = +$('sigma').value;
    S.eps = +$('ld').value;
    S.incDeg = +$('inc').value;
    S.radiusRsun = +$('radius').value;
    S.mode = $('mode').value;
    const R = S.radiusRsun * R_SUN_M;
    if (S.mode === 'rp') {
      S.periodD = +$('period').value;
      S.veqKms = Ph.calculateEquatorialVelocity(R, S.periodD * DAY_S) / 1000;
    } else {
      S.veqKms = +$('veq').value;
      S.periodD = S.veqKms > 0 ? (2 * Math.PI * R) / (S.veqKms * 1000) / DAY_S : Infinity;
    }
    $('veq').disabled = S.mode === 'rp';
    $('period').disabled = S.mode !== 'rp';
    S.vsiniKms = Ph.calculateProjectedRotationalVelocity(S.veqKms * 1000, S.incDeg) / 1000;

    // Doppler: both models are computed; the selected one drives the plots
    const vr = S.vrKms * 1000;
    S.nr = Ph.calculateDopplerShift(S.lambda0, vr);
    S.rel = Ph.calculateRelativisticDopplerShift(S.lambda0, vr);
    S.dop = S.model === 'rel' ? S.rel : S.nr;
    S.lamObs = S.dop.observedWavelengthNm;
    // each element is shifted by its own v_los on top of the bulk shift, so the widths scale with λobs (the same factor as the centre)
    S.hwBodyNm = Ph.calculateMaxRotationalShift(S.lambda0, S.vsiniKms * 1000);
    S.hwObsNm = Ph.calculateMaxRotationalShift(S.lamObs, S.vsiniKms * 1000);
    S.sigmaRestNm = S.lambda0 * S.sigmaKms / C_KMS;
    S.sigmaObsNm = S.lamObs * S.sigmaKms / C_KMS;
  }

  const profile = (grid, center, hw, sigma, withRot) => Ph.calculateBroadenedSpectralProfile({
    gridNm: grid, centerNm: center, depth: S.depth, sigmaNm: sigma, halfWidthNm: withRot ? hw : 0, epsilon: S.eps
  });
  const makeGrid = (lo, hi, n) => Float64Array.from({ length: n }, (_, i) => lo + (hi - lo) * i / (n - 1));

  /* ---------- window choices ---------- */
  function windowA() {
    const dl = Math.abs(S.dop.deltaLambdaNm);
    const half = Math.max(2.2 * dl, S.lambda0 * 150 / C_KMS, 6 * S.sigmaObsNm);
    const c = (S.lambda0 + S.lamObs) / 2;
    return [c - half - dl / 2, c + half + dl / 2];
  }
  function windowB() {
    const half = S.hwBodyNm + 5 * S.sigmaRestNm + S.lambda0 * 8 / C_KMS;
    return [S.lambda0 - half, S.lambda0 + half];
  }
  // The rest line is shown too unless the shift is so large that the broadening would not be visible.
  function windowC() {
    const pad = S.hwObsNm * 1.25 + 5 * S.sigmaObsNm + S.lamObs * 8 / C_KMS;
    const dl = Math.abs(S.lamObs - S.lambda0);
    if (dl / 2 > 14 * pad) return { lo: S.lamObs - pad, hi: S.lamObs + pad, restOff: true };
    const lo = Math.min(S.lambda0, S.lamObs) - pad, hi = Math.max(S.lambda0, S.lamObs) + pad;
    return { lo, hi, restOff: false };
  }

  /* ---------- section A ---------- */
  function magnification() {
    const a = Math.abs(S.dop.z);
    return $('magnify').checked && a > 0 ? Math.min(1000, Math.max(1, 0.2 / a)) : 1;
  }

  function drawA(t) {
    const z = S.dop.z, M = magnification();
    const rgb = Ch.wavelengthToRgb(S.lamObs);
    Sc.drawWaves($('waves'), {
      vrKms: S.vrKms, vrText: trim(Math.abs(S.vrKms), 6),
      zVis: z * M, magnified: M, restText: nm(S.lambda0), obsText: nm(S.lamObs),
      obsColor: rgb ? 'rgb(' + rgb.join(',') + ')' : COLOR.ink
    }, t);

    const [lo, hi] = windowA();
    const { ctx, w, h } = Ch.fit($('spec-a'));
    if (!w) return;
    ctx.clearRect(0, 0, w, h);
    const grid = makeGrid(lo, hi, 600);
    const rest = profile(grid, S.lambda0, 0, S.sigmaRestNm, false);
    const obs = profile(grid, S.lamObs, 0, S.sigmaObsNm, false);
    const f = Ch.frame(ctx, w, h, { xlo: lo, xhi: hi, ylo: 1 - S.depth - 0.1, yhi: 1.06, xLabel: 'Wavelength (nm)', yLabel: 'Normalised flux', margin: { l: 58, r: 14, t: 12, b: 48 } });
    Ch.spectrumBand(ctx, f, h, lo, hi);
    Ch.trace(ctx, f, grid, rest, { color: COLOR.ref, width: 1.8, dash: [6, 5] });
    Ch.trace(ctx, f, grid, obs, { color: COLOR.shifted, width: 2.6 });
    Ch.vline(ctx, f, h, f.X(S.lambda0), COLOR.ref, [2, 4], 'λ₀', S.lamObs >= S.lambda0 ? 'right' : 'left');
    Ch.vline(ctx, f, h, f.X(S.lamObs), COLOR.shifted, [2, 4], S.dop.deltaLambdaNm === 0 ? '' : 'λobs', S.lamObs >= S.lambda0 ? 'left' : 'right');
    if (S.dop.deltaLambdaNm !== 0) {                             // Δλ bracket
      const y = f.Y(1 - S.depth - 0.04), x0 = f.X(S.lambda0), x1 = f.X(S.lamObs), c = S.dop.deltaLambdaNm > 0 ? COLOR.red : COLOR.blue;
      ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      const d = Math.sign(x1 - x0);
      ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x1 - d * 8, y - 4); ctx.lineTo(x1 - d * 8, y + 4); ctx.closePath(); ctx.fill();
      ctx.font = Ch.FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText('Δλ = ' + signed(S.dop.deltaLambdaNm, 4) + ' nm', (x0 + x1) / 2, y - 4);
    }
    // badge
    const word = S.dop.deltaLambdaNm > 0 ? 'Redshift' : S.dop.deltaLambdaNm < 0 ? 'Blueshift' : 'No shift';
    ctx.font = 'bold 13px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = S.dop.deltaLambdaNm > 0 ? COLOR.red : S.dop.deltaLambdaNm < 0 ? COLOR.blue : COLOR.text;
    ctx.fillText(word, f.m.l + 8, f.m.t + 26);
  }

  /* ---------- section B ---------- */
  function drawB(alpha) {
    const geo = Sc.drawDisk($('disk'), { vsiniKms: S.vsiniKms, eps: S.eps, incDeg: S.incDeg }, alpha, hoverX);
    S.diskGeo = geo;
    const [lo, hi] = windowB();
    const { ctx, w, h } = Ch.fit($('spec-b'));
    if (!w) return;
    ctx.clearRect(0, 0, w, h);
    const grid = makeGrid(lo, hi, 700);
    S.gridB = grid;
    S.unbB = profile(grid, S.lambda0, 0, S.sigmaRestNm, false);
    S.rotB = profile(grid, S.lambda0, S.hwBodyNm, S.sigmaRestNm, true);
    const f = Ch.frame(ctx, w, h, { xlo: lo, xhi: hi, ylo: 1 - S.depth - 0.08, yhi: 1.05, xLabel: 'Wavelength (nm)', yLabel: 'Normalised flux' });
    Ch.trace(ctx, f, grid, S.rotB, { color: COLOR.broadened, width: 2.6, fill: 'rgba(255,207,107,.10)' });
    Ch.trace(ctx, f, grid, S.unbB, { color: COLOR.ref, width: 1.8, dash: [6, 5] });
    if (S.hwBodyNm > 0) {
      Ch.vline(ctx, f, h, f.X(S.lambda0 - S.hwBodyNm), 'rgba(255,255,255,.4)', [2, 4], '−Δλmax', 'right');
      Ch.vline(ctx, f, h, f.X(S.lambda0 + S.hwBodyNm), 'rgba(255,255,255,.4)', [2, 4], '+Δλmax', 'left');
    }
    if (hoverX !== null) {                                       // wavelength contributed by the strip under the pointer
      const lam = S.lambda0 + hoverX * S.hwBodyNm;
      Ch.vline(ctx, f, h, f.X(lam), '#ffffff', [4, 3], '', 'center');
    }
    // kernel
    const k = Ch.fit($('kernel'));
    if (!k.w) return;
    k.ctx.clearRect(0, 0, k.w, k.h);
    const xs = makeGrid(-1.15, 1.15, 300);
    const ymax = Math.max(Ph.calculateRotationalBroadeningKernel(0, 0), Ph.calculateRotationalBroadeningKernel(0, S.eps)) * 1.15;
    const kf = Ch.frame(k.ctx, k.w, k.h, { xlo: -1.15, xhi: 1.15, ylo: 0, yhi: ymax, xLabel: 'x = Δλ / Δλmax', yLabel: 'G(x)', margin: { l: 58, r: 14, t: 10, b: 40 } });
    const gE = Float64Array.from(xs, (x) => Ph.calculateRotationalBroadeningKernel(x, S.eps));
    const gZ = Float64Array.from(xs, (x) => Ph.calculateRotationalBroadeningKernel(x, 0));
    kernelTrace(k.ctx, kf, xs, gZ, { color: COLOR.ref, width: 1.6, dash: [6, 5] });
    kernelTrace(k.ctx, kf, xs, gE, { color: COLOR.broadened, width: 2.4 });
  }

  function kernelTrace(ctx, f, xs, ys, style) {
    ctx.save(); ctx.strokeStyle = style.color; ctx.lineWidth = style.width; ctx.setLineDash(style.dash || []);
    ctx.beginPath();
    for (let i = 0; i < xs.length; i++) { const x = f.X(xs[i]), y = f.Y(ys[i]); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke(); ctx.restore();
  }

  /* ---------- section C ---------- */
  function drawC() {
    const win = windowC();
    const { ctx, w, h } = Ch.fit($('spec-c'));
    if (!w) return null;
    ctx.clearRect(0, 0, w, h);
    const grid = makeGrid(win.lo, win.hi, 800);
    const unb = profile(grid, S.lamObs, 0, S.sigmaObsNm, false);
    const rot = profile(grid, S.lamObs, S.hwObsNm, S.sigmaObsNm, true);
    const f = Ch.frame(ctx, w, h, { xlo: win.lo, xhi: win.hi, ylo: 1 - S.depth - 0.08, yhi: 1.05, xLabel: 'Wavelength (nm)', yLabel: 'Normalised flux' });
    if (!win.restOff) {
      Ch.trace(ctx, f, grid, profile(grid, S.lambda0, 0, S.sigmaRestNm, false), { color: COLOR.ref, width: 1.8, dash: [6, 5] });
      Ch.vline(ctx, f, h, f.X(S.lambda0), COLOR.ref, [2, 4], 'λ₀', S.lamObs >= S.lambda0 ? 'right' : 'left');
    } else {
      ctx.fillStyle = COLOR.text; ctx.font = Ch.FONT; ctx.textBaseline = 'top';
      ctx.textAlign = S.lamObs > S.lambda0 ? 'left' : 'right';
      ctx.fillText((S.lamObs > S.lambda0 ? '◀ ' : '') + 'rest line λ₀ = ' + nm(S.lambda0) + ' is off the plot' + (S.lamObs > S.lambda0 ? '' : ' ▶'), S.lamObs > S.lambda0 ? f.m.l + 8 : w - f.m.r - 8, f.m.t + 6);
    }
    Ch.trace(ctx, f, grid, unb, { color: COLOR.shifted, width: 1.9, dash: [3, 3] });
    Ch.trace(ctx, f, grid, rot, { color: COLOR.broadened, width: 2.6, fill: 'rgba(255,207,107,.10)' });
    Ch.vline(ctx, f, h, f.X(S.lamObs), 'rgba(255,255,255,.35)', [2, 4], 'λobs', S.lamObs >= S.lambda0 ? 'left' : 'right');
    return { grid, unb, rot };
  }

  /* ---------- derived quantities ---------- */
  const set = (id, text) => { $(id).textContent = text; };

  function updateReadouts(c) {
    const kind = S.dop.deltaLambdaNm > 0 ? 'redshift' : S.dop.deltaLambdaNm < 0 ? 'blueshift' : 'no shift';
    set('r-lam0', nm(S.lambda0));
    set('r-lamobs', nm(S.lamObs));
    set('r-vr', (S.vrKms > 0 ? '+' : S.vrKms < 0 ? '−' : '') + trim(Math.abs(S.vrKms), 6) + ' km/s (' + kind + ')');
    set('r-dl', signed(S.dop.deltaLambdaNm, 4) + ' nm');
    set('r-z', zText(S.dop.z));
    const diff = S.rel.z - S.nr.z;
    set('r-model', Math.abs(diff) < 1e-12 ? 'identical' : 'rel − non-rel: ' + (diff > 0 ? '+' : '−') + Math.abs(diff * C_KMS).toPrecision(3) + ' km/s equiv.');
    set('r-beta', signed(S.vrKms / C_KMS, 4));

    set('b-veq', sig(S.veqKms, 4) + ' km/s');
    set('b-vsini', sig(S.vsiniKms, 4) + ' km/s');
    set('b-period', isFinite(S.periodD) ? (S.periodD < 1 ? sig(S.periodD * 24, 4) + ' h' : sig(S.periodD, 4) + ' d') : '∞');
    set('b-dlmax', sig(S.hwBodyNm, 4) + ' nm');
    const fw = Ph.measureFwhmNm(S.gridB, S.rotB), fw0 = Ph.measureFwhmNm(S.gridB, S.unbB);
    set('b-fwhm', fw === null ? '—' : sig(fw, 4) + ' nm (' + sig(fw / S.lambda0 * C_KMS, 4) + ' km/s)');
    set('b-fwhm0', fw0 === null ? '—' : sig(fw0, 4) + ' nm');
    $('b-warn').hidden = S.veqKms <= 450;

    const cen = Ph.measureCentroidNm(c.grid, c.rot), fc = Ph.measureFwhmNm(c.grid, c.rot), fc0 = Ph.measureFwhmNm(c.grid, c.unb);
    set('c-center', nm(S.lamObs));
    set('c-centroid', nm(cen));
    set('c-dlmax', sig(S.hwObsNm, 4) + ' nm');
    set('c-fwhm0', fc0 === null ? '—' : sig(fc0, 4) + ' nm');
    set('c-fwhm', fc === null ? '—' : sig(fc, 4) + ' nm');
    $('c-note').hidden = !(Math.abs(S.lamObs - S.lambda0) / 2 > 14 * (S.hwObsNm * 1.25 + 5 * S.sigmaObsNm + S.lamObs * 8 / C_KMS));
  }

  function syncOutputs() {
    document.querySelectorAll('#controls output[for]').forEach((o) => {
      const src = $(o.htmlFor);
      if (!src) return;
      const v = +src.value;
      o.textContent = o.dataset.fmt === 'kms' && $('scale').value === 'rel' && src.id === 'speed' ? sig(v / C_KMS, 3) + ' c' : (o.dataset.dec ? v.toFixed(+o.dataset.dec) : String(v)) + (o.dataset.unit || '');
    });
  }

  /* ---------- loop ---------- */
  function render() {
    if (dirty) { readParams(); syncOutputs(); dirty = false; }
    drawA(tWave);
    drawB(phase * Math.PI * 2);
    const c = drawC();
    if (c) updateReadouts(c);
  }

  function tick(ts) {
    raf = 0;
    if (playing && last) {
      const dt = Math.min(0.1, (ts - last) / 1000);
      phase = (phase + dt / 10) % 1;
      tWave += dt;
    }
    render();
    if (playing && onScreen && !dialogOpen) { last = ts; schedule(); } else last = 0;
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(tick); }
  const touch = () => { dirty = true; schedule(); };

  const playBtn = $('play');
  function syncPlay() { playBtn.textContent = playing ? 'Pause' : 'Play'; playBtn.setAttribute('aria-label', playing ? 'Pause the animation' : 'Play the animation'); }

  $('scale').addEventListener('change', () => { applyScale(); touch(); });
  $('controls').addEventListener('input', touch);
  $('controls').addEventListener('change', touch);
  $('controls').addEventListener('reset', () => setTimeout(() => { applyScale(); phase = 0; touch(); }, 0));
  playBtn.addEventListener('click', () => { playing = !playing; syncPlay(); schedule(); });

  // pointer over the disk selects the strip of equal line-of-sight velocity
  const disk = $('disk');
  function pointer(e) {
    const g = S.diskGeo;
    if (!g) return;
    const r = disk.getBoundingClientRect();
    const x = (e.clientX - r.left - g.cx) / g.Rc, y = (g.cy - (e.clientY - r.top)) / g.Rc;
    hoverX = x * x + y * y < 1 ? x : null;
    const v = hoverX === null ? null : hoverX * S.vsiniKms;
    $('hover-read').textContent = v === null ? 'Point at the disk to read the line-of-sight velocity of a strip.' :
      'Strip at x = ' + signed(hoverX, 2) + ' R: v_los = ' + signed(v, 3) + ' km/s, Δλ = ' + signed(hoverX * S.hwBodyNm, 3) + ' nm';
    schedule();
  }
  disk.addEventListener('pointermove', pointer);
  disk.addEventListener('pointerdown', pointer);
  disk.addEventListener('pointerleave', () => { hoverX = null; $('hover-read').textContent = 'Point at the disk to read the line-of-sight velocity of a strip.'; schedule(); });

  window.addEventListener('sim-dialog', (e) => { dialogOpen = e.detail.open; if (!dialogOpen) schedule(); });
  const ids = ['waves', 'spec-a', 'disk', 'spec-b', 'kernel', 'spec-c'];
  if ('IntersectionObserver' in window) {
    const visible = new Set();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) visible.add(en.target); else visible.delete(en.target); });
      onScreen = visible.size > 0;
      if (onScreen) schedule();
    });
    ids.forEach((id) => io.observe($(id)));
  }
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(schedule);
    ids.forEach((id) => ro.observe($(id)));
  } else window.addEventListener('resize', schedule);

  window.DopplerApp = { state: S, refresh: () => { dirty = true; render(); } };   // used by the automated checks
  applyScale(); syncPlay(); schedule();
})();
