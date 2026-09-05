// `createCopyHandoffRegexScripts` — the regex half of the host-handoff property offer (#1739), against a
// real db. The chat-level end-to-end lives in `tests/server/domain/chat/substrate/handoff-copy.int.test.ts`;
// this file pins the mechanism the room-level arm rides on:
//
//   • WHO IS A CANDIDATE — only chat-tier attachments the DEPARTING host owns. A prior host's row attached to
//     the same room is not theirs to give and is left exactly where it is (a junction is not a license).
//   • THE RE-POINT IS RETURNED UNEXECUTED — nothing about the ROOM has moved until the caller batches it, so
//     a crash between the mint and the swap leaves the nominee holding ordinary library rows and the room
//     still pointing at the originals.
//   • DEDUP AGAINST THE RECIPIENT'S OWN LIBRARY — a content-equal row they already own is re-used rather than
//     duplicated, which is also what makes a RETRIED accept converge (there is no provenance column here).
//   • ORDER IS DATA — the copy inherits the source's junction `position`, so the room's transform chain is
//     unchanged across the handoff.
//   • AND THE POINT OF THE WHOLE ARM: after the move the SITTING host owns the row, so the owner-gated levers
//     (`updateScript`) finally reach it, and the departed host's edits no longer do.

import { chatRegexScripts, regexScripts } from "@orb/db";
import { batchMany } from "@orb/db/kit";
import type { Handle, RegexScriptId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRegexService } from "@orb/server/domain/regex";
import { and, eq } from "drizzle-orm";
import { describe } from "vitest";
import { createCopyHandoffRegexScripts } from "../../../../../packages/server/src/domain/regex/persistence/handoff-copy-write.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { allowChat, behavior, makeHarness, principal, seedChat, seedScript, seedUser } from "../_support.ts";

const AT = 4242;

/** The factory under test with a frozen clock + a counting minter (`regex_script_copy_<n>`). */
function copier(db: Parameters<typeof makeHarness>[0]): ReturnType<typeof createCopyHandoffRegexScripts> {
  let n = 0;
  return createCopyHandoffRegexScripts({
    db,
    now: (): number => AT,
    newScriptId: (): RegexScriptId => {
      n += 1;
      return castId<RegexScriptId>(`regex_script_copy_${n}`);
    },
  });
}

