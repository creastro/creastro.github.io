import { useEffect, useRef, useState } from 'react'
import type { SimParams } from './lib/frame'
import type { WorkerRequest, WorkerResponse } from './workers/psf.worker'

/**
 * Gửi tham số cho worker và trả khung mới nhất.
 * Mỗi lúc chỉ có một yêu cầu đang tính; tham số đến trong lúc đó chỉ giữ bản mới nhất (gộp lại),
 * nên kéo thanh trượt nhanh không làm hàng đợi dài ra.
 */
export function usePsfFrame(params: SimParams): WorkerResponse | null {
  const [frame, setFrame] = useState<WorkerResponse | null>(null)
  const worker = useRef<Worker | null>(null)
  const busy = useRef(false)
  const pending = useRef<SimParams | null>(null)
  const nextId = useRef(0)
  const sendRef = useRef<((p: SimParams) => void) | null>(null)

  useEffect(() => {
    const w = new Worker(new URL('./workers/psf.worker.ts', import.meta.url), { type: 'module' })
    const send = (p: SimParams) => {
      busy.current = true
      const request: WorkerRequest = { id: nextId.current++, params: p }
      w.postMessage(request)
    }
    w.onmessage = (event: MessageEvent<WorkerResponse>) => {
      setFrame(event.data)
      busy.current = false
      const next = pending.current
      pending.current = null
      if (next) send(next)
    }
    worker.current = w
    // Đưa hàm gửi vào ref để effect theo dõi tham số dùng chung.
    sendRef.current = send
    return () => {
      w.terminate()
      worker.current = null
      busy.current = false
      pending.current = null
      sendRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!sendRef.current) return
    if (busy.current) pending.current = params
    else sendRef.current(params)
  }, [params])

  return frame
}
