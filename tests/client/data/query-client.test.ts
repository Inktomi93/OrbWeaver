// `createAppQueryClient` (data/query-client.ts header): pins the two things that make the SSE-bus
// cache model correct and are NOT library defaults — `staleTime: Infinity` (never `'static'`, which
// would silently swallow every `invalidateQueries()` the bus/mutation seams issue) and
// `refetchOnReconnect: true` (the SSE-gap catch-up) — plus the bespoke global-error→toast wiring
// (QueryCache/MutationCache `onError` reading `meta.errorToast`, routed through the injectable
// `notify` seam). A config-drift regression here (someone flips `staleTime` to `'static'`, or the
// toast wiring silently stops firing) breaks every read/write in the app; this is the "load-bearing
// invariant" test class (Spine-Testing §6), not a tautology over a constructor call.

import { createAppQueryClient, retryUnlessBadRequest } from "@orb/client/data";
import type { Notify, NotifyInput } from "@orb/client/lib";
import { bindNotify, toNotice } from "@orb/client/lib";
import { MutationObserver, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, vi } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

/** A spy Notify bound via the real `bindNotify` composition seam — never `vi.mock()` of the module. */
function spyNotify(): Notify & { readonly errorCalls: string[] } {
  const errorCalls: string[] = [];
  const notify: Notify & { readonly errorCalls: string[] } = {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    // A notice is `string | NotifyNotice`; the D54 errorToast channel passes a bare string, and `toNotice`
    // is the seam's own normalizer, so the spy records the same TITLE the toast would print.
    error: vi.fn((notice: NotifyInput) => {
      errorCalls.push(toNotice(notice).title);
    }),
    errorCalls,
  };
  bindNotify(notify);
  return notify;
}

afterEach(() => {
  // Restore the console fallback so a later suite doesn't inherit this file's spy.
  bindNotify({
    error: (n) => console.error(toNotice(n).title),
    info: (n) => console.info(toNotice(n).title),
    success: (n) => console.info(toNotice(n).title),
    warn: (n) => console.warn(toNotice(n).title),
  });
});

describe("createAppQueryClient — pinned defaults", () => {
  test("query defaults: Infinity staleTime (never 'static'), the SSE-reconnect refetch, retryUnlessBadRequest", () => {
    const client = createAppQueryClient();
    const defaults = client.getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(Number.POSITIVE_INFINITY);
    expect(defaults.queries?.gcTime).toBe(300_000);
    expect(defaults.queries?.retry).toBe(retryUnlessBadRequest);
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

describe("createAppQueryClient — imperative query freshness", () => {
  test("a cold read fills the cache, Infinity reuses it, and invalidation or staleTime zero re-reads", async () => {
    const client = createAppQueryClient();
    const queryKey = ["__query_client_test__", "freshness"];
    let reads = 0;
    const options = { queryKey, queryFn: () => Promise.resolve(++reads) };

    expect(await client.query(options)).toBe(1);
    expect(await client.query(options)).toBe(1);
    expect(reads).toBe(1);

    await client.invalidateQueries({ queryKey, refetchType: "none" });
    expect(await client.query(options)).toBe(2);
    expect(await client.query({ ...options, staleTime: 0 })).toBe(3);
    expect(await client.query({ ...options, staleTime: 0 })).toBe(4);
    expect(reads).toBe(4);
    client.clear();
  });
});

describe("createAppQueryClient — global error → toast wiring", () => {
  test("a failed query with meta.errorToast routes the message through notify.error", async () => {
    const notify = spyNotify();
    const client = createAppQueryClient();

    await client
      .query({
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
      .query({
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
      .query({
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

describe("createAppQueryClient — default retry", () => {
  async function callsUntilSettled(error: unknown): Promise<number> {
    const client = createAppQueryClient();
    let calls = 0;
    await client
      .query({
        queryKey: ["__query_client_test__", "default-retry"],
        queryFn: () => {
          calls += 1;
          return Promise.reject(error);
        },
        retryDelay: 0,
      })
      .catch(() => undefined);
    return calls;
  }

  test("the DEFAULT client does not retry a BAD_REQUEST", async () => {
    expect(await callsUntilSettled({ message: "no connection is bound", data: { code: "BAD_REQUEST" } })).toBe(1);
  });

  test("the DEFAULT client retries other errors on the default schedule", async () => {
    expect(await callsUntilSettled({ message: "boom", data: { code: "INTERNAL_SERVER_ERROR" } })).toBe(3);
    expect(await callsUntilSettled(new Error("socket dropped"))).toBe(3);
  });
});

describe("retryUnlessBadRequest", () => {
  async function callsUntilSettled(error: unknown): Promise<number> {
    const client = createAppQueryClient();
    let calls = 0;
    await client
      .query({
        queryKey: ["__query_client_test__", "retry"],
        queryFn: () => {
          calls += 1;
          return Promise.reject(error);
        },
        retry: retryUnlessBadRequest,
        retryDelay: 0,
      })
      .catch(() => undefined);
    return calls;
  }

  test("a BAD_REQUEST is asked once: the server refused the input, so a retry gets the same refusal", async () => {
    expect(await callsUntilSettled({ message: "no connection is bound", data: { code: "BAD_REQUEST" } })).toBe(1);
  });

  test("any other failure keeps the default schedule: the first call plus two retries", async () => {
    expect(await callsUntilSettled({ message: "boom", data: { code: "INTERNAL_SERVER_ERROR" } })).toBe(3);
    expect(await callsUntilSettled(new Error("socket dropped"))).toBe(3);
  });
});

describe("createAppQueryClient — observer retry error ownership", () => {
  test("default refetch resolves with the failed query state and surfaces its error only once", async () => {
    const notify = spyNotify();
    const client = createAppQueryClient();
    const error = new Error("retry failed");
    const queryKey = ["__query_client_test__", "observer-default-retry"];
    const observer = new QueryObserver(client, {
      queryKey,
      queryFn: () => Promise.reject(error),
      retry: false,
      meta: { errorToast: "query retry failed" },
    });
    try {
      const result = await observer.refetch();
      expect(result.status).toBe("error");
      expect(result.error).toBe(error);
      expect(client.getQueryState(queryKey)?.error).toBe(error);
      expect(notify.errorCalls).toEqual(["query retry failed"]);
    } finally {
      observer.destroy();
      client.clear();
    }
  });

  test("an explicit throwing refetch rejects but still keeps the canonical query error state", async () => {
    const notify = spyNotify();
    const client = createAppQueryClient();
    const error = new Error("throwing retry failed");
    const queryKey = ["__query_client_test__", "observer-throwing-retry"];
    const observer = new QueryObserver(client, {
      queryKey,
      queryFn: () => Promise.reject(error),
      retry: false,
      meta: { errorToast: "query retry failed" },
    });
    try {
      await expect(observer.refetch({ throwOnError: true })).rejects.toBe(error);
      expect(client.getQueryState(queryKey)?.status).toBe("error");
      expect(client.getQueryState(queryKey)?.error).toBe(error);
      expect(notify.errorCalls).toEqual(["query retry failed"]);
    } finally {
      observer.destroy();
      client.clear();
    }
  });
});
