// domain/settings — DI BUNDLE builder. Beyond passing through the injected deps, it OWNS the per-user
// write serializer (one instance shared by BOTH user-settings write verbs → it lives here, not in a verb;
// esoteric #5) and binds the `effective-config/` subsystem read side (context.ts is a composition surface,
// the one place allowed to reach a named subsystem — `domain-substrate-mediates-subsystems` exempts
// service/index/context). The explicit `SettingsContext` interface is homed in `contract/service.ts`
// (`no-context-returntype`); this file is the BUILDER.

import type { UserId } from "@orb/kit/ids";
import type { SettingsContext, SettingsServiceDeps } from "./contract/service";
import { getEffectiveConfig, reloadEffectiveConfig } from "./effective-config/cache";

export function createSettingsContext(deps: SettingsServiceDeps): SettingsContext {
  // Per-user write serializer. Both user-settings write paths are read-merge-write against the same row,
  // so two concurrent same-user writes would each read the same base and last-write-wins would silently
  // drop one. Serialize per user via a promise chain keyed by userId — different users run concurrently;
  // same-user writes queue. A failed write resolves the chain link (`.catch`) so one error can't wedge the
  // queue; the map entry is pruned once it's still the tail after settling (keeps the map bounded).
  // ASSUMES(single-replica): the chain queues writes within THIS process only (function-scope state).
  const userWriteChains = new Map<UserId, Promise<unknown>>();
  function serializeUserWrite<T>(ownerId: UserId, run: () => Promise<T>): Promise<T> {
    const prev = userWriteChains.get(ownerId) ?? Promise.resolve();
    const next = prev.then(run, run);
    const tail = next.catch(() => undefined);
    userWriteChains.set(ownerId, tail);
    void tail.finally(() => {
      if (userWriteChains.get(ownerId) === tail) {
        userWriteChains.delete(ownerId);
      }
    });
    return next;
  }

  return {
    db: deps.db,
    now: deps.now,
    audit: deps.audit,
    requireAdmin: deps.requireAdmin,
    requireOwner: deps.requireOwner,
    serializeUserWrite,
    getEffectiveConfig,
    reloadEffectiveConfig: () => reloadEffectiveConfig(deps.db),
  };
}
