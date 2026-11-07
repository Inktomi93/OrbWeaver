// One reader for a Stryker JSON report, and what the ignorer dropped from it.
import { readFileSync } from "node:fs";
import { z } from "zod";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import type { AridCensus, AridReason, MutantStatus, ReportMutant } from "../contract/types.ts";
import { MUTANT_STATUSES } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm test:mutation <file...>");

const IGNORED = "Ignored" satisfies MutantStatus;
/** Stryker excludes these from the scored denominator by definition. */
const UNSCORED: readonly MutantStatus[] = [IGNORED, "CompileError"];

const StrykerReportSchema = z.object({
  files: z.record(
    z.string(),
    z.object({ mutants: z.array(z.object({ status: z.enum(MUTANT_STATUSES), statusReason: z.string().optional(), testsCompleted: z.number().optional() })) }),
  ),
});

/** Every mutant in a report. Throws on anything else, so a bad payload is a tool error and never an empty result. */
export function readStrykerMutants(reportPath: string): readonly ReportMutant[] {
  return Object.values(StrykerReportSchema.parse(JSON.parse(readFileSync(reportPath, "utf8"))).files).flatMap((file) => file.mutants);
}

/** Counts by reason. Throws on a report with no mutants: a zero here would claim the ignorer dropped nothing. */
export function aridCensus(reportPath: string): AridCensus {
  const mutants = readStrykerMutants(reportPath);
  if (mutants.length === 0) {
    throw new Error(`${reportPath} instrumented ZERO mutants; an empty report cannot say what the ignorer dropped`);
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
