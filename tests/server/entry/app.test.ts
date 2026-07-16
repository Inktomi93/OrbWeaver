// entry/app — the Hono builder. Pins the HTTP-edge wiring over `app.fetch` + fake deps: healthz reflects
// the injected shutdown/key getters; the auth seam resolves the ONE principal per request (the blob route
// then 401s an anonymous caller); the seam is consulted exactly once per request (no double-resolve). The
// tRPC mount + the multipart routes are exercised by their own slice tests; here we prove the assembly.

import type { Principal } from "@orb/contracts/identity";
import type { EffectiveAppConfig } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import { DomainOperationError, DomainRateLimitError } from "@orb/kit/errors";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AuthSeam, SeamResult } from "@orb/server/entry/auth";
import { getTraceByRequestId, initTracing, recentRequests } from "@orb/server/foundation/observability";
import { classifyDomainError } from "@orb/server/transport/trpc";
import { describe } from "vitest";
import { layer } from "../../../packages/server/src/domain/settings/effective-config/layer.ts";
import type { AppDeps } from "../../../packages/server/src/entry/app.ts";
import { createApp, rateLimitResponseMeta } from "../../../packages/server/src/entry/app.ts";
import { expect, test } from "../../support/fixtures";

/** Build the classifier-mapped `TRPCError` (cause-carrying) that `rateLimitResponseMeta` receives at the
 *  mount — mirrors the real path (`error-mapping.ts` wraps the DomainError as `.cause`). */
function mapped(err: Error): NonNullable<ReturnType<typeof classifyDomainError>> {
  const result = classifyDomainError(err);
  if (result === null) {
    throw new Error("expected the classifier to map this error");
  }
  return result;
}

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
const NOT_FOUND = 404;
const SERVICE_UNAVAILABLE = 503;
const INTERNAL_ERROR = 500;
const TOO_MANY_REQUESTS = 429;

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
 *  typed stubs (the routes that would touch them are covered by their own slice tests). `services` carries
 *  a real `settings.getEffectiveConfig` slice — the auth-meta/join registrars + the tRPC context read it
 *  per request (the env-only floor is the honest default: discreetLogin/localMultiUser both false). */
