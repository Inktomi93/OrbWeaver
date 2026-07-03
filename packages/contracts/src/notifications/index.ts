// The notifications cross-boundary wire surface — the CLOSED `NotificationEvent` discriminated union and
// the read-only `PresenceView` (D16; shared-dissolution §4). The per-chat bus
// CANNOT reach a non-member (they can't subscribe to a chat they're not in), so invite / kick / host-handoff
// delivery rides a per-user durable inbox owned by the `notifications` domain; this node is the wire shape
// that domain persists (the `type` + `payload` columns) and that transport streams to the caller.
//
// TWO load-bearing belts (both the whole point of the union being a
// CONTRACT and not a loose blob):
//   • recipientUserId is MANDATORY on every variant — a notification with no recipient is unrepresentable.
//   • credentials / secrets / baseUrls are TYPE-LEVEL UNREPRESENTABLE (the `bus-payload-allowlist` gate,
//     neo group-plan §9 phishing/exfil belt). The union is built from `z.object` members (which STRIP
//     unknown keys — never `.loose()`/`.catchall()`) whose payload fields are EXCLUSIVELY branded ids,
//     public handles, and the discriminant literal. There is no `z.unknown()`, no `z.record(...)`, no open
//     index field a secret could ride in. A producer cannot place an `apiKey`/`baseUrl` into an event
//     because no variant declares — and the schema strips — any field to carry it.
//
// DAG root: kit-only. Imports the `UserId`/`ChatId`/`ChatInviteId`/`Handle` brands from `@orb/kit/ids`
// (+ `ID_PREFIX` for the prefix-validating TypeID schemas) + zod. No domain, no `@orb/db`, no sibling
// contracts node — `NotificationEvent` carries a `ChatId` (a branded id), never an embedded chat wire shape,
// so it stays Layer 0 (the `contracts/notifications` FLAG in the DAG resolves to kit-only).

import type { Handle, UserId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

// ── Shared id schemas (built once; reused across the closed variants) ─────────
// `recipientUserId` repeats on every member by design — it is the FK the inbox is scoped by AND the proof
// that a notification always names its single recipient. `UserId` is a plain `Branded` nanoid (db.md §4),
// so it validates with `brandedId` (non-empty) rather than the prefix-checking `typeIdSchema`.
const recipientUserIdSchema = brandedId<UserId>();
const chatIdSchema = typeIdSchema(ID_PREFIX.chat);
const chatInviteIdSchema = typeIdSchema(ID_PREFIX.chatInvite);
// A public username (the host who invited you / the nominee who took the room) — never a secret. The richer
// preview (room name / host name / member count / mode) is fetched separately via `previewInvite`; the
// event only POINTS, carrying the public handle so the inbox can render "X invited you" without a round-trip.
const handleSchema = brandedId<Handle>();

// ── The CLOSED NotificationEvent union (the `type` + `payload` wire) ──────────
// `invite` → the invitee; `kicked` → the removed member; `handoff-nominated` → the nominee; `handoff-accepted`
// → the previous host. The discriminant strings ARE the db `notifications.type` column values. CLOSED: adding
// a delivery reason is a new member HERE (+ its producer in chat) — `tsc` (the `Record<NotificationType,…>`
// exhaustiveness guard in the contract test) red-flags any consumer that forgets to handle it.
export const notificationEventSchema = z.discriminatedUnion("type", [
  // You've been invited to a chat. `inviteId` is the redeem handle; `invitedByHandle` is the host's public name.
  z.object({
    type: z.literal("invite"),
    recipientUserId: recipientUserIdSchema,
    chatId: chatIdSchema,
    inviteId: chatInviteIdSchema,
    invitedByHandle: handleSchema,
  }),
  // You've been removed from a chat (host kick). The id alone is enough — the room is no longer readable.
  z.object({
    type: z.literal("kicked"),
    recipientUserId: recipientUserIdSchema,
    chatId: chatIdSchema,
  }),
  // You've been nominated as the new host (two-party handoff, step 1). The "what your credentials will power"
  // confirmation is fetched at accept time — it is NOT carried here (it would risk leaking funding detail).
  z.object({
    type: z.literal("handoff-nominated"),
    recipientUserId: recipientUserIdSchema,
    chatId: chatIdSchema,
  }),
  // The nominee accepted; you (the previous host) are notified of the role swap. `newHostHandle` is public.
  z.object({
    type: z.literal("handoff-accepted"),
    recipientUserId: recipientUserIdSchema,
    chatId: chatIdSchema,
    newHostHandle: handleSchema,
  }),
]);

/** The closed per-user delivery event. Inferred from the schema so the wire gate and the type can't drift. */
export type NotificationEvent = z.infer<typeof notificationEventSchema>;

/** The delivery-reason discriminant — derived from the union (its one home; the db `type` column mirrors it).
 *  A `Record<NotificationType, …>` is the exhaustiveness lever consumers switch on. */
export type NotificationType = NotificationEvent["type"];

// ── PresenceView (the per-user presence wire — read-only, server-derived) ─────
/**
 * The per-user presence shape transport derives from the live SSE connection ref-count (chat.md Part III §4)
 * and injects into chat for cast-gating. It is a READ-MODEL view (an outbound shape, not an inbound wire
 * schema): presence is NEVER client-asserted — a spoofable heartbeat would be a prompt-composition attack
 * (presence → cast → injected WI/persona, neo §9) — so there is deliberately no `presenceSchema` to parse a
 * client claim into. `lastSeenAt` is epoch ms of the last observed disconnect, or `null` while `online` (or
 * if never seen). The view is per `userId`; cast-gating reads it once per round (a flip takes effect next round).
 */
export interface PresenceView {
  userId: UserId;
  online: boolean;
  lastSeenAt: number | null;
}
