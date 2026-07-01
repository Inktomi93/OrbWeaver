// entry/http/healthz — the liveness registrar. Pins: live → 200 ok; shutdown drain → 503 shutting_down;
// boot decrypt-probe failure → 503 credentials_key_mismatch; shutdown wins over the key signal. Hono isn't
// test-resolvable, so the registrar runs over a captured mock app + context.

import type { HealthzDeps } from "@orb/server/entry/http";
import { registerHealthz } from "@orb/server/entry/http";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures";

interface MockResult {
  readonly body: { readonly status: string };
  readonly status: number;
}
interface MockCtx {
  readonly json: (body: { status: string }, status?: number) => MockResult;
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
  registerHealthz(app as unknown as Parameters<typeof registerHealthz>[0], deps);
  const handler = routes.get("GET /healthz");
  if (handler === undefined) {
    throw new Error("healthz route not registered");
  }
  return handler;
}

function run(deps: HealthzDeps): MockResult {
  const ctx: MockCtx = {
    json: (body: { status: string }, status = OK): MockResult => ({ body, status }),
  };
  return healthzHandler(deps)(ctx);
}

describe("registerHealthz", () => {
  test("live → 200 ok", () => {
    expect(
      run({ isShuttingDown: (): boolean => false, credentialsKeyOk: (): boolean => true }),
    ).toEqual({ body: { status: "ok" }, status: 200 });
  });

  test("shutdown drain → 503 shutting_down", () => {
    expect(
      run({ isShuttingDown: (): boolean => true, credentialsKeyOk: (): boolean => true }),
    ).toEqual({ body: { status: "shutting_down" }, status: 503 });
  });

  test("boot decrypt-probe failure → 503 credentials_key_mismatch", () => {
    expect(
      run({ isShuttingDown: (): boolean => false, credentialsKeyOk: (): boolean => false }),
    ).toEqual({ body: { status: "credentials_key_mismatch" }, status: 503 });
  });

  test("shutdown wins over the key signal", () => {
    expect(
      run({ isShuttingDown: (): boolean => true, credentialsKeyOk: (): boolean => false }),
    ).toEqual({ body: { status: "shutting_down" }, status: 503 });
  });
});
