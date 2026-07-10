// sessions.loadUserById (PD-73) — the frozen-host → Principal bridge read. Proves against a real libSQL db:
// the live role/handle/externalId are re-read from the row (a role change propagates), an unknown id is
// null, and a DISABLED row still resolves (not a login path — no enabled gate; the host's real role stays
// authoritative for the D17 owner-gates).

import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { newId } from "@orb/kit/ids";
import type { SessionsService } from "@orb/server/domain/sessions";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { makeService } from "../_support.ts";

let db: Db;
let svc: SessionsService;

beforeEach(async () => {
  db = await freshDb();
  ({ svc } = makeService(db));
});

describe("sessions.loadUserById", () => {
  test("returns the row's LIVE principal-fields (a role change propagates)", async () => {
    const userId = await svc.ensureUser("alice");
    expect(await svc.loadUserById(userId)).toEqual({
      role: "user",
      handle: "alice",
      externalId: null,
    });

    await db.update(users).set({ role: "admin" }).where(eq(users.id, userId));
    expect((await svc.loadUserById(userId))?.role).toBe("admin");
  });

  test("an unknown id resolves to null (the caller degrades fail-closed)", async () => {
    expect(await svc.loadUserById(newId<UserId>())).toBeNull();
  });

  test("a DISABLED row still resolves — not a login path, the real role stays authoritative", async () => {
    const userId = await svc.ensureUser("alice");
    await db.update(users).set({ enabled: false }).where(eq(users.id, userId));
    expect((await svc.loadUserById(userId))?.handle).toBe("alice");
  });
});
