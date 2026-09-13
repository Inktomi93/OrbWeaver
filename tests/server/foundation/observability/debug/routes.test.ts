// foundation/observability/debug/routes — the /api/_debug two-tier auth gate (this gate previously
// shipped untested). Pins: timing-safe token equality;
// admin-session short-circuit; DEBUG_TOKEN fallback; `expectedToken === undefined` → 404 only when no
// admin checker authorizes; wrong token → 401; and — the security-critical one — `isAdmin` THROWING must
// never OPEN the gate (it falls through to the token check, never short-circuits to allow).
//
// It also pins the REFUSAL SENTENCE (#1193): every deny names WHICH arm said no. The owner's dev bug button
// reported "the debug gate admits an admin session or x-debug-token" for every failure, which is unactionable
// when the session arm is the one refusing — and it was, on every dev box.
//
// The middleware is exercised through a minimal mock Context (Hono isn't a test-reachable dep): it touches
// only c.req.header(), c.json(body,status), and next() — all mocked here — plus whatever the injected
// `isAdmin` reads off the context, which in production is the request's already-resolved principal.
import type { DebugAuthOptions } from "@orb/server/foundation/observability/debug";
import { createDebugAuthMiddleware, toDebugLimit, tokenMatches } from "@orb/server/foundation/observability/debug";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";

interface MockResult {
  readonly body: unknown;
  readonly status: number;
}
interface MockCtx {
  readonly req: {
    readonly raw: { readonly headers: Headers };
    readonly header: (name: string) => string | undefined;
  };
  readonly json: (body: unknown, status?: number) => MockResult;
}
type GateFn = (c: MockCtx, next: () => Promise<void>) => Promise<MockResult | undefined>;

const OK = 200;

// Run the gate with the given config + request token; report whether it called next() (authorized) and,
// if it blocked, the HTTP status it returned + the `reason` sentence the caller is shown.
async function runGate(opts: DebugAuthOptions | string | undefined, reqToken?: string): Promise<{ passed: boolean; status: number; reason?: string }> {
  const headers = new Headers();
  if (reqToken !== undefined) {
    headers.set("x-debug-token", reqToken);
  }
  const ctx: MockCtx = {
    req: {
      raw: { headers },
      header: (name: string): string | undefined => headers.get(name) ?? undefined,
    },
    json: (body: unknown, status = OK): MockResult => ({ body, status }),
  };
  let passed = false;
  const next = (): Promise<void> => {
    passed = true;
    return Promise.resolve();
  };
  // @orb-waive no-test-fabrication(unknown): narrowing the real Hono middleware to the minimal test-local call-shape. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const gate = createDebugAuthMiddleware(opts) as unknown as GateFn;
  const result = await gate(ctx, next);
  if (passed) {
    return { passed, status: OK };
  }
  const refused = result?.body as { reason?: unknown } | undefined;
  return { passed, status: result?.status ?? OK, ...(typeof refused?.reason === "string" ? { reason: refused.reason } : {}) };
}

const allow = (): boolean => true;
const deny = (): boolean => false;
const blowUp = (): boolean => {
  throw new Error("isAdmin seam failed");
};

describe("tokenMatches", () => {
  test("false when either side is undefined", () => {
    expect(tokenMatches(undefined, "secret")).toBe(false);
    expect(tokenMatches("secret", undefined)).toBe(false);
    expect(tokenMatches(undefined, undefined)).toBe(false);
  });

  test("false on a length mismatch (no partial-prefix match)", () => {
    expect(tokenMatches("abc", "abcd")).toBe(false);
  });

  test("false on equal-length but different tokens", () => {
    expect(tokenMatches("abc", "abd")).toBe(false);
  });

  test("true only on an exact match", () => {
    expect(tokenMatches("s3cret-token", "s3cret-token")).toBe(true);
  });
});

/** The refusal clauses the gate composes. Spelled out here rather than imported: a test that borrows the
 *  implementation's own constant cannot notice the sentence going silently blank. */
const ADMIN_REFUSED = "the admin-session arm refused this request (no admin or owner session on it)";

