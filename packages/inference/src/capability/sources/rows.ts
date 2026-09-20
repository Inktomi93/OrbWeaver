// The ONE row compiler + matcher the curated AND measured tiers share. A capability row (`capabilityOverrideSchema`)
// names its subjects by `match` — a model-id regex source OR an explicit id list, optionally narrowed by
// provider / wire / api — because two live cells are functions of (id × wire-shape), not of id alone. Rows are
// parsed at load through the SAME zod a plugin/admin row goes through (a malformed row is a boot failure, never
// a runtime one) and matched in FILE ORDER (a later row refines an earlier one). This file is the only place a
// row's `match.model` regex is compiled (the other regex home is `../families.ts`); the measured tier used to
// have NO matcher at all — `resolve-task.ts` applied the whole anthropic list to every anthropic-family id, so a
// per-model measurement was structurally impossible (inference audit B3/H3, 2026-09-20).

import type { CapabilityOverride, ChatApi, ProviderId, Wire } from "@orb/contracts/inference";
import { capabilityOverrideSchema } from "@orb/contracts/inference";
import { z } from "zod";

export interface CompiledRow {
  readonly row: CapabilityOverride;
  readonly model: RegExp | null;
  readonly ids: ReadonlySet<string> | null;
}

/** What a resolver asks the row tiers with: the model id plus the route it resolved on. */
export interface RowQuery {
  readonly model: string;
  readonly providerId?: ProviderId | undefined;
  readonly wire?: Wire | undefined;
  readonly api?: ChatApi | null | undefined;
}

const rowsSchema = z.array(capabilityOverrideSchema);

/** Parse + compile one row module. `file` names the module in the boot-failure message. */
export function compileRows(file: string, raw: unknown): readonly CompiledRow[] {
  const parsed = rowsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`${file} is malformed: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  }
  return parsed.data.map((row) => ({
    row,
    model: row.match?.model !== undefined ? new RegExp(row.match.model, "i") : null,
    ids: row.match?.ids !== undefined ? new Set(row.match.ids) : null,
  }));
}

export function rowMatches(compiled: CompiledRow, query: RowQuery): boolean {
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
  return true;
}

/** Every row that matches, in composition order. Empty ⇒ nothing stated for this (model × route). */
export function matchingRows(compiled: readonly CompiledRow[], query: RowQuery): readonly CapabilityOverride[] {
  return compiled.filter((candidate) => rowMatches(candidate, query)).map((candidate) => candidate.row);
}
