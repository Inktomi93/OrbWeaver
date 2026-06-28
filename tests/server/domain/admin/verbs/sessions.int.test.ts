// verbs: listSessions / revokeSession / revokeUserSessions — admin-gated delegation to the injected
// SessionAdminPort. Asserts the gate + the delegation (the fake port records the calls) + the audit on writes.

import { DomainForbiddenError } from "@orb/kit/errors";
import type { SessionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAdminService } from "@orb/server/domain/admin";
import { describe, expect, test } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("admin session verbs", () => {
  test("listSessions delegates to the port for an admin", async () => {
    const db = await freshDb();
    const svc = createAdminService(makeHarness(db).ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: "adm" });
    const t = await seedUser(db, { id: "user_t", role: "user", handle: "t" });
    const list = await svc.listSessions({ principal: principal(admin, "admin"), userId: t });
    expect(Array.isArray(list)).toBe(true);
  });

  test("revokeSession delegates + audits", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(h.ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: "adm" });
    const sid = castId<SessionId>("session_abc");
    await svc.revokeSession({ principal: principal(admin, "admin"), sessionId: sid });
    expect(h.revokedSessions).toContain(sid);
    expect(h.audits.map((a) => a.entry.action)).toContain("admin.revokeSession");
  });

  test("revokeUserSessions returns the revoked count + audits", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(h.ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: "adm" });
    const t = await seedUser(db, { id: "user_t", role: "user", handle: "t" });
    const result = await svc.revokeUserSessions({
      principal: principal(admin, "admin"),
      userId: t,
    });
    expect(result.revoked).toBeGreaterThan(0);
    expect(h.revokedAll).toContain(t);
    expect(h.audits.map((a) => a.entry.action)).toContain("admin.revokeUserSessions");
  });

  test("a plain user is denied on every session verb", async () => {
    const db = await freshDb();
    const svc = createAdminService(makeHarness(db).ctx);
    const u = await seedUser(db, { id: "user_u", role: "user", handle: "u" });
    const p = principal(u, "user");
    await expect(svc.listSessions({ principal: p, userId: u })).rejects.toThrow(
      DomainForbiddenError,
    );
    await expect(
      svc.revokeSession({ principal: p, sessionId: castId<SessionId>("session_x") }),
    ).rejects.toThrow(DomainForbiddenError);
    await expect(svc.revokeUserSessions({ principal: p, userId: u })).rejects.toThrow(
      DomainForbiddenError,
    );
  });
});
