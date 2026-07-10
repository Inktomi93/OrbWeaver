// verb: markRevoked — the RUNNER-INTERNAL revoke (no ownership check; the id IS the access token).

import { userCredentials } from "@orb/db";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, seedCredential } from "../_support.ts";

describe("markRevoked", () => {
  test("stamps revoked_at by id, no ownership check (the runner path)", async () => {
    const db = await freshDb();
    const { svc, cred } = await seedCredential(db, makeHarness(db));

    await svc.markRevoked({ credentialId: cred.id, reason: "provider 401" });
    const rows = await db.select().from(userCredentials).where(eq(userCredentials.id, cred.id));
    expect(rows[0]?.revokedAt).not.toBeNull();
  });
});
