// verbs/read/list-journal — listJournal (rpg-design/05 §4.8, §6.2). The paged, lineage-projected journal view.

import type { Db } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, principal, seedLiteGame, test } from "../../_support.ts";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

describe("listJournal", () => {
  test("returns the game's entries (a just-added hand entry)", async () => {
    const { chatId, h } = await seedLiteGame(db);
    await h.service.addJournalEntry({ principal: principal(castId<Handle>("host")), chatId, type: "note", title: "Prologue", content: "…" });

    const entries = await h.service.listJournal({ principal: principal(castId<Handle>("host")), chatId });
    expect(entries.map((e) => e.title)).toEqual(["Prologue"]);
  });
});
