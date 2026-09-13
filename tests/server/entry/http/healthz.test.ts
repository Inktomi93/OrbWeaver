// entry/http/healthz — the liveness registrar. Pins: live → 200 ok + the e2e-harness stamp; shutdown drain →
// 503 shutting_down; boot decrypt-probe failure → 503 credentials_key_mismatch; shutdown wins over the key
// signal. Hono isn't test-resolvable, so the registrar runs over a captured mock app + context.

import type { HealthzDeps } from "@orb/server/entry/http";
import { registerHealthz } from "@orb/server/entry/http";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

interface MockBody {
  readonly status: string;
  readonly harness?: boolean;
}
interface MockResult {
  readonly body: MockBody;
  readonly status: number;
}
interface MockCtx {
  readonly json: (body: MockBody, status?: number) => MockResult;
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

function run(deps: HealthzDeps): MockResult {
  const ctx: MockCtx = {
    json: (body: MockBody, status = OK): MockResult => ({ body, status }),
  };
  return healthzHandler(deps)(ctx);
}

describe("registerHealthz", () => {
  test("live → 200 ok, harness stamp absent on a normal (dev/prod) stack", () => {
    expect(run({ isShuttingDown: (): boolean => false, credentialsKeyOk: (): boolean => true, isHarnessStack: (): boolean => false })).toEqual({
      body: { status: "ok", harness: false },
      status: 200,
    });
  });

  // The e2e globalSetup refuses to seed an origin whose /healthz does not report `harness:true`
  // (tests/e2e/support/target-guard.ts) — this is the producing end of that stamp.
  test("live on an E2E_HARNESS stack → 200 ok with harness:true", () => {
    expect(run({ isShuttingDown: (): boolean => false, credentialsKeyOk: (): boolean => true, isHarnessStack: (): boolean => true })).toEqual({
      body: { status: "ok", harness: true },
      status: 200,
    });
  });

  test("shutdown drain → 503 shutting_down", () => {
    expect(run({ isShuttingDown: (): boolean => true, credentialsKeyOk: (): boolean => true, isHarnessStack: (): boolean => true })).toEqual({
      body: { status: "shutting_down" },
      status: 503,
    });
  });

  test("boot decrypt-probe failure → 503 credentials_key_mismatch", () => {
    expect(run({ isShuttingDown: (): boolean => false, credentialsKeyOk: (): boolean => false, isHarnessStack: (): boolean => true })).toEqual({
      body: { status: "credentials_key_mismatch" },
      status: 503,
    });
  });

  test("shutdown wins over the key signal", () => {
    expect(run({ isShuttingDown: (): boolean => true, credentialsKeyOk: (): boolean => false, isHarnessStack: (): boolean => false })).toEqual({
      body: { status: "shutting_down" },
      status: 503,
    });
  });
});
