// transport/trpc/routers/stats — the analytics surface (core/Tier-4-Transport.md). authed; every verb
// takes a positional `ownerId` that is ALWAYS the resolved `Principal.userId` (never client input — the
// single-owner row-scoping invariant). Thin: validate → `ctx.services.stats.<verb>` → map errors.
//
// `leaderboard.sort` derives its wire enum from the `LEADERBOARD_SORTS` tuple; `latency` re-parses the
// `latencyScopeSchema` discriminated union — both come off the `stats` front door (§7.5 derive-don't-respell;
// a transport router must NOT deep-import `contract/params` nor re-spell the union inline).

import type { CharacterId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";
import { LEADERBOARD_SORTS, latencyScopeSchema } from "#domain/stats";
import { authedProcedure, t } from "../trpc.ts";

export const statsRouter = t.router({
  overview: authedProcedure.query(({ ctx }) => ctx.services.stats.overview(ctx.auth.userId)),

  character: authedProcedure
    .input(z.object({ characterId: brandedId<CharacterId>() }))
    .query(({ ctx, input }) => ctx.services.stats.character(ctx.auth.userId, input.characterId)),

  leaderboard: authedProcedure
    .input(
      z
        .object({
          sort: z.enum(LEADERBOARD_SORTS).optional(),
          limit: z.number().int().positive().optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) => ctx.services.stats.leaderboard(ctx.auth.userId, { sort: input?.sort, limit: input?.limit })),

  timeseries: authedProcedure
    .input(z.object({ from: z.string().optional(), to: z.string().optional() }).optional())
    .query(({ ctx, input }) => ctx.services.stats.timeseries(ctx.auth.userId, { from: input?.from, to: input?.to })),

  byModel: authedProcedure
    .input(z.object({ limit: z.number().int().positive().optional() }).optional())
    .query(({ ctx, input }) => ctx.services.stats.byModel(ctx.auth.userId, { limit: input?.limit })),

  freshness: authedProcedure.query(({ ctx }) => ctx.services.stats.freshness(ctx.auth.userId)),

  personaUsage: authedProcedure.query(({ ctx }) => ctx.services.stats.personaUsage(ctx.auth.userId)),

  wrapped: authedProcedure.query(({ ctx }) => ctx.services.stats.wrapped(ctx.auth.userId)),

  temporal: authedProcedure.query(({ ctx }) => ctx.services.stats.temporal(ctx.auth.userId)),

  activityHeatmap: authedProcedure.query(({ ctx }) => ctx.services.stats.activityHeatmap(ctx.auth.userId)),

  momentum: authedProcedure
    .input(z.object({ limit: z.number().int().positive().optional() }).optional())
    .query(({ ctx, input }) => ctx.services.stats.momentum(ctx.auth.userId, input?.limit)),

  latency: authedProcedure.input(latencyScopeSchema).query(({ ctx, input }) => ctx.services.stats.latency(ctx.auth.userId, input)),

  // The ONE write on this surface: rebuild the CALLER's rollups from canon, awaited (the instant "recompute
  // my stats"). Owner-scoped by construction — `ownerId` is the resolved principal, never input — so there is
  // no id to IDOR. The all-owners sweep stays the owner-gated `reconcile-stats` workload.
  reconcile: authedProcedure.mutation(({ ctx }) => ctx.services.stats.reconcile(ctx.auth.userId)),
});
