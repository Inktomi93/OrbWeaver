// Owner-target validity is distinct from caller privilege; exercise both through the composed service.
// @subject packages/server/src/domain/admin/guard.ts
// @subject packages/server/src/domain/admin/verbs/create-user.ts
// @subject packages/server/src/domain/admin/verbs/link-sso-identity.ts
// @subject packages/server/src/domain/admin/verbs/reset-password.ts
// @subject packages/server/src/domain/admin/verbs/set-enabled.ts
// @subject packages/server/src/domain/admin/verbs/set-role.ts
import { adminUserViewSchema, authMeSchema } from "@orb/contracts/identity";
import { sessionAdminViewSchema } from "@orb/contracts/session";
import { users } from "@orb/db";
import type { ExternalId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import { expect, test } from "@orb/testkit/node";
import { signInWithPassword } from "@orb/testkit/node/auth";
import { createServerHarness } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";
import { vi } from "vitest";

const PASSWORD = "native-owner-boundary-password";
const PRIVATE_PASSWORD_HASH = "private-password-hash";
const PRIVATE_SESSION_HASH = "private-session-hash";

test("admin wire schemas preserve composed views and the router refuses private extra fields", async () => {
  await using root = await createServerHarness();
  const owner = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(owner.userId);
  const target = await root.actor();
  await root.app.sessions.create({ userId: target.id });
  const userViews = await caller.admin.listUsers();
  expect(userViews.map((view) => adminUserViewSchema.parse(view))).toEqual(userViews);
  const devices = await caller.admin.listSessions({ userId: target.id });
  expect(devices).toHaveLength(1);
  expect(devices.map((view) => sessionAdminViewSchema.parse(view))).toEqual(devices);
  expect(Object.isFrozen(devices[0])).toBe(true);
  const internalUsers = await root.services.admin.listUsers({ principal: owner });
  using listUsers = vi.spyOn(root.services.admin, "listUsers");
  listUsers.mockResolvedValueOnce(internalUsers.map((view) => ({ ...view, passwordHash: PRIVATE_PASSWORD_HASH })));
  await expect(caller.admin.listUsers()).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Output validation failed" });
  expect(userViews.every((view) => adminUserViewSchema.safeParse({ ...view, passwordHash: PRIVATE_PASSWORD_HASH }).success === false)).toBe(true);
  using listSessions = vi.spyOn(root.services.admin, "listSessions");
  listSessions.mockResolvedValueOnce(devices.map((view) => ({ ...view, tokenHash: PRIVATE_SESSION_HASH })));
  await expect(caller.admin.listSessions({ userId: target.id })).rejects.toMatchObject({
    code: "INTERNAL_SERVER_ERROR",
    message: "Output validation failed",
  });
  expect(devices.every((view) => sessionAdminViewSchema.safeParse({ ...view, tokenHash: PRIVATE_SESSION_HASH }).success === false)).toBe(true);
});

test("owner includes delegated admin work while a delegate cannot grant elevated roles or create another owner", async () => {
  await using root = await createServerHarness();
  const owner = await root.principalFor(root.ownerId);
  const delegate = await root.actor({ role: "admin" });
  const admin = await root.principalFor(delegate.id);
  const member = await root.actor();
  const ordinary = await root.principalFor(member.id);
  const caller = await root.internalCallerFor(owner.userId);
  const created = await root.services.admin.createUser({ principal: owner, handle: castId<Handle>("owner-created-user"), password: PASSWORD });
  const delegated = await root.services.admin.createUser({ principal: admin, handle: castId<Handle>("admin-created-user"), password: PASSWORD });
  expect(typeof created.role).toBe("object");
  expect(Object.isFrozen(created.role)).toBe(true);
  expect(Object.keys(created.role)).toEqual([]);
  const targets = await caller.admin.listUsers();
  expect(targets.find(({ id }) => id === created.id)).toMatchObject({ role: "user" });
  expect(targets.find(({ id }) => id === delegated.id)).toMatchObject({ role: "user" });
  await expect(root.services.admin.createUser({ principal: ordinary, handle: castId<Handle>("member-must-not-create"), password: PASSWORD })).rejects.toThrow(
    "requires admin privilege",
  );
  await expect(
    root.services.admin.createUser({ principal: admin, handle: castId<Handle>("delegate-must-not-mint-admin"), role: "admin", password: PASSWORD }),
  ).rejects.toThrow("requires owner privilege");
  await expect(root.services.admin.setRole({ principal: admin, userId: delegated.id, role: "admin" })).rejects.toThrow("requires owner privilege");
  await expect(
    root.services.admin.createUser({ principal: owner, handle: castId<Handle>("second-owner-must-not-exist"), role: "owner", password: PASSWORD }),
  ).rejects.toMatchObject({ code: "cannot_grant_owner" });
  expect(await root.db.select({ id: users.id }).from(users).where(eq(users.role, "owner"))).toEqual([{ id: root.ownerId }]);
  expect(await caller.admin.setRole({ userId: owner.userId, role: "owner" })).toMatchObject({ id: owner.userId, role: "owner" });
  await expect(root.services.admin.setRole({ principal: owner, userId: owner.userId, role: "admin" })).rejects.toMatchObject({ code: "cannot_modify_owner" });
  expect(await root.app.sessions.loadUserById(delegated.id)).toMatchObject({ enabled: true });
  expect(await (await root.internalCallerFor(delegated.id)).sessions.me()).toMatchObject({ globalRole: "user" });
});

test("a delegate cannot disable, bind or reset the owner, while the owner can rotate the credential used by actual HTTP login", async () => {
  await using root = await createServerHarness({ authConfig: { ...authConfigFromEnv(), mode: "local", fallback: "deny" } });
  const owner = await root.principalFor(root.ownerId);
  const delegate = await root.actor({ role: "admin" });
  const admin = await root.principalFor(delegate.id);
  await root.services.admin.resetPassword({ principal: owner, userId: owner.userId, password: PASSWORD });
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
  const cookie = await signInWithPassword(root, owner.handle, PASSWORD);
  const me = await root.http.request("/api/auth/me", { headers: { cookie } });
  expect(authMeSchema.parse(await me.json())).toEqual({ authenticated: true, handle: owner.handle, role: "owner" });
});
