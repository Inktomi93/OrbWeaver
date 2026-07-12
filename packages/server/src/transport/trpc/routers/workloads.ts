// transport/trpc/routers/workloads — the workloads ops surface (core/Tier-4-Transport.md). MODE model: every
// verb rides `authedProcedure` — the AUTHORIZATION is per-MODE + per-OWNER, resolved server-authoritatively in
// the domain verbs, not by a blanket procedure gate:
//   • `start` — a BULK run requires the BOX OWNER (LAYER-1 gate HERE on the payload's `mode`; the verb
//     re-checks as LAYER-2 + validates the kind supports the mode); a SINGULAR run is any authed caller and
//     stamps `ownerId = caller`. A bulk CREATE-kind carries a `targetOwnerId` (the mint destination).
//   • `list`/`get`/`cancel`/`retry`/`subscribe` — IDOR-scoped in the verb to the caller's own `ownerId`
//     (a non-admin), or across ALL owners (owner∪admin = the deployment-wide view). A foreign/absent id →
//     leak-free NOT_FOUND. The `caller` Principal (`ctx.auth`, resolved once at the edge) is threaded in.
// Thin: validate → LAYER-1 owner gate for bulk → enter the front door → map errors.
//
// `subscribe` mirrors the SSE replay-then-live shape: the generator's existence check is the OWNER-scoped
// `get` (a stranger's foreign id throws NOT_FOUND, mapped to a typed frame by `withSubscriptionErrors`), then
// replay the in-memory progress ring (`getRecentWorkloadEvents`, 60s TTL — overlap is idempotent on the
// client) and live-tail the per-process `workloadStreamEmitter`, filtered to the one `workloadId`.

