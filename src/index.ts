// Public surface of the TSM drift contract. The single source of truth for the
// count/summary semantics shared by every drift consumer:
//   - the GitHub Action  (terraform-drift-report)
//   - the Azure DevOps task (TerraformDriftReport, initiative 6)
//   - kept in lockstep with the backend's internal/services/driftingest (Go)
//     and the jq in the dispatched CI templates, via the vendored golden
//     fixtures in __tests__/fixtures (sourced from the backend's tests).
export {
  summarize,
  moduleCallsPlan,
  type Plan,
  type ResourceChange,
  type SummaryEntry,
  type Result,
} from './summarize'
