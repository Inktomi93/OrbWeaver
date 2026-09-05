// verb: resetPassword — admin-gated; weak_password floor, existence-before-audit, and the credential-change
// kick-tail (revoke all sessions). On a missing id it throws AND writes no audit row and no revoke.
//
// #1691 — the credential write, its audit row and the kick are ONE batch, so three of these cases are about
// what must NOT survive a broken tail: a failed kick must leave the OLD password (the pre-fix behaviour left
// the new one live beside un-revoked sessions), and a failed audit write must leave both the password and
// the sessions untouched. The fourth is the ORDERING pin — a reset for a target with no live sessions still
// writes its audit row, which is what breaks if the kick is ever moved between the write and the
// `changes()`-guarded audit insert.

import { users } from "@orb/db";
import { DomainForbiddenError, DomainNotFoundError } from "@orb/kit/errors";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAdminService } from "@orb/server/domain/admin";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import {
  auditActions,
  liveSessionIds,
  makeHarness,
  principal,
  seedAdminCaller,
  seedLiveSession,
  seedUser,
  withBrokenAudit,
  withBrokenKick,
} from "../_support.ts";

const NEW_PASSWORD = "brand-new-secret";

describe("resetPassword", () => {
  test("an admin resets the hash and the kick-tail revokes sessions (audited)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(h.ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: castId<Handle>("adm") });
    const target = await seedUser(db, {
      id: "user_t",
      role: "user",
      handle: castId<Handle>("t"),
      passwordHash: "old",
    });

    await seedLiveSession(db, target);

    await svc.resetPassword({
      principal: principal(admin, "admin"),
      userId: target,
      password: NEW_PASSWORD,
    });
    const rows = await db.select().from(users).where(eq(users.id, target));
    expect(rows[0]?.passwordHash).toBe(`scrypt$test$${NEW_PASSWORD}`);
    // The kick is a DB write inside the same batch — assert the ROWS, not a recorded port call.
    expect(await liveSessionIds(db, target)).toHaveLength(0);
    expect(h.evictedSockets).toContain(target);
    expect(await auditActions(db)).toEqual(["admin.resetPassword"]);
  });

  test("a short password is rejected (weak_password)", async () => {
    const db = await freshDb();
    const { svc, admin } = await seedAdminCaller(db);
    const target = await seedUser(db, { id: "user_t", role: "user", handle: castId<Handle>("t") });
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
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: castId<Handle>("adm") });
    await expect(
      svc.resetPassword({
        principal: principal(admin, "admin"),
        userId: castId<UserId>("user_ghost"),
        password: NEW_PASSWORD,
      }),
    ).rejects.toThrow(DomainNotFoundError);
    expect(await auditActions(db)).toHaveLength(0);
    expect(h.evictedSockets).toHaveLength(0);
  });

  test("a plain user is denied", async () => {
    const db = await freshDb();
    const svc = createAdminService(makeHarness(db).ctx);
    const u = await seedUser(db, { id: "user_u", role: "user", handle: castId<Handle>("u") });
    const t = await seedUser(db, { id: "user_t", role: "user", handle: castId<Handle>("t") });
    await expect(svc.resetPassword({ principal: principal(u, "user"), userId: t, password: NEW_PASSWORD })).rejects.toThrow(DomainForbiddenError);
  });

  // D17 takeover close: a delegated (non-owner) admin resetting the owner's password would be owner-account
  // takeover under AUTH_MODE=local. RED-first — this SUCCEEDED before the guard.
  test("a delegated admin cannot reset the OWNER's password (cannot_modify_owner)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(h.ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: castId<Handle>("adm") });
    const owner = await seedUser(db, { id: "user_own", role: "owner", handle: castId<Handle>("own"), passwordHash: "owner-hash" });

    await expect(svc.resetPassword({ principal: principal(admin, "admin"), userId: owner, password: NEW_PASSWORD })).rejects.toMatchObject({
      code: "cannot_modify_owner",
    });
    // The owner's hash is untouched, no session kick, no audit row.
    const rows = await db.select().from(users).where(eq(users.id, owner));
    expect(rows[0]?.passwordHash).toBe("owner-hash");
    expect(h.evictedSockets).toHaveLength(0);
    expect(await auditActions(db)).toHaveLength(0);
  });

  // FENCE (must pass BOTH before and after the guard): the owner rotating their OWN password is the sole
  // in-app password-write path and stays open — the scoped guard blocks NON-owner callers, not the owner.
  test("the owner CAN reset their own password (self-rotation stays open)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(h.ctx);
    const owner = await seedUser(db, { id: "user_own", role: "owner", handle: castId<Handle>("own"), passwordHash: "old-owner-hash" });

    await seedLiveSession(db, owner);

    await svc.resetPassword({ principal: principal(owner, "owner"), userId: owner, password: NEW_PASSWORD });

    const rows = await db.select().from(users).where(eq(users.id, owner));
    expect(rows[0]?.passwordHash).toBe(`scrypt$test$${NEW_PASSWORD}`);
    expect(await liveSessionIds(db, owner)).toHaveLength(0);
    expect(await auditActions(db)).toEqual(["admin.resetPassword"]);
  });

  // #1691 RED-FIRST — before the batch this left the NEW password committed with every OLD session still
  // live, and told the admin the reset had FAILED. The kick and the credential are one atomic write now.
  test("a failing session kick leaves the OLD password and every session live (no audit row)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(withBrokenKick(h.ctx, db));
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: castId<Handle>("adm") });
    const target = await seedUser(db, { id: "user_t", role: "user", handle: castId<Handle>("t"), passwordHash: "old" });
    const live = await seedLiveSession(db, target);

    await expect(svc.resetPassword({ principal: principal(admin, "admin"), userId: target, password: NEW_PASSWORD })).rejects.toThrow();

    const rows = await db.select().from(users).where(eq(users.id, target));
    expect(rows[0]?.passwordHash).toBe("old");
    expect(await liveSessionIds(db, target)).toEqual([live]);
    expect(await auditActions(db)).toHaveLength(0);
  });

  // #1691 RED-FIRST — the audit tail's production posture is `logAudit`, which SWALLOWS: a dead audit channel
  // used to rotate the credential and return SUCCESS with no forensic row at all. On the atomic channel an
  // audit failure takes the credential write down with it.
  test("a failing audit write leaves the OLD password and every session live", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(withBrokenAudit(h.ctx, db));
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: castId<Handle>("adm") });
    const target = await seedUser(db, { id: "user_t", role: "user", handle: castId<Handle>("t"), passwordHash: "old" });
    const live = await seedLiveSession(db, target);

    await expect(svc.resetPassword({ principal: principal(admin, "admin"), userId: target, password: NEW_PASSWORD })).rejects.toThrow();

    const rows = await db.select().from(users).where(eq(users.id, target));
    expect(rows[0]?.passwordHash).toBe("old");
    expect(await liveSessionIds(db, target)).toEqual([live]);
    expect(await auditActions(db)).toHaveLength(0);
  });

  // #1691 ORDERING PIN — the audit insert is guarded by SQLite `changes()`, which reports the statement
  // IMMEDIATELY before it. A signed-out target's kick legitimately revokes 0 rows, so if the kick is ever
  // moved between the credential write and the audit insert, THIS reset silently loses its audit row.
  test("a reset for a target with NO live sessions still writes its audit row", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(h.ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: castId<Handle>("adm") });
    const target = await seedUser(db, { id: "user_t", role: "user", handle: castId<Handle>("t"), passwordHash: "old" });

    await svc.resetPassword({ principal: principal(admin, "admin"), userId: target, password: NEW_PASSWORD });

    expect(await auditActions(db)).toEqual(["admin.resetPassword"]);
    const rows = await db.select().from(users).where(eq(users.id, target));
    expect(rows[0]?.passwordHash).toBe(`scrypt$test$${NEW_PASSWORD}`);
  });
});
