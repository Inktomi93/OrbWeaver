// The forced-state pass's PAGE→NODE seam validators, split from ops/hover.ts (2026-09-01, the
// tooling-size cap) — one home for the discipline contract/samples-hover.ts documents: a cast across
// the page boundary has no compiler behind it (the pass's first defect was `JSON.parse(raw) as
// number[]` over selector STRINGS, which silently disabled the restoration withholding), so every
// shape the page hands back is VALIDATED here and a violation is a loud INSTRUMENT ERROR, never a
// quietly dropped or quietly trusted sample.
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { GlowShadowInput, RadialGlowInput } from "../contract/samples.ts";
import type { HoverCensusResult, HoverForcedReadRow, HoverGroupReadResult } from "../contract/samples-hover.ts";

refuseDirectInvocation(import.meta.url, "pnpm design-audit");

/** The page hands its results back as JSON TEXT (`JSON.stringify(window.__orbHover…)`), and every reader
 *  below starts with `JSON.parse`. A non-string here means the in-page object was gone or the expression
 *  threw — `JSON.parse(undefined)` would raise a SyntaxError the caller absorbs as an ordinary force
 *  failure, which files the pass's own breakage under the app's population. Named, so it cannot. */
export function pageJsonString(raw: unknown, label: string): string {
  if (typeof raw !== "string") {
    throw new Error(`INSTRUMENT ERROR: ${label} returned ${raw === null ? "null" : typeof raw}, not the JSON text of a page read`);
  }
  return raw;
}

/** The forced-state pass's DENOMINATOR, straight off `page.evaluate`. Its `rest` length IS the candidate
 *  space every index below is bounded by, and its counters are the withheld population — so a malformed
 *  census would silently shrink the space the whole pass is judged against. */
export function hoverCensusResult(parsed: unknown, label: string): HoverCensusResult {
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`INSTRUMENT ERROR: ${label} returned ${typeof parsed}, not a hover census`);
  }
  const census = parsed as { rest?: unknown; groups?: unknown; attrGroups?: unknown; census?: unknown };
  for (const [field, value] of [
    ["rest", census.rest],
    ["groups", census.groups],
    ["attrGroups", census.attrGroups],
  ] as const) {
    if (!Array.isArray(value)) {
      throw new Error(`INSTRUMENT ERROR: ${label} returned ${Array.isArray(value) ? "an array" : typeof value} for "${field}", not a list`);
    }
  }
  if (typeof census.census !== "object" || census.census === null) {
    throw new Error(`INSTRUMENT ERROR: ${label} returned no counters — the withheld population would read as zero`);
  }
  // Every counter, not a hand-listed subset: the shape is a flat number map, so a non-number is a broken
  // segment whichever key carries it, and a list here would drift as counters are added.
  for (const [key, value] of Object.entries(census.census)) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`INSTRUMENT ERROR: ${label} returned ${typeof value} for the "${key}" counter, not a number`);
    }
  }
  return parsed as HoverCensusResult;
}

/** The attribute mechanism's SAME-TASK restore proof. It was read as `(JSON.parse(raw) as
 *  HoverAttrReadResult).restored` — the exact cast shape that started this discipline — and an absent
 *  flag reads as `undefined`, which is falsy, so a broken read would have withheld every member of the
 *  group as `notRestored` while looking like a working refusal. */
export function attrRestored(raw: string, label: string): boolean {
  const parsed: unknown = JSON.parse(raw);
  const restored = (parsed as { restored?: unknown }).restored;
  if (typeof restored !== "boolean") {
    throw new Error(
      `INSTRUMENT ERROR: ${label} returned ${restored === undefined ? "nothing" : typeof restored} for "restored", not the same-task restore proof`,
    );
  }
  return restored;
}

/** Parses a list of CANDIDATE INDICES the page returned, refusing anything that is not one. */
export function candidateIndices(raw: string, bound: number, label: string): number[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`INSTRUMENT ERROR: ${label} returned ${typeof parsed}, not a list of candidate indices`);
  }
  return parsed.map((value: unknown) => {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value >= bound) {
      throw new Error(`INSTRUMENT ERROR: ${label} returned ${JSON.stringify(value)}, not a candidate index below ${String(bound)}`);
    }
    return value;
  });
}

/** Same discipline for the forced readings: every row must name a candidate this pass censused. */
function forcedReadRows(parsed: unknown, bound: number): HoverForcedReadRow[] {
  if (!Array.isArray(parsed)) {
    throw new Error(`INSTRUMENT ERROR: hover read returned ${typeof parsed}, not a list of readings`);
  }
  return parsed.map((value: unknown) => {
    const row = value as HoverForcedReadRow;
    if (typeof row.index !== "number" || !Number.isSafeInteger(row.index) || row.index < 0 || row.index >= bound) {
      throw new Error(`INSTRUMENT ERROR: hover read row names ${JSON.stringify(row.index)}, not a candidate index below ${String(bound)}`);
    }
    return row;
  });
}

/** The glow rows a forced state added over the rest snapshot. */
function stateGlowRows(parsed: unknown, label: string): { shadows: GlowShadowInput[]; radials: RadialGlowInput[] } {
  const result = parsed as { shadows?: unknown; radials?: unknown };
  const shadows = Array.isArray(result.shadows) ? result.shadows : null;
  const radials = Array.isArray(result.radials) ? result.radials : null;
  if (shadows === null || radials === null) {
    throw new Error(`INSTRUMENT ERROR: ${label} returned no glow row lists`);
  }
  for (const value of shadows) {
    const row = value as GlowShadowInput;
    if (typeof row.selector !== "string" || typeof row.boxShadow !== "string" || typeof row.textShadow !== "string" || typeof row.sanctioned !== "boolean") {
      throw new Error(`INSTRUMENT ERROR: ${label} returned a malformed state glow row`);
    }
  }
  for (const value of radials) {
    const row = value as RadialGlowInput;
    if (typeof row.selector !== "string" || typeof row.value !== "string" || typeof row.width !== "number" || typeof row.sanctioned !== "boolean") {
      throw new Error(`INSTRUMENT ERROR: ${label} returned a malformed state radial row`);
    }
  }
  return { shadows: shadows as GlowShadowInput[], radials: radials as RadialGlowInput[] };
}

/** One group read (either mechanism) settled at the seam: contrast reads + the glow deltas. */
export function groupReadResult(raw: string, bound: number, label: string): HoverGroupReadResult {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`INSTRUMENT ERROR: ${label} returned ${typeof parsed}, not a group read`);
  }
  const reads = forcedReadRows((parsed as { reads?: unknown }).reads, bound);
  const glow = stateGlowRows(parsed, label);
  return { reads, shadows: glow.shadows, radials: glow.radials };
}
