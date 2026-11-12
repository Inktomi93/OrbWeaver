// The notifications cross-boundary wire surface — the CLOSED `NotificationEvent` discriminated union and
// the read-only `PresenceView`. Invite/kick/host-handoff/automation-notice/plugin-disabled ride a per-user
// durable inbox (a non-member can't subscribe to a chat's bus), so this node is the wire shape that domain
// persists. Not every member is about a second human, though the transport belt still assumes so: the
// owner-addressed `plugin-disabled` (`domain/plugin/activation/crash-policy.ts`), the owner-GLOBAL
// `automation-notice` (`domain/automation/engine/dispatch.ts`, `chatId: null`) and now
// `plugins-awaiting-consent` are all deliverable on a single-user box and all swallowed there by the
// multi-human refusal on the router + the socket room. That is a stated gap, not a fit. (agent-seat-request/crew-proposal were purged-domain members; the agents feature grafts here if
// it returns.)
// `recipientUserId` is mandatory on every variant. Credentials/secrets/baseUrls are TYPE-LEVEL
// unrepresentable: every member declares `.strip()` — no `z.looseObject`, no `z.unknown()`.

// `UserId` is a plain `Branded` nanoid, so it validates with `brandedId` rather than `typeIdSchema`.

// Strip mode: these schemas also read stored rows, which can carry keys this release does not declare.
import type { ChatId, ChatInviteId, NotificationId, UserId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { handoffOfferContentsSchema } from "../chat/roster.ts";
import { pageDirectionShape } from "../rpc/index.ts";

const recipientUserIdSchema = brandedId("UserId");
const chatIdSchema = typeIdSchema(ID_PREFIX.chat);
const chatInviteIdSchema = typeIdSchema(ID_PREFIX.chatInvite);
const handleSchema = brandedId("Handle");
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
 *  `all_members_except_actor` is the async-table member: in a
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
// reason is a member here + its chat producer.
export const notificationEventSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("invite"),
      recipientUserId: recipientUserIdSchema,
      chatId: chatIdSchema,
      inviteId: chatInviteIdSchema,
      invitedByHandle: handleSchema,
    })
    .strip(),
  z
    .object({
      type: z.literal("kicked"),
      recipientUserId: recipientUserIdSchema,
      chatId: chatIdSchema,
    })
    .strip(),
  // THE NOMINATION CARRIES ITS OWN DISCLOSURE. Accepting is not just "you now host this room": it
  // lands the departing host's characters, world books, GM voice and the room's REGEX SCRIPTS — executable
  // transforms over the accepter's chats — in the NOMINEE's library. The receiving side rendered a
  // bare Accept for all of it, so the counts ride the payload and the client confirms against them.
  //
  // COUNTS, NOT IDS — the ids-only habit inverts here and the shape is the reason: the nominee owns none of
  // those rows yet, so an id would be an unreadable pointer AND a second user's library key on the wire.
  // `handoffOfferContentsSchema` (`@orb/contracts/chat`) is its one home, beside the OFFER it previews, so
  // the producer's resolution and the reader's render cannot drift into two shapes.
  z
    .object({
      type: z.literal("handoff-nominated"),
      recipientUserId: recipientUserIdSchema,
      chatId: chatIdSchema,
      /** What accepting would copy into the recipient's library, frozen at nominate. All-zero = the room
       *  transfers and nothing else does (the built D64 drop), which the confirm says in as many words. */
      offer: handoffOfferContentsSchema,
    })
    .strip(),
  z
    .object({
      type: z.literal("handoff-accepted"),
      recipientUserId: recipientUserIdSchema,
      chatId: chatIdSchema,
      newHostHandle: handleSchema,
    })
    .strip(),
  // A host-offline DEFERRED AI turn (chat `pending_turns`, Part III §5) that a drain PERMANENTLY dropped —
  // delivered to the frozen `triggeredBy` member so their owed reply never silently vanishes. `reason`:
  // `consent` (the turn's frozen host is outside the room's consent set at drain time: disabled, or no longer
  // present) | `chat-gone` (the room, or its host seat, is gone).
  // A budget/transient drain outcome RE-QUEUES (no notification), so this is only the terminal-verdict path.
  z
    .object({
      type: z.literal("deferred-turn-dropped"),
      recipientUserId: recipientUserIdSchema,
      chatId: chatIdSchema,
      reason: z.enum(["consent", "chat-gone"]),
    })
    .strip(),
  // An automation `post_notification` arm firing (§AC-C) OR a plugin `notify`
  // (the SAME durable path, participants only). The one member that carries a rendered
  // `message` — a host-authored/plugin-authored template rendered server-side over room state (a rule that only
  // says "fired" is useless); still closed + secret-unrepresentable (a capped string, not a handle). `source`
  // is a discriminated union (rule vs plugin — NOT a synthetic rule id: a plugin notice has no rule), whose id
  // deep-links the host's rule debug surface / the owner's plugin surface; `chatId` scopes the notice;
  // `recipientUserId` is a chat participant by construction (host or a present member — the producer gates
  // recipients to the roster). Stored in the JSON `payload` blob, so widening `source` needs no db migration.
  z
    .object({
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
        z.object({ kind: z.literal("rule"), ruleId: automationRuleIdSchema }).strip(),
        z.object({ kind: z.literal("plugin"), pluginId: pluginIdSchema }).strip(),
      ]),
      message: z.string().max(AUTOMATION_NOTICE_MESSAGE_MAX),
    })
    .strip(),
  // A resident plugin the crash policy AUTO-DISABLED after the consecutive-crash threshold (the owner is
  // notified). Delivered to the plugin's installing OWNER (a human — an agent has no
  // inbox). Ids only: `pluginId` deep-links the owner's plugin-management surface where `lastError` /
  // `consecutiveCrashes` already live (no free error string on the wire — the detail is read there, never
  // smuggled through the durable payload). NOT chat-scoped (a plugin is owner-installed, not room-bound).
  z
    .object({
      type: z.literal("plugin-disabled"),
      recipientUserId: recipientUserIdSchema,
      pluginId: pluginIdSchema,
    })
    .strip(),
  // THE STANDING CONSENT ASK, AGGREGATED. Installed plugins the recipient has not answered
  // yet — a fresh boot lands NINE of them (installed, disabled, empty grant, `pending_reconsent` raised:
  // `entry/boot/seed-example-plugins.ts`) and, before this member existed, nothing ever asked. It is ONE
  // row per recipient, never one per plugin (owner ruling): nine inbox rows for one decision is
  // the spam that trains dismissal, and the per-plugin approve/deny surface already exists (Settings →
  // Plugins, which sorts the pending rows first).
  //
  // COUNT-ONLY IS THE WHOLE PAYLOAD, and deliberately so: it is a POINTER to the consent surface, not a
  // copy of it. What each plugin asks for, and why, is rendered THERE from the persisted manifest — a
  // second rendering in the inbox would be a second home for consent copy that could disagree with the
  // screen the answer is actually given on. Ids-only, like `plugin-disabled` (no free strings on the wire).
  //
  // `.min(1)` IS THE ZERO RULE AT THE TYPE: an aggregate that says "0 waiting" is unrepresentable, which is
  // how "when the last ask is answered the row is RETRACTED, never rewritten to zero" stops being prose
  // (the producer's `retract` path — `domain/notifications/verbs/standing.ts`).
  z
    .object({
      type: z.literal("plugins-awaiting-consent"),
      recipientUserId: recipientUserIdSchema,
      /** How many of the recipient's installed plugins are standing on their answer, at emission. The
       *  consent surface is the live truth; this is what the row says while it waits. */
      pendingCount: z.int().min(1),
    })
    .strip(),
]);

