// @subject packages/server/src/domain/admin/verbs/create-user.ts
// @subject packages/server/src/transport/trpc/role-output.ts
import { CSRF_HEADER } from "@orb/contracts/identity";
import { auditLogs, userConnections, users } from "@orb/db";
import { DomainForbiddenError } from "@orb/kit/errors";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import { test as base, expect } from "@orb/testkit/node/fixtures.ts";
import type { ServerTestHarness } from "@orb/testkit/node/server.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { eq, sql } from "drizzle-orm";

const PASSWORD = "create-user-synthetic-password";
const NEW_HANDLE = castId<Handle>("newbie");

const test = base.extend<{ root: ServerTestHarness }>({
  root: async ({}, use): Promise<void> => {
    await using root = await createServerHarness({
      authConfig: { ...authConfigFromEnv(), mode: "local", fallback: "deny" },
      rolePolicyConfig: { ["DEFAULT_USER_HANDLE"]: "owner", ["OWNER_HANDLES"]: "owner" },
    });
    await use(root);
  },
});

async function delegate(root: ServerTestHarness): Promise<{
  readonly principal: Awaited<ReturnType<ServerTestHarness["principalFor"]>>;
  readonly caller: Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
}> {
  const user = await root.actor({ role: "admin" });
  return { principal: await root.principalFor(user.id), caller: await root.internalCallerFor(user.id) };
}

async function createAudits(root: ServerTestHarness): Promise<(typeof auditLogs.$inferSelect)[]> {
  return await root.db.select().from(auditLogs).where(eq(auditLogs.action, "admin.createUser"));
}

test("an admin mints a user; the password is hashed and absent from the wire view (audited)", async ({ root }) => {
  const admin = await delegate(root);
  const view = await admin.caller.admin.createUser({ handle: NEW_HANDLE, password: PASSWORD });
  expect(view).toMatchObject({ handle: NEW_HANDLE, role: "user" });
  expect(Object.keys(view)).not.toContain("passwordHash");
  const row = await root.db.select().from(users).where(eq(users.id, view.id)).get();
  expect(row?.passwordHash).toMatch(/^scrypt\$/u);
  expect(row?.passwordHash).not.toContain(PASSWORD);
  const login = await root.http.request("/api/auth/login", {
    method: "POST",
    headers: { [CSRF_HEADER]: "1" },
    body: new URLSearchParams({ handle: NEW_HANDLE, password: PASSWORD }),
  });
  expect(login.status).toBe(200);
  await login.arrayBuffer();
  expect((await createAudits(root)).map((entry) => entry.entityId)).toEqual([view.id]);
});

test("the minted account carries its local-light vector floor", async ({ root }) => {
  const admin = await delegate(root);
  const view = await admin.caller.admin.createUser({ handle: NEW_HANDLE, password: PASSWORD });
  expect(await root.db.select().from(userConnections).where(eq(userConnections.ownerId, view.id))).toHaveLength(2);
});

test("an empty handle is rejected (invalid_handle)", async ({ root }) => {
  const admin = await delegate(root);
  await expect(root.services.admin.createUser({ principal: admin.principal, handle: castId<Handle>("   "), password: PASSWORD })).rejects.toMatchObject({
    code: "invalid_handle",
  });
});

test("a short password is rejected (weak_password)", async ({ root }) => {
  const admin = await delegate(root);
  await expect(root.services.admin.createUser({ principal: admin.principal, handle: NEW_HANDLE, password: "short" })).rejects.toMatchObject({
    code: "weak_password",
  });
});

test("even the owner cannot mint a second owner (cannot_grant_owner)", async ({ root }) => {
  await expect(
    root.services.admin.createUser({ principal: await root.principalFor(root.ownerId), handle: NEW_HANDLE, password: PASSWORD, role: "owner" }),
  ).rejects.toMatchObject({ code: "cannot_grant_owner" });
});

test("a delegated admin cannot mint an admin and writes no account", async ({ root }) => {
  const admin = await delegate(root);
  await expect(root.services.admin.createUser({ principal: admin.principal, handle: NEW_HANDLE, password: PASSWORD, role: "admin" })).rejects.toThrow(
    DomainForbiddenError,
  );
  expect(await root.db.select().from(users).where(eq(users.handle, NEW_HANDLE))).toEqual([]);
});

test("a delegated admin cannot mint an owner — authority refuses before owner validation", async ({ root }) => {
  const admin = await delegate(root);
  await expect(root.services.admin.createUser({ principal: admin.principal, handle: NEW_HANDLE, password: PASSWORD, role: "owner" })).rejects.toThrow(
    DomainForbiddenError,
  );
});

