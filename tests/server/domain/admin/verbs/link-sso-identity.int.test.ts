// verb: linkSsoIdentity (B5) — the admin GATE + target refusals + the AUDITED-WRITE atomicity of the SSO
// bind. The harness wires the REAL sessions link capability over the same db (#1707), so every outcome here
// comes from real durable state rather than a forced fake: the bind-once LOGIC is proven in
// tests/server/domain/sessions/verbs/link-external-id.int.test.ts and the mapping is proven against rows.
// Load-bearing invariants: a plain user is REFUSED; the OWNER target is refused BEFORE anything is written
// (privilege belt); a subject-taken / target-bound claim maps to the typed code and writes NOTHING; and the
// bind ↔ audit row is a BICONDITIONAL — a planted audit failure leaves the row UNBOUND, a planted bind
// failure leaves no audit row, and a claim that bound nothing (already-linked) audits nothing.

import type { Db } from "@orb/db";
import { users } from "@orb/db";
import { DomainForbiddenError, DomainNotFoundError } from "@orb/kit/errors";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAdminService } from "@orb/server/domain/admin";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { ADMIN_OP_CODES } from "../../../../../packages/server/src/domain/admin/contract/errors.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { auditActions, makeHarness, principal, seedUser, withBrokenAudit, withBrokenBind } from "../_support.ts";

const EXT = castId<ExternalId>("authentik|subject-123");
const OTHER_EXT = castId<ExternalId>("authentik|subject-999");

/** The subject actually stamped on the row — the durable half of every assertion below. */
async function externalIdOf(db: Db, userId: UserId): Promise<string | null> {
  const row = (await db.select({ externalId: users.externalId }).from(users).where(eq(users.id, userId)))[0];
  return row?.externalId ?? null;
}

/** Bind `externalId` onto `userId` directly, to set up the already-bound / subject-taken states. */
async function seedBound(db: Db, userId: UserId, externalId: ExternalId): Promise<void> {
  await db.update(users).set({ externalId }).where(eq(users.id, userId));
}

