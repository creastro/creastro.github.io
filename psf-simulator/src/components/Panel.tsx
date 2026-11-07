import type { ReactNode } from 'react'

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <h2 className="text-xs font-semibold tracking-wider text-slate-400 uppercase">{title}</h2>
      {children}
    </section>
  )
}
