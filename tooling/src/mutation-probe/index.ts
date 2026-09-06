// mutation-probe's programmatic front door. The CLI is the operator entrypoint; tests and any future
// calibration orchestration consume this surface rather than reaching into ops/lib files.
export type { MutantPopulation, MutantReceipt, PlantableStatus, ProbeSummary, SuiteVerdict } from "./contract/types.ts";
export { MUTANT_POPULATIONS, PLANTABLE_STATUSES, SUITE_VERDICTS } from "./contract/types.ts";
export { mirrorCandidates, resolveMirrors } from "./lib/mirror.ts";
export type { SourceLocation, SourceRange } from "./lib/offsets.ts";
export { lineStarts, offsetOf, offsetRangeOf } from "./lib/offsets.ts";
export { classifySuiteExit } from "./lib/outcome.ts";
export type { ReportFile, ReportMutant } from "./lib/report.ts";
export { mutantsOf, survivorsOf, totalMutants } from "./lib/report.ts";
export type { StrandGuard } from "./lib/stranded.ts";
export { armStrandGuard, healStranded } from "./lib/stranded.ts";
export type { ProbeOptions, ProbeRange } from "./ops/probe.ts";
export { probeMutants } from "./ops/probe.ts";
