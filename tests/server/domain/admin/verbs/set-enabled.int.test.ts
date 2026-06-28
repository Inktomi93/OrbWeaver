// verb: setEnabled — admin-gated; cannot_disable_self, owner-immutability, existence-before-audit, and the
// disable kick-tail (revoke all sessions). The existence-before-audit invariant is the high-value one: a
// write to a missing id must throw AND write NO audit row (no forensic lie).

import { users } from "@orb/db";
import { DomainForbiddenError, DomainNotFoundError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAdminService } from "@orb/server/domain/admin";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("setEnabled", () => {
  test("an admin disables a user and the kick-tail revokes their sessions (audited)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(h.ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: "adm" });
    const target = await seedUser(db, { id: "user_t", role: "user", handle: "t" });

    const updated = await svc.setEnabled({
      principal: principal(admin, "admin"),
      userId: target,
      enabled: false,
    });
    expect(updated.enabled).toBe(false);
    expect(h.revokedAll).toContain(target);
    expect(h.audits.map((a) => a.entry.action)).toContain("admin.setEnabled");
  });

  test("an actor cannot disable their own account (cannot_disable_self) — no write, no revoke", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(h.ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: "adm" });
    await expect(
      svc.setEnabled({ principal: principal(admin, "admin"), userId: admin, enabled: false }),
    ).rejects.toMatchObject({ code: "cannot_disable_self" });
    expect(h.revokedAll).toHaveLength(0);
    const rows = await db.select().from(users).where(eq(users.id, admin));
    expect(rows[0]?.enabled).toBe(true);
  });

  test("the owner cannot be disabled (cannot_modify_owner)", async () => {
    const db = await freshDb();
    const svc = createAdminService(makeHarness(db).ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: "adm" });
    const owner = await seedUser(db, { id: "user_owner", role: "owner", handle: "owner" });
    await expect(
      svc.setEnabled({ principal: principal(admin, "admin"), userId: owner, enabled: false }),
    ).rejects.toMatchObject({ code: "cannot_modify_owner" });
  });

  test("a write to a missing id throws AND writes NO audit row (existence-before-audit)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(h.ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: "adm" });
    await expect(
      svc.setEnabled({
        principal: principal(admin, "admin"),
        userId: castId<UserId>("user_ghost"),
        enabled: false,
      }),
    ).rejects.toThrow(DomainNotFoundError);
    expect(h.audits).toHaveLength(0);
  });

  test("a plain user is denied", async () => {
    const db = await freshDb();
    const svc = createAdminService(makeHarness(db).ctx);
    const u = await seedUser(db, { id: "user_u", role: "user", handle: "u" });
    const t = await seedUser(db, { id: "user_t", role: "user", handle: "t" });
    await expect(
      svc.setEnabled({ principal: principal(u, "user"), userId: t, enabled: false }),
    ).rejects.toThrow(DomainForbiddenError);
  });
});
