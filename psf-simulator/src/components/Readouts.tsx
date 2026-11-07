import type { FrameStats } from '../lib/frame'
import { READOUT_HELP, type ReadoutKey } from '../help'
import { Tip } from './Tip'

const arcsec = (v: number) => `${v.toFixed(v < 0.1 ? 4 : 3)}″`

export function Readouts({ stats, ms }: { stats: FrameStats | null; ms: number | null }) {
  if (!stats) return null
  const rows: [ReadoutKey, string, string][] = [
    ['lambdaOverD', 'λ/D', arcsec(stats.lambdaOverDArcsec)],
    ['airyRadius', 'Airy radius (1.22 λ/D)', arcsec(stats.airyRadiusArcsec)],
    ['throughput', 'Light-collecting area', `${(stats.throughput * 100).toFixed(1)}%`],
    ['strehl', 'Strehl ratio', stats.strehl.toFixed(3)],
    ['wavefrontRms', 'Wavefront error (RMS)', `${stats.wavefrontRmsWaves.toFixed(3)} λ`],
    ['marechal', 'Strehl from Maréchal', stats.marechalStrehl.toFixed(3)],
    ['relativePeak', 'Peak vs. clear circle', `${(stats.relativePeak * 100).toFixed(1)}%`],
  ]
  if (stats.segmentCount > 0) rows.push(['segments', 'Mirror segments', String(stats.segmentCount)])
  if (stats.bandSamples > 1) rows.push(['bandSamples', 'Wavelength samples', String(stats.bandSamples)])
  if (ms !== null) rows.push(['computeTime', 'Compute time', `${ms.toFixed(0)} ms`])

  return (
    <dl className="space-y-0.5 text-sm" aria-live="polite">
      {rows.map(([key, label, value]) => (
        <Tip
          key={key}
          help={READOUT_HELP[key]}
          className="flex justify-between gap-4 rounded px-1 py-0.5 hover:bg-slate-900"
        >
          <dt className={key === 'computeTime' ? 'text-slate-500' : 'text-slate-400'}>{label}</dt>
          <dd className={`text-right font-mono tabular-nums ${key === 'computeTime' ? 'text-slate-500' : 'text-slate-100'}`}>
            {value}
          </dd>
        </Tip>
      ))}
    </dl>
  )
}
