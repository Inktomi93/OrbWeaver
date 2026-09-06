// verb: bulkRemoveScripts — delete many owned scripts in one statement (REGX2).
//
// The property that matters most is the one the FK model exists for: the CASCADE clears every junction row
// for each deleted script, so a bulk delete can never leave a dangling attachment. The other is the
// deliberate divergence from the single `removeScript`, which THROWS on a foreign/absent id: a bulk gesture
// over a visible list is routinely raced by another device, and aborting the whole batch because one row
// vanished would be worse than the honest count.

import type { LiveOnlyChatBusEvent } from "@orb/contracts/chat";
import { characterRegexScripts, globalRegexScripts, regexScripts } from "@orb/db";
import type { ChatId, Handle, RegexScriptId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRegexService } from "@orb/server/domain/regex";
import { createDeleteReachCapture } from "@orb/server/entry/compose";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { allowChat, makeHarness, principal, seedCharacter, seedChat, seedScript, seedUser } from "../../_support.ts";

/** The rooms a spy heard about, as a SET — the fan promises no order (each case that cares also asserts the
 *  raw length, which is what catches a room fanned once PER SCRIPT instead of once per gesture). */
function roomsFanned(captured: readonly LiveOnlyChatBusEvent[]): Set<ChatId> {
  return new Set(captured.filter((e) => e.type === "roomEntityChanged" && e.entity === "regex").map((e) => e.chatId));
}

describe("bulkRemoveScripts", () => {
  test("deletes the owned rows and CASCADES every junction they were attached through", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const characterId = await seedCharacter(db, owner);
    const a = await seedScript(db, { ownerId: owner, id: "regex_script_a", name: "a" });
    const b = await seedScript(db, { ownerId: owner, id: "regex_script_b", name: "b" });
    await svc.attachGlobal({ principal: principal(owner), scriptId: a });
    await svc.attachToCharacter({ principal: principal(owner), characterId, scriptId: b });

    const result = await svc.bulkRemoveScripts({ principal: principal(owner), scriptIds: [a, b] });

    expect(result).toEqual({ affected: 2 });
    expect(await db.select().from(regexScripts)).toHaveLength(0);
    expect(await db.select().from(globalRegexScripts)).toHaveLength(0);
    expect(await db.select().from(characterRegexScripts)).toHaveLength(0);
  });

  test("a FOREIGN script survives, and the count reports only what was really deleted", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const mine = await seedScript(db, { ownerId: owner, id: "regex_script_mine", name: "mine" });
    const theirs = await seedScript(db, { ownerId: stranger, id: "regex_script_theirs", name: "theirs" });

    const result = await svc.bulkRemoveScripts({ principal: principal(owner), scriptIds: [mine, theirs] });

    expect(result).toEqual({ affected: 1 });
    expect((await db.select().from(regexScripts)).map((r) => r.id)).toEqual([theirs]);
  });

  // #1746 — the ROOM plane over a LIST. Two properties in one case: the reach is captured PRE-write (the
  // CASCADE would leave a post-write reach at ∅), and a room that attached BOTH deleted scripts hears ONCE —
  // the payload is id-free, so a second event for the same room is a second refetch of a read the first
  // already invalidated.
  test("deleting two room-attached scripts fans each reached room exactly once", async () => {
    const db = await freshDb();
    const captured: LiveOnlyChatBusEvent[] = [];
    const capture = createDeleteReachCapture(db, (event) => captured.push(event));
    const h = makeHarness(db, { requireChatHost: allowChat, requireChatMember: allowChat, captureRoomReachForDelete: capture.regex });
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const a = await seedScript(db, { ownerId: owner, id: "regex_script_a", name: "a" });
    const b = await seedScript(db, { ownerId: owner, id: "regex_script_b", name: "b" });
    const both = await seedChat(db, "both");
    const onlyB = await seedChat(db, "onlyb");
    const untouched = await seedChat(db, "untouched");
    const survivor = await seedScript(db, { ownerId: owner, id: "regex_script_keep", name: "keep" });
    await svc.attachToChat({ principal: principal(owner), chatId: both, scriptId: a });
    await svc.attachToChat({ principal: principal(owner), chatId: both, scriptId: b });
    await svc.attachToChat({ principal: principal(owner), chatId: onlyB, scriptId: b });
    await svc.attachToChat({ principal: principal(owner), chatId: untouched, scriptId: survivor });

    await svc.bulkRemoveScripts({ principal: principal(owner), scriptIds: [a, b] });

    expect(roomsFanned(captured)).toEqual(new Set([both, onlyB]));
    expect(captured).toHaveLength(2);
    // The member-visible read moved in both rooms, and not in the third.
    expect(await svc.listForChat({ principal: principal(owner), chatId: both })).toEqual([]);
    expect(await svc.listForChat({ principal: principal(owner), chatId: onlyB })).toEqual([]);
    expect((await svc.listForChat({ principal: principal(owner), chatId: untouched })).map((r) => r.name)).toEqual(["keep"]);
  });

  // The confirmed-set filter: this verb has no pre-read to gate on, so the capture snapshots every id the
  // caller NAMED — including a stranger's. Fanning that room would let any user nudge a room they cannot see.
  test("a FOREIGN id in the list never fans the stranger's room", async () => {
    const db = await freshDb();
    const captured: LiveOnlyChatBusEvent[] = [];
    const capture = createDeleteReachCapture(db, (event) => captured.push(event));
    const h = makeHarness(db, { requireChatHost: allowChat, captureRoomReachForDelete: capture.regex });
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const mine = await seedScript(db, { ownerId: owner, id: "regex_script_mine", name: "mine" });
    const theirs = await seedScript(db, { ownerId: stranger, id: "regex_script_theirs", name: "theirs" });
    const myRoom = await seedChat(db, "mine");
    const theirRoom = await seedChat(db, "theirs");
    await svc.attachToChat({ principal: principal(owner), chatId: myRoom, scriptId: mine });
    await svc.attachToChat({ principal: principal(stranger), chatId: theirRoom, scriptId: theirs });

    await svc.bulkRemoveScripts({ principal: principal(owner), scriptIds: [mine, theirs] });

    expect(roomsFanned(captured)).toEqual(new Set([myRoom]));
    expect(captured).toHaveLength(1);
  });

  // The divergence from the single verb, stated as a test so nobody "fixes" it into a throw later.
  test("an id that is already gone does NOT abort the batch", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const mine = await seedScript(db, { ownerId: owner, id: "regex_script_mine", name: "mine" });

    const result = await svc.bulkRemoveScripts({
      principal: principal(owner),
      scriptIds: [castId<RegexScriptId>("regex_script_vanished"), mine],
    });

    expect(result).toEqual({ affected: 1 });
    expect(await db.select().from(regexScripts)).toHaveLength(0);
    expect(h.audits).toHaveLength(1);
    expect(h.userEvents).toHaveLength(1);
  });
});
