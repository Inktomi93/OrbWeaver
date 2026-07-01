// transport/trpc/routers/workloads — the workloads ops surface (core/Tier-4-Transport.md). Every procedure is
// `adminProcedure` (workloads are deployment-global; workloads.md §7.1). Thin: validate → enter the
// `workloads` front door → map errors. `ownerId` is the acting user (audit subject, not authz yet); `null`
// would be a system/scheduler trigger (the jobs driver's concern, not transport's).
//
// `subscribe` mirrors the SSE replay-then-live shape: replay the in-memory progress ring
// (`getRecentWorkloadEvents`, 60s TTL — overlap is idempotent on the client), then live-tail the
// per-process `workloadStreamEmitter`, filtered to the one `workloadId`. `withSubscriptionErrors` maps a
// thrown domain error (the `get` existence check) into a typed frame — a subscription bypasses the
// domain-error middleware (Esoteric #5).

import { on } from "node:events";
import { workloadKindSchema, workloadStatusSchema } from "@orb/contracts/workloads";
import type { WorkloadId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import type { TrackedEnvelope } from "@trpc/server";
import { tracked } from "@trpc/server";
import { z } from "zod";
import type { WorkloadEvent, WorkloadService } from "#domain/workloads";
import {
  getRecentWorkloadEvents,
  startWorkloadInput,
  workloadStreamEmitter,
} from "#domain/workloads";
import { withSubscriptionErrors } from "../subscriptions";
import { adminProcedure, t } from "../trpc";

// The (unexported) bus channel `emitWorkloadEvent` publishes on — mirrored here so the live tail listens
// on the same channel. The progress-bus is single-process (single-replica) by design.
const WORKLOAD_EVENT_CHANNEL = "workload";

export const workloadsRouter = t.router({
  start: adminProcedure
    .input(
      z.object({
        input: startWorkloadInput,
        dependsOn: z.array(brandedId<WorkloadId>()).optional(),
        scheduledAt: z.number().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.workloads.start({
        input: input.input,
        ownerId: ctx.auth.userId,
        ...(input.dependsOn !== undefined ? { dependsOn: input.dependsOn } : {}),
        ...(input.scheduledAt !== undefined ? { scheduledAt: input.scheduledAt } : {}),
      }),
    ),

  cancel: adminProcedure
    .input(z.object({ id: brandedId<WorkloadId>() }))
    .mutation(({ ctx, input }) =>
      ctx.services.workloads.cancel({ id: input.id, ownerId: ctx.auth.userId }),
    ),

  retry: adminProcedure
    .input(z.object({ id: brandedId<WorkloadId>() }))
    .mutation(({ ctx, input }) =>
      ctx.services.workloads.retry({ id: input.id, ownerId: ctx.auth.userId }),
    ),

  get: adminProcedure
    .input(z.object({ id: brandedId<WorkloadId>() }))
    .query(({ ctx, input }) =>
      ctx.services.workloads.get({ id: input.id, ownerId: ctx.auth.userId }),
    ),

  list: adminProcedure
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
        ...(input?.kind !== undefined ? { kind: input.kind } : {}),
        ...(input?.status !== undefined ? { status: input.status } : {}),
        ...(input?.since !== undefined ? { since: input.since } : {}),
        ...(input?.limit !== undefined ? { limit: input.limit } : {}),
      }),
    ),

  subscribe: adminProcedure
    .input(z.object({ workloadId: brandedId<WorkloadId>() }))
    .subscription(({ ctx, input, signal }) =>
      withSubscriptionErrors(workloadEvents(ctx.services.workloads, input.workloadId, signal)),
    ),
});

/** Replay the recent progress ring, then live-tail the bus filtered to this `workloadId`. */
async function* workloadEvents(
  service: WorkloadService,
  workloadId: WorkloadId,
  signal: AbortSignal | undefined,
): AsyncGenerator<TrackedEnvelope<WorkloadEvent>> {
  // Existence check — throws `DomainNotFoundError` for a bad id, which the wrapper converts to a typed
  // frame (NOT a 500). `ownerId` is the audit subject only (workloads are admin-global).
  await service.get({ id: workloadId, ownerId: null });

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
