// Shared owner data and injected operations; implementations and authority resolution stay in server domains.

import type { UserId, WorkloadId } from "@orb/kit/ids";
import type { Principal } from "#identity";
import type { WorkloadMode } from "./axes.ts";
import type { StartWorkloadInput } from "./params.ts";
import type { WorkloadRef } from "./views.ts";

/** mode: "bulk" requires the box owner and either sweeps all owners or mints into targetOwnerId; caller:
 *  null bypasses the gate and stamps the explicit ownerId. */

interface StartWorkloadBase {
  readonly input: StartWorkloadInput;
  readonly mode: WorkloadMode;
  readonly targetOwnerId?: UserId | null;
  readonly ownerId: UserId | null;
  readonly dependsOn?: readonly WorkloadId[];
  readonly scheduledAt?: number;
  /** "Start this unit, or hand me the run that already holds its slot." A caller whose next act needs an
   *  ACTIVE workload of this unit — a DAG builder that must chain a dependent on it — cannot use the bare
   *  conflict: `DomainConflictError` says the work is in flight but not WHICH row is doing it, so the only
   *  thing it can do is swallow the refusal and lose the edge. With this set, the single-active collision
   *  resolves to the ACTIVE row's id instead of throwing, and the caller's `dependsOn` survives whether this
   *  call created the row or found it. NOT the wire's to send — it is an internal/system-trigger intent, and
   *  the transport `start` proc does not carry it: a person clicking "Run" is told the run is already going,
   *  which is the honest answer for a person. `dependsOn`/`scheduledAt` supplied alongside an ADOPTED row are
   *  necessarily dropped — the adopted row was admitted under its own. Absent ⇒ the conflict throws. */
  readonly adoptActive?: boolean;
}

/** Request funding is derived; trusted producers must state whether they admit model spending. */
export type StartWorkloadParams = StartWorkloadBase &
  ({ readonly caller: Principal; readonly funderUserId?: never } | { readonly caller: null; readonly funderUserId: UserId | null });

export type StartWorkloadOp = (params: StartWorkloadParams) => Promise<WorkloadRef>;
