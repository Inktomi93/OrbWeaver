// transport/trpc/routers/chat — the chat surface (PD-46). Thin: validate → `ctx.services.chat.<verb>`.
//
// THE ROOM STREAM LIVES ELSEWHERE (SSE-1 S2). The per-chat SSE subscription `streamMessages` is GONE: the
// chat bus is a ROOM on the tab's ONE multiplexed socket, and its generator — the live-first/replay-second
// body, the per-yield membership + D16 clamp + §3.6 member strip, and the `chatOpened`/`historyTruncated`
// attach syntheses — moved verbatim to `transport/trpc/stream/sources/chat.ts` (read its header for the
// stream law). This router keeps exactly ONE subscription: `impersonateStream`, which is permanently exempt
// from the fold (request-scoped, user-gesture-initiated, at most one at a time — its abort semantics ARE the
// socket teardown; D118, enforced by the
// `single-stream-transport` gate).

import { ASSET_LIST_LIMIT_MAX, assetIdSchema } from "@orb/contracts/assets";
import {
  CHAT_LIST_MAX_LIMIT,
  CHAT_MESSAGE_LIST_MAX_LIMIT,
  chatInjectionInputSchema,
  chatListCursorSchema,
  groupConfigSchema,
  guidedSteerSchema,
  messageContentBlockSchema,
  openingPolicySchema,
  REACTION_SPEAKER_NAME_MAX,
  reactionEmojiSchema,
  reattributeScopeSchema,
  regexTierKeySchema,
  roomOverridesSchema,
  seatKnobsSchema,
} from "@orb/contracts/chat";
import { chatDocumentVisibilitySchema } from "@orb/contracts/databank";

import { generatePictureRequestSchema } from "@orb/contracts/imagery";
import { choiceBlockValuesSchema, userIntentSchema, userMacroValuesSchema } from "@orb/contracts/preset";
import { rpgRulesetSchema } from "@orb/contracts/rpg";
import { themeBackgroundSchema } from "@orb/contracts/theme";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import type { TrackedEnvelope } from "@trpc/server";
import { tracked } from "@trpc/server";
import { z } from "zod";
import type { ImpersonateStreamDelta } from "#domain/chat";
import { toolRecurseLimitSchema } from "#domain/chat";
import { withSubscriptionErrors } from "../subscriptions.ts";
import { authedProcedure, t } from "../trpc.ts";

// `startChat` — CREATION-INTENT inputs only (D166). The former
// nine-field "draft carry" (seedGreetings/rosterOverrides/groupConfig/roomOverrides/guided, plus the
// `generate` opening arm + its `openingFailure` degrade) is GONE: R1 made every client caller create the
// real room before mounting, so those creation-time payloads were unreachable product surface. Post-create
// roster tuning, group config, room overrides and greeting edits ride their own already-built verbs
// (`setSeatKnobs`/`setGroupConfig`/`setRoomOverrides`/`editMessage`/`setSeededGreeting`) against the real
// room instead. `opening` EXCLUDES `"generate"` — "guide the opening" is now an ordinary post-creation
// `chat.generate` action against the real room, never a creation-fused turn.
const startChatSchema = z.object({
  characterIds: z.array(typeIdSchema(ID_PREFIX.character)),
  anchorPersonaId: typeIdSchema(ID_PREFIX.persona).nullish(),
  title: z.string().nullish(),
  opening: openingPolicySchema.exclude(["generate"]).optional(),
  injections: z.array(chatInjectionInputSchema).optional(),
  // ST "Temporary Chat" (PD-65) — born ephemeral: persisted so turns can run, hidden from `listChats`
  // ALWAYS, swept by `reapTemporaryChats` once past the caller's own TTL. Creation-only BY DESIGN (a fork
  // is born non-temporary; no verb updates the column), so this is the ONE place the flag can be set.
  temporary: z.boolean().optional(),
  // #40 DRAFT-TIME game start — mints the lite game right after chat creation, BEFORE the opening turn
  // (turn 1 in-game). `ruleset` rides rpg's own setting schema (the trust boundary); omit = `freeform`.
  startAsGame: z.object({ ruleset: rpgRulesetSchema.optional() }).optional(),
});

// `getMemberCard` (D22) — read ONE roster character's card, field-clamped to the room's `memberCardVisibility`.
// Member-gated + roster-scoped INSIDE the verb (`requireParticipant` + a present-character-seat check on
// `characterId`), so a stranger's chatId OR a not-in-roster characterId is a leak-free NOT_FOUND (the
// `getChat`/`listMessages` member-gated collapse). Fields above the effective level are NULL server-side —
// never sent over the wire. Cross-tenant sweep: PROBED (the chatId gate refuses before any card load).
const getMemberCardSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  characterId: typeIdSchema(ID_PREFIX.character),
});

const listMessagesSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  beforeSeq: z.number().optional(),
  // The CEILING, enforced at the trust boundary (the `character.list` precedent): an over-bound ask is a
  // BAD_REQUEST naming the bound, never an unbounded canon fetch (`CHAT_MESSAGE_LIST_MAX_LIMIT`). The domain
  // still applies its own DoS backstop for internal callers.
  limit: z.number().int().min(1).max(CHAT_MESSAGE_LIST_MAX_LIMIT).optional(),
});

// The swipe strip's step-target resolver (chat-surface-lane follow-up to #19): `ChatService.listMessageVariants`
// (domain/chat/verbs/read.ts createListMessageVariants) returns the full sibling-variant set for a slot —
// `{variantId, idx}[]`, no content — so a step to an idx this session hasn't rendered (e.g. a cold page
// load) resolves through the real list instead of only what `useVariantHistory` observed live. Member-gated
// (a read, unlike `selectVariant`'s author-or-host — see `substrate/auth/matrix.ts`).
const listMessageVariantsSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  messageId: typeIdSchema(ID_PREFIX.message),
});

const sendSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  content: z.string(),
  personaId: typeIdSchema(ID_PREFIX.persona).nullish(),
  blocks: z.array(messageContentBlockSchema).optional(),
  // #67 — inline images the user attached (asset ids). The send verb TRUST-BOUNDARY-checks each is the
  // actor's own asset (rejecting a foreign/gone id), then persists a `message_assets` row + a body ref per id.
  attachmentAssetIds: z.array(assetIdSchema).max(ASSET_LIST_LIMIT_MAX).optional(),
  intent: userIntentSchema.optional(),
  guided: guidedSteerSchema.optional(),
});

// `commitMessage` — the D56 "Simple Send" / post-without-generate lever: `sendSchema` MINUS intent/guided (no
// generation ⇒ no gen-config, no steer). The verb runs `send`'s trust boundaries + persist; no AI round.
const commitMessageSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  content: z.string(),
  personaId: typeIdSchema(ID_PREFIX.persona).nullish(),
  blocks: z.array(messageContentBlockSchema).optional(),
  attachmentAssetIds: z.array(assetIdSchema).max(ASSET_LIST_LIMIT_MAX).optional(),
});

const swipeSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  messageId: typeIdSchema(ID_PREFIX.message),
  intent: userIntentSchema.optional(),
  guided: guidedSteerSchema.optional(),
});

// The remaining guided-generation verbs (chat-surface-lane task #27 — the composer WAND):
// `ChatService.continueTurn`/`impersonateStream`/`generate` (domain/chat/verbs/turn.ts createContinueTurn/
// createImpersonateStream/createGenerate). continueTurn/generate persist + bus-emit + are mutations;
// `impersonateStream` is the NON-PERSISTING, STREAMING one (owner ruling) — a SUBSCRIPTION that yields text
// deltas the composer fills progressively, writing no canon (wired below as a subscription, not here). Every
// generating verb threads an optional `guided: GuidedSteer` steer. continueTurn is messageId-scoped; the
// rest are chatId-scoped.
const continueTurnSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  messageId: typeIdSchema(ID_PREFIX.message),
  intent: userIntentSchema.optional(),
  guided: guidedSteerSchema.optional(),
});

// The continue undo/redo pair (guided Phase-1 Lane C — F2): `ChatService.undoContinue`/`revertContinue`
// (domain/chat/verbs/turn.ts createUndoContinue/createRevertContinue) were fully implemented + int-tested
// (participant-gated, chat-scoped snapshot restore over the D26 `preContinue*`/`lastContinuation*` columns,
// `messageCommitted`-emitting) but never exposed on this router. NOT generating verbs — they restore the
// selected variant's stored snapshot in place, so NO steer/intent rides them; the shape is just
// `swipe`-minus-the-guidance (a messageId-scoped pointer restore). A never-continued target is refused
// `no_continuation` inside the verb (a ChatOperationError → BAD_REQUEST via the error map, never a 500).
const restoreContinueSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  messageId: typeIdSchema(ID_PREFIX.message),
});

const impersonateStreamSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  personaId: typeIdSchema(ID_PREFIX.persona).nullish(),
  intent: userIntentSchema.optional(),
  guided: guidedSteerSchema.optional(),
});

const generateSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  speakerCharacterId: typeIdSchema(ID_PREFIX.character).nullish(),
  intent: userIntentSchema.optional(),
  guided: guidedSteerSchema.optional(),
  // The wand Response icon sets this when the tail is an assistant turn — the `responseNudge` gate (a reply
  // after the model's own line needs something to respond to; a user-tail Response omits it).
  afterAssistant: z.boolean().optional(),
});

// The step-BACK verb (task #19 — swipe-strip's left chevron): `ChatService.selectVariant`
// (domain/chat/verbs/edit.ts createSelectVariant) was already fully implemented — author-or-host gate,
// sibling-ownership belt, the runtime-variables re-fold for the newly-selected pointer, `variantSelected`
// emit — but had never been exposed on this router (the same MISSING-API shape `abort` was in before
// 2026-07-04c; swept via grep before this addition, no call site referenced `chat.selectVariant`). Thin
// pass-through, same shape as `swipe` + an explicit `variantId` (a pointer move, not a generation).
const selectVariantSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  messageId: typeIdSchema(ID_PREFIX.message),
  variantId: typeIdSchema(ID_PREFIX.messageVariant),
});

// The Stop verb (task #18 — the composer's mid-stream STOP): `ChatService.abort` (domain/chat/verbs/
// turn.ts createAbort) was already fully implemented — active-turns registry, turn-owner-only, an
// idempotent no-op with nothing in flight — but had never been exposed on this router (MISSING-API,
// swept via `sg`/grep before this addition; no test or call site referenced `chat.abort`). Thin
// pass-through, same shape as `getChat` (chatId only — `AbortParams extends ChatScopedParams {}`).
const abortSchema = z.object({ chatId: typeIdSchema(ID_PREFIX.chat) });

// The per-message ACTION cluster (edit-in-place · hide-from-AI · delete · fork; the chat-surface lane's
// task #24-adjacent brief): `editMessage`/`setMessageHidden`/`deleteMessages`/`forkChat`
// (domain/chat/verbs/edit.ts + fork.ts) were ALL already fully implemented — author-or-host gated,
// D26-correct, bus-emitting — but none had ever been exposed on this router (the SAME MISSING-API
// shape `abort`/`selectVariant` were in before 2026-07-04c; swept via grep before this addition, no
// call site referenced any of the four). Thin pass-throughs, same shape as their sibling verbs above.
const editMessageSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  messageId: typeIdSchema(ID_PREFIX.message),
  content: z.string(),
});

// R3 §4.8/F6 — step a seeded greeting onto another of its card's alternates. The input carries an INDEX
// and NO TEXT on purpose (see `SetSeededGreetingParams`): the verb resolves the bytes from the card, so this
// host-gated door can never be a free-text content write standing beside `editMessage`'s author-or-host one.
// `int().min(0)` at the trust boundary — a negative/fractional index is a malformed ask, not a miss.
const setSeededGreetingSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  messageId: typeIdSchema(ID_PREFIX.message),
  greetingIndex: z.number().int().min(0),
});

const setMessageHiddenSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  messageId: typeIdSchema(ID_PREFIX.message),
  hidden: z.boolean(),
});

const deleteMessagesSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  messageIds: z.array(typeIdSchema(ID_PREFIX.message)),
});

// `reattributePersona` (task #60 — the persona-attribution / {{user}} history fix; neo `usePersonaReattribute`
// / ST `#persona_sync_name`): re-stamp a set of USER rows' `personaId`. Author-or-host PER row + role/ownership
// belts are enforced INSIDE the verb (no router-level authz — the sibling canon-edit shape). `scope` picks the
// rows: `{kind:"messages"}` for an explicit set (one row or a client-assembled batch), `{kind:"mine"}` for the
// server-resolved "every row I authored" bulk arm (FINAL-Persona §A.7 — the arm that retired the client's
// 100-message window).
const reattributePersonaSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  scope: reattributeScopeSchema,
  personaId: typeIdSchema(ID_PREFIX.persona),
});

// `throughSeq`/`title` mirror `ForkChatParams` (D27 deep copy — throughSeq truncates the copy to a
// message's `seq`, the "fork at this point" affordance the actions row's Fork button drives).
const forkChatSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  throughSeq: z.number().optional(),
  title: z.string().nullish(),
});

// The CONTEXT-panel cluster (task #28 — the chat right-region: room-overrides · preview-request ·
// manual injections). Same MISSING-API shape as the clusters above: `setRoomOverrides`/
// `getRoomOverridesForChat` (verbs/participants.ts), `previewAssembly` (verbs/read.ts), and
// `setChatInjection`/`listChatInjections`/`deleteChatInjection` (verbs/chat-lifecycle.ts) were ALL
// already fully implemented — host/member gated via substrate/auth/matrix.ts, DB-backed where relevant,
// bus-emitting — but none had ever been exposed on this router (swept via grep before this addition, no
// call site referenced any). Thin pass-throughs; authz lives INSIDE each verb (the sibling-cluster shape).
// The wire input schemas are DERIVED from contracts (`roomOverridesSchema`, `chatInjectionInputSchema`) —
// no re-spelled union at the transport edge (§5.5). `previewAssembly` is a host-only READ (the assembled
// prompt + trace is a debug surface); `getRoomOverridesForChat`/`peekPrompt`/`previewSection` stay
// unexposed for now (the room read rides `getChat`'s `ChatDetail.roomOverrides`; the member preview
// affordance is deferred — task #28 flag).
const setRoomOverridesSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  overrides: roomOverridesSchema,
});

// `setChatDocumentVisibility` (D85) — the host's per-document databank retrieval-visibility override. The wire
// schema DERIVES from `@orb/contracts/databank` (documentId-typed hidden set); authz (`requireHost`) lives
// INSIDE the verb, so a stranger's chatId collapses to a leak-free NOT_FOUND (the setRoomOverrides shape).
const setChatDocumentVisibilitySchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  visibility: chatDocumentVisibilitySchema,
});

// `setChatBackground` (BG-C) — the host's per-chat carried background source. The wire schema DERIVES from
// `@orb/contracts/theme` (`themeBackgroundSchema`); authz (`requireHost`) + the asset-ownership gate live
// INSIDE the verb, so a stranger's chatId collapses to a leak-free NOT_FOUND (the setRoomOverrides shape).
const setChatBackgroundSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  background: themeBackgroundSchema,
});

// `setToolRecurseLimit` — the host's per-chat tool-call recursion cap. `limit` DERIVES from the domain's
// `toolRecurseLimitSchema` (int 1..20); authz (`requireHost`) lives INSIDE the verb, so a stranger's chatId
// collapses to a leak-free NOT_FOUND (the setRoomOverrides shape).
const setToolRecurseLimitSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  limit: toolRecurseLimitSchema,
});

// WAVE MU: the per-chat user-macro INPUT picks flush — a member writes the nested macro→input→typed-pick bag
// to `chats.user_macro_values`. Authz (`requireParticipant`) lives INSIDE the verb, so a stranger's chatId is
// a leak-free NOT_FOUND (the setVariables/member shape). `userMacroValuesSchema` bounds the bag at the wire.
const setUserMacroValuesSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  values: userMacroValuesSchema,
});

// #24: the picks pane's read — the pickable user-macro DECLARATIONS + the room's stored picks. Member-gated
// INSIDE the verb (`requireParticipant`), so a stranger's chatId is a leak-free NOT_FOUND.
const getUserMacroPicksSchema = z.object({ chatId: typeIdSchema(ID_PREFIX.chat) });

// The picks pane's ChoiceBlock half — the `setUserMacroValues`/`getUserMacroPicks` pair's sibling (one pane,
// two knob families). `setVariables` flushes the FLAT per-chat picks bag to `chats.variableValues` (bounded
// at the wire by the DERIVED `choiceBlockValuesSchema`); `getVariablePicks` reads the declared variables +
// those picks back. Both are member-gated (`requireParticipant`) INSIDE the verb, so a stranger's chatId is
// a leak-free NOT_FOUND.
const setVariablesSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  values: choiceBlockValuesSchema,
});
const getVariablePicksSchema = z.object({ chatId: typeIdSchema(ID_PREFIX.chat) });
const getRuntimeVariablesSchema = z.object({ chatId: typeIdSchema(ID_PREFIX.chat) });

// B6/MR0 — the reaction plane. `emoji` DERIVES `reactionEmojiSchema` (the closed contracts vocabulary; no
// inline re-spell), which is what keeps an arbitrary member-authored string out of a column every other
// member's transcript renders. Both procs are MEMBER-gated (`requireParticipant`) INSIDE the verb, so a
// stranger's chatId is a leak-free NOT_FOUND — and the `variantId` half carries its own belt in the verb (in
// THIS chat, at or above the caller's D16 floor), the `getVariantWire` two-gate shape.
const toggleReactionSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  variantId: typeIdSchema(ID_PREFIX.messageVariant),
  emoji: reactionEmojiSchema,
  // B7/MR3 — the segment CLAIM (absent = whole-message). The wire carries an index + the client's claimed
  // speaker ONLY; the verb re-parses the variant's CANON itself and stores ITS OWN speaker + snippet, so
  // free text never crosses this boundary into a rendered column (the emoji-vocabulary posture). The name
  // cap DERIVES the contracts bound (the `<speaker>` tag grammar's own).
  segmentIndex: z.number().int().min(0).optional(),
  segmentSpeaker: z.string().max(REACTION_SPEAKER_NAME_MAX).nullable().optional(),
});
const listReactionsSchema = z.object({ chatId: typeIdSchema(ID_PREFIX.chat) });

