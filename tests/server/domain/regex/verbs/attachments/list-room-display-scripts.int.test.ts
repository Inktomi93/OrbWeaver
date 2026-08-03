// verb: listRoomDisplayScripts — the room's BROADCAST display set (D121-E host option, owner ruling
// 2026-08-02). The ONE verb here that is deliberately NOT owner-filtered: the whole point is that a
// non-host member reads the HOST's scripts, and the room's OPT-IN is the gate.
//
// THE FOUR ARMS:
//   • opted OUT (the default) ⇒ `[]` — a member cannot even learn what the host owns.
//   • opted IN ⇒ the host's scripts, narrowed to what would actually fire (enabled ∩ DISPLAY).
//   • hostless room (archived orphan) ⇒ `[]`.
//   • non-member ⇒ refused by the injected membership guard.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRegexService } from "@orb/server/domain/regex";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { allowChat, behavior, makeHarness, principal, seedChat, seedScript, seedUser } from "../../_support.ts";

describe("listRoomDisplayScripts", () => {
  test("opted OUT (the default): returns nothing, so the host's library stays invisible", async () => {
    const db = await freshDb();
    const host = await seedUser(db, { handle: castId<Handle>("host") });
    const member = await seedUser(db, { handle: castId<Handle>("member") });
    const chatId = await seedChat(db);
    await seedScript(db, { ownerId: host, name: "fx", behavior: behavior({ placement: ["DISPLAY"] }) });
    const h = makeHarness(db, {
      requireChatMember: allowChat,
      resolveRoomDisplayPolicy: () => Promise.resolve({ enabled: false, hostUserId: host }),
    });

    expect(await createRegexService(h.ctx).listRoomDisplayScripts({ principal: principal(member), chatId })).toEqual([]);
  });

  test("opted IN: a MEMBER receives the HOST's display scripts", async () => {
    const db = await freshDb();
    const host = await seedUser(db, { handle: castId<Handle>("host") });
    const member = await seedUser(db, { handle: castId<Handle>("member") });
    const chatId = await seedChat(db);
    await seedScript(db, { ownerId: host, name: "fx", behavior: behavior({ placement: ["DISPLAY"] }) });
    const h = makeHarness(db, {
      requireChatMember: allowChat,
      resolveRoomDisplayPolicy: () => Promise.resolve({ enabled: true, hostUserId: host }),
    });

    expect((await createRegexService(h.ctx).listRoomDisplayScripts({ principal: principal(member), chatId })).map((r) => r.name)).toEqual(["fx"]);
  });

  test("opted IN: narrowed to what would FIRE — a disabled or prompt-side script never rides", async () => {
    const db = await freshDb();
    const host = await seedUser(db, { handle: castId<Handle>("host") });
    const member = await seedUser(db, { handle: castId<Handle>("member") });
    const chatId = await seedChat(db);
    await seedScript(db, { ownerId: host, id: "regex_script_on", name: "fires", behavior: behavior({ placement: ["DISPLAY"] }) });
    await seedScript(db, { ownerId: host, id: "regex_script_off", name: "disabled", enabled: false, behavior: behavior({ placement: ["DISPLAY"] }) });
    await seedScript(db, { ownerId: host, id: "regex_script_prompt", name: "prompt-side", behavior: behavior({ placement: ["AI_OUTPUT"] }) });
    const h = makeHarness(db, {
      requireChatMember: allowChat,
      resolveRoomDisplayPolicy: () => Promise.resolve({ enabled: true, hostUserId: host }),
    });

    // Handing over a disabled or prompt-side script would leak the host's library shape for zero render
    // benefit — the narrowing is a privacy property, not an optimization.
    expect((await createRegexService(h.ctx).listRoomDisplayScripts({ principal: principal(member), chatId })).map((r) => r.name)).toEqual(["fires"]);
  });

  test("a HOSTLESS room broadcasts nothing", async () => {
    const db = await freshDb();
    const member = await seedUser(db, { handle: castId<Handle>("member") });
    const chatId = await seedChat(db);
    const h = makeHarness(db, {
      requireChatMember: allowChat,
      resolveRoomDisplayPolicy: () => Promise.resolve({ enabled: true, hostUserId: null }),
    });

    expect(await createRegexService(h.ctx).listRoomDisplayScripts({ principal: principal(member), chatId })).toEqual([]);
  });

  test("a NON-member is refused before the policy is even consulted", async () => {
    const db = await freshDb();
    const outsider = await seedUser(db, { handle: castId<Handle>("outsider") });
    const chatId = await seedChat(db);
    const refuse = (): Promise<void> => Promise.reject(new Error("not a member"));
    // `resolveRoomDisplayPolicy` is the throwing default — reaching it would fail with a different message.
    const h = makeHarness(db, { requireChatMember: refuse });

    await expect(createRegexService(h.ctx).listRoomDisplayScripts({ principal: principal(outsider), chatId })).rejects.toThrow("not a member");
  });
});
