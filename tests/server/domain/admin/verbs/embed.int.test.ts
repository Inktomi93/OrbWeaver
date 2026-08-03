// verb: embedCharacterCard (PD-90) — the admin-gated inline single-card embed. Proves: the requireAdmin
// gate (a plain user is refused BEFORE the port is touched), the leak-free not-found when the composed
// port reports not-owned/missing (`false`), and the happy path (port called with the caller's principal +
// the target id, then audited).

import { DomainForbiddenError, DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAdminService } from "@orb/server/domain/admin";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

const CHARACTER_ID = castId<CharacterId>("character_target");

describe("admin.embedCharacterCard", () => {
  test("a plain user is refused (requireAdmin) and the embed port is never touched", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(h.ctx);
    const plain = await seedUser(db, { id: "user_plain", handle: castId<Handle>("plain") });

    const err = await svc.embedCharacterCard({ principal: principal(plain, "user"), characterId: CHARACTER_ID }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DomainForbiddenError);
    expect(h.embedded).toHaveLength(0);
    expect(h.audits).toHaveLength(0);
  });

  test("a not-owned/missing character is a leak-free not-found (no audit)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    h.setEmbedOwned(false);
    const svc = createAdminService(h.ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: castId<Handle>("adm") });

    const err = await svc.embedCharacterCard({ principal: principal(admin, "admin"), characterId: CHARACTER_ID }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DomainNotFoundError);
    expect(h.audits).toHaveLength(0);
  });

  test("the happy path drives the port with the caller's principal and audits the embed", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createAdminService(h.ctx);
    const admin = await seedUser(db, { id: "user_adm", role: "admin", handle: castId<Handle>("adm") });
    const p = principal(admin, "admin");

    await svc.embedCharacterCard({ principal: p, characterId: CHARACTER_ID });

    expect(h.embedded).toEqual([{ principal: p, characterId: CHARACTER_ID }]);
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]?.entry.action).toBe("admin.embedCharacterCard");
    expect(h.audits[0]?.entry.entityId).toBe(CHARACTER_ID);
  });
});
