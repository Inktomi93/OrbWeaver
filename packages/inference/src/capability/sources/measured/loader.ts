// The MEASURED tier's loader (§6.2: `measured` = a probe receipt, dated, named script — it outranks the catalog's
// advertisement and the curated rows, and yields only to a connection's own `declared` block). Rows are matched
// exactly like the curated tier (`../rows.ts`: model regex / id list × provider / wire / api), which is what makes
// a per-model, per-route measurement expressible at all — until 2026-09-20 the resolver handed the whole
// anthropic list to every anthropic-family id (`resolve-task.ts` `family === "anthropic" ? MEASURED_ANTHROPIC : []`),
// so a row measured for opus-5 would have hit haiku too. Files are grouped by the ROUTE the probe ran on:
// `openrouter.ts` = measured THROUGH OpenRouter (any family), `anthropic.ts` = measured on the direct wire.

import type { CapabilityOverride } from "@orb/contracts/inference";
import type { CompiledRow, RowQuery } from "../rows.ts";
import { compileRows, matchingRows } from "../rows.ts";
import { measuredAnthropicRows } from "./anthropic.ts";
import { measuredOpenRouterRows } from "./openrouter.ts";

const MEASURED: readonly CompiledRow[] = [
  ...compileRows("measured/anthropic.ts", measuredAnthropicRows),
  ...compileRows("measured/openrouter.ts", measuredOpenRouterRows),
];

/** Every dated measurement that matches this (model × route), in file order. Empty ⇒ nothing measured. */
export function measuredRows(query: RowQuery): readonly CapabilityOverride[] {
  return matchingRows(MEASURED, query);
}