describe("copyHandoffRegexScripts", () => {
  test("the departing host's chat scripts are copied and the returned re-point moves the room onto them", async () => {
    const db = await freshDb();
    const oldHost = await seedUser(db, { id: "user_old", handle: castId<Handle>("old") });
    const newHost = await seedUser(db, { id: "user_new", handle: castId<Handle>("new") });
    const chatId = await seedChat(db);
    const first = await seedScript(db, { id: "regex_script_a", ownerId: oldHost, name: "Strip tags", behavior: behavior({ findRegex: "<[^>]+>" }) });
    const second = await seedScript(db, { id: "regex_script_b", ownerId: oldHost, name: "Rename", behavior: behavior({ findRegex: "Bob" }) });
    await db.insert(chatRegexScripts).values([
      { chatId, regexScriptId: second, position: 1, createdAt: 1 },
      { chatId, regexScriptId: first, position: 0, createdAt: 1 },
    ]);

    const repoint = await copier(db)({ fromOwnerId: oldHost, toOwnerId: newHost, chatId });

    // The library half landed immediately; the ROOM has not moved yet — that is the crash contract.
    const copies = await db.select().from(regexScripts).where(eq(regexScripts.ownerId, newHost));
    expect(copies.map((c) => c.name).sort()).toEqual(["Rename", "Strip tags"]);
    expect((await db.select().from(chatRegexScripts).where(eq(chatRegexScripts.chatId, chatId))).map((r) => r.regexScriptId).sort()).toEqual([first, second]);

    await db.batch(batchMany([...repoint]));

    const attached = await db.select().from(chatRegexScripts).where(eq(chatRegexScripts.chatId, chatId));
    expect(attached).toHaveLength(2);
    // Positions survive the move — the room's run order is byte-identical.
    const stripCopy = copies.find((c) => c.name === "Strip tags");
    expect(attached.find((a) => a.regexScriptId === stripCopy?.id)?.position).toBe(0);
    expect(attached.some((a) => a.regexScriptId === first || a.regexScriptId === second)).toBe(false);
    // The originals are untouched in the departed host's library.
    expect(await db.select().from(regexScripts).where(eq(regexScripts.ownerId, oldHost))).toHaveLength(2);
  });

  test("a chat script the departing host does NOT own is never copied and never detached", async () => {
    const db = await freshDb();
    const oldHost = await seedUser(db, { id: "user_old", handle: castId<Handle>("old") });
    const newHost = await seedUser(db, { id: "user_new", handle: castId<Handle>("new") });
    const stranger = await seedUser(db, { id: "user_stranger", handle: castId<Handle>("stranger") });
    const chatId = await seedChat(db);
    const foreign = await seedScript(db, { id: "regex_script_foreign", ownerId: stranger, name: "Not theirs" });
    await db.insert(chatRegexScripts).values({ chatId, regexScriptId: foreign, position: 0, createdAt: 1 });

    const repoint = await copier(db)({ fromOwnerId: oldHost, toOwnerId: newHost, chatId });

    expect(repoint).toEqual([]);
    expect(await db.select().from(regexScripts).where(eq(regexScripts.ownerId, newHost))).toHaveLength(0);
    expect((await db.select().from(chatRegexScripts).where(eq(chatRegexScripts.chatId, chatId)))[0]?.regexScriptId).toBe(foreign);
  });

  test("a content-equal row the RECIPIENT already owns is re-used, so a retried accept mints nothing new", async () => {
    const db = await freshDb();
    const oldHost = await seedUser(db, { id: "user_old", handle: castId<Handle>("old") });
    const newHost = await seedUser(db, { id: "user_new", handle: castId<Handle>("new") });
    const chatId = await seedChat(db);
    const source = await seedScript(db, { id: "regex_script_src", ownerId: oldHost, name: "Strip tags", behavior: behavior({ findRegex: "<[^>]+>" }) });
    const mine = await seedScript(db, { id: "regex_script_mine", ownerId: newHost, name: "Strip tags", behavior: behavior({ findRegex: "<[^>]+>" }) });
    await db.insert(chatRegexScripts).values({ chatId, regexScriptId: source, position: 2, createdAt: 1 });

    const repoint = await copier(db)({ fromOwnerId: oldHost, toOwnerId: newHost, chatId });
    await db.batch(batchMany([...repoint]));

    // No second row in the recipient's library — the one dedup rule (name + canonical body) found theirs.
    expect((await db.select().from(regexScripts).where(eq(regexScripts.ownerId, newHost))).map((r) => r.id)).toEqual([mine]);
    expect((await db.select().from(chatRegexScripts).where(eq(chatRegexScripts.chatId, chatId)))[0]?.regexScriptId).toBe(mine);

    // The retry: the source is gone from the room, so there is nothing left to copy and nothing to re-run.
    expect(await copier(db)({ fromOwnerId: oldHost, toOwnerId: newHost, chatId })).toEqual([]);
    expect(await db.select().from(regexScripts).where(eq(regexScripts.ownerId, newHost))).toHaveLength(1);
  });

  test("a crash BEFORE the re-point converges on the same copy when the accept is retried", async () => {
    const db = await freshDb();
    const oldHost = await seedUser(db, { id: "user_old", handle: castId<Handle>("old") });
    const newHost = await seedUser(db, { id: "user_new", handle: castId<Handle>("new") });
    const chatId = await seedChat(db);
    const source = await seedScript(db, { id: "regex_script_src", ownerId: oldHost, name: "Strip tags" });
    await db.insert(chatRegexScripts).values({ chatId, regexScriptId: source, position: 0, createdAt: 1 });

    // First pass: the mints land, the swap batch never runs (the crash window).
    await copier(db)({ fromOwnerId: oldHost, toOwnerId: newHost, chatId });
    expect(await db.select().from(regexScripts).where(eq(regexScripts.ownerId, newHost))).toHaveLength(1);

    // The retry finds its own copy by content instead of minting a second library row.
    const repoint = await copier(db)({ fromOwnerId: oldHost, toOwnerId: newHost, chatId });
    await db.batch(batchMany([...repoint]));

    const mine = await db.select().from(regexScripts).where(eq(regexScripts.ownerId, newHost));
    expect(mine).toHaveLength(1);
    expect((await db.select().from(chatRegexScripts).where(eq(chatRegexScripts.chatId, chatId)))[0]?.regexScriptId).toBe(mine[0]?.id);
  });

  test("a self-transfer copies nothing — the room's own scripts are never forked", async () => {
    const db = await freshDb();
    const host = await seedUser(db, { id: "user_host", handle: castId<Handle>("host") });
    const chatId = await seedChat(db);
    const scriptId = await seedScript(db, { ownerId: host, name: "Mine" });
    await db.insert(chatRegexScripts).values({ chatId, regexScriptId: scriptId, position: 0, createdAt: 1 });

    expect(await copier(db)({ fromOwnerId: host, toOwnerId: host, chatId })).toEqual([]);
    expect(await db.select().from(regexScripts).where(eq(regexScripts.ownerId, host))).toHaveLength(1);
  });

  test("after the move the SITTING host can switch the room's script off — the lever the handoff used to strand", async () => {
    const db = await freshDb();
    const oldHost = await seedUser(db, { id: "user_old", handle: castId<Handle>("old") });
    const newHost = await seedUser(db, { id: "user_new", handle: castId<Handle>("new") });
    const chatId = await seedChat(db);
    const source = await seedScript(db, { id: "regex_script_src", ownerId: oldHost, name: "Strip tags" });
    await db.insert(chatRegexScripts).values({ chatId, regexScriptId: source, position: 0, createdAt: 1 });
    const svc = createRegexService(makeHarness(db, { requireChatHost: allowChat, requireChatMember: allowChat }).ctx);

    // BEFORE: the row is the departed host's, so the incoming host's owner-gated lever cannot see it.
    await expect(svc.updateScript({ principal: principal(newHost), scriptId: source, input: { enabled: false } })).rejects.toThrow(/not found/i);

    const repoint = await copier(db)({ fromOwnerId: oldHost, toOwnerId: newHost, chatId });
    await db.batch(batchMany([...repoint]));

    // AFTER: the room runs a row the sitting host owns, so the switch is theirs.
    const attachedId = (await db.select().from(chatRegexScripts).where(eq(chatRegexScripts.chatId, chatId)))[0]?.regexScriptId ?? source;
    await svc.updateScript({ principal: principal(newHost), scriptId: attachedId, input: { enabled: false } });
    expect(
      (
        await db
          .select()
          .from(regexScripts)
          .where(and(eq(regexScripts.id, attachedId), eq(regexScripts.ownerId, newHost)))
      )[0]?.enabled,
    ).toBe(false);
    // …and the departed host's original is untouched: their library is still theirs.
    expect((await db.select().from(regexScripts).where(eq(regexScripts.id, source)))[0]?.enabled).toBe(true);
  });
});
