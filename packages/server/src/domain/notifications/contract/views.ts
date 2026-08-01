// domain/notifications/contract/views — the DOOR onto the read-model the caller receives for one stored
// notification. `InboxView` itself declares in `@orb/contracts/notifications` (one home): it is a
// cross-boundary shape on TWO wires now — the `notifications.list` query result AND the `notifications`
// room frame of the multiplexed socket (`@orb/contracts/stream`, SSE-1 §3.2) — and `contracts` sits below
// `server` in the cake, so it cannot reach up here for it. This file stays as the domain-relative import
// path its verbs/service already use.

export type { InboxView } from "@orb/contracts/notifications";
