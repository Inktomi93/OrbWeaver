// transport/trpc/routers/roster-preset — the saved-roster library surface (D61; saved-rosters-design §6).
// authed; owner-scoped INSIDE every verb (the resolved `Principal` rides each call — never client input, no
// resource-role). The create/update member INPUT is the character arm of the ONE roster-member vocabulary
// (`@orb/contracts/chat` `characterMemberSpecSchema`) with `position` OMITTED (server-stamped from array
// order) — so a preset input can NEVER carry a flat characterId array or (RP-D1) an agent seat. `applyToChat`
// is a thin pass-through; its host authority lives INSIDE the injected chat chokepoints (a non-host member
// fails there with chat's own error).

import { characterMemberSpecSchema, groupConfigSchema } from "@orb/contracts/chat";
import type { ChatId, PersonaId, RosterPresetId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";
import { authedProcedure, t } from "../trpc";

// The saved character-seat input: the character arm minus `position` (derived server-side from array order).
const memberInputSchema = characterMemberSpecSchema.omit({ position: true });

// The shared write fields (create + update). `groupConfig` is the lenient room-config blob (nullish = cast
// only); it is validated at the wire AND re-parsed by the domain at write.
const writeFields = {
  name: z.string().min(1),
  description: z.string().optional(),
  anchorPersonaId: brandedId<PersonaId>().nullish(),
  groupConfig: groupConfigSchema.nullish(),
  members: z.array(memberInputSchema),
} as const;

export const rosterPresetRouter = t.router({
  create: authedProcedure.input(z.object(writeFields)).mutation(({ ctx, input }) => ctx.services.rosterPreset.create({ principal: ctx.auth, ...input })),

  update: authedProcedure
    .input(z.object({ presetId: brandedId<RosterPresetId>(), ...writeFields }))
    .mutation(({ ctx, input }) => ctx.services.rosterPreset.update({ principal: ctx.auth, ...input })),

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
