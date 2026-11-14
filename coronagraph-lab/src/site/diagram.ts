/**
 * The optical-train diagram (original drawing): star and planet beams through the telescope, the pupil plane A
 * (apodizer / phase plate), the deformable mirror, the beam splitter to the wavefront sensor, the focal-plane
 * mask B, the Lyot stop C and the detector D. Elements change with the coronagraph and the sensor.
 */
import type { LabConfig } from '../lib/config.ts'
import { isPupilWfs } from '../lib/wfsView.ts'
import { PALETTE } from './plots.ts'

const CY = 120, H = 38, TEL = 58
const X = { star: 30, tel: 110, f0: 165, L1: 220, A: 268, DM: 330, BS: 392, L2: 446, B: 512, L3: 578, C: 630, L4: 688, D: 758 }
export const PLANE_IDS = ['A', 'DM', 'B', 'C', 'D', 'WFS'] as const
export type PlaneId = (typeof PLANE_IDS)[number]

export const PLANE_NAMES: Readonly<Record<PlaneId, string>> = {
  A: 'A · Entrance pupil', DM: 'Deformable mirror', B: 'B · Focal-plane mask', C: 'C · Lyot stop', D: 'D · Detector', WFS: 'Wavefront sensor',
}

const WFS_NAMES: Readonly<Record<string, string>> = {
  'shack-hartmann': 'Shack–Hartmann', pyramid: 'Pyramid', zernike: 'Zernike sensor', curvature: 'Curvature sensor',
  pairwise: 'Pairwise probing', 'phase-diversity': 'Phase diversity', scc: 'Self-coherent camera',
}

function lens(x: number, h: number): string {
  return `<path d="M${x} ${CY - h} Q${x + 9} ${CY} ${x} ${CY + h} Q${x - 9} ${CY} ${x} ${CY - h}Z" class="lens"/>`
}

/** Edge rays of a beam through the train; `dy` is the focal offset (planet). */
function beam(dy: number, cls: string): string {
  const tilt = dy * 0.5
  const pts = (s: 1 | -1) => [
    [X.star + 18, CY + s * TEL - tilt * 2], [X.tel, CY + s * TEL], [X.f0, CY + dy], [X.L1, CY + s * H],
    [X.L2, CY + s * H + tilt], [X.B, CY + dy], [X.L3, CY + s * H], [X.L4, CY + s * H + tilt], [X.D, CY + dy],
  ]
  const top = pts(-1), bot = pts(1)
  const poly = [...top, ...bot.reverse()].map(([x, y]) => `${x},${y}`).join(' ')
  return `<polygon points="${poly}" class="${cls}"/>`
}

function planeGroup(id: PlaneId, x: number, inner: string, label: string, aria: string): string {
  return `<g class="plane" data-plane="${id}" role="button" tabindex="0" aria-label="${aria}">
    <rect class="hit" x="${x - 26}" y="${CY - 78}" width="52" height="${id === 'WFS' ? 150 : 200}" rx="8"/>${inner}
    <text x="${x}" y="${CY + 92}" class="lbl">${label}</text></g>`
}

function maskB(c: LabConfig): string {
  const k = c.coronagraph.kind, x = X.B
  switch (k) {
    case 'lyot': case 'aplc': return `<line x1="${x}" y1="${CY - 46}" x2="${x}" y2="${CY + 46}" class="glass"/><circle cx="${x}" cy="${CY}" r="7" class="occ"/>`
    case 'roddier': return `<line x1="${x}" y1="${CY - 46}" x2="${x}" y2="${CY + 46}" class="glass"/><circle cx="${x}" cy="${CY}" r="4" class="phase"/><text x="${x + 8}" y="${CY - 8}" class="tiny">π</text>`
    case 'fqpm': return `<rect x="${x - 4}" y="${CY - 46}" width="8" height="46" class="phase"/><rect x="${x - 4}" y="${CY}" width="8" height="46" class="glassfill"/><line x1="${x - 8}" y1="${CY}" x2="${x + 8}" y2="${CY}" class="edge"/>`
    case 'vortex': return `<rect x="${x - 4}" y="${CY - 46}" width="8" height="92" fill="url(#vortex)"/><text x="${x + 8}" y="${CY - 30}" class="tiny">l=${c.coronagraph.charge}</text>`
    case 'bandlimited': return `<rect x="${x - 4}" y="${CY - 46}" width="8" height="92" fill="url(#bl)"/>`
    default: return `<line x1="${x}" y1="${CY - 46}" x2="${x}" y2="${CY + 46}" class="none"/><text x="${x}" y="${CY - 52}" class="tiny mid">no mask</text>`
  }
}

