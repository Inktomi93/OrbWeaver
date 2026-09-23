// verb: markRevoked — the RUNNER-INTERNAL revoke (no ownership check; the id IS the access token).

import { userCredentials } from "@orb/db";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, seedCredential } from "../_support.ts";

describe("markRevoked", () => {
  test("stamps revoked_at + revoked_reason under the OWNER scope (the runner path — no Principal, but not unscoped)", async () => {
    const db = await freshDb();
    const { svc, cred, owner } = await seedCredential(db, makeHarness(db));

    await svc.markRevoked({ ownerId: owner, credentialId: cred.id, reason: "provider 401" });
    const rows = await db.select().from(userCredentials).where(eq(userCredentials.id, cred.id));
    expect(rows[0]?.revokedAt).not.toBeNull();
  });

  test("audits credential.markRevoked as SYSTEM-attributed (actorUserId null — no owner proven)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const { svc, cred, owner } = await seedCredential(db, h);

    await svc.markRevoked({ ownerId: owner, credentialId: cred.id, reason: "provider 401" });
    const audit = h.audits.find((a) => a.entry.action === "credential.markRevoked");
    expect(audit?.entry).toMatchObject({ actorUserId: null, entityType: "credential", entityId: cred.id });
    expect(audit?.entry.metadata).toMatchObject({ reason: "provider 401", path: "runner" });
  });
});