// speakerCharacterId/guided mirror `PreviewAssemblyParams` (a hypothetical per-speaker turn); `guided`
// rides the DERIVED `guidedSteerSchema` (F6 — the same wire boundary as `send`/`generate` above).
// `presetOverride` (D121-G) is the preset editor's BOUND Prompt readout:
// assemble this room as if that preset were active, so its rack rows can be priced for real. It is resolved
// owned-or-system under the HOST by the landed `presetOverride` seam (the `previewActionTemplates` rule), so
// it cannot reach outside the host's library; the host gate itself is `requireHost` INSIDE the verb.
const previewAssemblySchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  speakerCharacterId: typeIdSchema(ID_PREFIX.character).nullish(),
  guided: guidedSteerSchema.optional(),
  presetOverride: typeIdSchema(ID_PREFIX.preset).optional(),
});

// `previewActionTemplates` — the preset editor's BOUND readout: every
// ACTION template of `presetId`, resolved against this chat. Host-gated (`requireHost`) INSIDE the verb
// (matrix `previewActionTemplates: "host"` — a rendered template carries full-fidelity card bytes). The
// `presetId` OVERRIDE is resolved owned-or-system under the HOST by the landed `presetOverride` seam, so it
// cannot reach outside the host's library; a stranger's chatId is a leak-free NOT_FOUND before any render,
// which is what the cross-tenant sweep classifies it PROBED for.
const previewActionTemplatesSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  presetId: typeIdSchema(ID_PREFIX.preset),
});

// `getShapeTrace` (PD-132) — the content-free SHAPE trace for the next-turn shaping of the current canon.
// `speakerCharacterId` picks the primary speaker the peek shapes for (mirrors `peekPrompt`); host-gated
// (`requireHost`) INSIDE the verb (matrix `getShapeTrace: "host"`).
const getShapeTraceSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  speakerCharacterId: typeIdSchema(ID_PREFIX.character).nullish(),
});

// `getVariantWire` — the per-variant WIRE RECORD: what ONE PAST generation actually sent (`promptSnapshot` +
// `params` + `macroDraws`). HOST-gated (`requireHost`) INSIDE the verb (matrix `getVariantWire: "host"`), for
// the same reason the rest of the preview family is: a stored assembled prompt carries FULL-fidelity roster
// cards (the D22 bypass), the hidden-class spans the §3.6 member strip removes, and history below a clamped
// member's D16 floor. BOTH ids are foreign-referenceable, and BOTH are gated: `chatId` by `requireHost`, and
// `variantId` by the query's `messages.chatId` join — so the cross-tenant sweep classifies it PROBED (a
// stranger, and a host passing another room's variantId, both get the SAME leak-free NOT_FOUND).
// FRESHNESS: IMMUTABLE — a committed variant's stamped prompt/params/draws never change (an edit mints a
// new variant, a swipe appends one), so this read carries NO `BUS_FILTERS` row and no invalidation target;
// the client caches it forever (the `connection.orGenerationCost` class, PD-137).
const getVariantWireSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  variantId: typeIdSchema(ID_PREFIX.messageVariant),
});

// `previewContextFit` (PD-#7) — the present-tense fit budget for the current canon (the transcript divider's
// live source). Member-gated (`requireParticipant`) INSIDE the verb (matrix `previewContextFit: "member"`);
// reads tenant canon by chatId, so the cross-tenant sweep classifies it PROBED.
const previewContextFitSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  speakerCharacterId: typeIdSchema(ID_PREFIX.character).nullish(),
});

// `setChatInjection` upserts (id present ⇒ update, absent ⇒ create); the contracts schema owns the
// authored fields (position/depth/role/content/order + the optional id), the router adds the chatId.
const setChatInjectionSchema = chatInjectionInputSchema.extend({
  chatId: typeIdSchema(ID_PREFIX.chat),
});

const listChatInjectionsSchema = z.object({ chatId: typeIdSchema(ID_PREFIX.chat) });

const deleteChatInjectionSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  injectionId: typeIdSchema(ID_PREFIX.chatInjection),
});

// The CHAT-ROW lifecycle cluster (J5 chat-list — the LIST-panel row kebab: rename/star/archive/delete).
// `updateTitle`/`star`/`archive`/`delete` (domain/chat/verbs/chat-lifecycle.ts) were ALL already fully
// implemented — HOST-only via `requireHost` (substrate/auth/matrix.ts), DB-backed, bus-emitting
// (`chatUpdated`/`chatDeleted`) — but none had ever been exposed on this router (the SAME MISSING-API shape
// the #28/#29 clusters + the guided-generations cluster were in; swept via grep before this addition, no
// call site referenced any of the four). Thin pass-throughs; authz lives INSIDE each verb. `title` is
// required + nullable (`UpdateTitleParams.title: string | null` — null clears the title).
const updateTitleSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  title: z.string().nullable(),
});

const starChatSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  starred: z.boolean(),
});

const archiveChatSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  archived: z.boolean(),
});

// `delete` is chatId-only (`DeleteChatParams extends ChatScopedParams {}` — same shape as `getChat`/`abort`).
const deleteChatSchema = z.object({ chatId: typeIdSchema(ID_PREFIX.chat) });

// `setChatAnchorPersona` (FINAL-Persona §A.0/§A.6b gap #2) — the manual/host Anchor (#4) re-pin.
// `personaId: null` clears the pin. Host-only + the present-human ownership belt live INSIDE the verb.
const setChatAnchorPersonaSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  personaId: typeIdSchema(ID_PREFIX.persona).nullable(),
});

