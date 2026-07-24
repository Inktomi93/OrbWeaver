// transport/trpc/routers/chat — the chat surface (PD-46). Thin: validate → `ctx.services.chat.<verb>`.
// `streamMessages` is the per-chat SSE subscription (core/Tier-4-Transport.md §5 — the load-bearing
// stream shape): attach the live listener FIRST (the transport `chat-events-bus` buffers from that
// instant), replay the durable `chat_events` log on reconnect (`lastEventId` → the member-gated
// `chat.replayChatEvents`), then drain live — every yield `tracked(String(seq), event)` (uniform
// envelopes; the seq IS the durable resume cursor, so a reconnect never re-plays delivered events).
//
// The DRAFT-TOLERANT membership gate WITHHOLDS-not-throws (Tier-4 §5): a NOT_FOUND from the member-gated
// probe (`chatEventBounds`) means "no such chat yet / not (any longer) a member" — the stream yields
// nothing and stays open (a client may subscribe before `chat.start` commits), and the gate runs on
// EVERY live yield so a kicked member's stream stops within the kick tx (the membership chokepoint
// covers the SSE path). Any non-NotFound error propagates into `withSubscriptionErrors`' typed frame.
//
// SUBSCRIPTION-SIDE SYNTHESES (PD-134/PD-135). Two `ChatBusEvent` members are synthesized HERE, per
// subscription, not published on the bus (no other subscriber sees them) and never logged to `chat_events`:
//   • `chatOpened` — yielded once at attach after the membership probe admits the subscriber (the ST
//     CHAT_CHANGED "on open, run setup" hook; the client reducer invalidates). PD-134.
//   • `historyTruncated` — yielded on resume when the cursor predates the retained window (events after it
//     were dropped, a gap replay can't fill), BEFORE the replay so the client refetches first. PD-135.
// THE SYNTHETIC-ENVELOPE RULE: a synthetic carries the CURRENT resume cursor as its tracked id (never a
// fresh/durable `seq`), so it does NOT advance or fake `lastEventId` — a reconnect re-sends that same id
// and replays from the exact same durable point. Only real `chat_events` rows advance the cursor
// (`resumeId advances only on durable cursor-carrying events`, Tier-4 §5 Esoteric #5). The truncation
// predicate reads the retained window's floor off the SAME member-gated `chatEventBounds` probe the
// membership gate already runs (`minSeq` = earliest retained row) — no extra persistence read: an EMPTY
// replay is NOT the signal (a caught-up cursor also replays empty); truncation is `resumeSeq < minSeq - 1`.

import { ASSET_LIST_LIMIT_MAX, assetIdSchema } from "@orb/contracts/assets";
import type { ChatBusEvent } from "@orb/contracts/chat";
import { chatInjectionInputSchema, groupConfigSchema, roomOverridesSchema, seatKnobsSchema } from "@orb/contracts/chat";
import { chatDocumentVisibilitySchema } from "@orb/contracts/databank";
import type { Principal } from "@orb/contracts/identity";

import { generatePictureRequestSchema } from "@orb/contracts/imagery";
import { themeBackgroundSchema } from "@orb/contracts/theme";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId, ChatId, ChatInjectionId, ChatParticipantId, MessageId, MessageVariantId, PersonaId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import type { TrackedEnvelope } from "@trpc/server";
import { tracked } from "@trpc/server";
import { z } from "zod";
import type { ChatService } from "#domain/chat";
import { notifyChatOpened } from "../automation-chat-open-tap";
import { subscribeChatEvents } from "../chat-events-bus";
import { withSubscriptionErrors } from "../subscriptions";
import { authedProcedure, t } from "../trpc";