export type NotificationEvent = z.infer<typeof notificationEventSchema>;
export type NotificationType = NotificationEvent["type"];

// ── the RUNTIME tuple ─────────────────────────────────────────────────────────────────
// The union above exported only its derived TYPE, so `@orb/db`'s `notifications` schema — which needs the
// members as VALUES to build its `type in (…)` CHECK — hand-spelled its own tuple, and the db test then
// proved the two agreed by reaching into zod's internal discriminated-union option shape
// (`.options[].shape.type.value`, flagged FABRICATION-OK). A respelling plus an introspection test is what
// this package exports real tuples to avoid (`USER_ROLES`, `PARTICIPANT_KINDS` and friends).
//
// BOTH DIRECTIONS ARE COMPILE-TIME, and it takes two halves because a drizzle `text({ enum })` column
// needs a NON-EMPTY TUPLE type, which rules out deriving the values from a mapped Record at runtime:
//   • NO NON-MEMBER — `satisfies readonly NotificationType[]` here (a typo fails `tsc` on this line);
//   • NO MISSING MEMBER — needs a type-level `Exclude<NotificationType, …>` proof.
// Between them the tuple cannot drift from the union, which is strictly stronger than the runtime
// assertion (over zod's internal option shape) this replaces.

/** Every `NotificationEvent` discriminant as VALUES — the db `notifications.type` column's enum + CHECK
 *  list, and anything else that needs to enumerate the axis at runtime. Provably the whole union. */
