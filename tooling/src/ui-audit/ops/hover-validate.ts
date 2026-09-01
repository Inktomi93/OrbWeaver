// The forced-state pass's PAGE→NODE seam validators, split from ops/hover.ts (2026-09-01, the
// tooling-size cap) — one home for the discipline contract/samples-hover.ts documents: a cast across
// the page boundary has no compiler behind it (the pass's first defect was `JSON.parse(raw) as
// number[]` over selector STRINGS, which silently disabled the restoration withholding), so every
// shape the page hands back is VALIDATED here and a violation is a loud INSTRUMENT ERROR, never a
// quietly dropped or quietly trusted sample.
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { GlowShadowInput, RadialGlowInput } from "../contract/samples.ts";
import type { HoverForcedReadRow, HoverGroupReadResult } from "../contract/samples-hover.ts";

refuseDirectInvocation(import.meta.url, "pnpm design-audit");

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
