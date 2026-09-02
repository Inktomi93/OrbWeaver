// The notifications cross-boundary wire surface — the CLOSED `NotificationEvent` discriminated union and
// the read-only `PresenceView`. Invite/kick/host-handoff/automation-notice/plugin-disabled ride a per-user
// durable inbox (a non-member can't subscribe to a chat's bus), so this node is the wire shape that domain
// persists. (agent-seat-request/crew-proposal were purged-domain members; the agents feature grafts here if
// it returns.)
// `recipientUserId` is mandatory on every variant. Credentials/secrets/baseUrls are TYPE-LEVEL
// unrepresentable: every `z.object` member strips unknown keys — no `.loose()`, no `z.unknown()`.

import type { Handle, NotificationId, UserId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

// `UserId` is a plain `Branded` nanoid, so it validates with `brandedId` rather than `typeIdSchema`.
const recipientUserIdSchema = brandedId<UserId>();
const chatIdSchema = typeIdSchema(ID_PREFIX.chat);
const chatInviteIdSchema = typeIdSchema(ID_PREFIX.chatInvite);
const handleSchema = brandedId<Handle>();
const automationRuleIdSchema = typeIdSchema(ID_PREFIX.automationRule);
const pluginIdSchema = typeIdSchema(ID_PREFIX.plugin);

/** The `notifications.list` inbox page CEILING, enforced at the transport trust boundary (the
 *  `CHARACTER_LIST_MAX_LIMIT` precedent) — an over-bound ask is a BAD_REQUEST, never an unbounded inbox
 *  fetch. The same 100 the domain DoS backstop (`verbs/list.ts` `Math.min`, for the stream replay's internal
 *  calls) references, homed HERE so the wire ceiling and the backstop never drift. */
export const NOTIFICATIONS_LIST_MAX_LIMIT = 100;

/** The `automation-notice` rendered-message cap. A capped string is the argued,
 *  closed exception to the ids-only habit — it stays credential-unrepresentable (a host-authored template
 *  rendered server-side over room state every recipient can already read). */
export const AUTOMATION_NOTICE_MESSAGE_MAX = 200;

/** The `automation-notice` COOLDOWN FLOOR (seconds) — the minimum gap between two notices from the same
 *  producer in the same chat. Inbox spam trains dismissal, and every notice is a DURABLE row, so this is the
 *  designed belt for both producers of this event (02 §2: `notify` = "grant + host + participants-only
 *  recipients + the 60 s floor"). Homed HERE, in the notice's own wire vocabulary, because it is one policy
 *  with TWO enforcers that must never drift: the automation rule path applies it at AUTHORING time (a
 *  `post_notification` rule cannot be stored with a smaller `cooldownSeconds`, which the fire-time budget gate
 *  then enforces off the fire log), and the plugin path applies it per (plugin, chat) at CALL time — a plugin
 *  has no rule row to constrain, so the check has to live where the call does. */
export const AUTOMATION_NOTICE_COOLDOWN_SECONDS = 60;

/** Who a `post_notification`/plugin `notify` can address: the installer/host, every present human member of
 *  the chat, or every present human member EXCEPT the one whose act triggered the fire. Resolved DOMAIN-side,
 *  never client-asserted (a caller names a SELECTOR, never a user id).
 *
 *  `all_members_except_actor` is the async-table member (interaction-direction-spec §4 #2, C6): in a
 *  play-by-post room the person who just posted does not need to be told that someone posted, and a nudge that
 *  pings them anyway is the one notice that trains dismissal of the whole inbox. THE ACTOR IS THE TRIGGERING
 *  FACT'S AUTHOR (`TriggerFact.message.authorUserId`) — which is why the preset that uses it rides
 *  `messageCommitted` and NOT `turnCompleted`: the turn fact carries no user identity, so under it the member
 *  would silently degenerate into `all_members`. A fire whose fact has no author (a model-authored message)
 *  excludes nobody, and that is correct rather than a fallback: there was no human act to spare. */
export const NOTIFICATION_RECIPIENTS = ["host", "all_members", "all_members_except_actor"] as const;
export type NotificationRecipient = (typeof NOTIFICATION_RECIPIENTS)[number];

/** The SUBSET a PLUGIN may name (`host.notifications.post`) — the guest vocabulary, deliberately narrower than
 *  the tuple above and narrowed AT THE TYPE rather than by a runtime refusal.
 *
 *  WHY `all_members_except_actor` is not here, and it is a structural reason rather than the D46 default-deny
 *  reflex: a plugin's `notify` is an arbitrary guest call carrying an admitted chat handle and nothing else —
 *  there is NO triggering fact, so there is no actor to exclude. Admitting the member would give a guest a
 *  selector that silently resolves to `all_members` on every call, i.e. a name that lies. Keeping the plugin
 *  seam typed against this subset makes the member UNREPRESENTABLE on the guest path (the membrane, the
 *  bridge, the domain op and the compose resolver all narrow together, and `tsc` names every site if the
 *  subset ever widens) instead of leaving a runtime downgrade to be re-derived by the next reader.
 *
 *  The door, stated so it is not re-litigated from scratch: a plugin path that WANTS this member must first
 *  carry an actor — the event-handler seam (`events.on`) does receive a `TriggerFact`, so the widening is
 *  "notify from inside a fact-bearing handler", not "add a member here". */
export const PLUGIN_NOTIFICATION_RECIPIENTS = ["host", "all_members"] as const satisfies readonly NotificationRecipient[];
export type PluginNotificationRecipient = (typeof PLUGIN_NOTIFICATION_RECIPIENTS)[number];

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
  // An automation `post_notification` arm firing (§AC-C) OR a plugin `notify`
  // (the SAME durable path, participants only). The one member that carries a rendered
  // `message` — a host-authored/plugin-authored template rendered server-side over room state (a rule that only
  // says "fired" is useless); still closed + secret-unrepresentable (a capped string, not a handle). `source`
  // is a discriminated union (rule vs plugin — NOT a synthetic rule id: a plugin notice has no rule), whose id
  // deep-links the host's rule debug surface / the owner's plugin surface; `chatId` scopes the notice;
  // `recipientUserId` is a chat participant by construction (host or a present member — the producer gates
  // recipients to the roster). Stored in the JSON `payload` blob, so widening `source` needs no db migration.
  z.object({
    type: z.literal("automation-notice"),
    recipientUserId: recipientUserIdSchema,
    /** The room the notice is about, or NULL when there is none — an owner-GLOBAL automation rule (C5) has
     *  no chat, and its author still has to learn that it auto-disabled itself after 20 consecutive errors.
     *  Without the null arm that notice could not be constructed at all, so a rotting global rule would go
     *  silent in the ONE surface built to make rot visible (the transient `ruleAutoDisabled` bus event is
     *  per-chat too, so the durable inbox is not a second channel there — it is the only one).
     *
     *  NULL is a scope fact, never a fallback: every notice raised BY a room still carries its room, so the
     *  deep-link is unchanged for every producer that has one. No migration — `chatId` lives inside the JSON
     *  `payload` blob, not a column (`db/schema/notifications.ts`). */
    chatId: chatIdSchema.nullable(),
    source: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("rule"), ruleId: automationRuleIdSchema }),
      z.object({ kind: z.literal("plugin"), pluginId: pluginIdSchema }),
    ]),
    message: z.string().max(AUTOMATION_NOTICE_MESSAGE_MAX),
  }),
  // A resident plugin the crash policy AUTO-DISABLED after the consecutive-crash threshold (the owner is
  // notified). Delivered to the plugin's installing OWNER (a human — an agent has no
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

