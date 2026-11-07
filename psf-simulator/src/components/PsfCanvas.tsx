import { IMAGE_SIZE } from '../lib/frame'
import { useImageData } from './useImageData'

interface PsfCanvasProps {
  rgba: Uint8ClampedArray | null
  fovArcsec: number
}

/** Độ dài thanh tỉ lệ "tròn" (giây cung) gần 22% bề rộng trường nhìn nhất, không vượt quá 30%. */
function niceScaleBar(fovArcsec: number): number {
  const target = fovArcsec * 0.22
  const exponent = Math.floor(Math.log10(target))
  const candidates = [1, 2, 5, 10].map((m) => m * 10 ** exponent)
  let best = candidates[0]
  for (const c of candidates) {
    if (c <= fovArcsec * 0.3 && Math.abs(c - target) < Math.abs(best - target)) best = c
  }
  return best
}

function formatArcsec(v: number): string {
  return `${Number(v.toPrecision(2))}″`
}

export function PsfCanvas({ rgba, fovArcsec }: PsfCanvasProps) {
  const ref = useImageData(rgba, IMAGE_SIZE)

  const bar = niceScaleBar(fovArcsec)

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[640px] overflow-hidden rounded-lg bg-black ring-1 ring-slate-700">
      <canvas
        ref={ref}
        width={IMAGE_SIZE}
        height={IMAGE_SIZE}
        role="img"
        aria-label="Ảnh PSF của kính thiên văn theo thang logarit"
        className="h-full w-full"
      />
      <div
        className="pointer-events-none absolute bottom-9 left-3 h-1 rounded-sm bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
        style={{ width: `${(bar / fovArcsec) * 100}%` }}
      />
      <div className="pointer-events-none absolute bottom-3 left-3 font-mono text-xs text-white [text-shadow:0_0_3px_#000]">
        {formatArcsec(bar)}
      </div>
    </div>
  )
}
