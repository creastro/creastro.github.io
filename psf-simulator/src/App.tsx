import { useState } from 'react'
import { AberrationPanel } from './components/AberrationPanel'
import { BasicsDialog } from './components/BasicsDialog'
import { Panel } from './components/Panel'
import { ProfilePlot } from './components/ProfilePlot'
import { PsfCanvas } from './components/PsfCanvas'
import { PupilCanvas } from './components/PupilCanvas'
import { Readouts } from './components/Readouts'
import { Slider } from './components/Slider'
import { HelpButton, Tip } from './components/Tip'
import { CONTROL_HELP } from './help'
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
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 px-4 py-4 sm:px-6">
        <div>
          <h1 className="text-lg font-semibold">Telescope PSF Simulator</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            The point spread function (PSF) is the squared magnitude of the 2D Fourier transform of the aperture. Change the
            mirror, obstruction and spider vanes to watch the Airy rings and diffraction spikes respond in real time. Hover
            over any control or number for an explanation.
          </p>
        </div>
        <BasicsDialog />
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-3">
          <PsfCanvas rgba={frame?.rgba ?? null} fovArcsec={params.fovArcsec} />
          {frame && !frame.stats.fovCovered ? (
            <p role="status" className="rounded-md bg-amber-950/60 px-3 py-2 text-sm text-amber-200">
              The field of view is larger than the computed area (±64 λ/D), so the outside is black. Reduce the field of view
              or increase the wavelength.
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
            <PupilCanvas rgba={frame?.pupilRgba ?? null} size={frame?.pupilSize ?? 132} />
            <Readouts stats={frame?.stats ?? null} ms={frame?.ms ?? null} />
          </div>
          <ProfilePlot profile={frame?.profile ?? null} dynamicRangeDecades={params.dynamicRangeDecades} />
        </div>

        <div className="space-y-4">
          <Panel title="Primary mirror and wavelength">
            <Slider
              label="Mirror diameter D"
              value={params.diameterM}
              min={0.1}
              max={10}
              step={0.01}
              log
              format={(v) => `${v.toFixed(2)} m`}
              onChange={set('diameterM')}
              help={CONTROL_HELP.diameter}
            />
            <Slider
              label="Center wavelength λ"
              value={params.wavelengthNm}
              min={380}
              max={1000}
              step={5}
              format={(v) => `${v.toFixed(0)} nm`}
              onChange={set('wavelengthNm')}
              help={CONTROL_HELP.wavelength}
            />
            <Slider
              label="Bandwidth Δλ"
              value={params.bandwidthNm}
              min={0}
              max={300}
              step={5}
              format={(v) => (v === 0 ? 'monochromatic' : `${v.toFixed(0)} nm`)}
              onChange={set('bandwidthNm')}
              help={CONTROL_HELP.bandwidth}
            />
          </Panel>

          <Panel title="Obstruction and spider vanes">
            <Slider
              label="Central obstruction ε"
              value={params.obstructionRatio}
              min={0}
              max={0.7}
              step={0.01}
              format={(v) => `${(v * 100).toFixed(0)}% of D`}
              onChange={set('obstructionRatio')}
              help={CONTROL_HELP.obstruction}
            />
            <Slider
              label="Spider vanes N"
              value={params.vaneCount}
              min={0}
              max={8}
              step={1}
              format={(v) => String(v)}
              onChange={set('vaneCount')}
              help={CONTROL_HELP.vaneCount}
            />
            <Slider
              label="Vane thickness t"
              value={params.vaneThicknessRatio}
              min={0.002}
              max={0.05}
              step={0.001}
              format={(v) => `${(v * 100).toFixed(1)}% of D`}
              onChange={set('vaneThicknessRatio')}
              help={CONTROL_HELP.vaneThickness}
            />
            <Slider
              label="Vane rotation φ₀"
              value={params.vaneAngleDeg}
              min={0}
              max={180}
              step={1}
              format={(v) => `${v.toFixed(0)}°`}
              onChange={set('vaneAngleDeg')}
              help={CONTROL_HELP.vaneAngle}
            />
          </Panel>

          <AberrationPanel
            value={params.aberrations}
            onChange={setAberration}
            onReset={() => set('aberrations')(ZERO_ABERRATIONS)}
          />

          <Panel title="Display">
            <Slider
              label="Field of view"
              value={params.fovArcsec}
              min={0.2}
              max={30}
              step={0.1}
              log
              format={(v) => `${v.toFixed(v < 10 ? 2 : 1)}″`}
              onChange={set('fovArcsec')}
              help={CONTROL_HELP.fov}
            />
            <Slider
              label="Dynamic range (log)"
              value={params.dynamicRangeDecades}
              min={2}
              max={8}
              step={0.5}
              format={(v) => `${v.toFixed(1)} decades`}
              onChange={set('dynamicRangeDecades')}
              help={CONTROL_HELP.dynamicRange}
            />
            <Tip help={CONTROL_HELP.colormap} className="space-y-1">
              <div className="flex items-center gap-1.5">
                <label htmlFor="colormap" className="text-sm font-medium text-slate-200">
                  Color map
                </label>
                <HelpButton />
              </div>
              <select
                id="colormap"
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
            </Tip>
          </Panel>

          <Tip help={CONTROL_HELP.resetAll}>
            <button
              type="button"
              className="w-full rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
              onClick={() => setParams(DEFAULT_PARAMS)}
            >
              Reset to defaults
            </button>
          </Tip>
        </div>
      </main>
    </div>
  )
}
