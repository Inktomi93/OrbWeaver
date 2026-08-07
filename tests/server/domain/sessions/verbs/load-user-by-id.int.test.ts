// sessions.loadUserById (PD-73) — the frozen-host → Principal bridge read. Proves against a real libSQL db:
// the live role/handle/externalId are re-read from the row (a role change propagates), an unknown id is
// null, and a DISABLED row still RESOLVES while REPORTING `enabled:false`. That pair is the contract: the
// read gates nothing, so the frozen-host bridge keeps a disabled host's real role authoritative for the D17
// owner-gates while the auth seam's REQUEST arm has the fact it needs to refuse the caller (D135 amendment).
// A row that resolved but hid `enabled` would force the seam into a second query or a second spelling.

import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId, newId } from "@orb/kit/ids";
import type { SessionsService } from "@orb/server/domain/sessions";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeService } from "../_support.ts";

let db: Db;
let svc: SessionsService;

beforeEach(async () => {
  db = await freshDb();
  ({ svc } = makeService(db));
});

describe("sessions.loadUserById", () => {
  test("returns the row's LIVE principal-fields (a role change propagates)", async () => {
    const userId = await svc.ensureUser(castId<Handle>("alice"));
    expect(await svc.loadUserById(userId)).toEqual({
      role: "user",
      handle: "alice",
      externalId: null,
      enabled: true,
    });

    await db.update(users).set({ role: "admin" }).where(eq(users.id, userId));
    expect((await svc.loadUserById(userId))?.role).toBe("admin");
  });

  test("an unknown id resolves to null (the caller degrades fail-closed)", async () => {
    expect(await svc.loadUserById(newId<UserId>())).toBeNull();
  });

  test("a DISABLED row still resolves, and REPORTS enabled:false for the caller that must gate", async () => {
    const userId = await svc.ensureUser(castId<Handle>("alice"));
    await db.update(users).set({ enabled: false }).where(eq(users.id, userId));

    const fields = await svc.loadUserById(userId);

    // Resolves: the frozen-host bridge needs the role of a host who may be offline or disabled.
    expect(fields?.handle).toBe("alice");
    expect(fields?.role).toBe("user");
    // …and reports: the auth seam's request arm refuses on exactly this bit (D135 amendment).
    expect(fields?.enabled).toBe(false);
  });
});
