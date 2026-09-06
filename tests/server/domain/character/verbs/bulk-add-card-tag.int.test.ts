// verb: bulkAddCardTag — owner-scopes targets, then routes each to the injected tag port. Load-bearing:
// unowned characters are never attached to; a blank name is a no-op (no port calls). The final case wires
// the REAL tag verb (`attachCardTagByName`) over the same db — mirroring the composition root's
// `attachCardTag: tag.attachCardTagByName` 1:1 binding — and asserts the rows actually land in
// `tags`/`character_tags`, so a break in tag's resolve-or-create-and-attach is visible from character's tree.

import { characterTags, tags } from "@orb/db";
import { DomainOperationError } from "@orb/kit/errors";
import type { CharacterHandle, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createCharacterService } from "@orb/server/domain/character";
import { and, eq } from "drizzle-orm";
import { describe } from "vitest";
import { createAttachCardTagByName } from "../../../../../packages/server/src/domain/tag/verbs/attach-card-tag-by-name.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
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

  test("one failing attach still audits + ANNOUNCES the siblings that committed, and NAMES the failure in the result (#1694)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const base = createCharacterService(h.ctx);
    const a = await base.create({ principal: principal(owner), input: { handle: castId<CharacterHandle>("a"), name: "A", description: "d" } });
    const b = await base.create({ principal: principal(owner), input: { handle: castId<CharacterHandle>("b"), name: "B", description: "d" } });
    h.audits.length = 0;
    h.userEvents.length = 0;

    // The per-character attaches are independent writes. Under `Promise.all` the first rejection abandoned
    // the verb before the audit/emit block, so B's committed tag change was never announced and the client
    // kept rendering a stale card. The verb used to rethrow the first rejection unchanged, laundering B's
    // real success into one opaque failure for the whole batch (#1694) — it now resolves with the honest
    // per-item split instead.
    const svc = createCharacterService({
      ...h.ctx,
      attachCardTag: async (args): Promise<boolean> => (args.characterId === a.id ? await Promise.reject(new Error("the tag store is down")) : true),
    });

    const result = await svc.bulkAddCardTag({ principal: principal(owner), tagName: "hero", characterIds: [a.id, b.id] });

    expect(result.applied).toEqual([b.id]);
    expect(result.failed).toEqual([{ id: a.id, error: { code: "unexpected", message: "the tag store is down" } }]);
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]?.entry.metadata).toEqual({ tag: "hero", updated: 1 });
    expect(h.userEvents).toEqual([{ userId: owner, event: { type: "charactersChanged" } }]);
  });

  test("a DomainOperationError('tag_resolve_failed', …) reads through as its own typed code, not `unexpected`", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const base = createCharacterService(h.ctx);
    const a = await base.create({ principal: principal(owner), input: { handle: castId<CharacterHandle>("a"), name: "A", description: "d" } });

    const svc = createCharacterService({
      ...h.ctx,
      attachCardTag: (): Promise<boolean> =>
        Promise.reject(new DomainOperationError("tag_resolve_failed", 'resolve-or-create tag "hero" found no row after a unique conflict')),
    });

    const result = await svc.bulkAddCardTag({ principal: principal(owner), tagName: "hero", characterIds: [a.id] });

    expect(result.applied).toEqual([]);
    expect(result.failed).toEqual([
      { id: a.id, error: { code: "tag_resolve_failed", message: 'resolve-or-create tag "hero" found no row after a unique conflict' } },
    ]);
  });
});
