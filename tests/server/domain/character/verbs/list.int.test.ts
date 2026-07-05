// verb: list — owner-scoped, newest-first, cursor-paged. Load-bearing INVARIANT 3: synthetic group
// buckets NEVER appear in a user-facing list (they'd leak the hidden memory identities). Also
// owner-scoped (no foreign rows). Paging mirrors `domain/notifications`'s `{items, nextCursor}` contract
// test shape (first page + nextCursor, a second page, empty, a bounded limit) plus the compound-cursor
// tiebreak the `domain/assets` precedent exists for (a frozen clock stamps ties on `createdAt`).

import { characterTags, tags } from "@orb/db";
import type { TagId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createCharacterService } from "@orb/server/domain/character";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedRawCharacter, seedUser } from "../_support.ts";

describe("list", () => {
  test("returns the owner's characters newest-first, excluding other owners", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const other = await seedUser(db, { handle: "other" });

    await svc.create({
      principal: principal(owner),
      input: { handle: "a", name: "A", description: "d" },
    });
    h.advance(1000);
    const second = await svc.create({
      principal: principal(owner),
      input: { handle: "b", name: "B", description: "d" },
    });
    await svc.create({
      principal: principal(other),
      input: { handle: "c", name: "C", description: "d" },
    });

    const page = await svc.list({ principal: principal(owner) });
    expect(page.items.map((r) => r.handle)).toEqual(["b", "a"]);
    expect(page.items[0]?.id).toBe(second.id);
    expect(page.items[0]?.tokenSize).toBeGreaterThan(0);
    expect(page.nextCursor).toBeNull();
  });

  test("synthetic group buckets are excluded from the list (invariant 3)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    await svc.create({
      principal: principal(owner),
      input: { handle: "real", name: "Real", description: "d" },
    });
    await seedRawCharacter(db, {
      id: "character_grp",
      ownerId: owner,
      handle: "__group__chat_1",
      synthetic: true,
    });

    const page = await svc.list({ principal: principal(owner) });
    expect(page.items.map((r) => r.handle)).toEqual(["real"]);
  });

  test("an owner with no characters gets an empty page (nextCursor null)", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });

    const page = await svc.list({ principal: principal(owner) });
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });
});

describe("list — cursor paging", () => {
  test("a bounded limit pages the remainder via nextCursor, then null", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });

    const a = await svc.create({
      principal: principal(owner),
      input: { handle: "a", name: "A", description: "d" },
    });
    h.advance(1000);
    const b = await svc.create({
      principal: principal(owner),
      input: { handle: "b", name: "B", description: "d" },
    });
    h.advance(1000);
    const c = await svc.create({
      principal: principal(owner),
      input: { handle: "c", name: "C", description: "d" },
    });

    const first = await svc.list({ principal: principal(owner), limit: 2 });
    expect(first.items.map((r) => r.id)).toEqual([c.id, b.id]);
    expect(first.nextCursor).toEqual({ createdAt: b.createdAt, id: b.id });

    const cursor = first.nextCursor;
    if (cursor === null) {
      throw new Error("expected a page cursor");
    }
    const second = await svc.list({ principal: principal(owner), limit: 2, cursor });
    expect(second.items.map((r) => r.id)).toEqual([a.id]);
    expect(second.nextCursor).toBeNull();
  });

  test("a createdAt tie (frozen clock, no advance between creates) is broken by id — no skip, no dupe", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createCharacterService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });

    // Both created at the SAME frozen instant — createdAt alone can't order them.
    const first = await svc.create({
      principal: principal(owner),
      input: { handle: "tie-1", name: "Tie1", description: "d" },
    });
    const second = await svc.create({
      principal: principal(owner),
      input: { handle: "tie-2", name: "Tie2", description: "d" },
    });
    expect(first.createdAt).toBe(second.createdAt);

    const firstPage = await svc.list({ principal: principal(owner), limit: 1 });
    expect(firstPage.items).toHaveLength(1);
    // A FULL page always carries a cursor (mirrors notifications — no lookahead peek); exhaustion is
    // discovered on the NEXT fetch, which comes back short.
    expect(firstPage.nextCursor).not.toBeNull();

    const cursor = firstPage.nextCursor;
    if (cursor === null) {
      throw new Error("expected a page cursor");
    }
    const secondPage = await svc.list({ principal: principal(owner), limit: 1, cursor });
    expect(secondPage.items).toHaveLength(1);
    // The two pages, together, cover both ties exactly once (no skip, no dupe) — order-independent.
    const seenIds = new Set([...firstPage.items, ...secondPage.items].map((r) => r.id));
    expect(seenIds).toEqual(new Set([first.id, second.id]));

    const secondCursor = secondPage.nextCursor;
    if (secondCursor === null) {
      throw new Error("expected a page cursor (the second page was also full)");
    }
    const thirdPage = await svc.list({
      principal: principal(owner),
      limit: 1,
      cursor: secondCursor,
    });
    expect(thirdPage.items).toEqual([]);
    expect(thirdPage.nextCursor).toBeNull();
  });
});

describe("list — canonical tags (the library tag filter)", () => {
  test("each summary carries its ACCEPTED tags; pending suggestions and other rows' tags don't bleed", async () => {
    const db = await freshDb();
    const svc = createCharacterService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const tagged = await svc.create({
      principal: principal(owner),
      input: { handle: "tagged", name: "Tagged", description: "d" },
    });
    const bare = await svc.create({
      principal: principal(owner),
      input: { handle: "bare", name: "Bare", description: "d" },
    });
    const fantasy = castId<TagId>("tag_fantasy");
    const staged = castId<TagId>("tag_staged");
    await db.insert(tags).values([
      { id: fantasy, ownerId: owner, name: "fantasy" },
      { id: staged, ownerId: owner, name: "staged" },
    ]);
    await db.insert(characterTags).values([
      { characterId: tagged.id, tagId: fantasy, status: "accepted" },
      { characterId: tagged.id, tagId: staged, status: "pending" },
    ]);

    const page = await svc.list({ principal: principal(owner) });

    const taggedRow = page.items.find((r) => r.id === tagged.id);
    const bareRow = page.items.find((r) => r.id === bare.id);
    expect(taggedRow?.tags.map((t) => t.name)).toEqual(["fantasy"]);
    expect(bareRow?.tags).toEqual([]);
  });
});
