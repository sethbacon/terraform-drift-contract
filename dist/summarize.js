"use strict";
// Canonical TypeScript port of the TSM drift summarizer (drift_summary.py) — the
// single source of truth for parsing Terraform/OpenTofu plan JSON into the TSM
// drift callback payload. Consumed (and ncc-bundled) by the terraform-drift-report
// GitHub Action and the Azure DevOps TerraformDriftReport task, and reconciled
// with the backend's internal/services/driftingest (Go).
//
// Semantics MUST match drift_summary.py exactly:
//   - skip resource changes whose actions are EXACTLY ["no-op"] or ["read"];
//   - counts are replace-aware and NOT mutually exclusive: a replacement
//     ["delete","create"] bumps BOTH added and destroyed (changed only on
//     "update"), matching terraform's "X to add, Y to change, Z to destroy";
//   - drifted = (added + changed + destroyed) > 0;
//   - for in-place updates/replaces (before & after both objects), emit `attrs`:
//     the top-level keys whose value differs, with before/after run through
//     fmt() (300-char truncation, U+2026 marker) and masked to the literal
//     "(sensitive)" when before_sensitive/after_sensitive marks them.
//
// terraform -json does NOT mask sensitive values (only human output does), so
// masking happens here, BEFORE fmt(), so secrets never reach the formatter.
Object.defineProperty(exports, "__esModule", { value: true });
exports.fmt = fmt;
exports.isSens = isSens;
exports.summarize = summarize;
exports.moduleCallsPlan = moduleCallsPlan;
/** Python `bool(x)` truthiness (empty dict/list/string → false), unlike JS. */
function pyBool(v) {
    if (v === null || v === undefined || v === false)
        return false;
    if (v === true)
        return true;
    if (typeof v === 'number')
        return v !== 0;
    if (typeof v === 'string')
        return v.length > 0;
    if (Array.isArray(v))
        return v.length > 0;
    if (typeof v === 'object')
        return Object.keys(v).length > 0;
    return Boolean(v);
}
/** Deterministic JSON with sorted keys + compact separators — matches python
 *  json.dumps(v, separators=(",",":"), sort_keys=True). */
function stableStringify(v) {
    if (v === null || typeof v !== 'object')
        return JSON.stringify(v);
    if (Array.isArray(v))
        return '[' + v.map(stableStringify).join(',') + ']';
    const keys = Object.keys(v).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
}
/** Deep equality for JSON values (key order independent), matching python `==`. */
function jsonEqual(a, b) {
    return stableStringify(a) === stableStringify(b);
}
/** Verbatim port of drift_summary.py `fmt`: strings pass through raw, everything
 *  else is compact sorted JSON; truncate past 300 code points with U+2026. */
function fmt(v) {
    if (v === null || v === undefined)
        return null;
    const s = typeof v === 'string' ? v : stableStringify(v);
    const cps = Array.from(s); // code points, matching python len()/slice
    return cps.length <= 300 ? s : cps.slice(0, 300).join('') + '…';
}
/** Verbatim port of drift_summary.py `is_sens`: before_sensitive/after_sensitive
 *  mirror the value shape; True (or a non-empty nested dict/list) → mask. */
function isSens(sens, k) {
    if (typeof sens !== 'object' || sens === null || Array.isArray(sens)) {
        return pyBool(sens);
    }
    const sv = sens[k];
    return sv === true || (typeof sv === 'object' && sv !== null && pyBool(sv));
}
function has(actions, action) {
    return Array.isArray(actions) && actions.includes(action);
}
/** Exactly ["no-op"] or ["read"] — the only skipped action lists. */
function isSkipped(actions) {
    return actions.length === 1 && (actions[0] === 'no-op' || actions[0] === 'read');
}
function summarize(plan) {
    const summary = [];
    let added = 0;
    let changed = 0;
    let destroyed = 0;
    for (const c of plan?.resource_changes ?? []) {
        const ch = c.change ?? {};
        const actions = ch.actions ?? [];
        if (isSkipped(actions))
            continue;
        const item = { address: c.address ?? '', actions };
        const before = ch.before;
        const after = ch.after;
        if (before !== null && typeof before === 'object' && !Array.isArray(before) &&
            after !== null && typeof after === 'object' && !Array.isArray(after)) {
            const bs = ch.before_sensitive ?? {};
            const as_ = ch.after_sensitive ?? {};
            const bObj = before;
            const aObj = after;
            const attrs = [];
            for (const k of Array.from(new Set([...Object.keys(bObj), ...Object.keys(aObj)])).sort()) {
                if (jsonEqual(bObj[k], aObj[k]))
                    continue;
                attrs.push({
                    name: k,
                    before: isSens(bs, k) ? '(sensitive)' : fmt(bObj[k]),
                    after: isSens(as_, k) ? '(sensitive)' : fmt(aObj[k]),
                });
            }
            if (attrs.length > 0)
                item.attrs = attrs;
        }
        summary.push(item);
        if (has(actions, 'create'))
            added++;
        if (has(actions, 'update'))
            changed++;
        if (has(actions, 'delete'))
            destroyed++;
    }
    return { added, changed, destroyed, drifted: added + changed + destroyed > 0, summary };
}
/** Forwards only `configuration.root_module.module_calls` for the optional
 *  module-provenance field the backend accepts on dispatched runs. Not part of
 *  drift_summary.py (which omits provenance); orthogonal to the summary. */
function moduleCallsPlan(plan) {
    return {
        configuration: {
            root_module: {
                module_calls: plan?.configuration?.root_module?.module_calls ?? {},
            },
        },
    };
}