import { on } from "node:events";
import type { Principal } from "@orb/contracts/identity";
import {
  scheduleCadenceSchema,
  workloadKindSchema,
  workloadModeSchema,
  workloadStatusSchema,
} from "@orb/contracts/workloads";
import type { UserId, WorkloadId, WorkloadScheduleId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import type { TrackedEnvelope } from "@trpc/server";
import { tracked } from "@trpc/server";
import { z } from "zod";
import { requireOwner } from "#domain/admin";
import type { WorkloadEvent, WorkloadService } from "#domain/workloads";
import {
  getRecentWorkloadEvents,
  startWorkloadInput,
  workloadStreamEmitter,
} from "#domain/workloads";
import { withSubscriptionErrors } from "../subscriptions";
import { authedProcedure, t } from "../trpc";

// The (unexported) bus channel `emitWorkloadEvent` publishes on — mirrored here so the live tail listens
// on the same channel. The progress-bus is single-process (single-replica) by design.
const WORKLOAD_EVENT_CHANNEL = "workload";

export const workloadsRouter = t.router({
  start: authedProcedure
    .input(
      z.object({
        input: startWorkloadInput,
        // The run mode (default singular). A bulk CREATE-kind additionally carries the mint target.
        mode: workloadModeSchema.default("singular"),
        targetOwnerId: brandedId<UserId>().optional(),
        dependsOn: z.array(brandedId<WorkloadId>()).optional(),
        scheduledAt: z.number().optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      // LAYER-1: a BULK run is BOX-OWNER-only. `requireOwner` throws FORBIDDEN for a non-owner; the verb
      // re-gates as LAYER-2 (and validates the kind supports the mode + resolves the target).
      if (input.mode === "bulk") {
        requireOwner(ctx.auth);
      }
      return ctx.services.workloads.start({
        input: input.input,
        caller: ctx.auth,
        mode: input.mode,
        ownerId: ctx.auth.userId,
        ...(input.targetOwnerId !== undefined ? { targetOwnerId: input.targetOwnerId } : {}),
        ...(input.dependsOn !== undefined ? { dependsOn: input.dependsOn } : {}),
        ...(input.scheduledAt !== undefined ? { scheduledAt: input.scheduledAt } : {}),
      });
    }),

  cancel: authedProcedure
    .input(z.object({ id: brandedId<WorkloadId>() }))
    .mutation(({ ctx, input }) =>
      ctx.services.workloads.cancel({ id: input.id, caller: ctx.auth }),
    ),

  retry: authedProcedure
    .input(z.object({ id: brandedId<WorkloadId>() }))
    .mutation(({ ctx, input }) => ctx.services.workloads.retry({ id: input.id, caller: ctx.auth })),

  get: authedProcedure
    .input(z.object({ id: brandedId<WorkloadId>() }))
    .query(({ ctx, input }) => ctx.services.workloads.get({ id: input.id, caller: ctx.auth })),

  list: authedProcedure
    .input(
      z
        .object({
          kind: workloadKindSchema.optional(),
          status: workloadStatusSchema.optional(),
          since: z.number().optional(),
          limit: z.number().optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) =>
      ctx.services.workloads.list({
        caller: ctx.auth,
        ...(input?.kind !== undefined ? { kind: input.kind } : {}),
        ...(input?.status !== undefined ? { status: input.status } : {}),
        ...(input?.since !== undefined ? { since: input.since } : {}),
        ...(input?.limit !== undefined ? { limit: input.limit } : {}),
      }),
    ),

  subscribe: authedProcedure
    .input(z.object({ workloadId: brandedId<WorkloadId>() }))
    .subscription(({ ctx, input, signal }) =>
      withSubscriptionErrors(
        workloadEvents(ctx.services.workloads, ctx.auth, input.workloadId, signal),
      ),
    ),

  // ── Schedules (the TIME dimension) — recurring auto-enqueue. Owner-scoped like the workload verbs: a
  //    SINGULAR schedule is any authed caller; a BULK schedule is BOX-OWNER-only (LAYER-1 gate here, re-checked
  //    in the verb); read/mutate-by-id collapse a foreign id to leak-free NOT_FOUND. ──
  createSchedule: authedProcedure
    .input(
      z.object({
        input: startWorkloadInput,
        cadence: scheduleCadenceSchema,
        mode: workloadModeSchema.default("singular"),
        enabled: z.boolean().optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      if (input.mode === "bulk") {
        requireOwner(ctx.auth);
      }
      return ctx.services.workloads.createSchedule({
        input: input.input,
        caller: ctx.auth,
        cadence: input.cadence,
        mode: input.mode,
        ownerId: ctx.auth.userId,
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      });
    }),

  updateSchedule: authedProcedure
    .input(
      z.object({
        id: brandedId<WorkloadScheduleId>(),
        input: startWorkloadInput.optional(),
        cadence: scheduleCadenceSchema.optional(),
        mode: workloadModeSchema.optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      if (input.mode === "bulk") {
        requireOwner(ctx.auth);
      }
      return ctx.services.workloads.updateSchedule({
        id: input.id,
        caller: ctx.auth,
        ...(input.input !== undefined ? { input: input.input } : {}),
        ...(input.cadence !== undefined ? { cadence: input.cadence } : {}),
        ...(input.mode !== undefined ? { mode: input.mode } : {}),
      });
    }),

  deleteSchedule: authedProcedure
    .input(z.object({ id: brandedId<WorkloadScheduleId>() }))
    .mutation(({ ctx, input }) =>
      ctx.services.workloads.deleteSchedule({ id: input.id, caller: ctx.auth }),
    ),

  setScheduleEnabled: authedProcedure
    .input(z.object({ id: brandedId<WorkloadScheduleId>(), enabled: z.boolean() }))
    .mutation(({ ctx, input }) =>
      ctx.services.workloads.setScheduleEnabled({
        id: input.id,
        caller: ctx.auth,
        enabled: input.enabled,
      }),
    ),

  listSchedules: authedProcedure
    .input(z.object({ kind: workloadKindSchema.optional() }).optional())
    .query(({ ctx, input }) =>
      ctx.services.workloads.listSchedules({
        caller: ctx.auth,
        ...(input?.kind !== undefined ? { kind: input.kind } : {}),
      }),
    ),
});

async function* workloadEvents(
  service: WorkloadService,
  caller: Principal,
  workloadId: WorkloadId,
  signal: AbortSignal | undefined,
): AsyncGenerator<TrackedEnvelope<WorkloadEvent>> {
  // Existence + OWNER-scoped check — throws `DomainNotFoundError` for a bad id OR a foreign workload (a
  // stranger can't tail someone else's run), which the wrapper converts to a typed frame (NOT a 500).
  await service.get({ id: workloadId, caller });

  let seq = 0;
  for (const event of getRecentWorkloadEvents(workloadId)) {
    yield tracked(String(seq++), event);
  }

  const live = on(workloadStreamEmitter, WORKLOAD_EVENT_CHANNEL, {
    signal: signal ?? new AbortController().signal,
  });
  for await (const args of live) {
    const event = args[0] as WorkloadEvent;
    if (event.workloadId !== workloadId) {
      continue;
    }
    yield tracked(String(seq++), event);
  }
}
