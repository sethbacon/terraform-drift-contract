import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { summarize, moduleCallsPlan, Plan } from '../src/summarize'

const load = (name: string): Plan =>
  JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'))

// These fixtures are vendored from the backend's driftingest tests. The numbers
// below MUST match internal/services/driftingest/plan_test.go — that is the
// whole point of the shared-fixture contract.
describe('summarize (TSM drift contract)', () => {
  it('matches the backend on a mixed plan: +2 ~1 -2, summary excludes only no-op', () => {
    const r = summarize(load('mixed.json'))
    expect([r.added, r.changed, r.destroyed]).toEqual([2, 1, 2])
    expect(r.summary).toHaveLength(5) // everything except the no-op
    const replaced = r.summary.find((e) => e.address === 'aws_instance.replaced')
    expect(replaced?.actions).toEqual(['delete', 'create']) // counts as add AND destroy
    expect(r.drifted).toBe(true)
  })

  it('treats a no-op-only plan as clean', () => {
    const r = summarize(load('clean.json'))
    expect([r.added, r.changed, r.destroyed]).toEqual([0, 0, 0])
    expect(r.summary).toEqual([])
    expect(r.drifted).toBe(false)
  })

  it('keeps a read-only refresh in the summary but counts nothing and is not drift', () => {
    const r = summarize(load('read-only.json'))
    expect(r.added + r.changed + r.destroyed).toBe(0)
    expect(r.summary).toHaveLength(1) // appears in summary (matches jq)
    expect(r.drifted).toBe(false) // but a pure read is not reported as drift
  })

  it('is null-safe (empty, not-drifted, summary is an array)', () => {
    const r = summarize(null)
    expect(r.drifted).toBe(false)
    expect(r.summary).toEqual([])
  })

  it('forwards only the module_calls subdocument for provenance', () => {
    const plan = load('mixed.json')
    expect(moduleCallsPlan(plan)).toEqual({
      configuration: { root_module: { module_calls: { vpc: { source: 'myorg/vpc/aws', version_constraint: '~> 5.0' } } } },
    })
    expect(moduleCallsPlan(null)).toEqual({ configuration: { root_module: { module_calls: {} } } })
  })
})
