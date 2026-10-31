// The admin kick's audit row records how many cookie sessions it ended, so a later reader can tell a real
// kick from a no-op.
// @subject packages/server/src/domain/admin/verbs/sessions.ts

import { auditLogs } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { principal } from "@orb/testkit/node/helpers";
import { and, eq } from "drizzle-orm";

test("revoke-all audits the number of cookie sessions it ended", async ({ harness, db, app }) => {
  const actor = await harness.actor({ role: "admin" });
  const target = await harness.actor();
  const revokedCounts = async (): Promise<unknown[]> =>
    (
      await db
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.action, "admin.revokeUserSessions"), eq(auditLogs.actorUserId, actor.id)))
    ).map((row) => row.metadata);
  await app.sessions.create({ userId: target.id });
  await app.sessions.create({ userId: target.id });
  await app.services.admin.revokeUserSessions({ principal: await principal(harness, actor.id), userId: target.id });
  expect(await revokedCounts()).toEqual([{ revoked: 2 }]);
  await app.services.admin.revokeUserSessions({ principal: await principal(harness, actor.id), userId: target.id });
  expect(await revokedCounts()).toEqual([{ revoked: 2 }, { revoked: 0 }]);
});
