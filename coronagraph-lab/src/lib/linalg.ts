/** Dense linear algebra for the small systems of wavefront control (a few hundred unknowns). */

/** Solve the symmetric positive-definite system A x = b (A is m×m and is not modified). */
export function choleskySolve(A: Float64Array, b: Float64Array, m: number): Float64Array {
  return choleskyBack(choleskyFactor(A, m), b, m)
}

/**
 * Regularised least squares (Tikhonov): x = (GᵀG + α·s·I)⁻¹ Gᵀ b, where G is rows×cols (row-major) and
 * s is the largest diagonal element of GᵀG, so that α is a relative regularisation.
 */
export function tikhonovSolve(G: Float64Array, rows: number, cols: number, b: Float64Array, alpha: number): Float64Array {
  return tikhonovMatrix(G, rows, cols, alpha).apply(b)
}

export interface Reconstructor {
  readonly rows: number
  readonly cols: number
  /** cols×rows matrix R = (GᵀG + α s I)⁻¹ Gᵀ. */
  readonly R: Float64Array
  apply(b: ArrayLike<number>): Float64Array
}

/** Precompute R = (GᵀG + α s I)⁻¹ Gᵀ so that each loop iteration is a matrix-vector product. */
export function tikhonovMatrix(G: Float64Array, rows: number, cols: number, alpha: number): Reconstructor {
  const GtG = new Float64Array(cols * cols)
  for (let r = 0; r < rows; r++) {
    const o = r * cols
    for (let a = 0; a < cols; a++) {
      const ga = G[o + a]
      if (ga === 0) continue
      for (let c = a; c < cols; c++) GtG[a * cols + c] += ga * G[o + c]
    }
  }
  let s = 0
  for (let a = 0; a < cols; a++) s = Math.max(s, GtG[a * cols + a])
  for (let a = 0; a < cols; a++) {
    for (let c = 0; c < a; c++) GtG[a * cols + c] = GtG[c * cols + a]
    GtG[a * cols + a] += alpha * s + 1e-30
  }
  const L = choleskyFactor(GtG, cols)
  // R = (GᵀG + αsI)⁻¹ Gᵀ, column by column of Gᵀ (= row of G).
  const R = new Float64Array(cols * rows)
  const col = new Float64Array(cols)
  for (let r = 0; r < rows; r++) {
    for (let a = 0; a < cols; a++) col[a] = G[r * cols + a]
    const x = choleskyBack(L, col, cols)
    for (let a = 0; a < cols; a++) R[a * rows + r] = x[a]
  }
  return {
    rows, cols, R,
    apply(b) {
      const out = new Float64Array(cols)
      for (let a = 0; a < cols; a++) {
        let t = 0
        const o = a * rows
        for (let r = 0; r < rows; r++) t += R[o + r] * b[r]
        out[a] = t
      }
      return out
    },
  }
}

function choleskyFactor(A0: Float64Array, m: number): Float64Array {
  const A = A0.slice()
  for (let j = 0; j < m; j++) {
    let d = A[j * m + j]
    for (let k = 0; k < j; k++) d -= A[j * m + k] * A[j * m + k]
    if (d <= 0) throw new Error('Matrix is not positive definite')
    const ljj = Math.sqrt(d)
    A[j * m + j] = ljj
    for (let i = j + 1; i < m; i++) {
      let t = A[i * m + j]
      for (let k = 0; k < j; k++) t -= A[i * m + k] * A[j * m + k]
      A[i * m + j] = t / ljj
    }
  }
  return A
}

function choleskyBack(L: Float64Array, b: Float64Array, m: number): Float64Array {
  const y = new Float64Array(m)
  for (let i = 0; i < m; i++) {
    let s = b[i]
    for (let k = 0; k < i; k++) s -= L[i * m + k] * y[k]
    y[i] = s / L[i * m + i]
  }
  const x = new Float64Array(m)
  for (let i = m - 1; i >= 0; i--) {
    let s = y[i]
    for (let k = i + 1; k < m; k++) s -= L[k * m + i] * x[k]
    x[i] = s / L[i * m + i]
  }
  return x
}