function elementA(c: LabConfig): string {
  const k = c.coronagraph.kind, x = X.A
  if (k === 'aplc') return `<rect x="${x - 5}" y="${CY - H}" width="10" height="${2 * H}" fill="url(#apod)"/><text x="${x}" y="${CY - H - 8}" class="tiny mid">apodizer</text>`
  if (k === 'shaped') return `<rect x="${x - 5}" y="${CY - H}" width="10" height="${2 * H}" class="occ"/>${[-24, -8, 8, 24].map((d) => `<rect x="${x - 5}" y="${CY + d - 4}" width="10" height="8" class="slit"/>`).join('')}<text x="${x}" y="${CY - H - 8}" class="tiny mid">shaped pupil</text>`
  if (k === 'app') return `<rect x="${x - 5}" y="${CY - H}" width="10" height="${2 * H}" fill="url(#app)"/><text x="${x}" y="${CY - H - 8}" class="tiny mid">${c.coronagraph.appVector ? 'vAPP' : 'APP'}</text>`
  return `<line x1="${x}" y1="${CY - H - 4}" x2="${x}" y2="${CY + H + 4}" class="none"/><text x="${x}" y="${CY - H - 8}" class="tiny mid">pupil</text>`
}

function lyotC(c: LabConfig): string {
  const x = X.C, k = c.coronagraph.kind
  if (k === 'none' || k === 'shaped' || k === 'app') return `<line x1="${x}" y1="${CY - H - 4}" x2="${x}" y2="${CY + H + 4}" class="none"/><text x="${x}" y="${CY - H - 8}" class="tiny mid">no stop</text>`
  const open = H * Math.min(1, c.coronagraph.kind === 'bandlimited' ? 1 - c.coronagraph.blEpsilon : c.coronagraph.lyotOuter)
  const scc = c.wfs.kind === 'scc'
  const top = scc ? `<rect x="${x - 4}" y="${CY - H - 30}" width="8" height="12" class="occ"/><rect x="${x - 4}" y="${CY - H - 15}" width="8" height="${H + 15 - open}" class="occ"/><text x="${x + 8}" y="${CY - H - 18}" class="tiny">hole</text>`
    : `<rect x="${x - 4}" y="${CY - H - 30}" width="8" height="${30 + H - open}" class="occ"/>`
  const inner = c.coronagraph.lyotInner > 0 || c.pupil.kind !== 'circular' ? `<rect x="${x - 4}" y="${CY - 5}" width="8" height="10" class="occ"/>` : ''
  return `${top}<rect x="${x - 4}" y="${CY + open}" width="8" height="${30 + H - open}" class="occ"/>${inner}`
}