describe("admin.linkSsoIdentity (B5)", () => {
  test("a plain user is DENIED (requireAdmin)", async () => {
    const db = await freshDb();
    const svc = createAdminService(makeHarness(db).ctx);
    const u = await seedUser(db, { id: "user_u", role: "user", handle: castId<Handle>("u") });
    await expect(svc.linkSsoIdentity({ principal: principal(u, "user"), userId: u, externalId: EXT })).rejects.toThrow(DomainForbiddenError);
    expect(await externalIdOf(db, u)).toBeNull();
  });

  test("an admin links a non-owner human row → the subject is stamped and the audit row rides the SAME batch", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(h.ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: castId<Handle>("adm") });
    const target = await seedUser(db, { id: "user_t", role: "user", handle: castId<Handle>("t") });

    const view = await svc.linkSsoIdentity({ principal: principal(admin, "admin"), userId: target, externalId: EXT });
    expect(view.externalId).toBe(EXT);
    expect(await externalIdOf(db, target)).toBe(EXT);
    // #1707 — the record is a durable `audit_logs` ROW, not a call on the best-effort channel: an SSO bind
    // is a privileged identity write, so it left `logAudit` (suppress → count → drop) entirely.
    expect(await auditActions(db)).toEqual(["admin.linkSsoIdentity"]);
    expect(h.audits).toHaveLength(0);
  });

  test("the OWNER target is REFUSED before anything is written (owner binds via adoption)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(h.ctx);
    const owner = await seedUser(db, { id: "user_owner", role: "owner", handle: castId<Handle>("owner") });
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: castId<Handle>("adm") });

    await expect(svc.linkSsoIdentity({ principal: principal(admin, "admin"), userId: owner, externalId: EXT })).rejects.toMatchObject({
      code: ADMIN_OP_CODES.cannotModifyOwner,
    });
    expect(await externalIdOf(db, owner)).toBeNull();
    expect(await auditActions(db)).toHaveLength(0);
  });

  test("an unknown target → not-found", async () => {
    const db = await freshDb();
    const { ctx } = makeHarness(db);
    const svc = createAdminService(ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: castId<Handle>("adm") });
    await expect(svc.linkSsoIdentity({ principal: principal(admin, "admin"), userId: castId<UserId>("user_ghost"), externalId: EXT })).rejects.toThrow(
      DomainNotFoundError,
    );
  });

  test("a subject already bound to ANOTHER row maps to ssoSubjectTaken — nothing written, nothing audited", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(h.ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: castId<Handle>("adm") });
    const holder = await seedUser(db, { id: "user_h", role: "user", handle: castId<Handle>("h") });
    const target = await seedUser(db, { id: "user_t", role: "user", handle: castId<Handle>("t") });
    await seedBound(db, holder, EXT);

    await expect(svc.linkSsoIdentity({ principal: principal(admin, "admin"), userId: target, externalId: EXT })).rejects.toMatchObject({
      code: ADMIN_OP_CODES.ssoSubjectTaken,
    });
    // THE BICONDITIONAL: the claim bound nothing (the unique index arbitrated), so no audit row claims it did.
    expect(await externalIdOf(db, target)).toBeNull();
    expect(await externalIdOf(db, holder)).toBe(EXT);
    expect(await auditActions(db)).toHaveLength(0);
    expect(h.audits).toHaveLength(0);
  });

  test("a row already bound to a DIFFERENT subject maps to ssoRowBound — the existing binding survives, nothing audited", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(h.ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: castId<Handle>("adm") });
    const target = await seedUser(db, { id: "user_t", role: "user", handle: castId<Handle>("t") });
    await seedBound(db, target, OTHER_EXT);

    await expect(svc.linkSsoIdentity({ principal: principal(admin, "admin"), userId: target, externalId: EXT })).rejects.toMatchObject({
      code: ADMIN_OP_CODES.ssoRowBound,
    });
    expect(await externalIdOf(db, target)).toBe(OTHER_EXT);
    expect(await auditActions(db)).toHaveLength(0);
    expect(h.audits).toHaveLength(0);
  });

  test("re-linking the SAME subject is an idempotent no-op success that writes NO audit row", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(h.ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: castId<Handle>("adm") });
    const target = await seedUser(db, { id: "user_t", role: "user", handle: castId<Handle>("t") });
    await seedBound(db, target, EXT);

    const view = await svc.linkSsoIdentity({ principal: principal(admin, "admin"), userId: target, externalId: EXT });
    expect(view.externalId).toBe(EXT);
    // The audit row is a biconditional with the WRITE and this re-link wrote nothing — the same rule
    // `setRole`'s owner→owner no-op follows. The best-effort channel is not used as a consolation prize.
    expect(await auditActions(db)).toHaveLength(0);
    expect(h.audits).toHaveLength(0);
  });

  // #1707 RED-FIRST — an SSO bind whose record can be lost is not audited. Before this the bind ran inside
  // the sessions capability and its audit was the swallowing `logAudit`, so a dead audit channel bound the
  // account to an IdP subject and returned 200 with no forensic row.
  test("a failing audit write leaves the row UNBOUND", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(withBrokenAudit(h.ctx, db));
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: castId<Handle>("adm") });
    const target = await seedUser(db, { id: "user_t", role: "user", handle: castId<Handle>("t") });

    await expect(svc.linkSsoIdentity({ principal: principal(admin, "admin"), userId: target, externalId: EXT })).rejects.toThrow();

    expect(await externalIdOf(db, target)).toBeNull();
    expect(await auditActions(db)).toHaveLength(0);
  });

  // The other direction of the same batch: a bind that dies leaves no audit row claiming the link happened.
  test("a failing BIND leaves no audit row", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(withBrokenBind(h.ctx, db));
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: castId<Handle>("adm") });
    const target = await seedUser(db, { id: "user_t", role: "user", handle: castId<Handle>("t") });

    await expect(svc.linkSsoIdentity({ principal: principal(admin, "admin"), userId: target, externalId: EXT })).rejects.toThrow();

    expect(await externalIdOf(db, target)).toBeNull();
    expect(await auditActions(db)).toHaveLength(0);
    expect(h.audits).toHaveLength(0);
  });
});
