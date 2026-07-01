import type { Db } from "@orb/db";
import { beforeEach, describe } from "vitest";
import { createStatsService } from "../../../../../packages/server/src/domain/stats/service.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { seedCharacter, seedChat, seedMessage, seedUser, T0 } from "../_support.ts";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("stats.activityHeatmap", () => {
  test("counts user + assistant turns in the owner's chats", async () => {
    const owner = await seedUser(db);
    const ch = await seedCharacter(db, owner);
    const chatId = await seedChat(db, ch);
    await seedMessage(db, {
      chatId,
      seq: 1,
      role: "user",
      createdAt: T0,
      variants: [{ content: "x" }],
    });
    await seedMessage(db, {
      chatId,
      seq: 2,
      role: "assistant",
      characterId: ch,
      createdAt: T0,
      variants: [{ content: "y" }],
    });
    const svc = createStatsService(db);
    const h = await svc.activityHeatmap(owner);
    expect(h.total).toBe(2);
  });
});