describe("createDebugAuthMiddleware (token tier)", () => {
  test("no token configured + no admin checker → 404 (debug API disabled), and says only what is true", async () => {
    // NO admin clause: with no checker wired, no session arm ran, and claiming one refused would be a lie.
    expect(await runGate(undefined)).toEqual({ passed: false, status: 404, reason: "DEBUG_TOKEN is not configured on this server" });
  });

  test("wrong x-debug-token → 401, naming the token arm", async () => {
    expect(await runGate("secret", "wrong")).toEqual({ passed: false, status: 401, reason: "the x-debug-token sent did not match" });
  });

  test("missing x-debug-token when one is configured → 401, naming the token arm", async () => {
    expect(await runGate("secret")).toEqual({ passed: false, status: 401, reason: "no x-debug-token header was sent" });
  });

  test("correct x-debug-token → authorized (next called)", async () => {
    expect(await runGate("secret", "secret")).toEqual({ passed: true, status: OK });
  });
});

describe("createDebugAuthMiddleware (admin-session tier)", () => {
  test("admin session authorizes without a token", async () => {
    expect(await runGate({ expectedToken: undefined, adminAuth: { isAdmin: allow } })).toEqual({
      passed: true,
      status: OK,
    });
  });

  test("non-admin session + no token → 404 (falls through, gate stays closed), naming BOTH arms", async () => {
    expect(await runGate({ expectedToken: undefined, adminAuth: { isAdmin: deny } })).toEqual({
      passed: false,
      status: 404,
      reason: `${ADMIN_REFUSED}, and DEBUG_TOKEN is not configured on this server`,
    });
  });

  test("non-admin session + no token sent → 401 names the session arm FIRST (the #1193 actionability pin)", async () => {
    expect(await runGate({ expectedToken: "secret", adminAuth: { isAdmin: deny } })).toEqual({
      passed: false,
      status: 401,
      reason: `${ADMIN_REFUSED}, and no x-debug-token header was sent`,
    });
  });

  test("non-admin session + correct token still authorizes (token is the fallback)", async () => {
    expect(await runGate({ expectedToken: "secret", adminAuth: { isAdmin: deny } }, "secret")).toEqual({ passed: true, status: OK });
  });

  test("isAdmin THROWING does not OPEN the gate — no token → 404", async () => {
    expect(await runGate({ expectedToken: undefined, adminAuth: { isAdmin: blowUp } })).toEqual({
      passed: false,
      status: 404,
      reason: `${ADMIN_REFUSED}, and DEBUG_TOKEN is not configured on this server`,
    });
  });

  test("isAdmin THROWING falls through to the token check — correct token → authorized", async () => {
    expect(await runGate({ expectedToken: "secret", adminAuth: { isAdmin: blowUp } }, "secret")).toEqual({ passed: true, status: OK });
  });
});

// The `?limit=` reader every probe funnels through. It reaches ring reads and array slices, so a
// non-integer is a shape nothing downstream is written for — `Array.slice(0, 1.5)` and a
// `length >= 1.5` loop guard both "work" while meaning something nobody asked for.
const FALLBACK = 100;
const RING_CEILING = 2000;

describe("toDebugLimit", () => {
  test("a fractional ask is floored, never passed through to a ring/array slice", () => {
    expect(toDebugLimit("1.5", FALLBACK)).toBe(1);
    expect(toDebugLimit("2.999", FALLBACK)).toBe(2);
  });

  test("a sub-1 fraction falls back rather than resolving to an empty read", () => {
    expect(toDebugLimit("0.5", FALLBACK)).toBe(FALLBACK);
  });

  test("the existing bounds still hold — junk/zero/negative fall back, and the ceiling clamps", () => {
    expect(toDebugLimit(undefined, FALLBACK)).toBe(FALLBACK);
    expect(toDebugLimit("not-a-number", FALLBACK)).toBe(FALLBACK);
    expect(toDebugLimit("0", FALLBACK)).toBe(FALLBACK);
    expect(toDebugLimit("-5", FALLBACK)).toBe(FALLBACK);
    expect(toDebugLimit("Infinity", FALLBACK)).toBe(FALLBACK);
    expect(toDebugLimit("999999", FALLBACK)).toBe(RING_CEILING);
  });
});
