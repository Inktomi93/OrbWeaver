// verb: create — app-authored card mint. Load-bearing: the `contentHash` flatten is always present, import
// provenance is null (app-authored), `character.updated` is emitted (the indexer re-embeds), and a per-owner
// handle collision throws `CharacterOperationError("handle_conflict")`.

import { CharacterOperationError, createCharacterService } from "@orb/server/domain/character";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("create", () => {
  test("mints an owned card with a content hash, null provenance, and emits character.updated", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });

    const detail = await svc.create({
      principal: principal(owner),
      input: { handle: "nyx", name: "Nyx", description: "a quiet oracle" },
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
    expect(detail.regexScripts).toEqual([]);

    expect(h.events).toEqual([{ type: "character.updated", characterId: detail.id }]);
    expect(h.audits.map((a) => a.entry.action)).toContain("character.create");
  });

  test("stamps + round-trips import provenance when provided (the PD-43 import wire)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });

    const importHash = "a".repeat(64);
    const detail = await svc.create({
      principal: principal(owner),
      input: { handle: "aria", name: "Aria", description: "imported" },
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
    const owner = await seedUser(db, { handle: "owner" });

    const importHash = "b".repeat(64);
    const detail = await svc.create({
      principal: principal(owner),
      input: { handle: "nameless", name: "Nameless", description: "bare json card" },
      provenance: { importedFrom: null, importHash },
    });

    expect(detail.importedFrom).toBeNull();
    expect(detail.importHash).toBe(importHash);
  });

  test("a duplicate per-owner handle throws CharacterOperationError(handle_conflict)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    await svc.create({
      principal: principal(owner),
      input: { handle: "dup", name: "A", description: "x" },
    });

    const conflict = svc.create({
      principal: principal(owner),
      input: { handle: "dup", name: "B", description: "y" },
    });
    await expect(conflict).rejects.toBeInstanceOf(CharacterOperationError);
    await expect(conflict).rejects.toMatchObject({ code: "handle_conflict" });
  });

  test("the same handle under a DIFFERENT owner is allowed (per-owner namespace)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const a = await seedUser(db, { handle: "a" });
    const b = await seedUser(db, { handle: "b" });
    await svc.create({
      principal: principal(a),
      input: { handle: "shared", name: "A", description: "x" },
    });
    const bDetail = await svc.create({
      principal: principal(b),
      input: { handle: "shared", name: "B", description: "y" },
    });
    expect(bDetail.handle).toBe("shared");
  });
});
