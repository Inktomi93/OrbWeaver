// verb: createUser — admin-gated mint of a loginable local human. Validation reasons (invalid_handle,
// weak_password, cannot_grant_owner), the password is hashed (and never surfaces in the view), and a
// duplicate handle is rejected as user_exists.

import { userConnections, users } from "@orb/db";
import { DomainForbiddenError } from "@orb/kit/errors";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAdminService } from "@orb/server/domain/admin";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { auditActions, makeHarness, principal, seedAdminCaller, seedUser, withBrokenAudit } from "../_support.ts";

const GOOD_PASSWORD = "correct-horse";

describe("createUser", () => {
  test("an admin mints a user; the password is hashed and absent from the view (audited)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(h.ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: castId<Handle>("adm") });

    const view = await svc.createUser({
      principal: principal(admin, "admin"),
      handle: castId<Handle>("newbie"),
      password: GOOD_PASSWORD,
    });
    expect(view.handle).toBe("newbie");
    expect(view.role).toBe("user");
    expect(Object.keys(view)).not.toContain("passwordHash");

    const rows = await db.select().from(users).where(eq(users.id, view.id));
    expect(rows[0]?.passwordHash).toBe(`scrypt$test$${GOOD_PASSWORD}`);
    expect(await auditActions(db)).toEqual(["admin.createUser"]);
  });

  // #2481 — the admin mint is the third user-create site the local-light convenience seed rides (inference
  // program §7.2 / §5.3b). It runs AFTER the audited batch commits, never inside it: a seed failure must not
  // un-create an account. The seed is an INJECTED op — `domain/admin` may not import `domain/connection`.
  test("the minted account carries its local-light vector floor (#2481)", async () => {
    const db = await freshDb();
    const { svc, admin } = await seedAdminCaller(db);
    const view = await svc.createUser({ principal: principal(admin, "admin"), handle: castId<Handle>("newbie"), password: GOOD_PASSWORD });
    expect(await db.select().from(userConnections).where(eq(userConnections.ownerId, view.id))).toHaveLength(2);
  });

  test("an empty handle is rejected (invalid_handle)", async () => {
    const db = await freshDb();
    const { svc, admin } = await seedAdminCaller(db);
    await expect(
      svc.createUser({
        principal: principal(admin, "admin"),
        handle: castId<Handle>("   "),
        password: GOOD_PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "invalid_handle" });
  });

  test("a short password is rejected (weak_password)", async () => {
    const db = await freshDb();
    const { svc, admin } = await seedAdminCaller(db);
    await expect(svc.createUser({ principal: principal(admin, "admin"), handle: castId<Handle>("x"), password: "short" })).rejects.toMatchObject({
      code: "weak_password",
    });
  });

  test("even the OWNER cannot mint a second owner (cannot_grant_owner — the single-owner invariant)", async () => {
    const db = await freshDb();
    const svc = createAdminService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_owner", role: "owner", handle: castId<Handle>("owner") });
    // The owner passes the authority gate (requireOwner) but is still refused at validation — a SECOND
    // owner can never be minted here (D40 single-owner; ownership transfer is out of scope).
    await expect(
      svc.createUser({
        principal: principal(owner, "owner"),
        handle: castId<Handle>("x"),
        password: GOOD_PASSWORD,
        role: "owner",
      }),
    ).rejects.toMatchObject({ code: "cannot_grant_owner" });
  });

  test("a delegated admin CANNOT mint an admin — fail-closed forbidden (closes the create/set-role asymmetry)", async () => {
    const db = await freshDb();
    const { svc, admin } = await seedAdminCaller(db);
    // The escalation vector: `setRole` is owner-only, so an admin creating a role:"admin" account outright
    // would bypass it. `createUser` now gates `role:"admin"` on requireOwner — the admin is refused.
    await expect(
      svc.createUser({
        principal: principal(admin, "admin"),
        handle: castId<Handle>("shadow-admin"),
        password: GOOD_PASSWORD,
        role: "admin",
      }),
    ).rejects.toThrow(DomainForbiddenError);
    // Nothing was written — the handle is free.
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.handle, castId<Handle>("shadow-admin")));
    expect(rows).toHaveLength(0);
  });

  test("a delegated admin CANNOT mint an owner — forbidden before the owner-refusal even runs", async () => {
    const db = await freshDb();
    const { svc, admin } = await seedAdminCaller(db);
    await expect(
      svc.createUser({
        principal: principal(admin, "admin"),
        handle: castId<Handle>("x"),
        password: GOOD_PASSWORD,
        role: "owner",
      }),
    ).rejects.toThrow(DomainForbiddenError);
  });

  test("the OWNER mints an admin (the owner-only elevation path succeeds, audited)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(h.ctx);
    const owner = await seedUser(db, { id: "user_owner", role: "owner", handle: castId<Handle>("owner") });

    const view = await svc.createUser({
      principal: principal(owner, "owner"),
      handle: castId<Handle>("trusted"),
      password: GOOD_PASSWORD,
      role: "admin",
    });
    expect(view.role).toBe("admin");
    expect(await auditActions(db)).toEqual(["admin.createUser"]);
    // The row landed as a real admin human.
    const rows = await db.select().from(users).where(eq(users.id, view.id));
    expect(rows[0]?.role).toBe("admin");
    expect(rows[0]?.kind).toBe("human");
  });

  test("a duplicate handle is rejected (user_exists)", async () => {
    const db = await freshDb();
    const { svc, admin } = await seedAdminCaller(db);
    await seedUser(db, { id: "user_dup", role: "user", handle: castId<Handle>("taken") });
    await expect(
      svc.createUser({
        principal: principal(admin, "admin"),
        handle: castId<Handle>("taken"),
        password: GOOD_PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "user_exists" });
  });

  test("a look-alike of a held handle is rejected (user_exists), and a genuinely different handle is minted", async () => {
    const db = await freshDb();
    const { svc, admin } = await seedAdminCaller(db);
    await seedUser(db, { id: "user_host", role: "user", handle: castId<Handle>("host") });
    await expect(svc.createUser({ principal: principal(admin, "admin"), handle: castId<Handle>("h0st"), password: GOOD_PASSWORD })).rejects.toMatchObject({
      code: "user_exists",
    });
    await expect(svc.createUser({ principal: principal(admin, "admin"), handle: castId<Handle>("hosts"), password: GOOD_PASSWORD })).resolves.toMatchObject({
      handle: "hosts",
    });
  });

  test("a mixed-script handle is rejected (invalid_handle); a single-script non-Latin one is minted", async () => {
    const db = await freshDb();
    const { svc, admin } = await seedAdminCaller(db);
    await expect(svc.createUser({ principal: principal(admin, "admin"), handle: castId<Handle>("hσst"), password: GOOD_PASSWORD })).rejects.toMatchObject({
      code: "invalid_handle",
    });
    await expect(svc.createUser({ principal: principal(admin, "admin"), handle: castId<Handle>("Дмитрий"), password: GOOD_PASSWORD })).resolves.toMatchObject({
      handle: "Дмитрий",
    });
  });

  test("a handle whose key is blank (only zero-width or blank characters) is rejected (invalid_handle)", async () => {
    const db = await freshDb();
    const { svc, admin } = await seedAdminCaller(db);
    for (const blank of ["​​", "⁠", "　"]) {
      await expect(
        svc.createUser({ principal: principal(admin, "admin"), handle: castId<Handle>(blank), password: GOOD_PASSWORD }),
        JSON.stringify(blank),
      ).rejects.toMatchObject({
        code: "invalid_handle",
      });
    }
  });

  test("a plain user is denied", async () => {
    const db = await freshDb();
    const svc = createAdminService(makeHarness(db).ctx);
    const u = await seedUser(db, { id: "user_u", role: "user", handle: castId<Handle>("u") });
    await expect(svc.createUser({ principal: principal(u, "user"), handle: castId<Handle>("x"), password: GOOD_PASSWORD })).rejects.toThrow(
      DomainForbiddenError,
    );
  });
  // #1691 RED-FIRST — the mint used to run first and audit afterwards, so a rejecting audit left a LOGINABLE
  // account behind while the endpoint reported failure (and `logAudit`'s swallow made the same state report
  // SUCCESS in production). Nothing is minted now.
  test("a failing audit write mints NO account", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(withBrokenAudit(h.ctx, db));
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: castId<Handle>("adm") });

    await expect(svc.createUser({ principal: principal(admin, "admin"), handle: castId<Handle>("newbie"), password: GOOD_PASSWORD })).rejects.toThrow();

    expect(
      await db
        .select()
        .from(users)
        .where(eq(users.handle, castId<Handle>("newbie"))),
    ).toHaveLength(0);
    expect(await auditActions(db)).toHaveLength(0);
  });
});
