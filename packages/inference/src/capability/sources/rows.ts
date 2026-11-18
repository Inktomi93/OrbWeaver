// The ONE row compiler + matcher the curated AND measured tiers share. A capability row (`capabilityOverrideSchema`)
// names its subjects by `match` — a model-id regex source OR an explicit id list, optionally narrowed by
// provider / wire / api — because two live cells are functions of (id × wire-shape), not of id alone. Rows are
// parsed at load through the SAME zod a plugin/admin row goes through (a malformed row is a boot failure, never
// a runtime one) and matched in FILE ORDER (a later row refines an earlier one). This file is the only place a
// row's `match.model` regex is compiled (the other regex home is `../families.ts`); both tiers match per model,
// never per family, or a per-model measurement is unrepresentable.

import type { CapabilityOverride } from "@orb/contracts/inference";
import { capabilityOverrideSchema } from "@orb/contracts/inference";
import { z } from "zod";
import type { CompiledRow, RowQuery } from "#src/contract/capability.ts";

const rowsSchema = z.array(capabilityOverrideSchema);

/** Parse + compile one row module. `file` names the module in the boot-failure message. */
export function compileRows(file: string, raw: unknown): readonly CompiledRow[] {
  const parsed = rowsSchema.safeParse(raw);
  if (!parsed.success) {
    // `z.prettifyError` rather than a hand-flattened `issues` join: this is a BOOT failure an operator reads,
    // and prettify carries the path that names the offending row and field.
    throw new Error(`${file} is malformed:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data.map((row) => ({
    row,
    model: row.match?.model !== undefined ? new RegExp(row.match.model, "i") : null,
    ids: row.match?.ids !== undefined ? new Set(row.match.ids) : null,
  }));
}

function rowMatches(compiled: CompiledRow, query: RowQuery): boolean {
  const match = compiled.row.match;
  if (match === undefined) {
    return false;
  }
  if (compiled.model !== null && !compiled.model.test(query.model)) {
    return false;
  }
  if (compiled.ids !== null && !compiled.ids.has(query.model)) {
    return false;
  }
  if (match.provider !== undefined && match.provider !== query.providerId) {
    return false;
  }
  if (match.wire !== undefined && match.wire !== query.wire) {
    return false;
  }
  if (match.api !== undefined && match.api !== (query.api ?? null)) {
    return false;
  }
  if (match.nativeChat !== undefined && match.nativeChat !== query.nativeChat) {
    return false;
  }
  return true;
}

/** Every row that matches, in composition order. Empty ⇒ nothing stated for this (model × route). */
export function matchingRows(compiled: readonly CompiledRow[], query: RowQuery): readonly CapabilityOverride[] {
  return compiled.filter((candidate) => rowMatches(candidate, query)).map((candidate) => candidate.row);
}

export type { CompiledRow, RowQuery } from "#src/contract/capability.ts";