/** Eigen-decomposition of a small symmetric matrix by cyclic Jacobi rotations. Returns ascending eigenvalues. */
export function symmetricEigen(A0: Float64Array, m: number): { values: Float64Array; vectors: Float64Array } {
  const A = A0.slice()
  const V = new Float64Array(m * m)
  for (let i = 0; i < m; i++) V[i * m + i] = 1
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0
    for (let p = 0; p < m; p++) for (let q = p + 1; q < m; q++) off += A[p * m + q] ** 2
    if (off < 1e-30) break
    for (let p = 0; p < m; p++) {
      for (let q = p + 1; q < m; q++) {
        const apq = A[p * m + q]
        if (Math.abs(apq) < 1e-300) continue
        const theta = (A[q * m + q] - A[p * m + p]) / (2 * apq)
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1), s = t * c
        for (let k = 0; k < m; k++) {
          const akp = A[k * m + p], akq = A[k * m + q]
          A[k * m + p] = c * akp - s * akq
          A[k * m + q] = s * akp + c * akq
        }
        for (let k = 0; k < m; k++) {
          const apk = A[p * m + k], aqk = A[q * m + k]
          A[p * m + k] = c * apk - s * aqk
          A[q * m + k] = s * apk + c * aqk
        }
        for (let k = 0; k < m; k++) {
          const vkp = V[k * m + p], vkq = V[k * m + q]
          V[k * m + p] = c * vkp - s * vkq
          V[k * m + q] = s * vkp + c * vkq
        }
      }
    }
  }
  const idx = Array.from({ length: m }, (_, i) => i).sort((a, b) => A[a * m + a] - A[b * m + b])
  const values = new Float64Array(m), vectors = new Float64Array(m * m)
  idx.forEach((j, c) => { values[c] = A[j * m + j]; for (let k = 0; k < m; k++) vectors[k * m + c] = V[k * m + j] })
  return { values, vectors }
}

/**
 * Largest eigenpair of a symmetric linear operator by the Lanczos method with full re-orthogonalisation.
 * Converges in far fewer operator applications than the power method when the top eigenvalues are close.
 */
export function lanczosTop(apply: (v: Float64Array) => Float64Array, start: Float64Array, steps: number): { value: number; vector: Float64Array } {
  const dim = start.length
  const Q: Float64Array[] = []
  const alpha: number[] = [], beta: number[] = []
  let q = start.slice()
  let nrm = Math.sqrt(q.reduce((s, v) => s + v * v, 0))
  for (let i = 0; i < dim; i++) q[i] /= nrm
  for (let j = 0; j < steps; j++) {
    Q.push(q)
    const w = apply(q)
    let a = 0
    for (let i = 0; i < dim; i++) a += w[i] * q[i]
    alpha.push(a)
    for (const qq of Q) {
      let d = 0
      for (let i = 0; i < dim; i++) d += w[i] * qq[i]
      for (let i = 0; i < dim; i++) w[i] -= d * qq[i]
    }
    nrm = Math.sqrt(w.reduce((s, v) => s + v * v, 0))
    if (nrm < 1e-14 || j === steps - 1) break
    beta.push(nrm)
    q = w.map((v) => v / nrm)
  }
  const m = alpha.length
  const T = new Float64Array(m * m)
  for (let i = 0; i < m; i++) { T[i * m + i] = alpha[i]; if (i + 1 < m) { T[i * m + i + 1] = beta[i]; T[(i + 1) * m + i] = beta[i] } }
  const { values, vectors } = symmetricEigen(T, m)
  const vec = new Float64Array(dim)
  for (let k = 0; k < m; k++) {
    const c = vectors[k * m + (m - 1)]
    for (let i = 0; i < dim; i++) vec[i] += c * Q[k][i]
  }
  return { value: values[m - 1], vector: vec }
}
