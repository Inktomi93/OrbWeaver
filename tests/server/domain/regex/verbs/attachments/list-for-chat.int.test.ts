// verb: listForChat — the room's attached scripts. MEMBER-readable and deliberately NOT owner-filtered: a
// room's attachments are what every member's turns assemble against, so a member sees the host's set
// (the `listChatBooks` ruling, D18/D64). A non-member is refused by the injected guard.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRegexService } from "@orb/server/domain/regex";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { allowChat, makeHarness, principal, seedChat, seedScript, seedUser } from "../../_support.ts";

describe("listForChat", () => {
  test("a MEMBER reads the room's set even though the scripts are the HOST's property", async () => {
    const db = await freshDb();
    const h = makeHarness(db, { requireChatHost: allowChat, requireChatMember: allowChat });
    const svc = createRegexService(h.ctx);
    const host = await seedUser(db, { handle: castId<Handle>("host") });
    const member = await seedUser(db, { handle: castId<Handle>("member") });
    const chatId = await seedChat(db);
    const scriptId = await seedScript(db, { ownerId: host, name: "room quirk" });
    await svc.attachToChat({ principal: principal(host), chatId, scriptId });

    expect((await svc.listForChat({ principal: principal(member), chatId })).map((r) => r.name)).toEqual(["room quirk"]);
  });

  test("a NON-member is refused by the injected membership guard", async () => {
    const db = await freshDb();
    const refuse = (): Promise<void> => Promise.reject(new Error("not a member"));
    const h = makeHarness(db, { requireChatMember: refuse });
    const outsider = await seedUser(db, { handle: castId<Handle>("outsider") });
    const chatId = await seedChat(db);

    await expect(createRegexService(h.ctx).listForChat({ principal: principal(outsider), chatId })).rejects.toThrow("not a member");
  });
});
