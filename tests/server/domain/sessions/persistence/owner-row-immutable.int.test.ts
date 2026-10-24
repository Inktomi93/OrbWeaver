// An existing owner is immutable under group policy and a second group owner becomes user: an impostor
// subject leaves the owner's stored row byte-for-byte unchanged.

import { users } from "@orb/db";

import { expect, test } from "@orb/testkit/node";
import { readAccounts } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";
import { headerIdentity, me, rootForPolicy } from "../role-policy-config.fixtures.ts";

test("an existing owner is immutable and a second group owner becomes user, never admin", async () => {
  await using root = await rootForPolicy({ ["OWNER_GROUP"]: "owners", ["OIDC_ADMIN_GROUPS"]: "admins", ["OIDC_ALLOWED_GROUPS"]: "friends" });
  const owner = await root.principalFor(root.ownerId);
  expect(await me(root, headerIdentity("owners,admins", owner.handle, "first-owner-subject"))).toMatchObject({ role: "owner" });
  expect(await me(root, headerIdentity("", owner.handle, "first-owner-subject"))).toMatchObject({ role: "owner" });
  expect(await me(root, headerIdentity("owners,admins", "second-owner", "second-owner-subject"))).toMatchObject({ role: "user" });
  expect((await readAccounts(root)).filter(({ role }) => role === "owner").map(({ id }) => ({ id }))).toEqual([{ id: root.ownerId }]);
  const before = await root.db.select().from(users).where(eq(users.id, root.ownerId));
  expect(await me(root, headerIdentity("owners", owner.handle, "impostor-subject"))).toEqual({ authenticated: false, handle: null, role: null });
  expect(await root.db.select().from(users).where(eq(users.id, root.ownerId))).toEqual(before);
});
