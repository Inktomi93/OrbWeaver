// The catalog MIRROR: an in-memory copy of a persisted snapshot, read synchronously by the resolve path,
// warmed on demand cheapest-first (snapshot → live fetch), single-flighted so a burst of turns shares ONE
// fetch, and BEST-EFFORT by construction — a provider being unreachable never fails a turn; the resolve
// continues on a capability whose window MARKS ITSELF estimated. The TTL is a very-stale sanity CEILING
// (a week — the daily refresh workload has been failing for seven days straight), never a freshness gate:
// capability flags are stable for far longer than a day, and a 1h TTL once expired the mirror long before
// the daily refresh re-warmed it, so a restarted process silently lost every advertised capability.

import { z } from "zod";
import { scrubbedReason } from "../backends/wire/model-listing.ts";
import type { Mirror, MirrorDeps } from "../contract/catalog.ts";
import type { ProviderScrubSet } from "../contract/errors.ts";
import type { MirrorWarm } from "../contract/runtime.ts";

const MS_PER_WEEK = 604_800_000;
/** How long a failed live fetch is answered from memory. The several resolves of one connection write, or a burst of
 *  turns, then share one wait on a dead server instead of each dialing it again; past it the next warm asks again. */
const FAILED_WARM_HOLD_MS = 10_000;

const snapshotSchema = z.object({ fetchedAt: z.number(), value: z.unknown() });

export function createMirror<T>(args: {
  readonly key: string;
  readonly schema: z.ZodType<T>;
  readonly ttlMs?: number | undefined;
  readonly deps: MirrorDeps;
}): Mirror<T> {
  const { key, schema, deps } = args;
  const ttl = args.ttlMs ?? MS_PER_WEEK;
  let cache: { readonly at: number; readonly value: T } | null = null;
  let inFlight: Promise<MirrorWarm<T>> | null = null;
  let failed: { readonly at: number; readonly warm: MirrorWarm<T> } | null = null;
  let skipSnapshotOnce = false;
  // Bumped by every invalidate. A warm publishes (cache + snapshot) only if the epoch it started under is still
  // current, so a fetch that was in flight when the connection changed cannot re-seed what the invalidate dropped.
  let epoch = 0;

  const get = (): T | null => (cache !== null && deps.now() - cache.at < ttl ? cache.value : null);
  const seed = (value: T, at: number): void => {
    cache = { at, value };
  };

  const readSnapshot = async (startedAt: number): Promise<boolean> => {
    const raw = await deps.snapshotStore.read(key);
    if (raw === null) {
      return false;
    }
    const parsed = snapshotSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return false;
    }
    const value = schema.safeParse(parsed.data.value);
    if (!value.success || deps.now() - parsed.data.fetchedAt >= ttl) {
      return false;
    }
    if (epoch !== startedAt) {
      return false;
    }
    seed(value.data, parsed.data.fetchedAt);
    return true;
  };

  const warmOnce = async (fetch: () => Promise<T>, secrets: ProviderScrubSet): Promise<MirrorWarm<T>> => {
    const startedAt = epoch;
    // @orb-waive caught-failure-ownership(err): the failure is warned (`deps.warn` below) and returned as `{ ok: false, reason }`, which the model-list read reports as `listed: false` and the resolve degrades on; `failed` holds it so a burst shares it.
    // Ends if a caller needs a throw.
    try {
      const readSnapshotFirst = !skipSnapshotOnce;
      skipSnapshotOnce = false;
      const snapshot = readSnapshotFirst && (await readSnapshot(startedAt)) ? get() : null;
      if (snapshot !== null) {
        deps.addSpanEvent?.("cache.warm", { cache: key, outcome: "snapshot" });
        return { ok: true, value: snapshot };
      }
      const value = await fetch();
      if (epoch !== startedAt) {
        return { ok: true, value };
      }
      const at = deps.now();
      seed(value, at);
      await deps.snapshotStore.write(key, JSON.stringify({ fetchedAt: at, value }));
      if (epoch !== startedAt) {
        // Invalidated while the write was in flight: the invalidation's snapshot delete may have run first, so
        // this write would outlive it and a later failed fetch would serve it. Take our own write back.
        await deps.snapshotStore.deletePrefix(key);
        return { ok: true, value };
      }
      deps.addSpanEvent?.("cache.warm", { cache: key, outcome: "fetch" });
      return { ok: true, value };
    } catch (err) {
      deps.addSpanEvent?.("cache.warm", { cache: key, outcome: "failed" });
      deps.warn({ cache: key, err }, "inference: catalog cold-warm failed — capability degrades to the marked-estimated fallback");
      const warm: MirrorWarm<T> = { ok: false, reason: scrubbedReason(err, secrets) };
      if (epoch === startedAt) {
        failed = { at: deps.now(), warm };
      }
      return warm;
    }
  };

  const amend = async (update: (value: T) => T): Promise<void> => {
    const held = cache;
    if (held === null || get() === null) {
      return;
    }
    const startedAt = epoch;
    const value = update(held.value);
    seed(value, held.at);
    await deps.snapshotStore.write(key, JSON.stringify({ fetchedAt: held.at, value }));
    if (epoch !== startedAt) {
      await deps.snapshotStore.deletePrefix(key);
    }
  };

  const hydrate = async (): Promise<T | null> => {
    // An invalidated mirror's next warm skips the snapshot, so its facts are not held until that warm fetches.
    if (get() !== null || skipSnapshotOnce) {
      return get();
    }
    return (await readSnapshot(epoch)) ? get() : null;
  };

  return {
    get,
    hydrate,
    seed,
    amend,
    invalidate: (): void => {
      cache = null;
      failed = null;
      skipSnapshotOnce = true;
      epoch += 1;
      // The next warm must fetch under the new epoch, not coalesce onto a warm that will not publish.
      inFlight = null;
    },
    warm: async (fetch, secrets): Promise<MirrorWarm<T>> => {
      const hit = get();
      if (hit !== null) {
        deps.addSpanEvent?.("cache.hit", { cache: key });
        return { ok: true, value: hit };
      }
      if (failed !== null && deps.now() - failed.at < FAILED_WARM_HOLD_MS) {
        deps.addSpanEvent?.("cache.warm.held-failure", { cache: key });
        return failed.warm;
      }
      deps.addSpanEvent?.("cache.miss", { cache: key });
      if (inFlight !== null) {
        deps.addSpanEvent?.("cache.warm.coalesced", { cache: key });
        return await inFlight;
      }
      const run: Promise<MirrorWarm<T>> = warmOnce(fetch, secrets).finally(() => {
        if (inFlight === run) {
          inFlight = null;
        }
      });
      inFlight = run;
      return await run;
    },
  };
}

export type { Mirror, MirrorDeps } from "../contract/catalog.ts";
