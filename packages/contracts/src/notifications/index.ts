// The notifications cross-boundary wire surface — the CLOSED `NotificationEvent` discriminated union and
// the read-only `PresenceView`. Invite/kick/host-handoff/automation-notice/plugin-disabled ride a per-user
// durable inbox (a non-member can't subscribe to a chat's bus), so this node is the wire shape that domain
// persists. (agent-seat-request/crew-proposal were purged-domain members; the rebuild grafts here if either
// domain returns.)
// `recipientUserId` is mandatory on every variant. Credentials/secrets/baseUrls are TYPE-LEVEL
// unrepresentable: every `z.object` member strips unknown keys — no `.loose()`, no `z.unknown()`.

import type { Handle, UserId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

// `UserId` is a plain `Branded` nanoid, so it validates with `brandedId` rather than `typeIdSchema`.
const recipientUserIdSchema = brandedId<UserId>();
const chatIdSchema = typeIdSchema(ID_PREFIX.chat);
const chatInviteIdSchema = typeIdSchema(ID_PREFIX.chatInvite);
const handleSchema = brandedId<Handle>();
const automationRuleIdSchema = typeIdSchema(ID_PREFIX.automationRule);
const pluginIdSchema = typeIdSchema(ID_PREFIX.plugin);

/** The `automation-notice` rendered-message cap (automation-design/03 §1.5). A capped string is the argued,
 *  closed exception to the ids-only habit — it stays credential-unrepresentable (a host-authored template
 *  rendered server-side over room state every recipient can already read). */
export const AUTOMATION_NOTICE_MESSAGE_MAX = 200;

/** Who a `post_notification`/plugin `notify` can address (automation-design/03 §1.5, plugin-design/01 §2):
 *  the installer/host, or every present human member of the chat. Resolved DOMAIN-side, never client-asserted. */
export const NOTIFICATION_RECIPIENTS = ["host", "all_members"] as const;
export type NotificationRecipient = (typeof NOTIFICATION_RECIPIENTS)[number];

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
