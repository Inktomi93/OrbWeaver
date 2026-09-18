// entry/app — the Hono builder. Pins the HTTP-edge wiring over `app.fetch` + fake deps: healthz reflects
// the injected shutdown/key getters; the auth seam resolves the ONE principal per request (the blob route
// then 401s an anonymous caller); the seam is consulted exactly once per request (no double-resolve). The
// tRPC mount + the multipart routes are exercised by their own slice tests; here we prove the assembly.

import type { Principal } from "@orb/contracts/identity";
import type { PortableEntity, PortableFile } from "@orb/contracts/portability";
import type { EffectiveAppConfig } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import { DomainOperationError, DomainRateLimitError } from "@orb/kit/errors";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AuthSeam, SeamResult } from "@orb/server/entry/auth";
import { getTraceByRequestId, initTracing, recentRequests } from "@orb/server/foundation/observability";
import { versionIdentity } from "@orb/server/foundation/version";
import { classifyDomainError, createSocketRegistry } from "@orb/server/transport/trpc";
import { describe } from "vitest";
import { layer } from "../../../packages/server/src/domain/settings/effective-config/layer.ts";
import type { AppDeps } from "../../../packages/server/src/entry/app.ts";
import { createApp, rateLimitResponseMeta } from "../../../packages/server/src/entry/app.ts";
import { expect, test } from "../../support/fixtures.ts";

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

// The registry must carry the CHAT descriptor: `POST /api/import/chat` is a thin arm over it and resolves it
// at REGISTRATION, refusing to mount without one (a composition bug has to be loud, not a dead route). This
// slice never drives the import leg, so both halves are inert — the descriptor's presence is the point.
const inertChatPortability: PortableEntity = {
  kind: "chat",
  dir: "chats/",
  ext: ".jsonl",
  async *exportAll(): AsyncIterable<PortableFile> {
    // inert: assembly tests never stream an export.
  },
  importFile: () => Promise.resolve({ ok: false, error: "inert in the app-assembly slice" }),
};

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
const FORBIDDEN = 403;
const UNSUPPORTED_MEDIA_TYPE = 415;
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

/** The same owner reached over a browser session cookie — the arm the pre-existing tRPC CSRF gate keys on. */
const COOKIE_OWNER: Principal = { ...OWNER, via: "cookie" };

/** The CSRF-belt probe: `authedProcedure.mutation` with NO input schema, so a cross-site POST needs no body. */
const PRUNE_URL = "http://localhost/api/trpc/tag.pruneUnusedTags";

/** A fake seam that always resolves the same principal; `onResolve` fires once per resolution (the spy seam
 *  for the "resolve once" pin). */
function fakeSeam(principal: Principal | null, onResolve?: () => void): AuthSeam {
  return {
    resolvePrincipal: (): Promise<SeamResult> => {
      onResolve?.();
      return Promise.resolve({ principal, sessionId: null, csrfHeaderPresent: false });
    },
    debugGateAdmits: (): boolean => false,
  };
}

/** The `services` bag the app-assembly slice drives: a real `settings.getEffectiveConfig` slice (the
 *  auth-meta/join registrars + the tRPC context read it per request; the env-only floor is the honest
 *  default — discreetLogin/localMultiUser both false) plus whatever one test injects. Absent services are
 *  deliberate: a route that reaches one throws loudly instead of a stub answering for a domain this slice
 *  does not own. */
function testServices(extra: Record<string, unknown> = {}): AppDeps["services"] {
  // @orb-waive no-test-fabrication(unknown): the app tests exercise only the settings read plus whatever slice a test injects; the other 16 domain services are deliberately absent (their routes are covered by slice tests). Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  return { settings: { getEffectiveConfig: (): EffectiveAppConfig => layer({}) }, ...extra } as unknown as AppDeps["services"];
}

/** Build `AppDeps` with inert fakes; overrides patch in the per-test seam / getters. The unhit ports are
 *  typed stubs (the routes that would touch them are covered by their own slice tests). */