export function diagramSvg(c: LabConfig): string {
  const pupilWfs = isPupilWfs(c.wfs.kind)
  const wfsX = pupilWfs ? X.BS : X.D
  const wfsName = WFS_NAMES[c.wfs.kind] ?? c.wfs.kind
  const branch = pupilWfs
    ? `<polygon points="${X.BS - 10},${CY} ${X.BS + 10},${CY} ${X.BS + 18},226 ${X.BS - 18},226" class="beam-wfs"/>`
    : `<path d="M${X.D} ${CY + 30} V226" class="link"/>`
  const planet = c.planets.length > 0
  return `<svg viewBox="0 0 820 330" role="group" aria-labelledby="t-train" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="apod" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#111"/><stop offset=".5" stop-color="#edf2ff"/><stop offset="1" stop-color="#111"/></linearGradient>
    <linearGradient id="vortex" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3c3b8f"/><stop offset=".25" stop-color="#7a9fcf"/><stop offset=".5" stop-color="#e2d9e2"/><stop offset=".75" stop-color="#d6935a"/><stop offset="1" stop-color="#8f3b3b"/></linearGradient>
    <linearGradient id="bl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#edf2ff"/><stop offset=".4" stop-color="#888"/><stop offset=".5" stop-color="#111"/><stop offset=".6" stop-color="#888"/><stop offset="1" stop-color="#edf2ff"/></linearGradient>
    <pattern id="app" width="10" height="12" patternUnits="userSpaceOnUse"><rect width="10" height="12" fill="#2a3d63"/><path d="M0 6 Q2.5 0 5 6 T10 6" stroke="#8fe3ff" fill="none"/></pattern>
  </defs>
  ${beam(0, 'beam-star')}${planet ? beam(-14, 'beam-planet') : ''}${branch}
  <circle cx="${X.star}" cy="${CY}" r="9" fill="${PALETTE.orange}"/><text x="${X.star}" y="${CY + 26}" class="tiny mid">star</text>
  ${planet ? `<circle cx="${X.star}" cy="${CY - 44}" r="4" fill="${PALETTE.sky}"/><text x="${X.star}" y="${CY - 54}" class="tiny mid">planet</text>` : ''}
  ${lens(X.tel, TEL)}<text x="${X.tel}" y="${CY + TEL + 16}" class="tiny mid">telescope</text>
  ${lens(X.L1, H + 6)}${lens(X.L2, H + 6)}${lens(X.L3, H + 6)}${lens(X.L4, H + 6)}
  <line x1="${X.BS - 12}" y1="${CY + 14}" x2="${X.BS + 12}" y2="${CY - 14}" class="bs"/><text x="${X.BS}" y="${CY - H - 8}" class="tiny mid">beam splitter</text>
  ${planeGroup('A', X.A, elementA(c), 'A', 'Plane A, entrance pupil: open the large view')}
  ${planeGroup('DM', X.DM, `<rect x="${X.DM - 6}" y="${CY - H}" width="12" height="${2 * H}" class="dm"/>${[-28, -14, 0, 14, 28].map((d) => `<circle cx="${X.DM}" cy="${CY + d}" r="2" class="act"/>`).join('')}`, 'DM', 'Deformable mirror: open the large view')}
  ${planeGroup('B', X.B, maskB(c), 'B', 'Plane B, focal-plane mask: open the large view')}
  ${planeGroup('C', X.C, lyotC(c), 'C', 'Plane C, Lyot stop: open the large view')}
  ${planeGroup('D', X.D, `<rect x="${X.D - 3}" y="${CY - 40}" width="14" height="80" class="det"/>`, 'D', 'Plane D, detector: open the large view')}
  <g class="plane" data-plane="WFS" role="button" tabindex="0" aria-label="Wavefront sensor (${wfsName}): open the large view">
    <rect x="${wfsX - 70}" y="228" width="140" height="44" rx="8" class="wfsbox"/>
    <text x="${wfsX}" y="247" class="lbl">${wfsName}</text>
    <text x="${wfsX}" y="263" class="tiny mid">${pupilWfs ? 'pupil-plane sensor' : 'uses the science camera'}</text>
  </g>
  <text x="10" y="318" class="tiny"><tspan fill="${PALETTE.orange}">■</tspan> starlight (on axis)  ${planet ? `<tspan fill="${PALETTE.sky}">■</tspan> planet light (off axis)` : ''}</text>
</svg>`
}
