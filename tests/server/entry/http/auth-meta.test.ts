// entry/http/auth-meta — the public bootstrap registrar (FINAL-Auth-Modes §7 P0). Pins: /config derives
// the per-mode flags from the INJECTED mode (requiresLogin only for the cookie modes); discreet login
// WITHHOLDS the handle pre-fill (read per request — a runtime AppSettings flip takes effect immediately);
// /me projects the middleware-resolved principal (authenticated/handle/role) and never resolves a second
// time. Hono isn't test-resolvable, so the registrar runs over a captured mock app + context (the
// healthz.test.ts pattern).

import type { AuthMode, Principal } from "@orb/contracts/identity";
import { resolveUploadCaps } from "@orb/contracts/uploads";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AuthMetaDeps } from "@orb/server/entry/http";
import { registerAuthMeta } from "@orb/server/entry/http";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures";

interface MockResult {
  readonly body: Record<string, unknown>;
  readonly status: number;
}
interface MockCtx {
  readonly get: (key: "principal") => Principal | null;
  readonly json: (body: Record<string, unknown>, status?: number) => MockResult;
}
type Handler = (c: MockCtx) => MockResult;

const OK = 200;

/** Register over a captured mock app; return the two handlers keyed by path. */
function handlers(deps: AuthMetaDeps): { config: Handler; me: Handler } {
  const routes = new Map<string, Handler>();
  const app = {
    get: (path: string, routeHandler: Handler): unknown => {
      routes.set(`GET ${path}`, routeHandler);
      return app;
    },
  };
  // FABRICATION-OK: Hono isn't test-resolvable — the captured mock app is a deliberate partial (the healthz.test.ts pattern).
  registerAuthMeta(app as unknown as Parameters<typeof registerAuthMeta>[0], deps);
  const config = routes.get("GET /api/auth/config");
  const me = routes.get("GET /api/auth/me");
  if (config === undefined || me === undefined) {
    throw new Error("auth-meta routes not registered");
  }
  return { config, me };
}

function run(handler: Handler, principal: Principal | null = null): MockResult {
  const ctx: MockCtx = {
    get: () => principal,
    json: (body, status = OK): MockResult => ({ body, status }),
  };
  return handler(ctx);
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function depsFor(mode: AuthMode, discreet = false, capable = false): AuthMetaDeps {
  return {
    mode,
    defaultHandle: "owner",
    discreetLogin: () => discreet,
    multiHumanCapable: () => capable,
    maxImageBytes: () => MAX_IMAGE_BYTES,
  };
}

const USER: Principal = {
  userId: castId<UserId>("usr_1"),
  role: "user",
  handle: castId<Handle>("alice"),
  externalId: null,
  via: "cookie",
};

describe("GET /api/auth/config", () => {
  test("local mode → requiresLogin + localEnabled, handle pre-fill present", () => {
    expect(run(handlers(depsFor("local")).config).body).toEqual({
      mode: "local",
      requiresLogin: true,
      localEnabled: true,
      oidcEnabled: false,
      discreetLogin: false,
      defaultHandle: "owner",
      multiHumanCapable: false,
      uploads: resolveUploadCaps(MAX_IMAGE_BYTES),
    });
  });

  test("serves the resolved upload byte caps (image cap = min of the route cap and the admin maxImageBytes)", () => {
    const body = run(handlers(depsFor("local")).config).body;
    // maxImageBytes (5 MiB) is tighter than the 64 MiB route cap, so the served image cap is the admin value.
    expect(body["uploads"]).toEqual(resolveUploadCaps(MAX_IMAGE_BYTES));
    expect((body["uploads"] as { image: number }).image).toBe(MAX_IMAGE_BYTES);
  });

  test("oidc mode → requiresLogin + oidcEnabled", () => {
    const body = run(handlers(depsFor("oidc")).config).body;
    expect(body["requiresLogin"]).toBe(true);
    expect(body["oidcEnabled"]).toBe(true);
    expect(body["localEnabled"]).toBe(false);
  });

  test("single-user / forward-header → requiresLogin false (no login page can fix either)", () => {
    expect(run(handlers(depsFor("single-user")).config).body["requiresLogin"]).toBe(false);
    expect(run(handlers(depsFor("forward-header")).config).body["requiresLogin"]).toBe(false);
  });

  test("discreet login WITHHOLDS defaultHandle (no enumeration on the login surface)", () => {
    const body = run(handlers(depsFor("local", true)).config).body;
    expect(body["discreetLogin"]).toBe(true);
    expect(body["defaultHandle"]).toBeNull();
  });

  test("multiHumanCapable is the INJECTED per-request derivation (a runtime LOCAL_MULTI_USER flip takes effect immediately)", () => {
    let capable = false;
    const { config } = handlers({
      mode: "local",
      defaultHandle: "owner",
      discreetLogin: () => false,
      multiHumanCapable: () => capable,
      maxImageBytes: () => MAX_IMAGE_BYTES,
    });
    expect(run(config).body["multiHumanCapable"]).toBe(false);
    capable = true;
    expect(run(config).body["multiHumanCapable"]).toBe(true);
  });

  test("the discreet flag is read PER REQUEST (a runtime AppSettings flip takes effect immediately)", () => {
    let discreet = false;
    const { config } = handlers({
      mode: "local",
      defaultHandle: "owner",
      discreetLogin: () => discreet,
      multiHumanCapable: () => false,
      maxImageBytes: () => MAX_IMAGE_BYTES,
    });
    expect(run(config).body["defaultHandle"]).toBe("owner");
    discreet = true;
    expect(run(config).body["defaultHandle"]).toBeNull();
  });
});

describe("GET /api/auth/me", () => {
  test("projects the middleware-resolved principal", () => {
    expect(run(handlers(depsFor("local")).me, USER).body).toEqual({
      authenticated: true,
      handle: "alice",
      role: "user",
    });
  });

  test("anonymous → authenticated:false with null identity fields (a 200, never a 401)", () => {
    const res = run(handlers(depsFor("local")).me, null);
    expect(res.status).toBe(OK);
    expect(res.body).toEqual({ authenticated: false, handle: null, role: null });
  });
});
