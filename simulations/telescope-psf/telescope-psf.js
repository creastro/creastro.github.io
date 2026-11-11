/* Generated from psf-simulator/src/site/main.ts by "npm run build:site". Do not edit. */
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
	var ZERNIKE_LABELS = {
		defocus: {
			label: "Defocus",
			noll: "Z4"
		},
		astigmatism0: {
			label: "Astigmatism 0°/90°",
			noll: "Z6"
		},
		astigmatism45: {
			label: "Astigmatism 45°",
			noll: "Z5"
		},
		comaX: {
			label: "Coma x",
			noll: "Z8"
		},
		comaY: {
			label: "Coma y",
			noll: "Z7"
		},
		spherical: {
			label: "Spherical",
			noll: "Z11"
		}
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
		if (p.vaneAnglesDeg) {
			if (p.vaneAnglesDeg.length !== p.vaneCount) throw new RangeError("vaneAnglesDeg phải có đúng vaneCount phần tử");
			if (!p.vaneAnglesDeg.every((a) => Number.isFinite(a))) throw new RangeError("vaneAnglesDeg phải gồm các số hữu hạn");
		}
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
			const angle = p.vaneAnglesDeg ? p.vaneAnglesDeg[j] * Math.PI / 180 : p.vaneAngleDeg * Math.PI / 180 + 2 * Math.PI * j / p.vaneCount;
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
	var COLORMAP_LABELS = {
		gray: "Gray",
		hot: "Hot (black–red–yellow–white)",
		inferno: "Inferno (false color)",
		viridis: "Viridis (false color)",
		ice: "Ice (black–blue–cyan–white)",
		spectrum: "Wavelength color (illustrative)"
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
			vaneCount: p.vaneAnglesDeg ? p.vaneAnglesDeg.length : p.vaneCount,
			vaneThicknessRatio: p.vaneThicknessRatio,
			vaneAngleDeg: p.vaneAngleDeg,
			vaneAnglesDeg: p.vaneAnglesDeg ? p.vaneAnglesDeg.map((a) => a + p.vaneAngleDeg) : void 0,
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
	// src/site/controlSpecs.ts
	/**
	* Đặc tả các điều khiển của trang: id, nhãn, khoảng giá trị và cách hiển thị. Là dữ liệu thuần (không DOM) để
	* trang web và test kiểm tra nội dung giải tích dùng chung, nên id điều khiển không thể lệch khỏi help.js.
	*/
	/** Số bước của thanh trượt logarit: giá trị = min · (max / min)^(vị trí / LOG_STEPS). */
	var LOG_STEPS = 1e4;
	function toPosition(spec, value) {
		if (!spec.log) return value;
		return Math.log(value / spec.min) / Math.log(spec.max / spec.min) * LOG_STEPS;
	}
	function fromPosition(spec, position) {
		if (!spec.log) return position;
		return spec.min * (spec.max / spec.min) ** (position / LOG_STEPS);
	}
	var signed = (v) => `${v < 0 ? "−" : v > 0 ? "+" : ""}${Math.abs(v).toFixed(3)} λ`;
	/** Id của thanh trượt từng mode Zernike. */
	var ZERNIKE_IDS = {
		defocus: "z-defocus",
		astigmatism0: "z-ast0",
		astigmatism45: "z-ast45",
		comaX: "z-comax",
		comaY: "z-comay",
		spherical: "z-sph"
	};
	var VANE_IDS = Array.from({ length: 8 }, (_, i) => `va${i + 1}`);
	var vaneAngleSpecs = VANE_IDS.map((id, i) => ({
		id,
		group: "vaneEach",
		label: `Vane ${i + 1} angle`,
		min: 0,
		max: 360,
		step: .1,
		value: i * 45,
		format: (v) => `${v.toFixed(1)}°`
	}));
	var zernikeSpecs = ZERNIKE_NAMES.map((name) => ({
		id: ZERNIKE_IDS[name],
		group: "zern",
		label: `${ZERNIKE_LABELS[name].label} (${ZERNIKE_LABELS[name].noll})`,
		min: -.5,
		max: .5,
		step: .005,
		value: 0,
		format: signed
	}));
	var RANGE_SPECS = [
		{
			id: "D",
			group: "mirror",
			label: "Mirror diameter D",
			min: .1,
			max: 40,
			step: .01,
			value: 1,
			log: true,
			format: (v) => `${v.toFixed(2)} m`
		},
		{
			id: "lam",
			group: "mirror",
			label: "Center wavelength λ",
			min: 380,
			max: 1e3,
			step: 5,
			value: 550,
			format: (v) => `${v.toFixed(0)} nm`
		},
		{
			id: "band",
			group: "mirror",
			label: "Bandwidth Δλ",
			min: 0,
			max: 300,
			step: 5,
			value: 0,
			format: (v) => v === 0 ? "single λ" : `${v.toFixed(0)} nm`
		},
		{
			id: "seg-rings",
			group: "seg",
			label: "Rings k",
			min: 1,
			max: 8,
			step: 1,
			value: 2,
			format: (v) => String(v)
		},
		{
			id: "seg-gap",
			group: "seg",
			label: "Gap between segments",
			min: 0,
			max: .1,
			step: .001,
			value: .02,
			format: (v) => `${(v * 100).toFixed(1)} %`
		},
		{
			id: "seg-piston",
			group: "seg",
			label: "Piston error (RMS)",
			min: 0,
			max: .3,
			step: .005,
			value: 0,
			format: (v) => `${v.toFixed(3)} λ`
		},
		{
			id: "seg-tilt",
			group: "seg",
			label: "Tip/tilt error (RMS)",
			min: 0,
			max: .3,
			step: .005,
			value: 0,
			format: (v) => `${v.toFixed(3)} λ`
		},
		{
			id: "eps",
			group: "vanes",
			label: "Central obstruction ε",
			min: 0,
			max: .7,
			step: .01,
			value: .3,
			format: (v) => `${(v * 100).toFixed(0)} % of D`
		},
		{
			id: "nvane",
			group: "vanes",
			label: "Spider vanes N",
			min: 0,
			max: 8,
			step: 1,
			value: 4,
			format: (v) => String(v)
		},
		{
			id: "tvane",
			group: "vanes",
			label: "Vane thickness t",
			min: .002,
			max: .05,
			step: .001,
			value: .015,
			format: (v) => `${(v * 100).toFixed(1)} % of D`
		},
		{
			id: "avane",
			group: "vanes",
			label: "Vane rotation φ₀",
			min: 0,
			max: 180,
			step: 1,
			value: 0,
			format: (v) => `${v.toFixed(0)}°`
		},
		...vaneAngleSpecs,
		...zernikeSpecs,
		{
			id: "fov",
			group: "display",
			label: "Field of view",
			min: .02,
			max: 30,
			step: .1,
			value: 3,
			log: true,
			format: (v) => `${v.toFixed(v < 10 ? 2 : 1)}″`
		},
		{
			id: "range",
			group: "display",
			label: "Dynamic range",
			min: 2,
			max: 8,
			step: .5,
			value: 5,
			format: (v) => `${v.toFixed(1)} decades`
		}
	];
	/** Các dòng số liệu dẫn xuất: khoá, nhãn, và chủ đề giải thích khi bấm vào tên. */
	var READ_ROWS = [
		[
			"ld",
			"λ/D",
			"ld"
		],
		[
			"airy",
			"First dark ring 1.22 λ/D",
			"airy"
		],
		[
			"area",
			"Light-collecting area",
			"area"
		],
		[
			"strehl",
			"Strehl ratio",
			"strehl"
		],
		[
			"rms",
			"Wavefront error (RMS)",
			"wavefront"
		],
		[
			"marechal",
			"Strehl from Maréchal",
			"strehl"
		],
		[
			"peak",
			"Peak vs. clear circle",
			"relpeak"
		],
		[
			"segs",
			"Mirror segments",
			"seg"
		],
		[
			"samples",
			"Wavelength samples",
			"band"
		],
		[
			"time",
			"Compute time",
			"numerics"
		]
	];
	var specById = (id) => RANGE_SPECS.find((s) => s.id === id);
	// src/site/dom.ts
	/** Tra cứu phần tử theo id; báo lỗi rõ ràng nếu trang thiếu phần tử mà mã cần. */
	var $ = (id) => {
		const el = document.getElementById(id);
		if (!el) throw new Error(`Missing element #${id}`);
		return el;
	};
	var input = (id) => $(id);
	var select = (id) => $(id);
	// src/site/controls.ts
	/**
	* Các điều khiển của trang: dựng thanh trượt từ đặc tả, đọc giá trị thật, và đọc hoặc áp dụng toàn bộ trạng thái
	* (dùng cho lưu và nạp cấu hình). Thanh trượt logarit lưu vị trí, nên mọi truy cập đi qua `value` và `setValue`.
	*/
	function fieldHtml(s) {
		const min = s.log ? 0 : s.min;
		const max = s.log ? LOG_STEPS : s.max;
		const step = s.log ? 1 : s.step;
		const value = s.log ? Math.round(toPosition(s, s.value)) : s.value;
		return `<div class="field"><label for="${s.id}">${s.label}</label><input id="${s.id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"><output for="${s.id}"></output></div>`;
	}
	/** Dựng các hàng thanh trượt vào các nhóm, và các lựa chọn của bảng màu. */
	function buildControls() {
		for (const group of [
			"mirror",
			"seg",
			"vanes",
			"vaneEach",
			"zern",
			"display"
		]) $(`g-${group}`).innerHTML = RANGE_SPECS.filter((s) => s.group === group).map(fieldHtml).join("");
		$("cmap").innerHTML = Object.keys(COLORMAP_LABELS).map((k) => `<option value="${k}"${k === "hot" ? " selected" : ""}>${COLORMAP_LABELS[k]}</option>`).join("");
	}
	/** Giá trị thật của một thanh trượt (đã đổi từ vị trí nếu là thang log). */
	function value(id) {
		const spec = specById(id);
		if (!spec) throw new Error(`Unknown control ${id}`);
		return fromPosition(spec, +input(id).value);
	}
	function setValue(id, v) {
		const spec = specById(id);
		if (spec) input(id).value = String(toPosition(spec, v));
	}
	function syncOutputs() {
		document.querySelectorAll("#controls output").forEach((o) => {
			const spec = specById(o.htmlFor.toString());
			if (spec) o.textContent = spec.format(value(spec.id));
		});
	}
	var seed = 1;
	var getSeed = () => seed;
	var setSeed = (n) => {
		seed = n;
	};
	function readParams() {
		const aberrations = {};
		for (const name of ZERNIKE_NAMES) aberrations[name] = value(ZERNIKE_IDS[name]);
		return {
			diameterM: value("D"),
			wavelengthNm: value("lam"),
			bandwidthNm: value("band"),
			obstructionRatio: value("eps"),
			vaneCount: Math.round(value("nvane")),
			vaneThicknessRatio: value("tvane"),
			vaneAngleDeg: value("avane"),
			vaneAnglesDeg: input("vane-each").checked ? VANE_IDS.slice(0, Math.round(value("nvane"))).map((id) => value(id)) : null,
			aberrations,
			segmented: {
				enabled: input("seg-on").checked,
				rings: Math.round(value("seg-rings")),
				gapRatio: value("seg-gap"),
				removeCenter: input("seg-center").checked,
				pistonRms: value("seg-piston"),
				tiltRms: value("seg-tilt"),
				seed
			},
			fovArcsec: value("fov"),
			dynamicRangeDecades: value("range"),
			colormap: select("cmap").value
		};
	}
	/** Toàn bộ trạng thái hiện tại của giao diện, gồm cả những thanh trượt góc đang ẩn và vòng đánh dấu. */
	function readUiState() {
		return {
			params: readParams(),
			vaneSlots: VANE_IDS.map((id) => value(id)),
			individualVanes: input("vane-each").checked,
			showRing: input("showring").checked
		};
	}
	/** Phần "Segmented mirror" chỉ hiện khi bật. */
	function syncSeg() {
		$("seg-more").hidden = !input("seg-on").checked;
	}
	/** Góc riêng của từng thanh chống: chỉ hiện thanh trượt của những thanh đang có, và chỉ khi tuỳ chọn đang bật. */
	function syncVanes() {
		$("vane-more").hidden = !input("vane-each").checked;
		const n = Math.round(value("nvane"));
		VANE_IDS.forEach((id, i) => {
			const field = input(id).closest(".field");
			if (field) field.hidden = i >= n;
		});
	}
	/** Bắt đầu từ những góc mà các thanh chống đang có (cách đều, trước khi cộng góc xoay), để ảnh không nhảy. */
	function initVaneAngles() {
		const n = Math.max(1, Math.round(value("nvane")));
		VANE_IDS.forEach((id, i) => setValue(id, i < n ? 360 * i / n : 45 * i % 360));
		syncOutputs();
	}
	/** Bảng màu và vòng đánh dấu nằm ngoài biểu mẫu nên biểu mẫu không tự đặt lại chúng. */
	function resetDisplayControls() {
		select("cmap").value = "hot";
		input("showring").checked = false;
	}
	/** Đặt mọi điều khiển theo `state` (nạp cấu hình). Người gọi cần gọi lại phần tính toán sau đó. */
	function applyUiState(state) {
		const p = state.params;
		setValue("D", p.diameterM);
		setValue("lam", p.wavelengthNm);
		setValue("band", p.bandwidthNm);
		setValue("eps", p.obstructionRatio);
		setValue("nvane", p.vaneCount);
		setValue("tvane", p.vaneThicknessRatio);
		setValue("avane", p.vaneAngleDeg);
		for (const name of ZERNIKE_NAMES) setValue(ZERNIKE_IDS[name], p.aberrations[name]);
		const s = p.segmented;
		input("seg-on").checked = s.enabled;
		setValue("seg-rings", s.rings);
		setValue("seg-gap", s.gapRatio);
		input("seg-center").checked = s.removeCenter;
		setValue("seg-piston", s.pistonRms);
		setValue("seg-tilt", s.tiltRms);
		setSeed(s.seed);
		setValue("fov", p.fovArcsec);
		setValue("range", p.dynamicRangeDecades);
		select("cmap").value = p.colormap;
		input("showring").checked = state.showRing;
		VANE_IDS.forEach((id, i) => setValue(id, state.vaneSlots[i]));
		input("vane-each").checked = state.individualVanes;
		syncSeg();
		syncVanes();
		syncOutputs();
	}
	// src/site/files.ts
	var SETTINGS_FILE_NAME = "telescope-psf-settings.json";
	/** Nhãn bước sóng: một giá trị hoặc một dải. */
	function wavelengthText(p) {
		if (p.bandwidthNm <= 0) return `${p.wavelengthNm.toFixed(0)} nm`;
		return `${Math.max(200, p.wavelengthNm - p.bandwidthNm / 2).toFixed(0)}–${(p.wavelengthNm + p.bandwidthNm / 2).toFixed(0)} nm`;
	}
	/** Tên tệp ảnh, ví dụ telescope-psf_aperture_D6.50m_550nm_hex18.png. Chỉ có chữ, số, dấu chấm, gạch dưới và gạch nối. */
	function imageFileName(kind, p, segments = 0) {
		const lam = p.bandwidthNm > 0 ? wavelengthText(p).replace("–", "-").replace(" nm", "nm") : `${p.wavelengthNm.toFixed(0)}nm`;
		const parts = [
			"telescope-psf",
			kind,
			`D${p.diameterM.toFixed(2)}m`,
			lam
		];
		if (segments > 0) parts.push(`hex${segments}`);
		return parts.join("_") + ".png";
	}
	/** Dòng chú thích ghi sẵn trên ảnh, để ảnh lưu ra tự mô tả được. */
	function captionFor(kind, p, s) {
		const parts = [`D = ${p.diameterM.toFixed(2)} m`, `λ = ${wavelengthText(p)}`];
		if (s.segmentCount > 0) parts.push(`${s.segmentCount} hexagonal segments`);
		if (p.obstructionRatio > 0) parts.push(`ε = ${(p.obstructionRatio * 100).toFixed(0)} %`);
		const vanes = p.vaneAnglesDeg ? p.vaneAnglesDeg.length : p.vaneCount;
		if (vanes > 0) parts.push(`${vanes} vane${vanes === 1 ? "" : "s"}`);
		if (kind === "psf") parts.push(`field of view ${p.fovArcsec.toFixed(p.fovArcsec < 10 ? 2 : 1)}″`);
		parts.push(`Strehl ${s.strehl.toFixed(3)}`);
		return parts.join(" · ");
	}
	// src/site/plotTools.ts
	/** Công cụ thuần cho việc vẽ đồ thị: màu, phông, bước chia và nhãn. Không phụ thuộc DOM nên kiểm thử được. */
	var COLOR = {
		text: "#b3bfd8",
		grid: "rgba(255,255,255,.08)",
		frame: "rgba(255,255,255,.25)",
		accent: "#8fe3ff",
		white: "#edf2ff",
		grey: "rgba(179,191,216,.8)"
	};
	var FONT = "12px system-ui, sans-serif";
	/** Màu nền của ảnh lưu ra: cùng màu nền của trang, để ảnh đọc được trên mọi nền. */
	var EXPORT_BACKGROUND = "#0b1326";
	/** Bước chia "tròn" (1, 2, 5 × 10^k) sao cho có khoảng n vạch trên khoảng range. */
	function niceStep(range, n) {
		const raw = range / n;
		const p = 10 ** Math.floor(Math.log10(raw));
		const f = raw / p;
		return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
	}
	/** Độ dài thanh tỉ lệ "tròn" (1, 2, 5 × 10^k) gần 22 % bề rộng, không vượt quá 30 %. */
	function niceBar(range) {
		const target = range * .22;
		const exp = Math.floor(Math.log10(target));
		let best = 10 ** exp;
		for (const m of [
			1,
			2,
			5,
			10
		]) {
			const c = m * 10 ** exp;
			if (c <= range * .3 && Math.abs(c - target) < Math.abs(best - target)) best = c;
		}
		return best;
	}
	var SUPERSCRIPT = {
		"-": "⁻",
		"0": "⁰",
		"1": "¹",
		"2": "²",
		"3": "³",
		"4": "⁴",
		"5": "⁵",
		"6": "⁶",
		"7": "⁷",
		"8": "⁸",
		"9": "⁹"
	};
	/** Nhãn lũy thừa của 10 ở trục log: 0 → "1", −3 → "10⁻³". */
	function pow10Label(exponent) {
		if (exponent === 0) return "1";
		return "10" + String(exponent).split("").map((c) => SUPERSCRIPT[c] ?? c).join("");
	}
	function arcsecLabel(v) {
		return `${Number(v.toPrecision(2))}″`;
	}
	// src/site/plots.ts
	/** Đặt kích thước điểm ảnh của canvas theo kích thước hiển thị và mật độ màn hình (tối đa 2×). */
	function fitCanvas(canvas) {
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		const w = canvas.clientWidth;
		const h = canvas.clientHeight;
		if (!w || !h) return null;
		const pw = Math.round(w * dpr);
		const ph = Math.round(h * dpr);
		if (canvas.width !== pw || canvas.height !== ph) {
			canvas.width = pw;
			canvas.height = ph;
		}
		const ctx = canvas.getContext("2d");
		if (!ctx) return null;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		return {
			ctx,
			w,
			h
		};
	}
	/** Vẽ ảnh PSF (đã tô màu) lên canvas, kèm thanh tỉ lệ và vòng tối đầu tiên tuỳ chọn. */
	function drawPsf(canvas, source, o) {
		const t = fitCanvas(canvas);
		if (t) paintPsf(t, source, o);
	}
	function paintPsf({ ctx, w, h }, source, o) {
		ctx.clearRect(0, 0, w, h);
		ctx.imageSmoothingEnabled = true;
		ctx.drawImage(source, 0, 0, w, h);
		if (o.showRing) {
			const r = o.airyRadiusArcsec / o.fovArcsec * w;
			ctx.strokeStyle = "rgba(143,227,255,.7)";
			ctx.lineWidth = 1.2;
			ctx.setLineDash([6, 5]);
			ctx.beginPath();
			ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
			ctx.stroke();
			ctx.setLineDash([]);
			if (r < w / 2 - 40) {
				ctx.fillStyle = COLOR.accent;
				ctx.font = FONT;
				ctx.textAlign = "left";
				ctx.textBaseline = "bottom";
				ctx.fillText("1.22 λ/D", w / 2 + r * .72 + 4, h / 2 - r * .72);
			}
		}
		const bar = niceBar(o.fovArcsec);
		const px = bar / o.fovArcsec * w;
		ctx.strokeStyle = COLOR.white;
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(14, h - 16);
		ctx.lineTo(14 + px, h - 16);
		ctx.stroke();
		ctx.fillStyle = COLOR.white;
		ctx.font = FONT;
		ctx.textAlign = "left";
		ctx.textBaseline = "bottom";
		ctx.fillText(arcsecLabel(bar), 14, h - 20);
		ctx.textAlign = "right";
		ctx.textBaseline = "top";
		ctx.fillText(o.label, w - 12, 10);
	}
	/** Vẽ ảnh pupil lên canvas. */
	function drawPupil(canvas, source) {
		const t = fitCanvas(canvas);
		if (t) paintPupil(t, source);
	}
	function paintPupil({ ctx, w, h }, source) {
		ctx.clearRect(0, 0, w, h);
		ctx.imageSmoothingEnabled = true;
		ctx.drawImage(source, 0, 0, w, h);
	}
	/** Profile xuyên tâm trên trục log, so với mẫu Airy lý tưởng. */
	function drawProfile(canvas, profile, decades) {
		const t = fitCanvas(canvas);
		if (t) paintProfile(t, profile, decades);
	}
	function paintProfile({ ctx, w, h }, profile, decades) {
		ctx.clearRect(0, 0, w, h);
		const m = {
			l: 56,
			r: 12,
			t: 10,
			b: 38
		};
		const pw = w - m.l - m.r;
		const ph = h - m.t - m.b;
		const maxTheta = profile.thetaArcsec[profile.thetaArcsec.length - 1];
		const X = (t) => m.l + t / maxTheta * pw;
		const Y = (v) => {
			const l = Math.max(-decades, Math.min(0, Math.log10(Math.max(v, 1e-12))));
			return m.t + -l / decades * ph;
		};
		ctx.font = FONT;
		ctx.textAlign = "right";
		ctx.textBaseline = "middle";
		for (let d = 0; d <= Math.floor(decades); d++) {
			const y = Math.round(Y(10 ** -d)) + .5;
			ctx.strokeStyle = COLOR.grid;
			ctx.beginPath();
			ctx.moveTo(m.l, y);
			ctx.lineTo(w - m.r, y);
			ctx.stroke();
			ctx.fillStyle = COLOR.text;
			ctx.fillText(pow10Label(-d), m.l - 8, y);
		}
		ctx.textAlign = "center";
		ctx.textBaseline = "top";
		const step = niceStep(maxTheta, 5);
		for (let t = 0; t <= maxTheta + 1e-9; t += step) {
			const x = Math.round(X(t)) + .5;
			ctx.strokeStyle = COLOR.grid;
			ctx.beginPath();
			ctx.moveTo(x, m.t);
			ctx.lineTo(x, h - m.b);
			ctx.stroke();
			ctx.fillStyle = COLOR.text;
			ctx.fillText(String(Number(t.toPrecision(3))), x, h - m.b + 7);
		}
		ctx.strokeStyle = COLOR.frame;
		ctx.lineWidth = 1;
		ctx.strokeRect(m.l + .5, m.t + .5, pw - 1, ph - 1);
		ctx.fillStyle = COLOR.text;
		ctx.textBaseline = "bottom";
		ctx.fillText("angular distance from the star (arcsec)", m.l + pw / 2, h - 2);
		const line = (values, style, width, dash) => {
			ctx.strokeStyle = style;
			ctx.lineWidth = width;
			ctx.setLineDash(dash);
			ctx.beginPath();
			values.forEach((v, i) => {
				const x = X(profile.thetaArcsec[i]);
				const y = Y(v);
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			});
			ctx.stroke();
			ctx.setLineDash([]);
		};
		ctx.save();
		ctx.beginPath();
		ctx.rect(m.l, m.t, pw, ph);
		ctx.clip();
		line(profile.airy, COLOR.grey, 1.2, [5, 4]);
		line(profile.intensity, COLOR.accent, 1.8, []);
		ctx.restore();
		const lx = w - m.r - 150;
		ctx.textAlign = "left";
		ctx.textBaseline = "middle";
		ctx.fillStyle = COLOR.text;
		ctx.strokeStyle = COLOR.accent;
		ctx.lineWidth = 1.8;
		ctx.beginPath();
		ctx.moveTo(lx, m.t + 14);
		ctx.lineTo(lx + 18, m.t + 14);
		ctx.stroke();
		ctx.fillText("simulation", lx + 24, m.t + 14);
		ctx.strokeStyle = COLOR.grey;
		ctx.lineWidth = 1.2;
		ctx.setLineDash([5, 4]);
		ctx.beginPath();
		ctx.moveTo(lx, m.t + 32);
		ctx.lineTo(lx + 18, m.t + 32);
		ctx.stroke();
		ctx.setLineDash([]);
		ctx.fillText("ideal Airy pattern", lx + 24, m.t + 32);
	}
	// src/site/exportImages.ts
	/**
	* Canvas ẩn để vẽ ảnh lưu ra, với kích thước logic w × h và độ phân giải `scale` lần (mặc định 2×), đã tô màu nền.
	* Cùng các hàm vẽ như trên màn hình, nên ảnh lưu ra giống hệt ảnh đang xem, chỉ sắc nét hơn.
	*/
	function exportCanvas(w, h, scale = 2) {
		const canvas = document.createElement("canvas");
		canvas.width = Math.round(w * scale);
		canvas.height = Math.round(h * scale);
		const ctx = canvas.getContext("2d");
		if (!ctx) return null;
		ctx.setTransform(scale, 0, 0, scale, 0, 0);
		ctx.fillStyle = EXPORT_BACKGROUND;
		ctx.fillRect(0, 0, w, h);
		return {
			canvas,
			target: {
				ctx,
				w,
				h
			}
		};
	}
	/** Thang màu của mặt sóng (xanh, trắng, cam) kèm hai nhãn ở hai đầu, dùng cho ảnh pupil lưu ra. */
	function paintWavefrontScale(ctx, x, y, w, minLabel, maxLabel) {
		const barW = Math.min(260, w * .5);
		const bx = x + (w - barW) / 2;
		const gradient = ctx.createLinearGradient(bx, 0, bx + barW, 0);
		gradient.addColorStop(0, "#5ab9ff");
		gradient.addColorStop(.5, "#edf2ff");
		gradient.addColorStop(1, "#ffaa46");
		ctx.fillStyle = gradient;
		ctx.fillRect(bx, y + 11, barW, 10);
		ctx.strokeStyle = "rgba(255,255,255,.25)";
		ctx.lineWidth = 1;
		ctx.strokeRect(bx + .5, y + 11.5, barW - 1, 9);
		ctx.font = "12px ui-monospace, monospace";
		ctx.fillStyle = COLOR.text;
		ctx.textBaseline = "middle";
		ctx.textAlign = "right";
		ctx.fillText(minLabel, bx - 10, y + 16);
		ctx.textAlign = "left";
		ctx.fillText(maxLabel, bx + barW + 10, y + 16);
	}
	/** Dải chú thích (một dòng chữ ở giữa) ở y .. y + h, dùng cho ảnh lưu ra. */
	function paintCaption(ctx, x, y, w, h, text) {
		ctx.fillStyle = EXPORT_BACKGROUND;
		ctx.fillRect(x, y, w, h);
		ctx.strokeStyle = "rgba(255,255,255,.14)";
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(x, y + .5);
		ctx.lineTo(x + w, y + .5);
		ctx.stroke();
		ctx.font = FONT;
		ctx.fillStyle = COLOR.text;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText(text, x + w / 2, y + h / 2 + .5, w - 16);
	}
	/** Kích thước logic của ảnh lưu ra (đơn vị CSS); canvas thật gấp đôi. */
	var IMAGE_W = 640;
	var CAPTION_H = 34;
	var SCALE_H = 36;
	var PROFILE_H = 380;
	/** Cho trình duyệt tải một đối tượng Blob xuống với tên cho trước. */
	function downloadBlob(blob, name) {
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = name;
		a.rel = "noopener";
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1e4);
	}
	/** Lưu nội dung văn bản (ví dụ tệp cấu hình JSON). */
	function downloadText(text, name, mime = "application/json") {
		downloadBlob(new Blob([text], { type: mime }), name);
	}
	function savePng(canvas, name) {
		canvas.toBlob((blob) => {
			if (blob) downloadBlob(blob, name);
		}, "image/png");
	}
	/** Ảnh PSF như đang xem (kèm thanh tỉ lệ, vòng tối đầu tiên nếu đang bật, nhãn bước sóng) và dòng chú thích. */
	function savePsfImage(frame, params, source, showRing) {
		const out = exportCanvas(IMAGE_W, 674);
		if (!out) return;
		const { canvas, target } = out;
		paintPsf({
			ctx: target.ctx,
			w: IMAGE_W,
			h: IMAGE_W
		}, source, {
			fovArcsec: params.fovArcsec,
			airyRadiusArcsec: frame.stats.airyRadiusArcsec,
			showRing,
			label: wavelengthText(params)
		});
		paintCaption(target.ctx, 0, IMAGE_W, IMAGE_W, CAPTION_H, captionFor("psf", params, frame.stats));
		savePng(canvas, imageFileName("psf", params, frame.stats.segmentCount));
	}
	/** Ảnh khẩu độ và mặt sóng, với thang màu của mặt sóng phía trên và dòng chú thích phía dưới. */
	function saveAperture(frame, params, source) {
		const out = exportCanvas(IMAGE_W, 710);
		if (!out) return;
		const { canvas, target } = out;
		const r = frame.pupilRangeWaves;
		paintWavefrontScale(target.ctx, 0, 0, IMAGE_W, `−${r} λ`, `+${r} λ`);
		target.ctx.save();
		target.ctx.translate(0, SCALE_H);
		paintPupil({
			ctx: target.ctx,
			w: IMAGE_W,
			h: IMAGE_W
		}, source);
		target.ctx.restore();
		paintCaption(target.ctx, 0, 676, IMAGE_W, CAPTION_H, captionFor("aperture", params, frame.stats));
		savePng(canvas, imageFileName("aperture", params, frame.stats.segmentCount));
	}
	/** Đồ thị profile xuyên tâm (đường mô phỏng và mẫu Airy lý tưởng) và dòng chú thích. */
	function saveProfileImage(frame, params) {
		const out = exportCanvas(IMAGE_W, 414);
		if (!out) return;
		const { canvas, target } = out;
		paintProfile({
			ctx: target.ctx,
			w: IMAGE_W,
			h: PROFILE_H
		}, frame.profile, params.dynamicRangeDecades);
		paintCaption(target.ctx, 0, PROFILE_H, IMAGE_W, CAPTION_H, captionFor("profile", params, frame.stats));
		savePng(canvas, imageFileName("profile", params, frame.stats.segmentCount));
	}
	// src/lib/segmentPresets.ts
	var SEGMENT_PRESETS = {
		jwst: {
			label: "JWST-like (18)",
			patch: {
				diameterM: 6.5,
				fovArcsec: 1,
				obstructionRatio: 0,
				vaneCount: 0,
				segmented: {
					rings: 2,
					gapRatio: .005,
					removeCenter: true
				}
			}
		},
		keck: {
			label: "Keck-like (36)",
			patch: {
				diameterM: 10,
				fovArcsec: .8,
				obstructionRatio: 0,
				vaneCount: 0,
				segmented: {
					rings: 3,
					gapRatio: .002,
					removeCenter: true
				}
			}
		},
		rings5: {
			label: "91 segments",
			patch: {
				diameterM: 30,
				fovArcsec: .3,
				obstructionRatio: 0,
				vaneCount: 0,
				segmented: {
					rings: 5,
					gapRatio: .005,
					removeCenter: false
				}
			}
		}
	};
	// src/lib/telescopePresets.ts
	var off = {
		enabled: false,
		rings: 2,
		gapRatio: .005,
		removeCenter: true
	};
	var TELESCOPE_PRESETS = {
		hubble: {
			label: "Hubble",
			summary: "D = 2.4 m, central obstruction about 0.33, four spider vanes.",
			patch: {
				diameterM: 2.4,
				fovArcsec: 2,
				obstructionRatio: .33,
				vaneCount: 4,
				vaneThicknessRatio: .0125,
				vaneAngleDeg: 45,
				segmented: off
			}
		},
		vlt: {
			label: "VLT",
			summary: "One 8.2 m Unit Telescope of the VLT: obstruction about 0.14, four thin vanes.",
			patch: {
				diameterM: 8.2,
				fovArcsec: .8,
				obstructionRatio: .14,
				vaneCount: 4,
				vaneThicknessRatio: .005,
				vaneAngleDeg: 0,
				segmented: off
			}
		},
		jwst: {
			label: "JWST",
			summary: "18 hexagonal segments, D = 6.5 m, secondary obstruction about 0.11 and its three struts (one vertical, two at 150° from it).",
			patch: {
				...SEGMENT_PRESETS.jwst.patch,
				obstructionRatio: .11,
				vaneCount: 3,
				vaneThicknessRatio: .015,
				vaneAngleDeg: 0,
				vaneAnglesDeg: [
					270,
					60,
					120
				],
				segmented: {
					enabled: true,
					...SEGMENT_PRESETS.jwst.patch.segmented
				}
			}
		},
		keck: {
			label: "Keck",
			summary: "36 hexagonal segments, D = 10 m, empty center and six thin spider arms (0.025 m wide).",
			patch: {
				...SEGMENT_PRESETS.keck.patch,
				vaneCount: 6,
				vaneThicknessRatio: .0025,
				vaneAngleDeg: 0,
				segmented: {
					enabled: true,
					...SEGMENT_PRESETS.keck.patch.segmented
				}
			}
		},
		elt: {
			label: "ELT",
			summary: "D = 39 m, obstruction about 0.11, six spider vanes, simplified to 217 segments (the real one has 798).",
			patch: {
				diameterM: 39,
				fovArcsec: .2,
				obstructionRatio: .11,
				vaneCount: 6,
				vaneThicknessRatio: .013,
				vaneAngleDeg: 0,
				segmented: {
					enabled: true,
					rings: 8,
					gapRatio: .003,
					removeCenter: false
				}
			}
		}
	};
	// src/site/presets.ts
	/** Nút cấu hình có sẵn: đặt các điều khiển theo một cấu hình rồi để trang tính lại. */
	var SEGMENT_PRESET_BUTTONS = {
		"preset-jwst": "jwst",
		"preset-keck": "keck",
		"preset-91": "rings5"
	};
	var TELESCOPE_BUTTONS = {
		"tel-hubble": "hubble",
		"tel-vlt": "vlt",
		"tel-jwst": "jwst",
		"tel-keck": "keck",
		"tel-elt": "elt"
	};
	/** Gắn các nút; `onChange` được gọi sau khi điều khiển đã đổi. */
	function wirePresets(onChange) {
		for (const [id, key] of Object.entries(SEGMENT_PRESET_BUTTONS)) $(id).addEventListener("click", () => {
			const p = SEGMENT_PRESETS[key].patch;
			setValue("D", p.diameterM);
			setValue("fov", p.fovArcsec);
			setValue("eps", p.obstructionRatio);
			setValue("nvane", p.vaneCount);
			setValue("seg-rings", p.segmented.rings);
			setValue("seg-gap", p.segmented.gapRatio);
			input("seg-center").checked = p.segmented.removeCenter;
			input("seg-on").checked = true;
			syncSeg();
			onChange();
		});
		for (const [id, key] of Object.entries(TELESCOPE_BUTTONS)) $(id).addEventListener("click", () => {
			const p = TELESCOPE_PRESETS[key].patch;
			setValue("D", p.diameterM);
			setValue("fov", p.fovArcsec);
			setValue("eps", p.obstructionRatio);
			setValue("nvane", p.vaneCount);
			setValue("tvane", p.vaneThicknessRatio);
			setValue("avane", p.vaneAngleDeg);
			const angles = p.vaneAnglesDeg;
			input("vane-each").checked = angles !== void 0;
			if (angles) angles.forEach((a, i) => setValue(VANE_IDS[i], a));
			input("seg-on").checked = p.segmented.enabled;
			setValue("seg-rings", p.segmented.rings);
			setValue("seg-gap", p.segmented.gapRatio);
			input("seg-center").checked = p.segmented.removeCenter;
			for (const name of ZERNIKE_NAMES) setValue(ZERNIKE_IDS[name], 0);
			setValue("seg-piston", 0);
			setValue("seg-tilt", 0);
			syncSeg();
			syncVanes();
			syncOutputs();
			onChange();
		});
	}
	// src/site/settings.ts
	/**
	* Lưu và nạp cấu hình của mô phỏng ra tệp JSON.
	*
	* Tệp dùng tên trường dễ đọc, theo từng nhóm điều khiển, và giá trị thật (đơn vị SI hoặc giây cung, không phải vị trí
	* thanh trượt), nên đọc được bằng mắt và không phụ thuộc id của giao diện. Khi nạp, trường thiếu lấy giá trị mặc định,
	* trường lạ bị bỏ qua, và giá trị ngoài khoảng cho phép bị kẹp vào khoảng đó; mọi điều chỉnh được ghi lại để báo cho người dùng.
	* Chỉ tệp hỏng hẳn (không phải JSON, sai định dạng, từ phiên bản mới hơn) mới bị từ chối.
	*/
	var SETTINGS_FORMAT = "telescope-psf-settings";
	var SettingsError = class extends Error {};
	var r6 = (v) => Number(v.toPrecision(6));
	function serializeSettings(state, savedAt = /* @__PURE__ */ new Date()) {
		const p = state.params;
		const doc = {
			format: SETTINGS_FORMAT,
			version: 1,
			savedAt: savedAt.toISOString(),
			mirror: {
				diameterM: r6(p.diameterM),
				wavelengthNm: r6(p.wavelengthNm),
				bandwidthNm: r6(p.bandwidthNm)
			},
			segmented: {
				enabled: p.segmented.enabled,
				rings: p.segmented.rings,
				gapRatio: r6(p.segmented.gapRatio),
				removeCenter: p.segmented.removeCenter,
				pistonRms: r6(p.segmented.pistonRms),
				tiltRms: r6(p.segmented.tiltRms),
				seed: p.segmented.seed
			},
			vanes: {
				obstructionRatio: r6(p.obstructionRatio),
				count: p.vaneCount,
				thicknessRatio: r6(p.vaneThicknessRatio),
				rotationDeg: r6(p.vaneAngleDeg),
				individualAngles: state.individualVanes,
				anglesDeg: state.vaneSlots.map(r6)
			},
			aberrations: Object.fromEntries(ZERNIKE_NAMES.map((n) => [n, r6(p.aberrations[n])])),
			display: {
				fovArcsec: r6(p.fovArcsec),
				dynamicRangeDecades: r6(p.dynamicRangeDecades),
				colormap: p.colormap,
				markFirstDarkRing: state.showRing
			}
		};
		return JSON.stringify(doc, null, 2) + "\n";
	}
	var isRec = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
	function parseSettings(text) {
		if (text.length > 2e5) throw new SettingsError("The file is too large to be a settings file.");
		let doc;
		try {
			doc = JSON.parse(text);
		} catch {
			throw new SettingsError("The file is not valid JSON.");
		}
		if (!isRec(doc) || doc.format !== "telescope-psf-settings") throw new SettingsError("This is not a telescope PSF settings file.");
		if (typeof doc.version !== "number" || !Number.isFinite(doc.version) || doc.version < 1) throw new SettingsError("The settings file has no valid version number.");
		if (doc.version > 1) throw new SettingsError(`The file was saved by a newer version of this page (version ${doc.version}).`);
		const notes = [];
		const section = (key) => {
			const v = doc[key];
			if (v === void 0) return {};
			if (!isRec(v)) {
				notes.push(`"${key}" was ignored because it is not an object.`);
				return {};
			}
			return v;
		};
		const num = (rec, key, id, label, integer = false) => {
			const spec = specById(id);
			if (!spec) throw new Error(`Unknown control ${id}`);
			const raw = rec[key];
			if (raw === void 0) return spec.value;
			if (typeof raw !== "number" || !Number.isFinite(raw)) {
				notes.push(`${label}: not a number, using ${spec.format(spec.value)}.`);
				return spec.value;
			}
			const v = integer ? Math.round(raw) : raw;
			const clamped = Math.min(spec.max, Math.max(spec.min, v));
			if (clamped !== v) notes.push(`${label}: ${spec.format(v)} is outside the allowed range, using ${spec.format(clamped)}.`);
			return clamped;
		};
		const bool = (rec, key, fallback, label) => {
			const raw = rec[key];
			if (raw === void 0) return fallback;
			if (typeof raw !== "boolean") {
				notes.push(`${label}: not true or false, using ${fallback ? "true" : "false"}.`);
				return fallback;
			}
			return raw;
		};
		const mirror = section("mirror");
		const seg = section("segmented");
		const vanes = section("vanes");
		const aberr = section("aberrations");
		const display = section("display");
		const aberrations = {};
		for (const name of ZERNIKE_NAMES) aberrations[name] = num(aberr, name, ZERNIKE_IDS[name], `Aberration ${name}`);
		const count = num(vanes, "count", "nvane", "Number of vanes", true);
		const individual = bool(vanes, "individualAngles", false, "Individual vane angles");
		const rawAngles = vanes.anglesDeg;
		if (rawAngles !== void 0 && !Array.isArray(rawAngles)) notes.push("Vane angles were ignored because they are not a list.");
		const slots = VANE_IDS.map((id, i) => {
			const fallback = specById(id)?.value ?? i * 45;
			const v = Array.isArray(rawAngles) ? rawAngles[i] : void 0;
			if (v === void 0) return fallback;
			if (typeof v !== "number" || !Number.isFinite(v)) {
				notes.push(`Vane ${i + 1} angle: not a number, using ${fallback}°.`);
				return fallback;
			}
			return v >= 0 && v < 360 ? v : (v % 360 + 360) % 360;
		});
		if (Array.isArray(rawAngles) && rawAngles.length > 8) notes.push(`Only the first 8 vane angles are used.`);
		const colormapRaw = display.colormap;
		let colormap = "hot";
		if (colormapRaw !== void 0) {
			if (typeof colormapRaw === "string" && colormapRaw in COLORMAP_LABELS) colormap = colormapRaw;
			else notes.push("Color map: unknown name, using \"hot\".");
		}
		const seedRaw = seg.seed;
		let seed = 1;
		if (seedRaw !== void 0) {
			if (typeof seedRaw === "number" && Number.isFinite(seedRaw)) seed = Math.min(1e9, Math.max(1, Math.trunc(seedRaw)));
			else notes.push("Random seed: not a number, using 1.");
		}
		return {
			state: {
				params: {
					diameterM: num(mirror, "diameterM", "D", "Mirror diameter"),
					wavelengthNm: num(mirror, "wavelengthNm", "lam", "Wavelength"),
					bandwidthNm: num(mirror, "bandwidthNm", "band", "Bandwidth"),
					obstructionRatio: num(vanes, "obstructionRatio", "eps", "Central obstruction"),
					vaneCount: count,
					vaneThicknessRatio: num(vanes, "thicknessRatio", "tvane", "Vane thickness"),
					vaneAngleDeg: num(vanes, "rotationDeg", "avane", "Vane rotation"),
					vaneAnglesDeg: individual ? slots.slice(0, count) : null,
					aberrations,
					segmented: {
						enabled: bool(seg, "enabled", false, "Segmented mirror"),
						rings: num(seg, "rings", "seg-rings", "Rings", true),
						gapRatio: num(seg, "gapRatio", "seg-gap", "Segment gap"),
						removeCenter: bool(seg, "removeCenter", true, "Remove center segment"),
						pistonRms: num(seg, "pistonRms", "seg-piston", "Piston error"),
						tiltRms: num(seg, "tiltRms", "seg-tilt", "Tip/tilt error"),
						seed
					},
					fovArcsec: num(display, "fovArcsec", "fov", "Field of view"),
					dynamicRangeDecades: num(display, "dynamicRangeDecades", "range", "Dynamic range"),
					colormap
				},
				vaneSlots: slots,
				individualVanes: individual,
				showRing: bool(display, "markFirstDarkRing", false, "Mark the first dark ring")
			},
			notes
		};
	}
	// src/site/zoom.ts
	/**
	* Zoom của ảnh PSF: đổi trường nhìn (giây cung) quanh ngôi sao ở tâm.
	*
	* Giới hạn tính theo λ/D của kính hiện tại: không thu hẹp quá ±1 λ/D (ảnh chỉ có 4 mẫu mỗi λ/D, hẹp hơn chỉ là nội suy)
	* và không nới quá vùng tính toán ±64 λ/D (ngoài đó ảnh bị tô đen). Hai giới hạn còn bị kẹp bởi khoảng của thanh trượt.
	*/
	var ZOOM_STEP = 1.5;
	/** Khoảng trường nhìn cho phép với λ/D = ldArcsec. */
	function zoomLimits(range, ldArcsec) {
		const hi = Math.min(range.max, 128 * ldArcsec);
		return {
			lo: Math.min(hi, Math.max(range.min, 2 * ldArcsec)),
			hi
		};
	}
	var clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
	/** Nhân trường nhìn với `factor` (nhỏ hơn 1 là phóng to), kẹp vào khoảng cho phép. */
	function zoomFov(fov, factor, ldArcsec, range) {
		const { lo, hi } = zoomLimits(range, ldArcsec);
		return clamp(fov * factor, lo, hi);
	}
	/** Trường nhìn vừa khít ±FIT_FIELD_LD/2 quanh ngôi sao, bất kể đường kính và bước sóng. */
	function fitFov(ldArcsec, range) {
		const { lo, hi } = zoomLimits(range, ldArcsec);
		return clamp(24 * ldArcsec, lo, hi);
	}
	/**
	* Hệ số nhân trường nhìn cho một sự kiện lăn chuột hoặc chụm hai ngón (Ctrl + lăn): lăn xuống hoặc chụm lại là thu nhỏ.
	* `deltaMode` là của WheelEvent (0 điểm ảnh, 1 dòng, 2 trang).
	*/
	function wheelFactor(deltaY, deltaMode = 0) {
		const pixels = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 100 : 1);
		return Math.exp(clamp(pixels, -300, 300) * .002);
	}
	// src/site/main.ts
	buildControls();
	var fovSpec = () => {
		const spec = specById("fov");
		if (!spec) throw new Error("Missing fov spec");
		return spec;
	};
	var readCells = {};
	{
		const dl = $("read");
		for (const [key, text, topic] of READ_ROWS) {
			const dt = document.createElement("dt");
			dt.dataset.tipKey = `read-${key}`;
			const b = document.createElement("button");
			b.type = "button";
			b.className = "term";
			b.dataset.topic = topic;
			b.textContent = text;
			b.setAttribute("aria-haspopup", "dialog");
			dt.appendChild(b);
			const dd = document.createElement("dd");
			dl.appendChild(dt);
			dl.appendChild(dd);
			readCells[key] = {
				dt,
				dd
			};
		}
	}
	var arcsec = (v) => `${v.toFixed(v < .1 ? 4 : 3)}″`;
	function setRow(key, text, visible = true) {
		const c = readCells[key];
		c.dd.textContent = text;
		c.dt.hidden = !visible;
		c.dd.hidden = !visible;
	}
	var last = null;
	var psfOff = document.createElement("canvas");
	var pupOff = document.createElement("canvas");
	function toCanvas(target, rgba, size) {
		target.width = size;
		target.height = size;
		const ctx = target.getContext("2d");
		if (!ctx) return;
		const img = ctx.createImageData(size, size);
		img.data.set(rgba);
		ctx.putImageData(img, 0, 0);
	}
	function render() {
		if (!last) return;
		const { frame, params } = last;
		drawPsf($("psf"), psfOff, {
			fovArcsec: params.fovArcsec,
			airyRadiusArcsec: frame.stats.airyRadiusArcsec,
			showRing: input("showring").checked,
			label: wavelengthText(params)
		});
		drawPupil($("pupil"), pupOff);
		drawProfile($("profile"), frame.profile, params.dynamicRangeDecades);
	}
	function present(frame, params) {
		last = {
			frame,
			params
		};
		toCanvas(psfOff, frame.rgba, Math.round(Math.sqrt(frame.rgba.length / 4)));
		toCanvas(pupOff, frame.pupilRgba, frame.pupilSize);
		render();
		const s = frame.stats;
		$("stats").innerHTML = `λ/D = <b>${arcsec(s.lambdaOverDArcsec)}</b> · first dark ring <b>${arcsec(s.airyRadiusArcsec)}</b> · field of view ±<b>${s.halfFovLD.toFixed(1)}</b> λ/D`;
		$("warn").classList.toggle("on", !s.fovCovered);
		$("pb-min").textContent = `−${frame.pupilRangeWaves} λ`;
		$("pb-max").textContent = `+${frame.pupilRangeWaves} λ`;
		$("pupil-stats").innerHTML = `Wavefront error <b>${s.wavefrontRmsWaves.toFixed(3)} λ</b> RMS · Strehl ratio <b>${s.strehl.toFixed(3)}</b>`;
		setRow("ld", arcsec(s.lambdaOverDArcsec));
		setRow("airy", arcsec(s.airyRadiusArcsec));
		setRow("area", `${(s.throughput * 100).toFixed(1)} %`);
		setRow("strehl", s.strehl.toFixed(3));
		setRow("rms", `${s.wavefrontRmsWaves.toFixed(3)} λ`);
		setRow("marechal", s.marechalStrehl.toFixed(3));
		setRow("peak", `${(s.relativePeak * 100).toFixed(1)} %`);
		setRow("segs", String(s.segmentCount), s.segmentCount > 0);
		setRow("samples", String(s.bandSamples), s.bandSamples > 1);
		setRow("time", `${frame.ms.toFixed(0)} ms`);
	}
	var worker = null;
	var busy = false;
	var inflight = null;
	var pending = null;
	var nextId = 0;
	function done(frame) {
		busy = false;
		if (inflight) present(frame, inflight);
		const next = pending;
		pending = null;
		if (next) send(next);
	}
	function computeHere(p) {
		setTimeout(() => {
			const t0 = performance.now();
			done({
				...computeFrame(p),
				ms: performance.now() - t0
			});
		}, 0);
	}
	function send(p) {
		busy = true;
		inflight = p;
		if (worker) {
			const request = {
				id: nextId++,
				params: p
			};
			worker.postMessage(request);
		} else computeHere(p);
	}
	function request(p) {
		if (busy) pending = p;
		else send(p);
	}
	try {
		worker = new Worker("psf-worker.js");
		worker.onmessage = (e) => done(e.data);
		worker.onerror = () => {
			worker = null;
			if (busy && inflight) computeHere(inflight);
		};
	} catch {
		worker = null;
	}
	var raf = 0;
	function schedule() {
		if (raf) return;
		raf = requestAnimationFrame(() => {
			raf = 0;
			request(readParams());
		});
	}
	function onInput() {
		syncOutputs();
		syncVanes();
		schedule();
	}
	$("controls").addEventListener("input", onInput);
	$("controls").addEventListener("change", onInput);
	$("controls").addEventListener("reset", () => {
		setSeed(1);
		resetDisplayControls();
		setTimeout(() => {
			syncSeg();
			onInput();
		}, 0);
	});
	$("cmap").addEventListener("change", onInput);
	$("showring").addEventListener("change", render);
	input("seg-on").addEventListener("change", syncSeg);
	input("vane-each").addEventListener("change", () => {
		if (input("vane-each").checked) initVaneAngles();
	});
	$("seg-draw").addEventListener("click", () => {
		setSeed(getSeed() + 1);
		onInput();
	});
	$("clear-zern").addEventListener("click", () => {
		for (const name of ZERNIKE_NAMES) setValue(ZERNIKE_IDS[name], 0);
		onInput();
	});
	wirePresets(onInput);
	function zoomBy(factor) {
		const p = readParams();
		const ld = lambdaOverDArcsec(p.diameterM, p.wavelengthNm);
		setValue("fov", zoomFov(p.fovArcsec, factor, ld, fovSpec()));
		onInput();
	}
	$("zoom-in").addEventListener("click", () => zoomBy(1 / ZOOM_STEP));
	$("zoom-out").addEventListener("click", () => zoomBy(ZOOM_STEP));
	$("zoom-reset").addEventListener("click", () => {
		const p = readParams();
		setValue("fov", fitFov(lambdaOverDArcsec(p.diameterM, p.wavelengthNm), fovSpec()));
		onInput();
	});
	$("psf").addEventListener("wheel", (e) => {
		if (!e.ctrlKey && !e.metaKey) return;
		e.preventDefault();
		zoomBy(wheelFactor(e.deltaY, e.deltaMode));
	}, { passive: false });
	function withFrame(action) {
		if (last) action(last.frame, last.params);
	}
	$("save-psf").addEventListener("click", () => withFrame((f, p) => savePsfImage(f, p, psfOff, input("showring").checked)));
	$("save-pupil").addEventListener("click", () => withFrame((f, p) => saveAperture(f, p, pupOff)));
	$("save-profile").addEventListener("click", () => withFrame((f, p) => saveProfileImage(f, p)));
	var settingsNote = $("settings-note");
	function say(text, bad = false) {
		settingsNote.textContent = text;
		settingsNote.classList.toggle("bad", bad);
	}
	$("save-settings").addEventListener("click", () => {
		downloadText(serializeSettings(readUiState(), /* @__PURE__ */ new Date()), SETTINGS_FILE_NAME);
		say("Settings saved.");
	});
	$("load-settings").addEventListener("click", () => $("settings-file").click());
	$("settings-file").addEventListener("change", async () => {
		const file = input("settings-file").files?.[0];
		input("settings-file").value = "";
		if (!file) return;
		try {
			if (file.size > 2e5) throw new SettingsError("The file is too large to be a settings file.");
			const { state, notes } = parseSettings(await file.text());
			applyUiState(state);
			onInput();
			say(notes.length ? `Settings loaded. ${notes.join(" ")}` : "Settings loaded.");
		} catch (err) {
			say(err instanceof SettingsError ? err.message : "The file could not be read.", true);
		}
	});
	if (typeof ResizeObserver !== "undefined") {
		const ro = new ResizeObserver(render);
		for (const id of [
			"psf",
			"pupil",
			"profile"
		]) ro.observe($(id));
	} else window.addEventListener("resize", render);
	syncSeg();
	syncOutputs();
	syncVanes();
	schedule();
})();
