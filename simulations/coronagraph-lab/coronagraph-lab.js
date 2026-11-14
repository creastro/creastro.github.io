/* Generated from coronagraph-lab/src/site/main.ts by "npm run build:site". Do not edit. */
(function() {
	// src/lib/field.ts
	function makeField(n) {
		return {
			n,
			re: new Float64Array(n * n),
			im: new Float64Array(n * n)
		};
	}
	function cloneField(f) {
		return {
			n: f.n,
			re: f.re.slice(),
			im: f.im.slice()
		};
	}
	/** Real amplitude a times exp(i·φ), φ in radians. */
	function fieldFromAmpPhase(n, amp, phaseRad) {
		const f = makeField(n);
		for (let i = 0; i < n * n; i++) {
			const p = phaseRad ? phaseRad[i] : 0;
			f.re[i] = amp[i] * Math.cos(p);
			f.im[i] = amp[i] * Math.sin(p);
		}
		return f;
	}
	/** Pixel-centre coordinates of an m-sample pupil-plane grid with n samples per D, in units of D. */
	function pupilCoords(m, n = m) {
		const x = new Float64Array(m);
		for (let j = 0; j < m; j++) x[j] = (j - (m - 1) / 2) / n;
		return x;
	}
	/** Symmetric focal-plane coordinates: m samples, spacing 1/q (λ/D), no sample on the axis when m is even. */
	function focalCoords(m, q, shift = 0) {
		const u = new Float64Array(m);
		for (let k = 0; k < m; k++) u[k] = (k - (m - 1) / 2) / q + shift;
		return u;
	}
	// src/lib/fft.ts
	var plans = /* @__PURE__ */ new Map();
	function isPowerOfTwo(n) {
		return Number.isInteger(n) && n >= 1 && (n & n - 1) === 0;
	}
	function plan(n) {
		if (!isPowerOfTwo(n)) throw new RangeError(`FFT size must be a power of two, got ${n}`);
		const cached = plans.get(n);
		if (cached) return cached;
		const cos = new Float64Array(n / 2);
		const sin = new Float64Array(n / 2);
		for (let k = 0; k < n / 2; k++) {
			cos[k] = Math.cos(2 * Math.PI * k / n);
			sin[k] = Math.sin(2 * Math.PI * k / n);
		}
		const bits = Math.round(Math.log2(n));
		const rev = new Uint32Array(n);
		for (let i = 0; i < n; i++) {
			let r = 0;
			for (let b = 0; b < bits; b++) if (i & 1 << b) r |= 1 << bits - 1 - b;
			rev[i] = r;
		}
		const p = {
			cos,
			sin,
			rev
		};
		plans.set(n, p);
		return p;
	}
	/** In-place 1D FFT of n points starting at `offset` with the given `stride`. */
	function fft1d(re, im, n, inverse = false, offset = 0, stride = 1) {
		const { cos, sin, rev } = plan(n);
		for (let i = 0; i < n; i++) {
			const j = rev[i];
			if (j > i) {
				const a = offset + i * stride;
				const b = offset + j * stride;
				let t = re[a];
				re[a] = re[b];
				re[b] = t;
				t = im[a];
				im[a] = im[b];
				im[b] = t;
			}
		}
		const sign = inverse ? 1 : -1;
		for (let size = 2; size <= n; size <<= 1) {
			const half = size >> 1;
			const step = n / size;
			for (let start = 0; start < n; start += size) for (let k = 0; k < half; k++) {
				const wr = cos[k * step];
				const wi = sign * sin[k * step];
				const a = offset + (start + k) * stride;
				const b = a + half * stride;
				const xr = re[b] * wr - im[b] * wi;
				const xi = re[b] * wi + im[b] * wr;
				re[b] = re[a] - xr;
				im[b] = im[a] - xi;
				re[a] += xr;
				im[a] += xi;
			}
		}
	}
	/** In-place 2D FFT of an n×n row-major array (unscaled in both directions). */
	function fft2d(re, im, n, inverse = false) {
		for (let y = 0; y < n; y++) fft1d(re, im, n, inverse, y * n, 1);
		for (let x = 0; x < n; x++) fft1d(re, im, n, inverse, x, n);
	}
	/** Swap quadrants so that the zero frequency moves between index 0 and index n/2 (n even). */
	function fftshift2d(a, n) {
		const h = n >> 1;
		for (let y = 0; y < h; y++) for (let x = 0; x < n; x++) {
			const i = y * n + x;
			const j = (y + h) * n + (x + h) % n;
			const t = a[i];
			a[i] = a[j];
			a[j] = t;
		}
	}
	// src/lib/mft.ts
	var cache$3 = /* @__PURE__ */ new Map();
	function key(a, b, sign) {
		const da = a.length > 1 ? a[1] - a[0] : 0;
		const db = b.length > 1 ? b[1] - b[0] : 0;
		return `${a.length}:${a[0]}:${da}|${b.length}:${b[0]}:${db}|${sign}`;
	}
	/** Matrix K[k][j] = exp(s·2πi·u_k·x_j), cached for regular grids. */
	function kernel(u, x, sign) {
		const k = key(u, x, sign);
		const hit = cache$3.get(k);
		if (hit) return hit;
		const re = new Float64Array(u.length * x.length);
		const im = new Float64Array(u.length * x.length);
		for (let a = 0; a < u.length; a++) for (let j = 0; j < x.length; j++) {
			const ph = sign * 2 * Math.PI * u[a] * x[j];
			re[a * x.length + j] = Math.cos(ph);
			im[a * x.length + j] = Math.sin(ph);
		}
		if (cache$3.size > 64) cache$3.delete(cache$3.keys().next().value);
		const kk = {
			re,
			im
		};
		cache$3.set(k, kk);
		return kk;
	}
	/**
	* General MFT. Input: yIn.length rows × xIn.length columns (yIn defaults to xIn).
	* Output: v.length rows × u.length columns.
	*/
	function mftGeneral(inRe, inIm, xIn, u, v, sign, weight, yIn = xIn) {
		const n = xIn.length;
		const ny = yIn.length;
		const mu = u.length, mv = v.length;
		const A = kernel(u, xIn, sign);
		const B = kernel(v, yIn, sign);
		const tRe = new Float64Array(ny * mu);
		const tIm = new Float64Array(ny * mu);
		for (let y = 0; y < ny; y++) {
			const row = y * n;
			let empty = true;
			for (let x = 0; x < n; x++) if (inRe[row + x] !== 0 || inIm[row + x] !== 0) {
				empty = false;
				break;
			}
			if (empty) continue;
			for (let k = 0; k < mu; k++) {
				let sr = 0, si = 0;
				const ka = k * n;
				for (let x = 0; x < n; x++) {
					const er = inRe[row + x], ei = inIm[row + x];
					const ar = A.re[ka + x], ai = A.im[ka + x];
					sr += er * ar - ei * ai;
					si += er * ai + ei * ar;
				}
				tRe[y * mu + k] = sr;
				tIm[y * mu + k] = si;
			}
		}
		const re = new Float64Array(mv * mu);
		const im = new Float64Array(mv * mu);
		for (let l = 0; l < mv; l++) {
			const lb = l * ny;
			const o = l * mu;
			for (let y = 0; y < ny; y++) {
				const br = B.re[lb + y], bi = B.im[lb + y];
				const t = y * mu;
				for (let k = 0; k < mu; k++) {
					const tr = tRe[t + k], ti = tIm[t + k];
					re[o + k] += br * tr - bi * ti;
					im[o + k] += br * ti + bi * tr;
				}
			}
			for (let k = 0; k < mu; k++) {
				re[o + k] *= weight;
				im[o + k] *= weight;
			}
		}
		return {
			nx: mu,
			ny: mv,
			re,
			im
		};
	}
	/** Pupil (x in D) → focal plane (u in λ/D), square output. */
	function mftForward(f, xIn, u) {
		const dx = xIn[1] - xIn[0];
		const g = mftGeneral(f.re, f.im, xIn, u, u, -1, dx * dx);
		return {
			n: u.length,
			re: g.re,
			im: g.im
		};
	}
	// src/lib/focalMask.ts
	/**
	* Propagation from a pupil plane, through a focal-plane mask, to the next pupil plane (the Lyot plane):
	*   E_C = F⁻¹{ m · F{E_A} }.
	* Two exact-in-the-continuum strategies are used:
	*
	* 1. Babinet (compact masks: Lyot occulter, Roddier phase disk, Zernike dimple). Write m = 1 + (m − 1)·χ,
	*    with χ the mask support of radius R. Then E_C = E_A + F⁻¹{(m − 1)·F{E_A}}, and the second term only
	*    needs the focal field inside R, computed with a finely sampled MFT (Soummer et al. 2007).
	*
	* 2. Multi-scale (masks that extend over the whole plane: vortex, four-quadrant). The mask is split with a
	*    smooth radial partition of unity, m = Σ_i m·(W_{i−1} − W_i), and each piece is propagated on its own
	*    focal grid: an FFT for the coarse outer part, and MFTs with ever finer sampling towards the centre,
	*    where the vortex has its singularity. The pieces add up in the Lyot plane.
	*
	* Coordinates: pupil x in units of D; focal u in units of λ/D at the current wavelength.
	* `scale` = λ0/λ converts a mask defined in λ0/D (fixed physical size) to λ/D: u0 = u / scale.
	*/
	/** Raised-cosine radial window: 1 for r ≤ a, 0 for r ≥ b. */
	function radialWindow(r, a, b) {
		if (r <= a) return 1;
		if (r >= b) return 0;
		return .5 * (1 + Math.cos(Math.PI * (r - a) / (b - a)));
	}
	/** Sampled mask values, cached per mask function and grid (masks are evaluated once, not at every propagation). */
	var maskCache = /* @__PURE__ */ new WeakMap();
	function sampledMask(owner, key, nu, nv, value) {
		let m = maskCache.get(owner);
		if (!m) {
			m = /* @__PURE__ */ new Map();
			maskCache.set(owner, m);
		}
		const hit = m.get(key);
		if (hit) return hit;
		const re = new Float64Array(nu * nv), im = new Float64Array(nu * nv);
		for (let l = 0; l < nv; l++) for (let k = 0; k < nu; k++) {
			const [a, b] = value(k, l);
			re[l * nu + k] = a;
			im[l * nu + k] = b;
		}
		if (m.size > 32) m.delete(m.keys().next().value);
		const out = {
			re,
			im
		};
		m.set(key, out);
		return out;
	}
	function mulInPlace(g, m) {
		for (let i = 0; i < g.re.length; i++) {
			const mr = m.re[i], mi = m.im[i];
			if (mr === 0 && mi === 0) {
				g.re[i] = 0;
				g.im[i] = 0;
				continue;
			}
			const r = g.re[i] * mr - g.im[i] * mi;
			g.im[i] = g.re[i] * mi + g.im[i] * mr;
			g.re[i] = r;
		}
	}
	/**
	* Babinet propagation for a mask that differs from 1 only inside radius `radius0` (λ0/D).
	* `deltaMask(u, v)` returns (m − 1) at λ0/D coordinates; it is averaged over sub-pixels for accurate edges.
	*/
	function babinetPropagate(E, xIn, xOut, radius0, deltaMask, scale) {
		const g = babinetGrid(E, xIn, xOut, xOut, radius0, deltaMask, scale);
		return {
			n: xOut.length,
			re: g.re,
			im: g.im
		};
	}
	/** Babinet propagation to an arbitrary rectangular output grid (yOut rows × xOut columns, same spacing as xIn). */
	function babinetGrid(E, xIn, xOut, yOut, radius0, deltaMask, scale) {
		const R = radius0 * scale * 1.02;
		const samples = Math.min(128, Math.max(32, 2 * Math.ceil(R * 10)));
		const q = samples / (2 * R);
		const u = focalCoords(samples, q);
		const dx = xIn[1] - xIn[0];
		const F = mftGeneral(E.re, E.im, xIn, u, u, -1, dx * dx);
		const ss = 4;
		mulInPlace(F, sampledMask(deltaMask, `b:${R}:${samples}`, samples, samples, (k, l) => {
			let sr = 0, si = 0;
			for (let b = 0; b < ss; b++) for (let a = 0; a < ss; a++) {
				const [r, i] = deltaMask((u[k] + ((a + .5) / ss - .5) / q) / scale, (u[l] + ((b + .5) / ss - .5) / q) / scale);
				sr += r;
				si += i;
			}
			return [sr / 16, si / 16];
		}));
		const back = mftGeneral(F.re, F.im, u, xOut, yOut, 1, 1 / (q * q));
		addAligned(back, E, xIn, xOut, yOut);
		return back;
	}
	/** Index of the input sample at coordinate x, or −1 if x is not on the input grid. */
	function alignedIndex(xIn, x) {
		const dx = xIn[1] - xIn[0];
		const i = Math.round((x - xIn[0]) / dx);
		return i >= 0 && i < xIn.length && Math.abs(xIn[i] - x) < 1e-6 * dx ? i : -1;
	}
	function addAligned(out, E, xIn, xOut, yOut) {
		const ix = Array.from(xOut, (x) => alignedIndex(xIn, x));
		for (let l = 0; l < yOut.length; l++) {
			const iy = alignedIndex(xIn, yOut[l]);
			if (iy < 0) continue;
			for (let k = 0; k < xOut.length; k++) {
				if (ix[k] < 0) continue;
				out.re[l * xOut.length + k] += E.re[iy * E.n + ix[k]];
				out.im[l * xOut.length + k] += E.im[iy * E.n + ix[k]];
			}
		}
	}
	/** Copy an n×n field into the centre of an m×m grid (m ≥ n, same parity). */
	function embed(E, m) {
		const out = makeField(m);
		const o = (m - E.n) / 2;
		for (let y = 0; y < E.n; y++) {
			out.re.set(E.re.subarray(y * E.n, (y + 1) * E.n), (y + o) * m + o);
			out.im.set(E.im.subarray(y * E.n, (y + 1) * E.n), (y + o) * m + o);
		}
		return out;
	}
	var LEVELS = [
		{
			half: 4,
			q: 8
		},
		{
			half: 1,
			q: 32
		},
		{
			half: .25,
			q: 128
		}
	];
	var FFT_Q = 4;
	/**
	* Multi-scale propagation through a mask that covers the whole focal plane. The star is placed between
	* focal samples (the FFT level uses a half-sample offset) so the singular point is never sampled.
	*/
	function multiscalePropagate(E, xIn, xOut, mask, scale) {
		const g = multiscaleGrid(E, xIn, xOut, xOut, mask, scale);
		return {
			n: xOut.length,
			re: g.re,
			im: g.im
		};
	}
	/** Multi-scale propagation to an arbitrary rectangular output grid (yOut rows × xOut columns, same spacing). */
	function multiscaleGrid(E, xIn, xOut, yOut, mask, scale) {
		const n = E.n;
		const mx = xOut.length, my = yOut.length;
		const out = {
			nx: mx,
			ny: my,
			re: new Float64Array(mx * my),
			im: new Float64Array(mx * my)
		};
		const wOuter = (r) => radialWindow(r, .5 * LEVELS[0].half, LEVELS[0].half);
		{
			const N = n * FFT_Q;
			const re = new Float64Array(N * N), im = new Float64Array(N * N);
			const off = (N - n) / 2;
			const du = 1 / FFT_Q;
			const shift = du / 2;
			for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
				const ph = 2 * Math.PI * shift * (xIn[x] + xIn[y]);
				const c = Math.cos(ph), s = Math.sin(ph);
				const er = E.re[y * n + x], ei = E.im[y * n + x];
				re[(y + off) * N + x + off] = er * c - ei * s;
				im[(y + off) * N + x + off] = er * s + ei * c;
			}
			fftshift2d(re, N);
			fftshift2d(im, N);
			fft2d(re, im, N, false);
			fftshift2d(re, N);
			fftshift2d(im, N);
			const m0 = sampledMask(mask, `fft:${N}:${scale}`, N, N, (k, l) => {
				const u = (k - N / 2) * du - shift, v = (l - N / 2) * du - shift;
				const w = 1 - wOuter(Math.hypot(u, v));
				if (w === 0) return [0, 0];
				const [mr, mi] = mask(u / scale, v / scale);
				return [mr * w, mi * w];
			});
			mulInPlace({
				re,
				im
			}, m0);
			fftshift2d(re, N);
			fftshift2d(im, N);
			fft2d(re, im, N, true);
			fftshift2d(re, N);
			fftshift2d(im, N);
			const norm = 1 / (N * N);
			const idx = (x) => (Math.round(x * n + N / 2 - .5) % N + N) % N;
			const kx = Array.from(xOut, idx);
			for (let l = 0; l < my; l++) {
				const row = idx(yOut[l]) * N;
				for (let k = 0; k < mx; k++) {
					const i = row + kx[k];
					const ph = -2 * Math.PI * shift * (xOut[k] + yOut[l]);
					const c = Math.cos(ph), s = Math.sin(ph);
					out.re[l * mx + k] += (re[i] * c - im[i] * s) * norm;
					out.im[l * mx + k] += (re[i] * s + im[i] * c) * norm;
				}
			}
		}
		const dx = xIn[1] - xIn[0];
		for (let li = 0; li < LEVELS.length; li++) {
			const L = LEVELS[li];
			const next = LEVELS[li + 1];
			const M = Math.round(2 * L.half * L.q);
			const u = focalCoords(M, L.q);
			const F = mftGeneral(E.re, E.im, xIn, u, u, -1, dx * dx);
			const wPrev = (r) => radialWindow(r, .5 * L.half, L.half);
			const wNext = (r) => next ? radialWindow(r, .5 * next.half, next.half) : 0;
			mulInPlace(F, sampledMask(mask, `lvl:${li}:${scale}`, M, M, (k, l) => {
				const r = Math.hypot(u[k], u[l]);
				const w = wPrev(r) - wNext(r);
				if (w === 0) return [0, 0];
				const [mr, mi] = mask(u[k] / scale, u[l] / scale);
				return [mr * w, mi * w];
			}));
			const back = mftGeneral(F.re, F.im, u, xOut, yOut, 1, 1 / (L.q * L.q));
			for (let i = 0; i < out.re.length; i++) {
				out.re[i] += back.re[i];
				out.im[i] += back.im[i];
			}
		}
		return out;
	}
	// src/lib/linalg.ts
	/** Dense linear algebra for the small systems of wavefront control (a few hundred unknowns). */
	/** Solve the symmetric positive-definite system A x = b (A is m×m and is not modified). */
	function choleskySolve(A, b, m) {
		return choleskyBack(choleskyFactor(A, m), b, m);
	}
	/** Factorise A once and return a solver for any right-hand side. */
	function choleskySolver(A, m) {
		const L = choleskyFactor(A, m);
		return (b) => choleskyBack(L, b, m);
	}
	/** Precompute R = (GᵀG + α s I)⁻¹ Gᵀ so that each loop iteration is a matrix-vector product. */
	function tikhonovMatrix(G, rows, cols, alpha) {
		const GtG = new Float64Array(cols * cols);
		for (let r = 0; r < rows; r++) {
			const o = r * cols;
			for (let a = 0; a < cols; a++) {
				const ga = G[o + a];
				if (ga === 0) continue;
				for (let c = a; c < cols; c++) GtG[a * cols + c] += ga * G[o + c];
			}
		}
		let s = 0;
		for (let a = 0; a < cols; a++) s = Math.max(s, GtG[a * cols + a]);
		for (let a = 0; a < cols; a++) {
			for (let c = 0; c < a; c++) GtG[a * cols + c] = GtG[c * cols + a];
			GtG[a * cols + a] += alpha * s + 1e-30;
		}
		const L = choleskyFactor(GtG, cols);
		const R = new Float64Array(cols * rows);
		const col = new Float64Array(cols);
		for (let r = 0; r < rows; r++) {
			for (let a = 0; a < cols; a++) col[a] = G[r * cols + a];
			const x = choleskyBack(L, col, cols);
			for (let a = 0; a < cols; a++) R[a * rows + r] = x[a];
		}
		return {
			rows,
			cols,
			R,
			apply(b) {
				const out = new Float64Array(cols);
				for (let a = 0; a < cols; a++) {
					let t = 0;
					const o = a * rows;
					for (let r = 0; r < rows; r++) t += R[o + r] * b[r];
					out[a] = t;
				}
				return out;
			}
		};
	}
	function choleskyFactor(A0, m) {
		const A = A0.slice();
		for (let j = 0; j < m; j++) {
			let d = A[j * m + j];
			for (let k = 0; k < j; k++) d -= A[j * m + k] * A[j * m + k];
			if (d <= 0) throw new Error("Matrix is not positive definite");
			const ljj = Math.sqrt(d);
			A[j * m + j] = ljj;
			for (let i = j + 1; i < m; i++) {
				let t = A[i * m + j];
				for (let k = 0; k < j; k++) t -= A[i * m + k] * A[j * m + k];
				A[i * m + j] = t / ljj;
			}
		}
		return A;
	}
	function choleskyBack(L, b, m) {
		const y = new Float64Array(m);
		for (let i = 0; i < m; i++) {
			let s = b[i];
			for (let k = 0; k < i; k++) s -= L[i * m + k] * y[k];
			y[i] = s / L[i * m + i];
		}
		const x = new Float64Array(m);
		for (let i = m - 1; i >= 0; i--) {
			let s = y[i];
			for (let k = i + 1; k < m; k++) s -= L[k * m + i] * x[k];
			x[i] = s / L[i * m + i];
		}
		return x;
	}
	/** Eigen-decomposition of a small symmetric matrix by cyclic Jacobi rotations. Returns ascending eigenvalues. */
	function symmetricEigen(A0, m) {
		const A = A0.slice();
		const V = new Float64Array(m * m);
		for (let i = 0; i < m; i++) V[i * m + i] = 1;
		for (let sweep = 0; sweep < 100; sweep++) {
			let off = 0;
			for (let p = 0; p < m; p++) for (let q = p + 1; q < m; q++) off += A[p * m + q] ** 2;
			if (off < 1e-30) break;
			for (let p = 0; p < m; p++) for (let q = p + 1; q < m; q++) {
				const apq = A[p * m + q];
				if (Math.abs(apq) < 1e-300) continue;
				const theta = (A[q * m + q] - A[p * m + p]) / (2 * apq);
				const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
				const c = 1 / Math.sqrt(t * t + 1), s = t * c;
				for (let k = 0; k < m; k++) {
					const akp = A[k * m + p], akq = A[k * m + q];
					A[k * m + p] = c * akp - s * akq;
					A[k * m + q] = s * akp + c * akq;
				}
				for (let k = 0; k < m; k++) {
					const apk = A[p * m + k], aqk = A[q * m + k];
					A[p * m + k] = c * apk - s * aqk;
					A[q * m + k] = s * apk + c * aqk;
				}
				for (let k = 0; k < m; k++) {
					const vkp = V[k * m + p], vkq = V[k * m + q];
					V[k * m + p] = c * vkp - s * vkq;
					V[k * m + q] = s * vkp + c * vkq;
				}
			}
		}
		const idx = Array.from({ length: m }, (_, i) => i).sort((a, b) => A[a * m + a] - A[b * m + b]);
		const values = new Float64Array(m), vectors = new Float64Array(m * m);
		idx.forEach((j, c) => {
			values[c] = A[j * m + j];
			for (let k = 0; k < m; k++) vectors[k * m + c] = V[k * m + j];
		});
		return {
			values,
			vectors
		};
	}
	/**
	* Largest eigenpair of a symmetric linear operator by the Lanczos method with full re-orthogonalisation.
	* Converges in far fewer operator applications than the power method when the top eigenvalues are close.
	*/
	function lanczosTop(apply, start, steps) {
		const dim = start.length;
		const Q = [];
		const alpha = [], beta = [];
		let q = start.slice();
		let nrm = Math.sqrt(q.reduce((s, v) => s + v * v, 0));
		for (let i = 0; i < dim; i++) q[i] /= nrm;
		for (let j = 0; j < steps; j++) {
			Q.push(q);
			const w = apply(q);
			let a = 0;
			for (let i = 0; i < dim; i++) a += w[i] * q[i];
			alpha.push(a);
			for (const qq of Q) {
				let d = 0;
				for (let i = 0; i < dim; i++) d += w[i] * qq[i];
				for (let i = 0; i < dim; i++) w[i] -= d * qq[i];
			}
			nrm = Math.sqrt(w.reduce((s, v) => s + v * v, 0));
			if (nrm < 1e-14 || j === steps - 1) break;
			beta.push(nrm);
			q = w.map((v) => v / nrm);
		}
		const m = alpha.length;
		const T = new Float64Array(m * m);
		for (let i = 0; i < m; i++) {
			T[i * m + i] = alpha[i];
			if (i + 1 < m) {
				T[i * m + i + 1] = beta[i];
				T[(i + 1) * m + i] = beta[i];
			}
		}
		const { values, vectors } = symmetricEigen(T, m);
		const vec = new Float64Array(dim);
		for (let k = 0; k < m; k++) {
			const c = vectors[k * m + (m - 1)];
			for (let i = 0; i < dim; i++) vec[i] += c * Q[k][i];
		}
		return {
			value: values[m - 1],
			vector: vec
		};
	}
	// src/lib/designs.ts
	/**
	* Numerical designs of the pupil-plane elements of some coronagraphs:
	* - APLC apodizer: the eigenfunction of the "pupil → occulter → pupil" operator (Soummer 2005).
	* - Shaped pupil: a binary opening whose width follows a 1D prolate spheroidal function
	*   (Kasdin et al. 2003 discuss this family of "Spergel–Kasdin" pupils).
	* - Apodizing phase plate: a phase-only pupil found with a Gerchberg–Saxton-type iteration that empties a
	*   region of the focal plane (Codona et al. 2006 used a related iterative approach).
	* Each design is cached by its parameters.
	*/
	var cache$2 = /* @__PURE__ */ new Map();
	function memo(key, make) {
		if (cache$2.has(key)) return cache$2.get(key);
		const v = make();
		if (cache$2.size > 24) cache$2.delete(cache$2.keys().next().value);
		cache$2.set(key, v);
		return v;
	}
	/**
	* Power iteration for Φ = P · F⁻¹{χ_r · F{Φ}} / Λ, with χ_r the occulter disk of radius r (λ/D).
	* The leading eigenfunction gives the APLC apodizer; on axis the Lyot-plane field becomes (1 − Λ)·Φ.
	*/
	function aplcApodizer(pupil, n, radius, key, steps = 12) {
		return memo(`aplc:${key}:${n}:${radius}:${steps}`, () => {
			const x = pupilCoords(n);
			const occulter = (u, v) => u * u + v * v <= radius * radius ? [-1, 0] : [0, 0];
			const apply = (v) => {
				const f = makeField(n);
				for (let i = 0; i < n * n; i++) f.re[i] = pupil[i] * v[i];
				const rest = babinetPropagate(f, x, x, radius, occulter, 1);
				const out = new Float64Array(n * n);
				for (let i = 0; i < n * n; i++) out[i] = pupil[i] * (f.re[i] - rest.re[i]);
				return out;
			};
			const { value, vector } = lanczosTop(apply, pupil.slice(), steps);
			let mx = 0;
			for (let i = 0; i < n * n; i++) mx = Math.max(mx, Math.abs(vector[i]));
			const sign = vector.reduce((s, v) => s + v, 0) < 0 ? -1 : 1;
			return {
				apodizer: vector.map((v) => sign * v / mx),
				eigenvalue: value
			};
		});
	}
	/** Leading prolate spheroidal function on [−a, a] for band |u| ≤ b (u in λ/D, x in D), sampled at K points. */
	function prolate(a, b, K = 241) {
		return memo(`prolate:${a}:${b}:${K}`, () => {
			const x = new Float64Array(K);
			for (let k = 0; k < K; k++) x[k] = -a + 2 * a * k / (K - 1);
			const h = x[1] - x[0];
			const S = new Float64Array(K * K);
			for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) {
				const d = x[i] - x[j];
				S[i * K + j] = (d === 0 ? 2 * b : Math.sin(2 * Math.PI * b * d) / (Math.PI * d)) * h;
			}
			const apply = (v) => {
				const out = new Float64Array(K);
				for (let r = 0; r < K; r++) {
					let t = 0;
					for (let c = 0; c < K; c++) t += S[r * K + c] * v[c];
					out[r] = t;
				}
				return out;
			};
			const top = lanczosTop(apply, new Float64Array(K).fill(1), 40);
			const psi = top.vector;
			const lam = top.value;
			const mx = psi[(K - 1) / 2];
			for (let i = 0; i < K; i++) psi[i] /= mx;
			return {
				x,
				psi,
				concentration: lam
			};
		});
	}
	/**
	* Binary shaped pupil: open where |y| ≤ s·ψ(x) for |x| ≤ a, inside the telescope pupil. Along the u axis
	* the far field is the Fourier transform of the opening height, i.e. a prolate function whose energy is
	* concentrated within |u| < b, which leaves deep dark zones beyond b on both sides of the star.
	*/
	function shapedPupil(pupil, n, b, openings, key) {
		return memo(`sp:${key}:${n}:${b}:${openings}`, () => {
			const a = .46;
			const N = Math.max(1, Math.round(openings));
			const { x: xs, psi } = prolate(a, b);
			const interp = (x) => {
				if (Math.abs(x) >= a) return 0;
				const t = (x + a) / (2 * a) * (xs.length - 1);
				const i = Math.min(xs.length - 2, Math.floor(t));
				return Math.max(0, psi[i] + (psi[i + 1] - psi[i]) * (t - i));
			};
			let s = .5;
			for (let k = 0; k < xs.length; k++) {
				const chord = Math.sqrt(Math.max(0, .25 - xs[k] * xs[k]));
				s = Math.min(s, chord * N / (N - 1 + psi[k]));
			}
			const mask = new Float64Array(n * n);
			const sub = 16;
			for (let i = 0; i < n; i++) for (let k = 0; k < sub; k++) {
				const g = s * interp((i - (n - 1) / 2 + (k + .5) / sub - .5) / n) / N;
				for (let o = 0; o < N; o++) {
					const yc = (o - (N - 1) / 2) * 2 * s / N;
					for (let j = 0; j < n; j++) {
						const y0 = (j - n / 2) / n, y1 = y0 + 1 / n;
						const cover = Math.max(0, Math.min(y1, yc + g) - Math.max(y0, yc - g)) * n;
						mask[j * n + i] += cover / sub;
					}
				}
			}
			for (let i = 0; i < mask.length; i++) if (pupil[i] < 1) mask[i] = Math.min(mask[i], pupil[i]);
			return mask;
		});
	}
	/** D-shaped dark-hole region for the APP: iwa ≤ r ≤ owa on the side u > 0 (λ/D). */
	function appRegion(u, v, iwa, owa) {
		const r = Math.hypot(u, v);
		return u >= iwa * .7 && r >= iwa && r <= owa;
	}
	/**
	* Phase-only pupil that darkens the region `appRegion` (Gerchberg–Saxton iteration on a q = 2 FFT grid):
	* alternately zero the focal field in the slightly enlarged dark hole and keep only the phase in the pupil.
	*/
	function appPhase(pupil, n, iwa, owa, key) {
		return memo(`app:${key}:${n}:${iwa}:${owa}`, () => {
			const N = 2 * n;
			const q = N / n;
			const off = (N - n) / 2;
			const ph = new Float64Array(n * n);
			const re = new Float64Array(N * N), im = new Float64Array(N * N);
			const hole = new Uint8Array(N * N);
			for (let l = 0; l < N; l++) for (let k = 0; k < N; k++) if (appRegion((k - N / 2) / q, (l - N / 2) / q, iwa - .6, owa + .6)) hole[l * N + k] = 1;
			for (let it = 0; it < 400; it++) {
				re.fill(0);
				im.fill(0);
				for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
					const i = y * n + x, j = (y + off) * N + x + off;
					re[j] = pupil[i] * Math.cos(ph[i]);
					im[j] = pupil[i] * Math.sin(ph[i]);
				}
				fftshift2d(re, N);
				fftshift2d(im, N);
				fft2d(re, im, N, false);
				fftshift2d(re, N);
				fftshift2d(im, N);
				for (let i = 0; i < N * N; i++) if (hole[i]) {
					re[i] = 0;
					im[i] = 0;
				}
				fftshift2d(re, N);
				fftshift2d(im, N);
				fft2d(re, im, N, true);
				fftshift2d(re, N);
				fftshift2d(im, N);
				for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
					const i = y * n + x, j = (y + off) * N + x + off;
					if (pupil[i] > 0) ph[i] = Math.atan2(im[j], re[j]);
				}
			}
			return ph;
		});
	}
	// src/lib/pupils.ts
	var DEFAULT_PUPIL = {
		kind: "circular",
		obscuration: .14,
		spiders: 4,
		spiderWidth: .01,
		rings: 2,
		gap: .02
	};
	/**
	* Supersampled rasterisation on an m×m grid with n samples per D (m ≥ n pads the pupil plane):
	* x, y in units of D, origin at the grid centre.
	*/
	function rasterize(n, inside, ss = 4, m = n) {
		const out = new Float64Array(m * m);
		const d = 1 / n;
		for (let j = 0; j < m; j++) {
			const yc = (j - (m - 1) / 2) * d;
			for (let i = 0; i < m; i++) {
				const xc = (i - (m - 1) / 2) * d;
				const h = d / 2;
				const c = [
					inside(xc - h, yc - h),
					inside(xc + h, yc - h),
					inside(xc - h, yc + h),
					inside(xc + h, yc + h),
					inside(xc, yc)
				];
				if (c.every((v) => v === c[0])) {
					out[j * m + i] = c[0] ? 1 : 0;
					continue;
				}
				let s = 0;
				for (let b = 0; b < ss; b++) {
					const y = yc + ((b + .5) / ss - .5) * d;
					for (let a = 0; a < ss; a++) if (inside(xc + ((a + .5) / ss - .5) * d, y)) s++;
				}
				out[j * m + i] = s / (ss * ss);
			}
		}
		return out;
	}
	function onSpider(x, y, count, width, angle0) {
		for (let k = 0; k < count; k++) {
			const t = angle0 + 2 * Math.PI * k / count;
			const along = x * Math.cos(t) + y * Math.sin(t);
			const across = -x * Math.sin(t) + y * Math.cos(t);
			if (along > 0 && Math.abs(across) < width / 2) return true;
		}
		return false;
	}
	/** Segment centres of a hexagonal honeycomb (pointy-top hexagons), with the pitch normalised to D = 1. */
	function hexLayout(rings, emptyCentre) {
		const raw = [];
		for (let q = -rings; q <= rings; q++) for (let r = -rings; r <= rings; r++) {
			if (Math.abs(q + r) > rings) continue;
			if (emptyCentre && q === 0 && r === 0) continue;
			raw.push([q + r / 2, Math.sqrt(3) / 2 * r]);
		}
		let rmax = 0;
		for (const [x, y] of raw) for (let v = 0; v < 6; v++) {
			const a = Math.PI / 2 + v * Math.PI / 3;
			rmax = Math.max(rmax, Math.hypot(x + Math.cos(a) / Math.sqrt(3), y + Math.sin(a) / Math.sqrt(3)));
		}
		const pitch = .5 / rmax;
		return {
			centres: raw.map(([x, y]) => [x * pitch, y * pitch]),
			pitch
		};
	}
	function insideHex(x, y, apothem) {
		const ax = Math.abs(x), ay = Math.abs(y);
		return ax <= apothem && ax * .5 + ay * (Math.sqrt(3) / 2) <= apothem;
	}
	/** Function telling whether (x, y) is inside the open aperture. */
	function pupilInside(spec) {
		if (spec.kind === "circular") return (x, y) => x * x + y * y <= .25;
		if (spec.kind === "obscured") {
			const ro = spec.obscuration / 2;
			return (x, y) => {
				const r2 = x * x + y * y;
				return r2 <= .25 && r2 >= ro * ro && !onSpider(x, y, spec.spiders, spec.spiderWidth, Math.PI / 4);
			};
		}
		const { centres, pitch } = hexLayout(spec.rings, spec.obscuration > 0);
		const apothem = pitch * (1 - spec.gap) / 2;
		return (x, y) => {
			for (const [cx, cy] of centres) if (Math.abs(x - cx) <= apothem && insideHex(x - cx, y - cy, apothem)) return true;
			return false;
		};
	}
	var pupilCache = /* @__PURE__ */ new Map();
	function makePupil(spec, n) {
		const k = JSON.stringify([spec, n]);
		const hit = pupilCache.get(k);
		if (hit) return hit;
		const p = rasterize(n, pupilInside(spec));
		if (pupilCache.size > 16) pupilCache.delete(pupilCache.keys().next().value);
		pupilCache.set(k, p);
		return p;
	}
	/**
	* Lyot stop: a scaled-down copy of the pupil outline (circle for segmented pupils), oversized obstruction
	* and vanes, on an m×m grid with n samples per D.
	*/
	function makeLyotStop(pupil, stop, n, m = n) {
		const k = JSON.stringify([
			"lyot",
			pupil,
			stop,
			n,
			m
		]);
		const hit = pupilCache.get(k);
		if (hit) return hit;
		const rOut = stop.outer / 2 * (pupil.kind === "segmented" ? Math.sqrt(3) / 2 : 1);
		const rIn = stop.inner / 2;
		const vanes = pupil.kind === "obscured" ? pupil.spiders : 0;
		const p = rasterize(n, (x, y) => {
			const r2 = x * x + y * y;
			return r2 <= rOut * rOut && r2 >= rIn * rIn && !(vanes > 0 && onSpider(x, y, vanes, stop.spiderWidth, Math.PI / 4));
		}, 4, m);
		pupilCache.set(k, p);
		return p;
	}
	// src/lib/coronagraph.ts
	/**
	* The coronagraphs: each is described by the elements it puts in the beam (apodizer or phase plate in
	* plane A, focal-plane mask in plane B, Lyot stop in plane C) and by how light goes from A to C.
	*/
	var CORONAGRAPH_KINDS = [
		"none",
		"lyot",
		"aplc",
		"bandlimited",
		"shaped",
		"roddier",
		"fqpm",
		"vortex",
		"app"
	];
	var DEFAULT_CORONAGRAPH = {
		kind: "vortex",
		maskRadius: 2.5,
		lyotOuter: .95,
		lyotInner: 0,
		blEpsilon: .2,
		charge: 2,
		shapedBand: 4,
		shapedOpenings: 4,
		appIwa: 2.5,
		appOwa: 10,
		appVector: false,
		vappChannel: "left",
		vappLeakage: .01
	};
	/** Default Lyot stop for each coronagraph (outer diameter as a fraction of D). */
	var DEFAULT_LYOT_OUTER = {
		none: 1,
		lyot: .8,
		aplc: 1,
		bandlimited: 1,
		shaped: 1,
		roddier: .9,
		fqpm: .95,
		vortex: .95,
		app: 1
	};
	function lyotPadding(n) {
		return 2 * Math.round(n / 16);
	}
	/** Erode a transmission map along x by ±halfWidth (fraction of D): the band-limited Lyot stop. */
	function erodeX(map, n, perD, halfWidth) {
		const h = Math.round(halfWidth * perD);
		const out = new Float64Array(n * n);
		for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
			let m = 1;
			for (let s = -h; s <= h; s++) {
				const xx = x + s;
				m = Math.min(m, xx < 0 || xx >= n ? 0 : map[y * n + xx]);
				if (m === 0) break;
			}
			out[y * n + x] = m;
		}
		return out;
	}
	/** Band-limited mask, applied as its exact pupil-plane equivalent: E_C = E − E ⊛ K, K a unit-area triangle in x. */
	function bandLimitedPropagate(E, nC, perD, eps) {
		const half = Math.max(1, Math.round(eps * perD));
		const w = new Float64Array(2 * half + 1);
		let s = 0;
		for (let k = -half; k <= half; k++) {
			w[k + half] = 1 - Math.abs(k) / (half + 1);
			s += w[k + half];
		}
		for (let k = 0; k < w.length; k++) w[k] /= s;
		const big = embed(E, nC);
		const out = cloneField(big);
		for (let y = 0; y < nC; y++) for (let x = 0; x < nC; x++) {
			let cr = 0, ci = 0;
			for (let k = -half; k <= half; k++) {
				const xx = x - k;
				if (xx < 0 || xx >= nC) continue;
				cr += w[k + half] * big.re[y * nC + xx];
				ci += w[k + half] * big.im[y * nC + xx];
			}
			out.re[y * nC + x] -= cr;
			out.im[y * nC + x] -= ci;
		}
		return out;
	}
	/** Band-limited amplitude transmission: m(u) = 1 − sinc²(π ε u), the Fourier transform of δ − triangle. */
	function bandLimitedMask(eps) {
		return (u) => {
			const a = Math.PI * eps * u;
			const sinc = a === 0 ? 1 : Math.sin(a) / a;
			return [1 - sinc * sinc, 0];
		};
	}
	function vortexMask(charge) {
		return (u, v) => {
			const t = charge * Math.atan2(v, u);
			return [Math.cos(t), Math.sin(t)];
		};
	}
	var fqpmMask = (u, v) => [Math.sign(u) * Math.sign(v) || 1, 0];
	function buildCoronagraph(spec, pupilSpec, n) {
		const pupil = makePupil(pupilSpec, n);
		const nC = n + 2 * lyotPadding(n);
		const pkey = JSON.stringify(pupilSpec);
		const xA = pupilCoords(n);
		const xC = pupilCoords(nC, n);
		const inner = pupilSpec.kind === "circular" ? spec.lyotInner : Math.max(spec.lyotInner, pupilSpec.kind === "obscured" ? pupilSpec.obscuration * 1.1 : spec.lyotInner);
		const stop = () => makeLyotStop(pupilSpec, {
			outer: spec.lyotOuter,
			inner,
			spiderWidth: pupilSpec.spiderWidth * 2
		}, n, nC);
		const none = (E) => embed(E, nC);
		const base = {
			spec,
			n,
			nC,
			pupil,
			apodizer: null,
			phasePlate: null,
			lyot: null,
			mask: null,
			info: {},
			toLyotGrid: null
		};
		const bab = (d) => (E, s, xs, ys) => babinetGrid(E, xA, xs, ys, r, d, s);
		const msc = (m) => (E, s, xs, ys) => multiscaleGrid(E, xA, xs, ys, m, s);
		const r = spec.maskRadius;
		const occ = (u, v) => u * u + v * v <= r * r ? [-1, 0] : [0, 0];
		switch (spec.kind) {
			case "none": return {
				...base,
				toLyot: none
			};
			case "lyot": return {
				...base,
				lyot: stop(),
				mask: (u, v) => u * u + v * v <= r * r ? [0, 0] : [1, 0],
				toLyot: (E, s, m) => m ? babinetPropagate(E, xA, xC, r, occ, s) : none(E),
				toLyotGrid: bab(occ)
			};
			case "aplc": {
				const d = aplcApodizer(pupil, n, r, pkey);
				return {
					...base,
					apodizer: d.apodizer,
					lyot: stop(),
					mask: (u, v) => u * u + v * v <= r * r ? [0, 0] : [1, 0],
					info: { eigenvalue: d.eigenvalue },
					toLyotGrid: bab(occ),
					toLyot: (E, s, m) => m ? babinetPropagate(E, xA, xC, r, occ, s) : none(E)
				};
			}
			case "roddier": {
				const rod = (u, v) => u * u + v * v <= r * r ? [-2, 0] : [0, 0];
				return {
					...base,
					lyot: stop(),
					mask: (u, v) => u * u + v * v <= r * r ? [-1, 0] : [1, 0],
					toLyot: (E, s, m) => m ? babinetPropagate(E, xA, xC, r, rod, s) : none(E),
					toLyotGrid: bab(rod)
				};
			}
			case "bandlimited": {
				const eps = spec.blEpsilon;
				const padded = embed({
					n,
					re: pupil,
					im: new Float64Array(n * n)
				}, nC).re;
				const circle = makeLyotStop({
					...pupilSpec,
					kind: "circular"
				}, {
					outer: spec.lyotOuter,
					inner: 0,
					spiderWidth: 0
				}, n, nC);
				const lyot = erodeX(padded.map((v) => v > .99 ? 1 : 0), nC, n, eps).map((v, i) => v * circle[i]);
				return {
					...base,
					lyot,
					mask: bandLimitedMask(eps),
					info: { kernelHalfWidth: eps },
					toLyot: (E, s, m) => m ? bandLimitedPropagate(E, nC, n, eps / s) : none(E)
				};
			}
			case "shaped": return {
				...base,
				apodizer: shapedPupil(pupil, n, spec.shapedBand, spec.shapedOpenings, pkey),
				toLyot: none
			};
			case "fqpm": return {
				...base,
				lyot: stop(),
				mask: fqpmMask,
				toLyot: (E, s, m) => m ? multiscalePropagate(E, xA, xC, fqpmMask, s) : none(E),
				toLyotGrid: msc(fqpmMask)
			};
			case "vortex": {
				const vm = vortexMask(spec.charge);
				return {
					...base,
					lyot: stop(),
					mask: vm,
					toLyot: (E, s, m) => m ? multiscalePropagate(E, xA, xC, vm, s) : none(E),
					toLyotGrid: msc(vm)
				};
			}
			case "app": return {
				...base,
				phasePlate: appPhase(pupil, n, spec.appIwa, spec.appOwa, pkey),
				toLyot: none
			};
		}
	}
	/** Plane A: pupil field after the apodizer or phase plate. `channel` = ±1 picks the vAPP phase sign. */
	function applyPlaneA(c, E, scale, channel = 1) {
		const out = cloneField(E);
		if (c.apodizer) for (let i = 0; i < out.re.length; i++) {
			out.re[i] *= c.apodizer[i];
			out.im[i] *= c.apodizer[i];
		}
		if (c.phasePlate) {
			const k = c.spec.appVector ? channel : scale;
			for (let i = 0; i < out.re.length; i++) {
				const p = k * c.phasePlate[i];
				const cs = Math.cos(p), sn = Math.sin(p);
				const r = out.re[i] * cs - out.im[i] * sn;
				out.im[i] = out.re[i] * sn + out.im[i] * cs;
				out.re[i] = r;
			}
		}
		return out;
	}
	/** Plane C after the Lyot stop. */
	function applyLyot(c, EC) {
		if (!c.lyot) return EC;
		const out = cloneField(EC);
		for (let i = 0; i < out.re.length; i++) {
			out.re[i] *= c.lyot[i];
			out.im[i] *= c.lyot[i];
		}
		return out;
	}
	// src/lib/rng.ts
	/** Small seeded random number generators so that every random draw is reproducible. */
	/** Mulberry32: a fast 32-bit generator returning uniform numbers in [0, 1). */
	function mulberry32(seed) {
		let a = seed >>> 0;
		return () => {
			a = a + 1831565813 >>> 0;
			let t = a;
			t = Math.imul(t ^ t >>> 15, t | 1);
			t ^= t + Math.imul(t ^ t >>> 7, t | 61);
			return ((t ^ t >>> 14) >>> 0) / 4294967296;
		};
	}
	/** Standard normal deviates by the Box–Muller transform. */
	function gaussian(rand) {
		let spare = null;
		return () => {
			if (spare !== null) {
				const s = spare;
				spare = null;
				return s;
			}
			let u = 0;
			while (u <= 1e-300) u = rand();
			const v = rand();
			const r = Math.sqrt(-2 * Math.log(u));
			spare = r * Math.sin(2 * Math.PI * v);
			return r * Math.cos(2 * Math.PI * v);
		};
	}
	/** Poisson deviate (Knuth for small means, normal approximation above 50). */
	function poisson(mean, rand, gauss) {
		if (mean <= 0) return 0;
		if (mean > 50) return Math.max(0, Math.round(mean + Math.sqrt(mean) * gauss()));
		const l = Math.exp(-mean);
		let k = 0, p = 1;
		do {
			k++;
			p *= rand();
		} while (p > l);
		return k - 1;
	}
	// src/lib/screens.ts
	/**
	* Random wavefront and amplitude errors with a power-law power spectral density PSD(f) ∝ f^(−α),
	* the usual description of polishing errors (α ≈ 2–3) or of turbulence (α = 11/3).
	* Generated by filtering white noise in the Fourier domain on a 2n grid, then cropped to n×n
	* so that the screen is not periodic across the pupil.
	*/
	/** Remove the mean over the pupil and scale to the requested RMS over the pupil (weights = pupil transmission). */
	function normaliseOverPupil(map, pupil, rms) {
		let w = 0, s = 0;
		for (let i = 0; i < map.length; i++) {
			w += pupil[i];
			s += pupil[i] * map[i];
		}
		const mean = w > 0 ? s / w : 0;
		let v = 0;
		for (let i = 0; i < map.length; i++) {
			map[i] -= mean;
			v += pupil[i] * map[i] * map[i];
		}
		const cur = w > 0 ? Math.sqrt(v / w) : 0;
		const k = cur > 0 ? rms / cur : 0;
		for (let i = 0; i < map.length; i++) map[i] *= k;
		return map;
	}
	var cache$1 = /* @__PURE__ */ new Map();
	/** Unit-RMS screen (before normalisation over a pupil) with PSD ∝ f^(−slope), seeded. */
	function powerLawScreen(n, slope, seed) {
		const k = `${n}:${slope}:${seed}`;
		const hit = cache$1.get(k);
		if (hit) return hit;
		const m = 2 * n;
		const g = gaussian(mulberry32(seed));
		const re = new Float64Array(m * m);
		const im = new Float64Array(m * m);
		for (let y = 0; y < m; y++) {
			const fy = y < m / 2 ? y : y - m;
			for (let x = 0; x < m; x++) {
				const fx = x < m / 2 ? x : x - m;
				const f = Math.hypot(fx, fy);
				const amp = f === 0 ? 0 : f ** (-slope / 2);
				re[y * m + x] = amp * g();
				im[y * m + x] = amp * g();
			}
		}
		fft2d(re, im, m, true);
		const out = new Float64Array(n * n);
		for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out[y * n + x] = re[(y + n / 2) * m + x + n / 2];
		if (cache$1.size > 16) cache$1.delete(cache$1.keys().next().value);
		cache$1.set(k, out);
		return out;
	}
	// src/lib/zernike.ts
	/**
	* Zernike polynomials with Noll's ordering and normalisation (Noll 1976, J. Opt. Soc. Am. 66, 207):
	* each mode has unit RMS over the unit disk, so a coefficient is directly the RMS wavefront error of that mode.
	*/
	/** Noll index j (≥ 1) → radial order n and signed azimuthal frequency m. */
	function nollToNM(j) {
		if (!Number.isInteger(j) || j < 1) throw new RangeError(`Noll index must be a positive integer, got ${j}`);
		let n = 0;
		while ((n + 1) * (n + 2) / 2 < j) n++;
		const k = j - n * (n + 1) / 2 - 1;
		let m = n % 2 === 0 ? 2 * Math.floor((k + 1) / 2) : 2 * Math.floor(k / 2) + 1;
		if (m !== 0 && j % 2 === 1) m = -m;
		return {
			n,
			m
		};
	}
	function factorial(k) {
		let f = 1;
		for (let i = 2; i <= k; i++) f *= i;
		return f;
	}
	/** Radial polynomial R_n^|m|(ρ). */
	function radial(n, m, rho) {
		const am = Math.abs(m);
		let s = 0;
		for (let k = 0; k <= (n - am) / 2; k++) s += (k % 2 ? -1 : 1) * factorial(n - k) / (factorial(k) * factorial((n + am) / 2 - k) * factorial((n - am) / 2 - k)) * rho ** (n - 2 * k);
		return s;
	}
	/** Value of Noll mode j at polar coordinates (ρ ≤ 1, θ). Zero outside the unit disk. */
	function zernike(j, rho, theta) {
		if (rho > 1) return 0;
		const { n, m } = nollToNM(j);
		const r = radial(n, m, rho);
		if (m === 0) return Math.sqrt(n + 1) * r;
		const norm = Math.sqrt(2 * (n + 1));
		return m > 0 ? norm * r * Math.cos(m * theta) : norm * r * Math.sin(-m * theta);
	}
	var modeCache = /* @__PURE__ */ new Map();
	/** Map of Noll mode j on an n×n pupil grid (unit disk = telescope diameter D). */
	function zernikeMap(j, n) {
		const k = `${j}:${n}`;
		const hit = modeCache.get(k);
		if (hit) return hit;
		const out = new Float64Array(n * n);
		for (let y = 0; y < n; y++) {
			const yy = 2 * (y - (n - 1) / 2) / n;
			for (let x = 0; x < n; x++) {
				const xx = 2 * (x - (n - 1) / 2) / n;
				out[y * n + x] = zernike(j, Math.hypot(xx, yy), Math.atan2(yy, xx));
			}
		}
		modeCache.set(k, out);
		return out;
	}
	// src/lib/optics.ts
	/**
	* The telescope and its errors: aberrations as an optical path difference (OPD, nm) and amplitude errors,
	* for the science arm or the wavefront-sensor arm (they differ by the non-common-path aberrations).
	*/
	var NO_ABERRATIONS = {
		zernikeNm: [
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0
		],
		screenRmsNm: 0,
		screenSlope: 2.5,
		screenSeed: 1,
		amplitudeRms: 0,
		amplitudeSeed: 2,
		ncpaZernikeNm: [
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0
		],
		ncpaRmsNm: 0,
		ncpaSeed: 3
	};
	function addZernikes(opd, n, coeffs) {
		coeffs.forEach((c, k) => {
			if (!c) return;
			const z = zernikeMap(k + 2, n);
			for (let i = 0; i < opd.length; i++) opd[i] += c * z[i];
		});
	}
	/** Common-path aberration OPD plus, for the science arm, the non-common-path aberrations (nm). */
	function aberrationOpd(spec, pupil, n, arm) {
		const opd = new Float64Array(n * n);
		addZernikes(opd, n, spec.zernikeNm);
		if (spec.screenRmsNm > 0) {
			const s = normaliseOverPupil(powerLawScreen(n, spec.screenSlope, spec.screenSeed).slice(), pupil, spec.screenRmsNm);
			for (let i = 0; i < opd.length; i++) opd[i] += s[i];
		}
		if (arm === "science") {
			addZernikes(opd, n, spec.ncpaZernikeNm);
			if (spec.ncpaRmsNm > 0) {
				const s = normaliseOverPupil(powerLawScreen(n, 2.5, spec.ncpaSeed).slice(), pupil, spec.ncpaRmsNm);
				for (let i = 0; i < opd.length; i++) opd[i] += s[i];
			}
		}
		return opd;
	}
	/** Pupil amplitude including the amplitude errors: A = P · (1 + δ), δ with the requested RMS. */
	function pupilAmplitude(spec, pupil, n) {
		if (spec.amplitudeRms <= 0) return pupil;
		const s = normaliseOverPupil(powerLawScreen(n, 2, spec.amplitudeSeed).slice(), pupil, spec.amplitudeRms);
		return pupil.map((p, i) => Math.max(0, p * (1 + s[i])));
	}
	/**
	* Entrance field at wavelength λ: A · exp(i 2π OPD/λ) · exp(i 2π (u x + v y) λ0/λ),
	* for a source at (u, v) λ0/D from the axis.
	*/
	function entranceField(amp, opdNm, n, wavelengthNm, scale, u = 0, v = 0) {
		const f = makeField(n);
		const x = pupilCoords(n);
		const k = 2 * Math.PI / wavelengthNm;
		for (let yy = 0; yy < n; yy++) for (let xx = 0; xx < n; xx++) {
			const i = yy * n + xx;
			if (amp[i] === 0) continue;
			const ph = k * opdNm[i] + 2 * Math.PI * scale * (u * x[xx] + v * x[yy]);
			f.re[i] = amp[i] * Math.cos(ph);
			f.im[i] = amp[i] * Math.sin(ph);
		}
		return f;
	}
	/** Weighted RMS of an OPD map over the pupil (piston removed), nm. */
	function rmsOverPupil(opd, pupil) {
		let w = 0, s = 0, s2 = 0;
		for (let i = 0; i < opd.length; i++) {
			w += pupil[i];
			s += pupil[i] * opd[i];
			s2 += pupil[i] * opd[i] * opd[i];
		}
		if (w === 0) return 0;
		const m = s / w;
		return Math.sqrt(Math.max(0, s2 / w - m * m));
	}
	// src/lib/config.ts
	/**
	* The complete, serialisable state of the lab (what the page sends to the worker), with its defaults.
	*/
	var DEFAULT_CONFIG = {
		npup: 64,
		fov: 14,
		wavelengthNm: 1600,
		bandwidth: 0,
		nLambda: 1,
		pupil: {
			...DEFAULT_PUPIL,
			kind: "circular"
		},
		coronagraph: DEFAULT_CORONAGRAPH,
		aberrations: {
			...NO_ABERRATIONS,
			zernikeNm: [
				0,
				0,
				4,
				-3,
				0,
				2,
				0,
				0,
				0,
				0
			],
			screenRmsNm: 8,
			screenSlope: 2.5
		},
		planets: [{
			sep: 5,
			pa: 30,
			contrast: 1e-5
		}],
		dm: {
			nact: 16,
			coupling: .15
		},
		detector: {
			noise: false,
			peakPhotons: 1e9,
			readNoise: 3,
			seed: 11
		},
		wfs: {
			kind: "shack-hartmann",
			nsub: 8,
			modulation: 3,
			curvatureDistance: .05,
			modes: 30
		},
		control: {
			kind: "ao",
			gain: .5,
			estimator: "pairwise",
			iwa: 3,
			owa: 7,
			half: true,
			alpha: .001
		}
	};
	function systemSpec(c) {
		return {
			npup: c.npup,
			q: 4,
			fov: c.fov,
			wavelengthNm: c.wavelengthNm,
			bandwidth: c.bandwidth,
			nLambda: c.bandwidth > 0 ? c.nLambda : 1,
			pupil: c.pupil,
			coronagraph: c.coronagraph,
			aberrations: c.aberrations
		};
	}
	/** Coronagraphs whose Lyot stop receives starlight outside the pupil, as the self-coherent camera requires. */
	function sccCompatible(c) {
		return [
			"lyot",
			"aplc",
			"roddier",
			"fqpm",
			"vortex"
		].includes(c.kind);
	}
	// src/lib/dm.ts
	/**
	* Deformable mirror: an N×N grid of actuators across the pupil with Gaussian influence functions,
	*   h_k(x, y) = exp[ ln(c) · ((x − x_k)² + (y − y_k)²) / p² ],
	* where p = D/N is the actuator pitch and c the coupling (the response at the neighbouring actuator).
	* Commands and the resulting surface are expressed directly as wavefront optical path difference (nm),
	* i.e. the factor of 2 of a reflection is included in the command.
	* An N-actuator mirror controls spatial frequencies up to N/2 cycles per pupil, i.e. a dark hole out to N/2 λ/D.
	*/
	var cache = /* @__PURE__ */ new Map();
	function makeDm(spec, n) {
		const key = `${spec.nact}:${spec.coupling}:${n}`;
		const hit = cache.get(key);
		if (hit) return hit;
		const N = spec.nact;
		const pitch = 1 / N;
		const lnc = Math.log(spec.coupling);
		const reach = pitch * Math.sqrt(Math.log(1e-4) / lnc);
		const ax = new Float64Array(N * N), ay = new Float64Array(N * N);
		const idx = [], val = [];
		for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
			const k = j * N + i;
			ax[k] = (i - (N - 1) / 2) * pitch;
			ay[k] = (j - (N - 1) / 2) * pitch;
			const ids = [], vs = [];
			for (let y = 0; y < n; y++) {
				const yy = (y - (n - 1) / 2) / n - ay[k];
				if (Math.abs(yy) > reach) continue;
				for (let x = 0; x < n; x++) {
					const xx = (x - (n - 1) / 2) / n - ax[k];
					const r2 = xx * xx + yy * yy;
					if (r2 > reach * reach) continue;
					ids.push(y * n + x);
					vs.push(Math.exp(lnc * r2 / (pitch * pitch)));
				}
			}
			idx.push(Int32Array.from(ids));
			val.push(Float64Array.from(vs));
		}
		const dm = {
			spec,
			n,
			ax,
			ay,
			idx,
			val
		};
		cache.set(key, dm);
		return dm;
	}
	/** Wavefront OPD map (nm) produced by the actuator commands (nm). */
	function dmSurface(dm, commandsNm) {
		const out = new Float64Array(dm.n * dm.n);
		for (let k = 0; k < dm.idx.length; k++) {
			const a = commandsNm[k];
			if (!a) continue;
			const ids = dm.idx[k], vs = dm.val[k];
			for (let t = 0; t < ids.length; t++) out[ids[t]] += a * vs[t];
		}
		return out;
	}
	/**
	* Least-squares fitter of DM commands to target OPD maps over the pupil (normal equations, factorised once).
	* Returns a function mapping a target OPD (nm) to the full actuator command vector (nm).
	*/
	function dmFitter(dm, pupil, active) {
		const m = active.length;
		const A = new Float64Array(m * m);
		const dense = active.map((k) => {
			const ids = [], ws = [];
			for (let t = 0; t < dm.idx[k].length; t++) {
				const i = dm.idx[k][t];
				if (pupil[i] > 0) {
					ids.push(i);
					ws.push(dm.val[k][t] * pupil[i]);
				}
			}
			return {
				ids: Int32Array.from(ids),
				ws: Float64Array.from(ws)
			};
		});
		const tmp = new Float64Array(dm.n * dm.n);
		for (let a = 0; a < m; a++) {
			const da = dense[a];
			for (let t = 0; t < da.ids.length; t++) tmp[da.ids[t]] = da.ws[t];
			for (let c = a; c < m; c++) {
				const dc = dense[c];
				let s = 0;
				for (let t = 0; t < dc.ids.length; t++) s += tmp[dc.ids[t]] * dc.ws[t];
				A[a * m + c] = s;
				A[c * m + a] = s;
			}
			for (let t = 0; t < da.ids.length; t++) tmp[da.ids[t]] = 0;
		}
		for (let a = 0; a < m; a++) A[a * m + a] += 1e-6 * A[a * m + a] + 1e-12;
		const solve = choleskySolver(A, m);
		return (target) => {
			const b = new Float64Array(m);
			for (let a = 0; a < m; a++) {
				const d = dense[a];
				let s = 0;
				for (let t = 0; t < d.ids.length; t++) s += d.ws[t] * target[d.ids[t]];
				b[a] = s;
			}
			const x = solve(b);
			const out = new Float64Array(dm.idx.length);
			active.forEach((k, a) => {
				out[k] = x[a];
			});
			return out;
		};
	}
	/** Actuators whose centre lies within the pupil radius plus half a pitch. */
	function activeActuators(dm, margin = .5) {
		const r = .5 + margin / dm.spec.nact;
		const out = [];
		for (let k = 0; k < dm.ax.length; k++) if (Math.hypot(dm.ax[k], dm.ay[k]) <= r) out.push(k);
		return out;
	}
	// src/lib/train.ts
	/**
	* The full optical train of the science arm:
	*   star / planets → pupil (aberrations, DM) → A: apodizer / phase plate → B: focal mask → C: Lyot stop → D: detector.
	* Images are normalised to the peak of the off-axis PSF of the same instrument without its focal-plane mask
	* and without aberrations ("raw contrast" units), so a perfect off-axis source peaks at 1.
	*/
	/** Wavelength samples (nm) and their scale factors λ0/λ, uniformly spread over the band. */
	function wavelengths(s) {
		const k = s.bandwidth > 0 ? Math.max(1, s.nLambda) : 1;
		const lam = [];
		for (let i = 0; i < k; i++) lam.push(s.wavelengthNm * (1 + (k === 1 ? 0 : s.bandwidth * (i / (k - 1) - .5))));
		return {
			lam,
			scale: lam.map((l) => s.wavelengthNm / l)
		};
	}
	function detectorCoords(s) {
		return focalCoords(2 * Math.round(s.fov * s.q) + 1, s.q);
	}
	/**
	* Detector field from a pupil-plane field sampled with n samples per D: u0 in λ0/D becomes u0·λ0/λ in λ/D
	* at the current wavelength.
	*/
	function toDetector(EC, n, u0, scale) {
		const xC = pupilCoords(EC.n, n);
		const u = u0.map((v) => v * scale);
		const g = mftGeneral(EC.re, EC.im, xC, u, u, -1, 1 / (n * n));
		return {
			n: u.length,
			re: g.re,
			im: g.im
		};
	}
	function buildOptics(spec) {
		const n = spec.npup;
		const pupil = makePupil(spec.pupil, n);
		const cor = buildCoronagraph(spec.coronagraph, spec.pupil, n);
		const amp = pupilAmplitude(spec.aberrations, pupil, n);
		const opdScience = aberrationOpd(spec.aberrations, pupil, n, "science");
		const opdWfs = aberrationOpd(spec.aberrations, pupil, n, "wfs");
		const u0 = detectorCoords(spec);
		const { lam, scale } = wavelengths(spec);
		let refPeak = 0;
		const flat = new Float64Array(n * n);
		for (let i = 0; i < lam.length; i++) for (const ch of channels(cor)) {
			const E = lyotOut(cor, entranceField(pupil, flat, n, lam[i], scale[i]), scale[i], false, ch.sign);
			let sr = 0, si = 0;
			for (let j = 0; j < E.re.length; j++) {
				sr += E.re[j];
				si += E.im[j];
			}
			const dx = 1 / n;
			refPeak += ch.weight * scale[i] * scale[i] * (sr * sr + si * si) * dx ** 4 / lam.length;
		}
		return {
			spec,
			cor,
			pupil,
			amp,
			opdScience,
			opdWfs,
			u0,
			refPeak
		};
	}
	/** The polarisation channels of a vAPP (two signs of the geometric phase), or a single channel otherwise. */
	function channels(cor) {
		if (!cor.phasePlate || !cor.spec.appVector) return [{
			sign: 1,
			weight: 1
		}];
		const leak = cor.spec.vappLeakage;
		if (cor.spec.vappChannel === "left") return [{
			sign: 1,
			weight: 1 - leak
		}];
		if (cor.spec.vappChannel === "right") return [{
			sign: -1,
			weight: 1 - leak
		}];
		return [{
			sign: 1,
			weight: (1 - leak) / 2
		}, {
			sign: -1,
			weight: (1 - leak) / 2
		}];
	}
	/** Plane A → C after the Lyot stop. */
	function lyotOut(cor, E, scale, withMask, sign = 1) {
		return applyLyot(cor, cor.toLyot(applyPlaneA(cor, E, scale, sign), scale, withMask));
	}
	/** Sum of the vAPP leakage term: a fraction of light that sees no phase plate. */
	function leakage(cor) {
		return cor.phasePlate && cor.spec.appVector ? cor.spec.vappLeakage : 0;
	}
	/**
	* Normalised detector intensity of a point source at (u, v) λ0/D with the given DM OPD (nm, may be null).
	*/
	function sourceImage(o, dmOpd, u = 0, v = 0, withMask = true, arm = "science") {
		const n = o.spec.npup;
		const { lam, scale } = wavelengths(o.spec);
		const opd = (arm === "science" ? o.opdScience : o.opdWfs).slice();
		if (dmOpd) for (let i = 0; i < opd.length; i++) opd[i] += dmOpd[i];
		const m = o.u0.length;
		const img = new Float64Array(m * m);
		const leak = leakage(o.cor);
		for (let i = 0; i < lam.length; i++) {
			const EA = entranceField(o.amp, opd, n, lam[i], scale[i], u, v);
			const w = scale[i] * scale[i] / lam.length / o.refPeak;
			for (const ch of channels(o.cor)) {
				const D = toDetector(lyotOut(o.cor, EA, scale[i], withMask, ch.sign), n, o.u0, scale[i]);
				for (let j = 0; j < img.length; j++) img[j] += ch.weight * w * (D.re[j] * D.re[j] + D.im[j] * D.im[j]);
			}
			if (leak > 0) {
				const D = toDetector(lyotOut({
					...o.cor,
					phasePlate: null
				}, EA, scale[i], withMask), n, o.u0, scale[i]);
				for (let j = 0; j < img.length; j++) img[j] += leak * w * (D.re[j] * D.re[j] + D.im[j] * D.im[j]);
			}
		}
		return img;
	}
	// src/lib/metrics.ts
	/** The part of the focal plane each design is meant to darken (all of an annulus for symmetric designs). */
	function darkZone(spec, inner, outer) {
		switch (spec.kind) {
			case "shaped": {
				const t = Math.tan(25 * Math.PI / 180);
				return (u, v) => {
					const r = Math.hypot(u, v);
					return r >= inner && r <= outer && Math.abs(v) <= t * Math.abs(u);
				};
			}
			case "app": {
				if (spec.appVector && spec.vappChannel === "sum") return (u, v) => {
					const r = Math.hypot(u, v);
					return r >= inner && r <= outer;
				};
				const side = spec.appVector && spec.vappChannel === "right" ? -1 : 1;
				return (u, v) => appRegion(side * u, v, Math.max(inner, spec.appIwa), Math.min(outer, spec.appOwa));
			}
			default: return (u, v) => {
				const r = Math.hypot(u, v);
				return r >= inner && r <= outer;
			};
		}
	}
	/**
	* Position angle (degrees) along which planets are placed for the throughput curve: +x, except 45° for the
	* four-quadrant mask (whose phase transitions lie along the axes) and 180° for the mirrored vAPP channel.
	*/
	function darkAxisPa(spec) {
		if (spec.kind === "fqpm") return 45;
		return spec.kind === "app" && spec.appVector && spec.vappChannel === "right" ? 180 : 0;
	}
	/**
	* Designs without a focal-plane mask do not dim off-axis sources: their inner working angle is the inner edge
	* of the dark zone they create. Returns NaN when the design has no dark zone (bare telescope).
	*/
	function designIwa(spec) {
		if (spec.kind === "shaped") return spec.shapedBand;
		if (spec.kind === "app") return spec.appIwa;
		return NaN;
	}
	/** Mean of a square image (coords u0 on both axes) in annuli of width `bin`, restricted to `zone`. */
	function radialProfile(img, u0, bin, zone) {
		const m = u0.length;
		const rmax = Math.abs(u0[0]);
		const nb = Math.floor(rmax / bin);
		const s = new Float64Array(nb), c = new Float64Array(nb);
		for (let l = 0; l < m; l++) for (let k = 0; k < m; k++) {
			const u = u0[k], v = u0[l];
			if (zone && !zone(u, v)) continue;
			const b = Math.floor(Math.hypot(u, v) / bin);
			if (b < nb) {
				s[b] += img[l * m + k];
				c[b]++;
			}
		}
		const r = [], value = [];
		for (let b = 0; b < nb; b++) if (c[b] > 0) {
			r.push((b + .5) * bin);
			value.push(s[b] / c[b]);
		}
		return {
			r,
			value
		};
	}
	function meanInRegion(img, u0, zone) {
		const m = u0.length;
		let s = 0, c = 0;
		for (let l = 0; l < m; l++) for (let k = 0; k < m; k++) if (zone(u0[k], u0[l])) {
			s += img[l * m + k];
			c++;
		}
		return c ? s / c : NaN;
	}
	/**
	* Energy of a point source at (u, v) λ0/D inside a circle of radius `aperture` (λ0/D) centred on the source,
	* computed on a fine local grid. `withCoronagraph` false gives the bare telescope (no apodizer, mask or stop).
	*/
	function coreEnergy(o, u, v, aperture, withCoronagraph) {
		const n = o.spec.npup;
		const q = 8;
		const loc = focalCoords(2 * Math.ceil(aperture * q) + 1, q);
		const { lam, scale } = wavelengths(o.spec);
		const flat = new Float64Array(n * n);
		let e = 0;
		for (let i = 0; i < lam.length; i++) {
			const EA = entranceField(o.pupil, flat, n, lam[i], scale[i], u, v);
			const parts = withCoronagraph ? channels(o.cor).map((ch) => ({
				w: ch.weight,
				E: lyotOut(o.cor, EA, scale[i], true, ch.sign)
			})) : [{
				w: 1,
				E: EA
			}];
			for (const p of parts) {
				const x = pupilCoords(p.E.n, n);
				const ux = loc.map((t) => (t + u) * scale[i]), vy = loc.map((t) => (t + v) * scale[i]);
				const g = mftGeneral(p.E.re, p.E.im, x, ux, vy, -1, 1 / (n * n));
				for (let l = 0; l < loc.length; l++) for (let k = 0; k < loc.length; k++) {
					if (Math.hypot(loc[k], loc[l]) > aperture) continue;
					const j = l * loc.length + k;
					e += p.w * scale[i] * scale[i] * (g.re[j] ** 2 + g.im[j] ** 2) / 64 / lam.length;
				}
			}
		}
		return e;
	}
	/** Core throughput (aperture radius 0.7 λ0/D) relative to the bare telescope, along the dark axis. */
	function throughputCurve(o, seps) {
		const pa = darkAxisPa(o.cor.spec) * Math.PI / 180;
		const ref = coreEnergy(o, 0, 0, .7, false);
		const value = seps.map((s) => coreEnergy(o, s * Math.cos(pa), s * Math.sin(pa), .7, true) / ref);
		return {
			r: [...seps],
			value
		};
	}
	/**
	* Inner working angle: the smallest separation where the throughput reaches half of its maximum.
	* NaN if the throughput never varies (no focal-plane mask): use designIwa then.
	*/
	function innerWorkingAngle(t) {
		const max = Math.max(...t.value);
		if (Math.min(...t.value) > .95 * max) return NaN;
		for (let i = 0; i < t.r.length; i++) if (t.value[i] >= .5 * max) {
			if (i === 0) return t.r[0];
			const f = (.5 * max - t.value[i - 1]) / (t.value[i] - t.value[i - 1]);
			return t.r[i - 1] + f * (t.r[i] - t.r[i - 1]);
		}
		return NaN;
	}
	// src/lib/planes.ts
	/**
	* Fields at every plane of the science arm for the on-axis star at λ0, for the thumbnails of the diagram:
	* A (entrance pupil, before/after apodizer or phase plate), B (focal plane, before/after the mask),
	* C (Lyot plane, before/after the stop) and D (detector).
	*/
	function img(w, data) {
		return {
			w,
			h: w,
			data: Float32Array.from(data)
		};
	}
	function ip(f, n, mask) {
		const I = new Float32Array(n * n), P = new Float32Array(n * n);
		for (let i = 0; i < n * n; i++) {
			I[i] = f.re[i] ** 2 + f.im[i] ** 2;
			P[i] = mask && !(mask[i] > 0) ? NaN : Math.atan2(f.im[i], f.re[i]);
		}
		return {
			intensity: {
				w: n,
				h: n,
				data: I
			},
			phase: {
				w: n,
				h: n,
				data: P
			}
		};
	}
	/** Half-width (λ0/D) of the focal-plane thumbnails: enough to show the mask and the first rings. */
	function focalHalfWidth(o) {
		const s = o.cor.spec;
		if (s.kind === "lyot" || s.kind === "aplc" || s.kind === "roddier") return Math.max(4, 2.5 * s.maskRadius);
		if (s.kind === "bandlimited") return Math.min(16, 2 / s.blEpsilon);
		return 6;
	}
	function tracePlanes(o, dmOpd) {
		const n = o.spec.npup;
		const opd = o.opdScience.map((v, i) => v + (dmOpd ? dmOpd[i] : 0));
		const E0 = entranceField(o.amp, opd, n, o.spec.wavelengthNm, 1);
		const sign = channels(o.cor)[0].sign;
		const EA = applyPlaneA(o.cor, E0, 1, sign);
		const A = {
			before: ip(E0, n, o.pupil),
			after: ip(EA, n, o.pupil),
			halfWidth: 0,
			element: o.cor.apodizer ? {
				amplitude: img(n, o.cor.apodizer),
				phase: img(n, new Float32Array(n * n))
			} : o.cor.phasePlate ? {
				amplitude: img(n, o.pupil),
				phase: img(n, o.cor.phasePlate.map((p, i) => o.pupil[i] > 0 ? sign * p : NaN))
			} : null
		};
		const H = focalHalfWidth(o);
		const m = 128;
		const u = focalCoords(m, m / (2 * H));
		const F = mftGeneral(EA.re, EA.im, pupilCoords(n), u, u, -1, 1 / (n * n));
		const maskAmp = /* @__PURE__ */ new Float32Array(16384), maskPh = /* @__PURE__ */ new Float32Array(16384);
		const after = {
			re: /* @__PURE__ */ new Float64Array(16384),
			im: /* @__PURE__ */ new Float64Array(16384)
		};
		for (let l = 0; l < m; l++) for (let k = 0; k < m; k++) {
			const i = l * m + k;
			const [mr, mi] = o.cor.mask ? o.cor.mask(u[k], u[l]) : [1, 0];
			maskAmp[i] = Math.hypot(mr, mi);
			maskPh[i] = Math.atan2(mi, mr);
			after.re[i] = F.re[i] * mr - F.im[i] * mi;
			after.im[i] = F.re[i] * mi + F.im[i] * mr;
		}
		const B = {
			before: ip(F, m),
			after: ip(after, m),
			halfWidth: H,
			element: o.cor.mask ? {
				amplitude: {
					w: m,
					h: m,
					data: maskAmp
				},
				phase: {
					w: m,
					h: m,
					data: maskPh
				}
			} : null
		};
		const EC = o.cor.toLyot(EA, 1, true);
		const ECs = applyLyot(o.cor, EC);
		const nC = EC.n;
		const C = {
			before: ip(EC, nC),
			after: ip(ECs, nC, o.cor.lyot ?? void 0),
			halfWidth: 0,
			element: o.cor.lyot ? {
				amplitude: img(nC, o.cor.lyot),
				phase: img(nC, new Float32Array(nC * nC))
			} : null
		};
		const D = toDetector(ECs, n, o.u0, 1);
		const k = 1 / Math.sqrt(o.refPeak);
		for (let i = 0; i < D.re.length; i++) {
			D.re[i] *= k;
			D.im[i] *= k;
		}
		return {
			A,
			B,
			C,
			D,
			dmOpd: img(n, dmOpd ? dmOpd.map((v, i) => o.pupil[i] > 0 ? v : NaN) : o.pupil.map((p) => p > 0 ? 0 : NaN))
		};
	}
	// src/lib/frame.ts
	/**
	* One frame of the lab: the science image (star + planets, optional noise), the plane thumbnails, the radial
	* contrast curve against the bare telescope, and the numeric readouts. Pure computation, run in the worker.
	*/
	/** Small keyed cache shared by the frame, the sensors and the loops. */
	var Memo = class {
		map = /* @__PURE__ */ new Map();
		size;
		constructor(size = 12) {
			this.size = size;
		}
		get(key, make) {
			if (this.map.has(key)) return this.map.get(key);
			const v = make();
			if (this.map.size >= this.size) this.map.delete(this.map.keys().next().value);
			this.map.set(key, v);
			return v;
		}
	};
	function opticsFor(c, memo) {
		const spec = systemSpec(c);
		return memo.get(`optics:${JSON.stringify(spec)}`, () => buildOptics(spec));
	}
	function dmFor(c) {
		return makeDm(c.dm, c.npup);
	}
	function applyNoise(img, c) {
		const d = c.detector;
		if (!d.noise) return img;
		const rand = mulberry32(d.seed);
		const g = gaussian(rand);
		return img.map((v) => (poisson(Math.max(0, v) * d.peakPhotons, rand, g) + d.readNoise * g()) / d.peakPhotons);
	}
	function computeFrame(c, cmd, memo) {
		const t0 = performance.now();
		const o = opticsFor(c, memo);
		const dmOpd = dmSurface(dmFor(c), cmd);
		const star = sourceImage(o, dmOpd);
		const img = star.slice();
		for (const p of c.planets) {
			const t = p.pa * Math.PI / 180;
			const pl = sourceImage(o, dmOpd, p.sep * Math.cos(t), p.sep * Math.sin(t));
			for (let i = 0; i < img.length; i++) img[i] += p.contrast * pl[i];
		}
		const noisy = applyNoise(img, c);
		const planes = tracePlanes(o, dmOpd);
		const base = sourceImage(opticsFor({
			...c,
			coronagraph: {
				...DEFAULT_CORONAGRAPH,
				kind: "none",
				lyotOuter: 1
			}
		}, memo), dmOpd);
		const zone = darkZone(o.cor.spec, 3, c.fov);
		const contrast = radialProfile(star, o.u0, .5, zone);
		const baseline = radialProfile(base, o.u0, .5, zone);
		const m = o.u0.length;
		let peak = 0;
		for (let l = 0; l < m; l++) for (let k = 0; k < m; k++) if (Math.hypot(o.u0[k], o.u0[l]) < 1.5) peak = Math.max(peak, star[l * m + k]);
		const rmsSci = rmsOverPupil(o.opdScience.map((v, i) => v + dmOpd[i]), o.pupil);
		const rmsWfs = rmsOverPupil(o.opdWfs.map((v, i) => v + dmOpd[i]), o.pupil);
		const { D: _d, ...rest } = planes;
		return {
			image: {
				w: m,
				h: m,
				data: Float32Array.from(noisy)
			},
			fov: c.fov,
			q: (m - 1) / (2 * c.fov),
			planes: rest,
			contrast,
			baseline,
			readouts: {
				meanContrast: meanInRegion(star, o.u0, zone),
				baselineContrast: meanInRegion(base, o.u0, zone),
				peak,
				rmsScienceNm: rmsSci,
				rmsWfsNm: rmsWfs,
				strehl: Math.exp(-((2 * Math.PI * rmsSci / c.wavelengthNm) ** 2)),
				designIwa: designIwa(o.cor.spec),
				eigenvalue: o.cor.info.eigenvalue ?? NaN,
				timeMs: performance.now() - t0
			}
		};
	}
	// src/lib/wfs/calibration.ts
	/**
	* Linear reconstruction for the pupil-plane sensors: an interaction matrix measured by pushing and pulling each
	* mode of a modal basis, and its regularised pseudo-inverse. This is how real adaptive-optics systems are
	* calibrated, and it lets every sensor deliver the same output: modal coefficients of the wavefront (nm).
	*/
	function fieldWith(amp, n, opdNm, wavelengthNm) {
		const k = 2 * Math.PI / wavelengthNm;
		return fieldFromAmpPhase(n, amp, opdNm.map((v) => k * v));
	}
	/** Calibrate `sensor` with `modes` (OPD maps per nm), poking ±pokeNm around `baseOpd`. */
	function calibrate(sensor, amp, n, modes, wavelengthNm, pokeNm, alpha = .001, baseOpd) {
		const base = baseOpd ?? new Float64Array(n * n);
		const reference = sensor.measure(fieldWith(amp, n, base, wavelengthNm)).signal;
		const rows = reference.length, cols = modes.length;
		const D = new Float64Array(rows * cols);
		modes.forEach((mode, j) => {
			const plus = sensor.measure(fieldWith(amp, n, base.map((v, i) => v + pokeNm * mode[i]), wavelengthNm)).signal;
			const minus = sensor.measure(fieldWith(amp, n, base.map((v, i) => v - pokeNm * mode[i]), wavelengthNm)).signal;
			for (let r = 0; r < rows; r++) D[r * cols + j] = (plus[r] - minus[r]) / (2 * pokeNm);
		});
		return {
			modes,
			reference,
			rec: tikhonovMatrix(D, rows, cols, alpha),
			D
		};
	}
	/** Modal coefficients (nm) from a measurement. */
	function reconstruct(cal, signal) {
		return cal.rec.apply(signal.map((v, i) => v - cal.reference[i]));
	}
	/** Wavefront map (nm) from modal coefficients. */
	function modalMap(cal, coeffs, n) {
		const out = new Float64Array(n * n);
		cal.modes.forEach((m, j) => {
			const c = coeffs[j];
			if (c) for (let i = 0; i < out.length; i++) out[i] += c * m[i];
		});
		return out;
	}
	// src/lib/control/ao.ts
	/**
	* Adaptive-optics-style closed loop for the pupil-plane sensors: the sensor measures the WFS-arm wavefront,
	* a modal reconstructor turns the signal into Zernike coefficients, and an integrator updates the DM:
	*   a_{k+1} = a_k − g · M · R · (s_k − s_ref),
	* with M the DM commands that best fit each mode. The loop flattens the wavefront seen by the sensor; the
	* non-common-path aberrations of the science arm are invisible to it.
	*/
	/** Zernike modes Noll 2 … nModes+1 as fitted by the DM. */
	function dmZernikeModes(dm, pupil, nModes) {
		const fit = dmFitter(dm, pupil, activeActuators(dm));
		const commands = [], shapes = [];
		for (let j = 2; j < nModes + 2; j++) {
			const c = fit(zernikeMap(j, dm.n));
			commands.push(c);
			shapes.push(dmSurface(dm, c));
		}
		return {
			shapes,
			commands
		};
	}
	/** Calibrate the sensor on the DM modes (push-pull of pokeNm). */
	function calibrateOnDm(sensor, amp, n, modes, wavelengthNm, pokeNm = 2) {
		return calibrate(sensor, amp, n, modes.shapes, wavelengthNm, pokeNm);
	}
	/** One loop iteration; updates `cmd` in place. `opdWfs` is the aberration seen by the sensor (nm). */
	function aoStep(sensor, cal, modes, dm, amp, pupil, opdWfs, cmd, gain, wavelengthNm) {
		const n = dm.n;
		const surf = dmSurface(dm, cmd);
		const opd = opdWfs.map((v, i) => v + surf[i]);
		const k = 2 * Math.PI / wavelengthNm;
		const measurement = sensor.measure(fieldFromAmpPhase(n, amp, opd.map((v) => k * v)));
		const coeffs = reconstruct(cal, measurement.signal);
		coeffs.forEach((c, j) => {
			const mc = modes.commands[j];
			for (let a = 0; a < cmd.length; a++) cmd[a] -= gain * c * mc[a];
		});
		return {
			measurement,
			coeffs,
			rmsBefore: rmsOverPupil(opd, pupil)
		};
	}
	// src/lib/control/darkHole.ts
	/**
	* The dark hole: the focal-plane region where the DM is asked to cancel the starlight, sampled at 2 samples per
	* λ0/D (Nyquist for the electric field). One-sided ("half") holes can correct phase and amplitude errors with a
	* single DM; a full annulus can only correct phase errors (Malbet et al. 1995; Give'on et al. 2007).
	*/
	function makeDarkHole(spec, q = 2) {
		const all = focalCoords(2 * Math.ceil(spec.owa * q) + 1, q);
		const u = spec.half ? all.filter((x) => x >= spec.iwa * .5) : all;
		const v = all;
		const pixels = [];
		for (let l = 0; l < v.length; l++) for (let k = 0; k < u.length; k++) {
			const r = Math.hypot(u[k], v[l]);
			if (r >= spec.iwa && r <= spec.owa && (!spec.half || u[k] >= spec.iwa * .5)) pixels.push(l * u.length + k);
		}
		return {
			spec,
			u: Float64Array.from(u),
			v: Float64Array.from(v),
			pixels
		};
	}
	/** Complex detector field (raw-contrast units) at the dark-hole pixels, from a pupil-plane field at λ0. */
	function fieldInHole(o, EA, dh) {
		const n = o.spec.npup;
		const EC = lyotOut(o.cor, EA, 1, true);
		const g = mftGeneral(EC.re, EC.im, pupilCoords(EC.n, n), dh.u, dh.v, -1, 1 / (n * n));
		const k = 1 / Math.sqrt(o.refPeak);
		return {
			re: Float64Array.from(dh.pixels, (p) => g.re[p] * k),
			im: Float64Array.from(dh.pixels, (p) => g.im[p] * k)
		};
	}
	function meanIntensity(E) {
		let s = 0;
		for (let i = 0; i < E.re.length; i++) s += E.re[i] ** 2 + E.im[i] ** 2;
		return s / E.re.length;
	}
	// src/lib/control/efc.ts
	/**
	* Electric field conjugation (Give'on et al. 2007): choose the DM commands that cancel the estimated dark-hole
	* field in the least-squares sense, with Tikhonov regularisation,
	*   δa = −(GᵀG + α s I)⁻¹ Gᵀ E,   G = [Re J; Im J],  E = [Re E; Im E].
	*/
	function efcMatrix(J, alpha) {
		const G = new Float64Array(2 * J.rows * J.cols);
		G.set(J.re, 0);
		G.set(J.im, J.rows * J.cols);
		return tikhonovMatrix(G, 2 * J.rows, J.cols, alpha);
	}
	/** Command update (full actuator vector, nm) for the estimated field E, applied with `gain`. */
	function efcUpdate(rec, J, E, nAct, gain) {
		const b = new Float64Array(2 * J.rows);
		b.set(E.re, 0);
		b.set(E.im, J.rows);
		const x = rec.apply(b);
		const out = new Float64Array(nAct);
		J.actuators.forEach((a, c) => {
			out[a] = -gain * x[c];
		});
		return out;
	}
	// src/lib/control/jacobian.ts
	/**
	* Jacobian of the dark-hole field with respect to the DM actuators, from the (unaberrated) model of the
	* instrument. The coronagraph is linear in the pupil field, so for a small command δa_k (nm):
	*   δE = C{ i (2π/λ) h_k · E_0 } δa_k,
	* one propagation per actuator.
	*/
	/** Column of the Jacobian for actuator a: dark-hole field per nm of command. */
	function jacobianColumn(model, dm, dh, a, E0) {
		const n = model.spec.npup;
		const k0 = 2 * Math.PI / model.spec.wavelengthNm;
		const f = makeField(n);
		const ids = dm.idx[a], vs = dm.val[a];
		for (let t = 0; t < ids.length; t++) {
			const i = ids[t], w = k0 * vs[t];
			f.re[i] = -w * E0.im[i];
			f.im[i] = w * E0.re[i];
		}
		return fieldInHole(model, f, dh);
	}
	/** Unaberrated model field at plane A (before the apodizer), the point the Jacobian is linearised about. */
	function modelField(model) {
		const n = model.spec.npup;
		return entranceField(model.pupil, new Float64Array(n * n), n, model.spec.wavelengthNm, 1);
	}
	/** Same as computeJacobian, yielding to the event loop every few columns so the worker stays responsive. */
	async function computeJacobianAsync(model, dm, dh, onProgress, pause) {
		const E0 = modelField(model);
		const actuators = activeActuators(dm);
		const rows = dh.pixels.length, cols = actuators.length;
		const re = new Float64Array(rows * cols), im = new Float64Array(rows * cols);
		for (let c = 0; c < cols; c++) {
			const g = jacobianColumn(model, dm, dh, actuators[c], E0);
			for (let r = 0; r < rows; r++) {
				re[r * cols + c] = g.re[r];
				im[r * cols + c] = g.im[r];
			}
			if (c % 8 === 7) {
				onProgress((c + 1) / cols);
				if (!await pause()) return null;
			}
		}
		return {
			actuators,
			re,
			im,
			rows,
			cols
		};
	}
	/** Field change (dark-hole pixels) predicted by the Jacobian for active-actuator commands x (nm). */
	function applyJacobian(J, x) {
		const re = new Float64Array(J.rows), im = new Float64Array(J.rows);
		for (let r = 0; r < J.rows; r++) {
			let sr = 0, si = 0;
			const o = r * J.cols;
			for (let c = 0; c < J.cols; c++) {
				sr += J.re[o + c] * x[c];
				si += J.im[o + c] * x[c];
			}
			re[r] = sr;
			im[r] = si;
		}
		return {
			re,
			im
		};
	}
	// src/lib/control/pairwise.ts
	/** Probe commands (full actuator vectors, nm) with phases spread over π. */
	function probeCommands(dm, spec, amplitudeNm, count) {
		const sinc = (x) => x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
		const wx = spec.half ? spec.owa - spec.iwa * .5 : 2 * spec.owa;
		const wy = 2 * spec.owa;
		const cx = spec.half ? (spec.owa + spec.iwa * .5) / 2 : 0;
		const out = [];
		for (let k = 0; k < count; k++) {
			const th = Math.PI * k / count;
			out.push(Float64Array.from(dm.ax, (x, a) => {
				const y = dm.ay[a];
				return amplitudeNm * sinc(wx * x) * sinc(wy * y) * Math.cos(2 * Math.PI * cx * x + th + (spec.half ? 0 : Math.PI / 4));
			}));
		}
		return out;
	}
	/**
	* Estimate the dark-hole field from probe images. `measure(offset)` returns the dark-hole intensities with the
	* DM command offset by `offset` (full actuator vector, nm). Pixels with an ill-conditioned probe matrix are
	* returned as zero and flagged invalid.
	*/
	function pairwiseEstimate(J, probes, measure) {
		const P = J.rows;
		const dE = probes.map((p) => applyJacobian(J, J.actuators.map((a) => p[a])));
		const diff = probes.map((p) => {
			const plus = measure(p), minus = measure(p.map((v) => -v));
			return plus.map((v, i) => v - minus[i]);
		});
		const re = new Float64Array(P), im = new Float64Array(P);
		const valid = new Uint8Array(P);
		for (let i = 0; i < P; i++) {
			let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
			for (let k = 0; k < probes.length; k++) {
				const h1 = 4 * dE[k].re[i], h2 = 4 * dE[k].im[i];
				a11 += h1 * h1;
				a12 += h1 * h2;
				a22 += h2 * h2;
				b1 += h1 * diff[k][i];
				b2 += h2 * diff[k][i];
			}
			const det = a11 * a22 - a12 * a12;
			const tr = a11 + a22;
			if (!(tr > 0) || det < 1e-4 * tr * tr) continue;
			re[i] = (a22 * b1 - a12 * b2) / det;
			im[i] = (a11 * b2 - a12 * b1) / det;
			valid[i] = 1;
		}
		return {
			re,
			im,
			valid
		};
	}
	/**
	* Probe amplitude (nm) giving a probe intensity close to the current dark-hole intensity, which balances the
	* signal against the non-linear |ΔE|² term: scale a unit probe so that mean |J p|² ≈ mean contrast.
	*/
	function adaptiveProbeNm(J, unitProbe, meanContrast) {
		const d = applyJacobian(J, J.actuators.map((a) => unitProbe[a]));
		let s = 0;
		for (let i = 0; i < d.re.length; i++) s += d.re[i] ** 2 + d.im[i] ** 2;
		s /= d.re.length;
		return s > 0 ? Math.sqrt(meanContrast / s) : 1;
	}
	// src/lib/control/speckleNulling.ts
	/** The brightest pixels of the hole, at least `minSep` λ/D apart. */
	function brightestSpeckles(dh, I, count, minSep = 2) {
		const order = Array.from(I.keys()).sort((a, b) => I[b] - I[a]);
		const out = [];
		for (const i of order) {
			const p = dh.pixels[i];
			const u = dh.u[p % dh.u.length], v = dh.v[Math.floor(p / dh.u.length)];
			if (out.every((s) => Math.hypot(s.u - u, s.v - v) >= minSep)) out.push({
				pixel: i,
				u,
				v
			});
			if (out.length >= count) break;
		}
		return out;
	}
	/** DM command (nm) of a sine wave at focal position (u, v) λ/D, i.e. u, v cycles per pupil. */
	function sineCommand(dm, u, v, amplitudeNm, phase) {
		return Float64Array.from(dm.ax, (x, a) => amplitudeNm * Math.cos(2 * Math.PI * (u * x + v * dm.ay[a]) + phase));
	}
	/**
	* One speckle-nulling iteration. `measure(offset)` returns the dark-hole intensities with the DM command offset
	* (nm). Returns the command update (nm) to add, and the number of images taken.
	*/
	function speckleNullingStep(dm, dh, measure, count, probeNm, gain) {
		const I0 = measure(null);
		const speckles = brightestSpeckles(dh, I0, count);
		const imgs = [
			0,
			Math.PI / 2,
			Math.PI,
			3 * Math.PI / 2
		].map((ph) => {
			const off = new Float64Array(dm.ax.length);
			for (const s of speckles) {
				const c = sineCommand(dm, s.u, s.v, probeNm, ph);
				for (let a = 0; a < off.length; a++) off[a] += c[a];
			}
			return measure(off);
		});
		const update = new Float64Array(dm.ax.length);
		for (const s of speckles) {
			const [a, b, c, d] = imgs.map((im) => im[s.pixel]);
			const e0 = I0[s.pixel];
			const B2 = Math.max(1e-30, (a + c) / 2 - e0);
			const B = Math.sqrt(B2);
			const psi = Math.atan2(b - d, a - c);
			const amp = Math.sqrt(Math.max(0, e0)) / B;
			const cmd = sineCommand(dm, s.u, s.v, gain * amp * probeNm, psi + Math.PI);
			for (let i = 0; i < update.length; i++) update[i] += cmd[i];
		}
		return {
			update,
			images: 5,
			speckles
		};
	}
	/** Probe amplitude (nm) that scales with the speckle field: about 0.5 nm at a raw contrast of 1e-5. */
	function speckleProbeNm(meanContrast) {
		return Math.max(.05, .5 * Math.sqrt(meanContrast / 1e-5));
	}
	// src/lib/wfs/phaseDiversity.ts
	/**
	* Phase diversity (Gonsalves 1982): an in-focus image and an image with a known extra defocus. For a point
	* source both are known functions of the unknown wavefront, and the pair removes the sign ambiguity of a single
	* image. The Zernike coefficients are fitted by damped Gauss–Newton (Levenberg–Marquardt) least squares.
	* Images are taken on the science camera without the coronagraph mask, so the method sees the non-common-path
	* aberrations that the pupil-plane sensor misses.
	*/
	/** In-focus and defocused images (each normalised to unit total), stacked: q = 2 over ±8 λ/D. */
	function diversityImages(amp, n, opdNm, spec) {
		const u = focalCoords(33, 2);
		const z4 = zernikeMap(4, n);
		const k = 2 * Math.PI / spec.wavelengthNm;
		const x = pupilCoords(n);
		const out = new Float64Array(2 * u.length * u.length);
		[0, spec.diversityNm].forEach((d, s) => {
			const F = mftForward(fieldFromAmpPhase(n, amp, opdNm.map((v, i) => k * (v + d * z4[i]))), x, u);
			let tot = 0;
			for (let i = 0; i < F.re.length; i++) tot += F.re[i] ** 2 + F.im[i] ** 2;
			for (let i = 0; i < F.re.length; i++) out[s * F.re.length + i] = (F.re[i] ** 2 + F.im[i] ** 2) / tot;
		});
		return out;
	}
	/** Fit Zernike coefficients Noll 2 … modes+1 (nm) to the measured image pair, from the known pupil amplitude. */
	function phaseDiversityEstimate(amp, n, measured, spec, iterations = 12) {
		const J = spec.modes;
		const modes = Array.from({ length: J }, (_, j) => zernikeMap(j + 2, n));
		const c = new Float64Array(J);
		const opdOf = (coef) => {
			const o = new Float64Array(n * n);
			coef.forEach((v, j) => {
				if (v) for (let i = 0; i < o.length; i++) o[i] += v * modes[j][i];
			});
			return o;
		};
		let lambda = .001;
		let model = diversityImages(amp, n, opdOf(c), spec);
		let cost = model.reduce((s, v, i) => s + (v - measured[i]) ** 2, 0);
		const h = .5;
		for (let it = 0; it < iterations; it++) {
			const Jm = [];
			for (let j = 0; j < J; j++) {
				const cp = c.slice();
				cp[j] += h;
				const mp = diversityImages(amp, n, opdOf(cp), spec);
				Jm.push(mp.map((v, i) => (v - model[i]) / h));
			}
			const A = new Float64Array(J * J), b = new Float64Array(J);
			for (let a = 0; a < J; a++) {
				for (let i = 0; i < model.length; i++) b[a] += Jm[a][i] * (measured[i] - model[i]);
				for (let d = a; d < J; d++) {
					let s = 0;
					for (let i = 0; i < model.length; i++) s += Jm[a][i] * Jm[d][i];
					A[a * J + d] = s;
					A[d * J + a] = s;
				}
			}
			let accepted = false;
			for (let tries = 0; tries < 6 && !accepted; tries++) {
				const Ad = A.slice();
				for (let a = 0; a < J; a++) Ad[a * J + a] *= 1 + lambda;
				const step = choleskySolve(Ad, b, J);
				const cn = c.map((v, j) => v + step[j]);
				const mn = diversityImages(amp, n, opdOf(cn), spec);
				const cn2 = mn.reduce((s, v, i) => s + (v - measured[i]) ** 2, 0);
				if (cn2 < cost) {
					c.set(cn);
					model = mn;
					cost = cn2;
					lambda /= 3;
					accepted = true;
				} else lambda *= 4;
			}
			if (!accepted) break;
		}
		return c;
	}
	// src/lib/wfs/scc.ts
	/**
	* Self-coherent camera (Baudoz et al. 2006; Galicher et al. 2010): a small reference hole in the Lyot stop, at a
	* distance ξ0 from the pupil centre, lets through some of the starlight that the focal-plane mask diffracts
	* outside the pupil. It interferes with the stellar speckles on the detector and makes fringes. In the Fourier
	* transform of the image the term E_S·E_R* sits apart from the rest (around −ξ0); isolating it and dividing by the
	* known reference field gives the speckle field E_S, from a single image.
	*/
	var DEFAULT_SCC = {
		xi0: 1.65,
		holeDiameter: .08,
		fov: 10,
		owa: 8
	};
	var Q = 6;
	/** Science (main pupil) and reference (hole) fields on the SCC detector grid, at λ0. */
	function sccFields(cor, EA, spec, normalisation) {
		if (!cor.toLyotGrid || !cor.lyot) throw new Error("The self-coherent camera needs a focal-plane mask and a Lyot stop");
		const n = cor.n;
		const u = focalCoords(2 * Math.round(spec.fov * Q) + 1, Q);
		const Ea = applyPlaneA(cor, EA, 1);
		const main = applyLyot(cor, cor.toLyot(Ea, 1, true));
		const k = 1 / Math.sqrt(normalisation);
		const Es = mftGeneral(main.re, main.im, pupilCoords(main.n, n), u, u, -1, k / (n * n));
		const mh = Math.ceil(spec.holeDiameter * n) + 4;
		const hx = pupilCoords(mh, n).map((x) => x + Math.round(spec.xi0 * n) / n);
		const hy = pupilCoords(mh, n);
		const hole = rasterize(n, (x, y) => x * x + y * y <= (spec.holeDiameter / 2) ** 2, 8, mh);
		const H = cor.toLyotGrid(Ea, 1, hx, hy);
		for (let i = 0; i < hole.length; i++) {
			H.re[i] *= hole[i];
			H.im[i] *= hole[i];
		}
		return {
			u,
			Es,
			Er: mftGeneral(H.re, H.im, hx, u, u, -1, k / (n * n), hy)
		};
	}
	function sccImage(f) {
		return f.Es.re.map((r, i) => (r + f.Er.re[i]) ** 2 + (f.Es.im[i] + f.Er.im[i]) ** 2);
	}
	/** Smooth window: 1 inside the dark hole, falling to 0 at the image edge (avoids truncation leakage). */
	function windowAt(u, v, spec) {
		const r = Math.hypot(u, v);
		if (r <= spec.owa) return 1;
		if (r >= spec.fov) return 0;
		return .5 * (1 + Math.cos(Math.PI * (r - spec.owa) / (spec.fov - spec.owa)));
	}
	/** Estimate E_S on the image grid from the fringed image and a model of the reference field E_R. */
	function sccEstimate(I, u, ErModel, spec) {
		const m = u.length;
		const w = new Float64Array(m * m);
		for (let l = 0; l < m; l++) for (let k = 0; k < m; k++) w[l * m + k] = I[l * m + k] * windowAt(u[k], u[l], spec);
		const R = (1 + spec.holeDiameter) / 2;
		const dx = 1 / (2.5 * spec.fov);
		const nx = 2 * Math.ceil(R / dx) + 1;
		const gx = focalCoords(nx, 1 / dx).map((x) => x - spec.xi0);
		const gy = focalCoords(nx, 1 / dx);
		const G = mftGeneral(w, new Float64Array(m * m), u, gx, gy, 1, 1 / 36);
		for (let l = 0; l < nx; l++) for (let k = 0; k < nx; k++) if (Math.hypot(gx[k] + spec.xi0, gy[l]) > R) {
			G.re[l * nx + k] = 0;
			G.im[l * nx + k] = 0;
		}
		const Im = mftGeneral(G.re, G.im, gx, u, u, -1, dx * dx, gy);
		const re = new Float64Array(m * m), im = new Float64Array(m * m);
		for (let i = 0; i < m * m; i++) {
			const a = Im.re[i], b = Im.im[i], c = ErModel.re[i], d = ErModel.im[i];
			const den = c * c + d * d;
			if (den <= 0) continue;
			re[i] = (a * c - b * d) / den;
			im[i] = (a * d + b * c) / den;
		}
		return {
			nx: m,
			ny: m,
			re,
			im
		};
	}
	// src/lib/wfs/types.ts
	var PUPIL_WFS_KINDS = [
		"shack-hartmann",
		"pyramid",
		"zernike",
		"curvature"
	];
	/** Average a complex n×n field over b×b blocks (the sensor's coarser pixels). */
	function binField(E, b) {
		if (b === 1) return E;
		const m = E.n / b;
		const re = new Float64Array(m * m), im = new Float64Array(m * m);
		for (let y = 0; y < E.n; y++) for (let x = 0; x < E.n; x++) {
			const j = Math.floor(y / b) * m + Math.floor(x / b);
			re[j] += E.re[y * E.n + x] / (b * b);
			im[j] += E.im[y * E.n + x] / (b * b);
		}
		return {
			n: m,
			re,
			im
		};
	}
	/** Average a real n×n map over b×b blocks. */
	function binMap(a, n, b) {
		if (b === 1) return a;
		const m = n / b;
		const out = new Float64Array(m * m);
		for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out[Math.floor(y / b) * m + Math.floor(x / b)] += a[y * n + x] / (b * b);
		return out;
	}
	// src/lib/wfs/curvature.ts
	/**
	* Curvature sensor (Roddier 1988): two images of the beam a short distance before and after focus. In the
	* geometric-optics limit their normalised difference (I₁ − I₂)/(I₁ + I₂) is proportional to the Laplacian of the
	* wavefront inside the pupil and to its radial slope at the edge. Equivalent here to Fresnel propagation of the
	* pupil field by ±z, written with the dimensionless distance z' = λz/D² (angular spectrum on a 2× padded grid).
	*/
	function curvature(pupil, n, distance) {
		const b = Math.max(1, n / 32);
		const m = n / b;
		const N = 2 * m;
		const off = (N - m) / 2;
		const valid = [];
		for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (Math.hypot(x - N / 2 + .5, y - N / 2 + .5) / m <= .5 + 2 / m) valid.push(y * N + x);
		const H = (sign) => {
			const re = new Float64Array(N * N), im = new Float64Array(N * N);
			for (let l = 0; l < N; l++) for (let k = 0; k < N; k++) {
				const fx = (k - N / 2) * m / N, fy = (l - N / 2) * m / N;
				const ph = -sign * Math.PI * distance * (fx * fx + fy * fy);
				re[l * N + k] = Math.cos(ph);
				im[l * N + k] = Math.sin(ph);
			}
			return {
				re,
				im
			};
		};
		const Hp = H(1), Hm = H(-1);
		const propagate = (E, h) => {
			const re = new Float64Array(N * N), im = new Float64Array(N * N);
			for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) {
				re[(y + off) * N + x + off] = E.re[y * m + x];
				im[(y + off) * N + x + off] = E.im[y * m + x];
			}
			fftshift2d(re, N);
			fftshift2d(im, N);
			fft2d(re, im, N);
			fftshift2d(re, N);
			fftshift2d(im, N);
			for (let i = 0; i < N * N; i++) {
				const r = re[i] * h.re[i] - im[i] * h.im[i];
				im[i] = re[i] * h.im[i] + im[i] * h.re[i];
				re[i] = r;
			}
			fftshift2d(re, N);
			fftshift2d(im, N);
			fft2d(re, im, N, true);
			fftshift2d(re, N);
			fftshift2d(im, N);
			const I = new Float64Array(N * N);
			for (let i = 0; i < N * N; i++) I[i] = (re[i] ** 2 + im[i] ** 2) / (N * N) ** 2;
			return I;
		};
		return {
			kind: "curvature",
			measure(E0) {
				const E = binField(E0, b);
				const I1 = propagate(E, Hp), I2 = propagate(E, Hm);
				const signal = Float64Array.from(valid, (i) => {
					const s = I1[i] + I2[i];
					return s > 1e-12 ? (I1[i] - I2[i]) / s : 0;
				});
				const data = new Float64Array(2 * N * N);
				for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
					data[y * 2 * N + x] = I1[y * N + x];
					data[y * 2 * N + N + x] = I2[y * N + x];
				}
				return {
					signal,
					image: {
						w: 2 * N,
						h: N,
						data
					}
				};
			}
		};
	}
	// src/lib/wfs/pyramid.ts
	/**
	* Pyramid wavefront sensor (Ragazzoni 1996): a four-sided glass pyramid at focus splits the focal plane into
	* quadrants and forms four images of the pupil. Their intensity differences measure the wavefront slopes, with a
	* gain and linear range set by a circular tip/tilt modulation of the beam around the apex (radius r_mod λ/D,
	* incoherent average over the modulation path).
	* Modelled with FFTs on a 4× padded grid; the beam is offset by half a sample so the apex lies between samples.
	*/
	var SPLIT = .75;
	function pyramid(pupil, n, modulation) {
		const b = Math.max(1, n / 32);
		const m = n / b;
		const N = 4 * m;
		const pb = binMap(pupil, n, b);
		const valid = [];
		for (let i = 0; i < m * m; i++) if (pb[i] > .5) valid.push(i);
		const npts = modulation > 0 ? Math.max(8, 4 * Math.ceil(modulation)) : 1;
		const q = N / m;
		const pyr = new Float64Array(N * N);
		const shift = 1 / (2 * q);
		for (let l = 0; l < N; l++) for (let k = 0; k < N; k++) {
			const u = (k - N / 2) / q - shift, v = (l - N / 2) / q - shift;
			pyr[l * N + k] = 2 * Math.PI * SPLIT * (Math.abs(u) + Math.abs(v));
		}
		const re = new Float64Array(N * N), im = new Float64Array(N * N);
		const off = (N - m) / 2;
		const centre = Math.round(SPLIT * m);
		return {
			kind: "pyramid",
			measure(E0) {
				const E = binField(E0, b);
				const I = new Float64Array(N * N);
				for (let t = 0; t < npts; t++) {
					const th = 2 * Math.PI * t / npts;
					const tx = modulation * Math.cos(th) + shift, ty = modulation * Math.sin(th) + shift;
					re.fill(0);
					im.fill(0);
					for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) {
						const ph = 2 * Math.PI * (tx * (x - (m - 1) / 2) + ty * (y - (m - 1) / 2)) / m;
						const c = Math.cos(ph), s = Math.sin(ph), i = y * m + x;
						re[(y + off) * N + x + off] = E.re[i] * c - E.im[i] * s;
						im[(y + off) * N + x + off] = E.re[i] * s + E.im[i] * c;
					}
					fftshift2d(re, N);
					fftshift2d(im, N);
					fft2d(re, im, N);
					fftshift2d(re, N);
					fftshift2d(im, N);
					for (let i = 0; i < N * N; i++) {
						const c = Math.cos(pyr[i]), s = Math.sin(pyr[i]);
						const r = re[i] * c - im[i] * s;
						im[i] = re[i] * s + im[i] * c;
						re[i] = r;
					}
					fftshift2d(re, N);
					fftshift2d(im, N);
					fft2d(re, im, N, true);
					fftshift2d(re, N);
					fftshift2d(im, N);
					for (let i = 0; i < N * N; i++) I[i] += (re[i] ** 2 + im[i] ** 2) / npts;
				}
				const quad = (sx, sy, i) => {
					const x = i % m, y = Math.floor(i / m);
					return I[(N / 2 + sy * centre - m / 2 + y) * N + N / 2 + sx * centre - m / 2 + x];
				};
				let mean = 0;
				for (const i of valid) mean += quad(-1, -1, i) + quad(1, -1, i) + quad(-1, 1, i) + quad(1, 1, i);
				mean /= valid.length;
				const signal = new Float64Array(2 * valid.length);
				valid.forEach((i, k) => {
					const a = quad(-1, -1, i), bq = quad(1, -1, i), c = quad(-1, 1, i), d = quad(1, 1, i);
					signal[k] = (bq + d - a - c) / mean;
					signal[valid.length + k] = (c + d - a - bq) / mean;
				});
				return {
					signal,
					image: {
						w: N,
						h: N,
						data: I
					}
				};
			}
		};
	}
	// src/lib/wfs/shackHartmann.ts
	/**
	* Shack–Hartmann sensor (Platt & Shack 2001): a lenslet array cuts the pupil into nsub × nsub subapertures and
	* each lenslet forms a spot; the spot displacement is the average wavefront slope over its subaperture.
	* Each spot is the |FFT|² of the subaperture field zero-padded 4× (4 pixels per λ/d, a field of ±P/8 λ/d), so that
	* the spot wings are not truncated and the centroid stays linear.
	*/
	function shackHartmann(pupil, n, nsub) {
		const p = n / nsub;
		if (!Number.isInteger(p)) throw new RangeError("The pupil size must be a multiple of the number of subapertures");
		const P = Math.max(16, 4 * 2 ** Math.ceil(Math.log2(p)));
		const valid = [];
		for (let j = 0; j < nsub; j++) for (let i = 0; i < nsub; i++) {
			let s = 0;
			for (let y = 0; y < p; y++) for (let x = 0; x < p; x++) s += pupil[(j * p + y) * n + i * p + x];
			if (s >= .5 * p * p) valid.push(j * nsub + i);
		}
		const re = new Float64Array(P * P), im = new Float64Array(P * P);
		return {
			kind: "shack-hartmann",
			measure(E) {
				const W = nsub * P;
				const image = new Float64Array(W * W);
				const signal = new Float64Array(2 * valid.length);
				valid.forEach((sa, k) => {
					const i = sa % nsub, j = Math.floor(sa / nsub);
					re.fill(0);
					im.fill(0);
					const o = (P - p) / 2;
					for (let y = 0; y < p; y++) for (let x = 0; x < p; x++) {
						const src = (j * p + y) * n + i * p + x;
						re[(y + o) * P + x + o] = E.re[src];
						im[(y + o) * P + x + o] = E.im[src];
					}
					fftshift2d(re, P);
					fftshift2d(im, P);
					fft2d(re, im, P);
					fftshift2d(re, P);
					fftshift2d(im, P);
					let s = 0, sx = 0, sy = 0;
					for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
						const I = re[y * P + x] ** 2 + im[y * P + x] ** 2;
						image[(j * P + y) * W + i * P + x] = I;
						s += I;
						sx += I * (x - P / 2);
						sy += I * (y - P / 2);
					}
					signal[k] = s > 0 ? sx / s : 0;
					signal[valid.length + k] = s > 0 ? sy / s : 0;
				});
				return {
					signal,
					image: {
						w: W,
						h: W,
						data: image
					}
				};
			}
		};
	}
	// src/lib/wfs/zernikeWfs.ts
	var ZWFS_RADIUS = .53;
	var ZWFS_PHASE = Math.PI / 2;
	function zernikeWfs(pupil, n) {
		const x = pupilCoords(n);
		const valid = [];
		for (let i = 0; i < n * n; i++) if (pupil[i] > .5) valid.push(i);
		const r = ZWFS_RADIUS;
		const delta = (u, v) => u * u + v * v <= r * r ? [Math.cos(ZWFS_PHASE) - 1, Math.sin(ZWFS_PHASE)] : [0, 0];
		return {
			kind: "zernike",
			measure(E) {
				const out = babinetPropagate(E, x, x, r, delta, 1);
				const I = new Float64Array(n * n);
				for (let i = 0; i < n * n; i++) I[i] = out.re[i] ** 2 + out.im[i] ** 2;
				return {
					signal: Float64Array.from(valid, (i) => I[i]),
					image: {
						w: n,
						h: n,
						data: I
					}
				};
			}
		};
	}
	// src/lib/wfsView.ts
	/**
	* The wavefront-sensor panel: raw sensor signal, the reconstructed wavefront (or estimated field) and the truth,
	* with the error between them. Also provides the cached sensors, calibrations and Jacobians used by the loops.
	*/
	function isPupilWfs(kind) {
		return PUPIL_WFS_KINDS.includes(kind);
	}
	function pupilSensorFor(c, o, memo) {
		const w = c.wfs;
		return memo.get(`sensor:${w.kind}:${w.nsub}:${w.modulation}:${w.curvatureDistance}:${c.npup}:${JSON.stringify(c.pupil)}`, () => {
			switch (w.kind) {
				case "shack-hartmann": return shackHartmann(o.pupil, c.npup, w.nsub);
				case "pyramid": return pyramid(o.pupil, c.npup, w.modulation);
				case "zernike": return zernikeWfs(o.pupil, c.npup);
				case "curvature": return curvature(o.pupil, c.npup, w.curvatureDistance);
			}
		});
	}
	function dmModesFor(c, o, memo) {
		return memo.get(`modes:${JSON.stringify(c.dm)}:${c.npup}:${JSON.stringify(c.pupil)}:${c.wfs.modes}`, () => dmZernikeModes(dmFor(c), o.pupil, c.wfs.modes));
	}
	function calibrationFor(c, o, memo) {
		const sensor = pupilSensorFor(c, o, memo);
		const modes = dmModesFor(c, o, memo);
		const a = c.aberrations;
		return memo.get(`cal:${JSON.stringify(c.wfs)}:${JSON.stringify(c.dm)}:${c.npup}:${JSON.stringify(c.pupil)}:${a.amplitudeRms}:${a.amplitudeSeed}:${c.wavelengthNm}`, () => calibrateOnDm(sensor, o.amp, c.npup, modes, c.wavelengthNm));
	}
	function darkHoleFor(c) {
		return makeDarkHole({
			iwa: c.control.iwa,
			owa: c.control.owa,
			half: c.control.half
		});
	}
	/** Unaberrated model of the instrument, the basis of the Jacobian. */
	function modelFor(c, memo) {
		return opticsFor({
			...c,
			aberrations: NO_ABERRATIONS,
			bandwidth: 0
		}, memo);
	}
	var jacobians = /* @__PURE__ */ new Map();
	async function jacobianFor(c, memo, progress, pause) {
		const key = `${JSON.stringify(c.coronagraph)}:${JSON.stringify(c.pupil)}:${c.npup}:${JSON.stringify(c.dm)}:${JSON.stringify(darkHoleFor(c).spec)}:${c.wavelengthNm}`;
		const hit = jacobians.get(key);
		if (hit) return hit;
		const J = await computeJacobianAsync(modelFor(c, memo), dmFor(c), darkHoleFor(c), progress, pause);
		if (J) {
			if (jacobians.size > 3) jacobians.delete(jacobians.keys().next().value);
			jacobians.set(key, J);
		}
		return J;
	}
	/** True dark-hole field (mono, λ0) with the DM command `cmd`. */
	function trueHoleField(c, o, cmd, dh) {
		const s = dmSurface(dmFor(c), cmd);
		return fieldInHole(o, entranceField(o.amp, o.opdScience.map((v, i) => v + s[i]), c.npup, c.wavelengthNm, 1), dh);
	}
	/** Dark-hole pixels as an image on the hole's sub-grid (NaN outside the hole). */
	function holeImage(dh, values) {
		const w = dh.u.length, h = dh.v.length;
		const data = new Float32Array(w * h).fill(NaN);
		dh.pixels.forEach((p, i) => {
			data[p] = values[i];
		});
		return {
			w,
			h,
			data
		};
	}
	function relErr(a, b) {
		let e = 0, r = 0;
		for (let i = 0; i < b.re.length; i++) {
			e += (a.re[i] - b.re[i]) ** 2 + (a.im[i] - b.im[i]) ** 2;
			r += b.re[i] ** 2 + b.im[i] ** 2;
		}
		return r > 0 ? Math.sqrt(e / r) : NaN;
	}
	var masked = (o, map) => Float32Array.from(o.pupil, (p, i) => p > 0 ? map[i] : NaN);
	async function computeWfs(c, cmd, memo, progress, pause) {
		const o = opticsFor(c, memo);
		const n = c.npup;
		const dmOpd = dmSurface(dmFor(c), cmd);
		if (isPupilWfs(c.wfs.kind)) {
			const sensor = pupilSensorFor(c, o, memo);
			const cal = calibrationFor(c, o, memo);
			const opd = o.opdWfs.map((v, i) => v + dmOpd[i]);
			const meas = sensor.measure(entranceField(o.amp, opd, n, c.wavelengthNm, 1));
			const rec = modalMap(cal, reconstruct(cal, meas.signal), n);
			const mean = opd.reduce((s, v, i) => s + v * o.pupil[i], 0) / o.pupil.reduce((s, v) => s + v, 0);
			const truth = opd.map((v) => v - mean);
			return {
				kind: c.wfs.kind,
				raw: {
					w: meas.image.w,
					h: meas.image.h,
					data: Float32Array.from(meas.image.data)
				},
				estimate: {
					w: n,
					h: n,
					data: masked(o, rec)
				},
				truth: {
					w: n,
					h: n,
					data: masked(o, truth)
				},
				units: "nm",
				truthRms: rmsOverPupil(truth, o.pupil),
				errorRms: rmsOverPupil(truth.map((v, i) => v - rec[i]), o.pupil),
				note: `WFS arm at λ0, ${c.wfs.modes} modes. Non-common-path aberrations are invisible here.`
			};
		}
		if (c.wfs.kind === "phase-diversity") {
			const spec = {
				modes: 10,
				diversityNm: .15 * c.wavelengthNm,
				wavelengthNm: c.wavelengthNm
			};
			const opd = o.opdScience.map((v, i) => v + dmOpd[i]);
			const imgs = diversityImages(o.amp, n, opd, spec);
			const coef = phaseDiversityEstimate(o.pupil, n, imgs, spec);
			const rec = new Float64Array(n * n);
			coef.forEach((v, j) => {
				const z = zernikeMap(j + 2, n);
				for (let i = 0; i < rec.length; i++) rec[i] += v * z[i];
			});
			const mean = opd.reduce((s, v, i) => s + v * o.pupil[i], 0) / o.pupil.reduce((s, v) => s + v, 0);
			const truth = opd.map((v) => v - mean);
			const m = 33;
			const raw = /* @__PURE__ */ new Float32Array(2178);
			for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) {
				raw[y * 2 * m + x] = imgs[y * m + x];
				raw[y * 2 * m + m + x] = imgs[1089 + y * m + x];
			}
			return {
				kind: c.wfs.kind,
				raw: {
					w: 66,
					h: m,
					data: raw
				},
				estimate: {
					w: n,
					h: n,
					data: masked(o, rec)
				},
				truth: {
					w: n,
					h: n,
					data: masked(o, truth)
				},
				units: "nm",
				truthRms: rmsOverPupil(truth, o.pupil),
				errorRms: rmsOverPupil(truth.map((v, i) => v - rec[i]), o.pupil),
				note: "Science arm (NCPA included), coronagraph mask removed; fit of Noll modes 2–11 only."
			};
		}
		const dh = darkHoleFor(c);
		const truthField = trueHoleField(c, o, cmd, dh);
		const truthI = truthField.re.map((v, i) => v * v + truthField.im[i] ** 2);
		if (c.wfs.kind === "scc") {
			if (!sccCompatible(c.coronagraph)) return null;
			const model = modelFor(c, memo);
			const f = sccFields(o.cor, entranceField(o.amp, o.opdScience.map((v, i) => v + dmOpd[i]), n, c.wavelengthNm, 1), DEFAULT_SCC, o.refPeak);
			const fm = memo.get(`sccref:${JSON.stringify(c.coronagraph)}:${JSON.stringify(c.pupil)}:${n}`, () => sccFields(model.cor, entranceField(model.pupil, new Float64Array(n * n), n, c.wavelengthNm, 1), DEFAULT_SCC, model.refPeak));
			const I = sccImage(f);
			const est = sccEstimate(I, f.u, fm.Er, DEFAULT_SCC);
			const pick = sccToHole(f.u, dh);
			const e = {
				re: pick.map((i) => est.re[i]),
				im: pick.map((i) => est.im[i])
			};
			return {
				kind: c.wfs.kind,
				raw: {
					w: f.u.length,
					h: f.u.length,
					data: Float32Array.from(I)
				},
				estimate: holeImage(dh, e.re.map((v, i) => v * v + e.im[i] ** 2)),
				truth: holeImage(dh, truthI),
				units: "contrast",
				truthRms: Math.sqrt(truthI.reduce((s, v) => s + v, 0) / truthI.length),
				errorRms: relErr(e, truthField),
				note: `Reference hole at ${DEFAULT_SCC.xi0} D; one fringed image at 6 samples per λ/D.`
			};
		}
		const J = await jacobianFor(c, memo, progress, pause);
		if (!J) return null;
		const unit = probeCommands(dmFor(c), dh.spec, 1, 3);
		const meanI = truthI.reduce((s, v) => s + v, 0) / truthI.length;
		const amp = adaptiveProbeNm(J, unit[0], meanI);
		const measure = (off) => {
			const f = trueHoleField(c, o, cmd.map((v, i) => v + off[i]), dh);
			return f.re.map((v, i) => v * v + f.im[i] ** 2);
		};
		const probes = unit.map((p) => p.map((v) => v * amp));
		const est = pairwiseEstimate(J, probes, measure);
		const plus = measure(probes[0]), minus = measure(probes[0].map((v) => -v));
		return {
			kind: c.wfs.kind,
			raw: holeImage(dh, plus.map((v, i) => v - minus[i])),
			estimate: holeImage(dh, est.re.map((v, i) => v * v + est.im[i] ** 2)),
			truth: holeImage(dh, truthI),
			units: "contrast",
			truthRms: Math.sqrt(meanI),
			errorRms: relErr(est, truthField),
			note: `Three probe pairs of ${amp.toFixed(2)} nm; raw signal = I⁺ − I⁻ of the first probe.`
		};
	}
	/** Indices of the SCC image samples (q = 6 grid) that coincide with the dark-hole pixels (q = 2 grid). */
	function sccToHole(u, dh) {
		const m = u.length;
		const near = (x) => {
			let b = 0;
			for (let k = 1; k < m; k++) if (Math.abs(u[k] - x) < Math.abs(u[b] - x)) b = k;
			return b;
		};
		const ix = Array.from(dh.u, near), iy = Array.from(dh.v, near);
		return dh.pixels.map((p) => iy[Math.floor(p / dh.u.length)] * m + ix[p % dh.u.length]);
	}
	// src/lib/loop.ts
	var LoopState = class {
		cmd;
		history = [];
		efc = null;
		constructor(nAct) {
			this.cmd = new Float64Array(nAct);
		}
		reset(nAct) {
			this.cmd = new Float64Array(nAct);
			this.history = [];
			this.efc = null;
		}
		/** Metrics of the current state (dark-hole contrast at λ0 and residual wavefront RMS). */
		measure(c, memo) {
			const o = opticsFor(c, memo);
			const s = dmSurface(dmFor(c), this.cmd);
			const E = trueHoleField(c, o, this.cmd, darkHoleFor(c));
			return {
				iteration: this.history.length,
				contrast: meanIntensity(E),
				rmsScience: rmsOverPupil(o.opdScience.map((v, i) => v + s[i]), o.pupil),
				rmsWfs: rmsOverPupil(o.opdWfs.map((v, i) => v + s[i]), o.pupil)
			};
		}
		/** One control iteration. Returns false if it was interrupted or is not possible with this configuration. */
		async step(c, memo, progress, pause) {
			if (this.history.length === 0) this.history.push(this.measure(c, memo));
			const o = opticsFor(c, memo);
			const dm = dmFor(c);
			const n = c.npup;
			const k = c.control.kind;
			if (k === "ao") {
				const modes = dmModesFor(c, o, memo);
				if (isPupilWfs(c.wfs.kind)) aoStep(pupilSensorFor(c, o, memo), calibrationFor(c, o, memo), modes, dm, o.amp, o.pupil, o.opdWfs, this.cmd, c.control.gain, c.wavelengthNm);
				else if (c.wfs.kind === "phase-diversity") {
					const spec = {
						modes: 10,
						diversityNm: .15 * c.wavelengthNm,
						wavelengthNm: c.wavelengthNm
					};
					const s = dmSurface(dm, this.cmd);
					phaseDiversityEstimate(o.pupil, n, diversityImages(o.amp, n, o.opdScience.map((v, i) => v + s[i]), spec), spec).forEach((v, j) => {
						const mc = modes.commands[j];
						if (mc) for (let a = 0; a < this.cmd.length; a++) this.cmd[a] -= c.control.gain * v * mc[a];
					});
				} else return false;
			} else {
				const dh = darkHoleFor(c);
				const meas = (off) => {
					const f = trueHoleField(c, o, off ? this.cmd.map((v, i) => v + off[i]) : this.cmd, dh);
					return f.re.map((v, i) => v * v + f.im[i] ** 2);
				};
				if (k === "speckle-nulling") {
					const I = meas(null);
					const r = speckleNullingStep(dm, dh, meas, 6, speckleProbeNm(I.reduce((a, b) => a + b, 0) / I.length), Math.min(1, c.control.gain + .2));
					for (let a = 0; a < this.cmd.length; a++) this.cmd[a] += r.update[a];
				} else {
					const J = await jacobianFor(c, memo, progress, pause);
					if (!J) return false;
					const key = `${J.rows}:${J.cols}:${c.control.alpha}:${JSON.stringify(c.coronagraph)}`;
					if (!this.efc || this.efc.key !== key) this.efc = {
						key,
						rec: efcMatrix(J, c.control.alpha)
					};
					let E;
					if (c.control.estimator === "perfect") E = trueHoleField(c, o, this.cmd, dh);
					else if (c.control.estimator === "scc") {
						const s = dmSurface(dm, this.cmd);
						const model = modelFor(c, memo);
						const f = sccFields(o.cor, entranceField(o.amp, o.opdScience.map((v, i) => v + s[i]), n, c.wavelengthNm, 1), DEFAULT_SCC, o.refPeak);
						const fm = sccFields(model.cor, entranceField(model.pupil, new Float64Array(n * n), n, c.wavelengthNm, 1), DEFAULT_SCC, model.refPeak);
						const est = sccEstimate(sccImage(f), f.u, fm.Er, DEFAULT_SCC);
						const pick = sccToHole(f.u, dh);
						E = {
							re: Float64Array.from(pick, (i) => est.re[i]),
							im: Float64Array.from(pick, (i) => est.im[i])
						};
					} else {
						const I = meas(null);
						const unit = probeCommands(dm, dh.spec, 1, 3);
						const amp = adaptiveProbeNm(J, unit[0], I.reduce((a, b) => a + b, 0) / I.length);
						E = pairwiseEstimate(J, unit.map((p) => p.map((v) => v * amp)), (off) => meas(off));
					}
					const u = efcUpdate(this.efc.rec, J, E, this.cmd.length, c.control.gain);
					for (let a = 0; a < this.cmd.length; a++) this.cmd[a] += u[a];
				}
			}
			this.history.push(this.measure(c, memo));
			return true;
		}
	};
	// src/worker/engine.ts
	/**
	* The physics engine behind the page: answers frame, throughput and loop requests. Used inside the Web Worker,
	* or on the main thread when workers are unavailable (page opened from a file).
	*/
	var SEPS = [
		0,
		.25,
		.5,
		.75,
		1,
		1.25,
		1.5,
		2,
		2.5,
		3,
		3.5,
		4,
		5,
		6,
		7,
		8,
		10,
		12
	];
	function createEngine(post) {
		const memo = new Memo(24);
		let loop = new LoopState(256);
		let nAct = 256;
		let generation = 0;
		let running = false;
		let latest = null;
		let looping = false;
		let queued = null;
		const tick = () => new Promise((r) => setTimeout(r, 0));
		const ensureDm = (c) => {
			const k = c.dm.nact * c.dm.nact;
			if (k !== nAct) {
				nAct = k;
				loop = new LoopState(k);
			}
		};
		async function frame(id, c) {
			const gen = ++generation;
			ensureDm(c);
			post({
				type: "frame",
				id,
				data: computeFrame(c, loop.cmd, memo)
			});
			await tick();
			if (gen !== generation) return;
			const pause = async () => {
				await tick();
				return gen === generation;
			};
			let reason = "";
			if (c.wfs.kind === "scc" && !sccCompatible(c.coronagraph)) reason = "The self-coherent camera needs a focal-plane mask and a Lyot stop (Lyot, APLC, Roddier, FQPM or vortex).";
			const data = reason ? null : await computeWfs(c, loop.cmd, memo, (f) => post({
				type: "progress",
				what: "Computing the Jacobian",
				fraction: f
			}), pause);
			if (gen !== generation) return;
			post({
				type: "progress",
				what: "",
				fraction: 1
			});
			post({
				type: "wfs",
				id,
				data,
				reason
			});
		}
		async function runLoop(c, iterations) {
			looping = true;
			try {
				await loopBody(c, iterations);
			} finally {
				looping = false;
			}
			const next = queued;
			queued = null;
			if (next) runLoop(next.config, next.iterations);
		}
		async function loopBody(c, iterations) {
			ensureDm(c);
			running = true;
			latest = c;
			for (let i = 0; i < iterations && running; i++) {
				const cfg = latest ?? c;
				const ok = await loop.step(cfg, memo, (f) => post({
					type: "progress",
					what: "Computing the Jacobian",
					fraction: f
				}), async () => {
					await tick();
					return running;
				});
				post({
					type: "progress",
					what: "",
					fraction: 1
				});
				if (!ok) {
					const why = cfg.control.kind === "ao" && !isPupilWfs(cfg.wfs.kind) && cfg.wfs.kind !== "phase-diversity" ? "AO-style modal control needs a pupil-plane sensor or phase diversity." : running ? "This loop cannot run with the current settings." : "Stopped.";
					running = false;
					post({
						type: "loop",
						history: loop.history,
						running: false,
						message: why
					});
					return;
				}
				post({
					type: "loop",
					history: loop.history,
					running: true,
					message: `Iteration ${loop.history.length - 1}`
				});
				await frame(-1, cfg);
			}
			running = false;
			post({
				type: "loop",
				history: loop.history,
				running: false,
				message: `Done: ${loop.history.length - 1} iterations.`
			});
		}
		return (req) => {
			try {
				if (req.type === "frame") {
					latest = req.config;
					frame(req.id, req.config);
				} else if (req.type === "throughput") {
					const o = opticsFor(req.config, memo);
					const curve = throughputCurve(o, SEPS.filter((s) => s <= req.config.fov));
					post({
						type: "throughput",
						id: req.id,
						curve,
						iwa: innerWorkingAngle(curve),
						designIwa: designIwa(o.cor.spec)
					});
				} else if (req.action === "stop") {
					running = false;
					queued = null;
				} else if (req.action === "reset") {
					running = false;
					queued = null;
					ensureDm(req.config);
					loop.reset(nAct);
					post({
						type: "loop",
						history: [],
						running: false,
						message: "Deformable mirror flattened."
					});
					frame(-1, req.config);
				} else if (looping) {
					running = false;
					queued = {
						config: req.config,
						iterations: req.iterations
					};
				} else runLoop(req.config, req.iterations);
			} catch (e) {
				post({
					type: "error",
					message: e instanceof Error ? e.message : String(e)
				});
			}
		};
	}
	// src/site/canvas.ts
	var poly = (c) => (t) => [
		0,
		1,
		2
	].map((k) => c.reduceRight((acc, ck) => acc * t + ck[k], 0));
	var viridis = poly([
		[
			.2777273272234177,
			.005407344544966578,
			.3340998053353061
		],
		[
			.1050930431085774,
			1.404613529898575,
			1.384590162594685
		],
		[
			-.3308618287255563,
			.214847559468213,
			.09509516302823659
		],
		[
			-4.634230498983486,
			-5.799100973351585,
			-19.33244095627987
		],
		[
			6.228269936347081,
			14.17993336680509,
			56.69055260068105
		],
		[
			4.776384997670288,
			-13.74514537774601,
			-65.35303263337234
		],
		[
			-5.435455855934631,
			4.645852612178535,
			26.3124352495832
		]
	]);
	var magma = poly([
		[
			-.002136485053939582,
			-.000749655052795221,
			-.005386127855323933
		],
		[
			.2516605407371642,
			.6775232436837668,
			2.494026599312351
		],
		[
			8.353717279216625,
			-3.577719514958484,
			.3144679030132573
		],
		[
			-27.66873308576866,
			14.26473078096533,
			-13.64921318813922
		],
		[
			52.17613981234068,
			-27.94360607168351,
			12.94416944238394
		],
		[
			-50.76852536473588,
			29.04658282127291,
			4.23415299384598
		],
		[
			18.65570506591883,
			-11.48977351997711,
			-5.601961508734096
		]
	]);
	var piecewise = (pts) => (t) => {
		const x = Math.min(.999999, Math.max(0, t)) * (pts.length - 1);
		const i = Math.floor(x), f = x - i;
		return [
			0,
			1,
			2
		].map((k) => pts[i][k] + (pts[i + 1][k] - pts[i][k]) * f);
	};
	var hex = (h) => [
		1,
		3,
		5
	].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
	var cividis = piecewise([
		"#00204D",
		"#00336F",
		"#39486B",
		"#575C6D",
		"#707173",
		"#8A8779",
		"#A69D75",
		"#C4B56C",
		"#E4CF5B",
		"#FFEA46"
	].map(hex));
	var diverging = piecewise([
		"#2c5aa0",
		"#5ab9ff",
		"#edf2ff",
		"#ffaa46",
		"#c0582b"
	].map(hex));
	var cyclic = piecewise([
		"#e2d9e2",
		"#7a9fcf",
		"#3c3b8f",
		"#2f1436",
		"#8f3b3b",
		"#d6935a",
		"#e2d9e2"
	].map(hex));
	var COLORMAPS = {
		viridis,
		magma,
		cividis
	};
	var COLORMAP_NAMES = Object.keys(COLORMAPS);
	var luts = /* @__PURE__ */ new Map();
	function lut(name, f) {
		const hit = luts.get(name);
		if (hit) return hit;
		const out = /* @__PURE__ */ new Uint8ClampedArray(768);
		for (let i = 0; i < 256; i++) {
			const c = f(i / 255);
			out[3 * i] = c[0] * 255;
			out[3 * i + 1] = c[1] * 255;
			out[3 * i + 2] = c[2] * 255;
		}
		luts.set(name, out);
		return out;
	}
	/** Normalised value in [0, 1] (NaN stays NaN). */
	function norm(v, s) {
		switch (s.kind) {
			case "log": return v > 0 ? 1 + Math.log10(v / s.max) / s.decades : 0;
			case "linear":
			case "grey": return (v - s.min) / (s.max - s.min || 1);
			case "diverging": return .5 + v / (2 * (s.limit || 1));
			case "phase": return (v + Math.PI) / (2 * Math.PI);
		}
	}
	function toImageData(img, s) {
		const table = s.kind === "diverging" ? lut("div", diverging) : s.kind === "phase" ? lut("cyc", cyclic) : s.kind === "grey" ? lut("grey", (t) => [
			t,
			t,
			t
		]) : lut(s.cmap, COLORMAPS[s.cmap] ?? viridis);
		const out = new ImageData(img.w, img.h);
		for (let i = 0; i < img.w * img.h; i++) {
			const v = img.data[i];
			if (Number.isNaN(v)) {
				out.data[4 * i + 3] = 0;
				continue;
			}
			const t = Math.min(255, Math.max(0, Math.round(norm(v, s) * 255)));
			out.data[4 * i] = table[3 * t];
			out.data[4 * i + 1] = table[3 * t + 1];
			out.data[4 * i + 2] = table[3 * t + 2];
			out.data[4 * i + 3] = 255;
		}
		return out;
	}
	/** Draw an image scaled to the canvas (nearest neighbour unless `smooth`), flipping y so that +v is up. */
	function drawImage(canvas, img, s, size = 0, smooth = false) {
		const w = size || canvas.clientWidth || img.w;
		const h = Math.round(w * img.h / img.w);
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		canvas.width = Math.round(w * dpr);
		canvas.height = Math.round(h * dpr);
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		const tmp = document.createElement("canvas");
		tmp.width = img.w;
		tmp.height = img.h;
		tmp.getContext("2d")?.putImageData(toImageData(img, s), 0, 0);
		ctx.save();
		ctx.imageSmoothingEnabled = smooth;
		ctx.fillStyle = "#05070f";
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.translate(0, canvas.height);
		ctx.scale(1, -1);
		ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
		ctx.restore();
	}
	function maxOf(img) {
		let m = 0;
		for (const v of img.data) if (v > m) m = v;
		return m;
	}
	function absMax(img) {
		let m = 0;
		for (const v of img.data) if (Math.abs(v) > m) m = Math.abs(v);
		return m;
	}
	/** CSS gradient of a colour map, for colour bars. */
	function gradientCss(name) {
		const f = COLORMAPS[name] ?? viridis;
		return `linear-gradient(90deg, ${Array.from({ length: 9 }, (_, i) => {
			return `rgb(${f(i / 8).map((x) => Math.round(x * 255)).join(",")}) ${i * 12.5}%`;
		}).join(", ")})`;
	}
	// src/site/controls.ts
	var cor = (c, p) => ({
		...c,
		coronagraph: {
			...c.coronagraph,
			...p
		}
	});
	var pup = (c, p) => ({
		...c,
		pupil: {
			...c.pupil,
			...p
		}
	});
	var ab = (c, p) => ({
		...c,
		aberrations: {
			...c.aberrations,
			...p
		}
	});
	var num = (v) => Number(v);
	var has = (...k) => (c) => k.includes(c.coronagraph.kind);
	var wfsIs = (...k) => (c) => k.includes(c.wfs.kind);
	var f = (d, unit = "") => (v) => `${v.toFixed(d)}${unit}`;
	var SUP = {
		"-": "⁻",
		0: "⁰",
		1: "¹",
		2: "²",
		3: "³",
		4: "⁴",
		5: "⁵",
		6: "⁶",
		7: "⁷",
		8: "⁸",
		9: "⁹"
	};
	/** 3.2 × 10⁻⁶ style. */
	var sci = (v) => {
		if (!(v > 0)) return "0";
		const e = Math.floor(Math.log10(v) + 1e-9);
		const m = v / 10 ** e;
		const exp = String(e).split("").map((ch) => SUP[ch] ?? ch).join("");
		return Math.abs(m - 1) < .05 ? `10${exp}` : `${m.toFixed(1)} × 10${exp}`;
	};
	var CORONAGRAPH_LABELS = {
		none: "No coronagraph",
		lyot: "Classical Lyot",
		aplc: "Apodized pupil Lyot (APLC)",
		bandlimited: "Band-limited Lyot",
		shaped: "Shaped pupil",
		roddier: "Roddier π phase mask",
		fqpm: "Four-quadrant phase mask",
		vortex: "Vortex",
		app: "Apodizing phase plate"
	};
	function zern(j, name, ncpa = false) {
		const key = ncpa ? "ncpaZernikeNm" : "zernikeNm";
		return {
			id: `${ncpa ? "ncpa" : "z"}${j}`,
			group: ncpa ? "g-ncpa" : "g-zern",
			label: `${name} (Z${j})`,
			type: "range",
			expert: true,
			min: -40,
			max: 40,
			step: 1,
			fmt: f(0, " nm"),
			get: (c) => c.aberrations[key][j - 2],
			set: (c, v) => ab(c, { [key]: c.aberrations[key].map((x, i) => i === j - 2 ? num(v) : x) })
		};
	}
	function planet(i, beginner) {
		const exists = (c) => c.planets.length > i;
		const upd = (c, p) => ({
			...c,
			planets: c.planets.map((x, k) => k === i ? {
				...x,
				...p
			} : x)
		});
		const n = i + 1;
		return [
			{
				id: `p${n}-sep`,
				group: "g-planet",
				label: `Planet ${n} separation`,
				type: "range",
				expert: !beginner,
				show: exists,
				min: .5,
				max: 14,
				step: .25,
				fmt: f(2, " λ/D"),
				get: (c) => c.planets[i]?.sep ?? 5,
				set: (c, v) => upd(c, { sep: num(v) })
			},
			{
				id: `p${n}-pa`,
				group: "g-planet",
				label: `Planet ${n} position angle`,
				type: "range",
				expert: true,
				show: exists,
				min: 0,
				max: 360,
				step: 5,
				fmt: f(0, "°"),
				get: (c) => c.planets[i]?.pa ?? 0,
				set: (c, v) => upd(c, { pa: num(v) })
			},
			{
				id: `p${n}-flux`,
				group: "g-planet",
				label: `Planet ${n} flux ratio`,
				type: "range",
				expert: !beginner,
				show: exists,
				min: -10,
				max: -2,
				step: .25,
				log: true,
				fmt: sci,
				get: (c) => c.planets[i]?.contrast ?? 1e-5,
				set: (c, v) => upd(c, { contrast: num(v) })
			}
		];
	}
	var CONTROLS = [
		{
			id: "pupil",
			group: "g-tel",
			label: "Telescope pupil",
			type: "select",
			options: [
				["circular", "Clear circular"],
				["obscured", "Obscured + spiders"],
				["segmented", "Segmented (hexagons)"]
			],
			get: (c) => c.pupil.kind,
			set: (c, v) => pup(c, { kind: v })
		},
		{
			id: "obsc",
			group: "g-tel",
			label: "Central obstruction",
			type: "range",
			expert: true,
			show: (c) => c.pupil.kind !== "circular",
			min: 0,
			max: .4,
			step: .01,
			fmt: f(2, " D"),
			get: (c) => c.pupil.obscuration,
			set: (c, v) => pup(c, { obscuration: num(v) })
		},
		{
			id: "spiders",
			group: "g-tel",
			label: "Spider vanes",
			type: "select",
			expert: true,
			show: (c) => c.pupil.kind === "obscured",
			options: [
				["0", "None"],
				["3", "3"],
				["4", "4"],
				["6", "6"]
			],
			get: (c) => String(c.pupil.spiders),
			set: (c, v) => pup(c, { spiders: num(v) })
		},
		{
			id: "spiderw",
			group: "g-tel",
			label: "Vane width",
			type: "range",
			expert: true,
			show: (c) => c.pupil.kind === "obscured",
			min: .002,
			max: .03,
			step: .001,
			fmt: f(3, " D"),
			get: (c) => c.pupil.spiderWidth,
			set: (c, v) => pup(c, { spiderWidth: num(v) })
		},
		{
			id: "rings",
			group: "g-tel",
			label: "Segment rings",
			type: "range",
			expert: true,
			show: (c) => c.pupil.kind === "segmented",
			min: 1,
			max: 4,
			step: 1,
			fmt: f(0),
			get: (c) => c.pupil.rings,
			set: (c, v) => pup(c, { rings: num(v) })
		},
		{
			id: "gap",
			group: "g-tel",
			label: "Segment gap",
			type: "range",
			expert: true,
			show: (c) => c.pupil.kind === "segmented",
			min: 0,
			max: .06,
			step: .005,
			fmt: f(3),
			get: (c) => c.pupil.gap,
			set: (c, v) => pup(c, { gap: num(v) })
		},
		{
			id: "lam",
			group: "g-tel",
			label: "Central wavelength λ0",
			type: "range",
			expert: true,
			min: 500,
			max: 2200,
			step: 10,
			fmt: f(0, " nm"),
			get: (c) => c.wavelengthNm,
			set: (c, v) => ({
				...c,
				wavelengthNm: num(v)
			})
		},
		{
			id: "band",
			group: "g-tel",
			label: "Bandwidth Δλ/λ0",
			type: "range",
			expert: true,
			min: 0,
			max: .3,
			step: .01,
			fmt: (v) => `${(v * 100).toFixed(0)} %`,
			get: (c) => c.bandwidth,
			set: (c, v) => ({
				...c,
				bandwidth: num(v)
			})
		},
		{
			id: "nlam",
			group: "g-tel",
			label: "Wavelength samples",
			type: "range",
			expert: true,
			show: (c) => c.bandwidth > 0,
			min: 3,
			max: 9,
			step: 2,
			fmt: f(0),
			get: (c) => c.nLambda,
			set: (c, v) => ({
				...c,
				nLambda: num(v)
			})
		},
		{
			id: "npup",
			group: "g-tel",
			label: "Pupil sampling",
			type: "select",
			expert: true,
			options: [["64", "64 px (fast)"], ["128", "128 px (fine)"]],
			get: (c) => String(c.npup),
			set: (c, v) => ({
				...c,
				npup: num(v)
			})
		},
		{
			id: "fov",
			group: "g-tel",
			label: "Detector half-field",
			type: "range",
			expert: true,
			min: 8,
			max: 20,
			step: 1,
			fmt: f(0, " λ/D"),
			get: (c) => c.fov,
			set: (c, v) => ({
				...c,
				fov: num(v)
			})
		},
		{
			id: "cor",
			group: "g-cor",
			label: "Coronagraph",
			type: "select",
			options: CORONAGRAPH_KINDS.map((k) => [k, CORONAGRAPH_LABELS[k]]),
			get: (c) => c.coronagraph.kind,
			set: (c, v) => {
				const k = v;
				return cor(c, {
					kind: k,
					lyotOuter: DEFAULT_LYOT_OUTER[k],
					maskRadius: k === "roddier" ? .53 : k === "aplc" ? 2 : 3
				});
			}
		},
		{
			id: "charge",
			group: "g-cor",
			label: "Vortex charge",
			type: "select",
			show: has("vortex"),
			options: [
				["2", "2"],
				["4", "4"],
				["6", "6"]
			],
			get: (c) => String(c.coronagraph.charge),
			set: (c, v) => cor(c, { charge: num(v) })
		},
		{
			id: "rmask",
			group: "g-cor",
			label: "Mask radius",
			type: "range",
			expert: true,
			show: has("lyot", "aplc", "roddier"),
			min: .3,
			max: 6,
			step: .05,
			fmt: f(2, " λ/D"),
			get: (c) => c.coronagraph.maskRadius,
			set: (c, v) => cor(c, { maskRadius: num(v) })
		},
		{
			id: "eps",
			group: "g-cor",
			label: "Band-limit ε",
			type: "range",
			expert: true,
			show: has("bandlimited"),
			min: .1,
			max: .4,
			step: .01,
			fmt: f(2, " D"),
			get: (c) => c.coronagraph.blEpsilon,
			set: (c, v) => cor(c, { blEpsilon: num(v) })
		},
		{
			id: "lyout",
			group: "g-cor",
			label: "Lyot stop diameter",
			type: "range",
			expert: true,
			show: has("lyot", "aplc", "roddier", "fqpm", "vortex", "bandlimited"),
			min: .5,
			max: 1,
			step: .01,
			fmt: f(2, " D"),
			get: (c) => c.coronagraph.lyotOuter,
			set: (c, v) => cor(c, { lyotOuter: num(v) })
		},
		{
			id: "lyin",
			group: "g-cor",
			label: "Lyot stop central block",
			type: "range",
			expert: true,
			show: has("lyot", "aplc", "roddier", "fqpm", "vortex"),
			min: 0,
			max: .5,
			step: .01,
			fmt: f(2, " D"),
			get: (c) => c.coronagraph.lyotInner,
			set: (c, v) => cor(c, { lyotInner: num(v) })
		},
		{
			id: "spband",
			group: "g-cor",
			label: "Shaped pupil band b",
			type: "range",
			expert: true,
			show: has("shaped"),
			min: 2,
			max: 6,
			step: .25,
			fmt: f(2, " λ/D"),
			get: (c) => c.coronagraph.shapedBand,
			set: (c, v) => cor(c, { shapedBand: num(v) })
		},
		{
			id: "spopen",
			group: "g-cor",
			label: "Shaped pupil openings",
			type: "range",
			expert: true,
			show: has("shaped"),
			min: 1,
			max: 6,
			step: 1,
			fmt: f(0),
			get: (c) => c.coronagraph.shapedOpenings,
			set: (c, v) => cor(c, { shapedOpenings: num(v) })
		},
		{
			id: "appiwa",
			group: "g-cor",
			label: "APP dark hole inner edge",
			type: "range",
			expert: true,
			show: has("app"),
			min: 1.5,
			max: 4,
			step: .25,
			fmt: f(2, " λ/D"),
			get: (c) => c.coronagraph.appIwa,
			set: (c, v) => cor(c, { appIwa: num(v) })
		},
		{
			id: "appowa",
			group: "g-cor",
			label: "APP dark hole outer edge",
			type: "range",
			expert: true,
			show: has("app"),
			min: 6,
			max: 14,
			step: .5,
			fmt: f(1, " λ/D"),
			get: (c) => c.coronagraph.appOwa,
			set: (c, v) => cor(c, { appOwa: num(v) })
		},
		{
			id: "vapp",
			group: "g-cor",
			label: "Vector APP (geometric phase)",
			type: "check",
			expert: true,
			show: has("app"),
			get: (c) => c.coronagraph.appVector,
			set: (c, v) => cor(c, { appVector: Boolean(v) })
		},
		{
			id: "vchan",
			group: "g-cor",
			label: "vAPP channel",
			type: "select",
			expert: true,
			show: (c) => c.coronagraph.kind === "app" && c.coronagraph.appVector,
			options: [
				["left", "Left circular (hole on the right)"],
				["right", "Right circular (hole on the left)"],
				["sum", "Both, unseparated"]
			],
			get: (c) => c.coronagraph.vappChannel,
			set: (c, v) => cor(c, { vappChannel: v })
		},
		{
			id: "vleak",
			group: "g-cor",
			label: "vAPP leakage",
			type: "range",
			expert: true,
			show: (c) => c.coronagraph.kind === "app" && c.coronagraph.appVector,
			min: 0,
			max: .1,
			step: .005,
			fmt: (v) => `${(v * 100).toFixed(1)} %`,
			get: (c) => c.coronagraph.vappLeakage,
			set: (c, v) => cor(c, { vappLeakage: num(v) })
		},
		{
			id: "screen",
			group: "g-ab",
			label: "Random wavefront error",
			type: "range",
			min: 0,
			max: 40,
			step: 1,
			fmt: f(0, " nm RMS"),
			get: (c) => c.aberrations.screenRmsNm,
			set: (c, v) => ab(c, { screenRmsNm: num(v) })
		},
		{
			id: "slope",
			group: "g-ab",
			label: "Screen PSD slope α",
			type: "range",
			expert: true,
			min: 1.5,
			max: 4,
			step: .1,
			fmt: f(1),
			get: (c) => c.aberrations.screenSlope,
			set: (c, v) => ab(c, { screenSlope: num(v) })
		},
		{
			id: "ampl",
			group: "g-ab",
			label: "Amplitude errors",
			type: "range",
			expert: true,
			min: 0,
			max: .05,
			step: .002,
			fmt: (v) => `${(v * 100).toFixed(1)} % RMS`,
			get: (c) => c.aberrations.amplitudeRms,
			set: (c, v) => ab(c, { amplitudeRms: num(v) })
		},
		zern(2, "Tip"),
		zern(3, "Tilt"),
		zern(4, "Defocus"),
		zern(5, "Astigmatism 45°"),
		zern(6, "Astigmatism 0°"),
		zern(7, "Coma y"),
		zern(8, "Coma x"),
		zern(9, "Trefoil y"),
		zern(10, "Trefoil x"),
		zern(11, "Spherical"),
		{
			id: "ncpa",
			group: "g-ncpa",
			label: "Random NCPA",
			type: "range",
			min: 0,
			max: 20,
			step: 1,
			fmt: f(0, " nm RMS"),
			get: (c) => c.aberrations.ncpaRmsNm,
			set: (c, v) => ab(c, { ncpaRmsNm: num(v) })
		},
		zern(4, "NCPA defocus", true),
		zern(5, "NCPA astigmatism 45°", true),
		zern(6, "NCPA astigmatism 0°", true),
		zern(8, "NCPA coma x", true),
		{
			id: "nplanets",
			group: "g-planet",
			label: "Number of planets",
			type: "select",
			expert: true,
			options: [
				["0", "None"],
				["1", "1"],
				["2", "2"],
				["3", "3"]
			],
			get: (c) => String(c.planets.length),
			set: (c, v) => {
				const n = num(v);
				const base = [
					{
						sep: 5,
						pa: 30,
						contrast: 1e-5
					},
					{
						sep: 8,
						pa: 200,
						contrast: 1e-6
					},
					{
						sep: 2.5,
						pa: 110,
						contrast: 1e-4
					}
				];
				return {
					...c,
					planets: base.slice(0, n).map((p, i) => c.planets[i] ?? p)
				};
			}
		},
		...planet(0, true),
		...planet(1, false),
		...planet(2, false),
		{
			id: "wfs",
			group: "g-wfs",
			label: "Wavefront sensor",
			type: "select",
			options: [
				["shack-hartmann", "Shack–Hartmann (pupil)"],
				["pyramid", "Pyramid (pupil)"],
				["zernike", "Zernike (pupil)"],
				["curvature", "Curvature (pupil)"],
				["pairwise", "Pairwise probing (focal)"],
				["phase-diversity", "Phase diversity (focal)"],
				["scc", "Self-coherent camera (focal)"]
			],
			get: (c) => c.wfs.kind,
			set: (c, v) => {
				const kind = v;
				const control = kind === "pairwise" || kind === "scc" ? {
					...c.control,
					kind: c.control.kind === "ao" ? "efc" : c.control.kind,
					estimator: kind === "scc" ? "scc" : "pairwise"
				} : {
					...c.control,
					kind: "ao"
				};
				return {
					...c,
					wfs: {
						...c.wfs,
						kind
					},
					control
				};
			}
		},
		{
			id: "nsub",
			group: "g-wfs",
			label: "Subapertures across",
			type: "select",
			expert: true,
			show: wfsIs("shack-hartmann"),
			options: [
				["4", "4"],
				["8", "8"],
				["16", "16"]
			],
			get: (c) => String(c.wfs.nsub),
			set: (c, v) => ({
				...c,
				wfs: {
					...c.wfs,
					nsub: num(v)
				}
			})
		},
		{
			id: "mod",
			group: "g-wfs",
			label: "Pyramid modulation",
			type: "range",
			expert: true,
			show: wfsIs("pyramid"),
			min: 0,
			max: 6,
			step: .5,
			fmt: f(1, " λ/D"),
			get: (c) => c.wfs.modulation,
			set: (c, v) => ({
				...c,
				wfs: {
					...c.wfs,
					modulation: num(v)
				}
			})
		},
		{
			id: "zdist",
			group: "g-wfs",
			label: "Defocus distance z′",
			type: "range",
			expert: true,
			show: wfsIs("curvature"),
			min: .01,
			max: .2,
			step: .01,
			fmt: f(2),
			get: (c) => c.wfs.curvatureDistance,
			set: (c, v) => ({
				...c,
				wfs: {
					...c.wfs,
					curvatureDistance: num(v)
				}
			})
		},
		{
			id: "modes",
			group: "g-wfs",
			label: "Controlled modes",
			type: "range",
			expert: true,
			show: wfsIs("shack-hartmann", "pyramid", "zernike", "curvature"),
			min: 5,
			max: 50,
			step: 5,
			fmt: f(0),
			get: (c) => c.wfs.modes,
			set: (c, v) => ({
				...c,
				wfs: {
					...c.wfs,
					modes: num(v)
				}
			})
		},
		{
			id: "ctl",
			group: "g-ctl",
			label: "Control law",
			type: "select",
			expert: true,
			options: [
				["ao", "AO integrator (modal)"],
				["efc", "Electric field conjugation"],
				["speckle-nulling", "Speckle nulling"]
			],
			get: (c) => c.control.kind,
			set: (c, v) => ({
				...c,
				control: {
					...c.control,
					kind: v
				}
			})
		},
		{
			id: "est",
			group: "g-ctl",
			label: "EFC field estimate",
			type: "select",
			expert: true,
			show: (c) => c.control.kind === "efc",
			options: [
				["pairwise", "Pairwise probing"],
				["scc", "Self-coherent camera"],
				["perfect", "Perfect knowledge (model)"]
			],
			get: (c) => c.control.estimator,
			set: (c, v) => ({
				...c,
				control: {
					...c.control,
					estimator: v
				}
			})
		},
		{
			id: "gain",
			group: "g-ctl",
			label: "Loop gain",
			type: "range",
			expert: true,
			min: .1,
			max: 1,
			step: .05,
			fmt: f(2),
			get: (c) => c.control.gain,
			set: (c, v) => ({
				...c,
				control: {
					...c.control,
					gain: num(v)
				}
			})
		},
		{
			id: "dhiwa",
			group: "g-ctl",
			label: "Dark hole inner edge",
			type: "range",
			expert: true,
			min: 1.5,
			max: 6,
			step: .5,
			fmt: f(1, " λ/D"),
			get: (c) => c.control.iwa,
			set: (c, v) => ({
				...c,
				control: {
					...c.control,
					iwa: num(v)
				}
			})
		},
		{
			id: "dhowa",
			group: "g-ctl",
			label: "Dark hole outer edge",
			type: "range",
			expert: true,
			min: 4,
			max: 10,
			step: .5,
			fmt: f(1, " λ/D"),
			get: (c) => c.control.owa,
			set: (c, v) => ({
				...c,
				control: {
					...c.control,
					owa: num(v)
				}
			})
		},
		{
			id: "dhhalf",
			group: "g-ctl",
			label: "One-sided dark hole",
			type: "check",
			expert: true,
			get: (c) => c.control.half,
			set: (c, v) => ({
				...c,
				control: {
					...c.control,
					half: Boolean(v)
				}
			})
		},
		{
			id: "alpha",
			group: "g-ctl",
			label: "EFC regularisation α",
			type: "range",
			expert: true,
			show: (c) => c.control.kind === "efc",
			min: -6,
			max: -1,
			step: .25,
			log: true,
			fmt: sci,
			get: (c) => c.control.alpha,
			set: (c, v) => ({
				...c,
				control: {
					...c.control,
					alpha: num(v)
				}
			})
		},
		{
			id: "nact",
			group: "g-ctl",
			label: "DM actuators across",
			type: "select",
			expert: true,
			options: [
				["8", "8 × 8"],
				["12", "12 × 12"],
				["16", "16 × 16"],
				["20", "20 × 20"]
			],
			get: (c) => String(c.dm.nact),
			set: (c, v) => ({
				...c,
				dm: {
					...c.dm,
					nact: num(v)
				}
			})
		},
		{
			id: "coupling",
			group: "g-ctl",
			label: "Actuator coupling",
			type: "range",
			expert: true,
			min: .05,
			max: .3,
			step: .01,
			fmt: f(2),
			get: (c) => c.dm.coupling,
			set: (c, v) => ({
				...c,
				dm: {
					...c.dm,
					coupling: num(v)
				}
			})
		},
		{
			id: "noise",
			group: "g-det",
			label: "Photon and read noise",
			type: "check",
			expert: true,
			get: (c) => c.detector.noise,
			set: (c, v) => ({
				...c,
				detector: {
					...c.detector,
					noise: Boolean(v)
				}
			})
		},
		{
			id: "photons",
			group: "g-det",
			label: "Photons in the PSF peak",
			type: "range",
			expert: true,
			show: (c) => c.detector.noise,
			min: 4,
			max: 12,
			step: .5,
			log: true,
			fmt: sci,
			get: (c) => c.detector.peakPhotons,
			set: (c, v) => ({
				...c,
				detector: {
					...c.detector,
					peakPhotons: num(v)
				}
			})
		},
		{
			id: "rn",
			group: "g-det",
			label: "Read noise",
			type: "range",
			expert: true,
			show: (c) => c.detector.noise,
			min: 0,
			max: 20,
			step: .5,
			fmt: f(1, " e⁻"),
			get: (c) => c.detector.readNoise,
			set: (c, v) => ({
				...c,
				detector: {
					...c.detector,
					readNoise: num(v)
				}
			})
		}
	];
	/** Build the rows inside their fieldsets. `onChange` receives the new configuration. */
	function buildControls(getConfig, onChange) {
		const rows = [];
		for (const spec of CONTROLS) {
			const host = document.getElementById(spec.group);
			if (!host) continue;
			const row = document.createElement("div");
			row.className = spec.type === "check" ? "field chk-field" : "field";
			if (spec.expert) row.classList.add("expert-only");
			const label = document.createElement("label");
			label.htmlFor = spec.id;
			label.textContent = spec.label;
			let input;
			let out = null;
			if (spec.type === "select") {
				const s = document.createElement("select");
				for (const [v, t] of spec.options ?? []) {
					const o = document.createElement("option");
					o.value = v;
					o.textContent = t;
					s.appendChild(o);
				}
				input = s;
			} else {
				const i = document.createElement("input");
				i.type = spec.type === "check" ? "checkbox" : "range";
				if (spec.type === "range") {
					i.min = String(spec.min);
					i.max = String(spec.max);
					i.step = String(spec.step);
				}
				input = i;
				if (spec.type === "range") {
					out = document.createElement("output");
					out.htmlFor.add(spec.id);
				}
			}
			input.id = spec.id;
			const update = () => {
				const raw = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input instanceof HTMLInputElement ? Number(input.value) : input.value;
				const v = spec.log && typeof raw === "number" ? 10 ** raw : raw;
				onChange(spec.set(getConfig(), v));
			};
			input.addEventListener(spec.type === "range" ? "input" : "change", update);
			row.append(label, input);
			if (out) row.appendChild(out);
			host.appendChild(row);
			rows.push({
				spec,
				row,
				input,
				out
			});
		}
		return () => {
			const c = getConfig();
			for (const { spec, row, input, out } of rows) {
				row.hidden = spec.show ? !spec.show(c) : false;
				const v = spec.get(c);
				if (input instanceof HTMLInputElement && input.type === "checkbox") input.checked = Boolean(v);
				else if (input instanceof HTMLInputElement) {
					const x = spec.log ? Math.log10(Number(v)) : Number(v);
					if (document.activeElement !== input) input.value = String(x);
					if (out) out.textContent = spec.fmt ? spec.fmt(Number(v)) : String(v);
					input.setAttribute("aria-valuetext", out?.textContent ?? String(v));
				} else input.value = String(v);
			}
		};
	}
	// src/site/plots.ts
	/** Okabe–Ito colours, distinguishable with the common forms of colour blindness. */
	var PALETTE = {
		orange: "#E69F00",
		sky: "#56B4E9",
		green: "#009E73",
		yellow: "#F0E442",
		blue: "#0072B2",
		vermillion: "#D55E00",
		pink: "#CC79A7",
		grey: "#b3bfd8"
	};
	function drawPlot(canvas, p) {
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		const W = canvas.clientWidth || 480, H = canvas.clientHeight || 280;
		canvas.width = Math.round(W * dpr);
		canvas.height = Math.round(H * dpr);
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, W, H);
		const L = 58, R = 12, T = 12, B = 40;
		const xs = p.series.flatMap((s) => s.x);
		const ys = p.series.flatMap((s) => s.y).filter((v) => Number.isFinite(v) && (!p.logY || v > 0));
		const xMin = p.xMin ?? Math.min(...xs, 0), xMax = p.xMax ?? Math.max(...xs, 1);
		let yMin = p.yMin ?? Math.min(...ys), yMax = p.yMax ?? Math.max(...ys);
		if (!ys.length) {
			yMin = p.logY ? 1e-10 : 0;
			yMax = 1;
		}
		if (p.logY) {
			yMin = 10 ** Math.floor(Math.log10(yMin));
			yMax = 10 ** Math.ceil(Math.log10(yMax));
			if (yMin === yMax) yMin = yMax / 10;
		} else if (yMin === yMax) {
			yMin -= 1;
			yMax += 1;
		}
		const X = (x) => L + (x - xMin) / (xMax - xMin || 1) * (W - L - R);
		const Y = (y) => {
			const t = p.logY ? (Math.log10(y) - Math.log10(yMin)) / (Math.log10(yMax) - Math.log10(yMin)) : (y - yMin) / (yMax - yMin);
			return H - B - t * (H - T - B);
		};
		ctx.font = "11px ui-monospace, monospace";
		ctx.strokeStyle = "rgba(255,255,255,.12)";
		ctx.fillStyle = "#b3bfd8";
		ctx.lineWidth = 1;
		if (p.logY) {
			const d0 = Math.log10(yMin), d1 = Math.log10(yMax);
			const step = Math.max(1, Math.ceil((d1 - d0) / 6));
			for (let d = d0; d <= d1; d += step) {
				const y = Y(10 ** d);
				ctx.beginPath();
				ctx.moveTo(L, y);
				ctx.lineTo(W - R, y);
				ctx.stroke();
				ctx.textAlign = "right";
				ctx.fillText(`1e${d}`, 52, y + 4);
			}
		} else for (let i = 0; i <= 4; i++) {
			const v = yMin + (yMax - yMin) * i / 4, y = Y(v);
			ctx.beginPath();
			ctx.moveTo(L, y);
			ctx.lineTo(W - R, y);
			ctx.stroke();
			ctx.textAlign = "right";
			ctx.fillText(Math.abs(v) >= 100 ? v.toFixed(0) : v.toPrecision(2), 52, y + 4);
		}
		const xt = niceStep((xMax - xMin) / 6);
		for (let v = Math.ceil(xMin / xt) * xt; v <= xMax + 1e-9; v += xt) {
			const x = X(v);
			ctx.beginPath();
			ctx.moveTo(x, T);
			ctx.lineTo(x, H - B);
			ctx.stroke();
			ctx.textAlign = "center";
			ctx.fillText(String(+v.toFixed(2)), x, H - B + 15);
		}
		ctx.fillStyle = "#edf2ff";
		ctx.font = "12px system-ui, sans-serif";
		ctx.textAlign = "center";
		ctx.fillText(p.xLabel, L + (W - L - R) / 2, H - 6);
		ctx.save();
		ctx.translate(13, T + (H - T - B) / 2);
		ctx.rotate(-Math.PI / 2);
		ctx.fillText(p.yLabel, 0, 0);
		ctx.restore();
		ctx.save();
		ctx.beginPath();
		ctx.rect(L, T, W - L - R, H - T - B);
		ctx.clip();
		for (const m of p.markers ?? []) {
			if (!Number.isFinite(m.x)) continue;
			ctx.strokeStyle = m.color;
			ctx.setLineDash([3, 3]);
			ctx.beginPath();
			ctx.moveTo(X(m.x), T);
			ctx.lineTo(X(m.x), H - B);
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.fillStyle = m.color;
			ctx.textAlign = "left";
			ctx.font = "11px system-ui, sans-serif";
			ctx.fillText(m.label, X(m.x) + 4, 24);
		}
		for (const s of p.series) {
			ctx.strokeStyle = s.color;
			ctx.fillStyle = s.color;
			ctx.lineWidth = 2;
			ctx.setLineDash(s.dash ? [...s.dash] : []);
			ctx.beginPath();
			let started = false;
			s.x.forEach((x, i) => {
				const y = s.y[i];
				if (!Number.isFinite(y) || p.logY && y <= 0) {
					started = false;
					return;
				}
				if (!started) {
					ctx.moveTo(X(x), Y(y));
					started = true;
				} else ctx.lineTo(X(x), Y(y));
			});
			ctx.stroke();
			if (s.points) s.x.forEach((x, i) => {
				const y = s.y[i];
				if (Number.isFinite(y) && (!p.logY || y > 0)) {
					ctx.beginPath();
					ctx.arc(X(x), Y(y), 3, 0, 2 * Math.PI);
					ctx.fill();
				}
			});
		}
		ctx.restore();
		ctx.setLineDash([]);
		ctx.font = "11px system-ui, sans-serif";
		ctx.textAlign = "left";
		let lx = 66;
		for (const s of p.series) {
			ctx.strokeStyle = s.color;
			ctx.lineWidth = 2;
			ctx.setLineDash(s.dash ? [...s.dash] : []);
			ctx.beginPath();
			ctx.moveTo(lx, 22);
			ctx.lineTo(lx + 16, 22);
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.fillStyle = "#edf2ff";
			ctx.fillText(s.label, lx + 20, 26);
			lx += 28 + ctx.measureText(s.label).width;
		}
	}
	function niceStep(raw) {
		const p = 10 ** Math.floor(Math.log10(raw || 1));
		const f = raw / p;
		return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
	}
	// src/site/diagram.ts
	var CY = 120;
	var H = 38;
	var TEL = 58;
	var X = {
		star: 30,
		tel: 110,
		f0: 165,
		L1: 220,
		A: 268,
		DM: 330,
		BS: 392,
		L2: 446,
		B: 512,
		L3: 578,
		C: 630,
		L4: 688,
		D: 758
	};
	var PLANE_IDS = [
		"A",
		"DM",
		"B",
		"C",
		"D",
		"WFS"
	];
	var PLANE_NAMES = {
		A: "A · Entrance pupil",
		DM: "Deformable mirror",
		B: "B · Focal-plane mask",
		C: "C · Lyot stop",
		D: "D · Detector",
		WFS: "Wavefront sensor"
	};
	var WFS_NAMES = {
		"shack-hartmann": "Shack–Hartmann",
		pyramid: "Pyramid",
		zernike: "Zernike sensor",
		curvature: "Curvature sensor",
		pairwise: "Pairwise probing",
		"phase-diversity": "Phase diversity",
		scc: "Self-coherent camera"
	};
	function lens(x, h) {
		return `<path d="M${x} ${CY - h} Q${x + 9} ${CY} ${x} ${CY + h} Q${x - 9} ${CY} ${x} ${CY - h}Z" class="lens"/>`;
	}
	/** Edge rays of a beam through the train; `dy` is the focal offset (planet). */
	function beam(dy, cls) {
		const tilt = dy * .5;
		const pts = (s) => [
			[X.star + 18, CY + s * TEL - tilt * 2],
			[X.tel, CY + s * TEL],
			[X.f0, CY + dy],
			[X.L1, CY + s * H],
			[X.L2, CY + s * H + tilt],
			[X.B, CY + dy],
			[X.L3, CY + s * H],
			[X.L4, CY + s * H + tilt],
			[X.D, CY + dy]
		];
		const top = pts(-1), bot = pts(1);
		return `<polygon points="${[...top, ...bot.reverse()].map(([x, y]) => `${x},${y}`).join(" ")}" class="${cls}"/>`;
	}
	function planeGroup(id, x, inner, label, aria) {
		return `<g class="plane" data-plane="${id}" role="button" tabindex="0" aria-label="${aria}">
    <rect class="hit" x="${x - 26}" y="42" width="52" height="${id === "WFS" ? 150 : 200}" rx="8"/>${inner}
    <text x="${x}" y="212" class="lbl">${label}</text></g>`;
	}
	function maskB(c) {
		const k = c.coronagraph.kind, x = X.B;
		switch (k) {
			case "lyot":
			case "aplc": return `<line x1="${x}" y1="74" x2="${x}" y2="166" class="glass"/><circle cx="${x}" cy="${CY}" r="7" class="occ"/>`;
			case "roddier": return `<line x1="${x}" y1="74" x2="${x}" y2="166" class="glass"/><circle cx="${x}" cy="${CY}" r="4" class="phase"/><text x="${x + 8}" y="112" class="tiny">π</text>`;
			case "fqpm": return `<rect x="${x - 4}" y="74" width="8" height="46" class="phase"/><rect x="${x - 4}" y="${CY}" width="8" height="46" class="glassfill"/><line x1="${x - 8}" y1="${CY}" x2="${x + 8}" y2="${CY}" class="edge"/>`;
			case "vortex": return `<rect x="${x - 4}" y="74" width="8" height="92" fill="url(#vortex)"/><text x="${x + 8}" y="90" class="tiny">l=${c.coronagraph.charge}</text>`;
			case "bandlimited": return `<rect x="${x - 4}" y="74" width="8" height="92" fill="url(#bl)"/>`;
			default: return `<line x1="${x}" y1="74" x2="${x}" y2="166" class="none"/><text x="${x}" y="68" class="tiny mid">no mask</text>`;
		}
	}
	function elementA(c) {
		const k = c.coronagraph.kind, x = X.A;
		if (k === "aplc") return `<rect x="${x - 5}" y="82" width="10" height="76" fill="url(#apod)"/><text x="${x}" y="74" class="tiny mid">apodizer</text>`;
		if (k === "shaped") return `<rect x="${x - 5}" y="82" width="10" height="76" class="occ"/>${[
			-24,
			-8,
			8,
			24
		].map((d) => `<rect x="${x - 5}" y="${CY + d - 4}" width="10" height="8" class="slit"/>`).join("")}<text x="${x}" y="74" class="tiny mid">shaped pupil</text>`;
		if (k === "app") return `<rect x="${x - 5}" y="82" width="10" height="76" fill="url(#app)"/><text x="${x}" y="74" class="tiny mid">${c.coronagraph.appVector ? "vAPP" : "APP"}</text>`;
		return `<line x1="${x}" y1="78" x2="${x}" y2="162" class="none"/><text x="${x}" y="74" class="tiny mid">pupil</text>`;
	}
	function lyotC(c) {
		const x = X.C, k = c.coronagraph.kind;
		if (k === "none" || k === "shaped" || k === "app") return `<line x1="${x}" y1="78" x2="${x}" y2="162" class="none"/><text x="${x}" y="74" class="tiny mid">no stop</text>`;
		const open = H * Math.min(1, c.coronagraph.kind === "bandlimited" ? 1 - c.coronagraph.blEpsilon : c.coronagraph.lyotOuter);
		const top = c.wfs.kind === "scc" ? `<rect x="${x - 4}" y="52" width="8" height="12" class="occ"/><rect x="${x - 4}" y="67" width="8" height="${53 - open}" class="occ"/><text x="${x + 8}" y="64" class="tiny">hole</text>` : `<rect x="${x - 4}" y="52" width="8" height="${68 - open}" class="occ"/>`;
		const inner = c.coronagraph.lyotInner > 0 || c.pupil.kind !== "circular" ? `<rect x="${x - 4}" y="115" width="8" height="10" class="occ"/>` : "";
		return `${top}<rect x="${x - 4}" y="${CY + open}" width="8" height="${68 - open}" class="occ"/>${inner}`;
	}
	function diagramSvg(c) {
		const pupilWfs = isPupilWfs(c.wfs.kind);
		const wfsX = pupilWfs ? X.BS : X.D;
		const wfsName = WFS_NAMES[c.wfs.kind] ?? c.wfs.kind;
		const branch = pupilWfs ? `<polygon points="${X.BS - 10},${CY} ${X.BS + 10},${CY} ${X.BS + 18},226 ${X.BS - 18},226" class="beam-wfs"/>` : `<path d="M${X.D} 150 V226" class="link"/>`;
		const planet = c.planets.length > 0;
		return `<svg viewBox="0 0 820 330" role="group" aria-labelledby="t-train" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="apod" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#111"/><stop offset=".5" stop-color="#edf2ff"/><stop offset="1" stop-color="#111"/></linearGradient>
    <linearGradient id="vortex" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3c3b8f"/><stop offset=".25" stop-color="#7a9fcf"/><stop offset=".5" stop-color="#e2d9e2"/><stop offset=".75" stop-color="#d6935a"/><stop offset="1" stop-color="#8f3b3b"/></linearGradient>
    <linearGradient id="bl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#edf2ff"/><stop offset=".4" stop-color="#888"/><stop offset=".5" stop-color="#111"/><stop offset=".6" stop-color="#888"/><stop offset="1" stop-color="#edf2ff"/></linearGradient>
    <pattern id="app" width="10" height="12" patternUnits="userSpaceOnUse"><rect width="10" height="12" fill="#2a3d63"/><path d="M0 6 Q2.5 0 5 6 T10 6" stroke="#8fe3ff" fill="none"/></pattern>
  </defs>
  ${beam(0, "beam-star")}${planet ? beam(-14, "beam-planet") : ""}${branch}
  <circle cx="${X.star}" cy="${CY}" r="9" fill="${PALETTE.orange}"/><text x="${X.star}" y="146" class="tiny mid">star</text>
  ${planet ? `<circle cx="${X.star}" cy="76" r="4" fill="${PALETTE.sky}"/><text x="${X.star}" y="66" class="tiny mid">planet</text>` : ""}
  ${lens(X.tel, TEL)}<text x="${X.tel}" y="194" class="tiny mid">telescope</text>
  ${lens(X.L1, 44)}${lens(X.L2, 44)}${lens(X.L3, 44)}${lens(X.L4, 44)}
  <line x1="${X.BS - 12}" y1="134" x2="${X.BS + 12}" y2="106" class="bs"/><text x="${X.BS}" y="74" class="tiny mid">beam splitter</text>
  ${planeGroup("A", X.A, elementA(c), "A", "Plane A, entrance pupil: open the large view")}
  ${planeGroup("DM", X.DM, `<rect x="${X.DM - 6}" y="82" width="12" height="76" class="dm"/>${[
			-28,
			-14,
			0,
			14,
			28
		].map((d) => `<circle cx="${X.DM}" cy="${CY + d}" r="2" class="act"/>`).join("")}`, "DM", "Deformable mirror: open the large view")}
  ${planeGroup("B", X.B, maskB(c), "B", "Plane B, focal-plane mask: open the large view")}
  ${planeGroup("C", X.C, lyotC(c), "C", "Plane C, Lyot stop: open the large view")}
  ${planeGroup("D", X.D, `<rect x="${X.D - 3}" y="80" width="14" height="80" class="det"/>`, "D", "Plane D, detector: open the large view")}
  <g class="plane" data-plane="WFS" role="button" tabindex="0" aria-label="Wavefront sensor (${wfsName}): open the large view">
    <rect x="${wfsX - 70}" y="228" width="140" height="44" rx="8" class="wfsbox"/>
    <text x="${wfsX}" y="247" class="lbl">${wfsName}</text>
    <text x="${wfsX}" y="263" class="tiny mid">${pupilWfs ? "pupil-plane sensor" : "uses the science camera"}</text>
  </g>
  <text x="10" y="318" class="tiny"><tspan fill="${PALETTE.orange}">■</tspan> starlight (on axis)  ${planet ? `<tspan fill="${PALETTE.sky}">■</tspan> planet light (off axis)` : ""}</text>
</svg>`;
	}
	// src/site/files.ts
	function download(name, blob) {
		const a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = name;
		document.body.appendChild(a);
		a.click();
		setTimeout(() => {
			URL.revokeObjectURL(a.href);
			a.remove();
		}, 0);
	}
	function savePng(canvas, name) {
		canvas.toBlob((b) => {
			if (b) download(name, b);
		}, "image/png");
	}
	function csv(header, rows) {
		return [header.join(","), ...rows.map((r) => r.map((v) => Number.isFinite(v) ? v.toPrecision(6) : "").join(","))].join("\n") + "\n";
	}
	function contrastCsv(c, base) {
		return csv([
			"separation_lambda_over_D",
			"raw_contrast",
			"bare_telescope"
		], c.r.map((r, i) => [
			r,
			c.value[i],
			base.value[base.r.indexOf(r)] ?? NaN
		]));
	}
	function throughputCsv(t) {
		return csv(["separation_lambda_over_D", "core_throughput"], t.r.map((r, i) => [r, t.value[i]]));
	}
	function loopCsv(h) {
		return csv([
			"iteration",
			"dark_hole_contrast",
			"rms_science_nm",
			"rms_wfs_nm"
		], h.map((p) => [
			p.iteration,
			p.contrast,
			p.rmsScience,
			p.rmsWfs
		]));
	}
	function saveText(name, text) {
		download(name, new Blob([text], { type: "text/csv" }));
	}
	// src/content/references.ts
	/** Short author–year label, e.g. "Kuchner & Traub 2002" or "Rouan et al. 2000". */
	function shortCite(r) {
		const last = (a) => a.split(",")[0];
		return `${r.authors.length === 1 ? last(r.authors[0]) : r.authors.length === 2 ? `${last(r.authors[0])} & ${last(r.authors[1])}` : `${last(r.authors[0])} et al.`} ${r.year}`;
	}
	/** Full citation text, without the DOI link. */
	function fullCite(r) {
		return `${r.authors.length > 6 ? `${r.authors.slice(0, 6).join(", ")}, et al.` : r.authors.join(", ")} ${r.year}, “${r.title}”, ${r.journal} ${r.volume}, ${r.pages}.`;
	}
	// src/site/panels.ts
	var katex = () => window.katex;
	function el(tag, cls = "", text = "") {
		const e = document.createElement(tag);
		if (cls) e.className = cls;
		if (text) e.textContent = text;
		return e;
	}
	/** Text with $inline TeX$. */
	function rich(text) {
		const frag = document.createDocumentFragment();
		for (const part of text.split(/(\$[^$]+\$)/)) if (part.startsWith("$") && part.endsWith("$") && part.length > 2) {
			const span = el("span");
			const k = katex();
			if (k) k.render(part.slice(1, -1), span, {
				throwOnError: false,
				strict: "ignore"
			});
			else span.textContent = part.slice(1, -1);
			frag.appendChild(span);
		} else if (part) frag.appendChild(document.createTextNode(part));
		return frag;
	}
	function list(title, items) {
		const box = el("div", "info-list");
		box.appendChild(el("h4", "", title));
		const ul = el("ul");
		for (const i of items) ul.appendChild(el("li", "", i));
		box.appendChild(ul);
		return box;
	}
	function renderInfo(host, e, content, expert) {
		host.textContent = "";
		const head = el("div", "info-head");
		head.append(el("span", "tag", e.family), el("h3", "", e.name));
		host.appendChild(head);
		const p = el("p", "info-beginner");
		p.appendChild(rich(e.beginner));
		host.appendChild(p);
		if (expert) {
			for (const t of e.expert) {
				const q = el("p");
				q.appendChild(rich(t));
				host.appendChild(q);
			}
			for (const f of e.formulas) {
				const box = el("div", "formula-box");
				box.appendChild(el("span", "f-note", f.note));
				const m = el("div");
				const k = katex();
				if (k) k.render(f.tex, m, {
					displayMode: true,
					throwOnError: false,
					strict: "ignore"
				});
				else m.textContent = f.tex;
				box.appendChild(m);
				host.appendChild(box);
			}
		}
		const cols = el("div", "info-cols");
		cols.append(list("Strengths", e.strengths), list("Limitations", e.limitations), list("Used on", e.instruments));
		host.appendChild(cols);
		if (expert) {
			const s = el("p", "info-sim");
			s.append(el("strong", "", "In this simulation: "), document.createTextNode(e.sim));
			host.appendChild(s);
		}
		const refs = el("p", "info-refs");
		refs.appendChild(document.createTextNode("Sources: "));
		e.refs.forEach((k, i) => {
			const r = content.references.find((x) => x.key === k);
			if (!r) return;
			if (i) refs.appendChild(document.createTextNode("; "));
			const a = el("a", "", shortCite(r));
			a.href = `#ref-${k}`;
			refs.appendChild(a);
		});
		host.appendChild(refs);
	}
	function renderBibliography(host, refs) {
		host.textContent = "";
		const sorted = [...refs].sort((a, b) => a.authors[0].localeCompare(b.authors[0]) || a.year - b.year);
		for (const r of sorted) {
			const li = el("li");
			li.id = `ref-${r.key}`;
			li.appendChild(document.createTextNode(fullCite(r) + " "));
			const a = el("a", "", `doi:${r.doi}`);
			a.href = `https://doi.org/${r.doi}`;
			a.target = "_blank";
			a.rel = "noopener noreferrer";
			li.appendChild(a);
			if (!r.peerReviewed) li.appendChild(el("span", "conf", " (conference proceedings)"));
			host.appendChild(li);
		}
	}
	// src/site/planeView.ts
	/** Phase map with the phase hidden where the light is negligible. */
	function maskedPhase(phase, intensity) {
		const mx = maxOf(intensity);
		return {
			...phase,
			data: phase.data.map((p, i) => intensity.data[i] > 1e-6 * mx ? p : NaN)
		};
	}
	function setPanels(p, decades, cmap, focal) {
		const log = {
			kind: "log",
			max: maxOf(p.before.intensity),
			decades,
			cmap
		};
		const out = [{
			caption: "Before",
			img: p.before.intensity,
			scale: log
		}];
		if (p.element) {
			const isPhase = absMax(p.element.phase) > 1e-6;
			out.push(isPhase ? {
				caption: focal ? "Mask (phase)" : "Phase plate",
				img: p.element.phase,
				scale: { kind: "phase" }
			} : {
				caption: focal ? "Mask (amplitude)" : "Element (amplitude)",
				img: p.element.amplitude,
				scale: {
					kind: "grey",
					min: 0,
					max: 1
				}
			});
		}
		out.push({
			caption: "After",
			img: p.after.intensity,
			scale: log
		});
		out.push({
			caption: "Phase before",
			img: maskedPhase(p.before.phase, p.before.intensity),
			scale: { kind: "phase" },
			expert: true
		});
		out.push({
			caption: "Phase after",
			img: maskedPhase(p.after.phase, p.after.intensity),
			scale: { kind: "phase" },
			expert: true
		});
		return out;
	}
	/** The panels of each plane for the current frame (and sensor). */
	function planePanels(id, f, w, cmap, decades) {
		switch (id) {
			case "A": return setPanels(f.planes.A, 4, cmap, false);
			case "B": return setPanels(f.planes.B, 6, cmap, true);
			case "C": return setPanels(f.planes.C, 5, cmap, false);
			case "DM": return [{
				caption: "DM surface (nm)",
				img: f.planes.dmOpd,
				scale: {
					kind: "diverging",
					limit: absMax(f.planes.dmOpd) || 1
				}
			}];
			case "D": return [{
				caption: "Detector image",
				img: f.image,
				scale: {
					kind: "log",
					max: 1,
					decades,
					cmap
				}
			}];
			case "WFS": {
				if (!w) return [];
				const raw = w.kind === "pairwise" ? {
					kind: "diverging",
					limit: absMax(w.raw) || 1
				} : w.kind === "zernike" ? {
					kind: "linear",
					min: 0,
					max: maxOf(w.raw),
					cmap
				} : {
					kind: "log",
					max: maxOf(w.raw),
					decades: 4,
					cmap
				};
				const out = [{
					caption: "Raw signal",
					img: w.raw,
					scale: raw
				}];
				if (w.estimate && w.truth) {
					const s = w.units === "nm" ? {
						kind: "diverging",
						limit: absMax(w.truth) || 1
					} : {
						kind: "log",
						max: Math.max(maxOf(w.truth), maxOf(w.estimate)),
						decades: 3,
						cmap
					};
					out.push({
						caption: w.units === "nm" ? "Reconstructed" : "Estimated |E|²",
						img: w.estimate,
						scale: s
					}, {
						caption: w.units === "nm" ? "True wavefront" : "True |E|²",
						img: w.truth,
						scale: s
					});
				}
				return out;
			}
		}
	}
	function buildStrip(host, open) {
		host.textContent = "";
		for (const id of PLANE_IDS) {
			const card = document.createElement("div");
			card.className = "pcard";
			card.dataset.plane = id;
			card.tabIndex = 0;
			card.setAttribute("role", "button");
			card.setAttribute("aria-label", `${PLANE_NAMES[id]}: open the large view`);
			const h = document.createElement("div");
			h.className = "pname";
			h.textContent = PLANE_NAMES[id];
			const row = document.createElement("div");
			row.className = "thumbs";
			card.append(h, row);
			card.addEventListener("click", () => open(id));
			card.addEventListener("keydown", (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					open(id);
				}
			});
			host.appendChild(card);
		}
	}
	function fillStrip(host, f, w, cmap, decades, expert) {
		for (const card of Array.from(host.querySelectorAll(".pcard"))) {
			const id = card.dataset.plane;
			const row = card.querySelector(".thumbs");
			const panels = planePanels(id, f, w, cmap, decades).filter((p) => expert || !p.expert);
			while (row.children.length > panels.length) row.lastElementChild?.remove();
			panels.forEach((p, i) => {
				let fig = row.children[i];
				if (!fig) {
					fig = document.createElement("figure");
					fig.append(document.createElement("canvas"), document.createElement("figcaption"));
					row.appendChild(fig);
				}
				const cv = fig.querySelector("canvas");
				cv.setAttribute("aria-hidden", "true");
				drawImage(cv, p.img, p.scale, 72);
				fig.querySelector("figcaption").textContent = p.caption;
			});
			card.classList.toggle("empty", panels.length === 0);
		}
	}
	function fillDialog(body, panels, expert) {
		body.textContent = "";
		for (const p of panels.filter((x) => expert || !x.expert)) {
			const fig = document.createElement("figure");
			const cv = document.createElement("canvas");
			cv.setAttribute("role", "img");
			cv.setAttribute("aria-label", p.caption);
			const cap = document.createElement("figcaption");
			cap.textContent = p.caption + (p.scale.kind === "log" ? ` (log, ${p.scale.decades} decades)` : p.scale.kind === "phase" ? " (−π … π)" : p.scale.kind === "diverging" ? ` (±${p.scale.limit.toPrecision(2)})` : "");
			fig.append(cv, cap);
			body.appendChild(fig);
			drawImage(cv, p.img, p.scale, 300);
		}
	}
	// src/site/tour.ts
	/** Beginner walkthrough: each step sets a configuration, highlights part of the diagram and explains it. */
	var corOf = (c, kind) => ({
		...c,
		coronagraph: {
			...c.coronagraph,
			kind,
			charge: 2,
			lyotOuter: DEFAULT_LYOT_OUTER[kind],
			maskRadius: kind === "aplc" ? 2 : 3
		}
	});
	var perfect = (c) => ({
		...c,
		aberrations: {
			...c.aberrations,
			screenRmsNm: 0,
			zernikeNm: c.aberrations.zernikeNm.map(() => 0),
			ncpaRmsNm: 0,
			ncpaZernikeNm: c.aberrations.ncpaZernikeNm.map(() => 0),
			amplitudeRms: 0
		}
	});
	var base = {
		...DEFAULT_CONFIG,
		planets: [{
			sep: 4,
			pa: 30,
			contrast: 1e-5
		}]
	};
	/** Mostly low-order errors (18 nm RMS), which a 30-mode AO loop can correct. */
	var rough = {
		...DEFAULT_CONFIG.aberrations,
		zernikeNm: [
			0,
			0,
			10,
			-8,
			6,
			5,
			-4,
			4,
			0,
			3
		],
		screenRmsNm: 4,
		screenSlope: 3.5
	};
	var TOUR = [
		{
			title: "1. A star and a faint planet",
			text: "The image on the right is what a perfect telescope sees: a bright star surrounded by rings of diffracted light. A planet 100 000 times fainter sits 4 λ/D from the star (λ/D is the telescope’s natural angular unit). Its circle marks where it is: the rings there are about 100 times brighter than the planet, so it is completely lost.",
			highlight: ["D"],
			resetDm: true,
			config: () => perfect(corOf(base, "none"))
		},
		{
			title: "2. Block the star: the Lyot coronagraph",
			text: "An opaque spot (plane B) blocks the core of the star image, and a stop in the next pupil image (plane C) removes the light diffracted around the spot. Click plane C in the diagram: the leftover starlight forms a bright ring at the edge of the pupil, which the stop cuts away. The star is now about 1000 times dimmer.",
			highlight: ["B", "C"],
			resetDm: true,
			config: () => perfect(corOf(base, "lyot"))
		},
		{
			title: "3. Phase masks: the vortex",
			text: "Instead of blocking light, a vortex mask changes its phase in a spiral around the centre. For a perfect circular telescope this sends all of the starlight outside the pupil, where the Lyot stop removes it: an almost complete null, while the planet passes through.",
			highlight: ["B", "C"],
			resetDm: true,
			config: () => perfect(corOf(base, "vortex"))
		},
		{
			title: "4. Real optics are not perfect",
			text: "Now the optics have small errors, about 18 nanometres in total. Starlight leaks through the coronagraph as a cloud of “speckles” that can look like planets. Compare the contrast curve with the bare telescope below the image.",
			highlight: ["A", "D"],
			resetDm: true,
			config: () => corOf({
				...base,
				aberrations: rough
			}, "vortex")
		},
		{
			title: "5. Measure and correct: adaptive optics",
			text: "A beam splitter sends part of the light to a Shack–Hartmann wavefront sensor. It measures the errors and a deformable mirror (DM) bends to cancel them. Watch the loop run: the residual wavefront error drops and the speckles fade.",
			highlight: ["DM", "WFS"],
			resetDm: true,
			runLoop: 10,
			config: () => corOf({
				...base,
				aberrations: rough,
				wfs: {
					...DEFAULT_CONFIG.wfs,
					kind: "shack-hartmann"
				},
				control: {
					...DEFAULT_CONFIG.control,
					kind: "ao"
				}
			}, "vortex")
		},
		{
			title: "6. Errors the sensor cannot see",
			text: "Some errors sit in the camera arm only, after the beam splitter (“non-common-path aberrations”). The sensor never sees them, so the loop cannot remove them: speckles remain even with the loop running.",
			highlight: ["WFS", "D"],
			resetDm: true,
			runLoop: 10,
			config: () => corOf({
				...base,
				aberrations: {
					...rough,
					ncpaRmsNm: 6
				},
				wfs: {
					...DEFAULT_CONFIG.wfs,
					kind: "shack-hartmann"
				},
				control: {
					...DEFAULT_CONFIG.control,
					kind: "ao"
				}
			}, "vortex")
		},
		{
			title: "7. Dig a dark hole",
			text: "Now the science camera itself is the sensor. The DM adds small probe ripples, the change in the image reveals the speckle field, and electric field conjugation (EFC) shapes the DM to cancel it in a region on one side of the star. The planet at 4 λ/D appears clearly.",
			highlight: ["DM", "D"],
			resetDm: true,
			runLoop: 8,
			config: () => corOf({
				...base,
				aberrations: {
					...DEFAULT_CONFIG.aberrations,
					screenRmsNm: 8,
					ncpaRmsNm: 4
				},
				wfs: {
					...DEFAULT_CONFIG.wfs,
					kind: "pairwise"
				},
				control: {
					...DEFAULT_CONFIG.control,
					kind: "efc",
					estimator: "pairwise"
				}
			}, "vortex")
		}
	];
	/** True when the optics have any wavefront or amplitude error. */
	function hasErrors(c) {
		const a = c.aberrations;
		return a.screenRmsNm > 0 || a.ncpaRmsNm > 0 || a.amplitudeRms > 0 || a.zernikeNm.some((z) => z !== 0) || a.ncpaZernikeNm.some((z) => z !== 0);
	}
	/** Telescope shapes offered as variations of a tour step (one is always selected). */
	var PUPIL_CHOICES = [
		{
			kind: "circular",
			label: "Clear circular",
			tip: "A clear circular mirror: the vortex and four-quadrant masks reach a full null."
		},
		{
			kind: "obscured",
			label: "Obscured + spiders",
			tip: "A secondary mirror and four spider vanes block part of the pupil, as on most large telescopes."
		},
		{
			kind: "segmented",
			label: "Segmented mirror",
			tip: "A mirror made of hexagonal segments with gaps, like Keck or JWST."
		}
	];
	function withPupil(c, kind) {
		if (kind === "obscured") return {
			...c,
			pupil: {
				...c.pupil,
				kind,
				obscuration: .14,
				spiders: 4,
				spiderWidth: .01
			}
		};
		if (kind === "segmented") return {
			...c,
			pupil: {
				...c.pupil,
				kind,
				rings: 2,
				gap: .02,
				obscuration: .15
			}
		};
		return {
			...c,
			pupil: {
				...c.pupil,
				kind
			}
		};
	}
	var TOGGLES = [{
		id: "var-errors",
		label: "Optical errors",
		tip: "Small wavefront errors in the optics. Off: a perfect telescope.",
		isOn: hasErrors,
		set: (c, on, step) => ({
			...c,
			aberrations: on ? hasErrors(step) ? step.aberrations : rough : perfect(c).aberrations
		})
	}, {
		id: "var-band",
		label: "20 % bandwidth",
		tip: "Add up 5 wavelengths across a 20 % band instead of one wavelength.",
		isOn: (c) => c.bandwidth > 0,
		set: (c, on) => ({
			...c,
			bandwidth: on ? .2 : 0,
			nLambda: 5
		})
	}];
	// src/site/main.ts
	/**
	* Coronagraph Lab page: state, worker messages and rendering. The physics runs in coronagraph-worker.js
	* (or on the main thread when the page is opened from a file and workers cannot start).
	*/
	var $ = (id) => document.getElementById(id);
	var content = window.CORONAGRAPH_LAB_CONTENT;
	var state = {
		config: DEFAULT_CONFIG,
		expert: false,
		cmap: "magma",
		log: true,
		decades: 8,
		frame: null,
		wfs: null,
		wfsReason: "",
		throughput: null,
		history: [],
		running: false,
		frames: 0,
		wfsCount: 0,
		/** Configuration the current tour step started from, to show and undo the variations. */
		tourBase: DEFAULT_CONFIG,
		tour: 0,
		highlight: [],
		openPlane: null
	};
	var send;
	function startWorker() {
		try {
			const w = new Worker("coronagraph-worker.js");
			w.onmessage = (e) => onReply(e.data);
			w.onerror = () => {
				w.terminate();
				fallback();
			};
			send = (r) => w.postMessage(r);
		} catch {
			fallback();
		}
	}
	function fallback() {
		const engine = createEngine((r) => setTimeout(() => onReply(r), 0));
		send = (r) => setTimeout(() => engine(r), 0);
		inFlight = false;
		requestFrame();
	}
	var frameId = 0;
	var inFlight = false;
	var pending = false;
	function requestFrame() {
		pending = true;
		if (inFlight) return;
		pending = false;
		inFlight = true;
		send({
			type: "frame",
			id: ++frameId,
			config: state.config
		});
	}
	function onReply(r) {
		if (r.type === "frame") {
			state.frame = r.data;
			state.frames++;
			if (r.id === frameId) {
				inFlight = false;
				if (pending) requestFrame();
			}
			renderFrame();
		} else if (r.type === "wfs") {
			state.wfs = r.data;
			state.wfsReason = r.reason;
			state.wfsCount++;
			renderWfs();
		} else if (r.type === "throughput") {
			state.throughput = {
				curve: r.curve,
				iwa: r.iwa,
				designIwa: r.designIwa
			};
			$("tp-run").disabled = false;
			renderCurves();
			renderReadouts();
		} else if (r.type === "progress") {
			const p = $("progress");
			p.hidden = !r.what;
			p.textContent = r.what ? `${r.what}… ${Math.round(r.fraction * 100)} %` : "";
		} else if (r.type === "loop") {
			state.history = r.history;
			state.running = r.running;
			$("loop-status").textContent = r.message;
			$("loop-run").disabled = r.running;
			$("loop-stop").disabled = !r.running;
			renderLoop();
			renderReadouts();
		} else if (r.type === "error") {
			$("loop-status").textContent = `Error: ${r.message}`;
			inFlight = false;
		}
	}
	var refreshControls = () => {};
	function setConfig(c) {
		const kindsChanged = c.coronagraph.kind !== state.config.coronagraph.kind || c.wfs.kind !== state.config.wfs.kind || c.control.kind !== state.config.control.kind;
		state.config = c;
		state.throughput = null;
		refreshControls();
		refreshVariations();
		renderDiagram();
		if (kindsChanged) renderInfoPanels();
		requestFrame();
	}
	function renderDiagram() {
		const host = $("diagram");
		host.innerHTML = diagramSvg(state.config);
		for (const g of Array.from(host.querySelectorAll(".plane"))) {
			const id = g.dataset.plane;
			g.classList.toggle("hl", state.highlight.includes(id));
			g.addEventListener("click", () => openPlane(id));
			g.addEventListener("keydown", (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					openPlane(id);
				}
			});
		}
	}
	function renderImage() {
		const f = state.frame;
		if (!f) return;
		const cv = $("image");
		drawImage(cv, f.image, state.log ? {
			kind: "log",
			max: 1,
			decades: state.decades,
			cmap: state.cmap
		} : {
			kind: "linear",
			min: 0,
			max: Math.max(1e-30, Math.max(...f.image.data)),
			cmap: state.cmap
		}, 0, true);
		const ctx = cv.getContext("2d");
		if (!ctx) return;
		const s = cv.width / (2 * f.fov);
		ctx.lineWidth = Math.max(1, cv.width / 400);
		for (const p of state.config.planets) {
			const t = p.pa * Math.PI / 180;
			const x = cv.width / 2 + p.sep * Math.cos(t) * s, y = cv.height / 2 - p.sep * Math.sin(t) * s;
			ctx.strokeStyle = PALETTE.sky;
			ctx.beginPath();
			ctx.arc(x, y, 1.6 * s, 0, 2 * Math.PI);
			ctx.stroke();
		}
		ctx.fillStyle = "#edf2ff";
		ctx.font = `${Math.round(cv.width / 40)}px system-ui, sans-serif`;
		ctx.fillText(`±${f.fov} λ/D`, 8, cv.height - 10);
		$("cbar-min").textContent = state.log ? `10⁻${state.decades}` : "0";
		$("cbar-max").textContent = state.log ? "1" : sci(Math.max(...f.image.data));
	}
	function renderCurves() {
		const f = state.frame;
		if (!f) return;
		drawPlot($("curve"), {
			xLabel: "Separation (λ0/D)",
			yLabel: "Raw contrast",
			logY: true,
			xMin: 0,
			xMax: f.fov,
			series: [
				{
					label: CORONAGRAPH_LABELS[state.config.coronagraph.kind],
					x: f.contrast.r,
					y: f.contrast.value,
					color: PALETTE.orange
				},
				{
					label: "Bare telescope",
					x: f.baseline.r,
					y: f.baseline.value,
					color: PALETTE.grey,
					dash: [5, 4]
				},
				...state.config.planets.map((p, i) => ({
					label: i ? "" : "Planets",
					x: [p.sep],
					y: [p.contrast],
					color: PALETTE.sky,
					points: true
				}))
			]
		});
		const t = state.throughput;
		const tpc = $("tp");
		if (t) drawPlot(tpc, {
			xLabel: "Planet separation (λ0/D)",
			yLabel: "Core throughput",
			logY: false,
			yMin: 0,
			yMax: 1.05,
			xMin: 0,
			series: [{
				label: "Relative to the bare telescope",
				x: t.curve.r,
				y: t.curve.value,
				color: PALETTE.green,
				points: true
			}],
			markers: [{
				x: Number.isFinite(t.iwa) ? t.iwa : t.designIwa,
				label: "IWA",
				color: PALETTE.yellow
			}]
		});
		else {
			const ctx = tpc.getContext("2d");
			if (ctx) {
				tpc.width = tpc.clientWidth;
				tpc.height = tpc.clientHeight;
				ctx.fillStyle = "#b3bfd8";
				ctx.font = "13px system-ui, sans-serif";
				ctx.fillText("Press “Compute throughput”.", 16, 30);
			}
		}
	}
	function renderWfs() {
		const w = state.wfs;
		const host = $("wfs-views");
		$("wfs-note").textContent = w ? w.note : state.wfsReason || "Measuring…";
		const err = $("wfs-err");
		if (w) err.textContent = w.units === "nm" ? `True wavefront ${w.truthRms.toFixed(1)} nm RMS · difference ${w.errorRms.toFixed(1)} nm RMS` : `Field estimate error ${(100 * w.errorRms).toFixed(1)} % RMS`;
		else err.textContent = "";
		if (state.frame) {
			fillDialog(host, planePanels("WFS", state.frame, w, state.cmap, state.decades), state.expert);
			fillStrip($("strip"), state.frame, w, state.cmap, state.decades, state.expert);
		}
		if (state.openPlane === "WFS") openPlane("WFS");
	}
	function renderLoop() {
		const h = state.history;
		const x = h.map((p) => p.iteration);
		drawPlot($("loop-c"), {
			xLabel: "Iteration",
			yLabel: "Dark-hole contrast",
			logY: true,
			xMin: 0,
			xMax: Math.max(5, ...x),
			series: [{
				label: "Mean raw contrast in the dark hole",
				x,
				y: h.map((p) => p.contrast),
				color: PALETTE.orange,
				points: true
			}]
		});
		drawPlot($("loop-r"), {
			xLabel: "Iteration",
			yLabel: "Residual wavefront (nm RMS)",
			logY: false,
			yMin: 0,
			xMin: 0,
			xMax: Math.max(5, ...x),
			series: [{
				label: "Science arm",
				x,
				y: h.map((p) => p.rmsScience),
				color: PALETTE.vermillion,
				points: true
			}, {
				label: "WFS arm",
				x,
				y: h.map((p) => p.rmsWfs),
				color: PALETTE.sky,
				dash: [5, 4]
			}]
		});
	}
	function readout(dl, rows) {
		dl.textContent = "";
		for (const [id, name, value] of rows) {
			const dt = document.createElement("dt");
			dt.textContent = name;
			dt.dataset.tipKey = id;
			const dd = document.createElement("dd");
			dd.textContent = value;
			dd.id = id;
			dl.append(dt, dd);
		}
	}
	function renderReadouts() {
		const f = state.frame;
		if (!f) return;
		const r = f.readouts;
		const t = state.throughput;
		const last = state.history.at(-1);
		const rows = [
			[
				"r-contrast",
				"Mean raw contrast (dark zone)",
				sci(r.meanContrast)
			],
			[
				"r-base",
				"Bare telescope, same zone",
				sci(r.baselineContrast)
			],
			[
				"r-gain",
				"Suppression factor",
				r.meanContrast > 0 ? `${(r.baselineContrast / r.meanContrast).toPrecision(3)}×` : "∞"
			],
			[
				"r-peak",
				"Residual star peak",
				sci(r.peak)
			],
			[
				"r-strehl",
				"Strehl ratio (science arm)",
				r.strehl.toFixed(3)
			],
			[
				"r-wfe",
				"Wavefront error: science / WFS arm",
				`${r.rmsScienceNm.toFixed(1)} / ${r.rmsWfsNm.toFixed(1)} nm`
			],
			[
				"r-iwa",
				"Inner working angle",
				t ? `${(Number.isFinite(t.iwa) ? t.iwa : t.designIwa).toFixed(2)} λ/D` : Number.isFinite(r.designIwa) ? `${r.designIwa.toFixed(2)} λ/D (dark-zone edge)` : "—"
			]
		];
		if (Number.isFinite(r.eigenvalue)) rows.push([
			"r-lambda",
			"APLC eigenvalue Λ",
			r.eigenvalue.toFixed(6)
		]);
		if (last) rows.push([
			"r-dh",
			`Dark-hole contrast after ${last.iteration} iterations`,
			sci(last.contrast)
		]);
		rows.push([
			"r-time",
			"Frame time",
			`${r.timeMs.toFixed(0)} ms`
		]);
		readout($("read"), rows);
		$("key-contrast").textContent = sci(r.meanContrast);
		$("key-gain").textContent = r.meanContrast > 0 ? `${(r.baselineContrast / r.meanContrast).toPrecision(3)}×` : "∞";
		$("key-strehl").textContent = r.strehl.toFixed(2);
		$("stats").textContent = `Contrast ${sci(r.meanContrast)} · ${r.meanContrast > 0 ? (r.baselineContrast / r.meanContrast).toPrecision(3) : "∞"}× below the bare telescope · Strehl ${r.strehl.toFixed(2)}`;
	}
	function renderFrame() {
		renderImage();
		renderCurves();
		renderReadouts();
		if (state.frame) fillStrip($("strip"), state.frame, state.wfs, state.cmap, state.decades, state.expert);
		if (state.openPlane && state.openPlane !== "WFS") openPlane(state.openPlane);
	}
	var INFO_SLOTS = [
		["info-cor", "Coronagraph"],
		["info-wfs", "Wavefront sensor"],
		["info-ctl", "Control law"]
	];
	function selectedInfo(slot) {
		if (!content) return void 0;
		const c = state.config;
		if (slot === "info-cor") return content.coronagraphs.find((e) => e.id === c.coronagraph.kind);
		if (slot === "info-wfs") return content.sensors.find((e) => e.id === c.wfs.kind);
		return content.control.find((e) => e.id === c.control.kind);
	}
	/** Compact cards; the full theory opens in a dialog. */
	function renderInfoPanels() {
		for (const [slot, role] of INFO_SLOTS) {
			const e = selectedInfo(slot);
			const card = $(slot);
			card.textContent = "";
			if (!e) continue;
			const tag = document.createElement("span");
			tag.className = "tag";
			tag.textContent = `${role} · ${e.family}`;
			const h = document.createElement("h3");
			h.textContent = e.name;
			const p = document.createElement("p");
			p.textContent = e.beginner;
			const b = document.createElement("button");
			b.type = "button";
			b.className = "button small info-more";
			b.textContent = "Theory, equations and sources";
			b.setAttribute("aria-haspopup", "dialog");
			b.addEventListener("click", () => openInfo(slot));
			card.append(tag, h, p, b);
		}
	}
	function openInfo(slot) {
		const e = selectedInfo(slot);
		if (!e || !content) return;
		const dlg = $("info-dlg");
		$("info-dlg-title").textContent = e.name;
		renderInfo($("info-dlg-body"), e, content, true);
		if (!dlg.open) dlg.showModal();
	}
	var tabRedraw = {
		"res-contrast": () => renderCurves(),
		"res-wfs": () => renderWfs(),
		"res-loop": () => renderLoop()
	};
	function selectTab(panelId) {
		const tab = document.querySelector(`[role=tab][aria-controls="${panelId}"]`);
		const list = tab?.closest("[role=tablist]");
		if (!tab || !list) return;
		for (const t of Array.from(list.querySelectorAll("[role=tab]"))) {
			const on = t === tab;
			t.setAttribute("aria-selected", String(on));
			t.tabIndex = on ? 0 : -1;
			const panel = document.getElementById(t.getAttribute("aria-controls") ?? "");
			if (panel) panel.hidden = !on;
		}
		tabRedraw[panelId]?.();
	}
	function setupTabs() {
		for (const list of Array.from(document.querySelectorAll("[role=tablist]"))) {
			const tabs = Array.from(list.querySelectorAll("[role=tab]"));
			for (const t of tabs) {
				t.addEventListener("click", () => selectTab(t.getAttribute("aria-controls") ?? ""));
				t.addEventListener("keydown", (e) => {
					const visible = tabs.filter((x) => x.offsetParent !== null);
					const k = visible.indexOf(t);
					const next = e.key === "ArrowRight" ? visible[(k + 1) % visible.length] : e.key === "ArrowLeft" ? visible[(k - 1 + visible.length) % visible.length] : null;
					if (next) {
						e.preventDefault();
						next.focus();
						selectTab(next.getAttribute("aria-controls") ?? "");
					}
				});
			}
		}
		for (const b of Array.from(document.querySelectorAll("[data-goto]"))) b.addEventListener("click", () => {
			const id = b.dataset.goto ?? "";
			selectTab(id);
			document.getElementById(id)?.closest("section")?.scrollIntoView({
				behavior: "smooth",
				block: "start"
			});
		});
	}
	function openPlane(id) {
		const f = state.frame;
		const dlg = $("plane-dlg");
		if (!f) return;
		state.openPlane = id;
		$("plane-title").textContent = PLANE_NAMES[id];
		fillDialog($("plane-body"), planePanels(id, f, state.wfs, state.cmap, state.decades), state.expert);
		if (!dlg.open) dlg.showModal();
	}
	function setMode(expert) {
		state.expert = expert;
		document.body.classList.toggle("mode-expert", expert);
		document.body.classList.toggle("mode-beginner", !expert);
		$("mode-expert").checked = expert;
		$("mode-beginner").checked = !expert;
		if (!expert && $("par-det").hidden === false) selectTab("par-inst");
		renderInfoPanels();
		renderFrame();
		renderWfs();
	}
	function showTourStep(i, apply) {
		state.tour = Math.max(0, Math.min(TOUR.length - 1, i));
		const s = TOUR[state.tour];
		$("tour-title").textContent = s.title;
		$("tour-text").textContent = s.text;
		$("tour-count").textContent = `Step ${state.tour + 1} of ${TOUR.length}`;
		$("tour-prev").disabled = state.tour === 0;
		$("tour-next").disabled = state.tour === TOUR.length - 1;
		state.highlight = s.highlight;
		if (!apply) {
			renderDiagram();
			return;
		}
		const c = s.config(state.config);
		state.tourBase = c;
		if (s.resetDm) send({
			type: "loop",
			action: "reset",
			config: c,
			iterations: 0
		});
		setConfig(c);
		if (s.runLoop) {
			selectTab("res-loop");
			send({
				type: "loop",
				action: "run",
				config: c,
				iterations: s.runLoop
			});
		}
	}
	function buildVariations() {
		const pupils = $("var-pupil");
		for (const p of PUPIL_CHOICES) {
			const id = `var-pupil-${p.kind}`;
			const input = document.createElement("input");
			input.type = "radio";
			input.name = "var-pupil";
			input.id = id;
			input.value = p.kind;
			input.addEventListener("change", () => setConfig(withPupil(state.config, p.kind)));
			const label = document.createElement("label");
			label.htmlFor = id;
			label.textContent = p.label;
			label.dataset.tip = p.tip;
			pupils.append(input, label);
		}
		const toggles = $("var-toggles");
		for (const t of TOGGLES) {
			const b = document.createElement("button");
			b.type = "button";
			b.className = "chip";
			b.id = t.id;
			b.dataset.tip = t.tip;
			b.innerHTML = "<span class=\"tick\" aria-hidden=\"true\"></span><span></span>";
			b.lastElementChild.textContent = t.label;
			b.addEventListener("click", () => setConfig(t.set(state.config, !t.isOn(state.config), state.tourBase)));
			toggles.appendChild(b);
		}
		$("var-reset").addEventListener("click", () => showTourStep(state.tour, true));
	}
	/** Show which variations are active, and whether the step differs from how it started. */
	function refreshVariations() {
		const c = state.config;
		for (const p of PUPIL_CHOICES) $(`var-pupil-${p.kind}`).checked = c.pupil.kind === p.kind;
		const on = [];
		for (const t of TOGGLES) {
			const pressed = t.isOn(c);
			$(t.id).setAttribute("aria-pressed", String(pressed));
			if (pressed !== t.isOn(state.tourBase)) on.push(`${t.label.toLowerCase()} ${pressed ? "on" : "off"}`);
		}
		if (c.pupil.kind !== state.tourBase.pupil.kind) on.unshift(PUPIL_CHOICES.find((p) => p.kind === c.pupil.kind)?.label.toLowerCase() ?? "");
		const changed = JSON.stringify(c) !== JSON.stringify(state.tourBase);
		$("var-reset").disabled = !changed;
		$("var-status").textContent = !changed ? "Showing this step as designed." : on.length ? `Changed from this step: ${on.join(", ")}.` : "Changed from this step by the parameters below.";
	}
	function wire() {
		refreshControls = buildControls(() => state.config, setConfig);
		buildVariations();
		const cm = $("cmap");
		for (const n of COLORMAP_NAMES) {
			const o = document.createElement("option");
			o.value = n;
			o.textContent = n;
			cm.appendChild(o);
		}
		cm.value = state.cmap;
		const cb = () => {
			$("cbar-grad").style.background = gradientCss(state.cmap);
		};
		cb();
		cm.addEventListener("change", () => {
			state.cmap = cm.value;
			cb();
			renderFrame();
			renderWfs();
		});
		$("scale").addEventListener("change", (e) => {
			state.log = e.target.value === "log";
			renderImage();
		});
		const range = $("range");
		range.addEventListener("input", () => {
			state.decades = Number(range.value);
			$("range-out").textContent = `${range.value} decades`;
			renderImage();
			fillStrip($("strip"), state.frame, state.wfs, state.cmap, state.decades, state.expert);
		});
		$("mode-beginner").addEventListener("change", () => setMode(false));
		$("mode-expert").addEventListener("change", () => setMode(true));
		$("tour-prev").addEventListener("click", () => showTourStep(state.tour - 1, true));
		$("tour-next").addEventListener("click", () => showTourStep(state.tour + 1, true));
		$("tour-start").addEventListener("click", () => showTourStep(0, true));
		const iters = $("loop-n");
		$("loop-run").addEventListener("click", () => send({
			type: "loop",
			action: "run",
			config: state.config,
			iterations: Number(iters.value) || 10
		}));
		setupTabs();
		const idlg = $("info-dlg");
		$("info-close").addEventListener("click", () => idlg.close());
		idlg.addEventListener("click", (e) => {
			if (e.target === idlg) {
				idlg.close();
				return;
			}
			const a = e.target.closest?.("a[href^=\"#ref-\"]");
			if (a) {
				e.preventDefault();
				idlg.close();
				const bib = $("p-bib");
				bib.open = true;
				document.querySelector(a.getAttribute("href") ?? "")?.scrollIntoView({
					behavior: "smooth",
					block: "center"
				});
				history.replaceState(null, "", a.getAttribute("href"));
			}
		});
		$("loop-stop").addEventListener("click", () => send({
			type: "loop",
			action: "stop",
			config: state.config,
			iterations: 0
		}));
		$("loop-reset").addEventListener("click", () => send({
			type: "loop",
			action: "reset",
			config: state.config,
			iterations: 0
		}));
		$("tp-run").addEventListener("click", () => {
			$("tp-run").disabled = true;
			send({
				type: "throughput",
				id: frameId,
				config: state.config
			});
		});
		$("save-image").addEventListener("click", () => savePng($("image"), "coronagraph-lab-image.png"));
		$("save-curve").addEventListener("click", () => {
			if (state.frame) saveText("coronagraph-lab-contrast.csv", contrastCsv(state.frame.contrast, state.frame.baseline));
		});
		$("save-tp").addEventListener("click", () => {
			if (state.throughput) saveText("coronagraph-lab-throughput.csv", throughputCsv(state.throughput.curve));
		});
		$("save-loop").addEventListener("click", () => saveText("coronagraph-lab-loop.csv", loopCsv(state.history)));
		const dlg = $("plane-dlg");
		$("plane-close").addEventListener("click", () => dlg.close());
		dlg.addEventListener("close", () => {
			state.openPlane = null;
		});
		dlg.addEventListener("click", (e) => {
			if (e.target === dlg) dlg.close();
		});
		buildStrip($("strip"), openPlane);
		if (window.matchMedia("(max-width: 700px)").matches) $("strip-box").open = false;
		let resize = 0;
		window.addEventListener("resize", () => {
			clearTimeout(resize);
			resize = window.setTimeout(() => {
				renderFrame();
				renderLoop();
			}, 150);
		});
	}
	wire();
	refreshControls();
	setMode(false);
	renderLoop();
	startWorker();
	showTourStep(0, true);
	document.addEventListener("DOMContentLoaded", () => {
		renderInfoPanels();
		if (content) renderBibliography($("bib"), content.references);
	});
	window.CoronagraphLab = {
		state,
		setConfig,
		CORONAGRAPH_LABELS
	};
})();
