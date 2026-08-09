// verb: linkSsoIdentity (B5) — the admin GATE + target refusals + outcome→code mapping around the injected
// bind-once `linkExternalId` capability. The bind-once LOGIC itself is proven in
// tests/server/domain/sessions/verbs/link-external-id.int.test.ts; here the fake port records the call and its
// outcome is forced to exercise the mapping. Load-bearing invariants: a plain user is REFUSED; the OWNER and
// AGENT targets are refused BEFORE the port is touched (privilege belts); a subject-taken / target-bound
// outcome maps to the typed code; a successful link audits.

import { DomainForbiddenError, DomainNotFoundError } from "@orb/kit/errors";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAdminService } from "@orb/server/domain/admin";
import { describe } from "vitest";
import { ADMIN_OP_CODES } from "../../../../../packages/server/src/domain/admin/contract/errors.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

const EXT = castId<ExternalId>("authentik|subject-123");

describe("admin.linkSsoIdentity (B5)", () => {
  test("a plain user is DENIED (requireAdmin)", async () => {
    const db = await freshDb();
    const svc = createAdminService(makeHarness(db).ctx);
    const u = await seedUser(db, { id: "user_u", role: "user", handle: castId<Handle>("u") });
    await expect(svc.linkSsoIdentity({ principal: principal(u, "user"), userId: u, externalId: EXT })).rejects.toThrow(DomainForbiddenError);
  });

  test("an admin links a non-owner human row → delegates to the port + audits", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(h.ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: castId<Handle>("adm") });
    const target = await seedUser(db, { id: "user_t", role: "user", handle: castId<Handle>("t") });

    await svc.linkSsoIdentity({ principal: principal(admin, "admin"), userId: target, externalId: EXT });
    expect(h.linked).toEqual([{ userId: target, externalId: EXT }]);
    expect(h.audits.map((a) => a.entry.action)).toContain("admin.linkSsoIdentity");
  });

  test("the OWNER target is REFUSED before the port is touched (owner binds via adoption)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(h.ctx);
    const owner = await seedUser(db, { id: "user_owner", role: "owner", handle: castId<Handle>("owner") });
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: castId<Handle>("adm") });

    await expect(svc.linkSsoIdentity({ principal: principal(admin, "admin"), userId: owner, externalId: EXT })).rejects.toMatchObject({
      code: ADMIN_OP_CODES.cannotModifyOwner,
    });
    expect(h.linked).toEqual([]);
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

  test("a `subject-taken` outcome maps to the ssoSubjectTaken code", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    h.setLinkOutcome({ outcome: "subject-taken" });
    const svc = createAdminService(h.ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: castId<Handle>("adm") });
    const target = await seedUser(db, { id: "user_t", role: "user", handle: castId<Handle>("t") });
    await expect(svc.linkSsoIdentity({ principal: principal(admin, "admin"), userId: target, externalId: EXT })).rejects.toMatchObject({
      code: ADMIN_OP_CODES.ssoSubjectTaken,
    });
  });

  test("a `target-bound` outcome maps to the ssoRowBound code (bind-once refusal)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    h.setLinkOutcome({ outcome: "target-bound" });
    const svc = createAdminService(h.ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: castId<Handle>("adm") });
    const target = await seedUser(db, { id: "user_t", role: "user", handle: castId<Handle>("t") });
    await expect(svc.linkSsoIdentity({ principal: principal(admin, "admin"), userId: target, externalId: EXT })).rejects.toMatchObject({
      code: ADMIN_OP_CODES.ssoRowBound,
    });
    expect(h.audits.map((a) => a.entry.action)).not.toContain("admin.linkSsoIdentity");
  });
});
