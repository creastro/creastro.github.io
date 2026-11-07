import { useId } from 'react'
import type { HelpEntry } from '../help'
import { HelpButton, Tip } from './Tip'

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  /** Định dạng giá trị hiển thị, ví dụ thêm đơn vị. */
  format?: (value: number) => string
  /** Thang logarit: hữu ích cho đại lượng trải nhiều bậc độ lớn như đường kính hay trường nhìn. */
  log?: boolean
  /** Chú thích chi tiết hiện khi rê chuột hoặc focus. */
  help: HelpEntry
}

const LOG_STEPS = 1000

export function Slider({ label, value, min, max, step, onChange, format, log = false, help }: SliderProps) {
  const id = useId()
  const shown = format ? format(value) : String(value)

  // Ở thang log, thanh trượt chạy trên [0, LOG_STEPS] và giá trị = min · (max/min)^(t/LOG_STEPS).
  const position = log ? (Math.log(value / min) / Math.log(max / min)) * LOG_STEPS : value
  const handle = (raw: number) => {
    onChange(log ? min * (max / min) ** (raw / LOG_STEPS) : raw)
  }

  return (
    <Tip help={help} className="space-y-1">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5">
          <label htmlFor={id} className="text-sm font-medium text-slate-200">
            {label}
          </label>
          <HelpButton />
        </span>
        <output htmlFor={id} className="font-mono text-sm tabular-nums text-amber-300">
          {shown}
        </output>
      </div>
      <input
        id={id}
        type="range"
        className="w-full accent-amber-400"
        min={log ? 0 : min}
        max={log ? LOG_STEPS : max}
        step={log ? 1 : step}
        value={position}
        aria-valuetext={shown}
        onChange={(e) => handle(Number(e.target.value))}
      />
    </Tip>
  )
}
