// In-process typed domain-event bus, single-replica v1. An emitting domain receives `bus.emit` as its
// injected op (never reaches the bus directly); a subscriber wires via `bus.subscribe`. ASSUMES(single-
// replica) — the subscriber set is a per-process closure. Emit is fire-and-forget + error-isolated: a
// thrown/rejected handler is logged, never propagated, so a failing subscriber can't break the write path.

import { randomUUID } from "node:crypto";
import type { DomainEvent, EmitDomainEvent } from "@orb/contracts/events";
import { superviseDetached } from "#foundation/observability";

type DomainEventHandler = (event: DomainEvent) => void | Promise<void>;

/** The in-process bus: the injected `emit` op (handed to emitting domains) + the `subscribe` seam (handed
 *  the indexer at the root). Constructed once per process at `entry/`. */
export interface DomainEventBus {
  readonly emit: EmitDomainEvent;
  readonly subscribe: (handler: DomainEventHandler) => void;
}

/** Build the in-process domain-event bus. The subscriber set is closure-scoped (ASSUMES single-replica). */
export function createDomainEventBus(): DomainEventBus {
  const handlers = new Set<DomainEventHandler>();
  return {
    subscribe: (handler: DomainEventHandler): void => {
      handlers.add(handler);
    },
    emit: (event: DomainEvent): void => {
      for (const handler of handlers) {
        superviseDetached(`domain-event:${event.type}:${randomUUID()}`, "domain-event.dispatch", { eventType: event.type }, () => handler(event));
      }
    },
  };
}
