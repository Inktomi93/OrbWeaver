// The guarded password reset writes its audit_logs row atomically with the password_hash and session kick: a
// refused reset keeps the stored hash, and each accepted reset adds exactly one admin.resetPassword row.
// @subject packages/server/src/domain/admin/verbs/session-policy.ts
// @subject packages/server/src/entry/compose/admin.ts
// @subject packages/server/src/foundation/observability/audit.ts
// @subject packages/server/src/domain/admin/substrate/audited-write.ts

import { auditLogs, users } from "@orb/db";
import type { SocketId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { refuseWrites } from "@orb/testkit/node/composed";
import { principal } from "@orb/testkit/node/helpers";
import { and, eq } from "drizzle-orm";
import { vi } from "vitest";

const PASSWORD = "a-new-valid-password";
const ORIGINAL_PASSWORD = "the-original-password";

test("the composed guarded audit stays adjacent and atomic with the password and session kick", async ({ harness, db, app, ids }) => {
  const actor = await harness.actor({ role: "admin" });
  const target = await harness.actor({ password: ORIGINAL_PASSWORD });
  const storedHash = async (): Promise<string | null | undefined> => (await db.select().from(users).where(eq(users.id, target.id)))[0]?.passwordHash;
  const originalHash = await storedHash();
  expect(originalHash).not.toBeNull();
  const session = await app.sessions.create({ userId: target.id });
  const evicted = vi.fn();
  app.sockets.goLive(app.sockets.adopt(target.id, castId<SocketId>(ids.next("socket")), null), {
    onAttach: vi.fn(),
    onAnnounce: vi.fn(),
    onDetach: vi.fn(),
    onEvicted: evicted,
  });
  await using refusal = await refuseWrites(db, { table: auditLogs, event: "INSERT", when: "NEW.action = 'admin.resetPassword'", message: "audit refused" });
  const params = { principal: await principal(harness, actor.id), userId: target.id, password: PASSWORD };
  await expect(app.services.admin.resetPassword(params)).rejects.toThrow();
  expect(await storedHash()).toBe(originalHash);
  expect(await app.sessions.validate(session.token)).toMatchObject({ userId: target.id });
  expect(evicted).not.toHaveBeenCalled();
  await refusal.lift();
  await app.services.admin.resetPassword(params);
  expect(await app.sessions.validate(session.token)).toBeNull();
  expect(evicted).toHaveBeenCalledOnce();
  expect(
    await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.action, "admin.resetPassword"), eq(auditLogs.actorUserId, actor.id))),
  ).toHaveLength(1);
  // A zero-row kick cannot become the audit's predecessor.
  await app.services.admin.resetPassword(params);
  expect(
    await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.action, "admin.resetPassword"), eq(auditLogs.actorUserId, actor.id))),
  ).toHaveLength(2);
});
