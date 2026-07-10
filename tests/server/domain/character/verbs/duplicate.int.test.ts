// verb: duplicate — clone into a fresh local card. Load-bearing: a free `<handle>-copy[-n]` is derived,
// content is copied, import provenance is CLEARED (the clone is app-authored), and character.updated emits.

import { createCharacterService } from "@orb/server/domain/character";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedRawCharacter, seedUser } from "../_support.ts";

describe("duplicate", () => {
  test("clones content under a -copy handle, fresh id, and emits character.updated", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const source = await svc.create({
      principal: principal(owner),
      input: { handle: "nyx", name: "Nyx", description: "the original" },
    });
    h.events.length = 0;

    const copy = await svc.duplicate({ principal: principal(owner), characterId: source.id });
    expect(copy.id).not.toBe(source.id);
    expect(copy.handle).toBe("nyx-copy");
    expect(copy.name).toBe("Nyx");
    expect(copy.description).toBe("the original");
    expect(h.events).toEqual([
      { type: "character.updated", characterId: copy.id, contentChanged: true },
    ]);
  });

  test("a second duplicate of the same source increments the copy handle", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const source = await svc.create({
      principal: principal(owner),
      input: { handle: "nyx", name: "Nyx", description: "d" },
    });
    const first = await svc.duplicate({ principal: principal(owner), characterId: source.id });
    const second = await svc.duplicate({ principal: principal(owner), characterId: source.id });
    expect(first.handle).toBe("nyx-copy");
    expect(second.handle).toBe("nyx-copy-2");
  });

  test("duplicating an imported card clears the import provenance", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const imported = await seedRawCharacter(db, {
      id: "character_imp",
      ownerId: owner,
      handle: "imported",
      name: "Imported",
      importedFrom: "card.png",
      importHash: "rawfilehash",
    });
    const copy = await svc.duplicate({ principal: principal(owner), characterId: imported });
    expect(copy.handle).toBe("imported-copy");
    expect(copy.importedFrom).toBeNull();
    expect(copy.importHash).toBeNull();
  });

  test("D44 §12.1/§12.5 — the per-character theme/render policies carry forward", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const source = await svc.create({
      principal: principal(owner),
      input: { handle: "nyx", name: "Nyx", description: "d" },
    });
    await svc.update({
      principal: principal(owner),
      characterId: source.id,
      input: { trustHtml: true, themeOverride: { accent: "oklch(0.7 0.14 250)" } },
    });
    const copy = await svc.duplicate({ principal: principal(owner), characterId: source.id });
    expect(copy.trustHtml).toBe(true);
    expect(copy.themeOverride).toEqual({ accent: "oklch(0.7 0.14 250)" });
  });
});
