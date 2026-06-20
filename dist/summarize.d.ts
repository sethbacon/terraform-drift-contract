export interface AttrChange {
    name: string;
    /** fmt(value) | "(sensitive)" | null */
    before: string | null;
    after: string | null;
}
export interface SummaryEntry {
    address: string;
    actions: string[];
    /** Present only on in-place updates/replaces with at least one changed key. */
    attrs?: AttrChange[];
}
export interface ResourceChange {
    address?: string;
    change?: {
        actions?: string[];
        before?: unknown;
        after?: unknown;
        before_sensitive?: unknown;
        after_sensitive?: unknown;
    };
}
/** The subset of a `terraform show -json` / `tofu show -json` document we read. */
export interface Plan {
    resource_changes?: ResourceChange[];
    configuration?: {
        root_module?: {
            module_calls?: Record<string, unknown>;
        };
    };
}
export interface Result {
    added: number;
    changed: number;
    destroyed: number;
    drifted: boolean;
    summary: SummaryEntry[];
}
/** Verbatim port of drift_summary.py `fmt`: strings pass through raw, everything
 *  else is compact sorted JSON; truncate past 300 code points with U+2026. */
export declare function fmt(v: unknown): string | null;
/** Verbatim port of drift_summary.py `is_sens`: before_sensitive/after_sensitive
 *  mirror the value shape; True (or a non-empty nested dict/list) → mask. */
export declare function isSens(sens: unknown, k: string): boolean;
export declare function summarize(plan: Plan | null | undefined): Result;
/** Forwards only `configuration.root_module.module_calls` for the optional
 *  module-provenance field the backend accepts on dispatched runs. Not part of
 *  drift_summary.py (which omits provenance); orthogonal to the summary. */
export declare function moduleCallsPlan(plan: Plan | null | undefined): unknown;
