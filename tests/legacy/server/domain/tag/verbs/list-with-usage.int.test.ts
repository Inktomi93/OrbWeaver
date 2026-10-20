// verb: listTagsWithUsage — the five-junction usage rollup per owned tag.
// @subject packages/server/src/domain/tag/verbs/list-with-usage.ts

import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { createTagService } from "#server/domain/tag/index.ts";
import { makeTagHarness, principal, seedCharacter, seedPersona, seedTag, seedUser } from "../_support.ts";

describe("listTagsWithUsage", () => {
  test("pending suggestions are neither adopted usage nor prune candidates", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    const characterId = await seedCharacter(db, owner);
    const tagId = await seedTag(db, owner);
    await svc.attachTag({ principal: await principal(db, owner), tagId, targetType: "character", targetId: characterId, status: "pending" });
    expect((await svc.listTagsWithUsage({ principal: await principal(db, owner) }))[0]).toMatchObject({
      usage: { characters: 0, total: 0 },
      pendingSuggestions: 1,
    });
    expect(await svc.pruneUnusedTags({ principal: await principal(db, owner) })).toEqual({ removed: 0 });
    await svc.attachTag({ principal: await principal(db, owner), tagId, targetType: "character", targetId: characterId, status: "accepted" });
    expect((await svc.listTagsWithUsage({ principal: await principal(db, owner) }))[0]).toMatchObject({
      usage: { characters: 1, total: 1 },
      pendingSuggestions: 0,
    });
  });

  test("a seed tag with only a pending row is not unused, and prune leaves it", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createTagService(makeTagHarness(db).ctx);
    const characterId = await seedCharacter(db, owner);
    const seedId = await seedTag(db, owner, { id: "tag_seed", name: "default" });
    await svc.attachTag({ principal: await principal(db, owner), tagId: seedId, targetType: "character", targetId: characterId, status: "pending" });
    expect((await svc.listTagsWithUsage({ principal: await principal(db, owner) })).find((t) => t.id === seedId)).toMatchObject({ pendingSuggestions: 1 });
    expect(await svc.pruneUnusedTags({ principal: await principal(db, owner) })).toEqual({ removed: 0 });
    expect((await svc.listTagsWithUsage({ principal: await principal(db, owner) })).some((t) => t.id === seedId)).toBe(true);
  });

  test("rolls up per-junction counts and the total", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const h = makeTagHarness(db);
    const svc = createTagService(h.ctx);
    const characterId = await seedCharacter(db, owner);
    const personaId = await seedPersona(db, owner);
    const tagId = await seedTag(db, owner, { id: "tag_a", name: "alpha" });
    await svc.attachTag({
      principal: await principal(db, owner),
      tagId,
      targetType: "character",
      targetId: characterId,
    });
    await svc.attachTag({
      principal: await principal(db, owner),
      tagId,
      targetType: "persona",
      targetId: personaId,
    });

    const rollup = await svc.listTagsWithUsage({ principal: await principal(db, owner) });
    const row = rollup.find((t) => t.id === tagId);
    expect(row?.usage).toMatchObject({ characters: 1, personas: 1, chats: 0, total: 2 });
  });
});
