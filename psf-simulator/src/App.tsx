import { useState } from 'react'
import { PsfCanvas } from './components/PsfCanvas'
import { Slider } from './components/Slider'
import { COLORMAP_LABELS, type ColormapName } from './lib/colormap'
import { DEFAULT_PARAMS, type FrameStats, type SimParams } from './lib/frame'
import { usePsfFrame } from './usePsfFrame'

const arcsec = (v: number) => `${v.toFixed(v < 0.1 ? 4 : 3)}″`

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <h2 className="text-xs font-semibold tracking-wider text-slate-400 uppercase">{title}</h2>
      {children}
    </section>
  )
}

function Readouts({ stats, ms }: { stats: FrameStats | null; ms: number | null }) {
  if (!stats) return null
  const rows: [string, string][] = [
    ['λ/D', arcsec(stats.lambdaOverDArcsec)],
    ['Bán kính Airy (1,22 λ/D)', arcsec(stats.airyRadiusArcsec)],
    ['Diện tích thu sáng', `${(stats.throughput * 100).toFixed(1)}%`],
    ['Đỉnh so với gương không che', `${(stats.relativePeak * 100).toFixed(1)}%`],
  ]
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

export default function App() {
  const [params, setParams] = useState<SimParams>(DEFAULT_PARAMS)
  const frame = usePsfFrame(params)
  const set = <K extends keyof SimParams>(key: K) => (value: SimParams[K]) =>
    setParams((p) => ({ ...p, [key]: value }))

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-4 py-4 sm:px-6">
        <h1 className="text-lg font-semibold">Mô phỏng PSF kính thiên văn</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          PSF là bình phương độ lớn của biến đổi Fourier 2D của hàm khẩu độ. Thay đổi gương, vật cản và thanh
          chống để xem các vòng Airy và cánh sao nhiễu xạ thay đổi theo thời gian thực.
        </p>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-3">
          <PsfCanvas rgba={frame?.rgba ?? null} fovArcsec={params.fovArcsec} />
          {frame && !frame.stats.fovCovered ? (
            <p role="status" className="rounded-md bg-amber-950/60 px-3 py-2 text-sm text-amber-200">
              Trường nhìn lớn hơn vùng tính toán (±64 λ/D). Phần ngoài được tô đen. Hãy giảm trường nhìn hoặc
              tăng bước sóng.
            </p>
          ) : null}
          <Readouts stats={frame?.stats ?? null} ms={frame?.ms ?? null} />
        </div>

        <div className="space-y-4">
          <Panel title="Gương chính">
            <Slider
              label="Đường kính D"
              value={params.diameterM}
              min={0.1}
              max={10}
              step={0.01}
              log
              format={(v) => `${v.toFixed(2)} m`}
              onChange={set('diameterM')}
              hint="Gương lớn hơn cho lõi sáng nhỏ hơn: độ phân giải tỉ lệ với λ/D."
            />
            <Slider
              label="Bước sóng λ"
              value={params.wavelengthNm}
              min={380}
              max={1000}
              step={5}
              format={(v) => `${v.toFixed(0)} nm`}
              onChange={set('wavelengthNm')}
            />
          </Panel>

          <Panel title="Vật cản và thanh chống">
            <Slider
              label="Vật cản trung tâm ε"
              value={params.obstructionRatio}
              min={0}
              max={0.7}
              step={0.01}
              format={(v) => `${(v * 100).toFixed(0)}% D`}
              onChange={set('obstructionRatio')}
              hint="Gương phụ chuyển năng lượng từ lõi sang các vòng Airy."
            />
            <Slider
              label="Số thanh chống"
              value={params.vaneCount}
              min={0}
              max={8}
              step={1}
              format={(v) => String(v)}
              onChange={set('vaneCount')}
              hint="Cánh sao vuông góc với thanh chống. Số lẻ cho nhiều cánh gấp đôi."
            />
            <Slider
              label="Độ dày thanh chống"
              value={params.vaneThicknessRatio}
              min={0.002}
              max={0.05}
              step={0.001}
              format={(v) => `${(v * 100).toFixed(1)}% D`}
              onChange={set('vaneThicknessRatio')}
            />
            <Slider
              label="Góc xoay thanh chống"
              value={params.vaneAngleDeg}
              min={0}
              max={180}
              step={1}
              format={(v) => `${v.toFixed(0)}°`}
              onChange={set('vaneAngleDeg')}
            />
          </Panel>

          <Panel title="Hiển thị">
            <Slider
              label="Trường nhìn"
              value={params.fovArcsec}
              min={0.2}
              max={30}
              step={0.1}
              log
              format={(v) => `${v.toFixed(v < 10 ? 2 : 1)}″`}
              onChange={set('fovArcsec')}
            />
            <Slider
              label="Dải động (thang log)"
              value={params.dynamicRangeDecades}
              min={2}
              max={8}
              step={0.5}
              format={(v) => `${v.toFixed(1)} bậc`}
              onChange={set('dynamicRangeDecades')}
              hint="Mỗi bậc là một thừa số 10 cường độ. Tăng để thấy các vòng Airy mờ."
            />
            <label className="block space-y-1">
              <span className="text-sm font-medium text-slate-200">Thang màu</span>
              <select
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm"
                value={params.colormap}
                onChange={(e) => set('colormap')(e.target.value as ColormapName)}
              >
                {(Object.keys(COLORMAP_LABELS) as ColormapName[]).map((name) => (
                  <option key={name} value={name}>
                    {COLORMAP_LABELS[name]}
                  </option>
                ))}
              </select>
            </label>
          </Panel>

          <button
            type="button"
            className="w-full rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
            onClick={() => setParams(DEFAULT_PARAMS)}
          >
            Đặt lại mặc định
          </button>
        </div>
      </main>
    </div>
  )
}
