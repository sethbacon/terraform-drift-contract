// Canonical TypeScript implementation of the TSM drift contract — the single
// source of truth consumed (bundled) by the terraform-drift-report GitHub Action
// and the Azure DevOps TerraformDriftReport task. Count semantics MUST stay
// identical to the backend's internal/services/driftingest/plan.go `Summarize`
// and the jq the dispatched CI templates run, so ingested, ADO-dispatched, and
// GitHub-dispatched drift render the same:
//
//   added/changed/destroyed = count of resource_changes whose actions CONTAIN
//     create/update/delete (so a replacement ["delete","create"] counts as BOTH
//     added and destroyed);
//   summary = every change whose actions are NOT exactly ["no-op"], as
//     {address, actions}.
//
// The golden fixtures in __tests__/fixtures are vendored from the backend so the
// implementations cannot drift apart (see README, "Contract").

/** The subset of a `terraform show -json` / `tofu show -json` document we read. */
export interface Plan {
  resource_changes?: ResourceChange[]
  configuration?: {
    root_module?: {
      module_calls?: Record<string, unknown>
    }
  }
}

export interface ResourceChange {
  address: string
  change: { actions: string[] }
}

export interface SummaryEntry {
  address: string
  actions: string[]
}

export interface Result {
  added: number
  changed: number
  destroyed: number
  drifted: boolean
  summary: SummaryEntry[]
}

function has(actions: string[], action: string): boolean {
  return Array.isArray(actions) && actions.includes(action)
}

/** Classifies each resource change exactly as the backend's `Summarize` does. */
export function summarize(plan: Plan | null | undefined): Result {
  const summary: SummaryEntry[] = []
  let added = 0
  let changed = 0
  let destroyed = 0

  for (const rc of plan?.resource_changes ?? []) {
    const actions = rc.change?.actions ?? []
    if (has(actions, 'create')) added++
    if (has(actions, 'update')) changed++
    if (has(actions, 'delete')) destroyed++
    // Exactly ["no-op"] is excluded from the summary (jq `!= ["no-op"]`).
    if (actions.length === 1 && actions[0] === 'no-op') continue
    summary.push({ address: rc.address, actions })
  }

  return { added, changed, destroyed, drifted: isDrifted(summary), summary }
}

// `drifted` decision (initiative-6 spike): the dispatched runner derives drifted
// from `plan -detailed-exitcode == 2`, which a plan-JSON consumer cannot see. We
// define drift as any summary entry carrying an action other than no-op/read, so
// a pure read-only refresh is not reported as drift while every create/update/
// delete/replace is. The backend defaults drifted = added+changed+destroyed > 0
// when the field is absent; we always send the field, so this rule governs.
function isDrifted(summary: SummaryEntry[]): boolean {
  return summary.some((e) => e.actions.some((a) => a !== 'no-op' && a !== 'read'))
}

/**
 * Extracts the module-provenance subdocument the backend expects in the callback
 * `plan` field: just `configuration.root_module.module_calls`. The backend parses
 * registry-module refs from it; we only forward it (matching the template jq).
 */
export function moduleCallsPlan(plan: Plan | null | undefined): unknown {
  return {
    configuration: {
      root_module: {
        module_calls: plan?.configuration?.root_module?.module_calls ?? {},
      },
    },
  }
}
