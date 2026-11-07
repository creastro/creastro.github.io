import type { FrameStats } from '../lib/frame'

const arcsec = (v: number) => `${v.toFixed(v < 0.1 ? 4 : 3)}″`

export function Readouts({ stats, ms }: { stats: FrameStats | null; ms: number | null }) {
  if (!stats) return null
  const rows: [string, string][] = [
    ['λ/D', arcsec(stats.lambdaOverDArcsec)],
    ['Bán kính Airy (1,22 λ/D)', arcsec(stats.airyRadiusArcsec)],
    ['Diện tích thu sáng', `${(stats.throughput * 100).toFixed(1)}%`],
    ['Tỉ số Strehl', stats.strehl.toFixed(3)],
    ['Mặt sóng RMS', `${stats.wavefrontRmsWaves.toFixed(3)} λ`],
    ['Strehl theo Maréchal', stats.marechalStrehl.toFixed(3)],
    ['Đỉnh so với gương không che', `${(stats.relativePeak * 100).toFixed(1)}%`],
  ]
  if (stats.bandSamples > 1) rows.push(['Số mẫu bước sóng', String(stats.bandSamples)])
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm" aria-live="polite">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-slate-400">{k}</dt>
          <dd className="text-right font-mono tabular-nums text-slate-100">{v}</dd>
        </div>
      ))}
      {ms !== null ? (
        <div className="contents">
          <dt className="text-slate-500">Thời gian tính</dt>
          <dd className="text-right font-mono tabular-nums text-slate-500">{ms.toFixed(0)} ms</dd>
        </div>
      ) : null}
    </dl>
  )
}
