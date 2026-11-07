import { ZERNIKE_LABELS, ZERNIKE_NAMES, ZERO_ABERRATIONS, type Aberrations, type ZernikeName } from '../lib/zernike'
import { Panel } from './Panel'
import { Slider } from './Slider'

interface AberrationPanelProps {
  value: Aberrations
  onChange: (name: ZernikeName, value: number) => void
  onReset: () => void
}

export function AberrationPanel({ value, onChange, onReset }: AberrationPanelProps) {
  const dirty = ZERNIKE_NAMES.some((name) => value[name] !== ZERO_ABERRATIONS[name])
  return (
    <Panel title="Quang sai Zernike (RMS, bước sóng)">
      <p className="text-xs leading-snug text-slate-400">
        Mỗi hệ số là sai số mặt sóng RMS của một mode. Khoảng 0,075 λ RMS tương ứng Strehl 0,8 (giới hạn Maréchal).
      </p>
      {ZERNIKE_NAMES.map((name) => (
        <Slider
          key={name}
          label={`${ZERNIKE_LABELS[name].label} (${ZERNIKE_LABELS[name].noll})`}
          value={value[name]}
          min={-0.5}
          max={0.5}
          step={0.005}
          format={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(3)} λ`}
          onChange={(v) => onChange(name, v)}
        />
      ))}
      <button
        type="button"
        disabled={!dirty}
        className="w-full rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-200 enabled:hover:bg-slate-800 disabled:opacity-40"
        onClick={onReset}
      >
        Xoá quang sai
      </button>
    </Panel>
  )
}