/** One stored notification as its recipient reads it — the closed `NotificationEvent` wire union paired with
 *  the durable inbox columns the client needs to render + page. A cross-boundary READ MODEL (it is what the
 *  `notifications.list` query returns AND what the multiplexed socket's `notifications` room frame nests, so
 *  `@orb/contracts/stream` must be able to name it), which is why it homes here rather than in the
 *  `notifications` domain's server-only `contract/` — that file is now a door onto this declaration. */
export interface InboxView {
  readonly id: NotificationId;
  readonly type: NotificationType;
  readonly payload: NotificationEvent;
  /** The monotonic per-recipient cursor — the stable paging / stream-resume key. */
  readonly seq: number;
  /** null = unread; epoch-ms when the recipient first read it (idempotent — set once). */
  readonly readAt: number | null;
  /** null = active in the inbox; epoch-ms when the recipient dismissed it (idempotent — set once). */
  // @view-server-only: `notifications.list` is dismissedAt-EXCLUDED at the query (persistence/queries.ts:86 `isNull(dismissedAt)`), so every row the client receives carries null here — the value exists for the idempotent dismiss flip, not for a reader. Ends if the inbox grows a "dismissed" tab that pages the excluded rows.
  readonly dismissedAt: number | null;
  readonly createdAt: number;
}

/** The `notifications.presence` ask CEILING, enforced at the transport trust boundary (the
 *  {@link NOTIFICATIONS_LIST_MAX_LIMIT} precedent) — an over-bound ask is a BAD_REQUEST, never an unbounded
 *  registry sweep. Sized well past the biggest plausible human roster: the read is a per-id question, so the
 *  cap is what stops it degenerating into "enumerate the deployment" by brute force. */
export const PRESENCE_READ_MAX_USER_IDS = 100;

/** The presence DISCLOSURE wire shape (#1039) — the ONLINE SUBSET of the user ids the caller asked about,
 *  and nothing else.
 *
 *  IT IS A PROJECTION OF {@link PresenceView}, NEVER THE VIEW ITSELF, and the shape is the enforcement.
 *  `PresenceView` also carries `lastSeenAt` — an activity timestamp saying WHEN someone's last device went
 *  dark, which is a behavioural disclosure the roster dot does not need and nobody asked for. Returning ids
 *  instead of per-user objects means there is no field for it to ride on: a future widening has to be an
 *  explicit wire change with its own review, not a struct that quietly grew a member.
 *
 *  A user id the caller asked about and does not get back is OFFLINE **or** not disclosable to them — one
 *  indistinguishable answer, deliberately. That is what keeps a later membership/privacy tightening
 *  (`transport/trpc/presence-disclosure.ts`) free of an existence oracle. */
export interface PresenceSnapshot {
  readonly onlineUserIds: readonly UserId[];
}

/** The per-user presence shape transport derives from the live SSE connection ref-count. A read-model
 *  view, not an inbound wire schema — presence is never client-asserted (a spoofable heartbeat would be
 *  a prompt-composition attack), so there is deliberately no `presenceSchema` to parse a client claim into. */
export interface PresenceView {
  userId: UserId;
  // @view-server-only: no wire producer exists yet — presence is read server-side only (transport's `presence.read`, injected into chat's cast-gating as `readPresence` and used by the stream router's host-return edge), so no tRPC procedure carries this view to a client. The wire surface is RULED TO BE BUILT — #1039 (the D16 invite system's presence half: a membership-gated read + the roster presence dot), provenance #1032. This marker REDS AS STALE the moment that client read lands, which is exactly the signal #1039 wants.
  online: boolean;
  lastSeenAt: number | null;
}
