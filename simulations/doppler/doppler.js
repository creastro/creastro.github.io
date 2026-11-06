/*
 * Doppler shifts of a rotating planet with surface spots.
 *
 * Geometry (sky frame): x to the right, y up, z towards the observer.
 * The spin axis is s = (0, sin i, cos i), so i = 90° is equator-on and i = 0° is pole-on.
 * A body-fixed point p_b = (cos(lat) sin(lon), sin(lat), cos(lat) cos(lon)) is carried to the sky by
 *     r = Rx(β) · Ry(α) · p_b,   β = 90° − i,   α = 2π · phase.
 * The left limb approaches the observer, so the line-of-sight (redshift) velocity of a point is
 *     v = v_eq · sin i · x           (x in units of the planet radius, independent of latitude).
 *
 * Line profile (continuum-normalised):
 *     F(v) = 1 − depth · Σ I(x,y) g(v − v_pix) / Σ I(x,y),   g = exp(−v² / 2σ²)
 * where I is the limb-darkened intensity, modulated by the spots. Spots change the continuum only.
 */
(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;
  const $ = (id) => document.getElementById(id);

  const COLOR = {
    A: '#8fe3ff',
    B: '#ffcf6b',
    text: '#b3bfd8',
    axis: 'rgba(237,242,255,.45)',
    grid: 'rgba(255,255,255,.08)',
    ref: 'rgba(179,191,216,.75)',
    blue: '#6aa9ff',
    red: '#ff7468'
  };

  const NV = 241;   // velocity bins of the line profile
  const NPH = 120;  // phases in the dynamic spectrum
  const NP = 240;   // resolution of the planet image
  const GN = 110;   // sampling grid per axis for the disk integral

  const SPOT_DEFAULTS = {
    A: { type: 'dark', lat: 20, lon: -100, size: 20, contrast: 70 },
    B: { type: 'off', lat: -25, lon: 80, size: 15, contrast: 60 }
  };

  /* ---------- controls ---------- */

  function field(id, label, min, max, step, value, unit) {
    return '<div class="field"><label for="' + id + '">' + label + '</label>' +
      '<input id="' + id + '" type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '">' +
      '<output for="' + id + '" data-unit="' + unit + '"></output></div>';
  }

  function spotFieldset(key, d) {
    const opt = (v, t) => '<option value="' + v + '"' + (d.type === v ? ' selected' : '') + '>' + t + '</option>';
    return '<fieldset><legend><span class="dot" style="background:' + COLOR[key] + '"></span>Spot ' + key + '</legend>' +
      '<div class="field"><label for="' + key + '-type">Type</label>' +
      '<select id="' + key + '-type">' + opt('off', 'Off') + opt('dark', 'Dark spot') + opt('bright', 'Bright spot') + '</select><span></span></div>' +
      field(key + '-lat', 'Latitude', -80, 80, 1, d.lat, '°') +
      field(key + '-lon', 'Longitude at phase 0', -180, 180, 1, d.lon, '°') +
      field(key + '-size', 'Angular radius', 5, 45, 1, d.size, '°') +
      field(key + '-contrast', 'Contrast', 0, 100, 5, d.contrast, ' %') +
      '</fieldset>';
  }

  $('spots').innerHTML = spotFieldset('A', SPOT_DEFAULTS.A) + spotFieldset('B', SPOT_DEFAULTS.B);

  function syncOutputs() {
    document.querySelectorAll('#controls output, #period ~ output').forEach((o) => {
      const src = $(o.htmlFor);
      if (src) o.textContent = src.value + (o.dataset.unit || '');
    });
    $('phase-out').textContent = (+$('phase').value).toFixed(2);
  }

  /* ---------- model parameters ---------- */

  const P = { spots: {} };

  function niceMax(x) { return Math.max(10, Math.ceil(x / 5) * 5); }

  function readParams() {
    P.inc = +$('inc').value;
    P.veq = +$('veq').value;
    P.sigma = +$('sigma').value;
    P.depth = +$('depth').value;
    P.u = +$('ld').value;
    P.period = +$('period').value;
    P.vsini = P.veq * Math.sin(P.inc * DEG);
    P.beta = (90 - P.inc) * DEG;
    P.vmax = niceMax(P.vsini + 4.5 * P.sigma);
    ['A', 'B'].forEach((k) => {
      const type = $(k + '-type').value;
      const c = +$(k + '-contrast').value / 100;
      P.spots[k] = {
        on: type !== 'off' && c > 0,
        c: type === 'dark' ? -c : c,
        lat: +$(k + '-lat').value,
        lon: +$(k + '-lon').value,
        R: +$(k + '-size').value * DEG
      };
    });
  }

  /* ---------- sampling grid over the visible disk ---------- */

  const gx = [], gy = [], gz = [];
  for (let i = 0; i < GN; i++) {
    for (let j = 0; j < GN; j++) {
      const x = -1 + (i + 0.5) * 2 / GN;
      const y = -1 + (j + 0.5) * 2 / GN;
      const r2 = x * x + y * y;
      if (r2 < 1) { gx.push(x); gy.push(y); gz.push(Math.sqrt(1 - r2)); }
    }
  }
  const NG = gx.length;
  const GX = Float32Array.from(gx), GY = Float32Array.from(gy), GZ = Float32Array.from(gz);
  const I0 = new Float32Array(NG);

  const wBuf = new Float32Array(NV + 2);
  const ref = new Float32Array(NV);
  const cur = new Float32Array(NV);
  const tmp = new Float32Array(NV);
  const wf = new Float32Array(NPH * NV);
  let wfMax = 0;
let profMin = 0.9;
  let dv = 1, ker = new Float32Array(1);

  /* ---------- physics ---------- */

  // Sky-frame unit vector of a spot centre at rotation angle alpha.
  function spotCentre(s, alpha) {
    const cl = Math.cos(s.lat * DEG), sl = Math.sin(s.lat * DEG), lo = s.lon * DEG;
    const x = cl * Math.sin(lo), y = sl, z = cl * Math.cos(lo);
    const ca = Math.cos(alpha), sa = Math.sin(alpha);
    const x1 = x * ca + z * sa, y1 = y, z1 = -x * sa + z * ca;
    const cb = Math.cos(P.beta), sb = Math.sin(P.beta);
    return { x: x1, y: y1 * cb - z1 * sb, z: y1 * sb + z1 * cb };
  }

  function activeSpots(alpha) {
    const out = [];
    ['A', 'B'].forEach((k) => {
      const s = P.spots[k];
      if (!s.on) return;
      const c = spotCentre(s, alpha);
      out.push({ key: k, x: c.x, y: c.y, z: c.z, c: s.c, cosIn: Math.cos(0.65 * s.R), cosOut: Math.cos(s.R) });
    });
    return out;
  }

  // Intensity at a point of the visible disk: limb darkening times the spot modulation.
  function shade(x, y, z, sv) {
    let m = 1;
    for (let k = 0; k < sv.length; k++) {
      const s = sv[k];
      const d = x * s.x + y * s.y + z * s.z;
      if (d > s.cosOut) {
        let t = (d - s.cosOut) / (s.cosIn - s.cosOut);
        if (t > 1) t = 1;
        m += s.c * t * t * (3 - 2 * t);
      }
    }
    return m > 0 ? (1 - P.u * (1 - z)) * m : 0;
  }

  function computeProfile(sv, out) {
    wBuf.fill(0);
    let sum = 0;
    const kmax = NV - 1;
    for (let k = 0; k < NG; k++) {
      const I = sv.length ? shade(GX[k], GY[k], GZ[k], sv) : I0[k];
      const pos = (GX[k] * P.vsini + P.vmax) / dv;
      let i0 = Math.floor(pos);
      if (i0 > kmax - 1) i0 = kmax - 1;
      const f = pos - i0;
      wBuf[i0] += I * (1 - f);
      wBuf[i0 + 1] += I * f;
      sum += I;
    }
    const kw = ker.length - 1;
    for (let j = 0; j < NV; j++) {
      let a = 0;
      const lo = Math.max(0, j - kw), hi = Math.min(kmax, j + kw);
      for (let q = lo; q <= hi; q++) a += wBuf[q] * ker[q > j ? q - j : j - q];
      out[j] = 1 - P.depth * a / sum;
    }
  }

  function buildWaterfall() {
    computeProfile([], ref);
    wfMax = 0;
    profMin = Math.min.apply(null, ref);
    const any = P.spots.A.on || P.spots.B.on;
    if (!any) { wf.fill(0); return; }
    for (let j = 0; j < NPH; j++) {
      computeProfile(activeSpots(TAU * j / NPH), tmp);
      for (let i = 0; i < NV; i++) {
        const d = tmp[i] - ref[i];
        wf[j * NV + i] = d;
        if (Math.abs(d) > wfMax) wfMax = Math.abs(d);
        if (tmp[i] < profMin) profMin = tmp[i];
      }
    }
  }

  function rebuild() {
    readParams();
    dv = 2 * P.vmax / (NV - 1);
    const kw = Math.ceil(4 * P.sigma / dv);
    ker = new Float32Array(kw + 1);
    for (let j = 0; j <= kw; j++) ker[j] = Math.exp(-0.5 * Math.pow(j * dv / P.sigma, 2));
    for (let k = 0; k < NG; k++) I0[k] = 1 - P.u * (1 - GZ[k]);
    buildWaterfall();
    wfImageDirty = true;
  }

  /* ---------- canvas helpers ---------- */

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

  function velocityTicks() {
    const step = niceStep(2 * P.vmax, 6);
    const out = [];
    for (let v = Math.ceil(-P.vmax / step) * step; v <= P.vmax + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
    return out;
  }

  const FONT = '12px system-ui, sans-serif';

  function xAxis(ctx, m, w, h, X, withLabel) {
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineWidth = 1;
    velocityTicks().forEach((v) => {
      const x = Math.round(X(v)) + 0.5;
      ctx.strokeStyle = v === 0 ? 'rgba(255,255,255,.2)' : COLOR.grid;
      ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, h - m.b); ctx.stroke();
      ctx.fillStyle = COLOR.text;
      ctx.fillText(String(v), x, h - m.b + 6);
    });
    if (withLabel) {
      ctx.fillStyle = COLOR.text;
      ctx.fillText('Velocity (km/s)  ←  blueshift · redshift  →', m.l + (w - m.l - m.r) / 2, h - 18);
    }
  }

  function yLabel(ctx, m, h, text) {
    ctx.save();
    ctx.translate(12, m.t + (h - m.t - m.b) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLOR.text;
    ctx.font = FONT;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  /* ---------- planet ---------- */

  const planetCanvas = $('planet');
  const off = document.createElement('canvas');
  off.width = off.height = NP;
  const offCtx = off.getContext('2d');
  const img = offCtx.createImageData(NP, NP);

  function skyPoint(lat, lon, alpha) {
    const cl = Math.cos(lat), sl = Math.sin(lat);
    const x = cl * Math.sin(lon), y = sl, z = cl * Math.cos(lon);
    const ca = Math.cos(alpha), sa = Math.sin(alpha);
    const x1 = x * ca + z * sa, z1 = -x * sa + z * ca;
    const cb = Math.cos(P.beta), sb = Math.sin(P.beta);
    return { x: x1, y: y * cb - z1 * sb, z: y * sb + z1 * cb };
  }

  function drawPlanet(sv, alpha) {
    const { ctx, w, h } = fit(planetCanvas);
    if (!w) return;
    const showVel = $('showVel').checked;
    const d = img.data;
    const R = NP / 2;
    for (let py = 0; py < NP; py++) {
      const y = (R - py - 0.5) / R;
      for (let px = 0; px < NP; px++) {
        const x = (px + 0.5 - R) / R;
        const r2 = x * x + y * y;
        const o = (py * NP + px) * 4;
        if (r2 >= 1) { d[o + 3] = 0; continue; }
        const z = Math.sqrt(1 - r2);
        let t = shade(x, y, z, sv) / 1.15;
        if (t > 1.5) t = 1.5;
        let r = 30 + 215 * Math.pow(Math.min(t, 1.2), 0.85);
        let g = 14 + 150 * Math.pow(t, 1.05);
        let b = 28 + 70 * Math.pow(t, 1.5);
        if (showVel) {
          const m = 0.6 * Math.pow(Math.abs(x), 0.8);
          const k = 0.3 + 0.7 * Math.min(t, 1);
          const tr = x < 0 ? 70 : 255, tg = x < 0 ? 130 : 80, tb = x < 0 ? 255 : 70;
          r = r * (1 - m) + tr * k * m;
          g = g * (1 - m) + tg * k * m;
          b = b * (1 - m) + tb * k * m;
        }
        d[o] = r > 255 ? 255 : r;
        d[o + 1] = g > 255 ? 255 : g;
        d[o + 2] = b > 255 ? 255 : b;
        d[o + 3] = 255;
      }
    }
    offCtx.putImageData(img, 0, 0);

    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, Rc = Math.min(w, h) * 0.38;
    const X = (x) => cx + x * Rc, Y = (y) => cy - y * Rc;

    // soft glow behind the disk
    const glow = ctx.createRadialGradient(cx, cy, Rc * 0.9, cx, cy, Rc * 1.35);
    glow.addColorStop(0, 'rgba(120,170,255,.16)');
    glow.addColorStop(1, 'rgba(120,170,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, Rc * 1.35, 0, TAU); ctx.fill();

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, cx - Rc, cy - Rc, 2 * Rc, 2 * Rc);

    // graticule
    if ($('showGrid').checked) {
      ctx.lineWidth = 1;
      const line = (pts, strong) => {
        ctx.strokeStyle = strong ? 'rgba(255,255,255,.3)' : 'rgba(255,255,255,.14)';
        ctx.beginPath();
        let pen = false;
        pts.forEach((p) => {
          if (p.z <= 0) { pen = false; return; }
          if (!pen) { ctx.moveTo(X(p.x), Y(p.y)); pen = true; } else ctx.lineTo(X(p.x), Y(p.y));
        });
        ctx.stroke();
      };
      for (let lon = -180; lon < 180; lon += 30) {
        const pts = [];
        for (let lat = -90; lat <= 90; lat += 3) pts.push(skyPoint(lat * DEG, lon * DEG, alpha));
        line(pts, false);
      }
      for (let lat = -60; lat <= 60; lat += 30) {
        const pts = [];
        for (let lon = 0; lon <= 360; lon += 3) pts.push(skyPoint(lat * DEG, lon * DEG, alpha));
        line(pts, lat === 0);
      }
    }

    // limb
    ctx.strokeStyle = 'rgba(143,227,255,.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, Rc, 0, TAU); ctx.stroke();

    // spin axis (projected: always vertical on the sky), drawn outside the disk
    ctx.strokeStyle = 'rgba(237,242,255,.55)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(cx, cy - Rc * 1.0); ctx.lineTo(cx, cy - Rc * 1.2);
    ctx.moveTo(cx, cy + Rc * 1.0); ctx.lineTo(cx, cy + Rc * 1.2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLOR.text;
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('spin axis', cx, cy - Rc * 1.2 - 3);

    // spot outlines
    sv.forEach((s) => {
      const sp = P.spots[s.key];
      const c = { x: s.x, y: s.y, z: s.z };
      let e = { x: c.y * 0 - c.z * 1, y: 0, z: c.x };           // c × (0,1,0)
      let n = Math.hypot(e.x, e.y, e.z);
      if (n < 1e-3) { e = { x: 0, y: c.z, z: -c.y }; n = Math.hypot(e.x, e.y, e.z); } // c × (1,0,0)
      e = { x: e.x / n, y: e.y / n, z: e.z / n };
      const f = { x: c.y * e.z - c.z * e.y, y: c.z * e.x - c.x * e.z, z: c.x * e.y - c.y * e.x };
      const cr = Math.cos(sp.R), sr = Math.sin(sp.R);
      ctx.strokeStyle = COLOR[s.key];
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      let pen = false;
      for (let a = 0; a <= 360; a += 5) {
        const ca = Math.cos(a * DEG), sa = Math.sin(a * DEG);
        const p = {
          x: c.x * cr + sr * (e.x * ca + f.x * sa),
          y: c.y * cr + sr * (e.y * ca + f.y * sa),
          z: c.z * cr + sr * (e.z * ca + f.z * sa)
        };
        if (p.z <= 0) { pen = false; continue; }
        if (!pen) { ctx.moveTo(X(p.x), Y(p.y)); pen = true; } else ctx.lineTo(X(p.x), Y(p.y));
      }
      ctx.stroke();
      if (s.z > 0) {
        ctx.fillStyle = COLOR[s.key];
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.key, X(s.x), Y(s.y));
      }
    });

    // limb velocity labels
    ctx.font = FONT;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = COLOR.blue;
    ctx.fillText('blueshift  −' + P.vsini.toFixed(0) + ' km/s', 10, h - 24);
    ctx.textAlign = 'right';
    ctx.fillStyle = COLOR.red;
    ctx.fillText('+' + P.vsini.toFixed(0) + ' km/s  redshift', w - 10, h - 24);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = COLOR.text;
    ctx.fillText('v sin i = ' + P.vsini.toFixed(1) + ' km/s', 10, 8);
  }

  /* ---------- line profile and residual ---------- */

  const profCanvas = $('profile');
  const resCanvas = $('residual');
  const M = { l: 64, r: 14, t: 12, b: 40 };

  function drawProfile(sv) {
    const { ctx, w, h } = fit(profCanvas);
    if (!w) return;
    ctx.clearRect(0, 0, w, h);
    const pw = w - M.l - M.r, ph = h - M.t - M.b;
    const X = (v) => M.l + (v + P.vmax) / (2 * P.vmax) * pw;
    const span = 1 - profMin;
    const y0 = profMin - 0.18 * span - 0.002, y1 = 1 + 0.12 * span + 0.002;
    const Y = (f) => M.t + (1 - (f - y0) / (y1 - y0)) * ph;

    xAxis(ctx, M, w, h, X, true);

    ctx.font = FONT;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const ys = niceStep(y1 - y0, 4);
    const dec = ys >= 0.1 ? 1 : ys >= 0.01 ? 2 : 3;
    for (let f = Math.ceil(y0 / ys) * ys; f <= y1 + 1e-9; f += ys) {
      const y = Math.round(Y(f)) + 0.5;
      ctx.strokeStyle = COLOR.grid;
      ctx.beginPath(); ctx.moveTo(M.l, y); ctx.lineTo(w - M.r, y); ctx.stroke();
      ctx.fillStyle = COLOR.text;
      ctx.fillText(f.toFixed(dec), M.l - 8, y);
    }
    yLabel(ctx, M, h, 'Normalised flux');

    // ± v sin i
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    [-P.vsini, P.vsini].forEach((v) => {
      const x = Math.round(X(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, M.t); ctx.lineTo(x, h - M.b); ctx.stroke();
    });
    ctx.setLineDash([]);

    const trace = (arr) => {
      ctx.beginPath();
      for (let i = 0; i < NV; i++) {
        const v = -P.vmax + i * dv;
        if (i === 0) ctx.moveTo(X(v), Y(arr[i])); else ctx.lineTo(X(v), Y(arr[i]));
      }
      ctx.stroke();
    };
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = COLOR.ref;
    trace(ref);
    ctx.setLineDash([]);
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = COLOR.A;
    trace(cur);

    // current spot velocities
    ctx.lineWidth = 1.2;
    sv.forEach((s) => {
      if (s.z <= 0) return;
      const x = X(P.vsini * s.x);
      ctx.strokeStyle = COLOR[s.key];
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x, M.t + 14); ctx.lineTo(x, h - M.b); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLOR[s.key];
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(s.key, x, M.t + 14);
    });
  }

  function drawResidual() {
    const { ctx, w, h } = fit(resCanvas);
    if (!w) return;
    ctx.clearRect(0, 0, w, h);
    const m = { l: M.l, r: M.r, t: 10, b: 22 };
    const pw = w - m.l - m.r, ph = h - m.t - m.b;
    const X = (v) => m.l + (v + P.vmax) / (2 * P.vmax) * pw;
    const S = wfMax > 0 ? wfMax * 1.25 : 0.01;
    const Y = (f) => m.t + (1 - (f + S) / (2 * S)) * ph;

    // vertical grid only (labels are shared with the profile above)
    ctx.lineWidth = 1;
    velocityTicks().forEach((v) => {
      const x = Math.round(X(v)) + 0.5;
      ctx.strokeStyle = v === 0 ? 'rgba(255,255,255,.2)' : COLOR.grid;
      ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, h - m.b); ctx.stroke();
    });
    ctx.font = FONT;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    [-S, 0, S].forEach((f) => {
      const y = Math.round(Y(f)) + 0.5;
      ctx.strokeStyle = f === 0 ? 'rgba(255,255,255,.3)' : COLOR.grid;
      ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(w - m.r, y); ctx.stroke();
      ctx.fillStyle = COLOR.text;
      ctx.fillText((f * 100).toFixed(1), m.l - 8, y);
    });
    yLabel(ctx, m, h, 'Δ flux (%)');

    ctx.strokeStyle = '#ffcf6b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < NV; i++) {
      const v = -P.vmax + i * dv;
      const r = cur[i] - ref[i];
      if (i === 0) ctx.moveTo(X(v), Y(r)); else ctx.lineTo(X(v), Y(r));
    }
    ctx.stroke();

    if (wfMax === 0) {
      ctx.fillStyle = COLOR.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Turn on a spot to see its signal', m.l + pw / 2, m.t + ph / 2 - 14);
    }
  }

  /* ---------- dynamic spectrum ---------- */

  const wfCanvas = $('waterfall');
  const wfOff = document.createElement('canvas');
  wfOff.width = NV; wfOff.height = NPH;
  const wfOffCtx = wfOff.getContext('2d');
  let wfImageDirty = true;
  const BG = [13, 20, 38], WARM = [255, 170, 70], COOL = [90, 185, 255];

  function buildWfImage() {
    const id = wfOffCtx.createImageData(NV, NPH);
    const d = id.data;
    for (let j = 0; j < NPH; j++) {
      for (let i = 0; i < NV; i++) {
        const s = wfMax > 0 ? wf[j * NV + i] / wfMax : 0;
        const a = Math.pow(Math.min(1, Math.abs(s)), 0.65);
        const c = s > 0 ? WARM : COOL;
        const o = (j * NV + i) * 4;
        d[o] = BG[0] + (c[0] - BG[0]) * a;
        d[o + 1] = BG[1] + (c[1] - BG[1]) * a;
        d[o + 2] = BG[2] + (c[2] - BG[2]) * a;
        d[o + 3] = 255;
      }
    }
    wfOffCtx.putImageData(id, 0, 0);
    wfImageDirty = false;
  }

  function drawWaterfall(phase) {
    const { ctx, w, h } = fit(wfCanvas);
    if (!w) return;
    if (wfImageDirty) buildWfImage();
    ctx.clearRect(0, 0, w, h);
    const pw = w - M.l - M.r, ph = h - M.t - M.b;
    const X = (v) => M.l + (v + P.vmax) / (2 * P.vmax) * pw;
    const Y = (p) => M.t + p * ph;

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(wfOff, M.l, M.t, pw, ph);
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(M.l + 0.5, M.t + 0.5, pw - 1, ph - 1);

    xAxis(ctx, M, w, h, X, true);

    ctx.font = FONT;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    [0, 0.5, 1].forEach((p) => {
      ctx.fillStyle = COLOR.text;
      ctx.fillText(p.toFixed(1), M.l - 8, Y(p));
    });
    yLabel(ctx, M, h, 'Rotation phase');

    // expected velocity of each spot centre, where it is on the visible hemisphere
    ['A', 'B'].forEach((k) => {
      const s = P.spots[k];
      if (!s.on) return;
      ctx.strokeStyle = COLOR[k];
      ctx.lineWidth = 1.2;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      let pen = false;
      for (let j = 0; j <= NPH; j++) {
        const c = spotCentre(s, TAU * j / NPH);
        if (c.z <= 0) { pen = false; continue; }
        const x = X(P.vsini * c.x), y = Y(j / NPH);
        if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // current phase
    const y = Y(phase);
    ctx.strokeStyle = '#edf2ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(M.l, y); ctx.lineTo(M.l + pw, y); ctx.stroke();
  }

  /* ---------- animation loop ---------- */

  let phase = 0;
  let playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let onScreen = true;
  let dirty = true;
  let raf = 0;
  let last = 0;

  const playBtn = $('play');
  function syncPlay() {
    playBtn.textContent = playing ? 'Pause' : 'Play';
    playBtn.setAttribute('aria-label', playing ? 'Pause rotation' : 'Play rotation');
  }

  function render() {
    const alpha = phase * TAU;
    const sv = activeSpots(alpha);
    computeProfile(sv, cur);
    drawPlanet(sv, alpha);
    drawProfile(sv);
    drawResidual();
    drawWaterfall(phase);
  }

  function tick(ts) {
    raf = 0;
    if (dirty) { rebuild(); dirty = false; }
    if (playing && last) {
      const dt = Math.min(0.1, (ts - last) / 1000);
      phase = (phase + dt / P.period) % 1;
      $('phase').value = phase.toFixed(3);
      $('phase-out').textContent = phase.toFixed(2);
    }
    render();
    if (playing && onScreen) { last = ts; schedule(); } else last = 0;
  }

  function schedule() {
    if (!raf) raf = requestAnimationFrame(tick);
  }

  $('controls').addEventListener('input', () => { syncOutputs(); dirty = true; schedule(); });
  $('controls').addEventListener('reset', () => setTimeout(() => { syncOutputs(); dirty = true; schedule(); }, 0));
  $('period').addEventListener('input', () => { syncOutputs(); dirty = true; schedule(); });
  $('showVel').addEventListener('change', schedule);
  $('showGrid').addEventListener('change', schedule);
  $('phase').addEventListener('input', (e) => {
    phase = +e.target.value;
    playing = false;
    syncPlay();
    syncOutputs();
    schedule();
  });
  playBtn.addEventListener('click', () => { playing = !playing; syncPlay(); schedule(); });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      onScreen = entries[0].isIntersecting;
      if (onScreen) schedule();
    }).observe(planetCanvas);
  }
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(schedule);
    [planetCanvas, profCanvas, resCanvas, wfCanvas].forEach((c) => ro.observe(c));
  } else {
    window.addEventListener('resize', schedule);
  }

  syncOutputs();
  syncPlay();
  schedule();
})();
