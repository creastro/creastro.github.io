import { useId, useRef } from 'react'
import { BASICS } from '../help'

/** Nút "Basics" mở hộp thoại kiến thức nền tảng để hiểu mô phỏng. Dùng <dialog> gốc: Esc và bấm nền để đóng. */
export function BasicsDialog() {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="shrink-0 rounded-md border border-amber-500/60 px-3 py-1.5 text-sm font-medium text-amber-300 hover:bg-amber-500/10 focus-visible:outline-2 focus-visible:outline-amber-400"
      >
        Basics
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onClick={(e) => {
          if (e.target === e.currentTarget) ref.current?.close()
        }}
        className="m-auto w-[min(46rem,calc(100vw-1rem))] rounded-lg border border-slate-700 bg-slate-900 p-0 text-slate-100 backdrop:bg-black/70"
      >
        <div className="max-h-[88vh] overflow-y-auto">
          <div className="sticky top-0 flex items-center justify-between gap-4 border-b border-slate-700 bg-slate-900 px-5 py-3">
            <h2 id={titleId} className="text-base font-semibold">
              Basic knowledge for this simulation
            </h2>
            <button
              type="button"
              autoFocus
              onClick={() => ref.current?.close()}
              className="rounded-md border border-slate-600 px-2.5 py-1 text-sm text-slate-300 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-amber-400"
            >
              Close
            </button>
          </div>
          <div className="space-y-6 px-5 py-5">
            {BASICS.map((section) => (
              <section key={section.title} className="space-y-2">
                <h3 className="text-sm font-semibold text-amber-300">{section.title}</h3>
                {section.paragraphs.map((p) => (
                  <p key={p} className="text-sm leading-relaxed text-slate-300">
                    {p}
                  </p>
                ))}
                {section.formulas?.length ? (
                  <div className="space-y-1 overflow-x-auto rounded-md bg-slate-950 px-3 py-2">
                    {section.formulas.map((f) => (
                      <code key={f} className="block font-mono text-[13px] leading-snug whitespace-pre text-amber-200">
                        {f}
                      </code>
                    ))}
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        </div>
      </dialog>
    </>
  )
}
