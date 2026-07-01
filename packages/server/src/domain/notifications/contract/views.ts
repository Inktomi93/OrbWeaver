// domain/notifications/contract/views — the read-model the caller (via transport) receives for ONE stored
// notification (core/Core-0-Architecture-and-Structure.md §4: "what shape does the client get?" → contract/views.ts). `InboxView` is a
// stored-row projection — it pairs the CLOSED `NotificationEvent` wire union (`@orb/contracts/notifications`,
// the secret-free `type`+`payload`) with the durable inbox columns the client needs to render + page:
// `seq` (the monotonic per-recipient cursor / `lastEventId` resume key), the `readAt`/`dismissedAt` state
// (null = unread / active), and `createdAt`. No row id leaks beyond the recipient's own `id`; there is no
// secret field because the union itself cannot represent one (notifications.md invariant #2).

import type { NotificationEvent, NotificationType } from "@orb/contracts/notifications";
import type { NotificationId } from "@orb/kit/ids";

/** One durable notification as the recipient sees it — the closed event plus its inbox state + cursor. */
export interface InboxView {
  readonly id: NotificationId;
  /** The delivery-reason discriminant (denormalized `payload.type`) — derived from the union's one home. */
  readonly type: NotificationType;
  /** The full closed event; secret-free by construction (the union strips unknown keys at the parse seam). */
  readonly payload: NotificationEvent;
  /** The monotonic per-recipient cursor — the stable paging / stream-resume key. */
  readonly seq: number;
  /** null = unread; epoch-ms when the recipient first read it (idempotent — set once). */
  readonly readAt: number | null;
  /** null = active in the inbox; epoch-ms when the recipient dismissed it (idempotent — set once). */
  readonly dismissedAt: number | null;
  readonly createdAt: number;
}
