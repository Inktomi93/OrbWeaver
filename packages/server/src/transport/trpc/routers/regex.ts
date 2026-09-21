// transport/trpc/routers/regex — the regex SCRIPT LIBRARY + scope-junction surface (core/Tier-4-Transport.md).
// authed; owner-scoped. Thin: validate → `ctx.services.regex.<verb>` → map errors. Input shapes derive from
// `@orb/contracts/regex` (the ONE wire home — this file re-spells nothing).
//
// CROSS-TENANT SWEEP CLASSIFICATION (the new-router rule — every proc classified):
//   • PROBED (owner-scoped, `principal.userId` in the WHERE): listScripts, createScript,
//     updateScript, removeScript, duplicateScript, attachGlobal, detachGlobal, listGlobal,
//     attachToCharacter, detachFromCharacter, listForCharacter, attachToPreset, detachFromPreset,
//     listForPreset, applyScopeOrder. A foreign id collapses to `RegexNotFoundError` — never an oracle.
//   • PROBED, SILENTLY (the REGX2 bulk arm + the export door): bulkSetEnabled, bulkSetGlobal, bulkSetPlacement,
//     bulkRemove put `ownerId` in the WHERE / gate every id through `loadOwnedScriptsByIds`, and a foreign id
//     is DROPPED rather than thrown on — the answer is the `affected` count, which is the same number for
//     "you don't own it" and "it's already gone", so the list can never be probed for membership.
//     `exportScript` collapses a foreign/absent id to `null` for the same reason (the `exportBook` posture).
//   • PROBED by CONSTRUCTION: importScriptFile writes under `principal.userId` only — the portable file
//     carries no owner and no id, so an imported script cannot land on, or reference, another owner's row.
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

import { createRegexScriptSchema, regexAttachScopeSchema, regexPlacementListSchema, updateRegexScriptSchema } from "@orb/contracts/regex";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { authedProcedure, t } from "../trpc.ts";

/** One portable script file is a handful of fields; the cap only fences a hostile upload. */
const MAX_SCRIPT_FILE_CHARS = 200_000;
/** How many scripts one bulk gesture may name — far above any real selection, low enough to bound the
 *  statement a single request can build. */
const MAX_BULK_SCRIPTS = 500;
const DEC = new TextDecoder();

const scriptIdInput = z.object({ scriptId: typeIdSchema(ID_PREFIX.regexScript) });
const scriptIdsInput = z.array(typeIdSchema(ID_PREFIX.regexScript)).max(MAX_BULK_SCRIPTS);

