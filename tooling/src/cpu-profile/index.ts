// Retained interaction/trace evidence engine. Snap is the only rendered-instrument front door; this
// barrel exposes data shapes and pure reports, never a second parser, stage, tape, or browser run path.
export type { BootTraceReceipt, MeterData, MeterWindow, StepReport } from "./contract/types.ts";
export { BOOT_TRACE_INSIGHTS } from "./contract/types.ts";
export { meterApparatusGap, meterEvidenceGaps, parseMeterData } from "./lib/evidence.ts";
export { perfRateDisposition } from "./lib/rate.ts";
export type { ActiveBootTrace } from "./ops/boot-trace.ts";
export { beginBootTrace } from "./ops/boot-trace.ts";
export { METER_INIT_JS } from "./ops/meter.ts";
export { buildReports, PERF_ENTRY_LEGEND, perfTableLines, printTable } from "./ops/report.ts";
