// In-process typed domain-event bus, single-replica v1. An emitting domain receives `bus.emit` as its
// injected op (never reaches the bus directly); a subscriber wires via `bus.subscribe`. ASSUMES(single-
// replica) — the subscriber set is a per-process closure in the `@orb/kit/pubsub` engine. Emit is
// fire-and-forget + error-isolated: each handler runs detached under supervision, so a thrown/rejected
// handler is logged, never propagated, and a failing subscriber can't break the write path.

import { randomUUID } from "node:crypto";
import type { DomainEvent, EmitDomainEvent } from "@orb/contracts/events";
import type { OwnedPubSub, PubSubHandler } from "@orb/kit/pubsub";
import { createPubSub } from "@orb/kit/pubsub";
import { superviseDetached } from "#foundation/observability";

// @orb-waive no-inline-package-interface(DomainEventBus): baselined when the gate landed; burn-down item 952.
/** The in-process bus: the injected `emit` op (handed to emitting domains) + the `subscribe` seam (handed
 *  the indexer at the root). Constructed once per process at `entry/`. */
export interface DomainEventBus {
  readonly emit: EmitDomainEvent;
  readonly subscribe: (handler: PubSubHandler<DomainEvent>) => () => void;
}

/** Build the in-process domain-event bus. The subscriber set is closure-scoped (ASSUMES single-replica). */
export function createDomainEventBus(
  supervise: typeof superviseDetached = superviseDetached,
  newRequestId: () => string = randomUUID,
): OwnedPubSub<DomainEvent> {
  return createPubSub<DomainEvent>((handler, event) =>
    supervise(`domain-event:${event.type}:${newRequestId()}`, "domain-event.dispatch", { eventType: event.type }, () => handler(event)),
  );
}
