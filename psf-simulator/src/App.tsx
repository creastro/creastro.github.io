import { useState } from 'react'
import { AberrationPanel } from './components/AberrationPanel'
import { Panel } from './components/Panel'
import { PsfCanvas } from './components/PsfCanvas'
import { PupilCanvas } from './components/PupilCanvas'
import { Readouts } from './components/Readouts'
import { Slider } from './components/Slider'
import { COLORMAP_LABELS, type ColormapName } from './lib/colormap'
import { DEFAULT_PARAMS, type SimParams } from './lib/frame'
import { ZERO_ABERRATIONS, type ZernikeName } from './lib/zernike'
import { usePsfFrame } from './usePsfFrame'

export default function App() {
  const [params, setParams] = useState<SimParams>(DEFAULT_PARAMS)
  const frame = usePsfFrame(params)
  const set = <K extends keyof SimParams>(key: K) => (value: SimParams[K]) =>
    setParams((p) => ({ ...p, [key]: value }))
  const setAberration = (name: ZernikeName, value: number) =>
    setParams((p) => ({ ...p, aberrations: { ...p.aberrations, [name]: value } }))

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
          <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
            <PupilCanvas rgba={frame?.pupilRgba ?? null} size={frame?.pupilSize ?? 132} />
            <Readouts stats={frame?.stats ?? null} ms={frame?.ms ?? null} />
          </div>
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

          <AberrationPanel
            value={params.aberrations}
            onChange={setAberration}
            onReset={() => set('aberrations')(ZERO_ABERRATIONS)}
          />

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
