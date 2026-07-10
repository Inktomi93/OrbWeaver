// entry/app — the Hono builder. Pins the HTTP-edge wiring over `app.fetch` + fake deps: healthz reflects
// the injected shutdown/key getters; the auth seam resolves the ONE principal per request (the blob route
// then 401s an anonymous caller); the seam is consulted exactly once per request (no double-resolve). The
// tRPC mount + the multipart routes are exercised by their own slice tests; here we prove the assembly.

import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AuthSeam, SeamResult } from "@orb/server/entry/auth";
import {
  getTraceByRequestId,
  initTracing,
  recentRequests,
} from "@orb/server/foundation/observability";
import { describe } from "vitest";
import type { AppDeps } from "../../../packages/server/src/entry/app.ts";
import { createApp } from "../../../packages/server/src/entry/app.ts";
import { expect, test } from "../../support/fixtures";

const FROZEN_NOW = 1_750_000_000_000;

// The auth middleware now reads the raw TCP peer address via `@hono/node-server/conninfo`'s `getConnInfo`,
// which reads `c.env.incoming.socket.*` and THROWS without it. `app.fetch(req)` in a unit test supplies no
// node socket env, so every request would 500 in the middleware before reaching a route. Passing this fake
// conninfo env as `app.fetch`'s second arg mirrors what `@hono/node-server` binds in production (the peer
// then threads into `seam.resolvePrincipal({ peerIp })` — the fakeSeam ignores it).
const PEER_ENV = {
  incoming: { socket: { remoteAddress: "127.0.0.1", remotePort: 54_321, remoteFamily: "IPv4" } },
};

/** Drive the built app with the fake conninfo env (see PEER_ENV). */
function hit(app: ReturnType<typeof createApp>, req: Request): Promise<Response> {
  return Promise.resolve(app.fetch(req, PEER_ENV));
}

const OK = 200;
const UNAUTHORIZED = 401;
const SERVICE_UNAVAILABLE = 503;
const INTERNAL_ERROR = 500;

const OWNER: Principal = {
  userId: castId<UserId>("usr_owner"),
  role: "owner",
  handle: castId<Handle>("owner"),
  externalId: null,
  via: "fallback",
};

/** A fake seam that always resolves the same principal; `onResolve` fires once per resolution (the spy seam
 *  for the "resolve once" pin). */
function fakeSeam(principal: Principal | null, onResolve?: () => void): AuthSeam {
  return {
    resolvePrincipal: (): Promise<SeamResult> => {
      onResolve?.();
      return Promise.resolve({ principal, csrfHeaderPresent: false });
    },
    isAdmin: (): Promise<boolean> => Promise.resolve(false),
  };
}

/** Build `AppDeps` with inert fakes; overrides patch in the per-test seam / getters. The unhit ports are
 *  typed stubs (the routes that would touch them are covered by their own slice tests). */
function deps(overrides: Partial<AppDeps>): AppDeps {
  const stub = {} as never;
  return {
    now: (): number => FROZEN_NOW,
    db: {} as unknown as Db,
    seam: fakeSeam(null),
    services: stub,
    rateLimit: { enforce: (): Promise<void> => Promise.resolve() },
    presence: {
      connect: (): void => {
        // inert: route tests don't exercise the presence ref-count.
      },
      read: (userId) => ({ userId, online: true, lastSeenAt: null }),
    },
    assets: stub,
    cas: stub,
    character: stub,
    exportService: stub,
    sessions: stub,
    isShuttingDown: (): boolean => false,
    credentialsKeyOk: (): boolean => true,
    seedUserCharacters: (): void => {
      // default: inert; the seed-hook test overrides this to record calls.
    },
    ...overrides,
  };
}

