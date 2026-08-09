// verb: getSnapshot — the compare/inspect blob read (the refinery Versions walk, schema-renderer §16.2):
// the owned path returns the snapshot WITH its card content; a foreign owner and a snapshot under a
// DIFFERENT character both collapse to the same NOT_FOUND (leak-free — the pair predicate).

import type { CharacterHandle, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { CharacterNotFoundError, createCharacterService } from "@orb/server/domain/character";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

test("returns the snapshot with its blob for the owner; foreign/cross-character reads collapse to NOT_FOUND", async () => {
  const db = await freshDb();
  const h = makeHarness(db);
  const svc = createCharacterService(h.ctx);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const other = await seedUser(db, { handle: castId<Handle>("other") });
  const a = await svc.create({
    principal: principal(owner),
    input: { handle: castId<CharacterHandle>("gs-a"), name: "Aria", description: "keeper of records" },
  });
  const b = await svc.create({ principal: principal(owner), input: { handle: castId<CharacterHandle>("gs-b"), name: "Kestrel", description: "other card" } });
  const ref = await svc.snapshot({ principal: principal(owner), characterId: a.id, label: "before polish" });

  const view = await svc.getSnapshot({ principal: principal(owner), characterId: a.id, snapshotId: ref.id });
  expect(view.id).toBe(ref.id);
  expect(view.label).toBe("before polish");
  expect(view.content.description).toBe("keeper of records");

  // Foreign owner — the same NOT_FOUND as an absent character (no existence oracle).
  await expect(svc.getSnapshot({ principal: principal(other), characterId: a.id, snapshotId: ref.id })).rejects.toThrow(CharacterNotFoundError);
  // A snapshot under a DIFFERENT character of the same owner — the pair predicate collapses it too.
  await expect(svc.getSnapshot({ principal: principal(owner), characterId: b.id, snapshotId: ref.id })).rejects.toThrow(CharacterNotFoundError);
});
