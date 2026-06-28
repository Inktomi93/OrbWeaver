// verb: start — enqueue a `queued` row. RE-PARSES the `StartWorkloadInput` discriminated union (defense in
// depth — the wire validated, but mocked-procedure tests bypass that validator; workloads.md §"Verbs"). It
// catches the `workloads_kind_active` single-active collision SPECIFICALLY (`isActiveKindUniqueViolation`)
// and translates it to `DomainConflictError`; any other error rethrows. `dependsOn` is PERSISTED but NOT
// enforced — `start` warns loudly at the seam so a caller isn't silently misled (esoteric #8).

import { DomainConflictError } from "@orb/kit/errors";
import type { WorkloadId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { StartWorkloadParams } from "../contract/params";
import type { WorkloadService, WorkloadServiceContext } from "../contract/service";
import { startWorkloadInput } from "../contract/workload-params";
import { isActiveKindUniqueViolation } from "../persistence/constraints";
import { insertWorkload } from "../persistence/queries";

export function createStart(ctx: WorkloadServiceContext): Pick<WorkloadService, "start"> {
  async function start(params: StartWorkloadParams): Promise<{ id: WorkloadId }> {
    const input = startWorkloadInput.parse(params.input);
    if (params.dependsOn !== undefined && params.dependsOn.length > 0) {
      getLog().warn(
        { kind: input.kind, dependsOn: params.dependsOn },
        "workloads: dependsOn is persisted but NOT enforced — dispatch ignores it (no DAG scheduler)",
      );
    }
    const id = ctx.newWorkloadId();
    const now = ctx.now();
    try {
      await insertWorkload(ctx.db, {
        id,
        kind: input.kind,
        params: input.params as Record<string, unknown>,
        ownerId: params.ownerId,
        dependsOn: params.dependsOn ?? null,
        scheduledAt: params.scheduledAt ?? now,
        createdAt: now,
      });
    } catch (err) {
      if (isActiveKindUniqueViolation(err)) {
        // The raw libSQL error carries SQL internals; the typed conflict is the honest signal (the
        // single-active slot is already taken). Chain the cause for diagnostics, don't surface it.
        const conflict = new DomainConflictError(`a "${input.kind}" workload is already active`);
        conflict.cause = err;
        throw conflict;
      }
      throw err;
    }
    return { id };
  }
  return { start };
}
