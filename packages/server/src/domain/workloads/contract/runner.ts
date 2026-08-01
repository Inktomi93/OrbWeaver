// domain/workloads/contract/runner — the one Runner<K> signature every per-kind runner satisfies.
//
// TRANSITIONAL (the junk-drawer exit, stage A): the `runners/` tree + the `WorkloadRunnerEnv` hub they read
// are being re-homed into their owning domains as `WorkloadContribution`s. Until the last one moves, the
// engine dispatches through the injected contribution registry and `substrate/shim-contributions.ts` adapts
// the surviving runners onto it. This type dies with `runners/`.

import type { ReportProgress, WorkloadKind, WorkloadParamsByKind, WorkloadResultByKind } from "@orb/contracts/workloads";
import type { WorkloadRunnerContext } from "./service";

export type Runner<K extends WorkloadKind> = (
  ctx: WorkloadRunnerContext,
  params: WorkloadParamsByKind[K],
  report: ReportProgress,
  signal: AbortSignal,
) => Promise<WorkloadResultByKind[K]>;
