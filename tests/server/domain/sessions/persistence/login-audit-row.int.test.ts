// A real login records its audit row through the audit writer the composition root hands the sessions service.
// @subject packages/server/src/domain/sessions/verbs/create.ts

import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, CSRF_HEADER } from "@orb/contracts/identity";
import { auditLogs, sessions } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";

const HANDLE = "audited-member";
const PASSWORD = "audited-member-password";

test("a local login audits the session it mints, attributed to the member who signed in", async () => {
  await using root = await createServerHarness({ physicalPeer: () => "192.168.1.55", env: { [AUTH_MODE_KEY]: "local", [AUTH_FALLBACK_KEY]: "deny" } });
  const member = await root.services.admin.createUser({ principal: await root.principalFor(root.ownerId), handle: castId<Handle>(HANDLE), password: PASSWORD });
  const response = await root.http.request("/api/auth/login", {
    method: "POST",
    headers: { [CSRF_HEADER]: "1" },
    body: new URLSearchParams({ handle: HANDLE, password: PASSWORD }),
  });
  expect(response.status).toBeLessThan(400);

  const minted = await root.db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, member.id));
  expect(minted).toHaveLength(1);
  const audited = await root.db.select({ entityId: auditLogs.entityId }).from(auditLogs).where(eq(auditLogs.actorUserId, member.id));
  expect(audited).toEqual([{ entityId: minted[0]?.id }]);
});
