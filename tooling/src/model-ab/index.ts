// model-ab's programmatic front door — boot each serving VARIANT (model × chat template × argv) once, run
// the whole probe matrix against it over plain /v1/chat/completions, and write a side-by-side summary. The
// REBOOT axis is ops/variants.json; the PER-REQUEST axes are ops/probes.ts.
export type { ChatResponse, CliOptions, Probe, ProbeResult, Variant, VariantRun } from "./contract/types.ts";
export { findRefusalMarkers, parseStructured, parseToolArguments, verifyPrefillContent, verifyPrefillThinking } from "./lib/verify.ts";
export { runProbe, runProbes } from "./ops/probe.ts";
export { PROBES } from "./ops/probes.ts";
export { writeSummary } from "./ops/report.ts";
export { loadVariants, parseCli, runModelAb } from "./ops/run.ts";
export { buildArgv, busyGpuOwners } from "./ops/serve.ts";
