// @subject tests/support/node/factories/principal.ts
import { users } from "@orb/db";
import { isAdmin, isOwner } from "@orb/server/domain/admin";
import { eq } from "drizzle-orm";
import { expect, test } from "../fixtures.ts";
import { createServerHarness } from "../server.ts";
import { principal } from "./principal.ts";

test("the canonical internal Principal delegate preserves row identity, fresh role data and D135's enabled-blind fallback semantics", async () => {
  await using root = await createServerHarness({ authConfig: { mode: "local", fallback: "deny" } });
  const row = await root.actor({ role: "admin" });
  const first = await principal(root, row.id);
  expect(first).toMatchObject({ userId: row.id, handle: row.handle, externalId: row.externalId, via: "fallback" });
  expect(isAdmin(first)).toBe(true);
  expect(isOwner(first)).toBe(false);
  expect(Object.isFrozen(first.role)).toBe(true);
  expect(Reflect.ownKeys(first.role)).toEqual([]);
  expect(await (await root.internalCallerFor(row.id)).sessions.me()).toEqual({ userId: row.id, handle: row.handle, globalRole: "admin" });
  await (await root.internalCallerFor(root.ownerId)).admin.setRole({ userId: row.id, role: "user" });
  const changed = await principal(root, row.id);
  expect(isAdmin(changed)).toBe(false);
  expect(isAdmin(first)).toBe(true);
  await root.db.update(users).set({ enabled: false }).where(eq(users.id, row.id));
  expect(await principal(root, row.id)).toMatchObject({ userId: row.id, via: "fallback" });
  const response = await root.http.request("/api/trpc/sessions.me");
  expect(response.status).toBe(401);
  await response.arrayBuffer();
});
