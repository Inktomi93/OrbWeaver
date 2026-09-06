// verb: removeScript — delete an owned row. The CASCADE it triggers is pinned in the attachments suite;
// here the pins are the gate (a foreign delete is refused and leaves the row) and the emit.

import type { LiveOnlyChatBusEvent } from "@orb/contracts/chat";
import { regexScripts } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRegexService, RegexNotFoundError } from "@orb/server/domain/regex";
import { createDeleteReachCapture } from "@orb/server/entry/compose";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { allowChat, makeHarness, principal, seedChat, seedScript, seedUser } from "../../_support.ts";

describe("removeScript", () => {
  test("deletes the caller's row and emits regexChanged", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const scriptId = await seedScript(db, { ownerId: owner, name: "doomed" });

    expect(await svc.removeScript({ principal: principal(owner), scriptId })).toEqual({ deleted: true });
    expect(await db.select().from(regexScripts).where(eq(regexScripts.id, scriptId))).toHaveLength(0);
    expect(h.userEvents).toEqual([{ userId: owner, event: { type: "regexChanged", scriptId } }]);
  });

  // #1746 — the ROOM plane. The delete CASCADEs `chat_regex_scripts`, so the reach MUST be captured BEFORE the
  // write: with a post-write reach every OTHER member of the room keeps reading a rack that still lists the
  // gone script until they reload. Wired with the REAL composed capture over a live spy (the world-info
  // book-delete precedent), and the member-visible read is asserted beside the fan.
  test("deleting a ROOM-attached script fans roomEntityChanged to that room, once", async () => {
    const db = await freshDb();
    const captured: LiveOnlyChatBusEvent[] = [];
    const capture = createDeleteReachCapture(db, (event) => captured.push(event));
    const h = makeHarness(db, { requireChatHost: allowChat, requireChatMember: allowChat, captureRoomReachForDelete: capture.regex });
    const svc = createRegexService(h.ctx);
    const host = await seedUser(db, { handle: castId<Handle>("host") });
    const member = await seedUser(db, { handle: castId<Handle>("member") });
    const chatId = await seedChat(db);
    const scriptId = await seedScript(db, { ownerId: host, name: "room quirk" });
    await svc.attachToChat({ principal: principal(host), chatId, scriptId });
    expect((await svc.listForChat({ principal: principal(member), chatId })).map((r) => r.name)).toEqual(["room quirk"]);

    await svc.removeScript({ principal: principal(host), scriptId });

    // The member's room-public rack really moved — the fan below is what tells their device to re-read it.
    expect(await svc.listForChat({ principal: principal(member), chatId })).toEqual([]);
    expect(captured.filter((e) => e.type === "roomEntityChanged" && e.entity === "regex").map((e) => e.chatId)).toEqual([chatId]);
    expect(captured).toHaveLength(1);
  });

  test("a script attached to NO room deletes with zero room fans", async () => {
    const db = await freshDb();
    const captured: LiveOnlyChatBusEvent[] = [];
    const capture = createDeleteReachCapture(db, (event) => captured.push(event));
    const h = makeHarness(db, { captureRoomReachForDelete: capture.regex });
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const scriptId = await seedScript(db, { ownerId: owner, name: "library only" });

    await svc.removeScript({ principal: principal(owner), scriptId });

    expect(captured).toEqual([]);
  });

  test("a foreign (NotFound) delete fans NO room event — the capture sits past the ownership guard", async () => {
    const db = await freshDb();
    const captured: LiveOnlyChatBusEvent[] = [];
    const capture = createDeleteReachCapture(db, (event) => captured.push(event));
    const h = makeHarness(db, { requireChatHost: allowChat, captureRoomReachForDelete: capture.regex });
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const chatId = await seedChat(db);
    const scriptId = await seedScript(db, { ownerId: owner, name: "mine" });
    await svc.attachToChat({ principal: principal(owner), chatId, scriptId });

    await expect(svc.removeScript({ principal: principal(stranger), scriptId })).rejects.toBeInstanceOf(RegexNotFoundError);

    expect(captured).toEqual([]);
  });

  test("a foreign delete is refused and the row survives", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const scriptId = await seedScript(db, { ownerId: owner, name: "mine" });

    await expect(svc.removeScript({ principal: principal(stranger), scriptId })).rejects.toBeInstanceOf(RegexNotFoundError);
    expect(await db.select().from(regexScripts).where(eq(regexScripts.id, scriptId))).toHaveLength(1);
  });
});