function deps(overrides: Partial<AppDeps>): AppDeps {
  const stub = {} as never;
  // FABRICATION-OK: the app tests exercise only the settings read; the other 16 domain services are deliberately absent (their routes are covered by slice tests).
  const services = {
    settings: { getEffectiveConfig: (): EffectiveAppConfig => layer({}) },
  } as unknown as AppDeps["services"];
  return {
    now: (): number => FROZEN_NOW,
    db: {} as unknown as Db,
    seam: fakeSeam(null),
    services,
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
    portability: [],
    importWorldInfo: stub,
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
    const app = createApp(deps({ seam: fakeSeam(OWNER), seedUserCharacters: (p): void => void seeded.push(p) }));
    await hit(app, new Request("http://localhost/healthz"));
    expect(seeded).toEqual([OWNER]);
  });

  test("an anonymous request does NOT fire the seed hook (no principal)", async () => {
    const seeded: Principal[] = [];
    const app = createApp(deps({ seam: fakeSeam(null), seedUserCharacters: (p): void => void seeded.push(p) }));
    await hit(app, new Request("http://localhost/healthz"));
    expect(seeded).toHaveLength(0);
  });

  // FINAL-Auth-Modes §7 P0 — the public bootstrap surface is assembled onto the app. Test env runs the
  // default AUTH_MODE (single-user), so /config reports the no-login mode and /me reflects whatever the
  // seam resolved for THIS request (the drift-free same-resolver property: the route reads the
  // middleware-stashed principal, so the "resolves EXACTLY ONCE" pin above covers it too).
  test("GET /api/auth/config → the injected mode + flags (anonymous, pre-tRPC)", async () => {
    const app = createApp(deps({}));
    const res = await hit(app, new Request("http://localhost/api/auth/config"));
    expect(res.status).toBe(OK);
    expect(await res.json()).toEqual({
      mode: "single-user",
      requiresLogin: false,
      localEnabled: false,
      oidcEnabled: false,
      discreetLogin: false,
      defaultHandle: "owner",
      // single-user can never seat a second human (the PD-106 MULTI_HUMAN_CAPABLE map's fixed arm).
      multiHumanCapable: false,
    });
  });

  test("GET /api/auth/me reflects the seam-resolved principal (and anonymous → authenticated:false)", async () => {
    const authed = createApp(deps({ seam: fakeSeam(OWNER) }));
    const meRes = await hit(authed, new Request("http://localhost/api/auth/me"));
    expect(meRes.status).toBe(OK);
    expect(await meRes.json()).toEqual({ authenticated: true, handle: "owner", role: "owner" });

    const anon = createApp(deps({ seam: fakeSeam(null) }));
    const anonRes = await hit(anon, new Request("http://localhost/api/auth/me"));
    expect(await anonRes.json()).toEqual({ authenticated: false, handle: null, role: null });
  });

  // §7 P1 — the /join landing is gated on the multi-human capability (single-user test env → false → the
  // leak-free 404, matching the tRPC belt's unmounted shape).
  test("GET /join/:token → 404 while not multi-human capable (single-user env)", async () => {
    const app = createApp(deps({}));
    const res = await hit(app, new Request("http://localhost/join/some-token"));
    expect(res.status).toBe(NOT_FOUND);
  });

  // PD-118: `observability` is mounted in the chain — every response carries X-Request-Id, and the
  // request ring records the request. A unique injected id (mirroring the middleware's own reuse-from-
  // header test) makes the ring lookup deterministic without touching module-singleton ring state.
  test("PD-118: a response carries X-Request-Id and the request ring records the request", async () => {
    const requestId = "pd-118-app-mount-req-1";
    const app = createApp(deps({}));
    const res = await hit(app, new Request("http://localhost/healthz", { headers: { "X-Request-Id": requestId } }));
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

  // Parity gap #1: the tRPC mount caps JSON bodies at 1 MiB (hono/body-limit belt). An oversized POST to
  // the mount is rejected 413 by the belt BEFORE the handler buffers it (and before auth/routing) — a bare
  // 413, not an observability-flattened 500. A tiny body under the cap sails past the belt (proven by NOT
  // getting a 413 — a malformed sub-cap tRPC call yields the handler's own 4xx, never the belt's 413).
  test("Task 1: an oversized POST to the tRPC mount → 413 (the 1 MiB body cap)", async () => {
    const app = createApp(deps({}));
    const oversized = "x".repeat(1024 * 1024 + 1);
    const res = await hit(
      app,
      new Request("http://localhost/api/trpc/health.check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: oversized,
      }),
    );
    expect(res.status).toBe(413);
  });

  test("Task 1: a sub-cap POST to the tRPC mount is NOT rejected by the body cap (413)", async () => {
    const app = createApp(deps({}));
    const res = await hit(
      app,
      new Request("http://localhost/api/trpc/health.check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: null }),
      }),
    );
    expect(res.status).not.toBe(413);
  });

  // Parity gap #2: the responseMeta hook surfaces the DomainRateLimitError throttle hint on a
  // TOO_MANY_REQUESTS response — Retry-After (seconds, ceil of msBeforeNext) + X-RateLimit-Remaining. The
  // input is the classifier-mapped TRPCError (cause-carrying), exactly what tRPC hands the hook at the mount.
  test("Task 2: responseMeta sets Retry-After (ceil seconds) + X-RateLimit-Remaining from the rate-limit cause", () => {
    const err = mapped(new DomainRateLimitError("slow down", { msBeforeNext: 1500, remainingPoints: 0 }));
    const meta = rateLimitResponseMeta([err]);
    expect(meta.headers).toEqual({ "Retry-After": "2", "X-RateLimit-Remaining": "0" });
  });

  test("Task 2: responseMeta floors Retry-After at 1 second even for a sub-second window", () => {
    const err = mapped(new DomainRateLimitError("slow down", { msBeforeNext: 10, remainingPoints: 3 }));
    const meta = rateLimitResponseMeta([err]);
    expect(meta.headers).toEqual({ "Retry-After": "1", "X-RateLimit-Remaining": "3" });
  });

  test("Task 2: responseMeta ignores non-rate-limit errors (no headers)", () => {
    const err = mapped(new DomainOperationError("bad_input", "nope"));
    expect(rateLimitResponseMeta([err])).toEqual({});
    expect(rateLimitResponseMeta([])).toEqual({});
  });

  // Parity gap #2 (mount wiring): proves `responseMeta: ({errors}) => rateLimitResponseMeta(errors)` is
  // actually wired onto the tRPC mount (not just unit-testable in isolation) — a DomainRateLimitError
  // thrown from the real rate-limit gate, through the real mount, must surface Retry-After +
  // X-RateLimit-Remaining on the real Response.
  test("Task 2: a DomainRateLimitError thrown by the rate-limit gate at the real mount surfaces Retry-After + X-RateLimit-Remaining", async () => {
    const app = createApp(
      deps({
        rateLimit: {
          enforce: (): Promise<void> => Promise.reject(new DomainRateLimitError("slow down", { msBeforeNext: 1500, remainingPoints: 0 })),
        },
      }),
    );
    const res = await hit(app, new Request("http://localhost/api/trpc/health"));
    expect(res.status).toBe(TOO_MANY_REQUESTS);
    expect(res.headers.get("Retry-After")).toBe("2");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
  });
});
