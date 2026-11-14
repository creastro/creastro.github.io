/**
 * `npm run verify`: every check of Coronagraph Lab, in order, stopping at the first failure (non-zero exit).
 *   1. type check and lint   2. physics unit tests   3. citation check   4. production build   5. end-to-end tests
 */
import { spawnSync } from 'node:child_process'

const steps: [string, string[]][] = [
  ['1/5 Type check', ['npx', 'tsc', '-b']],
  ['1/5 Lint', ['npx', 'oxlint', '--deny-warnings']],
  ['2/5 Physics unit tests', ['npx', 'vitest', 'run']],
  ['3/5 Citation check', ['node', '--experimental-strip-types', '--no-warnings', 'scripts/check-citations.ts']],
  ['4/5 Production build', ['npm', 'run', '-s', 'build:site']],
  ['5/5 End-to-end browser tests', ['node', '--experimental-strip-types', '--no-warnings', '--test', '--test-reporter=spec', 'e2e/site.e2e.ts']],
]

const t0 = Date.now()
for (const [name, [cmd, ...args]] of steps) {
  console.log(`\n=== ${name}: ${[cmd, ...args].join(' ')}`)
  const t = Date.now()
  const r = spawnSync(cmd, args, { stdio: 'inherit' })
  if (r.status !== 0) {
    console.error(`\n✗ ${name} failed (exit ${r.status ?? r.signal}).`)
    process.exit(r.status || 1)
  }
  console.log(`✓ ${name} (${((Date.now() - t) / 1000).toFixed(1)} s)`)
}
console.log(`\nAll checks passed in ${((Date.now() - t0) / 1000).toFixed(0)} s.`)
