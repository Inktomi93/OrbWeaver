// transport/trpc/routers/roster-preset — the saved-roster surface (core/Tier-4-Transport.md). authed;
// owner-scoped (ownership IS the gate — the persona router's posture); `applyToChat` additionally
// host-gated INSIDE chat via the domain's injected guard. Thin: validate →
// `ctx.services.rosterPreset.<verb>`. Input shapes derive from `@orb/contracts/roster-preset`.

import { createRosterPresetSchema } from "@orb/contracts/roster-preset";
import type { ChatId, RosterPresetId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";
import { authedProcedure, t } from "../trpc.ts";

export const rosterPresetRouter = t.router({
  create: authedProcedure
    .input(z.object({ input: createRosterPresetSchema }))
    .mutation(({ ctx, input }) => ctx.services.rosterPreset.create({ principal: ctx.auth, input: input.input })),

  update: authedProcedure
    // `update` is a FULL REPLACE of the same authored fields, member list included — ONE schema object,
    // deliberately (a roster is small enough that patch semantics would only buy drift).
    .input(z.object({ presetId: brandedId<RosterPresetId>(), input: createRosterPresetSchema }))
    .mutation(({ ctx, input }) => ctx.services.rosterPreset.update({ principal: ctx.auth, presetId: input.presetId, input: input.input })),

  remove: authedProcedure
    .input(z.object({ presetId: brandedId<RosterPresetId>() }))
    .mutation(({ ctx, input }) => ctx.services.rosterPreset.remove({ principal: ctx.auth, presetId: input.presetId })),

  list: authedProcedure.query(({ ctx }) => ctx.services.rosterPreset.list({ principal: ctx.auth })),

  get: authedProcedure
    .input(z.object({ presetId: brandedId<RosterPresetId>() }))
    .query(({ ctx, input }) => ctx.services.rosterPreset.get({ principal: ctx.auth, presetId: input.presetId })),

  applyToChat: authedProcedure
    .input(z.object({ presetId: brandedId<RosterPresetId>(), chatId: brandedId<ChatId>() }))
    .mutation(({ ctx, input }) => ctx.services.rosterPreset.applyToChat({ principal: ctx.auth, presetId: input.presetId, chatId: input.chatId })),
});
