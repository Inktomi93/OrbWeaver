// verb: attachToChat — attach an owned script to a ROOM. HOST authority through the INJECTED chat guard
// (D18 — the room has no ownerId), and the SCRIPT side is still ownership-gated, so a host can never
// launder a foreign script into a room they run.
//
// The CASCADE this junction takes part in is pinned in `remove.int.test.ts`'s sibling, `scopes.int.test.ts`.

import { chatRegexScripts } from "@orb/db";
import { createRegexService, RegexNotFoundError } from "@orb/server/domain/regex";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { allowChat, makeHarness, principal, seedChat, seedScript, seedUser } from "../../_support.ts";

describe("attachToChat", () => {
  test("a non-host is refused by the injected guard and NOTHING is written", async () => {
    const db = await freshDb();
    const refuse = (): Promise<void> => Promise.reject(new Error("not the host"));
    const h = makeHarness(db, { requireChatHost: refuse });
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const chatId = await seedChat(db);
    const scriptId = await seedScript(db, { ownerId: owner, name: "room" });

    await expect(svc.attachToChat({ principal: principal(owner), chatId, scriptId })).rejects.toThrow("not the host");
    expect(await db.select().from(chatRegexScripts)).toHaveLength(0);
  });

  test("the host attaches an OWNED script; a foreign script is still refused", async () => {
    const db = await freshDb();
    const h = makeHarness(db, { requireChatHost: allowChat, requireChatMember: allowChat });
    const svc = createRegexService(h.ctx);
    const host = await seedUser(db, { handle: "host" });
    const stranger = await seedUser(db, { handle: "stranger" });
    const chatId = await seedChat(db);
    const mine = await seedScript(db, { ownerId: host, id: "regex_script_mine", name: "mine" });
    const theirs = await seedScript(db, { ownerId: stranger, id: "regex_script_theirs", name: "theirs" });

    await svc.attachToChat({ principal: principal(host), chatId, scriptId: mine });
    expect(await db.select().from(chatRegexScripts)).toHaveLength(1);

    // Host authority over the ROOM is not authority over someone else's LIBRARY.
    await expect(svc.attachToChat({ principal: principal(host), chatId, scriptId: theirs })).rejects.toBeInstanceOf(RegexNotFoundError);
    expect(await db.select().from(chatRegexScripts)).toHaveLength(1);
  });
});
