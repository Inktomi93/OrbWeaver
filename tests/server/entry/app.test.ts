// entry/app — the Hono builder. Pins the HTTP-edge wiring over `app.fetch` + fake deps: healthz reflects
// the injected shutdown/key getters; the auth seam resolves the ONE principal per request (the blob route
// then 401s an anonymous caller); the seam is consulted exactly once per request (no double-resolve). The
// tRPC mount + the multipart routes are exercised by their own slice tests; here we prove the assembly.

import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AuthSeam, SeamResult } from "@orb/server/entry/auth";
import { describe, expect, test } from "vitest";
import type { AppDeps } from "../../../packages/server/src/entry/app.ts";
import { createApp } from "../../../packages/server/src/entry/app.ts";

const FROZEN_NOW = 1_750_000_000_000;
const OK = 200;
const UNAUTHORIZED = 401;
const SERVICE_UNAVAILABLE = 503;

const OWNER: Principal = {
  userId: castId<UserId>("usr_owner"),
  role: "owner",
  handle: castId<Handle>("owner"),
  externalId: null,
  via: "fallback",
};

/** A fake seam that always resolves the same principal; `onResolve` fires once per resolution (the spy seam
 *  for the "resolve once" pin). */
function fakeSeam(principal: Principal | null, onResolve?: () => void): AuthSeam {
  return {
    resolvePrincipal: (): Promise<SeamResult> => {
      onResolve?.();
      return Promise.resolve({ principal, csrfHeaderPresent: false });
    },
    isAdmin: (): Promise<boolean> => Promise.resolve(false),
  };
}

/** Build `AppDeps` with inert fakes; overrides patch in the per-test seam / getters. The unhit ports are
 *  typed stubs (the routes that would touch them are covered by their own slice tests). */
function deps(overrides: Partial<AppDeps>): AppDeps {
  const stub = {} as never;
  return {
    now: (): number => FROZEN_NOW,
    db: {} as unknown as Db,
    seam: fakeSeam(null),
    services: stub,
    rateLimit: { enforce: (): Promise<void> => Promise.resolve() },
    assets: stub,
    cas: stub,
    character: stub,
    sessions: stub,
    isShuttingDown: (): boolean => false,
    credentialsKeyOk: (): boolean => true,
    ...overrides,
  };
}

describe("createApp", () => {
  test("GET /healthz → 200 ok when live", async () => {
    const app = createApp(deps({}));
    const res = await app.fetch(new Request("http://localhost/healthz"));
    expect(res.status).toBe(OK);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  test("GET /healthz → 503 shutting_down when the shutdown getter flips", async () => {
    const app = createApp(deps({ isShuttingDown: (): boolean => true }));
    const res = await app.fetch(new Request("http://localhost/healthz"));
    expect(res.status).toBe(SERVICE_UNAVAILABLE);
    expect(await res.json()).toEqual({ status: "shutting_down" });
  });

  test("GET /healthz → 503 credentials_key_mismatch when the key probe failed", async () => {
    const app = createApp(deps({ credentialsKeyOk: (): boolean => false }));
    const res = await app.fetch(new Request("http://localhost/healthz"));
    expect(res.status).toBe(SERVICE_UNAVAILABLE);
    expect(await res.json()).toEqual({ status: "credentials_key_mismatch" });
  });

  test("anonymous caller → the blob route 401s (the middleware set principal=null on the context)", async () => {
    const app = createApp(deps({ seam: fakeSeam(null) }));
    const res = await app.fetch(new Request(`http://localhost/api/blob/${"a".repeat(64)}`));
    expect(res.status).toBe(UNAUTHORIZED);
  });

  test("the seam resolves the principal EXACTLY ONCE per request", async () => {
    let calls = 0;
    const seam = fakeSeam(OWNER, () => {
      calls += 1;
    });
    const app = createApp(deps({ seam }));
    await app.fetch(new Request("http://localhost/healthz"));
    expect(calls).toBe(1);
  });
});
