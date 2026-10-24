// D263 settlement lives with the settings ledger. Concrete steps are bound from the one manifest at graph construction.
// A deleted key stays recorded; thrown item failures retry, while a false outcome remains unrecorded without failing the pass.

import type { Principal } from "@orb/contracts/identity";
import { errorMessage } from "@orb/kit/error-message";
import type { UserId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { LegacySeedLatches } from "../contract/composed-ops.ts";
import type { ContentSeedPolicyDeps, ContentSeedStep, UserContentSeeder } from "../contract/content-seed.ts";

/** Legacy latches settle only the concrete steps their construction-time descriptor names. */
function latchedKeys(steps: readonly ContentSeedStep[], latches: LegacySeedLatches): readonly string[] {
  return steps.flatMap((step) => (step.legacyLatch !== undefined && latches[step.legacyLatch] ? [step.key] : []));
}

export function createUserContentSeeder(deps: ContentSeedPolicyDeps): UserContentSeeder {
  const log = getLog(deps.logger);
  // The hook fires on every authed request: an account whose pass settled every item is skipped until the
  // process restarts, which is when a new build's manifest items arrive. Assumes single-replica.
  const settled = new Set<UserId>();
  // Two parallel first requests share one run instead of seeding an item twice.
  const inFlight = new Map<UserId, Promise<void>>();

  /** The keys already settled for this account: its ledger, or on its first ledger pass its pre-ledger latches. */
  async function settledKeys(principal: Principal): Promise<ReadonlySet<string>> {
    const seeded = await deps.seededKeys(principal.userId);
    if (seeded.size > 0) {
      return seeded;
    }
    const legacy = latchedKeys(deps.steps, await deps.legacyLatches(principal));
    await deps.recordSeeded(principal.userId, legacy, deps.now());
    return new Set(legacy);
  }

  /** One ordered pass. False step outcomes remain unrecorded; only a thrown failure prevents process memoization. */
  async function seed(principal: Principal): Promise<boolean> {
    const userId = principal.userId;
    const seeded = await settledKeys(principal);
    let complete = true;
    // Sequential, in manifest order: a roster preset seats the characters seeded before it.
    for (const item of deps.steps) {
      if (seeded.has(item.key)) {
        continue;
      }
      // One item's failure is logged and its key left unrecorded, so the next seed retries it; the others still seed.
      try {
        if (await item.seed(principal)) {
          await deps.recordSeeded(userId, [item.key], deps.now());
        }
      } catch (err) {
        complete = false;
        log.error({ userId, key: item.key, err: errorMessage(err) }, "seed: a manifest item failed; it retries on the next seed");
      }
    }
    return complete;
  }

  return {
    ensureSeeded: (principal: Principal): Promise<void> => {
      if (!deps.enabled() || settled.has(principal.userId)) {
        return Promise.resolve();
      }
      const pending = inFlight.get(principal.userId);
      if (pending !== undefined) {
        return pending;
      }
      const run = seed(principal)
        .then((complete): void => {
          if (complete) {
            settled.add(principal.userId);
          }
        })
        .catch((err: unknown): void => {
          log.error({ userId: principal.userId, err: errorMessage(err) }, "seed: the user seed failed");
        })
        .finally((): void => {
          inFlight.delete(principal.userId);
        });
      inFlight.set(principal.userId, run);
      return run;
    },
  };
}
