// verbs/read/list-journal — listJournal (docs/plans/rpg/design.md). The paged, lineage-projected journal view.

import type { Db } from "@orb/db";
import type { Handle, RpgJournalId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { insertJournalEntry } from "../../../../../../packages/server/src/domain/rpg/persistence/journal.ts";
import { freshDb } from "../../../../../support/db.ts";
import { expect, FROZEN_AT, principal, seedLiteGame, seedMessage, test } from "../../_support.ts";

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

// #1528 — the journal is the OTHER member-facing free-text plane (the source half of #1398, whose fork strip
// already belts a journal `title`/`content` precisely because a member could read these bytes here).
// Principals: `host` holds the room's host seat, `member` is a plain present member.
const HIDDEN = '<lie character="Mara" truth="she is the informant"/>';
const TRUTH = "she is the informant";

describe("listJournal — hidden spans are the HOST's plane, not the member's", () => {
  test("a member reads the entry STRIPPED (title AND content); the host reads it whole", async () => {
    const { chatId, h } = await seedLiteGame(db);
    h.fakes.membership.set("user_member", "member");
    await h.service.addJournalEntry({
      principal: principal(castId<Handle>("host")),
      chatId,
      type: "note",
      title: `Prologue ${HIDDEN}`,
      content: `They met at the ford ${HIDDEN}`,
    });

    const memberEntries = await h.service.listJournal({ principal: principal(castId<Handle>("member")), chatId });
    const hostEntries = await h.service.listJournal({ principal: principal(castId<Handle>("host")), chatId });

    expect(JSON.stringify(memberEntries)).not.toContain(TRUTH);
    expect(memberEntries[0]?.title).toBe("Prologue ");
    expect(memberEntries[0]?.content).toBe("They met at the ford ");
    expect(hostEntries[0]?.content).toBe(`They met at the ford ${HIDDEN}`);
  });
});

// #1528 — THE D16 FLOOR. The journal is the rpg plane that keeps PER-TURN rows: a model entry stamps the slot
// it was distilled from, so a `from-join` member reading it unfloored reads a summary of canon their own
// `listMessages` withholds — the same story, one derivation removed. Principals: `host` (unclamped, F2 —
// "authority implies visibility"), `member` clamped to a floor of seq 3 (they joined at the third slot).
describe("listJournal — the D16 history floor", () => {
  test("a from-join member does not read entries distilled from PRE-JOIN turns; the host reads them all", async () => {
    const { chatId, gameId, h } = await seedLiteGame(db);
    h.fakes.membership.set("user_member", "member");
    h.fakes.historyFloor.set("user_member", 3);
    const preJoin = await seedMessage(db, chatId, 1, { role: "assistant" });
    const postJoin = await seedMessage(db, chatId, 4, { role: "assistant" });
    await insertJournalEntry(db, {
      id: castId<RpgJournalId>("rpg_journal_pre"),
      gameId,
      type: "note",
      label: "",
      title: "Before they arrived",
      content: "the pact was sworn",
      variantId: null,
      sourceMessageId: preJoin.messageId,
      createdAt: FROZEN_AT,
    });
    await insertJournalEntry(db, {
      id: castId<RpgJournalId>("rpg_journal_post"),
      gameId,
      type: "note",
      label: "",
      title: "After they arrived",
      content: "the ford was crossed",
      variantId: null,
      sourceMessageId: postJoin.messageId,
      createdAt: FROZEN_AT,
    });
    // A HAND entry carries NO canon anchor (`sourceMessageId IS NULL`) — the anchorless-rides-through rule the
    // chat event clamp states. A host's room note is not a pre-join turn.
    await h.service.addJournalEntry({ principal: principal(castId<Handle>("host")), chatId, type: "note", title: "Room rules", content: "no PvP" });

    const memberTitles = (await h.service.listJournal({ principal: principal(castId<Handle>("member")), chatId })).map((e) => e.title);
    const hostTitles = (await h.service.listJournal({ principal: principal(castId<Handle>("host")), chatId })).map((e) => e.title);

    expect(memberTitles.sort()).toEqual(["After they arrived", "Room rules"]);
    expect(hostTitles.sort()).toEqual(["After they arrived", "Before they arrived", "Room rules"]);
  });
});
