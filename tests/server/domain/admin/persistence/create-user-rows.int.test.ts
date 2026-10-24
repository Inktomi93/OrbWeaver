// createUser's stored rows: the minted users row holds only a scrypt hash, each mint and elevation writes one
// admin.createUser audit_logs row, a refused seed-key handle leaves every users row unchanged, and a failed audit mints nothing.
// @subject packages/server/src/domain/admin/verbs/create-user.ts
// @subject packages/server/src/transport/trpc/role-output.ts

import { auditLogs, users } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect } from "@orb/testkit/node";
import { signInWithPassword } from "@orb/testkit/node/auth";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { refuseWrites } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";
import { delegate, NEW_HANDLE, PASSWORD, test } from "../verbs/create-user.fixtures.ts";

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
  await expect(signInWithPassword(root, NEW_HANDLE, PASSWORD)).resolves.not.toBe("");
  expect((await createAudits(root)).map((entry) => entry.entityId)).toEqual([view.id]);
});

test("the owner mints an admin through the audited owner-only elevation path", async ({ root }) => {
  const caller = await root.internalCallerFor(root.ownerId);
  const view = await caller.admin.createUser({ handle: NEW_HANDLE, password: PASSWORD, role: "admin" });
  expect(view.role).toBe("admin");
  expect((await createAudits(root)).map((entry) => entry.entityId)).toEqual([view.id]);
  expect(await root.db.select().from(users).where(eq(users.id, view.id)).get()).toMatchObject({ role: "admin", kind: "human" });
});

test.for(["owner", "0wner"])("the owner seed key and its look-alikes are refused: %j", async (handle, { root }) => {
  const admin = await delegate(root);
  const before = await root.db.select().from(users);
  await expect(root.services.admin.createUser({ principal: admin.principal, handle: castId<Handle>(handle), password: PASSWORD })).rejects.toMatchObject({
    code: "invalid_handle",
  });
  expect(await root.db.select().from(users)).toEqual(before);
});

test("a failing audit write mints no account, while the restored audit permits the same mint", async ({ root }) => {
  const admin = await delegate(root);
  await using refusal = await refuseWrites(root.db, {
    table: auditLogs,
    event: "INSERT",
    when: "NEW.action = 'admin.createUser'",
    message: "synthetic audit refusal",
  });
  await expect(root.services.admin.createUser({ principal: admin.principal, handle: NEW_HANDLE, password: PASSWORD })).rejects.toThrow(
    "synthetic audit refusal",
  );
  expect(await root.db.select().from(users).where(eq(users.handle, NEW_HANDLE))).toEqual([]);
  expect(await createAudits(root)).toEqual([]);
  await refusal.lift();
  const view = await admin.caller.admin.createUser({ handle: NEW_HANDLE, password: PASSWORD });
  expect(view.role).toBe("user");
  expect((await createAudits(root)).map((entry) => entry.entityId)).toEqual([view.id]);
});