const startChatSchema = z.object({
  characterIds: z.array(brandedId<CharacterId>()),
  anchorPersonaId: brandedId<PersonaId>().nullish(),
  title: z.string().nullish(),
  opening: z.any().optional(),
  // THE DRAFT CARRY (StartChatParams — a new chat is fully editable pre-send; the first send hands its
  // draft-config state to this ONE creation entry). All optional/sparse: absent ⇒ today's plain new chat.
  seedGreetings: z.record(brandedId<CharacterId>(), z.string()).optional(),
  rosterOverrides: z
    .record(
      brandedId<CharacterId>(),
      z.object({
        disabled: z.boolean().optional(),
        talkativeness: z.number().min(0).max(1).optional(),
      }),
    )
    .optional(),
  groupConfig: groupConfigSchema.optional(),
  roomOverrides: roomOverridesSchema.optional(),
  injections: z.array(chatInjectionInputSchema).optional(),
  // The composer wand's degenerate "Guide the opening" (a draft chat has no committed turn to steer
  // yet — its guided input rides the founding `generate` opening instead; ignored by every other
  // `opening` policy). Same `z.any()` shape as `send`/`swipe`'s `guided` below (no dedicated
  // `GuidedSteer` wire schema exists yet — the domain type is the validated shape server-side).
  guided: z.any().optional(),
});

const listMessagesSchema = z.object({
  chatId: brandedId<ChatId>(),
  beforeSeq: z.number().optional(),
  limit: z.number().optional(),
});

// The swipe strip's step-target resolver (chat-surface-lane follow-up to #19): `ChatService.listMessageVariants`
// (domain/chat/verbs/read.ts createListMessageVariants) returns the full sibling-variant set for a slot —
// `{variantId, idx}[]`, no content — so a step to an idx this session hasn't rendered (e.g. a cold page
// load) resolves through the real list instead of only what `useVariantHistory` observed live. Member-gated
// (a read, unlike `selectVariant`'s author-or-host — see `substrate/auth/matrix.ts`).
const listMessageVariantsSchema = z.object({
  chatId: brandedId<ChatId>(),
  messageId: brandedId<MessageId>(),
});

const sendSchema = z.object({
  chatId: brandedId<ChatId>(),
  content: z.string(),
  personaId: brandedId<PersonaId>().nullish(),
  blocks: z.array(z.any()).optional(),
  // #67 — inline images the user attached (asset ids). The send verb TRUST-BOUNDARY-checks each is the
  // actor's own asset (rejecting a foreign/gone id), then persists a `message_assets` row + a body ref per id.
  attachmentAssetIds: z.array(assetIdSchema).max(ASSET_LIST_LIMIT_MAX).optional(),
  intent: z.any().optional(),
  guided: z.any().optional(),
});

const swipeSchema = z.object({
  chatId: brandedId<ChatId>(),
  messageId: brandedId<MessageId>(),
  intent: z.any().optional(),
  guided: z.any().optional(),
});

// The three remaining guided-generations verbs (chat-surface-lane task #27 — the composer WAND):
// `ChatService.continueTurn`/`impersonate`/`generate` (domain/chat/verbs/turn.ts createContinueTurn/
// createImpersonate/createGenerate) were ALL already fully implemented — participant-gated, D26-correct,
// bus-emitting, EVERY generating verb already threading an optional `guided: GuidedSteer` steer — but none
// had ever been exposed on this router (the same MISSING-API shape `abort`/`selectVariant`/the per-message
// action cluster were in before 2026-07-04c; swept via grep before this addition, no call site referenced
// any of the three). Thin pass-throughs, same shape as `swipe` (continueTurn: messageId-scoped) or `send`
// minus the persisted content (impersonate/generate: chatId-scoped, no message row of their own to target).
const continueTurnSchema = z.object({
  chatId: brandedId<ChatId>(),
  messageId: brandedId<MessageId>(),
  intent: z.any().optional(),
  guided: z.any().optional(),
});

const impersonateSchema = z.object({
  chatId: brandedId<ChatId>(),
  personaId: brandedId<PersonaId>().nullish(),
  intent: z.any().optional(),
  guided: z.any().optional(),
});

const generateSchema = z.object({
  chatId: brandedId<ChatId>(),
  speakerCharacterId: brandedId<CharacterId>().nullish(),
  intent: z.any().optional(),
  guided: z.any().optional(),
});

// The step-BACK verb (task #19 — swipe-strip's left chevron): `ChatService.selectVariant`
// (domain/chat/verbs/edit.ts createSelectVariant) was already fully implemented — author-or-host gate,
// sibling-ownership belt, the runtime-variables re-fold for the newly-selected pointer, `variantSelected`
// emit — but had never been exposed on this router (the same MISSING-API shape `abort` was in before
// 2026-07-04c; swept via grep before this addition, no call site referenced `chat.selectVariant`). Thin
// pass-through, same shape as `swipe` + an explicit `variantId` (a pointer move, not a generation).
const selectVariantSchema = z.object({
  chatId: brandedId<ChatId>(),
  messageId: brandedId<MessageId>(),
  variantId: brandedId<MessageVariantId>(),
});

