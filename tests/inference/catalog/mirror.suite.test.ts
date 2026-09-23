// Catalog mirror behavior: persisted snapshot first, in-memory hits, forced refresh after invalidation,
// coalesced cold warms, and best-effort failure without poisoning the next retry.

import { z } from "zod";
import { NO_PROVIDER_SECRETS, resolvedScrubSet } from "../../../packages/inference/src/backends/kit/sanitize.ts";
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

  expect(await mirror.warm(fetch, NO_PROVIDER_SECRETS)).toEqual({ ok: true, value: ["snapshot"] });
  expect(await mirror.warm(fetch, NO_PROVIDER_SECRETS)).toEqual({ ok: true, value: ["snapshot"] });
  expect({ reads, writes, fetches }).toEqual({ reads: 1, writes: 0, fetches: 0 });

  now = 1100;
  mirror.invalidate();
  expect(await mirror.warm(fetch, NO_PROVIDER_SECRETS)).toEqual({ ok: true, value: ["live"] });
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

  const first = mirror.warm(pending, NO_PROVIDER_SECRETS);
  const second = mirror.warm(pending, NO_PROVIDER_SECRETS);
  await fetchStarted;
  expect(fetches).toBe(1);
  resolveFetch?.(["shared"]);
  await expect(Promise.all([first, second])).resolves.toEqual([
    { ok: true, value: ["shared"] },
    { ok: true, value: ["shared"] },
  ]);

  mirror.invalidate();
  const offline = new Error("offline");
  // The failed warm hands back the fetch's OWN reason, so a model-list read can say why instead of listing nothing.
  expect(await mirror.warm(() => Promise.reject(offline), NO_PROVIDER_SECRETS)).toEqual({ ok: false, reason: "offline" });
  expect(mirror.get()).toBeNull();
  expect(warnings).toHaveLength(1);
  expect(await mirror.warm(() => Promise.resolve(["recovered"]), NO_PROVIDER_SECRETS)).toEqual({ ok: true, value: ["recovered"] });
});

// A process-wide mirror coalesces warms from DIFFERENT callers onto one fetch, so a failure reason is shared
// across them. It is scrubbed where the dialing secret is known — by the warm that dialed — so the caller who
// coalesced onto it never receives that secret, even when the provider reflected it into the error.
test("a failed warm's reason is scrubbed of the dialing secret, and a coalesced caller shares that scrubbed reason", async () => {
  const dialingSecret = "sk-owner-a-0123456789abcdef";
  let rejectFetch: ((err: Error) => void) | undefined;
  let markFetchStarted: (() => void) | undefined;
  const fetchStarted = new Promise<void>((resolve) => {
    markFetchStarted = resolve;
  });
  const mirror = createMirror({
    key: "daemon-models",
    schema: rowsSchema,
    deps: { now: () => 5000, snapshotStore: { read: () => Promise.resolve(null), write: () => Promise.resolve() }, warn: () => undefined },
  });
  const pending = (): Promise<string[]> => {
    markFetchStarted?.();
    return new Promise((_resolve, reject) => {
      rejectFetch = reject;
    });
  };

  const dialer = mirror.warm(pending, resolvedScrubSet({ credential: { secret: dialingSecret }, transport: null }));
  const coalesced = mirror.warm(pending, NO_PROVIDER_SECRETS);
  await fetchStarted;
  rejectFetch?.(new Error(`HTTP 401 — token ${dialingSecret} is not authorized`));
  const [first, second] = await Promise.all([dialer, coalesced]);

  expect(second).toEqual(first);
  const reason = first.ok ? null : first.reason;
  expect(reason).toMatch(/HTTP 401/u);
  expect(reason).not.toContain(dialingSecret);
});
