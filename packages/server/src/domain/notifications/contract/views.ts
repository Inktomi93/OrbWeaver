// domain/notifications/contract/views — the read-model the caller receives for one stored notification.
// InboxView pairs the closed NotificationEvent wire union with the durable inbox columns the client needs
// to render + page.

import type { NotificationEvent, NotificationType } from "@orb/contracts/notifications";
import type { NotificationId } from "@orb/kit/ids";

export interface InboxView {
  readonly id: NotificationId;
  readonly type: NotificationType;
  readonly payload: NotificationEvent;
  /** The monotonic per-recipient cursor — the stable paging / stream-resume key. */
  readonly seq: number;
  /** null = unread; epoch-ms when the recipient first read it (idempotent — set once). */
  readonly readAt: number | null;
  /** null = active in the inbox; epoch-ms when the recipient dismissed it (idempotent — set once). */
  readonly dismissedAt: number | null;
  readonly createdAt: number;
}
