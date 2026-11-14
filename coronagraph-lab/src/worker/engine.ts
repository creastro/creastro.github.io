/**
 * The physics engine behind the page: answers frame, throughput and loop requests. Used inside the Web Worker,
 * or on the main thread when workers are unavailable (page opened from a file).
 */
import { type LabConfig, sccCompatible } from '../lib/config.ts'
import { Memo, computeFrame, opticsFor } from '../lib/frame.ts'
import { LoopState } from '../lib/loop.ts'
import { designIwa, innerWorkingAngle, throughputCurve } from '../lib/metrics.ts'
import { computeWfs, isPupilWfs } from '../lib/wfsView.ts'
import type { Reply, Request } from './protocol.ts'

const SEPS = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 10, 12]

export function createEngine(post: (r: Reply) => void): (req: Request) => void {
  const memo = new Memo(24)
  let loop = new LoopState(256)
  let nAct = 256
  let generation = 0
  let running = false
  let latest: LabConfig | null = null
  const tick = () => new Promise<void>((r) => setTimeout(r, 0))

  const ensureDm = (c: LabConfig) => {
    const k = c.dm.nact * c.dm.nact
    if (k !== nAct) { nAct = k; loop = new LoopState(k) }
  }

  async function frame(id: number, c: LabConfig) {
    const gen = ++generation
    ensureDm(c)
    post({ type: 'frame', id, data: computeFrame(c, loop.cmd, memo) })
    await tick()
    if (gen !== generation) return
    const pause = async () => { await tick(); return gen === generation }
    let reason = ''
    if (c.wfs.kind === 'scc' && !sccCompatible(c.coronagraph)) reason = 'The self-coherent camera needs a focal-plane mask and a Lyot stop (Lyot, APLC, Roddier, FQPM or vortex).'
    const data = reason ? null : await computeWfs(c, loop.cmd, memo, (f) => post({ type: 'progress', what: 'Computing the Jacobian', fraction: f }), pause)
    if (gen !== generation) return
    post({ type: 'progress', what: '', fraction: 1 })
    post({ type: 'wfs', id, data, reason })
  }

  async function runLoop(c: LabConfig, iterations: number) {
    ensureDm(c)
    running = true
    latest = c
    const gen = generation
    for (let i = 0; i < iterations && running; i++) {
      const cfg = latest ?? c
      const ok = await loop.step(cfg, memo, (f) => post({ type: 'progress', what: 'Computing the Jacobian', fraction: f }), async () => { await tick(); return running })
      post({ type: 'progress', what: '', fraction: 1 })
      if (!ok) {
        const why = cfg.control.kind === 'ao' && !isPupilWfs(cfg.wfs.kind) && cfg.wfs.kind !== 'phase-diversity'
          ? 'AO-style modal control needs a pupil-plane sensor or phase diversity.' : running ? 'This loop cannot run with the current settings.' : 'Stopped.'
        running = false
        post({ type: 'loop', history: loop.history, running: false, message: why })
        return
      }
      post({ type: 'loop', history: loop.history, running: true, message: `Iteration ${loop.history.length - 1}` })
      void gen
      await frame(-1, cfg)
    }
    running = false
    post({ type: 'loop', history: loop.history, running: false, message: `Done: ${loop.history.length - 1} iterations.` })
  }

  return (req: Request) => {
    try {
      if (req.type === 'frame') { latest = req.config; void frame(req.id, req.config) }
      else if (req.type === 'throughput') {
        const o = opticsFor(req.config, memo)
        const curve = throughputCurve(o, SEPS.filter((s) => s <= req.config.fov))
        post({ type: 'throughput', id: req.id, curve, iwa: innerWorkingAngle(curve), designIwa: designIwa(o.cor.spec) })
      } else if (req.action === 'stop') running = false
      else if (req.action === 'reset') {
        running = false
        ensureDm(req.config)
        loop.reset(nAct)
        post({ type: 'loop', history: [], running: false, message: 'Deformable mirror flattened.' })
        void frame(-1, req.config)
      } else if (!running) void runLoop(req.config, req.iterations)
    } catch (e) {
      post({ type: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }
}
