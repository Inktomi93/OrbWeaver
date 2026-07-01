// verb: listTagsWithUsage — the five-junction usage rollup per owned tag.

import { createTagService } from "@orb/server/domain/tag";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import {
  makeTagHarness,
  principal,
  seedCharacter,
  seedPersona,
  seedTag,
  seedUser,
} from "../_support.ts";

describe("listTagsWithUsage", () => {
  test("rolls up per-junction counts and the total", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const h = makeTagHarness(db);
    const svc = createTagService(h.ctx);
    const characterId = await seedCharacter(db, owner);
    const personaId = await seedPersona(db, owner);
    const tagId = await seedTag(db, owner, { id: "tag_a", name: "alpha" });
    await svc.attachTag({
      principal: principal(owner),
      tagId,
      targetType: "character",
      targetId: characterId,
    });
    await svc.attachTag({
      principal: principal(owner),
      tagId,
      targetType: "persona",
      targetId: personaId,
    });

    const rollup = await svc.listTagsWithUsage({ principal: principal(owner) });
    const row = rollup.find((t) => t.id === tagId);
    expect(row?.usage).toMatchObject({ characters: 1, personas: 1, chats: 0, total: 2 });
  });
});
