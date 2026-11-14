/** Messages between the page and the physics worker. */
import type { LabConfig } from '../lib/config.ts'
import type { FrameData } from '../lib/frame.ts'
import type { LoopPoint } from '../lib/loop.ts'
import type { Curve } from '../lib/metrics.ts'
import type { WfsData } from '../lib/wfsView.ts'

export type Request =
  | { readonly type: 'frame'; readonly id: number; readonly config: LabConfig }
  | { readonly type: 'throughput'; readonly id: number; readonly config: LabConfig }
  | { readonly type: 'loop'; readonly action: 'run' | 'stop' | 'reset'; readonly config: LabConfig; readonly iterations: number }

export type Reply =
  | { readonly type: 'frame'; readonly id: number; readonly data: FrameData }
  | { readonly type: 'wfs'; readonly id: number; readonly data: WfsData | null; readonly reason: string }
  | { readonly type: 'throughput'; readonly id: number; readonly curve: Curve; readonly iwa: number; readonly designIwa: number }
  | { readonly type: 'progress'; readonly what: string; readonly fraction: number }
  | { readonly type: 'loop'; readonly history: readonly LoopPoint[]; readonly running: boolean; readonly message: string }
  | { readonly type: 'error'; readonly message: string }
