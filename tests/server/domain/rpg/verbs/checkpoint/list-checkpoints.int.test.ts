// verbs/checkpoint/list-checkpoints — listCheckpoints (rpg-design/05 §4.4, §6.2). Member-gated read of the
// game's labeled bookmarks.

import type { Db } from "@orb/db";
import { beforeEach, describe } from "vitest";
import { freshDb } from "../../../../../support/db";
import { expect, principal, seedLiteGame, test } from "../../_support";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

describe("listCheckpoints", () => {
  test("returns the game's checkpoints (the just-created one)", async () => {
    const { chatId, h } = await seedLiteGame(db);
    await h.service.editSnapshot({ principal: principal("host"), chatId, patch: { location: "The Ruins" } });
    const checkpointId = await h.service.createCheckpoint({ principal: principal("host"), chatId, label: "before the fight" });

    const list = await h.service.listCheckpoints({ principal: principal("host"), chatId });
    expect(list.map((c) => c.label)).toEqual(["before the fight"]);
    expect(list[0]?.id).toBe(checkpointId);
  });
});
