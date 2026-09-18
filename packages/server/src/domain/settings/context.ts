// domain/settings — DI bundle builder. Beyond passing through the injected deps, it owns the per-user
// write serializer (shared by both user-settings write verbs) and binds the effective-config/ subsystem
// read side.

import type { UserId } from "@orb/kit/ids";
import type { SettingsContext, SettingsServiceDeps } from "./contract/service.ts";
import { getEffectiveConfig, reloadEffectiveConfig } from "./effective-config/cache.ts";

export function createSettingsContext(deps: SettingsServiceDeps): SettingsContext {
  // Per-user write serializer: both user-settings write paths are read-merge-write against the same row,
  // so concurrent same-user writes would silently drop one under last-write-wins. Queues via a promise
  // chain keyed by userId; different users run concurrently.
  // ASSUMES(single-replica): the chain queues writes within this process only.
  const userWriteChains = new Map<UserId, Promise<unknown>>();
  function serializeUserWrite<T>(ownerId: UserId, run: () => Promise<T>): Promise<T> {
    const prev = userWriteChains.get(ownerId) ?? Promise.resolve();
    // @orb-waive caught-failure-ownership(prev): propagated — `next` is what this function
    // RETURNS to the caller, so a failed write reaches the caller unmuted through `next`'s own rejection.
    // Ends if `next` stops being the returned promise.
    const next = prev.then(run, run);
    // @orb-waive caught-failure-ownership(next): scaffolding only — `settled` exists so a
    // failed write cannot poison the CHAIN's next link (the comment two lines below the app-settings twin
    // states the same contract); the real outcome the caller sees is `next`, not `settled`. Ends if
    // `settled` is read anywhere but the chain-continuation plumbing.
    const settled = next.catch(() => undefined);
    const tail = settled.finally(() => {
      if (userWriteChains.get(ownerId) === tail) {
        userWriteChains.delete(ownerId);
      }
    });
    userWriteChains.set(ownerId, tail);
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
    onEmbedModelChanged: deps.onEmbedModelChanged,
    materializeBackground: deps.materializeBackground,
    newBackgroundEntryId: deps.newBackgroundEntryId,
    versionIdentity: deps.versionIdentity,
    probeUpstreamHead: deps.probeUpstreamHead,
    getEffectiveConfig,
    reloadEffectiveConfig: () => reloadEffectiveConfig(deps.db),
  };
}
