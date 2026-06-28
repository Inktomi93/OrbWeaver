// transport/trpc/routers/stats — the read-only analytics surface (tiers/transport.md). authed; every verb
// takes a positional `ownerId` that is ALWAYS the resolved `Principal.userId` (never client input — the
// single-owner row-scoping invariant). Thin: validate → `ctx.services.stats.<verb>` → map errors.
//
// FLAG[PD-47]: `leaderboard.sort` + the `latency` verb → wire when the `stats` front door re-exports
// `LEADERBOARD_SORTS` + a `latencyScopeSchema` (today it re-exports only the TYPES `LeaderboardSort`/
// `LatencyScope`). A transport router must NOT deep-import `contract/params` (front-door rule) nor re-spell
// the union inline (`no-inline-union-redecl`), so the wire enum can only derive once those tuples/schemas
// are on the index. `leaderboard` ships with `limit` (default sort `assistantTurns`); `latency` is omitted.

import type { CharacterId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";
import { authedProcedure, t } from "../trpc";

export const statsRouter = t.router({
  overview: authedProcedure.query(({ ctx }) => ctx.services.stats.overview(ctx.auth.userId)),

  character: authedProcedure
    .input(z.object({ characterId: brandedId<CharacterId>() }))
    .query(({ ctx, input }) => ctx.services.stats.character(ctx.auth.userId, input.characterId)),

  leaderboard: authedProcedure
    .input(z.object({ limit: z.number().int().positive().optional() }).optional())
    .query(({ ctx, input }) =>
      ctx.services.stats.leaderboard(ctx.auth.userId, { limit: input?.limit }),
    ),

  timeseries: authedProcedure
    .input(z.object({ from: z.string().optional(), to: z.string().optional() }).optional())
    .query(({ ctx, input }) =>
      ctx.services.stats.timeseries(ctx.auth.userId, { from: input?.from, to: input?.to }),
    ),

  byModel: authedProcedure
    .input(z.object({ limit: z.number().int().positive().optional() }).optional())
    .query(({ ctx, input }) =>
      ctx.services.stats.byModel(ctx.auth.userId, { limit: input?.limit }),
    ),

  freshness: authedProcedure.query(({ ctx }) => ctx.services.stats.freshness(ctx.auth.userId)),

  personaUsage: authedProcedure.query(({ ctx }) =>
    ctx.services.stats.personaUsage(ctx.auth.userId),
  ),

  wrapped: authedProcedure.query(({ ctx }) => ctx.services.stats.wrapped(ctx.auth.userId)),

  temporal: authedProcedure.query(({ ctx }) => ctx.services.stats.temporal(ctx.auth.userId)),

  activityHeatmap: authedProcedure.query(({ ctx }) =>
    ctx.services.stats.activityHeatmap(ctx.auth.userId),
  ),

  momentum: authedProcedure
    .input(z.object({ limit: z.number().int().positive().optional() }).optional())
    .query(({ ctx, input }) => ctx.services.stats.momentum(ctx.auth.userId, input?.limit)),
});
