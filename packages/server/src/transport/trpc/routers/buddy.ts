// transport/trpc/routers/buddy — the buddy-agent surface (core/Tier-4-Transport.md). authed; owner-scoped (one
// buddy per user; the borrowed-owner posture, PD-17 deferred). Thin: validate → `ctx.services.buddy.<verb>`
// → map errors. `ask`/`confirm` drive tool-using agent turns; `confirm` is the SOLE executor of a proposal.

import { z } from "zod";
import { authedProcedure, t } from "../trpc";

export const buddyRouter = t.router({
  get: authedProcedure.query(({ ctx }) => ctx.services.buddy.get({ principal: ctx.auth })),

  hatch: authedProcedure.mutation(({ ctx }) => ctx.services.buddy.hatch({ principal: ctx.auth })),

  ask: authedProcedure
    .input(z.object({ message: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      ctx.services.buddy.ask({ principal: ctx.auth, message: input.message }),
    ),

  confirm: authedProcedure
    // biome-ignore lint/plugin/no-raw-id: proposalId is the ephemeral in-memory proposal handle (buddy.md invariant #3), not a branded entity id.
    .input(z.object({ proposalId: z.string().min(1), confirmed: z.boolean() }))
    .mutation(({ ctx, input }) =>
      ctx.services.buddy.confirm({
        principal: ctx.auth,
        proposalId: input.proposalId,
        confirmed: input.confirmed,
      }),
    ),

  history: authedProcedure.query(({ ctx }) => ctx.services.buddy.history({ principal: ctx.auth })),

  clearChat: authedProcedure.mutation(({ ctx }) =>
    ctx.services.buddy.clearChat({ principal: ctx.auth }),
  ),

  setReactions: authedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(({ ctx, input }) =>
      ctx.services.buddy.setReactions({ principal: ctx.auth, enabled: input.enabled }),
    ),

  setAgency: authedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(({ ctx, input }) =>
      ctx.services.buddy.setAgency({ principal: ctx.auth, enabled: input.enabled }),
    ),
});
