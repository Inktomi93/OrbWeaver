// domain/workloads/contract/runner — the one Runner<K> signature every per-kind runner satisfies. Lives in
// contract/ (not engine/) so runner files depend on this for the type while engine/dispatch depends on it
// for the type AND on each runner for the value — no cycle. A runner never touches the row lifecycle (that's
// the engine's job); it returns ResultByKind[K] (→ succeeded), throws (→ failed), or honors the AbortSignal
// (→ cancelled).

import type { WorkloadKind } from "@orb/contracts/workloads";
import type { WorkloadRunnerContext } from "./service";
import type { ParamsByKind } from "./workload-params";
import type { ResultByKind } from "./workload-result";
import type { ReportProgress } from "./workload-state";

export type Runner<K extends WorkloadKind> = (
  ctx: WorkloadRunnerContext,
  params: ParamsByKind[K],
  report: ReportProgress,
  signal: AbortSignal,
) => Promise<ResultByKind[K]>;
