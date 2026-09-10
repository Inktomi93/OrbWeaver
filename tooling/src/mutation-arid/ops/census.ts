// What the ignorer actually DROPPED from a report's denominator.
//
// The ignorer is part of the gate's calibration, not a cosmetic: `stryker.gate.config.js` states that
// adding or removing it moves the denominator, so `break` must be re-measured whenever its rules change.
// That makes "how many mutants does it drop, and for which reason" the evidence a recalibration rests on —
// and before this op the only way to see it was to read a 20MB report by hand.
import { readFileSync } from "node:fs";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { AridCensus, AridReason } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm mutation:arid");

const IGNORED = "Ignored";
/** Stryker excludes these from the scored denominator by definition. */
const UNSCORED: readonly string[] = [IGNORED, "CompileError"];

interface ReportMutant {
  readonly status: string;
  readonly statusReason?: string;
}

/** Reads a Stryker JSON report. Throws (→ exit 2) rather than reporting an empty census over a payload
 *  that is not a report at all — a zero here would read as "the ignorer dropped nothing", which is a
 *  claim about the ignorer rather than about the reader. */
export function aridCensus(reportPath: string): AridCensus {
  const parsed: unknown = JSON.parse(readFileSync(reportPath, "utf8"));
  const files = (parsed as { readonly files?: Readonly<Record<string, { readonly mutants: readonly ReportMutant[] }>> }).files;
  if (files === undefined) {
    throw new Error(`${reportPath} has no \`files\` map — not a Stryker JSON report`);
  }
  const mutants = Object.values(files).flatMap((f) => f.mutants);
  if (mutants.length === 0) {
    throw new Error(`${reportPath} instrumented ZERO mutants — an empty report cannot say what the ignorer dropped`);
  }
  const counts = new Map<string, number>();
  for (const m of mutants.filter((x) => x.status === IGNORED)) {
    const reason = m.statusReason ?? "<no reason recorded>";
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  const byReason: readonly AridReason[] = [...counts].map(([reason, count]) => ({ reason, count })).toSorted((a, b) => b.count - a.count);
  return {
    reportPath,
    ignored: mutants.filter((m) => m.status === IGNORED).length,
    scoredDenominator: mutants.filter((m) => !UNSCORED.includes(m.status)).length,
    byReason,
  };
}
