// entry/http/healthz — the liveness registrar. Pins: live → 200 ok + the e2e-harness stamp; shutdown drain →
// 503 shutting_down; boot decrypt-probe failure → 503 credentials_key_mismatch; shutdown wins over the key
// signal; and the BUILD IDENTITY block on every arm the box operator asks for, and on no arm anyone else asks for
// (ADR 0076). Hono isn't test-resolvable, so the registrar runs over a captured mock app + context.

import type { VersionIdentity } from "@orb/kit/version-identity";
import type { HealthzDeps } from "@orb/server/entry/http";
import { registerHealthz } from "@orb/server/entry/http";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const IDENTITY: VersionIdentity = { version: "1.2.3", commit: "a".repeat(40), short: "a".repeat(12), source: "checkout" };
const LOOPBACK = "127.0.0.1";

interface MockBody {
  readonly status: string;
  readonly harness?: boolean;
  readonly version?: VersionIdentity;
}
interface MockResult {
  readonly body: MockBody;
  readonly status: number;
}
interface MockCtx {
  readonly json: (body: MockBody, status?: number) => MockResult;
  readonly req: { readonly raw: { readonly headers: Headers } };
  readonly env: { readonly incoming: { readonly socket: { readonly remoteAddress: string } } };
}
type Handler = (c: MockCtx) => MockResult;

const OK = 200;

function healthzHandler(deps: HealthzDeps): Handler {
  const routes = new Map<string, Handler>();
  const app = {
    get: (path: string, routeHandler: Handler): unknown => {
      routes.set(`GET ${path}`, routeHandler);
      return app;
    },
  };
  // @orb-waive no-test-fabrication(unknown): minimal route-capture mock; the real framework app type is far larger than what route REGISTRATION exercises here. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  registerHealthz(app as unknown as Parameters<typeof registerHealthz>[0], deps);
  const handler = routes.get("GET /healthz");
  if (handler === undefined) {
    throw new Error("healthz route not registered");
  }
  return handler;
}

type LivenessDeps = Omit<HealthzDeps, "version" | "identityVisible">;

/** The request the gate sees: the raw TCP peer and the headers. */
interface Caller {
  readonly peer: string;
  readonly headers?: Record<string, string>;
}

interface GateCall {
  readonly peer: string | undefined;
  readonly relayed: boolean;
}

/** Run one request. `visible` is the gate's verdict; `calls` records what the route handed the gate. */
function run(deps: LivenessDeps, visible = true, caller: Caller = { peer: LOOPBACK }, calls: GateCall[] = []): MockResult {
  const ctx: MockCtx = {
    json: (body: MockBody, status = OK): MockResult => ({ body, status }),
    req: { raw: { headers: new Headers(caller.headers) } },
    env: { incoming: { socket: { remoteAddress: caller.peer } } },
  };
  const withGate: HealthzDeps = {
    ...deps,
    version: (): VersionIdentity => IDENTITY,
    identityVisible: (peer, headers): boolean => {
      calls.push({ peer, relayed: headers.has("x-forwarded-for") });
      return visible;
    },
  };
  return healthzHandler(withGate)(ctx);
}

const LIVE: LivenessDeps = { isShuttingDown: (): boolean => false, credentialsKeyOk: (): boolean => true, isHarnessStack: (): boolean => false };

describe("registerHealthz", () => {
  test("live → 200 ok, harness stamp absent on a normal (dev/prod) stack", () => {
    expect(run(LIVE)).toEqual({
      body: { status: "ok", harness: false, version: IDENTITY },
      status: 200,
    });
  });

  // The e2e globalSetup refuses to seed an origin whose /healthz does not report `harness:true`
  // (tests/e2e/support/target-guard.ts) — this is the producing end of that stamp.
  test("live on an E2E_HARNESS stack → 200 ok with harness:true", () => {
    expect(run({ ...LIVE, isHarnessStack: (): boolean => true })).toEqual({
      body: { status: "ok", harness: true, version: IDENTITY },
      status: 200,
    });
  });

  test("shutdown drain → 503 shutting_down", () => {
    expect(run({ isShuttingDown: (): boolean => true, credentialsKeyOk: (): boolean => true, isHarnessStack: (): boolean => true })).toEqual({
      body: { status: "shutting_down", version: IDENTITY },
      status: 503,
    });
  });

  test("boot decrypt-probe failure → 503 credentials_key_mismatch", () => {
    expect(run({ isShuttingDown: (): boolean => false, credentialsKeyOk: (): boolean => false, isHarnessStack: (): boolean => true })).toEqual({
      body: { status: "credentials_key_mismatch", version: IDENTITY },
      status: 503,
    });
  });

  test("shutdown wins over the key signal", () => {
    expect(run({ isShuttingDown: (): boolean => true, credentialsKeyOk: (): boolean => false, isHarnessStack: (): boolean => false })).toEqual({
      body: { status: "shutting_down", version: IDENTITY },
      status: 503,
    });
  });
});

// ADR 0076: a public share link reaches /healthz too, and the exact build is an attacker's lookup key. The gate's
// verdict decides the block on every arm; the status fields and the harness stamp never depend on it.
describe("registerHealthz — the build identity is the box operator's alone", () => {
  test.each([
    ["live", LIVE, { status: "ok", harness: false }, OK],
    ["live on a harness stack", { ...LIVE, isHarnessStack: (): boolean => true }, { status: "ok", harness: true }, OK],
    ["shutting down", { ...LIVE, isShuttingDown: (): boolean => true }, { status: "shutting_down" }, 503],
    ["key mismatch", { ...LIVE, credentialsKeyOk: (): boolean => false }, { status: "credentials_key_mismatch" }, 503],
  ])("%s, gate refuses → status fields only, no version", (_label, deps, body, status) => {
    expect(run(deps, false)).toEqual({ body, status });
  });

  test("the gate is asked about the raw TCP peer and the request's own headers", () => {
    const calls: GateCall[] = [];
    run(LIVE, false, { peer: "203.0.113.9", headers: { "x-forwarded-for": "198.51.100.7" } }, calls);
    expect(calls).toEqual([{ peer: "203.0.113.9", relayed: true }]);
  });
});
