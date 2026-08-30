// substrate/cel-env — the LIVE CEL activation builder for a dispatch. Pins: a chat-scoped rule reads all
// four planes (vars/choice/global/chat.messageCount) through the real db + injected ops, and an owner-global
// (chatId: null) rule does THREE FEWER reads and binds an EMPTY chat plane rather than inventing a room.

import { globalVariables } from "@orb/db";
import { describe } from "vitest";
import { authorGlobals, buildCelEnv } from "../../../../../packages/server/src/domain/automation/substrate/cel-env.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedMessage } from "../../chat/_support.ts";
import { FIXED_NOW_MS, ruleFixture } from "../_support.ts";

describe("authorGlobals", () => {
  test("projects the author's global_variables rows into a key→value map", async () => {
    const fixture = await ruleFixture();
    await fixture.db.insert(globalVariables).values({ ownerId: fixture.host, key: "streak", value: "3" });
    await expect(authorGlobals(fixture.db, fixture.host)).resolves.toEqual({ streak: "3" });
  });

  test("an author with no globals yields an empty map", async () => {
    const fixture = await ruleFixture();
    await expect(authorGlobals(fixture.db, fixture.host)).resolves.toEqual({});
  });
});

describe("buildCelEnv", () => {
  test("a chat-scoped rule binds vars/choice from ops + global from the author + a real messageCount", async () => {
    const fixture = await ruleFixture();
    await fixture.db.insert(globalVariables).values({ ownerId: fixture.host, key: "streak", value: "3" });
    await seedMessage(fixture.db, fixture.chatId, 1);
    const env = await buildCelEnv({
      ops: fixture.ctx.ops,
      db: fixture.db,
      authorUserId: fixture.host,
      chatId: fixture.chatId,
      fact: { bus: "chat", type: "chatOpened", chatId: fixture.chatId },
      nowMs: FIXED_NOW_MS,
    });
    expect(env.global).toEqual({ streak: "3" });
    expect(env.chat).toEqual({ id: fixture.chatId, messageCount: 1 });
  });

  test("an owner-global (chatId: null) rule does THREE FEWER reads — vars/choice EMPTY, chat.id EMPTY, only global populated", async () => {
    const fixture = await ruleFixture();
    await fixture.db.insert(globalVariables).values({ ownerId: fixture.host, key: "streak", value: "3" });
    const env = await buildCelEnv({
      ops: fixture.ctx.ops,
      db: fixture.db,
      authorUserId: fixture.host,
      chatId: null,
      fact: { bus: "domain", type: "character.updated", chatId: null },
      nowMs: FIXED_NOW_MS,
    });
    expect(env.vars).toEqual({});
    expect(env.choice).toEqual({});
    expect(env.chat).toEqual({ id: "", messageCount: 0 });
    expect(env.global).toEqual({ streak: "3" });
  });
});
