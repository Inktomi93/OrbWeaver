// domain/settings — DI bundle builder. Beyond passing through the injected deps, it owns the per-user
// write serializer (shared by both user-settings write verbs) and binds the effective-config/ subsystem
// read side.

import type { UserId } from "@orb/kit/ids";
import type { SettingsContext, SettingsServiceDeps } from "./contract/service";
import { getEffectiveConfig, reloadEffectiveConfig } from "./effective-config/cache";

export function createSettingsContext(deps: SettingsServiceDeps): SettingsContext {
  // Per-user write serializer: both user-settings write paths are read-merge-write against the same row,
  // so concurrent same-user writes would silently drop one under last-write-wins. Queues via a promise
  // chain keyed by userId; different users run concurrently.
  // ASSUMES(single-replica): the chain queues writes within this process only.
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
    newThemeId: deps.newThemeId,
    emitUserEvent: deps.emitUserEvent,
    getEffectiveConfig,
    reloadEffectiveConfig: () => reloadEffectiveConfig(deps.db),
  };
}
