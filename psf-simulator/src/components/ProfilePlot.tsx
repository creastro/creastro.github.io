import { READOUT_HELP } from '../help'
import type { RadialProfile } from '../lib/profile'
import { Tip } from './Tip'

interface ProfilePlotProps {
  profile: RadialProfile | null
  dynamicRangeDecades: number
}

const W = 520
const H = 240
const M = { left: 46, right: 12, top: 12, bottom: 34 }
const FLOOR = 1e-12

/** Bước chia "tròn" (1, 2, 5 × 10^k) cho trục x sao cho có khoảng 4–6 vạch. */
function niceStep(range: number): number {
  const raw = range / 5
  const exp = Math.floor(Math.log10(raw))
  const base = 10 ** exp
  for (const m of [1, 2, 5, 10]) if (m * base >= raw) return m * base
  return 10 * base
}

function formatTick(v: number): string {
  return Number(v.toPrecision(3)).toString()
}

export function ProfilePlot({ profile, dynamicRangeDecades: R }: ProfilePlotProps) {
  if (!profile) return null
  const maxTheta = profile.thetaArcsec[profile.thetaArcsec.length - 1]
  const x = (t: number) => M.left + (t / maxTheta) * (W - M.left - M.right)
  const y = (v: number) => {
    const l = Math.max(-R, Math.min(0, Math.log10(Math.max(v, FLOOR))))
    return M.top + (-l / R) * (H - M.top - M.bottom)
  }
  const path = (values: number[]) =>
    values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(profile.thetaArcsec[i]).toFixed(1)},${y(v).toFixed(1)}`).join(' ')

  const step = niceStep(maxTheta)
  const xTicks: number[] = []
  for (let t = 0; t <= maxTheta + 1e-9; t += step) xTicks.push(t)
  const yTicks: number[] = []
  for (let d = 0; d <= Math.floor(R); d++) yTicks.push(-d)

  return (
    <Tip help={READOUT_HELP.profilePlot}>
    <figure className="space-y-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Radial profile of the point spread function on a log scale, compared with the ideal Airy pattern"
        className="w-full rounded-lg bg-slate-900/60 ring-1 ring-slate-800"
      >
        {yTicks.map((d) => (
          <g key={`y${d}`}>
            <line x1={M.left} x2={W - M.right} y1={y(10 ** d)} y2={y(10 ** d)} stroke="#334155" strokeWidth={0.5} />
            <text x={M.left - 6} y={y(10 ** d) + 3} textAnchor="end" fontSize={10} fill="#94a3b8">
              {d === 0 ? '1' : `1e${d}`}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <g key={`x${t}`}>
            <line x1={x(t)} x2={x(t)} y1={M.top} y2={H - M.bottom} stroke="#334155" strokeWidth={0.5} />
            <text x={x(t)} y={H - M.bottom + 14} textAnchor="middle" fontSize={10} fill="#94a3b8">
              {formatTick(t)}
            </text>
          </g>
        ))}
        <text x={(M.left + W - M.right) / 2} y={H - 4} textAnchor="middle" fontSize={11} fill="#cbd5e1">
          Angular distance from center (arcsec)
        </text>
        <path d={path(profile.airy)} fill="none" stroke="#94a3b8" strokeWidth={1.2} strokeDasharray="4 3" />
        <path d={path(profile.intensity)} fill="none" stroke="#fbbf24" strokeWidth={1.8} />
      </svg>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
        <span>
          <span className="mr-1 inline-block h-0.5 w-5 bg-amber-400 align-middle" />
          Simulation (averaged around the star)
        </span>
        <span>
          <span className="mr-1 inline-block h-0.5 w-5 border-t border-dashed border-slate-400 align-middle" />
          Ideal Airy pattern, same D and band
        </span>
      </figcaption>
    </figure>
    </Tip>
  )
}
