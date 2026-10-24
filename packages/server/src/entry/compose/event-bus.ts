// In-process typed domain-event bus, single-replica v1. An emitting domain receives `bus.emit` as its
// injected op (never reaches the bus directly); a subscriber wires via `bus.subscribe`. ASSUMES(single-
// replica) — the subscriber set is a per-process closure in the `@orb/kit/pubsub` engine. Emit is
// fire-and-forget + error-isolated: each handler runs detached under supervision, so a thrown/rejected
// handler is logged, never propagated, and a failing subscriber can't break the write path.

import type { DomainEvent } from "@orb/contracts/events";
import type { OwnedPubSub } from "@orb/kit/pubsub";
import { createPubSub } from "@orb/kit/pubsub";
import type { DetachedSupervision } from "#foundation/observability";

/** Build the in-process domain-event bus. The subscriber set is closure-scoped (ASSUMES single-replica). */
export function createDomainEventBus(supervise: DetachedSupervision["superviseDetached"], newRequestId: () => string): OwnedPubSub<DomainEvent> {
  return createPubSub<DomainEvent>((handler, event) =>
    supervise(`domain-event:${event.type}:${newRequestId()}`, "domain-event.dispatch", { eventType: event.type }, () => handler(event)),
  );
}
