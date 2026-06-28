// verb: bulkAddCardTag — owner-scopes targets, then routes each to the injected tag port. Load-bearing:
// unowned characters are never attached to; a blank name is a no-op (no port calls).

import { createCharacterService } from "@orb/server/domain/character";
import { describe, expect, test } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("bulk add card tag", () => {
  test("calls the tag port once per OWNED character and skips foreign ones", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const a = await svc.create({
      principal: principal(owner),
      input: { handle: "a", name: "A", description: "d" },
    });
    const b = await svc.create({
      principal: principal(owner),
      input: { handle: "b", name: "B", description: "d" },
    });
    const foreign = await svc.create({
      principal: principal(other),
      input: { handle: "c", name: "C", description: "d" },
    });

    await svc.bulkAddCardTag({
      principal: principal(owner),
      tagName: "  hero  ",
      characterIds: [a.id, b.id, foreign.id],
    });

    expect(h.tagAttaches.map((t) => t.characterId)).toEqual([a.id, b.id]);
    // the trimmed name is what reaches the port
    expect(h.tagAttaches.every((t) => t.tagName === "hero")).toBe(true);
    expect(h.tagAttaches.every((t) => t.ownerId === owner)).toBe(true);
  });

  test("a blank tag name is a no-op (no port calls)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const a = await svc.create({
      principal: principal(owner),
      input: { handle: "a", name: "A", description: "d" },
    });
    await svc.bulkAddCardTag({ principal: principal(owner), tagName: "   ", characterIds: [a.id] });
    expect(h.tagAttaches).toEqual([]);
  });
});
