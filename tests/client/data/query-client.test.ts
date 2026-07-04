// `createAppQueryClient` (data/query-client.ts header): pins the two things that make the SSE-bus
// cache model correct and are NOT library defaults — `staleTime: Infinity` (never `'static'`, which
// would silently swallow every `invalidateQueries()` the bus/mutation seams issue) and
// `refetchOnReconnect: true` (the SSE-gap catch-up) — plus the bespoke global-error→toast wiring
// (QueryCache/MutationCache `onError` reading `meta.errorToast`, routed through the injectable
// `notify` seam). A config-drift regression here (someone flips `staleTime` to `'static'`, or the
// toast wiring silently stops firing) breaks every read/write in the app; this is the "load-bearing
// invariant" test class (Spine-Testing §6), not a tautology over a constructor call.

import { createAppQueryClient } from "@orb/client/data";
import type { Notify } from "@orb/client/lib";
import { bindNotify } from "@orb/client/lib";
import { MutationObserver } from "@tanstack/react-query";
import { afterEach, describe, vi } from "vitest";
import { expect, test } from "../../support/fixtures";

/** A spy Notify bound via the real `bindNotify` composition seam — never `vi.mock()` of the module. */
function spyNotify(): Notify & { readonly errorCalls: string[] } {
  const errorCalls: string[] = [];
  const notify: Notify & { readonly errorCalls: string[] } = {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn((message: string) => {
      errorCalls.push(message);
    }),
    errorCalls,
  };
  bindNotify(notify);
  return notify;
}

afterEach(() => {
  // Restore the console fallback so a later suite doesn't inherit this file's spy.
  bindNotify({
    info: (m) => console.info(m),
    success: (m) => console.info(m),
    error: (m) => console.error(m),
  });
});

describe("createAppQueryClient — pinned defaults", () => {
  test("query defaults: Infinity staleTime (never 'static'), the SSE-reconnect refetch, 2 retries", () => {
    const client = createAppQueryClient();
    const defaults = client.getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(Number.POSITIVE_INFINITY);
    expect(defaults.queries?.gcTime).toBe(300_000);
    expect(defaults.queries?.retry).toBe(2);
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false);
    expect(defaults.queries?.refetchOnReconnect).toBe(true);
    expect(defaults.queries?.refetchOnMount).toBe(true);
    expect(defaults.queries?.networkMode).toBe("online");
    expect(defaults.queries?.structuralSharing).toBe(true);
    expect(defaults.queries?.throwOnError).toBe(false);
  });

  test("mutation defaults: never auto-retry a write", () => {
    const client = createAppQueryClient();
    const defaults = client.getDefaultOptions();
    expect(defaults.mutations?.retry).toBe(0);
    expect(defaults.mutations?.networkMode).toBe("online");
  });
});

describe("createAppQueryClient — global error → toast wiring", () => {
  test("a failed query with meta.errorToast routes the message through notify.error", async () => {
    const notify = spyNotify();
    const client = createAppQueryClient();

    await client
      .fetchQuery({
        queryKey: ["__query_client_test__", "boom"],
        queryFn: () => Promise.reject(new Error("query boom")),
        retry: false,
        meta: { errorToast: "query failed" },
      })
      .catch(() => undefined);

    expect(notify.errorCalls).toEqual(["query failed"]);
  });

  test("errorToast as a function derives the toast message from the thrown error", async () => {
    const notify = spyNotify();
    const client = createAppQueryClient();

    await client
      .fetchQuery({
        queryKey: ["__query_client_test__", "derived"],
        queryFn: () => Promise.reject(new Error("derived boom")),
        retry: false,
        meta: { errorToast: (error: unknown) => `derived: ${(error as Error).message}` },
      })
      .catch(() => undefined);

    expect(notify.errorCalls).toEqual(["derived: derived boom"]);
  });

  test("a failed query with NO errorToast meta fails silently to state (no toast)", async () => {
    const notify = spyNotify();
    const client = createAppQueryClient();

    await client
      .fetchQuery({
        queryKey: ["__query_client_test__", "silent"],
        queryFn: () => Promise.reject(new Error("silent boom")),
        retry: false,
      })
      .catch(() => undefined);

    expect(notify.errorCalls).toEqual([]);
  });

  test("a failed mutation with meta.errorToast routes through notify.error (the mutation-cache twin)", async () => {
    const notify = spyNotify();
    const client = createAppQueryClient();

    const observer = new MutationObserver(client, {
      mutationFn: () => Promise.reject(new Error("mutation boom")),
      meta: { errorToast: "mutation failed" },
    });
    await observer.mutate(undefined).catch(() => undefined);

    expect(notify.errorCalls).toEqual(["mutation failed"]);
  });
});
