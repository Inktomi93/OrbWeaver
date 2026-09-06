// verb: applyScopeOrder — rewrite ONE scope's EXECUTION order. Position 0 runs first: the resolver hands
// `executeRegexScripts` its list in `position` order and the executor applies it in order, so this verb is
// how a user says "strip the tags BEFORE the rename runs".
//
// Load-bearing: an omitted attachment KEEPS its slot; the chat arm is HOST-gated and the character/preset
// arms gate on scope ownership, dropping foreign/stale ids that match no owned-scope junction row. The GLOBAL
// arm is different — its tier has no scope row, so it PRE-GATES ownership of every id and a foreign/absent id
// is RegexNotFoundError, never a silent cross-tenant reorder (#708).

import { globalRegexScripts } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRegexService, RegexNotFoundError } from "@orb/server/domain/regex";
import { asc } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures.ts";
import { allowChat, makeHarness, principal, seedCharacter, seedChat, seedScript, seedUser } from "../../_support.ts";

describe("applyScopeOrder", () => {
  test("reverses a character scope's order; a stale id is silently dropped", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
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
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const a = await seedScript(db, { ownerId: owner, id: "regex_script_a", name: "a" });
    const b = await seedScript(db, { ownerId: owner, id: "regex_script_b", name: "b" });
    await svc.attachGlobal({ principal: principal(owner), scriptId: a });
    await svc.attachGlobal({ principal: principal(owner), scriptId: b });

    await svc.applyScopeOrder({ principal: principal(owner), scope: { kind: "global" }, orderedScriptIds: [b, a] });

    expect((await svc.listGlobal({ principal: principal(owner) })).map((r) => r.name)).toEqual(["b", "a"]);
  });

  // #708 (HIGH IDOR) — the global tier has NO owner column (its scope IS the script's), so a bare
  // `WHERE regexScriptId = id` position write would touch ANY owner's row. A stranger who names owner A's
  // globally-attached script ids must be REFUSED (RegexNotFoundError) BEFORE any write — never a silent
  // cross-tenant reorder. Owner A attaches two scripts in a known order; owner B attempts a REVERSAL of A's
  // ids. Teeth: (1) the call must throw RegexNotFoundError, (2) A's `global_regex_scripts.position` rows are
  // byte-for-byte unchanged (RED on the unfixed source: the reversal lands, no throw).
  test("a stranger cannot REORDER owner A's global tier (#708)", async () => {
    const db = await freshDb();
    const svc = createRegexService(makeHarness(db).ctx);
    const ownerA = await seedUser(db, { handle: castId<Handle>("ownerA") });
    const ownerB = await seedUser(db, { id: "user_ownerB", handle: castId<Handle>("ownerB") });
    const a1 = await seedScript(db, { ownerId: ownerA, id: "regex_script_a1", name: "a1" });
    const a2 = await seedScript(db, { ownerId: ownerA, id: "regex_script_a2", name: "a2" });
    await svc.attachGlobal({ principal: principal(ownerA), scriptId: a1 }); // position 0
    await svc.attachGlobal({ principal: principal(ownerA), scriptId: a2 }); // position 1

    const positions = async (): Promise<{ id: string; position: number }[]> =>
      db
        .select({ id: globalRegexScripts.regexScriptId, position: globalRegexScripts.position })
        .from(globalRegexScripts)
        .orderBy(asc(globalRegexScripts.position));
    const before = await positions();
    expect(before).toEqual([
      { id: a1, position: 0 },
      { id: a2, position: 1 },
    ]);

    // (1) B naming A's ids is REFUSED — not silently dropped, not written.
    await expect(svc.applyScopeOrder({ principal: principal(ownerB), scope: { kind: "global" }, orderedScriptIds: [a2, a1] })).rejects.toBeInstanceOf(
      RegexNotFoundError,
    );

    // (2) A's position rows are exactly as seeded — the stranger's reversal never landed.
    expect(await positions()).toEqual(before);
    // …and one absent id in the list is equally refused (no partial write of the owned prefix).
    await expect(
      svc.applyScopeOrder({ principal: principal(ownerB), scope: { kind: "global" }, orderedScriptIds: [castId<typeof a1>("regex_script_absent")] }),
    ).rejects.toBeInstanceOf(RegexNotFoundError);
  });

  // The owner's OWN reorder still passes the ownership pre-gate cleanly — the fix refuses foreign ids, never
  // the owner's legitimate reorder (regression guard for the #708 gate).
  test("owner A's OWN global reorder is unaffected by the ownership pre-gate (#708)", async () => {
    const db = await freshDb();
    const svc = createRegexService(makeHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const a = await seedScript(db, { ownerId: owner, id: "regex_script_a", name: "a" });
    const b = await seedScript(db, { ownerId: owner, id: "regex_script_b", name: "b" });
    await svc.attachGlobal({ principal: principal(owner), scriptId: a });
    await svc.attachGlobal({ principal: principal(owner), scriptId: b });

    const result = await svc.applyScopeOrder({ principal: principal(owner), scope: { kind: "global" }, orderedScriptIds: [b, a] });

    expect(result.reordered).toBe(2);
    expect((await svc.listGlobal({ principal: principal(owner) })).map((r) => r.name)).toEqual(["b", "a"]);
  });

  test("the CHAT scope's order is HOST-gated", async () => {
    const db = await freshDb();
    const refuse = (): Promise<void> => Promise.reject(new Error("not the host"));
    const h = makeHarness(db, { requireChatHost: refuse });
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const chatId = await seedChat(db);

    await expect(
      createRegexService(h.ctx).applyScopeOrder({ principal: principal(owner), scope: { kind: "chat", chatId }, orderedScriptIds: [] }),
    ).rejects.toThrow("not the host");
  });

  test("an empty order is a no-op (nothing reordered, nothing thrown)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    expect(await createRegexService(h.ctx).applyScopeOrder({ principal: principal(owner), scope: { kind: "global" }, orderedScriptIds: [] })).toEqual({
      reordered: 0,
    });
  });

  // #1733 — the CHAT arm only. A room's run order is what every member's turns assemble in, so it announces
  // the room; the other three arms are owner-library state with no member-visible projection of their own
  // (their rooms hear about a row when the ROW changes, through the library fan).
  test("the CHAT arm announces the room; the GLOBAL arm announces no room at all", async () => {
    const db = await freshDb();
    const h = makeHarness(db, { requireChatHost: allowChat, requireChatMember: allowChat });
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const chatId = await seedChat(db);
    const a = await seedScript(db, { ownerId: owner, id: "regex_script_a", name: "a" });
    const b = await seedScript(db, { ownerId: owner, id: "regex_script_b", name: "b" });
    await svc.attachToChat({ principal: principal(owner), chatId, scriptId: a });
    await svc.attachToChat({ principal: principal(owner), chatId, scriptId: b });
    await svc.attachGlobal({ principal: principal(owner), scriptId: a });
    const before = h.roomFans.length;

    await svc.applyScopeOrder({ principal: principal(owner), scope: { kind: "chat", chatId }, orderedScriptIds: [b, a] });
    expect(h.roomFans.slice(before)).toEqual([{ kind: "room", id: chatId }]);

    await svc.applyScopeOrder({ principal: principal(owner), scope: { kind: "global" }, orderedScriptIds: [a] });
    expect(h.roomFans.slice(before)).toEqual([{ kind: "room", id: chatId }]);
  });
});