export const NOTIFICATION_TYPES = [
  "invite",
  "kicked",
  "handoff-nominated",
  "handoff-accepted",
  "deferred-turn-dropped",
  "automation-notice",
  "plugin-disabled",
  "plugins-awaiting-consent",
] as const satisfies readonly NotificationType[];

/** One stored notification as its recipient reads it — the closed `NotificationEvent` wire union paired with
 *  the durable inbox columns the client needs to render + page. A cross-boundary READ MODEL (it is what the
 *  `notifications.list` query returns AND what the multiplexed socket's `notifications` room frame nests, so
 *  `@orb/contracts/stream` must be able to name it), which is why it homes here rather than in the
 *  `notifications` domain's server-only `contract/` — that file is now a door onto this declaration. */
interface InboxViewFields {
  readonly id: NotificationId;
  /** THIS ROW IS STILL WAITING ON A DECISION — an invite nobody has accepted or declined, a host
   *  nomination nobody has confirmed, a standing consent ask. FALSE for an informational row (a kick, a
   *  handoff someone else accepted, an auto-disable notice), and false for a decision that has since been
   *  settled ANYWHERE — accepted from a share link, revoked by the host, or accepted here by a client whose
   *  follow-up dismiss failed.
   *
   *  IT IS DERIVED SERVER-SIDE, ON BOTH WIRES, AND THE READER MUST NOT RE-DERIVE IT. The bell's indicator
   *  means "new OR pending" (owner ruling): opening the inbox marks every row read, which clears the
   *  NEW half, and only ACTING clears this one. A client cannot compute that — the settling state lives in
   *  the chat domain's `chat_invites.status` and `chats.pending_host_user_id`, which the inbox reader has
   *  no business reading and which change without any notification row changing. So the domain resolves it
   *  through ONE injected op for the page it is about to return (`contract/ops.ts`
   *  `ResolveStandingAsks`), and `notifications.list` and the `notifications` room frame stamp it through
   *  the same substrate so the two wires can never disagree.
   *
   *  It is a POINT-IN-TIME read, like `readAt`: a row whose decision settles elsewhere keeps `true` on the
   *  copy an open tab already holds until the next list/resume. That is the same freshness every other
   *  field on this view has, and the acting client invalidates its own read. */
  readonly actionable: boolean;
  /** The monotonic per-recipient cursor — the stable paging / stream-resume key. */
  readonly seq: number;
  /** null = unread; epoch-ms when the recipient first read it (idempotent — set once). */
  readonly readAt: number | null;
  /** null = active in the inbox; epoch-ms when the recipient dismissed it (idempotent — set once). */
  readonly dismissedAt: number | null;
  readonly createdAt: number;
}

