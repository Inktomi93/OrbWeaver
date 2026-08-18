// verb: listTagFilterVocabulary — the character-library chip vocabulary. The projection `listTagsWithUsage`
// is NOT: four columns, the CHARACTER junction only, and the rank the chip rail's 8-chip cap depends on
// (side-eye 2026-08-18 P2-6 — the rail was reading the management rollup, 433,399 bytes over 1,736 rows to
// paint 8 chips and a "+1,728 more" link).
//
// The two properties worth a db: the RANK is the server's (most-used first, ties alphabetical — the client
// no longer sorts what it was handed), and the ROW SET is every owned tag INCLUDING the zero-usage and
// card-hidden ones, because this answer doubles as the referential authority a persisted tag filter is
// checked against (`character-library-lens.ts` knownTagIds — an omitted id reads as "deleted" and would
// silently drop a live filter).

import { createTagService } from "@orb/server/domain/tag";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeTagHarness, principal, seedCharacter, seedTag, seedUser } from "../_support.ts";

describe("listTagFilterVocabulary", () => {
  test("ranks most-used FIRST with alphabetical ties, and counts the whole library", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const h = makeTagHarness(db);
    const svc = createTagService(h.ctx);
    const one = await seedCharacter(db, owner, "character_one");
    const two = await seedCharacter(db, owner, "character_two");
    const popular = await seedTag(db, owner, { id: "tag_pop", name: "zulu" });
    const tiedB = await seedTag(db, owner, { id: "tag_b", name: "beta" });
    const tiedA = await seedTag(db, owner, { id: "tag_a", name: "alpha" });
    await Promise.all(
      (
        [
          [popular, one],
          [popular, two],
          [tiedB, one],
          [tiedA, one],
        ] as const
      ).map(([tagId, targetId]) => svc.attachTag({ principal: principal(owner), tagId, targetType: "character", targetId })),
    );

    const vocabulary = await svc.listTagFilterVocabulary({ principal: principal(owner) });
    // "zulu" is alphabetically last and ranks FIRST — the cap keeps the filters that can do the most, and
    // the alphabetical fallback only separates equal counts.
    expect(vocabulary.map((entry) => entry.name)).toEqual(["zulu", "alpha", "beta"]);
    expect(vocabulary.map((entry) => entry.characters)).toEqual([2, 1, 1]);
  });

  test("returns the UNUSED and card-HIDDEN tags too — the answer is the filter's referential authority", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const h = makeTagHarness(db);
    const svc = createTagService(h.ctx);
    const characterId = await seedCharacter(db, owner);
    const used = await seedTag(db, owner, { id: "tag_used", name: "used" });
    await seedTag(db, owner, { id: "tag_unused", name: "unused" });
    const hidden = await seedTag(db, owner, { id: "tag_hidden", name: "hidden" });
    await svc.attachTag({ principal: principal(owner), tagId: used, targetType: "character", targetId: characterId });
    await svc.attachTag({ principal: principal(owner), tagId: hidden, targetType: "character", targetId: characterId });
    await svc.updateTag({ principal: principal(owner), tagId: hidden, patch: { isHiddenOnCard: true } });

    const vocabulary = await svc.listTagFilterVocabulary({ principal: principal(owner) });
    // The RAIL drops the last two (`tagVocabulary`); the READ must not, or a persisted filter on either id
    // is dropped from the wire as unknown and the user's library silently loses its lens.
    expect([...vocabulary].map((entry) => entry.name).toSorted((a, b) => a.localeCompare(b))).toEqual(["hidden", "unused", "used"]);
    expect(vocabulary.find((entry) => entry.name === "unused")?.characters).toBe(0);
    expect(vocabulary.find((entry) => entry.name === "hidden")?.isHiddenOnCard).toBe(true);
  });

  test("is owner-scoped — a foreign owner's tags are not in the vocabulary", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const stranger = await seedUser(db, "user_stranger");
    const h = makeTagHarness(db);
    const svc = createTagService(h.ctx);
    await seedTag(db, owner, { id: "tag_mine", name: "mine" });
    await seedTag(db, stranger, { id: "tag_theirs", name: "theirs" });

    const vocabulary = await svc.listTagFilterVocabulary({ principal: principal(owner) });
    expect(vocabulary.map((entry) => entry.name)).toEqual(["mine"]);
  });
});
