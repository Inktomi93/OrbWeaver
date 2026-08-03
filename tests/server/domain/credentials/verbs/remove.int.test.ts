// verb: remove — delete a credential (ownership-scoped).

import { createCredentialsService } from "@orb/server/domain/credentials";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedCredential, seedUser } from "../_support.ts";

describe("remove", () => {
  test("deletes the owner's credential (gone from the list)", async () => {
    const db = await freshDb();
    const { svc, owner, cred } = await seedCredential(db, makeHarness(db));
    await svc.remove({ principal: principal(owner), credentialId: cred.id });
    expect(await svc.list({ principal: principal(owner) })).toHaveLength(0);
  });

  test("a real delete audits credential.remove attributed to the owner (PD-142)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const { svc, owner, cred } = await seedCredential(db, h);
    await svc.remove({ principal: principal(owner), credentialId: cred.id });
    const audit = h.audits.find((a) => a.entry.action === "credential.remove");
    expect(audit?.entry).toMatchObject({ actorUserId: owner, entityType: "credential", entityId: cred.id });
  });

  test("a not-owned id collapses to CredentialsNotFoundError (no remove audit)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCredentialsService(h.ctx);
    const alice = await seedUser(db, { id: "user_a", role: "user" });
    const bob = await seedUser(db, { id: "user_b", role: "user" });
    const cred = await svc.add({ principal: principal(alice), provider: "openrouter", key: "k" });
    await expect(svc.remove({ principal: principal(bob), credentialId: cred.id })).rejects.toMatchObject({ code: "credential_not_found" });
    expect(h.audits.some((a) => a.entry.action === "credential.remove")).toBe(false);
  });
});