export type InboxView = {
  readonly [T in NotificationType]: InboxViewFields & { readonly type: T; readonly payload: Extract<NotificationEvent, { readonly type: T }> };
}[NotificationType];

const [
  inviteEvent,
  kickedEvent,
  handoffNominatedEvent,
  handoffAcceptedEvent,
  deferredTurnDroppedEvent,
  automationNoticeEvent,
  pluginDisabledEvent,
  pluginsAwaitingConsentEvent,
] = notificationEventSchema.options;
const [ruleNoticeSource, pluginNoticeSource] = automationNoticeEvent.shape.source.options;
const notificationOutputSchema = z.discriminatedUnion("type", [
  inviteEvent.strict(),
  kickedEvent.strict(),
  handoffNominatedEvent.extend({ offer: handoffOfferContentsSchema.strict() }).strict(),
  handoffAcceptedEvent.strict(),
  deferredTurnDroppedEvent.strict(),
  automationNoticeEvent.extend({ source: z.discriminatedUnion("kind", [ruleNoticeSource.strict(), pluginNoticeSource.strict()]) }).strict(),
  pluginDisabledEvent.strict(),
  pluginsAwaitingConsentEvent.strict(),
]) satisfies z.ZodType<NotificationEvent>;

const inboxViewFields = z.strictObject({
  id: typeIdSchema(ID_PREFIX.notification),
  actionable: z.boolean(),
  seq: z.number(),
  readAt: z.number().nullable(),
  dismissedAt: z.number().nullable(),
  createdAt: z.number(),
});
const [inviteOutput, kickedOutput, nominatedOutput, acceptedOutput, droppedOutput, noticeOutput, disabledOutput, consentOutput] =
  notificationOutputSchema.options;
export const inboxViewSchema = z.discriminatedUnion("type", [
  inboxViewFields.extend({ type: inviteOutput.shape.type, payload: inviteOutput }),
  inboxViewFields.extend({ type: kickedOutput.shape.type, payload: kickedOutput }),
  inboxViewFields.extend({ type: nominatedOutput.shape.type, payload: nominatedOutput }),
  inboxViewFields.extend({ type: acceptedOutput.shape.type, payload: acceptedOutput }),
  inboxViewFields.extend({ type: droppedOutput.shape.type, payload: droppedOutput }),
  inboxViewFields.extend({ type: noticeOutput.shape.type, payload: noticeOutput }),
  inboxViewFields.extend({ type: disabledOutput.shape.type, payload: disabledOutput }),
  inboxViewFields.extend({ type: consentOutput.shape.type, payload: consentOutput }),
]) satisfies z.ZodType<InboxView>;

/** The `notifications.presence` ask CEILING, enforced at the transport trust boundary (the
 *  {@link NOTIFICATIONS_LIST_MAX_LIMIT} precedent) — an over-bound ask is a BAD_REQUEST, never an unbounded
 *  registry sweep. Sized well past the biggest plausible human roster: the read is a per-id question, so the
 *  cap is what stops it degenerating into "enumerate the deployment" by brute force. */
export const PRESENCE_READ_MAX_USER_IDS = 100;

/** When an asked-about user's last device left. Absent for an online user and for one this process has not
 *  seen, so a missing entry never means "long gone". */
export interface PresenceLastSeen {
  readonly userId: UserId;
  readonly lastSeenAt: number;
}

/** The presence DISCLOSURE wire shape — of the user ids the caller asked about, who is online and
 *  when the others were last around.
 *
 *  IT IS A PROJECTION OF {@link PresenceView}, NEVER THE VIEW ITSELF, so a new `PresenceView` member reaches
 *  the wire only by an explicit change here.
 *
 *  An id in `lastSeen` proves that user connected since the server booted, so a caller who types an arbitrary
 *  id learns whether that account has been online this run. That is the v1 audience (everyone sees presence),
 *  and it is as wide as `onlineUserIds`. An id absent from both lists is never-seen-this-run **or** not
 *  disclosable: one answer, so a later membership/privacy tightening
 *  (`transport/trpc/presence-disclosure.ts`) can still withhold without telling the asker which. */
