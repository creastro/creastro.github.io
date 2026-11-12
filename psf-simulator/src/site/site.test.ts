/**
 * Kiểm tra trang simulations/telescope-psf: nội dung giải thích (help.js), index.html và mã trang khớp nhau.
 * Mọi công thức được biên dịch bằng chính KaTeX đã vendor trong repo, ở chế độ strict, như cách trang sẽ vẽ chúng.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { OTHER_CONTROL_IDS, RANGE_SPECS, READ_ROWS, REQUIRED_IDS } from './controlSpecs'

interface Formula {
  tex: string
  note?: string
}
interface Ref {
  c: string
  u?: string
}
interface Topic {
  title: string
  what: string
  theory?: string[]
  formulas?: Formula[]
  sim?: string
  refs?: Ref[]
  see?: string[]
}
interface Help {
  tips: Record<string, string>
  bind: Record<string, string>
  panels: Record<string, string>
  topics: Record<string, Topic>
}

const here = path.dirname(fileURLToPath(import.meta.url))
const dir = path.resolve(here, '../../../simulations/telescope-psf')
const read = (name: string) => readFileSync(path.join(dir, name), 'utf8')
const html = read('index.html')
const helpSource = read('help.js')
// Mã trang giờ nằm ở nhiều file (main, controls, ...): quét mọi file nguồn không phải test.
const mainSource = readdirSync(here)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .map((f) => readFileSync(path.join(here, f), 'utf8'))
  .join('\n')

const win: { SIM_HELP?: Help } = {}
new Function('window', helpSource)(win)
const help = win.SIM_HELP as Help
const katex = createRequire(import.meta.url)(path.resolve(dir, '../shared/katex/katex.min.js')) as {
  renderToString: (tex: string, opts: object) => string
}

const staticIds = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))
const rangeIds = RANGE_SPECS.map((s) => s.id)
const controlIds = [...rangeIds, ...OTHER_CONTROL_IDS]
const topicKeys = Object.keys(help.topics)

/** Mọi chuỗi trong một chủ đề, kèm tên trường, để kiểm tra chung. */
function textsOf(t: Topic): string[] {
  return [
    t.title,
    t.what,
    ...(t.theory ?? []),
    t.sim ?? '',
    ...(t.formulas ?? []).map((f) => f.note ?? ''),
    ...(t.refs ?? []).map((r) => r.c),
  ]
}
const allStrings = (): string[] => [
  ...Object.values(help.tips),
  ...Object.values(help.topics).flatMap(textsOf),
  ...Object.values(help.topics).flatMap((t) => (t.formulas ?? []).map((f) => f.tex)),
]
const links = (text: string): string[] => [...text.matchAll(/\{\{([^}|]+)\|[^}]+\}\}/g)].map((m) => m[1])
const inlineMath = (text: string): string[] => [...text.matchAll(/\$([^$]+)\$/g)].map((m) => m[1])