// The GROUP-ROSTER-CONTROLS cluster (task #29 — the cast bar + per-member controls): the two
// per-member setters `setParticipantDisabled` (mute/unmute) + `setParticipantTalkativeness` (the 0–1
// `natural`-policy sampling weight) and `forceCharacterTurn` (host summons one member to speak next)
// were ALL already fully implemented in domain/chat (verbs/participants.ts + verbs/turn.ts) — host-gated via
// substrate/auth/matrix.ts, DB-backed (chatParticipants columns), bus-emitting — but none had ever been
// exposed on this router (the same MISSING-API shape the #28 CONTEXT-panel cluster + the guided-generations
// cluster were in; swept via grep before this addition, no call site referenced any of the three). Thin
// pass-throughs; authz lives INSIDE each verb (`requireHost`, the sibling-cluster shape). `forceCharacterTurn`
// mirrors `generate` minus the persona/speaker knobs (chatId + the target characterId + the optional
// intent/guided steer — the DERIVED `userIntentSchema`/`guidedSteerSchema` wire boundary, as `send`/`generate`).
// NOTE (#29): a MUTED member is still force-summonable — mute is passive arbitration exclusion, not a host-
// override block (the verb's presence-only target check, verbs/turn.ts).
// Add a character to an existing chat's roster (J7 add-member — the character-bar "+"). Host-only INSIDE the
// verb (`requireHost`) + the PD-21 single-owner invariant (a foreign character reads as missing, leak-
// free) — this router row is a thin pass-through, the same shape as the sibling roster cluster.
const addCharacterToChatSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  characterId: typeIdSchema(ID_PREFIX.character),
});

// `removeCharacterFromChat` — the symmetric drop for `addCharacterToChat` (cast-row "Remove from chat").
// Host-only INSIDE the verb (`requireHost`); leftSeq-stamps the seat out (reversible via re-add), IDEMPOTENT
// on an absent/already-left character. Same {chatId, characterId} wire shape as the add — thin pass-through.
const removeCharacterFromChatSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  characterId: typeIdSchema(ID_PREFIX.character),
});

// `setSeatKnobs` (D80) — the ONE participantId-keyed AI-seat knob write, the replacement for the retired
// per-kind forking (`setParticipantDisabled`/`setParticipantTalkativeness`/`setAgentSeatDisabled` — the
// pattern that guaranteed skipped arms, e.g. agent talkativeness was unsettable). Host-gated INSIDE the verb
// (`requireHost`) + present-AI-seat-scoped (a human/observer seat → participant_not_found). The wire `patch`
// is the ONE-HOME `seatKnobsSchema` (`@orb/contracts/chat`): both knobs optional, talkativeness RANGE-clamped.
const setSeatKnobsSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  participantId: typeIdSchema(ID_PREFIX.chatParticipant),
  patch: seatKnobsSchema,
});

// Group config (verbs/participants.ts `setGroupConfig`/`getGroupConfigForChat`) — the same domain-ahead-of-
// transport MISSING-API shape as the clusters above (host-gated write / member read, INSIDE the verb).
// The wire input is the contracts `groupConfigSchema` (the lenient `GroupConfigInput` the verb parses →
// a fully-defaulted `GroupConfig`); the router only adds `chatId`. The chat's CONTEXT-panel group editor
// consumes these (draft chats edit the draft-config store instead — the pre-send carry).
const setGroupConfigSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  config: groupConfigSchema,
});
const getGroupConfigSchema = z.object({ chatId: typeIdSchema(ID_PREFIX.chat) });

const forceCharacterTurnSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  characterId: typeIdSchema(ID_PREFIX.character),
  intent: userIntentSchema.optional(),
  guided: guidedSteerSchema.optional(),
});

