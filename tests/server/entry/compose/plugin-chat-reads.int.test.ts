// entry/compose/plugin-chat-reads — the SQL that decides which canon bytes reach an UNTRUSTED plugin guest
// realm, against a real libSQL db. The security property proven here is the D16 floor: `floorSeq` is applied
// in the WHERE, so a `from-join`-clamped installer's plugin can never read a pre-join row's content, and the
// `limit` still pages what that human may actually see (a post-filter would silently shrink their page).
//
// The floor VALUE is resolved upstream by chat's `resolveViewerVisibility` (the bridge); this file proves the
// read honours it. A non-member never reaches here — the bridge short-circuits to `[]`.

import type { Db } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { loadPluginMessages } from "../../../../packages/server/src/entry/compose/plugin-chat-reads.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { seedChat, seedMessage } from "../../domain/chat/_support.ts";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

/** Seed `row-<seq>` slots SEQUENTIALLY (the seeder does the 3-step circular-FK dance per row). */
async function seedRows(chatId: ChatId, seqs: readonly number[]): Promise<void> {
  await seqs.reduce(async (prev, seq) => {
    await prev;
    await seedMessage(db, chatId, seq, { content: `row-${seq}` });
  }, Promise.resolve());
}

describe("loadPluginMessages — the guest canon read honours the viewer floor", () => {
  test("a positive floor withholds every pre-join row and is INCLUSIVE at the floor itself", async () => {
    const chatId = await seedChat(db, "a");
    await seedRows(chatId, [1, 2, 3, 4, 5]);

    const clamped = await loadPluginMessages(db, chatId, { floorSeq: 3, readsHidden: true });

    expect(clamped.map((m) => m.seq)).toEqual([3, 4, 5]);
    expect(clamped.map((m) => m.content)).not.toContain("row-2");
  });

  test("floor 0 (the unclamped `full` member — the common case) returns the whole page, oldest→newest", async () => {
    const chatId = await seedChat(db, "a");
    await seedRows(chatId, [1, 2, 3]);

    const unclamped = await loadPluginMessages(db, chatId, { floorSeq: 0, readsHidden: true });

    expect(unclamped.map((m) => m.seq)).toEqual([1, 2, 3]);
  });

  test("the floor is in the WHERE, not a post-filter — a clamped reader still gets a FULL page of visible rows", async () => {
    const chatId = await seedChat(db, "a");
    await seedRows(chatId, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    // limit 3 with floor 6: a post-filter would take the newest 3 (8,9,10) then drop nothing here, but on a
    // page that STRADDLES the floor it would return fewer than 3. Ask for a straddling page to prove it.
    const page = await loadPluginMessages(db, chatId, { limit: 3, floorSeq: 6, readsHidden: true });

    expect(page.map((m) => m.seq)).toEqual([8, 9, 10]);
    const straddling = await loadPluginMessages(db, chatId, { limit: 6, floorSeq: 6, readsHidden: true });
    expect(straddling.map((m) => m.seq)).toEqual([6, 7, 8, 9, 10]); // never a row below the floor
  });

  // §3.6 / D106: the plugin realm is a member-reachable guest surface (runSnippet runs as ANY present member).
  // A non-host member's read (`readsHidden:false`) must STRIP hidden-class spans BEFORE the body crosses the
  // realm boundary; a host (`readsHidden:true`) reads the truth verbatim (the reveal plane).
  test("SECURITY: a member read (readsHidden:false) strips hidden spans; a host read (true) is verbatim", async () => {
    const chatId = await seedChat(db, "hs");
    const lie = '<lie character="Z" truth="he is the mole"/>';
    await seedMessage(db, chatId, 1, { content: `He smiles. ${lie} "Nothing."` });

    const member = await loadPluginMessages(db, chatId, { floorSeq: 0, readsHidden: false });
    expect(member[0]?.content).toBe('He smiles.  "Nothing."');
    expect(member[0]?.content).not.toContain("mole");

    const host = await loadPluginMessages(db, chatId, { floorSeq: 0, readsHidden: true });
    expect(host[0]?.content).toContain("mole");
  });
});
