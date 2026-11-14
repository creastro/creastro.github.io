/**
 * Citation check (step 3 of `npm run verify`):
 * - every reference has complete fields and a well-formed DOI, unique keys and DOIs;
 * - no reference is flagged as unverified (each records where it was checked);
 * - every coronagraph, wavefront sensor and control algorithm has an info panel citing ≥ 1 peer-reviewed article;
 * - every cited key exists.
 * Exits non-zero with a list of problems.
 */
import { CORONAGRAPH_KINDS } from '../src/lib/coronagraph.ts'
import { FOCAL_WFS_KINDS, PUPIL_WFS_KINDS } from '../src/lib/wfs/types.ts'
import { CORONAGRAPH_INFO } from '../src/content/coronagraphInfo.ts'
import { CONTROL_INFO, SENSOR_INFO } from '../src/content/sensorInfo.ts'
import { REFERENCES } from '../src/content/references.ts'

const problems: string[] = []
const DOI = /^10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+$/
const keys = new Set<string>()
const dois = new Set<string>()
for (const r of REFERENCES) {
  const where = `reference ${r.key || '(no key)'}`
  for (const f of ['key', 'title', 'journal', 'volume', 'pages', 'doi', 'checkedAgainst'] as const) {
    if (typeof r[f] !== 'string' || r[f].trim() === '') problems.push(`${where}: missing ${f}`)
  }
  if (!Array.isArray(r.authors) || r.authors.length === 0 || r.authors.some((a) => !/^[^,]+, .+/.test(a))) problems.push(`${where}: authors must be "Last, I." entries`)
  if (!Number.isInteger(r.year) || r.year < 1800 || r.year > 2026) problems.push(`${where}: bad year ${r.year}`)
  if (!DOI.test(r.doi)) problems.push(`${where}: malformed DOI "${r.doi}"`)
  if (/unverified|todo|\?/i.test(r.checkedAgainst)) problems.push(`${where}: flagged as unverified`)
  if (keys.has(r.key)) problems.push(`${where}: duplicate key`)
  if (dois.has(r.doi.toLowerCase())) problems.push(`${where}: duplicate DOI`)
  keys.add(r.key); dois.add(r.doi.toLowerCase())
}

const peer = new Set(REFERENCES.filter((r) => r.peerReviewed).map((r) => r.key))
const all = [...CORONAGRAPH_INFO, ...SENSOR_INFO, ...CONTROL_INFO]
for (const e of all) {
  for (const k of e.refs) if (!keys.has(k)) problems.push(`panel ${e.id}: unknown reference ${k}`)
  if (!e.refs.some((k) => peer.has(k))) problems.push(`panel ${e.id}: no peer-reviewed reference`)
  for (const f of ['name', 'beginner', 'sim'] as const) if (!e[f]) problems.push(`panel ${e.id}: missing ${f}`)
  if (!e.expert.length || !e.formulas.length || !e.strengths.length || !e.limitations.length || !e.instruments.length) problems.push(`panel ${e.id}: incomplete sections`)
}
const ids = new Set(all.map((e) => e.id))
for (const k of [...CORONAGRAPH_KINDS, ...PUPIL_WFS_KINDS, ...FOCAL_WFS_KINDS, 'ao', 'efc', 'speckle-nulling']) {
  if (!ids.has(k)) problems.push(`no info panel for ${k}`)
}

if (problems.length) {
  console.error(`Citation check failed (${problems.length}):\n  ` + problems.join('\n  '))
  process.exit(1)
}
console.log(`Citation check passed: ${REFERENCES.length} references (${peer.size} peer-reviewed), ${all.length} panels.`)
