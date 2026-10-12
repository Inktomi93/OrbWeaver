// op: resolveUserEnabled — the disabled-account containment read: the live row's enabled bit, and FALSE for an id with no
// row (fail-closed), against the real sessions service and a real libSQL db.
// @subject packages/server/src/domain/sessions/verbs/resolve-user-enabled.ts

import { users } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createResolveUserEnabled } from "@orb/server/domain/sessions";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";
import { makeService } from "../_support.ts";

test("answers the live enabled bit, follows a disable, and fails closed on a missing row", async () => {
  const db = await freshDb();
  const { svc } = makeService(db);
  const userId = await svc.ensureUser(castId<Handle>("member"));
  const resolve = createResolveUserEnabled(svc);

  expect(await resolve(userId)).toBe(true);
  await db.update(users).set({ enabled: false }).where(eq(users.id, userId));
  expect(await resolve(userId)).toBe(false);
  expect(await resolve(castId<UserId>("user_gone"))).toBe(false);
});