// The Stop verb (task #18 — the composer's mid-stream STOP): `ChatService.abort` (domain/chat/verbs/
// turn.ts createAbort) was already fully implemented — active-turns registry, turn-owner-only, an
// idempotent no-op with nothing in flight — but had never been exposed on this router (MISSING-API,
// swept via `sg`/grep before this addition; no test or call site referenced `chat.abort`). Thin
// pass-through, same shape as `getChat` (chatId only — `AbortParams extends ChatScopedParams {}`).
const abortSchema = z.object({ chatId: brandedId<ChatId>() });

// The per-message ACTION cluster (edit-in-place · hide-from-AI · delete · fork; the chat-surface lane's
// task #24-adjacent brief): `editMessage`/`setMessageHidden`/`deleteMessages`/`forkChat`
// (domain/chat/verbs/edit.ts + fork.ts) were ALL already fully implemented — author-or-host gated,
// D26-correct, bus-emitting — but none had ever been exposed on this router (the SAME MISSING-API
// shape `abort`/`selectVariant` were in before 2026-07-04c; swept via grep before this addition, no
// call site referenced any of the four). Thin pass-throughs, same shape as their sibling verbs above.
const editMessageSchema = z.object({
  chatId: brandedId<ChatId>(),
  messageId: brandedId<MessageId>(),
  content: z.string(),
});

const setMessageHiddenSchema = z.object({
  chatId: brandedId<ChatId>(),
  messageId: brandedId<MessageId>(),
  hidden: z.boolean(),
});

const deleteMessagesSchema = z.object({
  chatId: brandedId<ChatId>(),
  messageIds: z.array(brandedId<MessageId>()),
});

// `reattributePersona` (task #60 — the persona-attribution / {{user}} history fix; neo `usePersonaReattribute`
// / ST `#persona_sync_name`): re-stamp a set of USER rows' `personaId`. Author-or-host PER row + role/ownership
// belts are enforced INSIDE the verb (no router-level authz — the sibling canon-edit shape). `messageIds` is
// the bulk set (the client passes all its own user-row ids) or a single id (per-message).
const reattributePersonaSchema = z.object({
  chatId: brandedId<ChatId>(),
  messageIds: z.array(brandedId<MessageId>()),
  personaId: brandedId<PersonaId>(),
});

// `throughSeq`/`title` mirror `ForkChatParams` (D27 deep copy — throughSeq truncates the copy to a
// message's `seq`, the "fork at this point" affordance the actions row's Fork button drives).
const forkChatSchema = z.object({
  chatId: brandedId<ChatId>(),
  throughSeq: z.number().optional(),
  title: z.string().nullish(),
});

// The CONTEXT-panel cluster (task #28 — the chat right-region: room-overrides · preview-request ·
// manual injections). Same MISSING-API shape as the clusters above: `setRoomOverrides`/
// `getRoomOverridesForChat` (verbs/roster.ts), `previewAssembly` (verbs/read.ts), and
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
  chatId: brandedId<ChatId>(),
  overrides: roomOverridesSchema,
});

// `setChatDocumentVisibility` (D85) — the host's per-document databank retrieval-visibility override. The wire
// schema DERIVES from `@orb/contracts/databank` (documentId-typed hidden set); authz (`requireHost`) lives
// INSIDE the verb, so a stranger's chatId collapses to a leak-free NOT_FOUND (the setRoomOverrides shape).
const setChatDocumentVisibilitySchema = z.object({
  chatId: brandedId<ChatId>(),
  visibility: chatDocumentVisibilitySchema,
});

// `setChatBackground` (BG-C) — the host's per-chat carried background source. The wire schema DERIVES from
// `@orb/contracts/theme` (`themeBackgroundSchema`); authz (`requireHost`) + the asset-ownership gate live
// INSIDE the verb, so a stranger's chatId collapses to a leak-free NOT_FOUND (the setRoomOverrides shape).
const setChatBackgroundSchema = z.object({
  chatId: brandedId<ChatId>(),
  background: themeBackgroundSchema,
});

