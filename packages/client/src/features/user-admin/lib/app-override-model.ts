// Shared helpers for the AppSettings admin-override SECTIONS (Phase B ③: rate limits, memory tuning,
// summarizer). The floor-vs-override display + delta-save logic is identical across them; this is its one
// home (lib, no JSX — a component module can't co-export a non-component, useComponentExportOnlyModules).

/** Is this stored-override value actively set? `null`/`undefined` = the deployment floor governs; anything
 *  else (INCLUDING `0` / `false`) = an active override. The nullish check is load-bearing — a falsy check
 *  would wrongly read `recencyBias: 0` / `keywordMatch: false` as "not overridden". */
export function isOverridden(v: unknown): boolean {
  return v !== null && v !== undefined;
}

/** Does a NESTED override object carry at least one actively-set field? (`null`/`undefined` blob → no.) */
export function anyFieldOverridden(nested: Record<string, unknown> | null | undefined): boolean {
  return nested !== null && nested !== undefined && Object.values(nested).some(isOverridden);
}
