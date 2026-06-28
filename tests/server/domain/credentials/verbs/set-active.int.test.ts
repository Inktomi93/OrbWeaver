// verb: setActive — promote one credential, demote the prior active in the slot; ownership-checked.

import { createCredentialsService } from "@orb/server/domain/credentials";
import { describe, expect, test } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("setActive", () => {
  test("promotes the target and demotes the previously-active row in the same slot", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    const first = await svc.add({
      principal: principal(owner),
      provider: "openrouter",
      key: "k1",
      label: "a",
    });
    const second = await svc.add({
      principal: principal(owner),
      provider: "openrouter",
      key: "k2",
      label: "b",
    });
    expect(first.active).toBe(true);
    expect(second.active).toBe(false);

    const promoted = await svc.setActive({ principal: principal(owner), credentialId: second.id });
    expect(promoted.active).toBe(true);

    const rows = await svc.list({ principal: principal(owner) });
    const byId = new Map(rows.map((r) => [r.id, r.active]));
    expect(byId.get(second.id)).toBe(true);
    expect(byId.get(first.id)).toBe(false);
  });

  test("a not-owned credential id collapses to CredentialsNotFoundError (400, no existence leak)", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const alice = await seedUser(db, { id: "user_a", role: "user" });
    const bob = await seedUser(db, { id: "user_b", role: "user" });
    const aliceCred = await svc.add({
      principal: principal(alice),
      provider: "openrouter",
      key: "k",
    });
    await expect(
      svc.setActive({ principal: principal(bob), credentialId: aliceCred.id }),
    ).rejects.toMatchObject({ code: "credential_not_found" });
  });
});
