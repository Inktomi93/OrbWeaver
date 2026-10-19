// domain/settings — DI bundle builder. Beyond passing through the injected deps, it owns the per-user
// write serializer (shared by both user-settings write verbs) and binds the effective-config/ subsystem
// read side, whose every reload also publishes the private-endpoint allowlist to the egress guard.

import type { EffectiveAppConfig } from "@orb/contracts/settings";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { UserId } from "@orb/kit/ids";
import type { SettingsAssemblyContext, SettingsContext, SettingsServiceDeps } from "./contract/service.ts";
import { createEffectiveConfigCache } from "./effective-config/cache.ts";

export function createSettingsContext(deps: SettingsServiceDeps): SettingsContext {
  const effectiveConfig = deps.effectiveConfig ?? createEffectiveConfigCache(deps.db);
  // Per-user write serializer: both user-settings write paths are read-merge-write against the same row,
  // so concurrent same-user writes would silently drop one under last-write-wins. Queues via a promise
  // chain keyed by userId; different users run concurrently.
  // ASSUMES(single-replica): the chain queues writes within this process only.
  const userWriteChains = new Map<UserId, Promise<unknown>>();
  function serializeUserWrite<T>(ownerId: UserId, run: () => Promise<T>): Promise<T> {
    const prev = userWriteChains.get(ownerId) ?? Promise.resolve();
    // `prev` is `Promise.resolve()` or a stored `tail`, and `tail` is built from `settled`, which swallows every
    // rejection, so it never rejects and `run` needs no rejection arm.
    const next = prev.then(run);
    // @orb-waive caught-failure-ownership(next): `settled` exists so a failed write cannot poison the chain's next
    // link. The caller owns the rejection: `return next` at the foot of this function hands it `run`'s own rejection.
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
    db: databaseForOwner(deps.db),
    now: deps.now,
    audit: deps.audit,
    requireAdmin: deps.requireAdmin,
    requireOwner: deps.requireOwner,
    serializeUserWrite,
    newThemeId: deps.newThemeId,
    emitUserEvent: deps.emitUserEvent,
    materializeBackground: deps.materializeBackground,
    newBackgroundEntryId: deps.newBackgroundEntryId,
    versionIdentity: deps.versionIdentity,
    probeUpstream: deps.probeUpstream,
    getEffectiveConfig: effectiveConfig.getEffectiveConfig,
    reloadEffectiveConfig: async (): Promise<EffectiveAppConfig> => {
      const resolved = await effectiveConfig.reloadEffectiveConfig();
      deps.publishPrivateEndpointAllowlist(resolved.privateEndpointAllowlist);
      deps.onEffectiveConfigChanged?.(resolved);
      return resolved;
    },
  };
}

/** Keep the shared serializer and config bindings without returning a query capability to entry. */
export function createSettingsAssemblyContext(deps: SettingsServiceDeps): SettingsAssemblyContext {
  return { ...createSettingsContext(deps), db: deps.db };
}
