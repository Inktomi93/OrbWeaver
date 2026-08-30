// cpu-profile's programmatic front door (`pnpm perf-meter`) — what tests and sibling tools import;
// the cli fronts this surface. One tool, one API (docs/architecture/core/Core-Tooling-Law.md §2.5).
export type { Args, MeterData, Step, StepReport } from "./contract/types.ts";
export { PERF_METER_HELP, parsePerfArgs } from "./ops/parse.ts";
export { buildReports } from "./ops/report.ts";
export { runCpuProfile } from "./ops/run.ts";
