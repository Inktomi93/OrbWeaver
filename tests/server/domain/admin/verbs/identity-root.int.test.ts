// Admin writes the identity root; the cookie seam re-reads it through sessions on the next request.
// @subject packages/server/src/domain/sessions/verbs/validate.ts
// @subject packages/server/src/domain/admin/verbs/set-enabled.ts
// @subject packages/server/src/domain/admin/verbs/set-role.ts
import { authMeSchema, CSRF_HEADER } from "@orb/contracts/identity";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";

const PASSWORD = "identity-root-target-password";

test("an admin role change and disable reach a live cookie session on its next request", async () => {
  await using root = await createServerHarness({ authConfig: { ...authConfigFromEnv(), mode: "local", fallback: "deny" } });
  const owner = await root.principalFor(root.ownerId);
  const handle = castId<Handle>("identity-root-target");
  const target = await root.services.admin.createUser({ principal: owner, handle, password: PASSWORD });
  const login = await root.http.request("/api/auth/login", {
    method: "POST",
    headers: { [CSRF_HEADER]: "1" },
    body: new URLSearchParams({ handle, password: PASSWORD }),
  });
  expect(login.status).toBe(200);
  await login.arrayBuffer();
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  if (cookie === undefined) {
    throw new Error("the actual login did not issue its session cookie");
  }
  const me = async (): Promise<unknown> => authMeSchema.parse(await (await root.http.request("/api/auth/me", { headers: { cookie } })).json());

  expect(await me()).toEqual({ authenticated: true, handle, role: "user" });
  await root.services.admin.setRole({ principal: owner, userId: target.id, role: "admin" });
  expect(await me()).toEqual({ authenticated: true, handle, role: "admin" });
  await root.services.admin.setEnabled({ principal: owner, userId: target.id, enabled: false });
  expect(await me()).toEqual({ authenticated: false, handle: null, role: null });
});
