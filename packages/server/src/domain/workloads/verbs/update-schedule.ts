// verb: updateSchedule — retune a schedule by id (owner-scoped). Loads + visibility-checks FIRST (a foreign
// or absent id collapses to the leak-free NOT_FOUND — never a FORBIDDEN existence oracle), then applies the
// optional patch: `input` replaces kind+params (re-parsed + re-gated), `mode` re-gates the kind policy,
// `cadence` re-bases `nextRunAt` to one new interval out. An omitted field is left unchanged.

import type { ScheduleCadence, WorkloadKind, WorkloadMode } from "@orb/contracts/workloads";
import { CADENCE_INTERVAL_MS } from "@orb/contracts/workloads";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { UpdateScheduleParams, WorkloadScheduleRow } from "../contract/schedule";
import type { WorkloadService, WorkloadServiceContext } from "../contract/service";
import { startWorkloadInput } from "../contract/workload-params";
import { loadSchedule, updateScheduleFields } from "../persistence/schedule-queries";
import { assertKindSupportsMode, isVisibleToCaller } from "../substrate/authorize";

const ENTITY = "workload_schedule";

/** The mutable patch assembled from the optional inputs (mirrors the persistence `SchedulePatch`). */
interface MutablePatch {
  kind?: WorkloadKind;
  mode?: WorkloadMode;
  params?: Record<string, unknown>;
  cadence?: ScheduleCadence;
  nextRunAt?: number;
}

/** Assemble the patch from the optional inputs + re-gate MODE support / bulk authority when the kind or mode
 *  changes. Split out so the verb body stays a flat load → check → write (cognitive-complexity budget). */
function resolveUpdatePatch(
  ctx: WorkloadServiceContext,
  existing: WorkloadScheduleRow,
  params: UpdateScheduleParams,
): MutablePatch {
  const patch: MutablePatch = {};
  let effectiveKind = existing.kind;
  let effectiveMode = existing.mode;
  if (params.input !== undefined) {
    const input = startWorkloadInput.parse(params.input);
    effectiveKind = input.kind;
    patch.kind = input.kind;
    patch.params = input.params as Record<string, unknown>;
  }
  if (params.mode !== undefined) {
    effectiveMode = params.mode;
    patch.mode = params.mode;
  }
  if (params.input !== undefined || params.mode !== undefined) {
    assertKindSupportsMode(effectiveKind, effectiveMode);
    if (effectiveMode === "bulk" && params.caller !== null) {
      ctx.requireOwner(params.caller);
    }
  }
  if (params.cadence !== undefined) {
    patch.cadence = params.cadence;
    patch.nextRunAt = ctx.now() + CADENCE_INTERVAL_MS[params.cadence];
  }
  return patch;
}

export function createUpdateSchedule(
  ctx: WorkloadServiceContext,
): Pick<WorkloadService, "updateSchedule"> {
  async function updateSchedule(params: UpdateScheduleParams): Promise<WorkloadScheduleRow> {
    const existing = await loadSchedule(ctx.db, params.id);
    if (existing === null || !isVisibleToCaller(ctx.isAdmin, params.caller, existing.ownerId)) {
      throw new DomainNotFoundError(ENTITY, params.id);
    }
    const patch = resolveUpdatePatch(ctx, existing, params);
    const updated = await updateScheduleFields(ctx.db, params.id, patch, ctx.now());
    if (updated === null) {
      throw new DomainNotFoundError(ENTITY, params.id);
    }
    return updated;
  }
  return { updateSchedule };
}
