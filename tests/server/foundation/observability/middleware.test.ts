// foundation/observability/middleware — the per-request Hono middleware. Hono is NOT a test-reachable
// dep, so the middleware is driven through a minimal mock Context (same posture as routes.test.ts): it
// touches only c.req.header()/path/method, c.res.status, c.res.headers.set (the X-Request-Id stamp, which
// #480 moved to AFTER next() so it survives a handler-returned Response), and next().
// The two load-bearing invariants (docs/law/Tier-2-Foundation.md #11 + the request-id belt): the SAFE_REQUEST_ID
// charset guard (a malicious X-Request-Id → a fresh safe id; a valid one propagates unchanged) and the
// /api/_debug skip (no trace root, no request-ring record — introspection traffic doesn't evict real traces).

import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { getTraceByRequestId, initTracing, logger, observability, observabilityErrorHandler, recentRequests } from "@orb/server/foundation/observability";
import { describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

// The middleware's own guard charset (mirrored here to assert a minted id is safe by construction). A real
// request id is only ever drawn from this alphabet — never the caller's rejected bytes.
const SAFE_CHARSET = /^[A-Za-z0-9_.\-:]{1,128}$/u;
const OK_STATUS = 200;

// The middleware reads the auth-resolved caller off the Hono context (`c.get("principal")`) to bind the
// request logger; the mock supplies `get` returning an optional injected principal (null = anonymous).
interface MockPrincipal {
  readonly userId: UserId;
  readonly handle: Handle;
}
interface MockCtx {
  readonly req: {
    readonly path: string;
    readonly method: string;
    readonly header: (name: string) => string | undefined;
  };
  readonly res: { readonly status: number; readonly headers: Headers };
  get: (key: "principal") => MockPrincipal | null;
}
type MiddlewareFn = (c: MockCtx, next: () => Promise<void>) => Promise<void>;

interface RunResult {
  /** The id as it lands on the RESPONSE (`c.res.headers`, stamped after `next()` — #480). */
  readonly stampedId: string | null;
  readonly nextCalled: boolean;
}

// Drive the middleware once: build a mock Context (carrying a real Headers so the response stamp is
// observable, plus whether next ran), invoke it, and report what came back out.
async function run(opts: { path: string; method?: string; incomingId?: string; principal?: MockPrincipal }): Promise<RunResult> {
  const incoming = opts.incomingId;
  let nextCalled = false;
  const ctx: MockCtx = {
    req: {
      path: opts.path,
      method: opts.method ?? "GET",
      header: (name: string): string | undefined => (name.toLowerCase() === "x-request-id" ? incoming : undefined),
    },
    res: { status: OK_STATUS, headers: new Headers() },
    get: (_key: "principal"): MockPrincipal | null => opts.principal ?? null,
  };
  const next = (): Promise<void> => {
    nextCalled = true;
    return Promise.resolve();
  };
  // @orb-waive no-test-fabrication(unknown): narrowing the real Hono middleware to the minimal test-local call-shape. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const mw = observability as unknown as MiddlewareFn;
  await mw(ctx, next);
  return { stampedId: ctx.res.headers.get("x-request-id"), nextCalled };
}

describe("the X-Request-Id charset guard (foundation.md #11)", () => {
  test("a valid incoming id is propagated unchanged (Caddy-edge correlation)", async () => {
    const incomingId = "caddy-9f8e7d6c-1234";
    const { stampedId } = await run({ path: "/api/chats", incomingId });
    expect(stampedId).toBe(incomingId);
  });

  test("a malicious incoming id (escapes/spaces) is rejected → a fresh safe id is minted", async () => {
    const malicious = "abc def\nSet-Cookie: evil[31m";
    const { stampedId } = await run({ path: "/api/chats", incomingId: malicious });
    expect(stampedId).not.toBe(malicious);
    expect(stampedId).not.toBeNull();
    // The minted id is drawn only from the safe alphabet — no injected control/escape bytes survive.
    expect(SAFE_CHARSET.test(stampedId ?? "")).toBe(true);
  });

  test("an over-length incoming id (>128 chars) is rejected → a fresh safe id", async () => {
    const tooLong = "a".repeat(129);
    const { stampedId } = await run({ path: "/api/chats", incomingId: tooLong });
    expect(stampedId).not.toBe(tooLong);
    expect(SAFE_CHARSET.test(stampedId ?? "")).toBe(true);
  });

  test("no incoming id → a fresh safe id is always stamped", async () => {
    const { stampedId } = await run({ path: "/api/chats" });
    expect(stampedId).not.toBeNull();
    expect(SAFE_CHARSET.test(stampedId ?? "")).toBe(true);
  });
});

describe("the /api/_debug trace-skip (introspection doesn't evict real traces)", () => {
  test("a /api/_debug request runs next() but opens NO trace root and records NO request-ring entry", async () => {
    initTracing();
    const incomingId = "debug-skip-req-1";
    const { stampedId, nextCalled } = await run({ path: "/api/_debug/logs", incomingId });
    // The id is still stamped on the response (the skip drops the RINGS, never the correlation header), but
    // the request is invisible to the rings.
    expect(stampedId).toBe(incomingId);
    expect(nextCalled).toBe(true);
    expect(getTraceByRequestId(incomingId)).toBeUndefined();
    expect(recentRequests(200).some((r) => r.id === incomingId)).toBe(false);
  });

  test("a normal request DOES open a request-root trace and record the request ring", async () => {
    initTracing();
    const incomingId = "traced-req-1";
    const { nextCalled } = await run({ path: "/api/chats", method: "POST", incomingId });
    expect(nextCalled).toBe(true);

    const trace = getTraceByRequestId(incomingId);
    if (trace === undefined) {
      throw new Error("expected a recorded trace for a non-debug request");
    }
    expect(trace.rootName).toBe("http POST /api/chats");

    const record = recentRequests(200).find((r) => r.id === incomingId);
    expect(record).toBeDefined();
    expect(record?.method).toBe("POST");
    expect(record?.path).toBe("/api/chats");
    expect(record?.status).toBe(OK_STATUS);
  });
});

describe("request-user binding (the auth-resolved caller is stamped on the request ring)", () => {
  test("an authenticated request records the resolved userId on the request-ring record", async () => {
    initTracing();
    const incomingId = "bound-user-req";
    await run({ path: "/api/chats", incomingId, principal: { userId: castId<UserId>("user-42"), handle: castId<Handle>("nate") } });
    const record = recentRequests(200).find((r) => r.id === incomingId);
    expect(record?.userId).toBe("user-42");
  });

  test("an anonymous request (null principal) leaves userId absent", async () => {
    initTracing();
    const incomingId = "anon-user-req";
    await run({ path: "/api/chats", incomingId });
    const record = recentRequests(200).find((r) => r.id === incomingId);
    expect(record?.userId).toBeUndefined();
  });
});

// The `/join/<token>` invite landing carries a bearer capability (it redeems room membership) in its path.
// The redaction (`redactSensitivePath` → `/join/:token`) applies to the single `path` variable that feeds
// EVERY sink — the trace root name (`/api/_debug/traces`), the request ring (`/api/_debug/logs`), and the
// pino `request` line (silenced in tests) — so the raw token never persists (entry/http/join.ts's claim).
describe("invite-token path redaction (F1 — the bearer token is never persisted raw)", () => {
  const rawToken = "s3cr3t-invite-token-abc123";

  test("GET /join/<token> redacts the token in BOTH the request ring and the trace root name", async () => {
    initTracing();
    const incomingId = "join-redact-req";
    const { nextCalled } = await run({ path: `/join/${rawToken}`, incomingId });
    expect(nextCalled).toBe(true);

    // Sink 1 — the trace root (readable via /api/_debug/traces): the route shape, token stripped.
    const trace = getTraceByRequestId(incomingId);
    if (trace === undefined) {
      throw new Error("expected a recorded trace for the /join landing");
    }
    expect(trace.rootName).toBe("http GET /join/:token");
    expect(trace.rootName).not.toContain(rawToken);

    // Sink 2 — the request ring (readable via /api/_debug/logs): the redacted path, token absent.
    const record = recentRequests(200).find((r) => r.id === incomingId);
    expect(record?.path).toBe("/join/:token");
    expect(JSON.stringify(record)).not.toContain(rawToken);
  });

  test("a sibling path outside /join/ is NOT over-redacted (prefix-anchored)", async () => {
    initTracing();
    const incomingId = "join-sibling-req";
    await run({ path: "/joined/room", incomingId });
    const record = recentRequests(200).find((r) => r.id === incomingId);
    expect(record?.path).toBe("/joined/room");
  });
});

// A minimal Hono-Context stand-in for the error path. It carries what BOTH arms of the handler touch:
// `c.text(body, status)` (the 500), and — for the throw-ABOVE-the-scope arm (#1479) — `c.req.*` and
// `c.header()`. `text` merges the prepared headers exactly as Hono's `newResponse` does, so the
// X-Request-Id stamp is observable on the returned Response.
const INTERNAL_ERROR = 500;
interface MockErrorCtx extends MockCtx {
  readonly prepared: Headers;
  header: (name: string, value: string) => void;
  text: (body: string, status: number) => Response;
}

function makeErrorCtx(opts: { path?: string; method?: string; incomingId?: string } = {}): MockErrorCtx {
  const prepared = new Headers();
  return {
    req: {
      path: opts.path ?? "/api/chats",
      method: opts.method ?? "GET",
      header: (name: string): string | undefined => (name.toLowerCase() === "x-request-id" ? opts.incomingId : undefined),
    },
    res: { status: INTERNAL_ERROR, headers: new Headers() },
    get: (_key: "principal"): MockPrincipal | null => null,
    prepared,
    header: (name: string, value: string): void => {
      prepared.set(name, value);
    },
    text: (body: string, status: number): Response => new Response(body, { status, headers: prepared }),
  };
}

describe("observabilityErrorHandler (the thrown-request path)", () => {
  test("logs ONE request.thrown error line carrying the err, and returns Hono's default 500 text", async () => {
    // pino output is silenced (LOG_LEVEL=silent) in tests; spy `logger.error` directly (the same posture
    // as client-error.test.ts). A pino child (`runInRequest`) is `Object.create(parent)`, so a child minted
    // after this spy inherits it — the assertion holds on both arms.
    const spy = vi.spyOn(logger, "error");
    const err = new Error("handler-blew-up");
    // ErrorHandler's return type is `Response | Promise<Response>`; await covers both.
    const res = await observabilityErrorHandler(err, makeErrorCtx() as never);

    expect(spy).toHaveBeenCalledOnce();
    const [fields, msg] = spy.mock.calls[0] as [Record<string, unknown>, string];
    expect(fields["err"]).toBe(err);
    expect(msg).toBe("request.thrown");

    // The client-visible response is unchanged from Hono's default onError — this is an observability fix.
    expect(res.status).toBe(INTERNAL_ERROR);
    expect(await res.text()).toBe("Internal Server Error");
  });

  // #1479 — a throw from a middleware mounted ABOVE `observability` (the auth seam) never enters the
  // request scope: no id, no ring entry, no trace. Hono's compose catches it at its own dispatch frame, so
  // onError is the ONLY place that can see it, and this is the arm that does. The mount order is untouched.
  test("a throw ABOVE the scope records the request itself: ring entry + trace + the X-Request-Id stamp", async () => {
    initTracing();
    const incomingId = "above-scope-req-1";
    const res = await observabilityErrorHandler(new Error("auth-blew-up"), makeErrorCtx({ path: "/api/chats", incomingId }) as never);

    expect(res.headers.get("X-Request-Id")).toBe(incomingId);
    const record = recentRequests(200).find((r) => r.id === incomingId);
    expect(record?.status).toBe(INTERNAL_ERROR);
    expect(record?.path).toBe("/api/chats");
    expect(record?.method).toBe("GET");
    expect(getTraceByRequestId(incomingId)?.status).toBe("error");
  });

  test("…the id it records obeys the SAME charset guard (a malicious header never reaches the ring)", async () => {
    const malicious = "abc def\nSet-Cookie: evil";
    await observabilityErrorHandler(new Error("auth-blew-up"), makeErrorCtx({ path: "/api/chats", incomingId: malicious }) as never);
    expect(recentRequests(200).some((r) => r.id === malicious)).toBe(false);
  });

  test("…and a /join/<token> path is REDACTED in that record (the capability never enters the ring)", async () => {
    const incomingId = "above-scope-join-1";
    await observabilityErrorHandler(new Error("auth-blew-up"), makeErrorCtx({ path: "/join/secret-capability", incomingId }) as never);
    const record = recentRequests(200).find((r) => r.id === incomingId);
    expect(record?.path).toBe("/join/:token");
  });

  // The CONTROL for the arm split: a context the middleware DID observe takes the legacy path — the ring
  // entry is the middleware's own (status 200), and the error handler adds no second one.
  test("a context the middleware already observed is NOT re-recorded by the error handler", async () => {
    initTracing();
    const incomingId = "observed-then-thrown-1";
    const ctx = makeErrorCtx({ path: "/api/chats", incomingId });
    // @orb-waive no-test-fabrication(unknown): narrowing the real Hono middleware to the minimal test-local call-shape. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    await (observability as unknown as MiddlewareFn)(ctx, (): Promise<void> => Promise.resolve());

    await observabilityErrorHandler(new Error("handler-blew-up"), ctx as never);

    const records = recentRequests(200).filter((r) => r.id === incomingId);
    expect(records).toHaveLength(1);
    expect(records[0]?.status).toBe(INTERNAL_ERROR);
  });
});
