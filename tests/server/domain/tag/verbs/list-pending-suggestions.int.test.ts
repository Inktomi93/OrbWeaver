// verb: listPendingSuggestions — the Accept/Reject review queue read (the `pending` half of character_tags).
// Load-bearing: returns ONLY pending rows (accepted tags read through the character's own accepted surface),
// joined to the tag row (name + colors for the chip), owner-scoped via `characters.ownerId` (the junction
// carries no owner), and narrowable to ONE character.

import { createTagService } from "@orb/server/domain/tag";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeTagHarness, principal, seedCharacter, seedUser } from "../_support.ts";

describe("listPendingSuggestions", () => {
  test("returns only pending suggestions, joined to the tag, owner-scoped, with the characterId", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_owner");
    const svc = createTagService(makeTagHarness(db).ctx);
    const character = await seedCharacter(db, owner, "character_a");

    // A pending (auto) suggestion + an accepted (manual) tag on the same character.
    await svc.attachCardTagByName({
      ownerId: owner,
      characterId: character,
      tagName: "sky-pirates",
      source: "auto",
      status: "pending",
    });
    await svc.attachCardTagByName({
      ownerId: owner,
      characterId: character,
      tagName: "accepted-one",
      source: "manual",
      status: "accepted",
    });

    const pending = await svc.listPendingSuggestions({ principal: principal(owner) });
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      name: "sky-pirates",
      source: "auto",
      characterId: character,
    });
  });

  test("a foreign owner's pending suggestion is never returned (owner-scoped via characters.ownerId)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_owner");
    const other = await seedUser(db, "user_other");
    const svc = createTagService(makeTagHarness(db).ctx);
    const foreignChar = await seedCharacter(db, other, "character_foreign");
    await svc.attachCardTagByName({
      ownerId: other,
      characterId: foreignChar,
      tagName: "not-yours",
      source: "auto",
      status: "pending",
    });

    const pending = await svc.listPendingSuggestions({ principal: principal(owner) });
    expect(pending).toHaveLength(0);
  });

  test("narrows to ONE character when characterId is supplied", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_owner");
    const svc = createTagService(makeTagHarness(db).ctx);
    const a = await seedCharacter(db, owner, "character_a");
    const b = await seedCharacter(db, owner, "character_b");
    await svc.attachCardTagByName({
      ownerId: owner,
      characterId: a,
      tagName: "for-a",
      source: "auto",
      status: "pending",
    });
    await svc.attachCardTagByName({
      ownerId: owner,
      characterId: b,
      tagName: "for-b",
      source: "auto",
      status: "pending",
    });

    const all = await svc.listPendingSuggestions({ principal: principal(owner) });
    expect(all).toHaveLength(2);
    const justA = await svc.listPendingSuggestions({ principal: principal(owner), characterId: a });
    expect(justA.map((s) => s.name)).toEqual(["for-a"]);
  });
});
