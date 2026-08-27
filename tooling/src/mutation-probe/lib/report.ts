// Reading a Stryker JSON report, with the two refusals that keep this probe from lying.
//
// (1) DRIFT — the report records the exact source it mutated. If disk has moved since, every location is
//     suspect, so planting would measure a different file than the one the report describes. Refuse.
// (2) EMPTY — a file with zero reported survivors yields zero receipts, which reads identically to "all
//     survivors were killed". That is the #409 class: absent evidence is never a clean verdict. The
//     caller turns this into exit 2, never exit 0.
import { readFileSync } from "node:fs";
import type { PlantableStatus } from "../contract/types.ts";

/** Stryker's per-mutant record — the subset this probe reads. */
export interface ReportMutant {
  readonly mutatorName: string;
  readonly replacement: string;
  readonly status: string;
  readonly location: {
    readonly start: { readonly line: number; readonly column: number };
    readonly end: { readonly line: number; readonly column: number };
  };
}

export interface ReportFile {
  readonly source: string;
  readonly mutants: readonly ReportMutant[];
}

const SURVIVED = "Survived";
const NO_COVERAGE = "NoCoverage";

/** How many covered paths a "no such file" diagnostic names before eliding. */
const COVERED_SAMPLE = 5;

function fileOf(reportPath: string, sourceRel: string): ReportFile {
  const parsed: unknown = JSON.parse(readFileSync(reportPath, "utf8"));
  const files = (parsed as { readonly files?: Readonly<Record<string, ReportFile>> }).files;
  if (files === undefined) {
    throw new Error(`${reportPath} has no \`files\` map — not a Stryker JSON report`);
  }
  const file = files[sourceRel];
  if (file === undefined) {
    const covered = Object.keys(files).slice(0, COVERED_SAMPLE).join(", ");
    throw new Error(`the report does not cover ${sourceRel} — it covers: ${covered}${Object.keys(files).length > COVERED_SAMPLE ? ", …" : ""}`);
  }
  return file;
}

/** The two populations worth planting, and what a KILL means for each.
 *  - `Survived`: the report claims tests ran and none caught it. A kill REFUTES the report.
 *  - `NoCoverage`: the report claims no test runs the line at all. A kill ALSO refutes the report, and
 *    more damningly — the coverage attribution itself was wrong, so every score over that file is
 *    suspect. Adjudicating only Survived would leave that class permanently unmeasured. */
function sortByLocation(mutants: readonly ReportMutant[]): readonly ReportMutant[] {
  return mutants.toSorted((a, b) => a.location.start.line - b.location.start.line || a.location.start.column - b.location.start.column);
}

/** Every mutant the report holds for this file, whatever its status — the completeness sanity number. */
export function totalMutants(reportPath: string, sourceRel: string): number {
  return fileOf(reportPath, sourceRel).mutants.length;
}

/** Mutants of one status, sorted by location. No refusals — the caller composes them. */
export function mutantsOf(reportPath: string, sourceRel: string, status: PlantableStatus): readonly ReportMutant[] {
  return sortByLocation(fileOf(reportPath, sourceRel).mutants.filter((m) => m.status === status));
}

/** Survivors sorted by location, after both refusals pass. Throws on drift or an empty population. */
export function survivorsOf(reportPath: string, sourceRel: string, onDisk: string): readonly ReportMutant[] {
  const file = fileOf(reportPath, sourceRel);
  if (file.source !== onDisk) {
    throw new Error(`${sourceRel} has changed since the report was written — refusing to plant against drifted locations`);
  }
  const survivors = sortByLocation(file.mutants.filter((m) => m.status === SURVIVED));
  if (survivors.length === 0 && file.mutants.every((m) => m.status !== NO_COVERAGE)) {
    throw new Error(
      `the report lists ZERO survivors and ZERO no-coverage mutants for ${sourceRel} — there is nothing to adjudicate, which is not the same as a clean result`,
    );
  }
  return survivors;
}
