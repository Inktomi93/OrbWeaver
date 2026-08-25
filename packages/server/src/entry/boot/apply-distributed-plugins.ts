// The NEW-USER half of the server-wide plugin fan-out (D147 clause (d)) — the fifth member of the seeder
// family, and deliberately the THINNEST of them. `installForAllUsers` reaches every user who existed when an
// admin published; this reaches the ones created after, on their first authed request, through the SAME
// shared instance so the in-process memo + the persisted latch make re-runs a no-op. Never throws.
//
// WHY IT IS A LATCH AND NOT A "MISSING PLUGINS" HEAL. The verb it drives (`plugin.applyDistributedPlugins`) is
// idempotent by slug, so re-running it is harmless — but running it on EVERY request would resurrect a
// distributed plugin the moment its recipient uninstalled it, which is the deletion-respect failure the
// example-plugin seeder's latch exists to prevent (#461). So the latch is the authority: once a user has been
// offered the published set, later withdrawals of their copy are THEIR decision, and only a new publish
// (which fans out directly) reaches them again.
//
// THE LATCH IS WRITTEN ONLY AFTER A FULLY SUCCESSFUL PASS. A transient failure — the published asset mid-read,
// a db blip — leaves it unset so the user is retried on their next touch instead of silently skipped forever.
//
// ALL THE PLUGIN LOGIC LIVES IN THE VERB, not here: what a distributed copy is (disabled, zero grant,
// consent-pending), which slugs are published, and the already-held skip are the domain's. This module owns
// exactly the once-per-user question, because the latch is a SETTINGS fact and `domain/plugin` may not read
// settings.

import type { Principal } from "@orb/contracts/identity";
import { errorMessage } from "@orb/kit/error-message";
import type { UserId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";

export interface DistributedPluginApplierDeps {
  /** The REAL self-scoped verb, under the receiving user's own Principal. Returns which slugs it installed. */
  readonly apply: (principal: Principal) => Promise<{ readonly installedSlugs: readonly string[] }>;
  readonly isApplied: (principal: Principal) => Promise<boolean>;
  readonly markApplied: (principal: Principal) => Promise<void>;
}

export interface DistributedPluginApplier {
  readonly ensureApplied: (principal: Principal) => Promise<void>;
}

export function createDistributedPluginApplier(deps: DistributedPluginApplierDeps): DistributedPluginApplier {
  const log = getLog();
  // Populated only on success — a transient failure retries on the next touch. ASSUMES(single-replica).
  const settled = new Set<UserId>();
  const inFlight = new Map<UserId, Promise<void>>();

  async function run(principal: Principal): Promise<void> {
    if (await deps.isApplied(principal)) {
      return;
    }
    const { installedSlugs } = await deps.apply(principal);
    await deps.markApplied(principal);
    if (installedSlugs.length > 0) {
      log.info(
        { userId: principal.userId, slugs: installedSlugs },
        "plugin: applied the server-wide distributed plugins (installed, disabled, nothing granted)",
      );
    }
  }

  return {
    ensureApplied: (principal: Principal): Promise<void> => {
      if (settled.has(principal.userId)) {
        return Promise.resolve();
      }
      const pending = inFlight.get(principal.userId);
      if (pending) {
        return pending;
      }
      const started = run(principal)
        .then((): void => {
          settled.add(principal.userId);
        })
        .catch((err: unknown): void => {
          log.error({ userId: principal.userId, err: errorMessage(err) }, "plugin: distributed-plugin application failed");
        })
        .finally((): void => {
          inFlight.delete(principal.userId);
        });
      inFlight.set(principal.userId, started);
      return started;
    },
  };
}
