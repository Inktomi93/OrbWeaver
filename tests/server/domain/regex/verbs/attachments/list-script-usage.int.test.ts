// verb: listScriptUsage — the REVERSE rosters for one owned script (REGROSTER). The forward `listFor*`
// reads answer "what does THIS carrier attach"; this answers "who attaches this script", which is the
// question the library's context pane asks and could not previously ask anyone.
//
// THE LOAD-BEARING PROPERTIES, and why each has its own arm:
//   1. the three rosters carry NAMES + ids, in name order (a roster is scanned by eye, not by position —
//      junction `position` is per-carrier execution order and means nothing across carriers);
//   2. CROSS-OWNER: owning the SCRIPT does not name a foreign carrier. A junction row can point a stranger's
//      preset/character at my script (the attach verbs refuse it, but a junction row is a junction row, and
//      the roster read is not entitled to trust that); the join's own `ownerId` predicate is what drops it.
//   3. a stranger asking about MY script is `RegexNotFoundError` — the `getScript` gate verbatim, so this is
//      not an existence oracle;
//   4. ROOMS go through chat's injected `resolveVisibleRooms` and NOTHING else — the harness default THROWS,
//      so the "no chat attachments ⇒ no cross-domain call" short-circuit is proven by a passing call, and
//      a room the op drops (a kicked ex-member) is proven absent by a stubbed op that drops it.

import { characterRegexScripts, chatRegexScripts, presetRegexScripts } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { createRegexService, RegexNotFoundError } from "@orb/server/domain/regex";
import { describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { allowChat, makeHarness, principal, seedCharacter, seedChat, seedPreset, seedScript, seedUser } from "../../_support.ts";

describe("listScriptUsage", () => {
  test("names every carrier that attaches the script, per scope, in name order", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const scriptId = await seedScript(db, { ownerId: owner, name: "strip ooc" });
    // `seedPreset` names a preset "Preset <key>", so `z` sorts AFTER `a` — the arm would pass on insertion
    // order too if the rows went in alphabetically, so they deliberately do not.
    const presetZ = await seedPreset(db, owner, "z");
    const presetA = await seedPreset(db, owner, "a");
    const character = await seedCharacter(db, owner, "azarael");
    const chatId = await seedChat(db, "room");

    const svc = createRegexService(makeHarness(db, { requireChatHost: allowChat }).ctx);
    await svc.attachToPreset({ principal: principal(owner), presetId: presetZ, scriptId });
    await svc.attachToPreset({ principal: principal(owner), presetId: presetA, scriptId });
    await svc.attachToCharacter({ principal: principal(owner), characterId: character, scriptId });
    await svc.attachToChat({ principal: principal(owner), chatId, scriptId });

    const roomsSeen: ChatId[][] = [];
    const usage = await createRegexService(
      makeHarness(db, {
        resolveVisibleRooms: (_principal, chatIds) => {
          roomsSeen.push([...chatIds]);
          return Promise.resolve([{ id: chatId, name: "The Long Dark" }]);
        },
      }).ctx,
    ).listScriptUsage({ principal: principal(owner), scriptId });

    expect(usage.presets).toEqual([
      { id: presetA, name: "Preset a" },
      { id: presetZ, name: "Preset z" },
    ]);
    expect(usage.characters).toEqual([{ id: character, name: "Char" }]);
    expect(usage.rooms).toEqual([{ id: chatId, name: "The Long Dark" }]);
    // The room CANDIDATES handed to chat are exactly the junction's chat ids — regex resolves no visibility
    // of its own, and it does not hand chat the whole library to filter.
    expect(roomsSeen).toEqual([[chatId]]);
  });

  test("an unattached script reports three empty rosters WITHOUT asking chat anything", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const scriptId = await seedScript(db, { ownerId: owner, name: "lonely" });

    // The harness's `resolveVisibleRooms` default THROWS ("not stubbed"), so this passing at all is the
    // proof that a script attached to no room costs zero cross-domain calls.
    const usage = await createRegexService(makeHarness(db).ctx).listScriptUsage({ principal: principal(owner), scriptId });

    expect(usage).toEqual({ presets: [], characters: [], rooms: [] });
  });

  test("CROSS-OWNER: a stranger's preset/character holding my script is NOT named", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const stranger = await seedUser(db, { handle: "stranger" });
    const scriptId = await seedScript(db, { ownerId: owner, name: "mine" });
    const mine = await seedPreset(db, owner, "mine");
    const theirs = await seedPreset(db, stranger, "theirs");
    const theirCharacter = await seedCharacter(db, stranger, "theirs");

    // Straight junction rows: the attach VERBS would refuse these, and the roster read must not depend on
    // that — the owner predicate is on the join, not on the writer's manners.
    await db.insert(presetRegexScripts).values([
      { presetId: mine, regexScriptId: scriptId, position: 0 },
      { presetId: theirs, regexScriptId: scriptId, position: 0 },
    ]);
    await db.insert(characterRegexScripts).values({ characterId: theirCharacter, regexScriptId: scriptId, position: 0 });

    const usage = await createRegexService(makeHarness(db).ctx).listScriptUsage({ principal: principal(owner), scriptId });

    expect(usage.presets).toEqual([{ id: mine, name: "Preset mine" }]);
    expect(usage.characters).toEqual([]);
  });

  test("CROSS-OWNER: a stranger asking about my script is refused, not answered with an empty roster", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const stranger = await seedUser(db, { handle: "stranger" });
    const scriptId = await seedScript(db, { ownerId: owner, name: "mine" });

    await expect(createRegexService(makeHarness(db).ctx).listScriptUsage({ principal: principal(stranger), scriptId })).rejects.toBeInstanceOf(
      RegexNotFoundError,
    );
  });

  test("a room the caller can no longer SEE is dropped, even though the attachment row survives", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: "owner" });
    const scriptId = await seedScript(db, { ownerId: owner, name: "mine" });
    const stillIn = await seedChat(db, "still_in");
    const kickedFrom = await seedChat(db, "kicked_from");
    await db.insert(chatRegexScripts).values([
      { chatId: stillIn, regexScriptId: scriptId, position: 0 },
      { chatId: kickedFrom, regexScriptId: scriptId, position: 0 },
    ]);

    // Chat's answer is the ONLY room authority: it returns the one room the caller is still present in.
    const usage = await createRegexService(
      makeHarness(db, { resolveVisibleRooms: () => Promise.resolve([{ id: stillIn, name: "Still here" }]) }).ctx,
    ).listScriptUsage({ principal: principal(owner), scriptId });

    expect(usage.rooms).toEqual([{ id: stillIn, name: "Still here" }]);
  });
});