test("the owner mints an admin through the audited owner-only elevation path", async ({ root }) => {
  const caller = await root.internalCallerFor(root.ownerId);
  const view = await caller.admin.createUser({ handle: NEW_HANDLE, password: PASSWORD, role: "admin" });
  expect(view.role).toBe("admin");
  expect((await createAudits(root)).map((entry) => entry.entityId)).toEqual([view.id]);
  expect(await root.db.select().from(users).where(eq(users.id, view.id)).get()).toMatchObject({ role: "admin", kind: "human" });
});

test("a duplicate handle is rejected (user_exists)", async ({ root }) => {
  const admin = await delegate(root);
  await admin.caller.admin.createUser({ handle: NEW_HANDLE, password: PASSWORD });
  await expect(root.services.admin.createUser({ principal: admin.principal, handle: NEW_HANDLE, password: PASSWORD })).rejects.toMatchObject({
    code: "user_exists",
  });
});

test("a held handle's look-alike is rejected, while a genuinely different handle is minted", async ({ root }) => {
  const admin = await delegate(root);
  await admin.caller.admin.createUser({ handle: castId<Handle>("host"), password: PASSWORD });
  await expect(root.services.admin.createUser({ principal: admin.principal, handle: castId<Handle>("h0st"), password: PASSWORD })).rejects.toMatchObject({
    code: "user_exists",
  });
  expect(await admin.caller.admin.createUser({ handle: castId<Handle>("hosts"), password: PASSWORD })).toMatchObject({ handle: "hosts" });
});

test("a mixed-script handle is rejected; a single-script non-Latin handle is minted", async ({ root }) => {
  const admin = await delegate(root);
  await expect(root.services.admin.createUser({ principal: admin.principal, handle: castId<Handle>("hσst"), password: PASSWORD })).rejects.toMatchObject({
    code: "invalid_handle",
  });
  expect(await admin.caller.admin.createUser({ handle: castId<Handle>("Дмитрий"), password: PASSWORD })).toMatchObject({ handle: "Дмитрий" });
});

test("handles containing only zero-width or blank characters are rejected", async ({ root }) => {
  const admin = await delegate(root);
  for (const handle of ["\u200b\u200b", "\u2060", "\u3000"]) {
    await expect(root.services.admin.createUser({ principal: admin.principal, handle: castId<Handle>(handle), password: PASSWORD })).rejects.toMatchObject({
      code: "invalid_handle",
    });
  }
});

test.for(["owner", "0wner"])("the owner seed key and its look-alikes are refused: %j", async (handle, { root }) => {
  const admin = await delegate(root);
  const before = await root.db.select().from(users);
  await expect(root.services.admin.createUser({ principal: admin.principal, handle: castId<Handle>(handle), password: PASSWORD })).rejects.toMatchObject({
    code: "invalid_handle",
  });
  expect(await root.db.select().from(users)).toEqual(before);
});

test("a handle that only contains the seed key is minted", async ({ root }) => {
  const admin = await delegate(root);
  expect(await admin.caller.admin.createUser({ handle: castId<Handle>("owners"), password: PASSWORD })).toMatchObject({ handle: "owners" });
});

test("a plain user is denied", async ({ root }) => {
  const user = await root.actor();
  await expect(root.services.admin.createUser({ principal: await root.principalFor(user.id), handle: NEW_HANDLE, password: PASSWORD })).rejects.toThrow(
    DomainForbiddenError,
  );
});

test("a failing audit write mints no account, while the restored audit permits the same mint", async ({ root }) => {
  const admin = await delegate(root);
  await root.db.run(
    sql`CREATE TRIGGER refuse_create_user_audit BEFORE INSERT ON audit_logs WHEN NEW.action = 'admin.createUser' BEGIN SELECT RAISE(ABORT, 'synthetic audit refusal'); END`,
  );
  await expect(root.services.admin.createUser({ principal: admin.principal, handle: NEW_HANDLE, password: PASSWORD })).rejects.toThrow();
  expect(await root.db.select().from(users).where(eq(users.handle, NEW_HANDLE))).toEqual([]);
  expect(await createAudits(root)).toEqual([]);
  await root.db.run(sql`DROP TRIGGER refuse_create_user_audit`);
  const view = await admin.caller.admin.createUser({ handle: NEW_HANDLE, password: PASSWORD });
  expect(view.role).toBe("user");
  expect((await createAudits(root)).map((entry) => entry.entityId)).toEqual([view.id]);
});