// speakerCharacterId/guided mirror `PreviewAssemblyParams` (a hypothetical per-speaker turn); `guided`
// has no dedicated wire schema yet (the domain type is the validated shape — same `z.any()` shape as
// `send`/`generate` above).
const previewAssemblySchema = z.object({
  chatId: brandedId<ChatId>(),
  speakerCharacterId: brandedId<CharacterId>().nullish(),
  guided: z.any().optional(),
});

// `getShapeTrace` (PD-132) — the content-free SHAPE trace for the next-turn shaping of the current canon.
// `speakerCharacterId` picks the primary speaker the peek shapes for (mirrors `peekPrompt`); host-gated
// (`requireHost`) INSIDE the verb (matrix `getShapeTrace: "host"`).
const getShapeTraceSchema = z.object({
  chatId: brandedId<ChatId>(),
  speakerCharacterId: brandedId<CharacterId>().nullish(),
});

// `previewContextFit` (PD-#7) — the present-tense fit budget for the current canon (the transcript divider's
// live source). Member-gated (`requireParticipant`) INSIDE the verb (matrix `previewContextFit: "member"`);
// reads tenant canon by chatId, so the cross-tenant sweep classifies it PROBED.
const previewContextFitSchema = z.object({
  chatId: brandedId<ChatId>(),
  speakerCharacterId: brandedId<CharacterId>().nullish(),
});

// `setChatInjection` upserts (id present ⇒ update, absent ⇒ create); the contracts schema owns the
// authored fields (position/depth/role/content/order + the optional id), the router adds the chatId.
const setChatInjectionSchema = chatInjectionInputSchema.extend({
  chatId: brandedId<ChatId>(),
});

const listChatInjectionsSchema = z.object({ chatId: brandedId<ChatId>() });

const deleteChatInjectionSchema = z.object({
  chatId: brandedId<ChatId>(),
  injectionId: brandedId<ChatInjectionId>(),
});

const streamSchema = z.object({
  chatId: brandedId<ChatId>(),
  // @orb-gate-ignore no-raw-id lastEventId is the SSE resume cursor (a `seq` string set by tRPC's Last-Event-ID), not a branded entity id.
  lastEventId: z.string().nullish(),
});

// The CHAT-ROW lifecycle cluster (J5 chat-list — the LIST-panel row kebab: rename/star/archive/delete).
// `updateTitle`/`star`/`archive`/`delete` (domain/chat/verbs/chat-lifecycle.ts) were ALL already fully
// implemented — HOST-only via `requireHost` (substrate/auth/matrix.ts), DB-backed, bus-emitting
// (`chatUpdated`/`chatDeleted`) — but none had ever been exposed on this router (the SAME MISSING-API shape
// the #28/#29 clusters + the guided-generations cluster were in; swept via grep before this addition, no
// call site referenced any of the four). Thin pass-throughs; authz lives INSIDE each verb. `title` is
// required + nullable (`UpdateTitleParams.title: string | null` — null clears the title).
const updateTitleSchema = z.object({
  chatId: brandedId<ChatId>(),
  title: z.string().nullable(),
});

const starChatSchema = z.object({
  chatId: brandedId<ChatId>(),
  star: z.boolean(),
});

const archiveChatSchema = z.object({
  chatId: brandedId<ChatId>(),
  archived: z.boolean(),
});

// `delete` is chatId-only (`DeleteChatParams extends ChatScopedParams {}` — same shape as `getChat`/`abort`).
const deleteChatSchema = z.object({ chatId: brandedId<ChatId>() });

// `setChatAnchorPersona` (FINAL-Persona §A.0/§A.6b gap #2) — the manual/host Anchor (#4) re-pin.
// `personaId: null` clears the pin. Host-only + the present-human ownership belt live INSIDE the verb.
const setChatAnchorPersonaSchema = z.object({
  chatId: brandedId<ChatId>(),
  personaId: brandedId<PersonaId>().nullable(),
});

