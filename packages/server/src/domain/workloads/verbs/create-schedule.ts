// verb: createSchedule — create a recurring-execution schedule (the TIME dimension over the queue). RE-PARSES
// the `StartWorkloadInput` (defense in depth, like `start`) + gates the MODE:
//   1. MODE SUPPORT: the kind must support the requested mode (`WORKLOAD_KIND_MODES`) — else BAD_REQUEST.
//   2. AUTHORITY: a `bulk` schedule requires the BOX OWNER (`requireOwner`); a `singular` schedule is any
//      authed caller. A `null` caller is a TRUSTED system trigger (no gate).
//   3. OWNER: singular/bulk stamp the caller's own id (a schedule row's owner is NOT NULL); a `null` caller
//      stamps the explicit `ownerId` (BAD_REQUEST if that too is null — you can't mint an ownerless schedule).
// The first run is one cadence-interval out (a fresh nightly schedule doesn't fire the instant it's created).

import { CADENCE_INTERVAL_MS } from "@orb/contracts/workloads";
import { DomainOperationError } from "@orb/kit/errors";
import type { WorkloadScheduleId } from "@orb/kit/ids";
import type { CreateScheduleParams } from "../contract/schedule";
import type { WorkloadService, WorkloadServiceContext } from "../contract/service";
import { startWorkloadInput } from "../contract/workload-params";
import { insertSchedule } from "../persistence/schedule-queries";
import { assertKindSupportsMode } from "../substrate/authorize";

export function createCreateSchedule(ctx: WorkloadServiceContext): Pick<WorkloadService, "createSchedule"> {
  async function createSchedule(params: CreateScheduleParams): Promise<{ id: WorkloadScheduleId }> {
    const input = startWorkloadInput.parse(params.input);
    assertKindSupportsMode(input.kind, params.mode);
    if (params.mode === "bulk" && params.caller !== null) {
      ctx.requireOwner(params.caller);
    }
    const ownerId = params.caller !== null ? params.caller.userId : params.ownerId;
    if (ownerId === null) {
      throw new DomainOperationError("owner_required", "a schedule must have an owner (no caller and no explicit ownerId)");
    }
    const now = ctx.now();
    const id = ctx.newScheduleId();
    await insertSchedule(ctx.db, {
      id,
      ownerId,
      kind: input.kind,
      mode: params.mode,
      params: input.params as Record<string, unknown>,
      cadence: params.cadence,
      nextRunAt: now + CADENCE_INTERVAL_MS[params.cadence],
      enabled: params.enabled ?? true,
      createdAt: now,
    });
    return { id };
  }
  return { createSchedule };
}
