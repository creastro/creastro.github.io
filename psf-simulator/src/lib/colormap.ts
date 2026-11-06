/** Thang màu cho PSF: bảng tra 256 mức RGB nội suy tuyến tính giữa các điểm dừng. */

export type ColormapName = 'gray' | 'hot'

type Stop = readonly [position: number, r: number, g: number, b: number]

const STOPS: Record<ColormapName, readonly Stop[]> = {
  gray: [
    [0, 0, 0, 0],
    [1, 255, 255, 255],
  ],
  // Giống "hot" của matplotlib: đen → đỏ → vàng → trắng.
  hot: [
    [0, 0, 0, 0],
    [0.36, 255, 0, 0],
    [0.75, 255, 255, 0],
    [1, 255, 255, 255],
  ],
}

export const COLORMAP_LABELS: Record<ColormapName, string> = {
  gray: 'Thang xám',
  hot: 'Nóng (đen–đỏ–vàng–trắng)',
}

const cache = new Map<ColormapName, Uint8ClampedArray>()

/** Trả về bảng 256 × 3 byte (R, G, B liên tiếp). */
export function getLut(name: ColormapName): Uint8ClampedArray {
  const hit = cache.get(name)
  if (hit) return hit

  const stops = STOPS[name]
  const lut = new Uint8ClampedArray(256 * 3)
  for (let i = 0; i < 256; i++) {
    const t = i / 255
    let k = 0
    while (k < stops.length - 2 && t > stops[k + 1][0]) k++
    const [t0, r0, g0, b0] = stops[k]
    const [t1, r1, g1, b1] = stops[k + 1]
    const f = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)))
    lut[i * 3] = r0 + (r1 - r0) * f
    lut[i * 3 + 1] = g0 + (g1 - g0) * f
    lut[i * 3 + 2] = b0 + (b1 - b0) * f
  }
  cache.set(name, lut)
  return lut
}
