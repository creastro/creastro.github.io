import type { SimParams } from './frame'

/**
 * Cấu hình gương phân đoạn có sẵn. Ngoài hình học, mỗi cấu hình đặt đường kính và trường nhìn để mẫu nhiễu xạ vừa khung
 * (trường nhìn phải ≤ ±64 λ/D), và tắt vật cản cùng thanh chống để thấy cấu trúc riêng của gương.
 * Số phân đoạn, vòng và kích thước là của kính thật; khe là giá trị gần đúng.
 */
export interface SegmentPreset {
  label: string
  patch: Pick<SimParams, 'diameterM' | 'fovArcsec' | 'obstructionRatio' | 'vaneCount'> & {
    segmented: { rings: number; gapRatio: number; removeCenter: boolean }
  }
}

export type SegmentPresetKey = 'jwst' | 'keck' | 'rings5'

export const SEGMENT_PRESETS: Record<SegmentPresetKey, SegmentPreset> = {
  jwst: {
    label: 'JWST-like (18)',
    patch: { diameterM: 6.5, fovArcsec: 1, obstructionRatio: 0, vaneCount: 0, segmented: { rings: 2, gapRatio: 0.005, removeCenter: true } },
  },
  keck: {
    label: 'Keck-like (36)',
    patch: { diameterM: 10, fovArcsec: 0.8, obstructionRatio: 0, vaneCount: 0, segmented: { rings: 3, gapRatio: 0.002, removeCenter: true } },
  },
  rings5: {
    label: '91 segments',
    patch: { diameterM: 30, fovArcsec: 0.3, obstructionRatio: 0, vaneCount: 0, segmented: { rings: 5, gapRatio: 0.005, removeCenter: false } },
  },
}
