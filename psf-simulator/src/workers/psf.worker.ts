/**
 * Worker tính khung PSF ngoài luồng giao diện, để kéo thanh trượt không bị giật.
 * Không dùng `lib: webworker` vì tsconfig của app đã có DOM; chỉ khai báo phần `self` cần dùng.
 */
import { computeFrame, type FrameResult, type SimParams } from '../lib/frame'

export interface WorkerRequest {
  id: number
  params: SimParams
}

export interface WorkerResponse extends FrameResult {
  id: number
  /** Thời gian tính, mili giây. */
  ms: number
}

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
  postMessage(message: WorkerResponse, transfer: ArrayBuffer[]): void
}

const scope = self as unknown as WorkerScope

scope.onmessage = (event) => {
  const { id, params } = event.data
  const start = performance.now()
  const frame = computeFrame(params)
  scope.postMessage({ id, ms: performance.now() - start, ...frame }, [frame.rgba.buffer as ArrayBuffer])
}
