// Catalog mirror behavior: persisted snapshot first, in-memory hits, forced refresh after invalidation,
// coalesced cold warms, and best-effort failure without poisoning the next retry.

import { z } from "zod";
import { createMirror } from "../../../packages/inference/src/catalog/mirror.ts";
import { expect, test } from "../../support/fixtures.ts";

const rowsSchema = z.array(z.string());

test("warm prefers a valid snapshot, caches it, and invalidate forces a live refresh", async () => {
  let now = 1000;
  let stored = JSON.stringify({ fetchedAt: 900, value: ["snapshot"] });
  let reads = 0;
  let writes = 0;
  let fetches = 0;
  const events: string[] = [];
  const mirror = createMirror({
    key: "models",
    schema: rowsSchema,
    ttlMs: 500,
    deps: {
      now: () => now,
      snapshotStore: {
        read: () => {
          reads += 1;
          return Promise.resolve(stored);
        },
        write: (_key, value) => {
          writes += 1;
          stored = value;
          return Promise.resolve();
        },
      },
      addSpanEvent: (name, attrs) => events.push(`${name}:${String(attrs?.["outcome"] ?? "")}`),
      warn: () => undefined,
    },
  });
  const fetch = (): Promise<string[]> => {
    fetches += 1;
    return Promise.resolve(["live"]);
  };

  expect(await mirror.warm(fetch)).toEqual(["snapshot"]);
  expect(await mirror.warm(fetch)).toEqual(["snapshot"]);
  expect({ reads, writes, fetches }).toEqual({ reads: 1, writes: 0, fetches: 0 });

  now = 1100;
  mirror.invalidate();
  expect(await mirror.warm(fetch)).toEqual(["live"]);
  expect({ reads, writes, fetches }).toEqual({ reads: 1, writes: 1, fetches: 1 });
  expect(events).toEqual(["cache.miss:", "cache.warm:snapshot", "cache.hit:", "cache.miss:", "cache.warm:fetch"]);
});

test("concurrent cold warms share one fetch, and a failed warm remains retryable", async () => {
  let resolveFetch: ((value: string[]) => void) | undefined;
  let markFetchStarted: (() => void) | undefined;
  const fetchStarted = new Promise<void>((resolve) => {
    markFetchStarted = resolve;
  });
  let fetches = 0;
  const warnings: unknown[] = [];
  const mirror = createMirror({
    key: "models",
    schema: rowsSchema,
    deps: {
      now: () => 5000,
      snapshotStore: { read: () => Promise.resolve(null), write: () => Promise.resolve() },
      warn: (fields) => warnings.push(fields),
    },
  });
  const pending = (): Promise<string[]> => {
    fetches += 1;
    markFetchStarted?.();
    return new Promise((resolve) => {
      resolveFetch = resolve;
    });
  };

  const first = mirror.warm(pending);
  const second = mirror.warm(pending);
  await fetchStarted;
  expect(fetches).toBe(1);
  resolveFetch?.(["shared"]);
  await expect(Promise.all([first, second])).resolves.toEqual([["shared"], ["shared"]]);

  mirror.invalidate();
  expect(await mirror.warm(() => Promise.reject(new Error("offline")))).toBeNull();
  expect(warnings).toHaveLength(1);
  expect(await mirror.warm(() => Promise.resolve(["recovered"]))).toEqual(["recovered"]);
});
