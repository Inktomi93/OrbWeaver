// verb: list — owner-scoped, secret-free, ordered (provider, createdAt). Cross-owner isolation.

import { createCredentialsService } from "@orb/server/domain/credentials";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("list", () => {
  test("returns only the caller's credentials, with no secret fields", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const alice = await seedUser(db, { id: "user_a", role: "user" });
    const bob = await seedUser(db, { id: "user_b", role: "user" });
    await svc.add({ principal: principal(alice), provider: "openrouter", key: "ka" });
    await svc.add({ principal: principal(bob), provider: "openrouter", key: "kb" });

    const rows = await svc.list({ principal: principal(alice) });
    expect(rows).toHaveLength(1);
    const view = rows[0];
    expect(view).not.toHaveProperty("ciphertext");
    expect(view).not.toHaveProperty("apiKey");
  });

  test("empty for a user with no credentials", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o", role: "user" });
    expect(await svc.list({ principal: principal(owner) })).toEqual([]);
  });
});
