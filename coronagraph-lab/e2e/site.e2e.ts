/**
 * End-to-end tests of simulations/coronagraph-lab in Chromium (Playwright), desktop and mobile viewports.
 * A tiny static server serves the repository root, as GitHub Pages does.
 */
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { type Browser, type Page, chromium, devices } from 'playwright'

const ROOT = resolve(import.meta.dirname, '../..')
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' }
const CORONAGRAPHS = ['none', 'lyot', 'aplc', 'bandlimited', 'shaped', 'roddier', 'fqpm', 'vortex', 'app']

let server: Server, base = '', browser: Browser

before(async () => {
  server = createServer(async (req, res) => {
    let path = decodeURIComponent((req.url ?? '/').split('?')[0])
    if (path.endsWith('/')) path += 'index.html'
    const file = normalize(join(ROOT, path))
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return }
    try { res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(await readFile(file)) } catch { res.writeHead(404).end() }
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const a = server.address()
  base = `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}/simulations/coronagraph-lab/`
  browser = await chromium.launch()
})
after(async () => { await browser?.close(); server?.close() })

async function open(viewport: 'desktop' | 'mobile'): Promise<{ page: Page; errors: string[] }> {
  const ctx = await browser.newContext(viewport === 'desktop' ? { viewport: { width: 1400, height: 1000 } } : { ...devices['iPhone 13'] })
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(base)
  await waitFrames(page, 1)
  return { page, errors }
}

const counts = (page: Page) => page.evaluate(() => {
  const s = (window as unknown as { CoronagraphLab: { state: { frames: number; wfsCount: number } } }).CoronagraphLab.state
  return { frames: s.frames, wfs: s.wfsCount }
})
async function waitFrames(page: Page, n: number, key: 'frames' | 'wfs' = 'frames', timeout = 120000): Promise<void> {
  await page.waitForFunction(([k, m]) => ((window as unknown as { CoronagraphLab?: { state: Record<string, number> } }).CoronagraphLab?.state[k as string] ?? -1) >= (m as number), [key === 'wfs' ? 'wfsCount' : 'frames', n], { timeout })
}

/** Number of distinct pixel values of a canvas (> 1 means the picture is not blank). */
const distinct = (page: Page, sel: string) => page.$eval(sel, (c) => {
  const cv = c as HTMLCanvasElement
  const d = cv.getContext('2d')?.getImageData(0, 0, cv.width, cv.height).data ?? new Uint8ClampedArray()
  const set = new Set<number>()
  for (let i = 0; i < d.length && set.size < 50; i += 16) set.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2])
  return set.size
})

/** Show the tab panel that holds a control or a result. */
const tab = (page: Page, panel: string) => page.click(`[role=tab][aria-controls="${panel}"]`)

async function select(page: Page, id: string, value: string): Promise<void> {
  if (id === 'wfs') await tab(page, 'par-sense')
  else if (id === 'cor') await tab(page, 'par-inst')
  const c = await counts(page)
  await page.selectOption(`#${id}`, value)
  await waitFrames(page, c.frames + 1)
}

