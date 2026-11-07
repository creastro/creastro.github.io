import { useId } from 'react'
import { SEGMENT_HELP } from '../help'
import type { SimParams } from '../lib/frame'
import { SEGMENT_PRESETS, type SegmentPresetKey } from '../lib/segmentPresets'
import { segmentCount } from '../lib/segments'
import { Panel } from './Panel'
import { Slider } from './Slider'
import { HelpButton, Tip } from './Tip'

interface SegmentPanelProps {
  params: SimParams
  onSegmented: (patch: Partial<SimParams['segmented']>) => void
  onPreset: (key: SegmentPresetKey) => void
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  const id = useId()
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-amber-400"
      />
      <label htmlFor={id} className="text-sm font-medium text-slate-200">
        {label}
      </label>
      <HelpButton />
    </div>
  )
}

export function SegmentPanel({ params, onSegmented, onPreset }: SegmentPanelProps) {
  const s = params.segmented
  const count = segmentCount(s.rings, s.removeCenter)
  return (
    <Panel title="Segmented mirror">
      <Tip help={SEGMENT_HELP.segmented}>
        <Check checked={s.enabled} onChange={(enabled) => onSegmented({ enabled })} label="Segmented hexagonal mirror" />
      </Tip>
      {s.enabled ? (
        <>
          <Tip help={SEGMENT_HELP.presets} className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-sm font-medium text-slate-200">
              Presets <HelpButton />
            </div>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(SEGMENT_PRESETS) as SegmentPresetKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onPreset(key)}
                  className="rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-amber-400"
                >
                  {SEGMENT_PRESETS[key].label}
                </button>
              ))}
            </div>
          </Tip>
          <Slider
            label="Rings k"
            value={s.rings}
            min={1}
            max={5}
            step={1}
            format={(v) => `${v} (${segmentCount(v, s.removeCenter)} segments)`}
            onChange={(rings) => onSegmented({ rings })}
            help={SEGMENT_HELP.rings}
          />
          <Slider
            label="Gap between segments"
            value={s.gapRatio}
            min={0}
            max={0.1}
            step={0.001}
            format={(v) => `${(v * 100).toFixed(1)}% of width`}
            onChange={(gapRatio) => onSegmented({ gapRatio })}
            help={SEGMENT_HELP.gap}
          />
          <Tip help={SEGMENT_HELP.removeCenter}>
            <Check checked={s.removeCenter} onChange={(removeCenter) => onSegmented({ removeCenter })} label="Remove center segment" />
          </Tip>
          <Slider
            label="Piston error (RMS)"
            value={s.pistonRms}
            min={0}
            max={0.3}
            step={0.005}
            format={(v) => `${v.toFixed(3)} λ`}
            onChange={(pistonRms) => onSegmented({ pistonRms })}
            help={SEGMENT_HELP.pistonRms}
          />
          <Slider
            label="Tip/tilt error (RMS)"
            value={s.tiltRms}
            min={0}
            max={0.3}
            step={0.005}
            format={(v) => `${v.toFixed(3)} λ`}
            onChange={(tiltRms) => onSegmented({ tiltRms })}
            help={SEGMENT_HELP.tiltRms}
          />
          <Tip help={SEGMENT_HELP.newDraw}>
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => onSegmented({ seed: s.seed + 1 })}
                disabled={s.pistonRms === 0 && s.tiltRms === 0}
                className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-200 enabled:hover:bg-slate-800 disabled:opacity-40"
              >
                New random draw
              </button>
              <span className="font-mono text-xs text-slate-500">seed {s.seed}</span>
            </div>
          </Tip>
          <p className="text-xs text-slate-500">
            {count} segments. The obstruction and vanes set elsewhere still apply.
          </p>
        </>
      ) : null}
    </Panel>
  )
}
