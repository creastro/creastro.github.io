import { useEffect, useRef } from 'react'

/** Vẽ ảnh RGBA size × size lên canvas mỗi khi dữ liệu thay đổi; trả ref để gắn vào <canvas>. */
export function useImageData(rgba: Uint8ClampedArray | null, size: number) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx || !rgba) return
    ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), size, size), 0, 0)
  }, [rgba, size])
  return ref
}
