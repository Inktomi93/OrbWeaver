// verb: setEnabled — admin-gated; cannot_disable_self, owner-immutability, existence-before-audit, and the
// disable kick-tail (revoke all sessions). The existence-before-audit invariant is the high-value one: a
// write to a missing id must throw AND write NO audit row (no forensic lie).

import { users } from "@orb/db";
import { DomainForbiddenError, DomainNotFoundError } from "@orb/kit/errors";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAdminService } from "@orb/server/domain/admin";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedAdminCaller, seedUser } from "../_support.ts";

describe("setEnabled", () => {
  test("an admin disables a user and the kick-tail revokes their sessions (audited)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(h.ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: castId<Handle>("adm") });
    const target = await seedUser(db, { id: "user_t", role: "user", handle: castId<Handle>("t") });

    const updated = await svc.setEnabled({
      principal: principal(admin, "admin"),
      userId: target,
      enabled: false,
    });
    expect(updated.enabled).toBe(false);
    expect(h.revokedAll).toContain(target);
    expect(h.audits.map((a) => a.entry.action)).toContain("admin.setEnabled");
    // W7b — NO `identityChanged` fan here, and this pin is the receipt for the omission the verb's header
    // argues (the staleness design §4.4.3 names this verb as a producer, so the next reader will want to
    // "fix" it). Two reasons: a disabled row is gated to null on every request, so the target holds no live
    // channel — the KICK TAIL above plus the entry wrapper's socket eviction is the real propagation edge —
    // and `enabled` is projected by no identity read (`sessions.me` is userId/handle/globalRole).
    expect(h.userEvents).toHaveLength(0);
  });

  test("an actor cannot disable their own account (cannot_disable_self) — no write, no revoke", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(h.ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: castId<Handle>("adm") });
    await expect(svc.setEnabled({ principal: principal(admin, "admin"), userId: admin, enabled: false })).rejects.toMatchObject({
      code: "cannot_disable_self",
    });
    expect(h.revokedAll).toHaveLength(0);
    const rows = await db.select().from(users).where(eq(users.id, admin));
    expect(rows[0]?.enabled).toBe(true);
  });

  test("the owner cannot be disabled (cannot_modify_owner)", async () => {
    const db = await freshDb();
    const { svc, admin } = await seedAdminCaller(db);
    const owner = await seedUser(db, { id: "user_owner", role: "owner", handle: castId<Handle>("owner") });
    await expect(svc.setEnabled({ principal: principal(admin, "admin"), userId: owner, enabled: false })).rejects.toMatchObject({
      code: "cannot_modify_owner",
    });
  });

  test("a write to a missing id throws AND writes NO audit row (existence-before-audit)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(h.ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: castId<Handle>("adm") });
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
    const u = await seedUser(db, { id: "user_u", role: "user", handle: castId<Handle>("u") });
    const t = await seedUser(db, { id: "user_t", role: "user", handle: castId<Handle>("t") });
    await expect(svc.setEnabled({ principal: principal(u, "user"), userId: t, enabled: false })).rejects.toThrow(DomainForbiddenError);
  });
});