function deps(overrides: Partial<AppDeps>): AppDeps {
  // @orb-waive no-test-fabrication(never): the unhit-port stub the header above describes — routes that reach it throw loudly. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const stub = {} as never;
  const services = testServices();
  return {
    now: (): number => FROZEN_NOW,
    // @orb-waive no-test-fabrication(unknown): `db` is never touched on this app-assembly slice — routes are covered by slice tests. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    db: {} as unknown as Db,
    oidcProviderName: "your identity provider",
    seam: fakeSeam(null),
    services,
    rateLimit: { enforce: (): Promise<void> => Promise.resolve() },
    presence: {
      connect: (): void => {
        // inert: route tests don't exercise the presence ref-count.
      },
      read: (userId) => ({ userId, online: true, lastSeenAt: null }),
    },
    // The multiplexed-socket cells (SSE-1). Real, frozen-clock instance: the /api/_debug/stream/sockets
    // route reads it, and route tests want the honest "zero live sockets" answer, not a stub's opinion.
    sockets: createSocketRegistry((): number => FROZEN_NOW),
    assets: stub,
    cas: stub,
    character: stub,
    exportService: stub,
    portability: [inertChatPortability],
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
    // every healthz arm carries the build identity (entry/http/healthz.ts) — the same frozen reader the app wires
    expect(await res.json()).toEqual({ status: "ok", harness: false, version: versionIdentity() });
  });

  test("GET /healthz → 503 shutting_down when the shutdown getter flips", async () => {
    const app = createApp(deps({ isShuttingDown: (): boolean => true }));
    const res = await hit(app, new Request("http://localhost/healthz"));
    expect(res.status).toBe(SERVICE_UNAVAILABLE);
    expect(await res.json()).toEqual({ status: "shutting_down", version: versionIdentity() });
  });

  test("GET /healthz → 503 credentials_key_mismatch when the key probe failed", async () => {
    const app = createApp(deps({ credentialsKeyOk: (): boolean => false }));
    const res = await hit(app, new Request("http://localhost/healthz"));
    expect(res.status).toBe(SERVICE_UNAVAILABLE);
    expect(await res.json()).toEqual({ status: "credentials_key_mismatch", version: versionIdentity() });
  });

  test("anonymous caller → the blob route 401s (the middleware set principal=null on the context)", async () => {
    const app = createApp(deps({ seam: fakeSeam(null) }));
    const res = await hit(app, new Request(`http://localhost/api/blob/${"a".repeat(64)}`));
    expect(res.status).toBe(UNAUTHORIZED);
  });

  // PROD-LEAK (live incident 2026-08-09): the public box was served by a DEV process, so tRPC's `isDev`
  // (= NODE_ENV !== "production", resolved once at initTRPC.create) was true and `getErrorShape` attached
  // `data.stack` — absolute host paths, the OS username, exact dep versions — to EVERY error, for ANY
  // anonymous caller. The `trpc.ts` errorFormatter now strips it unconditionally. THIS is the wire proof:
  // the mounted app, an anonymous request, the bytes that actually leave the process. The vitest run is
  // itself the leaking regime (NODE_ENV=test ⇒ isDev true — asserted as a CONTROL in
  // tests/server/transport/trpc/trpc.test.ts), so a green here is the belt, not the env.
  test("anonymous GET /api/trpc/* → 401 whose error body carries NO `stack` (PROD-LEAK belt)", async () => {
    const app = createApp(deps({ seam: fakeSeam(null) }));
    const res = await hit(app, new Request("http://localhost/api/trpc/persona.list"));
    expect(res.status).toBe(UNAUTHORIZED);
    const body = (await res.json()) as { readonly error: { readonly data: Record<string, unknown> } };
    expect(body.error.data["code"]).toBe("UNAUTHORIZED");
    expect(Object.keys(body.error.data)).not.toContain("stack");
    // The whole serialized envelope, not just the data bag: no host path may appear anywhere in it.
    expect(JSON.stringify(body)).not.toContain("/packages/server/src/");
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
      // A8 — the human-facing IdP name (env default here; single-user never shows a login button, but the
      // field is served in every mode so the client reads one source).
      oidcProviderName: "your identity provider",
      // B4 — single-user is never a local-first-run box (no owner-password to set); served false.
      localFirstRun: false,
      discreetLogin: false,
      defaultHandle: "owner",
      // single-user can never seat a second human (the PD-106 MULTI_HUMAN_CAPABLE map's fixed arm).
      multiHumanCapable: false,
      // The deployment external-media ceiling (born-in-DB floor = blocked) — the same live read the CSP uses.
      forbidExternalMedia: true,
      // The deployment HTML-trust default (born-in-DB floor = untrusted) — the render-policy floor's other axis.
      trustHtml: false,
      // The interactive-card deployment ceiling (#111 leg 3; born-in-DB floor = OFF) — the precondition the
      // per-character Interactive rung is AND-gated against before card scripts can run.
      allowInteractiveCards: false,
      // The served deployment byte caps (L5 uploads catalog): route caps + the effective image ceiling.
      uploads: { assetUpload: 67_108_864, image: 5_000_000, databankUpload: 20_971_520, importTotal: 268_435_456 },
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

  // The request-user binding through the REAL middleware order: the auth middleware resolves the Principal
  // onto the Hono context, then `observability` (mounted after it) reads that principal and calls
  // `bindRequestUser` inside the request scope. Proves the caller's userId reaches the request-ring record
  // end-to-end (not just in the middleware's isolated mock) — the "documented-as-wired" claim made true.
  test("an authenticated request stamps the resolved userId on the request-ring record", async () => {
    const requestId = "app-bound-user-req-1";
    const app = createApp(deps({ seam: fakeSeam(OWNER) }));
    await hit(app, new Request("http://localhost/healthz", { headers: { "X-Request-Id": requestId } }));
    const record = recentRequests(500).find((r) => r.id === requestId);
    expect(record?.userId).toBe(OWNER.userId);
  });

  test("an anonymous request records no userId on the request-ring record", async () => {
    const requestId = "app-anon-user-req-1";
    const app = createApp(deps({ seam: fakeSeam(null) }));
    await hit(app, new Request("http://localhost/healthz", { headers: { "X-Request-Id": requestId } }));
    const record = recentRequests(500).find((r) => r.id === requestId);
    expect(record?.userId).toBeUndefined();
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

  // #1479 — AUTH-INFRASTRUCTURE FAULTS ARE OBSERVABLE. The principal-resolution middleware is mounted ABOVE
  // `observability` on purpose (it must resolve the Principal the middleware binds, without widening the
  // request span to include auth's own latency — `app.ts`'s note), and Hono's compose catches a throw at ITS
  // OWN dispatch frame, so no outer `next()` can see it. That left a throwing `resolvePrincipal` — a db
  // outage, a JWKS fault, exactly the class worth seeing — invisible to /api/_debug/requests and /traces.
  // `app.onError` is the one place that can observe it, and it now does when the scope was never opened.
  test("#1479: a throw in the AUTH middleware (above observability) lands in the request ring + trace, and still 500s", async () => {
    initTracing();
    const requestId = "auth-fault-req-1";
    const throwingSeam: AuthSeam = {
      resolvePrincipal: (): Promise<SeamResult> => Promise.reject(new Error("boom-auth-infra")),
      debugGateAdmits: (): boolean => false,
    };
    const app = createApp(deps({ seam: throwingSeam }));

    const res = await hit(app, new Request("http://localhost/healthz", { headers: { "X-Request-Id": requestId } }));

    // The client contract is unchanged — the same 500 Hono's default onError returns.
    expect(res.status).toBe(INTERNAL_ERROR);
    expect(await res.text()).toBe("Internal Server Error");
    // …and the caller now gets a correlation handle for /api/_debug/logs?requestId=… on THIS failure.
    expect(res.headers.get("X-Request-Id")).toBe(requestId);

    const records = recentRequests(500).filter((r) => r.id === requestId);
    expect(records).toHaveLength(1); // exactly one — the observed arm must not also record it
    expect(records[0]?.status).toBe(INTERNAL_ERROR);
    expect(records[0]?.path).toBe("/healthz");
    expect(records[0]?.method).toBe("GET");
    // Auth never resolved, so there is no caller to attribute the request to.
    expect(records[0]?.userId).toBeUndefined();

    const trace = getTraceByRequestId(requestId);
    expect(trace?.status).toBe("error");
  });

  // The ring is a REQUEST INDEX, and `/join/<token>` carries a bearer capability in its path. The observed
  // path has redacted it since the ring existed; the auth-fault path must not be the hole that writes the
  // raw token into a 500-entry ring the debug surface serves.
  test("#1479: an auth fault on /join/<token> records the REDACTED path — the capability never enters the ring", async () => {
    initTracing();
    const requestId = "auth-fault-join-1";
    const secret = "jointoken-must-not-be-recorded";
    const throwingSeam: AuthSeam = {
      resolvePrincipal: (): Promise<SeamResult> => Promise.reject(new Error("boom-auth-infra")),
      debugGateAdmits: (): boolean => false,
    };
    const app = createApp(deps({ seam: throwingSeam }));

    await hit(app, new Request(`http://localhost/join/${secret}`, { headers: { "X-Request-Id": requestId } }));

    const record = recentRequests(500).find((r) => r.id === requestId);
    expect(record?.path).toBe("/join/:token");
    expect(JSON.stringify(recentRequests(500))).not.toContain(secret);
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

// #300 leg 5 / spine invariant #9 — THE tRPC CONTENT-TYPE BELT.
//
// The hole this closes, proven through the REAL mount before the belt existed: `@trpc/server` 11.18's
// `getContentTypeHandler` matches `application/json` AND `multipart/form-data` AND
// `application/octet-stream`, and dispatches the latter two as `type:"mutation"`. `multipart/form-data` is
// a CORS-SIMPLE content-type — an ordinary cross-site `<form>` POST needs no preflight and no CORS grant —
// so the tRPC auth gate's `via === "cookie"` keying (which deliberately exempts the loopback owner
// `fallback` arm so the un-cookied dev tooling keeps working) left every input-less destructive mutation
// drivable from any page loaded in the box's own browser wherever `AUTH_FALLBACK=owner` is live: every
// `single-user` deployment, every dev stack, any break-glass session. `tag.pruneUnusedTags` is the probe
// because it is `authedProcedure.mutation` with NO input schema — the attacker needs to send no body at all.
//
// These pins drive the assembled app end to end (real middleware order, real `appRouter`, real tRPC
// handler); the spy service records whether the RESOLVER ran, which is the only fact that distinguishes
// "refused" from "refused after doing the damage".
describe("createApp: the tRPC mount refuses a non-JSON mutation (CSRF content-type belt)", () => {
  /** An app whose ONLY live domain service is a `tag` spy: `pruneUnusedTags` (the destructive input-less
   *  mutation) and `listTags` (the GET-query control) both record their executions. */
  function spyApp(principal: Principal): { readonly app: ReturnType<typeof createApp>; readonly calls: readonly string[] } {
    const calls: string[] = [];
    const tag = {
      pruneUnusedTags: (): Promise<{ removed: number }> => {
        calls.push("pruneUnusedTags");
        return Promise.resolve({ removed: 3 });
      },
      listTags: (): Promise<readonly never[]> => {
        calls.push("listTags");
        return Promise.resolve([]);
      },
    };
    return { app: createApp(deps({ seam: fakeSeam(principal), services: testServices({ tag }) })), calls };
  }

  test("multipart/form-data POST on the loopback-owner (via:fallback) arm with NO CSRF header → 415, resolver NEVER runs", async () => {
    const { app, calls } = spyApp(OWNER);
    const form = new FormData();
    form.set("csrf", "not-needed-for-a-simple-request");
    const res = await hit(app, new Request(PRUNE_URL, { method: "POST", body: form }));
    // The resolver assertion leads deliberately: it is the fact that separates "refused" from "refused
    // after the tags were already deleted". Pre-belt this read `["pruneUnusedTags"]` with a 200 status.
    expect(calls).toEqual([]);
    expect(res.status).toBe(UNSUPPORTED_MEDIA_TYPE);
  });

  test("application/octet-stream POST on the via:fallback arm → 415, resolver NEVER runs", async () => {
    const { app, calls } = spyApp(OWNER);
    const res = await hit(app, new Request(PRUNE_URL, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: "x" }));
    expect(calls).toEqual([]);
    expect(res.status).toBe(UNSUPPORTED_MEDIA_TYPE);
  });

  // The belt must not be stricter than tRPC's own JSON matcher, which is a media-type PREFIX test — a
  // `charset` parameter is legal on the wire and a strict string equality would have refused it.
  test("CONTROL: application/json on the via:fallback arm still runs — the un-cookied loopback dev tooling", async () => {
    const { app, calls } = spyApp(OWNER);
    const res = await hit(app, new Request(PRUNE_URL, { method: "POST", headers: { "content-type": "application/json" }, body: "null" }));
    expect(res.status).toBe(OK);
    expect(calls).toEqual(["pruneUnusedTags"]);
  });

  test("CONTROL: `application/json; charset=utf-8` still runs — the belt matches the media type, not the whole header", async () => {
    const { app, calls } = spyApp(OWNER);
    const res = await hit(app, new Request(PRUNE_URL, { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: "null" }));
    expect(res.status).toBe(OK);
    expect(calls).toEqual(["pruneUnusedTags"]);
  });

  // The pre-existing gate keeps keying where it always keyed: a cookie-authenticated mutation without the
  // custom header is 403, header present is 200. The belt is additive, not a replacement.
  test("CONTROL: the cookie-arm CSRF gate still fires (JSON mutation, no x-orb-csrf → 403)", async () => {
    const { app, calls } = spyApp(COOKIE_OWNER);
    const res = await hit(app, new Request(PRUNE_URL, { method: "POST", headers: { "content-type": "application/json" }, body: "null" }));
    expect(res.status).toBe(FORBIDDEN);
    expect(calls).toEqual([]);
  });

  test("CONTROL: the cookie arm WITH x-orb-csrf still runs (the real client's batched write path)", async () => {
    const { app, calls } = spyApp(COOKIE_OWNER);
    const res = await hit(
      app,
      new Request(`${PRUNE_URL}?batch=1`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-orb-csrf": "1" },
        body: JSON.stringify({ 0: null }),
      }),
    );
    expect(res.status).toBe(OK);
    expect(calls).toEqual(["pruneUnusedTags"]);
  });

  // GET carries no content-type at all and tRPC's method map allows GET for queries/subscriptions ONLY —
  // so scoping the belt to POST is complete for mutations and inert for reads.
  test("CONTROL: a GET query is untouched by the belt (no content-type on the request)", async () => {
    const { app, calls } = spyApp(OWNER);
    const res = await hit(app, new Request("http://localhost/api/trpc/tag.listTags"));
    expect(res.status).toBe(OK);
    expect(calls).toEqual(["listTags"]);
  });
});

// Spine invariant #9's OTHER half — the unenforced negative the content-type belt above rests on. That
// belt leaves tRPC's CSRF gate keyed on `via === "cookie"`, which is safe only because `application/json`
// is not a CORS-simple content-type — and that only protects while this app answers no preflight. Mounting
// `cors()` with credentials for some future integration would grant the preflight, and every
// `AUTH_FALLBACK=owner` box (single-user deployments, dev stacks, break-glass sessions) is back to
// cross-site owner mutations. The spine states the absence "so it can be re-checked"; these pins re-check
// it mechanically, against the ASSEMBLED app, on both request shapes a browser uses to ask for a grant.
describe("createApp: the assembled app grants no CORS (spine invariant #9)", () => {
  const foreignOrigin = "https://cross-site.example";

  /** The `Access-Control-Allow-*` headers on a response — the grant a browser requires before it will send
   *  a preflighted cross-site request at all, or hand a cross-site page a response body. */
  function corsGrantHeaders(res: Response): readonly string[] {
    return Array.from(res.headers.keys()).filter((name) => name.toLowerCase().startsWith("access-control-allow-"));
  }

  test("a cross-origin preflight (OPTIONS) on the tRPC mount is answered with NO Access-Control-Allow-* header", async () => {
    const app = createApp(deps({ seam: fakeSeam(OWNER) }));
    const res = await hit(
      app,
      new Request(PRUNE_URL, {
        method: "OPTIONS",
        headers: {
          origin: foreignOrigin,
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type",
        },
      }),
    );
    // Non-vacuity: the assembled chain really produced this response (its own security headers are on it),
    // so an empty grant list is "the app answered and granted nothing", not "nothing answered". A security
    // header is the anchor rather than the X-Request-Id stamp because both now ride the same post-`next()`
    // mechanism (#480), and this pin is about the CORS grant — its own describe block owns the stamp.
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(corsGrantHeaders(res)).toEqual([]);
  });

  test("a cross-origin GET on the tRPC mount answers 200 with NO Access-Control-Allow-* header", async () => {
    const app = createApp(deps({ seam: fakeSeam(OWNER) }));
    const res = await hit(app, new Request("http://localhost/api/trpc/health", { headers: { origin: foreignOrigin } }));
    // A real served payload: the response a cross-site page would want to read, and cannot without a grant.
    expect(res.status).toBe(OK);
    expect(corsGrantHeaders(res)).toEqual([]);
  });
});

// #480 — X-Request-Id exists so a caller can correlate ANY response with /api/_debug/logs?requestId=… and
// /api/_debug/traces/:requestId, and this app's primary API surface is the tRPC mount. tRPC's
// `fetchRequestHandler` returns its OWN Response object, which REPLACES whatever the Hono context held — so a
// stamp written before `next()` reaches only the responses Hono builds from the context (the belt refusals,
// the onError 500) and is silently absent on every tRPC 200 and every tRPC error. These pins drive the REAL
// assembled mount and cover both response FACTORIES: tRPC's own (200 / error) and Hono's (415 / 500).
describe("createApp: every response carries X-Request-Id (#480)", () => {
  test("a tRPC 200 carries X-Request-Id — and it is the SAME id observability recorded", async () => {
    const requestId = "req-480-trpc-ok-1";
    const app = createApp(deps({ seam: fakeSeam(OWNER) }));
    const res = await hit(app, new Request("http://localhost/api/trpc/health", { headers: { "X-Request-Id": requestId } }));
    expect(res.status).toBe(OK);
    expect(res.headers.get("X-Request-Id")).toBe(requestId);
    // The stamp must be the id the CAPTURE side recorded, not a second mint — a header that correlates to
    // nothing is worse than no header, because the operator's lookup returns an honest-looking empty.
    expect(recentRequests(500).some((r) => r.id === requestId)).toBe(true);
  });

  test("a tRPC ERROR response carries X-Request-Id (the correlation handle when it matters most)", async () => {
    const requestId = "req-480-trpc-err-1";
    const app = createApp(
      deps({
        seam: fakeSeam(OWNER),
        rateLimit: { enforce: (): Promise<void> => Promise.reject(new DomainRateLimitError("slow down", { msBeforeNext: 1500 })) },
      }),
    );
    const res = await hit(app, new Request("http://localhost/api/trpc/health", { headers: { "X-Request-Id": requestId } }));
    expect(res.status).toBe(TOO_MANY_REQUESTS);
    expect(res.headers.get("X-Request-Id")).toBe(requestId);
  });

  test("a tRPC 404 (unknown procedure) carries X-Request-Id", async () => {
    const requestId = "req-480-trpc-404-1";
    const app = createApp(deps({ seam: fakeSeam(OWNER) }));
    const res = await hit(app, new Request("http://localhost/api/trpc/nope.notAProcedure", { headers: { "X-Request-Id": requestId } }));
    expect(res.status).toBe(NOT_FOUND);
    expect(res.headers.get("X-Request-Id")).toBe(requestId);
  });

  // The two responses Hono itself builds from the context. Both already carried the stamp before #480 (the
  // pre-`next()` `c.header` reached exactly these), so they are FENCES, not defect proofs — and they are
  // what licensed DELETING that pre-`next()` set rather than keeping it as a belt: Hono's `compose` catches
  // a thrown handler at ITS OWN dispatch frame and runs `onError` there, so `next()` resolves normally and
  // the post-`next()` stamp still lands on the 500. Measured, not assumed (planted control: with the
  // pre-`next()` line deleted both of these stay green). The non-Error throw that used to escape `app.fetch`
  // with NO Response at all — uncoverable by a stamp of either kind — is normalised since #1761; the arms
  // that pin its 500 (headers + stamp + ring) are at the end of this file.
  test("FENCE: the content-type belt's own 415 refusal carries X-Request-Id", async () => {
    const requestId = "req-480-belt-415-1";
    const app = createApp(deps({ seam: fakeSeam(OWNER) }));
    const res = await hit(app, new Request(PRUNE_URL, { method: "POST", headers: { "X-Request-Id": requestId, "content-type": "text/plain" }, body: "x" }));
    expect(res.status).toBe(UNSUPPORTED_MEDIA_TYPE);
    expect(res.headers.get("X-Request-Id")).toBe(requestId);
  });

  test("FENCE: the onError 500 (a thrown handler) carries X-Request-Id", async () => {
    const requestId = "req-480-thrown-500-1";
    const app = createApp(deps({ seam: fakeSeam(OWNER) }));
    app.get("/api/_probe/throw-480", () => {
      throw new Error("boom-480");
    });
    const res = await hit(app, new Request("http://localhost/api/_probe/throw-480", { headers: { "X-Request-Id": requestId } }));
    expect(res.status).toBe(INTERNAL_ERROR);
    expect(res.headers.get("X-Request-Id")).toBe(requestId);
  });
});

// #1761 — EVERY THROW REACHES THE POLICY WRITER, on the REAL `createApp` composition. hono's `compose()`
// only routes an `err instanceof Error` to `app.onError`; a non-Error value was rethrown past every
// middleware, so the adapter answered a bare 500 with NO security headers, NO `X-Request-Id`, and nothing
// in the observability ring. `normalizeThrownErrors` is mounted immediately INSIDE `securityHeaders` (the
// order is the fix — normalising ABOVE the header writer would run `onError` at a frame the writer no
// longer encloses), so the 500 is now indistinguishable from the `Error` one.
//
// These arms drive `createApp` rather than a hand-built Hono so they pin the WIRING, not the middleware.
describe("app: a NON-Error throw is a policied 500, not a bare adapter answer (#1761)", () => {
  /** The app-policy floor a browser must see on any 500 — the three headers #1615 found missing. */
  function expectPolicied(res: Response, arm: string): void {
    expect(res.headers.get("content-security-policy"), arm).toContain("default-src 'self'");
    expect(res.headers.get("x-frame-options"), arm).toBe("DENY");
    expect(res.headers.get("x-content-type-options"), arm).toBe("nosniff");
  }

  // A ROUTE throw is the below-`observability` half of the pair: the inner mount converts it under that
  // middleware, so its post-`next()` stamp AND ring record still run. Anything less would be a 500 with the
  // headers but no correlation handle — policied but undiagnosable.
  test("a route handler throwing a bare value → 500 WITH the app security headers, the stamp and a ring entry", async () => {
    initTracing();
    const requestId = "req-1761-nonerror-route-1";
    const app = createApp(deps({ seam: fakeSeam(OWNER) }));
    app.get("/api/_probe/throw-1761", () => {
      // biome-ignore lint/style/useThrowOnlyError: the non-Error throw IS the subject — the rule is what our own code obeys, this arm proves the edge holds when a dependency does not.
      throw "a bare string, not an Error";
    });

    const res = await hit(app, new Request("http://localhost/api/_probe/throw-1761", { headers: { "X-Request-Id": requestId } }));

    expect(res.status).toBe(INTERNAL_ERROR);
    expect(res.headers.get("X-Request-Id")).toBe(requestId);
    expectPolicied(res, "non-Error route throw");
    // The response body is the same fixed text the Error path returns — the thrown value is never echoed.
    expect(await res.text()).not.toContain("a bare string");
    // Parity with the Error path's observables, not just its status.
    const records = recentRequests(500).filter((r) => r.id === requestId);
    expect(records).toHaveLength(1);
    expect(records[0]?.status).toBe(INTERNAL_ERROR);
    expect(getTraceByRequestId(requestId)?.status).toBe("error");
  });

  test("a non-Error AUTH-infrastructure fault is policied AND observable (the #1479 class, widened)", async () => {
    // The auth middleware sits above `observability`, so before #1761 a non-Error rejection there produced
    // no Response, no ring entry and no trace — the exact invisibility #1479 closed for `Error` faults.
    initTracing();
    const requestId = "req-1761-nonerror-auth-1";
    const throwingSeam: AuthSeam = {
      resolvePrincipal: (): Promise<SeamResult> => Promise.reject({ code: "not-an-error-object" }),
      debugGateAdmits: (): boolean => false,
    };
    const app = createApp(deps({ seam: throwingSeam }));

    const res = await hit(app, new Request("http://localhost/healthz", { headers: { "X-Request-Id": requestId } }));

    expect(res.status).toBe(INTERNAL_ERROR);
    expectPolicied(res, "non-Error auth fault");
    const records = recentRequests(500).filter((r) => r.id === requestId);
    expect(records).toHaveLength(1);
    expect(records[0]?.status).toBe(INTERNAL_ERROR);
    expect(getTraceByRequestId(requestId)?.status).toBe("error");
  });
});