// The GROUP-ROSTER-CONTROLS cluster (task #29 — the cast bar + per-member controls): the two
// per-member setters `setParticipantDisabled` (mute/unmute) + `setParticipantTalkativeness` (the 0–1
// `natural`-policy sampling weight) and `forceCharacterTurn` (host summons one member to speak next)
// were ALL already fully implemented in domain/chat (verbs/roster.ts + verbs/turn.ts) — host-gated via
// substrate/auth/matrix.ts, DB-backed (chatParticipants columns), bus-emitting — but none had ever been
// exposed on this router (the same MISSING-API shape the #28 CONTEXT-panel cluster + the guided-generations
// cluster were in; swept via grep before this addition, no call site referenced any of the three). Thin
// pass-throughs; authz lives INSIDE each verb (`requireHost`, the sibling-cluster shape). `forceCharacterTurn`
// mirrors `generate` minus the persona/speaker knobs (chatId + the target characterId + the optional
// intent/guided steer — same `z.any()` shape as `send`/`generate` above, no dedicated wire schema yet).
// NOTE (#29): a MUTED member is still force-summonable — mute is passive arbitration exclusion, not a host-
// override block (the verb's presence-only target check, verbs/turn.ts).
// Add a character to an existing chat's roster (J7 add-member — the cast-bar "+"). Host-only INSIDE the
// verb (`requireHost`) + the PD-21 single-owner invariant (a foreign character reads as missing, leak-
// free) — this router row is a thin pass-through, the same shape as the sibling roster cluster.
const addCharacterToChatSchema = z.object({
  chatId: brandedId<ChatId>(),
  characterId: brandedId<CharacterId>(),
});

// `setSeatKnobs` (D80) — the ONE participantId-keyed AI-seat knob write, the replacement for the retired
// per-kind forking (`setParticipantDisabled`/`setParticipantTalkativeness`/`setAgentSeatDisabled` — the
// pattern that guaranteed skipped arms, e.g. agent talkativeness was unsettable). Host-gated INSIDE the verb
// (`requireHost`) + present-AI-seat-scoped (a human/observer seat → participant_not_found). The wire `patch`
// is the ONE-HOME `seatKnobsSchema` (`@orb/contracts/chat`): both knobs optional, talkativeness RANGE-clamped.
const setSeatKnobsSchema = z.object({
  chatId: brandedId<ChatId>(),
  participantId: brandedId<ChatParticipantId>(),
  patch: seatKnobsSchema,
});

// Group config (verbs/roster.ts `setGroupConfig`/`getGroupConfigForChat`) — the same domain-ahead-of-
// transport MISSING-API shape as the clusters above (host-gated write / member read, INSIDE the verb).
// The wire input is the contracts `groupConfigSchema` (the lenient `GroupConfigInput` the verb parses →
// a fully-defaulted `GroupConfig`); the router only adds `chatId`. The chat's CONTEXT-panel group editor
// consumes these (draft chats edit the draft-config store instead — the pre-send carry).
const setGroupConfigSchema = z.object({
  chatId: brandedId<ChatId>(),
  config: groupConfigSchema,
});
const getGroupConfigSchema = z.object({ chatId: brandedId<ChatId>() });

const forceCharacterTurnSchema = z.object({
  chatId: brandedId<ChatId>(),
  characterId: brandedId<CharacterId>(),
  intent: z.any().optional(),
  guided: z.any().optional(),
});

