// A delegate's refused disable, SSO bind and password reset leave the owner's stored row byte-for-byte
// unchanged, and the owner still rotates the credential the real HTTP login reads.
// @subject packages/server/src/domain/admin/guard.ts
// @subject packages/server/src/domain/admin/verbs/create-user.ts
// @subject packages/server/src/domain/admin/verbs/link-sso-identity.ts
// @subject packages/server/src/domain/admin/verbs/reset-password.ts
// @subject packages/server/src/domain/admin/verbs/set-enabled.ts
// @subject packages/server/src/domain/admin/verbs/set-role.ts

import { authMeSchema } from "@orb/contracts/identity";
import { users } from "@orb/db";
import type { ExternalId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { signInWithPassword } from "@orb/testkit/node/auth";
import { createServerHarness } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";

const OWNER_PASSWORD = "native-owner-row-password";

test("a delegate cannot disable, bind or reset the owner, while the owner can rotate the credential used by actual HTTP login", async () => {
  await using root = await createServerHarness({ authConfig: { mode: "local", fallback: "deny" } });
  const owner = await root.principalFor(root.ownerId);
  const delegate = await root.actor({ role: "admin" });
  const admin = await root.principalFor(delegate.id);
  await root.services.admin.resetPassword({ principal: owner, userId: owner.userId, password: OWNER_PASSWORD });
  const before = await root.db.select().from(users).where(eq(users.id, owner.userId)).get();
  expect(before).toMatchObject({ role: "owner", enabled: true });
  await expect(root.services.admin.setEnabled({ principal: admin, userId: owner.userId, enabled: false })).rejects.toMatchObject({
    code: "cannot_modify_owner",
  });
  await expect(
    root.services.admin.linkSsoIdentity({ principal: admin, userId: owner.userId, externalId: castId<ExternalId>("delegate-controlled-subject") }),
  ).rejects.toMatchObject({ code: "cannot_modify_owner" });
  await expect(root.services.admin.resetPassword({ principal: admin, userId: owner.userId, password: "delegate-controlled-password" })).rejects.toMatchObject({
    code: "cannot_modify_owner",
  });
  expect(await root.db.select().from(users).where(eq(users.id, owner.userId)).get()).toEqual(before);
  const cookie = await signInWithPassword(root, owner.handle, OWNER_PASSWORD);
  const me = await root.http.request("/api/auth/me", { headers: { cookie } });
  expect(authMeSchema.parse(await me.json())).toEqual({ authenticated: true, handle: owner.handle, role: "owner" });
});
