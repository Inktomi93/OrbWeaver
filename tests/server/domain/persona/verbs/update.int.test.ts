// verb: update — whitelisted patch. Load-bearing: only whitelisted fields change (identity columns can't
// be smuggled in); a no-op edit (all-undefined) re-reads WITHOUT writing or auditing; `null` clears a
// nullable field; updatedAt advances on a real edit; a not-owned target throws.

import { personas } from "@orb/db";
import type { Handle, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { AssetNotFoundError, createPersonaService, PersonaNotFoundError } from "@orb/server/domain/persona";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedAsset, seedUser } from "../_support.ts";

const ONE_MINUTE = 60_000;

describe("update", () => {
  test("patches name + clears the avatar (null), stamping updatedAt", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPersonaService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const avatar = await seedAsset(db, { ownerId: owner });
    const created = await svc.create({
      principal: principal(owner),
      input: { name: "Old", description: "d", avatarAssetId: avatar },
    });

    h.advance(ONE_MINUTE);
    const updated = await svc.update({
      principal: principal(owner),
      personaId: created.id,
      input: { name: "New", avatarAssetId: null },
    });

    expect(updated.name).toBe("New");
    expect(updated.description).toBe("d");
    expect(updated.avatarAssetId).toBeNull();
    expect(updated.updatedAt).toBeGreaterThan(created.updatedAt);
    expect(h.audits.map((a) => a.entry.action)).toContain("persona.update");
  });

  test("a no-op edit (all undefined) re-reads without writing or auditing", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPersonaService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const created = await svc.create({
      principal: principal(owner),
      input: { name: "Same", description: "d" },
    });
    h.advance(ONE_MINUTE);

    const result = await svc.update({
      principal: principal(owner),
      personaId: created.id,
      input: {},
    });

    expect(result.name).toBe("Same");
    expect(result.updatedAt).toBe(created.updatedAt);
    expect(h.audits.some((a) => a.entry.action === "persona.update")).toBe(false);
  });

  test("a not-owned persona throws PersonaNotFoundError (no write)", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const created = await svc.create({
      principal: principal(owner),
      input: { name: "Mine", description: "d" },
    });
    await expect(svc.update({ principal: principal(other), personaId: created.id, input: { name: "Hijack" } })).rejects.toThrow(PersonaNotFoundError);
    const rows = await db.select().from(personas).where(eq(personas.id, created.id));
    expect(rows[0]?.name).toBe("Mine");
  });

  test("a missing id throws PersonaNotFoundError", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    await expect(
      svc.update({
        principal: principal(owner),
        personaId: castId<PersonaId>("persona_ghost"),
        input: { name: "x" },
      }),
    ).rejects.toThrow(PersonaNotFoundError);
  });

  test("patches title + starred (D62 riders); null clears the title", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const created = await svc.create({
      principal: principal(owner),
      input: { name: "Wren", title: "Old Title", description: "d" },
    });

    const starred = await svc.update({
      principal: principal(owner),
      personaId: created.id,
      input: { starred: true, title: "New Title" },
    });
    expect(starred.starred).toBe(true);
    expect(starred.title).toBe("New Title");

    const cleared = await svc.update({
      principal: principal(owner),
      personaId: created.id,
      input: { title: null },
    });
    expect(cleared.title).toBeNull();
    expect(cleared.starred).toBe(true);
  });

  test("a FOREIGN avatar asset throws AssetNotFoundError (D21 cross-root belt — nothing written)", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const foreign = await seedAsset(db, { id: "asset_foreign", ownerId: other });
    const created = await svc.create({
      principal: principal(owner),
      input: { name: "Mine", description: "d" },
    });

    await expect(
      svc.update({
        principal: principal(owner),
        personaId: created.id,
        input: { avatarAssetId: foreign },
      }),
    ).rejects.toBeInstanceOf(AssetNotFoundError);

    const [row] = await db.select().from(personas).where(eq(personas.id, created.id));
    expect(row?.avatarAssetId).toBeNull();
  });
});
