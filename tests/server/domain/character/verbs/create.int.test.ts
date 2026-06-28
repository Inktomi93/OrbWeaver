// verb: create — app-authored card mint. Load-bearing: the `contentHash` flatten is always present, import
// provenance is null (app-authored), `character.updated` is emitted (the indexer re-embeds), and a per-owner
// handle collision throws `CharacterOperationError("handle_conflict")`.

import { CharacterOperationError, createCharacterService } from "@orb/server/domain/character";
import { describe, expect, test } from "vitest";
import { freshDb } from "../../../../support/db.ts";
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
