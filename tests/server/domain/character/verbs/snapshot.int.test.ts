// verb: snapshot — append a history blob of the live card. No emit (the live card is unchanged).

import { CharacterNotFoundError, createCharacterService } from "@orb/server/domain/character";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("snapshot", () => {
  test("appends a snapshot of the live card and returns its ref; no emit", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: "nyx", name: "Nyx", description: "d" },
    });
    h.events.length = 0;

    const ref = await svc.snapshot({
      principal: principal(owner),
      characterId: created.id,
      label: "v1",
    });

    expect(ref.characterId).toBe(created.id);
    const snaps = await svc.listSnapshots({ principal: principal(owner), characterId: created.id });
    expect(snaps.map((s) => s.id)).toEqual([ref.id]);
    expect(snaps[0]?.label).toBe("v1");
    expect(h.events).toEqual([]);
  });

  test("snapshotting another user's character throws CharacterNotFoundError", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });
    const created = await svc.create({
      principal: principal(owner),
      input: { handle: "nyx", name: "Nyx", description: "d" },
    });
    await expect(
      svc.snapshot({ principal: principal(other), characterId: created.id }),
    ).rejects.toBeInstanceOf(CharacterNotFoundError);
  });
});