export const chatRouter = t.router({
  startChat: authedProcedure.input(startChatSchema).mutation(({ ctx, input }) => ctx.services.chat.startChat({ principal: ctx.auth, ...input })),
  // Keyset-paged (the `character.list` precedent). `cursor` rides as ONE input field because tRPC's
  // `infiniteQueryOptions` threads exactly one `cursor` through as the page param, overwriting it wholesale
  // per next-page fetch. `.nullish()` on it because `getNextPageParam` hands back the page's own
  // `nextCursor`, which is `null` at the end of the keyset (the `databank.list` precedent).
  // `characterId` is the D18 PROJECTION filter — "her threads" resolved server-side, so a character screen
  // stops pulling the whole library to find three rows.
  listChats: authedProcedure
    .input(
      z
        .object({
          includeArchived: z.boolean().optional(),
          characterId: typeIdSchema(ID_PREFIX.character).optional(),
          search: z.string().optional(),
          beforeRecencyAt: z.number().int().optional(),
          // The CEILING, enforced at the trust boundary (the `character.list` precedent): an over-bound ask
          // is a BAD_REQUEST naming the bound, never an unbounded library fetch (`CHAT_LIST_MAX_LIMIT`).
          limit: z.number().int().min(1).max(CHAT_LIST_MAX_LIMIT).optional(),
          cursor: chatListCursorSchema.nullish(),
        })
        .optional(),
    )
    .query(({ ctx, input }) =>
      ctx.services.chat.listChats({
        principal: ctx.auth,
        ...(input?.includeArchived !== undefined ? { includeArchived: input.includeArchived } : {}),
        ...(input?.characterId !== undefined ? { characterId: input.characterId } : {}),
        ...(input?.search !== undefined ? { search: input.search } : {}),
        ...(input?.beforeRecencyAt !== undefined ? { beforeRecencyAt: input.beforeRecencyAt } : {}),
        ...(input?.limit !== undefined ? { limit: input.limit } : {}),
        ...(input?.cursor !== undefined && input.cursor !== null ? { cursor: input.cursor } : {}),
      }),
    ),
  getChat: authedProcedure
    .input(z.object({ chatId: typeIdSchema(ID_PREFIX.chat) }))
    .query(({ ctx, input }) => ctx.services.chat.getChat({ principal: ctx.auth, chatId: input.chatId })),
  // The honest-refusal pre-send gate (#54): the deterministic serveability verdict for the chat's own
  // resolved connection — the composer disables SEND + the guided fire actions when `!available`. Member-gated
  // inside the verb; fires no turn/API call (a configured hosted connection reads available, never pre-flighted).
  checkSendAvailability: authedProcedure
    .input(z.object({ chatId: typeIdSchema(ID_PREFIX.chat) }))
    .query(({ ctx, input }) => ctx.services.chat.checkSendAvailability({ principal: ctx.auth, chatId: input.chatId })),
  // D22 member-card read — member-gated + roster-scoped INSIDE the verb (leak-free NOT_FOUND for a
  // non-participant OR a not-in-roster characterId); level-clamped fields are NULL server-side.
  getMemberCard: authedProcedure.input(getMemberCardSchema).query(({ ctx, input }) => ctx.services.chat.getMemberCard({ principal: ctx.auth, ...input })),
  // A paged canon read (D26), member-gated (`requireParticipant` inside the verb — leak-free NOT_FOUND
  // for a non-member, the same collapse `getChat` uses). `beforeSeq`/`limit` page backwards from the tail.
  listMessages: authedProcedure.input(listMessagesSchema).query(({ ctx, input }) => ctx.services.chat.listMessages({ principal: ctx.auth, ...input })),
  // The swipe strip's step-target resolver (see the schema's header note above).
  listMessageVariants: authedProcedure
    .input(listMessageVariantsSchema)
    .query(({ ctx, input }) => ctx.services.chat.listMessageVariants({ principal: ctx.auth, ...input })),
  send: authedProcedure.input(sendSchema).mutation(({ ctx, input }) => ctx.services.chat.send({ principal: ctx.auth, ...input })),
  commitMessage: authedProcedure.input(commitMessageSchema).mutation(({ ctx, input }) => ctx.services.chat.commitMessage({ principal: ctx.auth, ...input })),
  swipe: authedProcedure.input(swipeSchema).mutation(({ ctx, input }) => ctx.services.chat.swipe({ principal: ctx.auth, ...input })),
  selectVariant: authedProcedure.input(selectVariantSchema).mutation(({ ctx, input }) => ctx.services.chat.selectVariant({ principal: ctx.auth, ...input })),
  // The three guided-generations verbs (see the schemas' header note above).
  continueTurn: authedProcedure.input(continueTurnSchema).mutation(({ ctx, input }) => ctx.services.chat.continueTurn({ principal: ctx.auth, ...input })),
  // The continue undo/redo pair (Lane C — F2; see restoreContinueSchema's header note above).
  undoContinue: authedProcedure.input(restoreContinueSchema).mutation(({ ctx, input }) => ctx.services.chat.undoContinue({ principal: ctx.auth, ...input })),
  revertContinue: authedProcedure
    .input(restoreContinueSchema)
    .mutation(({ ctx, input }) => ctx.services.chat.revertContinue({ principal: ctx.auth, ...input })),
  // Guided impersonate is NON-PERSISTING (owner ruling) and STREAMING: a SUBSCRIPTION that yields text deltas
  // as the user's next line generates, so the composer fills progressively (not a one-shot dump at the end) —
  // the client accumulates the deltas into the composer draft. Writes no user turn; the user commits it with a
  // normal send. Replaced the persisting `impersonate` (flash-and-vanish on the post-commit refetch race) + its
  // one-shot draft mutation (text plopped in after the wait). chatId-scoped, participant-gated inside the verb;
  // `signal` (subscription teardown) cancels the in-flight generation, keeping the partial text in the composer.
  impersonateStream: authedProcedure
    .input(impersonateStreamSchema)
    .subscription(({ ctx, input, signal }) =>
      withSubscriptionErrors(
        trackedImpersonationDeltas(ctx.services.chat.impersonateStream({ principal: ctx.auth, ...input, signal: signal ?? new AbortController().signal })),
      ),
    ),
  generate: authedProcedure.input(generateSchema).mutation(({ ctx, input }) => ctx.services.chat.generate({ principal: ctx.auth, ...input })),
  abort: authedProcedure.input(abortSchema).mutation(({ ctx, input }) => ctx.services.chat.abort({ principal: ctx.auth, ...input })),
  // The per-message ACTION cluster's four verbs (see the schemas' header note above).
  editMessage: authedProcedure.input(editMessageSchema).mutation(({ ctx, input }) => ctx.services.chat.editMessage({ principal: ctx.auth, ...input })),
  setSeededGreeting: authedProcedure
    .input(setSeededGreetingSchema)
    .mutation(({ ctx, input }) => ctx.services.chat.setSeededGreeting({ principal: ctx.auth, ...input })),
  setMessageHidden: authedProcedure
    .input(setMessageHiddenSchema)
    .mutation(({ ctx, input }) => ctx.services.chat.setMessageHidden({ principal: ctx.auth, ...input })),
  deleteMessages: authedProcedure.input(deleteMessagesSchema).mutation(({ ctx, input }) => ctx.services.chat.deleteMessages({ principal: ctx.auth, ...input })),
  reattributePersona: authedProcedure
    .input(reattributePersonaSchema)
    .mutation(({ ctx, input }) => ctx.services.chat.reattributePersona({ principal: ctx.auth, ...input })),
  forkChat: authedProcedure.input(forkChatSchema).mutation(({ ctx, input }) => ctx.services.chat.forkChat({ principal: ctx.auth, ...input })),
  // The CONTEXT-panel cluster (task #28 — see the schemas' header note above). Thin pass-throughs.
  setRoomOverrides: authedProcedure
    .input(setRoomOverridesSchema)
    .mutation(({ ctx, input }) => ctx.services.chat.setRoomOverrides({ principal: ctx.auth, ...input })),
  setChatDocumentVisibility: authedProcedure
    .input(setChatDocumentVisibilitySchema)
    .mutation(({ ctx, input }) => ctx.services.chat.setChatDocumentVisibility({ principal: ctx.auth, ...input })),
  // BG-C — the host's per-chat carried background (host-gated + asset-ownership-gated INSIDE the verb).
  setChatBackground: authedProcedure
    .input(setChatBackgroundSchema)
    .mutation(({ ctx, input }) => ctx.services.chat.setChatBackground({ principal: ctx.auth, ...input })),

  // D121-E display-tier room OPTION — host-gated in the verb (a member's call is a refusal, not a no-op).
  setHostDisplayScripts: authedProcedure
    .input(z.object({ chatId: typeIdSchema(ID_PREFIX.chat), enabled: z.boolean() }))
    .mutation(({ ctx, input }) => ctx.services.chat.setHostDisplayScripts({ principal: ctx.auth, ...input })),

  // #1742 — the room's regex levers (the Regex section's master + one switch per tier). Host-gated in the
  // verb like every other `chatMetadata` write here; ONE lever per call because the write is one JSON path
  // (#1450). The tier key is validated by the contracts schema, so a lever naming a tier this build cannot
  // address is refused at the door rather than stored as a flag nothing draws.
  setRegexAllow: authedProcedure
    .input(
      z.object({
        chatId: typeIdSchema(ID_PREFIX.chat),
        lever: z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("master"), enabled: z.boolean() }),
          z.object({ kind: z.literal("tier"), tier: regexTierKeySchema, enabled: z.boolean() }),
        ]),
      }),
    )
    .mutation(({ ctx, input }) => ctx.services.chat.setRegexAllow({ principal: ctx.auth, ...input })),

  // #1742 — the Regex section's body: what runs in this room, in run order, by tier. HOST-only in the verb
  // (three of the four tiers are the host's own library, D19); a member's rack is `regex.listForChat`.
  listEffectiveRegex: authedProcedure
    .input(z.object({ chatId: typeIdSchema(ID_PREFIX.chat) }))
    .query(({ ctx, input }) => ctx.services.chat.listEffectiveRegex({ principal: ctx.auth, chatId: input.chatId })),

  // B1 — the per-room offer-choices posture. Host-gated in the verb (a member's call is a refusal, not a
  // no-op), like every other `chatMetadata` write on this router.
  setOfferChoices: authedProcedure
    .input(z.object({ chatId: typeIdSchema(ID_PREFIX.chat), enabled: z.boolean() }))
    .mutation(({ ctx, input }) => ctx.services.chat.setOfferChoices({ principal: ctx.auth, ...input })),

  // B7 — the two reaction toggles (the setOfferChoices twins; host-gated in the verb). `charactersCanReact`
  // gates the `react` tool's attach; `reactionsEnabled` is the reaction plane's master switch, ENFORCED at
  // the reaction verbs (toggle refuses, list answers empty-with-verdict) rather than merely hidden.
  setCharactersCanReact: authedProcedure
    .input(z.object({ chatId: typeIdSchema(ID_PREFIX.chat), enabled: z.boolean() }))
    .mutation(({ ctx, input }) => ctx.services.chat.setCharactersCanReact({ principal: ctx.auth, ...input })),
  setReactionsEnabled: authedProcedure
    .input(z.object({ chatId: typeIdSchema(ID_PREFIX.chat), enabled: z.boolean() }))
    .mutation(({ ctx, input }) => ctx.services.chat.setReactionsEnabled({ principal: ctx.auth, ...input })),
  setToolRecurseLimit: authedProcedure
    .input(setToolRecurseLimitSchema)
    .mutation(({ ctx, input }) => ctx.services.chat.setToolRecurseLimit({ principal: ctx.auth, ...input })),
  setUserMacroValues: authedProcedure
    .input(setUserMacroValuesSchema)
    .mutation(({ ctx, input }) => ctx.services.chat.setUserMacroValues({ principal: ctx.auth, ...input })),
  getUserMacroPicks: authedProcedure
    .input(getUserMacroPicksSchema)
    .query(({ ctx, input }) => ctx.services.chat.getUserMacroPicks({ principal: ctx.auth, ...input })),
  setVariables: authedProcedure.input(setVariablesSchema).mutation(({ ctx, input }) => ctx.services.chat.setVariables({ principal: ctx.auth, ...input })),
  getVariablePicks: authedProcedure
    .input(getVariablePicksSchema)
    .query(({ ctx, input }) => ctx.services.chat.getVariablePicks({ principal: ctx.auth, ...input })),
  // S5 §4 — the room's RUNTIME variable fold (member-gated INSIDE the verb; the vars plane is
  // member-visible by design). B9's clock widget and the needle's meter read here; invalidation rides the
  // existing turn-commit/swipe bus events.
  getRuntimeVariables: authedProcedure
    .input(getRuntimeVariablesSchema)
    .query(({ ctx, input }) => ctx.services.chat.getRuntimeVariables({ principal: ctx.auth, ...input })),
  // B6/MR0 — the reaction toggle + the room's bounded grouped window (member-gated INSIDE the verb).
  toggleReaction: authedProcedure.input(toggleReactionSchema).mutation(({ ctx, input }) => ctx.services.chat.toggleReaction({ principal: ctx.auth, ...input })),
  listReactions: authedProcedure.input(listReactionsSchema).query(({ ctx, input }) => ctx.services.chat.listReactions({ principal: ctx.auth, ...input })),
  previewAssembly: authedProcedure.input(previewAssemblySchema).query(({ ctx, input }) => ctx.services.chat.previewAssembly({ principal: ctx.auth, ...input })),
  previewActionTemplates: authedProcedure
    .input(previewActionTemplatesSchema)
    .query(({ ctx, input }) => ctx.services.chat.previewActionTemplates({ principal: ctx.auth, ...input })),
  // The content-free SHAPE trace (PD-132) — a host/admin inspector read (`requireHost` INSIDE the verb).
  getShapeTrace: authedProcedure.input(getShapeTraceSchema).query(({ ctx, input }) => ctx.services.chat.getShapeTrace({ principal: ctx.auth, ...input })),
  // The per-variant WIRE RECORD — a host/admin inspector read (`requireHost` INSIDE the verb).
  getVariantWire: authedProcedure.input(getVariantWireSchema).query(({ ctx, input }) => ctx.services.chat.getVariantWire({ principal: ctx.auth, ...input })),
  previewContextFit: authedProcedure
    .input(previewContextFitSchema)
    .query(({ ctx, input }) => ctx.services.chat.previewContextFit({ principal: ctx.auth, ...input })),
  setChatInjection: authedProcedure
    .input(setChatInjectionSchema)
    .mutation(({ ctx, input }) => ctx.services.chat.setChatInjection({ principal: ctx.auth, ...input })),
  listChatInjections: authedProcedure
    .input(listChatInjectionsSchema)
    .query(({ ctx, input }) => ctx.services.chat.listChatInjections({ principal: ctx.auth, ...input })),
  deleteChatInjection: authedProcedure
    .input(deleteChatInjectionSchema)
    .mutation(({ ctx, input }) => ctx.services.chat.deleteChatInjection({ principal: ctx.auth, ...input })),
  // The group-roster-controls cluster (task #29 — see the schemas' header note above). Thin pass-throughs.
  addCharacterToChat: authedProcedure
    .input(addCharacterToChatSchema)
    .mutation(({ ctx, input }) => ctx.services.chat.addCharacterToChat({ principal: ctx.auth, ...input })),
  removeCharacterFromChat: authedProcedure
    .input(removeCharacterFromChatSchema)
    .mutation(({ ctx, input }) => ctx.services.chat.removeCharacterFromChat({ principal: ctx.auth, ...input })),
  // The ONE AI-seat knob write (D80 — replaces the retired per-kind forking). Host-gated INSIDE the verb.
  setSeatKnobs: authedProcedure.input(setSeatKnobsSchema).mutation(({ ctx, input }) => ctx.services.chat.setSeatKnobs({ principal: ctx.auth, ...input })),
  forceCharacterTurn: authedProcedure
    .input(forceCharacterTurnSchema)
    .mutation(({ ctx, input }) => ctx.services.chat.forceCharacterTurn({ principal: ctx.auth, ...input })),
  getGroupConfig: authedProcedure
    .input(getGroupConfigSchema)
    .query(({ ctx, input }) => ctx.services.chat.getGroupConfigForChat({ principal: ctx.auth, ...input })),
  setGroupConfig: authedProcedure.input(setGroupConfigSchema).mutation(({ ctx, input }) => ctx.services.chat.setGroupConfig({ principal: ctx.auth, ...input })),
  // The chat-ROW lifecycle cluster (J5 — the LIST-panel row kebab). Thin pass-throughs; host-only INSIDE.
  updateTitle: authedProcedure.input(updateTitleSchema).mutation(({ ctx, input }) => ctx.services.chat.updateTitle({ principal: ctx.auth, ...input })),
  star: authedProcedure.input(starChatSchema).mutation(({ ctx, input }) => ctx.services.chat.star({ principal: ctx.auth, ...input })),
  archive: authedProcedure.input(archiveChatSchema).mutation(({ ctx, input }) => ctx.services.chat.archive({ principal: ctx.auth, ...input })),
  setChatAnchorPersona: authedProcedure
    .input(setChatAnchorPersonaSchema)
    .mutation(({ ctx, input }) => ctx.services.chat.setChatAnchorPersona({ principal: ctx.auth, ...input })),
  delete: authedProcedure.input(deleteChatSchema).mutation(({ ctx, input }) => ctx.services.chat.delete({ principal: ctx.auth, ...input })),
  // Temp-chat maintenance (PD-65): sweep the CALLER's OWN expired temporary chats, on the CALLER's own
  // `chat.tempChatTtlHours`. Input-less and per-caller-scoped INSIDE the verb (it deletes only chats the
  // caller presently HOSTS), so there is no id to leak and nothing to cross-tenant probe — the client
  // fires it fire-and-forget on home mount (owner decision H5; a workloads runner would add scheduling
  // for one indexed delete).
  reapTemporaryChats: authedProcedure.mutation(({ ctx }) => ctx.services.chat.reapTemporaryChats({ principal: ctx.auth })),
  // R0 §4.6 — the nav-away husk drop. Fired when the client deliberately leaves a room it believes nobody
  // started; the VERB re-checks `started_at IS NULL` under the host gate, so this input is a request, never a
  // verdict, and a chatId the caller does not host is the usual leak-free refusal. Host-only + id-scoped, so
  // unlike `reapTemporaryChats` it does take an input.
  reapHusk: authedProcedure
    .input(z.object({ chatId: typeIdSchema(ID_PREFIX.chat) }))
    .mutation(({ ctx, input }) => ctx.services.chat.reapHusk({ principal: ctx.auth, chatId: input.chatId })),
  // Generate image(s) in a chat (the I5 mode picker + /imagine surface). mode/prompt/n/size map onto
  // `chat.generateImage` → `imagery.generatePicture` (an absent `size` falls to the leaf's `defaultSizeFor`).
  generateImage: authedProcedure.input(generatePictureRequestSchema.extend({ chatId: typeIdSchema(ID_PREFIX.chat) })).mutation(({ ctx, input }) =>
    ctx.services.chat.generateImage({
      principal: ctx.auth,
      chatId: input.chatId,
      mode: input.mode,
      prompt: input.prompt,
      n: input.n,
      size: input.size,
    }),
  ),
});

// Wrap the domain's bare impersonation `{ delta }` yields in `tracked()` envelopes (the shape
// `withSubscriptionErrors` + the client SSE link require). The id is the delta index — MONOTONIC but NOT a
// durable resume cursor (this stream is one-shot + non-resumable: a reconnect re-drafts, it never resumes
// "from delta N"), so the tracked id only satisfies the wire discriminant, never a `lastEventId` resume.
async function* trackedImpersonationDeltas(source: AsyncIterable<ImpersonateStreamDelta>): AsyncGenerator<TrackedEnvelope<ImpersonateStreamDelta>> {
  let i = 0;
  for await (const delta of source) {
    yield tracked(String(i), delta);
    i += 1;
  }
}