describe('help.js', () => {
  it('có tips, bind, panels và các chủ đề', () => {
    expect(Object.keys(help.tips).length).toBeGreaterThan(30)
    expect(topicKeys.length).toBeGreaterThan(25)
    expect(Object.keys(help.bind).length).toBeGreaterThan(10)
  })

  it('mọi điều khiển và dòng số liệu đều có tooltip, và mọi tooltip trỏ đến phần tử có thật', () => {
    for (const id of controlIds) expect(help.tips[id], `tip cho #${id}`).toBeTruthy()
    for (const [key] of READ_ROWS) expect(help.tips[`read-${key}`], `tip cho số liệu ${key}`).toBeTruthy()
    const known = new Set([...controlIds, ...READ_ROWS.map(([k]) => `read-${k}`)])
    for (const id of Object.keys(help.tips)) expect(known.has(id), `tip lạc: ${id}`).toBe(true)
  })

  it('tooltip ngắn: một hai câu, không công thức TeX', () => {
    for (const [id, text] of Object.entries(help.tips)) {
      expect(text.length, id).toBeLessThan(140)
      expect(text, id).not.toContain('\\')
      expect(text, id).not.toContain('$')
    }
  })

  it('bind: tên tham số có thật, chủ đề có thật, và nhãn là <label> hoặc hàng .field', () => {
    for (const [id, topic] of Object.entries(help.bind)) {
      expect(controlIds, `bind lạc: ${id}`).toContain(id)
      expect(help.topics[topic], `chủ đề của ${id}`).toBeDefined()
      expect(rangeIds.includes(id) || html.includes(`for="${id}"`), `nhãn của ${id}`).toBe(true)
    }
  })

  it('panels: tiêu đề có trong index.html và chủ đề có thật', () => {
    for (const [id, topic] of Object.entries(help.panels)) {
      expect(staticIds.has(id), `tiêu đề #${id}`).toBe(true)
      expect(help.topics[topic], `chủ đề của ${id}`).toBeDefined()
    }
  })

  it('mọi liên kết {{chủ đề|nhãn}} và danh sách "see" đều trỏ đến chủ đề có thật', () => {
    for (const [key, t] of Object.entries(help.topics)) {
      for (const k of t.see ?? []) expect(help.topics[k], `${key} → see ${k}`).toBeDefined()
      for (const k of textsOf(t).flatMap(links)) expect(help.topics[k], `${key} → {{${k}}}`).toBeDefined()
    }
  })

  it('mọi chủ đề đều mở được từ trang (bind, panels, số liệu, nút data-topic) hoặc từ chủ đề khác', () => {
    const roots = new Set<string>([
      ...Object.values(help.bind),
      ...Object.values(help.panels),
      ...READ_ROWS.map(([, , topic]) => topic),
      ...[...html.matchAll(/data-topic="([^"]+)"/g)].map((m) => m[1]),
    ])
    for (const r of roots) expect(help.topics[r], `gốc ${r}`).toBeDefined()
    const seen = new Set<string>()
    const queue = [...roots]
    while (queue.length) {
      const k = queue.pop() as string
      if (seen.has(k) || !help.topics[k]) continue
      seen.add(k)
      queue.push(...(help.topics[k].see ?? []), ...textsOf(help.topics[k]).flatMap(links))
    }
    const unreachable = topicKeys.filter((k) => !seen.has(k))
    expect(unreachable).toEqual([])
  })

  it('mỗi chủ đề có tiêu đề, phần giải thích, và các chủ đề vật lý có lý thuyết và công thức', () => {
    for (const [key, t] of Object.entries(help.topics)) {
      expect(t.title.length, key).toBeGreaterThan(3)
      expect(t.what.length, key).toBeGreaterThan(40)
    }
    for (const key of ['psf', 'airy', 'D', 'lam', 'band', 'eps', 'vanes', 'zernike', 'strehl', 'seg', 'segpiston', 'segtilt']) {
      const t = help.topics[key]
      expect(t.theory?.length, `${key} theory`).toBeGreaterThan(0)
      expect(t.formulas?.length, `${key} formulas`).toBeGreaterThan(0)
      expect(t.refs?.length, `${key} refs`).toBeGreaterThan(0)
    }
  })

  it('mọi công thức biên dịch được bằng KaTeX ở chế độ strict', () => {
    const render = (tex: string, display: boolean) =>
      katex.renderToString(tex, { displayMode: display, throwOnError: true, strict: 'error' })
    for (const [key, t] of Object.entries(help.topics)) {
      for (const [i, f] of (t.formulas ?? []).entries()) {
        expect(() => render(f.tex, true), `${key} công thức ${i + 1}: ${f.tex}`).not.toThrow()
      }
      for (const text of textsOf(t)) {
        for (const tex of inlineMath(text)) expect(() => render(tex, false), `${key} nội tuyến: ${tex}`).not.toThrow()
      }
    }
  })

  it('không có công thức nào mất dấu gạch chéo của TeX', () => {
    // Trong chuỗi JavaScript thường, "\t" thành tab và "\Delta" thành "Delta". Ký tự điều khiển hoặc từ lệnh TeX trần
    // (không có "\" phía trước, bên ngoài \text{...}) trong công thức là dấu hiệu của chuỗi chưa dùng String.raw.
    const bare = /(?<!\\)\b(lambda|theta|pi|Delta|sigma|epsilon|varphi|phi|mathrm|mathcal|frac|rm|times|sqrt|boldsymbol|le|cdot|sum|int|text)\b/
    const mathOf = (text: string) => inlineMath(text).map((m) => m.replace(/\\text\{[^}]*\}/g, ''))
    const formulas = Object.values(help.topics).flatMap((t) => (t.formulas ?? []).map((f) => f.tex.replace(/\\text\{[^}]*\}/g, '')))
    const inline = Object.values(help.topics).flatMap((t) => textsOf(t).flatMap(mathOf))
    for (const tex of [...formulas, ...inline]) expect(bare.test(tex), tex).toBe(false)
    // eslint-disable-next-line no-control-regex
    for (const s of allStrings()) expect(/[\u0000-\u001f]/.test(s), s.slice(0, 60)).toBe(false)
  })

  it('liên kết tham khảo là https', () => {
    for (const t of Object.values(help.topics)) {
      for (const r of t.refs ?? []) {
        expect(r.c.length).toBeGreaterThan(20)
        if (r.u) expect(r.u.startsWith('https://')).toBe(true)
      }
    }
  })

  // Ký tự chỉ có trong tiếng Việt; bỏ é, ã, à vì "Maréchal" hợp lệ trong tiếng Anh.
  const VIETNAMESE = /[ạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịĩọỏốồổỗộớờởỡợụủũứừửữựỳỵỷỹđơưăâêô]/i

  it('toàn bộ nội dung bằng tiếng Anh', () => {
    for (const s of allStrings()) expect(VIETNAMESE.test(s), s.slice(0, 60)).toBe(false)
    const visible = html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ')
    expect(VIETNAMESE.test(visible.replace(/Mai Như Tín/g, ''))).toBe(false)
  })
})

