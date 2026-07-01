// verb: getCard — the live card read (chat/roster inject this). CONTRACT INVARIANT: returns `null` for
// not-owned / missing — it NEVER throws (a throw would break the roster loop).

import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createCharacterService } from "@orb/server/domain/character";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("getCard", () => {
  test("returns the live card for an owned character", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: "nyx", name: "Nyx", description: "a card" },
    });
    const card = await svc.getCard({ principal: principal(owner), characterId: created.id });
    expect(card?.name).toBe("Nyx");
    expect(card?.description).toBe("a card");
  });

  test("returns null (NOT throws) for another user's character", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: "nyx", name: "Nyx", description: "d" },
    });
    expect(await svc.getCard({ principal: principal(other), characterId: created.id })).toBeNull();
  });

  test("returns null for a missing id", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    expect(
      await svc.getCard({
        principal: principal(owner),
        characterId: castId<CharacterId>("character_ghost"),
      }),
    ).toBeNull();
  });
});
