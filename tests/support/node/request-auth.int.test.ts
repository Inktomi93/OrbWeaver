import "@orb/testkit/node/composed-real.ts";
import { authConfigSchema } from "@orb/contracts/auth-config";
import { authMeSchema, CSRF_HEADER } from "@orb/contracts/identity";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { vi } from "vitest";

const PASSWORD = "a-real-test-password-not-an-auth-bypass";
const HANDLE = castId<Handle>("local-member");

test.each([
  { peer: "127.0.0.1", firstRun: true, scope: "loopback" },
  { peer: "93.184.215.14", firstRun: false, scope: "public" },
  { peer: undefined, firstRun: false, scope: "public" },
])("actual HTTP bootstrap preserves physical peer $peer independently of forged forwarding headers", async ({ peer, firstRun, scope }) => {
  const readPeer = vi.fn(() => peer);
  await using harness = await createServerHarness({ authConfig: { ...authConfigFromEnv(), mode: "local" }, physicalPeer: readPeer });
  const response = await harness.http.request("/api/auth/config");
  expect(response.status).toBe(200);
  const config = authConfigSchema.parse(await response.json());
  expect(config.localFirstRun).toBe(firstRun);
  expect(config.clientScope).toBe(scope);
  expect(config.transport).toBe("http");
  expect(readPeer).toHaveBeenCalledTimes(1);
  const forwarded = await harness.http.request("/api/auth/config", {
    headers: { "x-forwarded-for": "127.0.0.1", "x-forwarded-proto": "https" },
  });
  expect(forwarded.status).toBe(200);
  const forwardedConfig = authConfigSchema.parse(await forwarded.json());
  expect(forwardedConfig.localFirstRun).toBe(false);
  expect(forwardedConfig.clientScope).toBe(scope);
  expect(forwardedConfig.transport).toBe(peer === "127.0.0.1" ? "https" : "http");
  expect(readPeer).toHaveBeenCalledTimes(2);
});

test("local HTTP admission requires its CSRF-protected password flow and rechecks a disabled account", async () => {
  await using harness = await createServerHarness({ authConfig: { ...authConfigFromEnv(), mode: "local" } });
  const owner = await harness.internalCallerFor(harness.ownerId);
  const user = await owner.admin.createUser({ handle: HANDLE, password: PASSWORD });
  const anonymous = await harness.http.request("/api/auth/me");
  expect(authMeSchema.parse(await anonymous.json())).toEqual({ authenticated: false, handle: null, role: null });
  const body = new URLSearchParams({ handle: HANDLE, password: PASSWORD });
  const noCsrf = await harness.http.request("/api/auth/login", { method: "POST", body });
  expect(noCsrf.status).toBe(403);
  await noCsrf.arrayBuffer();
  const login = await harness.http.request("/api/auth/login", { method: "POST", headers: { [CSRF_HEADER]: "1" }, body });
  expect(login.status).toBe(200);
  await login.arrayBuffer();
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  if (cookie === undefined) {
    throw new Error("actual local login did not mint its session cookie");
  }
  const signedIn = await harness.http.request("/api/auth/me", { headers: { cookie } });
  expect(authMeSchema.parse(await signedIn.json())).toEqual({ authenticated: true, handle: HANDLE, role: "user" });
  await owner.admin.setEnabled({ userId: user.id, enabled: false });
  const disabled = await harness.http.request("/api/auth/me", { headers: { cookie } });
  expect(authMeSchema.parse(await disabled.json())).toEqual({ authenticated: false, handle: null, role: null });
  const deniedLogin = await harness.http.request("/api/auth/login", { method: "POST", headers: { [CSRF_HEADER]: "1" }, body });
  expect(deniedLogin.status).toBe(401);
  await deniedLogin.arrayBuffer();
});

test("identical actor IDs in independent roots cannot authenticate with the other root's minted cookie", async () => {
  const authConfig = { ...authConfigFromEnv(), mode: "local" } satisfies NonNullable<Parameters<typeof createServerHarness>[0]>["authConfig"];
  await using first = await createServerHarness({ authConfig });
  await using second = await createServerHarness({ authConfig });
  const firstOwner = await first.internalCallerFor(first.ownerId);
  const secondOwner = await second.internalCallerFor(second.ownerId);
  const firstUser = await firstOwner.admin.createUser({ handle: HANDLE, password: PASSWORD });
  const secondUser = await secondOwner.admin.createUser({ handle: HANDLE, password: PASSWORD });
  expect(firstUser.id).toBe(secondUser.id);
  const login = await first.http.request("/api/auth/login", {
    method: "POST",
    headers: { [CSRF_HEADER]: "1" },
    body: new URLSearchParams({ handle: HANDLE, password: PASSWORD }),
  });
  expect(login.status).toBe(200);
  await login.arrayBuffer();
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  if (cookie === undefined) {
    throw new Error("actual local login did not mint its session cookie");
  }
  const own = await first.http.request("/api/auth/me", { headers: { cookie } });
  expect(authMeSchema.parse(await own.json())).toEqual({ authenticated: true, handle: HANDLE, role: "user" });
  const foreign = await second.http.request("/api/auth/me", { headers: { cookie } });
  expect(authMeSchema.parse(await foreign.json())).toEqual({ authenticated: false, handle: null, role: null });
});
