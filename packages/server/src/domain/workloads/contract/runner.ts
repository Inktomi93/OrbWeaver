// domain/workloads/contract/runner — the ONE `Runner<K>` signature every per-kind runner satisfies. It
// lives in `contract/` (NOT `engine/`) on purpose (workloads.md §"two named subsystems" + invariant #8): the
// runner files depend on THIS for their type, while `engine/dispatch.ts` depends on this for the type AND on
// each runner for the value — so there is no edge from a runner back to the engine, no cycle.
//
// A runner receives the per-dispatch `WorkloadRunnerContext` (db + the workload's resolved acting user +
// the bound `roleClients` + the cached settings reader + the cross-feature `env` + log), the kind's parsed
// `params`, a `report` callback (→ heartbeat + progress bus), and the run's `AbortSignal` (admin cancel /
// SIGTERM). It returns the kind's `ResultByKind[K]` projection (return → `succeeded`), throws to fail
// (→ `failed`), or honors the signal to abort (→ `cancelled`). It NEVER touches the row lifecycle — that is
// the engine's job (claim/heartbeat/terminal); a runner is pure per-kind work over injected ops.

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
