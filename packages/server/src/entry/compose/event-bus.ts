// In-process typed domain-event bus, single-replica v1. An emitting domain receives `bus.emit` as its
// injected op (never reaches the bus directly); a subscriber wires via `bus.subscribe`. ASSUMES(single-
// replica) — the subscriber set is a per-process closure. Emit is fire-and-forget + error-isolated: a
// thrown/rejected handler is logged, never propagated, so a failing subscriber can't break the write path.

import type { DomainEvent, EmitDomainEvent } from "@orb/contracts/events";
import { getLog } from "#foundation/observability";

type DomainEventHandler = (event: DomainEvent) => void | Promise<void>;

/** The in-process bus: the injected `emit` op (handed to emitting domains) + the `subscribe` seam (handed
 *  the indexer at the root). Constructed once per process at `entry/`. */
export interface DomainEventBus {
  readonly emit: EmitDomainEvent;
  readonly subscribe: (handler: DomainEventHandler) => void;
}

/** Run one subscriber with error isolation — a rejection is logged, never propagated to the emitter. */
async function dispatch(handler: DomainEventHandler, event: DomainEvent): Promise<void> {
  try {
    await handler(event);
  } catch (err) {
    getLog().warn({ err, eventType: event.type }, "domain-event handler failed");
  }
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
        void dispatch(handler, event);
      }
    },
  };
}
