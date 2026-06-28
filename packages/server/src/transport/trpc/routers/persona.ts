// transport/trpc/routers/persona — the human-persona surface (tiers/transport.md). authed; owner-scoped
// (ownership IS the gate). Thin: validate → `ctx.services.persona.<verb>` → map errors. Input shapes
// derive from `@orb/contracts/persona`.

import { createPersonaSchema, updatePersonaSchema } from "@orb/contracts/persona";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";
import { authedProcedure, t } from "../trpc";

export const personaRouter = t.router({
  create: authedProcedure
    .input(z.object({ input: createPersonaSchema }))
    .mutation(({ ctx, input }) =>
      ctx.services.persona.create({ principal: ctx.auth, input: input.input }),
    ),

  list: authedProcedure.query(({ ctx }) => ctx.services.persona.list({ principal: ctx.auth })),

  get: authedProcedure
    .input(z.object({ personaId: brandedId<PersonaId>() }))
    .query(({ ctx, input }) =>
      ctx.services.persona.get({ principal: ctx.auth, personaId: input.personaId }),
    ),

  update: authedProcedure
    .input(z.object({ personaId: brandedId<PersonaId>(), input: updatePersonaSchema }))
    .mutation(({ ctx, input }) =>
      ctx.services.persona.update({
        principal: ctx.auth,
        personaId: input.personaId,
        input: input.input,
      }),
    ),

  remove: authedProcedure
    .input(z.object({ personaId: brandedId<PersonaId>() }))
    .mutation(({ ctx, input }) =>
      ctx.services.persona.remove({ principal: ctx.auth, personaId: input.personaId }),
    ),

  createFromCharacter: authedProcedure
    .input(z.object({ characterId: brandedId<CharacterId>(), swapMacros: z.boolean() }))
    .mutation(({ ctx, input }) =>
      ctx.services.persona.createFromCharacter({
        principal: ctx.auth,
        characterId: input.characterId,
        swapMacros: input.swapMacros,
      }),
    ),

  connectToCharacter: authedProcedure
    .input(z.object({ characterId: brandedId<CharacterId>(), personaId: brandedId<PersonaId>() }))
    .mutation(({ ctx, input }) =>
      ctx.services.persona.connectToCharacter({
        principal: ctx.auth,
        characterId: input.characterId,
        personaId: input.personaId,
      }),
    ),

  disconnectFromCharacter: authedProcedure
    .input(z.object({ characterId: brandedId<CharacterId>(), personaId: brandedId<PersonaId>() }))
    .mutation(({ ctx, input }) =>
      ctx.services.persona.disconnectFromCharacter({
        principal: ctx.auth,
        characterId: input.characterId,
        personaId: input.personaId,
      }),
    ),

  listConnectedToCharacter: authedProcedure
    .input(z.object({ characterId: brandedId<CharacterId>() }))
    .query(({ ctx, input }) =>
      ctx.services.persona.listConnectedToCharacter({
        principal: ctx.auth,
        characterId: input.characterId,
      }),
    ),
});
