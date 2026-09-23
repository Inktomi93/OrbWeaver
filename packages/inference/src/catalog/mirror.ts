// The catalog MIRROR: an in-memory copy of a persisted snapshot, read synchronously by the resolve path,
// warmed on demand cheapest-first (snapshot → live fetch), single-flighted so a burst of turns shares ONE
// fetch, and BEST-EFFORT by construction — a provider being unreachable never fails a turn; the resolve
// continues on a capability whose window MARKS ITSELF estimated. The TTL is a very-stale sanity CEILING
// (a week — the daily refresh workload has been failing for seven days straight), never a freshness gate:
// capability flags are stable for far longer than a day, and a 1h TTL once expired the mirror long before
// the daily refresh re-warmed it, so a restarted process silently lost every advertised capability.

import { z } from "zod";
import { scrubbedReason } from "../backends/kit/model-listing.ts";
import type { ProviderScrubSet } from "../contract/errors.ts";
import type { MirrorWarm } from "../contract/runtime.ts";
import type { SnapshotStore, SpanAttrs } from "../deps.ts";

const MS_PER_WEEK = 604_800_000;

export interface MirrorDeps {
  readonly now: () => number;
  readonly snapshotStore: SnapshotStore;
  readonly addSpanEvent?: ((name: string, attrs?: SpanAttrs) => void) | undefined;
  readonly warn: (fields: Readonly<Record<string, unknown>>, message: string) => void;
}

export interface Mirror<T> {
  readonly get: () => T | null;
  /** Warm when cold: the snapshot first, then `fetch`; persists a fresh fetch. Returns the mirror's value
   *  after the attempt, or why the live fetch failed, scrubbed of `secrets` (the ones `fetch` dials with).
   *  Never a throw: the resolve path degrades on `ok: false`, and the model-list read reports the reason. A
   *  warm that coalesces onto one in flight shares that warm's answer, reason included. */
  readonly warm: (fetch: () => Promise<T>, secrets: ProviderScrubSet) => Promise<MirrorWarm<T>>;
  readonly seed: (value: T, at: number) => void;
  /** Drop the in-memory copy AND skip the snapshot on the next warm — `catalogs.refresh` (a forced live fetch). */
  readonly invalidate: () => void;
}

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
  let skipSnapshotOnce = false;

  const get = (): T | null => (cache !== null && deps.now() - cache.at < ttl ? cache.value : null);
  const seed = (value: T, at: number): void => {
    cache = { at, value };
  };

  const readSnapshot = async (): Promise<boolean> => {
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
    seed(value.data, parsed.data.fetchedAt);
    return true;
  };

  const warmOnce = async (fetch: () => Promise<T>, secrets: ProviderScrubSet): Promise<MirrorWarm<T>> => {
    try {
      const readSnapshotFirst = !skipSnapshotOnce;
      skipSnapshotOnce = false;
      const snapshot = readSnapshotFirst && (await readSnapshot()) ? get() : null;
      if (snapshot !== null) {
        deps.addSpanEvent?.("cache.warm", { cache: key, outcome: "snapshot" });
        return { ok: true, value: snapshot };
      }
      const value = await fetch();
      const at = deps.now();
      seed(value, at);
      await deps.snapshotStore.write(key, JSON.stringify({ fetchedAt: at, value }));
      deps.addSpanEvent?.("cache.warm", { cache: key, outcome: "fetch" });
      return { ok: true, value };
    } catch (err) {
      deps.addSpanEvent?.("cache.warm", { cache: key, outcome: "failed" });
      deps.warn({ cache: key, err }, "inference: catalog cold-warm failed — capability degrades to the marked-estimated fallback");
      return { ok: false, reason: scrubbedReason(err, secrets) };
    }
  };

  return {
    get,
    seed,
    invalidate: (): void => {
      cache = null;
      skipSnapshotOnce = true;
    },
    warm: async (fetch, secrets): Promise<MirrorWarm<T>> => {
      const hit = get();
      if (hit !== null) {
        deps.addSpanEvent?.("cache.hit", { cache: key });
        return { ok: true, value: hit };
      }
      deps.addSpanEvent?.("cache.miss", { cache: key });
      if (inFlight !== null) {
        deps.addSpanEvent?.("cache.warm.coalesced", { cache: key });
        return await inFlight;
      }
      const run = warmOnce(fetch, secrets).finally(() => {
        inFlight = null;
      });
      inFlight = run;
      return await run;
    },
  };
}
