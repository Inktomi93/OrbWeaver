// @subject tests/support/node/server.ts
// @subject tests/support/node/fixtures.ts

import { auditLogs, userConnections, users } from "@orb/db";
import type { ExternalId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { expect, test } from "./fixtures.ts";

const PASSWORD = "actor-mint-password";
const SUBJECT = castId<ExternalId>("actor-mint-subject");

test("the fixture owner is the boot-seeded owner, and every fixture caller is an account the root minted", async ({
  harness,
  db,
  ownerCaller,
  adminCaller,
  otherCaller,
}) => {
  expect(await ownerCaller.sessions.me()).toEqual({ userId: harness.ownerId, handle: harness.app.sessions.rolePolicy.ownerHandles()[0], globalRole: "owner" });
  // Boot's seed mints the owner through ensureUser, which lays the local-light floor; an inserted owner row has none.
  expect(await db.select().from(userConnections).where(eq(userConnections.ownerId, harness.ownerId))).toHaveLength(2);
  const admin = await adminCaller.sessions.me();
  const other = await otherCaller.sessions.me();
  expect([admin.globalRole, other.globalRole]).toEqual(["admin", "user"]);
  const listed = await ownerCaller.admin.listUsers();
  expect(new Set(listed.map((user) => user.id))).toEqual(new Set([harness.ownerId, admin.userId, other.userId]));
});

test("an actor is shaped by the owner's audited admin verbs and reads back through the owner's admin view", async ({ harness, ownerCaller, db }) => {
  const minted = await harness.actor({ role: "admin", enabled: false, password: PASSWORD, externalId: SUBJECT });
  const listed = await ownerCaller.admin.listUsers();
  expect(listed.filter((user) => user.id === minted.id)).toEqual([
    expect.objectContaining({ role: "admin", enabled: false, externalId: SUBJECT, kind: "human" }),
  ]);
  const audited = await db.select({ action: auditLogs.action, actorUserId: auditLogs.actorUserId }).from(auditLogs).where(eq(auditLogs.entityId, minted.id));
  expect(new Set(audited.map((row) => row.action))).toEqual(new Set(["admin.linkSsoIdentity", "admin.setRole", "admin.setEnabled", "admin.resetPassword"]));
  expect(audited.every((row) => row.actorUserId === harness.ownerId)).toBe(true);
  // ensureUser seeds the new account's local-light floor; a row insert never did.
  expect(await db.select().from(userConnections).where(eq(userConnections.ownerId, minted.id))).toHaveLength(2);
});

test("an actor's password is the root's own credential, so local authentication admits it", async ({ harness }) => {
  const plain = await harness.actor();
  const credentialed = await harness.actor({ password: PASSWORD });
  expect(await harness.app.sessions.authenticate(credentialed.handle, PASSWORD)).toBe(credentialed.id);
  expect(await harness.app.sessions.authenticate(plain.handle, PASSWORD)).toBeNull();
});

test("an actor never adopts an existing account by handle", async ({ harness, db }) => {
  const first = await harness.actor();
  await expect(harness.actor({ handle: first.handle })).rejects.toThrow(/already held/);
  const fresh = await harness.actor({ handle: castId(`${first.handle}-fresh`) });
  expect(fresh.id).not.toBe(first.id);
  expect(await db.select({ role: users.role, enabled: users.enabled }).from(users).where(eq(users.id, fresh.id))).toEqual([{ role: "user", enabled: true }]);
});

test("two concurrent actors asking for one handle mint one account and refuse the other", async ({ harness, db }) => {
  const handle = castId<Handle>("actor-mint-contended");
  const settled = await Promise.allSettled([harness.actor({ handle }), harness.actor({ handle })]);
  const minted = settled.flatMap((result) => (result.status === "fulfilled" ? [result.value.id] : []));
  const refused = settled.flatMap((result) => (result.status === "rejected" ? [String(result.reason)] : []));
  expect(minted).toHaveLength(1);
  expect(refused).toEqual([expect.stringMatching(/already held/)]);
  expect(await db.select({ id: users.id }).from(users).where(eq(users.handle, handle))).toEqual([{ id: minted[0] }]);
});
