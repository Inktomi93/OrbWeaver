// verb: create — app-authored card mint. Load-bearing: the `contentHash` flatten is always present, import
// provenance is null (app-authored), `character.updated` is emitted (the indexer re-embeds), and a per-owner
// handle collision throws `CharacterOperationError("handle_conflict")`.

import { statsCanonVersions } from "@orb/db";
import type { CharacterHandle, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { AssetNotFoundError, CharacterOperationError, createCharacterService } from "@orb/server/domain/character";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedAsset, seedUser } from "../_support.ts";

describe("create", () => {
  test("mints an owned card with a content hash, null provenance, and emits character.updated", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const detail = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "a quiet oracle" },
    });

    expect(detail.handle).toBe("nyx");
    expect(detail.name).toBe("Nyx");
    expect(detail.description).toBe("a quiet oracle");
    expect(detail.contentHash).toHaveLength(64);
    expect(detail.importedFrom).toBeNull();
    expect(detail.importHash).toBeNull();
    expect(detail.avatarHash).toBeNull();
    expect(detail.synthetic).toBe(false);
    expect(detail.greetings).toEqual([]);
    expect((await db.select().from(statsCanonVersions).where(eq(statsCanonVersions.ownerId, owner)))[0]?.version).toBe(1);

    expect(h.events).toEqual([{ type: "character.updated", characterId: detail.id, contentChanged: true }]);
    expect(h.audits.map((a) => a.entry.action)).toContain("character.create");
  });

  test("stamps + round-trips import provenance when provided (the import wire)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const importHash = "a".repeat(64);
    const detail = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("aria"), name: "Aria", description: "imported" },
      provenance: { importedFrom: "Aria.png", importHash },
    });

    expect(detail.importedFrom).toBe("Aria.png");
    expect(detail.importHash).toBe(importHash);

    // Persisted, not just echoed: re-read through `get` confirms the columns landed.
    const reread = await svc.get({ principal: principal(owner), characterId: detail.id });
    expect(reread.importedFrom).toBe("Aria.png");
    expect(reread.importHash).toBe(importHash);
  });

  test("a null importedFrom with a hash persists (PNG-less / unlabeled import)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const importHash = "b".repeat(64);
    const detail = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("nameless"), name: "Nameless", description: "bare json card" },
      provenance: { importedFrom: null, importHash },
    });

    expect(detail.importedFrom).toBeNull();
    expect(detail.importHash).toBe(importHash);
  });

  test("a duplicate per-owner handle throws CharacterOperationError(handle_conflict)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("dup"), name: "A", description: "x" },
    });

    const conflict = svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("dup"), name: "B", description: "y" },
    });
    await expect(conflict).rejects.toBeInstanceOf(CharacterOperationError);
    await expect(conflict).rejects.toMatchObject({ code: "handle_conflict" });
  });

  test("the same handle under a DIFFERENT owner is allowed (per-owner namespace)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const a = await seedUser(db, { handle: castId<Handle>("a") });
    const b = await seedUser(db, { handle: castId<Handle>("b") });
    await svc.create({
      principal: principal(a),
      input: { handle: castId<CharacterHandle>("shared"), name: "A", description: "x" },
    });
    const bDetail = await svc.create({
      principal: principal(b),
      input: { handle: castId<CharacterHandle>("shared"), name: "B", description: "y" },
    });
    expect(bDetail.handle).toBe("shared");
  });

  test("refuses a reserved `__group__*` handle (the synthetic namespace) — no row, no emit", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const squat = svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("__group__chat_1"), name: "Squat", description: "x" },
    });
    await expect(squat).rejects.toBeInstanceOf(CharacterOperationError);
    await expect(squat).rejects.toMatchObject({ code: "handle_reserved" });
    expect(h.events).toHaveLength(0);
  });

  test("a FOREIGN avatar asset throws AssetNotFoundError (D21 cross-root belt — no row, no emit)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const foreign = await seedAsset(db, { id: "asset_foreign", ownerId: other });

    await expect(
      svc.create({
        principal: principal(owner),
        input: { handle: castId<CharacterHandle>("thief"), name: "Thief", description: "x", avatarAssetId: foreign },
      }),
    ).rejects.toBeInstanceOf(AssetNotFoundError);
    expect(h.events).toHaveLength(0);
  });

  test("an audit that REJECTS leaves no domain event and no user event (emission follows the audit)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    // `emit` is a synchronous void op feeding the embeddings indexer. Firing it ahead of `await ctx.audit`
    // meant a rejected audit left the indexer embedding a card the caller was told had failed to create.
    const svc = createCharacterService({ ...h.ctx, audit: (): Promise<void> => Promise.reject(new Error("the audit sink is down")) });

    await expect(svc.create({ principal: principal(owner), input: { handle: castId<CharacterHandle>("nyx"), name: "Nyx", description: "d" } })).rejects.toThrow(
      "the audit sink is down",
    );

    expect(h.events).toEqual([]);
    expect(h.userEvents).toEqual([]);
  });
});
