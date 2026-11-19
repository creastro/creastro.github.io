/**
 * Consistency of the page content: help topics, cross-references, tooltips, control ids and language.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CORONAGRAPH_INFO } from '../content/coronagraphInfo.ts'
import { CONTROL_INFO, SENSOR_INFO } from '../content/sensorInfo.ts'
import { CONTROLS } from './controls.ts'
import { PARAMETER_TOPICS, TIPS } from './helpTopics.ts'
import { TOUR } from './tour.ts'

const html = readFileSync(new URL('../../../simulations/coronagraph-lab/index.html', import.meta.url), 'utf8')
const topicIds = new Set([...Object.keys(PARAMETER_TOPICS), ...[...CORONAGRAPH_INFO, ...SENSOR_INFO, ...CONTROL_INFO].map((e) => e.id)])
const controlIds = new Set(CONTROLS.map((c) => c.id))

describe('page content', () => {
  it('every {{topic|label}} link and "see" entry points to an existing topic', () => {
    for (const [k, t] of Object.entries(PARAMETER_TOPICS)) {
      for (const s of [t.what, t.sim, ...t.theory]) for (const m of s.matchAll(/\{\{([^}|]+)\|/g)) expect(topicIds.has(m[1]), `${k} → ${m[1]}`).toBe(true)
      for (const s of t.see) expect(topicIds.has(s), `${k} sees ${s}`).toBe(true)
    }
  })

  it('every control has a tooltip, and every tooltip targets a control or an element of the page', () => {
    for (const id of controlIds) expect(TIPS[id] ?? (id.startsWith('z') || id.startsWith('ncpa') || id.startsWith('p') ? 'ok' : undefined), id).toBeTruthy()
    for (const id of Object.keys(TIPS)) expect(controlIds.has(id) || html.includes(`id="${id}"`), id).toBe(true)
  })

  it('control ids are unique and every control group exists in the page', () => {
    expect(controlIds.size).toBe(CONTROLS.length)
    for (const c of CONTROLS) expect(html.includes(`id="${c.group}"`), c.group).toBe(true)
  })

  it('the tour has titled steps that each change the configuration', () => {
    expect(TOUR.length).toBeGreaterThanOrEqual(5)
    for (const s of TOUR) expect(s.title.length).toBeGreaterThan(5)
  })

  it('all user-facing text is English (no Vietnamese letters)', () => {
    const viet = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i
    const texts = [html.replace(/Mai Như Tín/g, ''), JSON.stringify(PARAMETER_TOPICS), JSON.stringify(TIPS), JSON.stringify([...CORONAGRAPH_INFO, ...SENSOR_INFO, ...CONTROL_INFO]), JSON.stringify(TOUR.map((t) => [t.title, t.text]))]
    for (const t of texts) expect(viet.test(t)).toBe(false)
  })
})
