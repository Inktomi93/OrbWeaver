// persistence: loadUser / listUsers / userCols — the secret-free admin read surface. The load-bearing
// assertion: the projection NEVER includes passwordHash (invariant #5), against a real db.

import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { listUsers, loadUser } from "../../../../../packages/server/src/domain/admin/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { seedUser } from "../_support.ts";

describe("admin persistence queries", () => {
  test("loadUser returns a secret-free view, or undefined for a missing id", async () => {
    const db = await freshDb();
    const id = await seedUser(db, {
      id: "user_a",
      role: "admin",
      handle: "a",
      passwordHash: "scrypt$x$y",
    });
    const view = await loadUser(db, id);
    expect(view?.handle).toBe("a");
    expect(view?.role).toBe("admin");
    expect(Object.keys(view ?? {})).not.toContain("passwordHash");
    expect(await loadUser(db, castId<UserId>("user_ghost"))).toBeUndefined();
  });

  test("listUsers returns every user, secret-free", async () => {
    const db = await freshDb();
    await seedUser(db, { id: "user_owner", role: "owner", handle: "owner" });
    await seedUser(db, { id: "user_b", role: "user", handle: "b", passwordHash: "scrypt$p$q" });
    const all = await listUsers(db);
    expect(all).toHaveLength(2);
    for (const row of all) {
      expect(Object.keys(row)).not.toContain("passwordHash");
    }
  });
});
