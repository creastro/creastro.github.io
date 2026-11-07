import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import type { HelpEntry } from '../help'

interface TipContextValue {
  title: string
  pinned: boolean
  toggle: () => void
}

const TipContext = createContext<TipContextValue | null>(null)

/** Nút "?" đặt trong một <Tip>: ghim chú thích để dùng trên màn hình cảm ứng và bằng bàn phím. */
export function HelpButton() {
  const ctx = useContext(TipContext)
  if (!ctx) return null
  return (
    <button
      type="button"
      aria-label={`Help: ${ctx.title}`}
      aria-pressed={ctx.pinned}
      onClick={ctx.toggle}
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-600 text-[10px] leading-none text-slate-400 hover:border-amber-400 hover:text-amber-300 focus-visible:outline-2 focus-visible:outline-amber-400"
    >
      ?
    </button>
  )
}

/**
 * Focus có đến từ bàn phím không. Bấm chuột vào nút làm nút giữ focus, và nếu tính cả trường hợp đó thì chú thích sẽ
 * kẹt lại sau khi chuột đã rời đi. `:focus-visible` chỉ đúng với focus từ bàn phím; trình duyệt quá cũ không hiểu
 * bộ chọn này thì coi như có.
 */
function isKeyboardFocus(el: EventTarget): boolean {
  try {
    return (el as Element).matches(':focus-visible')
  } catch {
    return true
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

interface TipProps {
  help: HelpEntry
  children: ReactNode
  className?: string
}

/**
 * Bao một điều khiển hoặc số liệu bằng chú thích chi tiết (giải thích và công thức).
 * Hiện khi rê chuột hoặc focus bàn phím, hoặc khi ghim bằng nút "?"; Esc hoặc bấm ra ngoài để đóng.
 * Chú thích được vẽ qua portal với vị trí cố định, ưu tiên bên trái, rồi bên phải, rồi bên dưới, và luôn nằm
 * trong khung nhìn.
 */
export function Tip({ help, children, className }: TipProps) {
  const id = useId()
  const anchor = useRef<HTMLDivElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const open = hover || focus || pinned

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const a = anchor.current
      const p = popup.current
      if (!a || !p) return
      const r = a.getBoundingClientRect()
      const w = p.offsetWidth
      const h = p.offsetHeight
      const vw = document.documentElement.clientWidth
      const vh = window.innerHeight
      const gap = 12
      const m = 8
      let left: number
      let top: number
      if (r.left - w - gap >= m) {
        left = r.left - w - gap
        top = clamp(r.top, m, vh - h - m)
      } else if (r.right + w + gap <= vw - m) {
        left = r.right + gap
        top = clamp(r.top, m, vh - h - m)
      } else {
        left = clamp(r.left, m, vw - w - m)
        top = r.bottom + 8 + h <= vh - m ? r.bottom + 8 : Math.max(m, r.top - h - 8)
      }
      setPos({ left, top })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, help])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPinned(false)
        setHover(false)
        setFocus(false)
      }
    }
    const onDown = (e: PointerEvent) => {
      if (pinned && !anchor.current?.contains(e.target as Node)) setPinned(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open, pinned])

  const mouseLike = (e: React.PointerEvent) => e.pointerType !== 'touch'

  return (
    <TipContext.Provider value={{ title: help.title, pinned, toggle: () => setPinned((v) => !v) }}>
      <div
        ref={anchor}
        className={className}
        aria-describedby={open ? id : undefined}
        onPointerEnter={(e) => mouseLike(e) && setHover(true)}
        onPointerLeave={(e) => mouseLike(e) && setHover(false)}
        onFocus={(e) => setFocus(isKeyboardFocus(e.target))}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocus(false)
        }}
      >
        {children}
      </div>
      {open
        ? createPortal(
            <div
              ref={popup}
              id={id}
              role="tooltip"
              style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }}
              className={`fixed z-50 max-h-[calc(100vh-16px)] w-[min(22rem,calc(100vw-16px))] space-y-2 overflow-y-auto rounded-lg border border-slate-600 bg-slate-900 p-3 text-left shadow-xl shadow-black/50 ${pinned ? '' : 'pointer-events-none'}`}
            >
              <p className="text-sm font-semibold text-slate-50">{help.title}</p>
              <p className="text-xs leading-relaxed text-slate-300">{help.body}</p>
              {help.formulas?.length ? (
                <div className="space-y-1 rounded-md bg-slate-950 px-2 py-1.5">
                  {help.formulas.map((f) => (
                    <code key={f} className="block font-mono text-[11.5px] leading-snug break-words whitespace-pre-wrap text-amber-200">
                      {f}
                    </code>
                  ))}
                </div>
              ) : null}
              {help.note ? <p className="text-xs leading-relaxed text-slate-400 italic">{help.note}</p> : null}
            </div>,
            document.body,
          )
        : null}
    </TipContext.Provider>
  )
}
