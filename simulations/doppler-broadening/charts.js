/* Canvas helpers for the Doppler simulation: HiDPI canvases, nice axis ticks, spectral line plots, wavelength colours. */
window.DopplerCharts = (() => {
  'use strict';

  const COLOR = {
    text: '#b3bfd8',
    ink: '#edf2ff',
    grid: 'rgba(255,255,255,.08)',
    ref: 'rgba(179,191,216,.8)',
    shifted: '#8fe3ff',
    broadened: '#ffcf6b',
    blue: '#6aa9ff',
    red: '#ff7468'
  };
  const FONT = '12px system-ui, sans-serif';

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

  function decimalsFor(step) { return Math.max(0, Math.min(8, -Math.floor(Math.log10(step) + 1e-9))); }

  // Approximate RGB of a visible wavelength (Bruton), with a fade at the edges of the visible range. Outside: null.
  function wavelengthToRgb(nm) {
    let r = 0, g = 0, b = 0;
    if (nm >= 380 && nm < 440) { r = -(nm - 440) / 60; b = 1; }
    else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
    else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
    else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
    else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
    else if (nm <= 780) { r = 1; }
    else return null;
    if (nm < 380) return null;
    const f = nm < 420 ? 0.35 + 0.65 * (nm - 380) / 40 : nm > 700 ? 0.35 + 0.65 * (780 - nm) / 80 : 1;
    const k = (c) => Math.round(255 * Math.pow(Math.max(0, c) * f, 0.8));
    return [k(r), k(g), k(b)];
  }

  /*
   * Frame of a plot: grid, ticks and labels. Returns the scales X (data -> px) and Y.
   * opt: { xlo, xhi, ylo, yhi, xLabel, yLabel, yDecimals, margin }
   */
  function frame(ctx, w, h, opt) {
    const m = opt.margin || { l: 58, r: 14, t: 12, b: 42 };
    const pw = w - m.l - m.r, ph = h - m.t - m.b;
    const X = (v) => m.l + (v - opt.xlo) / (opt.xhi - opt.xlo) * pw;
    const Y = (v) => m.t + (1 - (v - opt.ylo) / (opt.yhi - opt.ylo)) * ph;
    ctx.font = FONT;
    ctx.lineWidth = 1;
    const xs = niceStep(opt.xhi - opt.xlo, Math.max(3, Math.min(7, Math.floor(pw / 90))));
    const xd = decimalsFor(xs);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let v = Math.ceil(opt.xlo / xs - 1e-9) * xs; v <= opt.xhi + xs * 1e-9; v += xs) {
      const x = Math.round(X(v)) + 0.5;
      ctx.strokeStyle = COLOR.grid;
      ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, h - m.b); ctx.stroke();
      ctx.fillStyle = COLOR.text;
      ctx.fillText(v.toFixed(xd), x, h - m.b + 6);
    }
    const ys = niceStep(opt.yhi - opt.ylo, 4);
    const yd = decimalsFor(ys);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let v = Math.ceil(opt.ylo / ys - 1e-9) * ys; v <= opt.yhi + ys * 1e-9; v += ys) {
      const y = Math.round(Y(v)) + 0.5;
      ctx.strokeStyle = COLOR.grid;
      ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(w - m.r, y); ctx.stroke();
      ctx.fillStyle = COLOR.text;
      ctx.fillText(v.toFixed(yd), m.l - 8, y);
    }
    ctx.fillStyle = COLOR.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(opt.xLabel, m.l + pw / 2, h - 4);
    ctx.save();
    ctx.translate(13, m.t + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = 'top';
    ctx.fillText(opt.yLabel, 0, 0);
    ctx.restore();
    return { X, Y, m, pw, ph };
  }

  // Colour band of the visible spectrum along the bottom of a plot, or a grey band for UV/IR windows.
  function spectrumBand(ctx, f, h, xlo, xhi) {
    const n = Math.max(1, Math.floor(f.pw / 3));
    const y0 = h - f.m.b - 5;
    for (let i = 0; i < n; i++) {
      const nm = xlo + (xhi - xlo) * (i + 0.5) / n;
      const c = wavelengthToRgb(nm);
      ctx.fillStyle = c ? 'rgb(' + c.join(',') + ')' : 'rgba(179,191,216,.25)';
      ctx.fillRect(f.m.l + i * f.pw / n, y0, f.pw / n + 0.6, 5);
    }
  }

  function trace(ctx, f, grid, flux, style) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(f.m.l, f.m.t, f.pw, f.ph);
    ctx.clip();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.width || 2;
    ctx.setLineDash(style.dash || []);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < grid.length; i++) {
      const x = f.X(grid[i]), y = f.Y(flux[i]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    if (style.fill) {
      ctx.stroke();
      ctx.lineTo(f.X(grid[grid.length - 1]), f.Y(1));
      ctx.lineTo(f.X(grid[0]), f.Y(1));
      ctx.closePath();
      ctx.fillStyle = style.fill;
      ctx.fill();
    } else ctx.stroke();
    ctx.restore();
  }

  function vline(ctx, f, h, x, color, dash, label, align) {
    if (x < f.m.l - 0.5 || x > f.m.l + f.pw + 0.5) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.setLineDash(dash || [2, 4]);
    ctx.beginPath(); ctx.moveTo(x, f.m.t); ctx.lineTo(x, h - f.m.b); ctx.stroke();
    ctx.restore();
    if (label) {
      ctx.fillStyle = color;
      ctx.font = FONT;
      ctx.textAlign = align || 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(label, x + (align === 'left' ? 4 : align === 'right' ? -4 : 0), f.m.t + 3);
    }
  }

  return { COLOR, FONT, fit, niceStep, decimalsFor, wavelengthToRgb, frame, spectrumBand, trace, vline };
})();
