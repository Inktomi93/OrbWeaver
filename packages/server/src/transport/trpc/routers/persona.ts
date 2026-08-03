// transport/trpc/routers/persona — the human-persona surface (core/Tier-4-Transport.md). authed; owner-scoped
// (ownership IS the gate). Thin: validate → `ctx.services.persona.<verb>` → map errors. Input shapes
// derive from `@orb/contracts/persona`.

import { createPersonaSchema, updatePersonaSchema } from "@orb/contracts/persona";
import type { CharacterId, ChatId, PersonaId, UserId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { authedProcedure, t } from "../trpc";

// A persona backup is prose-sized; the cap only fences a hostile upload (the preset door's shape).
const MAX_PERSONA_FILE_CHARS = 2_000_000;
const ENC = new TextEncoder();
const DEC = new TextDecoder();

export const personaRouter = t.router({
  create: authedProcedure
    .input(z.object({ input: createPersonaSchema }))
    .mutation(({ ctx, input }) => ctx.services.persona.create({ principal: ctx.auth, input: input.input })),

  list: authedProcedure.query(({ ctx }) => ctx.services.persona.list({ principal: ctx.auth })),

  get: authedProcedure
    .input(z.object({ personaId: brandedId<PersonaId>() }))
    .query(({ ctx, input }) => ctx.services.persona.get({ principal: ctx.auth, personaId: input.personaId })),

  update: authedProcedure.input(z.object({ personaId: brandedId<PersonaId>(), input: updatePersonaSchema })).mutation(({ ctx, input }) =>
    ctx.services.persona.update({
      principal: ctx.auth,
      personaId: input.personaId,
      input: input.input,
    }),
  ),

  remove: authedProcedure
    .input(z.object({ personaId: brandedId<PersonaId>() }))
    .mutation(({ ctx, input }) => ctx.services.persona.remove({ principal: ctx.auth, personaId: input.personaId })),

  // PD-99: the per-participant active-persona flip (verb built + composed; this is its ONE wire surface).
  // Auth lives in the verb (`requireChatAuthorOrHost` — self or host); `personaId: null` clears the slot.
  // `targetUserId` is OPTIONAL — omitted = self (the verb defaults it to the caller); a host targeting
  // someone else passes it explicitly.
  setActivePersona: authedProcedure
    .input(
      z.object({
        chatId: brandedId<ChatId>(),
        targetUserId: brandedId<UserId>().optional(),
        personaId: brandedId<PersonaId>().nullable(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.persona.setActivePersona({
        principal: ctx.auth,
        chatId: input.chatId,
        targetUserId: input.targetUserId,
        personaId: input.personaId,
      }),
    ),

  createFromCharacter: authedProcedure.input(z.object({ characterId: brandedId<CharacterId>(), swapMacros: z.boolean() })).mutation(({ ctx, input }) =>
    ctx.services.persona.createFromCharacter({
      principal: ctx.auth,
      characterId: input.characterId,
      swapMacros: input.swapMacros,
    }),
  ),

  connectToCharacter: authedProcedure.input(z.object({ characterId: brandedId<CharacterId>(), personaId: brandedId<PersonaId>() })).mutation(({ ctx, input }) =>
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

  listConnectedToCharacter: authedProcedure.input(z.object({ characterId: brandedId<CharacterId>() })).query(({ ctx, input }) =>
    ctx.services.persona.listConnectedToCharacter({
      principal: ctx.auth,
      characterId: input.characterId,
    }),
  ),

  // FINAL-Persona §A.6b gap #2/#3 — duplicate + the export/import backup round-trip.
  duplicate: authedProcedure
    .input(z.object({ personaId: brandedId<PersonaId>() }))
    .mutation(({ ctx, input }) => ctx.services.persona.duplicate({ principal: ctx.auth, personaId: input.personaId })),

  // The two single-entity doors, both THIN ARMS over the bundle descriptor's verbs (the ratified thin-arm
  // law): the FILE is the unit on the wire, so a persona shared one-at-a-time is byte-identical to the one
  // inside a backup zip and the merge semantics can never fork.
  export: authedProcedure
    .input(z.object({ personaId: brandedId<PersonaId>() }))
    .query(async ({ ctx, input }) => {
      const file = await ctx.services.persona.export({ principal: ctx.auth, personaId: input.personaId });
      return { filename: file.filename, fileText: DEC.decode(file.bytes) };
    }),

  import: authedProcedure.input(z.object({ fileText: z.string().max(MAX_PERSONA_FILE_CHARS) })).mutation(async ({ ctx, input }) => {
    const outcome = await ctx.services.persona.import({ principal: ctx.auth, bytes: ENC.encode(input.fileText) });
    if (!outcome.ok) {
      // The refusal REASON reaches the user as words (a newer-orbweaver backup no longer reads as
      // "not a valid file") — the import door renders this message.
      throw new TRPCError({ code: "BAD_REQUEST", message: outcome.error });
    }
    return outcome.persona;
  }),
});
