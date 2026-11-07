import { READOUT_HELP } from '../help'
import { Tip } from './Tip'
import { useImageData } from './useImageData'

interface PupilCanvasProps {
  rgba: Uint8ClampedArray | null
  size: number
  /** Thang màu bão hoà ở ±rangeWaves. */
  rangeWaves: number
}

/** Xem trước pupil: hình học khẩu độ và mặt sóng (xanh âm, đỏ dương, trắng bằng 0, thang ±1 bước sóng). */
export function PupilCanvas({ rgba, size, rangeWaves }: PupilCanvasProps) {
  const ref = useImageData(rgba, size)
  return (
    <Tip help={READOUT_HELP.pupilView} className="w-fit">
      <figure className="space-y-1">
        <canvas
          ref={ref}
          width={size}
          height={size}
          role="img"
          aria-label="Telescope aperture and wavefront error"
          className="h-36 w-36 rounded-md bg-black ring-1 ring-slate-700"
        />
        <figcaption className="text-center text-xs text-slate-400">Pupil, wavefront ±{rangeWaves} λ</figcaption>
      </figure>
    </Tip>
  )
}
