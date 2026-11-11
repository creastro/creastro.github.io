/*
 * Drawing of the two illustrations: the moving source with its light waves (section A) and the rotating,
 * velocity-coloured disk (section B). Only rendering: all the physics comes from physics.js.
 *
 * Disk geometry (sky frame): x to the right, y up, z towards the observer. The spin axis is s = (0, sin i, cos i),
 * so i = 90° is equator-on and i = 0° is pole-on. A body-fixed point (lat, lon) is carried to the sky by
 *     r = Rx(90° − i) · Ry(α) · p,   p = (cos lat sin lon, sin lat, cos lat cos lon),   α = rotation angle.
 * The front face then moves from left to right, so the left limb approaches and the right limb recedes.
 */
window.DopplerScene = (() => {
  'use strict';
  const Ch = window.DopplerCharts;
  const { COLOR, FONT } = Ch;
  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;

  const NEUTRAL = [236, 236, 244], BLUE = [64, 128, 255], RED = [255, 74, 64], STAR = [255, 236, 200];
  const V_SCALE_KMS = 100;   // the colour scale saturates at ±100 km/s, whatever the star

  function velocityRgb(vKms) {
    const t = Math.max(-1, Math.min(1, vKms / V_SCALE_KMS));
    const a = Math.pow(Math.abs(t), 0.85), tint = t < 0 ? BLUE : RED;
    return [0, 1, 2].map((k) => NEUTRAL[k] + (tint[k] - NEUTRAL[k]) * a);
  }

  /* ---------- section A: source, waves, observer ---------- */

  function arrow(ctx, x0, x1, y, color) {
    const d = Math.sign(x1 - x0);
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1 - d * 4, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x1 - d * 11, y - 6); ctx.lineTo(x1 - d * 11, y + 6); ctx.closePath(); ctx.fill();
  }

  function telescope(ctx, x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = COLOR.ink; ctx.fillStyle = 'rgba(237,242,255,.12)'; ctx.lineWidth = 1.6;
    ctx.save();
    ctx.rotate(Math.PI + 0.18);                                // tube points towards the source, on the left
    ctx.beginPath(); ctx.rect(-s * 0.9, -s * 0.22, s * 1.8, s * 0.44); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * 0.9, -s * 0.34); ctx.lineTo(s * 0.9, s * 0.34); ctx.stroke();
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(0, s * 0.1); ctx.lineTo(-s * 0.3, s * 0.85); ctx.moveTo(0, s * 0.1); ctx.lineTo(s * 0.3, s * 0.85); ctx.stroke();
    ctx.restore();
  }

  function drawWaves(canvas, s, t) {
    const { ctx, w, h } = Ch.fit(canvas);
    if (!w) return;
    ctx.clearRect(0, 0, w, h);
    const sx = w * 0.1, sy = h * 0.5, sr = Math.min(h * 0.17, 30);
    const ox = w * 0.92, x0 = sx + sr + 14, x1 = ox - 34;
    const tint = s.vrKms < 0 ? COLOR.blue : s.vrKms > 0 ? COLOR.red : COLOR.text;

    // source
    const glow = ctx.createRadialGradient(sx, sy, sr * 0.6, sx, sy, sr * 2);
    glow.addColorStop(0, 'rgba(255,225,170,.35)'); glow.addColorStop(1, 'rgba(255,225,170,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(sx, sy, sr * 2, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgb(' + STAR.join(',') + ')'; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, TAU); ctx.fill();

    // motion arrow under the source, pointing along the line of sight
    const ay = sy + sr + 24;
    if (s.vrKms !== 0) {
      const dir = s.vrKms > 0 ? -1 : 1;                       // receding: moves away from the observer (to the left)
      arrow(ctx, sx - dir * 24, sx + dir * 24, ay, tint);
    } else {
      ctx.fillStyle = tint; ctx.beginPath(); ctx.arc(sx, ay, 4, 0, TAU); ctx.fill();
    }
    ctx.font = FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = tint;
    const word = s.vrKms > 0 ? 'receding' : s.vrKms < 0 ? 'approaching' : 'no radial motion';
    ctx.fillText(word, sx, ay + 10);
    ctx.fillStyle = COLOR.text;
    ctx.fillText('vr = ' + (s.vrKms > 0 ? '+' : s.vrKms < 0 ? '−' : '') + s.vrText + ' km/s', sx, ay + 26);

    telescope(ctx, ox, sy + 4, Math.min(34, h * 0.13));
    ctx.fillStyle = COLOR.text; ctx.textBaseline = 'top'; ctx.textAlign = 'center';
    ctx.fillText('observer', ox, sy + 4 + Math.min(34, h * 0.13) * 0.9 + 6);

    // waves: same speed, different wavelength. The pattern moves from the source to the observer.
    const L0 = Math.max(26, Math.min(54, w * 0.055));
    const L1 = L0 * (1 + s.zVis);
    const amp = h * 0.075, speed = 70;
    const lanes = [
      { y: h * 0.27, L: L0, color: 'rgba(179,191,216,.75)', label: 'emitted, source frame:  λ₀ = ' + s.restText },
      { y: h * 0.73, L: L1, color: s.obsColor, label: 'received by the observer:  λobs = ' + s.obsText }
    ];
    lanes.forEach((lane) => {
      ctx.font = FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillStyle = COLOR.text;
      ctx.fillText(lane.label, x0, lane.y - amp - 6);
      ctx.lineWidth = 2.2; ctx.strokeStyle = lane.color; ctx.beginPath();
      const step = 2;
      for (let x = x0; x <= x1; x += step) {
        const env = Math.min(1, (x - x0) / 30, (x1 - x) / 30);
        const y = lane.y - amp * env * Math.sin(TAU * ((x - x0 - speed * t) / lane.L));
        if (x === x0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
    ctx.fillStyle = COLOR.text; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(s.magnified > 1.5 ? 'wave spacing: shift magnified ×' + Math.round(s.magnified) + ' to be visible (spectra are to scale)' : 'wave spacing drawn to scale', (x0 + x1) / 2, h - 2);
  }

  /* ---------- section B: rotating, velocity-coloured disk ---------- */

  const NP = 220;
  const imgCanvas = document.createElement('canvas');
  imgCanvas.width = imgCanvas.height = NP;
  const imgCtx = imgCanvas.getContext('2d');
  const imgData = imgCtx.createImageData(NP, NP);
  let imgKey = '';

  // Colour of each pixel: limb-darkened intensity I(μ) times the velocity colour of its horizontal position.
  function buildDiskImage(s) {
    const key = [s.vsiniKms.toFixed(3), s.eps.toFixed(3)].join('|');
    if (key === imgKey) return;
    imgKey = key;
    const d = imgData.data, R = NP / 2;
    for (let py = 0; py < NP; py++) {
      const y = (R - py - 0.5) / R;
      for (let px = 0; px < NP; px++) {
        const x = (px + 0.5 - R) / R, r2 = x * x + y * y, o = (py * NP + px) * 4;
        if (r2 >= 1) { d[o + 3] = 0; continue; }
        const I = 1 - s.eps * (1 - Math.sqrt(1 - r2));                 // linear limb darkening, I(μ)/I(1)
        const c = velocityRgb(x * s.vsiniKms);                          // v_los = v sin i · x
        d[o] = c[0] * I; d[o + 1] = c[1] * I; d[o + 2] = c[2] * I; d[o + 3] = 255;
      }
    }
    imgCtx.putImageData(imgData, 0, 0);
  }

  function skyPoint(lat, lon, alpha, beta) {
    const cl = Math.cos(lat), sl = Math.sin(lat);
    const x = cl * Math.sin(lon), y = sl, z = cl * Math.cos(lon);
    const ca = Math.cos(alpha), sa = Math.sin(alpha), cb = Math.cos(beta), sb = Math.sin(beta);
    const x1 = x * ca + z * sa, z1 = -x * sa + z * ca;
    return { x: x1, y: y * cb - z1 * sb, z: y * sb + z1 * cb };
  }

  function drawDisk(canvas, s, alpha, hoverX) {
    const { ctx, w, h } = Ch.fit(canvas);
    if (!w) return null;
    buildDiskImage(s);
    ctx.clearRect(0, 0, w, h);
    const beta = (90 - s.incDeg) * DEG;
    const availH = h - 56;
    const Rc = Math.min(w * 0.33, availH * 0.34), cx = w / 2, cy = 20 + availH / 2 + Rc * 0.06;
    const X = (x) => cx + x * Rc, Y = (y) => cy - y * Rc;

    const glow = ctx.createRadialGradient(cx, cy, Rc * 0.95, cx, cy, Rc * 1.3);
    glow.addColorStop(0, 'rgba(255,225,170,.16)'); glow.addColorStop(1, 'rgba(255,225,170,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, Rc * 1.3, 0, TAU); ctx.fill();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(imgCanvas, cx - Rc, cy - Rc, 2 * Rc, 2 * Rc);

    // graticule that turns with the star; the equator is drawn heavier
    const poly = (pts, color, lw) => {
      ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath();
      let pen = false;
      pts.forEach((p) => {
        if (p.z <= 0) { pen = false; return; }
        if (!pen) { ctx.moveTo(X(p.x), Y(p.y)); pen = true; } else ctx.lineTo(X(p.x), Y(p.y));
      });
      ctx.stroke();
    };
    for (let lon = -180; lon < 180; lon += 30) {
      const pts = [];
      for (let lat = -90; lat <= 90; lat += 3) pts.push(skyPoint(lat * DEG, lon * DEG, alpha, beta));
      poly(pts, 'rgba(8,13,28,.28)', 1);
    }
    let eqLabel = null;
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts = [];
      for (let lon = 0; lon <= 360; lon += 3) pts.push(skyPoint(lat * DEG, lon * DEG, alpha, beta));
      poly(pts, lat === 0 ? 'rgba(8,13,28,.75)' : 'rgba(8,13,28,.28)', lat === 0 ? 2 : 1);
      if (lat === 0) pts.forEach((p) => { if (p.z > 0 && (!eqLabel || Math.abs(p.x) < Math.abs(eqLabel.x))) eqLabel = p; });
    }
    // a surface marker makes the sense of rotation visible
    const mk = skyPoint(20 * DEG, 0, alpha, beta);
    if (mk.z > 0) {
      ctx.fillStyle = '#080d1c'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(X(mk.x), Y(mk.y), 4, 0, TAU); ctx.fill(); ctx.stroke();
    }

    // hover: the strip of the disk with the same line-of-sight velocity
    if (hoverX !== null) {
      const half = Math.sqrt(1 - hoverX * hoverX);
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(X(hoverX), Y(half)); ctx.lineTo(X(hoverX), Y(-half)); ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.strokeStyle = 'rgba(143,227,255,.55)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, Rc, 0, TAU); ctx.stroke();

    // spin axis (always vertical on the sky) and north pole
    ctx.strokeStyle = 'rgba(237,242,255,.6)'; ctx.lineWidth = 1.3; ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(cx, cy - Rc * 1.28); ctx.lineTo(cx, cy - Rc); ctx.moveTo(cx, cy + Rc); ctx.lineTo(cx, cy + Rc * 1.22); ctx.stroke();
    ctx.setLineDash([]);
    const pole = skyPoint(Math.PI / 2, 0, 0, beta);
    if (pole.z > 0) {
      ctx.fillStyle = COLOR.ink; ctx.beginPath(); ctx.arc(X(pole.x), Y(pole.y), 3, 0, TAU); ctx.fill();
    }
    ctx.font = FONT; ctx.fillStyle = COLOR.text; ctx.textAlign = 'center';
    ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.fillText('spin axis', cx + 26, cy + Rc * 1.1); ctx.textAlign = 'center';

    // rotation sense: arc around the axis above the star, front side moving to the right
    const ay = cy - Rc * 1.28, rx = Rc * 0.42, ry = Rc * 0.1;
    ctx.strokeStyle = 'rgba(237,242,255,.3)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(cx, ay, rx, ry, 0, Math.PI, TAU); ctx.stroke();
    ctx.strokeStyle = COLOR.ink;
    ctx.beginPath(); ctx.ellipse(cx, ay, rx, ry, 0, 0.12 * Math.PI, 0.88 * Math.PI); ctx.stroke();
    ctx.fillStyle = COLOR.ink; ctx.beginPath();
    ctx.moveTo(cx + rx, ay); ctx.lineTo(cx + rx - 7, ay - 4); ctx.lineTo(cx + rx - 7, ay + 5); ctx.closePath(); ctx.fill();
    ctx.textBaseline = 'bottom'; ctx.fillText('rotation', cx, ay - ry - 3);

    if (eqLabel && s.incDeg >= 10) {
      ctx.fillStyle = '#080d1c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('equator', X(eqLabel.x), Y(eqLabel.y) + 11);
    }

    // limb labels
    const vtxt = s.vsiniKms.toFixed(1), neg = s.vsiniKms >= 0.05 ? '−' : '', pos = s.vsiniKms >= 0.05 ? '+' : '';
    ctx.font = FONT; ctx.textBaseline = 'top';
    ctx.textAlign = 'left'; ctx.fillStyle = COLOR.blue;
    ctx.fillText('approaching limb', 8, 8); ctx.fillText(neg + vtxt + ' km/s · blueshift', 8, 24);
    ctx.textAlign = 'right'; ctx.fillStyle = COLOR.red;
    ctx.fillText('receding limb', w - 8, 8); ctx.fillText(pos + vtxt + ' km/s · redshift', w - 8, 24);

    // colour bar: line-of-sight velocity
    const bw = Math.min(w * 0.7, 340), bx = (w - bw) / 2, by = h - 30;
    for (let i = 0; i < bw; i++) {
      const c = velocityRgb((i / (bw - 1) * 2 - 1) * V_SCALE_KMS);
      ctx.fillStyle = 'rgb(' + c.map(Math.round).join(',') + ')'; ctx.fillRect(bx + i, by, 1.5, 8);
    }
    ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, by + 0.5, bw, 8);
    ctx.fillStyle = COLOR.text; ctx.font = '11px system-ui, sans-serif'; ctx.textBaseline = 'top';
    ctx.textAlign = 'left'; ctx.fillText('−' + V_SCALE_KMS, bx, by + 11);
    ctx.textAlign = 'center'; ctx.fillText('0', bx + bw / 2, by + 11);
    ctx.textAlign = 'right'; ctx.fillText('+' + V_SCALE_KMS + '  km/s line of sight', bx + bw, by + 11);

    return { cx, cy, Rc };
  }

  return { drawWaves, drawDisk, velocityRgb, V_SCALE_KMS };
})();