export interface PresenceSnapshot {
  readonly onlineUserIds: readonly UserId[];
  readonly lastSeen: readonly PresenceLastSeen[];
}

export const presenceSnapshotSchema = z.strictObject({
  onlineUserIds: z.array(brandedId("UserId")).readonly(),
  lastSeen: z.array(z.strictObject({ userId: brandedId("UserId"), lastSeenAt: z.number() })).readonly(),
}) satisfies z.ZodType<PresenceSnapshot>;

/** The per-user presence shape transport derives from the live SSE connection ref-count. A read-model
 *  view, not an inbound wire schema — presence is never client-asserted (a spoofable heartbeat would be
 *  a prompt-composition attack), so there is deliberately no `presenceSchema` to parse a client claim into. */
export interface PresenceView {
  userId: UserId;
  online: boolean;
  lastSeenAt: number | null;
}

/** Which half of the caller's inbox `notifications.list` pages. */
const INBOX_STATES = ["active", "dismissed"] as const;
export type InboxState = (typeof INBOX_STATES)[number];

/** Newest-first rows of one {@link InboxState}. */
export interface ListInboxResult {
  readonly items: readonly InboxView[];
  readonly nextCursor: number | null;
}

export interface MarkAllReadResult {
  readonly markedCount: number;
}

export const listInboxResultSchema = z.strictObject({
  items: z.array(inboxViewSchema).readonly(),
  nextCursor: z.number().nullable(),
}) satisfies z.ZodType<ListInboxResult>;
export const markAllReadResultSchema = z.strictObject({ markedCount: z.number() }) satisfies z.ZodType<MarkAllReadResult>;

/** The producer-facing op a producer injects to deliver a notification — the one cross-feature edge. `emit`
 *  = `record` (the durable INSERT) + the after-commit per-user bus fan-out, durable-first (the INSERT
 *  happens before any fan-out, so the event is deliverable from the table alone). Composed at `entry/` from
 *  this domain's `record` + transport's bus. */
export type EmitNotification = (event: NotificationEvent) => Promise<void>;

export const listInboxInputSchema = z
  .strictObject({
    cursor: z.number().optional(),
    limit: z.int().min(1).max(NOTIFICATIONS_LIST_MAX_LIMIT).optional(),
    state: z.enum(INBOX_STATES).optional(),
    ...pageDirectionShape,
  })
  .optional();

/** What the inbox asks chat about: the ids on ONE page of rows that carry a chat-owned decision. The op
 *  traffics in bare ids so neither domain spells the other's vocabulary. */
export interface StandingAsksParams {
  /** Whose inbox: the provider re-checks it, so a foreign row can never come back "standing". */
  readonly recipientUserId: UserId;
  /** Invites named by `invite` rows on this page (deduped by the caller). */
  readonly inviteIds: readonly ChatInviteId[];
  /** Chats named by `handoff-nominated` rows on this page (deduped by the caller). */
  readonly nominatedChatIds: readonly ChatId[];
}

/** The SUBSET still awaiting the recipient's decision. An id the caller asked about and does not get back
 *  is settled, gone, or was never theirs: one indistinguishable answer, so the read is no existence oracle
 *  over another user's rooms. */
export interface StandingAsksResult {
  readonly inviteIds: readonly ChatInviteId[];
  readonly nominatedChatIds: readonly ChatId[];
}

/** Resolve which of a page's chat-owned decisions are still standing. ONE call per page, never per row. */
export type ResolveStandingAsks = (params: StandingAsksParams) => Promise<StandingAsksResult>;
