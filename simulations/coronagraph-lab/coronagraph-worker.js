/* Generated from coronagraph-lab/src/worker/worker.ts by "npm run build:site". Do not edit. */
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
	({ ...DEFAULT_PUPIL }), { ...NO_ABERRATIONS };
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
				} else if (req.action === "stop") running = false;
				else if (req.action === "reset") {
					running = false;
					ensureDm(req.config);
					loop.reset(nAct);
					post({
						type: "loop",
						history: [],
						running: false,
						message: "Deformable mirror flattened."
					});
					frame(-1, req.config);
				} else if (!running) runLoop(req.config, req.iterations);
			} catch (e) {
				post({
					type: "error",
					message: e instanceof Error ? e.message : String(e)
				});
			}
		};
	}
	// src/worker/worker.ts
	/** Web Worker entry: runs the physics engine off the main thread. */
	var scope = self;
	var handle = createEngine((r) => scope.postMessage(r));
	scope.onmessage = (e) => handle(e.data);
})();
