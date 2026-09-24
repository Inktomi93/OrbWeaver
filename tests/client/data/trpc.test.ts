// The mirror for `packages/client/src/data/trpc.ts` (#2103). It exists because the gate exclusion it
// replaces asserted the opposite: `test-presence-client`'s `CLIENT_EXCLUDE_FILES` row said the module's
// two exports were "thin `@trpc/client` constructors with no bespoke logic of their own to unit-test in
// isolation", and the file refutes that in four places — a `splitLink` condition routing subscriptions
// away from the batch branch, a CSRF header attached to every non-subscription request (the server 403s a
// cookie-authed mutation without it, Tier-4 §7.1), a two-armed `loggerLink.enabled` predicate, and a
// `TRPC_URL` default mirroring the server's own mount path.
//
// WHAT THIS PINS IS WHAT WE SEND, NEVER WHAT COMES BACK. Every assertion reads the RECORDED REQUEST from a
// stubbed `fetch`; the stub's response body is deliberately minimal and the client's own promise is allowed
// to reject, because a response-shape assertion here would pin `@trpc/client`'s decoding rather than this
// module's wiring — the "re-assert the library was called" test the exclusion was right to not want.
//
// THE LOGGER ARM IS NOT COVERED, and the reason is environmental rather than a choice: `loggerLink.enabled`
// is `IS_DEV || (op.direction === "down" && op.result instanceof Error)`, and `lib/dev-flag.ts` resolves
// `IS_DEV` from `import.meta.env.DEV`, which is TRUE under vitest by construction. Only the dev arm is
// reachable from a node lane, so pinning the prod arm would need a bundler-mode harness. Its dev-vs-prod
// behaviour is stated in the source header.
import { createTrpcClient } from "@orb/client/data";
import { CSRF_HEADER } from "@orb/contracts/identity";
import type { SocketId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

interface RecordedRequest {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly method: string;
  readonly body: string | null;
}

const recorded: RecordedRequest[] = [];

function urlOf(input: URL | Request): string {
  return input instanceof URL ? input.href : input.url;
}

function headersOf(init: RequestInit | undefined): Record<string, string> {
  const raw = init?.headers ?? {};
  if (raw instanceof Headers) {
    return Object.fromEntries(raw.entries());
  }
  return Array.isArray(raw) ? Object.fromEntries(raw) : { ...(raw as Record<string, string>) };
}

beforeEach(() => {
  recorded.length = 0;
  vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : urlOf(input);
    recorded.push({ url, headers: headersOf(init), method: init?.method ?? "GET", body: typeof init?.body === "string" ? init.body : null });
    return Promise.resolve(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The one request the stubbed fetch recorded. */
function onlyRequest(): RecordedRequest {
  const request = recorded[0];
  expect(recorded, "exactly one request reached the wire").toHaveLength(1);
  if (request === undefined) {
    throw new Error("no request recorded");
  }
  return request;
}

/** Drive one real query and hand back the single request the batch link sent. The client's own promise is
 *  irrelevant here (the stub returns an empty batch, which `@trpc/client` rejects) — the REQUEST is. */
async function requestFor(client: ReturnType<typeof createTrpcClient>): Promise<RecordedRequest> {
  await client.settings.getUserSettings.query().catch(() => undefined);
  const request = recorded[0];
  expect(recorded, "the batch link sent exactly one request").toHaveLength(1);
  if (request === undefined) {
    throw new Error("no request recorded");
  }
  return request;
}

describe("the client's tRPC wiring", () => {
  test("every non-subscription request carries the CSRF header", async () => {
    const request = await requestFor(createTrpcClient("http://localhost/api/trpc"));
    // The server's cookie-auth gate 403s a mutation without it; `SameSite=Lax` plus this header IS the
    // whole CSRF story, so its presence on the wire is the behaviour, not an implementation detail.
    expect(Object.entries(request.headers).find(([name]) => name.toLowerCase() === CSRF_HEADER.toLowerCase())?.[1]).toBe("1");
  });

  test("the default mount path is the server's, and an explicit url overrides it", async () => {
    const fromDefault = await requestFor(createTrpcClient());
    expect(fromDefault.url.startsWith("/api/trpc"), `default url was ${fromDefault.url}`).toBe(true);

    recorded.length = 0;
    const fromOverride = await requestFor(createTrpcClient("http://localhost/custom/trpc"));
    expect(fromOverride.url.startsWith("http://localhost/custom/trpc")).toBe(true);
  });

  test("a subscription is routed AWAY from the batch link by the split condition", () => {
    const client = createTrpcClient("http://localhost/api/trpc");
    // THE DISCRIMINATOR IS THE THROW, NOT THE ABSENCE OF A FETCH — measured BOTH ways 2026-09-12, because
    // "no fetch was recorded" is true in both worlds and would have made this a FENCE rather than a defect
    // proof. `httpBatchLink` REFUSES a subscription synchronously ("Subscriptions are unsupported by
    // `httpLink`") instead of sending one, so with the split condition forced to `false` the stub still
    // sees nothing and only the throw tells the two apart. Planted control, run against the real source
    // both ways: `condition: () => false` → throws, this row reds; unmodified → no throw, no fetch.
    let thrown: unknown;
    try {
      client.stream.connect.subscribe({ socketId: "sock_test" }, {}).unsubscribe();
    } catch (error) {
      thrown = error;
    }
    expect(thrown, "the subscription must reach a subscription-capable link, never the batch link").toBeUndefined();
    expect(recorded, "and the batch link must not see it on the wire either").toEqual([]);
  });

  // Leg T of the easy-sharing plan: a relay that buffers every GET body freezes a GET EventSource, so the
  // subscription branch opens over POST. Red against a native-EventSource link: the stubbed fetch never
  // sees the request at all.
  test("a subscription is a JSON POST with the CSRF header and its input in the body, never the query", async () => {
    const client = createTrpcClient("http://localhost/api/trpc");
    const input = { socketId: castId<SocketId>("sock_leg_t") };
    const subscription = client.stream.connect.subscribe(input, { onError: () => undefined });
    await vi.waitFor(() => expect(recorded).toHaveLength(1));
    subscription.unsubscribe();

    const request = onlyRequest();
    const header = (name: string): string | undefined => Object.entries(request.headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
    expect(request.method).toBe("POST");
    expect(header("content-type")).toBe("application/json");
    expect(header("accept")).toBe("text/event-stream");
    expect(header(CSRF_HEADER)).toBe("1");
    const url = new URL(request.url);
    expect(url.pathname).toBe("/api/trpc/stream.connect");
    expect(url.searchParams.has("input")).toBe(false);
    expect(JSON.parse(request.body ?? "null")).toEqual(input);
  });

  test("CONTROL: a query with input still rides GET with the input in the query string", async () => {
    const client = createTrpcClient("http://localhost/api/trpc");
    await client.settings.getGlobalSetting.query({ key: "leg-t" }).catch(() => undefined);
    const request = onlyRequest();
    expect(request.method).toBe("GET");
    expect(request.body).toBeNull();
    expect(new URL(request.url).searchParams.get("input")).toBe(JSON.stringify({ 0: { key: "leg-t" } }));
  });
});