export const chatRouter = t.router({
  startChat: authedProcedure.input(startChatSchema).mutation(({ ctx, input }) => ctx.services.chat.startChat({ principal: ctx.auth, ...input })),
  listChats: authedProcedure
    .input(z.object({ includeArchived: z.boolean().optional() }).optional())
    .query(({ ctx, input }) => ctx.services.chat.listChats({ principal: ctx.auth, ...(input || {}) })),
  getChat: authedProcedure
    .input(z.object({ chatId: brandedId<ChatId>() }))
    .query(({ ctx, input }) => ctx.services.chat.getChat({ principal: ctx.auth, chatId: input.chatId })),
  // A paged canon read (D26), member-gated (`requireParticipant` inside the verb — leak-free NOT_FOUND
  // for a non-member, the same collapse `getChat` uses). `beforeSeq`/`limit` page backwards from the tail.
  listMessages: authedProcedure.input(listMessagesSchema).query(({ ctx, input }) => ctx.services.chat.listMessages({ principal: ctx.auth, ...input })),
  // The swipe strip's step-target resolver (see the schema's header note above).
  listMessageVariants: authedProcedure
    .input(listMessageVariantsSchema)
    .query(({ ctx, input }) => ctx.services.chat.listMessageVariants({ principal: ctx.auth, ...input })),
  send: authedProcedure.input(sendSchema).mutation(({ ctx, input }) => ctx.services.chat.send({ principal: ctx.auth, ...input })),
  swipe: authedProcedure.input(swipeSchema).mutation(({ ctx, input }) => ctx.services.chat.swipe({ principal: ctx.auth, ...input })),
  selectVariant: authedProcedure.input(selectVariantSchema).mutation(({ ctx, input }) => ctx.services.chat.selectVariant({ principal: ctx.auth, ...input })),
  // The three guided-generations verbs (see the schemas' header note above).
  continueTurn: authedProcedure.input(continueTurnSchema).mutation(({ ctx, input }) => ctx.services.chat.continueTurn({ principal: ctx.auth, ...input })),
  impersonate: authedProcedure.input(impersonateSchema).mutation(({ ctx, input }) => ctx.services.chat.impersonate({ principal: ctx.auth, ...input })),
  generate: authedProcedure.input(generateSchema).mutation(({ ctx, input }) => ctx.services.chat.generate({ principal: ctx.auth, ...input })),
  abort: authedProcedure.input(abortSchema).mutation(({ ctx, input }) => ctx.services.chat.abort({ principal: ctx.auth, ...input })),
  // The per-message ACTION cluster's four verbs (see the schemas' header note above).
  editMessage: authedProcedure.input(editMessageSchema).mutation(({ ctx, input }) => ctx.services.chat.editMessage({ principal: ctx.auth, ...input })),
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
  previewAssembly: authedProcedure.input(previewAssemblySchema).query(({ ctx, input }) => ctx.services.chat.previewAssembly({ principal: ctx.auth, ...input })),
  // The content-free SHAPE trace (PD-132) — a host/admin inspector read (`requireHost` INSIDE the verb).
  getShapeTrace: authedProcedure.input(getShapeTraceSchema).query(({ ctx, input }) => ctx.services.chat.getShapeTrace({ principal: ctx.auth, ...input })),
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
  // Generate image(s) in a chat (the I5 mode picker + /imagine surface). mode/prompt/n/size map onto
  // `chat.generateImage` → `imagery.generatePicture` (an absent `size` falls to the leaf's `defaultSizeFor`).
  generateImage: authedProcedure.input(generatePictureRequestSchema.extend({ chatId: brandedId<ChatId>() })).mutation(({ ctx, input }) =>
    ctx.services.chat.generateImage({
      principal: ctx.auth,
      chatId: input.chatId,
      mode: input.mode,
      prompt: input.prompt,
      n: input.n,
      size: input.size,
    }),
  ),

  // The per-chat room-public event stream (PD-46's stream half — see the file header for the shape).
  streamMessages: authedProcedure.input(streamSchema).subscription(({ ctx, input, signal }) =>
    withSubscriptionErrors(
      chatEventStream({
        service: ctx.services.chat,
        principal: ctx.auth,
        chatId: input.chatId,
        lastEventId: input.lastEventId ?? null,
        signal,
      }),
    ),
  ),
});

