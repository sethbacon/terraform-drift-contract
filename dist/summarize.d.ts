/** The subset of a `terraform show -json` / `tofu show -json` document we read. */
export interface Plan {
    resource_changes?: ResourceChange[];
    configuration?: {
        root_module?: {
            module_calls?: Record<string, unknown>;
        };
    };
}
export interface ResourceChange {
    address: string;
    change: {
        actions: string[];
    };
}
export interface SummaryEntry {
    address: string;
    actions: string[];
}
export interface Result {
    added: number;
    changed: number;
    destroyed: number;
    drifted: boolean;
    summary: SummaryEntry[];
}
/** Classifies each resource change exactly as the backend's `Summarize` does. */
export declare function summarize(plan: Plan | null | undefined): Result;
/**
 * Extracts the module-provenance subdocument the backend expects in the callback
 * `plan` field: just `configuration.root_module.module_calls`. The backend parses
 * registry-module refs from it; we only forward it (matching the template jq).
 */
export declare function moduleCallsPlan(plan: Plan | null | undefined): unknown;
