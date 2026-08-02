// verb: applyScopeOrder — rewrite ONE scope's EXECUTION order. Position 0 runs first: the resolver hands
// `executeRegexScripts` its list in `position` order and the executor applies it in order, so this verb is
// how a user says "strip the tags BEFORE the rename runs".
//
// Load-bearing: stale/foreign ids are DROPPED (they match no row), an omitted attachment KEEPS its slot,
// and the chat arm is HOST-gated while the owner arms gate on ownership.

import { createRegexService } from "@orb/server/domain/regex";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeHarness, principal, seedCharacter, seedChat, seedScript, seedUser } from "../../_support.ts";

describe("applyScopeOrder", () => {
  test("reverses a character scope's order; a stale id is silently dropped", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const characterId = await seedCharacter(db, owner);
    const a = await seedScript(db, { ownerId: owner, id: "regex_script_a", name: "a" });
    const b = await seedScript(db, { ownerId: owner, id: "regex_script_b", name: "b" });
    await svc.attachToCharacter({ principal: principal(owner), characterId, scriptId: a });
    await svc.attachToCharacter({ principal: principal(owner), characterId, scriptId: b });

    const result = await svc.applyScopeOrder({
      principal: principal(owner),
      scope: { kind: "character", characterId },
      orderedScriptIds: [b, "regex_script_gone" as typeof a, a],
    });

    expect(result.reordered).toBe(2);
    expect((await svc.listForCharacter({ principal: principal(owner), characterId })).map((r) => r.name)).toEqual(["b", "a"]);
  });

  test("the GLOBAL scope reorders too (it is an ordered tier, not a set)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const a = await seedScript(db, { ownerId: owner, id: "regex_script_a", name: "a" });
    const b = await seedScript(db, { ownerId: owner, id: "regex_script_b", name: "b" });
    await svc.attachGlobal({ principal: principal(owner), scriptId: a });
    await svc.attachGlobal({ principal: principal(owner), scriptId: b });

    await svc.applyScopeOrder({ principal: principal(owner), scope: { kind: "global" }, orderedScriptIds: [b, a] });

    expect((await svc.listGlobal({ principal: principal(owner) })).map((r) => r.name)).toEqual(["b", "a"]);
  });

  test("the CHAT scope's order is HOST-gated", async () => {
    const db = await freshDb();
    const refuse = (): Promise<void> => Promise.reject(new Error("not the host"));
    const h = makeHarness(db, { requireChatHost: refuse });
    const owner = await seedUser(db, { handle: "owner" });
    const chatId = await seedChat(db);

    await expect(
      createRegexService(h.ctx).applyScopeOrder({ principal: principal(owner), scope: { kind: "chat", chatId }, orderedScriptIds: [] }),
    ).rejects.toThrow("not the host");
  });

  test("an empty order is a no-op (nothing reordered, nothing thrown)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const owner = await seedUser(db, { handle: "owner" });
    expect(await createRegexService(h.ctx).applyScopeOrder({ principal: principal(owner), scope: { kind: "global" }, orderedScriptIds: [] })).toEqual({
      reordered: 0,
    });
  });
});