describe('index.html', () => {
  it('có mọi id tĩnh mà mã trang cần và các điều khiển không phải thanh trượt', () => {
    for (const id of REQUIRED_IDS) expect(staticIds.has(id), `#${id}`).toBe(true)
    for (const id of OTHER_CONTROL_IDS) expect(staticIds.has(id), `#${id}`).toBe(true)
  })

  it('mọi id mà mã trang tra cứu đều có trong trang hoặc được sinh ra từ đặc tả', () => {
    const used = [...mainSource.matchAll(/(?:\$|input)(?:<[^>]+>)?\('([^']+)'\)/g)].map((m) => m[1])
    expect(used.length).toBeGreaterThan(20)
    const known = new Set([...staticIds, ...rangeIds])
    for (const id of used) expect(known.has(id), `#${id}`).toBe(true)
  })

  it('nạp script theo thứ tự: mã trang dựng điều khiển trước, rồi help.js, KaTeX, explain.js', () => {
    const at = (name: string) => html.indexOf(`src="${name}"`)
    expect(at('telescope-psf.js')).toBeGreaterThan(0)
    expect(at('telescope-psf.js')).toBeLessThan(at('help.js'))
    expect(at('help.js')).toBeLessThan(at('../shared/katex/katex.min.js'))
    expect(at('../shared/katex/katex.min.js')).toBeLessThan(at('../shared/explain.js'))
  })

  it('có điều hướng, liên kết quay lại, chân trang và thẻ meta như các trang khác', () => {
    expect(html).toContain('<a class="active" href="../../simulations">Simulations</a>')
    expect(html).toContain('← All simulations')
    expect(html).toContain('<footer class="container">')
    expect(html).toContain('og:image')
    expect(html).toContain('<title>Telescope Point Spread Function | Tin Mai (Mai Như Tín)</title>')
    expect(html).toContain('<h2 id="t-notes">What to look for</h2>')
  })

  it('không còn phần tử không có id đúng cho canvas và có nhãn truy cập', () => {
    for (const id of ['psf', 'pupil', 'profile']) {
      expect(html).toMatch(new RegExp(`<canvas id="${id}" role="img" aria-label="[^"]{30,}"`))
    }
  })
})

describe('tệp sinh ra', () => {
  it('telescope-psf.js và psf-worker.js có dòng chú thích "Generated" và nhau khớp tên tệp worker', () => {
    const main = read('telescope-psf.js')
    const worker = read('psf-worker.js')
    expect(main.startsWith('/* Generated from psf-simulator/src/site/main.ts')).toBe(true)
    expect(worker.startsWith('/* Generated from psf-simulator/src/workers/psf.worker.ts')).toBe(true)
    expect(main).toMatch(/new Worker\(["']psf-worker\.js["']\)/)
  })
})
