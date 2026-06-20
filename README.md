# terraform-drift-contract

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

The **single source of truth** for parsing a Terraform/OpenTofu plan JSON
(`terraform show -json` / `tofu show -json`) into Terraform State Manager (TSM)
drift counts + a changed-resource summary.

One tiny package, consumed (and bundled) by every drift implementation so they
cannot diverge:

- [`terraform-drift-report`](https://github.com/sethbacon/terraform-drift-report) — the GitHub Action
- the Azure DevOps `TerraformDriftReport` task (`azure-pipelines-terraform`, initiative 6)
- kept in lockstep with the backend's Go `internal/services/driftingest` and the
  jq in the dispatched CI templates, via the vendored golden fixtures.

## API

```ts
import { summarize, moduleCallsPlan, type Plan, type Result } from 'terraform-drift-contract'

const plan: Plan = JSON.parse(fs.readFileSync('plan.json', 'utf8'))
const r: Result = summarize(plan)
// r = { added, changed, destroyed, drifted, summary: [{ address, actions }] }
```

### Semantics (must match `drift_summary.py` exactly)

- `added` / `changed` / `destroyed` = resources whose actions **contain**
  create / update / delete (a replacement `["delete","create"]` counts as
  **both** added and destroyed; counts are **not** mutually exclusive — use
  `summary.length` for a distinct resource count);
- `summary` = every change whose actions are **not exactly** `["no-op"]` or
  `["read"]`, as `{address, actions, attrs?}`;
- `attrs` (in-place updates/replaces only) = the top-level keys whose value
  differs, each `{name, before, after}` with values run through `fmt()`
  (300 code-point truncation, U+2026 marker) and masked to the literal
  `"(sensitive)"` when `before_sensitive`/`after_sensitive` marks them
  (terraform `-json` does **not** pre-mask — masking happens here, before
  `fmt()`, so secrets never reach the formatter);
- `drifted` = `(added + changed + destroyed) > 0` (a pure replace has
  `changed == 0` but `drifted == true`; do not infer "no drift" from
  `changed == 0`).

## Consuming it (no registry required)

Both consumers `ncc`-bundle this package, so it is a **build-time only**
dependency — installed straight from git, no npm/GitHub-Packages auth:

```jsonc
// package.json of a consumer
"dependencies": {
  "terraform-drift-contract": "github:sethbacon/terraform-drift-contract#v1.0.0"
}
```

`dist/` is committed, so the git install needs no build step.

## Contract

The fixtures in `__tests__/fixtures/*.json` are vendored from the backend's
`driftingest` tests; the asserted numbers match
`internal/services/driftingest/plan_test.go`. **If the backend semantics change,
update the fixtures here in the same change** — every consumer pulls from here.

## Development

```bash
npm install
npm test        # vitest contract tests
npm run build   # tsc → dist/  (commit the result)
```

## License

Apache-2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).
