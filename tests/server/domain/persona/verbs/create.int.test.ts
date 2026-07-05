// verb: create — owner-scoped mint. Load-bearing: the new row is owned by `principal.userId`; the avatar
// JOIN surfaces `avatarHash`; write-metadata is coerced + stored typed; every create audits `persona.create`.

import { personas } from "@orb/db";
import { AssetNotFoundError, createPersonaService } from "@orb/server/domain/persona";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedAsset, seedUser } from "../_support.ts";

describe("create", () => {
  test("mints a persona owned by the caller, with the avatar hash joined (audited)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPersonaService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const avatar = await seedAsset(db, { ownerId: owner, hash: "sha_avatar" });

    const detail = await svc.create({
      principal: principal(owner),
      input: { name: "Nyx", description: "a wanderer", avatarAssetId: avatar },
    });

    expect(detail.name).toBe("Nyx");
    expect(detail.description).toBe("a wanderer");
    expect(detail.avatarAssetId).toBe(avatar);
    expect(detail.avatarHash).toBe("sha_avatar");

    const rows = await db.select().from(personas).where(eq(personas.id, detail.id));
    expect(rows[0]?.ownerId).toBe(owner);
    expect(h.audits.map((a) => a.entry.action)).toContain("persona.create");
  });

  test("stores typed metadata (placement) and a null avatar joins to a null hash", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPersonaService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });

    const detail = await svc.create({
      principal: principal(owner),
      input: {
        name: "Echo",
        description: "voiceless",
        metadata: { descriptionPosition: "at_depth", inject: { depth: 3, role: "user" } },
      },
    });

    expect(detail.avatarAssetId).toBeNull();
    expect(detail.avatarHash).toBeNull();
    expect(detail.metadata?.descriptionPosition).toBe("at_depth");
    expect(detail.metadata?.inject).toEqual({ depth: 3, role: "user" });
  });

  test("title + starred round-trip (D62 riders); both default when omitted", async () => {
    const db = await freshDb();
    const svc = createPersonaService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });

    const titled = await svc.create({
      principal: principal(owner),
      input: { name: "Wren", title: "The Cartographer", description: "d", starred: true },
    });
    expect(titled.title).toBe("The Cartographer");
    expect(titled.starred).toBe(true);

    const bare = await svc.create({
      principal: principal(owner),
      input: { name: "Mott", description: "d" },
    });
    expect(bare.title).toBeNull();
    expect(bare.starred).toBe(false);
  });

  test("a FOREIGN avatar asset throws AssetNotFoundError (D21 cross-root belt — no row, no audit)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createPersonaService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const foreign = await seedAsset(db, { id: "asset_foreign", ownerId: other });

    await expect(
      svc.create({
        principal: principal(owner),
        input: { name: "Thief", description: "d", avatarAssetId: foreign },
      }),
    ).rejects.toBeInstanceOf(AssetNotFoundError);

    const rows = await db.select().from(personas).where(eq(personas.ownerId, owner));
    expect(rows).toHaveLength(0);
    expect(h.audits).toHaveLength(0);
  });
});
