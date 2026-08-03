// verb: bulkAddCardTag — owner-scopes targets, then routes each to the injected tag port. Load-bearing:
// unowned characters are never attached to; a blank name is a no-op (no port calls). The final case wires
// the REAL tag verb (`attachCardTagByName`) over the same db — mirroring the composition root's
// `attachCardTag: tag.attachCardTagByName` 1:1 binding — and asserts the rows actually land in
// `tags`/`character_tags`, so a break in tag's resolve-or-create-and-attach is visible from character's tree.

import { characterTags, tags } from "@orb/db";
import type { CharacterHandle, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createCharacterService } from "@orb/server/domain/character";
import { and, eq } from "drizzle-orm";
import { describe } from "vitest";
import { createAttachCardTagByName } from "../../../../../packages/server/src/domain/tag/verbs/attach-card-tag-by-name.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeTagHarness } from "../../tag/_support.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("bulk add card tag", () => {
  test("calls the tag port once per OWNED character and skips foreign ones", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const a = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("a"), name: "A", description: "d" },
    });
    const b = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("b"), name: "B", description: "d" },
    });
    const foreign = await svc.create({
      principal: principal(other),
      input: { handle: castId<CharacterHandle>("c"), name: "C", description: "d" },
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

  test("REAL tag wire: the bulk op lands rows in tags + character_tags (owner-scoped, foreign skipped)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    // Bind the REAL tag verb over the SAME db, exactly as compose does (`attachCardTag: tag.attachCardTagByName`).
    const tagHarness = makeTagHarness(db);
    const attachCardTagByName = createAttachCardTagByName(tagHarness.ctx);
    const svc = createCharacterService({ ...h.ctx, attachCardTag: attachCardTagByName });

    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const a = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("a"), name: "A", description: "d" },
    });
    const foreign = await svc.create({
      principal: principal(other),
      input: { handle: castId<CharacterHandle>("c"), name: "C", description: "d" },
    });

    await svc.bulkAddCardTag({
      principal: principal(owner),
      tagName: "  Hero  ",
      characterIds: [a.id, foreign.id],
    });

    // The owner's tag row was resolve-or-created ONCE, name normalized (trim; display casing kept).
    const tagRows = await db.select().from(tags).where(eq(tags.ownerId, owner));
    expect(tagRows).toHaveLength(1);
    const tagRow = tagRows[0];
    if (tagRow === undefined) {
      throw new Error("expected one owner tag row");
    }
    expect(tagRow.name).toBe("Hero");
    // manual/accepted defaults (character's manual add — not import's card/pending).
    expect(tagRow.source).toBe("manual");

    // The junction landed for the OWNED card only (foreign was owner-gated out before the port).
    const junctions = await db.select().from(characterTags).where(eq(characterTags.tagId, tagRow.id));
    expect(junctions.map((j) => j.characterId)).toEqual([a.id]);
    expect(junctions[0]?.status).toBe("accepted");

    // The foreign character got NO junction row.
    const foreignJunctions = await db
      .select()
      .from(characterTags)
      .where(and(eq(characterTags.characterId, foreign.id)));
    expect(foreignJunctions).toHaveLength(0);
  });

  test("a blank tag name is a no-op (no port calls)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const a = await svc.create({
      principal: principal(owner),
      input: { handle: castId<CharacterHandle>("a"), name: "A", description: "d" },
    });
    await svc.bulkAddCardTag({ principal: principal(owner), tagName: "   ", characterIds: [a.id] });
    expect(h.tagAttaches).toEqual([]);
  });
});
