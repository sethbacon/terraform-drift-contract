import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { summarize, moduleCallsPlan, fmt, isSens, Plan } from '../src/summarize'

const load = (name: string): Plan =>
  JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'))

// These assertions mirror drift_summary.py (the authoritative dispatch
// summarizer) and the reconciled backend driftingest. Keep them in lockstep.
describe('summarize — counts, skip rules, drifted', () => {
  it('mixed plan: +2 ~1 -2, drifted, no-op AND read both excluded from summary', () => {
    const r = summarize(load('mixed.json'))
    expect([r.added, r.changed, r.destroyed]).toEqual([2, 1, 2])
    expect(r.drifted).toBe(true)
    // new, tweak, gone, replaced — NOT same(no-op) and NOT data.aws_ami.x(read)
    expect(r.summary.map((e) => e.address)).toEqual([
      'aws_instance.new',
      'aws_instance.tweak',
      'aws_instance.gone',
      'aws_instance.replaced',
    ])
    expect(r.summary.find((e) => e.address === 'aws_instance.replaced')?.actions).toEqual(['delete', 'create'])
  })

  it('no-op-only plan is clean', () => {
    const r = summarize(load('clean.json'))
    expect([r.added, r.changed, r.destroyed, r.drifted]).toEqual([0, 0, 0, false])
    expect(r.summary).toEqual([])
  })

  it('read-only plan is clean and produces an EMPTY summary (read is skipped)', () => {
    const r = summarize(load('read-only.json'))
    expect(r.drifted).toBe(false)
    expect(r.summary).toEqual([])
  })

  it('is null-safe', () => {
    const r = summarize(null)
    expect(r).toEqual({ added: 0, changed: 0, destroyed: 0, drifted: false, summary: [] })
  })
})

describe('summarize — attrs extraction + sensitive masking', () => {
  const tweak = () => summarize(load('mixed.json')).summary.find((e) => e.address === 'aws_instance.tweak')!

  it('emits only changed top-level keys (unchanged nested object is skipped via deep equality)', () => {
    expect(tweak().attrs?.map((a) => a.name)).toEqual(['instance_type', 'password']) // tags unchanged → absent
  })

  it('masks sensitive values to the literal "(sensitive)" and formats the rest', () => {
    const attrs = tweak().attrs!
    expect(attrs.find((a) => a.name === 'instance_type')).toEqual({ name: 'instance_type', before: 't3.micro', after: 't3.large' })
    expect(attrs.find((a) => a.name === 'password')).toEqual({ name: 'password', before: '(sensitive)', after: '(sensitive)' })
  })

  it('pure create (before=null) and pure delete (after=null) get no attrs', () => {
    const s = summarize(load('mixed.json')).summary
    expect(s.find((e) => e.address === 'aws_instance.new')?.attrs).toBeUndefined()
    expect(s.find((e) => e.address === 'aws_instance.gone')?.attrs).toBeUndefined()
  })
})

describe('fmt + isSens (verbatim parity helpers)', () => {
  it('fmt passes strings through, compacts+sorts objects, truncates at 300 with U+2026', () => {
    expect(fmt(null)).toBeNull()
    expect(fmt('short')).toBe('short')
    expect(fmt({ b: 1, a: 2 })).toBe('{"a":2,"b":1}') // sorted keys, compact
    const long = 'x'.repeat(305)
    const out = fmt(long)!
    expect(Array.from(out).length).toBe(301) // 300 + the … marker
    expect(out.endsWith('…')).toBe(true)
  })

  it('isSens follows python bool semantics (True / non-empty nested → mask)', () => {
    expect(isSens({ k: true }, 'k')).toBe(true)
    expect(isSens({ k: false }, 'k')).toBe(false)
    expect(isSens({ k: { nested: true } }, 'k')).toBe(true) // non-empty nested dict
    expect(isSens({ k: {} }, 'k')).toBe(false) // empty dict → not sensitive
    expect(isSens(true, 'anything')).toBe(true) // whole-value sensitive
    expect(isSens({}, 'missing')).toBe(false)
  })
})

describe('moduleCallsPlan', () => {
  it('forwards only the module_calls subdocument', () => {
    expect(moduleCallsPlan(load('mixed.json'))).toEqual({
      configuration: { root_module: { module_calls: { vpc: { source: 'myorg/vpc/aws', version_constraint: '~> 5.0' } } } },
    })
    expect(moduleCallsPlan(null)).toEqual({ configuration: { root_module: { module_calls: {} } } })
  })
})
