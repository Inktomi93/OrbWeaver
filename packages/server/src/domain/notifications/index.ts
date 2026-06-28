// domain/notifications — FRONT DOOR: the only legal external import. transport consumes the service
// (list/markRead/dismiss + the subscription it builds over this domain's durable table); the entry root
// composes the producer-facing `emit` op from `record` + transport's per-user bus and injects it into chat
// (notifications never imports chat — the edge is one-directional). Cross-boundary wire types (the closed
// `NotificationEvent` union + `PresenceView`) are NOT re-declared here — their canonical home is
// `@orb/contracts/notifications` (§7.4); the domain-internal contract shapes are re-exported type-only.

export type { ListInboxResult } from "./contract/results";
export type { EmitNotification, NotificationsService } from "./contract/service";
export type { InboxView } from "./contract/views";
export { createNotificationsService } from "./service";
