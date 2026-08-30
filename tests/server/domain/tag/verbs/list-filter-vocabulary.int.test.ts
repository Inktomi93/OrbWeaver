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

  // ───────────────────────────────────────────────────────────────────────────────────────────────────
  // #839 — THE COUNT IS THE PREDICATE THAT DECIDES WHETHER A FACET IS OFFERED, so it must count exactly
  // what the library's filter can MATCH.
  //
  // MEASURED DEFECT (side-eye 2026-08-30 rail-characters P2): the FILTERS block offered 28 tag chips on a
  // library whose group-by-tag returned one bucket — `UNCATEGORIZED 10`, every character untagged — and
  // activating any of them answered `0 of 10 / No matches`. The mechanism is here, not in the rail: the
  // chip rail already drops a zero-count entry (`tagVocabulary`: `tag.characters > 0`), so every one of
  // those 28 reported a NON-ZERO count. This read counted `character_tags` rows regardless of `status`
  // while `domain/character/persistence/queries.ts` filters and groups on `status = 'accepted'` — so a tag
  // that exists only as UNACCEPTED SUGGESTIONS cleared the gate and rendered a chip that could never match.
  //
  // The two arms are the same tag in the two statuses, because either alone is satisfiable by a wrong fix
  // (count nothing / count everything).
  test("#839 counts ACCEPTED attachments only — a suggestion-only tag is not an offerable facet", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const h = makeTagHarness(db);
    const svc = createTagService(h.ctx);
    const characterId = await seedCharacter(db, owner);
    const staged = await seedTag(db, owner, { id: "tag_staged", name: "fantasy" });
    const applied = await seedTag(db, owner, { id: "tag_applied", name: "rpg" });
    await svc.attachTag({ principal: principal(owner), tagId: staged, targetType: "character", targetId: characterId, status: "pending" });
    await svc.attachTag({ principal: principal(owner), tagId: applied, targetType: "character", targetId: characterId, status: "accepted" });

    const vocabulary = await svc.listTagFilterVocabulary({ principal: principal(owner) });
    // The row SURVIVES — the answer is still the referential authority (the test above), and a suggestion
    // is a real row. What it may not do is CLAIM a character the filter cannot return.
    expect(vocabulary.find((entry) => entry.name === "fantasy")?.characters).toBe(0);
    // …and the accepted one still counts, so this is not "the count went to zero".
    expect(vocabulary.find((entry) => entry.name === "rpg")?.characters).toBe(1);
  });

  test("#839 an ACCEPT flips the same tag from un-offerable to offerable", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const h = makeTagHarness(db);
    const svc = createTagService(h.ctx);
    const characterId = await seedCharacter(db, owner);
    const tagId = await seedTag(db, owner, { id: "tag_flip", name: "gothic" });
    await svc.attachTag({ principal: principal(owner), tagId, targetType: "character", targetId: characterId, status: "pending" });
    const staged = await svc.listTagFilterVocabulary({ principal: principal(owner) });
    expect(staged.find((entry) => entry.name === "gothic")?.characters).toBe(0);

    // The editor's Accept — re-attaching with `accepted` flips the pending row.
    await svc.attachTag({ principal: principal(owner), tagId, targetType: "character", targetId: characterId, status: "accepted" });

    const accepted = await svc.listTagFilterVocabulary({ principal: principal(owner) });
    expect(accepted.find((entry) => entry.name === "gothic")?.characters).toBe(1);
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
