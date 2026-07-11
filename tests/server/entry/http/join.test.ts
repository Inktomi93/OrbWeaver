// entry/http/join — the /join/:token invite landing (FINAL-Auth-Modes §7 P1). Pins the two behaviors:
// not multi-human capable → the leak-free 404 (the PD-106 unmounted shape, read per request off the
// injected capability — a runtime `LOCAL_MULTI_USER` flip takes effect immediately); capable → a 302
// into the SPA root carrying the token as a URL-encoded `join` search param (the client runs the real
// preview-then-confirm over the gated tRPC surface). Mock-app pattern (healthz.test.ts).

import type { JoinDeps } from "@orb/server/entry/http";
import { registerJoin } from "@orb/server/entry/http";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures";

interface MockResult {
  readonly kind: "text" | "redirect";
  readonly value: string;
  readonly status: number;
}
interface MockCtx {
  readonly req: { readonly param: (name: "token") => string };
  readonly text: (value: string, status: number) => MockResult;
  readonly redirect: (value: string, status: number) => MockResult;
}
type Handler = (c: MockCtx) => MockResult;

function joinHandler(deps: JoinDeps): Handler {
  const routes = new Map<string, Handler>();
  const app = {
    get: (path: string, routeHandler: Handler): unknown => {
      routes.set(`GET ${path}`, routeHandler);
      return app;
    },
  };
  // FABRICATION-OK: Hono isn't test-resolvable — the captured mock app is a deliberate partial (the healthz.test.ts pattern).
  registerJoin(app as unknown as Parameters<typeof registerJoin>[0], deps);
  const handler = routes.get("GET /join/:token");
  if (handler === undefined) {
    throw new Error("join route not registered");
  }
  return handler;
}

function run(deps: JoinDeps, token: string): MockResult {
  const ctx: MockCtx = {
    req: { param: () => token },
    text: (value, status): MockResult => ({ kind: "text", value, status }),
    redirect: (value, status): MockResult => ({ kind: "redirect", value, status }),
  };
  return joinHandler(deps)(ctx);
}

describe("GET /join/:token", () => {
  test("not multi-human capable → 404 (leak-free — the same unmounted shape as the tRPC belt)", () => {
    expect(run({ multiHumanCapable: () => false }, "tok")).toEqual({
      kind: "text",
      value: "Not Found",
      status: 404,
    });
  });

  test("capable → 302 into the SPA root with the URL-encoded token", () => {
    expect(run({ multiHumanCapable: () => true }, "tok en")).toEqual({
      kind: "redirect",
      // biome-ignore lint/security/noSecrets: a two-word test token URL-encoded, not a secret (entropy false-positive).
      value: "/?join=tok%20en",
      status: 302,
    });
  });

  test("the capability is read PER REQUEST (a runtime LOCAL_MULTI_USER flip takes effect immediately)", () => {
    let capable = false;
    const deps: JoinDeps = { multiHumanCapable: () => capable };
    expect(run(deps, "tok").status).toBe(404);
    capable = true;
    expect(run(deps, "tok").status).toBe(302);
  });
});
