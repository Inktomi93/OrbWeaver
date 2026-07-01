// entry/compose/event-bus — the in-process typed domain-event bus (core/Tier-5-Entry.md §layout "event-bus.ts";
// the deferred "event system" decision → in-process typed bus, single-replica v1). The payload union +
// the injected `EmitDomainEvent` op live in `@orb/contracts/events`; THIS file owns the runtime dispatcher
// the composition root binds: an emitting domain (character/import/assets) receives `bus.emit` as its
// injected op (domain-no-cross-feature — it never reaches the bus directly), and a subscriber (the
// embeddings indexer) is wired via `bus.subscribe`. CLOSED union; a handler re-reads canon by id and never
// trusts event-carried data (@orb/contracts/events).
//
// ASSUMES(single-replica): the subscriber set is a per-process closure (the in-process bus does not cross
// replicas — the durable-outbox upgrade is the multi-replica seam, PRE-SCAFFOLD-CHECKLIST). Emit is
// FIRE-AND-FORGET + ERROR-ISOLATED: a thrown/rejected handler is logged (never propagated), so a failing
// subscriber can never break the emitting domain's write path (the emit op is a sync `void`).

import type { DomainEvent, EmitDomainEvent } from "@orb/contracts/events";
import { getLog } from "#foundation/observability";

/** A subscriber the composition root binds onto the bus — sync or async; its result/rejection is isolated
 *  by `emit`. Kept file-local (no exported type alias outside a contract type-home — the no-inline-types
 *  plugin); consumers pass a compatible callback to {@link DomainEventBus.subscribe}. */
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
