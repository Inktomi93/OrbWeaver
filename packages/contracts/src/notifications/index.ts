// The notifications cross-boundary wire surface — the CLOSED `NotificationEvent` discriminated union and
// the read-only `PresenceView`. Invite/kick/host-handoff/agent-seat-request/crew-proposal ride a per-user
// durable inbox (a non-member can't subscribe to a chat's bus), so this node is the wire shape that domain
// persists.
// `recipientUserId` is mandatory on every variant. Credentials/secrets/baseUrls are TYPE-LEVEL
// unrepresentable: every `z.object` member strips unknown keys — no `.loose()`, no `z.unknown()`.

import type { Handle, UserId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { agentSourceKindSchema } from "#identity";

// `UserId` is a plain `Branded` nanoid, so it validates with `brandedId` rather than `typeIdSchema`.
const recipientUserIdSchema = brandedId<UserId>();
const chatIdSchema = typeIdSchema(ID_PREFIX.chat);
const chatInviteIdSchema = typeIdSchema(ID_PREFIX.chatInvite);
const handleSchema = brandedId<Handle>();
const characterIdSchema = typeIdSchema(ID_PREFIX.character);
const cardEvolutionProposalIdSchema = typeIdSchema(ID_PREFIX.cardEvolutionProposal);
const automationRuleIdSchema = typeIdSchema(ID_PREFIX.automationRule);
const pluginIdSchema = typeIdSchema(ID_PREFIX.plugin);

/** The `automation-notice` rendered-message cap (automation-design/03 §1.5). A capped string is the argued,
 *  closed exception to the ids-only habit — it stays credential-unrepresentable (a host-authored template
 *  rendered server-side over room state every recipient can already read). */
export const AUTOMATION_NOTICE_MESSAGE_MAX = 200;

// The discriminant strings ARE the db `notifications.type` column values. Closed: a new delivery
// reason is a member here + its chat producer; the contract test's exhaustiveness guard catches drift.
export const notificationEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("invite"),
    recipientUserId: recipientUserIdSchema,
    chatId: chatIdSchema,
    inviteId: chatInviteIdSchema,
    invitedByHandle: handleSchema,
  }),
  z.object({
    type: z.literal("kicked"),
    recipientUserId: recipientUserIdSchema,
    chatId: chatIdSchema,
  }),
  z.object({
    type: z.literal("handoff-nominated"),
    recipientUserId: recipientUserIdSchema,
    chatId: chatIdSchema,
  }),
  z.object({
    type: z.literal("handoff-accepted"),
    recipientUserId: recipientUserIdSchema,
    chatId: chatIdSchema,
    newHostHandle: handleSchema,
  }),
  // A host-offline DEFERRED AI turn (chat `pending_turns`, Part III §5) that a drain PERMANENTLY dropped —
  // delivered to the frozen `triggeredBy` member so their owed reply never silently vanishes. `reason`:
  // `consent` (the host's D17 consent belt refused the by-proxy hosted turn) | `chat-gone` (the room is gone).
  // A budget/transient drain outcome RE-QUEUES (no notification), so this is only the terminal-verdict path.
  z.object({
    type: z.literal("deferred-turn-dropped"),
    recipientUserId: recipientUserIdSchema,
    chatId: chatIdSchema,
    reason: z.enum(["consent", "chat-gone"]),
  }),
  // An owner≠host agent-seat REQUEST (D60; agent-principal-design/04 §3). The two-party consent flow: a
  // present member (the buddy's OWNER) asks the HOST to seat their agent; delivered to the host's inbox
  // (a human — never an agent recipient). `ownerUserId` is the requester (the buddy's owner in v1) — the
  // exact id the host feeds to `chat.seatAgent`; `sourceKind` picks which agent source; `requestedByHandle`
  // is the display label (the `invitedByHandle` precedent). ADVISORY — carries no authority; `seatAgent`
  // re-verifies host+owner-present+enabled, so nothing here is trusted as consent state.
  z.object({
    type: z.literal("agent-seat-requested"),
    recipientUserId: recipientUserIdSchema,
    chatId: chatIdSchema,
    ownerUserId: brandedId<UserId>(),
    sourceKind: agentSourceKindSchema,
    requestedByHandle: handleSchema,
  }),
  // A chat-crew card-evolution proposal (chat-crew-design/04 §5). The one crew artifact whose review
  // surface (the character page) sits OUTSIDE the chat the recipient may not have open — keeper entries
  // and edit proposals surface in-chat where the crew bus already reaches. Secret-free by construction
  // (ids only): `characterId`/`proposalId` deep-link the character-page review section. `recipientUserId`
  // is the card owner (= the chat host, who owns the cast — D22).
  z.object({
    type: z.literal("crew-proposal"),
    recipientUserId: recipientUserIdSchema,
    chatId: chatIdSchema,
    characterId: characterIdSchema,
    proposalId: cardEvolutionProposalIdSchema,
  }),
  // An automation `post_notification` arm firing (automation-design/03 §1.5, §AC-C) OR a plugin `notify`
  // (plugin-design/01 §2 — the SAME durable path, participants only). The one member that carries a rendered
  // `message` — a host-authored/plugin-authored template rendered server-side over room state (a rule that only
  // says "fired" is useless); still closed + secret-unrepresentable (a capped string, not a handle). `source`
  // is a discriminated union (rule vs plugin — NOT a synthetic rule id: a plugin notice has no rule), whose id
  // deep-links the host's rule debug surface / the owner's plugin surface; `chatId` scopes the notice;
  // `recipientUserId` is a chat participant by construction (host or a present member — the producer gates
  // recipients to the roster). Stored in the JSON `payload` blob, so widening `source` needs no db migration.
  z.object({
    type: z.literal("automation-notice"),
    recipientUserId: recipientUserIdSchema,
    chatId: chatIdSchema,
    source: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("rule"), ruleId: automationRuleIdSchema }),
      z.object({ kind: z.literal("plugin"), pluginId: pluginIdSchema }),
    ]),
    message: z.string().max(AUTOMATION_NOTICE_MESSAGE_MAX),
  }),
  // A resident plugin the crash policy AUTO-DISABLED after the consecutive-crash threshold (plugin-design/03
  // §4 "the owner is notified"). Delivered to the plugin's installing OWNER (a human — an agent has no
  // inbox). Ids only: `pluginId` deep-links the owner's plugin-management surface where `lastError` /
  // `consecutiveCrashes` already live (no free error string on the wire — the detail is read there, never
  // smuggled through the durable payload). NOT chat-scoped (a plugin is owner-installed, not room-bound).
  z.object({
    type: z.literal("plugin-disabled"),
    recipientUserId: recipientUserIdSchema,
    pluginId: pluginIdSchema,
  }),
]);

export type NotificationEvent = z.infer<typeof notificationEventSchema>;
export type NotificationType = NotificationEvent["type"];

/** The per-user presence shape transport derives from the live SSE connection ref-count. A read-model
 *  view, not an inbound wire schema — presence is never client-asserted (a spoofable heartbeat would be
 *  a prompt-composition attack), so there is deliberately no `presenceSchema` to parse a client claim into. */
export interface PresenceView {
  userId: UserId;
  online: boolean;
  lastSeenAt: number | null;
}
