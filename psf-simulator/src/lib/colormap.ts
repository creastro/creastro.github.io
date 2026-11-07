/** Thang màu cho PSF: bảng tra 256 mức RGB nội suy tuyến tính giữa các điểm dừng. */

/**
 * Thang màu dựng từ bảng tra, và 'spectrum': tô màu theo bước sóng của từng kênh.
 * 'spectrum' chỉ minh hoạ sắc độ (không mô hình hoá phổ nguồn hay đáp ứng của mắt), nên không cho màu trắng đúng.
 */
export type MapName = 'gray' | 'hot' | 'inferno' | 'viridis' | 'ice'
export type ColormapName = MapName | 'spectrum'

type Stop = readonly [position: number, r: number, g: number, b: number]

/** Dựng các điểm dừng cách đều từ danh sách màu hex (từ tối đến sáng). */
function evenStops(hex: readonly string[]): Stop[] {
  return hex.map((h, i) => [
    i / (hex.length - 1),
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ])
}

const STOPS: Record<MapName, readonly Stop[]> = {
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
  // Mẫu 10 điểm của matplotlib inferno và viridis (xấp xỉ đủ cho hiển thị).
  inferno: evenStops([
    '#000004', '#1b0c42', '#4a0c6b', '#781c6d', '#a52c60',
    '#cf4446', '#ed6925', '#fb9b06', '#f7d13d', '#fcffa4',
  ]),
  viridis: evenStops([
    '#440154', '#482878', '#3e4989', '#31688e', '#26828e',
    '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725',
  ]),
  ice: [
    [0, 0, 0, 0],
    [0.4, 10, 40, 160],
    [0.75, 60, 200, 255],
    [1, 255, 255, 255],
  ],
}

export const COLORMAP_LABELS: Record<ColormapName, string> = {
  gray: 'Gray',
  hot: 'Hot (black–red–yellow–white)',
  inferno: 'Inferno (false color)',
  viridis: 'Viridis (false color)',
  ice: 'Ice (black–blue–cyan–white)',
  spectrum: 'Wavelength color (illustrative)',
}

const cache = new Map<MapName, Uint8ClampedArray>()

/** Trả về bảng 256 × 3 byte (R, G, B liên tiếp). */
export function getLut(name: MapName): Uint8ClampedArray {
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