// The live-first / replay-second per-chat event generator (dedup by monotonic durable `seq`).
async function* chatEventStream(args: {
  readonly service: ChatService;
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly lastEventId: string | null;
  readonly signal: AbortSignal | undefined;
}): AsyncGenerator<TrackedEnvelope<ChatBusEvent>> {
  const { service, principal, chatId, lastEventId, signal } = args;
  const resumeSeq = parseResumeSeq(lastEventId);
  // Attach the live listener FIRST (`on()` buffers from this point) so the replay→live gap loses nothing.
  const live = subscribeChatEvents(chatId, signal ?? new AbortController().signal);

  // The attach probe: membership + the retained-window bounds in ONE member-gated read. `null` = the
  // withhold-not-throw NOT_FOUND (no chat yet / not a member) — synthesize nothing, replay nothing.
  const bounds = await memberBounds(service, principal, chatId);
  let maxSeq = resumeSeq ?? 0;
  if (bounds !== null) {
    for await (const env of attachSynthesesAndReplay({ service, principal, chatId, resumeSeq, bounds })) {
      yield env;
      // Track the highest durable seq for the live-loop dedup; synthetics carry the cursor id, so they
      // never raise it (only real replay rows do).
      maxSeq = Math.max(maxSeq, Number(env[0]));
    }
  }

  for await (const entry of live) {
    // Dedup the replay/live overlap (and any out-of-order delivery) by the monotonic `seq`.
    if (entry.seq <= maxSeq) {
      continue;
    }
    // The PER-YIELD membership gate: a kicked member stops receiving within the kick tx; a pre-start
    // subscriber stays open and silent until the room exists and they are seated (withhold-not-throw).
    if ((await memberBounds(service, principal, chatId)) === null) {
      continue;
    }
    yield tracked(String(entry.seq), entry.event);
    maxSeq = entry.seq;
  }
}

/** The attach-time syntheses + reconnect replay (member already admitted). `chatOpened` fires once at
 *  attach; `historyTruncated` fires (before the replay) only when the resume cursor predates the retained
 *  window; the durable replay drains the rows after the cursor. Synthetics carry the CURRENT cursor as
 *  their tracked id so they never advance `lastEventId` (the file-header synthetic-envelope rule). */
async function* attachSynthesesAndReplay(args: {
  readonly service: ChatService;
  readonly principal: Principal;
  readonly chatId: ChatId;
  readonly resumeSeq: number | null;
  readonly bounds: StreamEventBounds;
}): AsyncGenerator<TrackedEnvelope<ChatBusEvent>> {
  const { service, principal, chatId, resumeSeq, bounds } = args;
  const cursorId = String(resumeSeq ?? 0);
  // `chatOpened` (PD-134) — the per-subscription attach synthesis (the client reducer invalidates). The
  // per-viewer automation tap (D81) fires off the SAME synthesis — it never rides the durable bus.
  yield tracked(cursorId, { type: "chatOpened", chatId });
  notifyChatOpened(chatId, principal.userId);

  // A fresh subscribe (resumeSeq null) drains live only — no replay, no truncation check.
  if (resumeSeq === null) {
    return;
  }
  // `historyTruncated` (PD-135) — the cursor predates the retained window (`minSeq` = earliest retained
  // row): events after it were dropped. Empty log (minSeq null) ⇒ no window ⇒ no gap; a caught-up cursor
  // replays empty but is NOT truncated. Yielded BEFORE the replay (same non-advancing id) so the client
  // refetches first.
  if (bounds.minSeq !== null && resumeSeq < bounds.minSeq - 1) {
    yield tracked(cursorId, { type: "historyTruncated", chatId });
  }
  for (const entry of await service.replayChatEvents({ principal, chatId, afterSeq: resumeSeq })) {
    yield tracked(String(entry.seq), entry.event);
  }
}

// The withhold-not-throw membership probe, carrying the retained-window bounds: NOT_FOUND (no chat / not a
// member — the leak-free collapse) → `null`; anything else is a real fault and propagates. The returned
// `{minSeq, maxSeq}` backs the `historyTruncated` predicate (no second read for the truncation check).
async function memberBounds(service: ChatService, principal: Principal, chatId: ChatId): Promise<StreamEventBounds | null> {
  try {
    return await service.chatEventBounds({ principal, chatId });
  } catch (err) {
    if (err instanceof DomainNotFoundError) {
      return null;
    }
    throw err;
  }
}

/** The retained-window bounds the member-gated `chatEventBounds` probe returns (derived off the service
 *  type — no new front-door export; the shape is `{ minSeq, maxSeq }`). */
type StreamEventBounds = Awaited<ReturnType<ChatService["chatEventBounds"]>>;

// A finite, non-error resume cursor, or `null` (first subscribe / a malformed or sentinel id).
function parseResumeSeq(lastEventId: string | null): number | null {
  if (lastEventId === null) {
    return null;
  }
  const parsed = Number(lastEventId);
  return Number.isFinite(parsed) ? parsed : null;
}
