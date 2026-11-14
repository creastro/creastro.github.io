/**
 * Plane thumbnails under the diagram, and the large view of one plane in a dialog.
 */
import type { FrameData } from '../lib/frame.ts'
import type { Img, PlaneSet } from '../lib/planes.ts'
import type { WfsData } from '../lib/wfsView.ts'
import { type Scale, absMax, drawImage, maxOf } from './canvas.ts'
import { PLANE_IDS, PLANE_NAMES, type PlaneId } from './diagram.ts'

export interface Panel { readonly caption: string; readonly img: Img; readonly scale: Scale; readonly expert?: boolean }

/** Phase map with the phase hidden where the light is negligible. */
function maskedPhase(phase: Img, intensity: Img): Img {
  const mx = maxOf(intensity)
  return { ...phase, data: phase.data.map((p, i) => (intensity.data[i] > 1e-6 * mx ? p : NaN)) }
}

function setPanels(p: PlaneSet, decades: number, cmap: string, focal: boolean): Panel[] {
  const mx = maxOf(p.before.intensity)
  const log: Scale = { kind: 'log', max: mx, decades, cmap }
  const out: Panel[] = [{ caption: 'Before', img: p.before.intensity, scale: log }]
  if (p.element) {
    const isPhase = absMax(p.element.phase) > 1e-6
    out.push(isPhase ? { caption: focal ? 'Mask (phase)' : 'Phase plate', img: p.element.phase, scale: { kind: 'phase' } }
      : { caption: focal ? 'Mask (amplitude)' : 'Element (amplitude)', img: p.element.amplitude, scale: { kind: 'grey', min: 0, max: 1 } })
  }
  out.push({ caption: 'After', img: p.after.intensity, scale: log })
  out.push({ caption: 'Phase before', img: maskedPhase(p.before.phase, p.before.intensity), scale: { kind: 'phase' }, expert: true })
  out.push({ caption: 'Phase after', img: maskedPhase(p.after.phase, p.after.intensity), scale: { kind: 'phase' }, expert: true })
  return out
}

/** The panels of each plane for the current frame (and sensor). */
export function planePanels(id: PlaneId, f: FrameData, w: WfsData | null, cmap: string, decades: number): Panel[] {
  switch (id) {
    case 'A': return setPanels(f.planes.A, 4, cmap, false)
    case 'B': return setPanels(f.planes.B, 6, cmap, true)
    case 'C': return setPanels(f.planes.C, 5, cmap, false)
    case 'DM': return [{ caption: 'DM surface (nm)', img: f.planes.dmOpd, scale: { kind: 'diverging', limit: absMax(f.planes.dmOpd) || 1 } }]
    case 'D': return [{ caption: 'Detector image', img: f.image, scale: { kind: 'log', max: 1, decades, cmap } }]
    case 'WFS': {
      if (!w) return []
      const raw: Scale = w.kind === 'pairwise' ? { kind: 'diverging', limit: absMax(w.raw) || 1 }
        : w.kind === 'zernike' ? { kind: 'linear', min: 0, max: maxOf(w.raw), cmap } : { kind: 'log', max: maxOf(w.raw), decades: 4, cmap }
      const out: Panel[] = [{ caption: 'Raw signal', img: w.raw, scale: raw }]
      if (w.estimate && w.truth) {
        const s: Scale = w.units === 'nm' ? { kind: 'diverging', limit: absMax(w.truth) || 1 } : { kind: 'log', max: Math.max(maxOf(w.truth), maxOf(w.estimate)), decades: 3, cmap }
        out.push({ caption: w.units === 'nm' ? 'Reconstructed' : 'Estimated |E|²', img: w.estimate, scale: s }, { caption: w.units === 'nm' ? 'True wavefront' : 'True |E|²', img: w.truth, scale: s })
      }
      return out
    }
  }
}

export function buildStrip(host: HTMLElement, open: (id: PlaneId) => void): void {
  host.textContent = ''
  for (const id of PLANE_IDS) {
    const card = document.createElement('div')
    card.className = 'pcard'
    card.dataset.plane = id
    card.tabIndex = 0
    card.setAttribute('role', 'button')
    card.setAttribute('aria-label', `${PLANE_NAMES[id]}: open the large view`)
    const h = document.createElement('div')
    h.className = 'pname'
    h.textContent = PLANE_NAMES[id]
    const row = document.createElement('div')
    row.className = 'thumbs'
    card.append(h, row)
    card.addEventListener('click', () => open(id))
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(id) } })
    host.appendChild(card)
  }
}

export function fillStrip(host: HTMLElement, f: FrameData, w: WfsData | null, cmap: string, decades: number, expert: boolean): void {
  for (const card of Array.from(host.querySelectorAll<HTMLElement>('.pcard'))) {
    const id = card.dataset.plane as PlaneId
    const row = card.querySelector('.thumbs') as HTMLElement
    const panels = planePanels(id, f, w, cmap, decades).filter((p) => expert || !p.expert)
    while (row.children.length > panels.length) row.lastElementChild?.remove()
    panels.forEach((p, i) => {
      let fig = row.children[i] as HTMLElement | undefined
      if (!fig) {
        fig = document.createElement('figure')
        fig.append(document.createElement('canvas'), document.createElement('figcaption'))
        row.appendChild(fig)
      }
      const cv = fig.querySelector('canvas') as HTMLCanvasElement
      cv.setAttribute('aria-hidden', 'true')
      drawImage(cv, p.img, p.scale, 72)
      ;(fig.querySelector('figcaption') as HTMLElement).textContent = p.caption
    })
    card.classList.toggle('empty', panels.length === 0)
  }
}

export function fillDialog(body: HTMLElement, panels: readonly Panel[], expert: boolean): void {
  body.textContent = ''
  for (const p of panels.filter((x) => expert || !x.expert)) {
    const fig = document.createElement('figure')
    const cv = document.createElement('canvas')
    cv.setAttribute('role', 'img')
    cv.setAttribute('aria-label', p.caption)
    const cap = document.createElement('figcaption')
    cap.textContent = p.caption + (p.scale.kind === 'log' ? ` (log, ${p.scale.decades} decades)` : p.scale.kind === 'phase' ? ' (−π … π)' : p.scale.kind === 'diverging' ? ` (±${p.scale.limit.toPrecision(2)})` : '')
    fig.append(cv, cap)
    body.appendChild(fig)
    drawImage(cv, p.img, p.scale, 300)
  }
}
