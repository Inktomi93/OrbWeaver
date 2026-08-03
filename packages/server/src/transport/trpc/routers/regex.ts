// transport/trpc/routers/regex — the regex SCRIPT LIBRARY + scope-junction surface (core/Tier-4-Transport.md).
// authed; owner-scoped. Thin: validate → `ctx.services.regex.<verb>` → map errors. Input shapes derive from
// `@orb/contracts/regex` (the ONE wire home — this file re-spells nothing).
//
// CROSS-TENANT SWEEP CLASSIFICATION (the new-router rule — every proc classified):
//   • PROBED (owner-scoped, `principal.userId` in the WHERE): listScripts, getScript, createScript,
//     updateScript, removeScript, duplicateScript, attachGlobal, detachGlobal, listGlobal,
//     attachToCharacter, detachFromCharacter, listForCharacter, attachToPreset, detachFromPreset,
//     listForPreset, applyScopeOrder. A foreign id collapses to `RegexNotFoundError` — never an oracle.
//   • PROBED, TWICE (the reverse rosters): listScriptUsage gates the SCRIPT on `principal.userId` and then
//     filters each roster on its own side — `presets.ownerId`/`characters.ownerId` in the join, and the
//     rooms through chat's injected membership filter. Owning the script does not name a foreign preset,
//     and it does not name a room the caller has been kicked from (the attachment row outlives the seat).
//   • PROBED via MEMBERSHIP (D18 — the chat scope has no ownerId to probe): attachToChat/detachFromChat are
//     HOST-gated and listForChat is MEMBER-gated, all through chat's own injected guards. The scripts named
//     in attach/detach must still be the caller's, so the room scope cannot launder a foreign script in.
//   • MEMBER-gated by design (the D121-E host option): listRoomDisplayScripts returns the HOST's display
//     scripts to a non-host member — that is the feature, and the room's opt-in flag is the gate. Off ⇒ [].
//   • EXEMPT: none.

