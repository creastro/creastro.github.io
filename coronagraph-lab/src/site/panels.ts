/** Info panels for the selected coronagraph, sensor and control law, and the bibliography. */
import type { InfoEntry } from '../content/infoTypes.ts'
import { type Reference, fullCite, shortCite } from '../content/references.ts'

export interface Content {
  readonly coronagraphs: readonly InfoEntry[]
  readonly sensors: readonly InfoEntry[]
  readonly control: readonly InfoEntry[]
  readonly references: readonly Reference[]
}

interface Katex { render(tex: string, el: HTMLElement, opts: object): void }
const katex = (): Katex | undefined => (window as unknown as { katex?: Katex }).katex

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text) e.textContent = text
  return e
}

/** Text with $inline TeX$. */
function rich(text: string): DocumentFragment {
  const frag = document.createDocumentFragment()
  for (const part of text.split(/(\$[^$]+\$)/)) {
    if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
      const span = el('span')
      const k = katex()
      if (k) k.render(part.slice(1, -1), span, { throwOnError: false, strict: 'ignore' })
      else span.textContent = part.slice(1, -1)
      frag.appendChild(span)
    } else if (part) frag.appendChild(document.createTextNode(part))
  }
  return frag
}

function list(title: string, items: readonly string[]): HTMLElement {
  const box = el('div', 'info-list')
  box.appendChild(el('h4', '', title))
  const ul = el('ul')
  for (const i of items) ul.appendChild(el('li', '', i))
  box.appendChild(ul)
  return box
}

export function renderInfo(host: HTMLElement, e: InfoEntry, content: Content, expert: boolean): void {
  host.textContent = ''
  const head = el('div', 'info-head')
  head.append(el('span', 'tag', e.family), el('h3', '', e.name))
  host.appendChild(head)
  const p = el('p', 'info-beginner'); p.appendChild(rich(e.beginner)); host.appendChild(p)
  if (expert) {
    for (const t of e.expert) { const q = el('p'); q.appendChild(rich(t)); host.appendChild(q) }
    for (const f of e.formulas) {
      const box = el('div', 'formula-box')
      box.appendChild(el('span', 'f-note', f.note))
      const m = el('div')
      const k = katex()
      if (k) k.render(f.tex, m, { displayMode: true, throwOnError: false, strict: 'ignore' })
      else m.textContent = f.tex
      box.appendChild(m)
      host.appendChild(box)
    }
  }
  const cols = el('div', 'info-cols')
  cols.append(list('Strengths', e.strengths), list('Limitations', e.limitations), list('Used on', e.instruments))
  host.appendChild(cols)
  if (expert) { const s = el('p', 'info-sim'); s.append(el('strong', '', 'In this simulation: '), document.createTextNode(e.sim)); host.appendChild(s) }
  const refs = el('p', 'info-refs')
  refs.appendChild(document.createTextNode('Sources: '))
  e.refs.forEach((k, i) => {
    const r = content.references.find((x) => x.key === k)
    if (!r) return
    if (i) refs.appendChild(document.createTextNode('; '))
    const a = el('a', '', shortCite(r))
    a.href = `#ref-${k}`
    refs.appendChild(a)
  })
  host.appendChild(refs)
}

export function renderBibliography(host: HTMLElement, refs: readonly Reference[]): void {
  host.textContent = ''
  const sorted = [...refs].sort((a, b) => a.authors[0].localeCompare(b.authors[0]) || a.year - b.year)
  for (const r of sorted) {
    const li = el('li')
    li.id = `ref-${r.key}`
    li.appendChild(document.createTextNode(fullCite(r) + ' '))
    const a = el('a', '', `doi:${r.doi}`)
    a.href = `https://doi.org/${r.doi}`; a.target = '_blank'; a.rel = 'noopener noreferrer'
    li.appendChild(a)
    if (!r.peerReviewed) li.appendChild(el('span', 'conf', ' (conference proceedings)'))
    host.appendChild(li)
  }
}
