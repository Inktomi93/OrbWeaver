// transport/trpc/routers/workloads — the workloads ops surface (docs/law/Tier-4-Transport.md). MODE model: every
// verb rides `authedProcedure` — the AUTHORIZATION is per-MODE + per-OWNER, resolved server-authoritatively in
// the domain verbs, not by a blanket procedure gate:
//   • `start` — a BULK run requires the BOX OWNER (LAYER-1 gate HERE on the payload's `mode`; the verb
//     re-checks as LAYER-2 + validates the kind supports the mode); a SINGULAR run is any authed caller and
//     stamps `ownerId = caller`. A bulk CREATE-kind carries a `targetOwnerId` (the mint destination).
//   • `list`/`get`/`cancel`/`retry` — IDOR-scoped in the verb to the caller's own `ownerId`
//     (a non-admin), or across ALL owners (owner∪admin = the deployment-wide view). A foreign/absent id →
//     leak-free NOT_FOUND. The `caller` Principal (`ctx.auth`, resolved once at the edge) is threaded in.
// Thin: validate → LAYER-1 owner gate for bulk → enter the front door → map errors.
//
// LIVE TAILING IS NOT HERE ANY MORE (SSE-1 S5). The deleted `subscribe` proc is the `workloads` ROOM on the
// tab's ONE socket (`transport/trpc/stream/sources/workloads.ts`), which is where its owner gate, its 60s
// replay ring and its per-`workloadId` filter moved verbatim. A user watching three runs now pays three
// attach round-trips instead of three browser connections; `single-stream-transport` keeps it that way.

import {
  asStartWorkloadInput,
  scheduleCadenceSchema,
  startWorkloadEnvelope,
  WORKLOAD_LIST_MAX_LIMIT,
  workloadKindSchema,
  workloadModeSchema,
  workloadStatusSchema,
} from "@orb/contracts/workloads";
import type { UserId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { requireOwner } from "#domain/admin";
import { authedProcedure, t } from "../trpc.ts";

export const workloadsRouter = t.router({
  start: authedProcedure
    .input(
      z.object({
        input: startWorkloadEnvelope,
        // The run mode (default singular). A bulk CREATE-kind additionally carries the mint target.
        mode: workloadModeSchema.default("singular"),
        targetOwnerId: brandedId<UserId>().optional(),
        dependsOn: z.array(typeIdSchema(ID_PREFIX.workload)).optional(),
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
        input: asStartWorkloadInput(input.input),
        caller: ctx.auth,
        mode: input.mode,
        ownerId: ctx.auth.userId,
        ...(input.targetOwnerId !== undefined ? { targetOwnerId: input.targetOwnerId } : {}),
        ...(input.dependsOn !== undefined ? { dependsOn: input.dependsOn } : {}),
        ...(input.scheduledAt !== undefined ? { scheduledAt: input.scheduledAt } : {}),
      });
    }),

  cancel: authedProcedure
    .input(z.object({ id: typeIdSchema(ID_PREFIX.workload) }))
    .mutation(({ ctx, input }) => ctx.services.workloads.cancel({ id: input.id, caller: ctx.auth })),

  retry: authedProcedure
    .input(z.object({ id: typeIdSchema(ID_PREFIX.workload) }))
    .mutation(({ ctx, input }) => ctx.services.workloads.retry({ id: input.id, caller: ctx.auth })),

  // Also the cross-tenant sweep's IDOR probe target (an id-taking read is what proves owner-scoping). It
  // carried an `@test-fixture` exemption while the sweep was its ONLY consumer; the import tracker's
  // reconnect gap-heal reads it for real now (#248 — one run to resolve, no list to drive off), so the
  // exemption is deleted rather than left standing as a false claim about who calls this.
  get: authedProcedure
    .input(z.object({ id: typeIdSchema(ID_PREFIX.workload) }))
    .query(({ ctx, input }) => ctx.services.workloads.get({ id: input.id, caller: ctx.auth })),

  list: authedProcedure
    .input(
      z
        .object({
          kind: workloadKindSchema.optional(),
          status: workloadStatusSchema.optional(),
          since: z.number().optional(),
          // The CEILING, enforced at the trust boundary (the `character.list` precedent): an over-bound ask
          // is a BAD_REQUEST naming the bound, never an unbounded run-history fetch (`WORKLOAD_LIST_MAX_LIMIT`).
          // The persistence hard cap is the internal-caller backstop.
          limit: z.number().int().min(1).max(WORKLOAD_LIST_MAX_LIMIT).optional(),
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

  // ── Schedules (the TIME dimension) — recurring auto-enqueue. Owner-scoped like the workload verbs: a
  //    SINGULAR schedule is any authed caller; a BULK schedule is BOX-OWNER-only (LAYER-1 gate here, re-checked
  //    in the verb); read/mutate-by-id collapse a foreign id to leak-free NOT_FOUND. ──
  createSchedule: authedProcedure
    .input(
      z.object({
        input: startWorkloadEnvelope,
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
        input: asStartWorkloadInput(input.input),
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
        id: typeIdSchema(ID_PREFIX.workloadSchedule),
        input: startWorkloadEnvelope.optional(),
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
        ...(input.input !== undefined ? { input: asStartWorkloadInput(input.input) } : {}),
        ...(input.cadence !== undefined ? { cadence: input.cadence } : {}),
        ...(input.mode !== undefined ? { mode: input.mode } : {}),
      });
    }),

  deleteSchedule: authedProcedure
    .input(z.object({ id: typeIdSchema(ID_PREFIX.workloadSchedule) }))
    .mutation(({ ctx, input }) => ctx.services.workloads.deleteSchedule({ id: input.id, caller: ctx.auth })),

  setScheduleEnabled: authedProcedure.input(z.object({ id: typeIdSchema(ID_PREFIX.workloadSchedule), enabled: z.boolean() })).mutation(({ ctx, input }) =>
    ctx.services.workloads.setScheduleEnabled({
      id: input.id,
      caller: ctx.auth,
      enabled: input.enabled,
    }),
  ),

  listSchedules: authedProcedure.input(z.object({ kind: workloadKindSchema.optional() }).optional()).query(({ ctx, input }) =>
    ctx.services.workloads.listSchedules({
      caller: ctx.auth,
      ...(input?.kind !== undefined ? { kind: input.kind } : {}),
    }),
  ),
});
