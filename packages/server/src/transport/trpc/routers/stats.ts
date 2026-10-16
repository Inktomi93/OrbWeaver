// transport/trpc/routers/stats — the analytics surface (docs/law/Tier-4-Transport.md). authed; every verb
// takes a positional `ownerId` that is ALWAYS the resolved `Principal.userId` (never client input — the
// single-owner row-scoping invariant). Thin: validate → `ctx.services.stats.<verb>` → map errors.

import {
  activityBucketSchema,
  characterStatsViewSchema,
  latencyScopeSchema,
  latencyStatsSchema,
  leaderboardPageSchema,
  modelStatRowSchema,
  momentumBucketSchema,
  ownerStatsViewSchema,
  personaUsageRowSchema,
  reconcileStatsResultSchema,
  statsByModelInputSchema,
  statsFreshnessSchema,
  statsLeaderboardInputSchema,
  statsPersonaUsageInputSchema,
  statsTimeseriesInputSchema,
  wrappedSummarySchema,
} from "@orb/contracts/stats";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { authedProcedure, t } from "../trpc.ts";

export const statsRouter = t.router({
  overview: authedProcedure.output(ownerStatsViewSchema.nullable()).query(({ ctx }) => ctx.services.stats.overview(ctx.auth.userId)),

  character: authedProcedure
    .output(characterStatsViewSchema.nullable())
    .input(z.object({ characterId: typeIdSchema(ID_PREFIX.character) }))
    .query(({ ctx, input }) => ctx.services.stats.character(ctx.auth.userId, input.characterId)),

  leaderboard: authedProcedure
    .output(leaderboardPageSchema)
    .input(statsLeaderboardInputSchema)
    .query(({ ctx, input }) => ctx.services.stats.leaderboard(ctx.auth.userId, { sort: input?.sort, limit: input?.limit, search: input?.search })),

  // The window bounds are bucket-start instants, never calendar days: the viewer's day is decided on the
  // client, so the server takes no zone (docs/law/UI-Gates-and-Lessons.md §11.5).
  timeseries: authedProcedure
    .output(z.array(activityBucketSchema))
    .input(statsTimeseriesInputSchema)
    .query(({ ctx, input }) => ctx.services.stats.timeseries(ctx.auth.userId, { from: input?.from, to: input?.to })),

  byModel: authedProcedure
    .output(z.array(modelStatRowSchema))
    .input(statsByModelInputSchema)
    .query(({ ctx, input }) => ctx.services.stats.byModel(ctx.auth.userId, { limit: input?.limit })),

  freshness: authedProcedure.output(statsFreshnessSchema).query(({ ctx }) => ctx.services.stats.freshness(ctx.auth.userId)),

  // `characterId` is a PROJECTION filter, not an access decision: the read is scoped by
  // `personas.owner_id = principal.userId` regardless, so an id the caller does not own matches no chats
  // and returns the roster at zero — there is nothing here to IDOR.
  personaUsage: authedProcedure
    .output(z.array(personaUsageRowSchema))
    .input(statsPersonaUsageInputSchema)
    .query(({ ctx, input }) => ctx.services.stats.personaUsage(ctx.auth.userId, { characterId: input?.characterId })),

  wrapped: authedProcedure.output(wrappedSummarySchema.nullable()).query(({ ctx }) => ctx.services.stats.wrapped(ctx.auth.userId)),

  momentum: authedProcedure.output(z.array(momentumBucketSchema)).query(({ ctx }) => ctx.services.stats.momentum(ctx.auth.userId)),

  latency: authedProcedure
    .output(latencyStatsSchema)
    .input(latencyScopeSchema)
    .query(({ ctx, input }) => ctx.services.stats.latency(ctx.auth.userId, input)),

  // The ONE write on this surface: rebuild the CALLER's rollups from canon, awaited (the instant "recompute
  // my stats"). Owner-scoped by construction — `ownerId` is the resolved principal, never input — so there is
  // no id to IDOR. The all-owners sweep stays the owner-gated `reconcile-stats` workload.
  reconcile: authedProcedure.output(reconcileStatsResultSchema).mutation(({ ctx }) => ctx.services.stats.reconcile(ctx.auth.userId)),
});
