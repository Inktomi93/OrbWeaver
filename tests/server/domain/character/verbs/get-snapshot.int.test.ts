// verb: getSnapshot — the compare/inspect blob read (the refinery Versions walk, schema-renderer §16.2):
// the owned path returns the snapshot WITH its card content; a foreign owner and a snapshot under a
// DIFFERENT character both collapse to the same NOT_FOUND (leak-free — the pair predicate).

import type { CharacterCard } from "@orb/contracts/character";
import { characterSnapshots } from "@orb/db";
import type { CharacterHandle, CharacterSnapshotId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { CharacterNotFoundError, createCharacterService } from "@orb/server/domain/character";
import { eq } from "drizzle-orm";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
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

test("an OLDER-shaped stored blob is projected through the same parse seam `restore` reads it through", async () => {
  const db = await freshDb();
  const h = makeHarness(db);
  const svc = createCharacterService(h.ctx);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const card = await svc.create({
    principal: principal(owner),
    input: { handle: castId<CharacterHandle>("gs-old"), name: "Aria", description: "keeper of records" },
  });

  // A history row written under an older card shape: `greetings` as the pre-array string ST used, and a
  // `refinery` score outside today's 1-10 rubric. These rows really exist — the history is opaque AT REST
  // and is never migrated — so this is persisted data the read has to survive, not hypothetical input.
  // @orb-waive no-test-fabrication(unknown): the whole point is a stored blob that does NOT satisfy today's `CharacterCard`. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const legacyContent = {
    name: "Aria",
    description: "keeper of records",
    greetings: "hello there",
    refinery: { score: 99, analysis: null },
  } as unknown as CharacterCard;
  const snapshotId = castId<CharacterSnapshotId>("character_snapshot_legacy");
  await db.insert(characterSnapshots).values({ id: snapshotId, characterId: card.id, content: legacyContent, label: "legacy", createdAt: FROZEN_AT_MS });

  const view = await svc.getSnapshot({ principal: principal(owner), characterId: card.id, snapshotId });

  // The projection heals the JSON sub-columns exactly as `cardOf` does everywhere else, so `content` is an
  // honest CharacterCard and the compare view shows what restoring this version would actually give you.
  expect(view.content.greetings).toEqual([]);
  expect(view.content.refinery).toEqual({ score: null, analysis: null });
  expect(view.content.description).toBe("keeper of records");

  // AT REST the row is untouched — nothing here rewrites, heals or migrates the stored history (D28).
  const stored = (await db.select({ content: characterSnapshots.content }).from(characterSnapshots).where(eq(characterSnapshots.id, snapshotId)))[0];
  expect(stored?.content).toEqual(legacyContent);
});
