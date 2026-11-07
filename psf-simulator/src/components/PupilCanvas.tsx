import { useImageData } from './useImageData'

interface PupilCanvasProps {
  rgba: Uint8ClampedArray | null
  size: number
}

/** Xem trước pupil: hình học khẩu độ và mặt sóng (xanh âm, đỏ dương, trắng bằng 0, thang ±1 bước sóng). */
export function PupilCanvas({ rgba, size }: PupilCanvasProps) {
  const ref = useImageData(rgba, size)
  return (
    <figure className="space-y-1">
      <canvas
        ref={ref}
        width={size}
        height={size}
        role="img"
        aria-label="Hình khẩu độ và mặt sóng"
        className="h-36 w-36 rounded-md bg-black ring-1 ring-slate-700"
      />
      <figcaption className="text-center text-xs text-slate-400">Mặt sóng ±1 λ</figcaption>
    </figure>
  )
}
