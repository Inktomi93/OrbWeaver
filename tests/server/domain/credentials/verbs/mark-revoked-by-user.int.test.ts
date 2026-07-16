// verb: markRevokedByUser — the USER-FACING revoke (ADDS the ownership check, unlike markRevoked).

import { userCredentials } from "@orb/db";
import { createCredentialsService } from "@orb/server/domain/credentials";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedCredential, seedUser } from "../_support.ts";

describe("markRevokedByUser", () => {
  test("the owner revokes their own credential", async () => {
    const db = await freshDb();
    const { svc, owner, cred } = await seedCredential(db, makeHarness(db));
    await svc.markRevokedByUser({ principal: principal(owner), credentialId: cred.id });
    const rows = await db.select().from(userCredentials).where(eq(userCredentials.id, cred.id));
    expect(rows[0]?.revokedAt).not.toBeNull();
  });

  test("a not-owned id is refused (CredentialsNotFoundError) — unlike the runner path", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const alice = await seedUser(db, { id: "user_a", role: "user" });
    const bob = await seedUser(db, { id: "user_b", role: "user" });
    const cred = await svc.add({ principal: principal(alice), provider: "openrouter", key: "k" });
    await expect(svc.markRevokedByUser({ principal: principal(bob), credentialId: cred.id })).rejects.toMatchObject({ code: "credential_not_found" });
  });
});
