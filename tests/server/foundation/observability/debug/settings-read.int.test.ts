// The real operator route reads complete settings bytes through the owning domain, never an auth fallback.
import "@orb/testkit/node/composed-real.ts";
import type { Principal } from "@orb/contracts/identity";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";

const PASSWORD = "operator-read-control-password";

test("the settings probe preserves key order and stored values while rejecting anonymous and delegated-admin readers", async () => {
  await using root = await createServerHarness({ authConfig: { ...authConfigFromEnv(), mode: "local", fallback: "deny" } });
  const zeta = { key: "application:debug-zeta", value: { marker: "operator-only-settings-marker", opaque: [null, true, 3] }, updatedAt: root.clock.now() };
  await root.services.settings.setGlobalSetting(zeta.key, zeta.value);
  root.clock.advance(1000);
  const alpha = { key: "application:debug-alpha", value: "stored-string-bytes", updatedAt: root.clock.now() };
  await root.services.settings.setGlobalSetting(alpha.key, alpha.value);
  const admin = await root.actor({ role: "admin" });
  const owner = await root.principalFor(root.ownerId);
  const signIn = async (principal: Principal): Promise<string> => {
    await root.services.admin.resetPassword({ principal: owner, userId: principal.userId, password: PASSWORD });
    const response = await root.http.request("/api/auth/login", {
      method: "POST",
      headers: { host: "localhost", [CSRF_HEADER]: "1" },
      body: new URLSearchParams({ handle: principal.handle, password: PASSWORD }),
    });
    expect(response.status).toBe(200);
    const cookie = response.headers
      .getSetCookie()
      .map((line) => line.split(";")[0])
      .join("; ");
    expect(cookie).not.toBe("");
    return cookie;
  };
  const adminCookie = await signIn(await root.principalFor(admin.id));
  const ownerCookie = await signIn(owner);
  for (const presented of ["", adminCookie]) {
    const refused = await root.http.request("/api/_debug/config/app", { headers: { host: "localhost", cookie: presented } });
    expect(refused.status).toBe(404);
    expect(await refused.text()).not.toContain(zeta.value.marker);
  }
  const admitted = await root.http.request("/api/_debug/config/app", {
    headers: { host: "localhost", cookie: ownerCookie },
  });
  expect(admitted.status).toBe(200);
  expect(await admitted.json()).toEqual({ effective: root.services.settings.getEffectiveConfig(), rows: [alpha, zeta] });
});
