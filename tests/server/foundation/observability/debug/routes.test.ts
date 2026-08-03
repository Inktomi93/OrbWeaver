// foundation/observability/debug/routes — the /api/_debug two-tier auth gate (this gate previously
// shipped untested). Pins: timing-safe token equality;
// admin-cookie short-circuit; DEBUG_TOKEN fallback; `expectedToken === undefined` → 404 only when no
// admin checker authorizes; wrong token → 401; and — the security-critical one — `isAdmin` THROWING must
// never OPEN the gate (it falls through to the token check, never short-circuits to allow).
//
// The middleware is exercised through a minimal mock Context (Hono isn't a test-reachable dep): it touches
// only c.req.raw.headers, c.req.header(), c.json(body,status), and next() — all mocked here.
import type { DebugAuthOptions } from "@orb/server/foundation/observability/debug";
import { createDebugAuthMiddleware, tokenMatches } from "@orb/server/foundation/observability/debug";
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
// if it blocked, the HTTP status it returned.
async function runGate(opts: DebugAuthOptions | string | undefined, reqToken?: string): Promise<{ passed: boolean; status: number }> {
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
  const gate = createDebugAuthMiddleware(opts) as unknown as GateFn;
  const result = await gate(ctx, next);
  return { passed, status: passed ? OK : (result?.status ?? OK) };
}

const allow = (): Promise<boolean> => Promise.resolve(true);
const deny = (): Promise<boolean> => Promise.resolve(false);
const blowUp = (): Promise<boolean> => Promise.reject(new Error("isAdmin seam failed"));

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

describe("createDebugAuthMiddleware (token tier)", () => {
  test("no token configured + no admin checker → 404 (debug API disabled)", async () => {
    expect(await runGate(undefined)).toEqual({ passed: false, status: 404 });
  });

  test("wrong x-debug-token → 401", async () => {
    expect(await runGate("secret", "wrong")).toEqual({ passed: false, status: 401 });
  });

  test("missing x-debug-token when one is configured → 401", async () => {
    expect(await runGate("secret")).toEqual({ passed: false, status: 401 });
  });

  test("correct x-debug-token → authorized (next called)", async () => {
    expect(await runGate("secret", "secret")).toEqual({ passed: true, status: OK });
  });
});

describe("createDebugAuthMiddleware (admin-cookie tier)", () => {
  test("admin session authorizes without a token", async () => {
    expect(await runGate({ expectedToken: undefined, adminAuth: { isAdmin: allow } })).toEqual({
      passed: true,
      status: OK,
    });
  });

  test("non-admin session + no token → 404 (falls through, gate stays closed)", async () => {
    expect(await runGate({ expectedToken: undefined, adminAuth: { isAdmin: deny } })).toEqual({
      passed: false,
      status: 404,
    });
  });

  test("non-admin session + correct token still authorizes (token is the fallback)", async () => {
    expect(await runGate({ expectedToken: "secret", adminAuth: { isAdmin: deny } }, "secret")).toEqual({ passed: true, status: OK });
  });

  test("isAdmin THROWING does not OPEN the gate — no token → 404", async () => {
    expect(await runGate({ expectedToken: undefined, adminAuth: { isAdmin: blowUp } })).toEqual({
      passed: false,
      status: 404,
    });
  });

  test("isAdmin THROWING falls through to the token check — correct token → authorized", async () => {
    expect(await runGate({ expectedToken: "secret", adminAuth: { isAdmin: blowUp } }, "secret")).toEqual({ passed: true, status: OK });
  });
});
