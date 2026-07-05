// foundation/observability/middleware — the per-request Hono middleware. Hono is NOT a test-reachable
// dep, so the middleware is driven through a minimal mock Context (same posture as routes.test.ts): it
// touches only c.req.header()/path/method, c.header(name,value) (the echo), c.res.status, and next().
// The two load-bearing invariants (core/Tier-2-Foundation.md #11 + the request-id belt): the SAFE_REQUEST_ID
// charset guard (a malicious X-Request-Id → a fresh safe id; a valid one propagates unchanged) and the
// /api/_debug skip (no trace root, no request-ring record — introspection traffic doesn't evict real traces).

import {
  getTraceByRequestId,
  initTracing,
  logger,
  observability,
  observabilityErrorHandler,
  recentRequests,
} from "@orb/server/foundation/observability";
import { describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures";

// The middleware's own guard charset (mirrored here to assert a minted id is safe by construction). A real
// request id is only ever drawn from this alphabet — never the caller's rejected bytes.
const SAFE_CHARSET = /^[A-Za-z0-9_.\-:]{1,128}$/u;
const OK_STATUS = 200;

interface MockCtx {
  readonly req: {
    readonly path: string;
    readonly method: string;
    readonly header: (name: string) => string | undefined;
  };
  readonly res: { readonly status: number };
  header: (name: string, value: string) => void;
}
type MiddlewareFn = (c: MockCtx, next: () => Promise<void>) => Promise<void>;

interface RunResult {
  readonly echoedId: string | undefined;
  readonly nextCalled: boolean;
}

// Drive the middleware once: build a mock Context (capturing the echoed X-Request-Id and whether next ran),
// invoke it, and report what came back out.
async function run(opts: {
  path: string;
  method?: string;
  incomingId?: string;
}): Promise<RunResult> {
  const incoming = opts.incomingId;
  let echoedId: string | undefined;
  let nextCalled = false;
  const ctx: MockCtx = {
    req: {
      path: opts.path,
      method: opts.method ?? "GET",
      header: (name: string): string | undefined =>
        name.toLowerCase() === "x-request-id" ? incoming : undefined,
    },
    res: { status: OK_STATUS },
    header: (name: string, value: string): void => {
      if (name.toLowerCase() === "x-request-id") {
        echoedId = value;
      }
    },
  };
  const next = (): Promise<void> => {
    nextCalled = true;
    return Promise.resolve();
  };
  const mw = observability as unknown as MiddlewareFn;
  await mw(ctx, next);
  return { echoedId, nextCalled };
}

describe("the X-Request-Id charset guard (foundation.md #11)", () => {
  test("a valid incoming id is propagated unchanged (Caddy-edge correlation)", async () => {
    const incomingId = "caddy-9f8e7d6c-1234";
    const { echoedId } = await run({ path: "/api/chats", incomingId });
    expect(echoedId).toBe(incomingId);
  });

  test("a malicious incoming id (escapes/spaces) is rejected → a fresh safe id is minted", async () => {
    const malicious = "abc def\nSet-Cookie: evil[31m";
    const { echoedId } = await run({ path: "/api/chats", incomingId: malicious });
    expect(echoedId).not.toBe(malicious);
    expect(echoedId).toBeDefined();
    // The minted id is drawn only from the safe alphabet — no injected control/escape bytes survive.
    expect(SAFE_CHARSET.test(echoedId ?? "")).toBe(true);
  });

  test("an over-length incoming id (>128 chars) is rejected → a fresh safe id", async () => {
    const tooLong = "a".repeat(129);
    const { echoedId } = await run({ path: "/api/chats", incomingId: tooLong });
    expect(echoedId).not.toBe(tooLong);
    expect(SAFE_CHARSET.test(echoedId ?? "")).toBe(true);
  });

  test("no incoming id → a fresh safe id is always echoed", async () => {
    const { echoedId } = await run({ path: "/api/chats" });
    expect(echoedId).toBeDefined();
    expect(SAFE_CHARSET.test(echoedId ?? "")).toBe(true);
  });
});

describe("the /api/_debug trace-skip (introspection doesn't evict real traces)", () => {
  test("a /api/_debug request runs next() but opens NO trace root and records NO request-ring entry", async () => {
    initTracing();
    const incomingId = "debug-skip-req-1";
    const { echoedId, nextCalled } = await run({ path: "/api/_debug/logs", incomingId });
    // The id is still echoed (the header is set before the skip), but the request is invisible to the rings.
    expect(echoedId).toBe(incomingId);
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

// A minimal Hono-Context stand-in: `observabilityErrorHandler` only touches `c.text(body, status)` (the
// same posture the middleware test above uses for its mock Context). `c.text` returns a real Response so
// the 500 shape can be asserted without pulling Hono into the test.
const INTERNAL_ERROR = 500;
interface MockErrorCtx {
  text: (body: string, status: number) => Response;
}
const errorCtx: MockErrorCtx = {
  text: (body: string, status: number): Response => new Response(body, { status }),
};

describe("observabilityErrorHandler (the thrown-request path, PD-118)", () => {
  test("logs ONE request.thrown error line carrying the err, and returns Hono's default 500 text", async () => {
    // pino output is silenced (LOG_LEVEL=silent) in tests; spy `logger.error` directly (the same posture
    // as client-error.test.ts). Called OUTSIDE `runInRequest`, so getLog() resolves to the base logger.
    const spy = vi.spyOn(logger, "error");
    const err = new Error("handler-blew-up");
    // ErrorHandler's return type is `Response | Promise<Response>`; await covers both (our impl is sync).
    const res = await observabilityErrorHandler(err, errorCtx as never);

    expect(spy).toHaveBeenCalledOnce();
    const [fields, msg] = spy.mock.calls[0] as [Record<string, unknown>, string];
    expect(fields["err"]).toBe(err);
    expect(msg).toBe("request.thrown");

    // The client-visible response is unchanged from Hono's default onError — this is an observability fix.
    expect(res.status).toBe(INTERNAL_ERROR);
    expect(await res.text()).toBe("Internal Server Error");
  });
});
