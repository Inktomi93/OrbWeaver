// verb: resetPassword — admin-gated; weak_password floor, existence-before-audit, and the credential-change
// kick-tail (revoke all sessions). On a missing id it throws AND writes no audit row and no revoke.

import { users } from "@orb/db";
import { DomainForbiddenError, DomainNotFoundError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAdminService } from "@orb/server/domain/admin";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

const NEW_PASSWORD = "brand-new-secret";

describe("resetPassword", () => {
  test("an admin resets the hash and the kick-tail revokes sessions (audited)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(h.ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: "adm" });
    const target = await seedUser(db, {
      id: "user_t",
      role: "user",
      handle: "t",
      passwordHash: "old",
    });

    await svc.resetPassword({
      principal: principal(admin, "admin"),
      userId: target,
      password: NEW_PASSWORD,
    });
    const rows = await db.select().from(users).where(eq(users.id, target));
    expect(rows[0]?.passwordHash).toBe(`scrypt$test$${NEW_PASSWORD}`);
    expect(h.revokedAll).toContain(target);
    expect(h.audits.map((a) => a.entry.action)).toContain("admin.resetPassword");
  });

  test("a short password is rejected (weak_password)", async () => {
    const db = await freshDb();
    const svc = createAdminService(makeHarness(db).ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: "adm" });
    const target = await seedUser(db, { id: "user_t", role: "user", handle: "t" });
    await expect(
      svc.resetPassword({
        principal: principal(admin, "admin"),
        userId: target,
        password: "short",
      }),
    ).rejects.toMatchObject({ code: "weak_password" });
  });

  test("a missing id throws, writes no audit row, and revokes nothing", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(h.ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: "adm" });
    await expect(
      svc.resetPassword({
        principal: principal(admin, "admin"),
        userId: castId<UserId>("user_ghost"),
        password: NEW_PASSWORD,
      }),
    ).rejects.toThrow(DomainNotFoundError);
    expect(h.audits).toHaveLength(0);
    expect(h.revokedAll).toHaveLength(0);
  });

  test("a plain user is denied", async () => {
    const db = await freshDb();
    const svc = createAdminService(makeHarness(db).ctx);
    const u = await seedUser(db, { id: "user_u", role: "user", handle: "u" });
    const t = await seedUser(db, { id: "user_t", role: "user", handle: "t" });
    await expect(
      svc.resetPassword({ principal: principal(u, "user"), userId: t, password: NEW_PASSWORD }),
    ).rejects.toThrow(DomainForbiddenError);
  });
});