import { createRegexScriptSchema, regexAttachScopeSchema, updateRegexScriptSchema } from "@orb/contracts/regex";
import type { CharacterId, ChatId, PresetId, RegexScriptId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";
import { authedProcedure, t } from "../trpc.ts";

const scriptIdInput = z.object({ scriptId: brandedId<RegexScriptId>() });

export const regexRouter = t.router({
  listScripts: authedProcedure.query(({ ctx }) => ctx.services.regex.listScripts({ principal: ctx.auth })),

  getScript: authedProcedure.input(scriptIdInput).query(({ ctx, input }) => ctx.services.regex.getScript({ principal: ctx.auth, scriptId: input.scriptId })),

  createScript: authedProcedure
    .input(z.object({ input: createRegexScriptSchema }))
    .mutation(({ ctx, input }) => ctx.services.regex.createScript({ principal: ctx.auth, input: input.input })),

  updateScript: authedProcedure
    .input(z.object({ scriptId: brandedId<RegexScriptId>(), input: updateRegexScriptSchema }))
    .mutation(({ ctx, input }) => ctx.services.regex.updateScript({ principal: ctx.auth, scriptId: input.scriptId, input: input.input })),

  removeScript: authedProcedure
    .input(scriptIdInput)
    .mutation(({ ctx, input }) => ctx.services.regex.removeScript({ principal: ctx.auth, scriptId: input.scriptId })),

  duplicateScript: authedProcedure
    .input(scriptIdInput)
    .mutation(({ ctx, input }) => ctx.services.regex.duplicateScript({ principal: ctx.auth, scriptId: input.scriptId })),

  // The REVERSE rosters (REGROSTER): which presets/characters/rooms attach ONE owned script. Owner-gated on
  // the script (`getScript`'s gate verbatim) AND filtered again per roster — the preset/character joins
  // carry `ownerId`, the rooms go through chat's injected membership filter.
  listScriptUsage: authedProcedure
    .input(scriptIdInput)
    .query(({ ctx, input }) => ctx.services.regex.listScriptUsage({ principal: ctx.auth, scriptId: input.scriptId })),

  attachGlobal: authedProcedure
    .input(scriptIdInput)
    .mutation(({ ctx, input }) => ctx.services.regex.attachGlobal({ principal: ctx.auth, scriptId: input.scriptId })),

  detachGlobal: authedProcedure
    .input(scriptIdInput)
    .mutation(({ ctx, input }) => ctx.services.regex.detachGlobal({ principal: ctx.auth, scriptId: input.scriptId })),

  listGlobal: authedProcedure.query(({ ctx }) => ctx.services.regex.listGlobal({ principal: ctx.auth })),

  attachToCharacter: authedProcedure
    .input(z.object({ characterId: brandedId<CharacterId>(), scriptId: brandedId<RegexScriptId>() }))
    .mutation(({ ctx, input }) => ctx.services.regex.attachToCharacter({ principal: ctx.auth, characterId: input.characterId, scriptId: input.scriptId })),

  detachFromCharacter: authedProcedure
    .input(z.object({ characterId: brandedId<CharacterId>(), scriptId: brandedId<RegexScriptId>() }))
    .mutation(({ ctx, input }) => ctx.services.regex.detachFromCharacter({ principal: ctx.auth, characterId: input.characterId, scriptId: input.scriptId })),

  listForCharacter: authedProcedure
    .input(z.object({ characterId: brandedId<CharacterId>() }))
    .query(({ ctx, input }) => ctx.services.regex.listForCharacter({ principal: ctx.auth, characterId: input.characterId })),

  attachToPreset: authedProcedure
    .input(z.object({ presetId: brandedId<PresetId>(), scriptId: brandedId<RegexScriptId>() }))
    .mutation(({ ctx, input }) => ctx.services.regex.attachToPreset({ principal: ctx.auth, presetId: input.presetId, scriptId: input.scriptId })),

  detachFromPreset: authedProcedure
    .input(z.object({ presetId: brandedId<PresetId>(), scriptId: brandedId<RegexScriptId>() }))
    .mutation(({ ctx, input }) => ctx.services.regex.detachFromPreset({ principal: ctx.auth, presetId: input.presetId, scriptId: input.scriptId })),

  listForPreset: authedProcedure
    .input(z.object({ presetId: brandedId<PresetId>() }))
    .query(({ ctx, input }) => ctx.services.regex.listForPreset({ principal: ctx.auth, presetId: input.presetId })),

  attachToChat: authedProcedure
    .input(z.object({ chatId: brandedId<ChatId>(), scriptId: brandedId<RegexScriptId>() }))
    .mutation(({ ctx, input }) => ctx.services.regex.attachToChat({ principal: ctx.auth, chatId: input.chatId, scriptId: input.scriptId })),

  detachFromChat: authedProcedure
    .input(z.object({ chatId: brandedId<ChatId>(), scriptId: brandedId<RegexScriptId>() }))
    .mutation(({ ctx, input }) => ctx.services.regex.detachFromChat({ principal: ctx.auth, chatId: input.chatId, scriptId: input.scriptId })),

  listForChat: authedProcedure
    .input(z.object({ chatId: brandedId<ChatId>() }))
    .query(({ ctx, input }) => ctx.services.regex.listForChat({ principal: ctx.auth, chatId: input.chatId })),

  // D121-E host option: the room's BROADCAST display set. MEMBER-gated (the verb's injected chat guard) —
  // a non-member is refused, and a member of a room that never opted in gets `[]`.
  listRoomDisplayScripts: authedProcedure
    .input(z.object({ chatId: brandedId<ChatId>() }))
    .query(({ ctx, input }) => ctx.services.regex.listRoomDisplayScripts({ principal: ctx.auth, chatId: input.chatId })),

  applyScopeOrder: authedProcedure
    .input(z.object({ scope: regexAttachScopeSchema, orderedScriptIds: z.array(brandedId<RegexScriptId>()) }))
    .mutation(({ ctx, input }) => ctx.services.regex.applyScopeOrder({ principal: ctx.auth, scope: input.scope, orderedScriptIds: input.orderedScriptIds })),
});
