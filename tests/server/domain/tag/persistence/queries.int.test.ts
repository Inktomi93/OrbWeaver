// persistence/queries — owner-scoped reads/writes against a real :memory: db. Covers the owner predicate
// (foreign rows invisible), the sortOrder→name ordering, the N-query usage rollup correctness, prune, the
// batch set-order, and the FK cascade (delete tag → junction rows gone).

import { characterTags, tags } from "@orb/db";
import type { TagId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import { describe } from "vitest";
import { insertJunctionRow } from "../../../../../packages/server/src/domain/tag/persistence/junctions.ts";
import {
  deleteOwnedTag,
  fetchOwnedTagIds,
  listOwnedTags,
  listOwnedTagsWithUsage,
  loadOwnedTag,
  pruneZeroUsageTags,
  setTagOrderBatch,
  toTagView,
  updateOwnedTag,
} from "../../../../../packages/server/src/domain/tag/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { seedCharacter, seedChat, seedTag, seedUser } from "../_support.ts";

describe("tag persistence/queries", () => {
  test("loadOwnedTag returns the owner's row and hides a foreign owner's row", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_owner");
    const other = await seedUser(db, "user_other");
    const tagId = await seedTag(db, owner, { id: "tag_a", name: "alpha" });

    expect(await loadOwnedTag(db, tagId, owner)).toMatchObject({ id: tagId, name: "alpha" });
    expect(await loadOwnedTag(db, tagId, other)).toBeUndefined();
  });

  test("listOwnedTags orders manual-sort first then name (nulls last by name)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    await seedTag(db, owner, { id: "tag_z", name: "zeta" });
    await seedTag(db, owner, { id: "tag_a", name: "alpha" });
    await seedTag(db, owner, { id: "tag_m", name: "mid", sortOrder: 0 });

    const names = (await listOwnedTags(db, owner)).map((t) => t.name);
    // mid (sortOrder 0) first; then the unordered pair by name (alpha, zeta).
    expect(names).toEqual(["mid", "alpha", "zeta"]);
  });

  test("owned-tag-id filter returns only the owner's subset of the requested ids", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_owner");
    const other = await seedUser(db, "user_other");
    const mine = await seedTag(db, owner, { id: "tag_mine", name: "mine" });
    const theirs = await seedTag(db, other, { id: "tag_theirs", name: "theirs" });

    const owned = await fetchOwnedTagIds(db, owner, [mine, theirs, castId<TagId>("tag_ghost")]);
    expect(owned).toEqual([mine]);
  });

  test("updateOwnedTag patches the row; a foreign owner matches nothing", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_owner");
    const other = await seedUser(db, "user_other");
    const tagId = await seedTag(db, owner, { id: "tag_a", name: "alpha" });

    const updated = await updateOwnedTag(db, tagId, owner, { color: "#fff", folderType: "OPEN" });
    expect(updated).toMatchObject({ color: "#fff", folderType: "OPEN" });
    expect(await updateOwnedTag(db, tagId, other, { color: "#000" })).toBeUndefined();
  });

  test("deleteOwnedTag removes the row and CASCADES its junction rows", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const characterId = await seedCharacter(db, owner);
    const tagId = await seedTag(db, owner, { id: "tag_a", name: "alpha" });
    await insertJunctionRow({
      db,
      targetType: "character",
      targetId: characterId,
      tagId,
      taggerId: owner,
      status: "accepted",
    });

    const removed = await deleteOwnedTag(db, tagId, owner);
    expect(removed).toBe(1);
    const junctionRows = await db
      .select()
      .from(characterTags)
      .where(eq(characterTags.tagId, tagId));
    expect(junctionRows).toHaveLength(0);
  });

  test("setTagOrderBatch stamps sortOrder by position, owner-scoped", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const a = await seedTag(db, owner, { id: "tag_a", name: "a" });
    const b = await seedTag(db, owner, { id: "tag_b", name: "b" });

    await setTagOrderBatch(db, owner, [b, a]);
    const rowB = await db.select().from(tags).where(eq(tags.id, b));
    const rowA = await db.select().from(tags).where(eq(tags.id, a));
    expect(rowB[0]?.sortOrder).toBe(0);
    expect(rowA[0]?.sortOrder).toBe(1);
  });

  test("listOwnedTagsWithUsage rolls up mixed-junction coverage and totals", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const characterId = await seedCharacter(db, owner);
    const chatId = await seedChat(db);
    const used = await seedTag(db, owner, { id: "tag_used", name: "used" });
    const unused = await seedTag(db, owner, { id: "tag_unused", name: "unused" });
    await insertJunctionRow({
      db,
      targetType: "character",
      targetId: characterId,
      tagId: used,
      taggerId: owner,
      status: "accepted",
    });
    await insertJunctionRow({
      db,
      targetType: "chat",
      targetId: chatId,
      tagId: used,
      taggerId: owner,
      status: "accepted",
    });

    const rollup = await listOwnedTagsWithUsage(db, owner);
    const usedRow = rollup.find((t) => t.id === used);
    const unusedRow = rollup.find((t) => t.id === unused);
    expect(usedRow?.usage).toMatchObject({ characters: 1, chats: 1, total: 2 });
    expect(unusedRow?.usage).toMatchObject({ total: 0 });
  });

  test("pruneZeroUsageTags deletes only zero-usage tags and returns the count", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const characterId = await seedCharacter(db, owner);
    const used = await seedTag(db, owner, { id: "tag_used", name: "used" });
    await seedTag(db, owner, { id: "tag_dead1", name: "dead1" });
    await seedTag(db, owner, { id: "tag_dead2", name: "dead2" });
    await insertJunctionRow({
      db,
      targetType: "character",
      targetId: characterId,
      tagId: used,
      taggerId: owner,
      status: "accepted",
    });

    const removed = await pruneZeroUsageTags(db, owner);
    expect(removed).toBe(2);
    const survivors = (await listOwnedTags(db, owner)).map((t) => t.id);
    expect(survivors).toEqual([used]);
  });

  test("toTagView drops ownerId/createdAt and keeps the wire fields", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const tagId = await seedTag(db, owner, { id: "tag_a", name: "alpha" });
    const row = await db
      .select()
      .from(tags)
      .where(and(eq(tags.id, tagId), eq(tags.ownerId, owner)));
    const seeded = row[0];
    if (seeded === undefined) {
      throw new Error("seeded row missing");
    }
    const view = toTagView(seeded);
    expect(view).toStrictEqual({
      id: tagId,
      name: "alpha",
      color: null,
      color2: null,
      source: null,
      folderType: "NONE",
      sortOrder: null,
      isHiddenOnCard: false,
    });
    expect(view).not.toHaveProperty("ownerId");
  });
});
