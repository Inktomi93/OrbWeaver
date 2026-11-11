// domain/notifications — the ctx BUILDER: assembles `NotificationsContext` (db, injected clock, id source,
// logger and the standing-ask resolver) for the verbs to close over. Excludes `emit` — that op flows the OTHER
// way (this domain PROVIDES `record`; the entry root composes `emit` for producers). The bundle's TYPE
// is the explicit interface in `contract/service.ts` (no `ReturnType<>` — `no-context-returntype`).
// D60's agent-principal recipient guard is design-of-record under its build-state rider: no such op is in this bundle.

import type { NotificationsContext } from "./contract/service.ts";

export function createNotificationsContext(parts: NotificationsContext): NotificationsContext {
  return { ...parts };
}
