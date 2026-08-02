// verb: detachFromChat — remove a room attachment. HOST authority (the injected guard); idempotent.

import { createRegexService } from "@orb/server/domain/regex";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { allowChat, makeHarness, principal, seedChat, seedScript, seedUser } from "../../_support.ts";

describe("detachFromChat", () => {
  test("the host detaches once, then reports the no-op", async () => {
    const db = await freshDb();
    const h = makeHarness(db, { requireChatHost: allowChat, requireChatMember: allowChat });
    const svc = createRegexService(h.ctx);
    const host = await seedUser(db, { handle: "host" });
    const chatId = await seedChat(db);
    const scriptId = await seedScript(db, { ownerId: host, name: "room" });
    await svc.attachToChat({ principal: principal(host), chatId, scriptId });

    expect(await svc.detachFromChat({ principal: principal(host), chatId, scriptId })).toEqual({ detached: true });
    expect(await svc.detachFromChat({ principal: principal(host), chatId, scriptId })).toEqual({ detached: false });
  });

  test("a non-host is refused and the attachment survives", async () => {
    const db = await freshDb();
    const host = await seedUser(db, { handle: "host" });
    const chatId = await seedChat(db);
    const scriptId = await seedScript(db, { ownerId: host, name: "room" });
    const asHost = createRegexService(makeHarness(db, { requireChatHost: allowChat, requireChatMember: allowChat }).ctx);
    await asHost.attachToChat({ principal: principal(host), chatId, scriptId });

    const refuse = (): Promise<void> => Promise.reject(new Error("not the host"));
    const asMember = createRegexService(makeHarness(db, { requireChatHost: refuse, requireChatMember: allowChat }).ctx);
    await expect(asMember.detachFromChat({ principal: principal(host), chatId, scriptId })).rejects.toThrow("not the host");
    expect((await asHost.listForChat({ principal: principal(host), chatId })).map((r) => r.name)).toEqual(["room"]);
  });
});
