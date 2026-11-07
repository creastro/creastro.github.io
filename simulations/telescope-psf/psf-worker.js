/* Generated from psf-simulator/src/workers/psf.worker.ts by "npm run build:site". Do not edit. */
(function() {
	// src/lib/zernike.ts
	var ZERNIKE_NAMES = [
		"defocus",
		"astigmatism0",
		"astigmatism45",
		"comaX",
		"comaY",
		"spherical"
	];
	var ZERO_ABERRATIONS = {
		defocus: 0,
		astigmatism0: 0,
		astigmatism45: 0,
		comaX: 0,
		comaY: 0,
		spherical: 0
	};
	/** Giá trị Z_k(ρ, θ) chuẩn hoá Noll. */
	function zernike(name, rho, theta) {
		const r2 = rho * rho;
		switch (name) {
			case "defocus": return Math.sqrt(3) * (2 * r2 - 1);
			case "astigmatism0": return Math.sqrt(6) * r2 * Math.cos(2 * theta);
			case "astigmatism45": return Math.sqrt(6) * r2 * Math.sin(2 * theta);
			case "comaX": return Math.sqrt(8) * (3 * r2 * rho - 2 * rho) * Math.cos(theta);
			case "comaY": return Math.sqrt(8) * (3 * r2 * rho - 2 * rho) * Math.sin(theta);
			case "spherical": return Math.sqrt(5) * (6 * r2 * r2 - 6 * r2 + 1);
		}
	}
	function hasAberration(a) {
		return ZERNIKE_NAMES.some((name) => a[name] !== 0);
	}
	/**
	* Mặt sóng W(x, y) theo bước sóng trên lưới n × n (chỉ số [y * n + x]), tâm pupil ở (n/2, n/2).
	* Các pixel ngoài hình vuông bao quanh pupil để bằng 0.
	*/
	function buildWavefront(n, pupilDiameterPx, a) {
		const wave = new Float64Array(n * n);
		const c = n / 2;
		const radius = pupilDiameterPx / 2;
		const active = ZERNIKE_NAMES.filter((name) => a[name] !== 0);
		if (active.length === 0) return wave;
		const lo = Math.max(0, Math.floor(c - radius) - 1);
		const hi = Math.min(n - 1, Math.ceil(c + radius) + 1);
		for (let iy = lo; iy <= hi; iy++) for (let ix = lo; ix <= hi; ix++) {
			const x = ix - c;
			const y = iy - c;
			const rho = Math.hypot(x, y) / radius;
			const theta = Math.atan2(y, x);
			let w = 0;
			for (const name of active) w += a[name] * zernike(name, rho, theta);
			wave[iy * n + ix] = w;
		}
		return wave;
	}
	/**
	* Nhân mọi hệ số với `factor`. Sai số đường quang hình học (mất nét, loạn thị, coma, cầu sai của gương)
	* không phụ thuộc bước sóng, nên tính theo bước sóng nó tỉ lệ 1/λ: tại bước sóng λ, hệ số bằng
	* c₀ · (λ₀ / λ) với c₀ là hệ số tại bước sóng tham chiếu λ₀.
	*/
	function scaleAberrations(a, factor) {
		const out = { ...ZERO_ABERRATIONS };
		for (const name of ZERNIKE_NAMES) out[name] = a[name] * factor;
		return out;
	}
	// src/lib/params.ts
	/** Số giây cung trong một radian. */
	var ARCSEC_PER_RAD = 180 / Math.PI * 3600;
	function lambdaOverDArcsec(diameterM, wavelengthNm) {
		return wavelengthNm * 1e-9 * ARCSEC_PER_RAD / diameterM;
	}
	function validateSegments(g) {
		if (!Number.isInteger(g.rings) || g.rings < 1 || g.rings > 8) throw new RangeError(`rings phải là số nguyên trong [1, 8]`);
		if (!(g.gapRatio >= 0 && g.gapRatio < .5)) throw new RangeError("gapRatio phải nằm trong [0, 0.5)");
	}
	/** Số phân đoạn: 3k(k + 1) + 1, trừ một nếu bỏ phân đoạn trung tâm. */
	function segmentCount(rings, removeCenter) {
		return 3 * rings * (rings + 1) + 1 - (removeCenter ? 1 : 0);
	}
	var ringOf = (q, r) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
	/** Mọi ô của lưới trong k vòng (kể cả tâm), theo thứ tự cố định: vòng tăng dần, rồi góc tăng dần. */
	function listCells(rings) {
		const cells = [];
		for (let q = -rings; q <= rings; q++) for (let r = Math.max(-rings, -q - rings); r <= Math.min(rings, -q + rings); r++) {
			const x = q + r / 2;
			const y = r * Math.sqrt(3) / 2;
			cells.push({
				q,
				r,
				ring: ringOf(q, r),
				angle: Math.atan2(y, x)
			});
		}
		cells.sort((a, b) => a.ring - b.ring || a.angle - b.angle);
		return cells;
	}
	/** Các phân đoạn thật sự có gương (đã bỏ tâm nếu cần). */
	function listSegments(g) {
		return listCells(g.rings).filter((c) => !(g.removeCenter && c.ring === 0));
	}
	/** Bán kính đường tròn ngoại tiếp toàn mảng, tính theo bề rộng phân đoạn f. */
	function arrayCircumradius(g) {
		const pitch = 1 + g.gapRatio;
		const corner = 1 / Math.sqrt(3);
		let best = 0;
		for (const c of listCells(g.rings)) {
			if (c.ring !== g.rings) continue;
			const cx = pitch * (c.q + c.r / 2);
			const cy = pitch * c.r * Math.sqrt(3) / 2;
			for (let k = 0; k < 6; k++) {
				const a = Math.PI / 6 + k * Math.PI / 3;
				best = Math.max(best, Math.hypot(cx + corner * Math.cos(a), cy + corner * Math.sin(a)));
			}
		}
		return best;
	}
	function layoutFor(g, radiusPx) {
		validateSegments(g);
		const fPx = radiusPx / arrayCircumradius(g);
		return {
			fPx,
			pitchPx: fPx * (1 + g.gapRatio),
			apothemPx: fPx / 2,
			rings: g.rings,
			removeCenter: g.removeCenter
		};
	}
	/** Ô lưới gần điểm nhất. Dùng chung một đối tượng tạm để không cấp phát trong vòng lặp nóng; đừng giữ tham chiếu. */
	var site = {
		q: 0,
		r: 0,
		ring: 0,
		cx: 0,
		cy: 0
	};
	var SQRT3 = Math.sqrt(3);
	/** Tìm ô lưới gần (x, y) nhất bằng làm tròn toạ độ lập phương, kết quả ghi vào `site`. */
	function nearestSite(l, x, y) {
		const rf = 2 * y / (SQRT3 * l.pitchPx);
		const qf = x / l.pitchPx - rf / 2;
		const sf = -qf - rf;
		let q = Math.round(qf);
		let r = Math.round(rf);
		const s = Math.round(sf);
		const dq = Math.abs(q - qf);
		const dr = Math.abs(r - rf);
		const ds = Math.abs(s - sf);
		if (dq > dr && dq > ds) q = -r - s;
		else if (dr > ds) r = -q - s;
		site.q = q;
		site.r = r;
		site.ring = ringOf(q, r);
		site.cx = l.pitchPx * (q + r / 2);
		site.cy = l.pitchPx * r * SQRT3 / 2;
	}
	/** Ô lưới `site` có phải một phân đoạn thật không (trong k vòng, không phải tâm bị bỏ). */
	function siteHasMirror(l) {
		return site.ring <= l.rings && !(l.removeCenter && site.ring === 0);
	}
	/** Điểm lệch (dx, dy) so với tâm ô có nằm trong lục giác phân đoạn không. */
	function insideHex(l, dx, dy) {
		const a = l.apothemPx;
		return Math.abs(dx) <= a && Math.abs(.5 * dx + SQRT3 / 2 * dy) <= a && Math.abs(-.5 * dx + SQRT3 / 2 * dy) <= a;
	}
	/** Khoảng cách tuyệt đối nhỏ nhất từ điểm lệch (dx, dy) đến một trong ba cặp cạnh của lục giác. */
	function edgeDistance(l, dx, dy) {
		const a = l.apothemPx;
		return Math.min(Math.abs(a - Math.abs(dx)), Math.abs(a - Math.abs(.5 * dx + SQRT3 / 2 * dy)), Math.abs(a - Math.abs(-.5 * dx + SQRT3 / 2 * dy)));
	}
	// src/lib/aperture.ts
	/**
	* Hàm khẩu độ A(x, y) của kính thiên văn: mảng 2D truyền qua ∈ [0, 1].
	*
	* Hình học: gương chính là đĩa đường kính D (hoặc một mảng phân đoạn lục giác nội tiếp trong đĩa đó, xem segments.ts);
	* gương phụ che đĩa đồng tâm đường kính ε·D;
	* mỗi thanh chống là dải chữ nhật rộng t·D bắt đầu từ tâm và kéo dài ra mép (nửa đường thẳng).
	* Pupil nằm ở tâm chỉ số (n/2, n/2); toạ độ pixel dương theo cả x (sang phải) và y (xuống dưới).
	*
	* Mép được khử răng cưa bằng lấy mẫu con SS × SS ở các pixel sát biên, nên thanh chống mảnh hơn một
	* pixel vẫn đóng góp đúng diện tích. Điều này quan trọng cho các vòng Airy mờ và cánh sao nhiễu xạ.
	* Lưới mẫu con mịn (16 × 16) giữ sai số độ rộng dải dưới ~2%; lưới thô khiến dải song song trục bị
	* lệch nhiều phần trăm vì toạ độ mẫu chỉ rơi vào các bội số cố định của bước lưới.
	*/
	/** Số mẫu con mỗi chiều cho pixel nằm sát biên; pixel còn lại chỉ cần một điểm. */
	var SS = 16;
	/** Gương phân đoạn có rất nhiều cạnh nên dùng lưới mẫu thưa hơn để giữ thời gian tạo mặt nạ dưới ~100 ms. */
	var SS_SEGMENTED = 8;
	/** Pixel cách biên gần hơn khoảng này (đơn vị pixel) được lấy mẫu mịn. */
	var EDGE_BAND = 1;
	function validateAperture(p) {
		if (p.pupilDiameterPx < 4 || p.pupilDiameterPx > p.gridSize - 2) throw new RangeError("pupilDiameterPx phải nằm trong [4, gridSize − 2]");
		if (!(p.obstructionRatio >= 0 && p.obstructionRatio < .95)) throw new RangeError("obstructionRatio phải nằm trong [0, 0.95)");
		if (p.segments) validateSegments(p.segments);
		if (!Number.isInteger(p.vaneCount) || p.vaneCount < 0) throw new RangeError("vaneCount phải là số nguyên không âm");
		if (!(p.vaneThicknessRatio >= 0)) throw new RangeError("vaneThicknessRatio phải không âm");
	}
	/** Điểm (x, y) tính từ tâm có truyền qua không. */
	function isOpen(g, x, y) {
		const d2 = x * x + y * y;
		if (g.lattice) {
			nearestSite(g.lattice, x, y);
			if (!siteHasMirror(g.lattice) || !insideHex(g.lattice, x - site.cx, y - site.cy)) return false;
		} else if (d2 > g.radius * g.radius) return false;
		if (d2 < g.rObs * g.rObs) return false;
		for (let j = 0; j < g.ux.length; j++) if (x * g.ux[j] + y * g.uy[j] >= 0 && Math.abs(x * g.uy[j] - y * g.ux[j]) <= g.halfThickness) return false;
		return true;
	}
	/** Điểm có nằm trong EDGE_BAND quanh một biên nào đó (gương, vật cản, thanh chống) không. */
	function nearEdge(g, x, y) {
		const r = Math.hypot(x, y);
		let outerEdge;
		if (g.lattice) {
			nearestSite(g.lattice, x, y);
			outerEdge = edgeDistance(g.lattice, x - site.cx, y - site.cy) < EDGE_BAND + (g.lattice.pitchPx - g.lattice.fPx);
		} else outerEdge = Math.abs(r - g.radius) < EDGE_BAND;
		if (outerEdge || Math.abs(r - g.rObs) < EDGE_BAND) return true;
		for (let j = 0; j < g.ux.length; j++) {
			const along = x * g.ux[j] + y * g.uy[j];
			const across = Math.abs(x * g.uy[j] - y * g.ux[j]);
			if (along > -1 && Math.abs(across - g.halfThickness) < EDGE_BAND) return true;
			if (Math.abs(along) < EDGE_BAND && across < g.halfThickness + EDGE_BAND) return true;
		}
		return false;
	}
	/** Tạo mảng truyền qua n × n lưu theo hàng, chỉ số [y * n + x]. */
	function createAperture(p) {
		validateAperture(p);
		const n = p.gridSize;
		const mask = new Float64Array(n * n);
		const c = n / 2;
		const radius = p.pupilDiameterPx / 2;
		const ux = [];
		const uy = [];
		for (let j = 0; j < p.vaneCount; j++) {
			const angle = p.vaneAngleDeg * Math.PI / 180 + 2 * Math.PI * j / p.vaneCount;
			ux.push(Math.cos(angle));
			uy.push(Math.sin(angle));
		}
		const g = {
			radius,
			rObs: p.obstructionRatio * radius,
			halfThickness: p.vaneThicknessRatio * p.pupilDiameterPx / 2,
			ux,
			uy,
			lattice: p.segments ? layoutFor(p.segments, radius) : void 0
		};
		const samples = p.segments ? SS_SEGMENTED : SS;
		const lo = Math.max(0, Math.floor(c - radius) - 1);
		const hi = Math.min(n - 1, Math.ceil(c + radius) + 1);
		const offsets = [];
		for (let s = 0; s < samples; s++) offsets.push((s + .5) / samples - .5);
		for (let iy = lo; iy <= hi; iy++) for (let ix = lo; ix <= hi; ix++) {
			const x0 = ix - c;
			const y0 = iy - c;
			if (!nearEdge(g, x0, y0)) {
				mask[iy * n + ix] = isOpen(g, x0, y0) ? 1 : 0;
				continue;
			}
			let open = 0;
			for (const oy of offsets) for (const ox of offsets) if (isOpen(g, x0 + ox, y0 + oy)) open++;
			mask[iy * n + ix] = open / (samples * samples);
		}
		return mask;
	}
	/** Tổng truyền qua ΣA, bằng diện tích mở tính theo pixel. */
	function openArea(mask) {
		let sum = 0;
		for (let i = 0; i < mask.length; i++) sum += mask[i];
		return sum;
	}
	/** Khoảng hàng [from, to) chứa mọi giá trị khác 0, dùng để bỏ qua hàng 0 trong FFT. */
	function nonZeroRowRange(mask, n) {
		let first = -1;
		let last = -1;
		for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (mask[y * n + x] !== 0) {
			if (first < 0) first = y;
			last = y;
			break;
		}
		return first < 0 ? [0, 0] : [first, last + 1];
	}
	// src/lib/fft.ts
	var plans = /* @__PURE__ */ new Map();
	function isPowerOfTwo(n) {
		return Number.isInteger(n) && n >= 1 && (n & n - 1) === 0;
	}
	function getPlan(n) {
		if (!isPowerOfTwo(n)) throw new RangeError(`Kích thước FFT phải là lũy thừa của 2, nhận được ${n}`);
		let plan = plans.get(n);
		if (plan) return plan;
		const cos = new Float64Array(n / 2);
		const sin = new Float64Array(n / 2);
		for (let k = 0; k < n / 2; k++) {
			cos[k] = Math.cos(2 * Math.PI * k / n);
			sin[k] = Math.sin(2 * Math.PI * k / n);
		}
		const bits = Math.log2(n);
		const rev = new Uint32Array(n);
		for (let i = 0; i < n; i++) {
			let r = 0;
			for (let b = 0; b < bits; b++) if (i & 1 << b) r |= 1 << bits - 1 - b;
			rev[i] = r;
		}
		plan = {
			cos,
			sin,
			rev
		};
		plans.set(n, plan);
		return plan;
	}
	/** FFT 1D tại chỗ trên đoạn [offset, offset + n) của re/im. Không chia tỉ lệ. */
	function fft1dInPlace(re, im, offset, n, inverse = false) {
		const { cos, sin, rev } = getPlan(n);
		for (let i = 0; i < n; i++) {
			const j = rev[i];
			if (j > i) {
				const a = offset + i;
				const b = offset + j;
				const tr = re[a];
				re[a] = re[b];
				re[b] = tr;
				const ti = im[a];
				im[a] = im[b];
				im[b] = ti;
			}
		}
		const sign = inverse ? 1 : -1;
		for (let size = 2; size <= n; size <<= 1) {
			const half = size >> 1;
			const step = n / size;
			for (let start = 0; start < n; start += size) for (let k = 0; k < half; k++) {
				const wr = cos[k * step];
				const wi = sign * sin[k * step];
				const a = offset + start + k;
				const b = a + half;
				const tr = wr * re[b] - wi * im[b];
				const ti = wr * im[b] + wi * re[b];
				re[b] = re[a] - tr;
				im[b] = im[a] - ti;
				re[a] += tr;
				im[a] += ti;
			}
		}
	}
	/** Chuyển vị tại chỗ ma trận vuông n×n, duyệt theo khối để thân thiện với cache. */
	function transposeInPlace(data, n) {
		const block = 32;
		for (let bi = 0; bi < n; bi += block) for (let bj = bi; bj < n; bj += block) {
			const iEnd = Math.min(bi + block, n);
			const jEnd = Math.min(bj + block, n);
			for (let i = bi; i < iEnd; i++) for (let j = Math.max(bj, i + 1); j < jEnd; j++) {
				const a = i * n + j;
				const b = j * n + i;
				const t = data[a];
				data[a] = data[b];
				data[b] = t;
			}
		}
	}
	/**
	* FFT 2D tại chỗ trên ma trận n×n lưu theo hàng. Chỉ số [y * n + x].
	* Thực hiện: FFT các hàng, chuyển vị, FFT các hàng (tức các cột cũ), chuyển vị lại.
	*/
	function fft2d(re, im, n, options = {}) {
		const { inverse = false, nonZeroRows } = options;
		const scale = options.scale ?? inverse;
		if (re.length !== n * n || im.length !== n * n) throw new RangeError("Độ dài mảng re/im phải bằng n × n");
		const [r0, r1] = nonZeroRows ?? [0, n];
		for (let y = Math.max(0, r0); y < Math.min(n, r1); y++) fft1dInPlace(re, im, y * n, n, inverse);
		transposeInPlace(re, n);
		transposeInPlace(im, n);
		for (let y = 0; y < n; y++) fft1dInPlace(re, im, y * n, n, inverse);
		transposeInPlace(re, n);
		transposeInPlace(im, n);
		if (inverse && scale) {
			const s = 1 / (n * n);
			for (let i = 0; i < re.length; i++) {
				re[i] *= s;
				im[i] *= s;
			}
		}
	}
	// src/lib/segmentErrors.ts
	/**
	* Sai pha của từng phân đoạn gương: piston (lệch dọc trục quang) và tip/tilt (nghiêng).
	*
	* Mỗi phân đoạn j có sai số mặt sóng phẳng trên chính nó:
	*   W_j(u, v) = p_j + a_j · u + b_j · v,
	* với (u, v) = (dx, dy) / apothem là toạ độ chuẩn hoá trong phân đoạn (u, v = ±1 ở cạnh), và
	*   p_j ~ N(0, σ_p²),  a_j, b_j ~ N(0, σ_t²)   (đơn vị: bước sóng).
	* Số ngẫu nhiên lấy từ bộ sinh mulberry32 theo seed nên cùng seed cho cùng kết quả, và đổi seed là "rút lại" lô sai số.
	* Sai số này là độ dài đường quang hình học (một phân đoạn lệch s theo trục quang cho mặt sóng 2s khi phản xạ).
	* Vì vậy tính theo bước sóng nó tỉ lệ 1/λ, như các mode Zernike.
	*/
	var ZERO_SEGMENT_ERRORS = {
		pistonRms: 0,
		tiltRms: 0,
		seed: 1
	};
	function hasSegmentErrors(e) {
		return e.pistonRms !== 0 || e.tiltRms !== 0;
	}
	/** Nhân hai độ lệch chuẩn với factor (ví dụ λ₀/λ), giữ nguyên seed. */
	function scaleSegmentErrors(e, factor) {
		return {
			pistonRms: e.pistonRms * factor,
			tiltRms: e.tiltRms * factor,
			seed: e.seed
		};
	}
	/** mulberry32: bộ sinh số giả ngẫu nhiên 32 bit nhỏ gọn, đủ cho mô phỏng (không dùng cho mật mã). */
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
	/** Số ngẫu nhiên chuẩn N(0, 1) bằng Box–Muller. */
	function gaussian(rng) {
		const u = Math.max(rng(), 1e-12);
		return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
	}
	/**
	* Rút (piston, a, b) chuẩn N(0, 1) cho từng phân đoạn theo thứ tự cố định của `listSegments`,
	* khoá bởi "q,r". Giá trị thật là các số này nhân với σ_p hoặc σ_t.
	*/
	function drawSegments(g, seed) {
		const rng = mulberry32(seed);
		const out = /* @__PURE__ */ new Map();
		for (const c of listSegments(g)) out.set(`${c.q},${c.r}`, {
			piston: gaussian(rng),
			tipA: gaussian(rng),
			tipB: gaussian(rng)
		});
		return out;
	}
	/**
	* Mặt sóng của sai pha phân đoạn theo bước sóng, lưới n × n (chỉ số [y * n + x]), tâm ở (n/2, n/2).
	* Pixel nằm ngoài mọi phân đoạn bằng 0.
	*/
	function segmentWavefront(n, pupilDiameterPx, g, e) {
		const wave = new Float64Array(n * n);
		if (!hasSegmentErrors(e)) return wave;
		const radius = pupilDiameterPx / 2;
		const lattice = layoutFor(g, radius);
		const draws = drawSegments(g, e.seed);
		const c = n / 2;
		const lo = Math.max(0, Math.floor(c - radius) - 1);
		const hi = Math.min(n - 1, Math.ceil(c + radius) + 1);
		const a = lattice.apothemPx;
		for (let iy = lo; iy <= hi; iy++) for (let ix = lo; ix <= hi; ix++) {
			const x = ix - c;
			const y = iy - c;
			nearestSite(lattice, x, y);
			if (!siteHasMirror(lattice)) continue;
			const d = draws.get(`${site.q},${site.r}`);
			if (!d) continue;
			const u = (x - site.cx) / a;
			const v = (y - site.cy) / a;
			wave[iy * n + ix] = e.pistonRms * d.piston + e.tiltRms * (d.tipA * u + d.tipB * v);
		}
		return wave;
	}
	// src/lib/psf.ts
	/**
	* Point Spread Function (PSF) của kính thiên văn.
	*
	* Trong gần đúng Fraunhofer, trường ở mặt phẳng ảnh là biến đổi Fourier 2D của hàm khẩu độ,
	* và PSF là bình phương độ lớn của nó:  PSF = |FFT(A · e^{iφ})|² = Re² + Im².
	*
	* Lấy mẫu: pupil đường kính D chiếm `pupilDiameterPx` pixel trong lưới n × n, nên ảnh có bước
	* (λ/D) / padFactor với padFactor = n / pupilDiameterPx. Trường nhìn tổng cộng rộng n / padFactor =
	* pupilDiameterPx đơn vị λ/D, tức ±pupilDiameterPx / 2 quanh tâm (ví dụ ±64 λ/D với pupil 128 px).
	*
	* Chuẩn hoá: chia cho (ΣA)², là cường độ đỉnh của cùng khẩu độ khi không có quang sai. Nhờ đó
	* PSF lý tưởng có đỉnh đúng bằng 1 và đỉnh của PSF thật chính là tỉ số Strehl.
	*/
	/** Gần đúng Maréchal cho quang sai nhỏ: S ≈ exp(−σ²) với σ = 2π · RMS (rad). */
	function marechalStrehl(rmsWaves) {
		return Math.exp(-((2 * Math.PI * rmsWaves) ** 2));
	}
	/** Nhớ mặt nạ khẩu độ gần nhất: đổi thang hiển thị, quang sai hay bước sóng không cần dựng lại mặt nạ. */
	var cachedKey = "";
	var cachedMask = null;
	function apertureFor(params) {
		const key = JSON.stringify(params);
		if (cachedMask && key === cachedKey) return cachedMask;
		cachedMask = createAperture(params);
		cachedKey = key;
		return cachedMask;
	}
	function computePsf(params, aberrations = ZERO_ABERRATIONS, segmentErrors = ZERO_SEGMENT_ERRORS) {
		const n = params.gridSize;
		const mask = apertureFor(params);
		const area = openArea(mask);
		const useSegmentErrors = params.segments !== void 0 && hasSegmentErrors(segmentErrors);
		let wavefront = null;
		if (hasAberration(aberrations) || useSegmentErrors) {
			wavefront = buildWavefront(n, params.pupilDiameterPx, aberrations);
			if (useSegmentErrors && params.segments) {
				const seg = segmentWavefront(n, params.pupilDiameterPx, params.segments, segmentErrors);
				for (let i = 0; i < wavefront.length; i++) wavefront[i] += seg[i];
			}
		}
		const re = mask.slice();
		const im = new Float64Array(n * n);
		let rms = 0;
		if (wavefront) {
			let sumW = 0;
			for (let i = 0; i < mask.length; i++) {
				if (mask[i] === 0) continue;
				const phase = 2 * Math.PI * wavefront[i];
				re[i] = mask[i] * Math.cos(phase);
				im[i] = mask[i] * Math.sin(phase);
				sumW += mask[i] * wavefront[i];
			}
			const mean = sumW / area;
			let sumVar = 0;
			for (let i = 0; i < mask.length; i++) sumVar += mask[i] * (wavefront[i] - mean) ** 2;
			rms = Math.sqrt(sumVar / area);
		}
		fft2d(re, im, n, { nonZeroRows: nonZeroRowRange(mask, n) });
		const intensity = new Float64Array(n * n);
		const norm = 1 / (area * area);
		const half = n / 2;
		let peak = 0;
		for (let y = 0; y < n; y++) {
			const ys = (y + half) % n;
			for (let x = 0; x < n; x++) {
				const i = y * n + x;
				const v = (re[i] * re[i] + im[i] * im[i]) * norm;
				intensity[ys * n + (x + half) % n] = v;
				if (v > peak) peak = v;
			}
		}
		return {
			gridSize: n,
			padFactor: n / params.pupilDiameterPx,
			intensity,
			strehl: peak,
			openArea: area,
			aperture: mask,
			wavefrontWaves: wavefront,
			wavefrontRmsWaves: rms
		};
	}
	/** Nội suy song tuyến cường độ tại toạ độ liên tục (px, py) theo chỉ số mảng; ngoài biên trả về 0. */
	function sampleBilinear(intensity, n, px, py) {
		if (px < 0 || py < 0 || px > n - 1 || py > n - 1) return 0;
		const x0 = Math.floor(px);
		const y0 = Math.floor(py);
		const x1 = Math.min(x0 + 1, n - 1);
		const y1 = Math.min(y0 + 1, n - 1);
		const fx = px - x0;
		const fy = py - y0;
		const top = intensity[y0 * n + x0] * (1 - fx) + intensity[y0 * n + x1] * fx;
		const bottom = intensity[y1 * n + x0] * (1 - fx) + intensity[y1 * n + x1] * fx;
		return top * (1 - fy) + bottom * fy;
	}
	/** Nội suy Catmull–Rom một chiều giữa p1 và p2 (t ∈ [0, 1]) với hai điểm lân cận p0, p3. */
	function catmullRom(p0, p1, p2, p3, t) {
		return p1 + .5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
	}
	/**
	* Nội suy bicubic (Catmull–Rom) cường độ. Chính xác hơn song tuyến ở lân cận các vòng tối, nơi hàm lồi
	* và nội suy tuyến tính luôn cho giá trị cao hơn thực. Kết quả âm do dao động được cắt về 0.
	* Sát biên lưới (không đủ 4 × 4 lân cận) dùng nội suy song tuyến.
	*/
	function sampleBicubic(intensity, n, px, py) {
		const x0 = Math.floor(px);
		const y0 = Math.floor(py);
		if (x0 < 1 || y0 < 1 || x0 > n - 3 || y0 > n - 3) return sampleBilinear(intensity, n, px, py);
		const tx = px - x0;
		const ty = py - y0;
		const base = (y0 - 1) * n + x0;
		const c0 = catmullRom(intensity[base - 1], intensity[base], intensity[base + 1], intensity[base + 2], tx);
		const r1 = base + n;
		const c1 = catmullRom(intensity[r1 - 1], intensity[r1], intensity[r1 + 1], intensity[r1 + 2], tx);
		const r2 = r1 + n;
		const c2 = catmullRom(intensity[r2 - 1], intensity[r2], intensity[r2 + 1], intensity[r2 + 2], tx);
		const r3 = r2 + n;
		const c3 = catmullRom(intensity[r3 - 1], intensity[r3], intensity[r3 + 1], intensity[r3 + 2], tx);
		return Math.max(0, catmullRom(c0, c1, c2, c3, ty));
	}
	// src/lib/bessel.ts
	/**
	* Hàm Bessel loại một bậc 1:  J1(x) = (1/2π) ∫₀^{2π} cos(τ − x sin τ) dτ.
	*
	* Tích phân của hàm tuần hoàn giải tích bằng quy tắc hình thang hội tụ theo cấp số nhân khi số điểm N lớn
	* hơn |x| một chút, nên chọn N = ⌈|x|⌉ + 40. Cách này đơn giản, chính xác tới ~1e-14 và không cần bảng hệ số.
	*/
	function besselJ1(x) {
		const ax = Math.abs(x);
		if (ax < 1e-8) return x / 2;
		const n = Math.ceil(ax) + 40;
		let sum = 0;
		for (let k = 0; k < n; k++) {
			const tau = 2 * Math.PI * k / n;
			sum += Math.cos(tau - ax * Math.sin(tau));
		}
		const value = sum / n;
		return x < 0 ? -value : value;
	}
	/**
	* Mẫu Airy chuẩn hoá của khẩu độ tròn không che: I(r) = [2 J1(πr) / (πr)]²,
	* với r là khoảng cách góc tính theo λ/D. I(0) = 1.
	*/
	function airyIntensity(rLD) {
		if (rLD === 0) return 1;
		const x = Math.PI * rLD;
		return (2 * besselJ1(x) / x) ** 2;
	}
	// src/lib/profile.ts
	var ANGLES = 64;
	/**
	* Profile xuyên tâm: trung bình PSF theo góc phương vị tại mỗi bán kính góc θ ∈ [0, maxArcsec].
	* Với dải sóng rộng, các kênh được cộng có trọng số tại cùng θ, mỗi kênh dùng λ/D riêng.
	* Trung bình theo phương vị làm mờ cánh sao nhiễu xạ, nên profile phản ánh nền vòng Airy tổng quát.
	*
	* Hạn chế: PSF chỉ có 4 mẫu mỗi λ/D nên nội suy bicubic có sai số tuyệt đối dưới 1% đỉnh và nâng nhẹ các
	* cực tiểu sâu (vòng tối) so với mẫu giải tích. Đủ cho đồ thị log, không dùng để đo độ sâu vòng tối.
	*/
	function radialProfile(channels, maxArcsec, points = 160) {
		const thetaArcsec = [];
		const intensity = [];
		const airy = [];
		for (let j = 0; j < points; j++) {
			const theta = j / (points - 1) * maxArcsec;
			let sum = 0;
			let ideal = 0;
			for (const ch of channels) {
				const rLD = theta / ch.lambdaOverDArcsec;
				ideal += ch.weight * airyIntensity(rLD);
				const { gridSize: n, padFactor, intensity: data } = ch.psf;
				const rPx = rLD * padFactor;
				if (rPx > n / 2 - 3) continue;
				let ring = 0;
				for (let a = 0; a < ANGLES; a++) {
					const angle = 2 * Math.PI * a / ANGLES;
					ring += sampleBicubic(data, n, n / 2 + rPx * Math.cos(angle), n / 2 + rPx * Math.sin(angle));
				}
				sum += ch.weight * ring / ANGLES;
			}
			thetaArcsec.push(theta);
			intensity.push(sum);
			airy.push(ideal);
		}
		return {
			thetaArcsec,
			intensity,
			airy
		};
	}
	var BLUE = [
		90,
		185,
		255
	];
	var NEUTRAL = [
		237,
		242,
		255
	];
	var ORANGE = [
		255,
		170,
		70
	];
	/** Thang phân kỳ xanh–trắng–cam cho t ∈ [−1, 1]: âm xanh, dương cam. */
	function divergingColor(t) {
		const x = Math.max(-1, Math.min(1, t));
		const end = x < 0 ? BLUE : ORANGE;
		const f = Math.abs(x);
		return [
			NEUTRAL[0] + (end[0] - NEUTRAL[0]) * f,
			NEUTRAL[1] + (end[1] - NEUTRAL[1]) * f,
			NEUTRAL[2] + (end[2] - NEUTRAL[2]) * f
		];
	}
	/** Các mức thang màu có thể chọn, bước sóng. */
	var RANGE_STEPS = [
		.05,
		.1,
		.25,
		.5,
		1
	];
	/**
	* Mức thang nhỏ nhất (trong RANGE_STEPS) chứa trọn mặt sóng trên phần khẩu độ mở, tối đa ±1 bước sóng.
	* Nhờ đó sai số nhỏ vẫn hiện rõ màu; mức thang được ghi dưới hình để người xem biết màu ứng với bao nhiêu bước sóng.
	*/
	function chooseWavefrontRange(psf) {
		if (!psf.wavefrontWaves) return 1;
		let peak = 0;
		for (let i = 0; i < psf.aperture.length; i++) if (psf.aperture[i] > 0) peak = Math.max(peak, Math.abs(psf.wavefrontWaves[i]));
		return RANGE_STEPS.find((r) => r >= peak) ?? 1;
	}
	/** Cạnh ảnh xem trước pupil: pupil cộng lề 2 pixel mỗi phía. */
	function pupilViewSize(pupilDiameterPx) {
		return pupilDiameterPx + 4;
	}
	/**
	* Ảnh RGBA của pupil: màu theo mặt sóng (xanh âm, cam dương, trắng là 0), độ sáng theo truyền qua.
	* Nhờ vậy cùng một hình cho thấy cả hình học khẩu độ (vật cản, thanh chống) lẫn quang sai.
	*/
	function renderPupil(psf, pupilDiameterPx, rangeWaves = 1) {
		const n = psf.gridSize;
		const size = pupilViewSize(pupilDiameterPx);
		const start = n / 2 - size / 2;
		const out = new Uint8ClampedArray(size * size * 4);
		for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
			const src = (start + y) * n + (start + x);
			const a = psf.aperture[src];
			const [r, g, b] = divergingColor((psf.wavefrontWaves ? psf.wavefrontWaves[src] : 0) / rangeWaves);
			const k = (y * size + x) * 4;
			out[k] = r * a;
			out[k + 1] = g * a;
			out[k + 2] = b * a;
			out[k + 3] = 255;
		}
		return out;
	}
	// src/lib/colormap.ts
	/** Dựng các điểm dừng cách đều từ danh sách màu hex (từ tối đến sáng). */
	function evenStops(hex) {
		return hex.map((h, i) => [
			i / (hex.length - 1),
			parseInt(h.slice(1, 3), 16),
			parseInt(h.slice(3, 5), 16),
			parseInt(h.slice(5, 7), 16)
		]);
	}
	var STOPS = {
		gray: [[
			0,
			0,
			0,
			0
		], [
			1,
			255,
			255,
			255
		]],
		hot: [
			[
				0,
				0,
				0,
				0
			],
			[
				.36,
				255,
				0,
				0
			],
			[
				.75,
				255,
				255,
				0
			],
			[
				1,
				255,
				255,
				255
			]
		],
		inferno: evenStops([
			"#000004",
			"#1b0c42",
			"#4a0c6b",
			"#781c6d",
			"#a52c60",
			"#cf4446",
			"#ed6925",
			"#fb9b06",
			"#f7d13d",
			"#fcffa4"
		]),
		viridis: evenStops([
			"#440154",
			"#482878",
			"#3e4989",
			"#31688e",
			"#26828e",
			"#1f9e89",
			"#35b779",
			"#6ece58",
			"#b5de2b",
			"#fde725"
		]),
		ice: [
			[
				0,
				0,
				0,
				0
			],
			[
				.4,
				10,
				40,
				160
			],
			[
				.75,
				60,
				200,
				255
			],
			[
				1,
				255,
				255,
				255
			]
		]
	};
	var cache = /* @__PURE__ */ new Map();
	/** Trả về bảng 256 × 3 byte (R, G, B liên tiếp). */
	function getLut(name) {
		const hit = cache.get(name);
		if (hit) return hit;
		const stops = STOPS[name];
		const lut = /* @__PURE__ */ new Uint8ClampedArray(768);
		for (let i = 0; i < 256; i++) {
			const t = i / 255;
			let k = 0;
			while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
			const [t0, r0, g0, b0] = stops[k];
			const [t1, r1, g1, b1] = stops[k + 1];
			const f = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
			lut[i * 3] = r0 + (r1 - r0) * f;
			lut[i * 3 + 1] = g0 + (g1 - g0) * f;
			lut[i * 3 + 2] = b0 + (b1 - b0) * f;
		}
		cache.set(name, lut);
		return lut;
	}
	// src/lib/render.ts
	/** Cường độ tối thiểu, tránh log(0). */
	var FLOOR = 1e-30;
	var WHITE = [
		1,
		1,
		1
	];
	/**
	* Chuyển một hoặc nhiều PSF (mỗi kênh một bước sóng) thành ảnh RGBA theo thang logarit.
	*
	* Cường độ tổng L = Σ wᵢ Iᵢ(θ), trong đó mỗi Iᵢ được lấy mẫu tại cùng góc θ nhưng theo λ/D riêng của kênh,
	* nên vòng Airy của bước sóng dài lớn hơn và các vòng nhoè đi khi dải sóng rộng. Giá trị tô màu là
	*   v = (log10(L) + R) / R,  cắt về [0, 1],  với R = dynamicRangeDecades,
	* nên L = 1 (đỉnh lý tưởng) là sáng nhất và L = 10^−R là tối nhất. Thang log cho thấy các vòng Airy rất mờ.
	*
	* Với 'spectrum', màu mỗi pixel là sắc độ trung bình theo cường độ của các kênh, nhân với v.
	*/
	function renderChannels(channels, o) {
		const out = new Uint8ClampedArray(o.size * o.size * 4);
		const spectrum = o.colormap === "spectrum";
		const lut = o.colormap === "spectrum" ? null : getLut(o.colormap);
		const prepared = channels.map((ch) => ({
			intensity: ch.psf.intensity,
			n: ch.psf.gridSize,
			c: ch.psf.gridSize / 2,
			scale: 2 * ch.halfFovLD * ch.psf.padFactor / o.size,
			weight: ch.weight,
			rgb: ch.rgb ?? WHITE
		}));
		for (let oy = 0; oy < o.size; oy++) for (let ox = 0; ox < o.size; ox++) {
			let total = 0;
			let cr = 0;
			let cg = 0;
			let cb = 0;
			for (const ch of prepared) {
				const value = ch.weight * sampleBicubic(ch.intensity, ch.n, ch.c + (ox + .5 - o.size / 2) * ch.scale, ch.c + (oy + .5 - o.size / 2) * ch.scale);
				total += value;
				if (spectrum) {
					cr += value * ch.rgb[0];
					cg += value * ch.rgb[1];
					cb += value * ch.rgb[2];
				}
			}
			const v = Math.min(1, Math.max(0, (Math.log10(Math.max(total, FLOOR)) + o.dynamicRangeDecades) / o.dynamicRangeDecades));
			const k = (oy * o.size + ox) * 4;
			if (lut) {
				const idx = Math.round(v * 255) * 3;
				out[k] = lut[idx];
				out[k + 1] = lut[idx + 1];
				out[k + 2] = lut[idx + 2];
			} else {
				const norm = total > 0 ? 255 * v / total : 0;
				out[k] = cr * norm;
				out[k + 1] = cg * norm;
				out[k + 2] = cb * norm;
			}
			out[k + 3] = 255;
		}
		return out;
	}
	// src/lib/spectrum.ts
	/**
	* Màu gần đúng của ánh sáng đơn sắc (380–780 nm) theo xấp xỉ từng khúc phổ biến, trả về RGB trong [0, 1].
	* Kết quả được chuẩn hoá để thành phần lớn nhất bằng 1, vì độ sáng do thang log đảm nhiệm,
	* còn màu chỉ cho biết sắc độ. Ngoài khoảng nhìn thấy trả về đỏ sẫm (hồng ngoại) hoặc tím sẫm (tử ngoại).
	*/
	function wavelengthToRgb(wavelengthNm) {
		const w = wavelengthNm;
		let r = 0;
		let g = 0;
		let b = 0;
		if (w < 440) {
			r = Math.max(0, (440 - w) / 60);
			b = 1;
		} else if (w < 490) {
			g = (w - 440) / 50;
			b = 1;
		} else if (w < 510) {
			g = 1;
			b = (510 - w) / 20;
		} else if (w < 580) {
			r = (w - 510) / 70;
			g = 1;
		} else if (w < 645) {
			r = 1;
			g = (645 - w) / 65;
		} else r = 1;
		const edge = w < 420 ? .3 + .7 * (w - 380) / 40 : w > 700 ? .3 + .7 * (780 - w) / 80 : 1;
		const k = Math.max(.3, Math.min(1, edge));
		const m = Math.max(r, g, b, 1e-9);
		return [
			r / m * k,
			g / m * k,
			b / m * k
		];
	}
	/**
	* Lấy mẫu dải sóng phẳng (top-hat) rộng bandwidthNm quanh centerNm, bằng quy tắc điểm giữa.
	* Dải bằng 0 cho đúng một mẫu ở bước sóng trung tâm.
	*/
	function sampleBand(centerNm, bandwidthNm) {
		if (!(bandwidthNm > 0)) return [{
			wavelengthNm: centerNm,
			weight: 1
		}];
		const lo = Math.max(200, centerNm - bandwidthNm / 2);
		const hi = centerNm + bandwidthNm / 2;
		const out = [];
		for (let i = 0; i < 7; i++) out.push({
			wavelengthNm: lo + (i + .5) / 7 * (hi - lo),
			weight: 1 / 7
		});
		return out;
	}
	// src/lib/frame.ts
	function computeFrame(p) {
		const aperture = {
			gridSize: 512,
			pupilDiameterPx: 128,
			obstructionRatio: p.obstructionRatio,
			vaneCount: p.vaneCount,
			vaneThicknessRatio: p.vaneThicknessRatio,
			vaneAngleDeg: p.vaneAngleDeg,
			segments: p.segmented.enabled ? {
				rings: p.segmented.rings,
				gapRatio: p.segmented.gapRatio,
				removeCenter: p.segmented.removeCenter
			} : void 0
		};
		const baseErrors = {
			pistonRms: p.segmented.pistonRms,
			tiltRms: p.segmented.tiltRms,
			seed: p.segmented.seed
		};
		const hasErrors = p.segmented.enabled && hasSegmentErrors(baseErrors);
		const samples = sampleBand(p.wavelengthNm, p.bandwidthNm);
		let shared = null;
		const psfs = samples.map((s) => {
			if (!hasAberration(p.aberrations) && !hasErrors) return shared ??= computePsf(aperture);
			const factor = p.wavelengthNm / s.wavelengthNm;
			return computePsf(aperture, scaleAberrations(p.aberrations, factor), scaleSegmentErrors(baseErrors, factor));
		});
		let centre = 0;
		samples.forEach((s, i) => {
			if (Math.abs(s.wavelengthNm - p.wavelengthNm) < Math.abs(samples[centre].wavelengthNm - p.wavelengthNm)) centre = i;
		});
		const centrePsf = psfs[centre];
		const lds = samples.map((s) => lambdaOverDArcsec(p.diameterM, s.wavelengthNm));
		const channels = samples.map((s, i) => ({
			psf: psfs[i],
			halfFovLD: p.fovArcsec / 2 / lds[i],
			weight: s.weight,
			rgb: wavelengthToRgb(s.wavelengthNm)
		}));
		const rgba = renderChannels(channels, {
			size: 512,
			dynamicRangeDecades: p.dynamicRangeDecades,
			colormap: p.colormap
		});
		const profile = radialProfile(samples.map((s, i) => ({
			psf: psfs[i],
			lambdaOverDArcsec: lds[i],
			weight: s.weight
		})), p.fovArcsec / 2);
		const throughput = centrePsf.openArea / (Math.PI * 4096);
		const centreLd = lambdaOverDArcsec(p.diameterM, p.wavelengthNm);
		const pupilRangeWaves = chooseWavefrontRange(centrePsf);
		return {
			rgba,
			pupilRgba: renderPupil(centrePsf, 128, pupilRangeWaves),
			pupilSize: pupilViewSize(128),
			pupilRangeWaves,
			profile,
			stats: {
				lambdaOverDArcsec: centreLd,
				airyRadiusArcsec: 1.22 * centreLd,
				halfFovLD: p.fovArcsec / 2 / centreLd,
				fovCovered: Math.max(...channels.map((c) => c.halfFovLD)) <= 64,
				throughput,
				relativePeak: throughput * throughput * centrePsf.strehl,
				strehl: centrePsf.strehl,
				wavefrontRmsWaves: centrePsf.wavefrontRmsWaves,
				marechalStrehl: marechalStrehl(centrePsf.wavefrontRmsWaves),
				bandSamples: samples.length,
				segmentCount: p.segmented.enabled ? segmentCount(p.segmented.rings, p.segmented.removeCenter) : 0
			}
		};
	}
	// src/workers/psf.worker.ts
	/**
	* Worker tính khung PSF ngoài luồng giao diện, để kéo thanh trượt không bị giật.
	* Không dùng `lib: webworker` vì tsconfig của app đã có DOM; chỉ khai báo phần `self` cần dùng.
	*/
	var scope = self;
	scope.onmessage = (event) => {
		const { id, params } = event.data;
		const start = performance.now();
		const frame = computeFrame(params);
		scope.postMessage({
			id,
			ms: performance.now() - start,
			...frame
		}, [frame.rgba.buffer, frame.pupilRgba.buffer]);
	};
})();