describe("createApp", () => {
  test("GET /healthz → 200 ok when live", async () => {
    const app = createApp(deps({}));
    const res = await hit(app, new Request("http://localhost/healthz"));
    expect(res.status).toBe(OK);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  test("GET /healthz → 503 shutting_down when the shutdown getter flips", async () => {
    const app = createApp(deps({ isShuttingDown: (): boolean => true }));
    const res = await hit(app, new Request("http://localhost/healthz"));
    expect(res.status).toBe(SERVICE_UNAVAILABLE);
    expect(await res.json()).toEqual({ status: "shutting_down" });
  });

  test("GET /healthz → 503 credentials_key_mismatch when the key probe failed", async () => {
    const app = createApp(deps({ credentialsKeyOk: (): boolean => false }));
    const res = await hit(app, new Request("http://localhost/healthz"));
    expect(res.status).toBe(SERVICE_UNAVAILABLE);
    expect(await res.json()).toEqual({ status: "credentials_key_mismatch" });
  });

  test("anonymous caller → the blob route 401s (the middleware set principal=null on the context)", async () => {
    const app = createApp(deps({ seam: fakeSeam(null) }));
    const res = await hit(app, new Request(`http://localhost/api/blob/${"a".repeat(64)}`));
    expect(res.status).toBe(UNAUTHORIZED);
  });

  test("the seam resolves the principal EXACTLY ONCE per request", async () => {
    let calls = 0;
    const seam = fakeSeam(OWNER, () => {
      calls += 1;
    });
    const app = createApp(deps({ seam }));
    await hit(app, new Request("http://localhost/healthz"));
    expect(calls).toBe(1);
  });

  test("a resolved principal fires the per-new-user default-card seed hook (PD-32)", async () => {
    const seeded: Principal[] = [];
    const app = createApp(
      deps({ seam: fakeSeam(OWNER), seedUserCharacters: (p): void => void seeded.push(p) }),
    );
    await hit(app, new Request("http://localhost/healthz"));
    expect(seeded).toEqual([OWNER]);
  });

  test("an anonymous request does NOT fire the seed hook (no principal)", async () => {
    const seeded: Principal[] = [];
    const app = createApp(
      deps({ seam: fakeSeam(null), seedUserCharacters: (p): void => void seeded.push(p) }),
    );
    await hit(app, new Request("http://localhost/healthz"));
    expect(seeded).toHaveLength(0);
  });

  // PD-118: `observability` is mounted in the chain — every response carries X-Request-Id, and the
  // request ring records the request. A unique injected id (mirroring the middleware's own reuse-from-
  // header test) makes the ring lookup deterministic without touching module-singleton ring state.
  test("PD-118: a response carries X-Request-Id and the request ring records the request", async () => {
    const requestId = "pd-118-app-mount-req-1";
    const app = createApp(deps({}));
    const res = await hit(
      app,
      new Request("http://localhost/healthz", { headers: { "X-Request-Id": requestId } }),
    );
    expect(res.status).toBe(OK);
    expect(res.headers.get("X-Request-Id")).toBe(requestId);

    const record = recentRequests(500).find((r) => r.id === requestId);
    expect(record).toBeDefined();
    expect(record?.method).toBe("GET");
    expect(record?.path).toBe("/healthz");
    expect(record?.status).toBe(OK);
  });

  // PD-118 (thrown-request gap): a non-tRPC route that THROWS (returns no Response) is caught by Hono's
  // compose at its own dispatch frame — below the `observability` middleware — so the throw never rejects
  // that middleware's `next()`. Without `app.onError(observabilityErrorHandler)` the request-root span
  // would seal as "ok" and the throw would vanish from /api/_debug/traces. This drives the REAL createApp
  // wiring (real middleware order + the wired onError) and pins: the throw still yields a 500 (nothing
  // swallowed) AND the trace ring records the request as status:"error" with the exception event.
  test("PD-118: a thrown non-tRPC handler seals a status:error trace AND still returns 500", async () => {
    initTracing();
    const requestId = "pd-118-thrown-req-1";
    const app = createApp(deps({}));
    // Attach a throwing probe route on the real app (a non-/api/_debug path so the middleware traces it).
    app.get("/api/_probe/throw", () => {
      throw new Error("boom-observed");
    });

    const res = await hit(
      app,
      new Request("http://localhost/api/_probe/throw", {
        headers: { "X-Request-Id": requestId },
      }),
    );

    // (c) the throw is handled — the client sees Hono's default 500 text, unchanged (no error-contract shift).
    expect(res.status).toBe(INTERNAL_ERROR);
    expect(await res.text()).toBe("Internal Server Error");

    // (a) the request-root span landed in the ring marked error (NOT clobbered back to "ok"), carrying the
    // exception event — so /api/_debug/traces surfaces the thrown request instead of a mislabeled "ok".
    const trace = getTraceByRequestId(requestId);
    if (trace === undefined) {
      throw new Error("expected a recorded trace for the thrown request");
    }
    expect(trace.status).toBe("error");
    expect(trace.spans.some((s) => s.events.some((e) => e.name === "exception"))).toBe(true);
  });
});