export const regexRouter = t.router({
  listScripts: authedProcedure.query(({ ctx }) => ctx.services.regex.listScripts({ principal: ctx.auth })),

  createScript: authedProcedure
    .input(z.object({ input: createRegexScriptSchema }))
    .mutation(({ ctx, input }) => ctx.services.regex.createScript({ principal: ctx.auth, input: input.input })),

  updateScript: authedProcedure
    .input(z.object({ scriptId: typeIdSchema(ID_PREFIX.regexScript), input: updateRegexScriptSchema }))
    .mutation(({ ctx, input }) => ctx.services.regex.updateScript({ principal: ctx.auth, scriptId: input.scriptId, input: input.input })),

  removeScript: authedProcedure
    .input(scriptIdInput)
    .mutation(({ ctx, input }) => ctx.services.regex.removeScript({ principal: ctx.auth, scriptId: input.scriptId })),

  duplicateScript: authedProcedure
    .input(scriptIdInput)
    .mutation(({ ctx, input }) => ctx.services.regex.duplicateScript({ principal: ctx.auth, scriptId: input.scriptId })),

  // ── The BULK arm (REGX2 — the library's multi-select bar) ───────────────────────────────────────────
  // Three verbs, one id-list shape. `scriptIds` is capped so a hostile caller cannot turn one request into
  // an unbounded statement; the cap is far above any real selection (the owner's library is ~34 globals).
  bulkSetEnabled: authedProcedure
    .input(z.object({ scriptIds: scriptIdsInput, enabled: z.boolean() }))
    .mutation(({ ctx, input }) => ctx.services.regex.bulkSetScriptsEnabled({ principal: ctx.auth, scriptIds: input.scriptIds, enabled: input.enabled })),

  bulkSetGlobal: authedProcedure
    .input(z.object({ scriptIds: scriptIdsInput, global: z.boolean() }))
    .mutation(({ ctx, input }) => ctx.services.regex.bulkSetScriptsGlobal({ principal: ctx.auth, scriptIds: input.scriptIds, global: input.global })),

  // REPLACE the placement set across the selection — the flags + depth scope are RE-DERIVED server-side from
  // `placement` (`@orb/kit/regex`), so the wire carries no flags. `regexPlacementListSchema` is the STRICT
  // enum-array (a garbage member is rejected, not salvaged — the card-boundary heal is the import lift's).
  bulkSetPlacement: authedProcedure
    .input(z.object({ scriptIds: scriptIdsInput, placement: regexPlacementListSchema }))
    .mutation(({ ctx, input }) => ctx.services.regex.bulkSetScriptsPlacement({ principal: ctx.auth, scriptIds: input.scriptIds, placement: input.placement })),

  bulkRemove: authedProcedure
    .input(z.object({ scriptIds: scriptIdsInput }))
    .mutation(({ ctx, input }) => ctx.services.regex.bulkRemoveScripts({ principal: ctx.auth, scriptIds: input.scriptIds })),

  // ── The two SINGLE-ENTITY DOORS (REGX2 · D121-D `band=Import · kebab=Export`) ───────────────────────
  // Both are thin arms over the backup bundle's own verbs (the `worldInfo.exportBook`/`importFile` shape),
  // so a shared script and a restored one are the same bytes. The regex family's `lifecycle-portability`
  // door cells cite exactly these two names.
  exportScript: authedProcedure.input(scriptIdInput).query(async ({ ctx, input }) => {
    const file = await ctx.services.regex.exportScript({ principal: ctx.auth, scriptId: input.scriptId });
    if (file === null) {
      throw new TRPCError({ code: "NOT_FOUND", message: "That regex script doesn't exist." });
    }
    return { filename: file.filename, fileText: DEC.decode(file.bytes) };
  }),

  // The refusal REASON is the serde's own (`DomainOperationError` → BAD_REQUEST with its message), so a file
  // written by a newer orbweaver no longer reads as "not a valid file". The import dialog renders it.
  importScriptFile: authedProcedure
    .input(z.object({ fileText: z.string().max(MAX_SCRIPT_FILE_CHARS) }))
    .mutation(({ ctx, input }) => ctx.services.regex.importScriptFile({ principal: ctx.auth, fileText: input.fileText })),

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
    .input(z.object({ characterId: typeIdSchema(ID_PREFIX.character), scriptId: typeIdSchema(ID_PREFIX.regexScript) }))
    .mutation(({ ctx, input }) => ctx.services.regex.attachToCharacter({ principal: ctx.auth, characterId: input.characterId, scriptId: input.scriptId })),

  detachFromCharacter: authedProcedure
    .input(z.object({ characterId: typeIdSchema(ID_PREFIX.character), scriptId: typeIdSchema(ID_PREFIX.regexScript) }))
    .mutation(({ ctx, input }) => ctx.services.regex.detachFromCharacter({ principal: ctx.auth, characterId: input.characterId, scriptId: input.scriptId })),

  listForCharacter: authedProcedure
    .input(z.object({ characterId: typeIdSchema(ID_PREFIX.character) }))
    .query(({ ctx, input }) => ctx.services.regex.listForCharacter({ principal: ctx.auth, characterId: input.characterId })),

  attachToPreset: authedProcedure
    .input(z.object({ presetId: typeIdSchema(ID_PREFIX.preset), scriptId: typeIdSchema(ID_PREFIX.regexScript) }))
    .mutation(({ ctx, input }) => ctx.services.regex.attachToPreset({ principal: ctx.auth, presetId: input.presetId, scriptId: input.scriptId })),

  detachFromPreset: authedProcedure
    .input(z.object({ presetId: typeIdSchema(ID_PREFIX.preset), scriptId: typeIdSchema(ID_PREFIX.regexScript) }))
    .mutation(({ ctx, input }) => ctx.services.regex.detachFromPreset({ principal: ctx.auth, presetId: input.presetId, scriptId: input.scriptId })),

  listForPreset: authedProcedure
    .input(z.object({ presetId: typeIdSchema(ID_PREFIX.preset) }))
    .query(({ ctx, input }) => ctx.services.regex.listForPreset({ principal: ctx.auth, presetId: input.presetId })),

  attachToChat: authedProcedure
    .input(z.object({ chatId: typeIdSchema(ID_PREFIX.chat), scriptId: typeIdSchema(ID_PREFIX.regexScript) }))
    .mutation(({ ctx, input }) => ctx.services.regex.attachToChat({ principal: ctx.auth, chatId: input.chatId, scriptId: input.scriptId })),

  detachFromChat: authedProcedure
    .input(z.object({ chatId: typeIdSchema(ID_PREFIX.chat), scriptId: typeIdSchema(ID_PREFIX.regexScript) }))
    .mutation(({ ctx, input }) => ctx.services.regex.detachFromChat({ principal: ctx.auth, chatId: input.chatId, scriptId: input.scriptId })),

  listForChat: authedProcedure
    .input(z.object({ chatId: typeIdSchema(ID_PREFIX.chat) }))
    .query(({ ctx, input }) => ctx.services.regex.listForChat({ principal: ctx.auth, chatId: input.chatId })),

  // D121-E host option: the room's BROADCAST display set. MEMBER-gated (the verb's injected chat guard) —
  // a non-member is refused, and a member of a room that never opted in gets `[]`.
  listRoomDisplayScripts: authedProcedure
    .input(z.object({ chatId: typeIdSchema(ID_PREFIX.chat) }))
    .query(({ ctx, input }) => ctx.services.regex.listRoomDisplayScripts({ principal: ctx.auth, chatId: input.chatId })),

  applyScopeOrder: authedProcedure
    .input(z.object({ scope: regexAttachScopeSchema, orderedScriptIds: z.array(typeIdSchema(ID_PREFIX.regexScript)) }))
    .mutation(({ ctx, input }) => ctx.services.regex.applyScopeOrder({ principal: ctx.auth, scope: input.scope, orderedScriptIds: input.orderedScriptIds })),
});
