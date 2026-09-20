// The catalog MIRROR: an in-memory copy of a persisted snapshot, read synchronously by the resolve path,
// warmed on demand cheapest-first (snapshot → live fetch), single-flighted so a burst of turns shares ONE
// fetch, and BEST-EFFORT by construction — a provider being unreachable never fails a turn; the resolve
// continues on a capability whose window MARKS ITSELF estimated. The TTL is a very-stale sanity CEILING
// (a week — the daily refresh workload has been failing for seven days straight), never a freshness gate:
// capability flags are stable for far longer than a day, and a 1h TTL once expired the mirror long before
// the daily refresh re-warmed it, so a restarted process silently lost every advertised capability.

import { z } from "zod";
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
   *  after the attempt (`null` when both arms failed — the caller degrades, never throws). */
  readonly warm: (fetch: () => Promise<T>) => Promise<T | null>;
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
  let inFlight: Promise<T | null> | null = null;
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

  const warmOnce = async (fetch: () => Promise<T>): Promise<T | null> => {
    try {
      const readSnapshotFirst = !skipSnapshotOnce;
      skipSnapshotOnce = false;
      if (readSnapshotFirst && (await readSnapshot())) {
        deps.addSpanEvent?.("cache.warm", { cache: key, outcome: "snapshot" });
        return get();
      }
      const value = await fetch();
      const at = deps.now();
      seed(value, at);
      await deps.snapshotStore.write(key, JSON.stringify({ fetchedAt: at, value }));
      deps.addSpanEvent?.("cache.warm", { cache: key, outcome: "fetch" });
      return value;
    } catch (err) {
      deps.addSpanEvent?.("cache.warm", { cache: key, outcome: "failed" });
      deps.warn({ cache: key, err }, "inference: catalog cold-warm failed — capability degrades to the marked-estimated fallback");
      return null;
    }
  };

  return {
    get,
    seed,
    invalidate: (): void => {
      cache = null;
      skipSnapshotOnce = true;
    },
    warm: async (fetch): Promise<T | null> => {
      const hit = get();
      if (hit !== null) {
        deps.addSpanEvent?.("cache.hit", { cache: key });
        return hit;
      }
      deps.addSpanEvent?.("cache.miss", { cache: key });
      if (inFlight !== null) {
        deps.addSpanEvent?.("cache.warm.coalesced", { cache: key });
        return await inFlight;
      }
      const run = warmOnce(fetch).finally(() => {
        inFlight = null;
      });
      inFlight = run;
      return await run;
    },
  };
}
