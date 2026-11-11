import { SEGMENT_PRESETS } from './segmentPresets'
import type { SimParams } from './frame'

/**
 * Cấu hình gần đúng của các kính thiên văn thật. Đường kính, số phân đoạn và tỉ lệ vật cản lấy từ thiết kế đã công bố,
 * làm tròn; độ dày thanh chống và khe giữa các phân đoạn là giá trị gần đúng. Góc thanh chống chỉ là một lựa chọn:
 * hướng cánh sao trên bầu trời của kính thật còn phụ thuộc vào góc quay của kính.
 *
 * Thanh chống JWST (3, một thanh dọc và hai thanh lệch 150° so với nó) và Keck (6, rộng 0.025 m) lấy từ nguồn thứ cấp,
 * chưa đối chiếu với tài liệu kỹ thuật; độ rộng thanh JWST là ước lượng.
 * Mô hình chỉ có gương lục giác, nên GMT (7 gương tròn) chưa có, và ELT (798 phân đoạn) chỉ được xấp xỉ bằng 8 vòng (217).
 * Trường nhìn được chọn sao cho ±64 λ/D chứa mẫu nhiễu xạ ở cả 380 nm và 550 nm.
 */
export interface TelescopePreset {
  label: string
  /** Mô tả ngắn hiển thị trong chú thích. */
  summary: string
  patch: Pick<SimParams, 'diameterM' | 'fovArcsec' | 'obstructionRatio' | 'vaneCount' | 'vaneThicknessRatio' | 'vaneAngleDeg'> & {
    /** Góc riêng của từng thanh chống (độ, từ trục +x, y hướng xuống); nếu có thì thay cho việc chia đều. */
    vaneAnglesDeg?: readonly number[]
    segmented: { enabled: boolean; rings: number; gapRatio: number; removeCenter: boolean }
  }
}

export type TelescopeKey = 'hubble' | 'vlt' | 'jwst' | 'keck' | 'elt'

const off = { enabled: false, rings: 2, gapRatio: 0.005, removeCenter: true } as const

export const TELESCOPE_PRESETS: Record<TelescopeKey, TelescopePreset> = {
  hubble: {
    label: 'Hubble',
    summary: 'D = 2.4 m, central obstruction about 0.33, four spider vanes.',
    patch: { diameterM: 2.4, fovArcsec: 2, obstructionRatio: 0.33, vaneCount: 4, vaneThicknessRatio: 0.0125, vaneAngleDeg: 45, segmented: off },
  },
  vlt: {
    label: 'VLT',
    summary: 'One 8.2 m Unit Telescope of the VLT: obstruction about 0.14, four thin vanes.',
    patch: { diameterM: 8.2, fovArcsec: 0.8, obstructionRatio: 0.14, vaneCount: 4, vaneThicknessRatio: 0.005, vaneAngleDeg: 0, segmented: off },
  },
  jwst: {
    label: 'JWST',
    summary: '18 hexagonal segments, D = 6.5 m, secondary obstruction about 0.11 and its three struts (one vertical, two at 150° from it).',
    patch: {
      ...SEGMENT_PRESETS.jwst.patch,
      obstructionRatio: 0.11,
      vaneCount: 3,
      vaneThicknessRatio: 0.015,
      vaneAngleDeg: 0,
      // Thanh dọc hướng lên (y xuống nên là 270°) và hai thanh còn lại lệch 150° so với nó.
      vaneAnglesDeg: [270, 60, 120],
      segmented: { enabled: true, ...SEGMENT_PRESETS.jwst.patch.segmented },
    },
  },
  keck: {
    label: 'Keck',
    summary: '36 hexagonal segments, D = 10 m, empty center and six thin spider arms (0.025 m wide).',
    patch: {
      ...SEGMENT_PRESETS.keck.patch,
      vaneCount: 6,
      vaneThicknessRatio: 0.0025,
      vaneAngleDeg: 0,
      segmented: { enabled: true, ...SEGMENT_PRESETS.keck.patch.segmented },
    },
  },
  elt: {
    label: 'ELT',
    summary: 'D = 39 m, obstruction about 0.11, six spider vanes, simplified to 217 segments (the real one has 798).',
    patch: { diameterM: 39, fovArcsec: 0.2, obstructionRatio: 0.11, vaneCount: 6, vaneThicknessRatio: 0.013, vaneAngleDeg: 0, segmented: { enabled: true, rings: 8, gapRatio: 0.003, removeCenter: false } },
  },
}
