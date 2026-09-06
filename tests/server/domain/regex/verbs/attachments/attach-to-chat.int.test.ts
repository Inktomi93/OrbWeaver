// verb: attachToChat — attach an owned script to a ROOM. HOST authority through the INJECTED chat guard
// (D18 — the room has no ownerId), and the SCRIPT side is still ownership-gated, so a host can never
// launder a foreign script into a room they run.
//
// The CASCADE this junction takes part in is pinned in `remove.int.test.ts`'s sibling, `scopes.int.test.ts`.

import { chatRegexScripts } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRegexService, RegexNotFoundError } from "@orb/server/domain/regex";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { allowChat, makeHarness, principal, seedChat, seedScript, seedUser } from "../../_support.ts";

describe("attachToChat", () => {
  test("a non-host is refused by the injected guard and NOTHING is written", async () => {
    const db = await freshDb();
    const refuse = (): Promise<void> => Promise.reject(new Error("not the host"));
    const h = makeHarness(db, { requireChatHost: refuse });
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const chatId = await seedChat(db);
    const scriptId = await seedScript(db, { ownerId: owner, name: "room" });

    await expect(svc.attachToChat({ principal: principal(owner), chatId, scriptId })).rejects.toThrow("not the host");
    expect(await db.select().from(chatRegexScripts)).toHaveLength(0);
  });

  test("the host attaches an OWNED script; a foreign script is still refused", async () => {
    const db = await freshDb();
    const h = makeHarness(db, { requireChatHost: allowChat, requireChatMember: allowChat });
    const svc = createRegexService(h.ctx);
    const host = await seedUser(db, { handle: castId<Handle>("host") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const chatId = await seedChat(db);
    const mine = await seedScript(db, { ownerId: host, id: "regex_script_mine", name: "mine" });
    const theirs = await seedScript(db, { ownerId: stranger, id: "regex_script_theirs", name: "theirs" });

    await svc.attachToChat({ principal: principal(host), chatId, scriptId: mine });
    expect(await db.select().from(chatRegexScripts)).toHaveLength(1);

    // Host authority over the ROOM is not authority over someone else's LIBRARY.
    await expect(svc.attachToChat({ principal: principal(host), chatId, scriptId: theirs })).rejects.toBeInstanceOf(RegexNotFoundError);
    expect(await db.select().from(chatRegexScripts)).toHaveLength(1);
  });

  // #1733 — THE MEMBER-FRESHNESS BUG. `regexChanged` is a per-USER channel, so before this the host's own
  // devices repainted and every OTHER member of the room sat on the pre-attach rack until they reloaded.
  // The room plane is a second, room-addressed announcement; both must fire, and the ROOM one is the one a
  // co-member is listening on.
  test("announces the ROOM as well as the owner — a co-member's rack is what goes stale otherwise", async () => {
    const db = await freshDb();
    const h = makeHarness(db, { requireChatHost: allowChat, requireChatMember: allowChat });
    const svc = createRegexService(h.ctx);
    const host = await seedUser(db, { handle: castId<Handle>("host") });
    const chatId = await seedChat(db);
    const scriptId = await seedScript(db, { ownerId: host, name: "strip ooc" });

    await svc.attachToChat({ principal: principal(host), chatId, scriptId });

    expect(h.userEvents.map((e) => e.event.type)).toEqual(["regexChanged"]);
    expect(h.roomFans).toEqual([{ kind: "room", id: chatId }]);
  });

  // A re-attach of the row already there is a no-op INSERT (`onConflictDoNothing`) — but it still announces,
  // and deliberately so: the host's own devices and the room agree on the same state either way, and a
  // second fan costs a no-listener publish. The pin exists so the announcement can never be made
  // CONDITIONAL on the rowcount here without someone re-deciding it (contrast the detach, whose no-op arm
  // announces nothing because the verb already returns `{detached:false}` and has a guard to hang it on).
  test("a duplicate attach still announces the room (the insert is idempotent, the fan is unconditional)", async () => {
    const db = await freshDb();
    const h = makeHarness(db, { requireChatHost: allowChat, requireChatMember: allowChat });
    const svc = createRegexService(h.ctx);
    const host = await seedUser(db, { handle: castId<Handle>("host") });
    const chatId = await seedChat(db);
    const scriptId = await seedScript(db, { ownerId: host, name: "strip ooc" });

    await svc.attachToChat({ principal: principal(host), chatId, scriptId });
    await svc.attachToChat({ principal: principal(host), chatId, scriptId });

    expect(await db.select().from(chatRegexScripts)).toHaveLength(1);
    expect(h.roomFans).toEqual([
      { kind: "room", id: chatId },
      { kind: "room", id: chatId },
    ]);
  });
});