describe('desktop', () => {
  it('loads with no console errors, renders the diagram, the image, the info panels and the bibliography', async () => {
    const { page, errors } = await open('desktop')
    assert.equal(await page.title(), 'Coronagraph Lab | Tin Mai (Mai Như Tín)')
    for (const p of ['A', 'DM', 'B', 'C', 'D', 'WFS']) assert.equal(await page.locator(`#diagram [data-plane="${p}"]`).count(), 1)
    assert.ok((await distinct(page, '#image')) > 5)
    await page.waitForFunction(() => document.querySelectorAll('#bib li').length > 0)
    const refs = await page.locator('#bib li').count()
    assert.ok(refs >= 25, `bibliography has ${refs} entries`)
    assert.ok((await page.locator('#info-cor h3').textContent())?.length)
    assert.ok((await page.locator('#info-wfs h3').textContent())?.length)
    // Each info card opens its theory in a dialog; every citation there points to a bibliography entry.
    for (const slot of ['info-cor', 'info-wfs', 'info-ctl']) {
      await page.click(`#${slot} .info-more`)
      await page.waitForSelector('#info-dlg[open]')
      const hrefs = await page.locator('#info-dlg .info-refs a').evaluateAll((as) => as.map((a) => a.getAttribute('href')))
      assert.ok(hrefs.length > 0, `${slot}: no sources`)
      for (const href of hrefs) assert.equal(await page.locator(href as string).count(), 1, `missing ${href}`)
      await page.click('#info-close')
    }
    // A citation link closes the dialog and unfolds the bibliography at that entry.
    await page.click('#info-cor .info-more')
    await page.click('#info-dlg .info-refs a >> nth=0')
    await page.waitForSelector('#info-dlg', { state: 'hidden' })
    assert.equal(await page.$eval('#p-bib', (d) => (d as HTMLDetailsElement).open), true)
    assert.deepEqual(errors, [])
  })

  it('every formula and inline TeX of the help topics compiles in KaTeX (strict)', async () => {
    const { page } = await open('desktop')
    const bad = await page.evaluate(() => {
      const w = window as unknown as { SIM_HELP: { topics: Record<string, { what: string; theory: string[]; sim: string; formulas: { tex: string }[] }> }; katex: { renderToString(t: string, o: object): string } }
      const out: string[] = []
      const tryTex = (k: string, t: string, display: boolean) => { try { w.katex.renderToString(t, { throwOnError: true, strict: 'error', displayMode: display }) } catch (e) { out.push(`${k}: ${String(e).slice(0, 120)}`) } }
      for (const [k, t] of Object.entries(w.SIM_HELP.topics)) {
        for (const f of t.formulas) tryTex(k, f.tex, true)
        for (const s of [t.what, t.sim, ...t.theory]) for (const m of s.match(/\$[^$]+\$/g) ?? []) tryTex(k, m.slice(1, -1), false)
      }
      return out
    })
    assert.deepEqual(bad, [])
  })

  it('the Beginner/Expert toggle shows and hides the expert controls and phase maps', async () => {
    const { page } = await open('desktop')
    assert.equal(await page.locator('#lam').isVisible(), false)
    assert.equal(await page.locator('#p-tour').isVisible(), true)
    await page.click('label[for=mode-expert]')
    assert.equal(await page.locator('#lam').isVisible(), true)
    assert.equal(await page.locator('#p-tour').isVisible(), false)
    assert.ok(await page.locator('#strip [data-plane="A"] figcaption', { hasText: 'Phase before' }).count())
    await page.click('#info-cor .info-more')
    assert.ok(await page.locator('#info-dlg .formula-box .katex').count())
    await page.click('#info-close')
    await page.click('label[for=mode-beginner]')
    assert.equal(await page.locator('#lam').isVisible(), false)
  })

  it('a parameter change updates the image and the thumbnails', async () => {
    const { page } = await open('desktop')
    await select(page, 'cor', 'lyot')
    const before = await page.$eval('#image', (c) => (c as HTMLCanvasElement).toDataURL())
    const thumbBefore = await page.$eval('#strip [data-plane="B"] canvas', (c) => (c as HTMLCanvasElement).toDataURL())
    await select(page, 'cor', 'vortex')
    assert.notEqual(await page.$eval('#image', (c) => (c as HTMLCanvasElement).toDataURL()), before)
    assert.notEqual(await page.$eval('#strip [data-plane="B"] canvas', (c) => (c as HTMLCanvasElement).toDataURL()), thumbBefore)
    const c = await counts(page)
    await page.$eval('#p1-sep', (el) => { const i = el as HTMLInputElement; i.value = '8'; i.dispatchEvent(new Event('input', { bubbles: true })) })
    await waitFrames(page, c.frames + 1)
    assert.match((await page.locator('#p1-sep + output').textContent()) ?? '', /8\.00/)
  })

  for (const wfs of ['shack-hartmann', 'pairwise']) {
    it(`every coronagraph with the ${wfs} sensor renders the diagram, images and sensor views`, async () => {
      const { page, errors } = await open('desktop')
      await page.click('label[for=mode-expert]')
      await page.$eval('#screen', (el) => { const i = el as HTMLInputElement; i.value = '8'; i.dispatchEvent(new Event('input', { bubbles: true })) })
      await select(page, 'wfs', wfs)
      await tab(page, 'par-inst')
      await tab(page, 'res-wfs')
      for (const kind of CORONAGRAPHS) {
        const c = await counts(page)
        await page.selectOption('#cor', kind)
        await waitFrames(page, c.frames + 1)
        await waitFrames(page, c.wfs + 1, 'wfs', 180000)
        const label = await page.locator('#diagram [data-plane="WFS"] text.lbl').textContent()
        assert.ok(label && label.length > 3, `${kind}: WFS box label`)
        assert.ok((await distinct(page, '#image')) > 3, `${kind}: blank detector image`)
        assert.ok((await distinct(page, '#strip [data-plane="A"] canvas')) > 1, `${kind}: blank plane A thumbnail`)
        assert.ok((await distinct(page, '#wfs-views canvas')) > 1, `${kind}: blank WFS raw signal`)
        assert.ok((await page.locator('#wfs-views canvas').count()) >= 3, `${kind}: WFS estimate and truth views`)
        // The diagram adapts: apodizer for the APLC, no focal mask for the APP and the shaped pupil.
        const svg = (await page.locator('#diagram').innerHTML())
        if (kind === 'aplc') assert.match(svg, /apodizer/)
        if (kind === 'app' || kind === 'shaped' || kind === 'none') assert.match(svg, /no mask/)
      }
      assert.deepEqual(errors, [])
    })
  }

  it('a focal-plane loop digs a dark hole and the plot updates', async () => {
    const { page } = await open('desktop')
    await page.click('label[for=mode-expert]')
    await select(page, 'cor', 'lyot')
    await page.$eval('#screen', (el) => { const i = el as HTMLInputElement; i.value = '8'; i.dispatchEvent(new Event('input', { bubbles: true })) })
    await select(page, 'wfs', 'pairwise')
    await tab(page, 'res-loop')
    await page.fill('#loop-n', '4')
    await page.click('#loop-run')
    await page.waitForFunction(() => /Done/.test(document.getElementById('loop-status')?.textContent ?? ''), null, { timeout: 180000 })
    const h = await page.evaluate(() => (window as unknown as { CoronagraphLab: { state: { history: { contrast: number }[] } } }).CoronagraphLab.state.history.map((p) => p.contrast))
    assert.equal(h.length, 5)
    assert.ok(h[4] < h[0] / 10, `contrast ${h[0]} → ${h[4]}`)
    assert.ok((await distinct(page, '#loop-c')) > 3)
  })

  it('clicking quickly through the tour still runs the last step’s loop (EFC dark hole)', async () => {
    const { page } = await open('desktop')
    for (let i = 0; i < 6; i++) await page.click('#tour-next')
    assert.match((await page.textContent('#tour-title')) ?? '', /^7\./)
    await page.waitForFunction(() => /Done: 8 iterations/.test(document.getElementById('loop-status')?.textContent ?? ''), null, { timeout: 180000 })
    const h = await page.evaluate(() => (window as unknown as { CoronagraphLab: { state: { history: { contrast: number }[] } } }).CoronagraphLab.state.history.map((p) => p.contrast))
    assert.ok(h.at(-1)! < h[0] / 100, `contrast ${h[0]} → ${h.at(-1)}`)
  })

  it('tour variations show their state, can be undone one by one, and the step can be reset', async () => {
    const { page } = await open('desktop')
    for (let i = 0; i < 3; i++) { const c = await counts(page); await page.click('#tour-next'); await waitFrames(page, c.frames + 1) }
    assert.equal(await page.isChecked('#var-pupil-circular'), true)
    assert.equal(await page.getAttribute('#var-errors', 'aria-pressed'), 'true')
    assert.equal(await page.isDisabled('#var-reset'), true)
    let c = await counts(page)
    await page.click('label[for=var-pupil-obscured]')
    await waitFrames(page, c.frames + 1)
    assert.equal(await page.isChecked('#var-pupil-obscured'), true)
    assert.match((await page.textContent('#var-status')) ?? '', /obscured/i)
    c = await counts(page)
    await page.click('#var-errors')
    await waitFrames(page, c.frames + 1)
    assert.equal(await page.getAttribute('#var-errors', 'aria-pressed'), 'false')
    await page.click('#var-errors')
    assert.equal(await page.getAttribute('#var-errors', 'aria-pressed'), 'true')
    c = await counts(page)
    await page.click('#var-reset')
    await waitFrames(page, c.frames + 1)
    assert.equal(await page.isChecked('#var-pupil-circular'), true)
    assert.equal(await page.isDisabled('#var-reset'), true)
    assert.match((await page.textContent('#var-status')) ?? '', /as designed/)
  })

  it('planes open in a large view by keyboard, theory dialogs open from the info buttons', async () => {
    const { page } = await open('desktop')
    await page.focus('#diagram [data-plane="C"]')
    await page.keyboard.press('Enter')
    await page.waitForSelector('#plane-dlg[open]')
    assert.match((await page.textContent('#plane-title')) ?? '', /Lyot stop/)
    assert.ok((await page.locator('#plane-body canvas').count()) >= 2)
    await page.keyboard.press('Escape')
    await page.waitForSelector('#plane-dlg', { state: 'hidden' })
    await page.click('#t-train .i-btn')
    await page.waitForSelector('dialog.sim-dialog[open]')
    assert.ok(((await page.textContent('#dlg-title')) ?? '').length > 3)
  })
})

describe('mobile', () => {
  it('loads with no console errors and no horizontal scrolling; the tour and the diagram are usable', async () => {
    const { page, errors } = await open('mobile')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    assert.ok(overflow <= 1, `horizontal overflow ${overflow}px`)
    assert.equal(await page.locator('#diagram svg').isVisible(), true)
    assert.ok((await distinct(page, '#image')) > 5)
    const c = await counts(page)
    await page.click('#tour-next')
    await waitFrames(page, c.frames + 1)
    assert.match((await page.textContent('#tour-title')) ?? '', /^2\./)
    assert.deepEqual(errors, [])
  })
})
