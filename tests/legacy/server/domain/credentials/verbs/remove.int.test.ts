// verb: remove — delete a credential (ownership-scoped).
// @subject packages/server/src/domain/credentials/verbs/remove.ts

import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { createCredentialsService } from "#server/domain/credentials/index.ts";
import { makeHarness, principal, seedCredential, seedUser } from "../_support.ts";

describe("remove", () => {
  test("deletes the owner's credential (gone from the list)", async () => {
    const db = await freshDb();
    const { svc, owner, cred } = await seedCredential(db, makeHarness(db));
    await svc.remove({ principal: await principal(db, owner), credentialId: cred.id });
    expect(await svc.list({ principal: await principal(db, owner) })).toHaveLength(0);
  });

  test("a real delete audits credential.remove attributed to the owner", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const { svc, owner, cred } = await seedCredential(db, h);
    await svc.remove({ principal: await principal(db, owner), credentialId: cred.id });
    const audit = h.audits.find((a) => a.entry.action === "credential.remove");
    expect(audit?.entry).toMatchObject({ actorUserId: owner, entityType: "credential", entityId: cred.id });
  });

  test("a not-owned id collapses to CredentialsNotFoundError (no remove audit)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCredentialsService(h.ctx);
    const alice = await seedUser(db, { id: "user_a", role: "user" });
    const bob = await seedUser(db, { id: "user_b", role: "user" });
    const cred = await svc.add({ principal: await principal(db, alice), provider: "openrouter", key: "k" });
    await expect(svc.remove({ principal: await principal(db, bob), credentialId: cred.id })).rejects.toMatchObject({ code: "credential_not_found" });
    expect(h.audits.some((a) => a.entry.action === "credential.remove")).toBe(false);
  });
});
